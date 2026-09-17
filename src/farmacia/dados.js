// ═══════════════════════════════════════════════════════════
// FARMÁCIA — ACESSO AO BANCO
//
// Saiu do App.jsx. É a camada mais lida do sistema depois da de leitos:
// `loadFarmMedicamentos` é usado por 16 declarações e `loadFarmLotes` por
// 12 — a Farmácia, o Pronto-Socorro, o Suprimentos e a conciliação de
// kardex leem o mesmo catálogo.
//
// Por isso ela sai ANTES e SEPARADA da tela, como a de leitos: se morasse
// dentro da página da Farmácia, o Pronto-Socorro importaria a tela da
// Farmácia para saber o saldo de um medicamento.
//
// As regras puras continuam em ./preparo.js, ./validade.js e ./abas.js.
//
// ⚠️ `sb` é parâmetro, como em ../atendimento/dados.js, ../clinico/nsp-dados.js
// e ../leitos/dados.js. Nulo = sem banco.
//
// 🔴 RECORTADO POR NOME, NÃO POR FAIXA DE LINHA.
// No App.jsx esta camada estava entremeada com `loadPsPrescricoesByAtendimentos`,
// que lê `ps_prescricoes` e é do Pronto-Socorro. Recortar por linha teria
// trazido ela junto — e uma função do PS escondida no módulo da Farmácia é
// pior que ela ficar onde estava: ninguém a procuraria aqui.
// ═══════════════════════════════════════════════════════════

import { nowISO } from "../util/datas.js";
import { listaLida } from "../util/leitura.js";

export async function loadFarmMedicamentos(sb) {
  const rows = await sb("farm_medicamentos?select=*&order=nome");
  return listaLida(rows);
}
export async function loadFarmLotes(sb) {
  const rows = await sb("farm_lotes?select=*&order=validade.asc.nullslast");
  return listaLida(rows);
}
export async function loadFarmMovimentos(sb, medicamentoId, limit = 60) {
  const q = medicamentoId
    ? `farm_movimentos?medicamento_id=eq.${medicamentoId}&select=*&order=created_at.desc&limit=${limit}`
    : `farm_movimentos?select=*&order=created_at.desc&limit=${limit}`;
  const rows = await sb(q);
  return listaLida(rows);
}
export async function loadFarmMovimentosPeriodo(sb, fromISO, toISO) {
  const rows = await sb(`farm_movimentos?created_at=gte.${fromISO}&created_at=lt.${toISO}&select=*&order=created_at.desc&limit=8000`);
  return listaLida(rows);
}
export async function loadFarmSaidasDesde(sb, fromISO) {
  const rows = await sb(`farm_movimentos?tipo=eq.saida&created_at=gte.${fromISO}&select=medicamento_id,quantidade&limit=12000`);
  return listaLida(rows);
}
export async function upsertFarmMedicamentoRemote(sb, med, user) {
  if (!sb) return null;
  const body = { ...med, usuario: user?.name || null, updated_at: nowISO() };
  if (med.id) {
    await sb(`farm_medicamentos?id=eq.${med.id}`, { method: "PATCH", body: JSON.stringify(body) });
    return null;
  }
  delete body.id;
  return await sb("farm_medicamentos", { method: "POST", headers: { "Prefer": "return=representation" }, body: JSON.stringify(body) });
}
export async function deleteFarmMedicamentoRemote(sb, id) {
  if (!sb) return;
  await sb(`farm_medicamentos?id=eq.${id}`, { method: "DELETE" });
}
/**
 * Registra um movimento de estoque.
 *
 * 🔴 ESTA É A ÚNICA ESCRITA DA CASA QUE DEVOLVE O MOTIVO DA RECUSA, e por
 * isso não usa o `sb` das outras: recebe o `sbCru`.
 *
 * O `sb` engole a falha e devolve `null` — de propósito, porque as outras
 * 130 chamadas não querem tratar erro e a queda já aparece no aviso global.
 * Aqui não serve: a recusa vem de um GATILHO do banco ("saldo insuficiente",
 * "lote vencido", "movimento sem lote") e quem está dispensando precisa LER
 * o motivo, não um "não deu". Os seis chamadores mostram `erro` na tela.
 *
 * ⚠️ Consequência de não passar pelo `sb`: um token vencido aqui NÃO é
 * renovado sozinho, e a falha não entra no aviso global. Era assim antes da
 * extração também — está anotado para não parecer decisão nova.
 */
