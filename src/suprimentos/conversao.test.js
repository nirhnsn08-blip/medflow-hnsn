// ═══════════════════════════════════════════════════════════
// Unidade de compra × unidade de consumo.
//
// Dois grupos de teste com propósitos diferentes:
//
// 1. COMPATIBILIDADE. Os 124 materiais que já existem não têm fator. Se
//    esta regra mudar o comportamento deles em qualquer aspecto, o PR
//    corrompe o histórico que veio consertar. Item sem fator = fator 1 =
//    exatamente o que acontecia antes.
//
// 2. A CONVERSÃO em si, validada por mutação:
//    • fator inválido propagando em vez de cair no padrão .... Infinity/negativo
//    • custo multiplicado em vez de dividido ................. custo médio
//    • sugestão de compra arredondando para baixo ............ falta material
//    • fator zero aceito .................................... divisão por zero
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  FATOR_PADRAO, fatorDe, temConversao, comprarParaConsumo,
  custoPorUnidadeConsumo, custoPorUnidadeCompra, consumoParaCompra, rotuloCompra,
  descreverEntrada, validarConversao,
} from "./conversao.js";

// A luva do exemplo real: compra-se caixa de 100, consome-se par.
const LUVA = { unidade: "par", unidade_compra: "caixa", fator_conversao: 100 };
// Um item como os 124 que já existem: nenhuma das colunas novas.
const ANTIGO = { unidade: "unidade" };

describe("compatibilidade — item sem fator se comporta como antes", () => {
  it("fator ausente vale 1", () => {
    expect(fatorDe(ANTIGO)).toBe(FATOR_PADRAO);
    expect(fatorDe({})).toBe(1);
    expect(fatorDe(null)).toBe(1);
  });
  it("quantidade não muda", () => {
    expect(comprarParaConsumo(7, ANTIGO)).toBe(7);
  });
  it("custo não muda", () => {
    expect(custoPorUnidadeConsumo(12.5, ANTIGO)).toBe(12.5);
  });
  it("não é tratado como item com conversão", () => {
    expect(temConversao(ANTIGO)).toBe(false);
  });
  it("o rótulo continua sendo a unidade de sempre", () => {
    expect(rotuloCompra(ANTIGO)).toBe("unidade");
  });
});

describe("fatorDe — valor inválido cai no padrão, não propaga", () => {
  it("zero não vira divisão por zero", () => expect(fatorDe({ fator_conversao: 0 })).toBe(1));
  it("negativo não cria estoque negativo na entrada", () => expect(fatorDe({ fator_conversao: -5 })).toBe(1));
  it("texto não vira NaN", () => expect(fatorDe({ fator_conversao: "abc" })).toBe(1));
  it("nulo e vazio caem no padrão", () => {
    expect(fatorDe({ fator_conversao: null })).toBe(1);
    expect(fatorDe({ fator_conversao: "" })).toBe(1);
  });
  it("número em texto é aceito (é como o formulário devolve)", () => {
    expect(fatorDe({ fator_conversao: "100" })).toBe(100);
  });
  it("fracionário válido é respeitado", () => {
    expect(fatorDe({ fator_conversao: 0.5 })).toBe(0.5);
  });
});

describe("comprarParaConsumo", () => {
  it("2 caixas de 100 entram como 200 pares", () => {
    expect(comprarParaConsumo(2, LUVA)).toBe(200);
  });
  it("quantidade inválida não vira NaN no estoque", () => {
    expect(comprarParaConsumo("abc", LUVA)).toBe(0);
    expect(comprarParaConsumo(undefined, LUVA)).toBe(0);
  });
  it("zero continua zero", () => expect(comprarParaConsumo(0, LUVA)).toBe(0));
});

describe("custoPorUnidadeConsumo — a metade da correção que ninguém vê", () => {
  it("caixa de R$ 80 com 100 pares custa R$ 0,80 o par", () => {
    expect(custoPorUnidadeConsumo(80, LUVA)).toBe(0.8);
  });
  it("🔴 DIVIDE, não multiplica", () => {
    // Sem dividir, a caixa de R$ 80 entra como R$ 80 por par e o custo
    // médio nunca mais volta ao lugar — ele é ponderado e carrega o erro
    // para todas as entradas seguintes.
    expect(custoPorUnidadeConsumo(80, LUVA)).toBeLessThan(80);
  });
  it("sem custo devolve null — quem chama mantém o anterior", () => {
    expect(custoPorUnidadeConsumo(0, LUVA)).toBeNull();
    expect(custoPorUnidadeConsumo(null, LUVA)).toBeNull();
    expect(custoPorUnidadeConsumo("abc", LUVA)).toBeNull();
  });
  it("custo negativo é recusado", () => {
    expect(custoPorUnidadeConsumo(-5, LUVA)).toBeNull();
  });
});

