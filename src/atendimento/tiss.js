// ═══════════════════════════════════════════════════════════
// TISS — A GUIA
//
// Puro: não sabe o que é React nem banco.
//
// 🔴 NÃO SE FATURA CONVÊNIO COM CONTA — FATURA-SE COM GUIA. A conta diz o
// que foi feito; a guia é o documento que vai para a operadora, com quem
// cobrou, por quem, sob qual carteira e com qual autorização.
//
// ⚠️ O XML NÃO SAI DAQUI, e é a mesma recusa de `faturamento.js`: o padrão
// TISS é versionado (3.05, 4.01…), o XSD muda por norma da ANS e a
// operadora homologa. A diferença em relação ao SISAIH01 é que a ANS
// PUBLICA o XSD — então o gerador é escrevível contra algo conferível no
// dia em que o arquivo estiver em mãos. Até lá existe a guia, que é
// documento válido impresso e é com ela que o hospital cobra hoje.
//
// As recusas de verdade estão no gatilho (migracao-tiss-guias.sql, provado
// em PGlite: 42 cenários). Aqui está o que a tela sabe antes de mandar — e
// com as MESMAS palavras, de propósito: a pessoa não deve ver duas
// explicações diferentes para a mesma recusa.
// ═══════════════════════════════════════════════════════════

import { naoDeuParaLer } from "../util/leitura.js";

const texto = v => String(v ?? "").trim();

/**
 * Os quatro tipos do padrão.
 *
 * ⚠️ Não é enfeite: cada um tem campos obrigatórios próprios e a operadora
 * recusa a guia emitida no tipo errado. Consulta não leva procedimento
 * além da própria consulta; SP/SADT leva o pedido; internação leva o
 * regime e o CID.
 */
export const TIPOS_GUIA = [
  { chave: "consulta",   label: "Consulta",             quando: "Atendimento ambulatorial eletivo, só a consulta." },
  { chave: "sp_sadt",    label: "SP/SADT",              quando: "Serviço profissional, exame ou terapia. É a guia mais usada." },
  { chave: "internacao", label: "Resumo de internação", quando: "Fecha a internação: regime, CID e o que foi feito no período." },
  { chave: "honorarios", label: "Honorários",           quando: "O que o profissional cobra à parte do hospital." },
];

export const CARATERES = [
  { chave: "eletiva",  label: "Eletiva" },
  { chave: "urgencia", label: "Urgência / emergência" },
];

/**
 * O ciclo de vida, na ordem em que acontece.
 *
 * ⚠️ `glosada` NÃO é o fim: a glosa se recorre, e o recurso é outro fluxo
 * (`at_glosas`). Tratá-la como estado final faria a guia sumir da tela de
 * quem tem de recorrer dentro do prazo.
 */
export const STATUS_GUIA = [
  { chave: "rascunho",  label: "Rascunho",  cor: "#8d99ab", final: false },
  { chave: "emitida",   label: "Emitida",   cor: "#3b82f6", final: false },
  { chave: "enviada",   label: "Enviada",   cor: "#6366f1", final: false },
  { chave: "paga",      label: "Paga",      cor: "#34d399", final: true },
  { chave: "glosada",   label: "Glosada",   cor: "#f43f5e", final: false },
  { chave: "cancelada", label: "Cancelada", cor: "#64748b", final: true },
];

const POR_STATUS = Object.fromEntries(STATUS_GUIA.map(s => [s.chave, s]));

/** Quantos caracteres de motivo valem para cancelar (o banco exige 5). */
export const MIN_MOTIVO_CANCELAMENTO = 5;

/**
 * Em que estado está esta guia.
 *
 * 🔴 STATUS DESCONHECIDO LÊ-SE COMO `rascunho`, nunca como `paga`. Guia que
 * o sistema não sabe classificar tem de continuar aparecendo como coisa a
 * fazer — lê-la como resolvida é sumir com dinheiro a receber.
 */
export function estadoDaGuia(guia) {
  return POR_STATUS[guia?.status] || POR_STATUS.rascunho;
}

/** Já foi para a operadora? A partir daqui o documento não muda. */
export function jaSaiu(guia) {
  return ["emitida", "enviada", "paga", "glosada"].includes(guia?.status);
}

// ── O QUE FALTA PARA EMITIR ─────────────────────────────────

/**
 * As pendências que impedem a emissão.
 *
 * ⚠️ MESMAS PALAVRAS DO GATILHO. Ver uma explicação na tela e outra na
 * mensagem de erro do banco é a forma mais rápida de alguém parar de ler
 * as duas.
 *
 * `onde` diz onde se conserta: quem emite a guia não é quem cadastra a
 * operadora nem quem lança o item.
 */
