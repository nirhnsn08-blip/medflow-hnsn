// ═══════════════════════════════════════════════════════════
// RECEITAS — A SUBTRAÇÃO QUE NÃO PODE FECHAR POR ACASO
//
// 🔴 `diferença = (faturado − glosado) − recebido` é o número que justifica
// a tela inteira. Ele erra de três jeitos, e nenhum dá erro:
//
//   1. UNIDADE — o faturado vem em centavos, glosa e repasse em reais.
//      Uma conversão esquecida faz a diferença dar 100× e "fechar" no
//      único caso em que o valor é redondo.
//   2. LEITURA — se a lista de repasses falhou, `recebido` é 0 e a tela
//      grita "não recebemos nada" sobre dinheiro que talvez esteja lá.
//   3. ESCOPO — conta que ainda não foi faturada entrando no "a receber"
//      inventa dinheiro que o hospital nem pediu.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  conciliarConta, conciliar, totalGeral, porCompetencia, porConvenio,
  avisosDaReceita, recusasDoRepasse, ESTADOS,
} from "./receitas.js";
import { listaLida } from "../util/leitura.js";

const FALHA = listaLida(null);
const HOJE = new Date(2026, 8, 1);   // 01/09/2026

const conta = (o = {}) => ({ id: 1, prontuario: "T9020", competencia: "2026-08", convenio_id: 7, via: "bpa", status: "faturada", faturada_em: "2026-08-20", ...o });
const item = (reais, q = 1, o = {}) => ({ valor_unitario: reais, quantidade: q, ...o });
const glosa = (reais, o = {}) => ({ valor_glosado: reais, ...o });
const repasse = (reais, o = {}) => ({ valor: reais, recebido_em: "2026-09-01", ...o });

describe("🔴 a unidade — centavos de um lado, reais do outro", () => {
  it("faturado em centavos, glosa e repasse em reais, tudo bate", () => {
    // R$ 1.000 faturado − R$ 200 glosado − R$ 800 recebido = 0
    const c = conciliarConta({
      conta: conta(), itens: [item(1000)], glosas: [glosa(200)], repasses: [repasse(800)], hoje: HOJE,
    });
    expect(c.faturado).toBe(100000);
    expect(c.glosado).toBe(20000);
    expect(c.recebido).toBe(80000);
    expect(c.diferenca).toBe(0);
    expect(c.estado).toBe("quitada");
  });

  it("⚠️ valor com centavos quebrados não vira dízima", () => {
    // 33,33 × 3 = 99,99 — em float daria 99.98999999999999
    const c = conciliarConta({
      conta: conta(), itens: [item(33.33, 3)], glosas: [], repasses: [repasse(99.99)], hoje: HOJE,
    });
    expect(c.faturado).toBe(9999);
    expect(c.recebido).toBe(9999);
    expect(c.estado).toBe("quitada");
  });

  it("lixo em glosa ou repasse vira 0, nunca NaN", () => {
    const c = conciliarConta({
      conta: conta(), itens: [item(100)],
      glosas: [glosa("abc"), glosa(null)], repasses: [repasse(undefined)], hoje: HOJE,
    });
    expect(JSON.stringify(c)).not.toMatch(/NaN|Infinity/);
    expect(c.glosado).toBe(0);
  });
});

describe("🔴 os estados", () => {
  it("não faturada: nada a esperar, diferença fora do total", () => {
    const c = conciliarConta({ conta: conta({ status: "aberta", faturada_em: null }), itens: [item(500)], hoje: HOJE });
    expect(c.estado).toBe("nao_faturada");
  });

  it("sem repasse: faturada e nada entrou", () => {
    const c = conciliarConta({ conta: conta(), itens: [item(500)], glosas: [], repasses: [], hoje: HOJE });
    expect(c.estado).toBe("sem_repasse");
    expect(c.diferenca).toBe(50000);
    expect(c.diasDesdeFaturamento).toBe(12);
  });

  it("parcial: entrou menos e NÃO há glosa que explique", () => {
    const c = conciliarConta({ conta: conta(), itens: [item(1000)], glosas: [], repasses: [repasse(700)], hoje: HOJE });
    expect(c.estado).toBe("parcial");
    expect(c.diferenca).toBe(30000);
  });

  it("⚠️ a glosa EXPLICA o que faltou — não é diferença", () => {
    // Este é o ponto da tela: R$ 300 a menos com R$ 300 de glosa registrada
    // é o sistema funcionando. Sem glosa, é dinheiro perdido sem explicação.
    const c = conciliarConta({ conta: conta(), itens: [item(1000)], glosas: [glosa(300)], repasses: [repasse(700)], hoje: HOJE });
    expect(c.estado).toBe("quitada");
    expect(c.diferenca).toBe(0);
  });

  it("🔴 a MAIOR não é boa notícia", () => {
    const c = conciliarConta({ conta: conta(), itens: [item(100)], glosas: [], repasses: [repasse(150)], hoje: HOJE });
    expect(c.estado).toBe("a_maior");
    expect(c.diferenca).toBeLessThan(0);
  });

  it("⚠️ 1 centavo de diferença é arredondamento, não divergência", () => {
    const c = conciliarConta({ conta: conta(), itens: [item(100)], glosas: [], repasses: [repasse(99.99)], hoje: HOJE });
    expect(c.estado).toBe("quitada");
  });

  it("2 centavos já é divergência", () => {
    const c = conciliarConta({ conta: conta(), itens: [item(100)], glosas: [], repasses: [repasse(99.98)], hoje: HOJE });
    expect(c.estado).toBe("parcial");
  });
});

