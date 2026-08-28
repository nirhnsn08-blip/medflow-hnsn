// ═══════════════════════════════════════════════════════════
// QUAL PROCEDIMENTO ESTE ATENDIMENTO PODE RECEBER
//
// 🔴 O DEFEITO: o catálogo não faltava — estava do outro lado de uma
// parede. `sigtap_procedimentos` tinha 219 procedimentos reais e as telas
// que escolhem procedimento liam só `at_procedimentos`, vazia no banco do
// hospital. Duas tabelas para a mesma coisa, e a que a pessoa enxerga é a
// vazia.
//
// ⚠️ E o que está carregado NÃO cobre tudo: os 219 são todos `via='aih'`.
// Uma alta de pronto-socorro sai por BPA, e oferecer AIH para ela seria
// pior que oferecer nada.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  viaDaEscolha, opcoesDeProcedimento, filtrarProcedimentos,
  avisoDeCatalogo, rotuloDaOpcao, VIAS_SUS,
} from "./escolha-procedimento.js";

// Espelha o que está no banco: tudo AIH, grupos 03 e 04.
const SIGTAP = [
  { codigo: "0301060088", nome: "DIAGNOSTICO E/OU ATENDIMENTO DE URGENCIA EM CLINICA MEDICA", via: "aih", competencia: "2026-08", valor_sh: 4134, valor_sp: 1088 },
  { codigo: "0303010037", nome: "TRATAMENTO DE OUTRAS DOENCAS BACTERIANAS", via: "aih", competencia: "2026-08", valor_sh: 103796 },
  { codigo: "0303010061", nome: "TRATAMENTO DE DOENCAS INFECCIOSAS INTESTINAIS", via: "aih", competencia: "2026-08" },
];
const SUS = { id: 1, tipo: "sus" };
const UNIMED = { id: 2, tipo: "convenio" };

describe("🔴 a via vem de `resolverVia`, não de uma segunda regra", () => {
  // A primeira versão deste arquivo tinha um `viaEsperada(desfecho)`
  // próprio. Era uma segunda implementação, pior, de uma regra que já
  // existia em montar-conta.js — e repetia um defeito que aquele arquivo
  // já havia consertado: olhar SÓ o desfecho.

  it("no PS: internação é AIH, o resto é BPA", () => {
    expect(viaDaEscolha({ convenio: SUS, desfecho: "internacao" })).toBe("aih");
    expect(viaDaEscolha({ convenio: SUS, desfecho: "alta" })).toBe("bpa");
    expect(viaDaEscolha({ convenio: SUS, desfecho: "obito" })).toBe("bpa");
  });

  it("🔴 internação ELETIVA é AIH mesmo SEM desfecho", () => {
    // Era exatamente isto que a regra própria errava: "a internação
    // eletiva era montada como BPA e fechada como AIH".
    expect(viaDaEscolha({ convenio: SUS, atendimento: { tipo_atendimento: "eletivo" } })).toBe("aih");
  });

  it("⚠️ na RECEPÇÃO não há desfecho — e a via sai assim mesmo", () => {
    // A chegada acontece antes de qualquer desenlace. O que existe é
    // convênio e tipo de atendimento.
    expect(viaDaEscolha({ convenio: SUS, atendimento: { tipo_atendimento: "ambulatorial" } })).toBe("bpa");
  });

  it("convênio e particular não são vias do SUS", () => {
    expect(viaDaEscolha({ convenio: UNIMED })).toBe("tiss");
    expect(viaDaEscolha({ convenio: { tipo: "particular" } })).toBe("direta");
    expect(VIAS_SUS).toEqual(["aih", "bpa", "apac"]);
  });

  it("sem convênio escolhido, `null` — que é 'ainda não dá para saber'", () => {
    expect(viaDaEscolha({ desfecho: "alta" })).toBeNull();
  });
});

describe("as duas fontes viram uma lista", () => {
  const hosp = [
    { codigo: "PROP-01", nome: "Consulta de urgência", tabela: "proprio", via_sus: "" },      // em branco = BPA
    { codigo: "0301060088", nome: "Urgência em clínica médica (nome da casa)", tabela: "sigtap", via_sus: "aih" },
  ];

  it("🔴 o SIGTAP passa a ser oferecido — era ele que a tela não enxergava", () => {
    const o = opcoesDeProcedimento({ procedimentos: [], sigtap: SIGTAP, desfecho: "internacao", convenio: SUS });
    expect(o).toHaveLength(3);
    expect(o.every(x => x.fonte === "sigtap")).toBe(true);
  });

  it("o catálogo do hospital vem PRIMEIRO", () => {
    // É curado, tem preço negociado, e é onde o faturista reconhece os nomes.
    const o = opcoesDeProcedimento({ procedimentos: hosp, sigtap: SIGTAP, desfecho: "internacao", convenio: SUS });
    expect(o[0].fonte).toBe("hospital");
  });

  it("🔴 código repetido nos dois: vale o do HOSPITAL", () => {
    // Mesma precedência que montar-conta.js já usa para o preço. Duas
    // fontes discordando sobre o mesmo código seria pior que uma só.
    const o = opcoesDeProcedimento({ procedimentos: hosp, sigtap: SIGTAP, desfecho: "internacao", convenio: SUS });
    const repetido = o.filter(x => x.codigo === "0301060088");
    expect(repetido).toHaveLength(1);
    expect(repetido[0].fonte).toBe("hospital");
    expect(repetido[0].nome).toMatch(/nome da casa/);
  });
});

