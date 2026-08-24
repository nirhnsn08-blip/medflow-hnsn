-- ============================================================
-- Valentrax — PACIENTE ESTRANGEIRO E ETNIA INDÍGENA
--
-- POR QUE ESTA MIGRAÇÃO EXISTE
-- O cadastro atende mal duas populações que chegam no balcão, cada uma de
-- um jeito diferente — e as duas em silêncio:
--
--   1. O ESTRANGEIRO FICA COM PENDÊNCIA IMPOSSÍVEL. Município e UF de
--      nascimento são exigências ESSENCIAIS para todo mundo. Quem nasceu
--      no Uruguai não tem nem um nem outro: o cadastro nunca chega a
--      "completo" e a tela cobra para sempre dois campos que não existem.
--      Pendência que não tem como ser resolvida ensina a recepção a
--      ignorar o aviso — e aí o aviso que importa some junto com ele.
--
--      Falta ainda onde guardar o PAÍS de nascimento (que é a naturalidade
--      de quem nasceu fora) e o PASSAPORTE, que é o documento legal de
--      quem pode não ter CPF nenhum.
--
--   2. O INDÍGENA FICA COM ARQUIVO REJEITADO. "Indígena" já é opção de
--      raça/cor e para por aí. Nos sistemas de informação do SUS a ETNIA é
--      obrigatória junto: raça/cor indígena sozinha não é aceita e o BPA
--      volta. O cadastro parece correto na tela e quebra no fechamento do
--      mês, longe de quem digitou — que é a pior distância possível entre
--      o erro e quem poderia consertá-lo.
--
-- O QUE ENTRA
--   • `pais_nascimento` — a naturalidade de quem nasceu fora;
--   • `passaporte`      — o documento de quem pode não ter CPF;
--   • `etnia_indigena`  — exigida quando a raça/cor é indígena.
--
-- O QUE NÃO ENTRA, E POR QUÊ
-- `nacionalidade` JÁ EXISTE como texto livre, com "Brasileira" de padrão.
-- Não é convertida para código aqui: o sistema lê pelas duas convenções
-- (`normalizarNacionalidade`), exatamente como já faz com `sexo`, que tem
-- "masculino"/"M" convivendo na base. Converter o acervo inteiro num
-- UPDATE seria mexer em dado de paciente para resolver um problema que a
-- leitura resolve — e o formulário já grava o valor novo ao salvar.
--
-- NÃO HÁ CHECK NEM CONSTRAINT NOVA, DE PROPÓSITO.
-- A conferência do cadastro NUNCA bloqueia: emergência entra com o que dá
-- (CFM 1.638, art. 5º, I, "e"). Um CHECK exigindo etnia recusaria o INSERT
-- de um politraumatizado indígena sem documento — inverteria a prioridade
-- e, pior, o PostgREST devolveria o erro numa tela que não espera erro.
-- A exigência mora na conferência, visível, para ser completada depois.
--
-- ⚠️ ADITIVA. Só `add column if not exists` e um UPDATE que preenche
-- coluna nova a partir de coluna existente, sem apagar nada.
--
-- COMO DESFAZER:
--   alter table public.pacientes
--     drop column if exists pais_nascimento,
--     drop column if exists passaporte,
--     drop column if exists etnia_indigena;
-- ============================================================

-- ── 1. AS COLUNAS ───────────────────────────────────────────
alter table public.pacientes
  -- A naturalidade de quem nasceu fora. Ocupa o lugar de município + UF na
  -- conferência: um substitui o outro, nunca os dois ao mesmo tempo.
  add column if not exists pais_nascimento text,

  -- O documento legal do paciente estrangeiro. Turista e recém-chegado
  -- podem não ter CPF; quem já tirou resolve com o CPF mesmo. A exigência
  -- é ter UM documento, não ter aquele documento.
  add column if not exists passaporte text,

  -- Texto, não código. A Tabela de Etnias Indígenas do SUS tem centenas de
  -- entradas com código de 4 dígitos, e inventar código aqui seria pior
  -- que não ter: código errado não é recusado no ato — vai para o arquivo
  -- de produção e volta como glosa, com o nome de um povo trocado pelo de
  -- outro. Grava-se o NOME, que é o que a recepção sabe conferir com a
  -- pessoa na frente. O código entra quando a exportação do BPA for
  -- escrita, com a tabela oficial ao lado.
  add column if not exists etnia_indigena text;


-- ── 2. O TEXTO LIVRE QUE JÁ ESTAVA LÁ ───────────────────────
-- `nacionalidade` é campo aberto desde sempre, e quem preencheu à mão
-- escreveu o PAÍS ("Uruguaia", "Haitiana") em vez de "Estrangeira". Esse
-- texto é a única informação de origem que existe sobre essas pessoas —
-- deixá-lo onde está faria a tela pedir o país de nascimento de alguém
-- cujo país já estava digitado na linha de cima.
--
-- Só preenche o que está vazio. Roda duas vezes sem efeito na segunda.
update public.pacientes
   set pais_nascimento = nacionalidade
 where pais_nascimento is null
   and nacionalidade is not null
   and btrim(nacionalidade) <> ''
   and lower(btrim(nacionalidade)) not in
       ('brasileira', 'brasileiro', 'brasil', 'brazil', 'naturalizada',
        'naturalizado', 'estrangeira', 'estrangeiro');


-- ── 3. CONFERÊNCIA (leitura; o resultado é o recibo) ────────
select 'colunas novas (esperado 3)' as item,
       count(*)::text as situacao
  from information_schema.columns
 where table_schema = 'public' and table_name = 'pacientes'
   and column_name in ('pais_nascimento', 'passaporte', 'etnia_indigena')

union all
select 'pacientes com pais_nascimento recuperado do texto livre',
       count(*)::text
  from public.pacientes
 where pais_nascimento is not null

union all
select 'pacientes indigenas SEM etnia (viram pendencia na tela)',
       count(*)::text
  from public.pacientes
 where lower(btrim(coalesce(raca_cor, ''))) = 'indigena'
   and coalesce(btrim(etnia_indigena), '') = ''

union all
-- Não deve haver nenhuma trava nova: a conferência do cadastro não bloqueia.
select 'nenhum CHECK novo em pacientes',
       case when exists (
         select 1 from pg_constraint
          where conrelid = 'public.pacientes'::regclass
            and contype = 'c'
            and pg_get_constraintdef(oid) ilike any (array['%etnia%', '%passaporte%', '%pais_nascimento%'])
       ) then '❌ existe trava — emergencia deixaria de entrar' else '✅ nenhuma' end;
