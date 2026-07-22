// ============================================================
// Valentrax — VALIDADOR ESTRUTURAL DOS SCRIPTS SQL
//
//     node supabase/validar-sql.mjs
//
// Confere se cada .sql de supabase/ é sintaticamente plausível ANTES de
// alguém tentar rodá-lo num banco. Pega o erro que passou despercebido
// por muito tempo: linhas de `create table` perdidas numa consolidação,
// deixando colunas órfãs — o arquivo parece certo aos olhos e só quebra
// na hora de criar um banco novo.
//
// POR QUE ISTO EXISTE
// O `schema.sql` ficou com o `create table public.sup_cotacoes (` faltando.
// Ninguém notou porque o banco principal foi construído incrementalmente e
// o schema.sql nunca é re-executado. Só apareceu ao tentar levantar o banco
// demo do zero — ou seja, no momento em que subir um hospital novo
// dependeria dele.
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

// Tipos comuns do Postgres — usados para reconhecer uma linha de coluna
const TIPOS = "text|int|int4|int8|bigint|smallint|serial|bigserial|numeric|decimal|real|"
  + "double|jsonb|json|boolean|bool|timestamptz|timestamp|date|time|uuid|bytea|char|varchar";

let problemas = 0;

const arquivos = fs.readdirSync(dir)
  .filter(f => f.endsWith(".sql") && f !== "reconstruir-banco.sql")
  .sort();

for (const arquivo of arquivos) {
  const bruto = fs.readFileSync(path.join(dir, arquivo), "utf8");
  const linhas = bruto.split(/\r?\n/);

  let prof = 0;              // profundidade de parênteses
  let emString = false;      // dentro de '...'
  let emDolar = false;       // dentro de $$...$$
  const achados = [];

  linhas.forEach((linha, i) => {
    const n = i + 1;
    const semComentario = linha.replace(/--.*$/, "");

    // alterna blocos $$ ... $$ (corpo de função: ignorar parênteses de dentro)
    const dolares = (semComentario.match(/\$[a-z_]*\$/gi) || []).length;
    if (dolares % 2 === 1) emDolar = !emDolar;
    if (emDolar) return;

    // coluna órfã: linha que parece definição de coluna fora de qualquer
    // parêntese aberto — sinal de `create table (` perdido
    if (prof === 0 && new RegExp(`^\\s+[a-z_][a-z0-9_]*\\s+(${TIPOS})\\b`, "i").test(semComentario)) {
      achados.push({ n, tipo: "COLUNA ORFA", txt: linha.trim() });
    }

    for (const ch of semComentario) {
      if (ch === "'") emString = !emString;
      if (emString) continue;
      if (ch === "(") prof++;
      else if (ch === ")") {
        prof--;
        if (prof < 0) {
          achados.push({ n, tipo: "PARENTESE A MAIS", txt: linha.trim() });
          prof = 0;
        }
      }
    }
  });

  if (prof !== 0) achados.push({ n: linhas.length, tipo: `PARENTESE ABERTO (faltam ${prof} fechar)`, txt: "" });

  if (achados.length) {
    problemas += achados.length;
    console.log(`\n❌ ${arquivo}`);
    for (const a of achados) console.log(`   linha ${a.n}: ${a.tipo}${a.txt ? ` — ${a.txt}` : ""}`);
  }
}

if (problemas === 0) {
  console.log(`✅ ${arquivos.length} arquivos conferidos, nenhum problema estrutural.`);
} else {
  console.log(`\n${problemas} problema(s) encontrado(s).`);
  process.exit(1);
}
