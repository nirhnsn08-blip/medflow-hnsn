-- ═══════════════════════════════════════════════════════════
-- A PRESCRIÇÃO SÓ FICA "PRONTA" SE SAIU DO ESTOQUE
--
-- POR QUE: o kanban da farmácia tinha "Separar" e "Marcar pronto" como
-- dois botões independentes. `marcarPronto` só trocava o status. Este
-- caminho era válido e não deixava rastro nenhum:
--
--     receber → marcar pronto → confirmar retirada
--
-- Ao fim dele a prescrição consta como ENTREGUE AO PACIENTE e não existe
-- uma linha de saída em `farm_movimentos`. Reproduzido na tela do banco de
-- teste: a mesma farmácia dizia, em duas abas, coisas opostas sobre o
-- mesmo paciente — "Retirados hoje (1)" e "2 pendente(s)".
--
-- ⚠️ A TELA JÁ RECUSA. Isto aqui é a última linha, porque tela não é
-- defesa: script de correção, importação e PATCH direto pelo PostgREST
-- passam por cima dela. Foi assim que o `faturada` ganhou trigger, e é o
-- mesmo raciocínio.
--
-- ⚠️ O QUE O TRIGGER **NÃO** EXIGE: dispensação COMPLETA.
-- Ruptura de estoque é rotina. Se dois de três itens saíram porque o
-- terceiro acabou, a sacola existe e o paciente precisa dela — travar aí
-- empurraria a farmácia a registrar mentira em outro campo. A regra é
-- "pelo menos uma saída"; a tela é que avisa o que falta e nomeia.
--
-- ⚠️ E PRESCRIÇÃO SEM ITEM ESTRUTURADO PASSA. Registro anterior à Fase B
-- não tem o que separar; travá-lo congelaria uma fila que ninguém
-- consegue destravar.
--
-- ADITIVA: nenhuma coluna nova, nenhum dado alterado. Só um trigger.
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION preparo_exige_baixa() RETURNS trigger AS $$
DECLARE
  n_itens    int;
  n_saidas   int;
  v_atend    bigint;
BEGIN
  -- só interessa a transição PARA "pronto"
  IF NEW.status IS DISTINCT FROM 'pronto' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'pronto' THEN RETURN NEW; END IF;

  SELECT atendimento_id INTO v_atend
    FROM public.ps_registros WHERE id = NEW.registro_id;

  -- Os itens desta prescrição. O `coalesce` é o mesmo recuo da regra pura:
  -- item gravado antes de a ligação existir fica com registro_id nulo, e
  -- sem o recuo o trigger concluiria "não há o que separar" e liberaria —
  -- exatamente onde a gente testa, porque o seed grava assim.
  SELECT count(*) INTO n_itens
    FROM public.ps_prescricao_itens i
   WHERE i.registro_id = NEW.registro_id
      OR (i.registro_id IS NULL AND v_atend IS NOT NULL AND i.atendimento_id = v_atend);

  IF n_itens = 0 THEN RETURN NEW; END IF;   -- nada a separar

  SELECT count(*) INTO n_saidas
    FROM public.farm_movimentos m
    JOIN public.ps_prescricao_itens i ON i.id = m.prescricao_item_id
   WHERE m.tipo = 'saida'
     AND m.quantidade > 0
     AND (i.registro_id = NEW.registro_id
          OR (i.registro_id IS NULL AND v_atend IS NOT NULL AND i.atendimento_id = v_atend));

  IF n_saidas = 0 THEN
    RAISE EXCEPTION
      'A prescrição % não teve nenhum item separado (% item(ns) prescrito(s), 0 baixa de estoque). '
      'Marcar como pronta faria o sistema afirmar que o paciente recebeu um medicamento que ninguém '
      'tirou da prateleira.', NEW.registro_id, n_itens
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS farm_preparo_exige_baixa ON public.farm_preparo;
CREATE TRIGGER farm_preparo_exige_baixa
  BEFORE INSERT OR UPDATE OF status ON public.farm_preparo
  FOR EACH ROW EXECUTE FUNCTION preparo_exige_baixa();

-- ── RECIBO ──────────────────────────────────────────────────
-- `ja_prontas_sem_baixa` é o passivo: prescrições que JÁ estão pronta ou
-- retirada e nunca tiveram saída. O trigger não mexe no passado — ele só
-- impede novas. Este número é o tamanho do estrago que já aconteceu.
SELECT
  (SELECT count(*) FROM pg_trigger WHERE tgname = 'farm_preparo_exige_baixa') AS trigger_criado,
  (SELECT count(*) FROM public.farm_preparo) AS preparos_no_total,
  (SELECT count(*) FROM public.farm_preparo p
     WHERE p.status IN ('pronto','retirado')
       AND NOT EXISTS (
         SELECT 1 FROM public.farm_movimentos m
           JOIN public.ps_prescricao_itens i ON i.id = m.prescricao_item_id
          WHERE m.tipo = 'saida' AND m.quantidade > 0
            AND (i.registro_id = p.registro_id
                 OR (i.registro_id IS NULL
                     AND i.atendimento_id = (SELECT atendimento_id FROM public.ps_registros WHERE id = p.registro_id)))
       )) AS ja_prontas_sem_baixa;
