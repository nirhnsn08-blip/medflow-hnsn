-- ============================================================
-- Valentrax — RLS DE LEITURA: quem lê cada tabela
--
-- ⚠️ ARQUIVO GERADO — não edite à mão.
--    Regenere com:  node supabase/gerar-rls.mjs
--    A fonte é src/acesso/mapa-tabelas.js.
--
-- O QUE MUDA
-- Antes: toda política de SELECT era `using (true)` para `authenticated`.
-- Qualquer usuário logado lia qualquer tabela pela API REST — inclusive
-- `pacientes` (nome completo, CPF, CNS, nome da mãe, endereço) e todo o
-- prontuário. O menu escondia o módulo; o dado continuava alcançável.
-- Depois: a leitura passa pelo MESMO perfil que monta o menu.
--
-- É ADITIVO E REVERSÍVEL (ver "VOLTAR ATRÁS" no fim do arquivo). Não cria,
-- não altera e não apaga nenhuma tabela, coluna ou linha.
--
-- ⚠️ RODE NO DEMO PRIMEIRO. Depois no principal, ANTES do merge do código.
--    Na prática o código nem depende dele: quem publica a barreira é este
--    SQL. Rodar sozinho já fecha o acesso.
--
-- QUEM NÃO PERDE NADA HOJE
-- Todo mundo ainda está no perfil "Provisório", que concede todos os
-- módulos. Ou seja: aplicar isto agora NÃO tira acesso de ninguém — ele
-- passa a valer sozinho, pessoa por pessoa, conforme a TI reclassifica.
-- É a ordem certa: fechar a porta antes de distribuir as chaves.
--
-- ⚠️ SE ALGUÉM REEXECUTAR UMA MIGRAÇÃO ANTIGA, RODE ESTA DE NOVO.
--    As migrações antigas recriam a política `for select ... using (true)`
--    e a `for all` que a PARTE 2 desarma — reabrindo a leitura em silêncio.
--    Esta é idempotente: rodar duas vezes não faz mal.
-- ============================================================

-- Resolver `my_role()` sem prefixo é preciso na PARTE 2, que recria
-- políticas a partir do texto que o próprio Postgres devolve.
set search_path = public, extensions, pg_temp;


-- ════════════════════════════════════════════════════════════
-- PARTE 1/4 — AS FUNÇÕES DE PERMISSÃO
--
-- Espelham `src/acesso/permissoes.js`, nesta ordem: perfil → exceção
-- individual → travas. `security definer` porque a função precisa ler
-- `profiles` e `perfis_permissoes` por baixo do RLS delas.
-- ════════════════════════════════════════════════════════════

-- O nível efetivo desta pessoa neste módulo: nenhum | leitura | escrita.
create or replace function public.meu_nivel(p_modulo text)
returns text
language sql
stable
security definer
set search_path = public
as $meu_nivel$
  with me as (
    select id, role, perfil from public.profiles where id = auth.uid()
  ),
  bruto as (
    select coalesce(
      -- 1) a exceção individual manda (serve para AMPLIAR e para REDUZIR)
      (select up.nivel from public.usuarios_permissoes up, me
        where up.user_id = me.id and up.modulo = p_modulo),
      -- 2) o pacote do cargo
      (select pp.nivel from public.perfis_permissoes pp, me
        where pp.perfil_chave = me.perfil and pp.modulo = p_modulo),
      -- 3) sem perfil é sem acesso — falha FECHADA
      'nenhum'
    ) as nivel
  )
  select case
    -- Trava anti-trancamento: Usuários e Perfis é sempre, e só, do
    -- adm_master. Sem isto, um perfil configurado errado tranca o
    -- administrador do lado de fora e só se resolve pelo painel.
    when p_modulo = 'users' then
      case when (select role from me) = 'adm_master' then 'escrita' else 'nenhum' end
    -- Teto do visualizador: nunca escreve, tenha o perfil que tiver.
    when (select role from me) = 'visualizador' and (select nivel from bruto) = 'escrita' then
      'leitura'
    else (select nivel from bruto)
  end
