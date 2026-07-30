// ═══════════════════════════════════════════════════════════
// A CONTA DO ATENDIMENTO
//
// Cinco coisas aqui são regra, não detalhe:
//
//   1. SUS NÃO COBRA DO PACIENTE — em nenhuma hipótese, por nenhum item.
//      É o único erro deste arquivo que cai sobre a PESSOA, e não sobre o
//      hospital. Por isso é recusa, não aviso.
//   2. DINHEIRO EM CENTAVOS. `0.1 + 0.2` é `0.30000000000000004`, e uma
//      conta de trinta itens acumula diferença que ninguém explica na
//      conferência.
//   3. `null` NÃO É ZERO. Sem preço cadastrado é "—", nunca "R$ 0,00" —
//      senão a conta fecha zerada com cara de conta fechada.
//   4. A VIA SUS VEM DO CADASTRO. Quais procedimentos são APAC muda por
//      portaria; cravar a lista faria cada atualização do SIGTAP virar
//      release.
//   5. COMPETÊNCIA NÃO PASSA POR `new Date`. A conta do dia 1º cairia no
//      mês anterior — que é justamente o que já foi transmitido.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  centavos, reais, competenciaDe, competenciaLabel, VIAS, viaDeFaturamento,
  TIPOS_ITEM, totalDaConta, conferirItem, STATUS_CONTA, validarFechamento,
  resumoDaConta, camposDaConta, camposDoItem,
} from "./faturamento.js";

const sus = { id: 1, nome: "SUS", tipo: "sus" };
const oper = { id: 2, nome: "Unimed", tipo: "convenio", exige_carteira: true };
const part = { id: 3, nome: "Particular", tipo: "particular" };

const at = (over = {}) => ({
  id: 77, prontuario: "100042", chegada_em: "2026-07-30T12:00:00Z",
  tipo_atendimento: "ambulatorial", convenio_id: 1, ...over,
});
const pac = (over = {}) => ({ prontuario: "100042", nome_completo: "Ana Souza", cns: "898001160650005", ...over });
const item = (over = {}) => ({ tipo: "procedimento", codigo: "0301010072", descricao: "Consulta", quantidade: 1, valor_unitario: 10.5, ...over });

describe("dinheiro", () => {
  it("converte para centavos sem erro de ponto flutuante", () => {
    expect(centavos(10.5)).toBe(1050);
    expect(centavos(0.1)).toBe(10);
  });

  it("desempata o PONTO: milhar no padrão BR, decimal quando vem do teclado", () => {
    // Errar aqui multiplica o item por cem, e o erro só apareceria na
    // conferência do fechamento.
    expect(centavos("1.234,56")).toBe(123456);   // BR: ponto = milhar
    expect(centavos("10,50")).toBe(1050);
    expect(centavos("10.50")).toBe(1050);        // teclado/planilha: decimal
    expect(centavos("10.5")).toBe(1050);
    expect(centavos("1.234")).toBe(123400);      // 3 casas depois do ponto = milhar
    expect(centavos("R$ 1.234,56")).toBe(123456);
    expect(centavos(" 12 ")).toBe(1200);
  });

  it("soma em inteiro — 0.1 + 0.2 tem que dar exatamente 0.30", () => {
    const { totalCentavos, total } = totalDaConta([
      item({ valor_unitario: 0.1 }), item({ valor_unitario: 0.2 }),
    ]);
    expect(totalCentavos).toBe(30);
    expect(total).toMatch(/0,30/);
  });

  it("multiplica pela quantidade", () => {
    expect(totalDaConta([item({ valor_unitario: 2.35, quantidade: 3 })]).totalCentavos).toBe(705);
  });

  it("SEM PREÇO não é zero — é contado à parte e imprime '—'", () => {
    const r = totalDaConta([item({ valor_unitario: null }), item({ valor_unitario: 5 })]);
    expect(r.semPreco).toBe(1);
    expect(r.totalCentavos).toBe(500);
    expect(centavos(null)).toBeNull();
    expect(centavos("")).toBeNull();
    expect(reais(null)).toBe("—");
    expect(reais(0)).toMatch(/0,00/);   // zero de verdade continua sendo zero
  });

  it("item cancelado não entra no total", () => {
    expect(totalDaConta([item({ valor_unitario: 100, cancelado: true })]).totalCentavos).toBe(0);
  });

  it("valor lixo não vira NaN no total", () => {
    const r = totalDaConta([item({ valor_unitario: "abc" }), item({ quantidade: "x" })]);
    expect(Number.isNaN(r.totalCentavos)).toBe(false);
    expect(r.semPreco).toBe(2);
  });
});

