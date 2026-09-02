// ═══════════════════════════════════════════════════════════
// ASSISTENTE DO FATURAMENTO — local, e sem inventar número
//
// Mesmo desenho dos assistentes do NSP e do Giro de Leitos: função pura,
// casamento por palavra-chave, resposta montada a partir dos MESMOS
// cálculos que as abas usam. Nada sai do navegador, nada é gerado por
// modelo de linguagem.
//
// 🔴 A REGRA QUE ESTE ASSISTENTE TEM E OS OUTROS NÃO: se a lista que
// sustenta a resposta NÃO DEU PARA LER, ele se recusa a responder com
// número.
//
// Por quê: "o índice de glosa está em 0%" dito por um assistente soa mais
// verdadeiro do que o mesmo 0% num cartão — a frase tem autoridade que o
// número sozinho não tem. E é justamente quando a leitura falha que o zero
// aparece. Um assistente que repete o zero de uma falha de rede é pior que
// assistente nenhum: ele dá confiança a uma mentira.
//
// ⚠️ ELE NÃO CALCULA NADA POR CONTA PRÓPRIA. Toda resposta vem de
// `receitas.js`, `glosas.js`, `analises.js`, `precos.js` e `previsoes.js`,
// que já estão testados por mutação. Se ele fizesse a própria conta,
// haveria duas versões da mesma regra — e elas divergiriam na primeira
// mudança.
// ═══════════════════════════════════════════════════════════

import { naoDeuParaLer, listaLida } from "../util/leitura.js";
import { reais } from "./faturamento.js";
import { resumoGlosas, filaDeTrabalho, porMotivo } from "./glosas.js";
import { totalGeral, porConvenio } from "./receitas.js";
import { lacunasDePreco, SITUACAO } from "./precos.js";
import { aging, estatisticaDePrazo, prazosObservados, MIN_OBSERVACOES } from "./previsoes.js";

export const AJUDA =
  "Posso responder sobre: panorama do faturamento (faturado × glosado × recebido), " +
  "a fila de glosas e os prazos de recurso, a taxa de recuperação, os motivos de glosa, " +
  "o que está a receber e há quanto tempo, o prazo médio dos repasses, e os procedimentos " +
  "faturados sem preço cadastrado. Pergunte à vontade.";

const norm = s => String(s ?? "")
  .toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/\s+/g, " ").trim();

// A frase da recusa. Ela diz O QUE faltou e o que NÃO vai ser dito — sem
// isso, "não sei" soa como "não há".
const semLeitura = oQue =>
  `Não consigo responder: não foi possível ler ${oQue}. ` +
  `Prefiro não dar número a dar um número errado — quando a leitura falha, os totais aparecem como ZERO, ` +
  `e zero aqui parece boa notícia. Recarregue a aba e pergunte de novo.`;

const pct = v => (v == null ? null : `${v.toFixed(1)}%`);

/**
 * Responde uma pergunta sobre o faturamento.
 *
 * `dados` é o mesmo que as abas já carregaram — nada é buscado aqui.
 */
