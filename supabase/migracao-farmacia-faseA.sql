-- ============================================================
-- Valentrax — Farmácia · Fase A (catálogo + estoque)
-- Rodar UMA vez no HNSN (Supabase → SQL Editor) ANTES de publicar o código.
-- Idempotente: pode rodar de novo sem quebrar nada.
-- ============================================================

-- ===== Catálogo de medicamentos =====
create table if not exists public.farm_medicamentos (
  id bigserial primary key,
  nome text not null,                    -- descrição/apresentação (ex.: "Dipirona 500mg comprimido")
  principio_ativo text,
  forma text,                            -- comprimido, ampola, frasco...
  concentracao text,                     -- 500 mg, 10 mg/mL...
  unidade text default 'unidade',        -- unidade de dispensação (comprimido, mL, ampola)
  controlado boolean default false,      -- Portaria 344/98 (psicotrópicos/entorpecentes)
  estoque_minimo numeric default 0,      -- ponto de ressuprimento
  ativo boolean default true,
  observacao text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists farm_medic_nome_idx on public.farm_medicamentos (lower(nome));
alter table public.farm_medicamentos enable row level security;
drop policy if exists farm_medic_select on public.farm_medicamentos;
drop policy if exists farm_medic_insert on public.farm_medicamentos;
drop policy if exists farm_medic_update on public.farm_medicamentos;
drop policy if exists farm_medic_delete on public.farm_medicamentos;
create policy farm_medic_select on public.farm_medicamentos for select to authenticated using (true);
create policy farm_medic_insert on public.farm_medicamentos for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_medic_update on public.farm_medicamentos for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_medic_delete on public.farm_medicamentos for delete to authenticated using (public.my_role() = 'adm_master');

-- ===== Saldo por lote (derivado dos movimentos — mantido pelo trigger) =====
create table if not exists public.farm_lotes (
  id bigserial primary key,
  medicamento_id bigint not null references public.farm_medicamentos(id) on delete cascade,
  lote text not null default '',
  validade date,
  quantidade numeric not null default 0,
  updated_at timestamptz default now()
);
create unique index if not exists farm_lotes_uq on public.farm_lotes (medicamento_id, lote);
alter table public.farm_lotes enable row level security;
drop policy if exists farm_lotes_select on public.farm_lotes;
create policy farm_lotes_select on public.farm_lotes for select to authenticated using (true);
-- escrita só pelo trigger (security definer); sem políticas de insert/update/delete direto

-- ===== Kardex: movimentos de estoque (append-only — imutável) =====
create table if not exists public.farm_movimentos (
  id bigserial primary key,
  medicamento_id bigint not null references public.farm_medicamentos(id) on delete cascade,
  lote_id bigint,                        -- preenchido pelo trigger
  lote text,
  validade date,
  tipo text not null,                    -- entrada | saida
  quantidade numeric not null check (quantidade > 0),
  motivo text,                           -- compra/nota, dispensação, perda/vencimento, ajuste...
  documento text,                        -- nº nota fiscal / requisição
  paciente_iniciais text, paciente_prontuario text,   -- p/ dispensação (Fase B)
  usuario text,
  created_at timestamptz default now()
);
create index if not exists farm_mov_medic_idx on public.farm_movimentos (medicamento_id, created_at desc);
alter table public.farm_movimentos enable row level security;
drop policy if exists farm_mov_select on public.farm_movimentos;
drop policy if exists farm_mov_insert on public.farm_movimentos;
create policy farm_mov_select on public.farm_movimentos for select to authenticated using (true);
create policy farm_mov_insert on public.farm_movimentos for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: kardex imutável

-- ===== Trigger: aplica o movimento no saldo do lote (cria o lote se necessário) =====
create or replace function public.farm_aplica_movimento()
returns trigger language plpgsql security definer as $$
declare
  v_lote_id bigint;
  v_lote text := coalesce(new.lote, '');
  v_saldo numeric;
begin
  select id, quantidade into v_lote_id, v_saldo from public.farm_lotes
    where medicamento_id = new.medicamento_id and lote = v_lote;
  if v_lote_id is null then
    insert into public.farm_lotes (medicamento_id, lote, validade, quantidade)
      values (new.medicamento_id, v_lote, new.validade, 0)
      returning id, quantidade into v_lote_id, v_saldo;
  end if;
  if new.tipo = 'saida' and v_saldo < new.quantidade then
    raise exception 'Estoque insuficiente no lote (disponível: %).', v_saldo;
  end if;
  if new.validade is not null then
    update public.farm_lotes set validade = new.validade where id = v_lote_id;
  end if;
  update public.farm_lotes
    set quantidade = quantidade + (case when new.tipo = 'entrada' then new.quantidade else -new.quantidade end),
        updated_at = now()
    where id = v_lote_id;
  new.lote_id := v_lote_id;
  new.lote := v_lote;
  return new;
end $$;
drop trigger if exists farm_movimento_trg on public.farm_movimentos;
create trigger farm_movimento_trg before insert on public.farm_movimentos
  for each row execute function public.farm_aplica_movimento();

-- Fim da Fase A da Farmácia.
