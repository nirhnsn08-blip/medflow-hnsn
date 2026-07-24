-- ═══════════════════════════════════════════════════════════
-- PERFIS DE ACESSO — o cargo vira um pacote de permissões
--
-- O QUE RESOLVE
-- Hoje a TI cria um usuário e escolhe entre quatro papéis de sistema
-- (adm_master … visualizador). Isso responde "quanto essa pessoa mexe no
-- sistema", mas não responde "em QUAIS módulos" — e por isso todos os dez
-- módulos assistenciais aparecem para todo mundo. O almoxarifado enxerga o
-- Bloco Cirúrgico e o Pronto-Socorro; a recepção enxerga o prontuário.
--
-- Passa a existir o PERFIL: um pacote nomeado de permissões por módulo
-- ("Enfermeiro", "Almoxarifado"). O gestor pede, a TI escolhe o perfil, e a
-- pessoa entra configurada. É como MV e Tasy organizam.
--
-- POR REFERÊNCIA, NÃO POR CÓPIA
-- O usuário aponta para o perfil. Corrigir o perfil corrige todo mundo que
-- o usa — cópia envelhece e em seis meses ninguém sabe mais quem tem o quê.
-- O custo é real: mexer no perfil mexe em todos de uma vez. Por isso a tela
-- avisa quantas pessoas serão afetadas ANTES de salvar.
--
-- ⚠️ O QUE ESTA MIGRAÇÃO **NÃO** FAZ — E É IMPORTANTE NÃO SE ENGANAR
-- Ela NÃO restringe o acesso ao DADO. As políticas de SELECT das tabelas
-- clínicas continuam `using (true)`: qualquer usuário autenticado ainda
-- alcança qualquer tabela pela API REST, por fora da tela. Esconder o menu
-- organiza o trabalho e reduz exposição acidental — não é barreira.
--
-- A barreira é a fase 3 (apertar o RLS por tabela), e ela exige medir antes
-- quem realmente acessa o quê. Apertar SELECT no escuro tira acesso de quem
-- tem direito no meio do plantão. Até lá, NÃO apresentar isto ao hospital
-- como "os dados estão segregados".
--
-- Aditiva e idempotente: só `create table if not exists` / `add column if
-- not exists` / `on conflict do nothing`. Pode rodar duas vezes.
-- ═══════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════
-- 1) OS PERFIS
-- ═══════════════════════════════════════════════════════════
create table if not exists public.perfis_acesso (
  chave text primary key,                 -- 'enfermeiro', 'almoxarifado'
  nome text not null,                     -- como o gestor chama o cargo
  descricao text,

  -- SUGESTÕES que a tela de criação pré-preenche. Não são a regra:
  --   `categoria` quem manda é `profiles.categoria` + src/clinico/papeis.js
  --      (COFEN 736/2024) — perfil de acesso não concede competência clínica;
  --   `role` a TI confirma na criação.
  categoria_sugerida text,
  role_sugerido text,

  -- Perfil de sistema não pode ser apagado: é a porta de volta se alguém
  -- configurar tudo errado.
  sistema boolean not null default false,
  ativo boolean not null default true,

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  usuario text
);
alter table public.perfis_acesso enable row level security;
drop policy if exists perfis_select on public.perfis_acesso;
drop policy if exists perfis_write on public.perfis_acesso;
-- Todo mundo LÊ os perfis: a própria tela precisa saber o que o usuário
-- logado alcança para montar o menu dele.
create policy perfis_select on public.perfis_acesso
  for select to authenticated using (true);
create policy perfis_write on public.perfis_acesso
  for all to authenticated
  using (public.my_role() = 'adm_master')
  with check (public.my_role() = 'adm_master');


-- ═══════════════════════════════════════════════════════════
-- 2) AS PERMISSÕES DE CADA PERFIL
--
-- Uma linha por módulo concedido. O que não está aqui é "sem acesso" —
-- gravar quinze `nenhum` por perfil encheria a tabela de nada e esconderia
-- o que importa.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.perfis_permissoes (
  perfil_chave text not null references public.perfis_acesso(chave) on delete cascade,
  modulo text not null,                   -- 'ps', 'paciente', 'suprimentos' …
  nivel text not null default 'leitura',  -- leitura | escrita
  primary key (perfil_chave, modulo)
);
create index if not exists perfis_perm_perfil_idx on public.perfis_permissoes (perfil_chave);
alter table public.perfis_permissoes enable row level security;
drop policy if exists perfis_perm_select on public.perfis_permissoes;
drop policy if exists perfis_perm_write on public.perfis_permissoes;
create policy perfis_perm_select on public.perfis_permissoes
  for select to authenticated using (true);
