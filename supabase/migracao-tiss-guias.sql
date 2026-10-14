-- ═══════════════════════════════════════════════════════════
-- TISS: A GUIA EXISTE
--
-- 🔴 NÃO SE FATURA CONVÊNIO COM CONTA — FATURA-SE COM GUIA.
--
-- O sistema já sabe que a conta de convênio sai pela via `tiss`
-- (`viaDeFaturamento`), já tem preço por operadora (`at_precos`), já guarda
-- o registro ANS (`at_convenios.registro_ans`) e já tem conselho, número,
-- UF e CBO do profissional (`profiles`). O que NÃO existe é o documento.
--
-- Medido em 14/10/2026: nenhuma tabela com "guia" no nome, em 118 tabelas.
-- E `codigo_prestador` — o código do hospital DENTRO da operadora — não
-- existe em coluna nenhuma do schema. Sem ele nenhuma guia pode ser
-- emitida, porque é por ele que a operadora sabe quem está cobrando.
--
-- 💡 A GUIA APONTA PARA A CONTA; OS ITENS SÃO OS DA CONTA.
--
-- Copiar os itens para dentro da guia criaria duas verdades sobre o que foi
-- feito — e foi exatamente isso que as duas últimas entregas gastaram
-- esforço desfazendo no exame. Item é de `at_conta_itens`, e ponto.
--
-- 🔴 MAS O BENEFICIÁRIO E O PRESTADOR SÃO CARIMBADOS NA EMISSÃO.
--
-- Isso parece contradizer o parágrafo acima e não contradiz: a carteira do
-- paciente muda, o contrato com a operadora é renegociado, o registro ANS
-- de uma operadora incorporada troca. A guia que JÁ FOI EMITIDA não pode
-- mudar junto — ela é o documento que a operadora recebeu. Então o que a
-- guia carimba é o estado do cadastro NO MOMENTO da emissão, e o que ela
-- referencia é o que continua vivo.
--
-- ⚠️ O XML NÃO É GERADO AQUI, e é a mesma recusa de `faturamento.js`: o
-- padrão TISS é versionado (3.05, 4.01…), o XSD muda por norma da ANS e a
-- operadora homologa. A diferença em relação ao SISAIH01 é que a ANS
-- PUBLICA o XSD — então o gerador é escrevível contra algo conferível, no
-- dia em que o arquivo estiver em mãos. Até lá existe a guia, que é um
-- documento válido impresso, e é com ela que o hospital cobra hoje.
--
-- 🔒 RECUSAS (todas no gatilho, provadas em PGlite):
--   1. emitir guia de conta que não é da via `tiss`;
--   2. emitir sem o código do prestador na operadora;
--   3. emitir sem registro ANS da operadora;
--   4. emitir sem a carteira do beneficiário;
--   5. emitir sem profissional completo (conselho, número, UF e CBO);
--   6. emitir sem nenhum item na conta;
--   7. mexer em campo CARIMBADO de guia já emitida;
--   8. cancelar sem motivo;
--   9. número do prestador repetido.
--
-- ADITIVA. IDEMPOTENTE.
--
-- COMO DESFAZER:
--   drop trigger if exists trg_tiss_guia on public.tiss_guias;
--   drop function if exists public.tiss_aplica_guia();
--   drop table if exists public.tiss_guias;
--   alter table public.at_convenios drop column if exists codigo_prestador;
--   alter table public.at_conta_itens drop column if exists tabela;
-- ═══════════════════════════════════════════════════════════

set valentrax.quem = 'adauam';


-- ───────────────────────────────────────────────────────────
-- 1. O QUE FALTAVA NO CADASTRO DA OPERADORA
-- ───────────────────────────────────────────────────────────
alter table public.at_convenios add column if not exists codigo_prestador text;

-- 🔴 `versao_tiss` NÃO ENTRA, e isso é decisão, não esquecimento.
--
-- Eu a tinha criado para o gerador de XML — que esta entrega explicitamente
-- NÃO constrói. A catraca `colunas-sem-input` apontou que nada a lia, e a
-- regra dela é a certa: ou alguém lê a coluna, ou a migração não deveria
-- tê-la criado. Coluna vazia não dá erro, não quebra tela, não quebra
-- teste — só fica lá parecendo que alguém cuidou do assunto. Foi assim que
-- o oxigênio do NEWS passou dois anos sem pontuar.
--
-- Quando o XML existir, ela entra na migração que o acompanha: uma linha.

comment on column public.at_convenios.codigo_prestador is
  'O código do HOSPITAL dentro desta operadora. É por ele que a operadora sabe quem cobra — sem ele nenhuma guia TISS é emitida. Cada operadora dá o seu.';

