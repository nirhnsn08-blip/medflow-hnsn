import { describe, it, expect } from "vitest";
import { relatorioRobson, resumoPartos, resumoRN, razao } from "./indicadores.js";

const partos = [
  { robson: 1, via: "vaginal", perda_sangue_ml: 300 },
  { robson: 1, via: "cesarea", perda_sangue_ml: 1100 },   // cesárea + hemorragia (≥1000)
  { robson: 5, via: "cesarea", perda_sangue_ml: 200 },
  { robson: 2, via: "forceps", perda_sangue_ml: 600 },    // vaginal-ish + hemorragia (≥500)
  { robson: null, via: "vaginal", rn_vivo: false },        // sem grupo, natimorto, sem perda
];

describe("razao", () => {
  it("null quando não há denominador (0 de 0 não é 0%)", () => {
    expect(razao(0, 0)).toBe(null);
    expect(razao(2, 5)).toBeCloseTo(0.4);
  });
});

describe("relatorioRobson", () => {
  it("total, cesáreas e taxa global", () => {
    const r = relatorioRobson(partos);
    expect(r.total).toBe(5);
    expect(r.cesareas).toBe(2);
    expect(r.taxaGlobal).toBeCloseTo(0.4);
    expect(r.semGrupo).toBe(1);
    expect(r.grupos).toHaveLength(10);
  });
  it("por grupo: tamanho, taxa do grupo e contribuição", () => {
    const r = relatorioRobson(partos);
    const g1 = r.grupos.find(g => g.grupo === 1);
    expect(g1).toMatchObject({ n: 2, cesareas: 1 });
    expect(g1.taxaGrupo).toBeCloseTo(0.5);        // 1 de 2
    expect(g1.contribuicao).toBeCloseTo(0.2);     // 1 de 5
    const g5 = r.grupos.find(g => g.grupo === 5);
    expect(g5).toMatchObject({ n: 1, cesareas: 1 });
    expect(g5.taxaGrupo).toBe(1);
    const g2 = r.grupos.find(g => g.grupo === 2);
    expect(g2).toMatchObject({ n: 1, cesareas: 0 });   // fórceps não é cesárea
    expect(g2.taxaGrupo).toBe(0);
  });
  it("vazio: 10 grupos zerados, taxa global null", () => {
    const r = relatorioRobson([]);
    expect(r.total).toBe(0);
    expect(r.taxaGlobal).toBe(null);
    expect(r.grupos.every(g => g.n === 0 && g.taxaGrupo === null)).toBe(true);
  });
});

describe("resumoPartos", () => {
  it("via, cesárea, hemorragia e natimortos", () => {
    const r = resumoPartos(partos);
    expect(r).toMatchObject({ total: 5, cesareas: 2, vaginais: 3, natimortos: 1 });
    expect(r.taxaCesarea).toBeCloseTo(0.4);
    expect(r.hemorragias).toBe(2);      // p2 (cesárea 1100) + p4 (fórceps 600)
    expect(r.comPerda).toBe(4);         // p5 não tem perda informada
    expect(r.taxaHemorragia).toBeCloseTo(0.5);
  });
});

describe("resumoRN", () => {
  const rns = [
    { peso_g: 3200, ig_capurro_semanas: 39, apgar_5: 9 },
    { peso_g: 2000, ig_capurro_semanas: 34, apgar_5: 6 },
    { peso_g: null, ig_capurro_semanas: null, apgar_5: null },
  ];
  it("cada taxa sobre o que foi medido, não sobre o total cego", () => {
    const r = resumoRN(rns);
    expect(r.total).toBe(3);
    expect(r).toMatchObject({ baixoPeso: 1, comPeso: 2, prematuros: 1, comIG: 2, apgar5Baixo: 1, comApgar5: 2 });
    expect(r.taxaBaixoPeso).toBeCloseTo(0.5);
    expect(r.taxaPrematuridade).toBeCloseTo(0.5);
    expect(r.taxaApgar5Baixo).toBeCloseTo(0.5);
  });
  it("vazio não inventa taxa", () => {
    const r = resumoRN([]);
    expect(r.total).toBe(0);
    expect(r.taxaBaixoPeso).toBe(null);
  });
});
