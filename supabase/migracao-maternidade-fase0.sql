-- ═══════════════════════════════════════════════════════════
-- MATERNIDADE — FASE 0: a fundação de dados
--
-- Primeira pedra do Valentrax Maternity Center. Cria as duas tabelas-espinha
-- que todo o resto do módulo vai usar. NÃO tem tela ainda — é o alicerce.
--
--   mat_episodios   → 1 por gestante internada. O "dossiê" que amarra
--                     admissão, trabalho de parto, parto, RN e puerpério.
--   mat_admissoes   → a avaliação de admissão obstétrica (padrão FEBRASGO/MS).
--
-- ── POR QUE CHAVEAR POR `prontuario`, E NÃO POR UM id ───────
-- A tabela `pacientes` deste sistema tem `prontuario text` como chave
-- primária — não existe `paciente_id` numérico. Toda a casa (leitos, PS,
-- PEP) referencia o paciente por `prontuario`. A maternidade faz igual, pra
-- não inventar uma segunda forma de apontar para a mesma pessoa.
--
-- ── APPEND-ONLY (registro clínico) ──────────────────────────
-- A admissão é registro clínico: correção entra como NOVA linha, não como
-- edição da anterior. Como no resto do PEP, isso é garantido pela TELA (que
-- nunca emite UPDATE/DELETE numa admissão); as políticas de escrita seguem o
-- mesmo desenho das demais tabelas para não divergir do gerador de RLS.
--
-- ── SEM mat_criterios_risco NESTA FASE ──────────────────────
-- A tabela de critérios de risco e limiares de MEOWS entra na FASE 1, junto
-- do motor que os consome — assim o responsável técnico valida os limiares na
-- tela, em vez de nascerem de um seed adivinhado aqui.
--
-- ⚠️ RODAR NO SQL EDITOR ANTES DO MERGE DO CÓDIGO.
--    Aditiva e idempotente: cria DUAS tabelas e não toca em nada existente.
--    DEMO primeiro (ufxqdvxhruaswuzhmxyf), depois o principal (HNSN).
--    As políticas de RLS estão no fim DESTE arquivo — tabela nova sem
--    política nasce com RLS ligada e sem regra, e o sintoma não é erro: é
--    TELA VAZIA. Depois rode também a `migracao-rls-leitura.sql` regenerada
--    (idempotente; ela derruba e recria pelos mesmos nomes).
-- ═══════════════════════════════════════════════════════════

set valentrax.quem = 'laura';


-- ═══════════════════════════════════════════════════════════
-- O EPISÓDIO OBSTÉTRICO — o dossiê da gestante internada
--
-- A fórmula é GTPAL (Gestações · Termo · Prematuros · Abortos · Vivos), a
-- pedido da enfermeira obstétrica — mais completa que G-P-A. A idade
-- gestacional guarda semanas E dias, das duas fontes (DUM e USG), porque a
-- USG do 1º trimestre prevalece e a divergência entre as duas é informação.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.mat_episodios (
  id                bigserial primary key,
  -- a gestante, pela chave real do sistema
  prontuario        text not null references public.pacientes (prontuario),
  -- vínculo opcional com o episódio de PS (quando entra pela porta do PS)
  ps_atendimento_id bigint references public.ps_atendimentos (id),

  -- fórmula obstétrica GTPAL
  gesta             int,
  para_termo        int,
  para_prematuro    int,
  abortos           int,
  filhos_vivos      int,
  -- detalhamento dos partos anteriores
  partos_vaginais   int,
  cesareas          int,

  -- datas e idade gestacional
  dum               date,
  dpp               date,
  ig_dum_semanas    int,
  ig_dum_dias       int,
  ig_usg_semanas    int,
  ig_usg_dias       int,

  tipo_sanguineo    text,   -- A | B | AB | O
  rh                text,   -- + | -
  gestacao_multipla boolean not null default false,
  n_fetos           int not null default 1,

  -- pré-natal: { fez, local, consultas, sorologias:{}, gbs, vacinas:{} }
  pre_natal         jsonb,
  -- habitual | intermediario | alto — critérios ficam configuráveis na Fase 1
  risco             text,
  -- em_andamento até a alta do binômio; depois encerrado
  status            text not null default 'em_andamento',

  observacao        text,
  usuario           text,
  criado_em         timestamptz not null default now(),
  updated_at        timestamptz default now()
);


