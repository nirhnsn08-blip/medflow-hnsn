// Testes da previsão de alta e da sinaleira de leito.
//
// A sinaleira decide, num relance, quem já passou da alta prevista — é o que
// o Giro de Leitos usa para priorizar. Erro aqui é paciente "invisível" na
// fila de saída. A data de referência é injetada para o teste não depender
// do relógio da máquina.

import { describe, it, expect } from "vitest";
import { sugerirCid, calcAlta, sinalLeito, diasDesde } from "./leitos.js";

const REFS = [
  { cid: "J18", descricao: "Pneumonia", dias: 7 },
  { cid: "I50", descricao: "Insuficiência cardíaca", dias: 5 },
  { cid: "J18.9", descricao: "Pneumonia não especificada", dias: 6 },
];

describe("sugerirCid", () => {
  it("casa exato primeiro", () => {
    expect(sugerirCid("J18", REFS).cid).toBe("J18");
  });
  it("casa por prefixo quando não há exato", () => {
    expect(sugerirCid("I5", REFS).cid).toBe("I50");
  });
  it("casa no texto da descrição (3+ caracteres)", () => {
    expect(sugerirCid("PNEUMO", REFS).descricao).toMatch(/Pneumonia/);
  });
  it("não casa com menos de 2 caracteres", () => {
    expect(sugerirCid("J", REFS)).toBe(null);
  });
  it("null quando nada bate ou faltam refs", () => {
    expect(sugerirCid("X99", REFS)).toBe(null);
    expect(sugerirCid("J18", [])).toBe(null);
    expect(sugerirCid("", REFS)).toBe(null);
  });
});

describe("calcAlta", () => {
  it("soma os dias previstos à internação", () => {
    // 20/07 + 5 dias = 25/07
    expect(calcAlta("2026-07-20", 5).toISOString().slice(0, 10)).toBe("2026-07-25");
  });
  it("vira o mês corretamente", () => {
    expect(calcAlta("2026-07-30", 5).toISOString().slice(0, 10)).toBe("2026-08-04");
  });
  it("null quando falta data ou dias", () => {
    expect(calcAlta(null, 5)).toBe(null);
    expect(calcAlta("2026-07-20", null)).toBe(null);
  });
});

describe("sinalLeito — as três cores", () => {
  const hoje = new Date(2026, 6, 24);   // 24/07/2026, local

  it("VERDE quando faltam 2+ dias", () => {
    const s = sinalLeito("2026-07-20", 7, hoje);   // alta 27/07 → faltam 3
    expect(s.cor).toBe("#34d399");
    expect(s.restam).toBe(3);
    expect(s.texto).toMatch(/faltam 3 dias/);
  });

  it("AMARELO quando falta 1 dia", () => {
    const s = sinalLeito("2026-07-20", 5, hoje);   // alta 25/07 → falta 1
    expect(s.cor).toBe("#fbbf24");
    expect(s.restam).toBe(1);
  });

  it("AMARELO com texto de 'hoje' quando a alta é hoje", () => {
    const s = sinalLeito("2026-07-20", 4, hoje);   // alta 24/07 → 0
    expect(s.cor).toBe("#fbbf24");
    expect(s.restam).toBe(0);
    expect(s.texto).toMatch(/hoje/);
  });

  it("VERMELHO quando já passou da alta", () => {
    const s = sinalLeito("2026-07-20", 2, hoje);   // alta 22/07 → −2
    expect(s.cor).toBe("#f43f5e");
    expect(s.restam).toBe(-2);
    expect(s.texto).toMatch(/2d após a alta/);
  });

  it("cinza 'sem previsão' quando falta dado", () => {
    const s = sinalLeito(null, null, hoje);
    expect(s.restam).toBe(null);
    expect(s.texto).toBe("sem previsão");
  });
});

describe("diasDesde", () => {
  it("conta os dias corridos até a data de referência", () => {
    expect(diasDesde("2026-07-20", "2026-07-24")).toBe(4);
  });
  it("data futura não vira negativo — é 0", () => {
    expect(diasDesde("2026-07-30", "2026-07-24")).toBe(0);
  });
  it("mesmo dia é 0", () => {
    expect(diasDesde("2026-07-24", "2026-07-24")).toBe(0);
  });
  it("null para vazio ou data inválida", () => {
    expect(diasDesde(null)).toBe(null);
    expect(diasDesde("data-ruim", "2026-07-24")).toBe(null);
  });
});
