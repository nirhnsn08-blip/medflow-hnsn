-- ============================================================
-- Valentrax — CONFERÊNCIA DE PERFIS (SOMENTE LEITURA — não altera nada)
-- Rode o script INTEIRO no Supabase → SQL Editor.
--
-- ⚠️ ARQUIVO GERADO — não edite à mão.
--    Regenere com:  node supabase/gerar-conferencia-perfis.mjs
--
-- Compara a matriz de permissões do BANCO com o catálogo do CÓDIGO
-- (`src/acesso/modulos.js` + o perfil provisório da migração).
--
-- O QUE ELE PEGA, E QUE NADA MAIS PEGAVA
-- O seed usa `on conflict do nothing` — certo, para não desfazer ajuste do
-- hospital. O efeito colateral é que **grant acrescentado ao seed depois
-- nunca chega a um banco que já rodou a migração**. Aconteceu com o módulo
-- NSP: o arquivo declarava `ti` e `provisorio` com NSP havia semanas, os
-- dois bancos não tinham nenhuma das linhas, e o teste automatizado não via
-- — porque ele compara o código com o ARQUIVO, nunca com o BANCO.
--
-- COMO LER
--   ❌ FALTA NO BANCO  → o código concede e o banco não. Quem está nesse
--                        perfil não enxerga o módulo — e, com o RLS de
--                        leitura fechado, também não lê os dados dele.
--   ⚠️ NIVEL DIFERENTE → o banco tem, mas com outro nível.
--   ⚠️ SÓ NO BANCO     → ajuste feito à mão no hospital. Pode ser legítimo;
--                        só não pode ser surpresa.
--
-- Resultado ideal: nenhuma linha ❌ e nenhuma ⚠️ inesperada.
-- Cobertura: 154 grants em 18 perfis.
-- ============================================================

