-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS (Estoque & Compras) — Fase A
-- Catálogo de materiais + estoque por lote/validade (kardex imutável) + fornecedores
-- Rodar no SQL Editor do Supabase do HNSN. Idempotente (pode rodar de novo sem quebrar).
-- ═══════════════════════════════════════════════════════════

-- Fornecedores (usados nas entradas; base das compras da Fase C)
create table if not exists public.sup_fornecedores (
  id bigserial primary key,
  nome text not null,                    -- razão social / nome fantasia
  cnpj text,
  contato text,                          -- pessoa de contato
  telefone text,
  email text,
  categorias text,                       -- o que fornece (texto livre: "material hospitalar, EPI")
  observacao text,
  ativo boolean default true,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists sup_forn_nome_idx on public.sup_fornecedores (lower(nome));
alter table public.sup_fornecedores enable row level security;
drop policy if exists sup_forn_select on public.sup_fornecedores;
drop policy if exists sup_forn_insert on public.sup_fornecedores;
drop policy if exists sup_forn_update on public.sup_fornecedores;
drop policy if exists sup_forn_delete on public.sup_fornecedores;
create policy sup_forn_select on public.sup_fornecedores for select to authenticated using (true);
create policy sup_forn_insert on public.sup_fornecedores for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_forn_update on public.sup_fornecedores for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_forn_delete on public.sup_fornecedores for delete to authenticated using (public.my_role() = 'adm_master');

-- Catálogo de materiais e insumos (almoxarifado)
create table if not exists public.sup_itens (
  id bigserial primary key,
  nome text not null,                    -- descrição (ex.: "Luva de procedimento M — cx 100")
  categoria text,                        -- material médico-hospitalar, higiene, EPI, escritório...
  unidade text default 'unidade',        -- unidade de controle (unidade, caixa, pacote, litro...)
  estoque_minimo numeric default 0,      -- ponto de ressuprimento
  custo_unitario numeric,                -- R$ por unidade de controle (para BI)
  ativo boolean default true,
  observacao text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists sup_itens_nome_idx on public.sup_itens (lower(nome));
alter table public.sup_itens enable row level security;
drop policy if exists sup_itens_select on public.sup_itens;
drop policy if exists sup_itens_insert on public.sup_itens;
drop policy if exists sup_itens_update on public.sup_itens;
drop policy if exists sup_itens_delete on public.sup_itens;
create policy sup_itens_select on public.sup_itens for select to authenticated using (true);
create policy sup_itens_insert on public.sup_itens for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_itens_update on public.sup_itens for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_itens_delete on public.sup_itens for delete to authenticated using (public.my_role() = 'adm_master');

-- Saldo por lote (derivado dos movimentos — mantido pelo trigger)
create table if not exists public.sup_lotes (
  id bigserial primary key,
  item_id bigint not null references public.sup_itens(id) on delete cascade,
  lote text not null default '',
  validade date,
  quantidade numeric not null default 0,
  updated_at timestamptz default now()
);
create unique index if not exists sup_lotes_uq on public.sup_lotes (item_id, lote);
alter table public.sup_lotes enable row level security;
drop policy if exists sup_lotes_select on public.sup_lotes;
create policy sup_lotes_select on public.sup_lotes for select to authenticated using (true);
-- escrita só pelo trigger (security definer); sem políticas de insert/update/delete direto

-- Kardex: movimentos de estoque (append-only — imutável)
create table if not exists public.sup_movimentos (
  id bigserial primary key,
  item_id bigint not null references public.sup_itens(id) on delete cascade,
  lote_id bigint,                        -- preenchido pelo trigger
  lote text,
  validade date,
  tipo text not null,                    -- entrada | saida
  quantidade numeric not null check (quantidade > 0),
  motivo text,                           -- compra/nota, consumo do setor, perda, ajuste...
  documento text,                        -- nº nota fiscal / requisição
  fornecedor_id bigint references public.sup_fornecedores(id) on delete set null,
  setor text,                            -- destino do consumo (posto, centro cirúrgico...)
  usuario text,
  created_at timestamptz default now()
);
create index if not exists sup_mov_item_idx on public.sup_movimentos (item_id, created_at desc);
create index if not exists sup_mov_forn_idx on public.sup_movimentos (fornecedor_id);
alter table public.sup_movimentos enable row level security;
drop policy if exists sup_mov_select on public.sup_movimentos;
drop policy if exists sup_mov_insert on public.sup_movimentos;
create policy sup_mov_select on public.sup_movimentos for select to authenticated using (true);
create policy sup_mov_insert on public.sup_movimentos for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: kardex imutável

-- Trigger: aplica o movimento no saldo do lote (cria o lote se necessário)
create or replace function public.sup_aplica_movimento()
returns trigger language plpgsql security definer as $$
declare
  v_lote_id bigint;
  v_lote text := coalesce(new.lote, '');
  v_saldo numeric;
begin
  select id, quantidade into v_lote_id, v_saldo from public.sup_lotes
    where item_id = new.item_id and lote = v_lote;
  if v_lote_id is null then
    insert into public.sup_lotes (item_id, lote, validade, quantidade)
      values (new.item_id, v_lote, new.validade, 0)
      returning id, quantidade into v_lote_id, v_saldo;
  end if;
  if new.tipo = 'saida' and v_saldo < new.quantidade then
    raise exception 'Estoque insuficiente no lote (disponível: %).', v_saldo;
  end if;
  if new.validade is not null then
    update public.sup_lotes set validade = new.validade where id = v_lote_id;
  end if;
  update public.sup_lotes
    set quantidade = quantidade + (case when new.tipo = 'entrada' then new.quantidade else -new.quantidade end),
        updated_at = now()
    where id = v_lote_id;
  new.lote_id := v_lote_id;
  new.lote := v_lote;
  return new;
end $$;
drop trigger if exists sup_movimento_trg on public.sup_movimentos;
create trigger sup_movimento_trg before insert on public.sup_movimentos
  for each row execute function public.sup_aplica_movimento();

-- Verificação rápida (deve listar as 4 tabelas)
select table_name from information_schema.tables
 where table_schema = 'public' and table_name like 'sup_%' order by 1;
