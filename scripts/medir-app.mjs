// ============================================================
// Valentrax — MEDIR O App.jsx
//
//     npm run medir              panorama
//     npm run medir -- PSPage    detalha um domínio
//
// Responde três perguntas, com número em vez de impressão:
//   1. quanto cada domínio ARRASTA se for extraído;
//   2. o que TODO mundo usa (os hubs que viram módulo comum);
//   3. quais componentes saem quase de graça.
//
// POR QUE ISTO EXISTE
// "O `App.jsx` está grande" é consenso desde sempre e não move ninguém,
// porque não diz por onde começar. O que decide a ordem de extração não é o
// tamanho da página — é o quanto ela COMPARTILHA com as outras. Isso não se
// enxerga lendo; se conta.
//
// 🔴 A ARMADILHA QUE ESTE ARQUIVO EXISTE PARA NÃO REPETIR
// A primeira versão desta medição contava a palavra dentro de COMENTÁRIO
// como uso. Esta casa comenta muito e cita componente pelo nome — uma linha
//
//     // inscreve aqui — o App usa isto para voltar ao login
//
// criava a aresta `clearSession → App`, e como o `App` renderiza todas as
// páginas, o grafo inteiro virava conectado: TODA página aparecia
// "arrastando" 17.831 das 18.297 linhas. Número plausível, inútil e errado.
//
// Por isso a análise roda sobre o arquivo com comentários e strings
// APAGADOS, e a primeira coisa que o programa faz é PROVAR que aquela
// aresta falsa sumiu. Se ela voltar, ele para — medição que falha para
// menos, em silêncio, é pior que medição nenhuma.
// ============================================================

import fs from "node:fs";
import path from "node:path";

const ALVO = "src/App.jsx";
const bruto = fs.readFileSync(ALVO, "utf8");
const linhas = bruto.split("\n");

/**
 * Apaga comentários e literais de string, PRESERVANDO as quebras de linha —
 * os números de linha têm de continuar batendo com o arquivo real.
 */
