-- ═══════════════════════════════════════════════════════════
-- FATURAMENTO — A GLOSA RECEBIDA E O RECURSO
--
-- Já existe a glosa PREVENTIVA: `avaliarGlosa` (src/atendimento/sigtap.js)
-- olha a conta ANTES de sair e avisa o que provavelmente será cortado.
-- Esta migração é o outro lado, o que dói: o dinheiro que o SUS ou a
-- operadora JÁ recusou, e o recurso que pode trazê-lo de volta.
--
-- 🔴 O PRAZO É O PRODUTO INTEIRO.
-- Glosa sem recurso no prazo não vira prejuízo depois — ela JÁ É prejuízo,
-- e silencioso: ninguém recebe aviso, nada fica vermelho, o dinheiro
-- simplesmente não entra. Por isso `recebida_em` é NOT NULL (é o relógio
-- que começa a correr) e o índice de trabalho é por prazo, não por data de
-- cadastro.
--
-- ⚠️ `prazo_recurso_em` NASCE NULO E NÃO É CALCULADO.
-- Foi decisão, não esquecimento. O prazo muda por operadora, por contrato e
-- por portaria; cravar "30 dias" no banco criaria uma data com cara de
-- oficial que ninguém conferiu — e o erro apareceria como prazo VENCIDO em
-- glosa que ainda dava tempo, ou pior, como prazo ABERTO em glosa perdida.
-- Quem sabe o prazo é quem tem o contrato na mão. A tela pede, e diz
-- "prazo não informado" enquanto não vier; ela não inventa.
--
-- DINHEIRO EM numeric(12,2), nunca float — mesma regra da conta.
--
-- ⚠️ RODAR NO SQL EDITOR ANTES DO MERGE DO CÓDIGO.
--    Aditiva e idempotente: cria UMA tabela nova e não toca em nenhuma
--    existente. DEMO primeiro (ufxqdvxhruaswuzhmxyf), depois o principal.
--    Rodar `migracao-rls-leitura.sql` DEPOIS, no mesmo banco — tabela nova
--    sem política nasce com RLS ligada e sem regra, e o sintoma não é erro,
--    é TELA VAZIA.
-- ═══════════════════════════════════════════════════════════

set valentrax.quem = 'adauam';


