-- ═══════════════════════════════════════════════════════════
-- GIRO DE LEITOS — Regulação (NIR): rastro do "quem pegou o caso"
--
-- A fila de leito (public.solicitacoes) já recebe as internações do PS
-- (elo forte ps_atendimento_id) e as transferências entre setores, mas hoje
-- não guarda NADA sobre a regulação em si: não dá para separar "pedido novo,
-- ninguém olhou" de "o NIR já está cuidando", nem medir quanto tempo o caso
-- levou da fila até sair.
--
-- Três colunas resolvem isso, sem tabela nova:
--   visto_em / visto_por  — quando/quem marcou "estou regulando" (o "ciente");
--   resolvido_em          — quando saiu da fila (atendido/cancelado).
-- Com isso o aviso do menu distingue não-visto de em-regulação, e fica
-- mensurável o tempo pedido → visto → resolvido.
--
-- As três herdam as policies que a tabela já tem: solic_select (todos leem) e
-- solic_write (adm_master/adm_silver escrevem) — nenhuma policy nova.
--
-- Aditiva e idempotente (só `add column if not exists`): pode rodar duas vezes,
-- não apaga nem altera nada. Rodar no SQL Editor — primeiro no DEMO, depois no
-- PRINCIPAL (HNSN).
-- ═══════════════════════════════════════════════════════════

alter table public.solicitacoes
  add column if not exists visto_em     timestamptz,  -- o NIR marcou "estou regulando"
  add column if not exists visto_por    text,         -- quem marcou
  add column if not exists resolvido_em timestamptz;  -- saiu da fila (atendido/cancelado)

-- Verificação
select 'regulação NIR ok' as resultado
 where exists (select 1 from information_schema.columns
                where table_name = 'solicitacoes' and column_name = 'visto_em')
   and exists (select 1 from information_schema.columns
                where table_name = 'solicitacoes' and column_name = 'visto_por')
   and exists (select 1 from information_schema.columns
                where table_name = 'solicitacoes' and column_name = 'resolvido_em');
