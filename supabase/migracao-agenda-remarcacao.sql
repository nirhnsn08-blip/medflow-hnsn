-- ============================================================
-- Valentrax — REMARCAÇÃO COM VÍNCULO
--
-- POR QUE ESTA MIGRAÇÃO EXISTE
-- Remarcar não existe no sistema. Existe CANCELAR (com um motivo em texto
-- livre, digitado num `prompt`) e existe MARCAR. A recepcionista faz as
-- duas coisas à mão e a corrente se perde no meio — sem erro nenhum, o que
-- é o pior jeito de perder.
--
-- TRÊS COISAS SUMIAM JUNTO, E NENHUMA APARECIA EM TELA NENHUMA:
--
--   1. DE QUEM FOI. "Médico de licença" e "o paciente pediu outro dia"
--      viravam a mesma string. Quantas vezes o HOSPITAL empurrou o paciente
--      é o único número deste conjunto sobre o qual o hospital manda — e
--      não existia. O absenteísmo, que existe, mede o lado do paciente.
--
--   2. A ESPERA REAL. Quem foi marcado em março e empurrado três vezes
--      aparece como "marcado há 5 dias". A espera que conta para a
--      regulação é da PRIMEIRA marcação até ser atendido, e o relógio era
--      zerado a cada remarque. A fila do hospital parecia curta.
--
--   3. A PESSOA. Três remarcações de um paciente são indistinguíveis de
--      três pacientes diferentes. Quem liga para reduzir absenteísmo não
--      tem como saber a quem ligar primeiro.
--
-- O QUE ENTRA
--   • `remarcado_de`       — o agendamento que este substitui;
--   • `remarcacao_motivo`  — do catálogo, e é ele que carrega o "de quem".
--
-- SÓ UMA DIREÇÃO, DE PROPÓSITO. Não existe `remarcado_para`: duas colunas
-- apontando uma para a outra divergem no primeiro update que esquecer
-- metade, e aí "quantas vezes esta pessoa foi empurrada" passa a ter duas
-- respostas. A direção contrária se descobre com um índice, que entra aqui.
--
-- O STATUS DO ORIGINAL CONTINUA SENDO `cancelado`. Nenhum status novo:
-- o CHECK de status e o índice único da vaga não são tocados, e a vaga
-- antiga volta para a fila exatamente como já voltava. É a lição do
-- `confirmado` — status novo obriga a lembrar de DUAS travas, e esquecer
-- uma delas é pior que não migrar.
--
-- ⚠️ ADITIVA. Colunas novas, um índice novo e uma trava que só recusa o que
-- nunca deveria ter sido gravado. Nada que era aceito passa a ser recusado.
--
-- COMO DESFAZER:
--   drop index if exists public.ag_agend_remarcado_de_unico;
--   alter table public.ag_agendamentos
--     drop constraint if exists ag_agend_remarcacao_nao_aponta_para_si,
--     drop column if exists remarcado_de,
--     drop column if exists remarcacao_motivo;
-- ============================================================

-- ── 1. AS COLUNAS ───────────────────────────────────────────
alter table public.ag_agendamentos
  -- O elo. `on delete set null` e não `cascade`: agendamento neste sistema
  -- não se apaga (muda de status), mas se um dia alguém apagar um, a
  -- corrente perde o começo em vez de perder o fim inteiro.
  add column if not exists remarcado_de bigint
    references public.ag_agendamentos(id) on delete set null,

  -- Sem CHECK de valor, pelo mesmo motivo do `falta_motivo`: motivo novo
  -- criado no catálogo não pode depender de migração para ser gravável.
  add column if not exists remarcacao_motivo text;


-- ── 2. A TRAVA QUE O CÓDIGO SOZINHO NÃO GARANTE ─────────────
-- Um agendamento apontando para si mesmo faz a reconstrução da corrente
-- girar para sempre. A função pura tem guarda contra ciclo — e essa guarda
-- é defendida por um teste que TRAVA, não que fica vermelho, porque laço
-- infinito bloqueia o event loop e nem o vitest interrompe. Aqui é a
-- garantia que não depende de ninguém lembrar.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'ag_agend_remarcacao_nao_aponta_para_si'
  ) then
    alter table public.ag_agendamentos
      add constraint ag_agend_remarcacao_nao_aponta_para_si
      check (remarcado_de is null or remarcado_de <> id);
  end if;
end $$;


-- ── 3. A CORRENTE É CORRENTE, NÃO ÁRVORE ────────────────────
-- Índice único PARCIAL: cada agendamento só pode ser remarcado UMA vez.
--
-- A regra pura já recusa remarcar um agendamento cancelado (que é o estado
-- em que o original fica), mas duas recepcionistas clicando ao mesmo tempo
-- passariam pelas duas checagens antes de qualquer uma gravar. Sem esta
-- trava, o mesmo ponto teria dois sucessores e "para onde foi este
-- paciente" deixaria de ter resposta única — que é exatamente o problema
-- que a coluna existe para resolver.
--
-- Serve TAMBÉM de índice de busca para a direção contrária (achar quem
-- substituiu um agendamento), que é o motivo de não existir
-- `remarcado_para`.
create unique index if not exists ag_agend_remarcado_de_unico
  on public.ag_agendamentos (remarcado_de)
  where remarcado_de is not null;


-- ── 4. CONFERÊNCIA (leitura; o resultado é o recibo) ────────
select 'colunas novas (esperado 2)' as item,
       count(*)::text as situacao
  from information_schema.columns
 where table_schema = 'public' and table_name = 'ag_agendamentos'
   and column_name in ('remarcado_de', 'remarcacao_motivo')

union all
select 'trava contra elo apontando para si mesmo',
       case when exists (
         select 1 from pg_constraint
          where conname = 'ag_agend_remarcacao_nao_aponta_para_si'
       ) then '✅ existe' else '❌ NAO — corrente circular trava a tela' end

union all
select 'indice unico da corrente',
       case when exists (
         select 1 from pg_indexes
          where schemaname = 'public' and indexname = 'ag_agend_remarcado_de_unico'
       ) then '✅ existe' else '❌ NAO — o mesmo ponto pode ganhar dois sucessores' end

union all
select 'CHECK de status intacto (nao foi tocado)',
       case when exists (
         select 1 from pg_constraint
          where conname = 'ag_agend_status_valido'
       ) then '✅ intacto' else '❌ SUMIU — nao deveria ter sido tocado' end

union all
select 'indice da vaga intacto (nao foi tocado)',
       case when exists (
         select 1 from pg_indexes
          where schemaname = 'public' and indexname = 'ag_agend_vaga_unica_prof'
       ) then '✅ intacto' else '❌ SUMIU — nao deveria ter sido tocado' end

union all
select 'agendamentos ja remarcados',
       count(*)::text
  from public.ag_agendamentos
 where remarcado_de is not null;
