// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// A TELA DO NSP PASSA O `sb` ADIANTE
//
// 🔴 O DEFEITO QUE ESTE ARQUIVO EXISTE PARA PEGAR
// Na extração do App.jsx, `sb` virou o primeiro argumento de 19 funções, e
// a tela passou a repassá-lo em ~25 pontos de chamada. Um ponto que perca o
// `sb` não quebra nada:
//
//     loadIncidentes()   →  `if (!sb) return []`  →  tela abre vazia
//
// Sem erro, sem log, sem teste vermelho. O `no-undef` não vê argumento
// faltando, o build não vê, e o telas.test.jsx monta a tela sem dado
// nenhum — que é exatamente o resultado do defeito.
//
// E tela vazia é o pior jeito de este módulo falhar: um núcleo de segurança
// que não mostra incidente parece um hospital sem incidente.
//
// ⚠️ Este teste NÃO olha o que a tela desenha. Ele olha se a rede foi
// procurada — que é a única coisa que o defeito apaga.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, waitFor, fireEvent } from "@testing-library/react";
import NSPPage, { NotificacaoRapida } from "./SegurancaPaciente.jsx";

afterEach(cleanup);

const usuario = { name: "teste", role: "adm_master", username: "teste", categoria: "enfermeiro" };

function espiao() {
  const caminhos = [];
  const sb = c => { caminhos.push(String(c)); return Promise.resolve([]); };
  sb.caminhos = caminhos;
  return sb;
}

// As nove consultas que o `recarregar()` dispara ao abrir o módulo. A lista
// é escrita de propósito: se alguém APAGAR uma carga, o teste tem de cair —
// um teste que só conta quantas chamadas houve não pegaria isso.
const TABELAS = [
  "nsp_incidentes", "enf_lesao_pressao", "nsp_rca", "nsp_acoes",
  "nsp_meta_faixas", "nsp_meta_medicoes", "nsp_protocolos",
  "nsp_capacitacoes", "nsp_comunicados",
];

describe("🔴 abrir o módulo procura as nove origens", () => {
  it("cada uma das cargas recebeu o sb e chegou na tabela dela", async () => {
    const sb = espiao();
    render(<NSPPage sb={sb} currentUser={usuario} canEdit />);
    await waitFor(() => expect(sb.caminhos.length).toBeGreaterThanOrEqual(TABELAS.length));
    for (const t of TABELAS) {
      expect(sb.caminhos.some(c => c.includes(t)), `ninguém consultou ${t}`).toBe(true);
    }
  });

  it("⚠️ sem `sb` a tela abre, e abre CALADA — não explode", async () => {
    // É o modo offline. A tela tem de montar; o que não pode é fingir que
    // consultou. Aqui só se garante que montar sem banco não derruba nada.
    expect(() => render(<NSPPage sb={null} currentUser={usuario} canEdit />)).not.toThrow();
  });
});

describe("🔴 o botão flutuante de notificar", () => {
  it("some quando não há banco — notificar sem gravar é pior que não ter botão", () => {
    const { container } = render(<NotificacaoRapida sb={null} currentUser={usuario} />);
    expect(container.querySelector("button")).toBeNull();
  });

  it("aparece quando há banco", () => {
    const { container } = render(<NotificacaoRapida sb={espiao()} currentUser={usuario} />);
    const b = container.querySelector("button");
    expect(b).not.toBeNull();
    expect(b.textContent).toContain("Notificar");
  });

  it("grava pela mesma porta, com o `sb` que recebeu", async () => {
    const chamadas = [];
    const sb = (caminho, opts) => { chamadas.push({ caminho, opts }); return Promise.resolve([{ id: 1 }]); };
    const { container, getByPlaceholderText, getAllByText } = render(
      <NotificacaoRapida sb={sb} currentUser={usuario} />);

    fireEvent.click(container.querySelector("button"));
    fireEvent.change(getByPlaceholderText("O que aconteceu?"),
      { target: { value: "quase troquei o medicamento" } });
    // O botão flutuante e o de enviar têm o mesmo rótulo; o de enviar é o
    // último a entrar na árvore.
    const botoes = getAllByText("Notificar");
    fireEvent.click(botoes[botoes.length - 1]);

    await waitFor(() => expect(chamadas.length).toBeGreaterThan(0));
    expect(chamadas[0].caminho).toContain("nsp_incidentes");
    // `origem_tipo: "rapida"` é o que separa, no indicador, quem notificou
    // pelo botão de quem entrou no módulo — some se a prop não descer.
    expect(JSON.parse(chamadas[0].opts.body).origem_tipo).toBe("rapida");
  });
});
