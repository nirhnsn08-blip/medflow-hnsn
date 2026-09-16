import { describe, it, expect } from "vitest";
import {
  montarVigilancia, avaliarCaso, classificarFrescor, minutosDesde,
  prioridade, medidaMaisRecente, vitaisDoRegistro, FRESCOR, INTERVALO_PADRAO,
} from "./vigilancia.js";
import { NIVEL } from "./meows.js";

const AGORA = new Date("2026-09-12T12:00:00Z");
const hMin = m => new Date(AGORA.getTime() - m * 60000).toISOString();

const NORMAL = { pa_sis: 128, pa_dia: 82, fc: 88, fr: 18, temp: 36.6, sato2: 98, consciencia: "alerta" };
const GRAVE  = { ...NORMAL, pa_sis: 165 };          // 1 vermelho basta
const ALERTA = { ...NORMAL, fc: 105 };              // 1 amarelo

describe("minutosDesde", () => {
  it("conta os minutos e nunca devolve negativo", () => {
    expect(minutosDesde(hMin(90), AGORA)).toBe(90);
    expect(minutosDesde(new Date(AGORA.getTime() + 60000), AGORA)).toBe(0);
  });
  it("null quando a data não dá para ler", () => {
    expect(minutosDesde(null, AGORA)).toBeNull();
    expect(minutosDesde("qualquer coisa", AGORA)).toBeNull();
  });
});

describe("classificarFrescor", () => {
  it("o prazo vem do nível: 30 min no vermelho, 4 h no verde", () => {
    expect(classificarFrescor(NIVEL.VERMELHO, 20)).toBe(FRESCOR.RECENTE);
    expect(classificarFrescor(NIVEL.VERMELHO, 45)).toBe(FRESCOR.ATRASADO);
    expect(classificarFrescor(NIVEL.VERMELHO, 70)).toBe(FRESCOR.VENCIDO);
    // os mesmos 45 minutos, numa paciente verde, ainda estão no prazo
    expect(classificarFrescor(NIVEL.VERDE, 45)).toBe(FRESCOR.RECENTE);
    expect(classificarFrescor(NIVEL.VERDE, 300)).toBe(FRESCOR.ATRASADO);
    expect(classificarFrescor(NIVEL.VERDE, 500)).toBe(FRESCOR.VENCIDO);
  });
  it("sem minutos é categoria própria, não 'recente'", () => {
    expect(classificarFrescor(NIVEL.VERDE, null)).toBe(FRESCOR.SEM_MEDIDA);
  });
  it("aceita intervalo da casa no lugar do padrão", () => {
    expect(classificarFrescor(NIVEL.VERDE, 100, { ...INTERVALO_PADRAO, [NIVEL.VERDE]: 60 })).toBe(FRESCOR.ATRASADO);
  });
});

describe("prioridade", () => {
  it("quem não tem medida vai na frente de todo mundo", () => {
    expect(prioridade(NIVEL.VERDE, FRESCOR.SEM_MEDIDA, false)).toBe(0);
    expect(prioridade(NIVEL.VERMELHO, FRESCOR.RECENTE, true)).toBe(1);
  });
  it("entre verdes, o atraso é que ordena", () => {
    const recente = prioridade(NIVEL.VERDE, FRESCOR.RECENTE, true);
    const atrasada = prioridade(NIVEL.VERDE, FRESCOR.ATRASADO, true);
    const vencida = prioridade(NIVEL.VERDE, FRESCOR.VENCIDO, true);
    expect(vencida).toBeLessThan(atrasada);
    expect(atrasada).toBeLessThan(recente);
  });
});

describe("avaliarCaso", () => {
  it("junta escore e frescor numa linha só", () => {
    const l = avaliarCaso({ nome: "A. R. Lima", leito: "302", vitais: GRAVE, medidoEm: hMin(10) }, { agora: AGORA });
    expect(l.meows.nivel).toBe(NIVEL.VERMELHO);
    expect(l.minutos).toBe(10);
    expect(l.frescor).toBe(FRESCOR.RECENTE);
    expect(l.prazoMin).toBe(30);
    expect(l.precisaReavaliar).toBe(false);
  });

  it("vitais em branco NÃO viram verde — viram sem medida", () => {
    const l = avaliarCaso({ nome: "Sem vitais", vitais: {}, medidoEm: hMin(5) }, { agora: AGORA });
    expect(l.meows.avaliado).toBe(false);
    expect(l.frescor).toBe(FRESCOR.SEM_MEDIDA);
    expect(l.minutos).toBeNull();
    expect(l.prioridade).toBe(0);
    expect(l.precisaReavaliar).toBe(true);
  });

  it("verde fora do prazo pede reavaliação mesmo estando verde", () => {
    const l = avaliarCaso({ nome: "Verde velha", vitais: NORMAL, medidoEm: hMin(310) }, { agora: AGORA });
    expect(l.meows.nivel).toBe(NIVEL.VERDE);
    expect(l.frescor).toBe(FRESCOR.ATRASADO);
    expect(l.precisaReavaliar).toBe(true);
  });
});

