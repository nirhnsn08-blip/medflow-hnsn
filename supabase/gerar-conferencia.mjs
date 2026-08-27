// ============================================================
// Valentrax — GERADOR DO CONFERIDOR DE MIGRAÇÕES
//
// Lê os arquivos de migração da pasta e reescreve
// `conferir-migracoes.sql` com a lista real. Rode sempre que criar uma
// migração nova:
//
//     node supabase/gerar-conferencia.mjs
//
// POR QUE ISTO EXISTE
// A lista de migrações mantida à mão fica cega justamente na mais nova —
// que é a menos rodada e a mais provável de faltar em algum dos bancos. É
// o mesmo motivo do `gerar-auditoria.mjs`, e a mesma solução: derivar do
// repositório em vez de lembrar.
//
// Com duas pessoas mexendo no banco, isso deixa de ser conforto e vira
// necessidade: se a Laura criar `migracao-x.sql` e rodar só no demo, o
// conferidor no principal vai apontar a falta sem que ninguém precise ter
// avisado ninguém.
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

// `reconstruir-banco.sql` é a concatenação das outras; `seed-teste-*` é
// dado de teste, não estrutura; `conferir-*`, `teste-*` e `limpeza-*` não
// alteram o esquema. Nada disso é migração.
const arquivos = fs.readdirSync(dir)
  .filter(f => f.startsWith("migracao-") && f.endsWith(".sql"))
  .sort();

if (!arquivos.length) {
  console.error("nenhuma migração encontrada em " + dir);
  process.exit(1);
}

