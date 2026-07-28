-- ═══════════════════════════════════════════════════════════
-- ENFERMAGEM — SAE / Processo de Enfermagem (Tier 1, Fase 1b)
--
-- O Processo de Enfermagem à beira-leito, dentro do PEP (COFEN 736/2024,
-- ex-358/2009). Núcleo clínico desta fase:
--   Histórico → Diagnóstico (NANDA-I) → Resultado esperado (texto curado) →
--   Prescrição de enfermagem (NIC) com aprazamento → checagem à beira-leito
--   (técnico) → Evolução (reusa pep_evolucoes tipo enfermagem).
--
-- Diagnóstico e prescrição de enfermagem são PRIVATIVOS do enfermeiro
-- (papeis.js). O técnico executa e CHECA o cuidado prescrito — mesma lógica
-- da checagem de medicação.
--
-- 6 tabelas:
--   • enf_sae_catalogo         — curadoria de diagnósticos (NANDA) e intervenções
--                                (NIC), EDITÁVEL pelo ADM Master; cada item nasce
--                                `status='em_validacao'`, no padrão da triagem/escalas.
--   • enf_sae_historico        — coleta de dados / histórico de enfermagem (append-only).
--   • enf_sae_diagnosticos     — diagnósticos levantados no episódio (append-only).
--   • enf_sae_prescricoes      — cabeçalho da prescrição de enfermagem (append-only).
--   • enf_sae_prescricao_itens — os cuidados prescritos, com aprazamento.
--   • enf_sae_checagem         — execução/checagem do cuidado à beira-leito (append-only).
--
-- ⚠️ O catálogo semeado é RASCUNHO clínico (títulos NANDA/NIC usuais, com
-- características, fatores e atividades curados de forma enxuta). A equipe
-- valida e amplia na tela (editor do ADM Master). O motor (src/clinico/sae.js)
-- é apoio à decisão — a conduta é da enfermeira.
--
-- Registro clínico é IMUTÁVEL: as tabelas de registro são append-only
-- (correção = novo registro com corrige_id/substitui_id). Aditiva e idempotente.
-- Rodar no SQL Editor — DEMO primeiro, depois HNSN. Seed com ON CONFLICT DO NOTHING.
-- ═══════════════════════════════════════════════════════════

-- 1) CATÁLOGO curado (config editável pelo ADM Master) ────────
create table if not exists public.enf_sae_catalogo (
  id          text primary key,            -- slug: dx_dor_aguda, nic_controle_dor, ...
  tipo        text not null,               -- diagnostico | intervencao
  codigo      text,                        -- código NANDA (00132) ou NIC (1400); referência
  titulo      text not null,
  dominio     text,                        -- domínio NANDA / classe NIC
  subtipo     text,                        -- diagnóstico: real | risco | promocao
  unidades    jsonb not null default '[]'::jsonb,  -- ["clinica","uti","peds","obst"]; [] = todas
  payload     jsonb not null default '{}'::jsonb,  -- def/fatores/resultado/intervenções OU atividades/frequência
  status      text not null default 'em_validacao', -- em_validacao | validado
  ordem       int  not null default 0,
  ativo       boolean not null default true,
  usuario     text,
  criado_em   timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists enf_sae_catalogo_tipo_idx on public.enf_sae_catalogo (tipo, ordem);

-- 2) HISTÓRICO de enfermagem (coleta de dados) ────────────────
create table if not exists public.enf_sae_historico (
  id                 uuid primary key default gen_random_uuid(),
  prontuario         text not null,
  episodio_id        uuid,                              -- internação (pep_episodios)
  modelo             text not null default 'necessidades_humanas',
  dados              jsonb not null default '{}'::jsonb, -- respostas por seção do template
  queixa             text,
  exame_fisico       text,
  observacao         text,
  registrado_por     text,                               -- nome congelado
  categoria          text,
  conselho           text,                               -- autoria congelada (COFEN 754/2024)
  registro_conselho  text,
  corrige_id         uuid,
  motivo_correcao    text,
  criado_em          timestamptz not null default now()
);
create index if not exists enf_sae_historico_pront_idx on public.enf_sae_historico (prontuario, criado_em desc);

