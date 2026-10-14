// ═══════════════════════════════════════════════════════════
// EXAMES (SADT) — ACESSO AO BANCO
//
// ⚠️ `sb` é parâmetro. Nulo = sem banco.
//
// 🔴 TODA ESCRITA CONFERE A LINHA DE VOLTA. O PostgREST responde 2xx com
// ZERO linhas quando a RLS filtra — o "204 mentiroso" deste projeto. Um
// resultado de exame gravado em silêncio é um laudo que o médico acha que
// está no sistema e não está.
//
// ⚠️ `sb` só injeta `Prefer` sozinho no POST. No PATCH ele vai à mão, senão
// a resposta volta sem corpo e a conferência não tem o que conferir.
// ═══════════════════════════════════════════════════════════

import { nowISO } from "../util/datas.js";
import { listaLida } from "../util/leitura.js";

// ── O CATÁLOGO ──────────────────────────────────────────────

export async function loadSadtCatalogo(sb) {
  if (!sb) return listaLida(null);
  const rows = await sb("sadt_catalogo?select=*&order=categoria,nome");
  return listaLida(rows);
}

export async function loadSadtAnalitos(sb) {
  if (!sb) return listaLida(null);
  const rows = await sb("sadt_analitos?select=*&order=catalogo_id,ordem,nome");
  return listaLida(rows);
}

export async function upsertSadtCatalogoRemote(sb, ex, user) {
  if (!sb) return null;
  const body = { ...ex, usuario: user?.name || null, updated_at: nowISO() };
  if (ex.id) {
    const r = await sb(`sadt_catalogo?id=eq.${ex.id}`, {
      method: "PATCH", headers: { "Prefer": "return=representation" }, body: JSON.stringify(body),
    });
    return Array.isArray(r) && r.length ? r : null;
  }
  delete body.id;
  const r = await sb("sadt_catalogo", { method: "POST", body: JSON.stringify(body) });
  return Array.isArray(r) && r.length ? r : null;
}

export async function upsertSadtAnalitoRemote(sb, a, user) {
  if (!sb) return null;
  const body = { ...a, usuario: user?.name || null, updated_at: nowISO() };
  if (a.id) {
    const r = await sb(`sadt_analitos?id=eq.${a.id}`, {
      method: "PATCH", headers: { "Prefer": "return=representation" }, body: JSON.stringify(body),
    });
    return Array.isArray(r) && r.length ? r : null;
  }
  delete body.id;
  const r = await sb("sadt_analitos", { method: "POST", body: JSON.stringify(body) });
  return Array.isArray(r) && r.length ? r : null;
}

// ── OS PEDIDOS ──────────────────────────────────────────────

export async function loadSadtPedidosDoAtendimento(sb, atendimentoId) {
  if (!sb || atendimentoId == null) return listaLida(null);
  const rows = await sb(`sadt_pedidos?ps_atendimento_id=eq.${atendimentoId}&select=*&order=criado_em.desc`);
  return listaLida(rows);
}

export async function loadSadtPedidosDoProntuario(sb, prontuario) {
  if (!sb || !prontuario) return listaLida(null);
  const rows = await sb(`sadt_pedidos?prontuario=eq.${encodeURIComponent(prontuario)}&select=*&order=criado_em.desc`);
  return listaLida(rows);
}

export async function loadSadtItens(sb, pedidoIds) {
  if (!sb || !pedidoIds?.length) return listaLida(sb ? [] : null);
  const rows = await sb(`sadt_itens?pedido_id=in.(${pedidoIds.join(",")})&select=*&order=id`);
  return listaLida(rows);
}

export async function loadSadtResultados(sb, itemIds) {
  if (!sb || !itemIds?.length) return listaLida(sb ? [] : null);
  const rows = await sb(`sadt_resultados?item_id=in.(${itemIds.join(",")})&select=*&order=criado_em`);
  return listaLida(rows);
}

