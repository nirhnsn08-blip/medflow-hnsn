-- ═══════════════════════════════════════════════════════════
-- MATERNIDADE — RECÉM-NASCIDO: a avaliação clínica do bebê
--
-- A IDENTIDADE do bebê é um paciente próprio (pacientes, com prontuario_mae —
-- já existe, migracao-pacientes-recem-nascido.sql). Esta tabela guarda a
-- AVALIAÇÃO do berço: peso/medidas, IG pelo Capurro, Apgar, profilaxias e a
-- triagem neonatal (pezinho/orelhinha/olhinho/coraçãozinho).
--
-- Pendura no EPISÓDIO (e no parto, quando houver). Append-only.
--
-- ⚠️ RODAR NO SQL EDITOR ANTES DO MERGE. Aditiva e idempotente. DEMO primeiro
--    (ufxqdvxhruaswuzhmxyf), depois o principal (HNSN). As políticas de RLS
--    vêm no fim — tabela nova sem política nasce com RLS ligada e sem regra
--    (sintoma: TELA VAZIA, não erro).
-- ═══════════════════════════════════════════════════════════

set valentrax.quem = 'laura';


create table if not exists public.mat_recem_nascidos (
  id                     bigserial primary key,
  episodio_id            bigint not null references public.mat_episodios (id),
  parto_id               bigint references public.mat_partos (id),
  prontuario_rn          text,        -- prontuário do bebê (pacientes)
  data_hora              timestamptz not null default now(),

  sexo                   text,        -- F | M | indeterminado
  peso_g                 int,
  comprimento_cm         numeric(4,1),
  perimetro_cefalico_cm  numeric(4,1),

  ig_capurro_semanas     int,         -- IG estimada pelo Capurro somático
  capurro_pontos         int,

  apgar_1                int,
  apgar_5                int,
  apgar_10               int,

  reanimacao             text,        -- nenhuma | oxigenio | vpp | intubacao | massagem
  vitamina_k             boolean,
  profilaxia_ocular      boolean,     -- método de Credé
  aleitamento_1a_hora    boolean,
  triagem                jsonb,        -- { pezinho, orelhinha, olhinho, coracaozinho }

  observacao             text,
  profissional           text,
  usuario                text,
  criado_em              timestamptz not null default now()
);


-- ═══════════════════════════════════════════════════════════
-- REGRAS (poucas e frouxas — travam o disparate)
-- ═══════════════════════════════════════════════════════════
alter table public.mat_recem_nascidos drop constraint if exists mat_rn_apgar1_valido;
alter table public.mat_recem_nascidos add constraint mat_rn_apgar1_valido
  check (apgar_1 is null or apgar_1 between 0 and 10);

alter table public.mat_recem_nascidos drop constraint if exists mat_rn_apgar5_valido;
alter table public.mat_recem_nascidos add constraint mat_rn_apgar5_valido
  check (apgar_5 is null or apgar_5 between 0 and 10);

alter table public.mat_recem_nascidos drop constraint if exists mat_rn_apgar10_valido;
alter table public.mat_recem_nascidos add constraint mat_rn_apgar10_valido
  check (apgar_10 is null or apgar_10 between 0 and 10);

alter table public.mat_recem_nascidos drop constraint if exists mat_rn_ig_valida;
alter table public.mat_recem_nascidos add constraint mat_rn_ig_valida
  check (ig_capurro_semanas is null or ig_capurro_semanas between 20 and 45);

alter table public.mat_recem_nascidos drop constraint if exists mat_rn_sexo_valido;
alter table public.mat_recem_nascidos add constraint mat_rn_sexo_valido
  check (sexo is null or sexo in ('F', 'M', 'indeterminado'));


-- ═══════════════════════════════════════════════════════════
-- ÍNDICE — "os RNs deste episódio, na ordem do tempo".
-- ═══════════════════════════════════════════════════════════
create index if not exists mat_rn_episodio_idx
  on public.mat_recem_nascidos (episodio_id, data_hora);


-- ═══════════════════════════════════════════════════════════
-- RLS — 7 políticas, leitura/edição pelo módulo `paciente`.
-- ═══════════════════════════════════════════════════════════
alter table public.mat_recem_nascidos enable row level security;

drop policy if exists mat_rn_leitura on public.mat_recem_nascidos;
create policy mat_rn_leitura on public.mat_recem_nascidos
  for select to authenticated
  using (public.pode_ver_algum('paciente'));

drop policy if exists mat_rn_escrita_ins on public.mat_recem_nascidos;
drop policy if exists mat_rn_escrita_upd on public.mat_recem_nascidos;
drop policy if exists mat_rn_escrita_del on public.mat_recem_nascidos;
create policy mat_rn_escrita_ins on public.mat_recem_nascidos
  for insert to authenticated with check (true);
create policy mat_rn_escrita_upd on public.mat_recem_nascidos
  for update to authenticated using (true) with check (true);
create policy mat_rn_escrita_del on public.mat_recem_nascidos
  for delete to authenticated using (true);

drop policy if exists mat_rn_mod_ins on public.mat_recem_nascidos;
drop policy if exists mat_rn_mod_upd on public.mat_recem_nascidos;
drop policy if exists mat_rn_mod_del on public.mat_recem_nascidos;
create policy mat_rn_mod_ins on public.mat_recem_nascidos
  as restrictive for insert to authenticated
  with check (public.pode_editar_algum('paciente'));
create policy mat_rn_mod_upd on public.mat_recem_nascidos
  as restrictive for update to authenticated
  using (public.pode_editar_algum('paciente'))
  with check (public.pode_editar_algum('paciente'));
create policy mat_rn_mod_del on public.mat_recem_nascidos
  as restrictive for delete to authenticated
  using (public.pode_editar_algum('paciente'));


-- ═══════════════════════════════════════════════════════════
-- CONFERÊNCIA — rode o arquivo INTEIRO. A 1ª linha diz QUAL BANCO é este.
-- ═══════════════════════════════════════════════════════════
select item, resultado from (
  select 0 as ord, '🔎 BANCO' as item,
         case when (select count(*) from public.pacientes) >= 40
              then '🟠 DEMO (banco de teste) — pode rodar aqui'
              else '🔴 PRINCIPAL (HNSN) — produção' end as resultado
  union all
  select 1, 'tabela mat_recem_nascidos existe',
         case when exists (select 1 from information_schema.tables where table_schema='public' and table_name='mat_recem_nascidos') then '✅ sim' else '🔴 NAO' end
  union all
  select 2, 'CHECKs (esperado 5)',
         (select count(*)::text from pg_constraint where conrelid='public.mat_recem_nascidos'::regclass and contype='c')
  union all
  select 3, 'RLS ligada',
         (select case when relrowsecurity then '✅ sim' else '🔴 NAO' end from pg_class where oid='public.mat_recem_nascidos'::regclass)
  union all
  select 4, 'politicas (esperado 7)',
         (select count(*)::text from pg_policies where schemaname='public' and tablename='mat_recem_nascidos')
) t order by ord, item;


insert into public.migracoes_aplicadas (arquivo)
values ('migracao-maternidade-recem-nascido.sql') on conflict do nothing;

reset valentrax.quem;
