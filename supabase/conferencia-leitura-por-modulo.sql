-- ═══════════════════════════════════════════════════════════
-- CONFERÊNCIA: as leituras que a PR #293 ampliou chegaram?
--
-- Gerado a partir de `src/acesso/mapa-tabelas.js`, então não dá para
-- divergir do que o código afirma.
--
-- ⚠️ NÃO ALTERA NADA. Só lê `pg_policies` e compara.
--
-- 🔴 UM RESULTADO SÓ: o SQL Editor mostra apenas a ÚLTIMA consulta, e
-- na versão anterior as 22 linhas de leitura ficavam escondidas atrás
-- da checagem de escrita.
--
-- Cada linha pergunta: a política de SELECT desta tabela cita o módulo
-- que passou a precisar dela? ❌ aqui significa que a tela continua
-- mostrando lista vazia, sem erro nenhum.
-- ═══════════════════════════════════════════════════════════
with esperado(tabela, modulo_novo, leitores_no_mapa) as (values
  ('cc_cirurgias', 'faturamento', 'bloco, paciente, faturamento'),
  ('cc_equipe', 'faturamento', 'bloco, paciente, faturamento'),
  ('cc_descricao', 'faturamento', 'bloco, paciente, faturamento'),
  ('leitos', 'faturamento', 'leitos, paciente, scih, ps, faturamento, overview, atendimento, maternidade'),
  ('leitos_saidas', 'faturamento', 'leitos, paciente, ps, faturamento, overview, atendimento'),
  ('ps_atendimentos', 'faturamento', 'ps, atendimento, ambulatorio, paciente, farmacia, faturamento, maternidade'),
  ('farm_intervencoes', 'ps', 'farmacia, ps'),
  ('pep_alergias', 'ps', 'paciente, farmacia, ps'),
  ('farm_lotes', 'ps', 'farmacia, suprimentos, ps'),
  ('pep_episodios', 'leitos', 'paciente, farmacia, leitos'),
  ('sup_itens', 'bloco', 'suprimentos, farmacia, bloco'),
  ('solicitacoes', 'overview', 'ps, leitos, overview'),
  ('pep_condicoes', 'farmacia', 'paciente, farmacia'),
  ('pep_administracoes', 'farmacia', 'paciente, farmacia'),
  ('ps_administracoes', 'farmacia', 'ps, paciente, faturamento, farmacia'),
  ('tiss_guias', 'atendimento', 'faturamento, atendimento'),
  ('mat_partos', 'maternidade', 'paciente, maternidade'),
  ('mat_episodios', 'maternidade', 'paciente, maternidade'),
  ('mat_admissoes', 'maternidade', 'paciente, maternidade'),
  ('mat_alojamento', 'maternidade', 'paciente, maternidade'),
  ('mat_recem_nascidos', 'maternidade', 'paciente, maternidade'),
  ('mat_trabalho_parto', 'maternidade', 'paciente, maternidade')
),
atual as (
  select tablename as tabela, qual as condicao
    from pg_policies
   where schemaname = 'public' and cmd = 'SELECT'
     and policyname = tablename || '_leitura'
)
select case when a.condicao is null then '⚠️ sem política de leitura'
            when position(e.modulo_novo in a.condicao) > 0 then '✅'
            else '❌ NÃO CHEGOU' end as situacao,
       e.tabela, e.modulo_novo, e.leitores_no_mapa
  from esperado e left join atual a on a.tabela = e.tabela

union all

-- 🔴 E A ESCRITA NÃO PODE TER ENCOLHIDO. Só a Maternidade ganhou
-- escrita (o módulo produz o próprio dado); ninguém pode ter PERDIDO —
-- foi assim que o PR #60 trancou 18 tabelas ao vivo.
select case when count(*) >= 6 then '✅' else '❌' end,
       'ESCRITA da maternidade', 'maternidade',
       count(*) || ' de 6 políticas'
  from pg_policies
 where schemaname = 'public'
   and tablename like 'mat\_%'
   and cmd in ('INSERT', 'UPDATE', 'ALL')
   and coalesce(qual, with_check) like '%maternidade%'

order by 1, 2;
