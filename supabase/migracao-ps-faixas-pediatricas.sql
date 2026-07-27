-- ═══════════════════════════════════════════════════════════
-- PRONTO-SOCORRO — Faixas pediátricas de referência (Triagem Fase 3, peds)
--
-- Religa a SUGESTÃO automática de Manchester para a triagem pediátrica, com
-- faixas de sinais vitais POR IDADE (as de adulto não servem: FC 140 é normal
-- em bebê e alarme em adulto). A sugestão continua sendo APOIO À DECISÃO — a
-- enfermeira classifica; o software só sugere.
--
-- ⚠️ VALORES DE PARTIDA (RASCUNHO) — baseados em faixas pediátricas padrão
-- (tipo PALS/APLS). Cada faixa nasce com `validado = false`: enquanto o ADM
-- Master não validar na tela, a triagem mostra "faixas pediátricas em
-- validação". A equipe edita os números pela própria tela (só ADM Master).
--
-- Modelo por vital (FC e FR), 6 limites em ordem crescente definindo as zonas:
--   x < grave_min                     → vermelho (grave baixo)
--   [grave_min,  moderado_min)        → laranja
--   [moderado_min, normal_min)        → amarelo
--   [normal_min, normal_max]          → verde (normal para a idade)
--   (normal_max, moderado_max]        → amarelo
--   (moderado_max, grave_max]         → laranja
--   x > grave_max                     → vermelho (grave alto)
-- Colunas nulas => aquela zona não é usada (o motor degrada com segurança).
--
-- PA NÃO entra na pediatria (a unidade não mede PA em criança por falta de
-- material adequado) — nem tabela, nem motor.
--
-- Aditiva e idempotente. Rodar no SQL Editor — primeiro no DEMO, depois no
-- PRINCIPAL (HNSN). O seed usa ON CONFLICT DO NOTHING: reexecutar não
-- sobrescreve os valores que a equipe já tiver editado.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.ps_faixas_pediatricas (
  faixa            text primary key,          -- slug estável (neonato, lactente, ...)
  ordem            int  not null default 0,
  rotulo           text not null,
  idade_min_meses  int  not null,             -- inclusivo
  idade_max_meses  int,                        -- exclusivo; null = sem teto (>= 12 anos)
  fc_grave_min     int, fc_moderado_min int, fc_normal_min int,
  fc_normal_max    int, fc_moderado_max int, fc_grave_max int,
  fr_grave_min     int, fr_moderado_min int, fr_normal_min int,
  fr_normal_max    int, fr_moderado_max int, fr_grave_max int,
  validado         boolean     not null default false,
  ativo            boolean     not null default true,
  usuario          text,
  updated_at       timestamptz not null default now()
);

-- Seed do rascunho (não sobrescreve edições — ON CONFLICT DO NOTHING).
insert into public.ps_faixas_pediatricas
  (faixa, ordem, rotulo, idade_min_meses, idade_max_meses,
   fc_grave_min, fc_moderado_min, fc_normal_min, fc_normal_max, fc_moderado_max, fc_grave_max,
   fr_grave_min, fr_moderado_min, fr_normal_min, fr_normal_max, fr_moderado_max, fr_grave_max)
values
  ('neonato',  0, 'Neonato (0–1 mês)',    0,   1,   80, 90, 100, 180, 190, 205,   20, 25, 30, 60, 70, 80),
  ('lactente', 1, 'Lactente (1–11 meses)',1,  12,   80, 90, 100, 160, 170, 190,   20, 25, 30, 53, 60, 70),
  ('1a2',      2, '1–2 anos',            12,  36,   70, 80,  90, 150, 160, 180,   15, 18, 22, 37, 45, 55),
  ('3a5',      3, '3–5 anos',            36,  72,   60, 70,  80, 140, 150, 170,   12, 16, 20, 28, 35, 45),
  ('6a11',     4, '6–11 anos',           72, 144,   50, 60,  70, 120, 130, 150,   10, 14, 18, 25, 30, 40),
  ('12mais',   5, '≥ 12 anos (= adulto)',144, null, 40, 50,  60,  99, 120, 150,    8, 10, 12, 20, 24, 35)
on conflict (faixa) do nothing;

-- Verificação
select 'ps_faixas_pediatricas ok — ' || count(*) || ' faixas' as resultado
  from public.ps_faixas_pediatricas;
