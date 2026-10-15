// ═══════════════════════════════════════════════════════════
// ALERTAS DE GESTAÇÃO E DE DOSE POR KG
//
// 🔴 POR QUE ISTO EXISTE, COM NOME E DATA
// Até 16/09/2026 o PS coletava peso e gestação, gravava os dois, exibia os
// dois no resumo do contexto clínico — com o texto "informe para habilitar
// os alertas" — e o motor não lia nenhum. A tela prometia uma proteção que
// não existia.
//
// ⚠️ Os testes usam números literais nas fronteiras. Conferir a fronteira
// contra a constante que a define faz o teste andar junto com o erro.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  alertaGestacao, analisarPrescricaoClinica, categoriaGestacao, conferirDosePorKg, pesoValido,
} from "./alertas.js";
import { camposGestacaoPeso } from "../farmacia/campos-gestacao-peso.js";

const med = (extra = {}) => ({ id: 1, nome: "Remédio 100 mg", principio_ativo: "remedio", ...extra });
const item = (extra = {}) => ({ medicamento_id: 1, medicamento_nome: "Remédio 100 mg", dose_valor: 100, dose_unidade: "mg", frequencia_dia: 3, ...extra });
const analisar = (m, it, ctx) => analisarPrescricaoClinica([it], ctx, { 1: m }, [], []);
const tipos = (m, it, ctx) => analisar(m, it, ctx).map(a => a.tipo);
const titulos = (m, it, ctx) => analisar(m, it, ctx).map(a => a.titulo);

describe("categoriaGestacao — só A, B, C, D ou X", () => {
  it("aceita as cinco, sem diferenciar maiúscula", () => {
    expect(["a", "B", " c ", "D", "x"].map(categoriaGestacao)).toEqual(["A", "B", "C", "D", "X"]);
  });
  it("qualquer outra coisa é `null`", () => {
    for (const v of [null, undefined, "", "E", "XX", "categoria X", 1]) expect(categoriaGestacao(v), String(v)).toBe(null);
  });
});

describe("🔴 alertaGestacao — só D e X alertam", () => {
  const gestante = { gestante: true };

  it("🔴 X é ALTA: contraindicado", () => {
    const a = alertaGestacao(med({ risco_gestacao: "X" }), gestante);
    expect(a.gravidade).toBe("alta");
    expect(a.titulo).toMatch(/Contraindicado/);
  });

  it("⚠️ D é MÉDIA: risco comprovado, mas o benefício pode justificar", () => {
    const a = alertaGestacao(med({ risco_gestacao: "D" }), gestante);
    expect(a.gravidade).toBe("media");
    expect(a.titulo).toMatch(/categoria D/);
  });

  it("🔴 A, B e C NÃO alertam — C cobre a maioria dos medicamentos", () => {
    // Alertar em C dispararia em quase toda prescrição de gestante, e alarme
    // que toca em tudo não é lido nem quando o item é X.
    for (const c of ["A", "B", "C"]) expect(alertaGestacao(med({ risco_gestacao: c }), gestante), c).toBe(null);
  });

  it("🔴 paciente NÃO gestante não recebe alerta, nem de X", () => {
    expect(alertaGestacao(med({ risco_gestacao: "X" }), { gestante: false })).toBe(null);
    expect(alertaGestacao(med({ risco_gestacao: "X" }), {})).toBe(null);
    expect(alertaGestacao(med({ risco_gestacao: "X" }), null)).toBe(null);
  });

  it("o motivo cadastrado pela farmácia entra no texto", () => {
    const a = alertaGestacao(med({ risco_gestacao: "X", motivo_gestacao: "teratogênico no 1º trimestre" }), gestante);
    expect(a.detalhe).toMatch(/teratogênico no 1º trimestre/);
  });

  it("medicamento nulo não estoura", () => {
    expect(() => alertaGestacao(null, gestante)).not.toThrow();
  });
});

