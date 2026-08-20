-- ═══════════════════════════════════════════════════════════
-- CONFERÊNCIA — antes de `migracao-suprimentos-ajuste-estorno.sql`
--
-- SÓ LEITURA. Não altera nada. Rode este arquivo PRIMEIRO, sozinho — o SQL
-- Editor mostra apenas o resultado da ÚLTIMA consulta, então conferência
-- no meio de outro arquivo some da tela.
--
-- O que este relatório procura: as contagens que a versão antiga deu por
-- ajustadas SEM ter ajustado. O código lançava o ajuste sem lote e não
-- conferia o retorno; quando o trigger recusava, `ajustado` gravava `true`
-- assim mesmo. Essas linhas são a explicação de uma acuracidade que não
-- fecha.
--
-- O que fazer com o resultado:
--
--  • "contagem marcada como ajustada SEM movimento no kardex" > 0
--       São as mentiras já gravadas. A migração NÃO as apaga — o histórico
--       é append-only e essas linhas são a prova do que aconteceu. Depois
--       de migrar, refaça a contagem desses itens: agora o ajuste ou entra
--       de verdade, ou a linha guarda o motivo em `ajuste_erro`.
--
--  • "movimento de ajuste no balde sem lote" > 0
--       Ajustes que foram para o lote genérico ''. Se o item tem lotes
--       nomeados, esse saldo está no lugar errado — a conciliação do
--       Inventário continua fechando (o kardex bate com o saldo), mas o
--       FEFO desse item não é confiável. Corrija com estorno + novo
--       lançamento no lote certo, depois que a migração entrar.
--
--  • As duas últimas linhas são o retrato de antes, para comparar depois.
--
-- Rodar nos DOIS bancos (demo primeiro, principal depois).
-- ═══════════════════════════════════════════════════════════

select 'contagem marcada como ajustada SEM movimento no kardex' as achado,
       count(*)::text as linhas
  from public.sup_inventarios i
 where i.ajustado = true
   and i.diferenca <> 0
   and not exists (
     select 1 from public.sup_movimentos m
      where m.item_id = i.item_id
        and m.motivo = 'Ajuste de inventário'
        and m.created_at >= i.created_at - interval '5 minutes'
        and m.created_at <= i.created_at + interval '5 minutes'
   )
union all
select 'movimento de ajuste no balde sem lote',
       count(*)::text
  from public.sup_movimentos
 where motivo = 'Ajuste de inventário'
   and coalesce(lote, '') = ''
union all
select 'contagens registradas no total',
       count(*)::text from public.sup_inventarios
union all
select 'movimentos de ajuste no total',
       count(*)::text from public.sup_movimentos where motivo = 'Ajuste de inventário'
union all
select 'movimentos no total',
       count(*)::text from public.sup_movimentos;
