// ═══════════════════════════════════════════════════════════
// MEOWS — Modified Early Obstetric Warning Score (motor puro)
//
// O escore de alerta precoce materno: pontua cada sinal vital em faixas e diz
// se a paciente está VERDE (seguir), AMARELA (reavaliar) ou VERMELHA (chamar).
// É o primeiro gatilho de segurança da maternidade — o que transforma "os
// vitais estão anotados" em "estes vitais pedem alguém agora".
//
// ⚠️ APOIO, NUNCA DIAGNÓSTICO. O MEOWS chama atenção; a conduta é da equipe.
//
// ⚠️ O CHART_PADRAO É PONTO DE PARTIDA, NÃO LEI. Os limiares variam por
// instituição — este é um MEOWS de referência, com selo "em validação". O
// responsável técnico ajusta na tela (Fase 1: mat_criterios_risco). Por isso
// `calcularMeows` recebe o chart por parâmetro: trocar a régua não mexe no
// motor.
//
// ── POR QUE 1 VERMELHO OU 2 AMARELOS = VERMELHO ─────────────
// É o gatilho clássico do MEOWS. Um único parâmetro em zona crítica (uma PA
// de 165, uma SatO2 de 90) já basta — somar não pode diluir um vermelho
// isolado numa média tranquila. E dois amarelos juntos deixam de ser ruído.
// ═══════════════════════════════════════════════════════════

/**
 * O chart de referência. Cada parâmetro tem faixas `{ min, max, pontos }`,
 * limites inclusivos; `min`/`max` nulo = aberto para aquele lado.
 * pontos: 0 = normal · 1 = amarelo · 2 = vermelho.
 */
export const CHART_PADRAO = {
  pa_sis: {
    rotulo: "PA sistólica", unidade: "mmHg", faixas: [
      { max: 89, pontos: 2 }, { min: 90, max: 99, pontos: 1 },
      { min: 100, max: 149, pontos: 0 }, { min: 150, max: 159, pontos: 1 }, { min: 160, pontos: 2 },
    ],
  },
  pa_dia: {
    rotulo: "PA diastólica", unidade: "mmHg", faixas: [
      { max: 99, pontos: 0 }, { min: 100, max: 109, pontos: 1 }, { min: 110, pontos: 2 },
    ],
  },
  fc: {
    rotulo: "Frequência cardíaca", unidade: "bpm", faixas: [
      { max: 39, pontos: 2 }, { min: 40, max: 49, pontos: 1 },
      { min: 50, max: 99, pontos: 0 }, { min: 100, max: 119, pontos: 1 }, { min: 120, pontos: 2 },
    ],
  },
  fr: {
    rotulo: "Frequência respiratória", unidade: "irpm", faixas: [
      { max: 9, pontos: 2 }, { min: 10, max: 11, pontos: 1 },
      { min: 12, max: 20, pontos: 0 }, { min: 21, max: 29, pontos: 1 }, { min: 30, pontos: 2 },
    ],
  },
  temp: {
    rotulo: "Temperatura", unidade: "°C", faixas: [
      { max: 34.9, pontos: 2 }, { min: 35, max: 35.9, pontos: 1 },
      { min: 36, max: 37.4, pontos: 0 }, { min: 37.5, max: 37.9, pontos: 1 }, { min: 38, pontos: 2 },
    ],
  },
  sato2: {
    rotulo: "Saturação de O₂", unidade: "%", faixas: [
      { max: 91, pontos: 2 }, { min: 92, max: 95, pontos: 1 }, { min: 96, pontos: 0 },
    ],
  },
  consciencia: {
    rotulo: "Nível de consciência", tipo: "mapa",
    mapa: { alerta: 0, resposta_voz: 1, resposta_dor: 2, irresponsivo: 2 },
  },
};

export const NIVEL = { VERDE: "verde", AMARELO: "amarelo", VERMELHO: "vermelho" };

/** Os pontos de um parâmetro para um valor, ou null se ilegível/sem faixa. */
export function pontosDoParametro(def, valor) {
  if (def?.tipo === "mapa") {
    if (valor == null || valor === "") return null;
    const p = def.mapa[String(valor).toLowerCase()];
    return p == null ? null : p;
  }
  if (valor == null || valor === "" || Number.isNaN(Number(valor))) return null;
  const n = Number(valor);
  for (const f of def?.faixas || []) {
    if ((f.min == null || n >= f.min) && (f.max == null || n <= f.max)) return f.pontos;
  }
  return null;
}

/**
 * O MEOWS de um conjunto de vitais. Devolve `{ total, nivel, itens, faltando }`.
 *
 * `itens` só traz o que foi avaliado; `faltando` diz o que não veio — porque
 * um MEOWS baixo com metade dos vitais em branco NÃO é tranquilizador, e a
 * tela precisa poder dizer isso em vez de pintar um verde falso.
 */
export function calcularMeows(vitais = {}, chart = CHART_PADRAO) {
  const itens = [];
  const faltando = [];
  for (const [chave, def] of Object.entries(chart)) {
    const pontos = pontosDoParametro(def, vitais?.[chave]);
    if (pontos == null) { faltando.push(chave); continue; }
    itens.push({ chave, rotulo: def.rotulo, valor: vitais[chave], pontos });
  }

  const vermelhos = itens.filter(i => i.pontos >= 2).length;
  const amarelos = itens.filter(i => i.pontos === 1).length;
  const nivel = (vermelhos >= 1 || amarelos >= 2) ? NIVEL.VERMELHO
              : amarelos === 1 ? NIVEL.AMARELO : NIVEL.VERDE;

  return {
    total: itens.reduce((s, i) => s + i.pontos, 0),
    nivel,
    vermelhos,
    amarelos,
    itens,
    faltando,
    // Nenhum vital avaliado não é "verde": é "não dá para dizer".
    avaliado: itens.length > 0,
  };
}