describe("🔴 gestação no motor", () => {
  const gestante = { gestante: true };

  it("X gera alerta 'gestacao' ALTO na prescrição", () => {
    const r = analisar(med({ risco_gestacao: "X" }), item(), gestante);
    expect(r.find(a => a.tipo === "gestacao")).toMatchObject({ gravidade: "alta", itens: ["Remédio 100 mg"] });
  });

  it("🔴 gestante com medicamento SEM categoria recebe 'NÃO conferido', gravidade baixa", () => {
    // Sem isto, catálogo vazio faria a prescrição de gestante parecer
    // conferida. Baixa, e um aviso só: é lista de trabalho da farmácia.
    const r = analisar(med(), item(), gestante);
    const a = r.find(x => x.titulo === "Risco na gestação NÃO conferido");
    expect(a).toBeTruthy();
    expect(a.gravidade).toBe("baixa");
    expect(a.detalhe).toMatch(/Remédio 100 mg/);
  });

  it("vários medicamentos sem categoria viram UM aviso, não um por item", () => {
    const m2 = { id: 2, nome: "Outro 50 mg", principio_ativo: "outro" };
    const r = analisarPrescricaoClinica([item(), { medicamento_id: 2, medicamento_nome: "Outro 50 mg" }], gestante, { 1: med(), 2: m2 }, [], []);
    expect(r.filter(a => a.titulo === "Risco na gestação NÃO conferido")).toHaveLength(1);
  });

  it("⚠️ medicamento com categoria C conta como CONFERIDO — não entra no aviso", () => {
    expect(titulos(med({ risco_gestacao: "C" }), item(), gestante)).not.toContain("Risco na gestação NÃO conferido");
  });

  it("não gestante: nem alerta, nem aviso de base", () => {
    const t = titulos(med(), item(), { gestante: false });
    expect(t).not.toContain("Risco na gestação NÃO conferido");
    expect(tipos(med({ risco_gestacao: "X" }), item(), { gestante: false })).not.toContain("gestacao");
  });
});

describe("pesoValido — faixa de 0,3 a 400 kg", () => {
  it("aceita as bordas", () => {
    expect(pesoValido(0.3)).toBe(0.3);
    expect(pesoValido(400)).toBe(400);
    expect(pesoValido("78.5")).toBe(78.5);
  });
  it("🔴 fora da faixa é erro de digitação, não paciente", () => {
    // 780 no lugar de 78,0 faria a dose por kg parecer dez vezes menor —
    // e esconderia exatamente a sobredose.
    for (const v of [0.29, 400.1, 780, 0, -5]) expect(pesoValido(v), String(v)).toBe(null);
  });
  it("vazio e lixo são `null`", () => {
    for (const v of ["", null, undefined, "abc", NaN]) expect(pesoValido(v), String(v)).toBe(null);
  });
});

describe("🔴 conferirDosePorKg", () => {
  // limite: 60 mg/kg/dia. Criança de 20 kg: teto de 1.200 mg/dia.
  const comLimite = med({ dose_maxima_kg_dia: 60, dose_maxima_kg_unid: "mg" });

  it("exatamente no teto NÃO é acima", () => {
    // 400 mg × 3 ÷ 20 kg = 60 mg/kg/dia
    expect(conferirDosePorKg(comLimite, item({ dose_valor: 400 }), 20)).toMatchObject({ estado: "ok", prescrito: 60 });
  });

  it("um miligrama acima do teto É acima", () => {
    // 401 × 3 ÷ 20 = 60,15
    expect(conferirDosePorKg(comLimite, item({ dose_valor: 401 }), 20).estado).toBe("acima");
  });

  it("🔴 dose de ADULTO numa criança de 12 kg dispara", () => {
    // 500 mg × 4 ÷ 12 kg = 166,7 mg/kg/dia
    const r = conferirDosePorKg(comLimite, item({ dose_valor: 500, frequencia_dia: 4 }), 12);
    expect(r.estado).toBe("acima");
    expect(r.prescrito).toBeCloseTo(166.67, 1);
  });

  it("⚠️ a mesma dose num adulto de 70 kg NÃO dispara", () => {
    // 500 × 4 ÷ 70 = 28,6
    expect(conferirDosePorKg(comLimite, item({ dose_valor: 500, frequencia_dia: 4 }), 70).estado).toBe("ok");
  });

  it("🔴 SEM PESO não é 'ok' — é 'sem_peso'", () => {
    for (const p of [null, "", 0, 780]) {
      expect(conferirDosePorKg(comLimite, item(), p), String(p)).toEqual({ estado: "sem_peso" });
    }
  });

  it("'Dose única' (frequência 0) conta como uma administração", () => {
    // 1.300 mg ÷ 20 kg = 65 → acima de 60
    expect(conferirDosePorKg(comLimite, item({ dose_valor: 1300, frequencia_dia: 0 }), 20).estado).toBe("acima");
  });

  it("não há o que conferir → `null`", () => {
    expect(conferirDosePorKg(med(), item(), 20)).toBe(null);                                           // sem limite
    expect(conferirDosePorKg(comLimite, item({ dose_valor: "" }), 20)).toBe(null);                     // sem dose
    expect(conferirDosePorKg(comLimite, item({ frequencia_dia: null }), 20)).toBe(null);               // "se necessário"
    expect(conferirDosePorKg(comLimite, item({ dose_unidade: "mL" }), 20)).toBe(null);                 // outra unidade
    expect(conferirDosePorKg(med({ dose_maxima_kg_dia: 60 }), item(), 20)).toBe(null);                 // limite sem unidade
    expect(conferirDosePorKg(med({ dose_maxima_kg_dia: 0, dose_maxima_kg_unid: "mg" }), item(), 20)).toBe(null);
  });

  it("⚠️ 'sem peso' só aparece quando HÁ o que conferir", () => {
    // Medicamento sem limite por kg não cobra peso de ninguém.
    expect(conferirDosePorKg(med(), item(), null)).toBe(null);
  });

  it("unidade sem diferenciar maiúscula", () => {
    expect(conferirDosePorKg(comLimite, item({ dose_unidade: "MG", dose_valor: 401 }), 20).estado).toBe("acima");
  });
});

