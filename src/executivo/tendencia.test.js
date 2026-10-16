// ═══════════════════════════════════════════════════════════
// TENDÊNCIA — testes do motor
//
// O que está travado aqui é, acima de tudo, a HONESTIDADE DA CURVA: dia fora
// da janela de leitura sai marcado como cego, alta no dia não conta como
// leito-dia, internação sem data de entrada é descartada em vez de chutada,
// e "tendência" não é declarada com dois pontos.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  somarDias, diasEntre, intervalosDeInternacao, censoDiario,
  direcaoDaSerie, pontosDaSerie, pontoMaisProximo,
} from "./tendencia.js";

describe("datas", () => {
  it("soma dias virando o mês e o ano", () => {
    expect(somarDias("2026-09-30", 1)).toBe("2026-10-01");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("diasEntre devolve o intervalo fechado", () => {
    expect(diasEntre("2026-09-13", "2026-09-15")).toEqual(["2026-09-13", "2026-09-14", "2026-09-15"]);
    expect(diasEntre("2026-09-13", "2026-09-13")).toEqual(["2026-09-13"]);
  });

  it("data invertida não trava a tela", () => {
    expect(diasEntre("2026-09-15", "2026-09-13")).toEqual([]);
  });
});

describe("intervalosDeInternacao", () => {
  const SAIDAS = [
    { data_internacao: "2026-09-10", data_alta: "2026-09-13", setor: "Clínica Médica" },
    { data_internacao: "2026-09-12", data_alta: "2026-09-14", setor: "UTI Adulto" },
    { data_internacao: null, data_alta: "2026-09-14", setor: "UTI Adulto" },   // sem começo
  ];
  const LEITOS = [
    { status: "ocupado", data_internacao: "2026-09-13", setor: "Clínica Médica" },
    { status: "livre", data_internacao: null, setor: "Clínica Médica" },
    { status: "ocupado", data_internacao: null, setor: "UTI Adulto" },         // sem começo
  ];

  it("junta as internações encerradas com as que ainda correm", () => {
    const r = intervalosDeInternacao(SAIDAS, LEITOS);
    expect(r.itens).toHaveLength(3);
    expect(r.itens.filter(i => i.encerrada)).toHaveLength(2);
    expect(r.itens.find(i => !i.encerrada)).toMatchObject({ inicio: "2026-09-13", fim: null });
  });

  it("🔴 internação sem data de entrada é DESCARTADA, não chutada", () => {
    const r = intervalosDeInternacao(SAIDAS, LEITOS);
    expect(r.semInicio).toBe(2);
    // inventar um começo inventaria leito-dia, e leito-dia é o denominador
    expect(r.itens.every(i => !!i.inicio)).toBe(true);
  });

  it("leito livre não vira internação", () => {
    const r = intervalosDeInternacao([], [{ status: "livre", data_internacao: "2026-09-13" }]);
    expect(r.itens).toEqual([]);
  });
});

describe("censoDiario", () => {
  const { itens } = intervalosDeInternacao(
    [{ data_internacao: "2026-09-10", data_alta: "2026-09-13" }],
    [{ status: "ocupado", data_internacao: "2026-09-12" }]);

  it("conta quem estava internado em cada dia", () => {
    const r = censoDiario(itens, { de: "2026-09-10", ate: "2026-09-14", operacionais: 10 });
    const por = Object.fromEntries(r.linhas.map(l => [l.dia, l.ocupados]));
    expect(por["2026-09-10"]).toBe(1);
    expect(por["2026-09-11"]).toBe(1);
    expect(por["2026-09-12"]).toBe(2);   // o segundo entrou
    expect(por["2026-09-14"]).toBe(1);   // o primeiro já saiu
  });

  it("🔴 alta no dia NÃO ocupa o dia (senão o leito-dia conta duas vezes)", () => {
    const r = censoDiario(itens, { de: "2026-09-13", ate: "2026-09-13", operacionais: 10 });
    expect(r.linhas[0].ocupados).toBe(1);   // só o que continua internado
  });

  it("a taxa usa os leitos operacionais e declara que a base é de hoje", () => {
    const r = censoDiario(itens, { de: "2026-09-12", ate: "2026-09-12", operacionais: 8 });
    expect(r.linhas[0].pct).toBe(25);      // 2 de 8
    expect(r.baseDeHoje).toBe(true);
  });

  it("sem leito operacional a taxa é null, não zero", () => {
    const r = censoDiario(itens, { de: "2026-09-12", ate: "2026-09-12", operacionais: 0 });
    expect(r.linhas[0].pct).toBeNull();
  });

  it("🔴 dia anterior à janela de leitura sai marcado como CEGO", () => {
    // É o defeito que este arquivo existe para evitar: fora da janela a
    // contagem não enxerga quem já tinha saído, e a curva desce sozinha
    // com cara de tendência de queda.
    const r = censoDiario(itens, {
      de: "2026-09-08", ate: "2026-09-14", operacionais: 10, janelaDesde: "2026-09-11",
    });
    expect(r.diasCegos).toBe(3);                       // 08, 09, 10
    expect(r.desdeConfiavel).toBe("2026-09-11");
    expect(r.linhas.find(l => l.dia === "2026-09-09").confiavel).toBe(false);
    expect(r.linhas.find(l => l.dia === "2026-09-12").confiavel).toBe(true);
  });

  it("sem janela declarada, todos os dias são confiáveis", () => {
    const r = censoDiario(itens, { de: "2026-09-10", ate: "2026-09-12", operacionais: 10 });
    expect(r.diasCegos).toBe(0);
    expect(r.linhas.every(l => l.confiavel)).toBe(true);
  });
});

describe("direcaoDaSerie", () => {
  const serie = pcts => pcts.map((pct, i) => ({ dia: `2026-09-${String(i + 1).padStart(2, "0")}`, pct, confiavel: true }));

  it("🔴 dois pontos não são tendência", () => {
    const r = direcaoDaSerie(serie([50, 80]));
    expect(r.avaliado).toBe(false);
    expect(r.direcao).toBeNull();
  });

  it("reconhece subida e descida", () => {
    expect(direcaoDaSerie(serie([50, 52, 70, 74])).direcao).toBe("subindo");
    expect(direcaoDaSerie(serie([80, 78, 60, 58])).direcao).toBe("descendo");
  });

  it("variação de menos de 1 ponto é ruído, não movimento", () => {
    expect(direcaoDaSerie(serie([70, 71, 71, 70])).direcao).toBe("estavel");
  });

  it("🔴 dia CEGO não entra na conta da tendência", () => {
    const linhas = [
      { dia: "2026-09-01", pct: 10, confiavel: false },   // cego: puxaria para "subindo"
      { dia: "2026-09-02", pct: 10, confiavel: false },
      { dia: "2026-09-03", pct: 70, confiavel: true },
      { dia: "2026-09-04", pct: 71, confiavel: true },
      { dia: "2026-09-05", pct: 70, confiavel: true },
      { dia: "2026-09-06", pct: 70, confiavel: true },
    ];
    const r = direcaoDaSerie(linhas);
    expect(r.dias).toBe(4);
    expect(r.direcao).toBe("estavel");
  });

  it("dia sem taxa (sem leito cadastrado) também fica fora", () => {
    const linhas = [...Array(4)].map((_, i) => ({ dia: `d${i}`, pct: null, confiavel: true }));
    expect(direcaoDaSerie(linhas).avaliado).toBe(false);
  });
});

describe("pontosDaSerie", () => {
  const linhas = [
    { dia: "2026-09-01", pct: 0, confiavel: true },
    { dia: "2026-09-02", pct: 50, confiavel: true },
    { dia: "2026-09-03", pct: 100, confiavel: true },
  ];

  it("🔴 o eixo Y vai de 0 a 100, não se ajusta aos dados", () => {
    // Eixo que começa em 60% faz variação de 3 pontos parecer despenho.
    const r = pontosDaSerie(linhas, { largura: 100, altura: 200, margem: 0 });
    expect(r.pontos[0].y).toBe(200);    // 0%  → base
    expect(r.pontos[1].y).toBe(100);    // 50% → meio
    expect(r.pontos[2].y).toBe(0);      // 100% → topo
  });

  it("distribui os pontos no eixo X respeitando a margem", () => {
    const r = pontosDaSerie(linhas, { largura: 100, altura: 100, margem: 10 });
    expect(r.pontos[0].x).toBe(10);
    expect(r.pontos[2].x).toBe(90);
  });

  it("o caminho começa com M e a área fecha na base", () => {
    const r = pontosDaSerie(linhas, { largura: 100, altura: 100, margem: 0 });
    expect(r.caminho.startsWith("M")).toBe(true);
    expect(r.area.endsWith("Z")).toBe(true);
  });

  it("série vazia não gera caminho quebrado", () => {
    expect(pontosDaSerie([], {})).toMatchObject({ pontos: [], caminho: "", area: "" });
    expect(pontosDaSerie([{ pct: null }], {})).toMatchObject({ pontos: [] });
  });

  it("um ponto só não divide por zero", () => {
    const r = pontosDaSerie([linhas[1]], { largura: 100, altura: 100, margem: 10 });
    expect(r.pontos).toHaveLength(1);
    expect(Number.isFinite(r.pontos[0].x)).toBe(true);
  });
});

describe("pontoMaisProximo", () => {
  const pontos = [{ x: 0, dia: "a" }, { x: 10, dia: "b" }, { x: 20, dia: "c" }];

  it("acha o ponto sob o cursor", () => {
    expect(pontoMaisProximo(pontos, 11).dia).toBe("b");
    expect(pontoMaisProximo(pontos, 19).dia).toBe("c");
  });

  it("fora da faixa, gruda na ponta mais próxima", () => {
    expect(pontoMaisProximo(pontos, -50).dia).toBe("a");
    expect(pontoMaisProximo(pontos, 500).dia).toBe("c");
  });

  it("sem pontos ou sem x, não devolve lixo", () => {
    expect(pontoMaisProximo([], 5)).toBeNull();
    expect(pontoMaisProximo(pontos, null)).toBeNull();
  });
});
