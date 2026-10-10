// ═══════════════════════════════════════════════════════════
// A DESCRIÇÃO CIRÚRGICA — as regras do documento
//
// 🔴 O DOCUMENTO QUE A LEI NOMEIA E QUE NÃO EXISTIA.
//
// A CFM 1.638/2002 lista o conteúdo mínimo do prontuário e, para o paciente
// operado, nomeia três documentos: DESCRIÇÃO CIRÚRGICA, ficha anestésica e
// ficha de recuperação pós-anestésica. O que havia aqui era
// `cc_cirurgias.observacao` — texto livre, opcional, único, sobrescrevível e
// sem autoria. O ato de maior risco do hospital terminava com um horário de
// fim gravado e nenhum registro do que foi feito.
//
// 🔴 E O QUE FOI FEITO PODE NÃO SER O QUE FOI MARCADO.
// Videolaparoscopia que converte para laparotomia é outro porte, outro
// código, outra conta. O motor de faturamento cobra
// `cc_cirurgias.procedimento_cod`, que é o do AGENDAMENTO: sem onde
// registrar o realizado, o sistema fatura o que foi marcado e a conta fecha
// batendo com o agendamento — errada e silenciosa. `codigoParaFaturar` é o
// desempate, e a conta passa a dizer de onde o código saiu.
//
// ⚠️ CORREÇÃO É VERSÃO NOVA, NUNCA EDIÇÃO — a mesma regra do resto do
// registro clínico deste sistema, e a regra do CFM: prontuário não se
// rasura. A VIGENTE é a que ninguém corrigiu depois; as outras continuam
// legíveis, que é o ponto de guardá-las.
// ═══════════════════════════════════════════════════════════

import { MOTIVO_MIN } from "./cirurgia-segura.js";
import { diaLocal } from "../util/datas.js";
import { naoDeuParaLer } from "../util/leitura.js";

/**
 * O mínimo de uma narrativa que informa algo.
 *
 * 40 caracteres é pouco para uma cirurgia e suficiente para a frase mais
 * curta que ainda diz alguma coisa ("Colecistectomia videolaparoscópica sem
 * intercorrências" tem 54). O banco tem o mesmo número em
 * `cc_desc_narrativa_ck` — tela não é defesa, e um POST pela API passa por
 * cima dela.
 */
export const MIN_NARRATIVA = 40;

/** O mesmo mínimo de motivo do pulo do checklist — um número, não dois. */
export { MOTIVO_MIN };

/**
 * VIA DE ACESSO — domínio FECHADO, pela mesma razão da lateralidade.
 *
 * É a via que define a taxa de conversão do bloco, e "VLP", "video", "lapa"
 * e "videolaparoscópica" na mesma coluna tornam o indicador impossível. O
 * detalhe anatômico vai na narrativa, que é prosa por natureza. O banco tem
 * a mesma lista em `cc_desc_via_ck`.
 */
export const VIAS_ACESSO = Object.freeze([
  { chave: "videolaparoscopica", label: "Videolaparoscópica" },
  { chave: "aberta",             label: "Aberta / convencional" },
  { chave: "robotica",           label: "Robótica" },
  { chave: "endoscopica",        label: "Endoscópica" },
  { chave: "percutanea",         label: "Percutânea" },
  { chave: "transvaginal",       label: "Transvaginal" },
  { chave: "outra",              label: "Outra" },
]);

export const VIA_LABEL = Object.freeze(
  Object.fromEntries(VIAS_ACESSO.map(v => [v.chave, v.label])));

/** Os estados em que já houve ato a descrever. */
export const STATUS_OPERADO = Object.freeze(["em_cirurgia", "recuperacao", "concluida"]);

/**
 * Já entrou em sala? `entrada_sala_em` é a prova; o status é a queda para
 * quem registrou o horário depois. A mesma regra do gatilho — se as duas
 * divergirem, a tela libera o que o banco recusa, e a pessoa escreve o
 * documento inteiro para perdê-lo no salvar.
 */
export function jaOperou(cirurgia) {
  if (!cirurgia) return false;
  if (cirurgia.entrada_sala_em) return true;
  return STATUS_OPERADO.includes(cirurgia.status);
}

/**
 * A VERSÃO VIGENTE: a que ninguém corrigiu depois.
 *
 * ⚠️ `null` quando a leitura falhou, e isso NÃO é o mesmo que "não tem
 * descrição". Sem a diferença, uma oscilação de rede faria a tela oferecer
 * "registrar descrição" numa cirurgia que já tem uma — e o banco recusaria
 * depois de a pessoa ter escrito tudo.
 */
export function versaoVigente(linhas) {
  if (naoDeuParaLer(linhas)) return null;
  if (!Array.isArray(linhas) || !linhas.length) return undefined;
  const corrigidas = new Set(linhas.map(l => l.corrige_id).filter(x => x != null).map(String));
  const vivas = linhas.filter(l => !corrigidas.has(String(l.id)));
  // Empate não deveria existir (o índice único impede a cadeia de
  // ramificar). Se existir, a de maior versão é a mais nova — e a tela
  // mostra o histórico inteiro de todo jeito.
  return vivas.sort((a, b) => (b.versao || 0) - (a.versao || 0))[0] || undefined;
}