describe("🔴 dose por kg no motor", () => {
  const comLimite = med({ dose_maxima_kg_dia: 60, dose_maxima_kg_unid: "mg" });

  it("acima do teto gera 'dose_kg' ALTO, com os números no texto", () => {
    const a = analisar(comLimite, item({ dose_valor: 500, frequencia_dia: 4 }), { peso: 12 }).find(x => x.tipo === "dose_kg");
    expect(a.gravidade).toBe("alta");
    expect(a.detalhe).toMatch(/mg\/kg\/dia/);
    expect(a.detalhe).toMatch(/12 kg/);
  });

  it("🔴 sem peso gera 'Dose por kg NÃO conferida', gravidade média", () => {
    const a = analisar(comLimite, item(), {}).find(x => x.titulo === "Dose por kg NÃO conferida");
    expect(a).toBeTruthy();
    expect(a.gravidade).toBe("media");
  });

  it("dentro do teto não gera nada de peso", () => {
    const t = analisar(comLimite, item({ dose_valor: 100 }), { peso: 70 }).map(a => a.titulo);
    expect(t).not.toContain("Dose acima da máxima por kg");
    expect(t).not.toContain("Dose por kg NÃO conferida");
  });
});

describe("🔴 o salvar do catálogo não quebra antes da migração", () => {
  const linhaSemMigracao = { id: 1, nome: "X", dose_maxima_dia: 4000 };
  const linhaComMigracao = { ...linhaSemMigracao, risco_gestacao: null, motivo_gestacao: null, dose_maxima_kg_dia: null, dose_maxima_kg_unid: null };

  it("🔴 banco SEM a migração e campos vazios: nenhuma coluna nova vai no corpo", () => {
    // Mandar a coluna faria o PostgREST recusar o PATCH inteiro — e o
    // editor deixaria de salvar qualquer coisa.
    expect(camposGestacaoPeso(linhaSemMigracao, { ...linhaSemMigracao })).toEqual({});
  });

  it("banco COM a migração: as quatro vão, mesmo vazias — é o que permite LIMPAR", () => {
    expect(Object.keys(camposGestacaoPeso(linhaComMigracao, { risco_gestacao: "" })).sort())
      .toEqual(["dose_maxima_kg_dia", "dose_maxima_kg_unid", "motivo_gestacao", "risco_gestacao"]);
    expect(camposGestacaoPeso(linhaComMigracao, { risco_gestacao: "" }).risco_gestacao).toBe(null);
  });

  it("valor preenchido vai sempre — e se a coluna não existir, o erro é o certo", () => {
    expect(camposGestacaoPeso(linhaSemMigracao, { risco_gestacao: "x" })).toEqual({ risco_gestacao: "X" });
  });

  it("medicamento NOVO sem nada preenchido não manda coluna nova", () => {
    expect(camposGestacaoPeso({}, {})).toEqual({});
  });

  it("categoria inválida e dose por kg ≤ 0 viram `null`", () => {
    const r = camposGestacaoPeso(linhaComMigracao, { risco_gestacao: "E", dose_maxima_kg_dia: "0" });
    expect(r.risco_gestacao).toBe(null);
    expect(r.dose_maxima_kg_dia).toBe(null);
  });

  it("🔴 limpar a categoria apaga o motivo — texto escondido não sobrevive", () => {
    // O campo de motivo some da tela fora de D e X. Antes, o texto antigo ia
    // gravado assim mesmo e voltava no alerta se alguém marcasse D depois.
    const r = camposGestacaoPeso(linhaComMigracao, { risco_gestacao: "", motivo_gestacao: "teratogênica" });
    expect(r.motivo_gestacao).toBe(null);
  });

  it("motivo só vale para D e X", () => {
    expect(camposGestacaoPeso(linhaComMigracao, { risco_gestacao: "C", motivo_gestacao: "x" }).motivo_gestacao).toBe(null);
    expect(camposGestacaoPeso(linhaComMigracao, { risco_gestacao: "D", motivo_gestacao: "x" }).motivo_gestacao).toBe("x");
    expect(camposGestacaoPeso(linhaComMigracao, { risco_gestacao: "X", motivo_gestacao: "x" }).motivo_gestacao).toBe("x");
  });

  it("número em texto é lido como número", () => {
    expect(camposGestacaoPeso({}, { dose_maxima_kg_dia: "15", dose_maxima_kg_unid: "mg" })).toEqual({ dose_maxima_kg_dia: 15, dose_maxima_kg_unid: "mg" });
  });
});
