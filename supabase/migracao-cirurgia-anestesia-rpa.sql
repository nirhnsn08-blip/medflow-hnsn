-- ═══════════════════════════════════════════════════════════
-- A FICHA ANESTÉSICA E A ALTA DA RPA COM ESCORE
--
-- Fecha os dois documentos que faltavam. A CFM 1.638/2002 nomeia TRÊS para
-- o paciente operado: descrição cirúrgica (já entregue, `cc_descricao`),
-- FICHA ANESTÉSICA e FICHA DE RECUPERAÇÃO PÓS-ANESTÉSICA.
--
-- 🔴 BURACO 1: `cc_cirurgias.tipo_anestesia` existe desde o primeiro dia e
-- tem ZERO usos na tela. Coluna sem input — ninguém nunca pôde preenchê-la,
-- e ninguém percebeu, porque coluna vazia não dá erro. O ato anestésico, que
-- é onde o paciente para de respirar sozinho, não tinha registro nenhum.
--
-- 🔴 BURACO 2, E É O PIOR: A ALTA DA RPA É UM BOTÃO.
--
--     marcar(c, { status: "concluida", rpa_saida_em: nowISO() })
--
-- Nenhum parâmetro, nenhum critério, nenhum registro. O paciente deixa a
-- recuperação pós-anestésica — exatamente onde ele para de ser vigiado,
-- onde acabam o monitor e a enfermagem 1:1 — porque alguém clicou. É nessa
-- janela que acontecem depressão respiratória, obstrução de via aérea e
-- hipotensão pós-raqui.
--
-- A CFM 2.174/2017 exige permanência em recuperação até consciência,
-- ventilação e circulação estáveis, com alta por profissional habilitado —
-- o que pressupõe critério REGISTRADO, não lembrado.
--
-- 💡 A SAÍDA: o escore de Aldrete (modificado, com oximetria no lugar da
-- cor da pele), SERIADO, e um gatilho que RECUSA a saída da RPA sem escore
-- que libere.
--
-- ⚠️ SERIADO, não uma foto: avalia-se na chegada e a cada 10–15 min. Por
-- isso é tabela com muitas linhas por cirurgia, e não cinco colunas em
-- `cc_cirurgias`. A CURVA é o que importa — um paciente que vai de 9 para 7
-- é uma emergência que uma foto esconderia.
--
-- ⚠️ O ESCORE LIBERA, NÃO DÁ ALTA. O gatilho recusa a saída sem escore
-- suficiente, mas nada neste arquivo dá alta sozinho ao atingir 9: isso
-- tiraria do anestesista uma decisão que é dele por norma.
--
-- 🔒 RECUSAS:
--   1. cirurgia que não existe / cancelada;
--   2. ficha anestésica repetida sem ser correção (vale a mesma regra da
--      descrição: existe UMA vigente, as outras são retificações);
--   3. correção sem motivo, para outra cirurgia, ou de versão já corrigida;
--   4. técnica anestésica fora do domínio;
--   5. nota de Aldrete fora de 0–2;
--   6. SAÍDA DA RPA sem escore que libere — soma mínima 9 E nenhum
--      parâmetro zerado. 8 pontos com apneia somam igual a 8 pontos bem
--      distribuídos, e os dois pacientes não têm nada em comum.
--
-- ⚠️ A ESCAPATÓRIA, E POR QUE ELA É NECESSÁRIA: a trava só vale quando o
-- paciente ENTROU na RPA (`rpa_entrada_em` preenchido). Cirurgia sob
-- anestesia local que vai direto para casa nunca passa pela recuperação —
-- exigir Aldrete dela seria exigir um documento que não existe para ser
-- escrito, e travaria a conclusão de uma cirurgia que terminou bem.
--
-- ADITIVA. IDEMPOTENTE.
--
-- COMO DESFAZER:
--   drop trigger if exists trg_cc_exige_aldrete on public.cc_cirurgias;
--   drop function if exists public.cc_exige_aldrete();
--   drop trigger if exists trg_cc_aplica_anestesia on public.cc_anestesia;
--   drop function if exists public.cc_aplica_anestesia();
--   drop table if exists public.cc_rpa_aldrete;
--   drop table if exists public.cc_anestesia;
--   alter table public.cc_cirurgias drop column if exists anestesia_em;
-- ═══════════════════════════════════════════════════════════

