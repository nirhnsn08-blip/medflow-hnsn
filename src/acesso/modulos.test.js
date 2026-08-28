// ═══════════════════════════════════════════════════════════
// O CATÁLOGO DE MÓDULOS SUSTENTA DUAS TELAS
//
// 🔴 POR QUE ESTE ARQUIVO EXISTE
// `grupo` existia em `modulos.js` desde sempre, e só a matriz de perfis o
// consumia. Quem configurava acesso via o sistema organizado; quem
// trabalhava nele via 17 itens em fila. Desde 28/08/2026 a barra lateral
// também lê daqui — e isso criou uma dependência silenciosa: um módulo com
// `grupo` fora de `GRUPOS` some das DUAS telas sem erro nenhum.
//
// Sumir sem erro é o modo de falha que esta casa persegue. Daí o teste.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { MODULOS, GRUPOS, GRUPOS_ORFAOS, MODULO_POR_CHAVE } from "./modulos.js";

describe("🔴 todo módulo cai em um grupo conhecido", () => {
  it("nenhum órfão — órfão sumiria do menu E da matriz, em silêncio", () => {
    expect(GRUPOS_ORFAOS).toEqual([]);
  });

  it("e todo grupo declarado tem pelo menos um módulo", () => {
    // Grupo vazio desenharia um cabeçalho sem nada embaixo. A barra lateral
    // já pula grupo vazio em tempo de execução; aqui se garante que não
    // existe grupo vazio POR ENGANO, que é diferente de vazio por permissão.
    for (const g of GRUPOS) {
      expect(MODULOS.filter(m => m.grupo === g).length, `grupo "${g}" está vazio`).toBeGreaterThan(0);
    }
  });
});

describe("a ordem dos grupos é decidida, não herdada", () => {
  it("🔴 `GRUPOS` é lista explícita, não derivada da ordem de `MODULOS`", () => {
    // Quando era `[...new Set(MODULOS.map(m => m.grupo))]`, a ordem saía de
    // qual módulo aparecia primeiro no array — e `ambulatorio`, na terceira
    // posição, jogava "Receita e produção" para o topo do menu. A ordem da
    // navegação passava a depender de arrumação de lista.
    const derivada = [...new Set(MODULOS.map(m => m.grupo))];
    expect(GRUPOS).not.toEqual(derivada);
    expect(GRUPOS.indexOf("Jornada do paciente")).toBeLessThan(GRUPOS.indexOf("Receita e produção"));
  });

  it("abre no que é geral e fecha no que só a administração toca", () => {
    expect(GRUPOS[0]).toBe("Geral");
    expect(GRUPOS[GRUPOS.length - 1]).toBe("Administração do sistema");
  });
});

describe("os rótulos que a tela mostra", () => {
  it("⚠️ `overview` se chama pelo título que a própria tela usa", () => {
    // O item de menu dizia "Visão Geral" e a tela se intitulava "Centro de
    // Monitoramento". Duas palavras para a mesma porta, e a do menu era a
    // que prometia mais do que entregava — não é a visão geral do hospital,
    // é o painel de leitos.
    expect(MODULO_POR_CHAVE.overview.label).toBe("Centro de Monitoramento");
  });

  it("nenhum rótulo repetido — dois itens com o mesmo nome é o defeito de origem", () => {
    const rotulos = MODULOS.map(m => m.label);
    expect(new Set(rotulos).size).toBe(rotulos.length);
  });
});

describe("a jornada do paciente está na ordem do trabalho", () => {
  it("chega → é triado → é operado → é internado", () => {
    // Quem aprende o menu aprende o fluxo do hospital. A ordem dentro do
    // grupo mora na barra lateral (App.jsx), mas o PERTENCIMENTO mora aqui:
    // se um destes sair do grupo, a sequência deixa de existir.
    const jornada = MODULOS.filter(m => m.grupo === "Jornada do paciente").map(m => m.chave);
    for (const c of ["atendimento", "ps", "bloco", "leitos", "paciente"]) {
      expect(jornada, `${c} deveria estar na jornada`).toContain(c);
    }
  });

  it("⚠️ e o Faturamento NÃO está nela — é depois da alta, e é outra mesa", () => {
    expect(MODULO_POR_CHAVE.faturamento.grupo).toBe("Receita e produção");
  });
});
