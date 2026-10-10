// @vitest-environment node
// ═══════════════════════════════════════════════════════════
// O BANCO NOVO NASCE?
//
// 🔴 ESTE TESTE NASCEU DE UM DEFEITO QUE ESTAVA LÁ E NINGUÉM VIA (08/10/2026).
//
// `reconstruir-banco.sql` é o ÚNICO caminho do hospital novo — e o sistema é
// para venda, então banco novo não é cenário hipotético: é o primeiro dia de
// cada cliente. Pois bem: o arquivo não rodava. Morria na declaração 1013 de
// 1846, a 55% do caminho, em `at_glosas_leitura`:
//
//     function public.pode_ver_algum(unknown) does not exist
//
// As cinco funções de permissão moravam dentro do `migracao-rls-leitura.sql`,
// que fecha a ordem de propósito (ele reescreve as políticas de SELECT de
// tudo que veio antes). Mas 24 políticas criadas no MEIO do caminho já as
// citavam, e `create policy` resolve a função na hora da criação. O conserto
// foi `migracao-acesso-funcoes.sql`, cedo na ordem.
//
// 🔴 POR QUE ISSO PASSOU ANOS INVISÍVEL
// `migracoes-na-ordem.test.js` confere que toda migração ESTÁ no arquivo
// gerado, e `validar-sql.mjs` confere integridade estrutural (parênteses,
// `create table` perdido). Nenhum dos dois EXECUTA nada. Presença não é
// funcionamento — foi a mesma lição do `chk_sign_in` que gravava `true` sem
// nada ir para o banco.
//
// Aqui o arquivo roda de verdade, num Postgres de verdade (PGlite é Postgres
// compilado para WASM), declaração por declaração, e para na primeira que
// falhar dizendo QUAL é.
//
// ⚠️ O QUE ESTE TESTE NÃO PROVA
//   • CONCORRÊNCIA. PGlite tem UMA conexão. Foi exatamente por isso que uma
//     recusa por corrida passou por "provada" no PR #261 e estava errada.
//   • O ambiente do Supabase: o schema `auth`, os papéis e as extensões são
//     substituídos abaixo. O que se prova é a ESTRUTURA do schema `public`.
//   • Dado. Nenhuma linha é inserida — é a DDL que está sob teste.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const DIR = path.resolve(__dirname);
const ARQUIVO = path.join(DIR, "reconstruir-banco.sql");

/**
 * O que o Supabase dá pronto e o PGlite não tem.
 *
 * ⚠️ Substituto, não remendo: cada linha aqui existe para que a DDL que
 * DEPENDE daquilo rode (a coluna gerada da busca, o índice, o comentário).
 * O `unaccent` é o caso que ensina: pular a função fazia a coluna gerada
 * `nome_busca` não existir, e o erro aparecia 3 declarações depois, num
 * `comment on column` — longe da causa.
 */
const PRELUDIO = `
  create schema if not exists auth;
  create schema if not exists extensions;
  create table if not exists auth.users (id uuid primary key, email text);
  create or replace function auth.uid() returns uuid language sql stable as $u$
    select '00000000-0000-0000-0000-000000000001'::uuid $u$;
  create or replace function auth.role() returns text language sql stable as $u$
    select 'authenticated'::text $u$;

  create text search dictionary unaccent (template = pg_catalog.simple);
  create or replace function public.unaccent(txt text) returns text
    language sql immutable strict parallel safe as $u$
    select translate(txt,
      'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
      'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN') $u$;
  create or replace function public.unaccent(d regdictionary, txt text) returns text
    language sql immutable strict parallel safe as $u$ select public.unaccent(txt) $u$;

  do $r$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon')          then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role')  then create role service_role; end if;
  end $r$;
`;

/**
 * O que o PGlite genuinamente não consegue — e NADA ALÉM DISSO.
 *
 * A lista é curta e conferida por contagem no fim do teste: tolerar em
 * silêncio é como este defeito sobreviveu. Declaração nova caindo aqui faz
 * o teste falhar pedindo que alguém OLHE, em vez de passar verde.
 */
