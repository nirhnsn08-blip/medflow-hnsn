-- ============================================================
-- Valentrax — Farmácia · Fase B (prescrição estruturada + dispensação)
-- Rodar UMA vez no HNSN (Supabase → SQL Editor), DEPOIS da Fase A.
-- Idempotente: pode rodar de novo sem quebrar nada.
-- ============================================================

-- ===== Itens estruturados da prescrição do PS (imutável) =====
create table if not exists public.ps_prescricao_itens (
  id bigserial primary key,
  atendimento_id bigint not null,        -- ps_atendimentos.id
  registro_id bigint,                    -- ps_registros.id (a prescrição assinada)
  medicamento_id bigint,                 -- farm_medicamentos.id (null p/ item livre)
  medicamento_nome text not null,        -- snapshot do nome/apresentação
  unidade text,
  dose text,                             -- posologia (ex.: "1 comp 8/8h")
  via text,                              -- VO, IV, IM, SC, inalatória...
  quantidade numeric,                    -- quantidade a dispensar
  usuario text,
  created_at timestamptz default now()
);
create index if not exists ps_presc_itens_at_idx on public.ps_prescricao_itens (atendimento_id);
alter table public.ps_prescricao_itens enable row level security;
drop policy if exists ps_presc_itens_select on public.ps_prescricao_itens;
drop policy if exists ps_presc_itens_insert on public.ps_prescricao_itens;
create policy ps_presc_itens_select on public.ps_prescricao_itens for select to authenticated using (true);
create policy ps_presc_itens_insert on public.ps_prescricao_itens for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável

-- ===== Vínculos da dispensação no kardex de estoque =====
alter table public.farm_movimentos add column if not exists atendimento_id bigint;
alter table public.farm_movimentos add column if not exists prescricao_item_id bigint;
alter table public.farm_movimentos add column if not exists setor text;
create index if not exists farm_mov_presc_idx on public.farm_movimentos (prescricao_item_id);
create index if not exists farm_mov_atend_idx on public.farm_movimentos (atendimento_id);

-- Fim da Fase B da Farmácia.
