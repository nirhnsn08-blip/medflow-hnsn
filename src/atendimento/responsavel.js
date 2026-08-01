// ═══════════════════════════════════════════════════════════
// RESPONSÁVEL DO EPISÓDIO — quem consente e quem recebe a alta
//
// Puro: não sabe o que é React nem banco. Equivale ao botão "2-
// Responsável" do MV, e existe para responder duas perguntas que hoje só
// vivem na memória de quem estava no balcão: quem autorizou o
// procedimento, e a quem o paciente pode ser entregue.
//
// A DECISÃO QUE ORGANIZA O ARQUIVO: CAPACIDADE NÃO SE DEDUZ.
// É tentador tratar "tem responsável cadastrado" como "não decide sozinho".
// Seria errado e ilegal. A Lei 13.146/2015 (Estatuto da Pessoa com
// Deficiência) mudou exatamente isso: deficiência NÃO é incapacidade, e a
// curatela é medida excepcional, definida por JUIZ, e restrita a atos
// patrimoniais. Um cadastro de recepção não pode remover a capacidade civil
// de ninguém — por isso `curador`, `tutor` e `guardião` EXIGEM o número do
// processo. Sem o documento, o sistema recusa.
//
// A IDADE, SIM, DECIDE SOZINHA (Código Civil arts. 3º e 4º):
//   até 15 anos  — absolutamente incapaz: alguém decide POR ele
//                  (representação)
//   16 e 17 anos — relativamente incapaz: alguém decide COM ele
//                  (assistência) — e o adolescente é ouvido
//   18 em diante — decide sozinho, ponto. Só uma curatela judicial muda
//                  isso.
//
// ACOMPANHANTE NÃO É RESPONSÁVEL LEGAL, e confundir os dois é o defeito
// que este arquivo mais se esforça para impedir. Acompanhante é DIREITO de
// quem fica ao lado (ECA art. 12; Estatuto do Idoso, Lei 10.741/2003 art.
// 16). O vizinho que trouxe a senhora ao pronto-socorro é acompanhante —
// e não pode autorizar cirurgia nem levá-la embora no lugar dela.
//
// E NADA AQUI BLOQUEIA ATENDIMENTO. Em urgência com risco de vida, o
// médico age sem consentimento (Código Penal art. 146 §3º I; CFM
// 2.217/2018). A falta de responsável é PENDÊNCIA VISÍVEL, nunca porta
// fechada — a mesma regra que já vale para a ficha administrativa.
// ═══════════════════════════════════════════════════════════

import { validarCPF, limparDoc, idadeDetalhada } from "../pacientes/identidade.js";

/** A partir de quando se decide sozinho. */
export const MAIORIDADE = 18;
/** Até quando a incapacidade é absoluta (Código Civil art. 3º). */
export const IDADE_INCAPACIDADE_ABSOLUTA = 16;

/**
 * O que a pessoa cadastrada pode fazer.
 *
 * `consente` e `recebeAlta` são atributos do PAPEL, não caixinhas que a
 * recepção marca. Marcar "pode consentir" num acompanhante seria dar a ele
 * um poder que a lei não dá — e a tela que oferece a caixinha ensina que
 * dá.
 */
export const PAPEIS = {
  representante: {
    label: "Representante legal",
    quem: "Criança ou adolescente com menos de 16 anos, ou pessoa sob curatela judicial. Decide POR ele.",
    consente: true, recebeAlta: true,
  },
  assistente: {
    label: "Assistente",
    quem: "Adolescente de 16 ou 17 anos. Decide COM ele — o adolescente é ouvido e sua vontade pesa.",
    consente: true, recebeAlta: true,
  },
  acompanhante: {
    label: "Acompanhante",
    quem: "Direito de quem fica ao lado (ECA art. 12; Estatuto do Idoso art. 16). NÃO consente nem recebe alta no lugar do paciente.",
    consente: false, recebeAlta: false,
  },
};

/**
 * O vínculo com o paciente.
 *
 * `exigeDocumento: true` marca os vínculos que só existem por decisão
 * judicial. É o campo que impede o cadastro de criar curatela por
 * digitação.
 */
