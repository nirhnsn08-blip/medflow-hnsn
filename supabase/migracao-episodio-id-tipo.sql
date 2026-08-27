-- ═══════════════════════════════════════════════════════════
-- `episodio_id` DAS TABELAS DE ENFERMAGEM: uuid → bigint
--
-- 🔴 COMO ISTO APARECEU
-- Só depois de ligar o episódio de internação (que nunca era aberto) e
-- abrir a tela do paciente internado pela primeira vez:
--
--     GET enf_sae_historico   → 400
--     invalid input syntax for type uuid: "2"
--
-- `pep_episodios.id` é `bigserial`. As tabelas do PEP acertaram
-- (`episodio_id bigint references pep_episodios(id)`, em pep-fase1 e
-- pep-fase3). As de ENFERMAGEM e o `nsp_incidentes` declararam `uuid`.
--
-- ⚠️ POR QUE NINGUÉM VIU ISSO ANTES: as duas fases nunca se encontraram.
-- Sem episódio aberto, nenhuma consulta jamais filtrou por `episodio_id` —
-- o erro precisava de um episódio existindo para acontecer. É o mesmo
-- padrão do resto: o defeito não estava escondido, estava INALCANÇÁVEL.
--
-- ⚠️ POR QUE A CONVERSÃO É SEGURA: as oito tabelas estão VAZIAS, e a
-- razão é o próprio diagnóstico — ninguém nunca conseguiu escrever nelas,
-- porque toda escrita exige o episódio. Conferido nos dois bancos antes de
-- escrever este arquivo (0 linhas, 0 com episodio_id preenchido).
--
-- Se em ALGUM banco houver linha com `episodio_id` preenchido, a conversão
-- ABORTA em vez de destruir o dado — ver o bloco de guarda abaixo.
-- ═══════════════════════════════════════════════════════════

-- ── GUARDA: não converte por cima de dado ──────────────────
DO $$
DECLARE
  t text;
  n bigint;
  ocupadas text := '';
BEGIN
  FOREACH t IN ARRAY ARRAY['enf_escalas','enf_lesao_pressao','enf_sae_historico',
                           'enf_sae_diagnosticos','enf_sae_prescricoes',
                           'enf_sae_prescricao_itens','enf_sae_checagem','nsp_incidentes']
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = t AND column_name = 'episodio_id' AND data_type = 'uuid') THEN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE episodio_id IS NOT NULL', t) INTO n;
      IF n > 0 THEN ocupadas := ocupadas || t || ' (' || n || '), '; END IF;
    END IF;
  END LOOP;

  IF ocupadas <> '' THEN
    RAISE EXCEPTION
      'ABORTADO: há episodio_id preenchido em %. Converter apagaria esse vínculo. '
      'Traga o caso para análise antes de rodar.', rtrim(ocupadas, ', ');
  END IF;
END $$;

-- ── A CONVERSÃO ─────────────────────────────────────────────
-- `using null` porque as colunas estão vazias: não há uuid a traduzir para
-- bigint (não existe tradução possível entre os dois, e é justamente por
-- isso que a guarda acima aborta se houver dado).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['enf_escalas','enf_lesao_pressao','enf_sae_historico',
                           'enf_sae_diagnosticos','enf_sae_prescricoes',
                           'enf_sae_prescricao_itens','enf_sae_checagem','nsp_incidentes']
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = t AND column_name = 'episodio_id' AND data_type = 'uuid') THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN episodio_id TYPE bigint USING NULL', t);
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (episodio_id) '
                     'REFERENCES public.pep_episodios(id) ON DELETE SET NULL', t, t || '_episodio_fk');
    END IF;
  END LOOP;
END $$;

-- ── RECIBO ──────────────────────────────────────────────────
-- `ainda_uuid` tem de vir ZERO. `com_fk` mostra quantas ganharam a chave
-- estrangeira que faltava — sem ela, um episodio_id apontando para episódio
-- inexistente passaria despercebido.
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE column_name = 'episodio_id' AND data_type = 'uuid'
       AND table_name IN ('enf_escalas','enf_lesao_pressao','enf_sae_historico','enf_sae_diagnosticos',
                          'enf_sae_prescricoes','enf_sae_prescricao_itens','enf_sae_checagem','nsp_incidentes')) AS ainda_uuid,
  (SELECT count(*) FROM information_schema.columns
     WHERE column_name = 'episodio_id' AND data_type = 'bigint'
       AND table_name IN ('enf_escalas','enf_lesao_pressao','enf_sae_historico','enf_sae_diagnosticos',
                          'enf_sae_prescricoes','enf_sae_prescricao_itens','enf_sae_checagem','nsp_incidentes')) AS agora_bigint,
  (SELECT count(*) FROM pg_constraint WHERE conname LIKE '%\_episodio\_fk') AS com_fk,
  (SELECT count(*) FROM public.pep_episodios WHERE status = 'aberto') AS episodios_abertos;