with esperado(perfil, modulo, nivel) as (values
  ('almoxarifado','suprimentos','escrita'),
  ('assistente_social','ambulatorio','leitura'),
  ('assistente_social','leitos','leitura'),
  ('assistente_social','nsp','escrita'),
  ('assistente_social','overview','leitura'),
  ('assistente_social','paciente','escrita'),
  ('aux_farmacia','controlados','leitura'),
  ('aux_farmacia','farmacia','escrita'),
  ('aux_farmacia','nsp','escrita'),
  ('aux_farmacia','suprimentos','leitura'),
  ('diretor_tecnico','ambulatorio','leitura'),
  ('diretor_tecnico','atendimento','leitura'),
  ('diretor_tecnico','auditoria','escrita'),
  ('diretor_tecnico','bloco','leitura'),
  ('diretor_tecnico','controlados','leitura'),
  ('diretor_tecnico','farmacia','leitura'),
  ('diretor_tecnico','leitos','leitura'),
  ('diretor_tecnico','nsp','escrita'),
  ('diretor_tecnico','overview','leitura'),
  ('diretor_tecnico','paciente','escrita'),
  ('diretor_tecnico','print','leitura'),
  ('diretor_tecnico','protocolos','escrita'),
  ('diretor_tecnico','ps','escrita'),
  ('diretor_tecnico','scih','leitura'),
  ('diretor_tecnico','suprimentos','leitura'),
  ('enfermeiro_scih','bloco','leitura'),
  ('enfermeiro_scih','farmacia','leitura'),
  ('enfermeiro_scih','leitos','leitura'),
  ('enfermeiro_scih','nsp','escrita'),
  ('enfermeiro_scih','overview','leitura'),
  ('enfermeiro_scih','paciente','escrita'),
  ('enfermeiro_scih','print','leitura'),
  ('enfermeiro_scih','ps','leitura'),
  ('enfermeiro_scih','scih','escrita'),
  ('enfermeiro','ambulatorio','escrita'),
  ('enfermeiro','atendimento','escrita'),
  ('enfermeiro','bloco','leitura'),
  ('enfermeiro','farmacia','leitura'),
  ('enfermeiro','leitos','escrita'),
  ('enfermeiro','nsp','escrita'),
  ('enfermeiro','overview','leitura'),
  ('enfermeiro','paciente','escrita'),
  ('enfermeiro','print','leitura'),
  ('enfermeiro','protocolos','escrita'),
  ('enfermeiro','ps','escrita'),
  ('enfermeiro','scih','escrita'),
  ('enfermeiro','suprimentos','leitura'),
  ('farmaceutico','controlados','escrita'),
  ('farmaceutico','farmacia','escrita'),
  ('farmaceutico','leitos','leitura'),
  ('farmaceutico','nsp','escrita'),
  ('farmaceutico','overview','leitura'),
  ('farmaceutico','paciente','leitura'),
  ('farmaceutico','print','leitura'),
  ('farmaceutico','ps','leitura'),
  ('farmaceutico','scih','leitura'),
  ('farmaceutico','suprimentos','leitura'),
  ('faturamento','ambulatorio','leitura'),
  ('faturamento','atendimento','leitura'),
  ('faturamento','leitos','leitura'),
  ('faturamento','overview','leitura'),
  ('faturamento','print','leitura'),
  ('fisioterapeuta','leitos','leitura'),
  ('fisioterapeuta','nsp','escrita'),
  ('fisioterapeuta','overview','leitura'),
  ('fisioterapeuta','paciente','escrita'),
  ('fisioterapeuta','ps','leitura'),
  ('gestao','ambulatorio','leitura'),
  ('gestao','atendimento','leitura'),
  ('gestao','auditoria','leitura'),
  ('gestao','bloco','leitura'),
  ('gestao','farmacia','leitura'),
  ('gestao','leitos','leitura'),
  ('gestao','nsp','leitura'),
  ('gestao','overview','leitura'),
  ('gestao','print','leitura'),
  ('gestao','protocolos','leitura'),
  ('gestao','ps','leitura'),
  ('gestao','scih','leitura'),
  ('gestao','suprimentos','leitura'),
  ('matriz','overview','leitura'),
  ('matriz','suprimentos','leitura'),
  ('medico','ambulatorio','escrita'),
  ('medico','atendimento','leitura'),
  ('medico','bloco','escrita'),
  ('medico','farmacia','leitura'),
  ('medico','leitos','escrita'),
  ('medico','nsp','escrita'),
  ('medico','overview','leitura'),
  ('medico','paciente','escrita'),
  ('medico','print','leitura'),
  ('medico','protocolos','escrita'),
  ('medico','ps','escrita'),
  ('medico','scih','leitura'),
  ('nir','bloco','leitura'),
  ('nir','leitos','escrita'),
  ('nir','nsp','escrita'),
  ('nir','overview','leitura'),
  ('nir','print','leitura'),
  ('nir','ps','leitura'),
  ('nutricionista','leitos','leitura'),
  ('nutricionista','nsp','escrita'),
  ('nutricionista','overview','leitura'),
  ('nutricionista','paciente','escrita'),
  ('provisorio','ambulatorio','escrita'),
  ('provisorio','atendimento','escrita'),
  ('provisorio','auditoria','escrita'),
  ('provisorio','bloco','escrita'),
  ('provisorio','controlados','escrita'),
  ('provisorio','farmacia','escrita'),
  ('provisorio','import','escrita'),
  ('provisorio','leitos','escrita'),
  ('provisorio','nsp','escrita'),
  ('provisorio','overview','escrita'),
  ('provisorio','paciente','escrita'),
  ('provisorio','print','escrita'),
  ('provisorio','protocolos','escrita'),
  ('provisorio','ps','escrita'),
  ('provisorio','scih','escrita'),
  ('provisorio','supabase','escrita'),
  ('provisorio','suprimentos','escrita'),
  ('recepcao','ambulatorio','escrita'),
  ('recepcao','atendimento','escrita'),
  ('recepcao','leitos','leitura'),
  ('recepcao','nsp','escrita'),
  ('recepcao','overview','leitura'),
  ('recepcao','ps','escrita'),
  ('tecnico_enfermagem','ambulatorio','leitura'),
  ('tecnico_enfermagem','atendimento','leitura'),
  ('tecnico_enfermagem','leitos','escrita'),
  ('tecnico_enfermagem','nsp','escrita'),
  ('tecnico_enfermagem','overview','leitura'),
  ('tecnico_enfermagem','paciente','escrita'),
  ('tecnico_enfermagem','protocolos','escrita'),
  ('tecnico_enfermagem','ps','escrita'),
  ('tecnico_enfermagem','scih','leitura'),
  ('ti','ambulatorio','escrita'),
  ('ti','atendimento','escrita'),
  ('ti','auditoria','escrita'),
  ('ti','bloco','escrita'),
  ('ti','controlados','escrita'),
  ('ti','farmacia','escrita'),
  ('ti','import','escrita'),
  ('ti','leitos','escrita'),
  ('ti','nsp','escrita'),
  ('ti','overview','escrita'),
  ('ti','paciente','escrita'),
  ('ti','print','escrita'),
  ('ti','protocolos','escrita'),
  ('ti','ps','escrita'),
  ('ti','scih','escrita'),
  ('ti','supabase','escrita'),
  ('ti','suprimentos','escrita'),
  ('ti','users','escrita')
),
real as (
  select perfil_chave as perfil, modulo, nivel from public.perfis_permissoes
),
tudo as (
  select 0 as ord, '❌ FALTA NO BANCO' as situacao, e.perfil, e.modulo,
         'código concede ' || e.nivel as detalhe
    from esperado e
    left join real r on r.perfil = e.perfil and r.modulo = e.modulo
   where r.modulo is null

  union all
  select 1, '⚠️ NIVEL DIFERENTE', e.perfil, e.modulo,
         'banco=' || r.nivel || ' · codigo=' || e.nivel
    from esperado e
    join real r on r.perfil = e.perfil and r.modulo = e.modulo
   where r.nivel <> e.nivel

  union all
  select 2, '⚠️ SO NO BANCO', r.perfil, r.modulo,
         'banco concede ' || r.nivel
    from real r
    left join esperado e on e.perfil = r.perfil and e.modulo = r.modulo
   where e.modulo is null

  union all
  select 3, '✅ ok', e.perfil, e.modulo, e.nivel
    from esperado e
    join real r on r.perfil = e.perfil and r.modulo = e.modulo
   where r.nivel = e.nivel
)
select situacao, perfil, modulo, detalhe,
       (select count(*) from public.profiles pr where pr.perfil = tudo.perfil) as pessoas_no_perfil
  from tudo
 order by ord, perfil, modulo;
