-- ═══════════════════════════════════════════════════════════
-- FARMÁCIA CLÍNICA — RISCO NA GESTAÇÃO E DOSE MÁXIMA POR KG
--
-- Desde a Fase 1 da farmácia clínica o atendimento do PS guarda `peso` e
-- `gestante` (ps_atendimentos), e o painel de contexto clínico diz "informe
-- para habilitar os alertas". O motor de alertas nunca leu nenhum dos dois:
-- faltava, no CATÁLOGO, o que comparar com eles.
--
-- Esta migração cria esse lado:
--
--   risco_gestacao        A | B | C | D | X — a categoria da BULA (ANVISA).
--                         Só D e X geram alerta. A, B e C marcam o item
--                         como conferido para gestante.
--   motivo_gestacao       texto livre que aparece no alerta (D e X)
--   dose_maxima_kg_dia    dose máxima por kg de peso por dia
--   dose_maxima_kg_unid   unidade dessa dose (mg, mcg, UI…) — o motor só
--                         compara quando a unidade prescrita é a mesma
--
-- ── O MOTOR NÃO TRAZ LISTA PRÓPRIA ──────────────────────────
-- Nenhum valor é semeado aqui. As colunas nascem vazias e são preenchidas
-- pela farmácia do hospital, na tela do catálogo (Farmácia → Estoque →
-- medicamento → "Atributos clínicos"). Enquanto estiverem vazias:
--   · gestante recebe o aviso "Risco na gestação NÃO conferido", listando
--     os medicamentos sem categoria — e não um silêncio que pareça conferido;
--   · medicamento sem dose por kg simplesmente não tem essa conferência.
--
-- ── ORDEM DE IMPLANTAÇÃO ────────────────────────────────────
-- Pode rodar antes ou depois do merge. O salvar do catálogo só manda estas
-- colunas quando elas já existem no banco (ou quando alguém preenche), então
-- o editor de medicamento não quebra num banco que ainda não rodou isto.
-- Aditiva e idempotente. DEMO primeiro.
-- ═══════════════════════════════════════════════════════════

set valentrax.quem = 'adauam';

alter table public.farm_medicamentos
  add column if not exists risco_gestacao text
    check (risco_gestacao in ('A', 'B', 'C', 'D', 'X')),
  add column if not exists motivo_gestacao text,
  add column if not exists dose_maxima_kg_dia numeric
    check (dose_maxima_kg_dia > 0),
  add column if not exists dose_maxima_kg_unid text;

comment on column public.farm_medicamentos.risco_gestacao is
  'Categoria de risco na gestação da bula (ANVISA): A, B, C, D ou X. Só D e X alertam.';
comment on column public.farm_medicamentos.motivo_gestacao is
  'Texto que aparece no alerta de gestação (categorias D e X).';
comment on column public.farm_medicamentos.dose_maxima_kg_dia is
  'Dose máxima por kg de peso por dia. Exige o peso do paciente no atendimento.';
comment on column public.farm_medicamentos.dose_maxima_kg_unid is
  'Unidade da dose máxima por kg/dia (mg, mcg, UI…). Só compara com prescrição na mesma unidade.';

-- O PostgREST guarda o esquema em cache: sem isto as colunas novas só
-- aparecem para o app depois que o cache expirar.
notify pgrst, 'reload schema';

insert into public.migracoes_aplicadas (arquivo)
values ('migracao-alertas-peso-gestacao.sql') on conflict do nothing;

reset valentrax.quem;
