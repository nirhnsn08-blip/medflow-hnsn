-- ============================================================
-- Valentrax — SEED DE TESTE: 70 pacientes fictícios (v2, schema atual)
--
-- ⚠️ RODAR APENAS NO BANCO DEMO (ufxqdvxhruaswuzhmxyf).
--    Trava DELIBERADA (mesmo padrão da reconstrução): você confirma que é o
--    demo criando, ANTES e sozinho, no MESMO projeto:
--        create table public._confirmo_seed_demo();
--    Sem essa tabela, o seed aborta. Ela é removida no fim.
--    (A trava antiga, que exigia banco 100% vazio, cegava num demo que já
--     acumulou dado de desenvolvimento — não distinguia dev de produção.)
--
-- Sucede o seed-teste-60-pacientes.sql. Diferenças:
--   • 70 pacientes COM IDENTIDADE COMPLETA (nome, CPF, CNS, data de
--     nascimento, nome da mãe) — para exercitar a Recepção/busca e a
--     triagem pediátrica, que usa a data completa (idade em meses).
--   • Inclui bebês < 2 anos (a triagem deve RECUSAR idade aproximada).
--   • Mantém os casos-limite clínicos do seed anterior (Beers, dose máxima,
--     interação grave, alergia, sonda, ajuste renal, gestante).
--
-- Os módulos novos (Protocolos, Faturamento, PEP do internado, SAE) NÃO são
-- semeados por SQL de propósito — têm CHECK/enums que variam; são testados
-- criando registro pela própria tela (é o stress test real da feature).
--
-- CPFs/CNS são fictícios (formato válido, dígito não conferido). Tudo fica
-- marcado usuario='seed-teste' e prontuário 'T9xxx'. Remoção no rodapé.
-- ============================================================

-- ── TRAVA: confirmação deliberada de que este é o demo ────────
do $trava$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = '_confirmo_seed_demo'
  ) then
    raise exception E'SEED ABORTADO - confirme que este e o banco DEMO.\n\n'
      'Confira ufxqdvxhruaswuzhmxyf no topo do painel e rode ANTES, sozinho:\n'
      '    create table public._confirmo_seed_demo();\n\n'
      'Depois rode o seed inteiro. A tabela e removida no fim.';
  end if;
end
$trava$;


-- ── PURGA: limpa o movimento/clínico dos pacientes do seed ────
-- Sem isto, seeds antigos acumulam e poluem: a timeline do 360 mistura datas
-- e o PS mostra "há 700h em atendimento".
--
-- ⚠️ NÃO apaga por `usuario='seed-teste'`, e sim por REFERÊNCIA ao paciente
-- do seed. Motivo: a migração automática localStorage→Supabase do app grava
-- linhas com usuario='migracao-auto' referenciando o mesmo paciente — elas
-- sobrevivem à purga por usuario e depois bloqueiam a FK (foi o erro
-- "ps_atendimentos_paciente_fk ... T9001 still referenced").
--
-- ⚠️ NÃO apaga `pacientes` de propósito: o upsert da seção 1 refaz a
-- identidade. Assim nenhuma outra tabela-filha (pep, contas, protocolos,
-- agenda…) precisa entrar na ordem — a FK de pacientes nunca é tocada.
-- Bloco DO: roda TUDO numa sessão só. (No SQL Editor do Supabase cada
-- statement solto roda em sessão separada — por isso uma temp table não
-- sobrevive de um para o outro; aqui os ids ficam num array local.)
-- Apaga todos os filhos de ps_atendimentos por REFERÊNCIA (pega linhas com
-- usuario ≠ 'seed-teste', ex. migração-auto da tela). Neto primeiro.
do $purga$
declare seed_ats bigint[];
begin
  select coalesce(array_agg(a.id), '{}') into seed_ats
  from public.ps_atendimentos a
  join public.pacientes p on p.prontuario = a.prontuario
  where p.usuario = 'seed-teste';

  delete from public.at_conta_itens    where conta_id in (select id from public.at_contas where atendimento_id = any(seed_ats));
  delete from public.at_contas         where atendimento_id = any(seed_ats);
  delete from public.at_responsaveis   where atendimento_id = any(seed_ats);
  delete from public.ag_agendamentos   where atendimento_id = any(seed_ats);
  delete from public.farm_intervencoes where atendimento_id = any(seed_ats);
  delete from public.farm_movimentos   where atendimento_id = any(seed_ats);
  delete from public.farm_preparo      where atendimento_id = any(seed_ats);
  delete from public.ps_prescricao_itens where atendimento_id = any(seed_ats);
  delete from public.ps_administracoes   where atendimento_id = any(seed_ats);
  delete from public.ps_sinais           where atendimento_id = any(seed_ats);
  delete from public.ps_registros        where atendimento_id = any(seed_ats);
  update public.leitos        set ps_atendimento_id = null where ps_atendimento_id = any(seed_ats);
  update public.solicitacoes  set ps_atendimento_id = null where ps_atendimento_id = any(seed_ats);
  update public.pep_episodios set ps_atendimento_id = null where ps_atendimento_id = any(seed_ats);

  delete from public.ps_atendimentos where id = any(seed_ats);
  delete from public.scih_casos   where prontuario in (select prontuario from public.pacientes where usuario='seed-teste');
  delete from public.leitos       where prontuario in (select prontuario from public.pacientes where usuario='seed-teste');
  delete from public.atendimentos where usuario='seed-teste';   -- ambulatório: agregado, sem prontuário
