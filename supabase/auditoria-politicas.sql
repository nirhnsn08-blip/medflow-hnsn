-- ============================================================
-- Valentrax — AUDITORIA DAS POLÍTICAS DE RLS (SOMENTE LEITURA)
-- Rode no Supabase → SQL Editor. Complementa o auditoria-banco.sql:
-- aquele confere se EXISTE proteção; este confere se ela FILTRA.
--
-- Uma política `using (true)` passa em qualquer teste de existência e
-- ainda assim libera a tabela inteira. É esse o caso que este script caça.
--
-- A coluna "papeis" é a que define a gravidade:
--   PUBLIC (inclui anon!)  → aberto sem login. GRAVE, agir imediatamente.
--   authenticated          → só quem tem conta. Contido, mas sem separação
--                            por papel: um `visualizador` lê o mesmo que um
--                            `adm_master`.
--
-- ATENÇÃO ao interpretar: política de INSERT não usa USING, usa WITH CHECK
-- (`polqual` é sempre nulo nela). Conferir o campo errado gera falso
-- positivo em toda política de INSERT do banco.
--
-- Estado conhecido em 2026-07-21: várias políticas de SELECT estão como
-- `using (true)` para `authenticated`. Nenhuma é PUBLIC. Ver "Decisões em
-- aberto" em docs/CONTEXTO.md antes de mexer — apertar SELECT em produção
-- tira acesso de quem tem direito legítimo.
-- ============================================================

select
  c.relname as tabela,
  p.polname as politica,
  case p.polcmd
    when 'r' then 'SELECT' when 'a' then 'INSERT'
    when 'w' then 'UPDATE' when 'd' then 'DELETE'
    else 'TODAS' end as operacao,
  case
    when p.polroles = '{0}'::oid[] then 'PUBLIC (inclui anon!)'
    else array_to_string(array(
      select r.rolname from pg_roles r where r.oid = any(p.polroles)
    ), ', ')
  end as papeis,
  coalesce(pg_get_expr(p.polqual,      p.polrelid), '(nao se aplica)') as condicao_leitura,
  coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '(nao se aplica)') as condicao_escrita
from pg_policy p
join pg_class c     on c.oid = p.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and (
    -- leitura / alteração / exclusão: a regra mora em USING (polqual)
    (p.polcmd in ('r','w','d','*')
      and (p.polqual is null
           or pg_get_expr(p.polqual, p.polrelid) in ('true','(true)')))
    or
    -- inserção: a regra mora em WITH CHECK (polwithcheck)
    (p.polcmd = 'a'
      and (p.polwithcheck is null
           or pg_get_expr(p.polwithcheck, p.polrelid) in ('true','(true)')))
  )
order by
  case when p.polroles = '{0}'::oid[] then 0 else 1 end,  -- PUBLIC primeiro
  1, 3;
