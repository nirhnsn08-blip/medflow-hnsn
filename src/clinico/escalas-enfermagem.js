// Escalas de enfermagem à beira-leito — cálculo e classificação puros (sem
// rede, sem React), testáveis. As escalas são padronizadas; os CORTES de
// classificação e os gatilhos de reavaliação vêm da tabela editável
// `enf_escala_faixas` (ADM Master), não do código. Apoio à decisão — a conduta
// é da enfermeira.
//
// Escalas por SOMA de subitens: Braden, Morse, Fugulin, Glasgow.
// Escalas por VALOR direto: dor (0–10), RASS (−5 a +4), flebite (grau 0–4).

const TIPO_SOMA = new Set(["braden", "morse", "fugulin", "glasgow"]);

// Score da escala. Soma os subitens (escalas de soma) ou lê o valor direto
// (dor/rass/flebite, guardados em `itens.valor`). Retorna null se não dá.
export function scoreEscala(tipo, itens) {
  if (TIPO_SOMA.has(tipo)) {
    const vals = Object.values(itens || {}).map(Number).filter(x => !Number.isNaN(x));
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  }
  const v = itens && itens.valor;
  return v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v);
}

// Faixa (corte) em que o score cai, dentre as faixas ativas da escala. Faixas
// nulas em min/max são abertas naquele lado. Retorna a linha de enf_escala_faixas
// ou null.
export function classificarEscala(tipo, score, faixas) {
  if (score == null) return null;
  return (faixas || [])
    .filter(f => f && f.ativo !== false && f.tipo === tipo)
    .find(f => (f.faixa_min == null || score >= f.faixa_min) && (f.faixa_max == null || score <= f.faixa_max)) || null;
}

// Avalia uma escala: { score, classificacao, nivel, reavaliar_horas, faixa }.
export function avaliarEscala(tipo, itens, faixas) {
  const score = scoreEscala(tipo, itens);
  const faixa = classificarEscala(tipo, score, faixas);
  return {
    score,
    classificacao: faixa ? faixa.rotulo : null,
    nivel: faixa ? faixa.nivel : null,
    reavaliar_horas: faixa ? (faixa.reavaliar_horas ?? null) : null,
    faixa: faixa || null,
  };
}

// Já passou do prazo de reavaliação desde a última aferição? Alimenta a lista
// de trabalho / o mapa de risco (o "gatilho com cronômetro", como o tempo-alvo
// da triagem). Sem prazo definido → nunca cobra.
export function precisaReavaliar(ultimaAferidoEm, reavaliarHoras, agoraMs = Date.now()) {
  if (!ultimaAferidoEm || !reavaliarHoras) return false;
  const t = new Date(ultimaAferidoEm).getTime();
  if (Number.isNaN(t)) return false;
  return agoraMs - t >= reavaliarHoras * 3600 * 1000;
}

// Todas as faixas ativas (opcionalmente de um subconjunto de escalas) estão
// validadas pelo ADM Master? Enquanto false, a tela mostra "em validação".
export function escalasValidadas(faixas, tipos) {
  const ativas = (faixas || []).filter(f => f && f.ativo !== false && (!tipos || tipos.includes(f.tipo)));
  return ativas.length > 0 && ativas.every(f => f.validado === true);
}
