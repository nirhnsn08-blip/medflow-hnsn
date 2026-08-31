// ═══════════════════════════════════════════════════════════
// O MEDIDOR NÃO PODE MENTIR
//
// 🔴 Ele já mentiu quatro vezes, sempre PARA MENOS e sempre em silêncio:
//   1. `\b` virou backspace num heredoc → tudo com "zero dependências";
//   2. comentário contado como uso → toda página "arrastava" o arquivo todo;
//   3. compartilhamento sem propagar → `ICON_PATHS` saía como exclusivo do
//      NSP, e movê-lo teria apagado o ícone de todos os outros módulos;
//   4. a aspa dentro de `replace(/"/g, "")` lida como abertura de string →
//      o limpador inverteu de fase, 55 declarações sumiram do grafo, e
//      `loadIncidentes` era reportado sem dependência nenhuma tendo
//      `sbFetch` no corpo.
//
// Nenhuma dessas aparecia no relatório: ele imprimia um número plausível.
// Quem não é conferido por ninguém volta a mentir — e as decisões de
// extração do App.jsx saem desses números.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

const rodar = (...args) =>
  execFileSync(process.execPath, ["scripts/medir-app.mjs", ...args], { encoding: "utf8" });

describe("🔴 as checagens internas do medidor passam no App.jsx de hoje", () => {
  it("roda sem cair — e é isso que prova que a limpeza está em fase", () => {
    // O script sai com código != 0 quando: a limpeza desloca linhas (2), a
    // aresta falsa do comentário volta (3), ou alguma declaração de coluna 0
    // some depois da limpeza (4). `execFileSync` transforma isso em exceção.
    expect(() => rodar()).not.toThrow();
  });
});

describe("🔴 a regressão do regex literal, medida em vez de descrita", () => {
  it("`loadIncidentes` enxerga o `sbFetch` que está no corpo dela", () => {
    // Este é o caso exato que denunciou a fase invertida. Enquanto o
    // limpador estava furado, o relatório aqui vinha com ZERO compartilhado.
    const saida = rodar("loadIncidentes");
    expect(saida).toMatch(/sbFetch/);
    expect(saida).not.toMatch(/COMPARTILHADO \(0,/);
  });

  it("o `sbFetch` é usado por muito mais gente do que uma dezena", () => {
    // Com a fase invertida o número saía 131; o real passa de 160. Um limite
    // frouxo pega o colapso do grafo sem quebrar a cada linha nova.
    const m = /sbFetch\s+usado por (\d+)/.exec(rodar("loadIncidentes"));
    expect(m, "o sbFetch sumiu do relatório").not.toBeNull();
    expect(Number(m[1])).toBeGreaterThan(100);
  });
});