-- ═══════════════════════════════════════════════════════════
-- A ADMISSÃO OBSTÉTRICA — a avaliação da chegada
--
-- Os blocos clínicos que variam muito (exame, toque, vitais, antecedentes)
-- entram como `jsonb`: são conjuntos de campos que a tela desenha e que vão
-- ganhar campo novo com o tempo. O que é chave de busca ou de regra
-- (episódio, data, risco, plano) fica em coluna.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.mat_admissoes (
  id                   bigserial primary key,
  episodio_id          bigint not null references public.mat_episodios (id),
  data_hora            timestamptz not null default now(),
  profissional         text,

  origem               text,   -- espontanea | pre_natal | transferencia
  motivo               text,   -- trabalho_de_parto | cesarea_eletiva | inducao | intercorrencia | avaliacao
  queixa               text,
  inicio_sintomas      timestamptz,

  acompanhante         text,
  acompanhante_vinculo text,

  -- { doencas, cirurgias, alergias, medicacoes, obstetricos, habitos, familiares }
  antecedentes         jsonb,
  -- { pa_sis, pa_dia, fc, fr, temp, sato2, dor, peso, altura, imc }
  vitais               jsonb,
  meows                int,    -- escore de alerta precoce materno (calculado)
  -- { altura_uterina, dinamica, bcf, situacao, apresentacao, dorso, mov_fetais }
  exame_obstetrico     jsonb,
  -- { dilatacao, apagamento, delee, bishop, colo, bolsa, liquido, sangramento }
  toque                jsonb,

  classificacao_risco  text,   -- habitual | intermediario | alto
  sinais_alerta        text,
  plano                text,   -- internar_tp | induzir | cesarea | observacao | alta
  via_prevista         text,   -- vaginal | cesarea
  consentimentos       jsonb,

  usuario              text,
  criado_em            timestamptz not null default now()
);


-- ═══════════════════════════════════════════════════════════
-- AS REGRAS QUE VIRAM CONSTRAINT
-- Poucas e frouxas de propósito (geral por padrão): travam o disparate, não
-- a variação clínica legítima.
-- ═══════════════════════════════════════════════════════════
alter table public.mat_episodios drop constraint if exists mat_epi_n_fetos_valido;
alter table public.mat_episodios add constraint mat_epi_n_fetos_valido
  check (n_fetos >= 1);

alter table public.mat_episodios drop constraint if exists mat_epi_rh_valido;
alter table public.mat_episodios add constraint mat_epi_rh_valido
  check (rh is null or rh in ('+', '-'));

alter table public.mat_episodios drop constraint if exists mat_epi_abo_valido;
alter table public.mat_episodios add constraint mat_epi_abo_valido
  check (tipo_sanguineo is null or tipo_sanguineo in ('A', 'B', 'AB', 'O'));

alter table public.mat_episodios drop constraint if exists mat_epi_status_valido;
alter table public.mat_episodios add constraint mat_epi_status_valido
  check (status in ('em_andamento', 'encerrado'));

alter table public.mat_admissoes drop constraint if exists mat_adm_meows_nao_negativo;
alter table public.mat_admissoes add constraint mat_adm_meows_nao_negativo
  check (meows is null or meows >= 0);


-- ═══════════════════════════════════════════════════════════
-- OS ÍNDICES
-- A pergunta do dia: "quais gestantes estão internadas agora?" e "a admissão
-- deste episódio".
-- ═══════════════════════════════════════════════════════════
create index if not exists mat_episodios_prontuario_idx
  on public.mat_episodios (prontuario);
-- as gestantes em curso — a futura worklist da maternidade
create index if not exists mat_episodios_ativos_idx
  on public.mat_episodios (criado_em desc) where status = 'em_andamento';
create index if not exists mat_admissoes_episodio_idx
  on public.mat_admissoes (episodio_id, data_hora desc);


-- ═══════════════════════════════════════════════════════════
-- RLS — as 7 políticas por tabela, no desenho da casa (ver at_repasses)
--
-- Leitura amarrada ao módulo `paciente` (Paciente 360 / PEP): a admissão
-- obstétrica é parte do prontuário da gestante, e quem cuida dela já tem esse
-- acesso. Quando a Fase 1 criar o módulo `maternidade` próprio, ele entra
-- nesta lista (em src/acesso/mapa-tabelas.js) sem tirar o `paciente`.
--
-- Vêm inline AQUI, e não só no `migracao-rls-leitura.sql`, porque aquele
-- arquivo passa de 26 KB e o editor do Supabase TRUNCA CALADO. Rodar o
-- arquivo grande depois é idempotente: derruba e recria pelos mesmos nomes.
-- ═══════════════════════════════════════════════════════════

-- ── mat_episodios ──────────────────────────────────────────
alter table public.mat_episodios enable row level security;

drop policy if exists mat_episodios_leitura on public.mat_episodios;
create policy mat_episodios_leitura on public.mat_episodios
  for select to authenticated
  using (public.pode_ver_algum('paciente'));

drop policy if exists mat_episodios_escrita_ins on public.mat_episodios;
drop policy if exists mat_episodios_escrita_upd on public.mat_episodios;
drop policy if exists mat_episodios_escrita_del on public.mat_episodios;
create policy mat_episodios_escrita_ins on public.mat_episodios
  for insert to authenticated with check (true);
create policy mat_episodios_escrita_upd on public.mat_episodios
  for update to authenticated using (true) with check (true);
