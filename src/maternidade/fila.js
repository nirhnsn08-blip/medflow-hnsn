// ═══════════════════════════════════════════════════════════
// FILA OBSTÉTRICA — motor puro
//
// "Quem são as minhas pacientes obstétricas AGORA?" — sem digitar nome. A
// resposta mora em dois lugares que a maternidade não lia:
//   • o PS, quando a triagem é obstétrica (ps_atendimentos.triagem_tipo);
//   • os leitos do setor maternidade que estão ocupados.
// Este motor junta os dois numa lista só, marca em que ponto do caminho cada
// uma está (falta admitir / já admitida / ainda sem prontuário) e ordena pela
// urgência. O desenho é da tela; a conduta é de quem assiste.
//
// ⚠️ NÃO FUNDE POR INICIAIS. Duas "M.S." podem ser duas mulheres. Só se
// junta a mesma paciente do PS e do leito quando compartilham PRONTUÁRIO —
// fingir que duas iniciais iguais são a mesma pessoa é o tipo de falso que o
// resto do sistema evita. Sem prontuário, cada linha fica por si.
//
// ⚠️ APOIO, NÃO CONDUTA. A ordem por cor de triagem chama atenção; não decide.
// ═══════════════════════════════════════════════════════════

export const ESTADO = {
  ADMITIDA: "admitida",                 // já tem episódio de maternidade aberto → parte pro partograma
  AGUARDANDO: "aguardando_admissao",    // tem prontuário, falta a admissão obstétrica
  SEM_PRONTUARIO: "sem_prontuario",     // veio só com iniciais — admitir exige cadastrar primeiro
};

export const ORIGEM = { PS: "ps", LEITO: "leito", AMBOS: "ambos" };

// Manchester, do mais grave ao menos. `null` (sem triagem) vai por último.
const RANK_TRIAGEM = { vermelho: 1, laranja: 2, amarelo: 3, verde: 4, azul: 5 };
export function severidadeTriagem(cor) {
  return RANK_TRIAGEM[String(cor || "").toLowerCase()] ?? 6;
}

// Uma vez finalizado E embora, o atendimento do PS não é mais fila: quem
// internou vira leito; quem teve alta/evasão/óbito/transferência saiu.
const DESFECHOS_FORA = new Set(["alta", "evasao", "obito", "transferencia"]);

/**
 * O setor é texto livre, configurado por hospital. Sem uma lista explícita,
 * casa pelo nome (maternidade / obstetrícia / obstétrico / alojamento
 * conjunto). Passe `config` (array de nomes) para cravar quais setores contam.
 */
export function ehSetorMaternidade(setor, config = null) {
  const s = String(setor || "").trim().toLowerCase();
  if (!s) return false;
  if (Array.isArray(config) && config.length) {
    return config.some(c => String(c || "").trim().toLowerCase() === s);
  }
  return /matern|obst[eé]tr|alojamento conjunto/.test(s);
}

/** Prontuário normalizado (string não-vazia) ou null. */
function pront(v) {
  const s = v == null ? "" : String(v).trim();
  return s ? s : null;
}
function iniciaisLimpas(v) {
  return String(v || "").trim().replace(/\s+/g, " ");
}
/** Epoch ms de uma data (Date/ISO/‘YYYY-MM-DD’), ou +∞ se ilegível (vai por último no “mais antigo primeiro”). */
function ms(d) {
  if (!d) return Infinity;
  const t = d instanceof Date ? d.getTime() : Date.parse(d);
  return Number.isNaN(t) ? Infinity : t;
}
function isoOuNull(d) {
  const t = ms(d);
  return t === Infinity ? null : new Date(t).toISOString();
}

/** Um atendimento do PS que interessa à fila: triagem obstétrica e ainda em jogo. */
function psRelevante(a) {
  if (!a) return false;
  const obst = a.triagem_tipo === "obstetrica" || a.gestante === true;
  if (!obst) return false;
  // Saiu do PS? (alta/evasão/óbito/transferência já foram embora; internação
  // vira leito e é a fonte de leitos que cobre, sem duplicar aqui.)
  if (a.desfecho && DESFECHOS_FORA.has(a.desfecho)) return false;
  if (a.desfecho === "internacao") return false;
  return true;
}

