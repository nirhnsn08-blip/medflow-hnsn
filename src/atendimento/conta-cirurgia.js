// ═══════════════════════════════════════════════════════════
// A CIRURGIA VIRA CONTA
//
// 🔴 A CIRURGIA ACONTECIA NO BLOCO E A CONTA NÃO SABIA.
//
// `montarContaDoProntuario` lê a ficha, a internação e a medicação
// administrada. Não lia `cc_cirurgias` — e o próprio cabeçalho dele diz por
// que isso custa: "nasce o código trocado, a diária esquecida e a conta que
// sai menor do que o atendimento foi". Para o procedimento de MAIOR VALOR
// da tabela, o faturista redigitava tudo do papel.
//
// 💡 O QUE ESTE MOTOR PROPÕE, e por quê:
//
//   1. O PROCEDIMENTO CIRÚRGICO, com o CIRURGIÃO como executante e o CBO
//      dele. É o item que paga o ato. `at_conta_itens` sempre teve
//      `executante` E `executante_cbo` — e `cbo.js` avisa que CBO errado
//      "não é glosa: derruba o registro inteiro no SISAIH01/BPA".
//
//   2. O HONORÁRIO DO ANESTESISTA, como item SEPARADO. Não é detalhe de
//      formatação: na TISS o anestesista cobra em linha própria, com o
//      conselho e o grau dele, e amontoar os dois num item só faria a conta
//      sair com um executante para dois atos — que é glosa certa.
//
//   3. OS AUXILIARES entram como item sem preço, para CONFERÊNCIA. O
//      percentual do 1º auxiliar depende do contrato da operadora, que este
//      sistema não conhece. Inventar o valor seria pior que deixá-lo em
//      branco: o projeto já decidiu, em `montar-conta.js`, que "falta de
//      dado é silêncio — preço nunca inventado".
//
// ⚠️ NÃO PROPÕE NADA DE CIRURGIA CANCELADA nem de cirurgia que não chegou a
// acontecer. Status é a porta: só o que entrou em sala vira conta.
// ═══════════════════════════════════════════════════════════

import { diaLocal } from "../util/datas.js";

const texto = v => String(v ?? "").trim();
const num = v => (v == null || v === "" ? null : (Number.isFinite(Number(v)) ? Number(v) : null));

/** Os status em que a cirurgia já aconteceu o bastante para cobrar. */
export const STATUS_FATURAVEL = Object.freeze(["em_cirurgia", "recuperacao", "concluida"]);

/** Esta cirurgia pode virar conta? `null` = pode; string = por que não. */
export function motivoParaNaoFaturar(cirurgia) {
  const c = cirurgia || {};
  if (!c.id) return "Cirurgia inválida.";
  if (texto(c.status) === "cancelada") return "Cirurgia cancelada — não há ato a cobrar.";
  if (!STATUS_FATURAVEL.includes(texto(c.status))) {
    return "Cirurgia ainda não entrou em sala — nada a cobrar até o ato acontecer.";
  }
  return null;
}

/**
 * A data de execução do ato cirúrgico.
 *
 * A incisão, quando há; senão a entrada em sala; senão o dia agendado.
 * Tudo pelo RELÓGIO LOCAL — `inicio_cirurgia_em` é carimbo, e uma cirurgia
 * das 22h teria a execução no dia seguinte se saísse de fatia de texto.
 */
export function dataDaExecucao(cirurgia) {
  const c = cirurgia || {};
  return diaLocal(c.inicio_cirurgia_em) || diaLocal(c.entrada_sala_em) || diaLocal(c.data) || null;
}

/** Quem assina o ato, com o CBO que a conta exige. */
function doPapel(equipe, papel) {
  return (Array.isArray(equipe) ? equipe : []).find(m => texto(m?.papel) === papel) || null;
}

/**
 * Os itens que esta cirurgia acrescenta à conta.
 *
 * Devolve `{ itens, avisos }` no mesmo formato que `montar-conta.js` usa,
 * para o motor existente só concatenar.
 */
