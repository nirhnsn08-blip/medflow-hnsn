-- ═══════════════════════════════════════════════════════════
-- OPME COM LOTE: EM QUEM FOI IMPLANTADO
--
-- 🔴 HOJE O OPME É UM `textarea`.
--
--     opme text  -- "Ex.: kit vídeo, clipes de titânio; OPME: prótese X"
--
-- Texto livre, um campo, sem lote, sem número de série, sem registro
-- ANVISA, sem vínculo com o estoque e sem vínculo com o paciente além da
-- própria linha da cirurgia.
--
-- 🔴 O QUE ISSO CUSTA, E NÃO É DINHEIRO: quando o fabricante recolhe um
-- lote de prótese — e recall de implante acontece —, a pergunta é "em QUEM
-- nós implantamos este lote?". Com `opme text`, a resposta é ler cirurgia
-- por cirurgia, torcendo para alguém ter digitado o número. Na prática o
-- hospital não responde, e não responder significa não chamar de volta os
-- pacientes que precisam de revisão.
--
-- A RDC 751/2022 trata os implantáveis como a classe de maior risco
-- justamente por isso: o dispositivo fica dentro da pessoa por anos.
--
-- 💡 UMA LINHA POR ITEM, com lote, e ligada à cirurgia — que já está ligada
-- ao paciente (FK desde `migracao-cirurgia-paciente-equipe-codigo`). A
-- consulta do recall passa a ser uma consulta.
--
-- 🔒 RECUSAS:
--   1. cirurgia que não existe, ou CANCELADA;
--   2. 🔴 IMPLANTE SEM LOTE. É a trava central deste arquivo: sem lote o
--      registro não serve para a única pergunta que ele existe para
--      responder. Material descartável (campo, compressa, fio) NÃO exige
--      lote — exigir de tudo faria a equipe preencher lixo para passar;
--   3. quantidade não positiva;
--   4. estorno de linha que não existe, de outra cirurgia, ou já estornada.
--
-- ⚠️ O REGISTRO ANVISA é AVISO, não recusa, e a assimetria é deliberada:
-- o LOTE é o que um recall procura; o registro é o que um auditor procura.
-- Recall é emergência de segurança do paciente; auditoria tem prazo. Travar
-- a sala por um número que está na caixa — e que a instrumentadora muitas
-- vezes só confere depois — trocaria um risco real por um risco de
-- preenchimento apressado.
--
-- 🔴 ⚠️ E A DECISÃO QUE MAIS IMPORTA AQUI: a baixa do estoque NUNCA
-- derruba o registro de rastreabilidade.
--
-- `sup_aplica_movimento` recusa saída com saldo insuficiente, e com razão —
-- é o kardex. Mas OPME consignado chega na mala do representante e é usado
-- sem nunca ter entrado no almoxarifado; e mesmo o item próprio pode estar
-- com saldo errado às 3h da manhã. Se a baixa falhar, a linha de OPME é
-- gravada do mesmo jeito, com `baixa_estoque = false` e o motivo guardado,
-- e o painel cobra a conciliação depois.
--
-- Saber em quem foi implantado é urgência de segurança. Saldo de
-- almoxarifado é contabilidade. Nunca se perde o primeiro para proteger o
-- segundo.
--
-- ADITIVA. IDEMPOTENTE.
--
-- COMO DESFAZER:
--   drop trigger if exists trg_cc_aplica_opme on public.cc_opme;
--   drop function if exists public.cc_aplica_opme();
--   drop table if exists public.cc_opme;
--   alter table public.cc_cirurgias drop column if exists opme_em;
-- ═══════════════════════════════════════════════════════════

set valentrax.quem = 'adauam';


alter table public.cc_cirurgias
  add column if not exists opme_em timestamptz;

comment on column public.cc_cirurgias.opme_em is
  'Quando o primeiro item de OPME foi registrado. Carimbado pelo gatilho de cc_opme.';


