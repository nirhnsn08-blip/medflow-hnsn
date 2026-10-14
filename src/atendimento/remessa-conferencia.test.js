// ═══════════════════════════════════════════════════════════
// O QUE O SUS VAI REJEITAR
//
// 🔴 MEDIDO ANTES DE ESCREVER (14/10/2026): `raca_cor` e
// `end_municipio_ibge` são lidos ZERO vezes em todo `src/atendimento/`.
// São obrigatórios na AIH e no BPA-I. O hospital coleta os dois no
// cadastro, fecha a conta, transmite — e descobre no mês seguinte, quando
// o paciente já foi embora.
//
// ⚠️ O QUE ESTES TESTES NÃO PROVAM: que o arquivo será aceito. O sistema
// não gera o arquivo de remessa (recusa deliberada, documentada em
// `faturamento.js`: layout versionado, muda por portaria, passa por
// homologação). O que se prova aqui é o contrário — que as contas que
// SERÃO recusadas por falta de campo aparecem antes de alguém transmitir.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  pendenciasDaConta, conferirRemessa, resumoDaConferencia,
  exigenciasDaVia, ibgeValido, ONDE, REJEITA, RISCO,
} from "./remessa-conferencia.js";
import { FALHA } from "../util/leitura.js";

// 🔴 CNS TIRADO DA PRÓPRIA `validarCNS`, não inventado.
//
// A primeira versão deste arquivo usava um número que eu supus válido — e
// os quatro testes do caminho limpo quebraram todos pela mesma causa: o
// dígito não fechava. Fixture de documento é a classe de dado que NUNCA se
// chuta; quem sabe se o número é válido é a função que valida.
const CNS_OK = "898000000000002";

const PACIENTE = {
  prontuario: "T9016", cns: CNS_OK, raca_cor: "parda",
  end_municipio_ibge: "4106902", data_nascimento: "1980-05-10",
  sexo: "F", nome_mae: "Maria Souza",
};
const CONTA = { id: 1, prontuario: "T9016", atendimento_id: 7, via: "bpa", status: "fechada" };
const ITEM = { conta_id: 1, codigo: "0301010072", executante: "Dr. X", executante_cbo: "225125" };

const chaves = l => l.map(x => x.chave);

// ── O CAMINHO LIMPO ─────────────────────────────────────────
describe("conta completa não acusa nada", () => {
  it("BPA com tudo preenchido", () => {
    expect(pendenciasDaConta({ conta: CONTA, paciente: PACIENTE, itens: [ITEM] })).toEqual([]);
  });

  it("AIH com tudo, inclusive nome da mãe e CID", () => {
    expect(pendenciasDaConta({
      conta: { ...CONTA, via: "aih" }, paciente: PACIENTE,
      atendimento: { id: 7, cid: "I21.0" }, itens: [ITEM],
    })).toEqual([]);
  });
});

// ── CNS ─────────────────────────────────────────────────────
describe("🔴 CNS: presente não é o mesmo que válido", () => {
  it("sem CNS", () => {
    const r = pendenciasDaConta({ conta: CONTA, paciente: { ...PACIENTE, cns: "" }, itens: [ITEM] });
    expect(chaves(r)).toContain("sem_cns");
    expect(r[0].severidade).toBe(REJEITA);
    expect(r[0].onde).toBe(ONDE.CADASTRO);
  });

  it("🔴 CNS digitado errado é PEGO — `conferirFicha` só olhava a presença", () => {
    // Um CNS com dígito errado passa pela conferência da ficha e é
    // rejeitado no processamento, um mês depois.
    const r = pendenciasDaConta({ conta: CONTA, paciente: { ...PACIENTE, cns: "111111111111111" }, itens: [ITEM] });
    expect(chaves(r)).toContain("cns_invalido");
    expect(r.find(x => x.chave === "cns_invalido").texto).toMatch(/dígitos verificadores/);
  });

  it("não acusa as duas coisas ao mesmo tempo", () => {
    const r = pendenciasDaConta({ conta: CONTA, paciente: { ...PACIENTE, cns: "" }, itens: [ITEM] });
    expect(chaves(r)).not.toContain("cns_invalido");
  });
});

