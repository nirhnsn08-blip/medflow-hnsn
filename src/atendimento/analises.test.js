// ═══════════════════════════════════════════════════════════
// ANÁLISES — O ZERO QUE MENTE
//
// 🔴 O defeito que esta tela pode produzir não trava nada e não dá erro:
// vira reunião, meta e decisão.
//
// "Índice de glosa 0%" é a melhor notícia que o módulo pode dar. E é
// exatamente o que aparece quando a leitura das glosas falhou, quando não
// há faturado no mês, ou quando ninguém cadastrou preço. Três causas
// opostas, um número só — e só UMA delas é notícia boa.
//
// Todo teste aqui existe para separar essas causas.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  faturadoDe, ticketMedio, indiceDeGlosa, taxaDeRejeicao,
  analiseDaCompetencia, seriePorCompetencia, MOTIVOS,
} from "./analises.js";
import { listaLida } from "../util/leitura.js";

const FALHA = listaLida(null);

const conta = (id, o = {}) => ({ id, status: "faturada", via: "bpa", competencia: "2026-08", ...o });
const item = (v, q = 1, o = {}) => ({ valor_unitario: v, quantidade: q, ...o });
const glosa = (valor, o = {}) => ({
  conta_id: 1, valor_glosado: valor, recebida_em: "2026-08-01",
  situacao: "recebida", competencia: "2026-08", ...o,
});

describe("faturadoDe", () => {
  it("soma os itens das contas, em centavos", () => {
    const f = faturadoDe([conta(1), conta(2)], { 1: [item(100), item(50)], 2: [item(25.5)] });
    expect(f.centavos).toBe(17550);
    expect(f.comItens).toBe(2);
  });

  it("🔴 item SEM PREÇO é contado, não escondido", () => {
    // Sem este número a conta parece menor do que é, e o gestor lê
    // "faturamento baixo" quando o problema é catálogo incompleto.
    const f = faturadoDe([conta(1)], { 1: [item(100), item(null), item(undefined)] });
    expect(f.centavos).toBe(10000);
    expect(f.semPreco).toBe(2);
  });

  it("item cancelado não entra", () => {
    const f = faturadoDe([conta(1)], { 1: [item(100), item(999, 1, { cancelado: true })] });
    expect(f.centavos).toBe(10000);
  });

  it("⚠️ conta SEM item nenhum não conta como conta faturada de R$ 0", () => {
    // Ela não é uma conta barata: é uma conta que ninguém começou.
    const f = faturadoDe([conta(1), conta(2)], { 1: [item(100)] });
    expect(f.comItens).toBe(1);
    expect(f.contas).toBe(2);
  });

  it("lista que falhou não vira faturamento zero silencioso", () => {
    expect(faturadoDe(FALHA, {}).contas).toBe(0);
  });
});

describe("🔴 ticketMedio", () => {
  it("divide pelas contas QUE TÊM ITEM", () => {
    // 300 reais em 2 contas com item (a terceira está vazia) = 150.
    const f = faturadoDe([conta(1), conta(2), conta(3)], { 1: [item(100)], 2: [item(200)] });
    expect(ticketMedio(f).valor).toBe(15000);
  });

  it("⚠️ conta vazia no denominador puxaria a média para baixo", () => {
    const f = faturadoDe([conta(1), conta(2), conta(3)], { 1: [item(100)], 2: [item(200)] });
    expect(ticketMedio(f).valor).not.toBe(10000);   // 30000/3
  });

  it("🔴 sem nenhuma conta com item, devolve null e NÃO zero", () => {
    const t = ticketMedio(faturadoDe([conta(1)], {}));
    expect(t.valor).toBe(null);
    expect(t.valor).not.toBe(0);
    expect(t.motivo).toBe(MOTIVOS.SEM_BASE);
  });
});

