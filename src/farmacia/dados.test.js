// ═══════════════════════════════════════════════════════════
// FARMÁCIA — ACESSO AO BANCO
//
// 🔴 É A CAMADA MAIS LIDA DO SISTEMA DEPOIS DA DE LEITOS.
// `loadFarmMedicamentos` é usado por 16 declarações e `loadFarmLotes` por
// 12: a Farmácia, o Pronto-Socorro, o Suprimentos e a conciliação de kardex
// leem o mesmo catálogo. Um `sb` que não desce em um desses pontos devolve
// lista vazia — catálogo vazio, saldo zero, nenhuma interação — sem erro,
// sem log e sem teste de tela que caia.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  loadFarmMedicamentos, loadFarmLotes, loadFarmMovimentos, loadFarmMovimentosPeriodo,
  loadFarmSaidasDesde, upsertFarmMedicamentoRemote, deleteFarmMedicamentoRemote,
  addFarmMovimentoRemote, loadFarmInteracoes, loadFarmIncompatY, upsertFarmInteracaoRemote,
  loadFarmPreparo, receberPreparoRemote, atualizarPreparoRemote, loadFarmMovimentosByMeds,
  loadFarmNaoPadronizados, loadFarmIntervencoes, addFarmIntervencaoRemote,
  loadFarmInventarios, addFarmInventarioRemote, loadFarmSaidasByAtendimentos,
} from "./dados.js";

const USER = { name: "Ana Souza" };

function espiao(resposta = []) {
  const chamadas = [];
  const sb = (caminho, opts) => { chamadas.push({ caminho, opts }); return Promise.resolve(resposta); };
  sb.chamadas = chamadas;
  return sb;
}
const corpo = c => JSON.parse(c.opts.body);

const LEITURAS = [
  ["loadFarmMedicamentos", loadFarmMedicamentos, "farm_medicamentos"],
  ["loadFarmLotes", loadFarmLotes, "farm_lotes"],
  ["loadFarmInteracoes", loadFarmInteracoes, "farm_interacoes"],
  ["loadFarmIncompatY", loadFarmIncompatY, "farm_incompat_y"],
  ["loadFarmPreparo", loadFarmPreparo, "farm_preparo"],
  ["loadFarmNaoPadronizados", loadFarmNaoPadronizados, "farm_nao_padronizados"],
  ["loadFarmIntervencoes", loadFarmIntervencoes, "farm_intervencoes"],
  ["loadFarmInventarios", loadFarmInventarios, "farm_inventarios"],
];

describe("🔴 o `sb` é o primeiro argumento, e chega na tabela certa", () => {
  it.each(LEITURAS)("%s lê de %s", async (_n, fn, tabela) => {
    const sb = espiao([{ id: 1 }]);
    const r = await fn(sb);
    expect(sb.chamadas).toHaveLength(1);
    expect(sb.chamadas[0].caminho).toContain(tabela);
    expect(r).toEqual([{ id: 1 }]);
  });

  it("loadFarmMovimentos filtra pelo medicamento e limita", async () => {
    const sb = espiao([]);
    await loadFarmMovimentos(sb, 42, 10);
    expect(sb.chamadas[0].caminho).toContain("medicamento_id=eq.42");
    expect(sb.chamadas[0].caminho).toContain("limit=10");
  });

  it("os recortes por período levam as duas pontas", async () => {
    const sb = espiao([]);
    await loadFarmMovimentosPeriodo(sb, "2026-08-01T00:00:00Z", "2026-08-31T23:59:59Z");
    expect(sb.chamadas[0].caminho).toContain("2026-08-01");
    expect(sb.chamadas[0].caminho).toContain("2026-08-31");

    const sb2 = espiao([]);
    await loadFarmSaidasDesde(sb2, "2026-08-01T00:00:00Z");
    expect(sb2.chamadas[0].caminho).toContain("2026-08-01");
  });

  it("🔴 lista de ids vazia não vira consulta sem filtro", async () => {
    // `in.()` sem nada dentro traria a tabela INTEIRA. Numa base de
    // movimentos isso é o navegador travando, não um erro visível.
    for (const fn of [loadFarmMovimentosByMeds, loadFarmSaidasByAtendimentos]) {
      const sb = espiao([]);
      const r = await fn(sb, []);
      expect(r).toEqual([]);
      expect(sb.chamadas, `${fn.name} consultou com lista vazia`).toHaveLength(0);
    }
  });
});

