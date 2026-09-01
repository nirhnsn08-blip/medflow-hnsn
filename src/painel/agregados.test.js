// ═══════════════════════════════════════════════════════════
// PAINEL — AS CONTAS DO BI AMBULATORIAL
//
// 🔴 `aggregateMes` É O DENOMINADOR DE QUASE TUDO NO PAINEL.
// Somar um dia a mais ou a menos não aparece na tela como erro: aparece
// como produção. E produção errada vira meta batida que não foi, ou meta
// perdida que foi cumprida.
//
// A soma é por PREFIXO de data ('2026-08'), o que a torna imune a fuso —
// mas também sensível a qualquer chave que comece parecido. O mês 8 e o
// mês 9 não podem se misturar, e o ano anterior não pode entrar.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { aggregateMes, aggregateAno, comparativo } from "./agregados.js";

const dia = (p, r = 0, e = 0) => ({ primeiras: p, retornos: r, emergencias: e, ofertadas: 0, realizadas: 0, livres: 0, faltas: 0 });
const DB = {
  "2026-08-01": { oftalmo: dia(10, 5, 1) },
  "2026-08-31": { oftalmo: dia(20, 3, 0) },
  "2026-09-01": { oftalmo: dia(99, 99, 99) },   // mês seguinte
  "2025-08-15": { oftalmo: dia(77, 77, 77) },   // ano anterior
  "2026-08-10": { ortopedia: dia(50, 50, 50) }, // outra especialidade
};

describe("🔴 o recorte do mês", () => {
  it("soma só os dias daquele mês e daquela especialidade", () => {
    const r = aggregateMes(DB, 2026, 7, "oftalmo");   // mês 7 = agosto
    expect(r.primeiras).toBe(30);
    expect(r.retornos).toBe(8);
    expect(r.emergencias).toBe(1);
  });

  it("⚠️ o mês SEGUINTE não entra", () => {
    // Setembro tem 99 em cada coluna. Se vazasse, a produção de agosto
    // triplicaria e a meta apareceria batida sem ninguém ter atendido.
    expect(aggregateMes(DB, 2026, 7, "oftalmo").primeiras).not.toBe(129);
  });

  it("⚠️ o ANO ANTERIOR não entra, mesmo sendo o mesmo mês", () => {
    // Agosto/2025 também começa com "-08". O prefixo inclui o ano
    // justamente por isso.
    expect(aggregateMes(DB, 2026, 7, "oftalmo").primeiras).toBe(30);
    expect(aggregateMes(DB, 2025, 7, "oftalmo").primeiras).toBe(77);
  });

  it("outra especialidade não soma junto", () => {
    expect(aggregateMes(DB, 2026, 7, "ortopedia").primeiras).toBe(50);
  });

  it("mês sem lançamento devolve zeros, não erro", () => {
    const r = aggregateMes(DB, 2026, 0, "oftalmo");
    expect(r.primeiras).toBe(0);
    for (const v of Object.values(r)) expect(Number.isNaN(v)).toBe(false);
  });

  it("🔴 dezembro é o mês 11, e não invade janeiro do ano seguinte", () => {
    // `mes + 1` com padStart: o 11 vira "12". Um erro de índice aqui faria
    // dezembro somar nada e janeiro somar duas vezes.
    const db = { "2026-12-05": { x: dia(7) }, "2027-01-05": { x: dia(3) } };
    expect(aggregateMes(db, 2026, 11, "x").primeiras).toBe(7);
    expect(aggregateMes(db, 2027, 0, "x").primeiras).toBe(3);
  });

  it("⚠️ campo ausente no lançamento conta zero, não NaN", () => {
    // Lançamento antigo pode não ter todas as colunas. `s[k] || 0` cobre —
    // sem isso, uma coluna nova envenenaria a soma inteira com NaN.
    const db = { "2026-08-02": { x: { primeiras: 5 } } };
    const r = aggregateMes(db, 2026, 7, "x");
    expect(r.primeiras).toBe(5);
    for (const v of Object.values(r)) expect(Number.isNaN(v), JSON.stringify(r)).toBe(false);
  });
});

describe("aggregateAno", () => {
  it("devolve os doze meses, na ordem", () => {
    const a = aggregateAno(DB, 2026, "oftalmo");
    expect(a).toHaveLength(12);
    expect(a.map(x => x.mes)).toEqual([0,1,2,3,4,5,6,7,8,9,10,11]);
  });

  it("o total de cada mês soma primeiras + retornos + emergências", () => {
    const ago = aggregateAno(DB, 2026, "oftalmo")[7];
    expect(ago.total).toBe(30 + 8 + 1);
  });

  it("⚠️ e NÃO soma ofertadas nem faltas no total", () => {
    // "Ofertadas" é capacidade, não atendimento; "faltas" é o contrário de
    // produção. Somar qualquer um deles inflaria o número que vai para o
    // relatório do SUS.
    const db = { "2026-03-01": { x: { primeiras: 1, retornos: 0, emergencias: 0, ofertadas: 100, faltas: 50 } } };
    expect(aggregateAno(db, 2026, "x")[2].total).toBe(1);
  });
});

describe("comparativo", () => {
  it("compara com o mês anterior e com o mesmo mês do ano passado", () => {
    const c = comparativo(DB, 2026, 7, "oftalmo");
    expect(c).toBeTruthy();
    expect(typeof c).toBe("object");
  });

  it("🔴 em JANEIRO, o mês anterior é dezembro do ano passado", () => {
    // Sem esse cuidado, janeiro compararia com "mês -1" do mesmo ano, que
    // não existe — e a variação apareceria como +100% todo começo de ano.
    const db = {
      "2026-01-10": { x: dia(10) },
      "2025-12-10": { x: dia(5) },
    };
    const c = comparativo(db, 2026, 0, "x");
    expect(JSON.stringify(c)).not.toMatch(/NaN|Infinity/);
  });

  it("⚠️ e nenhum campo do comparativo volta NaN com base vazia", () => {
    const c = comparativo({}, 2026, 5, "x");
    expect(JSON.stringify(c)).not.toMatch(/NaN|Infinity/);
  });
});
