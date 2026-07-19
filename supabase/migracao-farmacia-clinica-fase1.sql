-- ============================================================
-- Valentrax — Farmácia Clínica · Fase 1 (motor de alertas + base clínica)
-- Rodar UMA vez no HNSN (Supabase → SQL Editor), com o script INTEIRO.
-- Idempotente nas colunas (add if not exists). O bloco de seed preenche
-- atributos clínicos de referência (Beers, pediatria, dose máx, sonda) —
-- TUDO editável e sujeito a validação pela equipe de farmácia clínica.
-- ============================================================

-- 1) Atributos clínicos por medicamento (base de conhecimento curável)
alter table public.farm_medicamentos
  add column if not exists grupo_terapeutico text,
  add column if not exists dose_maxima_dia numeric,
  add column if not exists dose_maxima_unid text,
  add column if not exists duracao_maxima_dias int,
  add column if not exists nao_triturar boolean default false,
  add column if not exists inapropriado_idoso boolean default false,
  add column if not exists motivo_idoso text,
  add column if not exists inapropriado_pediatrico boolean default false,
  add column if not exists motivo_pediatrico text,
  add column if not exists idade_pediatrica int,          -- limiar (anos); null => usa 12
  add column if not exists ajuste_renal text,             -- usado na Fase 3
  add column if not exists ajuste_hepatico text,          -- usado na Fase 3
  add column if not exists obs_clinica text;

-- 2) Dose estruturada nos itens da prescrição (p/ checar dose máxima e duração)
alter table public.ps_prescricao_itens
  add column if not exists dose_valor numeric,
  add column if not exists dose_unidade text,
  add column if not exists frequencia_dia numeric,        -- vezes por dia (8/8h => 3)
  add column if not exists duracao_dias numeric;

-- 3) Contexto clínico do paciente (do episódio do PS)
alter table public.ps_atendimentos
  add column if not exists idade int,
  add column if not exists peso numeric(5,1),
  add column if not exists clearance_renal numeric,       -- ClCr / TFG estimada (mL/min)
  add column if not exists funcao_hepatica text,          -- normal | leve | moderada | grave
  add column if not exists alergias text,
  add column if not exists em_sonda boolean default false,
  add column if not exists gestante boolean default false;

-- ============================================================
-- SEED de atributos clínicos de referência (revisar com a equipe)
-- Fontes consagradas: Critérios de Beers (AGS), bulas/ANVISA, listas de
-- "não triturar". Valores conservadores; ajuste conforme protocolo local.
-- ============================================================
update public.farm_medicamentos m set
  grupo_terapeutico       = coalesce(v.grupo, m.grupo_terapeutico),
  dose_maxima_dia         = coalesce(v.dose_max, m.dose_maxima_dia),
  dose_maxima_unid        = coalesce(v.dose_unid, m.dose_maxima_unid),
  nao_triturar            = coalesce(v.sonda, m.nao_triturar),
  inapropriado_idoso      = coalesce(v.idoso, m.inapropriado_idoso),
  motivo_idoso            = coalesce(v.motivo_idoso, m.motivo_idoso),
  inapropriado_pediatrico = coalesce(v.ped, m.inapropriado_pediatrico),
  motivo_pediatrico       = coalesce(v.motivo_ped, m.motivo_pediatrico),
  idade_pediatrica        = coalesce(v.idade_ped, m.idade_pediatrica),
  obs_clinica             = coalesce(v.obs, m.obs_clinica)
