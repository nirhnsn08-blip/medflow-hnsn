// ============================================================
// Valentrax — GERADOR DAS POLÍTICAS DE LEITURA (RLS)
//
//     node supabase/gerar-rls.mjs
//
// Lê `src/acesso/mapa-tabelas.js` e escreve `migracao-rls-leitura.sql`:
// uma política de SELECT por tabela, amarrada ao módulo que a tela usa.
//
// POR QUE GERADO, E NÃO ESCRITO À MÃO
// Política de RLS escrita à mão envelhece calada. A tabela nova entra com
// `using (true)`, ninguém percebe, e a auditoria continua dizendo "✅ tem
// política" — foi exatamente assim que a auditoria de banco ficou cega duas
// vezes (Estoque & Compras, depois ps_salas). Aqui a lista de tabelas vem
// de `auditoria-banco.sql`, que também é gerado: tabela nova sem
// classificação PARA o gerador e quebra o teste, em vez de virar buraco.
//
// Ao criar uma migração nova:
//   1. classifique a tabela em src/acesso/mapa-tabelas.js
//   2. node supabase/gerar-auditoria.mjs
//   3. node supabase/gerar-rls.mjs
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MAPA_TABELAS, TODOS, PROPRIO } from "../src/acesso/mapa-tabelas.js";

const dir = path.dirname(fileURLToPath(import.meta.url));

