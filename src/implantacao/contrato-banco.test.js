// ═══════════════════════════════════════════════════════════
// CONTRATO ENTRE O CHECKLIST E O BANCO
//
// Mesmo teste que existe na Recepção e no PEP, por um motivo parecido mas
// não idêntico. Aqui nada é gravado — o risco é outro e mais silencioso:
// se uma tabela ou coluna for renomeada, o PostgREST recusa o SELECT, o
// `sbFetch` devolve `null`, e o checklist mostra "não foi possível
// conferir" para sempre. Ninguém abre chamado por causa de um card cinza:
// a implantação simplesmente para de ser cobrada, e o módulo continua
// dormente sem que nada acuse.
//
// Não faz rede — injeta um `sb` falso que captura o que SERIA consultado e
// confere cada nome contra `supabase/auditoria-banco.sql`, gerado a partir
// das migrações (`node supabase/gerar-auditoria.mjs`).
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CADASTROS_BASE } from "./checklist.js";
import { contarCadastros, consultaDe, colunasDe, TETO } from "./dados.js";

const AUDITORIA = fs.readFileSync(
  path.join(process.cwd(), "supabase", "auditoria-banco.sql"), "utf8");

const COLUNAS = {};
for (const [, tabela, coluna] of AUDITORIA.matchAll(/\('([a-z0-9_]+)','([a-z0-9_]+)','[^']*'\)/g)) {
  (COLUNAS[tabela] ||= new Set()).add(coluna);
}

it("a auditoria foi lida (o parser não quebrou em silêncio)", () => {
  expect(Object.keys(COLUNAS).length).toBeGreaterThan(30);
  // As quatro tabelas do checklist precisam estar na auditoria; sem isto o
  // contrato passaria conferindo contra um arquivo vazio.
  expect(COLUNAS.setores?.has("nome")).toBe(true);
  expect(COLUNAS.cc_salas?.has("ativa")).toBe(true);
  expect(COLUNAS.sup_fornecedores?.has("ativo")).toBe(true);
  expect(COLUNAS.scih_germes?.has("tipo")).toBe(true);
});

describe("o catálogo cita tabela e coluna que existem no banco", () => {
  for (const c of CADASTROS_BASE) {
    it(`${c.chave} → ${c.tabela}`, () => {
      expect(COLUNAS[c.tabela], `tabela ${c.tabela} não está na auditoria`).toBeTruthy();
      expect(COLUNAS[c.tabela].has(c.select), `${c.tabela}.${c.select}`).toBe(true);
      if (c.colunaAtivo) {
        expect(COLUNAS[c.tabela].has(c.colunaAtivo), `${c.tabela}.${c.colunaAtivo}`).toBe(true);
      }
    });
  }

  it("declara coluna de ativo exatamente onde a tabela tem uma", () => {
    // O oposto também é defeito: declarar `colunaAtivo: null` numa tabela
    // que TEM a coluna faria o checklist contar sala desativada como sala
    // — e o Bloco continuaria vazio com o item marcado como feito.
    for (const c of CADASTROS_BASE) {
      const tem = COLUNAS[c.tabela].has("ativo") || COLUNAS[c.tabela].has("ativa");
      expect(!!c.colunaAtivo, `${c.tabela} tem coluna de ativo? ${tem}`).toBe(tem);
    }
  });
});

// O padrão só vale quando NADA é passado — um `= [...]` na assinatura
// engoliria `espiao(undefined)` e devolveria sucesso justamente no caso que
// se quer testar.
function espiao(...args) {
  const resposta = args.length ? args[0] : [{ nome: "UTI" }];
  const chamadas = [];
  const sb = async recurso => { chamadas.push(recurso); return resposta; };
  return { sb, chamadas };
}

describe("contarCadastros", () => {
  it("pergunta as quatro tabelas, só as colunas necessárias e com teto", async () => {
    const { sb, chamadas } = espiao();
    await contarCadastros(sb);
    expect(chamadas).toHaveLength(4);
    for (const c of CADASTROS_BASE) {
      expect(chamadas).toContain(consultaDe(c));
    }
    // Nada de `select=*`: o checklist só precisa saber se existe.
    expect(chamadas.every(q => !q.includes("select=*"))).toBe(true);
    expect(chamadas.every(q => q.includes(`limit=${TETO}`))).toBe(true);
  });

  it("monta a lista de colunas sem vírgula solta quando não há ativo", () => {
    const setores = CADASTROS_BASE.find(c => c.tabela === "setores");
    expect(colunasDe(setores)).toBe("nome");
    const salas = CADASTROS_BASE.find(c => c.tabela === "cc_salas");
    expect(colunasDe(salas)).toBe("nome,ativa");
  });

  it("não grava nada — o checklist só aponta o caminho", async () => {
    const chamadas = [];
    const sb = async (recurso, opcoes) => { chamadas.push({ recurso, opcoes }); return []; };
    await contarCadastros(sb);
    expect(chamadas.every(c => c.opcoes === undefined)).toBe(true);
  });

  it("resposta que não é lista vira null, não zero", async () => {
    // É a diferença entre "não tem cadastro" e "não deu para perguntar".
    const { sb } = espiao(null);
    const r = await contarCadastros(sb);
    expect(Object.values(r).every(v => v === null)).toBe(true);
  });

  it("uma consulta que estoura não derruba as outras três", async () => {
    const sb = async recurso => {
      if (recurso.startsWith("sup_fornecedores")) throw new Error("rede caiu");
      return [{ nome: "UTI" }];
    };
    const r = await contarCadastros(sb);
    expect(r.fornecedores).toBeNull();
    expect(r.setores).toHaveLength(1);
    expect(r.salas).toHaveLength(1);
    expect(r.germes).toHaveLength(1);
  });
});
