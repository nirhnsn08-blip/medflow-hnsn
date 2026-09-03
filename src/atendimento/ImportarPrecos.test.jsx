// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// IMPORTAR TABELA DE PREÇO — a tela, não as regras
//
// As regras estão testadas em `importar-precos.test.js`. O que ESTE arquivo
// prova é o encadeamento, que é onde a tela pode mentir mesmo com as regras
// certas:
//
//   · CONFERIR não grava (o botão de gravar só nasce depois do plano)
//   · o motivo de cada recusa CHEGA à tela — regra certa escondida numa
//     variável que ninguém renderiza não protege ninguém
//   · GRAVAR manda UMA requisição com todas as linhas, não uma por linha
//   · a falha diz que NADA entrou, que é o que decide se pode recolar
//
// ⚠️ `telas.test.jsx` já monta este componente, mas só monta: prova que não
// explode, não que faz. Toda a sequência abaixo passaria por ele intacta.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import ImportarPrecos from "./ImportarPrecos.jsx";
import * as dados from "./dados.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const CONVENIOS = [{ id: 7, nome: "Unimed" }, { id: 9, nome: "Bradesco Saúde" }];

const TABELA = [
  "Código\tDescrição\tValor",
  "10101012\tConsulta em consultório\t120,00",
  "40304361\tHemograma completo\t18,50",
  "40304361\tHemograma repetido\t19,00",     // repetido no próprio lote
  "\tSem código nenhum\t50,00",
].join("\n");

function abrir(extra = {}) {
  const props = { sb: async () => [], currentUser: { name: "Teste" }, precos: [], convenios: CONVENIOS, ...extra };
  const r = render(<ImportarPrecos {...props} />);
  return { ...r, props };
}

function preencher({ convenio = "7", inicio = "2026-09-01", texto = TABELA } = {}) {
  const selects = document.querySelectorAll("select");
  fireEvent.change(selects[0], { target: { value: convenio } });
  const datas = document.querySelectorAll('input[type="date"]');
  fireEvent.change(datas[0], { target: { value: inicio } });
  fireEvent.change(document.querySelector("textarea"), { target: { value: texto } });
}

const botao = nome => [...document.querySelectorAll("button")].find(b => new RegExp(nome, "i").test(b.textContent));

describe("🔴 conferir vem antes de gravar", () => {
  it("sem conferir, não existe botão de gravar", () => {
    abrir();
    preencher();
    expect(botao("^Gravar")).toBeUndefined();
  });

  it("conferir NÃO chama o banco", async () => {
    const espia = vi.spyOn(dados, "salvarPrecosEmLote");
    abrir();
    preencher();
    fireEvent.click(botao("Conferir"));
    await waitFor(() => expect(botao("^Gravar")).toBeDefined());
    expect(espia).not.toHaveBeenCalled();
  });

  it("mexer no texto depois de conferir derruba o plano", async () => {
    // O plano descreve um texto. Se o texto mudou, o plano descreve outra
    // coisa — e gravar por ele gravaria o que ninguém conferiu.
    abrir();
    preencher();
    fireEvent.click(botao("Conferir"));
    await waitFor(() => expect(botao("^Gravar")).toBeDefined());
    fireEvent.change(document.querySelector("textarea"), { target: { value: "Código\tValor\nX\t1,00" } });
    expect(botao("^Gravar")).toBeUndefined();
  });
});

