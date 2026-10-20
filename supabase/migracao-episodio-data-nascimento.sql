-- ═══════════════════════════════════════════════════════════
-- A IDADE CHEGA AO EPISÓDIO — e a farmácia para de ler o cadastro
--
-- 🔴 O DEFEITO QUE ISTO CONSERTA É CLÍNICO, não de tela.
--
-- A farmácia lê `pacientes?select=prontuario,data_nascimento` para UMA
-- coisa: a idade, que aciona dose pediátrica e os critérios de Beers. Mas
-- `pacientes` é lida por atendimento / ambulatorio / ps / paciente — e NÃO
-- pela farmácia. Para o perfil `aux_farmacia` a consulta volta `[]` com
-- 200, a idade fica nula, e as duas regras NÃO DISPARAM.
--
-- ⚠️ É EXATAMENTE O DEFEITO QUE `prontuario/contexto-internado.js` FOI
-- ESCRITO PARA CONSERTAR — está no cabeçalho dele: "alertas à mão, em DOIS
-- lugares, e os dois escreviam `idade: null` (…) as regras de criança e de
-- idoso nunca disparavam". Voltou por outra porta: a permissão.
--
-- 💡 POR QUE NÃO ABRIR `pacientes` PARA A FARMÁCIA
--
-- RLS é por LINHA. Abrir a tabela entregaria nome, CPF, CNS, nome da mãe e
-- endereço para buscar UM campo. A decisão de manter o cadastro fechado à
-- farmácia é antiga e deliberada, e tem teste guardando.
--
-- Então a data vem para onde a farmácia JÁ LÊ. Depois disto a consulta a
-- `pacientes` SOME do código da farmácia — é menos acesso, não mais.
--
-- ═══════════════════════════════════════════════════════════
-- 🔴 POR QUE GATILHO, E NÃO CAMPO PREENCHIDO PELO APP
--
-- `abrirEpisodio` é chamado do Giro de Leitos. E o módulo `leitos` NÃO LÊ
-- `pacientes`. Se a data viesse pelo app, ela chegaria nula justamente
-- para quem abre o episódio — o mesmo buraco, pela mesma porta.
--
-- Por isso `security definer`: o gatilho lê o cadastro por baixo da RLS,
-- copia UM campo, e não depende de quem está logado. Uma função que
-- copiasse mais que isso seria porta dos fundos; esta copia uma data.
-- ═══════════════════════════════════════════════════════════
--
-- ADITIVA. IDEMPOTENTE.
--
-- COMO DESFAZER:
--   drop trigger if exists trg_epis_nascimento on public.pep_episodios;
--   drop trigger if exists trg_pac_nascimento_propaga on public.pacientes;
--   drop function if exists public.epis_data_nascimento();
--   drop function if exists public.pac_propaga_nascimento();
--   alter table public.pep_episodios drop column if exists data_nascimento;
-- ═══════════════════════════════════════════════════════════

set valentrax.quem = 'adauam';


-- Mesma redundância proposital de `iniciais`, e pelo mesmo motivo: a lista
-- do episódio não pode depender de um join com uma tabela que o módulo da
-- tela não tem permissão de ler.
alter table public.pep_episodios
  add column if not exists data_nascimento date;

comment on column public.pep_episodios.data_nascimento is
  'Cópia da data de nascimento do cadastro, mantida pelo gatilho. Existe para que a idade — que aciona dose pediátrica e Beers — chegue a quem lê o episódio sem precisar abrir a tabela de identificação do paciente.';


-- ═══════════════════════════════════════════════════════════
-- 1) O GATILHO DO EPISÓDIO
--
-- Preenche quando vier nulo. Não sobrescreve valor que o chamador tenha
-- passado de propósito: episódio histórico importado traz a data dele.
-- ═══════════════════════════════════════════════════════════
create or replace function public.epis_data_nascimento()
returns trigger
language plpgsql
security definer                -- ⚠️ ver o cabeçalho: `leitos` não lê `pacientes`
set search_path = public
as $ed$
begin
  if new.data_nascimento is null and new.prontuario is not null then
    select p.data_nascimento into new.data_nascimento
      from public.pacientes p
     where p.prontuario = new.prontuario;
  end if;
  return new;
