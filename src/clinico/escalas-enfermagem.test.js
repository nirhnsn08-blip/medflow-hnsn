// Testes das escalas de enfermagem. Protegem o cálculo e a classificação — se
// um score sair errado ou cair na faixa errada, uma enfermeira pode subestimar
// risco de queda, lesão por pressão ou nível de consciência. Os NÚMEROS dos
// cortes são o seed de rascunho (a equipe valida na tela); aqui se testa a
// LÓGICA: somar itens, classificar por faixa e cobrar reavaliação.

import { describe, it, expect } from "vitest";
import {
  scoreEscala, classificarEscala, avaliarEscala, precisaReavaliar, escalasValidadas,
} from "./escalas-enfermagem.js";

// Fixture espelhando migracao-enf-escalas-lpp.sql (subconjunto).
const FAIXAS = [
  { id: "braden_muito_alto", tipo: "braden", ativo: true, validado: true, faixa_min: null, faixa_max: 9,  rotulo: "Risco muito alto", nivel: "vermelho", reavaliar_horas: 24 },
  { id: "braden_alto",       tipo: "braden", ativo: true, validado: true, faixa_min: 10,   faixa_max: 12, rotulo: "Risco alto",       nivel: "laranja",  reavaliar_horas: 24 },
  { id: "braden_moderado",   tipo: "braden", ativo: true, validado: true, faixa_min: 13,   faixa_max: 14, rotulo: "Risco moderado",   nivel: "amarelo",  reavaliar_horas: 48 },
  { id: "braden_baixo",      tipo: "braden", ativo: true, validado: true, faixa_min: 15,   faixa_max: 18, rotulo: "Risco baixo",      nivel: "verde",    reavaliar_horas: 72 },
  { id: "braden_sem",        tipo: "braden", ativo: true, validado: true, faixa_min: 19,   faixa_max: null, rotulo: "Sem risco",      nivel: "verde",    reavaliar_horas: 168 },
  { id: "morse_baixo",    tipo: "morse", ativo: true, validado: true, faixa_min: null, faixa_max: 24, rotulo: "Risco baixo",    nivel: "verde",   reavaliar_horas: 48 },
  { id: "morse_moderado", tipo: "morse", ativo: true, validado: true, faixa_min: 25,   faixa_max: 44, rotulo: "Risco moderado", nivel: "amarelo", reavaliar_horas: 24 },
  { id: "morse_alto",     tipo: "morse", ativo: true, validado: true, faixa_min: 45,   faixa_max: null, rotulo: "Risco alto",   nivel: "laranja", reavaliar_horas: 12 },
  { id: "glasgow_grave",    tipo: "glasgow", ativo: true, validado: true, faixa_min: null, faixa_max: 8,  rotulo: "Grave",    nivel: "vermelho", reavaliar_horas: 1 },
  { id: "glasgow_moderado", tipo: "glasgow", ativo: true, validado: true, faixa_min: 9,    faixa_max: 12, rotulo: "Moderado", nivel: "laranja",  reavaliar_horas: 2 },
  { id: "glasgow_leve",     tipo: "glasgow", ativo: true, validado: true, faixa_min: 13,   faixa_max: 15, rotulo: "Leve",     nivel: "verde",    reavaliar_horas: 8 },
  { id: "rass_calmo",        tipo: "rass", ativo: true, validado: true, faixa_min: 0,  faixa_max: 0,  rotulo: "Alerta e calmo",   nivel: "verde",    reavaliar_horas: 8 },
  { id: "rass_sedacao_prof", tipo: "rass", ativo: true, validado: true, faixa_min: -4, faixa_max: -3, rotulo: "Sedação profunda", nivel: "laranja",  reavaliar_horas: 2 },
  { id: "rass_nao_desperta", tipo: "rass", ativo: true, validado: true, faixa_min: -5, faixa_max: -5, rotulo: "Não desperta",     nivel: "vermelho", reavaliar_horas: 1 },
];