export const VINCULOS = [
  { chave: "mae",       label: "Mãe",                       exigeDocumento: false },
  { chave: "pai",       label: "Pai",                       exigeDocumento: false },
  { chave: "filho",     label: "Filho(a)",                  exigeDocumento: false },
  { chave: "conjuge",   label: "Cônjuge / companheiro(a)",  exigeDocumento: false },
  { chave: "irmao",     label: "Irmão / irmã",              exigeDocumento: false },
  { chave: "avo",       label: "Avô / avó",                 exigeDocumento: false },
  { chave: "tutor",     label: "Tutor",                     exigeDocumento: true },
  { chave: "curador",   label: "Curador",                   exigeDocumento: true },
  { chave: "guardiao",  label: "Guardião",                  exigeDocumento: true },
  { chave: "instituicao", label: "Responsável institucional (abrigo, ILPI)", exigeDocumento: true },
  { chave: "outro",     label: "Outro",                     exigeDocumento: false },
];

export const VINCULO_POR_CHAVE = Object.fromEntries(VINCULOS.map(v => [v.chave, v]));

/** Vínculos que dependem de decisão judicial para existir. */
export const exigeDocumentoJudicial = vinculo => !!VINCULO_POR_CHAVE[vinculo]?.exigeDocumento;

// ── O QUE ESTE PACIENTE EXIGE ───────────────────────────────

/**
 * Qual papel este paciente exige, e por quê.
 *
 * `incerto: true` é o estado que mais importa: paciente sem data de
 * nascimento (o não identificado, o cadastro antigo). Aí o sistema NÃO
 * afirma que ele decide sozinho nem que precisa de responsável — diz que
 * não sabe. Assumir maioridade por falta de dado é como o sistema deixaria
 * de pedir responsável para uma criança que chegou sem documento.
 */
export function papelExigido(paciente, hoje = new Date()) {
  const idade = idadeDetalhada(paciente?.data_nascimento, hoje);

  if (!idade) {
    return {
      papel: null, exigido: false, incerto: true, idadeAnos: null,
      motivo: "Data de nascimento não cadastrada — não dá para saber se este paciente decide sozinho. Confirme a idade antes de qualquer consentimento.",
    };
  }
  if (idade.anos < IDADE_INCAPACIDADE_ABSOLUTA) {
    return {
      papel: "representante", exigido: true, incerto: false, idadeAnos: idade.anos,
      motivo: `${idade.rotulo} — absolutamente incapaz (Código Civil art. 3º). Quem consente e recebe a alta é o representante legal.`,
    };
  }
  if (idade.anos < MAIORIDADE) {
    return {
      papel: "assistente", exigido: true, incerto: false, idadeAnos: idade.anos,
      motivo: `${idade.anos} anos — relativamente incapaz (Código Civil art. 4º). O adolescente é ouvido, e o assistente responde com ele.`,
    };
  }
  return {
    papel: null, exigido: false, incerto: false, idadeAnos: idade.anos,
    motivo: "Maior de idade — decide sozinho. Só uma curatela judicial muda isso, e ela exige o número do processo.",
  };
}

// ── VALIDAÇÃO DO CADASTRO ───────────────────────────────────

/**
 * Pode gravar este responsável?
 *
 * Os erros aqui impedem GRAVAR O RESPONSÁVEL — nunca o atendimento. É uma
 * distinção que já vale no resto do módulo: pendência administrativa não
 * segura paciente na porta, mas registro errado no lugar certo é pior do
 * que registro nenhum, porque alguém vai confiar nele.
 */
export function conferirResponsavel({ paciente, responsavel = {}, hoje = new Date() } = {}) {
  const erros = [];
  const avisos = [];

  const nome = String(responsavel.nome ?? "").trim();
  if (!nome) erros.push("Informe o nome de quem está assumindo a responsabilidade.");
  else if (nome.length < 5) erros.push("O nome está curto demais para identificar alguém numa auditoria.");

  const papel = PAPEIS[responsavel.papel];
  if (!papel) erros.push("Escolha o papel: representante legal, assistente ou acompanhante.");

  if (!VINCULO_POR_CHAVE[responsavel.vinculo]) erros.push("Informe o vínculo com o paciente.");

  const doc = String(responsavel.documento_judicial ?? "").trim();
  if (exigeDocumentoJudicial(responsavel.vinculo) && !doc) {
    erros.push(
      `${VINCULO_POR_CHAVE[responsavel.vinculo].label} só existe por decisão judicial. ` +
      "Informe o número do processo — sem ele, este cadastro estaria retirando de uma pessoa capaz " +
      "o direito de decidir por si (Lei 13.146/2015).");
  }

  const cpf = limparDoc(responsavel.cpf);
  if (cpf && !validarCPF(cpf)) {
    erros.push("O CPF informado não é válido. É por ele que se confere quem levou o paciente embora.");
  }

  const exigencia = papelExigido(paciente, hoje);

  // Representante/assistente para adulto sem curatela: recusado. Maioridade
  // não se remove por cadastro de balcão.
  if ((responsavel.papel === "representante" || responsavel.papel === "assistente")
      && exigencia.exigido === false && exigencia.incerto === false
      && !exigeDocumentoJudicial(responsavel.vinculo)) {
    erros.push(
      "Este paciente é maior de idade e decide sozinho. Para registrar alguém que decide por ele é " +
      "preciso curatela judicial (vínculo \"Curador\" com o número do processo). " +
      "Se a pessoa apenas acompanha, o papel é Acompanhante.");
  }

  // O responsável precisa ser capaz — e a idade dele raramente é digitada.
  const idadeResp = idadeDetalhada(responsavel.data_nascimento, hoje);
  if (idadeResp && idadeResp.anos < MAIORIDADE && responsavel.papel !== "acompanhante") {
    erros.push("Quem representa ou assiste precisa ser maior de idade.");
  }

  // ── avisos ──
  if (exigencia.incerto) {
    avisos.push("A idade do paciente não está cadastrada. Confirme antes de tratar este registro como consentimento válido.");
  }
  if (exigencia.exigido && responsavel.papel === "acompanhante") {
    avisos.push(
      `Este paciente ainda precisa de ${PAPEIS[exigencia.papel].label.toLowerCase()}. ` +
      "Acompanhante não consente nem recebe alta — a pendência continua aberta.");
  }
  if (!cpf) {
    avisos.push("Sem CPF, a conferência de quem recebe a alta depende de reconhecer a pessoa. Registre quando houver documento.");
  }

  return { ok: erros.length === 0, erros, avisos };
}

