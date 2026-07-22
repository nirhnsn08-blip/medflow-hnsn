-- ═══════════════════════════════════════════════════════════
-- PRONTUÁRIO ELETRÔNICO DO PACIENTE (PEP) — Fase 1
--
-- O QUE MUDA
-- O módulo "Paciente 360" de hoje é um RESUMO: ele lê o que os outros
-- módulos já gravaram (PS, leitos, SCIH, farmácia) e monta uma linha do
-- tempo. Registro clínico próprio ele só tem um: `pep_evolucoes`, um texto
-- livre com um `tipo`. Isso não é prontuário — não há admissão, não há
-- prescrição de internado, não há aprazamento, não há checagem, e a
-- alergia do paciente está presa ao episódio do PS.
--
-- Esta migração cria a espinha do PEP: episódio de cuidado, anamnese/exame
-- físico, prescrição (médica e de enfermagem) com aprazamento e checagem,
-- anotações de enfermagem, sinais vitais seriados e as listas persistentes
-- do paciente (alergias e problemas/condições).
--
-- O QUE **NÃO** É RECRIADO (já existe e continua valendo)
--   • `pacientes`            — cadastro mínimo LGPD (iniciais + prontuário).
--   • `pep_evolucoes`        — evolução multiprofissional. NÃO é substituída:
--                              ganha colunas (episódio, SOAP, correção, autor).
--   • `ps_atendimentos`,
--     `ps_sinais`,
--     `ps_registros`,
--     `ps_prescricao_itens`,
--     `ps_administracoes`    — o episódio do Pronto-Socorro continua inteiro
--                              no módulo dele. O PEP se pendura nele por
--                              `pep_episodios.ps_atendimento_id`, não o
--                              reescreve. Migrar o PS para as tabelas novas
--                              é decisão de outra fase.
--   • `leitos`, `leitos_saidas`, `leitos_turnover` — gestão de leito é
--                              estado do LEITO, não do paciente. O PEP não
--                              duplica isso; `pep_episodios` guarda apenas
--                              o leito/setor como texto de contexto.
--   • `farm_medicamentos` e o kardex — catálogo e estoque não são PEP.
--
-- ── REGRA 1: REGISTRO CLÍNICO É APPEND-ONLY ────────────────
-- Nenhuma tabela clínica desta migração tem política de UPDATE ou DELETE.
-- Sem política, o PostgREST recusa a operação para qualquer papel, inclusive
-- `adm_master` — é o mesmo mecanismo já usado em `ps_registros`,
-- `ps_administracoes` e no kardex da farmácia.
-- Corrigir = INSERIR um registro novo com `corrige_id` apontando para o
-- errado e `motivo_correcao` preenchido. O registro errado permanece: é o
-- que dá valor probatório ao prontuário.
-- Consequência prática para o front-end: a "versão atual" de um registro é
-- aquela que ninguém corrigiu, ou seja
--     ... where not exists (select 1 from <tabela> c where c.corrige_id = t.id)
--
-- A única exceção é `pep_episodios` — que é o CONTINENTE, não o conteúdo
-- clínico. Ele precisa ser fechado (alta/desfecho), exatamente como
-- `ps_atendimentos` já é. Tem UPDATE restrito e NÃO tem DELETE.
--
-- ── REGRA 2: `criado_em` E NÃO `created_at` ────────────────
-- O banco está dividido: 23 tabelas usam `created_at` e 3 usam `criado_em`.
-- A divisão não é aleatória — as 3 em português (`pep_evolucoes`,
-- `ps_registros`, `ps_administracoes`) são exatamente as tabelas de
-- REGISTRO CLÍNICO APPEND-ONLY. Aqui `criado_em` é adotado para todas as
-- tabelas novas, por três motivos:
--   1. `pep_evolucoes` já usa `criado_em`. Uma irmã com `created_at` faria
--      o mesmo módulo ordenar por dois nomes diferentes — erro que já
--      mordeu o time (ver comentário no App.jsx, carga do Paciente 360).
--   2. Vira uma regra que dá para lembrar: **tabela `pep_*` → `criado_em`**.
--   3. Reforça a leitura semântica: `criado_em` = carimbo imutável do fato
--      clínico; `created_at`/`updated_at` = tabela operacional editável.
-- `pep_episodios`, por ser operacional, tem também `atualizado_em`.
--
-- ── REGRA 3: MIGRAÇÃO ADITIVA ──────────────────────────────
-- Só `create table if not exists` / `add column if not exists` / índices.
-- Nenhum drop de tabela ou coluna. Idempotente: pode rodar de novo.
--
-- ── REGRA 4: LGPD ──────────────────────────────────────────
-- Nenhuma coluna de nome completo, CPF, endereço ou telefone do paciente.
-- A identificação continua sendo iniciais + prontuário. Os campos de NOME
-- que existem aqui (`profissional_nome`, `executor_nome`) são do
-- PROFISSIONAL, não do paciente — são exigência de rastreabilidade
-- assistencial (quem escreveu, quem administrou) e vêm acompanhados de
-- conselho + registro (CRM/COREN/CREFITO/CRN/CRESS).
--
-- ── SOBRE O `prontuario` SEM CHAVE ESTRANGEIRA ─────────────
-- `prontuario` é texto indexado, SEM foreign key para `pacientes`, igual a
-- `pep_evolucoes` e `ps_atendimentos`. É deliberado: o PS cadastra por
-- iniciais e muitos episódios reais existem antes de o paciente entrar em
-- `pacientes`. Uma FK aqui faria a enfermagem NÃO CONSEGUIR SALVAR uma
-- alergia no meio do plantão. Integridade por convenção, como no resto do
-- sistema. (Ver "Pontos em aberto" no relatório: fechar isso depois exige
-- backfill de `pacientes`.)
--
-- ── PAPÉIS ─────────────────────────────────────────────────
-- Segue EXATAMENTE o padrão vigente, via `public.my_role()`:
--   • SELECT  → todo autenticado (`using (true)`)  → analista e visualizador
--   • INSERT  → adm_master, adm_silver
--   • UPDATE  → adm_master, adm_silver  (só `pep_episodios`)
--   • DELETE  → adm_master             (nenhuma tabela desta migração)
-- Apertar o SELECT por papel é decisão CLÍNICA em aberto (CONTEXTO.md,
-- "Decisões em aberto" nº 0) e NÃO foi antecipada aqui: fazer isso sozinho
-- tiraria acesso de quem tem direito no meio do plantão.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ═══════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════
-- 1) EPISÓDIO DE CUIDADO — a espinha do prontuário
--
-- Hoje não existe nada que represente "esta internação". `leitos` é o
-- estado atual de um LEITO (é sobrescrito na próxima ocupação) e
-- `leitos_saidas` só nasce na alta. Não há um id estável para pendurar
-- evolução, prescrição e checagem durante a internação inteira.
-- `pep_episodios` é esse id.
--
-- Todo registro clínico desta migração aponta para o PACIENTE
-- (`prontuario`, obrigatório) e OPCIONALMENTE para o episódio. Episódio
-- nulo é aceito de propósito: permite adotar o PEP por partes, sem exigir
-- que alguém abra episódio antes de registrar um sinal vital.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_episodios (
  id bigserial primary key,
  prontuario text not null,
  iniciais text,                          -- redundância proposital: a lista
                                          -- de episódios não depende de join
  tipo text not null default 'internacao', -- internacao | ps | ambulatorio | observacao | day_clinic
  -- Elo com o episódio do PS, quando a internação nasceu de lá. Mesmo
  -- padrão de `solicitacoes.ps_atendimento_id` e `leitos.ps_atendimento_id`.
  ps_atendimento_id bigint references public.ps_atendimentos(id) on delete set null,
  -- Leito/setor como TEXTO, não FK: `leitos.identificacao` é reaproveitado
  -- pelo próximo paciente. Guardar a FK apontaria para a ocupação errada
  -- daqui a dois dias.
  leito text,
  setor text,
  especialidade text,
  admissao_em timestamptz not null default now(),
  alta_em timestamptz,
  desfecho text,                          -- alta | obito | transferencia | evasao | alta_a_pedido
  desfecho_detalhe text,
  cid_principal text,
  cid_secundarios text,                   -- lista separada por vírgula
  motivo_internacao text,
  status text not null default 'aberto',  -- aberto | encerrado
  observacao text,
  usuario text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists pep_epis_pront_idx on public.pep_episodios (prontuario, admissao_em desc);
create index if not exists pep_epis_status_idx on public.pep_episodios (status, admissao_em desc);
create index if not exists pep_epis_ps_idx on public.pep_episodios (ps_atendimento_id);
alter table public.pep_episodios enable row level security;
drop policy if exists pep_epis_select on public.pep_episodios;
drop policy if exists pep_epis_insert on public.pep_episodios;
drop policy if exists pep_epis_update on public.pep_episodios;
create policy pep_epis_select on public.pep_episodios
  for select to authenticated
  using (true);
create policy pep_epis_insert on public.pep_episodios
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy pep_epis_update on public.pep_episodios
  for update to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem delete: episódio encerrado é histórico assistencial, não some


-- ═══════════════════════════════════════════════════════════
-- 2) ANAMNESE + EXAME FÍSICO — a admissão
--
-- É o registro de ENTRADA, e é multiprofissional: o médico faz anamnese e
-- exame físico; a enfermagem faz o histórico de enfermagem (SAE, primeira
-- etapa); nutrição faz a triagem nutricional; serviço social faz a
-- avaliação social. Todos preenchem a mesma tabela mudando `categoria` —
-- separar em cinco tabelas quase idênticas não pagaria o custo.
--
-- Os achados por sistema vão em `sistemas` (jsonb) porque a lista varia por
-- profissão e por protocolo do hospital; virar coluna cada um deles
-- engessaria o formulário e exigiria migração a cada ajuste clínico.
-- APPEND-ONLY. Corrigir = novo registro com `corrige_id`.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_anamneses (
  id bigserial primary key,
  prontuario text not null,
  episodio_id bigint references public.pep_episodios(id) on delete set null,
  categoria text not null default 'medica',
  -- medica | enfermagem | fisioterapia | nutricao | servico_social | psicologia | farmacia
  queixa_principal text,
  historia_doenca_atual text,
  antecedentes_pessoais text,
  antecedentes_familiares text,
  medicamentos_em_uso text,               -- reconciliação medicamentosa na entrada
  habitos text,                           -- tabagismo, etilismo, atividade física
  alergias_relatadas text,                -- o que o paciente RELATOU na admissão;
                                          -- a lista oficial é `pep_alergias`
  exame_fisico text,                      -- exame geral, texto livre
  sistemas jsonb not null default '{}',   -- {"cardiovascular":"...","respiratorio":"..."}
  escalas jsonb not null default '{}',    -- {"braden":18,"morse":45,"glasgow":15}
  hipoteses_diagnosticas text,
  cid_suspeito text,
  conduta_inicial text,
  plano_terapeutico text,
  observacao text,
  -- Cadeia de correção (append-only)
  corrige_id bigint references public.pep_anamneses(id) on delete set null,
  motivo_correcao text,
  -- Autoria assistencial (rastreabilidade; NÃO é dado do paciente)
  profissional_nome text,
  conselho text,                          -- CRM | COREN | CREFITO | CRN | CRESS | CRP | CRF
  registro_conselho text,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_anam_pront_idx on public.pep_anamneses (prontuario, criado_em desc);
create index if not exists pep_anam_epis_idx on public.pep_anamneses (episodio_id, criado_em desc);
create index if not exists pep_anam_corrige_idx on public.pep_anamneses (corrige_id);
alter table public.pep_anamneses enable row level security;
drop policy if exists pep_anam_select on public.pep_anamneses;
drop policy if exists pep_anam_insert on public.pep_anamneses;
create policy pep_anam_select on public.pep_anamneses
  for select to authenticated
  using (true);
create policy pep_anam_insert on public.pep_anamneses
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável


-- ═══════════════════════════════════════════════════════════
-- 3) EVOLUÇÃO MULTIPROFISSIONAL — extensão de `pep_evolucoes`
--
-- A tabela JÁ EXISTE e já é append-only, com `tipo` cobrindo
-- evolucao_medica | enfermagem | fisioterapia | nutricao | anotacao.
-- Recriá-la quebraria a tela do Paciente 360 e jogaria fora o histórico.
-- Ela só ganha o que faltava: vínculo com o episódio, estrutura SOAP
-- opcional, cadeia de correção e autoria com conselho profissional.
--
-- `tipo` é texto livre, então os valores novos entram sem migração:
--   servico_social | psicologia | farmacia_clinica | fonoaudiologia
-- ═══════════════════════════════════════════════════════════
alter table public.pep_evolucoes
  add column if not exists episodio_id bigint references public.pep_episodios(id) on delete set null,
  add column if not exists categoria text,             -- admissao | diaria | intercorrencia | alta | parecer
  -- SOAP: opcional e ADICIONAL a `texto`, que continua sendo o campo
  -- obrigatório. Quem escreve corrido não é obrigado a estruturar.
  add column if not exists subjetivo text,
  add column if not exists objetivo text,
  add column if not exists avaliacao text,
  add column if not exists plano text,
  add column if not exists corrige_id bigint references public.pep_evolucoes(id) on delete set null,
  add column if not exists motivo_correcao text,
  add column if not exists profissional_nome text,
  add column if not exists conselho text,
  add column if not exists registro_conselho text;
