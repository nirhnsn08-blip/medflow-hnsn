// ============================================================
// Valentrax — GERADOR DO SCRIPT DE RECONSTRUÇÃO DO BANCO
//
// Junta todos os .sql de supabase/ na ordem cronológica correta e produz
// `reconstruir-banco.sql`: um único arquivo que levanta um banco Valentrax
// completo, do zero.
//
//     node supabase/gerar-reconstrucao.mjs
//
// PARA QUE SERVE
//  1. Nivelar o banco demo com o principal (ambiente de teste confiável).
//  2. Subir um hospital novo — o modelo é 1 banco por hospital.
//  3. Backup da ESTRUTURA: com este arquivo o schema é recriável a
//     qualquer momento. (Não é backup de DADOS — isso é o PITR/dump
//     do próprio Supabase.)
//
// POR QUE RECONSTRUIR EM VEZ DE REMENDAR
// Coluna declarada dentro do `create table` nunca é corrigida por migração
// posterior — `create table if not exists` pula a tabela que já existe, e
// só as colunas adicionadas via `alter table` são alcançadas. Uma tabela
// nascida de uma versão antiga do schema fica torta para sempre. Recriar
// do zero elimina essa classe de erro inteira.
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

// Ordem de aplicação = ordem cronológica em que rodaram no banco principal
// (obtida do histórico do git). A ordem importa: migração mexe em tabela
// que a anterior criou. NÃO reordenar sem conferir dependência.
const ORDEM = [
  "schema.sql",
  "migracao-farmacia-faseA.sql",
  "migracao-farmacia-seed.sql",
  "migracao-farmacia-faseB.sql",
  "migracao-farmacia-clinica-fase1.sql",
  "migracao-farmacia-clinica-fase2.sql",
  "migracao-farmacia-clinica-fase3.sql",
  "migracao-farmacia-preparo.sql",
  "migracao-farmacia-custos.sql",
  "migracao-farmacia-nao-padronizados.sql",
  "migracao-farmacia-intervencoes.sql",
  "migracao-leitos-kanban-metas.sql",
  "migracao-leitos-saida-setor.sql",
  "migracao-suprimentos-faseA.sql",
  "migracao-suprimentos-faseB.sql",
  "migracao-suprimentos-seed.sql",
  "migracao-suprimentos-faseC.sql",
  "migracao-suprimentos-inventario.sql",
  "migracao-suprimentos-ponto-de-pedido.sql",
  "migracao-suprimentos-cotacao.sql",
  "migracao-ps-salas.sql",
  "migracao-ps-salas-censo.sql",
  "migracao-ps-origem-elo.sql",
  "migracao-ps-checagem-medicacao.sql",
  "migracao-pep-fase1.sql",
  "migracao-pep-acessos.sql",
  "migracao-pep-sinais-spo2.sql",
  "migracao-pep-categoria-profissional.sql",
  "migracao-pep-perfis-update.sql",
  "migracao-pep-fase3.sql",
];

// Trava de segurança: migração nova que ninguém acrescentou em ORDEM
// ficaria de fora silenciosamente — o mesmo erro que já cegou a auditoria
// duas vezes. Aqui isso para o gerador.
// `seed-teste-*` fica de fora de propósito: é DADO fictício de teste, não
// estrutura. Entrar aqui plantaria 60 pacientes inventados no banco de um
// hospital novo — exatamente o oposto do que reconstruir-banco.sql serve.
// Esses arquivos têm trava própria e são rodados à mão, só no banco demo.
const noDisco = fs.readdirSync(dir)
  .filter(f => f.endsWith(".sql")
            && !f.startsWith("auditoria-")
            && !f.startsWith("seed-teste-")
            && f !== "reconstruir-banco.sql");
const esquecidos = noDisco.filter(f => !ORDEM.includes(f));
if (esquecidos.length) {
  console.error(`\n❌ Migração fora da lista ORDEM: ${esquecidos.join(", ")}`);
  console.error("   Acrescente em gerar-reconstrucao.mjs, na posição cronológica certa.\n");
  process.exit(1);
}
const sumiram = ORDEM.filter(f => !fs.existsSync(path.join(dir, f)));
if (sumiram.length) {
  console.error(`\n❌ Arquivo listado em ORDEM não existe: ${sumiram.join(", ")}\n`);
  process.exit(1);
}

const partes = ORDEM.map((f, i) => {
  const corpo = fs.readFileSync(path.join(dir, f), "utf8").trim();
  return `
-- ┌────────────────────────────────────────────────────────────
-- │ ${String(i + 1).padStart(2, "0")}/${ORDEM.length} — ${f}
-- └────────────────────────────────────────────────────────────
${corpo}
`;
});

