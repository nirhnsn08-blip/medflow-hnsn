-- ═══════════════════════════════════════════════════════════
-- CIRURGIA SEGURA VIRA REGISTRO, E NÃO UM BOOLEANO
--
-- 🔴 O QUE ESTÁ ERRADO HOJE
--
-- `cc_cirurgias` tem `chk_sign_in`, `chk_time_out` e `chk_sign_out` —
-- três BOOLEANOS. A tela marca os 7 itens do Sign In, a circulante clica
-- "Concluir", e o que vai para o banco é `true`. Os itens marcados vivem em
-- estado local do React e são DESCARTADOS ao fechar o modal.
--
-- A RDC 36/2013 e o Protocolo de Cirurgia Segura (OMS / Portaria 1.377/2013)
-- exigem o REGISTRO da verificação, não a verificação. Numa visita do
-- ONA ou da vigilância, o hospital tem um `true` e nenhuma prova de que a
-- conferência aconteceu em voz alta, de quem a conduziu, nem de que item
-- nenhum ficou pendente. E no caso que mais importa — houve divergência no
-- Time Out, a equipe resolveu — não há onde isso conste, então o evento não
-- existe para a análise do Núcleo de Segurança do Paciente.
--
-- 🔴 O SEGUNDO BURACO: PULAR NÃO DEIXA RASTRO.
-- A tela pergunta "o Sign In ainda não foi concluído. Entrar em sala mesmo
-- assim?" e quem clica OK segue adiante. Não há motivo, não há justificativa,
-- não há coluna. No mês seguinte o único vestígio é a adesão caindo de 100%
-- para 94% — sem saber em qual cirurgia, por decisão de quem, nem por quê.
-- É exatamente o que a análise de causa raiz de um evento sentinela procura.
--
-- 💡 A SAÍDA: uma trilha append-only que registra as DUAS coisas. Conferência
-- feita e pulo justificado são linhas da mesma tabela, com `tipo`. Assim a
-- adesão deixa de ser um percentual sem denominador explicável: cada ponto
-- que falta tem nome, hora e motivo.
--
-- 🔒 RECUSAS, TODAS NO BANCO (tela não é defesa — um PATCH pela API passa
-- por cima dela):
--   1. cirurgia que não existe;
--   2. cirurgia CANCELADA — não se confere segurança de ato que não houve;
--   3. item não confirmado SEM divergência descrita — é o coração da coisa:
--      checklist incompleto e calado é pior que checklist não feito, porque
--      parece feito;
--   4. CONTAGEM DIVERGENTE sem divergência descrita (compressa, instrumental
--      ou agulha que entrou e não saiu) — corpo estranho retido é *never
--      event*, e a contagem existe para a diferença aparecer como NÚMERO;
--   5. Sign Out sem a contagem de compressas — a que sempre se conta;
--   6. pulo sem motivo, ou com motivo curto demais para explicar algo.
--
-- O gatilho aplica o `chk_*` correspondente DENTRO do mesmo INSERT: ou a
-- trilha e o selo mudam juntos, ou nada muda. Duas escritas pela tela
-- deixariam a porta aberta para gravar a trilha e falhar o selo.
--
-- ADITIVA: nenhuma coluna existente muda, nada é apagado.
-- IDEMPOTENTE: pode rodar duas vezes.
--
-- COMO DESFAZER:
--   drop trigger if exists trg_cc_aplica_checklist on public.cc_checklist;
--   drop function if exists public.cc_aplica_checklist();
--   drop table if exists public.cc_checklist;
--   alter table public.cc_cirurgias
--     drop column if exists sitio_cirurgico,
--     drop column if exists lateralidade,
--     drop column if exists consentimento_em;
-- ═══════════════════════════════════════════════════════════

set valentrax.quem = 'adauam';


