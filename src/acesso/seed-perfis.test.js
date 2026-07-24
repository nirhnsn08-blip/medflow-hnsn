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
