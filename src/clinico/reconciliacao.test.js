// Testes da reconciliação medicamentosa.
//
// O que está sendo protegido aqui é uma afirmação clínica: "nenhum
// medicamento de uso domiciliar desaparece em silêncio". Cada teste abaixo
// descreve uma forma conhecida de o remédio sumir na transição de cuidado.

import { describe, it, expect } from "vitest";
import {
  chaveMedicamento, casarListas, doseNumero, divergencias, vigentesDeUso, freqPorDia,
  negaUsoDomiciliar, situacaoUsoDomiciliar,
  analisarReconciliacao, resumoReconciliacao, listaDeAlta, suspensosNaAlta,
  DECISOES,
} from "./reconciliacao.js";

const losartana = { descricao: "Losartana 50mg", substancia: "losartana", dose: "50 mg", dose_valor: 50, dose_unidade: "mg", via: "VO", frequencia_dia: 1, frequencia: "1x/dia" };
const metformina = { descricao: "Metformina 850mg", substancia: "metformina", dose_valor: 850, dose_unidade: "mg", via: "VO", frequencia_dia: 2 };
const dipirona = { descricao: "Dipirona 500mg", medicamento_id: 3, dose_valor: 500, dose_unidade: "mg", via: "EV", frequencia_dia: 4 };

describe("chaveMedicamento", () => {
  it("prefere o id do catálogo", () => {
    expect(chaveMedicamento({ medicamento_id: 7, substancia: "outra" })).toBe("id:7");
  });
  it("cai para a substância quando não há id", () => {
    expect(chaveMedicamento(losartana)).toBe("pa:losartana");
  });
  it("cai para a primeira palavra da descrição quando não há nem substância", () => {
    expect(chaveMedicamento({ descricao: "Omeprazol 20mg" })).toBe("txt:omeprazol");
  });
  it("ignora acento e caixa (o mesmo remédio digitado de dois jeitos)", () => {
    expect(chaveMedicamento({ descricao: "ÁCIDO fólico" }))
      .toBe(chaveMedicamento({ descricao: "acido folico 5mg" }));
  });
  it("devolve null quando não há como identificar", () => {
    expect(chaveMedicamento({ descricao: "" })).toBe(null);
    expect(chaveMedicamento(null)).toBe(null);
  });
});

describe("uso domiciliar — 'não usa nada' não é o mesmo que 'ninguém perguntou'", () => {
  it("lista vazia é SEM REGISTRO", () => {
    expect(situacaoUsoDomiciliar([]).estado).toBe("sem_registro");
    expect(negaUsoDomiciliar([])).toBe(false);
  });

  it("declaração explícita vira NENHUM", () => {
    const lista = [{ id: 1, sem_uso: true, descricao: "Nega uso de medicamentos" }];
    expect(situacaoUsoDomiciliar(lista).estado).toBe("nenhum");
    expect(negaUsoDomiciliar(lista)).toBe(true);
  });

  it("a declaração não entra na lista de medicamentos a reconciliar", () => {
    const lista = [{ id: 1, sem_uso: true }, { id: 2, descricao: "Losartana" }];
    expect(vigentesDeUso(lista).map(m => m.id)).toEqual([2]);
    expect(situacaoUsoDomiciliar(lista).estado).toBe("com_lista");
  });

  it("declaração corrigida depois deixa de valer", () => {
    const lista = [{ id: 1, sem_uso: true }, { id: 2, sem_uso: false, descricao: "Losartana", corrige_id: 1 }];
    expect(negaUsoDomiciliar(lista)).toBe(false);
  });
});

describe("vigentesDeUso", () => {
  it("esconde o registro que foi corrigido por outro", () => {
    const lista = [{ id: 1, descricao: "Losartana 25mg" }, { id: 2, descricao: "Losartana 50mg", corrige_id: 1 }];
    expect(vigentesDeUso(lista).map(m => m.id)).toEqual([2]);
  });
  it("esconde o suspenso, mantém o ativo", () => {
    const lista = [{ id: 1, situacao: "ativa" }, { id: 2, situacao: "suspensa" }];
    expect(vigentesDeUso(lista).map(m => m.id)).toEqual([1]);
  });
  it("sem situação, assume ativo (o registro antigo não some da tela)", () => {
    expect(vigentesDeUso([{ id: 1 }])).toHaveLength(1);
  });
});