/** A cadeia da mais nova para a mais antiga, para a tela mostrar o histórico. */
export function historico(linhas = []) {
  if (!Array.isArray(linhas)) return [];
  return [...linhas].sort((a, b) => (b.versao || 0) - (a.versao || 0));
}

/**
 * Confere o formulário ANTES de mandar — e repete as travas do banco de
 * propósito: o banco recusa com a frase do Postgres, que não serve para
 * quem acabou de escrever três parágrafos.
 */
export function conferirDescricao({ cirurgia, form = {}, corrigindo = null } = {}) {
  const erros = [], avisos = [];
  const txt = v => String(v ?? "").trim();

  if (!cirurgia) erros.push("Sem cirurgia selecionada.");
  else if (cirurgia.status === "cancelada")
    erros.push("Esta cirurgia está CANCELADA. Não existe descrição cirúrgica de um ato que não aconteceu.");
  else if (!jaOperou(cirurgia))
    erros.push("Esta cirurgia ainda não entrou em sala. Descrição escrita antes do ato é documento pré-datado — registre a entrada em sala primeiro.");

  if (!txt(form.procedimento_realizado))
    erros.push("Diga qual procedimento foi REALIZADO — é ele que vale, não o que estava agendado.");

  const narrativa = txt(form.descricao);
  if (narrativa.length < MIN_NARRATIVA)
    erros.push(`A descrição tem ${narrativa.length} caracteres. Descreva o ato: via, achados, o que foi feito e como terminou (mínimo ${MIN_NARRATIVA}).`);

  if (form.conversao && txt(form.conversao_motivo).length < MOTIVO_MIN)
    erros.push(`Conversão de via exige o motivo (mínimo ${MOTIVO_MIN} caracteres). "Convertida" sem porquê não ensina nada a quem revisar o indicador.`);

  if (txt(form.amostras) && form.amostra_enviada == null)
    erros.push("Você descreveu peça cirúrgica. Diga se ela foi ENVIADA — é assim que um anatomopatológico se perde: todo mundo supõe que alguém levou.");

  if (corrigindo && txt(form.motivo_correcao).length < MOTIVO_MIN)
    erros.push(`Correção exige o motivo (mínimo ${MOTIVO_MIN} caracteres): o que estava errado na versão anterior.`);

  const sang = form.sangramento_ml;
  if (sang != null && sang !== "" && (!Number.isFinite(Number(sang)) || Number(sang) < 0))
    erros.push("Sangramento estimado tem de ser um número de mililitros, nunca negativo.");

  // ── avisos: entram, mas custam ──────────────────────────────
  if (!txt(form.procedimento_cod))
    avisos.push("Sem código do procedimento realizado, a conta continua cobrando o código do AGENDAMENTO. Se o que foi feito é outro, a conta sai errada.");
  else if (cirurgia?.procedimento_cod && txt(form.procedimento_cod) !== txt(cirurgia.procedimento_cod))
    avisos.push(`O código realizado (${txt(form.procedimento_cod)}) é diferente do agendado (${cirurgia.procedimento_cod}). A conta passará a usar o REALIZADO — é o que se cobra.`);

  if (form.conversao && txt(form.procedimento_cod) && cirurgia?.procedimento_cod
      && txt(form.procedimento_cod) === txt(cirurgia.procedimento_cod))
    avisos.push("Converteu a via e manteve o código do agendamento. Confira: conversão quase sempre muda o porte, e o porte é o valor da conta.");

  if (txt(form.amostras) && form.amostra_enviada === false)
    avisos.push("Peça descrita e NÃO enviada. Isto fica registrado como pendência — resolva antes de a peça virar o achado que ninguém encontra.");

  if (Number(sang) >= 500 && form.hemotransfusao == null)
    avisos.push("Sangramento de 500 ml ou mais: diga se houve hemotransfusão. É dado de risco do próximo ato anestésico.");

  return { ok: !erros.length, erros, avisos };
}

/** A linha para gravar, a partir do formulário conferido. */
export function linhaDaDescricao({ cirurgia, form = {}, corrigindo = null, assinatura = null } = {}) {
  const txt = v => { const s = String(v ?? "").trim(); return s || null; };
  const num = v => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  return {
    cirurgia_id: cirurgia?.id ?? null,
    // ⚠️ `versao` NÃO vai daqui. Quem calcula é o gatilho, sob lock: dois
    // navegadores mandariam a mesma e a cadeia nasceria com duas versões 2.
    corrige_id: corrigindo?.id ?? null,
    motivo_correcao: corrigindo ? txt(form.motivo_correcao) : null,
    procedimento_realizado: txt(form.procedimento_realizado),
    procedimento_cod: txt(form.procedimento_cod),
    via_acesso: txt(form.via_acesso),
    conversao: !!form.conversao,
    conversao_motivo: form.conversao ? txt(form.conversao_motivo) : null,
    achados: txt(form.achados),
    descricao: txt(form.descricao),
    intercorrencias: txt(form.intercorrencias),
    cid_pos: txt(form.cid_pos),
    sangramento_ml: num(form.sangramento_ml),
    hemotransfusao: form.hemotransfusao == null ? null : !!form.hemotransfusao,
    drenos: txt(form.drenos),
    amostras: txt(form.amostras),
    // Só responde sobre o envio quem descreveu peça — `false` sem peça
    // nenhuma viraria uma pendência inventada no painel.
    amostra_enviada: txt(form.amostras) ? !!form.amostra_enviada : null,
    assinatura: txt(assinatura),
  };
}

