// ═══════════════════════════════════════════════════════════
// A FARMÁCIA USA AS REGRAS DE ESTOQUE DO ALMOXARIFADO
//
// 🔴 O DEFEITO: `sup_inventarios` e `sup_movimentos.estorno_de` existem
// desde as migrações de suprimentos. `farm_inventarios` nunca existiu e
// `farm_movimentos` não tinha `estorno_de` — a farmácia não sabia desfazer
// uma dispensação errada nem contar a própria prateleira. E é ela que
// dispensa controlado.
//
// ⚠️ A CORREÇÃO NÃO PODE SER UMA CÓPIA. Contagem cega, FEFO, curva ABC e
// conciliação são a MESMA regra nos dois módulos; duas cópias divergiriam
// na primeira mudança, e a divergência apareceria como dois números
// diferentes para o mesmo estoque. O que muda é uma coluna: `item_id` no
// almoxarifado, `medicamento_id` na farmácia.
//
// Este arquivo prova que é a mesma regra, com a chave trocada.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { movimentoDeEstorno, podeEstornar, planejarAjuste, idsJaEstornados } from "../suprimentos/inventario.js";
import { conciliar, supSaldoTotal } from "../suprimentos/kardex.js";
import { ORIGENS, conciliarAgora } from "../suprimentos/dados.js";

const CHAVE = "medicamento_id";

describe("o estorno da farmácia", () => {
  const dispensacao = {
    id: 77, medicamento_id: 5, lote: "L1", tipo: "saida", quantidade: 2,
    paciente_iniciais: "H.N.", paciente_prontuario: "9069",
    atendimento_id: 251, prescricao_item_id: 12, setor: "PS",
  };

  it("desfaz com o movimento OPOSTO, na coluna da farmácia", () => {
    const e = movimentoDeEstorno(dispensacao, { chave: CHAVE });
    expect(e.medicamento_id).toBe(5);
    expect(e.item_id).toBeUndefined();       // não vaza a coluna do almoxarifado
    expect(e.tipo).toBe("entrada");
    expect(e.quantidade).toBe(2);
    expect(e.lote).toBe("L1");
    expect(e.estorno_de).toBe(77);
  });

  it("🔴 e leva o PACIENTE junto — senão o rastro morre onde é obrigatório", () => {
    // Numa farmácia a devolução sem paciente é uma entrada anônima, e o
    // kardex existe justamente para responder "para onde foi este remédio".
    const e = movimentoDeEstorno(dispensacao, {
      chave: CHAVE, copiar: ["paciente_iniciais", "paciente_prontuario", "setor", "atendimento_id", "prescricao_item_id"],
    });
    expect(e.paciente_iniciais).toBe("H.N.");
    expect(e.paciente_prontuario).toBe("9069");
    expect(e.prescricao_item_id).toBe(12);
    expect(e.setor).toBe("PS");
  });

  it("não carrega custo — estorno não é compra nem venda", () => {
    // Levar custo trocaria um erro de quantidade por um erro de custo médio.
    const e = movimentoDeEstorno({ ...dispensacao, custo_unit: 3.5 }, { chave: CHAVE, copiar: ["custo_unit"] });
    expect(e.custo_unit).toBe(3.5);          // só quando pedido explicitamente
    expect(movimentoDeEstorno(dispensacao, { chave: CHAVE }).custo_unit).toBeUndefined();
  });

  it("e o almoxarifado continua com item_id (a chave é o padrão antigo)", () => {
    const e = movimentoDeEstorno({ id: 1, item_id: 9, lote: "", tipo: "entrada", quantidade: 4 });
    expect(e.item_id).toBe(9);
    expect(e.tipo).toBe("saida");
  });

  it("um movimento só se estorna UMA vez", () => {
    const ja = idsJaEstornados([{ id: 90, estorno_de: 77 }]);
    expect(podeEstornar(dispensacao, ja).ok).toBe(false);
    expect(podeEstornar({ ...dispensacao, id: 78 }, ja).ok).toBe(true);
  });
});

