-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS — Ponto de pedido: prazo de entrega por fornecedor
-- 1 coluna nova. Idempotente. Rodar no SQL Editor do HNSN.
-- ═══════════════════════════════════════════════════════════
alter table public.sup_fornecedores
  add column if not exists lead_time_dias int;

-- Verificação
select 'lead_time ok' as resultado
 where exists (select 1 from information_schema.columns
                where table_name = 'sup_fornecedores'
                  and column_name = 'lead_time_dias');