export function pendenciasParaEmitir({ guia, conta, convenio, itens = [], profissional } = {}) {
  const out = [];
  const add = (chave, oque, onde) => out.push({ chave, texto: oque, onde });

  if (!conta) {
    add("sem_conta", "A guia não aponta para nenhuma conta.", "a conta do episódio");
    return out;
  }
  // 🔴 Guia TISS é de convênio. Emitir sobre conta do SUS seria cobrar duas
  // vezes pela mesma coisa — e do lado errado.
  if (texto(conta.via) !== "tiss") {
    add("via_errada",
      `A conta #${conta.id} sai pela via "${texto(conta.via) || "sem via"}", não por TISS. ` +
      "Guia TISS é para operadora — cobrar por aqui uma conta do SUS é cobrança indevida.",
      "a via da conta");
    return out;
  }

  if (!convenio) {
    add("sem_operadora", "A guia não tem operadora: nem ela nem a conta apontam para um convênio.",
      "a ficha do atendimento");
  } else {
    if (!texto(convenio.codigo_prestador)) {
      add("sem_codigo_prestador",
        `A operadora "${convenio.nome}" não tem o código do prestador cadastrado. ` +
        "É por ele que ela sabe quem está cobrando — sem isso a guia não é aceita.",
        "o cadastro de Convênios");
    }
    if (!texto(convenio.registro_ans)) {
      add("sem_registro_ans",
        `A operadora "${convenio.nome}" não tem registro ANS cadastrado. ` +
        "Toda operadora tem um, e ele identifica a empresa na troca TISS.",
        "o cadastro de Convênios");
    }
  }

  if (!texto(guia?.beneficiario_carteira)) {
    add("sem_carteira",
      "Sem o número da carteira do beneficiário. É a identificação dele dentro da operadora, e a guia é recusada sem ela.",
      "a ficha do atendimento");
  }

  // 🔴 OS QUATRO CAMPOS DO PROFISSIONAL. Conselho sem UF não identifica
  // ninguém: o mesmo CRM 1234 existe em 27 estados.
  const prof = profissional || guia || {};
  const falta = [
    [prof.profissional_conselho ?? prof.conselho, "conselho"],
    [prof.profissional_registro ?? prof.registro_conselho, "número"],
    [prof.profissional_uf ?? prof.uf_conselho, "UF"],
    [prof.profissional_cbo ?? prof.cbo, "CBO"],
  ].filter(([v]) => !texto(v)).map(([, nome]) => nome);
  if (falta.length) {
    add("profissional_incompleto",
      `O profissional está sem ${falta.join(", ")}. A guia leva conselho, número, UF e CBO — ` +
      "conselho sem UF não identifica ninguém, porque o mesmo número existe em 27 estados.",
      "o cadastro do profissional");
  }

  const vivos = (Array.isArray(itens) ? itens : []).filter(i => i && !i.cancelado);
  if (!vivos.length) {
    add("sem_itens", `A conta #${conta.id} não tem item nenhum. Guia sem item é cobrança de nada.`,
      "os itens da conta");
  } else {
    // ⚠️ CÓDIGO SEM TABELA É AMBÍGUO: o mesmo número existe no SIGTAP e no
    // TUSS significando coisas diferentes. Não derruba a guia no papel, mas
    // derruba o XML — e é agora que dá para consertar.
    const semTabela = vivos.filter(i => !texto(i.tabela));
    if (semTabela.length) {
      add("item_sem_tabela",
        `${semTabela.length} de ${vivos.length} ${semTabela.length === 1 ? "item está" : "itens estão"} sem a tabela do código. ` +
        "O mesmo número existe no SIGTAP e no TUSS querendo dizer coisas diferentes.",
        "os itens da conta");
    }
  }

  if (!TIPOS_GUIA.some(t => t.chave === texto(guia?.tipo))) {
    add("sem_tipo", "Escolha o tipo da guia. Cada tipo tem campos próprios, e a operadora recusa a guia emitida no tipo errado.",
      "esta tela");
  }

  return out;
}

/** Dá para emitir? `null` quando sim. */
export function conferirEmissao(ctx) {
  const p = pendenciasParaEmitir(ctx);
  return p.length ? p[0].texto : null;
}

