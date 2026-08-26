-- ═══════════════════════════════════════════════════════════
-- PROVA DO TRIGGER: cadeia de unificação não se forma
--
-- Roda no SQL Editor, que passa por cima da RLS — o cenário contra o qual
-- o trigger existe: script de correção, importação, PATCH direto. A tela
-- já recusa; isto prova que o banco também.
--
-- Devolve LINHAS, não NOTICE: o editor do Supabase não mostra NOTICE no
-- painel de resultados, e um teste que não se vê é um teste que passa dos
-- dois jeitos. (Já aconteceu neste projeto — ver teste-trigger-faturada.)
--
-- Não usa transação: as tentativas FALHAM, então não há o que desfazer.
-- ═══════════════════════════════════════════════════════════

CREATE TEMP TABLE IF NOT EXISTS _u (ordem int, teste text, resultado text);
TRUNCATE _u;

DO $$
DECLARE
  origem  text;   -- ficha que já aponta para outra
  destino text;   -- ficha que já é destino de alguém
  terceiro text;  -- uma ficha solta, para tentar a cadeia
BEGIN
  SELECT prontuario, unificado_para INTO origem, destino
    FROM pacientes WHERE unificado_para IS NOT NULL ORDER BY unificado_em DESC LIMIT 1;

  IF origem IS NULL THEN
    INSERT INTO _u VALUES (1, 'pré-requisito',
      'INCONCLUSIVO — não há nenhuma unificação neste banco. Unifique duas fichas pela tela e rode de novo.');
    RETURN;
  END IF;
  INSERT INTO _u VALUES (1, 'par usado no teste', origem || ' aponta para ' || destino);

  SELECT prontuario INTO terceiro
    FROM pacientes
    WHERE prontuario NOT IN (origem, destino) AND unificado_para IS NULL
    LIMIT 1;

  -- 1. apontar para uma ficha QUE JÁ APONTA para outra (A→B, agora C→A)
  BEGIN
    UPDATE pacientes SET unificado_para = origem WHERE prontuario = terceiro;
    INSERT INTO _u VALUES (2, 'apontar para ficha já unificada',
      'FALHOU — o banco deixou ' || terceiro || ' apontar para ' || origem || ', que já aponta para ' || destino || '.');
    UPDATE pacientes SET unificado_para = NULL WHERE prontuario = terceiro;   -- desfaz
  EXCEPTION WHEN check_violation THEN
    INSERT INTO _u VALUES (2, 'apontar para ficha já unificada', 'OK — recusado: ' || SQLERRM);
  END;

  -- 2. unificar uma ficha QUE JÁ É DESTINO de outra (B→C, com A→B)
  BEGIN
    UPDATE pacientes SET unificado_para = terceiro WHERE prontuario = destino;
    INSERT INTO _u VALUES (3, 'unificar ficha que já é destino',
      'FALHOU — o banco deixou ' || destino || ' virar ponteiro, e ' || origem || ' ficou pendurado num salto a mais.');
    UPDATE pacientes SET unificado_para = NULL WHERE prontuario = destino;    -- desfaz
  EXCEPTION WHEN check_violation THEN
    INSERT INTO _u VALUES (3, 'unificar ficha que já é destino', 'OK — recusado: ' || SQLERRM);
  END;

  -- 3. apontar para si mesmo (o CHECK, não o trigger)
  BEGIN
    UPDATE pacientes SET unificado_para = terceiro WHERE prontuario = terceiro;
    INSERT INTO _u VALUES (4, 'apontar para si mesmo', 'FALHOU — o banco aceitou autorreferência.');
    UPDATE pacientes SET unificado_para = NULL WHERE prontuario = terceiro;
  EXCEPTION WHEN check_violation THEN
    INSERT INTO _u VALUES (4, 'apontar para si mesmo', 'OK — recusado pelo CHECK.');
  END;

  -- 4. apontar para prontuário que não existe (a FK)
  BEGIN
    UPDATE pacientes SET unificado_para = 'NAO-EXISTE-9999' WHERE prontuario = terceiro;
    INSERT INTO _u VALUES (5, 'apontar para ficha inexistente',
      'FALHOU — o paciente sumiria: a ficha diria "olhe ali" e ali não tem nada.');
    UPDATE pacientes SET unificado_para = NULL WHERE prontuario = terceiro;
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO _u VALUES (5, 'apontar para ficha inexistente', 'OK — recusado pela FK.');
  END;

  -- confere que nada ficou fora do lugar
  INSERT INTO _u VALUES (6, 'nada mudou no banco?',
    CASE WHEN (SELECT unificado_para FROM pacientes WHERE prontuario = origem) = destino
          AND (SELECT unificado_para FROM pacientes WHERE prontuario = terceiro) IS NULL
          AND (SELECT unificado_para FROM pacientes WHERE prontuario = destino) IS NULL
         THEN 'OK — tudo como estava'
         ELSE '⚠️ ATENÇÃO — confira ' || origem || ', ' || destino || ' e ' || terceiro END);
END $$;

SELECT teste, resultado FROM _u ORDER BY ordem;
