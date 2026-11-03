// ═══════════════════════════════════════════════════════════
// A RÉGUA DA TORRE MENTE?
//
// Três defeitos deste arquivo nasceriam verdes num teste ingênuo, porque
// nenhum deles quebra nada: todos produzem um número plausível e errado. Por
// isso cada um está posto de volta À MÃO aqui, com os dados que o
// produziriam, e a regra tem de acusar:
//
//   • o dia em curso comparado com dias fechados (a mentira das 9h);
//   • a janela que o `limit` cortou e ninguém marcou como cega;
//   • a espera de quem AINDA espera comparada com a de quem JÁ foi triado.
//
// Os dados são de mentira de propósito: a regra tem de poder ser mutada em
// milissegundos, sem banco.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  TIPO, POSICAO, SENTIDO, MOTIVO, MINIMO_DE_DIAS,
  coberturaReal, inicioDaRegua, serieDiaria, baseDeReferencia, posicaoNaBase, comparar,
  filaNoInstante, serieDaFilaNaHora, fraseDaComparacao, diaCurto,
} from "./comparacao.js";
import { somarDias } from "./tendencia.js";

/** Linhas de série prontas: `linhas([10, 10, 12])` a partir de 09/10. */
const linhas = (vals, { de = "2026-10-09", confiavel = true } = {}) =>
  vals.map((valor, i) => ({ dia: somarDias(de, i), valor, confiavel }));

/** Uma régua pronta, para testar a posição sem montar série. */
const regua = (media, desvio, dias = 10) => ({
  avaliado: true, motivo: null, media, desvio, dias,
  de: "2026-10-01", ate: "2026-10-10",
});

// ═══════════════════════════════════════════════════════════
describe("🔴 a mentira das 9h da manhã — dia em curso × dia fechado", () => {
  // O hospital dá 10 altas por dia, todo dia. Hoje, às 9h, deu 3 — porque
  // são 9h da manhã. Um painel que compare 3 com a média de 10 anuncia
  // colapso toda manhã, e na terceira manhã ninguém olha mais.
  const eventos = [
    ...Array.from({ length: 7 }, (_, d) =>
      Array.from({ length: 10 }, () => ({ data_alta: `2026-10-${String(9 + d).padStart(2, "0")}` }))).flat(),
    { data_alta: "2026-10-16" }, { data_alta: "2026-10-16" }, { data_alta: "2026-10-16" },
  ];
  const serie = serieDiaria(eventos, { campo: "data_alta", de: "2026-10-09", ate: "2026-10-16" });

  it("a série enxerga as 3 altas de hoje — o problema não é ler", () => {
    expect(serie.linhas.at(-1)).toMatchObject({ dia: "2026-10-16", valor: 3 });
  });

  it("🔴 NÃO julga o dia em curso: quem é comparado é o último dia fechado", () => {
    const c = comparar(3, serie, { tipo: TIPO.FLUXO, hoje: "2026-10-16", melhorQuando: "maior", minimoDeDias: 6 });
    expect(c.diaComparado).toBe("2026-10-15");
    expect(c.valorComparado).toBe(10);
    expect(c.valor).toBe(10);          // 10, não 3
  });

  it("🔴 e por isso não grita queda num dia que só está pela metade", () => {
    const c = comparar(3, serie, { tipo: TIPO.FLUXO, hoje: "2026-10-16", melhorQuando: "maior", minimoDeDias: 6 });
    expect(c.posicao).toBe(POSICAO.NORMAL);
    expect(c.sentido).toBe(SENTIDO.NEUTRO);
  });

  it("a frase diz DE QUE DIA está falando — sem isso a direção lê como hoje", () => {
    const c = comparar(3, serie, { tipo: TIPO.FLUXO, hoje: "2026-10-16", minimoDeDias: 6 });
    expect(fraseDaComparacao(c, { hoje: "2026-10-16" })).toContain("ontem");
  });

  it("o mesmo número, como ESTOQUE, é julgado agora — é outra natureza", () => {
    const c = comparar(3, serie, { tipo: TIPO.ESTOQUE, hoje: "2026-10-16", minimoDeDias: 6 });
    expect(c.valor).toBe(3);
    expect(c.posicao).toBe(POSICAO.ABAIXO);
  });

  it("a régua do fluxo não inclui o dia que ela está julgando", () => {
    // 6 dias de 10 + um sétimo dia fechado de 30. A régua do dia 30 tem de
    // ser 10, não 12,9 — senão o próprio pico se dilui e se esconde.
    const s = serieDiaria([
      ...Array.from({ length: 6 }, (_, d) =>
        Array.from({ length: 10 }, () => ({ dia_alta: `2026-10-${String(9 + d).padStart(2, "0")}` }))).flat(),
      ...Array.from({ length: 30 }, () => ({ dia_alta: "2026-10-15" })),
    ], { campo: "dia_alta", de: "2026-10-09", ate: "2026-10-16" });
    const c = comparar(null, s, { tipo: TIPO.FLUXO, hoje: "2026-10-16", minimoDeDias: 6 });
    expect(c.diaComparado).toBe("2026-10-15");
    expect(c.media).toBe(10);
    expect(c.posicao).toBe(POSICAO.ACIMA);
  });
});