describe("freqPorDia", () => {
  it("entende intervalo", () => {
    expect(freqPorDia("12/12h")).toBe(2);
    expect(freqPorDia("8/8h")).toBe(3);
    expect(freqPorDia("de 8 em 8 horas")).toBe(3);
  });
  it("entende vezes ao dia", () => {
    expect(freqPorDia("3x ao dia")).toBe(3);
    expect(freqPorDia("1x/dia")).toBe(1);
    expect(freqPorDia("uma vez ao dia")).toBe(1);
  });
  it("devolve null no que não entende — null não gera alerta falso", () => {
    expect(freqPorDia("quando precisar")).toBe(null);
    expect(freqPorDia("")).toBe(null);
    expect(freqPorDia(null)).toBe(null);
  });
  it("não inventa frequência com intervalo que não divide o dia", () => {
    expect(freqPorDia("5/5h")).toBe(null);
  });
});

describe("casarListas", () => {
  it("casa o que é o mesmo e separa o que não é", () => {
    const r = casarListas([losartana, metformina], [{ ...losartana, dose_valor: 25 }, dipirona]);
    expect(r.pares).toHaveLength(1);
    expect(r.pares[0].domiciliar.substancia).toBe("losartana");
    expect(r.soDomiciliar.map(x => x.substancia)).toEqual(["metformina"]);
    expect(r.soHospitalar.map(x => x.descricao)).toEqual(["Dipirona 500mg"]);
  });

  it("não casa o mesmo item hospitalar duas vezes", () => {
    // Duas linhas de losartana em casa e uma no hospital: a segunda linha
    // domiciliar continua exposta, em vez de ser dada como resolvida.
    const r = casarListas([losartana, { ...losartana }], [losartana]);
    expect(r.pares).toHaveLength(1);
    expect(r.soDomiciliar).toHaveLength(1);
  });
});

describe("doseNumero", () => {
  it("lê número escrito de vários jeitos", () => {
    expect(doseNumero("500 mg")).toBe(500);
    expect(doseNumero("500mg")).toBe(500);
    expect(doseNumero("0,5 g")).toBe(0.5);
    expect(doseNumero(250)).toBe(250);
  });
  it("devolve null para o que não tem número", () => {
    expect(doseNumero("")).toBe(null);
    expect(doseNumero(null)).toBe(null);
    expect(doseNumero("conforme aceitação")).toBe(null);
  });
});

describe("divergencias", () => {
  it("aponta dose diferente na mesma unidade", () => {
    const d = divergencias(losartana, { ...losartana, dose_valor: 25, dose: "25 mg" });
    expect(d.map(x => x.tipo)).toEqual(["dose_divergente"]);
  });

  it("NÃO compara doses em unidades diferentes", () => {
    // 500 mg e 0,5 g são a mesma coisa. Um alerta aqui seria falso, e falso
    // alerta é o que ensina a equipe a ignorar alerta.
    const d = divergencias(
      { dose_valor: 500, dose_unidade: "mg" },
      { dose_valor: 0.5, dose_unidade: "g" });
    expect(d).toEqual([]);
  });

  it("aponta via e frequência diferentes", () => {
    const d = divergencias(losartana, { ...losartana, via: "EV", frequencia_dia: 2 });
    expect(d.map(x => x.tipo).sort()).toEqual(["frequencia_divergente", "via_divergente"]);
  });

  it("campo em branco de um dos lados não vira divergência", () => {
    expect(divergencias({ via: "VO" }, { via: "" })).toEqual([]);
    expect(divergencias({ dose_valor: 50 }, {})).toEqual([]);
  });
});

