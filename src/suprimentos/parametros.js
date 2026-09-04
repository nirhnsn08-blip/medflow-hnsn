// ═══════════════════════════════════════════════════════════
// PARÂMETROS DO MÓDULO — leitura e gravação
//
// Chave/valor em `sup_parametros`, para que o próximo ajuste configurável
// não exija migração nova.
//
// Hoje são dois: a alçada de aprovação de compra e o ALVO DE COBERTURA de
// estoque. O segundo entrou em 04/09/2026, e o motivo é o mesmo do nome do
// hospital: era `30` cravado no código, e trinta dias de cobertura não é
// verdade universal — quem está numa capital repõe em três dias, quem está
// no interior em quinze. Número de política, não de software.
//
// ⚠️ AS DUAS CHAVES LEEM E GRAVAM PELO MESMO PAR (`lerNumero`/`gravarNumero`).
// Copiar as funções da alçada para a cobertura criaria duas cópias da mesma
// conferência de retorno — e neste projeto duplicação de leitura já produziu
// três defeitos silenciosos esta semana.
//
// `sb` entra por parâmetro (padrão da casa), então o teste injeta um falso
// e não toca a rede.
// ═══════════════════════════════════════════════════════════

export const CHAVE_ALCADA = "alcada_aprovacao";
export const CHAVE_COBERTURA = "cobertura_alvo_dias";

/**
 * Lê um parâmetro numérico. `null` = não configurado OU não deu para ler.
 *
 * ⚠️ Os dois casos são o MESMO para quem chama, de propósito: quem consome
 * decide o que fazer sem configuração, e travar por causa de uma consulta
 * que não voltou transformaria problema de rede em parada de operação.
 */
async function lerNumero(sb, chave) {
  if (typeof sb !== "function") return null;
  const r = await Promise.resolve(
    sb(`sup_parametros?chave=eq.${chave}&select=valor`)
  ).catch(() => null);
  if (!Array.isArray(r) || !r.length) return null;
  const v = Number(r[0]?.valor);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Grava um parâmetro numérico.
 *
 * 🔴 CONFERE O RETORNO, não o status. Sem política de escrita o PostgREST
 * responde 2xx alterando zero linha, e o parâmetro pareceria salvo — já
 * aconteceu neste projeto, na trilha de auditoria.
 */
async function gravarNumero(sb, chave, valor, usuario, oQue) {
  if (typeof sb !== "function") return { ok: false, erro: "Banco indisponível." };
  const r = await Promise.resolve(sb("sup_parametros?on_conflict=chave", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      chave, valor, texto: null,
      atualizado_por: usuario?.name || null, atualizado_em: new Date().toISOString(),
    }),
  })).catch(() => null);
  const linhas = Array.isArray(r) ? r : r ? [r] : [];
  return linhas.length
    ? { ok: true, erro: null }
    : { ok: false, erro: `${oQue} não foi gravad${oQue.endsWith("a") ? "a" : "o"} — seu perfil não tem permissão para alterar parâmetros.` };
}

/**
 * Lê a alçada configurada, em reais.
 *
 * Devolve `null` tanto quando não há configuração quanto quando a leitura
 * falhou — e aqui os dois casos são o MESMO para quem chama, de propósito:
 * a regra de alçada cala nos dois. Travar compra porque a consulta do
 * parâmetro não voltou seria transformar um problema de rede em parada de
 * abastecimento.
 */
export const carregarAlcada = sb => lerNumero(sb, CHAVE_ALCADA);

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

  return gravarNumero(sb, CHAVE_ALCADA, valor, usuario, "A alçada");
}

// ── COBERTURA DE ESTOQUE ────────────────────────────────────

/**
 * Dias de cobertura que o hospital considera necessários.
 *
 * 🔴 ERA `30` CRAVADO NO CÓDIGO (`SUP_EXEC_COBERTURA_ALVO`). Trinta dias não
 * é verdade universal: quem está numa capital repõe em três dias e trinta
 * significa capital parado; quem está no interior repõe em quinze e trinta
 * pode ser pouco. É número de política de abastecimento, e ele decide o
 * "capital liberável" que o painel executivo mostra à diretoria.
 *
 * ⚠️ SEM CONFIGURAÇÃO NÃO DEVOLVE `null` — devolve o PADRÃO. Diferente da
 * alçada, que cala quando não configurada, este número é indispensável para
 * a conta existir. Mas quem chama recebe também `padrao: true`, para a tela
 * poder dizer que aquele 30 é sugestão nossa e não decisão do hospital.
 */
export const COBERTURA_PADRAO_DIAS = 30;

export async function carregarCobertura(sb) {
  const v = await lerNumero(sb, CHAVE_COBERTURA);
  return v == null
    ? { dias: COBERTURA_PADRAO_DIAS, padrao: true }
    : { dias: v, padrao: false };
}

/**
 * Grava o alvo de cobertura.
 *
 * ⚠️ Recusa fora de 1–365. Zero faria "capital liberável" virar o estoque
 * inteiro — a diretoria leria que dá para gastar tudo. E acima de um ano o
 * indicador deixa de significar qualquer coisa.
 */
export async function salvarCobertura(sb, dias, usuario) {
  const n = Number(dias);
  if (!Number.isFinite(n) || n < 1 || n > 365) {
    return { ok: false, erro: "A cobertura tem de ser entre 1 e 365 dias." };
  }
  return gravarNumero(sb, CHAVE_COBERTURA, Math.round(n), usuario, "A cobertura");
}
