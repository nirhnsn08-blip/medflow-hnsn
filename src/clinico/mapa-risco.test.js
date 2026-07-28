// Testes do mapa de risco por leito. Protege a priorização: se um leito grave
// aparecesse embaixo, a enfermagem cuidaria na ordem errada. Aqui se testa a
// redução (última escala por leito), o pior nível e a ordenação.

import { describe, it, expect } from "vitest";
import { ultimaPorProntuarioTipo, piorNivel, montarMapaRisco, RISCO_TIPOS } from "./mapa-risco.js";

const esc = (prontuario, tipo, nivel, aferido_em) => ({ prontuario, tipo, nivel, aferido_em, classificacao: nivel });

describe("ultimaPorProntuarioTipo", () => {
  it("mantém só a primeira (mais recente) de cada prontuário+tipo", () => {
    const m = ultimaPorProntuarioTipo([
      esc("P1", "braden", "laranja", "2026-07-27T10:00Z"),  // mais recente (lista já desc)
      esc("P1", "braden", "vermelho", "2026-07-26T10:00Z"), // antiga — ignorada
      esc("P1", "morse", "amarelo", "2026-07-27T09:00Z"),
    ]);
    expect(m.P1.braden.nivel).toBe("laranja");
    expect(m.P1.morse.nivel).toBe("amarelo");
  });
});

describe("piorNivel", () => {
  it("vermelho vence laranja vence amarelo vence verde", () => {
    expect(piorNivel(["verde", "amarelo", "vermelho"])).toBe("vermelho");
    expect(piorNivel(["verde", "amarelo"])).toBe("amarelo");
    expect(piorNivel([])).toBe(null);
  });
});

describe("montarMapaRisco", () => {
  const leitos = [
    { identificacao: "L1", prontuario: "P1", iniciais: "A.B.", setor: "Clínica" },
    { identificacao: "L2", prontuario: "P2", iniciais: "C.D.", setor: "Clínica" },
  ];
  const escalas = [
    esc("P1", "braden", "amarelo", "2026-07-27T10:00Z"),
    esc("P2", "morse", "laranja", "2026-07-27T10:00Z"),
  ];

  it("ordena do mais grave ao menos grave", () => {
    const linhas = montarMapaRisco(leitos, escalas, []);
    expect(linhas[0].leito).toBe("L2");   // P2 laranja > P1 amarelo
    expect(linhas[1].leito).toBe("L1");
  });

  it("LPP adquirida puxa o leito para vermelho", () => {
    const linhas = montarMapaRisco(leitos, escalas, [{ prontuario: "P1", presente_admissao: false, status: "ativa" }]);
    const p1 = linhas.find(l => l.leito === "L1");
    expect(p1.pior).toBe("vermelho");
    expect(p1.lpp.adquiridas).toBe(1);
    expect(linhas[0].leito).toBe("L1");   // agora L1 é o mais grave
  });

  it("LPP presente na admissão conta, mas como laranja (não adquirida)", () => {
    const linhas = montarMapaRisco([leitos[0]], [], [{ prontuario: "P1", presente_admissao: true, status: "ativa" }]);
    expect(linhas[0].pior).toBe("laranja");
    expect(linhas[0].lpp.adquiridas).toBe(0);
    expect(linhas[0].lpp.total).toBe(1);
  });

  it("leito sem escala nem LPP fica com pior = null", () => {
    const linhas = montarMapaRisco([leitos[0]], [], []);
    expect(linhas[0].pior).toBe(null);
    expect(linhas[0].braden).toBe(null);
  });

  it("expõe os tipos de risco esperados", () => {
    expect(RISCO_TIPOS).toEqual(["braden", "morse", "flebite"]);
  });
});
