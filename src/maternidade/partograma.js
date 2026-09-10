// ═══════════════════════════════════════════════════════════
// PARTOGRAMA — motor puro (partograma clássico da OMS)
//
// O gráfico do trabalho de parto: dilatação × tempo, com a LINHA DE ALERTA
// (1 cm/h a partir da fase ativa) e a LINHA DE AÇÃO (4 h à direita). Um toque
// que cai à direita da alerta é evolução lenta (observar); passar da ação
// pede reavaliação. Este motor decide APENAS em que zona cada ponto cai — o
// desenho é da tela, a conduta é de quem assiste.
//
// ⚠️ APOIO, NUNCA CONDUTA. E "sem toque em fase ativa" NÃO é "normal": é
// "ainda não dá para dizer". Fingir normal num gráfico vazio é o mesmo
// falso-verde que o MEOWS evita.
//
// ⚠️ FASE ATIVA CONFIGURÁVEL. O clássico abre em 4 cm; a OMS recente usa 5 cm.
// `referenciaCm` entra por parâmetro para o responsável técnico validar — o
// seed é 4 (o mais usado no Brasil), não uma lei cravada.
// ═══════════════════════════════════════════════════════════

const MS_HORA = 3600000;

export const REFERENCIA_CM = 4;   // dilatação que abre a fase ativa (onde a alerta começa)
export const CM_POR_HORA = 1;     // inclinação da linha de alerta
export const ACAO_HORAS = 4;      // a linha de ação corre 4 h à direita da alerta
export const DILATACAO_MAX = 10;

export const ZONA = { LATENTE: "latente", NORMAL: "normal", ALERTA: "alerta", ACAO: "acao" };

/** Epoch ms de uma data (Date ou ISO), ou null se ilegível. */
function ms(d) {
  if (!d) return null;
  const t = d instanceof Date ? d.getTime() : Date.parse(d);
  return Number.isNaN(t) ? null : t;
}

/** Horas de `a` até `b` (fracionário). Null se qualquer uma for ilegível. */
export function horasEntre(a, b) {
  const ta = ms(a), tb = ms(b);
  return ta == null || tb == null ? null : (tb - ta) / MS_HORA;
}

/** A hora (após o início da fase ativa) em que a linha de ALERTA atinge `cm`. */
export function horaAlertaDe(cm, ref = REFERENCIA_CM) {
  return (Number(cm) - ref) / CM_POR_HORA;
}

/**
 * A zona de um toque de dilatação `cm` medido `horas` após o início da fase
 * ativa. A comparação é HORIZONTAL, como no papel: a alerta esperava aquela
 * dilatação em `horaAlertaDe(cm)`; o ATRASO é `horas - horaAlerta`.
 */
export function zonaPorAtraso(horas, cm, ref = REFERENCIA_CM) {
  if (Number(cm) < ref) return ZONA.LATENTE;      // fase latente: a alerta nem começou
  const atraso = horas - horaAlertaDe(cm, ref);
  if (atraso <= 0) return ZONA.NORMAL;            // em cima ou à esquerda da alerta
  if (atraso <= ACAO_HORAS) return ZONA.ALERTA;   // entre a alerta e a ação
  return ZONA.ACAO;                               // à direita da ação
}

/**
 * Avalia a série de toques. Ordena por tempo, acha o início da fase ativa (o
 * 1º toque com dilatação ≥ referência = onde a alerta nasce) e classifica
 * cada ponto. Devolve o que a tela pinta e o que o cabeçalho resume.
 */
export function avaliarPartograma(registros, { referenciaCm = REFERENCIA_CM } = {}) {
  const lista = (Array.isArray(registros) ? registros : [])
    .filter(r => r && r.data_hora != null && r.dilatacao != null && ms(r.data_hora) != null)
    .map(r => ({ ...r, _t: ms(r.data_hora), dilatacao: Number(r.dilatacao) }))
    .sort((a, b) => a._t - b._t);

  const ativo = lista.find(r => r.dilatacao >= referenciaCm);
  const t0 = ativo ? ativo._t : null;

  const pontos = lista.map(r => {
    const horas = t0 == null ? null : (r._t - t0) / MS_HORA;
    const zona = t0 == null ? ZONA.LATENTE : zonaPorAtraso(horas, r.dilatacao, referenciaCm);
    return { data_hora: r.data_hora, dilatacao: r.dilatacao, horas, zona };
  });

  const emAtiva = pontos.filter(p => p.zona !== ZONA.LATENTE);
  const ultimo = emAtiva[emAtiva.length - 1] || null;
  const fim = horaAlertaDe(DILATACAO_MAX, referenciaCm);   // horas até a alerta chegar a 10

  return {
    t0: t0 == null ? null : new Date(t0).toISOString(),
    referenciaCm,
    // Sem ponto em fase ativa, zona é null — "não dá para dizer", não "normal".
    zonaAtual: ultimo ? ultimo.zona : null,
    cruzouAlerta: pontos.some(p => p.zona === ZONA.ALERTA || p.zona === ZONA.ACAO),
    cruzouAcao: pontos.some(p => p.zona === ZONA.ACAO),
    pontos,
    duracaoHoras: ultimo ? ultimo.horas : null,
    // As duas linhas para a tela desenhar (da referência até 10 cm).
    linhaAlerta: t0 == null ? [] : [{ horas: 0, cm: referenciaCm }, { horas: fim, cm: DILATACAO_MAX }],
    linhaAcao:   t0 == null ? [] : [{ horas: ACAO_HORAS, cm: referenciaCm }, { horas: ACAO_HORAS + fim, cm: DILATACAO_MAX }],
  };
}
