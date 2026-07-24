// Testes das funções de data/hora.
//
// O foco é o fuso — foi onde o projeto teve o bug mais caro (dados gravados
// no dia seguinte porque `todayStr` usava UTC). As datas são construídas com
// o construtor LOCAL `new Date(ano, mes, dia)` de propósito: é assim que o
// app as recebe, e é o que faz o teste valer independentemente do fuso da
// máquina de CI.

import { describe, it, expect } from "vitest";
import {
  todayStr, nowISO, diffMin, fmtDur, horaFmt, isoToLocal, localToIso,
  fmtDataBR, compDe, compLabel, horaMin,
} from "./datas.js";

describe("todayStr — data civil local, nunca UTC", () => {
  it("formata YYYY-MM-DD com zero à esquerda", () => {
    expect(todayStr(new Date(2026, 6, 24))).toBe("2026-07-24");   // mês 6 = julho
    expect(todayStr(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("NÃO escorrega para o dia seguinte à noite (o bug original)", () => {
    // 23:30 no horário local. Se usasse toISOString() em UTC-3, viraria o
    // dia seguinte às 02:30Z. O dia civil tem que continuar sendo o 24.
    expect(todayStr(new Date(2026, 6, 24, 23, 30))).toBe("2026-07-24");
  });

  it("usa o relógio quando chamado sem argumento", () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("nowISO", () => {
  it("devolve um instante ISO válido e recente", () => {
    const antes = Date.now();
    const iso = nowISO();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const t = new Date(iso).getTime();
    expect(t).toBeGreaterThanOrEqual(antes - 1000);
    expect(t).toBeLessThanOrEqual(Date.now() + 1000);
  });
});

describe("diffMin", () => {
  it("conta os minutos entre dois instantes (b − a)", () => {
    expect(diffMin("2026-07-24T10:00:00Z", "2026-07-24T12:30:00Z")).toBe(150);
  });
  it("aceita diferença negativa (b antes de a)", () => {
    expect(diffMin("2026-07-24T10:00:00Z", "2026-07-24T09:00:00Z")).toBe(-60);
  });
  it("null quando falta um dos lados ou a data é inválida", () => {
    expect(diffMin(null, "2026-07-24T10:00:00Z")).toBe(null);
    expect(diffMin("2026-07-24T10:00:00Z", "")).toBe(null);
    expect(diffMin("xxx", "2026-07-24T10:00:00Z")).toBe(null);
  });
});

describe("fmtDur", () => {
  it("mostra horas e minutos", () => {
    expect(fmtDur(150)).toBe("2h 30min");
    expect(fmtDur(45)).toBe("45min");
    expect(fmtDur(60)).toBe("1h 0min");
  });
  it("negativo vira zero, não '-1h'", () => {
    expect(fmtDur(-5)).toBe("0min");
  });
  it("arredonda", () => {
    expect(fmtDur(45.6)).toBe("46min");
  });
  it("'—' para nulo/inválido", () => {
    expect(fmtDur(null)).toBe("—");
    expect(fmtDur(undefined)).toBe("—");
    expect(fmtDur(NaN)).toBe("—");
  });
});

describe("horaFmt", () => {
  it("data/hora curta a partir de ISO", () => {
    // conteúdo depende do fuso da máquina; a FORMA não
    expect(horaFmt("2026-07-24T13:05:00Z")).toMatch(/^\d{2}\/\d{2},? \d{2}:\d{2}$/);
  });
  it("'—' para vazio", () => {
    expect(horaFmt(null)).toBe("—");
    expect(horaFmt("")).toBe("—");
  });
});

describe("isoToLocal ↔ localToIso", () => {
  it("localToIso volta para ISO e é inverso de isoToLocal", () => {
    // ida e volta: um valor de input local reconstruído tem que bater
    const original = "2026-07-24T10:05";
    const iso = localToIso(original);
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(isoToLocal(iso)).toBe(original);
  });
  it("isoToLocal devolve o formato do input datetime-local (sem segundos)", () => {
    expect(isoToLocal("2026-07-24T13:05:00Z")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
  it("vazio nos dois sentidos", () => {
    expect(isoToLocal(null)).toBe("");
    expect(localToIso("")).toBe(null);
  });
});

describe("fmtDataBR — dia sem escorregar de fuso", () => {
  it("YYYY-MM-DD → dd/mm/aaaa", () => {
    expect(fmtDataBR("2026-07-24")).toBe("24/07/2026");
    expect(fmtDataBR("2026-01-05")).toBe("05/01/2026");
  });
  it("'—' para vazio", () => {
    expect(fmtDataBR(null)).toBe("—");
  });
});

describe("compDe / compLabel — competência mensal", () => {
  it("compDe monta YYYY-MM a partir de mês 0-11", () => {
    expect(compDe(2026, 6)).toBe("2026-07");
    expect(compDe(2026, 0)).toBe("2026-01");
    expect(compDe(2026, 11)).toBe("2026-12");
  });
  it("compLabel encurta para Mês/AA", () => {
    expect(compLabel("2026-07")).toBe("Jul/26");
    expect(compLabel("2026-01")).toBe("Jan/26");
  });
  it("compLabel devolve '' para vazio e degrada em mês fora de faixa", () => {
    expect(compLabel("")).toBe("");
    expect(compLabel("2026-13")).toBe("13/26");   // não estoura, mostra o número
  });
});

describe("horaMin", () => {
  it("'HH:MM' → minutos desde a meia-noite", () => {
    expect(horaMin("08:30")).toBe(510);
    expect(horaMin("00:00")).toBe(0);
    expect(horaMin("7:5")).toBe(425);   // tolera sem zero à esquerda
  });
  it("null para vazio", () => {
    expect(horaMin(null)).toBe(null);
    expect(horaMin("")).toBe(null);
  });
});
