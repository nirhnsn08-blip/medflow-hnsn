// ═══════════════════════════════════════════════════════════
// EXAMES (SADT) — AS REGRAS
//
// 🔴 A PERGUNTA QUE O SISTEMA NÃO SABIA RESPONDER: "este valor está
// alterado?" Ele não sabia porque não tinha a faixa — o exame era uma linha
// de texto (`ps_registros.resultado`), e texto não se compara com nada.
//
// Agora o resultado vem do banco já com `anormal` e `critico` CALCULADOS lá
// (gatilho de `migracao-sadt-exames.sql`), a partir da faixa do analito.
//
// ⚠️⚠️ ESTE ARQUIVO NÃO RECALCULA NADA DISSO, e é deliberado. Se ele
// recalculasse, haveria duas opiniões sobre a mesma linha — e a faixa que o
// laudo usou pode já ter mudado no catálogo. O que o banco gravou é o que o
// laudo diz. Aqui só se LÊ.
//
// O que é daqui: o vocabulário aplicado (que vem de `../ps/exames.js`, fonte
// única), as conferências de formulário, o atraso contra o prazo pactuado, a
// série de um analito ao longo do tempo e a lista de críticos.
//
// Funções PURAS: recebem linhas, devolvem leitura. Sem React, sem rede.
// ═══════════════════════════════════════════════════════════

import { diffMin, todayStr, diaLocal } from "../util/datas.js";
import { naoDeuParaLer } from "../util/leitura.js";
import { lerNumero, ESTILO } from "../util/numero-brasileiro.js";
import {
  EXAME_SOLICITADO, EXAME_COLETADO, EXAME_RESULTADO, EXAME_VISTO,
  EXAME_CANCELADO, EXAME_PENDENTES, EXAME_ESTADOS, estadoDoExame,
} from "../ps/exames.js";

export {
  EXAME_SOLICITADO, EXAME_COLETADO, EXAME_RESULTADO, EXAME_VISTO,
  EXAME_CANCELADO, EXAME_PENDENTES, EXAME_ESTADOS, estadoDoExame,
};

/** As duas pressas. `urgente` é o que muda o prazo contra o qual se mede. */
export const PRIORIDADES = [
  { chave: "rotina",  label: "Rotina",  cor: "#8d99ab" },
  { chave: "urgente", label: "Urgente", cor: "#f43f5e" },
];

/** Quantos caracteres de indicação clínica valem como indicação. */
export const MIN_INDICACAO = 10;

/** Quantos caracteres de motivo valem para cancelar (o banco exige 5). */
export const MIN_MOTIVO_CANCELAMENTO = 5;

/** Quantos caracteres de motivo valem para corrigir um laudo (o banco exige 15). */
export const MIN_MOTIVO_CORRECAO = 15;

/**
 * 🔴 O VALOR DIGITADO PASSA PELO LEITOR ÚNICO DO PROJETO, não por `Number()`.
 *
 * `Number("7,2")` é NaN — e `7,2` é como se escreve sete e dois décimos em
 * português. Com `Number()`, quem digitasse a vírgula receberia "informe o
 * valor" com o valor na própria tela. Pior: `150.000` plaquetas viraria 150.
 *
 * `ESTILO.VIRGULA` é a convenção brasileira e resolve os dois: `150.000` é
 * cento e cinquenta mil, `7,2` é sete e dois décimos, e `1234.56` continua
 * mil duzentos e trinta e quatro e cinquenta e seis — que é o que sai de
 * qualquer exportação de analisador.
 *
 * Devolve `{ vazio, valor, erro }`. `vazio` é diferente de erro: campo em
 * branco é um resultado só de texto ou de laudo, que é legítimo.
 */
export function valorDigitado(bruto) {
  if (bruto === "" || bruto == null) return { vazio: true, valor: null, erro: null };
  const r = lerNumero(bruto, ESTILO.VIRGULA);
  if (r.valor == null || !Number.isFinite(r.valor))
    return { vazio: false, valor: null, erro: r.motivo || `"${bruto}" não é um número.` };
  return { vazio: false, valor: r.valor, erro: null };
}

// ── A LEITURA DE UM VALOR ───────────────────────────────────

