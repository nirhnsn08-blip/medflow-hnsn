-- ═══════════════════════════════════════════════════════════
-- A DESCRIÇÃO CIRÚRGICA — o documento que a lei nomeia e que não existia
--
-- 🔴 O QUE ESTÁ ERRADO HOJE
--
-- A CFM 1.638/2002 lista o conteúdo mínimo do prontuário e, para o paciente
-- operado, nomeia três documentos: DESCRIÇÃO CIRÚRGICA, ficha anestésica e
-- ficha de recuperação pós-anestésica. Nenhum dos três existe neste
-- sistema. O que `cc_cirurgias` tem é `observacao text` — campo livre,
-- opcional, único, sobrescrevível e sem autoria.
--
-- Então o ato de maior risco do hospital termina assim: o status vira
-- `concluida`, o horário de fim é gravado, e o que foi FEITO não está em
-- lugar nenhum. Quem atende o paciente depois não sabe a via de acesso, se
-- houve intercorrência, quanto sangrou, se ficou dreno, se saiu peça para
-- o anatomopatológico. O cirurgião que operou sabe; o prontuário, não.
--
-- 🔴 E O SEGUNDO BURACO, QUE É FINANCEIRO E CLÍNICO AO MESMO TEMPO:
-- o procedimento REALIZADO pode não ser o agendado. Videolaparoscopia que
-- converte para laparotomia é outro porte, outro código, outra conta — e o
-- PR anterior (a cirurgia virando conta) fatura `cc_cirurgias.procedimento_cod`,
-- que é o do AGENDAMENTO. Sem onde registrar a conversão, o sistema cobra o
-- que foi marcado e não o que aconteceu, e ninguém percebe: a conta fecha,
-- bate com o agendamento, e está errada.
--
-- 💡 A SAÍDA: um documento APPEND-ONLY por cirurgia, com o procedimento
-- realizado em campo próprio.
--
-- ⚠️ CORREÇÃO É VERSÃO NOVA, NUNCA EDIÇÃO. É a mesma regra do resto do
-- registro clínico deste sistema (evolução, trilha de cirurgia segura,
-- correção de desfecho) e é a regra do CFM: prontuário não se rasura,
-- corrige-se com anotação nova, datada e assinada. Por isso não há política
-- de UPDATE nem de DELETE nesta tabela — a ausência é a trava.
--
-- 🔒 RECUSAS, TODAS NO BANCO (tela não é defesa — um POST pela API passa por
-- cima dela):
--   1. cirurgia que não existe;
--   2. cirurgia CANCELADA — não se descreve ato que não houve;
--   3. cirurgia que ainda não entrou em sala — descrever antes de operar é
--      documento pré-datado, que é falsidade;
--   4. narrativa curta demais para ser descrição de alguma coisa;
--   5. SEGUNDA descrição sem ser correção — existe UMA descrição vigente, e
--      as outras são retificações dela, com motivo;
--   6. correção sem motivo, apontando para descrição de OUTRA cirurgia, ou
--      para uma versão que já foi corrigida (isso ramificaria a cadeia e
--      criariam-se duas "versões vigentes" ao mesmo tempo);
--   7. conversão de via marcada sem dizer por quê — a taxa de conversão é
--      indicador de bloco, e "convertida, motivo em branco" não ensina nada.
--
-- O gatilho CALCULA a versão (nunca confia na que vier da tela: dois
-- navegadores mandariam a mesma) e carimba `descricao_em` em `cc_cirurgias`
-- no MESMO insert — ou o documento e o selo entram juntos, ou nada entra.
--
-- ⚠️ `for update` na linha da cirurgia, pelo mesmo motivo do gatilho do
-- checklist: sem o lock, duas gravações simultâneas leem a mesma "última
-- versão" e gravam duas versão 2. O PGlite não mostra isso — tem uma
-- conexão só.
--
-- ADITIVA: nenhuma coluna existente muda, nada é apagado.
-- IDEMPOTENTE: pode rodar duas vezes.
--
-- COMO DESFAZER:
--   drop trigger if exists trg_cc_aplica_descricao on public.cc_descricao;
--   drop function if exists public.cc_aplica_descricao();
--   drop table if exists public.cc_descricao;
--   alter table public.cc_cirurgias drop column if exists descricao_em;
-- ═══════════════════════════════════════════════════════════

set valentrax.quem = 'adauam';


