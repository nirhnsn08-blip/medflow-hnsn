-- ═══════════════════════════════════════════════════════════
-- CANCELAR UMA DOSE APRAZADA, SEM APAGÁ-LA
--
-- `pep_aprazamentos` nasceu completa — `previsto_para`, `dose_prevista`,
-- `sequencia`, `aprazado_por`, `conselho`, `registro_conselho` — e ficou
-- com ZERO usos em todo o código (medido em 15/10/2026). Agora ela entra
-- em uso, e ao entrar faltou uma coisa só: como DESFAZER uma dose.
--
-- 💡 POR QUE NÃO BASTA APAGAR A LINHA
--
-- Aprazar é ato de enfermagem com registro no conselho (COFEN). Apagar a
-- linha apaga quem aprazou aquela dose — e a pergunta que aparece depois
-- de um evento adverso é exatamente "quem combinou este horário, e quem
-- mudou". Linha apagada não responde.
--
-- Então reaprazar CANCELA as doses futuras, com motivo e com quem
-- cancelou, e insere as novas ao lado. A tabela segue append-only como o
-- resto do prontuário.
--
-- 🔒 RECUSAS (no gatilho, provadas em PGlite):
--   1. cancelar sem motivo de verdade;
--   2. cancelar dose que JÁ FOI ADMINISTRADA — a dose aconteceu, e o plano
--      não reescreve o fato;
--   3. descancelar (voltar `cancelado_em` para nulo).
--
-- ⚠️ POR QUE UM GATILHO E NÃO SÓ UM CHECK: a recusa 2 precisa olhar
-- `pep_administracoes`, que um check constraint não alcança.
--
-- ═══════════════════════════════════════════════════════════
-- 🔴 O QUE A CAMINHADA NO DEMO ACHOU (16/10/2026)
--
-- A primeira versão desta migração tinha as colunas e o gatilho, e o
-- cancelamento NÃO GRAVAVA. A tela dizia a verdade ("o cancelamento não
-- foi gravado") e o motivo era mais fundo: `pep_aprazamentos` não tem
-- política de UPDATE. Está escrito em `migracao-pep-fase1.sql`:
--
--     -- sem update/delete: o plano aprazado é registro clínico.
--
-- O PATCH voltava 2xx alterando zero linhas. O gatilho nunca rodou — não
-- havia linha a alcançar.
--
-- ⚠️ E OS 18 CENÁRIOS EM PGLITE ESTAVAM VERDES. Eles rodavam o `update`
-- como DONO da tabela, onde RLS não se aplica. A prova era real e
-- respondia outra pergunta: o gatilho recusa os cancelamentos errados.
-- Ninguém perguntou se o update CHEGA na linha. Por isso este arquivo
-- agora tem um teste no repositório (`aprazamento-cancelar.test.js`) que
-- confere a existência da política — e não só o comportamento do gatilho.
--
-- Então aqui entram TRÊS coisas que faltavam:
--
--   A) a política permissiva de UPDATE, sem a qual nada disto funciona;
--
--   B) a trava que congela TODAS as outras colunas. Abrir UPDATE sem ela
--      trocaria um defeito por outro pior: `previsto_para` e `aprazado_por`
--      passariam a ser reescrevíveis em silêncio, que é exatamente o fato
--      clínico que a tabela existe para guardar;
--
--   C) o índice único `pep_aprz_uq` (item_id, previsto_para) passa a
--      ignorar as canceladas. Sem isto, reaprazar mantendo QUALQUER
--      horário bate no índice — e o painel vem preenchido com os horários
--      atuais, então é o caso comum, não o raro.
-- ═══════════════════════════════════════════════════════════
--
-- ADITIVA. IDEMPOTENTE. Pode rodar de novo onde a primeira versão já rodou.
--
-- COMO DESFAZER:
--   drop trigger if exists trg_apraz_cancelar on public.pep_aprazamentos;
--   drop function if exists public.apraz_cancelar();
--   drop policy if exists pep_aprz_cancelar_upd on public.pep_aprazamentos;
--   drop index if exists public.pep_aprz_uq_vigentes;
--   create unique index pep_aprz_uq
--     on public.pep_aprazamentos (item_id, previsto_para);
--   alter table public.pep_aprazamentos
--     drop column if exists cancelado_em,
--     drop column if exists cancelado_por,
--     drop column if exists cancelamento_motivo;
-- ═══════════════════════════════════════════════════════════

