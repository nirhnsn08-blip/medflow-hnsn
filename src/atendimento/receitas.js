// ═══════════════════════════════════════════════════════════
// RECEITAS — FATURADO × GLOSADO × RECEBIDO
//
// O ciclo do dinheiro tinha três pernas e só duas existiam. Esta fecha a
// terceira, e é a subtração delas que produz o número que nenhum sistema
// mostra:
//
//     esperado  = faturado − glosado
//     diferença = esperado − recebido
//
// 🔴 A DIFERENÇA É O PRODUTO. Dinheiro cobrado, não recusado formalmente, e
// que nunca entrou. Hoje isso só aparece na conciliação bancária meses
// depois, sem ninguém saber de qual conta veio — e a essa altura o prazo de
// recurso da glosa que ninguém registrou já passou.
//
// ⚠️ TODA CONTA É EM CENTAVOS AQUI. `totalDaConta` já devolve centavos; as
// tabelas `at_glosas` e `at_repasses` guardam numeric em REAIS. A conversão
// acontece UMA vez, na entrada, e nunca no meio — misturar as duas unidades
// no meio de uma soma é o tipo de erro que fecha por acaso num caso e
// diverge em todos os outros.
//
// ⚠️ NÃO INVENTEI PRAZO DE PAGAMENTO. "Faturada há muito tempo sem repasse"
// seria um alarme baseado num número que eu não sei — o prazo do SUS muda
// por competência e por gestão. Em vez disso a tela mostra `diasDesdeFaturamento`
// e deixa quem tem o contrato julgar. Mesma decisão do prazo de recurso.
// ═══════════════════════════════════════════════════════════

import { totalDaConta } from "./faturamento.js";
import { naoDeuParaLer, listaLida } from "../util/leitura.js";

/** Reais (numeric do banco) → centavos. Lixo vira 0, nunca NaN. */
const cent = v => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

export const ESTADOS = {
  nao_faturada: { label: "Não faturada",  cor: "#8d99ab", dica: "Ainda não saiu daqui — não há o que esperar." },
  sem_repasse:  { label: "Sem repasse",   cor: "#f59e0b", dica: "Foi faturada e nada entrou ainda." },
  parcial:      { label: "Recebida a menor", cor: "#f43f5e", dica: "Entrou menos do que o esperado, sem glosa que explique." },
  quitada:      { label: "Quitada",       cor: "#22c55e", dica: "O que entrou fecha com o esperado." },
  a_maior:      { label: "Recebida a MAIOR", cor: "#a78bfa", dica: "Entrou mais do que o esperado — quase sempre crédito de outra conta." },
};

// Diferença de até 1 centavo não é divergência: é arredondamento de tabela.
const TOLERANCIA_CENT = 1;

/**
 * A conciliação de UMA conta.
 *
 * Devolve `null` em `diferenca` quando alguma das três leituras falhou —
 * não se subtrai o que não se conseguiu ler. `motivo` diz qual faltou.
 */
export function conciliarConta({ conta, itens = [], glosas = [], repasses = [], hoje = new Date() } = {}) {
  const falhouItens = naoDeuParaLer(itens);
  const falhouGlosas = naoDeuParaLer(glosas);
  const falhouRepasses = naoDeuParaLer(repasses);

  const t = totalDaConta(listaLida(itens));
  const faturado = t.totalCentavos;
  const glosado = listaLida(glosas).reduce((s, g) => s + cent(g?.valor_glosado), 0);
  // ⚠️ Estorno entra como negativo e ABATE o recebido. É o comportamento
  // certo: o dinheiro voltou para a operadora.
  const recebido = listaLida(repasses).reduce((s, r) => s + cent(r?.valor), 0);

  const esperado = faturado - glosado;
  const faturadaEm = conta?.faturada_em || null;
  const enviada = !!faturadaEm || conta?.status === "faturada" || conta?.status === "glosada";

  let estado = "nao_faturada";
  let diferenca = null;
  let motivo = null;

  if (falhouItens || falhouGlosas || falhouRepasses) {
    motivo = "nao_deu_para_ler";
  } else if (!enviada) {
    estado = "nao_faturada";
    // 🔴 "NUNCA CHEGOU NADA" ≠ "CHEGOU E VOLTOU". Os dois somam zero
    // líquido, e a primeira versão decidia pelo líquido — então uma conta
    // paga e depois estornada aparecia como se a operadora nunca tivesse
    // mexido nela. É o oposto: houve movimento, e ele foi contra o hospital.
    // A decisão é pela EXISTÊNCIA de linha, não pelo saldo.
  } else if (listaLida(repasses).length === 0) {
    estado = "sem_repasse";
    diferenca = esperado;
  } else {
    diferenca = esperado - recebido;
    if (diferenca > TOLERANCIA_CENT) estado = "parcial";
    else if (diferenca < -TOLERANCIA_CENT) estado = "a_maior";
    else estado = "quitada";
  }

  return {
    contaId: conta?.id ?? null,
    prontuario: conta?.prontuario ?? null,
    competencia: conta?.competencia ?? null,
    convenioId: conta?.convenio_id ?? null,
    via: conta?.via ?? null,
    faturado, glosado, recebido, esperado,
    diferenca, estado, motivo,
    // 🔴 Sem preço cadastrado o FATURADO está menor do que a produção, e a
    // diferença abaixo vira ficção. Quem lê precisa saber antes de agir.
    semPreco: t.semPreco,
    faturadaEm,
    diasDesdeFaturamento: diasDesde(faturadaEm, hoje),
    repasses: listaLida(repasses).length,
  };
}

