-- ═══════════════════════════════════════════════════════════
-- FATURAMENTO — O REPASSE (o dinheiro que ENTROU)
--
-- Fecha o ciclo: já existe o que foi FATURADO (`at_conta_itens`) e o que foi
-- GLOSADO (`at_glosas`). Falta o que foi RECEBIDO — e é a subtração dos três
-- que produz o número que nenhum sistema mostra:
--
--     faturado − glosado − recebido = A DIFERENÇA QUE NINGUÉM EXPLICOU
--
-- Dinheiro que saiu daqui cobrado, não voltou como glosa formal, e nunca
-- entrou. Hoje esse buraco só aparece na conciliação bancária, meses depois,
-- sem ninguém saber de qual conta veio.
--
-- ── POR QUE TABELA, E NÃO COLUNAS EM `at_contas` ────────────
-- O SUS paga em LOTE, às vezes PARCIAL, e às vezes em competências
-- diferentes: uma conta de agosto pode receber R$ 300 em setembro e R$ 200
-- em outubro. Um par de colunas (`valor_recebido`, `recebido_em`) guardaria
-- só o último pagamento e apagaria a história — e é justamente a história
-- que se procura quando o valor não fecha.
--
-- ⚠️ `valor` PODE SER NEGATIVO, de propósito. O SUS faz desconto retroativo
-- e estorno em competência posterior. Bloquear negativo não faria o estorno
-- deixar de existir: faria alguém registrá-lo como positivo em outro lugar,
-- ou não registrar. O que se recusa é ZERO — repasse de zero não é um fato,
-- é digitação errada.
--
-- DINHEIRO EM numeric(12,2), nunca float — mesma regra da conta e da glosa.
--
-- ⚠️ RODAR NO SQL EDITOR ANTES DO MERGE DO CÓDIGO.
--    Aditiva e idempotente: cria UMA tabela e não toca em nenhuma existente.
--    DEMO primeiro (ufxqdvxhruaswuzhmxyf), depois o principal.
--    As políticas de RLS estão no fim DESTE arquivo — tabela nova sem
--    política nasce com RLS ligada e sem regra, e o sintoma não é erro, é
--    TELA VAZIA.
-- ═══════════════════════════════════════════════════════════

set valentrax.quem = 'adauam';


-- ═══════════════════════════════════════════════════════════
-- O REPASSE
--
-- `competencia_repasse` é QUANDO O DINHEIRO ENTROU, e não a competência da
-- produção. As duas quase nunca são a mesma, e confundi-las faz a receita
-- de setembro aparecer em agosto — o erro que faz o gestor achar que o mês
-- foi bom e o seguinte, péssimo.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.at_repasses (
  id                  bigserial primary key,
  conta_id            bigint not null references public.at_contas (id),
  -- AAAA-MM de quando o crédito ENTROU (≠ competência da produção)
  competencia_repasse text,
  -- negativo = estorno/desconto retroativo. Zero é recusado.
  valor               numeric(12,2) not null,
  recebido_em         date not null,
  -- nº do demonstrativo de crédito, ordem bancária, lote
  documento           text,
  observacao          text,
  usuario             text,
  criado_em           timestamptz not null default now(),
  updated_at          timestamptz default now()
);


-- ═══════════════════════════════════════════════════════════
-- AS REGRAS QUE VIRAM CONSTRAINT
-- ═══════════════════════════════════════════════════════════

-- Repasse de zero não é um fato do mundo: ou não pagaram (e não há linha),
-- ou alguém errou a digitação. Negativo CONTINUA valendo — é o estorno.
alter table public.at_repasses drop constraint if exists at_repasse_valor_nao_zero;
alter table public.at_repasses add constraint at_repasse_valor_nao_zero
  check (valor <> 0);


-- ═══════════════════════════════════════════════════════════
-- OS ÍNDICES
-- ═══════════════════════════════════════════════════════════
create index if not exists at_repasses_conta_idx
  on public.at_repasses (conta_id);
create index if not exists at_repasses_competencia_idx
  on public.at_repasses (competencia_repasse, recebido_em);


