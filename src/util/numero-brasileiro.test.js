// ═══════════════════════════════════════════════════════════
// LER NÚMERO ESCRITO POR GENTE
//
// 🔴 ESTE ARQUIVO EXISTE POR CAUSA DE UM DEFEITO REAL, achado em 03/09/2026
// enquanto se escrevia a importação de tabela de preço. O jeito antigo era:
//
//     Number(String(v).replace(/\./g, "").replace(",", "."))
//
// e ele estava em DOIS lugares — `salvarPreco` e `salvarRepasse` — com uma
// terceira cópia em `recusasDoPreco` decidindo se o valor era válido.
//
// Quem digitasse `1234.56` num campo de preço gravava **123456**. Cem vezes
// mais. Sem erro em tela, porque as três cópias concordavam entre si: a
// tela aprovava o valor errado e o banco gravava o valor errado.
//
// Os testes abaixo são quase todos sobre ESSE número.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { lerNumero, estiloDaColuna, numeroDigitado, ESTILO } from "./numero-brasileiro.js";

describe("🔴 a regressão que originou o arquivo", () => {
  it("ponto decimal com duas casas é decimal, não milhar", () => {
    // 🔴 O jeito antigo dava 123456 aqui. É o teste que mais importa.
    expect(numeroDigitado("1234.56")).toBe(1234.56);
    expect(numeroDigitado("99.90")).toBe(99.9);
    expect(numeroDigitado("0.50")).toBe(0.5);
  });

  it("e a vírgula decimal continua funcionando como sempre", () => {
    expect(numeroDigitado("1234,56")).toBe(1234.56);
    expect(numeroDigitado("1.234,56")).toBe(1234.56);
    expect(numeroDigitado("1.234.567,89")).toBe(1234567.89);
  });

  it("⚠️ num campo brasileiro, '1.234' é mil duzentos e trinta e quatro", () => {
    // Aqui o chute é DELIBERADO, e só aqui: o campo está na frente de uma
    // pessoa, num sistema em português. Planilha de origem desconhecida é
    // outra história — lá o mesmo texto é recusado (ver importar-precos).
    expect(numeroDigitado("1.234")).toBe(1234);
    expect(lerNumero("1.234").ambiguo).toBe(true);
  });
});

describe("lerNumero", () => {
  it("com os DOIS sinais, o último manda", () => {
    expect(lerNumero("1.234,56").valor).toBe(1234.56);
    expect(lerNumero("1,234.56").valor).toBe(1234.56);
  });

  it("dois sinais iguais só podem ser milhar", () => {
    expect(lerNumero("1.234.567").valor).toBe(1234567);
    expect(lerNumero("1,234,567").valor).toBe(1234567);
  });

  it("🔴 um sinal com EXATAMENTE três dígitos depois é ambíguo, e não se chuta", () => {
    const a = lerNumero("1.234");
    expect(a.ambiguo).toBe(true);
    expect(a.valor).toBe(null);
    expect(a.motivo).toMatch(/mil vezes/);
    expect(a.motivo).toContain("1234");
    expect(a.motivo).toContain("1.234");
  });

  it("o estilo resolve o ambíguo nos dois sentidos", () => {
    expect(lerNumero("1.234", ESTILO.VIRGULA).valor).toBe(1234);
    expect(lerNumero("1.234", ESTILO.PONTO).valor).toBe(1.234);
    expect(lerNumero("1,234", ESTILO.VIRGULA).valor).toBe(1.234);
    expect(lerNumero("1,234", ESTILO.PONTO).valor).toBe(1234);
  });

  it("⚠️ o estilo NÃO mexe no que já era claro", () => {
    // Duas casas depois do ponto não são milhar em convenção nenhuma.
    expect(lerNumero("1234.56", ESTILO.VIRGULA).valor).toBe(1234.56);
  });

  it("🔴 número já é número — não passa pelo interpretador de texto", () => {
    // Sem esta porta, o valor 1.234 viraria o texto "1.234", cairia no caso
    // ambíguo e sairia 1234 — mil vezes maior, à toa.
    expect(lerNumero(1.234).valor).toBe(1.234);
    expect(numeroDigitado(1.234)).toBe(1.234);
    expect(lerNumero(0).valor).toBe(0);
    expect(lerNumero(NaN).valor).toBe(null);
    expect(lerNumero(Infinity).valor).toBe(null);
  });

  it("tira R$ e espaço, inclusive o espaço fino do Excel", () => {
    expect(lerNumero("R$ 1.234,56").valor).toBe(1234.56);
    expect(lerNumero("R$ 1.234,56").valor).toBe(1234.56);
  });

  it("negativo é lido como negativo — quem recusa é quem chama", () => {
    expect(lerNumero("-99,90").valor).toBe(-99.9);
    expect(lerNumero("-1.234,56").valor).toBe(-1234.56);
  });

  it("🔴 ilegível devolve null, NUNCA zero", () => {
    // Zero é um valor válido (procedimento incluso no pacote). Devolver
    // zero para "não consegui ler" faria as duas coisas virarem uma só —
    // que é o defeito que este projeto mais persegue.
    for (const x of ["", "   ", null, undefined, "sob consulta", "-", ".", ",", "R$"]) {
      expect(lerNumero(x).valor, JSON.stringify(x)).toBe(null);
      expect(numeroDigitado(x), JSON.stringify(x)).toBe(null);
    }
  });

  it("zero de verdade continua zero", () => {
    expect(numeroDigitado("0")).toBe(0);
    expect(numeroDigitado("0,00")).toBe(0);
    expect(numeroDigitado("0.00")).toBe(0);
  });
});

describe("estiloDaColuna", () => {
  it("uma linha clara decide a coluna inteira", () => {
    expect(estiloDaColuna(["99,90", "1.234", "50,00"])).toBe(ESTILO.VIRGULA);
    expect(estiloDaColuna(["99.90", "1,234"])).toBe(ESTILO.PONTO);
  });

  it("🔴 coluna contraditória não é resolvida — é planilha mal montada", () => {
    expect(estiloDaColuna(["9,90", "9.90"])).toBe(null);
  });

  it("coluna sem nenhuma linha clara continua sem resposta", () => {
    expect(estiloDaColuna(["1.234", "5.678"])).toBe(null);
    expect(estiloDaColuna(["100", "200"])).toBe(null);
    expect(estiloDaColuna(["1.234.567"])).toBe(null);
    expect(estiloDaColuna([])).toBe(null);
    expect(estiloDaColuna(null)).toBe(null);
  });
});
