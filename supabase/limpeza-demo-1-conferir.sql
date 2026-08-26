-- ═══════════════════════════════════════════════════════════
-- LIMPEZA DO DEMO — PASSO 1 de 2: CONFERIR
--
-- Este arquivo NÃO APAGA NADA. É só leitura. Rode, leia a tabela, e só
-- então rode o passo 2.
--
-- ⚠️ CONFIRA A ABA: o projeto tem de ser ufxqdvxhruaswuzhmxyf
--    (medflow-demo). NÃO é riuvyxppixeclxudsgpv, que é o hospital.
--    A linha "ESTE BANCO É O DEMO?" responde isso sozinha.
-- ═══════════════════════════════════════════════════════════

SELECT * FROM (
  SELECT 0 AS ordem,
         'ESTE BANCO É O DEMO?' AS item,
         CASE WHEN (SELECT count(*) FROM pacientes) >= 40
              THEN 'SIM — ' || (SELECT count(*) FROM pacientes) || ' pacientes no acervo'
              ELSE '🔴 NÃO — só ' || (SELECT count(*) FROM pacientes) ||
                   ' pacientes. Isto parece o PRINCIPAL. NÃO rode o passo 2 aqui.'
         END AS situacao
  UNION ALL
  SELECT 1, 'itens das contas #5 e #6',
         (SELECT count(*) FROM at_conta_itens WHERE conta_id IN (5, 6)) || ' a apagar'
  UNION ALL
  SELECT 2, 'contas #5 e #6',
         (SELECT count(*) FROM at_contas WHERE id IN (5, 6)) || ' a apagar'
  UNION ALL
  SELECT 3, 'atendimentos #269, #270 e #271',
         (SELECT count(*) FROM ps_atendimentos WHERE id IN (269, 270, 271)) || ' a apagar'
  UNION ALL
  SELECT 4, 'prontuário 9069 (duplicata do passeio)',
         (SELECT count(*) FROM pacientes WHERE prontuario = '9069') || ' a apagar'
  UNION ALL
  SELECT 5, 'gêmeos 9064 e 9065',
         (SELECT count(*) FROM pacientes WHERE prontuario IN ('9064', '9065')) || ' a apagar'
  UNION ALL
  SELECT 6, 'agendamentos de 02/09/2026',
         (SELECT count(*) FROM ag_agendamentos WHERE data = '2026-09-02') || ' a apagar'

  -- ── o que PODE IMPEDIR, e é bom saber antes ──────────────
  UNION ALL
  SELECT 10, '⚠️ atendimentos pendurados nos gêmeos',
         (SELECT count(*) FROM ps_atendimentos WHERE prontuario IN ('9064','9065','9069'))::text ||
         ' — se for > 0, a FK vai recusar apagar o paciente. NÃO force: quer dizer que o registro de teste virou dado.'
  UNION ALL
  SELECT 11, '⚠️ agendamentos pendurados nos gêmeos',
         (SELECT count(*) FROM ag_agendamentos WHERE prontuario IN ('9064','9065','9069'))::text || ' — mesma coisa.'
  UNION ALL
  SELECT 12, '⚠️ fichas que apontam para o 9069',
         (SELECT count(*) FROM pacientes WHERE unificado_para = '9069')::text ||
         ' — se for > 0, apagar o 9069 deixaria essas fichas apontando para o vazio.'
) t ORDER BY ordem;
