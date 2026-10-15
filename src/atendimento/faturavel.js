// ═══════════════════════════════════════════════════════════
// O QUE FALTA PARA O ATENDIMENTO VIRAR CONTA
//
// Puro: não sabe o que é React nem banco.
//
// 🔴 POR QUE ISTO EXISTE
// A porta principal do hospital produz episódios que a conta nunca
// alcança. O insert do Pronto-Socorro grava sete campos — iniciais,
// prontuário, queixa, origem, detalhe, chegada e status — e nenhum deles
// é fonte pagadora nem procedimento.
//
// Do outro lado, o faturamento procura exatamente isso:
//
//   carregarWorklistFaturamento  → lê convenio_id, procedimento_cod, cid
//   carregarProducaoFaturavel    → filtra procedimento_cod=not.is.null
//
// A escrita mora na Recepção, a leitura no Faturamento, e a porta que gera
// a maior parte dos episódios pula as duas. No banco de teste, os 50
// episódios estão "sem convênio" — e ao tentar montar a conta de um deles
// a tela recusa: "sem fonte pagadora não há conta nem via".
//
// ⚠️ E MESMO ASSIM ISTO NÃO BLOQUEIA O DESFECHO.
// Desfecho é ato de porta: o leito precisa girar, o paciente está indo
// embora, e às vezes é óbito. Travar a saída por causa de campo de
// faturamento inverteria a prioridade da mesma forma que travar o cadastro
// de um politraumatizado para exigir o nome da mãe. O que a tela faz é
// deixar a PENDÊNCIA VISÍVEL e dizer o que ela custa — o mesmo padrão do
// resto do módulo.
//
// ⚠️ O QUE MUDA, ENTÃO? Hoje não há nem onde preencher. Passar a ter o
// campo, com o aviso ao lado, é a diferença entre "ninguém preencheu" e
// "não havia como preencher".
// ═══════════════════════════════════════════════════════════

import { EVASAO, ehEvasao } from "../clinico/desfechos.js";
import { diaLocal } from "../util/datas.js";

const texto = v => String(v ?? "").trim();

/**
 * Desfechos em que o episódio não gera conta, e por isso não se cobra
 * procedimento.
 *
 * Evasão é o caso claro: o paciente saiu sem alta, não houve conduta
 * concluída. Óbito CONTINUA gerando conta — o hospital fez o que fez, e
 * fingir o contrário seria perder produção real num momento em que
 * ninguém vai voltar para corrigir.
 */
// 🔴 "evadiu" (ambulatório) e "evasao" (PS/internação) são a MESMA coisa, e
// esta lista conhecia só uma: o paciente que foi embora antes de ser
// atendido virava conta. O vocabulário agora é único — ver clinico/desfechos.js.
export const SEM_CONTA = EVASAO;

export const geraConta = desfecho => !ehEvasao(texto(desfecho));

/**
 * O que falta para este episódio virar conta.
 *
 * Devolve uma lista de `{ campo, texto }`. Lista vazia = nada a cobrar.
 * Nunca devolve erro: aqui não existe bloqueio, só pendência nomeada.
 */
export function pendenciasDeConta({ atendimento = {}, desfecho } = {}) {
  const d = texto(desfecho) || texto(atendimento.desfecho);
  if (!geraConta(d)) return [];

  const faltas = [];

  if (!texto(atendimento.convenio_id)) {
    faltas.push({
      campo: "convenio_id",
      texto: "Sem fonte pagadora, este atendimento não gera conta — ninguém sabe quem paga.",
    });
  }

  if (!texto(atendimento.procedimento_cod)) {
    faltas.push({
      campo: "procedimento_cod",
      texto: d === "internacao"
        ? "Sem procedimento, a AIH não fecha: é ele que nomeia a internação e define o valor."
        : "Sem procedimento, o atendimento não entra na produção faturável do mês.",
    });
  }

  return faltas;
}

/**
 * A frase única que a tela mostra ao lado do botão de desfecho.
 *
 * `null` quando não há o que dizer — aviso que aparece sempre não é lido.
 *
 * ⚠️ A frase diz a CONSEQUÊNCIA, não a regra. "Preencha o convênio" manda
 * a pessoa obedecer; "este atendimento não vai gerar conta" explica por
 * que vale o trabalho — e é o que faz alguém preencher quando está com
 * pressa.
 */
