-- ═══════════════════════════════════════════════════════════
-- CONFERÊNCIA — antes de rodar `migracao-suprimentos-integridade.sql`
--
-- SÓ LEITURA. Não altera nada. Rode este arquivo PRIMEIRO, sozinho.
--
-- Por que separado da migração: o SQL Editor do Supabase mostra apenas o
-- resultado da ÚLTIMA consulta. Uma conferência no meio de um arquivo que
-- termina com outra coisa some da tela — e uma conferência que ninguém vê
-- é pior que nenhuma, porque dá por conferido.
--
-- O que fazer com o resultado:
--
--  • "lote com saldo negativo" > 0
--       A migração instala `check (quantidade >= 0)` como NOT VALID, então
--       ela NÃO vai falhar por causa dessas linhas. Mas qualquer movimento
--       futuro nesse lote passa a ser recusado — inclusive o que
--       consertaria. Ajuste esses lotes ANTES (entrada de correção, ou
--       `update sup_lotes set quantidade = 0` com registro do motivo).
--
--  • "movimento com tipo fora de entrada/saida" > 0
--       São as linhas que o trigger antigo subtraiu sem conferir saldo.
--       Elas ficam no histórico (o kardex é append-only e assim deve
--       continuar) — a conciliação na tela do Inventário passa a listá-las.
--       Não apague: são a explicação de um saldo que não bate.
--
--  • "material com movimento" — informativo
--       É quantos materiais deixam de poder ser excluídos depois da
--       migração. Excluir passa a ser recusado com mensagem; desativar
--       (`ativo = false`) continua funcionando e é o caminho certo.
--
-- Rodar nos DOIS bancos (demo primeiro, principal depois).
-- ═══════════════════════════════════════════════════════════

select 'lote com saldo negativo' as achado,
       count(*) as linhas
  from public.sup_lotes where quantidade < 0
union all
select 'movimento com tipo fora de entrada/saida',
       count(*)
  from public.sup_movimentos where tipo not in ('entrada','saida')
union all
select 'material com movimento (nao podera mais ser excluido)',
       count(distinct item_id)
  from public.sup_movimentos
union all
select 'lotes no total (o que a conciliacao vai conferir)',
       count(*)
  from public.sup_lotes
union all
select 'movimentos no total',
       count(*)
  from public.sup_movimentos;
