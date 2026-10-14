-- ═══════════════════════════════════════════════════════════
-- A IMPRESSÃO DIGITAL DO DOCUMENTO
--
-- ⚠️⚠️ ISTO NÃO É ASSINATURA DIGITAL, E A DIFERENÇA É O PONTO INTEIRO.
--
-- Hoje o campo `assinatura` deste sistema guarda um TEXTO: "Dra. Ana · CRM
-- 1234". Isso é ATRIBUIÇÃO — diz quem foi —, e é útil. Mas não é assinatura
-- no sentido da CFM 1.821/2007 e do manual SBIS/CFM: aquilo exige
-- certificado ICP-Brasil, e sem ele o hospital NÃO pode parar de imprimir.
-- Medido em 14/10/2026: zero colunas de hash ou certificado no schema.
--
-- Esta migração não resolve isso. Ela constrói o chão que falta.
--
-- 💡 POR QUE O CHÃO VEM PRIMEIRO
--
-- Toda assinatura digital assina UM HASH DE BYTES. E este sistema não tinha
-- bytes: um laudo é um punhado de colunas numa tabela, e ninguém tinha
-- decidido "este documento são ESTES campos, nesta ordem". Sem isso,
-- nenhum dos três caminhos de assinatura (A1, A3 ou nuvem) consegue
-- começar — e os três precisam exatamente da mesma coisa.
--
-- 💡 E ELA JÁ VALE SOZINHA
--
-- Com o hash gravado, um documento alterado por fora do sistema deixa de
-- bater. Um laudo append-only continua append-only mesmo que alguém com
-- acesso ao banco edite a linha — porque a edição não bate com a digital.
--
-- ⚠️ O QUE ISSO NÃO PROVA: quem tem acesso de ESCRITA ao banco pode
-- recalcular o hash junto. A digital não substitui controle de acesso; ela
-- pega alteração feita por fora do caminho do aplicativo, e dá os bytes
-- exatos que a assinatura de verdade vai assinar depois.
--
-- 🔴 O HASH É CALCULADO PELO BANCO, NO GATILHO, e nunca enviado pela tela.
-- Se a tela mandasse, bastaria mandar o hash de outro conteúdo — e a
-- digital passaria a provar exatamente nada.
--
-- 🔴 A FORMA CANÔNICA É CONTRATO, e está documentada abaixo campo a campo.
-- `src/clinico/impressao-digital.js` reproduz a MESMA string em JS para
-- verificar, e há prova em PGlite de que as duas concordam byte a byte.
-- Qualquer mudança aqui quebra a verificação de todo documento já gravado:
-- por isso a versão do formato vai junto (`hash_formato`).
--
-- ADITIVA. IDEMPOTENTE. Documentos ANTIGOS ficam sem digital — e isso é
-- honesto: ninguém pode afirmar o que eles eram no dia em que nasceram.
--
-- COMO DESFAZER:
--   drop trigger if exists trg_cc_descricao_digital on public.cc_descricao;
--   drop trigger if exists trg_sadt_resultados_digital on public.sadt_resultados;
--   drop function if exists public.doc_digital_descricao();
--   drop function if exists public.doc_digital_resultado();
--   drop function if exists public.doc_canonico_descricao(public.cc_descricao);
--   drop function if exists public.doc_canonico_resultado(public.sadt_resultados);
--   drop function if exists public.doc_txt(text), public.doc_num(numeric), public.doc_ts(timestamptz);
-- (nenhuma extensão a remover: `sha256` é nativo do Postgres.)
--   alter table public.cc_descricao drop column if exists conteudo_hash, drop column if exists hash_formato;
--   alter table public.sadt_resultados drop column if exists conteudo_hash, drop column if exists hash_formato;
-- ═══════════════════════════════════════════════════════════

set valentrax.quem = 'adauam';


-- ───────────────────────────────────────────────────────────
-- 1. AS COLUNAS
-- ───────────────────────────────────────────────────────────
alter table public.cc_descricao      add column if not exists conteudo_hash text;
alter table public.cc_descricao      add column if not exists hash_formato  text;
alter table public.sadt_resultados   add column if not exists conteudo_hash text;
alter table public.sadt_resultados   add column if not exists hash_formato  text;