describe("competência", () => {
  it("não passa por new Date — o dia 1º fica no próprio mês", () => {
    expect(competenciaDe("2026-07-01")).toBe("2026-07");
    expect(competenciaDe("2026-07-01T02:00:00Z")).toBe("2026-07");
    expect(competenciaDe("2026-01-01")).toBe("2026-01");
  });

  it("lixo devolve null, não uma competência inventada", () => {
    expect(competenciaDe("")).toBeNull();
    expect(competenciaDe(null)).toBeNull();
    expect(competenciaDe("julho")).toBeNull();
    expect(competenciaLabel("nada")).toBe("—");
  });

  it("rotula legível", () => {
    expect(competenciaLabel("2026-07")).toBe("Jul/2026");
  });
});

describe("por qual via a conta sai", () => {
  it("particular é cobrança direta; operadora é TISS", () => {
    expect(viaDeFaturamento({ convenio: part, atendimento: at() })).toBe("direta");
    expect(viaDeFaturamento({ convenio: oper, atendimento: at() })).toBe("tiss");
  });

  it("SUS ambulatorial é BPA por padrão", () => {
    expect(viaDeFaturamento({ convenio: sus, atendimento: at() })).toBe("bpa");
  });

  it("a via APAC vem do CADASTRO do procedimento, não de lista em código", () => {
    expect(viaDeFaturamento({ convenio: sus, atendimento: at(), procedimento: { via_sus: "apac" } })).toBe("apac");
    expect(viaDeFaturamento({ convenio: sus, atendimento: at(), procedimento: { via_sus: "APAC" } })).toBe("apac");
    // cadastro em branco ou lixo cai em BPA, que é a via da maioria
    expect(viaDeFaturamento({ convenio: sus, atendimento: at(), procedimento: { via_sus: "xpto" } })).toBe("bpa");
  });

  it("internação pelo SUS é AIH, mesmo com procedimento ambulatorial", () => {
    expect(viaDeFaturamento({ convenio: sus, atendimento: at({ tipo_atendimento: "eletivo" }), procedimento: { via_sus: "bpa" } })).toBe("aih");
  });

  it("sem convênio não há via — e não se chuta uma", () => {
    expect(viaDeFaturamento({ atendimento: at() })).toBeNull();
    expect(viaDeFaturamento({ convenio: {}, atendimento: at() })).toBeNull();
  });

  it("nenhuma via do SUS cobra do paciente", () => {
    for (const v of ["bpa", "apac", "aih"]) expect(VIAS[v].cobraDoPaciente, v).toBe(false);
    for (const v of ["tiss", "direta"]) expect(VIAS[v].cobraDoPaciente, v).toBe(true);
  });
});

describe("SUS não cobra do paciente", () => {
  it("item marcado para cobrança direta numa conta SUS é RECUSADO", () => {
    const v = conferirItem({ item: item({ cobrar_do_paciente: true }), via: "bpa" });
    expect(v.ok).toBe(false);
    expect(v.erros.join(" ")).toMatch(/bolso de quem foi atendido/i);
  });

  it("vale para as três vias do SUS", () => {
    for (const via of ["bpa", "apac", "aih"]) {
      expect(conferirItem({ item: item({ cobrar_do_paciente: true }), via }).ok, via).toBe(false);
    }
  });

  it("mas é legítimo no particular e no convênio", () => {
    for (const via of ["direta", "tiss"]) {
      expect(conferirItem({ item: item({ cobrar_do_paciente: true }), via }).ok, via).toBe(true);
    }
  });
});

