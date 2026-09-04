// ═══════════════════════════════════════════════════════════
// NENHUM NOME DE HOSPITAL DENTRO DO CÓDIGO
//
// 🔴 O DEFEITO QUE ISTO IMPEDE DE VOLTAR. Até 04/09/2026 o fallback de
// `HOSPITAL_NOME` era "Hospital Nossa Senhora de Navegantes" — o nome do
// primeiro (e então único) cliente.
//
// Num produto vendido a vários hospitais isso tem consequência jurídica: um
// cliente cujo deploy esqueça a variável emite DECLARAÇÃO DE COMPARECIMENTO
// com o nome de outra instituição. O papel sai bonito, assinado, e atesta
// presença num hospital onde a pessoa nunca esteve.
//
// E o fallback estava em TRÊS arquivos, cada um com a sua cópia: quem
// trocasse dois não veria erro nenhum.
//
// ⚠️ Este teste lê o CÓDIGO-FONTE, não o valor exportado. O valor depende de
// variável de ambiente e muda por instalação; o que não pode mudar é não
// haver nome de instituição escrito no repositório.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Todo `.js`/`.jsx` de `src`, menos os testes. */
function fontes(dir, acc = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) fontes(p, acc);
    else if (/\.jsx?$/.test(f) && !/\.test\./.test(f)) acc.push(p);
  }
  return acc;
}

const ARQUIVOS = fontes(join(process.cwd(), "src"));

describe("🔴 a identidade do hospital não mora no código", () => {
  it("achou os arquivos (senão o teste passaria vazio para sempre)", () => {
    expect(ARQUIVOS.length).toBeGreaterThan(50);
  });

  // O nome do primeiro cliente, e a sigla dele como string literal.
  const PROIBIDO = [
    /Nossa Senhora de Navegantes/,
    /["']HNSN["']/,
  ];

  it("⚠️ e a busca acha o que deve achar (isca)", () => {
    // Regex que deixou de casar passaria tudo verde — a mesma armadilha do
    // glob vazio, uma camada acima.
    const isca = `const nome = "Hospital Nossa Senhora de Navegantes";`;
    expect(PROIBIDO.some(re => re.test(isca))).toBe(true);
  });

  for (const arq of ARQUIVOS) {
    const nome = arq.slice(arq.indexOf("src"));
    it(nome, () => {
      const texto = readFileSync(arq, "utf8");
      const achados = PROIBIDO.map(re => (texto.match(re) || [])[0]).filter(Boolean);
      expect(achados,
        `nome de instituição no código — ele vem de VITE_HOSPITAL_NOME, e o fallback tem de ser neutro`
      ).toEqual([]);
    });
  }
});

describe("🔴 o fallback avisa em vez de fingir", () => {
  const base = readFileSync(join(process.cwd(), "src", "ui", "base.jsx"), "utf8");

  it("o texto sem configuração diz que NÃO está configurado", () => {
    // Precisa ser impossível de confundir com uma instituição real: quem
    // imprimir um documento com ele vai atrás de configurar, em vez de
    // distribuir um papel com o nome errado.
    expect(base).toMatch(/Hospital n[ãa]o configurado/);
  });

  it("⚠️ e a variável é lida em UM lugar só", () => {
    // Estava em três, cada um com a sua cópia do fallback.
    const outros = ARQUIVOS
      .filter(a => !a.endsWith(join("ui", "base.jsx")))
      .filter(a => /VITE_HOSPITAL_(NOME|SIGLA)/.test(readFileSync(a, "utf8")))
      .map(a => a.slice(a.indexOf("src")));
    expect(outros,
      "estes arquivos leem a variável direto; devem importar de ui/base.jsx"
    ).toEqual([]);
  });
});
