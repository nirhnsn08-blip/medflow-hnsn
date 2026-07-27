-- ═══════════════════════════════════════════════════════════
-- PRONTO-SOCORRO — Critérios obstétricos de risco (Triagem Fase 3, obstétrica)
--
-- Religa a SUGESTÃO automática de Manchester para a triagem OBSTÉTRICA, por
-- DISCRIMINADORES (não faixas numéricas): sangramento, movimento fetal, perda
-- de líquido, contrações e PA (pré-eclâmpsia). Continua sendo APOIO À DECISÃO —
-- a enfermeira classifica; o software só sugere.
--
-- ⚠️ VALORES DE PARTIDA (RASCUNHO) — baseados em protocolos de acolhimento e
-- classificação de risco em obstetrícia / Manchester obstétrico. Cada regra
-- nasce com `validado = false`: enquanto o ADM Master não validar na tela, a
-- triagem mostra "critérios obstétricos em validação". A equipe edita os níveis
-- e limiares pela própria tela (só ADM Master).
--
-- Cada linha é uma REGRA:
--   • Discriminador (sangramento, mov_fetal_ausente, mov_fetal_reduzido,
--     perda_liquido, contracoes): dispara `nivel` quando o achado está presente.
--   • Regra de PA (pas_min / pad_min preenchidos): dispara `nivel` quando a PA
--     atinge o limiar. Se `requer_sintoma`, exige também cefaleia/epigastralgia/
--     alteração visual marcados (iminência de pré-eclâmpsia).
-- O motor (src/clinico/obstetricia.js) conhece cada `chave`; a tela deixa
-- editar níveis, limiares, ativo e validado — não inventar discriminador novo.
--
-- Diferente da pediátrica: aqui a PA É usada (é peça central da pré-eclâmpsia).
--
-- Aditiva e idempotente. Rodar no SQL Editor — primeiro no DEMO, depois no
-- PRINCIPAL (HNSN). ON CONFLICT DO NOTHING: reexecutar não sobrescreve edições.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.ps_faixas_obstetricas (
  chave           text primary key,          -- slug conhecido pelo motor
  ordem           int  not null default 0,
  rotulo          text not null,
  nivel           text not null,             -- vermelho | laranja | amarelo | verde | azul
  pas_min         int,                        -- limiar PA sistólica (>=); null = não é regra de PA
  pad_min         int,                        -- limiar PA diastólica (>=)
  requer_sintoma  boolean     not null default false,  -- exige sintoma de pré-eclâmpsia
  ativo           boolean     not null default true,
  validado        boolean     not null default false,
  usuario         text,
  updated_at      timestamptz not null default now()
);

-- Seed do rascunho (não sobrescreve edições — ON CONFLICT DO NOTHING).
insert into public.ps_faixas_obstetricas
  (chave, ordem, rotulo, nivel, pas_min, pad_min, requer_sintoma)
values
  ('preeclampsia_grave',     0, 'PA ≥ 160/110 + sintoma (cefaleia/epigastralgia/visual)', 'vermelho', 160, 110, true),
  ('pa_grave',               1, 'PA ≥ 160/110 (hipertensão grave)',                       'laranja',  160, 110, false),
  ('sangramento',            2, 'Sangramento vaginal',                                    'laranja',  null, null, false),
  ('mov_fetal_ausente',      3, 'Movimento fetal ausente',                                'laranja',  null, null, false),
  ('preeclampsia_iminencia', 4, 'PA ≥ 140/90 + sintoma (cefaleia/epigastralgia/visual)',  'laranja',  140,  90, true),
  ('pa_alerta',              5, 'PA 140–159 / 90–109 (hipertensão)',                      'amarelo',  140,  90, false),
  ('mov_fetal_reduzido',     6, 'Movimento fetal reduzido',                               'amarelo',  null, null, false),
  ('perda_liquido',          7, 'Perda de líquido (bolsa rota)',                          'amarelo',  null, null, false),
  ('contracoes',             8, 'Contrações',                                             'amarelo',  null, null, false)
on conflict (chave) do nothing;

-- Verificação
select 'ps_faixas_obstetricas ok — ' || count(*) || ' regras' as resultado
  from public.ps_faixas_obstetricas;
