// ═══════════════════════════════════════════════════════════
// PRONTO-SOCORRO — ACESSO AO BANCO
//
// Saiu do App.jsx. `loadPsAtendimentos` é usado por 10 declarações e
// `loadPsPrescricaoItensByAtendimentos` por 7: a fila do PS alimenta a
// Farmácia (dispensação), o Giro de Leitos (quem aguarda internação) e o
// Faturamento.
//
// Por isso sai ANTES e SEPARADA da tela, como as camadas de leitos e da
// farmácia: se morasse dentro da página do PS, a Farmácia importaria a tela
// do PS para saber o que dispensar.
//
// ⚠️ `sb` é parâmetro. Nulo = sem banco.
// ═══════════════════════════════════════════════════════════

import { nowISO } from "../util/datas.js";
import { FILTRO_ATENDIMENTO_ABERTO } from "../atendimento/ciclo.js";
import { listaLida } from "../util/leitura.js";

// `is.null` entra no filtro de propósito: os atendimentos criados antes da
// coluna existir não têm tipo, e todos eles são do PS.
const SO_EMERGENCIA = "or=(tipo_atendimento.eq.emergencia,tipo_atendimento.is.null)";

export async function loadPsPrescricoesByAtendimentos(sb, ids) {
  if (!ids.length) return [];
  const rows = await sb(`ps_registros?atendimento_id=in.(${ids.join(",")})&tipo=eq.prescricao&select=id,atendimento_id,criado_em,usuario&order=criado_em.desc`);
  return listaLida(rows);
}

export async function loadPsProtocolos(sb) {
  const rows = await sb("ps_protocolos?select=*&order=categoria,titulo");
  return listaLida(rows);
}

export async function upsertPsProtocoloRemote(sb, p, user) {
  if (!sb) return null;
  const body = { ...p, usuario: user?.name || null, updated_at: nowISO() };
  if (p.id) { await sb(`ps_protocolos?id=eq.${p.id}`, { method: "PATCH", body: JSON.stringify(body) }); return null; }
  delete body.id;
  return await sb("ps_protocolos", { method: "POST", headers: { "Prefer": "return=representation" }, body: JSON.stringify(body) });
}

export async function deletePsProtocoloRemote(sb, id) { if (sb) await sb(`ps_protocolos?id=eq.${id}`, { method: "DELETE" }); }

export async function loadPsSalas(sb) {
  const rows = await sb("ps_salas?select=*&order=area,ordem,identificacao");
  return listaLida(rows);
}

export async function upsertPsSalaRemote(sb, sala, user) {
  if (!sb) return null;
  const body = { ...sala, usuario: user?.name || null, updated_at: nowISO() };
  if (sala.id) { await sb(`ps_salas?id=eq.${sala.id}`, { method: "PATCH", body: JSON.stringify(body) }); return null; }
  delete body.id;
  return await sb("ps_salas", { method: "POST", headers: { "Prefer": "return=representation" }, body: JSON.stringify(body) });
}

export async function deletePsSalaRemote(sb, id) { if (sb) await sb(`ps_salas?id=eq.${id}`, { method: "DELETE" }); }

export async function loadPsAtendimentos(sb) {
  const rows = await sb(`ps_atendimentos?${FILTRO_ATENDIMENTO_ABERTO}&${SO_EMERGENCIA}&select=*&order=chegada_em`);
  return listaLida(rows);
}

export async function loadPsFinalizadosHoje(sb) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const rows = await sb(`ps_atendimentos?status=eq.finalizado&desfecho_em=gte.${hoje.toISOString()}&${SO_EMERGENCIA}&select=*&order=desfecho_em.desc`);
  return listaLida(rows);
}

export async function loadPsAtendimentosPeriodo(sb, ano, mes) {
  const ini = new Date(ano, mes, 1); ini.setHours(0, 0, 0, 0);
  const fim = new Date(ano, mes + 1, 1); fim.setHours(0, 0, 0, 0);
  const rows = await sb(`ps_atendimentos?chegada_em=gte.${ini.toISOString()}&chegada_em=lt.${fim.toISOString()}&${SO_EMERGENCIA}&select=*&order=chegada_em.asc`);
  return listaLida(rows);
}