describe("🔴 indiceDeGlosa — o indicador mais perigoso", () => {
  const f = faturadoDe([conta(1)], { 1: [item(1000)] });   // R$ 1.000,00

  it("calcula a proporção quando os dois lados existem", () => {
    expect(indiceDeGlosa(f, [glosa(100)]).valor).toBeCloseTo(10, 6);
  });

  it("✅ nenhuma glosa num mês faturado É zero — esta é a notícia boa", () => {
    const i = indiceDeGlosa(f, []);
    expect(i.valor).toBe(0);
    expect(i.motivo).toBe(null);
  });

  it("🔴 leitura FALHOU devolve null, não zero", () => {
    // Aqui está a diferença entre "não houve glosa" e "não sabemos de
    // nada". As duas pintariam 0% de índice, que é excelente desempenho.
    const i = indiceDeGlosa(f, FALHA);
    expect(i.valor).toBe(null);
    expect(i.motivo).toBe(MOTIVOS.SEM_LEITURA);
  });

  it("🔴 sem faturado no mês devolve null, não zero", () => {
    // Não há o que glosar. Zero por cento diria que o mês foi impecável.
    const i = indiceDeGlosa(faturadoDe([], {}), [glosa(100)]);
    expect(i.valor).toBe(null);
    expect(i.motivo).toBe(MOTIVOS.SEM_BASE);
  });

  it("⚠️ as três causas de 'zero' são distinguíveis entre si", () => {
    const semGlosa = indiceDeGlosa(f, []);
    const semLeitura = indiceDeGlosa(f, FALHA);
    const semBase = indiceDeGlosa(faturadoDe([], {}), []);
    expect(semGlosa.valor).toBe(0);
    expect(semLeitura.valor).toBe(null);
    expect(semBase.valor).toBe(null);
    expect(semLeitura.motivo).not.toBe(semBase.motivo);
  });
});

describe("taxaDeRejeicao", () => {
  it("glosadas sobre o que foi enviado", () => {
    const t = taxaDeRejeicao([
      conta(1, { status: "faturada" }), conta(2, { status: "faturada" }),
      conta(3, { status: "glosada" }), conta(4, { status: "faturada" }),
    ]);
    expect(t.valor).toBeCloseTo(25, 6);
  });

  it("⚠️ conta ABERTA não entra no denominador", () => {
    // Ela ainda não foi para lugar nenhum, então não pode ser rejeitada.
    const t = taxaDeRejeicao([conta(1, { status: "faturada" }), conta(2, { status: "aberta" })]);
    expect(t.valor).toBe(0);
  });

  it("🔴 nada enviado devolve null, não zero", () => {
    const t = taxaDeRejeicao([conta(1, { status: "aberta" })]);
    expect(t.valor).toBe(null);
    expect(t.motivo).toBe(MOTIVOS.SEM_BASE);
  });

  it("🔴 leitura falhou devolve null", () => {
    expect(taxaDeRejeicao(FALHA).motivo).toBe(MOTIVOS.SEM_LEITURA);
  });
});

describe("analiseDaCompetencia — os avisos", () => {
  it("avisa que há item sem preço, e diz que NÃO é queda de produção", () => {
    const a = analiseDaCompetencia({
      contas: [conta(1)], itensPorConta: { 1: [item(100), item(null)] }, glosas: [],
    });
    const aviso = a.avisos.find(x => x.tipo === "preco");
    expect(aviso).toBeTruthy();
    expect(aviso.texto).toMatch(/catálogo incompleto/i);
    expect(aviso.texto).toMatch(/MENOR/);
  });

  it("não inventa aviso de preço quando está tudo cadastrado", () => {
    const a = analiseDaCompetencia({ contas: [conta(1)], itensPorConta: { 1: [item(100)] }, glosas: [] });
    expect(a.avisos.find(x => x.tipo === "preco")).toBeUndefined();
  });

  it("🔴 avisa quando as contas não deram para ler", () => {
    const a = analiseDaCompetencia({ contas: FALHA, glosas: [] });
    expect(a.avisos.some(x => /nenhum número abaixo é confiável/i.test(x.texto))).toBe(true);
  });

  it("🔴 avisa quando as glosas não deram para ler, e deixa o índice em branco", () => {
    const a = analiseDaCompetencia({ contas: [conta(1)], itensPorConta: { 1: [item(100)] }, glosas: FALHA });
    expect(a.indiceDeGlosa.valor).toBe(null);
    expect(a.recuperacao.valor).toBe(null);
    expect(a.avisos.some(x => /glosas/i.test(x.texto))).toBe(true);
  });

  it("mês limpo de verdade não gera aviso nenhum", () => {
    const a = analiseDaCompetencia({ contas: [conta(1)], itensPorConta: { 1: [item(100)] }, glosas: [] });
    expect(a.avisos).toEqual([]);
  });

  it("⚠️ nenhum campo do resultado volta NaN ou Infinity", () => {
    const a = analiseDaCompetencia({ contas: [], itensPorConta: {}, glosas: [] });
    expect(JSON.stringify(a)).not.toMatch(/NaN|Infinity/);
  });
});

