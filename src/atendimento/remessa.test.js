// ═══════════════════════════════════════════════════════════
// REMESSA
//
// 🔴 O DEFEITO QUE ORIGINOU O ARQUIVO: `faturada` era inalcançável. A
// função que escreve o estado existia e nenhuma tela a chamava, então o
// KPI "já transmitidas ao SUS" era estruturalmente zero — um indicador
// que não pode mudar ensina quem olha que o número não quer dizer nada.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  validarTransmissao, contasTransmissiveis, contasQueFicamDeFora,
  resumoDaTransmissao, hojeLocal, STATUS_TRANSMISSIVEL, PROTOCOLO_MAX,
} from "./remessa.js";

// 26/08/2026, meio-dia — hora fixa para o teste não depender do relógio da
// máquina. Um teste que compara com `new Date()` fica verde hoje e vermelho
// amanhã, e já aconteceu neste projeto.
const AGORA = new Date(2026, 7, 26, 12, 0, 0);
const HOJE = "2026-08-26";

const conta = (id, status, extra = {}) =>
  ({ id, status, competencia: "202608", via: "AIH", ...extra });

const OK = { competencia: "202608", quando: HOJE, protocolo: "PROTO-123", agora: AGORA };

describe("quem entra na remessa", () => {
  it("só conta FECHADA — aberta ainda não foi conferida", () => {
    expect(STATUS_TRANSMISSIVEL).toBe("fechada");
    const contas = [conta(1, "fechada"), conta(2, "aberta"), conta(3, "faturada"),
                    conta(4, "glosada"), conta(5, "cancelada")];
    expect(contasTransmissiveis(contas, { competencia: "202608" }).map(c => c.id)).toEqual([1]);
  });

  it("não mistura competências — a remessa é de UM mês", () => {
    const contas = [conta(1, "fechada"), conta(2, "fechada", { competencia: "202607" })];
    expect(contasTransmissiveis(contas, { competencia: "202608" }).map(c => c.id)).toEqual([1]);
  });

  it("a remessa do BPA não leva AIH junto", () => {
    const contas = [conta(1, "fechada", { via: "AIH" }), conta(2, "fechada", { via: "BPA" })];
    expect(contasTransmissiveis(contas, { competencia: "202608", via: "BPA" }).map(c => c.id)).toEqual([2]);
    // via vazia = transmite tudo de uma vez, que é como muito hospital faz
    expect(contasTransmissiveis(contas, { competencia: "202608" }).map(c => c.id)).toEqual([1, 2]);
  });

  it("já faturada não entra de novo — transmitir duas vezes não é idempotente lá fora", () => {
    const contas = [conta(1, "faturada")];
    expect(contasTransmissiveis(contas, { competencia: "202608" })).toEqual([]);
  });
});

describe("o que a validação RECUSA", () => {
  it("remessa sem nenhuma conta fechada", () => {
    const r = validarTransmissao({ ...OK, contas: [conta(1, "aberta")] });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/Nenhuma conta fechada/);
  });

  it("competência em branco", () => {
    const r = validarTransmissao({ ...OK, competencia: "", contas: [conta(1, "fechada")] });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/competência/i);
  });

  it("🔴 data no futuro — só se registra transmissão que já aconteceu", () => {
    const r = validarTransmissao({ ...OK, quando: "2026-08-27", contas: [conta(1, "fechada")] });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/futuro/);
  });

  it("hoje passa — o limite é o dia de hoje, não ontem", () => {
    const r = validarTransmissao({ ...OK, quando: HOJE, contas: [conta(1, "fechada")] });
    expect(r.ok).toBe(true);
  });

  it("data em branco", () => {
    const r = validarTransmissao({ ...OK, quando: "", contas: [conta(1, "fechada")] });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/data/i);
  });

  it("protocolo comprido demais — sinal de que veio texto junto", () => {
    const r = validarTransmissao({ ...OK, protocolo: "x".repeat(PROTOCOLO_MAX + 1), contas: [conta(1, "fechada")] });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/protocolo/i);
    // no limite ainda passa
    expect(validarTransmissao({ ...OK, protocolo: "x".repeat(PROTOCOLO_MAX), contas: [conta(1, "fechada")] }).ok).toBe(true);
  });
});

describe("o que a validação AVISA sem impedir", () => {
  it("conta aberta na mesma competência fica de fora — e isso é dinheiro que não sai", () => {
    const contas = [conta(1, "fechada"), conta(2, "aberta"), conta(3, "aberta")];
    const r = validarTransmissao({ ...OK, contas });
    expect(r.ok).toBe(true);                       // avisa, não impede
    expect(r.avisos.join(" ")).toMatch(/2 contas ainda abertas/);
    expect(contasQueFicamDeFora(contas, { competencia: "202608" })).toHaveLength(2);
  });

  it("⚠️ e NÃO avisa quando não há nenhuma aberta — aviso que sempre acende ensina a ignorar", () => {
    const r = validarTransmissao({ ...OK, contas: [conta(1, "fechada")] });
    expect(r.avisos.join(" ")).not.toMatch(/aberta/);
  });

  it("sem protocolo dá para transmitir, mas a glosa fica mais difícil de rastrear", () => {
    const r = validarTransmissao({ ...OK, protocolo: "", contas: [conta(1, "fechada")] });
    expect(r.ok).toBe(true);
    expect(r.avisos.join(" ")).toMatch(/protocolo/i);
  });

  it("com protocolo não sobra aviso de protocolo", () => {
    const r = validarTransmissao({ ...OK, contas: [conta(1, "fechada")] });
    expect(r.avisos.join(" ")).not.toMatch(/protocolo/i);
  });
});

describe("o resumo que a pessoa confirma", () => {
  it("conta por via, porque é assim que a remessa sai", () => {
    const r = resumoDaTransmissao([
      conta(1, "fechada", { via: "AIH" }), conta(2, "fechada", { via: "AIH" }),
      conta(3, "fechada", { via: "BPA" }), conta(4, "fechada", { via: "" }),
    ]);
    expect(r.quantas).toBe(4);
    expect(r.porVia.AIH).toBe(2);
    expect(r.porVia.BPA).toBe(1);
    expect(r.porVia["sem via"]).toBe(1);
    expect(r.vias).toEqual(["AIH", "BPA", "sem via"]);
  });

  it("aguenta lista vazia sem quebrar a tela", () => {
    expect(resumoDaTransmissao(null).quantas).toBe(0);
    expect(resumoDaTransmissao([]).vias).toEqual([]);
  });
});

describe("a data civil não passa pelo fuso", () => {
  it("hojeLocal devolve o dia LOCAL, não o UTC", () => {
    // 23h do dia 26 em Brasília já é dia 27 em UTC. `toISOString().slice(0,10)`
    // devolveria 27 e recusaria uma transmissão feita hoje à noite.
    expect(hojeLocal(new Date(2026, 7, 26, 23, 30))).toBe("2026-08-26");
    expect(hojeLocal(new Date(2026, 0, 1, 0, 5))).toBe("2026-01-01");
  });
});
