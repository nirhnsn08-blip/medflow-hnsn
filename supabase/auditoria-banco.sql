-- ============================================================
-- Valentrax — AUDITORIA DO BANCO (somente leitura, não altera nada)
-- Rode o script INTEIRO no Supabase → SQL Editor.
-- Ele confere: tabelas, colunas de migração, RLS, funções e trigger de auth.
-- Leia a coluna "situacao": tudo ✅ = banco em dia. Qualquer ❌ = falta rodar
-- a migração indicada em "origem". Ordena os problemas (❌) no topo.
-- ============================================================

with
tabelas(nome, origem) as (values
  ('atendimentos','schema'), ('auditoria','schema'), ('profiles','schema'),
  ('leitos','schema'), ('leitos_saidas','schema'), ('leitos_turnover','schema'),
  ('setores','schema'), ('solicitacoes','schema'), ('cid_referencia','schema'),
  ('scih_casos','schema'), ('scih_germes','schema'), ('scih_indicadores','schema'),
  ('cc_salas','schema'), ('cc_cirurgias','schema'),
  ('pacientes','schema'), ('pep_evolucoes','schema'),
  ('ps_atendimentos','schema'), ('ps_sinais','schema'), ('ps_registros','schema'),
  ('ps_prescricao_itens','schema'),
  ('farm_medicamentos','farmacia-faseA'), ('farm_lotes','farmacia-faseA'),
  ('farm_movimentos','farmacia-faseA'), ('farm_interacoes','farmacia-clinica-fase2'),
  ('farm_incompat_y','farmacia-clinica-fase2'), ('farm_preparo','farmacia-preparo'),
  ('farm_nao_padronizados','farmacia-nao-padronizados'),
  ('farm_intervencoes','farmacia-intervencoes')
),
colunas(tabela, coluna, origem) as (values
  -- Giro de Leitos (as duas migrações que NÃO estão no schema base)
  ('leitos','alta_pendencias','leitos-kanban-metas'),
  ('leitos','alta_periodo','leitos-kanban-metas'),
  ('setores','meta_ocupacao','leitos-kanban-metas'),
  ('setores','meta_permanencia','leitos-kanban-metas'),
  ('setores','meta_giro','leitos-kanban-metas'),
  ('solicitacoes','motivo_espera','leitos-kanban-metas'),
  ('leitos_saidas','setor','leitos-saida-setor'),
  -- Giro de Leitos (base)
  ('leitos','setor','schema'), ('leitos','isolamento','schema/scih'),
  ('leitos','solic_em','schema'), ('leitos','disp_em','schema'),
  ('leitos','pronto_em','schema'), ('leitos','entrada_em','schema'),
  ('leitos_saidas','disp_em','schema'), ('leitos_saidas','dias_permanencia','schema'),
  ('leitos_saidas','desfecho','schema'),
  ('cid_referencia','tratamento','schema'),
  -- Pronto-Socorro
  ('ps_atendimentos','idade','farmacia-clinica-fase1'),
  ('ps_atendimentos','peso','farmacia-clinica-fase1'),
  ('ps_atendimentos','clearance_renal','farmacia-clinica-fase1'),
  ('ps_atendimentos','funcao_hepatica','farmacia-clinica-fase1'),
  ('ps_atendimentos','alergias','farmacia-clinica-fase1'),
  ('ps_atendimentos','em_sonda','farmacia-clinica-fase1'),
  ('ps_atendimentos','gestante','farmacia-clinica-fase1'),
  ('ps_atendimentos','medico','schema'),
  ('ps_atendimentos','pa_sist','schema'), ('ps_atendimentos','fc','schema'),
  ('ps_atendimentos','spo2','schema'), ('ps_atendimentos','glicemia','schema'),
  ('ps_prescricao_itens','dose_valor','farmacia-clinica-fase1'),
  ('ps_prescricao_itens','dose_unidade','farmacia-clinica-fase1'),
  ('ps_prescricao_itens','frequencia_dia','farmacia-clinica-fase1'),
  ('ps_prescricao_itens','duracao_dias','farmacia-clinica-fase1'),
  -- Farmácia
  ('farm_medicamentos','classe','farmacia-seed'),
  ('farm_medicamentos','custo_unitario','farmacia-custos'),
  ('farm_medicamentos','grupo_terapeutico','farmacia-clinica-fase1'),
  ('farm_medicamentos','dose_maxima_dia','farmacia-clinica-fase1'),
  ('farm_medicamentos','nao_triturar','farmacia-clinica-fase1'),
  ('farm_medicamentos','inapropriado_idoso','farmacia-clinica-fase1'),
  ('farm_medicamentos','ajuste_renal','farmacia-clinica-fase3'),
  ('farm_medicamentos','ajuste_hepatico','farmacia-clinica-fase3'),
  ('farm_medicamentos','obs_clinica','farmacia-clinica-fase1'),
  ('farm_movimentos','atendimento_id','farmacia-preparo'),
  ('farm_movimentos','prescricao_item_id','farmacia-preparo'),
  ('farm_movimentos','setor','farmacia-preparo')
),
funcoes(nome) as (values ('my_role'), ('handle_new_user')),

-- checagens
chk_tab as (
  select 0 as ord, 'TABELA' as categoria, t.nome as item, t.origem as origem,
    case when it.table_name is null then '❌ FALTANDO' else '✅ ok' end as situacao,
    case when it.table_name is null then 1 else 0 end as prob
  from tabelas t
  left join information_schema.tables it
    on it.table_schema='public' and it.table_name=t.nome
),
chk_col as (
  select 1, 'COLUNA', c.tabela||'.'||c.coluna, c.origem,
    case when ic.column_name is null then '❌ FALTANDO' else '✅ ok' end,
    case when ic.column_name is null then 1 else 0 end
  from colunas c
  left join information_schema.columns ic
    on ic.table_schema='public' and ic.table_name=c.tabela and ic.column_name=c.coluna
),
chk_rls as (
  select 2, 'RLS (segurança)', t.nome, t.origem,
    case when cl.relrowsecurity then '✅ ativo' else '❌ DESLIGADO' end,
    case when cl.relrowsecurity then 0 else 1 end
  from tabelas t
  join pg_class cl on cl.relname=t.nome
  join pg_namespace ns on ns.oid=cl.relnamespace and ns.nspname='public'
),
chk_fn as (
  select 3, 'FUNÇÃO', f.nome, 'auth/permissões',
    case when p.proname is null then '❌ FALTANDO' else '✅ ok' end,
    case when p.proname is null then 1 else 0 end
  from funcoes f
  left join pg_proc p on p.proname=f.nome
  left join pg_namespace n on n.oid=p.pronamespace and n.nspname='public'
),
chk_trg as (
  select 4, 'TRIGGER', 'on_auth_user_created', 'criação de perfil no login',
    case when count(*)=0 then '❌ FALTANDO' else '✅ ok' end,
    case when count(*)=0 then 1 else 0 end
  from pg_trigger where tgname='on_auth_user_created'
),
tudo as (
  select * from chk_tab union all select * from chk_col union all
  select * from chk_rls union all select * from chk_fn union all select * from chk_trg
)
select categoria, item, situacao, origem
from tudo
order by prob desc, ord, item;