end;
$ed$;

drop trigger if exists trg_epis_nascimento on public.pep_episodios;
create trigger trg_epis_nascimento
  before insert on public.pep_episodios
  for each row execute function public.epis_data_nascimento();


-- ═══════════════════════════════════════════════════════════
-- 2) CORREÇÃO DA DATA PRECISA CHEGAR AO ALERTA
--
-- 🔴 Data de nascimento não muda, mas ERRO DE DIGITAÇÃO na admissão muda —
-- e é o caso que importa: 2019 digitado como 1019 faz o paciente ter mil
-- anos, e a regra do idoso dispara em criança (ou o contrário).
--
-- Sem esta propagação a cópia congelaria o erro no episódio, e a correção
-- feita no cadastro não teria efeito nenhum sobre a prescrição em curso.
--
-- ⚠️ SÓ EPISÓDIO ABERTO. Episódio encerrado é registro do que valia na
-- época; reescrevê-lo seria mexer em prontuário fechado.
-- ═══════════════════════════════════════════════════════════
create or replace function public.pac_propaga_nascimento()
returns trigger
language plpgsql
security definer
set search_path = public
as $pp$
begin
  if new.data_nascimento is distinct from old.data_nascimento then
    update public.pep_episodios e
       set data_nascimento = new.data_nascimento
     where e.prontuario = new.prontuario
       and e.alta_em is null;
  end if;
  return new;
end;
$pp$;

drop trigger if exists trg_pac_nascimento_propaga on public.pacientes;
create trigger trg_pac_nascimento_propaga
  after update of data_nascimento on public.pacientes
  for each row execute function public.pac_propaga_nascimento();


-- ═══════════════════════════════════════════════════════════
-- 3) BACKFILL — os episódios que já existem
--
-- Sem isto, a farmácia continuaria sem idade para todo mundo que já está
-- internado hoje, que é justamente quem tem prescrição em curso.
-- ═══════════════════════════════════════════════════════════
update public.pep_episodios e
   set data_nascimento = p.data_nascimento
  from public.pacientes p
 where p.prontuario = e.prontuario
   and e.data_nascimento is null
   and p.data_nascimento is not null;


insert into public.migracoes_aplicadas (arquivo)
values ('migracao-episodio-data-nascimento.sql') on conflict do nothing;

reset valentrax.quem;

notify pgrst, 'reload schema';


-- ───────────────────────────────────────────────────────────
-- CONFERÊNCIA
-- ───────────────────────────────────────────────────────────
select item, case when ok then '✅' else '❌' end as situacao from (
  select 'coluna data_nascimento no episódio' as item,
         exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'pep_episodios'
                    and column_name = 'data_nascimento') as ok
  union all
  select '🔴 gatilho que preenche no insert',
         exists (select 1 from pg_trigger where tgname = 'trg_epis_nascimento')
  union all
  select '🔴 gatilho que propaga correção da data',
         exists (select 1 from pg_trigger where tgname = 'trg_pac_nascimento_propaga')
  union all
  select 'migração anotada no registro',
         exists (select 1 from public.migracoes_aplicadas
                  where arquivo = 'migracao-episodio-data-nascimento.sql')
) x;

-- 🔴 QUANTOS EPISÓDIOS ABERTOS FICARAM SEM IDADE.
--
-- Não é erro se houver: paciente sem data no cadastro continua sem idade,
-- e a farmácia vai dizer que não sabe em vez de inventar. Mas o número
-- vale olhar — se for alto, o cadastro é que está incompleto, e aí o
-- alerta de Beers está desligado por falta de dado, não por permissão.
select count(*) filter (where data_nascimento is null) as abertos_sem_idade,
       count(*)                                        as abertos_no_total
  from public.pep_episodios
 where alta_em is null;