// A descrição sai do cabeçalho do próprio arquivo — assim a explicação
// mora junto da migração e não numa lista paralela que envelhece.
//
// Pula moldura e frases de instrução ("Rodar UMA vez…", "POR QUE ESTA
// MIGRAÇÃO EXISTE"): são seção, não descrição. Interessa a primeira linha
// que diz o que a migração FAZ.
const LIXO = /^(por que|rodar uma vez|rode |rode$|⚠|arquivo gerado|valentrax|obs|como aplicar|atenção)/i;
const descricao = f => {
  const linhas = fs.readFileSync(path.join(dir, f), "utf8").split(/\r?\n/).slice(0, 20);
  for (const l of linhas) {
    const t = l.replace(/^--\s?/, "").trim();
    if (!t || /^[═─=-]+$/.test(t) || LIXO.test(t)) continue;
    return t
      .replace(/'/g, "''")
      // ⚠️ `--` DENTRO DA STRING é SQL válido e mesmo assim é armadilha:
      // toda ferramenta que corta comentário por regex decapita a string
      // ali e o resto do arquivo vira "dentro de aspas". Foi o que o
      // `validar-sql.mjs` desta casa acusou como parêntese aberto.
      .replace(/--+/g, "·")
      .slice(0, 90);
  }
  // Sem cabeçalho útil, o nome do arquivo já diz mais que nada.
  return f.replace(/^migracao-/, "").replace(/\.sql$/, "").replace(/-/g, " ");
};

const linhas = arquivos
  .map(f => `  ('${f}', '${descricao(f)}')`)
  .join(",\n");

const sql = `-- ============================================================
-- Valentrax — O QUE FALTA RODAR NESTE BANCO
--
-- Rode em QUALQUER um dos dois bancos. Ele compara os arquivos que
-- existem no repositório com os que ESTE banco diz ter aplicado.
--
-- ⚠️ ARQUIVO GERADO — não edite à mão. Ao criar uma migração, rode:
--        node supabase/gerar-conferencia.mjs
--
-- ⚠️ DEPENDE DE \`migracoes_aplicadas\`. Se a tabela não existir, rode antes
--    \`migracao-registro-de-migracoes.sql\` — ela cria o registro e anota as
--    que já rodaram.
--
-- ⚠️ E CADA MIGRAÇÃO NOVA PRECISA TERMINAR COM ESTA LINHA:
--
--        insert into public.migracoes_aplicadas (arquivo)
--        values ('migracao-SEU-NOME-AQUI.sql') on conflict do nothing;
--
--    Sem ela a migração roda e não se anota — e o conferidor vai pedir
--    para rodar de novo, para sempre.
--
-- Cobertura: ${arquivos.length} migrações.
-- ============================================================

-- quem está rodando? (opcional, mas ajuda quando são duas pessoas)
-- set valentrax.quem = 'seu-nome';

with esperadas(arquivo, o_que_faz) as (values
${linhas}
)
select
  case when a.arquivo is null then '>>> FALTA — rode este' else 'ok' end as situacao,
  e.arquivo,
  e.o_que_faz,
  to_char(a.aplicada_em, 'DD/MM/YYYY HH24:MI') as quando,
  a.aplicada_por as quem
from esperadas e
left join public.migracoes_aplicadas a on a.arquivo = e.arquivo
order by situacao, e.arquivo;

-- ── e o contrário: rodou algo que não está mais no repositório? ──
-- Não é erro: pode ser migração antiga renomeada. Mas vale saber.
select a.arquivo as registrada_mas_sem_arquivo,
       to_char(a.aplicada_em, 'DD/MM/YYYY') as quando, a.aplicada_por as quem
from public.migracoes_aplicadas a
where a.arquivo not in (${arquivos.map(f => `'${f}'`).join(", ")})
order by a.arquivo;

-- ── qual banco é este? ──────────────────────────────────────
-- As duas abas do SQL Editor são idênticas; a única diferença visível é
-- uma string na barra de endereço.
select
  case when (select count(*) from public.pacientes) >= 40
       then 'DEMO (banco de teste)' else 'PRINCIPAL (hospital)' end as banco,
  (select count(*) from public.pacientes) as pacientes,
  (select count(*) from public.migracoes_aplicadas) as migracoes_registradas;
`;

fs.writeFileSync(path.join(dir, "conferir-migracoes.sql"), sql);

// ── e o script que anota as que JÁ rodaram ──────────────────
// A mesma lista serve aos dois arquivos. Duplicá-la seria criar a chance
// de eles discordarem — e o conferidor perderia a razão de existir.
const cab = [
  "-- ============================================================",
  "-- Valentrax — ANOTAR AS MIGRAÇÕES QUE JÁ RODARAM NESTE BANCO",
  "--",
  "-- Rode UMA VEZ por banco, logo depois de migracao-registro-de-migracoes.sql.",
  "--",
  "-- ⚠️ ARQUIVO GERADO — não edite à mão (node supabase/gerar-conferencia.mjs).",
  "--",
  "-- ⚠️ O QUE ELE ASSUME, E COMO CONFERIR ANTES DE ACREDITAR",
  `-- Ele marca as ${arquivos.length} migrações do repositório como aplicadas. A`,
  "-- suposição é que o esquema deste banco está completo — razoável num",
  "-- sistema em uso, mas NÃO é fato até alguém olhar.",
  "--",
  "-- Quem responde isso é o auditoria-banco.sql: ele confere, coluna por",
  "-- coluna, se o banco tem tudo o que deveria. RODE ELE ANTES. Se acusar",
  '-- "❌ FALTANDO", NÃO rode este arquivo — a migração correspondente não',
  "-- rodou, e marcá-la como aplicada esconderia justamente o que procuramos.",
  "-- ============================================================",
  "",
  "insert into public.migracoes_aplicadas (arquivo, aplicada_por, observacao)",
  "values",
].join("\n");

const valores = arquivos
  .map(f => `  ('${f}', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql')`)
  .join(",\n");

const rodape = [
  "on conflict (arquivo) do nothing;",
  "",
  "select",
  "  case when (select count(*) from public.pacientes) >= 40",
  "       then 'DEMO (banco de teste)' else 'PRINCIPAL (hospital)' end as banco,",
  "  (select count(*) from public.migracoes_aplicadas) as registradas,",
  `  ${arquivos.length} as esperadas;`,
  "",
].join("\n");

fs.writeFileSync(path.join(dir, "anotar-migracoes-existentes.sql"), `${cab}\n${valores}\n${rodape}`);

console.log(`regenerados a partir de ${arquivos.length} migrações:`);
console.log("  conferir-migracoes.sql");
console.log("  anotar-migracoes-existentes.sql");
