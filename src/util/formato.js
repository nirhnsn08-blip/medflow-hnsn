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
  // 🔴 TRÊS BURACOS, ACHADOS PELO PAINEL DE INFECÇÃO DO SCIH.
  // `Number("")` é 0, e isso vazava de duas formas opostas:
  //   taxa("", 100)  ->  0          campo em branco virava ZERO DE VERDADE
  //   taxa(10, "")   ->  Infinity   campo em branco no denominador
  //   taxa(10, "ab") ->  NaN        texto em qualquer das pontas
  //
  // O primeiro é o pior: "0% de infecção de sítio cirúrgico" num mês em que
  // ninguém preencheu o campo diz que está seguro. NaN e Infinity ao menos
  // aparecem estranhos na tela; zero passa por resultado.
  //
  // Qualquer ponta que não seja número finito devolve `null` — "não dá para
  // calcular", que é diferente de "deu zero".
  if (num == null || den == null || num === "" || den === "") return null;
  const n = Number(num), d = Number(den);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  return (n / d) * fator;
}
