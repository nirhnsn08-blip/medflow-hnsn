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
-- CONFERÊNCIA — rode o arquivo INTEIRO (Run), não um trecho.
--
-- A 1ª linha diz QUAL BANCO é este (o arquivo antes não dizia, e rodar no
-- banco errado passou batido). As 7 seguintes têm que sair TODAS "✅ escrita"
-- — se aparecer "❌ ficou de fora", o INSERT acima não rodou (rode tudo).
-- ═══════════════════════════════════════════════════════════
select item, resultado from (
  select 0 as ord, '🔎 BANCO' as item,
         case when (select count(*) from public.pacientes) >= 40
              then '🟠 DEMO (banco de teste) — pode rodar aqui'
              else '🔴 PRINCIPAL (HNSN) — produção' end as resultado
  union all
  select 1, 'perfil ' || pa.chave,
         case when pp.nivel is null then '❌ ficou de fora' else '✅ ' || pp.nivel end
    from public.perfis_acesso pa
    left join public.perfis_permissoes pp
      on pp.perfil_chave = pa.chave and pp.modulo = 'maternidade'
   where pa.chave in ('medico','enfermeiro','tecnico_enfermagem','diretor_tecnico',
                      'gestao','ti','provisorio')
) t order by ord, item;


insert into public.migracoes_aplicadas (arquivo)
values ('migracao-perfis-maternidade.sql') on conflict do nothing;
