// ═══════════════════════════════════════════════════════════
// CHECAGEM DE MEDICAÇÃO À BEIRA DO LEITO
//
// 🔴 AS CINCO REGRAS ABAIXO ESTAVAM SOLTAS DENTRO DA ABA, como expressões
// no meio do JSX, e nenhuma tinha teste. Elas decidem o que a enfermagem lê
// sobre uma dose:
//
//   `sinalDeDispensacao`      se o medicamento saiu da farmácia, e quanto
//   `dosesAdministradas`      quantas entraram no paciente
//   `itemPendenteDeChecagem`  saiu da farmácia e ninguém registrou o destino
//   `validarChecagem`         o que impede o registro de ser gravado
//
// ⚠️ DISPENSADO E CHECADO SÃO COISAS DIFERENTES. Dispensado = saiu da
// farmácia. Checado = entrou no paciente, com hora e responsável. Só a
// checagem fecha o ciclo, e é a distinção que o módulo inteiro protege.
//
// Todas puras: recebem o que precisam e não leem estado nem rede.
// ═══════════════════════════════════════════════════════════

import { farmFmtQtd } from "../clinico/alertas.js";
import { dispensadoDoItem, semChecagem } from "./prescricao.js";

const CINZA = "#8d99ab", VERDE = "#34d399", AMBAR = "#d97706";

/**
 * Quantas doses ENTRARAM no paciente.
 *
 * ⚠️ Dose prescrita e dose dada são coisas diferentes, e somar as duas faria
 * a tela dizer que o paciente recebeu o que ainda está na bandeja. Só não
 * conta o que foi explicitamente marcado como não administrado — o resto do
 * registro existe porque alguém esteve lá.
 */
export function dosesAdministradas(itemId, adms) {
  return (Array.isArray(adms) ? adms : [])
    .filter(a => String(a?.prescricao_item_id) === String(itemId) && a?.status !== "nao_administrado")
    .length;
}

/** Quantas vezes a dose foi justificadamente NÃO dada. */
export function dosesNaoAdministradas(itemId, adms) {
  return (Array.isArray(adms) ? adms : [])
    .filter(a => String(a?.prescricao_item_id) === String(itemId) && a?.status === "nao_administrado")
    .length;
}

/**
 * O que a farmácia já entregou deste item, dito em uma linha.
 *
 * 🔴 SEM QUANTIDADE PRESCRITA NÃO EXISTE "PARCIAL". Item prescrito sem
 * quantidade (uso condicional, dose única a critério) não tem denominador:
 * qualquer entrega é a entrega. Calcular percentual em cima de zero mostraria
 * "dispensado 2/0", e um número sem sentido em tela clínica é lido como erro
 * do sistema — ou pior, como falta de medicamento.
 */
export function sinalDeDispensacao(item, saidas) {
  const previsto = Number(item?.quantidade || 0);
  const entregue = dispensadoDoItem(item?.id, saidas);
  if (previsto <= 0) {
    return entregue > 0
      ? { key: "dispensado", label: "dispensado", cor: VERDE }
      : { key: "sem_dispensacao", label: "sem dispensação", cor: CINZA };
  }
  if (entregue >= previsto) return { key: "dispensado", label: "dispensado", cor: VERDE };
  if (entregue > 0) {
    return { key: "parcial", label: `dispensado parcial ${farmFmtQtd(entregue)}/${farmFmtQtd(previsto)}`, cor: AMBAR };
  }
  return { key: "nao_dispensado", label: "não dispensado", cor: CINZA };
}

/**
 * 🔴 SAIU DA FARMÁCIA E NINGUÉM REGISTROU O DESTINO.
 *
 * É `pendentesDeChecagem` (do módulo de prescrição) vista item a item. Fica
 * aqui como função nomeada porque a aba precisava do predicado por linha e o
 * escrevia à mão — duas expressões da mesma regra, concordando por sorte.
 */
export function itemPendenteDeChecagem(item, saidas, adms) {
  return dispensadoDoItem(item?.id, saidas) > 0 && semChecagem(item, adms);
}

/**
 * O que impede uma checagem de ser gravada.
 *
 * 🔴 HORA NO FUTURO É RECUSADA. Gravar "administrado às 23h" às 14h põe no
 * prontuário uma dose que não aconteceu — e o prontuário é o que o próximo
 * plantão lê para decidir se pode dar a próxima.
 *
 * ⚠️ HORA NO PASSADO É PERMITIDA, e é por isso que o campo existe: à beira
 * do leito a enfermagem administra primeiro e registra depois. Exigir "agora"
 * empurraria todo mundo a mentir a hora para conseguir salvar.
 *
 * ⚠️ E "não administrado" EXIGE MOTIVO. Sem ele o registro diria que a dose
 * não foi dada sem dizer por quê, que é a informação de que o médico precisa
 * para decidir se repete, troca ou suspende.
 */
export function validarChecagem(form, quandoIso, agoraIso) {
  if (form?.status === "nao_administrado" && !form?.motivo) {
    return { ok: false, erro: "Informe o motivo de a dose não ter sido administrada." };
  }
  // ⚠️ `new Date(null)` é 1º de janeiro de 1970 — uma data VÁLIDA, no
  // passado, que passaria por todas as conferências abaixo e gravaria a dose
  // meio século atrás. Por isso a hora tem que ser texto preenchido antes de
  // virar `Date`.
  if (typeof quandoIso !== "string" || !quandoIso.trim()) {
    return { ok: false, erro: "Hora da administração inválida." };
  }
  const quando = new Date(quandoIso), agora = new Date(agoraIso);
  if (isNaN(quando)) return { ok: false, erro: "Hora da administração inválida." };
  if (!isNaN(agora) && quando > agora) {
    return { ok: false, erro: "A hora da administração não pode estar no futuro." };
  }
  return { ok: true };
}
