// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// "QUEM VEIO?" — nenhum vínculo sem mostrar quem é
//
// 🔴 ERA UM `prompt("Número do prontuário de quem veio:")`: gravava o número
// digitado sem mostrar de quem ele era. Um dígito trocado ligava a vaga — e
// depois a presença, o atendimento e a produção — a OUTRA pessoa real.
//
// O que estes testes garantem é a ORDEM: procurar → ver nome, nascimento e
// mãe → confirmar → só então gravar. E que falha de leitura não vira "não
// cadastrado", que é o caminho que faz a recepcionista ligar a vaga a outra
// pessoa da lista.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import VincularPaciente from "./VincularPaciente.jsx";

afterEach(cleanup);

const MARIA = {
  prontuario: "T9032", iniciais: "M.S.F.", nome_completo: "Maria Silva Fontes",
  nome_social: null, data_nascimento: "1992-09-06", nome_mae: "Joana Silva", sexo: "F",
};
const OUTRA = { ...MARIA, prontuario: "T9033", nome_completo: "Marina Souza Faria", nome_mae: "Rita Souza" };

/** `pacientes?...&limit=25&order=prontuario` é a busca; `prontuario=eq.` é a ficha. */
function bancoFalso({ lista = [MARIA], fichas = { T9032: MARIA }, buscaFalha = false } = {}) {
  return async (url) => {
    if (buscaFalha && url.includes("limit=25")) return null;
    if (url.includes("limit=25")) return lista;
    const m = String(url).match(/prontuario=eq\.([^&]+)/);
    if (m) return fichas[decodeURIComponent(m[1])] ? [fichas[decodeURIComponent(m[1])]] : [];
    return [];
  };
}

const AGENDAMENTO = { id: 10, hora: "09:30", prontuario: null, status: "agendado" };

function abrir(sb, onLigar = vi.fn(async () => ({ ok: true }))) {
  render(<VincularPaciente sb={sb} agendamento={AGENDAMENTO} onLigar={onLigar} onCancelar={() => {}} />);
  return onLigar;
}

const procurar = async (termo) => {
  fireEvent.change(screen.getByPlaceholderText(/Nome, data de nascimento/), { target: { value: termo } });
  fireEvent.click(screen.getByText("Procurar"));
};

describe("Quem veio? — a ordem obrigatória", () => {
  it("🔴 não liga ninguém antes de a pessoa ser mostrada e confirmada", async () => {
    const onLigar = abrir(bancoFalso());
    await procurar("maria");
    const linha = await screen.findByText(/Maria Silva Fontes/);
    expect(onLigar).not.toHaveBeenCalled();          // escolher da lista ainda não liga

    fireEvent.click(linha.closest("button"));
    // a confirmação mostra os identificadores que a pessoa confere no balcão
    await screen.findByText(/Confirme com a pessoa no balcão/);
    expect(screen.getByText("06/09/1992")).toBeTruthy();
    expect(screen.getByText("Joana Silva")).toBeTruthy();
    expect(onLigar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("É esta pessoa — ligar à vaga"));
    await waitFor(() => expect(onLigar).toHaveBeenCalledTimes(1));
    expect(onLigar.mock.calls[0][0].prontuario).toBe("T9032");
  });

  it("'Não é — procurar de novo' volta para a busca sem ligar", async () => {
    const onLigar = abrir(bancoFalso({ lista: [MARIA, OUTRA], fichas: { T9032: MARIA, T9033: OUTRA } }));
    await procurar("mari");
    fireEvent.click((await screen.findByText(/Maria Silva Fontes/)).closest("button"));
    await screen.findByText(/Confirme com a pessoa/);
    fireEvent.click(screen.getByText("Não é — procurar de novo"));
    await screen.findByText("Procurar");
    expect(onLigar).not.toHaveBeenCalled();
  });

  it("🔴 ficha unificada liga à que VALE, e diz isso", async () => {
    const APOSENTADA = { ...MARIA, prontuario: "T4001", unificado_para: "T9032" };
    const onLigar = abrir(bancoFalso({ lista: [APOSENTADA], fichas: { T4001: APOSENTADA, T9032: MARIA } }));
    await procurar("maria");
    fireEvent.click((await screen.findByText(/Maria Silva Fontes/)).closest("button"));
    await screen.findByText(/foi unificado em T9032/);
    fireEvent.click(screen.getByText("É esta pessoa — ligar à vaga"));
    await waitFor(() => expect(onLigar).toHaveBeenCalled());
    expect(onLigar.mock.calls[0][0].prontuario).toBe("T9032");   // não o T4001
  });

  it("🔴 óbito registrado recusa — é a vaga de consulta que gera o telefonema à família", async () => {
    const MORTA = { ...MARIA, obito: true, obito_em: "2026-01-10", obito_origem: "PS" };
    const onLigar = abrir(bancoFalso({ lista: [MORTA], fichas: { T9032: MORTA } }));
    await procurar("maria");
    fireEvent.click((await screen.findByText(/Maria Silva Fontes/)).closest("button"));
    await screen.findByRole("alert");
    expect(screen.queryByText("É esta pessoa — ligar à vaga")).toBeNull();
    expect(onLigar).not.toHaveBeenCalled();
  });

  it("🔴 falha de leitura não vira 'não cadastrado'", async () => {
    const onLigar = abrir(bancoFalso({ buscaFalha: true }));
    await procurar("maria");
    const aviso = await screen.findByRole("alert");
    expect(aviso.textContent).toMatch(/não é que o paciente não exista/i);
    expect(screen.queryByText(/Nenhum paciente encontrado/)).toBeNull();
    expect(onLigar).not.toHaveBeenCalled();
  });

  it("ficha que não abre não é ligada (sem ela não dá para saber quem é)", async () => {
    const onLigar = abrir(bancoFalso({ lista: [MARIA], fichas: {} }));
    await procurar("maria");
    fireEvent.click((await screen.findByText(/Maria Silva Fontes/)).closest("button"));
    await screen.findByRole("alert");
    expect(screen.queryByText("É esta pessoa — ligar à vaga")).toBeNull();
    expect(onLigar).not.toHaveBeenCalled();
  });

  it("busca vazia explica, e não consulta o banco", async () => {
    const chamadas = [];
    const sb = async (url) => { chamadas.push(url); return []; };
    abrir(sb);
    fireEvent.click(screen.getByText("Procurar"));
    await screen.findByRole("alert");
    expect(chamadas.some(u => u.includes("limit=25"))).toBe(false);
  });
});