// ── LEITURA ─────────────────────────────────────────────────

const ativos = lista => (Array.isArray(lista) ? lista : []).filter(r => r?.ativo !== false);

/** Quem, entre os cadastrados, pode consentir por este paciente. */
export const quemConsente = responsaveis =>
  ativos(responsaveis).filter(r => PAPEIS[r.papel]?.consente);

/** A quem o paciente pode ser entregue na alta. */
export const quemRecebeAlta = responsaveis =>
  ativos(responsaveis).filter(r => PAPEIS[r.papel]?.recebeAlta);

/**
 * A pendência que a recepção precisa ver — e que NUNCA impede o
 * atendimento.
 *
 * Devolve `null` quando não há nada a cobrar, para a tela não desenhar uma
 * faixa de aviso vazia. Aviso que sempre aparece é aviso que ninguém lê.
 */
export function pendenciaDeResponsavel({ paciente, responsaveis = [], hoje = new Date() } = {}) {
  const exigencia = papelExigido(paciente, hoje);

  if (exigencia.incerto) {
    return {
      gravidade: "media",
      texto: "Paciente sem data de nascimento: o sistema não sabe se ele decide sozinho. Se for menor, alguém precisa assumir a responsabilidade pelo episódio.",
    };
  }
  if (!exigencia.exigido) return null;

  const podem = quemConsente(responsaveis);
  if (podem.length) return null;

  return {
    gravidade: "alta",
    texto: `${exigencia.motivo} Ninguém foi registrado ainda — o atendimento pode seguir, mas o consentimento e a alta ficam sem respaldo.`,
  };
}

// ── GRAVAÇÃO ────────────────────────────────────────────────

/**
 * O corpo a gravar, só com o que foi preenchido.
 *
 * Campo em branco vira `null` e não `""`, pelo mesmo motivo da ficha: com
 * string vazia no banco, "não informado" deixa de ser distinguível de
 * "informado em branco".
 *
 * `consente` e `recebe_alta` são DERIVADOS do papel, e nunca copiados do
 * que a tela mandou. Gravar o que a tela diz permitiria um acompanhante com
 * poder de consentir por um caminho que não passa por validação nenhuma.
 */
export function camposDoResponsavel(dados = {}) {
  const texto = v => {
    const s = typeof v === "string" ? v.trim() : v;
    return s === "" || s === undefined ? null : s;
  };
  const papel = PAPEIS[dados.papel] ? dados.papel : "acompanhante";
  return {
    atendimento_id: dados.atendimento_id ?? null,
    prontuario: texto(dados.prontuario),
    nome: texto(dados.nome),
    cpf: limparDoc(dados.cpf) || null,
    data_nascimento: texto(dados.data_nascimento),
    telefone: texto(dados.telefone),
    vinculo: texto(dados.vinculo),
    papel,
    documento_judicial: texto(dados.documento_judicial),
    consente: !!PAPEIS[papel].consente,
    recebe_alta: !!PAPEIS[papel].recebeAlta,
    observacao: texto(dados.observacao),
    ativo: dados.ativo !== false,
  };
}