set valentrax.quem = 'adauam';


alter table public.pep_aprazamentos add column if not exists cancelado_em timestamptz;
alter table public.pep_aprazamentos add column if not exists cancelado_por text;
alter table public.pep_aprazamentos add column if not exists cancelamento_motivo text;

comment on column public.pep_aprazamentos.cancelado_em is
  'Quando esta dose aprazada deixou de valer. Nulo = vigente. Cancelar em vez de apagar preserva quem aprazou — aprazar é ato de enfermagem com registro no conselho.';


-- 🔴 A dose cancelada precisa dizer por quê: "a dose das 18h sumiu" sem
-- motivo é a pergunta que ninguém consegue responder depois.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pep_apraz_cancel_ck') then
    alter table public.pep_aprazamentos add constraint pep_apraz_cancel_ck
      check (cancelado_em is null or length(btrim(coalesce(cancelamento_motivo, ''))) >= 5);
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════
-- 🔴 C) O ÚNICO PASSA A IGNORAR AS CANCELADAS
--
-- `pep_aprz_uq` (item_id, previsto_para) nasceu em fase1 para impedir que
-- a geração automática rodando duas vezes duplicasse a fila da enfermagem.
-- A regra continua certa; o que mudou é que agora existe linha cancelada,
-- e ela não ocupa horário na grade.
--
-- Sem esta troca, reaprazar mantendo qualquer um dos horários bate em
-- "duplicate key": a dose cancelada das 00h55 continuaria reservando as
-- 00h55 para sempre. E o painel de reaprazamento vem PREENCHIDO com os
-- horários atuais — quem muda um horário mantém os outros três. É o
-- caminho comum.
--
-- ⚠️ SE ALGUÉM REEXECUTAR `migracao-pep-fase1.sql`, o índice antigo volta
--    (ela o cria com `if not exists`) e o reaprazamento quebra de novo.
--    Rode esta migração outra vez: ela é idempotente.
-- ═══════════════════════════════════════════════════════════
create unique index if not exists pep_aprz_uq_vigentes
  on public.pep_aprazamentos (item_id, previsto_para) where cancelado_em is null;
drop index if exists public.pep_aprz_uq;

-- As doses que ainda valem, que é a consulta de toda grade. O único acima
-- já serve de índice para isto, mas o nome antigo fica: outra migração
-- pode citá-lo, e índice sobrando não atrapalha leitura.
create index if not exists pep_apraz_vigentes_idx
  on public.pep_aprazamentos (item_id, previsto_para) where cancelado_em is null;


-- ═══════════════════════════════════════════════════════════
-- 🔴 A) A POLÍTICA DE UPDATE — SEM ELA, NADA DISTO FUNCIONA
--
-- `migracao-pep-fase1.sql` criou SELECT e INSERT e escreveu "sem
-- update/delete: o plano aprazado é registro clínico". A intenção estava
-- certa e a consequência era um PATCH que responde 2xx sem alterar nada.
--
-- Cancelar não reescreve o registro: acrescenta a ele a informação de que
-- aquela dose deixou de valer, com motivo e com autor. O que torna isto
-- append-only DE VERDADE é a trava (B) logo abaixo, que congela todas as
-- outras colunas — a política sozinha abriria a linha inteira.
--
-- Mesmo papel do INSERT: quem pode aprazar pode cancelar o que aprazou.
-- A `pep_aprazamentos_mod_upd` do RLS por módulo é RESTRICTIVE e continua
-- valendo por cima desta — ela estreita para quem tem escrita em
-- `paciente`, e nunca concede nada sozinha. Esta aqui é a permissiva que
-- faltava, e sem uma permissiva a restritiva nega tudo.
-- ═══════════════════════════════════════════════════════════
drop policy if exists pep_aprz_cancelar_upd on public.pep_aprazamentos;
create policy pep_aprz_cancelar_upd on public.pep_aprazamentos
  for update to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));


create or replace function public.apraz_cancelar()
returns trigger
language plpgsql
set search_path = public
as $apz$
declare
  ja bigint;