const TOLERADO = [
  { re: /create\s+extension/i, por: "PGlite não embarca extensões (btree_gist, unaccent)" },
  { re: /using\s+gist/i, por: "constraint de exclusão depende de btree_gist" },
  { re: /trgm/i, por: "PGlite não embarca pg_trgm" },
];
const TOLERADAS_ESPERADAS = 4;

/**
 * Corta o SQL em declarações respeitando `$tag$ ... $tag$` e strings.
 *
 * ⚠️ Não serve um `split(";")`: o arquivo é quase todo corpo de função e
 * bloco `do $$`, cheios de ponto-e-vírgula por dentro.
 */
export function declaracoes(sql) {
  const out = [];
  let atual = "", i = 0, tag = null, aspas = false;
  while (i < sql.length) {
    if (tag) {
      if (sql.startsWith(tag, i)) { atual += tag; i += tag.length; tag = null; continue; }
      atual += sql[i++]; continue;
    }
    if (aspas) {
      if (sql[i] === "'" && sql[i + 1] === "'") { atual += "''"; i += 2; continue; }
      if (sql[i] === "'") { aspas = false; atual += sql[i++]; continue; }
      atual += sql[i++]; continue;
    }
    if (sql[i] === "'") { aspas = true; atual += sql[i++]; continue; }
    if (sql[i] === "-" && sql[i + 1] === "-") { while (i < sql.length && sql[i] !== "\n") i++; continue; }
    const m = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i));
    if (m) { tag = m[0]; atual += tag; i += tag.length; continue; }
    if (sql[i] === ";") { out.push(atual.trim()); atual = ""; i++; continue; }
    atual += sql[i++];
  }
  if (atual.trim()) out.push(atual.trim());
  return out.filter(Boolean);
}

/**
 * Só a PARTE 3 — a estrutura.
 *
 * As partes 0 a 2 são a trava de confirmação, o backup dos perfis e o
 * `drop schema public cascade`: num banco vazio não há o que preservar, e a
 * trava é deliberadamente uma exceção. A PARTE 4 restaura os perfis
 * preservados, que aqui não existem.
 */
function parte3() {
  const bruto = fs.readFileSync(ARQUIVO, "utf8");
  const i = bruto.indexOf("PARTE 3/4");
  const j = bruto.indexOf("PARTE 4/4");
  if (i < 0 || j < i) throw new Error("não achei a PARTE 3 no reconstruir-banco.sql");
  // Começa DEPOIS da linha do banner: cortar no meio dela deixaria o texto
  // do comentário sem o `--` e ele viraria SQL.
  return bruto.slice(bruto.indexOf("\n", i), j);
}

describe("reconstruir-banco.sql roda num Postgres de verdade", () => {
  it("🔴 as declarações da PARTE 3 rodam todas — o banco novo nasce", async () => {
    const cmds = declaracoes(parte3());
    // Se este número despencar, o recorte quebrou e o teste passaria sem
    // provar nada — vazio é a mentira que este projeto mais caça.
    expect(cmds.length).toBeGreaterThan(1500);

    const db = new PGlite();
    const ignoradas = [];
    try {
      await db.exec(PRELUDIO);

      let n = 0;
      for (const c of cmds) {
        n++;
        try {
          await db.exec(c);
        } catch (e) {
          const t = TOLERADO.find(x => x.re.test(c));
          if (t) { ignoradas.push(`#${n} ${t.por}`); continue; }
          // A mensagem é para quem acabou de criar a migração: diz ONDE
          // morreu e com qual comando, que é o que falta quando o erro
          // aparece só no painel do Supabase com o banco pela metade.
          throw new Error(
            `o banco novo MORREU na declaração ${n} de ${cmds.length} ` +
            `(${Math.round((100 * n) / cmds.length)}% do script):\n\n` +
            `  ${String(e.message).split("\n")[0]}\n\n` +
            `  comando:\n  ${c.slice(0, 400).replace(/\n/g, "\n  ")}\n\n` +
            `→ quase sempre é ORDEM: algo citado antes de existir. ` +
            `Confira a posição em supabase/gerar-reconstrucao.mjs (ORDEM) ` +
            `e rode \`node supabase/gerar-reconstrucao.mjs\`.`);
        }
      }

      // ⚠️ Contagem exata, de propósito. Se uma declaração nova cair na
      // lista de toleradas, este número muda e alguém TEM de olhar: foi
      // tolerância silenciosa que deixou o defeito original sobreviver.
      expect(ignoradas.length,
        `declarações toleradas mudaram:\n  ${ignoradas.join("\n  ")}\n` +
        "→ se for mais um limite real do PGlite, atualize TOLERADAS_ESPERADAS " +
        "com o motivo no comentário. Se não for, é defeito."
      ).toBe(TOLERADAS_ESPERADAS);

      // E o banco tem de ter NASCIDO, não só não ter dado erro.
      const t = await db.query(
        "select count(*)::int n from information_schema.tables where table_schema = 'public'");
      expect(t.rows[0].n).toBeGreaterThan(100);

      // 🔴 A função que faltava, no banco que acabou de nascer — e
      // RESPONDENDO, não só existindo: corpo `language sql` que cite tabela
      // ausente é criado e só estoura no primeiro uso, dentro de uma
      // política de RLS, com o hospital aberto.
      const r = await db.query("select public.pode_ver_algum('overview') as ok");
      expect(r.rows[0].ok).not.toBeNull();
    } finally {
      await db.close();
    }
  }, 120_000);
});

