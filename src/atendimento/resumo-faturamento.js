// ═══════════════════════════════════════════════════════════
// RESUMO DO FATURAMENTO — o motor da Visão Executiva
//
// Puro: não sabe o que é React nem banco. Recebe a WORKLIST já cruzada
// (`montarWorklist`: internações × conta) e a tabela SIGTAP, e devolve os
// números que a Visão Executiva mostra: o funil de trabalho, o backlog de
// internações esperando conta, o valor de referência do que ainda não foi
// faturado e um farol de sinais REAIS.
//
// UM PRINCÍPIO, HERDADO DE faturamento.js / montar-conta.js:
//   FALTA DE DADO É SILÊNCIO, NÃO NÚMERO INVENTADO. A tela antiga mostrava
//   "R$ 2,10 mi a receber" e "índice de glosa 4,8%" como ilustração — números
//   que o hospital ainda não tem (não há ciclo de recebimento nem retorno de
//   glosa). Este motor só devolve o que dá para contar do que existe: quantas
//   internações há, em que estágio da conta, e o valor de REFERÊNCIA (SIGTAP)
//   das que ainda não têm conta. Sem conta montada, `valorRefBacklog` é `null`
//   — que é "nada a estimar", diferente de R$ 0,00.
//
// O QUE ESTE MOTOR NÃO FAZ: faturado × recebido × glosado real (depende do
// ciclo de receita e do retorno do SUS, que ainda não existem), nem projeção.
// Quando esse dado existir, entra aqui — sem mexer na tela.
// ═══════════════════════════════════════════════════════════

import { codigoLimpo } from "./sigtap.js";
import { resolverVia } from "./montar-conta.js";
import { VIAS } from "./faturamento.js";

// As situações da conta na worklist, na ORDEM do trabalho (não cronológica):
// primeiro o que ainda não tem conta (é o que se monta), por fim o faturado.
export const SITUACOES = ["sem-conta", "aberta", "fechada", "faturada", "glosada"];

// Uma internação sem conta por mais dias que isto vira alerta no farol: a
// conta não montada não fatura, e o prazo da AIH corre enquanto isso.
export const DIAS_ALERTA_BACKLOG = 3;

function diasDesde(dataISO, hoje) {
  const t = Date.parse(String(dataISO || ""));
  if (!Number.isFinite(t)) return null;
  return Math.floor((hoje.getTime() - t) / 86400000);
}

// Valor de referência SIGTAP de um procedimento (SH + SP), em centavos, ou
// `null` quando o código não está na tabela ou não tem valor cadastrado.
function valorRefDe(codigo, mapaSigtap) {
  const c = codigoLimpo(codigo);
  const s = c ? mapaSigtap.get(c) : null;
  if (!s) return null;
  const sh = s.valor_sh, sp = s.valor_sp;
  if (sh == null && sp == null) return null;
  return (sh || 0) + (sp || 0);
}

