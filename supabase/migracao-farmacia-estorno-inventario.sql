-- ═══════════════════════════════════════════════════════════
-- FARMÁCIA — estorno com vínculo e inventário cíclico
--
-- A farmácia e o almoxarifado são o MESMO kardex com nomes diferentes:
-- saldo mantido em `*_lotes`, histórico paralelo em `*_movimentos`,
-- aplicados por trigger. O almoxarifado ganhou estorno e contagem em
-- `migracao-suprimentos-ajuste-estorno.sql` e `-inventario.sql`. A
-- farmácia ficou sem os dois — e é ela que dispensa medicamento
-- controlado.
--
-- O que faltava, exatamente:
--
--   1) ESTORNO. Não havia como desfazer uma dispensação errada. A saída
--      ficava no kardex para sempre, e a correção virava uma entrada
--      solta, sem vínculo com o que ela desfaz. Numa farmácia isso é pior
--      que no almoxarifado: o movimento carrega paciente, e uma entrada
--      anônima quebra o rastro no lugar em que ele é obrigatório.
--
--   2) INVENTÁRIO. `sup_inventarios` existe desde
--      `migracao-suprimentos-inventario.sql`; `farm_inventarios` nunca
--      existiu. A farmácia não tinha contagem cega, não tinha ajuste
--      rastreável e não tinha acuracidade — para nenhum medicamento,
--      controlado inclusive.
--
-- Aditiva. Nenhuma coluna muda de tipo, nada é apagado, e a coluna nova
-- nasce nula — as linhas que já existem seguem válidas.
--
-- Idempotente. Rodar no SQL Editor do Supabase ANTES do merge do código.
-- ═══════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────
-- PASSO 1 — estorno: o movimento oposto aponta para o original
--
-- O kardex continua append-only (não há política de update nem de delete
-- em `farm_movimentos`): estorno NÃO apaga nada, cria a linha contrária
-- com vínculo. `on delete restrict` de propósito — o original não pode
-- sumir por baixo do estorno que o referencia.
-- ───────────────────────────────────────────────────────────
alter table public.farm_movimentos
  add column if not exists estorno_de bigint references public.farm_movimentos(id) on delete restrict;

create index if not exists farm_mov_estorno_idx on public.farm_movimentos (estorno_de)
  where estorno_de is not null;

comment on column public.farm_movimentos.estorno_de is
  'Id do movimento que esta linha desfaz. Mesmo medicamento, mesmo lote, mesma quantidade, tipo oposto.';

-- ───────────────────────────────────────────────────────────
-- PASSO 2 — um movimento só pode ser estornado UMA vez
--
-- Estornar duas vezes o mesmo lançamento é como se inventa estoque: duas
-- entradas de 10 desfazendo uma saída de 10 deixam +10 do nada. Índice
-- único, porque validação de tela não sobrevive a script nem a tela nova
-- escrita daqui a um ano.
--
-- Encadear É permitido (estornar um estorno — desfazer a desfeita é
-- legítimo e fica autodocumentado); o que o índice impede é DOIS estornos
-- apontando para a MESMA linha.
-- ───────────────────────────────────────────────────────────
drop index if exists public.farm_mov_estorno_unico;
create unique index farm_mov_estorno_unico on public.farm_movimentos (estorno_de)
  where estorno_de is not null;

-- ───────────────────────────────────────────────────────────
-- PASSO 3 — o estorno tem que ser realmente o oposto
--
-- Sem esta trava, `estorno_de` seria só um rótulo: daria para marcar como
-- estorno um movimento de outro medicamento, de outro lote ou de outra
-- quantidade, e o kardex passaria a contar uma história falsa com
-- aparência de rastro. A tela não é barreira — pela API isso entraria liso.
--
-- ⚠️ O trigger roda DEPOIS de `farm_movimento_trg` (ordem alfabética do
-- nome decide, e `farm_movimento_trg` < `farm_valida_estorno_trg`).
-- É de propósito: é o trigger de saldo quem normaliza `lote` para '',
-- e a comparação de lote precisa dele já normalizado.
-- ───────────────────────────────────────────────────────────
create or replace function public.farm_valida_estorno()
returns trigger language plpgsql security definer as $$
declare
  o record;
begin
  if new.estorno_de is null then
    return new;
  end if;

  select medicamento_id, lote, tipo, quantidade into o
    from public.farm_movimentos where id = new.estorno_de;

  if o is null then
    raise exception 'Estorno aponta para um movimento inexistente (id %).', new.estorno_de;
  end if;
  if o.medicamento_id <> new.medicamento_id then
    raise exception 'Estorno tem que ser do mesmo medicamento do movimento original.';
  end if;
  if coalesce(o.lote, '') <> coalesce(new.lote, '') then
    raise exception 'Estorno tem que ser no mesmo lote do movimento original ("%").', coalesce(o.lote, '');
  end if;
  if o.quantidade <> new.quantidade then
    raise exception 'Estorno tem que ter a mesma quantidade do original (%).', o.quantidade;
  end if;
  if o.tipo = new.tipo then
    raise exception 'Estorno tem que ser do tipo oposto ao original (% -> %).',
      o.tipo, case when o.tipo = 'entrada' then 'saida' else 'entrada' end;
  end if;

  return new;