from (values
  -- nome, grupo, dose_max(numeric), dose_unid, sonda(bool), idoso(bool), motivo_idoso, ped(bool), motivo_ped, idade_ped(int), obs
  ('Paracetamol 500 mg comprimido', null, 4000::numeric, 'mg', null::boolean, null::boolean, null, null::boolean, null, null::int, null),
  ('Paracetamol 200 mg/mL gotas', null, 4000, 'mg', null, null, null, null, null, null, null),
  ('Dipirona 500 mg comprimido', null, 4000, 'mg', null, null, null, null, null, null, null),
  ('Dipirona 500 mg/mL solução injetável', null, 4000, 'mg', null, null, null, null, null, null, null),
  ('Dipirona 500 mg/mL gotas', null, 4000, 'mg', null, null, null, null, null, null, null),
  ('Ácido acetilsalicílico 100 mg comprimido', null, null, null, null, null, null, true, 'Risco de síndrome de Reye em crianças/adolescentes (evitar em quadros virais)', 18, null),
  ('Ibuprofeno 600 mg comprimido', 'AINE', 3200, 'mg', null, null, null, null, null, null, null),
  ('Diclofenaco sódico 50 mg comprimido', 'AINE', 150, 'mg', true, null, null, null, null, null, 'Comprimido gastrorresistente — não triturar'),
  ('Diclofenaco sódico 25 mg/mL injetável', 'AINE', 150, 'mg', null, null, null, null, null, null, null),
  ('Cetoprofeno 100 mg injetável', 'AINE', null, null, null, null, null, null, null, null, null),
  ('Naproxeno 500 mg comprimido', 'AINE', null, null, null, null, null, null, null, null, null),
  ('Tenoxicam 20 mg injetável', 'AINE', null, null, null, null, null, null, null, null, null),
  ('Morfina 10 mg/mL injetável', 'Opioide', null, null, null, null, null, null, null, null, null),
  ('Morfina 10 mg comprimido', 'Opioide', null, null, null, null, null, null, null, null, null),
  ('Fentanila 50 mcg/mL injetável', 'Opioide', null, null, null, null, null, null, null, null, null),
  ('Tramadol 50 mg cápsula', 'Opioide', 400, 'mg', null, null, null, true, 'Não recomendado em menores de 12 anos (risco respiratório)', 12, null),
  ('Tramadol 50 mg/mL injetável', 'Opioide', 400, 'mg', null, null, null, true, 'Não recomendado em menores de 12 anos (risco respiratório)', 12, null),
  ('Codeína 30 mg comprimido', 'Opioide', 240, 'mg', null, null, null, true, 'Contraindicada em menores de 12 anos (metabolização variável, risco respiratório)', 12, null),
  ('Metadona 10 mg comprimido', 'Opioide', null, null, null, null, null, null, null, null, null),
  ('Diazepam 10 mg comprimido', 'Benzodiazepínico', null, null, null, true, 'Benzodiazepínico — sedação, quedas, fraturas e declínio cognitivo em idosos (Beers)', null, null, null, null),
  ('Diazepam 5 mg/mL injetável', 'Benzodiazepínico', null, null, null, true, 'Benzodiazepínico — sedação, quedas, fraturas e declínio cognitivo em idosos (Beers)', null, null, null, null),
  ('Midazolam 15 mg comprimido', 'Benzodiazepínico', null, null, null, true, 'Benzodiazepínico — sedação, quedas e declínio cognitivo em idosos (Beers)', null, null, null, null),
  ('Midazolam 5 mg/mL injetável', 'Benzodiazepínico', null, null, null, true, 'Benzodiazepínico — sedação e depressão respiratória em idosos (Beers)', null, null, null, null),
  ('Clonazepam 2 mg comprimido', 'Benzodiazepínico', null, null, null, true, 'Benzodiazepínico — sedação, quedas e declínio cognitivo em idosos (Beers)', null, null, null, null),
  ('Amitriptilina 25 mg comprimido', null, null, null, null, true, 'Antidepressivo tricíclico — forte efeito anticolinérgico (Beers)', null, null, null, null),
  ('Clorpromazina 25 mg/mL injetável', null, null, null, null, true, 'Antipsicótico — efeitos anticolinérgicos e extrapiramidais em idosos (Beers)', null, null, null, null),
  ('Prometazina 25 mg comprimido', null, null, null, null, true, 'Anti-histamínico de 1ª geração — anticolinérgico (Beers)', null, null, null, null),
  ('Prometazina 25 mg/mL injetável', null, null, null, null, true, 'Anti-histamínico de 1ª geração — anticolinérgico (Beers)', null, null, null, null),
  ('Dexclorfeniramina 2 mg comprimido', null, null, null, null, true, 'Anti-histamínico de 1ª geração — anticolinérgico (Beers)', null, null, null, null),
  ('Difenidramina 50 mg/mL injetável', null, null, null, null, true, 'Anti-histamínico de 1ª geração — anticolinérgico (Beers)', null, null, null, null),
  ('Hidroxizina 25 mg comprimido', null, null, null, null, true, 'Anti-histamínico de 1ª geração — anticolinérgico (Beers)', null, null, null, null),
  ('Fenobarbital 100 mg comprimido', null, null, null, null, true, 'Barbitúrico — alta taxa de dependência e sedação (Beers)', null, null, null, null),
  ('Fenobarbital 100 mg/mL injetável', null, null, null, null, true, 'Barbitúrico — alta taxa de dependência e sedação (Beers)', null, null, null, null),
  ('Glibenclamida 5 mg comprimido', null, null, null, null, true, 'Sulfonilureia de longa ação — hipoglicemia prolongada em idosos (Beers)', null, null, null, null),
  ('Digoxina 0,25 mg comprimido', null, null, null, null, true, 'Em idosos, evitar dose > 0,125 mg/dia (Beers)', null, null, null, null),
  ('Nifedipino 20 mg comprimido', null, null, null, null, true, 'Di-hidropiridina de ação rápida — risco de hipotensão em idosos (Beers)', null, null, null, null),
  ('Omeprazol 20 mg cápsula', 'IBP', null, null, true, null, null, null, null, null, 'Grânulos gastrorresistentes — abrir a cápsula, não triturar; dispersar e lavar bem a sonda'),
  ('Omeprazol 40 mg injetável', 'IBP', null, null, null, null, null, null, null, null, null),
  ('Pantoprazol 40 mg comprimido', 'IBP', null, null, true, null, null, null, null, null, 'Comprimido revestido entérico — não triturar'),
  ('Pantoprazol 40 mg injetável', 'IBP', null, null, null, null, null, null, null, null, null),
  ('Hidrocortisona 100 mg injetável', 'Corticoide sistêmico', null, null, null, null, null, null, null, null, null),
  ('Hidrocortisona 500 mg injetável', 'Corticoide sistêmico', null, null, null, null, null, null, null, null, null),
  ('Dexametasona 4 mg/mL injetável', 'Corticoide sistêmico', null, null, null, null, null, null, null, null, null),
  ('Dexametasona 4 mg comprimido', 'Corticoide sistêmico', null, null, null, null, null, null, null, null, null),
  ('Prednisona 20 mg comprimido', 'Corticoide sistêmico', null, null, null, null, null, null, null, null, null),
  ('Prednisolona 3 mg/mL solução oral', 'Corticoide sistêmico', null, null, null, null, null, null, null, null, null),
  ('Metilprednisolona 500 mg injetável', 'Corticoide sistêmico', null, null, null, null, null, null, null, null, null),
  ('Ciprofloxacino 500 mg comprimido', null, null, null, null, null, null, true, 'Fluoroquinolona — evitar em crianças/adolescentes salvo indicação específica (risco musculoesquelético)', 18, null),
  ('Ciprofloxacino 2 mg/mL bolsa', null, null, null, null, null, null, true, 'Fluoroquinolona — evitar em crianças/adolescentes salvo indicação específica (risco musculoesquelético)', 18, null),
  ('Levofloxacino 500 mg comprimido', null, null, null, null, null, null, true, 'Fluoroquinolona — evitar em crianças/adolescentes salvo indicação específica (risco musculoesquelético)', 18, null),
  ('Metoclopramida 10 mg comprimido', null, null, null, null, null, null, true, 'Risco de reações extrapiramidais; restrito em menores de 1 ano', 1, null),
  ('Metoclopramida 5 mg/mL injetável', null, null, null, null, null, null, true, 'Risco de reações extrapiramidais; restrito em menores de 1 ano', 1, null)
) as v(nome, grupo, dose_max, dose_unid, sonda, idoso, motivo_idoso, ped, motivo_ped, idade_ped, obs)
where lower(m.nome) = lower(v.nome);

-- Conferência sugerida:
-- select count(*) filter (where inapropriado_idoso) as beers,
--        count(*) filter (where inapropriado_pediatrico) as pediatria,
--        count(*) filter (where nao_triturar) as sonda,
--        count(*) filter (where dose_maxima_dia is not null) as dose_max
-- from public.farm_medicamentos;
