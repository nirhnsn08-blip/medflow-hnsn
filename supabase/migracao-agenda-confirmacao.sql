-- ============================================================
-- Valentrax — CONFIRMAÇÃO DA VÉSPERA E MOTIVO DA FALTA
--
-- POR QUE ESTA MIGRAÇÃO EXISTE
-- A tela da Agenda exibe um KPI de ABSENTEÍSMO e o hospital não tem como
-- agir sobre ele:
--
--   1. NÃO EXISTE CONFIRMAÇÃO. O ciclo é agendado → presente → falta. A
--      confirmação ativa da véspera (ligar, WhatsApp, SMS 24-48h antes) é a
--      alavanca que de fato derruba absenteísmo no ambulatório brasileiro,
--      e o sistema não tem onde registrá-la. Quem liga hoje anota no papel.
--
--   2. FALTA NÃO TEM MOTIVO. `registrarFalta` grava só o status. Sem causa
--      não há o que corrigir: transporte que não veio, paciente já atendido
--      em outro serviço, óbito e "esqueci" pedem respostas diferentes — e
--      um deles nem é falta, é cadastro desatualizado.
--
-- O QUE ENTRA
--   • `confirmado` como status, `confirmado_em` e `confirmado_por`;
--   • `falta_motivo`.
--
-- ⚠️ DUAS TRAVAS CRAVAM A LISTA DE STATUS, E AS DUAS PRECISAM SABER DO
-- STATUS NOVO. Esquecer qualquer uma delas é pior que não migrar:
--
--   • O CHECK `ag_agend_status_valido` recusaria gravar 'confirmado' — a
--     tela mostraria "nada foi alterado" e ninguém saberia por quê.
--   • O ÍNDICE ÚNICO `ag_agend_vaga_unica_prof` filtra
--     `status in ('agendado','presente')`. Sem 'confirmado' ali, o
--     agendamento confirmado DEIXARIA DE OCUPAR A VAGA no banco — e duas
--     pessoas poderiam ser marcadas para o mesmo horário, sendo que uma
--     delas já confirmou que vem. É o dano exato que o índice existe para
--     impedir, causado pela melhoria.
--
-- ⚠️ ADITIVA nas colunas; a recriação do CHECK e do índice é substituição
-- pelo equivalente MAIS AMPLO — nada que era aceito passa a ser recusado.
--
-- COMO DESFAZER:
--   (o inverso: recriar CHECK e índice sem 'confirmado' — e antes disso
--    mover os 'confirmado' existentes de volta para 'agendado')
-- ============================================================

-- ── 1. AS COLUNAS ───────────────────────────────────────────
-- `confirmado_por` guarda QUEM confirmou. Não é burocracia: confirmação é
-- trabalho de telefone, e sem autor não há como saber se a lista do dia foi
-- percorrida ou se alguém marcou por marcar.
alter table public.ag_agendamentos
  add column if not exists confirmado_em timestamptz,
  add column if not exists confirmado_por text,
  add column if not exists falta_motivo text;

comment on column public.ag_agendamentos.confirmado_em is
  'Quando o paciente confirmou presença (contato ativo da véspera). Ver migracao-agenda-confirmacao.sql.';
comment on column public.ag_agendamentos.falta_motivo is
  'Por que não veio. Sem causa, o indicador de absenteísmo não tem o que corrigir.';

-- ── 2. O CHECK PRECISA ACEITAR O STATUS NOVO ────────────────
-- Sem isto, o PATCH é recusado pelo banco e a tela diz "nada foi alterado",
-- que é a mensagem certa para a causa errada.
alter table public.ag_agendamentos
  drop constraint if exists ag_agend_status_valido;
alter table public.ag_agendamentos
  add constraint ag_agend_status_valido
  check (status in ('agendado', 'confirmado', 'presente', 'falta', 'cancelado'));

-- ── 3. O ÍNDICE ÚNICO PRECISA SABER QUE CONFIRMADO OCUPA ────
-- 🔴 A parte que NÃO pode ser esquecida. O índice parcial filtra por status;
-- sem 'confirmado' na lista, quem confirmou sai do índice e o horário volta
-- a aceitar outra pessoa. Quem confirmou que vem é justamente quem MAIS
-- garantidamente vem.
--
-- A chave é a mesma do `migracao-agenda-vaga-por-profissional.sql` (a vaga é
-- do profissional, com recuo para a especialidade). O schema do índice é
-- recriado, não alterado: índice parcial não aceita mudar o `where`.
do $$
declare
  conflitos int;
begin
  -- Nada deve violar: a chave não muda, só a lista de status cresce. A
  -- conferência fica porque migrar por cima de dado inconsistente é como o
  -- índice antigo morre em silêncio.
  select count(*) into conflitos from (
    select data, hora, coalesce('p:' || profissional_username, 'e:' || especialidade_cod) as chave
      from public.ag_agendamentos
     where hora is not null and status in ('agendado', 'confirmado', 'presente')
     group by 1, 2, 3
    having count(*) > 1
  ) d;
  if conflitos > 0 then
    raise exception 'NAO MIGREI: % horario(s) ficariam com duas vagas para o mesmo profissional.', conflitos;
  end if;
end $$;

drop index if exists public.ag_agend_vaga_unica_prof;

do $$
declare
  esquema text;
begin
  select n.nspname into esquema
    from pg_opclass o join pg_namespace n on n.oid = o.opcnamespace
   where o.opcname = 'gin_trgm_ops' limit 1;   -- só para confirmar que o banco está migrado
  execute
    'create unique index if not exists ag_agend_vaga_unica_prof '
    'on public.ag_agendamentos '
    '   (data, hora, (coalesce(''p:'' || profissional_username, ''e:'' || especialidade_cod))) '
    ' where hora is not null and status in (''agendado'', ''confirmado'', ''presente'')';
end $$;

-- ── 4. CONFERÊNCIA (leitura; o resultado é o recibo) ────────
select 'colunas novas (esperado 3)' as item,
       count(*)::text as situacao
  from information_schema.columns
 where table_schema = 'public' and table_name = 'ag_agendamentos'
   and column_name in ('confirmado_em', 'confirmado_por', 'falta_motivo')

union all
select 'CHECK aceita confirmado',
       case when exists (
         select 1 from pg_constraint
          where conname = 'ag_agend_status_valido'
            and pg_get_constraintdef(oid) like '%confirmado%'
       ) then '✅ sim' else '❌ NAO — o status novo sera recusado pelo banco' end

union all
select 'INDICE conta confirmado como vaga ocupada',
       case when exists (
         select 1 from pg_indexes
          where schemaname = 'public' and indexname = 'ag_agend_vaga_unica_prof'
            and indexdef like '%confirmado%'
       ) then '✅ sim' else '❌ NAO — quem confirmar libera o horario para outro' end

union all
select 'indice antigo por especialidade',
       case when exists (
         select 1 from pg_indexes
          where schemaname = 'public' and indexname = 'ag_agend_vaga_unica'
       ) then '❌ AINDA EXISTE' else '✅ derrubado' end;