end
$purga$;


-- ════════════════════════════════════════════════════════════
-- 1) PACIENTES — 70, com identidade completa e faixas etárias
--    que importam clinicamente. Upsert: reconceder preenche a
--    identidade mesmo em paciente que já existia do seed antigo.
-- ════════════════════════════════════════════════════════════
insert into public.pacientes
  (prontuario, iniciais, nome_completo, nome_mae, cpf, cns, data_nascimento,
   ano_nascimento, sexo, nao_identificado, identificado_em, cadastro_completo_em, usuario)
select
  'T9' || lpad(g::text, 3, '0'),
  left(v.nf,1) || '.' || left(v.ln1,1) || '.' || left(v.ln2,1) || '.',
  v.nf || ' ' || v.ln1 || ' ' || v.ln2,
  (array['Terezinha','Aparecida','Conceição','Fátima','Rosa','Helena','Marta','Iracema'])[1 + (g * 3) % 8] || ' ' || v.ln2,
  lpad(((g::bigint * 98765432 + 10000000000) % 100000000000)::text, 11, '0'),
  lpad(((g::bigint * 123456789 + 700000000000000) % 1000000000000000)::text, 15, '0'),
  v.dob,
  extract(year from v.dob)::int,
  case when g % 2 = 0 then 'F' else 'M' end,
  false,
  now() - (g || ' days')::interval,
  now() - (g || ' days')::interval,
  'seed-teste'
from generate_series(1, 70) g
cross join lateral (
  select
    case when g % 2 = 0
      then (array['Maria','Ana','Joana','Rita','Clara','Beatriz','Lúcia','Sofia'])[1 + (g * 5) % 8]
      else (array['João','José','Pedro','Carlos','Antônio','Paulo','Luiz','Marcos'])[1 + (g * 5) % 8]
    end as nf,
    (array['Silva','Santos','Oliveira','Souza','Lima','Pereira','Costa','Almeida'])[1 + (g * 7) % 8] as ln1,
    (array['Ferreira','Rodrigues','Gomes','Martins','Barbosa','Ribeiro','Alves','Carvalho'])[1 + (g * 11) % 8] as ln2,
    case
      when g <= 14 then make_date(1935 + (g % 8), 1 + (g % 12), 1 + (g % 27))   -- idosos (Beers)
      when g <= 18 then make_date(2024 + (g % 2), 1 + (g % 12), 1 + (g % 27))   -- bebês < 2a (recusa idade aprox.)
      when g <= 24 then make_date(2012 + (g % 6), 1 + (g % 12), 1 + (g % 27))   -- crianças
      else make_date(1960 + (g % 45), 1 + (g % 12), 1 + (g % 27))              -- adultos
    end as dob
) v
on conflict (prontuario) do update set
  nome_completo = excluded.nome_completo, nome_mae = excluded.nome_mae,
  cpf = excluded.cpf, cns = excluded.cns, data_nascimento = excluded.data_nascimento,
  ano_nascimento = excluded.ano_nascimento;


-- ════════════════════════════════════════════════════════════
-- 2) PRONTO-SOCORRO — Manchester completo + perfil clínico (45)
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
  case when g % 4 = 0 then 22 + (g % 25)::numeric else 80 + (g % 40)::numeric end,
  case when g % 7 = 0 then 'moderada' when g % 11 = 0 then 'grave' else 'normal' end,
  case
    when g % 6 = 0 then 'Dipirona'
    when g % 9 = 0 then 'AAS, Ibuprofeno'
    when g % 13 = 0 then 'Penicilina'
  end,
  (g % 8 = 0),
  (g % 2 = 0 and date_part('year', now())::int - p.ano_nascimento between 18 and 42 and g % 5 = 0),
  'seed-teste'
from generate_series(1, 45) g
join public.pacientes p on p.prontuario = 'T9' || lpad(g::text, 3, '0');


-- ════════════════════════════════════════════════════════════
-- 3) PRESCRIÇÕES — casos desenhados para DISPARAR alerta
-- ════════════════════════════════════════════════════════════
-- 3a) rotina (ruído normal)
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

-- 3c) INTERAÇÃO GRAVE — varfarina + AINE
insert into public.ps_prescricao_itens
  (atendimento_id, medicamento_id, medicamento_nome, unidade, dose, via, quantidade, usuario)
select a.id, m.id, m.nome, m.unidade, '1 ' || coalesce(m.unidade,'un'), 'VO', 1, 'seed-teste'
from (select id from public.ps_atendimentos where usuario = 'seed-teste' order by id offset 4 limit 3) a
cross join lateral (
  select id, nome, unidade from public.farm_medicamentos
  where nome ilike 'Varfarina%' or nome = 'Ibuprofeno 600 mg comprimido'
) m;

