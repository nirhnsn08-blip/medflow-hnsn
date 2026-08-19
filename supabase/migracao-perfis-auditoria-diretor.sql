-- ═══════════════════════════════════════════════════════════
-- AUDITORIA: DIRETOR TÉCNICO PASSA A SÓ CONSULTAR A TRILHA
--
-- Decisão de gestão: manter o acesso à Auditoria estreito e tirar a
-- ESCRITA do diretor técnico, deixando LEITURA. A trilha é append-only e
-- vale como prova; consultar basta. Quem é auditado não deve administrar a
-- própria trilha — o valor probatório se preserva quando o acesso é o menor
-- que dá conta do papel (o diretor RESPONDE pelo prontuário, não edita o log).
--
-- ⚠️ PRECISA DE UPDATE EXPLÍCITO, não do seed. O seed de
-- `migracao-perfis-acesso.sql` insere com `on conflict do nothing`: num
-- banco que já rodou aquela migração, a linha
-- ('diretor_tecnico','auditoria','escrita') JÁ existe, e reexecutar o seed
-- não a troca. Só um UPDATE alcança o que já está lá.
--
-- Idempotente: rodar duas vezes não faz mal (a segunda não encontra
-- 'escrita' e não altera nada).
-- ═══════════════════════════════════════════════════════════

update public.perfis_permissoes
   set nivel = 'leitura'
 where perfil_chave = 'diretor_tecnico'
   and modulo = 'auditoria'
   and nivel = 'escrita';


-- ═══════════════════════════════════════════════════════════
-- CONFERÊNCIA — rode junto. Esperado: uma linha, nivel = leitura.
-- ═══════════════════════════════════════════════════════════
select perfil_chave, modulo, nivel,
       case when nivel = 'leitura' then '✅ ok' else '❌ ainda escrita' end as situacao
  from public.perfis_permissoes
 where perfil_chave = 'diretor_tecnico' and modulo = 'auditoria';