/**
 * 🔴 O CÓDIGO QUE A CONTA DEVE COBRAR.
 *
 * O realizado vence o agendado — é o ato que aconteceu. Devolve também a
 * FONTE, porque a tela precisa poder dizer de onde o número saiu: faturista
 * que vê um código diferente do agendamento e não sabe por quê desconfia do
 * sistema, e com razão.
 */
export function codigoParaFaturar(cirurgia, descricao) {
  const agendado = String(cirurgia?.procedimento_cod ?? "").trim() || null;
  const realizado = String(descricao?.procedimento_cod ?? "").trim() || null;
  if (realizado) {
    return {
      codigo: realizado,
      fonte: "descrição cirúrgica",
      divergente: !!agendado && realizado !== agendado,
    };
  }
  return { codigo: agendado, fonte: agendado ? "agendamento" : null, divergente: false };
}

/**
 * As cirurgias que saíram da sala e não têm descrição.
 *
 * ⚠️ Usa o SELO `descricao_em` e não a contagem de documentos: o painel do
 * dia recarrega a cada 30s, e ler a tabela de documentos de doze cartões
 * seria doze pedidos. O gatilho mantém o selo no mesmo insert.
 */
export function semDescricao(cirurgias = []) {
  if (!Array.isArray(cirurgias)) return [];
  return cirurgias.filter(c => jaOperou(c) && c.status !== "cancelada" && !c.descricao_em);
}

/**
 * Há quantas horas esta cirurgia saiu da sala sem descrição? `null` quando
 * não há hora de saída registrada — e `null` não é zero.
 */
export function horasSemDescricao(cirurgia, agora = new Date()) {
  const fim = cirurgia?.saida_sala_em || cirurgia?.fim_cirurgia_em || null;
  if (!fim || cirurgia?.descricao_em) return null;
  const t = new Date(fim).getTime();
  if (!Number.isFinite(t)) return null;
  const h = (agora.getTime() - t) / 3_600_000;
  return h < 0 ? null : Math.floor(h);
}

/**
 * A linha do antecedente cirúrgico, para o Paciente 360.
 *
 * O que o médico que atende seis meses depois procura, nesta ordem: o que
 * foi feito, quando, por qual via, e se houve intercorrência. O nome de quem
 * operou entra porque é a quem se pergunta.
 */
export function linhaDoAntecedente({ cirurgia, equipe = [], descricao = null } = {}) {
  const cirurgiao = (Array.isArray(equipe) ? equipe : [])
    .find(m => m?.papel === "cirurgiao");
  const feito = String(descricao?.procedimento_realizado ?? "").trim()
    || String(cirurgia?.procedimento ?? "").trim() || "procedimento não descrito";
  const via = descricao?.via_acesso ? VIA_LABEL[descricao.via_acesso] || descricao.via_acesso : null;
  return {
    id: cirurgia?.id ?? null,
    dia: diaLocal(cirurgia?.inicio_cirurgia_em || cirurgia?.entrada_sala_em) || cirurgia?.data || null,
    procedimento: feito,
    via,
    convertida: !!descricao?.conversao,
    cirurgiao: cirurgiao ? (cirurgiao.nome || cirurgiao.usuario || null) : null,
    intercorrencias: String(descricao?.intercorrencias ?? "").trim() || null,
    cid_pos: String(descricao?.cid_pos ?? "").trim() || null,
    // 🔴 A ausência é informação, e aparece na tela como ausência: cirurgia
    // feita sem descrição é buraco no prontuário, não "cirurgia simples".
    temDescricao: !!descricao,
    cancelada: cirurgia?.status === "cancelada",
    semAto: !jaOperou(cirurgia) && cirurgia?.status !== "cancelada",
  };
}

/** Uma frase do documento, para o resumo de passagem de plantão. */
export function resumoDaDescricao(linha) {
  if (!linha) return null;
  const partes = [linha.procedimento];
  if (linha.via) partes.push(`via ${linha.via.toLowerCase()}`);
  if (linha.convertida) partes.push("CONVERTIDA");
  if (linha.cirurgiao) partes.push(`por ${linha.cirurgiao}`);
  if (linha.intercorrencias) partes.push(`intercorrências: ${linha.intercorrencias}`);
  return partes.join(", ");
}