export function conferirCancelamento(motivo) {
  if (texto(motivo).length < MIN_MOTIVO_CANCELAMENTO) {
    return `Diga por que a guia está sendo cancelada (ao menos ${MIN_MOTIVO_CANCELAMENTO} caracteres). ` +
      "Guia cancelada sem motivo vira dúvida na conciliação com a operadora — que é onde o dinheiro aparece ou some.";
  }
  return null;
}

// ── O QUE VAI PARA O BANCO ──────────────────────────────────

/**
 * ⚠️ NÃO MANDA `numero_prestador`, `emitida_em`, `registro_ans` NEM
 * `codigo_prestador`. Os quatro são CARIMBADOS pelo gatilho a partir do
 * cadastro no momento da emissão. Mandá-los daqui deixaria a tela decidir
 * o número da guia — e número de guia é o que impede cobrança duplicada.
 */
export function linhaDaGuia(form, { conta, convenio, profissional } = {}) {
  return {
    conta_id: conta?.id ?? null,
    convenio_id: convenio?.id ?? conta?.convenio_id ?? null,
    tipo: texto(form?.tipo) || "sp_sadt",
    carater: texto(form?.carater) || "eletiva",
    beneficiario_nome: texto(form?.beneficiario_nome) || null,
    beneficiario_carteira: texto(form?.beneficiario_carteira) || null,
    beneficiario_validade: texto(form?.beneficiario_validade) || null,
    beneficiario_cns: texto(form?.beneficiario_cns) || null,
    senha: texto(form?.senha) || null,
    senha_validade: texto(form?.senha_validade) || null,
    profissional_nome: texto(profissional?.nome ?? form?.profissional_nome) || null,
    profissional_conselho: texto(profissional?.conselho ?? form?.profissional_conselho) || null,
    profissional_registro: texto(profissional?.registro_conselho ?? form?.profissional_registro) || null,
    profissional_uf: texto(profissional?.uf_conselho ?? form?.profissional_uf) || null,
    profissional_cbo: texto(profissional?.cbo ?? form?.profissional_cbo) || null,
    indicacao_clinica: texto(form?.indicacao_clinica) || null,
    atendimento_em: form?.atendimento_em || null,
  };
}

export function guiaVazia(extra = {}) {
  return {
    tipo: "sp_sadt", carater: "eletiva",
    beneficiario_nome: "", beneficiario_carteira: "", beneficiario_validade: "",
    beneficiario_cns: "", senha: "", senha_validade: "", indicacao_clinica: "",
    ...extra,
  };
}

// ── O PAINEL ────────────────────────────────────────────────

/**
 * O resumo das guias de uma competência.
 *
 * 🔴 `null` QUANDO A LEITURA FALHOU. "Nenhuma guia pendente" é a frase que
 * faz alguém ir embora tranquilo, e ela não pode sair de uma lista que não
 * desceu.
 */
export function resumoDasGuias(guias) {
  if (naoDeuParaLer(guias)) return null;
  const lista = (Array.isArray(guias) ? guias : []).filter(Boolean);
  const conta = c => lista.filter(g => estadoDaGuia(g).chave === c).length;
  return {
    total: lista.length,
    rascunho: conta("rascunho"),
    emitida: conta("emitida"),
    enviada: conta("enviada"),
    paga: conta("paga"),
    glosada: conta("glosada"),
    cancelada: conta("cancelada"),
    // ⚠️ O que ainda rende dinheiro: emitida e enviada esperam resposta,
    // glosada espera recurso. Rascunho nem saiu.
    aguardandoResposta: conta("emitida") + conta("enviada"),
  };
}

/**
 * As contas de convênio que ainda não têm guia.
 *
 * 🔴 É A LISTA QUE EXISTE PARA ACUSAR SILÊNCIO: conta fechada de operadora
 * sem guia é dinheiro que o hospital fez e não cobrou. Ninguém reclama —
 * nem o paciente, nem a operadora.
 *
 * ⚠️ Guia CANCELADA não conta como guia: a conta volta para esta lista,
 * que é exatamente o que tem de acontecer quando alguém cancela por erro.
 */
export function contasSemGuia(contas, guias) {
  if (naoDeuParaLer(contas) || naoDeuParaLer(guias)) return null;
  const comGuia = new Set((Array.isArray(guias) ? guias : [])
    .filter(g => g && g.status !== "cancelada")
    .map(g => String(g.conta_id)));
  return (Array.isArray(contas) ? contas : [])
    .filter(c => c && texto(c.via) === "tiss" && c.status === "fechada")
    .filter(c => !comGuia.has(String(c.id)));
}
