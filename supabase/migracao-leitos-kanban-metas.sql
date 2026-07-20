-- ============================================================
-- Valentrax — Giro de Leitos · Kanban de alta + Metas por setor + Motivo da espera
-- Rodar UMA vez no HNSN (Supabase → SQL Editor). Só ADICIONA colunas
-- (idempotente e reversível de fato — não apaga nem altera nada existente).
-- As tabelas já têm RLS/policies; colunas novas herdam as mesmas regras.
-- ============================================================

-- 1) KANBAN DE ALTA (alta segura) — pendências que travam a alta do paciente,
--    guardadas no próprio leito ocupado (JSON de chaves resolvidas/pendentes).
alter table public.leitos
  add column if not exists alta_pendencias text,     -- JSON: {"exame":true,"receita":false,...} (true = resolvido)
  add column if not exists alta_periodo    text;      -- previsão de saída no dia: manha | tarde | noite

-- 2) METAS POR SETOR — alvos para farol verde/vermelho nos relatórios.
alter table public.setores
  add column if not exists meta_ocupacao    int,       -- % ocupação alvo (ex.: 85)
  add column if not exists meta_permanencia numeric,   -- dias de permanência alvo (ex.: 5)
  add column if not exists meta_giro        numeric;   -- giro de leitos alvo no mês (ex.: 4.0)

-- 3) MOTIVO DA ESPERA NA FILA — categoriza por que o paciente aguarda leito.
alter table public.solicitacoes
  add column if not exists motivo_espera text;         -- sem_vaga | aguardando_limpeza | aguardando_exame | aguardando_familia | aguardando_transporte | regulacao | outro

-- Pronto. Nada mais a fazer.
