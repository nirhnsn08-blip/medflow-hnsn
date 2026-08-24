// ═══════════════════════════════════════════════════════════
// CICLO DE VIDA DO ATENDIMENTO — abrir, corrigir, cancelar, encerrar
//
// POR QUE ESTE ARQUIVO EXISTE
// Dois defeitos que só apareceram depois da agenda entrar:
//
// 1. O ATENDIMENTO AMBULATORIAL NUNCA FECHAVA. A única coisa no sistema que
//    gravava `status = 'finalizado'` era o desfecho do Pronto-Socorro — e o
//    PS passou a filtrar só emergência. Consequência em cadeia: cada
//    consulta ambulatorial ficava "aberta" para sempre, e o aviso de
//    atendimento duplicado da Recepção passava a disparar em toda visita
//    ("já tem 5 atendimentos em aberto"). Aviso que sempre dispara é aviso
//    que ninguém lê — e aí o caso real de duplicidade passa junto com os
//    falsos. Fadiga de alarme.
//
// 2. NÃO EXISTIA CORRIGIR NEM CANCELAR. Convênio digitado errado, paciente
//    trocado, atendimento aberto em duplicidade — tudo permanente. O MV
//    dedica três telas a isso (Alteração de Atendimento, Alteração do Tipo,
//    Exclusão) porque é a operação mais frequente de um balcão depois de
//    abrir.
//
// A DECISÃO QUE ORGANIZA O ARQUIVO: "ABERTO" MORA NUM LUGAR SÓ.
// O sistema tinha o conceito de "aberto" espalhado como `status !==
// 'finalizado'` em quatro lugares diferentes, incluindo dentro do Paciente
// 360. Acrescentar um status novo por fora faria o resumo do paciente dizer
// "está no PS agora (cancelado)". Aqui a lista é única e todos leem dela.
// ═══════════════════════════════════════════════════════════

/**
 * Os estados do atendimento e o que cada um significa para as filas.
 *
 * `aberto` é o que decide se o paciente aparece nas filas, no aviso de
 * duplicidade e no resumo do Paciente 360.
 */
export const STATUS_ATENDIMENTO = {
  aguardando_triagem:     { label: "Aguardando triagem",     aberto: true },
  aguardando_atendimento: { label: "Aguardando atendimento", aberto: true },
  em_atendimento:         { label: "Em atendimento",         aberto: true },
  finalizado:             { label: "Finalizado",             aberto: false },
  cancelado:              { label: "Cancelado",              aberto: false },
};

/**
 * Este atendimento ainda está aberto?
 *
 * Status desconhecido conta como ABERTO de propósito. Se um dia alguém
 * gravar um estado que este arquivo não conhece, o paciente APARECE na
 * fila em vez de desaparecer dela — errar mostrando é recuperável, errar
 * escondendo não: ninguém procura o que não sabe que existe.
 */
export const atendimentoAberto = a =>
  STATUS_ATENDIMENTO[a?.status]?.aberto ?? true;

/**
 * O filtro PostgREST equivalente, para não repetir a lista em cada consulta.
 *
 * `not.in` e não `neq.finalizado`: era o `neq` que deixava o cancelado
 * passar por aberto.
 */
export const FILTRO_ATENDIMENTO_ABERTO = "status=not.in.(finalizado,cancelado)";

// ── A FILA VIVA DO AMBULATÓRIO ──────────────────────────────

/**
 * Minutos entre dois instantes. `null` quando não dá para saber.
 *
 * `null` e 0 são diferentes: zero é "chegou agora", nulo é "não há registro
 * de quando chegou" — e um relógio que mostra 0 para quem espera há uma hora
 * é pior que relógio nenhum.
 */
export function minutosEntre(de, ate) {
  const a = de ? new Date(de).getTime() : NaN;
  const b = ate ? new Date(ate).getTime() : NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const min = Math.floor((b - a) / 60000);
  return min < 0 ? null : min;
}

/**
 * A fila do ambulatório, agora.
 *
 * POR QUE ISTO NÃO EXISTIA
 * Confirmada a presença, nasce um atendimento `aguardando_atendimento` que é
 * explicitamente EXCLUÍDO do painel do PS (lá o filtro é só emergência, e
 * está certo) e não aparecia em nenhuma outra tela. O paciente ficava num
 * limbo: presente no sistema, invisível para todo mundo.
 *
 * A recepção respondia "quanto falta?" de cabeça. Quando o médico atrasava
 * quarenta minutos, ninguém sabia — e ninguém conseguia provar depois.
 *
 * O relógio de quem ESPERA conta da chegada até agora. O de quem JÁ ESTÁ
 * sendo atendido conta da chegada até a chamada — é o tempo de espera dele,
 * que parou de correr. Misturar os dois faria a média de espera crescer
 * junto com a duração da consulta, que é outra coisa.
 */
