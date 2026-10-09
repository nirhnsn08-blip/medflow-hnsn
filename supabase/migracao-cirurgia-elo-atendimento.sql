-- ═══════════════════════════════════════════════════════════
-- A CIRURGIA PASSA A SABER DE QUE ATENDIMENTO ELA É
--
-- 🔴 `cc_cirurgias` É A ÚNICA TABELA CLÍNICA SEM ELO COM O EPISÓDIO.
--
--   leitos.ps_atendimento_id          (migracao-ps-origem-elo)
--   mat_episodios.ps_atendimento_id   (maternidade-fase0)
--   pep_episodios.ps_atendimento_id   (pep-fase1)
--   cc_cirurgias                      — nada
--
-- Enquanto isso não existe, a conta da cirurgia só pode ser montada
-- ADIVINHANDO por prontuário + data. É exatamente o casamento que
-- `escolherInternacao` já faz para o leito e que o próprio código lamenta:
-- "o vínculo é por prontuário+período (a saída não guarda o atendimento),
-- por isso a tela mostra a fonte". Para uma cirurgia — o procedimento de
-- maior valor da conta — adivinhar o episódio é pior: a mesma pessoa pode
-- ter dois atendimentos no mesmo dia (consulta de manhã, urgência à noite),
-- e o palpite poria o porte cirúrgico na conta errada.
--
-- 💡 O ELO EXPLÍCITO. `ps_atendimento_id` nullable, com FK. Nullable porque
-- cirurgia agendada com semanas de antecedência nasce ANTES de o episódio
-- existir — o elo se faz quando o paciente chega.
--
-- ⚠️ O BACKFILL SÓ LIGA O QUE NÃO TEM DÚVIDA.
-- Liga a cirurgia ao atendimento quando existe EXATAMENTE UM atendimento
-- daquele prontuário cuja janela cobre o dia da cirurgia. Havendo dois, não
-- liga nenhum — e isso é deliberado: elo errado é pior que elo ausente,
-- porque a conta sai para o episódio errado e ninguém percebe. A ausência a
-- tela mostra; o erro, não.
--
-- É a lição de `migracao-atendimento-fk.sql` sobre backfill que DEDUZ dado:
-- "migração que deduz dado não pode alimentar decisão que depende de dado
-- confiável". Aqui o dado alimenta a conta, então o critério é a certeza.
--
-- ADITIVA. IDEMPOTENTE.
--
-- COMO DESFAZER:
--   alter table public.cc_cirurgias
--     drop constraint if exists cc_cirurgias_atendimento_fk,
--     drop column if exists ps_atendimento_id;
-- ═══════════════════════════════════════════════════════════

set valentrax.quem = 'adauam';


alter table public.cc_cirurgias
  add column if not exists ps_atendimento_id bigint;

comment on column public.cc_cirurgias.ps_atendimento_id is
  'De que episódio esta cirurgia é. NULL = ainda não ligada (cirurgia agendada antes de o paciente chegar).';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'cc_cirurgias_atendimento_fk'
       and conrelid = 'public.cc_cirurgias'::regclass
  ) then
    alter table public.cc_cirurgias
      add constraint cc_cirurgias_atendimento_fk
      foreign key (ps_atendimento_id) references public.ps_atendimentos (id);
  end if;
exception when others then
  raise notice 'ATENCAO: nao foi possivel criar a FK do elo (%). Veja a conferencia no fim.', sqlerrm;
end $$;

create index if not exists cc_cirurgias_atendimento_idx
  on public.cc_cirurgias (ps_atendimento_id) where ps_atendimento_id is not null;


-- ───────────────────────────────────────────────────────────
-- O BACKFILL DO QUE NÃO TEM DÚVIDA
--
-- A janela do atendimento vai da chegada ao desfecho; em aberto, vai até
-- hoje. O dia da cirurgia precisa cair dentro dela.
--
-- ⚠️ O dia civil sai de `chegada_em`/`desfecho_em` pelo fuso de São Paulo e
-- NÃO por corte de texto: em UTC, depois das 21h já é amanhã, e uma
-- cirurgia da noite cairia fora da janela do próprio episódio. É a mesma
-- correção do PR do dia civil, aqui no SQL.
-- ───────────────────────────────────────────────────────────
with candidatos as (
  select c.id as cirurgia_id, a.id as atendimento_id
    from public.cc_cirurgias c
    join public.ps_atendimentos a
      on a.prontuario = c.prontuario
     and c.data >= (a.chegada_em at time zone 'America/Sao_Paulo')::date
     and c.data <= coalesce((a.desfecho_em at time zone 'America/Sao_Paulo')::date,
                            (now() at time zone 'America/Sao_Paulo')::date)
     and coalesce(a.status, '') <> 'cancelado'
   where c.ps_atendimento_id is null
     and c.prontuario is not null
),
sem_duvida as (
  select cirurgia_id, min(atendimento_id) as atendimento_id
    from candidatos
   group by cirurgia_id
  having count(*) = 1          -- 🔴 dois candidatos → não liga nenhum
)
update public.cc_cirurgias c
   set ps_atendimento_id = s.atendimento_id,
       updated_at = now()
  from sem_duvida s
 where c.id = s.cirurgia_id;


insert into public.migracoes_aplicadas (arquivo)
values ('migracao-cirurgia-elo-atendimento.sql') on conflict do nothing;

reset valentrax.quem;

notify pgrst, 'reload schema';


-- ───────────────────────────────────────────────────────────
-- CONFERÊNCIA
-- ───────────────────────────────────────────────────────────
select item, case when ok then '✅' else '❌' end as situacao from (
  select 'coluna cc_cirurgias.ps_atendimento_id' as item,
         exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'cc_cirurgias'
                    and column_name = 'ps_atendimento_id') as ok
  union all
  select '🔴 FK cirurgia → atendimento',
         exists (select 1 from pg_constraint where conname = 'cc_cirurgias_atendimento_fk')
  union all
  select 'índice do elo',
         exists (select 1 from pg_class where relname = 'cc_cirurgias_atendimento_idx')
  union all
  -- Nenhum elo pode apontar para atendimento de OUTRO paciente. Se isto vier
  -- ❌, o backfill casou errado e a conta sairia no episódio de outra pessoa.
  select '🔴 nenhum elo aponta para outro paciente',
         not exists (select 1 from public.cc_cirurgias c
                      join public.ps_atendimentos a on a.id = c.ps_atendimento_id
                     where a.prontuario is distinct from c.prontuario)
  union all
  select 'migração anotada no registro',
         exists (select 1 from public.migracoes_aplicadas
                  where arquivo = 'migracao-cirurgia-elo-atendimento.sql')
) x;

-- Quantas ficaram ligadas, e quantas seguem sem elo — não é erro, é o que
-- a tela vai pedir para alguém resolver.
select count(*) filter (where ps_atendimento_id is not null) as ligadas,
       count(*) filter (where ps_atendimento_id is null)     as sem_elo,
       count(*)                                              as total
  from public.cc_cirurgias;
