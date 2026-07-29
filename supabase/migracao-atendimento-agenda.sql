-- ═══════════════════════════════════════════════════════════
-- AGENDA DO AMBULATÓRIO — grade, marcação e o painel do dia
--
-- O MODELO É O QUE HOSPITAL BRASILEIRO USA, e ele tem uma
-- particularidade que precisa estar no banco, não só na tela:
-- **a vaga tem dono**.
--
--   • REGULAÇÃO — a vaga foi publicada para a central (GERCON aqui no RS).
--     Quem decide quem a ocupa é a regulação, a partir do pedido da UBS.
--     O hospital reserva e recebe; não marca.
--   • INTERNA — retorno pedido pelo próprio especialista, convênio e
--     particular. Isso NÃO passa por regulação: quem marca é o hospital.
--     É a fatia que hoje vive em caderno.
--   • CHEGADA — vaga deixada aberta para quem aparece sem marcação.
--
-- POR QUE ISSO É ESTRUTURA E NÃO CONFIGURAÇÃO
-- Sem o dono da vaga registrado, alguém marca um retorno num horário que a
-- regulação já preencheu. Dois pacientes aparecem para a mesma vaga, e o
-- hospital está errado nos dois casos — um deles foi marcado por uma
-- central que não tinha como saber. O banco precisa recusar isso, não
-- avisar depois.
--
-- O QUE ESTA MIGRAÇÃO **NÃO** FAZ
-- Não tenta ser o GERCON. Não guarda o pedido da UBS, não classifica risco,
-- não decide fila de regulação. Guarda a vaga reservada e, quando o
-- paciente chega com o papel, o protocolo dele. Duplicar a regulação
-- criaria duas verdades para a mesma consulta — e a UBS continuaria usando
-- a dela.
--
-- ⚠️ RODAR NO SQL EDITOR ANTES DO MERGE DO CÓDIGO.
--    Aditiva e idempotente. Nenhuma constraint que cobre do código que já
--    está no ar.
-- ═══════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════
-- 1) GRADE — a capacidade que o hospital oferece
--
-- Recorrente por dia da semana, e não uma linha por data: a grade de um
-- ambulatório muda algumas vezes por ano, não todo dia. Gerar linha por
-- data encheria a tabela de milhares de registros idênticos e faria
-- "mudar a grade da ortopedia" virar uma operação de massa.
--
-- A GRADE DEFINE O RELÓGIO, AS COTAS DIVIDEM O DONO.
-- `hora_inicio`, `hora_fim` e `duracao_min` produzem N horários. As três
-- cotas dizem quantos desses N horários pertencem a cada dono. A soma não
-- pode passar de N — a tela confere, porque um `check` aqui exigiria
-- recalcular N em SQL e travaria a edição da grade por um detalhe.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.ag_grades (
  id bigserial primary key,
  especialidade_cod text not null,
  -- Profissional é opcional: muitos ambulatórios publicam a vaga da
  -- especialidade e só definem quem atende na escala da semana.
  profissional_username text,
  dia_semana int not null,              -- 0 = domingo … 6 = sábado
  hora_inicio time not null,
  hora_fim time not null,
  duracao_min int not null default 20,
  vagas_regulacao int not null default 0,
  vagas_internas int not null default 0,
  vagas_chegada int not null default 0,
  -- Vigência: a grade de 2026 não deve gerar vaga em 2025 nem continuar
  -- valendo depois que o contrato do profissional acabou.
  vigencia_inicio date not null default current_date,
  vigencia_fim date,
  ativo boolean not null default true,
  observacao text,
  usuario text,
  criado_em timestamptz not null default now(),
  updated_at timestamptz default now(),
  constraint ag_grades_dia_valido check (dia_semana between 0 and 6),
  constraint ag_grades_horario_valido check (hora_fim > hora_inicio),
  constraint ag_grades_duracao_valida check (duracao_min between 5 and 240)
);
create index if not exists ag_grades_busca_idx
  on public.ag_grades (ativo, especialidade_cod, dia_semana);

alter table public.ag_grades enable row level security;
drop policy if exists ag_grades_select on public.ag_grades;
drop policy if exists ag_grades_write on public.ag_grades;
create policy ag_grades_select on public.ag_grades for select to authenticated using (true);
create policy ag_grades_write on public.ag_grades for all to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));


-- ═══════════════════════════════════════════════════════════
-- 2) BLOQUEIOS — quando a grade não vale
--
-- Feriado, férias, congresso, sala em reforma. Sem isto a agenda oferece
-- vaga em dia que o hospital não atende, e alguém marca — o paciente vem
-- de ônibus de outra cidade e encontra a porta fechada.
--
-- `especialidade_cod` e `profissional_username` nulos significam "o dia
-- inteiro do ambulatório", que é o caso do feriado.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.ag_bloqueios (
  id bigserial primary key,
  data_inicio date not null,
  data_fim date not null,
  especialidade_cod text,
  profissional_username text,
  motivo text not null,
  usuario text,
  criado_em timestamptz not null default now(),
  constraint ag_bloqueios_periodo_valido check (data_fim >= data_inicio)
);
create index if not exists ag_bloqueios_periodo_idx on public.ag_bloqueios (data_inicio, data_fim);

