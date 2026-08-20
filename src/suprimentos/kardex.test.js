// ═══════════════════════════════════════════════════════════
// Kardex do almoxarifado.
//
// Duas metades com propósitos diferentes:
//
// 1. As funções EXTRAÍDAS do App.jsx. Estes testes travam o comportamento
//    que já existia — inclusive as esquisitices. Se algum dia alguém achar
//    que `custoMedioPonderado` devolvendo null é bug, que descubra pelo
//    teste vermelho e decida de propósito, não por acidente de refatoração.
//
// 2. A CONCILIAÇÃO, regra nova, validada por mutação:
//    • `tipo !== 'entrada' → −q` trocado por `tipo === 'saida' ? −q : +q`
//      ...... derruba "espelha o trigger, inclusive o defeito"
//    • `historicoCompleto` ignorado ................ derruba o truncamento
//    • comparação de float sem arredondar .......... derruba o caso decimal
//    • órfão contado dentro de `linhas` ............ derruba a contagem
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  SUP_LEAD_PADRAO, SUP_MARGEM_SEG, supPrazoReposicao, supSaldoTotal,
  supLeadTimeMap, custoMedioPonderado, supPedidoTotal,
  efeitoDoMovimento, tipoValido, conciliar, prioridadeDaConciliacao,
} from "./kardex.js";

// ── comportamento herdado do App.jsx ───────────────────────

describe("supSaldoTotal", () => {
  const lotes = [
    { item_id: 1, quantidade: 10 }, { item_id: 1, quantidade: 5 },
    { item_id: 2, quantidade: 7 },  { item_id: 1, quantidade: null },
  ];
  it("soma só os lotes do item", () => expect(supSaldoTotal(1, lotes)).toBe(15));
  it("lote com quantidade nula não quebra a soma", () => expect(supSaldoTotal(1, lotes)).toBe(15));
  it("item sem lote nenhum é zero", () => expect(supSaldoTotal(99, lotes)).toBe(0));
  it("soma negativo como negativo — não esconde o estado impossível", () => {
    expect(supSaldoTotal(3, [{ item_id: 3, quantidade: -4 }])).toBe(-4);
  });
});

describe("supPrazoReposicao", () => {
  it("usa o prazo do fornecedor mais a margem", () => {
    expect(supPrazoReposicao(1, { 1: 10 })).toBe(10 + SUP_MARGEM_SEG);
  });
  it("sem prazo cadastrado cai no padrão", () => {
    expect(supPrazoReposicao(9, {})).toBe(SUP_LEAD_PADRAO + SUP_MARGEM_SEG);
  });
  it("prazo zero cai no padrão (comportamento herdado do `||`)", () => {
    // `Number(0) || SUP_LEAD_PADRAO` é o padrão. Fica registrado: entrega no
    // mesmo dia é tratada como prazo desconhecido.
    expect(supPrazoReposicao(1, { 1: 0 })).toBe(SUP_LEAD_PADRAO + SUP_MARGEM_SEG);
  });
});

describe("supLeadTimeMap", () => {
  const forns = [{ id: 7, lead_time_dias: 20 }, { id: 8, lead_time_dias: null }, { id: 9, lead_time_dias: "" }];
  it("pega o fornecedor da entrada mais recente que tenha prazo", () => {
    const entradas = [{ item_id: 1, fornecedor_id: 7 }, { item_id: 1, fornecedor_id: 8 }];
    expect(supLeadTimeMap(entradas, forns)).toEqual({ 1: 20 });
  });
  it("pula fornecedor sem prazo e segue procurando", () => {
    const entradas = [{ item_id: 1, fornecedor_id: 8 }, { item_id: 1, fornecedor_id: 7 }];
    expect(supLeadTimeMap(entradas, forns)).toEqual({ 1: 20 });
  });
  it("prazo vazio conta como ausente", () => {
    expect(supLeadTimeMap([{ item_id: 1, fornecedor_id: 9 }], forns)).toEqual({});
  });
});

