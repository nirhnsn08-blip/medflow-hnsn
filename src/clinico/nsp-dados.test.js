// ═══════════════════════════════════════════════════════════
// NSP — ACESSO AO BANCO
//
// 🔴 O QUE ESTE ARQUIVO GUARDA
// Na extração do App.jsx, a dupla `sbFetch` + `USE_SUPABASE` virou um único
// parâmetro `sb`. Duas coisas mudaram de forma silenciosa:
//
//   1. `sb` passou a ser o PRIMEIRO argumento de 19 funções. Um chamador que
//      esqueça de passar não quebra nada visível: `if (!sb)` devolve lista
//      vazia, e a tela abre bonita e sem dado nenhum.
//   2. `sb` nulo virou o modo offline. Se o valor de retorno estiver errado
//      (`[]` onde era `0`, `undefined` onde era `null`), quem consome quebra
//      longe daqui.
//
// Nenhum dos três detectores da casa pega isso: `no-undef` não vê argumento
// faltando, o build não vê, e o telas.test.jsx monta a tela sem dado e passa.
// Tela vazia é o pior defeito deste módulo — subnotificação parece segurança.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  loadIncidentes, loadLppAdquiridas, registrarIncidente, atualizarStatusIncidente,
  loadRcas, loadAcoes, registrarRca, registrarAcao, atualizarAcao,
  loadMetaFaixas, loadMetaMedicoes, salvarMetaFaixa, registrarMetaMedicao,
  loadProtocolos, salvarProtocolo, loadCapacitacoes, salvarCapacitacao,
  loadComunicados, salvarComunicado,
} from "./nsp-dados.js";

/** Um `sb` de mentira que anota o que foi chamado e devolve o que mandarem. */
function espiao(resposta = []) {
  const chamadas = [];
  const sb = (caminho, opts) => { chamadas.push({ caminho, opts }); return Promise.resolve(resposta); };
  sb.chamadas = chamadas;
  return sb;
}
const corpoDe = c => JSON.parse(c.opts.body);

const LEITORES = [
  ["loadIncidentes", loadIncidentes, "nsp_incidentes", []],
  ["loadRcas", loadRcas, "nsp_rca", []],
  ["loadAcoes", loadAcoes, "nsp_acoes", []],
  ["loadMetaFaixas", loadMetaFaixas, "nsp_meta_faixas", []],
  ["loadMetaMedicoes", loadMetaMedicoes, "nsp_meta_medicoes", []],
  ["loadProtocolos", loadProtocolos, "nsp_protocolos", []],
  ["loadCapacitacoes", loadCapacitacoes, "nsp_capacitacoes", []],
  ["loadComunicados", loadComunicados, "nsp_comunicados", []],
];

describe("🔴 sem `sb` é modo offline — e cada função devolve o vazio DELA", () => {
  it.each(LEITORES)("%s devolve lista vazia", async (_nome, fn) => {
    expect(await fn(null)).toEqual([]);
    expect(await fn(undefined)).toEqual([]);
  });

  it("⚠️ loadLppAdquiridas devolve 0, não lista vazia — ele conta", () => {
    // `[]` aqui viraria "0 LPP adquiridas" por acidente e ninguém notaria;
    // mas `[].length` num indicador que espera número já deu bug nesta casa.
    return expect(loadLppAdquiridas(null)).resolves.toBe(0);
  });

  it("as escritas que devolvem a linha criada devolvem null", async () => {
    for (const fn of [registrarIncidente, registrarRca, registrarAcao, registrarMetaMedicao]) {
      expect(await fn(null, {}, {})).toBeNull();
    }
  });

  it("e nenhuma delas toca a rede", async () => {
    const sb = espiao();
    await loadIncidentes(null);
    await registrarIncidente(null, { classe: "near_miss" }, {});
    expect(sb.chamadas).toHaveLength(0);
  });
});