function limpar(txt) {
  let out = "", i = 0;
  const n = txt.length;
  while (i < n) {
    const c = txt[i], d = txt[i + 1];
    if (c === "/" && d === "/") { while (i < n && txt[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < n && !(txt[i] === "*" && txt[i + 1] === "/")) { if (txt[i] === "\n") out += "\n"; i++; }
      i += 2; continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const asp = c; i++;
      while (i < n && txt[i] !== asp) {
        if (txt[i] === "\\") i++;
        else if (txt[i] === "\n") out += "\n";
        i++;
      }
      i++; continue;
    }
    out += c; i++;
  }
  return out;
}

const limpo = limpar(bruto).split("\n");
if (limpo.length !== linhas.length) {
  console.error(`🔴 a limpeza mudou a contagem de linhas (${linhas.length} → ${limpo.length}).`);
  console.error("   Os números de linha ficariam deslocados e todo o resto sairia errado.");
  process.exit(2);
}

// ── quem o arquivo declara em coluna 0 (não vem de import) ──
const defs = new Map();
linhas.forEach((l, i) => {
  const m = /^(?:export default |export )?function ([A-Za-z_$][\w$]*)/.exec(l)
    || /^async function ([A-Za-z_$][\w$]*)/.exec(l)
    || /^(?:export )?(?:const|let) ([A-Za-z_$][\w$]*)\s*=/.exec(l);
  if (m) defs.set(m[1], i + 1);
});
const tops = [...defs.entries()].map(([nome, linha]) => ({ nome, linha })).sort((a, b) => a.linha - b.linha);
tops.forEach((t, i) => { t.fim = (tops[i + 1]?.linha ?? linhas.length + 1) - 1; t.tam = t.fim - t.linha + 1; });
const porNome = new Map(tops.map(t => [t.nome, t]));

const comps = tops.filter(t => /^[A-Z]/.test(t.nome) &&
  linhas.slice(t.linha - 1, t.fim).some(l => /return \(|<\/|\/>/.test(l)));
const nomesComp = new Set(comps.map(c => c.nome));

// `\b` montado por código: em heredoc de shell o `\\b` vira backspace, e o
// regex passa a nunca casar — deu "dependência zero" em tudo, uma vez.
const B = String.fromCharCode(92) + "b";

const arestas = new Map();
for (const t of tops) {
  const corpo = limpo.slice(t.linha - 1, t.fim).join("\n");
  arestas.set(t.nome, [...defs.keys()].filter(n => n !== t.nome && new RegExp(B + n + B).test(corpo)));
}

// ── A PROVA. Sem ela, o resto do relatório não vale nada. ──
const arestaFalsa = (arestas.get("clearSession") || []).includes("App");
if (arestaFalsa) {
  console.error("🔴 A aresta `clearSession → App` voltou a aparecer.");
  console.error("   Ela só existe dentro de um COMENTÁRIO. Se ela está aqui, a limpeza");
  console.error("   parou de funcionar — e o grafo inteiro vira conectado, fazendo toda");
  console.error("   página parecer que arrasta o arquivo todo.");
  process.exit(3);
}

const usadoPor = new Map();
for (const [quem, lista] of arestas) for (const n of lista) {
  if (!usadoPor.has(n)) usadoPor.set(n, new Set());
  usadoPor.get(n).add(quem);
}

function fecho(raiz) {
  const visto = new Set([raiz]);
  const fila = [raiz];
  while (fila.length) for (const n of arestas.get(fila.pop()) || []) if (!visto.has(n)) { visto.add(n); fila.push(n); }
  return visto;
}

/** Separa o que sai de graça (só este domínio usa) do que é compartilhado. */
function domínio(p) {
  const raiz = porNome.get(p);
  if (!raiz) return null;
  const f = fecho(p); f.delete(p);
  const excl = [], com = [];
  for (const n of f) {
    const t = porNome.get(n);
    if (!t) continue;
    const outros = [...(usadoPor.get(n) || [])].filter(q => !f.has(q) && q !== p);
    (outros.length === 0 ? excl : com).push(t);
  }
  const soma = a => a.reduce((s, t) => s + t.tam, 0);
  return { p, propria: raiz.tam, excl, com, exclL: soma(excl), comL: soma(com), total: raiz.tam + soma(excl) };
}

const PAGINAS = comps
  .filter(c => /Page$|^AtendimentoModal$/.test(c.nome) && c.nome !== "SupabasePage")
  .map(c => c.nome);

const alvo = process.argv.slice(2).find(a => !a.startsWith("-"));
const p6 = (n) => String(n).padStart(6);

if (alvo) {
  const d = domínio(alvo);
  if (!d) { console.error(`Não achei "${alvo}" em ${ALVO}.`); process.exit(1); }
  console.log(`${alvo}: ${d.propria} linhas próprias · ${d.total} com o que arrasta\n`);
  console.log(`EXCLUSIVO (${d.excl.length} declarações, ${d.exclL} linhas) — sai junto, de graça:`);
  for (const t of d.excl.sort((a, b) => b.tam - a.tam).slice(0, 25)) console.log(p6(t.tam), " " + t.nome);
  console.log(`\nCOMPARTILHADO (${d.com.length}, ${d.comL} linhas) — vira módulo comum ANTES:`);
  for (const t of d.com.sort((a, b) => b.tam - a.tam)) {
    console.log(p6(t.tam), " " + t.nome.padEnd(24), `usado por ${usadoPor.get(t.nome).size}`);
  }
  process.exit(0);
}

console.log(`${ALVO}: ${linhas.length} linhas · ${defs.size} declarações de topo · ${comps.length} componentes`);
console.log(`componentes ocupam ${comps.reduce((a, c) => a + c.tam, 0)} linhas\n`);

console.log("═══ DOMÍNIOS — a coluna que decide a ordem é COMUM, não o tamanho ═══");
console.log("própria  exclusivo      comum        total  domínio");
for (const d of PAGINAS.map(domínio).filter(Boolean).sort((a, b) => b.total - a.total)) {
  console.log(p6(d.propria), (`${d.exclL} (${d.excl.length})`).padStart(13),
    (`${d.comL} (${d.com.length})`).padStart(11), p6(d.total) + "  " + d.p);
}
console.log("\nmenos COMUM = extrai antes: é o que não precisa virar módulo compartilhado primeiro");

console.log("\n═══ HUBS — o que vira `src/ui` e `src/dados` ═══");
console.log("usado por  linhas  nome");
for (const [n, quem] of [...usadoPor.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 12)) {
  console.log(String(quem.size).padStart(9), p6(porNome.get(n)?.tam ?? 0), " " + n);
}

const faceis = comps.filter(c => {
  const deps = (arestas.get(c.nome) || []).filter(n => !nomesComp.has(n));
  return deps.length <= 3 && c.tam >= 40;
});
console.log(`\n═══ AVULSOS QUE SAEM QUASE DE GRAÇA (≤3 dependências) ═══`);
console.log(`${faceis.length} componentes · ${faceis.reduce((a, c) => a + c.tam, 0)} linhas`);
console.log("⚠️ e isso é ~7% do arquivo: os avulsos NÃO resolvem o monólito, domínio resolve.\n");
console.log("linhas  componente                     depende de");
for (const c of faceis.sort((a, b) => b.tam - a.tam).slice(0, 12)) {
  const deps = (arestas.get(c.nome) || []).filter(n => !nomesComp.has(n));
  console.log(p6(c.tam), " " + c.nome.padEnd(28), deps.join(", ") || "—");
}

console.log(`\n\nO GANHO NÃO É LINHA: hoje ${comps.length} componentes moram no ${ALVO} e`);
console.log(`nenhum é coberto pelo src/telas.test.jsx — ele exclui o App.jsx de propósito`);
console.log(`(exige sessão e Supabase). Cada domínio extraído entra na cobertura.`);
console.log(`\ndetalhar um: npm run medir -- ${PAGINAS[0] || "PSPage"}`);
void path;
