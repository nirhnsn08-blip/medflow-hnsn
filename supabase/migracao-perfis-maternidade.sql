-- ═══════════════════════════════════════════════════════════
-- MATERNIDADE ENTRA NOS PERFIS — a porta do módulo no menu
--
-- O QUE RESOLVE
-- O módulo `maternidade` nasce agora e não está em perfil nenhum. Como o app
-- monta o menu a partir de `perfis_permissoes` (do BANCO, não do código),
-- sem estas linhas a Maternidade fica invisível — inclusive para o ADM Master.
-- Foi o susto do NSP (ver migracao-perfis-nsp.sql): módulo novo sem grant é um
-- item que some do menu de todo mundo.
--
-- QUEM RECEBE (confirmado com a Laura)
--   • Assistência obstétrica (escrita): médico (obstetra/neonatologista),
--     enfermeiro, técnico de enfermagem, diretor técnico.
--   • Gestão (leitura): acompanha o indicador, não lança.
--   • TI e Provisório: senão o módulo some do menu de todo mundo — o
--     Provisório segura a equipe inteira hoje.
-- Quem não trabalha na maternidade não recebe: se precisar, é exceção
-- individual (`usuarios_permissoes`), com motivo, não perfil novo.
--
-- OS DADOS JÁ ESTÃO LIBERADOS. As tabelas `mat_*` (Fase 0) leem/escrevem pelo
-- módulo `paciente`, que a equipe clínica já tem — então esta migração NÃO
-- toca em RLS de tabela: só abre a porta do menu.
--
-- Aditiva e idempotente: `on conflict do nothing`. Pode rodar duas vezes.
-- Não altera quem já tem o módulo por exceção individual.
-- ⚠️ RODAR NO DEMO PRIMEIRO, depois no HNSN.
-- ═══════════════════════════════════════════════════════════

insert into public.perfis_permissoes (perfil_chave, modulo, nivel) values
  -- Assistência obstétrica (escrita)
  ('medico',             'maternidade', 'escrita'),
  ('enfermeiro',         'maternidade', 'escrita'),
  ('tecnico_enfermagem', 'maternidade', 'escrita'),
  ('diretor_tecnico',    'maternidade', 'escrita'),
  -- Acompanha o indicador (leitura)
  ('gestao',             'maternidade', 'leitura'),
  -- Sistema: sem estas duas, o módulo some do menu até do administrador
  ('ti',                 'maternidade', 'escrita'),
  ('provisorio',         'maternidade', 'escrita')
on conflict (perfil_chave, modulo) do nothing;


-- ═══════════════════════════════════════════════════════════
-- CONFERÊNCIA — rode junto. Esperado: 7 linhas, "situacao" toda ✅.
-- ═══════════════════════════════════════════════════════════
select pa.chave as perfil,
       pa.nome,
       coalesce(pp.nivel, '(sem acesso)') as maternidade,
       case when pp.nivel is null then '❌ ficou de fora' else '✅ ok' end as situacao,
       (select count(*) from public.profiles pr where pr.perfil = pa.chave) as pessoas
  from public.perfis_acesso pa
  left join public.perfis_permissoes pp
    on pp.perfil_chave = pa.chave and pp.modulo = 'maternidade'
 where pa.chave in ('medico','enfermeiro','tecnico_enfermagem','diretor_tecnico',
                    'gestao','ti','provisorio')
 order by situacao desc, pa.chave;


insert into public.migracoes_aplicadas (arquivo)
values ('migracao-perfis-maternidade.sql') on conflict do nothing;
