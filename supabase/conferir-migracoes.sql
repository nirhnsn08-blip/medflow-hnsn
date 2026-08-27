-- ═══════════════════════════════════════════════════════════
-- O QUE JÁ RODOU NESTE BANCO — pergunte, não lembre
--
-- Rode em QUALQUER um dos dois bancos. Ele diz, migração por migração,
-- se já foi aplicada aqui — lendo o próprio esquema, não uma lista que
-- alguém manteve à mão.
--
-- POR QUE ISTO EXISTE
-- As migrações rodam manualmente, uma de cada vez, em dois bancos
-- diferentes, às vezes com dias de intervalo. A lista de "o que falta"
-- vivia no meio da conversa, e isso é exatamente o tipo de coisa que se
-- perde. Já aconteceu de o código estar publicado com a migração NÃO
-- rodada no hospital (a `faturamento-remessa`, descoberta por sonda) e de
-- o banco de teste estar ATRÁS da produção (a `nsp-protocolos`).
--
-- ⚠️ CADA LINHA PERGUNTA AO ESQUEMA, não a um registro de execução. É a
-- mesma escolha do `auditoria-banco.sql`: lista mantida à mão fica cega
-- justamente no item mais novo, que é o menos testado.
--
-- COMO LER: `falta` na coluna situacao = rode o arquivo indicado.
-- ═══════════════════════════════════════════════════════════

WITH checagens(ordem, migracao, o_que_faz, aplicada) AS (VALUES

  (1, 'migracao-pacientes-nacionalidade-etnia',
      'estrangeiro, passaporte e etnia indígena no cadastro',
      EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name='pacientes' AND column_name='pais_nascimento')),

  (2, 'migracao-agenda-remarcacao',
      'remarcação com vínculo à consulta original',
      EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name='ag_agendamentos' AND column_name='remarcado_de')),

  (3, 'migracao-pacientes-obito',
      'óbito carimbado no cadastro por gatilho',
      EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name='pacientes' AND column_name='obito_origem')),

  (4, 'migracao-pacientes-recem-nascido',
      'DNV, hora e ordem de nascimento; separa gêmeos',
      EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name='pacientes' AND column_name='dnv')),

  (5, 'migracao-pacientes-municipio-ibge',
      'código IBGE do município, exigido pela AIH e pelo BPA',
      EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name='pacientes' AND column_name='end_municipio_ibge')),

  (6, 'migracao-faturamento-remessa',
      'transmissão da remessa: faturada_em, por quem, protocolo',
      EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name='at_contas' AND column_name='remessa_protocolo')),

  (7, 'migracao-pacientes-unificacao',
      'unificação de prontuário (o ponteiro entre duas fichas)',
      EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name='pacientes' AND column_name='unificado_para')),

  (8, 'migracao-farmacia-preparo-exige-baixa',
      'prescrição só fica "pronta" se saiu do estoque',
      EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='farm_preparo_exige_baixa')),

  (9, 'migracao-farmacia-lote-vencido',
      'lote vencido não vai para paciente (mas sai por descarte)',
      EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='farm_movimentos_vencido_nao_dispensa')),

  -- ⚠️ ESTA É A ÚNICA QUE NÃO DÁ PARA CONFERIR PELO ESQUEMA, e por isso é
  -- a única que já mentiu. Migração de DADO não deixa marca na estrutura.
  --
  -- A pergunta "existe leito ocupado sem episódio?" responde `não` de dois
  -- jeitos MUITO diferentes: porque a migração rodou, ou porque não há
  -- leito ocupado nenhum. Num hospital com poucos internados, a segunda
  -- resposta virava um `ok` falso.
  --
  -- Agora ela distingue os três estados, usando o rastro que a própria
  -- migração deixa (`usuario = 'migracao-retroativa'`).
  (10, 'migracao-pep-episodio-retroativo',
      'abre o episódio de quem JÁ está internado',
      NULL::boolean),   -- avaliada à parte, abaixo

  (11, 'migracao-episodio-id-tipo',
      'episodio_id das tabelas de enfermagem: uuid -> bigint',
      NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE column_name='episodio_id' AND data_type='uuid'
                     AND table_name IN ('enf_escalas','enf_lesao_pressao','enf_sae_historico',
                                        'enf_sae_diagnosticos','enf_sae_prescricoes',
                                        'enf_sae_prescricao_itens','enf_sae_checagem','nsp_incidentes'))),

  (12, 'migracao-nsp-protocolos',
      'protocolos do Núcleo de Segurança do Paciente',
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='nsp_protocolos'))
)
SELECT
  ordem,
  migracao || '.sql' AS arquivo,
  o_que_faz,
  CASE
    -- a de dado (10) tem três respostas, não duas
    WHEN aplicada IS NULL THEN
      CASE
        WHEN EXISTS (SELECT 1 FROM public.pep_episodios WHERE usuario = 'migracao-retroativa')
          THEN 'ok'
        WHEN NOT EXISTS (SELECT 1 FROM public.leitos
                          WHERE status = 'ocupado' AND coalesce(trim(prontuario), '') <> '')
          THEN 'nada a fazer — nenhum leito ocupado com prontuário'
        ELSE '>>> FALTA — rode este'
      END
    WHEN aplicada THEN 'ok'
    ELSE '>>> FALTA — rode este'
  END AS situacao
FROM checagens
-- '>>>' vem antes de 'n' e de 'o' na ordenação: o que falta aparece no topo.
ORDER BY situacao, ordem;

-- ── QUAL BANCO É ESTE? ──────────────────────────────────────
-- As duas abas do SQL Editor são idênticas; a única diferença visível é
-- uma string na barra de endereço. Esta linha responde sem depender disso.
SELECT
  CASE WHEN (SELECT count(*) FROM public.pacientes) >= 40
       THEN 'DEMO (banco de teste)' ELSE 'PRINCIPAL (hospital)' END AS banco,
  (SELECT count(*) FROM public.pacientes) AS pacientes,
  (SELECT count(*) FROM public.leitos WHERE status='ocupado') AS leitos_ocupados,
  (SELECT count(*) FROM public.pep_episodios WHERE status='aberto') AS internacoes_abertas;
