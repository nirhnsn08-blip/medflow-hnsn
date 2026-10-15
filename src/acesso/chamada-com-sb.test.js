// ═══════════════════════════════════════════════════════════
// QUEM CHAMA UMA CARGA PRECISA PASSAR A CONEXÃO
//
// 🔴 ESTE DEFEITO JÁ ACONTECEU DUAS VEZES, NO MESMO ARQUIVO.
// As funções de `*/dados.js` recebem `sb` como PRIMEIRO parâmetro. Quando a
// camada de dados saiu do App.jsx, alguns chamadores ficaram para trás:
//
//     loadProfiles()                          // 1ª vez — corrigido no PR #…
//     salvarCategoriaProfissional(u.username, {...})   // 2ª vez — 17/09/2026
//
// O estrago é sempre o mesmo e é INVISÍVEL na tela: os argumentos deslocam,
// `sb` passa a ser um texto, a chamada estoura antes de qualquer requisição,
// a promessa morre sozinha e o console fica com o erro. Nada é salvo, e
// ninguém é avisado. No caso de 17/09 isso deixava "classificar profissional"
// sem efeito — e é a CATEGORIA que decide quem valida prescrição, quem
// evolui e quem prescreve.
//
// COMO ISTO PEGA
// Lê os `dados.js`, descobre quais funções começam com `sb` (ou `sbCru`), e
// confere, em todo o `src`, que o primeiro argumento de cada chamada é uma
// conexão — nunca `u.id`, `u.username` ou um literal.
//
// ⚠️ Não é análise de tipos: é leitura de texto. Pega o caso real (argumento
// deslocado) e não pretende pegar mais que isso.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.join(process.cwd(), "src");

function arquivos(dir, acc = []) {
  for (const nome of fs.readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (fs.statSync(p).isDirectory()) arquivos(p, acc);
    else if (/\.(js|jsx)$/.test(nome) && !/\.test\.(js|jsx)$/.test(nome)) acc.push(p);
  }
  return acc;
}

const TODOS = arquivos(RAIZ);
// A conexão aparece como `sb`, `sbCru`, `sbFetch` ou pela fábrica `SB()`/`SB_CRU()`.
const CONEXAO = /^(sb|sbCru|sbFetch|SB|SB_CRU)\b/;

/** Tira comentários: `loadProfiles()` citado num comentário não é chamada. */
function semComentarios(codigo) {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** As funções exportadas que recebem a conexão como primeiro parâmetro. */
function funcoesComSb(codigoBruto) {
  const codigo = semComentarios(codigoBruto);
  const nomes = [];
  const re = /export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(\s*(sb|sbCru)\b/g;
  for (const m of codigo.matchAll(re)) nomes.push(m[1]);
  const seta = /export\s+const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(\s*(sb|sbCru)\b/g;
  for (const m of codigo.matchAll(seta)) nomes.push(m[1]);
  return nomes;
}

const ESPERADAS = TODOS.filter(p => /[\\/]dados\.js$/.test(p))
  .flatMap(p => funcoesComSb(fs.readFileSync(p, "utf8")));

/** O primeiro argumento de cada chamada de `nome(` no código. */
function primeirosArgumentos(codigo, nome) {
  const out = [];
  const re = new RegExp(`(?<![A-Za-z0-9_.])${nome}\\s*\\(`, "g");
  for (const m of codigo.matchAll(re)) {
    let i = m.index + m[0].length, prof = 1, buf = "";
    while (i < codigo.length && prof > 0) {
      const c = codigo[i];
      if (c === "(") prof++;
      else if (c === ")") { prof--; if (!prof) break; }
      else if (c === "," && prof === 1) break;
      buf += c;
      i++;
    }
    out.push(buf.trim());
  }
  return out;
}

describe("toda carga é chamada com a conexão", () => {
  it("🔴 o teste achou as funções (senão passaria vazio para sempre)", () => {
    expect(ESPERADAS.length).toBeGreaterThan(40);
    expect(ESPERADAS).toContain("salvarCategoriaProfissional");
    expect(ESPERADAS).toContain("loadProfiles");
  });

  const problemas = [];
  for (const arquivo of TODOS) {
    const codigo = semComentarios(fs.readFileSync(arquivo, "utf8"));
    for (const nome of ESPERADAS) {
      // A própria declaração não conta.
      if (new RegExp(`function\\s+${nome}\\s*\\(`).test(codigo)) continue;
      for (const arg of primeirosArgumentos(codigo, nome)) {
        if (!arg) continue;                       // chamada sem argumento também é erro
        if (CONEXAO.test(arg)) continue;
        problemas.push(`${path.relative(RAIZ, arquivo)}: ${nome}(${arg.slice(0, 40)}…`);
      }
      if (primeirosArgumentos(codigo, nome).some(a => a === "")) {
        problemas.push(`${path.relative(RAIZ, arquivo)}: ${nome}() sem a conexão`);
      }
    }
  }

  it("nenhuma chamada passa outra coisa no lugar do `sb`", () => {
    expect(problemas).toEqual([]);
  });
});
