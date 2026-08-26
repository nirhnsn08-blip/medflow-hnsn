// ═══════════════════════════════════════════════════════════
// VALIDADE DO LOTE
//
// 🔴 O DEFEITO: dispensar lote vencido não era bloqueado, e era o CAMINHO
// DE MENOR RESISTÊNCIA — a ordenação FEFO punha o vencido no topo e o
// formulário já vinha com ele escolhido.
//
// ⚠️ E A ARMADILHA DO CONSERTO: bloquear a SAÍDA de vencido prenderia o
// vencido na prateleira para sempre. A pergunta não é "pode sair?", é
// "para onde está indo?".
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  podeSair, situacaoDoLote, lotesParaEscolha, vaiParaPaciente, hojeLocal, DIAS_VENCENDO,
} from "./validade.js";

// 26/08/2026 ao meio-dia. Hora fixa: teste que compara com `new Date()`
// fica verde hoje e vermelho amanhã, e já aconteceu neste projeto.
const AGORA = new Date(2026, 7, 26, 12, 0, 0);
const lote = (validade, extra = {}) => ({ id: 1, validade, quantidade: 10, ...extra });

describe("🔴 vencido não vai para o paciente", () => {
  it("recusa a dispensação e ensina como tirar da prateleira", () => {
    const r = podeSair({ lote: lote("2026-08-25"), motivo: "Dispensação", agora: AGORA });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/VENCIDO/);
    expect(r.erros.join(" ")).toMatch(/Perda \/ vencimento/);
  });

  it("⚠️ MAS o vencido SAI por descarte, devolução e ajuste", () => {
    // Sem isto, o vencido fica preso na prateleira para sempre, some do
    // relatório de perdas e o saldo passa a mentir. Seria trocar um risco
    // por dois.
    for (const motivo of ["Perda / vencimento", "Devolução ao fornecedor", "Ajuste de inventário", "Transferência"]) {
      const r = podeSair({ lote: lote("2026-08-25"), motivo, agora: AGORA });
      expect(r.ok, `motivo: ${motivo}`).toBe(true);
    }
  });

  it("e a baixa de vencido pede o comprovante", () => {
    const r = podeSair({ lote: lote("2026-01-01"), motivo: "Perda / vencimento", agora: AGORA });
    expect(r.avisos.join(" ")).toMatch(/comprovante do descarte/);
  });
});

describe("as bordas da data", () => {
  it("vence HOJE ainda vale — o medicamento é bom até o fim do dia impresso", () => {
    expect(situacaoDoLote("2026-08-26", AGORA).vencido).toBe(false);
    expect(podeSair({ lote: lote("2026-08-26"), motivo: "Dispensação", agora: AGORA }).ok).toBe(true);
  });

  it("venceu ontem não vale", () => {
    expect(situacaoDoLote("2026-08-25", AGORA).vencido).toBe(true);
  });

  it("a data civil não passa pelo fuso", () => {
    // 23h30 do dia 26 em Brasília já é dia 27 em UTC. Com `toISOString()`
    // um lote que vence hoje apareceria como vencido.
    const tardeDaNoite = new Date(2026, 7, 26, 23, 30);
    expect(hojeLocal(tardeDaNoite)).toBe("2026-08-26");
    expect(situacaoDoLote("2026-08-26", tardeDaNoite).vencido).toBe(false);
  });

  it("“vencendo” é a janela de 30 dias, e ainda dispensa", () => {
    expect(DIAS_VENCENDO).toBe(30);
    expect(situacaoDoLote("2026-09-25", AGORA).estado).toBe("vencendo");   // 30 dias
    expect(situacaoDoLote("2026-09-26", AGORA).estado).toBe("ok");         // 31 dias
    const r = podeSair({ lote: lote("2026-09-01"), motivo: "Dispensação", agora: AGORA });
    expect(r.ok).toBe(true);
    expect(r.avisos.join(" ")).toMatch(/use este antes dos outros/);
  });

  it("⚠️ validade AUSENTE não é validade vencida", () => {
    // Lacuna de cadastro, não veneno. Recusar travaria a farmácia inteira
    // — a tela ainda ensina a dar entrada sem lote.
    const r = podeSair({ lote: lote(null), motivo: "Dispensação", agora: AGORA });
    expect(r.ok).toBe(true);
    expect(r.avisos.join(" ")).toMatch(/sem validade cadastrada/);
    expect(situacaoDoLote("", AGORA).estado).toBe("sem_data");
    expect(situacaoDoLote("data-torta", AGORA).estado).toBe("sem_data");
  });
});

describe("🔴 qual lote vem escolhido — onde o defeito morava", () => {
  const lotes = [
    { id: 1, validade: "2026-01-10", quantidade: 5 },   // vencido
    { id: 2, validade: "2026-09-10", quantidade: 5 },   // válido, vence antes
    { id: 3, validade: "2027-05-10", quantidade: 5 },   // válido, vence depois
  ];

  it("para o PACIENTE, o sugerido nunca é o vencido", () => {
    const r = lotesParaEscolha(lotes, { motivo: "Dispensação", agora: AGORA });
    expect(r.sugerido.id).toBe(2);          // FEFO entre os VÁLIDOS
    expect(r.temVencido).toBe(true);
  });

  it("o vencido continua na lista — é por ela que se dá baixa de descarte", () => {
    const r = lotesParaEscolha(lotes, { motivo: "Dispensação", agora: AGORA });
    expect(r.lotes.map(l => l.id)).toEqual([2, 3, 1]);   // válidos em FEFO, vencido no fim
    expect(r.nVencidos).toBe(1);
  });

  it("para DESCARTE o sugerido é o vencido — senão dá baixa no lote errado", () => {
    const r = lotesParaEscolha(lotes, { motivo: "Perda / vencimento", agora: AGORA });
    expect(r.sugerido.id).toBe(1);
  });

  it("FEFO segue valendo entre os válidos", () => {
    const so = [{ id: 7, validade: "2027-05-10", quantidade: 3 }, { id: 8, validade: "2026-09-10", quantidade: 3 }];
    expect(lotesParaEscolha(so, { motivo: "Dispensação", agora: AGORA }).sugerido.id).toBe(8);
  });

  it("lote sem saldo não entra na escolha", () => {
    const r = lotesParaEscolha([{ id: 9, validade: "2027-01-01", quantidade: 0 }], { motivo: "Dispensação", agora: AGORA });
    expect(r.lotes).toEqual([]);
    expect(r.sugerido).toBeNull();
  });

  it("aguenta lista vazia ou nula sem quebrar a tela", () => {
    expect(lotesParaEscolha([], { motivo: "Dispensação" }).sugerido).toBeNull();
    expect(lotesParaEscolha(null, {}).lotes).toEqual([]);
    expect(podeSair().ok).toBe(true);
  });
});

describe("quem vai para o paciente", () => {
  it("só a dispensação", () => {
    expect(vaiParaPaciente("Dispensação")).toBe(true);
    expect(vaiParaPaciente("dispensação")).toBe(true);
    expect(vaiParaPaciente("Perda / vencimento")).toBe(false);
    expect(vaiParaPaciente("")).toBe(false);
    expect(vaiParaPaciente(null)).toBe(false);
  });
});
