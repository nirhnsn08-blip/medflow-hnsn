-- ═══════════════════════════════════════════════════════════
-- ENSAIO: o que aconteceria se a ESCRITA passasse a ser por módulo
--
-- SÓ LEITURA. Não altera nada. Rode antes de qualquer migração de escrita.
--
-- ── O problema que este ensaio existe para evitar ──────────
-- Hoje as políticas de escrita olham `my_role()`: quem é `adm_silver`
-- grava em qualquer tabela que tenha política de escrita, independente do
-- módulo. A função `public.pode_editar(modulo)` já existe no banco e está
-- SEM USO — o autor do RLS de leitura a deixou pronta e anotou que
-- "escrita por papel é fase própria".
--
-- Ligar essa fase troca `my_role() in ('adm_master','adm_silver')` por
-- `pode_editar('<modulo>')`. Quem não tiver `escrita` no módulo PERDE a
-- gravação — e perde em silêncio, porque o PostgREST responde 2xx
-- alterando zero linhas.
--
-- 🔴 Isto já aconteceu neste projeto. O PR #60 ligou RLS e trancou a
-- escrita de 18 tabelas AO VIVO, e ninguém percebeu na hora porque as
-- telas percorridas eram de leitura. O ensaio abaixo é exatamente o que
-- faltou naquele dia.
--
-- ── Como ler o resultado ───────────────────────────────────
-- O bloco 3 é o que importa: cada linha é uma pessoa que HOJE grava num
-- módulo e DEIXARIA de gravar. Se vier vazio, a trava pode entrar sem
-- susto. Se vier com linhas, corrija os perfis ANTES — não depois.
--
-- Rodar nos DOIS bancos (demo e principal): as pessoas e os perfis são
-- diferentes em cada um.
-- ═══════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────
-- BLOCO 1 — quem está em cada perfil (retrato de hoje)
-- ───────────────────────────────────────────────────────────
select '1. PESSOAS POR PERFIL' as bloco,
       coalesce(p.perfil, '(sem perfil)') as perfil,
       coalesce(p.role, '(sem role)')     as papel_de_sistema,
       count(*)::text                     as pessoas,
       string_agg(p.username, ', ' order by p.username) as quem
  from public.profiles p
 where p.desligado_em is null
 group by 1, 2, 3
 order by count(*) desc;

-- ───────────────────────────────────────────────────────────
-- BLOCO 2 — módulos onde SÓ o perfil provisório tem escrita
--
-- Se um módulo aparece aqui, a trava por módulo não protege nada nele até
-- alguém receber escrita de verdade — e trava que não protege dá falsa
-- sensação de controle, que é pior que ausência de controle.
-- ───────────────────────────────────────────────────────────
select '2. MODULO SEM ESCRITA REAL' as bloco,
       pp.modulo,
       string_agg(pp.perfil_chave, ', ' order by pp.perfil_chave) as perfis_com_escrita
  from public.perfis_permissoes pp
 where pp.nivel = 'escrita'
 group by 1, 2
having bool_and(pp.perfil_chave = 'provisorio')
 order by 2;

-- ───────────────────────────────────────────────────────────
-- BLOCO 3 — 🔴 O QUE QUEBRARIA
--
-- Pessoa ativa que HOJE grava no módulo (porque é adm_master/adm_silver e
-- a política olha só o papel) e que DEIXARIA de gravar, porque o perfil
-- dela não dá `escrita` naquele módulo.
--
-- `adm_master` fica de fora: a trava anti-trancamento garante que ele
-- mantém o alcance, e ele é a porta de volta se algo der errado.
-- ───────────────────────────────────────────────────────────
select '3. PERDERIA A ESCRITA' as bloco,
       p.username,
       coalesce(p.perfil, '(sem perfil)') as perfil,
       m.modulo,
       coalesce(pp.nivel, '(nenhum)')     as nivel_hoje_no_perfil
  from public.profiles p
 cross join (
   select unnest(array[
     'overview','atendimento','ambulatorio','ps','bloco','leitos','scih','nsp',
     'protocolos','paciente','farmacia','controlados','suprimentos','faturamento',
     'print','auditoria','import','users'
   ]) as modulo
 ) m
  left join public.perfis_permissoes pp
         on pp.perfil_chave = p.perfil and pp.modulo = m.modulo
 where p.desligado_em is null
   and p.role = 'adm_silver'                    -- hoje escreve por papel
   and coalesce(pp.nivel, 'nenhum') <> 'escrita' -- amanhã não escreveria
 order by p.username, m.modulo;

-- ───────────────────────────────────────────────────────────
-- BLOCO 4 — resumo. É a ÚLTIMA consulta de propósito: o SQL Editor mostra
-- só o resultado dela.
--
-- "pessoas que perderiam escrita" = 0 significa que a trava pode entrar
-- sem quebrar ninguém. Diferente de zero, corrija os perfis primeiro.
-- ───────────────────────────────────────────────────────────
select 'pessoas ativas' as item,
       (select count(*) from public.profiles where desligado_em is null)::text as valor
union all
select 'ainda no perfil provisorio',
       (select count(*) from public.profiles
         where desligado_em is null and perfil = 'provisorio')::text
union all
select 'pessoas que PERDERIAM escrita em algum modulo',
       (select count(distinct p.username)
          from public.profiles p
         cross join (select unnest(array['overview','atendimento','ambulatorio','ps','bloco','leitos','scih','nsp','protocolos','paciente','farmacia','controlados','suprimentos','faturamento','print','auditoria','import','users']) as modulo) m
          left join public.perfis_permissoes pp on pp.perfil_chave = p.perfil and pp.modulo = m.modulo
         where p.desligado_em is null and p.role = 'adm_silver'
           and coalesce(pp.nivel, 'nenhum') <> 'escrita')::text
union all
select 'combinacoes pessoa x modulo que quebrariam',
       (select count(*)
          from public.profiles p
         cross join (select unnest(array['overview','atendimento','ambulatorio','ps','bloco','leitos','scih','nsp','protocolos','paciente','farmacia','controlados','suprimentos','faturamento','print','auditoria','import','users']) as modulo) m
          left join public.perfis_permissoes pp on pp.perfil_chave = p.perfil and pp.modulo = m.modulo
         where p.desligado_em is null and p.role = 'adm_silver'
           and coalesce(pp.nivel, 'nenhum') <> 'escrita')::text;
