-- ═══════════════════════════════════════════════════════════
-- ATENDIMENTO FASE 2 — A FICHA: quem paga, que tipo, para onde
--
-- A fase 1 resolveu QUEM É o paciente. Esta resolve o resto do que o
-- balcão precisa registrar para o atendimento existir para o hospital:
-- fonte pagadora, tipo, especialidade, destino e procedimento.
--
-- POR QUE ISSO NÃO É "UNS CAMPOS A MAIS"
-- Sem fonte pagadora, as três recepções do hospital (SUS, convênios e
-- ambulatório) são a mesma tela sem distinção — e nada do que é feito no
-- paciente vira conta. É o campo que decide qual tabela de preço vale, se
-- precisa de autorização, e se a produção sai em BPA ou em guia TISS.
--
-- ═══════════════════════════════════════════════════════════
-- A DECISÃO QUE ORGANIZA ESTA MIGRAÇÃO: CATÁLOGO É DADO, NÃO CÓDIGO
--
-- Nenhum convênio, plano, especialidade ou procedimento está escrito aqui
-- dentro. As tabelas nascem VAZIAS (fora os domínios que são padrão
-- nacional, no passo 5).
--
-- Não é preguiça — é o que separa um sistema de um hospital só. Convênio
-- do HNSN não é convênio do hospital vizinho; tabela de preço muda por
-- contrato e por ano. Cravar isso em código transforma cada negociação
-- comercial num deploy. No MV esse cadastro é do analista comercial, pelo
-- menu Tabelas, e é assim que tem que ser aqui.
--
-- CONSEQUÊNCIA IMPORTANTE PARA A TELA: enquanto um catálogo estiver
-- vazio, o campo correspondente **não pode bloquear**. Se a recepção não
-- consegue abrir atendimento porque ninguém cadastrou convênio ainda, o
-- sistema para o hospital. A tela mostra o campo como pendência visível e
-- deixa passar — a mesma regra do cadastro do paciente.
--
-- ⚠️ RODAR NO SQL EDITOR ANTES DO MERGE DO CÓDIGO.
--    Aditiva e idempotente: só `create table if not exists` e
--    `add column if not exists`. Nenhuma constraint que cobre do código
--    que já está no ar — diferente da FK da fase 1, esta pode rodar antes
--    do merge sem risco.
-- ═══════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════
-- 1) CONVÊNIOS — a fonte pagadora
--
-- `tipo` é o campo que mais trabalha nesta tabela. Ele não é rótulo: é o
-- que diz ao sistema QUAIS REGRAS valem.
--   sus        — não tem carteira nem senha; exige CNS e CBO compatível;
--                o paciente NUNCA pode ser cobrado (regra dura)
--   convenio   — exige carteira e validade; procedimento exige autorização;
--                pode ter coparticipação cobrada do paciente
--   particular — o próprio paciente paga; não há guia nem glosa
-- ═══════════════════════════════════════════════════════════
create table if not exists public.at_convenios (
  id bigserial primary key,
  codigo text not null unique,
  nome text not null,
  tipo text not null default 'convenio',   -- sus | convenio | particular
  -- Estas duas existem para a tela saber o que cobrar SEM ter regra de
  -- convênio escrita em JavaScript. Convênio novo com exigência diferente
  -- é cadastro, não release.
  exige_carteira boolean not null default true,
  exige_autorizacao boolean not null default false,
  registro_ans text,                       -- operadora na ANS (padrão TISS)
  observacao text,
  ativo boolean not null default true,
  usuario text,
  criado_em timestamptz not null default now(),
  updated_at timestamptz default now()
);
create index if not exists at_convenios_ativo_idx on public.at_convenios (ativo, nome);

alter table public.at_convenios enable row level security;
drop policy if exists at_conv_select on public.at_convenios;
drop policy if exists at_conv_write on public.at_convenios;
create policy at_conv_select on public.at_convenios for select to authenticated using (true);
create policy at_conv_write on public.at_convenios for all to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));


-- ═══════════════════════════════════════════════════════════
-- 2) PLANOS — o desdobramento do convênio
--
-- Um convênio tem vários planos, e é o PLANO que costuma definir
-- acomodação, coparticipação e tabela de preço. Por isso plano é tabela
-- própria com referência ao convênio, e não um texto solto: escolher o
-- plano errado é a origem clássica da glosa.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.at_planos (
  id bigserial primary key,
  convenio_id bigint not null references public.at_convenios (id) on delete cascade,
  codigo text not null,
  nome text not null,
  acomodacao text,                         -- enfermaria | apartamento | ...
  coparticipacao boolean not null default false,
  ativo boolean not null default true,
  usuario text,
  updated_at timestamptz default now(),
  unique (convenio_id, codigo)
);
create index if not exists at_planos_convenio_idx on public.at_planos (convenio_id, ativo);

