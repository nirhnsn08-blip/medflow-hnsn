import { describe, it, expect } from "vitest";
import { diaDe, igEntre, dppDe, imc, bishop, gtpalIncoerencias, formatarGtpal } from "./obstetricia.js";

const MS_DIA = 86400000;

describe("diaDe", () => {
  it("lê string ISO e Date, à meia-noite local", () => {
    expect(diaDe("2026-09-07")).toEqual(new Date(2026, 8, 7));
    expect(diaDe(new Date(2026, 8, 7, 13, 30))).toEqual(new Date(2026, 8, 7));
  });
  it("devolve null para lixo", () => {
    expect(diaDe(null)).toBeNull();
    expect(diaDe("ontem")).toBeNull();
    expect(diaDe("2026-13-40")).toBeNull();
  });
});

describe("igEntre", () => {
  it("conta semanas E dias, não só semanas", () => {
    const dum = "2026-01-01";
    const ref = new Date(2026, 0, 1 + 7 * 39 + 1);   // 39s+1d depois
    expect(igEntre(dum, ref)).toEqual({ semanas: 39, dias: 1, totalDias: 274 });
  });
  it("é zero no dia da DUM", () => {
    expect(igEntre("2026-01-01", "2026-01-01")).toEqual({ semanas: 0, dias: 0, totalDias: 0 });
  });
  it("recusa DUM no futuro (dado errado, não IG negativa)", () => {
    expect(igEntre("2026-09-10", "2026-09-07")).toBeNull();
  });
});

describe("dppDe", () => {
  it("é DUM + 280 dias (Naegele)", () => {
    const dpp = dppDe("2026-01-01");
    expect(Math.round((dpp - diaDe("2026-01-01")) / MS_DIA)).toBe(280);
  });
  it("null para DUM ilegível", () => {
    expect(dppDe("")).toBeNull();
  });
});

describe("imc", () => {
  it("calcula com uma casa", () => {
    expect(imc(78, 1.62)).toBe(29.7);
  });
  it("null quando falta ou é absurdo", () => {
    expect(imc(0, 1.6)).toBeNull();
    expect(imc(70, 0)).toBeNull();
    expect(imc(null, 1.6)).toBeNull();
  });
});

describe("bishop", () => {
  it("soma os cinco componentes", () => {
    const r = bishop({ dilatacao: 3, apagamento: 70, altura: -1, consistencia: "amolecida", posicao: "anterior" });
    expect(r.score).toBe(2 + 2 + 2 + 2 + 2);   // 10
    expect(r.completo).toBe(true);
  });
  it("marca incompleto quando falta peça — e não finge um total real", () => {
    const r = bishop({ dilatacao: 3, apagamento: 70, altura: -1 });
    expect(r.completo).toBe(false);
    expect(r.itens.consistencia).toBeNull();
  });
  it("acerta as bordas de dilatação e De Lee", () => {
    expect(bishop({ dilatacao: 5 }).itens.dilatacao).toBe(3);
    expect(bishop({ dilatacao: 0 }).itens.dilatacao).toBe(0);
    expect(bishop({ altura: -3 }).itens.altura).toBe(0);
    expect(bishop({ altura: 1 }).itens.altura).toBe(3);
    expect(bishop({ altura: -1 }).itens.altura).toBe(2);
  });
});

describe("gtpalIncoerencias", () => {
  it("aceita gestação em curso (gesta > termo+prematuro+abortos)", () => {
    // G3, mas só 1 termo + 1 aborto: a 3ª é a atual, ainda sem desfecho.
    expect(gtpalIncoerencias({ gesta: 3, termo: 1, prematuro: 0, abortos: 1, vivos: 1 })).toEqual([]);
  });
  it("recusa mais desfechos do que gestações", () => {
    expect(gtpalIncoerencias({ gesta: 2, termo: 2, prematuro: 1, abortos: 0, vivos: 2 }).length).toBe(1);
  });
  it("recusa mais vivos do que partos", () => {
    expect(gtpalIncoerencias({ gesta: 3, termo: 1, prematuro: 0, abortos: 0, vivos: 2 }).length).toBe(1);
  });
});

describe("formatarGtpal", () => {
  it("monta o rótulo e ignora o que não veio", () => {
    expect(formatarGtpal({ gesta: 3, termo: 1, prematuro: 0, abortos: 1, vivos: 1 })).toBe("G3 T1 P0 A1 V1");
    expect(formatarGtpal({ gesta: 1 })).toBe("G1");
  });
});