/**
 * Como este resultado deve aparecer: crítico, alterado ou normal.
 *
 * 🔴 `critico` GANHA DE `anormal`, sempre. O banco já garante que crítico
 * implica anormal, mas a ordem aqui é o que decide a COR na tela — e um
 * potássio 7,2 pintado de "alterado" ao lado de dez outros "alterado" é um
 * crítico que ninguém vê.
 *
 * ⚠️ RESULTADO SEM VALOR NUMÉRICO NÃO É "NORMAL". Laudo de imagem, cultura
 * ("flora normal"), texto livre do backfill — nenhum deles foi comparado com
 * faixa nenhuma. Devolver `normal` ali seria o sistema afirmando algo que
 * não apurou, que é a mentira preferida deste projeto. Devolve `sem_faixa`.
 */
export function leituraDoResultado(res) {
  if (!res) return null;
  if (res.critico) return { nivel: "critico", label: "CRÍTICO", cor: "#f43f5e", peso: 3 };
  if (res.anormal) return { nivel: "anormal", label: "Alterado", cor: "#d97706", peso: 2 };
  if (res.valor_num == null) return { nivel: "sem_faixa", label: "", cor: "var(--text-muted)", peso: 0 };
  return { nivel: "normal", label: "Normal", cor: "#34d399", peso: 1 };
}

/**
 * O valor como se escreve no laudo.
 *
 * ⚠️ `0` É VALOR. `res.valor_num || res.valor_texto` daria o texto (ou nada)
 * para uma contagem zerada — e zero é justamente o resultado que importa em
 * plaqueta, em bastonete, em bacilo.
 */
export function valorDoResultado(res) {
  if (!res) return "";
  if (res.valor_num != null) {
    const n = Number(res.valor_num);
    const num = Number.isFinite(n) ? String(n) : String(res.valor_num);
    return res.unidade ? `${num} ${res.unidade}` : num;
  }
  const t = String(res.valor_texto ?? "").trim();
  return t;
}

/**
 * A faixa de referência de um analito, em texto.
 *
 * ⚠️ O mesmo formato que o gatilho do banco monta, de propósito: é o que
 * aparece no laudo guardado, e divergir faria a tela de cadastro mostrar uma
 * faixa e o laudo impresso outra.
 */
export function faixaTexto(ana) {
  if (!ana) return "";
  if (ana.ref_texto) return String(ana.ref_texto);
  const temMin = ana.ref_min != null, temMax = ana.ref_max != null;
  if (temMin && temMax) return `${ana.ref_min} a ${ana.ref_max}`;
  if (temMin) return `≥ ${ana.ref_min}`;
  if (temMax) return `≤ ${ana.ref_max}`;
  return "";
}

/** A faixa de pânico, em texto. Vazio quando o analito não tem uma. */
export function faixaCriticaTexto(ana) {
  if (!ana) return "";
  const temMin = ana.critico_min != null, temMax = ana.critico_max != null;
  if (temMin && temMax) return `≤ ${ana.critico_min} ou ≥ ${ana.critico_max}`;
  if (temMin) return `≤ ${ana.critico_min}`;
  if (temMax) return `≥ ${ana.critico_max}`;
  return "";
}

// ── A CADEIA DE CORREÇÃO ────────────────────────────────────

/**
 * Os resultados VIGENTES de um item: a última versão de cada analito.
 *
 * 🔴 UM LAUDO CORRIGIDO NÃO APAGA O ANTERIOR (a tabela é append-only), e as
 * duas versões voltam do banco. Mostrar as duas lado a lado deixaria duas
 * hemoglobinas diferentes na mesma tela, e ninguém saberia qual vale.
 *
 * ⚠️ `FALHA` ATRAVESSA. Se a leitura não deu, a resposta é `null` e não uma
 * lista vazia: lista vazia na tela lê-se "este exame não tem resultado", que
 * é notícia boa inventada em cima de uma falha de rede.
 */
export function resultadosVigentes(resultados) {
  if (naoDeuParaLer(resultados)) return null;
  const lista = (Array.isArray(resultados) ? resultados : []).filter(Boolean);
  // Quem foi corrigido por alguém sai; o resto é o que vale.
  const corrigidos = new Set(lista.map(r => r.corrige_id).filter(v => v != null).map(String));
  return lista
    .filter(r => !corrigidos.has(String(r.id)))
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || String(a.nome ?? "").localeCompare(String(b.nome ?? "")));
}

/** A versão anterior que este resultado corrigiu, se houver. */
export function versaoCorrigida(res, resultados) {
  if (!res?.corrige_id) return null;
  const lista = Array.isArray(resultados) ? resultados : [];
  return lista.find(r => String(r.id) === String(res.corrige_id)) || null;
}