/**
 * 🔴 O PEDIDO E SEUS ITENS VÃO EM DUAS CHAMADAS, e isso tem consequência:
 * se a segunda falhar, fica um pedido sem exame nenhum.
 *
 * ⚠️ O PostgREST não dá transação entre requisições. A escolha aqui é
 * DEVOLVER O ERRO dizendo que o pedido ficou vazio, em vez de fingir
 * sucesso: um pedido vazio aparece na tela como pedido vazio, que é
 * estranho e investigável. Um pedido perdido em silêncio não é.
 */
export async function criarSadtPedido(sb, linhaPedido, itensDe, user) {
  if (!sb) return { ok: false, erro: "Sem conexão com o banco." };
  const corpo = { ...linhaPedido, usuario: user?.name || null, criado_em: nowISO() };
  const p = await sb("sadt_pedidos", { method: "POST", body: JSON.stringify(corpo) });
  if (!Array.isArray(p) || !p.length) {
    return { ok: false, erro: "O pedido NÃO foi criado — a gravação não chegou ao banco ou falta permissão de escrita neste módulo." };
  }
  const pedido = p[0];
  const itens = itensDe(pedido.id);
  if (!itens.length) return { ok: true, pedido, itens: [] };
  const i = await sb("sadt_itens", { method: "POST", body: JSON.stringify(itens) });
  // ⚠️ "NÃO DEU PARA SABER" E "ENTROU METADE" SÃO COISAS DIFERENTES, e a
  // conduta de quem lê também: no primeiro caso é preciso ABRIR o pedido
  // para ver o que há; no segundo o sistema já sabe quantos faltam.
  // Colapsar os dois num "0 entraram" diria ao médico que nada foi gravado
  // quando talvez tudo tenha sido — e aí ele pede de novo, duplicando.
  if (!Array.isArray(i)) {
    return {
      ok: false, pedido,
      erro: `O pedido #${pedido.id} foi criado, mas NÃO FOI POSSÍVEL CONFIRMAR se os ${itens.length} exame(s) entraram. Abra o pedido e confira o que há nele antes de pedir de novo — repetir agora pode duplicar.`,
    };
  }
  if (i.length !== itens.length) {
    return {
      ok: false, pedido,
      erro: `O pedido #${pedido.id} foi criado mas ${itens.length - i.length} de ${itens.length} exame(s) NÃO entraram. Abra o pedido e confira antes de pedir de novo — repetir agora duplicaria o que entrou.`,
    };
  }
  return { ok: true, pedido, itens: i };
}

// ── O ITEM ──────────────────────────────────────────────────

async function patchItem(sb, id, campos, oQue) {
  if (!sb) return { ok: false, erro: "Sem conexão com o banco." };
  const r = await sb(`sadt_itens?id=eq.${id}`, {
    method: "PATCH",
    headers: { "Prefer": "return=representation" },
    body: JSON.stringify({ ...campos, updated_at: nowISO() }),
  });
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, erro: `${oQue} NÃO foi gravado — a alteração não chegou ao banco ou falta permissão de escrita neste módulo.` };
  }
  return { ok: true, linha: r[0] };
}

export function marcarColetado(sb, id) {
  return patchItem(sb, id, { status: "coletado", coletado_em: nowISO() }, "A coleta");
}

export function marcarVisto(sb, id, user) {
  return patchItem(sb, id, {
    status: "visto", visto_em: nowISO(), visto_por: user?.name || null,
  }, "O 'visto'");
}

export function cancelarItem(sb, id, motivo) {
  return patchItem(sb, id, {
    status: "cancelado", cancelado_em: nowISO(), cancelamento_motivo: String(motivo ?? "").trim(),
  }, "O cancelamento");
}

// ── O RESULTADO ─────────────────────────────────────────────

/**
 * ⚠️ O corpo vai COMO VEIO de `linhaDoResultado`, sem `anormal`, `critico`
 * nem `versao`: quem calcula é o gatilho. A linha de volta JÁ TRAZ os três
 * calculados, e é ela que a tela deve usar — não o que foi enviado.
 */
export async function lancarSadtResultado(sb, linha, user) {
  if (!sb) return { ok: false, erro: "Sem conexão com o banco." };
  const corpo = { ...linha, usuario: user?.name || null, criado_em: nowISO() };
  const r = await sb("sadt_resultados", { method: "POST", body: JSON.stringify(corpo) });
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, erro: "O resultado NÃO foi gravado — a gravação não chegou ao banco ou falta permissão de escrita neste módulo. O que você digitou continua na tela." };
  }
  return { ok: true, linha: r[0] };
}

