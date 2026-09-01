// ═══════════════════════════════════════════════════════════
// DADOS DA CONCILIAÇÃO — só leitura
//
// A conciliação só vale com o histórico INTEIRO. Meia lista comparada com
// o saldo cheio acusaria rombo em quase todo lote, e a equipe iria caçar
// dinheiro que não sumiu. Por isso esta camada tem uma única obrigação:
// trazer tudo, ou dizer honestamente que não trouxe.
//
// Os loaders que já existem no App.jsx (`loadSupMovimentos`) usam `limit`
// fixo — servem para mostrar o kardex de um item na tela, não para somar.
// Daí o carregamento próprio aqui.
//
// `sb` entra por parâmetro (padrão de `src/atendimento/dados.js`), então o
// teste injeta um falso e não toca a rede.
// ═══════════════════════════════════════════════════════════

import { conciliar } from "./kardex.js";
import { nowISO } from "../util/datas.js";

/** Linhas por requisição. O PostgREST tem teto próprio; 1000 é conservador. */
export const PAGINA = 1000;
/** Teto de segurança: acima disso a tela diz "não conferido" em vez de travar o navegador. */
export const TETO_MOVIMENTOS = 40000;

/** Só as colunas que a soma precisa — o kardex inteiro em `select=*` seria pesado à toa. */
export const COLUNAS_MOVIMENTO = "id,item_id,lote_id,tipo,quantidade";
export const COLUNAS_LOTE = "id,item_id,lote,validade,quantidade";

/**
 * Onde mora o estoque de cada módulo.
 *
 * Almoxarifado e farmácia são o MESMO kardex com nomes diferentes: saldo
 * mantido em `*_lotes`, histórico paralelo em `*_movimentos`, aplicados
 * por trigger. As duas fontes se separam pelos mesmos três caminhos, e um
 * detector escrito duas vezes é um detector que vai divergir.
 */
export const ORIGENS = {
  suprimentos: { movimentos: "sup_movimentos",  lotes: "sup_lotes",  chave: "item_id" },
  farmacia:    { movimentos: "farm_movimentos", lotes: "farm_lotes", chave: "medicamento_id" },
};

/**
 * Percorre uma tabela inteira por CHAVE, não por offset.
 *
 * Offset em tabela que recebe inserção durante a leitura pula e repete
 * linha — e numa conciliação isso vira divergência inventada. Paginar por
 * `id > último` é estável: `sup_movimentos` é append-only (não há política
 * de update nem de delete), então o que já foi lido não se move.
 *
 * Devolve `null` em qualquer falha — inclusive no meio da paginação. Meia
 * lista é pior que lista nenhuma aqui, porque parece completa.
 */
export async function carregarTudoPorId(sb, tabela, colunas, { pagina = PAGINA, teto = TETO_MOVIMENTOS } = {}) {
  const linhas = [];
  let desdeId = 0;
  for (;;) {
    const rows = await Promise.resolve(
      sb(`${tabela}?id=gt.${desdeId}&select=${colunas}&order=id.asc&limit=${pagina}`)
    ).catch(() => null);
    if (!Array.isArray(rows)) return { linhas: null, completo: false };
    linhas.push(...rows);
    if (rows.length < pagina) return { linhas, completo: true };   // acabou antes do teto
    desdeId = rows[rows.length - 1].id;
    if (linhas.length >= teto) return { linhas, completo: false }; // bateu no teto
  }
}

/**
 * Concilia o kardex com o saldo dos lotes, agora.
 *
 * Devolve o mesmo formato de `conciliar`, com `conciliavel: false` quando
 * qualquer uma das duas leituras falhou ou veio truncada.
 */
export async function conciliarAgora(sb, opcoes = {}) {
  const { origem = "suprimentos", ...resto } = opcoes;
  const o = ORIGENS[origem] || ORIGENS.suprimentos;
  const colMov = `id,${o.chave},lote_id,tipo,quantidade`;
  const colLote = `id,${o.chave},lote,validade,quantidade`;
  const [mv, lt] = await Promise.all([
    carregarTudoPorId(sb, o.movimentos, colMov, resto),
    carregarTudoPorId(sb, o.lotes, colLote, resto),
  ]);
  const completo = mv.completo && lt.completo;
  return {
    ...conciliar(mv.linhas, lt.linhas, { historicoCompleto: completo, chave: o.chave }),
    // Por que não conciliou — a tela precisa distinguir "não deu para ler"
    // de "li demais": o primeiro é problema de acesso, o segundo é volume.
    motivo: mv.linhas == null || lt.linhas == null ? "falha"
          : !completo ? "truncado" : null,
    movimentosLidos: mv.linhas?.length ?? 0,
  };
}