describe("⚠️ estorno — repasse negativo", () => {
  it("abate o recebido, porque o dinheiro voltou", () => {
    const c = conciliarConta({
      conta: conta(), itens: [item(1000)], glosas: [],
      repasses: [repasse(1000), repasse(-300)], hoje: HOJE,
    });
    expect(c.recebido).toBe(70000);
    expect(c.estado).toBe("parcial");
  });

  it("estorno total devolve a conta ao estado de quem recebeu nada de líquido", () => {
    const c = conciliarConta({
      conta: conta(), itens: [item(500)], glosas: [],
      repasses: [repasse(500), repasse(-500)], hoje: HOJE,
    });
    expect(c.recebido).toBe(0);
    // Houve movimento, então NÃO é "sem repasse" — é recebida a menor.
    expect(c.estado).toBe("parcial");
  });
});

describe("🔴 leitura que falhou não vira acerto de contas", () => {
  it("repasses ilegíveis deixam a diferença NULA, não zero", () => {
    const c = conciliarConta({ conta: conta(), itens: [item(1000)], glosas: [], repasses: FALHA, hoje: HOJE });
    expect(c.diferenca).toBe(null);
    expect(c.motivo).toBe("nao_deu_para_ler");
  });

  it("glosas ilegíveis idem", () => {
    expect(conciliarConta({ conta: conta(), itens: [item(1000)], glosas: FALHA, repasses: [], hoje: HOJE }).diferenca).toBe(null);
  });

  it("itens ilegíveis idem", () => {
    expect(conciliarConta({ conta: conta(), itens: FALHA, glosas: [], repasses: [], hoje: HOJE }).diferenca).toBe(null);
  });
});

describe("🔴 totalGeral — o escopo do 'a receber'", () => {
  const cs = conciliar({
    contas: [
      conta({ id: 1, status: "faturada" }),
      conta({ id: 2, status: "aberta", faturada_em: null }),
    ],
    itensPorConta: { 1: [item(1000)], 2: [item(9999)] },
    glosasPorConta: {}, repassesPorConta: { 1: [repasse(600)] },
    hoje: HOJE,
  });

  it("conta NÃO FATURADA fica fora do esperado e da diferença", () => {
    // Ela ainda não foi cobrada de ninguém. Somá-la faria o "a receber"
    // incluir dinheiro que o hospital nem pediu.
    const t = totalGeral(cs);
    expect(t.esperado).toBe(100000);
    expect(t.diferenca).toBe(40000);
  });

  it("mas o FATURADO total conta as duas — é produção", () => {
    expect(totalGeral(cs).faturado).toBe(100000 + 999900);
  });

  it("conta os estados", () => {
    const t = totalGeral(cs);
    expect(t.porEstado.parcial).toBe(1);
    expect(t.porEstado.nao_faturada).toBe(1);
  });

  it("lista vazia devolve zeros sem estourar", () => {
    const t = totalGeral([]);
    expect(t.contas).toBe(0);
    expect(JSON.stringify(t)).not.toMatch(/NaN|Infinity/);
  });
});

describe("porCompetencia", () => {
  it("agrupa e ordena da mais antiga para a mais nova", () => {
    const cs = conciliar({
      contas: [conta({ id: 1, competencia: "2026-08" }), conta({ id: 2, competencia: "2026-06" })],
      itensPorConta: { 1: [item(100)], 2: [item(200)] },
      repassesPorConta: {}, hoje: HOJE,
    });
    expect(porCompetencia(cs).map(x => x.competencia)).toEqual(["2026-06", "2026-08"]);
  });

  it("conta sem competência não some — vai para um balde próprio", () => {
    const cs = conciliar({
      contas: [conta({ id: 1, competencia: null })],
      itensPorConta: { 1: [item(100)] }, repassesPorConta: {}, hoje: HOJE,
    });
    expect(porCompetencia(cs)[0].competencia).toBe("(sem competência)");
  });
});

describe("porConvenio", () => {
  it("ordena do MAIOR buraco para o menor", () => {
    const cs = conciliar({
      contas: [
        conta({ id: 1, convenio_id: 7 }), conta({ id: 2, convenio_id: 9 }),
      ],
      itensPorConta: { 1: [item(100)], 2: [item(5000)] },
      repassesPorConta: { 1: [repasse(100)] },
      hoje: HOJE,
    });
    const r = porConvenio(cs, [{ id: 7, nome: "SUS" }, { id: 9, nome: "Unimed" }]);
    expect(r[0].nome).toBe("Unimed");
    expect(r[0].diferenca).toBe(500000);
  });

  it("dá nome ao convênio, e não some com quem não tem", () => {
    const cs = conciliar({
      contas: [conta({ id: 1, convenio_id: null })],
      itensPorConta: { 1: [item(100)] }, repassesPorConta: {}, hoje: HOJE,
    });
    expect(porConvenio(cs, [])[0].nome).toBe("(sem convênio)");
  });
});

