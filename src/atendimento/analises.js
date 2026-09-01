// ═══════════════════════════════════════════════════════════
// ANÁLISES DO FATURAMENTO — os números que viram decisão
//
// Produção, ticket médio, índice de glosa e taxa de recuperação, por
// competência. É o BI que o gestor olha para saber se o mês foi bom.
//
// 🔴 O RISCO DESTA TELA NÃO É ERRAR A CONTA. É PARECER CERTO.
// Um indicador de faturamento errado não trava nada e não dá erro: ele
// vira reunião, meta e decisão. "Índice de glosa 0%" é a melhor notícia
// que este módulo pode dar — e é exatamente o que aparece quando a leitura
// das glosas falha, quando ninguém cadastrou preço, ou quando o mês não
// tem nada. Três causas opostas, um número só.
//
// Por isso TODO indicador daqui devolve `null` quando não dá para
// calcular, nunca zero. E `motivo` diz por quê, para a tela escrever a
// frase certa em vez de um "0%" que mente.
//
// ⚠️ NÃO REFAZ CONTA QUE JÁ EXISTE: `totalDaConta` (faturamento.js) soma
// os itens e conta os SEM PREÇO; `resumoDeContas` (resumo-faturamento.js)
// conta por situação e via. Aqui só se agrega o que elas devolvem.
// ═══════════════════════════════════════════════════════════

import { totalDaConta } from "./faturamento.js";
import { resumoDeContas } from "./resumo-faturamento.js";
import { resumoGlosas } from "./glosas.js";
import { naoDeuParaLer, listaLida } from "../util/leitura.js";

/**
 * Um indicador que sabe por que não sabe.
 *
 * `valor: null` + `motivo` é o par que impede o zero mentiroso. A tela
 * imprime "—" e a frase do motivo, em vez de um número que parece bom.
 */
function indicador(valor, motivo = null) {
  return { valor, motivo, temValor: valor != null };
}

export const MOTIVOS = {
  SEM_LEITURA: "nao_deu_para_ler",
  SEM_BASE:    "sem_base",         // o denominador é zero
  SEM_PRECO:   "sem_preco",        // há itens sem valor cadastrado
};

/**
 * O dinheiro faturado no conjunto de contas.
 *
 * ⚠️ `semPreco` NÃO É DETALHE. Item sem valor cadastrado faz a conta
 * parecer menor do que é, e o gestor lê "faturamento baixo" quando o
 * problema é catálogo incompleto. O número sobe junto com o total, sempre.
 *
 * `itensPorConta` é um mapa { conta_id: [itens] }.
 */
export function faturadoDe(contas, itensPorConta = {}) {
  const lista = listaLida(contas);
  let centavos = 0, semPreco = 0, comItens = 0;

  for (const c of lista) {
    const itens = itensPorConta[c?.id];
    if (!Array.isArray(itens) || !itens.length) continue;
    comItens++;
    const t = totalDaConta(itens);
    centavos += t.totalCentavos;
    semPreco += t.semPreco;
  }
  return { centavos, semPreco, comItens, contas: lista.length };
}

/**
 * Ticket médio: quanto vale a conta média.
 *
 * Divide pelas contas QUE TÊM ITEM, não por todas. Conta aberta sem
 * nenhum item lançado ainda não é uma conta barata — é uma conta que
 * ninguém começou, e enfiá-la no denominador puxaria a média para baixo
 * fingindo queda de faturamento.
 */
export function ticketMedio(faturado) {
  if (!faturado || faturado.comItens === 0) {
    return indicador(null, MOTIVOS.SEM_BASE);
  }
  return indicador(faturado.centavos / faturado.comItens);
}

/**
 * Índice de glosa: quanto do faturado a operadora recusou.
 *
 * 🔴 O INDICADOR MAIS PERIGOSO DO MÓDULO. Zero por cento é a melhor
 * notícia possível, e três coisas MUITO diferentes produzem zero:
 *   • não houve glosa            (bom)
 *   • a leitura das glosas falhou (não sabemos de nada)
 *   • não há faturado no mês     (não há o que glosar)
 * Só a primeira é notícia boa, e ela é a única que devolve 0.
 */
export function indiceDeGlosa(faturado, glosas) {
  if (naoDeuParaLer(glosas)) return indicador(null, MOTIVOS.SEM_LEITURA);
  if (!faturado || faturado.centavos <= 0) return indicador(null, MOTIVOS.SEM_BASE);

  const r = resumoGlosas(glosas);
  // `resumoGlosas` soma em reais; o faturado vem em centavos.
  const glosadoCent = Math.round(r.valorGlosado * 100);
  return indicador((glosadoCent / faturado.centavos) * 100);
}

