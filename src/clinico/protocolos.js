// ═══════════════════════════════════════════════════════════
// Protocolos clínicos gerenciados — MOTOR PURO (Tier 1 — Fase 3a)
//
// Sem React, sem rede, sem DOM — é onde ficam os testes. A tela só faz o chat
// com estas funções. Reaproveita o NEWS (scoreAlertaPrecoce) como gatilho da
// sepse: nada de escore novo, o gatilho acende do que já existe.
//
// Conceitos:
//   • GATILHO  — decide se o protocolo deve acender a partir dos sinais vitais.
//   • BUNDLE   — os passos do template + os overrides de alvo do setor.
//   • RELÓGIO  — para cada passo, quanto decorreu desde o acionamento e se
//                estourou o alvo (mesma lógica de tempo-alvo da triagem).
//   • KPI      — porta→ação (ex.: porta→ATB) e % do bundle no alvo, por setor.
// ═══════════════════════════════════════════════════════════

import { scoreAlertaPrecoce } from "./prontuario.js";
import { SEPSE } from "./protocolos-catalogo.js";

const MIN = 60000; // ms por minuto

/** Minutos inteiros entre dois instantes (b − a). null se faltar dado. */
export function minutosEntre(a, b) {
  if (!a || !b) return null;
  const ta = new Date(a).getTime(), tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  return Math.round((tb - ta) / MIN);
}

/**
 * Gatilho da sepse a partir dos sinais vitais (NEWS) + suspeita de foco
 * infeccioso. É APOIO À DECISÃO: acende o alerta e pede confirmação do foco —
 * não "diagnostica" sepse. Devolve { aciona, score, nivel, alvo, motivo }.
 *
 * `suspeitaInfeccao`: se explicitamente false, não aciona (sem foco não é
 * sepse). Ausente/true → aciona pelo NEWS e pede para confirmar o foco.
 */
export function avaliarGatilhoSepse(sinais, ctx = {}, template = SEPSE) {
  const min = template?.gatilho?.min ?? 5;
  const news = scoreAlertaPrecoce(sinais);
  if (!news) return { aciona: false, score: null, nivel: null, alvo: min, motivo: "Dados de sinais vitais insuficientes para o NEWS." };
  const base = { score: news.score, nivel: news.nivel, alvo: min };
  if (news.score < min) return { ...base, aciona: false, motivo: `NEWS ${news.score} < ${min} — abaixo do gatilho.` };
  if (ctx.suspeitaInfeccao === false) return { ...base, aciona: false, motivo: `NEWS ${news.score}, mas sem suspeita de foco infeccioso.` };
  return { ...base, aciona: true, motivo: `NEWS ${news.score} ≥ ${min}${ctx.suspeitaInfeccao ? " com suspeita de foco infeccioso" : " — confirmar foco infeccioso"}.` };
}

// Termos que, na queixa livre da triagem, sugerem dor torácica (gatilho do IAM).
const TERMOS_DOR_TORACICA = ["dor toracica", "dor no peito", "dor no torax", "precordial", "precordialgia", "aperto no peito", "retroesternal", "dor no coracao"];

/**
 * Gatilho do protocolo de dor torácica / IAM. A queixa da triagem é TEXTO LIVRE
 * (não há discriminador estruturado), então o gatilho é uma SUGESTÃO por
 * palavra-chave: se a queixa menciona dor torácica, sugere abrir o protocolo
 * (ECG ≤ 10 min). O acionamento em si é manual. Puro/testável.
 */