// ═══════════════════════════════════════════════════════════
// AS TABELAS DO ALMOXARIFADO
//
// Saiu do App.jsx e veio para cá, junto da conciliação de kardex que já
// morava neste arquivo: as duas falam com `sup_movimentos` e `sup_lotes`,
// e mantê-las separadas faria a conciliação e a tela lerem por caminhos
// diferentes a mesma coisa.
//
// ⚠️ `sb` é parâmetro, como em ../ps/dados.js e ../farmacia/dados.js.
// Nulo = sem banco.
// ═══════════════════════════════════════════════════════════

export async function loadSupItens(sb) {
  const rows = await sb("sup_itens?select=*&order=nome");
  return Array.isArray(rows) ? rows : [];
}
export async function loadSupLotes(sb) {
  const rows = await sb("sup_lotes?select=*&order=validade.asc.nullslast");
  return Array.isArray(rows) ? rows : [];
}
export async function loadSupMovimentos(sb, itemId, limit = 60) {
  const q = itemId
    ? `sup_movimentos?item_id=eq.${itemId}&select=*&order=created_at.desc&limit=${limit}`
    : `sup_movimentos?select=*&order=created_at.desc&limit=${limit}`;
  const rows = await sb(q);
  return Array.isArray(rows) ? rows : [];
}
export async function loadSupMovimentosPeriodo(sb, fromISO, toISO) {
  const rows = await sb(`sup_movimentos?created_at=gte.${fromISO}&created_at=lt.${toISO}&select=*&order=created_at.desc&limit=8000`);
  return Array.isArray(rows) ? rows : [];
}
// Saídas desde uma data (para previsão de demanda)
export async function loadSupSaidasDesde(sb, fromISO) {
  const rows = await sb(`sup_movimentos?tipo=eq.saida&created_at=gte.${fromISO}&select=item_id,quantidade&limit=12000`);
  return Array.isArray(rows) ? rows : [];
}
export async function upsertSupItemRemote(sb, item, user) {
  if (!sb) return null;
  const body = { ...item, usuario: user?.name || null, updated_at: nowISO() };
  if (item.id) {
    await sb(`sup_itens?id=eq.${item.id}`, { method: "PATCH", body: JSON.stringify(body) });
    return null;
  }
  delete body.id;
  return await sb("sup_itens", { method: "POST", headers: { "Prefer": "return=representation" }, body: JSON.stringify(body) });
}
// Exclusão de material: devolve { ok, erro }. O trigger `sup_item_protege_kardex`
// RECUSA a exclusão quando há movimento no histórico — e o `sb` engole a
// mensagem (além de o PostgREST responder 204 mesmo sem apagar linha nenhuma).
// Sem o fetch direto, a tela mandaria excluir, nada aconteceria, e ninguém
// saberia por quê. Mesmo padrão de `addSupMovimentoRemote`.
/**
 * Exclui um item do catálogo e DEVOLVE O MOTIVO quando o banco recusa.
 *
 * 🔴 Recebe o `sbCru`, e não o `sb`. A recusa aqui é quase sempre chave
 * estrangeira: o item tem movimento, lote ou requisição apontando para ele.
 * Com o `sb`, que devolve `null` em qualquer erro, a tela diria só "não
 * deu" — e quem está no almoxarifado precisa saber que o item TEM
 * histórico, porque a saída é inativar, não excluir.
 */
export async function deleteSupItemRemote(sbCru, id) {
  if (!sbCru) return { ok: true };
  return sbCru(`sup_itens?id=eq.${id}`, null, { method: "DELETE" });
}
// Movimento de estoque: retorna { ok, erro } — o trigger pode barrar (estoque insuficiente),
// e como o sb engole erros, aqui fazemos o fetch direto para capturar a mensagem.
/**
 * Registra um movimento de estoque e DEVOLVE O MOTIVO da recusa.
 *
 * 🔴 Mesma razão do movimento da Farmácia: a recusa vem de GATILHO do banco
 * ("saldo insuficiente", "lote vencido", "movimento sem lote"), e quem está
 * separando material precisa LER o motivo, não um "não deu".
 */
