-- ═══════════════════════════════════════════════════════════
-- FATURAMENTO VIRA MÓDULO PRÓPRIO
--
-- 🔴 ISTO CONSERTA UM DEFEITO VIVO, e não é arrumação de gaveta.
--
-- As cinco tabelas do faturamento (`at_contas`, `at_conta_itens`,
-- `at_glosas`, `at_repasses`, `at_precos`) exigiam ESCRITA NO MÓDULO
-- ATENDIMENTO. E o perfil "Faturamento" tem:
--
--     atendimento: leitura      faturamento: escrita
--
-- Ou seja: **o analista de faturamento não conseguia gravar conta, glosa,
-- preço nem repasse.** Todo o ciclo do dinheiro era só-leitura justamente
-- para quem trabalha nele. Ninguém percebeu porque o banco ainda não tem
-- conta lançada — apareceria no primeiro dia de uso real.
--
-- E de quebra: separado, o Faturamento passa a poder ser vendido à parte do
-- Atendimento. Hoje quem compra Atendimento leva o faturamento junto.
--
-- ⚠️ NINGUÉM PERDE ACESSO. A PARTE 2 dá `faturamento` a todo perfil que já
-- tinha `atendimento`, no MESMO nível — o acesso efetivo no dia seguinte é
-- idêntico ao de hoje. O que muda é que agora dá para separar os dois.
--
-- ⚠️ Rodar nos DOIS bancos. Idempotente: pode rodar duas vezes.
-- ═══════════════════════════════════════════════════════════

-- ── PARTE 1 — as políticas passam a olhar `faturamento` ─────
do $mudar$
declare
  t text;
  alvos text[] := array['at_contas','at_conta_itens','at_glosas','at_repasses','at_precos'];
begin
  foreach t in array alvos loop
    -- Tabela que ainda não existe neste banco não trava a migração: o
    -- `at_precos` nasceu em 01/09 e um banco antigo pode não ter.
    if to_regclass('public.' || t) is null then
      raise notice 'PULADA (não existe aqui): %', t;
      continue;
    end if;

    -- Leitura
    execute format('drop policy if exists %I on public.%I', t || '_leitura', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.pode_ver_algum(''faturamento''))',
      t || '_leitura', t);

    -- Escrita (as três do padrão `_mod_`, restritivas)
    execute format('drop policy if exists %I on public.%I', t || '_mod_ins', t);
    execute format('drop policy if exists %I on public.%I', t || '_mod_upd', t);
    execute format('drop policy if exists %I on public.%I', t || '_mod_del', t);
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check (public.pode_editar_algum(''faturamento''))',
      t || '_mod_ins', t);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using (public.pode_editar_algum(''faturamento'')) with check (public.pode_editar_algum(''faturamento''))',
      t || '_mod_upd', t);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (public.pode_editar_algum(''faturamento''))',
      t || '_mod_del', t);

    raise notice 'movida para o módulo faturamento: %', t;
  end loop;
end
$mudar$;


-- ── PARTE 2 — ninguém perde acesso ──────────────────────────
-- 🔴 DERIVADO DO PRÓPRIO BANCO, não do seed. Todo perfil que hoje tem
-- `atendimento` ganha `faturamento` no MESMO nível. O `do nothing` protege
-- quem já tem um nível próprio de faturamento (o perfil "Faturamento" tem
-- `escrita` e não pode ser rebaixado a `leitura` por esta linha).
--
-- ⚠️ `on conflict do nothing` NUNCA insere grant novo em linha que já
-- existe — foi assim que `ti.nsp` ficou semanas no arquivo e em nenhum
-- banco. Aqui a linha (perfil, 'faturamento') não existe ainda, então
-- insere; e na segunda passada não faz nada, que é o desejado.
insert into public.perfis_permissoes (perfil_chave, modulo, nivel)
select pp.perfil_chave, 'faturamento', pp.nivel
  from public.perfis_permissoes pp
 where pp.modulo = 'atendimento'
on conflict (perfil_chave, modulo) do nothing;


-- ── CONFERÊNCIA ─────────────────────────────────────────────
-- ⚠️ O SQL Editor mostra só a ÚLTIMA consulta — por isso `union all`.
-- Leia a coluna `situacao`: qualquer ❌ significa que a migração não pegou.
select 'politica de leitura' as o_que, t.tabela,
       case when p.qual like '%faturamento%' then '✅ faturamento'
            when p.qual is null              then '❌ SEM POLÍTICA'
            else '❌ ainda em: ' || p.qual end as situacao
  from (values ('at_contas'),('at_conta_itens'),('at_glosas'),('at_repasses'),('at_precos')) t(tabela)
  left join pg_policies p
    on p.schemaname = 'public' and p.tablename = t.tabela and p.policyname = t.tabela || '_leitura'
 where to_regclass('public.' || t.tabela) is not null

union all

select 'politica de escrita', t.tabela,
       case when count(*) filter (where p.with_check like '%faturamento%' or p.qual like '%faturamento%') = 3
            then '✅ faturamento (ins/upd/del)'
            else '❌ ' || count(*) || ' de 3 apontam para faturamento' end
  from (values ('at_contas'),('at_conta_itens'),('at_glosas'),('at_repasses'),('at_precos')) t(tabela)
  left join pg_policies p
    on p.schemaname = 'public' and p.tablename = t.tabela
   and p.policyname in (t.tabela || '_mod_ins', t.tabela || '_mod_upd', t.tabela || '_mod_del')
 where to_regclass('public.' || t.tabela) is not null
 group by t.tabela

union all

-- 🔴 A LINHA QUE MAIS IMPORTA: o analista de faturamento grava?
select 'o perfil Faturamento grava?', perfil_chave,
       case when nivel = 'escrita' then '✅ sim' else '❌ NÃO — nivel=' || nivel end
  from public.perfis_permissoes
 where modulo = 'faturamento' and perfil_chave in ('faturamento','ti')

union all

-- E ninguém perdeu: quem tinha atendimento tem faturamento no mesmo nível?
select 'manteve o acesso', a.perfil_chave,
       case when f.nivel is null then '❌ PERDEU o faturamento'
            when f.nivel = a.nivel or f.nivel = 'escrita' then '✅ ' || a.nivel || ' → ' || f.nivel
            else '❌ rebaixado: ' || a.nivel || ' → ' || f.nivel end
  from public.perfis_permissoes a
  left join public.perfis_permissoes f
    on f.perfil_chave = a.perfil_chave and f.modulo = 'faturamento'
 where a.modulo = 'atendimento'

order by 1, 2;