-- ───────────────────────────────────────────────────────────
-- 1. SÍTIO E LATERALIDADE — o dado que o checklist mandava conferir
--    e que o sistema não guardava
--
-- O item 1 do Sign In é "Paciente confirmou identidade, SÍTIO CIRÚRGICO,
-- procedimento e consentimento", e o item 2 é "Sítio cirúrgico demarcado".
-- A equipe confirmava contra o quê? Numa artroplastia de joelho, "Joelho D"
-- ou "Joelho E" só existia se alguém escrevesse no campo `observacao`, que é
-- texto livre e opcional. Cirurgia em lado errado é o evento que a Meta 4
-- existe para impedir.
--
-- `lateralidade` tem domínio fechado de propósito: "D", "dto", "direito" e
-- "DIREITA" na mesma coluna tornariam o campo inútil para conferência.
-- ───────────────────────────────────────────────────────────
alter table public.cc_cirurgias
  add column if not exists sitio_cirurgico   text,
  add column if not exists lateralidade      text,
  add column if not exists consentimento_em  timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cc_cir_lateralidade_ck') then
    alter table public.cc_cirurgias
      add constraint cc_cir_lateralidade_ck
      check (lateralidade is null or lateralidade in ('direito', 'esquerdo', 'bilateral', 'nao_se_aplica'));
  end if;
end $$;

comment on column public.cc_cirurgias.lateralidade is
  'direito | esquerdo | bilateral | nao_se_aplica. Domínio fechado: é campo de conferência do Sign In.';


