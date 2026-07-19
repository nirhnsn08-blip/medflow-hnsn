-- ============================================================
-- Valentrax — Farmácia Clínica · Fase 3 (ajuste renal/hepático)
-- Rodar UMA vez no HNSN (Supabase → SQL Editor), com o script INTEIRO.
-- NÃO altera estrutura (colunas ajuste_renal/ajuste_hepatico já existem
-- desde a Fase 1). Só preenche orientações de referência — CONSERVADOR e
-- SUJEITO A VALIDAÇÃO pela equipe de farmácia clínica.
-- ============================================================
update public.farm_medicamentos m set
  ajuste_renal    = coalesce(v.ren, m.ajuste_renal),
  ajuste_hepatico = coalesce(v.hep, m.ajuste_hepatico)
from (values
  -- nome, ajuste_renal, ajuste_hepatico
  ('Paracetamol 500 mg comprimido', null, 'Hepatotóxico — reduzir a dose máxima diária na hepatopatia.'),
  ('Paracetamol 200 mg/mL gotas', null, 'Hepatotóxico — reduzir a dose máxima diária na hepatopatia.'),
  ('Ibuprofeno 600 mg comprimido', 'AINE nefrotóxico — evitar na insuficiência renal; monitorar função renal.', null),
  ('Diclofenaco sódico 50 mg comprimido', 'AINE nefrotóxico — evitar na insuficiência renal.', null),
  ('Diclofenaco sódico 25 mg/mL injetável', 'AINE nefrotóxico — evitar na insuficiência renal.', null),
  ('Morfina 10 mg/mL injetável', 'Reduzir dose/intervalo na insuficiência renal (acúmulo de metabólitos).', 'Reduzir dose/intervalo na insuficiência hepática.'),
  ('Morfina 10 mg comprimido', 'Reduzir dose/intervalo na insuficiência renal (acúmulo de metabólitos).', 'Reduzir dose/intervalo na insuficiência hepática.'),
  ('Tramadol 50 mg cápsula', 'Reduzir dose se ClCr < 30 mL/min.', 'Reduzir dose na insuficiência hepática.'),
  ('Tramadol 50 mg/mL injetável', 'Reduzir dose se ClCr < 30 mL/min.', 'Reduzir dose na insuficiência hepática.'),
  ('Codeína 30 mg comprimido', null, 'Cautela/reduzir na hepatopatia (metabolização variável).'),
  ('Diazepam 10 mg comprimido', null, 'Acúmulo na hepatopatia — usar menor dose ou benzodiazepínico de meia-vida curta.'),
  ('Diazepam 5 mg/mL injetável', null, 'Acúmulo na hepatopatia — usar menor dose.'),
  ('Midazolam 15 mg comprimido', null, 'Acúmulo na hepatopatia — reduzir dose.'),
  ('Midazolam 5 mg/mL injetável', null, 'Acúmulo na hepatopatia — reduzir dose.'),
  ('Clonazepam 2 mg comprimido', null, 'Cautela na hepatopatia.'),
  ('Haloperidol 5 mg/mL injetável', null, 'Cautela na insuficiência hepática.'),
  ('Haloperidol 5 mg comprimido', null, 'Cautela na insuficiência hepática.'),
  ('Clorpromazina 25 mg/mL injetável', null, 'Cautela/evitar na hepatopatia.'),
  ('Ácido valproico 500 mg comprimido', null, 'Hepatotóxico — contraindicado na hepatopatia; monitorar enzimas.'),
  ('Amiodarona 200 mg comprimido', null, 'Hepatotóxico — monitorar enzimas hepáticas.'),
  ('Amiodarona 50 mg/mL injetável', null, 'Hepatotóxico — monitorar enzimas hepáticas.'),
  ('Fluconazol 150 mg cápsula', 'Reduzir dose de manutenção se ClCr < 50 mL/min.', 'Hepatotóxico — monitorar enzimas.'),
  ('Fluconazol 2 mg/mL bolsa', 'Reduzir dose de manutenção se ClCr < 50 mL/min.', 'Hepatotóxico — monitorar enzimas.'),
  ('Cetoconazol 200 mg comprimido', null, 'Hepatotóxico — evitar/monitorar na hepatopatia.'),
  ('Metronidazol 500 mg comprimido', null, 'Reduzir dose na insuficiência hepática grave.'),
  ('Metronidazol 5 mg/mL bolsa', null, 'Reduzir dose na insuficiência hepática grave.'),
  ('Vancomicina 500 mg injetável', 'Nefrotóxico — ajustar dose/intervalo pela ClCr e monitorar nível sérico.', null),
  ('Gentamicina 40 mg/mL injetável', 'Aminoglicosídeo nefrotóxico — ajustar por ClCr e monitorar nível sérico.', null),
  ('Amicacina 250 mg/mL injetável', 'Aminoglicosídeo nefrotóxico — ajustar por ClCr e monitorar nível sérico.', null),
  ('Meropenem 1 g injetável', 'Ajustar dose se ClCr reduzido.', null),
  ('Cefepima 1 g injetável', 'Ajustar dose se ClCr reduzido (risco de neurotoxicidade).', null),
  ('Piperacilina + Tazobactam 4,5 g injetável', 'Ajustar dose se ClCr reduzido.', null),
  ('Ciprofloxacino 500 mg comprimido', 'Ajustar dose se ClCr < 30 mL/min.', null),
  ('Ciprofloxacino 2 mg/mL bolsa', 'Ajustar dose se ClCr < 30 mL/min.', null),
  ('Levofloxacino 500 mg comprimido', 'Ajustar dose/intervalo se ClCr < 50 mL/min.', null),
  ('Aciclovir 200 mg comprimido', 'Ajustar por ClCr; hidratar (risco de cristalúria/nefrotoxicidade).', null),
  ('Aciclovir 250 mg injetável', 'Ajustar por ClCr; hidratar (risco de cristalúria/nefrotoxicidade).', null),
  ('Sulfametoxazol + Trimetoprima 400+80 mg comprimido', 'Ajustar dose se ClCr reduzido; evitar se ClCr < 15 mL/min.', null),
  ('Enoxaparina 40 mg seringa', 'Reduzir dose se ClCr < 30 mL/min; considerar anti-Xa.', null),
  ('Enoxaparina 60 mg seringa', 'Reduzir dose se ClCr < 30 mL/min; considerar anti-Xa.', null),
  ('Metformina 500 mg comprimido', 'Contraindicada se ClCr < 30 mL/min (risco de acidose lática).', null),
  ('Metformina 850 mg comprimido', 'Contraindicada se ClCr < 30 mL/min (risco de acidose lática).', null),
  ('Digoxina 0,25 mg comprimido', 'Reduzir dose na insuficiência renal (acúmulo).', null),
  ('Espironolactona 25 mg comprimido', 'Risco de hipercalemia na insuficiência renal — monitorar potássio.', null)
) as v(nome, ren, hep)
where lower(m.nome) = lower(v.nome);

-- Conferência:
-- select count(*) filter (where ajuste_renal is not null) as com_ajuste_renal,
--        count(*) filter (where ajuste_hepatico is not null) as com_ajuste_hepatico
-- from public.farm_medicamentos;
