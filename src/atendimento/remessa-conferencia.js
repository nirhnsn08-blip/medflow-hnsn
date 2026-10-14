// ═══════════════════════════════════════════════════════════
// O QUE O SUS VAI REJEITAR — conferido ANTES de transmitir
//
// Puro: não sabe o que é React nem banco.
//
// 🔴 POR QUE ISTO EXISTE
//
// `validarTransmissao` confere o ATO de registrar a remessa: competência,
// data, protocolo, se há conta fechada. Nada conferia se as CONTAS carregam
// o que o registro do SUS exige — e é por falta desses campos que a
// produção volta rejeitada.
//
// Medido em 14/10/2026: `raca_cor` e `end_municipio_ibge` são lidos ZERO
// vezes em todo o módulo de faturamento. São obrigatórios na AIH e no
// BPA-I. O hospital coleta os dois no cadastro, fecha a conta, transmite —
// e descobre no mês seguinte, quando o paciente já foi embora e ninguém
// lembra de perguntar a cor da pele dele por telefone.
//
// ⚠️⚠️ ISTO NÃO PROMETE ACEITAÇÃO, E A DIFERENÇA É O PONTO.
//
// O sistema NÃO gera o arquivo de remessa — recusa deliberada e documentada
// em `faturamento.js`: layout versionado, muda por portaria, passa por
// homologação. Então aqui não se diz "esta conta será aceita". Diz-se
// "estas serão REJEITADAS", que é uma afirmação que se pode sustentar sem
// ter o layout na mão: os CAMPOS exigidos são estáveis mesmo quando o
// desenho do registro muda.
//
// Uma lista vazia de pendências significa "não achei motivo de rejeição
// entre os que sei conferir" — nunca "está pronto". A tela diz isso com
// essas palavras, de propósito.
//
// ⚠️ ONDE SE CONSERTA entra em cada pendência. Quem transmite não é quem
// cadastra o paciente nem quem lança o item: mandar a faturista "corrigir
// a raça/cor" sem dizer que isso mora no cadastro é mandá-la procurar.
// ═══════════════════════════════════════════════════════════

import { validarCNS } from "../pacientes/identidade.js";
import { naoDeuParaLer } from "../util/leitura.js";

/** Onde a pessoa vai consertar. Não é rótulo: é endereço. */
export const ONDE = {
  CADASTRO: "cadastro do paciente",
  FICHA: "ficha do atendimento",
  CONTA: "itens da conta",
};

/**
 * O que REJEITA o registro × o que provavelmente vira GLOSA.
 *
 * ⚠️ Os dois aparecem, e separados. Juntar faria a faturista tratar as
 * quinze pendências com a mesma pressa, e as que rejeitam são as que fazem
 * a produção do mês inteiro voltar.
 */
export const REJEITA = "rejeita";
export const RISCO = "risco";

const texto = v => String(v ?? "").trim();

/**
 * Município IBGE: SETE dígitos.
 *
 * ⚠️ Seis é o código SEM o dígito verificador, e é o engano comum — a
 * tabela do IBGE circula das duas formas. Seis dígitos num campo de sete
 * não dá erro de digitação em lugar nenhum; dá registro rejeitado.
 */
export function ibgeValido(v) {
  return /^\d{7}$/.test(texto(v));
}

/**
 * As exigências por via.
 *
 * ⚠️ A AIH pede mais que o BPA porque é internação: nome da mãe e CID
 * principal entram no registro dela. Tratar as duas igual faria o BPA
 * acusar falta de CID em consulta ambulatorial — e aviso que acende errado
 * é aviso que se aprende a ignorar.
 */
export function exigenciasDaVia(via) {
  const v = texto(via).toLowerCase();
  const base = { cns: true, raca: true, ibge: true, nascimento: true, sexo: true, cbo: true };
  if (v === "aih") return { ...base, nomeMae: true, cid: true };
  if (v === "apac") return { ...base, cid: true };
  return base;   // bpa e o que mais vier
}

const p = (chave, severidade, campo, oque, onde) => ({ chave, severidade, campo, texto: oque, onde });

/**
 * As pendências de UMA conta. Lista vazia = não achei motivo de rejeição
 * entre os que sei conferir.
 *
 * `paciente` ausente NÃO devolve lista vazia: devolve a pendência de que o
 * paciente não foi encontrado. Conta sem paciente casado é o caso em que
 * "nada a apontar" seria a resposta mais errada possível.
 */
