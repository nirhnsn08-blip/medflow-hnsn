-- ═══════════════════════════════════════════════════════════
-- PROTOCOLOS CLÍNICOS GERENCIADOS (Tier 1 — Fase 3a: Sepse)
--
-- Linhas de cuidado tempo-dependentes ("tempo é tecido"): sepse, IAM, AVC, TEV.
-- Cada protocolo = GATILHO (acende do que já existe: NEWS/triagem) → BUNDLE com
-- RELÓGIO (passos com alvo em minutos) → INDICADORES porta→ação, POR SETOR.
--
-- Modelo (refino da Laura: "cada setor assistencial tem o seu protocolo"):
--   • prot_catalogo     — TEMPLATE clínico comum, editável ("em validação"). A
--                         Sepse é a Sepse (bundle ILAS 1h); passos/alvos ficam em
--                         jsonb para o ADM Master ajustar na tela sem migração.
--   • prot_setor        — INSTÂNCIA por setor: cada setor liga o seu protocolo e
--                         ajusta o que é dele (janela, alvos, responsável).
--   • prot_ativacoes    — ACIONAMENTO por paciente/setor (append-only), com os
--                         carimbos de tempo. O relógio corre de acionado_em.
--   • prot_bundle_itens — PASSOS executados/checados de uma ativação (append-only);
--                         feito_em de cada passo alimenta os KPIs porta→ação.
--
-- DIFERENCIAL: o gatilho acende sozinho (NEWS ≥ 5 com foco infeccioso) e cutuca
-- onde o paciente está — não espera alguém "abrir" o protocolo.
--
-- Aditiva e idempotente. Rodar no SQL Editor — DEMO primeiro, depois HNSN.
-- ON CONFLICT DO NOTHING: reexecutar não sobrescreve edições da equipe.
-- ═══════════════════════════════════════════════════════════

-- 1) TEMPLATE clínico comum (editável, "em validação")
create table if not exists public.prot_catalogo (
  id           uuid primary key default gen_random_uuid(),
  chave        text not null,             -- slug do protocolo (sepse|iam|avc|tev) — seed idempotente
  titulo       text not null,
  categoria    text,                      -- sepse|cardiologico|neurologico|tromboembolismo
  gatilho      jsonb,                     -- ex.: {"tipo":"news","min":5,"obs":"..."}
  passos       jsonb not null default '[]'::jsonb,  -- [{chave,rotulo,alvo_min,ordem,critico}]
  janela_min   int,                       -- alvo total do bundle (ex.: 60 = pacote de 1h)
  referencia   text,                      -- diretriz / fonte (ILAS, SSC, AHA…)
  status       text not null default 'em_validacao',  -- em_validacao | vigente | suspenso
  ativo        boolean not null default true,
  validado     boolean not null default false,
  usuario      text,
  criado_em    timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists prot_catalogo_chave_idx on public.prot_catalogo (chave);

-- 2) INSTÂNCIA por setor assistencial (cada setor tem o seu)
create table if not exists public.prot_setor (
  id             uuid primary key default gen_random_uuid(),
  setor          text not null,           -- setores.nome (setor assistencial)
  protocolo      text not null,           -- prot_catalogo.chave
  ativo          boolean not null default true,
  janela_min     int,                     -- override do alvo total (null = usa o do template)
  passos_over    jsonb,                   -- override dos alvos por passo (null = usa o template)
  responsavel    text,                    -- quem responde pelo protocolo naquele setor
  validado       boolean not null default false,   -- "em validação" até a equipe do setor confirmar
  usuario        text,
  criado_em      timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists prot_setor_uk on public.prot_setor (setor, protocolo);

-- 3) ACIONAMENTO por paciente/setor (append-only — o relógio corre daqui)
create table if not exists public.prot_ativacoes (
  id            uuid primary key default gen_random_uuid(),
  numero        bigint generated always as identity,  -- número humano (PROT-<numero>)
  protocolo     text not null,            -- prot_catalogo.chave
  setor         text,                     -- onde o paciente está
  prontuario    text,
  episodio_id   uuid,
  paciente_nome text,                     -- iniciais / rótulo curto
  leito         text,
  gatilho_ref   jsonb,                    -- snapshot congelado do gatilho (ex.: {"news":6,"fc":118,...})
  acionado_por  text,
  acionado_em   timestamptz not null default now(),   -- t0 do relógio
  status        text not null default 'ativa',        -- ativa | concluida | cancelada | expirada
  encerrado_em  timestamptz,
  desfecho      text,                     -- confirmado | descartado | transferido | obito
  motivo        text,
  criado_em     timestamptz not null default now()
);
create index if not exists prot_ativ_status_idx on public.prot_ativacoes (status, acionado_em desc);
create index if not exists prot_ativ_setor_idx  on public.prot_ativacoes (setor, acionado_em desc);
create index if not exists prot_ativ_pront_idx  on public.prot_ativacoes (prontuario, acionado_em desc);

-- 4) PASSOS do bundle executados/checados (append-only)
create table if not exists public.prot_bundle_itens (
  id           uuid primary key default gen_random_uuid(),
  ativacao_id  uuid not null,
  passo        text not null,             -- prot_catalogo.passos[].chave (lactato|hemocultura|atb|...)
  rotulo       text,
  feito        boolean not null default true,
  nao_aplica   boolean not null default false,   -- justificadamente não se aplica
  valor        text,                      -- ex.: valor do lactato, nome do ATB
  obs          text,
  feito_por    text,
  feito_em     timestamptz not null default now(),
  criado_em    timestamptz not null default now()
);
create index if not exists prot_item_ativ_idx on public.prot_bundle_itens (ativacao_id, feito_em);

-- ── Seed do template da Sepse (rascunho "em validação" — ILAS / Surviving Sepsis) ──
-- Pacote de 1 hora. Passos e alvos são editáveis na tela pelo ADM Master.
insert into public.prot_catalogo (chave, titulo, categoria, gatilho, passos, janela_min, referencia, status) values
  ('sepse',
   'Sepse e choque séptico — pacote de 1 hora',
   'sepse',
   '{"tipo":"news","min":5,"obs":"NEWS >= 5 com suspeita de foco infeccioso"}'::jsonb,
   '[
      {"chave":"lactato",     "rotulo":"Coletar lactato sérico",                                  "alvo_min":30, "ordem":1, "critico":true},
      {"chave":"hemocultura", "rotulo":"Coletar 2 hemoculturas ANTES do antibiótico",             "alvo_min":45, "ordem":2, "critico":true},
      {"chave":"atb",         "rotulo":"Antibiótico de amplo espectro EV",                        "alvo_min":60, "ordem":3, "critico":true},
      {"chave":"cristaloide", "rotulo":"Cristaloide 30 mL/kg se hipotensão ou lactato >= 4",      "alvo_min":60, "ordem":4, "critico":true},
      {"chave":"vasopressor", "rotulo":"Vasopressor se PAM < 65 após volume",                     "alvo_min":60, "ordem":5, "critico":false},
      {"chave":"reavaliar",   "rotulo":"Reavaliar lactato e perfusão",                            "alvo_min":120,"ordem":6, "critico":false}
    ]'::jsonb,
   60,
   'ILAS (Instituto Latino-Americano de Sepse) / Surviving Sepsis Campaign',
   'em_validacao')
on conflict (chave) do nothing;

-- Verificação
select 'PROTOCOLOS: prot_catalogo + prot_setor + prot_ativacoes + prot_bundle_itens ok — '
       || (select count(*) from public.prot_catalogo) || ' template(s)' as resultado;
