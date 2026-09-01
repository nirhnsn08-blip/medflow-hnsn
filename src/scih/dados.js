// ═══════════════════════════════════════════════════════════
// SCIH — ACESSO AO BANCO
//
// Casos de vigilância, base de germes e os indicadores mensais.
//
// ⚠️ `setLeitoIsolamentoRemote` escreve em `leitos`, não em tabela do
// SCIH: marcar o caso e marcar o LEITO são dois atos, e é o segundo que
// faz a tarja aparecer para quem entra no quarto.
//
// `sb` é parâmetro. Nulo = sem banco.
// ═══════════════════════════════════════════════════════════

import { nowISO } from "../util/datas.js";
import { listaLida } from "../util/leitura.js";

export async function loadScihCasos(sb) {
  const rows = await sb("scih_casos?select=*&order=created_at.desc");
  return listaLida(rows);
}

export async function addScihCasoRemote(sb, caso, user) {
  if (!sb) return null;
  return await sb("scih_casos", { method: "POST", headers: { "Prefer": "return=representation" }, body: JSON.stringify({ ...caso, usuario: user?.name || null }) });
}

export async function updateScihCasoRemote(sb, id, campos) {
  if (!sb) return;
  await sb(`scih_casos?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ ...campos, updated_at: nowISO() }) });
}

export async function deleteScihCasoRemote(sb, id) {
  if (!sb) return;
  await sb(`scih_casos?id=eq.${id}`, { method: "DELETE" });
}

// Marca/limpa o isolamento de um leito diretamente (sem tocar no restante do leito)
export async function setLeitoIsolamentoRemote(sb, id, iso, user) {
  if (!sb) return;
  await sb("leitos?on_conflict=identificacao", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ identificacao: id, isolamento: iso || null, usuario: user?.name || null }),
  });
}

// ── Fase B: base de germes com embasamento ──
export async function loadScihGermes(sb) {
  const rows = await sb("scih_germes?select=*");
  return listaLida(rows);
}

export async function upsertScihGermeRemote(sb, germe, user) {
  if (!sb) return;
  await sb("scih_germes?on_conflict=nome", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ ...germe, usuario: user?.name || null, updated_at: nowISO() }),
  });
}

export async function deleteScihGermeRemote(sb, nome) {
  if (!sb) return;
  await sb(`scih_germes?nome=eq.${encodeURIComponent(nome)}`, { method: "DELETE" });
}

// ── Fase C: indicadores mensais do SCIH ──
export async function loadScihIndicadores(sb) {
  const rows = await sb("scih_indicadores?select=*&order=competencia");
  return listaLida(rows);
}

export async function upsertScihIndicadorRemote(sb, ind, user) {
  if (!sb) return;
  await sb("scih_indicadores?on_conflict=competencia", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ ...ind, usuario: user?.name || null, updated_at: nowISO() }),
  });
}
