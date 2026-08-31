// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// LEITOS, SETORES E SOLICITAÇÕES — ACESSO AO BANCO
//
// 🔴 O QUE ESTE ARQUIVO GUARDA É A DIFERENÇA ENTRE `null` E `[]`.
//
//   null  →  não deu para perguntar. O que estava na tela continua valendo.
//   []    →  perguntou, respondeu, não há nenhum.
//
// Três destas funções devolviam `[]` nos DOIS casos, e a pior era a fila de
// internação: uma leitura que falhava virava "0 aguardando leito" na tela.
// Fila vazia é notícia boa, e ninguém confere notícia boa.
//
// O chamador no LeitosPage já escrevia `if (Array.isArray(rows))`, como se
// a falha viesse distinguível — letra morta, porque `[]` sempre passa. A
// intenção estava escrita; quem não cumpria era a função.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from "vitest";
import {
  LEITOS_KEY, loadLeitos, saveLeitos, loadLeitosFromSupabase, upsertLeitoRemote, deleteLeitoRemote,
  SETORES_KEY, loadSetoresLocal, saveSetoresLocal, loadSetoresFromSupabase, upsertSetorRemote, deleteSetorRemote,
  loadSolicitacoes, addSolicitacaoRemote, updateSolicitacaoRemote,
  registrarSaidaRemote, loadSaidas, registrarTurnoverRemote, loadTurnover,
} from "./dados.js";

const USER = { name: "Ana Souza" };

/** Um `sb` de mentira. `resposta` é o que a rede devolve. */
function espiao(resposta = []) {
  const chamadas = [];
  const sb = (caminho, opts) => { chamadas.push({ caminho, opts }); return Promise.resolve(resposta); };
  sb.chamadas = chamadas;
  return sb;
}
const corpo = c => JSON.parse(c.opts.body);

beforeEach(() => localStorage.clear());

// As cinco leituras, com a tabela de cada uma.
const LEITURAS = [
  ["loadLeitosFromSupabase", loadLeitosFromSupabase, "leitos"],
  ["loadSetoresFromSupabase", loadSetoresFromSupabase, "setores"],
  ["loadSolicitacoes", loadSolicitacoes, "solicitacoes"],
  ["loadSaidas", loadSaidas, "leitos_saidas"],
  ["loadTurnover", loadTurnover, "leitos_turnover"],
];

describe("🔴 falha e vazio são coisas diferentes", () => {
  it.each(LEITURAS)("%s devolve null quando a leitura falhou", async (_n, fn) => {
    // `sb` devolve null em qualquer falha — rede, token vencido, coluna
    // que sumiu. A tela precisa saber que não deu para perguntar.
    expect(await fn(espiao(null))).toBeNull();
  });

  it.each(LEITURAS)("%s devolve [] quando respondeu e não há nenhum", async (_n, fn) => {
    expect(await fn(espiao([]))).toEqual([]);
  });

  it.each(LEITURAS)("%s devolve null sem banco", async (_n, fn) => {
    // Modo offline não é "não há nenhum": é "não perguntei".
    expect(await fn(null)).toBeNull();
    expect(await fn(undefined)).toBeNull();
  });

  it("⚠️ e resposta que não é lista também é null", async () => {
    // O PostgREST devolve objeto de erro com 2xx em alguns casos. Um objeto
    // passaria adiante e a tela faria `.filter` nele.
    for (const lixo of [{ message: "erro" }, "texto", 42, true]) {
      expect(await loadSolicitacoes(espiao(lixo)), JSON.stringify(lixo)).toBeNull();
    }
  });
});

describe("🔴 a fila de internação, que é a que dói", () => {
  it("filtra `aguardando` no SERVIDOR, e ordena por hora do pedido", async () => {
    // Filtrar no cliente traria a fila inteira desde sempre — cresce para
    // sempre e ninguém percebe até travar. E a ordem é a do pedido: quem
    // espera há mais tempo vem primeiro.
    const sb = espiao([]);
    await loadSolicitacoes(sb);
    expect(sb.chamadas[0].caminho).toContain("status=eq.aguardando");
    expect(sb.chamadas[0].caminho).toContain("order=hora_pedido");
  });

  it("nunca devolve [] mascarando uma falha", async () => {
    // Este é o defeito de origem, em uma linha.
    expect(await loadSolicitacoes(espiao(null))).not.toEqual([]);
  });

  it("a solicitação criada volta com o id", async () => {
    // ⚠️ `return=representation` pedido de propósito: o 2xx do PostgREST
    // não prova gravação, e quem chama precisa do id para acompanhar.
    const sb = espiao([{ id: 7 }]);
    const r = await addSolicitacaoRemote(sb, { origem: "PS", destino: "UTI" }, USER);
    expect(sb.chamadas[0].opts.headers.Prefer).toContain("return=representation");
    expect(r).toEqual([{ id: 7 }]);
    expect(corpo(sb.chamadas[0])).toMatchObject({ origem: "PS", destino: "UTI", usuario: "Ana Souza" });
  });
});

