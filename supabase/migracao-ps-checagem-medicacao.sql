-- ═══════════════════════════════════════════════════════════
-- PRONTO-SOCORRO — checagem de medicação administrada
--
-- Hoje a cadeia do medicamento termina em "a farmácia dispensou"
-- (farm_movimentos, baixa de estoque). Isso prova que o remédio SAIU DA
-- FARMÁCIA, não que ele ENTROU NO PACIENTE. Falta o registro de quem
-- administrou, a que horas, e o motivo quando a dose não foi dada.
--
-- Registro clínico APPEND-ONLY: sem update, sem delete (igual a
-- ps_registros/ps_sinais/ps_prescricao_itens).
-- Idempotente. Rodar no SQL Editor do HNSN.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.ps_administracoes (
  id bigserial primary key,
  -- cascade: apagar o episódio (ação de adm_master, uso de limpeza de teste)
  -- leva junto a checagem; linha órfã apontando para episódio inexistente
  -- seria pior — não é editável nem auditável.
  atendimento_id bigint not null references public.ps_atendimentos(id) on delete cascade,
  prescricao_item_id bigint references public.ps_prescricao_itens(id) on delete set null,
  medicamento_id bigint,
  medicamento_nome text not null,
  dose text,
  via text,
  status text not null default 'administrado',  -- administrado | nao_administrado
  motivo text,                                  -- preenchido quando nao_administrado
  observacao text,
  categoria text,                               -- enfermagem | tecnico | medica | outro
  administrado_em timestamptz not null default now(),
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists ps_adm_atend_idx on public.ps_administracoes (atendimento_id, administrado_em desc);
create index if not exists ps_adm_item_idx  on public.ps_administracoes (prescricao_item_id);

alter table public.ps_administracoes enable row level security;
drop policy if exists ps_adm_select on public.ps_administracoes;
drop policy if exists ps_adm_insert on public.ps_administracoes;
create policy ps_adm_select on public.ps_administracoes for select to authenticated using (true);
create policy ps_adm_insert on public.ps_administracoes for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável

-- Verificação
select 'checagem de medicação ok' as resultado
 where exists (select 1 from information_schema.tables
                where table_schema = 'public' and table_name = 'ps_administracoes')
   and exists (select 1 from information_schema.columns
                where table_name = 'ps_administracoes' and column_name = 'administrado_em');
