// ═══════════════════════════════════════════════════════════
// REGISTRAR A VERSÃO DAS MIGRAÇÕES QUE JÁ RODARAM
//
// 🔴 RODE ISTO DEPOIS DE RODAR O SQL NOS DOIS BANCOS, nunca antes.
//
// O registro (`migracoes-versoes.json`) é a resposta para uma pergunta que
// nenhuma outra ferramenta deste projeto responde: **a versão ATUAL deste
// arquivo é a que está no banco?**
//
//   · `conferir-migracoes.sql` compara NOMES com `migracoes_aplicadas`;
//   · a sonda REST enxerga estrutura, não corpo de função;
//   · `migracoes_aplicadas` guarda `arquivo`, não qual versão dele rodou.
//
// Por isso, quando uma migração publicada é CORRIGIDA, nada avisa — foi o
// que aconteceu em 15/10/2026 com a impressão digital, cujo gatilho foi
// trocado depois de já ter rodado.
//
// ⚠️ ATUALIZAR O REGISTRO É UMA AFIRMAÇÃO: "eu rodei isto nos dois bancos".
// Rodar este script sem ter rodado o SQL faz o registro mentir, e aí ele
// fica pior que não existir — porque passa a dar permissão.
//
// Uso:
//   node supabase/registrar-versoes.mjs            lista o que mudou e pergunta
//   node supabase/registrar-versoes.mjs --aplicar  grava
// ═══════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const REGISTRO = path.join(DIR, "migracoes-versoes.json");
const APLICAR = process.argv.includes("--aplicar");

const migracoes = () => fs.readdirSync(DIR)
  .filter(f => f === "schema.sql" || (f.startsWith("migracao-") && f.endsWith(".sql")))
  .sort();

const hashDe = f =>
  createHash("sha256").update(fs.readFileSync(path.join(DIR, f))).digest("hex").slice(0, 16);

const atual = fs.existsSync(REGISTRO) ? JSON.parse(fs.readFileSync(REGISTRO, "utf8")) : {};
const noDisco = migracoes();

const novas = noDisco.filter(f => !atual[f]);
const mudaram = noDisco.filter(f => atual[f] && atual[f] !== hashDe(f));
const sumiram = Object.keys(atual).filter(f => !noDisco.includes(f));

if (!novas.length && !mudaram.length && !sumiram.length) {
  console.log(`✅ O registro está em dia: ${noDisco.length} migrações.`);
  process.exit(0);
}

if (mudaram.length) {
  console.log(`\n🔴 ${mudaram.length} migração(ões) MUDARAM depois de registradas:`);
  for (const f of mudaram) console.log(`   ${f}`);
  console.log("\n   ⚠️ Se a mudança altera COMPORTAMENTO, ela precisa rodar de novo");
  console.log("      nos DOIS bancos antes de entrar aqui. `migracoes_aplicadas` não");
  console.log("      vai avisar: ela guarda o nome do arquivo, não a versão.");
}
if (novas.length) {
  console.log(`\n+ ${novas.length} migração(ões) nova(s):`);
  for (const f of novas) console.log(`   ${f}`);
}
if (sumiram.length) {
  console.log(`\n- ${sumiram.length} registro(s) de arquivo que não existe mais:`);
  for (const f of sumiram) console.log(`   ${f}`);
}

if (!APLICAR) {
  console.log("\nNada foi gravado. Depois de rodar o SQL nos dois bancos:");
  console.log("   node supabase/registrar-versoes.mjs --aplicar\n");
  process.exit(0);
}

const novo = {};
for (const f of noDisco) novo[f] = hashDe(f);
fs.writeFileSync(REGISTRO, JSON.stringify(novo, null, 2) + "\n", "utf8");
console.log(`\n✅ Registro gravado: ${noDisco.length} migrações.`);
