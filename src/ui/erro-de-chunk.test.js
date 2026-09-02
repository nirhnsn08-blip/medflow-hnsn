// ═══════════════════════════════════════════════════════════
// RECONHECER FALHA DE DOWNLOAD DE MÓDULO
//
// 🔴 Errar para MENOS e errar para MAIS custam coisas diferentes:
//
//   não reconhecer  → a pessoa lê "troque de módulo na barra lateral" e
//                     tenta um por um, mas TODOS vão falhar igual depois de
//                     um deploy. Termina ligando para o suporte.
//   reconhecer demais → um erro de render vira "recarregue", a pessoa
//                     recarrega, o erro volta, e o texto do stack que o
//                     suporte precisa nunca aparece na tela.
//
// Por isso os testes vêm em pares: as frases reais de cada navegador de um
// lado, e os erros que NÃO são de módulo do outro.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { ehErroDeChunk, TEXTO_CHUNK } from "./erro-de-chunk.js";

describe("🔴 as frases reais dos navegadores", () => {
  // Cada uma foi copiada da mensagem que o navegador emite de verdade.
  const reais = {
    "Chrome/Edge": "TypeError: Failed to fetch dynamically imported module: https://app/assets/PsPage-DtCjOMUG.js",
    "Firefox":     "TypeError: error loading dynamically imported module",
    "Safari":      "TypeError: Importing a module script failed.",
    "bundler":     "ChunkLoadError: Loading chunk 12 failed.",
  };

  for (const [nav, msg] of Object.entries(reais)) {
    it(`reconhece a do ${nav}`, () => {
      expect(ehErroDeChunk(new TypeError(msg.replace(/^\w+Error: /, "")))).toBe(true);
      expect(ehErroDeChunk(msg)).toBe(true);
    });
  }
});

describe("🔴 o que NÃO pode ser confundido com falha de módulo", () => {
  it('⚠️ "Failed to fetch" SOZINHO é a rede numa chamada de API, não um módulo', () => {
    // Esta é a distinção que mais importa. Se contasse, toda queda de rede
    // durante uma consulta viraria "recarregue a página", e o erro de
    // verdade — com o stack que o suporte precisa — sumiria da tela.
    expect(ehErroDeChunk(new TypeError("Failed to fetch"))).toBe(false);
  });

  it("erro de render comum não vira conselho de recarregar", () => {
    expect(ehErroDeChunk(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    expect(ehErroDeChunk(new ReferenceError("sb is not a function"))).toBe(false);
  });

  it("erro do PostgREST não é erro de módulo", () => {
    expect(ehErroDeChunk(new Error("column at_glosas.foo does not exist"))).toBe(false);
  });

  it("a palavra 'module' sozinha não basta", () => {
    // "módulo" é palavra comum neste sistema — todo menu é um módulo.
    expect(ehErroDeChunk(new Error("O módulo Farmácia não está liberado para este perfil"))).toBe(false);
    expect(ehErroDeChunk(new Error("module"))).toBe(false);
  });
});

describe("entradas estranhas não estouram", () => {
  it("nulo, indefinido e vazio devolvem false", () => {
    for (const x of [null, undefined, "", "   ", 0, false, {}]) {
      expect(ehErroDeChunk(x), JSON.stringify(x)).toBe(false);
    }
  });

  it("aceita string crua além de Error", () => {
    expect(ehErroDeChunk("Failed to fetch dynamically imported module: /x.js")).toBe(true);
  });

  it("usa o NAME do erro quando não há message", () => {
    const e = new Error("");
    e.name = "ChunkLoadError: Loading chunk 3 failed";
    expect(ehErroDeChunk(e)).toBe(true);
  });
});

describe("o texto que a pessoa lê", () => {
  it("diz o que fazer, e que nada se perde", () => {
    // O medo real de quem está no meio de um plantão é perder o que digitou.
    expect(TEXTO_CHUNK.corpo).toMatch(/recarregar resolve/i);
    expect(TEXTO_CHUNK.corpo).toMatch(/nada do que você digitou e salvou se perde/i);
  });

  it("⚠️ NÃO manda trocar de módulo — o conselho oposto", () => {
    // Depois de um deploy, todos os módulos falham igual.
    expect(TEXTO_CHUNK.corpo).not.toMatch(/barra lateral|trocar de módulo|outro módulo/i);
  });

  it("não tem jargão de rede", () => {
    expect(TEXTO_CHUNK.corpo).not.toMatch(/chunk|fetch|HTTP|import|bundle/i);
    expect(TEXTO_CHUNK.titulo).not.toMatch(/chunk|fetch/i);
  });
});

describe("🔴 o caso que só apareceu servindo o build de verdade", () => {
  // Apaguei um chunk do `dist` e servi o build. O servidor NÃO devolveu 404:
  // caiu no `index.html`, como faz todo app de página única — a Vercel
  // inclusive. O navegador recebe HTML onde esperava JavaScript e reclama do
  // TIPO, sem dizer "fetch" nem "dynamically imported".
  //
  // Nenhum dos quatro padrões originais pegava. Em produção, este é
  // provavelmente o MAIS COMUM dos cinco.
  const mime = [
    "Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of text/html.",
    "Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of text/html.",
  ];
  for (const m of mime) {
    it("reconhece: " + m.slice(0, 46) + "…", () => {
      expect(ehErroDeChunk(m)).toBe(true);
      expect(ehErroDeChunk(new TypeError(m))).toBe(true);
    });
  }

  it("⚠️ e continua NÃO confundindo com erro de conteúdo", () => {
    expect(ehErroDeChunk(new Error("Expected a number but got text"))).toBe(false);
  });
});