// ═══════════════════════════════════════════════════════════
describe("🔴 a janela que o `limit` cortou", () => {
  // 90 dias pedidos, 5000 de limite, 5000 linhas de volta. O fundo da janela
  // não veio — e contado como dia vazio afunda a média.
  const cheia = Array.from({ length: 50 }, (_, i) => ({
    data_alta: `2026-09-${String(1 + (i % 28)).padStart(2, "0")}`,
  }));

  it("sem bater no limite, acredita no `desde` pedido", () => {
    const c = coberturaReal(cheia, "data_alta", { desde: "2026-07-18", limite: 5000 });
    expect(c.truncado).toBe(false);
    expect(c.desde).toBe("2026-07-18");
  });

  it("🔴 batendo no limite, a régua começa DEPOIS do dia mais antigo que veio", () => {
    // O mais antigo veio pela metade: é o dia em que o corte caiu.
    const c = coberturaReal(cheia, "data_alta", { desde: "2026-07-18", limite: 50 });
    expect(c.truncado).toBe(true);
    expect(c.maisAntigo).toBe("2026-09-01");
    expect(c.desde).toBe("2026-09-02");
  });

  it("e os dias antes dela saem da régua, não entram como zero", () => {
    const s = serieDiaria(cheia, {
      campo: "data_alta", de: "2026-08-25", ate: "2026-09-05", janelaDesde: "2026-09-02",
    });
    expect(s.diasCegos).toBe(8);                       // 25/08 a 01/09
    expect(s.linhas.find(l => l.dia === "2026-08-26").confiavel).toBe(false);
    const b = baseDeReferencia(s.linhas, { hoje: "2026-09-05", minimoDeDias: 3 });
    expect(b.de).toBe("2026-09-02");                   // a régua não vê o cego
  });

  it("lista vazia não finge cobertura", () => {
    expect(coberturaReal([], "data_alta", { desde: "2026-07-18", limite: 5000 }))
      .toMatchObject({ truncado: false, maisAntigo: null, linhas: 0 });
  });

  it("linha sem data não vira dia nenhum, e é contada", () => {
    const s = serieDiaria([{ data_alta: null }, { data_alta: "2026-10-09" }],
      { campo: "data_alta", de: "2026-10-09", ate: "2026-10-10" });
    expect(s.semData).toBe(1);
    expect(s.linhas[0].valor).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════
describe("🔴 o dia zero que não existiu — hospital novo no sistema", () => {
  // O estado de TODO cliente novo: 30 dias de uso e uma régua de 60 dias.
  // Os 30 dias de antes não são dias fracos, são dias em que o hospital não
  // estava aqui — e entrariam como zero, cortando toda média pela metade.
  const cobSaidas = { desde: "2026-08-17", truncado: false, maisAntigo: "2026-09-16", linhas: 120 };

  it("a régua começa onde o movimento começa, não onde se quis olhar", () => {
    expect(inicioDaRegua("2026-08-17", cobSaidas.maisAntigo)).toBe("2026-09-16");
  });

  it("🔴 e sem isso a média sairia pela metade", () => {
    // 4 altas/dia em 8 dias de uso, pedindo régua de 16 dias.
    const eventos = Array.from({ length: 8 }, (_, d) =>
      Array.from({ length: 4 }, () => ({ data_alta: somarDias("2026-10-08", d) }))).flat();

    const ingenua = serieDiaria(eventos, { campo: "data_alta", de: "2026-09-30", ate: "2026-10-16" });
    expect(baseDeReferencia(ingenua.linhas, { hoje: "2026-10-16" }).media).toBe(2);   // diluída

    const honesta = serieDiaria(eventos, {
      campo: "data_alta",
      de: inicioDaRegua("2026-09-30", "2026-10-08"), ate: "2026-10-16",
    });
    expect(baseDeReferencia(honesta.linhas, { hoje: "2026-10-16" }).media).toBe(4);
  });

  it("hospital com história de sobra: quem manda é o que se quis olhar", () => {
    expect(inicioDaRegua("2026-09-16", "2024-01-01")).toBe("2026-09-16");
  });

  it("leitura cortada empurra o começo para frente, somada ao resto", () => {
    const corte = { truncado: true, desde: "2026-10-01" };
    expect(inicioDaRegua("2026-09-16", "2024-01-01", [corte])).toBe("2026-10-01");
  });

  it("🔴 a série ancora no MOVIMENTO, não no próprio evento", () => {
    // Se o cancelamento ancorasse no cancelamento mais antigo, um hospital
    // que cancela pouco teria régua de 3 dias — e dia sem cancelamento é um
    // zero VERDADEIRO, que precisa entrar na média.
    const cancelamentoRaro = { truncado: false, maisAntigo: "2026-10-14" };
    expect(inicioDaRegua("2026-09-16", "2026-09-20", [cancelamentoRaro])).toBe("2026-09-20");
  });

  it("sem movimento nenhum lido, fica com o que se pediu", () => {
    expect(inicioDaRegua("2026-09-16", null)).toBe("2026-09-16");
  });
});

// ═══════════════════════════════════════════════════════════
describe("🔴 ruído não é notícia — as duas travas", () => {
  it("dentro de um desvio-padrão, é o normal da casa variando", () => {
    const p = posicaoNaBase(78, regua(74, 5), {});
    expect(p.posicao).toBe(POSICAO.NORMAL);
  });

  it("fora da banda, fala", () => {
    const p = posicaoNaBase(90, regua(74, 5), {});
    expect(p.posicao).toBe(POSICAO.ACIMA);
    expect(p.delta).toBe(16);
  });

  it("🔴 o piso absoluto segura o alarme falso de média baixa", () => {
    // 0,4 cancelamento/dia: UM cancelamento sai da banda estatística e não
    // é nada. Sem piso o painel acusaria quase todo dia.
    expect(posicaoNaBase(1, regua(0.4, 0.53), {}).posicao).toBe(POSICAO.ACIMA);
    expect(posicaoNaBase(1, regua(0.4, 0.53), { piso: 2 }).posicao).toBe(POSICAO.NORMAL);
  });

  it("🔴 \"3× a média\" não é dito quando a média é menor que 1", () => {
    // 1 contra 0,4 é "2,5× a média" — verdade aritmética, besteira gerencial.
    expect(posicaoNaBase(1, regua(0.4, 0.1), {}).vezes).toBe(null);
    expect(posicaoNaBase(21, regua(7, 1), {}).vezes).toBe(3);
  });

  it("sem desvio (um dia só de régua), a banda é o piso — não zero disfarçado", () => {
    const p = posicaoNaBase(8, { ...regua(7, null), dias: 1 }, { piso: 3 });
    expect(p.banda).toBe(3);
    expect(p.posicao).toBe(POSICAO.NORMAL);
  });

  it("o juízo depende de o indicador ser bom alto ou baixo", () => {
    expect(posicaoNaBase(90, regua(74, 5), { melhorQuando: "menor" }).sentido).toBe(SENTIDO.RUIM);
    expect(posicaoNaBase(90, regua(74, 5), { melhorQuando: "maior" }).sentido).toBe(SENTIDO.BOM);
    expect(posicaoNaBase(50, regua(74, 5), { melhorQuando: "menor" }).sentido).toBe(SENTIDO.BOM);
  });

  it("🔴 ocupação fica NEUTRA de propósito — lotado é receita e é risco", () => {
    // Quem diz se 95% é ruim é o limiar do setor, não a régua histórica.
    expect(posicaoNaBase(95, regua(74, 5), { melhorQuando: null }).sentido).toBe(SENTIDO.NEUTRO);
  });
});

// ═══════════════════════════════════════════════════════════
describe("a régua só existe quando há dias para sustentá-la", () => {
  it("menos que o mínimo não vira régua — vira recusa nomeada", () => {
    const b = baseDeReferencia(linhas([10, 10, 10]), { hoje: "2026-10-16" });
    expect(b).toMatchObject({ avaliado: false, motivo: MOTIVO.POUCOS_DIAS, dias: 3, media: null });
  });

  it("o mínimo é uma semana", () => {
    expect(MINIMO_DE_DIAS).toBe(7);
    expect(baseDeReferencia(linhas([1, 2, 3, 4, 5, 6, 7]), { hoje: "2026-10-20" }).avaliado).toBe(true);
  });

  it("🔴 o dia de hoje fica fora da própria régua", () => {
    // Medir contra si mesmo encolhe toda diferença: 100 entraria na média.
    const b = baseDeReferencia(linhas([10, 10, 10, 10, 10, 10, 10, 100]), { hoje: "2026-10-16" });
    expect(b.dias).toBe(7);
    expect(b.media).toBe(10);
  });

  it("dia cego não entra na régua", () => {
    const mistura = [...linhas([99, 99], { confiavel: false }), ...linhas([10, 10, 10, 10, 10, 10, 10], { de: "2026-10-11" })];
    const b = baseDeReferencia(mistura, { hoje: "2026-10-20" });
    expect(b.dias).toBe(7);
    expect(b.media).toBe(10);
  });

  it("dia sem valor não é dia zero", () => {
    const b = baseDeReferencia(linhas([10, null, 10, 10, 10, 10, 10, 10]), { hoje: "2026-10-20" });
    expect(b.dias).toBe(7);
    expect(b.media).toBe(10);
  });

  it("guarda o desvio e as pontas — é o que permite discordar da régua", () => {
    const b = baseDeReferencia(linhas([5, 10, 15, 10, 5, 15, 10]), { hoje: "2026-10-20" });
    expect(b).toMatchObject({ media: 10, minimo: 5, maximo: 15, de: "2026-10-09", ate: "2026-10-15" });
    expect(b.desvio).toBeGreaterThan(3);
  });
});

// ═══════════════════════════════════════════════════════════
describe("🔴 leitura que falhou nunca vira régua de zero", () => {
  it("`lido:false` recusa a comparação e diz por quê", () => {
    const c = comparar(10, { linhas: [] }, { lido: false });
    expect(c).toMatchObject({ avaliado: false, motivo: MOTIVO.SEM_LEITURA });
  });

  it("🔴 e a frase NÃO tranquiliza — \"normal\" e \"não sei\" levam a atos opostos", () => {
    const f = fraseDaComparacao(comparar(10, { linhas: [] }, { lido: false }));
    expect(f).toMatch(/leitura falhou/);
    expect(f).not.toMatch(/normal/);
  });

  it("sem dias suficientes, a frase conta quantos há", () => {
    const c = comparar(10, { linhas: linhas([10, 10]) }, { tipo: TIPO.ESTOQUE, hoje: "2026-10-16" });
    expect(fraseDaComparacao(c)).toBe("sem régua ainda — 2 dias de histórico");
  });

  it("valor nulo não inventa posição", () => {
    const c = comparar(null, { linhas: linhas([1, 2, 3, 4, 5, 6, 7]) }, { tipo: TIPO.ESTOQUE, hoje: "2026-10-20" });
    expect(c).toMatchObject({ avaliado: false, motivo: MOTIVO.SEM_VALOR });
    expect(fraseDaComparacao(c)).toBe(null);     // o card já mostra "—"
  });

  it("fluxo sem nenhum dia fechado recusa, em vez de julgar o dia de hoje", () => {
    const s = serieDiaria([{ d: "2026-10-16" }], { campo: "d", de: "2026-10-16", ate: "2026-10-16" });
    expect(comparar(1, s, { tipo: TIPO.FLUXO, hoje: "2026-10-16" }))
      .toMatchObject({ avaliado: false, motivo: MOTIVO.POUCOS_DIAS });
  });
});

// ═══════════════════════════════════════════════════════════
describe("🔴 a fila do PA: comparar espera com espera é viés, não medida", () => {
  // O caso que explica o arquivo: às 8h de hoje há 4 pessoas esperando
  // triagem. A média da espera REALIZADA dos últimos dias é baixa, porque
  // inclui quem foi triado em 5 minutos. A espera de quem AINDA espera só
  // contém os lentos. Comparar as duas faz hoje parecer pior sempre.
  //
  // Então o que se compara é o TAMANHO da fila à mesma hora.
  const dia = d => `2026-10-${String(d).padStart(2, "0")}`;
  const chegou = (d, hora, triagem = null) => ({
    chegada_em: `${dia(d)}T${hora}:00`,
    triagem_em: triagem ? `${dia(d)}T${triagem}:00` : null,
  });

  it("conta quem chegou antes do instante e ainda não tinha sido triado", () => {
    const lista = [
      chegou(16, "07:00", "07:10"),   // já saiu da fila às 8h
      chegou(16, "07:30"),            // esperando
      chegou(16, "07:50"),            // esperando
      chegou(16, "08:30"),            // ainda não chegou às 8h
    ];
    expect(filaNoInstante(lista, new Date(2026, 9, 16, 8, 0)).esperando).toBe(2);
  });

  it("triagem exatamente no instante já tirou a pessoa da fila", () => {
    expect(filaNoInstante([chegou(16, "07:00", "08:00")], new Date(2026, 9, 16, 8, 0)).esperando).toBe(0);
  });

  it("🔴 o fantasma: registro abandonado não espera para sempre", () => {
    // Sem teto, uma ficha de 15 dias atrás sem triagem engordaria a fila de
    // TODOS os dias seguintes — e a régua inflada faria hoje parecer ótimo.
    const abandonado = [chegou(1, "08:00")];
    const r = filaNoInstante(abandonado, new Date(2026, 9, 16, 8, 0));
    expect(r.esperando).toBe(0);
    expect(r.fantasmas).toBe(1);
  });

  it("mas dentro do teto ele é fila de verdade", () => {
    const r = filaNoInstante([chegou(16, "07:00")], new Date(2026, 9, 16, 8, 0));
    expect(r).toMatchObject({ esperando: 1, fantasmas: 0 });
  });

  it("quem foi cancelado ou teve desfecho saiu da fila sem triagem", () => {
    const lista = [
      { chegada_em: "2026-10-16T07:00:00", triagem_em: null, cancelado_em: "2026-10-16T07:20:00" },
      { chegada_em: "2026-10-16T07:00:00", triagem_em: null, desfecho_em: "2026-10-16T07:30:00" },
    ];
    expect(filaNoInstante(lista, new Date(2026, 9, 16, 8, 0)).esperando).toBe(0);
  });

  it("a régua é a MESMA HORA dos outros dias — o PA das 7h não é o das 19h", () => {
    const lista = [
      chegou(14, "07:30"), chegou(14, "07:40"),                    // 2 às 8h do dia 14
      chegou(15, "07:30"),                                          // 1 às 8h do dia 15
      chegou(16, "07:30"), chegou(16, "07:40"), chegou(16, "07:50"), // 3 às 8h de hoje
    ];
    const s = serieDaFilaNaHora(lista, { de: dia(14), ate: dia(16), agora: new Date(2026, 9, 16, 8, 0) });
    expect(s.hora).toBe("08:00");
    expect(s.linhas.map(l => l.valor)).toEqual([2, 1, 3]);
  });

  it("hora que ainda não chegou não tem fila — e não vira zero na régua", () => {
    const s = serieDaFilaNaHora([], { de: dia(16), ate: dia(18), agora: new Date(2026, 9, 16, 8, 0) });
    expect(s.linhas.map(l => l.valor)).toEqual([0, null, null]);
    expect(baseDeReferencia(s.linhas, { hoje: dia(16), minimoDeDias: 1 }).avaliado).toBe(false);
  });

  it("a fila entra como ESTOQUE — comparável a qualquer hora", () => {
    const lista = [];
    for (let d = 2; d <= 15; d++) { lista.push(chegou(d, "07:30"), chegou(d, "07:40")); }
    for (let i = 0; i < 9; i++) lista.push(chegou(16, "07:0" + i));
    const s = serieDaFilaNaHora(lista, { de: dia(2), ate: dia(16), agora: new Date(2026, 9, 16, 8, 0) });
    const c = comparar(9, s, { tipo: TIPO.ESTOQUE, hoje: dia(16), piso: 1, melhorQuando: "menor" });
    expect(c.media).toBe(2);
    expect(c.posicao).toBe(POSICAO.ACIMA);
    expect(c.sentido).toBe(SENTIDO.RUIM);
  });

  it("instante ilegível não devolve zero", () => {
    expect(filaNoInstante([], "não é data").esperando).toBe(null);
  });
});

// ═══════════════════════════════════════════════════════════
describe("a frase, que é a parte que pode mentir", () => {
  it("traz a seta, o quando, o quanto e o tamanho da amostra", () => {
    const c = { avaliado: true, tipo: TIPO.ESTOQUE, posicao: POSICAO.ACIMA, media: 74, dias: 21, vezes: null, delta: 16 };
    expect(fraseDaComparacao(c, { unidade: "%" })).toBe("▲ agora acima do normal · média 74% em 21 dias");
  });

  it("o \"×\" só aparece quando vale a pena dizer", () => {
    const base = { avaliado: true, tipo: TIPO.ESTOQUE, posicao: POSICAO.ACIMA, media: 7, dias: 14 };
    expect(fraseDaComparacao({ ...base, vezes: 1.2 })).not.toContain("×");
    expect(fraseDaComparacao({ ...base, vezes: 3 })).toContain("(3× a média)");
  });

  it("\"dentro do normal\" ainda carrega a régua — é o que permite discordar", () => {
    const c = { avaliado: true, tipo: TIPO.ESTOQUE, posicao: POSICAO.NORMAL, media: 74, dias: 21 };
    expect(fraseDaComparacao(c, { unidade: "%" })).toBe("agora: dentro do normal · média 74% em 21 dias");
  });

  it("dia curto fala como gente", () => {
    expect(diaCurto("2026-10-16", "2026-10-16")).toBe("hoje");
    expect(diaCurto("2026-10-15", "2026-10-16")).toBe("ontem");
    expect(diaCurto("2026-10-11", "2026-10-16")).toBe("11/10");
    expect(diaCurto(null)).toBe("—");
  });

  it("sem comparação nenhuma, não inventa frase", () => {
    expect(fraseDaComparacao(null)).toBe(null);
  });
});

// ═══════════════════════════════════════════════════════════
describe("a série de média (permanência, não contagem)", () => {
  it("tira média do dia, e não conta linhas", () => {
    const s = serieDiaria(
      [{ d: "2026-10-09", p: 4 }, { d: "2026-10-09", p: 6 }, { d: "2026-10-10", p: 3 }],
      { campo: "d", de: "2026-10-09", ate: "2026-10-10", valorDe: x => x.p });
    expect(s.linhas[0]).toMatchObject({ valor: 5, quantos: 2 });
    expect(s.linhas[1].valor).toBe(3);
  });

  it("🔴 dia sem permanência registrada é null, não zero", () => {
    // Zero puxaria a média para baixo e faria o hospital parecer mais
    // eficiente do que é — o mesmo cuidado do `permanenciaMedia`.
    const s = serieDiaria([{ d: "2026-10-09", p: null }],
      { campo: "d", de: "2026-10-09", ate: "2026-10-09", valorDe: x => x.p });
    expect(s.linhas[0].valor).toBe(null);
  });

  it("dia sem evento nenhum é zero na contagem — ali zero é verdade", () => {
    const s = serieDiaria([{ d: "2026-10-09" }], { campo: "d", de: "2026-10-09", ate: "2026-10-10" });
    expect(s.linhas.map(l => l.valor)).toEqual([1, 0]);
  });
});
