// ═══════════════════════════════════════════════════════════
// NSP — AS TRÊS REGRAS QUE CLASSIFICAM UM INCIDENTE
//
// Elas rodam no momento da GRAVAÇÃO (`registrarIncidente`), não na tela: um
// incidente que entra sem risco calculado, sem saber se exige RCA e sem saber
// se é de notificação compulsória entra como registro morto.
//
// 🔴 Por isso elas seguem o botão de notificar até o chunk inicial — e por
// isso moram aqui, separadas do resto de `nsp.js`, que só a página usa.
// ═══════════════════════════════════════════════════════════

/**
 * Matriz de risco: probabilidade × gravidade (1–5 cada) → score 1–25 e faixa.
 * Padrão NHS/AHRQ: extremo ≥15, alto 8–14, moderado 4–7, baixo 1–3.
 */
export function matrizRisco(probabilidade, gravidade) {
  const p = Number(probabilidade) || 0;
  const g = Number(gravidade) || 0;
  const score = p * g;
  const faixa = score >= 15 ? "extremo" : score >= 8 ? "alto" : score >= 4 ? "moderado" : score >= 1 ? "baixo" : null;
  return { score, faixa };
}

const DANO_SIGNIFICATIVO = new Set(["moderado", "grave", "obito"]);

/** Evento que exige análise de causa raiz (RCA): evento adverso, never event, ou dano moderado+. */
export function exigeRCA(inc) {
  if (!inc) return false;
  return inc.classe === "never_event" || inc.classe === "evento_adverso" || DANO_SIGNIFICATIVO.has(inc.grau_dano);
}

/** Notificação compulsória à ANVISA/VISA: never events e óbito. */
export function notificacaoCompulsoria(inc) {
  if (!inc) return false;
  return inc.classe === "never_event" || inc.grau_dano === "obito";
}
