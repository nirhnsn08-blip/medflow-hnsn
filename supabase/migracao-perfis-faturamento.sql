-- ═══════════════════════════════════════════════════════════
-- GRANTS DO MÓDULO FATURAMENTO — migração avulsa (Tier 1 — Fase 4)
--
-- O módulo 'faturamento' é novo. Os bancos que JÁ rodaram
-- migracao-perfis-acesso.sql não recebem os grants novos só por eles
-- passarem a existir no arquivo — e re-rodar o seed inteiro recriaria as
-- políticas `for all` que o migracao-rls-leitura.sql desarma. Então os
-- grants novos entram por aqui, exatamente como o migracao-perfis-nsp.sql
-- fez para o NSP.
--
-- Dá o módulo ao perfil Faturamento (escrita), ao TI (escrita) e ao
-- Provisório (escrita) — este último é o que segura a equipe hoje, então
-- sem ele ninguém enxergaria o módulo até ser reclassificado.
--
-- Idempotente (on conflict do nothing). Rodar no SQL Editor — DEMO, depois HNSN.
-- ═══════════════════════════════════════════════════════════
insert into public.perfis_permissoes (perfil_chave, modulo, nivel) values
  ('faturamento','faturamento','escrita'),
  ('ti','faturamento','escrita'),
  ('provisorio','faturamento','escrita')
on conflict (perfil_chave, modulo) do nothing;

-- Verificação
select 'FATURAMENTO: grants do módulo aplicados — '
       || (select count(*) from public.perfis_permissoes where modulo = 'faturamento')
       || ' perfil(is)' as resultado;
