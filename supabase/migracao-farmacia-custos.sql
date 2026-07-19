-- ============================================================
-- Valentrax — Farmácia · Custos (custo unitário por medicamento)
-- Rodar UMA vez no HNSN (Supabase → SQL Editor).
-- Não altera dados; só adiciona a coluna de custo. Os preços são
-- preenchidos pela equipe no catálogo (Estoque → Editar).
-- ============================================================
alter table public.farm_medicamentos
  add column if not exists custo_unitario numeric;   -- R$ por unidade de dispensação
