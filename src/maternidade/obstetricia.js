// ═══════════════════════════════════════════════════════════
// CALCULADORAS OBSTÉTRICAS — motor puro
//
// Funções determinísticas: mesma entrada, mesma saída, sem tocar em banco
// nem em relógio escondido (a data de referência entra por parâmetro). É o
// que a tela de Admissão usa para preencher sozinha a idade gestacional, a
// DPP, o IMC e o Bishop — números que hoje se fazem à mão e por isso saem
// errados no fim do plantão.
//
// ⚠️ NADA AQUI DECIDE CONDUTA. Bishop e IG são apoio; a leitura clínica é de
// quem examina. O sistema calcula e mostra a origem do número, não prescreve.
// ═══════════════════════════════════════════════════════════

const MS_DIA = 86400000;

/** "AAAA-MM-DD" (ou Date) → Date à meia-noite local, ou null se ilegível. */
export function diaDe(d) {
  if (!d) return null;
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const s = String(d).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [a, m, dd] = s.split("-").map(Number);
  const dt = new Date(a, m - 1, dd);
  // Round-trip: o Date normaliza overflow em silêncio ("2026-13-40" viraria
  // fevereiro de 2027). Se os componentes não voltam iguais, a data é lixo.
  if (dt.getFullYear() !== a || dt.getMonth() !== m - 1 || dt.getDate() !== dd) return null;
  return dt;
}

/**
 * Idade gestacional numa data de referência, a partir da DUM.
 *
 * Devolve `{ semanas, dias, totalDias }` ou null quando a DUM é ilegível ou
 * está no futuro. Semanas+dias porque "39 semanas e 1 dia" é como a
 * obstetrícia fala — devolver só semanas apagaria justamente o dia que
 * decide se a gestação é pré-termo, a termo ou pós-termo.
 */
export function igEntre(dum, ref = new Date()) {
  const d0 = diaDe(dum), d1 = diaDe(ref);
  if (!d0 || !d1) return null;
  const totalDias = Math.floor((d1 - d0) / MS_DIA);
  if (totalDias < 0) return null;                 // DUM no futuro = dado errado
  return { semanas: Math.floor(totalDias / 7), dias: totalDias % 7, totalDias };
}

/**
 * Data provável do parto pela regra de Naegele: DUM + 280 dias (40 semanas).
 *
 * 280 dias em vez de "+1 ano −3 meses +7 dias" de propósito: a versão de
 * meses tropeça em fevereiro e em mês de 30 vs 31 dias, e a divergência de um
 * ou dois dias reaparece depois como "IG que não bate com a DPP".
 */
export function dppDe(dum) {
  const d0 = diaDe(dum);
  if (!d0) return null;
  return new Date(d0.getTime() + 280 * MS_DIA);
}

/** IMC = peso(kg) / altura(m)², uma casa decimal. Null se faltar dado. */
export function imc(peso, altura) {
  const p = Number(peso), a = Number(altura);
  if (!Number.isFinite(p) || !Number.isFinite(a) || p <= 0 || a <= 0) return null;
  return Math.round((p / (a * a)) * 10) / 10;
}

// ─────────────────────────────────────────────────────────────
// ÍNDICE DE BISHOP — maturidade do colo (0–13), para indução
//
// Cinco componentes, cada um 0–3 (posição e consistência vão só até 2). O
// pontinho de cada faixa é fixo e clássico; deixá-lo configurável seria
// abrir espaço para versão divergente entre plantões, e Bishop só serve
// enquanto todo mundo pontua igual.
// ─────────────────────────────────────────────────────────────

const faixa = (v, cortes) => {
  // cortes: [[limiteInclusivo, pontos], ...] em ordem crescente; acima do
  // último limite ganha o último ponto. Null quando o valor não veio.
  if (v == null || v === "" || Number.isNaN(Number(v))) return null;
  const n = Number(v);
  let pts = cortes[cortes.length - 1][1];
  for (const [lim, p] of cortes) { if (n <= lim) { pts = p; break; } }
  return pts;
};

const MAPA_CONSISTENCIA = { firme: 0, media: 1, médio: 1, medio: 1, amolecida: 2, amolecido: 2, mole: 2 };
const MAPA_POSICAO = { posterior: 0, central: 1, medio: 1, média: 1, media: 1, intermediaria: 1, anterior: 2 };

/**
 * Índice de Bishop a partir do toque. Devolve `{ score, completo, itens }`.
 * `completo` diz se os cinco componentes vieram — um Bishop com peça faltando
 * é menor do que o real, e apresentá-lo como final induz ao erro.
 */
export function bishop({ dilatacao, apagamento, altura, consistencia, posicao } = {}) {
  const itens = {
    // dilatação (cm): 0 → 0 | 1–2 → 1 | 3–4 → 2 | ≥5 → 3
    dilatacao: faixa(dilatacao, [[0, 0], [2, 1], [4, 2], [Infinity, 3]]),
    // apagamento (%): 0–30 → 0 | 40–50 → 1 | 60–70 → 2 | ≥80 → 3
    apagamento: faixa(apagamento, [[30, 0], [50, 1], [70, 2], [Infinity, 3]]),
    // altura (De Lee): −3 → 0 | −2 → 1 | −1..0 → 2 | ≥+1 → 3
    altura: faixa(altura, [[-3, 0], [-2, 1], [0, 2], [Infinity, 3]]),
    consistencia: consistencia == null ? null : (MAPA_CONSISTENCIA[String(consistencia).toLowerCase()] ?? null),
    posicao: posicao == null ? null : (MAPA_POSICAO[String(posicao).toLowerCase()] ?? null),
  };
  const valores = Object.values(itens);
  const completo = valores.every(v => v != null);
  const score = valores.reduce((s, v) => s + (v || 0), 0);
  return { score, completo, itens };
}

// ─────────────────────────────────────────────────────────────
// GTPAL — Gestações, Termo, Prematuros, Abortos, Vivos
// ─────────────────────────────────────────────────────────────

const inteiroNaoNeg = v => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

/**
 * Coerência do GTPAL. Devolve a lista de incoerências (vazia = coerente).
 *
 * ⚠️ Frouxa de propósito: gestação em curso NÃO conta em T/P/A, então
 * `gesta` pode ser maior que `termo+prematuro+abortos` (a atual e as
 * anteriores ainda sem desfecho). O que é impossível é o contrário —
 * mais desfechos do que gestações — e mais vivos do que partos.
 */
export function gtpalIncoerencias(g = {}) {
  const gesta = inteiroNaoNeg(g.gesta), t = inteiroNaoNeg(g.termo),
        p = inteiroNaoNeg(g.prematuro), a = inteiroNaoNeg(g.abortos), v = inteiroNaoNeg(g.vivos);
  const fora = [];
  if (gesta != null && [t, p, a].every(x => x != null) && t + p + a > gesta)
    fora.push("Termo + prematuros + abortos não pode passar do total de gestações.");
  if (v != null && [t, p].every(x => x != null) && v > t + p)
    fora.push("Não pode haver mais filhos vivos do que partos (termo + prematuros).");
  return fora;
}

/** GTPAL legível: `G3 T1 P0 A1 V1`. Ignora o que não veio. */
export function formatarGtpal(g = {}) {
  const par = [["G", g.gesta], ["T", g.termo], ["P", g.prematuro], ["A", g.abortos], ["V", g.vivos]];
  return par.filter(([, v]) => inteiroNaoNeg(v) != null).map(([r, v]) => `${r}${Number(v)}`).join(" ");
}