// ── OS DOIS CAMPOS QUE NINGUÉM LIA ──────────────────────────
describe("🔴 raça/cor e município IBGE — zero leitores no faturamento", () => {
  it("sem raça/cor rejeita, e diz por que não dá para deixar para depois", () => {
    const r = pendenciasDaConta({ conta: CONTA, paciente: { ...PACIENTE, raca_cor: "" }, itens: [ITEM] });
    const x = r.find(y => y.chave === "sem_raca");
    expect(x.severidade).toBe(REJEITA);
    expect(x.texto).toMatch(/depois da alta/);
  });

  it("sem IBGE rejeita", () => {
    const r = pendenciasDaConta({ conta: CONTA, paciente: { ...PACIENTE, end_municipio_ibge: "" }, itens: [ITEM] });
    expect(chaves(r)).toContain("sem_ibge");
  });

  it("🔴 IBGE com SEIS dígitos é pego — é o engano comum", () => {
    // Seis é o código sem o dígito verificador, e a tabela do IBGE circula
    // das duas formas. Seis num campo de sete não dá erro em lugar nenhum;
    // dá registro rejeitado.
    const r = pendenciasDaConta({ conta: CONTA, paciente: { ...PACIENTE, end_municipio_ibge: "410690" }, itens: [ITEM] });
    const x = r.find(y => y.chave === "ibge_invalido");
    expect(x).toBeTruthy();
    expect(x.texto).toMatch(/d[ií]gito verificador/i);
  });

  it("ibgeValido exige exatamente 7 dígitos", () => {
    expect(ibgeValido("4106902")).toBe(true);
    expect(ibgeValido("410690")).toBe(false);
    expect(ibgeValido("41069020")).toBe(false);
    expect(ibgeValido("41069O2")).toBe(false);
    expect(ibgeValido("")).toBe(false);
    expect(ibgeValido(null)).toBe(false);
  });
});

// ── POR VIA ─────────────────────────────────────────────────
describe("🔴 a AIH exige mais que o BPA — e avisar errado é pior que não avisar", () => {
  it("BPA não cobra nome da mãe nem CID", () => {
    // Acusar falta de CID numa consulta ambulatorial faria o aviso acender
    // em todo lugar — e aviso que acende errado se aprende a ignorar.
    const r = pendenciasDaConta({
      conta: CONTA, paciente: { ...PACIENTE, nome_mae: "" }, atendimento: {}, itens: [ITEM],
    });
    expect(chaves(r)).not.toContain("sem_nome_mae");
    expect(chaves(r)).not.toContain("sem_cid");
  });

  it("AIH cobra os dois", () => {
    const r = pendenciasDaConta({
      conta: { ...CONTA, via: "aih" }, paciente: { ...PACIENTE, nome_mae: "" },
      atendimento: {}, itens: [ITEM],
    });
    expect(chaves(r)).toContain("sem_nome_mae");
    expect(chaves(r)).toContain("sem_cid");
  });

  it("APAC cobra CID mas não nome da mãe", () => {
    const r = pendenciasDaConta({
      conta: { ...CONTA, via: "apac" }, paciente: { ...PACIENTE, nome_mae: "" },
      atendimento: {}, itens: [ITEM],
    });
    expect(chaves(r)).toContain("sem_cid");
    expect(chaves(r)).not.toContain("sem_nome_mae");
  });

  it("via desconhecida cai no mínimo comum, não em zero exigência", () => {
    // Uma via nova no banco não pode fazer a conferência parar de conferir.
    expect(exigenciasDaVia("tiss").cns).toBe(true);
    expect(exigenciasDaVia(null).raca).toBe(true);
    expect(exigenciasDaVia("").ibge).toBe(true);
  });
});

// ── OS ITENS ────────────────────────────────────────────────
describe("os itens da conta", () => {
  it("🔴 diz QUANTOS itens estão sem CBO, não só que falta", () => {
    // "Falta CBO" numa conta de dez itens manda a faturista reabrir tudo.
    const r = pendenciasDaConta({
      conta: CONTA, paciente: PACIENTE,
      itens: [ITEM, { ...ITEM, executante_cbo: "" }, { ...ITEM, executante_cbo: "" }],
    });
    const x = r.find(y => y.chave === "sem_cbo");
    expect(x.texto).toMatch(/2 de 3/);
    expect(x.onde).toBe(ONDE.CONTA);
  });

  it("item sem código SIGTAP rejeita", () => {
    const r = pendenciasDaConta({ conta: CONTA, paciente: PACIENTE, itens: [{ ...ITEM, codigo: "" }] });
    expect(chaves(r)).toContain("sem_codigo");
  });

  it("⚠️ executante sem nome é RISCO, não rejeição", () => {
    // Não derruba o registro; é o que a auditoria pede. Tratar igual faria
    // as quinze pendências terem a mesma pressa.
    const r = pendenciasDaConta({ conta: CONTA, paciente: PACIENTE, itens: [{ ...ITEM, executante: "" }] });
    const x = r.find(y => y.chave === "sem_executante");
    expect(x.severidade).toBe(RISCO);
  });

  it("🔴 conta fechada SEM item nenhum é rejeição", () => {
    // Produção que não existe. Sem esta regra, a conta vazia passaria
    // limpa — nenhum item para reclamar.
    const r = pendenciasDaConta({ conta: CONTA, paciente: PACIENTE, itens: [] });
    expect(chaves(r)).toContain("conta_vazia");
  });
});