set valentrax.quem = 'adauam';


-- ───────────────────────────────────────────────────────────
-- 1. O SELO DA FICHA ANESTÉSICA
--    Mesmo desenho de `descricao_em`: derivado, mantido pelo gatilho, para
--    o painel do dia perguntar "quem operou hoje e não tem ficha?" sem
--    varrer a tabela de documentos de cada cartão.
-- ───────────────────────────────────────────────────────────
alter table public.cc_cirurgias
  add column if not exists anestesia_em timestamptz;

comment on column public.cc_cirurgias.anestesia_em is
  'Quando a ficha anestésica foi registrada. Carimbado pelo gatilho de cc_anestesia — não escrever à mão.';


-- ───────────────────────────────────────────────────────────
-- 2. A FICHA ANESTÉSICA
-- ───────────────────────────────────────────────────────────
create table if not exists public.cc_anestesia (
  id bigserial primary key,
  cirurgia_id bigint not null,

  versao int not null default 1,
  corrige_id bigint,
  motivo_correcao text,

  -- LISTA, não campo: geral + peridural para analgesia pós-operatória é
  -- combinação comum, e guardar só uma apagaria metade do ato.
  tecnicas text[] not null default '{}',

  -- O risco com que o paciente entrou. `asa_emergencia` é flag SEPARADA e
  -- não um sexto valor: um ASA II operado de emergência continua ASA II, e
  -- misturar impediria comparar eletiva com urgência.
  asa text,
  asa_emergencia boolean not null default false,

  -- 🔴 VIA AÉREA DIFÍCIL É CAMPO PRÓPRIO, não uma frase nas intercorrências.
  -- Intubação difícil não avisada é a emergência que mata na indução, e a
  -- única forma de o próximo anestesista saber é estar escrito EM CAMPO QUE
  -- VIRA ALERTA. Frase perdida em texto livre não vira alerta.
  via_aerea text,
  via_aerea_dificil boolean not null default false,
  via_aerea_manejo text,

  jejum_horas numeric(4,1),
  intercorrencias text,

  usuario text,
  assinatura text,
  criado_em timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cc_anest_cirurgia_fk') then
    alter table public.cc_anestesia add constraint cc_anest_cirurgia_fk
      foreign key (cirurgia_id) references public.cc_cirurgias (id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cc_anest_corrige_fk') then
    alter table public.cc_anestesia add constraint cc_anest_corrige_fk
      foreign key (corrige_id) references public.cc_anestesia (id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cc_anest_tecnicas_ck') then
    alter table public.cc_anestesia add constraint cc_anest_tecnicas_ck
      -- ⚠️ `cardinality`, NÃO `array_length(x, 1)`: em array vazio o
      -- segundo devolve NULL, e check constraint que avalia NULL PASSA.
      -- A ficha sem técnica nenhuma entrava calada — pego pela prova em
      -- PGlite, não por leitura do código.
      check (cardinality(tecnicas) >= 1 and tecnicas <@ array[
        'geral','raquidiana','peridural','bloqueio','sedacao','local']::text[]);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cc_anest_asa_ck') then
    alter table public.cc_anestesia add constraint cc_anest_asa_ck
      check (asa is null or asa in ('I','II','III','IV','V','VI'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cc_anest_via_ck') then
    alter table public.cc_anestesia add constraint cc_anest_via_ck
      check (via_aerea is null or via_aerea in (
        'nenhuma','cateter_o2','mascara_laringea','intubacao','nasotraqueal','traqueostomia'));
  end if;

  -- Difícil sem dizer COMO foi resolvida é a pior combinação: o próximo
  -- anestesista sabe que vai ser difícil e não sabe o que funcionou.
  if not exists (select 1 from pg_constraint where conname = 'cc_anest_manejo_ck') then
    alter table public.cc_anestesia add constraint cc_anest_manejo_ck
      check (not via_aerea_dificil or length(btrim(coalesce(via_aerea_manejo, ''))) >= 15);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cc_anest_correcao_motivo_ck') then
    alter table public.cc_anestesia add constraint cc_anest_correcao_motivo_ck
      check (corrige_id is null or length(btrim(coalesce(motivo_correcao, ''))) >= 15);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cc_anest_jejum_ck') then
    alter table public.cc_anestesia add constraint cc_anest_jejum_ck
      check (jejum_horas is null or (jejum_horas >= 0 and jejum_horas <= 240));
  end if;
end $$;

create index if not exists cc_anestesia_cirurgia_idx on public.cc_anestesia (cirurgia_id, versao desc);
create unique index if not exists cc_anestesia_corrige_idx
  on public.cc_anestesia (corrige_id) where corrige_id is not null;

comment on table public.cc_anestesia is
  'Ficha anestésica (CFM 1.638/2002). APPEND-ONLY: correção é versão nova com motivo.';
comment on column public.cc_anestesia.via_aerea_dificil is
  'Campo próprio de propósito: vira alerta permanente do PACIENTE, não do episódio.';


-- ───────────────────────────────────────────────────────────
-- 3. A FICHA DE RECUPERAÇÃO — o Aldrete, seriado
-- ───────────────────────────────────────────────────────────
create table if not exists public.cc_rpa_aldrete (
  id bigserial primary key,
  cirurgia_id bigint not null,

  -- Cinco parâmetros, 0 a 2 cada (Aldrete & Kroulik modificado: oximetria
  -- no lugar da cor da pele, porque oxímetro existe em toda RPA desde os
  -- anos 90 e "paciente corado" é observação, não medida).
  atividade   smallint not null,
  respiracao  smallint not null,
  circulacao  smallint not null,
  consciencia smallint not null,
  saturacao   smallint not null,

  -- GERADO pelo banco. Soma calculada na tela divergiria da soma do
  -- gatilho que libera a alta, e aí a tela diria 9 e o banco recusaria.
  total smallint generated always as
    (atividade + respiracao + circulacao + consciencia + saturacao) stored,

  observacao text,
  usuario text,
  assinatura text,
  criado_em timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cc_rpa_cirurgia_fk') then
    alter table public.cc_rpa_aldrete add constraint cc_rpa_cirurgia_fk
      foreign key (cirurgia_id) references public.cc_cirurgias (id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cc_rpa_notas_ck') then
    alter table public.cc_rpa_aldrete add constraint cc_rpa_notas_ck
      check (atividade between 0 and 2 and respiracao between 0 and 2
         and circulacao between 0 and 2 and consciencia between 0 and 2
         and saturacao between 0 and 2);
  end if;
end $$;

create index if not exists cc_rpa_aldrete_cirurgia_idx
  on public.cc_rpa_aldrete (cirurgia_id, criado_em desc);

comment on table public.cc_rpa_aldrete is
  'Ficha de recuperação pós-anestésica (CFM 1.638/2002). Escore de Aldrete SERIADO — uma linha por avaliação.';


-- ───────────────────────────────────────────────────────────
-- 4. O GATILHO DA FICHA ANESTÉSICA — versão, selo e recusas
-- ───────────────────────────────────────────────────────────
create or replace function public.cc_aplica_anestesia()
returns trigger
language plpgsql
set search_path = public
as $cc_anest$
declare
  cir      public.cc_cirurgias%rowtype;
  anterior public.cc_anestesia%rowtype;
  vigente  bigint;
  quantas  int;
begin
  select * into cir from public.cc_cirurgias where id = new.cirurgia_id for update;
  if not found then
    raise exception 'Cirurgia % não existe.', new.cirurgia_id;
  end if;

  if cir.status = 'cancelada' then
    raise exception
      'Esta cirurgia está CANCELADA. Não há ato anestésico a registrar.';
  end if;

  select count(*) into quantas from public.cc_anestesia where cirurgia_id = new.cirurgia_id;

  if new.corrige_id is null then
    if quantas > 0 then
      raise exception
        'Esta cirurgia já tem ficha anestésica. O prontuário não se rasura: abra uma CORREÇÃO da versão vigente e diga o que estava errado.';
    end if;
    new.versao := 1;
  else
    select * into anterior from public.cc_anestesia where id = new.corrige_id;
    if not found then
      raise exception 'A ficha % que esta correção deveria corrigir não existe.', new.corrige_id;
    end if;
    if anterior.cirurgia_id <> new.cirurgia_id then
      raise exception
        'Esta correção aponta para a ficha anestésica de OUTRA cirurgia (#%).', anterior.cirurgia_id;
    end if;
    select id into vigente from public.cc_anestesia where corrige_id = new.corrige_id limit 1;
    if vigente is not null then
      raise exception
        'A versão % já foi corrigida (pela ficha #%). Corrija a versão VIGENTE.', anterior.versao, vigente;
    end if;
    new.versao := anterior.versao + 1;
  end if;

  update public.cc_cirurgias
     set anestesia_em = coalesce(anestesia_em, now()),
         -- `tipo_anestesia` era coluna sem input. Agora ela é mantida pelo
         -- gatilho a partir da ficha, para quem já lê a coluna antiga
         -- (relatórios, exportações) continuar vendo o dado certo.
         tipo_anestesia = array_to_string(new.tecnicas, ' + '),
         updated_at = now()
   where id = new.cirurgia_id;

  return new;
end;
$cc_anest$;

drop trigger if exists trg_cc_aplica_anestesia on public.cc_anestesia;
create trigger trg_cc_aplica_anestesia
  before insert on public.cc_anestesia
  for each row execute function public.cc_aplica_anestesia();


-- ───────────────────────────────────────────────────────────
-- 5. 🔴 O GATILHO QUE TRANSFORMA O BOTÃO EM DECISÃO
--
-- Recusa a SAÍDA DA RPA sem escore de Aldrete que libere. Dispara só na
-- transição de `rpa_saida_em` de NULL para preenchido — qualquer outro
-- update da cirurgia passa intocado.
-- ───────────────────────────────────────────────────────────
create or replace function public.cc_exige_aldrete()
returns trigger
language plpgsql
set search_path = public
as $cc_rpa$
declare
  melhor public.cc_rpa_aldrete%rowtype;
  zerados text;
begin
  -- Só a transição interessa.
  if new.rpa_saida_em is null or old.rpa_saida_em is not null then
    return new;
  end if;

  -- A escapatória: quem nunca entrou na RPA não tem ficha de recuperação
  -- para escrever. Anestesia local que vai direto para casa é o caso.
  if old.rpa_entrada_em is null and new.rpa_entrada_em is null then
    return new;
  end if;

  -- A MELHOR avaliação registrada, e não a última: o paciente pode ter
  -- atingido 10 e piorado por um registro de conferência posterior; o que
  -- a norma pede é que ele TENHA atingido o critério. A curva fica na
  -- trilha para quem precisar julgar.
  select * into melhor
    from public.cc_rpa_aldrete
   where cirurgia_id = new.id
   order by total desc, criado_em desc
   limit 1;

  if not found then
    raise exception
      'Alta da RPA SEM escore de Aldrete. O paciente está saindo da recuperação pós-anestésica — onde acabam o monitor e a enfermagem 1:1 — e não há registro de que ele atingiu critério. Registre a avaliação antes de dar alta (CFM 2.174/2017).';
  end if;

  select string_agg(p, ', ') into zerados from (
    select 'atividade' as p where melhor.atividade = 0
    union all select 'respiração'  where melhor.respiracao = 0
    union all select 'circulação'  where melhor.circulacao = 0
    union all select 'consciência' where melhor.consciencia = 0
    union all select 'saturação'   where melhor.saturacao = 0
  ) z;

  if zerados is not null then
    raise exception
      'Alta da RPA recusada: % com nota ZERO (Aldrete %/10). Nenhum parâmetro zerado tem alta, por maior que seja a soma.',
      zerados, melhor.total;
  end if;

  if melhor.total < 9 then
    raise exception
      'Alta da RPA recusada: melhor Aldrete registrado foi %/10, e o mínimo é 9. Reavalie em 10 a 15 minutos.',
      melhor.total;
  end if;

  return new;
end;
$cc_rpa$;

drop trigger if exists trg_cc_exige_aldrete on public.cc_cirurgias;
create trigger trg_cc_exige_aldrete
  before update on public.cc_cirurgias
  for each row execute function public.cc_exige_aldrete();


-- ───────────────────────────────────────────────────────────
-- 6. RLS — leitura pelo mapa, escrita do Bloco, append-only
--
-- Nomes na convenção do `gerar-rls.mjs` para o gerador SUBSTITUIR estas
-- políticas em vez de criar um segundo conjunto ao lado.
--
-- ⚠️ `pode_ver_algum` é VARIADIC: módulos como argumentos soltos, nunca
-- array — `array[...]` não resolve e derruba a migração.
-- ───────────────────────────────────────────────────────────
alter table public.cc_anestesia enable row level security;
alter table public.cc_rpa_aldrete enable row level security;

drop policy if exists cc_anestesia_leitura on public.cc_anestesia;
create policy cc_anestesia_leitura on public.cc_anestesia
  for select to authenticated using (public.pode_ver_algum('bloco', 'paciente'));
drop policy if exists cc_anestesia_ins on public.cc_anestesia;
create policy cc_anestesia_ins on public.cc_anestesia
  for insert to authenticated with check (public.my_role() in ('adm_master', 'adm_silver'));
drop policy if exists cc_anestesia_mod_ins on public.cc_anestesia;
create policy cc_anestesia_mod_ins on public.cc_anestesia
  as restrictive for insert to authenticated with check (public.pode_editar_algum('bloco'));

drop policy if exists cc_rpa_aldrete_leitura on public.cc_rpa_aldrete;
create policy cc_rpa_aldrete_leitura on public.cc_rpa_aldrete
  for select to authenticated using (public.pode_ver_algum('bloco', 'paciente'));
drop policy if exists cc_rpa_aldrete_ins on public.cc_rpa_aldrete;
create policy cc_rpa_aldrete_ins on public.cc_rpa_aldrete
  for insert to authenticated with check (public.my_role() in ('adm_master', 'adm_silver'));
drop policy if exists cc_rpa_aldrete_mod_ins on public.cc_rpa_aldrete;
create policy cc_rpa_aldrete_mod_ins on public.cc_rpa_aldrete
  as restrictive for insert to authenticated with check (public.pode_editar_algum('bloco'));


insert into public.migracoes_aplicadas (arquivo)
values ('migracao-cirurgia-anestesia-rpa.sql') on conflict do nothing;

reset valentrax.quem;

notify pgrst, 'reload schema';


-- ───────────────────────────────────────────────────────────
-- CONFERÊNCIA
-- ───────────────────────────────────────────────────────────
select item, case when ok then '✅' else '❌' end as situacao from (
  select 'tabela ' || t as item, to_regclass('public.' || t) is not null as ok
    from unnest(array['cc_anestesia','cc_rpa_aldrete']) t
  union all
  select 'coluna cc_cirurgias.anestesia_em',
         exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='cc_cirurgias' and column_name='anestesia_em')
  union all
  select '🔴 gatilho que RECUSA alta da RPA sem Aldrete',
         exists (select 1 from pg_trigger where tgname = 'trg_cc_exige_aldrete')
  union all
  select 'gatilho da ficha anestésica',
         exists (select 1 from pg_trigger where tgname = 'trg_cc_aplica_anestesia')
  union all
  select 'total do Aldrete é coluna GERADA pelo banco',
         exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='cc_rpa_aldrete'
                    and column_name='total' and is_generated = 'ALWAYS')
  union all
  select 'trava ' || k,
         exists (select 1 from pg_constraint where conname = k)
    from unnest(array['cc_anest_tecnicas_ck','cc_anest_asa_ck','cc_anest_via_ck',
                      'cc_anest_manejo_ck','cc_rpa_notas_ck']) k
  union all
  -- 🔴 APPEND-ONLY nas duas: se vier ✅ com política de update ou delete,
  -- o documento virou editável e o prontuário deixou de ser registro.
  select '🔴 append-only: nenhuma política de update/delete',
         not exists (select 1 from pg_policies
                      where schemaname = 'public'
                        and tablename in ('cc_anestesia','cc_rpa_aldrete')
                        and cmd in ('UPDATE','DELETE'))
  union all
  select 'migração anotada no registro',
         exists (select 1 from public.migracoes_aplicadas
                  where arquivo = 'migracao-cirurgia-anestesia-rpa.sql')
) x;

-- O passivo que a tela passa a mostrar: operadas sem ficha anestésica, e
-- as que JÁ saíram da RPA sem nenhum escore registrado (essas são
-- históricas — o gatilho só vale daqui para a frente).
select count(*) filter (where anestesia_em is null
                          and status in ('em_cirurgia','recuperacao','concluida')) as sem_ficha_anestesica,
       count(*) filter (where rpa_saida_em is not null
                          and not exists (select 1 from public.cc_rpa_aldrete a where a.cirurgia_id = c.id)) as alta_da_rpa_sem_escore,
       count(*) as total
  from public.cc_cirurgias c;