export function filaDoAmbulatorio(atendimentos = [], { agora = new Date() } = {}) {
  const vivos = (Array.isArray(atendimentos) ? atendimentos : []).filter(atendimentoAberto);

  const comEspera = vivos.map(a => ({
    ...a,
    esperaMin: a.atendimento_em
      ? minutosEntre(a.chegada_em, a.atendimento_em)
      : minutosEntre(a.chegada_em, agora),
  }));

  const ordenar = (x, y) => (y.esperaMin ?? -1) - (x.esperaMin ?? -1);   // quem espera há mais tempo primeiro
  return {
    esperando: comEspera.filter(a => a.status !== "em_atendimento").sort(ordenar),
    emAtendimento: comEspera.filter(a => a.status === "em_atendimento").sort(ordenar),
  };
}

/** Pode chamar este paciente para a sala? */
export function validarChamada(atendimento) {
  if (!atendimento?.id) return { ok: false, erro: "Atendimento inválido." };
  if (!atendimentoAberto(atendimento)) {
    return { ok: false, erro: `Este atendimento já está ${STATUS_ATENDIMENTO[atendimento.status]?.label?.toLowerCase() || "encerrado"}.` };
  }
  if (atendimento.status === "em_atendimento") {
    return { ok: false, erro: "Este paciente já foi chamado — já está em atendimento." };
  }
  return { ok: true };
}

// ── ENCERRAMENTO AMBULATORIAL ───────────────────────────────

/**
 * Como uma consulta ambulatorial termina.
 *
 * Curto de propósito. O desfecho do PS tem cinco opções porque lá o
 * paciente pode internar, ser transferido ou morrer. No ambulatório,
 * ou ele foi atendido, ou desistiu, ou foi mandado para outro lugar.
 */
export const DESFECHOS_AMBULATORIAL = [
  { chave: "atendido",    label: "Atendido",
    dica: "A consulta aconteceu. É o desfecho que conta como produção realizada." },
  { chave: "evadiu",      label: "Evadiu / desistiu",
    dica: "Chegou, foi registrado, e saiu antes de ser atendido." },
  { chave: "encaminhado", label: "Encaminhado a outro serviço",
    dica: "Precisou de urgência, de outra especialidade ou de outra unidade." },
];

export const DESFECHO_AMB_POR_CHAVE =
  Object.fromEntries(DESFECHOS_AMBULATORIAL.map(d => [d.chave, d]));

/** Pode encerrar? */
export function validarEncerramento({ atendimento, desfecho } = {}) {
  const erros = [];
  if (!atendimento?.id) erros.push("Atendimento inválido.");
  if (atendimento && !atendimentoAberto(atendimento)) {
    erros.push(`Este atendimento já está ${STATUS_ATENDIMENTO[atendimento.status]?.label?.toLowerCase() || "encerrado"}.`);
  }
  if (!DESFECHO_AMB_POR_CHAVE[desfecho]) erros.push("Escolha o desfecho.");
  return { ok: erros.length === 0, erros };
}

// ── CORREÇÃO ────────────────────────────────────────────────

/**
 * O que a recepção pode corrigir depois de abrir.
 *
 * Tudo aqui é dado ADMINISTRATIVO. Nada clínico entra nesta lista: sinais
 * vitais, classificação de risco e desfecho são registro assistencial e se
 * corrigem por novo registro, não por edição — é a mesma regra que já vale
 * nas evoluções do PEP.
 */
export const CAMPOS_CORRIGIVEIS = [
  "convenio_id", "plano_id", "carteira", "carteira_validade",
  "guia_numero", "autorizacao_senha",
  "tipo_atendimento_cod", "tipo_paciente_cod", "especialidade_cod", "carater_cod",
  "unidade_origem_cod", "local_procedencia_cod", "destino_cod",
  "procedimento_cod", "cid", "acidente_trabalho",
  "origem", "origem_detalhe", "queixa", "observacao",
];

/**
 * Pode corrigir?
 *
 * ⚠️ O PACIENTE NÃO É CORRIGÍVEL, e isso é a regra mais importante daqui.
 * Trocar o `prontuario` de um atendimento parece o conserto óbvio para
 * "abri para a pessoa errada" — e é o pior possível: evolução, prescrição,
 * sinais e exames já gravados passariam a pertencer a outra pessoa, sem
 * nenhum rastro de que mudaram de dono. Paciente errado se resolve
 * cancelando e abrindo de novo.
 */
