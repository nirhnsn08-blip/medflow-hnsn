-- ═══════════════════════════════════════════════════════════
-- MedFlow HNSN — Schema do banco (Supabase / PostgreSQL)
-- Execute UMA vez no Supabase → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════

-- Tabela de atendimentos
create table if not exists atendimentos (
  id            bigserial primary key,
  data          date not null,
  especialidade text not null,
  primeiras     int default 0,
  retornos      int default 0,
  ofertadas     int default 0,
  realizadas    int default 0,
  livres        int default 0,
  emergencias   int default 0,
  faltas        int default 0,
  usuario       text,
  created_at    timestamptz default now(),
  unique (data, especialidade)
);

-- Tabela de auditoria
create table if not exists auditoria (
  id      bigserial primary key,
  ts      timestamptz default now(),
  usuario text,
  acao    text,
  alvo    text
);

-- Row Level Security.
-- Projeto interno: liberamos acesso total via chave anon.
-- (Se um dia quiser restringir por usuário autenticado, troque as policies.)
alter table atendimentos enable row level security;
alter table auditoria    enable row level security;

drop policy if exists "allow all" on atendimentos;
drop policy if exists "allow all" on auditoria;

create policy "allow all" on atendimentos for all using (true) with check (true);
create policy "allow all" on auditoria    for all using (true) with check (true);
