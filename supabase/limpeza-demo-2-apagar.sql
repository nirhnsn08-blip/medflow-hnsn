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
-- ═══════════════════════════════════════════════════════════

-- é o demo? (a condição vai colada em cada DELETE, abaixo)

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

-- ── RECIBO: tudo tem de estar ZERADO ────────────────────────
SELECT
  (SELECT count(*) FROM at_conta_itens  WHERE conta_id IN (5, 6))            AS itens_restantes,
  (SELECT count(*) FROM at_contas       WHERE id IN (5, 6))                  AS contas_restantes,
  (SELECT count(*) FROM ps_atendimentos WHERE id IN (269, 270, 271))         AS atendimentos_restantes,
  (SELECT count(*) FROM pacientes       WHERE prontuario = '9069')           AS duplicata_restante,
  (SELECT count(*) FROM pacientes       WHERE prontuario IN ('9064','9065')) AS gemeos_restantes,
  (SELECT count(*) FROM ag_agendamentos WHERE data = '2026-09-02')           AS agendamentos_restantes,
  (SELECT count(*) FROM pacientes)                                           AS pacientes_no_acervo;

-- ── O QUE NÃO É APAGADO, de propósito ───────────────────────
-- O endereço do T9020 (Avenida Paulista) fica. Apagar endereço de
-- cadastro para consertar sujeira de teste é remédio pior que a doença —
-- e quem for testar CEP de novo precisa justamente de um cadastro com
-- endereço. Se incomodar, corrija pela TELA, onde fica com autor.
