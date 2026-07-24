// Testes de número e moeda.
//
// `taxa` sustenta o BI inteiro — e a regra que mais importa não é o cálculo,
// é o `null`: indicador sem denominador é "não calculável", não zero.
// Mostrar 0% de infecção num setor sem dados seria afirmação clínica falsa.

import { describe, it, expect } from "vitest";
import { fmt, fmtBRL, fmtReais, taxa } from "./formato.js";

// O separador de milhar do Intl pt-BR é U+00A0 (espaço não-quebrável) ou
// ".", dependendo do ICU da máquina. Normalizamos para não amarrar o teste
// a um ambiente específico.
const norm = s => s.replace(/ /g, " ");

describe("fmt — número pt-BR", () => {
  it("agrupa milhar", () => {
    expect(fmt(1234)).toBe((1234).toLocaleString("pt-BR"));
  });
  it("nulo/undefined viram 0", () => {
    expect(fmt(null)).toBe("0");
    expect(fmt(undefined)).toBe("0");
    expect(fmt(0)).toBe("0");
  });
});

describe("fmtReais — moeda montada à mão", () => {
  it("sempre duas casas decimais", () => {
    expect(fmtReais(1234.5)).toBe("R$ 1.234,50");
    expect(fmtReais(0.1)).toBe("R$ 0,10");
    expect(fmtReais(1000)).toBe("R$ 1.000,00");
  });
  it("nulo vira R$ 0,00", () => {
    expect(fmtReais(null)).toBe("R$ 0,00");
    expect(fmtReais(undefined)).toBe("R$ 0,00");
  });
});

describe("fmtBRL — moeda pelo Intl", () => {
  it("formata como moeda brasileira", () => {
    expect(norm(fmtBRL(1234.5))).toMatch(/R\$ ?1\.234,50/);
    expect(norm(fmtBRL(0))).toMatch(/R\$ ?0,00/);
  });
  it("nulo não estoura", () => {
    expect(norm(fmtBRL(null))).toMatch(/R\$ ?0,00/);
  });
});

describe("taxa — o núcleo do BI", () => {
  it("num/den × fator", () => {
    expect(taxa(5, 10)).toBe(50);           // 50%
    expect(taxa(3, 4, 1000)).toBe(750);     // por mil
  });
  it("NULL quando o denominador é zero ou ausente — não é 0", () => {
    expect(taxa(5, 0)).toBe(null);
    expect(taxa(5, null)).toBe(null);
    expect(taxa(null, 10)).toBe(null);
    expect(taxa(undefined, 10)).toBe(null);
  });
  it("numerador zero com denominador válido É 0 (diferente de sem-base)", () => {
    // zero casos num setor COM oportunidades é um zero legítimo
    expect(taxa(0, 10)).toBe(0);
  });
  it("aceita string numérica", () => {
    expect(taxa("5", "10")).toBe(50);
  });
});
