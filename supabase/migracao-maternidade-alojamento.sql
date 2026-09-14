-- ═══════════════════════════════════════════════════════════
-- MATERNIDADE — ALOJAMENTO CONJUNTO: a evolução do binômio
--
-- Depois do parto, mãe e bebê ficam no mesmo quarto e são avaliados JUNTOS,
-- a cada turno. Uma linha aqui = uma evolução do binômio: o puerpério da mãe,
-- o exame do bebê e como está a amamentação. Append-only, como todo registro
-- clínico do sistema.
--
-- ── POR QUE `vitais` TEM O MESMO FORMATO DO PARTOGRAMA ──────
-- Porque o painel de Segurança materna (MEOWS) lê os vitais de onde eles
-- forem lançados. A hemorragia pós-parto — a primeira causa de morte materna —
-- acontece EXATAMENTE aqui, nas primeiras horas do alojamento. Se os vitais do
-- alojamento tivessem outro formato, a puérpera sumiria do painel logo depois
-- do parto, que é quando ela mais precisa aparecer nele.
--
-- ── A ALTA ──
-- `alta_binomio = true` marca a evolução que dá alta. Quem encerra o EPISÓDIO
-- (mat_episodios.status = 'encerrado') é a tela, no mesmo passo — e o episódio
-- encerrado sai da fila obstétrica e do painel de segurança. É o fim da
-- jornada que começou na admissão.
--
-- ⚠️ RODAR NO SQL EDITOR ANTES DO MERGE. Aditiva e idempotente. DEMO primeiro
--    (ufxqdvxhruaswuzhmxyf), depois o principal (HNSN). As políticas de RLS
--    vêm no fim — tabela nova sem política nasce com RLS ligada e sem regra
--    (sintoma: TELA VAZIA, não erro).
-- ═══════════════════════════════════════════════════════════

set valentrax.quem = 'laura';


create table if not exists public.mat_alojamento (
  id                     bigserial primary key,
  episodio_id            bigint not null references public.mat_episodios (id),
  -- qual bebê desta evolução (gemelar tem uma linha por bebê)
  rn_id                  bigint references public.mat_recem_nascidos (id),
  prontuario_rn          text,
  data_hora              timestamptz not null default now(),
  turno                  text,        -- manha | tarde | noite

  -- ── MÃE: puerpério ──
  -- mesmo formato do partograma/admissão: alimenta o MEOWS
  vitais                 jsonb,
  utero                  text,        -- contraido | globoso | amolecido
  altura_uterina_cm      numeric(4,1),-- em relação à cicatriz umbilical (pode ser negativo)
  loquios_aspecto        text,        -- rubro | seroso | alba
  loquios_quantidade     text,        -- ausente | pouco | moderado | aumentado
  loquios_odor           text,        -- inodoro | fetido
  ferida                 text,        -- integro | episiorrafia | laceracao | cesarea
  ferida_aspecto         text,        -- limpa | hiperemia | secrecao | deiscencia
  mamas                  text,        -- normais | ingurgitadas | fissura | mastite
  dor_eva                int,
  diurese                boolean,
  evacuacao              boolean,
  deambulando            boolean,

  -- ── RECÉM-NASCIDO ──
  rn_peso_g              int,
  rn_temp                numeric(3,1),
  rn_ictericia_zona      int,         -- Kramer 0 (ausente) a 5
  rn_diurese             boolean,
  rn_evacuacao           boolean,     -- mecônio/transição
  rn_coto                text,        -- seco | umido | secrecao | hiperemia

  -- ── ALEITAMENTO ──
  aleitamento            text,        -- exclusivo | predominante | complementado | formula
  pega                   text,        -- adequada | inadequada
  mamadas_24h            int,
  dificuldades           jsonb,       -- ["fissura","ingurgitamento",...]

  -- ── ALTA DO BINÔMIO ──
  vacina_bcg             boolean,
  vacina_hep_b           boolean,
  pezinho_agendado       boolean,     -- alta antes de 48 h: o teste fica agendado
  consulta_puerperio     boolean,
  consulta_rn            boolean,
  orientacoes            boolean,
  alta_binomio           boolean not null default false,

  observacao             text,
  profissional           text,
  usuario                text,
  criado_em              timestamptz not null default now()
);


-- ═══════════════════════════════════════════════════════════
-- REGRAS (poucas e frouxas — travam o disparate, não a clínica)
-- ═══════════════════════════════════════════════════════════
alter table public.mat_alojamento drop constraint if exists mat_aloj_utero_valido;
alter table public.mat_alojamento add constraint mat_aloj_utero_valido
  check (utero is null or utero in ('contraido', 'globoso', 'amolecido'));