// ── O ATRASO ────────────────────────────────────────────────

/**
 * Minutos desde o pedido. `null` quando não há data (nunca 0).
 *
 * ⚠️ Zero significaria "pediram agora", e é uma afirmação. Exame sem data de
 * pedido não tem idade conhecida.
 */
export function minutosEsperando(item, pedido, agora = new Date()) {
  const desde = item?.coletado_em || pedido?.criado_em;
  if (!desde) return null;
  const m = diffMin(desde, agora.toISOString());
  return Number.isFinite(m) && m >= 0 ? m : null;
}

/**
 * Este exame passou do prazo PACTUADO?
 *
 * 🔴 O PRAZO VEM DO CATÁLOGO, não de um número fixo na tela. Sem ele, "exame
 * demorado" é opinião — e cada exame tem o seu: hemograma de urgência em
 * 60 minutos, cultura em 72 horas. Comparar os dois com a mesma régua faria
 * a cultura viver atrasada e o hemograma urgente nunca aparecer.
 *
 * ⚠️ SEM PRAZO CADASTRADO, DEVOLVE `null` — não `false`. "Não sei se está
 * atrasado" e "está no prazo" são coisas diferentes, e a segunda tranquiliza.
 */
export function atrasoDoExame(item, pedido, catalogo, agora = new Date()) {
  const esperando = minutosEsperando(item, pedido, agora);
  if (esperando == null) return null;
  const urgente = pedido?.prioridade === "urgente";
  const prazo = urgente ? catalogo?.prazo_urgente_min : catalogo?.prazo_rotina_min;
  if (prazo == null || !Number.isFinite(Number(prazo))) {
    return { esperando, prazo: null, atrasado: null, excesso: null, urgente };
  }
  const p = Number(prazo);
  return {
    esperando, prazo: p, urgente,
    atrasado: esperando > p,
    excesso: esperando > p ? esperando - p : 0,
  };
}

// ── O QUE PRECISA DE ALGUÉM ─────────────────────────────────

/**
 * 🔴 OS CRÍTICOS QUE NINGUÉM OLHOU.
 *
 * Irmã de `resultadosNaoVistos`: uma lista que existe para acusar silêncio.
 * O laboratório liberou um potássio 7,2, está no sistema, e não há registro
 * de que alguém tenha lido. É a razão de a coluna `critico` existir.
 *
 * ⚠️ `FALHA` atravessa como `null`: "nenhum crítico pendente" é a frase mais
 * tranquilizadora desta tela, e não pode sair de uma leitura que falhou.
 */
export function criticosPendentes(resultados, itens) {
  if (naoDeuParaLer(resultados) || naoDeuParaLer(itens)) return null;
  const porItem = new Map((Array.isArray(itens) ? itens : [])
    .filter(Boolean).map(i => [String(i.id), i]));
  const vig = resultadosVigentes(resultados) || [];
  return vig.filter(r => {
    if (!r.critico) return false;
    const item = porItem.get(String(r.item_id));
    // ⚠️ Item que a tela não conseguiu casar CONTINUA na lista. Sumir com um
    // crítico porque o `join` falhou é o pior silêncio possível desta tela —
    // e é o caminho que uma leitura incompleta tomaria sozinha.
    if (!item) return true;
    return item.status !== EXAME_VISTO;
  });
}

/** Os itens ainda pendentes com o laboratório (solicitado ou coletado). */
export function pendentes(itens) {
  if (naoDeuParaLer(itens)) return null;
  return (Array.isArray(itens) ? itens : [])
    .filter(i => i && EXAME_PENDENTES.includes(i.status));
}

/**
 * A série de um analito ao longo do tempo — a curva.
 *
 * 🔴 É PARA ISTO QUE O NÚMERO SERVE. Creatinina 1,8 não diz nada; creatinina
 * 0,9 ontem e 1,8 hoje é lesão renal aguda. Com o exame em texto livre, essa
 * comparação não existia de forma nenhuma.
 *
 * Ordem CRESCENTE no tempo, porque é a ordem em que a curva se lê.
 */
export function serieDoAnalito(resultados, analitoId) {
  if (naoDeuParaLer(resultados)) return null;
  const vig = resultadosVigentes(resultados) || [];
  return vig
    .filter(r => String(r.analito_id ?? "") === String(analitoId ?? "") && r.valor_num != null)
    .map(r => ({
      em: r.criado_em,
      dia: diaLocal(r.criado_em),
      valor: Number(r.valor_num),
      critico: !!r.critico,
      anormal: !!r.anormal,
    }))
    .filter(p => Number.isFinite(p.valor))
    .sort((a, b) => new Date(a.em) - new Date(b.em));
}

