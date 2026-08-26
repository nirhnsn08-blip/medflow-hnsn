// Testes do motor da Visão Executiva (puro).
//
// O que mais importa aqui: o motor só conta o que EXISTE. Sem internação, sem
// número (valorRefBacklog = null, farol vazio) — nada de "R$ a receber"
// inventado. E o valor de referência sai só das internações SEM conta, das
// quais o SIGTAP é o único preço disponível; falta de valor cadastrado é
// silêncio (semValorRef), não R$ 0,00.

import { describe, it, expect } from "vitest";
import { resumoFaturamento, resumoPorVia, resumoDeContas, SITUACOES, DIAS_ALERTA_BACKLOG } from "./resumo-faturamento.js";

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

// ══ POR VIA ═════════════════════════════════════════════════
// Convênios pela id que o atendimento referencia.
const SUS = { id: 1, tipo: "sus" };
const CONV = { id: 2, tipo: "convenio" };
const PART = { id: 3, tipo: "particular" };
const prod = (over = {}) => ({ id: 1, convenio_id: 1, procedimento_cod: "0303010037", desfecho: "internacao", ...over });

describe("resumoPorVia", () => {
  it("sem produção → vazio e nada inventado", () => {
    const r = resumoPorVia({ producao: [], convenios: [SUS], sigtapProcs: [sig()] });
    expect(r.vazio).toBe(true);
    expect(r.porVia).toEqual([]);
    expect(r.valorRefTotal).toBeNull();
  });

  it("internação pelo SUS → AIH, acima do procedimento", () => {
    const r = resumoPorVia({
      producao: [prod({ desfecho: "internacao" })],
      convenios: [SUS], sigtapProcs: [sig()],
    });
    expect(r.porVia.map((v) => v.via)).toEqual(["aih"]);
    expect(r.porVia[0].n).toBe(1);
    expect(r.porVia[0].valorRef).toBe(80000); // 50000 + 30000
    expect(r.valorRefTotal).toBe(80000);
  });

  it("ambulatório SUS herda BPA/APAC do via_sus do procedimento", () => {
    const r = resumoPorVia({
      producao: [
        prod({ id: 1, desfecho: "alta", procedimento_cod: "0301010010" }),
        prod({ id: 2, desfecho: "alta", procedimento_cod: "0304010203" }),
      ],
      convenios: [SUS],
      procedimentos: [
        { codigo: "0301010010", via_sus: "bpa" },
        { codigo: "0304010203", via_sus: "apac" },
      ],
      sigtapProcs: [],
    });
    expect(r.porVia.map((v) => v.via)).toEqual(["apac", "bpa"]); // ordem SUS: apac antes de bpa
  });

  it("convênio → TISS; particular → cobrança direta", () => {
    const r = resumoPorVia({
      producao: [prod({ id: 1, convenio_id: 2 }), prod({ id: 2, convenio_id: 3 })],
      convenios: [CONV, PART], sigtapProcs: [sig()],
    });
    const vias = r.porVia.map((v) => v.via);
    expect(vias).toContain("tiss");
    expect(vias).toContain("direta");
  });

  it("sem convênio no atendimento → balde 'sem-via' (a verdade, não um chute)", () => {
    const r = resumoPorVia({ producao: [prod({ convenio_id: null })], convenios: [SUS], sigtapProcs: [sig()] });
    expect(r.porVia.map((v) => v.via)).toEqual(["sem-via"]);
    expect(r.porVia[0].valorRef).toBe(80000); // o valor de referência ainda sai do código
  });

  it("valor de referência é silêncio quando não há preço", () => {
    const r = resumoPorVia({
      producao: [prod({ procedimento_cod: "9999999999" })], // fora da tabela
      convenios: [SUS], sigtapProcs: [sig()],
    });
    expect(r.porVia[0].valorRef).toBeNull();
    expect(r.porVia[0].semValor).toBe(1);
    expect(r.valorRefTotal).toBeNull();
  });

  it("ordena as vias na ordem do faturamento (AIH → APAC → BPA → TISS → direta)", () => {
    const r = resumoPorVia({
      producao: [
        prod({ id: 1, convenio_id: 3 }),                                   // direta
        prod({ id: 2, convenio_id: 2 }),                                   // tiss
        prod({ id: 3, convenio_id: 1, desfecho: "internacao" }),           // aih
      ],
      convenios: [SUS, CONV, PART], sigtapProcs: [sig()],
    });
    expect(r.porVia.map((v) => v.via)).toEqual(["aih", "tiss", "direta"]);
  });

  it("agrega várias internações na mesma via e soma o valor", () => {
    const r = resumoPorVia({
      producao: [prod({ id: 1 }), prod({ id: 2 }), prod({ id: 3 })],
      convenios: [SUS], sigtapProcs: [sig()],
    });
    expect(r.porVia).toHaveLength(1);
    expect(r.porVia[0].via).toBe("aih");
    expect(r.porVia[0].n).toBe(3);
    expect(r.porVia[0].valorRef).toBe(240000); // 3 × 80000
    expect(r.valorRefTotal).toBe(240000);
  });
});