export async function addFarmMovimentoRemote(sbCru, mov, user) {
  if (!sbCru) return { ok: false, erro: "Supabase indisponível." };
  return sbCru("farm_movimentos", { ...mov, usuario: user?.name || null });
}
// 🔴 AS DUAS BASES ABAIXO DEVOLVEM `null` NA FALHA, E ISSO NÃO É DETALHE.
// São a base de interação medicamentosa e a de incompatibilidade em Y. O
// motor de alertas recebe a lista e, com lista VAZIA, não encontra nenhum
// par — ou seja, uma leitura que falhou virava "prescrição sem interações".
// Um libera-geral falso, na conferência que mais importa.
//
// Devolvendo `null`, o motor distingue "não há interação" de "não conferi"
// e emite o alerta `base_indisponivel`. Ver src/clinico/alertas.js.
export async function loadFarmInteracoes(sb) {
  if (!sb) return null;
  const rows = await sb("farm_interacoes?select=*&order=gravidade");
  return Array.isArray(rows) ? rows : null;
}
export async function loadFarmIncompatY(sb) {
  if (!sb) return null;
  const rows = await sb("farm_incompat_y?select=*&order=substancia_a");
  return Array.isArray(rows) ? rows : null;
}
export async function upsertFarmInteracaoRemote(sb, row, user) {
  if (!sb) return null;
  const body = { ...row, usuario: user?.name || null, updated_at: nowISO() };
  if (row.id) { await sb(`farm_interacoes?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify(body) }); return null; }
  delete body.id;
  return await sb("farm_interacoes", { method: "POST", headers: { "Prefer": "return=representation" }, body: JSON.stringify(body) });
}
export async function deleteFarmInteracaoRemote(sb, id) { if (sb) await sb(`farm_interacoes?id=eq.${id}`, { method: "DELETE" }); }
export async function upsertFarmIncompatRemote(sb, row, user) {
  if (!sb) return null;
  const body = { ...row, usuario: user?.name || null, updated_at: nowISO() };
  if (row.id) { await sb(`farm_incompat_y?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify(body) }); return null; }
  delete body.id;
  return await sb("farm_incompat_y", { method: "POST", headers: { "Prefer": "return=representation" }, body: JSON.stringify(body) });
}
export async function deleteFarmIncompatRemote(sb, id) { if (sb) await sb(`farm_incompat_y?id=eq.${id}`, { method: "DELETE" }); }
export async function loadFarmPreparo(sb) {
  const rows = await sb("farm_preparo?select=*&order=updated_at.desc");
  return listaLida(rows);
}
export async function receberPreparoRemote(sb, registroId, atendimentoId, user) {
  if (!sb) return null;
  return await sb("farm_preparo?on_conflict=registro_id", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ registro_id: registroId, atendimento_id: atendimentoId || null, status: "preparo", recebido_em: nowISO(), recebido_por: user?.name || null, usuario: user?.name || null, updated_at: nowISO() }),
  });
}
export async function atualizarPreparoRemote(sb, id, campos) {
  if (!sb) return;
  await sb(`farm_preparo?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ ...campos, updated_at: nowISO() }) });
}
export async function loadFarmMovimentosByMeds(sb, ids, limit = 8000) {
  if (!ids.length) return [];
  const rows = await sb(`farm_movimentos?medicamento_id=in.(${ids.join(",")})&select=*&order=created_at.asc&limit=${limit}`);
  return listaLida(rows);
}
export async function loadFarmNaoPadronizados(sb) {
  const rows = await sb("farm_nao_padronizados?select=*&order=created_at.desc");
  return listaLida(rows);
}
export async function addFarmNaoPadronizadoRemote(sb, row, user) {
  if (!sb) return null;
  return await sb("farm_nao_padronizados", { method: "POST", headers: { "Prefer": "return=representation" }, body: JSON.stringify({ ...row, usuario: user?.name || null }) });
}
export async function updateFarmNaoPadronizadoRemote(sb, id, campos) {
  if (!sb) return;
  await sb(`farm_nao_padronizados?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ ...campos, updated_at: nowISO() }) });
}
export async function deleteFarmNaoPadronizadoRemote(sb, id) { if (sb) await sb(`farm_nao_padronizados?id=eq.${id}`, { method: "DELETE" }); }
export async function loadFarmIntervencoes(sb) {
  const rows = await sb("farm_intervencoes?select=*&order=created_at.desc");
  return listaLida(rows);
}
export async function addFarmIntervencaoRemote(sb, row, user) {
  if (!sb) return null;
  return await sb("farm_intervencoes", { method: "POST", headers: { "Prefer": "return=representation" }, body: JSON.stringify({ ...row, farmaceutico: user?.name || null, usuario: user?.name || null }) });
}
export async function updateFarmIntervencaoRemote(sb, id, campos) {
  if (!sb) return;
  await sb(`farm_intervencoes?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ ...campos, updated_at: nowISO() }) });
}
export async function deleteFarmIntervencaoRemote(sb, id) { if (sb) await sb(`farm_intervencoes?id=eq.${id}`, { method: "DELETE" }); }
export async function loadFarmInventarios(sb, limit = 400) {
  const rows = await sb(`farm_inventarios?select=*&order=created_at.desc&limit=${limit}`);
  return listaLida(rows);
}
export async function addFarmInventarioRemote(sb, inv, user) {
  if (!sb) return null;
  const r = await sb("farm_inventarios", {
    method: "POST",
    headers: { "Prefer": "return=representation" },
    body: JSON.stringify({ ...inv, usuario: user?.name || null }),
  });
  return Array.isArray(r) ? r[0] : r;
}
export async function loadFarmSaidasByAtendimentos(sb, ids) {
  if (!ids.length) return [];
  const rows = await sb(`farm_movimentos?atendimento_id=in.(${ids.join(",")})&select=id,atendimento_id,prescricao_item_id,medicamento_id,quantidade,created_at,tipo,motivo,lote,validade,estorno_de,devolucao_de,paciente_iniciais,paciente_prontuario,setor`);
  return listaLida(rows);
}
export async function loadFarmSaidasByAtendimento(sb, atendimentoId) {
  const rows = await sb(`farm_movimentos?atendimento_id=eq.${atendimentoId}&select=*&order=created_at.desc`);
  return listaLida(rows);
}

// ═══════════════════════════════════════════════════════════
// INTERNAÇÃO NA FARMÁCIA (17/09/2026)
//
// A farmácia passa a ler a prescrição do prontuário de internação. As
// leituras são por LOTE (uma consulta para a fila inteira) e toda falha
// volta como `FALHA` (listaLida): "não li" nunca pode virar "não há
// prescrição", "nada dispensado" ou "não validada".
//
// ⚠️ Filtro `in.(...)` com lista vazia é erro no PostgREST — por isso o
// retorno antecipado com `[]` COMUM: não haver o que consultar não é falha.
// ═══════════════════════════════════════════════════════════
const emLista = ids => [...new Set((ids || []).filter(v => v != null))];
const textoEmLista = vals => emLista(vals).map(p => `"${String(p).replace(/"/g, '""')}"`).join(",");

