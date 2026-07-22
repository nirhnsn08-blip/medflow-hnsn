// ═══════════════════════════════════════════════════════════
// Testes do motor de alertas da farmácia clínica.
//
//     npm test
//
// POR QUE ESTES TESTES EXISTEM
// Este é o código que decide se a equipe é avisada sobre dose acima do
// limite, interação grave e alergia. Um erro aqui não aparece na tela como
// erro — aparece como SILÊNCIO, que é indistinguível de "está tudo bem".
//
// Os casos abaixo foram validados manualmente no banco demo em 22/07/2026,
// com pacientes fictícios construídos para disparar cada regra. As
// mensagens esperadas são as que o sistema produziu de fato naquele dia.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  analisarPrescricaoClinica, checarAlergia, parseAlergias,
  scoreItemClinico, scorePrescricao, normTxt,
} from "./alertas.js";

// ── Catálogo mínimo, espelhando os campos reais do farm_medicamentos ──
const MED = {
  1: { id: 1, nome: "Paracetamol 500 mg comprimido", principio_ativo: "Paracetamol",
       dose_maxima_dia: 4000, dose_maxima_unid: "mg" },
  2: { id: 2, nome: "Varfarina 5 mg comprimido", principio_ativo: "Varfarina" },
  3: { id: 3, nome: "Ibuprofeno 600 mg comprimido", principio_ativo: "Ibuprofeno",
       grupo_terapeutico: "AINE" },
  4: { id: 4, nome: "Dipirona 500 mg comprimido", principio_ativo: "Dipirona sódica" },
  5: { id: 5, nome: "Morfina 10 mg/mL injetável", principio_ativo: "Morfina",
       grupo_terapeutico: "Opioide", ajuste_hepatico: "Reduzir dose/intervalo na insuficiência hepática." },
  6: { id: 6, nome: "Midazolam 5 mg/mL injetável", principio_ativo: "Midazolam",
       grupo_terapeutico: "Benzodiazepínico", inapropriado_idoso: true,
       motivo_idoso: "Benzodiazepínico — sedação e depressão respiratória em idosos (Beers)" },
  7: { id: 7, nome: "Omeprazol 20 mg cápsula", principio_ativo: "Omeprazol",
       nao_triturar: true, obs_clinica: "Grânulos gastrorresistentes — não triturar" },
  8: { id: 8, nome: "Vancomicina 1 g injetável", principio_ativo: "Vancomicina",
       ajuste_renal: "Ajustar pela ClCr e dosar nível sérico." },
  9: { id: 9, nome: "Amoxicilina 500 mg cápsula", principio_ativo: "Amoxicilina" },
  10: { id: 10, nome: "Ceftriaxona 1 g injetável", principio_ativo: "Ceftriaxona" },
};

const INTERACOES = [
  { substancia_a: "varfarina", substancia_b: "aine", gravidade: "grave",
    descricao: "Risco elevado de sangramento", conduta: "evitar; preferir analgésico alternativo" },
  { substancia_a: "opioide", substancia_b: "benzodiazep", gravidade: "grave",
    descricao: "Depressão respiratória e do SNC aditiva", conduta: "monitorar sedação/FR" },
];

const item = (id, extra = {}) => ({
  medicamento_id: id, medicamento_nome: MED[id].nome, dose_valor: 1,
  dose_unidade: "mg", frequencia_dia: 1, ...extra,
});
const tipos = as => as.map(a => a.tipo);
const de = (as, tipo) => as.find(a => a.tipo === tipo);

