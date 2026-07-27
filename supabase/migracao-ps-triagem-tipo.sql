-- ═══════════════════════════════════════════════════════════
-- PRONTO-SOCORRO — Tipo de triagem (Adulto / Obstétrica / Pediátrica)
--
-- A triagem passa a ter um TIPO. Cada tipo abre os campos próprios:
--   • Obstétrica: idade gestacional, G/partos/cesáreas/abortos, sangramento,
--     perda de líquido, movimento fetal, contrações.
--   • Pediátrica: peso e idade em meses (o peso vai para a coluna `peso`, que
--     alimenta a checagem de dose; aqui guardamos os detalhes da triagem).
--
-- IMPORTANTE: esta migração só GUARDA os dados. A CLASSIFICAÇÃO de risco
-- obstétrica/pediátrica continua sendo feita pela enfermeira — as faixas/
-- sugestões automáticas adaptadas são uma fase posterior, após validação
-- clínica do HNSN. Software não inventa risco obstétrico/pediátrico.
--
-- Dois blobs jsonb + uma coluna de tipo. Aditiva e idempotente. Rodar no SQL
-- Editor — primeiro no DEMO, depois no PRINCIPAL (HNSN).
-- ═══════════════════════════════════════════════════════════

alter table public.ps_atendimentos
  add column if not exists triagem_tipo text,                          -- adulto | obstetrica | pediatrica
  add column if not exists obstetricia jsonb not null default '{}'::jsonb,
  add column if not exists pediatria   jsonb not null default '{}'::jsonb;

-- Verificação
select 'triagem_tipo ok' as resultado
 where exists (select 1 from information_schema.columns
                where table_name = 'ps_atendimentos' and column_name = 'triagem_tipo')
   and exists (select 1 from information_schema.columns
                where table_name = 'ps_atendimentos' and column_name = 'obstetricia')
   and exists (select 1 from information_schema.columns
                where table_name = 'ps_atendimentos' and column_name = 'pediatria');