$meu_nivel$;

-- Pode ABRIR o módulo? (leitura ou escrita)
create or replace function public.pode_ver(p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $pode_ver$
  select public.meu_nivel(p_modulo) in ('leitura', 'escrita')
$pode_ver$;

-- Pode abrir ALGUM destes? Uma tela lê tabela de vizinho por bom motivo:
-- o Giro de Leitos monta o mapa de risco com as escalas de enfermagem, o
-- Paciente 360 junta PS, leito, SCIH e PEP na mesma consulta.
create or replace function public.pode_ver_algum(variadic p_modulos text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $pode_ver_algum$
  select exists (select 1 from unnest(p_modulos) m where public.pode_ver(m))
$pode_ver_algum$;

-- Pode LANÇAR no módulo? Ainda não é usada por política nenhuma — a
-- escrita continua decidida por `role`. Fica pronta para a fase seguinte.
create or replace function public.pode_editar(p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $pode_editar$
  select public.meu_nivel(p_modulo) = 'escrita'
$pode_editar$;


-- ════════════════════════════════════════════════════════════
-- PARTE 2/4 — DESARMAR AS POLÍTICAS "FOR ALL"
--
-- ISTO É O QUE FAZ A PARTE 3 VALER ALGUMA COISA. Treze tabelas têm uma
-- política `for all to authenticated using (my_role() in
-- ('adm_master','adm_silver'))`. "FOR ALL" inclui SELECT, e políticas
-- permissivas se SOMAM: bastaria essa para qualquer adm_silver — médico,
-- enfermeiro, recepção, quase todo mundo — continuar lendo a tabela
-- inteira, por cima da política nova. A porta nova ficaria ao lado de uma
-- porta velha destrancada.
--
-- Aqui cada FOR ALL vira três políticas (insert/update/delete) com a
-- MESMA condição de antes. Ninguém ganha nem perde direito de escrita;
-- só o SELECT sai de dentro delas.
--
-- Roda sobre o que o BANCO tem de fato, não sobre uma lista — assim
-- alcança também a política que a Laura tenha criado no meio do caminho.
-- ════════════════════════════════════════════════════════════
do $converter$
declare
  p record;
  q text;
  w text;
  qtd int := 0;
begin
  -- Tabela temporária: alterar o catálogo no meio de um cursor sobre o
  -- próprio catálogo é pedir surpresa. Materializa antes, mexe depois.
  -- (Os apelidos fogem de `n`/`t`/`p` de propósito: apelido igual a
  -- variável do PL/pgSQL vira "ambiguous column reference" em execução.)
  create temp table _rls_forall on commit drop as
    select c.relname::text as tabela,
           pol.polname::text as nome,
           pg_get_expr(pol.polqual,      pol.polrelid) as usando,
           pg_get_expr(pol.polwithcheck, pol.polrelid) as checando,
           case when pol.polroles = '{0}'::oid[] then 'public'
                else (select string_agg(quote_ident(r.rolname), ', ')
                        from pg_roles r where r.oid = any(pol.polroles)) end as papeis
      from pg_policy pol
      join pg_class c      on c.oid = pol.polrelid
      join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = 'public'
     where pol.polcmd = '*';

  for p in select * from _rls_forall loop
    q := coalesce(p.usando, 'true');
    w := coalesce(p.checando, q);
    execute format('drop policy %I on public.%I', p.nome, p.tabela);
    execute format('create policy %I on public.%I for insert to %s with check (%s)',
                   left(p.nome, 55) || '_ins', p.tabela, p.papeis, w);
    execute format('create policy %I on public.%I for update to %s using (%s) with check (%s)',
                   left(p.nome, 55) || '_upd', p.tabela, p.papeis, q, w);
    execute format('create policy %I on public.%I for delete to %s using (%s)',
                   left(p.nome, 55) || '_del', p.tabela, p.papeis, q);
    qtd := qtd + 1;
    raise notice 'FOR ALL desarmada: % (%) -> insert/update/delete', p.tabela, p.nome;
  end loop;

  raise notice '% politica(s) FOR ALL convertida(s).', qtd;
  drop table _rls_forall;
end
$converter$;


-- ════════════════════════════════════════════════════════════
-- PARTE 3/4 — A POLÍTICA DE LEITURA DE CADA TABELA
--
-- Uma linha por tabela: o nome e quem pode ler. O comentário à direita é
-- a mesma coisa em português. 21 das 86 tabelas ficam abertas a
-- qualquer autenticado — são catálogo, referência e configuração, sem
-- nenhum dado de paciente. Isso é DECISÃO declarada, não sobra: negar
-- `farm_medicamentos` desligaria o motor de alertas dentro do PS e do PEP.
--
-- Toda política de SELECT anterior da tabela é apagada antes (os nomes
-- variam: atend_select, cidref_select, saidas_select…). As de escrita
-- não são tocadas.
-- ════════════════════════════════════════════════════════════
do $leitura$
declare
  t record;
  pol record;
  qtd int := 0;
  faltando text[] := '{}';
begin
  for t in
    select * from (values
      ('ag_agendamentos', 'public.pode_ver_algum(''atendimento'')'),                                  -- atendimento
      ('ag_bloqueios', 'public.pode_ver_algum(''atendimento'')'),                                     -- atendimento
      ('ag_grades', 'public.pode_ver_algum(''atendimento'')'),                                        -- atendimento
      ('at_conta_itens', 'public.pode_ver_algum(''atendimento'')'),                                   -- atendimento
      ('at_contas', 'public.pode_ver_algum(''atendimento'')'),                                        -- atendimento
      ('at_convenios', 'true'),                                                                       -- todos os autenticados
      ('at_dominios', 'true'),                                                                        -- todos os autenticados
      ('at_planos', 'true'),                                                                          -- todos os autenticados
      ('at_procedimentos', 'true'),                                                                   -- todos os autenticados
      ('at_responsaveis', 'public.pode_ver_algum(''atendimento'', ''paciente'')'),                    -- atendimento, paciente
      ('atendimentos', 'public.pode_ver_algum(''overview'', ''atendimento'', ''ambulatorio'', ''print'')'), -- overview, atendimento, ambulatorio, print
      ('auditoria', 'public.pode_ver_algum(''auditoria'')'),                                          -- auditoria
      ('cc_cirurgias', 'public.pode_ver_algum(''bloco'')'),                                           -- bloco
      ('cc_salas', 'true'),                                                                           -- todos os autenticados
      ('cid_referencia', 'true'),                                                                     -- todos os autenticados
      ('enf_escala_faixas', 'true'),                                                                  -- todos os autenticados
      ('enf_escalas', 'public.pode_ver_algum(''paciente'', ''leitos'')'),                             -- paciente, leitos
      ('enf_lesao_pressao', 'public.pode_ver_algum(''paciente'', ''leitos'', ''nsp'')'),              -- paciente, leitos, nsp
      ('enf_sae_catalogo', 'true'),                                                                   -- todos os autenticados
      ('enf_sae_checagem', 'public.pode_ver_algum(''paciente'', ''leitos'')'),                        -- paciente, leitos
      ('enf_sae_diagnosticos', 'public.pode_ver_algum(''paciente'')'),                                -- paciente
      ('enf_sae_historico', 'public.pode_ver_algum(''paciente'')'),                                   -- paciente
      ('enf_sae_prescricao_itens', 'public.pode_ver_algum(''paciente'', ''leitos'')'),                -- paciente, leitos
      ('enf_sae_prescricoes', 'public.pode_ver_algum(''paciente'', ''leitos'')'),                     -- paciente, leitos
      ('farm_incompat_y', 'true'),                                                                    -- todos os autenticados
      ('farm_interacoes', 'true'),                                                                    -- todos os autenticados
      ('farm_intervencoes', 'public.pode_ver_algum(''farmacia'')'),                                   -- farmacia
      ('farm_lotes', 'public.pode_ver_algum(''farmacia'')'),                                          -- farmacia
      ('farm_medicamentos', 'true'),                                                                  -- todos os autenticados
      ('farm_movimentos', 'public.pode_ver_algum(''farmacia'', ''controlados'', ''ps'')'),            -- farmacia, controlados, ps
      ('farm_nao_padronizados', 'public.pode_ver_algum(''farmacia'')'),                               -- farmacia
      ('farm_preparo', 'public.pode_ver_algum(''farmacia'', ''ps'')'),                                -- farmacia, ps
      ('leitos', 'public.pode_ver_algum(''leitos'', ''paciente'', ''scih'')'),                        -- leitos, paciente, scih
      ('leitos_saidas', 'public.pode_ver_algum(''leitos'', ''paciente'')'),                           -- leitos, paciente
      ('leitos_turnover', 'public.pode_ver_algum(''leitos'', ''overview'', ''print'')'),              -- leitos, overview, print
      ('nsp_acoes', 'public.pode_ver_algum(''nsp'')'),                                                -- nsp
      ('nsp_incidente_eventos', 'public.pode_ver_algum(''nsp'')'),                                    -- nsp
      ('nsp_incidentes', 'public.pode_ver_algum(''nsp'')'),                                           -- nsp
      ('nsp_meta_faixas', 'true'),                                                                    -- todos os autenticados
      ('nsp_meta_medicoes', 'public.pode_ver_algum(''nsp'')'),                                        -- nsp
      ('nsp_protocolos', 'true'),                                                                     -- todos os autenticados
      ('nsp_rca', 'public.pode_ver_algum(''nsp'')'),                                                  -- nsp
      ('pacientes', 'public.pode_ver_algum(''atendimento'', ''ambulatorio'', ''ps'', ''paciente'')'), -- atendimento, ambulatorio, ps, paciente
      ('pep_acessos', 'public.pode_ver_algum(''auditoria'')'),                                        -- auditoria
      ('pep_administracoes', 'public.pode_ver_algum(''paciente'')'),                                  -- paciente
      ('pep_alergias', 'public.pode_ver_algum(''paciente'')'),                                        -- paciente
      ('pep_anamneses', 'public.pode_ver_algum(''paciente'')'),                                       -- paciente
      ('pep_anotacoes_enfermagem', 'public.pode_ver_algum(''paciente'')'),                            -- paciente
      ('pep_aprazamentos', 'public.pode_ver_algum(''paciente'')'),                                    -- paciente
      ('pep_condicoes', 'public.pode_ver_algum(''paciente'')'),                                       -- paciente
      ('pep_episodios', 'public.pode_ver_algum(''paciente'')'),                                       -- paciente
      ('pep_evolucoes', 'public.pode_ver_algum(''paciente'')'),                                       -- paciente
      ('pep_medicamentos_uso', 'public.pode_ver_algum(''paciente'')'),                                -- paciente
      ('pep_prescricao_eventos', 'public.pode_ver_algum(''paciente'')'),                              -- paciente
      ('pep_prescricao_itens', 'public.pode_ver_algum(''paciente'')'),                                -- paciente
      ('pep_prescricoes', 'public.pode_ver_algum(''paciente'')'),                                     -- paciente
      ('pep_reconciliacao_itens', 'public.pode_ver_algum(''paciente'')'),                             -- paciente
      ('pep_reconciliacoes', 'public.pode_ver_algum(''paciente'')'),                                  -- paciente
      ('pep_sinais_vitais', 'public.pode_ver_algum(''paciente'')'),                                   -- paciente
      ('pep_sumarios_alta', 'public.pode_ver_algum(''paciente'')'),                                   -- paciente
      ('perfis_acesso', 'true'),                                                                      -- todos os autenticados
      ('perfis_permissoes', 'true'),                                                                  -- todos os autenticados
      ('profiles', 'true'),                                                                           -- todos os autenticados
      ('ps_administracoes', 'public.pode_ver_algum(''ps'', ''paciente'')'),                           -- ps, paciente
      ('ps_atendimentos', 'public.pode_ver_algum(''ps'', ''atendimento'', ''ambulatorio'', ''paciente'')'), -- ps, atendimento, ambulatorio, paciente
      ('ps_faixas_obstetricas', 'true'),                                                              -- todos os autenticados
      ('ps_faixas_pediatricas', 'true'),                                                              -- todos os autenticados
      ('ps_prescricao_itens', 'public.pode_ver_algum(''ps'', ''paciente'', ''farmacia'')'),           -- ps, paciente, farmacia
      ('ps_protocolos', 'true'),                                                                      -- todos os autenticados
      ('ps_registros', 'public.pode_ver_algum(''ps'', ''paciente'', ''farmacia'')'),                  -- ps, paciente, farmacia
      ('ps_salas', 'public.pode_ver_algum(''ps'')'),                                                  -- ps
      ('ps_sinais', 'public.pode_ver_algum(''ps'', ''paciente'')'),                                   -- ps, paciente
      ('scih_casos', 'public.pode_ver_algum(''scih'', ''paciente'')'),                                -- scih, paciente
      ('scih_germes', 'true'),                                                                        -- todos os autenticados
      ('scih_indicadores', 'public.pode_ver_algum(''scih'', ''overview'', ''print'')'),               -- scih, overview, print
      ('setores', 'true'),                                                                            -- todos os autenticados
      ('solicitacoes', 'public.pode_ver_algum(''ps'', ''leitos'')'),                                  -- ps, leitos
      ('sup_cotacoes', 'public.pode_ver_algum(''suprimentos'')'),                                     -- suprimentos
      ('sup_fornecedores', 'public.pode_ver_algum(''suprimentos'', ''farmacia'')'),                   -- suprimentos, farmacia
      ('sup_inventarios', 'public.pode_ver_algum(''suprimentos'')'),                                  -- suprimentos
      ('sup_itens', 'public.pode_ver_algum(''suprimentos'', ''farmacia'')'),                          -- suprimentos, farmacia
      ('sup_lotes', 'public.pode_ver_algum(''suprimentos'')'),                                        -- suprimentos
      ('sup_movimentos', 'public.pode_ver_algum(''suprimentos'', ''farmacia'')'),                     -- suprimentos, farmacia
      ('sup_pedidos', 'public.pode_ver_algum(''suprimentos'')'),                                      -- suprimentos
      ('sup_requisicoes', 'public.pode_ver_algum(''suprimentos'')'),                                  -- suprimentos
      ('usuarios_permissoes', 'public.pode_ver_algum(''users'') or user_id = auth.uid()')             -- users, @proprio
    ) as v(tabela, cond)
  loop
    if not exists (
      select 1 from information_schema.tables
       where table_schema = 'public' and table_name = t.tabela
    ) then
      faltando := faltando || t.tabela;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t.tabela);

    for pol in
      select antiga.polname
        from pg_policy antiga
        join pg_class c      on c.oid = antiga.polrelid
        join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = 'public'
       where c.relname = t.tabela and antiga.polcmd = 'r'
    loop
      execute format('drop policy %I on public.%I', pol.polname, t.tabela);
    end loop;

    execute format('create policy %I on public.%I for select to authenticated using (%s)',
                   t.tabela || '_leitura', t.tabela, t.cond);
    qtd := qtd + 1;
  end loop;

  raise notice '% tabela(s) com politica de leitura por modulo.', qtd;
  if array_length(faltando, 1) > 0 then
    raise notice 'PULADAS (nao existem neste banco): %', array_to_string(faltando, ', ');
  end if;
end
$leitura$;


-- ════════════════════════════════════════════════════════════
-- PARTE 4/4 — CONFERÊNCIA
--
-- Uma consulta só, de propósito: o SQL Editor mostra o resultado da
-- ÚLTIMA consulta, então três selects separados esconderiam justamente os
-- dois primeiros, que são os que acusam problema. Os ❌ vêm no topo.
-- ════════════════════════════════════════════════════════════
with esperadas_abertas(tabela) as (values
  ('at_convenios'),
  ('at_dominios'),
  ('at_planos'),
  ('at_procedimentos'),
  ('cc_salas'),
  ('cid_referencia'),
  ('enf_escala_faixas'),
  ('enf_sae_catalogo'),
  ('farm_incompat_y'),
  ('farm_interacoes'),
  ('farm_medicamentos'),
  ('nsp_meta_faixas'),
  ('nsp_protocolos'),
  ('perfis_acesso'),
  ('perfis_permissoes'),
  ('profiles'),
  ('ps_faixas_obstetricas'),
  ('ps_faixas_pediatricas'),
  ('ps_protocolos'),
  ('scih_germes'),
  ('setores')
),
politicas as (
  select c.relname::text as tabela,
         pol.polname::text as politica,
         pol.polcmd as cmd,
         coalesce(pg_get_expr(pol.polqual, pol.polrelid), 'true') as condicao
    from pg_policy pol
    join pg_class c      on c.oid = pol.polrelid
    join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = 'public'
),
-- ❌ Leitura ainda aberta em tabela que o mapa NÃO autorizou. Zero linha
--    é o resultado certo.
aberta_indevida as (
  select 0 as ord, '❌ LEITURA AINDA ABERTA' as situacao, tabela as item,
         politica || ' — ' || condicao as detalhe
    from politicas
   where cmd in ('r', '*')
     and condicao in ('true', '(true)')
     and tabela not in (select tabela from esperadas_abertas)
),
-- ❌ Alguém sem perfil não lê mais NADA (falha fechada, de propósito).
--    Classifique essas pessoas em Usuários e Perfis.
sem_perfil as (
  select 1, '❌ USUARIO SEM PERFIL', coalesce(username, '(sem username)'),
         coalesce(nome, '') || ' · ' || coalesce(role, '')
    from public.profiles where perfil is null
),
-- ✅ O retrato final: quem lê cada tabela.
retrato as (
  select 2, case when condicao in ('true', '(true)')
                 then '✅ catalogo (todos)' else '✅ por modulo' end,
         tabela, condicao
    from politicas where cmd = 'r'
)
select situacao, item, detalhe from (
  select * from aberta_indevida
  union all select * from sem_perfil
  union all select * from retrato
) tudo
order by ord, situacao, item;


-- ════════════════════════════════════════════════════════════
-- VOLTAR ATRÁS
--
-- Se alguma tela essencial esvaziar em pleno plantão e não der tempo de
-- achar a causa, isto devolve a leitura como estava antes (aberta a
-- qualquer autenticado) sem tocar em dado nenhum:
--
--   do $$
--   declare t record;
--   begin
--     for t in select c.relname from pg_policy p
--                join pg_class c on c.oid = p.polrelid
--                join pg_namespace n on n.oid = c.relnamespace
--               where n.nspname = 'public' and p.polname = c.relname || '_leitura'
--     loop
--       execute format('drop policy %I on public.%I', t.relname || '_leitura', t.relname);
--       execute format('create policy %I on public.%I for select to authenticated using (true)',
--                      t.relname || '_leitura', t.relname);
--     end loop;
--   end $$;
--
-- Reabrir é o último recurso, não o primeiro: quase sempre o certo é
-- acrescentar o módulo que falta ao perfil da pessoa, na tela de Usuários.
-- ============================================================
