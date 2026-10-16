// ═══════════════════════════════════════════════════════════
// DRILL-DOWN DA TORRE — para onde cada número leva
//
// Um painel executivo que só mostra número obriga a direção a sair dele,
// abrir outro módulo e procurar de novo o que o painel já tinha achado. O
// drill-down fecha esse circuito: o card diz "3 materiais em falta" e leva
// ao Estoque; a linha diz "paciente cancelado 3 vezes" e abre o prontuário
// dele.
//
// ── 🔴 POR QUE A PERMISSÃO É CONFERIDA AQUI, E FALHA FECHADO ─
// O `App.jsx` monta o MENU com `verModulo`, mas o RENDER não barra ninguém:
// quem chegasse em `active === "suprimentos"` veria a tela de Estoque
// mesmo sem o módulo. O dado continuaria protegido (a RLS devolve lista
// vazia), mas a pessoa veria uma tela que não é dela, vazia, sem explicação
// — e "está tudo zerado" é a pior forma de negar acesso.
//
// Por isso o link só é OFERECIDO quando a permissão existe, e a pergunta é
// feita com padrão **false**: enquanto as permissões não chegaram, não há
// link. É o mesmo raciocínio do Livro de Controlados no App.jsx — ali o
// custo de abrir por engano é maior que o de fechar por engano, e aqui
// também: ninguém deixa de trabalhar porque um atalho demorou a aparecer.
//
// ⚠️ ISTO NÃO É CONTROLE DE ACESSO. A barreira de verdade é a RLS no banco.
// Isto é honestidade de interface: não oferecer porta que não abre.
// ═══════════════════════════════════════════════════════════

/**
 * Card/elemento da Torre → onde ele continua.
 *
 * `modulo` é a chave do catálogo (`acesso/modulos.js`), que é a mesma do
 * `active` no App.jsx. `aba` só existe para o Atendimento, que concentra
 * cinco telas atrás de uma porta só.
 */
export const DESTINOS = {
  // Tudo que é leito mora no Giro de Leitos.
  ocupacao:     { modulo: "leitos", rotulo: "Giro de Leitos" },
  internados:   { modulo: "leitos", rotulo: "Giro de Leitos" },
  uti:          { modulo: "leitos", rotulo: "Giro de Leitos" },
  altas_hoje:   { modulo: "leitos", rotulo: "Giro de Leitos" },
  permanencia:  { modulo: "leitos", rotulo: "Giro de Leitos" },
  giro:         { modulo: "leitos", rotulo: "Giro de Leitos" },
  mapa:         { modulo: "leitos", rotulo: "Giro de Leitos" },
  tendencia:    { modulo: "leitos", rotulo: "Giro de Leitos" },

  // A porta de entrada e a regulação que manda paciente para cá.
  pa:           { modulo: "ps", rotulo: "Pronto-Socorro" },
  gerint:       { modulo: "ps", rotulo: "Pronto-Socorro" },

  cirurgias:    { modulo: "bloco", rotulo: "Bloco Cirúrgico" },

  // A agenda do ambulatório mora numa ABA do Atendimento — o módulo
  // `ambulatorio` existe para RLS, mas não tem porta no menu (semMenu).
  ambulatorio:  { modulo: "atendimento", aba: "agenda", rotulo: "Atendimento · Agenda" },

  // Falta de material tem DUAS casas, e o card consolidado leva ao
  // almoxarifado; cada item leva à sua (ver `destinoDoItem`).
  falta:        { modulo: "suprimentos", rotulo: "Estoque & Compras" },

  // O paciente cancelado: a linha abre o prontuário dele.
  paciente:     { modulo: "paciente", rotulo: "Paciente 360" },
};

/** A casa de um item em falta, conforme de onde ele veio. */
export function destinoDoItem(origem) {
  return origem === "farmacia"
    ? { modulo: "farmacia", rotulo: "Farmácia" }
    : { modulo: "suprimentos", rotulo: "Estoque & Compras" };
}

/**
 * O link de um card, ou **null** quando não há para onde ir ou a pessoa não
 * alcança o destino.
 *
 * `verModulo` é a função do App (`chave, padrao`) — chamada aqui com padrão
 * **false** de propósito. Devolver null faz a tela simplesmente não ligar o
 * clique: o card continua lá, mostrando o número, sem virar um botão que
 * leva a lugar nenhum.
 *
 * @param chave      a chave do card (ou um destino já pronto)
 * @param verModulo  (modulo, padrao) => boolean
 */
export function linkDe(chave, verModulo) {
  const destino = typeof chave === "string" ? DESTINOS[chave] : chave;
  if (!destino) return null;
  if (typeof verModulo !== "function") return null;
  // 🔴 padrão `false`: sem permissão carregada, não se oferece porta.
  if (!verModulo(destino.modulo, false)) return null;
  return destino;
}

/**
 * O que a tela precisa para desenhar um card clicável.
 *
 * Devolve `{ onClick, title, clicavel }` — ou o mesmo objeto com
 * `clicavel:false` e sem `onClick`, para o card ficar inerte sem precisar
 * de `if` espalhado pela tela.
 */
export function acaoDoCard(chave, { verModulo, navegar, extra = null } = {}) {
  const destino = linkDe(chave, verModulo);
  if (!destino || typeof navegar !== "function") {
    return { clicavel: false, onClick: undefined, title: undefined };
  }
  return {
    clicavel: true,
    title: `Abrir ${destino.rotulo}`,
    onClick: () => navegar(destino.modulo, destino.aba || null, extra),
  };
}
