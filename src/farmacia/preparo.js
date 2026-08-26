// ═══════════════════════════════════════════════════════════
// PREPARO DA FARMÁCIA — a prescrição só fica "pronta" se saiu do estoque
//
// Puro: não sabe o que é React nem banco.
//
// 🔴 POR QUE ISTO EXISTE
// O kanban da farmácia tinha "Separar" e "Marcar pronto" como dois botões
// independentes na mesma coluna. `marcarPronto` só mudava o status. Então
// este caminho era válido e não deixava rastro:
//
//     receber → marcar pronto → confirmar retirada
//
// Ao fim dele a prescrição consta como ENTREGUE AO PACIENTE e não existe
// uma única linha de saída em `farm_movimentos`. Foi reproduzido na tela:
// o mesmo sistema dizia, em duas abas, coisas opostas sobre o mesmo
// paciente — "Retirados hoje (1)" na fila de preparo e "2 pendente(s)" na
// tela de dispensação.
//
// O dano tem duas metades. A clínica: alguém lê que o medicamento foi
// entregue e não foi. A patrimonial: o estoque teórico fica acima do
// físico, e a divergência é INDETECTÁVEL porque a farmácia não tem
// inventário nem conciliação — diferente do almoxarifado, que tem os dois.
//
// ⚠️ O QUE ESTA REGRA NÃO FAZ: exigir dispensação COMPLETA.
// Ruptura de estoque é rotina (162 itens sem saldo no banco de teste). Se
// dois de três itens saíram porque o terceiro acabou, a sacola existe e o
// paciente precisa dela — travar aí empurraria a farmácia para registrar
// mentira em outro campo, que é como controle demais vira controle nenhum.
// Então: zero separado RECUSA; parcial AVISA e nomeia o que falta.
//
// ⚠️ E PRESCRIÇÃO SEM ITEM ESTRUTURADO PASSA.
// Não há o que separar, então não há o que mentir. É o caso do registro
// antigo, anterior à Fase B da farmácia — travá-lo congelaria para sempre
// uma fila que ninguém consegue destravar.
// ═══════════════════════════════════════════════════════════

const num = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const id = v => (v == null ? "" : String(v));

/**
 * Os itens que pertencem a esta prescrição.
 *
 * A chave certa é `registro_id`: um mesmo atendimento pode ter várias
 * prescrições assinadas, e cada uma é uma sacola diferente.
 *
 * ⚠️ O RECUO IMPORTA. Item gravado antes de a ligação existir (e o seed de
 * teste é assim) fica com `registro_id` nulo. Sem recuo, a regra veria
 * "nenhum item", concluiria que não há o que separar e liberaria — ou
 * seja, o buraco continuaria aberto justamente onde a gente testa.
 * Quando NENHUM item do atendimento aponta para prescrição alguma, cai-se
 * para os itens do atendimento, que é exatamente o conjunto que a tela de
 * dispensação mostra ao farmacêutico.
 */
export function itensDaPrescricao(registro, itens = []) {
  const lista = Array.isArray(itens) ? itens : [];
  const reg = id(registro?.id);
  const doAtendimento = lista.filter(i => id(i?.atendimento_id) === id(registro?.atendimento_id));
  if (!reg) return doAtendimento;

  const ligados = doAtendimento.filter(i => id(i?.registro_id) === reg);
  if (ligados.length) return ligados;

  // Nenhum item ligado a prescrição nenhuma neste atendimento? Dado antigo.
  const algumLigado = doAtendimento.some(i => id(i?.registro_id) !== "");
  return algumLigado ? [] : doAtendimento;
}

/** Quanto já saiu do estoque para um item da prescrição. */
export const dispensadoDoItem = (itemId, saidas = []) =>
  (Array.isArray(saidas) ? saidas : [])
    .filter(s => id(s?.prescricao_item_id) === id(itemId))
    .reduce((soma, s) => soma + num(s?.quantidade), 0);

/**
 * O quadro da separação: quanto foi prescrito, quanto saiu, o que falta.
 *
 * `faltando` traz o NOME do medicamento, não o id — quem lê é o
 * farmacêutico no balcão, e ele precisa saber qual frasco procurar.
 */
export function conferirSeparacao({ itens = [], saidas = [] } = {}) {
  const lista = Array.isArray(itens) ? itens : [];
  const separados = lista.filter(i => dispensadoDoItem(i?.id, saidas) > 0);
  const faltando = lista
    .filter(i => dispensadoDoItem(i?.id, saidas) <= 0)
    .map(i => String(i?.medicamento_nome ?? "").trim() || "item sem nome");

  return {
    total: lista.length,
    separados: separados.length,
    faltando,
    nenhum: lista.length > 0 && separados.length === 0,
    completo: lista.length > 0 && faltando.length === 0,
  };
}

/**
 * Pode marcar esta prescrição como pronta para retirada?
 *
 * Devolve `{ ok, erros, avisos, quadro }`. A tela desabilita o botão com
 * `!ok` e mostra `erros`/`avisos` — nunca só um `title`, que em botão
 * desabilitado não aparece em todo navegador.
 */
export function podeMarcarPronto({ registro, itens = [], saidas = [] } = {}) {
  const meus = itensDaPrescricao(registro, itens);
  const quadro = conferirSeparacao({ itens: meus, saidas });
  const erros = [];
  const avisos = [];

  if (quadro.nenhum) {
    erros.push(
      "Nada foi separado desta prescrição ainda. Use “Separar” e dê baixa dos itens no estoque — " +
      "marcar como pronta sem baixa faria o sistema afirmar que o paciente recebeu um medicamento " +
      "que ninguém tirou da prateleira."
    );
  } else if (quadro.faltando.length) {
    const n = quadro.faltando.length;
    avisos.push(
      `${quadro.separados} de ${quadro.total} ${quadro.total === 1 ? "item separado" : "itens separados"}. ` +
      `${n === 1 ? "Falta" : "Faltam"}: ${quadro.faltando.join(", ")}. ` +
      "Se é ruptura de estoque, siga e registre a intervenção — o que não pode é a falta sumir da vista."
    );
  }

  return { ok: erros.length === 0, erros, avisos, quadro };
}
