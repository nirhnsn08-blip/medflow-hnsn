// ═══════════════════════════════════════════════════════════
// COMPONENTE USADO EM JSX E NÃO IMPORTADO
//
// 🔴 É O PONTO CEGO QUE OS TRÊS DETECTORES COMPARTILHAM.
// Sem `eslint-plugin-react`, o `no-undef` NÃO conta `<Icon />` como uso do
// identificador `Icon` — a mesma limitação que mantém o `no-unused-vars`
// fora do eslint.config.mjs. O Rollup também não vê: para ele é um nome
// livre, que ele assume global. E o `telas.test.jsx` só pega quando o
// componente chega a RENDERIZAR — um `<Icon />` dentro de um modal que só
// abre com clique passa incólume.
//
// Aconteceu na extração da tela do Pronto-Socorro: `Icon` e seis peças do
// recharts ficaram de fora do import. Lint verde, build verde, e a tela
// morria no mount com `ReferenceError: Icon is not defined`.
//
// ⚠️ A LISTA É DESCOBERTA, não escrita: varre `src/**/*.jsx`. Tela nova
// entra sozinha, que é a única forma de a cobertura não envelhecer.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const jsx = [];
(function varrer(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) varrer(p);
    else if (e.name.endsWith(".jsx") && !e.name.includes(".test.")) jsx.push(p.split(path.sep).join("/"));
  }
})("src");

describe("todo componente usado em JSX está importado ou declarado", () => {
  it("a varredura achou os arquivos", () => {
    // Um glob que silenciosamente casa zero arquivo passaria para sempre —
    // a mesma armadilha que o telas.test.jsx fecha no primeiro teste dele.
    expect(jsx.length).toBeGreaterThan(10);
  });

  it.each(jsx)("%s", arquivo => {
    expect(() => execFileSync(process.execPath, ["scripts/jsx-livres.mjs", arquivo], { encoding: "utf8" }))
      .not.toThrow();
  });
});
