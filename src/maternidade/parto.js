// ═══════════════════════════════════════════════════════════
// PARTO & CESÁREA — motor puro
//
// Três cálculos determinísticos que o registro do parto usa:
//
//  • CLASSIFICAÇÃO DE ROBSON (10 grupos da OMS) — o padrão para monitorar a
//    taxa de cesárea. Cada parto cai em UM grupo por seis variáveis já
//    conhecidas do episódio (paridade, cesárea anterior, idade gestacional,
//    apresentação, nº de fetos, início do trabalho). É o que permite dizer
//    "a cesárea subiu no grupo 1" em vez de só "a cesárea subiu".
//  • HEMORRAGIA PÓS-PARTO — o limiar depende da via.
//  • APGAR — a faixa (0–3 grave, 4–6 moderado, 7–10 normal).
//
// ⚠️ APOIO, NUNCA CONDUTA. Robson é auditoria, não julgamento do caso; o
// limiar de hemorragia acende atenção, não substitui a estimativa de quem
// está na sala. O motor classifica e mostra o porquê — não prescreve.
//
// ⚠️ CLASSIFICA SÓ COM O QUE PRECISA. Faltando uma variável, devolve
// `completo:false` e diz QUAL falta — nunca chuta um grupo. Um Robson
// inventado num dado incompleto contamina o indicador inteiro.
// ═══════════════════════════════════════════════════════════

// Os 10 grupos de Robson, no texto da OMS (resumido).
export const ROBSON = {
  1:  "Nulípara, feto único cefálico, ≥37 sem, trabalho espontâneo",
  2:  "Nulípara, feto único cefálico, ≥37 sem, induzido ou cesárea antes do trabalho",
  3:  "Multípara sem cesárea anterior, feto único cefálico, ≥37 sem, trabalho espontâneo",
  4:  "Multípara sem cesárea anterior, feto único cefálico, ≥37 sem, induzido ou cesárea antes do trabalho",
  5:  "Cesárea anterior, feto único cefálico, ≥37 sem",
  6:  "Nulípara, feto único pélvico",
  7:  "Multípara, feto único pélvico (inclui cesárea anterior)",
  8:  "Gestação múltipla (inclui cesárea anterior)",
  9:  "Situação anômala — transversa/oblíqua (inclui cesárea anterior)",
  10: "Feto único cefálico, <37 sem (inclui cesárea anterior)",
};

export const VIA = { VAGINAL: "vaginal", CESAREA: "cesarea", FORCEPS: "forceps", VACUO: "vacuo" };

