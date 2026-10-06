-- ═══════════════════════════════════════════════════════════
-- CORRIGIR O DESFECHO — por registro novo, nunca por edição
--
-- 🔴 O QUE ESTÁ ERRADO HOJE
-- O desfecho da consulta é escolhido uma vez e PRONTO: ele não está em
-- `CAMPOS_CORRIGIVEIS` (src/atendimento/ciclo.js), de propósito, porque é
-- registro assistencial e registro assistencial não se edita. Só que a
-- consequência prática é que um engano — e até 06/10/2026 ele era um
-- número digitado num `prompt` — vira permanente. E é o desfecho que decide
-- se a consulta vira conta: "evadiu" no lugar de "atendido" apaga a
-- produção; o contrário cobra atendimento que não houve.
--
-- 💡 A SAÍDA é a mesma do resto do sistema: corrigir é GRAVAR OUTRA LINHA.
-- A tabela abaixo é append-only e guarda de → para, motivo e autor. O
-- `ps_atendimentos.desfecho` continua sendo a verdade corrente (é o que o
-- faturamento e os indicadores leem), e o histórico de como se chegou nela
-- fica aqui. Quem corrigiu, quando e por quê deixam de depender da memória
-- de alguém.
--
-- 🔒 QUATRO RECUSAS, todas no BANCO e não na tela (tela não é defesa: um
-- PATCH pela API passa por cima dela):
--   1. motivo com menos de 15 caracteres — "erro" não explica nada a quem
--      ler isso daqui a um ano, que é exatamente quando se lê;
--   2. `de` que não bate com o desfecho ATUAL — é a corrida entre duas
--      pessoas corrigindo a mesma consulta; a segunda tem que reler;
--   3. conta já FECHADA ou FATURADA — corrigir o desfecho embaixo de uma
--      conta transmitida cria divergência com o que foi enviado ao SUS;
--      primeiro se cancela a conta, depois se corrige;
--   4. desfecho atual `obito` — o óbito CARIMBA o cadastro do paciente
--      (`trg_obito_ps` → `pacientes.obito`), e esse carimbo não se desfaz
--      aqui. Desfazer óbito é outro ato, com outra responsabilidade.
--      Corrigir PARA óbito é permitido: aí o carimbo deve mesmo acontecer.
--
-- ADITIVA: nenhuma coluna existente muda, nada é apagado.
-- IDEMPOTENTE: pode rodar duas vezes.
--
-- COMO DESFAZER:
--   drop trigger if exists trg_at_corrige_desfecho on public.at_desfecho_correcoes;
--   drop function if exists public.at_aplica_correcao_desfecho();
--   drop table if exists public.at_desfecho_correcoes;
-- ═══════════════════════════════════════════════════════════

set valentrax.quem = 'adauam';


-- ───────────────────────────────────────────────────────────
-- 1. A TRILHA
-- ───────────────────────────────────────────────────────────
create table if not exists public.at_desfecho_correcoes (
  id bigserial primary key,
  atendimento_id bigint not null references public.ps_atendimentos (id) on delete cascade,
  -- O que estava gravado ANTES. Guardado aqui porque `ps_atendimentos`
  -- passa a ter o valor novo — sem esta coluna, a correção diria para onde
  -- foi e não de onde veio, que é metade da informação.
  de text,
  para text not null,
  motivo text not null,
  usuario text,
  criado_em timestamptz not null default now(),
  constraint at_desf_corr_mudou_ck check (coalesce(de, '') <> coalesce(para, '')),
  constraint at_desf_corr_motivo_ck check (length(btrim(motivo)) >= 15)
);

create index if not exists at_desf_corr_atend_idx
  on public.at_desfecho_correcoes (atendimento_id, criado_em desc);

comment on table public.at_desfecho_correcoes is
  'Correções de desfecho do atendimento. Append-only: a linha registra de → para, motivo e autor; o valor corrente fica em ps_atendimentos.desfecho.';
comment on column public.at_desfecho_correcoes.de is
  'O desfecho que estava gravado antes desta correção. Conferido contra o valor atual pelo gatilho.';


-- ───────────────────────────────────────────────────────────
-- 2. O GATILHO QUE APLICA — e recusa o que não pode
--
-- Aplicar DENTRO do mesmo INSERT é o que impede a trilha e o valor corrente
-- divergirem: ou as duas coisas acontecem, ou nenhuma. Duas escritas
-- separadas pela tela deixariam a porta aberta para gravar a trilha e
-- falhar o update — e aí o histórico contaria uma correção que não houve.
-- ───────────────────────────────────────────────────────────
create or replace function public.at_aplica_correcao_desfecho()
returns trigger
language plpgsql
set search_path = public
as $at_corr$
declare
  atual        public.ps_atendimentos%rowtype;
  conta_presa  text;
