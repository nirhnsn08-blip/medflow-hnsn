// ═══════════════════════════════════════════════════════════
// MERGEAR COM CONFERÊNCIA — a trava que o GitHub não está fazendo
//
//     npm run mergear            (o PR do branch atual)
//     npm run mergear 205        (um PR específico)
//     npm run mergear 205 --seco (confere e NÃO mergeia)
//
// 🔴 POR QUE ISTO EXISTE. O CI deste repositório NÃO barra merge:
// `gh pr merge` não consulta o GitHub Actions, e a Vercel publica no
// hospital independente do resultado. Em 27/08 e de novo em 01/09/2026 a
// `main` foi para o vermelho e ninguém soube — quatro vezes.
//
// A trava de verdade é *branch protection*, no GitHub, e ela exige
// permissão de ADMIN no repositório. Quem roda isto aqui tem `push`, não
// `admin`. Enquanto o dono não ligar lá, esta é a barreira que existe.
//
// ⚠️ ELA É UMA BARREIRA DE HÁBITO, NÃO DE SERVIDOR. `gh pr merge` continua
// funcionando por fora. Isto não substitui branch protection — reduz a
// chance de esquecer, que foi o que aconteceu nas quatro vezes.
//
// ── A CONFERÊNCIA QUE QUASE NINGUÉM FAZ ─────────────────────
// Verde não basta: verde PRECISA SER DO COMMIT QUE ESTÁ NO TOPO DO PR.
// Um `git push` depois do CI deixa o check verde apontando para o commit
// ANTERIOR — e a tela de PR continua mostrando um ✓ tranquilizador.
// ═══════════════════════════════════════════════════════════

import { execFileSync } from "node:child_process";

const arg = process.argv.slice(2);
const seco = arg.includes("--seco");
const numero = arg.find(a => /^\d+$/.test(a));

const gh = (...a) => execFileSync("gh", a, { encoding: "utf8" }).trim();
const erro = (...m) => { console.error("\n🔴 " + m.join(" ") + "\n"); process.exit(1); };
const ok = m => console.log("  ✅ " + m);

let pr;
try {
  const campos = "number,title,state,mergeable,mergeStateStatus,headRefName,headRefOid,baseRefName,isDraft";
  pr = JSON.parse(numero ? gh("pr", "view", numero, "--json", campos) : gh("pr", "view", "--json", campos));
} catch {
  erro(numero
    ? `Não achei o PR #${numero}.`
    : "Nenhum PR para o branch atual. Passe o número: npm run mergear <n>");
}

console.log(`\n📋 PR #${pr.number} — ${pr.title}`);
console.log(`   ${pr.headRefName} → ${pr.baseRefName} · topo em ${pr.headRefOid.slice(0, 7)}\n`);

// ── 1. o PR está aberto e não é rascunho ────────────────────
if (pr.state !== "OPEN") erro(`O PR está ${pr.state}, não OPEN.`);
if (pr.isDraft) erro("O PR está como rascunho (draft).");
ok("aberto e pronto para revisão");

// ── 2. o GitHub considera mergeável ─────────────────────────
if (pr.mergeable === "CONFLICTING") erro("Há CONFLITO com a base. Resolva antes.");
if (pr.mergeable !== "MERGEABLE") erro(`O GitHub ainda calcula o merge (mergeable = ${pr.mergeable}). Rode de novo em alguns segundos.`);
// 🔴 `UNSTABLE` É RECUSA, NÃO AVISO. É o GitHub dizendo "mergeável, mas há
// check que não passou" — e inclui o caso mais traiçoeiro: o check do
// commit novo AINDA NÃO FOI CRIADO.
//
// Esta linha nasceu de um furo desta própria ferramenta. Ao testá-la com um
// push logo depois do CI, ela respondeu "1 check, todos verdes" seis
// segundos após o push: o único check concluído era o da Vercel, e o
// `build` nem existia ainda. A conferência do commit (item 4) passou, porque
// o check que existia era mesmo do topo. Contar só o que EXISTE não vê o
// que falta — e `UNSTABLE` vê.
if (pr.mergeStateStatus === "UNSTABLE" || pr.mergeStateStatus === "BLOCKED" || pr.mergeStateStatus === "DIRTY") {
  erro(`mergeStateStatus = ${pr.mergeStateStatus} — o GitHub diz que há check não aprovado ou ainda rodando.\n` +
    "   Cuidado: pode ser um check que nem foi CRIADO ainda (push recente).\n" +
    "   Espere o CI terminar e rode de novo.");
}
if (pr.mergeStateStatus === "BEHIND") {
  console.log("  ⚠️  o branch está ATRÁS da base — o CI abaixo rodou sem os commits novos dela");
} else if (pr.mergeStateStatus !== "CLEAN") {
  console.log(`  ⚠️  mergeStateStatus = ${pr.mergeStateStatus}`);
} else {
  ok("sem conflito com a base");
}

