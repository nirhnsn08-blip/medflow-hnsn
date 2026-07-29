-- ═══════════════════════════════════════════════════════════
-- ANTES DE RODAR A MIGRAÇÃO NO BANCO PRINCIPAL — só leitura
--
-- Roda ANTES de `migracao-atendimento-recepcao.sql`, no banco do hospital.
-- Não grava nada, não cria nada, não consome sequência.
--
-- POR QUE ISTO EXISTE
-- No banco demo a sequência ancorou em 990001 porque alguém havia digitado
-- esse número no campo prontuário da chegada do PS, e o backfill
-- transformou o engano num cadastro. A correção já está na migração — mas
-- a lição é que **a numeração futura depende do que já está gravado**, e
-- isso ninguém sabe de cabeça.
--
-- Esta consulta responde três perguntas antes de qualquer escrita:
--   1. de onde a numeração vai continuar;
--   2. quanto trabalho o backfill vai ter;
--   3. existe número absurdo escondido no acervo?
--
-- ⚠️ Se `prontuarios com 7+ digitos` for maior que zero, PARE e olhe a
--    lista da última consulta antes de rodar a migração.
-- ═══════════════════════════════════════════════════════════

select 'pacientes cadastrados hoje' as item, count(*)::text as valor
  from public.pacientes

union all
select 'atendimentos do PS sem cadastro (o backfill vai criar)', count(*)::text
  from public.ps_atendimentos a
 where a.prontuario is not null and trim(a.prontuario) <> ''
   and not exists (select 1 from public.pacientes p where p.prontuario = trim(a.prontuario))

union all
select 'leitos ocupados sem cadastro (o backfill vai criar)', count(*)::text
  from public.leitos l
 where l.prontuario is not null and trim(l.prontuario) <> ''
   and not exists (select 1 from public.pacientes p where p.prontuario = trim(l.prontuario))

union all
select 'prontuarios com espaco sobrando (serao normalizados)', count(*)::text
  from public.ps_atendimentos
 where prontuario is distinct from nullif(trim(prontuario), '')

union all
select 'prontuarios so com digitos', count(*)::text
  from public.pacientes
 where prontuario ~ '^[0-9]+$'

union all
select 'prontuarios com letra ou simbolo', count(*)::text
  from public.pacientes
 where prontuario !~ '^[0-9]+$'

union all
select '>> DE ONDE A NUMERACAO VAI CONTINUAR', coalesce((
    select (regexp_replace(prontuario, '[^0-9]', '', 'g'))::bigint::text
      from public.pacientes
     where prontuario ~ '[0-9]'
       and length(regexp_replace(prontuario, '[^0-9]', '', 'g')) between 1 and 6
       and origem_cadastro is distinct from 'backfill'
     order by (regexp_replace(prontuario, '[^0-9]', '', 'g'))::bigint desc
     limit 1), '(nenhum - comecaria em 1001)')

union all
select '>> prontuarios com 7+ digitos (SUSPEITOS)', count(*)::text
  from public.pacientes
 where length(regexp_replace(coalesce(prontuario, ''), '[^0-9]', '', 'g')) >= 7;


-- ── Os 10 maiores, para olho humano conferir ────────────────
-- Aqui é onde CPF, telefone e data digitados no campo errado aparecem.
select prontuario,
       iniciais,
       length(regexp_replace(prontuario, '[^0-9]', '', 'g')) as digitos,
       usuario,
       updated_at
  from public.pacientes
 where prontuario ~ '[0-9]'
 order by (regexp_replace(prontuario, '[^0-9]', '', 'g'))::numeric desc
 limit 10;
