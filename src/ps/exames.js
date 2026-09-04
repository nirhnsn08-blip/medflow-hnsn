// ═══════════════════════════════════════════════════════════
// O CICLO DE VIDA DO EXAME NO PS
//
// 🔴 ESTE VOCABULÁRIO ESTAVA EM TRÊS LUGARES, cada um com sua cópia:
//
//   `modais.jsx`         `EX_STATUS` — os três estados, rótulo e cor
//   `clinico/exames.js`  `TEM_RESULTADO` — quais estados contam no BI
//   `PsPage.jsx`         `status === "resultado_disponivel" ? pronto : aguarda`
//
// As três concordavam por sorte. Um quarto estado no banco (um "cancelado",
// um "coletado") faria a tela mostrar um rótulo, o BI contar como pendente e
// o painel do plantão contar como aguardando — três respostas diferentes
// para a mesma linha, e nenhuma errada o bastante para alguém notar.
//
// Aqui é a única cópia. Funções PURAS: recebem a linha e devolvem a leitura.
// ═══════════════════════════════════════════════════════════

import { PS_EXAME_CATEGORIAS } from "./catalogo.js";

export const EXAME_SOLICITADO = "solicitado";
export const EXAME_RESULTADO  = "resultado_disponivel";
export const EXAME_VISTO      = "visto";

/**
 * Os três estados, na ordem em que acontecem.
 *
 * ⚠️ A ORDEM É O CICLO, não é estética: solicitado → resultado → visto. É
 * ela que diz o que vem depois, e é por isso que a lista é um array e não
 * um objeto solto.
 */
export const EXAME_ESTADOS = [
  { chave: EXAME_SOLICITADO, label: "Aguardando resultado", cor: "#d97706" },
  { chave: EXAME_RESULTADO,  label: "Resultado disponível", cor: "#3b82f6" },
  { chave: EXAME_VISTO,      label: "Visto pelo médico",    cor: "#34d399" },
];

const POR_CHAVE = Object.fromEntries(EXAME_ESTADOS.map(e => [e.chave, e]));

/** As categorias de exame, derivadas do catálogo do PS — nunca redigitadas. */
export const EXAME_CATEGORIAS = Object.entries(PS_EXAME_CATEGORIAS)
  .map(([chave, label]) => ({ chave, label }));

/**
 * Em que estado está este exame.
 *
 * 🔴 STATUS AUSENTE OU DESCONHECIDO LÊ-SE COMO `solicitado`, jamais como
 * `visto`. Um exame que o sistema não sabe classificar tem que continuar
 * aparecendo como pendente: lê-lo como resolvido é sumir com ele da tela de
 * quem está esperando o resultado.
 */
export function estadoDoExame(reg) {
  return POR_CHAVE[reg?.status] || POR_CHAVE[EXAME_SOLICITADO];
}

/** O resultado já saiu? (disponível ou já visto — as duas contam.) */
export function temResultado(status) {
  return status === EXAME_RESULTADO || status === EXAME_VISTO;
}

/**
 * O que dá para fazer com este exame agora.
 *
 * ⚠️ `visto` NÃO OFERECE NADA. É estado final: ninguém "des-vê" um resultado,
 * e relançar por cima apagaria o que o médico leu para decidir a conduta.
 *
 * ⚠️ E `resultado_disponivel` também não oferece relançar. O resultado é
 * registro clínico como a evolução: entra uma vez. Correção se faz com um
 * exame novo, que fica com hora própria — não reescrevendo o antigo.
 */
export function acaoDoExame(reg) {
  const chave = estadoDoExame(reg).chave;
  if (chave === EXAME_SOLICITADO) return "lancar_resultado";
  if (chave === EXAME_RESULTADO)  return "marcar_visto";
  return null;
}

/**
 * 🔴 O RESULTADO VOLTOU E NINGUÉM OLHOU.
 *
 * É a irmã de `pendentesDeChecagem`: uma lista que existe para acusar
 * silêncio, não para ajudar a decidir. O laboratório respondeu, o dado está
 * no sistema, e não há registro de que alguém tenha lido — que é diferente
 * de "ainda não voltou". As duas situações somadas viram "exames pendentes"
 * e escondem justamente a que é responsabilidade nossa.
 */
export function resultadosNaoVistos(exames) {
  return (Array.isArray(exames) ? exames : [])
    .filter(e => e && e.status === EXAME_RESULTADO);
}

/**
 * A conta dos exames de um atendimento.
 *
 * ⚠️ `aguardando` é só o que ainda não voltou. Somar com o que voltou e não
 * foi visto daria um número maior e mais tranquilizador — "pendente com o
 * laboratório" —, quando metade da fila é pendente com o médico.
 */
export function contarExames(exames) {
  const lista = (Array.isArray(exames) ? exames : []).filter(Boolean);
  const porEstado = c => lista.filter(e => estadoDoExame(e).chave === c).length;
  return {
    total: lista.length,
    aguardando: porEstado(EXAME_SOLICITADO),
    prontos: porEstado(EXAME_RESULTADO),
    vistos: porEstado(EXAME_VISTO),
  };
}