end $$;

drop trigger if exists farm_valida_estorno_trg on public.farm_movimentos;
create trigger farm_valida_estorno_trg before insert on public.farm_movimentos
  for each row execute function public.farm_valida_estorno();

-- ───────────────────────────────────────────────────────────
-- PASSO 4 — a contagem de inventário da farmácia
--
-- Mesma forma de `sup_inventarios`, já com as duas colunas que aquela
-- tabela só ganhou depois (`autorizado_por`, `ajuste_erro`) — a farmácia
-- nasce com a lição aprendida em vez de repetir o erro.
--
-- `ajuste_erro` é o oposto de mentir: quando o ajuste não entra no kardex,
-- a linha guarda o motivo em vez de fingir que entrou. `ajustado` significa
-- exatamente "o movimento foi gravado", nunca "eu tentei gravar".
-- ───────────────────────────────────────────────────────────
create table if not exists public.farm_inventarios (
  id bigserial primary key,
  medicamento_id bigint not null
    references public.farm_medicamentos(id) on delete cascade,
  saldo_sistema numeric not null,
  contado numeric not null,
  diferenca numeric not null,          -- contado − sistema
  ajustado boolean default false,      -- ajuste lançado no kardex?
  ajuste_erro text,                    -- por que NÃO entrou, quando não entrou
  autorizado_por text,
  observacao text,
  usuario text,
  created_at timestamptz default now()
);
create index if not exists farm_inv_medic_idx
  on public.farm_inventarios (medicamento_id, created_at desc);

comment on column public.farm_inventarios.ajustado is
  'O ajuste ENTROU no kardex (retorno conferido). Nunca marcar sem confirmar a gravacao.';
comment on column public.farm_inventarios.ajuste_erro is
  'Motivo de o ajuste nao ter entrado. Preenchido quando ajustado = false apesar de haver diferenca.';

alter table public.farm_inventarios enable row level security;

drop policy if exists farm_inv_select on public.farm_inventarios;
drop policy if exists farm_inv_insert on public.farm_inventarios;
drop policy if exists farm_inventarios_leitura on public.farm_inventarios;
create policy farm_inventarios_leitura on public.farm_inventarios
  for select to authenticated
  using (true);
create policy farm_inv_insert on public.farm_inventarios
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));

-- ───────────────────────────────────────────────────────────
-- PASSO 5 — a contagem pode registrar o DESFECHO, e só ele
--
-- Mesma janela do almoxarifado: só dá para atualizar a linha enquanto ela
-- ainda não tem desfecho (`ajustado` falso E `ajuste_erro` nulo). Assim que
-- o desfecho é gravado, o `using` deixa de casar e a linha volta a ser
-- imutável — inclusive para quem a criou. O que foi CONTADO nunca pode ser
-- reescrito depois de decidido.
--
-- Sem esta política o PostgREST responderia 200 com zero linhas alteradas,
-- e o código acreditaria — a contagem ficaria para sempre com o desfecho em
-- branco, que é a mesma cegueira de antes numa roupa nova.
-- ───────────────────────────────────────────────────────────
drop policy if exists farm_inv_update_desfecho on public.farm_inventarios;
create policy farm_inv_update_desfecho on public.farm_inventarios
  for update to authenticated
  using (
    public.my_role() in ('adm_master','adm_silver')
    and coalesce(ajustado, false) = false
    and ajuste_erro is null
  )
  with check (public.my_role() in ('adm_master','adm_silver'));

-- ───────────────────────────────────────────────────────────
-- PASSO 6 — anota que esta migração rodou NESTE banco
-- ───────────────────────────────────────────────────────────
insert into public.migracoes_aplicadas (arquivo)
values ('migracao-farmacia-estorno-inventario.sql') on conflict do nothing;

-- ───────────────────────────────────────────────────────────
-- PASSO 7 — conferência final (leitura). É a ÚLTIMA consulta de propósito:
-- o SQL Editor só mostra o resultado dela. As 6 linhas devem vir com "1".
-- ───────────────────────────────────────────────────────────
select 'coluna estorno_de no movimento' as item,
       (select count(*) from information_schema.columns
         where table_name = 'farm_movimentos' and column_name = 'estorno_de')::text as presente
union all
select 'indice de estorno unico',
       (select count(*) from pg_indexes where indexname = 'farm_mov_estorno_unico')::text
union all
select 'trigger que valida o estorno',
       (select count(*) from pg_trigger where tgname = 'farm_valida_estorno_trg')::text
union all
select 'tabela de contagem da farmacia',
       (select count(*) from information_schema.tables
         where table_name = 'farm_inventarios')::text
union all
select 'politica de desfecho da contagem',
       (select count(*) from pg_policies
         where tablename = 'farm_inventarios' and policyname = 'farm_inv_update_desfecho')::text
union all
select 'migracao anotada no registro',
       (select count(*) from public.migracoes_aplicadas
         where arquivo = 'migracao-farmacia-estorno-inventario.sql')::text;
