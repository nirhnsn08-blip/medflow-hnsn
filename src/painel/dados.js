// ═══════════════════════════════════════════════════════════
// PAINEL DE PRODUÇÃO AMBULATORIAL — O ARMÁRIO E A GRAVAÇÃO
//
// A produção do ambulatório vive em DOIS lugares: no `localStorage`
// (`hnsn_v5`) e na tabela `producao` do banco. O armário local é o que
// mantém a tela funcionando quando a rede cai — e é a única parte do
// sistema que ainda trabalha assim.
//
// 🔴 `saveRecord` GRAVA NOS DOIS, e nessa ordem: primeiro o armário,
// depois o banco. Se invertesse, uma falha de rede perderia o que a
// pessoa acabou de digitar — e o ambulatório lança produção do dia
// inteiro de uma vez.
//
// ⚠️ `sb` é parâmetro. Nulo = grava só no armário local.
// ═══════════════════════════════════════════════════════════

import { ESPECIALIDADES as SPECS } from "../ambulatorio/especialidades.js";
import { registrarAuditoria } from "../auditoria/dados.js";
// Wordmark VALENTRAX com o X em degradê azul
// Ícones de linha (profissionais, sem emoji) — traço 1.8, herdam a cor do texto
export const K = "hnsn_v5";

export const loadDB  = () => { try { return JSON.parse(localStorage.getItem(K) || "{}"); } catch { return {}; } };

export const saveDB  = d  => localStorage.setItem(K, JSON.stringify(d));

// Lê TODOS os atendimentos do Supabase e reconstrói o formato db[data][especialidade].
// É o que faz os números aparecerem em qualquer computador (não só onde foram digitados).
export async function loadFromSupabase(sb) {
  const rows = await sb("atendimentos?select=*");
  if (!Array.isArray(rows)) return null;
  const db = {};
  for (const r of rows) {
    if (!db[r.data]) db[r.data] = {};
    db[r.data][r.especialidade] = {
      primeiras:   r.primeiras   || 0,
      retornos:    r.retornos    || 0,
      ofertadas:   r.ofertadas   || 0,
      realizadas:  r.realizadas  || 0,
      livres:      r.livres      || 0,
      emergencias: r.emergencias || 0,
      faltas:      r.faltas      || 0,
    };
  }
  return db;
}

// Retorna "cloud" se o dado foi confirmado no Supabase, "local" caso contrário —
// para a interface avisar quando o registro ficou salvo só neste aparelho.
export async function saveRecord(sb, date, specId, data, user) {
  const db = loadDB();
  if (!db[date]) db[date] = {};
  db[date][specId] = data;
  saveDB(db);
  // Supabase
  let syncStatus = "local";
  if (sb) {
    const res = await sb("atendimentos?on_conflict=data,especialidade", {
      method: "POST",
      headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ data: date, especialidade: specId, ...data, usuario: user?.name || null }),
    });
    if (res) syncStatus = "cloud";
  }
  // Auditoria
  registrarAuditoria(sb, user, "salvar", `${date} / ${specId}`, data);
  return syncStatus;
}