// ═══════════════════════════════════════════════════════════
describe("dose máxima diária", () => {
  it("alerta quando dose × frequência passa do teto do catálogo", () => {
    // Paracetamol: 1000 mg × 6/dia = 6000 mg/dia, teto 4000
    const a = analisarPrescricaoClinica(
      [item(1, { dose_valor: 1000, frequencia_dia: 6 })], {}, MED);
    const d = de(a, "dose_maxima");
    expect(d).toBeTruthy();
    expect(d.gravidade).toBe("alta");
    expect(d.detalhe).toContain("6000 mg/dia prescritos");
    expect(d.detalhe).toContain("máximo 4000 mg/dia");
  });

  it("NÃO alerta quando está dentro do teto", () => {
    // 500 mg × 6/dia = 3000 mg/dia, abaixo de 4000
    const a = analisarPrescricaoClinica(
      [item(1, { dose_valor: 500, frequencia_dia: 6 })], {}, MED);
    expect(tipos(a)).not.toContain("dose_maxima");
  });

  it("no limite exato NÃO alerta (a regra é 'acima de', não 'igual a')", () => {
    const a = analisarPrescricaoClinica(
      [item(1, { dose_valor: 1000, frequencia_dia: 4 })], {}, MED);  // = 4000
    expect(tipos(a)).not.toContain("dose_maxima");
  });

  it("não alerta se a unidade prescrita difere da unidade do teto", () => {
    // teto em mg; prescrito em mL → comparar seria errado
    const a = analisarPrescricaoClinica(
      [item(1, { dose_valor: 1000, frequencia_dia: 6, dose_unidade: "mL" })], {}, MED);
    expect(tipos(a)).not.toContain("dose_maxima");
  });

  it("não alerta quando falta a dose numérica (não inventa valor)", () => {
    const a = analisarPrescricaoClinica(
      [item(1, { dose_valor: null, frequencia_dia: null })], {}, MED);
    expect(tipos(a)).not.toContain("dose_maxima");
  });
});