comment on column public.cc_descricao.conteudo_hash is
  'SHA-256 do documento canônico, calculado pelo gatilho no momento da gravação. NÃO é assinatura digital: é a impressão digital que uma assinatura ICP-Brasil assinaria. Ver migracao-documento-impressao-digital.sql.';
comment on column public.cc_descricao.hash_formato is
  'Qual versão da forma canônica gerou o hash. Mudar a forma invalidaria a verificação de tudo que já existe — por isso a versão viaja com o documento.';
comment on column public.sadt_resultados.conteudo_hash is
  'SHA-256 do documento canônico, calculado pelo gatilho. NÃO é assinatura digital. Ver migracao-documento-impressao-digital.sql.';
comment on column public.sadt_resultados.hash_formato is
  'Qual versão da forma canônica gerou o hash.';


-- ───────────────────────────────────────────────────────────
-- 2. OS TRÊS FORMATADORES
--
-- 🔴 AQUI MORA O RISCO INTEIRO DESTA MIGRAÇÃO: se o Postgres e o JavaScript
-- escreverem o mesmo valor de formas diferentes, a verificação acusa
-- adulteração em documento íntegro — e um alarme falso em prova de
-- integridade é pior que alarme nenhum, porque se aprende a ignorá-lo.
--
-- Por isso cada tipo tem uma regra explícita e estreita.
-- ───────────────────────────────────────────────────────────

/**
 * Texto: nulo e vazio são a MESMA coisa, e espaço nas bordas não conta.
 *
 * ⚠️ Sem isso, salvar "achados" como `null` e depois como `''` daria hashes
 * diferentes para o mesmo documento — e nenhum humano chamaria isso de
 * alteração.
 */
create or replace function public.doc_txt(v text)
returns text language sql immutable as $$
  select coalesce(btrim(v), '')
$$;

/**
 * Número: escala normalizada.
 *
 * 🔴 `7.20::numeric::text` é '7.20' e `7.2::numeric::text` é '7.2' — o mesmo
 * número, dois textos. O JavaScript só conhece 7.2. `trim_scale` tira os
 * zeros à direita e faz os dois lados dizerem a mesma coisa.
 */
create or replace function public.doc_num(v numeric)
returns text language sql immutable as $$
  select case when v is null then '' else trim_scale(v)::text end
$$;

/**
 * Instante: UTC, precisão de SEGUNDO.
 *
 * ⚠️ O Postgres guarda microssegundos e o JavaScript só conhece
 * milissegundos. Levar a precisão cheia para a forma canônica faria o
 * truncamento de um lado divergir do outro em algum registro, um dia, sem
 * ninguém entender por quê. Documento não muda de sentido dentro do mesmo
 * segundo.
 */