describe("custoPorUnidadeCompra — o caminho de volta, para o pedido", () => {
  it("R$ 0,80 o par vira R$ 80 a caixa de 100", () => {
    expect(custoPorUnidadeCompra(0.8, LUVA)).toBe(80);
  });
  it("🔴 MULTIPLICA — é o número que a aprovação por valor vai olhar", () => {
    // Sem multiplicar, 3 caixas de luva apareceriam valendo R$ 2,40 em vez
    // de R$ 240 no pedido.
    expect(custoPorUnidadeCompra(0.8, LUVA)).toBeGreaterThan(0.8);
  });
  it("ida e volta preservam o valor", () => {
    expect(custoPorUnidadeCompra(custoPorUnidadeConsumo(80, LUVA), LUVA)).toBeCloseTo(80, 10);
  });
  it("item sem conversão não muda o custo", () => {
    expect(custoPorUnidadeCompra(12.5, ANTIGO)).toBe(12.5);
  });
  it("sem custo devolve null", () => {
    expect(custoPorUnidadeCompra(0, LUVA)).toBeNull();
    expect(custoPorUnidadeCompra(null, LUVA)).toBeNull();
  });
});

describe("consumoParaCompra — quanto pedir", () => {
  it("250 pares pedem 3 caixas, não 2,5", () => {
    expect(consumoParaCompra(250, LUVA)).toBe(3);
  });
  it("🔴 arredonda para CIMA — faltar por arredondamento é pior que sobrar", () => {
    expect(consumoParaCompra(101, LUVA)).toBe(2);
    expect(consumoParaCompra(1, LUVA)).toBe(1);
  });
  it("múltiplo exato não ganha caixa a mais", () => {
    expect(consumoParaCompra(200, LUVA)).toBe(2);
  });
  it("zero ou negativo não pede nada", () => {
    expect(consumoParaCompra(0, LUVA)).toBe(0);
    expect(consumoParaCompra(-10, LUVA)).toBe(0);
  });
  it("item sem conversão pede a mesma quantidade", () => {
    expect(consumoParaCompra(37, ANTIGO)).toBe(37);
  });
});

describe("rótulos e descrição", () => {
  it("mostra a unidade de compra com o conteúdo", () => {
    expect(rotuloCompra(LUVA)).toBe("caixa (100 par)");
  });
  it("unidade de compra com fator 1 não inventa parêntese", () => {
    expect(rotuloCompra({ unidade: "unidade", unidade_compra: "peça", fator_conversao: 1 })).toBe("peça");
  });
  it("descreve a entrada dos dois lados, para conferir antes de confirmar", () => {
    expect(descreverEntrada(2, LUVA)).toBe("2 caixa = 200 par");
  });
  it("sem conversão, descreve só um lado", () => {
    expect(descreverEntrada(7, ANTIGO)).toBe("7 unidade");
  });
});

describe("validarConversao", () => {
  it("item sem nada informado passa", () => {
    expect(validarConversao(ANTIGO).ok).toBe(true);
    expect(validarConversao(ANTIGO).avisos).toEqual([]);
  });

  it("a luva bem cadastrada passa sem aviso", () => {
    const r = validarConversao(LUVA);
    expect(r.ok).toBe(true);
    expect(r.avisos).toEqual([]);
  });

  it("🔴 fator zero BLOQUEIA", () => {
    const r = validarConversao({ ...LUVA, fator_conversao: 0 });
    expect(r.ok).toBe(false);
    expect(r.erros[0]).toMatch(/maior que zero/);
  });

  it("fator negativo bloqueia", () => {
    expect(validarConversao({ ...LUVA, fator_conversao: -3 }).ok).toBe(false);
  });

  it("fator não numérico bloqueia", () => {
    expect(validarConversao({ ...LUVA, fator_conversao: "cem" }).ok).toBe(false);
  });

  it("unidade de compra com fator 1 avisa que nada será convertido", () => {
    // O erro de cadastro mais provável: preencher "caixa" e esquecer o 100.
    const r = validarConversao({ unidade: "par", unidade_compra: "caixa", fator_conversao: 1 });
    expect(r.ok).toBe(true);
    expect(r.avisos[0]).toMatch(/nada será convertido/);
  });

  it("fator sem nome da unidade avisa, mas não bloqueia", () => {
    const r = validarConversao({ unidade: "par", fator_conversao: 100 });
    expect(r.ok).toBe(true);
    expect(r.avisos[0]).toMatch(/nome da unidade de compra/);
  });
});