create index if not exists pep_evol_epis_idx on public.pep_evolucoes (episodio_id, criado_em desc);
create index if not exists pep_evol_corrige_idx on public.pep_evolucoes (corrige_id);
create index if not exists pep_evol_tipo_idx on public.pep_evolucoes (tipo, criado_em desc);
-- RLS e políticas (pep_select / pep_insert) já existem no schema.sql e
-- continuam corretas: select para autenticado, insert restrito, sem
-- update/delete. Nada a refazer aqui.


-- ═══════════════════════════════════════════════════════════
-- 4) PRESCRIÇÃO — cabeçalho (médica E de enfermagem)
--
-- No hospital a prescrição é um DOCUMENTO DO DIA, assinado, com validade
-- de 24h, e a do dia seguinte substitui a anterior. Por isso cabeçalho
-- separado dos itens: é ele que tem vigência, assinatura e substituição.
--
-- Uma tabela só para as duas naturezas (`tipo`), porque a estrutura é
-- idêntica — muda o prescritor e o que entra nos itens. Duas tabelas
-- gêmeas dobrariam o código de aprazamento e checagem sem ganho.
--
-- APPEND-ONLY: prescrição não é editada. Trocar a prescrição = inserir uma
-- nova com `substitui_id` apontando para a anterior. Suspender/reativar =
-- evento em `pep_prescricao_eventos` (item 6).
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_prescricoes (
  id bigserial primary key,
  prontuario text not null,
  episodio_id bigint references public.pep_episodios(id) on delete set null,
  tipo text not null default 'medica',    -- medica | enfermagem
  -- Data de referência SEM `current_date`: no Supabase o banco roda em UTC
  -- e, depois das 21h no Brasil, `current_date` já é o dia seguinte. Foi
  -- exatamente esse o bug crítico do PR #1 (`todayStr()` em UTC). Aqui o
  -- default é explicitamente o dia civil de São Paulo.
  data_referencia date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  inicio_em timestamptz not null default now(),
  validade_em timestamptz,                -- normalmente inicio_em + 24h
  substitui_id bigint references public.pep_prescricoes(id) on delete set null,
  motivo_substituicao text,               -- inclui "correção de erro de digitação"
  observacao text,
  -- Assinatura do prescritor
  prescritor_nome text,
  conselho text,                          -- CRM (médica) | COREN (enfermagem)
  registro_conselho text,
  assinada_em timestamptz,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_presc_pront_idx on public.pep_prescricoes (prontuario, data_referencia desc);
create index if not exists pep_presc_epis_idx on public.pep_prescricoes (episodio_id, data_referencia desc);
create index if not exists pep_presc_subst_idx on public.pep_prescricoes (substitui_id);
alter table public.pep_prescricoes enable row level security;
drop policy if exists pep_presc_select on public.pep_prescricoes;
drop policy if exists pep_presc_insert on public.pep_prescricoes;
create policy pep_presc_select on public.pep_prescricoes
  for select to authenticated
  using (true);
create policy pep_presc_insert on public.pep_prescricoes
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável


-- ═══════════════════════════════════════════════════════════
-- 5) ITENS DA PRESCRIÇÃO
--
-- Cobre medicamento, dieta, cuidado de enfermagem, procedimento, exame e
-- terapias. Um `tipo` só, porque todos precisam da mesma coisa: aprazar e
-- checar. "Mudança de decúbito 2/2h" e "Dipirona 500 mg 6/6h" têm o mesmo
-- ciclo de vida operacional.
--
-- Campos numéricos de dose repetem a escolha já feita em
-- `ps_prescricao_itens` (dose_valor / dose_unidade / frequencia_dia) — é o
-- que o motor de alerta da farmácia clínica consome. Texto livre de dose
-- não serve para calcular dose máxima diária.
--
-- `intervalo_horas` existe para GERAR o aprazamento; `frequencia` guarda o
-- que o prescritor escreveu ("6/6h", "ACM", "após as refeições").
-- APPEND-ONLY.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_prescricao_itens (
  id bigserial primary key,
  prescricao_id bigint not null references public.pep_prescricoes(id) on delete cascade,
  prontuario text not null,               -- desnormalizado: o Paciente 360
                                          -- consulta por paciente, não por
                                          -- prescrição
  episodio_id bigint references public.pep_episodios(id) on delete set null,
  tipo text not null default 'medicamento',
  -- medicamento | dieta | cuidado_enfermagem | procedimento | exame |
  -- fisioterapia | oxigenoterapia | soro | curativo
  medicamento_id bigint references public.farm_medicamentos(id) on delete set null,
  descricao text not null,                -- o texto do item como prescrito
  apresentacao text,
  dose text,                              -- como escrito ("500 mg")
  dose_valor numeric,                     -- para o motor de alertas
  dose_unidade text,
  via text,                               -- VO | EV | IM | SC | SL | IN | RETAL | SONDA | TOP
  diluicao text,
  velocidade_infusao text,
  frequencia text,                        -- como escrito ("6/6h", "ACM")
  frequencia_dia numeric,                 -- doses por dia (cálculo de dose máxima)
  intervalo_horas numeric,                -- base do aprazamento automático
  duracao_dias numeric,
  quantidade numeric,
  unidade text,
  se_necessario boolean not null default false,  -- SOS/ACM: não gera aprazamento fixo
  condicao_sos text,                      -- "se dor", "se T > 37,8"
  ordem int default 0,
  observacao text,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_pitem_presc_idx on public.pep_prescricao_itens (prescricao_id, ordem);
create index if not exists pep_pitem_pront_idx on public.pep_prescricao_itens (prontuario, criado_em desc);
create index if not exists pep_pitem_med_idx on public.pep_prescricao_itens (medicamento_id);
alter table public.pep_prescricao_itens enable row level security;
drop policy if exists pep_pitem_select on public.pep_prescricao_itens;
drop policy if exists pep_pitem_insert on public.pep_prescricao_itens;
create policy pep_pitem_select on public.pep_prescricao_itens
  for select to authenticated
  using (true);
create policy pep_pitem_insert on public.pep_prescricao_itens
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável


-- ═══════════════════════════════════════════════════════════
-- 6) EVENTOS DA PRESCRIÇÃO — o estado sem UPDATE
--
-- Suspender um antibiótico é um ATO CLÍNICO com hora e responsável. Se
-- fosse uma coluna `status` atualizada, a informação de quando e por quem
-- se perderia — e violaria o append-only.
--
-- Mesma lógica do kardex da farmácia: o saldo não é digitado, é derivado
-- dos movimentos. Aqui o status vigente de um item é o `evento` do último
-- registro dele:
--     select distinct on (item_id) item_id, evento
--       from public.pep_prescricao_eventos
--      where item_id is not null
--      order by item_id, criado_em desc;
-- Item sem nenhum evento está vigente.
-- `item_id` nulo = evento vale para a prescrição inteira.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_prescricao_eventos (
  id bigserial primary key,
  prescricao_id bigint not null references public.pep_prescricoes(id) on delete cascade,
  item_id bigint references public.pep_prescricao_itens(id) on delete cascade,
  prontuario text not null,
  episodio_id bigint references public.pep_episodios(id) on delete set null,
  evento text not null,                   -- suspenso | reativado | encerrado |
                                          -- cancelado | concluido | avaliado_farmacia
  motivo text,
  observacao text,
  profissional_nome text,
  conselho text,
  registro_conselho text,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_pevt_item_idx on public.pep_prescricao_eventos (item_id, criado_em desc);
create index if not exists pep_pevt_presc_idx on public.pep_prescricao_eventos (prescricao_id, criado_em desc);
alter table public.pep_prescricao_eventos enable row level security;
drop policy if exists pep_pevt_select on public.pep_prescricao_eventos;
drop policy if exists pep_pevt_insert on public.pep_prescricao_eventos;
create policy pep_pevt_select on public.pep_prescricao_eventos
  for select to authenticated
  using (true);
create policy pep_pevt_insert on public.pep_prescricao_eventos
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável


-- ═══════════════════════════════════════════════════════════
-- 7) APRAZAMENTO — o horário PLANEJADO de cada dose/cuidado
--
-- Aprazar é a enfermagem transformar "6/6h" em 06:00, 12:00, 18:00, 00:00.
-- Sem essa tabela não existe "dose atrasada" nem "dose não checada": só dá
-- para saber o que foi feito, nunca o que deixou de ser.
--
-- 1 item : N aprazamentos. Um item 6/6h por 3 dias gera 12 linhas.
-- Itens `se_necessario` (SOS) normalmente NÃO geram aprazamento — a
-- administração entra sem `aprazamento_id`.
--
-- Esta tabela guarda só o PLANO. O que aconteceu está em
-- `pep_administracoes` — assim o plano continua append-only e a checagem
-- não precisa de UPDATE. Dose pendente = aprazamento sem administração:
--     select a.* from public.pep_aprazamentos a
--      where not exists (select 1 from public.pep_administracoes x
--                         where x.aprazamento_id = a.id);
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_aprazamentos (
  id bigserial primary key,
  item_id bigint not null references public.pep_prescricao_itens(id) on delete cascade,
  prescricao_id bigint references public.pep_prescricoes(id) on delete cascade,
  prontuario text not null,
  episodio_id bigint references public.pep_episodios(id) on delete set null,
  previsto_para timestamptz not null,     -- timestamptz: o app manda o horário
                                          -- local já resolvido; nunca `date`
  sequencia int,                          -- 1..n dentro do item
  dose_prevista text,
  via text,
  observacao text,
  aprazado_por text,                      -- profissional que aprazou
  conselho text,
  registro_conselho text,
  usuario text,
  criado_em timestamptz not null default now()
);
-- Um item não pode ter dois aprazamentos no mesmo instante: a geração
-- automática rodando duas vezes duplicaria a fila de medicação da enfermagem.
create unique index if not exists pep_aprz_uq on public.pep_aprazamentos (item_id, previsto_para);
create index if not exists pep_aprz_pront_idx on public.pep_aprazamentos (prontuario, previsto_para);
create index if not exists pep_aprz_prev_idx on public.pep_aprazamentos (previsto_para);
create index if not exists pep_aprz_epis_idx on public.pep_aprazamentos (episodio_id, previsto_para);
alter table public.pep_aprazamentos enable row level security;
drop policy if exists pep_aprz_select on public.pep_aprazamentos;
drop policy if exists pep_aprz_insert on public.pep_aprazamentos;
create policy pep_aprz_select on public.pep_aprazamentos
  for select to authenticated
  using (true);