const saida = `-- ============================================================
-- Valentrax — RECONSTRUÇÃO COMPLETA DO BANCO
--
-- ⚠️ ARQUIVO GERADO — não edite à mão.
--    Regenere com:  node supabase/gerar-reconstrucao.mjs
--
-- ⚠️⚠️ ESTE SCRIPT APAGA TODO O SCHEMA "public" E O RECRIA DO ZERO.
--    TODOS OS DADOS DAS TABELAS DA APLICAÇÃO SÃO PERDIDOS.
--
--    Use APENAS num banco descartável (demo/teste) ou num banco NOVO.
--    NUNCA rode no banco de um hospital em uso.
--
--    Antes de rodar, confirme no topo do painel que o projeto é o certo.
--
-- O QUE ELE PRESERVA
--    • Os usuários (o schema "auth" não é tocado).
--    • Os perfis e papéis (adm_master etc.) — são salvos em "_backup"
--      antes do drop e restaurados no fim. Sem isso, todo mundo voltaria
--      como "visualizador" e o admin perderia o acesso.
--
-- CONTEÚDO: ${ORDEM.length} scripts, na ordem em que rodaram no banco principal.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- PARTE 0/4 — TRAVA DE SEGURANÇA
--
-- Colar este script no projeto errado destruiria o banco de um hospital.
-- Por isso ele exige uma confirmação deliberada: rode ANTES, sozinho,
-- NO MESMO projeto onde vai reconstruir:
--
--     create table public._confirmo_reconstruir();
--
-- Sem essa tabela, o script aborta e nada é alterado. Ela some junto no
-- drop, então a confirmação vale uma vez só — da próxima, confirme de novo.
-- ════════════════════════════════════════════════════════════
do $guarda$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = '_confirmo_reconstruir'
  ) then
    raise exception E'RECONSTRUCAO ABORTADA - nada foi alterado.\\n\\n'
      'Confirme que este e o banco DESCARTAVEL certo rodando, sozinho, neste projeto:\\n'
      '    create table public._confirmo_reconstruir();\\n\\n'
      'Depois rode este script inteiro de novo.';
  end if;
end
$guarda$;


-- ════════════════════════════════════════════════════════════
-- PARTE 1/4 — Preservar perfis e papéis
-- ════════════════════════════════════════════════════════════
create schema if not exists _backup;

do $preservar$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'profiles'
  ) then
    drop table if exists _backup.profiles_antes;
    execute 'create table _backup.profiles_antes as select * from public.profiles';
    raise notice 'Perfis preservados em _backup.profiles_antes';
  else
    raise notice 'Nao havia public.profiles — nada a preservar';
  end if;
end
$preservar$;


-- ════════════════════════════════════════════════════════════
-- PARTE 2/4 — Zerar o schema public
-- ════════════════════════════════════════════════════════════
drop schema public cascade;
create schema public;

grant usage  on schema public to anon, authenticated, service_role;
grant all    on schema public to postgres, service_role;
alter default privileges in schema public
  grant all on tables    to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to postgres, anon, authenticated, service_role;


-- ════════════════════════════════════════════════════════════
-- PARTE 3/4 — Estrutura (${ORDEM.length} scripts na ordem cronológica)
-- ════════════════════════════════════════════════════════════
${partes.join("\n")}

-- ════════════════════════════════════════════════════════════
-- PARTE 4/4 — Restaurar perfis e papéis
-- ════════════════════════════════════════════════════════════
do $restaurar$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = '_backup' and table_name = 'profiles_antes'
  ) then
    execute $sql$
      insert into public.profiles (id, username, nome, role)
      select b.id, b.username, b.nome, b.role
        from _backup.profiles_antes b
        join auth.users u on u.id = b.id
      on conflict (id) do nothing
    $sql$;
    raise notice 'Perfis restaurados de _backup.profiles_antes';
  end if;
end
$restaurar$;

-- Usuário que existe no auth mas ficou sem perfil (conta criada enquanto
-- o schema estava zerado, ou banco que nunca teve profiles) entra como
-- 'visualizador' — o papel de menor privilégio. Promova manualmente quem
-- precisar, com o comando comentado no fim deste arquivo.
insert into public.profiles (id, username, nome, role)
select u.id,
       split_part(u.email, '@', 1),
       coalesce(u.raw_user_meta_data->>'nome', split_part(u.email, '@', 1)),
       coalesce(u.raw_user_meta_data->>'role', 'visualizador')
  from auth.users u
on conflict (id) do nothing;


-- ════════════════════════════════════════════════════════════
-- CONFERÊNCIA — o resultado deve bater com o banco principal
-- ════════════════════════════════════════════════════════════
select
  (select count(*) from information_schema.tables  where table_schema='public')  as tabelas,
  (select count(*) from information_schema.columns where table_schema='public')  as colunas,
  (select count(*) from public.profiles)                                          as perfis;

-- Depois rode supabase/auditoria-banco.sql para a conferência completa.
--
-- Se algum usuário precisar voltar a ser administrador:
--   update public.profiles set role = 'adm_master' where username = 'SEU_USUARIO';
--
-- Quando tudo estiver conferido, a cópia de segurança pode sair:
--   drop schema _backup cascade;
`;

fs.writeFileSync(path.join(dir, "reconstruir-banco.sql"), saida, "utf8");
const kb = (Buffer.byteLength(saida, "utf8") / 1024).toFixed(0);
console.log(`reconstruir-banco.sql gerado: ${ORDEM.length} scripts, ${kb} KB`);