export async function loadPsExamesPeriodo(sb, ano, mes) {
  const ini = new Date(ano, mes, 1); ini.setHours(0, 0, 0, 0);
  const fim = new Date(ano, mes + 1, 1); fim.setHours(0, 0, 0, 0);
  const rows = await sb(`ps_registros?tipo=eq.exame&criado_em=gte.${ini.toISOString()}&criado_em=lt.${fim.toISOString()}&select=categoria,status,criado_em,resultado_em&order=criado_em.asc`);
  return listaLida(rows);
}

export async function addPsAtendimentoRemote(sb, at, user) {
  if (!sb) return null;
  return await sb("ps_atendimentos", { method: "POST", headers: { "Prefer": "return=representation" }, body: JSON.stringify({ ...at, usuario: user?.name || null }) });
}

/**
 * 🔴 A ÚNICA FORMA HONESTA DE ALTERAR NESTE MÓDULO.
 *
 * Sem `Prefer: return=representation` o PostgREST responde 204 SEM CORPO a
 * um PATCH que alterou ZERO linha — e 204 é idêntico para "alterou" e para
 * "a RLS recusou". Dar `await` e seguir é acreditar no status.
 *
 * Devolve `{ ok, linha }` ou `{ ok: false, erro }`. Quem chama decide o que
 * fazer, mas não pode mais confundir "gravou" com "não deu erro".
 */
async function patchConferido(sb, recurso, campos) {
  if (!sb) return { ok: false, erro: "Sem conexão com o banco." };
  const linhas = await sb(recurso, {
    method: "PATCH",
    headers: { "Prefer": "return=representation" },
    body: JSON.stringify(campos),
  });
  // `null` é falha de rede/permissão já anotada pelo `sbFetch`; `[]` é a
  // gravação recusada em silêncio. As duas são "não gravou".
  if (linhas == null) return { ok: false, erro: "A gravação não chegou ao banco. Tente de novo." };
  if (!Array.isArray(linhas) || linhas.length === 0) {
    return { ok: false, erro: "Nada foi gravado — pode faltar permissão de escrita neste módulo." };
  }
  return { ok: true, linha: linhas[0] };
}

/**
 * Altera o atendimento do PS: triagem, reavaliação, início e desfecho.
 *
 * 🔴 AS QUATRO COISAS QUE ESTA FUNÇÃO GRAVA SÃO O ESTADO DO PACIENTE NA
 * FILA. Até 04/09/2026 ela dava `await` e seguia, e a tela chamava
 * `refresh()` logo depois: a triagem "acontecia", a lista recarregava, e o
 * paciente reaparecia sem classificação — sem uma palavra. Pior no desfecho,
 * onde o código seguia reservando leito e abrindo pedido no NIR para um
 * episódio que continuava aberto.
 */
export async function updatePsAtendimentoRemote(sb, id, campos) {
  return patchConferido(sb, `ps_atendimentos?id=eq.${id}`, { ...campos, updated_at: nowISO() });
}

/**
 * Altera um atendimento e DEVOLVE O MOTIVO quando o banco recusa.
 *
 * 🔴 Segunda escrita da casa que precisa do motivo — a primeira é o
 * movimento de estoque da Farmácia. Por isso recebe o `sbCru`, e não o
 * `sb`: o `sb` devolve `null` em qualquer erro, o que serve para as outras
 * ~100 chamadas e não serve aqui. A recusa vem de gatilho ou de política
 * do banco, e quem está na recepção precisa ler o que houve.
 *
 * ⚠️ Não passa pela renovação de sessão do `sb`: token vencido aqui falha
 * em vez de renovar. Era assim antes da extração — está anotado para não
 * parecer decisão nova.
 */