-- 3d) OPIOIDE + BENZODIAZEPÍNICO
insert into public.ps_prescricao_itens
  (atendimento_id, medicamento_id, medicamento_nome, unidade, dose, via, quantidade, usuario)
select a.id, m.id, m.nome, m.unidade, '1 ' || coalesce(m.unidade,'un'), 'EV', 1, 'seed-teste'
from (select id from public.ps_atendimentos where usuario = 'seed-teste' order by id offset 8 limit 3) a
cross join lateral (
  select id, nome, unidade from public.farm_medicamentos
  where nome in ('Morfina 10 mg/mL injetável','Midazolam 5 mg/mL injetável')
) m;

-- 3e) ALERGIA x MEDICAMENTO
insert into public.ps_prescricao_itens
  (atendimento_id, medicamento_id, medicamento_nome, unidade, dose, via, quantidade, usuario)
select a.id, m.id, m.nome, m.unidade, '1 ' || m.unidade, 'VO', 1, 'seed-teste'
from public.ps_atendimentos a
cross join lateral (select id, nome, unidade from public.farm_medicamentos
                    where nome = 'Dipirona 500 mg comprimido' limit 1) m
where a.usuario = 'seed-teste' and a.alergias ilike '%Dipirona%';

-- 3f) EM SONDA x "não triturar"
insert into public.ps_prescricao_itens
  (atendimento_id, medicamento_id, medicamento_nome, unidade, dose, via, quantidade, usuario)
select a.id, m.id, m.nome, m.unidade, '1 comprimido', 'SNE', 1, 'seed-teste'
from public.ps_atendimentos a
cross join lateral (select id, nome, unidade from public.farm_medicamentos
                    where nao_triturar = true limit 1) m
where a.usuario = 'seed-teste' and a.em_sonda = true;

-- 3g) IDOSO x Beers
insert into public.ps_prescricao_itens
  (atendimento_id, medicamento_id, medicamento_nome, unidade, dose, via, quantidade, usuario)
select a.id, m.id, m.nome, m.unidade, '1 ' || coalesce(m.unidade,'un'), 'VO', 1, 'seed-teste'
from public.ps_atendimentos a
cross join lateral (select id, nome, unidade from public.farm_medicamentos
                    where inapropriado_idoso = true limit 1) m
where a.usuario = 'seed-teste' and a.idade >= 65;

-- 3h) FUNÇÃO RENAL REDUZIDA x ajuste renal
insert into public.ps_prescricao_itens
  (atendimento_id, medicamento_id, medicamento_nome, unidade, dose, via, quantidade, usuario)
select a.id, m.id, m.nome, m.unidade, 'dose plena', 'EV', 1, 'seed-teste'
from public.ps_atendimentos a
cross join lateral (select id, nome, unidade from public.farm_medicamentos
                    where ajuste_renal is not null limit 1) m
where a.usuario = 'seed-teste' and a.clearance_renal < 30;

-- 3i) o REGISTRO assinado da prescrição (senão a aba mostra "Prescrição (0)")
insert into public.ps_registros (atendimento_id, tipo, categoria, texto, status, usuario, criado_em)
select distinct i.atendimento_id, 'prescricao', 'medica',
       'Prescrição médica registrada (seed de teste).', 'ativo', 'seed-teste', now()
from public.ps_prescricao_itens i where i.usuario = 'seed-teste';


-- ════════════════════════════════════════════════════════════
-- 4) EVOLUÇÕES do PS — timeline do Paciente 360
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
from public.ps_atendimentos a where a.usuario = 'seed-teste';


-- ════════════════════════════════════════════════════════════
-- 5) LEITOS — ocupação para giro/censo (20 internados)
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
from generate_series(35, 54) g
join public.pacientes p on p.prontuario = 'T9' || lpad(g::text, 3, '0')
on conflict (identificacao) do nothing;


-- ════════════════════════════════════════════════════════════
-- 6) SCIH — casos de infecção e isolamento (14)
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
from generate_series(35, 48) g
join public.pacientes p on p.prontuario = 'T9' || lpad(g::text, 3, '0');


-- ════════════════════════════════════════════════════════════
-- 7) AMBULATÓRIO — produção dos últimos 30 dias (dashboards e BI)
-- ════════════════════════════════════════════════════════════
insert into public.atendimentos (data, especialidade, ofertadas, realizadas, primeiras,
                                 retornos, faltas, livres, emergencias, usuario)
select
  (current_date - d), e.esp,
  20 + (d % 12), 15 + (d % 10), 4 + (d % 6), 8 + (d % 7), 1 + (d % 4), (d % 3), (d % 2),
  'seed-teste'
from generate_series(0, 29) d
cross join (values ('cirurgia_geral'),('oftalmologia'),('ginecologia'),
                   ('urologia'),('ortopedia')) as e(esp)
on conflict (data, especialidade) do nothing;


-- Some a trava de confirmação (vale uma vez só; recrie para rodar de novo).
drop table if exists public._confirmo_seed_demo;


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
