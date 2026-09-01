// ═══════════════════════════════════════════════════════════
// BLOCO CIRÚRGICO — ACESSO AO BANCO
//
// Salas e cirurgias. Saiu do App.jsx com `sb` por parâmetro, como os outros
// módulos. Nulo = sem banco.
// ═══════════════════════════════════════════════════════════

import { nowISO } from "../util/datas.js";

export async function loadCcSalas(sb) {
  const rows = await sb("cc_salas?select=*&order=ordem");
  return Array.isArray(rows) ? rows : [];
}

export async function upsertCcSalaRemote(sb, sala, user) {
  if (!sb) return;
  await sb("cc_salas?on_conflict=nome", {
    method: "POST", headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ ...sala, usuario: user?.name || null, updated_at: nowISO() }),
  });
}

export async function deleteCcSalaRemote(sb, nome) {
  if (!sb) return;
  await sb(`cc_salas?nome=eq.${encodeURIComponent(nome)}`, { method: "DELETE" });
}

export async function loadCcCirurgias(sb, data) {
  const rows = await sb(`cc_cirurgias?data=eq.${data}&select=*&order=hora_prevista`);
  return Array.isArray(rows) ? rows : [];
}

export async function addCcCirurgiaRemote(sb, c, user) {
  if (!sb) return;
  await sb("cc_cirurgias", { method: "POST", body: JSON.stringify({ ...c, usuario: user?.name || null }) });
}

export async function updateCcCirurgiaRemote(sb, id, campos) {
  if (!sb) return;
  await sb(`cc_cirurgias?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ ...campos, updated_at: nowISO() }) });
}
