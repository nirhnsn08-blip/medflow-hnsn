// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// A TELA DO GIRO DE LEITOS PASSA O `sb` ADIANTE
//
// 🔴 O DEFEITO QUE ESTE ARQUIVO EXISTE PARA PEGAR NÃO FAZ BARULHO.
// A extração trocou o `sbFetch` global por um `sb` que chega por prop e
// desce para ./dados.js em dezenas de pontos. Um ponto que perca o `sb`:
//
//     loadSolicitacoes()   →   `if (!sb) return null`   →   nada na tela
//
// Sem erro, sem log. O `no-undef` não vê argumento faltando, o build não
// vê, e o telas.test.jsx monta a tela sem dado nenhum — que é exatamente o
// resultado do defeito.
//
// E num mapa de leitos isso é grave em duas direções: leito ocupado que
// some vira vaga que não existe, e fila que some vira "ninguém esperando".
//
// ⚠️ Este teste NÃO confere o que a tela desenha. Ele confere se a rede foi
// procurada — a única coisa que o defeito apaga.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import LeitosPage from "./GiroDeLeitos.jsx";

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const usuario = { name: "teste", role: "adm_master", username: "teste" };

function espiao() {
  const caminhos = [];
  const sb = c => { caminhos.push(String(c)); return Promise.resolve([]); };
  sb.caminhos = caminhos;
  return sb;
}

// As seis origens que a tela procura ao abrir. A lista é escrita de
// propósito: um teste que só contasse chamadas não pegaria uma carga
// APAGADA.
const TABELAS = ["leitos", "setores", "solicitacoes", "leitos_saidas", "leitos_turnover", "cid_referencia"];

describe("🔴 abrir o módulo procura as seis origens", () => {
  it("cada carga recebeu o sb e chegou na tabela dela", async () => {
    const sb = espiao();
    render(<LeitosPage sb={sb} currentUser={usuario} canEdit />);
    await waitFor(() => expect(sb.caminhos.length).toBeGreaterThanOrEqual(TABELAS.length));
    for (const t of TABELAS) {
      expect(sb.caminhos.some(c => c.startsWith(t)), `ninguém consultou ${t}`).toBe(true);
    }
  });

  it("🔴 a fila vem filtrada no servidor, e ordenada pela hora do pedido", async () => {
    // Filtrar no cliente traria a fila inteira desde sempre. E a ordem é a
    // do pedido: quem espera há mais tempo aparece primeiro.
    const sb = espiao();
    render(<LeitosPage sb={sb} currentUser={usuario} canEdit />);
    await waitFor(() => expect(sb.caminhos.some(c => c.startsWith("solicitacoes"))).toBe(true));
    const fila = sb.caminhos.find(c => c.startsWith("solicitacoes"));
    expect(fila).toContain("status=eq.aguardando");
    expect(fila).toContain("order=hora_pedido");
  });

  it("⚠️ sem `sb` a tela abre, e abre calada — não explode", () => {
    // Modo offline: monta a partir do armário do navegador.
    expect(() => render(<LeitosPage sb={null} currentUser={usuario} canEdit />)).not.toThrow();
  });

  it("⚠️ sem `sb`, NENHUMA carga finge que consultou", async () => {
    const sb = espiao();
    render(<LeitosPage sb={null} currentUser={usuario} canEdit />);
    await new Promise(r => setTimeout(r, 50));
    expect(sb.caminhos).toHaveLength(0);
  });
});

describe("o armário do navegador é o estado inicial", () => {
  it("a tela abre contando os leitos que já estavam guardados", async () => {
    // É o que a pessoa vê no primeiro quadro, antes de a rede responder —
    // e é tudo o que ela vê quando a rede não responde.
    //
    // ⚠️ A conferência é pelo CONTADOR, não pela identificação: o Dashboard
    // não imprime nome de leito (quem imprime é o Mapa). Procurar "T-99"
    // aqui daria vermelho com a tela funcionando.
    localStorage.setItem("hnsn_leitos_v1", JSON.stringify([
      { identificacao: "T-98", status: "ocupado" },
      { identificacao: "T-99", status: "livre" },
    ]));
    const { container } = render(<LeitosPage sb={null} currentUser={usuario} canEdit />);
    await waitFor(() => expect(container.textContent).toContain("1/2 leitos operacionais"));
    expect(container.textContent).toContain("Leitos disponíveis1");
  });

  it("🔴 armário com JSON que não é lista não derruba a tela", () => {
    // Passava pelo try/catch e estourava no primeiro `.filter`.
    localStorage.setItem("hnsn_leitos_v1", '{"nao":"e lista"}');
    localStorage.setItem("hnsn_setores_v1", '"texto"');
    expect(() => render(<LeitosPage sb={null} currentUser={usuario} canEdit />)).not.toThrow();
  });
});