export function itensDaCirurgia({ cirurgia, equipe = [], procCatalogo = null, sigRow = null, via = null } = {}) {
  const impedida = motivoParaNaoFaturar(cirurgia);
  if (impedida) return { itens: [], avisos: [] };

  const c = cirurgia;
  // Normalizado UMA VEZ, junto da assinatura — e não a cada uso lá
  // embaixo. Além de evitar repetir a guarda, mantém o colapso perto do
  // parâmetro: o censo de cargas olha 30 linhas para trás, e com a
  // guarda no meio de uma função longa ele não enxerga a origem e acusa
  // um caso "sem classificação" que é legítimo.
  const membros = Array.isArray(equipe) ? equipe : [];
  const avisos = [];
  const itens = [];
  const data = dataDaExecucao(c);
  const cod = texto(c.procedimento_cod) || null;
  const nome = texto(procCatalogo?.nome) || texto(c.procedimento) || "(cirurgia sem nome)";
  const rotulo = cod ? `${cod} (${nome})` : nome;

  // ── 1) o ato cirúrgico ──────────────────────────────────
  if (!cod) {
    avisos.push(
      `A cirurgia "${nome}" está SEM CÓDIGO de procedimento — ela não entra na conta. ` +
      "Sem SIGTAP não há AIH e sem TUSS não há guia TISS; escolha o procedimento do catálogo no Bloco.");
    return { itens, avisos };
  }

  let valor = num(procCatalogo?.valor_sus);
  let fonteValor = valor != null ? "catálogo do hospital" : null;
  if (valor == null && sigRow) {
    const sh = num(sigRow.valor_sh), sp = num(sigRow.valor_sp);
    if (sh != null || sp != null) { valor = ((sh ?? 0) + (sp ?? 0)) / 100; fonteValor = "SIGTAP (SH+SP)"; }
  }
  if (valor == null) {
    avisos.push(`Cirurgia ${rotulo} entra sem preço — nem o catálogo do hospital nem o SIGTAP têm valor para ela.`);
  }

  const cirurgiao = doPapel(membros, "cirurgiao");
  if (!cirurgiao) {
    avisos.push(`Cirurgia ${rotulo} sem cirurgião registrado — o item vai sem executante, e sem executante o procedimento não é pago.`);
  } else if (!texto(cirurgiao.cbo)) {
    avisos.push(`Cirurgião ${cirurgiao.nome} sem CBO. Rejeição no SISAIH01/BPA não é glosa: derruba o registro inteiro, e só aparece no processamento do mês seguinte.`);
  }

  itens.push({
    tipo: "procedimento",
    codigo: cod,
    descricao: nome,
    quantidade: 1,
    valor_unitario: valor,
    executante: cirurgiao?.nome ?? null,
    executante_cbo: cirurgiao?.cbo ?? null,
    data_execucao: data,
    cobrar_do_paciente: false,
    origem: `Cirurgia #${c.id}${c.sala ? ` · ${c.sala}` : ""}`,
    fonte: "cc_cirurgias.procedimento_cod",
    fonteValor,
  });

  // ── 2) o honorário do anestesista, em linha própria ─────
  const anestesista = doPapel(membros, "anestesista");
  if (anestesista) {
    itens.push({
      tipo: "procedimento",
      codigo: null,
      descricao: `Anestesia — ${nome}`,
      quantidade: 1,
      valor_unitario: null,
      executante: anestesista.nome,
      executante_cbo: anestesista.cbo ?? null,
      data_execucao: data,
      cobrar_do_paciente: false,
      origem: `Cirurgia #${c.id} · honorário do anestesista`,
      fonte: "cc_equipe (anestesista)",
      fonteValor: null,
    });
    if (!texto(anestesista.cbo)) {
      avisos.push(`Anestesista ${anestesista.nome} sem CBO — o honorário dele entra, mas é rejeitado no processamento.`);
    }
  } else if (via === "aih") {
    // Internação cirúrgica sem anestesista registrado é lacuna de dado, não
    // de ato: alguém anestesiou. Avisa para a equipe ser registrada.
    avisos.push(`Cirurgia ${rotulo} sem anestesista registrado — o honorário de anestesia não entra na conta.`);
  }

  // ── 3) os auxiliares, para conferência ──────────────────
  const auxiliares = membros
    .filter(m => ["primeiro_auxiliar", "segundo_auxiliar"].includes(texto(m?.papel)));
  for (const a of auxiliares) {
    itens.push({
      tipo: "procedimento",
      codigo: null,
      descricao: `${a.papel === "primeiro_auxiliar" ? "1º" : "2º"} auxiliar — ${nome}`,
      quantidade: 1,
      // Sem valor DE PROPÓSITO: o percentual do auxiliar depende do contrato
      // da operadora, que este sistema não conhece. Preço nunca inventado.
      valor_unitario: null,
      executante: a.nome,
      executante_cbo: a.cbo ?? null,
      data_execucao: data,
      cobrar_do_paciente: false,
      origem: `Cirurgia #${c.id} · ${a.papel === "primeiro_auxiliar" ? "1º" : "2º"} auxiliar`,
      fonte: "cc_equipe (auxiliar)",
      fonteValor: null,
    });
  }
  if (auxiliares.length) {
    avisos.push(
      `${auxiliares.length} auxiliar(es) entram sem valor: o percentual depende do contrato da operadora. ` +
      "Confira na tabela antes de fechar.");
  }

  return { itens, avisos };
}

/**
 * O que juntar de VÁRIAS cirurgias do mesmo episódio.
 *
 * Um episódio pode ter mais de uma (reoperação, segundo tempo), e cada uma
 * é um ato próprio com equipe própria.
 */
export function itensDasCirurgias({ cirurgias = [], equipePorCirurgia = {}, catalogoPorCodigo = {}, sigtapPorCodigo = {}, via = null } = {}) {
  const itens = [];
  const avisos = [];
  for (const c of (Array.isArray(cirurgias) ? cirurgias : [])) {
    const cod = texto(c?.procedimento_cod);
    const r = itensDaCirurgia({
      cirurgia: c,
      equipe: equipePorCirurgia[c?.id] || [],
      procCatalogo: cod ? catalogoPorCodigo[cod] || null : null,
      sigRow: cod ? sigtapPorCodigo[cod] || null : null,
      via,
    });
    itens.push(...r.itens);
    avisos.push(...r.avisos);
  }
  return { itens, avisos };
}
