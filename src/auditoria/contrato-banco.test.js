// ═══════════════════════════════════════════════════════════
// CONTRATO ENTRE A TRILHA E O BANCO
//
// Aqui a leitura é que importa: se uma coluna sumir do `select`, o
// PostgREST devolve erro, o `sbFetch` vira `null`, e a tela de auditoria
// passa a dizer "não foi possível ler" para sempre. Numa tela cuja função
// é provar o que aconteceu, isso equivale a perder a trilha — sem que
// ninguém perceba, porque a mensagem parece um problema momentâneo.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { consultaTrilha, carregarTrilha, diaSeguinte, COLUNAS, PAGINA } from "./dados.js";

const AUDITORIA = fs.readFileSync(
  path.join(process.cwd(), "supabase", "auditoria-banco.sql"), "utf8");

const COLS = {};
for (const [, tabela, coluna] of AUDITORIA.matchAll(/\('([a-z0-9_]+)','([a-z0-9_]+)','[^']*'\)/g)) {
  (COLS[tabela] ||= new Set()).add(coluna);
}

it("a auditoria foi lida (o parser não quebrou em silêncio)", () => {
  expect(Object.keys(COLS).length).toBeGreaterThan(30);
  // Coluna criada pela migração desta correção: se a auditoria não foi
  // regenerada, este contrato estaria conferindo contra um banco velho.
  expect(COLS.auditoria?.has("usuario_id")).toBe(true);
});

describe("as colunas lidas existem no banco", () => {
  for (const c of COLUNAS.split(",")) {
    it(`auditoria.${c}`, () => expect(COLS.auditoria.has(c)).toBe(true));
  }
});

describe("consultaTrilha", () => {
  it("pagina por chave, nunca por offset", () => {
    // Offset numa tabela que recebe inserção durante a leitura pula e
    // repete linha — e um registro pulado numa auditoria é justamente o
    // que não vai aparecer para quem procura.
    const q = consultaTrilha({ antesDeId: 500 });
    expect(q).toContain("id=lt.500");
    expect(q).not.toContain("offset");
    expect(q).toContain("order=id.desc");
  });

  it("primeira página não filtra por id", () => {
    expect(consultaTrilha({})).not.toContain("id=lt.");
  });

  it("respeita o limite", () => {
    expect(consultaTrilha({})).toContain(`limit=${PAGINA}`);
    expect(consultaTrilha({ limite: 25 })).toContain("limit=25");
  });

  it("busca em usuário E alvo", () => {
    const q = consultaTrilha({ texto: "Laura" });
    expect(q).toContain("usuario.ilike");
    expect(q).toContain("alvo.ilike");
  });

  it("🔴 texto do usuário não vira sintaxe do filtro", () => {
    // Vírgula e parêntese fecham o `or=(...)` e a consulta passa a
    // significar outra coisa — ou simplesmente estoura em 400 sempre que
    // alguém digitar "Maria, João".
    const q = consultaTrilha({ texto: "Maria, João (teste)" });
    expect(q).not.toMatch(/or=\([^&]*,[^&]*,/);
    expect(q).not.toContain("(teste)");
  });

  it("sem texto não acrescenta filtro de busca", () => {
    expect(consultaTrilha({ texto: "   " })).not.toContain("ilike");
  });

  it("período usa `lt` no dia seguinte, não `lte` no dia final", () => {
    // Com `lte` num horário fixo, quem agiu às 23h59 fica de fora do
    // próprio dia — o mesmo defeito de borda que já apareceu no PS.
    const q = consultaTrilha({ de: "2026-08-01", ate: "2026-08-20" });
    expect(q).toContain("ts=gte.2026-08-01T00:00:00");
    expect(q).toContain("ts=lt.2026-08-21T00:00:00");
  });
});

describe("diaSeguinte", () => {
  it("avança um dia", () => expect(diaSeguinte("2026-08-20")).toBe("2026-08-21"));
  it("vira o mês", () => expect(diaSeguinte("2026-08-31")).toBe("2026-09-01"));
  it("vira o ano", () => expect(diaSeguinte("2026-12-31")).toBe("2027-01-01"));
  it("ano bissexto", () => expect(diaSeguinte("2028-02-28")).toBe("2028-02-29"));
  it("entrada inválida não vira NaN na consulta", () => {
    expect(diaSeguinte("")).toBe("");
    expect(diaSeguinte("abc")).toBe("abc");
  });
});

describe("carregarTrilha", () => {
  it("não grava nada — auditoria só se lê", async () => {
    const chamadas = [];
    const sb = async (r, o) => { chamadas.push({ r, o }); return []; };
    await carregarTrilha(sb);
    expect(chamadas.every(c => c.o === undefined)).toBe(true);
  });

  it("🔴 falha devolve null, não lista vazia", async () => {
    const r = await carregarTrilha(async () => null);
    expect(r.linhas).toBeNull();
    expect(r.temMais).toBe(false);
  });

  it("consulta que estoura vira null, não exceção", async () => {
    const r = await carregarTrilha(async () => { throw new Error("rede"); });
    expect(r.linhas).toBeNull();
  });

  it("página cheia indica que há mais", async () => {
    const cheia = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));
    const r = await carregarTrilha(async () => cheia, { limite: 10 });
    expect(r.temMais).toBe(true);
  });

  it("página incompleta indica o fim", async () => {
    const r = await carregarTrilha(async () => [{ id: 1 }], { limite: 10 });
    expect(r.temMais).toBe(false);
    expect(r.linhas).toHaveLength(1);
  });
});
