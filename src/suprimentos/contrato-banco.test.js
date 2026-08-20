// ═══════════════════════════════════════════════════════════
// CONTRATO ENTRE A CONCILIAÇÃO E O BANCO
//
// Mesmo padrão dos outros módulos. Aqui nada é gravado, e o risco é o da
// leitura errada: se uma coluna sumir do `select`, o PostgREST devolve
// erro, o `sbFetch` vira `null`, e a conciliação passa a dizer "não
// conferido" para sempre. Um indicador de integridade que silenciosamente
// para de conferir é pior que nenhum — dá a impressão de que alguém está
// olhando.
//
// Confere cada coluna contra `supabase/auditoria-banco.sql`, gerado das
// migrações (`node supabase/gerar-auditoria.mjs`), e prova a paginação com
// um `sb` falso.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  carregarTudoPorId, conciliarAgora,
  COLUNAS_MOVIMENTO, COLUNAS_LOTE, PAGINA,
} from "./dados.js";

const AUDITORIA = fs.readFileSync(
  path.join(process.cwd(), "supabase", "auditoria-banco.sql"), "utf8");

const COLUNAS = {};
for (const [, tabela, coluna] of AUDITORIA.matchAll(/\('([a-z0-9_]+)','([a-z0-9_]+)','[^']*'\)/g)) {
  (COLUNAS[tabela] ||= new Set()).add(coluna);
}

it("a auditoria foi lida (o parser não quebrou em silêncio)", () => {
  expect(Object.keys(COLUNAS).length).toBeGreaterThan(30);
  expect(COLUNAS.sup_movimentos?.has("lote_id")).toBe(true);
  expect(COLUNAS.sup_lotes?.has("quantidade")).toBe(true);
});

describe("as colunas lidas existem no banco", () => {
  it("sup_movimentos", () => {
    for (const c of COLUNAS_MOVIMENTO.split(",")) {
      expect(COLUNAS.sup_movimentos.has(c), `sup_movimentos.${c}`).toBe(true);
    }
  });
  it("sup_lotes", () => {
    for (const c of COLUNAS_LOTE.split(",")) {
      expect(COLUNAS.sup_lotes.has(c), `sup_lotes.${c}`).toBe(true);
    }
  });
  it("as duas tabelas têm `id` — a paginação por chave depende disso", () => {
    expect(COLUNAS.sup_movimentos.has("id")).toBe(true);
    expect(COLUNAS.sup_lotes.has("id")).toBe(true);
  });
});

/** `sb` falso que devolve `n` linhas no total, paginando como o PostgREST. */
function sbComLinhas(n, tabelaFiltro = null) {
  const consultas = [];
  const sb = async recurso => {
    consultas.push(recurso);
    if (tabelaFiltro && !recurso.startsWith(tabelaFiltro)) return [];
    const desde = Number(/id=gt\.(\d+)/.exec(recurso)?.[1] ?? 0);
    const limite = Number(/limit=(\d+)/.exec(recurso)?.[1] ?? PAGINA);
    const out = [];
    for (let id = desde + 1; id <= n && out.length < limite; id++) {
      out.push({ id, item_id: 1, lote_id: 10, tipo: "entrada", quantidade: 1 });
    }
    return out;
  };
  return { sb, consultas };
}

describe("carregarTudoPorId", () => {
  it("pagina por chave, não por offset", async () => {
    const { sb, consultas } = sbComLinhas(25);
    const r = await carregarTudoPorId(sb, "sup_movimentos", COLUNAS_MOVIMENTO, { pagina: 10, teto: 1000 });
    expect(r.completo).toBe(true);
    expect(r.linhas).toHaveLength(25);
    // offset paginado repete/pula linha quando entra inserção durante a
    // leitura — numa conciliação isso vira divergência inventada.
    expect(consultas.every(q => !q.includes("offset"))).toBe(true);
    expect(consultas[1]).toContain("id=gt.10");
    expect(consultas[2]).toContain("id=gt.20");
  });

  it("para quando a página vem incompleta — sem requisição sobrando", async () => {
    const { sb, consultas } = sbComLinhas(7);
    await carregarTudoPorId(sb, "sup_movimentos", COLUNAS_MOVIMENTO, { pagina: 10, teto: 1000 });
    expect(consultas).toHaveLength(1);
  });

  it("bate no teto → completo: false (mas devolve o que leu)", async () => {
    const { sb } = sbComLinhas(100);
    const r = await carregarTudoPorId(sb, "sup_movimentos", COLUNAS_MOVIMENTO, { pagina: 10, teto: 30 });
    expect(r.completo).toBe(false);
    expect(r.linhas.length).toBeGreaterThanOrEqual(30);
  });

  it("🔴 falha no MEIO da paginação devolve null, não meia lista", async () => {
    // Meia lista é pior que lista nenhuma: parece completa e produz um
    // rombo inventado do tamanho do que faltou ler.
    let n = 0;
    const sb = async () => (++n === 1 ? Array.from({ length: 10 }, (_, i) => ({ id: i + 1 })) : null);
    const r = await carregarTudoPorId(sb, "sup_movimentos", COLUNAS_MOVIMENTO, { pagina: 10, teto: 1000 });
    expect(r.linhas).toBeNull();
    expect(r.completo).toBe(false);
  });

  it("consulta que estoura vira null, não exceção", async () => {
    const sb = async () => { throw new Error("rede caiu"); };
    const r = await carregarTudoPorId(sb, "sup_lotes", COLUNAS_LOTE);
    expect(r.linhas).toBeNull();
  });
});

describe("conciliarAgora", () => {
  it("não grava nada — a conciliação só observa", async () => {
    const chamadas = [];
    const sb = async (recurso, opcoes) => { chamadas.push({ recurso, opcoes }); return []; };
    await conciliarAgora(sb);
    expect(chamadas.length).toBeGreaterThan(0);
    expect(chamadas.every(c => c.opcoes === undefined)).toBe(true);
  });

  it("leitura falhou → motivo 'falha', e não uma acusação de rombo", async () => {
    const sb = async () => null;
    const r = await conciliarAgora(sb);
    expect(r.conciliavel).toBe(false);
    expect(r.motivo).toBe("falha");
    expect(r.divergentes).toBe(0);
  });

  it("histórico truncado → motivo 'truncado'", async () => {
    const { sb } = sbComLinhas(100);
    const r = await conciliarAgora(sb, { pagina: 10, teto: 30 });
    expect(r.conciliavel).toBe(false);
    expect(r.motivo).toBe("truncado");
  });

  it("tudo lido → concilia e não tem motivo", async () => {
    const sb = async recurso => {
      if (/^sup_movimentos/.test(recurso) && /id=gt\.0/.test(recurso)) {
        return [{ id: 1, item_id: 1, lote_id: 10, tipo: "entrada", quantidade: 8 }];
      }
      if (/^sup_lotes/.test(recurso) && /id=gt\.0/.test(recurso)) {
        return [{ id: 10, item_id: 1, lote: "L1", quantidade: 8 }];
      }
      return [];
    };
    const r = await conciliarAgora(sb);
    expect(r.conciliavel).toBe(true);
    expect(r.motivo).toBeNull();
    expect(r.divergentes).toBe(0);
    expect(r.movimentosLidos).toBe(1);
  });
});
