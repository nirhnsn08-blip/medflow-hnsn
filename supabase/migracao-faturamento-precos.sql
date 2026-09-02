-- ═══════════════════════════════════════════════════════════
-- FATURAMENTO — PREÇO POR CONVÊNIO, COM VIGÊNCIA
--
-- 🔴 O DEFEITO QUE ISTO CONSERTA. Hoje o preço de um procedimento sai de
-- `at_procedimentos.valor_sus`, com um fallback para o SIGTAP (SH+SP). Não
-- existe dimensão de convênio em lugar nenhum — então **uma conta da Unimed
-- é precificada pela tabela do SUS**. O erro não aparece em tela: a conta
-- fecha, sai na remessa, e volta glosada ou paga a menor.
--
-- ⚠️ ISTO NÃO MUDA A CONTA JÁ LANÇADA. `at_conta_itens` grava
-- `valor_unitario` no momento do lançamento, de propósito: a conta de março
-- tem que continuar valendo o preço de março mesmo quando a tabela mudar.
-- Esta tabela é a FONTE DA SUGESTÃO, não a fonte da verdade retroativa.
--
-- ── POR QUE VIGÊNCIA, E NÃO UM PREÇO SÓ ─────────────────────
-- Tabela de convênio muda por aditivo contratual, e muda no meio do ano. Um
-- preço único faria a conferência de uma competência antiga usar o valor de
-- hoje — e a divergência apareceria como glosa que ninguém entende.
--
-- 🔴 A TRAVA PRINCIPAL É A SOBREPOSIÇÃO. Dois preços ATIVOS para o mesmo
-- convênio e o mesmo código, com períodos que se cruzam, tornam a pergunta
-- "quanto custa isto hoje?" ambígua — e o sistema escolheria um dos dois por
-- acaso, de forma estável o bastante para ninguém desconfiar. O banco recusa
-- via `EXCLUDE USING gist`, que é a única forma de expressar "estes
-- intervalos não podem se cruzar" em constraint.
--
-- ⚠️ SEM `plano_id` NESTA VERSÃO. `at_planos` tem ZERO linhas nos dois
-- bancos e plano não é usado em lugar nenhum do código. Modelar a dimensão
-- agora criaria uma coluna que ninguém preenche e uma ambiguidade a mais na
-- trava de sobreposição. Quando existir plano de verdade, entra — e a trava
-- precisa entrar junto.
--
-- ⚠️ RODAR NO SQL EDITOR ANTES DO MERGE DO CÓDIGO.
--    Aditiva: cria UMA tabela e a extensão `btree_gist`. Não toca em nada
--    existente. DEMO primeiro (ufxqdvxhruaswuzhmxyf), depois o principal.
-- ═══════════════════════════════════════════════════════════

set valentrax.quem = 'adauam';

-- Necessária para o EXCLUDE abaixo: sem ela o gist não sabe comparar
-- `bigint` e `text` com `=` dentro da mesma constraint.
create extension if not exists btree_gist;


-- ═══════════════════════════════════════════════════════════
-- O PREÇO
--
-- `valor` ZERO é válido e diferente de ausente: zero é "não remunerado
-- separadamente" (está no pacote), ausente é "ninguém cadastrou". A tela
-- imprime R$ 0,00 para o primeiro e "sem preço" para o segundo — mesma
-- distinção que o resto do módulo faz entre 0 e null.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.at_precos (
  id               bigserial primary key,
  convenio_id      bigint not null references public.at_convenios (id),
  -- código do procedimento: SIGTAP para o SUS, TUSS/CBHPM/próprio para os demais
  codigo           text not null,
  -- sigtap | tuss | cbhpm | proprio — de qual tabela veio o código
  tabela           text,
  descricao        text,
  valor            numeric(12,2) not null,
  vigencia_inicio  date not null,
  -- nulo = vigente por prazo indeterminado (o caso normal de contrato)
  vigencia_fim     date,
  ativo            boolean not null default true,
  observacao       text,
  usuario          text,
  criado_em        timestamptz not null default now(),
  updated_at       timestamptz default now()
);


-- ═══════════════════════════════════════════════════════════
-- AS REGRAS QUE VIRAM CONSTRAINT
-- ═══════════════════════════════════════════════════════════

-- Preço negativo não existe. Zero existe (procedimento incluso no pacote).
alter table public.at_precos drop constraint if exists at_preco_valor_nao_negativo;
alter table public.at_precos add constraint at_preco_valor_nao_negativo
  check (valor >= 0);

-- Vigência que termina antes de começar é data trocada na digitação, e o
-- estrago é silencioso: o preço nasce sem nunca valer, e a conta cai no
-- fallback do SIGTAP como se o convênio não tivesse tabela.
alter table public.at_precos drop constraint if exists at_preco_vigencia_coerente;
alter table public.at_precos add constraint at_preco_vigencia_coerente
  check (vigencia_fim is null or vigencia_fim >= vigencia_inicio);

