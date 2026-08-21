-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS — alçada de aprovação de compra
--
-- Dois buracos de segregação, verificados no código:
--
--   1) AUTOAPROVAÇÃO. `podeAprovar` conferia cargo e nunca comparava quem
--      criou o pedido com quem aprova. A mesma pessoa criava, enviava e
--      aprovava. (Corrigido no código; não depende desta migração.)
--
--   2) SEM ALÇADA POR VALOR. R$ 50 e R$ 50.000 percorriam o mesmo caminho.
--      Alçada é o controle mais básico de compra e o primeiro que um
--      auditor procura.
--
-- Por que uma TABELA e não uma constante no código: hospital muda alçada
-- por decisão administrativa — troca de diretoria, fim de exercício,
-- mudança de porte. Se o valor mora no código, mudar vira tarefa de
-- desenvolvimento e deploy, e na prática ninguém muda.
--
-- 🔴 NASCE DESLIGADA (sem linha de limite). Enquanto ninguém configurar, a
-- regra CALA e o comportamento é exatamente o de hoje. Um número que a
-- equipe não escolheu travando compra de hospital seria pior que a
-- ausência de alçada.
--
-- Aditiva. Idempotente. Rodar no SQL Editor ANTES do merge do código.
-- ═══════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────
-- PASSO 1 — parâmetros do módulo de suprimentos
--
-- Chave/valor de propósito: o próximo parâmetro (prazo padrão de entrega,
-- teto de inventário) entra sem migração nova. `atualizado_por` fica junto
-- porque mudar alçada é decisão que se presta contas.
-- ───────────────────────────────────────────────────────────
create table if not exists public.sup_parametros (
  chave text primary key,
  valor numeric,
  texto text,
  atualizado_por text,
  atualizado_em timestamptz default now()
);

comment on table public.sup_parametros is
  'Parametros configuraveis do modulo de Suprimentos. Chave/valor para nao exigir migracao a cada novo ajuste.';
comment on column public.sup_parametros.valor is
  'Valor numerico do parametro. Para alcada_aprovacao: limite em REAIS acima do qual o pedido sobe de nivel.';

alter table public.sup_parametros enable row level security;

-- ───────────────────────────────────────────────────────────
-- PASSO 2 — quem lê e quem escreve
--
-- Leitura para quem alcança Suprimentos: a tela de aprovação precisa saber
-- a alçada para explicar a recusa. Escrita só para adm_master — alçada é
-- controle interno, e quem opera a compra não define o próprio teto.
-- ───────────────────────────────────────────────────────────
drop policy if exists sup_param_select on public.sup_parametros;
drop policy if exists sup_param_write  on public.sup_parametros;

create policy sup_param_select on public.sup_parametros
  for select to authenticated
  using (public.pode_ver_algum('suprimentos', 'farmacia'));

create policy sup_param_write on public.sup_parametros
  for all to authenticated
  using (public.my_role() = 'adm_master')
  with check (public.my_role() = 'adm_master');

-- ───────────────────────────────────────────────────────────
-- PASSO 3 — alçada não pode ser zero nem negativa
--
-- Zero travaria toda compra do hospital; negativo não significa nada. A
-- tela já valida, mas tela não sobrevive a script — e um parâmetro errado
-- aqui não dá erro: apenas para as compras, e ninguém liga o motivo à
-- linha que alguém digitou semanas antes.
--
-- Para DESLIGAR a alçada, apaga-se a linha (ou deixa `valor` nulo) — não
-- se põe zero.
-- ───────────────────────────────────────────────────────────
alter table public.sup_parametros drop constraint if exists sup_param_valor_chk;
alter table public.sup_parametros
  add constraint sup_param_valor_chk check (valor is null or valor > 0);

-- ───────────────────────────────────────────────────────────
-- PASSO 4 — conferência final (leitura). É a ÚLTIMA consulta de propósito.
-- As 3 primeiras linhas devem vir com "1"; a última mostra que a alçada
-- nasce DESLIGADA, que é o esperado.
-- ───────────────────────────────────────────────────────────
select 'tabela sup_parametros' as item,
       (select count(*) from information_schema.tables
         where table_name = 'sup_parametros')::text as valor
union all
select 'politica de escrita restrita a adm_master',
       (select count(*) from pg_policies
         where tablename = 'sup_parametros' and policyname = 'sup_param_write')::text
union all
select 'trava de valor maior que zero',
       (select count(*) from pg_constraint where conname = 'sup_param_valor_chk')::text
union all
select 'alcada configurada (0 = desligada, e o esperado agora)',
       (select count(*) from public.sup_parametros
         where chave = 'alcada_aprovacao' and valor is not null)::text;
