-- ============================================================
-- Valentrax — Farmácia · Medicamentos NÃO padronizados (trazidos pela família)
-- Rodar UMA vez no HNSN (Supabase → SQL Editor).
-- Registro dos medicamentos que NÃO estão no catálogo do hospital e que
-- o paciente/família traz — recebidos e controlados pela farmácia.
-- ============================================================
create table if not exists public.farm_nao_padronizados (
  id bigserial primary key,
  paciente_iniciais text not null,
  paciente_prontuario text,
  setor text,
  medicamento text not null,             -- nome livre (fora do catálogo)
  apresentacao text,                      -- forma / concentração
  quantidade numeric,
  unidade text,
  lote text, validade date,
  origem text,                            -- quem trouxe (ex.: familiar, próprio paciente)
  conferido boolean default false,        -- conferido/aprovado pelo farmacêutico
  status text not null default 'recebido',-- recebido | em_uso | devolvido | descartado
  observacao text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists farm_naopad_pac_idx on public.farm_nao_padronizados (paciente_prontuario);
alter table public.farm_nao_padronizados enable row level security;
drop policy if exists farm_naopad_select on public.farm_nao_padronizados;
drop policy if exists farm_naopad_insert on public.farm_nao_padronizados;
drop policy if exists farm_naopad_update on public.farm_nao_padronizados;
drop policy if exists farm_naopad_delete on public.farm_nao_padronizados;
create policy farm_naopad_select on public.farm_nao_padronizados for select to authenticated using (true);
create policy farm_naopad_insert on public.farm_nao_padronizados for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_naopad_update on public.farm_nao_padronizados for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_naopad_delete on public.farm_nao_padronizados for delete to authenticated using (public.my_role() = 'adm_master');
