-- ============================================================
-- Valentrax — A VAGA É DO PROFISSIONAL, NÃO DA ESPECIALIDADE
--
-- POR QUE ESTA MIGRAÇÃO EXISTE
-- A trava que impede dois pacientes no mesmo horário estava na chave
-- errada:
--
--     unique (data, especialidade_cod, hora)
--
-- Ela protege o paciente, e por isso tem que continuar existindo. Mas do
-- jeito que está, ela também torna IMPOSSÍVEL uma coisa banal num
-- ambulatório: **dois médicos da mesma especialidade atendendo no mesmo
-- horário.** Dois oftalmologistas às terças 08:00 é o segundo ser recusado
-- pelo banco — não por falta de vaga, por causa da forma da chave.
--
-- Três coisas travam juntas por causa disso:
--   1. a capacidade da especialidade fica limitada a UM médico por horário,
--      por mais gente que o hospital contrate;
--   2. o card de vagas MENTE quando há duas grades: o da Dra. B mostra a
--      cota consumida pelo Dr. A, porque a contagem também é por
--      especialidade (`vagasDoDia`, em agenda.js — corrigido no mesmo PR);
--   3. fecha a saída natural para duração diferente por tipo de consulta —
--      uma grade de 30 min para primeira vez e outra de 15 para retorno, no
--      mesmo turno, é hoje impossível de publicar.
--
-- POR QUE AGORA, E NÃO DEPOIS
-- É a única correção desta fila cujo custo CRESCE com o tempo. Trocar chave
-- de índice único exige conferir duplicidade histórica; com o hospital
-- vazio isso é uma consulta, com dois anos de agenda é um mutirão. O
-- momento barato é antes do primeiro paciente real.
--
-- A CHAVE NOVA
--     unique (data, hora, coalesce('p:'||profissional_username, 'e:'||especialidade_cod))
--
-- Lê-se: a vaga pertence a QUEM ATENDE. Quando a grade não tem profissional
-- definido — o que o `validarGrade` permite —, ela volta a pertencer à
-- especialidade, que é exatamente o comportamento de hoje. Ou seja: nada
-- que funciona hoje passa a falhar; o que era recusado sem motivo passa a
-- ser aceito.
--
-- O prefixo `p:` / `e:` não é enfeite: sem ele, um username que coincidisse
-- com um código de especialidade misturaria as duas chaves — improvável e
-- silencioso, que é a pior combinação.
--
-- ⚠️ ESTA MIGRAÇÃO NÃO É PURAMENTE ADITIVA — ela DERRUBA o índice antigo,
-- e derrubar é o objetivo: enquanto ele existir, continua recusando o
-- segundo médico. A ordem abaixo é deliberada e segura:
--   1. confere se algum dado atual violaria a chave nova (e PARA se violar);
--   2. cria o índice novo;
--   3. só então derruba o antigo — e só se o novo existir de verdade.
-- Assim, em nenhum instante a base fica sem trava contra vaga dupla.
--
-- COMO DESFAZER, se precisar:
--   drop index if exists public.ag_agend_vaga_unica_prof;
--   create unique index ag_agend_vaga_unica on public.ag_agendamentos
--     (data, especialidade_cod, hora)
--     where hora is not null and status in ('agendado','presente');
-- ============================================================

-- ── 1. CONFERÊNCIA PRÉVIA ───────────────────────────────────
-- A chave nova é mais FROUXA que a antiga em quase tudo (libera dois
-- médicos no mesmo horário), mas há um caso em que ela é mais APERTADA: o
-- mesmo profissional com DUAS especialidades no mesmo horário. Hoje isso
-- passa; depois, não — e está certo que não passe, porque a pessoa não se
-- divide. Se existir na base, a migração PARA aqui e mostra qual é, em vez
-- de falhar no meio com uma mensagem de índice.
--
-- ⚠️ O agrupamento é EXATAMENTE a chave do índice novo — nada além dela.
-- Acrescentar `profissional_username` e `especialidade_cod` ao `group by`
-- (que é o instinto, porque são as colunas que a gente quer ver) separaria
-- em grupos diferentes justamente as duas linhas que colidem quando o mesmo
-- profissional aparece em DUAS especialidades — o único caso que esta
-- conferência existe para pegar. A conferência passaria e o índice falharia.
do $$
declare
  conflitos int;
  exemplo text;
begin
  select count(*), min(format('%s %s — %s', d.data, d.hora, d.chave))
    into conflitos, exemplo
    from (
      select data, hora,
             coalesce('p:' || profissional_username, 'e:' || especialidade_cod) as chave
        from public.ag_agendamentos
       where hora is not null and status in ('agendado','presente')
       group by 1, 2, 3
      having count(*) > 1
    ) d;

  if conflitos > 0 then
    raise exception
      'NAO MIGREI: % horario(s) ficariam com duas vagas para o mesmo profissional (ex.: %). '
      'Resolva remarcando ou cancelando um dos agendamentos e rode de novo.',
      conflitos, exemplo;
  end if;
end $$;

-- ── 2. O ÍNDICE NOVO ────────────────────────────────────────
-- Parcial pelos mesmos dois motivos do antigo, que continuam valendo:
--   • `falta` e `cancelado` ficam FORA — o horário volta ao mercado para
--     quem remarca, e o histórico do que foi desmarcado continua gravado;
--   • `hora is not null` porque a fila por ordem de chegada não tem
--     horário: ali a vaga não é um relógio, é uma posição.
create unique index if not exists ag_agend_vaga_unica_prof
  on public.ag_agendamentos
     (data, hora, (coalesce('p:' || profissional_username, 'e:' || especialidade_cod)))
  where hora is not null and status in ('agendado','presente');

-- ── 3. DERRUBAR O ANTIGO — só com o novo no lugar ───────────
-- O `if exists` do índice novo é a trava: se o passo 2 não tiver criado
-- nada (por qualquer motivo), o antigo FICA, e a base continua protegida
-- contra vaga dupla. Preferir uma trava excessiva a nenhuma.
do $$
begin
  if exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'ag_agend_vaga_unica_prof'
  ) then
    drop index if exists public.ag_agend_vaga_unica;
  else
    raise exception 'NAO DERRUBEI o indice antigo: o novo (ag_agend_vaga_unica_prof) nao existe.';
  end if;
end $$;

-- ── 4. CONFERÊNCIA (leitura; o resultado é o recibo) ────────
select 'indice novo (por profissional)' as item,
       case when exists (
         select 1 from pg_indexes
          where schemaname = 'public' and indexname = 'ag_agend_vaga_unica_prof'
       ) then '✅ existe' else '❌ FALTANDO' end as situacao
union all
select 'indice antigo (por especialidade)',
       case when exists (
         select 1 from pg_indexes
          where schemaname = 'public' and indexname = 'ag_agend_vaga_unica'
       ) then '❌ AINDA EXISTE — dois medicos no mesmo horario seguem barrados'
          else '✅ derrubado' end
union all
-- A trava continua de pé: um horário vivo por profissional, nunca dois.
select 'vagas vivas com hora (a trava cobre)',
       (select count(*)::text from public.ag_agendamentos
         where hora is not null and status in ('agendado','presente'))
union all
select 'agendamentos vivos SEM profissional (caem na especialidade)',
       (select count(*)::text from public.ag_agendamentos
         where hora is not null and status in ('agendado','presente')
           and profissional_username is null);