begin
  select * into atual from public.ps_atendimentos where id = new.atendimento_id;
  if not found then
    raise exception 'Atendimento % não existe.', new.atendimento_id;
  end if;

  -- (2) o que a tela leu ainda vale?
  if coalesce(atual.desfecho, '') is distinct from coalesce(new.de, '') then
    raise exception
      'O desfecho deste atendimento é "%" e a correção partiu de "%". Alguém mudou enquanto esta tela estava aberta — releia antes de corrigir.',
      coalesce(atual.desfecho, '(sem desfecho)'), coalesce(new.de, '(sem desfecho)');
  end if;

  -- (4) óbito não se desfaz por aqui
  if lower(btrim(coalesce(atual.desfecho, ''))) = 'obito' then
    raise exception
      'Este atendimento está registrado como ÓBITO, e o óbito carimba o cadastro do paciente. Desfazer isso não é correção de desfecho — procure a direção técnica.';
  end if;

  -- (3) conta fechada ou faturada trava a correção
  select c.status into conta_presa
    from public.at_contas c
   where c.atendimento_id = new.atendimento_id
     and c.status in ('fechada', 'faturada')
   limit 1;
  if conta_presa is not null then
    raise exception
      'A conta deste atendimento já está %. Corrigir o desfecho agora deixaria a conta divergente do que foi enviado — cancele a conta primeiro.',
      conta_presa;
  end if;

  -- Aplica. `desfecho_em` NÃO é tocado de propósito: o atendimento terminou
  -- quando terminou; o que estava errado era a classificação, não a hora.
  update public.ps_atendimentos
     set desfecho = new.para,
         usuario = coalesce(new.usuario, usuario),
         updated_at = now()
   where id = new.atendimento_id;

  -- 🔴 O "204 MENTIROSO" TAMBÉM EXISTE AQUI. Se a RLS de `ps_atendimentos`
  -- recusar o UPDATE, ele altera ZERO linha sem erro nenhum — e a trilha
  -- registraria uma correção que não aconteceu. Confere e derruba tudo.
  if not found then
    raise exception
      'Não consegui aplicar a correção no atendimento % — seu perfil não edita este atendimento. Nada foi registrado.',
      new.atendimento_id;
  end if;

  return new;
end $at_corr$;

drop trigger if exists trg_at_corrige_desfecho on public.at_desfecho_correcoes;
create trigger trg_at_corrige_desfecho
  before insert on public.at_desfecho_correcoes
  for each row execute function public.at_aplica_correcao_desfecho();


-- ───────────────────────────────────────────────────────────
-- 3. QUEM PODE
--
-- Lê quem lê o atendimento; grava quem EDITA o atendimento. A correção é um
-- ato administrativo sobre registro assistencial — não exige categoria
-- clínica, mas exige o módulo e o papel de escrita.
--
-- Sem UPDATE e sem DELETE: a trilha é imutável. Correção de correção é
-- outra linha.
-- ───────────────────────────────────────────────────────────
alter table public.at_desfecho_correcoes enable row level security;

drop policy if exists at_desf_corr_leitura on public.at_desfecho_correcoes;
create policy at_desf_corr_leitura on public.at_desfecho_correcoes
  for select to authenticated
  using (public.pode_ver_algum('ps', 'atendimento', 'ambulatorio', 'paciente'));

drop policy if exists at_desf_corr_ins on public.at_desfecho_correcoes;
create policy at_desf_corr_ins on public.at_desfecho_correcoes
  for insert to authenticated
  with check (public.my_role() in ('adm_master', 'adm_silver'));

-- A mesma trava restritiva que o gerar-rls.mjs põe em toda tabela de módulo.
drop policy if exists at_desf_corr_mod_ins on public.at_desfecho_correcoes;
create policy at_desf_corr_mod_ins on public.at_desfecho_correcoes
  as restrictive for insert to authenticated
  with check (public.pode_editar_algum('ps', 'atendimento', 'ambulatorio'));


insert into public.migracoes_aplicadas (arquivo)
values ('migracao-correcao-desfecho.sql') on conflict do nothing;

reset valentrax.quem;

notify pgrst, 'reload schema';


-- ───────────────────────────────────────────────────────────
-- CONFERÊNCIA
-- ───────────────────────────────────────────────────────────
select item, case when ok then '✅' else '❌' end as situacao from (
  select 'tabela at_desfecho_correcoes existe' as item,
         to_regclass('public.at_desfecho_correcoes') is not null as ok
  union all
  select 'coluna ' || c,
         exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'at_desfecho_correcoes' and column_name = c)
    from unnest(array['atendimento_id','de','para','motivo','usuario','criado_em']) c
  union all
  select 'trava ' || k,
         exists (select 1 from pg_constraint where conname = k)
    from unnest(array['at_desf_corr_mudou_ck','at_desf_corr_motivo_ck']) k
  union all
  select 'gatilho que aplica a correção',
         exists (select 1 from pg_trigger where tgname = 'trg_at_corrige_desfecho')
  union all
  select 'política ' || p,
         exists (select 1 from pg_policies where tablename = 'at_desfecho_correcoes' and policyname = p)
    from unnest(array['at_desf_corr_leitura','at_desf_corr_ins','at_desf_corr_mod_ins']) p
  union all
  select 'trilha é imutável (sem update/delete)',
         not exists (select 1 from pg_policies
                      where tablename = 'at_desfecho_correcoes' and cmd in ('UPDATE', 'DELETE'))
  union all
  select 'migração anotada no registro',
         exists (select 1 from public.migracoes_aplicadas
                  where arquivo = 'migracao-correcao-desfecho.sql')
) x;
