// ═══════════════════════════════════════════════════════════
// PREVISÕES — o número que ninguém confere
//
// 🔴 Previsão é a tela mais fácil de falsificar do módulo: produz um valor
// com cara de autoridade a partir de suposição, e ninguém audita suposição
// — audita-se resultado, meses depois, quando virou orçamento.
//
// Os testes aqui existem para travar três recusas deliberadas:
//
//   1. NÃO extrapolar produção futura — só distribuir o que já foi faturado
//   2. NÃO publicar prazo com amostra pequena — abaixo de MIN_OBSERVACOES
//      o calendário sai VAZIO em vez de sair inventado
//   3. NÃO usar média — prazo de pagamento tem cauda longa, e um repasse
//      de 300 dias moveria o número para onde nenhum pagamento acontece
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  prazosObservados, estatisticaDePrazo, aging, projecao,
  avisosDaPrevisao, panorama, MIN_OBSERVACOES, FAIXAS,
} from "./previsoes.js";
import { listaLida } from "../util/leitura.js";

const FALHA = listaLida(null);
const HOJE = new Date(2026, 8, 1);   // 01/09/2026

const conta = (id, faturada_em) => ({ id, faturada_em, status: "faturada" });
const rep = (valor, recebido_em) => ({ valor, recebido_em });
const conc = (o = {}) => ({
  contaId: 1, estado: "sem_repasse", diferenca: 10000,
  diasDesdeFaturamento: 10, faturadaEm: "2026-08-22", ...o,
});

describe("prazosObservados", () => {
  it("mede do faturamento ao PRIMEIRO repasse", () => {
    // O primeiro, não o último: a pergunta é quando o dinheiro COMEÇA a
    // entrar. O último confundiria demora com parcelamento.
    const p = prazosObservados([conta(1, "2026-08-01")], {
      1: [rep(100, "2026-09-10"), rep(50, "2026-08-21")],
    });
    expect(p).toEqual([20]);
  });

  it("⚠️ ESTORNO não conta como recebimento", () => {
    // Ele é o contrário disso.
    const p = prazosObservados([conta(1, "2026-08-01")], {
      1: [rep(-500, "2026-08-05"), rep(500, "2026-08-31")],
    });
    expect(p).toEqual([30]);
  });

  it("conta sem repasse não entra", () => {
    expect(prazosObservados([conta(1, "2026-08-01")], { 1: [] })).toEqual([]);
  });

  it("conta sem data de faturamento não entra", () => {
    expect(prazosObservados([conta(1, null)], { 1: [rep(100, "2026-09-01")] })).toEqual([]);
  });

  it("⚠️ repasse ANTES do faturamento é data trocada, e fica fora", () => {
    // Prazo negativo poluiria a mediana com um dado que descreve digitação,
    // não pagamento.
    const p = prazosObservados([conta(1, "2026-09-01")], { 1: [rep(100, "2026-08-01")] });
    expect(p).toEqual([]);
  });

  it("devolve ordenado", () => {
    const p = prazosObservados([
      conta(1, "2026-01-01"), conta(2, "2026-01-01"), conta(3, "2026-01-01"),
    ], {
      1: [rep(1, "2026-03-01")], 2: [rep(1, "2026-01-11")], 3: [rep(1, "2026-02-01")],
    });
    expect(p).toEqual([...p].sort((a, b) => a - b));
  });
});

describe("🔴 estatisticaDePrazo — mediana, não média", () => {
  it("a mediana ignora o extremo; a média não", () => {
    // Quatro pagamentos em torno de 30 dias e um de 300. A mediana descreve
    // o caso típico; a média aponta para um prazo que não aconteceu nunca.
    const e = estatisticaDePrazo([28, 30, 31, 33, 300]);
    expect(e.mediana).toBe(31);
    expect(e.media).toBeGreaterThan(80);
    expect(e.mediana).not.toBe(e.media);
  });

  it("com número par de observações, a mediana é a média das duas do meio", () => {
    expect(estatisticaDePrazo([10, 20, 30, 40]).mediana).toBe(25);
  });

  it("🔴 abaixo de MIN_OBSERVACOES não é confiável", () => {
    const e = estatisticaDePrazo(Array(MIN_OBSERVACOES - 1).fill(30));
    expect(e.n).toBe(MIN_OBSERVACOES - 1);
    expect(e.confiavel).toBe(false);
    // O número EXISTE — só não deve ser usado para decidir.
    expect(e.mediana).toBe(30);
  });

  it("exatamente MIN_OBSERVACOES já é confiável", () => {
    expect(estatisticaDePrazo(Array(MIN_OBSERVACOES).fill(30)).confiavel).toBe(true);
  });

  it("lista vazia devolve nulls, não zeros", () => {
    // Prazo zero significaria "pagam no mesmo dia" — o oposto de "não sei".
    const e = estatisticaDePrazo([]);
    expect(e.mediana).toBe(null);
    expect(e.media).toBe(null);
    expect(e.mediana).not.toBe(0);
  });
});

