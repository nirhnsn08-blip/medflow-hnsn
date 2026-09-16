// ═══════════════════════════════════════════════════════════
// VIGILÂNCIA MATERNA — o painel de segurança (motor puro)
//
// O MEOWS pontua UMA medida. Este módulo responde a outra pergunta, que é a
// da enfermeira olhando a maternidade inteira: **de quem eu preciso cuidar
// agora?**
//
// ── POR QUE O ESCORE SOZINHO NÃO BASTA ──────────────────────
// Uma paciente verde medida há seis horas não é uma paciente verde. É uma
// paciente SEM MEDIDA HÁ SEIS HORAS — e isso pode ser pior do que uma
// amarela medida agora, porque ninguém sabe o que aconteceu no intervalo.
// Um painel que ordenasse só pelo escore mostraria a verde vencida no fim da
// lista, em letra calma, exatamente onde ela não deveria estar.
//
// Por isso cada linha carrega DUAS dimensões: o nível do MEOWS e o frescor da
// medida. E a ordenação considera as duas.
//
// ── DE ONDE SAI O INTERVALO ─────────────────────────────────
// Quem está vermelha precisa ser reavaliada em minutos; quem está verde, em
// horas. Então o prazo não é fixo: ele vem do próprio nível da última medida.
// Passou do prazo = atrasado. Passou do dobro = vencido.
//
// ⚠️ APOIO, NUNCA DIAGNÓSTICO — como o MEOWS. O painel ordena e chama
// atenção; quem decide a conduta é a equipe.
//
// ⚠️ INTERVALOS SÃO PONTO DE PARTIDA, não lei. Variam por instituição, e
// entram por parâmetro justamente para o responsável técnico poder ajustar
// sem mexer no motor.
// ═══════════════════════════════════════════════════════════

import { calcularMeows, NIVEL, CHART_PADRAO } from "./meows.js";

export const FRESCOR = {
  RECENTE: "recente",
  ATRASADO: "atrasado",
  VENCIDO: "vencido",
  SEM_MEDIDA: "sem_medida",
};

/** Prazo de reavaliação, em minutos, conforme o nível da ÚLTIMA medida. */
export const INTERVALO_PADRAO = {
  [NIVEL.VERMELHO]: 30,
  [NIVEL.AMARELO]: 60,
  [NIVEL.VERDE]: 240,
};

/** Minutos entre `quando` e `agora`; null se a data não der para ler. */
export function minutosDesde(quando, agora) {
  if (!quando) return null;
  const t = new Date(quando).getTime();
  const a = new Date(agora).getTime();
  if (!Number.isFinite(t) || !Number.isFinite(a)) return null;
  return Math.max(0, Math.round((a - t) / 60000));
}

/**
 * O frescor de uma medida, dado o nível dela e há quantos minutos foi feita.
 * Sem medida não é "recente" nem "vencido" — é uma categoria própria, porque
 * "nunca mediram" e "mediram e passou do prazo" pedem ações diferentes.
 */
export function classificarFrescor(nivel, minutos, intervalos = INTERVALO_PADRAO) {
  if (minutos == null) return FRESCOR.SEM_MEDIDA;
  const limite = intervalos[nivel] ?? intervalos[NIVEL.VERDE];
  if (minutos > limite * 2) return FRESCOR.VENCIDO;
  if (minutos > limite) return FRESCOR.ATRASADO;
  return FRESCOR.RECENTE;
}

/**
 * A ordem da lista. Menor = mais urgente.
 *
 * O zero é de quem NÃO TEM MEDIDA: desconhecido vai na frente de tudo, porque
 * é o único caso em que o painel não tem o que afirmar. Depois vêm os níveis;
 * e só então o verde, subdividido pelo atraso — é aqui que a verde de seis
 * horas passa na frente da verde de agora.
 */
export function prioridade(nivel, frescor, avaliado) {
  if (!avaliado || frescor === FRESCOR.SEM_MEDIDA) return 0;
  if (nivel === NIVEL.VERMELHO) return 1;
  if (nivel === NIVEL.AMARELO) return 2;
  if (frescor === FRESCOR.VENCIDO) return 3;
  if (frescor === FRESCOR.ATRASADO) return 4;
  return 5;
}

/**
 * Uma linha do painel a partir de um caso.
 *
 * @param caso  { episodioId, prontuario, nome, iniciais, leito, vitais,
 *                medidoEm, origem }
 * @param opts  { agora, chart, intervalos }
 */
