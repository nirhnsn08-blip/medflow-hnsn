-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS — unidade de compra × unidade de consumo
--
-- `sup_itens` tinha UMA coluna `unidade`. Só que o almoxarifado compra
-- caixa com 100 luvas e entrega par. Sem separar as duas, o comprador
-- digita "qtd 1" e o `custo_unitario` vira R$/caixa — enquanto as saídas
-- saem em unidades. A partir daí, tudo que mistura os dois números está
-- numericamente errado: custo médio ponderado, curva ABC, ponto de pedido
-- e total do pedido de compra.
--
-- Nada disso dá erro na tela. O sistema segue funcionando e respondendo
-- com números errados — o pior tipo de defeito num módulo cuja função é
-- justamente dizer quanto tem e quanto custa.
--
-- 🔴 POR QUE ENTRAR ANTES DA PRIMEIRA COMPRA REAL: o custo médio é
-- PONDERADO. Uma entrada com o custo trocado não fica no passado — ela
-- vira base da média e contamina toda entrada seguinte. Depois de o
-- histórico começar, não há migração que desfaça; só recontagem e
-- relançamento item a item.
--
-- Aditiva e compatível: as colunas nascem nulas e `fator_conversao` tem
-- default 1, então os materiais que já existem se comportam exatamente
-- como antes. A conversão só muda alguma coisa para quem declarar que
-- compra numa unidade diferente da que consome.
--
-- Idempotente. Rodar no SQL Editor do Supabase ANTES do merge do código.
-- Não precisa de conferência prévia: não há dado que possa violar as
-- travas abaixo (a coluna nasce com o default que já satisfaz o CHECK).
-- ═══════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────
-- PASSO 1 — as duas colunas
--
-- `unidade_compra` é só o nome (caixa, fardo, frasco). Quem faz a conta é
-- `fator_conversao`: quantas unidades de CONSUMO cabem numa de COMPRA.
-- ───────────────────────────────────────────────────────────
alter table public.sup_itens add column if not exists unidade_compra text;
alter table public.sup_itens add column if not exists fator_conversao numeric not null default 1;

comment on column public.sup_itens.unidade is
  'Unidade de CONSUMO — como o material sai para o setor. O estoque e o kardex sempre falam nesta unidade.';
comment on column public.sup_itens.unidade_compra is
  'Unidade de COMPRA (caixa, fardo). Apenas o nome; a conta e feita por fator_conversao.';
comment on column public.sup_itens.fator_conversao is
  'Quantas unidades de CONSUMO cabem em uma de COMPRA. Caixa com 100 pares = 100. Default 1 (sem conversao).';

-- ───────────────────────────────────────────────────────────
-- PASSO 2 — fator inválido não entra
--
-- Zero viraria divisão por zero no custo (`Infinity`); negativo criaria
-- estoque negativo na entrada. A tela já valida, mas tela não sobrevive a
-- import de planilha nem a script — e um fator errado não dá erro: ele
-- contamina o custo médio de todas as entradas seguintes, em silêncio.
-- ───────────────────────────────────────────────────────────
alter table public.sup_itens drop constraint if exists sup_item_fator_chk;
alter table public.sup_itens
  add constraint sup_item_fator_chk check (fator_conversao > 0);

-- ───────────────────────────────────────────────────────────
-- PASSO 3 — conferência final (leitura). É a ÚLTIMA consulta de propósito:
-- o SQL Editor só mostra o resultado dela.
-- As 3 primeiras linhas devem vir com "1"; a última mostra quantos
-- materiais já declaram conversão (zero agora, e tudo bem).
-- ───────────────────────────────────────────────────────────
select 'coluna unidade_compra' as item,
       (select count(*) from information_schema.columns
         where table_name = 'sup_itens' and column_name = 'unidade_compra')::text as valor
union all
select 'coluna fator_conversao',
       (select count(*) from information_schema.columns
         where table_name = 'sup_itens' and column_name = 'fator_conversao')::text
union all
select 'trava de fator maior que zero',
       (select count(*) from pg_constraint where conname = 'sup_item_fator_chk')::text
union all
select 'materiais com conversao declarada (informativo)',
       (select count(*) from public.sup_itens where fator_conversao <> 1)::text
union all
select 'materiais no total (todos com fator 1 = comportamento de antes)',
       (select count(*) from public.sup_itens)::text;
