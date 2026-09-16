import { describe, it, expect } from "vitest";
import { calcularMeows, pontosDoParametro, CHART_PADRAO, NIVEL } from "./meows.js";

// A paciente-exemplo da tela de admissão: tudo dentro da faixa.
const NORMAL = { pa_sis: 128, pa_dia: 82, fc: 88, fr: 18, temp: 36.6, sato2: 98, consciencia: "alerta" };

describe("pontosDoParametro", () => {
  it("acerta as bordas da PA sistólica", () => {
    const def = CHART_PADRAO.pa_sis;
    expect(pontosDoParametro(def, 89)).toBe(2);
    expect(pontosDoParametro(def, 90)).toBe(1);
    expect(pontosDoParametro(def, 100)).toBe(0);
    expect(pontosDoParametro(def, 159)).toBe(1);
    expect(pontosDoParametro(def, 160)).toBe(2);
  });
  it("lê parâmetro categórico (consciência) pelo mapa", () => {
    const def = CHART_PADRAO.consciencia;
    expect(pontosDoParametro(def, "alerta")).toBe(0);
    expect(pontosDoParametro(def, "resposta_dor")).toBe(2);
  });
  it("null quando o valor não veio ou não é número", () => {
    expect(pontosDoParametro(CHART_PADRAO.fc, "")).toBeNull();
    expect(pontosDoParametro(CHART_PADRAO.fc, "abc")).toBeNull();
  });
});

describe("calcularMeows", () => {
  it("vitais normais = verde, total 0", () => {
    const r = calcularMeows(NORMAL);
    expect(r.total).toBe(0);
    expect(r.nivel).toBe(NIVEL.VERDE);
    expect(r.faltando).toEqual([]);
    expect(r.avaliado).toBe(true);
  });

  it("um único vermelho já pinta vermelho (não dilui na média)", () => {
    // PA 165/95: sistólica ≥160 → 2. Sozinha basta.
    const r = calcularMeows({ ...NORMAL, pa_sis: 165 });
    expect(r.vermelhos).toBe(1);
    expect(r.nivel).toBe(NIVEL.VERMELHO);
  });

  it("um amarelo sozinho é amarelo", () => {
    const r = calcularMeows({ ...NORMAL, pa_sis: 155 });   // 150–159 → 1
    expect(r.amarelos).toBe(1);
    expect(r.nivel).toBe(NIVEL.AMARELO);
  });

  it("dois amarelos viram vermelho", () => {
    const r = calcularMeows({ ...NORMAL, pa_sis: 155, fc: 110 });  // 1 + 1
    expect(r.amarelos).toBe(2);
    expect(r.vermelhos).toBe(0);
    expect(r.nivel).toBe(NIVEL.VERMELHO);
  });

  it("temperatura de 37,6 é amarela (borda)", () => {
    expect(calcularMeows({ ...NORMAL, temp: 37.6 }).nivel).toBe(NIVEL.AMARELO);
  });

  it("sem nenhum vital NÃO é verde — é 'não dá para dizer'", () => {
    const r = calcularMeows({});
    expect(r.avaliado).toBe(false);
    expect(r.faltando.length).toBe(Object.keys(CHART_PADRAO).length);
  });

  it("lista o que faltou em vez de fingir verde", () => {
    const r = calcularMeows({ pa_sis: 120, fc: 80 });   // só dois dos sete
    expect(r.itens.length).toBe(2);
    expect(r.faltando).toContain("sato2");
    expect(r.faltando).toContain("temp");
  });

  it("respeita um chart alternativo (o RT trocando a régua)", () => {
    // Régua que torna 120 de sistólica um vermelho.
    const chart = { pa_sis: { rotulo: "PA", faixas: [{ min: 120, pontos: 2 }, { max: 119, pontos: 0 }] } };
    expect(calcularMeows({ pa_sis: 120 }, chart).nivel).toBe(NIVEL.VERMELHO);
    expect(calcularMeows({ pa_sis: 110 }, chart).nivel).toBe(NIVEL.VERDE);
  });
});
