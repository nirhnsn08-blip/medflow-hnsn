// ═══════════════════════════════════════════════════════════
// ASSISTENTE DO FATURAMENTO — o que ele NÃO pode dizer
//
// 🔴 Frase tem mais autoridade que número. "O índice de glosa está em 0%"
// dito por um assistente soa mais verdadeiro do que o mesmo 0% num cartão.
// E é justamente quando a leitura falha que o zero aparece.
//
// Os testes abaixo são quase todos NEGATIVOS: travam o que ele não pode
// falar. Um assistente que repete o zero de uma falha de rede é pior que
// assistente nenhum — ele dá confiança a uma mentira.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { responderAssistente, AJUDA } from "./assistente.js";
import { listaLida } from "../util/leitura.js";
import { conciliar } from "./receitas.js";

const FALHA = listaLida(null);
const HOJE = new Date(2026, 8, 1);

const conta = (id, o = {}) => ({ id, prontuario: "T9020", competencia: "2026-08", convenio_id: 1, status: "faturada", faturada_em: "2026-08-15", ...o });
const item = (v) => ({ valor_unitario: v, quantidade: 1, valor_total: v });
const glosa = (v, o = {}) => ({ conta_id: 1, valor_glosado: v, recebida_em: "2026-08-20", situacao: "recebida", ...o });
const repasse = (v, o = {}) => ({ valor: v, recebido_em: "2026-09-15", ...o });

const cenario = (o = {}) => ({
  contas: [conta(1)],
  conciliacoes: conciliar({
    contas: [conta(1)], itensPorConta: { 1: [item(1000)] },
    glosasPorConta: { 1: [] }, repassesPorConta: { 1: [] }, hoje: HOJE,
  }),
  glosas: [glosa(300)],
  precos: [], itensComConvenio: [], repassesPorConta: {}, convenios: [{ id: 1, nome: "SUS" }],
  hoje: HOJE, ...o,
});

describe("o básico", () => {
  it("pergunta vazia devolve a ajuda", () => {
    expect(responderAssistente("", cenario())).toBe(AJUDA);
  });

  it("saudação não vira resposta técnica", () => {
    expect(responderAssistente("oi", cenario())).toContain(AJUDA);
  });

  it("ignora acento e maiúscula", () => {
    const a = responderAssistente("QUAL A TAXA DE RECUPERAÇÃO?", cenario({ glosas: [glosa(100, { situacao: "recuperada", valor_recuperado: 100 })] }));
    expect(a).toMatch(/recupera/i);
  });

  it("🔴 pergunta que ele não sabe NÃO vira improviso", () => {
    // E não pode ser um "não entendi" seco: sem dizer o que ele sabe, a
    // pessoa reformula a mesma pergunta impossível e desiste da tela.
    const a = responderAssistente("qual a previsão do tempo amanhã?", cenario());
    expect(a).toMatch(/prefiro dizer isso a improvisar/i);
    expect(a).toContain(AJUDA);
  });
});

