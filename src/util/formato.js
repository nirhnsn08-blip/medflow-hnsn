// ═══════════════════════════════════════════════════════════
// NÚMEROS E MOEDA — formatação e cálculo puros
//
// Extraídas do App.jsx sem mudança de lógica. `fmtReais` aparecia em ~55
// lugares; `taxa` sustenta todos os indicadores do BI. Concentrá-las evita
// que uma vire "R$ 1.234,5" e outra "R$ 1.234,50" por descuido.
//
// Sem React, sem rede. Testadas em formato.test.js.
// ═══════════════════════════════════════════════════════════

/** Número em pt-BR ("1.234"). `null`/undefined → "0". */
export const fmt = n => (n ?? 0).toLocaleString("pt-BR");

/** Moeda pt-BR pelo Intl ("R$ 1.234,50"). Não-número → R$ 0,00. */
export const fmtBRL = v =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Moeda pt-BR montada à mão ("R$ 1.234,50").
 * Difere de `fmtBRL` no espaçamento (o Intl usa espaço não-quebrável entre
 * "R$" e o número); mantida separada de propósito para não mudar, de
 * relance, o visual de ~55 telas que já a usam.
 */
export const fmtReais = v =>
  "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Taxa = num/den × fator. `null` quando o denominador falta ou é zero —
 * indicador sem base não é zero, é "não calculável", e mostrar 0 seria uma
 * afirmação clínica falsa (ex.: "0% de infecção" num setor sem dados).
 */
export function taxa(num, den, fator = 100) {
  if (num == null || den == null || den === 0) return null;
  return (Number(num) / Number(den)) * fator;
}