-- ───────────────────────────────────────────────────────────
-- 2. A TRILHA
-- ───────────────────────────────────────────────────────────
create table if not exists public.cc_checklist (
  id bigserial primary key,
  cirurgia_id bigint not null,

  -- 'conferencia' = a equipe passou o checklist.
  -- 'pulo'        = seguiu sem passar, e disse por quê.
  tipo text not null default 'conferencia',
  fase text not null,

  -- Os itens COMO FORAM LIDOS, não só quantos. O catálogo muda com o tempo
  -- (item novo, redação diferente), e um "6 de 7" guardado sozinho não diz
  -- QUAL faltou. Aqui fica o texto do item e se foi confirmado.
  itens jsonb not null default '[]'::jsonb,
  itens_total int not null default 0,
  itens_confirmados int not null default 0,

  -- O que não bateu e como se resolveu. Obrigatório quando falta item ou
  -- quando a contagem diverge — ver as travas abaixo.
  divergencia text,

  -- CONTAGEM (Sign Out). Números, não caixinha.
  -- "A contagem estava correta" marcado por alguém sem identificação tem
  -- valor probatório zero. A prática é contagem inicial e final, com os dois
  -- números registrados, para que a diferença apareça sozinha.
  compressas_inicial    int, compressas_final    int,
  instrumentais_inicial int, instrumentais_final int,
  agulhas_inicial       int, agulhas_final       int,

  -- Quem conduziu. `assinatura` é carimbada no ato (nome + conselho +
  -- registro), como o resto do PEP faz: o cadastro muda, o registro não.
  usuario text,
  assinatura text,
  criado_em timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cc_chk_fase_ck') then
    alter table public.cc_checklist add constraint cc_chk_fase_ck
      check (fase in ('sign_in', 'time_out', 'sign_out'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cc_chk_tipo_ck') then
    alter table public.cc_checklist add constraint cc_chk_tipo_ck
      check (tipo in ('conferencia', 'pulo'));
  end if;
  -- Pulo exige motivo que explique algo. "erro" não explica nada a quem ler
  -- isto numa análise de causa raiz — que é exatamente quando se lê.
  if not exists (select 1 from pg_constraint where conname = 'cc_chk_pulo_motivo_ck') then
    alter table public.cc_checklist add constraint cc_chk_pulo_motivo_ck
      check (tipo <> 'pulo' or length(btrim(coalesce(divergencia, ''))) >= 15);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cc_chk_contados_ck') then
    alter table public.cc_checklist add constraint cc_chk_contados_ck
      check (itens_confirmados >= 0 and itens_confirmados <= itens_total);
  end if;
end $$;

create index if not exists cc_checklist_cirurgia_idx on public.cc_checklist (cirurgia_id, criado_em desc);


-- ───────────────────────────────────────────────────────────
-- 3. O GATILHO — aplica o selo e recusa o que não pode
-- ───────────────────────────────────────────────────────────
create or replace function public.cc_aplica_checklist()
returns trigger
language plpgsql
set search_path = public
as $cc_chk$
declare
  cir   public.cc_cirurgias%rowtype;
  campo text;
  divergiu boolean;
begin
  -- `for update`: a conferência abaixo compara contra o estado da cirurgia,
  -- e sem o lock duas gravações simultâneas leriam o valor velho. Foi
  -- exatamente esse o defeito corrigido em `at_desfecho_correcoes` — lá o
  -- PGlite não mostrou, porque PGlite tem uma conexão só.
  select * into cir from public.cc_cirurgias where id = new.cirurgia_id for update;
  if not found then
    raise exception 'Cirurgia % não existe.', new.cirurgia_id;
  end if;

  if cir.status = 'cancelada' then
    raise exception
      'Esta cirurgia está CANCELADA. Não se registra conferência de segurança de um ato que não aconteceu.';
  end if;

  divergiu := (new.compressas_inicial    is distinct from new.compressas_final)
           or (new.instrumentais_inicial is distinct from new.instrumentais_final)
           or (new.agulhas_inicial       is distinct from new.agulhas_final);

  if new.tipo = 'conferencia' then
    -- (3) item não confirmado exige dizer o que houve
    if new.itens_confirmados < new.itens_total
       and length(btrim(coalesce(new.divergencia, ''))) < 15 then
      raise exception
        'Faltou confirmar % de % itens do %. Descreva o que não foi confirmado e como a equipe resolveu — checklist incompleto e calado parece completo para quem ler depois.',
        new.itens_total - new.itens_confirmados, new.itens_total, new.fase;
    end if;

    if new.fase = 'sign_out' then
      -- (5) a contagem de compressas é a que sempre se faz
      if new.compressas_inicial is null or new.compressas_final is null then
        raise exception
          'O Sign Out exige a contagem de compressas (inicial e final). Corpo estranho retido é never event, e a contagem existe para a diferença aparecer como número.';
      end if;
      -- (4) contagem divergente sem explicação
      if divergiu and length(btrim(coalesce(new.divergencia, ''))) < 15 then
        raise exception
          'A contagem NÃO fecha (compressas %/%, instrumentais %/%, agulhas %/%). Isto não se registra como conferência normal: descreva o que foi feito — radiografia, nova busca, o que for.',
          new.compressas_inicial, new.compressas_final,
          new.instrumentais_inicial, new.instrumentais_final,
          new.agulhas_inicial, new.agulhas_final;
      end if;
    end if;
  end if;

  -- O selo só é aceso por CONFERÊNCIA. Pulo registra o pulo e deixa o selo
  -- apagado — senão o indicador de adesão contaria o pulo como adesão.
  if new.tipo = 'conferencia' then
    campo := case new.fase
               when 'sign_in'  then 'chk_sign_in'
               when 'time_out' then 'chk_time_out'
               when 'sign_out' then 'chk_sign_out'
             end;
    execute format('update public.cc_cirurgias set %I = true, updated_at = now() where id = $1', campo)
      using new.cirurgia_id;

    -- 🔴 O "204 MENTIROSO" TAMBÉM EXISTE AQUI. Se a RLS recusar o UPDATE, ele
    -- altera ZERO linha sem erro nenhum — e a trilha registraria uma
    -- conferência cujo selo nunca acendeu. Confere e derruba tudo.
    if not found then
      raise exception
        'Não consegui marcar o checklist na cirurgia % — seu perfil não edita o Bloco. Nada foi registrado.',
        new.cirurgia_id;
    end if;
  end if;

  return new;
end $cc_chk$;

drop trigger if exists trg_cc_aplica_checklist on public.cc_checklist;
create trigger trg_cc_aplica_checklist
  before insert on public.cc_checklist
  for each row execute function public.cc_aplica_checklist();


-- ───────────────────────────────────────────────────────────
-- 4. QUEM PODE
--
-- Lê quem lê o Bloco; grava quem EDITA o Bloco. Sem UPDATE e sem DELETE: a
-- trilha é imutável, e conferência refeita é linha nova.
--
-- Os nomes seguem a convenção do `gerar-rls.mjs`, para o gerador SUBSTITUIR
-- estas políticas em vez de criar um segundo conjunto ao lado — a lição que
-- custou uma migração de correção em `at_desfecho_correcoes`.
-- ───────────────────────────────────────────────────────────
alter table public.cc_checklist enable row level security;

drop policy if exists cc_checklist_leitura on public.cc_checklist;
create policy cc_checklist_leitura on public.cc_checklist
  for select to authenticated
  using (public.pode_ver_algum('bloco'));

drop policy if exists cc_checklist_ins on public.cc_checklist;
create policy cc_checklist_ins on public.cc_checklist
  for insert to authenticated
  with check (public.my_role() in ('adm_master', 'adm_silver'));

drop policy if exists cc_checklist_mod_ins on public.cc_checklist;
create policy cc_checklist_mod_ins on public.cc_checklist
  as restrictive for insert to authenticated
  with check (public.pode_editar_algum('bloco'));


insert into public.migracoes_aplicadas (arquivo)
values ('migracao-cirurgia-segura-registro.sql') on conflict do nothing;

reset valentrax.quem;

notify pgrst, 'reload schema';


-- ───────────────────────────────────────────────────────────
-- CONFERÊNCIA
-- ───────────────────────────────────────────────────────────
select item, case when ok then '✅' else '❌' end as situacao from (
  select 'tabela cc_checklist existe' as item,
         to_regclass('public.cc_checklist') is not null as ok
  union all
  select 'coluna cc_checklist.' || c,
         exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'cc_checklist' and column_name = c)
    from unnest(array['cirurgia_id','tipo','fase','itens','itens_total','itens_confirmados',
                      'divergencia','compressas_inicial','compressas_final','usuario','assinatura','criado_em']) c
  union all
  select 'coluna cc_cirurgias.' || c,
         exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'cc_cirurgias' and column_name = c)
    from unnest(array['sitio_cirurgico','lateralidade','consentimento_em']) c
  union all
  select 'trava ' || k,
         exists (select 1 from pg_constraint where conname = k)
    from unnest(array['cc_chk_fase_ck','cc_chk_tipo_ck','cc_chk_pulo_motivo_ck',
                      'cc_chk_contados_ck','cc_cir_lateralidade_ck']) k
  union all
  select 'gatilho que aplica o selo', exists (select 1 from pg_trigger where tgname = 'trg_cc_aplica_checklist')
  union all
  select 'a leitura da cirurgia trava a linha (for update)',
         exists (select 1 from pg_proc where proname = 'cc_aplica_checklist'
                   and prosrc ~* 'where id = new\.cirurgia_id for update')
  union all
  select 'política ' || p,
         exists (select 1 from pg_policies where tablename = 'cc_checklist' and policyname = p)
    from unnest(array['cc_checklist_leitura','cc_checklist_ins','cc_checklist_mod_ins']) p
  union all
  select 'trilha é imutável (sem update/delete)',
         not exists (select 1 from pg_policies where tablename = 'cc_checklist' and cmd in ('UPDATE', 'DELETE'))
  union all
  select 'migração anotada no registro',
         exists (select 1 from public.migracoes_aplicadas
                  where arquivo = 'migracao-cirurgia-segura-registro.sql')
) x;
