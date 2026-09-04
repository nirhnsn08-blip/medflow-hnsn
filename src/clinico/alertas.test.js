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
  scoreItemClinico, scorePrescricao, normTxt, administracoesNoDia,
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

  it("comorbidade estima a função renal quando não há ClCr", () => {
    expect(de(analisarPrescricaoClinica([item(8)], { comorbidades: ["drc_dialise"] }, MED), "ajuste_renal").gravidade).toBe("alta");
    expect(de(analisarPrescricaoClinica([item(8)], { comorbidades: ["drc"] }, MED), "ajuste_renal").gravidade).toBe("media");
  });

  it("ClCr explícito manda sobre a comorbidade", () => {
    expect(tipos(analisarPrescricaoClinica([item(8)], { clearance_renal: 90, comorbidades: ["drc_dialise"] }, MED))).not.toContain("ajuste_renal");
  });

  it("comorbidade hepatopatia dispara o ajuste hepático", () => {
    expect(de(analisarPrescricaoClinica([item(5)], { comorbidades: ["hepatopatia"] }, MED), "ajuste_hepatico").gravidade).toBe("alta");
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

// ═══════════════════════════════════════════════════════════
// 🔴 BASE NÃO CONFERIDA — o libera-geral falso
//
// As bases de interação e de incompatibilidade em Y chegavam como `[]`
// tanto quando não havia nada cadastrado quanto quando a LEITURA FALHOU.
// Com `[]`, o laço de pares não acha nada e a prescrição sai limpa: uma
// falha de rede virava "sem interações", na conferência que mais importa.
//
// Agora a carga devolve `null` na falha e o motor avisa. O silêncio deixou
// de ser a resposta.
// ═══════════════════════════════════════════════════════════

describe("base indisponível", () => {
  const MED = {
    1: { id: 1, nome: "Varfarina", principio_ativo: "varfarina" },
    2: { id: 2, nome: "AAS", principio_ativo: "acido acetilsalicilico" },
    3: { id: 3, nome: "Ceftriaxona", principio_ativo: "ceftriaxona" },
  };
  const item = (id, via) => ({ medicamento_id: id, medicamento_nome: MED[id].nome, via });
  const doisOrais = [item(1), item(2)];
  const doisIV = [item(1, "IV"), item(2, "IV")];
  const tipos = a => a.map(x => x.tipo);

  it("🔴 base de interações em null vira ALERTA, não silêncio", () => {
    const a = analisarPrescricaoClinica(doisOrais, {}, MED, null, []);
    const av = a.filter(x => x.tipo === "base_indisponivel");
    expect(av).toHaveLength(1);
    expect(av[0].gravidade).toBe("alta");
    expect(av[0].detalhe).toContain("NÃO foram checados");
  });

  it("🔴 base de incompatibilidade em Y em null também", () => {
    const a = analisarPrescricaoClinica(doisIV, {}, MED, [], null);
    const av = a.filter(x => x.tipo === "base_indisponivel");
    expect(av).toHaveLength(1);
    expect(av[0].titulo).toContain("Incompatibilidade em Y");
  });

  it("as duas falhando dão dois avisos distintos", () => {
    const a = analisarPrescricaoClinica(doisIV, {}, MED, null, null);
    expect(a.filter(x => x.tipo === "base_indisponivel")).toHaveLength(2);
  });

  it("⚠️ base VAZIA continua calada — não há o que conferir, e não falhou", () => {
    // Esta é a diferença toda: `[]` é resposta, `null` é ausência dela.
    expect(tipos(analisarPrescricaoClinica(doisOrais, {}, MED, [], []))).not.toContain("base_indisponivel");
  });

  it("🔴 e NÃO avisa quando não havia par possível — alarme à toa se aprende a ignorar", () => {
    // Um medicamento só não interage com ninguém. Avisar aqui poria o aviso
    // em toda prescrição de item único, e ele deixaria de ser lido
    // justamente onde importa.
    expect(tipos(analisarPrescricaoClinica([item(1)], {}, MED, null, null))).not.toContain("base_indisponivel");
    expect(tipos(analisarPrescricaoClinica([], {}, MED, null, null))).not.toContain("base_indisponivel");
  });

  it("⚠️ o aviso de Y só sai com dois IV — via oral não infunde em linha", () => {
    const umIV = [item(1, "IV"), item(2, "VO")];
    const a = analisarPrescricaoClinica(umIV, {}, MED, [], null);
    expect(tipos(a)).not.toContain("base_indisponivel");
  });

  it("o aviso entra no topo, junto com o que é grave", () => {
    // A lista sai ordenada por gravidade. "Não conferi" é alta: quem lê a
    // primeira linha precisa ver que a conferência não aconteceu.
    const a = analisarPrescricaoClinica(doisOrais, {}, MED, null, []);
    expect(a[0].gravidade).toBe("alta");
  });

  it("não atrapalha as outras regras — elas continuam rodando", () => {
    // A base indisponível não pode desligar duplicidade, alergia, dose.
    const dup = [item(1), { medicamento_id: 1, medicamento_nome: "Varfarina", via: "VO" }];
    const a = analisarPrescricaoClinica(dup, {}, MED, null, null);
    expect(tipos(a)).toContain("duplicidade");
  });
});

describe("🔴 administracoesNoDia — Dose única é UMA vez, não zero", () => {
  it("frequência normal passa direto", () => {
    expect(administracoesNoDia(3)).toBe(3);
    expect(administracoesNoDia(1)).toBe(1);
  });

  it("🔴 ZERO (Dose única) vira 1", () => {
    // `freqDia("Dose única")` devolve 0, e 0 é falsy: a conferência de dose
    // máxima diária era pulada inteira. E mesmo passando, `dose × 0` daria
    // zero e nunca estouraria o teto.
    expect(administracoesNoDia(0)).toBe(1);
    expect(administracoesNoDia("0")).toBe(1);
  });

  it("🔴 `null` (Se necessário) continua sendo NÃO SEI", () => {
    // Inventar 1 daria um total diário que ninguém prescreveu.
    expect(administracoesNoDia(null)).toBe(null);
    expect(administracoesNoDia(undefined)).toBe(null);
    expect(administracoesNoDia("")).toBe(null);
  });

  it("lixo não vira número", () => {
    for (const v of ["abc", NaN, -1, Infinity]) expect(administracoesNoDia(v), String(v)).toBe(null);
  });
});

describe("🔴 dose máxima diária — a dose única não escapa mais", () => {
  const remedio = { id: 900, nome: "Paracetamol teto", dose_maxima_dia: 4000, dose_maxima_unid: "mg" };
  const catalogo = { 900: remedio };
  const item = extra => ({ medicamento_id: 900, medicamento_nome: remedio.nome, dose_valor: 8000, dose_unidade: "mg", ...extra });
  const tipos = itens => analisarPrescricaoClinica(itens, {}, catalogo, [], []).map(a => a.tipo);

  it("🔴 8.000 mg em DOSE ÚNICA (teto 4.000/dia) agora dispara", () => {
    // Era o buraco: frequencia_dia = 0 pulava a conferência inteira.
    expect(tipos([item({ frequencia_dia: 0 })])).toContain("dose_maxima");
  });

  it("dose única DENTRO do teto não dispara", () => {
    expect(tipos([item({ dose_valor: 1000, frequencia_dia: 0 })])).not.toContain("dose_maxima");
  });

  it("a fronteira: exatamente o teto não dispara, um a mais dispara", () => {
    expect(tipos([item({ dose_valor: 4000, frequencia_dia: 0 })])).not.toContain("dose_maxima");
    expect(tipos([item({ dose_valor: 4001, frequencia_dia: 0 })])).toContain("dose_maxima");
  });

  it("frequência normal continua multiplicando", () => {
    expect(tipos([item({ dose_valor: 1000, frequencia_dia: 5 })])).toContain("dose_maxima");
    expect(tipos([item({ dose_valor: 1000, frequencia_dia: 4 })])).not.toContain("dose_maxima");
  });

  it("⚠️ Se necessário (frequência nula) continua SEM conferência", () => {
    // Quantas vezes o paciente vai precisar é desconhecido.
    expect(tipos([item({ frequencia_dia: null })])).not.toContain("dose_maxima");
  });
});