alter table public.ag_bloqueios enable row level security;
drop policy if exists ag_bloq_select on public.ag_bloqueios;
drop policy if exists ag_bloq_write on public.ag_bloqueios;
create policy ag_bloq_select on public.ag_bloqueios for select to authenticated using (true);
create policy ag_bloq_write on public.ag_bloqueios for all to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));


-- ═══════════════════════════════════════════════════════════
-- 3) AGENDAMENTO — a vaga ocupada
--
-- `origem_marcacao` é a coluna que sustenta a regra inteira:
--   regulacao — veio do GERCON. `protocolo_regulacao` guarda o número do
--               papel que o paciente traz.
--   interna   — o hospital marcou (retorno, convênio, particular).
--   chegada   — não foi marcado; entrou na fila do dia.
--
-- `prontuario` é NULO de propósito quando a vaga é da regulação e ainda não
-- se sabe quem vem: a vaga está reservada, a pessoa não. Quem preenche é a
-- recepção, quando o paciente chega — ou antes, se alguém digitar a lista
-- do GERCON.
--
-- `atendimento_id` liga ao atendimento que a confirmação de presença abriu.
-- É o que faz "realizadas" deixar de ser digitado à mão: consulta realizada
-- é agendamento com atendimento aberto.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.ag_agendamentos (
  id bigserial primary key,
  data date not null,
  hora time,
  especialidade_cod text not null,
  profissional_username text,
  grade_id bigint references public.ag_grades (id) on delete set null,

  prontuario text references public.pacientes (prontuario),
  origem_marcacao text not null,        -- regulacao | interna | chegada
  tipo_atendimento_cod text,            -- primeira_consulta | retorno | ...
  protocolo_regulacao text,

  -- agendado | presente | falta | cancelado
  status text not null default 'agendado',
  presente_em timestamptz,
  atendimento_id bigint references public.ps_atendimentos (id) on delete set null,
  cancelado_motivo text,

  observacao text,
  usuario text,
  criado_em timestamptz not null default now(),
  updated_at timestamptz default now(),
  constraint ag_agend_origem_valida check (origem_marcacao in ('regulacao','interna','chegada')),
  constraint ag_agend_status_valido check (status in ('agendado','presente','falta','cancelado'))
);
create index if not exists ag_agend_dia_idx on public.ag_agendamentos (data, especialidade_cod, hora);
create index if not exists ag_agend_paciente_idx on public.ag_agendamentos (prontuario, data desc);
create index if not exists ag_agend_grade_idx on public.ag_agendamentos (grade_id, data);

alter table public.ag_agendamentos enable row level security;
drop policy if exists ag_agend_select on public.ag_agendamentos;
drop policy if exists ag_agend_write on public.ag_agendamentos;
create policy ag_agend_select on public.ag_agendamentos for select to authenticated using (true);
create policy ag_agend_write on public.ag_agendamentos for all to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));


-- ═══════════════════════════════════════════════════════════
-- 4) A TRAVA QUE IMPORTA — dois pacientes na mesma vaga
--
-- Índice único parcial: para uma mesma data, especialidade e hora, só pode
-- existir UM agendamento vivo. Cancelado e falta ficam de fora do índice
-- de propósito — o horário volta a ficar livre para quem remarca, e o
-- histórico do que foi desmarcado continua gravado.
--
-- `hora is not null` porque a fila por ordem de chegada não tem horário:
-- ali a vaga não é um relógio, é uma posição.
-- ═══════════════════════════════════════════════════════════
create unique index if not exists ag_agend_vaga_unica
  on public.ag_agendamentos (data, especialidade_cod, hora)
  where hora is not null and status in ('agendado','presente');


-- ═══════════════════════════════════════════════════════════
-- 5) LIGAÇÃO COM O ATENDIMENTO
--
-- O caminho contrário do `atendimento_id`: dado um atendimento, de qual
-- agendamento ele nasceu. Serve ao faturamento (retorno dentro do prazo
-- não gera nova consulta) e ao indicador de absenteísmo.
-- ═══════════════════════════════════════════════════════════
alter table public.ps_atendimentos
  add column if not exists agendamento_id bigint references public.ag_agendamentos (id) on delete set null;

create index if not exists ps_atend_agendamento_idx on public.ps_atendimentos (agendamento_id);


-- ═══════════════════════════════════════════════════════════
-- 6) CONFERÊNCIA
-- ═══════════════════════════════════════════════════════════
select 'grades cadastradas' as item, count(*)::text as valor from public.ag_grades
union all
select 'bloqueios cadastrados', count(*)::text from public.ag_bloqueios
union all
select 'agendamentos', count(*)::text from public.ag_agendamentos
union all
select 'trava de vaga unica instalada', (exists (
  select 1 from pg_indexes where schemaname = 'public' and indexname = 'ag_agend_vaga_unica'
))::text;
