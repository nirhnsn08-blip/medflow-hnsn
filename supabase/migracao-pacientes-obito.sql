-- ============================================================
-- Valentrax — O ÓBITO CHEGA AO CADASTRO
--
-- POR QUE ESTA MIGRAÇÃO EXISTE
-- `pacientes.obito` é lido em CINCO lugares do código e escrito em NENHUM.
-- A coluna nasce `false` e morre `false`:
--
--   • a Recepção avisa "o cadastro está marcado como óbito" — nunca avisa;
--   • a Agenda RECUSA marcar consulta para falecido — nunca recusa;
--   • duas telas mostram "óbito registrado" — nunca mostram;
--   • o motivo de falta "Resolveu em outro serviço / óbito" não tem para
--     onde levar.
--
-- A CONSEQUÊNCIA SAI DO HOSPITAL. A confirmação da véspera liga para o
-- telefone do cadastro. Um paciente que faleceu NO PRÓPRIO HOSPITAL continua
-- na agenda, continua sendo confirmado, e quem atende o telefone é a
-- família. É o único defeito deste módulo cujo dano não fica dentro do
-- prédio — e o dado para evitá-lo já está gravado em dois lugares.
--
-- POR QUE TRIGGER, E NÃO CÓDIGO NA TELA
-- O óbito é registrado em TRÊS caminhos diferentes: o desfecho do
-- Pronto-Socorro e a saída do leito (os dois em `App.jsx`) e o encerramento
-- ambulatorial (em `dados.js`). Carimbar o cadastro em cada um deles são
-- três lugares para lembrar — e um quarto no dia em que alguém acrescentar
-- outro caminho. O que este trigger faz não é REGRA de negócio escondida no
-- banco: é uma DERIVAÇÃO de um fato já gravado, e derivação que depende de
-- quem chamou é derivação que um dia falta.
--
-- O TRIGGER SÓ CARIMBA. NUNCA APAGA.
-- Desmarcar tem que ser ato deliberado de gente, porque o erro tem dois
-- lados e eles não custam igual:
--
--   carimbar por engano  → a Agenda recusa marcar consulta para alguém vivo,
--                          e a tela DIZ que é isso (a mensagem existe);
--   apagar por engano    → o hospital volta a ligar para a família.
--
-- Se o desfecho for corrigido de "óbito" para "alta", o carimbo NÃO cai
-- sozinho: cair sozinho apagaria também o óbito verdadeiro de quem tem mais
-- de uma passagem. Some com uma mão humana, que sabe qual é qual.
--
-- ⚠️ ADITIVA nas colunas. O backfill MARCA cadastros que hoje estão em
-- branco — é o efeito pretendido, e ele é o motivo desta migração existir.
-- Nenhum cadastro é desmarcado por ela.
--
-- COMO DESFAZER:
--   drop trigger if exists trg_obito_ps on public.ps_atendimentos;
--   drop trigger if exists trg_obito_leito on public.leitos_saidas;
--   drop function if exists public.carimbar_obito_ps();
--   drop function if exists public.carimbar_obito_leito();
--   alter table public.pacientes drop column if exists obito_origem;
--   -- (o `obito` já marcado NÃO se desfaz em massa: é dado clínico real)
-- ============================================================

-- ── 1. DE ONDE VEIO O ÓBITO ─────────────────────────────────
-- Sem isto, o cadastro afirma "esta pessoa morreu" e não sabe dizer por quê.
-- A Agenda manda "corrija o cadastro antes de marcar" — e sem a origem
-- ninguém sabe ONDE corrigir, porque o carimbo é derivado: quem conserta o
-- cadastro sem consertar a fonte vê o carimbo voltar.
alter table public.pacientes
  add column if not exists obito_origem text;


-- ── 2. O CARIMBO, VINDO DO PRONTO-SOCORRO ───────────────────
create or replace function public.carimbar_obito_ps()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.prontuario is null then return new; end if;
  if coalesce(lower(btrim(new.desfecho)), '') <> 'obito' then return new; end if;

  update public.pacientes p
     set obito = true,
         -- `coalesce`: episódio encerrado sem carimbo de hora ainda usa o
         -- dia de hoje em vez de gravar nulo numa coluna que existe para
         -- responder "quando".
         obito_em = coalesce(obito_em, (coalesce(new.desfecho_em, now()))::date),
         obito_origem = coalesce(obito_origem, 'Atendimento #' || new.id::text),
         updated_at = now()
   where p.prontuario = new.prontuario
     -- Só quem ainda não está marcado: rodar duas vezes não reescreve a
     -- data do primeiro registro por cima com a do segundo.
     and coalesce(p.obito, false) = false;

  return new;
