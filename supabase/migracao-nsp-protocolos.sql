-- ═══════════════════════════════════════════════════════════
-- NSP — Protocolos gerenciados de segurança (Fase 2d)
--
-- Base: PNSP (Portaria 529/2013) e RDC 36/2013. Os 6 protocolos básicos de
-- segurança do paciente (identificação, cirurgia segura, higiene das mãos,
-- prevenção de quedas, prevenção de LPP, segurança medicamentosa) geridos como
-- DOCUMENTOS: versão, responsável, data de revisão e conteúdo. Cada protocolo
-- se liga a uma das 6 Metas (Fase 2c); o sistema cobra a revisão vencida.
--
-- 1 tabela: nsp_protocolos (configuração editável, não registro clínico → upsert
-- por id na tela). Nasce "em validação". `chave` é o slug só dos 6 básicos do
-- seed, para o seed ser idempotente; protocolos criados na tela têm chave nula.
--
-- Aditiva e idempotente. Rodar no SQL Editor — primeiro no DEMO, depois no
-- PRINCIPAL (HNSN). ON CONFLICT DO NOTHING: reexecutar não sobrescreve edições.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.nsp_protocolos (
  id            uuid primary key default gen_random_uuid(),
  chave         text,                    -- slug do protocolo básico (seed idempotente); null nos criados na tela
  meta          text,                    -- meta de segurança vinculada (nsp_meta_faixas.chave)
  titulo        text    not null,
  versao        text,                    -- ex.: "1.0"
  responsavel   text,
  conteudo      text,                    -- passos / POP
  referencia    text,                    -- diretriz / fonte
  revisao_em    date,                    -- data da próxima revisão prevista
  status        text    not null default 'em_revisao',  -- vigente | em_revisao | suspenso
  ativo         boolean not null default true,
  validado      boolean not null default false,
  usuario       text,
  criado_em     timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists nsp_protocolos_chave_idx on public.nsp_protocolos (chave);
create index        if not exists nsp_protocolos_meta_idx  on public.nsp_protocolos (meta);

-- Seed dos 6 básicos (rascunho "em validação" — não sobrescreve edições).
insert into public.nsp_protocolos (chave, meta, titulo, versao, status) values
  ('ident',      'identificacao',   'Protocolo de identificação do paciente',                     '1.0', 'em_revisao'),
  ('cir_segura', 'cirurgia_segura', 'Protocolo de cirurgia segura (checklist OMS)',               '1.0', 'em_revisao'),
  ('higiene',    'higiene_maos',    'Protocolo de higiene das mãos',                              '1.0', 'em_revisao'),
  ('quedas',     'quedas_lpp',      'Protocolo de prevenção de quedas',                           '1.0', 'em_revisao'),
  ('lpp',        'quedas_lpp',      'Protocolo de prevenção de lesão por pressão',                '1.0', 'em_revisao'),
  ('medicam',    'medicamentos',    'Protocolo de segurança na prescrição e uso de medicamentos', '1.0', 'em_revisao')
on conflict (chave) do nothing;

-- Verificação
select 'NSP: nsp_protocolos ok — ' || count(*) || ' protocolos' as resultado from public.nsp_protocolos;

-- Toda migração termina se anotando (ver docs/MODELO-DE-TRABALHO.md §6).
insert into public.migracoes_aplicadas (arquivo)
values ('migracao-nsp-protocolos.sql') on conflict do nothing;