export async function addSupMovimentoRemote(sbCru, mov, user) {
  if (!sbCru) return { ok: false, erro: "Supabase indisponível." };
  return sbCru("sup_movimentos", { ...mov, usuario: user?.name || null });
}
export async function loadSupFornecedores(sb) {
  const rows = await sb("sup_fornecedores?select=*&order=nome");
  return Array.isArray(rows) ? rows : [];
}
export async function upsertSupFornecedorRemote(sb, f, user) {
  if (!sb) return null;
  const body = { ...f, usuario: user?.name || null, updated_at: nowISO() };
  if (f.id) {
    await sb(`sup_fornecedores?id=eq.${f.id}`, { method: "PATCH", body: JSON.stringify(body) });
    return null;
  }
  delete body.id;
  return await sb("sup_fornecedores", { method: "POST", headers: { "Prefer": "return=representation" }, body: JSON.stringify(body) });
}
export async function deleteSupFornecedorRemote(sb, id) {
  if (!sb) return;
  await sb(`sup_fornecedores?id=eq.${id}`, { method: "DELETE" });
}
// Inventário cíclico — contagens cegas (append-only)
// Entradas recentes com fornecedor, para saber o prazo de entrega de cada item
export async function loadSupEntradasComForn(sb, fromISO) {
  const rows = await sb(`sup_movimentos?tipo=eq.entrada&fornecedor_id=not.is.null&created_at=gte.${fromISO}&select=item_id,fornecedor_id,created_at&order=created_at.desc&limit=8000`);
  return Array.isArray(rows) ? rows : [];
}
export async function loadSupInventarios(sb, limit = 400) {
  const rows = await sb(`sup_inventarios?select=*&order=created_at.desc&limit=${limit}`);
  return Array.isArray(rows) ? rows : [];
}
// Devolve a linha criada (precisamos do id para amarrar os movimentos de
// ajuste à contagem, via `documento = INV-<id>`).
export async function addSupInventarioRemote(sb, inv, user) {
  if (!sb) return null;
  const r = await sb("sup_inventarios", {
    method: "POST",
    headers: { "Prefer": "return=representation" },
    body: JSON.stringify({ ...inv, usuario: user?.name || null }),
  });
  return Array.isArray(r) ? r[0] : r;
}
export async function setSupItemCustoRemote(sb, itemId, custo) {
  if (!sb || custo == null) return;
  await sb(`sup_itens?id=eq.${itemId}`, { method: "PATCH", body: JSON.stringify({ custo_unitario: Number(custo), updated_at: nowISO() }) });
}
// Requisições de materiais (Fase B)
export async function loadSupRequisicoes(sb, limit = 200) {
  const rows = await sb(`sup_requisicoes?select=*&order=created_at.desc&limit=${limit}`);
  return Array.isArray(rows) ? rows : [];
}
export async function addSupRequisicaoRemote(sb, req, user) {
  if (!sb) return null;
  return await sb("sup_requisicoes", {
    method: "POST",
    headers: { "Prefer": "return=representation" },
    body: JSON.stringify({ ...req, solicitado_por: user?.name || null, usuario: user?.name || null }),
  });
}
export async function atualizarSupReqRemote(sb, id, campos) {
  if (!sb) return;
  await sb(`sup_requisicoes?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ ...campos, updated_at: nowISO() }) });
}
// Pedidos de compra (Fase C)
export async function loadSupPedidos(sb, limit = 200) {
  const rows = await sb(`sup_pedidos?select=*&order=created_at.desc&limit=${limit}`);
  return Array.isArray(rows) ? rows : [];
}
export async function addSupPedidoRemote(sb, ped, user) {
  if (!sb) return null;
  return await sb("sup_pedidos", {
    method: "POST",
    headers: { "Prefer": "return=representation" },
    body: JSON.stringify({ ...ped, usuario: user?.name || null }),
  });
}
export async function atualizarSupPedidoRemote(sb, id, campos) {
  if (!sb) return;
  await sb(`sup_pedidos?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ ...campos, updated_at: nowISO() }) });
}
// Cotações de compra (comparar preços entre fornecedores)
export async function loadSupCotacoes(sb, limit = 100) {
  const rows = await sb(`sup_cotacoes?select=*&order=created_at.desc&limit=${limit}`);
  return Array.isArray(rows) ? rows : [];
}
export async function addSupCotacaoRemote(sb, cot, user) {
  if (!sb) return null;
  return await sb("sup_cotacoes", {
    method: "POST",
    headers: { "Prefer": "return=representation" },
    body: JSON.stringify({ ...cot, usuario: user?.name || null }),
  });
}
export async function atualizarSupCotacaoRemote(sb, id, campos) {
  if (!sb) return;
  await sb(`sup_cotacoes?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ ...campos, updated_at: nowISO() }) });
}
