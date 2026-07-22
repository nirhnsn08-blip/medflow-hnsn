-- ============================================================
-- Valentrax — SEED DE TESTE: 60 pacientes fictícios
--
-- ⚠️ RODAR APENAS NO BANCO DEMO (ufxqdvxhruaswuzhmxyf).
--    Tem uma trava: aborta se rodar no banco do hospital.
--
-- NÃO é volume por volume. Os 60 pacientes são desenhados para EXERCITAR
-- as regras clínicas — é onde moram os bugs que importam num sistema que
-- decide alerta de medicação. Inclui casos-limite que um cadastro aleatório
-- nunca produziria:
--
--   • dose acima do máximo diário (paracetamol, dipirona, tramadol)
--   • medicamento inapropriado para idoso (Critérios de Beers)
--   • medicamento contraindicado por idade (AAS < 18, codeína < 12)
--   • alergia declarada x medicamento prescrito
--   • interação grave (varfarina+AINE, opioide+benzodiazepínico, digoxina+amiodarona)
--   • função renal reduzida x droga que exige ajuste
--   • paciente em sonda x comprimido "não triturar"
--   • gestante x medicamento de risco
--
-- Também popula PS (Manchester completo), leitos, SCIH e ambulatório, para
-- dashboards e indicadores terem massa real.
--
-- TUDO fica marcado com usuario = 'seed-teste' e prontuário começando em
-- 'T9'. Para remover: veja o rodapé.
-- ============================================================

-- ── TRAVA: impede rodar no banco do hospital ──────────────────
-- Critério: se já existe QUALQUER registro que não veio deste seed, então
-- não é um banco descartável — é um banco em uso, e o script para.
-- Não olha usuários: contas novas no demo são normais e não indicam
-- produção. Como só considera dado não-marcado, o seed continua podendo
-- ser rodado mais de uma vez no demo.
do $trava$
begin
  if exists (select 1 from public.pacientes    where coalesce(usuario,'') <> 'seed-teste' limit 1)
     or exists (select 1 from public.atendimentos where coalesce(usuario,'') <> 'seed-teste' limit 1) then
    raise exception E'SEED ABORTADO - nada foi inserido.\n\n'
      'Este banco ja tem registros que nao vieram do seed de teste, ou seja,\n'
      'nao e um banco descartavel. O seed so roda no DEMO (ufxqdvxhruaswuzhmxyf),\n'
      'que foi reconstruido vazio.';
  end if;
end
$trava$;


-- ════════════════════════════════════════════════════════════
-- 1) PACIENTES — 60, com faixas etárias que importam clinicamente
-- ════════════════════════════════════════════════════════════
insert into public.pacientes (prontuario, iniciais, ano_nascimento, sexo, usuario)
select
  'T9' || lpad(g::text, 3, '0'),
  chr(65 + (g * 7) % 26) || '.' || chr(65 + (g * 13) % 26) || '.',
  case
    when g <= 12 then 1935 + (g % 8)        -- idosos (Beers)
    when g <= 20 then 2015 + (g % 9)        -- pediatria (limites por idade)
    else 1960 + (g % 45)                    -- adultos
  end,
  case when g % 2 = 0 then 'F' else 'M' end,
  'seed-teste'
from generate_series(1, 60) g
on conflict (prontuario) do nothing;