// ── 3. TODOS os checks concluíram com sucesso ───────────────
let runs = [];
try {
  runs = JSON.parse(gh("api",
    `repos/{owner}/{repo}/commits/${pr.headRefOid}/check-runs`,
    "--jq", "[.check_runs[] | {name, status, conclusion, head_sha}]"));
} catch {
  erro("Não consegui ler os checks. Sem isso não mergeio — foi assim que a `main` ficou vermelha quatro vezes.");
}

if (!runs.length) erro("NENHUM check encontrado para o commit do topo. O CI pode nem ter começado.");

const pendentes = runs.filter(r => r.status !== "completed");
const falhos = runs.filter(r => r.status === "completed" && r.conclusion !== "success" && r.conclusion !== "neutral" && r.conclusion !== "skipped");

if (pendentes.length) {
  erro("Ainda rodando:", pendentes.map(r => r.name).join(", ") + ". Espere terminar.");
}
if (falhos.length) {
  erro("Check(s) NÃO passaram:\n   " +
    falhos.map(r => `${r.name} → ${r.conclusion}`).join("\n   ") +
    "\n\n   Publicar assim leva o vermelho para a `main` e para o hospital.");
}
ok(`${runs.length} check(s), todos verdes`);

// ── 4. 🔴 o verde é DESTE commit? ───────────────────────────
// Um `git push` depois do CI deixa o ✓ apontando para o commit anterior.
const forasteiros = runs.filter(r => r.head_sha && r.head_sha !== pr.headRefOid);
if (forasteiros.length) {
  erro("O CI verde é de OUTRO commit:\n   " +
    forasteiros.map(r => `${r.name} rodou em ${r.head_sha.slice(0, 7)}, mas o topo é ${pr.headRefOid.slice(0, 7)}`).join("\n   ") +
    "\n\n   Houve push depois do CI. Espere o novo rodar.");
}
ok(`o verde é do commit do topo (${pr.headRefOid.slice(0, 7)})`);

// ── 5. avisa se há migração no diff ─────────────────────────
// O SQL roda À MÃO, e ANTES do merge. Esquecer publica tela que não abre.
let arquivos = [];
try {
  arquivos = JSON.parse(gh("pr", "view", String(pr.number), "--json", "files", "--jq", "[.files[].path]"));
} catch { /* segue sem o aviso */ }
const migracoes = arquivos.filter(f => /^supabase\/migracao-.*\.sql$/.test(f));
if (migracoes.length) {
  console.log("\n  ⚠️  ESTE PR TRAZ MIGRAÇÃO:");
  for (const m of migracoes) console.log(`      ${m}`);
  console.log("      O SQL roda À MÃO, nos DOIS bancos, ANTES do merge.");
  console.log("      Se ainda não rodou, cancele agora (Ctrl+C).");
}

if (seco) {
  console.log("\n🧪 --seco: conferência feita, nada foi mergeado.\n");
  process.exit(0);
}

// ── 6. mergeia ──────────────────────────────────────────────
console.log("\n🚀 mergeando…\n");
try {
  console.log(gh("pr", "merge", String(pr.number), "--merge", "--delete-branch"));
} catch (e) {
  erro("O merge falhou:", String(e.message || e).slice(0, 300));
}

// ── 7. e confere a `main` DEPOIS ────────────────────────────
// Metade da regra que falhou hoje é esta: ninguém olha o CI da base.
console.log("⏳ conferindo o CI da `main` (pode levar ~1 min)…\n");
const espera = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
for (let i = 0; i < 10; i++) {
  espera(15000);
  let r;
  try {
    r = JSON.parse(gh("run", "list", "--branch", pr.baseRefName, "--limit", "1",
      "--json", "status,conclusion,displayTitle"))[0];
  } catch { continue; }
  if (!r) continue;
  if (r.status !== "completed") { console.log(`   ${r.status}…`); continue; }
  if (r.conclusion === "success") {
    console.log(`\n✅ \`${pr.baseRefName}\` VERDE depois do merge.\n`);
    process.exit(0);
  }
  erro(`A \`${pr.baseRefName}\` ficou ${r.conclusion} DEPOIS do merge!\n` +
    `   ${r.displayTitle}\n\n   Conserte agora — a Vercel já publicou.`);
}
console.log("\n⚠️  O CI da `main` não terminou a tempo. Confira com: gh run list --branch main --limit 1\n");
