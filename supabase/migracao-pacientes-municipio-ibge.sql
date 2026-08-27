-- ═══════════════════════════════════════════════════════════
-- CÓDIGO IBGE DO MUNICÍPIO DE RESIDÊNCIA
--
-- POR QUE: a AIH e o BPA não aceitam o município por extenso — exigem o
-- código de 7 dígitos do IBGE. Quem digita "Navegantes" na recepção não
-- sabe disso, e o faturista descobre na glosa, meses depois, quando já
-- não há quem lembrar do endereço daquele paciente.
--
-- A resposta do CEP (ViaCEP) já traz o código. Vinha e era jogada fora.
--
-- ADITIVA: uma coluna nova, nada é alterado nem apagado. Cadastro que já
-- existe fica com NULL — e NULL aqui quer dizer "ninguém consultou o CEP
-- deste endereço ainda", que é diferente de "não tem código".
--
-- ⚠️ O CHECK É O QUE IMPORTA. Sem ele, um dia alguém importa planilha com
-- o código do estado (2 dígitos), com o código antigo de 6, ou com o nome
-- da cidade no lugar do número — e o valor vai para a AIH sem passar por
-- tela nenhuma. É o último ponto onde isso ainda dá para barrar.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS end_municipio_ibge text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pacientes_ibge_7_digitos') THEN
    ALTER TABLE pacientes ADD CONSTRAINT pacientes_ibge_7_digitos
      CHECK (end_municipio_ibge IS NULL OR end_municipio_ibge ~ '^[0-9]{7}$');
  END IF;
END $$;

COMMENT ON COLUMN pacientes.end_municipio_ibge IS
  'Código IBGE (7 dígitos) do município de residência, exigido pela AIH e pelo BPA. '
  'Preenchido pela consulta de CEP, nunca digitado. Só é gravado quando o município '
  'do formulário é o mesmo que o CEP respondeu; some quando o município ou a UF são '
  'editados à mão, porque o código guardado era o da cidade de antes.';

-- ── RECIBO ──────────────────────────────────────────────────
-- Não faz backfill: não há de onde tirar o código sem consultar o CEP de
-- cada endereço, um a um. Ele entra à medida que os cadastros passam pela
-- recepção — que é onde alguém está com a pessoa na frente para conferir.
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'pacientes' AND column_name = 'end_municipio_ibge') AS coluna_criada,
  (SELECT count(*) FROM pg_constraint WHERE conname = 'pacientes_ibge_7_digitos') AS check_criado,
  (SELECT count(*) FROM pacientes WHERE end_municipio IS NOT NULL AND end_municipio <> '') AS com_municipio,
  (SELECT count(*) FROM pacientes WHERE end_municipio_ibge IS NOT NULL) AS ja_com_codigo,
  (SELECT count(*) FROM pacientes WHERE end_cep IS NOT NULL AND end_cep <> '') AS com_cep_para_reaproveitar;

-- Toda migração termina se anotando (ver docs/MODELO-DE-TRABALHO.md §6).
insert into public.migracoes_aplicadas (arquivo)
values ('migracao-pacientes-municipio-ibge.sql') on conflict do nothing;
