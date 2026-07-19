-- ============================================================
-- Valentrax — Farmácia · Fluxo de preparo (assinar→receber→preparo→pronto→retirada)
-- Rodar UMA vez no HNSN (Supabase → SQL Editor), com o script INTEIRO.
-- Uma linha por prescrição assinada (registro_id). "aguardando" é implícito:
-- prescrição assinada SEM linha aqui = aguardando a farmácia receber.
-- ============================================================
create table if not exists public.farm_preparo (
  id bigserial primary key,
  registro_id bigint not null unique,        -- ps_registros (prescrição assinada)
  atendimento_id bigint,
  status text not null default 'preparo',    -- preparo | pronto | retirado | cancelado
  recebido_em timestamptz, recebido_por text,
  pronto_em timestamptz,   pronto_por text,
  retirado_em timestamptz, retirado_por text,
  observacao text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists farm_preparo_at_idx on public.farm_preparo (atendimento_id);
alter table public.farm_preparo enable row level security;
drop policy if exists farm_prep_select on public.farm_preparo;
drop policy if exists farm_prep_insert on public.farm_preparo;
drop policy if exists farm_prep_update on public.farm_preparo;
drop policy if exists farm_prep_delete on public.farm_preparo;
create policy farm_prep_select on public.farm_preparo for select to authenticated using (true);
create policy farm_prep_insert on public.farm_preparo for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_prep_update on public.farm_preparo for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_prep_delete on public.farm_preparo for delete to authenticated using (public.my_role() = 'adm_master');