/**
 * Taxa de rejeição: contas que voltaram glosadas, entre as que foram
 * enviadas. Diferente do índice de glosa — aquele é sobre DINHEIRO, este
 * é sobre QUANTAS contas deram problema.
 *
 * O denominador é faturada + glosada: as que saíram daqui. Conta aberta ou
 * fechada ainda não foi para lugar nenhum e não pode ser rejeitada.
 */
export function taxaDeRejeicao(contas) {
  if (naoDeuParaLer(contas)) return indicador(null, MOTIVOS.SEM_LEITURA);
  const r = resumoDeContas(listaLida(contas));
  const enviadas = r.porSituacao.faturada + r.porSituacao.glosada;
  if (enviadas === 0) return indicador(null, MOTIVOS.SEM_BASE);
  return indicador((r.porSituacao.glosada / enviadas) * 100);
}

/**
 * O quadro de uma competência, pronto para a tela.
 *
 * Devolve TAMBÉM os avisos: o que a tela precisa dizer em voz alta antes
 * que alguém leia um número pela metade.
 */
export function analiseDaCompetencia({ contas = [], itensPorConta = {}, glosas = [] } = {}) {
  const faturado = faturadoDe(contas, itensPorConta);
  const contagem = resumoDeContas(listaLida(contas));
  const g = naoDeuParaLer(glosas) ? null : resumoGlosas(glosas);

  const avisos = [];
  if (naoDeuParaLer(contas)) avisos.push({ tipo: "leitura", texto: "Não foi possível ler as contas — nenhum número abaixo é confiável." });
  if (naoDeuParaLer(glosas)) avisos.push({ tipo: "leitura", texto: "Não foi possível ler as glosas — o índice de glosa e a recuperação estão em branco de propósito." });
  // 🔴 Glosa MAIOR que o faturado não é desempenho ruim — é dado que não
  // fecha. Em produção acontece quando a glosa aponta para conta cujos itens
  // nunca foram lançados, ou quando a competência da glosa não bate com a da
  // conta. Sem este aviso a tela imprime "índice de glosa 59155%" com cara de
  // indicador, e quem lê vai procurar culpado no lugar errado.
  const indice = indiceDeGlosa(faturado, glosas);
  if (indice.temValor && indice.valor > 100) {
    avisos.push({
      tipo: "inconsistencia",
      texto: `Há mais glosa registrada do que faturamento lançado (${(indice.valor / 100).toFixed(1)}× o faturado). Isso não é desempenho: alguma conta glosada está sem itens lançados, ou a competência da glosa não bate com a da conta.`,
    });
  }

  if (faturado.semPreco > 0) {
    avisos.push({
      tipo: "preco",
      texto: `${faturado.semPreco} item(ns) sem preço cadastrado. O faturado abaixo está MENOR do que a produção real — é catálogo incompleto, não queda de produção.`,
    });
  }

  return {
    faturado,
    contagem,
    ticketMedio: ticketMedio(faturado),
    indiceDeGlosa: indice,
    taxaDeRejeicao: taxaDeRejeicao(contas),
    // recuperação vem inteira de glosas.js — não se recalcula aqui
    recuperacao: g ? indicador(g.taxaRecuperacao, g.taxaRecuperacao == null ? MOTIVOS.SEM_BASE : null) : indicador(null, MOTIVOS.SEM_LEITURA),
    glosado: g ? g.valorGlosado : null,
    avisos,
  };
}

/**
 * A série por competência, do mês mais antigo ao mais novo.
 *
 * ⚠️ Só entra competência que EXISTE nos dados. Preencher os meses vazios
 * com zero desenharia uma queda a pique no gráfico onde na verdade o
 * hospital nem usava o sistema ainda.
 */
export function seriePorCompetencia({ contas = [], itensPorConta = {}, glosas = [] } = {}) {
  const porComp = new Map();

  for (const c of listaLida(contas)) {
    const comp = String(c?.competencia || "").trim();
    if (!comp) continue;
    if (!porComp.has(comp)) porComp.set(comp, { competencia: comp, contas: [], glosas: [] });
    porComp.get(comp).contas.push(c);
  }
  for (const g of listaLida(glosas)) {
    const comp = String(g?.competencia || "").trim();
    if (!comp || !porComp.has(comp)) continue;   // glosa de competência sem conta não inventa mês
    porComp.get(comp).glosas.push(g);
  }

  return [...porComp.values()]
    .sort((a, b) => a.competencia.localeCompare(b.competencia))
    .map(({ competencia, contas: cs, glosas: gs }) => {
      const f = faturadoDe(cs, itensPorConta);
      const rg = resumoGlosas(gs);
      return {
        competencia,
        contas: cs.length,
        faturadoCentavos: f.centavos,
        semPreco: f.semPreco,
        glosadoCentavos: Math.round(rg.valorGlosado * 100),
        indice: f.centavos > 0 ? (Math.round(rg.valorGlosado * 100) / f.centavos) * 100 : null,
      };
    });
}
