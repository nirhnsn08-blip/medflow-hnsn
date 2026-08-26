-- ═══════════════════════════════════════════════════════════
-- LIMPEZA DOS DADOS DE TESTE — SOMENTE NO BANCO DEMO
--
-- 🔴 LEIA ISTO ANTES DE APERTAR RUN.
--
-- Este é o ÚNICO arquivo deste projeto que APAGA. Todo o resto é aditivo,
-- e por um motivo: num sistema hospitalar, dado apagado por engano não tem
-- volta e ninguém descobre pelo sintoma — descobre pela ausência, meses
-- depois, quando alguém procura o que não está mais lá.
--
-- ⚠️ CONFIRA A ABA DO NAVEGADOR: o projeto tem de ser
--    ufxqdvxhruaswuzhmxyf (medflow-demo).
--    NÃO É riuvyxppixeclxudsgpv — aquele é o hospital.
--
-- A primeira instrução ABORTA sozinha se o banco for o errado. Não é
-- paranoia: as duas abas do SQL Editor são idênticas, e a única diferença
-- visível é uma string na barra de endereço.
--
-- COMO ELE FUNCIONA
-- Roda dentro de uma transação e MOSTRA o que vai apagar antes de apagar.
-- No fim está um ROLLBACK comentado e um COMMIT comentado: por padrão
-- nada é confirmado até você escolher. Rode uma vez, LEIA as contagens, e
-- só então troque o final.
-- ═══════════════════════════════════════════════════════════

-- ── TRAVA DE BANCO ──────────────────────────────────────────
DO $$
BEGIN
  IF current_setting('request.jwt.claim.iss', true) IS NULL
     AND NOT EXISTS (SELECT 1 FROM pacientes WHERE prontuario = 'T9020') THEN
    RAISE EXCEPTION 'Este banco não parece ser o demo (o paciente de teste T9020 não existe). ABORTADO.';
  END IF;
  -- 15 pacientes = principal; ~75 = demo. Margem larga de propósito.
  IF (SELECT count(*) FROM pacientes) < 40 THEN
    RAISE EXCEPTION 'Este banco tem só % pacientes — parece o PRINCIPAL, não o demo. ABORTADO.',
      (SELECT count(*) FROM pacientes);
  END IF;
END $$;

BEGIN;

-- ── O QUE VAI SAIR, ANTES DE SAIR ───────────────────────────
CREATE TEMP TABLE _antes AS
SELECT 'atendimento #269 (cancelado no passeio)' AS item,
       count(*) AS qtd FROM ps_atendimentos WHERE id = 269
UNION ALL SELECT 'atendimento #270 (aberto no passeio)', count(*) FROM ps_atendimentos WHERE id = 270
UNION ALL SELECT 'atendimento #271 (aberto no passeio)', count(*) FROM ps_atendimentos WHERE id = 271
UNION ALL SELECT 'itens das contas #5 e #6', count(*) FROM at_conta_itens WHERE conta_id IN (5, 6)
UNION ALL SELECT 'contas #5 e #6', count(*) FROM at_contas WHERE id IN (5, 6)
UNION ALL SELECT 'prontuário 9069 (duplicata do passeio)', count(*) FROM pacientes WHERE prontuario = '9069'
UNION ALL SELECT 'gêmeos 9064 e 9065', count(*) FROM pacientes WHERE prontuario IN ('9064', '9065')
UNION ALL SELECT 'agendamentos de 02/09/2026', count(*) FROM ag_agendamentos WHERE data = '2026-09-02';

SELECT * FROM _antes ORDER BY item;

-- ── AS EXCLUSÕES, NA ORDEM QUE A FK EXIGE ───────────────────
-- Filho antes de pai: item antes de conta, conta antes de atendimento,
-- atendimento antes de paciente. Fora de ordem, a FK recusa e o resto da
-- transação vai junto — que é o comportamento certo, só confuso de ler.

-- 1. o que o passeio da remessa criou
DELETE FROM at_conta_itens WHERE conta_id IN (5, 6);
DELETE FROM at_contas      WHERE id IN (5, 6);

-- 2. os atendimentos abertos/cancelados durante os passeios
DELETE FROM ps_atendimentos WHERE id IN (269, 270, 271);

-- 3. a duplicata criada para andar a unificação
--    (o ponteiro dela sai junto; ninguém aponta para ela)
DELETE FROM pacientes WHERE prontuario = '9069';

-- 4. os gêmeos do teste de recém-nascido
--    ⚠️ Só saem se não tiverem NADA pendurado. Se tiverem, a FK recusa e
--    é sinal de que viraram dado de verdade — aí é para investigar, não
--    para forçar.
DELETE FROM pacientes WHERE prontuario IN ('9064', '9065');

-- 5. os agendamentos de setembro usados no teste de remarcação
DELETE FROM ag_agendamentos WHERE data = '2026-09-02';

-- ── O QUE FICOU ─────────────────────────────────────────────
SELECT a.item, a.qtd AS antes,
       CASE a.item
         WHEN 'atendimento #269 (cancelado no passeio)' THEN (SELECT count(*) FROM ps_atendimentos WHERE id = 269)
         WHEN 'atendimento #270 (aberto no passeio)'    THEN (SELECT count(*) FROM ps_atendimentos WHERE id = 270)
         WHEN 'atendimento #271 (aberto no passeio)'    THEN (SELECT count(*) FROM ps_atendimentos WHERE id = 271)
         WHEN 'itens das contas #5 e #6'                THEN (SELECT count(*) FROM at_conta_itens WHERE conta_id IN (5,6))
         WHEN 'contas #5 e #6'                          THEN (SELECT count(*) FROM at_contas WHERE id IN (5,6))
         WHEN 'prontuário 9069 (duplicata do passeio)'  THEN (SELECT count(*) FROM pacientes WHERE prontuario = '9069')
         WHEN 'gêmeos 9064 e 9065'                      THEN (SELECT count(*) FROM pacientes WHERE prontuario IN ('9064','9065'))
         WHEN 'agendamentos de 02/09/2026'              THEN (SELECT count(*) FROM ag_agendamentos WHERE data = '2026-09-02')
       END AS depois
FROM _antes a ORDER BY a.item;

-- ── E O QUE **NÃO** É APAGADO, de propósito ─────────────────
-- O endereço do T9020 (Avenida Paulista) fica. Apagar endereço de
-- cadastro é mexer em dado de paciente para consertar sujeira de teste, e
-- o remédio é pior: quem for testar CEP de novo precisa justamente de um
-- cadastro com endereço. Se incomodar, corrija pela TELA, que é onde a
-- correção fica registrada com autor.

ROLLBACK;   -- ⬅️ TROQUE POR "COMMIT;" DEPOIS DE LER AS CONTAGENS ACIMA
-- COMMIT;
