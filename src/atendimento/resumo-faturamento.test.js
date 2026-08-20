// Testes do motor da Visão Executiva (puro).
//
// O que mais importa aqui: o motor só conta o que EXISTE. Sem internação, sem
// número (valorRefBacklog = null, farol vazio) — nada de "R$ a receber"
// inventado. E o valor de referência sai só das internações SEM conta, das
// quais o SIGTAP é o único preço disponível; falta de valor cadastrado é
// silêncio (semValorRef), não R$ 0,00.

import { describe, it, expect } from "vitest";
import { resumoFaturamento, SITUACOES, DIAS_ALERTA_BACKLOG } from "./resumo-faturamento.js";

// ── fábricas ────────────────────────────────────────────────
const wl = (over = {}) => ({
  id: 1,
  situacao: "sem-conta",
  procedimento_cod: "0303010037",
  chegada_em: "2026-08-15T10:00:00Z",
  desfecho_em: "2026-08-15T12:00:00Z",
  ...over,
});
const sig = (over = {}) => ({ codigo: "0303010037", valor_sh: 50000, valor_sp: 30000, ...over });

const HOJE = new Date("2026-08-19T12:00:00Z"); // 4 dias depois do desfecho padrão

// ── vazio ───────────────────────────────────────────────────
describe("resumoFaturamento — sem dado", () => {
  it("worklist vazia devolve zeros, vazio=true e nada inventado", () => {
    const r = resumoFaturamento({ worklist: [], sigtapProcs: [sig()], hoje: HOJE });
    expect(r.total).toBe(0);
    expect(r.vazio).toBe(true);
    expect(r.backlog).toBe(0);
    expect(r.valorRefBacklog).toBeNull(); // sem backlog, nada a estimar — não R$ 0,00
    expect(r.farol).toEqual([]);
  });

  it("aceita entrada faltando sem quebrar", () => {
    const r = resumoFaturamento();
    expect(r.total).toBe(0);
    expect(r.vazio).toBe(true);
  });
});

// ── contagem e funil ────────────────────────────────────────
describe("resumoFaturamento — funil por situação", () => {
  it("conta cada situação e monta o funil na ordem de trabalho", () => {
    const r = resumoFaturamento({
      worklist: [
        wl({ id: 1, situacao: "sem-conta" }),
        wl({ id: 2, situacao: "aberta" }),
        wl({ id: 3, situacao: "aberta" }),
        wl({ id: 4, situacao: "fechada" }),
        wl({ id: 5, situacao: "faturada" }),
      ],
      sigtapProcs: [sig()],
      hoje: HOJE,
    });
    expect(r.total).toBe(5);
    expect(r.porSituacao).toEqual({ "sem-conta": 1, aberta: 2, fechada: 1, faturada: 1, glosada: 0 });
    expect(r.backlog).toBe(1);
    expect(r.emAberto).toBe(2);
    expect(r.concluidas).toBe(2); // fechada + faturada
    expect(r.funil.map((f) => [f.chave, f.n])).toEqual([
      ["sem-conta", 1], ["aberta", 2], ["fechada", 1], ["faturada", 1],
    ]);
  });

  it("situação desconhecida cai em sem-conta (a verdade: falta montar)", () => {
    const r = resumoFaturamento({ worklist: [wl({ situacao: "???" })], sigtapProcs: [sig()], hoje: HOJE });
    expect(r.backlog).toBe(1);
    expect(r.porSituacao["sem-conta"]).toBe(1);
  });

  it("glosada entra no funil e conta à parte", () => {
    const r = resumoFaturamento({
      worklist: [wl({ id: 1, situacao: "faturada" }), wl({ id: 2, situacao: "glosada" })],
      sigtapProcs: [sig()],
      hoje: HOJE,
    });
    expect(r.glosadas).toBe(1);
    expect(r.funil.find((f) => f.chave === "glosada")?.n).toBe(1);
  });
});

