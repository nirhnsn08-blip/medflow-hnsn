-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS — Fase C: pedidos de compra
-- Pedido por fornecedor com itens de MATERIAL (almoxarifado) e/ou
-- MEDICAMENTO (farmácia). Recebimento gera entrada automática no
-- estoque correspondente. Idempotente. Rodar no SQL Editor do HNSN.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.sup_pedidos (
  id bigserial primary key,
  fornecedor_id bigint
    references public.sup_fornecedores(id) on delete set null,
  fornecedor_nome text,
  itens jsonb not null default '[]',
  -- [{tipo:'material'|'medicamento', item_id, nome, unidade,
  --   qtd, custo_unit, qtd_recebida}]
  status text not null default 'aberto',
  -- aberto | enviado | parcial | recebido | cancelado
  previsao_entrega date,
  observacao text,
  enviado_em timestamptz,  enviado_por text,
  recebido_em timestamptz, recebido_por text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists sup_ped_status_idx
  on public.sup_pedidos (status, created_at desc);
create index if not exists sup_ped_forn_idx
  on public.sup_pedidos (fornecedor_id);
alter table public.sup_pedidos enable row level security;
drop policy if exists sup_ped_select on public.sup_pedidos;
drop policy if exists sup_ped_insert on public.sup_pedidos;
drop policy if exists sup_ped_update on public.sup_pedidos;
drop policy if exists sup_ped_delete on public.sup_pedidos;
create policy sup_ped_select on public.sup_pedidos
  for select to authenticated
  using (true);
create policy sup_ped_insert on public.sup_pedidos
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_ped_update on public.sup_pedidos
  for update to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_ped_delete on public.sup_pedidos
  for delete to authenticated
  using (public.my_role() = 'adm_master');

-- Verificação
select 'sup_pedidos ok' as resultado
 where exists (select 1 from information_schema.tables
                where table_schema = 'public'
                  and table_name = 'sup_pedidos');