alter table public.at_planos enable row level security;
drop policy if exists at_plan_select on public.at_planos;
drop policy if exists at_plan_write on public.at_planos;
create policy at_plan_select on public.at_planos for select to authenticated using (true);
create policy at_plan_write on public.at_planos for all to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));


-- ═══════════════════════════════════════════════════════════
-- 3) DOMÍNIOS — as listas simples, numa tabela só
--
-- Tipo de atendimento, tipo de paciente, especialidade, local de
-- procedência, unidade de origem e destino têm a MESMA forma: código,
-- nome, ordem, ativo. Seis tabelas idênticas dariam seis telas idênticas
-- de cadastro e seis lugares para esquecer de dar manutenção.
--
-- `dominio` diz de qual lista a linha é. É o mesmo desenho do menu
-- "Tabelas" do MV: uma tela, um seletor de qual tabela se está editando.
--
-- `extras` guarda o que é específico de um domínio sem inventar coluna que
-- fica nula nos outros cinco — por exemplo, se um tipo de atendimento
-- conta como primeira consulta ou como retorno.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.at_dominios (
  id bigserial primary key,
  dominio text not null,     -- tipo_atendimento | tipo_paciente | especialidade
                             -- local_procedencia | unidade_origem | destino
                             -- carater | meio_chegada
  codigo text not null,
  nome text not null,
  ordem int not null default 0,
  extras jsonb not null default '{}'::jsonb,
  ativo boolean not null default true,
  -- `sistema` marca a linha que veio do padrão nacional e não deveria ser
  -- apagada por engano — some da tela de exclusão, não da de edição.
  sistema boolean not null default false,
  usuario text,
  updated_at timestamptz default now(),
  unique (dominio, codigo)
);
create index if not exists at_dominios_lista_idx on public.at_dominios (dominio, ativo, ordem);

alter table public.at_dominios enable row level security;
drop policy if exists at_dom_select on public.at_dominios;
drop policy if exists at_dom_write on public.at_dominios;
create policy at_dom_select on public.at_dominios for select to authenticated using (true);
create policy at_dom_write on public.at_dominios for all to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));


-- ═══════════════════════════════════════════════════════════
-- 4) PROCEDIMENTOS — e a compatibilidade com o CBO
--
-- `cbos_compativeis` é o campo que evita o erro mais caro e mais silencioso
-- do faturamento SUS: cada procedimento do SIGTAP só aceita ser executado
-- por determinadas ocupações. CBO fora da lista NÃO gera glosa — gera
-- REJEIÇÃO no processamento, e a produção simplesmente não entra. No fim
-- do mês alguém procura o atendimento que "sumiu".
--
-- Guardado como array de texto porque a lista vem pronta do SIGTAP; a tela
-- só confere se o CBO do profissional está nela. Vazio = ninguém cadastrou
-- ainda, e aí não há o que conferir (não bloqueia).
-- ═══════════════════════════════════════════════════════════
create table if not exists public.at_procedimentos (
  id bigserial primary key,
  codigo text not null unique,             -- SIGTAP (SUS) ou TUSS (convênio)
  tabela text not null default 'sigtap',   -- sigtap | tuss | proprio
  nome text not null,
  cbos_compativeis text[] not null default '{}',
  ativo boolean not null default true,
  usuario text,
  updated_at timestamptz default now()
);
create index if not exists at_proc_ativo_idx on public.at_procedimentos (ativo, nome);

alter table public.at_procedimentos enable row level security;
drop policy if exists at_proc_select on public.at_procedimentos;
drop policy if exists at_proc_write on public.at_procedimentos;
create policy at_proc_select on public.at_procedimentos for select to authenticated using (true);
create policy at_proc_write on public.at_procedimentos for all to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));


-- ═══════════════════════════════════════════════════════════
-- 5) O ÚNICO CONTEÚDO QUE ENTRA AQUI: o que é padrão nacional
--
-- Convênio, plano, especialidade e procedimento do HNSN NÃO estão aqui —
-- são cadastro do hospital. O que entra é só o que não varia de hospital
-- para hospital porque vem de norma: caráter do atendimento (exigido na
-- AIH) e a natureza do tipo de atendimento.
--
-- Marcados `sistema = true`: podem ser editados, não devem ser apagados.
-- ═══════════════════════════════════════════════════════════
insert into public.at_dominios (dominio, codigo, nome, ordem, extras, sistema) values
  ('carater', 'eletivo',   'Eletivo',                 1, '{}'::jsonb, true),
  ('carater', 'urgencia',  'Urgência / Emergência',   2, '{}'::jsonb, true),

  -- `conta_como` é o que o indicador de produção usa para separar primeira
  -- consulta de retorno — e o que sustenta a regra de que retorno dentro do
  -- prazo não fatura nova consulta.
  ('tipo_atendimento', 'primeira_consulta', 'Primeira consulta', 1, '{"conta_como":"primeira"}'::jsonb, true),
  ('tipo_atendimento', 'retorno',           'Retorno',           2, '{"conta_como":"retorno"}'::jsonb,  true),
  ('tipo_atendimento', 'urgencia',          'Urgência',          3, '{"conta_como":"urgencia"}'::jsonb, true),
  ('tipo_atendimento', 'exame',             'Exame',             4, '{"conta_como":"exame"}'::jsonb,    true),

  ('unidade_origem', 'pronto_socorro', 'Pronto-Socorro', 1, '{}'::jsonb, true),
  ('unidade_origem', 'ambulatorio',    'Ambulatório',    2, '{}'::jsonb, true)
