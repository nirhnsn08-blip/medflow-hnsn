// ═══════════════════════════════════════════════════════════
// PARÂMETROS DO MÓDULO — leitura e gravação
//
// Chave/valor em `sup_parametros`, para que o próximo ajuste configurável
// não exija migração nova. Hoje só a alçada de aprovação de compra.
//
// `sb` entra por parâmetro (padrão da casa), então o teste injeta um falso
// e não toca a rede.
// ═══════════════════════════════════════════════════════════

export const CHAVE_ALCADA = "alcada_aprovacao";

/**
 * Lê a alçada configurada, em reais.
 *
 * Devolve `null` tanto quando não há configuração quanto quando a leitura
 * falhou — e aqui os dois casos são o MESMO para quem chama, de propósito:
 * a regra de alçada cala nos dois. Travar compra porque a consulta do
 * parâmetro não voltou seria transformar um problema de rede em parada de
 * abastecimento.
 */
export async function carregarAlcada(sb) {
  if (typeof sb !== "function") return null;
  const r = await Promise.resolve(
    sb(`sup_parametros?chave=eq.${CHAVE_ALCADA}&select=valor`)
  ).catch(() => null);
  if (!Array.isArray(r) || !r.length) return null;
  const v = Number(r[0]?.valor);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Grava a alçada. `valor` nulo DESLIGA (apaga a linha) em vez de gravar
 * zero — zero travaria toda compra, e o banco recusa por CHECK.
 *
 * Devolve `{ ok, erro }` conferindo o retorno: sem política de escrita, o
 * PostgREST responde 2xx alterando zero linhas, e o parâmetro pareceria
 * salvo. Já aconteceu neste projeto, na trilha de auditoria.
 */
export async function salvarAlcada(sb, valor, usuario) {
  if (typeof sb !== "function") return { ok: false, erro: "Banco indisponível." };

  if (valor == null) {
    await Promise.resolve(
      sb(`sup_parametros?chave=eq.${CHAVE_ALCADA}`, { method: "DELETE" })
    ).catch(() => null);
    // DELETE bloqueado por RLS devolve 204 igual ao que deu certo — por isso
    // reconsultamos em vez de acreditar no status.
    const depois = await carregarAlcada(sb);
    return depois == null
      ? { ok: true, erro: null }
      : { ok: false, erro: "A alçada não pôde ser desligada — seu perfil não tem permissão para alterar parâmetros." };
  }

  const r = await Promise.resolve(sb("sup_parametros?on_conflict=chave", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      chave: CHAVE_ALCADA, valor, texto: null,
      atualizado_por: usuario?.name || null, atualizado_em: new Date().toISOString(),
    }),
  })).catch(() => null);

  const linhas = Array.isArray(r) ? r : r ? [r] : [];
  if (!linhas.length) {
    return { ok: false, erro: "A alçada não foi gravada — seu perfil não tem permissão para alterar parâmetros." };
  }
  return { ok: true, erro: null };
}
