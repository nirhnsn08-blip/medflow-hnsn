-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS — Aprovação de pedidos de compra pela matriz
--
-- O comprador monta o pedido (status "aberto"), envia para aprovação
-- ("aguardando_aprovacao"), e a matriz aprova ("aprovado") ou nega ("negado",
-- com motivo). Só depois de aprovado o pedido pode ir ao fornecedor ("enviado").
--
-- `status` é texto sem constraint — os novos valores não exigem mudança de
-- estrutura. Só a TRILHA da decisão precisa de colunas: quando foi enviado para
-- aprovação, quem decidiu, quando, e por que negou.
--
-- Aditiva e idempotente (só `add column if not exists`). Rodar no SQL Editor —
-- primeiro no DEMO, depois no PRINCIPAL (HNSN). As colunas herdam as policies
-- que a tabela já tem (update por adm_master/adm_silver).
-- ═══════════════════════════════════════════════════════════

alter table public.sup_pedidos
  add column if not exists aprovacao_em   timestamptz,  -- enviado para aprovação em
  add column if not exists decidido_por   text,         -- quem aprovou ou negou
  add column if not exists decidido_em    timestamptz,  -- quando decidiu
  add column if not exists negado_motivo  text;         -- motivo, quando negado

-- Verificação
select 'aprovação de compras ok' as resultado
 where exists (select 1 from information_schema.columns
                where table_name = 'sup_pedidos' and column_name = 'aprovacao_em')
   and exists (select 1 from information_schema.columns
                where table_name = 'sup_pedidos' and column_name = 'decidido_por')
   and exists (select 1 from information_schema.columns
                where table_name = 'sup_pedidos' and column_name = 'negado_motivo');