-- ═══════════════════════════════════════════════════════════
-- A GLOSA
--
-- `item_id` é opcional de propósito: a operadora glosa às vezes um item
-- ("material não autorizado"), às vezes a conta inteira ("guia sem
-- autorização"). Obrigar o item faria a segunda virar uma linha falsa
-- apontando para um item qualquer.
--
-- `valor_recuperado` nasce nulo, e nulo NÃO é zero: nulo é "o recurso ainda
-- não terminou"; zero é "recorremos e não voltou nada". A diferença é o que
-- separa trabalho em andamento de derrota registrada, e é ela que faz a
-- taxa de recuperação significar alguma coisa.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.at_glosas (
  id                 bigserial primary key,
  conta_id           bigint not null references public.at_contas (id),
  -- nulo = a glosa é da conta inteira, não de um item
  item_id            bigint references public.at_conta_itens (id),
  prontuario         text,
  -- competência do faturamento glosado (AAAA-MM), não a do recebimento
  competencia        text,

  valor_glosado      numeric(12,2) not null,
  -- código do motivo como veio da operadora/SUS, sem tradução
  motivo_codigo      text,
  motivo             text,

  -- 🔴 o relógio começa aqui
  recebida_em        date not null,
  -- nulo = ninguém informou ainda; NÃO é calculado (ver cabeçalho)
  prazo_recurso_em   date,

  -- recebida | em_recurso | recurso_enviado | recuperada | perdida | aceita
  situacao           text not null default 'recebida',
  recurso_enviado_em date,
  recurso_protocolo  text,
  -- nulo = recurso não terminou; 0 = recorreu e não voltou nada
  valor_recuperado   numeric(12,2),
  encerrada_em       date,

  observacao         text,
  usuario            text,
  criado_em          timestamptz not null default now(),
  updated_at         timestamptz default now()
);


-- ═══════════════════════════════════════════════════════════
-- AS REGRAS QUE VIRAM CONSTRAINT
--
-- Todas cabem no banco porque nenhuma depende de contexto de tela — e
-- validação de tela não sobrevive a um import de planilha, que é
-- exatamente como glosa costuma chegar (arquivo de retorno da operadora).
-- ═══════════════════════════════════════════════════════════

-- Glosa de zero não existe: ou não houve glosa, ou alguém errou a digitação.
alter table public.at_glosas drop constraint if exists at_glosa_valor_positivo;
alter table public.at_glosas add constraint at_glosa_valor_positivo
  check (valor_glosado > 0);

-- 🔴 Não se recupera mais do que foi glosado. Sem isto, um erro de digitação
-- vira receita inventada no relatório — e receita inventada some do caixa
-- na conferência do contador, meses depois, sem ninguém saber de onde veio.
alter table public.at_glosas drop constraint if exists at_glosa_recuperado_ate_glosado;
alter table public.at_glosas add constraint at_glosa_recuperado_ate_glosado
  check (valor_recuperado is null
         or (valor_recuperado >= 0 and valor_recuperado <= valor_glosado));

-- Prazo antes do recebimento é data trocada na digitação, e o estrago é
-- silencioso: a glosa nasceria VENCIDA e sairia da fila de trabalho.
alter table public.at_glosas drop constraint if exists at_glosa_prazo_depois_do_recebimento;
alter table public.at_glosas add constraint at_glosa_prazo_depois_do_recebimento
  check (prazo_recurso_em is null or prazo_recurso_em >= recebida_em);

-- Recurso enviado antes de a glosa chegar, idem.
alter table public.at_glosas drop constraint if exists at_glosa_recurso_depois_do_recebimento;
alter table public.at_glosas add constraint at_glosa_recurso_depois_do_recebimento
  check (recurso_enviado_em is null or recurso_enviado_em >= recebida_em);

-- Situação fora da lista é dado que nenhuma tela sabe desenhar.
alter table public.at_glosas drop constraint if exists at_glosa_situacao_valida;
alter table public.at_glosas add constraint at_glosa_situacao_valida
  check (situacao in ('recebida','em_recurso','recurso_enviado','recuperada','perdida','aceita'));


-- ═══════════════════════════════════════════════════════════
-- OS ÍNDICES
--
-- O primeiro é a FILA DE TRABALHO: glosa em aberto, do prazo mais curto
-- para o mais longo. É a consulta que a tela faz o dia inteiro, e a única
-- que tem hora para acontecer.
-- ═══════════════════════════════════════════════════════════
create index if not exists at_glosas_fila_prazo_idx
  on public.at_glosas (prazo_recurso_em)
  where situacao in ('recebida','em_recurso');

create index if not exists at_glosas_conta_idx      on public.at_glosas (conta_id);
create index if not exists at_glosas_competencia_idx on public.at_glosas (competencia, situacao);


-- ═══════════════════════════════════════════════════════════
-- CONFERÊNCIA — leia a saída, não confie no "Success"
--
-- O SQL Editor mostra só o resultado da ÚLTIMA instrução, por isso tudo em
-- um `union all` só. A contagem de pacientes diz QUAL BANCO é este: as duas
-- abas se chamam igual e já trocamos de banco sem perceber.
-- ═══════════════════════════════════════════════════════════
select 'QUAL BANCO É ESTE?' as item,
       case when (select count(*) from public.pacientes) >= 40
            then 'DEMO — ' || (select count(*) from public.pacientes) || ' pacientes'
            else 'PRINCIPAL — ' || (select count(*) from public.pacientes) || ' pacientes'
       end as resultado

union all
select 'tabela at_glosas existe', count(*)::text
  from information_schema.tables
 where table_schema = 'public' and table_name = 'at_glosas'

union all
select 'constraints (esperado 5)', count(*)::text
  from pg_constraint
 where conrelid = 'public.at_glosas'::regclass
   and conname like 'at_glosa_%'

union all
select 'indices (esperado 3)', count(*)::text
  from pg_indexes
 where schemaname = 'public' and indexname like 'at_glosas_%'

union all
select '⚠️ politicas RLS (0 = FALTA RODAR migracao-rls-leitura.sql)', count(*)::text
  from pg_policies
 where schemaname = 'public' and tablename = 'at_glosas';


insert into public.migracoes_aplicadas (arquivo)
values ('migracao-faturamento-glosas.sql') on conflict do nothing;