// ── valor de referência (SIGTAP) do backlog ─────────────────
describe("resumoFaturamento — valor de referência do backlog", () => {
  it("soma SH+SP só das internações SEM conta", () => {
    const r = resumoFaturamento({
      worklist: [
        wl({ id: 1, situacao: "sem-conta" }),
        wl({ id: 2, situacao: "sem-conta" }),
        wl({ id: 3, situacao: "aberta" }), // já tem conta → não entra na referência
      ],
      sigtapProcs: [sig()], // 50000 + 30000 = 80000 centavos
      hoje: HOJE,
    });
    expect(r.valorRefBacklog).toBe(160000); // 2 × 80000; a "aberta" não conta
    expect(r.comValorRef).toBe(2);
    expect(r.semValorRef).toBe(0);
  });

  it("código fora da tabela ou sem valor cadastrado é silêncio, não R$ 0,00", () => {
    const r = resumoFaturamento({
      worklist: [
        wl({ id: 1, procedimento_cod: "0303010037" }),      // na tabela, com valor
        wl({ id: 2, procedimento_cod: "9999999999" }),      // fora da tabela
        wl({ id: 3, procedimento_cod: "0404040404" }),      // na tabela, sem valor
      ],
      sigtapProcs: [sig(), sig({ codigo: "0404040404", valor_sh: null, valor_sp: null })],
      hoje: HOJE,
    });
    expect(r.valorRefBacklog).toBe(80000); // só o primeiro
    expect(r.comValorRef).toBe(1);
    expect(r.semValorRef).toBe(2);
  });

  it("backlog inteiro sem preço → valorRefBacklog null", () => {
    const r = resumoFaturamento({
      worklist: [wl({ procedimento_cod: "9999999999" })],
      sigtapProcs: [sig()],
      hoje: HOJE,
    });
    expect(r.valorRefBacklog).toBeNull();
    expect(r.semValorRef).toBe(1);
  });
});

// ── farol (só sinal real) ───────────────────────────────────
describe("resumoFaturamento — farol", () => {
  it("acende backlog envelhecido (âmbar) com a idade da mais antiga", () => {
    const r = resumoFaturamento({
      worklist: [
        wl({ id: 1, desfecho_em: "2026-08-15T12:00:00Z" }), // 4 dias
        wl({ id: 2, desfecho_em: "2026-08-10T12:00:00Z" }), // 9 dias
      ],
      sigtapProcs: [sig()],
      hoje: HOJE,
    });
    expect(r.backlogVelho).toBe(2); // ambos ≥ DIAS_ALERTA_BACKLOG
    expect(r.maisAntigoBacklog).toBe(9);
    const f = r.farol.find((x) => x.chave === "backlog-velho");
    expect(f).toBeTruthy();
    expect(f.sev).toBe("amb");
    expect(f.tag).toContain("9d");
  });

  it("backlog envelhecido grande vira vermelho (≥5)", () => {
    const velhas = Array.from({ length: 5 }, (_, i) =>
      wl({ id: i + 1, desfecho_em: "2026-08-10T12:00:00Z" }));
    const r = resumoFaturamento({ worklist: velhas, sigtapProcs: [sig()], hoje: HOJE });
    expect(r.backlogVelho).toBe(5);
    expect(r.farol.find((x) => x.chave === "backlog-velho").sev).toBe("red");
  });

  it("internação recente não envelhece o backlog", () => {
    const r = resumoFaturamento({
      worklist: [wl({ desfecho_em: "2026-08-19T00:00:00Z" })], // < 3 dias
      sigtapProcs: [sig()],
      hoje: HOJE,
    });
    expect(r.backlogVelho).toBe(0);
    expect(r.farol.find((x) => x.chave === "backlog-velho")).toBeUndefined();
  });

  it("conta aberta acende o alerta de fechar", () => {
    const r = resumoFaturamento({ worklist: [wl({ situacao: "aberta" })], sigtapProcs: [], hoje: HOJE });
    expect(r.farol.find((x) => x.chave === "aberta-a-fechar")?.sev).toBe("amb");
  });

  it("tudo com conta e nada aberto → 'em dia'", () => {
    const r = resumoFaturamento({
      worklist: [wl({ id: 1, situacao: "fechada" }), wl({ id: 2, situacao: "faturada" })],
      sigtapProcs: [sig()],
      hoje: HOJE,
    });
    expect(r.backlog).toBe(0);
    expect(r.farol.find((x) => x.chave === "em-dia")?.sev).toBe("ok");
  });
});

// ── competência ─────────────────────────────────────────────
describe("resumoFaturamento — competência atual", () => {
  it("devolve a competência corrente no formato AAAA-MM", () => {
    const r = resumoFaturamento({ worklist: [], sigtapProcs: [], hoje: new Date(2026, 7, 19) });
    expect(r.competenciaAtual).toBe("2026-08");
    expect(r.competenciaAtual).toMatch(/^\d{4}-\d{2}$/);
  });
});

// ── invariantes ─────────────────────────────────────────────
describe("resumoFaturamento — invariantes", () => {
  it("SITUACOES e o limiar de alerta ficam expostos para a tela", () => {
    expect(SITUACOES).toContain("sem-conta");
    expect(DIAS_ALERTA_BACKLOG).toBeGreaterThan(0);
  });
});
