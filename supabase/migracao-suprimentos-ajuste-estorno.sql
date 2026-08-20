-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS — ajuste de inventário rastreável e estorno com vínculo
--
-- Dois buracos do mesmo tipo: o sistema não sabia desfazer, e mentia
-- quando tentava.
--
--   1) O AJUSTE QUE MENTIA. A contagem é por ITEM, o estoque é por LOTE.
--      O código lançava o ajuste SEM lote (o trigger joga no balde ''), e
--      não conferia o retorno. Com o estoque em lotes nomeados, o balde
--      está vazio, o trigger recusa com "Estoque insuficiente no lote" —
--      e `sup_inventarios.ajustado` gravava `true` do mesmo jeito. A KPI
--      de acuracidade passava a mentir para sempre, porque a contagem
--      seguinte acharia a mesma divergência e "ajustaria" de novo.
--      Além disso `documento` era a constante 'INVENTARIO' para toda
--      contagem do sistema: não dava para ligar ajuste a conferência.
--
--   2) O ESTORNO QUE NÃO EXISTIA. Não havia como desfazer um lançamento
--      errado; a tela mandava "devolva por Entrada", criando um movimento
--      solto, sem vínculo com a saída original. O rastro ficava ilegível
--      justamente onde alguém vai procurar quando faltar material.
--
-- Aditiva. Nenhuma coluna muda de tipo, nada é apagado, e as colunas novas
-- nascem nulas — as linhas que já existem seguem válidas.
--
-- Idempotente. Rodar no SQL Editor do Supabase ANTES do merge do código.
--
-- 🔴 ANTES DESTE ARQUIVO, rode `conferencia-suprimentos-ajuste-estorno.sql`
-- (só leitura), numa consulta separada. Ele mostra quantas contagens têm
-- `ajustado = true` sem movimento correspondente — as que a versão antiga
-- deu por ajustadas sem ter ajustado.
-- ═══════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────
-- PASSO 1 — a contagem passa a registrar quem autorizou e o que deu errado
--
-- `ajuste_erro` é o oposto de mentir: quando o ajuste não entra, a linha
-- guarda o motivo em vez de fingir que entrou. `ajustado` volta a
-- significar exatamente "o movimento foi gravado no kardex".
-- ───────────────────────────────────────────────────────────
alter table public.sup_inventarios add column if not exists autorizado_por text;
alter table public.sup_inventarios add column if not exists ajuste_erro text;

comment on column public.sup_inventarios.ajustado is
  'O ajuste ENTROU no kardex (retorno conferido). Nunca marcar sem confirmar a gravacao.';
comment on column public.sup_inventarios.ajuste_erro is
  'Motivo de o ajuste nao ter entrado. Preenchido quando ajustado = false apesar de haver diferenca.';

-- ───────────────────────────────────────────────────────────
-- PASSO 2 — estorno: o movimento oposto aponta para o original
--
-- O kardex continua append-only: estorno NÃO apaga nada, cria a linha
-- contrária com vínculo. `on delete restrict` de propósito — o original
-- não pode sumir por baixo do estorno que o referencia.
-- ───────────────────────────────────────────────────────────
alter table public.sup_movimentos
  add column if not exists estorno_de bigint references public.sup_movimentos(id) on delete restrict;

create index if not exists sup_mov_estorno_idx on public.sup_movimentos (estorno_de)
  where estorno_de is not null;

comment on column public.sup_movimentos.estorno_de is
  'Id do movimento que esta linha desfaz. Mesmo item, mesmo lote, mesma quantidade, tipo oposto.';

-- ───────────────────────────────────────────────────────────
-- PASSO 3 — um movimento só pode ser estornado UMA vez
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
drop index if exists public.sup_mov_estorno_unico;
create unique index sup_mov_estorno_unico on public.sup_movimentos (estorno_de)
  where estorno_de is not null;

