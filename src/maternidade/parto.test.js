import { describe, it, expect } from "vitest";
import { classificarRobson, avaliarHemorragia, avaliarApgar, ehNulipara, ROBSON } from "./parto.js";

// base = grupo 1 (nulípara, cefálico, termo, único, espontâneo); cada teste muda o que precisa
const base = { nulipara: true, cesareaAnterior: false, semanas: 39, apresentacao: "cefalica", nFetos: 1, inicio: "espontaneo" };
const R = (over) => classificarRobson({ ...base, ...over });

describe("ehNulipara", () => {
  it("nenhum parto anterior (T+P=0) é nulípara", () => {
    expect(ehNulipara({ termo: 0, prematuro: 0 })).toBe(true);
    expect(ehNulipara({ termo: 1, prematuro: 0 })).toBe(false);
    expect(ehNulipara({ termo: 0, prematuro: 2 })).toBe(false);
  });
  it("sem dado nenhum, ou peça faltando, não dá para dizer (null)", () => {
    expect(ehNulipara({})).toBe(null);
    expect(ehNulipara({ termo: 0 })).toBe(null);      // termo 0, mas prematuros não vieram
    expect(ehNulipara({ termo: 2 })).toBe(false);     // já pariu → não é nulípara, mesmo sem prematuros
  });
});

describe("classificarRobson — os 10 grupos", () => {
  it("grupo 1 — nulípara, cefálico, termo, único, espontâneo", () => {
    expect(R({}).grupo).toBe(1);
  });
  it("grupo 2 — igual ao 1, mas induzido OU cesárea antes do trabalho", () => {
    expect(R({ inicio: "induzido" }).grupo).toBe(2);
    expect(R({ inicio: "cesarea_pre_trabalho" }).grupo).toBe(2);
  });
  it("grupo 3 — multípara sem cesárea anterior, espontâneo", () => {
    expect(R({ nulipara: false }).grupo).toBe(3);
  });
  it("grupo 4 — multípara sem cesárea anterior, induzido", () => {
    expect(R({ nulipara: false, inicio: "induzido" }).grupo).toBe(4);
  });
  it("grupo 5 — cesárea anterior, cefálico único termo (início não importa)", () => {
    expect(R({ nulipara: false, cesareaAnterior: true, inicio: "espontaneo" }).grupo).toBe(5);
  });
  it("grupo 6 — nulípara, pélvico", () => {
    expect(R({ apresentacao: "pelvica" }).grupo).toBe(6);
  });
  it("grupo 7 — multípara, pélvico (inclui cesárea anterior)", () => {
    expect(R({ nulipara: false, apresentacao: "pelvica" }).grupo).toBe(7);
    expect(R({ nulipara: false, cesareaAnterior: true, apresentacao: "pelvica" }).grupo).toBe(7);
  });
  it("grupo 8 — múltipla (inclui cesárea anterior)", () => {
    expect(R({ nFetos: 2 }).grupo).toBe(8);
    expect(R({ nFetos: 3, cesareaAnterior: true, apresentacao: "pelvica" }).grupo).toBe(8);
  });
  it("grupo 9 — situação anômala (transversa/oblíqua)", () => {
    expect(R({ apresentacao: "transversa" }).grupo).toBe(9);
    expect(R({ apresentacao: "córmica" }).grupo).toBe(9);
  });
  it("grupo 10 — cefálico único pré-termo (<37, inclui cesárea anterior)", () => {
    expect(R({ semanas: 34 }).grupo).toBe(10);
    expect(R({ semanas: 34, cesareaAnterior: true }).grupo).toBe(10);
  });
});

