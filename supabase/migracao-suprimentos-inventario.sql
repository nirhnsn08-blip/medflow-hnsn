-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS — Inventário cíclico + custo por entrada + código de barras
-- 1) sup_inventarios: contagens cegas (append-only) p/ acuracidade
-- 2) custo_unit nos movimentos (sup e farm) p/ custo médio ponderado
-- 3) codigo_barras no catálogo de materiais
-- Idempotente. Rodar no SQL Editor do Supabase do HNSN.
-- ═══════════════════════════════════════════════════════════

-- 1) Contagens de inventário (append-only)
create table if not exists public.sup_inventarios (
  id bigserial primary key,
  item_id bigint not null
    references public.sup_itens(id) on delete cascade,
  saldo_sistema numeric not null,
  contado numeric not null,
  diferenca numeric not null,          -- contado − sistema
  ajustado boolean default false,      -- ajuste lançado no kardex?
  observacao text,
  usuario text,
  created_at timestamptz default now()
);
create index if not exists sup_inv_item_idx
  on public.sup_inventarios (item_id, created_at desc);
alter table public.sup_inventarios enable row level security;
drop policy if exists sup_inv_select on public.sup_inventarios;
drop policy if exists sup_inv_insert on public.sup_inventarios;
create policy sup_inv_select on public.sup_inventarios
  for select to authenticated
  using (true);
create policy sup_inv_insert on public.sup_inventarios
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: histórico de contagens imutável

-- 2) Custo unitário no movimento (compras reais → custo médio ponderado)
alter table public.sup_movimentos
  add column if not exists custo_unit numeric;
alter table public.farm_movimentos
  add column if not exists custo_unit numeric;

-- 3) Código de barras no catálogo
alter table public.sup_itens
  add column if not exists codigo_barras text;
create index if not exists sup_itens_barras_idx
  on public.sup_itens (codigo_barras);

-- Verificação
select 'inventario ok' as resultado
 where exists (select 1 from information_schema.tables
                where table_schema = 'public'
                  and table_name = 'sup_inventarios')
   and exists (select 1 from information_schema.columns
                where table_name = 'sup_movimentos'
                  and column_name = 'custo_unit')
   and exists (select 1 from information_schema.columns
                where table_name = 'sup_itens'
                  and column_name = 'codigo_barras');