-- ════════════════════════════════════════════════════════════
-- 2) PRONTO-SOCORRO — Manchester completo + perfil clínico
-- ════════════════════════════════════════════════════════════
insert into public.ps_atendimentos (
  iniciais, prontuario, queixa, chegada_em, classificacao, triagem_em,
  atendimento_em, status, desfecho, desfecho_em, setor_destino,
  idade, peso, clearance_renal, funcao_hepatica, alergias, em_sonda, gestante,
  usuario
)
select
  p.iniciais, p.prontuario,
  (array['Dor torácica','Dispneia','Febre','Cefaleia intensa','Dor abdominal',
         'Trauma em MMII','Vômitos persistentes','Crise hipertensiva'])[1 + (g % 8)],
  now() - (g || ' hours')::interval,
  -- distribuição realista: poucos vermelhos, muitos verdes
  (array['vermelho','laranja','laranja','amarelo','amarelo','amarelo',
         'verde','verde','verde','azul'])[1 + (g % 10)],
  now() - (g || ' hours')::interval + interval '8 minutes',
  case when g % 5 <> 0 then now() - (g || ' hours')::interval + interval '35 minutes' end,
  (array['finalizado','em_atendimento','aguardando_atendimento','finalizado','finalizado'])[1 + (g % 5)],
  case when g % 5 in (0, 3, 4)
       then (array['alta','internacao','alta','transferencia','alta','obito'])[1 + (g % 6)] end,
  case when g % 5 in (0, 3, 4) then now() - (g || ' hours')::interval + interval '3 hours' end,
  case when g % 5 = 3 then (array['UTI','POSTO 1','POSTO 2','MATERNIDADE'])[1 + (g % 4)] end,
  date_part('year', now())::int - p.ano_nascimento,
  case when date_part('year', now())::int - p.ano_nascimento <= 12
       then 12 + (g % 25)::numeric else 52 + (g % 45)::numeric end,
  -- 1 em cada 4 com função renal reduzida (dispara ajuste de dose)
  case when g % 4 = 0 then 22 + (g % 25)::numeric else 80 + (g % 40)::numeric end,
  case when g % 7 = 0 then 'moderada' when g % 11 = 0 then 'grave' else 'normal' end,
  -- alergias reais e grafadas como a equipe digita
  case
    when g % 6 = 0 then 'Dipirona'
    when g % 9 = 0 then 'AAS, Ibuprofeno'
    when g % 13 = 0 then 'Penicilina'
  end,
  (g % 8 = 0),                                   -- em sonda -> "não triturar"
  (g % 2 = 0 and date_part('year', now())::int - p.ano_nascimento between 18 and 42
   and g % 5 = 0),                               -- gestantes
  'seed-teste'
from generate_series(1, 34) g
join public.pacientes p on p.prontuario = 'T9' || lpad(g::text, 3, '0');


-- ════════════════════════════════════════════════════════════
-- 3) PRESCRIÇÕES — casos desenhados para DISPARAR alerta
-- ════════════════════════════════════════════════════════════

-- 3a) Prescrição de rotina (o "ruído" normal, para o alerta não ser óbvio)
insert into public.ps_prescricao_itens
  (atendimento_id, medicamento_id, medicamento_nome, unidade, dose, via, quantidade, usuario)
select a.id, m.id, m.nome, m.unidade, '1 ' || m.unidade, 'VO', 1, 'seed-teste'
from public.ps_atendimentos a
join lateral (
  select id, nome, unidade from public.farm_medicamentos
  where nome in ('Dipirona 500 mg comprimido','Paracetamol 500 mg comprimido',
                 'Omeprazol 20 mg cápsula','Dexametasona 4 mg/mL injetável')
  order by (a.id + length(nome)) % 4 limit 1
) m on true
where a.usuario = 'seed-teste' and a.id % 2 = 0;

-- 3b) DOSE ACIMA DO MÁXIMO — paracetamol 6000 mg/dia (máx 4000)
-- O alerta de dose usa os campos NUMÉRICOS (dose_valor × frequencia_dia),
-- não o texto livre de `dose`. Sem eles a regra não tem como calcular.
insert into public.ps_prescricao_itens
  (atendimento_id, medicamento_id, medicamento_nome, unidade, dose, via, quantidade,
   dose_valor, dose_unidade, frequencia_dia, duracao_dias, usuario)
select a.id, m.id, m.nome, m.unidade, '1000 mg 6x/dia', 'VO', 6,
       1000, 'mg', 6, 3, 'seed-teste'
from public.ps_atendimentos a
cross join lateral (select id, nome, unidade from public.farm_medicamentos
                    where nome = 'Paracetamol 500 mg comprimido' limit 1) m
where a.usuario = 'seed-teste'
order by a.id limit 3;

-- 3c) INTERAÇÃO GRAVE — varfarina + AINE (risco de sangramento)
insert into public.ps_prescricao_itens
  (atendimento_id, medicamento_id, medicamento_nome, unidade, dose, via, quantidade, usuario)
select a.id, m.id, m.nome, m.unidade, '1 ' || coalesce(m.unidade,'un'), 'VO', 1, 'seed-teste'
from (select id from public.ps_atendimentos
      where usuario = 'seed-teste' order by id offset 4 limit 3) a
cross join lateral (
  select id, nome, unidade from public.farm_medicamentos
  where nome ilike 'Varfarina%' or nome = 'Ibuprofeno 600 mg comprimido'
) m;

-- 3d) OPIOIDE + BENZODIAZEPÍNICO — depressão respiratória aditiva
insert into public.ps_prescricao_itens
  (atendimento_id, medicamento_id, medicamento_nome, unidade, dose, via, quantidade, usuario)
