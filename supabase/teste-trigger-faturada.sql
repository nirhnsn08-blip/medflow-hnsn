-- ═══════════════════════════════════════════════════════════
-- PROVA DO TRIGGER: conta faturada não volta atrás
--
-- Roda no SQL Editor, que passa por cima da RLS — que é EXATAMENTE o
-- cenário contra o qual o trigger existe: um script de correção, uma
-- migração distraída, um PATCH direto. A tela já recusa; isto prova que
-- o banco também.
--
-- Não deixa rastro: tudo dentro de uma transação que termina em ROLLBACK.
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- 1. reabrir uma conta faturada DEVE falhar
DO $$
DECLARE alvo bigint;
BEGIN
  SELECT id INTO alvo FROM at_contas WHERE status = 'faturada' LIMIT 1;
  IF alvo IS NULL THEN
    RAISE NOTICE 'INCONCLUSIVO: nenhuma conta faturada para testar.';
    RETURN;
  END IF;
  BEGIN
    UPDATE at_contas SET status = 'aberta' WHERE id = alvo;
    RAISE WARNING 'FALHOU: a conta % voltou para aberta. O trigger não está barrando.', alvo;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK: o banco recusou reabrir a conta % — %', alvo, SQLERRM;
  END;

  -- 2. mas ir para GLOSADA deve passar: é o caminho legítimo depois da
  --    transmissão, e barrar isso quebraria o fluxo de glosa.
  BEGIN
    UPDATE at_contas SET status = 'glosada' WHERE id = alvo;
    RAISE NOTICE 'OK: faturada → glosada continua permitido (é o caminho da glosa).';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'FALHOU: o trigger está barrando até a glosa — %', SQLERRM;
  END;
END $$;

ROLLBACK;   -- nada do que este teste fez fica no banco