-- ───────────────────────────────────────────────────────────
-- 1. O SELO NA CIRURGIA
--
-- Existe para o painel do dia poder perguntar "quais cirurgias de hoje
-- terminaram e não têm descrição?" sem varrer a tabela de documentos de
-- cada cartão. É derivado — o gatilho o mantém —, e isso é deliberado: o
-- mesmo desenho do `chk_sign_in`, que a trilha acende.
-- ───────────────────────────────────────────────────────────
alter table public.cc_cirurgias
  add column if not exists descricao_em timestamptz;

comment on column public.cc_cirurgias.descricao_em is
  'Quando a descrição cirúrgica foi registrada. Carimbado pelo gatilho de cc_descricao — não escrever à mão.';


-- ───────────────────────────────────────────────────────────
-- 2. O DOCUMENTO
-- ───────────────────────────────────────────────────────────
create table if not exists public.cc_descricao (
  id bigserial primary key,
  cirurgia_id bigint not null,

  -- A CADEIA DE VERSÕES. `versao` é calculada pelo gatilho; `corrige_id`
  -- aponta para a versão que esta substitui. A vigente é a que ninguém
  -- corrigiu depois.
  versao int not null default 1,
  corrige_id bigint,
  motivo_correcao text,

  -- O QUE FOI FEITO — e não o que foi marcado.
  -- `procedimento_cod` aqui vence o do agendamento na hora de faturar: é
  -- este que descreve o ato que aconteceu.
  procedimento_realizado text not null,
  procedimento_cod text,
  via_acesso text,
  conversao boolean not null default false,
  conversao_motivo text,

  -- A NARRATIVA. `descricao` é o corpo do documento; `achados` separa o que
  -- se encontrou do que se fez, porque é o que o próximo médico procura.
  achados text,
  descricao text not null,
  intercorrencias text,
  cid_pos text,

  -- O QUE SAIU E O QUE FICOU.
  sangramento_ml int,
  hemotransfusao boolean,
  drenos text,

  -- PEÇA CIRÚRGICA. Descrever a peça e não dizer se ela foi enviada é como
  -- o sistema perde um anatomopatológico: todo mundo supõe que alguém levou.
  -- A trava abaixo obriga a resposta — inclusive "não", que vira pendência
  -- visível em vez de silêncio.
  amostras text,
  amostra_enviada boolean,

  -- Quem assina. `assinatura` é carimbada no ato (nome + conselho +
  -- registro), como o resto do PEP: o cadastro muda, o documento não.
  usuario text,
  assinatura text,
  criado_em timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cc_desc_cirurgia_fk') then
    alter table public.cc_descricao
      add constraint cc_desc_cirurgia_fk
      foreign key (cirurgia_id) references public.cc_cirurgias (id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cc_desc_corrige_fk') then
    alter table public.cc_descricao
      add constraint cc_desc_corrige_fk
      foreign key (corrige_id) references public.cc_descricao (id);
  end if;

  -- Narrativa de verdade. 40 caracteres é pouco para uma cirurgia e
  -- suficiente para a frase mais curta que ainda informa algo
  -- ("Colecistectomia videolaparoscópica sem intercorrências").
  if not exists (select 1 from pg_constraint where conname = 'cc_desc_narrativa_ck') then
    alter table public.cc_descricao add constraint cc_desc_narrativa_ck
      check (length(btrim(descricao)) >= 40);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cc_desc_correcao_motivo_ck') then
    alter table public.cc_descricao add constraint cc_desc_correcao_motivo_ck
      check (corrige_id is null or length(btrim(coalesce(motivo_correcao, ''))) >= 15);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cc_desc_conversao_ck') then
    alter table public.cc_descricao add constraint cc_desc_conversao_ck
      check (not conversao or length(btrim(coalesce(conversao_motivo, ''))) >= 15);
  end if;

  -- Peça descrita exige resposta sobre o envio.
  if not exists (select 1 from pg_constraint where conname = 'cc_desc_amostra_ck') then
    alter table public.cc_descricao add constraint cc_desc_amostra_ck
      check (btrim(coalesce(amostras, '')) = '' or amostra_enviada is not null);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cc_desc_sangramento_ck') then
    alter table public.cc_descricao add constraint cc_desc_sangramento_ck
      check (sangramento_ml is null or sangramento_ml >= 0);
  end if;

  -- VIA DE ACESSO — domínio FECHADO, pela mesma razão da lateralidade: é a
  -- via que define a taxa de conversão do bloco, e "VLP", "video", "lapa" e
  -- "videolaparoscópica" na mesma coluna tornam o indicador impossível. O
  -- detalhe anatômico vai na narrativa, que é prosa por natureza.
  if not exists (select 1 from pg_constraint where conname = 'cc_desc_via_ck') then
    alter table public.cc_descricao add constraint cc_desc_via_ck
      check (via_acesso is null or via_acesso in
        ('aberta', 'videolaparoscopica', 'robotica', 'endoscopica',
         'percutanea', 'transvaginal', 'outra'));
  end if;
end $$;

create index if not exists cc_descricao_cirurgia_idx
  on public.cc_descricao (cirurgia_id, versao desc);

-- Uma correção corrige UMA versão. O índice único é o que impede a cadeia
-- de ramificar quando duas pessoas corrigem a mesma versão ao mesmo tempo —
-- a conferência do gatilho roda sob lock, mas o índice é a trava que vale
-- mesmo se alguém mexer no gatilho depois.
create unique index if not exists cc_descricao_corrige_idx
  on public.cc_descricao (corrige_id) where corrige_id is not null;

comment on table public.cc_descricao is
  'Descrição cirúrgica (CFM 1.638/2002). APPEND-ONLY: correção é versão nova com motivo, nunca edição.';
comment on column public.cc_descricao.procedimento_cod is
  'O código do que foi REALIZADO. Vence o do agendamento na montagem da conta.';


-- ───────────────────────────────────────────────────────────
-- 3. O GATILHO — calcula a versão, recusa o que não pode, acende o selo
-- ───────────────────────────────────────────────────────────
create or replace function public.cc_aplica_descricao()
returns trigger
language plpgsql
set search_path = public
as $cc_desc$
declare
  cir       public.cc_cirurgias%rowtype;
  anterior  public.cc_descricao%rowtype;
  vigente   bigint;
  quantas   int;
begin
  select * into cir from public.cc_cirurgias where id = new.cirurgia_id for update;
  if not found then
    raise exception 'Cirurgia % não existe.', new.cirurgia_id;
  end if;

  if cir.status = 'cancelada' then
    raise exception
      'Esta cirurgia está CANCELADA. Não existe descrição cirúrgica de um ato que não aconteceu.';
  end if;

  -- O paciente entrou em sala? `entrada_sala_em` é a prova; o status é a
  -- queda para o caso de alguém ter registrado o horário depois.
  if cir.entrada_sala_em is null
     and coalesce(cir.status, 'agendada') in ('agendada', 'checkin') then
    raise exception
      'Esta cirurgia ainda não entrou em sala. Descrição cirúrgica escrita antes do ato é documento pré-datado — registre a entrada em sala primeiro.';
  end if;

  select count(*) into quantas from public.cc_descricao where cirurgia_id = new.cirurgia_id;

  if new.corrige_id is null then
    -- (5) existe UMA descrição vigente
    if quantas > 0 then
      raise exception
        'Esta cirurgia já tem descrição cirúrgica. O prontuário não se rasura: abra uma CORREÇÃO da versão vigente e diga o que estava errado.';
    end if;
    new.versao := 1;
  else
    select * into anterior from public.cc_descricao where id = new.corrige_id;
    if not found then
      raise exception 'A descrição % que esta correção deveria corrigir não existe.', new.corrige_id;
    end if;
    if anterior.cirurgia_id <> new.cirurgia_id then
      raise exception
        'Esta correção aponta para a descrição de OUTRA cirurgia (#%). Corrigir o documento do paciente errado é o pior desfecho possível desta tela.',
        anterior.cirurgia_id;
    end if;
    -- (6) a cadeia não ramifica
    select id into vigente from public.cc_descricao where corrige_id = new.corrige_id limit 1;
    if vigente is not null then
      raise exception
        'A versão % já foi corrigida (pela descrição #%). Corrija a versão VIGENTE — duas correções da mesma versão deixariam o prontuário com dois documentos válidos.',
        anterior.versao, vigente;
    end if;
    new.versao := anterior.versao + 1;
  end if;

  update public.cc_cirurgias
     set descricao_em = coalesce(descricao_em, now()),
         updated_at = now()
   where id = new.cirurgia_id;

  return new;
end;
$cc_desc$;

drop trigger if exists trg_cc_aplica_descricao on public.cc_descricao;
create trigger trg_cc_aplica_descricao
  before insert on public.cc_descricao
  for each row execute function public.cc_aplica_descricao();


-- ───────────────────────────────────────────────────────────
-- 4. RLS — leitura pelo mapa, escrita do Bloco, SEM update nem delete
--
-- A ausência das políticas de UPDATE e DELETE é a trava do append-only, e é
-- o mesmo desenho de `pep_evolucoes`, `cc_checklist` e `auditoria`. RLS
-- ligada sem política para um comando NEGA aquele comando a todo mundo —
-- inclusive a quem é adm_master pela API.
--
-- A política de SELECT definitiva é reescrita por `migracao-rls-leitura.sql`
-- (que roda por último e cita esta tabela). A daqui é a de partida, para a
-- tabela não nascer com leitura aberta entre uma migração e outra.
--
-- ⚠️ OS NOMES SEGUEM A CONVENÇÃO DO `gerar-rls.mjs` (`_leitura`, `_ins`,
-- `_mod_ins`), para o gerador SUBSTITUIR estas políticas em vez de criar um
-- segundo conjunto ao lado — política permissiva se SOMA (OR), então uma
-- sobra destrancaria a leitura por cima da nova. É a lição que custou uma
-- migração de correção em `at_desfecho_correcoes`, e o mesmo desenho do
-- `cc_checklist`: permissiva por papel, restritiva por módulo.
--
-- ⚠️ `pode_ver_algum` é VARIADIC: os módulos vão como argumentos soltos,
-- não como array. `pode_ver_algum(array['bloco','paciente'])` não resolve
-- ("function does not exist") e derruba a migração — foi o primeiro erro
-- que a prova em PGlite pegou neste arquivo.
-- ───────────────────────────────────────────────────────────
alter table public.cc_descricao enable row level security;

drop policy if exists cc_descricao_leitura on public.cc_descricao;
create policy cc_descricao_leitura on public.cc_descricao
  for select to authenticated
  using (public.pode_ver_algum('bloco', 'paciente'));

drop policy if exists cc_descricao_ins on public.cc_descricao;
create policy cc_descricao_ins on public.cc_descricao
  for insert to authenticated
  with check (public.my_role() in ('adm_master', 'adm_silver'));

drop policy if exists cc_descricao_mod_ins on public.cc_descricao;
create policy cc_descricao_mod_ins on public.cc_descricao
  as restrictive for insert to authenticated
  with check (public.pode_editar_algum('bloco'));


insert into public.migracoes_aplicadas (arquivo)
values ('migracao-cirurgia-descricao.sql') on conflict do nothing;

reset valentrax.quem;

notify pgrst, 'reload schema';


-- ───────────────────────────────────────────────────────────
-- CONFERÊNCIA
-- ───────────────────────────────────────────────────────────
select item, case when ok then '✅' else '❌' end as situacao from (
  select 'tabela cc_descricao' as item,
         exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'cc_descricao') as ok
  union all
  select 'coluna cc_cirurgias.descricao_em',
         exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'cc_cirurgias'
                    and column_name = 'descricao_em')
  union all
  select '🔴 gatilho que calcula a versão e acende o selo',
         exists (select 1 from pg_trigger where tgname = 'trg_cc_aplica_descricao')
  union all
  select 'FK descrição → cirurgia',
         exists (select 1 from pg_constraint where conname = 'cc_desc_cirurgia_fk')
  union all
  select '🔴 a cadeia de correção não ramifica (índice único)',
         exists (select 1 from pg_class where relname = 'cc_descricao_corrige_idx')
  union all
  select 'trava: narrativa mínima',
         exists (select 1 from pg_constraint where conname = 'cc_desc_narrativa_ck')
  union all
  select 'trava: correção com motivo',
         exists (select 1 from pg_constraint where conname = 'cc_desc_correcao_motivo_ck')
  union all
  select 'trava: conversão com motivo',
         exists (select 1 from pg_constraint where conname = 'cc_desc_conversao_ck')
  union all
  select 'trava: via de acesso em domínio fechado',
         exists (select 1 from pg_constraint where conname = 'cc_desc_via_ck')
  union all
  select 'trava: peça descrita exige resposta sobre o envio',
         exists (select 1 from pg_constraint where conname = 'cc_desc_amostra_ck')
  union all
  -- 🔴 APPEND-ONLY: se vier ✅ aqui com política de update ou delete, o
  -- documento passou a ser editável e o prontuário deixou de ser registro.
  select '🔴 append-only: NENHUMA política de update/delete',
         not exists (select 1 from pg_policies
                      where schemaname = 'public' and tablename = 'cc_descricao'
                        and cmd in ('UPDATE', 'DELETE'))
  union all
  select 'migração anotada no registro',
         exists (select 1 from public.migracoes_aplicadas
                  where arquivo = 'migracao-cirurgia-descricao.sql')
) x;

-- Quantas cirurgias já terminaram sem descrição. Não é erro da migração: é
-- o passivo que a tela passa a mostrar a partir de agora.
select count(*) filter (where descricao_em is not null) as com_descricao,
       count(*) filter (where descricao_em is null
                          and status in ('em_cirurgia', 'recuperacao', 'concluida')) as operadas_sem_descricao,
       count(*) as total
  from public.cc_cirurgias;