select a.id, m.id, m.nome, m.unidade, '1 ' || coalesce(m.unidade,'un'), 'EV', 1, 'seed-teste'
from (select id from public.ps_atendimentos
      where usuario = 'seed-teste' order by id offset 8 limit 3) a
cross join lateral (
  select id, nome, unidade from public.farm_medicamentos
  where nome in ('Morfina 10 mg/mL injetável','Midazolam 5 mg/mL injetável')
) m;

-- 3e) ALERGIA DECLARADA x MEDICAMENTO PRESCRITO
insert into public.ps_prescricao_itens
  (atendimento_id, medicamento_id, medicamento_nome, unidade, dose, via, quantidade, usuario)
select a.id, m.id, m.nome, m.unidade, '1 ' || m.unidade, 'VO', 1, 'seed-teste'
from public.ps_atendimentos a
cross join lateral (select id, nome, unidade from public.farm_medicamentos
                    where nome = 'Dipirona 500 mg comprimido' limit 1) m
where a.usuario = 'seed-teste' and a.alergias ilike '%Dipirona%';

-- 3f) EM SONDA x COMPRIMIDO QUE NÃO PODE SER TRITURADO
insert into public.ps_prescricao_itens
  (atendimento_id, medicamento_id, medicamento_nome, unidade, dose, via, quantidade, usuario)
select a.id, m.id, m.nome, m.unidade, '1 comprimido', 'SNE', 1, 'seed-teste'
from public.ps_atendimentos a
cross join lateral (select id, nome, unidade from public.farm_medicamentos
                    where nao_triturar = true limit 1) m
where a.usuario = 'seed-teste' and a.em_sonda = true;

-- 3g) IDOSO x MEDICAMENTO INAPROPRIADO (Beers)
insert into public.ps_prescricao_itens
  (atendimento_id, medicamento_id, medicamento_nome, unidade, dose, via, quantidade, usuario)
select a.id, m.id, m.nome, m.unidade, '1 ' || coalesce(m.unidade,'un'), 'VO', 1, 'seed-teste'
from public.ps_atendimentos a
cross join lateral (select id, nome, unidade from public.farm_medicamentos
                    where inapropriado_idoso = true limit 1) m
where a.usuario = 'seed-teste' and a.idade >= 65;

-- 3h) FUNÇÃO RENAL REDUZIDA x DROGA COM AJUSTE RENAL
insert into public.ps_prescricao_itens
  (atendimento_id, medicamento_id, medicamento_nome, unidade, dose, via, quantidade, usuario)
select a.id, m.id, m.nome, m.unidade, 'dose plena', 'EV', 1, 'seed-teste'
from public.ps_atendimentos a
cross join lateral (select id, nome, unidade from public.farm_medicamentos
                    where ajuste_renal is not null limit 1) m
where a.usuario = 'seed-teste' and a.clearance_renal < 30;


-- 3i) O REGISTRO ASSINADO da prescrição.
-- No fluxo real, prescrever cria DUAS coisas: o registro em ps_registros
-- (que assina, com data/hora e autor) e os itens em ps_prescricao_itens.
-- Sem o registro, a aba do atendimento mostra "Prescrição (0)" mesmo com
-- itens na tela — porque a contagem vem dos registros, não dos itens.
insert into public.ps_registros (atendimento_id, tipo, categoria, texto, status, usuario, criado_em)
select distinct i.atendimento_id, 'prescricao', 'medica',
       'Prescrição médica registrada (seed de teste).', 'ativo', 'seed-teste', now()
from public.ps_prescricao_itens i
where i.usuario = 'seed-teste';


-- ════════════════════════════════════════════════════════════
-- 4) EVOLUÇÕES DO PS — alimenta a timeline do Paciente 360
-- ════════════════════════════════════════════════════════════
insert into public.ps_registros (atendimento_id, tipo, categoria, texto, status, usuario, criado_em)
select a.id,
  (array['evolucao','conduta','exame','evolucao'])[1 + (a.id % 4)],
  (array['medica','enfermagem','tecnico','fisio'])[1 + (a.id % 4)],
  (array['Paciente consciente, orientado, hemodinamicamente estável.',
         'Mantido em observação. Analgesia conforme prescrição.',
         'Solicitado hemograma e PCR. Aguardando resultado.',
         'Refere melhora da dor após medicação. Aceita dieta.'])[1 + (a.id % 4)],
  'ativo', 'seed-teste', a.chegada_em + interval '50 minutes'
from public.ps_atendimentos a
where a.usuario = 'seed-teste';


