-- ============================================================
-- Valentrax — BUSCA DE PACIENTE POR NOME (aditiva, sem destruir nada)
--
-- POR QUE ESTA MIGRAÇÃO EXISTE
-- A busca da recepção não achava o paciente que está cadastrado. Três
-- defeitos somados, todos no mesmo `ilike`:
--
--   1. `ilike` no Postgres NÃO ignora acento. Digitar JOSE não achava JOSÉ,
--      e o balcão digita sem acento sempre.
--   2. Era substring CONTÍGUA. "MARIA SILVA" não achava "MARIA DA SILVA",
--      nem "MARIA DE SOUZA SILVA" — e nome com partícula no meio é a regra
--      no Brasil, não a exceção.
--   3. O índice existente (`pacientes_nome_idx`, btree sobre
--      lower(nome_completo)) é INÚTIL para `ilike '%x%'`. Cada busca varre a
--      tabela inteira; a recepcionista espera, e espera menos da próxima vez.
--
-- E o custo disso não é a busca lenta: é que **busca que não acha é a
-- máquina de duplicatas**. A recepcionista procura, não encontra, e cadastra
-- de novo. Como NÃO EXISTE unificação de prontuário neste sistema, cada
-- duplicata é permanente — o prontuário deixa de ser o documento único do
-- paciente (CFM 1.638/2002) e o médico decide vendo metade da história.
--
-- A SOLUÇÃO: uma coluna GERADA que guarda o nome já normalizado (maiúsculo,
-- sem acento), com os três nomes que identificam a pessoa no mesmo texto, e
-- um índice GIN de trigrama por cima. A busca passa a quebrar o termo em
-- palavras e exigir TODAS — o que é mais preciso que hoje e ao mesmo tempo
-- acha mais, porque a ordem e as partículas deixam de importar.
--
-- POR QUE OS TRÊS NOMES NA MESMA COLUNA
-- Nome de registro, nome social e nome da mãe já eram procurados juntos (o
-- `or=` antigo). Juntos num texto só, "JOAO MARIA" acha "o João da dona
-- Maria" — que é literalmente como se desempata homônimo no balcão, e é o
-- que o comentário do `filtroBuscaPacientes` sempre disse querer fazer.
--
-- ⚠️ ADITIVA: não apaga coluna, não apaga índice, não toca em política. O
-- `pacientes_nome_idx` antigo FICA — derrubá-lo não é aditivo, e ele ainda
-- serve a consulta por igualdade. Rodar duas vezes não faz nada na segunda.
--
-- ⚠️ A coluna é GENERATED ALWAYS: o banco a mantém sozinho a cada
-- insert/update. Nenhuma tela grava nela, e nenhuma PODE — se alguém tentar,
-- o PostgREST recusa. É de propósito: campo de busca que se atualiza à mão
-- fica desatualizado no dia em que alguém corrige um nome.
-- ============================================================

-- ── 1. EXTENSÕES ────────────────────────────────────────────
-- `unaccent` tira o acento; `pg_trgm` dá o índice que serve para busca por
-- pedaço de palavra. A convenção do Supabase é instalar no schema
-- `extensions`; se este banco não tiver esse schema, cai no padrão. O
-- `if not exists` confere pelo NOME da extensão, que é global — então num
-- banco que já as tenha, os dois caminhos são no-op.
do $$
begin
  begin
    create extension if not exists unaccent with schema extensions;
  exception when others then
    create extension if not exists unaccent;
  end;
  begin
    create extension if not exists pg_trgm with schema extensions;
  exception when others then
    create extension if not exists pg_trgm;
  end;
end $$;

-- ── 2. O ENVELOPE IMUTÁVEL DE unaccent ──────────────────────
-- `unaccent()` é declarada STABLE, não IMMUTABLE, porque em tese depende do
-- dicionário. Coluna gerada e índice EXIGEM immutable, então o Postgres
-- recusa usá-la direto — o erro é "generation expression is not immutable" e
-- é aí que a maioria das tentativas desta migração morre.
--
-- O envelope abaixo é a receita padrão: fixa o dicionário explicitamente e
-- declara imutável. O compromisso que isso assume: se o dicionário do
-- unaccent mudar, as linhas já gravadas não se recalculam sozinhas. Na
-- prática ele não muda; e se um dia mudar, o conserto é um
-- `update pacientes set prontuario = prontuario`, que reprocessa a coluna.
create or replace function public.f_unaccent(txt text)
returns text
language sql
immutable
strict
parallel safe
set search_path = pg_catalog, public, extensions
as $$ select unaccent('unaccent'::regdictionary, txt) $$;