end $$;

drop trigger if exists trg_obito_ps on public.ps_atendimentos;
create trigger trg_obito_ps
  after insert or update of desfecho on public.ps_atendimentos
  for each row execute function public.carimbar_obito_ps();


-- ── 3. O CARIMBO, VINDO DA SAÍDA DO LEITO ───────────────────
create or replace function public.carimbar_obito_leito()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.prontuario is null then return new; end if;
  if coalesce(lower(btrim(new.desfecho)), '') <> 'obito' then return new; end if;

  update public.pacientes p
     set obito = true,
         obito_em = coalesce(obito_em, coalesce(new.data_alta, current_date)),
         obito_origem = coalesce(obito_origem, 'Saída de leito — ' || coalesce(new.setor, 'setor não informado')),
         updated_at = now()
   where p.prontuario = new.prontuario
     and coalesce(p.obito, false) = false;

  return new;
end $$;

drop trigger if exists trg_obito_leito on public.leitos_saidas;
create trigger trg_obito_leito
  after insert or update of desfecho on public.leitos_saidas
  for each row execute function public.carimbar_obito_leito();


-- ── 4. OS ÓBITOS QUE JÁ ESTÃO GRAVADOS ──────────────────────
-- O trigger vale daqui para a frente. Estes são os que o hospital já
-- registrou e o cadastro nunca soube — e são exatamente os pacientes que
-- estão na agenda hoje esperando um telefonema.
--
-- O PS primeiro; a saída de leito depois só alcança quem sobrar, pela mesma
-- razão do `coalesce` do trigger: a primeira data registrada é a que fica.
update public.pacientes p
   set obito = true,
       obito_em = coalesce(p.obito_em, a.quando),
       obito_origem = coalesce(p.obito_origem, 'Atendimento #' || a.id::text),
       updated_at = now()
  from (
    select distinct on (prontuario)
           prontuario, id, coalesce(desfecho_em, chegada_em, now())::date as quando
      from public.ps_atendimentos
     where lower(btrim(coalesce(desfecho, ''))) = 'obito'
       and prontuario is not null
     order by prontuario, desfecho_em asc nulls last
  ) a
 where p.prontuario = a.prontuario
   and coalesce(p.obito, false) = false;

update public.pacientes p
   set obito = true,
       obito_em = coalesce(p.obito_em, s.quando),
       obito_origem = coalesce(p.obito_origem, 'Saída de leito — ' || coalesce(s.setor, 'setor não informado')),
       updated_at = now()
  from (
    select distinct on (prontuario)
           prontuario, setor, coalesce(data_alta, current_date) as quando
      from public.leitos_saidas
     where lower(btrim(coalesce(desfecho, ''))) = 'obito'
       and prontuario is not null
     order by prontuario, data_alta asc nulls last
  ) s
 where p.prontuario = s.prontuario
   and coalesce(p.obito, false) = false;


-- ── 5. CONFERÊNCIA (leitura; o resultado é o recibo) ────────
select 'coluna obito_origem' as item,
       case when exists (
         select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'pacientes'
            and column_name = 'obito_origem'
       ) then '✅ existe' else '❌ NAO' end as situacao

union all
select 'os dois triggers (esperado 2)',
       count(*)::text
  from pg_trigger
 where tgname in ('trg_obito_ps', 'trg_obito_leito')
   and not tgisinternal

union all
select 'pacientes marcados com obito AGORA',
       count(*)::text
  from public.pacientes
 where coalesce(obito, false) = true

union all
-- Se esta linha vier maior que zero, o backfill deixou alguém para trás e a
-- confirmação da véspera ainda pode ligar para a família dessa pessoa.
select 'obitos registrados que o cadastro AINDA nao sabe',
       count(*)::text
  from (
    select prontuario from public.ps_atendimentos
     where lower(btrim(coalesce(desfecho, ''))) = 'obito' and prontuario is not null
    union
    select prontuario from public.leitos_saidas
     where lower(btrim(coalesce(desfecho, ''))) = 'obito' and prontuario is not null
  ) fontes
  join public.pacientes p using (prontuario)
 where coalesce(p.obito, false) = false

union all
-- O que este número mostra é o tamanho do problema que estava invisível.
select 'destes, quantos tinham consulta MARCADA a partir de hoje',
       count(distinct g.prontuario)::text
  from public.ag_agendamentos g
  join public.pacientes p on p.prontuario = g.prontuario
 where coalesce(p.obito, false) = true
   and g.status in ('agendado', 'confirmado')
   and g.data >= current_date;