/**
 * A tendência entre a primeira e a última medida.
 * `null` com menos de duas: uma medida não tem direção.
 */
export function tendencia(serie) {
  const s = (Array.isArray(serie) ? serie : []).filter(p => Number.isFinite(p?.valor));
  if (s.length < 2) return null;
  const d = s[s.length - 1].valor - s[0].valor;
  return { delta: d, direcao: d > 0 ? "subindo" : d < 0 ? "caindo" : "estavel", medidas: s.length };
}

// ── AS CONFERÊNCIAS DE FORMULÁRIO ───────────────────────────

/**
 * O pedido pode ir?
 *
 * ⚠️ A INDICAÇÃO CLÍNICA É EXIGIDA, e não é burocracia: é o que o
 * radiologista lê para saber o que procurar, e é o que o SUS pede na APAC.
 * "TC de crânio" sem indicação volta laudado para a pergunta errada.
 */
export function conferirPedido(form) {
  const itens = (form?.itens || []).filter(i => i && String(i.descricao ?? "").trim());
  if (!itens.length) return "Escolha ao menos um exame.";
  if (!PRIORIDADES.some(p => p.chave === form?.prioridade))
    return "Informe a prioridade: rotina ou urgente.";
  const ind = String(form?.indicacao_clinica ?? "").trim();
  if (ind.length < MIN_INDICACAO)
    return `Descreva a indicação clínica (ao menos ${MIN_INDICACAO} caracteres). É o que diz a quem vai laudar o que procurar — sem ela o exame volta respondendo outra pergunta.`;
  if (!String(form?.solicitante ?? "").trim())
    return "Informe quem está solicitando.";
  return null;
}

/**
 * O resultado pode ir?
 *
 * ⚠️ As mesmas recusas do gatilho, com as mesmas palavras de propósito: a
 * tela avisa antes de mandar, e o banco é quem garante.
 */
export function conferirResultado(form, item) {
  if (!item) return "Escolha o exame.";
  if (item.status === EXAME_CANCELADO)
    return "Este exame foi CANCELADO. Não se lança resultado de exame que não foi feito.";

  // 🔴 O NÚMERO ILEGÍVEL É RECUSADO ANTES DO "SEM NADA", e a ordem é o
  // conserto de um defeito desta própria função: quem digitasse `7,2` caía
  // no `NaN`, portanto em "não tem número", portanto em "informe o valor" —
  // com o valor digitado ali na tela. Dizer o que está errado com o que a
  // pessoa escreveu vem primeiro de dizer que ela não escreveu nada.
  const num = valorDigitado(form?.valor_num);
  if (num.erro) return `O valor numérico não foi entendido: ${num.erro}`;

  const temTexto = String(form?.valor_texto ?? "").trim().length > 0;
  const temLaudo = String(form?.laudo ?? "").trim().length > 0;
  if (num.vazio && !temTexto && !temLaudo)
    return "Informe o valor, o texto ou o laudo. Resultado sem nada é linha que ocupa espaço e não informa.";
  if (form?.corrige_id && String(form?.motivo_correcao ?? "").trim().length < MIN_MOTIVO_CORRECAO)
    return `Para corrigir um laudo, descreva o motivo (ao menos ${MIN_MOTIVO_CORRECAO} caracteres). O laudo anterior não é apagado — alguém pode ter tratado o paciente com base nele.`;
  return null;
}

/** O cancelamento pode ir? */
export function conferirCancelamento(motivo) {
  if (String(motivo ?? "").trim().length < MIN_MOTIVO_CANCELAMENTO)
    return `Diga por que o exame está sendo cancelado (ao menos ${MIN_MOTIVO_CANCELAMENTO} caracteres). Exame cancelado sem motivo vira dúvida na conta e na conferência do laboratório.`;
  return null;
}

// ── AS LINHAS QUE VÃO PARA O BANCO ──────────────────────────

/**
 * ⚠️ NENHUMA DESTAS MANDA `anormal`, `critico` NEM `versao`. São calculados
 * pelo gatilho. Mandá-los daqui deixaria a tela decidir o que é pânico — com
 * uma faixa que ela pode nem ter lido.
 */