export function avaliarGatilhoDorToracica(queixa) {
  const s = (queixa || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const termo = TERMOS_DOR_TORACICA.find(t => s.includes(t));
  if (termo) return { sugere: true, termo, motivo: `Queixa sugere dor torácica ("${termo}") — considerar protocolo de IAM: ECG em ≤ 10 min.` };
  return { sugere: false, termo: null, motivo: queixa ? "A queixa não menciona dor torácica." : "Informe a queixa para checar o gatilho." };
}

/**
 * Monta o bundle efetivo de uma instância de setor: os passos do template com
 * os alvos sobrescritos pelo setor (prot_setor.passos_over e janela_min).
 * Puro — não decide nada, só resolve os alvos. Ordena por `ordem`.
 */
export function montarBundle(template, instancia = null) {
  const t = template || {};
  const over = {};
  for (const p of (instancia?.passos_over || [])) if (p && p.chave != null) over[p.chave] = p;
  const passos = (t.passos || []).map(p => ({
    ...p,
    alvo_min: over[p.chave]?.alvo_min ?? p.alvo_min,
  })).sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
  return {
    chave: t.chave,
    titulo: t.titulo,
    referencia: t.referencia,
    janela_min: instancia?.janela_min ?? t.janela_min ?? null,
    passos,
  };
}

// Situação de um passo do bundle numa ativação.
function situacaoPasso(passo, item, acionado_em, agora, ativa) {
  const alvo = passo.alvo_min;
  if (item && item.nao_aplica) return { chave: passo.chave, rotulo: passo.rotulo, alvo_min: alvo, critico: !!passo.critico, situacao: "nao_aplica", feito: false, decorrido_min: null, valor: item.valor ?? null };
  if (item && item.feito) {
    const dec = minutosEntre(acionado_em, item.feito_em);
    const noAlvo = alvo == null || dec == null || dec <= alvo;
    return { chave: passo.chave, rotulo: passo.rotulo, alvo_min: alvo, critico: !!passo.critico, situacao: noAlvo ? "feito_no_alvo" : "feito_fora", feito: true, decorrido_min: dec, feito_em: item.feito_em, valor: item.valor ?? null };
  }
  const dec = minutosEntre(acionado_em, agora);
  const estourou = ativa && alvo != null && dec != null && dec > alvo;
  return { chave: passo.chave, rotulo: passo.rotulo, alvo_min: alvo, critico: !!passo.critico, situacao: estourou ? "estourado" : "pendente", feito: false, decorrido_min: dec, valor: null };
}

/**
 * Estado completo de uma ativação: cada passo com relógio + situação, e o
 * resumo (decorrido total, completos, críticos pendentes, % e se cumpriu a
 * janela). `agora` injetável para teste. Puro.
 */
export function estadoAtivacao(ativacao, itens = [], bundle = null, agora = Date.now()) {
  const b = bundle || {};
  const passosDef = b.passos || [];
  const ativa = (ativacao?.status || "ativa") === "ativa";
  const t0 = ativacao?.acionado_em;
  const fim = ativa ? agora : (ativacao?.encerrado_em || agora);
  // último item por passo (append-only → o mais recente vale)
  const porPasso = {};
  for (const it of itens) {
    const cur = porPasso[it.passo];
    if (!cur || new Date(it.feito_em) >= new Date(cur.feito_em)) porPasso[it.passo] = it;
  }
  const passos = passosDef.map(p => situacaoPasso(p, porPasso[p.chave], t0, fim, ativa));
  const criticos = passos.filter(p => p.critico);
  const criticosFeitos = criticos.filter(p => p.feito);
  const feitos = passos.filter(p => p.feito);
  const aplicaveis = passos.filter(p => p.situacao !== "nao_aplica");
  const decorrido_total = minutosEntre(t0, fim);
  const janela = b.janela_min;
  const dentro_janela = criticos.length > 0 && criticos.every(p => p.feito && (janela == null || (p.decorrido_min != null && p.decorrido_min <= janela)));
  return {
    passos,
    decorrido_total,
    janela_min: janela ?? null,
    total: passos.length,
    completos: feitos.length,
    criticos_total: criticos.length,
    criticos_pendentes: criticos.length - criticosFeitos.length,
    estourando: passos.filter(p => p.situacao === "estourado").length,
    pct: aplicaveis.length ? Math.round((feitos.length / aplicaveis.length) * 100) : 0,
    dentro_janela,
    farol: ativa && passos.some(p => p.situacao === "estourado") ? "vermelho"
         : ativa && criticos.some(p => !p.feito) ? "amarelo" : "verde",
  };
}

/** Minutos porta→ação de um passo (ex.: "atb") numa ativação. null se não feito. */
export function tempoPortaAcao(ativacao, itens = [], passoChave = "atb") {
  const it = itens.filter(x => x.passo === passoChave && x.feito).sort((a, b) => new Date(a.feito_em) - new Date(b.feito_em))[0];
  return it ? minutosEntre(ativacao?.acionado_em, it.feito_em) : null;
}

const mediana = arr => {
  const v = arr.filter(x => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
};

/**
 * Indicadores porta→ação de um protocolo (opcionalmente filtrado por setor).
 * `itensPorAtivacao`: { [ativacao_id]: item[] }. `bundle` dá a janela e o passo-
 * alvo (default "atb"). Sem digitação — sai dos carimbos de tempo. Puro.
 */
export function indicadoresProtocolo(ativacoes = [], itensPorAtivacao = {}, { setor = null, janela_min = 60, passoAlvo = "atb" } = {}) {
  const lista = ativacoes.filter(a => !setor || a.setor === setor);
  const concluidas = lista.filter(a => a.status === "concluida");
  const temposAlvo = [];
  let bundleNoAlvo = 0, comAlvoFeito = 0;
  for (const a of lista) {
    const itens = itensPorAtivacao[a.id] || [];
    const t = tempoPortaAcao(a, itens, passoAlvo);
    if (t != null) { temposAlvo.push(t); comAlvoFeito++; if (janela_min == null || t <= janela_min) bundleNoAlvo++; }
  }
  return {
    total: lista.length,
    ativas: lista.filter(a => a.status === "ativa").length,
    concluidas: concluidas.length,
    confirmados: lista.filter(a => a.desfecho === "confirmado").length,
    tempoMedianoAlvo: mediana(temposAlvo),
    pctAlvoNoPrazo: comAlvoFeito ? Math.round((bundleNoAlvo / comAlvoFeito) * 100) : null,
    passoAlvo,
    janela_min,
  };
}

/** Resumo do painel de um setor: acionamentos ativos e quantos estourando. */
export function resumoPainelSetor(ativacoes = [], itensPorAtivacao = {}, bundlePorProtocolo = {}, agora = Date.now()) {
  const ativas = ativacoes.filter(a => (a.status || "ativa") === "ativa");
  let estourando = 0, criticosPendentes = 0;
  for (const a of ativas) {
    const est = estadoAtivacao(a, itensPorAtivacao[a.id] || [], bundlePorProtocolo[a.protocolo] || null, agora);
    if (est.estourando > 0) estourando++;
    criticosPendentes += est.criticos_pendentes;
  }
  return { ativas: ativas.length, estourando, criticosPendentes };
}