export function pendenciasDaConta({ conta, paciente, atendimento, itens = [] } = {}) {
  if (!conta) return [];
  const out = [];
  const ex = exigenciasDaVia(conta.via);

  if (!paciente) {
    out.push(p("sem_paciente", REJEITA, "paciente",
      `Não encontrei o cadastro do prontuário ${texto(conta.prontuario) || "(em branco)"}. ` +
      "Sem o cadastro não dá para conferir CNS, raça/cor nem município — e o registro leva esses campos.",
      ONDE.CADASTRO));
    return out;
  }

  // ── CNS ──
  const cns = texto(paciente.cns);
  if (ex.cns && !cns) {
    out.push(p("sem_cns", REJEITA, "CNS",
      "Sem Cartão Nacional de Saúde. É a identificação do paciente no registro do SUS.", ONDE.CADASTRO));
  } else if (ex.cns && !validarCNS(cns)) {
    // 🔴 PRESENTE ≠ VÁLIDO. `conferirFicha` olhava só a presença; um CNS
    // digitado errado passava por lá e é rejeitado no processamento.
    out.push(p("cns_invalido", REJEITA, "CNS",
      "O CNS está preenchido mas os dígitos verificadores não conferem — foi digitado errado.", ONDE.CADASTRO));
  }

  // ── Raça/cor ──
  if (ex.raca && !texto(paciente.raca_cor)) {
    out.push(p("sem_raca", REJEITA, "raça/cor",
      "Sem raça/cor. É campo obrigatório do registro, e depois da alta ninguém liga para o paciente para perguntar.",
      ONDE.CADASTRO));
  }

  // ── Município IBGE ──
  const ibge = texto(paciente.end_municipio_ibge);
  if (ex.ibge && !ibge) {
    out.push(p("sem_ibge", REJEITA, "município (IBGE)",
      "Sem código IBGE do município de residência. É por ele que o SUS sabe de onde veio o paciente.",
      ONDE.CADASTRO));
  } else if (ex.ibge && !ibgeValido(ibge)) {
    out.push(p("ibge_invalido", REJEITA, "município (IBGE)",
      `O código IBGE "${ibge}" não tem 7 dígitos. Seis é o código SEM o dígito verificador — a tabela do IBGE circula das duas formas.`,
      ONDE.CADASTRO));
  }

  // ── Identificação básica ──
  if (ex.nascimento && !texto(paciente.data_nascimento)) {
    out.push(p("sem_nascimento", REJEITA, "data de nascimento",
      "Sem data de nascimento. O registro calcula a idade por ela, e a idade entra na compatibilidade do procedimento.",
      ONDE.CADASTRO));
  }
  if (ex.sexo && !texto(paciente.sexo)) {
    out.push(p("sem_sexo", REJEITA, "sexo",
      "Sem sexo no cadastro. Vários procedimentos do SIGTAP são restritos por sexo e o registro é recusado sem ele.",
      ONDE.CADASTRO));
  }
  if (ex.nomeMae && !texto(paciente.nome_mae)) {
    out.push(p("sem_nome_mae", REJEITA, "nome da mãe",
      "Sem nome da mãe. A AIH leva esse campo — é parte da identificação de quem internou.", ONDE.CADASTRO));
  }

  // ── CID ──
  if (ex.cid && !texto(atendimento?.cid)) {
    out.push(p("sem_cid", REJEITA, "CID principal",
      "Sem CID principal no atendimento. É o diagnóstico que justifica a internação, e o registro não fecha sem ele.",
      ONDE.FICHA));
  }

  // ── CBO do executante, item a item ──
  //
  // ⚠️ Conferido por ITEM e não por conta: a conta pode ter dez itens e só
  // um sem CBO, e dizer "falta CBO" sem dizer em quantos manda a faturista
  // reabrir tudo.
  const lista = Array.isArray(itens) ? itens.filter(Boolean) : [];
  if (ex.cbo && lista.length) {
    const semCbo = lista.filter(i => !texto(i.executante_cbo));
    if (semCbo.length) {
      out.push(p("sem_cbo", REJEITA, "CBO do executante",
        `${semCbo.length} de ${lista.length} ${semCbo.length === 1 ? "item está" : "itens estão"} sem CBO do executante. ` +
        "É o código da ocupação de quem fez — sem ele o item não é pago.", ONDE.CONTA));
    }
    const semExecutante = lista.filter(i => !texto(i.executante));
    if (semExecutante.length) {
      out.push(p("sem_executante", RISCO, "executante",
        `${semExecutante.length} ${semExecutante.length === 1 ? "item sem" : "itens sem"} o nome de quem executou. ` +
        "Não derruba o registro, mas é a primeira coisa que a auditoria pede.", ONDE.CONTA));
    }
    const semCodigo = lista.filter(i => !texto(i.codigo));
    if (semCodigo.length) {
      out.push(p("sem_codigo", REJEITA, "código do procedimento",
        `${semCodigo.length} ${semCodigo.length === 1 ? "item está" : "itens estão"} sem código SIGTAP. ` +
        "Item sem código não existe para o SUS.", ONDE.CONTA));
    }
  } else if (ex.cbo && !lista.length) {
    out.push(p("conta_vazia", REJEITA, "itens",
      "A conta está fechada e não tem item nenhum. Uma remessa com conta vazia é produção que não existe.",
      ONDE.CONTA));
  }

  return out;
}