function diasDesde(data, hoje) {
  if (!data) return null;
  const d = new Date(`${String(data).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((base - d) / 86400000);
}

/**
 * A conciliação de várias contas de uma vez.
 *
 * `itensPorConta`, `glosasPorConta` e `repassesPorConta` são mapas
 * { conta_id: [linhas] }.
 */
export function conciliar({ contas = [], itensPorConta = {}, glosasPorConta = {}, repassesPorConta = {}, hoje = new Date() } = {}) {
  return listaLida(contas).map(conta => conciliarConta({
    conta,
    itens: itensPorConta[conta?.id] || [],
    glosas: glosasPorConta[conta?.id] || [],
    repasses: repassesPorConta[conta?.id] || [],
    hoje,
  }));
}

const zeros = () => ({
  contas: 0, faturado: 0, glosado: 0, recebido: 0, esperado: 0,
  diferenca: 0, semPreco: 0,
  porEstado: { nao_faturada: 0, sem_repasse: 0, parcial: 0, quitada: 0, a_maior: 0 },
});

function somar(acc, c) {
  acc.contas++;
  acc.faturado += c.faturado;
  acc.glosado += c.glosado;
  acc.recebido += c.recebido;
  acc.semPreco += c.semPreco;
  // ⚠️ Conta NÃO FATURADA fica fora de `esperado` e de `diferenca`: ela
  // ainda não foi cobrada de ninguém. Somá-la faria o total "a receber"
  // incluir dinheiro que o hospital nem pediu ainda.
  if (c.estado !== "nao_faturada") {
    acc.esperado += c.esperado;
    if (c.diferenca != null) acc.diferenca += c.diferenca;
  }
  acc.porEstado[c.estado] = (acc.porEstado[c.estado] || 0) + 1;
  return acc;
}

/** O total geral. */
export function totalGeral(conciliacoes) {
  return listaLida(conciliacoes).reduce(somar, zeros());
}

/** Agrupado por competência da PRODUÇÃO, da mais antiga para a mais nova. */
export function porCompetencia(conciliacoes) {
  const mapa = new Map();
  for (const c of listaLida(conciliacoes)) {
    const k = String(c?.competencia || "").trim() || "(sem competência)";
    if (!mapa.has(k)) mapa.set(k, { competencia: k, ...zeros() });
    somar(mapa.get(k), c);
  }
  return [...mapa.values()].sort((a, b) => a.competencia.localeCompare(b.competencia));
}

/**
 * Agrupado por convênio, do maior buraco para o menor.
 *
 * `convenios` é a lista de `at_convenios`, só para dar nome ao id.
 */
export function porConvenio(conciliacoes, convenios = []) {
  const nome = Object.fromEntries(listaLida(convenios).map(c => [c.id, c.nome]));
  const mapa = new Map();
  for (const c of listaLida(conciliacoes)) {
    const k = c?.convenioId ?? "sem";
    if (!mapa.has(k)) {
      mapa.set(k, { convenioId: k, nome: nome[k] || (k === "sem" ? "(sem convênio)" : `convênio ${k}`), ...zeros() });
    }
    somar(mapa.get(k), c);
  }
  return [...mapa.values()].sort((a, b) => b.diferenca - a.diferenca);
}

/**
 * Os avisos da tela — o que precisa ser dito em voz alta antes que alguém
 * leia um número pela metade.
 */
export function avisosDaReceita(conciliacoes, { itensFalharam = false, glosasFalharam = false, repassesFalharam = false } = {}) {
  const lista = listaLida(conciliacoes);
  const avisos = [];

  if (naoDeuParaLer(conciliacoes)) {
    avisos.push({ tipo: "leitura", texto: "Não foi possível ler as contas — nenhum número abaixo é confiável." });
    return avisos;
  }
  for (const [falhou, oQue] of [[itensFalharam, "os itens das contas"], [glosasFalharam, "as glosas"], [repassesFalharam, "os repasses"]]) {
    if (falhou) {
      avisos.push({
        tipo: "leitura",
        texto: `Não foi possível ler ${oQue}. A diferença entre faturado e recebido NÃO está calculada — o que aparece como zero é falta de leitura, não acerto de contas.`,
      });
    }
  }

  const semPreco = lista.reduce((s, c) => s + c.semPreco, 0);
  if (semPreco > 0) {
    avisos.push({
      tipo: "preco",
      texto: `${semPreco} item(ns) sem preço cadastrado. O FATURADO está menor do que a produção real, então a diferença abaixo está subestimada — é catálogo incompleto, não dinheiro que apareceu.`,
    });
  }

  const aMaior = lista.filter(c => c.estado === "a_maior");
  if (aMaior.length) {
    avisos.push({
      tipo: "inconsistencia",
      texto: `${aMaior.length} conta(s) receberam MAIS do que o esperado. Isso quase nunca é lucro: costuma ser crédito de outra conta atribuído à errada, e some da conta certa.`,
    });
  }

  return avisos;
}

/** O que impede de gravar um repasse. Lista vazia = pode. */
export function recusasDoRepasse(r) {
  const fora = [];
  const v = Number(String(r?.valor ?? "").replace(",", "."));

  if (!r?.conta_id) fora.push("Sem conta: o repasse precisa apontar para a conta paga.");
  if (r?.valor === "" || r?.valor == null || !Number.isFinite(v)) fora.push("Valor do repasse inválido.");
  // Zero é o único proibido. Negativo é ESTORNO, e existe de verdade.
  else if (v === 0) fora.push("Repasse de zero não existe: ou não pagaram (e não há linha), ou a digitação está errada.");
  if (!r?.recebido_em) fora.push("Sem a data em que o crédito entrou não dá para dizer a que mês ele pertence.");

  return fora;
}