export async function patchPsAtendimentoDireto(sbCru, id, campos) {
  if (!sbCru) return { ok: false, erro: "Supabase indisponível." };
  return sbCru(`ps_atendimentos?id=eq.${id}`, { ...campos, updated_at: nowISO() }, { method: "PATCH" });
}

export async function addPsSinalRemote(sb, sinal, user) {
  if (!sb) return;
  await sb("ps_sinais", { method: "POST", body: JSON.stringify({ ...sinal, usuario: user?.name || null }) });
}

export async function loadPsSinais(sb, atendimentoId) {
  const rows = await sb(`ps_sinais?atendimento_id=eq.${atendimentoId}&select=*&order=aferido_em.desc&limit=5`);
  return listaLida(rows);
}

export async function loadPsRegistros(sb, atendimentoId) {
  const rows = await sb(`ps_registros?atendimento_id=eq.${atendimentoId}&select=*&order=criado_em.desc`);
  return listaLida(rows);
}

export async function loadPsExamesPendentes(sb, ids) {
  if (!ids.length) return [];
  const rows = await sb(`ps_registros?atendimento_id=in.(${ids.join(",")})&tipo=eq.exame&status=neq.visto&select=atendimento_id,status`);
  return listaLida(rows);
}

export async function addPsRegistroRemote(sb, reg, user) {
  if (!sb) return null;
  return await sb("ps_registros", { method: "POST", headers: { "Prefer": "return=representation" }, body: JSON.stringify({ ...reg, usuario: user?.name || null }) });
}

/**
 * Altera um registro do PS (hoje: lançar resultado de exame e marcar visto).
 *
 * 🔴 CONFERE O RETORNO, não o status. Sem `return=representation` o PostgREST
 * responde 204 SEM CORPO a um PATCH que alterou ZERO linha — e é exatamente
 * isso que a RLS faz quando o perfil não tem escrita no módulo. A versão
 * anterior desta função dava `await` e seguia: o médico digitava o resultado
 * do exame, a caixa fechava, a lista recarregava mostrando "Aguardando
 * resultado", e o texto sumia sem uma palavra.
 *
 * Devolve `{ ok, linha }` ou `{ ok: false, erro }` — quem chama decide o que
 * fazer, mas não pode mais confundir "gravou" com "não deu erro".
 */
export async function updatePsRegistroRemote(sb, id, campos) {
  return patchConferido(sb, `ps_registros?id=eq.${id}`, campos);
}

export async function addPsPrescricaoItens(sb, itens, user) {
  if (!sb || !itens.length) return null;
  const body = itens.map(it => ({ ...it, usuario: user?.name || null }));
  return await sb("ps_prescricao_itens", { method: "POST", headers: { "Prefer": "return=representation" }, body: JSON.stringify(body) });
}

export async function loadPsPrescricaoItens(sb, atendimentoId) {
  const rows = await sb(`ps_prescricao_itens?atendimento_id=eq.${atendimentoId}&select=*&order=created_at`);
  return listaLida(rows);
}

export async function loadPsPrescricaoItensByAtendimentos(sb, ids) {
  if (!ids.length) return [];
  const rows = await sb(`ps_prescricao_itens?atendimento_id=in.(${ids.join(",")})&select=*&order=created_at`);
  return listaLida(rows);
}

export async function addPsAdministracao(sb, reg, user) {
  if (!sb) return null;
  return await sb("ps_administracoes", { method: "POST", headers: { "Prefer": "return=representation" }, body: JSON.stringify({ ...reg, usuario: user?.name || null }) });
}

export async function loadPsAdministracoes(sb, atendimentoId) {
  const rows = await sb(`ps_administracoes?atendimento_id=eq.${atendimentoId}&select=*&order=administrado_em.desc`);
  return listaLida(rows);
}

export async function loadPsAdministracoesByAtendimentos(sb, ids) {
  if (!ids.length) return [];
  const rows = await sb(`ps_administracoes?atendimento_id=in.(${ids.join(",")})&select=atendimento_id,prescricao_item_id,status,administrado_em`);
  return listaLida(rows);
}
