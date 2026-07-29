-- ═══════════════════════════════════════════════════════════
-- CONFERÊNCIA DO MÓDULO ATENDIMENTO — só leitura
--
-- Roda depois de `migracao-atendimento-recepcao.sql`. Não grava nada e não
-- consome número da sequência.
--
-- O SQL Editor do Supabase mostra apenas o resultado da ÚLTIMA instrução
-- quando se roda várias de uma vez — por isso aqui é uma consulta só, em
-- linhas, em vez de sete selects separados.
--
-- O QUE OLHAR
--   orfaos                    → tem que ser 0 depois do backfill
--   grants_atendimento        → tem que ser 9 (senão o menu não aparece)
--   maior_prontuario_existente→ é ele que ancora a emissão. Se for um
--                               registro de teste com número alto, todos os
--                               prontuários futuros nascem acima dele.
-- ═══════════════════════════════════════════════════════════

select 'orfaos (atendimento sem cadastro)' as item,
       count(*)::text as valor
  from public.ps_atendimentos a
 where a.prontuario is not null
   and not exists (select 1 from public.pacientes p where p.prontuario = a.prontuario)

union all
select 'pacientes cadastrados', count(*)::text from public.pacientes

union all
select 'criados pelo backfill', count(*)::text
  from public.pacientes where origem_cadastro = 'backfill'

union all
select 'aguardando identificacao', count(*)::text
  from public.pacientes where nao_identificado and identificado_em is null

union all
select 'grants do modulo atendimento', count(*)::text
  from public.perfis_permissoes where modulo = 'atendimento'

union all
select 'proximo prontuario a emitir', (last_value + 1)::text
  from public.prontuario_seq

union all
select 'maior prontuario existente', coalesce((
    select prontuario from public.pacientes
     where prontuario ~ '[0-9]'
       and length(regexp_replace(prontuario, '[^0-9]', '', 'g')) between 1 and 12
     order by (regexp_replace(prontuario, '[^0-9]', '', 'g'))::bigint desc
     limit 1), '(nenhum)')

union all
select 'quem criou o maior', coalesce((
    select coalesce(usuario, '(sem usuario)') || ' · origem=' || coalesce(origem_cadastro, '(nula)')
      from public.pacientes
     where prontuario ~ '[0-9]'
       and length(regexp_replace(prontuario, '[^0-9]', '', 'g')) between 1 and 12
     order by (regexp_replace(prontuario, '[^0-9]', '', 'g'))::bigint desc
     limit 1), '(nenhum)')

union all
select 'prontuarios com 6+ digitos', count(*)::text
  from public.pacientes
 where length(regexp_replace(coalesce(prontuario, ''), '[^0-9]', '', 'g')) >= 6;