describe("seriePorCompetencia", () => {
  const contas = [
    conta(1, { competencia: "2026-06" }), conta(2, { competencia: "2026-08" }),
    conta(3, { competencia: "2026-07" }),
  ];
  const itens = { 1: [item(100)], 2: [item(300)], 3: [item(200)] };

  it("ordena da competência mais antiga para a mais nova", () => {
    const s = seriePorCompetencia({ contas, itensPorConta: itens, glosas: [] });
    expect(s.map(x => x.competencia)).toEqual(["2026-06", "2026-07", "2026-08"]);
  });

  it("🔴 mês SEM dado não vira zero no gráfico", () => {
    // Preencher o buraco com zero desenharia uma queda a pique onde o
    // hospital nem usava o sistema ainda.
    const s = seriePorCompetencia({ contas, itensPorConta: itens, glosas: [] });
    expect(s).toHaveLength(3);
    expect(s.map(x => x.competencia)).not.toContain("2026-05");
  });

  it("casa a glosa com a competência dela", () => {
    const s = seriePorCompetencia({
      contas, itensPorConta: itens,
      glosas: [glosa(50, { competencia: "2026-07" })],
    });
    const jul = s.find(x => x.competencia === "2026-07");
    expect(jul.glosadoCentavos).toBe(5000);
    expect(jul.indice).toBeCloseTo(25, 6);   // 50 de 200
  });

  it("⚠️ glosa de competência sem conta NÃO inventa um mês no gráfico", () => {
    const s = seriePorCompetencia({
      contas, itensPorConta: itens,
      glosas: [glosa(50, { competencia: "2026-01" })],
    });
    expect(s.map(x => x.competencia)).not.toContain("2026-01");
  });

  it("competência sem faturado tem índice null, não zero", () => {
    const s = seriePorCompetencia({
      contas: [conta(9, { competencia: "2026-09" })], itensPorConta: {},
      glosas: [glosa(10, { competencia: "2026-09" })],
    });
    expect(s[0].indice).toBe(null);
  });
});

describe("🔴 glosa maior que o faturado é DADO QUE NÃO FECHA", () => {
  it("avisa, e diz que não é desempenho", () => {
    // Foi o que apareceu na caminhada do demo: índice de 59.155%, com cara
    // de indicador. A matemática estava certa; faltava a frase.
    const a = analiseDaCompetencia({
      contas: [conta(1)], itensPorConta: { 1: [item(10)] },
      glosas: [glosa(5915.5)],
    });
    const av = a.avisos.find(x => x.tipo === "inconsistencia");
    expect(av).toBeTruthy();
    expect(av.texto).toMatch(/não é desempenho/i);
    expect(av.texto).toMatch(/sem itens lançados|competência/i);
  });

  it("índice normal não dispara o aviso", () => {
    const a = analiseDaCompetencia({
      contas: [conta(1)], itensPorConta: { 1: [item(1000)] }, glosas: [glosa(100)],
    });
    expect(a.avisos.find(x => x.tipo === "inconsistencia")).toBeUndefined();
  });

  it("⚠️ exatamente 100% ainda não é inconsistência", () => {
    // Glosaram tudo o que foi faturado. É péssimo, mas é possível e o dado
    // fecha — o aviso aqui viraria ruído em cima de uma notícia já ruim.
    const a = analiseDaCompetencia({
      contas: [conta(1)], itensPorConta: { 1: [item(100)] }, glosas: [glosa(100)],
    });
    expect(a.indiceDeGlosa.valor).toBeCloseTo(100, 6);
    expect(a.avisos.find(x => x.tipo === "inconsistencia")).toBeUndefined();
  });

  it("o indicador continua mostrando o número, o aviso é ADICIONAL", () => {
    // Esconder o número seria pior: quem confere precisa ver o tamanho do
    // buraco para achar a conta errada.
    const a = analiseDaCompetencia({
      contas: [conta(1)], itensPorConta: { 1: [item(10)] }, glosas: [glosa(5915.5)],
    });
    expect(a.indiceDeGlosa.temValor).toBe(true);
    expect(a.indiceDeGlosa.valor).toBeGreaterThan(100);
  });
});
