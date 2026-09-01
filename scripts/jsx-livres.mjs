// ============================================================
// Valentrax — COMPONENTE USADO EM JSX E NÃO IMPORTADO
//
//     node scripts/jsx-livres.mjs src/ps/PsPage.jsx
//
// 🔴 POR QUE ISTO EXISTE
// É o ponto cego que os TRÊS detectores da casa compartilham.
//
//   · `no-undef` NÃO conta `<Icon />` como uso do identificador `Icon`.
//     Sem `eslint-plugin-react` o ESLint não olha dentro do JSX — a mesma
//     limitação que mantém o `no-unused-vars` fora do eslint.config.mjs.
//   · o Rollup também não vê: para ele é um nome livre, que ele assume
//     global e deixa passar.
//   · o `telas.test.jsx` pega, mas só quando o componente RENDERIZA. Um
//     `<Icon />` dentro de um modal que só abre com clique passa incólume.
//
// Aconteceu na extração da tela do Pronto-Socorro: `Icon` e seis peças do
// recharts ficaram fora do import. Lint verde, build verde, e a tela morria
// no mount com `ReferenceError: Icon is not defined`.
//
// ⚠️ AS DUAS COISAS QUE ESTE SCRIPT JÁ ERROU, e por isso estão anotadas:
//   · import com ASPAS SIMPLES (`from './App.jsx'`) — o main.jsx usa;
//   · `function` declarada INDENTADA, dentro de outro componente — o
//     EditorCatalogoSae declara a `Tabela` assim.
// Os dois davam falso positivo, que é o jeito mais rápido de um verificador
// virar ruído e ser desligado.
// ============================================================

import fs from "node:fs";

const P = process.argv[2];
if (!P) { console.error("uso: node scripts/jsx-livres.mjs <arquivo.jsx>"); process.exit(2); }
const txt = fs.readFileSync(P, "utf8");

// nomes de componente usados em JSX: <Algo ...> e <Algo.Sub ...>
const usados = new Set(
  [...txt.matchAll(/<([A-Z][\w$.]*)/g)].map(m => m[1].split(".")[0]));

const definidos = new Set();
// declarações, em qualquer indentação
for (const m of txt.matchAll(/^\s*(?:export default |export )?(?:async )?(?:function|class) ([A-Za-z_$][\w$]*)/gm)) definidos.add(m[1]);
for (const m of txt.matchAll(/^\s*(?:export )?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/gm)) definidos.add(m[1]);
// imports, com aspas simples ou duplas
for (const m of txt.matchAll(/^import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/gm)) {
  const cl = m[1];
  const chaves = /\{([\s\S]*)\}/.exec(cl);
  const padrao = cl.replace(/\{[\s\S]*\}/, "").replace(/,/g, "").trim();
  if (padrao) definidos.add(padrao.replace(/^\*\s+as\s+/, ""));
  if (chaves) for (const p of chaves[1].split(",")) {
    const t = p.trim(); if (t) definidos.add(t.split(/\s+as\s+/).pop());
  }
}

// 🔴 `Fragment` NÃO É EXCEÇÃO, e eu tinha posto como se fosse.
// Supus que `<Fragment>` fosse sempre a forma curta `<>…</>`, que o
// compilador resolve sozinho. Escrito por extenso ele é um import como
// qualquer outro — e a exclusão abriu um ponto cego DENTRO da guarda feita
// para fechar um ponto cego. Custou um `ReferenceError: Fragment is not
// defined` na tela de Usuários, com lint e build verdes, no PR seguinte ao
// que criou este script.
const livres = [...usados].filter(n => !definidos.has(n)).sort();
if (livres.length) {
  console.error(`🔴 ${livres.length} componente(s) usados em JSX e NÃO definidos em ${P}:`);
  for (const n of livres) {
    const linha = txt.split("\n").findIndex(l => l.includes("<" + n)) + 1;
    console.error(`   ${n}  (primeira vez na linha ${linha})`);
  }
  process.exit(1);
}
console.log(`ok: ${usados.size} componentes usados em JSX, todos definidos`);
