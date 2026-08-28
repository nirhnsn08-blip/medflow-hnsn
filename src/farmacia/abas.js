// ═══════════════════════════════════════════════════════════
// QUAIS ABAS DA FARMÁCIA ESTA PESSOA VÊ
//
// Puro: não sabe o que é React nem banco.
//
// 🔴 POR QUE ISTO NÃO FICOU DENTRO DO App.jsx
// A trava do Livro de Controlados nasceu como um `.filter()` inline na
// barra da Farmácia. Funcionava — e nenhum teste a alcançava: o `App.jsx`
// está fora do `src/telas.test.jsx` (exige sessão e Supabase), então
// desligar a trava passava nos 2.007 testes sem uma reclamação.
//
// Trava de acesso que ninguém guarda é trava que volta a abrir na próxima
// refatoração, e ninguém percebe. Aqui ela é regra, e regra tem teste.
//
// ⚠️ ISTO DECIDE A ABA, NÃO O DADO.
// O livro é uma vista de `farm_movimentos` filtrada por medicamento
// controlado, e essa tabela é legitimamente da farmácia — é o kardex.
// O que se restringe é quem PRODUZ E LÊ o documento fiscalizável
// (Portaria 344/98), não quem alcança os movimentos pela API.
// ═══════════════════════════════════════════════════════════

/** A aba que a Portaria 344/98 manda restringir. */
export const ABA_RESTRITA = "controlados";

/**
 * As abas visíveis, na ordem em que foram declaradas.
 *
 * ⚠️ `podeControlados` NÃO tem valor padrão permissivo aqui de propósito.
 * `undefined` é tratado como "não pode": num documento fiscalizável, o
 * silêncio de quem chama não pode virar permissão. É o contrário do padrão
 * do menu — lá `verModulo` falha ABERTO, porque esconder módulo por engano
 * trava alguém no plantão. O livro não é trabalho de beira de leito:
 * ninguém para de atender porque ele demorou a aparecer.
 */
export function abasVisiveis(abas = [], { podeControlados } = {}) {
  const lista = Array.isArray(abas) ? abas : [];
  return lista.filter(a => a?.key !== ABA_RESTRITA || podeControlados === true);
}

/**
 * Esta aba pode ser aberta?
 *
 * A barra já esconde o que não pode, mas `sub` é estado — e estado
 * sobrevive a mudança de permissão no meio da sessão. Sem esta segunda
 * pergunta, quem estivesse com o livro aberto continuaria com ele aberto
 * depois de perder o acesso.
 */
export function podeAbrirAba(chave, { podeControlados } = {}) {
  return chave !== ABA_RESTRITA || podeControlados === true;
}
