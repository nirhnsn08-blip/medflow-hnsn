// ═══════════════════════════════════════════════════════════
// PRESCRIÇÃO NO PS — as regras que estavam dentro da tela
//
// 🔴 AS CINCO FUNÇÕES ABAIXO ERAM CONSTANTES DENTRO DO `AtendimentoModal`,
// um componente de 595 linhas, e nenhuma tinha teste. Duas delas decidem
// coisas que chegam ao paciente:
//
//   `similaresComEstoque`  sugere o que prescrever no lugar do que acabou
//   `pendentesDeChecagem`  acusa medicamento que saiu da farmácia e ninguém
//                          registrou o que fez com ele
//
// ⚠️ TODAS PURAS. Recebem o que precisam e não leem estado nem rede — foi o
// que permitiu tirá-las de dentro do componente sem mudar comportamento, e
// é o que permite testá-las por fronteira.
// ═══════════════════════════════════════════════════════════

import { normTxt } from "../clinico/alertas.js";
import { saldoDoMedicamento } from "../farmacia/estoque.js";

/**
 * O sinal de estoque na hora de prescrever.
 *
 * ⚠️ NÃO DEVOLVE SALDO, só o sinal. Mostrar "3 unidades" na tela de
 * prescrição convida o médico a calcular quantas doses cabem — e a decisão
 * de dose é clínica, não de estoque. O que ele precisa saber é se a
 * farmácia vai conseguir dispensar.
 *
 * ⚠️ COM ESTOQUE DEVOLVE `null`, não um sinal verde: um selo em cada
 * medicamento disponível seria ruído em cima do que está certo, e ruído em
 * tela clínica é o começo da fadiga de alarme.
 */
export function estoqueSinal(med, lotes) {
  if (!med) return null;
  const saldo = saldoDoMedicamento(med.id, lotes);
  const min = Number(med.estoque_minimo || 0);
  if (saldo <= 0) return { key: "zerado", label: "SEM ESTOQUE", cor: "#f43f5e" };
  if (min > 0 && saldo <= min) return { key: "baixo", label: "estoque baixo", cor: "#d97706" };
  return null;
}

/**
 * O que dá para prescrever no lugar do que acabou.
 *
 * 🔴 A ORDEM NÃO É ESTÉTICA. Mesmo princípio ativo vem primeiro porque é
 * substituição terapêutica direta; mesma classe vem depois porque é uma
 * decisão clínica maior, que o médico pode ou não querer tomar. Inverter a
 * ordem colocaria a escolha mais arriscada no topo da lista.
 *
 * ⚠️ SÓ ENTRA O QUE TEM SALDO. Sugerir alternativa que também acabou é pior
 * que não sugerir nada: gasta o tempo de quem está com o paciente na frente.
 *
 * ⚠️ E o próprio medicamento nunca aparece na lista dos seus similares.
 */
export function similaresComEstoque(med, catalogo, lotes) {
  if (!med) return [];
  const pa = normTxt(med.principio_ativo);
  const temSaldo = m => saldoDoMedicamento(m.id, lotes) > 0;
  const ativos = (Array.isArray(catalogo) ? catalogo : [])
    .filter(m => m && m.ativo !== false && m.id !== med.id && temSaldo(m));
  const mesmoPA = pa ? ativos.filter(m => normTxt(m.principio_ativo) === pa) : [];
  const mesmaClasse = ativos.filter(m =>
    (m.classe || "") === (med.classe || "") && !mesmoPA.some(x => x.id === m.id));
  return [
    ...mesmoPA.map(m => ({ m, motivo: "mesmo princípio ativo" })),
    ...mesmaClasse.map(m => ({ m, motivo: "mesma classe" })),
  ];
}

/** Quanto a farmácia já entregou deste item da prescrição. */
export function dispensadoDoItem(itemId, saidas) {
  return (Array.isArray(saidas) ? saidas : [])
    .filter(s => String(s?.prescricao_item_id) === String(itemId))
    .reduce((a, s) => a + Number(s?.quantidade || 0), 0);
}

/**
 * O item não tem checagem nenhuma?
 *
 * ⚠️ "Nenhuma" inclui a JUSTIFICATIVA. Enfermagem que não administrou e
 * escreveu por quê já checou — o item deixou de estar pendente, mesmo sem
 * o medicamento ter entrado no paciente. O que fica pendente é o silêncio.
 */
export function semChecagem(item, adms) {
  return !(Array.isArray(adms) ? adms : [])
    .some(a => String(a?.prescricao_item_id) === String(item?.id));
}

/**
 * 🔴 O MEDICAMENTO SAIU DA FARMÁCIA E NINGUÉM REGISTROU O QUE FEZ COM ELE.
 *
 * É a única lista deste arquivo que existe para acusar uma falha, e não
 * para ajudar a decidir. Item dispensado sem checagem significa que há
 * medicamento fora do estoque e fora do prontuário ao mesmo tempo: ou foi
 * dado e não registrado (o prontuário mente), ou não foi dado e está
 * perdido (o estoque mente). As duas leituras são problema.
 *
 * ⚠️ ITEM NÃO DISPENSADO NÃO ENTRA. Prescrito e ainda não entregue não é
 * falha de ninguém — é a fila normal da farmácia. Misturar os dois encheria
 * a lista de ruído e ela deixaria de ser lida.
 */
export function pendentesDeChecagem(itensSalvos, saidas, adms) {
  return (Array.isArray(itensSalvos) ? itensSalvos : [])
    .filter(it => dispensadoDoItem(it?.id, saidas) > 0 && semChecagem(it, adms));
}