export function linhaDoPedido(form, { prontuario, ps_atendimento_id, pep_episodio_id } = {}) {
  return {
    prontuario: prontuario ?? null,
    ps_atendimento_id: ps_atendimento_id ?? null,
    pep_episodio_id: pep_episodio_id ?? null,
    prioridade: form?.prioridade || "rotina",
    indicacao_clinica: String(form?.indicacao_clinica ?? "").trim() || null,
    solicitante: String(form?.solicitante ?? "").trim() || null,
    solicitante_cbo: String(form?.solicitante_cbo ?? "").trim() || null,
  };
}

export function linhasDosItens(form, pedidoId) {
  return (form?.itens || [])
    .filter(i => i && String(i.descricao ?? "").trim())
    .map(i => ({
      pedido_id: pedidoId,
      catalogo_id: i.catalogo_id ?? null,
      descricao: String(i.descricao).trim(),
      categoria: i.categoria || "outro",
      status: EXAME_SOLICITADO,
    }));
}

export function linhaDoResultado(form, item) {
  // ⚠️ O MESMO leitor da conferência. Dois leitores diferentes fariam a tela
  // aceitar `7,2` e gravar nulo — a conferência passaria e o valor sumiria.
  const num = valorDigitado(form?.valor_num);
  return {
    item_id: item?.id,
    analito_id: form?.analito_id ?? null,
    nome: String(form?.nome ?? "").trim() || null,
    valor_num: num.valor,
    valor_texto: String(form?.valor_texto ?? "").trim() || null,
    laudo: String(form?.laudo ?? "").trim() || null,
    liberado_por: String(form?.liberado_por ?? "").trim() || null,
    corrige_id: form?.corrige_id ?? null,
    motivo_correcao: form?.corrige_id ? String(form?.motivo_correcao ?? "").trim() : null,
  };
}

// ── O FORMULÁRIO ────────────────────────────────────────────

/**
 * 🔴 O QUE SOBREVIVE A UM SALVAMENTO, E O QUE NÃO.
 *
 * Esta separação virou regra depois do OPME, onde o formulário guardava o
 * fabricante entre um registro e o seguinte — e atribuía o fabricante errado
 * a outro produto numa tabela de rastreabilidade.
 *
 * Aqui sobrevivem SÓ o analito seguinte e quem liberou: o laboratório digita
 * vinte analitos do mesmo hemograma sem redigitar o próprio nome. O valor
 * NUNCA sobrevive.
 */
export function formularioVazio(extra = {}) {
  return {
    analito_id: null, nome: "", valor_num: "", valor_texto: "", laudo: "",
    liberado_por: "", corrige_id: null, motivo_correcao: "", ...extra,
  };
}

export function proximoFormulario(form) {
  return formularioVazio({ liberado_por: form?.liberado_por || "" });
}

export function pedidoVazio(extra = {}) {
  return {
    prioridade: "rotina", indicacao_clinica: "", solicitante: "",
    solicitante_cbo: "", itens: [], ...extra,
  };
}

// ── O QUE VEIO DO MUNDO ANTIGO ──────────────────────────────

/**
 * Este pedido nasceu do backfill de `ps_registros`?
 *
 * ⚠️ Serve para a tela não cobrar o que não existia: um pedido migrado não
 * tem indicação clínica nem CBO, e isso não é alguém que esqueceu. Sem a
 * marca, a tela mostraria "indicação clínica: —" em metade do histórico e
 * pareceria defeito.
 */
export function veioDoRegistroAntigo(pedido) {
  return pedido?.origem_registro_id != null;
}

/** O resumo de hoje, para o cartão do painel. */
export function resumoDoDia(itens, pedidos, hoje = todayStr()) {
  if (naoDeuParaLer(itens) || naoDeuParaLer(pedidos)) return null;
  const porPedido = new Map((Array.isArray(pedidos) ? pedidos : [])
    .filter(Boolean).map(p => [String(p.id), p]));
  const doDia = (Array.isArray(itens) ? itens : []).filter(i => {
    const p = porPedido.get(String(i?.pedido_id));
    return p && diaLocal(p.criado_em) === hoje;
  });
  const conta = c => doDia.filter(i => i.status === c).length;
  return {
    total: doDia.length,
    aguardando: conta(EXAME_SOLICITADO) + conta(EXAME_COLETADO),
    prontos: conta(EXAME_RESULTADO),
    vistos: conta(EXAME_VISTO),
    cancelados: conta(EXAME_CANCELADO),
    urgentes: doDia.filter(i => porPedido.get(String(i.pedido_id))?.prioridade === "urgente").length,
  };
}