describe("o que impede acrescentar item", () => {
  it("conta fechada não recebe item novo", () => {
    const v = conferirItem({ conta: { status: "fechada" }, item: item(), via: "bpa" });
    expect(v.ok).toBe(false);
    expect(v.erros.join(" ")).toMatch(/reabra/i);
  });

  it("conta aberta recebe", () => {
    expect(conferirItem({ conta: { status: "aberta" }, item: item(), via: "bpa" }).ok).toBe(true);
  });

  it("quantidade zero ou negativa é recusada", () => {
    expect(conferirItem({ item: item({ quantidade: 0 }), via: "bpa" }).ok).toBe(false);
    expect(conferirItem({ item: item({ quantidade: -1 }), via: "bpa" }).ok).toBe(false);
  });

  it("item sem código E sem descrição não entra", () => {
    expect(conferirItem({ item: item({ codigo: "", descricao: "" }), via: "bpa" }).ok).toBe(false);
    // um dos dois basta — material de tabela própria costuma ter só nome
    expect(conferirItem({ item: item({ codigo: "", descricao: "Gaze" }), via: "bpa" }).ok).toBe(true);
  });

  it("item sem preço passa, mas avisa que o total sai menor", () => {
    const v = conferirItem({ item: item({ valor_unitario: null }), via: "bpa" });
    expect(v.ok).toBe(true);
    expect(v.avisos.join(" ")).toMatch(/menor do que é/i);
  });
});

describe("fechamento da conta", () => {
  const base = {
    conta: { id: 1, status: "aberta" }, itens: [item()],
    paciente: pac(), convenio: sus, atendimento: at(), hoje: new Date("2026-07-30T10:00:00"),
  };

  it("conta com item e fonte pagadora fecha", () => {
    const v = validarFechamento(base);
    expect(v.ok).toBe(true);
    expect(v.via).toBe("bpa");
  });

  it("conta vazia não fecha — transmitiria produção zero", () => {
    const v = validarFechamento({ ...base, itens: [] });
    expect(v.ok).toBe(false);
    expect(v.erros.join(" ")).toMatch(/produção zero/i);
  });

  it("item cancelado não conta como item", () => {
    expect(validarFechamento({ ...base, itens: [item({ cancelado: true })] }).ok).toBe(false);
  });

  it("sem convênio não fecha", () => {
    const v = validarFechamento({ ...base, convenio: null });
    expect(v.ok).toBe(false);
    expect(v.erros.join(" ")).toMatch(/sem fonte pagadora/i);
  });

  it("no fechamento, pendência ALTA da ficha vira ERRO — não aviso como no balcão", () => {
    // SUS sem CNS: no balcão é aviso (não segura o paciente); aqui impede.
    const v = validarFechamento({ ...base, paciente: pac({ cns: null }) });
    expect(v.ok).toBe(false);
    expect(v.erros.join(" ")).toMatch(/CNS|Cartão Nacional/i);
  });

  it("APAC sem autorização não fecha", () => {
    const v = validarFechamento({ ...base, procedimento: { via_sus: "apac", nome: "Ressonância" } });
    expect(v.ok).toBe(false);
    expect(v.erros.join(" ")).toMatch(/autorização prévia/i);
  });

  it("APAC com a senha fecha", () => {
    const v = validarFechamento({
      ...base, procedimento: { via_sus: "apac", nome: "Ressonância" },
      atendimento: at({ autorizacao_senha: "AUT-123" }),
    });
    expect(v.ok).toBe(true);
    expect(v.via).toBe("apac");
  });

  it("conta já fechada não fecha de novo", () => {
    expect(validarFechamento({ ...base, conta: { id: 1, status: "fechada" } }).ok).toBe(false);
    expect(validarFechamento({ ...base, conta: { id: 1, status: "faturada" } }).ok).toBe(false);
  });

  it("itens sem preço avisam, mas não impedem", () => {
    const v = validarFechamento({ ...base, itens: [item({ valor_unitario: null })] });
    expect(v.ok).toBe(true);
    expect(v.avisos.join(" ")).toMatch(/catálogo é que está incompleto/i);
  });
});