export async function loadEpisodiosAbertos(sb) {
  if (!sb) return [];
  const rows = await sb("pep_episodios?status=eq.aberto&alta_em=is.null&select=id,prontuario,iniciais,leito,setor,especialidade,admissao_em,status,alta_em&order=admissao_em.desc&limit=500");
  return listaLida(rows);
}
export async function loadPrescricoesDosEpisodios(sb, episodioIds) {
  const ids = emLista(episodioIds);
  if (!sb || !ids.length) return [];
  const rows = await sb(`pep_prescricoes?episodio_id=in.(${ids.join(",")})&assinada_em=not.is.null&select=*&order=assinada_em.desc`);
  return listaLida(rows);
}
export async function loadItensDasPrescricoes(sb, prescricaoIds) {
  const ids = emLista(prescricaoIds);
  if (!sb || !ids.length) return [];
  const rows = await sb(`pep_prescricao_itens?prescricao_id=in.(${ids.join(",")})&select=*&order=ordem`);
  return listaLida(rows);
}
export async function loadEventosDasPrescricoes(sb, prescricaoIds) {
  const ids = emLista(prescricaoIds);
  if (!sb || !ids.length) return [];
  const rows = await sb(`pep_prescricao_eventos?prescricao_id=in.(${ids.join(",")})&select=*&order=criado_em`);
  return listaLida(rows);
}
/** Todos os movimentos de paciente dos episódios: dispensação, estorno e devolução. */
export async function loadMovimentosDosEpisodios(sb, episodioIds) {
  const ids = emLista(episodioIds);
  if (!sb || !ids.length) return [];
  const rows = await sb(`farm_movimentos?episodio_id=in.(${ids.join(",")})&select=*&order=created_at.asc&limit=8000`);
  return listaLida(rows);
}
export async function loadValidacoesDasPrescricoes(sb, prescricaoIds) {
  const ids = emLista(prescricaoIds);
  if (!sb || !ids.length) return [];
  const rows = await sb(`farm_validacoes?prescricao_id=in.(${ids.join(",")})&select=*&order=criado_em.desc`);
  return listaLida(rows);
}