describe("scoreEscala", () => {
  it("soma os subitens nas escalas de soma", () => {
    // Braden: 6 subescalas
    expect(scoreEscala("braden", { a: 2, b: 3, c: 2, d: 1, e: 2, f: 2 })).toBe(12);
    // Glasgow: ocular+verbal+motora
    expect(scoreEscala("glasgow", { ocular: 3, verbal: 4, motora: 5 })).toBe(12);
  });
  it("lê o valor direto nas escalas de valor (dor/rass/flebite)", () => {
    expect(scoreEscala("dor", { valor: 7 })).toBe(7);
    expect(scoreEscala("rass", { valor: -4 })).toBe(-4);
    expect(scoreEscala("flebite", { valor: 2 })).toBe(2);
  });
  it("sem itens válidos → null", () => {
    expect(scoreEscala("braden", {})).toBe(null);
    expect(scoreEscala("dor", { valor: "" })).toBe(null);
    expect(scoreEscala("rass", {})).toBe(null);
  });
});

describe("classificarEscala", () => {
  it("Braden cai na faixa certa (menor = mais grave)", () => {
    expect(classificarEscala("braden", 8, FAIXAS).rotulo).toBe("Risco muito alto");
    expect(classificarEscala("braden", 12, FAIXAS).rotulo).toBe("Risco alto");
    expect(classificarEscala("braden", 20, FAIXAS).rotulo).toBe("Sem risco");
  });
  it("Morse com teto aberto pega risco alto", () => {
    expect(classificarEscala("morse", 60, FAIXAS).nivel).toBe("laranja");
    expect(classificarEscala("morse", 10, FAIXAS).nivel).toBe("verde");
  });
  it("classifica escores negativos (RASS)", () => {
    expect(classificarEscala("rass", -5, FAIXAS).rotulo).toBe("Não desperta");
    expect(classificarEscala("rass", 0, FAIXAS).rotulo).toBe("Alerta e calmo");
  });
  it("não mistura escalas: score de braden não classifica como morse", () => {
    expect(classificarEscala("morse", 8, FAIXAS).tipo).toBe("morse");
  });
  it("score nulo → null", () => {
    expect(classificarEscala("braden", null, FAIXAS)).toBe(null);
  });
});

describe("avaliarEscala", () => {
  it("junta score + classificação + nível + gatilho", () => {
    const r = avaliarEscala("glasgow", { ocular: 1, verbal: 1, motora: 4 }, FAIXAS); // 6 → grave
    expect(r.score).toBe(6);
    expect(r.classificacao).toBe("Grave");
    expect(r.nivel).toBe("vermelho");
    expect(r.reavaliar_horas).toBe(1);
  });
});

describe("precisaReavaliar", () => {
  const agora = 1_700_000_000_000;
  it("cobra reavaliação quando estourou o prazo", () => {
    const ha3h = new Date(agora - 3 * 3600 * 1000).toISOString();
    expect(precisaReavaliar(ha3h, 2, agora)).toBe(true);   // prazo 2h, passou 3h
    expect(precisaReavaliar(ha3h, 8, agora)).toBe(false);  // prazo 8h, só 3h
  });
  it("sem prazo ou sem data → não cobra", () => {
    expect(precisaReavaliar(new Date(agora).toISOString(), null, agora)).toBe(false);
    expect(precisaReavaliar(null, 2, agora)).toBe(false);
  });
});

describe("escalasValidadas", () => {
  it("true quando todas as ativas estão validadas", () => {
    expect(escalasValidadas(FAIXAS)).toBe(true);
  });
  it("false se alguma não está validada", () => {
    const uma = FAIXAS.map(f => f.id === "morse_alto" ? { ...f, validado: false } : f);
    expect(escalasValidadas(uma)).toBe(false);
  });
  it("filtra por subconjunto de escalas", () => {
    const bradenSoValidado = FAIXAS.map(f => f.tipo === "morse" ? { ...f, validado: false } : f);
    expect(escalasValidadas(bradenSoValidado, ["braden"])).toBe(true);   // só braden importa
    expect(escalasValidadas(bradenSoValidado, ["morse"])).toBe(false);
  });
  it("vazio → false", () => {
    expect(escalasValidadas([])).toBe(false);
  });
});
