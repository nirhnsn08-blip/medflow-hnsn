-- ═══════════════════════════════════════════════════════════
-- ENFERMAGEM — Escalas de risco + Lesão por Pressão (Tier 1, Fase 1a)
--
-- Registra as escalas padronizadas de enfermagem à beira-leito e as lesões por
-- pressão, dentro do PEP / Paciente 360. Escalas cobertas: Braden, Morse, dor,
-- flebite, Fugulin (grau de dependência — só classificação nesta fase), Glasgow
-- e RASS. Apoio à decisão + segurança do paciente — a conduta é da enfermeira.
--
-- 3 tabelas:
--   • enf_escalas          — cada aplicação de escala (append-only).
--   • enf_lesao_pressao    — LPP com marcador PRESENTE NA ADMISSÃO × ADQUIRIDA
--                            (POA), para o indicador limpo de LPP adquirida.
--   • enf_escala_faixas    — cortes de classificação por escala, EDITÁVEIS pelo
--                            ADM Master; cada faixa nasce `validado=false`
--                            ("em validação"), no mesmo padrão da triagem.
--
-- ⚠️ Os cortes semeados são RASCUNHO (valores usuais das escalas). A equipe
-- valida e ajusta na tela. O motor (src/clinico/escalas-enfermagem.js) só
-- soma/classifica; os números moram aqui.
--
-- Registro clínico é IMUTÁVEL: enf_escalas e enf_lesao_pressao são append-only
-- (correção = novo registro). Aditiva e idempotente. Rodar no SQL Editor —
-- DEMO primeiro, depois HNSN. Seed com ON CONFLICT DO NOTHING.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.enf_escalas (
  id             uuid primary key default gen_random_uuid(),
  prontuario     text not null,
  episodio_id    uuid,                        -- internação (pep_episodios); escopo do PEP
  tipo           text not null,              -- braden|morse|dor|flebite|fugulin|glasgow|rass
  itens          jsonb not null default '{}'::jsonb,  -- respostas das subescalas
  score          int,                         -- soma (braden/morse/fugulin/glasgow) ou valor (dor/rass)
  classificacao  text,                        -- rótulo da faixa resultante
  nivel          text,                        -- semáforo: verde|amarelo|laranja|vermelho
  sitio          text,                        -- flebite: identificação do acesso venoso
  aplicado_por   text,                        -- nome congelado de quem aplicou
  categoria      text,                        -- categoria profissional (papeis.js)
  conselho          text,                      -- autoria congelada (COFEN 754/2024)
  registro_conselho text,
  aferido_em     timestamptz not null default now(),
  criado_em      timestamptz not null default now()
);
create index if not exists enf_escalas_pront_idx on public.enf_escalas (prontuario, tipo, aferido_em desc);

create table if not exists public.enf_lesao_pressao (
  id                 uuid primary key default gen_random_uuid(),
  prontuario         text not null,
  episodio_id        uuid,                              -- internação (pep_episodios)
  presente_admissao  boolean not null default false,  -- POA: veio COM a lesão?
  local              text,                              -- região corporal
  estagio            text,                              -- 1|2|3|4|nao_classificavel|tissular_profunda
  medidas            jsonb,                             -- comprimento/largura/profundidade (cm)
  descricao          text,
  status             text not null default 'ativa',     -- ativa|regressao|cicatrizada
  registrado_por     text,                               -- nome congelado de quem notificou
  categoria          text,
  conselho           text,                                -- autoria congelada (COFEN 754/2024)
  registro_conselho  text,
  criado_em          timestamptz not null default now()
);
create index if not exists enf_lpp_pront_idx on public.enf_lesao_pressao (prontuario, criado_em desc);

create table if not exists public.enf_escala_faixas (
  id              text primary key,           -- slug: braden_alto, morse_moderado, ...
  tipo            text not null,
  ordem           int  not null default 0,
  faixa_min       int,                          -- score mínimo (inclusive); null = sem piso
  faixa_max       int,                          -- score máximo (inclusive); null = sem teto
  rotulo          text not null,
  nivel           text not null,                -- verde|amarelo|laranja|vermelho (mapa de risco)
  reavaliar_horas int,                          -- gatilho de reavaliação (h); null = sem gatilho
  validado        boolean     not null default false,
  ativo           boolean     not null default true,
  usuario         text,
  updated_at      timestamptz not null default now()
);

