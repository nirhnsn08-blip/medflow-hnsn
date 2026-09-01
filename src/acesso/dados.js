// ═══════════════════════════════════════════════════════════
// ACESSO — LEITURA E ESCRITA DOS PERFIS E DAS EXCEÇÕES
//
// Saiu do App.jsx. São as seis funções que falam com o PostgREST; as duas
// que sobraram lá — trocar a própria senha e a administração de usuários —
// não falam: uma chama `/auth/v1/user` e a outra a Edge Function
// `admin-usuarios`, ambas com o token da sessão. Território de sessão fica
// com a sessão.
//
// ⚠️ TODA ESCRITA AQUI É BARRADA NO BANCO, NÃO SÓ NA TELA.
// `profiles_update_admin` e `usuarios_perm_write` só deixam adm_master
// passar. A tela esconder o botão é conveniência; quem recusa é o RLS.
//
// 🔴 E é por isso que se pede `return=representation`: o PostgREST devolve
// 204 mesmo quando o RLS barra e NADA foi gravado. Conferir o status daria
// "gravou" para uma escrita recusada — o retorno é a única prova.
// ═══════════════════════════════════════════════════════════

import { listaLida } from "../util/leitura.js";

// Lista os perfis/usuários para a tela de Usuários.
// `select=*` traz também categoria e registro de conselho — sem eles a tela
// não consegue mostrar nem classificar quem é o quê clinicamente.
export async function loadProfiles(sb) {
  const rows = await sb("profiles?select=*&order=role");
  return listaLida(rows);
}
// Classifica a categoria profissional e o conselho. Só adm_master consegue —
// a política de RLS `profiles_update_admin` recusa os demais no banco, não
// só na tela.
export async function salvarCategoriaProfissional(sb, username, dados) {
  return sb(`profiles?username=eq.${encodeURIComponent(username)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      categoria: dados.categoria || "administrativo",
      conselho: dados.conselho || null,
      registro_conselho: dados.registro_conselho || null,
      uf_conselho: dados.uf_conselho || null,
      // O CBO entra aqui já normalizado por `validarCbo` — quem chama
      // recusa o formato errado antes de gravar. É a ocupação que decide se
      // a produção SUS é PROCESSADA, e a coluna existia desde a fase 2 sem
      // nenhuma tela que a preenchesse.
      cbo: dados.cbo || null,
    }),
  });
}
// ── Exceções de acesso por usuário ──────────────────────────
// O desvio de UMA pessoa sobre o cargo (ver acesso/permissoes.js). Grava em
// `usuarios_permissoes`; o RLS `usuarios_perm_write` só deixa adm_master.
// Nenhuma migração nova — a tabela e as políticas já existem nos dois bancos.
export async function carregarExcecoesUsuario(sb, userId) {
  const rows = await sb(`usuarios_permissoes?user_id=eq.${userId}&select=id,modulo,nivel,motivo,concedido_por,criado_em&order=modulo`).catch(() => null);
  return listaLida(rows);
}
export async function carregarGrantsDoPerfil(sb, chave) {
  if (!chave) return {};
  const rows = await sb(`perfis_permissoes?perfil_chave=eq.${encodeURIComponent(chave)}&select=modulo,nivel`).catch(() => null);
  const g = {};
  for (const r of (listaLida(rows))) g[r.modulo] = r.nivel;
  return g;
}
// Upsert por (user_id, modulo): reconceder o mesmo módulo TROCA o nível em
// vez de duplicar (a tabela tem `unique (user_id, modulo)`). `return=repre-
// sentation` porque o PostgREST devolve 204 mesmo quando o RLS barra e nada
// grava — conferimos o RETORNO, não o status.
export async function salvarExcecaoRemota(sb, userId, ex, autor) {
  return await sb("usuarios_permissoes?on_conflict=user_id,modulo", {
    method: "POST",
    headers: { Prefer: "return=representation,resolution=merge-duplicates" },
    body: JSON.stringify({ user_id: userId, modulo: ex.modulo, nivel: ex.nivel, motivo: (ex.motivo || "").trim(), concedido_por: autor || null }),
  }).catch(() => null);
}
export async function removerExcecaoRemota(sb, id) {
  return await sb(`usuarios_permissoes?id=eq.${id}`, {
    method: "DELETE", headers: { Prefer: "return=representation" },
  }).catch(() => null);
}
