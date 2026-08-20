// ═══════════════════════════════════════════════════════════
// Ajuste de inventário e estorno.
//
// O que estes testes protegem é a diferença entre "ajustou" e "achou que
// ajustou". O código antigo lançava o ajuste sem lote, não conferia o
// retorno, e gravava `ajustado = true` de qualquer jeito — a KPI de
// acuracidade passava a mentir para sempre, porque a contagem seguinte
// acharia a mesma divergência e "ajustaria" de novo.
//
// Validados por mutação:
//   • sobra com vários lotes cai num lote qualquer .... derruba a recusa
//   • FEFO trocado por ordem de chegada ............... derruba a ordem
//   • falta maior que o saldo é aceita ................ derruba a recusa
//   • estorno permitido duas vezes .................... derruba a trava
//   • estorno leva custo_unit ......................... derruba o custo médio
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  MOTIVO_ESTORNO, documentoDaContagem, ordemFefo, planejarAjuste,
  descreverPlano, podeEstornar, movimentoDeEstorno, idsJaEstornados,
} from "./inventario.js";

const lote = (l, q, v = null) => ({ lote: l, quantidade: q, validade: v });

describe("documentoDaContagem", () => {
  it("amarra o movimento à contagem que o gerou", () => {
    // Antes era a constante "INVENTARIO" para toda contagem do sistema —
    // não dava para saber qual ajuste veio de qual conferência.
    expect(documentoDaContagem(42)).toBe("INV-42");
    expect(documentoDaContagem(1)).not.toBe(documentoDaContagem(2));
  });
});

describe("ordemFefo", () => {
  it("vence primeiro, sai primeiro", () => {
    const r = ordemFefo([lote("C", 5, "2028-01-01"), lote("A", 5, "2026-01-01"), lote("B", 5, "2027-01-01")]);
    expect(r.map(x => x.lote)).toEqual(["A", "B", "C"]);
  });
  it("lote sem validade vai para o fim — na dúvida, mexe no que se conhece", () => {
    const r = ordemFefo([lote("SEM", 5, null), lote("COM", 5, "2027-01-01")]);
    expect(r.map(x => x.lote)).toEqual(["COM", "SEM"]);
  });
  it("não muda a lista original", () => {
    const orig = [lote("C", 5, "2028-01-01"), lote("A", 5, "2026-01-01")];
    ordemFefo(orig);
    expect(orig.map(x => x.lote)).toEqual(["C", "A"]);
  });
});

describe("planejarAjuste — sem diferença", () => {
  it("diferença zero não gera movimento nenhum", () => {
    const r = planejarAjuste(0, [lote("A", 10)]);
    expect(r.ok).toBe(true);
    expect(r.passos).toEqual([]);
  });
  it("diferença não numérica não vira NaN nem movimento", () => {
    expect(planejarAjuste("abc", [lote("A", 10)]).passos).toEqual([]);
    expect(planejarAjuste(undefined, []).passos).toEqual([]);
  });
});

describe("planejarAjuste — FALTA (contou menos)", () => {
  it("tira do lote que vence primeiro", () => {
    const r = planejarAjuste(-3, [lote("NOVO", 10, "2028-01-01"), lote("VELHO", 10, "2026-01-01")]);
    expect(r.ok).toBe(true);
    expect(r.passos).toEqual([{ lote: "VELHO", validade: "2026-01-01", tipo: "saida", quantidade: 3 }]);
  });

  it("atravessa lotes quando um não cobre, na ordem FEFO", () => {
    const r = planejarAjuste(-12, [lote("B", 10, "2027-01-01"), lote("A", 5, "2026-01-01")]);
    expect(r.passos).toEqual([
      { lote: "A", validade: "2026-01-01", tipo: "saida", quantidade: 5 },
      { lote: "B", validade: "2027-01-01", tipo: "saida", quantidade: 7 },
    ]);
  });

  it("🔴 falta maior que o saldo total é RECUSADA, com o número na mensagem", () => {
    // O trigger recusaria de qualquer jeito. Explicar antes é melhor que
    // falhar depois com "Estoque insuficiente no lote" e deixar metade dos
    // movimentos lançados.
    const r = planejarAjuste(-50, [lote("A", 10)]);
    expect(r.ok).toBe(false);
    expect(r.passos).toEqual([]);
    expect(r.motivo).toMatch(/50/);
    expect(r.motivo).toMatch(/10/);
  });

  it("ignora lote zerado ao montar o plano", () => {
    const r = planejarAjuste(-2, [lote("VAZIO", 0, "2025-01-01"), lote("CHEIO", 5, "2027-01-01")]);
    expect(r.passos).toEqual([{ lote: "CHEIO", validade: "2027-01-01", tipo: "saida", quantidade: 2 }]);
  });
});

