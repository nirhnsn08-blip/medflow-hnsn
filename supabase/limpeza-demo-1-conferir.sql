-- ═══════════════════════════════════════════════════════════
-- LIMPEZA DO DEMO — PASSO 1 de 2: CONFERIR
--
-- Este arquivo NÃO APAGA NADA. É só leitura. Rode, leia a tabela, e só
-- então rode o passo 2.
--
-- ⚠️ CONFIRA A ABA: o projeto tem de ser ufxqdvxhruaswuzhmxyf
--    (medflow-demo). NÃO é riuvyxppixeclxudsgpv, que é o hospital.
--    A linha "ESTE BANCO É O DEMO?" responde isso sozinha.
--
-- ⚠️ NÃO É FAXINA PERIÓDICA. Banco de teste COM movimento testa mais que
-- banco impecável: foi por haver estoque, prescrição e paciente em
-- atendimento que apareceram o `loteEfetivo` (que estava quebrado em
-- produção) e o acento que calava a sugestão de isolamento do SCIH. Só
-- limpe quando o acúmulo atrapalhar a leitura de algum número.
-- ═══════════════════════════════════════════════════════════

SELECT * FROM (
  SELECT 0 AS ordem,
         'ESTE BANCO É O DEMO?' AS item,
         CASE WHEN (SELECT count(*) FROM pacientes) >= 40
              THEN 'SIM — ' || (SELECT count(*) FROM pacientes) || ' pacientes no acervo'
              ELSE '🔴 NÃO — só ' || (SELECT count(*) FROM pacientes) ||
                   ' pacientes. Isto parece o PRINCIPAL. NÃO rode o passo 2 aqui.'
         END AS situacao

  -- ── Passeios de agosto/2026 (recepção, remessa, unificação) ──
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

  -- ── Passeios de 27–28/08/2026 (PS→faturamento, farmácia, bloco, compras) ──
  UNION ALL
  SELECT 20, 'conta e itens do atendimento #272',
         (SELECT count(*) FROM at_contas WHERE atendimento_id = 272) ||
         ' conta(s) — sai ANTES do atendimento, senão a FK recusa'
  UNION ALL
  SELECT 21, 'atendimento #272 (chegada nunca triada)',
         (SELECT count(*) FROM ps_atendimentos WHERE id = 272) || ' a apagar'
  UNION ALL
  SELECT 22, 'atendimentos #75, #246 e #251 finalizados nos testes',
         (SELECT count(*) FROM ps_atendimentos WHERE id IN (75,246,251) AND status = 'finalizado') ||
         ' — VOLTAM a em_atendimento, não são apagados (apagar encolheria o seed)'
  UNION ALL
  SELECT 23, '🔴 procedimento PS-URG-01 (código INVENTADO num teste)',
         (SELECT count(*) FROM at_procedimentos WHERE codigo = 'PS-URG-01') ||
         ' — o item mais perigoso: código falso ao lado dos reais é o que alguém usa sem desconfiar'
  UNION ALL
  SELECT 24, 'pedido de leito gerado pela internação de teste',
         (SELECT count(*) FROM solicitacoes WHERE ps_atendimento_id = 246) || ' a apagar'
  UNION ALL
  SELECT 25, 'cirurgia de teste (T9002, 27/08)',
         (SELECT count(*) FROM cc_cirurgias WHERE prontuario = 'T9002' AND data = '2026-08-27') || ' a apagar'
  UNION ALL
  SELECT 26, 'cotação de teste e os pedidos que ela gerou',
         (SELECT count(*) FROM sup_cotacoes WHERE descricao = 'Compra mensal de EPI e material') || ' cotação + ' ||
         (SELECT count(*) FROM sup_pedidos WHERE observacao = 'Da cotação #1') || ' pedido(s)'
  UNION ALL
  SELECT 27, 'farmácia: movimentos / lotes / contagens',
         (SELECT count(*) FROM farm_movimentos) || ' / ' ||
         (SELECT count(*) FROM farm_lotes) || ' / ' ||
         (SELECT count(*) FROM farm_inventarios) ||
         ' — as TRÊS saem juntas ou nenhuma (ver o porquê no passo 2)'
  UNION ALL
  SELECT 28, 'aferições de sinais fora do seed',
         (SELECT count(*) FROM pep_sinais_vitais WHERE usuario <> 'seed-teste') || ' a apagar'

  -- ── o que PODE IMPEDIR, e é bom saber antes ──────────────
  UNION ALL
  SELECT 40, '⚠️ atendimentos pendurados nos gêmeos',
         (SELECT count(*) FROM ps_atendimentos WHERE prontuario IN ('9064','9065','9069'))::text ||
         ' — se for > 0, a FK vai recusar apagar o paciente. NÃO force: quer dizer que o registro de teste virou dado.'
  UNION ALL
  SELECT 41, '⚠️ agendamentos pendurados nos gêmeos',
         (SELECT count(*) FROM ag_agendamentos WHERE prontuario IN ('9064','9065','9069'))::text || ' — mesma coisa.'
  UNION ALL
  SELECT 42, '⚠️ fichas que apontam para o 9069',
         (SELECT count(*) FROM pacientes WHERE unificado_para = '9069')::text ||
         ' — se for > 0, apagar o 9069 deixaria essas fichas apontando para o vazio.'
  UNION ALL
  SELECT 43, '⚠️ estornos encadeados na farmácia',
         (SELECT count(*) FROM farm_movimentos WHERE estorno_de IS NOT NULL)::text ||
         ' — `estorno_de` é ON DELETE RESTRICT e confere NA HORA; o passo 2 apaga as folhas em laço por causa disso.'

  -- ── o que NÃO é tocado, de propósito ─────────────────────
  UNION ALL
  SELECT 50, 'ℹ️ cadastros que ficam',
         (SELECT count(*) FROM cc_salas) || ' salas · ' ||
         (SELECT count(*) FROM sup_fornecedores WHERE ativo) || ' fornecedores · ' ||
         (SELECT count(*) FROM scih_germes) || ' germes — são CONFIGURAÇÃO; sem eles três módulos voltam a abrir vazios'
) t ORDER BY ordem;
