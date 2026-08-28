// ═══════════════════════════════════════════════════════════
// A BASE DE GERMES DIRIGE O CADASTRO DO CASO
//
// Puro: não sabe o que é React nem banco.
//
// 🔴 POR QUE ISTO SAIU DO App.jsx
// `sugerirGerme` decide se o SCIH vai sugerir precaução de contato para
// uma Klebsiella. Comparava com `toLowerCase()` e mais nada — enquanto o
// resto da casa usa `normTxt`, que também tira acento.
//
// A consequência, medida na tela em 28/08/2026 depois do seed:
//
//   "Virus sincicial respiratorio (VSR)"   → NENHUMA sugestão
//   "Vírus sincicial respiratório (VSR)"   → sugere contato
//
// Enfermeiro com pressa digita sem acento. E o silêncio é indistinguível
// de "este germe não está na base": a sugestão simplesmente não aparece,
// então a pessoa não tem como saber se errou de tecla ou se o germe não
// está catalogado.
//
// ⚠️ O SEED PIOROU ISSO ANTES DE PIORAR SOZINHO. Enquanto a base estava
// vazia, nada casava de qualquer jeito. `migracao-scih-germes-seed.sql`
// gravou dez nomes ACENTUADOS nos dois bancos — "à meticilina", "Vírus",
// "aeruginosa multirresistente" — e é justamente esse acento que a
// comparação não enxergava.
//
// ⚠️ E ISTO É SUGESTÃO, NUNCA DECISÃO.
// A tela mostra o que a base diz e preenche o campo se ele estiver VAZIO;
// quem confirma é a CCIH com o antibiograma na mão. Por isso a função
// devolve o germe encontrado e não uma conduta.
// ═══════════════════════════════════════════════════════════

import { normTxt } from "./alertas.js";

/**
 * Mínimo de letras antes de tentar casar.
 *
 * Com uma ou duas letras quase tudo casa por `includes`, e sugerir
 * "Influenza" para quem digitou "in" treina a pessoa a ignorar a sugestão
 * — que é a fadiga de alarme entrando pela porta da conveniência.
 */
export const MINIMO = 3;

/**
 * O germe da base que corresponde ao que foi digitado.
 *
 * Duas passadas, nesta ordem e de propósito:
 *
 *   1. IGUALDADE exata (já normalizada). Se a pessoa escreveu o nome
 *      inteiro, é esse germe, ponto — mesmo que outro nome o contenha.
 *   2. CONTÉM, nos dois sentidos. "Klebsiella" acha "Klebsiella
 *      pneumoniae (KPC)" (a pessoa digitou menos), e o resultado colado
 *      de um laudo — "Klebsiella pneumoniae (KPC) carbapenemase +" —
 *      também acha (a pessoa digitou mais).
 *
 * Devolve `null` quando não há base, quando o digitado é curto demais, ou
 * quando nada casa. `null` aqui significa "não sei", nunca "não isole".
 */
export function sugerirGerme(digitado, germes) {
  const c = normTxt(digitado);
  if (!c || c.length < MINIMO) return null;
  const lista = Array.isArray(germes) ? germes : [];
  if (!lista.length) return null;

  const exato = lista.find(g => normTxt(g?.nome) === c);
  if (exato) return exato;

  return lista.find(g => {
    const gn = normTxt(g?.nome);
    return gn && (c.includes(gn) || gn.includes(c));
  }) || null;
}

/**
 * O que preencher no formulário do caso a partir do germe sugerido.
 *
 * ⚠️ SÓ PREENCHE O QUE ESTÁ VAZIO. Se a pessoa já escolheu um isolamento,
 * a base não passa por cima: quem está com o paciente pode saber de algo
 * que a lista não sabe — coinfecção, surto na unidade, orientação da CCIH
 * para aquele caso. Sobrescrever seria a base mandando no enfermeiro.
 *
 * E o multirresistente só LIGA, nunca desliga: desmarcar sozinho um caso
 * que alguém marcou à mão apagaria uma decisão clínica sem avisar.
 */
export function camposDoGerme(germe, atual = {}) {
  const out = {};
  if (!germe) return out;
  if (germe.isolamento && !atual.isolamento) out.isolamento = germe.isolamento;
  if (germe.tipo === "multirresistente" && !atual.multirresistente) out.multirresistente = true;
  return out;
}