/**
 * Monta a fila obstétrica a partir das duas fontes + os episódios de
 * maternidade abertos (para saber quem já foi admitida).
 *
 * @param ps                 linhas de ps_atendimentos
 * @param leitos             linhas de leitos
 * @param episodiosAbertos   mat_episodios com status em_andamento
 * @param setoresMaternidade array opcional de nomes de setor que contam como maternidade
 * @returns lista ordenada de itens da fila
 */
export function montarFilaObstetrica({ ps = [], leitos = [], episodiosAbertos = [], setoresMaternidade = null } = {}) {
  // Prontuário → id do episódio aberto (o 1º basta; a admissão não duplica dossiê).
  const epPorPront = new Map();
  for (const e of Array.isArray(episodiosAbertos) ? episodiosAbertos : []) {
    const p = pront(e?.prontuario);
    if (p && !epPorPront.has(p)) epPorPront.set(p, e.id);
  }

  const itens = [];

  // ── PS: triagem obstétrica ainda em jogo ────────────────────
  for (const a of Array.isArray(ps) ? ps : []) {
    if (!psRelevante(a)) continue;
    itens.push({
      origem: ORIGEM.PS,
      iniciais: iniciaisLimpas(a.iniciais),
      prontuario: pront(a.prontuario),
      leito: null,
      triagem: a.classificacao || null,
      queixa: a.queixa || null,
      desde: isoOuNull(a.chegada_em),
      psId: a.id ?? null,
    });
  }

  // ── Leitos do setor maternidade, ocupados ───────────────────
  for (const l of Array.isArray(leitos) ? leitos : []) {
    if (l?.status !== "ocupado") continue;
    if (!ehSetorMaternidade(l.setor, setoresMaternidade)) continue;
    itens.push({
      origem: ORIGEM.LEITO,
      iniciais: iniciaisLimpas(l.iniciais),
      prontuario: pront(l.prontuario),
      leito: l.identificacao ?? null,
      triagem: null,
      queixa: l.motivo || null,
      desde: isoOuNull(l.data_internacao),
      psId: null,
    });
  }

  // ── Fundir PS + leito da MESMA paciente — só quando há prontuário ──
  const porProntuario = new Map();
  const soltos = [];   // sem prontuário: não se funde (iniciais não bastam)
  for (const it of itens) {
    if (!it.prontuario) { soltos.push(it); continue; }
    const antes = porProntuario.get(it.prontuario);
    if (!antes) { porProntuario.set(it.prontuario, it); continue; }
    porProntuario.set(it.prontuario, fundir(antes, it));
  }

  const fundidos = [...porProntuario.values(), ...soltos].map(it => {
    const episodioId = it.prontuario ? (epPorPront.get(it.prontuario) ?? null) : null;
    const estado = episodioId ? ESTADO.ADMITIDA
      : it.prontuario ? ESTADO.AGUARDANDO
      : ESTADO.SEM_PRONTUARIO;
    return {
      chave: it.prontuario ? `pr:${it.prontuario}` : `${it.origem}:${it.leito || it.psId || it.iniciais}`,
      ...it,
      episodioId,
      estado,
    };
  });

  fundidos.sort(comparar);
  return fundidos;
}

/** Une duas linhas da mesma paciente (mesmo prontuário): guarda o leito, a triagem do PS, a data mais antiga. */
function fundir(a, b) {
  const comLeito = a.leito || b.leito;
  return {
    origem: a.origem === b.origem ? a.origem : ORIGEM.AMBOS,
    iniciais: a.iniciais || b.iniciais,
    prontuario: a.prontuario || b.prontuario,
    leito: comLeito,
    triagem: a.triagem || b.triagem,
    queixa: a.queixa || b.queixa,
    desde: [a.desde, b.desde].filter(Boolean).sort()[0] || null,
    psId: a.psId ?? b.psId,
  };
}

// Precisa de ação primeiro (falta admitir / sem prontuário), depois as já
// admitidas. Dentro de cada grupo: triagem mais grave, depois espera mais longa.
const PRIORIDADE_ESTADO = { [ESTADO.AGUARDANDO]: 0, [ESTADO.SEM_PRONTUARIO]: 0, [ESTADO.ADMITIDA]: 1 };
function comparar(a, b) {
  const pa = PRIORIDADE_ESTADO[a.estado], pb = PRIORIDADE_ESTADO[b.estado];
  if (pa !== pb) return pa - pb;
  const sa = severidadeTriagem(a.triagem), sb = severidadeTriagem(b.triagem);
  if (sa !== sb) return sa - sb;
  return ms(a.desde) - ms(b.desde);   // mais antiga (esperando mais) no topo
}