// ═══════════════════════════════════════════════════════════
// AS CONTAS DA COMPETÊNCIA
//
// 🔴 O DEFEITO: todo número da Visão Executiva sai da worklist, que é
// `desfecho=eq.internacao`. O KPI "Faturadas — já transmitidas ao SUS"
// lia-se como afirmação sobre o HOSPITAL e era sobre internações: uma
// remessa de BPA inteira saía e o número não se mexia.
// ═══════════════════════════════════════════════════════════

describe("as contas da competência", () => {
  const c = (status, via) => ({ status, via });

  it("conta por situação, incluindo as que não são de internação", () => {
    const r = resumoDeContas([
      c("aberta", "bpa"), c("fechada", "bpa"), c("faturada", "bpa"),
      c("fechada", "aih"), c("glosada", "aih"),
    ]);
    expect(r.total).toBe(5);
    expect(r.porSituacao.aberta).toBe(1);
    expect(r.porSituacao.fechada).toBe(2);
    expect(r.porSituacao.faturada).toBe(1);
    expect(r.porSituacao.glosada).toBe(1);
  });

  it("🔴 enxerga o BPA, que é o que o funil de internações nunca mostrou", () => {
    const r = resumoDeContas([c("faturada", "bpa"), c("faturada", "bpa")]);
    expect(r.porVia.bpa.faturada).toBe(2);
    expect(r.vias).toEqual(["bpa"]);
  });

  it("separa as vias, porque a remessa sai por via", () => {
    const r = resumoDeContas([
      c("fechada", "bpa"), c("fechada", "bpa"), c("fechada", "aih"), c("aberta", "apac"),
    ]);
    expect(r.porVia.bpa.total).toBe(2);
    expect(r.porVia.aih.total).toBe(1);
    expect(r.porVia.apac.aberta).toBe(1);
    expect(r.vias).toEqual(["aih", "apac", "bpa"]);   // ordenadas
  });

  it("conta sem via não some — vai para um balde nomeado", () => {
    const r = resumoDeContas([c("aberta", ""), c("aberta", null)]);
    expect(r.porVia["sem via"].total).toBe(2);
  });

  it("⚠️ cancelada não entra na leitura por via, mas aparece no total", () => {
    // Sumir com ela faria os números não fecharem com o total, e alguém
    // procuraria o buraco. Contá-la como trabalho seria pior: conta
    // cancelada não espera nada de ninguém.
    const r = resumoDeContas([c("aberta", "bpa"), c("cancelada", "bpa")]);
    expect(r.total).toBe(2);
    expect(r.vivas).toBe(1);
    expect(r.porSituacao.cancelada).toBe(1);
    expect(r.porVia.bpa.total).toBe(1);
  });

  it("esperandoRemessa é o número acionável: conta fechada é conta pronta parada", () => {
    const r = resumoDeContas([c("fechada", "bpa"), c("fechada", "aih"), c("faturada", "bpa")]);
    expect(r.esperandoRemessa).toBe(2);
  });

  it("vazio quando não há conta viva — e lista nula não quebra a tela", () => {
    expect(resumoDeContas([]).vazio).toBe(true);
    expect(resumoDeContas(null).vazio).toBe(true);
    expect(resumoDeContas([c("cancelada", "bpa")]).vazio).toBe(true);
    expect(resumoDeContas([c("aberta", "bpa")]).vazio).toBe(false);
  });
});
