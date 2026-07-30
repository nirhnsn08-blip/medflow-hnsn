-- ═══════════════════════════════════════════════════════════
-- FATURAMENTO — a conta do atendimento (fundação)
--
-- Transforma o que foi feito (procedimento, material, medicamento) na CONTA
-- do episódio, e registra por qual via ela sai: BPA, APAC, AIH, guia TISS
-- ou cobrança direta.
--
-- O QUE ESTA MIGRAÇÃO NÃO CRIA, E POR QUÊ
-- Nada de remessa. BPA-I/BPA-C, SISAIH01 e o XML do TISS têm layout
-- versionado, mudam por portaria e por versão da operadora, e passam por
-- homologação. Guardar "arquivo gerado" antes de existir gerador conferido
-- seria criar coluna para um dado que ninguém sabe produzir ainda.
--
-- ⚠️ A REGRA QUE VIRA CONSTRAINT: SUS NÃO COBRA DO PACIENTE.
-- Não é configuração, é lei — e o erro dela cai sobre o PACIENTE, não sobre
-- o hospital. Por isso o CHECK: item marcado para cobrança direta numa
-- conta cuja via é BPA, APAC ou AIH é recusado pelo banco, e não só pela
-- tela. Validação de tela não sobrevive a um import de planilha.
--
-- DINHEIRO EM numeric(12,2), nunca float. `double precision` não representa
-- 0,10 exatamente, e uma conta de trinta itens acumula diferença que
-- ninguém explica na conferência.
--
-- ⚠️ RODAR NO SQL EDITOR ANTES DO MERGE DO CÓDIGO.
--    Aditiva e idempotente: cria duas tabelas novas e acrescenta duas
--    colunas opcionais em `at_procedimentos`. Nenhuma constraint cobra de
--    linha que já esteja no ar. DEMO primeiro, depois o principal.
-- ═══════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════
-- 1) O PREÇO E A VIA MORAM NO CATÁLOGO
--
-- `via_sus` diz se o procedimento sai por BPA, APAC ou AIH. Está no
-- CADASTRO, e não em lista dentro do código, porque quais procedimentos são
-- APAC muda por portaria várias vezes por ano — cravar em JavaScript faria
-- cada atualização do SIGTAP virar um release.
--
-- `valor_sus` é o valor da tabela SIGTAP. Nasce nulo: nulo é "ninguém
-- cadastrou", que é diferente de zero ("de graça"). A tela imprime "—" para
-- o primeiro e R$ 0,00 para o segundo.
-- ═══════════════════════════════════════════════════════════
alter table public.at_procedimentos
  add column if not exists valor_sus numeric(12,2),
  add column if not exists via_sus text;


-- ═══════════════════════════════════════════════════════════
-- 2) A CONTA
--
-- Uma por atendimento — garantido por índice único PARCIAL, que ignora as
-- canceladas. É o que permite refaturar depois de uma glosa (cancela a
-- conta velha, abre outra) sem abrir a porta para duas contas vivas do
-- mesmo episódio, que é como o mesmo atendimento acaba transmitido duas
-- vezes.
--
-- `competencia` é o mês de referência ("2026-07"): é por ela que o
-- faturamento fecha e transmite, e não pela data da conta. Atendimento do
-- dia 31 lançado no dia 2 pertence à competência de quem foi atendido.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.at_contas (
  id             bigserial primary key,
  atendimento_id bigint not null references public.ps_atendimentos (id),
  prontuario     text,
  convenio_id    bigint references public.at_convenios (id),
  plano_id       bigint references public.at_planos (id),
  -- bpa | apac | aih | tiss | direta
  via            text,
  competencia    text,
  -- aberta | fechada | faturada | glosada | cancelada
  status         text not null default 'aberta',
  fechada_em     timestamptz,
  fechada_por    text,
  observacao     text,
  usuario        text,
  criado_em      timestamptz not null default now(),
  updated_at     timestamptz default now()
);

create unique index if not exists at_contas_atend_unica
  on public.at_contas (atendimento_id)
  where status <> 'cancelada';
create index if not exists at_contas_competencia_idx
  on public.at_contas (competencia, status);