create policy perfis_perm_write on public.perfis_permissoes
  for all to authenticated
  using (public.my_role() = 'adm_master')
  with check (public.my_role() = 'adm_master');


-- ═══════════════════════════════════════════════════════════
-- 3) EXCEÇÕES POR USUÁRIO
--
-- "Esta técnica também cobre o PS." Sem isto, cada desvio individual vira
-- um perfil novo, e em dois anos são quarenta perfis que ninguém entende.
--
-- Guarda MOTIVO e QUEM CONCEDEU porque exceção sem justificativa é como o
-- controle de acesso vira colcha de retalhos — e porque a trilha do NGS1
-- pede autoria em mudança de permissão.
--
-- Serve para reduzir também: `nivel = 'nenhum'` suspende o acesso de alguém
-- afastado sem precisar mexer no perfil do cargo inteiro.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.usuarios_permissoes (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  modulo text not null,
  nivel text not null,                    -- nenhum | leitura | escrita
  motivo text,
  concedido_por text,
  criado_em timestamptz not null default now(),
  unique (user_id, modulo)
);
create index if not exists usuarios_perm_user_idx on public.usuarios_permissoes (user_id);
alter table public.usuarios_permissoes enable row level security;
drop policy if exists usuarios_perm_select on public.usuarios_permissoes;
drop policy if exists usuarios_perm_write on public.usuarios_permissoes;
create policy usuarios_perm_select on public.usuarios_permissoes
  for select to authenticated using (true);
create policy usuarios_perm_write on public.usuarios_permissoes
  for all to authenticated
  using (public.my_role() = 'adm_master')
  with check (public.my_role() = 'adm_master');


-- ═══════════════════════════════════════════════════════════
-- 4) O USUÁRIO APONTA PARA O PERFIL
--
-- `on delete set null`: apagar um perfil não pode apagar gente. Quem ficar
-- sem perfil aparece na tela como "sem perfil" e não alcança nada — falha
-- fechada, que é o comportamento certo para permissão.
-- ═══════════════════════════════════════════════════════════
alter table public.profiles
  add column if not exists perfil text references public.perfis_acesso(chave) on delete set null,
  -- Lotação: hoje é informativa (aparece na tela, ajuda a TI a saber quem é
  -- quem). NÃO restringe — enfermeiro que cobre outra ala não pode ficar
  -- travado no meio do plantão. Vira filtro padrão de tela, não barreira.
  add column if not exists setor text,
  add column if not exists matricula text,
  -- Registro de conselho vence e pode ser suspenso. Guardar a validade
  -- permite avisar antes; sem a data, ninguém percebe que venceu.
  add column if not exists conselho_validade date,
  add column if not exists admitido_em date,
  add column if not exists desligado_em date;

create index if not exists profiles_perfil_idx on public.profiles (perfil);


-- ═══════════════════════════════════════════════════════════
-- 5) SEED DOS PERFIS INICIAIS
--
-- Espelha `src/acesso/modulos.js`. Os dois precisam continuar batendo:
-- `permissoes.test.js` confere o lado do código, e a tela lê daqui.
--
-- `on conflict do nothing` de propósito: se o hospital já ajustou um perfil,
-- rodar de novo NÃO desfaz o ajuste dele.
-- ═══════════════════════════════════════════════════════════
insert into public.perfis_acesso (chave, nome, descricao, categoria_sugerida, role_sugerido, sistema) values
  ('medico',             'Médico(a)',                  'Assistência médica: prescreve, evolui, dá alta.', 'medico', 'adm_silver', false),
  ('enfermeiro',         'Enfermeiro(a)',              'Processo de Enfermagem completo, gestão de leitos e do cuidado.', 'enfermeiro', 'adm_silver', false),
  ('enfermeiro_scih',    'Enfermeiro(a) — SCIH',       'Controle de infecção: vigilância, culturas, indicadores.', 'enfermeiro', 'adm_silver', false),
  ('tecnico_enfermagem', 'Técnico(a) de Enfermagem',   'Anotação de enfermagem, checagem de medicação e sinais vitais.', 'tecnico_enfermagem', 'adm_silver', false),
  ('fisioterapeuta',     'Fisioterapeuta',             'Evolução de fisioterapia no prontuário.', 'fisioterapeuta', 'adm_silver', false),
  ('nutricionista',      'Nutricionista',              'Avaliação e evolução nutricional.', 'nutricionista', 'adm_silver', false),
  ('assistente_social',  'Assistente Social',          'Avaliação social, apoio à alta.', 'assistente_social', 'adm_silver', false),
  ('farmaceutico',       'Farmacêutico(a)',            'Farmácia clínica, dispensação, controlados e intervenção farmacêutica.', 'farmaceutico', 'adm_silver', false),
  ('aux_farmacia',       'Auxiliar de Farmácia',       'Dispensação e estoque da farmácia. Não acessa prontuário.', 'administrativo', 'adm_silver', false),
  ('recepcao',           'Recepção / Admissão',        'Cadastro, chegada e agendamento. Não acessa prontuário (COFEN 754/2024, art. 6º).', 'administrativo', 'adm_silver', false),
  ('faturamento',        'Faturamento',                'Produção e movimento para faturamento. Não acessa prontuário.', 'administrativo', 'analista', false),
  ('almoxarifado',       'Almoxarifado / Suprimentos', 'Materiais, estoque, compras e inventário. Sem acesso assistencial.', 'administrativo', 'adm_silver', false),
  ('gestao',             'Gestão / Diretoria',         'Indicadores e BI de todos os módulos. Sem prontuário individual.', 'administrativo', 'analista', false),
  ('diretor_tecnico',    'Diretor(a) Técnico(a)',      'Responsável pelo prontuário da instituição (CFM 1.638/2002, art. 2º).', 'medico', 'adm_silver', false),
  ('ti',                 'TI / Analista de Sistemas',  'Administra o sistema: usuários, perfis, importação e banco. Sem competência clínica.', 'administrativo', 'adm_master', true)