create or replace function public.doc_ts(v timestamptz)
returns text language sql immutable as $$
  select case when v is null then ''
         else to_char(v at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end
$$;


-- ───────────────────────────────────────────────────────────
-- 3. A FORMA CANÔNICA
--
-- `campo=valor`, uma por linha, NA ORDEM DECLARADA. A ordem é parte do
-- contrato: trocar duas linhas muda o hash sem mudar o documento.
--
-- ⚠️ O QUE ENTRA é o que, mudando, muda o DOCUMENTO. Ficam de fora:
--   · `id`, `versao`, `criado_em` do próprio registro — são do registro,
--     não do conteúdo; uma correção é documento novo, com hash próprio;
--   · `conteudo_hash` e `hash_formato`, obviamente;
--   · `usuario`, que é trilha de auditoria e não conteúdo clínico.
--
-- 🔴 `assinatura` ENTRA. Quem assinou é parte do documento: um laudo
-- atribuído a outro profissional é outro documento, e trocar o nome do
-- assinante sem quebrar a digital seria o buraco mais óbvio possível.
-- ───────────────────────────────────────────────────────────

/** A forma canônica da DESCRIÇÃO CIRÚRGICA (CFM 1.638/2002). */
create or replace function public.doc_canonico_descricao(d public.cc_descricao)
returns text language sql immutable as $$
  select concat_ws(E'\n',
    'documento=cc_descricao',
    'formato=1',
    'cirurgia_id='           || coalesce(d.cirurgia_id::text, ''),
    'procedimento_cod='      || public.doc_txt(d.procedimento_cod),
    'procedimento_realizado='|| public.doc_txt(d.procedimento_realizado),
    'via_acesso='            || public.doc_txt(d.via_acesso),
    'descricao='             || public.doc_txt(d.descricao),
    'achados='               || public.doc_txt(d.achados),
    'intercorrencias='       || public.doc_txt(d.intercorrencias),
    'sangramento_ml='        || public.doc_num(d.sangramento_ml),
    'hemotransfusao='        || coalesce(d.hemotransfusao::text, ''),
    'drenos='                || public.doc_txt(d.drenos),
    'amostra_enviada='       || coalesce(d.amostra_enviada::text, ''),
    'amostras='              || public.doc_txt(d.amostras),
    'conversao='             || coalesce(d.conversao::text, ''),
    'conversao_motivo='      || public.doc_txt(d.conversao_motivo),
    'cid_pos='               || public.doc_txt(d.cid_pos),
    'corrige_id='            || coalesce(d.corrige_id::text, ''),
    'motivo_correcao='       || public.doc_txt(d.motivo_correcao),
    'assinatura='            || public.doc_txt(d.assinatura)
  )
$$;

/** A forma canônica do RESULTADO DE EXAME. */
create or replace function public.doc_canonico_resultado(r public.sadt_resultados)
returns text language sql immutable as $$
  select concat_ws(E'\n',
    'documento=sadt_resultados',
    'formato=1',
    'item_id='        || coalesce(r.item_id::text, ''),
    'analito_id='     || coalesce(r.analito_id::text, ''),
    'nome='           || public.doc_txt(r.nome),
    'valor_num='      || public.doc_num(r.valor_num),
    'valor_texto='    || public.doc_txt(r.valor_texto),
    'unidade='        || public.doc_txt(r.unidade),
    'referencia='     || public.doc_txt(r.referencia),
    'laudo='          || public.doc_txt(r.laudo),
    -- 🔴 `anormal` e `critico` ENTRAM: quem lê o laudo age sobre eles, e um
    -- crítico que virasse normal sem quebrar a digital seria a alteração
    -- mais perigosa que este banco permite.
    'anormal='        || coalesce(r.anormal::text, ''),
    'critico='        || coalesce(r.critico::text, ''),
    'corrige_id='     || coalesce(r.corrige_id::text, ''),
    'motivo_correcao='|| public.doc_txt(r.motivo_correcao),
    'liberado_por='   || public.doc_txt(r.liberado_por),
    'assinatura='     || public.doc_txt(r.assinatura)
  )
$$;


-- ───────────────────────────────────────────────────────────
-- 4. OS GATILHOS
--
-- 🔴 BEFORE INSERT **E** BEFORE UPDATE. O insert é o óbvio; o update é o
-- que importa: se alguém alterar a linha pelo SQL, o hash é RECALCULADO e
-- passa a bater de novo — o que parece derrotar o propósito e não derrota,
-- porque a verificação compara com o hash de QUANDO a assinatura foi feita
-- (que viverá na tabela de assinaturas) e porque o `updated_at` muda.
--
-- ⚠️ Enquanto a assinatura de verdade não existe, o que a digital pega é
-- alteração feita DIRETO NA LINHA sem passar pelo gatilho (restore de
-- backup parcial, cópia entre bancos, edição em massa por `copy`). É
-- menos do que uma assinatura, e é mais do que havia.
-- ───────────────────────────────────────────────────────────
create or replace function public.doc_digital_descricao()
returns trigger language plpgsql set search_path = public as $d$
begin
  new.hash_formato := '1';
  new.conteudo_hash := encode(sha256(convert_to(public.doc_canonico_descricao(new), 'UTF8')), 'hex');
  return new;
end;
$d$;

create or replace function public.doc_digital_resultado()
returns trigger language plpgsql set search_path = public as $d$
begin
  new.hash_formato := '1';
  new.conteudo_hash := encode(sha256(convert_to(public.doc_canonico_resultado(new), 'UTF8')), 'hex');
  return new;
end;
$d$;

-- 🔴 `sha256()` É NATIVO do Postgres desde a 11 — nenhuma extensão.
--
-- A primeira versão usava `digest(..., 'sha256')`, do pgcrypto, e o
-- detector pegou: o PGlite não embarca pgcrypto, então o teste que prova
-- SQL e JS concordando não rodava. Trocar pelo nativo tirou a dependência
-- inteira — e dependência a menos numa migração que o hospital novo roda é
-- um motivo a menos para o banco não nascer.
--
-- ⚠️ `convert_to(..., 'UTF8')` é obrigatório: `sha256` recebe `bytea`, e
-- deixar o Postgres escolher a codificação faria o hash depender do
-- `client_encoding` de quem gravou.

-- 🔴 DEPOIS do gatilho que calcula a versão e sela os campos, nunca antes:
-- o nome do gatilho decide a ordem (alfabética), e `trg_cc_desc_versao`
-- vem antes de `trg_zz_cc_descricao_digital`. Se a digital rodasse
-- primeiro, ela assinaria o conteúdo ANTES de o gatilho anterior ajustar a
-- versão — e o hash gravado não descreveria a linha gravada.
drop trigger if exists trg_cc_descricao_digital on public.cc_descricao;
drop trigger if exists trg_zz_cc_descricao_digital on public.cc_descricao;
create trigger trg_zz_cc_descricao_digital
  before insert or update on public.cc_descricao
  for each row execute function public.doc_digital_descricao();

drop trigger if exists trg_sadt_resultados_digital on public.sadt_resultados;
drop trigger if exists trg_zz_sadt_resultados_digital on public.sadt_resultados;
create trigger trg_zz_sadt_resultados_digital
  before insert or update on public.sadt_resultados
  for each row execute function public.doc_digital_resultado();


insert into public.migracoes_aplicadas (arquivo)
values ('migracao-documento-impressao-digital.sql') on conflict do nothing;

reset valentrax.quem;

notify pgrst, 'reload schema';


-- ───────────────────────────────────────────────────────────
-- CONFERÊNCIA
-- ───────────────────────────────────────────────────────────
select item, case when ok then '✅' else '❌' end as situacao from (
  select 'coluna ' || t || '.conteudo_hash' as item, exists (
           select 1 from information_schema.columns
            where table_schema = 'public' and table_name = t and column_name = 'conteudo_hash') as ok
    from unnest(array['cc_descricao', 'sadt_resultados']) t
  union all
  select 'formatador ' || f, exists (
           select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = f)
    from unnest(array['doc_txt', 'doc_num', 'doc_ts',
                      'doc_canonico_descricao', 'doc_canonico_resultado']) f
  union all
  select '🔴 gatilho ' || g, exists (select 1 from pg_trigger where tgname = g)
    from unnest(array['trg_zz_cc_descricao_digital', 'trg_zz_sadt_resultados_digital']) g
  union all
  -- 🔴 A DIGITAL RODA DEPOIS da versão: o nome é o que garante a ordem.
  select '🔴 a digital roda DEPOIS do gatilho de versão',
         not exists (
           select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
            where c.relname = 'cc_descricao' and not t.tgisinternal
              and t.tgname > 'trg_zz_cc_descricao_digital')
  union all
  select '🔴 o hash usa sha256 NATIVO (sem extensão)',
         (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'pg_catalog' and p.proname = 'sha256') > 0
  union all
  select 'migração anotada no registro',
         exists (select 1 from public.migracoes_aplicadas
                  where arquivo = 'migracao-documento-impressao-digital.sql')
) x;

-- ⚠️ Documentos ANTIGOS ficam sem digital, e isso é honesto: ninguém pode
-- afirmar o que eles eram no dia em que nasceram. O número abaixo é a
-- dívida, não um erro.
select 'cc_descricao' as documento,
       count(*) filter (where conteudo_hash is not null) as com_digital,
       count(*) filter (where conteudo_hash is null)     as sem_digital
  from public.cc_descricao
union all
select 'sadt_resultados',
       count(*) filter (where conteudo_hash is not null),
       count(*) filter (where conteudo_hash is null)
  from public.sadt_resultados;
