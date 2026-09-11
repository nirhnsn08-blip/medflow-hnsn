-- ═══════════════════════════════════════════════════════════
-- MATERNIDADE — PARTO & CESÁREA: o registro do nascimento
--
-- Uma linha por parto do episódio: via, início do trabalho, apresentação,
-- terceiro período (placenta), perda sanguínea e o desfecho do RN primário.
-- O `robson` (1–10) é gravado no momento do parto — é o que deixa a
-- auditoria da taxa de cesárea por grupo sem recalcular o passado.
--
-- Pendura no EPISÓDIO (mat_episodios), como a admissão e o partograma.
-- Append-only: correção entra como nova linha (a tela nunca emite UPDATE/DELETE).
--
-- ⚠️ RODAR NO SQL EDITOR ANTES DO MERGE DO CÓDIGO. Aditiva e idempotente:
--    cria UMA tabela e não toca em nada existente. DEMO primeiro
--    (ufxqdvxhruaswuzhmxyf), depois o principal (HNSN). As políticas de RLS
--    vêm no fim DESTE arquivo — tabela nova sem política nasce com RLS ligada
--    e sem regra, e o sintoma não é erro: é TELA VAZIA.
-- ═══════════════════════════════════════════════════════════

set valentrax.quem = 'laura';


-- ═══════════════════════════════════════════════════════════
-- O REGISTRO DO PARTO
-- ═══════════════════════════════════════════════════════════
create table if not exists public.mat_partos (
  id                bigserial primary key,
  episodio_id       bigint not null references public.mat_episodios (id),
  data_hora         timestamptz not null default now(),

  via               text,   -- vaginal | cesarea | forceps | vacuo
  inicio_trabalho   text,   -- espontaneo | induzido | cesarea_pre_trabalho
  apresentacao      text,   -- cefalica | pelvica | transversa | obliqua | cormica
  indicacao         text,   -- indicação (sobretudo da cesárea)
  anestesia         text,   -- nenhuma | local | raqui | peridural | geral

  n_nascidos        int default 1,   -- 1, ou mais na múltipla
  robson            int,             -- grupo de Robson (1–10) no momento do parto

  -- terceiro período / hemorragia
  placenta          text,            -- espontanea | manual | dirigida
  placenta_completa boolean,
  laceracao         text,            -- integra | grau_1..4 | episiotomia
  ocitocina_profilatica boolean,
  perda_sangue_ml   int,

  -- desfecho do RN primário (o cadastro completo do bebê é o módulo RN)
  rn_vivo           boolean,         -- false = natimorto
  rn_sexo           text,            -- F | M | indeterminado
  rn_peso_g         int,
  apgar_1           int,             -- 0–10
  apgar_5           int,

  complicacoes      text,
  observacao        text,
  profissional      text,            -- quem assistiu
  usuario           text,
  criado_em         timestamptz not null default now()
);


-- ═══════════════════════════════════════════════════════════
-- REGRAS (poucas e frouxas — travam o disparate, não a variação clínica)
-- ═══════════════════════════════════════════════════════════
alter table public.mat_partos drop constraint if exists mat_partos_robson_valido;
alter table public.mat_partos add constraint mat_partos_robson_valido
  check (robson is null or robson between 1 and 10);

alter table public.mat_partos drop constraint if exists mat_partos_apgar1_valido;
alter table public.mat_partos add constraint mat_partos_apgar1_valido
  check (apgar_1 is null or apgar_1 between 0 and 10);

alter table public.mat_partos drop constraint if exists mat_partos_apgar5_valido;
alter table public.mat_partos add constraint mat_partos_apgar5_valido
  check (apgar_5 is null or apgar_5 between 0 and 10);

alter table public.mat_partos drop constraint if exists mat_partos_via_valida;
alter table public.mat_partos add constraint mat_partos_via_valida
  check (via is null or via in ('vaginal', 'cesarea', 'forceps', 'vacuo'));

alter table public.mat_partos drop constraint if exists mat_partos_nascidos_valido;
alter table public.mat_partos add constraint mat_partos_nascidos_valido
  check (n_nascidos is null or n_nascidos >= 1);


-- ═══════════════════════════════════════════════════════════
-- ÍNDICE — a pergunta é "os partos deste episódio, na ordem do tempo".
-- ═══════════════════════════════════════════════════════════
create index if not exists mat_partos_episodio_idx
  on public.mat_partos (episodio_id, data_hora);


-- ═══════════════════════════════════════════════════════════
-- RLS — 7 políticas, leitura/edição pelo módulo `paciente` (como mat_trabalho_parto).
-- Inline aqui porque o migracao-rls-leitura.sql passa de 26 KB e o editor do
-- Supabase trunca calado; rodar o arquivo grande depois é idempotente.
-- ═══════════════════════════════════════════════════════════
alter table public.mat_partos enable row level security;

drop policy if exists mat_partos_leitura on public.mat_partos;
create policy mat_partos_leitura on public.mat_partos
  for select to authenticated
  using (public.pode_ver_algum('paciente'));

drop policy if exists mat_partos_escrita_ins on public.mat_partos;
drop policy if exists mat_partos_escrita_upd on public.mat_partos;
drop policy if exists mat_partos_escrita_del on public.mat_partos;
create policy mat_partos_escrita_ins on public.mat_partos
  for insert to authenticated with check (true);
create policy mat_partos_escrita_upd on public.mat_partos
  for update to authenticated using (true) with check (true);
create policy mat_partos_escrita_del on public.mat_partos
  for delete to authenticated using (true);

drop policy if exists mat_partos_mod_ins on public.mat_partos;
drop policy if exists mat_partos_mod_upd on public.mat_partos;
drop policy if exists mat_partos_mod_del on public.mat_partos;
create policy mat_partos_mod_ins on public.mat_partos
  as restrictive for insert to authenticated
  with check (public.pode_editar_algum('paciente'));
create policy mat_partos_mod_upd on public.mat_partos
  as restrictive for update to authenticated
  using (public.pode_editar_algum('paciente'))
  with check (public.pode_editar_algum('paciente'));
create policy mat_partos_mod_del on public.mat_partos
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
  select 1, 'tabela mat_partos existe',
         case when exists (select 1 from information_schema.tables where table_schema='public' and table_name='mat_partos') then '✅ sim' else '🔴 NAO' end
  union all
  select 2, 'CHECKs (esperado 5)',
         (select count(*)::text from pg_constraint where conrelid='public.mat_partos'::regclass and contype='c')
  union all
  select 3, 'RLS ligada',
         (select case when relrowsecurity then '✅ sim' else '🔴 NAO' end from pg_class where oid='public.mat_partos'::regclass)
  union all
  select 4, 'politicas (esperado 7)',
         (select count(*)::text from pg_policies where schemaname='public' and tablename='mat_partos')
) t order by ord, item;


insert into public.migracoes_aplicadas (arquivo)
values ('migracao-maternidade-parto.sql') on conflict do nothing;

-- ⚠️ DEVOLVE A VARIÁVEL. `set` vale até o FIM DA SESSÃO, não do arquivo.
reset valentrax.quem;
