-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS — Fase B: requisições de materiais pelos setores
-- Fluxo: setor pede → almoxarifado recebe (bipe) → separa (baixa FEFO
-- automática no estoque) → pronto → setor confirma a entrega.
-- Idempotente. Rodar no SQL Editor do Supabase do HNSN.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.sup_requisicoes (
  id bigserial primary key,
  setor text not null,
  itens jsonb not null default '[]',
  -- [{item_id, nome, unidade, qtd, qtd_atendida}]
  status text not null default 'aguardando',
  -- aguardando | separacao | pronto | entregue | cancelado
  observacao text,
  solicitado_por text,
  recebido_em timestamptz, recebido_por text,
  pronto_em timestamptz,   pronto_por text,
  entregue_em timestamptz, entregue_por text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists sup_req_status_idx
  on public.sup_requisicoes (status, created_at desc);
alter table public.sup_requisicoes enable row level security;
drop policy if exists sup_req_select on public.sup_requisicoes;
drop policy if exists sup_req_insert on public.sup_requisicoes;
drop policy if exists sup_req_update on public.sup_requisicoes;
drop policy if exists sup_req_delete on public.sup_requisicoes;
create policy sup_req_select on public.sup_requisicoes
  for select to authenticated
  using (true);
create policy sup_req_insert on public.sup_requisicoes
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_req_update on public.sup_requisicoes
  for update to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_req_delete on public.sup_requisicoes
  for delete to authenticated
  using (public.my_role() = 'adm_master');

-- Verificação
select table_name from information_schema.tables
 where table_schema = 'public'
   and table_name = 'sup_requisicoes';
