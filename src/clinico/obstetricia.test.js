// Testes do apoio à decisão da triagem OBSTÉTRICA. O risco protegido: subtriar
// uma pré-eclâmpsia/eclâmpsia ou um sangramento grave. Os NÍVEIS e limiares são
// o seed de rascunho (a equipe valida e edita na tela); o que se testa é a
// LÓGICA — discriminador/PA → cor, com a PA obstétrica (não a de adulto).

import { describe, it, expect } from "vitest";
import { avaliarObstetrica, temSintomaPreeclampsia, obstetricasValidadas } from "./obstetricia.js";

// Fixture espelhando o seed de migracao-ps-faixas-obstetricas.sql.
const REGRAS = [
  { chave: "preeclampsia_grave",     ordem: 0, rotulo: "PA ≥160/110 + sintoma", nivel: "vermelho", pas_min: 160, pad_min: 110, requer_sintoma: true,  ativo: true, validado: true },
  { chave: "pa_grave",               ordem: 1, rotulo: "PA ≥160/110",           nivel: "laranja",  pas_min: 160, pad_min: 110, requer_sintoma: false, ativo: true, validado: true },
  { chave: "sangramento",            ordem: 2, rotulo: "Sangramento vaginal",   nivel: "laranja",  pas_min: null, pad_min: null, requer_sintoma: false, ativo: true, validado: true },
  { chave: "mov_fetal_ausente",      ordem: 3, rotulo: "Mov. fetal ausente",    nivel: "laranja",  pas_min: null, pad_min: null, requer_sintoma: false, ativo: true, validado: true },
  { chave: "preeclampsia_iminencia", ordem: 4, rotulo: "PA ≥140/90 + sintoma",  nivel: "laranja",  pas_min: 140, pad_min: 90,  requer_sintoma: true,  ativo: true, validado: true },
  { chave: "pa_alerta",              ordem: 5, rotulo: "PA 140–159/90–109",     nivel: "amarelo",  pas_min: 140, pad_min: 90,  requer_sintoma: false, ativo: true, validado: true },
  { chave: "mov_fetal_reduzido",     ordem: 6, rotulo: "Mov. fetal reduzido",   nivel: "amarelo",  pas_min: null, pad_min: null, requer_sintoma: false, ativo: true, validado: true },
  { chave: "perda_liquido",          ordem: 7, rotulo: "Perda de líquido",      nivel: "amarelo",  pas_min: null, pad_min: null, requer_sintoma: false, ativo: true, validado: true },
  { chave: "contracoes",             ordem: 8, rotulo: "Contrações",            nivel: "amarelo",  pas_min: null, pad_min: null, requer_sintoma: false, ativo: true, validado: true },
];

describe("temSintomaPreeclampsia", () => {
  it("reconhece qualquer um dos sintomas", () => {
    expect(temSintomaPreeclampsia({ cefaleia: true })).toBe(true);
    expect(temSintomaPreeclampsia({ epigastralgia: true })).toBe(true);
    expect(temSintomaPreeclampsia({ alteracao_visual: true })).toBe(true);
  });
  it("sem sintoma → false", () => {
    expect(temSintomaPreeclampsia({})).toBe(false);
    expect(temSintomaPreeclampsia(null)).toBe(false);
  });
});

describe("avaliarObstetrica — PA / pré-eclâmpsia", () => {
  it("PA grave SEM sintoma → laranja (hipertensão grave)", () => {
    const r = avaliarObstetrica({ pa_sist: 170, pa_diast: 115 }, {}, REGRAS);
    expect(r.sugestao).toBe("laranja");
  });
  it("PA grave COM sintoma → vermelho (iminência de eclâmpsia)", () => {
    const r = avaliarObstetrica({ pa_sist: 170, pa_diast: 115 }, { cefaleia: true }, REGRAS);
    expect(r.sugestao).toBe("vermelho");
    // só um motivo de PA (o mais grave), sem redundância
    expect(r.motivos.filter(m => m.texto.includes("PA")).length).toBe(1);
  });
  it("PA de alerta SEM sintoma → amarelo", () => {
    expect(avaliarObstetrica({ pa_sist: 145, pa_diast: 92 }, {}, REGRAS).sugestao).toBe("amarelo");
  });
  it("PA de alerta COM sintoma → laranja (iminência)", () => {
    expect(avaliarObstetrica({ pa_sist: 145, pa_diast: 92 }, { epigastralgia: true }, REGRAS).sugestao).toBe("laranja");
  });
  it("PA 185/100 vira laranja na obstétrica (na de adulto seria só amarelo)", () => {
    expect(avaliarObstetrica({ pa_sist: 185, pa_diast: 100 }, {}, REGRAS).sugestao).toBe("laranja");
  });
});

describe("avaliarObstetrica — discriminadores", () => {
  it("sangramento vaginal → laranja", () => {
    expect(avaliarObstetrica({}, { sangramento: true }, REGRAS).sugestao).toBe("laranja");
  });
  it("movimento fetal ausente → laranja; reduzido → amarelo", () => {
    expect(avaliarObstetrica({}, { mov_fetal: "ausente" }, REGRAS).sugestao).toBe("laranja");
    expect(avaliarObstetrica({}, { mov_fetal: "reduzido" }, REGRAS).sugestao).toBe("amarelo");
    expect(avaliarObstetrica({}, { mov_fetal: "presente" }, REGRAS).sugestao).toBe(null);
  });
  it("perda de líquido e contrações → amarelo", () => {
    expect(avaliarObstetrica({}, { perda_liquido: true }, REGRAS).sugestao).toBe("amarelo");
    expect(avaliarObstetrica({}, { contracoes: true }, REGRAS).sugestao).toBe("amarelo");
  });
  it("pior nível vence: PA amarelo + sangramento laranja → laranja", () => {
    const r = avaliarObstetrica({ pa_sist: 145, pa_diast: 92 }, { sangramento: true }, REGRAS);
    expect(r.sugestao).toBe("laranja");
  });
});

describe("avaliarObstetrica — sinais gerais e vazio", () => {
  it("SpO2 baixa → laranja (limiar de adulto vale para a gestante)", () => {
    expect(avaliarObstetrica({ spo2: 88 }, {}, REGRAS).sugestao).toBe("laranja");
  });
  it("AVPU inconsciente → vermelho (possível eclâmpsia)", () => {
    expect(avaliarObstetrica({ consciencia: "U" }, {}, REGRAS).sugestao).toBe("vermelho");
  });
  it("só dados de história (sem sinal de risco) → sugestão nula", () => {
    expect(avaliarObstetrica({}, { ig_semanas: 38, gesta: 2 }, REGRAS).sugestao).toBe(null);
  });
});

describe("obstetricasValidadas", () => {
  it("true quando todas as ativas estão validadas", () => {
    expect(obstetricasValidadas(REGRAS)).toBe(true);
  });
  it("false se qualquer ativa não está validada", () => {
    const uma = REGRAS.map(r => r.chave === "sangramento" ? { ...r, validado: false } : r);
    expect(obstetricasValidadas(uma)).toBe(false);
  });
  it("lista vazia → false", () => {
    expect(obstetricasValidadas([])).toBe(false);
    expect(obstetricasValidadas(null)).toBe(false);
  });
});
