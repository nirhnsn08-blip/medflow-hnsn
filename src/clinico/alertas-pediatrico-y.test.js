// ═══════════════════════════════════════════════════════════
// REGRA PEDIÁTRICA E INCOMPATIBILIDADE EM Y
//
// 🔴 POR QUE ISTO EXISTE, COM NOME E DATA
// A auditoria de 04/09/2026 apontou as duas regras sem nenhum teste que as
// visse DISPARAR. Ao escrevê-los, em 16/09, apareceram dois defeitos que
// deixavam as duas mortas no prontuário de internação:
//
//   · a incompatibilidade em Y comparava a via só com "IV", e o prontuário
//     grava "EV" (endovenosa) — nunca disparou para paciente internado;
//   · o prontuário mandava `idade: null` fixo ao motor — a regra de criança
//     (e a de idoso) nunca disparou para paciente internado.
//
// ⚠️ Fronteiras em números literais. Conferir contra a constante que as
// define faz o teste andar junto com o erro.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { analisarPrescricaoClinica, viaEndovenosa } from "./alertas.js";

const analisar = (itens, ctx, cat, incompatY = []) => analisarPrescricaoClinica(itens, ctx, cat, [], incompatY);

// ── PEDIÁTRICO ──────────────────────────────────────────────
const AAS = { id: 1, nome: "Ácido acetilsalicílico 100 mg", principio_ativo: "acido acetilsalicilico", inapropriado_pediatrico: true, motivo_pediatrico: "risco de síndrome de Reye" };
const itemAAS = { medicamento_id: 1, medicamento_nome: "Ácido acetilsalicílico 100 mg" };
const pediatrico = (idade, med = AAS) => analisar([itemAAS], { idade }, { 1: med }).filter(a => a.tipo === "pediatrico");

describe("🔴 regra pediátrica — o limite padrão é 12 anos", () => {
  it("11 anos DISPARA", () => {
    expect(pediatrico(11)).toHaveLength(1);
  });

  it("🔴 12 anos NÃO dispara — a fronteira é 'menor que'", () => {
    expect(pediatrico(12)).toHaveLength(0);
  });

  it("recém-nascido (0 anos) dispara", () => {
    expect(pediatrico(0)).toHaveLength(1);
  });

  it("é ALTA e diz o limite e o motivo", () => {
    const [a] = pediatrico(5);
    expect(a.gravidade).toBe("alta");
    expect(a.titulo).toBe("Inapropriado para menor de 12 anos");
    expect(a.detalhe).toMatch(/Reye/);
  });

  it("limite próprio do medicamento substitui o 12", () => {
    const med = { ...AAS, idade_pediatrica: 2 };
    expect(pediatrico(1, med)).toHaveLength(1);
    expect(pediatrico(2, med)).toHaveLength(0);
    expect(pediatrico(5, med)).toHaveLength(0);
  });

  it("⚠️ limite 18 pega o adolescente de 17 e solta o de 18", () => {
    const med = { ...AAS, idade_pediatrica: 18 };
    expect(pediatrico(17, med)).toHaveLength(1);
    expect(pediatrico(18, med)).toHaveLength(0);
  });

  it("medicamento sem a marcação não dispara em idade nenhuma", () => {
    const med = { ...AAS, inapropriado_pediatrico: false };
    expect(pediatrico(3, med)).toHaveLength(0);
  });
});

describe("🔴 idade DESCONHECIDA não é 'adulto'", () => {
  const aviso = (ctx, cat = { 1: AAS }, itens = [itemAAS]) =>
    analisar(itens, ctx, cat).find(a => a.titulo === "Faixa etária NÃO conferida");

  it("🔴 medicamento com restrição de idade e paciente sem idade → aviso", () => {
    // Era o prontuário de internação inteiro: `idade: null` fixo, e a regra
    // de criança calada para todo internado.
    const a = aviso({ idade: null });
    expect(a).toBeTruthy();
    expect(a.gravidade).toBe("media");
    expect(a.itens).toEqual(["Ácido acetilsalicílico 100 mg"]);
  });

  it("marcação de IDOSO também depende de idade", () => {
    const beers = { id: 1, nome: "Diazepam 10 mg", inapropriado_idoso: true };
    expect(aviso({}, { 1: beers }, [{ medicamento_id: 1, medicamento_nome: "Diazepam 10 mg" }])).toBeTruthy();
  });

  it("⚠️ medicamento SEM restrição de idade não gera aviso", () => {
    const neutro = { id: 1, nome: "Soro fisiológico" };
    expect(aviso({}, { 1: neutro }, [{ medicamento_id: 1, medicamento_nome: "Soro fisiológico" }])).toBeUndefined();
  });

  it("com idade conhecida, o aviso some", () => {
    expect(aviso({ idade: 40 })).toBeUndefined();
    expect(aviso({ idade: 0 })).toBeUndefined();      // zero é idade, não ausência
  });

  it("vários medicamentos viram UM aviso", () => {
    const cat = { 1: AAS, 2: { id: 2, nome: "Diazepam 10 mg", inapropriado_idoso: true } };
    const itens = [itemAAS, { medicamento_id: 2, medicamento_nome: "Diazepam 10 mg" }];
    const r = analisar(itens, {}, cat).filter(a => a.titulo === "Faixa etária NÃO conferida");
    expect(r).toHaveLength(1);
    expect(r[0].itens).toHaveLength(2);
  });
});