-- ───────────────────────────────────────────────────────────
-- PASSO 4 — o estorno tem que ser realmente o oposto
--
-- Sem esta trava, `estorno_de` seria só um rótulo: daria para marcar como
-- estorno um movimento de outro item, de outro lote ou de outra
-- quantidade, e o kardex passaria a contar uma história falsa com aparência
-- de rastro. A tela não é barreira — pela API isso entraria liso.
-- ───────────────────────────────────────────────────────────
create or replace function public.sup_valida_estorno()
returns trigger language plpgsql security definer as $$
declare
  o record;
begin
  if new.estorno_de is null then
    return new;
  end if;

  select item_id, lote, tipo, quantidade into o
    from public.sup_movimentos where id = new.estorno_de;

  if o is null then
    raise exception 'Estorno aponta para um movimento inexistente (id %).', new.estorno_de;
  end if;
  if o.item_id <> new.item_id then
    raise exception 'Estorno tem que ser do mesmo material do movimento original.';
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

drop trigger if exists sup_valida_estorno_trg on public.sup_movimentos;
-- Depois do trigger de saldo (ordem alfabética do nome decide, e
-- `sup_movimento_trg` < `sup_valida_estorno_trg`): validar antes de aplicar
-- evitaria mexer no saldo à toa, mas o trigger de saldo é quem preenche
-- `lote`, e a comparação de lote precisa dele já normalizado.
create trigger sup_valida_estorno_trg before insert on public.sup_movimentos
  for each row execute function public.sup_valida_estorno();

-- ───────────────────────────────────────────────────────────
-- PASSO 5 — a contagem pode registrar o DESFECHO, e só ele
--
-- `sup_inventarios` nasceu append-only: só tinha política de SELECT e de
-- INSERT. Isso é certo para a contagem em si (ninguém deve reescrever o
-- que foi contado), mas impedia o passo seguinte — gravar se o ajuste
-- entrou. Sem UPDATE, o PostgREST responde 200 com zero linhas alteradas,
-- e o código acreditava. A contagem ficava para sempre com o desfecho em
-- branco, que é a mesma cegueira de antes numa roupa nova.
--
-- A política abaixo abre uma JANELA, não uma porta: só dá para atualizar a
-- linha enquanto ela ainda não tem desfecho (`ajustado` falso E
-- `ajuste_erro` nulo). Assim que o desfecho é gravado, o `using` deixa de
-- casar e a linha volta a ser imutável — inclusive para quem a criou.
-- O que foi contado continua sem poder ser reescrito depois de decidido.
-- ───────────────────────────────────────────────────────────
drop policy if exists sup_inv_update_desfecho on public.sup_inventarios;
create policy sup_inv_update_desfecho on public.sup_inventarios
  for update to authenticated
  using (
    public.my_role() in ('adm_master','adm_silver')
    and coalesce(ajustado, false) = false
    and ajuste_erro is null
  )
  with check (public.my_role() in ('adm_master','adm_silver'));

-- ───────────────────────────────────────────────────────────
-- PASSO 6 — conferência final (leitura). É a ÚLTIMA consulta de propósito:
-- o SQL Editor só mostra o resultado dela. As 6 linhas devem vir com "1".
-- ───────────────────────────────────────────────────────────
select 'coluna autorizado_por na contagem' as item,
       (select count(*) from information_schema.columns
         where table_name = 'sup_inventarios' and column_name = 'autorizado_por')::text as presente
union all
select 'coluna ajuste_erro na contagem',
       (select count(*) from information_schema.columns
         where table_name = 'sup_inventarios' and column_name = 'ajuste_erro')::text
union all
select 'coluna estorno_de no movimento',
       (select count(*) from information_schema.columns
         where table_name = 'sup_movimentos' and column_name = 'estorno_de')::text
union all
select 'indice de estorno unico',
       (select count(*) from pg_indexes where indexname = 'sup_mov_estorno_unico')::text
union all
select 'trigger que valida o estorno',
       (select count(*) from pg_trigger where tgname = 'sup_valida_estorno_trg')::text
union all
select 'politica de desfecho da contagem',
       (select count(*) from pg_policies
         where tablename = 'sup_inventarios' and policyname = 'sup_inv_update_desfecho')::text;