function competenciaLocal(hoje) {
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * O resumo executivo do faturamento.
 *
 * Entradas (o chamador carrega e passa; o motor não toca o banco):
 *   • worklist    — as linhas de `montarWorklist` (cada uma com `situacao`,
 *                   `procedimento_cod`, `chegada_em`, `desfecho_em`…).
 *   • sigtapProcs — as linhas de `sigtap_procedimentos` (código → valor).
 *   • hoje        — a referência de "agora" (injetável para teste).
 *
 * Devolve contagens por situação, o funil de trabalho, o backlog e sua idade,
 * o valor de referência do backlog e um farol de sinais reais. Tudo derivado —
 * nada inventado.
 */
export function resumoFaturamento({ worklist = [], sigtapProcs = [], hoje = new Date() } = {}) {
  const rows = Array.isArray(worklist) ? worklist : [];

  const mapaSigtap = new Map();
  for (const s of Array.isArray(sigtapProcs) ? sigtapProcs : []) {
    const c = s ? codigoLimpo(s.codigo) : null;
    if (c) mapaSigtap.set(c, s);
  }

  const porSituacao = Object.fromEntries(SITUACOES.map((k) => [k, 0]));
  let valorRefBacklog = 0;     // centavos, só das internações SEM conta
  let comValorRef = 0, semValorRef = 0;
  let backlogVelho = 0;        // sem conta há DIAS_ALERTA_BACKLOG+ dias
  let maisAntigoBacklog = null; // idade (dias) da internação sem conta mais antiga

  for (const r of rows) {
    const sit = SITUACOES.includes(r?.situacao) ? r.situacao : "sem-conta";
    porSituacao[sit] += 1;

    if (sit === "sem-conta") {
      const v = valorRefDe(r?.procedimento_cod, mapaSigtap);
      if (v == null) semValorRef += 1;
      else { valorRefBacklog += v; comValorRef += 1; }

      const d = diasDesde(r?.desfecho_em || r?.chegada_em, hoje);
      if (d != null) {
        if (maisAntigoBacklog == null || d > maisAntigoBacklog) maisAntigoBacklog = d;
        if (d >= DIAS_ALERTA_BACKLOG) backlogVelho += 1;
      }
    }
  }

  const total = rows.length;
  const backlog = porSituacao["sem-conta"];
  const emAberto = porSituacao["aberta"];
  const concluidas = porSituacao["fechada"] + porSituacao["faturada"];
  const glosadas = porSituacao["glosada"];

  // O funil de trabalho, na ordem em que uma conta caminha.
  const funil = [
    { chave: "sem-conta", label: "Esperando conta", n: backlog },
    { chave: "aberta", label: "Conta aberta", n: emAberto },
    { chave: "fechada", label: "Fechada", n: porSituacao["fechada"] },
    { chave: "faturada", label: "Faturada", n: porSituacao["faturada"] },
  ];
  if (glosadas > 0) funil.push({ chave: "glosada", label: "Glosada", n: glosadas });

  // O farol só acende com sinal real. Nada de prazo fictício.
  const plural = (n, um, muitos) => (n === 1 ? um : muitos);
  const farol = [];
  if (backlogVelho > 0) {
    farol.push({
      chave: "backlog-velho",
      sev: backlogVelho >= 5 ? "red" : "amb",
      titulo: `${backlogVelho} ${plural(backlogVelho, "internação", "internações")} há ${DIAS_ALERTA_BACKLOG}+ dias sem conta`,
      desc: "A conta não montada não fatura — e o prazo da AIH corre.",
      tag: maisAntigoBacklog != null ? `+ antiga: ${maisAntigoBacklog}d` : "",
    });
  }
  if (emAberto > 0) {
    farol.push({
      chave: "aberta-a-fechar",
      sev: "amb",
      titulo: `${emAberto} ${plural(emAberto, "conta aberta", "contas abertas")} a fechar`,
      desc: "Revisar os itens e fechar na competência.",
      tag: String(emAberto),
    });
  }
  if (glosadas > 0) {
    farol.push({
      chave: "glosada",
      sev: "red",
      titulo: `${glosadas} ${plural(glosadas, "conta glosada", "contas glosadas")}`,
      desc: "Recurso no prazo — perdeu o prazo, perdeu o dinheiro.",
      tag: String(glosadas),
    });
  }
  if (backlog === 0 && emAberto === 0 && total > 0) {
    farol.push({
      chave: "em-dia",
      sev: "ok",
      titulo: "Nada pendente de conta",
      desc: "Toda internação faturável já tem conta montada.",
      tag: "em dia",
    });
  }

  return {
    total,
    vazio: total === 0,
    porSituacao,
    backlog,
    emAberto,
    concluidas,
    glosadas,
    funil,
    valorRefBacklog: comValorRef > 0 ? valorRefBacklog : null,
    comValorRef,
    semValorRef,
    backlogVelho,
    maisAntigoBacklog,
    farol,
    competenciaAtual: competenciaLocal(hoje),
  };
}

// ── POR VIA ─────────────────────────────────────────────────

const arr = (x) => (Array.isArray(x) ? x : []);

// A ordem natural do faturamento SUS + privado. Via fora dela (ou sem via)
// cai no fim.
const ORDEM_VIA = ["aih", "apac", "bpa", "tiss", "direta"];

/**
 * A produção faturável repartida por via de faturamento.
 *
 * Por que uma função à parte do funil: o funil olha as INTERNAÇÕES e o estágio
 * da conta de cada uma (todas AIH). A via, não — ela nasce da produção inteira
 * (`carregarProducaoFaturavel`): internação vira AIH, ambulatório vira BPA/APAC
 * pelo `via_sus`, convênio vira TISS e particular vira cobrança direta. Só
 * assim BPA e APAC aparecem; a worklist de internações jamais os mostraria.
 *
 * O valor é o de REFERÊNCIA SIGTAP (SH+SP) do procedimento — não o faturado
 * real (que dependeria dos itens de cada conta). Falta de valor é silêncio:
 * `valorRef` fica `null`, e a via conta em `semValor`. Sem convênio no
 * atendimento, a via é indefinida e cai no balde `sem-via` — que é a verdade,
 * não um chute.
 */
export function resumoPorVia({ producao = [], convenios = [], procedimentos = [], sigtapProcs = [] } = {}) {
  const convMap = new Map();
  for (const c of arr(convenios)) if (c && c.id != null) convMap.set(String(c.id), c);
  const procMap = new Map();
  for (const p of arr(procedimentos)) { const k = codigoLimpo(p?.codigo); if (k) procMap.set(k, p); }
  const sigMap = new Map();
  for (const s of arr(sigtapProcs)) { const k = codigoLimpo(s?.codigo); if (k) sigMap.set(k, s); }

  const grupos = new Map(); // via → { n, valorRef, comValor, semValor }
  let valorRefTotal = 0, comTotal = 0, semTotal = 0;

  for (const a of arr(producao)) {
    const convenio = a?.convenio_id != null ? convMap.get(String(a.convenio_id)) || null : null;
    const k = codigoLimpo(a?.procedimento_cod);
    const procCatalogo = k ? procMap.get(k) || null : null;
    const sigtapProc = k ? sigMap.get(k) || null : null;
    const via = resolverVia({ convenio, atendimento: a, procCatalogo, sigtapProc }) || "sem-via";
    const v = valorRefDe(a?.procedimento_cod, sigMap);

    const g = grupos.get(via) || { n: 0, valorRef: 0, comValor: 0, semValor: 0 };
    g.n += 1;
    if (v == null) { g.semValor += 1; semTotal += 1; }
    else { g.valorRef += v; g.comValor += 1; valorRefTotal += v; comTotal += 1; }
    grupos.set(via, g);
  }

  const porVia = [...grupos.entries()].map(([via, g]) => ({
    via,
    label: VIAS[via]?.label || (via === "sem-via" ? "Sem via" : via),
    nome: VIAS[via]?.nome || (via === "sem-via" ? "Sem fonte pagadora definida" : ""),
    n: g.n,
    valorRef: g.comValor > 0 ? g.valorRef : null,
    semValor: g.semValor,
  })).sort((x, y) => {
    const ix = ORDEM_VIA.indexOf(x.via), iy = ORDEM_VIA.indexOf(y.via);
    const px = ix < 0 ? 99 : ix, py = iy < 0 ? 99 : iy;
    if (px !== py) return px - py;
    return y.n - x.n;
  });

  return {
    total: arr(producao).length,
    vazio: arr(producao).length === 0,
    porVia,
    valorRefTotal: comTotal > 0 ? valorRefTotal : null,
    comValorRef: comTotal,
    semValorRef: semTotal,
  };
}

// ═══════════════════════════════════════════════════════════
// AS CONTAS DA COMPETÊNCIA — o que o funil de internações não vê
//
// 🔴 POR QUE ISTO EXISTE
// Todo número da Visão Executiva sai da WORKLIST, e a worklist é
// `desfecho=eq.internacao`. Isso está certo para o funil — "esperando
// conta" só faz sentido na internação, onde a conta se monta do
// prontuário — e o funil diz isso no subtítulo.
//
// O que NÃO dizia era o KPI: "Faturadas — já transmitidas ao SUS" lia-se
// como afirmação sobre o hospital, e era sobre internações. Uma remessa de
// BPA inteira podia sair e o número não se mexia. Quem confere o mês pelo
// painel concluiria que nada foi transmitido.
//
// A correção tem duas metades, e as duas importam:
//   1. os rótulos passam a dizer INTERNAÇÕES, que é o que eles medem;
//   2. entra este resumo, que conta as contas DE VERDADE — todas, de
//      qualquer origem — dentro de uma competência.
//
// ⚠️ E ELE NÃO SE MISTURA COM O FUNIL. Ambulatório tem muito mais episódio
// que internação; jogar os dois no mesmo número afogaria o sinal da
// internação, que é onde corre o prazo da AIH e está o dinheiro grande.
// São dois recortes ao lado um do outro, cada um dizendo o que é.
// ═══════════════════════════════════════════════════════════

/**
 * Conta as contas de uma competência por situação e por via.
 *
 * Recebe o que `contasDaCompetencia` devolve — a tela não precisa de
 * consulta nova: o painel de remessa já carrega exatamente esta lista.
 *
 * `cancelada` fica de FORA das contagens de trabalho: conta cancelada não
 * espera nada de ninguém. Mas vai no próprio balde, porque sumir com ela
 * faria os números não fecharem com o total e alguém procuraria o buraco.
 */
export function resumoDeContas(contas = []) {
  const lista = Array.isArray(contas) ? contas : [];
  const porSituacao = { aberta: 0, fechada: 0, faturada: 0, glosada: 0, cancelada: 0 };
  const porVia = {};

  for (const c of lista) {
    const s = String(c?.status ?? "").trim();
    if (s in porSituacao) porSituacao[s] += 1;
    if (s === "cancelada") continue;   // não entra na leitura por via
    const v = String(c?.via ?? "").trim() || "sem via";
    porVia[v] = porVia[v] || { total: 0, aberta: 0, fechada: 0, faturada: 0, glosada: 0 };
    porVia[v].total += 1;
    if (s in porVia[v]) porVia[v][s] += 1;
  }

  const vivas = lista.length - porSituacao.cancelada;
  return {
    total: lista.length,
    vivas,
    porSituacao,
    porVia,
    vias: Object.keys(porVia).sort(),
    // O que a remessa do mês ainda não levou. É o número acionável daqui:
    // conta fechada é conta pronta parada.
    esperandoRemessa: porSituacao.fechada,
    vazio: vivas === 0,
  };
}
