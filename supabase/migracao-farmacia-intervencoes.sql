-- ============================================================
-- Valentrax — Farmácia · Intervenção farmacêutica (estilo NoHarm)
-- Rodar UMA vez no HNSN (Supabase → SQL Editor).
-- Registro das intervenções do farmacêutico sobre a prescrição, com
-- problema, conduta proposta e desfecho (aceita/não aceita/resolvida).
-- ============================================================
create table if not exists public.farm_intervencoes (
  id bigserial primary key,
  atendimento_id bigint,
  prescricao_item_id bigint,
  medicamento_nome text,
  paciente_iniciais text, paciente_prontuario text,
  tipo text,                              -- categoria do problema (alerta que originou)
  gravidade text,                         -- alta | media | baixa
  problema text not null,                 -- descrição do problema identificado
  conduta text,                           -- conduta/recomendação proposta
  status text not null default 'pendente',-- pendente | aceita | nao_aceita | resolvida | cancelada
  desfecho text,                          -- observação do desfecho / resposta do prescritor
  farmaceutico text,                      -- quem interveio
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists farm_interv_at_idx on public.farm_intervencoes (atendimento_id);
create index if not exists farm_interv_status_idx on public.farm_intervencoes (status);
alter table public.farm_intervencoes enable row level security;
drop policy if exists farm_interv2_select on public.farm_intervencoes;
drop policy if exists farm_interv2_insert on public.farm_intervencoes;
drop policy if exists farm_interv2_update on public.farm_intervencoes;
drop policy if exists farm_interv2_delete on public.farm_intervencoes;
create policy farm_interv2_select on public.farm_intervencoes for select to authenticated using (true);
create policy farm_interv2_insert on public.farm_intervencoes for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_interv2_update on public.farm_intervencoes for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_interv2_delete on public.farm_intervencoes for delete to authenticated using (public.my_role() = 'adm_master');