describe("os avisos", () => {
  it("🔴 diz que zero de recebido pode ser falta de leitura", () => {
    const a = avisosDaReceita([], { repassesFalharam: true });
    expect(a[0].texto).toMatch(/falta de leitura, não acerto de contas/i);
  });

  it("🔴 item sem preço subestima a diferença, e o texto diz isso", () => {
    const cs = conciliar({
      contas: [conta()], itensPorConta: { 1: [item(100), item(null)] },
      repassesPorConta: {}, hoje: HOJE,
    });
    const a = avisosDaReceita(cs);
    const p = a.find(x => x.tipo === "preco");
    expect(p.texto).toMatch(/subestimada/i);
    expect(p.texto).toMatch(/catálogo incompleto/i);
  });

  it("🔴 recebido a maior é avisado como provável crédito de outra conta", () => {
    const cs = conciliar({
      contas: [conta()], itensPorConta: { 1: [item(100)] },
      repassesPorConta: { 1: [repasse(500)] }, hoje: HOJE,
    });
    const a = avisosDaReceita(cs).find(x => x.tipo === "inconsistencia");
    expect(a.texto).toMatch(/quase nunca é lucro/i);
  });

  it("mês limpo não gera aviso nenhum", () => {
    const cs = conciliar({
      contas: [conta()], itensPorConta: { 1: [item(100)] },
      repassesPorConta: { 1: [repasse(100)] }, hoje: HOJE,
    });
    expect(avisosDaReceita(cs)).toEqual([]);
  });

  it("contas ilegíveis: um aviso só, e para por aí", () => {
    const a = avisosDaReceita(FALHA);
    expect(a).toHaveLength(1);
    expect(a[0].texto).toMatch(/nenhum número abaixo é confiável/i);
  });
});

describe("recusasDoRepasse — espelha o CHECK do banco", () => {
  const bom = { conta_id: 1, valor: "500,00", recebido_em: "2026-09-01" };

  it("repasse bom passa", () => {
    expect(recusasDoRepasse(bom)).toEqual([]);
  });

  it("🔴 ZERO é recusado", () => {
    expect(recusasDoRepasse({ ...bom, valor: "0" }).join(" ")).toMatch(/zero não existe/i);
  });

  it("🔴 NEGATIVO é PERMITIDO — é estorno, e existe de verdade", () => {
    // Bloquear faria o estorno ser registrado como positivo em outro lugar,
    // ou não ser registrado. As duas saídas são piores.
    expect(recusasDoRepasse({ ...bom, valor: "-300,00" })).toEqual([]);
  });

  it("sem conta, sem valor ou sem data é recusado", () => {
    expect(recusasDoRepasse({ ...bom, conta_id: null }).length).toBeGreaterThan(0);
    expect(recusasDoRepasse({ ...bom, valor: "" }).length).toBeGreaterThan(0);
    expect(recusasDoRepasse({ ...bom, recebido_em: null }).length).toBeGreaterThan(0);
  });

  it("aceita vírgula decimal, que é como se digita aqui", () => {
    expect(recusasDoRepasse({ ...bom, valor: "1.234,56" })).not.toEqual([]);
    expect(recusasDoRepasse({ ...bom, valor: "1234,56" })).toEqual([]);
  });
});

describe("o catálogo de estados", () => {
  it("todo estado tem rótulo, cor e dica", () => {
    for (const [k, v] of Object.entries(ESTADOS)) {
      expect(v.label, k).toBeTruthy();
      expect(v.cor, k).toMatch(/^#/);
      expect(v.dica, k).toBeTruthy();
    }
  });
});

describe("🔴 'nunca chegou' × 'chegou e voltou' — o defeito que o teste pegou", () => {
  // A primeira versão decidia "sem repasse" pelo SALDO ser zero. Uma conta
  // paga e integralmente estornada tem saldo zero e parecia intocada — o
  // oposto do que aconteceu: houve movimento, e contra o hospital.
  const base = { conta: conta(), itens: [item(500)], glosas: [], hoje: HOJE };

  it("sem NENHUMA linha de repasse é 'sem_repasse'", () => {
    expect(conciliarConta({ ...base, repasses: [] }).estado).toBe("sem_repasse");
  });

  it("com linhas que se anulam NÃO é 'sem_repasse'", () => {
    const c = conciliarConta({ ...base, repasses: [repasse(500), repasse(-500)] });
    expect(c.recebido).toBe(0);
    expect(c.estado).not.toBe("sem_repasse");
    expect(c.estado).toBe("parcial");
  });

  it("⚠️ e a contagem de repasses fica visível para a tela distinguir", () => {
    expect(conciliarConta({ ...base, repasses: [] }).repasses).toBe(0);
    expect(conciliarConta({ ...base, repasses: [repasse(500), repasse(-500)] }).repasses).toBe(2);
  });
});