-- ═══════════════════════════════════════════════════════════
-- 3) OS ITENS
--
-- `valor_unitario` E `valor_total` são gravados, e não calculados na
-- leitura: o preço da tabela muda, e a conta de março precisa continuar
-- contando a história de março. É a mesma razão pela qual o CBO do
-- profissional é congelado no atendimento.
--
-- `executante` e `executante_cbo` congelados pelo mesmo motivo — e porque
-- CBO incompatível com o procedimento é REJEIÇÃO no processamento, não
-- glosa: a produção nem entra.
--
-- `cancelado` em vez de delete: item lançado por engano e apagado sumiria
-- do rastro, e a diferença entre a conta de ontem e a de hoje ficaria sem
-- explicação.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.at_conta_itens (
  id                bigserial primary key,
  conta_id          bigint not null references public.at_contas (id) on delete cascade,
  -- procedimento | material | medicamento | diaria | taxa
  tipo              text not null default 'procedimento',
  codigo            text,
  descricao         text,
  quantidade        numeric(12,3) not null default 1,
  valor_unitario    numeric(12,2),
  valor_total       numeric(12,2),
  executante        text,
  executante_cbo    text,
  data_execucao     date,
  -- ⚠️ Só pode ser true quando a via cobra do paciente. Ver o CHECK abaixo.
  cobrar_do_paciente boolean not null default false,
  observacao        text,
  cancelado         boolean not null default false,
  usuario           text,
  criado_em         timestamptz not null default now(),
  updated_at        timestamptz default now()
);

create index if not exists at_conta_itens_conta_idx
  on public.at_conta_itens (conta_id, cancelado);


-- ═══════════════════════════════════════════════════════════
-- 4) OS CHECKS
--
-- O terceiro é o que importa de verdade: SUS não cobra do paciente. Ele
-- olha a via da CONTA, e não do item — por isso é uma função e não um
-- CHECK simples de coluna.
-- ═══════════════════════════════════════════════════════════
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'at_contas_status_valido') then
    alter table public.at_contas
      add constraint at_contas_status_valido
      check (status in ('aberta','fechada','faturada','glosada','cancelada'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'at_contas_via_valida') then
    alter table public.at_contas
      add constraint at_contas_via_valida
      check (via is null or via in ('bpa','apac','aih','tiss','direta'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'at_item_tipo_valido') then
    alter table public.at_conta_itens
      add constraint at_item_tipo_valido
      check (tipo in ('procedimento','material','medicamento','diaria','taxa'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'at_item_quantidade_positiva') then
    alter table public.at_conta_itens
      add constraint at_item_quantidade_positiva
      check (quantidade > 0);
  end if;
end $$;

-- A via da conta de um item. `stable` porque só lê; `security definer` NÃO,
-- de propósito: não há motivo para esta função enxergar mais do que quem a
-- chama.
create or replace function public.at_via_da_conta(p_conta_id bigint)
returns text language sql stable as $$
  select via from public.at_contas where id = p_conta_id
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'at_item_sus_nao_cobra_paciente') then
    alter table public.at_conta_itens
      add constraint at_item_sus_nao_cobra_paciente
      check (
        cobrar_do_paciente = false
        or coalesce(public.at_via_da_conta(conta_id), '') not in ('bpa','apac','aih')
      );
  end if;
end $$;


-- ═══════════════════════════════════════════════════════════
-- 5) RLS — mesmo padrão do resto do módulo
--
-- ⚠️ O `select using (true)` repete a política de todas as tabelas do
-- sistema, por COERÊNCIA e não por concordância — a decisão de fechar a
-- leitura por perfil continua pendente para antes do primeiro paciente
-- real. Estas duas tabelas ligam paciente a valor cobrado, que é dado
-- sensível de outra natureza: quando o RLS for endurecido, entram na
-- mesma leva.
-- ═══════════════════════════════════════════════════════════
alter table public.at_contas enable row level security;
drop policy if exists at_contas_select on public.at_contas;
drop policy if exists at_contas_write  on public.at_contas;
create policy at_contas_select on public.at_contas for select to authenticated using (true);
create policy at_contas_write on public.at_contas for all to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));

alter table public.at_conta_itens enable row level security;
drop policy if exists at_item_select on public.at_conta_itens;
drop policy if exists at_item_write  on public.at_conta_itens;
create policy at_item_select on public.at_conta_itens for select to authenticated using (true);
create policy at_item_write on public.at_conta_itens for all to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));


-- ═══════════════════════════════════════════════════════════
-- 6) CONFERÊNCIA
-- ═══════════════════════════════════════════════════════════
select 'tabelas criadas (esperado 2)' as item, count(*)::text as valor
  from information_schema.tables
 where table_schema = 'public' and table_name in ('at_contas','at_conta_itens')

union all
select 'colunas novas em at_procedimentos (esperado 2)', count(*)::text
  from information_schema.columns
 where table_schema = 'public' and table_name = 'at_procedimentos'
   and column_name in ('valor_sus','via_sus')

union all
select 'checks de protecao (esperado 5)', count(*)::text
  from pg_constraint
 where conname in ('at_contas_status_valido','at_contas_via_valida',
                   'at_item_tipo_valido','at_item_quantidade_positiva',
                   'at_item_sus_nao_cobra_paciente')

union all
select 'indice de conta unica por atendimento', count(*)::text
  from pg_indexes
 where schemaname = 'public' and indexname = 'at_contas_atend_unica'

union all
select 'politicas RLS (esperado 4)', count(*)::text
  from pg_policies
 where schemaname = 'public' and tablename in ('at_contas','at_conta_itens');
