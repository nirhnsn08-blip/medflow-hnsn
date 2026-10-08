// ═══════════════════════════════════════════════════════════
// BLOCO CIRÚRGICO — ACESSO AO BANCO
//
// Salas e cirurgias. Saiu do App.jsx com `sb` por parâmetro, como os outros
// módulos. Nulo = sem banco.
//
// 🔴 TODA ESCRITA AQUI CONFERE O QUE VOLTOU — e isso é recente (07/10/2026).
//
// As quatro escritas deste arquivo descartavam o retorno. Uma delas chegava
// a PEDIR `return=representation` e jogar fora; o PATCH nem mandava o
// cabeçalho. O PostgREST responde 2xx com ZERO LINHAS quando a RLS filtra
// pelo `using`, e `sbFetch` só injeta a representação no POST (ver
// App.jsx) — então um PATCH barrado era indistinguível de um que funcionou.
//
// O pior caso era o checklist de cirurgia segura: a circulante marcava os
// itens, clicava "Concluir Sign In", o modal fechava, a trilha de auditoria
// gravava que o checklist tinha sido concluído, e NADA ia para o banco. Em
// caso de evento sentinela, o sistema guardava registro contraditório.
//
// Por isso cada função devolve `{ ok, motivo }` em vez de `undefined`, no
// mesmo formato de `src/acesso/dados.js` e `src/atendimento/dados.js`.
// ═══════════════════════════════════════════════════════════

import { nowISO } from "../util/datas.js";
import { listaLida } from "../util/leitura.js";

/** A mesma frase para as quatro escritas — o que a pessoa precisa fazer. */
const NAO_GRAVOU = {
  ok: false,
  motivo: "Nada foi gravado. Pode ser permissão do seu perfil para o módulo Bloco, " +
          "ou a conexão. Confira na tela se a alteração aparece antes de seguir — " +
          "NÃO assuma que foi salvo.",
};
const SEM_BANCO = { ok: false, motivo: "Sem conexão com o banco — nada foi gravado." };

/** 2xx com zero linha NÃO é sucesso: é a RLS barrando em silêncio. */
function conferir(r, chave = "linha") {
  if (!Array.isArray(r) || !r.length) return NAO_GRAVOU;
  return { ok: true, [chave]: r[0] };
}

export async function loadCcSalas(sb) {
  const rows = await sb("cc_salas?select=*&order=ordem");
  return listaLida(rows);
}

export async function upsertCcSalaRemote(sb, sala, user) {
  if (!sb) return SEM_BANCO;
  const r = await sb("cc_salas?on_conflict=nome", {
    method: "POST", headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ ...sala, usuario: user?.name || null, updated_at: nowISO() }),
  });
  return conferir(r, "sala");
}

/**
 * Apagar sala não devolve linha — DELETE sem representação responde 204 em
 * todo caso, inclusive quando a RLS barrou. Por isso a conferência aqui é
 * RELER: se o nome continuar no catálogo, não apagou.
 */
export async function deleteCcSalaRemote(sb, nome) {
  if (!sb) return SEM_BANCO;
  await sb(`cc_salas?nome=eq.${encodeURIComponent(nome)}`, { method: "DELETE" });
  const resto = await sb(`cc_salas?nome=eq.${encodeURIComponent(nome)}&select=nome`);
  if (!Array.isArray(resto)) {
    return { ok: false, motivo: "Não consegui confirmar se a sala foi apagada — recarregue antes de concluir que ela saiu." };
  }
  return resto.length ? NAO_GRAVOU : { ok: true };
}

export async function loadCcCirurgias(sb, data) {
  const rows = await sb(`cc_cirurgias?data=eq.${data}&select=*&order=hora_prevista`);
  return listaLida(rows);
}

export async function addCcCirurgiaRemote(sb, c, user) {
  if (!sb) return SEM_BANCO;
  const r = await sb("cc_cirurgias", {
    method: "POST",
    headers: { "Prefer": "return=representation" },
    body: JSON.stringify({ ...c, usuario: user?.name || null }),
  });
  return conferir(r, "cirurgia");
}

/**
 * ⚠️ O `Prefer` é explícito aqui porque `sbFetch` só o injeta no POST. Sem
 * ele o PATCH devolve 204 vazio e não há como distinguir "gravou" de "a RLS
 * filtrou a linha" — que é exatamente o defeito que este arquivo corrigiu.
 */
export async function updateCcCirurgiaRemote(sb, id, campos) {
  if (!sb) return SEM_BANCO;
  const r = await sb(`cc_cirurgias?id=eq.${id}`, {
    method: "PATCH",
    headers: { "Prefer": "return=representation" },
    body: JSON.stringify({ ...campos, updated_at: nowISO() }),
  });
  return conferir(r, "cirurgia");
}