describe("as funções de permissão nascem ANTES de quem as usa", () => {
  const texto = () => fs.readFileSync(ARQUIVO, "utf8");

  /**
   * Guarda estático, além da execução acima — e os dois juntos não são
   * redundância: este aponta o DEDO para a causa (a ordem), enquanto o de
   * cima diz só que morreu. Quem lê o vermelho precisa das duas coisas.
   */
  it("🔴 a definição vem antes do primeiro uso em política", () => {
    // ⚠️ SEM os comentários, e isto foi achado na primeira execução: o
    // cabeçalho do `migracao-acesso-funcoes.sql` EXPLICA o defeito citando
    // `public.pode_ver_algum(...)` em prosa, e o teste acusava a própria
    // explicação como se fosse uma política. É o mesmo tropeço que
    // `migracoes-na-ordem.test.js` já documenta: neste projeto o arquivo
    // conta a história do bug, então asserção crua acha a frase errada.
    const sql = texto().split(/\r?\n/).map(l => l.replace(/--.*$/, "")).join("\n");
    const definicao = sql.indexOf("create or replace function public.pode_ver_algum");
    expect(definicao, "não achei a definição de pode_ver_algum").toBeGreaterThan(0);

    // Os USOS — tirando as próprias linhas de definição, que também contêm
    // o nome seguido de parêntese.
    const usos = [...sql.matchAll(/public\.pode_ver_algum\(/g)]
      .map(m => m.index)
      .filter(i => !/function\s+$/.test(sql.slice(Math.max(0, i - 30), i)));
    expect(usos.length, "ninguém usa pode_ver_algum — o recorte quebrou").toBeGreaterThan(20);

    expect(Math.min(...usos),
      "política de RLS cita public.pode_ver_algum ANTES de a função existir — " +
      "o banco novo morre ali. Veja migracao-acesso-funcoes.sql na ORDEM."
    ).toBeGreaterThan(definicao);
  });

  it("o arquivo das funções entrou na reconstrução", () => {
    expect(texto()).toContain("migracao-acesso-funcoes.sql");
  });

  it("o texto das funções é o mesmo nos dois arquivos que o levam", () => {
    // Os dois saem da MESMA const do gerador. Se divergirem, alguém editou
    // um arquivo gerado à mão — e aí o banco novo e o banco migrado passam
    // a ter regras de permissão diferentes, o que é pior que o bug original.
    const corpo = s => {
      const m = /create or replace function public\.meu_nivel[\s\S]*?\$pode_editar_algum\$;/.exec(s);
      if (!m) throw new Error("não achei o bloco das funções");
      return m[0];
    };
    const funcoes = fs.readFileSync(path.join(DIR, "migracao-acesso-funcoes.sql"), "utf8");
    const rls = fs.readFileSync(path.join(DIR, "migracao-rls-leitura.sql"), "utf8");
    expect(corpo(funcoes)).toBe(corpo(rls));
  });
});
