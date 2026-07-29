-- ═══════════════════════════════════════════════════════════
-- NSP — Núcleo de Segurança do Paciente (Fase 2a): notificação de incidentes
--
-- Base normativa: RDC 36/2013 (ANVISA) — NSP e notificação de incidentes
-- obrigatórios; PNSP / Portaria MS 529/2013 — cultura de segurança e metas.
-- A notificação é o coração do NSP: qualquer profissional notifica (inclusive
-- ANÔNIMO), o núcleo tria e classifica.
--
-- 2 tabelas:
--   • nsp_incidentes         — a notificação/incidente (classe, tipo, grau de
--                              dano OMS, origem ligada ao paciente/leito, matriz
--                              de risco, status). `numero` é o número humano.
--   • nsp_incidente_eventos  — trilha append-only (triagem, classificação,
--                              comentário, feedback, mudança de status).
--
-- DIFERENCIAL: `origem_*` liga o evento à sua origem (prescrição, checagem,
-- escala Morse/queda, LPP com POA, flebite — Fase 1). `origem_ref` guarda um
-- snapshot congelado do contexto.
--
-- Anonimato: quando `anonimo=true`, `notificado_por` fica nulo. É deliberado —
-- cultura justa (não-punitiva) aumenta a notificação.
--
-- Registro de segurança é append-only (correção = novo registro com corrige_id).
-- `status` é estado de fluxo do núcleo (como o do episódio) e pode ser atualizado,
-- sempre deixando rastro em nsp_incidente_eventos. Aditiva e idempotente.
-- Rodar no SQL Editor — DEMO primeiro, depois HNSN.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.nsp_incidentes (
  id                 uuid primary key default gen_random_uuid(),
  numero             bigint generated always as identity,  -- número humano (INC-<numero>)
  classe             text not null,          -- circunstancia_risco|near_miss|incidente_sem_dano|evento_adverso|never_event
  tipo               text,                   -- medicacao|queda|lpp|identificacao|cirurgico|dispositivo|...
  grau_dano          text,                   -- nenhum|leve|moderado|grave|obito (taxonomia OMS)
  descricao          text not null,
  acoes_imediatas    text,                   -- o que já foi feito na hora
  local_setor        text,
  leito              text,
  ocorrido_em        timestamptz,
  detectado_em       timestamptz,
  -- origem ligada (diferencial): de onde o evento nasceu
  prontuario         text,
  episodio_id        uuid,
  origem_tipo        text,                   -- manual|prescricao|checagem|escala_morse|lpp|flebite|...
  origem_id          text,
  origem_ref         jsonb,                  -- snapshot congelado do contexto
  -- matriz de risco (probabilidade × gravidade)
  probabilidade      int,
  gravidade          int,
  risco_score        int,
  risco_faixa        text,                   -- baixo|moderado|alto|extremo
  -- notificação
  anonimo            boolean not null default false,
  notificado_por     text,                   -- nulo quando anônimo
  categoria          text,
  conselho           text,
  registro_conselho  text,
  notificacao_compulsoria boolean not null default false,  -- never event / óbito → ANVISA
  -- fluxo do núcleo
  status             text not null default 'nova',  -- nova|em_analise|classificada|em_tratamento|concluida
  exige_rca          boolean not null default false,
  corrige_id         uuid,
  motivo_correcao    text,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);
create index if not exists nsp_inc_status_idx on public.nsp_incidentes (status, criado_em desc);
create index if not exists nsp_inc_pront_idx  on public.nsp_incidentes (prontuario, criado_em desc);
create index if not exists nsp_inc_tipo_idx   on public.nsp_incidentes (tipo, criado_em desc);

create table if not exists public.nsp_incidente_eventos (
  id            uuid primary key default gen_random_uuid(),
  incidente_id  uuid not null,
  tipo          text not null,          -- triagem|classificacao|comentario|feedback|status|encaminhamento
  de_status     text,
  para_status   text,
  texto         text,
  usuario       text,
  categoria     text,
  criado_em     timestamptz not null default now()
);
create index if not exists nsp_inc_ev_idx on public.nsp_incidente_eventos (incidente_id, criado_em);

-- Verificação
select 'NSP: nsp_incidentes + nsp_incidente_eventos ok' as resultado;
