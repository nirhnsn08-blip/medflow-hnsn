// ═══════════════════════════════════════════════════════════
// O CBO DO PROFISSIONAL
//
// A regra que estes testes protegem: CBO ERRADO É PIOR QUE CBO VAZIO.
// Vazio avisa — a tela mostra "sem CBO no cadastro". Errado atravessa a
// tela, atravessa o congelamento no atendimento, e só falha no
// processamento do mês seguinte, quando a produção já sumiu.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { normalizarCbo, validarCbo, formatarCbo, cbosDoCatalogo } from "./cbo.js";

describe("normalizar", () => {
  it("guarda só os dígitos — o hífen é do formato publicado", () => {
    expect(normalizarCbo("2251-25")).toBe("225125");
    expect(normalizarCbo(" 2251 25 ")).toBe("225125");
    expect(normalizarCbo(null)).toBe("");
  });
});

describe("validar", () => {
  it("vazio é VÁLIDO — nem todo mundo executa procedimento", () => {
    // Recepcionista e administrativo não têm CBO assistencial, e exigir um
    // faria a tela cobrar de quem não tem o que responder.
    for (const v of ["", null, undefined, "   "]) {
      const r = validarCbo(v);
      expect(r.ok).toBe(true);
      expect(r.vazio).toBe(true);
      expect(r.valor).toBeNull();
    }
  });

  it("seis dígitos passa, e sai normalizado", () => {
    const r = validarCbo("2251-25");
    expect(r.ok).toBe(true);
    expect(r.vazio).toBe(false);
    expect(r.valor).toBe("225125");
  });

  it("RECUSA o que não tem seis dígitos — e diz quantos vieram", () => {
    for (const v of ["225", "22512", "2251251"]) {
      const r = validarCbo(v);
      expect(r.ok).toBe(false);
      expect(r.erro).toMatch(/6 d[íi]gitos/i);
    }
  });

  it("texto sem dígito nenhum é ERRO, não 'vazio'", () => {
    // Descartar a digitação em silêncio faz a pessoa achar que gravou.
    const r = validarCbo("cirurgião");
    expect(r.ok).toBe(false);
    expect(r.vazio).toBeUndefined();
    expect(r.erro).toMatch(/só número|so numero/i);
  });
});

describe("formatar", () => {
  it("mostra como o código é publicado", () => {
    expect(formatarCbo("225125")).toBe("2251-25");
  });

  it("o que não tem seis dígitos volta como veio — não inventa formato", () => {
    expect(formatarCbo("225")).toBe("225");
    expect(formatarCbo("")).toBe("");
  });
});

describe("sugestões vindas do catálogo", () => {
  // A única sugestão honesta possível: os CBOs que alguém DESTE hospital
  // cadastrou como compatíveis com algum procedimento. Nada inventado —
  // código de CBO chutado causa a rejeição que o campo existe para evitar.
  const procs = [
    { codigo: "A", cbos_compativeis: ["225125", "2251-25"] },
    { codigo: "B", cbos_compativeis: ["223505"] },
    { codigo: "C", cbos_compativeis: ["123", "", null] },   // lixo não vira sugestão
    { codigo: "D" },
    { codigo: "E", cbos_compativeis: null },
  ];

  it("junta, tira repetido e ordena", () => {
    expect(cbosDoCatalogo(procs)).toEqual(["223505", "225125"]);
  });

  it("código de formato inválido no catálogo NÃO vira sugestão", () => {
    expect(cbosDoCatalogo(procs)).not.toContain("123");
  });

  it("catálogo vazio ou nulo não quebra", () => {
    expect(cbosDoCatalogo([])).toEqual([]);
    expect(cbosDoCatalogo(null)).toEqual([]);
    expect(cbosDoCatalogo(undefined)).toEqual([]);
  });
});
