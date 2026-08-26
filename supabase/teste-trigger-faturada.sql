-- ═══════════════════════════════════════════════════════════
-- PROVA DO TRIGGER: conta faturada não volta atrás
--
-- Roda no SQL Editor, que passa por cima da RLS — que é EXATAMENTE o
-- cenário contra o qual o trigger existe: um script de correção, uma
-- migração distraída, um PATCH direto. A tela já recusa; isto prova que
-- o banco também.
--
-- ⚠️ A PRIMEIRA VERSÃO DESTE ARQUIVO NÃO PROVAVA NADA. Ela usava
-- RAISE NOTICE dentro de um DO e terminava em ROLLBACK. O editor do
-- Supabase não mostra NOTICE no painel de resultados, e o DO capturava as
-- exceções — então a tela dizia "Success. No rows returned" tanto com o
-- trigger funcionando quanto com ele ausente. Um teste que passa dos dois
-- jeitos é pior que teste nenhum: dá confiança sem dar informação.
-- Agora o resultado vem como LINHA, que é o que o editor sabe mostrar.
--
-- NÃO usa transação: a tentativa de reabrir FALHA (não muda nada), a de
-- glosar PASSA, e o próprio teste devolve a conta ao estado anterior —
-- glosada → faturada é permitido, porque o trigger só barra quem SAI de
-- faturada. O último passo confere que a conta voltou.
-- ═══════════════════════════════════════════════════════════

CREATE TEMP TABLE IF NOT EXISTS _res (ordem int, teste text, resultado text);
TRUNCATE _res;

DO $$
DECLARE
  alvo   bigint;
  antes  text;
  depois text;
BEGIN
  SELECT id, status INTO alvo, antes
    FROM at_contas WHERE status = 'faturada' ORDER BY id LIMIT 1;

  IF alvo IS NULL THEN
    INSERT INTO _res VALUES (1, 'pré-requisito',
      'INCONCLUSIVO — não há conta faturada neste banco para testar. '
      'Registre uma transmissão pela tela e rode de novo.');
    RETURN;
  END IF;
  INSERT INTO _res VALUES (1, 'conta usada no teste', 'conta #' || alvo || ', status ' || antes);

  -- 1. reabrir uma conta faturada DEVE falhar
  BEGIN
    UPDATE at_contas SET status = 'aberta' WHERE id = alvo;
    INSERT INTO _res VALUES (2, 'reabrir conta faturada',
      'FALHOU — o banco deixou voltar para aberta. O trigger não está barrando.');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO _res VALUES (2, 'reabrir conta faturada', 'OK — recusado pelo banco: ' || SQLERRM);
  END;

  -- 2. mas ir para GLOSADA deve passar: é o caminho legítimo depois da
  --    transmissão, e barrar isso quebraria o fluxo de glosa.
  BEGIN
    UPDATE at_contas SET status = 'glosada' WHERE id = alvo;
    INSERT INTO _res VALUES (3, 'faturada → glosada', 'OK — permitido, é o caminho da glosa.');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _res VALUES (3, 'faturada → glosada',
      'FALHOU — o trigger está barrando até a glosa: ' || SQLERRM);
  END;

  -- 3. devolve a conta ao estado em que estava (glosada → faturada passa,
  --    porque o trigger só olha quem SAI de faturada)
  BEGIN
    UPDATE at_contas SET status = antes WHERE id = alvo;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _res VALUES (4, '⚠️ restauração', 'FALHOU — a conta #' || alvo ||
      ' ficou em outro estado: ' || SQLERRM);
  END;

  SELECT status INTO depois FROM at_contas WHERE id = alvo;
  INSERT INTO _res VALUES (5, 'conta ficou como estava?',
    CASE WHEN depois = antes THEN 'OK — de volta em ' || depois
         ELSE '⚠️ ATENÇÃO — está em ' || depois || ', era ' || antes END);
END $$;

SELECT teste, resultado FROM _res ORDER BY ordem;