describe("as escritas", () => {
  it("medicamento novo não leva id, e o retorno vem pedido", async () => {
    // Sem `return=representation` o 2xx do PostgREST não diria se gravou.
    const sb = espiao([{ id: 9 }]);
    await upsertFarmMedicamentoRemote(sb, { nome: "Dipirona 500mg" }, USER);
    expect(sb.chamadas[0].opts.headers.Prefer).toContain("return=representation");
    expect(corpo(sb.chamadas[0])).not.toHaveProperty("id");
    expect(corpo(sb.chamadas[0]).usuario).toBe("Ana Souza");
  });

  it("medicamento existente vira PATCH no id", async () => {
    const sb = espiao([]);
    await upsertFarmMedicamentoRemote(sb, { id: 9, nome: "Dipirona" }, USER);
    expect(sb.chamadas[0].caminho).toContain("id=eq.9");
    expect(sb.chamadas[0].opts.method).toBe("PATCH");
  });

  it.each([
    ["deleteFarmMedicamentoRemote", sb => deleteFarmMedicamentoRemote(sb, 3), "farm_medicamentos"],
    ["atualizarPreparoRemote", sb => atualizarPreparoRemote(sb, 3, { status: "pronto" }), "farm_preparo"],
    ["addFarmIntervencaoRemote", sb => addFarmIntervencaoRemote(sb, { texto: "x" }, USER), "farm_intervencoes"],
    ["addFarmInventarioRemote", sb => addFarmInventarioRemote(sb, { setor: "UTI" }, USER), "farm_inventarios"],
    ["receberPreparoRemote", sb => receberPreparoRemote(sb, 1, 2, USER), "farm_preparo"],
    ["upsertFarmInteracaoRemote", sb => upsertFarmInteracaoRemote(sb, { a: "x" }, USER), "farm_interacoes"],
  ])("%s escreve em %s", async (_n, chamar, tabela) => {
    const sb = espiao([]);
    await chamar(sb);
    expect(sb.chamadas.length).toBeGreaterThan(0);
    expect(sb.chamadas[0].caminho).toContain(tabela);
  });

  it("⚠️ sem banco, nenhuma escrita acontece — e nenhuma estoura", async () => {
    // Quem não devolve nada continua não devolvendo nada…
    for (const chamar of [
      () => deleteFarmMedicamentoRemote(null, 1),
      () => atualizarPreparoRemote(null, 1, {}),
    ]) await expect(chamar()).resolves.toBeUndefined();

    // …e quem devolve a linha criada devolve `null`, que é "não gravei".
    // Não é a mesma coisa que `undefined`, e o chamador lê o retorno.
    for (const chamar of [
      () => upsertFarmMedicamentoRemote(null, { nome: "x" }, USER),
      () => receberPreparoRemote(null, 1, 2, USER),
    ]) await expect(chamar()).resolves.toBeNull();
  });
});

describe("🔴 o movimento de estoque é a única escrita que devolve o MOTIVO", () => {
  // O `sb` engole a falha e devolve `null`, o que serve para as outras 130
  // chamadas. Aqui não: a recusa vem de um gatilho do banco ("saldo
  // insuficiente", "lote vencido") e quem está dispensando precisa ler o
  // motivo. Por isso esta função recebe o `sbCru`, e não o `sb`.

  it("devolve o que o poste cru devolveu", async () => {
    const cru = async () => ({ ok: false, erro: "saldo insuficiente para o lote L-22" });
    const r = await addFarmMovimentoRemote(cru, { medicamento_id: 1, quantidade: 5 }, USER);
    expect(r).toEqual({ ok: false, erro: "saldo insuficiente para o lote L-22" });
  });

  it("carimba quem fez, e grava em farm_movimentos", async () => {
    const vistos = [];
    const cru = async (caminho, corpo) => { vistos.push({ caminho, corpo }); return { ok: true }; };
    const r = await addFarmMovimentoRemote(cru, { medicamento_id: 1, tipo: "saida" }, USER);
    expect(r).toEqual({ ok: true });
    expect(vistos[0].caminho).toBe("farm_movimentos");
    expect(vistos[0].corpo).toMatchObject({ medicamento_id: 1, tipo: "saida", usuario: "Ana Souza" });
  });

  it("⚠️ sem banco devolve recusa EXPLÍCITA, e não um sucesso mudo", async () => {
    // `undefined` aqui faria o chamador ler `r.ok` de nada e estourar; um
    // `{ ok: true }` faria a tela dizer que dispensou sem ter dispensado.
    const r = await addFarmMovimentoRemote(null, { medicamento_id: 1 }, USER);
    expect(r.ok).toBe(false);
    expect(r.erro).toBeTruthy();
  });

  it("🔴 e NÃO conhece credencial nenhuma", async () => {
    // Antes da extração esta função montava o `fetch` na mão, com
    // SUPABASE_URL, SUPABASE_KEY e AUTH_TOKEN. Se a credencial voltar para
    // cá, o módulo volta a depender do App.jsx e deixa de ser testável.
    const fonte = addFarmMovimentoRemote.toString();
    for (const proibido of ["SUPABASE_URL", "SUPABASE_KEY", "AUTH_TOKEN", "apikey", "fetch("]) {
      expect(fonte, `${proibido} voltou para o módulo`).not.toContain(proibido);
    }
  });
});