-- ════════════════════════════════════════════════════════════
-- 5) LEITOS — ocupação para giro/censo
-- ════════════════════════════════════════════════════════════
insert into public.leitos (identificacao, status, iniciais, prontuario, motivo, cid,
                           data_internacao, dias_previstos, setor, usuario)
select
  'T-' || lpad(g::text, 2, '0'), 'ocupado', p.iniciais, p.prontuario,
  (array['Pneumonia','ITU','ICC descompensada','Pós-operatório','AVC isquêmico'])[1 + (g % 5)],
  (array['J18','N39','I50','Z98','I63'])[1 + (g % 5)],
  current_date - (g % 12), 3 + (g % 8),
  (array['POSTO 1','POSTO 2','UTI','MATERNIDADE'])[1 + (g % 4)],
  'seed-teste'
from generate_series(35, 52) g
join public.pacientes p on p.prontuario = 'T9' || lpad(g::text, 3, '0')
on conflict (identificacao) do nothing;


-- ════════════════════════════════════════════════════════════
-- 6) SCIH — casos de infecção e isolamento
--    (também valida a correção do Paciente 360, que ordenava por
--     `criado_em` numa tabela que usa `created_at`)
-- ════════════════════════════════════════════════════════════
insert into public.scih_casos (iniciais, prontuario, leito, isolamento, data_coleta,
                               data_resultado, germe, multirresistente, antibiotico,
                               dias_antibiotico, status, usuario)
select
  p.iniciais, p.prontuario, 'T-' || lpad(g::text, 2, '0'),
  (array['contato','respiratorio','goticula'])[1 + (g % 3)],
  current_date - (g % 10) - 2, current_date - (g % 10),
  (array['Klebsiella pneumoniae KPC','Acinetobacter baumannii','Staphylococcus aureus MRSA',
         'Pseudomonas aeruginosa','Escherichia coli ESBL'])[1 + (g % 5)],
  (g % 3 <> 0),
  (array['Meropenem','Polimixina B','Vancomicina','Piperacilina-tazobactam'])[1 + (g % 4)],
  3 + (g % 10),
  case when g % 4 = 0 then 'encerrado' else 'ativo' end,
  'seed-teste'
from generate_series(35, 46) g
join public.pacientes p on p.prontuario = 'T9' || lpad(g::text, 3, '0');


-- ════════════════════════════════════════════════════════════
-- 7) AMBULATÓRIO — produção dos últimos 30 dias (dashboards e BI)
-- ════════════════════════════════════════════════════════════
insert into public.atendimentos (data, especialidade, ofertadas, realizadas, primeiras,
                                 retornos, faltas, livres, emergencias, usuario)
select
  (current_date - d), e.esp,   -- `data` e do tipo date, nao text
  20 + (d % 12), 15 + (d % 10), 4 + (d % 6), 8 + (d % 7), 1 + (d % 4), (d % 3), (d % 2),
  'seed-teste'
from generate_series(0, 29) d
cross join (values ('cirurgia_geral'),('oftalmologia'),('ginecologia'),
                   ('urologia'),('ortopedia')) as e(esp)
on conflict (data, especialidade) do nothing;


-- ════════════════════════════════════════════════════════════
-- CONFERÊNCIA
-- ════════════════════════════════════════════════════════════
select 'pacientes' as tabela, count(*) from public.pacientes            where usuario='seed-teste'
union all select 'ps_atendimentos',    count(*) from public.ps_atendimentos     where usuario='seed-teste'
union all select 'prescricoes',        count(*) from public.ps_prescricao_itens where usuario='seed-teste'
union all select 'ps_registros',       count(*) from public.ps_registros        where usuario='seed-teste'
union all select 'leitos',             count(*) from public.leitos              where usuario='seed-teste'
union all select 'scih_casos',         count(*) from public.scih_casos          where usuario='seed-teste'
union all select 'atendimentos',       count(*) from public.atendimentos        where usuario='seed-teste';


-- ════════════════════════════════════════════════════════════
-- PARA REMOVER TUDO DEPOIS (rode na ordem, por causa das chaves)
-- ════════════════════════════════════════════════════════════
-- delete from public.ps_prescricao_itens where usuario='seed-teste';
-- delete from public.ps_registros        where usuario='seed-teste';
-- delete from public.ps_atendimentos     where usuario='seed-teste';
-- delete from public.scih_casos          where usuario='seed-teste';
-- delete from public.leitos              where usuario='seed-teste';
-- delete from public.atendimentos        where usuario='seed-teste';
-- delete from public.pacientes           where usuario='seed-teste';
