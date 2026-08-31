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
// 🔴 AS ARMADILHAS QUE ESTE ARQUIVO EXISTE PARA NÃO REPETIR
// Todas são o mesmo defeito: medição que erra PARA MENOS, em silêncio, e
// devolve um número plausível. Cada uma delas virou uma checagem que roda
// antes do relatório e derruba o programa em vez de imprimir bonito.
//   1. comentário contado como uso  → guarda `clearSession → App`
//   2. limpeza fora de fase         → guarda "toda declaração visível"
//   3. compartilhamento sem propagar → tratado em `domínio()`
// ============================================================

import fs from "node:fs";
import path from "node:path";

const ALVO = "src/App.jsx";
const bruto = fs.readFileSync(ALVO, "utf8");
const linhas = bruto.split("\n");

/**
 * Acha o nome declarado em coluna 0, se a linha declarar algum.
 *
 * ⚠️ `class` entrou tarde. Sem ela o `LimiteErro` — a fronteira de erro do
 * roteador — era invisível para o medidor, e como ele mora FISICAMENTE no
 * meio da região do NSP, o tamanho do `NspRelatorioView` vinha inflado com o
 * corpo dele. A extração do NSP quase levou a fronteira de erro junto.
 */
function declaracaoNa(l) {
  const m = /^(?:export default |export )?function ([A-Za-z_$][\w$]*)/.exec(l)
    || /^async function ([A-Za-z_$][\w$]*)/.exec(l)
    || /^(?:export default |export )?class ([A-Za-z_$][\w$]*)/.exec(l)
    || /^(?:export )?(?:const|let) ([A-Za-z_$][\w$]*)\s*=/.exec(l);
  return m ? m[1] : null;
}

/**
 * Apaga comentários e literais de string, PRESERVANDO as quebras de linha —
 * os números de linha têm de continuar batendo com o arquivo real.
 *
 * 🔴 O REGEX LITERAL, QUE JÁ INVERTEU ESTA MEDIÇÃO INTEIRA
 * A primeira versão não conhecia `/.../`. No `App.jsx` existe, na linha 1702,
 *
 *     line.split(",").map(c => c.trim().replace(/"/g, ""))
 *
 * e a aspa DENTRO do regex foi lida como abertura de string. Dali em diante o
 * limpador ficou FORA DE FASE: passou a apagar o código e a preservar o
 * conteúdo das strings. 55 declarações de topo sumiram do grafo — `sbFetch`,
 * o Giro de Leitos inteiro, os loaders do NSP — e o relatório respondia que
 * `loadIncidentes` não dependia de nada, tendo `sbFetch` no corpo.
 *
 * A contagem de linhas continuava batendo (a fase não muda o número de
 * quebras), então a checagem que existia passava. Quem pega isso é a
 * invariante logo abaixo.
 */