export function validarCorrecao({ atendimento, campos = {} } = {}) {
  const erros = [];
  const avisos = [];

  if (!atendimento?.id) erros.push("Atendimento inválido.");

  if (atendimento?.status === "cancelado") {
    erros.push("Atendimento cancelado não se corrige — ele deixou de valer. Abra um novo.");
  }

  const chaves = Object.keys(campos);
  if (!chaves.length) erros.push("Nada a corrigir.");

  if ("prontuario" in campos || "paciente" in campos) {
    erros.push("O paciente de um atendimento não pode ser trocado. Evolução, prescrição e exames já gravados passariam a pertencer a outra pessoa sem nenhum rastro. Se abriu para a pessoa errada: cancele este atendimento e abra outro.");
  }

  const proibidas = chaves.filter(k =>
    !CAMPOS_CORRIGIVEIS.includes(k) && k !== "prontuario" && k !== "paciente");
  if (proibidas.length) {
    erros.push(`Estes campos não são corrigíveis por aqui: ${proibidas.join(", ")}. Dado clínico se corrige por novo registro, não por edição.`);
  }

  // Corrigir depois de encerrado é legítimo — o convênio errado só aparece
  // quando a conta é montada, dias depois. Mas quem faz precisa saber que
  // está mexendo em atendimento fechado.
  if (atendimento && atendimento.status === "finalizado") {
    avisos.push("Este atendimento já foi encerrado. A correção vale para o faturamento, mas confira se a conta dele ainda não foi fechada.");
  }

  return { ok: erros.length === 0, erros, avisos };
}

// ── CANCELAMENTO ────────────────────────────────────────────

/**
 * Pode cancelar?
 *
 * ⚠️ ATENDIMENTO COM REGISTRO CLÍNICO NÃO SE CANCELA. Se existe evolução,
 * prescrição, sinal vital ou exame pendurado nele, então o atendimento
 * ACONTECEU — e cancelar deixaria registro clínico órfão, apontando para um
 * episódio que o sistema diz que não existiu. Nesse caso o caminho é
 * encerrar com desfecho, que é a verdade: aconteceu e terminou.
 *
 * Cancelamento serve para o atendimento que nunca deveria ter nascido:
 * duplicado, aberto por engano, aberto e desfeito antes de qualquer ato.
 *
 * `motivo` é obrigatório porque cancelamento sem justificativa é
 * indistinguível de erro de sistema quando alguém audita seis meses depois.
 */
export function validarCancelamento({ atendimento, motivo, registrosClinicos = 0 } = {}) {
  const erros = [];
  const avisos = [];

  if (!atendimento?.id) erros.push("Atendimento inválido.");

  if (atendimento?.status === "cancelado") {
    erros.push("Este atendimento já está cancelado.");
  }

  if (!String(motivo ?? "").trim()) {
    erros.push("Informe o motivo do cancelamento. Sem justificativa, daqui a seis meses ninguém distingue cancelamento de erro do sistema.");
  } else if (String(motivo).trim().length < 5) {
    erros.push("O motivo está curto demais para explicar algo a quem for auditar depois.");
  }

  if (Number(registrosClinicos) > 0) {
    erros.push(`Este atendimento já tem ${registrosClinicos} registro(s) clínico(s). Cancelar deixaria evolução e prescrição apontando para um episódio que o sistema diz que não existiu. Se o atendimento aconteceu, o caminho é encerrar com desfecho.`);
  }

  if (atendimento?.status === "finalizado") {
    avisos.push("Este atendimento já foi encerrado. Cancelar depois do encerramento tira ele da produção do dia — confira se é isso mesmo.");
  }

  return { ok: erros.length === 0, erros, avisos };
}

/**
 * Só os campos permitidos, já limpos.
 *
 * Filtra em vez de confiar em quem chamou: `validarCorrecao` recusa chave
 * proibida, mas se um dia alguém gravar sem validar antes, aqui a chave
 * indevida não passa.
 */
export function camposDaCorrecao(campos = {}) {
  const out = {};
  for (const k of CAMPOS_CORRIGIVEIS) {
    if (!(k in campos)) continue;
    const v = campos[k];
    if (k === "acidente_trabalho") { out[k] = v === true; continue; }
    const s = typeof v === "string" ? v.trim() : v;
    out[k] = s === "" || s === undefined ? null : s;
  }
  return out;
}