export function responderAssistente(pergunta, dados = {}) {
  const {
    conciliacoes = [], glosas = [], contas = [], precos = [],
    itensComConvenio = [], repassesPorConta = {}, convenios = [],
    hoje = new Date(),
  } = dados;

  const s = norm(pergunta);
  const has = (...ks) => ks.some(k => s.includes(k));

  if (!s || s === "?" || has("ajuda", "o que voce", "o que posso", "pode responder", "comando")) return AJUDA;
  if (s === "oi" || s === "ola" || has("bom dia", "boa tarde", "boa noite", "obrigad", "valeu")) return "Olá! " + AJUDA;

  const contasIlegiveis = naoDeuParaLer(contas) || naoDeuParaLer(conciliacoes);
  const glosasIlegiveis = naoDeuParaLer(glosas);
  const precosIlegiveis = naoDeuParaLer(precos);

  // ── GLOSA: fila, prazo, recurso ──────────────────────────
  if (has("glosa", "recurso", "prazo de recurso", "recuper")) {
    if (glosasIlegiveis) return semLeitura("as glosas");
    const r = resumoGlosas(glosas, hoje);

    if (has("recuper", "taxa")) {
      if (r.taxaRecuperacao == null) {
        return "Nenhum recurso foi ENCERRADO ainda, então não há taxa de recuperação para dar. " +
          "Ela é calculada sobre o que já terminou, não sobre o que foi glosado — senão o número cairia toda vez que chegasse glosa nova.";
      }
      return `Taxa de recuperação: ${pct(r.taxaRecuperacao)} — ${reais(Math.round(r.valorRecuperado * 100))} ` +
        `de ${reais(Math.round(r.glosadoEncerrado * 100))} em glosas já encerradas.`;
    }

    if (has("prazo", "vence", "vencid", "urgent")) {
      const fila = filaDeTrabalho(glosas, hoje);
      if (!fila.length) return "Nenhuma glosa em aberto. 👍";
      const p = fila[0];
      const partes = [];
      if (r.vencidas) partes.push(`${r.vencidas} com prazo VENCIDO`);
      if (r.criticas) partes.push(`${r.criticas} vencendo em 7 dias ou menos`);
      if (r.semPrazo) partes.push(`${r.semPrazo} SEM PRAZO informado`);
      return `${fila.length} glosa(s) em aberto${partes.length ? ": " + partes.join(", ") : ""}. ` +
        `A mais urgente é a da conta #${p.conta_id} (${reais(Math.round(Number(p.valor_glosado) * 100))}` +
        `${p.diasRestantes == null ? ", sem prazo informado" : p.diasRestantes < 0 ? `, vencida há ${-p.diasRestantes} dia(s)` : `, ${p.diasRestantes} dia(s)`}).` +
        (r.semPrazo ? " ⚠️ Glosa sem prazo informado pode estar vencendo hoje — o sistema não inventa essa data." : "");
    }

    if (has("motivo", "por que", "porque", "causa")) {
      const m = porMotivo(glosas);
      if (!m.length) return "Nenhuma glosa registrada, então não há motivo a listar.";
      const top = m.slice(0, 3).map(x =>
        `${x.motivo} (${x.quantidade}×, ${reais(Math.round(x.valor * 100))})`).join(" · ");
      return `Motivos que mais custam: ${top}. Motivo repetido é processo quebrado, não azar.`;
    }

    return `Glosas: ${r.abertas} em aberto (${reais(Math.round(r.valorEmAberto * 100))}), ` +
      `${r.vencidas} com prazo vencido, ${r.criticas} vencendo em 7 dias, ${r.semPrazo} sem prazo informado. ` +
      `Total glosado: ${reais(Math.round(r.valorGlosado * 100))}.`;
  }

  // ── PREÇO / CONVÊNIO ─────────────────────────────────────
  if (has("preco", "preço", "tabela", "convenio", "operadora", "contrato", "aditivo")) {
    if (precosIlegiveis || naoDeuParaLer(itensComConvenio)) return semLeitura("a tabela de preços ou os itens faturados");
    const l = lacunasDePreco(itensComConvenio, precos, { hoje });
    if (!l.length) return "Todo item faturado tem preço vigente para o convênio que paga. 👍";
    const vencidos = l.filter(x => x.situacao === SITUACAO.VENCIDO);
    const nome = id => listaLida(convenios).find(c => c.id === id)?.nome || `convênio ${id}`;
    const primeiro = l[0];
    return `${l.length} par(es) convênio × procedimento sem preço vigente` +
      `${vencidos.length ? `, sendo ${vencidos.length} com VIGÊNCIA VENCIDA (esses só precisam de aditivo — é o conserto mais barato)` : ""}. ` +
      `O maior é ${nome(primeiro.convenioId)} × ${primeiro.codigo}: ${primeiro.vezes} lançamento(s), ` +
      `${reais(Math.round(primeiro.valorLancado * 100))} cobrados sem tabela.`;
  }

  // ── A RECEBER / PREVISÃO / PRAZO DE PAGAMENTO ────────────
  //
  // 🔴 `previs` e `quando` SOZINHOS pegavam pergunta de fora do domínio.
  // "Qual a previsão do tempo amanhã?" era respondida com o valor a
  // receber — o assistente improvisando, que é exatamente o que ele existe
  // para não fazer. Pego por teste.
  //
  // O conserto é o mesmo do gerador de reconstrução: **nomear o que ENTRA**.
  // As palavras ambíguas só valem acompanhadas de um termo de dinheiro;
  // as inequívocas (`receb`, `repasse`) valem sozinhas. Uma lista de
  // palavras a IGNORAR teria o buraco de sempre: a próxima pergunta de
  // fora do domínio que ninguém previu.
  const dinheiro = has("receita", "caixa", "dinheiro", "valor", "faturament", "conta", "r$", "reais");
  if (has("receb", "repasse", "atras", "aging", "a receber",
           // "prazo" sozinho e ambiguo (recurso x pagamento) e fica com a
           // glosa, que vem antes. Estas formas so existem aqui.
           "prazo medio", "prazo de pagamento", "prazo tipico", "demora")
      || ((has("previs", "proje", "quando", "entra", "idade")) && dinheiro)) {
    if (contasIlegiveis) return semLeitura("as contas");
    const ag = aging(conciliacoes);

    if (has("prazo", "quando", "demora", "medio", "mediana")) {
      const est = estatisticaDePrazo(prazosObservados(contas, repassesPorConta));
      if (!est.confiavel) {
        return `Só ${est.n} repasse(s) observado(s) — são precisos ${MIN_OBSERVACOES} para falar em prazo típico. ` +
          `Prefiro não dar um prazo que mudaria a cada pagamento novo. O valor a receber (${reais(ag.total)}) está certo.`;
      }
      return `Prazo típico de recebimento: ${est.mediana} dias (mediana de ${est.n} repasses, de ${est.min} a ${est.max}). ` +
        `Uso a mediana e não a média (${est.media} dias) porque um pagamento muito demorado puxaria a média para um prazo em que nada acontece.`;
    }

    const velho = ag.faixas.find(f => f.chave === "mais90");
    return `A receber: ${reais(ag.total)} em ${ag.contas} conta(s). ` +
      ag.faixas.map(f => `${f.label} ${reais(f.valor)}`).join(" · ") + "." +
      (velho && velho.valor > 0
        ? ` ⚠️ ${velho.contas} conta(s) esperando há mais de 90 dias — nessa idade o mais comum não é demora, é glosa que chegou e ninguém registrou.`
        : "");
  }

  // ── PANORAMA / PRODUÇÃO ──────────────────────────────────
  if (has("panorama", "resumo", "geral", "faturado", "recebido", "producao", "quanto", "diferenc", "situacao")) {
    if (contasIlegiveis) return semLeitura("as contas");
    const t = totalGeral(conciliacoes);
    const alerta = t.diferenca > 0
      ? ` A diferença sem explicação é ${reais(t.diferenca)}: cobrado, não recusado formalmente, e nunca entrou.`
      : "";
    return `Faturado ${reais(t.faturado)} · glosado ${reais(t.glosado)} · recebido ${reais(t.recebido)}.` + alerta +
      (t.semPreco > 0 ? ` ⚠️ ${t.semPreco} item(ns) sem preço: o faturado está MENOR que a produção real.` : "");
  }

  // ── POR CONVÊNIO (onde cobrar primeiro) ──────────────────
  if (has("quem deve", "onde cobrar", "pior", "maior buraco")) {
    if (contasIlegiveis) return semLeitura("as contas");
    const pc = porConvenio(conciliacoes, convenios);
    if (!pc.length) return "Nenhuma conta para comparar por convênio.";
    const p = pc[0];
    return `Onde vale cobrar primeiro: ${p.nome}, com ${reais(p.diferenca)} de diferença em ${p.contas} conta(s).`;
  }

  // ── NÃO ENTENDI ──────────────────────────────────────────
  // ⚠️ Nunca "não entendi" seco: sem dizer o que ELE sabe, a pessoa tenta
  // reformular a mesma pergunta impossível várias vezes e desiste da tela.
  return `Não tenho resposta para isso — e prefiro dizer isso a improvisar um número. ${AJUDA}`;
}
