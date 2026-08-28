-- ═══════════════════════════════════════════════════════════
-- LIMPEZA DO DEMO — PASSO 2 de 2: APAGAR
--
-- 🔴 SÓ RODE DEPOIS DE LER O RESULTADO DO PASSO 1.
--
-- ⚠️ CONFIRA A ABA: ufxqdvxhruaswuzhmxyf (medflow-demo).
--    NÃO é riuvyxppixeclxudsgpv, que é o hospital.
--
-- A TRAVA ESTÁ DENTRO DE CADA COMANDO, não num bloco separado no topo.
-- É a diferença que importa: uma verificação no início só protege se as
-- instruções seguintes rodarem na mesma sessão e na mesma transação — e a
-- primeira versão deste arquivo tropeçou exatamente nisso. Aqui cada
-- DELETE carrega a própria condição, então rodar no banco errado apaga
-- ZERO linha em vez de contar com a memória do editor.
--
-- Não usa BEGIN/ROLLBACK nem tabela temporária, de propósito: foi essa
-- combinação que quebrou antes. Cada comando é uma transação por si.
-- Por isso a ORDEM importa — filho antes de pai. Se um for recusado pela
-- FK, os anteriores já foram; rode o passo 1 de novo para ver onde parou.
--
-- ⚠️ NÃO É FAXINA PERIÓDICA. Banco de teste COM movimento testa mais que
-- banco impecável — dois defeitos sérios de agosto/2026 só apareceram
-- porque o demo tinha estoque, prescrição e paciente em atendimento.
-- ═══════════════════════════════════════════════════════════

-- é o demo? (a condição vai colada em cada comando, abaixo)

-- ── Passeios de agosto/2026 ─────────────────────────────────

-- 1. itens antes das contas
DELETE FROM at_conta_itens
 WHERE conta_id IN (5, 6)
   AND (SELECT count(*) FROM pacientes) >= 40;

-- 2. as contas do passeio da remessa
DELETE FROM at_contas
 WHERE id IN (5, 6)
   AND (SELECT count(*) FROM pacientes) >= 40;

-- 3. os atendimentos abertos e cancelados nos passeios
DELETE FROM ps_atendimentos
 WHERE id IN (269, 270, 271)
   AND (SELECT count(*) FROM pacientes) >= 40;

-- 4. a duplicata criada para andar a unificação
--    Só sai se ninguém apontar para ela — senão as fichas que apontam
--    ficariam olhando para o vazio.
DELETE FROM pacientes
 WHERE prontuario = '9069'
   AND (SELECT count(*) FROM pacientes) >= 40
   AND NOT EXISTS (SELECT 1 FROM pacientes p2 WHERE p2.unificado_para = '9069');

-- 5. os gêmeos do teste de recém-nascido
DELETE FROM pacientes
 WHERE prontuario IN ('9064', '9065')
   AND (SELECT count(*) FROM pacientes) >= 40;

-- 6. os agendamentos de setembro usados no teste de remarcação
DELETE FROM ag_agendamentos
 WHERE data = '2026-09-02'
   AND (SELECT count(*) FROM pacientes) >= 40;

-- ── Passeios de 27–28/08/2026 ───────────────────────────────

-- 20. A CONTA VEM ANTES DO ATENDIMENTO.
--     `at_contas.atendimento_id` aponta para `ps_atendimentos`, e a
--     primeira tentativa desta limpeza apagou o atendimento primeiro:
--       ERROR 23503: violates "at_contas_atendimento_id_fkey"
--       DETAIL: Key (id)=(272) is still referenced from table "at_contas".
--     O engano de fundo foi tratar "a conta de teste" e "a chegada de
--     teste" como duas coisas — é a mesma.
DELETE FROM at_conta_itens
 WHERE conta_id IN (SELECT id FROM at_contas WHERE atendimento_id = 272)
   AND (SELECT count(*) FROM pacientes) >= 40;

DELETE FROM at_contas
 WHERE atendimento_id = 272
   AND (SELECT count(*) FROM pacientes) >= 40;

-- 21. o pedido de leito gerado pela internação de teste (aponta para #246)
DELETE FROM solicitacoes
 WHERE ps_atendimento_id = 246
   AND (SELECT count(*) FROM pacientes) >= 40;

-- 22. a chegada que nunca foi triada (C.L.B., 26/08)
DELETE FROM ps_atendimentos
 WHERE id = 272
   AND (SELECT count(*) FROM pacientes) >= 40;

-- 23. REVERTER, não apagar: os três que finalizei nos testes voltam a
--     "em_atendimento". Apagá-los encolheria a população do seed, e o
--     seed existe para o sistema ser testado com movimento real.
--
--     ⚠️ O #75 MANTÉM `convenio_id` e `cid`: já estavam lá antes dos
--     testes — foi o que o `valoresIniciais` provou ao impedir que o
--     UPDATE do desfecho os apagasse. Limpar aqui desfaria a prova.
UPDATE ps_atendimentos
   SET status = 'em_atendimento', desfecho = NULL, desfecho_em = NULL,
       setor_destino = NULL, medico = NULL, observacao = NULL,
       procedimento_cod = NULL
 WHERE id = 75
   AND (SELECT count(*) FROM pacientes) >= 40;

--     Os #246 e #251 tinham convênio e procedimento VAZIOS antes (a tela
--     acusou "2 pendências" nos dois), então voltam a vazio.
UPDATE ps_atendimentos
   SET status = 'em_atendimento', desfecho = NULL, desfecho_em = NULL,
       setor_destino = NULL, medico = NULL, observacao = NULL,
       convenio_id = NULL, procedimento_cod = NULL, cid = NULL
 WHERE id IN (246, 251)
   AND (SELECT count(*) FROM pacientes) >= 40;