export function avisoDeConta({ atendimento = {}, desfecho } = {}) {
  const faltas = pendenciasDeConta({ atendimento, desfecho });
  if (!faltas.length) return null;

  const um = faltas.length === 1;
  return {
    campos: faltas.map(f => f.campo),
    texto: `${faltas.length} ${um ? "pendência impede" : "pendências impedem"} o faturamento deste atendimento. ` +
           faltas.map(f => f.texto).join(" ") +
           " Dá para dar o desfecho assim mesmo — o que não dá é alguém descobrir isso no fim do mês.",
  };
}

/**
 * O que gravar no episódio junto com o desfecho.
 *
 * Campo em branco vira `null` e não string vazia: no banco, "" faria
 * "não preenchido" deixar de ser distinguível de "preenchido em branco",
 * e é `not.is.null` que o faturamento usa para achar o que é faturável.
 */
export function dadosDeConta({ convenioId, procedimentoCod, cid } = {}) {
  return {
    convenio_id: texto(convenioId) || null,
    procedimento_cod: texto(procedimentoCod) || null,
    cid: texto(cid) || null,
  };
}

/**
 * Com que valores o formulário do desfecho abre.
 *
 * 🔴 ISTO NÃO É CONFORTO — É O QUE IMPEDE DE APAGAR DADO.
 * O desfecho grava com UPDATE. Se o formulário abrisse vazio e a pessoa não
 * mexesse nos campos, o `null` do formulário vazio iria por cima do convênio
 * que a Recepção já tinha registrado — e o atendimento sairia do faturamento
 * exatamente por causa da tela que veio consertar isso.
 *
 * Abrindo com o que já está gravado, campo em branco volta a significar o
 * que deve significar: alguém apagou de propósito.
 */
export function valoresIniciais(atendimento = {}) {
  return {
    convenioId: texto(atendimento.convenio_id),
    procedimentoCod: texto(atendimento.procedimento_cod),
    cid: texto(atendimento.cid),
  };
}

/**
 * O convênio a sugerir, vindo do último atendimento da mesma pessoa.
 *
 * ⚠️ SUGERIR NÃO É PREENCHER. Quem decide é quem está com a pessoa na
 * frente: convênio muda, carteira vence, e o paciente que veio pelo SUS
 * mês passado pode chegar hoje pelo plano. A sugestão poupa digitação e
 * não afirma nada — a tela mostra de onde ela veio.
 */
export function convenioSugerido(historico = []) {
  const lista = Array.isArray(historico) ? historico : [];
  const comConvenio = lista
    .filter(a => texto(a?.convenio_id))
    .sort((a, b) => texto(b?.chegada_em).localeCompare(texto(a?.chegada_em)));
  if (!comConvenio.length) return null;
  const ultimo = comConvenio[0];
  return {
    convenio_id: texto(ultimo.convenio_id),
    // O plano vem JUNTO porque é filho do convênio e da mesma linha: separar
    // os dois faria a recepção aceitar a sugestão e ainda ter de escolher o
    // plano à mão, que é metade do trabalho que a sugestão vinha poupar.
    plano_id: texto(ultimo.plano_id),
    de: diaLocal(ultimo.chegada_em),
  };
}

/**
 * A sugestão depois de conferida contra o catálogo de HOJE. `null` = não há
 * o que sugerir.
 *
 * 🔴 Sugestão vem do passado; catálogo é do presente. Um convênio
 * descredenciado some de `catalogos.convenios` mas continua gravado nos
 * atendimentos antigos — oferecê-lo mandaria a recepção abrir a conta para
 * quem não paga mais, e o episódio só seria recusado no processamento.
 *
 * O plano cai sozinho quando não pertence mais àquele convênio (renomeado,
 * desativado, migrado): aí sugere-se o convênio e deixa-se o plano em
 * branco, que é a parte verdadeira da sugestão.
 */
export function sugestaoUtil(sugestao, catalogos = {}) {
  const id = texto(sugestao?.convenio_id);
  if (!id) return null;
  const convenio = (catalogos.convenios || []).find(c => texto(c?.id) === id);
  if (!convenio) return null;
  const planoId = texto(sugestao?.plano_id);
  const plano = planoId
    ? (catalogos.planos || []).find(p => texto(p?.id) === planoId && texto(p?.convenio_id) === id)
    : null;
  return {
    convenio_id: id,
    plano_id: plano ? planoId : "",
    de: sugestao?.de ?? null,
    nome: texto(convenio.nome) || `convênio ${id}`,
    nomePlano: plano ? texto(plano.nome) : "",
  };
}
