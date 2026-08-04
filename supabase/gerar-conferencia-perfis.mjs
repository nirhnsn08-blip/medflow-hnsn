// ============================================================
// Valentrax — GERADOR DA CONFERÊNCIA DE PERFIS
//
//     node supabase/gerar-conferencia-perfis.mjs
//
// Escreve `conferencia-perfis.sql`: uma consulta SOMENTE LEITURA que compara
// a matriz de permissões do BANCO com o catálogo do código.
//
// POR QUE ISTO EXISTE — o defeito que ele pega
// `migracao-perfis-acesso.sql` insere os grants com `on conflict do nothing`,
// que é o certo (não desfaz ajuste do hospital). O efeito colateral é que
// **grant acrescentado ao seed depois nunca chega a um banco que já rodou a
// migração**. Foi o que aconteceu com o módulo NSP: o arquivo declarava
// `('ti','nsp')` e `('provisorio','nsp')` havia semanas, os dois bancos não
// tinham nenhuma das duas linhas, e ninguém percebeu — porque `seed-perfis.
// test.js` compara o código com o ARQUIVO, nunca com o BANCO.
//
// Descoberto só ao percorrer a tela: o adm_master não via "Segurança do
// Paciente" no menu. Enquanto o RLS era `using (true)` isso era um item
// faltando; com a leitura fechada por módulo, vira acesso negado.
//
// Rode esta conferência depois de qualquer migração que mexa em perfis, e
// ao subir um hospital novo.
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PERFIS_MODELO } from "../src/acesso/modulos.js";

const dir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Os grants do perfil `provisorio` — ele não existe em `modulos.js` (é só da
 * migração), então a fonte é o próprio SQL. Ler de lá evita a terceira cópia
 * da mesma verdade.
 */
export function grantsDoProvisorio(sqlPerfis) {
  return [...sqlPerfis.matchAll(/\('provisorio','([a-z_]+)','(leitura|escrita)'\)/g)]
    .map(m => ({ perfil: "provisorio", modulo: m[1], nivel: m[2] }));
}

export function esperados(sqlPerfis) {
  const linhas = [];
  for (const p of PERFIS_MODELO)
    for (const [modulo, nivel] of Object.entries(p.grants))
      linhas.push({ perfil: p.chave, modulo, nivel });
  linhas.push(...grantsDoProvisorio(sqlPerfis));
  return linhas.sort((a, b) =>
    (a.perfil + a.modulo).localeCompare(b.perfil + b.modulo));
}

export function gerarSql(linhas) {
  const valores = linhas
    .map(l => `  ('${l.perfil}','${l.modulo}','${l.nivel}')`)
    .join(",\n");

  return `-- ============================================================
-- Valentrax — CONFERÊNCIA DE PERFIS (SOMENTE LEITURA — não altera nada)
-- Rode o script INTEIRO no Supabase → SQL Editor.
--
-- ⚠️ ARQUIVO GERADO — não edite à mão.
--    Regenere com:  node supabase/gerar-conferencia-perfis.mjs
--
-- Compara a matriz de permissões do BANCO com o catálogo do CÓDIGO
-- (\`src/acesso/modulos.js\` + o perfil provisório da migração).
--
-- O QUE ELE PEGA, E QUE NADA MAIS PEGAVA
-- O seed usa \`on conflict do nothing\` — certo, para não desfazer ajuste do
-- hospital. O efeito colateral é que **grant acrescentado ao seed depois
-- nunca chega a um banco que já rodou a migração**. Aconteceu com o módulo
-- NSP: o arquivo declarava \`ti\` e \`provisorio\` com NSP havia semanas, os
-- dois bancos não tinham nenhuma das linhas, e o teste automatizado não via
-- — porque ele compara o código com o ARQUIVO, nunca com o BANCO.
--
-- COMO LER
--   ❌ FALTA NO BANCO  → o código concede e o banco não. Quem está nesse
--                        perfil não enxerga o módulo — e, com o RLS de
--                        leitura fechado, também não lê os dados dele.
--   ⚠️ NIVEL DIFERENTE → o banco tem, mas com outro nível.
--   ⚠️ SÓ NO BANCO     → ajuste feito à mão no hospital. Pode ser legítimo;
--                        só não pode ser surpresa.
--
-- Resultado ideal: nenhuma linha ❌ e nenhuma ⚠️ inesperada.
-- Cobertura: ${linhas.length} grants em ${new Set(linhas.map(l => l.perfil)).size} perfis.
-- ============================================================

with esperado(perfil, modulo, nivel) as (values
${valores}
),
real as (
  select perfil_chave as perfil, modulo, nivel from public.perfis_permissoes
),
tudo as (
  select 0 as ord, '❌ FALTA NO BANCO' as situacao, e.perfil, e.modulo,
         'código concede ' || e.nivel as detalhe
    from esperado e
    left join real r on r.perfil = e.perfil and r.modulo = e.modulo
   where r.modulo is null

  union all
  select 1, '⚠️ NIVEL DIFERENTE', e.perfil, e.modulo,
         'banco=' || r.nivel || ' · codigo=' || e.nivel
    from esperado e
    join real r on r.perfil = e.perfil and r.modulo = e.modulo
   where r.nivel <> e.nivel

  union all
  select 2, '⚠️ SO NO BANCO', r.perfil, r.modulo,
         'banco concede ' || r.nivel
    from real r
    left join esperado e on e.perfil = r.perfil and e.modulo = r.modulo
   where e.modulo is null

  union all
  select 3, '✅ ok', e.perfil, e.modulo, e.nivel
    from esperado e
    join real r on r.perfil = e.perfil and r.modulo = e.modulo
   where r.nivel = e.nivel
)
select situacao, perfil, modulo, detalhe,
       (select count(*) from public.profiles pr where pr.perfil = tudo.perfil) as pessoas_no_perfil
  from tudo
 order by ord, perfil, modulo;
`;
}

// ── execução ────────────────────────────────────────────────
export const ARQUIVO = path.join(dir, "conferencia-perfis.sql");

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const sqlPerfis = fs.readFileSync(path.join(dir, "migracao-perfis-acesso.sql"), "utf8");
  const linhas = esperados(sqlPerfis);
  fs.writeFileSync(ARQUIVO, gerarSql(linhas), "utf8");
  console.log(`conferencia-perfis.sql gerado: ${linhas.length} grants, `
    + `${new Set(linhas.map(l => l.perfil)).size} perfis.`);
}