on conflict (chave) do nothing;

insert into public.perfis_permissoes (perfil_chave, modulo, nivel) values
  -- Médico
  ('medico','overview','leitura'),('medico','ambulatorio','escrita'),('medico','ps','escrita'),
  ('medico','bloco','escrita'),('medico','leitos','escrita'),('medico','scih','leitura'),
  ('medico','paciente','escrita'),('medico','farmacia','leitura'),('medico','print','leitura'),
  -- Enfermeiro
  ('enfermeiro','overview','leitura'),('enfermeiro','ambulatorio','escrita'),('enfermeiro','ps','escrita'),
  ('enfermeiro','bloco','leitura'),('enfermeiro','leitos','escrita'),('enfermeiro','scih','escrita'),
  ('enfermeiro','paciente','escrita'),('enfermeiro','farmacia','leitura'),('enfermeiro','suprimentos','leitura'),
  ('enfermeiro','print','leitura'),
  -- Enfermeiro SCIH
  ('enfermeiro_scih','overview','leitura'),('enfermeiro_scih','ps','leitura'),('enfermeiro_scih','bloco','leitura'),
  ('enfermeiro_scih','leitos','leitura'),('enfermeiro_scih','scih','escrita'),('enfermeiro_scih','paciente','escrita'),
  ('enfermeiro_scih','farmacia','leitura'),('enfermeiro_scih','print','leitura'),
  -- Técnico de enfermagem
  ('tecnico_enfermagem','overview','leitura'),('tecnico_enfermagem','ambulatorio','leitura'),
  ('tecnico_enfermagem','ps','escrita'),('tecnico_enfermagem','leitos','escrita'),
  ('tecnico_enfermagem','scih','leitura'),('tecnico_enfermagem','paciente','escrita'),
  -- Fisioterapeuta
  ('fisioterapeuta','overview','leitura'),('fisioterapeuta','ps','leitura'),
  ('fisioterapeuta','leitos','leitura'),('fisioterapeuta','paciente','escrita'),
  -- Nutricionista
  ('nutricionista','overview','leitura'),('nutricionista','leitos','leitura'),('nutricionista','paciente','escrita'),
  -- Assistente social
  ('assistente_social','overview','leitura'),('assistente_social','ambulatorio','leitura'),
  ('assistente_social','leitos','leitura'),('assistente_social','paciente','escrita'),
  -- Farmacêutico
  ('farmaceutico','overview','leitura'),('farmaceutico','ps','leitura'),('farmaceutico','leitos','leitura'),
  ('farmaceutico','scih','leitura'),('farmaceutico','farmacia','escrita'),('farmaceutico','controlados','escrita'),
  ('farmaceutico','suprimentos','leitura'),('farmaceutico','paciente','leitura'),('farmaceutico','print','leitura'),
  -- Auxiliar de farmácia
  ('aux_farmacia','farmacia','escrita'),('aux_farmacia','controlados','leitura'),('aux_farmacia','suprimentos','leitura'),
  -- Recepção
  ('recepcao','overview','leitura'),('recepcao','ambulatorio','escrita'),('recepcao','ps','escrita'),
  ('recepcao','leitos','leitura'),
  -- Faturamento
  ('faturamento','overview','leitura'),('faturamento','ambulatorio','leitura'),
  ('faturamento','leitos','leitura'),('faturamento','print','leitura'),
  -- Almoxarifado
  ('almoxarifado','suprimentos','escrita'),
  -- Gestão
  ('gestao','overview','leitura'),('gestao','ambulatorio','leitura'),('gestao','ps','leitura'),
  ('gestao','bloco','leitura'),('gestao','leitos','leitura'),('gestao','scih','leitura'),
  ('gestao','farmacia','leitura'),('gestao','suprimentos','leitura'),('gestao','print','leitura'),
  ('gestao','auditoria','leitura'),
  -- Diretor técnico
  ('diretor_tecnico','overview','leitura'),('diretor_tecnico','ambulatorio','leitura'),
  ('diretor_tecnico','ps','escrita'),('diretor_tecnico','bloco','leitura'),('diretor_tecnico','leitos','leitura'),
  ('diretor_tecnico','scih','leitura'),('diretor_tecnico','paciente','escrita'),('diretor_tecnico','farmacia','leitura'),
  ('diretor_tecnico','controlados','leitura'),('diretor_tecnico','suprimentos','leitura'),
  ('diretor_tecnico','print','leitura'),('diretor_tecnico','auditoria','escrita'),
  -- TI
  ('ti','overview','escrita'),('ti','ambulatorio','escrita'),('ti','ps','escrita'),('ti','bloco','escrita'),
  ('ti','leitos','escrita'),('ti','scih','escrita'),('ti','paciente','escrita'),('ti','farmacia','escrita'),
  ('ti','controlados','escrita'),('ti','suprimentos','escrita'),('ti','print','escrita'),
  ('ti','auditoria','escrita'),('ti','import','escrita'),('ti','supabase','escrita'),('ti','users','escrita')