describe("montarVigilancia", () => {
  const casos = [
    { nome: "Verde agora",   vitais: NORMAL, medidoEm: hMin(20) },
    { nome: "Vermelha",      vitais: GRAVE,  medidoEm: hMin(15) },
    { nome: "Verde vencida", vitais: NORMAL, medidoEm: hMin(600) },
    { nome: "Sem medida",    vitais: null,   medidoEm: null },
    { nome: "Amarela",       vitais: ALERTA, medidoEm: hMin(10) },
  ];

  it("ordena por urgência: desconhecida, vermelha, amarela, verde vencida, verde", () => {
    const { linhas } = montarVigilancia(casos, { agora: AGORA });
    expect(linhas.map(l => l.nome)).toEqual([
      "Sem medida", "Vermelha", "Amarela", "Verde vencida", "Verde agora",
    ]);
  });

  it("entre iguais, a medida mais antiga vem primeiro", () => {
    const { linhas } = montarVigilancia([
      { nome: "Vermelha nova",  vitais: GRAVE, medidoEm: hMin(5) },
      { nome: "Vermelha velha", vitais: GRAVE, medidoEm: hMin(25) },
    ], { agora: AGORA });
    expect(linhas.map(l => l.nome)).toEqual(["Vermelha velha", "Vermelha nova"]);
  });

  it("o resumo conta níveis e atrasos separadamente", () => {
    const { resumo } = montarVigilancia(casos, { agora: AGORA });
    expect(resumo).toMatchObject({ total: 5, vermelhos: 1, amarelos: 1, verdes: 2, semMedida: 1 });
    expect(resumo.vencidos).toBe(1);
    expect(resumo.aReavaliar).toBe(2);   // a sem medida + a verde vencida
  });

  it("uma paciente sem medida derruba o 'tudo bem', mesmo sem nenhuma alterada", () => {
    const todasVerdes = [
      { nome: "A", vitais: NORMAL, medidoEm: hMin(10) },
      { nome: "B", vitais: NORMAL, medidoEm: hMin(20) },
    ];
    expect(montarVigilancia(todasVerdes, { agora: AGORA }).resumo.podeDizerTudoBem).toBe(true);
    expect(montarVigilancia([...todasVerdes, { nome: "C", vitais: null }], { agora: AGORA })
      .resumo.podeDizerTudoBem).toBe(false);
  });

  it("maternidade vazia não é 'tudo bem' — é vazia", () => {
    const { linhas, resumo } = montarVigilancia([], { agora: AGORA });
    expect(linhas).toEqual([]);
    expect(resumo.total).toBe(0);
    expect(resumo.podeDizerTudoBem).toBe(false);
  });
});

describe("medidaMaisRecente", () => {
  it("escolhe a mais nova entre partograma e admissão", () => {
    const r = medidaMaisRecente([
      { origem: "admissao", vitais: NORMAL, medidoEm: hMin(300) },
      { origem: "partograma", vitais: ALERTA, medidoEm: hMin(30) },
    ]);
    expect(r.origem).toBe("partograma");
    expect(r.medidoEm).toBe(hMin(30));
  });
  it("ignora candidata sem vitais ou com data ilegível", () => {
    expect(medidaMaisRecente([{ vitais: null, medidoEm: hMin(1) }])).toBeNull();
    expect(medidaMaisRecente([{ vitais: NORMAL, medidoEm: "?" }])).toBeNull();
    expect(medidaMaisRecente([])).toBeNull();
  });
});

describe("vitaisDoRegistro", () => {
  it("formulário em branco NÃO vira medida — devolve null", () => {
    expect(vitaisDoRegistro({})).toBeNull();
    expect(vitaisDoRegistro({ pa_sis: "", fc: "  ", consciencia: "" })).toBeNull();
    expect(vitaisDoRegistro()).toBeNull();
  });

  it("um toque com só a PA aferida já é medida", () => {
    expect(vitaisDoRegistro({ pa_sis: "150", dilatacao: "7" })).toEqual({ pa_sis: 150 });
  });

  it("números viram número e consciência fica texto", () => {
    expect(vitaisDoRegistro({ pa_sis: "128", temp: "37,0".replace(",", "."), consciencia: "alerta" }))
      .toEqual({ pa_sis: 128, temp: 37, consciencia: "alerta" });
  });

  it("ignora o que não é número, em vez de gravar NaN", () => {
    expect(vitaisDoRegistro({ fc: "abc", fr: "18" })).toEqual({ fr: 18 });
  });

  it("🔴 o que ele devolve é exatamente o que o painel sabe pontuar", () => {
    // Se um campo do form não tivesse nome igual ao do chart, o MEOWS o
    // ignoraria em silêncio e o escore sairia menor do que a paciente está.
    const v = vitaisDoRegistro({ pa_sis: "165", pa_dia: "95", fc: "88", fr: "18", temp: "36.6", sato2: "98", consciencia: "alerta" });
    const r = montarVigilancia([{ nome: "X", vitais: v, medidoEm: hMin(5) }], { agora: AGORA });
    expect(r.linhas[0].meows.faltando).toEqual([]);
    expect(r.linhas[0].meows.nivel).toBe(NIVEL.VERMELHO);
  });
});