function limpar(txt) {
  let out = "", i = 0;
  const n = txt.length;

  // Um `/` abre regex ou é divisão? Decide pelo último caractere que conta
  // antes dele — o mesmo critério que um tokenizador de verdade usa.
  const ANTES_DE_REGEX = "(,=:[!&|?{};+-*%~^<>";
  const PALAVRA_ANTES = /(?:^|[^\w$])(return|typeof|instanceof|in|of|new|delete|void|case|do|else|yield|await)\s*$/;
  const significativoAtras = () => {
    for (let k = out.length - 1; k >= 0; k--) if (!/\s/.test(out[k])) return out[k];
    return "";
  };

  while (i < n) {
    const c = txt[i], d = txt[i + 1];
    if (c === "/" && d === "/") { while (i < n && txt[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < n && !(txt[i] === "*" && txt[i + 1] === "/")) { if (txt[i] === "\n") out += "\n"; i++; }
      i += 2; continue;
    }
    if (c === "/") {
      const ant = significativoAtras();
      // ⚠️ JSX usa as duas formas que mais parecem regex: `</div>` e `<Icon />`.
      // Em `</`, o anterior é `<`; em `/>`, o seguinte é `>`. Sem estas duas
      // exceções o limpador comia 2.772 linhas do arquivo.
      const ehJsx = ant === "<" || d === ">";
      if (!ehJsx && (ant === "" || ANTES_DE_REGEX.includes(ant) || PALAVRA_ANTES.test(out))) {
        const voltar = i;
        i++;
        let classe = false, fechou = false;       // dentro de `[...]` a barra não fecha
        while (i < n && txt[i] !== "\n") {
          if (txt[i] === "\\") i++;
          else if (txt[i] === "[") classe = true;
          else if (txt[i] === "]") classe = false;
          else if (txt[i] === "/" && !classe) { fechou = true; break; }
          i++;
        }
        if (fechou) {
          i++;
          while (i < n && /[a-z]/.test(txt[i])) i++;  // as flags (g, i, u, s…)
          continue;
        }
        // Não fechou na mesma linha: regex não atravessa linha, então era
        // divisão. Volta e trata como caractere comum — engolir a quebra aqui
        // deslocaria todos os números de linha.
        i = voltar;
      }
      out += c; i++; continue;                    // era divisão
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

// ── A INVARIANTE DA FASE ──
// Uma declaração em coluna 0 é código, por definição. Se depois da limpeza
// ela sumiu, o limpador se perdeu dentro de alguma string ou regex — e o
// grafo já está incompleto, sem nenhum sintoma no relatório.
const sumidas = [];
linhas.forEach((l, i) => {
  const nome = declaracaoNa(l);
  if (nome && !new RegExp(String.fromCharCode(92) + "b" + nome + String.fromCharCode(92) + "b").test(limpo[i])) {
    sumidas.push(`${i + 1}: ${l.slice(0, 70)}`);
  }
});
if (sumidas.length) {
  console.error(`🔴 ${sumidas.length} declarações de topo sumiram na limpeza — ela está FORA DE FASE.`);
  console.error("   Isso acontece quando um literal não é reconhecido (regex, template aninhado)");
  console.error("   e o limpador passa a apagar o código em vez do texto. O grafo fica furado");
  console.error("   e o relatório não avisa: as dependências simplesmente não aparecem.\n");
  console.error(sumidas.slice(0, 8).join("\n"));
  if (sumidas.length > 8) console.error(`   … e mais ${sumidas.length - 8}.`);
  console.error("\n   A primeira da lista é onde procurar: o defeito está ACIMA dela.");
  process.exit(4);
}

// ── quem o arquivo declara em coluna 0 (não vem de import) ──
const defs = new Map();
linhas.forEach((l, i) => { const nome = declaracaoNa(l); if (nome) defs.set(nome, i + 1); });
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

// ── A PROVA DO COMENTÁRIO. Sem ela, o resto do relatório não vale nada. ──
// Esta casa comenta muito e cita componente pelo nome. Uma linha como
//     // inscreve aqui — o App usa isto para voltar ao login
// criava a aresta `clearSession → App`, e como o `App` renderiza todas as
// páginas, o grafo inteiro virava conectado: TODA página aparecia arrastando
// 17.831 das 18.297 linhas.
if ((arestas.get("clearSession") || []).includes("App")) {
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

/**
 * Separa o que sai de graça (só este domínio usa) do que é compartilhado.
 *
 * 🔴 O COMPARTILHAMENTO SE PROPAGA, e a primeira versão não propagava.
 * Ela perguntava só "alguém de fora usa este nó?". Com isso o `ICON_PATHS`
 * saía como EXCLUSIVO do módulo de Segurança do Paciente — porque quem o
 * usa é o `Icon`, e o `Icon` está dentro do fecho. Só que o `Icon` aparece
 * 21 vezes no arquivo: mover o `ICON_PATHS` junto teria apagado o ícone de
 * todos os outros módulos.
 *
 * Um nó usado por um nó COMPARTILHADO é compartilhado também. A regra
 * precisa ser aplicada em laço até estabilizar, porque marcar um nó pode
 * arrastar os que ele usa.
 */
function domínio(p) {
  const raiz = porNome.get(p);
  if (!raiz) return null;
  const f = fecho(p); f.delete(p);

  // 1ª passada: quem é usado por alguém FORA do fecho já é compartilhado.
  const compartilhado = new Set();
  for (const n of f) {
    const outros = [...(usadoPor.get(n) || [])].filter(q => !f.has(q) && q !== p);
    if (outros.length) compartilhado.add(n);
  }
  // 2ª em diante: o que um compartilhado usa também é compartilhado.
  for (;;) {
    let mudou = false;
    for (const n of [...compartilhado]) {
      for (const usado of arestas.get(n) || []) {
        if (f.has(usado) && !compartilhado.has(usado)) { compartilhado.add(usado); mudou = true; }
      }
    }
    if (!mudou) break;
  }

  const excl = [], com = [];
  for (const n of f) {
    const t = porNome.get(n);
    if (!t) continue;
    (compartilhado.has(n) ? com : excl).push(t);
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