describe("planejarAjuste — SOBRA (contou mais)", () => {
  it("com um lote só, entra nele", () => {
    const r = planejarAjuste(4, [lote("A", 10, "2027-01-01")]);
    expect(r.passos).toEqual([{ lote: "A", validade: "2027-01-01", tipo: "entrada", quantidade: 4 }]);
  });

  it("sem lote nenhum, entra no balde genérico", () => {
    const r = planejarAjuste(4, []);
    expect(r.passos).toEqual([{ lote: "", validade: null, tipo: "entrada", quantidade: 4 }]);
  });

  it("🔴 com vários lotes RECUSA e pede escolha — não chuta", () => {
    // Jogar unidade no lote errado corrompe a validade e o FEFO, e o erro
    // só aparece meses depois como material vencido que o sistema jurava
    // estar bom.
    const r = planejarAjuste(4, [lote("A", 10, "2027-01-01"), lote("B", 5, "2028-01-01")]);
    expect(r.ok).toBe(false);
    expect(r.passos).toEqual([]);
    expect(r.motivo).toMatch(/2 lotes/);
  });

  it("com o lote escolhido pela pessoa, aceita", () => {
    const lotes = [lote("A", 10, "2027-01-01"), lote("B", 5, "2028-01-01")];
    const r = planejarAjuste(4, lotes, { loteEscolhido: "B" });
    expect(r.ok).toBe(true);
    expect(r.passos).toEqual([{ lote: "B", validade: "2028-01-01", tipo: "entrada", quantidade: 4 }]);
  });

  it("escolha não obriga o lote a ter saldo — pode repor lote zerado", () => {
    const lotes = [lote("A", 10, "2027-01-01"), lote("ZERADO", 0, "2026-01-01")];
    const r = planejarAjuste(4, lotes, { loteEscolhido: "ZERADO" });
    expect(r.passos[0].lote).toBe("ZERADO");
    expect(r.passos[0].validade).toBe("2026-01-01");
  });
});

describe("descreverPlano", () => {
  it("descreve em português o que vai acontecer, antes de confirmar", () => {
    const { passos } = planejarAjuste(-12, [lote("B", 10, "2027-01-01"), lote("A", 5, "2026-01-01")]);
    expect(descreverPlano(passos)).toBe("sai 5 no lote A; sai 7 no lote B");
  });
  it("plano vazio não inventa frase", () => {
    expect(descreverPlano([])).toBe("Nada a ajustar.");
  });
  it("lote genérico é dito como 'sem lote', não como vazio", () => {
    expect(descreverPlano([{ tipo: "entrada", quantidade: 3, lote: "" }])).toBe("entra 3 sem lote");
  });
});

describe("podeEstornar", () => {
  const mv = { id: 7, item_id: 1, lote: "A", tipo: "saida", quantidade: 5 };

  it("movimento normal pode", () => {
    expect(podeEstornar(mv, []).ok).toBe(true);
  });

  it("🔴 já estornado NÃO pode — estornar duas vezes inventa estoque", () => {
    const r = podeEstornar(mv, [7]);
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/já foi estornado/);
  });

  it("aceita Set além de lista", () => {
    expect(podeEstornar(mv, new Set([7])).ok).toBe(false);
  });

  it("estornar um estorno É permitido — desfazer a desfeita é legítimo", () => {
    // O que se proíbe é estornar o MESMO movimento duas vezes. Uma cadeia
    // A → estorno de A → estorno do estorno fica autodocumentada no kardex.
    const estorno = { id: 8, item_id: 1, lote: "A", tipo: "entrada", quantidade: 5, estorno_de: 7 };
    expect(podeEstornar(estorno, [7]).ok).toBe(true);
  });

  it("tipo inválido não pode ser estornado — conserte a linha antes", () => {
    expect(podeEstornar({ ...mv, tipo: "saída" }, []).ok).toBe(false);
  });

  it("quantidade zero ou negativa não pode", () => {
    expect(podeEstornar({ ...mv, quantidade: 0 }, []).ok).toBe(false);
    expect(podeEstornar({ ...mv, quantidade: -1 }, []).ok).toBe(false);
  });

  it("movimento sem id não pode", () => {
    expect(podeEstornar({ tipo: "saida", quantidade: 1 }, []).ok).toBe(false);
  });
});

describe("movimentoDeEstorno", () => {
  it("inverte o tipo e mantém item, lote e quantidade", () => {
    const r = movimentoDeEstorno({ id: 7, item_id: 3, lote: "A", tipo: "saida", quantidade: 5 });
    expect(r).toMatchObject({ item_id: 3, lote: "A", tipo: "entrada", quantidade: 5, estorno_de: 7 });
  });

  it("estorno de entrada vira saída no MESMO lote", () => {
    const r = movimentoDeEstorno({ id: 9, item_id: 3, lote: "L9", tipo: "entrada", quantidade: 2 });
    expect(r.tipo).toBe("saida");
    expect(r.lote).toBe("L9");
  });

  it("🔴 não leva custo_unit — estorno não pode mexer no custo médio", () => {
    // Deixar custo aqui trocaria um erro de quantidade por um erro de
    // valor, que é mais difícil de achar depois.
    const r = movimentoDeEstorno({ id: 7, item_id: 3, lote: "A", tipo: "entrada", quantidade: 5, custo_unit: 12.5 });
    expect(r.custo_unit).toBeUndefined();
    expect("custo_unit" in r).toBe(false);
  });

  it("lote nulo vira balde genérico, não undefined", () => {
    expect(movimentoDeEstorno({ id: 1, item_id: 1, tipo: "saida", quantidade: 1 }).lote).toBe("");
  });

  it("usa o motivo padrão, e aceita um específico", () => {
    expect(movimentoDeEstorno({ id: 1, item_id: 1, tipo: "saida", quantidade: 1 }).motivo).toBe(MOTIVO_ESTORNO);
    expect(movimentoDeEstorno({ id: 1, item_id: 1, tipo: "saida", quantidade: 1 }, { motivo: "Lançado em dobro" }).motivo).toBe("Lançado em dobro");
  });
});

describe("idsJaEstornados", () => {
  it("lê do próprio kardex quais já têm estorno", () => {
    const movs = [{ id: 1 }, { id: 2, estorno_de: 1 }, { id: 3 }];
    expect(idsJaEstornados(movs)).toEqual(new Set([1]));
  });
  it("kardex sem estorno devolve conjunto vazio", () => {
    expect(idsJaEstornados([{ id: 1 }, { id: 2 }]).size).toBe(0);
  });
  it("lista ausente não quebra", () => {
    expect(idsJaEstornados().size).toBe(0);
  });
});