describe("estado da conta", () => {
  it("faturada não volta a receber item nem a ser reaberta", () => {
    expect(STATUS_CONTA.faturada.recebeItem).toBe(false);
    expect(STATUS_CONTA.faturada.reabrivel).toBe(false);
    expect(STATUS_CONTA.fechada.reabrivel).toBe(true);
  });

  it("só a aberta recebe item", () => {
    const recebem = Object.entries(STATUS_CONTA).filter(([, s]) => s.recebeItem).map(([k]) => k);
    expect(recebem).toEqual(["aberta"]);
  });
});

describe("resumo", () => {
  it("agrupa por tipo e diz se o paciente pode ser cobrado", () => {
    const r = resumoDaConta({
      conta: { status: "aberta", competencia: "2026-07" },
      itens: [item(), item({ tipo: "material", descricao: "Gaze", valor_unitario: 1.25, quantidade: 4 })],
      convenio: sus, atendimento: at(),
    });
    expect(r.via).toBe("bpa");
    expect(r.cobraDoPaciente).toBe(false);
    expect(r.itens).toBe(2);
    expect(r.porTipo.map(t => t.chave)).toEqual(["procedimento", "material"]);
    expect(r.porTipo.find(t => t.chave === "material").totalCentavos).toBe(500);
    expect(r.totalCentavos).toBe(1550);
  });

  it("sem convênio o resumo diz isso, em vez de fingir uma via", () => {
    const r = resumoDaConta({ itens: [], atendimento: at() });
    expect(r.via).toBeNull();
    expect(r.viaNome).toMatch(/sem fonte pagadora/i);
    expect(r.cobraDoPaciente).toBe(false);
  });

  it("tipo sem item não polui o resumo", () => {
    const r = resumoDaConta({ itens: [item()], convenio: sus, atendimento: at() });
    expect(r.porTipo).toHaveLength(1);
  });
});

describe("o corpo que vai para o banco", () => {
  it("congela o valor total no item — a tabela muda, a conta de março não", () => {
    const corpo = camposDoItem({ conta_id: 1, tipo: "material", descricao: "Gaze", quantidade: 4, valor_unitario: 1.25 });
    expect(corpo.valor_total).toBe(5);
    expect(corpo.valor_unitario).toBe(1.25);
  });

  it("sem preço grava null nos dois, e não zero", () => {
    const corpo = camposDoItem({ conta_id: 1, descricao: "Gaze", quantidade: 2 });
    expect(corpo.valor_unitario).toBeNull();
    expect(corpo.valor_total).toBeNull();
  });

  it("quantidade inválida vira 1, nunca 0 ou NaN", () => {
    expect(camposDoItem({ descricao: "X", quantidade: "abc" }).quantidade).toBe(1);
    expect(camposDoItem({ descricao: "X", quantidade: 0 }).quantidade).toBe(1);
  });

  it("tipo e status desconhecidos caem no padrão, e não gravam lixo", () => {
    expect(camposDoItem({ descricao: "X", tipo: "gorjeta" }).tipo).toBe("procedimento");
    expect(camposDaConta({ status: "paga_em_ouro" }).status).toBe("aberta");
  });

  it("campo em branco vira null", () => {
    const c = camposDaConta({ atendimento_id: 1, observacao: "  ", via: "" });
    expect(c.observacao).toBeNull();
    expect(c.via).toBeNull();
  });

  it("todo tipo de item tem rótulo", () => {
    for (const t of TIPOS_ITEM) expect(t.label, t.chave).toBeTruthy();
  });
});