// ═══════════════════════════════════════════════════════════
describe("interações medicamentosas", () => {
  it("detecta varfarina + AINE como grave e traz a conduta", () => {
    const a = analisarPrescricaoClinica([item(2), item(3)], {}, MED, INTERACOES);
    const i = de(a, "interacao");
    expect(i).toBeTruthy();
    expect(i.gravidade).toBe("alta");
    expect(i.detalhe).toContain("Risco elevado de sangramento");
    expect(i.detalhe).toContain("evitar; preferir analgésico alternativo");
  });

  it("detecta opioide + benzodiazepínico pelo grupo terapêutico", () => {
    const a = analisarPrescricaoClinica([item(5), item(6)], {}, MED, INTERACOES);
    const i = de(a, "interacao");
    expect(i).toBeTruthy();
    expect(i.detalhe).toContain("Depressão respiratória");
  });

  it("não acusa interação com um medicamento só", () => {
    const a = analisarPrescricaoClinica([item(2)], {}, MED, INTERACOES);
    expect(tipos(a)).not.toContain("interacao");
  });

  it("gera UM alerta por par, não um por sentido", () => {
    const a = analisarPrescricaoClinica([item(2), item(3)], {}, MED, INTERACOES);
    expect(a.filter(x => x.tipo === "interacao")).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════
describe("alergias", () => {
  it("alerta na alergia declarada direta", () => {
    const a = analisarPrescricaoClinica([item(4)], { alergias: "Dipirona" }, MED);
    const al = de(a, "alergia");
    expect(al.gravidade).toBe("alta");
    expect(al.detalhe).toContain("NÃO administrar sem reavaliação médica");
  });

  it("reconhece a alergia mesmo com acento e caixa diferentes", () => {
    const a = analisarPrescricaoClinica([item(4)], { alergias: "DIPIRONA SÓDICA" }, MED);
    expect(tipos(a)).toContain("alergia");
  });

  it("detecta reatividade CRUZADA: alérgico a penicilina x cefalosporina", () => {
    const r = checarAlergia(MED[10], parseAlergias("Penicilina"));
    expect(r.match).toBe("cruzada");
    expect(r.grupo).toContain("Betalactâmicos");
  });

  it("trata alergia ao próprio grupo como DIRETA, não cruzada", () => {
    const r = checarAlergia(MED[9], parseAlergias("Penicilina"));
    expect(r.match).toBe("direta");
  });

  it("não alerta para paciente sem alergia declarada", () => {
    const a = analisarPrescricaoClinica([item(4)], { alergias: "" }, MED);
    expect(tipos(a)).not.toContain("alergia");
  });

  it("ignora termos curtos demais para serem confiáveis", () => {
    // "AB" (2 letras) casaria com dezenas de fármacos — descartado de propósito
    expect(parseAlergias("AB")).toHaveLength(0);
    expect(parseAlergias("AAS, Ibuprofeno")).toEqual(["aas", "ibuprofeno"]);
  });
});

// ═══════════════════════════════════════════════════════════
describe("contexto do paciente", () => {
  it("idoso ≥ 65 recebe alerta de Beers", () => {
    const a = analisarPrescricaoClinica([item(6)], { idade: 85 }, MED);
    const i = de(a, "idoso");
    expect(i.gravidade).toBe("media");
    expect(i.detalhe).toContain("Beers");
  });

  it("aos 64 anos ainda não alerta; aos 65 alerta (limite exato)", () => {
    expect(tipos(analisarPrescricaoClinica([item(6)], { idade: 64 }, MED))).not.toContain("idoso");
    expect(tipos(analisarPrescricaoClinica([item(6)], { idade: 65 }, MED))).toContain("idoso");
  });

  it("paciente em sonda + medicamento que não pode ser triturado", () => {
    const a = analisarPrescricaoClinica([item(7)], { em_sonda: true }, MED);
    const s = de(a, "sonda");
    expect(s.gravidade).toBe("alta");
    expect(s.detalhe).toContain("não triturar");
  });

  it("mesmo medicamento NÃO alerta se o paciente não está em sonda", () => {
    const a = analisarPrescricaoClinica([item(7)], { em_sonda: false }, MED);
    expect(tipos(a)).not.toContain("sonda");
  });

  it("função renal: ClCr < 30 é alta; entre 30 e 60 é média", () => {
    expect(de(analisarPrescricaoClinica([item(8)], { clearance_renal: 25 }, MED), "ajuste_renal").gravidade).toBe("alta");
    expect(de(analisarPrescricaoClinica([item(8)], { clearance_renal: 45 }, MED), "ajuste_renal").gravidade).toBe("media");
    expect(tipos(analisarPrescricaoClinica([item(8)], { clearance_renal: 90 }, MED))).not.toContain("ajuste_renal");
  });

  it("função hepática: grave é alta; moderada é média", () => {
    expect(de(analisarPrescricaoClinica([item(5)], { funcao_hepatica: "grave" }, MED), "ajuste_hepatico").gravidade).toBe("alta");
    expect(de(analisarPrescricaoClinica([item(5)], { funcao_hepatica: "moderada" }, MED), "ajuste_hepatico").gravidade).toBe("media");
    expect(tipos(analisarPrescricaoClinica([item(5)], { funcao_hepatica: "normal" }, MED))).not.toContain("ajuste_hepatico");
  });
});

// ═══════════════════════════════════════════════════════════
describe("duplicidade", () => {
  it("aponta o mesmo princípio ativo prescrito duas vezes", () => {
    const a = analisarPrescricaoClinica(
      [item(1), { ...item(1), medicamento_nome: "Paracetamol 200 mg/mL gotas" }], {}, MED);
    expect(tipos(a)).toContain("duplicidade");
  });
});

// ═══════════════════════════════════════════════════════════
describe("ordenação e robustez", () => {
  it("alertas graves vêm primeiro", () => {
    const a = analisarPrescricaoClinica(
      [item(1, { dose_valor: 1000, frequencia_dia: 6 }), item(6)], { idade: 85 }, MED);
    expect(a[0].gravidade).toBe("alta");
    expect(a[a.length - 1].gravidade).toBe("media");
  });

  it("não quebra com prescrição vazia nem com dados faltando", () => {
    expect(analisarPrescricaoClinica([], {}, MED)).toEqual([]);
    expect(analisarPrescricaoClinica(null, null, MED)).toEqual([]);
    expect(analisarPrescricaoClinica([{ medicamento_id: 999 }], {}, MED)).toEqual([]);
  });

  it("normTxt tira acento e caixa", () => {
    expect(normTxt("DIPIRONA Sódica")).toBe("dipirona sodica");
    expect(normTxt(null)).toBe("");
  });
});

// ═══════════════════════════════════════════════════════════
describe("score da prescrição", () => {
  it("item com alerta grave recebe o score máximo", () => {
    const it1 = item(1, { dose_valor: 1000, frequencia_dia: 6 });
    const a = analisarPrescricaoClinica([it1], {}, MED);
    expect(scoreItemClinico(it1, a)).toBe(3);
  });

  it("item sem alerta e com dose definida fica em zero", () => {
    expect(scoreItemClinico(item(1), [])).toBe(0);
  });

  it("dose não especificada já pontua 1, mesmo sem alerta", () => {
    expect(scoreItemClinico(item(1, { dose_valor: null }), [])).toBe(1);
  });

  it("o score da prescrição é o do pior item", () => {
    const bom = item(1);
    const ruim = item(1, { dose_valor: 1000, frequencia_dia: 6 });
    const a = analisarPrescricaoClinica([ruim], {}, MED);
    expect(scorePrescricao([bom, ruim], a)).toBe(3);
  });
});
