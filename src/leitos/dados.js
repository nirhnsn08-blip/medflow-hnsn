// ═══════════════════════════════════════════════════════════
// LEITOS, SETORES E SOLICITAÇÕES — ACESSO AO BANCO
//
// Saiu do App.jsx, onde morava em dois pedaços distantes um do outro
// (setores e solicitações lá pela linha 1.115; leitos, saídas e turnover
// pela 1.730), com coisa de outro domínio no meio.
//
// 🔴 POR QUE ESTA CAMADA SAI ANTES DA TELA, E SEPARADA DELA
// O módulo de Segurança do Paciente era dono das tabelas dele: tela e dados
// saíram juntos, num PR. Leitos não é dono de nada — `leitos` é lido por
// quatro telas e `setores` por seis (Pronto-Socorro, Bloco, Paciente 360,
// Atendimento, SCIH). Se os dados saíssem grudados na tela do Giro de
// Leitos, as outras cinco importariam a tela para ler uma lista.
//
// ⚠️ O `sb` é parâmetro, como em src/atendimento/dados.js e
// src/clinico/nsp-dados.js. Nulo = sem banco.
//
// ═══════════════════════════════════════════════════════════
// 🔴 `null` NÃO É `[]`, E ESTA CAMADA JÁ CONFUNDIA OS DOIS
//
//   null  →  não deu para perguntar (a rede caiu, o token venceu, a
//            coluna sumiu). O que a tela já mostrava continua valendo.
//   []    →  perguntou, respondeu, e não há nenhum.
//
// `loadLeitos`/`loadSetores` sempre devolveram `null` na falha, e todos os
// chamadores escrevem `r && setX(r)` — mantêm o que estava na tela.
//
// `loadSolicitacoes`, `loadSaidas` e `loadTurnover` devolviam `[]` nos dois
// casos. Duas consequências, e a segunda é a grave:
//
//   · a tela apagava a lista que tinha, trocando dado velho e verdadeiro
//     por vazio falso;
//   · a FILA DE INTERNAÇÃO passava a marcar "0 aguardando" quando na
//     verdade não conseguiu ler. Fila vazia é notícia boa e ninguém
//     confere notícia boa — é o mesmo defeito da tarja de isolamento que
//     não aparece.
//
// O chamador em LeitosPage já escrevia `if (Array.isArray(rows))`, como se
// a falha viesse distinguível. Era letra morta: `[]` sempre passa. A
// intenção estava escrita; quem não cumpria era a função.
// ═══════════════════════════════════════════════════════════

const lista = r => (Array.isArray(r) ? r : null);

// ── Leitos ───────────────────────────────────────────────
export const LEITOS_KEY = "hnsn_leitos_v1";

/** Os leitos guardados neste navegador. É o que sobra quando não há banco. */
export const loadLeitos = () => lerLocal(LEITOS_KEY);
export const saveLeitos = arr => gravarLocal(LEITOS_KEY, arr);

/** Todos os leitos. `null` quando não deu para ler. */
export async function loadLeitosFromSupabase(sb) {
  if (!sb) return null;
  return lista(await sb("leitos?select=*"));
}

export async function upsertLeitoRemote(sb, leito, user) {
  if (!sb) return;
  await sb("leitos?on_conflict=identificacao", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ ...leito, usuario: user?.name || null }),
  });
}

export async function deleteLeitoRemote(sb, identificacao) {
  if (!sb) return;
  await sb(`leitos?identificacao=eq.${encodeURIComponent(identificacao)}`, { method: "DELETE" });
}

// ── Setores ──────────────────────────────────────────────
export const SETORES_KEY = "hnsn_setores_v1";
export const loadSetoresLocal = () => lerLocal(SETORES_KEY);
export const saveSetoresLocal = arr => gravarLocal(SETORES_KEY, arr);

/** Os setores, na ordem definida pela instituição. `null` quando não deu para ler. */
export async function loadSetoresFromSupabase(sb) {
  if (!sb) return null;
  return lista(await sb("setores?select=*&order=ordem"));
}

export async function upsertSetorRemote(sb, setor, user) {
  if (!sb) return;
  await sb("setores?on_conflict=nome", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify({ ...setor, usuario: user?.name || null }),
  });
}

export async function deleteSetorRemote(sb, nome) {
  if (!sb) return;
  await sb(`setores?nome=eq.${encodeURIComponent(nome)}`, { method: "DELETE" });
}

// ── Solicitações de leito (a fila de internação) ─────────
/**
 * A fila de quem aguarda leito. `null` quando não deu para ler.
 *
 * 🔴 Só `status=aguardando`. Quem já foi internado sai da fila pelo
 * servidor — filtrar no cliente traria a fila inteira desde sempre e
 * cresceria para sempre.
 */
export async function loadSolicitacoes(sb) {
  if (!sb) return null;
  return lista(await sb("solicitacoes?status=eq.aguardando&select=*&order=hora_pedido"));
}

export async function addSolicitacaoRemote(sb, sol, user) {
  if (!sb) return null;
  // ⚠️ `return=representation` porque quem chama precisa do id gerado para
  // acompanhar a solicitação — sem ele, o 2xx do PostgREST não diz nada.
  return await sb("solicitacoes", {
    method: "POST",
    headers: { "Prefer": "return=representation" },
    body: JSON.stringify({ ...sol, usuario: user?.name || null }),
  });
}

export async function updateSolicitacaoRemote(sb, id, campos) {
  if (!sb) return;
  await sb(`solicitacoes?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(campos) });
}

// ── Saídas e turnover (o histórico do giro) ──────────────
export async function registrarSaidaRemote(sb, saida, user) {
  if (!sb) return;
  await sb("leitos_saidas", { method: "POST", body: JSON.stringify({ ...saida, usuario: user?.name || null }) });
}

/** O histórico de saídas. `null` quando não deu para ler. */
export async function loadSaidas(sb) {
  if (!sb) return null;
  return lista(await sb("leitos_saidas?select=*"));
}

export async function registrarTurnoverRemote(sb, turn, user) {
  if (!sb) return;
  await sb("leitos_turnover", { method: "POST", body: JSON.stringify({ ...turn, usuario: user?.name || null }) });
}

/** O histórico de turnover. `null` quando não deu para ler. */
export async function loadTurnover(sb) {
  if (!sb) return null;
  return lista(await sb("leitos_turnover?select=*"));
}

// ── O armário do navegador ───────────────────────────────
// ⚠️ Confere se é LISTA, e não só se o JSON abriu. Um JSON válido que não é
// array passa pelo `try` e estoura no `findIndex` seguinte — mesmo defeito
// que a trilha de auditoria tinha.
function lerLocal(chave) {
  try { const v = JSON.parse(localStorage.getItem(chave) || "[]"); return Array.isArray(v) ? v : []; }
  catch { return []; }
}

// ⚠️ Não deixa o armário cheio derrubar o ato. Gravar aqui é conveniência —
// a verdade está no banco.
function gravarLocal(chave, arr) {
  try { localStorage.setItem(chave, JSON.stringify(arr)); } catch { /* sem espaço ou modo restrito */ }
}
