-- ═══════════════════════════════════════════════════════════
-- PEP — saturação e suporte de O₂ nos sinais vitais
--
-- Aditiva e idempotente. Não altera nada existente.
--
-- POR QUE
-- `pep_sinais_vitais` nasceu com `escala_alerta` e `score_alerta` — ou
-- seja, com a intenção de calcular escore de deterioração clínica
-- (NEWS/MEWS). Mas faltava `spo2`, que é um dos seis parâmetros do NEWS.
--
-- Calcular NEWS sem saturação não dá um escore "quase certo": dá um
-- escore ERRADO PARA BAIXO, justamente no paciente que está dessaturando.
-- É o caso em que o alerta mais importa.
--
-- `o2_suplementar` entra junto porque o NEWS pontua o paciente em oxigênio
-- mesmo com saturação normal — respirar 95% em ar ambiente e respirar 95%
-- sob cateter são situações clínicas diferentes.
-- ═══════════════════════════════════════════════════════════

alter table public.pep_sinais_vitais
  add column if not exists spo2 int,                              -- saturação periférica (%)
  add column if not exists o2_suplementar boolean default false,  -- em O₂ suplementar?
  add column if not exists o2_dispositivo text,                   -- cateter | máscara | VNI | TOT
  add column if not exists o2_fluxo numeric;                      -- L/min ou FiO₂

-- Conferência:
-- select spo2, o2_suplementar, score_alerta from public.pep_sinais_vitais limit 5;
