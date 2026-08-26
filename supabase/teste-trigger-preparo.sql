-- ═══════════════════════════════════════════════════════════
-- PROVA DO TRIGGER: prescrição não fica "pronta" sem baixa de estoque
--
-- Roda no SQL Editor, que passa por cima da RLS — o cenário contra o qual
-- o trigger existe: script de correção, importação, PATCH direto pelo
-- PostgREST. A tela já recusa; isto prova que o banco também.
--
-- Devolve LINHAS, não NOTICE: o editor do Supabase não mostra NOTICE no
-- painel de resultados, e um teste que não se vê é um teste que passa dos
-- dois jeitos. (Já aconteceu neste projeto — ver teste-trigger-faturada.)
--
-- Não usa transação: cada tentativa é desfeita explicitamente, e a última
-- linha confere que nada ficou fora do lugar.
-- ═══════════════════════════════════════════════════════════

CREATE TEMP TABLE IF NOT EXISTS _p (ordem int, teste text, resultado text);
TRUNCATE _p;

DO $$
DECLARE
  alvo      bigint;   -- um preparo que NÃO tem baixa nenhuma
  antes     text;
  com_baixa bigint;   -- um preparo que TEM baixa
  n_itens   int;
BEGIN
  -- ── acha um preparo cuja prescrição não teve saída ─────────
  SELECT p.id, p.status INTO alvo, antes
    FROM public.farm_preparo p
   WHERE NOT EXISTS (
     SELECT 1 FROM public.farm_movimentos m
       JOIN public.ps_prescricao_itens i ON i.id = m.prescricao_item_id
      WHERE m.tipo = 'saida' AND m.quantidade > 0
        AND (i.registro_id = p.registro_id
             OR (i.registro_id IS NULL
                 AND i.atendimento_id = (SELECT atendimento_id FROM public.ps_registros WHERE id = p.registro_id)))
   )
   ORDER BY p.id LIMIT 1;

  IF alvo IS NULL THEN
    INSERT INTO _p VALUES (1, 'pré-requisito',
      'INCONCLUSIVO — todo preparo deste banco já tem baixa. Receba uma prescrição na Farmácia (sem separar) e rode de novo.');
  ELSE
    SELECT count(*) INTO n_itens
      FROM public.ps_prescricao_itens i
     WHERE i.registro_id = (SELECT registro_id FROM public.farm_preparo WHERE id = alvo)
        OR (i.registro_id IS NULL
            AND i.atendimento_id = (SELECT atendimento_id FROM public.ps_registros
                                     WHERE id = (SELECT registro_id FROM public.farm_preparo WHERE id = alvo)));

    INSERT INTO _p VALUES (1, 'preparo usado no teste',
      'preparo #' || alvo || ', status ' || antes || ', ' || n_itens || ' item(ns) prescrito(s), 0 baixa');

    -- 1. marcar pronto SEM baixa DEVE falhar
    BEGIN
      UPDATE public.farm_preparo SET status = 'pronto' WHERE id = alvo;
      INSERT INTO _p VALUES (2, '🔴 marcar pronto sem baixa',
        'FALHOU — o banco aceitou. O trigger não está barrando.');
      UPDATE public.farm_preparo SET status = antes WHERE id = alvo;   -- desfaz
    EXCEPTION WHEN check_violation THEN
      INSERT INTO _p VALUES (2, '🔴 marcar pronto sem baixa', 'OK — recusado: ' || SQLERRM);
    END;

    -- 2. mas mudar para OUTRO status continua livre (o trigger só olha 'pronto')
    BEGIN
      UPDATE public.farm_preparo SET status = 'preparo' WHERE id = alvo;
      INSERT INTO _p VALUES (3, 'outros status seguem livres', 'OK — o trigger só vigia a entrada em "pronto".');
      UPDATE public.farm_preparo SET status = antes WHERE id = alvo;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _p VALUES (3, 'outros status seguem livres', 'FALHOU — o trigger está barrando demais: ' || SQLERRM);
    END;
  END IF;

  -- ── quem TEM baixa passa: o trigger não pode travar o fluxo bom ──
  SELECT p.id INTO com_baixa
    FROM public.farm_preparo p
   WHERE EXISTS (
     SELECT 1 FROM public.farm_movimentos m
       JOIN public.ps_prescricao_itens i ON i.id = m.prescricao_item_id
      WHERE m.tipo = 'saida' AND m.quantidade > 0
        AND (i.registro_id = p.registro_id
             OR (i.registro_id IS NULL
                 AND i.atendimento_id = (SELECT atendimento_id FROM public.ps_registros WHERE id = p.registro_id)))
   )
   ORDER BY p.id LIMIT 1;

  IF com_baixa IS NULL THEN
    INSERT INTO _p VALUES (4, 'prescrição COM baixa passa',
      'INCONCLUSIVO — nenhum preparo deste banco tem baixa ainda.');
  ELSE
    DECLARE st text;
    BEGIN
      SELECT status INTO st FROM public.farm_preparo WHERE id = com_baixa;
      BEGIN
        UPDATE public.farm_preparo SET status = 'pronto' WHERE id = com_baixa;
        INSERT INTO _p VALUES (4, 'prescrição COM baixa passa', 'OK — preparo #' || com_baixa || ' foi aceito.');
        UPDATE public.farm_preparo SET status = st WHERE id = com_baixa;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO _p VALUES (4, 'prescrição COM baixa passa',
          '⚠️ FALHOU — o trigger barrou quem TINHA baixa: ' || SQLERRM);
      END;
    END;
  END IF;

  -- ── nada pode ter ficado fora do lugar ─────────────────────
  INSERT INTO _p VALUES (5, 'nada mudou no banco?',
    CASE WHEN (alvo IS NULL OR (SELECT status FROM public.farm_preparo WHERE id = alvo) = antes)
         THEN 'OK — tudo como estava'
         ELSE '⚠️ ATENÇÃO — confira o preparo #' || alvo END);
END $$;

SELECT teste, resultado FROM _p ORDER BY ordem;
