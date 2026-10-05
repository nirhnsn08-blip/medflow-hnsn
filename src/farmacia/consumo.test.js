// O consumo de paciente é LÍQUIDO: dispensação soma, estorno e devolução
// descontam. Antes os Indicadores só somavam — ver o cabeçalho de consumo.js.
import { describe, it, expect } from "vitest";
import { ehDePaciente, movimentosDeConsumo, somarPor, MOTIVO_DEVOLUCAO } from "./consumo.js";
import { dispensadoDoItem } from "./preparo.js";

const disp = (extra = {}) => ({ id: 1, tipo: "saida", motivo: "Dispensação", quantidade: 10, medicamento_id: 7, paciente_prontuario: "P1", ...extra });

describe("consumo de paciente", () => {
  it("dispensação soma com sinal positivo", () => {
    const r = movimentosDeConsumo([disp()]);
    expect(r).toHaveLength(1);
    expect(r[0].qtd).toBe(10);
  });

  it("🔴 estorno de dispensação DESCONTA — antes o custo do paciente ficava dobrado", () => {
    const r = movimentosDeConsumo([
      disp(),
      { id: 2, tipo: "entrada", motivo: "Estorno", quantidade: 10, medicamento_id: 7, paciente_prontuario: "P1", estorno_de: 1 },
    ]);
    expect(r.reduce((s, m) => s + m.qtd, 0)).toBe(0);
  });

  it("devolução parcial do setor desconta só o que voltou", () => {
    const r = movimentosDeConsumo([
      disp({ pep_item_id: 30 }),
      { id: 3, tipo: "entrada", motivo: MOTIVO_DEVOLUCAO, quantidade: 4, medicamento_id: 7, pep_item_id: 30, devolucao_de: 1 },
    ]);
    expect(somarPor(r, m => m.medicamento_id)).toEqual({ 7: 6 });
  });

  it("estorno de COMPRA não é consumo de paciente", () => {
    const r = movimentosDeConsumo([{ id: 4, tipo: "saida", motivo: "Estorno", quantidade: 50, medicamento_id: 7, estorno_de: 99 }]);
    expect(r).toEqual([]);
  });

  it("saída manual com motivo Dispensação, sem paciente, continua contando", () => {
    expect(movimentosDeConsumo([disp({ paciente_prontuario: null })])[0].qtd).toBe(10);
  });

  it("estorno do estorno volta a somar (a dispensação era certa)", () => {
    const r = movimentosDeConsumo([
      disp(),
      { id: 2, tipo: "entrada", quantidade: 10, medicamento_id: 7, paciente_prontuario: "P1", estorno_de: 1 },
      { id: 5, tipo: "saida", motivo: "Estorno", quantidade: 10, medicamento_id: 7, paciente_prontuario: "P1", estorno_de: 2 },
    ]);
    expect(r.reduce((s, m) => s + m.qtd, 0)).toBe(10);
  });

  it("perda e compra ficam de fora", () => {
    expect(movimentosDeConsumo([
      { tipo: "saida", motivo: "Perda / vencimento", quantidade: 3 },
      { tipo: "entrada", motivo: "Compra / nota fiscal", quantidade: 100 },
      null,
    ])).toEqual([]);
    expect(movimentosDeConsumo(null)).toEqual([]);
  });

  it("episódio de internação conta como vínculo de paciente", () => {
    expect(ehDePaciente({ episodio_id: 3 })).toBe(true);
    expect(ehDePaciente({ medicamento_id: 3 })).toBe(false);
  });
});

describe("dispensadoDoItem com a chave da internação", () => {
  const movs = [
    { prescricao_item_id: 5, quantidade: 2, tipo: "saida" },   // item 5 do PS
    { pep_item_id: 5, quantidade: 8, tipo: "saida" },           // item 5 da INTERNAÇÃO
    { pep_item_id: 5, quantidade: 3, tipo: "entrada", devolucao_de: 1 },
  ];
  it("🔴 o mesmo número de id em tabelas diferentes não se mistura", () => {
    expect(dispensadoDoItem(5, movs)).toBe(2);
    expect(dispensadoDoItem(5, movs, "pep_item_id")).toBe(5);
  });
});