// Número finito ou null. `Number(null)` e `Number("")` são 0 — aqui null/vazio
// é AUSENTE, não zero, senão "sem idade gestacional" viraria pré-termo.
const num = v => {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ── normalização de entrada ─────────────────────────────────
function normApresentacao(v) {
  const s = String(v || "").toLowerCase();
  if (!s) return null;
  if (/cef[aá]lic/.test(s)) return "cefalica";
  if (/p[eé]lvic|pod[aá]lic|nates/.test(s)) return "pelvica";
  if (/transvers|obl[ií]qu|c[oó]rmic/.test(s)) return "anomala";
  return null;
}
function normInicio(v) {
  const s = String(v || "").toLowerCase();
  if (!s) return null;
  if (/espont/.test(s)) return "espontaneo";
  if (/induz|indu[cç][aã]o/.test(s)) return "induzido";
  // cesárea marcada/eletiva/antes do trabalho — em Robson entra junto do induzido (1→2, 3→4)
  if (/ces[aá]rea|eletiv|sem_?trabalho|pr[eé]_?trabalho|prelabor/.test(s)) return "cesarea_pre_trabalho";
  return null;
}
function normVia(v) {
  const s = String(v || "").toLowerCase();
  if (/ces[aá]rea/.test(s)) return "cesarea";
  if (/f[oó]rcep/.test(s)) return "forceps";
  if (/v[aá]cuo|vacuo|extra[cç]/.test(s)) return "vacuo";
  if (/vaginal|normal|eut[oó]cico/.test(s)) return "vaginal";
  return null;
}

/**
 * Nulípara = nenhum parto anterior (termo + prematuros = 0). Null quando não
 * dá para afirmar: um parto anterior (termo OU prematuro ≥1) já basta para NÃO
 * ser nulípara, mas "termo 0" sozinho não confirma nulípara — pode haver
 * prematuro não informado. Não chuta.
 */
export function ehNulipara({ termo, prematuro } = {}) {
  const t = Number(termo), p = Number(prematuro);
  const tOk = Number.isFinite(t), pOk = Number.isFinite(p);
  if (!tOk && !pOk) return null;
  if ((tOk && t > 0) || (pOk && p > 0)) return false;   // já pariu antes
  if (!tOk || !pOk) return null;                         // o que veio é 0, mas faltou peça
  return true;
}

const incompleto = falta => ({ grupo: null, descricao: null, completo: false, falta });

/**
 * Classificação de Robson. Entra o que o episódio já tem; sai UM grupo (1–10)
 * ou `completo:false` com o que falta. A ordem das decisões é a da OMS:
 * múltipla → anômala → pélvica → pré-termo → cesárea anterior → início do TP.
 *
 * @param nulipara         boolean — nenhum parto anterior
 * @param cesareaAnterior  boolean
 * @param semanas          idade gestacional (semanas); termo = ≥37
 * @param apresentacao     cefalica | pelvica | transversa/oblíqua/córmica
 * @param nFetos           1 = único, ≥2 = múltipla
 * @param inicio           espontaneo | induzido | cesarea_pre_trabalho (só pesa nos grupos 1–4)
 */
export function classificarRobson(d = {}) {
  const nulipara = d.nulipara;
  const cesareaAnterior = !!d.cesareaAnterior;
  const semanas = num(d.semanas);
  const nFetos = num(d.nFetos);
  const apres = normApresentacao(d.apresentacao);

  if (typeof nulipara !== "boolean") return incompleto("a paridade (nulípara ou multípara)");
  if (nFetos == null || nFetos < 1) return incompleto("o número de fetos");
  if (!apres) return incompleto("a apresentação fetal");
  if (semanas == null) return incompleto("a idade gestacional em semanas");

  const dar = g => ({ grupo: g, descricao: ROBSON[g], completo: true, falta: null });

  if (nFetos >= 2) return dar(8);              // múltipla
  if (apres === "anomala") return dar(9);      // transversa/oblíqua
  if (apres === "pelvica") return dar(nulipara ? 6 : 7);
  // resta feto único cefálico
  if (semanas < 37) return dar(10);            // pré-termo
  if (cesareaAnterior) return dar(5);          // cesárea anterior, termo
  // termo, cefálico, único, sem cesárea anterior → 1–4 pelo início do trabalho
  const inicio = normInicio(d.inicio);
  if (!inicio) return incompleto("como o trabalho começou (espontâneo, induzido ou cesárea antes do trabalho)");
  const espontaneo = inicio === "espontaneo";
  if (nulipara) return dar(espontaneo ? 1 : 2);
  return dar(espontaneo ? 3 : 4);
}

/**
 * Hemorragia pós-parto. O limiar de HPP depende da via (500 ml vaginal,
 * 1000 ml cesárea); ≥1000 ml é HPP GRAVE em qualquer via (critério da OMS).
 * Numa cesárea os dois coincidem em 1000 — de propósito: 1000 ml numa cesárea
 * já é o ponto de atenção.
 */
export function avaliarHemorragia({ perda_ml, via } = {}) {
  const perda = num(perda_ml);
  if (perda == null || perda < 0) return { avaliado: false, hemorragia: false, grave: false };
  const cesarea = normVia(via) === "cesarea";
  const limiar = cesarea ? 1000 : 500;
  return {
    avaliado: true,
    perda,
    via: cesarea ? "cesarea" : "vaginal",
    limiar,
    hemorragia: perda >= limiar,
    grave: perda >= 1000,
  };
}

/** Faixa do Apgar (0–10): 0–3 grave, 4–6 moderado, 7–10 normal. Inválido fora de 0–10. */
export function avaliarApgar(valor) {
  const n = num(valor);
  if (n == null || !Number.isInteger(n) || n < 0 || n > 10) return { valido: false, valor: null, faixa: null };
  return { valido: true, valor: n, faixa: n >= 7 ? "normal" : n >= 4 ? "moderado" : "grave" };
}
