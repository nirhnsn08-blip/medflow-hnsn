// ═══════════════════════════════════════════════════════════
// MATERNIDADE — acesso a dados (loaders/savers)
//
// A tela recebe `sb` (o fetch autenticado) por prop e chama daqui. A busca
// de gestante REUSA a `buscarPacientes` do Atendimento — testada, com recuo
// para bancos sem a coluna de busca — em vez de reinventar uma segunda.
// ═══════════════════════════════════════════════════════════

import { listaLida } from "../util/leitura.js";
// Reuso deliberado: uma segunda busca de paciente divergiria da primeira.
export { buscarPacientes, carregarPaciente } from "../atendimento/dados.js";

const RECUSA =
  "O banco recusou. Confira: a gestante precisa estar cadastrada (prontuário), " +
  "e datas/valores fora do disparate (nº de fetos ≥ 1, Rh + ou −).";

/**
 * O episódio EM ANDAMENTO desta gestante, se houver. Evita abrir um segundo
 * dossiê para a mesma internação — a admissão nova pendura no episódio aberto.
 */
export async function episodioAtivoDaGestante(sb, prontuario) {
  if (!sb || !prontuario) return null;
  const r = await sb(
    `mat_episodios?prontuario=eq.${encodeURIComponent(prontuario)}&status=eq.em_andamento` +
    `&select=*&order=criado_em.desc&limit=1`).catch(() => null);
  return listaLida(r)?.[0] || null;
}

/**
 * Grava a admissão. Cria o episódio (se ainda não existe um aberto) e
 * pendura a avaliação de admissão nele.
 *
 * 🔴 CONFERE O RETORNO, não o status: o PostgREST responde 2xx alterando zero
 * linha. Sem `return=representation` + checagem, "gravou" seria mentira — e a
 * admissão que a enfermeira acha que salvou não existiria.
 *
 * Devolve `{ ok, episodioId, admissao }` ou `{ ok:false, motivo }`.
 */
export async function salvarAdmissao(sb, { episodio, admissao, episodioId = null }, user) {
  if (!sb) return { ok: false, motivo: "Sem conexão com o banco." };

  let epId = episodioId;
  if (!epId) {
    const rep = await sb("mat_episodios", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...episodio, usuario: user?.name || null }),
    }).catch(() => null);
    if (!Array.isArray(rep) || !rep.length) return { ok: false, motivo: `Não gravei o episódio. ${RECUSA}` };
    epId = rep[0].id;
  }

  const rad = await sb("mat_admissoes", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...admissao, episodio_id: epId, usuario: user?.name || null }),
  }).catch(() => null);

  // Episódio criado mas admissão falhou: o episódio fica (em andamento, sem
  // admissão) e a próxima tentativa reusa ele — não duplica o dossiê.
  if (!Array.isArray(rad) || !rad.length) return { ok: false, motivo: `Não gravei a admissão. ${RECUSA}`, episodioId: epId };

  return { ok: true, episodioId: epId, admissao: rad[0] };
}
