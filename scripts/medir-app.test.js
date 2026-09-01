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
  // ⚠️ A ÂNCORA TEM DE SOBREVIVER À PRÓXIMA EXTRAÇÃO.
  // A primeira versão deste teste ancorava em `loadIncidentes` — o caso exato
  // que denunciou a fase invertida. Só que ele era um dos símbolos que a
  // extração do NSP tirava do App.jsx, e o teste quebrou no commit seguinte,
  // sem nada de errado no medidor. Um teste que morre quando o trabalho
  // acontece treina a gente a ignorar teste vermelho.
  //
  // O `sbFetch` é a âncora certa: ele é a máquina de sessão, é o último a
  // sair do App.jsx, e é justamente quem sumia do grafo quando a fase
  // invertia.

  it("o `sbFetch` enxerga a máquina de sessão que está no corpo dele", () => {
    // Com o limpador furado, `sbFetch` não aparecia nem como nó.
    const saida = rodar("sbFetch");
    expect(saida).toMatch(/renovarSessao/);
    expect(saida).not.toMatch(/COMPARTILHADO \(0,/);
  });

  it("e continua LISTADO entre os HUBS", () => {
    // ⚠️ ERREI ESTE TESTE DUAS VEZES, DO MESMO JEITO.
    // Primeiro fixei `> 100`, depois `> 20` — e as duas vezes ele ficou
    // vermelho porque o trabalho deu certo. O número CAI de propósito a
    // cada módulo extraído: 170 → 152 → 138 → 103 → 78 → 44 → 28 → 18.
    // Fixar magnitude aqui é medir progresso e chamar de regressão.
    //
    // O que a fase invertida produzia não era um número pequeno: era
    // AUSÊNCIA — o `sbFetch` não aparecia no grafo de jeito nenhum. É isso
    // que se guarda: que ele esteja na lista de hubs, com pelo menos um
    // uso contado.
    const m = /(\d+)\s+\d+\s+sbFetch/.exec(rodar());
    expect(m, "o sbFetch sumiu dos HUBS — o grafo colapsou").not.toBeNull();
    expect(Number(m[1])).toBeGreaterThan(0);
  });
});