// ── O PACIENTE QUE NÃO CASOU ────────────────────────────────
describe("🔴 conta sem cadastro casado NÃO passa limpa", () => {
  it("acusa o prontuário que não achou", () => {
    // "Nada a apontar" seria a resposta mais errada possível aqui: é
    // justamente a conta de que não se sabe nada.
    const r = pendenciasDaConta({ conta: CONTA, paciente: null, itens: [ITEM] });
    expect(chaves(r)).toEqual(["sem_paciente"]);
    expect(r[0].texto).toMatch(/T9016/);
    expect(r[0].severidade).toBe(REJEITA);
  });

  it("prontuário em branco também é dito", () => {
    const r = pendenciasDaConta({ conta: { ...CONTA, prontuario: "" }, paciente: null });
    expect(r[0].texto).toMatch(/em branco/);
  });

  it("sem conta nenhuma devolve lista vazia, e não estoura", () => {
    expect(pendenciasDaConta({})).toEqual([]);
    expect(pendenciasDaConta()).toEqual([]);
  });
});

// ── A REMESSA INTEIRA ───────────────────────────────────────
describe("a conferência da remessa", () => {
  const contas = [
    { id: 1, prontuario: "A", atendimento_id: 1, via: "bpa" },
    { id: 2, prontuario: "B", atendimento_id: 2, via: "bpa" },
    { id: 3, prontuario: "C", atendimento_id: 3, via: "bpa" },
  ];
  const pacientes = [
    { ...PACIENTE, prontuario: "A" },
    { ...PACIENTE, prontuario: "B", raca_cor: "" },
    { ...PACIENTE, prontuario: "C", raca_cor: "", end_municipio_ibge: "" },
  ];
  const itens = [
    { ...ITEM, conta_id: 1 }, { ...ITEM, conta_id: 2 }, { ...ITEM, conta_id: 3 },
  ];

  it("separa o que será recusado do resto", () => {
    const r = conferirRemessa({ contas, pacientes, itens });
    expect(r.total).toBe(3);
    expect(r.bloqueadas).toHaveLength(2);
    expect(r.semMotivoConhecido).toBe(1);
  });

  it("🔴 agrupa POR MOTIVO — é assim que se conserta", () => {
    // Trinta contas sem raça/cor é UMA tarefa; trinta linhas "conta #X tem
    // pendência" são trinta.
    const r = conferirRemessa({ contas, pacientes, itens });
    const raca = r.motivos.find(m => m.chave === "sem_raca");
    expect(raca.contas).toHaveLength(2);
    expect(r.motivos[0].contas.length).toBeGreaterThanOrEqual(r.motivos[1].contas.length);
  });

  it("🔴 qualquer leitura que falhou devolve null", () => {
    // "Nenhuma pendência" não pode sair de uma lista que não desceu — seria
    // o sistema liberando a transmissão porque não conseguiu olhar.
    expect(conferirRemessa({ contas: FALHA, pacientes, itens })).toBeNull();
    expect(conferirRemessa({ contas, pacientes: FALHA, itens })).toBeNull();
    expect(conferirRemessa({ contas, pacientes, itens: FALHA })).toBeNull();
    expect(conferirRemessa({ contas, pacientes, atendimentos: FALHA, itens })).toBeNull();
  });

  it("itens são casados por conta, não misturados", () => {
    const r = conferirRemessa({
      contas, pacientes: [{ ...PACIENTE, prontuario: "A" }, { ...PACIENTE, prontuario: "B" }, { ...PACIENTE, prontuario: "C" }],
      itens: [{ ...ITEM, conta_id: 1, executante_cbo: "" }, { ...ITEM, conta_id: 2 }, { ...ITEM, conta_id: 3 }],
    });
    expect(r.motivos.find(m => m.chave === "sem_cbo").contas.map(c => c.id)).toEqual([1]);
  });
});

// ── A FRASE ─────────────────────────────────────────────────
describe("🔴 o resumo NUNCA promete aceitação", () => {
  it("sem pendência, diz que não é garantia", () => {
    // O sistema não tem o layout do arquivo. O que ele sabe é o que
    // rejeita — e dizer "pronto para transmitir" seria prometer o que não
    // apurou.
    const r = conferirRemessa({
      contas: [CONTA], pacientes: [PACIENTE], itens: [ITEM],
    });
    const t = resumoDaConferencia(r);
    expect(t).toMatch(/não é garantia de aceitação/i);
    expect(t).not.toMatch(/pronto para transmitir/i);
  });

  it("com pendência, diz quantas e por quê corrigir antes", () => {
    const r = conferirRemessa({
      contas: [CONTA], pacientes: [{ ...PACIENTE, raca_cor: "" }], itens: [ITEM],
    });
    expect(resumoDaConferencia(r)).toMatch(/1 de 1 conta será recusada/);
    expect(resumoDaConferencia(r)).toMatch(/voltar no mês seguinte/);
  });

  it("leitura falhada tem frase própria, e não a tranquilizadora", () => {
    const t = resumoDaConferencia(null);
    expect(t).toMatch(/INCOMPLETA/);
    expect(t).not.toMatch(/sem motivo conhecido/);
  });

  it("seleção vazia não finge estar tudo certo", () => {
    expect(resumoDaConferencia({ total: 0, bloqueadas: [], motivos: [] }))
      .toMatch(/Nenhuma conta/);
  });
});
