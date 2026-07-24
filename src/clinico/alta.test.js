// Testes do sumário de alta.
//
// O que se protege aqui: (1) o rascunho nunca inventa conteúdo clínico;
// (2) a conferência não deixa passar documento que quem recebe o paciente
// não conseguiria usar; (3) óbito e evasão não são tratados como alta.

import { describe, it, expect } from "vitest";
import {
  DESFECHOS, montarRascunhoAlta, conferirSumario, podeAssinarSumario, textoSumario,
} from "./alta.js";

const EPISODIO = {
  id: 7, prontuario: "P-001", setor: "Clínica médica", leito: "12",
  admissao_em: "2026-07-18T14:00:00.000Z", cid_principal: "J18",
  motivo_internacao: "Pneumonia adquirida na comunidade",
};
const AGORA = new Date("2026-07-23T12:00:00.000Z");

const completo = (extra = {}) => ({
  ...montarRascunhoAlta({ episodio: EPISODIO }, AGORA),
  desfecho: "alta_melhorado",
  diagnostico_principal: "Pneumonia, resolvida",
  resumo_internacao: "Antibioticoterapia por 5 dias, boa evolução.",
  orientacoes: "Repouso relativo, hidratação.",
  condicao_alta: "Estável, afebril.",
  sinais_de_alerta: "Febre, falta de ar.",
  retorno_servico: "UBS Centro",
  ...extra,
});
const RECONCILIADO = { completa: true, pendentes: 0 };

describe("montarRascunhoAlta", () => {
  it("preenche o que o prontuário já sabe", () => {
    const r = montarRascunhoAlta({ episodio: EPISODIO }, AGORA);
    expect(r.prontuario).toBe("P-001");
    expect(r.dias_internacao).toBe(4);
    expect(r.cid_principal).toBe("J18");
    expect(r.alta_em).toBe(AGORA.toISOString());
  });

  it("NÃO inventa conteúdo clínico", () => {
    // Resumo, condição de alta e orientações nascem vazios de propósito:
    // texto pré-escrito seria assinado sem leitura.
    const r = montarRascunhoAlta({ episodio: EPISODIO }, AGORA);
    expect(r.resumo_internacao).toBe("");
    expect(r.condicao_alta).toBe("");
    expect(r.orientacoes).toBe("");
    expect(r.desfecho).toBe("");
  });

  it("o diagnóstico de ALTA não vem do de entrada — mas fica à vista", () => {
    const r = montarRascunhoAlta({
      episodio: EPISODIO,
      anamneses: [{ categoria: "medica", hipoteses_diagnosticas: "Pneumonia a esclarecer" }],
    }, AGORA);
    expect(r.diagnostico_principal).toBe("");
    expect(r.referencia.hipotese_admissao).toBe("Pneumonia a esclarecer");
    expect(r.referencia.cid_entrada).toBe("J18");
  });

  it("conta o que o médico não deveria contar à mão", () => {
    const r = montarRascunhoAlta({
      episodio: EPISODIO,
      evolucoes: [{ id: 1 }, { id: 2 }],
      administracoes: [{ id: 1 }],
      sinais: [{ id: 1, aferido_em: "2026-07-22T10:00:00Z", fc: 80 }],
      prescricoes: [{ id: 5, assinada_em: "2026-07-22T08:00:00Z" }],
      itens: [{ id: 9, prescricao_id: 5, descricao: "Ceftriaxona" }],
      linhasReconciliacao: [{ pendente: true }, { pendente: false }],
    }, AGORA);
    expect(r.contexto.evolucoes).toBe(2);
    expect(r.contexto.medicamentos_em_curso).toBe(1);
    expect(r.contexto.reconciliacao_pendentes).toBe(1);
    expect(r.contexto.ultima_afericao.fc).toBe(80);
  });

  it("sem episódio não há sumário", () => {
    expect(montarRascunhoAlta({}, AGORA)).toBe(null);
    expect(montarRascunhoAlta(undefined, AGORA)).toBe(null);
  });
});

