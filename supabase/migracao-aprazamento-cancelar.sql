-- ═══════════════════════════════════════════════════════════
-- CANCELAR UMA DOSE APRAZADA, SEM APAGÁ-LA
--
-- `pep_aprazamentos` nasceu completa — `previsto_para`, `dose_prevista`,
-- `sequencia`, `aprazado_por`, `conselho`, `registro_conselho` — e ficou
-- com ZERO usos em todo o código (medido em 15/10/2026). Agora ela entra
-- em uso, e ao entrar faltou uma coisa só: como DESFAZER uma dose.
--
-- 💡 POR QUE NÃO BASTA APAGAR A LINHA
--
-- Aprazar é ato de enfermagem com registro no conselho (COFEN). Apagar a
-- linha apaga quem aprazou aquela dose — e a pergunta que aparece depois
-- de um evento adverso é exatamente "quem combinou este horário, e quem
-- mudou". Linha apagada não responde.
--
-- Então reaprazar CANCELA as doses futuras, com motivo e com quem
-- cancelou, e insere as novas ao lado. A tabela segue append-only como o
-- resto do prontuário.
--
-- 🔒 RECUSAS (no gatilho, provadas em PGlite):
--   1. cancelar sem motivo de verdade;
--   2. cancelar dose que JÁ FOI ADMINISTRADA — a dose aconteceu, e o plano
--      não reescreve o fato;
--   3. descancelar (voltar `cancelado_em` para nulo).
--
-- ⚠️ POR QUE UM GATILHO E NÃO SÓ UM CHECK: a recusa 2 precisa olhar
-- `pep_administracoes`, que um check constraint não alcança.
--
-- ADITIVA. IDEMPOTENTE.
--
-- COMO DESFAZER:
--   drop trigger if exists trg_apraz_cancelar on public.pep_aprazamentos;
--   drop function if exists public.apraz_cancelar();
--   alter table public.pep_aprazamentos
--     drop column if exists cancelado_em,
--     drop column if exists cancelado_por,
--     drop column if exists cancelamento_motivo;
-- ═══════════════════════════════════════════════════════════

set valentrax.quem = 'adauam';


alter table public.pep_aprazamentos add column if not exists cancelado_em timestamptz;
alter table public.pep_aprazamentos add column if not exists cancelado_por text;
alter table public.pep_aprazamentos add column if not exists cancelamento_motivo text;

comment on column public.pep_aprazamentos.cancelado_em is
  'Quando esta dose aprazada deixou de valer. Nulo = vigente. Cancelar em vez de apagar preserva quem aprazou — aprazar é ato de enfermagem com registro no conselho.';


-- 🔴 A dose cancelada precisa dizer por quê: "a dose das 18h sumiu" sem
-- motivo é a pergunta que ninguém consegue responder depois.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pep_apraz_cancel_ck') then
    alter table public.pep_aprazamentos add constraint pep_apraz_cancel_ck
      check (cancelado_em is null or length(btrim(coalesce(cancelamento_motivo, ''))) >= 5);
  end if;
end $$;

-- As doses que ainda valem, que é a consulta de toda grade.
create index if not exists pep_apraz_vigentes_idx
  on public.pep_aprazamentos (item_id, previsto_para) where cancelado_em is null;


create or replace function public.apraz_cancelar()
returns trigger
language plpgsql
set search_path = public
as $apz$
declare
  ja bigint;
begin
  -- Só interessa a transição para cancelado.
  if new.cancelado_em is null then
    -- 🔴 DESCANCELAR NÃO EXISTE. Uma dose cancelada foi comunicada como
    -- cancelada; ressuscitá-la faria a enfermagem da escala seguinte achar
    -- que deve administrar algo que o turno anterior tirou da grade.
    if tg_op = 'UPDATE' and old.cancelado_em is not null then
      raise exception
        'Esta dose já foi cancelada (%). Dose cancelada não volta — apraze uma nova no lugar.',
        old.cancelamento_motivo;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and old.cancelado_em is not null then
    return new;   -- já estava cancelada; nada a fazer
  end if;

  -- 🔴 DOSE JÁ ADMINISTRADA NÃO SE CANCELA. O plano não reescreve o fato:
  -- o medicamento entrou no paciente, e um aprazamento cancelado faria a
  -- administração ficar órfã — sem a dose que ela cumpriu.
  select a.id into ja
    from public.pep_administracoes a
   where a.aprazamento_id = new.id
     and coalesce(a.status, 'administrado') = 'administrado'
   limit 1;
  if ja is not null then
    raise exception
      'Esta dose JÁ FOI ADMINISTRADA (registro #%). O plano não reescreve o fato — se houve erro, o caminho é a correção da administração.',
      ja;
  end if;

  new.cancelado_em := coalesce(new.cancelado_em, now());
  return new;
end;
$apz$;

drop trigger if exists trg_apraz_cancelar on public.pep_aprazamentos;
create trigger trg_apraz_cancelar
  before insert or update on public.pep_aprazamentos
  for each row execute function public.apraz_cancelar();


insert into public.migracoes_aplicadas (arquivo)
values ('migracao-aprazamento-cancelar.sql') on conflict do nothing;

reset valentrax.quem;

notify pgrst, 'reload schema';


-- ───────────────────────────────────────────────────────────
-- CONFERÊNCIA
-- ───────────────────────────────────────────────────────────
select item, case when ok then '✅' else '❌' end as situacao from (
  select 'coluna ' || c as item, exists (
           select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'pep_aprazamentos' and column_name = c) as ok
    from unnest(array['cancelado_em', 'cancelado_por', 'cancelamento_motivo']) c
  union all
  select 'trava do motivo de cancelamento',
         exists (select 1 from pg_constraint where conname = 'pep_apraz_cancel_ck')
  union all
  select '🔴 gatilho que recusa cancelar dose administrada',
         exists (select 1 from pg_trigger where tgname = 'trg_apraz_cancelar')
  union all
  select 'índice das doses vigentes',
         exists (select 1 from pg_class where relname = 'pep_apraz_vigentes_idx')
  union all
  select 'migração anotada no registro',
         exists (select 1 from public.migracoes_aplicadas
                  where arquivo = 'migracao-aprazamento-cancelar.sql')
) x;

-- ⚠️ A tabela estava vazia até hoje (zero usos no código). Se este número
-- não for 0, alguém escreveu nela por fora — vale olhar antes de seguir.
select count(*) as aprazamentos_ja_existentes from public.pep_aprazamentos;