create policy pep_aprz_insert on public.pep_aprazamentos
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: o plano aprazado é registro clínico.
-- Reaprazar = inserir horário novo e registrar 'nao_administrado' + motivo
-- no horário antigo, em pep_administracoes.


-- ═══════════════════════════════════════════════════════════
-- 8) CHECAGEM / ADMINISTRAÇÃO — o que de fato foi feito
--
-- A dispensação da farmácia prova que o remédio SAIU DO ESTOQUE. Só esta
-- tabela prova que ele ENTROU NO PACIENTE — com hora, executor e, quando
-- não foi dado, o motivo. Vale também para cuidado de enfermagem
-- ("mudança de decúbito realizada às 14h") — por isso `descricao` e não
-- só medicamento.
--
-- POR QUE NÃO REUSAR `ps_administracoes`
-- Aquela tabela tem `atendimento_id bigint NOT NULL references
-- ps_atendimentos(id)`: um internado sem passagem pelo PS não cabe nela.
-- Relaxar o NOT NULL mexeria numa tabela em produção do módulo PS. As duas
-- convivem; convergir é decisão para uma fase futura (ver relatório).
-- APPEND-ONLY. Checagem errada se corrige com `corrige_id`.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_administracoes (
  id bigserial primary key,
  prontuario text not null,
  episodio_id bigint references public.pep_episodios(id) on delete set null,
  -- Nulo em dose SOS/ACM (sem horário planejado) e em dose extra.
  aprazamento_id bigint references public.pep_aprazamentos(id) on delete set null,
  item_id bigint references public.pep_prescricao_itens(id) on delete set null,
  prescricao_id bigint references public.pep_prescricoes(id) on delete set null,
  medicamento_id bigint references public.farm_medicamentos(id) on delete set null,
  descricao text not null,                -- item executado, congelado no ato
  dose text,
  dose_valor numeric,
  dose_unidade text,
  via text,
  status text not null default 'administrado',
  -- administrado | nao_administrado | recusado | adiado | suspenso
  motivo text,                            -- obrigatório quando não administrado
  observacao text,
  previsto_para timestamptz,              -- cópia do aprazamento: permite
                                          -- calcular atraso sem join
  administrado_em timestamptz not null default now(),
  -- Quem executou (rastreabilidade assistencial — dado do PROFISSIONAL)
  executor_nome text,
  categoria text,                         -- enfermeiro | tecnico | medico | fisio | outro
  conselho text,
  registro_conselho text,
  corrige_id bigint references public.pep_administracoes(id) on delete set null,
  motivo_correcao text,
  usuario text,
  criado_em timestamptz not null default now(),
  -- Dose não dada sem motivo é buraco em auditoria de segurança do paciente.
  constraint pep_adm_motivo_ck check (status = 'administrado' or motivo is not null)
);
create index if not exists pep_adm_pront_idx on public.pep_administracoes (prontuario, administrado_em desc);
create index if not exists pep_adm_aprz_idx on public.pep_administracoes (aprazamento_id);
create index if not exists pep_adm_item_idx on public.pep_administracoes (item_id, administrado_em desc);
create index if not exists pep_adm_epis_idx on public.pep_administracoes (episodio_id, administrado_em desc);
alter table public.pep_administracoes enable row level security;
drop policy if exists pep_adm_select on public.pep_administracoes;
drop policy if exists pep_adm_insert on public.pep_administracoes;
create policy pep_adm_select on public.pep_administracoes
  for select to authenticated
  using (true);
