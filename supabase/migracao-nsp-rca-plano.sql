-- ═══════════════════════════════════════════════════════════
-- NSP — Análise de causa raiz (RCA) + Plano de ação (Fase 2b)
--
-- Base: RDC 36/2013 (ANVISA), art. 8º — o NSP investiga os incidentes e
-- monta o plano de ação; Guia de Análise de Incidentes da ANVISA (5 Porquês,
-- Ishikawa) e Protocolo de Londres (fatores contribuintes).
--
-- Fecha o ciclo do evento: o incidente que exige análise (evento adverso,
-- never event, dano moderado+) ganha a RCA, e a RCA gera o plano de ação
-- (5W2H) que o sistema COBRA até fechar.
--
-- 2 tabelas:
--   • nsp_rca    — a análise de causa raiz de um incidente (5 porquês,
--                  Ishikawa, fatores contribuintes, barreiras, causa raiz).
--   • nsp_acoes  — as ações do plano (5W2H), com status e prazo. `numero`
--                  é o número humano da ação.
--
-- Registro de segurança é append-only (correção = novo registro com
-- corrige_id). `status` da ação é estado de fluxo (pode ser atualizado até
-- concluir). Aditiva e idempotente. DEMO primeiro, depois HNSN.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.nsp_rca (
  id                 uuid primary key default gen_random_uuid(),
  incidente_id       uuid not null,
  metodo             text,                   -- 5_porques | ishikawa | ambos
  porques            jsonb not null default '[]'::jsonb,  -- cadeia dos 5 porquês
  ishikawa           jsonb not null default '{}'::jsonb,  -- { categoria: [causas] }
  fatores            jsonb not null default '[]'::jsonb,  -- fatores contribuintes (London)
  barreiras          jsonb not null default '[]'::jsonb,  -- barreiras que falharam / faltaram
  causa_raiz         text,
  conclusao          text,
  status             text not null default 'em_andamento',  -- em_andamento | concluida
  registrado_por     text,                   -- autoria congelada
  categoria          text,
  conselho           text,
  registro_conselho  text,
  corrige_id         uuid,
  motivo_correcao    text,
  criado_em          timestamptz not null default now()
);
create index if not exists nsp_rca_inc_idx on public.nsp_rca (incidente_id, criado_em desc);

create table if not exists public.nsp_acoes (
  id                 uuid primary key default gen_random_uuid(),
  numero             bigint generated always as identity,  -- número humano da ação
  incidente_id       uuid not null,
  rca_id             uuid,
  o_que              text not null,          -- What: a ação
  por_que            text,                   -- Why: a razão
  responsavel        text,                   -- Who
  prazo              date,                   -- When
  onde               text,                   -- Where
  como               text,                   -- How
  quanto             text,                   -- How much (custo/recurso)
  status             text not null default 'pendente',  -- pendente | em_andamento | concluida | cancelada
  concluida_em       timestamptz,
  evidencia          text,                   -- comprovação do fechamento
  registrado_por     text,                   -- autoria congelada
  categoria          text,
  conselho           text,
  registro_conselho  text,
  corrige_id         uuid,
  motivo_correcao    text,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);
create index if not exists nsp_acoes_inc_idx    on public.nsp_acoes (incidente_id, criado_em desc);
create index if not exists nsp_acoes_status_idx on public.nsp_acoes (status, prazo);

-- Verificação
select 'NSP: nsp_rca + nsp_acoes ok' as resultado;
