// ═══════════════════════════════════════════════════════════
// O RASCUNHO DA PRESCRIÇÃO — o que o médico monta antes de assinar
//
// 🔴 ESTAS REGRAS ERAM EXPRESSÕES DENTRO DE `addItemPrescricao` e
// `assinarPrescricao`, no meio do modal, sem teste. Uma delas compõe o TEXTO
// que vira o registro clínico imutável da prescrição — o documento que fica
// no prontuário e que ninguém pode editar depois.
//
// ⚠️ O RASCUNHO NÃO É DA ABA, É DO ATENDIMENTO. Ele mora no modal, e não
// dentro da aba de Prescrição, de propósito: um médico que montou três
// medicamentos e foi olhar um resultado de exame não pode voltar e encontrar
// o formulário vazio. É por isso que estas funções são puras e o estado fica
// um nível acima — a aba desmonta ao trocar de aba, o rascunho não.
// ═══════════════════════════════════════════════════════════

import { farmFmtQtd } from "../clinico/alertas.js";
import { FARM_CLASSES } from "../farmacia/catalogo.js";
import { freqDia } from "./apoio.js";
import { estoqueSinal } from "./prescricao.js";

/**
 * Monta o item a partir do medicamento escolhido e do formulário.
 *
 * ⚠️ CAMPO VAZIO VIRA `null`, NUNCA ZERO. `Number("")` é 0, e uma duração de
 * "0 dias" ou uma dose de "0 mg" gravadas por engano são prescrições que
 * dizem algo — diferente de não dizer nada. O prontuário precisa saber a
 * diferença entre "sem duração definida" e "por zero dias".
 */
export function montarItem(med, form) {
  if (!med) return null;
  const f = form || {};
  const num = v => (v === "" || v == null ? null : Number(v));
  return {
    medicamento_id: med.id,
    medicamento_nome: med.nome,
    unidade: med.unidade || null,
    dose: descricaoDaDose(f) || null,
    dose_valor: num(f.dose_valor),
    dose_unidade: f.dose_unidade || null,
    frequencia_dia: freqDia(f.freqLabel),
    duracao_dias: num(f.duracao),
    via: f.via,
    quantidade: f.quantidade,
  };
}

/**
 * A dose em uma linha: "500 mg · 8/8h (3x) · por 7 dia(s)".
 *
 * ⚠️ PARTE AUSENTE SOME DA LINHA, não vira "undefined" nem "0". Uma dose
 * escrita como "500 undefined" no prontuário é pior que uma dose sem unidade:
 * a primeira parece defeito e a segunda parece o que é, uma informação que
 * faltou.
 */
export function descricaoDaDose(form) {
  const f = form || {};
  return [
    f.dose_valor && `${f.dose_valor} ${f.dose_unidade || ""}`.trim(),
    f.freqLabel,
    f.duracao && `por ${f.duracao} dia(s)`,
  ].filter(Boolean).join(" · ");
}

/**
 * O formulário depois de adicionar um item.
 *
 * 🔴 UNIDADE, FREQUÊNCIA E VIA PERMANECEM; o resto limpa. Quem prescreve três
 * antibióticos de 8 em 8 horas por via oral não deve redigitar isso três
 * vezes — e redigitar é onde nasce o erro de digitação em campo de dose.
 * O medicamento, a dose, a duração e a quantidade SEMPRE limpam: repetir a
 * dose do item anterior no próximo é como um erro entra sem ninguém ver.
 */
export function formAposAdicionar(form) {
  const f = form || {};
  return {
    medId: "",
    dose_valor: "",
    dose_unidade: f.dose_unidade,
    freqLabel: f.freqLabel,
    via: f.via,
    duracao: "",
    quantidade: "",
  };
}

/**
 * 🔴 O TEXTO QUE VIRA O REGISTRO CLÍNICO IMUTÁVEL.
 *
 * É o que fica no prontuário e o que se lê se a tabela de itens
 * estruturados falhar. Por isso ele repete, em português, tudo o que os
 * campos estruturados guardam: medicamento, dose, via e quantidade.
 */