describe("classificarRobson — precedência (a ordem da OMS)", () => {
  it("múltipla vence pélvica e cesárea anterior", () => {
    expect(R({ nFetos: 2, apresentacao: "pelvica", cesareaAnterior: true }).grupo).toBe(8);
  });
  it("anômala vence pré-termo", () => {
    expect(R({ apresentacao: "transversa", semanas: 34 }).grupo).toBe(9);
  });
  it("pélvico pré-termo é grupo 6/7 (apresentação vence o pré-termo), não 10", () => {
    expect(R({ apresentacao: "pelvica", semanas: 33 }).grupo).toBe(6);
  });
  it("cesárea anterior no pré-termo cefálico ainda é 10 (pré-termo vence o 5)", () => {
    expect(R({ semanas: 34, cesareaAnterior: true }).grupo).toBe(10);
  });
});

describe("classificarRobson — incompleto (nunca chuta)", () => {
  it("sem paridade", () => {
    const r = classificarRobson({ ...base, nulipara: undefined });
    expect(r.completo).toBe(false);
    expect(r.grupo).toBe(null);
    expect(r.falta).toMatch(/paridade/i);
  });
  it("sem apresentação", () => {
    expect(classificarRobson({ ...base, apresentacao: "" }).falta).toMatch(/apresenta/i);
  });
  it("sem idade gestacional", () => {
    expect(classificarRobson({ ...base, semanas: null }).falta).toMatch(/gestacional/i);
  });
  it("termo/cefálico/único/sem cesárea, mas sem o início do trabalho", () => {
    const r = classificarRobson({ ...base, inicio: "" });
    expect(r.completo).toBe(false);
    expect(r.falta).toMatch(/trabalho/i);
  });
  it("mas se já cai em 5/6/7/8/9/10, o início não é exigido", () => {
    expect(classificarRobson({ ...base, cesareaAnterior: true, nulipara: false, inicio: "" }).grupo).toBe(5);
    expect(classificarRobson({ ...base, apresentacao: "pelvica", inicio: "" }).grupo).toBe(6);
  });
  it("toda descrição de grupo existe", () => {
    for (let g = 1; g <= 10; g++) expect(ROBSON[g]).toBeTruthy();
  });
});

describe("avaliarHemorragia — limiar por via", () => {
  it("vaginal: HPP a partir de 500 ml", () => {
    expect(avaliarHemorragia({ perda_ml: 499, via: "vaginal" }).hemorragia).toBe(false);
    expect(avaliarHemorragia({ perda_ml: 500, via: "vaginal" }).hemorragia).toBe(true);
  });
  it("cesárea: HPP a partir de 1000 ml", () => {
    expect(avaliarHemorragia({ perda_ml: 800, via: "cesarea" }).hemorragia).toBe(false);
    expect(avaliarHemorragia({ perda_ml: 1000, via: "cesarea" }).hemorragia).toBe(true);
  });
  it("≥1000 ml é grave em qualquer via", () => {
    expect(avaliarHemorragia({ perda_ml: 1000, via: "vaginal" }).grave).toBe(true);
    expect(avaliarHemorragia({ perda_ml: 900, via: "vaginal" }).grave).toBe(false);
  });
  it("sem perda informada não avalia (nada de fingir 0)", () => {
    expect(avaliarHemorragia({ via: "vaginal" }).avaliado).toBe(false);
    expect(avaliarHemorragia({ perda_ml: -1 }).avaliado).toBe(false);
  });
});

describe("avaliarApgar", () => {
  it("faixas: 0–3 grave, 4–6 moderado, 7–10 normal", () => {
    expect(avaliarApgar(9).faixa).toBe("normal");
    expect(avaliarApgar(7).faixa).toBe("normal");
    expect(avaliarApgar(6).faixa).toBe("moderado");
    expect(avaliarApgar(4).faixa).toBe("moderado");
    expect(avaliarApgar(3).faixa).toBe("grave");
    expect(avaliarApgar(0).faixa).toBe("grave");
  });
  it("fora de 0–10 (ou não inteiro) é inválido", () => {
    expect(avaliarApgar(11).valido).toBe(false);
    expect(avaliarApgar(-1).valido).toBe(false);
    expect(avaliarApgar(5.5).valido).toBe(false);
    expect(avaliarApgar("").valido).toBe(false);
  });
});