-- Seed dos cortes (RASCUNHO — editável e "em validação"). ON CONFLICT DO NOTHING.
insert into public.enf_escala_faixas (id, tipo, ordem, faixa_min, faixa_max, rotulo, nivel, reavaliar_horas) values
  -- Braden (6–23, menor = mais risco)
  ('braden_muito_alto','braden',0,null, 9,'Risco muito alto','vermelho',24),
  ('braden_alto',      'braden',1,  10,12,'Risco alto',      'laranja', 24),
  ('braden_moderado',  'braden',2,  13,14,'Risco moderado',  'amarelo', 48),
  ('braden_baixo',     'braden',3,  15,18,'Risco baixo',     'verde',   72),
  ('braden_sem',       'braden',4,  19,null,'Sem risco',     'verde',  168),
  -- Morse (0–125, maior = mais risco de queda)
  ('morse_baixo',   'morse',0,null,24,'Risco baixo',   'verde',  48),
  ('morse_moderado','morse',1,  25,44,'Risco moderado','amarelo',24),
  ('morse_alto',    'morse',2,  45,null,'Risco alto',  'laranja',12),
  -- Glasgow (3–15, menor = pior)
  ('glasgow_grave',   'glasgow',0,null, 8,'Grave',   'vermelho',1),
  ('glasgow_moderado','glasgow',1,   9,12,'Moderado','laranja', 2),
  ('glasgow_leve',    'glasgow',2,  13,15,'Leve',    'verde',   8),
  -- RASS (−5 a +4)
  ('rass_agitado',      'rass',0,  2, 4,'Agitado',         'laranja', 2),
  ('rass_inquieto',     'rass',1,  1, 1,'Inquieto',        'amarelo', 4),
  ('rass_calmo',        'rass',2,  0, 0,'Alerta e calmo',  'verde',   8),
  ('rass_sedacao_leve', 'rass',3, -2,-1,'Sedação leve',    'verde',   8),
  ('rass_sedacao_prof', 'rass',4, -4,-3,'Sedação profunda','laranja', 2),
  ('rass_nao_desperta', 'rass',5, -5,-5,'Não desperta',    'vermelho',1),
  -- Dor (0–10)
  ('dor_sem',     'dor',0,0, 0,'Sem dor',  'verde',  null),
  ('dor_leve',    'dor',1,1, 3,'Leve',     'verde',  4),
  ('dor_moderada','dor',2,4, 6,'Moderada', 'amarelo',1),
  ('dor_intensa', 'dor',3,7,10,'Intensa',  'laranja',1),
  -- Flebite (grau 0–4, escala INS)
  ('flebite_0','flebite',0,0,0,'Grau 0 — sem sinais',    'verde',  null),
  ('flebite_1','flebite',1,1,1,'Grau 1',                 'amarelo',4),
  ('flebite_2','flebite',2,2,2,'Grau 2 — trocar acesso', 'laranja',1),
  ('flebite_3','flebite',3,3,3,'Grau 3',                 'vermelho',1),
  ('flebite_4','flebite',4,4,4,'Grau 4',                 'vermelho',1),
  -- Fugulin (grau de dependência → categoria de cuidado; só classificação nesta fase)
  ('fugulin_minimos',      'fugulin',0,null,17,'Cuidados mínimos',      'verde',  24),
  ('fugulin_intermediarios','fugulin',1, 18,22,'Cuidados intermediários','verde', 24),
  ('fugulin_alta_dep',     'fugulin',2, 23,27,'Alta dependência',      'amarelo',24),
  ('fugulin_semi_intensivo','fugulin',3, 28,31,'Semi-intensivos',      'laranja',24),
  ('fugulin_intensivo',    'fugulin',4, 32,null,'Cuidados intensivos',  'vermelho',24)
on conflict (id) do nothing;

-- Verificação
select 'enf: escalas/lpp/faixas ok — ' || count(*) || ' cortes semeados' as resultado
  from public.enf_escala_faixas;