// ── O PAINEL DO LABORATÓRIO ─────────────────────────────────

/**
 * Os itens pendentes de todo o hospital, para a bancada trabalhar.
 *
 * ⚠️ Pendente = solicitado OU coletado. O `in.()` cita os dois estados em
 * vez de `neq.visto`: um estado novo no banco entraria na lista sem ninguém
 * decidir, e foi assim que o vocabulário se multiplicou em três cópias.
 */
export async function loadSadtFilaPendente(sb) {
  if (!sb) return listaLida(null);
  const rows = await sb("sadt_itens?status=in.(solicitado,coletado)&select=*&order=id");
  return listaLida(rows);
}

/**
 * 🔴 OS CRÍTICOS LIBERADOS, pelo índice parcial do banco.
 *
 * Não filtra por "pendente" aqui de propósito: quem decide o que ainda
 * precisa de alguém é `criticosPendentes`, que precisa ver a cadeia de
 * correção inteira. Um crítico retificado para normal só se reconhece com as
 * duas versões na mão.
 */
export async function loadSadtCriticos(sb, limite = 200) {
  if (!sb) return listaLida(null);
  const rows = await sb(`sadt_resultados?critico=is.true&select=*&order=criado_em.desc&limit=${limite}`);
  return listaLida(rows);
}

/**
 * Os exames pendentes de vários atendimentos de uma vez, no formato que
 * `contarExames` já lê: `{ atendimento_id, status }`.
 *
 * 🔴 SUBSTITUI `loadPsExamesPendentes`, e o formato é igual DE PROPÓSITO: é
 * o crachá "2 exames aguardando" na fila do PS e a trava do desfecho. Mudar
 * o formato obrigaria a mexer na régua, e a régua é uma só.
 *
 * ⚠️ `cancelado` FICA FORA, e isto é o conserto de um defeito herdado: a
 * consulta antiga filtrava `status=neq.visto`, o que funcionava porque
 * `ps_registros` não tinha estado de cancelamento. Com ele no vocabulário,
 * `neq.visto` faria todo exame cancelado contar como pendente — e travar a
 * alta de um paciente por um exame que ninguém vai fazer.
 */
export async function loadSadtPendentesPorAtendimento(sb, ids) {
  if (!sb) return listaLida(null);
  if (!ids?.length) return [];
  const peds = await sb(`sadt_pedidos?ps_atendimento_id=in.(${ids.join(",")})&select=id,ps_atendimento_id`);
  if (!Array.isArray(peds)) return listaLida(null);
  if (!peds.length) return [];
  const porPedido = new Map(peds.map(p => [String(p.id), p.ps_atendimento_id]));
  const itens = await sb(`sadt_itens?pedido_id=in.(${peds.map(p => p.id).join(",")})&status=in.(solicitado,coletado,resultado_disponivel)&select=pedido_id,status`);
  if (!Array.isArray(itens)) return listaLida(null);
  return itens.map(i => ({ atendimento_id: porPedido.get(String(i.pedido_id)), status: i.status }));
}

export async function loadSadtPedidosPorId(sb, ids) {
  if (!sb || !ids?.length) return listaLida(sb ? [] : null);
  const rows = await sb(`sadt_pedidos?id=in.(${ids.join(",")})&select=*`);
  return listaLida(rows);
}

/**
 * Quantos exames este atendimento tem. `null` quando não se sabe.
 *
 * 🔴 `null`, NUNCA ZERO — é `contagemLida` aplicada a duas consultas. Serve
 * ao crachá "Exames (3)" do painel do atendimento, e "Exames (0)" afirma que
 * não há exame pedido. Enquanto a leitura não voltou, ou se ela falhou, o
 * número não existe e o crachá aparece sem número.
 *
 * ⚠️ Mora aqui, e não dentro da aba: a aba só é montada quando alguém clica
 * nela, e o número precisa estar no botão ANTES — é por ele que o médico
 * descobre que há exame esperando.
 */
