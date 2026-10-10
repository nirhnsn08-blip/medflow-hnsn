-- ============================================================
-- Valentrax — AS FUNÇÕES DE PERMISSÃO (leitura e escrita por módulo)
--
-- ⚠️ ARQUIVO GERADO — não edite à mão.
--    Regenere com:  node supabase/gerar-rls.mjs
--
-- 🔴 POR QUE ESTE ARQUIVO EXISTE, SEPARADO (08/10/2026)
--
-- As cinco funções nasceram dentro de `migracao-rls-leitura.sql`, que é a
-- ÚLTIMA migração do `reconstruir-banco.sql` — e por bom motivo: ela
-- reescreve as políticas de SELECT de todas as tabelas criadas antes.
--
-- Só que 24 políticas criadas no MEIO do caminho já citam
-- `public.pode_ver_algum(...)`. Num banco NOVO essas políticas são criadas
-- antes de a função existir, e `create policy` resolve a função na hora:
-- a reconstrução morria em `at_glosas_leitura`, a 55% do script. O hospital
-- novo não nascia — e ninguém sabia, porque nenhum teste EXECUTAVA o
-- arquivo; o que havia conferia presença de migração, não execução.
--
-- Medido em PGlite: com as funções antes, as 1.846 declarações rodam e as
-- 109 tabelas nascem. `banco-novo-nasce.test.js` é a catraca.
--
-- ⚠️ O MESMO TEXTO segue na PARTE 1 do `migracao-rls-leitura.sql`, para quem
--    reexecutar só ela não ficar sem função. Os dois saem da MESMA const
--    do gerador — duas cópias à mão divergiriam.
--
-- ADITIVA. IDEMPOTENTE (`create or replace`). Em banco que já rodou o
-- rls-leitura, substitui as funções pelo mesmo corpo: nada muda.
-- ============================================================

set valentrax.quem = 'adauam';

-- Espelham `src/acesso/permissoes.js`, nesta ordem: perfil → exceção
-- individual → travas. `security definer` porque a função precisa ler
-- `profiles` e `perfis_permissoes` por baixo do RLS delas.

-- O nível efetivo desta pessoa neste módulo: nenhum | leitura | escrita.
create or replace function public.meu_nivel(p_modulo text)
returns text
language sql
stable
security definer
set search_path = public
as $meu_nivel$
  with me as (
    select id, role, perfil from public.profiles where id = auth.uid()
  ),
  bruto as (
    select coalesce(
      -- 1) a exceção individual manda (serve para AMPLIAR e para REDUZIR)
      (select up.nivel from public.usuarios_permissoes up, me
        where up.user_id = me.id and up.modulo = p_modulo),
      -- 2) o pacote do cargo
      (select pp.nivel from public.perfis_permissoes pp, me
        where pp.perfil_chave = me.perfil and pp.modulo = p_modulo),
      -- 3) sem perfil é sem acesso — falha FECHADA
      'nenhum'
    ) as nivel
  )
  select case
    -- Trava anti-trancamento: Usuários e Perfis é sempre, e só, do
    -- adm_master. Sem isto, um perfil configurado errado tranca o
    -- administrador do lado de fora e só se resolve pelo painel.
    when p_modulo = 'users' then
      case when (select role from me) = 'adm_master' then 'escrita' else 'nenhum' end
    -- Teto do visualizador: nunca escreve, tenha o perfil que tiver.
    when (select role from me) = 'visualizador' and (select nivel from bruto) = 'escrita' then
      'leitura'
    else (select nivel from bruto)
  end
$meu_nivel$;

-- Pode ABRIR o módulo? (leitura ou escrita)
create or replace function public.pode_ver(p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $pode_ver$
  select public.meu_nivel(p_modulo) in ('leitura', 'escrita')
$pode_ver$;

-- Pode abrir ALGUM destes? Uma tela lê tabela de vizinho por bom motivo:
-- o Giro de Leitos monta o mapa de risco com as escalas de enfermagem, o
-- Paciente 360 junta PS, leito, SCIH e PEP na mesma consulta.
create or replace function public.pode_ver_algum(variadic p_modulos text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $pode_ver_algum$
  select exists (select 1 from unnest(p_modulos) m where public.pode_ver(m))
$pode_ver_algum$;

-- Pode LANÇAR no módulo? Ainda não é usada por política nenhuma — a
-- escrita continua decidida por `role`. Fica pronta para a fase seguinte.
create or replace function public.pode_editar(p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $pode_editar$
  select public.meu_nivel(p_modulo) = 'escrita'
$pode_editar$;

-- Escreve em ALGUM destes módulos? Espelha `pode_ver_algum`, para a tabela
-- que serve a mais de um módulo (`sup_itens` é do almoxarifado e da
-- farmácia; quem tem escrita em qualquer um dos dois grava nela).
create or replace function public.pode_editar_algum(variadic p_modulos text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $pode_editar_algum$
  select exists (select 1 from unnest(p_modulos) m where public.pode_editar(m))
$pode_editar_algum$;


insert into public.migracoes_aplicadas (arquivo)
values ('migracao-acesso-funcoes.sql') on conflict do nothing;

reset valentrax.quem;

notify pgrst, 'reload schema';


-- ───────────────────────────────────────────────────────────
-- CONFERÊNCIA
-- ───────────────────────────────────────────────────────────
select item, case when ok then '✅' else '❌' end as situacao from (
  select 'função public.' || f as item,
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = f) as ok
    from unnest(array['meu_nivel','pode_ver','pode_ver_algum','pode_editar','pode_editar_algum']) f
  union all
  -- 🔴 A conferência que importa: a função RESPONDE. Se o corpo cita uma
  -- tabela que não existe, ela é criada e estoura no primeiro uso — que
  -- seria dentro de uma política de RLS, com o hospital aberto.
  select '🔴 pode_ver_algum responde sem estourar',
         (select public.pode_ver_algum('overview')) is not null
  union all
  select 'migração anotada no registro',
         exists (select 1 from public.migracoes_aplicadas
                  where arquivo = 'migracao-acesso-funcoes.sql')
) x;
