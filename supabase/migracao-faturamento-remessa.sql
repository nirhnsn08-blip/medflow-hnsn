-- ═══════════════════════════════════════════════════════════
-- REMESSA TRANSMITIDA — quem, quando, e sob qual protocolo
--
-- POR QUE: `faturada` era um estado INALCANÇÁVEL. A função que o escreve
-- existia em `dados.js` desde sempre e nenhuma tela a chamava, então
-- nenhuma conta jamais saiu de "fechada". Três leitores dependiam disso —
-- o KPI "já transmitidas ao SUS" entre eles — e todos mostravam zero por
-- construção. Indicador que não pode mudar ensina quem olha que o número
-- não quer dizer nada.
--
-- E a função gravava SÓ o status. `fecharConta` carimba fechada_em e
-- fechada_por desde sempre; a transmissão, que é o passo SEM VOLTA, não
-- carimbava nada — justamente as três coisas que alguém procura quando a
-- glosa chega meses depois.
--
-- ADITIVA: três colunas novas, nada é alterado nem apagado.
--
-- ⚠️ O TRIGGER É O QUE IMPORTA. `faturada` não reabre: a partir dela
-- existe arquivo transmitido, e mexer no que já foi enviado faz a conta e
-- a remessa contarem histórias diferentes. A tela já recusa, mas tela não
-- é defesa — um script de correção, um PATCH direto pelo PostgREST ou um
-- botão futuro passam por cima dela. O banco é o último lugar onde isso
-- ainda dá para barrar.
--
-- Da `faturada` só se sai para `glosada`, que é o caminho legítimo: a
-- conta foi transmitida e o órgão recusou. Correção depois disso é outro
-- fluxo, e ele começa na glosa.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE at_contas ADD COLUMN IF NOT EXISTS faturada_em timestamptz;
ALTER TABLE at_contas ADD COLUMN IF NOT EXISTS faturada_por text;
ALTER TABLE at_contas ADD COLUMN IF NOT EXISTS remessa_protocolo text;

COMMENT ON COLUMN at_contas.faturada_em IS
  'Data em que a remessa foi transmitida ao órgão. Informada por quem transmitiu — '
  'o sistema não gera o arquivo de remessa (ver faturamento.js), registra o fato.';
COMMENT ON COLUMN at_contas.remessa_protocolo IS
  'Protocolo devolvido pelo órgão na transmissão. É por ele que se acha, quando a '
  'glosa chega, em qual remessa a conta foi.';

-- ── acha as contas de uma remessa quando a glosa chega ──────
CREATE INDEX IF NOT EXISTS at_contas_remessa_idx
  ON at_contas (remessa_protocolo) WHERE remessa_protocolo IS NOT NULL;

-- ── A ÚLTIMA LINHA DE DEFESA ────────────────────────────────
CREATE OR REPLACE FUNCTION faturada_nao_volta() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'faturada' AND NEW.status <> 'faturada' AND NEW.status <> 'glosada' THEN
    RAISE EXCEPTION
      'Conta % já foi transmitida (faturada em %). Não se reabre o que já foi enviado — '
      'a correção depois da transmissão é glosa.', OLD.id, OLD.faturada_em
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS at_contas_faturada_nao_volta ON at_contas;
CREATE TRIGGER at_contas_faturada_nao_volta
  BEFORE UPDATE ON at_contas
  FOR EACH ROW EXECUTE FUNCTION faturada_nao_volta();

-- ── RECIBO ──────────────────────────────────────────────────
-- Sem backfill: não há como saber, olhando o banco, quais contas já foram
-- transmitidas de fato — o sistema nunca soube. As fechadas continuam
-- fechadas, e passam a faturada quando alguém registrar a remessa.
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'at_contas'
       AND column_name IN ('faturada_em','faturada_por','remessa_protocolo')) AS colunas_criadas,
  (SELECT count(*) FROM pg_trigger WHERE tgname = 'at_contas_faturada_nao_volta') AS trigger_criado,
  (SELECT count(*) FROM at_contas WHERE status = 'fechada') AS fechadas_esperando_remessa,
  (SELECT count(*) FROM at_contas WHERE status = 'faturada') AS ja_faturadas,
  (SELECT count(DISTINCT competencia) FROM at_contas WHERE status = 'fechada') AS competencias_com_pendencia;