alter table public.mat_alojamento drop constraint if exists mat_aloj_loquios_qtd_valida;
alter table public.mat_alojamento add constraint mat_aloj_loquios_qtd_valida
  check (loquios_quantidade is null or loquios_quantidade in ('ausente', 'pouco', 'moderado', 'aumentado'));

alter table public.mat_alojamento drop constraint if exists mat_aloj_aleitamento_valido;
alter table public.mat_alojamento add constraint mat_aloj_aleitamento_valido
  check (aleitamento is null or aleitamento in ('exclusivo', 'predominante', 'complementado', 'formula'));

alter table public.mat_alojamento drop constraint if exists mat_aloj_pega_valida;
alter table public.mat_alojamento add constraint mat_aloj_pega_valida
  check (pega is null or pega in ('adequada', 'inadequada'));

-- Kramer vai de 0 (sem icterícia) a 5.
alter table public.mat_alojamento drop constraint if exists mat_aloj_kramer_valido;
alter table public.mat_alojamento add constraint mat_aloj_kramer_valido
  check (rn_ictericia_zona is null or rn_ictericia_zona between 0 and 5);

alter table public.mat_alojamento drop constraint if exists mat_aloj_dor_valida;
alter table public.mat_alojamento add constraint mat_aloj_dor_valida
  check (dor_eva is null or dor_eva between 0 and 10);

-- Peso de recém-nascido fora desta faixa é erro de digitação, não clínica.
alter table public.mat_alojamento drop constraint if exists mat_aloj_peso_valido;
alter table public.mat_alojamento add constraint mat_aloj_peso_valido
  check (rn_peso_g is null or rn_peso_g between 200 and 8000);

alter table public.mat_alojamento drop constraint if exists mat_aloj_mamadas_valida;
alter table public.mat_alojamento add constraint mat_aloj_mamadas_valida
  check (mamadas_24h is null or mamadas_24h between 0 and 30);


-- ═══════════════════════════════════════════════════════════
-- ÍNDICE — "as evoluções deste episódio, na ordem do tempo".
-- ═══════════════════════════════════════════════════════════
create index if not exists mat_aloj_episodio_idx
  on public.mat_alojamento (episodio_id, data_hora);


-- ═══════════════════════════════════════════════════════════
-- RLS — 7 políticas, leitura/edição pelo módulo `paciente`
-- (o mesmo desenho das outras tabelas da maternidade).
-- ═══════════════════════════════════════════════════════════
alter table public.mat_alojamento enable row level security;

drop policy if exists mat_aloj_leitura on public.mat_alojamento;
create policy mat_aloj_leitura on public.mat_alojamento
  for select to authenticated
  using (public.pode_ver_algum('paciente'));

drop policy if exists mat_aloj_escrita_ins on public.mat_alojamento;
drop policy if exists mat_aloj_escrita_upd on public.mat_alojamento;
drop policy if exists mat_aloj_escrita_del on public.mat_alojamento;
create policy mat_aloj_escrita_ins on public.mat_alojamento
  for insert to authenticated with check (true);
create policy mat_aloj_escrita_upd on public.mat_alojamento
  for update to authenticated using (true) with check (true);
create policy mat_aloj_escrita_del on public.mat_alojamento
  for delete to authenticated using (true);

drop policy if exists mat_aloj_mod_ins on public.mat_alojamento;
drop policy if exists mat_aloj_mod_upd on public.mat_alojamento;
drop policy if exists mat_aloj_mod_del on public.mat_alojamento;
create policy mat_aloj_mod_ins on public.mat_alojamento
  as restrictive for insert to authenticated
  with check (public.pode_editar_algum('paciente'));
create policy mat_aloj_mod_upd on public.mat_alojamento
  as restrictive for update to authenticated
  using (public.pode_editar_algum('paciente'))
  with check (public.pode_editar_algum('paciente'));
create policy mat_aloj_mod_del on public.mat_alojamento
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
  select 1, 'tabela mat_alojamento existe',
         case when exists (select 1 from information_schema.tables where table_schema='public' and table_name='mat_alojamento') then '✅ sim' else '🔴 NAO' end
  union all
  select 2, 'CHECKs (esperado 8)',
         (select count(*)::text from pg_constraint where conrelid='public.mat_alojamento'::regclass and contype='c')
  union all
  select 3, 'RLS ligada',
         (select case when relrowsecurity then '✅ sim' else '🔴 NAO' end from pg_class where oid='public.mat_alojamento'::regclass)
  union all
  select 4, 'politicas (esperado 7)',
         (select count(*)::text from pg_policies where schemaname='public' and tablename='mat_alojamento')
) t order by ord, item;


insert into public.migracoes_aplicadas (arquivo)
values ('migracao-maternidade-alojamento.sql') on conflict do nothing;

reset valentrax.quem;