on conflict (perfil_chave, modulo) do nothing;


-- ═══════════════════════════════════════════════════════════
-- 6) QUEM JÁ EXISTE NÃO PODE FICAR SEM ACESSO
--
-- Ninguém tem perfil ainda. Se a tela passasse a exigir perfil sem isto, a
-- equipe inteira abriria o sistema vazio no dia seguinte — o tipo de coisa
-- que se descobre em pleno plantão.
--
-- Então: quem é adm_master herda o perfil de TI; o resto entra num perfil
-- provisório com o alcance de hoje (tudo), para que a migração seja
-- invisível. A TI então reclassifica pessoa por pessoa, sem pressa, e
-- **depois** desativa o provisório.
-- ═══════════════════════════════════════════════════════════
insert into public.perfis_acesso (chave, nome, descricao, categoria_sugerida, role_sugerido, sistema) values
  ('provisorio', 'Provisório — a classificar',
   'Mantém o acesso que a equipe já tinha antes dos perfis. Reclassifique cada pessoa e depois desative este perfil.',
   'administrativo', 'adm_silver', true)
on conflict (chave) do nothing;

insert into public.perfis_permissoes (perfil_chave, modulo, nivel) values
  ('provisorio','overview','escrita'),('provisorio','ambulatorio','escrita'),('provisorio','ps','escrita'),
  ('provisorio','bloco','escrita'),('provisorio','leitos','escrita'),('provisorio','scih','escrita'),
  ('provisorio','paciente','escrita'),('provisorio','farmacia','escrita'),('provisorio','controlados','escrita'),
  ('provisorio','suprimentos','escrita'),('provisorio','print','escrita'),('provisorio','auditoria','escrita'),
  ('provisorio','import','escrita'),('provisorio','supabase','escrita')
on conflict (perfil_chave, modulo) do nothing;

update public.profiles set perfil = 'ti'         where perfil is null and role = 'adm_master';
update public.profiles set perfil = 'provisorio' where perfil is null;


-- ═══════════════════════════════════════════════════════════
-- 7) CONFERÊNCIA
-- Rode depois de aplicar.
-- ═══════════════════════════════════════════════════════════
select p.chave, p.nome, count(pp.modulo) as modulos,
       (select count(*) from public.profiles pr where pr.perfil = p.chave) as usuarios
  from public.perfis_acesso p
  left join public.perfis_permissoes pp on pp.perfil_chave = p.chave
 group by p.chave, p.nome
 order by p.chave;