export function textoDaPrescricao(itens, obs) {
  const linhas = (Array.isArray(itens) ? itens : []).filter(Boolean).map(it =>
    `• ${it.medicamento_nome}` +
    (it.dose ? ` — ${it.dose}` : "") +
    (it.via ? ` (${it.via})` : "") +
    (it.quantidade ? ` — qtd ${farmFmtQtd(it.quantidade)}${it.unidade ? " " + it.unidade : ""}` : ""));
  const rodape = String(obs || "").trim();
  return (linhas.join("\n") + (rodape ? `\nObs.: ${rodape}` : "")).trim();
}

/**
 * Itens do rascunho que a farmácia não vai conseguir dispensar.
 *
 * ⚠️ É AVISO, NÃO BLOQUEIO. Prescrever o que está em falta é uma decisão
 * clínica legítima — o medicamento pode chegar, ou ser comprado. O que não
 * pode é o médico descobrir a falta pela boca do paciente horas depois.
 */
export function itensSemEstoque(itens, catalogoPorId, lotes) {
  const cat = catalogoPorId || {};
  return (Array.isArray(itens) ? itens : [])
    .filter(it => it && estoqueSinal(cat[it.medicamento_id], lotes)?.key === "zerado");
}

/**
 * Pode assinar?
 *
 * ⚠️ OBSERVAÇÃO SOZINHA VALE. Prescrição só de cuidados ("manter em jejum",
 * "elevar cabeceira") é prescrição de verdade e precisa ficar no prontuário
 * com hora e assinatura, mesmo sem nenhum medicamento.
 */
export function podeAssinar(itens, obs) {
  const temItem = Array.isArray(itens) && itens.length > 0;
  return temItem || String(obs || "").trim().length > 0;
}

/**
 * As linhas do item já assinado, prontas para gravar.
 *
 * ⚠️ `registro_id` VEM DE FORA e é obrigatório: item sem registro pai é
 * medicamento que a farmácia enxerga e o prontuário não. Quem chama tem que
 * ter conferido que o registro foi criado antes de chegar aqui.
 */
export function linhasParaGravar(itens, atendimentoId, registroId) {
  if (registroId == null) throw new Error("linhasParaGravar exige o registro_id do registro clínico já criado.");
  return (Array.isArray(itens) ? itens : []).filter(Boolean).map(it => ({
    atendimento_id: atendimentoId,
    registro_id: registroId,
    medicamento_id: it.medicamento_id || null,
    medicamento_nome: it.medicamento_nome,
    unidade: it.unidade || null,
    dose: it.dose || null,
    dose_valor: it.dose_valor ?? null,
    dose_unidade: it.dose_unidade || null,
    frequencia_dia: it.frequencia_dia ?? null,
    duracao_dias: it.duracao_dias ?? null,
    via: it.via || null,
    quantidade: it.quantidade ? Number(it.quantidade) : null,
  }));
}

/**
 * 🔴 OS GRUPOS DO SELETOR DE MEDICAMENTO — NENHUM SOME.
 *
 * A tela montava os `optgroup` percorrendo `FARM_CLASSES` e emitindo só as
 * classes daquela constante. Um medicamento cadastrado com uma classe que não
 * está na lista — "Antineoplásicos", "Imunossupressores", um nome digitado
 * diferente — desaparecia do seletor SEM MENSAGEM NENHUMA: impossível de
 * prescrever pelo PS, e sem nada em tela dizendo por quê.
 *
 * ⚠️ A ORDEM CONHECIDA É MANTIDA. `FARM_CLASSES` está em ordem clínica
 * pensada (analgésico antes de antibiótico antes de vasoativo), e ordenar
 * tudo em alfabética jogaria fora essa decisão. As classes desconhecidas
 * entram DEPOIS, em ordem alfabética entre si, para serem previsíveis.
 */
export function gruposDoCatalogo(catalogo) {
  const ativos = (Array.isArray(catalogo) ? catalogo : []).filter(m => m && m.ativo !== false);
  const presentes = new Set(ativos.map(m => m.classe || "Outros"));
  const conhecidas = FARM_CLASSES.filter(c => presentes.has(c));
  const resto = [...presentes].filter(c => !FARM_CLASSES.includes(c)).sort((a, b) => a.localeCompare(b, "pt-BR"));
  return [...conhecidas, ...resto].map(classe => ({
    classe,
    itens: ativos.filter(m => (m.classe || "Outros") === classe),
  }));
}
