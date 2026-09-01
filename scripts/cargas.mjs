// ═══════════════════════════════════════════════════════════
// O CENSO DAS CARGAS — quem ainda colapsa falha em lista vazia
//
// Uma coisa só, usada por dois: o codemod que converteu as cargas e o
// teste que impede a volta (`src/cargas.test.js`). Escrever a regra duas
// vezes é como os dois deslizes de fronteira da extração aconteceram.
//
// A distinção que este arquivo existe para fazer:
//
//   REDE     o valor veio de `await sb(...)` — vazio pode ser FALHA
//            e é isso que `lista()` de util/leitura.js preserva
//
//   PARAM    o valor é argumento de função — `Array.isArray(x) ? x : []`
//            aqui é normalização defensiva, LEGÍTIMA, e não deve mudar
//
//   LOCAL    veio do `localStorage` — armário do navegador, não rede
//
// Rodar sozinho:  node scripts/cargas.mjs
// ═══════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";

const COLAPSO = /Array\.isArray\(([a-zA-Z_$][\w$]*)\)\s*\?\s*\1\s*:\s*\[\]/;

/** Todos os fontes de src/, sem os testes. */
export function fontes(raiz = "src") {
  const out = [];
  (function varrer(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.posix.join(d.replace(/\\/g, "/"), e.name);
      if (e.isDirectory()) varrer(p);
      else if (/\.(js|jsx)$/.test(e.name) && !e.name.includes(".test.")) out.push(p);
    }
  })(raiz);
  return out;
}

/**
 * De onde veio a variável? Olha para trás no arquivo.
 * Devolve "rede" | "local" | "param" | "?".
 */
function origemDe(L, i, v) {
  for (let k = i; k > Math.max(0, i - 30); k--) {
    const linha = L[k];

    // const/let X = ...
    const atrib = new RegExp("(?:const|let|var)\\s+" + v + "\\s*=(.*)").exec(linha);
    if (atrib) {
      const d = atrib[1];
      if (/localStorage|JSON\.parse/.test(d)) return "local";
      if (/await\s/.test(d)) return "rede";
      // `const x = sb ? await sb(..) : []` cai no anterior; aqui é outra coisa
      return "?";
    }

    // const [a, b, c] = await Promise.all([ ... ])  — desestruturação
    const destr = new RegExp("(?:const|let)\\s*\\[([^\\]]*)\\]\\s*=\\s*await\\s").exec(linha);
    if (destr && destr[1].split(",").some(n => n.trim().replace(/:.*/, "").trim() === v)) return "rede";

    // parâmetro de função
    if (new RegExp("(?:function\\s+[\\w$]*\\s*\\(|=>\\s*\\{?|\\()[^)]*\\b" + v + "\\b[^)]*\\)").test(linha)
        && /function|=>/.test(linha)) return "param";
  }
  return "?";
}

/** Todo lugar que ainda faz `Array.isArray(x) ? x : []`, classificado. */
export function censo(raiz = "src") {
  const achados = [];
  for (const a of fontes(raiz)) {
    const L = fs.readFileSync(a, "utf8").split("\n");
    L.forEach((l, i) => {
      // ⚠️ TODAS as ocorrências da linha, não só a primeira. Há linha com
      // duas (`saidas: ..., scih: ...`) e contar uma só faria o censo
      // dizer que acabou quando não acabou.
      const re = new RegExp(COLAPSO.source, "g");
      for (let m; (m = re.exec(l)); ) {
        achados.push({ arquivo: a, linha: i + 1, v: m[1], origem: origemDe(L, i, m[1]), texto: l.trim() });
      }
    });
  }
  return achados;
}

/** Cargas que devolvem lista sem passar por `lista()` — o que o teste proíbe. */
export function pendentes(raiz = "src") {
  return censo(raiz).filter(x => x.origem === "rede" || x.origem === "?");
}

// ⚠️ No Windows o caminho vira `file:///C:/...` — comparar com `file://` +
// argv[1] nunca bate, e o arquivo roda em silêncio sem imprimir nada.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").replace(/^[A-Za-z]:/, ""))) {
  const todos = censo();
  const por = g => todos.filter(x => x.origem === g);
  for (const g of ["rede", "?", "local", "param"]) {
    const xs = por(g);
    console.log(`\n${g.toUpperCase()} — ${xs.length}`);
    if (g === "rede" || g === "?") for (const x of xs) console.log(`   ${x.arquivo}:${x.linha}  ${x.v}`);
  }
  console.log(`\nTOTAL ${todos.length}`);
}

// ═══════════════════════════════════════════════════════════
// O FURO QUE O CENSO TEVE: O ATALHO DE UMA LINHA
//
// 🔴 `const arr = x => (Array.isArray(x) ? x : []);` derrota o censo. Para
// ele, `x` é parâmetro de uma função — guarda legítima. Mas quando o
// atalho é aplicado ao resultado de `await sb(...)`, ele colapsa a falha
// exatamente como o código que este arquivo existe para caçar, só que
// invisível.
//
// Foi assim que as 21 listas do PRONTUÁRIO escaparam da primeira medição,
// `alergias` entre elas.
//
// A regra é grosseira de propósito: arquivo que lê da rede não define
// atalho de colapso. Onde o atalho é legítimo (nsp.js, sae.js,
// responsavel.js são regra pura, sem `sb`), ele continua valendo.
// ═══════════════════════════════════════════════════════════

// ⚠️ O `: []` no fim faz parte da regra. `r => Array.isArray(r) ? r : null`
// é o atalho CERTO — o de leitos/dados.js, que preserva a falha. Sem essa
// parte, o censo acusaria justamente quem já está corrigido.
const ATALHO = /=\s*[a-zA-Z_$][\w$]*\s*=>\s*\(?\s*Array\.isArray\([a-zA-Z_$][\w$]*\)\s*\?[^:]*:\s*\[\]/;

/** Atalhos de colapso definidos em arquivo que também lê da rede. */
export function atalhosEscondidos(raiz = "src") {
  const out = [];
  for (const a of fontes(raiz)) {
    const txt = fs.readFileSync(a, "utf8");
    if (!/await\s+sb\(/.test(txt)) continue;      // regra pura: atalho é legítimo
    txt.split("\n").forEach((l, i) => {
      if (ATALHO.test(l)) out.push({ arquivo: a, linha: i + 1, texto: l.trim() });
    });
  }
  return out;
}