/**
 * O que o motor de alertas precisa além das alergias: data de nascimento e
 * condições (sonda). Só quem tem o módulo Paciente 360 lê estas tabelas — o
 * auxiliar de farmácia recebe listas vazias do RLS, e por isso a tela só
 * chama isto para quem pode (e avisa os outros de que a conferência está
 * incompleta, em vez de mostrar alerta de menos).
 */
export async function loadContextoDosInternados(sb, prontuarios) {
  const lista = textoEmLista(prontuarios);
  if (!sb || !lista) return { pacientes: [], condicoes: [] };
  const q = encodeURIComponent(lista);
  const [pacientes, condicoes] = await Promise.all([
    sb(`pacientes?prontuario=in.(${q})&select=prontuario,data_nascimento`).catch(() => null),
    sb(`pep_condicoes?prontuario=in.(${q})&select=prontuario,descricao,situacao,corrige_id,id`).catch(() => null),
  ]);
  return { pacientes: listaLida(pacientes), condicoes: listaLida(condicoes) };
}

/**
 * Grava a validação farmacêutica.
 *
 * 🔴 CONFERE O RETORNO. Sem permissão (perfil que não é farmacêutico) o
 * PostgREST pode responder sem linha nenhuma; dizer "validada" nesse caso
 * poria na tela uma avaliação que não existe.
 */
export async function addFarmValidacaoRemote(sb, row, user) {
  if (!sb) return { ok: false, erro: "Supabase indisponível." };
  const r = await sb("farm_validacoes", {
    method: "POST",
    headers: { "Prefer": "return=representation" },
    body: JSON.stringify({ ...row, usuario: user?.name || null }),
  });
  const linhas = Array.isArray(r) ? r : r ? [r] : [];
  if (!linhas.length) return { ok: false, erro: "A validação não foi gravada. Só farmacêutico com perfil de escrita na Farmácia pode validar." };
  return { ok: true, linha: linhas[0] };
}

// ── Conciliação: as checagens da enfermagem ──────────────────
export async function loadAdministracoesDosEpisodios(sb, episodioIds) {
  const ids = emLista(episodioIds);
  if (!sb || !ids.length) return [];
  const rows = await sb(`pep_administracoes?episodio_id=in.(${ids.join(",")})&select=id,episodio_id,prontuario,medicamento_id,descricao,status,corrige_id,administrado_em&limit=8000`);
  return listaLida(rows);
}
export async function loadAdministracoesDosAtendimentos(sb, atendimentoIds) {
  const ids = emLista(atendimentoIds);
  if (!sb || !ids.length) return [];
  const rows = await sb(`ps_administracoes?atendimento_id=in.(${ids.join(",")})&select=id,atendimento_id,medicamento_id,medicamento_nome,status,administrado_em&limit=8000`);
  return listaLida(rows);
}
