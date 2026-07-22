-- ═══════════════════════════════════════════════════════════
-- PRONTO-SOCORRO — Mapa de salas (Emergência / Observação / Sala Vermelha)
-- 1 tabela nova. Idempotente. Rodar no SQL Editor do HNSN.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.ps_salas (
  id bigserial primary key,
  identificacao text not null unique,   -- "01", "02", "Sala 03"...
  area text not null default 'Emergência',  -- Emergência | Observação | Sala Vermelha | ...
  status text not null default 'disponivel', -- disponivel | ocupado | limpeza | manutencao
  atendimento_id bigint                     -- paciente do PS ocupando a sala
    references public.ps_atendimentos(id) on delete set null,
  ocupado_em timestamptz,
  observacao text,
  ordem int default 0,
  ativo boolean default true,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists ps_salas_area_idx on public.ps_salas (area, ordem);
create index if not exists ps_salas_atend_idx on public.ps_salas (atendimento_id);
alter table public.ps_salas enable row level security;
drop policy if exists ps_salas_select on public.ps_salas;
drop policy if exists ps_salas_insert on public.ps_salas;
drop policy if exists ps_salas_update on public.ps_salas;
drop policy if exists ps_salas_delete on public.ps_salas;
create policy ps_salas_select on public.ps_salas
  for select to authenticated
  using (true);
create policy ps_salas_insert on public.ps_salas
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy ps_salas_update on public.ps_salas
  for update to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy ps_salas_delete on public.ps_salas
  for delete to authenticated
  using (public.my_role() = 'adm_master');

-- Verificação
select 'ps_salas ok' as resultado
 where exists (select 1 from information_schema.tables
                where table_schema = 'public' and table_name = 'ps_salas');