describe("a contagem da farmácia", () => {
  const lotes = [
    { id: 1, medicamento_id: 5, lote: "A", validade: "2026-12-01", quantidade: 10 },
    { id: 2, medicamento_id: 5, lote: "B", validade: "2026-06-01", quantidade: 4 },
    { id: 3, medicamento_id: 9, lote: "C", validade: null, quantidade: 7 },
  ];

  it("o saldo soma os lotes DAQUELE medicamento", () => {
    expect(supSaldoTotal(5, lotes, CHAVE)).toBe(14);
    expect(supSaldoTotal(9, lotes, CHAVE)).toBe(7);
    // sem a chave certa, somaria zero e a contagem acusaria falta total
    expect(supSaldoTotal(5, lotes)).toBe(0);
  });

  it("falta sai por FEFO — vence primeiro, sai primeiro", () => {
    const p = planejarAjuste(-6, lotes.filter(l => l.medicamento_id === 5));
    expect(p.ok).toBe(true);
    expect(p.passos[0].lote).toBe("B");       // vence 06/2026
    expect(p.passos[0].quantidade).toBe(4);
    expect(p.passos[1].lote).toBe("A");
    expect(p.passos[1].quantidade).toBe(2);
  });

  it("⚠️ sobra com vários lotes RECUSA — lote errado estraga a validade", () => {
    const p = planejarAjuste(+3, lotes.filter(l => l.medicamento_id === 5));
    expect(p.ok).toBe(false);
    expect(p.motivo).toMatch(/2 lotes com saldo/);
  });
});

describe("a conciliação da farmácia", () => {
  it("compara kardex com saldo pela chave do módulo", () => {
    const movs = [
      { id: 1, lote_id: 1, tipo: "entrada", quantidade: 10 },
      { id: 2, lote_id: 1, tipo: "saida", quantidade: 3 },
    ];
    const lotes = [{ id: 1, medicamento_id: 5, lote: "A", validade: null, quantidade: 7 }];
    const r = conciliar(movs, lotes, { chave: CHAVE });
    expect(r.conciliavel).toBe(true);
    expect(r.divergentes).toBe(0);
    expect(r.linhas[0].medicamento_id).toBe(5);   // a tela precisa disso para nomear o remédio
  });

  it("🔴 e acusa quando o saldo não bate com o histórico", () => {
    const movs = [{ id: 1, lote_id: 1, tipo: "entrada", quantidade: 10 }];
    const lotes = [{ id: 1, medicamento_id: 5, lote: "A", quantidade: 8 }];
    const r = conciliar(movs, lotes, { chave: CHAVE });
    expect(r.divergentes).toBe(1);
    expect(r.linhas[0].diferenca).toBe(-2);
  });

  it("as duas origens apontam para tabelas diferentes", () => {
    expect(ORIGENS.farmacia).toEqual({ movimentos: "farm_movimentos", lotes: "farm_lotes", chave: "medicamento_id" });
    expect(ORIGENS.suprimentos.chave).toBe("item_id");
  });

  it("⚠️ e `conciliarAgora` lê a tabela da farmácia, não a do almoxarifado", async () => {
    const pedidos = [];
    const sb = p => { pedidos.push(p); return []; };
    await conciliarAgora(sb, { origem: "farmacia" });
    expect(pedidos.some(p => p.startsWith("farm_movimentos?"))).toBe(true);
    expect(pedidos.some(p => p.startsWith("farm_lotes?"))).toBe(true);
    expect(pedidos.some(p => p.includes("sup_"))).toBe(false);
    expect(pedidos.every(p => p.includes("medicamento_id"))).toBe(true);
  });

  it("sem origem, continua sendo o almoxarifado (nada muda para quem já usava)", async () => {
    const pedidos = [];
    await conciliarAgora(p => { pedidos.push(p); return []; });
    expect(pedidos.every(p => p.startsWith("sup_"))).toBe(true);
  });
});