begin
  -- ═══════════════════════════════════════════════════════════
  -- 🔴 B) NO UPDATE, SÓ AS TRÊS COLUNAS DE CANCELAMENTO MUDAM
  --
  -- A política de UPDATE abre a LINHA, não as colunas — RLS não sabe
  -- falar de coluna. Sem esta trava, quem pode cancelar poderia reescrever
  -- `previsto_para` ("a dose era das 18h, não das 14h") ou `aprazado_por`
  -- ("não fui eu que aprazei"), em silêncio, sem deixar rastro. O fato
  -- clínico que esta tabela existe para guardar iria junto.
  --
  -- 💡 Compara os dois registros MENOS as três colunas, em vez de listar
  -- as outras quinze: coluna nova nasce congelada sem ninguém precisar
  -- lembrar deste gatilho. É a lição das "cinco casas" de sempre — aqui
  -- o número de casas é zero.
  -- ═══════════════════════════════════════════════════════════
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'cancelado_em' - 'cancelado_por' - 'cancelamento_motivo')
       is distinct from
       (to_jsonb(old) - 'cancelado_em' - 'cancelado_por' - 'cancelamento_motivo') then
      raise exception
        'Aprazamento não se reescreve: no UPDATE só cancelado_em, cancelado_por e cancelamento_motivo podem mudar. Para trocar o horário, cancele esta dose com motivo e apraze a nova.';
    end if;
  end if;

  -- Só interessa a transição para cancelado.
  if new.cancelado_em is null then
    -- 🔴 DESCANCELAR NÃO EXISTE. Uma dose cancelada foi comunicada como
    -- cancelada; ressuscitá-la faria a enfermagem da escala seguinte achar
    -- que deve administrar algo que o turno anterior tirou da grade.
    if tg_op = 'UPDATE' and old.cancelado_em is not null then
      raise exception
        'Esta dose já foi cancelada (%). Dose cancelada não volta — apraze uma nova no lugar.',
        old.cancelamento_motivo;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and old.cancelado_em is not null then
    return new;   -- já estava cancelada; nada a fazer
  end if;

  -- 🔴 DOSE JÁ ADMINISTRADA NÃO SE CANCELA. O plano não reescreve o fato:
  -- o medicamento entrou no paciente, e um aprazamento cancelado faria a
  -- administração ficar órfã — sem a dose que ela cumpriu.
  select a.id into ja
    from public.pep_administracoes a
   where a.aprazamento_id = new.id
     and coalesce(a.status, 'administrado') = 'administrado'
   limit 1;
  if ja is not null then
    raise exception
      'Esta dose JÁ FOI ADMINISTRADA (registro #%). O plano não reescreve o fato — se houve erro, o caminho é a correção da administração.',
      ja;
  end if;

  new.cancelado_em := coalesce(new.cancelado_em, now());
  return new;
end;
$apz$;

drop trigger if exists trg_apraz_cancelar on public.pep_aprazamentos;
create trigger trg_apraz_cancelar
  before insert or update on public.pep_aprazamentos
  for each row execute function public.apraz_cancelar();


