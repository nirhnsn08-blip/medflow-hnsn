-- ═══════════════════════════════════════════════════════════
-- A RECUSA POR CORRIDA NÃO FUNCIONAVA — e só o banco real mostrou
--
-- 🔴 MEDIDO NO DEMO EM 07/10/2026, não deduzido.
--
-- `migracao-correcao-desfecho.sql` criou o gatilho com quatro recusas. A
-- segunda delas — "alguém mudou o desfecho enquanto esta tela estava
-- aberta" — foi provada em PGlite e DECLARADA funcionando no PR #261.
-- Estava errado, e o erro era do método: **PGlite tem uma conexão só, logo
-- não existe corrida lá.** Toda a prova foi serial.
--
-- Contra o banco de teste, dois INSERT em paralelo, os dois partindo de
-- `de = 'atendido'`:
--
--   trilha #5  atendido -> evadiu       (pessoa_A)  13:42:26
--   trilha #6  atendido -> encaminhado  (pessoa_B)  13:42:26
--   ps_atendimentos.desfecho = 'evadiu'
--
-- **Os dois voltaram 201.** A linha #6 registra uma correção que NÃO
-- ACONTECEU, com motivo e autor, assinada. É exatamente o que o comentário
-- do gatilho original diz que ele existe para impedir — "o histórico
-- contaria uma correção que não houve" — e é pior do que não ter trilha,
-- porque quem auditar amanhã vai acreditar nela.
--
-- A CAUSA: o gatilho lia o desfecho atual com um `select` simples. Em READ
-- COMMITTED as duas transações leem o valor de antes, as duas passam na
-- conferência, e então os dois `update` rodam — o segundo espera o lock,
-- reavalia `where id = X`, ainda casa, e sobrescreve. A conferência virou
-- enfeite: ela compara contra uma leitura que já envelheceu.
--
-- O CONSERTO: `for update` na leitura. O lock é tomado ANTES da
-- conferência, então a segunda transação para na leitura, espera a primeira
-- commitar, relê o valor NOVO e aí a comparação de `de` reprova — que é o
-- comportamento que sempre foi desenhado. Uma linha.
--
-- ⚠️ ESTA MIGRAÇÃO NÃO PODE SER PROVADA EM PGlite, pela mesma razão que
-- esconderia o defeito. A prova é no banco, com dois pedidos paralelos.
--
-- ADITIVA: só substitui a função (`create or replace`). Nenhuma tabela,
-- coluna, trava ou política muda. O gatilho continua apontando para ela.
-- IDEMPOTENTE: pode rodar duas vezes.
-- ═══════════════════════════════════════════════════════════

set valentrax.quem = 'adauam';


-- ───────────────────────────────────────────────────────────
-- O GATILHO, com o lock
--
-- O corpo é o mesmo de `migracao-correcao-desfecho.sql`; a única mudança
-- está marcada com 🔴 abaixo. Vai inteiro de propósito: função pela metade
-- não existe, e `create or replace` exige o corpo completo.
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
  -- 🔴 `for update` — a única mudança desta migração.
  --
  -- Sem ele, duas correções simultâneas leem o mesmo desfecho, as duas
  -- passam na conferência (2) abaixo e as duas gravam trilha; só a última
  -- vale, e a outra linha fica mentindo para sempre. Medido no demo.
  --
  -- Com ele, a segunda transação PARA aqui até a primeira commitar, e então
  -- relê o desfecho novo — o que faz a conferência (2) reprovar, como foi
  -- desenhado. O lock é de uma linha e dura o INSERT.
  select * into atual
    from public.ps_atendimentos
   where id = new.atendimento_id
     for update;

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
  --
  -- ⚠️ Esta leitura segue SEM lock, e de propósito. Travar `at_contas` aqui
  -- inverteria a ordem de locks em relação ao fechamento de conta (que pega
  -- a conta primeiro) e abriria deadlock. A janela que sobra é alguém fechar
  -- a conta no mesmo instante da correção; o estrago é uma correção aplicada
  -- sob conta recém-fechada, não uma trilha falsa. NÃO FOI MEDIDO.
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


insert into public.migracoes_aplicadas (arquivo)
values ('migracao-correcao-desfecho-corrida.sql') on conflict do nothing;

reset valentrax.quem;

notify pgrst, 'reload schema';


-- ───────────────────────────────────────────────────────────
-- CONFERÊNCIA
-- ───────────────────────────────────────────────────────────
select item, case when ok then '✅' else '❌' end as situacao from (
  select 'a função existe' as item,
         exists (select 1 from pg_proc where proname = 'at_aplica_correcao_desfecho') as ok
  union all
  -- O que esta migração vem fazer: o lock tem de estar no corpo gravado.
  select 'a leitura do desfecho trava a linha (for update)',
         exists (select 1 from pg_proc
                  where proname = 'at_aplica_correcao_desfecho'
                    and prosrc ~* 'where[[:space:]]+id[[:space:]]*=[[:space:]]*new\.atendimento_id[[:space:]]*for[[:space:]]+update')
  union all
  select 'as quatro recusas continuam no corpo',
         (select count(*) from pg_proc
           where proname = 'at_aplica_correcao_desfecho'
             and prosrc like '%releia antes de corrigir%'
             and prosrc like '%ÓBITO%'
             and prosrc like '%cancele a conta primeiro%'
             and prosrc like '%Nada foi registrado%') = 1
  union all
  select 'o gatilho continua ligado na trilha',
         exists (select 1 from pg_trigger where tgname = 'trg_at_corrige_desfecho')
  union all
  select 'a trilha segue imutável (sem update/delete)',
         not exists (select 1 from pg_policies
                      where tablename = 'at_desfecho_correcoes' and cmd in ('UPDATE', 'DELETE'))
  union all
  select 'migração anotada no registro',
         exists (select 1 from public.migracoes_aplicadas
                  where arquivo = 'migracao-correcao-desfecho-corrida.sql')
) x;
