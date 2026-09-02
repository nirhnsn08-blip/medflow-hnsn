// ═══════════════════════════════════════════════════════════
// PREVISÕES — quanto ainda entra, e quando
//
// 🔴 A TELA MAIS FÁCIL DE FALSIFICAR DO MÓDULO. Previsão produz um número
// com cara de autoridade a partir de suposição — e ninguém confere
// suposição, confere-se resultado. Um "R$ 180.000 em outubro" errado não dá
// erro: vira orçamento, vira compra, vira folha.
//
// Por isso esta tela RECUSA extrapolar produção. Ela não adivinha quanto o
// hospital vai faturar mês que vem. Ela projeta APENAS o que JÁ FOI
// FATURADO e ainda não entrou — que é fato, não palpite — usando o prazo
// que os repasses REAIS demoraram.
//
//   a receber   = (faturado − glosado − recebido) das contas já enviadas
//   quando      = data do faturamento + prazo observado nos repasses
//
// ⚠️ MEDIANA, NÃO MÉDIA. Prazo de pagamento é assimétrico: a maioria entra
// em torno de um valor e um punhado demora meses. Um único repasse de 300
// dias puxa a média para um número que não descreve nenhum pagamento real.
// A mediana descreve o caso típico, que é o que a pergunta pede.
//
// ⚠️ TODA ESTATÍSTICA CARREGA O `n`. Prazo médio de três repasses não é
// prazo médio — é coincidência com casas decimais. Abaixo de
// MIN_OBSERVACOES a tela mostra "—" e diz que o histórico é curto, em vez
// de imprimir um número que ninguém deveria usar.
// ═══════════════════════════════════════════════════════════

import { listaLida, naoDeuParaLer } from "../util/leitura.js";

/**
 * Quantos repasses já observados são suficientes para falar em prazo.
 *
 * Cinco não é um número mágico com base estatística: é o mínimo abaixo do
 * qual a mediana muda de lugar a cada dado novo. O ponto não é acertar o
 * limiar — é que exista um, e que a tela diga quando está abaixo dele.
 */
export const MIN_OBSERVACOES = 5;

