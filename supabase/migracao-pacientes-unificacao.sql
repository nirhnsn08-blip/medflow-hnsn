-- ═══════════════════════════════════════════════════════════
-- UNIFICAÇÃO DE PRONTUÁRIO — ligar duas fichas da mesma pessoa
--
-- POR QUE: a mesma pessoa acaba com duas fichas (chegou sem documento e
-- depois com ele, nome digitado de dois jeitos, veio pela emergência e
-- depois pelo ambulatório). O histórico fica PARTIDO: a alergia está numa
-- ficha e a prescrição na outra, e quem atende só vê metade.
--
-- ⚠️ ESTA MIGRAÇÃO NÃO MOVE DADO CLÍNICO, e isso é decisão, não descuido.
-- `prontuario` aparece em 34 tabelas. Repontar todas pela tela seriam 34
-- requisições sem transação entre elas — uma falha no meio deixaria o
-- paciente partido num estado que ninguém sabe qual é, pior que a
-- duplicata original, porque a duplicata pelo menos é visível. Mover exige
-- uma função no Postgres, numa transação só, e ela é outro passo.
--
-- O que entra aqui é o PONTEIRO: a ficha antiga continua existindo e
-- resolvível para sempre (o número está em pulseira, em papel impresso e
-- na memória das pessoas) e passa a dizer para onde olhar.
--
-- ADITIVA: quatro colunas novas, nada é alterado nem apagado.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS unificado_para text;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS unificado_em timestamptz;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS unificado_por text;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS unificacao_motivo text;

COMMENT ON COLUMN pacientes.unificado_para IS
  'Prontuário que sobreviveu à unificação. NULL = esta ficha não foi unificada. '
  'O dado clínico NÃO é movido: continua no prontuário de origem.';
COMMENT ON COLUMN pacientes.unificacao_motivo IS
  'Por que são a mesma pessoa, escrito por quem unificou. É a única coisa que a '
  'máquina não tem como saber, e é o que alguém lê numa auditoria.';

-- ── AS DEFESAS ──────────────────────────────────────────────

-- 1. Não aponta para si mesmo. Uma ficha que aponta para ela própria some
--    de si: toda tela que segue o ponteiro entraria em volta.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pacientes_unificado_nao_e_ele_mesmo') THEN
    ALTER TABLE pacientes ADD CONSTRAINT pacientes_unificado_nao_e_ele_mesmo
      CHECK (unificado_para IS NULL OR unificado_para <> prontuario);
  END IF;
END $$;

-- 2. O destino tem que EXISTIR. Sem a FK, um erro de digitação manda a
--    ficha apontar para um número que não é de ninguém — e aí o paciente
--    desaparece: a ficha antiga diz "olhe ali" e ali não tem nada.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pacientes_unificado_para_fk') THEN
    ALTER TABLE pacientes ADD CONSTRAINT pacientes_unificado_para_fk
      FOREIGN KEY (unificado_para) REFERENCES pacientes (prontuario)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;

-- 3. ⚠️ CADEIA NÃO SE FORMA — a defesa que mais importa.
--    A→B e depois B→C deixaria A apontando para uma ficha que também já
--    mudou de lugar. Quem lê A precisaria seguir dois saltos, e nada
--    impediria A→B→C→A: uma volta fechada, que na tela não fica lenta,
--    fica TRAVADA. A tela já recusa; tela não é defesa, porque script de
--    correção e PATCH direto passam por cima dela.
CREATE OR REPLACE FUNCTION unificacao_sem_cadeia() RETURNS trigger AS $$
DECLARE
  destino_ja_unificado text;
  quem_aponta_para_mim int;
BEGIN
  IF NEW.unificado_para IS NULL THEN RETURN NEW; END IF;

  SELECT unificado_para INTO destino_ja_unificado
    FROM pacientes WHERE prontuario = NEW.unificado_para;

  IF destino_ja_unificado IS NOT NULL THEN
    RAISE EXCEPTION
      'O prontuário % já foi unificado em %. Unifique em %, que é o que está valendo.',
      NEW.unificado_para, destino_ja_unificado, destino_ja_unificado
      USING ERRCODE = 'check_violation';
  END IF;

  -- E o contrário: não se unifica uma ficha que já é destino de outra,
  -- senão a que apontava para ela fica pendurada num salto a mais.
  SELECT count(*) INTO quem_aponta_para_mim
    FROM pacientes WHERE unificado_para = NEW.prontuario;

  IF quem_aponta_para_mim > 0 THEN
    RAISE EXCEPTION
      'O prontuário % já é o destino de % unificação(ões). Unifique aquelas fichas no novo destino primeiro.',
      NEW.prontuario, quem_aponta_para_mim
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pacientes_unificacao_sem_cadeia ON pacientes;
CREATE TRIGGER pacientes_unificacao_sem_cadeia
  BEFORE INSERT OR UPDATE OF unificado_para ON pacientes
  FOR EACH ROW EXECUTE FUNCTION unificacao_sem_cadeia();

-- ── acha rápido as fichas que caíram num prontuário ─────────
CREATE INDEX IF NOT EXISTS pacientes_unificado_para_idx
  ON pacientes (unificado_para) WHERE unificado_para IS NOT NULL;

-- ── RECIBO ──────────────────────────────────────────────────
-- Sem backfill: não há como o banco saber, sozinho, quais fichas são a
-- mesma pessoa — é exatamente o julgamento que a tela pede por escrito.
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'pacientes'
       AND column_name IN ('unificado_para','unificado_em','unificado_por','unificacao_motivo')) AS colunas_criadas,
  (SELECT count(*) FROM pg_constraint
     WHERE conname IN ('pacientes_unificado_nao_e_ele_mesmo','pacientes_unificado_para_fk')) AS defesas_criadas,
  (SELECT count(*) FROM pg_trigger WHERE tgname = 'pacientes_unificacao_sem_cadeia') AS trigger_criado,
  (SELECT count(*) FROM pacientes WHERE unificado_para IS NOT NULL) AS ja_unificados,
  (SELECT count(*) FROM pacientes) AS pacientes_no_acervo;
