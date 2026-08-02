// ═══════════════════════════════════════════════════════════
// O SEED DO SQL E O CATÁLOGO DO CÓDIGO PRECISAM BATER
//
// Existem duas fontes descrevendo os mesmos perfis:
//   • `src/acesso/modulos.js`            — o que a tela usa
//   • `supabase/migracao-perfis-acesso.sql` — o que vai para o banco
//
// Duas fontes da mesma verdade divergem — é questão de tempo. E a
// divergência aqui é traiçoeira: alguém amplia um grant no código, esquece
// o SQL, e o hospital que subir um banco novo recebe um perfil mais
// restrito (ou mais permissivo) do que o testado. Ninguém percebe, porque
// nada quebra.
//
// É o mesmo defeito que `contrato-banco.test.js` pegou no PEP — código e
// banco descrevendo coisas diferentes sem ninguém notar. Aqui a conferência
// é feita antes de virar problema.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PERFIS_MODELO, MODULOS } from "./modulos.js";
import { esperados, gerarSql as gerarConferencia } from "../../supabase/gerar-conferencia-perfis.mjs";

const SQL = fs.readFileSync(
  path.join(process.cwd(), "supabase", "migracao-perfis-acesso.sql"), "utf8");

// ── o que o SQL declara ─────────────────────────────────────
const perfisNoSql = new Set();
for (const [, chave] of SQL.matchAll(/^\s*\('([a-z_]+)',\s*'[^']*',\s*'[^']*',/gm)) perfisNoSql.add(chave);

const grantsNoSql = {};
for (const [, perfil, modulo, nivel] of SQL.matchAll(/\('([a-z_]+)','([a-z_]+)','(leitura|escrita)'\)/g)) {
  (grantsNoSql[perfil] ||= {})[modulo] = nivel;
}

it("o parser leu o SQL (não passou vazio em silêncio)", () => {
  expect(perfisNoSql.size).toBeGreaterThan(10);
  expect(Object.keys(grantsNoSql).length).toBeGreaterThan(10);
});

describe("todo perfil do código existe no seed", () => {
  for (const p of PERFIS_MODELO) {
    it(`${p.chave} está no SQL`, () => {
      expect(perfisNoSql.has(p.chave), `falta INSERT de '${p.chave}' em migracao-perfis-acesso.sql`).toBe(true);
    });
  }
});

describe("as permissões batem, grant por grant", () => {
  for (const p of PERFIS_MODELO) {
    it(`${p.chave} — mesmos módulos e mesmos níveis`, () => {
      const noCodigo = p.grants;
      const noSql = grantsNoSql[p.chave] || {};
      // ordena para a mensagem de erro dizer exatamente o que sobrou/faltou
      expect(Object.keys(noSql).sort()).toEqual(Object.keys(noCodigo).sort());
      for (const [modulo, nivel] of Object.entries(noCodigo))
        expect(noSql[modulo], `${p.chave}.${modulo}`).toBe(nivel);
    });
  }
});

describe("o seed não inventa nada", () => {
  it("todo perfil do SQL existe no código (fora o provisório de migração)", () => {
    const doCodigo = new Set(PERFIS_MODELO.map(p => p.chave));
    const extras = [...perfisNoSql].filter(c => !doCodigo.has(c) && c !== "provisorio");
    expect(extras).toEqual([]);
  });

  it("todo módulo citado no SQL existe no catálogo", () => {
    const validos = new Set(MODULOS.map(m => m.chave));
    const invalidos = [];
    for (const [perfil, grants] of Object.entries(grantsNoSql))
      for (const modulo of Object.keys(grants))
        if (!validos.has(modulo)) invalidos.push(`${perfil}.${modulo}`);
    expect(invalidos).toEqual([]);
  });
});

// ── A migração avulsa do NSP ────────────────────────────────
// `migracao-perfis-nsp.sql` existe porque os dois bancos já rodaram o seed
// e re-executá-lo recriaria as políticas `for all` que o RLS de leitura
// desarma. O preço de ter dois arquivos concedendo a mesma coisa é este
// teste: eles não podem divergir.
describe("os grants de NSP da migração avulsa", () => {
  const SQL_NSP = fs.readFileSync(
    path.join(process.cwd(), "supabase", "migracao-perfis-nsp.sql"), "utf8");

  const nspNaAvulsa = {};
  for (const [, perfil, nivel] of SQL_NSP.matchAll(/\('([a-z_]+)',\s*'nsp',\s*'(leitura|escrita)'\)/g))
    nspNaAvulsa[perfil] = nivel;

  const nspNoCodigo = {
    ...Object.fromEntries(PERFIS_MODELO.filter(p => p.grants.nsp).map(p => [p.chave, p.grants.nsp])),
    // `provisorio` não existe no catálogo do código — é só da migração.
    provisorio: "escrita",
  };

  it("o parser leu o arquivo", () => {
    expect(Object.keys(nspNaAvulsa).length).toBeGreaterThan(5);
  });

  // A lição que custou um susto: `ti` e `provisorio` estavam no seed havia
  // semanas e em NENHUM dos dois bancos, porque `on conflict do nothing` não
  // volta para inserir linha nova num banco que já rodou a migração. O
  // Provisório é o que segura a equipe inteira hoje — sem ele aqui, fechar o
  // RLS tiraria o NSP de todo mundo de uma vez.
  it("inclui ti e provisorio, que o seed declarava e os bancos não tinham", () => {
    expect(nspNaAvulsa.ti, "sem isto o adm_master não enxerga o NSP").toBe("escrita");
    expect(nspNaAvulsa.provisorio, "sem isto a equipe inteira perde o NSP").toBe("escrita");
  });

  it("batem com o catálogo do código, perfil por perfil", () => {
    expect(Object.keys(nspNaAvulsa).sort()).toEqual(Object.keys(nspNoCodigo).sort());
    for (const [perfil, nivel] of Object.entries(nspNoCodigo))
      expect(nspNaAvulsa[perfil], perfil).toBe(nivel);
  });

  it("notificar é escrita para quem presta cuidado (RDC 36/2013, art. 8º)", () => {
    for (const perfil of ["medico", "enfermeiro", "tecnico_enfermagem", "farmaceutico", "recepcao"])
      expect(nspNaAvulsa[perfil], perfil).toBe("escrita");
  });
});

// ── A conferência de perfis ─────────────────────────────────
// Este teste guarda o gerador; quem pega a divergência de verdade é o SQL
// que ele produz, rodado no banco. Teste automatizado não alcança o banco —
// foi exatamente essa fresta que deixou `ti.nsp` faltando por semanas.
describe("conferencia-perfis.sql", () => {
  it("está em dia com o catálogo (rode: node supabase/gerar-conferencia-perfis.mjs)", () => {
    const sqlPerfis = fs.readFileSync(
      path.join(process.cwd(), "supabase", "migracao-perfis-acesso.sql"), "utf8");
    const noDisco = fs.readFileSync(
      path.join(process.cwd(), "supabase", "conferencia-perfis.sql"), "utf8");
    expect(noDisco.replace(/\r\n/g, "\n"))
      .toBe(gerarConferencia(esperados(sqlPerfis)).replace(/\r\n/g, "\n"));
  });
});

describe("o perfil provisório da migração", () => {
  it("existe — sem ele a equipe abriria o sistema vazio no dia seguinte", () => {
    expect(perfisNoSql.has("provisorio")).toBe(true);
  });

  it("NÃO concede o módulo de Usuários — só adm_master administra acesso", () => {
    expect(grantsNoSql.provisorio?.users).toBeUndefined();
  });

  it("cobre os módulos operacionais, para a migração ser invisível", () => {
    for (const m of ["paciente", "ps", "farmacia", "suprimentos", "leitos"])
      expect(grantsNoSql.provisorio?.[m], m).toBe("escrita");
  });
});