/**
 * A conferência da remessa inteira.
 *
 * 🔴 `null` QUANDO QUALQUER LEITURA FALHOU. "Nenhuma pendência" é a frase
 * mais tranquilizadora desta tela, e ela não pode sair de uma lista de
 * pacientes que não desceu — seria o sistema dizendo "pode transmitir"
 * porque não conseguiu olhar.
 */
export function conferirRemessa({ contas, pacientes, atendimentos = [], itens = [] } = {}) {
  if (naoDeuParaLer(contas) || naoDeuParaLer(pacientes)
      || naoDeuParaLer(atendimentos) || naoDeuParaLer(itens)) return null;

  const lista = (Array.isArray(contas) ? contas : []).filter(Boolean);
  const porProntuario = new Map((Array.isArray(pacientes) ? pacientes : [])
    .filter(Boolean).map(x => [texto(x.prontuario), x]));
  const porAtendimento = new Map((Array.isArray(atendimentos) ? atendimentos : [])
    .filter(Boolean).map(a => [String(a.id), a]));
  const itensPorConta = new Map();
  for (const i of (Array.isArray(itens) ? itens : []).filter(Boolean)) {
    const k = String(i.conta_id);
    if (!itensPorConta.has(k)) itensPorConta.set(k, []);
    itensPorConta.get(k).push(i);
  }

  const avaliadas = lista.map(conta => {
    const pend = pendenciasDaConta({
      conta,
      paciente: porProntuario.get(texto(conta.prontuario)) || null,
      atendimento: porAtendimento.get(String(conta.atendimento_id)) || null,
      itens: itensPorConta.get(String(conta.id)) || [],
    });
    return {
      conta, pendencias: pend,
      rejeita: pend.filter(x => x.severidade === REJEITA),
      risco: pend.filter(x => x.severidade === RISCO),
    };
  });

  // Por MOTIVO, porque é assim que se conserta: trinta contas sem raça/cor
  // é uma tarefa só, e trinta linhas "conta #X tem pendência" são trinta.
  const porMotivo = new Map();
  for (const a of avaliadas) {
    for (const x of a.pendencias) {
      if (!porMotivo.has(x.chave)) {
        porMotivo.set(x.chave, { ...x, contas: [] });
      }
      porMotivo.get(x.chave).contas.push(a.conta);
    }
  }

  const bloqueadas = avaliadas.filter(a => a.rejeita.length);
  return {
    total: avaliadas.length,
    avaliadas,
    bloqueadas,
    semMotivoConhecido: avaliadas.filter(a => !a.rejeita.length).length,
    motivos: [...porMotivo.values()]
      .sort((a, b) => b.contas.length - a.contas.length
        || (a.severidade === REJEITA ? -1 : 1)),
  };
}

/**
 * A frase do cabeçalho.
 *
 * ⚠️ NUNCA diz "pronto para transmitir". O sistema não tem o layout do
 * arquivo e não pode prometer aceitação — o que ele sabe é o que REJEITA.
 */
export function resumoDaConferencia(r) {
  if (!r) return "Não foi possível conferir as contas desta remessa. A tela está INCOMPLETA — não dá para dizer o que o SUS vai recusar.";
  if (!r.total) return "Nenhuma conta nesta seleção.";
  if (!r.bloqueadas.length) {
    return `${r.total} ${r.total === 1 ? "conta" : "contas"} sem motivo conhecido de rejeição. ` +
      "Isso não é garantia de aceitação: o sistema confere os campos, não o layout do arquivo.";
  }
  return `${r.bloqueadas.length} de ${r.total} ${r.bloqueadas.length === 1 ? "conta será recusada" : "contas serão recusadas"} ` +
    "pelo que falta nelas. Corrigir antes de transmitir é o que evita a produção voltar no mês seguinte.";
}