-- 3) DIAGNÓSTICOS de enfermagem (NANDA-I) ─────────────────────
create table if not exists public.enf_sae_diagnosticos (
  id                 uuid primary key default gen_random_uuid(),
  prontuario         text not null,
  episodio_id        uuid,
  historico_id       uuid,                               -- de qual coleta nasceu (opcional)
  catalogo_id        text,                               -- referência ao enf_sae_catalogo
  codigo             text,                               -- NANDA congelado
  titulo             text not null,                      -- título congelado
  dominio            text,
  subtipo            text,                               -- real | risco | promocao
  caracteristicas    jsonb not null default '[]'::jsonb, -- definidoras selecionadas
  fatores            jsonb not null default '[]'::jsonb, -- relacionados / de risco
  resultado_esperado text,                               -- NOC enxuto (texto curado, editável)
  prioridade         text,                               -- alta | media | baixa
  status             text not null default 'ativo',      -- ativo | resolvido | suspenso
  registrado_por     text,
  categoria          text,
  conselho           text,
  registro_conselho  text,
  corrige_id         uuid,
  motivo_correcao    text,
  criado_em          timestamptz not null default now()
);
create index if not exists enf_sae_dx_pront_idx on public.enf_sae_diagnosticos (prontuario, criado_em desc);
create index if not exists enf_sae_dx_ep_idx on public.enf_sae_diagnosticos (episodio_id, status);

-- 4) PRESCRIÇÃO de enfermagem — cabeçalho ─────────────────────
create table if not exists public.enf_sae_prescricoes (
  id                 uuid primary key default gen_random_uuid(),
  prontuario         text not null,
  episodio_id        uuid,
  data_referencia    date not null default current_date, -- dia civil local da prescrição
  substitui_id       uuid,                                -- represcrever aposenta a anterior
  observacao         text,
  inicio_em          timestamptz not null default now(),
  assinada_em        timestamptz not null default now(),
  prescritor_nome    text,                                -- nome congelado do enfermeiro
  categoria          text,
  conselho           text,
  registro_conselho  text,
  criado_em          timestamptz not null default now()
);
create index if not exists enf_sae_presc_ep_idx on public.enf_sae_prescricoes (episodio_id, criado_em desc);

-- 5) PRESCRIÇÃO de enfermagem — itens (cuidados aprazados) ─────
create table if not exists public.enf_sae_prescricao_itens (
  id              uuid primary key default gen_random_uuid(),
  prescricao_id   uuid not null,
  episodio_id     uuid,
  prontuario      text,
  diagnostico_id  uuid,                    -- cuidado ligado ao diagnóstico
  catalogo_id     text,                    -- intervenção NIC de origem
  codigo_nic      text,
  descricao       text not null,           -- o cuidado / atividade
  detalhe         text,
  frequencia      text,                    -- rótulo: 6/6h, 2x/dia, por turno, SOS
  frequencia_dia  int,                     -- nº de vezes/dia (alimenta o aprazamento)
  intervalo_horas numeric,                 -- alternativa à frequência/dia
  se_necessario   boolean not null default false,     -- SOS: sem horário fixo
  horarios        jsonb not null default '[]'::jsonb, -- aprazamento "HH:MM"
  ordem           int not null default 0,
  usuario         text
);
create index if not exists enf_sae_presc_itens_idx on public.enf_sae_prescricao_itens (prescricao_id, ordem);

-- 6) CHECAGEM à beira-leito (execução do cuidado; técnico) ─────
create table if not exists public.enf_sae_checagem (
  id                 uuid primary key default gen_random_uuid(),
  prontuario         text not null,
  episodio_id        uuid,
  item_id            uuid not null,        -- enf_sae_prescricao_itens
  prescricao_id      uuid,
  competencia        date not null default current_date,
  horario_previsto   text,                 -- "HH:MM" do aprazamento (informativo)
  status             text not null default 'realizado',  -- realizado | nao_realizado
  motivo             text,                 -- quando não realizado
  observacao         text,
  executado_em       timestamptz not null default now(),
  executor_nome      text,                 -- nome congelado de quem checou
  categoria          text,
  conselho           text,
  registro_conselho  text,
  criado_em          timestamptz not null default now()
);
create index if not exists enf_sae_checagem_item_idx on public.enf_sae_checagem (item_id, executado_em desc);
create index if not exists enf_sae_checagem_ep_idx on public.enf_sae_checagem (episodio_id, competencia);

