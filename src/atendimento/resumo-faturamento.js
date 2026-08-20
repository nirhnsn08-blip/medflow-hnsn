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
