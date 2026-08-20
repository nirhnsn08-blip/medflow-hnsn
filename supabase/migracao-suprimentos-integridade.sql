-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS — integridade do saldo (travas duras no banco)
--
-- O saldo do almoxarifado é MANTIDO (`sup_lotes.quantidade`), não derivado.
-- Os movimentos são histórico paralelo, aplicados por trigger. Duas fontes
-- para o mesmo número, e três caminhos por onde elas se separavam:
--
--   1) `sup_movimentos.tipo` não tinha CHECK, e o trigger só confere saldo
--      quando o tipo é exatamente 'saida' — mas SUBTRAI para qualquer coisa
--      que não seja 'entrada'. Um 'saída' com acento furava o estoque sem
--      passar por trava nenhuma, e deixava o lote negativo.
--   2) o `select ... into v_saldo` do trigger não travava a linha: duas
--      saídas simultâneas liam o mesmo saldo, as duas passavam no teste de
--      suficiência, e o lote ficava negativo.
--   3) `sup_movimentos.item_id` tem `on delete cascade` — excluir um
--      material apagava o histórico inteiro, apesar de a política dizer
--      "sem update/delete: kardex imutável". A imutabilidade era falsa.
--
-- Esta migração só RECUSA dado impossível; não altera nenhum caminho feliz
-- que hoje funciona. Nada é apagado e nenhuma coluna muda de tipo.
--
-- Idempotente. Rodar no SQL Editor do Supabase ANTES do merge do código.
-- ═══════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────
-- PASSO 0 — CONFERÊNCIA (leitura). Rode SOZINHO primeiro.
--
-- As travas abaixo entram como NOT VALID: as linhas que já existem não são
-- recusadas. Mas um lote JÁ negativo passa a ser difícil de consertar,
-- porque qualquer update nele volta a ser checado. Se o passo 0 acusar
-- alguma coisa, resolva antes de seguir.
-- ───────────────────────────────────────────────────────────
select 'lote com saldo negativo' as achado, count(*) as linhas from public.sup_lotes where quantidade < 0
union all
select 'movimento com tipo fora de entrada/saida', count(*) from public.sup_movimentos where tipo not in ('entrada','saida')
union all
select 'material com movimento (bloqueio de exclusão passa a valer)', count(distinct item_id) from public.sup_movimentos;

-- ───────────────────────────────────────────────────────────
-- PASSO 1 — o tipo do movimento só pode ser um dos dois
-- ───────────────────────────────────────────────────────────
alter table public.sup_movimentos drop constraint if exists sup_mov_tipo_chk;
alter table public.sup_movimentos
  add constraint sup_mov_tipo_chk check (tipo in ('entrada','saida')) not valid;

-- ───────────────────────────────────────────────────────────
-- PASSO 2 — saldo de lote não pode ser negativo
--
-- NOT VALID de propósito: se algum lote já estiver negativo (efeito do
-- defeito 1 ou 2 acima), a migração não pode falhar por causa dele — mas
-- daqui para a frente nenhum movimento consegue criar um novo.
-- ───────────────────────────────────────────────────────────
alter table public.sup_lotes drop constraint if exists sup_lote_qtd_chk;
alter table public.sup_lotes
  add constraint sup_lote_qtd_chk check (quantidade >= 0) not valid;

-- ───────────────────────────────────────────────────────────
-- PASSO 3 — o trigger passa a travar a linha e a recusar tipo inválido
--
-- Só duas mudanças, ambas restritivas:
--   • `for update` no select do saldo — fecha a corrida entre duas saídas;
--   • guarda explícita de tipo — defesa em profundidade junto do CHECK,
--     e mensagem legível em vez de erro de constraint.
-- O resto é idêntico ao que já rodava.
-- ───────────────────────────────────────────────────────────
create or replace function public.sup_aplica_movimento()
returns trigger language plpgsql security definer as $$
declare
  v_lote_id bigint;
  v_lote text := coalesce(new.lote, '');
  v_saldo numeric;
begin
  if new.tipo not in ('entrada', 'saida') then
    raise exception 'Tipo de movimento invalido: "%". Esperado entrada ou saida.', new.tipo;
  end if;

  -- `for update` trava a linha do lote ate o fim da transacao. Sem isto,
  -- duas saidas simultaneas liam o mesmo saldo, as duas passavam no teste
  -- de suficiencia, e o lote terminava negativo.
  select id, quantidade into v_lote_id, v_saldo from public.sup_lotes
    where item_id = new.item_id and lote = v_lote
    for update;

  if v_lote_id is null then
    insert into public.sup_lotes (item_id, lote, validade, quantidade)
      values (new.item_id, v_lote, new.validade, 0)
      returning id, quantidade into v_lote_id, v_saldo;
  end if;

  if new.tipo = 'saida' and v_saldo < new.quantidade then
    raise exception 'Estoque insuficiente no lote (disponivel: %).', v_saldo;
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

-- ───────────────────────────────────────────────────────────
-- PASSO 4 — o kardex passa a ser imutável de verdade
--
-- A politica de `sup_movimentos` ja bloqueava update e delete diretos, e o
-- comentario no schema diz "kardex imutavel". Mas `item_id` tem
-- `on delete cascade`: apagar o material levava o historico junto. Este
-- trigger recusa a exclusao enquanto houver movimento.
--
-- Material que nao se usa mais deve ser DESATIVADO (`ativo = false`), que e
-- o que a tela ja oferece — inativo some das listas e mantem o historico.
-- ───────────────────────────────────────────────────────────
create or replace function public.sup_item_protege_kardex()
returns trigger language plpgsql security definer as $$
declare
  v_movs bigint;
begin
  select count(*) into v_movs from public.sup_movimentos where item_id = old.id;
  if v_movs > 0 then
    raise exception
      'Nao e possivel excluir "%": ha % movimento(s) de estoque no historico. Desative o material em vez de excluir.',
      old.nome, v_movs;
  end if;
  return old;
end $$;

drop trigger if exists sup_item_protege_kardex_trg on public.sup_itens;
create trigger sup_item_protege_kardex_trg before delete on public.sup_itens
  for each row execute function public.sup_item_protege_kardex();

-- ───────────────────────────────────────────────────────────
-- PASSO 5 — conferência (leitura). Rode depois e confira as 4 linhas.
-- ───────────────────────────────────────────────────────────
select 'trava de tipo do movimento' as item,
       (select count(*) from pg_constraint where conname = 'sup_mov_tipo_chk')::text as presente
union all
select 'trava de saldo nao-negativo',
       (select count(*) from pg_constraint where conname = 'sup_lote_qtd_chk')::text
union all
select 'trigger de saldo (com for update)',
       (select count(*) from pg_proc where proname = 'sup_aplica_movimento'
         and prosrc like '%for update%')::text
union all
select 'trigger anti-exclusao do kardex',
       (select count(*) from pg_trigger where tgname = 'sup_item_protege_kardex_trg')::text;