create policy pep_adm_insert on public.pep_administracoes
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável


-- ═══════════════════════════════════════════════════════════
-- 9) ANOTAÇÕES DE ENFERMAGEM
--
-- NÃO é a mesma coisa que evolução de enfermagem. A evolução é o raciocínio
-- do turno, uma por plantão. A anotação é o fato pontual e frequente —
-- "evacuou", "aceitou 50% da dieta", "queda da própria altura às 03:20",
-- "punção de acesso em MSD". São dezenas por dia e é nelas que mora a
-- evidência de intercorrência. Misturar as duas em `pep_evolucoes` faria a
-- evolução clínica sumir no meio do ruído.
-- APPEND-ONLY.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_anotacoes_enfermagem (
  id bigserial primary key,
  prontuario text not null,
  episodio_id bigint references public.pep_episodios(id) on delete set null,
  turno text,                             -- manha | tarde | noite
  categoria text,
  -- eliminacoes | dieta | higiene | dor | intercorrencia | acesso_venoso |
  -- curativo | mobilizacao | dispositivo | queda | contencao | orientacao | outro
  texto text not null,
  ocorrido_em timestamptz not null default now(),  -- quando o fato aconteceu
                                                   -- (pode ser antes de anotar)
  intercorrencia boolean not null default false,   -- destaca no Paciente 360
  corrige_id bigint references public.pep_anotacoes_enfermagem(id) on delete set null,
  motivo_correcao text,
  profissional_nome text,
  conselho text,                          -- COREN
  registro_conselho text,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_anot_pront_idx on public.pep_anotacoes_enfermagem (prontuario, ocorrido_em desc);
create index if not exists pep_anot_epis_idx on public.pep_anotacoes_enfermagem (episodio_id, ocorrido_em desc);
create index if not exists pep_anot_inter_idx on public.pep_anotacoes_enfermagem (intercorrencia, ocorrido_em desc);
alter table public.pep_anotacoes_enfermagem enable row level security;
drop policy if exists pep_anot_select on public.pep_anotacoes_enfermagem;
drop policy if exists pep_anot_insert on public.pep_anotacoes_enfermagem;
create policy pep_anot_select on public.pep_anotacoes_enfermagem
  for select to authenticated
  using (true);
create policy pep_anot_insert on public.pep_anotacoes_enfermagem
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável


-- ═══════════════════════════════════════════════════════════
-- 10) SINAIS VITAIS SERIADOS
--
-- `ps_sinais` já faz isso, mas amarrado a `ps_atendimentos` e carregando a
-- classificação de Manchester — é a aferição da TRIAGEM. O internado que
-- nunca passou pelo PS não tem onde registrar. Esta tabela é do PACIENTE:
-- serve a internação, ambulatório e observação.
--
-- Inclui balanço hídrico e escore de alerta precoce (NEWS2/MEWS), que é o
-- que transforma sinal vital em ação — sem escore, a deterioração só é
-- percebida quando alguém olha a folha.
-- APPEND-ONLY.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_sinais_vitais (
  id bigserial primary key,
  prontuario text not null,
  episodio_id bigint references public.pep_episodios(id) on delete set null,
  pa_sist int,
  pa_diast int,
  pam int,                                -- pressão arterial média
  fc int,
  fr int,
  spo2 int,
  suporte_o2 text,                        -- ar ambiente | cateter 2L | mascara | VNI | VM
  temp numeric(4,1),
  dor int,                                -- escala 0-10
  glicemia int,
  consciencia text,                       -- alerta | verbal | dor | irresponsivo (AVPU)
  glasgow int,
  peso numeric(5,1),                      -- entra aqui, não em `pacientes`:
  altura numeric(4,2),                    -- peso muda e serve para dose/dia
  diurese_ml numeric,
  balanco_hidrico_ml numeric,
  evacuacao text,
  escala_alerta text,                     -- news2 | mews | pews
  score_alerta int,
  observacao text,
  aferido_em timestamptz not null default now(),
  corrige_id bigint references public.pep_sinais_vitais(id) on delete set null,
  motivo_correcao text,
  profissional_nome text,
  conselho text,
  registro_conselho text,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_sv_pront_idx on public.pep_sinais_vitais (prontuario, aferido_em desc);
create index if not exists pep_sv_epis_idx on public.pep_sinais_vitais (episodio_id, aferido_em desc);
create index if not exists pep_sv_score_idx on public.pep_sinais_vitais (score_alerta);
alter table public.pep_sinais_vitais enable row level security;
drop policy if exists pep_sv_select on public.pep_sinais_vitais;
drop policy if exists pep_sv_insert on public.pep_sinais_vitais;
create policy pep_sv_select on public.pep_sinais_vitais
  for select to authenticated
  using (true);
create policy pep_sv_insert on public.pep_sinais_vitais
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável


-- ═══════════════════════════════════════════════════════════
-- 11) ALERGIAS DO PACIENTE — a correção do erro estrutural
--
-- Hoje alergia é `ps_atendimentos.alergias`, um texto livre preso ao
-- episódio do PS. Isso significa que:
--   • o mesmo paciente voltando ao PS chega SEM a alergia dele;
--   • o internado que nunca passou pelo PS não tem onde declarar alergia;
--   • o motor de alerta da farmácia clínica só enxerga alergia de quem
--     está num atendimento de PS aberto.
-- Alergia é do PACIENTE e atravessa todas as passagens dele pelo hospital.
--
-- `ps_atendimentos.alergias` NÃO é removido (migração aditiva, e o App.jsx
-- depende dele hoje). Ele passa a ser o que o paciente relatou NAQUELA
-- passagem; a lista oficial é esta.
--
-- `substancia` existe separado de `agente` porque o motor de alerta casa
-- por princípio ativo: o paciente diz "Novalgina", a prescrição diz
-- "Dipirona 500 mg". Sem o campo normalizado o alerta não dispara.
--
-- "Nega alergias" É informação clínica e precisa ser gravada — sem isso
-- não dá para distinguir "não tem alergia" de "ninguém perguntou".
-- Registrar com tipo = 'nenhuma_conhecida'.
--
-- APPEND-ONLY: refutar uma alergia (teste negativo) = novo registro com
-- `corrige_id` apontando para o anterior e `situacao` = 'refutada'.
-- Lista vigente = registros ativos que ninguém corrigiu.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_alergias (
  id bigserial primary key,
  prontuario text not null,
  agente text not null,                   -- como o paciente/prescritor chama
  substancia text,                        -- princípio ativo normalizado
  tipo text not null default 'medicamento',
  -- medicamento | alimento | material | ambiental | outro | nenhuma_conhecida
  reacao text,                            -- alergia | intolerancia | efeito_adverso
  manifestacao text,                      -- urticaria, broncoespasmo, anafilaxia...
  gravidade text,                         -- leve | moderada | grave
  criticidade text default 'alta',        -- alta | baixa — risco de vida se reexposto
  situacao text not null default 'ativa', -- ativa | refutada | resolvida | inativa
  fonte text,                             -- paciente | familiar | prontuario | teste | documento
  inicio date,
  observacao text,
  corrige_id bigint references public.pep_alergias(id) on delete set null,
  motivo_correcao text,
  profissional_nome text,
  conselho text,
  registro_conselho text,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_alrg_pront_idx on public.pep_alergias (prontuario, criado_em desc);
create index if not exists pep_alrg_subst_idx on public.pep_alergias (lower(substancia));
create index if not exists pep_alrg_corrige_idx on public.pep_alergias (corrige_id);
alter table public.pep_alergias enable row level security;
drop policy if exists pep_alrg_select on public.pep_alergias;
drop policy if exists pep_alrg_insert on public.pep_alergias;
create policy pep_alrg_select on public.pep_alergias
  for select to authenticated
  using (true);
create policy pep_alrg_insert on public.pep_alergias
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável


-- ═══════════════════════════════════════════════════════════
-- 12) CONDIÇÕES PERSISTENTES — a lista de problemas
--
-- Separada de `pep_alergias` de propósito: alergia é alerta de SEGURANÇA
-- (agente, reação, criticidade, e o motor da farmácia lê); condição é
-- CONTEXTO clínico (CID, início, situação). Numa tabela só, metade das
-- colunas ficaria sempre nula e a consulta do motor de alerta pagaria
-- filtro extra.
--
-- Cobre comorbidade, diagnóstico ativo, precaução (isolamento, risco de
-- queda, restrição de decúbito), dispositivo permanente (marca-passo,
-- traqueostomia) e limitação — tudo que precisa atravessar internações.
-- APPEND-ONLY: resolver um problema = novo registro com `corrige_id` e
-- `situacao` = 'resolvida'.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_condicoes (
  id bigserial primary key,
  prontuario text not null,
  descricao text not null,
  cid text,
  categoria text not null default 'comorbidade',
  -- comorbidade | diagnostico | precaucao | dispositivo | limitacao |
  -- risco | habito | historico_cirurgico
  situacao text not null default 'ativa', -- ativa | resolvida | descartada | inativa
  inicio date,
  fim date,
  gravidade text,                         -- leve | moderada | grave
  observacao text,
  corrige_id bigint references public.pep_condicoes(id) on delete set null,
  motivo_correcao text,
  profissional_nome text,
  conselho text,
  registro_conselho text,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_cond_pront_idx on public.pep_condicoes (prontuario, criado_em desc);
create index if not exists pep_cond_sit_idx on public.pep_condicoes (situacao);
create index if not exists pep_cond_corrige_idx on public.pep_condicoes (corrige_id);
alter table public.pep_condicoes enable row level security;
drop policy if exists pep_cond_select on public.pep_condicoes;
drop policy if exists pep_cond_insert on public.pep_condicoes;
create policy pep_cond_select on public.pep_condicoes
  for select to authenticated
  using (true);
create policy pep_cond_insert on public.pep_condicoes
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável


-- ═══════════════════════════════════════════════════════════
-- VERIFICAÇÃO — deve listar as 11 tabelas novas com RLS ativo e
-- pelo menos 1 política cada. Qualquer linha com "❌" reprova a migração.
-- ═══════════════════════════════════════════════════════════
select
  t.table_name as tabela,
  case when c.relrowsecurity then '✅ RLS ativo' else '❌ RLS DESLIGADO' end as rls,
  case when count(p.polname) = 0 then '❌ SEM POLÍTICA'
       else '✅ ' || count(p.polname) || ' política(s)' end as politicas
from information_schema.tables t
join pg_class c on c.relname = t.table_name
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
left join pg_policy p on p.polrelid = c.oid
where t.table_schema = 'public'
  and t.table_name in (
    'pep_episodios','pep_anamneses','pep_prescricoes','pep_prescricao_itens',
    'pep_prescricao_eventos','pep_aprazamentos','pep_administracoes',
    'pep_anotacoes_enfermagem','pep_sinais_vitais','pep_alergias','pep_condicoes'
  )
group by t.table_name, c.relrowsecurity
order by t.table_name;

-- Conferência das colunas novas de pep_evolucoes (deve retornar 11):
-- select count(*) from information_schema.columns
--  where table_schema = 'public' and table_name = 'pep_evolucoes'
--    and column_name in ('episodio_id','categoria','subjetivo','objetivo',
--      'avaliacao','plano','corrige_id','motivo_correcao','profissional_nome',
--      'conselho','registro_conselho');