describe("🔴 o motivo de cada recusa chega à tela", () => {
  it("mostra a conta: quantas entram, quantas não", async () => {
    abrir();
    preencher();
    fireEvent.click(botao("Conferir"));
    const linha = await screen.findByText(/de 4 lidas/);
    // ⚠️ Cada número junto do que ele conta. Procurar só por "2" casaria
    // duas vezes (entram e recusadas), e um seletor que casa os dois não
    // prova nenhum dos dois.
    const texto = linha.parentElement.textContent;
    expect(texto).toContain("2 entram");
    expect(texto).toContain("2 recusadas");
    expect(texto).toContain("de 4 lidas");
  });

  it("o código repetido aparece com o número da linha anterior", async () => {
    abrir();
    preencher();
    fireEvent.click(botao("Conferir"));
    expect(await screen.findByText(/repetido.*linha 3/i)).toBeTruthy();
  });

  it("a linha sem código aparece com o próprio motivo", async () => {
    abrir();
    preencher();
    fireEvent.click(botao("Conferir"));
    // getAllBy: a célula casa e a linha da tabela também.
    const achados = await screen.findAllByText(/Sem código: o preço não encontra/);
    expect(achados.length).toBeGreaterThan(0);
  });

  it("🔴 o aviso de valor ambíguo é destacado, não só uma linha na tabela", async () => {
    // É o erro que entra plausível e sai mil vezes maior. Ele precisa
    // aparecer ANTES da lista, não misturado com as outras recusas.
    abrir();
    preencher({ texto: "Código\tValor\nA\t1.234\nB\t5.678" });
    fireEvent.click(botao("Conferir"));
    const aviso = await screen.findByText(/não dá para ler com certeza/i);
    expect(aviso.getAttribute("role") || aviso.closest("[role=alert]")).toBeTruthy();
  });

  it("sem convênio, o plano recusa a análise inteira e diz por quê", async () => {
    abrir();
    preencher({ convenio: "" });
    fireEvent.click(botao("Conferir"));
    expect(await screen.findByText(/preço é sempre de alguém/i)).toBeTruthy();
    expect(botao("^Gravar")).toBeUndefined();
  });
});

describe("🔴 gravar manda tudo de uma vez", () => {
  it("UMA chamada, com as duas linhas aprovadas dentro", async () => {
    const espia = vi.spyOn(dados, "salvarPrecosEmLote")
      .mockResolvedValue({ ok: true, gravadas: 2 });
    abrir();
    preencher();
    fireEvent.click(botao("Conferir"));
    await waitFor(() => expect(botao("^Gravar")).toBeDefined());
    fireEvent.click(botao("^Gravar"));

    await waitFor(() => expect(espia).toHaveBeenCalledTimes(1));
    const [, lista] = espia.mock.calls[0];
    expect(lista).toHaveLength(2);
    expect(lista[0]).toMatchObject({ convenio_id: 7, codigo: "10101012", valor: 120, vigencia_inicio: "2026-09-01" });
  });

  it("avisa quem chamou, para a tela de trás recarregar", async () => {
    vi.spyOn(dados, "salvarPrecosEmLote").mockResolvedValue({ ok: true, gravadas: 2 });
    const onPronto = vi.fn();
    abrir({ onPronto });
    preencher();
    fireEvent.click(botao("Conferir"));
    await waitFor(() => expect(botao("^Gravar")).toBeDefined());
    fireEvent.click(botao("^Gravar"));
    await waitFor(() => expect(onPronto).toHaveBeenCalled());
  });

  it("🔴 quando falha, a tela diz que NADA entrou", async () => {
    // É o que decide o que a pessoa faz agora. "Deu erro" sozinho deixaria
    // a dúvida entre recolar (duplicando) e não recolar (faltando).
    vi.spyOn(dados, "salvarPrecosEmLote")
      .mockResolvedValue({ ok: false, gravadas: 0, motivo: "O banco recusou." });
    abrir();
    preencher();
    fireEvent.click(botao("Conferir"));
    await waitFor(() => expect(botao("^Gravar")).toBeDefined());
    fireEvent.click(botao("^Gravar"));
    expect(await screen.findByText(/Não gravei nada/i)).toBeTruthy();
    expect(screen.getByText(/continuam fora do banco/i)).toBeTruthy();
  });

  it("depois de falhar, o texto continua lá para tentar de novo", async () => {
    vi.spyOn(dados, "salvarPrecosEmLote").mockResolvedValue({ ok: false, gravadas: 0, motivo: "x" });
    abrir();
    preencher();
    fireEvent.click(botao("Conferir"));
    await waitFor(() => expect(botao("^Gravar")).toBeDefined());
    fireEvent.click(botao("^Gravar"));
    await screen.findByText(/Não gravei nada/i);
    expect(document.querySelector("textarea").value).toContain("10101012");
  });
});