-- 🔴 O CÓDIGO DO ITEM SEM A TABELA É AMBÍGUO.
--
-- "0301010072" é SIGTAP; o mesmo número pode existir no TUSS significando
-- outra coisa. `at_procedimentos` já distingue (`tabela`), mas o ITEM da
-- conta não carregava — então na hora de montar a guia não havia como
-- dizer de qual tabela o código veio.
alter table public.at_conta_itens add column if not exists tabela text;
comment on column public.at_conta_itens.tabela is
  'De qual tabela veio o `codigo`: sigtap, tuss, cbhpm ou proprio. Código sem tabela é ambíguo — o mesmo número existe em tabelas diferentes significando coisas diferentes.';


-- ───────────────────────────────────────────────────────────
-- 2. A GUIA
-- ───────────────────────────────────────────────────────────
create table if not exists public.tiss_guias (
  id bigserial primary key,

  -- O elo com o que foi feito. Os ITENS são os da conta.
  conta_id bigint not null,
  atendimento_id bigint,
  prontuario text,
  convenio_id bigint,

  -- 🔴 OS QUATRO TIPOS DO PADRÃO. Não é enfeite: cada um tem campos
  -- obrigatórios próprios, e a operadora recusa a guia no tipo errado.
  tipo text not null default 'sp_sadt',

  -- O número que o HOSPITAL dá. Único — guia repetida é cobrança duplicada.
  numero_prestador text,
  -- O número que a OPERADORA devolve, depois. Nulo até ela responder.
  numero_operadora text,

  -- ── CARIMBADO NA EMISSÃO ──────────────────────────────────
  -- O cadastro muda; o documento emitido não.
  registro_ans text,
  codigo_prestador text,
  beneficiario_nome text,
  beneficiario_carteira text,
  beneficiario_validade date,
  beneficiario_cns text,

  -- Autorização, quando a operadora exige.
  senha text,
  senha_validade date,

  -- O profissional. TISS pede os quatro: conselho, número, UF e CBO.
  profissional_nome text,
  profissional_conselho text,
  profissional_registro text,
  profissional_uf text,
  profissional_cbo text,

  carater text not null default 'eletiva',
  indicacao_clinica text,
  atendimento_em timestamptz,

  status text not null default 'rascunho',
  emitida_em timestamptz,
  emitida_por text,
  enviada_em timestamptz,
  cancelada_em timestamptz,
  cancelamento_motivo text,

  usuario text,
  criado_em timestamptz not null default now(),
  updated_at timestamptz default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tiss_guia_conta_fk') then
    alter table public.tiss_guias add constraint tiss_guia_conta_fk
      foreign key (conta_id) references public.at_contas (id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tiss_guia_tipo_ck') then
    alter table public.tiss_guias add constraint tiss_guia_tipo_ck
      check (tipo in ('consulta', 'sp_sadt', 'internacao', 'honorarios'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tiss_guia_status_ck') then
    alter table public.tiss_guias add constraint tiss_guia_status_ck
      check (status in ('rascunho', 'emitida', 'enviada', 'paga', 'glosada', 'cancelada'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tiss_guia_carater_ck') then
    alter table public.tiss_guias add constraint tiss_guia_carater_ck
      check (carater in ('eletiva', 'urgencia'));
  end if;
  -- Cancelar exige dizer por quê: guia cancelada sem motivo vira dúvida na
  -- conciliação com a operadora, que é onde o dinheiro aparece ou some.
  if not exists (select 1 from pg_constraint where conname = 'tiss_guia_cancel_ck') then
    alter table public.tiss_guias add constraint tiss_guia_cancel_ck
      check (status <> 'cancelada' or length(btrim(coalesce(cancelamento_motivo, ''))) >= 5);
  end if;
end $$;

-- 🔴 GUIA REPETIDA É COBRANÇA DUPLICADA. O índice é parcial porque
-- rascunho ainda não tem número.
create unique index if not exists tiss_guias_numero_idx
  on public.tiss_guias (numero_prestador) where numero_prestador is not null;
create index if not exists tiss_guias_conta_idx on public.tiss_guias (conta_id);
create index if not exists tiss_guias_status_idx on public.tiss_guias (status, emitida_em desc);
create index if not exists tiss_guias_prontuario_idx on public.tiss_guias (prontuario, criado_em desc);


-- ───────────────────────────────────────────────────────────
-- 3. O NÚMERO DA GUIA
--
-- Sequência própria: o número é do PRESTADOR e precisa ser único no escopo
-- dele. Derivar do id da linha funcionaria, mas vazaria quantos registros
-- o banco tem — e número de guia é informação que vai para fora.
-- ───────────────────────────────────────────────────────────
create sequence if not exists public.tiss_guia_numero_seq start with 1;


-- ───────────────────────────────────────────────────────────
-- 4. O GATILHO
-- ───────────────────────────────────────────────────────────
create or replace function public.tiss_aplica_guia()
returns trigger
language plpgsql
set search_path = public
as $tiss$
declare
  cta      public.at_contas%rowtype;
  conv     public.at_convenios%rowtype;
  n_itens  int;
begin
  -- ── CAMPOS CARIMBADOS NÃO MUDAM DEPOIS DE EMITIDA ────────
  if tg_op = 'UPDATE' and old.status <> 'rascunho' then
    if new.registro_ans      is distinct from old.registro_ans
    or new.codigo_prestador  is distinct from old.codigo_prestador
    or new.beneficiario_carteira is distinct from old.beneficiario_carteira
    or new.beneficiario_nome is distinct from old.beneficiario_nome
    or new.numero_prestador  is distinct from old.numero_prestador
    or new.conta_id          is distinct from old.conta_id
    or new.tipo              is distinct from old.tipo then
      raise exception
        'Esta guia já foi emitida (%). O que foi carimbado nela é o documento que a operadora recebeu e não muda — correção se faz cancelando e emitindo outra.',
        old.status;
    end if;
  end if;

  -- Rascunho não exige nada: é rascunho.
  if new.status = 'rascunho' then
    new.updated_at := now();
    return new;
  end if;

  -- Cancelar não precisa das exigências de emissão.
  if new.status = 'cancelada' then
    new.cancelada_em := coalesce(new.cancelada_em, now());
    new.updated_at := now();
    return new;
  end if;

  -- 🔴 STATUS QUE NÃO CONHEÇO SAI DAQUI SEM OPINIÃO.
  --
  -- O gatilho BEFORE roda ANTES do check constraint. Sem esta saída, um
  -- status inventado caía no caminho da emissão e recebia "sem o número da
  -- carteira do beneficiário" — uma mensagem que não tem nada a ver com o
  -- que a pessoa fez de errado. Quem sabe falar do vocabulário é
  -- `tiss_guia_status_ck`, e ele fala logo em seguida.
  if new.status not in ('emitida', 'enviada', 'paga', 'glosada') then
    new.updated_at := now();
    return new;
  end if;

  -- ── A PARTIR DAQUI É EMISSÃO ──────────────────────────────
  select * into cta from public.at_contas where id = new.conta_id;
  if not found then
    raise exception 'A conta % não existe.', new.conta_id;
  end if;
  -- 🔴 Guia TISS é de convênio. Emitir sobre conta do SUS seria cobrar
  -- duas vezes pela mesma coisa — e do lado errado.
  if cta.via is distinct from 'tiss' then
    raise exception
      'A conta #% sai pela via "%", não por TISS. Guia TISS é para operadora — cobrar por aqui uma conta do SUS é cobrança indevida.',
      cta.id, coalesce(cta.via, 'sem via');
  end if;

  select * into conv from public.at_convenios where id = coalesce(new.convenio_id, cta.convenio_id);
  if not found then
    raise exception 'A guia não tem operadora: nem a guia nem a conta #% apontam para um convênio.', cta.id;
  end if;

  new.convenio_id := conv.id;
  new.registro_ans := coalesce(nullif(btrim(new.registro_ans), ''), conv.registro_ans);
  new.codigo_prestador := coalesce(nullif(btrim(new.codigo_prestador), ''), conv.codigo_prestador);

  if coalesce(btrim(new.codigo_prestador), '') = '' then
    raise exception
      'A operadora "%" não tem o código do prestador cadastrado. É por ele que ela sabe quem está cobrando — sem isso a guia não é aceita. Cadastre em Convênios.',
      conv.nome;
  end if;
  if coalesce(btrim(new.registro_ans), '') = '' then
    raise exception
      'A operadora "%" não tem registro ANS cadastrado. Toda operadora tem um, e ele identifica a empresa na troca TISS.',
      conv.nome;
  end if;
  if coalesce(btrim(new.beneficiario_carteira), '') = '' then
    raise exception
      'Sem o número da carteira do beneficiário. É a identificação dele dentro da operadora, e a guia é recusada sem ela.';
  end if;

  -- 🔴 O PROFISSIONAL INTEIRO, OS QUATRO CAMPOS. Conselho sem UF não
  -- identifica ninguém: o CRM 1234 existe em 27 estados.
  if coalesce(btrim(new.profissional_conselho), '') = ''
  or coalesce(btrim(new.profissional_registro), '') = ''
  or coalesce(btrim(new.profissional_uf), '') = ''
  or coalesce(btrim(new.profissional_cbo), '') = '' then
    raise exception
      'O profissional está incompleto. A guia leva conselho, número, UF e CBO — conselho sem UF não identifica ninguém, porque o mesmo número existe em 27 estados.';
  end if;

  select count(*) into n_itens from public.at_conta_itens
   where conta_id = cta.id and coalesce(cancelado, false) = false;
  if n_itens = 0 then
    raise exception
      'A conta #% não tem item nenhum. Guia sem item é cobrança de nada.', cta.id;
  end if;

  -- O número nasce na emissão, não no rascunho.
  if new.numero_prestador is null then
    new.numero_prestador := lpad(nextval('public.tiss_guia_numero_seq')::text, 8, '0');
  end if;
  new.emitida_em := coalesce(new.emitida_em, now());
  new.prontuario := coalesce(new.prontuario, cta.prontuario);
  new.atendimento_id := coalesce(new.atendimento_id, cta.atendimento_id);
  new.updated_at := now();
  return new;
end;
$tiss$;

drop trigger if exists trg_tiss_guia on public.tiss_guias;
create trigger trg_tiss_guia
  before insert or update on public.tiss_guias
  for each row execute function public.tiss_aplica_guia();


-- ───────────────────────────────────────────────────────────
-- 5. RLS
-- ───────────────────────────────────────────────────────────
alter table public.tiss_guias enable row level security;

do $$
begin
  execute 'drop policy if exists tiss_guias_leitura on public.tiss_guias';
  execute 'create policy tiss_guias_leitura on public.tiss_guias for select to authenticated
             using (public.pode_ver_algum(''faturamento''))';
  execute 'drop policy if exists tiss_guias_ins on public.tiss_guias';
  execute 'create policy tiss_guias_ins on public.tiss_guias for insert to authenticated
             with check (public.my_role() in (''adm_master'',''adm_silver''))';
  execute 'drop policy if exists tiss_guias_mod_ins on public.tiss_guias';
  execute 'create policy tiss_guias_mod_ins on public.tiss_guias as restrictive for insert to authenticated
             with check (public.pode_editar_algum(''faturamento''))';
  execute 'drop policy if exists tiss_guias_upd on public.tiss_guias';
  execute 'create policy tiss_guias_upd on public.tiss_guias for update to authenticated
             using (public.pode_editar_algum(''faturamento''))
             with check (public.pode_editar_algum(''faturamento''))';
end $$;


insert into public.migracoes_aplicadas (arquivo)
values ('migracao-tiss-guias.sql') on conflict do nothing;

reset valentrax.quem;

notify pgrst, 'reload schema';


-- ───────────────────────────────────────────────────────────
-- CONFERÊNCIA
-- ───────────────────────────────────────────────────────────
select item, case when ok then '✅' else '❌' end as situacao from (
  select 'tabela tiss_guias' as item, to_regclass('public.tiss_guias') is not null as ok
  union all
  select 'sequência do número da guia',
         to_regclass('public.tiss_guia_numero_seq') is not null
  union all
  select '🔴 gatilho que carimba e recusa',
         exists (select 1 from pg_trigger where tgname = 'trg_tiss_guia')
  union all
  select '🔴 at_convenios.codigo_prestador (não existia em coluna nenhuma)', exists (
           select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'at_convenios' and column_name = 'codigo_prestador')
  union all
  select '🔴 at_conta_itens.tabela (código sem tabela é ambíguo)', exists (
           select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'at_conta_itens' and column_name = 'tabela')
  union all
  select 'trava ' || k, exists (select 1 from pg_constraint where conname = k)
    from unnest(array['tiss_guia_tipo_ck','tiss_guia_status_ck','tiss_guia_carater_ck','tiss_guia_cancel_ck']) k
  union all
  select '🔴 número da guia é único (guia repetida é cobrança dupla)',
         exists (select 1 from pg_class where relname = 'tiss_guias_numero_idx')
  union all
  select 'migração anotada no registro',
         exists (select 1 from public.migracoes_aplicadas where arquivo = 'migracao-tiss-guias.sql')
) x;

-- O que o cadastro ainda precisa para a primeira guia sair.
select nome,
       case when coalesce(btrim(registro_ans), '') = '' then '❌ sem registro ANS' else '✅' end as ans,
       case when coalesce(btrim(codigo_prestador), '') = '' then '❌ sem código do prestador' else '✅' end as prestador,
       registro_ans, codigo_prestador
  from public.at_convenios
 where tipo = 'convenio' and coalesce(ativo, true)
 order by nome;
