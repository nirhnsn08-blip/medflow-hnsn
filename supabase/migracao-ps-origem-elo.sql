-- ═══════════════════════════════════════════════════════════
-- PRONTO-SOCORRO — origem da chegada + elo forte PS → leito
--
-- 1) Origem/procedência do paciente (SAMU, GERINT, meios próprios…)
-- 2) Vínculo por ID entre o atendimento do PS, a fila de leito e o leito.
--    Hoje o elo é pelo NÚMERO DO PRONTUÁRIO como texto: se vier vazio ou
--    digitado diferente, o rastro do paciente quebra entre o PS e a internação.
-- Idempotente. Rodar no SQL Editor do HNSN.
-- ═══════════════════════════════════════════════════════════

-- 1) Origem da chegada
alter table public.ps_atendimentos
  add column if not exists origem text,          -- SAMU | Transalva | Polícia Militar | Bombeiros | Meios próprios | GERINT | Outro
  add column if not exists origem_detalhe text;  -- unidade de origem no GERINT (PA Torres, Arroio do Sal, Três Cachoeiras…)
create index if not exists ps_atend_origem_idx on public.ps_atendimentos (origem);

-- 2) Elo forte: fila de leito e leito apontam para o atendimento do PS
alter table public.solicitacoes
  add column if not exists ps_atendimento_id bigint
    references public.ps_atendimentos(id) on delete set null;
create index if not exists solic_ps_atend_idx on public.solicitacoes (ps_atendimento_id);

alter table public.leitos
  add column if not exists ps_atendimento_id bigint
    references public.ps_atendimentos(id) on delete set null;
create index if not exists leitos_ps_atend_idx on public.leitos (ps_atendimento_id);

-- Verificação
select 'origem+elo ok' as resultado
 where exists (select 1 from information_schema.columns
                where table_name = 'ps_atendimentos' and column_name = 'origem')
   and exists (select 1 from information_schema.columns
                where table_name = 'solicitacoes' and column_name = 'ps_atendimento_id')
   and exists (select 1 from information_schema.columns
                where table_name = 'leitos' and column_name = 'ps_atendimento_id');