const dia = d => {
  if (!d) return null;
  const s = String(d).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

const diasEntre = (a, b) => {
  const x = dia(a), y = dia(b);
  if (!x || !y) return null;
  return Math.round((new Date(`${y}T00:00:00`) - new Date(`${x}T00:00:00`)) / 86400000);
};

/**
 * Quanto tempo cada conta demorou para receber o PRIMEIRO repasse.
 *
 * O primeiro, e não o último: a pergunta é "quando o dinheiro começa a
 * entrar". Usar o último confundiria demora com parcelamento.
 *
 * ⚠️ Estorno (valor negativo) não conta como recebimento — ele é o
 * contrário disso.
 */
export function prazosObservados(contas, repassesPorConta = {}) {
  const out = [];
  for (const c of listaLida(contas)) {
    const fat = dia(c?.faturada_em);
    if (!fat) continue;
    const reps = listaLida(repassesPorConta[c?.id])
      .filter(r => Number(r?.valor) > 0 && dia(r?.recebido_em))
      .sort((a, b) => dia(a.recebido_em).localeCompare(dia(b.recebido_em)));
    if (!reps.length) continue;
    const d = diasEntre(fat, reps[0].recebido_em);
    // Negativo = repasse anterior ao faturamento, que é data trocada. Fora.
    if (d != null && d >= 0) out.push(d);
  }
  return out.sort((a, b) => a - b);
}

/** A mediana de uma lista JÁ ORDENADA. */
function mediana(ordenada) {
  const n = ordenada.length;
  if (!n) return null;
  const m = Math.floor(n / 2);
  return n % 2 ? ordenada[m] : Math.round((ordenada[m - 1] + ordenada[m]) / 2);
}

/**
 * O prazo típico, com o tamanho da amostra e se dá para confiar nele.
 *
 * `confiavel: false` NÃO significa "sem valor" — significa "não use este
 * número para decidir". A tela mostra a diferença.
 */
export function estatisticaDePrazo(prazos) {
  const p = listaLida(prazos).filter(x => Number.isFinite(x)).sort((a, b) => a - b);
  const n = p.length;
  return {
    n,
    confiavel: n >= MIN_OBSERVACOES,
    mediana: mediana(p),
    // média fica disponível para comparar com a mediana: quando as duas
    // divergem muito, há cauda longa e alguém precisa olhar os extremos.
    media: n ? Math.round(p.reduce((s, x) => s + x, 0) / n) : null,
    min: n ? p[0] : null,
    max: n ? p[n - 1] : null,
  };
}

/** As faixas de idade do "a receber". Padrão de contas a receber. */
export const FAIXAS = [
  { chave: "ate30",  label: "até 30 dias",  min: 0,   max: 30,  cor: "#22c55e" },
  { chave: "d31a60", label: "31 a 60",      min: 31,  max: 60,  cor: "#facc15" },
  { chave: "d61a90", label: "61 a 90",      min: 61,  max: 90,  cor: "#fb923c" },
  { chave: "mais90", label: "mais de 90",   min: 91,  max: Infinity, cor: "#f43f5e" },
];

/**
 * O "a receber" repartido por quanto tempo já está esperando.
 *
 * 🔴 É o número mais acionável da tela, e o único que não depende de
 * modelo nenhum: são fatos com data. Quanto mais velha a faixa, menor a
 * chance de o dinheiro entrar — e maior a chance de haver uma glosa que
 * ninguém registrou.
 */
export function aging(conciliacoes, hoje = new Date()) {
  const base = { total: 0, contas: 0 };
  const faixas = Object.fromEntries(FAIXAS.map(f => [f.chave, { ...f, valor: 0, contas: 0 }]));
  const semData = { valor: 0, contas: 0 };

  for (const c of listaLida(conciliacoes)) {
    // Só o que foi enviado e ainda falta. Conta quitada e não faturada ficam fora.
    if (c?.estado === "nao_faturada" || c?.estado === "quitada" || c?.diferenca == null) continue;
    if (c.diferenca <= 0) continue;    // recebida a maior não é "a receber"

    base.total += c.diferenca;
    base.contas++;

    const d = c.diasDesdeFaturamento;
    if (d == null) { semData.valor += c.diferenca; semData.contas++; continue; }
    const f = FAIXAS.find(x => d >= x.min && d <= x.max) || FAIXAS[FAIXAS.length - 1];
    faixas[f.chave].valor += c.diferenca;
    faixas[f.chave].contas++;
  }

  return {
    ...base,
    faixas: FAIXAS.map(f => faixas[f.chave]),
    // ⚠️ Conta faturada sem `faturada_em` não some: ela não tem idade, e
    // some-la em qualquer faixa inventaria uma data.
    semData,
  };
}

const compDe = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/**
 * Quando o que já foi faturado deve entrar, mês a mês.
 *
 * 🔴 NÃO PROJETA PRODUÇÃO FUTURA. Só distribui no calendário o que já saiu
 * daqui cobrado. Adivinhar quanto o hospital vai faturar em novembro exige
 * um modelo de demanda que este sistema não tem — e um número inventado
 * aqui viraria orçamento.
 *
 * Devolve `{ meses, atrasado, prazo, confiavel }`. Quando o prazo não é
 * confiável, `meses` vem VAZIO e `atrasado` continua valendo: o atraso é
 * fato, a distribuição é que depende do histórico.
 */
export function projecao({ conciliacoes = [], prazos = [], hoje = new Date(), meses = 6 } = {}) {
  const est = estatisticaDePrazo(prazos);
  const hojeDia = dia(hoje.toISOString());
  const out = { prazo: est, confiavel: est.confiavel, atrasado: 0, meses: [], semData: 0 };

  const pendentes = listaLida(conciliacoes).filter(c =>
    c?.estado !== "nao_faturada" && c?.estado !== "quitada" &&
    c?.diferenca != null && c.diferenca > 0);

  if (!est.confiavel) {
    // Sem histórico não se distribui — mas o atraso continua sendo fato.
    for (const c of pendentes) {
      if (c.diasDesdeFaturamento == null) out.semData += c.diferenca;
      else out.atrasado += c.diferenca;
    }
    return out;
  }

  const buckets = new Map();
  for (const c of pendentes) {
    if (!c.faturadaEm) { out.semData += c.diferenca; continue; }
    const alvo = new Date(`${dia(c.faturadaEm)}T00:00:00`);
    alvo.setDate(alvo.getDate() + est.mediana);
    const alvoDia = dia(alvo.toISOString());

    // Já passou do prazo típico: é atraso, não previsão.
    if (alvoDia < hojeDia) { out.atrasado += c.diferenca; continue; }
    const k = compDe(alvo);
    buckets.set(k, (buckets.get(k) || 0) + c.diferenca);
  }

  // Só os próximos `meses`, em ordem, e sem inventar mês vazio no meio:
  // mês sem previsão aparece com zero porque AQUI o zero é informação
  // ("nada previsto para novembro"), diferente do gráfico de produção.
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  for (let i = 0; i < meses; i++) {
    const d = new Date(inicio.getFullYear(), inicio.getMonth() + i, 1);
    const k = compDe(d);
    out.meses.push({ competencia: k, valor: buckets.get(k) || 0 });
  }
  return out;
}

/** Os avisos — o que precisa ser dito antes que alguém use um número. */
export function avisosDaPrevisao({ projecao: pr, aging: ag, contasFalharam = false, repassesFalharam = false } = {}) {
  const avisos = [];

  if (contasFalharam || repassesFalharam) {
    avisos.push({
      tipo: "leitura",
      texto: "Não foi possível ler as contas ou os repasses. A previsão abaixo NÃO está calculada — o que aparece como zero é falta de leitura.",
    });
    return avisos;
  }

  if (pr && !pr.confiavel) {
    avisos.push({
      tipo: "amostra",
      texto: `Histórico curto: ${pr.prazo.n} repasse(s) observado(s), e são precisos ${MIN_OBSERVACOES} para falar em prazo típico. O valor a receber está certo; o CALENDÁRIO abaixo não foi distribuído de propósito, em vez de sair de um prazo inventado.`,
    });
  } else if (pr && pr.prazo.media != null && pr.prazo.mediana != null
             && Math.abs(pr.prazo.media - pr.prazo.mediana) > pr.prazo.mediana * 0.5) {
    // ⚠️ Média muito longe da mediana = cauda longa. A projeção usa a
    // mediana (o caso típico), mas alguém precisa olhar os extremos.
    avisos.push({
      tipo: "dispersao",
      texto: `Os prazos variam muito (mediana ${pr.prazo.mediana} dias, média ${pr.prazo.media}, de ${pr.prazo.min} a ${pr.prazo.max}). A projeção usa a mediana — o caso típico —, mas há contas que fogem muito disso.`,
    });
  }

  if (pr && pr.semData > 0) {
    avisos.push({
      tipo: "sem_data",
      texto: "Há conta faturada sem data de faturamento. Ela entra no total a receber e fica FORA do calendário — sem a data não há de quando contar.",
    });
  }

  const velho = ag?.faixas?.find(f => f.chave === "mais90");
  if (velho && velho.valor > 0) {
    avisos.push({
      tipo: "atraso",
      texto: `${velho.contas} conta(s) esperando há mais de 90 dias. Nessa idade, o mais comum não é demora: é glosa que chegou e ninguém registrou.`,
    });
  }

  return avisos;
}

/** Atalho para a tela: tudo de uma vez. */
export function panorama({ conciliacoes = [], contas = [], repassesPorConta = {}, hoje = new Date() } = {}) {
  const prazos = prazosObservados(contas, repassesPorConta);
  const ag = aging(conciliacoes, hoje);
  const pr = projecao({ conciliacoes, prazos, hoje });
  return {
    aging: ag,
    projecao: pr,
    avisos: avisosDaPrevisao({
      projecao: pr, aging: ag,
      contasFalharam: naoDeuParaLer(contas) || naoDeuParaLer(conciliacoes),
    }),
  };
}