describe("🔴 aging — o número que não depende de modelo nenhum", () => {
  const cs = [
    conc({ contaId: 1, diferenca: 100, diasDesdeFaturamento: 5 }),
    conc({ contaId: 2, diferenca: 200, diasDesdeFaturamento: 45 }),
    conc({ contaId: 3, diferenca: 300, diasDesdeFaturamento: 75 }),
    conc({ contaId: 4, diferenca: 400, diasDesdeFaturamento: 200 }),
  ];

  it("reparte pelas quatro faixas", () => {
    const a = aging(cs);
    expect(a.faixas.map(f => f.valor)).toEqual([100, 200, 300, 400]);
    expect(a.total).toBe(1000);
  });

  it("as fronteiras das faixas não deixam buraco nem sobreposição", () => {
    for (let d = 0; d <= 400; d++) {
      const cabe = FAIXAS.filter(f => d >= f.min && d <= f.max);
      expect(cabe.length, `dia ${d}`).toBe(1);
    }
  });

  it("conta QUITADA e NÃO FATURADA ficam fora", () => {
    const a = aging([...cs, conc({ estado: "quitada", diferenca: 999 }), conc({ estado: "nao_faturada", diferenca: 999 })]);
    expect(a.total).toBe(1000);
  });

  it("⚠️ recebida a MAIOR não é 'a receber'", () => {
    // Diferença negativa somaria contra o total e esconderia atraso real.
    const a = aging([...cs, conc({ estado: "a_maior", diferenca: -500 })]);
    expect(a.total).toBe(1000);
  });

  it("🔴 conta sem data de faturamento NÃO é enfiada numa faixa", () => {
    // Ela não tem idade. Somá-la em qualquer faixa inventaria uma data.
    const a = aging([...cs, conc({ contaId: 9, diferenca: 700, diasDesdeFaturamento: null })]);
    expect(a.total).toBe(1700);
    expect(a.semData.valor).toBe(700);
    expect(a.faixas.reduce((s, f) => s + f.valor, 0)).toBe(1000);
  });

  it("diferença nula (leitura falhou) não entra", () => {
    const a = aging([conc({ diferenca: null })]);
    expect(a.total).toBe(0);
  });
});

describe("🔴 projecao — o que ela SE RECUSA a fazer", () => {
  const prazoBom = [28, 30, 30, 31, 33];    // mediana 30, n=5
  const pendentes = [
    conc({ contaId: 1, diferenca: 1000, faturadaEm: "2026-08-25", diasDesdeFaturamento: 7 }),
    conc({ contaId: 2, diferenca: 2000, faturadaEm: "2026-09-01", diasDesdeFaturamento: 0 }),
    conc({ contaId: 3, diferenca: 3000, faturadaEm: "2026-05-01", diasDesdeFaturamento: 123 }),
  ];

  it("distribui pelo faturamento + mediana", () => {
    const p = projecao({ conciliacoes: pendentes, prazos: prazoBom, hoje: HOJE });
    // #1: 25/08 + 30 = 24/09  → set
    // #2: 01/09 + 30 = 01/10  → out
    expect(p.meses.find(m => m.competencia === "2026-09").valor).toBe(1000);
    expect(p.meses.find(m => m.competencia === "2026-10").valor).toBe(2000);
  });

  it("o que já passou do prazo típico vira ATRASO, não previsão", () => {
    // #3: 01/05 + 30 = 31/05, muito antes de hoje.
    const p = projecao({ conciliacoes: pendentes, prazos: prazoBom, hoje: HOJE });
    expect(p.atrasado).toBe(3000);
  });

  it("🔴 com histórico curto, o CALENDÁRIO sai vazio — não inventado", () => {
    // Esta é a recusa central da tela.
    const p = projecao({ conciliacoes: pendentes, prazos: [30, 30], hoje: HOJE });
    expect(p.confiavel).toBe(false);
    expect(p.meses).toEqual([]);
    // Mas o atraso continua sendo fato, e continua somado.
    expect(p.atrasado).toBe(6000);
  });

  it("⚠️ mês SEM previsão aparece com ZERO — aqui o zero é informação", () => {
    // Diferente do gráfico de produção, onde mês vazio não entra: ali zero
    // fingiria queda; aqui zero diz "nada previsto para novembro".
    const p = projecao({ conciliacoes: pendentes, prazos: prazoBom, hoje: HOJE, meses: 6 });
    expect(p.meses).toHaveLength(6);
    expect(p.meses.find(m => m.competencia === "2026-11").valor).toBe(0);
  });

  it("conta sem data de faturamento fica fora do calendário, e é contada", () => {
    const p = projecao({
      conciliacoes: [conc({ diferenca: 500, faturadaEm: null, diasDesdeFaturamento: null })],
      prazos: prazoBom, hoje: HOJE,
    });
    expect(p.semData).toBe(500);
    expect(p.meses.reduce((s, m) => s + m.valor, 0)).toBe(0);
  });

  it("quitada e não faturada nunca entram", () => {
    const p = projecao({
      conciliacoes: [conc({ estado: "quitada", diferenca: 999 }), conc({ estado: "nao_faturada", diferenca: 999 })],
      prazos: prazoBom, hoje: HOJE,
    });
    expect(p.atrasado).toBe(0);
    expect(p.meses.reduce((s, m) => s + m.valor, 0)).toBe(0);
  });

  it("⚠️ nenhum campo volta NaN", () => {
    const p = projecao({ conciliacoes: [], prazos: [], hoje: HOJE });
    expect(JSON.stringify(p)).not.toMatch(/NaN|Infinity/);
  });
});

