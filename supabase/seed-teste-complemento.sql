-- ============================================================
-- Valentrax — COMPLEMENTO do seed de teste  (rodar SÓ no DEMO)
--
-- O seed original deixou dois buracos, descobertos ao testar a tela:
--
--  1. As prescrições ficaram sem os campos NUMÉRICOS de dose. O alerta de
--     dose máxima calcula `dose_valor × frequencia_dia` e compara com
--     `dose_maxima_dia` do catálogo — o texto livre de `dose` não serve.
--     Sem isso o caso do paracetamol 6000 mg/dia nunca dispararia.
--
--  2. Os itens de prescrição ficaram órfãos, sem o registro assinado em
--     ps_registros. No fluxo real prescrever cria os dois. Sem o registro,
--     a aba do atendimento mostra "Prescrição (0)" mesmo listando os
--     medicamentos — a contagem vem dos registros, não dos itens.
--
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

-- ── TRAVA: só banco descartável ──────────────────────────────
do $trava$
begin
  if not exists (select 1 from public.ps_prescricao_itens where usuario = 'seed-teste' limit 1) then
    raise exception E'ABORTADO: nao ha dados do seed de teste neste banco.\n'
      'Rode este complemento no mesmo banco onde o seed rodou (DEMO).';
  end if;
end
$trava$;


-- ════════════════════════════════════════════════════════════
-- 1) Dose estruturada — para o alerta de dose máxima calcular
-- ════════════════════════════════════════════════════════════

-- Paracetamol: 1000 mg × 6x/dia = 6000 mg/dia (máximo do catálogo: 4000)
update public.ps_prescricao_itens
   set dose_valor = 1000, dose_unidade = 'mg', frequencia_dia = 6, duracao_dias = 3,
       dose = '1000 mg 6x/dia'
 where usuario = 'seed-teste'
   and medicamento_nome = 'Paracetamol 500 mg comprimido'
   and dose_valor is null;

-- Os demais itens recebem posologia normal, para o alerta de dose só
-- aparecer em quem foi desenhado para estourar o limite.
update public.ps_prescricao_itens i
   set dose_valor = 500, dose_unidade = 'mg', frequencia_dia = 3, duracao_dias = 5
 where i.usuario = 'seed-teste'
   and i.dose_valor is null
   and i.medicamento_nome <> 'Paracetamol 500 mg comprimido';


-- ════════════════════════════════════════════════════════════
-- 2) Registro assinado da prescrição
-- ════════════════════════════════════════════════════════════
insert into public.ps_registros (atendimento_id, tipo, categoria, texto, status, usuario, criado_em)
select distinct i.atendimento_id, 'prescricao', 'medica',
       'Prescrição médica registrada (seed de teste).', 'ativo', 'seed-teste', now()
from public.ps_prescricao_itens i
where i.usuario = 'seed-teste'
  and not exists (
    select 1 from public.ps_registros r
     where r.atendimento_id = i.atendimento_id
       and r.tipo = 'prescricao'
       and r.usuario = 'seed-teste'
  );


-- ════════════════════════════════════════════════════════════
-- CONFERÊNCIA — quantos casos ficaram armados
-- ════════════════════════════════════════════════════════════
select 'itens com dose numerica' as item, count(*) as qtd
  from public.ps_prescricao_itens where usuario='seed-teste' and dose_valor is not null
union all
select 'registros de prescricao', count(*)
  from public.ps_registros where usuario='seed-teste' and tipo='prescricao'
union all
select 'DOSE ACIMA DO MAXIMO (esperado 3)', count(*)
  from public.ps_prescricao_itens i
  join public.farm_medicamentos m on m.id = i.medicamento_id
 where i.usuario='seed-teste'
   and m.dose_maxima_dia is not null
   and i.dose_valor * i.frequencia_dia > m.dose_maxima_dia;