-- ── SEED do catálogo (RASCUNHO clínico — editável e "em validação") ──
-- Diagnósticos NANDA-I (payload: def=características definidoras, fat=fatores,
-- resultado=resultado esperado enxuto, intervencoes=slugs NIC ligados).
insert into public.enf_sae_catalogo (id, tipo, codigo, titulo, dominio, subtipo, unidades, payload, ordem) values
  ('dx_dor_aguda','diagnostico','00132','Dor aguda','Conforto','real','["clinica","uti","obst"]'::jsonb,'{"def":["Relato verbal ou por escala de dor","Expressão facial de dor","Alteração de sinais vitais"],"fat":["Agente lesivo biológico, físico ou químico","Procedimento cirúrgico"],"resultado":"Referir alívio da dor para escore menor ou igual a 3 na escala em 24h","intervencoes":["nic_controle_dor","nic_monitoracao_sinais"]}'::jsonb,1),
  ('dx_integridade_pele','diagnostico','00046','Integridade da pele prejudicada','Segurança e proteção','real','["clinica","uti"]'::jsonb,'{"def":["Lesão por pressão","Ruptura da superfície da pele","Eritema não branqueável"],"fat":["Imobilização física","Umidade excessiva","Pressão sobre proeminência óssea"],"resultado":"Apresentar cicatrização progressiva, sem novas lesões","intervencoes":["nic_prevencao_lpp","nic_cuidados_pele","nic_mudanca_decubito"]}'::jsonb,2),
  ('dx_risco_integridade_pele','diagnostico','00047','Risco de integridade da pele prejudicada','Segurança e proteção','risco','["clinica","uti","peds","obst"]'::jsonb,'{"fat":["Imobilização","Escala de Braden alterada","Umidade excessiva"],"resultado":"Manter a pele íntegra durante a internação","intervencoes":["nic_prevencao_lpp","nic_cuidados_pele","nic_mudanca_decubito"]}'::jsonb,3),
  ('dx_risco_infeccao','diagnostico','00004','Risco de infecção','Segurança e proteção','risco','["clinica","uti","peds","obst"]'::jsonb,'{"fat":["Dispositivo invasivo","Procedimento invasivo","Defesas primárias alteradas"],"resultado":"Permanecer sem sinais de infecção, no sítio e sistêmicos","intervencoes":["nic_controle_infeccao","nic_cuidados_dispositivo","nic_monitoracao_sinais"]}'::jsonb,4),
  ('dx_mobilidade_fisica','diagnostico','00085','Mobilidade física prejudicada','Atividade e repouso','real','["clinica","uti"]'::jsonb,'{"def":["Amplitude de movimento diminuída","Dificuldade para mudar de decúbito"],"fat":["Dor","Força muscular diminuída","Repouso prescrito"],"resultado":"Participar do plano de mobilização progressiva","intervencoes":["nic_mobilizacao","nic_mudanca_decubito"]}'::jsonb,5),
  ('dx_deficit_autocuidado_banho','diagnostico','00108','Déficit no autocuidado para banho','Atividade e repouso','real','["clinica","uti"]'::jsonb,'{"def":["Incapacidade de acessar o banheiro","Incapacidade de higienizar o corpo"],"fat":["Fraqueza","Restrição ao leito"],"resultado":"Ter a higiene corporal mantida diariamente","intervencoes":["nic_higiene"]}'::jsonb,6),
  ('dx_risco_queda_adulto','diagnostico','00303','Risco de queda em adulto','Segurança e proteção','risco','["clinica","uti"]'::jsonb,'{"fat":["Escala de Morse alterada","História de quedas","Uso de sedativos"],"resultado":"Não sofrer quedas durante a internação","intervencoes":["nic_prevencao_quedas","nic_monitoracao_sinais"]}'::jsonb,7),
  ('dx_risco_queda_crianca','diagnostico','00306','Risco de queda em criança','Segurança e proteção','risco','["peds"]'::jsonb,'{"fat":["Faixa etária","Grades do leito inadequadas","Supervisão insuficiente"],"resultado":"Não sofrer quedas; grades e supervisão mantidas","intervencoes":["nic_prevencao_quedas"]}'::jsonb,8),
  ('dx_padrao_respiratorio','diagnostico','00032','Padrão respiratório ineficaz','Atividade e repouso','real','["clinica","uti"]'::jsonb,'{"def":["Dispneia","Uso de musculatura acessória","Taquipneia"],"fat":["Dor","Fadiga","Ansiedade"],"resultado":"Manter padrão respiratório eficaz, com FR e SpO2 nos alvos","intervencoes":["nic_monitoracao_respiratoria","nic_monitoracao_sinais"]}'::jsonb,9),
  ('dx_desobstrucao_vias_aereas','diagnostico','00031','Desobstrução ineficaz de vias aéreas','Segurança e proteção','real','["clinica","uti","peds"]'::jsonb,'{"def":["Secreção excessiva","Tosse ineficaz","Ruídos adventícios"],"fat":["Via aérea artificial","Secreção retida"],"resultado":"Manter as vias aéreas pérvias","intervencoes":["nic_aspiracao_vias_aereas","nic_monitoracao_respiratoria"]}'::jsonb,10),
  ('dx_troca_gases','diagnostico','00030','Troca de gases prejudicada','Atividade e repouso','real','["uti","clinica"]'::jsonb,'{"def":["Hipoxemia","Cianose","Padrão respiratório anormal"],"fat":["Desequilíbrio ventilação-perfusão"],"resultado":"Manter oxigenação adequada, com SpO2 no alvo","intervencoes":["nic_monitoracao_respiratoria","nic_monitoracao_sinais"]}'::jsonb,11),
  ('dx_hipertermia','diagnostico','00007','Hipertermia','Segurança e proteção','real','["clinica","peds"]'::jsonb,'{"def":["Temperatura acima do parâmetro normal","Pele quente ao toque","Taquicardia"],"fat":["Processo de doença","Sepse"],"resultado":"Retornar a temperatura corporal aos parâmetros normais","intervencoes":["nic_controle_hipertermia","nic_monitoracao_sinais","nic_hidratacao"]}'::jsonb,12),
  ('dx_volume_liquidos_deficiente','diagnostico','00027','Volume de líquidos deficiente','Nutrição','real','["clinica","peds","obst"]'::jsonb,'{"def":["Turgor da pele diminuído","Mucosas secas","Débito urinário diminuído"],"fat":["Perda ativa de volume","Ingesta insuficiente"],"resultado":"Manter hidratação adequada, com diurese e mucosas normais","intervencoes":["nic_hidratacao","nic_monitoracao_sinais"]}'::jsonb,13),
  ('dx_eliminacao_urinaria','diagnostico','00016','Eliminação urinária prejudicada','Eliminação e troca','real','["clinica"]'::jsonb,'{"def":["Disúria","Retenção urinária","Urgência miccional"],"fat":["Infecção urinária","Obstrução","Cateter vesical"],"resultado":"Recuperar padrão de eliminação urinária adequado","intervencoes":["nic_controle_eliminacao","nic_controle_infeccao"]}'::jsonb,14),
  ('dx_constipacao','diagnostico','00011','Constipação','Eliminação e troca','real','["clinica"]'::jsonb,'{"def":["Frequência evacuatória diminuída","Fezes endurecidas","Esforço à evacuação"],"fat":["Imobilidade","Ingesta hídrica e de fibras reduzida","Uso de opioides"],"resultado":"Recuperar o padrão intestinal habitual","intervencoes":["nic_controle_intestinal","nic_hidratacao"]}'::jsonb,15),
  ('dx_nutricao_menor','diagnostico','00002','Nutrição desequilibrada: menor que as necessidades corporais','Nutrição','real','["clinica","peds"]'::jsonb,'{"def":["Ingesta alimentar inadequada","Perda de peso","Fraqueza muscular"],"fat":["Inapetência","Dificuldade de deglutição"],"resultado":"Alcançar ingesta nutricional adequada à necessidade","intervencoes":["nic_hidratacao","nic_monitoracao_sinais"]}'::jsonb,16),
  ('dx_conhecimento_deficiente','diagnostico','00126','Conhecimento deficiente','Percepção e cognição','real','["clinica","obst"]'::jsonb,'{"def":["Relato de dúvida","Seguimento inadequado de orientações"],"fat":["Informação insuficiente","Primeiro contato com a condição"],"resultado":"Verbalizar compreensão sobre o cuidado e o tratamento","intervencoes":["nic_ensino_processo_doenca"]}'::jsonb,17),
  ('dx_risco_sangramento','diagnostico','00206','Risco de sangramento','Segurança e proteção','risco','["uti","obst"]'::jsonb,'{"fat":["Alteração da coagulação","Pós-parto","Uso de anticoagulante"],"resultado":"Permanecer sem sinais de sangramento ativo","intervencoes":["nic_monitoracao_sangramento","nic_monitoracao_sinais"]}'::jsonb,18),
  ('dx_comunicacao_verbal','diagnostico','00051','Comunicação verbal prejudicada','Percepção e cognição','real','["uti"]'::jsonb,'{"def":["Incapacidade de falar","Uso de via aérea artificial"],"fat":["Intubação","Sedação"],"resultado":"Estabelecer comunicação efetiva por meio alternativo","intervencoes":["nic_monitoracao_sinais"]}'::jsonb,19),
  ('dx_amamentacao_ineficaz','diagnostico','00104','Amamentação ineficaz','Papéis e relacionamentos','real','["obst"]'::jsonb,'{"def":["Pega inadequada","Esvaziamento mamário insuficiente","Choro do lactente após a mamada"],"fat":["Inexperiência materna","Fissura mamária"],"resultado":"Estabelecer amamentação eficaz, com pega adequada","intervencoes":["nic_apoio_amamentacao","nic_ensino_processo_doenca"]}'::jsonb,20),
  -- Intervenções NIC (payload: atividades, frequencia rótulo, frequencia_dia p/ aprazamento, se_necessario p/ SOS).
  ('nic_controle_dor','intervencao','1400','Controle da dor',null,null,'[]'::jsonb,'{"atividades":["Avaliar a dor com escala validada","Aplicar medidas não farmacológicas de alívio","Administrar analgesia conforme prescrição médica e reavaliar"],"frequencia":"6/6h","frequencia_dia":4}'::jsonb,101),
  ('nic_prevencao_lpp','intervencao','3540','Prevenção de lesão por pressão',null,null,'[]'::jsonb,'{"atividades":["Realizar mudança de decúbito","Manter a pele limpa e hidratada","Usar superfície de redistribuição de pressão"],"frequencia":"2/2h","frequencia_dia":12}'::jsonb,102),
  ('nic_cuidados_pele','intervencao','3590','Supervisão da pele',null,null,'[]'::jsonb,'{"atividades":["Inspecionar a pele e as proeminências ósseas","Registrar alterações encontradas"],"frequencia":"por turno","frequencia_dia":3}'::jsonb,103),
  ('nic_mudanca_decubito','intervencao','0840','Posicionamento',null,null,'[]'::jsonb,'{"atividades":["Reposicionar o paciente conforme cronograma","Aliviar pontos de pressão com coxins"],"frequencia":"2/2h","frequencia_dia":12}'::jsonb,104),
  ('nic_mobilizacao','intervencao','0221','Terapia de exercício: deambulação',null,null,'[]'::jsonb,'{"atividades":["Auxiliar na deambulação progressiva","Estimular exercícios no leito"],"frequencia":"2x/dia","frequencia_dia":2}'::jsonb,105),
  ('nic_higiene','intervencao','1801','Auxílio no autocuidado: banho e higiene',null,null,'[]'::jsonb,'{"atividades":["Auxiliar no banho e na higiene oral","Preservar a privacidade do paciente"],"frequencia":"1x/dia","frequencia_dia":1}'::jsonb,106),
  ('nic_prevencao_quedas','intervencao','6490','Prevenção contra quedas',null,null,'[]'::jsonb,'{"atividades":["Manter grades elevadas e leito baixo e travado","Deixar a campainha ao alcance","Orientar paciente e acompanhante"],"frequencia":"por turno","frequencia_dia":3}'::jsonb,107),
  ('nic_controle_infeccao','intervencao','6540','Controle de infecção',null,null,'[]'::jsonb,'{"atividades":["Higienizar as mãos antes e após o contato","Usar técnica asséptica nos procedimentos","Monitorar sinais flogísticos nos sítios de inserção"],"frequencia":"por turno","frequencia_dia":3}'::jsonb,108),
  ('nic_cuidados_dispositivo','intervencao','3440','Cuidados com o local de inserção',null,null,'[]'::jsonb,'{"atividades":["Inspecionar o sítio de inserção","Trocar o curativo conforme protocolo","Avaliar a necessidade de permanência do dispositivo"],"frequencia":"por turno","frequencia_dia":3}'::jsonb,109),
  ('nic_monitoracao_respiratoria','intervencao','3350','Monitoração respiratória',null,null,'[]'::jsonb,'{"atividades":["Monitorar frequência, ritmo e esforço respiratório","Auscultar os sons pulmonares","Monitorar a SpO2"],"frequencia":"4/4h","frequencia_dia":6}'::jsonb,110),
  ('nic_aspiracao_vias_aereas','intervencao','3160','Aspiração de vias aéreas',null,null,'[]'::jsonb,'{"atividades":["Aspirar secreções com técnica asséptica quando indicado","Monitorar a SpO2 antes e após o procedimento"],"frequencia":"SOS","se_necessario":true}'::jsonb,111),
  ('nic_controle_hipertermia','intervencao','3740','Tratamento da febre',null,null,'[]'::jsonb,'{"atividades":["Monitorar a temperatura","Aplicar medidas de resfriamento","Administrar antitérmico conforme prescrição"],"frequencia":"4/4h","frequencia_dia":6}'::jsonb,112),
  ('nic_monitoracao_sinais','intervencao','6680','Monitoração de sinais vitais',null,null,'[]'::jsonb,'{"atividades":["Aferir e registrar os sinais vitais","Comunicar alterações à enfermeira"],"frequencia":"6/6h","frequencia_dia":4}'::jsonb,113),
  ('nic_hidratacao','intervencao','4120','Controle hídrico',null,null,'[]'::jsonb,'{"atividades":["Controlar a oferta e as perdas hídricas","Monitorar a diurese e o balanço"],"frequencia":"por turno","frequencia_dia":3}'::jsonb,114),
  ('nic_controle_eliminacao','intervencao','0590','Controle da eliminação urinária',null,null,'[]'::jsonb,'{"atividades":["Monitorar o padrão e as características da diurese","Estimular a ingesta hídrica quando permitido"],"frequencia":"por turno","frequencia_dia":3}'::jsonb,115),
  ('nic_controle_intestinal','intervencao','0430','Controle intestinal',null,null,'[]'::jsonb,'{"atividades":["Registrar a frequência e as características das evacuações","Estimular fibras e hidratação quando permitido"],"frequencia":"1x/dia","frequencia_dia":1}'::jsonb,116),
  ('nic_monitoracao_sangramento','intervencao','4010','Prevenção de sangramento',null,null,'[]'::jsonb,'{"atividades":["Monitorar sinais de sangramento","Avaliar o tônus uterino e os lóquios no pós-parto","Acompanhar os exames de coagulação"],"frequencia":"por turno","frequencia_dia":3}'::jsonb,117),
  ('nic_apoio_amamentacao','intervencao','1054','Assistência na amamentação',null,null,'[]'::jsonb,'{"atividades":["Orientar a pega e o posicionamento","Avaliar a mamada e o esvaziamento","Prevenir e tratar fissuras mamárias"],"frequencia":"por turno","frequencia_dia":3}'::jsonb,118),
  ('nic_ensino_processo_doenca','intervencao','5602','Ensino: processo da doença',null,null,'[]'::jsonb,'{"atividades":["Explicar a condição e o tratamento em linguagem acessível","Verificar a compreensão do paciente e da família"],"frequencia":"1x/dia","frequencia_dia":1}'::jsonb,119)
on conflict (id) do nothing;

-- Verificação
select 'enf SAE: catálogo semeado — ' || count(*) || ' itens (' ||
       count(*) filter (where tipo='diagnostico') || ' diagnósticos, ' ||
       count(*) filter (where tipo='intervencao') || ' intervenções)' as resultado
  from public.enf_sae_catalogo;