/** As tabelas que o banco deveria ter, lidas do auditoria-banco.sql gerado. */
export function tabelasDoBanco(sqlAuditoria) {
  const bloco = sqlAuditoria.match(/tabelas\(nome, origem\) as \(values([\s\S]*?)\n\),/);
  if (!bloco) throw new Error("não achei o bloco `tabelas(...)` em auditoria-banco.sql");
  return [...bloco[1].matchAll(/\('([a-z0-9_]+)',/g)].map(m => m[1]).sort();
}

/** A condição SQL de leitura de uma tabela, a partir da lista do mapa. */
export function condicaoDe(alvos) {
  if (alvos.includes(TODOS)) return "true";
  const partes = [];
  const modulos = alvos.filter(a => a !== PROPRIO);
  if (modulos.length)
    partes.push(`public.pode_ver_algum(${modulos.map(m => `''${m}''`).join(", ")})`);
  if (alvos.includes(PROPRIO)) partes.push("user_id = auth.uid()");
  return partes.join(" or ");
}

/** Confere mapa × banco. Devolve a lista de problemas (vazia = tudo certo). */
export function conferir(tabelas, mapa = MAPA_TABELAS) {
  const problemas = [];
  const noMapa = new Set(Object.keys(mapa));
  for (const t of tabelas)
    if (!noMapa.has(t))
      problemas.push(`tabela SEM classificação de leitura: ${t} — classifique em src/acesso/mapa-tabelas.js`);
  for (const t of noMapa)
    if (!tabelas.includes(t))
      problemas.push(`o mapa cita uma tabela que não existe no banco: ${t}`);
  return problemas;
}

export function gerarSql(tabelas, mapa = MAPA_TABELAS) {
  // A vírgula vem ANTES do comentário, senão ela entra no `--` e a lista
  // de valores quebra — com o agravante de o SQL parecer certo aos olhos.
  const linhas = tabelas.map((t, i) => {
    const alvos = mapa[t];
    const rotulo = alvos.includes(TODOS) ? "todos os autenticados" : alvos.join(", ");
    const virgula = i < tabelas.length - 1 ? "," : "";
    return `      ('${t}', '${condicaoDe(alvos)}')${virgula}`
      .padEnd(101) + ` -- ${rotulo}`;
  });

  const abertas = tabelas.filter(t => mapa[t].includes(TODOS));

  return `-- ============================================================
-- Valentrax — RLS DE LEITURA: quem lê cada tabela
--
-- ⚠️ ARQUIVO GERADO — não edite à mão.
--    Regenere com:  node supabase/gerar-rls.mjs
--    A fonte é src/acesso/mapa-tabelas.js.
--
-- O QUE MUDA
-- Antes: toda política de SELECT era \`using (true)\` para \`authenticated\`.
-- Qualquer usuário logado lia qualquer tabela pela API REST — inclusive
-- \`pacientes\` (nome completo, CPF, CNS, nome da mãe, endereço) e todo o
-- prontuário. O menu escondia o módulo; o dado continuava alcançável.
-- Depois: a leitura passa pelo MESMO perfil que monta o menu.
--
-- É ADITIVO E REVERSÍVEL (ver "VOLTAR ATRÁS" no fim do arquivo). Não cria,
-- não altera e não apaga nenhuma tabela, coluna ou linha.
--
-- ⚠️ RODE NO DEMO PRIMEIRO. Depois no principal, ANTES do merge do código.
--    Na prática o código nem depende dele: quem publica a barreira é este
--    SQL. Rodar sozinho já fecha o acesso.
--
-- QUEM NÃO PERDE NADA HOJE
-- Todo mundo ainda está no perfil "Provisório", que concede todos os
-- módulos. Ou seja: aplicar isto agora NÃO tira acesso de ninguém — ele
-- passa a valer sozinho, pessoa por pessoa, conforme a TI reclassifica.
-- É a ordem certa: fechar a porta antes de distribuir as chaves.
--
-- ⚠️ SE ALGUÉM REEXECUTAR UMA MIGRAÇÃO ANTIGA, RODE ESTA DE NOVO.
--    As migrações antigas recriam a política \`for select ... using (true)\`
--    e a \`for all\` que a PARTE 2 desarma — reabrindo a leitura em silêncio.
--    Esta é idempotente: rodar duas vezes não faz mal.
-- ============================================================

-- Resolver \`my_role()\` sem prefixo é preciso na PARTE 2, que recria
-- políticas a partir do texto que o próprio Postgres devolve.
set search_path = public, extensions, pg_temp;


-- ════════════════════════════════════════════════════════════
-- PARTE 1/4 — AS FUNÇÕES DE PERMISSÃO
--
-- Espelham \`src/acesso/permissoes.js\`, nesta ordem: perfil → exceção
-- individual → travas. \`security definer\` porque a função precisa ler
-- \`profiles\` e \`perfis_permissoes\` por baixo do RLS delas.
-- ════════════════════════════════════════════════════════════

-- O nível efetivo desta pessoa neste módulo: nenhum | leitura | escrita.
create or replace function public.meu_nivel(p_modulo text)
returns text
language sql
stable
security definer
set search_path = public
as $meu_nivel$
  with me as (
    select id, role, perfil from public.profiles where id = auth.uid()
  ),
  bruto as (
    select coalesce(
      -- 1) a exceção individual manda (serve para AMPLIAR e para REDUZIR)
      (select up.nivel from public.usuarios_permissoes up, me
        where up.user_id = me.id and up.modulo = p_modulo),
      -- 2) o pacote do cargo
      (select pp.nivel from public.perfis_permissoes pp, me
        where pp.perfil_chave = me.perfil and pp.modulo = p_modulo),
      -- 3) sem perfil é sem acesso — falha FECHADA
      'nenhum'
    ) as nivel
  )
  select case
    -- Trava anti-trancamento: Usuários e Perfis é sempre, e só, do
    -- adm_master. Sem isto, um perfil configurado errado tranca o
    -- administrador do lado de fora e só se resolve pelo painel.
    when p_modulo = 'users' then
      case when (select role from me) = 'adm_master' then 'escrita' else 'nenhum' end
    -- Teto do visualizador: nunca escreve, tenha o perfil que tiver.
    when (select role from me) = 'visualizador' and (select nivel from bruto) = 'escrita' then
      'leitura'
    else (select nivel from bruto)
  end
$meu_nivel$;

-- Pode ABRIR o módulo? (leitura ou escrita)
create or replace function public.pode_ver(p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $pode_ver$
  select public.meu_nivel(p_modulo) in ('leitura', 'escrita')
$pode_ver$;

-- Pode abrir ALGUM destes? Uma tela lê tabela de vizinho por bom motivo:
-- o Giro de Leitos monta o mapa de risco com as escalas de enfermagem, o
-- Paciente 360 junta PS, leito, SCIH e PEP na mesma consulta.
create or replace function public.pode_ver_algum(variadic p_modulos text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $pode_ver_algum$
  select exists (select 1 from unnest(p_modulos) m where public.pode_ver(m))
$pode_ver_algum$;

-- Pode LANÇAR no módulo? Ainda não é usada por política nenhuma — a
-- escrita continua decidida por \`role\`. Fica pronta para a fase seguinte.
create or replace function public.pode_editar(p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $pode_editar$
  select public.meu_nivel(p_modulo) = 'escrita'
$pode_editar$;


-- ════════════════════════════════════════════════════════════
-- PARTE 2/4 — DESARMAR AS POLÍTICAS "FOR ALL"
--
-- ISTO É O QUE FAZ A PARTE 3 VALER ALGUMA COISA. Treze tabelas têm uma
-- política \`for all to authenticated using (my_role() in
-- ('adm_master','adm_silver'))\`. "FOR ALL" inclui SELECT, e políticas
-- permissivas se SOMAM: bastaria essa para qualquer adm_silver — médico,
-- enfermeiro, recepção, quase todo mundo — continuar lendo a tabela
-- inteira, por cima da política nova. A porta nova ficaria ao lado de uma
-- porta velha destrancada.
--
-- Aqui cada FOR ALL vira três políticas (insert/update/delete) com a
-- MESMA condição de antes. Ninguém ganha nem perde direito de escrita;
-- só o SELECT sai de dentro delas.
--
-- Roda sobre o que o BANCO tem de fato, não sobre uma lista — assim
-- alcança também a política que a Laura tenha criado no meio do caminho.
-- ════════════════════════════════════════════════════════════
do $converter$
declare
  p record;
  q text;
  w text;
  qtd int := 0;
begin
  -- Tabela temporária: alterar o catálogo no meio de um cursor sobre o
  -- próprio catálogo é pedir surpresa. Materializa antes, mexe depois.
  -- (Os apelidos fogem de \`n\`/\`t\`/\`p\` de propósito: apelido igual a
  -- variável do PL/pgSQL vira "ambiguous column reference" em execução.)
  create temp table _rls_forall on commit drop as
    select c.relname::text as tabela,
           pol.polname::text as nome,
           pg_get_expr(pol.polqual,      pol.polrelid) as usando,
           pg_get_expr(pol.polwithcheck, pol.polrelid) as checando,
           case when pol.polroles = '{0}'::oid[] then 'public'
                else (select string_agg(quote_ident(r.rolname), ', ')
                        from pg_roles r where r.oid = any(pol.polroles)) end as papeis
      from pg_policy pol
      join pg_class c      on c.oid = pol.polrelid
      join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = 'public'
     where pol.polcmd = '*';

  for p in select * from _rls_forall loop
    q := coalesce(p.usando, 'true');
    w := coalesce(p.checando, q);
    execute format('drop policy %I on public.%I', p.nome, p.tabela);
    execute format('create policy %I on public.%I for insert to %s with check (%s)',
                   left(p.nome, 55) || '_ins', p.tabela, p.papeis, w);
    execute format('create policy %I on public.%I for update to %s using (%s) with check (%s)',
                   left(p.nome, 55) || '_upd', p.tabela, p.papeis, q, w);
    execute format('create policy %I on public.%I for delete to %s using (%s)',
                   left(p.nome, 55) || '_del', p.tabela, p.papeis, q);
    qtd := qtd + 1;
    raise notice 'FOR ALL desarmada: % (%) -> insert/update/delete', p.tabela, p.nome;
  end loop;

  raise notice '% politica(s) FOR ALL convertida(s).', qtd;
  drop table _rls_forall;
end
$converter$;


-- ════════════════════════════════════════════════════════════
-- PARTE 3/4 — A POLÍTICA DE LEITURA DE CADA TABELA
--
-- Uma linha por tabela: o nome e quem pode ler. O comentário à direita é
-- a mesma coisa em português. ${abertas.length} das ${tabelas.length} tabelas ficam abertas a
-- qualquer autenticado — são catálogo, referência e configuração, sem
-- nenhum dado de paciente. Isso é DECISÃO declarada, não sobra: negar
-- \`farm_medicamentos\` desligaria o motor de alertas dentro do PS e do PEP.
--
-- Toda política de SELECT anterior da tabela é apagada antes (os nomes
-- variam: atend_select, cidref_select, saidas_select…).
--
-- ⚠️ ESCRITA: ligar o RLS numa tabela que NÃO tinha política de escrita
-- trancaria a escrita — RLS ligado sem política nega tudo. Várias tabelas
-- (todo o NSP, a enfermagem SAE/escalas/LPP, as faixas de triagem) viviam
-- com RLS DESLIGADO, ou seja, escrita aberta a qualquer login. Este PR
-- fecha LEITURA e promete não mexer em escrita: então, onde não havia
-- política de escrita, recriamos a escrita ABERTA que existia. Apertar
-- escrita por papel é fase própria — a função \`pode_editar\` já está pronta
-- para ela. (Tabela com \`for all\` não cai aqui: a PARTE 2 já a converteu em
-- insert/update/delete com a condição de papel original.)
-- ════════════════════════════════════════════════════════════
do $leitura$
declare
  t record;
  pol record;
  qtd int := 0;
  reabriu int := 0;
  faltando text[] := '{}';
begin
  for t in
    select * from (values
${linhas.join("\n")}
    ) as v(tabela, cond)
  loop
    if not exists (
      select 1 from information_schema.tables
       where table_schema = 'public' and table_name = t.tabela
    ) then
      faltando := faltando || t.tabela;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t.tabela);

    for pol in
      select antiga.polname
        from pg_policy antiga
        join pg_class c      on c.oid = antiga.polrelid
        join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = 'public'
       where c.relname = t.tabela and antiga.polcmd = 'r'
    loop
      execute format('drop policy %I on public.%I', pol.polname, t.tabela);
    end loop;

    execute format('create policy %I on public.%I for select to authenticated using (%s)',
                   t.tabela || '_leitura', t.tabela, t.cond);
    qtd := qtd + 1;

    -- Preserva a escrita aberta: só quando a tabela não tem NENHUMA política
    -- de escrita (insert/update/delete/all). Se tiver, foi a PARTE 2 ou a
    -- migração da tabela que a definiu — não encostar. O guard também torna
    -- isto idempotente: na segunda passada as três já existem e o bloco pula.
    if not exists (
      select 1 from pg_policy pw
        join pg_class cw      on cw.oid = pw.polrelid
        join pg_namespace nw  on nw.oid = cw.relnamespace and nw.nspname = 'public'
       where cw.relname = t.tabela and pw.polcmd in ('a','w','d','*')
    ) then
      execute format('create policy %I on public.%I for insert to authenticated with check (true)',
                     t.tabela || '_escrita_ins', t.tabela);
      execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)',
                     t.tabela || '_escrita_upd', t.tabela);
      execute format('create policy %I on public.%I for delete to authenticated using (true)',
                     t.tabela || '_escrita_del', t.tabela);
      reabriu := reabriu + 1;
    end if;
  end loop;

  raise notice '% tabela(s) com politica de leitura por modulo.', qtd;
  raise notice '% tabela(s) sem escrita propria: escrita aberta preservada.', reabriu;
  if array_length(faltando, 1) > 0 then
    raise notice 'PULADAS (nao existem neste banco): %', array_to_string(faltando, ', ');
  end if;
end
$leitura$;


-- ════════════════════════════════════════════════════════════
-- PARTE 4/4 — CONFERÊNCIA
--
-- Uma consulta só, de propósito: o SQL Editor mostra o resultado da
-- ÚLTIMA consulta, então três selects separados esconderiam justamente os
-- dois primeiros, que são os que acusam problema. Os ❌ vêm no topo.
-- ════════════════════════════════════════════════════════════
with esperadas_abertas(tabela) as (values
${abertas.map(t => `  ('${t}')`).join(",\n")}
),
politicas as (
  select c.relname::text as tabela,
         pol.polname::text as politica,
         pol.polcmd as cmd,
         coalesce(pg_get_expr(pol.polqual, pol.polrelid), 'true') as condicao
    from pg_policy pol
    join pg_class c      on c.oid = pol.polrelid
    join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = 'public'
),
-- ❌ Leitura ainda aberta em tabela que o mapa NÃO autorizou. Zero linha
--    é o resultado certo.
aberta_indevida as (
  select 0 as ord, '❌ LEITURA AINDA ABERTA' as situacao, tabela as item,
         politica || ' — ' || condicao as detalhe
    from politicas
   where cmd in ('r', '*')
     and condicao in ('true', '(true)')
     and tabela not in (select tabela from esperadas_abertas)
),
-- ❌ Alguém sem perfil não lê mais NADA (falha fechada, de propósito).
--    Classifique essas pessoas em Usuários e Perfis.
sem_perfil as (
  select 1, '❌ USUARIO SEM PERFIL', coalesce(username, '(sem username)'),
         coalesce(nome, '') || ' · ' || coalesce(role, '')
    from public.profiles where perfil is null
),
-- ✅ O retrato final: quem lê cada tabela.
retrato as (
  select 2, case when condicao in ('true', '(true)')
                 then '✅ catalogo (todos)' else '✅ por modulo' end,
         tabela, condicao
    from politicas where cmd = 'r'
)
select situacao, item, detalhe from (
  select * from aberta_indevida
  union all select * from sem_perfil
  union all select * from retrato
) tudo
order by ord, situacao, item;


-- ════════════════════════════════════════════════════════════
-- VOLTAR ATRÁS
--
-- Se alguma tela essencial esvaziar em pleno plantão e não der tempo de
-- achar a causa, isto devolve a leitura como estava antes (aberta a
-- qualquer autenticado) sem tocar em dado nenhum:
--
--   do $$
--   declare t record;
--   begin
--     for t in select c.relname from pg_policy p
--                join pg_class c on c.oid = p.polrelid
--                join pg_namespace n on n.oid = c.relnamespace
--               where n.nspname = 'public' and p.polname = c.relname || '_leitura'
--     loop
--       execute format('drop policy %I on public.%I', t.relname || '_leitura', t.relname);
--       execute format('create policy %I on public.%I for select to authenticated using (true)',
--                      t.relname || '_leitura', t.relname);
--     end loop;
--   end $$;
--
-- Reabrir é o último recurso, não o primeiro: quase sempre o certo é
-- acrescentar o módulo que falta ao perfil da pessoa, na tela de Usuários.
-- ============================================================
`;
}

/** Caminhos dos dois arquivos, para o gerador e para o teste usarem os mesmos. */
export const ARQUIVO_AUDITORIA = path.join(dir, "auditoria-banco.sql");
export const ARQUIVO_RLS = path.join(dir, "migracao-rls-leitura.sql");

// ── execução ────────────────────────────────────────────────
// Só quando chamado pela linha de comando: o teste importa as funções
// puras daqui e não pode disparar escrita de arquivo ao fazer isso.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const tabelas = tabelasDoBanco(fs.readFileSync(ARQUIVO_AUDITORIA, "utf8"));

  const problemas = conferir(tabelas);
  if (problemas.length) {
    console.error("\n❌ mapa de leitura e banco não batem:");
    for (const p of problemas) console.error(`   ${p}`);
    console.error("");
    process.exit(1);
  }

  fs.writeFileSync(ARQUIVO_RLS, gerarSql(tabelas), "utf8");
  const abertas = tabelas.filter(t => MAPA_TABELAS[t].includes(TODOS)).length;
  console.log(`migracao-rls-leitura.sql gerado: ${tabelas.length} tabelas `
    + `(${tabelas.length - abertas} por módulo, ${abertas} de catálogo/referência).`);
}
