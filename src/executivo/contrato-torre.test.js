// ═══════════════════════════════════════════════════════════
// CONTRATO ENTRE A TORRE DE COMANDO E O BANCO
//
// A Torre faz ONZE leituras, de nove módulos. É a tela que mais depende de
// nomes de coluna estarem certos — e a que menos perdoa errar, porque o
// `sbFetch` engole a recusa do PostgREST e devolve `null`. Uma coluna com
// nome errado não estoura: vira "não consegui ler" num card da diretoria,
// para sempre, sem ninguém entender por quê.
//
// Este teste nasceu do mesmo defeito que o `contrato-vigilancia.test.js` da
// Maternidade pegou na primeira execução. Onze consultas é onde a chance de
// repetir sobe.
//
// Não faz rede: injeta um `sb` falso que captura o que SERIA enviado e
// confere contra `supabase/auditoria-banco.sql`, gerado das migrações.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { carregarTorre, diasAtras } from "./dados.js";

const AUDITORIA = fs.readFileSync(
  path.join(process.cwd(), "supabase", "auditoria-banco.sql"), "utf8");

const COLUNAS = {};
for (const [, tabela, coluna] of AUDITORIA.matchAll(/\('([a-z0-9_]+)','([a-z0-9_]+)','[^']*'\)/g)) {
  (COLUNAS[tabela] ||= new Set()).add(coluna);
}

it("a auditoria foi lida (o parser não quebrou em silêncio)", () => {
  expect(Object.keys(COLUNAS).length).toBeGreaterThan(30);
  // Sentinelas das nove fontes: se a auditoria estiver velha, o contrato
  // inteiro conferiria contra um banco que não é este.
  expect(COLUNAS.leitos?.has("setor")).toBe(true);
  expect(COLUNAS.leitos_saidas?.has("dias_permanencia")).toBe(true);
  expect(COLUNAS.ps_atendimentos?.has("origem_detalhe")).toBe(true);
  expect(COLUNAS.cc_cirurgias?.has("cancelamento_motivo")).toBe(true);
  expect(COLUNAS.ag_grades?.has("vagas_regulacao")).toBe(true);
  expect(COLUNAS.sup_lotes?.has("quantidade")).toBe(true);
  expect(COLUNAS.farm_lotes?.has("medicamento_id")).toBe(true);
});

/** `sb` falso: responde conforme a tabela pedida e guarda as chamadas. */
function espiao(respostas = {}) {
  const chamadas = [];
  const sb = async (recurso) => {
    chamadas.push(recurso);
    const tabela = String(recurso).split("?")[0];
    if (!(tabela in respostas)) return [];
    const r = respostas[tabela];
    if (r === null) throw new Error("recusado pelo banco");
    return r;
  };
  return { sb, chamadas };
}

/** Confere que tabela e colunas do `select` existem de verdade. */
function conferirLeitura(recurso) {
  const [tabela, query = ""] = String(recurso).split("?");
  expect(COLUNAS[tabela], `tabela '${tabela}' não existe na auditoria`).toBeDefined();
  const select = new URLSearchParams(query).get("select") || "";
  for (const col of select.split(",").filter(Boolean)) {
    if (col === "*") continue;
    expect(COLUNAS[tabela].has(col), `${tabela}.${col} não existe no banco`).toBe(true);
  }
}

/** As colunas usadas em filtro/ordenação também precisam existir. */
function conferirFiltros(recurso) {
  const [tabela, query = ""] = String(recurso).split("?");
  const p = new URLSearchParams(query);
  const order = (p.get("order") || "").split(",").filter(Boolean).map(o => o.split(".")[0]);
  for (const col of order) {
    expect(COLUNAS[tabela].has(col), `${tabela}.${col} (order) não existe no banco`).toBe(true);
  }
  for (const [chave] of p.entries()) {
    if (["select", "order", "limit", "offset", "or", "and"].includes(chave)) continue;
    expect(COLUNAS[tabela].has(chave), `${tabela}.${chave} (filtro) não existe no banco`).toBe(true);
  }
  // O `or=(a.gte.x,b.neq.y)` esconde nomes de coluna dentro do valor.
  const or = p.get("or");
  if (or) {
    for (const [, col] of or.matchAll(/([a-z0-9_]+)\.(?:eq|neq|gte|lte|gt|lt|is|in)\./g)) {
      expect(COLUNAS[tabela].has(col), `${tabela}.${col} (or) não existe no banco`).toBe(true);
    }
  }
}

const HOJE = new Date("2026-09-14T12:00:00");

describe("carregarTorre — o que vai para o banco", () => {
  it("as onze leituras acontecem, e toda tabela/coluna existe", async () => {
    const { sb, chamadas } = espiao();
    await carregarTorre(sb, { hoje: HOJE });
    expect(chamadas).toHaveLength(11);
    for (const c of chamadas) { conferirLeitura(c); conferirFiltros(c); }
  });

  it("cirurgia e agenda são do DIA; saídas são da janela", async () => {
    const { sb, chamadas } = espiao();
    await carregarTorre(sb, { hoje: HOJE, janelaDias: 90 });
    expect(chamadas.find(c => c.startsWith("cc_cirurgias"))).toContain("data=eq.2026-09-14");
    expect(chamadas.find(c => c.startsWith("ag_agendamentos"))).toContain("data=eq.2026-09-14");
    expect(chamadas.find(c => c.startsWith("leitos_saidas"))).toContain("data_alta=gte.2026-06-16");
  });

  it("🔴 o PS traz o que está ABERTO, não só o que chegou na janela", async () => {
    // Quem chegou ontem à noite e ainda não foi atendido é exatamente o caso
    // que o painel precisa mostrar — um recorte só por data o perderia.
    const { sb, chamadas } = espiao();
    await carregarTorre(sb, { hoje: HOJE });
    const ps = chamadas.find(c => c.startsWith("ps_atendimentos"));
    expect(ps).toContain("status.neq.finalizado");
  });
});

describe("carregarTorre — leitura que falhou não é lista vazia", () => {
  it("cada fonte carrega o próprio `lido`", async () => {
    const { sb } = espiao({ leitos: null, sup_lotes: null });
    const r = await carregarTorre(sb, { hoje: HOJE });
    expect(r.leitos.lido).toBe(false);
    expect(r.supLotes.lido).toBe(false);
    // as outras nove continuam válidas — uma recusa não derruba a tela
    expect(r.setores.lido).toBe(true);
    expect(r.cirurgias.lido).toBe(true);
  });

  it("uma fonte recusada não impede as outras de chegarem", async () => {
    const { sb } = espiao({
      leitos: null,
      setores: [{ nome: "UTI Adulto", ordem: 1 }],
    });
    const r = await carregarTorre(sb, { hoje: HOJE });
    expect(r.leitos.lista).toEqual([]);
    expect(r.setores.lista).toHaveLength(1);
  });

  it("🔴 sem sb, TUDO é não-lido — nunca um painel de zeros", async () => {
    const r = await carregarTorre(null, { hoje: HOJE });
    expect(r.semConexao).toBe(true);
    for (const chave of ["leitos", "setores", "saidas", "ps", "cirurgias", "grades",
                         "agendamentos", "supItens", "supLotes", "farmItens", "farmLotes"]) {
      expect(r[chave].lido, `${chave} deveria ser não-lido`).toBe(false);
    }
  });
});

describe("diasAtras", () => {
  it("anda para trás no calendário, inclusive virando o mês", () => {
    expect(diasAtras(1, new Date("2026-09-01T12:00:00"))).toBe("2026-08-31");
    expect(diasAtras(90, new Date("2026-09-14T12:00:00"))).toBe("2026-06-16");
    expect(diasAtras(0, new Date("2026-09-14T12:00:00"))).toBe("2026-09-14");
  });
});