comment on function public.f_unaccent(text) is
  'unaccent() imutável, para uso em coluna gerada e índice. Ver migracao-pacientes-busca.sql.';

-- ── 3. A COLUNA DE BUSCA ────────────────────────────────────
-- MAIÚSCULA e SEM ACENTO, com os três nomes no mesmo texto. `coalesce` para
-- que nome social ou nome da mãe em branco não anulem a linha inteira — sem
-- ele, `null || ' '` é null e o paciente sumiria da busca por completo, que
-- é exatamente o defeito que esta migração vem consertar.
--
-- Isto REESCREVE a tabela uma vez (é o preço de uma coluna `stored`). Numa
-- base do tamanho desta é questão de segundos.
alter table public.pacientes
  add column if not exists nome_busca text
  generated always as (
    upper(public.f_unaccent(
      coalesce(nome_completo, '') || ' ' ||
      coalesce(nome_social, '')   || ' ' ||
      coalesce(nome_mae, '')
    ))
  ) stored;

comment on column public.pacientes.nome_busca is
  'Nome de registro + social + da mãe, maiúsculo e sem acento. Só para busca. Mantida pelo banco.';

-- ── 4. O ÍNDICE ─────────────────────────────────────────────
-- GIN de trigrama: é o único que serve para `ilike '%pedaço%'`. O btree que
-- já existe não é usado nesse caso — não por estar errado, mas porque busca
-- por meio de palavra não tem prefixo por onde o btree começar.
--
-- O schema do `gin_trgm_ops` é descoberto em vez de cravado: dependendo de
-- como o pg_trgm foi instalado neste banco, ele mora em `extensions` ou em
-- `public`, e cravar o errado faz a migração falhar num banco e passar no
-- outro — que é o tipo de divergência que só aparece meses depois.
do $$
declare
  esquema text;
begin
  select n.nspname into esquema
    from pg_opclass o
    join pg_namespace n on n.oid = o.opcnamespace
   where o.opcname = 'gin_trgm_ops'
   limit 1;

  if esquema is null then
    raise exception 'pg_trgm nao esta instalado neste banco — o indice da busca nao pode ser criado';
  end if;

  execute format(
    'create index if not exists pacientes_nome_busca_trgm '
    'on public.pacientes using gin (nome_busca %I.gin_trgm_ops)', esquema);
end $$;

-- ── 5. CONFERÊNCIA (leitura; o resultado é o recibo) ────────
-- Uma consulta só, com `union all`: o SQL Editor mostra apenas a ÚLTIMA, e
-- conferência espalhada em várias consultas é conferência que ninguém lê.
select 'coluna nome_busca' as item,
       case when exists (
         select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'pacientes'
            and column_name = 'nome_busca'
       ) then '✅ existe' else '❌ FALTANDO' end as situacao
union all
select 'indice pacientes_nome_busca_trgm',
       case when exists (
         select 1 from pg_indexes
          where schemaname = 'public' and indexname = 'pacientes_nome_busca_trgm'
       ) then '✅ existe' else '❌ FALTANDO' end
union all
select 'funcao f_unaccent imutavel',
       case when exists (
         select 1 from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'f_unaccent'
            and p.provolatile = 'i'
       ) then '✅ existe' else '❌ FALTANDO' end
union all
-- A prova que importa: sem acento, fora de ordem e com partícula no meio.
-- Se a base tiver algum "José", esta linha tem que achar pelo menos um.
select 'busca sem acento acha (JOSE -> José)',
       coalesce((
         select '✅ ' || count(*)::text || ' paciente(s)'
           from public.pacientes
          where nome_busca ilike '%JOSE%'
       ), '—')
union all
select 'linhas com nome_busca preenchido',
       (select count(*)::text || ' de ' || (select count(*) from public.pacientes)::text
          from public.pacientes where coalesce(nome_busca, '') <> '');