create policy mat_episodios_escrita_del on public.mat_episodios
  for delete to authenticated using (true);

drop policy if exists mat_episodios_mod_ins on public.mat_episodios;
drop policy if exists mat_episodios_mod_upd on public.mat_episodios;
drop policy if exists mat_episodios_mod_del on public.mat_episodios;
create policy mat_episodios_mod_ins on public.mat_episodios
  as restrictive for insert to authenticated
  with check (public.pode_editar_algum('paciente'));
create policy mat_episodios_mod_upd on public.mat_episodios
  as restrictive for update to authenticated
  using (public.pode_editar_algum('paciente'))
  with check (public.pode_editar_algum('paciente'));
create policy mat_episodios_mod_del on public.mat_episodios
  as restrictive for delete to authenticated
  using (public.pode_editar_algum('paciente'));

-- ── mat_admissoes ──────────────────────────────────────────
alter table public.mat_admissoes enable row level security;

drop policy if exists mat_admissoes_leitura on public.mat_admissoes;
create policy mat_admissoes_leitura on public.mat_admissoes
  for select to authenticated
  using (public.pode_ver_algum('paciente'));

drop policy if exists mat_admissoes_escrita_ins on public.mat_admissoes;
drop policy if exists mat_admissoes_escrita_upd on public.mat_admissoes;
drop policy if exists mat_admissoes_escrita_del on public.mat_admissoes;
create policy mat_admissoes_escrita_ins on public.mat_admissoes
  for insert to authenticated with check (true);
create policy mat_admissoes_escrita_upd on public.mat_admissoes
  for update to authenticated using (true) with check (true);
create policy mat_admissoes_escrita_del on public.mat_admissoes
  for delete to authenticated using (true);

drop policy if exists mat_admissoes_mod_ins on public.mat_admissoes;
drop policy if exists mat_admissoes_mod_upd on public.mat_admissoes;
drop policy if exists mat_admissoes_mod_del on public.mat_admissoes;
create policy mat_admissoes_mod_ins on public.mat_admissoes
  as restrictive for insert to authenticated
  with check (public.pode_editar_algum('paciente'));
create policy mat_admissoes_mod_upd on public.mat_admissoes
  as restrictive for update to authenticated
  using (public.pode_editar_algum('paciente'))
  with check (public.pode_editar_algum('paciente'));
create policy mat_admissoes_mod_del on public.mat_admissoes
  as restrictive for delete to authenticated
  using (public.pode_editar_algum('paciente'));


-- ═══════════════════════════════════════════════════════════
-- CONFERÊNCIA — leia a saída, não confie no "Success"
-- ═══════════════════════════════════════════════════════════
select 'QUAL BANCO É ESTE?' as item,
       case when (select count(*) from public.pacientes) >= 40
            then 'DEMO — ' || (select count(*) from public.pacientes) || ' pacientes'
            else 'PRINCIPAL — ' || (select count(*) from public.pacientes) || ' pacientes'
       end as resultado

union all
select 'tabela mat_episodios existe', count(*)::text
  from information_schema.tables
 where table_schema = 'public' and table_name = 'mat_episodios'

union all
select 'tabela mat_admissoes existe', count(*)::text
  from information_schema.tables
 where table_schema = 'public' and table_name = 'mat_admissoes'

union all
select 'CHECKs em mat_episodios (esperado 4)', count(*)::text
  from pg_constraint
 where conrelid = 'public.mat_episodios'::regclass and contype = 'c'

union all
select 'FKs em mat_episodios (esperado 2)', count(*)::text
  from pg_constraint
 where conrelid = 'public.mat_episodios'::regclass and contype = 'f'

union all
select 'FKs em mat_admissoes (esperado 1)', count(*)::text
  from pg_constraint
 where conrelid = 'public.mat_admissoes'::regclass and contype = 'f'

union all
select 'RLS ligada (mat_episodios)', case when relrowsecurity then 'sim' else '🔴 NAO' end
  from pg_class where oid = 'public.mat_episodios'::regclass

union all
select 'RLS ligada (mat_admissoes)', case when relrowsecurity then 'sim' else '🔴 NAO' end
  from pg_class where oid = 'public.mat_admissoes'::regclass

union all
select 'políticas mat_episodios (esperado 7)', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'mat_episodios'

union all
select 'políticas mat_admissoes (esperado 7)', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'mat_admissoes'

union all
select 'restritivas de escrita (esperado 3+3)', count(*)::text
  from pg_policies
 where schemaname = 'public' and tablename in ('mat_episodios', 'mat_admissoes')
   and permissive = 'RESTRICTIVE';


insert into public.migracoes_aplicadas (arquivo)
values ('migracao-maternidade-fase0.sql') on conflict do nothing;

-- ⚠️ DEVOLVE A VARIÁVEL. `set` vale até o FIM DA SESSÃO, não do arquivo.
reset valentrax.quem;