describe("🔴 o `sb` é o PRIMEIRO argumento das 19 — e chega na tabela certa", () => {
  it.each(LEITORES)("%s lê de %s", async (_nome, fn, tabela) => {
    const sb = espiao([{ id: 1 }]);
    const r = await fn(sb);
    expect(sb.chamadas).toHaveLength(1);
    expect(sb.chamadas[0].caminho).toContain(tabela);
    expect(r).toEqual([{ id: 1 }]);
  });

  it("loadLppAdquiridas conta as LPP que NÃO vieram da admissão", async () => {
    // O filtro `presente_admissao=eq.false` é o indicador: lesão adquirida
    // na unidade. Sem ele, o número viraria "todas as LPP" e o indicador de
    // segurança passaria a contar o que o paciente já trouxe de casa.
    const sb = espiao([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(await loadLppAdquiridas(sb)).toBe(3);
    expect(sb.chamadas[0].caminho).toContain("presente_admissao=eq.false");
  });

  it.each([
    ["atualizarStatusIncidente", sb => atualizarStatusIncidente(sb, { id: 7 }, "em_tratamento", null, {})],
    ["atualizarAcao", sb => atualizarAcao(sb, { id: 3 }, { status: "concluida" })],
    ["salvarMetaFaixa", sb => salvarMetaFaixa(sb, { chave: "x" }, {})],
    ["salvarProtocolo", sb => salvarProtocolo(sb, { titulo: "t" }, {})],
    ["salvarCapacitacao", sb => salvarCapacitacao(sb, { tema: "t" }, {})],
    ["salvarComunicado", sb => salvarComunicado(sb, { titulo: "t" }, {})],
  ])("%s escreve quando recebe sb, e não escreve quando não recebe", async (_n, chamar) => {
    const sb = espiao();
    await chamar(sb);
    expect(sb.chamadas.length).toBeGreaterThan(0);
    await expect(chamar(null)).resolves.toBeUndefined();
  });
});

describe("as regras puras continuam sendo aplicadas na escrita", () => {
  it("registrarIncidente carimba risco e exigência de RCA", async () => {
    const sb = espiao([{ id: 99 }]);
    // Evento adverso com dano grave: a matriz dá a faixa de risco e o RCA
    // passa a ser exigido. Nada disso é decidido aqui — vem de nsp.js — mas
    // tem de CHEGAR no corpo do POST.
    await registrarIncidente(sb, {
      classe: "evento_adverso", grau_dano: "grave", descricao: "queda com fratura",
      probabilidade: 4, gravidade: 5,
    }, { name: "Ana", categoria: "enfermeiro" });

    const b = corpoDe(sb.chamadas[0]);
    expect(b.risco_score).toBe(20);
    expect(b.risco_faixa).toBeTruthy();
    expect(b.exige_rca).toBe(true);
    expect(b.status).toBe("nova");
    expect(b.notificado_por).toBe("Ana");
  });

  it("🔴 dano grave EXIGE análise de causa, mas não é notificação compulsória", async () => {
    // As duas coisas andam juntas na cabeça de quem lê, e não são a mesma.
    // Compulsória (ANVISA/VISA) é never event ou óbito — só. Carimbar
    // compulsória a mais enche a fila da vigilância de caso que não é dela;
    // a menos, deixa de notificar o que a lei manda.
    const grave = espiao([{ id: 1 }]);
    await registrarIncidente(grave, { classe: "evento_adverso", grau_dano: "grave", descricao: "x" }, {});
    expect(corpoDe(grave.chamadas[0]).exige_rca).toBe(true);
    expect(corpoDe(grave.chamadas[0]).notificacao_compulsoria).toBe(false);

    for (const inc of [{ classe: "never_event", descricao: "x" },
                       { classe: "incidente", grau_dano: "obito", descricao: "x" }]) {
      const sb = espiao([{ id: 1 }]);
      await registrarIncidente(sb, inc, {});
      expect(corpoDe(sb.chamadas[0]).notificacao_compulsoria,
        JSON.stringify(inc)).toBe(true);
    }
  });

  it("🔴 anônimo não guarda quem notificou — é o que sustenta a cultura justa", async () => {
    const sb = espiao([{ id: 1 }]);
    await registrarIncidente(sb, { classe: "near_miss", descricao: "x", anonimo: true },
      { name: "Ana", categoria: "enfermeiro" });
    const b = corpoDe(sb.chamadas[0]);
    expect(b.anonimo).toBe(true);
    expect(b.notificado_por).toBeNull();
    expect(b.categoria).toBeNull();
  });

  it("⚠️ o retorno vem pedido de propósito — 2xx do PostgREST não prova gravação", async () => {
    const sb = espiao([{ id: 42 }]);
    const r = await registrarIncidente(sb, { classe: "near_miss", descricao: "x" }, {});
    expect(sb.chamadas[0].opts.headers.Prefer).toContain("return=representation");
    expect(r).toEqual({ id: 42 });
  });

  it("atualizarAcao carimba a conclusão só na primeira vez", async () => {
    const sb = espiao();
    await atualizarAcao(sb, { id: 1 }, { status: "concluida" });
    expect(corpoDe(sb.chamadas[0]).concluida_em).toBeTruthy();

    const sb2 = espiao();
    await atualizarAcao(sb2, { id: 1, concluida_em: "2026-01-01T00:00:00Z" }, { status: "concluida" });
    // Já tinha data: reconcluir não pode reescrever quando foi concluída de
    // verdade — é isso que o indicador de prazo lê.
    expect(corpoDe(sb2.chamadas[0]).concluida_em).toBeUndefined();
  });
});
