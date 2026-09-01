-- ═══════════════════════════════════════════════════════════
-- RLS DA at_glosas — o passo 2 de 2
--
-- 🔴 POR QUE ESTE ARQUIVO EXISTE em vez de "rode o migracao-rls-leitura".
-- Aquele arquivo tem 41 KB, e o editor do Supabase (Monaco) TRUNCA CALADO
-- acima de ~26 KB: ele cola até uma linha qualquer e o erro que aparece é
-- "syntax error at end of input", sem dizer que faltou texto. Já custou uma
-- sessão. Este recorte faz exatamente o mesmo para UMA tabela.
--
-- As três políticas reproduzem, letra por letra, o que o gerador
-- (`gerar-rls.mjs`) produz para `at_glosas` a partir de
-- `src/acesso/mapa-tabelas.js`, onde ela está declarada como módulo
-- "atendimento" e como SENSÍVEL (carrega prontuário e valor).
--
-- ⚠️ Rodar o `migracao-rls-leitura.sql` inteiro depois NÃO quebra nada:
-- ele derruba e recria pelos mesmos nomes.
--
-- ⚠️ TABELA NOVA SEM POLÍTICA NASCE COM RLS LIGADA E SEM REGRA, e o
-- sintoma não é erro — é TELA VAZIA. Foi assim que 18 tabelas da Laura
-- ficaram com escrita travada ao vivo em agosto.
-- ═══════════════════════════════════════════════════════════

set valentrax.quem = 'adauam';

alter table public.at_glosas enable row level security;


-- ── LEITURA: quem enxerga o módulo Atendimento ──────────────
drop policy if exists at_glosas_leitura on public.at_glosas;
create policy at_glosas_leitura on public.at_glosas
  for select to authenticated
  using (public.pode_ver_algum('atendimento'));


-- ── ESCRITA ABERTA (a base permissiva) ──────────────────────
-- Tabela nova não tem política de escrita nenhuma, então entra o mesmo
-- par que o gerador cria: permissiva aberta + restritiva por módulo. É a
-- restritiva abaixo que aperta de verdade; sem a permissiva, o RLS negaria
-- tudo (política restritiva sozinha não LIBERA nada).
drop policy if exists at_glosas_escrita_ins on public.at_glosas;
drop policy if exists at_glosas_escrita_upd on public.at_glosas;
drop policy if exists at_glosas_escrita_del on public.at_glosas;

create policy at_glosas_escrita_ins on public.at_glosas
  for insert to authenticated with check (true);
create policy at_glosas_escrita_upd on public.at_glosas
  for update to authenticated using (true) with check (true);
create policy at_glosas_escrita_del on public.at_glosas
  for delete to authenticated using (true);


-- ── ESCRITA RESTRITIVA: exige o módulo ──────────────────────
-- `as restrictive` combina com E: só aperta, nunca solta.
-- ⚠️ Três políticas separadas, e NUNCA `for all` — `for all` incluiria
-- SELECT, e uma restritiva sobre SELECT tiraria a leitura de quem tem só
-- leitura no módulo, desfazendo a política de cima.
drop policy if exists at_glosas_mod_ins on public.at_glosas;
drop policy if exists at_glosas_mod_upd on public.at_glosas;
drop policy if exists at_glosas_mod_del on public.at_glosas;

create policy at_glosas_mod_ins on public.at_glosas
  as restrictive for insert to authenticated
  with check (public.pode_editar_algum('atendimento'));
create policy at_glosas_mod_upd on public.at_glosas
  as restrictive for update to authenticated
  using (public.pode_editar_algum('atendimento'))
  with check (public.pode_editar_algum('atendimento'));
create policy at_glosas_mod_del on public.at_glosas
  as restrictive for delete to authenticated
  using (public.pode_editar_algum('atendimento'));


-- ═══════════════════════════════════════════════════════════
-- CONFERÊNCIA — leia a saída
-- ═══════════════════════════════════════════════════════════
select 'QUAL BANCO É ESTE?' as item,
       case when (select count(*) from public.pacientes) >= 40
            then 'DEMO — ' || (select count(*) from public.pacientes) || ' pacientes'
            else 'PRINCIPAL — ' || (select count(*) from public.pacientes) || ' pacientes'
       end as resultado

union all
select 'RLS ligada na at_glosas', case when relrowsecurity then 'sim' else '🔴 NÃO' end
  from pg_class where oid = 'public.at_glosas'::regclass

union all
select 'políticas (esperado 7)', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'at_glosas'

union all
select 'leitura', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'at_glosas' and cmd = 'SELECT'

union all
select 'restritivas de escrita (esperado 3)', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'at_glosas' and permissive = 'RESTRICTIVE';


insert into public.migracoes_aplicadas (arquivo)
values ('migracao-glosas-rls.sql') on conflict do nothing;
