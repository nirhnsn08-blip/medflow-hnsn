-- ═══════════════════════════════════════════════════════════
-- NSP — Capacitações em segurança do paciente (Fase 2d)
--
-- Base: PNSP (Portaria 529/2013) e RDC 36/2013 — a educação permanente em
-- segurança é atribuição do NSP. Registro dos treinamentos da equipe: tema,
-- data, carga horária, facilitador, meta de segurança vinculada, participantes
-- e a próxima capacitação prevista (recorrência). Mostra a cobertura por meta
-- e cobra a recorrência vencida.
--
-- 1 tabela: nsp_capacitacoes (configuração/registro administrativo editável →
-- upsert por id na tela). Sem seed — a equipe lança os treinamentos.
--
-- Aditiva e idempotente. Rodar no SQL Editor — primeiro no DEMO, depois no
-- PRINCIPAL (HNSN).
-- ═══════════════════════════════════════════════════════════

create table if not exists public.nsp_capacitacoes (
  id             uuid primary key default gen_random_uuid(),
  tema           text    not null,
  meta           text,                    -- meta de segurança vinculada (nsp_meta_faixas.chave)
  data           date,                    -- data em que ocorreu/ocorrerá
  carga_horaria  numeric,                 -- horas
  facilitador    text,
  publico_alvo   text,
  participantes  integer,                 -- nº de participantes
  status         text    not null default 'planejado',  -- planejado | realizado | cancelado
  proxima_em     date,                    -- próxima capacitação prevista (recorrência)
  observacao     text,
  ativo          boolean not null default true,
  usuario        text,
  criado_em      timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists nsp_capacitacoes_data_idx on public.nsp_capacitacoes (data desc);
create index if not exists nsp_capacitacoes_meta_idx on public.nsp_capacitacoes (meta);

-- Verificação
select 'NSP: nsp_capacitacoes ok' as resultado;
