// ═══════════════════════════════════════════════════════════
// CHECAGEM DE MEDICAÇÃO À BEIRA DO LEITO
//
// 🔴 AS CINCO REGRAS ABAIXO ESTAVAM SOLTAS DENTRO DA ABA, como expressões
// no meio do JSX, e nenhuma tinha teste. Elas decidem o que a enfermagem lê
// sobre uma dose:
//
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

// ⚠️ `sinalDeDispensacao` MUDOU DE CASA em 04/09/2026, para `prescricao.js`.
// A aba de Prescrição tinha a QUARTA cópia da mesma regra, com rótulos
// diferentes ("pendente" onde aqui dizia "não dispensado"), e as duas abas
// do mesmo modal discordavam sobre a mesma linha.
export { sinalDeDispensacao } from "./prescricao.js";
import { dispensadoDoItem, semChecagem } from "./prescricao.js";

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