describe("as escritas chegam na tabela certa, com o sb primeiro", () => {
  it("leito: upsert por identificação, e o retorno vem pedido", async () => {
    const sb = espiao();
    await upsertLeitoRemote(sb, { identificacao: "102", status: "livre" }, USER);
    expect(sb.chamadas[0].caminho).toContain("leitos?on_conflict=identificacao");
    expect(sb.chamadas[0].opts.headers.Prefer).toContain("resolution=merge-duplicates");
    expect(corpo(sb.chamadas[0]).usuario).toBe("Ana Souza");
  });

  it("setor: upsert por nome", async () => {
    const sb = espiao();
    await upsertSetorRemote(sb, { nome: "UTI", ordem: 1 }, USER);
    expect(sb.chamadas[0].caminho).toContain("setores?on_conflict=nome");
  });

  it("🔴 nome com acento, espaço ou barra é escapado na URL", async () => {
    // Sem `encodeURIComponent`, "POSTO 1/2" corta a URL no `/` e o DELETE
    // acerta outra coisa — ou nada, em silêncio.
    const sb = espiao();
    await deleteSetorRemote(sb, "MATERNIDADE / ALOJAMENTO");
    expect(sb.chamadas[0].caminho).toContain("MATERNIDADE%20%2F%20ALOJAMENTO");
    expect(sb.chamadas[0].caminho).not.toContain("MATERNIDADE / ");

    const sb2 = espiao();
    await deleteLeitoRemote(sb2, "T-36 A");
    expect(sb2.chamadas[0].caminho).toContain("T-36%20A");
  });

  it.each([
    ["registrarSaidaRemote", sb => registrarSaidaRemote(sb, { leito: "102" }, USER), "leitos_saidas"],
    ["registrarTurnoverRemote", sb => registrarTurnoverRemote(sb, { leito: "102" }, USER), "leitos_turnover"],
    ["updateSolicitacaoRemote", sb => updateSolicitacaoRemote(sb, 5, { status: "atendido" }), "solicitacoes"],
  ])("%s escreve em %s", async (_n, chamar, tabela) => {
    const sb = espiao();
    await chamar(sb);
    expect(sb.chamadas[0].caminho).toContain(tabela);
  });

  it("⚠️ sem banco, nenhuma escrita acontece — e nenhuma estoura", async () => {
    for (const chamar of [
      () => upsertLeitoRemote(null, { identificacao: "1" }, USER),
      () => deleteLeitoRemote(null, "1"),
      () => upsertSetorRemote(null, { nome: "x" }, USER),
      () => deleteSetorRemote(null, "x"),
      () => updateSolicitacaoRemote(null, 1, {}),
      () => registrarSaidaRemote(null, {}, USER),
      () => registrarTurnoverRemote(null, {}, USER),
    ]) await expect(chamar()).resolves.toBeUndefined();
    await expect(addSolicitacaoRemote(null, {}, USER)).resolves.toBeNull();
  });
});

describe("o armário do navegador", () => {
  it("guarda e devolve", () => {
    saveLeitos([{ identificacao: "102" }]);
    expect(loadLeitos()).toEqual([{ identificacao: "102" }]);
    saveSetoresLocal([{ nome: "UTI" }]);
    expect(loadSetoresLocal()).toEqual([{ nome: "UTI" }]);
  });

  it("vazio quando nunca foi escrito", () => {
    expect(loadLeitos()).toEqual([]);
    expect(loadSetoresLocal()).toEqual([]);
  });

  it("🔴 JSON válido que NÃO é lista devolve [], não o objeto", () => {
    // Passava pelo try/catch e estourava no `findIndex` de quem salva um
    // leito. Mesmo defeito que a trilha de auditoria tinha.
    localStorage.setItem(LEITOS_KEY, '{"nao":"e lista"}');
    expect(loadLeitos()).toEqual([]);
    localStorage.setItem(SETORES_KEY, '"texto"');
    expect(loadSetoresLocal()).toEqual([]);
  });

  it("lixo não-JSON devolve []", () => {
    localStorage.setItem(LEITOS_KEY, "{isso não abre");
    expect(loadLeitos()).toEqual([]);
  });

  it("⚠️ armário cheio não derruba quem salvou o leito", () => {
    // Gravar aqui é conveniência; a verdade está no banco. Estourar faria o
    // usuário ver falhar um salvamento que deu certo.
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException("QuotaExceededError"); };
    try {
      expect(() => saveLeitos([{ identificacao: "102" }])).not.toThrow();
      expect(() => saveSetoresLocal([{ nome: "UTI" }])).not.toThrow();
    } finally { Storage.prototype.setItem = original; }
  });

  it("as duas chaves são as que já estão nos navegadores", () => {
    // Mudar a chave não quebra nada visível: o armário aparece vazio e o
    // sistema segue como se nunca tivesse guardado nada.
    expect(LEITOS_KEY).toBe("hnsn_leitos_v1");
    expect(SETORES_KEY).toBe("hnsn_setores_v1");
  });
});
