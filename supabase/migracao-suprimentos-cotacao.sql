-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS — Cotação de compra (comparar preços entre fornecedores)
-- 1 tabela. Idempotente. Rodar no SQL Editor do HNSN.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.sup_cotacoes (
  id bigserial primary key,
  descricao text,
  itens jsonb not null default '[]',
  -- [{tipo:'material'|'medicamento', item_id, nome, unidade, qtd,
  --   precos: { <fornecedor_id>: preco_unit }}]
  fornecedores jsonb not null default '[]',   -- ids dos fornecedores cotados
  status text not null default 'aberta',      -- aberta | fechada | cancelada
  observacao text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists sup_cot_status_idx
  on public.sup_cotacoes (status, created_at desc);
alter table public.sup_cotacoes enable row level security;
drop policy if exists sup_cot_select on public.sup_cotacoes;
drop policy if exists sup_cot_insert on public.sup_cotacoes;
drop policy if exists sup_cot_update on public.sup_cotacoes;
drop policy if exists sup_cot_delete on public.sup_cotacoes;
create policy sup_cot_select on public.sup_cotacoes
  for select to authenticated
  using (true);
create policy sup_cot_insert on public.sup_cotacoes
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_cot_update on public.sup_cotacoes
  for update to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_cot_delete on public.sup_cotacoes
  for delete to authenticated
  using (public.my_role() = 'adm_master');

-- Verificação
select 'sup_cotacoes ok' as resultado
 where exists (select 1 from information_schema.tables
                where table_schema = 'public'
                  and table_name = 'sup_cotacoes');
