-- ═══════════════════════════════════════════════════════════
-- NSP — Indicadores automáticos + 6 Metas Internacionais (Fase 2c)
--
-- Base: PNSP (Portaria 529/2013) e as 6 Metas Internacionais de Segurança do
-- Paciente (OMS/JCI). O núcleo passa a MONITORAR com farol (verde/amarelo/
-- vermelho): os indicadores automáticos saem dos módulos que já existem (LPP
-- adquirida do POA, quedas e erro de medicação dos incidentes — sem digitação);
-- as metas que dependem de observação (higiene das mãos, comunicação, cirurgia
-- segura) vêm de auditoria periódica.
--
-- 2 tabelas:
--   • nsp_meta_faixas   — os ALVOS de cada meta, EDITÁVEIS pelo ADM Master
--                         ("em validação" até validar). É configuração, não
--                         registro clínico → upsert por `chave`.
--   • nsp_meta_medicoes — as medições de auditoria (numerador/denominador →
--                         adesão %). Registro append-only: correção = novo
--                         registro com `corrige_id`, autoria congelada.
--
-- Aditiva e idempotente. Rodar no SQL Editor — primeiro no DEMO, depois no
-- PRINCIPAL (HNSN). ON CONFLICT DO NOTHING: reexecutar não sobrescreve edições.
-- ═══════════════════════════════════════════════════════════

-- Alvos das metas (editáveis pelo ADM Master; nascem "em validação").
create table if not exists public.nsp_meta_faixas (
  chave          text primary key,      -- slug conhecido pelo motor (src/clinico/nsp.js -> METAS)
  ordem          int  not null default 0,
  rotulo         text not null,
  sentido        text not null default 'menor_melhor',  -- menor_melhor | maior_melhor
  unidade        text,                   -- '%', 'casos'
  corte_verde    numeric,                -- alcança a meta
  corte_amarelo  numeric,                -- zona de alerta (fora disso = vermelho)
  fonte          text not null default 'auto',  -- auto (dos módulos) | auditoria (observação)
  ativo          boolean     not null default true,
  validado       boolean     not null default false,
  usuario        text,
  updated_at     timestamptz not null default now()
);

-- Seed do rascunho (não sobrescreve edições — ON CONFLICT DO NOTHING).
insert into public.nsp_meta_faixas
  (chave, ordem, rotulo, sentido, unidade, corte_verde, corte_amarelo, fonte)
values
  ('identificacao',   1, 'Identificar corretamente o paciente',                'menor_melhor', 'casos', 0,  2,  'auto'),
  ('comunicacao',     2, 'Comunicação efetiva',                                'maior_melhor', '%',     90, 75, 'auditoria'),
  ('medicamentos',    3, 'Segurança dos medicamentos de alta vigilância',      'menor_melhor', 'casos', 0,  2,  'auto'),
  ('cirurgia_segura', 4, 'Cirurgia segura (lado/paciente/procedimento certos)','maior_melhor', '%',     95, 85, 'auditoria'),
  ('higiene_maos',    5, 'Higiene das mãos',                                   'maior_melhor', '%',     80, 60, 'auditoria'),
  ('quedas_lpp',      6, 'Reduzir quedas e lesões por pressão',                'menor_melhor', 'casos', 1,  4,  'auto')
on conflict (chave) do nothing;

-- Medições de auditoria (append-only). Adesão = numerador ÷ denominador.
create table if not exists public.nsp_meta_medicoes (
  id                uuid primary key default gen_random_uuid(),
  meta              text not null,          -- chave da meta (nsp_meta_faixas.chave)
  competencia       date not null,          -- 1º dia do mês de referência
  numerador         integer not null default 0,   -- ex.: oportunidades COM adesão
  denominador       integer not null default 0,   -- ex.: oportunidades observadas
  observacao        text,
  registrado_por    text,                   -- autoria congelada
  categoria         text,
  conselho          text,
  registro_conselho text,
  corrige_id        uuid,                   -- correção = novo registro apontando o anterior
  motivo_correcao   text,
  criado_em         timestamptz not null default now()
);
create index if not exists nsp_meta_medicoes_idx on public.nsp_meta_medicoes (meta, competencia desc);

-- Verificação
select 'NSP: nsp_meta_faixas (' || (select count(*) from public.nsp_meta_faixas) || ') + nsp_meta_medicoes ok' as resultado;