// ── INCOMPATIBILIDADE EM Y ──────────────────────────────────
const CAT = {
  1: { id: 1, nome: "Ceftriaxona 1 g", principio_ativo: "ceftriaxona" },
  2: { id: 2, nome: "Gluconato de cálcio 10%", principio_ativo: "gluconato de calcio" },
  3: { id: 3, nome: "Soro fisiológico 0,9%", principio_ativo: "cloreto de sodio" },
};
const BASE = [{ substancia_a: "ceftriaxona", substancia_b: "calcio", descricao: "precipitado de ceftriaxona cálcica" }];
const it_ = (id, via) => ({ medicamento_id: id, medicamento_nome: CAT[id].nome, via });
const incompat = (itens, base = BASE) => analisar(itens, {}, CAT, base).filter(a => a.tipo === "incompat_y");

describe("viaEndovenosa — os nomes que as telas usam", () => {
  it("🔴 'EV' é endovenosa — é o que o prontuário grava", () => {
    expect(viaEndovenosa("EV")).toBe(true);
  });
  it("IV, minúsculas e por extenso também", () => {
    for (const v of ["IV", "iv", "ev", " EV ", "Endovenosa", "intravenosa", "Intravenoso"]) expect(viaEndovenosa(v), v).toBe(true);
  });
  it("as outras vias não são", () => {
    for (const v of ["VO", "IM", "SC", "SL", "SNE", "Sonda", "", null, undefined]) expect(viaEndovenosa(v), String(v)).toBe(false);
  });
});

describe("🔴 incompatibilidade em Y — dispara de verdade", () => {
  it("dois IV que casam com a base → alerta ALTO com a descrição", () => {
    const r = incompat([it_(1, "IV"), it_(2, "IV")]);
    expect(r).toHaveLength(1);
    expect(r[0].gravidade).toBe("alta");
    expect(r[0].detalhe).toMatch(/ceftriaxona cálcica/);
    expect(r[0].itens.sort()).toEqual(["Ceftriaxona 1 g", "Gluconato de cálcio 10%"].sort());
  });

  it("🔴 via 'EV' (prontuário de internação) dispara igual", () => {
    expect(incompat([it_(1, "EV"), it_(2, "EV")])).toHaveLength(1);
  });

  it("uma em IV e outra em EV também é a mesma linha venosa", () => {
    expect(incompat([it_(1, "IV"), it_(2, "EV")])).toHaveLength(1);
  });

  it("⚠️ a ordem do par na base não importa", () => {
    const invertida = [{ substancia_a: "calcio", substancia_b: "ceftriaxona", descricao: "x" }];
    expect(incompat([it_(1, "IV"), it_(2, "IV")], invertida)).toHaveLength(1);
    expect(incompat([it_(2, "IV"), it_(1, "IV")])).toHaveLength(1);
  });

  it("🔴 se UM deles não é endovenoso, não há linha em comum — não dispara", () => {
    expect(incompat([it_(1, "IV"), it_(2, "VO")])).toHaveLength(0);
    expect(incompat([it_(1, "EV"), it_(2, "IM")])).toHaveLength(0);
  });

  it("três endovenosos com UM par incompatível → exatamente um alerta", () => {
    expect(incompat([it_(1, "IV"), it_(2, "IV"), it_(3, "IV")])).toHaveLength(1);
  });

  it("par que não está na base não dispara", () => {
    expect(incompat([it_(1, "IV"), it_(3, "IV")])).toHaveLength(0);
  });

  it("base vazia não dispara nada nem avisa — foi lida e não tem o par", () => {
    const r = analisar([it_(1, "IV"), it_(2, "IV")], {}, CAT, []);
    expect(r.filter(a => a.tipo === "incompat_y" || a.tipo === "base_indisponivel")).toHaveLength(0);
  });
});

describe("🔴 base de Y NÃO lida, com via EV", () => {
  it("dois EV e base nula → 'Incompatibilidade em Y NÃO conferida'", () => {
    // Antes do conserto este aviso também não saía no prontuário: com "EV"
    // ninguém contava como endovenoso, e "menos de dois IV" calava o aviso.
    const r = analisar([it_(1, "EV"), it_(3, "EV")], {}, CAT, null);
    expect(r.map(a => a.titulo)).toContain("Incompatibilidade em Y NÃO conferida");
  });

  it("um EV e um VO com base nula não avisam — não há par venoso", () => {
    const r = analisar([it_(1, "EV"), it_(3, "VO")], {}, CAT, null);
    expect(r.map(a => a.titulo)).not.toContain("Incompatibilidade em Y NÃO conferida");
  });
});