-- Código em branco vira preço que nada encontra.
alter table public.at_precos drop constraint if exists at_preco_codigo_preenchido;
alter table public.at_precos add constraint at_preco_codigo_preenchido
  check (length(btrim(codigo)) > 0);

-- 🔴 A TRAVA PRINCIPAL: dois preços ATIVOS do mesmo convênio, para o mesmo
-- código, com períodos que se cruzam. Sem ela, "quanto custa hoje?" tem
-- duas respostas e o sistema escolhe uma sem avisar.
--
-- `where (ativo)` de propósito: preço desativado é histórico, e histórico
-- pode se sobrepor à vontade — foi assim que o contrato antigo terminou.
alter table public.at_precos drop constraint if exists at_preco_sem_sobreposicao;
alter table public.at_precos add constraint at_preco_sem_sobreposicao
  exclude using gist (
    convenio_id with =,
    codigo with =,
    daterange(vigencia_inicio, coalesce(vigencia_fim, 'infinity'::date), '[]') with &&
  ) where (ativo);


-- ═══════════════════════════════════════════════════════════
-- OS ÍNDICES
--
-- A consulta do dia inteiro é "o preço deste código, para este convênio,
-- nesta data".
-- ═══════════════════════════════════════════════════════════
create index if not exists at_precos_busca_idx
  on public.at_precos (convenio_id, codigo, vigencia_inicio desc)
  where ativo;


-- ═══════════════════════════════════════════════════════════
-- RLS — 7 políticas, mesmo desenho de at_glosas e at_repasses
--
-- ⚠️ Preço de convênio NÃO tem dado de paciente, mas segue no módulo
-- "atendimento" e não como catálogo aberto: tabela de preço é informação
-- comercial, e quem não fatura não precisa dela.
-- ═══════════════════════════════════════════════════════════
alter table public.at_precos enable row level security;

drop policy if exists at_precos_leitura on public.at_precos;
create policy at_precos_leitura on public.at_precos
  for select to authenticated
  using (public.pode_ver_algum('atendimento'));

drop policy if exists at_precos_escrita_ins on public.at_precos;
drop policy if exists at_precos_escrita_upd on public.at_precos;
drop policy if exists at_precos_escrita_del on public.at_precos;

create policy at_precos_escrita_ins on public.at_precos
  for insert to authenticated with check (true);
create policy at_precos_escrita_upd on public.at_precos
  for update to authenticated using (true) with check (true);
create policy at_precos_escrita_del on public.at_precos
  for delete to authenticated using (true);

drop policy if exists at_precos_mod_ins on public.at_precos;
drop policy if exists at_precos_mod_upd on public.at_precos;
drop policy if exists at_precos_mod_del on public.at_precos;

create policy at_precos_mod_ins on public.at_precos
  as restrictive for insert to authenticated
  with check (public.pode_editar_algum('atendimento'));
create policy at_precos_mod_upd on public.at_precos
  as restrictive for update to authenticated
  using (public.pode_editar_algum('atendimento'))
  with check (public.pode_editar_algum('atendimento'));
create policy at_precos_mod_del on public.at_precos
  as restrictive for delete to authenticated
  using (public.pode_editar_algum('atendimento'));


-- ═══════════════════════════════════════════════════════════
-- CONFERÊNCIA — leia a saída, não confie no "Success"
-- ═══════════════════════════════════════════════════════════
select 'QUAL BANCO É ESTE?' as item,
       case when (select count(*) from public.pacientes) >= 40
            then 'DEMO — ' || (select count(*) from public.pacientes) || ' pacientes'
            else 'PRINCIPAL — ' || (select count(*) from public.pacientes) || ' pacientes'
       end as resultado

union all
select 'tabela at_precos existe', count(*)::text
  from information_schema.tables
 where table_schema = 'public' and table_name = 'at_precos'

union all
select 'extensao btree_gist', case when count(*) > 0 then 'instalada' else '🔴 FALTA' end
  from pg_extension where extname = 'btree_gist'

union all
select 'CHECKs (esperado 3)', count(*)::text
  from pg_constraint
 where conrelid = 'public.at_precos'::regclass and contype = 'c'

union all
select '🔴 trava de sobreposicao (esperado 1)', count(*)::text
  from pg_constraint
 where conrelid = 'public.at_precos'::regclass and contype = 'x'

union all
select 'RLS ligada', case when relrowsecurity then 'sim' else '🔴 NAO' end
  from pg_class where oid = 'public.at_precos'::regclass

union all
select 'politicas (esperado 7)', count(*)::text
  from pg_policies
 where schemaname = 'public' and tablename = 'at_precos'

union all
select 'restritivas de escrita (esperado 3)', count(*)::text
  from pg_policies
 where schemaname = 'public' and tablename = 'at_precos' and permissive = 'RESTRICTIVE';


insert into public.migracoes_aplicadas (arquivo)
values ('migracao-faturamento-precos.sql') on conflict do nothing;

-- ⚠️ DEVOLVE A VARIÁVEL. `set` vale até o fim da SESSÃO, não do arquivo.
reset valentrax.quem;