describe("custoMedioPonderado", () => {
  it("pondera saldo antigo com a entrada nova", () => {
    // 10 un a R$ 2 + 10 un a R$ 4 = R$ 3
    expect(custoMedioPonderado(2, 10, 10, 4)).toBe(3);
  });
  it("sem base anterior adota o custo da entrada", () => {
    expect(custoMedioPonderado(0, 0, 10, 4)).toBe(4);
    expect(custoMedioPonderado(null, 50, 10, 4)).toBe(4);
  });
  it("entrada sem custo devolve null — quem chama mantém o custo anterior", () => {
    expect(custoMedioPonderado(2, 10, 10, 0)).toBeNull();
    expect(custoMedioPonderado(2, 10, 10, null)).toBeNull();
  });
  it("quantidade de entrada zero devolve null", () => {
    expect(custoMedioPonderado(2, 10, 0, 4)).toBeNull();
  });
  it("saldo negativo é tratado como zero — não inverte a média", () => {
    expect(custoMedioPonderado(2, -10, 10, 4)).toBe(4);
  });
});

describe("supPedidoTotal", () => {
  it("soma qtd × custo dos itens", () => {
    expect(supPedidoTotal({ itens: [{ qtd: 2, custo_unit: 3 }, { qtd: 10, custo_unit: 1.5 }] })).toBe(21);
  });
  it("pedido sem itens é zero", () => {
    expect(supPedidoTotal({})).toBe(0);
    expect(supPedidoTotal({ itens: null })).toBe(0);
  });
  it("item sem custo conta como zero, não quebra", () => {
    expect(supPedidoTotal({ itens: [{ qtd: 5 }] })).toBe(0);
  });
});

// ── conciliação (regra nova) ───────────────────────────────

describe("efeitoDoMovimento — espelha o trigger, inclusive o defeito", () => {
  it("entrada soma", () => expect(efeitoDoMovimento({ tipo: "entrada", quantidade: 5 })).toBe(5));
  it("saida subtrai", () => expect(efeitoDoMovimento({ tipo: "saida", quantidade: 5 })).toBe(-5));

  it("'saída' com acento SUBTRAI — é o que o banco fez, e por isso é o que somamos", () => {
    // O trigger só confere saldo quando o tipo é exatamente 'saida', mas
    // subtrai para qualquer coisa que não seja 'entrada'. Se esta função
    // "corrigisse" o tipo estragado, a conciliação acusaria divergência
    // justamente nos lotes onde o saldo bate com o que foi gravado — e a
    // equipe caçaria o rombo no lugar errado.
    expect(efeitoDoMovimento({ tipo: "saída", quantidade: 5 })).toBe(-5);
    expect(efeitoDoMovimento({ tipo: "AJUSTE", quantidade: 5 })).toBe(-5);
  });

  it("quantidade ausente ou não numérica não vira NaN", () => {
    expect(efeitoDoMovimento({ tipo: "entrada" })).toBe(0);
    expect(efeitoDoMovimento({ tipo: "entrada", quantidade: "abc" })).toBe(0);
    expect(efeitoDoMovimento(null)).toBe(0);
  });
});

describe("tipoValido", () => {
  it("aceita só os dois que o sistema reconhece", () => {
    expect(tipoValido("entrada")).toBe(true);
    expect(tipoValido("saida")).toBe(true);
    expect(tipoValido("saída")).toBe(false);
    expect(tipoValido("Entrada")).toBe(false);
    expect(tipoValido(null)).toBe(false);
  });
});

