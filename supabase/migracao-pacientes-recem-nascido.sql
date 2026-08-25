-- ============================================================
-- Valentrax — O RECÉM-NASCIDO ENTRA NO SISTEMA
--
-- POR QUE ESTA MIGRAÇÃO EXISTE
-- O hospital faz parto e o bebê NÃO TINHA COMO SER CADASTRADO. Não é que o
-- caminho fosse ruim: ele não existia. Zero ocorrências de `prontuario_mae`,
-- `dnv` ou `recem_nascido` no código inteiro.
--
-- O cadastro pede nome, CPF e CNS. O recém-nascido não tem nenhum dos três
-- no dia em que nasce — ele tem outra identidade, e ela é bem definida:
--
--   • o nome provisório "RN de <mãe>", convenção nacional;
--   • a DNV (Declaração de Nascido Vivo), documento dele até sair a
--     certidão, NUMERADA E ÚNICA POR NASCIMENTO;
--   • o vínculo com o prontuário da mãe, por onde se reconstrói o parto e
--     por onde se confere a quem o bebê pertence na alta;
--   • a hora do nascimento, que na primeira semana de vida é dado clínico.
--
-- ⚠️ A COLUNA QUE EXISTE POR CAUSA DE SEGURANÇA DO PACIENTE É A `dnv`.
-- Dois irmãos do mesmo parto têm a mesma mãe, a mesma data e nomes quase
-- idênticos — e o verificador de duplicidade os acusava de ser a mesma
-- pessoa com 90% de confiança, oferecendo "use o prontuário que já existe".
-- Seguir isso junta dois bebês num prontuário só, e a partir dali a
-- prescrição de um vale para o outro.
--
-- A DNV é o que separa: diferente = dois nascimentos; igual = um só, e aí a
-- duplicidade tem que continuar avisando. O índice único abaixo é a garantia
-- de que ela não vira dois cadastros para o mesmo nascimento.
--
-- ⚠️ ADITIVA. Colunas novas, uma FK, um índice único parcial. Nada que era
-- aceito passa a ser recusado — nenhum cadastro existente tem DNV, então o
-- índice nasce sem nada para reprovar.
--
-- COMO DESFAZER:
--   drop index if exists public.pacientes_dnv_unica;
--   alter table public.pacientes
--     drop constraint if exists pacientes_mae_fk,
--     drop column if exists prontuario_mae,
--     drop column if exists dnv,
--     drop column if exists hora_nascimento,
--     drop column if exists ordem_nascimento;
-- ============================================================

-- ── 1. AS COLUNAS ───────────────────────────────────────────
alter table public.pacientes
  -- O vínculo do parto. O bebê tem prontuário PRÓPRIO — ele é outra pessoa,
  -- com histórico próprio — e este campo é o que liga os dois lados sem
  -- misturá-los.
  add column if not exists prontuario_mae text,

  -- Declaração de Nascido Vivo. Texto e não número: vem com zeros à
  -- esquerda e o formato varia por estado; guardar como inteiro comeria o
  -- zero e transformaria duas DNVs em uma.
  add column if not exists dnv text,

  -- A hora importa. Na primeira semana de vida a idade se conta em horas, e
  -- é ela que distingue dois gêmeos nascidos no mesmo minuto do mesmo dia.
  add column if not exists hora_nascimento time,

  -- 1 para o primeiro do parto, 2 para o segundo. É a prova de segunda
  -- linha quando a DNV ainda não saiu.
  add column if not exists ordem_nascimento smallint;


-- ── 2. A MÃE É UM PACIENTE DE VERDADE ───────────────────────
-- FK para o cadastro dela. `on delete set null`: paciente neste sistema não
-- se apaga, mas se um dia alguém apagar a mãe, o bebê perde o vínculo em vez
-- de desaparecer junto.
--
-- Envelopado porque a FK falha se houver `prontuario_mae` órfão — e prefere
-- avisar a derrubar a migração inteira.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pacientes_mae_fk'
  ) then
    alter table public.pacientes
      add constraint pacientes_mae_fk
      foreign key (prontuario_mae) references public.pacientes (prontuario)
      on delete set null;
  end if;
exception when others then
  raise notice 'ATENCAO: nao foi possivel criar a FK da mae (%). Ha prontuario_mae apontando para cadastro que nao existe.', sqlerrm;
end $$;


-- ── 3. UMA DNV, UM NASCIMENTO ───────────────────────────────
-- A garantia que o código sozinho não dá: a regra em `recem-nascido.js` usa
-- a DNV para separar gêmeos de duplicata, e ela só funciona se a DNV for de
-- fato única. Duas recepcionistas cadastrando o mesmo bebê ao mesmo tempo
-- passariam pelas duas checagens antes de qualquer uma gravar.
--
-- PARCIAL (`where dnv is not null`) porque a esmagadora maioria dos
-- pacientes não é recém-nascido e nunca terá DNV — sem o filtro, o índice
-- reprovaria o segundo cadastro sem DNV do acervo inteiro.
create unique index if not exists pacientes_dnv_unica
  on public.pacientes (dnv)
  where dnv is not null and btrim(dnv) <> '';


-- ── 4. ACHAR OS IRMÃOS DE UM PARTO ──────────────────────────
-- A tela pergunta "esta mãe já tem outro bebê cadastrado hoje?" — é como se
-- descobre que o parto foi múltiplo antes de criar o segundo cadastro.
create index if not exists pacientes_mae_idx
  on public.pacientes (prontuario_mae)
  where prontuario_mae is not null;


-- ── 5. CONFERÊNCIA (leitura; o resultado é o recibo) ────────
select 'colunas novas (esperado 4)' as item,
       count(*)::text as situacao
  from information_schema.columns
 where table_schema = 'public' and table_name = 'pacientes'
   and column_name in ('prontuario_mae', 'dnv', 'hora_nascimento', 'ordem_nascimento')

union all
select 'FK da mae',
       case when exists (
         select 1 from pg_constraint where conname = 'pacientes_mae_fk'
       ) then '✅ existe' else '❌ NAO — ver o aviso do passo 2' end

union all
select 'indice unico da DNV',
       case when exists (
         select 1 from pg_indexes
          where schemaname = 'public' and indexname = 'pacientes_dnv_unica'
       ) then '✅ existe' else '❌ NAO — a mesma DNV poderia virar dois cadastros' end

union all
select 'indice para achar irmaos do parto',
       case when exists (
         select 1 from pg_indexes
          where schemaname = 'public' and indexname = 'pacientes_mae_idx'
       ) then '✅ existe' else '❌ NAO' end

union all
select 'recem-nascidos ja vinculados a uma mae',
       count(*)::text
  from public.pacientes
 where prontuario_mae is not null

union all
-- Deve dar zero num banco que nunca teve estas colunas. Se der mais que
-- zero, alguem cadastrou DNV repetida antes do indice existir.
select 'DNVs repetidas (tem que ser 0)',
       coalesce(sum(qtd - 1), 0)::text
  from (
    select count(*) as qtd
      from public.pacientes
     where dnv is not null and btrim(dnv) <> ''
     group by dnv
    having count(*) > 1
  ) repetidas;