on conflict (dominio, codigo) do nothing;


-- ═══════════════════════════════════════════════════════════
-- 6) A FICHA — o que passa a ser registrado na abertura
--
-- Tudo NULO por padrão, e nada obrigatório no banco. A obrigatoriedade,
-- quando existir, é da tela e depende do convênio escolhido — que hoje
-- ainda não está cadastrado. Coluna `not null` aqui travaria a recepção
-- num hospital que ainda não terminou de configurar o sistema.
--
-- Sobre a tabela se chamar `ps_atendimentos`: é herança. Ela nasceu do
-- pronto-socorro e agora guarda o atendimento ambulatorial também
-- (`tipo_atendimento`, criado na fase 1). Renomear alcançaria dezenas de
-- pontos do código; se incomodar, o caminho barato é uma view.
-- ═══════════════════════════════════════════════════════════
alter table public.ps_atendimentos
  -- ── fonte pagadora ──
  add column if not exists convenio_id bigint references public.at_convenios (id),
  add column if not exists plano_id bigint references public.at_planos (id),
  add column if not exists carteira text,
  add column if not exists carteira_validade date,
  add column if not exists guia_numero text,
  add column if not exists autorizacao_senha text,

  -- ── classificação do atendimento ──
  -- Guardado como CÓDIGO (texto), não como id: o código é o que a
  -- recepcionista fala, o que sai no relatório e o que o faturamento
  -- confere. Id de tabela não sobrevive a uma reimportação de catálogo.
  add column if not exists tipo_atendimento_cod text,
  add column if not exists tipo_paciente_cod text,
  add column if not exists especialidade_cod text,
  add column if not exists carater_cod text,

  -- ── de onde vem, para onde vai ──
  -- `unidade_origem_cod` é o SETOR de entrada (PS ou ambulatório) e não se
  -- confunde com a coluna `origem`, que já existe e guarda COMO o paciente
  -- chegou (SAMU, meios próprios). No MV são campos diferentes: Origem e
  -- Meio de transporte.
  add column if not exists unidade_origem_cod text,
  add column if not exists local_procedencia_cod text,
  -- `destino_cod` é para onde o paciente vai NA ABERTURA (qual clínica).
  -- Não confundir com `setor_destino`, que já existe e é o DESFECHO — para
  -- onde ele foi quando o atendimento terminou. Momentos opostos da mesma
  -- jornada.
  add column if not exists destino_cod text,

  -- ── ato e responsável ──
  add column if not exists procedimento_cod text,
  -- CBO congelado no momento do atendimento, copiado do cadastro do
  -- profissional. Congelar é deliberado, pelo mesmo motivo da assinatura no
  -- PEP: o profissional pode mudar de ocupação, e a conta de março tem que
  -- continuar contando a história de março.
  add column if not exists medico_cbo text,
  add column if not exists cid text,

  -- ── consequência jurídica ──
  -- Acidente de trabalho troca o pagador (INSS/empregador) e dispara CAT.
  -- É campo de consequência legal, não estatística.
  add column if not exists acidente_trabalho boolean not null default false;

create index if not exists ps_atend_convenio_idx on public.ps_atendimentos (convenio_id);


-- ═══════════════════════════════════════════════════════════
-- 7) CBO NO CADASTRO DO PROFISSIONAL
--
-- O CBO é da PESSOA, não do ato: "médico clínico", "enfermeiro". Ele não
-- muda a cada atendimento, então não se digita na ficha — a recepção
-- escolhe o profissional e o CBO vai junto.
--
-- Digitar CBO no balcão é a origem prática da rejeição de BPA: a
-- recepcionista não tem como saber qual CBO é compatível com o
-- procedimento, e ninguém descobre até o processamento devolver.
-- ═══════════════════════════════════════════════════════════
alter table public.profiles
  add column if not exists cbo text;


-- ═══════════════════════════════════════════════════════════
-- 8) CONFERÊNCIA
-- ═══════════════════════════════════════════════════════════
select 'convenios cadastrados' as item, count(*)::text as valor from public.at_convenios
union all
select 'planos cadastrados', count(*)::text from public.at_planos
union all
select 'procedimentos cadastrados', count(*)::text from public.at_procedimentos
union all
select 'dominios do padrao nacional', count(*)::text from public.at_dominios where sistema
union all
select 'dominios cadastrados pelo hospital', count(*)::text from public.at_dominios where not sistema;