-- ═══════════════════════════════════════════════════════════
-- 🔴 D) REAPRAZAR É UMA TRANSAÇÃO SÓ
--
-- ⚠️ ESTE É O DEFEITO MAIS GRAVE QUE A CAMINHADA ACHOU, e ele não estava
-- no banco: estava na ORDEM das duas chamadas.
--
-- A tela fazia dois PATCHes/POSTs separados — cancela as futuras, depois
-- insere as novas. Medido no demo em 16/10/2026: o cancelamento gravou
-- (21 doses), a inserção bateu num `duplicate key`, e o paciente ficou
-- com UMA dose vigente. A grade de medicação esvaziou.
--
-- Duas chamadas HTTP não têm transação entre si. Qualquer motivo para a
-- segunda falhar — colisão, RLS, rede caindo no meio — deixa o plano
-- cancelado e nada no lugar. E quem está na enfermaria vê uma grade
-- vazia, que é indistinguível de "não há prescrição".
--
-- 💡 Aqui as duas coisas acontecem dentro de UMA função, então o banco
-- garante o que o HTTP não garantia: ou a troca inteira vale, ou nada
-- muda e o plano antigo continua de pé.
--
-- `security invoker` DE PROPÓSITO: a função roda com o papel de quem
-- chamou, então a RLS do cancelamento e da inserção continua valendo. Uma
-- `security definer` aqui seria uma porta dos fundos para escrever no
-- prontuário sem passar pela barreira de módulo.
-- ═══════════════════════════════════════════════════════════
create or replace function public.apraz_reaprazar(
  p_item_id bigint,
  p_motivo  text,
  p_quem    text,
  p_doses   jsonb
) returns setof public.pep_aprazamentos
language plpgsql
security invoker
set search_path = public
as $rp$
begin
  -- 🔴 Reaprazar sem dose nenhuma cancelaria a grade e não poria nada no
  -- lugar. É o mesmo estrago, pedido de outro jeito.
  if p_doses is null or jsonb_typeof(p_doses) <> 'array' or jsonb_array_length(p_doses) = 0 then
    raise exception
      'Reaprazar sem dose nenhuma deixaria o paciente sem grade. Para suspender a medicação, o caminho é suspender o item.';
  end if;

  -- As futuras ainda não administradas. A dose que já aconteceu fica —
  -- o gatilho recusaria de qualquer forma, e aqui ela nem é alcançada.
  update public.pep_aprazamentos a
     set cancelado_em       = now(),
         cancelado_por      = p_quem,
         cancelamento_motivo = p_motivo
   where a.item_id = p_item_id
     and a.cancelado_em is null
     and a.previsto_para > now()
     and not exists (
       select 1 from public.pep_administracoes x
        where x.aprazamento_id = a.id
          and coalesce(x.status, 'administrado') = 'administrado');

  -- ⚠️ `with ... insert ... returning` e não `return query insert`: o
  -- plpgsql não aceita a segunda forma.
  return query
    with nova as (
      insert into public.pep_aprazamentos
        (item_id, prescricao_id, prontuario, episodio_id, previsto_para, sequencia,
         dose_prevista, via, observacao, aprazado_por, conselho, registro_conselho, usuario)
      select p_item_id, d.prescricao_id, d.prontuario, d.episodio_id, d.previsto_para,
             d.sequencia, d.dose_prevista, d.via, d.observacao, d.aprazado_por,
             d.conselho, d.registro_conselho, d.usuario
        from jsonb_to_recordset(p_doses) as d(
          prescricao_id bigint, prontuario text, episodio_id bigint,
          previsto_para timestamptz, sequencia int, dose_prevista text, via text,
          observacao text, aprazado_por text, conselho text, registro_conselho text,
          usuario text)
      returning *
    )
    select * from nova;
end;
$rp$;

grant execute on function public.apraz_reaprazar(bigint, text, text, jsonb) to authenticated;


insert into public.migracoes_aplicadas (arquivo)
values ('migracao-aprazamento-cancelar.sql') on conflict do nothing;

reset valentrax.quem;

notify pgrst, 'reload schema';


-- ───────────────────────────────────────────────────────────
-- CONFERÊNCIA
-- ───────────────────────────────────────────────────────────
select item, case when ok then '✅' else '❌' end as situacao from (
  select 'coluna ' || c as item, exists (
           select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'pep_aprazamentos' and column_name = c) as ok
    from unnest(array['cancelado_em', 'cancelado_por', 'cancelamento_motivo']) c
  union all
  select 'trava do motivo de cancelamento',
         exists (select 1 from pg_constraint where conname = 'pep_apraz_cancel_ck')
  union all
  select '🔴 gatilho que recusa cancelar dose administrada',
         exists (select 1 from pg_trigger where tgname = 'trg_apraz_cancelar')
  union all
  select 'índice das doses vigentes',
         exists (select 1 from pg_class where relname = 'pep_apraz_vigentes_idx')
  union all
  -- 🔴 As três que a caminhada no demo cobrou. Sem a primeira, o
  -- cancelamento responde 2xx e não grava nada.
  select '🔴 A) política de UPDATE (sem ela o cancelamento não grava)',
         exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'pep_aprazamentos'
                    and policyname = 'pep_aprz_cancelar_upd' and cmd = 'UPDATE')
  union all
  select '🔴 C) único ignora as canceladas',
         exists (select 1 from pg_class where relname = 'pep_aprz_uq_vigentes')
  union all
  select '🔴 C) e o único antigo saiu do caminho',
         not exists (select 1 from pg_class where relname = 'pep_aprz_uq')
  union all
  select '🔴 D) reaprazar numa transação só (cancelar + inserir)',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'apraz_reaprazar')
  union all
  select 'migração anotada no registro',
         exists (select 1 from public.migracoes_aplicadas
                  where arquivo = 'migracao-aprazamento-cancelar.sql')
) x;

-- ⚠️ A tabela estava vazia até hoje (zero usos no código). Se este número
-- não for 0, alguém escreveu nela por fora — vale olhar antes de seguir.
select count(*) as aprazamentos_ja_existentes from public.pep_aprazamentos;
