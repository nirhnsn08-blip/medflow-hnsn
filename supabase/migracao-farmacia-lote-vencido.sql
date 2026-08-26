-- ═══════════════════════════════════════════════════════════
-- LOTE VENCIDO NÃO VAI PARA O PACIENTE
--
-- POR QUE: dispensar lote vencido não era bloqueado — e era o CAMINHO DE
-- MENOR RESISTÊNCIA. A ordenação FEFO ("o que vence antes sai antes") põe
-- o lote mais velho no topo, e o formulário já vinha com o primeiro
-- escolhido. O lote vencido era, literalmente, a opção PRÉ-SELECIONADA. A
-- confirmação validava quantidade e saldo e não olhava a data; o único
-- freio era a palavra "(VENCIDO)" no texto da opção.
--
-- ⚠️ O QUE ESTE TRIGGER **NÃO** FAZ: impedir o vencido de sair.
-- Medicamento vencido PRECISA sair do estoque — por descarte, devolução ao
-- fornecedor ou ajuste. Uma trava que impeça isso prende o vencido na
-- prateleira para sempre, some com ele do relatório de perdas e deixa o
-- saldo mentindo. Seria trocar um risco por dois.
--
-- A pergunta não é "pode sair?", é "PARA ONDE está indo?":
--     motivo = 'Dispensação'  → RECUSA
--     qualquer outro motivo   → PASSA, e é assim que a prateleira se limpa
--
-- ⚠️ VALIDADE AUSENTE NÃO É VALIDADE VENCIDA. Lote sem data é lacuna de
-- cadastro, não veneno — e a tela ainda ensina a dar entrada sem lote.
-- Recusar por falta de dado travaria a farmácia inteira.
--
-- ⚠️ VENCE HOJE AINDA VALE: o medicamento é bom até o fim do dia impresso.
-- Por isso `validade < current_date`, e não `<=`.
--
-- ADITIVA: nenhuma coluna nova, nenhum dado alterado. Só um trigger.
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION farm_vencido_nao_dispensa() RETURNS trigger AS $$
DECLARE
  v_validade date;
BEGIN
  IF NEW.tipo <> 'saida' THEN RETURN NEW; END IF;
  IF coalesce(NEW.motivo, '') <> 'Dispensação' THEN RETURN NEW; END IF;

  -- A validade do movimento vem preenchida pela tela, mas o lote é a
  -- fonte da verdade: um PATCH direto pode mandar validade nenhuma.
  v_validade := NEW.validade;
  IF v_validade IS NULL THEN
    SELECT l.validade INTO v_validade
      FROM public.farm_lotes l
     WHERE l.medicamento_id = NEW.medicamento_id
       AND coalesce(l.lote, '') = coalesce(NEW.lote, '')
     LIMIT 1;
  END IF;

  IF v_validade IS NOT NULL AND v_validade < current_date THEN
    RAISE EXCEPTION
      'Lote vencido em % não pode ser dispensado a paciente. Para tirá-lo do estoque, '
      'registre a saída com o motivo "Perda / vencimento" — é assim que ele deixa a '
      'prateleira e entra no relatório de perdas.', v_validade
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS farm_movimentos_vencido_nao_dispensa ON public.farm_movimentos;
CREATE TRIGGER farm_movimentos_vencido_nao_dispensa
  BEFORE INSERT ON public.farm_movimentos
  FOR EACH ROW EXECUTE FUNCTION farm_vencido_nao_dispensa();

-- ── RECIBO ──────────────────────────────────────────────────
-- `dispensados_vencidos` é o passivo: quantas dispensações já saíram de
-- lote vencido. O trigger não mexe no passado — só impede novas. Se vier
-- maior que zero, cada linha é um paciente que recebeu medicamento fora da
-- validade, e vale saber quem.
SELECT
  (SELECT count(*) FROM pg_trigger WHERE tgname = 'farm_movimentos_vencido_nao_dispensa') AS trigger_criado,
  (SELECT count(*) FROM public.farm_lotes WHERE quantidade > 0 AND validade < current_date) AS lotes_vencidos_com_saldo,
  (SELECT count(*) FROM public.farm_lotes WHERE quantidade > 0 AND validade IS NULL) AS lotes_sem_validade,
  (SELECT count(*) FROM public.farm_movimentos
     WHERE tipo = 'saida' AND motivo = 'Dispensação'
       AND validade IS NOT NULL AND validade < created_at::date) AS dispensados_vencidos;
