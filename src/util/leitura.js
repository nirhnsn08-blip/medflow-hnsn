// ═══════════════════════════════════════════════════════════
// LEITURA QUE FALHOU × LEITURA QUE VEIO VAZIA
//
// 🔴 O DEFEITO MAIS COMUM DESTE SISTEMA, DE LONGE.
//
// `sb` engole a falha de rede e devolve `null`. Quase toda carga fazia:
//
//     return Array.isArray(rows) ? rows : [];
//
// e com isso APAGAVA a diferença entre "perguntei e não há nenhum" e "não
// consegui perguntar". As duas viram lista vazia, e lista vazia na tela é
// notícia boa: "0 pacientes aguardando leito", "nenhum lote vencendo",
// "prescrição sem interações", "0% de infecção". Nenhuma dessas frases dá
// erro, log, ou teste vermelho. Elas só são mentira.
//
// ── POR QUE UM VAZIO MARCADO, E NÃO `null` ──────────────────
//
// Devolver `null` é mais honesto, e é o que as quatro cargas mais
// perigosas já fazem. Mas trocar as ~100 restantes para `null` obrigaria
// a mexer em cada chamada — e `null.map()` derruba a tela inteira. Numa
// enfermaria, trocar uma mentira por uma queda não é progresso.
//
// `FALHA` É uma lista vazia de verdade: `.map`, `.length`, espalhar, tudo
// funciona igual. Quem não perguntar continua exatamente como estava. Quem
// perguntar (`naoDeuParaLer`) descobre o que antes tinha sido destruído.
//
// ⚠️ A MARCA É A IDENTIDADE DO ARRAY, e por isso NÃO SOBREVIVE a
// transformação: `listaLida(x).filter(...)` devolve um array novo e comum. A
// marca serve entre a carga e a tela, que é onde a mentira aparecia.
//
// ⚠️ `FALHA` é congelado de propósito. `push` nele estoura — e empurrar
// item para dentro do resultado de uma carga já era defeito antes disso.
// ═══════════════════════════════════════════════════════════

/**
 * A lista vazia que significa "não deu para ler".
 * Sempre a MESMA referência — é o que permite reconhecê-la depois.
 */
export const FALHA = Object.freeze([]);

/**
 * O que toda carga deve devolver no lugar de `Array.isArray(x) ? x : []`.
 *
 *   const rows = await sb("farm_lotes?select=*");
 *   return listaLida(rows);
 */
export function listaLida(rows) {
  return Array.isArray(rows) ? rows : FALHA;
}

/** Esta lista está vazia porque a leitura falhou (e não porque não há nada)? */
export function naoDeuParaLer(x) {
  return x === FALHA;
}

/**
 * A CONTAGEM de uma leitura. `null` quando não deu para ler.
 *
 * 🔴 Irmã do `listaLida`, e nasceu de um furo real (07/10/2026): a catraca
 * `src/cargas.test.js` caçava `Array.isArray(x) ? x : []` e passava batido
 * por `Array.isArray(x) ? x.length : 0`, que é a MESMA mentira com outra
 * cara — a leitura falhou e a tela recebe um número que parece medido.
 *
 * Aqui `null` em vez de vazio-marcado, e de propósito: o motivo de `FALHA`
 * ser lista (explicado no topo) é que `null.map()` derrubaria a tela. Número
 * não tem esse risco, e o projeto já usa `null` como "não sei" em regra pura
 * (`diasAteOPrazo`, `permanenciaEmDias`). Zero é uma AFIRMAÇÃO; `null` é a
 * ausência dela.
 *
 * ⚠️ Quem recebe `null` tem de decidir o que fazer — e para contagem que
 * libera ação ("não há registro clínico, pode cancelar") a decisão segura é
 * RECUSAR, nunca seguir como se fosse zero.
 */
export function contagemLida(rows) {
  return Array.isArray(rows) ? rows.length : null;
}

/**
 * Alguma das leituras falhou? Para tela que carrega várias listas de uma vez
 * e precisa de um aviso só.
 */
export function algumaFalhou(...listas) {
  return listas.some(naoDeuParaLer);
}

/**
 * O texto do aviso, com o nome do que não deu para ler.
 * Fala do que a pessoa perde, não do erro técnico — quem está na bancada
 * precisa saber que a tela está incompleta, não qual foi o status HTTP.
 */
export function avisoDeFalha(oQue) {
  return `Não foi possível ler ${oQue}. A tela está INCOMPLETA — o que aparece abaixo pode não ser tudo. Recarregue antes de decidir por esta tela.`;
}
