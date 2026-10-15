// ═══════════════════════════════════════════════════════════
// CORRIGIR O DESFECHO — a regra, fora da tela
//
// O desfecho é registro assistencial: não se edita, se corrige por registro
// novo (ver `migracao-correcao-desfecho.sql`). Aqui mora o que a TELA
// precisa saber antes de mandar — quais opções oferecer e o que já dá para
// recusar sem ir ao banco.
//
// ⚠️ ESTA NÃO É A DEFESA. As quatro recusas de verdade (motivo curto,
// desfecho mudou debaixo da tela, conta fechada/faturada, óbito) estão no
// GATILHO, e é lá que elas valem para quem chamar a API direto. O que está
// aqui existe para a pessoa descobrir no balcão, e não depois de um erro
// vermelho — a mensagem é a mesma nos dois lugares, de propósito.
// ═══════════════════════════════════════════════════════════

import { DESFECHOS_AMBULATORIAL } from "./ciclo.js";
import { PS_DESFECHOS } from "../ps/catalogo.js";
import { ehEvasao } from "../clinico/desfechos.js";

/** O mínimo que o banco aceita (`at_desf_corr_motivo_ck`). */
export const MOTIVO_MIN = 15;

/**
 * As opções de correção para este episódio.
 *
 * O ambulatório tem três desfechos; o pronto-socorro, cinco. Oferecer a
 * lista errada faria a recepção escolher "internação" numa consulta de
 * oftalmologia — e o desfecho decide o caminho da conta.
 *
 * `obito` NÃO entra na lista do ambulatorial: é desfecho do PS, e no
 * ambulatório significa quase sempre outra coisa (o paciente morreu depois,
 * em outro lugar), que não se registra assim.
 */
export function opcoesDeCorrecao(atendimento) {
  const atual = String(atendimento?.desfecho ?? "").trim();
  const ambulatorial = String(atendimento?.tipo_atendimento ?? "") === "ambulatorial";
  const lista = ambulatorial
    ? DESFECHOS_AMBULATORIAL.map(d => ({ chave: d.chave, label: d.label, dica: d.dica }))
    : Object.entries(PS_DESFECHOS).map(([chave, d]) => ({ chave, label: d.label, dica: "" }));
  // O desfecho ATUAL sai da lista: corrigir para o que já está gravado não é
  // correção, e o banco recusaria (`at_desf_corr_mudou_ck`). Melhor não
  // oferecer do que oferecer e recusar depois.
  return lista.filter(o => o.chave !== atual);
}

/**
 * Pode sequer ABRIR a correção deste episódio? `null` = pode.
 *
 * Repete as recusas do gatilho que a tela já tem como saber. As outras
 * (corrida, conta fechada) dependem do estado do banco naquele instante e
 * ficam só lá — pedir ao navegador para adivinhar daria falso "pode".
 */
export function motivoParaNaoCorrigir(atendimento) {
  const atual = String(atendimento?.desfecho ?? "").trim();
  if (!atendimento?.id) return "Atendimento inválido.";
  if (!atual) {
    return "Este atendimento ainda não tem desfecho — não há o que corrigir. Encerre-o pela Agenda.";
  }
  if (atual.toLowerCase() === "obito") {
    return "Este atendimento está registrado como ÓBITO, e o óbito carimba o cadastro do paciente. " +
           "Desfazer isso não é correção de desfecho — procure a direção técnica.";
  }
  if (String(atendimento?.status ?? "") === "cancelado") {
    return "Este atendimento foi cancelado. Episódio cancelado não tem desfecho a corrigir.";
  }
  return null;
}

/** O que falta para mandar a correção. `null` = pode gravar. */
export function conferirCorrecao({ atendimento, para, motivo } = {}) {
  const impedido = motivoParaNaoCorrigir(atendimento);
  if (impedido) return impedido;
  const alvo = String(para ?? "").trim();
  if (!alvo) return "Escolha o desfecho correto.";
  if (alvo === String(atendimento?.desfecho ?? "").trim()) {
    return "Este já é o desfecho gravado. Não há o que corrigir.";
  }
  const texto = String(motivo ?? "").trim();
  if (texto.length < MOTIVO_MIN) {
    return `Escreva o que aconteceu, com pelo menos ${MOTIVO_MIN} caracteres. ` +
           "Quem ler isto daqui a um ano precisa entender por que o registro mudou — e \"erro\" não explica nada.";
  }
  return null;
}

/**
 * A frase que a tela mostra ao lado do desfecho quando ele JÁ foi corrigido.
 *
 * Sem isto, o valor corrigido fica idêntico ao que nunca mudou — e é
 * exatamente a diferença que alguém procura quando a conta não bate.
 */
export function avisoDeCorrecao(correcoes = []) {
  const lista = Array.isArray(correcoes) ? correcoes : [];
  if (!lista.length) return null;
  const ultima = lista[0];
  const n = lista.length;
  return {
    quantas: n,
    texto: `Desfecho corrigido${n > 1 ? ` ${n} vezes` : ""}: era "${ultima.de || "sem desfecho"}". ` +
           `Última correção por ${ultima.usuario || "—"} — ${ultima.motivo}`,
  };
}

/** Quem evadiu não gera conta: a correção muda o faturamento. Avisa. */
export function efeitoNaConta(de, para) {
  const antes = !ehEvasao(de), depois = !ehEvasao(para);
  if (antes === depois) return null;
  return depois
    ? "Com esta correção o episódio PASSA a gerar conta — ele vai aparecer no faturamento como pendente."
    : "Com esta correção o episódio DEIXA de gerar conta. Se já houver conta aberta, cancele-a.";
}