export function avaliarCaso(caso = {}, { agora = new Date(), chart = CHART_PADRAO, intervalos = INTERVALO_PADRAO } = {}) {
  const meows = calcularMeows(caso.vitais || {}, chart);
  const minutos = caso.vitais ? minutosDesde(caso.medidoEm, agora) : null;
  // Sem nenhum parâmetro avaliado, a medida não conta como medida.
  const frescor = meows.avaliado ? classificarFrescor(meows.nivel, minutos, intervalos) : FRESCOR.SEM_MEDIDA;
  const limite = intervalos[meows.nivel] ?? intervalos[NIVEL.VERDE];

  return {
    ...caso,
    meows,
    minutos: meows.avaliado ? minutos : null,
    frescor,
    prazoMin: meows.avaliado ? limite : null,
    precisaReavaliar: frescor === FRESCOR.ATRASADO || frescor === FRESCOR.VENCIDO || frescor === FRESCOR.SEM_MEDIDA,
    prioridade: prioridade(meows.nivel, frescor, meows.avaliado),
  };
}

/**
 * O painel: linhas ordenadas por urgência e um resumo para o topo da tela.
 *
 * `resumo.podeDizerTudoBem` existe para a tela NÃO poder pintar um verde
 * falso: só é verdadeiro quando toda paciente tem medida, dentro do prazo, e
 * verde. Basta uma sem medida para ser falso — mesmo que nenhuma esteja
 * amarela ou vermelha.
 */
export function montarVigilancia(casos = [], { agora = new Date(), chart = CHART_PADRAO, intervalos = INTERVALO_PADRAO } = {}) {
  const lista = Array.isArray(casos) ? casos : [];
  const linhas = lista
    .map(c => avaliarCaso(c, { agora, chart, intervalos }))
    .sort((a, b) =>
      a.prioridade - b.prioridade ||
      (b.minutos ?? Infinity) - (a.minutos ?? Infinity) ||
      String(a.nome || a.iniciais || "").localeCompare(String(b.nome || b.iniciais || "")));

  const conta = p => linhas.filter(p).length;
  const resumo = {
    total: linhas.length,
    vermelhos: conta(l => l.meows.avaliado && l.meows.nivel === NIVEL.VERMELHO),
    amarelos: conta(l => l.meows.avaliado && l.meows.nivel === NIVEL.AMARELO),
    verdes: conta(l => l.meows.avaliado && l.meows.nivel === NIVEL.VERDE),
    semMedida: conta(l => l.frescor === FRESCOR.SEM_MEDIDA),
    atrasados: conta(l => l.frescor === FRESCOR.ATRASADO),
    vencidos: conta(l => l.frescor === FRESCOR.VENCIDO),
  };
  resumo.aReavaliar = conta(l => l.precisaReavaliar);
  resumo.podeDizerTudoBem =
    linhas.length > 0 &&
    linhas.every(l => l.meows.avaliado && l.meows.nivel === NIVEL.VERDE && l.frescor === FRESCOR.RECENTE);

  return { linhas, resumo };
}

/**
 * A medida mais recente entre as candidatas — é assim que o painel junta o
 * partograma (que mede de hora em hora) com a admissão (que mede uma vez).
 * Devolve null quando nenhuma tem vitais legíveis.
 */
export function medidaMaisRecente(candidatas = []) {
  let melhor = null;
  for (const c of candidatas) {
    if (!c || !c.vitais || typeof c.vitais !== "object") continue;
    const t = new Date(c.medidoEm).getTime();
    if (!Number.isFinite(t)) continue;
    if (!melhor || t > melhor._t) melhor = { ...c, _t: t };
  }
  if (!melhor) return null;
  const { _t, ...limpa } = melhor;
  return limpa;
}

/** Os campos de sinais maternos que um registro de trabalho de parto carrega. */
export const CAMPOS_VITAIS = ["pa_sis", "pa_dia", "fc", "fr", "temp", "sato2", "consciencia"];

/**
 * Os vitais de um registro digitado, ou **null** se nenhum foi preenchido.
 *
 * 🔴 O null é a regra, não um detalhe: um toque lançado sem aferir nada NÃO
 * pode contar como medida. Se contasse, o relógio do MEOWS zeraria e o painel
 * diria "medida recente" sobre uma paciente que ninguém mediu — o falso-verde
 * de novo, agora com carimbo de hora.
 */
export function vitaisDoRegistro(form = {}) {
  const v = {};
  for (const c of CAMPOS_VITAIS) {
    const bruto = String(form?.[c] ?? "").trim();
    if (bruto === "") continue;
    if (c === "consciencia") { v[c] = bruto; continue; }
    const n = Number(bruto);
    if (Number.isFinite(n)) v[c] = n;
  }
  return Object.keys(v).length ? v : null;
}