describe("os avisos", () => {
  it("🔴 histórico curto: diz que o VALOR está certo e o CALENDÁRIO não foi feito", () => {
    const pr = projecao({ conciliacoes: [conc()], prazos: [30, 30], hoje: HOJE });
    const a = avisosDaPrevisao({ projecao: pr });
    expect(a[0].tipo).toBe("amostra");
    expect(a[0].texto).toMatch(/valor a receber está certo/i);
    expect(a[0].texto).toMatch(/prazo inventado/i);
  });

  it("⚠️ avisa quando média e mediana divergem muito (cauda longa)", () => {
    const pr = projecao({ conciliacoes: [conc()], prazos: [10, 12, 13, 14, 300], hoje: HOJE });
    const a = avisosDaPrevisao({ projecao: pr });
    expect(a.some(x => x.tipo === "dispersao")).toBe(true);
  });

  it("prazos consistentes não geram aviso de dispersão", () => {
    const pr = projecao({ conciliacoes: [conc()], prazos: [29, 30, 30, 31, 32], hoje: HOJE });
    expect(avisosDaPrevisao({ projecao: pr }).some(x => x.tipo === "dispersao")).toBe(false);
  });

  it("🔴 mais de 90 dias: diz que o provável não é demora, é glosa não registrada", () => {
    const ag = aging([conc({ diferenca: 500, diasDesdeFaturamento: 200 })]);
    const a = avisosDaPrevisao({ aging: ag });
    expect(a.some(x => /glosa que chegou e ninguém registrou/i.test(x.texto))).toBe(true);
  });

  it("🔴 leitura que falhou para tudo, e diz que zero é falta de leitura", () => {
    const a = avisosDaPrevisao({ contasFalharam: true });
    expect(a).toHaveLength(1);
    expect(a[0].texto).toMatch(/falta de leitura/i);
  });

  it("cenário limpo não gera aviso nenhum", () => {
    const cs = [conc({ diferenca: 100, diasDesdeFaturamento: 10, faturadaEm: "2026-08-22" })];
    const pr = projecao({ conciliacoes: cs, prazos: [29, 30, 30, 31, 32], hoje: HOJE });
    expect(avisosDaPrevisao({ projecao: pr, aging: aging(cs) })).toEqual([]);
  });
});

describe("panorama", () => {
  it("junta tudo e não estoura com entrada vazia", () => {
    const p = panorama({ conciliacoes: [], contas: [], repassesPorConta: {}, hoje: HOJE });
    expect(p.aging.total).toBe(0);
    expect(JSON.stringify(p)).not.toMatch(/NaN|Infinity/);
  });

  it("leitura que falhou vira aviso, não silêncio", () => {
    const p = panorama({ conciliacoes: FALHA, contas: FALHA, hoje: HOJE });
    expect(p.avisos.some(x => x.tipo === "leitura")).toBe(true);
  });
});