export async function contarSadtDoAtendimento(sb, atendimentoId) {
  if (!sb || atendimentoId == null) return null;
  const peds = await sb(`sadt_pedidos?ps_atendimento_id=eq.${atendimentoId}&select=id`);
  if (!Array.isArray(peds)) return null;
  if (!peds.length) return 0;
  const itens = await sb(`sadt_itens?pedido_id=in.(${peds.map(p => p.id).join(",")})&select=id`);
  return Array.isArray(itens) ? itens.length : null;
}

/**
 * Os exames do período, no formato que o BI mensal já lê:
 * `{ categoria, status, criado_em, resultado_em }`.
 *
 * 🔴 SUBSTITUI `loadPsExamesPeriodo`. O formato é o mesmo de propósito —
 * `resumoExamesPorCategoria` é a régua do relatório e não muda.
 *
 * ⚠️ `criado_em` É DO PEDIDO, e `resultado_em` é do ITEM. Era uma coluna só
 * quando o exame era uma linha de texto. O tempo de resposta que o relatório
 * mede é pedido → resultado, então a data do pedido tem de vir junta — e é
 * por isso que a junção acontece aqui e não na tela.
 */
export async function loadSadtExamesPeriodo(sb, ano, mes) {
  if (!sb) return listaLida(null);
  const ini = new Date(ano, mes, 1); ini.setHours(0, 0, 0, 0);
  const fim = new Date(ano, mes + 1, 1); fim.setHours(0, 0, 0, 0);
  const peds = await sb(`sadt_pedidos?criado_em=gte.${ini.toISOString()}&criado_em=lt.${fim.toISOString()}&select=id,criado_em&order=criado_em.asc`);
  if (!Array.isArray(peds)) return listaLida(null);
  if (!peds.length) return [];
  const quando = new Map(peds.map(p => [String(p.id), p.criado_em]));
  const itens = await sb(`sadt_itens?pedido_id=in.(${peds.map(p => p.id).join(",")})&select=pedido_id,categoria,status,resultado_em`);
  if (!Array.isArray(itens)) return listaLida(null);
  return itens.map(i => ({
    categoria: i.categoria, status: i.status,
    criado_em: quando.get(String(i.pedido_id)) || null,
    resultado_em: i.resultado_em,
  }));
}

/**
 * Tudo que o Paciente 360 precisa dos exames de uma pessoa, de uma vez.
 *
 * ⚠️ Lê por PRONTUÁRIO e também pelos atendimentos de PS dela: o pedido
 * feito antes de a recepção vincular o prontuário fica só com o
 * `ps_atendimento_id`, e deixá-lo de fora faria o exame desaparecer da linha
 * do tempo — que é o mesmo defeito do antecedente cirúrgico, de novo.
 */
export async function loadSadtDoPaciente(sb, prontuario, atendimentoIds = []) {
  if (!sb) return { pedidos: listaLida(null), itens: listaLida(null), resultados: listaLida(null) };
  const filtros = [];
  if (prontuario) filtros.push(`prontuario.eq.${prontuario}`);
  if (atendimentoIds.length) filtros.push(`ps_atendimento_id.in.(${atendimentoIds.join(",")})`);
  if (!filtros.length) return { pedidos: [], itens: [], resultados: [] };
  const peds = await sb(`sadt_pedidos?or=(${filtros.join(",")})&select=*&order=criado_em.desc`);
  const pedidos = listaLida(peds);
  // ⚠️ A MARCA DE FALHA ATRAVESSA para os três: se não deu para ler os
  // pedidos, a tela não pode receber "este paciente não tem exame" nas
  // outras duas listas. Devolver a mesma referência marcada é o que faz
  // `naoDeuParaLer` responder a verdade nas três.
  if (!pedidos.length) return { pedidos, itens: pedidos, resultados: pedidos };
  const itens = await loadSadtItens(sb, pedidos.map(p => p.id));
  const resultados = itens.length ? await loadSadtResultados(sb, itens.map(i => i.id)) : [];
  return { pedidos, itens, resultados };
}
