// ============================================================
// Valentrax — GERADOR DA AUDITORIA DE BANCO
//
// Lê todos os .sql de supabase/ e reescreve `auditoria-banco.sql` com a
// lista completa de tabelas e colunas que o banco DEVERIA ter.
//
// Rode sempre que criar uma migração nova:
//     node supabase/gerar-auditoria.mjs
//
// POR QUE ISTO EXISTE
// A lista era mantida à mão e ficava cega justamente ao módulo mais
// recente — o menos testado. Aconteceu duas vezes: com as 8 tabelas de
// Estoque & Compras, e de novo com `ps_salas` e `ps_protocolos`. Uma
// auditoria que não cobre o código novo é pior do que não ter auditoria,
// porque dá falsa confiança.
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

// Palavras que aparecem onde um nome de coluna apareceria, mas não são coluna
const NAO_COLUNA = /^(primary|unique|foreign|check|constraint|exclude|like|partition)$/i;

const tabelas = new Map();   // tabela -> arquivo de origem
const colunas = new Map();   // "tabela.coluna" -> { t, c, org }

const origemDe = f => f.replace(/^migracao-/, "").replace(/\.sql$/, "");
const limpa = s => s.toLowerCase().replace(/^public\./, "").replace(/"/g, "");

const arquivos = fs.readdirSync(dir)
  .filter(f => f.endsWith(".sql") && !f.startsWith("auditoria-"))
  .sort();

for (const f of arquivos) {
  const org = origemDe(f);
  const sql = fs.readFileSync(path.join(dir, f), "utf8").replace(/--[^\n]*/g, "");

  // ---- CREATE TABLE nome ( ... ) — varre casando parênteses
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z0-9_."]+)\s*\(/gi;
  let m;
  while ((m = re.exec(sql))) {
    const t = limpa(m[1]);
    if (!tabelas.has(t)) tabelas.set(t, org);

    let i = re.lastIndex, prof = 1, corpo = "";
    while (i < sql.length && prof > 0) {
      const ch = sql[i];
      if (ch === "(") prof++;
      else if (ch === ")") { prof--; if (!prof) break; }
      corpo += ch; i++;
    }

    // divide por vírgulas de nível 0 (ignora as de dentro de numeric(10,2))
    let nivel = 0, atual = "";
    const partes = [];
    for (const ch of corpo) {
      if (ch === "(") nivel++;
      else if (ch === ")") nivel--;
      if (ch === "," && nivel === 0) { partes.push(atual); atual = ""; }
      else atual += ch;
    }
    partes.push(atual);

    for (const p of partes) {
      const c = limpa((p.trim().split(/\s+/)[0]) || "");
      if (c && !NAO_COLUNA.test(c) && !colunas.has(`${t}.${c}`))
        colunas.set(`${t}.${c}`, { t, c, org });
    }
  }

  // ---- ALTER TABLE nome ADD COLUMN col (várias no mesmo comando)
  const reA = /alter\s+table\s+(?:if\s+exists\s+)?([a-z0-9_."]+)([\s\S]*?);/gi;
  while ((m = reA.exec(sql))) {
    const t = limpa(m[1]);
    const reC = /add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z0-9_"]+)/gi;
    let c;
    while ((c = reC.exec(m[2]))) {
      const col = limpa(c[1]);
      if (!colunas.has(`${t}.${col}`)) colunas.set(`${t}.${col}`, { t, c: col, org });
    }
  }
}

const vTab = [...tabelas.entries()].sort()
  .map(([t, o]) => `  ('${t}','${o}')`).join(",\n");
const vCol = [...colunas.values()]
  .sort((a, b) => (a.t + a.c).localeCompare(b.t + b.c))
  .map(({ t, c, org }) => `  ('${t}','${c}','${org}')`).join(",\n");

const sql = `-- ============================================================
-- Valentrax — AUDITORIA DO BANCO (SOMENTE LEITURA — não altera nada)
-- Rode o script INTEIRO no Supabase → SQL Editor.
--
-- Confere: tabelas, colunas, RLS ligado, políticas, funções e trigger de auth.
-- Leia a coluna "situacao". Os problemas (❌) vêm sempre no topo.
--   ❌ FALTANDO      → falta rodar a migração indicada em "origem"
--   ❌ RLS DESLIGADO → tabela exposta: qualquer usuário logado lê tudo
--   ❌ SEM POLÍTICA  → RLS ligado sem regra: a tela fica vazia para todos
--
-- ⚠️ ARQUIVO GERADO — não edite à mão. Ao criar uma migração nova, rode:
--        node supabase/gerar-auditoria.mjs
--    Editar na mão faz a auditoria ficar cega ao módulo novo (já aconteceu
--    duas vezes) e passar a reportar "tudo ok" sem olhar tabelas inteiras.
--
-- Cobertura atual: ${tabelas.size} tabelas, ${colunas.size} colunas.
-- ============================================================

with
tabelas(nome, origem) as (values
${vTab}
),
colunas(tabela, coluna, origem) as (values
${vCol}
),
funcoes(nome) as (values ('my_role'), ('handle_new_user')),

chk_tab as (
  select 0 as ord, 'TABELA' as categoria, t.nome as item, t.origem as origem,
    case when it.table_name is null then '❌ FALTANDO' else '✅ ok' end as situacao,
    case when it.table_name is null then 1 else 0 end as prob
  from tabelas t
  left join information_schema.tables it
    on it.table_schema='public' and it.table_name=t.nome
),
chk_col as (
  select 1, 'COLUNA', c.tabela||'.'||c.coluna, c.origem,
    case when ic.column_name is null then '❌ FALTANDO' else '✅ ok' end,
    case when ic.column_name is null then 1 else 0 end
  from colunas c
  left join information_schema.columns ic
    on ic.table_schema='public' and ic.table_name=c.tabela and ic.column_name=c.coluna
),
chk_rls as (
  select 2, 'RLS (segurança)', t.nome, t.origem,
    case when cl.relrowsecurity then '✅ ativo' else '❌ RLS DESLIGADO' end,
    case when cl.relrowsecurity then 0 else 1 end
  from tabelas t
  join pg_class cl on cl.relname=t.nome
  join pg_namespace ns on ns.oid=cl.relnamespace and ns.nspname='public'
),
-- RLS ligado SEM nenhuma política bloqueia todo mundo: a tela fica vazia
-- e o app não mostra erro nenhum. É o defeito mais difícil de perceber.
chk_pol as (
  select 3, 'POLÍTICAS', t.nome, t.origem,
    case when count(p.polname)=0 then '❌ SEM POLÍTICA'
         else '✅ '||count(p.polname)||' política(s)' end,
    case when count(p.polname)=0 then 1 else 0 end
  from tabelas t
  join pg_class cl on cl.relname=t.nome
  join pg_namespace ns on ns.oid=cl.relnamespace and ns.nspname='public'
  left join pg_policy p on p.polrelid=cl.oid
  group by t.nome, t.origem
),
chk_fn as (
  select 4, 'FUNÇÃO', f.nome, 'auth/permissões',
    case when p.proname is null then '❌ FALTANDO' else '✅ ok' end,
    case when p.proname is null then 1 else 0 end
  from funcoes f
  left join pg_proc p on p.proname=f.nome
  left join pg_namespace n on n.oid=p.pronamespace and n.nspname='public'
),
chk_trg as (
  select 5, 'TRIGGER', 'on_auth_user_created', 'criação de perfil no login',
    case when count(*)=0 then '❌ FALTANDO' else '✅ ok' end,
    case when count(*)=0 then 1 else 0 end
  from pg_trigger where tgname='on_auth_user_created'
),
tudo as (
  select * from chk_tab union all select * from chk_col union all
  select * from chk_rls union all select * from chk_pol union all
  select * from chk_fn  union all select * from chk_trg
)
select categoria, item, situacao, origem
from tudo
order by prob desc, ord, item;
`;

fs.writeFileSync(path.join(dir, "auditoria-banco.sql"), sql, "utf8");
console.log(`auditoria-banco.sql regenerado: ${tabelas.size} tabelas, ${colunas.size} colunas`);