-- ───────────────────────────────────────────────────────────
-- A TABELA
-- ───────────────────────────────────────────────────────────
create table if not exists public.cc_opme (
  id bigserial primary key,
  cirurgia_id bigint not null,

  -- 🔴 `implante` É O QUE MUDA O REGIME. Prótese, placa, parafuso, tela,
  -- stent e marca-passo ficam DENTRO da pessoa e exigem lote. Campo
  -- cirúrgico e compressa são consumo: entram para a conta e para o
  -- estoque, não para o rastreio vitalício.
  implante boolean not null default false,

  -- O item do catálogo, quando existe. NULLABLE de propósito: OPME
  -- consignado chega na mala do representante e não está em `sup_itens`.
  -- Recusar o registro por isso seria perder a rastreabilidade do item
  -- mais caro e mais arriscado da sala.
  item_id bigint,
  descricao text not null,

  lote text,
  numero_serie text,
  registro_anvisa text,
  fabricante text,
  fornecedor_id bigint,
  validade date,
  quantidade numeric not null default 1,
  consignado boolean not null default false,

  -- A baixa no kardex: tentada pelo gatilho, e o resultado fica registrado.
  -- `false` com motivo é PENDÊNCIA visível, não falha silenciosa.
  baixa_estoque boolean not null default false,
  baixa_motivo text,
  movimento_id bigint,

  -- Correção é ESTORNO, não edição — a mesma forma do kardex de
  -- suprimentos, e por isso não há política de update nem de delete.
  estorno_de bigint,
  estorno_motivo text,

  usuario text,
  assinatura text,
  criado_em timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cc_opme_cirurgia_fk') then
    alter table public.cc_opme add constraint cc_opme_cirurgia_fk
      foreign key (cirurgia_id) references public.cc_cirurgias (id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cc_opme_item_fk') then
    alter table public.cc_opme add constraint cc_opme_item_fk
      foreign key (item_id) references public.sup_itens (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cc_opme_estorno_fk') then
    alter table public.cc_opme add constraint cc_opme_estorno_fk
      foreign key (estorno_de) references public.cc_opme (id);
  end if;

  -- 🔴 A TRAVA CENTRAL. Implante sem lote não responde à pergunta do recall.
  if not exists (select 1 from pg_constraint where conname = 'cc_opme_implante_lote_ck') then
    alter table public.cc_opme add constraint cc_opme_implante_lote_ck
      check (not implante or length(btrim(coalesce(lote, ''))) >= 1);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cc_opme_descricao_ck') then
    alter table public.cc_opme add constraint cc_opme_descricao_ck
      check (length(btrim(descricao)) >= 3);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cc_opme_qtd_ck') then
    alter table public.cc_opme add constraint cc_opme_qtd_ck
      check (quantidade > 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cc_opme_estorno_motivo_ck') then
    alter table public.cc_opme add constraint cc_opme_estorno_motivo_ck
      check (estorno_de is null or length(btrim(coalesce(estorno_motivo, ''))) >= 15);
  end if;
end $$;

create index if not exists cc_opme_cirurgia_idx on public.cc_opme (cirurgia_id, criado_em desc);

-- 🔴 O ÍNDICE DO RECALL. A consulta que justifica a tabela inteira é
-- "quais pacientes receberam este lote", e ela entra por lote — não por
-- cirurgia. Sem este índice a resposta seria varredura da tabela toda.
create index if not exists cc_opme_lote_idx
  on public.cc_opme (lower(btrim(lote))) where lote is not null;
create index if not exists cc_opme_serie_idx
  on public.cc_opme (lower(btrim(numero_serie))) where numero_serie is not null;

-- Uma linha estorna UMA. Sem isto, dois estornos da mesma linha zerariam o
-- estoque duas vezes.
create unique index if not exists cc_opme_estorno_idx
  on public.cc_opme (estorno_de) where estorno_de is not null;

comment on table public.cc_opme is
  'OPME e materiais da cirurgia, com lote. Responde "em quem implantamos este lote" (RDC 751/2022). APPEND-ONLY: correção é estorno.';


-- ───────────────────────────────────────────────────────────
-- O GATILHO
-- ───────────────────────────────────────────────────────────
create or replace function public.cc_aplica_opme()
returns trigger
language plpgsql
security definer
set search_path = public
as $cc_opme$
declare
  cir      public.cc_cirurgias%rowtype;
  anterior public.cc_opme%rowtype;
  v_mov    bigint;
begin
  select * into cir from public.cc_cirurgias where id = new.cirurgia_id for update;
  if not found then
    raise exception 'Cirurgia % não existe.', new.cirurgia_id;
  end if;

  if cir.status = 'cancelada' then
    raise exception
      'Esta cirurgia está CANCELADA. Não há material consumido a registrar.';
  end if;

  if new.estorno_de is not null then
    select * into anterior from public.cc_opme where id = new.estorno_de;
    if not found then
      raise exception 'A linha % que este estorno deveria anular não existe.', new.estorno_de;
    end if;
    if anterior.cirurgia_id <> new.cirurgia_id then
      raise exception
        'Este estorno aponta para o material de OUTRA cirurgia (#%).', anterior.cirurgia_id;
    end if;
    if anterior.estorno_de is not null then
      raise exception 'A linha % já é um estorno — não se estorna um estorno.', new.estorno_de;
    end if;
  end if;

  -- ── A BAIXA NO KARDEX ───────────────────────────────────
  --
  -- Só para item do catálogo, não consignado, e em linha que não é
  -- estorno. O estorno devolve ao estoque.
  if new.item_id is not null and not new.consignado then
    begin
      insert into public.sup_movimentos
        (item_id, lote, validade, tipo, quantidade, motivo, documento, setor, usuario)
      values (new.item_id, coalesce(new.lote, ''), new.validade,
              case when new.estorno_de is null then 'saida' else 'entrada' end,
              new.quantidade,
              case when new.estorno_de is null then 'OPME/consumo cirúrgico'
                   else 'Estorno de OPME' end,
              'Cirurgia #' || new.cirurgia_id, 'Centro Cirúrgico', new.usuario)
      returning id into v_mov;
      new.movimento_id := v_mov;
      new.baixa_estoque := true;
      new.baixa_motivo := null;
    exception when others then
      -- 🔴 A LINHA DE RASTREABILIDADE NÃO CAI COM A CONTABILIDADE.
      -- Saldo insuficiente é o caso comum (item usado sem ter dado
      -- entrada). A falha vira PENDÊNCIA visível, não registro perdido.
      new.baixa_estoque := false;
      new.baixa_motivo := 'Baixa no estoque não aplicada: ' || sqlerrm;
      new.movimento_id := null;
    end;
  else
    new.baixa_estoque := false;
    new.baixa_motivo := case
      when new.consignado then 'Consignado — não passa pelo estoque do hospital.'
      when new.item_id is null then 'Item fora do catálogo — sem baixa de estoque.'
      else null end;
  end if;

  update public.cc_cirurgias
     set opme_em = coalesce(opme_em, now()), updated_at = now()
   where id = new.cirurgia_id;

  return new;
end;
$cc_opme$;

drop trigger if exists trg_cc_aplica_opme on public.cc_opme;
create trigger trg_cc_aplica_opme
  before insert on public.cc_opme
  for each row execute function public.cc_aplica_opme();


-- ───────────────────────────────────────────────────────────
-- RLS — leitura do Bloco, do Paciente e de SUPRIMENTOS
--
-- ⚠️ `suprimentos` lê de propósito: quem conduz um recall é a coordenação
-- de OPME / almoxarifado, não o centro cirúrgico. Leitura, não escrita —
-- quem registra o que entrou no paciente é quem estava na sala.
-- ───────────────────────────────────────────────────────────
alter table public.cc_opme enable row level security;

drop policy if exists cc_opme_leitura on public.cc_opme;
create policy cc_opme_leitura on public.cc_opme
  for select to authenticated
  using (public.pode_ver_algum('bloco', 'paciente', 'suprimentos'));

drop policy if exists cc_opme_ins on public.cc_opme;
create policy cc_opme_ins on public.cc_opme
  for insert to authenticated
  with check (public.my_role() in ('adm_master', 'adm_silver'));

drop policy if exists cc_opme_mod_ins on public.cc_opme;
create policy cc_opme_mod_ins on public.cc_opme
  as restrictive for insert to authenticated
  with check (public.pode_editar_algum('bloco'));


insert into public.migracoes_aplicadas (arquivo)
values ('migracao-cirurgia-opme.sql') on conflict do nothing;

reset valentrax.quem;

notify pgrst, 'reload schema';


-- ───────────────────────────────────────────────────────────
-- CONFERÊNCIA
-- ───────────────────────────────────────────────────────────
select item, case when ok then '✅' else '❌' end as situacao from (
  select 'tabela cc_opme' as item, to_regclass('public.cc_opme') is not null as ok
  union all
  select 'coluna cc_cirurgias.opme_em',
         exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='cc_cirurgias' and column_name='opme_em')
  union all
  select '🔴 trava: implante exige LOTE',
         exists (select 1 from pg_constraint where conname = 'cc_opme_implante_lote_ck')
  union all
  select '🔴 índice do recall (busca por lote)',
         exists (select 1 from pg_class where relname = 'cc_opme_lote_idx')
  union all
  select 'índice da busca por número de série',
         exists (select 1 from pg_class where relname = 'cc_opme_serie_idx')
  union all
  select 'uma linha estorna UMA',
         exists (select 1 from pg_class where relname = 'cc_opme_estorno_idx')
  union all
  select 'gatilho que baixa o estoque e carimba o selo',
         exists (select 1 from pg_trigger where tgname = 'trg_cc_aplica_opme')
  union all
  select '🔴 append-only: nenhuma política de update/delete',
         not exists (select 1 from pg_policies
                      where schemaname='public' and tablename='cc_opme' and cmd in ('UPDATE','DELETE'))
  union all
  select 'migração anotada no registro',
         exists (select 1 from public.migracoes_aplicadas where arquivo = 'migracao-cirurgia-opme.sql')
) x;

-- O passivo: cirurgias que descreveram OPME no campo de texto livre e não
-- têm nenhuma linha rastreável. Não é erro da migração — é o que a tela
-- passa a mostrar, e o que alguém vai ter de digitar de volta se um lote
-- desses for recolhido.
select count(*) filter (where btrim(coalesce(opme, '')) <> '' and opme_em is null) as texto_livre_sem_rastreio,
       count(*) filter (where opme_em is not null)                                 as com_rastreio,
       count(*)                                                                    as total
  from public.cc_cirurgias;
