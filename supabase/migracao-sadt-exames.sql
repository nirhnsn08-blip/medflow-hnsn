-- ═══════════════════════════════════════════════════════════
-- EXAMES (SADT): O PEDIDO E O RESULTADO DEIXAM DE SER TEXTO LIVRE
--
-- 🔴 HOJE UM EXAME É UMA LINHA DE TEXTO.
--
--     ps_registros: tipo='exame', texto='hemograma', resultado='…', status
--
-- É só isso. Não há catálogo, não há analito, não há unidade, não há faixa
-- de referência, não há valor crítico. O resultado de um hemograma inteiro
-- cabe num `text` — e cabe porque ninguém pode fazer nada com ele.
--
-- O que o hospital perde com isso:
--   · não dá para saber se um valor está FORA da referência, porque o
--     sistema não sabe qual é a referência;
--   · não dá para destacar VALOR CRÍTICO — potássio 7,2, plaquetas 8 mil —,
--     que é exatamente o resultado que precisa chegar a alguém AGORA;
--   · não dá para ver a série (creatinina de ontem × de hoje), que é como
--     se enxerga lesão renal aguda;
--   · não dá para faturar o exame nem medir custo, porque ele não tem
--     código.
--
-- 💡 A ESTRUTURA, em quatro peças, e cada uma existe por um motivo:
--
--   `sadt_catalogo`   o que o hospital oferece, COM CÓDIGO (SIGTAP/TUSS)
--   `sadt_analitos`   os componentes de um exame — um hemograma tem ~20,
--                     cada um com unidade, referência e faixa crítica
--   `sadt_pedidos`    a solicitação: quem pediu, por quê, com que pressa
--   `sadt_itens`      cada exame do pedido, com o ciclo de vida
--   `sadt_resultados` o valor, APPEND-ONLY
--
-- 🔴 O `anormal` E O `critico` SÃO CALCULADOS PELO BANCO, no gatilho, a
-- partir da faixa do analito. Deixar a tela decidir criaria duas verdades:
-- a tela diria "normal" e o relatório diria "crítico", para a mesma linha.
-- E é o banco que tem a faixa.
--
-- ⚠️ CORREÇÃO É VERSÃO NOVA. Resultado de exame é documento clínico: um
-- laudo retificado não apaga o que foi laudado antes, porque alguém pode
-- ter tratado o paciente com base no primeiro.
--
-- 🔒 RECUSAS:
--   1. resultado de item que não existe ou foi CANCELADO;
--   2. resultado sem valor nenhum (nem número, nem texto, nem laudo);
--   3. analito que não é do exame pedido — misturar hemoglobina num
--      exame de urina quebra a série e o gráfico;
--   4. correção sem motivo, de outro item, ou de versão já corrigida;
--   5. faixa de referência invertida no cadastro (min > max).
--
-- ⚠️ O BACKFILL TRAZ O QUE JÁ EXISTE, e traz tudo: cada `ps_registros`
-- tipo='exame' vira um pedido com um item, mantendo status, datas e o
-- resultado como LAUDO. Não é dedução — é 1 para 1. Depois dele há UMA
-- fonte de exame no sistema, e não duas concordando por sorte.
--
-- ADITIVA: `ps_registros` não é alterada nem apagada. Fica como estava,
-- para conferência, e o código passa a ler as tabelas novas.
-- IDEMPOTENTE: o backfill marca a origem e não repete.
--
-- COMO DESFAZER:
--   drop trigger if exists trg_sadt_aplica_resultado on public.sadt_resultados;
--   drop function if exists public.sadt_aplica_resultado();
--   drop table if exists public.sadt_resultados, public.sadt_itens,
--                        public.sadt_pedidos, public.sadt_analitos,
--                        public.sadt_catalogo;
-- ═══════════════════════════════════════════════════════════

set valentrax.quem = 'adauam';