describe("analisarReconciliacao — admissão", () => {
  it("medicamento de casa que não foi prescrito e ninguém avaliou é OMISSÃO grave", () => {
    const linhas = analisarReconciliacao({ domiciliares: [losartana], hospitalares: [dipirona] });
    const dela = linhas.find(l => l.item.substancia === "losartana");
    expect(dela.origem).toBe("domiciliar");
    expect(dela.pendente).toBe(true);
    expect(dela.discrepancias[0].tipo).toBe("omissao");
    expect(dela.discrepancias[0].gravidade).toBe("alta");
  });

  it("suspender COM justificativa deixa de ser discrepância", () => {
    const linhas = analisarReconciliacao({
      domiciliares: [losartana], hospitalares: [],
      decisoes: { "pa:losartana": { decisao: "suspender", justificativa: "Hipotensão na admissão" } },
    });
    expect(linhas[0].discrepancias).toEqual([]);
    expect(linhas[0].pendente).toBe(false);
  });

  it("suspender SEM justificativa continua sendo apontado", () => {
    const linhas = analisarReconciliacao({
      domiciliares: [losartana], hospitalares: [],
      decisoes: { "pa:losartana": { decisao: "suspender", justificativa: "  " } },
    });
    expect(linhas[0].discrepancias.map(d => d.tipo)).toEqual(["sem_justificativa"]);
  });

  it("medicamento iniciado no hospital não exige decisão na admissão", () => {
    // Prescrever já É a decisão. Cobrar de novo aqui só produziria ruído.
    const linhas = analisarReconciliacao({ domiciliares: [], hospitalares: [dipirona] });
    expect(linhas[0].origem).toBe("hospitalar");
    expect(linhas[0].discrepancias).toEqual([]);
  });

  it("mantido com dose diferente da de casa é apontado", () => {
    const linhas = analisarReconciliacao({
      domiciliares: [losartana], hospitalares: [{ ...losartana, dose_valor: 25, dose: "25 mg" }],
      decisoes: { "pa:losartana": { decisao: "manter" } },
    });
    expect(linhas[0].discrepancias.map(d => d.tipo)).toEqual(["dose_divergente"]);
  });

  it("ALTERAR a dose não gera divergência — a diferença é o efeito pretendido", () => {
    const linhas = analisarReconciliacao({
      domiciliares: [losartana], hospitalares: [{ ...losartana, dose_valor: 25 }],
      decisoes: { "pa:losartana": { decisao: "alterar", justificativa: "Função renal" } },
    });
    expect(linhas[0].discrepancias).toEqual([]);
  });

  it("mesmo remédio duas vezes na lista de casa é duplicidade", () => {
    const linhas = analisarReconciliacao({
      domiciliares: [losartana, { ...losartana, descricao: "Losartana potássica" }],
      hospitalares: [],
      decisoes: { "pa:losartana": { decisao: "manter" } },
    });
    expect(linhas.every(l => l.discrepancias.some(d => d.tipo === "duplicidade"))).toBe(true);
  });
});

describe("analisarReconciliacao — alta", () => {
  it("na alta, o medicamento do hospital TAMBÉM precisa de decisão", () => {
    const linhas = analisarReconciliacao({ domiciliares: [], hospitalares: [dipirona], momento: "alta" });
    expect(linhas[0].pendente).toBe(true);
    expect(linhas[0].discrepancias[0].tipo).toBe("sem_decisao");
  });

  it("retomar o que foi suspenso na internação é decisão própria", () => {
    const linhas = analisarReconciliacao({
      domiciliares: [losartana], hospitalares: [], momento: "alta",
      decisoes: { "pa:losartana": { decisao: "reiniciar" } },
    });
    expect(linhas[0].discrepancias).toEqual([]);
    expect(linhas[0].levaParaCasa).toBe(true);
  });
});