describe("🔴 leitura que falhou — ele se RECUSA a dar número", () => {
  it("glosas ilegíveis: não responde taxa de recuperação", () => {
    const a = responderAssistente("qual a taxa de recuperação?", cenario({ glosas: FALHA }));
    expect(a).toMatch(/não foi possível ler as glosas/i);
    expect(a).not.toMatch(/\d+[,.]\d%/);
  });

  it("glosas ilegíveis: não responde a fila nem o prazo", () => {
    const a = responderAssistente("tem glosa vencendo?", cenario({ glosas: FALHA }));
    expect(a).toMatch(/não foi possível ler/i);
  });

  it("contas ilegíveis: não responde o panorama", () => {
    const a = responderAssistente("me dá o panorama", cenario({ contas: FALHA, conciliacoes: FALHA }));
    expect(a).toMatch(/não foi possível ler as contas/i);
  });

  it("contas ilegíveis: não responde o a receber", () => {
    const a = responderAssistente("quanto tenho a receber?", cenario({ contas: FALHA, conciliacoes: FALHA }));
    expect(a).toMatch(/não foi possível ler/i);
  });

  it("preços ilegíveis: não responde as lacunas", () => {
    const a = responderAssistente("tem procedimento sem preço?", cenario({ precos: FALHA }));
    expect(a).toMatch(/não foi possível ler/i);
  });

  it("🔴 a recusa EXPLICA por que zero seria perigoso", () => {
    // Sem essa frase, "não sei" soa como "não há".
    const a = responderAssistente("panorama", cenario({ contas: FALHA, conciliacoes: FALHA }));
    expect(a).toMatch(/zero/i);
    expect(a).toMatch(/boa notícia|parece boa/i);
  });

  it("⚠️ e NENHUMA recusa contém valor em reais", () => {
    for (const p of ["panorama", "quanto a receber", "taxa de recuperação", "tem glosa vencendo", "procedimento sem preço"]) {
      const a = responderAssistente(p, cenario({ contas: FALHA, conciliacoes: FALHA, glosas: FALHA, precos: FALHA }));
      expect(a, p).not.toMatch(/R\$\s*[\d.]/);
    }
  });
});

describe("glosas — o que ele diz quando dá para ler", () => {
  it("panorama de glosas traz aberto, vencido e SEM PRAZO", () => {
    const a = responderAssistente("como estão as glosas?", cenario({
      glosas: [glosa(100), glosa(200, { prazo_recurso_em: "2026-08-01" }), glosa(50, { prazo_recurso_em: null })],
    }));
    expect(a).toMatch(/em aberto/i);
    expect(a).toMatch(/sem prazo/i);
  });

  it("🔴 sem recurso encerrado, NÃO inventa taxa — e explica o denominador", () => {
    const a = responderAssistente("taxa de recuperação", cenario({ glosas: [glosa(100)] }));
    expect(a).toMatch(/nenhum recurso foi encerrado/i);
    expect(a).toMatch(/não sobre o que foi glosado/i);
    expect(a).not.toMatch(/0[,.]0%/);
  });

  it("com recurso encerrado, dá a taxa e os dois valores", () => {
    const a = responderAssistente("taxa de recuperação", cenario({
      glosas: [glosa(200, { situacao: "recuperada", valor_recuperado: 150 })],
    }));
    expect(a).toMatch(/75[,.]0%/);
  });

  it("⚠️ avisa que glosa sem prazo pode estar vencendo hoje", () => {
    const a = responderAssistente("qual glosa vence primeiro?", cenario({
      glosas: [glosa(500, { prazo_recurso_em: null })],
    }));
    expect(a).toMatch(/não inventa essa data/i);
  });

  it("motivos vêm ordenados pelo que mais custa", () => {
    const a = responderAssistente("por que glosaram?", cenario({
      glosas: [glosa(50, { motivo_codigo: "A" }), glosa(900, { motivo_codigo: "B" })],
    }));
    expect(a.indexOf("B")).toBeLessThan(a.indexOf("A"));
    expect(a).toMatch(/processo quebrado, não azar/i);
  });

  it("sem glosa nenhuma, diz isso — e não inventa fila", () => {
    const a = responderAssistente("tem glosa vencendo?", cenario({ glosas: [] }));
    expect(a).toMatch(/nenhuma glosa em aberto/i);
  });
});

