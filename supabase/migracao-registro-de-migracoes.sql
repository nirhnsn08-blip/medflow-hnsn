-- ═══════════════════════════════════════════════════════════
-- REGISTRO DE MIGRAÇÕES — cada uma passa a se anotar ao rodar
--
-- 🔴 POR QUE ISTO EXISTE
-- Duas pessoas mexem no banco e são DOIS bancos (demo e hospital). A lista
-- de "o que já rodou onde" vivia na conversa, e isso se perde. Já custou
-- duas vezes: código publicado com a migração NÃO rodada no hospital
-- (`faturamento-remessa`, achada por sonda depois do merge) e o banco de
-- TESTE atrás da produção (`nsp-protocolos`, achada por um 404 no console).
--
-- A primeira tentativa de resolver foi um conferidor que SONDAVA o esquema
-- ("existe a coluna? existe o gatilho?"). Funciona para migração de
-- estrutura, e falhou justamente na de DADO: migração que só insere linha
-- não deixa marca na estrutura, e a sonda respondia "ok" quando na verdade
-- não havia o que migrar. Verificação que falha em silêncio devolve um
-- resultado errado com cara de certo — que é o defeito que este projeto
-- inteiro persegue.
--
-- ⚠️ A CORREÇÃO É INVERTER A PERGUNTA. Em vez de deduzir se rodou olhando
-- o efeito, cada migração AFIRMA que rodou. Uma linha no fim de cada
-- arquivo, e o registro passa a ser fato declarado, não inferência.
--
-- ⚠️ E ELE GUARDA QUEM RODOU. Com duas pessoas no banco, "quando" sem
-- "quem" não resolve discussão nenhuma. O SQL Editor roda como `postgres`
-- para todo mundo, então quem quiser se identificar faz, UMA VEZ por
-- sessão, antes de rodar qualquer migração:
--
--     set valentrax.quem = 'laura';
--
-- Sem isso, fica registrado o usuário do banco — perde-se o nome, não o
-- fato. Nada quebra por esquecer.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.migracoes_aplicadas (
  arquivo      text PRIMARY KEY,
  aplicada_em  timestamptz NOT NULL DEFAULT now(),
  aplicada_por text NOT NULL DEFAULT coalesce(current_setting('valentrax.quem', true), session_user),
  observacao   text
);

COMMENT ON TABLE public.migracoes_aplicadas IS
  'Uma linha por migração que rodou NESTE banco. Cada arquivo .sql se anota '
  'na última linha. Não deduza pelo esquema: pergunte aqui.';

-- ⚠️ Ninguém apaga registro de migração. Apagar faria o conferidor pedir
-- para rodar de novo algo já aplicado — e migração idempotente é a regra,
-- não a garantia.
ALTER TABLE public.migracoes_aplicadas ENABLE ROW LEVEL SECURITY;

-- ⚠️ O NOME DA POLÍTICA SEGUE A CONVENÇÃO `<tabela>_leitura`, e isso não é
-- estética: o `migracao-rls-leitura.sql` derruba e recria as políticas POR
-- ESSE NOME. Uma política fora do padrão sobreviveria ao drop e conviveria
-- com a gerada — duas regras na mesma tabela, e ninguém sabendo qual vale.
--
-- A leitura é de TODOS os autenticados, declarada em `mapa-tabelas.js`:
-- aqui só há nome de arquivo, data e quem rodou. Esconder não protegeria
-- ninguém e faria a conferência depender de quem tem qual perfil.
DROP POLICY IF EXISTS migracoes_leitura ON public.migracoes_aplicadas;
DROP POLICY IF EXISTS migracoes_aplicadas_leitura ON public.migracoes_aplicadas;
CREATE POLICY migracoes_aplicadas_leitura ON public.migracoes_aplicadas
  FOR SELECT TO authenticated USING (true);

-- ⚠️ ESTE ARQUIVO NÃO ANOTA AS MIGRAÇÕES ANTIGAS.
-- São 82 no repositório, e deduzir cada uma pelo esquema seria repetir o
-- erro que motivou tudo isto: sonda que erra em silêncio. Quem anota é o
-- `anotar-migracoes-existentes.sql`, GERADO a partir da pasta — lista
-- derivada, não lembrada. Rode ele logo depois deste.

-- este arquivo também se registra
INSERT INTO public.migracoes_aplicadas (arquivo)
VALUES ('migracao-registro-de-migracoes.sql')
ON CONFLICT (arquivo) DO NOTHING;

-- ── RECIBO ──────────────────────────────────────────────────
SELECT
  CASE WHEN (SELECT count(*) FROM public.pacientes) >= 40
       THEN 'DEMO (banco de teste)' ELSE 'PRINCIPAL (hospital)' END AS banco,
  (SELECT count(*) FROM public.migracoes_aplicadas) AS migracoes_registradas;

SELECT arquivo, to_char(aplicada_em, 'DD/MM/YYYY HH24:MI') AS quando, aplicada_por AS quem
FROM public.migracoes_aplicadas ORDER BY arquivo;