describe("resumoReconciliacao", () => {
  it("conta pendentes, discrepâncias e graves", () => {
    const linhas = analisarReconciliacao({
      domiciliares: [losartana, metformina], hospitalares: [dipirona],
      decisoes: { "pa:losartana": { decisao: "manter" } },
    });
    const r = resumoReconciliacao(linhas);
    expect(r.total).toBe(3);
    // Só a metformina está pendente: a losartana foi decidida e a dipirona
    // é do hospital — na admissão, prescrever já é a decisão.
    expect(r.pendentes).toBe(1);
    expect(r.graves).toBe(1);
    expect(r.completa).toBe(false);
  });

  it("item prescrito no hospital não impede a admissão de ficar completa", () => {
    const linhas = analisarReconciliacao({
      domiciliares: [losartana], hospitalares: [dipirona],
      decisoes: { "pa:losartana": { decisao: "manter" } },
    });
    const r = resumoReconciliacao(linhas);
    expect(r.total).toBe(2);
    expect(r.aDecidir).toBe(1);
    expect(r.decididas).toBe(1);
    expect(r.completa).toBe(true);
  });

  it("completa quando toda linha tem decisão, mesmo havendo divergência justificada", () => {
    const linhas = analisarReconciliacao({
      domiciliares: [losartana], hospitalares: [{ ...losartana, dose_valor: 25 }],
      decisoes: { "pa:losartana": { decisao: "alterar", justificativa: "Ajuste renal" } },
    });
    expect(resumoReconciliacao(linhas).completa).toBe(true);
  });

  it("reconciliação sobre lista que ninguém levantou NÃO é completa", () => {
    // Só itens do hospital, nenhum domiciliar e nenhuma negativa: não houve
    // entrevista, então não há o que reconciliar — mesmo sem pendências.
    const linhas = analisarReconciliacao({ domiciliares: [], hospitalares: [dipirona] });
    expect(resumoReconciliacao(linhas, { usoDomiciliarLevantado: false }).completa).toBe(false);
  });

  it("negativa explícita de uso domiciliar permite concluir", () => {
    const linhas = analisarReconciliacao({ domiciliares: [], hospitalares: [dipirona] });
    expect(resumoReconciliacao(linhas, { usoDomiciliarLevantado: true }).completa).toBe(true);
  });

  it("lista vazia não é lista completa", () => {
    // Paciente sem nenhum medicamento é possível; "reconciliação concluída"
    // sem nada dentro é o que não pode passar por trabalho feito.
    const r = resumoReconciliacao([]);
    expect(r.completa).toBe(false);
    expect(r.vazia).toBe(true);
  });
});

describe("listaDeAlta e suspensosNaAlta", () => {
  const linhas = analisarReconciliacao({
    domiciliares: [losartana, metformina],
    hospitalares: [dipirona],
    momento: "alta",
    decisoes: {
      "pa:losartana":  { decisao: "manter" },
      "pa:metformina": { decisao: "suspender", justificativa: "Iniciar insulina" },
      "id:3":          { decisao: "novo" },
    },
  });

  it("leva para casa só o que foi decidido levar", () => {
    const leva = listaDeAlta(linhas).map(m => m.descricao);
    expect(leva).toEqual(["Dipirona 500mg", "Losartana 50mg"]);
  });

  it("separa o que o paciente deve PARAR de tomar, com o motivo", () => {
    const parar = suspensosNaAlta(linhas);
    expect(parar).toHaveLength(1);
    expect(parar[0].descricao).toContain("Metformina");
    expect(parar[0].motivo).toBe("Iniciar insulina");
  });

  it("retomada usa a posologia de casa, não a do hospital", () => {
    const l = analisarReconciliacao({
      domiciliares: [{ ...losartana, dose: "50 mg" }],
      hospitalares: [{ ...losartana, dose: "25 mg", dose_valor: 25 }],
      momento: "alta",
      decisoes: { "pa:losartana": { decisao: "reiniciar" } },
    });
    expect(listaDeAlta(l)[0].dose).toBe("50 mg");
  });
});

describe("catálogo de decisões", () => {
  it("toda decisão diz se leva para casa e se exige justificativa", () => {
    for (const [k, d] of Object.entries(DECISOES)) {
      expect(typeof d.levaParaCasa, k).toBe("boolean");
      expect(typeof d.exigeJustificativa, k).toBe("boolean");
    }
  });
  it("suspender é a única decisão que não leva para casa", () => {
    const naoLevam = Object.entries(DECISOES).filter(([, d]) => !d.levaParaCasa).map(([k]) => k);
    expect(naoLevam).toEqual(["suspender"]);
  });
});
