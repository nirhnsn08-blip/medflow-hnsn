-- ═══════════════════════════════════════════════════════════
-- MATERNIDADE — PARTOGRAMA: os toques ao longo do trabalho de parto
--
-- Cada linha é uma avaliação em um instante do parto: dilatação, descida,
-- BCF, dinâmica, líquido. É a série que o partograma desenha — a curva de
-- dilatação contra o tempo, com as linhas de alerta e ação da OMS.
--
-- Pendura no EPISÓDIO (mat_episodios), não no paciente direto: o partograma
-- é deste parto, desta internação. Append-only, como todo registro clínico:
-- correção entra como nova linha (a tela nunca emite UPDATE/DELETE).
--
-- ⚠️ RODAR NO SQL EDITOR ANTES DO MERGE DO CÓDIGO. Aditiva e idempotente:
--    cria UMA tabela e não toca em nada existente. DEMO primeiro
--    (ufxqdvxhruaswuzhmxyf), depois o principal (HNSN). As políticas de RLS
--    vêm no fim DESTE arquivo — tabela nova sem política nasce com RLS ligada
--    e sem regra, e o sintoma não é erro: é TELA VAZIA. Depois rode também a
--    migracao-rls-leitura.sql regenerada (idempotente).
-- ═══════════════════════════════════════════════════════════

set valentrax.quem = 'laura';


-- ═══════════════════════════════════════════════════════════
-- O REGISTRO DO TRABALHO DE PARTO
-- Colunas para o que é eixo/regra (dilatação, descida, tempo); jsonb para os
-- sinais maternos do momento, que variam e ganham campo com o tempo.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.mat_trabalho_parto (
  id                bigserial primary key,
  episodio_id       bigint not null references public.mat_episodios (id),
  data_hora         timestamptz not null default now(),

  -- o eixo do partograma
  dilatacao         int,    -- cm, 0 a 10
  -- descida da apresentação pelo plano de De Lee (−3 a +3)
  descida_delee     int,

  -- vigilância fetal e dinâmica
  bcf               int,    -- batimentos cardíacos fetais, bpm
  contracoes_freq   int,    -- nº de contrações em 10 min
  contracoes_dur    int,    -- duração, em segundos

  bolsa             text,   -- integra | rota
  liquido           text,   -- claro | meconial | sanguinolento

  -- intervenções em curso
  ocitocina         text,
  analgesia         text,

  -- sinais maternos do momento: { pa_sis, pa_dia, fc, temp }
  vitais            jsonb,
  observacao        text,
  profissional      text,
  usuario           text,
  criado_em         timestamptz not null default now()
);


-- ═══════════════════════════════════════════════════════════
-- REGRAS (poucas e frouxas — travam o disparate, não a variação clínica)
-- ═══════════════════════════════════════════════════════════
alter table public.mat_trabalho_parto drop constraint if exists mat_tp_dilatacao_valida;
alter table public.mat_trabalho_parto add constraint mat_tp_dilatacao_valida
  check (dilatacao is null or dilatacao between 0 and 10);

alter table public.mat_trabalho_parto drop constraint if exists mat_tp_delee_valido;
alter table public.mat_trabalho_parto add constraint mat_tp_delee_valido
  check (descida_delee is null or descida_delee between -3 and 3);

alter table public.mat_trabalho_parto drop constraint if exists mat_tp_bolsa_valida;
alter table public.mat_trabalho_parto add constraint mat_tp_bolsa_valida
  check (bolsa is null or bolsa in ('integra', 'rota'));


-- ═══════════════════════════════════════════════════════════
-- ÍNDICE — a pergunta é sempre "a série deste episódio, na ordem do tempo".
-- ═══════════════════════════════════════════════════════════
create index if not exists mat_tp_episodio_idx
  on public.mat_trabalho_parto (episodio_id, data_hora);


-- ═══════════════════════════════════════════════════════════
-- RLS — 7 políticas, leitura pelo módulo `paciente` (como mat_admissoes).
-- Inline aqui porque o migracao-rls-leitura.sql passa de 26 KB e o editor do
-- Supabase trunca calado; rodar o arquivo grande depois é idempotente.
-- ═══════════════════════════════════════════════════════════
alter table public.mat_trabalho_parto enable row level security;

drop policy if exists mat_trabalho_parto_leitura on public.mat_trabalho_parto;
create policy mat_trabalho_parto_leitura on public.mat_trabalho_parto
  for select to authenticated
  using (public.pode_ver_algum('paciente'));

drop policy if exists mat_trabalho_parto_escrita_ins on public.mat_trabalho_parto;
drop policy if exists mat_trabalho_parto_escrita_upd on public.mat_trabalho_parto;
drop policy if exists mat_trabalho_parto_escrita_del on public.mat_trabalho_parto;
create policy mat_trabalho_parto_escrita_ins on public.mat_trabalho_parto
  for insert to authenticated with check (true);
create policy mat_trabalho_parto_escrita_upd on public.mat_trabalho_parto
  for update to authenticated using (true) with check (true);
create policy mat_trabalho_parto_escrita_del on public.mat_trabalho_parto
  for delete to authenticated using (true);

drop policy if exists mat_trabalho_parto_mod_ins on public.mat_trabalho_parto;
drop policy if exists mat_trabalho_parto_mod_upd on public.mat_trabalho_parto;
drop policy if exists mat_trabalho_parto_mod_del on public.mat_trabalho_parto;
create policy mat_trabalho_parto_mod_ins on public.mat_trabalho_parto
  as restrictive for insert to authenticated
  with check (public.pode_editar_algum('paciente'));
create policy mat_trabalho_parto_mod_upd on public.mat_trabalho_parto
  as restrictive for update to authenticated
  using (public.pode_editar_algum('paciente'))
  with check (public.pode_editar_algum('paciente'));
create policy mat_trabalho_parto_mod_del on public.mat_trabalho_parto
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
  select 1, 'tabela mat_trabalho_parto existe',
         case when exists (select 1 from information_schema.tables where table_schema='public' and table_name='mat_trabalho_parto') then '✅ sim' else '🔴 NAO' end
  union all
  select 2, 'CHECKs (esperado 3)',
         (select count(*)::text from pg_constraint where conrelid='public.mat_trabalho_parto'::regclass and contype='c')
  union all
  select 3, 'RLS ligada',
         (select case when relrowsecurity then '✅ sim' else '🔴 NAO' end from pg_class where oid='public.mat_trabalho_parto'::regclass)
  union all
  select 4, 'politicas (esperado 7)',
         (select count(*)::text from pg_policies where schemaname='public' and tablename='mat_trabalho_parto')
) t order by ord, item;


insert into public.migracoes_aplicadas (arquivo)
values ('migracao-maternidade-partograma.sql') on conflict do nothing;

-- ⚠️ DEVOLVE A VARIÁVEL. `set` vale até o FIM DA SESSÃO, não do arquivo.
reset valentrax.quem;