describe("conciliar", () => {
  const lotes = [{ id: 10, item_id: 1, lote: "L1", quantidade: 8 }];

  it("kardex bate com o saldo → zero divergência", () => {
    const mv = [
      { lote_id: 10, tipo: "entrada", quantidade: 10 },
      { lote_id: 10, tipo: "saida", quantidade: 2 },
    ];
    const r = conciliar(mv, lotes);
    expect(r.conciliavel).toBe(true);
    expect(r.divergentes).toBe(0);
    expect(r.linhas[0]).toMatchObject({ saldo: 8, kardex: 8, diferenca: 0 });
  });

  it("saldo maior que o histórico acusa a diferença, com sinal", () => {
    const r = conciliar([{ lote_id: 10, tipo: "entrada", quantidade: 5 }], lotes);
    expect(r.divergentes).toBe(1);
    expect(r.linhas[0].diferenca).toBe(3);   // saldo 8 − kardex 5
  });

  it("decimal não vira divergência de arredondamento", () => {
    // 0.1 + 0.2 !== 0.3 em ponto flutuante. Sem arredondar, todo item em
    // litro/mililitro apareceria divergente e o indicador seria descartado.
    const l = [{ id: 10, item_id: 1, quantidade: 0.3 }];
    const mv = [
      { lote_id: 10, tipo: "entrada", quantidade: 0.1 },
      { lote_id: 10, tipo: "entrada", quantidade: 0.2 },
    ];
    expect(conciliar(mv, l).divergentes).toBe(0);
  });

  it("🔴 histórico truncado NÃO concilia — devolve 'não sei', não 'está errado'", () => {
    const mv = [{ lote_id: 10, tipo: "entrada", quantidade: 1 }];
    const r = conciliar(mv, lotes, { historicoCompleto: false });
    expect(r.conciliavel).toBe(false);
    expect(r.divergentes).toBe(0);
    expect(r.linhas).toEqual([]);
    expect(r.totalLotes).toBe(1);   // sabe quantos lotes existem, só não os julga
  });

  it("lote negativo é contado à parte — é estado impossível, não imprecisão", () => {
    const l = [{ id: 10, item_id: 1, quantidade: -2 }];
    const r = conciliar([{ lote_id: 10, tipo: "saida", quantidade: 2 }], l);
    expect(r.negativos).toBe(1);
    expect(r.linhas[0].negativo).toBe(true);
  });

  it("lote com saldo e nenhum movimento é sinalizado", () => {
    // Kardex apagado pelo cascade, ou lote nascido antes do trigger.
    const r = conciliar([], lotes);
    expect(r.semHistorico).toBe(1);
    expect(r.divergentes).toBe(1);
  });

  it("lote zerado sem histórico não é alarme", () => {
    const r = conciliar([], [{ id: 11, item_id: 2, quantidade: 0 }]);
    expect(r.semHistorico).toBe(0);
    expect(r.divergentes).toBe(0);
  });

  it("conta o tipo inválido sem deixar de conciliar o lote", () => {
    const mv = [
      { lote_id: 10, tipo: "entrada", quantidade: 10 },
      { lote_id: 10, tipo: "saída", quantidade: 2 },   // acento: subtraiu no banco
    ];
    const r = conciliar(mv, lotes);
    expect(r.tiposInvalidos).toBe(1);
    expect(r.divergentes).toBe(0);                     // o saldo bate com o que foi gravado
    expect(r.linhas[0].tiposInvalidos).toBe(1);
  });

  it("movimento apontando para lote inexistente vira órfão, fora de `linhas`", () => {
    const mv = [
      { lote_id: 10, tipo: "entrada", quantidade: 8 },
      { lote_id: 77, tipo: "entrada", quantidade: 3 },
    ];
    const r = conciliar(mv, lotes);
    expect(r.orfaos).toBe(1);
    expect(r.linhas).toHaveLength(1);
    expect(r.totalLotes).toBe(1);
  });

  it("movimento sem lote_id é ignorado na atribuição, não somado ao acaso", () => {
    const mv = [
      { lote_id: 10, tipo: "entrada", quantidade: 8 },
      { lote_id: null, tipo: "entrada", quantidade: 99 },
    ];
    expect(conciliar(mv, lotes).divergentes).toBe(0);
  });

  it("entrada que não é lista devolve não-conciliável", () => {
    expect(conciliar(null, lotes).conciliavel).toBe(false);
    expect(conciliar([], null).conciliavel).toBe(false);
  });
});

describe("prioridadeDaConciliacao", () => {
  it("negativo vem antes da maior diferença", () => {
    const linhas = [
      { lote_id: 1, diferenca: 500, negativo: false, semHistorico: false, tiposInvalidos: 0 },
      { lote_id: 2, diferenca: -2, negativo: true, semHistorico: false, tiposInvalidos: 0 },
    ];
    expect(prioridadeDaConciliacao(linhas).map(x => x.lote_id)).toEqual([2, 1]);
  });

  it("o que está certo não entra na fila", () => {
    const linhas = [{ lote_id: 1, diferenca: 0, negativo: false, semHistorico: false, tiposInvalidos: 0 }];
    expect(prioridadeDaConciliacao(linhas)).toEqual([]);
  });

  it("tipo inválido entra mesmo com diferença zero — o saldo bate, o dado não", () => {
    const linhas = [{ lote_id: 1, diferenca: 0, negativo: false, semHistorico: false, tiposInvalidos: 2 }];
    expect(prioridadeDaConciliacao(linhas)).toHaveLength(1);
  });
});
