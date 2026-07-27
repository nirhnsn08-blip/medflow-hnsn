-- ═══════════════════════════════════════════════════════════
-- PRONTO-SOCORRO — Comorbidades na triagem
--
-- A triagem passa a registrar as comorbidades do paciente por SELEÇÃO (HAS,
-- DM, DRC, DRC em diálise, hepatopatia, cardiopatia…) em vez de alguém digitar
-- valores de função renal/hepática. As que importam alimentam os alertas de
-- ajuste de dose da farmácia: DRC/diálise → função renal reduzida; hepatopatia
-- → função hepática comprometida. O ClCr numérico continua opcional, para
-- quando o valor exato é conhecido.
--
-- Uma coluna jsonb (lista de chaves). Aditiva e idempotente. Rodar no SQL
-- Editor — primeiro no DEMO, depois no PRINCIPAL (HNSN).
-- ═══════════════════════════════════════════════════════════

alter table public.ps_atendimentos
  add column if not exists comorbidades jsonb not null default '[]'::jsonb;

-- Verificação
select 'comorbidades ok' as resultado
 where exists (select 1 from information_schema.columns
                where table_name = 'ps_atendimentos' and column_name = 'comorbidades');
