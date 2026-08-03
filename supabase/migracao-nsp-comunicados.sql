-- ═══════════════════════════════════════════════════════════
-- NSP — Comunicação / mural de segurança (Fase 2d)
--
-- Base: PNSP (Portaria 529/2013) e RDC 36/2013 — comunicar riscos e lições
-- aprendidas é parte da gestão de segurança. Mural de comunicados do NSP para
-- a equipe: alertas de segurança, lições aprendidas (que podem nascer de um
-- incidente/RCA) e informativos, com prioridade e público-alvo. Fecha o ciclo
-- "aprender com o erro → comunicar".
--
-- 1 tabela: nsp_comunicados (editável → upsert por id na tela). Sem seed.
-- `incidente_id` liga a lição aprendida ao evento que a gerou (opcional).
--
-- Aditiva e idempotente. Rodar no SQL Editor — primeiro no DEMO, depois no
-- PRINCIPAL (HNSN).
-- ═══════════════════════════════════════════════════════════

create table if not exists public.nsp_comunicados (
  id            uuid primary key default gen_random_uuid(),
  titulo        text    not null,
  tipo          text    not null default 'informativo',  -- alerta | licao_aprendida | informativo
  prioridade    text    not null default 'media',        -- alta | media | baixa
  conteudo      text,
  publico_alvo  text,
  data          date,
  incidente_id  uuid,                    -- origem (opcional): incidente/RCA que gerou o comunicado
  status        text    not null default 'ativo',        -- ativo | arquivado
  ativo         boolean not null default true,
  autor         text,                    -- quem publicou (autoria congelada)
  usuario       text,
  criado_em     timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists nsp_comunicados_status_idx on public.nsp_comunicados (status, criado_em desc);

-- Verificação
select 'NSP: nsp_comunicados ok' as resultado;