-- ───────────────────────────────────────────────────────────
-- 1. O CATÁLOGO
-- ───────────────────────────────────────────────────────────
create table if not exists public.sadt_catalogo (
  id bigserial primary key,
  codigo text,                      -- SIGTAP (SUS) ou TUSS (convênio)
  nome text not null,
  categoria text not null default 'laboratorial',
  material text,                    -- sangue, urina, escarro… (laboratório)
  preparo text,                     -- jejum de 8h, suspender metformina…
  -- O prazo PACTUADO, que é contra o que se mede atraso. Sem ele, "exame
  -- demorado" é opinião.
  prazo_rotina_min int,
  prazo_urgente_min int,
  ativo boolean not null default true,
  usuario text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sadt_cat_categoria_ck') then
    alter table public.sadt_catalogo add constraint sadt_cat_categoria_ck
      check (categoria in ('laboratorial', 'imagem', 'outro'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sadt_cat_nome_ck') then
    alter table public.sadt_catalogo add constraint sadt_cat_nome_ck
      check (length(btrim(nome)) >= 2);
  end if;
end $$;

create unique index if not exists sadt_catalogo_codigo_idx
  on public.sadt_catalogo (codigo) where codigo is not null;
create index if not exists sadt_catalogo_nome_idx on public.sadt_catalogo (lower(nome));


-- ───────────────────────────────────────────────────────────
-- 2. OS ANALITOS
--
-- 🔴 É AQUI QUE MORA A DIFERENÇA ENTRE TEXTO E DADO. "Hemograma" não tem
-- valor de referência; hemoglobina tem. Um exame é o pedido; os analitos
-- são o que volta com número.
--
-- `ref_texto` existe para o que não é faixa numérica ("negativo", "ausente",
-- "flora normal") — forçar tudo em número faria a cultura de urina não
-- caber, e aí ela voltaria para o texto livre de onde saímos.
-- ───────────────────────────────────────────────────────────
create table if not exists public.sadt_analitos (
  id bigserial primary key,
  catalogo_id bigint not null,
  codigo text,
  nome text not null,
  unidade text,
  ordem int not null default 0,     -- a ordem em que o laudo imprime

  ref_min numeric,
  ref_max numeric,
  ref_texto text,

  -- 🔴 VALOR CRÍTICO (pânico): o resultado que precisa chegar a alguém
  -- AGORA — potássio 7,2, plaquetas 8 mil, glicemia 25. É a lista que a
  -- acreditação chama de "valores críticos" e que o laboratório é obrigado
  -- a comunicar. Nulo = este analito não tem valor crítico definido.
  critico_min numeric,
  critico_max numeric,

  ativo boolean not null default true,
  usuario text,
  updated_at timestamptz default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sadt_ana_catalogo_fk') then
    alter table public.sadt_analitos add constraint sadt_ana_catalogo_fk
      foreign key (catalogo_id) references public.sadt_catalogo (id) on delete cascade;
  end if;
  -- Faixa invertida no cadastro faz TODO resultado sair anormal, ou nenhum.
  if not exists (select 1 from pg_constraint where conname = 'sadt_ana_ref_ck') then
    alter table public.sadt_analitos add constraint sadt_ana_ref_ck
      check (ref_min is null or ref_max is null or ref_min <= ref_max);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sadt_ana_critico_ck') then
    alter table public.sadt_analitos add constraint sadt_ana_critico_ck
      check (critico_min is null or critico_max is null or critico_min <= critico_max);
  end if;
end $$;

create index if not exists sadt_analitos_catalogo_idx
  on public.sadt_analitos (catalogo_id, ordem);


-- ───────────────────────────────────────────────────────────
-- 3. O PEDIDO
-- ───────────────────────────────────────────────────────────
create table if not exists public.sadt_pedidos (
  id bigserial primary key,
  prontuario text,
  ps_atendimento_id bigint,
  pep_episodio_id bigint,

  prioridade text not null default 'rotina',
  -- 🔴 A INDICAÇÃO CLÍNICA não é burocracia: é o que o radiologista lê para
  -- saber o que procurar, e é o que o SUS exige na APAC. "TC de crânio" sem
  -- indicação é um exame que volta laudado para a pergunta errada.
  indicacao_clinica text,

  solicitante text,
  solicitante_cbo text,
  assinatura text,
  usuario text,
  criado_em timestamptz not null default now(),

  -- De onde veio, quando veio do mundo antigo. O backfill preenche.
  origem_registro_id bigint
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sadt_ped_prioridade_ck') then
    alter table public.sadt_pedidos add constraint sadt_ped_prioridade_ck
      check (prioridade in ('rotina', 'urgente'));
  end if;
end $$;

create index if not exists sadt_pedidos_prontuario_idx
  on public.sadt_pedidos (prontuario, criado_em desc);
create index if not exists sadt_pedidos_atendimento_idx
  on public.sadt_pedidos (ps_atendimento_id) where ps_atendimento_id is not null;
-- O backfill não pode repetir.
create unique index if not exists sadt_pedidos_origem_idx
  on public.sadt_pedidos (origem_registro_id) where origem_registro_id is not null;


-- ───────────────────────────────────────────────────────────
-- 4. OS ITENS — o ciclo de vida de cada exame
--
-- ⚠️ Os estados são os MESMOS que `src/ps/exames.js` já usa
-- (solicitado → resultado_disponivel → visto), mais `coletado` e
-- `cancelado`. Inventar vocabulário novo faria a tela antiga e a nova
-- contarem histórias diferentes para a mesma linha.
-- ───────────────────────────────────────────────────────────
create table if not exists public.sadt_itens (
  id bigserial primary key,
  pedido_id bigint not null,
  catalogo_id bigint,               -- nulo = fora do catálogo (texto livre)
  descricao text not null,
  categoria text not null default 'laboratorial',

  status text not null default 'solicitado',
  coletado_em timestamptz,
  resultado_em timestamptz,
  visto_em timestamptz,
  visto_por text,
  cancelado_em timestamptz,
  cancelamento_motivo text,

  updated_at timestamptz default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sadt_item_pedido_fk') then
    alter table public.sadt_itens add constraint sadt_item_pedido_fk
      foreign key (pedido_id) references public.sadt_pedidos (id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sadt_item_catalogo_fk') then
    alter table public.sadt_itens add constraint sadt_item_catalogo_fk
      foreign key (catalogo_id) references public.sadt_catalogo (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sadt_item_status_ck') then
    alter table public.sadt_itens add constraint sadt_item_status_ck
      check (status in ('solicitado', 'coletado', 'resultado_disponivel', 'visto', 'cancelado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sadt_item_categoria_ck') then
    alter table public.sadt_itens add constraint sadt_item_categoria_ck
      check (categoria in ('laboratorial', 'imagem', 'outro'));
  end if;
  -- Cancelar exige dizer por quê — exame cancelado sem motivo vira dúvida
  -- na conta e na conferência do laboratório.
  if not exists (select 1 from pg_constraint where conname = 'sadt_item_cancel_ck') then
    alter table public.sadt_itens add constraint sadt_item_cancel_ck
      check (status <> 'cancelado' or length(btrim(coalesce(cancelamento_motivo, ''))) >= 5);
  end if;
end $$;

create index if not exists sadt_itens_pedido_idx on public.sadt_itens (pedido_id);
create index if not exists sadt_itens_status_idx on public.sadt_itens (status, resultado_em desc);


-- ───────────────────────────────────────────────────────────
-- 5. OS RESULTADOS — append-only
-- ───────────────────────────────────────────────────────────
create table if not exists public.sadt_resultados (
  id bigserial primary key,
  item_id bigint not null,
  analito_id bigint,                -- nulo = laudo do exame inteiro (imagem)

  -- O nome vai CARIMBADO junto do valor: o catálogo muda, o laudo não.
  nome text,
  valor_num numeric,
  valor_texto text,
  unidade text,
  referencia text,                  -- a faixa, como foi impressa no laudo
  laudo text,                       -- o texto do laudo (imagem, anatomopato)

  -- 🔴 CALCULADOS PELO GATILHO, nunca pela tela.
  anormal boolean not null default false,
  critico boolean not null default false,

  versao int not null default 1,
  corrige_id bigint,
  motivo_correcao text,

  liberado_por text,
  assinatura text,
  usuario text,
  criado_em timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sadt_res_item_fk') then
    alter table public.sadt_resultados add constraint sadt_res_item_fk
      foreign key (item_id) references public.sadt_itens (id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sadt_res_analito_fk') then
    alter table public.sadt_resultados add constraint sadt_res_analito_fk
      foreign key (analito_id) references public.sadt_analitos (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sadt_res_corrige_fk') then
    alter table public.sadt_resultados add constraint sadt_res_corrige_fk
      foreign key (corrige_id) references public.sadt_resultados (id);
  end if;
  -- Resultado sem valor nenhum é linha que ocupa espaço e não informa.
  if not exists (select 1 from pg_constraint where conname = 'sadt_res_valor_ck') then
    alter table public.sadt_resultados add constraint sadt_res_valor_ck
      check (valor_num is not null
          or length(btrim(coalesce(valor_texto, ''))) > 0
          or length(btrim(coalesce(laudo, ''))) > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sadt_res_correcao_ck') then
    alter table public.sadt_resultados add constraint sadt_res_correcao_ck
      check (corrige_id is null or length(btrim(coalesce(motivo_correcao, ''))) >= 15);
  end if;
end $$;

create index if not exists sadt_resultados_item_idx on public.sadt_resultados (item_id, versao desc);
-- 🔴 O índice do que importa: os críticos pendentes de alguém olhar.
create index if not exists sadt_resultados_critico_idx
  on public.sadt_resultados (criado_em desc) where critico;
create unique index if not exists sadt_resultados_corrige_idx
  on public.sadt_resultados (corrige_id) where corrige_id is not null;


-- ───────────────────────────────────────────────────────────
-- 6. O GATILHO — calcula anormal/crítico e acende o item
-- ───────────────────────────────────────────────────────────
create or replace function public.sadt_aplica_resultado()
returns trigger
language plpgsql
set search_path = public
as $sadt$
declare
  it       public.sadt_itens%rowtype;
  ana      public.sadt_analitos%rowtype;
  anterior public.sadt_resultados%rowtype;
  ja       bigint;
begin
  select * into it from public.sadt_itens where id = new.item_id for update;
  if not found then
    raise exception 'Item de exame % não existe.', new.item_id;
  end if;
  if it.status = 'cancelado' then
    raise exception
      'Este exame foi CANCELADO (%). Não se lança resultado de exame que não foi feito.',
      coalesce(it.cancelamento_motivo, 'sem motivo registrado');
  end if;

  if new.analito_id is not null then
    select * into ana from public.sadt_analitos where id = new.analito_id;
    if not found then
      raise exception 'Analito % não existe.', new.analito_id;
    end if;
    -- 🔴 Analito de OUTRO exame quebra a série: a creatinina do paciente
    -- passaria a misturar duas origens, e o gráfico mentiria.
    if it.catalogo_id is null or ana.catalogo_id <> it.catalogo_id then
      raise exception
        'O analito "%" não pertence ao exame pedido. Misturar analito de outro exame quebra a série do paciente.',
        ana.nome;
    end if;
    new.nome := coalesce(new.nome, ana.nome);
    new.unidade := coalesce(new.unidade, ana.unidade);
    if new.referencia is null then
      new.referencia := case
        when ana.ref_texto is not null then ana.ref_texto
        when ana.ref_min is not null and ana.ref_max is not null
          then ana.ref_min::text || ' a ' || ana.ref_max::text
        when ana.ref_min is not null then '≥ ' || ana.ref_min::text
        when ana.ref_max is not null then '≤ ' || ana.ref_max::text
        else null end;
    end if;

    -- ANORMAL e CRÍTICO, do banco, sempre.
    if new.valor_num is not null then
      new.anormal := (ana.ref_min is not null and new.valor_num < ana.ref_min)
                  or (ana.ref_max is not null and new.valor_num > ana.ref_max);
      new.critico := (ana.critico_min is not null and new.valor_num <= ana.critico_min)
                  or (ana.critico_max is not null and new.valor_num >= ana.critico_max);
      -- Crítico é sempre anormal: a faixa de pânico fica fora da de
      -- referência por definição, e um crítico que saísse "normal" na tela
      -- seria a pior linha deste banco.
      if new.critico then new.anormal := true; end if;
    end if;
  end if;

  if new.corrige_id is not null then
    select * into anterior from public.sadt_resultados where id = new.corrige_id;
    if not found then
      raise exception 'O resultado % que esta correção deveria corrigir não existe.', new.corrige_id;
    end if;
    if anterior.item_id <> new.item_id then
      raise exception 'Esta correção aponta para o resultado de OUTRO exame.';
    end if;
    select id into ja from public.sadt_resultados where corrige_id = new.corrige_id limit 1;
    if ja is not null then
      raise exception 'A versão % já foi corrigida (pelo resultado #%).', anterior.versao, ja;
    end if;
    new.versao := anterior.versao + 1;
  else
    new.versao := 1;
  end if;

  -- O item passa a ter resultado. `visto` não regride: médico que já viu
  -- não desvê, e uma correção posterior aparece como versão nova.
  update public.sadt_itens
     set status = case when status in ('solicitado', 'coletado') then 'resultado_disponivel' else status end,
         resultado_em = coalesce(resultado_em, now()),
         updated_at = now()
   where id = new.item_id;

  return new;
end;
$sadt$;

drop trigger if exists trg_sadt_aplica_resultado on public.sadt_resultados;
create trigger trg_sadt_aplica_resultado
  before insert on public.sadt_resultados
  for each row execute function public.sadt_aplica_resultado();


-- ───────────────────────────────────────────────────────────
-- 7. O BACKFILL — o que já existe vira pedido
--
-- 1 para 1, sem dedução: cada `ps_registros` tipo='exame' vira um pedido
-- com um item, mantendo status, datas e o resultado como LAUDO. O
-- `origem_registro_id` impede repetir numa segunda execução.
-- ───────────────────────────────────────────────────────────
insert into public.sadt_pedidos
  (prontuario, ps_atendimento_id, prioridade, solicitante, usuario, criado_em, origem_registro_id)
select a.prontuario, r.atendimento_id, 'rotina', r.usuario, r.usuario, r.criado_em, r.id
  from public.ps_registros r
  left join public.ps_atendimentos a on a.id = r.atendimento_id
 where r.tipo = 'exame'
   and not exists (select 1 from public.sadt_pedidos p where p.origem_registro_id = r.id);

insert into public.sadt_itens
  (pedido_id, descricao, categoria, status, resultado_em)
select p.id,
       coalesce(nullif(btrim(r.texto), ''), '(exame sem descrição)'),
       case when r.categoria in ('laboratorial', 'imagem', 'outro') then r.categoria else 'outro' end,
       case when r.status in ('solicitado', 'coletado', 'resultado_disponivel', 'visto', 'cancelado')
            then r.status else 'solicitado' end,
       r.resultado_em
  from public.sadt_pedidos p
  join public.ps_registros r on r.id = p.origem_registro_id
 where not exists (select 1 from public.sadt_itens i where i.pedido_id = p.id);

-- O resultado antigo era texto: entra como LAUDO, que é o campo honesto
-- para ele. Sem analito, sem número — porque não havia nenhum dos dois.
insert into public.sadt_resultados (item_id, laudo, criado_em, usuario)
select i.id, btrim(r.resultado), coalesce(r.resultado_em, r.criado_em), r.usuario
  from public.sadt_itens i
  join public.sadt_pedidos p on p.id = i.pedido_id
  join public.ps_registros r on r.id = p.origem_registro_id
 where btrim(coalesce(r.resultado, '')) <> ''
   and not exists (select 1 from public.sadt_resultados s where s.item_id = i.id);


-- ───────────────────────────────────────────────────────────
-- 8. RLS
--
-- Lê quem cuida do paciente; grava quem tem escrita no módulo. O catálogo
-- é referência SEM dado de paciente — TODOS leem, como `at_procedimentos`.
-- ───────────────────────────────────────────────────────────
alter table public.sadt_catalogo   enable row level security;
alter table public.sadt_analitos   enable row level security;
alter table public.sadt_pedidos    enable row level security;
alter table public.sadt_itens      enable row level security;
alter table public.sadt_resultados enable row level security;

do $$
declare t text;
begin
  foreach t in array array['sadt_catalogo', 'sadt_analitos'] loop
    execute format('drop policy if exists %I on public.%I', t || '_leitura', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_leitura', t);
    execute format('drop policy if exists %I on public.%I', t || '_ins', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.my_role() in (''adm_master'',''adm_silver''))', t || '_ins', t);
    execute format('drop policy if exists %I on public.%I', t || '_upd', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.my_role() in (''adm_master'',''adm_silver'')) with check (public.my_role() in (''adm_master'',''adm_silver''))', t || '_upd', t);
  end loop;

  foreach t in array array['sadt_pedidos', 'sadt_itens', 'sadt_resultados'] loop
    execute format('drop policy if exists %I on public.%I', t || '_leitura', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.pode_ver_algum(''ps'', ''paciente'', ''ambulatorio''))', t || '_leitura', t);
    execute format('drop policy if exists %I on public.%I', t || '_ins', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.my_role() in (''adm_master'',''adm_silver''))', t || '_ins', t);
    execute format('drop policy if exists %I on public.%I', t || '_mod_ins', t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (public.pode_editar_algum(''ps'', ''paciente''))', t || '_mod_ins', t);
  end loop;

  -- Os ITENS mudam de estado (coletado, visto, cancelado) — só eles.
  -- Pedido e resultado são imutáveis: correção é linha nova.
  execute 'drop policy if exists sadt_itens_upd on public.sadt_itens';
  execute 'create policy sadt_itens_upd on public.sadt_itens for update to authenticated
             using (public.pode_editar_algum(''ps'', ''paciente''))
             with check (public.pode_editar_algum(''ps'', ''paciente''))';
end $$;


insert into public.migracoes_aplicadas (arquivo)
values ('migracao-sadt-exames.sql') on conflict do nothing;

reset valentrax.quem;

notify pgrst, 'reload schema';


-- ───────────────────────────────────────────────────────────
-- CONFERÊNCIA
-- ───────────────────────────────────────────────────────────
select item, case when ok then '✅' else '❌' end as situacao from (
  select 'tabela ' || t as item, to_regclass('public.' || t) is not null as ok
    from unnest(array['sadt_catalogo','sadt_analitos','sadt_pedidos','sadt_itens','sadt_resultados']) t
  union all
  select '🔴 gatilho que calcula anormal/crítico',
         exists (select 1 from pg_trigger where tgname = 'trg_sadt_aplica_resultado')
  union all
  select 'trava ' || k, exists (select 1 from pg_constraint where conname = k)
    from unnest(array['sadt_ana_ref_ck','sadt_ana_critico_ck','sadt_res_valor_ck',
                      'sadt_item_status_ck','sadt_item_cancel_ck']) k
  union all
  select '🔴 índice dos críticos',
         exists (select 1 from pg_class where relname = 'sadt_resultados_critico_idx')
  union all
  select 'o backfill não repete (índice de origem)',
         exists (select 1 from pg_class where relname = 'sadt_pedidos_origem_idx')
  union all
  -- 🔴 APPEND-ONLY no resultado: correção é versão nova.
  select '🔴 resultado sem política de update/delete',
         not exists (select 1 from pg_policies
                      where schemaname='public' and tablename='sadt_resultados' and cmd in ('UPDATE','DELETE'))
  union all
  select 'migração anotada no registro',
         exists (select 1 from public.migracoes_aplicadas where arquivo = 'migracao-sadt-exames.sql')
) x;

-- O que o backfill trouxe. `migrados` tem de bater com `exames_antigos`.
select (select count(*) from public.ps_registros where tipo = 'exame')     as exames_antigos,
       (select count(*) from public.sadt_pedidos where origem_registro_id is not null) as migrados,
       (select count(*) from public.sadt_itens)                            as itens,
       (select count(*) from public.sadt_resultados)                       as resultados,
       (select count(*) from public.sadt_catalogo)                         as no_catalogo;
