-- ═══════════════════════════════════════════════════════════
-- AUDITORIA — trilha atribuível e consultável
--
-- Dois defeitos, ambos verificados no código:
--
--   1) A TELA NÃO LIA A TRILHA. `addAuditLog` sempre gravou nos dois
--      lugares — `localStorage` e esta tabela —, mas a tela de Auditoria
--      lia apenas o `localStorage`: 200 registros, do navegador de quem
--      estivesse olhando. A trilha institucional existia aqui e não era
--      exibida em lugar nenhum, enquanto o cabeçalho anunciava "histórico
--      de todas as alterações realizadas na plataforma". Duas pessoas na
--      mesma tela viam listas diferentes.
--      (Corrigido no código; esta migração dá suporte à consulta.)
--
--   2) A AUTORIA VINHA DO CLIENTE. `usuario` é texto livre enviado pelo
--      navegador. Pela API, qualquer autenticado grava um registro com o
--      nome de outra pessoa — e uma trilha em que se pode assinar como
--      terceiro não prova nada justamente quando mais precisa provar.
--
-- 🔴 Por que isso não é cosmético: a trilha DEFENDE a instituição
-- (REQUISITOS-PEP A-03; CFM 1.638/2002, art. 2º). Ela só cumpre esse papel
-- se for a mesma para todos, completa e atribuível a uma conta.
--
-- Aditiva: a coluna nasce nula e é preenchida pelo próprio banco daqui em
-- diante. Registros antigos permanecem como estão — são história, e a tela
-- mostra separadamente quantos têm autoria garantida.
--
-- Idempotente. Rodar no SQL Editor ANTES do merge do código.
-- ═══════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────
-- PASSO 1 — a autoria passa a vir do banco, não do cliente
--
-- `default auth.uid()` faz o próprio PostgREST/Postgres carimbar a conta
-- autenticada. O cliente não precisa enviar nada, e o que ele enviar de
-- errado é recusado no passo 2.
-- ───────────────────────────────────────────────────────────
alter table public.auditoria add column if not exists usuario_id uuid default auth.uid();

comment on column public.auditoria.usuario is
  'Nome de exibicao enviado pelo cliente. Serve para ler; NAO serve como prova de autoria.';
comment on column public.auditoria.usuario_id is
  'Conta autenticada que gravou o registro, carimbada pelo banco (default auth.uid()). Esta e a autoria.';

-- ───────────────────────────────────────────────────────────
-- PASSO 2 — ninguém assina no lugar de outro
--
-- A política de INSERT era `with check (true)`: qualquer autenticado
-- gravava qualquer coisa, inclusive em nome de terceiro. Agora o registro
-- só entra se a autoria for a própria conta.
--
-- O `is null` cobre o registro gravado por processo sem sessão de usuário
-- (função de servidor com credencial de serviço), que não tem `auth.uid()`
-- — melhor um registro sem autoria do que um registro perdido: a trilha
-- não pode deixar de gravar por causa desta trava.
-- ───────────────────────────────────────────────────────────
drop policy if exists audit_insert on public.auditoria;
create policy audit_insert on public.auditoria
  for insert to authenticated
  with check (usuario_id is null or usuario_id = auth.uid());

-- ───────────────────────────────────────────────────────────
-- PASSO 3 — a consulta da tela precisa ser barata
--
-- A tela pagina por chave (`id desc`, `id < último`) e filtra por período
-- e por ação. Sem índice, cada página vira varredura da tabela inteira —
-- e esta tabela só cresce.
-- ───────────────────────────────────────────────────────────
create index if not exists auditoria_id_desc_idx on public.auditoria (id desc);
create index if not exists auditoria_ts_idx      on public.auditoria (ts desc);
create index if not exists auditoria_acao_idx    on public.auditoria (acao);

-- ───────────────────────────────────────────────────────────
-- PASSO 4 — conferência final (leitura). É a ÚLTIMA consulta de propósito:
-- o SQL Editor só mostra o resultado dela. As 3 primeiras linhas devem vir
-- com "1"; as duas últimas são o retrato de antes, para comparar depois.
-- ───────────────────────────────────────────────────────────
select 'coluna usuario_id na auditoria' as item,
       (select count(*) from information_schema.columns
         where table_name = 'auditoria' and column_name = 'usuario_id')::text as valor
union all
select 'politica de insert exigindo a propria conta',
       (select count(*) from pg_policies
         where tablename = 'auditoria' and policyname = 'audit_insert'
           and with_check like '%auth.uid()%')::text
union all
select 'indice de paginacao por id',
       (select count(*) from pg_indexes where indexname = 'auditoria_id_desc_idx')::text
union all
select 'registros na trilha (informativo)',
       (select count(*) from public.auditoria)::text
union all
select 'registros ja atribuidos a uma conta (zero agora, e esperado)',
       (select count(*) from public.auditoria where usuario_id is not null)::text;