describe("conferirSumario", () => {
  it("sumário completo e reconciliado pode ser assinado", () => {
    const faltas = conferirSumario(completo(), { reconciliacao: RECONCILIADO });
    expect(faltas.filter(f => f.nivel === "impede")).toEqual([]);
    expect(podeAssinarSumario(faltas)).toBe(true);
  });

  it("sem diagnóstico e sem resumo, não assina", () => {
    const faltas = conferirSumario(completo({ diagnostico_principal: "", resumo_internacao: "" }),
      { reconciliacao: RECONCILIADO });
    const campos = faltas.filter(f => f.nivel === "impede").map(f => f.campo);
    expect(campos).toContain("diagnostico_principal");
    expect(campos).toContain("resumo_internacao");
    expect(podeAssinarSumario(faltas)).toBe(false);
  });

  it("reconciliação de alta pendente impede a assinatura", () => {
    const faltas = conferirSumario(completo(), { reconciliacao: { completa: false, pendentes: 3 } });
    const rec = faltas.find(f => f.campo === "reconciliacao");
    expect(rec.nivel).toBe("impede");
    expect(rec.texto).toContain("3 medicamento");
  });

  it("reconciliação nem iniciada também impede", () => {
    const faltas = conferirSumario(completo(), {});
    expect(faltas.some(f => f.campo === "reconciliacao" && f.nivel === "impede")).toBe(true);
  });

  it("falta de seguimento avisa, mas não trava", () => {
    const faltas = conferirSumario(completo({ retorno_servico: "", retorno_em: null }),
      { reconciliacao: RECONCILIADO });
    expect(faltas.find(f => f.campo === "retorno").nivel).toBe("avisa");
    expect(podeAssinarSumario(faltas)).toBe(true);
  });

  it("óbito não exige receita, orientação nem seguimento", () => {
    const faltas = conferirSumario({
      ...completo({ desfecho: "obito", orientacoes: "", sinais_de_alerta: "", retorno_servico: "" }),
    }, {});   // sem reconciliação nenhuma
    const campos = faltas.filter(f => f.nivel === "impede").map(f => f.campo);
    expect(campos).not.toContain("orientacoes");
    expect(campos).not.toContain("reconciliacao");
  });

  it("óbito exige causa e hora", () => {
    const faltas = conferirSumario(completo({ desfecho: "obito", condicao_alta: "", alta_em: null }), {});
    const campos = faltas.filter(f => f.nivel === "impede").map(f => f.campo);
    expect(campos).toContain("condicao_alta");
    expect(campos).toContain("alta_em");
  });

  it("transferência exige dizer para onde", () => {
    const faltas = conferirSumario(completo({ desfecho: "transferencia", retorno_servico: "" }), {});
    expect(faltas.some(f => f.campo === "retorno_servico" && f.nivel === "impede")).toBe(true);
  });

  it("evasão não vira formulário de alta", () => {
    const faltas = conferirSumario(completo({ desfecho: "evasao", orientacoes: "" }), {});
    expect(faltas.some(f => f.campo === "orientacoes")).toBe(false);
  });

  it("sem desfecho, não assina", () => {
    expect(podeAssinarSumario(conferirSumario(completo({ desfecho: "" }), { reconciliacao: RECONCILIADO }))).toBe(false);
  });

  it("sumário inexistente devolve falta bloqueante em vez de estourar", () => {
    expect(podeAssinarSumario(conferirSumario(null, {}))).toBe(false);
  });
});

describe("textoSumario", () => {
  const meds = [{ descricao: "Losartana 50mg", dose: "50 mg", via: "VO", frequencia: "1x/dia" }];
  const suspensos = [{ descricao: "Metformina 850mg", motivo: "Iniciada insulina" }];
  const assinante = { profissional_nome: "Dra. Carla", conselho: "CRM", registro_conselho: "9876-RS" };

  it("traz as seções essenciais e a assinatura com conselho", () => {
    const t = textoSumario(completo(), { paciente: { iniciais: "A.B." }, assinante, medicamentos: meds, suspensos });
    expect(t).toContain("SUMÁRIO DE ALTA HOSPITALAR");
    expect(t).toContain("P-001");
    expect(t).toContain("RESUMO DA INTERNAÇÃO");
    expect(t).toContain("Losartana 50mg");
    expect(t).toContain("Dra. Carla");
    expect(t).toContain("CRM 9876-RS");
  });

  it("separa o que suspender do que continuar", () => {
    const t = textoSumario(completo(), { assinante, medicamentos: meds, suspensos });
    const iMeds = t.indexOf("MEDICAMENTOS EM USO APÓS A ALTA");
    const iStop = t.indexOf("MEDICAMENTOS SUSPENSOS");
    expect(iMeds).toBeGreaterThan(0);
    expect(iStop).toBeGreaterThan(iMeds);
    expect(t).toContain("Iniciada insulina");
  });

  it("seção vazia diz 'Não informado' em vez de sumir", () => {
    const t = textoSumario(completo({ procedimentos: "" }), { assinante });
    expect(t).toContain("PROCEDIMENTOS REALIZADOS");
    expect(t).toContain("Não informado.");
  });

  it("óbito não imprime receita nem orientações de casa", () => {
    const t = textoSumario(completo({ desfecho: "obito" }), { assinante, medicamentos: meds });
    expect(t).not.toContain("MEDICAMENTOS EM USO APÓS A ALTA");
    expect(t).not.toContain("SINAIS DE ALERTA");
  });

  it("avisa que a via impressa precisa de assinatura", () => {
    expect(textoSumario(completo(), { assinante })).toContain("requer assinatura");
  });

  it("sumário nulo devolve string vazia em vez de estourar", () => {
    expect(textoSumario(null, {})).toBe("");
  });
});

describe("catálogo de desfechos", () => {
  it("só as saídas para casa exigem receita", () => {
    const comReceita = Object.entries(DESFECHOS).filter(([, d]) => d.exigeReceita).map(([k]) => k);
    expect(comReceita.sort()).toEqual(["alta_inalterado", "alta_melhorado", "alta_pedido"]);
  });
});
