// @vitest-environment node
// ═══════════════════════════════════════════════════════════
// A CATRACA DE ESCRITA PEGA O DEFEITO QUE A INSPIROU?
//
// 🔴 Catraca que nasce VERDE não provou nada. Esta nasceu verde (o projeto
// não tem furo hoje), então a prova tem de ser feita com o defeito posto de
// volta à mão — e é o que este arquivo faz: monta o formato exato de
// `pep_aprazamentos` em 16/10/2026 e exige que a regra acuse.
//
// A aplicação contra o banco de verdade está em `banco-novo-nasce.test.js`,
// depois do banco nascer. Aqui é a REGRA, com dados de mentira, para poder
// ser mutada em milissegundos em vez de reconstruir um banco a cada vez.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import path from "node:path";
import { furosDeEscrita, escritasDoCodigo, VERBO, NOME_DO_VERBO } from "./escritas-do-codigo.mjs";

const RAIZ = path.join(path.resolve(__dirname), "..", "src");

/** Atalho: `{ tabela: "x", verbos: "aw" }` vira o Map que a função espera. */
const mapa = (...pares) => new Map(pares.map(([t, v]) => [t, new Set(v.split(""))]));

describe("🔴 o defeito que deu origem à catraca, posto de volta", () => {
  // O formato exato de `pep_aprazamentos`: RLS ligado, política de SELECT,
  // política de INSERT, e NADA de UPDATE. A tela mandava PATCH.
  const COMO_ERA = [
    { tabela: "pep_aprazamentos", rls: true, cmd: "r", permissiva: true },
    { tabela: "pep_aprazamentos", rls: true, cmd: "a", permissiva: true },
    // a do RLS por módulo, que é RESTRITIVA e não concede nada
    { tabela: "pep_aprazamentos", rls: true, cmd: "w", permissiva: false },
  ];

  it("acusa o PATCH sem política de UPDATE", () => {
    const { furos } = furosDeEscrita(mapa(["pep_aprazamentos", "w"]), COMO_ERA);
    expect(furos).toHaveLength(1);
    expect(furos[0]).toMatch(/pep_aprazamentos.*UPDATE/);
  });

  it("🔴 e a política RESTRITIVA de UPDATE não salva — ela não concede nada", () => {
    // Era a armadilha: `pep_aprazamentos_mod_upd` existe, é de UPDATE, e
    // sozinha nega tudo. Uma catraca que só perguntasse "existe política de
    // update?" diria que está tudo bem.
    const soRestritiva = [
      { tabela: "t", rls: true, cmd: "a", permissiva: true },
      { tabela: "t", rls: true, cmd: "w", permissiva: false },
    ];
    expect(furosDeEscrita(mapa(["t", "w"]), soRestritiva).furos).toHaveLength(1);
  });

  it("com a política permissiva de UPDATE, não acusa", () => {
    const consertado = [...COMO_ERA,
      { tabela: "pep_aprazamentos", rls: true, cmd: "w", permissiva: true }];
    expect(furosDeEscrita(mapa(["pep_aprazamentos", "w"]), consertado).furos).toEqual([]);
  });
});

describe("as regras da catraca", () => {
  it("`for all` cobre os três verbos", () => {
    const tudo = [{ tabela: "t", rls: true, cmd: "*", permissiva: true }];
    expect(furosDeEscrita(mapa(["t", "awd"]), tudo).furos).toEqual([]);
  });

  it("política de INSERT não autoriza DELETE", () => {
    const soInsert = [{ tabela: "t", rls: true, cmd: "a", permissiva: true }];
    const { furos } = furosDeEscrita(mapa(["t", "ad"]), soInsert);
    expect(furos).toHaveLength(1);
    expect(furos[0]).toMatch(/DELETE/);
  });

  it("🔴 sem RLS ligado a escrita passa — não há política a cobrar", () => {
    // Muitas tabelas da Laura nascem sem RLS. Cobrar política delas encheria
    // a catraca de alarme falso, e alarme falso é o que ensina a equipe a
    // ignorar o alarme de verdade.
    const semRls = [{ tabela: "t", rls: false, cmd: null, permissiva: null }];
    expect(furosDeEscrita(mapa(["t", "awd"]), semRls).furos).toEqual([]);
  });

  it("tabela que o código escreve e o banco não tem é acusada à parte", () => {
    const r = furosDeEscrita(mapa(["nao_existe", "w"]), [{ tabela: "outra", rls: true, cmd: "*", permissiva: true }]);
    expect(r.inexistentes).toEqual(["nao_existe"]);
    expect(r.furos).toEqual([]);     // não é furo de política, é ausência
  });

  it("a mensagem nomeia a tabela E o verbo — sem isso não dá para agir", () => {
    const { furos } = furosDeEscrita(mapa(["t", "w"]),
      [{ tabela: "t", rls: true, cmd: "a", permissiva: true }]);
    expect(furos[0]).toContain("t ");
    expect(furos[0]).toContain("UPDATE");
  });
});

describe("a varredura do código", () => {
  it("🔴 não sobra chamada de escrita sem resolver", async () => {
    // "Não consegui ler" não vira "não há furo": é a mesma regra do
    // `listaLida` do resto do projeto.
    const { naoLidos } = await escritasDoCodigo(RAIZ);
    expect(naoLidos,
      `resolva em RESOLVIDOS_A_MAO:\n  ${naoLidos.join("\n  ")}`).toEqual([]);
  });

  it("acha as escritas de verdade, e não uma lista vazia", async () => {
    const { escritas } = await escritasDoCodigo(RAIZ);
    expect(escritas.size).toBeGreaterThan(80);
    // uma tabela que o módulo de atendimento escreve, como controle
    expect([...(escritas.get("at_contas") || [])].sort()).toContain("w");
  });

  it("🔴 `rpc/` não entra: quem escreve é a função, com as políticas dela", async () => {
    const { escritas } = await escritasDoCodigo(RAIZ);
    expect(escritas.has("rpc")).toBe(false);
  });

  it("o mapa de verbo bate com as letras do Postgres", () => {
    expect(VERBO).toEqual({ POST: "a", PATCH: "w", PUT: "w", DELETE: "d" });
    expect(NOME_DO_VERBO.w).toBe("UPDATE");
  });
});