-- ═══════════════════════════════════════════════════════════
-- RLS — as 7 políticas, no mesmo desenho da `at_glosas`
--
-- Vêm neste arquivo porque o `migracao-rls-leitura.sql` completo tem 41 KB
-- e o editor do Supabase TRUNCA CALADO acima de ~26 KB, com erro que não
-- diz que faltou texto. Rodar o arquivo grande depois não quebra: ele
-- derruba e recria pelos mesmos nomes.
--
-- ⚠️ As restritivas NUNCA usam `for all` — isso incluiria SELECT, e uma
-- restritiva sobre SELECT tiraria a leitura de quem tem só leitura no
-- módulo, desfazendo a política de cima.
-- ═══════════════════════════════════════════════════════════
alter table public.at_repasses enable row level security;

drop policy if exists at_repasses_leitura on public.at_repasses;
create policy at_repasses_leitura on public.at_repasses
  for select to authenticated
  using (public.pode_ver_algum('atendimento'));

drop policy if exists at_repasses_escrita_ins on public.at_repasses;
drop policy if exists at_repasses_escrita_upd on public.at_repasses;
drop policy if exists at_repasses_escrita_del on public.at_repasses;

create policy at_repasses_escrita_ins on public.at_repasses
  for insert to authenticated with check (true);
create policy at_repasses_escrita_upd on public.at_repasses
  for update to authenticated using (true) with check (true);
create policy at_repasses_escrita_del on public.at_repasses
  for delete to authenticated using (true);

drop policy if exists at_repasses_mod_ins on public.at_repasses;
drop policy if exists at_repasses_mod_upd on public.at_repasses;
drop policy if exists at_repasses_mod_del on public.at_repasses;

create policy at_repasses_mod_ins on public.at_repasses
  as restrictive for insert to authenticated
  with check (public.pode_editar_algum('atendimento'));
create policy at_repasses_mod_upd on public.at_repasses
  as restrictive for update to authenticated
  using (public.pode_editar_algum('atendimento'))
  with check (public.pode_editar_algum('atendimento'));
create policy at_repasses_mod_del on public.at_repasses
  as restrictive for delete to authenticated
  using (public.pode_editar_algum('atendimento'));


-- ═══════════════════════════════════════════════════════════
-- CONFERÊNCIA — leia a saída, não confie no "Success"
--
-- ⚠️ `contype = 'c'` filtra SÓ os CHECK. Em `LIKE`, `_` é curinga de UM
-- caractere, e `at_repasse_%` casaria também com `at_repasses_pkey` e a FK.
-- ═══════════════════════════════════════════════════════════
select 'QUAL BANCO É ESTE?' as item,
       case when (select count(*) from public.pacientes) >= 40
            then 'DEMO — ' || (select count(*) from public.pacientes) || ' pacientes'
            else 'PRINCIPAL — ' || (select count(*) from public.pacientes) || ' pacientes'
       end as resultado

union all
select 'tabela at_repasses existe', count(*)::text
  from information_schema.tables
 where table_schema = 'public' and table_name = 'at_repasses'

union all
select 'CHECKs (esperado 1)', count(*)::text
  from pg_constraint
 where conrelid = 'public.at_repasses'::regclass and contype = 'c'

union all
select 'chaves estrangeiras (esperado 1)', count(*)::text
  from pg_constraint
 where conrelid = 'public.at_repasses'::regclass and contype = 'f'

union all
select 'indices (esperado 3, com o da pkey)', count(*)::text
  from pg_indexes
 where schemaname = 'public' and tablename = 'at_repasses'

union all
select 'RLS ligada', case when relrowsecurity then 'sim' else '🔴 NAO' end
  from pg_class where oid = 'public.at_repasses'::regclass

union all
select 'politicas (esperado 7)', count(*)::text
  from pg_policies
 where schemaname = 'public' and tablename = 'at_repasses'

union all
select 'restritivas de escrita (esperado 3)', count(*)::text
  from pg_policies
 where schemaname = 'public' and tablename = 'at_repasses' and permissive = 'RESTRICTIVE';


insert into public.migracoes_aplicadas (arquivo)
values ('migracao-faturamento-repasses.sql') on conflict do nothing;

-- ⚠️ DEVOLVE A VARIÁVEL. `set` vale até o FIM DA SESSÃO, não do arquivo —
-- sem isto, toda migração rodada depois nesta mesma aba (e os 87 scripts do
-- `reconstruir-banco.sql`) se registrariam como aplicados por 'adauam'.
reset valentrax.quem;