describe("🔴 a via filtra — senão a conta volta rejeitada", () => {
  it("numa ALTA, os 219 de AIH não aparecem", () => {
    // Oferecer código de internação para episódio que não internou é pior
    // que não oferecer nada.
    const o = opcoesDeProcedimento({ procedimentos: [], sigtap: SIGTAP, desfecho: "alta", convenio: SUS });
    expect(o).toEqual([]);
  });

  it("numa INTERNAÇÃO, aparecem", () => {
    const o = opcoesDeProcedimento({ procedimentos: [], sigtap: SIGTAP, desfecho: "internacao", convenio: SUS });
    expect(o).toHaveLength(3);
  });

  it("via_sus em branco no catálogo do hospital conta como BPA", () => {
    // É o que a própria tela de Tabelas diz: "em branco: sai por BPA".
    const hosp = [{ codigo: "PROP-01", nome: "Consulta", via_sus: "" }];
    expect(opcoesDeProcedimento({ procedimentos: hosp, convenio: SUS, desfecho: "alta" })).toHaveLength(1);
    expect(opcoesDeProcedimento({ procedimentos: hosp, convenio: SUS, desfecho: "internacao" })).toEqual([]);
  });

  it("⚠️ sem convênio escolhido, NÃO filtra — oferece tudo, com a fonte à vista", () => {
    // Filtrar por um palpite esconderia justamente o que a pessoa precisa
    // ver para decidir.
    const hosp = [{ codigo: "PROP-01", nome: "Consulta", via_sus: "" }];
    const o = opcoesDeProcedimento({ procedimentos: hosp, sigtap: SIGTAP, desfecho: "alta" });
    expect(o).toHaveLength(4);   // 1 do hospital (BPA) + os 3 de AIH
  });
});

describe("⚠️ SIGTAP é tabela do SUS", () => {
  it("num convênio, o SIGTAP NÃO é oferecido", () => {
    // O convênio cobra por TUSS ou tabela própria e não reconhece código do SUS.
    const o = opcoesDeProcedimento({ procedimentos: [], sigtap: SIGTAP, desfecho: "internacao", convenio: UNIMED });
    expect(o).toEqual([]);
  });

  it("sem convênio escolhido ainda, oferece — não dá para saber", () => {
    const o = opcoesDeProcedimento({ procedimentos: [], sigtap: SIGTAP, desfecho: "internacao" });
    expect(o).toHaveLength(3);
  });
});

describe("🔴 o aviso distingue 'não tenho' de 'não serve'", () => {
  it("catálogo carregado, mas nenhum da via deste atendimento", () => {
    // O caso real: 219 linhas de AIH e uma alta que sai por BPA. Dizer
    // "nenhum cadastrado" mandaria alguém cadastrar o que já existe.
    const a = avisoDeCatalogo({ opcoes: [], sigtap: SIGTAP, desfecho: "alta", convenio: SUS });
    expect(a).toMatch(/Há catálogo carregado/);
    expect(a).toMatch(/BPA \(produção ambulatorial\)/);
    expect(a).toMatch(/voltar rejeitada/);
  });

  it("nada em lugar nenhum diz outra coisa", () => {
    const a = avisoDeCatalogo({ opcoes: [], procedimentos: [], sigtap: [], desfecho: "alta" });
    expect(a).toMatch(/Nenhum procedimento cadastrado/);
    expect(a).not.toMatch(/Há catálogo carregado/);
  });

  it("convênio sem catálogo próprio explica que o SIGTAP não serve", () => {
    const a = avisoDeCatalogo({ opcoes: [], procedimentos: [], sigtap: SIGTAP, desfecho: "internacao", convenio: UNIMED });
    expect(a).toMatch(/TISS \(convênio\)/);
    expect(a).toMatch(/não é por tabela do SUS/);
  });

  it("e o particular diz 'particular', não 'TISS'", () => {
    const a = avisoDeCatalogo({ opcoes: [], procedimentos: [], sigtap: SIGTAP, convenio: { tipo: "particular" } });
    expect(a).toMatch(/sai por particular/);
  });

  it("e CALA quando há o que oferecer", () => {
    const o = opcoesDeProcedimento({ sigtap: SIGTAP, desfecho: "internacao", convenio: SUS });
    expect(avisoDeCatalogo({ opcoes: o, sigtap: SIGTAP, desfecho: "internacao", convenio: SUS })).toBeNull();
  });
});

describe("achar entre centenas", () => {
  const o = opcoesDeProcedimento({ sigtap: SIGTAP, desfecho: "internacao", convenio: SUS });

  it("filtra por nome e por código", () => {
    expect(filtrarProcedimentos(o, "intestinais")).toHaveLength(1);
    expect(filtrarProcedimentos(o, "0303010037")).toHaveLength(1);
    expect(filtrarProcedimentos(o, "03030100")).toHaveLength(2);
  });

  it("sem busca, devolve tudo", () => {
    expect(filtrarProcedimentos(o, "")).toHaveLength(3);
    expect(filtrarProcedimentos(o)).toHaveLength(3);
  });

  it("o rótulo mostra DE ONDE veio", () => {
    // Quem escolhe precisa saber se está pegando da tabela oficial ou do
    // catálogo da casa — os dois têm consequências diferentes na conta.
    expect(rotuloDaOpcao(o[0])).toMatch(/· SIGTAP 2026-08$/);
    expect(rotuloDaOpcao({ codigo: "X", nome: "Y", fonte: "hospital" })).toBe("X — Y");
  });
});