-- 24. 🔴 o código de procedimento INVENTADO para testar a tela do desfecho.
--     Num catálogo, um código falso ao lado dos reais é o que alguém usa
--     sem desconfiar — e a conta volta rejeitada meses depois.
DELETE FROM at_procedimentos
 WHERE codigo = 'PS-URG-01'
   AND (SELECT count(*) FROM pacientes) >= 40;

-- 25. a cirurgia de teste (as SALAS ficam — são cadastro)
DELETE FROM cc_cirurgias
 WHERE prontuario = 'T9002' AND data = '2026-08-27'
   AND (SELECT count(*) FROM pacientes) >= 40;

-- 26. a cotação e os pedidos que ela gerou (os FORNECEDORES ficam)
DELETE FROM sup_pedidos
 WHERE observacao = 'Da cotação #1'
   AND (SELECT count(*) FROM pacientes) >= 40;

DELETE FROM sup_cotacoes
 WHERE descricao = 'Compra mensal de EPI e material'
   AND (SELECT count(*) FROM pacientes) >= 40;

-- 27. FARMÁCIA: as três tabelas juntas, e é obrigatório que seja assim.
--
--     🔴 `farm_lotes.quantidade` é MANTIDO (o trigger soma/subtrai a cada
--     movimento); `farm_movimentos` é o histórico paralelo. Apagar
--     movimento sem acertar o saldo faria as duas fontes discordarem, e a
--     Conciliação kardex × saldo passaria a acusar rombo — seria fabricar
--     exatamente o defeito que o sistema existe para detectar.
--
--     Todo o conteúdo das três é de teste, então voltam a zero juntas.
--     Estoque se recria pela tela: Farmácia › Estoque › Entrada.
DELETE FROM farm_inventarios
 WHERE (SELECT count(*) FROM pacientes) >= 40;

--     ⚠️ `estorno_de` é ON DELETE RESTRICT, e RESTRICT confere NA HORA —
--     não no fim do comando. Um DELETE único falharia na primeira linha
--     que tem estorno apontando para ela, mesmo que o estorno esteja sendo
--     apagado junto. E os estornos encadeiam (um estorno de estorno é
--     legítimo), então nem uma ordem fixa resolveria. O laço apaga sempre
--     as FOLHAS — as que ninguém referencia — até não sobrar nada.
DO $$
BEGIN
  IF (SELECT count(*) FROM pacientes) < 40 THEN
    RAISE NOTICE 'Nao e o demo: farm_movimentos intacto.';
    RETURN;
  END IF;
  LOOP
    DELETE FROM farm_movimentos m
     WHERE NOT EXISTS (SELECT 1 FROM farm_movimentos e WHERE e.estorno_de = m.id);
    EXIT WHEN NOT FOUND;
  END LOOP;
END $$;

DELETE FROM farm_lotes
 WHERE (SELECT count(*) FROM pacientes) >= 40;

-- 28. as aferições de sinais feitas fora do seed
DELETE FROM pep_sinais_vitais
 WHERE usuario <> 'seed-teste'
   AND (SELECT count(*) FROM pacientes) >= 40;

-- ── RECIBO: tudo tem de estar ZERADO ────────────────────────
SELECT
  (SELECT count(*) FROM at_conta_itens  WHERE conta_id IN (5, 6))            AS itens_restantes,
  (SELECT count(*) FROM at_contas       WHERE id IN (5, 6))                  AS contas_restantes,
  (SELECT count(*) FROM ps_atendimentos WHERE id IN (269, 270, 271, 272))    AS atendimentos_restantes,
  (SELECT count(*) FROM ps_atendimentos WHERE id IN (75,246,251)
                                          AND status = 'finalizado')         AS finalizados_restantes,
  (SELECT count(*) FROM at_procedimentos WHERE codigo = 'PS-URG-01')         AS codigo_falso_restante,
  (SELECT count(*) FROM pacientes       WHERE prontuario = '9069')           AS duplicata_restante,
  (SELECT count(*) FROM pacientes       WHERE prontuario IN ('9064','9065')) AS gemeos_restantes,
  (SELECT count(*) FROM ag_agendamentos WHERE data = '2026-09-02')           AS agendamentos_restantes,
  (SELECT count(*) FROM farm_movimentos)                                     AS movimentos_restantes,
  (SELECT count(*) FROM farm_lotes)                                          AS lotes_restantes,
  -- ── e o que TEM de continuar de pé ──
  (SELECT count(*) FROM cc_salas)                                            AS salas_ficam,
  (SELECT count(*) FROM sup_fornecedores WHERE ativo)                        AS fornecedores_ficam,
  (SELECT count(*) FROM scih_germes)                                         AS germes_ficam,
  (SELECT count(*) FROM pacientes)                                           AS pacientes_no_acervo;

-- ── O QUE NÃO É APAGADO, de propósito ───────────────────────
-- O endereço do T9020 (Avenida Paulista) fica. Apagar endereço de
-- cadastro para consertar sujeira de teste é remédio pior que a doença —
-- e quem for testar CEP de novo precisa justamente de um cadastro com
-- endereço. Se incomodar, corrija pela TELA, onde fica com autor.
--
-- A `auditoria` fica INTEIRA. Apagar trilha para "limpar" é o instinto
-- errado: é justamente o registro que explica por que os números mudaram.
--
-- `cc_salas`, `sup_fornecedores` e `scih_germes` ficam. São CONFIGURAÇÃO,
-- não lixo: sem eles o Bloco Cirúrgico, o Estoque & Compras e o SCIH
-- voltam a abrir vazios, e o checklist de implantação volta a 1/4.