describe("a receber e prazo", () => {
  it("🔴 com poucos repasses, RECUSA dar prazo típico", () => {
    const a = responderAssistente("qual o prazo médio de recebimento?", cenario({
      repassesPorConta: { 1: [repasse(500)] },
    }));
    expect(a).toMatch(/precisos 5|são precisos/i);
    expect(a).toMatch(/prefiro não dar um prazo/i);
  });

  it("⚠️ mas confirma que o VALOR a receber está certo", () => {
    // A recusa é sobre o prazo, não sobre o dinheiro.
    const a = responderAssistente("prazo médio", cenario({ repassesPorConta: { 1: [repasse(500)] } }));
    expect(a).toMatch(/valor a receber .* está certo/i);
  });

  it("com histórico suficiente, dá a mediana e explica por que não é a média", () => {
    const contas = [1, 2, 3, 4, 5].map(i => conta(i, { faturada_em: "2026-06-01" }));
    const reps = Object.fromEntries([1, 2, 3, 4, 5].map(i => [i, [repasse(100, { recebido_em: "2026-07-01" })]]));
    const a = responderAssistente("prazo médio de repasse", cenario({ contas, repassesPorConta: reps }));
    expect(a).toMatch(/mediana/i);
    expect(a).toMatch(/puxaria a média/i);
  });

  it("avisa sobre conta esperando há mais de 90 dias", () => {
    const cs = conciliar({
      contas: [conta(1, { faturada_em: "2026-01-01" })],
      itensPorConta: { 1: [item(1000)] }, repassesPorConta: {}, hoje: HOJE,
    });
    const a = responderAssistente("quanto tenho a receber?", cenario({ conciliacoes: cs }));
    expect(a).toMatch(/glosa que chegou e ninguém registrou/i);
  });
});

describe("preço e convênio", () => {
  it("aponta a maior lacuna e separa VENCIDO de ausente", () => {
    const a = responderAssistente("tem procedimento sem preço?", cenario({
      precos: [{ id: 1, convenio_id: 1, codigo: "AAA", valor: 10, vigencia_inicio: "2025-01-01", vigencia_fim: "2025-12-31", ativo: true }],
      itensComConvenio: [
        { codigo: "AAA", convenio_id: 1, valor_total: 500, descricao: "X" },
        { codigo: "BBB", convenio_id: 1, valor_total: 100, descricao: "Y" },
      ],
    }));
    expect(a).toMatch(/vigência vencida/i);
    expect(a).toMatch(/conserto mais barato/i);
  });

  it("tudo com preço vigente: diz isso", () => {
    const a = responderAssistente("preço", cenario({
      precos: [{ id: 1, convenio_id: 1, codigo: "AAA", valor: 10, vigencia_inicio: "2025-01-01", vigencia_fim: null, ativo: true }],
      itensComConvenio: [{ codigo: "AAA", convenio_id: 1, valor_total: 500 }],
    }));
    expect(a).toMatch(/todo item faturado tem preço vigente/i);
  });
});

describe("panorama", () => {
  it("dá os três números e a diferença", () => {
    const a = responderAssistente("panorama", cenario());
    expect(a).toMatch(/faturado/i);
    expect(a).toMatch(/glosado/i);
    expect(a).toMatch(/recebido/i);
  });

  it("🔴 avisa que item sem preço deixa o faturado MENOR que a produção", () => {
    const cs = conciliar({
      contas: [conta(1)], itensPorConta: { 1: [item(100), { quantidade: 1 }] },
      repassesPorConta: {}, hoje: HOJE,
    });
    const a = responderAssistente("resumo geral", cenario({ conciliacoes: cs }));
    expect(a).toMatch(/menor que a produção real/i);
  });

  it("aponta onde cobrar primeiro", () => {
    const a = responderAssistente("onde cobrar primeiro?", cenario());
    expect(a).toMatch(/SUS/);
  });
});

describe("⚠️ ele nunca calcula por conta própria", () => {
  it("a taxa que ele diz é a MESMA de resumoGlosas", async () => {
    // Se ele fizesse a própria conta, haveria duas versões da regra — e
    // elas divergiriam na primeira mudança.
    const { resumoGlosas } = await import("./glosas.js");
    const gs = [glosa(400, { situacao: "recuperada", valor_recuperado: 100 })];
    const esperado = resumoGlosas(gs, HOJE).taxaRecuperacao;
    const a = responderAssistente("taxa de recuperação", cenario({ glosas: gs }));
    expect(a).toContain(esperado.toFixed(1));
  });
});
