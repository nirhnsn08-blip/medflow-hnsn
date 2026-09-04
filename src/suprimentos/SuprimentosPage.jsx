// ═══════════════════════════════════════════════════════════
// ALMOXARIFADO — A TELA
//
// Saiu do App.jsx: 540 linhas próprias e 2.710 exclusivas. O catálogo está
// em ./catalogo.js e o acesso ao banco em ./dados.js, junto da conciliação
// de kardex.
//
// 🔴 `SupInventarioView` e `SupContagemModal` SÃO EXPORTADAS de propósito.
// A Farmácia renderiza a mesma view com `chave="medicamento_id"` em vez de
// `item_id`: contagem cega, curva ABC, acuracidade e conciliação são a
// mesma regra nos dois módulos, e duas cópias divergiriam na primeira
// mudança. É o único componente do sistema que dois módulos compartilham.
//
// ⚠️ DUAS PROPS DE REDE:
//   `sb`     a função normal — engole a falha e devolve `null`.
//   `sbCru`  grava e devolve `{ ok, erro }`. Duas escritas usam: o
//            movimento de estoque (recusa por gatilho) e a exclusão de item
//            (recusa por chave estrangeira — a saída é INATIVAR).
// ═══════════════════════════════════════════════════════════

import { registrarAuditoria } from "../auditoria/dados.js";
import { farmFmtQtd, normTxt } from "../clinico/alertas.js";
import { FARM_PREV_HORIZONTE, FARM_PREV_JANELA } from "../farmacia/catalogo.js";
import { addFarmMovimentoRemote, loadFarmLotes, loadFarmMedicamentos, loadFarmMovimentosPeriodo, loadFarmSaidasDesde } from "../farmacia/dados.js";
import { custoUnit, saldoDoMedicamento } from "../farmacia/estoque.js";
import { DIAS_VENCENDO, infoDeValidade } from "../farmacia/validade.js";
import { loadSetoresFromSupabase } from "../leitos/dados.js";
import { AvisoLeitura, HOSPITAL_NOME, Icon, MONTHS_FULL, VX, btnContorno, campoTexto, rotuloCampo } from "../ui/base.jsx";
import { avisoSonoro, ligarSom, somLigado } from "../ui/som.js";
import { comGrupos } from "../ui/sub-nav.js";
import { fmtDataBR, nowISO } from "../util/datas.js";
import { fmtBRL, fmtReais } from "../util/formato.js";
import { descreverAlcada, podeAprovarPedido, validarLimite } from "./aprovacao.js";
import { SUP_CATEGORIAS, SUP_EXEC_COBERTURA_ALVO, SUP_FARMACOS_MONITORADOS, SUP_INV_INTERVALO, SUP_MOTIVOS_SAIDA, SUP_PED_STATUS, SUP_REQ_STATUS, SUP_UNIDADES } from "./catalogo.js";
import { comprarParaConsumo, consumoParaCompra, custoPorUnidadeCompra, custoPorUnidadeConsumo, descreverEntrada, rotuloCompra, temConversao, validarConversao } from "./conversao.js";
import { addSupCotacaoRemote, addSupInventarioRemote, addSupMovimentoRemote, addSupPedidoRemote, addSupRequisicaoRemote, atualizarSupCotacaoRemote, atualizarSupPedidoRemote, atualizarSupReqRemote, deleteSupFornecedorRemote, deleteSupItemRemote, loadSupCotacoes, loadSupEntradasComForn, loadSupFornecedores, loadSupInventarios, loadSupItens, loadSupLotes, loadSupMovimentos, loadSupMovimentosPeriodo, loadSupPedidos, loadSupRequisicoes, loadSupSaidasDesde, setSupItemCustoRemote, upsertSupFornecedorRemote, upsertSupItemRemote } from "./dados.js";
import { MOTIVO_AJUSTE, descreverPlano, documentoDaContagem, idsJaEstornados, movimentoDeEstorno, planejarAjuste, podeEstornar } from "./inventario.js";
import { SUP_LEAD_PADRAO, SUP_MARGEM_SEG, custoMedioPonderado, supLeadTimeMap, supPedidoTotal, supPrazoReposicao, supSaldoTotal } from "./kardex.js";
import { carregarAlcada, salvarAlcada, carregarCobertura, salvarCobertura } from "./parametros.js";
import { casarComCatalogo, ehSetorNovo } from "./setores.js";
import { useEffect, useRef, useState } from "react";
import ConciliacaoKardex from "./ConciliacaoKardex.jsx";
import PrimeiroUso from "../ui/PrimeiroUso.jsx";
import { useChecagens } from "../ui/usar-checagens.js";

// O cadastro que sustenta este painel. Enquanto ele estiver vazio, os
// números abaixo são zero por falta de configuração — não por falta de
// movimento, que é como um painel zerado se lê. Ver `ui/primeiro-uso.js`.
const BASE_SUPRIMENTOS = [
  { o: "materiais", tabela: "sup_itens", onde: "Suprimentos → Estoque → + Novo item" },
  { o: "fornecedores", tabela: "sup_fornecedores", onde: "Suprimentos → Fornecedores → + Novo fornecedor" },
];

// Barra lateral interna (Fases B e C acrescentam requisições, compras e BI)
// Ordenado pelo FLUXO do almoxarife. Dois itens estavam no lugar errado:
// "Painel executivo" é leitura de GESTOR e ficava em 3º, no meio do caminho
// de quem opera; e "Fornecedores" — que Cotações e Compras exigem para
// funcionar — ficava em 12º, depois de tudo que depende dele.
//
// "Ações de hoje" fica no topo, fora de grupo: é a lista do dia, e o texto
// do próprio módulo a descreve como "tudo que precisa de decisão hoje, em
// ordem de prioridade".
const SUP_NAV = [
  { key: "dashboard",    label: "Dashboard",     icon: "dashboard" },
  { key: "acoes",        label: "Ações de hoje", icon: "checks" },

  { key: "requisicoes",  label: "Requisições",   icon: "list", grupo: "Atender o hospital" },

  { key: "cotacoes",     label: "Cotações",      icon: "flask",  grupo: "Comprar" },
  { key: "compras",      label: "Compras",       icon: "cart",   grupo: "Comprar" },
  { key: "aprovacoes",   label: "Aprovações",    icon: "shield", grupo: "Comprar" },
  { key: "fornecedores", label: "Fornecedores",  icon: "truck",  grupo: "Comprar" },

  { key: "estoque",      label: "Estoque",       icon: "box",       grupo: "Estoque" },
  { key: "inventario",   label: "Inventário",    icon: "clipboard", grupo: "Estoque" },

  { key: "preditivo",    label: "Estoque preditivo", icon: "activity", grupo: "Antecipar" },
  { key: "vencimentos",  label: "Vencimentos",   icon: "clock",       grupo: "Antecipar" },

  { key: "executivo",    label: "Painel executivo", icon: "briefcase", grupo: "Acompanhar" },
  { key: "indicadores",  label: "Indicadores",   icon: "chart", grupo: "Acompanhar" },
  { key: "assistente",   label: "Assistente AI", icon: "chat",  grupo: "Acompanhar" },
];

const SUP_ASSIST_HELP = 'Posso responder sobre: panorama do almoxarifado, o que vai faltar (previsão 7 dias), zerados/abaixo do mínimo, validade (lista de lotes), consumo do mês (top materiais, por setor, por categoria), gasto do mês (por fornecedor), requisições pendentes, pedidos de compra abertos, fornecedores e tamanho do catálogo. Ex.: "panorama", "o que vai faltar?", "consumo por setor", "gasto do mês", "quais vencendo?", "saldo de luva".';

// Grava o DESFECHO da contagem (o ajuste entrou? por que não?).
//
// Confere o retorno em vez do status, porque o status mente: sem política
// de UPDATE, o PostgREST respondia 200 com `[]` — zero linhas alteradas — e
// o código dava por gravado. A contagem ficava para sempre com o desfecho
// em branco, que é a mesma cegueira que este PR veio consertar.
// A política `sup_inv_update_desfecho` (migração) abre a janela; aqui se
// confirma que ela pegou.
async function marcarInventarioRemote(sb, id, campos) {
  if (!sb) return { ok: false, erro: "Supabase indisponível." };
  const r = await sb(`sup_inventarios?id=eq.${id}`, {
    method: "PATCH",
    headers: { "Prefer": "return=representation" },
    body: JSON.stringify(campos),
  });
  const linhas = Array.isArray(r) ? r : r ? [r] : [];
  if (!linhas.length) return { ok: false, erro: "A gravação não alterou nenhuma linha." };
  return { ok: true, linha: linhas[0] };
}

// Lê o XML de uma NF-e e extrai fornecedor + itens (código, EAN, nome, qtd,
// unidade, custo unitário, lote/validade quando há rastreabilidade). Local, sem lib.
function parseNFe(xmlText) {
  let doc;
  try { doc = new DOMParser().parseFromString(xmlText, "application/xml"); }
  catch { return { erro: "Não consegui ler o arquivo." }; }
  if (!doc || doc.getElementsByTagName("parsererror").length) return { erro: "XML inválido ou corrompido." };
  const txt = (el, tag) => el ? (el.getElementsByTagName(tag)[0]?.textContent || "").trim() : "";
  const emit = doc.getElementsByTagName("emit")[0];
  const ide  = doc.getElementsByTagName("ide")[0];
  if (!emit && !doc.getElementsByTagName("det").length) return { erro: "Este arquivo não parece uma NF-e." };
  const fornecedor = { cnpj: txt(emit, "CNPJ"), nome: txt(emit, "xNome") };
  const nf = txt(ide, "nNF");
  const itens = Array.from(doc.getElementsByTagName("det")).map(det => {
    const prod = det.getElementsByTagName("prod")[0];
    const rastro = det.getElementsByTagName("rastro")[0];
    const ean = txt(prod, "cEAN");
    return {
      codigo: txt(prod, "cProd"),
      ean: /^[0-9]{8,14}$/.test(ean) ? ean : "",         // "SEM GTIN" e afins → ignora
      nome: txt(prod, "xProd"),
      unidade: txt(prod, "uCom").toLowerCase(),
      qtd: Number(txt(prod, "qCom")) || 0,
      custo_unit: Number(txt(prod, "vUnCom")) || 0,
      lote: rastro ? txt(rastro, "nLote") : "",
      validade: rastro ? txt(rastro, "dVal") : "",        // rastro/dVal já vem YYYY-MM-DD
    };
  }).filter(x => x.nome && x.qtd > 0);
  if (!itens.length) return { erro: "Nenhum item encontrado no XML." };
  return { fornecedor, nf, itens };
}

async function setFarmMedCustoRemote(sb, medId, custo) {
  if (!sb || custo == null) return;
  await sb(`farm_medicamentos?id=eq.${medId}`, { method: "PATCH", body: JSON.stringify({ custo_unitario: Number(custo), updated_at: nowISO() }) });
}

export default function SuprimentosPage({ sb, sbCru, currentUser, canEdit }) {
  const [itens, setItens] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [forns, setForns] = useState([]);
  const [busca, setBusca] = useState("");
  const [catFiltro, setCatFiltro] = useState("");
  const [showItem, setShowItem] = useState(null);   // objeto (novo/editar) ou null
  const [movItem, setMovItem]   = useState(null);   // { item, tipo }
  const [kardex, setKardex]     = useState(null);   // item para histórico
  const [showForn, setShowForn] = useState(null);   // fornecedor (novo/editar) ou null
  const [showNfe, setShowNfe] = useState(false);    // modal de importar NF-e
  const [sub, setSub] = useState("dashboard");      // ver SUP_NAV
  const [saidasHist, setSaidasHist] = useState([]);
  const [, setTick] = useState(0);
  const isMaster = currentUser?.role === "adm_master";

  const [reqs, setReqs] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [invs, setInvs] = useState([]);
  const [entradasForn, setEntradasForn] = useState([]);
  const [cotacoes, setCotacoes] = useState([]);
  const [setoresCat, setSetoresCat] = useState([]);
  const [alcada, setAlcada] = useState(null);   // limite em R$; null = desligada
  // 🔴 O ALVO DE COBERTURA vem do banco. Era `30` cravado no código, e
  // trinta dias não é verdade universal: capital repõe em três dias, interior
  // em quinze. É esse número que decide o "capital liberável" que a diretoria
  // lê no painel executivo. `padrao: true` diz que ninguém configurou ainda.
  const [cobertura, setCobertura] = useState({ dias: null, padrao: true });
  function refresh() {
    if (!sb) return;
    loadSupItens(sb).then(setItens);
    loadSupLotes(sb).then(setLotes);
    loadSupFornecedores(sb).then(setForns);
    loadSupRequisicoes(sb).then(setReqs);
    loadSupPedidos(sb).then(setPedidos);
    loadSupCotacoes(sb).then(setCotacoes);
    loadSupInventarios(sb).then(setInvs);
    loadSupEntradasComForn(sb, new Date(Date.now() - 180 * 86400000).toISOString()).then(setEntradasForn);
    loadSupSaidasDesde(sb, new Date(Date.now() - FARM_PREV_JANELA * 86400000).toISOString()).then(setSaidasHist);
    // O catálogo de setores alimenta a saída manual — sem ele, o destino é
    // texto livre e o consumo por setor se fragmenta por grafia.
    loadSetoresFromSupabase(sb).then(r => r && setSetoresCat(r));
    carregarAlcada(sb).then(setAlcada);
    carregarCobertura(sb).then(setCobertura);
  }
  const leadMap = supLeadTimeMap(entradasForn, forns);   // item_id → prazo de entrega (dias)
  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => { window.removeEventListener("focus", onFocus); clearInterval(id); };
  }, []);

  const itensOrd = [...itens].filter(i => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    return [i.nome, i.categoria, i.observacao, i.codigo_barras].some(x => (x || "").toLowerCase().includes(q));
  }).sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));

  const ordCat = (a, b) => { const ia = SUP_CATEGORIAS.indexOf(a), ib = SUP_CATEGORIAS.indexOf(b); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b, "pt-BR"); };
  const catsPresentes = [...new Set(itens.map(i => i.categoria || "Outros"))].sort(ordCat);
  const itensView = itensOrd.filter(i => !catFiltro || (i.categoria || "Outros") === catFiltro);
  const grupos = {};
  itensView.forEach(i => { const c = i.categoria || "Outros"; (grupos[c] = grupos[c] || []).push(i); });
  const gruposOrd = Object.keys(grupos).sort(ordCat);

  // Situação de estoque de cada item
  function statusItem(i) {
    const saldo = supSaldoTotal(i.id, lotes);
    const min = Number(i.estoque_minimo || 0);
    if (saldo <= 0) return { key: "zerado", cor: "#f43f5e", label: "Sem estoque", saldo };
    if (min > 0 && saldo <= min) return { key: "baixo", cor: "#d97706", label: "Abaixo do mínimo", saldo };
    return { key: "ok", cor: "#34d399", label: "OK", saldo };
  }
  // Lote de validade mais próxima (com saldo) de um item
  function loteCritico(i) {
    const ls = lotes.filter(l => l.item_id === i.id && Number(l.quantidade) > 0 && l.validade);
    if (!ls.length) return null;
    return ls.sort((a, b) => a.validade.localeCompare(b.validade))[0];
  }

  // Painéis de alerta
  const alertasBaixo = itensOrd.filter(i => i.ativo !== false && ["baixo", "zerado"].includes(statusItem(i).key));
  const lotesAlerta = lotes.filter(l => Number(l.quantidade) > 0 && ["vencido", "vencendo"].includes(infoDeValidade(l.validade).status));

  // Previsão de demanda (consumo dos últimos FARM_PREV_JANELA dias)
  const consumoMap = {};
  saidasHist.forEach(s => { if (s.item_id) consumoMap[s.item_id] = (consumoMap[s.item_id] || 0) + Number(s.quantidade || 0); });
  const previsao = i => {
    const media = (consumoMap[i.id] || 0) / FARM_PREV_JANELA;
    const saldo = supSaldoTotal(i.id, lotes);
    const cobertura = media > 0 ? saldo / media : null;      // dias de estoque
    const demanda7 = media * FARM_PREV_HORIZONTE;
    const sugestao = Math.max(0, Math.ceil(demanda7 + Number(i.estoque_minimo || 0) - saldo));
    return { media, saldo, cobertura, demanda7, sugestao };
  };
  const emRisco = itens.filter(i => i.ativo !== false).map(i => ({ i, ...previsao(i) }))
    .filter(x => x.media > 0 && x.cobertura != null && x.cobertura < FARM_PREV_HORIZONTE)
    .sort((a, b) => a.cobertura - b.cobertura);

  async function salvarItem(item) {
    await upsertSupItemRemote(sb, item, currentUser);
    registrarAuditoria(sb, currentUser, item.id ? "editar material" : "cadastrar material", item.nome, {});
    setShowItem(null);
    setTimeout(refresh, 350);
  }
  async function excluirItem(i) {
    if (!confirm(`Excluir "${i.nome}"? Só é possível enquanto o material não tiver nenhum movimento de estoque.`)) return;
    const r = await deleteSupItemRemote(sbCru, i.id);
    // O banco recusa a exclusão de material com histórico — o kardex é
    // imutável de verdade agora. Mostrar o motivo em vez de deixar a tela
    // parecer que obedeceu.
    if (!r.ok) { alert("Não foi possível excluir o material.\n\n" + (r.erro || "")); return; }
    registrarAuditoria(sb, currentUser, "excluir material", i.nome, {});
    setTimeout(refresh, 300);
  }
  async function registrarMov(mov) {
    const item = itens.find(x => x.id === mov.item_id);
    const saldoAntes = supSaldoTotal(mov.item_id, lotes);
    const r = await addSupMovimentoRemote(sbCru, mov, currentUser);
    if (!r.ok) { alert("Não foi possível registrar o movimento.\n" + (r.erro || "")); return false; }
    // Entrada com custo → atualiza o custo médio ponderado do material
    if (mov.tipo === "entrada" && mov.custo_unit) {
      const novo = custoMedioPonderado(item?.custo_unitario, saldoAntes, mov.quantidade, mov.custo_unit);
      if (novo != null) await setSupItemCustoRemote(sb, mov.item_id, novo);
    }
    registrarAuditoria(sb, currentUser, mov.tipo === "entrada" ? "entrada de material" : "saída de material", `${item?.nome || mov.item_id} · ${farmFmtQtd(mov.quantidade)}`, {});
    setMovItem(null);
    setTimeout(refresh, 350);
    return true;
  }
  // Importa uma NF-e: cria entradas em lote (e materiais/fornecedor novos, se preciso)
  async function importarNfe({ fornecedor, nf, linhas }) {
    // fornecedor: casa por CNPJ; se não existir e vier CNPJ, cria
    let fornId = null;
    if (fornecedor?.cnpj) {
      const achado = forns.find(f => (f.cnpj || "").replace(/\D/g, "") === fornecedor.cnpj.replace(/\D/g, ""));
      if (achado) fornId = achado.id;
      else {
        const criado = await upsertSupFornecedorRemote(sb, { nome: fornecedor.nome || fornecedor.cnpj, cnpj: fornecedor.cnpj, ativo: true }, currentUser);
        fornId = Array.isArray(criado) ? criado[0]?.id : null;
      }
    }
    let ok = 0; const erros = [];
    for (const ln of linhas) {
      if (ln.alvo === "skip") continue;
      let itemId = ln.alvo === "novo" ? null : Number(ln.alvo);
      if (ln.alvo === "novo") {
        const novo = await upsertSupItemRemote(sb, { nome: ln.nome, unidade: ln.unidade || "unidade", codigo_barras: ln.ean || null, custo_unitario: ln.custo_unit || null, ativo: true }, currentUser);
        itemId = Array.isArray(novo) ? novo[0]?.id : null;
        if (!itemId) { erros.push(`${ln.nome}: falha ao criar o material`); continue; }
      }
      // A NF-e traz quantidade e valor na unidade COMERCIAL do fornecedor
      // (a caixa). Converter aqui, como no recebimento manual, senão a
      // importação é justamente o caminho que entra mais rápido e mais
      // errado. Material sem fator → 1, idêntico ao comportamento antigo.
      const mat = itens.find(x => x.id === itemId);
      const qConsumo = comprarParaConsumo(ln.qtd, mat);
      const custoConsumo = custoPorUnidadeConsumo(ln.custo_unit, mat);
      const saldoAntes = supSaldoTotal(itemId, lotes);
      const r = await addSupMovimentoRemote(sbCru, {
        item_id: itemId, tipo: "entrada", quantidade: qConsumo,
        lote: ln.lote?.trim() || null, validade: ln.validade || null,
        motivo: "Compra / nota fiscal", documento: nf ? `NF ${nf}` : "NF-e",
        fornecedor_id: fornId, custo_unit: custoConsumo,
      }, currentUser);
      if (r.ok) {
        ok++;
        if (custoConsumo != null) { const c = custoMedioPonderado(mat?.custo_unitario, saldoAntes, qConsumo, custoConsumo); if (c != null) await setSupItemCustoRemote(sb, itemId, c); }
      } else erros.push(`${ln.nome}: ${r.erro || "falha"}`);
    }
    registrarAuditoria(sb, currentUser, "importar NF-e", `${nf ? "NF " + nf : "NF-e"} · ${ok} entrada(s)`, {});
    setShowNfe(false);
    setTimeout(refresh, 400);
    alert(`Importação concluída: ${ok} entrada(s) lançada(s).` + (erros.length ? `\n\nPendências:\n${erros.join("\n")}` : ""));
  }
  // A contagem é gravada SEMPRE; o ajuste é uma segunda etapa que pode
  // falhar. A versão antiga misturava as duas: mandava o movimento sem
  // lote, não conferia o retorno, e `ajustado` já vinha `true` do modal.
  // Quando o trigger recusava ("Estoque insuficiente no lote", porque o
  // balde genérico está vazio num item com lotes nomeados), o saldo não
  // mudava e a acuracidade passava a mentir — e mentia para sempre, porque
  // a contagem seguinte acharia a mesma divergência.
  //
  // Agora: grava a contagem com `ajustado: false`, tenta o plano de ajuste
  // lote a lote, e só marca `ajustado` se o kardex realmente aceitou. Se
  // não aceitou, a linha guarda o motivo em `ajuste_erro` em vez de fingir.
  async function salvarInventario(inv, plano = []) {
    const linha = await addSupInventarioRemote(sb, { ...inv, ajustado: false }, currentUser);
    const it = itens.find(x => x.id === inv.item_id);
    registrarAuditoria(sb, currentUser, "contagem de inventário", `${it?.nome || inv.item_id} · sistema ${farmFmtQtd(inv.saldo_sistema)} → contado ${farmFmtQtd(inv.contado)}`, {});

    if (!plano.length) { setTimeout(refresh, 350); return { ok: true }; }
    if (!linha?.id) {
      alert("A contagem não pôde ser gravada, então o ajuste não foi lançado.");
      setTimeout(refresh, 350);
      return { ok: false, erro: "contagem não gravada" };
    }

    const doc = documentoDaContagem(linha.id);
    const erros = [];
    let lancados = 0;
    for (const p of plano) {
      const r = await addSupMovimentoRemote(sbCru, {
        item_id: inv.item_id, lote: p.lote, validade: p.validade || null,
        tipo: p.tipo, quantidade: p.quantidade,
        motivo: MOTIVO_AJUSTE, documento: doc,
      }, currentUser);
      if (r.ok) lancados++; else erros.push(`${p.lote || "sem lote"}: ${r.erro}`);
    }

    // Parcial conta como NÃO ajustado: se um dos passos falhou, o saldo não
    // chegou ao valor contado, e dizer "ajustado" seria a mesma mentira de
    // antes, só que menor.
    const completo = erros.length === 0;
    const marcou = await marcarInventarioRemote(sb, linha.id, {
      ajustado: completo,
      autorizado_por: currentUser?.name || null,
      ajuste_erro: completo ? null : erros.join(" · ").slice(0, 500),
    });
    // O estoque já foi mexido; se só o desfecho não gravou, o problema é de
    // registro, não de saldo — e dizer isso é melhor que deixar a contagem
    // parecendo que nunca foi ajustada.
    if (!marcou.ok) {
      alert(`O ajuste do estoque foi feito, mas o desfecho não pôde ser gravado na contagem ${doc}.\n\n` +
        `${marcou.erro}\n\nO kardex está correto; a contagem é que ficou sem o registro de quem autorizou.`);
    }
    if (!completo) {
      alert(`A contagem foi registrada, mas o ajuste do estoque NÃO foi concluído.\n\n${erros.join("\n")}\n\n` +
        (lancados ? `${lancados} de ${plano.length} lançamento(s) entraram — o saldo ficou entre o antigo e o contado.\n\n` : "") +
        "O motivo ficou guardado na contagem. Confira e refaça.");
    }
    registrarAuditoria(sb, currentUser, completo ? "ajuste de inventário" : "ajuste de inventário RECUSADO",
      `${it?.nome || inv.item_id} · ${doc} · ${descreverPlano(plano)}${completo ? "" : ` · ${erros.join(" · ")}`}`, {});
    setTimeout(refresh, 350);
    return { ok: completo, erro: erros.join(" · ") || null };
  }

  // Estorno: o kardex é append-only, então desfazer é criar o movimento
  // oposto APONTANDO para o original — nunca apagar. O banco garante que
  // cada movimento só é estornado uma vez (índice único em `estorno_de`) e
  // que o estorno é mesmo o oposto (mesmo item, lote e quantidade).
  async function estornarMovimento(mv, jaEstornados) {
    const pode = podeEstornar(mv, jaEstornados);
    if (!pode.ok) { alert(pode.motivo); return false; }
    const it = itens.find(x => x.id === mv.item_id);
    const oposto = mv.tipo === "entrada" ? "saída" : "entrada";
    if (!confirm(
      `Estornar este movimento?\n\n${mv.tipo === "entrada" ? "Entrada" : "Saída"} de ${farmFmtQtd(mv.quantidade)}` +
      `${mv.lote ? ` no lote ${mv.lote}` : ""} — ${it?.nome || ""}\n\n` +
      `Será criada uma ${oposto} de ${farmFmtQtd(mv.quantidade)} no mesmo lote. ` +
      `O movimento original permanece no histórico: estorno não apaga nada.`
    )) return false;

    const r = await addSupMovimentoRemote(sbCru, movimentoDeEstorno(mv), currentUser);
    if (!r.ok) { alert("Não foi possível estornar.\n\n" + (r.erro || "")); return false; }
    registrarAuditoria(sb, currentUser, "estorno de movimento",
      `${it?.nome || mv.item_id} · desfaz #${mv.id} (${mv.tipo} ${farmFmtQtd(mv.quantidade)}${mv.lote ? ` lote ${mv.lote}` : ""})`, {});
    setTimeout(refresh, 350);
    return true;
  }
  async function salvarForn(f) {
    await upsertSupFornecedorRemote(sb, f, currentUser);
    registrarAuditoria(sb, currentUser, f.id ? "editar fornecedor" : "cadastrar fornecedor", f.nome, {});
    setShowForn(null);
    setTimeout(refresh, 350);
  }
  async function excluirForn(f) {
    if (!confirm(`Excluir o fornecedor "${f.nome}"? As entradas antigas continuam no kardex.`)) return;
    await deleteSupFornecedorRemote(sb, f.id);
    registrarAuditoria(sb, currentUser, "excluir fornecedor", f.nome, {});
    setTimeout(refresh, 300);
  }

  const totalAtivos = itens.filter(i => i.ativo !== false).length;
  const navAtual = SUP_NAV.find(n => n.key === sub) || SUP_NAV[0];
  const subTexto = {
    dashboard: "Visão geral do almoxarifado com atalhos.",
    acoes: "Tudo que precisa de decisão hoje, em ordem de prioridade — rupturas, comprar, vencimentos, requisições, recebimentos e contagens.",
    executivo: "Visão financeira do estoque — capital parado, variação de gastos e perdas, rupturas previstas e capital liberável. Almoxarifado + Farmácia.",
    requisicoes: "Pedidos de material dos setores: receber → separar (baixa automática no estoque) → pronto → confirmar entrega.",
    cotacoes: "Compare preços de vários fornecedores antes de comprar — o vencedor de cada item vira um pedido com um clique.",
    compras: "Pedidos de compra por fornecedor — materiais e medicamentos. O recebimento dá entrada automática no estoque.",
    aprovacoes: "Autorização da matriz sobre os pedidos de compra: aguardando aprovação · aprovado · negado.",
    inventario: "Inventário cíclico — contagem cega rotativa (curva ABC), ajuste no kardex e acuracidade do estoque.",
    preditivo: "Previsão item a item: no ritmo atual de consumo, quando acaba cada material e medicamento.",
    vencimentos: "Vencimentos inteligentes — o que vence, quanto vale e o que NÃO será consumido a tempo no ritmo atual.",
    indicadores: "Consumo por setor e categoria, gasto por fornecedor, curva ABC e relatório mensal imprimível.",
    assistente: "Assistente local para perguntas sobre o almoxarifado (nada é enviado para fora).",
    estoque: `Catálogo de materiais, entradas e saídas por lote e validade. ${totalAtivos} ativos · ${itens.length} cadastrados.`,
    fornecedores: `Cadastro de fornecedores usados nas entradas e nas compras. ${forns.filter(f => f.ativo !== false).length} ativos.`,
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* BARRA LATERAL DE SUPRIMENTOS */}
      <nav style={{ width: 194, minWidth: 194, background: "var(--bg-2)", borderRight: "1px solid var(--border)", padding: "1rem 0", overflowY: "auto", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px 12px" }}>
          <Icon name="cart" size={16} /><span style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".02em", color: VX.turquesa }}>SUPRIMENTOS</span>
        </div>
        {comGrupos(SUP_NAV).map(it => {
          if (it.grupoTitulo) return (
            <div key={it.grupoTitulo} style={{ padding: "14px 16px 4px", fontSize: 9.5, fontWeight: 700, letterSpacing: ".13em", textTransform: "uppercase", color: "var(--text-muted)" }}>{it.grupoTitulo}</div>
          );
          const active = sub === it.key; return (
          <button key={it.key} onClick={() => setSub(it.key)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: ".55rem 16px", border: "none", borderLeft: `3px solid ${active ? VX.turquesa : "transparent"}`, background: active ? "var(--surface)" : "transparent", color: active ? VX.turquesa : "var(--text-3)", cursor: "pointer", textAlign: "left", fontSize: 12.5, fontWeight: active ? 700 : 500, fontFamily: "Inter, sans-serif" }}>
            <Icon name={it.icon} size={16} />{it.label}
          </button>
        ); })}
      </nav>

      {/* CONTEÚDO */}
      <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem 1.5rem", minWidth: 0 }}>
        <PrimeiroUso checagens={useChecagens(sb, BASE_SUPRIMENTOS)} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{navAtual.label}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{subTexto[sub] || ""}</div>
        </div>
        {sub === "estoque" && canEdit && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setShowNfe(true)} style={{ background: "transparent", color: VX.azul, border: `1px solid ${VX.azul}66`, borderRadius: 6, padding: "9px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" }}>Importar NF-e (XML)</button>
          <button onClick={() => setShowItem({ nome: "", categoria: "", unidade: "unidade", estoque_minimo: "", custo_unitario: "", ativo: true, observacao: "" })} style={{ background: VX.turquesa, color: "#062a26", border: "none", borderRadius: 6, padding: "9px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" }}>+ Novo material</button>
        </div>}
        {sub === "fornecedores" && canEdit && <button onClick={() => setShowForn({ nome: "", cnpj: "", contato: "", telefone: "", email: "", categorias: "", observacao: "", ativo: true })} style={{ background: VX.turquesa, color: "#062a26", border: "none", borderRadius: 6, padding: "9px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" }}>+ Novo fornecedor</button>}
      </div>

      {/* 🔴 Sem os itens e os lotes lidos, o painel mostra 0 ruptura e 0
          vencendo — exatamente a tela de um almoxarifado em ordem. */}
      <AvisoLeitura oQue="os materiais e os lotes do almoxarifado" listas={[itens, lotes]} />

      {sub === "dashboard" && (() => {
        const ativos = itens.filter(i => i.ativo !== false);
        const rupturas = ativos.filter(i => supSaldoTotal(i.id, lotes) <= 0).length;
        const abaixoMin = ativos.filter(i => { const s = supSaldoTotal(i.id, lotes); return s > 0 && Number(i.estoque_minimo || 0) > 0 && s <= Number(i.estoque_minimo); }).length;
        const venc = lotes.filter(l => Number(l.quantidade) > 0 && ["vencido", "vencendo"].includes(infoDeValidade(l.validade).status)).length;
        const Card = ({ label, valor, cor, sub: s, nav }) => (
          <button onClick={() => nav && setSub(nav)} style={{ textAlign: "left", background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${cor}`, borderRadius: 10, padding: "14px 16px", cursor: nav ? "pointer" : "default" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: valor ? cor : "var(--text)", fontFamily: "JetBrains Mono, monospace", marginTop: 4 }}>{valor}</div>
            {s && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{s}</div>}
          </button>
        );
        return (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
              <Card label="Requisições aguardando" valor={reqs.filter(r => r.status === "aguardando").length} cor={VX.azul} sub="setores esperando" nav="requisicoes" />
              <Card label="Em separação / prontas" valor={reqs.filter(r => ["separacao", "pronto"].includes(r.status)).length} cor="#d97706" sub="no balcão do almoxarifado" nav="requisicoes" />
              <Card label="Aguardando aprovação" valor={pedidos.filter(p => p.status === "aguardando_aprovacao").length} cor={pedidos.filter(p => p.status === "aguardando_aprovacao").length ? "#d97706" : "#34d399"} sub="pedidos p/ a matriz" nav="aprovacoes" />
              <Card label="Pedidos de compra abertos" valor={pedidos.filter(p => ["aberto", "aprovado", "enviado", "parcial"].includes(p.status)).length} cor={VX.turquesa} sub="em elaboração / envio / entrega" nav="compras" />
              <Card label="Materiais ativos" valor={ativos.length} cor={VX.azul} sub={`${itens.length} cadastrados`} nav="estoque" />
              <Card label="Rupturas de estoque" valor={rupturas} cor={rupturas ? "#f43f5e" : "#34d399"} sub="itens sem saldo" nav="estoque" />
              <Card label="Abaixo do mínimo" valor={abaixoMin} cor={abaixoMin ? "#d97706" : "#34d399"} sub="repor" nav="estoque" />
              <Card label="Validade em risco" valor={venc} cor={venc ? "#d97706" : "#34d399"} sub={`vencidos / ≤${DIAS_VENCENDO} dias`} nav="estoque" />
              <Card label="Previsão de ruptura" valor={emRisco.length} cor={emRisco.length ? "#f43f5e" : "#34d399"} sub={`acabam em ${FARM_PREV_HORIZONTE} dias no ritmo atual`} nav="estoque" />
              <Card label="Fornecedores ativos" valor={forns.filter(f => f.ativo !== false).length} cor={VX.turquesa} sub={`${forns.length} cadastrados`} nav="fornecedores" />
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 16 }}>Clique nos cartões para ir direto à ferramenta. Pedidos de compra chegam na próxima fase.</div>
          </div>
        );
      })()}

      {sub === "requisicoes" && <SupRequisicoesView sb={sb} sbCru={sbCru} currentUser={currentUser} canEdit={canEdit} itens={itens.filter(i => i.ativo !== false)} lotes={lotes} onChanged={refresh} />}

      {sub === "cotacoes" && <SupCotacoesView sb={sb} currentUser={currentUser} canEdit={canEdit} isMaster={isMaster} materiais={itens.filter(i => i.ativo !== false)} forns={forns.filter(f => f.ativo !== false)} cotacoes={cotacoes} onChanged={refresh} />}
      {sub === "compras" && <SupComprasView sb={sb} sbCru={sbCru} currentUser={currentUser} canEdit={canEdit} isMaster={isMaster} materiais={itens.filter(i => i.ativo !== false)} lotes={lotes} saidasHist={saidasHist} forns={forns.filter(f => f.ativo !== false)} pedidos={pedidos} leadMap={leadMap} onChanged={refresh} />}
      {sub === "aprovacoes" && <SupAprovacoesView sb={sb} currentUser={currentUser} canEdit={canEdit} isMaster={isMaster} pedidos={pedidos} alcada={alcada} onAlcada={setAlcada} onChanged={refresh} cobertura={cobertura} onCobertura={setCobertura} />}

      {sub === "acoes" && <SupAcoesView itens={itens} lotes={lotes} saidasHist={saidasHist} reqs={reqs} pedidos={pedidos} invs={invs} leadMap={leadMap} onNav={setSub} />}
      {sub === "executivo" && <SupExecutivoView sb={sb} itens={itens} lotes={lotes} reqs={reqs} invs={invs} cobertura={cobertura} />}
      {sub === "inventario" && <SupInventarioView sb={sb} currentUser={currentUser} canEdit={canEdit} itens={itens.filter(i => i.ativo !== false)} lotes={lotes} saidasHist={saidasHist} invs={invs} onSave={salvarInventario} />}
      {sub === "preditivo" && <SupPreditivoView sb={sb} itens={itens} lotes={lotes} saidasHist={saidasHist} leadMap={leadMap} />}
      {sub === "vencimentos" && <SupVencimentosView sb={sb} itens={itens} lotes={lotes} saidasHist={saidasHist} />}

      {sub === "indicadores" && <SupIndicadoresView sb={sb} itens={itens} lotes={lotes} forns={forns} pedidos={pedidos} reqs={reqs} />}
      {sub === "assistente" && <SupAssistenteView sb={sb} />}

      {sub === "estoque" && (<>
      {/* PAINÉIS DE ALERTA */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: "1.25rem" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${alertasBaixo.length ? "#d97706" : "#34d399"}`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Reposição</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: alertasBaixo.length ? "#d97706" : "var(--text)" }}>{alertasBaixo.length}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{alertasBaixo.length ? "materiais abaixo do mínimo / zerados" : "nenhum item abaixo do mínimo"}</div>
          {alertasBaixo.length > 0 && <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 5 }}>{alertasBaixo.slice(0, 6).map(i => <span key={i.id} style={{ fontSize: 10.5, color: statusItem(i).cor, border: `1px solid ${statusItem(i).cor}55`, borderRadius: 99, padding: "1px 7px" }}>{i.nome}</span>)}{alertasBaixo.length > 6 && <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>+{alertasBaixo.length - 6}</span>}</div>}
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${lotesAlerta.length ? "#f43f5e" : "#34d399"}`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Validade</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: lotesAlerta.length ? "#f43f5e" : "var(--text)" }}>{lotesAlerta.length}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{lotesAlerta.length ? `lotes vencidos ou vencendo em ${DIAS_VENCENDO} dias` : "nenhum lote vencendo"}</div>
          {lotesAlerta.length > 0 && <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>{lotesAlerta.slice(0, 4).map(l => { const i = itens.find(x => x.id === l.item_id); const vi = infoDeValidade(l.validade); return <div key={l.id} style={{ fontSize: 11, color: "var(--text-2)" }}><span style={{ color: vi.status === "vencido" ? "#f43f5e" : "#d97706", fontWeight: 700 }}>{vi.status === "vencido" ? "vencido" : `${vi.dias}d`}</span> · {i?.nome || "?"} {l.lote ? `· lote ${l.lote}` : ""}</div>; })}{lotesAlerta.length > 4 && <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>+{lotesAlerta.length - 4}</span>}</div>}
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${emRisco.length ? "#f43f5e" : "#34d399"}`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Previsão de ruptura ({FARM_PREV_HORIZONTE}d)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: emRisco.length ? "#f43f5e" : "var(--text)" }}>{emRisco.length}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{emRisco.length ? `devem acabar em até ${FARM_PREV_HORIZONTE} dias (consumo dos últimos ${FARM_PREV_JANELA}d)` : "cobertura ≥ 7 dias em todos com consumo"}</div>
          {emRisco.length > 0 && <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>{emRisco.slice(0, 4).map(x => <div key={x.i.id} style={{ fontSize: 11, color: "var(--text-2)" }}><span style={{ color: x.cobertura <= 3 ? "#f43f5e" : "#d97706", fontWeight: 700 }}>{x.cobertura < 1 ? "<1d" : `${Math.floor(x.cobertura)}d`}</span> · {x.i.nome}</div>)}{emRisco.length > 4 && <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>+{emRisco.length - 4}</span>}</div>}
        </div>
      </div>

      {emRisco.length > 0 && (<>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Previsão de demanda — próximos {FARM_PREV_HORIZONTE} dias</div>
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10, marginBottom: "1.25rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
            <thead><tr style={{ background: "var(--surface-2)", textAlign: "left", color: "var(--text-3)", fontSize: 11, textTransform: "uppercase" }}>
              <th style={{ padding: "8px 12px" }}>Material</th><th style={{ padding: "8px 12px", textAlign: "right" }}>Consumo/dia</th><th style={{ padding: "8px 12px", textAlign: "right" }}>Saldo</th><th style={{ padding: "8px 12px", textAlign: "right" }}>Cobertura</th><th style={{ padding: "8px 12px", textAlign: "right" }}>Demanda 7d</th><th style={{ padding: "8px 12px", textAlign: "right" }}>Comprar</th>
            </tr></thead>
            <tbody>
              {emRisco.map(x => (
                <tr key={x.i.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "7px 12px", fontWeight: 600 }}>{x.i.nome}</td>
                  <td style={{ padding: "7px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{farmFmtQtd(Math.round(x.media * 10) / 10)}</td>
                  <td style={{ padding: "7px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{farmFmtQtd(x.saldo)}</td>
                  <td style={{ padding: "7px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: x.cobertura <= 3 ? "#f43f5e" : "#d97706" }}>{x.cobertura < 1 ? "< 1 dia" : `${Math.floor(x.cobertura)} dias`}</td>
                  <td style={{ padding: "7px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{farmFmtQtd(Math.ceil(x.demanda7))}</td>
                  <td style={{ padding: "7px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: VX.azul }}>{farmFmtQtd(x.sugestao)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", padding: "6px 12px" }}>Estimativa por média de consumo — assume demanda estável. "Comprar" cobre 7 dias + estoque mínimo.</div>
        </div>
      </>)}

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, categoria ou bipar código de barras…" style={{ ...campoTexto, maxWidth: 380, flex: "1 1 240px" }} />
        <select value={catFiltro} onChange={e => setCatFiltro(e.target.value)} style={{ ...campoTexto, maxWidth: 280 }}>
          <option value="">Todas as categorias</option>
          {catsPresentes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* TABELA DE ESTOQUE (agrupada por categoria) */}
      {itensView.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>
          {itens.length === 0 ? "Nenhum material cadastrado ainda. Clique em “+ Novo material”." : "Nenhum resultado para a busca."}
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 720 }}>
            <thead>
              <tr style={{ background: "var(--surface-2)", textAlign: "left", color: "var(--text-3)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>
                <th style={{ padding: "9px 12px" }}>Material</th>
                <th style={{ padding: "9px 12px", textAlign: "right" }}>Saldo</th>
                <th style={{ padding: "9px 12px", textAlign: "right" }}>Mínimo</th>
                <th style={{ padding: "9px 12px" }}>Situação</th>
                <th style={{ padding: "9px 12px" }}>Validade</th>
                <th style={{ padding: "9px 12px", textAlign: "right" }}>Ações</th>
              </tr>
            </thead>
            {gruposOrd.map(cat => (
              <tbody key={cat}>
                {!catFiltro && (
                  <tr><td colSpan={6} style={{ padding: "10px 12px 5px", background: "var(--surface-2)", borderTop: "1px solid var(--border)", fontSize: 11, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".05em" }}>{cat} <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>· {grupos[cat].length}</span></td></tr>
                )}
                {grupos[cat].map(i => {
                const st = statusItem(i);
                const lc = loteCritico(i);
                const vi = lc ? infoDeValidade(lc.validade) : null;
                const inativo = i.ativo === false;
                return (
                  <tr key={i.id} style={{ borderTop: "1px solid var(--border)", opacity: inativo ? 0.55 : 1 }}>
                    <td style={{ padding: "9px 12px" }}>
                      <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {i.nome}
                        {inativo && <span style={{ fontSize: 9.5, color: "var(--text-muted)", border: "1px solid var(--border-2)", borderRadius: 99, padding: "0 6px" }}>inativo</span>}
                      </div>
                      {i.observacao && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{i.observacao}</div>}
                    </td>
                    <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>{farmFmtQtd(st.saldo)} <span style={{ fontSize: 10.5, color: "var(--text-muted)", fontFamily: "Inter, sans-serif", fontWeight: 400 }}>{i.unidade || ""}</span></td>
                    <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{Number(i.estoque_minimo) > 0 ? farmFmtQtd(i.estoque_minimo) : "—"}</td>
                    <td style={{ padding: "9px 12px" }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 99, background: st.cor, marginRight: 6 }} /><span style={{ fontSize: 12, color: st.cor === "#34d399" ? "var(--text-2)" : st.cor, fontWeight: st.key === "ok" ? 400 : 700 }}>{st.label}</span></td>
                    <td style={{ padding: "9px 12px", fontSize: 12 }}>{lc ? <span style={{ color: vi.status === "vencido" ? "#f43f5e" : vi.status === "vencendo" ? "#d97706" : "var(--text-2)", fontWeight: vi.status === "ok" ? 400 : 700 }}>{fmtDataBR(lc.validade)}{vi.status === "vencido" ? " (vencido)" : vi.status === "vencendo" ? ` (${vi.dias}d)` : ""}</span> : <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                    <td style={{ padding: "9px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {canEdit && <>
                        <button onClick={() => setMovItem({ item: i, tipo: "entrada" })} style={btnContorno("#34d399")}>Entrada</button>{" "}
                        <button onClick={() => setMovItem({ item: i, tipo: "saida" })} style={btnContorno("#d97706")}>Saída</button>{" "}
                      </>}
                      <button onClick={() => setKardex(i)} style={btnContorno("#8d99ab")}>Kardex</button>{" "}
                      {canEdit && <button onClick={() => setShowItem(i)} style={btnContorno("#3b82f6")}>Editar</button>}
                      {isMaster && <> <button onClick={() => excluirItem(i)} style={btnContorno("#f43f5e")}>Excluir</button></>}
                    </td>
                  </tr>
                );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}
      </>)}

      {sub === "fornecedores" && (
        forns.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>
            Nenhum fornecedor cadastrado ainda. Clique em “+ Novo fornecedor”.
          </div>
        ) : (
          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 680 }}>
              <thead>
                <tr style={{ background: "var(--surface-2)", textAlign: "left", color: "var(--text-3)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>
                  <th style={{ padding: "9px 12px" }}>Fornecedor</th>
                  <th style={{ padding: "9px 12px" }}>CNPJ</th>
                  <th style={{ padding: "9px 12px" }}>Contato</th>
                  <th style={{ padding: "9px 12px" }}>Fornece</th>
                  <th style={{ padding: "9px 12px", textAlign: "right" }}>Prazo entrega</th>
                  <th style={{ padding: "9px 12px", textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {forns.map(f => {
                  const inativo = f.ativo === false;
                  return (
                    <tr key={f.id} style={{ borderTop: "1px solid var(--border)", opacity: inativo ? 0.55 : 1 }}>
                      <td style={{ padding: "9px 12px" }}>
                        <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>{f.nome}{inativo && <span style={{ fontSize: 9.5, color: "var(--text-muted)", border: "1px solid var(--border-2)", borderRadius: 99, padding: "0 6px" }}>inativo</span>}</div>
                        {f.observacao && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{f.observacao}</div>}
                      </td>
                      <td style={{ padding: "9px 12px", color: "var(--text-2)", fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>{f.cnpj || "—"}</td>
                      <td style={{ padding: "9px 12px", color: "var(--text-2)", fontSize: 12 }}>
                        {f.contato || "—"}
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{[f.telefone, f.email].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td style={{ padding: "9px 12px", color: "var(--text-2)", fontSize: 12 }}>{f.categorias || "—"}</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: f.lead_time_dias != null && f.lead_time_dias !== "" ? "var(--text-2)" : "var(--text-muted)" }}>{f.lead_time_dias != null && f.lead_time_dias !== "" ? `${f.lead_time_dias} d` : `${SUP_LEAD_PADRAO} d (padrão)`}</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                        {canEdit && <button onClick={() => setShowForn(f)} style={btnContorno("#3b82f6")}>Editar</button>}
                        {isMaster && <> <button onClick={() => excluirForn(f)} style={btnContorno("#f43f5e")}>Excluir</button></>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {showItem && <SupItemModal item={showItem} onClose={() => setShowItem(null)} onSave={salvarItem} />}
      {movItem && <SupMovModal item={movItem.item} tipoInicial={movItem.tipo} lotes={lotes.filter(l => l.item_id === movItem.item.id)} fornecedores={forns.filter(f => f.ativo !== false)} setores={setoresCat} onClose={() => setMovItem(null)} onSave={registrarMov} />}
      {kardex && <SupKardexModal sb={sb} item={kardex} fornecedores={forns} canEdit={canEdit} onEstornar={estornarMovimento} onClose={() => setKardex(null)} />}
      {showForn && <SupFornecedorModal forn={showForn} onClose={() => setShowForn(null)} onSave={salvarForn} />}
      {showNfe && <SupNfeModal itens={itens} forns={forns} onClose={() => setShowNfe(false)} onConfirm={importarNfe} />}
      </div>
    </div>
  );
}

// Requisições de materiais — o setor pede, o almoxarifado recebe (bipe),
// separa (baixa FEFO automática no estoque), marca pronto e o setor confirma.
function SupRequisicoesView({ sb, sbCru, currentUser, canEdit, itens, lotes, onChanged }) {
  const [reqs, setReqs] = useState([]);
  const [setores, setSetores] = useState([]);
  const [showNova, setShowNova] = useState(false);
  const [somOk, setSomOk] = useState(somLigado());
  const [busyId, setBusyId] = useState(null);
  const [verHistorico, setVerHistorico] = useState(false);
  const [, setTick] = useState(0);
  const prevAguardando = useRef(null);

  function carregar() {
    loadSupRequisicoes(sb).then(rows => {
      const n = rows.filter(r => r.status === "aguardando").length;
      if (prevAguardando.current != null && n > prevAguardando.current && somLigado()) avisoSonoro(true);
      prevAguardando.current = n;
      setReqs(rows);
    });
  }
  useEffect(() => {
    if (!sb) return;
    carregar();
    loadSetoresFromSupabase(sb).then(r => r && setSetores(r));
    const poll = setInterval(carregar, 15000);
    const tick = setInterval(() => setTick(t => t + 1), 30000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, []);

  const itemById = {}; itens.forEach(i => itemById[i.id] = i);
  const tempoDesde = iso => {
    if (!iso) return "";
    const min = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    return h < 24 ? `${h}h${String(min % 60).padStart(2, "0")}` : `${Math.floor(h / 24)}d ${h % 24}h`;
  };

  async function mudarStatus(req, campos) {
    setBusyId(req.id);
    await atualizarSupReqRemote(sb, req.id, campos);
    setBusyId(null);
    carregar();
    onChanged && onChanged();
  }
  function receber(req) {
    mudarStatus(req, { status: "separacao", recebido_em: nowISO(), recebido_por: currentUser?.name || null });
  }
  // Concluir a separação: dá baixa FEFO no estoque, item a item, e marca pronto.
  // Se faltar saldo, atende o que tem (parcial) e registra qtd_atendida.
  async function separar(req) {
    const itensReq = Array.isArray(req.itens) ? req.itens : [];
    if (!itensReq.length) { alert("Requisição sem itens."); return; }
    setBusyId(req.id);
    const atendidos = [];
    const faltas = [];
    for (const it of itensReq) {
      const pedida = Number(it.qtd || 0);
      let restante = pedida;
      // lotes do item com saldo, vence primeiro sai primeiro (FEFO)
      const meusLotes = lotes.filter(l => l.item_id === it.item_id && Number(l.quantidade) > 0)
        .sort((a, b) => (a.validade || "9999").localeCompare(b.validade || "9999"));
      for (const l of meusLotes) {
        if (restante <= 0) break;
        const q = Math.min(restante, Number(l.quantidade));
        const r = await addSupMovimentoRemote(sbCru, {
          item_id: it.item_id, tipo: "saida", quantidade: q,
          lote: l.lote || null, validade: l.validade || null,
          motivo: "Requisição", documento: `REQ-${req.id}`, setor: req.setor,
        }, currentUser);
        if (r.ok) restante -= q;
        else { alert(`Falha na baixa de "${it.nome}":\n${r.erro || ""}`); break; }
      }
      const atendida = pedida - restante;
      atendidos.push({ ...it, qtd_atendida: atendida });
      if (restante > 0) faltas.push(`${it.nome}: pedido ${farmFmtQtd(pedida)}, atendido ${farmFmtQtd(atendida)}`);
    }
    await atualizarSupReqRemote(sb, req.id, {
      itens: atendidos, status: "pronto",
      pronto_em: nowISO(), pronto_por: currentUser?.name || null,
    });
    registrarAuditoria(sb, currentUser, "separar requisição", `REQ-${req.id} · ${req.setor}`, {});
    if (somLigado()) avisoSonoro(false);
    setBusyId(null);
    if (faltas.length) alert("Separação concluída com PENDÊNCIAS (sem saldo):\n\n" + faltas.join("\n"));
    carregar();
    onChanged && onChanged();
  }
  function entregar(req) {
    mudarStatus(req, { status: "entregue", entregue_em: nowISO(), entregue_por: currentUser?.name || null });
    registrarAuditoria(sb, currentUser, "entregar requisição", `REQ-${req.id} · ${req.setor}`, {});
  }
  function cancelar(req) {
    if (!confirm(`Cancelar a requisição REQ-${req.id} do setor ${req.setor}?${req.status === "pronto" ? "\n\nAtenção: a baixa de estoque já foi feita — devolva os itens por Entrada, se for o caso." : ""}`)) return;
    mudarStatus(req, { status: "cancelado" });
    registrarAuditoria(sb, currentUser, "cancelar requisição", `REQ-${req.id} · ${req.setor}`, {});
  }
  async function criarRequisicao(nova) {
    await addSupRequisicaoRemote(sb, nova, currentUser);
    registrarAuditoria(sb, currentUser, "criar requisição", `${nova.setor} · ${nova.itens.length} itens`, {});
    setShowNova(false);
    carregar();
    onChanged && onChanged();
  }

  const ativas = reqs.filter(r => !["entregue", "cancelado"].includes(r.status));
  const historico = reqs.filter(r => ["entregue", "cancelado"].includes(r.status));
  const colunas = ["aguardando", "separacao", "pronto"];

  const ReqCard = ({ r }) => {
    const st = SUP_REQ_STATUS[r.status] || SUP_REQ_STATUS.aguardando;
    const its = Array.isArray(r.itens) ? r.itens : [];
    const parcial = r.status !== "aguardando" && r.status !== "separacao" && its.some(x => Number(x.qtd_atendida ?? x.qtd) < Number(x.qtd));
    const busy = busyId === r.id;
    return (
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${st.cor}`, borderRadius: 10, padding: "10px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800, fontSize: 13 }}>{r.setor}</span>
          <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>REQ-{r.id}</span>
          {parcial && <span style={{ fontSize: 9.5, color: "#d97706", border: "1px solid #d9770655", borderRadius: 99, padding: "0 6px", fontWeight: 800 }}>PARCIAL</span>}
          <span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{tempoDesde(r.created_at)}</span>
        </div>
        <div style={{ margin: "7px 0", display: "flex", flexDirection: "column", gap: 2 }}>
          {its.map((x, i) => {
            const at = x.qtd_atendida;
            const falta = at != null && Number(at) < Number(x.qtd);
            return (
              <div key={i} style={{ fontSize: 12, color: "var(--text-2)", display: "flex", gap: 6 }}>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, minWidth: 46, textAlign: "right", color: falta ? "#d97706" : "var(--text-2)" }}>{at != null ? `${farmFmtQtd(at)}/` : ""}{farmFmtQtd(x.qtd)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>{x.nome}{x.unidade ? ` (${x.unidade})` : ""}</span>
              </div>
            );
          })}
        </div>
        {r.observacao && <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>{r.observacao}</div>}
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 7 }}>
          {r.solicitado_por ? `pedido por ${r.solicitado_por}` : ""}{r.recebido_por ? ` · recebido por ${r.recebido_por}` : ""}{r.pronto_por ? ` · separado por ${r.pronto_por}` : ""}{r.entregue_por ? ` · entregue a ${r.entregue_por}` : ""}
        </div>
        {canEdit && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {r.status === "aguardando" && <button disabled={busy} onClick={() => receber(r)} style={btnContorno("#d97706")}>Receber / separar</button>}
            {r.status === "separacao" && <button disabled={busy} onClick={() => separar(r)} style={btnContorno("#3b82f6")}>{busy ? "…" : "Concluir separação (baixa)"}</button>}
            {r.status === "pronto" && <button disabled={busy} onClick={() => entregar(r)} style={btnContorno("#34d399")}>Confirmar entrega</button>}
            {!["entregue", "cancelado"].includes(r.status) && <button disabled={busy} onClick={() => cancelar(r)} style={btnContorno("#f43f5e")}>Cancelar</button>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {canEdit && <button onClick={() => setShowNova(true)} style={{ background: VX.turquesa, color: "#062a26", border: "none", borderRadius: 6, padding: "9px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Nova requisição</button>}
        <button onClick={() => { const v = !somOk; ligarSom(v); setSomOk(v); if (v) avisoSonoro(false); }} style={{ background: "transparent", border: `1px solid ${somOk ? VX.turquesa : "var(--border)"}`, borderRadius: 6, padding: "8px 14px", color: somOk ? VX.turquesa : "var(--text-3)", cursor: "pointer", fontSize: 12.5, fontWeight: 600 }}>{somOk ? "Som ativo" : "Ativar som"}</button>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Bipe quando chega requisição nova. Atualiza a cada 15 s.</span>
        <button onClick={() => setVerHistorico(h => !h)} style={{ marginLeft: "auto", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 14px", color: "var(--text-3)", cursor: "pointer", fontSize: 12.5 }}>{verHistorico ? "Ver ativas" : `Histórico (${historico.length})`}</button>
      </div>

      {!verHistorico ? (
        ativas.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Nenhuma requisição em andamento. Os setores pedem por aqui em “+ Nova requisição”.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, alignItems: "start" }}>
            {colunas.map(col => (
              <div key={col}>
                <div style={{ fontSize: 11, fontWeight: 800, color: SUP_REQ_STATUS[col].cor, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
                  {SUP_REQ_STATUS[col].label} · {ativas.filter(r => r.status === col).length}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {ativas.filter(r => r.status === col).map(r => <ReqCard key={r.id} r={r} />)}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        historico.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Nenhuma requisição concluída ainda.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, alignItems: "start" }}>
            {historico.slice(0, 60).map(r => <ReqCard key={r.id} r={r} />)}
          </div>
        )
      )}

      {showNova && <SupNovaReqModal itens={itens} setores={setores} lotes={lotes} onClose={() => setShowNova(false)} onSave={criarRequisicao} />}
    </div>
  );
}

// Montagem de uma requisição: setor + itens do catálogo com quantidades
function SupNovaReqModal({ itens, setores, lotes, onClose, onSave }) {
  const [setor, setSetor] = useState(setores[0]?.nome || "");
  const [obs, setObs] = useState("");
  const [lista, setLista] = useState([]);          // [{item_id, nome, unidade, qtd}]
  const [itemSel, setItemSel] = useState("");
  const [qtd, setQtd] = useState("");
  const [busy, setBusy] = useState(false);
  const itensDisp = itens.filter(i => !lista.some(x => x.item_id === i.id))
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
  const sel = itens.find(i => String(i.id) === String(itemSel));
  const saldoSel = sel ? supSaldoTotal(sel.id, lotes) : null;

  function adicionar() {
    const q = Number(qtd);
    if (!sel) { alert("Escolha o material."); return; }
    if (!q || q <= 0) { alert("Informe uma quantidade maior que zero."); return; }
    setLista(l => [...l, { item_id: sel.id, nome: sel.nome, unidade: sel.unidade || "", qtd: q }]);
    setItemSel(""); setQtd("");
  }
  async function salvar() {
    if (!setor.trim()) { alert("Informe o setor solicitante."); return; }
    if (!lista.length) { alert("Adicione pelo menos um material."); return; }
    setBusy(true);
    await onSave({ setor: setor.trim(), itens: lista, observacao: obs.trim() || null, status: "aguardando" });
    setBusy(false);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 540, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Nova requisição de materiais</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={rotuloCampo}>Setor solicitante *</label>
            {setores.length ? (
              <select value={setor} onChange={e => setSetor(e.target.value)} style={campoTexto}>
                {setores.map(s => <option key={s.nome} value={s.nome}>{s.nome}</option>)}
                <option value="">Outro…</option>
              </select>
            ) : (
              <input value={setor} onChange={e => setSetor(e.target.value)} placeholder="Ex.: Posto 2" style={campoTexto} autoFocus />
            )}
          </div>
          {setores.length > 0 && setor === "" && (
            <div>
              <label style={rotuloCampo}>Nome do setor</label>
              <input value={setor} onChange={e => setSetor(e.target.value)} placeholder="Digite o setor" style={campoTexto} autoFocus />
            </div>
          )}
        </div>

        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", marginBottom: 8 }}>Adicionar material</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 90px auto", gap: 8, alignItems: "end" }}>
            <div>
              <label style={rotuloCampo}>Material</label>
              <select value={itemSel} onChange={e => setItemSel(e.target.value)} style={campoTexto}>
                <option value="">— escolha —</option>
                {itensDisp.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
              </select>
            </div>
            <div>
              <label style={rotuloCampo}>Qtd *</label>
              <input type="number" min="0" step="any" value={qtd} onChange={e => setQtd(e.target.value)} placeholder="0" style={campoTexto} />
            </div>
            <button onClick={adicionar} style={{ background: "var(--surface-3)", color: "var(--text-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Add</button>
          </div>
          {sel && <div style={{ fontSize: 11, color: saldoSel > 0 ? "var(--text-muted)" : "#d97706", marginTop: 6 }}>Saldo atual no almoxarifado: <strong>{farmFmtQtd(saldoSel)} {sel.unidade || ""}</strong>{saldoSel <= 0 ? " — sem estoque; a requisição pode ficar parcial." : ""}</div>}
        </div>

        {lista.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 12 }}>
            {lista.map((x, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "6px 10px" }}>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, minWidth: 40, textAlign: "right" }}>{farmFmtQtd(x.qtd)}</span>
                <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-2)" }}>{x.nome}{x.unidade ? ` (${x.unidade})` : ""}</span>
                <button onClick={() => setLista(l => l.filter((_, j) => j !== i))} style={{ background: "transparent", border: "none", color: "#f43f5e", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>✕</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={rotuloCampo}>Observação</label>
          <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Urgência, detalhe do pedido…" style={campoTexto} />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={salvar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Enviar requisição"}</button>
        </div>
      </div>
    </div>
  );
}

// Cotações — compara preços de fornecedores por item e gera o pedido do vencedor.
function SupCotacoesView({ sb, currentUser, canEdit, materiais, forns, cotacoes, onChanged }) {
  const [meds, setMeds] = useState([]);
  const [showNova, setShowNova] = useState(false);
  const [abrir, setAbrir] = useState(null);      // cotação em comparação
  const [busyId, setBusyId] = useState(null);

  useEffect(() => { if (sb) loadFarmMedicamentos(sb).then(setMeds); }, []);
  const fornById = {}; forns.forEach(f => fornById[f.id] = f);

  // menor preço de cada item e total por fornecedor
  function analise(cot) {
    const itens = Array.isArray(cot.itens) ? cot.itens : [];
    const fids = (cot.fornecedores || []).map(String);
    const totalForn = {}; fids.forEach(id => totalForn[id] = { soma: 0, itensCotados: 0 });
    const vencedorItem = itens.map(it => {
      let melhor = null;
      fids.forEach(id => {
        const p = Number(it.precos?.[id]);
        if (p > 0) { totalForn[id].soma += p * Number(it.qtd || 0); totalForn[id].itensCotados++; if (melhor == null || p < melhor.preco) melhor = { fid: id, preco: p }; }
      });
      return melhor;   // { fid, preco } ou null
    });
    return { itens, fids, totalForn, vencedorItem };
  }

  async function criar(cot) {
    await addSupCotacaoRemote(sb, cot, currentUser);
    registrarAuditoria(sb, currentUser, "criar cotação", `${cot.descricao || "cotação"} · ${cot.itens.length} itens`, {});
    setShowNova(false);
    onChanged && onChanged();
  }
  async function salvarPrecos(cot, itens) {
    setBusyId(cot.id);
    await atualizarSupCotacaoRemote(sb, cot.id, { itens });
    setBusyId(null);
    setAbrir(a => a ? { ...a, itens } : a);
    onChanged && onChanged();
  }
  async function cancelar(cot) {
    if (!confirm(`Cancelar a cotação "${cot.descricao || cot.id}"?`)) return;
    await atualizarSupCotacaoRemote(sb, cot.id, { status: "cancelada" });
    registrarAuditoria(sb, currentUser, "cancelar cotação", `cotação ${cot.id}`, {});
    onChanged && onChanged();
  }
  // Gera pedido(s): "porItem" = melhor preço de cada item (divide por fornecedor);
  // fornId = pedido único com um fornecedor.
  async function gerarPedido(cot, modo, fornIdUnico) {
    const { itens, vencedorItem } = analise(cot);
    const grupos = {};   // fornecedor_id → itens do pedido
    itens.forEach((it, i) => {
      let fid = null, preco = null;
      if (modo === "porItem") { const v = vencedorItem[i]; if (v) { fid = v.fid; preco = v.preco; } }
      else { fid = String(fornIdUnico); preco = Number(it.precos?.[fid]) || null; }
      if (!fid || !preco) return;
      (grupos[fid] = grupos[fid] || []).push({ tipo: it.tipo, item_id: it.item_id, nome: it.nome, unidade: it.unidade, qtd: Number(it.qtd), custo_unit: preco, qtd_recebida: 0 });
    });
    const ids = Object.keys(grupos);
    if (!ids.length) { alert("Nenhum item com preço para gerar pedido."); return; }
    setBusyId(cot.id);
    for (const fid of ids) {
      const forn = fornById[fid];
      await addSupPedidoRemote(sb, { fornecedor_id: Number(fid), fornecedor_nome: forn?.nome || null, itens: grupos[fid], observacao: `Da cotação #${cot.id}`, status: "aberto" }, currentUser);
    }
    await atualizarSupCotacaoRemote(sb, cot.id, { status: "fechada" });
    registrarAuditoria(sb, currentUser, "gerar pedido da cotação", `cotação ${cot.id} · ${ids.length} pedido(s)`, {});
    setBusyId(null);
    setAbrir(null);
    alert(`${ids.length} pedido(s) de compra gerado(s) na aba Compras.`);
    onChanged && onChanged();
  }

  const abertas = cotacoes.filter(c => c.status === "aberta");
  const historico = cotacoes.filter(c => c.status !== "aberta");

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {canEdit && <button onClick={() => setShowNova(true)} style={{ background: VX.turquesa, color: "#062a26", border: "none", borderRadius: 6, padding: "9px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Nova cotação</button>}
        <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Registre os preços que cada fornecedor passou e o sistema aponta o mais barato de cada item.</span>
      </div>

      {cotacoes.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Nenhuma cotação ainda. Crie uma em “+ Nova cotação”, escolha os fornecedores e os itens, e registre os preços.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12, alignItems: "start" }}>
          {[...abertas, ...historico].map(c => {
            const { fids, totalForn, vencedorItem } = analise(c);
            const cotados = vencedorItem.filter(Boolean).length;
            const melhorTotal = fids.map(id => totalForn[id].soma).filter(v => v > 0).sort((a, b) => a - b)[0];
            const stCor = c.status === "aberta" ? VX.azul : c.status === "fechada" ? "#34d399" : "#f43f5e";
            return (
              <div key={c.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${stCor}`, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 13, flex: 1, minWidth: 0 }}>{c.descricao || `Cotação #${c.id}`}</span>
                  <span style={{ fontSize: 9.5, color: stCor, border: `1px solid ${stCor}55`, borderRadius: 99, padding: "0 7px", fontWeight: 800 }}>{c.status.toUpperCase()}</span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "6px 0" }}>{(c.itens || []).length} item(ns) · {fids.length} fornecedor(es) · {cotados}/{(c.itens || []).length} cotados{melhorTotal ? ` · melhor total ${fmtReais(melhorTotal)}` : ""}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button onClick={() => setAbrir(c)} style={btnContorno(VX.azul)}>{c.status === "aberta" ? "Cotar / comparar" : "Ver"}</button>
                  {canEdit && c.status === "aberta" && <button onClick={() => cancelar(c)} style={btnContorno("#f43f5e")}>Cancelar</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNova && <SupNovaCotacaoModal materiais={materiais} meds={meds.filter(m => m.ativo !== false)} forns={forns} onClose={() => setShowNova(false)} onSave={criar} />}
      {abrir && <SupCotacaoModal cot={abrir} forns={forns} canEdit={canEdit} busy={busyId === abrir.id} analiseFn={analise} onClose={() => setAbrir(null)} onSalvar={salvarPrecos} onGerar={gerarPedido} />}
    </div>
  );
}

// Nova cotação: descrição + fornecedores a comparar + itens (material/medicamento)
function SupNovaCotacaoModal({ materiais, meds, forns, onClose, onSave }) {
  const [descricao, setDescricao] = useState("");
  const [fids, setFids] = useState([]);
  const [lista, setLista] = useState([]);   // [{tipo, item_id, nome, unidade, qtd}]
  const [tipoSel, setTipoSel] = useState("material");
  const [itemSel, setItemSel] = useState("");
  const [qtd, setQtd] = useState("");
  const [busy, setBusy] = useState(false);
  const base = tipoSel === "material" ? materiais : meds;
  const disp = base.filter(i => !lista.some(x => x.tipo === tipoSel && x.item_id === i.id)).sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
  const sel = base.find(i => String(i.id) === String(itemSel));
  const toggleForn = id => setFids(f => f.includes(id) ? f.filter(x => x !== id) : [...f, id]);

  function add() {
    const q = Number(qtd);
    if (!sel) { alert("Escolha o item."); return; }
    if (!q || q <= 0) { alert("Informe a quantidade."); return; }
    setLista(l => [...l, { tipo: tipoSel, item_id: sel.id, nome: sel.nome, unidade: sel.unidade || "", qtd: q }]);
    setItemSel(""); setQtd("");
  }
  async function salvar() {
    if (fids.length < 1) { alert("Escolha ao menos um fornecedor para cotar."); return; }
    if (!lista.length) { alert("Adicione ao menos um item."); return; }
    setBusy(true);
    await onSave({ descricao: descricao.trim() || null, fornecedores: fids, itens: lista.map(x => ({ ...x, precos: {} })), status: "aberta" });
    setBusy(false);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 600, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Nova cotação</div>
        <div style={{ marginBottom: 12 }}>
          <label style={rotuloCampo}>Descrição (opcional)</label>
          <input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex.: Compra mensal de EPI" style={campoTexto} autoFocus />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={rotuloCampo}>Fornecedores a comparar *</label>
          {forns.length === 0 ? <div style={{ fontSize: 12, color: "#d97706" }}>Cadastre fornecedores primeiro (aba Fornecedores).</div> : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {forns.map(f => <button key={f.id} onClick={() => toggleForn(f.id)} style={{ background: fids.includes(f.id) ? VX.turquesa : "transparent", color: fids.includes(f.id) ? "#062a26" : "var(--text-3)", border: `1px solid ${fids.includes(f.id) ? VX.turquesa : "var(--border)"}`, borderRadius: 99, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{f.nome}</button>)}
            </div>
          )}
        </div>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            {["material", "medicamento"].map(t => <button key={t} onClick={() => { setTipoSel(t); setItemSel(""); }} style={{ flex: 1, background: tipoSel === t ? VX.turquesa : "transparent", color: tipoSel === t ? "#062a26" : "var(--text-3)", border: `1px solid ${tipoSel === t ? VX.turquesa : "var(--border)"}`, borderRadius: 7, padding: "6px 0", fontWeight: 700, cursor: "pointer", fontSize: 12.5 }}>{t === "material" ? "Material" : "Medicamento"}</button>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 80px auto", gap: 8, alignItems: "end" }}>
            <div><label style={rotuloCampo}>Item</label><select value={itemSel} onChange={e => setItemSel(e.target.value)} style={campoTexto}><option value="">— escolha —</option>{disp.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}</select></div>
            <div><label style={rotuloCampo}>Qtd</label><input type="number" min="0" step="any" value={qtd} onChange={e => setQtd(e.target.value)} placeholder="0" style={campoTexto} /></div>
            <button onClick={add} style={{ background: "var(--surface-3)", color: "var(--text-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Add</button>
          </div>
        </div>
        {lista.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>
            {lista.map((x, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "6px 10px" }}>
                <span style={{ fontSize: 9.5, color: x.tipo === "medicamento" ? "#6366f1" : "var(--text-muted)", border: `1px solid ${x.tipo === "medicamento" ? "#6366f155" : "var(--border-2)"}`, borderRadius: 99, padding: "0 6px", fontWeight: 700 }}>{x.tipo === "medicamento" ? "MED" : "MAT"}</span>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, minWidth: 40, textAlign: "right" }}>{farmFmtQtd(x.qtd)}</span>
                <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-2)", minWidth: 0 }}>{x.nome}</span>
                <button onClick={() => setLista(l => l.filter((_, j) => j !== i))} style={{ background: "transparent", border: "none", color: "#f43f5e", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>✕</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={salvar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Criar cotação"}</button>
        </div>
      </div>
    </div>
  );
}

// Comparação da cotação: matriz preço × fornecedor, destaca o mais barato, gera pedido
function SupCotacaoModal({ cot, forns, canEdit, busy, onClose, onSalvar, onGerar }) {
  const fById = {}; forns.forEach(f => fById[f.id] = f);
  const [itens, setItens] = useState(() => (Array.isArray(cot.itens) ? cot.itens : []).map(x => ({ ...x, precos: { ...(x.precos || {}) } })));
  const fids = (cot.fornecedores || []).map(String);
  const readonly = cot.status !== "aberta" || !canEdit;
  const setPreco = (i, fid, v) => setItens(l => l.map((x, j) => j === i ? { ...x, precos: { ...x.precos, [fid]: v } } : x));

  const vencedor = itens.map(it => {
    let melhor = null;
    fids.forEach(fid => { const p = Number(it.precos?.[fid]); if (p > 0 && (melhor == null || p < melhor.preco)) melhor = { fid, preco: p }; });
    return melhor;
  });
  const totalForn = {}; fids.forEach(fid => totalForn[fid] = itens.reduce((s, it) => s + (Number(it.precos?.[fid]) || 0) * Number(it.qtd || 0), 0));
  // "Melhor fornecedor único" só entre os que cotaram TODOS os itens — senão um
  // fornecedor com itens em branco pareceria mais barato (total menor) e enganaria.
  const precificouTudo = fid => itens.length > 0 && itens.every(it => Number(it.precos?.[fid]) > 0);
  const melhorFornGeral = fids.filter(precificouTudo).sort((a, b) => totalForn[a] - totalForn[b])[0];
  const totalPorItem = itens.reduce((s, it, i) => s + (vencedor[i] ? vencedor[i].preco * Number(it.qtd || 0) : 0), 0);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 820, maxWidth: "96vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{cot.descricao || `Cotação #${cot.id}`}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>{readonly ? "Somente leitura." : "Digite o preço unitário que cada fornecedor passou. O mais barato de cada item fica destacado."}</div>

        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10, marginBottom: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 560 }}>
            <thead><tr style={{ background: "var(--surface-2)", textAlign: "left", color: "var(--text-3)", fontSize: 10.5, textTransform: "uppercase" }}>
              <th style={{ padding: "8px 10px" }}>Item</th>
              <th style={{ padding: "8px 10px", textAlign: "right" }}>Qtd</th>
              {fids.map(fid => <th key={fid} style={{ padding: "8px 10px", textAlign: "right" }}>{fById[fid]?.nome || `#${fid}`}{fById[fid]?.lead_time_dias != null ? <span style={{ fontWeight: 400, textTransform: "none" }}> · {fById[fid].lead_time_dias}d</span> : ""}</th>)}
              <th style={{ padding: "8px 10px", textAlign: "right" }}>Melhor</th>
            </tr></thead>
            <tbody>
              {itens.map((it, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "7px 10px", fontWeight: 600 }}><span style={{ fontSize: 9, color: it.tipo === "medicamento" ? "#6366f1" : "var(--text-muted)", border: `1px solid ${it.tipo === "medicamento" ? "#6366f155" : "var(--border-2)"}`, borderRadius: 99, padding: "0 5px", marginRight: 6 }}>{it.tipo === "medicamento" ? "MED" : "MAT"}</span>{it.nome}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{farmFmtQtd(it.qtd)}</td>
                  {fids.map(fid => { const venc = vencedor[i]?.fid === fid; return (
                    <td key={fid} style={{ padding: "7px 10px", textAlign: "right", background: venc ? "#34d39918" : "transparent" }}>
                      {readonly
                        ? <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: venc ? 800 : 400, color: venc ? "#0d9488" : "var(--text-2)" }}>{Number(it.precos?.[fid]) > 0 ? fmtReais(it.precos[fid]) : "—"}</span>
                        : <input type="number" min="0" step="any" value={it.precos?.[fid] ?? ""} onChange={e => setPreco(i, fid, e.target.value)} placeholder="—" style={{ ...campoTexto, width: 82, padding: "5px 7px", fontSize: 12, textAlign: "right", borderColor: venc ? "#34d399" : "var(--border)" }} />}
                    </td>
                  ); })}
                  <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 800, fontFamily: "JetBrains Mono, monospace", color: "#0d9488" }}>{vencedor[i] ? fmtReais(vencedor[i].preco) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr style={{ borderTop: "2px solid var(--border)", background: "var(--surface-2)" }}>
              <td style={{ padding: "8px 10px", fontWeight: 700 }} colSpan={2}>Total por fornecedor</td>
              {fids.map(fid => <td key={fid} style={{ padding: "8px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 800, color: fid === melhorFornGeral ? "#0d9488" : "var(--text-2)" }}>{totalForn[fid] > 0 ? fmtReais(totalForn[fid]) : "—"}{fid === melhorFornGeral && totalForn[fid] > 0 ? " ✓" : ""}{totalForn[fid] > 0 && !precificouTudo(fid) ? <span title="Cotou só parte dos itens" style={{ color: "#d97706", fontWeight: 700 }}> ⚠</span> : ""}</td>)}
              <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 800, color: "#0d9488" }}>{fmtReais(totalPorItem)}</td>
            </tr></tfoot>
          </table>
        </div>

        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 14 }}>
          <strong>Melhor preço por item:</strong> {fmtReais(totalPorItem)} (divide entre fornecedores) · <strong>Melhor fornecedor único:</strong> {melhorFornGeral ? `${fById[melhorFornGeral]?.nome} — ${fmtReais(totalForn[melhorFornGeral])}` : "nenhum cotou todos os itens ainda"}. O ⚠ marca quem cotou só parte. O prazo de entrega (dias) aparece no cabeçalho para pesar preço × prazo.
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Fechar</button>
          {!readonly && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => onSalvar(cot, itens)} disabled={busy} style={{ background: "transparent", color: VX.azul, border: `1px solid ${VX.azul}66`, borderRadius: 6, padding: "9px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Salvar preços"}</button>
              <button onClick={() => { onSalvar(cot, itens); onGerar({ ...cot, itens }, "porItem"); }} disabled={busy} style={{ background: "#34d399", color: "#000", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Gerar pedido (melhor por item)</button>
              {melhorFornGeral && <button onClick={() => { onSalvar(cot, itens); onGerar({ ...cot, itens }, "unico", melhorFornGeral); }} disabled={busy} style={{ background: "transparent", color: "#0d9488", border: "1px solid #0d948866", borderRadius: 6, padding: "9px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Pedido único ({fById[melhorFornGeral]?.nome})</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Compras — pedidos por fornecedor com itens de material E medicamento.
// Recebimento (total ou parcial) dá entrada automática no estoque certo.
function SupComprasView({ sb, sbCru, currentUser, canEdit, materiais, lotes, saidasHist, forns, pedidos, leadMap = {}, onChanged }) {
  const [meds, setMeds] = useState([]);
  const [medLotes, setMedLotes] = useState([]);
  const [medSaidas, setMedSaidas] = useState([]);
  const [showNovo, setShowNovo] = useState(false);
  const [receb, setReceb] = useState(null);        // pedido em recebimento
  const [verHistorico, setVerHistorico] = useState(false);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!sb) return;
    loadFarmMedicamentos(sb).then(setMeds);
    loadFarmLotes(sb).then(setMedLotes);
    loadFarmSaidasDesde(sb, new Date(Date.now() - FARM_PREV_JANELA * 86400000).toISOString()).then(setMedSaidas);
  }, []);

  // Sugestões de compra por PONTO DE PEDIDO: dispara quando a cobertura cai abaixo
  // do prazo de entrega do item (+ margem) — e a quantidade cobre esse prazo + mínimo.
  // Medicamentos não têm fornecedor vinculado no movimento → usam o prazo padrão.
  function sugestoes(itensBase, lotesBase, saidas, campoId, tipo) {
    const consumo = {};
    saidas.forEach(s => { const id = s[campoId]; if (id) consumo[id] = (consumo[id] || 0) + Number(s.quantidade || 0); });
    return itensBase.filter(i => i.ativo !== false).map(i => {
      const media = (consumo[i.id] || 0) / FARM_PREV_JANELA;
      const saldo = lotesBase.filter(l => l[campoId === "item_id" ? "item_id" : "medicamento_id"] === i.id)
        .reduce((s, l) => s + Number(l.quantidade || 0), 0);
      const cobertura = media > 0 ? saldo / media : null;
      const prazo = tipo === "material" ? supPrazoReposicao(i.id, leadMap) : (SUP_LEAD_PADRAO + SUP_MARGEM_SEG);
      const qtd = Math.max(0, Math.ceil(media * prazo + Number(i.estoque_minimo || 0) - saldo));
      // A conta acima é toda em unidade de CONSUMO (saldo e média vêm do
      // kardex). O pedido é digitado em unidade de COMPRA — sem converter,
      // a sugestão de "250 pares" viraria "250 caixas" no pedido, ou seja,
      // 25.000 luvas. Medicamento não tem conversão.
      const ehMaterial = tipo === "material";
      const qtdCompra = ehMaterial ? consumoParaCompra(qtd, i) : qtd;
      const custoCompra = ehMaterial
        ? (custoPorUnidadeCompra(i.custo_unitario, i) || "")
        : (Number(i.custo_unitario || 0) || "");
      return {
        tipo, item_id: i.id, nome: i.nome,
        unidade: ehMaterial ? rotuloCompra(i) : (i.unidade || ""),
        qtd: qtdCompra, custo_unit: custoCompra,
        cobertura, media, prazo,
      };
    }).filter(x => x.media > 0 && x.cobertura != null && x.cobertura < x.prazo && x.qtd > 0)
      .sort((a, b) => a.cobertura - b.cobertura);
  }
  const sugMat = sugestoes(materiais, lotes, saidasHist, "item_id", "material");
  const sugMed = sugestoes(meds, medLotes, medSaidas, "medicamento_id", "medicamento");

  async function criarPedido(ped) {
    await addSupPedidoRemote(sb, ped, currentUser);
    registrarAuditoria(sb, currentUser, "criar pedido de compra", `${ped.fornecedor_nome || "sem fornecedor"} · ${ped.itens.length} itens`, {});
    setShowNovo(false);
    onChanged && onChanged();
  }
  async function enviarParaAprovacao(p) {
    setBusyId(p.id);
    await atualizarSupPedidoRemote(sb, p.id, { status: "aguardando_aprovacao", aprovacao_em: nowISO() });
    registrarAuditoria(sb, currentUser, "enviar pedido para aprovação", `PED-${p.id}`, {});
    setBusyId(null);
    onChanged && onChanged();
  }
  async function enviar(p) {
    setBusyId(p.id);
    await atualizarSupPedidoRemote(sb, p.id, { status: "enviado", enviado_em: nowISO(), enviado_por: currentUser?.name || null });
    registrarAuditoria(sb, currentUser, "enviar pedido ao fornecedor", `PED-${p.id}`, {});
    setBusyId(null);
    onChanged && onChanged();
  }
  async function revisar(p) {
    setBusyId(p.id);
    await atualizarSupPedidoRemote(sb, p.id, { status: "aberto", aprovacao_em: null, decidido_por: null, decidido_em: null, negado_motivo: null });
    registrarAuditoria(sb, currentUser, "revisar pedido negado", `PED-${p.id}`, {});
    setBusyId(null);
    onChanged && onChanged();
  }
  async function cancelar(p) {
    if (!confirm(`Cancelar o pedido PED-${p.id}${p.fornecedor_nome ? ` (${p.fornecedor_nome})` : ""}?`)) return;
    setBusyId(p.id);
    await atualizarSupPedidoRemote(sb, p.id, { status: "cancelado" });
    registrarAuditoria(sb, currentUser, "cancelar pedido de compra", `PED-${p.id}`, {});
    setBusyId(null);
    onChanged && onChanged();
  }
  // Confirma um recebimento: entradas nos estoques + atualiza o pedido
  async function confirmarRecebimento(p, linhas, nf) {
    setBusyId(p.id);
    const erros = [];
    const matById = {}; materiais.forEach(i => matById[i.id] = i);
    const medById = {}; meds.forEach(m => medById[m.id] = m);
    const itensNovos = (Array.isArray(p.itens) ? p.itens : []).map(x => ({ ...x }));
    for (const ln of linhas) {
      const q = Number(ln.qtd || 0);
      if (q <= 0) continue;
      const alvo = itensNovos[ln.idx];
      const custoNota = Number(alvo.custo_unit) || 0;   // custo do pedido → alimenta o custo médio
      let r;
      if (alvo.tipo === "medicamento") {
        const saldoAntes = saldoDoMedicamento(alvo.item_id, medLotes);
        r = await addFarmMovimentoRemote(sbCru, {
          medicamento_id: alvo.item_id, tipo: "entrada", quantidade: q,
          lote: ln.lote.trim() || null, validade: ln.validade || null,
          motivo: "Compra / nota fiscal", documento: nf || `PED-${p.id}`,
          custo_unit: custoNota || null,
        }, currentUser);
        if (r.ok && custoNota) {
          const novo = custoMedioPonderado(medById[alvo.item_id]?.custo_unitario, saldoAntes, q, custoNota);
          if (novo != null) await setFarmMedCustoRemote(sb, alvo.item_id, novo);
        }
      } else {
        // ── ÚNICO ponto onde a compra vira estoque ──
        // O pedido é digitado em unidade de COMPRA (caixa); o estoque, o
        // kardex e todos os indicadores falam em unidade de CONSUMO (par).
        // Converter aqui deixa tudo a jusante correto sem que nenhum deles
        // precise saber que a conversão existe. Item sem fator → 1, e o
        // comportamento é idêntico ao de antes.
        const mat = matById[alvo.item_id];
        const qConsumo = comprarParaConsumo(q, mat);
        const custoConsumo = custoPorUnidadeConsumo(custoNota, mat);
        const saldoAntes = supSaldoTotal(alvo.item_id, lotes);
        r = await addSupMovimentoRemote(sbCru, {
          item_id: alvo.item_id, tipo: "entrada", quantidade: qConsumo,
          lote: ln.lote.trim() || null, validade: ln.validade || null,
          motivo: "Compra / nota fiscal", documento: nf || `PED-${p.id}`,
          fornecedor_id: p.fornecedor_id || null,
          custo_unit: custoConsumo,
        }, currentUser);
        if (r.ok && custoConsumo != null) {
          const novo = custoMedioPonderado(mat?.custo_unitario, saldoAntes, qConsumo, custoConsumo);
          if (novo != null) await setSupItemCustoRemote(sb, alvo.item_id, novo);
        }
      }
      if (r.ok) alvo.qtd_recebida = Number(alvo.qtd_recebida || 0) + q;
      else erros.push(`${alvo.nome}: ${r.erro || "falha na entrada"}`);
    }
    const completo = itensNovos.every(x => Number(x.qtd_recebida || 0) >= Number(x.qtd || 0));
    await atualizarSupPedidoRemote(sb, p.id, {
      itens: itensNovos,
      status: completo ? "recebido" : "parcial",
      recebido_em: nowISO(), recebido_por: currentUser?.name || null,
    });
    registrarAuditoria(sb, currentUser, "receber pedido de compra", `PED-${p.id}${completo ? "" : " (parcial)"}`, {});
    setBusyId(null);
    setReceb(null);
    if (erros.length) alert("Recebimento registrado com FALHAS:\n\n" + erros.join("\n"));
    onChanged && onChanged();
  }

  const ativos = pedidos.filter(p => ["aberto", "aguardando_aprovacao", "aprovado", "negado", "enviado", "parcial"].includes(p.status));
  const historico = pedidos.filter(p => ["recebido", "cancelado"].includes(p.status));
  const lista = verHistorico ? historico : ativos;

  const PedCard = ({ p }) => {
    const st = SUP_PED_STATUS[p.status] || SUP_PED_STATUS.aberto;
    const its = Array.isArray(p.itens) ? p.itens : [];
    const total = supPedidoTotal(p);
    const busy = busyId === p.id;
    const temMed = its.some(x => x.tipo === "medicamento");
    return (
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${st.cor}`, borderRadius: 10, padding: "10px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800, fontSize: 13 }}>{p.fornecedor_nome || "Sem fornecedor"}</span>
          <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>PED-{p.id}</span>
          <span style={{ fontSize: 9.5, color: st.cor, border: `1px solid ${st.cor}55`, borderRadius: 99, padding: "0 7px", fontWeight: 800 }}>{st.label.toUpperCase()}</span>
          {temMed && <span style={{ fontSize: 9.5, color: "#6366f1", border: "1px solid #6366f155", borderRadius: 99, padding: "0 6px", fontWeight: 700 }}>c/ medicamentos</span>}
        </div>
        <div style={{ margin: "7px 0", display: "flex", flexDirection: "column", gap: 2 }}>
          {its.slice(0, 6).map((x, i) => {
            const rec = Number(x.qtd_recebida || 0);
            return (
              <div key={i} style={{ fontSize: 12, color: "var(--text-2)", display: "flex", gap: 6 }}>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, minWidth: 56, textAlign: "right", color: rec > 0 && rec < Number(x.qtd) ? "#d97706" : "var(--text-2)" }}>{rec > 0 ? `${farmFmtQtd(rec)}/` : ""}{farmFmtQtd(x.qtd)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>{x.nome}{x.unidade ? ` (${x.unidade})` : ""}</span>
                {Number(x.custo_unit) > 0 && <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{fmtBRL(Number(x.qtd) * Number(x.custo_unit))}</span>}
              </div>
            );
          })}
          {its.length > 6 && <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>+{its.length - 6} itens</span>}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 7 }}>
          {total > 0 && <span style={{ fontSize: 12, fontWeight: 800, color: VX.turquesa, fontFamily: "JetBrains Mono, monospace" }}>{fmtBRL(total)}</span>}
          {p.previsao_entrega && <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>entrega prevista {fmtDataBR(p.previsao_entrega)}</span>}
          <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: "auto" }}>{p.created_at ? new Date(p.created_at).toLocaleDateString("pt-BR") : ""}{p.usuario ? ` · ${p.usuario}` : ""}</span>
        </div>
        {p.observacao && <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>{p.observacao}</div>}
        {p.status === "aguardando_aprovacao" && <div style={{ fontSize: 11, color: "#d97706", marginBottom: 7 }}>Aguardando aprovação da matriz.</div>}
        {p.status === "aprovado" && <div style={{ fontSize: 11, color: "#0891b2", marginBottom: 7 }}>Aprovado{p.decidido_por ? ` por ${p.decidido_por}` : ""}{p.decidido_em ? ` · ${new Date(p.decidido_em).toLocaleDateString("pt-BR")}` : ""} — pronto para enviar ao fornecedor.</div>}
        {p.status === "negado" && <div style={{ fontSize: 11.5, color: "#f43f5e", background: "#f43f5e14", border: "1px solid #f43f5e44", borderRadius: 6, padding: "6px 9px", marginBottom: 7 }}><strong>Negado{p.decidido_por ? ` por ${p.decidido_por}` : ""}:</strong> {p.negado_motivo || "sem motivo informado"}</div>}
        {canEdit && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {p.status === "aberto" && <button disabled={busy} onClick={() => enviarParaAprovacao(p)} style={btnContorno("#d97706")}>Enviar para aprovação</button>}
            {p.status === "aprovado" && <button disabled={busy} onClick={() => enviar(p)} style={btnContorno("#3b82f6")}>Enviar ao fornecedor</button>}
            {p.status === "negado" && <button disabled={busy} onClick={() => revisar(p)} style={btnContorno("#d97706")}>Revisar</button>}
            {["enviado", "parcial"].includes(p.status) && <button disabled={busy} onClick={() => setReceb(p)} style={btnContorno("#34d399")}>{busy ? "…" : "Receber (entrada)"}</button>}
            {!["recebido", "cancelado"].includes(p.status) && <button disabled={busy} onClick={() => cancelar(p)} style={btnContorno("#f43f5e")}>Cancelar</button>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {canEdit && <button onClick={() => setShowNovo(true)} style={{ background: VX.turquesa, color: "#062a26", border: "none", borderRadius: 6, padding: "9px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Novo pedido</button>}
        {(sugMat.length > 0 || sugMed.length > 0) && (
          <span style={{ fontSize: 12, color: "#d97706", fontWeight: 600 }}>
            Previsão de ruptura: {sugMat.length} materiais · {sugMed.length} medicamentos — importe no novo pedido.
          </span>
        )}
        <button onClick={() => setVerHistorico(h => !h)} style={{ marginLeft: "auto", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 14px", color: "var(--text-3)", cursor: "pointer", fontSize: 12.5 }}>{verHistorico ? "Ver ativos" : `Histórico (${historico.length})`}</button>
      </div>

      {lista.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>
          {verHistorico ? "Nenhum pedido concluído ainda." : "Nenhum pedido em andamento. Crie um em “+ Novo pedido” — dá para importar a sugestão de compra da previsão de demanda."}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, alignItems: "start" }}>
          {lista.slice(0, 60).map(p => <PedCard key={p.id} p={p} />)}
        </div>
      )}

      {showNovo && <SupNovoPedidoModal forns={forns} materiais={materiais} meds={meds.filter(m => m.ativo !== false)} sugMat={sugMat} sugMed={sugMed} onClose={() => setShowNovo(false)} onSave={criarPedido} />}
      {receb && <SupRecebModal pedido={receb} materiais={materiais} busy={busyId === receb.id} onClose={() => setReceb(null)} onConfirm={confirmarRecebimento} />}
    </div>
  );
}

// Aprovação de pedidos de compra pela matriz. Kanban de 3 colunas:
// Aguardando aprovação | Aprovado | Negado. A ação (aprovar/negar) só aparece
// para o perfil "matriz" ou o ADM Master; os demais acompanham em leitura.
function SupAprovacoesView({ sb, currentUser, canEdit, isMaster, pedidos, alcada = null, onAlcada, onChanged,
  cobertura = null, onCobertura }) {
  const [editandoCob, setEditandoCob] = useState(false);
  const [cobTxt, setCobTxt] = useState("");
  const [msgCob, setMsgCob] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [editandoAlcada, setEditandoAlcada] = useState(false);
  const [limiteTxt, setLimiteTxt] = useState(alcada == null ? "" : String(alcada));
  const [msgAlcada, setMsgAlcada] = useState(null);
  const ehMatriz = currentUser?.perfil === "matriz";

  // A decisão de quem pode aprovar deixou de ser só cargo. Ela agora
  // considera também quem CRIOU o pedido (segregação) e o valor (alçada) —
  // e mora em regra pura, testada por mutação, em vez de espalhada aqui.
  const vereditoDe = p => podeAprovarPedido(p, {
    usuario: currentUser, isMaster, ehMatriz, canEdit,
    limite: alcada, total: supPedidoTotal(p),
  });
  const colunas = ["aguardando_aprovacao", "aprovado", "negado"];
  const daColuna = st => pedidos.filter(p => p.status === st)
    .sort((a, b) => new Date(b.aprovacao_em || b.created_at || 0) - new Date(a.aprovacao_em || a.created_at || 0));

  async function aprovar(p) {
    setBusyId(p.id);
    await atualizarSupPedidoRemote(sb, p.id, { status: "aprovado", decidido_por: currentUser?.name || null, decidido_em: nowISO(), negado_motivo: null });
    registrarAuditoria(sb, currentUser, "aprovar pedido de compra", `PED-${p.id}`, {});
    setBusyId(null);
    onChanged && onChanged();
  }
  async function negar(p) {
    const motivo = prompt(`Motivo da negação do PED-${p.id}${p.fornecedor_nome ? ` (${p.fornecedor_nome})` : ""}:`);
    if (motivo == null) return;                       // cancelou o prompt
    if (!motivo.trim()) { alert("Informe o motivo da negação."); return; }
    setBusyId(p.id);
    await atualizarSupPedidoRemote(sb, p.id, { status: "negado", decidido_por: currentUser?.name || null, decidido_em: nowISO(), negado_motivo: motivo.trim() });
    registrarAuditoria(sb, currentUser, "negar pedido de compra", `PED-${p.id}`, {});
    setBusyId(null);
    onChanged && onChanged();
  }

  const AprovCard = ({ p }) => {
    const st = SUP_PED_STATUS[p.status] || SUP_PED_STATUS.aguardando_aprovacao;
    const its = Array.isArray(p.itens) ? p.itens : [];
    const total = supPedidoTotal(p);
    const busy = busyId === p.id;
    return (
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${st.cor}`, borderRadius: 10, padding: "10px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800, fontSize: 13 }}>{p.fornecedor_nome || "Sem fornecedor"}</span>
          <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>PED-{p.id}</span>
        </div>
        <div style={{ margin: "7px 0", display: "flex", flexDirection: "column", gap: 2 }}>
          {its.slice(0, 6).map((x, i) => (
            <div key={i} style={{ fontSize: 12, color: "var(--text-2)", display: "flex", gap: 6 }}>
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, minWidth: 46, textAlign: "right" }}>{farmFmtQtd(x.qtd)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{x.nome}{x.unidade ? ` (${x.unidade})` : ""}</span>
              {Number(x.custo_unit) > 0 && <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{fmtBRL(Number(x.qtd) * Number(x.custo_unit))}</span>}
            </div>
          ))}
          {its.length > 6 && <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>+{its.length - 6} itens</span>}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 7 }}>
          {total > 0 && <span style={{ fontSize: 12, fontWeight: 800, color: VX.turquesa, fontFamily: "JetBrains Mono, monospace" }}>{fmtBRL(total)}</span>}
          <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: "auto" }}>{p.usuario ? `por ${p.usuario}` : ""}{p.aprovacao_em ? ` · enviado ${new Date(p.aprovacao_em).toLocaleDateString("pt-BR")}` : ""}</span>
        </div>
        {p.observacao && <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>{p.observacao}</div>}
        {p.status === "negado" && <div style={{ fontSize: 11.5, color: "#f43f5e", marginBottom: 6 }}><strong>Motivo:</strong> {p.negado_motivo || "—"}</div>}
        {["aprovado", "negado"].includes(p.status) && p.decidido_por && <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>{p.status === "aprovado" ? "aprovado" : "negado"} por {p.decidido_por}{p.decidido_em ? ` · ${new Date(p.decidido_em).toLocaleDateString("pt-BR")}` : ""}</div>}
        {p.status === "aguardando_aprovacao" && (() => {
          const v = vereditoDe(p);
          if (v.pode) return (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button disabled={busy} onClick={() => aprovar(p)} style={btnContorno("#34d399")}>Aprovar</button>
              <button disabled={busy} onClick={() => negar(p)} style={btnContorno("#f43f5e")}>Negar</button>
            </div>
          );
          // Só mostra o motivo a quem estaria apto pelo cargo. Para os
          // demais, o pedido segue em leitura, sem explicação de recusa
          // que não lhes diz respeito.
          if (!isMaster && !ehMatriz) return null;
          return (
            <div style={{ fontSize: 11.5, color: "#d97706", background: "#33270c55", border: "1px solid #d9770655", borderRadius: 6, padding: "6px 10px" }}>
              {v.motivo}
            </div>
          );
        })()}
      </div>
    );
  };

  const totalAg = daColuna("aguardando_aprovacao").length;
  return (
    <div>
      <div style={{ fontSize: 12.5, color: "var(--text-2)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", marginBottom: 10, lineHeight: 1.5 }}>
        {isMaster || ehMatriz
          ? <>Você pode <strong>aprovar</strong> ou <strong>negar</strong> os pedidos — <strong>exceto os que você mesmo criou</strong>. {totalAg > 0 ? `${totalAg} aguardando decisão.` : "Nenhum pedido aguardando decisão."}</>
          : <>Acompanhamento das aprovações. A decisão (aprovar/negar) é da <strong>matriz</strong> (perfil próprio) ou do ADM Master.</>}
      </div>

      {/* ALÇADA — o controle mais básico de compra, e o primeiro que um
          auditor procura. Nasce DESLIGADA: um número que a equipe não
          escolheu travando compra de hospital seria pior que a ausência
          de alçada. Só o ADM Master configura — quem opera a compra não
          define o próprio teto. */}
      <div style={{ fontSize: 12, color: "var(--text-3)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", marginBottom: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", lineHeight: 1.5 }}>
        <span style={{ color: alcada == null ? "#d97706" : "var(--text-2)" }}>{descreverAlcada(alcada)}</span>
        {isMaster && !editandoAlcada && (
          <button onClick={() => { setEditandoAlcada(true); setMsgAlcada(null); setLimiteTxt(alcada == null ? "" : String(alcada)); }}
            style={{ background: "transparent", color: VX.turquesa, border: `1px solid ${VX.turquesa}55`, borderRadius: 6, padding: "4px 11px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", marginLeft: "auto", fontFamily: "Inter, sans-serif" }}>
            {alcada == null ? "Definir alçada" : "Alterar"}
          </button>
        )}
        {isMaster && editandoAlcada && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginLeft: "auto" }}>
            <input value={limiteTxt} onChange={e => setLimiteTxt(e.target.value)} placeholder="em branco = desligada"
              style={{ ...campoTexto, width: 150, padding: "5px 8px", fontSize: 12 }} autoFocus />
            <button disabled={busyId === "alcada"} onClick={async () => {
              const v = validarLimite(limiteTxt);
              if (!v.ok) { setMsgAlcada({ tom: "erro", texto: v.erro }); return; }
              setBusyId("alcada"); setMsgAlcada(null);
              const r = await salvarAlcada(sb, v.valor, currentUser);
              setBusyId(null);
              if (!r.ok) { setMsgAlcada({ tom: "erro", texto: r.erro }); return; }
              onAlcada && onAlcada(v.valor);
              registrarAuditoria(sb, currentUser, "configurar alçada de compra", v.valor == null ? "desligada" : fmtBRL(v.valor), {});
              setEditandoAlcada(false);
            }} style={{ background: VX.turquesa, color: "#062a26", border: "none", borderRadius: 6, padding: "5px 13px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {busyId === "alcada" ? "…" : "Salvar"}
            </button>
            <button onClick={() => { setEditandoAlcada(false); setMsgAlcada(null); }}
              style={{ background: "transparent", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 11px", fontSize: 12, cursor: "pointer" }}>
              Cancelar
            </button>
          </div>
        )}
        {msgAlcada && <div style={{ width: "100%", fontSize: 11.5, color: "#fb7185" }}>{msgAlcada.texto}</div>}
      </div>

      {/* 🔴 ALVO DE COBERTURA — mora aqui porque é parâmetro do módulo, na
          mesma mesa da alçada. Era `30` cravado no código, e é ele que decide
          o "capital liberável" que a diretoria lê no painel executivo. Trinta
          dias não é verdade universal: capital repõe em três, interior em
          quinze. */}
      <div style={{ fontSize: 12, color: "var(--text-3)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", marginBottom: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ color: cobertura?.padrao !== false ? "#d97706" : "var(--text-2)" }}>
          {cobertura?.padrao !== false
            ? `Alvo de cobertura: ${cobertura?.dias ?? "—"} dias — PADRÃO NOSSO, ninguém definiu ainda.`
            : `Alvo de cobertura: ${cobertura.dias} dias, definido por este hospital.`}
        </span>
        {isMaster && !editandoCob && (
          <button onClick={() => { setEditandoCob(true); setMsgCob(null); setCobTxt(String(cobertura?.dias ?? "")); }}
            style={{ background: "transparent", color: VX.turquesa, border: `1px solid ${VX.turquesa}55`, borderRadius: 6, padding: "4px 11px", fontSize: 11.5, cursor: "pointer", marginLeft: "auto" }}>
            {cobertura?.padrao !== false ? "Definir" : "Alterar"}
          </button>
        )}
        {isMaster && editandoCob && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginLeft: "auto" }}>
            <input value={cobTxt} onChange={e => setCobTxt(e.target.value)} inputMode="numeric" placeholder="dias"
              style={{ ...campoTexto, width: 90, padding: "5px 8px", fontSize: 12 }} autoFocus />
            <button disabled={busyId === "cobertura"} onClick={async () => {
              setBusyId("cobertura"); setMsgCob(null);
              const r = await salvarCobertura(sb, cobTxt, currentUser);
              setBusyId(null);
              if (!r.ok) { setMsgCob({ texto: r.erro }); return; }
              const dias = Math.round(Number(cobTxt));
              onCobertura && onCobertura({ dias, padrao: false });
              registrarAuditoria(sb, currentUser, "configurar alvo de cobertura", `${dias} dias`, {});
              setEditandoCob(false);
            }} style={{ background: VX.turquesa, color: "#062a26", border: "none", borderRadius: 6, padding: "5px 13px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {busyId === "cobertura" ? "…" : "Salvar"}
            </button>
            <button onClick={() => { setEditandoCob(false); setMsgCob(null); }}
              style={{ background: "transparent", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 11px", fontSize: 12, cursor: "pointer" }}>
              Cancelar
            </button>
          </div>
        )}
        {msgCob && <div style={{ width: "100%", fontSize: 11.5, color: "#fb7185" }}>{msgCob.texto}</div>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, alignItems: "start" }}>
        {colunas.map(col => {
          const lista = daColuna(col);
          return (
            <div key={col}>
              <div style={{ fontSize: 11, fontWeight: 800, color: SUP_PED_STATUS[col].cor, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
                {SUP_PED_STATUS[col].label} · {lista.length}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {lista.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: "12px 0", border: "1px dashed var(--border)", borderRadius: 8 }}>—</div>}
                {lista.slice(0, 40).map(p => <AprovCard key={p.id} p={p} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Montagem do pedido de compra: fornecedor + itens (material/medicamento)
function SupNovoPedidoModal({ forns, materiais, meds, sugMat, sugMed, onClose, onSave }) {
  const [fornId, setFornId] = useState(forns[0]?.id || "");
  const [prev, setPrev] = useState("");
  const [obs, setObs] = useState("");
  const [lista, setLista] = useState([]);   // [{tipo, item_id, nome, unidade, qtd, custo_unit}]
  const [tipoSel, setTipoSel] = useState("material");
  const [itemSel, setItemSel] = useState("");
  const [qtd, setQtd] = useState("");
  const [busy, setBusy] = useState(false);
  const base = tipoSel === "material" ? materiais : meds;
  const disponiveis = base.filter(i => !lista.some(x => x.tipo === tipoSel && x.item_id === i.id))
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
  const sel = base.find(i => String(i.id) === String(itemSel));
  const total = lista.reduce((s, x) => s + Number(x.qtd || 0) * Number(x.custo_unit || 0), 0);

  function adicionar() {
    const q = Number(qtd);
    if (!sel) { alert("Escolha o item."); return; }
    if (!q || q <= 0) { alert("Informe uma quantidade maior que zero."); return; }
    setLista(l => [...l, { tipo: tipoSel, item_id: sel.id, nome: sel.nome, unidade: sel.unidade || "", qtd: q, custo_unit: Number(sel.custo_unitario || 0) || "" }]);
    setItemSel(""); setQtd("");
  }
  function importarSugestoes() {
    const novos = [...sugMat, ...sugMed].filter(s => !lista.some(x => x.tipo === s.tipo && x.item_id === s.item_id))
      .map(s => ({ tipo: s.tipo, item_id: s.item_id, nome: s.nome, unidade: s.unidade, qtd: s.qtd, custo_unit: s.custo_unit }));
    if (!novos.length) { alert("Nenhuma sugestão nova para importar."); return; }
    setLista(l => [...l, ...novos]);
  }
  function mudarLinha(i, k, v) {
    setLista(l => l.map((x, j) => j === i ? { ...x, [k]: v } : x));
  }
  async function salvar() {
    if (!lista.length) { alert("Adicione pelo menos um item."); return; }
    if (lista.some(x => !Number(x.qtd) || Number(x.qtd) <= 0)) { alert("Todas as quantidades devem ser maiores que zero."); return; }
    const forn = forns.find(f => String(f.id) === String(fornId));
    setBusy(true);
    await onSave({
      fornecedor_id: forn?.id || null,
      fornecedor_nome: forn?.nome || null,
      itens: lista.map(x => ({ ...x, qtd: Number(x.qtd), custo_unit: Number(x.custo_unit || 0) || null, qtd_recebida: 0 })),
      previsao_entrega: prev || null,
      observacao: obs.trim() || null,
      status: "aberto",
    });
    setBusy(false);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 620, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Novo pedido de compra</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={rotuloCampo}>Fornecedor</label>
            <select value={fornId} onChange={e => setFornId(e.target.value)} style={campoTexto}>
              <option value="">— definir depois —</option>
              {forns.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div>
            <label style={rotuloCampo}>Entrega prevista</label>
            <input type="date" value={prev} onChange={e => setPrev(e.target.value)} style={campoTexto} />
          </div>
        </div>

        {(sugMat.length > 0 || sugMed.length > 0) && (
          <button onClick={importarSugestoes} style={{ width: "100%", background: "#d9770614", border: "1px solid #d9770655", color: "#d97706", borderRadius: 8, padding: "9px 12px", fontWeight: 700, cursor: "pointer", fontSize: 12.5, marginBottom: 12, textAlign: "left" }}>
            ⇩ Importar sugestão de compra da previsão de demanda ({sugMat.length} materiais · {sugMed.length} medicamentos)
          </button>
        )}

        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", marginBottom: 8 }}>Adicionar item</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            {["material", "medicamento"].map(t => (
              <button key={t} onClick={() => { setTipoSel(t); setItemSel(""); }} style={{ flex: 1, background: tipoSel === t ? VX.turquesa : "transparent", color: tipoSel === t ? "#062a26" : "var(--text-3)", border: `1px solid ${tipoSel === t ? VX.turquesa : "var(--border)"}`, borderRadius: 7, padding: "7px 0", fontWeight: 700, cursor: "pointer", fontSize: 12.5 }}>{t === "material" ? "Material" : "Medicamento"}</button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 80px auto", gap: 8, alignItems: "end" }}>
            <div>
              <label style={rotuloCampo}>{tipoSel === "material" ? "Material" : "Medicamento"}</label>
              <select value={itemSel} onChange={e => setItemSel(e.target.value)} style={campoTexto}>
                <option value="">— escolha —</option>
                {disponiveis.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
              </select>
            </div>
            <div>
              <label style={rotuloCampo}>Qtd *</label>
              <input type="number" min="0" step="any" value={qtd} onChange={e => setQtd(e.target.value)} placeholder="0" style={campoTexto} />
            </div>
            <button onClick={adicionar} style={{ background: "var(--surface-3)", color: "var(--text-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Add</button>
          </div>
        </div>

        {lista.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 8 }}>
            {lista.map((x, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "6px 10px" }}>
                <span style={{ fontSize: 9.5, color: x.tipo === "medicamento" ? "#6366f1" : "var(--text-muted)", border: `1px solid ${x.tipo === "medicamento" ? "#6366f155" : "var(--border-2)"}`, borderRadius: 99, padding: "0 6px", fontWeight: 700, flexShrink: 0 }}>{x.tipo === "medicamento" ? "MED" : "MAT"}</span>
                <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-2)", minWidth: 0 }}>{x.nome}{x.unidade ? ` (${x.unidade})` : ""}</span>
                <input type="number" min="0" step="any" value={x.qtd} onChange={e => mudarLinha(i, "qtd", e.target.value)} title="Quantidade" style={{ ...campoTexto, width: 70, padding: "5px 7px", fontSize: 12 }} />
                <input type="number" min="0" step="any" value={x.custo_unit} onChange={e => mudarLinha(i, "custo_unit", e.target.value)} placeholder="R$ unit." title="Custo unitário (R$)" style={{ ...campoTexto, width: 82, padding: "5px 7px", fontSize: 12 }} />
                <button onClick={() => setLista(l => l.filter((_, j) => j !== i))} style={{ background: "transparent", border: "none", color: "#f43f5e", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>✕</button>
              </div>
            ))}
          </div>
        )}
        {total > 0 && <div style={{ textAlign: "right", fontSize: 13, fontWeight: 800, color: VX.turquesa, fontFamily: "JetBrains Mono, monospace", marginBottom: 10 }}>Total estimado: {fmtBRL(total)}</div>}

        <div style={{ marginBottom: 16 }}>
          <label style={rotuloCampo}>Observação</label>
          <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Condições, cotação, urgência…" style={campoTexto} />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={salvar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Criar pedido"}</button>
        </div>
      </div>
    </div>
  );
}

// Recebimento do pedido: informa qtd/lote/validade por item → entrada no estoque
function SupRecebModal({ pedido, materiais = [], busy, onClose, onConfirm }) {
  const its = Array.isArray(pedido.itens) ? pedido.itens : [];
  // Só materiais têm conversão de unidade; medicamento é sempre na própria.
  const matById = {}; materiais.forEach(m => matById[m.id] = m);
  const materialDa = x => (x.tipo === "medicamento" ? null : matById[x.item_id]);
  const [nf, setNf] = useState("");
  const [linhas, setLinhas] = useState(its.map((x, idx) => ({
    idx, qtd: Math.max(0, Number(x.qtd || 0) - Number(x.qtd_recebida || 0)), lote: "", validade: "",
  })));
  const set = (i, k, v) => setLinhas(l => l.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const algum = linhas.some(l => Number(l.qtd) > 0);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 640, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Receber pedido PED-{pedido.id}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
          {pedido.fornecedor_nome || "Sem fornecedor"} · informe o que chegou — cada linha vira uma <strong>entrada</strong> no estoque (materiais no almoxarifado, medicamentos na Farmácia). Recebimento parcial é permitido.
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={rotuloCampo}>Nota fiscal / documento</label>
          <input value={nf} onChange={e => setNf(e.target.value)} placeholder={`Nº NF (se vazio, usa PED-${pedido.id})`} style={{ ...campoTexto, maxWidth: 260 }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {its.map((x, i) => {
            const restante = Math.max(0, Number(x.qtd || 0) - Number(x.qtd_recebida || 0));
            const ln = linhas[i];
            const mat = materialDa(x);
            return (
              <div key={i} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 9.5, color: x.tipo === "medicamento" ? "#6366f1" : "var(--text-muted)", border: `1px solid ${x.tipo === "medicamento" ? "#6366f155" : "var(--border-2)"}`, borderRadius: 99, padding: "0 6px", fontWeight: 700 }}>{x.tipo === "medicamento" ? "MED" : "MAT"}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-2)", flex: 1, minWidth: 0 }}>{x.nome}</span>
                  <span style={{ fontSize: 11, color: restante > 0 ? "var(--text-muted)" : "#34d399", fontFamily: "JetBrains Mono, monospace" }}>{restante > 0 ? `falta ${farmFmtQtd(restante)}` : "completo"}</span>
                </div>
                {restante > 0 && (<>
                  <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr", gap: 8 }}>
                    <div><label style={rotuloCampo}>Qtd recebida{mat && temConversao(mat) ? ` (${(mat.unidade_compra || "compra").trim()})` : ""}</label><input type="number" min="0" step="any" value={ln.qtd} onChange={e => set(i, "qtd", e.target.value)} style={campoTexto} /></div>
                    <div><label style={rotuloCampo}>Lote</label><input value={ln.lote} onChange={e => set(i, "lote", e.target.value)} placeholder="opcional" style={campoTexto} /></div>
                    <div><label style={rotuloCampo}>Validade</label><input type="date" value={ln.validade} onChange={e => set(i, "validade", e.target.value)} style={campoTexto} /></div>
                  </div>
                  {/* Conferir caixa contra unidade é o erro que a conversão
                      existe para evitar — então a tela diz os dois lados
                      antes de confirmar, em vez de converter escondido. */}
                  {mat && temConversao(mat) && Number(ln.qtd) > 0 && (
                    <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 6 }}>
                      Entra no estoque: <strong>{descreverEntrada(ln.qtd, mat)}</strong>
                      {Number(x.custo_unit) > 0 && <> · custo <strong>{fmtBRL(custoPorUnidadeConsumo(x.custo_unit, mat) || 0)}</strong> por {mat.unidade || "un"}</>}
                    </div>
                  )}
                </>)}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={() => onConfirm(pedido, linhas, nf.trim())} disabled={busy || !algum} style={{ background: "#34d399", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13, opacity: (busy || !algum) ? 0.5 : 1 }}>{busy ? "…" : "Confirmar recebimento"}</button>
        </div>
      </div>
    </div>
  );
}

// Estoque preditivo — quando acaba cada item no ritmo atual (materiais + medicamentos)
function SupPreditivoView({ sb, itens, lotes, saidasHist, leadMap = {} }) {
  const [meds, setMeds] = useState([]);
  const [medLotes, setMedLotes] = useState([]);
  const [medSaidas, setMedSaidas] = useState([]);
  const [saidas7, setSaidas7] = useState([]);       // materiais, últimos 7d (demanda instável)
  const [medSaidas7, setMedSaidas7] = useState([]); // medicamentos, últimos 7d
  const [busca, setBusca] = useState("");
  const [tipoF, setTipoF] = useState("");        // "" | material | medicamento
  const [soComGiro, setSoComGiro] = useState(true);

  useEffect(() => {
    if (!sb) return;
    loadFarmMedicamentos(sb).then(setMeds);
    loadFarmLotes(sb).then(setMedLotes);
    loadFarmSaidasDesde(sb, new Date(Date.now() - FARM_PREV_JANELA * 86400000).toISOString()).then(setMedSaidas);
    loadSupSaidasDesde(sb, new Date(Date.now() - 7 * 86400000).toISOString()).then(setSaidas7);
    loadFarmSaidasDesde(sb, new Date(Date.now() - 7 * 86400000).toISOString()).then(setMedSaidas7);
  }, []);

  function linhas(base, lotesBase, saidas, saidas7d, idKey, tipo, saldoFn) {
    const cons = {}; saidas.forEach(s => { const id = s[idKey]; if (id) cons[id] = (cons[id] || 0) + Number(s.quantidade || 0); });
    const cons7 = {}; saidas7d.forEach(s => { const id = s[idKey]; if (id) cons7[id] = (cons7[id] || 0) + Number(s.quantidade || 0); });
    return base.filter(x => x.ativo !== false).map(x => {
      const media = (cons[x.id] || 0) / FARM_PREV_JANELA;
      const media7 = (cons7[x.id] || 0) / 7;
      const saldo = saldoFn(x.id);
      const cobertura = media > 0 ? saldo / media : null;
      const dataFim = cobertura != null ? new Date(Date.now() + cobertura * 86400000) : null;
      const prazo = tipo === "material" ? supPrazoReposicao(x.id, leadMap) : (SUP_LEAD_PADRAO + SUP_MARGEM_SEG);
      const sugestao = media > 0 ? Math.max(0, Math.ceil(media * prazo + Number(x.estoque_minimo || 0) - saldo)) : 0;
      const comprarAgora = cobertura != null && cobertura < prazo;
      // demanda instável: consumo recente (7d) destoa muito da média de 30d
      const instavel = media > 0 && (media7 > media * 1.75 || media7 < media * 0.4);
      return { tipo, nome: x.nome, unidade: x.unidade || "", saldo, media, cobertura, dataFim, sugestao, prazo, comprarAgora, instavel, subindo: media7 > media };
    });
  }
  const todas = [
    ...linhas(itens, lotes, saidasHist, saidas7, "item_id", "material", id => supSaldoTotal(id, lotes)),
    ...linhas(meds, medLotes, medSaidas, medSaidas7, "medicamento_id", "medicamento", id => saldoDoMedicamento(id, medLotes)),
  ];
  const q = normTxt(busca);
  const view = todas
    .filter(x => !tipoF || x.tipo === tipoF)
    .filter(x => !q || normTxt(x.nome).includes(q))
    .filter(x => !soComGiro || x.media > 0)
    .sort((a, b) => (a.cobertura ?? 1e9) - (b.cobertura ?? 1e9));
  const comprarAgoraN = todas.filter(x => x.comprarAgora).length;
  const instaveisN = todas.filter(x => x.instavel).length;
  // Situação pelo ponto de pedido do próprio item (não mais um "7" fixo)
  const statusDe = x => x.cobertura == null ? { cor: "var(--text-muted)", label: "sem giro" }
    : x.comprarAgora ? { cor: "#f43f5e", label: "comprar agora" }
    : x.cobertura < x.prazo * 1.5 ? { cor: "#d97706", label: "atenção" }
    : { cor: "#34d399", label: "ok" };
  const fmtDias = c => c == null ? "—" : c < 1 ? "menos de 1 dia" : `~${Math.floor(c)} dia(s)`;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 14 }}>
        {[["Comprar agora (ponto de pedido)", comprarAgoraN, comprarAgoraN ? "#f43f5e" : "#34d399", "cobertura abaixo do prazo de entrega"],
          ["Demanda instável", instaveisN, instaveisN ? "#d97706" : "#34d399", "consumo recente destoa da média"],
          ["Itens com consumo (30d)", todas.filter(x => x.media > 0).length, VX.azul, "base da previsão"]].map(([l, v, cor, sub]) => (
          <div key={l} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${cor}`, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{l}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: cor, fontFamily: "JetBrains Mono, monospace", marginTop: 3 }}>{v}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar item…" style={{ ...campoTexto, maxWidth: 300, flex: "1 1 200px" }} />
        <select value={tipoF} onChange={e => setTipoF(e.target.value)} style={{ ...campoTexto, maxWidth: 180 }}>
          <option value="">Materiais + medicamentos</option>
          <option value="material">Só materiais</option>
          <option value="medicamento">Só medicamentos</option>
        </select>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--text-2)", cursor: "pointer" }}>
          <input type="checkbox" checked={soComGiro} onChange={e => setSoComGiro(e.target.checked)} style={{ accentColor: VX.turquesa, width: 14, height: 14 }} /> só itens com consumo
        </label>
      </div>

      {view.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Nenhum item com esse filtro. A previsão usa o consumo dos últimos {FARM_PREV_JANELA} dias.</div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 760 }}>
            <thead><tr style={{ background: "var(--surface-2)", textAlign: "left", color: "var(--text-3)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>
              <th style={{ padding: "9px 12px" }}>Item</th>
              <th style={{ padding: "9px 12px", textAlign: "right" }}>Saldo</th>
              <th style={{ padding: "9px 12px", textAlign: "right" }}>Consumo/dia</th>
              <th style={{ padding: "9px 12px" }}>Acaba em</th>
              <th style={{ padding: "9px 12px" }}>Data prevista</th>
              <th style={{ padding: "9px 12px", textAlign: "right" }}>Prazo entrega</th>
              <th style={{ padding: "9px 12px" }}>Situação</th>
              <th style={{ padding: "9px 12px", textAlign: "right" }}>Comprar</th>
            </tr></thead>
            <tbody>
              {view.slice(0, 120).map((x, i) => { const st = statusDe(x); return (
                <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{ fontSize: 9.5, fontWeight: 800, color: x.tipo === "medicamento" ? "#6366f1" : "var(--text-muted)", border: `1px solid ${x.tipo === "medicamento" ? "#6366f155" : "var(--border-2)"}`, borderRadius: 99, padding: "0 6px", marginRight: 7 }}>{x.tipo === "medicamento" ? "MED" : "MAT"}</span>
                    <span style={{ fontWeight: 600 }}>{x.nome}</span>
                    {x.instavel && <span title={x.subindo ? "Consumo recente bem acima da média — pode ser pico/surto" : "Consumo recente bem abaixo da média"} style={{ fontSize: 9.5, fontWeight: 800, color: "#d97706", border: "1px solid #d9770655", borderRadius: 99, padding: "0 6px", marginLeft: 6 }}>{x.subindo ? "↑ instável" : "↓ instável"}</span>}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>{farmFmtQtd(x.saldo)} <span style={{ fontSize: 10.5, color: "var(--text-muted)", fontFamily: "Inter, sans-serif", fontWeight: 400 }}>{x.unidade}</span></td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{x.media > 0 ? farmFmtQtd(Math.round(x.media * 10) / 10) : "—"}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 700, color: st.cor }}>{fmtDias(x.cobertura)}</td>
                  <td style={{ padding: "8px 12px", fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--text-2)" }}>{x.dataFim ? x.dataFim.toLocaleDateString("pt-BR") : "—"}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--text-muted)" }}>{x.tipo === "material" ? `${x.prazo}d` : `${x.prazo}d*`}</td>
                  <td style={{ padding: "8px 12px" }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 99, background: st.cor, marginRight: 6 }} /><span style={{ fontSize: 12, color: st.cor, fontWeight: st.label === "ok" ? 400 : 700 }}>{st.label}</span></td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: x.sugestao > 0 ? VX.azul : "var(--text-muted)" }}>{x.sugestao > 0 ? farmFmtQtd(x.sugestao) : "—"}</td>
                </tr>
              ); })}
            </tbody>
          </table>
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", padding: "6px 12px" }}>Previsão pela média de consumo dos últimos {FARM_PREV_JANELA} dias. "Comprar agora" = a cobertura já é menor que o prazo de entrega + margem ({SUP_MARGEM_SEG}d). "Comprar" cobre o prazo de reposição + estoque mínimo. <strong>*</strong> medicamentos usam o prazo padrão ({SUP_LEAD_PADRAO}d), pois o fornecedor não é vinculado na baixa.</div>
        </div>
      )}
    </div>
  );
}

// Vencimentos inteligentes — o que vence, quanto vale e o que não será consumido a tempo
function SupVencimentosView({ sb, itens, lotes, saidasHist }) {
  const [meds, setMeds] = useState([]);
  const [medLotes, setMedLotes] = useState([]);
  const [medSaidas, setMedSaidas] = useState([]);
  useEffect(() => {
    if (!sb) return;
    loadFarmMedicamentos(sb).then(setMeds);
    loadFarmLotes(sb).then(setMedLotes);
    loadFarmSaidasDesde(sb, new Date(Date.now() - FARM_PREV_JANELA * 86400000).toISOString()).then(setMedSaidas);
  }, []);

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  function linhas(base, lotesBase, saidas, idKey, tipo) {
    const byId = {}; base.forEach(x => byId[x.id] = x);
    const cons = {}; saidas.forEach(s => { const id = s[idKey]; if (id) cons[id] = (cons[id] || 0) + Number(s.quantidade || 0); });
    const fkey = idKey === "item_id" ? "item_id" : "medicamento_id";
    return lotesBase.filter(l => Number(l.quantidade) > 0 && l.validade).map(l => {
      const item = byId[l[fkey]];
      if (!item || item.ativo === false) return null;
      const dias = Math.round((new Date(l.validade + "T00:00:00") - hoje) / 86400000);
      if (dias > 90) return null;
      const media = (cons[item.id] || 0) / FARM_PREV_JANELA;
      // consegue consumir este lote antes de vencer? (aproximação: consumo médio × dias restantes)
      const consumivel = dias > 0 && media > 0 && media * dias >= Number(l.quantidade);
      return {
        tipo, nome: item.nome, unidade: item.unidade || "", lote: l.lote || "—",
        validade: l.validade, dias, qtd: Number(l.quantidade),
        valor: Number(l.quantidade) * custoUnit(item), media, consumivel,
      };
    }).filter(Boolean);
  }
  const todas = [
    ...linhas(itens, lotes, saidasHist, "item_id", "material"),
    ...linhas(meds, medLotes, medSaidas, "medicamento_id", "medicamento"),
  ].sort((a, b) => a.dias - b.dias);

  const vencidos = todas.filter(x => x.dias < 0);
  const ate30 = todas.filter(x => x.dias >= 0 && x.dias <= 30);
  const ate90 = todas.filter(x => x.dias > 30 && x.dias <= 90);
  const emRiscoReal = todas.filter(x => x.dias >= 0 && x.dias <= 90 && !x.consumivel);
  const somaQtd = arr => arr.reduce((s, x) => s + x.qtd, 0);
  const somaVal = arr => arr.reduce((s, x) => s + x.valor, 0);

  const Faixa = ({ titulo, cor, dados }) => (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${cor}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>{titulo}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: dados.length ? cor : "var(--text)", fontFamily: "JetBrains Mono, monospace" }}>{farmFmtQtd(somaQtd(dados))} <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>un · {dados.length} lote(s)</span></div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{somaVal(dados) > 0 ? fmtReais(somaVal(dados)) : "sem custo cadastrado"}</div>
    </div>
  );

  return (
    <div>
      {/* MANCHETE */}
      <div style={{ background: ate30.length ? "#d9770612" : "var(--surface)", border: `1px solid ${ate30.length ? "#d9770655" : "var(--border)"}`, borderRadius: 10, padding: "14px 18px", marginBottom: 14, fontSize: 14.5, color: "var(--text)" }}>
        {ate30.length === 0 && vencidos.length === 0
          ? "✅ Nenhum lote vencido nem vencendo nos próximos 30 dias."
          : <>Existem <strong style={{ color: "#d97706" }}>{farmFmtQtd(somaQtd(ate30))} unidades</strong> em <strong>{ate30.length} lote(s)</strong> vencendo nos próximos 30 dias{somaVal(ate30) > 0 && <> — <strong style={{ color: "#d97706" }}>{fmtReais(somaVal(ate30))}</strong> em risco</>}{vencidos.length > 0 && <>, além de <strong style={{ color: "#f43f5e" }}>{farmFmtQtd(somaQtd(vencidos))} unidades já vencidas</strong> ({fmtReais(somaVal(vencidos))})</>}.</>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Faixa titulo="Já vencidos (em estoque)" cor="#f43f5e" dados={vencidos} />
        <Faixa titulo="Vencem em até 30 dias" cor="#d97706" dados={ate30} />
        <Faixa titulo="Vencem em 31–90 dias" cor="#3b82f6" dados={ate90} />
        <Faixa titulo="Não serão consumidos a tempo" cor="#e11d48" dados={emRiscoReal} />
      </div>

      {todas.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Nenhum lote com validade nos próximos 90 dias. Lance as entradas com lote/validade para alimentar este painel.</div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 780 }}>
            <thead><tr style={{ background: "var(--surface-2)", textAlign: "left", color: "var(--text-3)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>
              <th style={{ padding: "9px 12px" }}>Item · lote</th>
              <th style={{ padding: "9px 12px" }}>Validade</th>
              <th style={{ padding: "9px 12px", textAlign: "right" }}>Qtd</th>
              <th style={{ padding: "9px 12px", textAlign: "right" }}>Valor</th>
              <th style={{ padding: "9px 12px" }}>Consumo cobre?</th>
              <th style={{ padding: "9px 12px" }}>Ação sugerida</th>
            </tr></thead>
            <tbody>
              {todas.slice(0, 100).map((x, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{ fontSize: 9.5, fontWeight: 800, color: x.tipo === "medicamento" ? "#6366f1" : "var(--text-muted)", border: `1px solid ${x.tipo === "medicamento" ? "#6366f155" : "var(--border-2)"}`, borderRadius: 99, padding: "0 6px", marginRight: 7 }}>{x.tipo === "medicamento" ? "MED" : "MAT"}</span>
                    <span style={{ fontWeight: 600 }}>{x.nome}</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}> · lote {x.lote}</span>
                  </td>
                  <td style={{ padding: "8px 12px", fontWeight: 700, color: x.dias < 0 ? "#f43f5e" : x.dias <= 30 ? "#d97706" : "var(--text-2)" }}>{fmtDataBR(x.validade)} <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>({x.dias < 0 ? `vencido há ${-x.dias}d` : `${x.dias}d`})</span></td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>{farmFmtQtd(x.qtd)} <span style={{ fontSize: 10.5, color: "var(--text-muted)", fontFamily: "Inter, sans-serif", fontWeight: 400 }}>{x.unidade}</span></td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{x.valor > 0 ? fmtReais(x.valor) : "—"}</td>
                  <td style={{ padding: "8px 12px", fontSize: 12, fontWeight: 700, color: x.dias < 0 ? "#f43f5e" : x.consumivel ? "#34d399" : "#e11d48" }}>{x.dias < 0 ? "vencido" : x.consumivel ? "sim" : x.media > 0 ? "não, no ritmo atual" : "sem consumo"}</td>
                  <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-2)" }}>
                    {x.dias < 0 ? "Baixa por perda/descarte e segregar"
                      : x.consumivel ? "Consumir normalmente (FEFO já prioriza)"
                      : x.media > 0 ? "Priorizar uso, remanejar entre setores ou negociar troca com o fornecedor"
                      : "Sem giro — avaliar remanejamento/devolução antes de vencer"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", padding: "6px 12px" }}>"Consumo cobre?" compara a quantidade do lote com o consumo médio diário ({FARM_PREV_JANELA} dias) × dias até vencer. Valores pelo custo unitário cadastrado.</div>
        </div>
      )}
    </div>
  );
}

// Ações de hoje — consolida toda a inteligência do módulo numa lista priorizada
// de tarefas do almoxarifado. Cada bloco leva direto à ferramenta certa.
function SupAcoesView({ itens, lotes, saidasHist, reqs, pedidos, invs, leadMap = {}, onNav }) {
  const ativos = itens.filter(i => i.ativo !== false);
  const consumo = {}; saidasHist.forEach(s => { if (s.item_id) consumo[s.item_id] = (consumo[s.item_id] || 0) + Number(s.quantidade || 0); });
  const media = i => (consumo[i.id] || 0) / FARM_PREV_JANELA;
  const saldo = i => supSaldoTotal(i.id, lotes);
  const cobertura = i => { const m = media(i); return m > 0 ? saldo(i) / m : null; };

  // Rupturas com giro (zerado mas com consumo) — o mais urgente
  const rupturas = ativos.filter(i => saldo(i) <= 0 && media(i) > 0);
  // Comprar agora (ponto de pedido): cobertura abaixo do prazo de entrega
  const comprar = ativos.filter(i => { const c = cobertura(i); return c != null && c < supPrazoReposicao(i.id, leadMap); });
  // Vencimentos em risco: lote vencido ou vencendo ≤30d que não se consome a tempo
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const vencRisco = lotes.filter(l => {
    if (!(Number(l.quantidade) > 0 && l.validade)) return false;
    const st = infoDeValidade(l.validade).status;
    if (!["vencido", "vencendo"].includes(st)) return false;
    const it = itens.find(x => x.id === l.item_id);
    const dias = Math.max(0, Math.round((new Date(l.validade + "T00:00:00") - hoje) / 86400000));
    const m = it ? media(it) : 0;
    return st === "vencido" || !(m > 0 && m * dias >= Number(l.quantidade));   // não dá pra consumir a tempo
  }).map(l => ({ l, it: itens.find(x => x.id === l.item_id) }));
  // Fluxos do módulo
  const reqAg = reqs.filter(r => r.status === "aguardando");
  const reqPr = reqs.filter(r => r.status === "pronto");
  const pedRec = pedidos.filter(p => ["enviado", "parcial"].includes(p.status));
  // Contagens de inventário pendentes (curva ABC)
  const valorCons = i => (consumo[i.id] || 0) * custoUnit(i);
  const ranked = [...ativos].map(i => ({ i, v: valorCons(i) })).sort((a, b) => b.v - a.v);
  const totalV = ranked.reduce((s, x) => s + x.v, 0);
  const classe = {}; let ac = 0; ranked.forEach(x => { ac += x.v; const p = totalV ? ac / totalV : 1; classe[x.i.id] = x.v <= 0 ? "C" : p <= 0.8 ? "A" : p <= 0.95 ? "B" : "C"; });
  const ultima = {}; invs.forEach(v => { if (!ultima[v.item_id]) ultima[v.item_id] = v; });
  const invPend = ativos.filter(i => { const u = ultima[i.id]; const d = u ? Math.floor((Date.now() - new Date(u.created_at)) / 86400000) : null; return d == null || d >= SUP_INV_INTERVALO[classe[i.id] || "C"]; });

  const blocos = [
    { key: "rup", cor: "#f43f5e", titulo: "Rupturas com consumo", n: rupturas.length, nav: "estoque", verbo: "repor com urgência",
      itens: rupturas.slice(0, 6).map(i => i.nome), dica: "Zerados que têm saída — parou de atender. Registre entrada ou emita compra já." },
    { key: "comp", cor: "#f43f5e", titulo: "Comprar agora (ponto de pedido)", n: comprar.length, nav: "compras", verbo: "gerar pedido",
      itens: comprar.slice(0, 6).map(i => `${i.nome} · cobre ${cobertura(i) < 1 ? "<1" : Math.floor(cobertura(i))}d`), dica: "Cobertura abaixo do prazo de entrega — vão romper antes da próxima compra chegar." },
    { key: "venc", cor: "#d97706", titulo: "Vencendo sem dar tempo de usar", n: vencRisco.length, nav: "vencimentos", verbo: "remanejar / priorizar",
      itens: vencRisco.slice(0, 6).map(x => `${x.it?.nome || "?"} · lote ${x.l.lote || "?"} vence ${fmtDataBR(x.l.validade)}`), dica: "No ritmo atual não serão consumidos a tempo — remaneje, priorize o uso ou negocie troca." },
    { key: "reqAg", cor: "#3b82f6", titulo: "Requisições aguardando", n: reqAg.length, nav: "requisicoes", verbo: "receber e separar",
      itens: reqAg.slice(0, 6).map(r => `${r.setor} · ${(r.itens || []).length} item(ns)`), dica: "Setores esperando material." },
    { key: "reqPr", cor: "#3b82f6", titulo: "Prontas para retirada", n: reqPr.length, nav: "requisicoes", verbo: "confirmar entrega",
      itens: reqPr.slice(0, 6).map(r => `${r.setor}`), dica: "Já separadas — confirmar a entrega ao setor." },
    { key: "ped", cor: "#3b82f6", titulo: "Pedidos a receber", n: pedRec.length, nav: "compras", verbo: "dar entrada",
      itens: pedRec.slice(0, 6).map(p => `PED-${p.id} · ${p.fornecedor_nome || "sem fornecedor"}`), dica: "Compras enviadas ou parciais aguardando recebimento." },
    { key: "inv", cor: "#8d99ab", titulo: "Contagens de inventário na fila", n: invPend.length, nav: "inventario", verbo: "contar",
      itens: invPend.slice(0, 6).map(i => `${i.nome} · classe ${classe[i.id] || "C"}`), dica: "Contagem cíclica pela curva ABC — mantém a acuracidade." },
  ];
  const urgentes = blocos.filter(b => ["#f43f5e"].includes(b.cor)).reduce((s, b) => s + b.n, 0);
  const totalAcoes = blocos.reduce((s, b) => s + b.n, 0);
  const comItens = blocos.filter(b => b.n > 0);

  return (
    <div>
      <div style={{ background: totalAcoes ? (urgentes ? "#f43f5e10" : "#d9770610") : "var(--surface)", border: `1px solid ${totalAcoes ? (urgentes ? "#f43f5e44" : "#d9770644") : "var(--border)"}`, borderRadius: 10, padding: "14px 18px", marginBottom: 16, fontSize: 14.5 }}>
        {totalAcoes === 0
          ? "✅ Nada pendente no almoxarifado agora — estoque, requisições, compras e contagens em dia."
          : <>Você tem <strong>{totalAcoes} ação(ões)</strong> para hoje{urgentes > 0 && <>, sendo <strong style={{ color: "#f43f5e" }}>{urgentes} urgente(s)</strong> (rupturas e compras críticas)</>}. Em ordem de prioridade abaixo.</>}
      </div>

      {comItens.length === 0 ? null : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12, alignItems: "start" }}>
          {comItens.map(b => (
            <div key={b.key} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${b.cor}`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 22, fontWeight: 800, fontFamily: "JetBrains Mono, monospace", color: b.cor, minWidth: 34 }}>{b.n}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", flex: 1 }}>{b.titulo}</span>
                <button onClick={() => onNav && onNav(b.nav)} style={{ background: "transparent", border: `1px solid ${b.cor}66`, color: b.cor, borderRadius: 6, padding: "5px 11px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>{b.verbo} →</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 6 }}>
                {b.itens.map((t, i) => <div key={i} style={{ fontSize: 12, color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>• {t}</div>)}
                {b.n > b.itens.length && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>+{b.n - b.itens.length} outros</div>}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--text-muted)", lineHeight: 1.4 }}>{b.dica}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 16 }}>Atualiza sozinho. Prioridade: vermelho = urgente (ruptura/compra), âmbar = atenção (vencimento), azul = fluxo, cinza = rotina.</div>
    </div>
  );
}

function SupExecutivoView({ sb, itens, lotes, reqs = [], invs = [], cobertura = null }) {
  // ⚠️ Enquanto a leitura não volta, usa o padrão — a conta precisa de um
  // número para existir. O que NÃO se faz é esconder que é o padrão: a faixa
  // abaixo diz quando ninguém configurou.
  const alvoDias = cobertura?.dias ?? SUP_EXEC_COBERTURA_ALVO;
  const alvoEhPadrao = cobertura?.padrao !== false;
  const [simGrupo, setSimGrupo] = useState("");
  const [simPct, setSimPct] = useState(30);
  const [meds, setMeds] = useState([]);
  const [medLotes, setMedLotes] = useState([]);
  const [supMesAtual, setSupMesAtual] = useState([]);
  const [supMesAnt, setSupMesAnt] = useState([]);
  const [farmMesAtual, setFarmMesAtual] = useState([]);
  const [farmMesAnt, setFarmMesAnt] = useState([]);
  const [supSaidas30, setSupSaidas30] = useState([]);
  const [farmSaidas30, setFarmSaidas30] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!sb) return;
    const iniAtual = new Date(); iniAtual.setDate(1); iniAtual.setHours(0, 0, 0, 0);
    const fimAtual = new Date(iniAtual.getFullYear(), iniAtual.getMonth() + 1, 1);
    const iniAnt = new Date(iniAtual.getFullYear(), iniAtual.getMonth() - 1, 1);
    Promise.all([
      loadFarmMedicamentos(sb), loadFarmLotes(sb),
      loadSupMovimentosPeriodo(sb, iniAtual.toISOString(), fimAtual.toISOString()),
      loadSupMovimentosPeriodo(sb, iniAnt.toISOString(), iniAtual.toISOString()),
      loadFarmMovimentosPeriodo(sb, iniAtual.toISOString(), fimAtual.toISOString()),
      loadFarmMovimentosPeriodo(sb, iniAnt.toISOString(), iniAtual.toISOString()),
      loadSupSaidasDesde(sb, new Date(Date.now() - FARM_PREV_JANELA * 86400000).toISOString()),
      loadFarmSaidasDesde(sb, new Date(Date.now() - FARM_PREV_JANELA * 86400000).toISOString()),
    ]).then(([m, ml, sa, sp, fa, fp, ss, fs]) => {
      setMeds(m); setMedLotes(ml);
      setSupMesAtual(sa); setSupMesAnt(sp);
      setFarmMesAtual(fa); setFarmMesAnt(fp);
      setSupSaidas30(ss); setFarmSaidas30(fs);
      setCarregando(false);
    });
  }, []);

  const itemById = {}; itens.forEach(i => itemById[i.id] = i);
  const medById = {}; meds.forEach(m => medById[m.id] = m);
  const ativosMat = itens.filter(i => i.ativo !== false);
  const ativosMed = meds.filter(m => m.ativo !== false);

  // ── 1. Capital parado no estoque (saldo × custo unitário) ──
  const capMat = ativosMat.reduce((s, i) => s + supSaldoTotal(i.id, lotes) * custoUnit(i), 0);
  const capMed = ativosMed.reduce((s, m) => s + saldoDoMedicamento(m.id, medLotes) * custoUnit(m), 0);
  const capTotal = capMat + capMed;
  const semPreco = ativosMat.filter(i => supSaldoTotal(i.id, lotes) > 0 && !custoUnit(i)).length
                 + ativosMed.filter(m => saldoDoMedicamento(m.id, medLotes) > 0 && !custoUnit(m)).length;

  // ── Acuracidade do estoque (contagens de inventário dos últimos 90 dias) ──
  const ultimaInv = {}; invs.forEach(v => { if (!ultimaInv[v.item_id]) ultimaInv[v.item_id] = v; });
  const invRecentes = Object.values(ultimaInv).filter(u => (Date.now() - new Date(u.created_at)) / 86400000 <= 90);
  const acuracidade = invRecentes.length ? (invRecentes.filter(u => Number(u.diferenca) === 0).length / invRecentes.length) * 100 : null;

  // ── Confiança dos dados: o quanto dá para acreditar nos R$ e nas previsões ──
  // (custo cadastrado, itens inventariados nos últimos 90d, código de barras)
  const baseCusto = [...ativosMat, ...ativosMed];
  const pctCusto = baseCusto.length ? (baseCusto.filter(x => custoUnit(x) > 0).length / baseCusto.length) * 100 : null;
  const pctInventariado = ativosMat.length ? (Object.values(ultimaInv).filter(u => (Date.now() - new Date(u.created_at)) / 86400000 <= 90).length / ativosMat.length) * 100 : null;
  const pctBarras = ativosMat.length ? (ativosMat.filter(i => (i.codigo_barras || "").trim()).length / ativosMat.length) * 100 : null;

  // ── 2. Gasto do mês vs mês anterior (entradas = compras) ──
  const custoSup = mv => Number(mv.quantidade || 0) * custoUnit(itemById[mv.item_id]);
  const custoFarm = mv => Number(mv.quantidade || 0) * custoUnit(medById[mv.medicamento_id]);
  const gasto = (sup, farm) => sup.filter(m => m.tipo === "entrada").reduce((s, m) => s + custoSup(m), 0)
                             + farm.filter(m => m.tipo === "entrada").reduce((s, m) => s + custoFarm(m), 0);
  const gastoAtual = gasto(supMesAtual, farmMesAtual);
  const gastoAnt = gasto(supMesAnt, farmMesAnt);
  const economia = gastoAnt - gastoAtual;   // positivo = gastamos menos que no mês passado

  // ── 3. Perdas por vencimento: mês atual vs anterior ──
  const ehPerda = mv => mv.tipo === "saida" && (mv.motivo || "") === "Perda / vencimento";
  const perdas = (sup, farm) => sup.filter(ehPerda).reduce((s, m) => s + custoSup(m), 0)
                              + farm.filter(ehPerda).reduce((s, m) => s + custoFarm(m), 0);
  const perdasAtual = perdas(supMesAtual, farmMesAtual);
  const perdasAnt = perdas(supMesAnt, farmMesAnt);
  const reducaoPerdas = perdasAnt > 0 ? ((perdasAnt - perdasAtual) / perdasAnt) * 100 : null;

  // ── 4. Rupturas previstas (7 dias) — materiais e medicamentos ──
  function riscos(base, lotesBase, saidas, idKey, saldoFn) {
    const cons = {}; saidas.forEach(s => { const id = s[idKey]; if (id) cons[id] = (cons[id] || 0) + Number(s.quantidade || 0); });
    return base.map(x => { const media = (cons[x.id] || 0) / FARM_PREV_JANELA; const s = saldoFn(x.id); return { nome: x.nome, media, cobertura: media > 0 ? s / media : null }; })
      .filter(x => x.media > 0 && x.cobertura != null && x.cobertura < FARM_PREV_HORIZONTE)
      .sort((a, b) => a.cobertura - b.cobertura);
  }
  const riscoMat = riscos(ativosMat, lotes, supSaidas30, "item_id", id => supSaldoTotal(id, lotes));
  const riscoMed = riscos(ativosMed, medLotes, farmSaidas30, "medicamento_id", id => saldoDoMedicamento(id, medLotes));

  // ── 5. Medicamentos que mais custam por paciente (dispensações do mês) ──
  const dispMes = farmMesAtual.filter(m => m.tipo === "saida" && (m.paciente_prontuario || m.paciente_iniciais));
  const porMed = {};
  dispMes.forEach(m => {
    const e = porMed[m.medicamento_id] = porMed[m.medicamento_id] || { custo: 0, pacientes: new Set() };
    e.custo += custoFarm(m);
    e.pacientes.add(m.paciente_prontuario || m.paciente_iniciais);
  });
  const custoPorPaciente = Object.entries(porMed)
    .map(([id, v]) => ({ med: medById[Number(id)], custo: v.custo, n: v.pacientes.size, porPac: v.pacientes.size ? v.custo / v.pacientes.size : 0 }))
    .filter(x => x.custo > 0).sort((a, b) => b.porPac - a.porPac);

  // ── 6. Setores: consumo em R$ no mês, com variação vs anterior ──
  function consumoSetor(sup, farm) {
    const m = {};
    sup.filter(x => x.tipo === "saida").forEach(x => { const k = x.setor || "—"; m[k] = (m[k] || 0) + custoSup(x); });
    farm.filter(x => x.tipo === "saida" && x.setor).forEach(x => { const k = x.setor; m[k] = (m[k] || 0) + custoFarm(x); });
    return m;
  }
  const setorAtual = consumoSetor(supMesAtual, farmMesAtual);
  const setorAnt = consumoSetor(supMesAnt, farmMesAnt);
  const setoresRank = Object.keys({ ...setorAtual, ...setorAnt })
    .map(k => ({ k, atual: setorAtual[k] || 0, ant: setorAnt[k] || 0, delta: (setorAnt[k] || 0) > 0 ? (((setorAtual[k] || 0) - setorAnt[k]) / setorAnt[k]) * 100 : null }))
    .filter(x => x.atual > 0 || x.ant > 0).sort((a, b) => b.atual - a.atual);

  // ── 7. Capital liberável: excesso acima da cobertura-alvo + mínimo ──
  function excesso(base, lotesBase, saidas, idKey, saldoFn) {
    const cons = {}; saidas.forEach(s => { const id = s[idKey]; if (id) cons[id] = (cons[id] || 0) + Number(s.quantidade || 0); });
    return base.map(x => {
      const media = (cons[x.id] || 0) / FARM_PREV_JANELA;
      if (media <= 0 || !custoUnit(x)) return null;                     // só itens com giro e preço
      const necessario = media * alvoDias + Number(x.estoque_minimo || 0);
      const exc = saldoFn(x.id) - necessario;
      return exc > 0 ? { nome: x.nome, exc, valor: exc * custoUnit(x), cobertura: saldoFn(x.id) / media } : null;
    }).filter(Boolean).sort((a, b) => b.valor - a.valor);
  }
  const excMat = excesso(ativosMat, lotes, supSaidas30, "item_id", id => supSaldoTotal(id, lotes));
  const excMed = excesso(ativosMed, medLotes, farmSaidas30, "medicamento_id", id => saldoDoMedicamento(id, medLotes));
  const capLiberavel = [...excMat, ...excMed].reduce((s, x) => s + x.valor, 0);
  const excTop = [...excMat, ...excMed].sort((a, b) => b.valor - a.valor);

  const KPI = ({ label, valor, cor, sub, destaque }) => (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${cor || "var(--border)"}`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
      <div style={{ fontSize: destaque ? 26 : 22, fontWeight: 800, color: cor || "var(--text)", fontFamily: "JetBrains Mono, monospace", marginTop: 4 }}>{valor}</div>
      {sub && <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
  const Painel = ({ titulo, children }) => (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", marginBottom: 10 }}>{titulo}</div>
      {children}
    </div>
  );
  const deltaTag = d => d == null ? <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>novo</span>
    : <span style={{ fontSize: 11, fontWeight: 800, color: d > 10 ? "#f43f5e" : d < -10 ? "#34d399" : "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{d > 0 ? "+" : ""}{d.toFixed(0)}%</span>;

  if (carregando) return <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "2rem", textAlign: "center" }}>Calculando o painel executivo…</div>;

  // Selo de confiança: cor pela média das três coberturas de dados
  const confMedia = [pctCusto, pctInventariado, pctBarras].filter(x => x != null).reduce((s, x, _, a) => s + x / a.length, 0);
  const confCor = p => p == null ? "var(--text-muted)" : p >= 80 ? "#34d399" : p >= 50 ? "#d97706" : "#f43f5e";
  const Pastilha = ({ label, pct, dica }) => (
    <div title={dica} style={{ display: "flex", alignItems: "center", gap: 7, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 99, padding: "5px 12px" }}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: confCor(pct), flexShrink: 0 }} />
      <span style={{ fontSize: 11.5, color: "var(--text-2)" }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 800, fontFamily: "JetBrains Mono, monospace", color: confCor(pct) }}>{pct == null ? "—" : pct.toFixed(0) + "%"}</span>
    </div>
  );

  return (
    <div>
      {/* 🔴 O ALVO DE COBERTURA É POLÍTICA DO HOSPITAL, e a faixa diz quando
          ninguém a definiu. Sem isto, a diretoria lê "capital liberável"
          contra um alvo de 30 dias que nós escolhemos — e trinta dias não é
          verdade universal: capital repõe em três dias e trinta significa
          dinheiro parado; interior repõe em quinze e trinta pode ser pouco.
          O número aparece do mesmo jeito (a conta precisa dele), mas dizendo
          de quem ele é. */}
      {alvoEhPadrao && (
        <div role="status" style={{
          background: "#78350f22", border: "1px solid #f59e0b66", borderRadius: 10,
          padding: "10px 14px", marginBottom: 14, color: "#fcd34d", fontSize: 12.5, lineHeight: 1.5,
        }}>
          <strong>O alvo de cobertura ainda não foi definido.</strong> Os números abaixo usam {alvoDias} dias,
          que é sugestão nossa e não a política deste hospital — quem repõe em três dias tem capital parado
          com trinta; quem repõe em quinze pode ter pouco. Ajuste em <strong>Aprovações</strong>.
        </div>
      )}

      {/* SELO DE CONFIANÇA DOS DADOS */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14, padding: "10px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${confCor(confMedia)}`, borderRadius: 10 }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".05em" }}>Confiança dos dados</span>
        <Pastilha label="com custo" pct={pctCusto} dica="% de materiais e medicamentos ativos com custo unitário cadastrado. Os R$ do painel só contam esses itens." />
        <Pastilha label="inventariado 90d" pct={pctInventariado} dica="% de materiais contados no inventário nos últimos 90 dias (cobertura da acuracidade)." />
        <Pastilha label="com cód. barras" pct={pctBarras} dica="% de materiais com código de barras cadastrado." />
        <span style={{ fontSize: 10.5, color: "var(--text-muted)", marginLeft: "auto", maxWidth: 300 }}>
          {confMedia >= 80 ? "Dados sólidos — os números abaixo são confiáveis." : confMedia >= 50 ? "Dados parciais — complete custo/contagens para os R$ ficarem fiéis." : "Poucos dados — trate os valores em R$ como estimativa grosseira por enquanto."}
        </span>
      </div>

      {/* LINHA 1 — CAPITAL */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, marginBottom: 12 }}>
        <KPI destaque label="Capital parado no estoque" valor={fmtReais(capTotal)} cor={VX.turquesa}
          sub={`${fmtReais(capMat)} almoxarifado · ${fmtReais(capMed)} farmácia${semPreco ? ` · ${semPreco} item(ns) com saldo sem preço` : ""}`} />
        <KPI destaque label="Capital liberável p/ compras" valor={fmtReais(capLiberavel)} cor={capLiberavel > 0 ? "#34d399" : "var(--border)"}
          sub={`estoque acima de ${alvoDias} dias de cobertura + mínimo — dá para consumir antes de recomprar`} />
        <KPI destaque label={economia >= 0 ? "Economia vs mês anterior" : "Gasto a mais vs mês anterior"} valor={fmtReais(Math.abs(economia))} cor={economia >= 0 ? "#34d399" : "#f43f5e"}
          sub={`compras: ${fmtReais(gastoAtual)} neste mês · ${fmtReais(gastoAnt)} no anterior`} />
        <KPI destaque label="Perdas por vencimento" valor={fmtReais(perdasAtual)} cor={perdasAtual > 0 ? "#f43f5e" : "#34d399"}
          sub={reducaoPerdas == null ? `mês anterior: ${fmtReais(perdasAnt)}` : reducaoPerdas >= 0 ? `redução de ${reducaoPerdas.toFixed(0)}% vs mês anterior (${fmtReais(perdasAnt)})` : `aumento de ${Math.abs(reducaoPerdas).toFixed(0)}% vs mês anterior (${fmtReais(perdasAnt)})`} />
        <KPI destaque label="Acuracidade do estoque" valor={acuracidade == null ? "—" : acuracidade.toFixed(0) + "%"} cor={acuracidade == null ? "var(--text-muted)" : acuracidade >= 95 ? "#34d399" : acuracidade >= 85 ? "#d97706" : "#f43f5e"}
          sub={acuracidade == null ? "faça contagens no Inventário para medir" : `${invRecentes.length} item(ns) contado(s) em 90d — confiança dos números`} />
      </div>

      {/* LINHA 2 — PAINÉIS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: 14, marginBottom: 14 }}>
        <Painel titulo={`Ruptura prevista em ${FARM_PREV_HORIZONTE} dias (${riscoMat.length + riscoMed.length} itens)`}>
          {riscoMat.length + riscoMed.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nenhum item deve acabar no ritmo atual de consumo. 👍</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {[...riscoMat.map(x => ({ ...x, tipo: "MAT" })), ...riscoMed.map(x => ({ ...x, tipo: "MED" }))].sort((a, b) => a.cobertura - b.cobertura).slice(0, 8).map((x, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: x.tipo === "MED" ? "#6366f1" : "var(--text-muted)", border: `1px solid ${x.tipo === "MED" ? "#6366f155" : "var(--border-2)"}`, borderRadius: 99, padding: "0 6px" }}>{x.tipo}</span>
                  <span style={{ flex: 1, minWidth: 0, color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.nome}</span>
                  <span style={{ fontWeight: 800, fontFamily: "JetBrains Mono, monospace", color: x.cobertura <= 3 ? "#f43f5e" : "#d97706" }}>{x.cobertura < 1 ? "<1d" : Math.floor(x.cobertura) + "d"}</span>
                </div>
              ))}
            </div>
          )}
        </Painel>

        <Painel titulo="Medicamentos que mais custam por paciente (mês)">
          {custoPorPaciente.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Sem dispensações com paciente e custo neste mês.</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {custoPorPaciente.slice(0, 8).map((x, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", width: 16 }}>{i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0, color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.med?.nome || "—"}</span>
                  <span style={{ fontWeight: 800, fontFamily: "JetBrains Mono, monospace", color: "#0d9488" }}>{fmtReais(x.porPac)}</span>
                  <span style={{ fontSize: 10.5, color: "var(--text-muted)", minWidth: 54 }}>{x.n} pac. · {fmtReais(x.custo)}</span>
                </div>
              ))}
            </div>
          )}
        </Painel>

        <Painel titulo="Consumo por setor em R$ (vs mês anterior)">
          {setoresRank.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Sem consumo por setor com custo neste mês. Registre saídas informando o setor.</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {setoresRank.slice(0, 8).map((x, i) => (
                <div key={x.k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", width: 16 }}>{i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0, color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.k}</span>
                  <span style={{ fontWeight: 800, fontFamily: "JetBrains Mono, monospace" }}>{fmtReais(x.atual)}</span>
                  {deltaTag(x.delta)}
                </div>
              ))}
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>Δ vermelho = consumo cresceu &gt;10% — vale investigar desperdício ou mudança de demanda.</div>
            </div>
          )}
        </Painel>

        <Painel titulo={`Onde está o capital liberável (cobertura > ${alvoDias}d)`}>
          {excTop.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nenhum item com excesso de estoque relevante. Capital bem dimensionado. 👍</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {excTop.slice(0, 8).map((x, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", width: 16 }}>{i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0, color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.nome}</span>
                  <span style={{ fontWeight: 800, fontFamily: "JetBrains Mono, monospace", color: "#34d399" }}>{fmtReais(x.valor)}</span>
                  <span style={{ fontSize: 10.5, color: "var(--text-muted)", minWidth: 60 }}>cobre {Math.floor(x.cobertura)}d</span>
                </div>
              ))}
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>Sugestão: adiar a recompra destes itens e consumir o excedente — sem risco assistencial, pois a cobertura continua acima do alvo.</div>
            </div>
          )}
        </Painel>
      </div>

      {/* MAPA HOSPITALAR — um card por unidade/setor */}
      {(() => {
        const noMesAtual = iso => { const d = iso ? new Date(iso) : null; const h = new Date(); return d && d.getMonth() === h.getMonth() && d.getFullYear() === h.getFullYear(); };
        const reqsSetorMes = {}; reqs.filter(r => r.status === "entregue" && noMesAtual(r.entregue_em || r.updated_at)).forEach(r => { reqsSetorMes[r.setor] = (reqsSetorMes[r.setor] || 0) + 1; });
        const topItemSetor = {};
        supMesAtual.filter(m => m.tipo === "saida" && m.setor).forEach(m => { const s = topItemSetor[m.setor] = topItemSetor[m.setor] || {}; const n = itemById[m.item_id]?.nome; if (n) s[n] = (s[n] || 0) + Number(m.quantidade || 0); });
        farmMesAtual.filter(m => m.tipo === "saida" && m.setor).forEach(m => { const s = topItemSetor[m.setor] = topItemSetor[m.setor] || {}; const n = medById[m.medicamento_id]?.nome; if (n) s[n] = (s[n] || 0) + Number(m.quantidade || 0); });
        const topDe = k => { const m = topItemSetor[k]; if (!m) return null; const e = Object.entries(m).sort((a, b) => b[1] - a[1])[0]; return e ? `${e[0]} (${farmFmtQtd(e[1])})` : null; };
        if (!setoresRank.length) return null;
        return (<>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", margin: "4px 0 10px" }}>Mapa hospitalar — consumo por unidade (mês)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12, marginBottom: 14 }}>
            {setoresRank.slice(0, 12).map(x => (
              <div key={x.k} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderTop: `3px solid ${x.delta != null && x.delta > 10 ? "#f43f5e" : x.delta != null && x.delta < -10 ? "#34d399" : VX.azul}`, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 13, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.k}</span>
                  {deltaTag(x.delta)}
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "JetBrains Mono, monospace", color: VX.turquesa, margin: "4px 0 2px" }}>{fmtReais(x.atual)}</div>
                <div style={{ fontSize: 10.5, color: "var(--text-muted)", lineHeight: 1.5 }}>
                  mês anterior {fmtReais(x.ant)}<br />
                  {reqsSetorMes[x.k] ? `${reqsSetorMes[x.k]} requisição(ões) atendida(s)` : "sem requisições no mês"}<br />
                  {topDe(x.k) ? `mais consumido: ${topDe(x.k)}` : ""}
                </div>
              </div>
            ))}
          </div>
        </>);
      })()}

      {/* FÁRMACOS MONITORADOS + SIMULADOR */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 14, marginBottom: 14 }}>
        <Painel titulo="Fármacos monitorados — alto custo / alta vigilância (mês)">
          {(() => {
            const monitorados = ativosMed.filter(m => SUP_FARMACOS_MONITORADOS.some(k => normTxt(m.nome).includes(k) || normTxt(m.principio_ativo).includes(k)));
            const custoSaidasFarmMes = farmMesAtual.filter(m => m.tipo === "saida").reduce((s, m) => s + custoFarm(m), 0);
            const linhas = monitorados.map(med => {
              const saidas = farmMesAtual.filter(m => m.tipo === "saida" && m.medicamento_id === med.id);
              const qtd = saidas.reduce((s, m) => s + Number(m.quantidade || 0), 0);
              const custo = saidas.reduce((s, m) => s + custoFarm(m), 0);
              const pacientes = new Set(saidas.map(m => m.paciente_prontuario || m.paciente_iniciais).filter(Boolean)).size;
              return { med, qtd, custo, pacientes, pct: custoSaidasFarmMes > 0 ? (custo / custoSaidasFarmMes) * 100 : 0, saldo: saldoDoMedicamento(med.id, medLotes) };
            }).sort((a, b) => b.custo - a.custo || b.qtd - a.qtd);
            if (!linhas.length) return <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nenhum fármaco monitorado encontrado no catálogo (procuro por: {SUP_FARMACOS_MONITORADOS.join(", ")}).</div>;
            return (<>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {linhas.map((x, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "7px 10px" }}>
                    <span style={{ flex: 1, minWidth: 0, color: "var(--text-2)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.med.nome}{x.med.controlado ? <span style={{ fontSize: 9, color: "#6366f1", border: "1px solid #6366f155", borderRadius: 99, padding: "0 5px", marginLeft: 6, fontWeight: 800 }}>P.344</span> : null}</span>
                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, minWidth: 46, textAlign: "right" }}>{farmFmtQtd(x.qtd)}</span>
                    <span style={{ fontSize: 10.5, color: "var(--text-muted)", minWidth: 96, textAlign: "right" }}>{x.custo > 0 ? `${fmtReais(x.custo)} · ${x.pct.toFixed(1)}%` : "sem custo"}</span>
                    <span style={{ fontSize: 10.5, color: "var(--text-muted)", minWidth: 78, textAlign: "right" }}>{x.pacientes} pac. · saldo {farmFmtQtd(x.saldo)}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>Saídas do mês na Farmácia. % = participação no custo total dispensado no mês. Controlados também aparecem no Livro (Portaria 344).</div>
            </>);
          })()}
        </Painel>

        <Painel titulo="Simulador financeiro — e se aumentarmos o estoque?">
          {(() => {
            const classesMed = [...new Set(ativosMed.map(m => m.classe || "Outros"))].sort((a, b) => a.localeCompare(b, "pt-BR"));
            const catsMat = [...new Set(ativosMat.map(i => i.categoria || "Outros"))].sort((a, b) => a.localeCompare(b, "pt-BR"));
            const grupoSel = simGrupo || (classesMed.includes("Antibióticos") ? "med:Antibióticos" : (classesMed[0] ? "med:" + classesMed[0] : (catsMat[0] ? "mat:" + catsMat[0] : "")));
            const [tipoG, nomeG] = grupoSel ? grupoSel.split(":") : ["", ""];
            const base = tipoG === "med" ? ativosMed.filter(m => (m.classe || "Outros") === nomeG) : ativosMat.filter(i => (i.categoria || "Outros") === nomeG);
            const capitalGrupo = base.reduce((s, x) => s + (tipoG === "med" ? saldoDoMedicamento(x.id, medLotes) : supSaldoTotal(x.id, lotes)) * custoUnit(x), 0);
            const consumoMesGrupo = tipoG === "med"
              ? farmMesAtual.filter(m => m.tipo === "saida" && base.some(b => b.id === m.medicamento_id)).reduce((s, m) => s + custoFarm(m), 0)
              : supMesAtual.filter(m => m.tipo === "saida" && base.some(b => b.id === m.item_id)).reduce((s, m) => s + custoSup(m), 0);
            const pct = Number(simPct) || 0;
            const capitalExtra = capitalGrupo * (pct / 100);
            const cobAtual = consumoMesGrupo > 0 ? capitalGrupo / (consumoMesGrupo / 30) : null;
            const cobNova = consumoMesGrupo > 0 ? (capitalGrupo + capitalExtra) / (consumoMesGrupo / 30) : null;
            return (<>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 8, marginBottom: 10 }}>
                <div>
                  <label style={rotuloCampo}>Grupo</label>
                  <select value={grupoSel} onChange={e => setSimGrupo(e.target.value)} style={campoTexto}>
                    <optgroup label="Medicamentos (classe)">{classesMed.map(c => <option key={"med:" + c} value={"med:" + c}>{c}</option>)}</optgroup>
                    <optgroup label="Materiais (categoria)">{catsMat.map(c => <option key={"mat:" + c} value={"mat:" + c}>{c}</option>)}</optgroup>
                  </select>
                </div>
                <div>
                  <label style={rotuloCampo}>Aumento %</label>
                  <input type="number" value={simPct} onChange={e => setSimPct(e.target.value)} style={campoTexto} />
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.6 }}>
                <div>Estoque atual do grupo: <strong style={{ fontFamily: "JetBrains Mono, monospace" }}>{fmtReais(capitalGrupo)}</strong> ({base.length} itens)</div>
                <div>Aumentar <strong>{pct}%</strong> imobiliza <strong style={{ color: "#d97706", fontFamily: "JetBrains Mono, monospace" }}>+{fmtReais(capitalExtra)}</strong> → novo capital <strong style={{ fontFamily: "JetBrains Mono, monospace" }}>{fmtReais(capitalGrupo + capitalExtra)}</strong></div>
                {cobAtual != null
                  ? <div>Cobertura estimada: <strong>{Math.round(cobAtual)}d</strong> → <strong style={{ color: cobNova > 90 ? "#d97706" : "#34d399" }}>{Math.round(cobNova)}d</strong> (consumo do grupo: {fmtReais(consumoMesGrupo)}/mês){cobNova > 90 ? " — acima de 90d cresce o risco de vencimento" : ""}</div>
                  : <div style={{ color: "var(--text-muted)" }}>Sem consumo com custo neste mês para estimar a cobertura do grupo.</div>}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8 }}>Simulação simples: capital ∝ estoque; cobertura = capital ÷ (consumo mensal do grupo ÷ 30). Não considera sazonalidade nem validade dos lotes.</div>
            </>);
          })()}
        </Painel>
      </div>

      <div style={{ fontSize: 10.5, color: "var(--text-muted)", lineHeight: 1.6, border: "1px dashed var(--border)", borderRadius: 8, padding: "10px 14px" }}>
        <strong>Critérios do painel</strong> · Valores pelo <strong>custo unitário cadastrado</strong> em cada material/medicamento (itens sem preço ficam de fora dos R$).
        · <strong>Economia</strong> compara as compras (entradas) deste mês com o mês anterior.
        · <strong>Capital liberável</strong> = valor do estoque acima de {alvoDias} dias de cobertura + estoque mínimo, considerando o consumo médio dos últimos {FARM_PREV_JANELA} dias — itens sem giro não entram.
        · <strong>Rupturas</strong> usam a mesma previsão de demanda do Estoque.
        · Painel local e gratuito: nada é enviado para fora.
      </div>
    </div>
  );
}

// Relatórios & BI do almoxarifado — consumo, gasto, curva ABC e relatório mensal
function SupIndicadoresView({ sb, itens, lotes, forns, pedidos, reqs }) {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth());
  const [ano, setAno] = useState(hoje.getFullYear());
  const [movsMes, setMovsMes] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (!sb) return;
    const ini = new Date(ano, mes, 1), fim = new Date(ano, mes + 1, 1);
    setCarregando(true);
    loadSupMovimentosPeriodo(sb, ini.toISOString(), fim.toISOString()).then(rows => { setMovsMes(rows); setCarregando(false); });
  }, [mes, ano]);

  const itemById = {}; itens.forEach(i => itemById[i.id] = i);
  const fornById = {}; forns.forEach(f => fornById[f.id] = f);
  const custoDe = mv => Number(mv.quantidade || 0) * custoUnit(itemById[mv.item_id]);

  const entradas = movsMes.filter(m => m.tipo === "entrada");
  const saidas = movsMes.filter(m => m.tipo === "saida");
  const perdas = saidas.filter(m => (m.motivo || "") === "Perda / vencimento");
  const qtdEntradas = entradas.reduce((s, m) => s + Number(m.quantidade || 0), 0);
  const qtdSaidas = saidas.reduce((s, m) => s + Number(m.quantidade || 0), 0);
  const gastoEntradas = entradas.reduce((s, m) => s + custoDe(m), 0);
  const custoConsumo = saidas.reduce((s, m) => s + custoDe(m), 0);
  const semPreco = new Set(movsMes.filter(m => !custoUnit(itemById[m.item_id])).map(m => m.item_id)).size;
  const ativos = itens.filter(i => i.ativo !== false);
  const rupturas = ativos.filter(i => supSaldoTotal(i.id, lotes) <= 0);
  const noMes = iso => iso && new Date(iso).getMonth() === mes && new Date(iso).getFullYear() === ano;
  const reqsMes = reqs.filter(r => r.status === "entregue" && noMes(r.entregue_em || r.updated_at));
  const pedMes = pedidos.filter(p => ["recebido", "parcial"].includes(p.status) && noMes(p.recebido_em));

  // Consumo por material (top + curva ABC por custo)
  const consMap = {};
  saidas.forEach(m => { if (m.item_id) { const e = consMap[m.item_id] = consMap[m.item_id] || { qtd: 0, custo: 0 }; e.qtd += Number(m.quantidade || 0); e.custo += custoDe(m); } });
  const consumo = Object.entries(consMap).map(([id, v]) => ({ id: Number(id), item: itemById[Number(id)], ...v })).sort((a, b) => b.qtd - a.qtd);
  const porCusto = [...consumo].filter(x => x.custo > 0).sort((a, b) => b.custo - a.custo);
  const custoTotalABC = porCusto.reduce((s, x) => s + x.custo, 0);
  let acum = 0;
  const abc = porCusto.map(x => { acum += x.custo; const pct = custoTotalABC ? acum / custoTotalABC : 0; return { ...x, classe: pct <= 0.8 ? "A" : pct <= 0.95 ? "B" : "C" }; });
  const abcCor = c => c === "A" ? "#e11d48" : c === "B" ? "#d97706" : "#0d9488";

  // Consumo por setor e por categoria; gasto por fornecedor
  const porSetor = {}; saidas.forEach(m => { const k = m.setor || "—"; porSetor[k] = (porSetor[k] || 0) + Number(m.quantidade || 0); });
  const setorTop = Object.entries(porSetor).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
  const porCat = {}; saidas.forEach(m => { const k = itemById[m.item_id]?.categoria || "Outros"; porCat[k] = (porCat[k] || 0) + Number(m.quantidade || 0); });
  const catTop = Object.entries(porCat).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
  const porForn = {}; entradas.forEach(m => { const k = m.fornecedor_id ? (fornById[m.fornecedor_id]?.nome || `#${m.fornecedor_id}`) : "Sem fornecedor"; porForn[k] = (porForn[k] || 0) + custoDe(m); });
  const fornTop = Object.entries(porForn).map(([k, v]) => ({ k, v })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  const lotesAlerta = lotes.filter(l => Number(l.quantidade) > 0 && ["vencido", "vencendo"].includes(infoDeValidade(l.validade).status));

  const fmt = n => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const lbl = { fontSize: 11, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 4 };
  const selInp = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none" };
  const KPI = ({ label, valor, cor, sub }) => (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${cor || "var(--border)"}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: cor || "var(--text)", fontFamily: "JetBrains Mono, monospace", marginTop: 3 }}>{valor}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
  const Barras = ({ titulo, dados, fmtV, cor }) => (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", marginBottom: 10 }}>{titulo}</div>
      {dados.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Sem dados no mês.</div> : dados.slice(0, 8).map((d, i) => { const max = dados[0].v || 1; return (
        <div key={d.k} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", width: 16 }}>{i + 1}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.k}</div>
            <div style={{ height: 8, background: "var(--surface-3)", borderRadius: 99, overflow: "hidden", marginTop: 2 }}><div style={{ width: Math.max(3, (d.v / max) * 100) + "%", height: "100%", background: cor, borderRadius: 99 }} /></div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", minWidth: 60, textAlign: "right" }}>{fmtV(d.v)}</span>
        </div>
      ); })}
    </div>
  );
  const printStyles = `@media print { body * { visibility: hidden !important; } #sup-print, #sup-print * { visibility: visible !important; } #sup-print { position: fixed; inset: 0; background: #fff !important; color: #111 !important; padding: 18px; overflow: visible !important; } @page { size: A4 portrait; margin: 12mm; } }`;

  return (
    <div>
      <style>{printStyles}</style>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: "1.25rem" }}>
        <div><div style={lbl}>Mês</div><select value={mes} onChange={e => setMes(+e.target.value)} style={selInp}>{MONTHS_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}</select></div>
        <div><div style={lbl}>Ano</div><input type="number" value={ano} onChange={e => setAno(+e.target.value)} style={{ ...selInp, width: 90 }} /></div>
        <button onClick={() => setPreview(p => !p)} style={{ background: "transparent", color: "#22d3ee", border: "1px solid #164e63", borderRadius: 7, padding: "8px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{preview ? "✕ Fechar relatório" : "Relatório do mês"}</button>
        {preview && <button onClick={() => window.print()} style={{ background: "#34d399", color: "#000", border: "none", borderRadius: 7, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Imprimir / PDF</button>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: "1.5rem" }}>
        <KPI label="Consumo (saídas)" valor={fmt(qtdSaidas)} sub={`${saidas.length} baixas no mês`} cor="#3b82f6" />
        <KPI label="Custo do consumo" valor={fmtReais(custoConsumo)} sub={semPreco ? `${semPreco} item(ns) sem preço` : "no mês"} cor="#0d9488" />
        <KPI label="Entradas" valor={fmt(qtdEntradas)} sub={`${entradas.length} recebimentos`} cor="#34d399" />
        <KPI label="Gasto em compras" valor={fmtReais(gastoEntradas)} sub={`${pedMes.length} pedido(s) recebidos`} cor={VX.turquesa} />
        <KPI label="Perdas / vencimento" valor={fmt(perdas.reduce((s, m) => s + Number(m.quantidade || 0), 0))} sub="baixas por perda" cor={perdas.length ? "#f43f5e" : "var(--border)"} />
        <KPI label="Requisições entregues" valor={fmt(reqsMes.length)} sub="setores atendidos no mês" cor={VX.azul} />
        <KPI label="Rupturas agora" valor={fmt(rupturas.length)} sub="itens sem estoque" cor={rupturas.length ? "#f43f5e" : "#34d399"} />
        <KPI label="Validade em risco" valor={fmt(lotesAlerta.length)} sub={`lotes vencidos / ≤${DIAS_VENCENDO}d`} cor={lotesAlerta.length ? "#d97706" : "#34d399"} />
      </div>

      {carregando && <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>Carregando movimentos…</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: "1.5rem" }}>
        <Barras titulo="Top materiais consumidos" dados={consumo.map(c => ({ k: c.item?.nome || `#${c.id}`, v: c.qtd }))} fmtV={fmt} cor={VX.azul} />
        <Barras titulo="Consumo por setor" dados={setorTop} fmtV={fmt} cor={VX.turquesa} />
        <Barras titulo="Consumo por categoria" dados={catTop} fmtV={fmt} cor="#6366f1" />
        <Barras titulo="Gasto por fornecedor (entradas)" dados={fornTop} fmtV={fmtReais} cor="#0d9488" />
      </div>

      {/* CURVA ABC POR CUSTO DE CONSUMO */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Curva ABC — custo do consumo no mês</div>
      {abc.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", border: "1px dashed var(--border)", borderRadius: 10, padding: "1.25rem", textAlign: "center", marginBottom: "1.5rem" }}>Sem consumo com custo cadastrado no mês. Cadastre o custo unitário dos materiais (Estoque → Editar).</div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10, marginBottom: "1.5rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
            <thead><tr style={{ background: "var(--surface-2)", textAlign: "left", color: "var(--text-3)", fontSize: 11, textTransform: "uppercase" }}>
              <th style={{ padding: "8px 12px" }}>Classe</th><th style={{ padding: "8px 12px" }}>Material</th><th style={{ padding: "8px 12px", textAlign: "right" }}>Qtd</th><th style={{ padding: "8px 12px", textAlign: "right" }}>Custo</th><th style={{ padding: "8px 12px", textAlign: "right" }}>% do total</th>
            </tr></thead>
            <tbody>
              {abc.slice(0, 20).map(x => (
                <tr key={x.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "7px 12px" }}><span style={{ fontSize: 11, fontWeight: 800, color: abcCor(x.classe), border: `1px solid ${abcCor(x.classe)}55`, borderRadius: 99, padding: "1px 8px" }}>{x.classe}</span></td>
                  <td style={{ padding: "7px 12px", fontWeight: 600 }}>{x.item?.nome || `#${x.id}`}</td>
                  <td style={{ padding: "7px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{fmt(x.qtd)}</td>
                  <td style={{ padding: "7px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>{fmtReais(x.custo)}</td>
                  <td style={{ padding: "7px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: "var(--text-muted)" }}>{custoTotalABC ? (x.custo / custoTotalABC * 100).toFixed(1) : "0"}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", padding: "6px 12px" }}>A = 80% do custo · B = 15% · C = 5%. Considera o custo unitário cadastrado em cada material.</div>
        </div>
      )}

      {/* RELATÓRIO IMPRIMÍVEL */}
      {preview && (
        <div id="sup-print" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "18px 22px", maxWidth: 820 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid #111", paddingBottom: 8, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800 }}>Relatório mensal — Estoque & Compras</div>
              <div style={{ fontSize: 12 }}>{HOSPITAL_NOME} · {MONTHS_FULL[mes]} de {ano}</div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700 }}>VALENTRAX</div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginBottom: 14 }}>
            <tbody>
              {[["Consumo (saídas)", `${fmt(qtdSaidas)} un · ${fmtReais(custoConsumo)}`],
                ["Entradas", `${fmt(qtdEntradas)} un · ${fmtReais(gastoEntradas)}`],
                ["Perdas / vencimento", fmt(perdas.reduce((s, m) => s + Number(m.quantidade || 0), 0)) + " un"],
                ["Requisições entregues", fmt(reqsMes.length)],
                ["Pedidos de compra recebidos", fmt(pedMes.length)],
                ["Rupturas na data do relatório", fmt(rupturas.length)],
                ["Lotes vencidos / vencendo ≤30d", fmt(lotesAlerta.length)],
              ].map(([k, v]) => (
                <tr key={k} style={{ borderBottom: "1px solid #ccc" }}>
                  <td style={{ padding: "5px 4px", fontWeight: 600 }}>{k}</td>
                  <td style={{ padding: "5px 4px", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {setorTop.length > 0 && (<>
            <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Consumo por setor</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 14 }}><tbody>
              {setorTop.slice(0, 10).map(d => <tr key={d.k} style={{ borderBottom: "1px solid #ddd" }}><td style={{ padding: "4px" }}>{d.k}</td><td style={{ padding: "4px", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{fmt(d.v)}</td></tr>)}
            </tbody></table>
          </>)}
          {abc.length > 0 && (<>
            <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Maiores custos de consumo (curva ABC)</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 14 }}><tbody>
              {abc.slice(0, 10).map(x => <tr key={x.id} style={{ borderBottom: "1px solid #ddd" }}><td style={{ padding: "4px", width: 24, fontWeight: 800 }}>{x.classe}</td><td style={{ padding: "4px" }}>{x.item?.nome || x.id}</td><td style={{ padding: "4px", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{fmtReais(x.custo)}</td></tr>)}
            </tbody></table>
          </>)}
          <div style={{ fontSize: 10, marginTop: 10 }}>Gerado pelo Valentrax · {new Date().toLocaleString("pt-BR")} · valores por custo unitário cadastrado</div>
        </div>
      )}
    </div>
  );
}

// Assistente local do almoxarifado — responde a partir dos dados; nada sai do navegador
function SupAssistenteView({ sb }) {
  const [itens, setItens] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [forns, setForns] = useState([]);
  const [reqs, setReqs] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [saidas30, setSaidas30] = useState([]);
  const [movsMes, setMovsMes] = useState([]);
  const [msgs, setMsgs] = useState([{ role: "a", text: "Olá! Sou o assistente local do almoxarifado. " + SUP_ASSIST_HELP }]);
  const [q, setQ] = useState("");
  const fimRef = useRef(null);

  function refresh() {
    if (!sb) return;
    loadSupItens(sb).then(setItens);
    loadSupLotes(sb).then(setLotes);
    loadSupFornecedores(sb).then(setForns);
    loadSupRequisicoes(sb).then(setReqs);
    loadSupPedidos(sb).then(setPedidos);
    loadSupSaidasDesde(sb, new Date(Date.now() - FARM_PREV_JANELA * 86400000).toISOString()).then(setSaidas30);
    const ini = new Date(); ini.setDate(1); ini.setHours(0, 0, 0, 0);
    const fim = new Date(ini.getFullYear(), ini.getMonth() + 1, 1);
    loadSupMovimentosPeriodo(sb, ini.toISOString(), fim.toISOString()).then(setMovsMes);
  }
  useEffect(() => { refresh(); const onF = () => refresh(); window.addEventListener("focus", onF); return () => window.removeEventListener("focus", onF); }, []);
  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const itemById = {}; itens.forEach(i => itemById[i.id] = i);
  const fornById = {}; forns.forEach(f => fornById[f.id] = f);
  const ativos = itens.filter(i => i.ativo !== false);
  const saldo = i => supSaldoTotal(i.id, lotes);
  const rupturas = ativos.filter(i => saldo(i) <= 0);
  const abaixoMin = ativos.filter(i => { const s = saldo(i); return s > 0 && Number(i.estoque_minimo || 0) > 0 && s <= Number(i.estoque_minimo); });
  const lotesEst = lotes.filter(l => Number(l.quantidade) > 0);
  const vencidos = lotesEst.filter(l => infoDeValidade(l.validade).status === "vencido");
  const vencendo = lotesEst.filter(l => infoDeValidade(l.validade).status === "vencendo");
  const vencendoDet = vencendo.map(l => ({ ...l, nome: itemById[l.item_id]?.nome || l.item_id })).sort((a, b) => (a.validade || "").localeCompare(b.validade || ""));
  const cons30 = {}; saidas30.forEach(s => { if (s.item_id) cons30[s.item_id] = (cons30[s.item_id] || 0) + Number(s.quantidade || 0); });
  const emRisco = ativos.map(i => { const media = (cons30[i.id] || 0) / FARM_PREV_JANELA; const s = saldo(i); return { i, media, cobertura: media > 0 ? s / media : null, sugestao: Math.max(0, Math.ceil(media * FARM_PREV_HORIZONTE + Number(i.estoque_minimo || 0) - s)) }; }).filter(x => x.media > 0 && x.cobertura != null && x.cobertura < FARM_PREV_HORIZONTE).sort((a, b) => a.cobertura - b.cobertura);
  const saidasMes = movsMes.filter(m => m.tipo === "saida");
  const entradasMes = movsMes.filter(m => m.tipo === "entrada");
  const custoDe = mv => Number(mv.quantidade || 0) * custoUnit(itemById[mv.item_id]);
  const custoConsumoMes = saidasMes.reduce((s, m) => s + custoDe(m), 0);
  const gastoComprasMes = entradasMes.reduce((s, m) => s + custoDe(m), 0);
  const consMesMap = {}; saidasMes.forEach(m => { if (m.item_id) consMesMap[m.item_id] = (consMesMap[m.item_id] || 0) + Number(m.quantidade || 0); });
  const topMes = Object.entries(consMesMap).map(([id, qtd]) => ({ id: Number(id), qtd, item: itemById[Number(id)] })).sort((a, b) => b.qtd - a.qtd);
  const porSetorMes = {}; saidasMes.forEach(m => { const k = m.setor || "—"; porSetorMes[k] = (porSetorMes[k] || 0) + Number(m.quantidade || 0); });
  const setorTopMes = Object.entries(porSetorMes).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
  const porCatMes = {}; saidasMes.forEach(m => { const k = itemById[m.item_id]?.categoria || "Outros"; porCatMes[k] = (porCatMes[k] || 0) + Number(m.quantidade || 0); });
  const catTopMes = Object.entries(porCatMes).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
  const porFornMes = {}; entradasMes.forEach(m => { const k = m.fornecedor_id ? (fornById[m.fornecedor_id]?.nome || `#${m.fornecedor_id}`) : "Sem fornecedor"; porFornMes[k] = (porFornMes[k] || 0) + custoDe(m); });
  const fornTopMes = Object.entries(porFornMes).map(([k, v]) => ({ k, v })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  const reqsAtivas = reqs.filter(r => !["entregue", "cancelado"].includes(r.status));
  const pedAtivos = pedidos.filter(p => ["aberto", "enviado", "parcial"].includes(p.status));
  const numCats = new Set(ativos.map(i => i.categoria || "Outros")).size;

  function responder(pergunta) {
    const s = normTxt(pergunta);
    const has = (...ks) => ks.some(k => s.includes(k));
    if (!s) return SUP_ASSIST_HELP;
    if (has("ajuda", "o que voce", "o que posso", "pode responder", "comando") || s === "?") return SUP_ASSIST_HELP;
    if (has("bom dia", "boa tarde", "boa noite", "tudo bem", "obrigad", "valeu", "de nada") || s === "oi" || s === "ola") return "Olá! " + SUP_ASSIST_HELP;
    if (has("panorama", "resumo", "visao geral", "situacao", "como esta", "como anda", "status")) {
      return `Panorama do almoxarifado agora:\n• Requisições: ${reqsAtivas.filter(r => r.status === "aguardando").length} aguardando · ${reqsAtivas.filter(r => r.status === "separacao").length} em separação · ${reqsAtivas.filter(r => r.status === "pronto").length} pronta(s)\n• Compras: ${pedAtivos.length} pedido(s) em aberto\n• Estoque: ${rupturas.length} zerado(s) · ${abaixoMin.length} abaixo do mínimo · ${emRisco.length} em risco de ruptura (${FARM_PREV_HORIZONTE}d)\n• Validade: ${vencidos.length} lote(s) vencido(s) · ${vencendo.length} vencendo em ≤${DIAS_VENCENDO}d\n• Mês: consumo ${fmtReais(custoConsumoMes)} · compras ${fmtReais(gastoComprasMes)}`;
    }
    if (has("faltar", "vai acabar", "ruptura prevista", "previsao", "acabando", "risco")) {
      if (!emRisco.length) return `Nenhum material deve acabar nos próximos ${FARM_PREV_HORIZONTE} dias (pelo consumo dos últimos ${FARM_PREV_JANELA}).`;
      return `Devem acabar em até ${FARM_PREV_HORIZONTE} dias:\n` + emRisco.slice(0, 10).map(x => `• ${x.i.nome} — cobre ${x.cobertura < 1 ? "<1" : Math.floor(x.cobertura)} dia(s) · comprar ${farmFmtQtd(x.sugestao)}`).join("\n") + `\n(Use "⇩ importar sugestão" no pedido de compra.)`;
    }
    if (has("zerado", "sem estoque", "ruptura")) {
      return rupturas.length ? `${rupturas.length} material(is) sem estoque:\n` + rupturas.slice(0, 12).map(i => `• ${i.nome}`).join("\n") : "Nenhum material zerado. 👍";
    }
    if (has("minimo", "repor", "reposicao")) {
      return abaixoMin.length ? `${abaixoMin.length} abaixo do mínimo:\n` + abaixoMin.slice(0, 10).map(i => `• ${i.nome} — saldo ${farmFmtQtd(saldo(i))} (mín. ${farmFmtQtd(i.estoque_minimo)})`).join("\n") : "Nenhum item abaixo do estoque mínimo.";
    }
    if (has("validade", "vencer", "vencendo", "vencido", "vence")) {
      const base = `Validade: ${vencidos.length} lote(s) vencido(s) em estoque · ${vencendo.length} vencendo em ≤${DIAS_VENCENDO} dias.`;
      if (vencendoDet.length) return base + "\nVencendo em breve:\n" + vencendoDet.slice(0, 10).map(l => `• ${l.nome} — lote ${l.lote || "?"} vence ${fmtDataBR(l.validade)} (${farmFmtQtd(l.quantidade)})`).join("\n");
      return base;
    }
    if (has("setor")) {
      return setorTopMes.length ? "Consumo por setor no mês:\n" + setorTopMes.slice(0, 10).map(d => `• ${d.k}: ${farmFmtQtd(d.v)}`).join("\n") : "Sem consumo registrado neste mês.";
    }
    if (has("categoria", "grupo")) {
      return catTopMes.length ? "Consumo por categoria no mês:\n" + catTopMes.slice(0, 10).map(d => `• ${d.k}: ${farmFmtQtd(d.v)}`).join("\n") : "Sem consumo registrado neste mês.";
    }
    if (has("fornecedor")) {
      if (has("gasto", "custo", "quanto")) return fornTopMes.length ? "Gasto por fornecedor no mês (entradas):\n" + fornTopMes.slice(0, 8).map(d => `• ${d.k}: ${fmtReais(d.v)}`).join("\n") : "Sem entradas com custo neste mês.";
      const fa = forns.filter(f => f.ativo !== false);
      return `${fa.length} fornecedor(es) ativo(s):\n` + fa.slice(0, 12).map(f => `• ${f.nome}${f.categorias ? ` — ${f.categorias}` : ""}`).join("\n");
    }
    if (has("gasto", "custo", "quanto gastamos", "quanto gastou")) {
      return `Neste mês: consumo ${fmtReais(custoConsumoMes)} · compras recebidas ${fmtReais(gastoComprasMes)} (por custo unitário cadastrado).`;
    }
    if (has("top", "mais usado", "mais consumido", "mais saiu")) {
      return topMes.length ? "Mais consumidos no mês:\n" + topMes.slice(0, 10).map((t, i) => `${i + 1}. ${t.item?.nome || t.id} — ${farmFmtQtd(t.qtd)}`).join("\n") : "Sem consumo registrado neste mês.";
    }
    if (has("requisicao", "requisicoes", "pendencia", "pendente", "aguardando")) {
      return reqsAtivas.length ? `${reqsAtivas.length} requisição(ões) em andamento:\n` + reqsAtivas.slice(0, 10).map(r => `• REQ-${r.id} · ${r.setor} — ${SUP_REQ_STATUS[r.status]?.label || r.status}`).join("\n") : "Nenhuma requisição em andamento.";
    }
    if (has("pedido", "compra")) {
      return pedAtivos.length ? `${pedAtivos.length} pedido(s) de compra em aberto:\n` + pedAtivos.slice(0, 10).map(p => `• PED-${p.id} · ${p.fornecedor_nome || "sem fornecedor"} — ${SUP_PED_STATUS[p.status]?.label || p.status}${supPedidoTotal(p) > 0 ? ` · ${fmtReais(supPedidoTotal(p))}` : ""}`).join("\n") : "Nenhum pedido de compra em aberto.";
    }
    if (has("catalogo", "quantos materiais", "quantos itens", "tamanho")) {
      return `Catálogo: ${ativos.length} material(is) ativo(s) em ${numCats} categoria(s) (${itens.length} cadastrados no total).`;
    }
    if (has("saldo", "estoque de", "quanto tem")) {
      const achados = ativos.filter(i => normTxt(i.nome).includes(s.replace(/saldo( de)?|estoque( de)?|quanto tem( de)?/g, "").trim())).slice(0, 6);
      if (achados.length) return achados.map(i => `• ${i.nome}: ${farmFmtQtd(saldo(i))} ${i.unidade || ""}`).join("\n");
      const termo = s.split(" ").slice(-1)[0];
      const porTermo = ativos.filter(i => normTxt(i.nome).includes(termo)).slice(0, 6);
      if (porTermo.length) return porTermo.map(i => `• ${i.nome}: ${farmFmtQtd(saldo(i))} ${i.unidade || ""}`).join("\n");
      return "Não achei esse material no catálogo. Tente parte do nome (ex.: \"saldo de luva\").";
    }
    // busca direta por nome de material
    const achado = ativos.filter(i => { const n = normTxt(i.nome); return s.length >= 4 && (n.includes(s) || s.includes(n)); }).slice(0, 6);
    if (achado.length) return achado.map(i => `• ${i.nome}: saldo ${farmFmtQtd(saldo(i))} ${i.unidade || ""}${Number(i.estoque_minimo) > 0 ? ` (mín. ${farmFmtQtd(i.estoque_minimo)})` : ""}`).join("\n");
    return "Não entendi a pergunta. " + SUP_ASSIST_HELP;
  }
  function enviar(texto) { const t = (texto != null ? texto : q).trim(); if (!t) return; setMsgs(m => [...m, { role: "u", text: t }, { role: "a", text: responder(t) }]); setQ(""); }
  const sugestoes = ["Panorama", "O que vai faltar?", "Consumo por setor", "Gasto do mês", "Quais vencendo?", "Zerados", "Pedidos abertos"];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 200px)", minHeight: 360, maxWidth: 760 }}>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, padding: "4px 2px 12px" }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === "u" ? "flex-end" : "flex-start", maxWidth: "85%", background: m.role === "u" ? VX.royal : "var(--surface)", color: m.role === "u" ? "#fff" : "var(--text)", border: m.role === "u" ? "none" : "1px solid var(--border)", borderRadius: 12, padding: "9px 13px", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.text}</div>
        ))}
        <div ref={fimRef} />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {sugestoes.map(sg => <button key={sg} onClick={() => enviar(sg)} style={{ background: "transparent", color: VX.turquesa, border: `1px solid ${VX.turquesa}55`, borderRadius: 99, padding: "4px 11px", fontSize: 11.5, cursor: "pointer" }}>{sg}</button>)}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && enviar()} placeholder="Pergunte sobre o almoxarifado…" style={{ flex: 1, background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 13px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none" }} />
        <button onClick={() => enviar()} style={{ background: VX.turquesa, color: "#062a26", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Enviar</button>
      </div>
      <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 6 }}>Assistente local — responde a partir dos dados do sistema; nada é enviado para fora.</div>
    </div>
  );
}

export function SupInventarioView({ sb, canEdit, itens, lotes, saidasHist, invs, onSave, chave = "item_id", rotuloItem = "Material" }) {
  const [contar, setContar] = useState(null);   // item em contagem
  const [busca, setBusca] = useState("");
  const [soPendentes, setSoPendentes] = useState(true);

  // Classe ABC por valor de consumo (30d) — A conta mais vezes
  const consumo = {}; saidasHist.forEach(s => { if (s.item_id) consumo[s.item_id] = (consumo[s.item_id] || 0) + Number(s.quantidade || 0); });
  const valorConsumo = i => (consumo[i.id] || 0) * custoUnit(i);
  const ranked = [...itens].map(i => ({ i, v: valorConsumo(i) })).sort((a, b) => b.v - a.v);
  const totalV = ranked.reduce((s, x) => s + x.v, 0);
  const classeDe = {}; let acum = 0;
  ranked.forEach(x => { acum += x.v; const pct = totalV ? acum / totalV : 1; classeDe[x.i.id] = x.v <= 0 ? "C" : pct <= 0.8 ? "A" : pct <= 0.95 ? "B" : "C"; });

  // Última contagem por item
  const ultima = {}; invs.forEach(v => { if (!ultima[v.item_id]) ultima[v.item_id] = v; });   // invs vem desc
  const diasDesde = iso => iso ? Math.floor((Date.now() - new Date(iso)) / 86400000) : null;
  const pendenteDe = i => { const u = ultima[i.id]; const d = u ? diasDesde(u.created_at) : null; const alvo = SUP_INV_INTERVALO[classeDe[i.id] || "C"]; return d == null || d >= alvo; };

  // Acuracidade — últimas contagens (uma por item) nos últimos 90 dias
  const recentes = Object.values(ultima).filter(u => diasDesde(u.created_at) <= 90);
  const exatas = recentes.filter(u => Number(u.diferenca) === 0).length;
  const acuracidade = recentes.length ? (exatas / recentes.length) * 100 : null;
  const divergencias = recentes.filter(u => Number(u.diferenca) !== 0);
  const valorDiverg = divergencias.reduce((s, u) => { const it = itens.find(x => x.id === u.item_id); return s + Math.abs(Number(u.diferenca)) * custoUnit(it); }, 0);

  const q = normTxt(busca);
  const fila = ranked.map(x => x.i)
    .filter(i => !q || normTxt(i.nome).includes(q) || (i.codigo_barras || "").includes(busca.trim()))
    .filter(i => !soPendentes || pendenteDe(i));
  const pendentesTotal = itens.filter(pendenteDe).length;
  const classeCor = c => c === "A" ? "#e11d48" : c === "B" ? "#d97706" : "#0d9488";

  const KPI = ({ label, valor, cor, sub }) => (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${cor || "var(--border)"}`, borderRadius: 10, padding: "13px 15px" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
      <div style={{ fontSize: 25, fontWeight: 800, color: cor || "var(--text)", fontFamily: "JetBrains Mono, monospace", marginTop: 3 }}>{valor}</div>
      {sub && <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
  const acuCor = acuracidade == null ? "var(--text-muted)" : acuracidade >= 95 ? "#34d399" : acuracidade >= 85 ? "#d97706" : "#f43f5e";

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 14 }}>
        <KPI label="Acuracidade do estoque" valor={acuracidade == null ? "—" : acuracidade.toFixed(0) + "%"} cor={acuCor} sub={acuracidade == null ? "faça contagens para medir" : `${exatas}/${recentes.length} itens sem divergência (90d)`} />
        <KPI label="Itens a contar hoje" valor={pendentesTotal} cor={pendentesTotal ? "#d97706" : "#34d399"} sub="pela curva ABC (A=7d · B=30d · C=90d)" />
        <KPI label="Divergências (90d)" valor={divergencias.length} cor={divergencias.length ? "#f43f5e" : "#34d399"} sub="contagens que não bateram" />
        <KPI label="Impacto das divergências" valor={valorDiverg > 0 ? fmtReais(valorDiverg) : "—"} cor="#0d9488" sub="valor absoluto ajustado" />
      </div>

      {/* Ao lado da acuracidade de propósito: as duas medem a mesma coisa
          por caminhos diferentes. A acuracidade compara o sistema com a
          PRATELEIRA e depende de alguém contar; a conciliação compara o
          sistema com ELE MESMO e roda sozinha. Quando a contagem acusa
          divergência, é esta que diz se o erro veio de dentro. */}
      <ConciliacaoKardex sb={sb} itens={itens} />

      <div style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 14, border: "1px dashed var(--border)", borderRadius: 8, padding: "9px 13px" }}>
        <strong>Contagem cega:</strong> você conta na prateleira e digita <em>sem ver o saldo do sistema</em>. Só depois de "Conferir" o sistema mostra a diferença — evita o viés de "confirmar" o número da tela. Itens de <strong style={{ color: "#e11d48" }}>classe A</strong> (maior giro em R$) entram na fila a cada 7 dias; B a cada 30; C a cada 90.
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar item ou bipar código…" style={{ ...campoTexto, maxWidth: 300, flex: "1 1 200px" }} />
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--text-2)", cursor: "pointer" }}>
          <input type="checkbox" checked={soPendentes} onChange={e => setSoPendentes(e.target.checked)} style={{ accentColor: VX.turquesa, width: 14, height: 14 }} /> só os que estão na fila de hoje
        </label>
      </div>

      {fila.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>{soPendentes ? "Nenhum item pendente de contagem hoje. 👍" : "Nenhum item encontrado."}</div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 640 }}>
            <thead><tr style={{ background: "var(--surface-2)", textAlign: "left", color: "var(--text-3)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>
              <th style={{ padding: "9px 12px" }}>Classe</th>
              <th style={{ padding: "9px 12px" }}>{rotuloItem}</th>
              <th style={{ padding: "9px 12px" }}>Última contagem</th>
              <th style={{ padding: "9px 12px" }}>Situação</th>
              <th style={{ padding: "9px 12px", textAlign: "right" }}>Ação</th>
            </tr></thead>
            <tbody>
              {fila.slice(0, 100).map(i => {
                const u = ultima[i.id]; const d = u ? diasDesde(u.created_at) : null; const pend = pendenteDe(i); const c = classeDe[i.id] || "C";
                return (
                  <tr key={i.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 12px" }}><span style={{ fontSize: 11, fontWeight: 800, color: classeCor(c), border: `1px solid ${classeCor(c)}55`, borderRadius: 99, padding: "1px 8px" }}>{c}</span></td>
                    <td style={{ padding: "8px 12px", fontWeight: 600 }}>{i.nome}</td>
                    <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-2)" }}>{u ? `${new Date(u.created_at).toLocaleDateString("pt-BR")} · há ${d}d${Number(u.diferenca) !== 0 ? ` (dif ${u.diferenca > 0 ? "+" : ""}${farmFmtQtd(u.diferenca)})` : " ✓"}` : "nunca contado"}</td>
                    <td style={{ padding: "8px 12px" }}><span style={{ fontSize: 12, color: pend ? "#d97706" : "#34d399", fontWeight: pend ? 700 : 400 }}>{pend ? "na fila" : "em dia"}</span></td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{canEdit && <button onClick={() => setContar(i)} style={btnContorno(VX.turquesa)}>Contar</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {contar && <SupContagemModal item={contar} chave={chave} saldoSistema={supSaldoTotal(contar.id, lotes, chave)} lotesDoItem={lotes.filter(l => l[chave] === contar.id)} onClose={() => setContar(null)} onSave={async (inv, plano) => { await onSave(inv, plano); setContar(null); }} />}
    </div>
  );
}

// Contagem cega de um item — só revela o saldo do sistema após "Conferir"
export function SupContagemModal({ item, saldoSistema, lotesDoItem = [], chave = "item_id", onClose, onSave }) {
  const [contado, setContado] = useState("");
  const [revelado, setRevelado] = useState(false);
  const [ajustar, setAjustar] = useState(true);
  const [obs, setObs] = useState("");
  const [loteEscolhido, setLoteEscolhido] = useState("");
  const [busy, setBusy] = useState(false);
  const dif = revelado ? Number(contado) - Number(saldoSistema) : null;

  // O estoque é por LOTE e a contagem é por ITEM — então o ajuste precisa
  // decidir de qual lote tirar (FEFO) ou em qual pôr (só a pessoa sabe).
  // O plano é calculado aqui e MOSTRADO antes de confirmar: ajuste que
  // mexe no estoque sem dizer onde é caixa-preta, e caixa-preta em
  // controle de estoque é onde material some.
  const plano = revelado
    ? planejarAjuste(dif, lotesDoItem, { loteEscolhido: loteEscolhido || null })
    : { ok: true, passos: [], motivo: null };
  const lotesComSaldo = lotesDoItem.filter(l => Number(l.quantidade || 0) > 0);
  const precisaEscolher = revelado && dif > 0 && !plano.ok && lotesComSaldo.length > 1;
  const bloqueado = revelado && ajustar && dif !== 0 && !plano.ok;

  function conferir() {
    if (contado === "" || Number(contado) < 0) { alert("Digite a quantidade contada na prateleira."); return; }
    setRevelado(true);
  }
  async function salvar() {
    setBusy(true);
    await onSave({
      [chave]: item.id,
      saldo_sistema: Number(saldoSistema),
      contado: Number(contado),
      diferenca: Number(contado) - Number(saldoSistema),
      // `ajustado` NUNCA sai daqui como verdadeiro: quem decide é a
      // gravação no kardex, não a intenção da tela. Era exatamente essa
      // confusão que fazia a acuracidade mentir.
      ajustado: false,
      observacao: obs.trim() || null,
    }, ajustar ? plano.passos : []);
    setBusy(false);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 440, maxWidth: "94vw" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Contagem — {item.nome}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>Conte na prateleira e digite a quantidade{item.unidade ? ` em ${item.unidade}` : ""}. O saldo do sistema fica oculto até você conferir.</div>

        <div style={{ marginBottom: 14 }}>
          <label style={rotuloCampo}>Quantidade contada *</label>
          <input type="number" min="0" step="any" value={contado} onChange={e => setContado(e.target.value)} disabled={revelado} placeholder="0" style={{ ...campoTexto, fontSize: 18, fontWeight: 700, textAlign: "center" }} autoFocus />
        </div>

        {!revelado ? (
          <button onClick={conferir} style={{ width: "100%", background: VX.azul, color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 700, cursor: "pointer", fontSize: 14, marginBottom: 6 }}>Conferir com o sistema</button>
        ) : (<>
          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px", marginBottom: 14, textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 8 }}>
              <div><div style={{ fontSize: 10.5, color: "var(--text-muted)", textTransform: "uppercase" }}>Sistema</div><div style={{ fontSize: 20, fontWeight: 800, fontFamily: "JetBrains Mono, monospace" }}>{farmFmtQtd(saldoSistema)}</div></div>
              <div><div style={{ fontSize: 10.5, color: "var(--text-muted)", textTransform: "uppercase" }}>Contado</div><div style={{ fontSize: 20, fontWeight: 800, fontFamily: "JetBrains Mono, monospace" }}>{farmFmtQtd(contado)}</div></div>
              <div><div style={{ fontSize: 10.5, color: "var(--text-muted)", textTransform: "uppercase" }}>Diferença</div><div style={{ fontSize: 20, fontWeight: 800, fontFamily: "JetBrains Mono, monospace", color: dif === 0 ? "#34d399" : "#f43f5e" }}>{dif > 0 ? "+" : ""}{farmFmtQtd(dif)}</div></div>
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: dif === 0 ? "#34d399" : "#f43f5e" }}>{dif === 0 ? "✓ Estoque bate — nada a ajustar" : "Divergência encontrada"}</div>
          </div>
          {dif !== 0 && (<>
            <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13, color: "var(--text-2)", cursor: "pointer", marginBottom: 10 }}>
              <input type="checkbox" checked={ajustar} onChange={e => setAjustar(e.target.checked)} style={{ accentColor: VX.turquesa, width: 15, height: 15 }} /> Lançar o ajuste no kardex (corrige o saldo para {farmFmtQtd(contado)})
            </label>

            {ajustar && precisaEscolher && (
              // Sobra com vários lotes: o sistema não tem como adivinhar em
              // qual entram as unidades a mais. Chutar corrompe a validade e
              // o FEFO, e o erro só aparece meses depois — como material
              // vencido que o sistema jurava estar bom.
              <div style={{ marginBottom: 12 }}>
                <label style={rotuloCampo}>Em qual lote entram as {farmFmtQtd(dif)} unidade(s) a mais? *</label>
                <select value={loteEscolhido} onChange={e => setLoteEscolhido(e.target.value)} style={campoTexto}>
                  <option value="">Escolha o lote…</option>
                  {lotesDoItem.map(l => (
                    <option key={l.lote || "__generico__"} value={l.lote || ""}>
                      {l.lote || "(sem lote)"}{l.validade ? ` · vence ${new Date(l.validade + "T00:00:00").toLocaleDateString("pt-BR")}` : ""} · saldo {farmFmtQtd(l.quantidade)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {ajustar && (
              <div style={{
                fontSize: 12, lineHeight: 1.5, marginBottom: 12, borderRadius: 8, padding: "8px 12px",
                border: `1px solid ${plano.ok ? "var(--border)" : "#f43f5e55"}`,
                background: plano.ok ? "var(--surface-2)" : "#3d0f1833",
                color: plano.ok ? "var(--text-3)" : "#fb7185",
              }}>
                {plano.ok
                  ? <><strong style={{ color: "var(--text-2)" }}>O ajuste vai:</strong> {descreverPlano(plano.passos)}.
                      {plano.passos.length > 1 && <> A saída segue a ordem de validade (vence primeiro, sai primeiro).</>}</>
                  : <>⚠ {plano.motivo}</>}
              </div>
            )}
          </>)}
          <div style={{ marginBottom: 14 }}>
            <label style={rotuloCampo}>Observação {dif !== 0 ? "(motivo provável da divergência)" : ""}</label>
            <input value={obs} onChange={e => setObs(e.target.value)} placeholder={dif !== 0 ? "Ex.: quebra, saída não lançada, empréstimo a outro setor" : "opcional"} style={campoTexto} />
          </div>
        </>)}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          {revelado && (
            <button onClick={salvar} disabled={busy || bloqueado}
              title={bloqueado ? plano.motivo : undefined}
              style={{ background: bloqueado ? "var(--surface-3)" : "#22d3ee", color: bloqueado ? "var(--text-muted)" : "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: bloqueado ? "not-allowed" : "pointer", fontSize: 13 }}>
              {busy ? "…" : bloqueado ? "Resolva o ajuste acima" : "Registrar contagem"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Importar NF-e (XML): lê a nota, casa itens com o catálogo (por código de barras
// ou nome), deixa revisar e lança as entradas de uma vez — com custo médio.
function SupNfeModal({ itens, forns, onClose, onConfirm }) {
  const [parsed, setParsed] = useState(null);   // { fornecedor, nf, itens } ou { erro }
  const [linhas, setLinhas] = useState([]);
  const [busy, setBusy] = useState(false);
  const ativos = itens.filter(i => i.ativo !== false);

  function matchItem(x) {
    if (x.ean) { const porEan = ativos.find(i => (i.codigo_barras || "").trim() === x.ean); if (porEan) return String(porEan.id); }
    const nx = normTxt(x.nome);
    const porNome = ativos.find(i => normTxt(i.nome) === nx) || ativos.find(i => nx.length >= 5 && (normTxt(i.nome).includes(nx) || nx.includes(normTxt(i.nome))));
    return porNome ? String(porNome.id) : "novo";
  }
  function carregarArquivo(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const res = parseNFe(String(e.target.result || ""));
      setParsed(res);
      if (!res.erro) setLinhas(res.itens.map(x => ({ ...x, alvo: matchItem(x) })));
    };
    reader.readAsText(file, "ISO-8859-1");   // NF-e costuma vir em latin1
  }
  const set = (i, k, v) => setLinhas(l => l.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const aImportar = linhas.filter(l => l.alvo !== "skip").length;
  const fornExiste = parsed?.fornecedor?.cnpj && forns.some(f => (f.cnpj || "").replace(/\D/g, "") === parsed.fornecedor.cnpj.replace(/\D/g, ""));

  async function confirmar() {
    if (!aImportar) { alert("Nenhum item selecionado para importar."); return; }
    setBusy(true);
    await onConfirm({ fornecedor: parsed.fornecedor, nf: parsed.nf, linhas });
    setBusy(false);
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 780, maxWidth: "96vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Importar NF-e (XML)</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>Selecione o arquivo XML da nota. O sistema lê os itens e casa com o catálogo (por código de barras ou nome); você revisa e confirma. Cada item vira uma <strong>entrada</strong> no estoque, com lote, validade e custo da nota.</div>

        {!parsed && (
          <div style={{ border: "2px dashed var(--border)", borderRadius: 10, padding: "2rem", textAlign: "center" }}>
            <input type="file" accept=".xml,text/xml,application/xml" onChange={e => carregarArquivo(e.target.files[0])} style={{ fontSize: 13 }} />
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10 }}>O arquivo é lido localmente no seu navegador — nada é enviado para fora.</div>
          </div>
        )}

        {parsed?.erro && (
          <div style={{ fontSize: 13, color: "#f43f5e", background: "#f43f5e12", border: "1px solid #f43f5e44", borderRadius: 8, padding: "12px 14px" }}>{parsed.erro} <button onClick={() => setParsed(null)} style={{ marginLeft: 8, background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 10px", color: "var(--text-2)", cursor: "pointer", fontSize: 12 }}>Tentar outro arquivo</button></div>
        )}

        {parsed && !parsed.erro && (<>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5, marginBottom: 12, padding: "10px 12px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8 }}>
            <div><span style={{ color: "var(--text-muted)" }}>Fornecedor:</span> <strong>{parsed.fornecedor.nome || "—"}</strong> {parsed.fornecedor.cnpj ? `· ${parsed.fornecedor.cnpj}` : ""} {parsed.fornecedor.cnpj && !fornExiste && <span style={{ fontSize: 10.5, color: "#d97706", border: "1px solid #d9770655", borderRadius: 99, padding: "0 6px", marginLeft: 4 }}>será cadastrado</span>}</div>
            <div><span style={{ color: "var(--text-muted)" }}>NF:</span> <strong>{parsed.nf || "—"}</strong></div>
            <div style={{ marginLeft: "auto" }}><span style={{ color: "var(--text-muted)" }}>Itens:</span> <strong>{aImportar}</strong> de {linhas.length} selecionado(s)</div>
          </div>

          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10, marginBottom: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 720 }}>
              <thead><tr style={{ background: "var(--surface-2)", textAlign: "left", color: "var(--text-3)", fontSize: 10.5, textTransform: "uppercase" }}>
                <th style={{ padding: "7px 10px" }}>Item da nota → material no catálogo</th>
                <th style={{ padding: "7px 10px", textAlign: "right" }}>Qtd</th>
                <th style={{ padding: "7px 10px", textAlign: "right" }}>Custo un.</th>
                <th style={{ padding: "7px 10px" }}>Lote</th>
                <th style={{ padding: "7px 10px" }}>Validade</th>
              </tr></thead>
              <tbody>
                {linhas.map((x, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--border)", opacity: x.alvo === "skip" ? 0.5 : 1 }}>
                    <td style={{ padding: "7px 10px" }}>
                      <div style={{ fontWeight: 600, marginBottom: 3 }}>{x.nome} <span style={{ fontSize: 10.5, color: "var(--text-muted)", fontWeight: 400 }}>{x.ean ? `· EAN ${x.ean}` : ""}</span></div>
                      <select value={x.alvo} onChange={e => set(i, "alvo", e.target.value)} style={{ ...campoTexto, padding: "5px 8px", fontSize: 12 }}>
                        <option value="novo">➕ Criar novo material</option>
                        <option value="skip">✕ Não importar</option>
                        <optgroup label="Casar com material existente">
                          {ativos.slice().sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR")).map(it => <option key={it.id} value={String(it.id)}>{it.nome}</option>)}
                        </optgroup>
                      </select>
                    </td>
                    <td style={{ padding: "7px 10px", textAlign: "right" }}><input type="number" min="0" step="any" value={x.qtd} onChange={e => set(i, "qtd", e.target.value)} style={{ ...campoTexto, width: 70, padding: "5px 7px", fontSize: 12 }} /></td>
                    <td style={{ padding: "7px 10px", textAlign: "right" }}><input type="number" min="0" step="any" value={x.custo_unit} onChange={e => set(i, "custo_unit", e.target.value)} style={{ ...campoTexto, width: 80, padding: "5px 7px", fontSize: 12 }} /></td>
                    <td style={{ padding: "7px 10px" }}><input value={x.lote} onChange={e => set(i, "lote", e.target.value)} placeholder="—" style={{ ...campoTexto, width: 90, padding: "5px 7px", fontSize: 12 }} /></td>
                    <td style={{ padding: "7px 10px" }}><input type="date" value={x.validade} onChange={e => set(i, "validade", e.target.value)} style={{ ...campoTexto, width: 130, padding: "5px 7px", fontSize: 12 }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginBottom: 14 }}>Itens já com código de barras cadastrado casam sozinhos. Confira as quantidades e validades antes de confirmar — vira estoque de verdade.</div>
        </>)}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          {parsed && !parsed.erro && <button onClick={confirmar} disabled={busy || !aImportar} style={{ background: "#34d399", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13, opacity: (busy || !aImportar) ? 0.5 : 1 }}>{busy ? "Importando…" : `Importar ${aImportar} item(ns)`}</button>}
        </div>
      </div>
    </div>
  );
}

// Cadastro / edição de material
function SupItemModal({ item, onClose, onSave }) {
  const [f, setF] = useState({ ...item });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const conf = validarConversao(f);
  async function salvar() {
    if (!f.nome.trim()) { alert("Informe o nome / descrição do material."); return; }
    // Fator inválido é bloqueio, não aviso: ele não dá erro em lugar
    // nenhum — só contamina o custo médio de todas as entradas seguintes,
    // em silêncio, e o custo médio é ponderado (carrega o erro adiante).
    if (!conf.ok) { alert(conf.erros.join("\n")); return; }
    setBusy(true);
    await onSave({
      ...(item.id ? { id: item.id } : {}),
      nome: f.nome.trim(),
      categoria: f.categoria || null,
      unidade: f.unidade || "unidade",
      unidade_compra: f.unidade_compra?.trim() || null,
      fator_conversao: f.fator_conversao === "" || f.fator_conversao == null ? 1 : Number(f.fator_conversao),
      estoque_minimo: f.estoque_minimo === "" || f.estoque_minimo == null ? 0 : Number(f.estoque_minimo),
      custo_unitario: f.custo_unitario === "" || f.custo_unitario == null ? null : Number(f.custo_unitario),
      codigo_barras: f.codigo_barras?.trim() || null,
      ativo: f.ativo !== false,
      observacao: f.observacao?.trim() || null,
    });
    setBusy(false);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 480, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>{item.id ? "Editar material" : "Novo material"}</div>
        <div style={{ marginBottom: 10 }}>
          <label style={rotuloCampo}>Nome / descrição *</label>
          <input value={f.nome} onChange={e => set("nome", e.target.value)} placeholder="Ex.: Luva de procedimento M — caixa 100" style={campoTexto} autoFocus />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={rotuloCampo}>Categoria</label>
            <select value={f.categoria || ""} onChange={e => set("categoria", e.target.value)} style={campoTexto}>
              <option value="">—</option>
              {SUP_CATEGORIAS.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div>
            <label style={rotuloCampo}>Unidade de consumo</label>
            <select value={f.unidade || "unidade"} onChange={e => set("unidade", e.target.value)} style={campoTexto}>
              {SUP_UNIDADES.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
        </div>

        {/* COMO SE COMPRA × COMO SE CONSOME
            O almoxarifado compra caixa de 100 luvas e entrega par. Sem
            separar as duas unidades, o custo da caixa entra como custo do
            par — e o custo médio é ponderado, então o erro não fica no
            passado: contamina toda entrada seguinte. */}
        <div style={{ border: "1px dashed var(--border)", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.5 }}>
            Preencha <strong>só se comprar numa unidade diferente da que consome</strong> (ex.: compra caixa, entrega par).
            O estoque e o kardex sempre falam em <strong>{f.unidade || "unidade"}</strong>.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={rotuloCampo}>Unidade de compra</label>
              <input value={f.unidade_compra || ""} onChange={e => set("unidade_compra", e.target.value)} placeholder="Ex.: caixa, fardo" style={campoTexto} />
            </div>
            <div>
              <label style={rotuloCampo}>{f.unidade || "unidade"}(s) por {f.unidade_compra?.trim() || "unidade de compra"}</label>
              <input type="number" min="0" step="any" value={f.fator_conversao ?? ""} onChange={e => set("fator_conversao", e.target.value)} placeholder="1" style={campoTexto} />
            </div>
          </div>
          {temConversao(f) && conf.ok && (
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 8 }}>
              Comprar <strong>1 {f.unidade_compra?.trim() || "unidade de compra"}</strong> passa a dar entrada de{" "}
              <strong>{comprarParaConsumo(1, f)} {f.unidade || "un"}</strong>. Um custo de R$ 100 na nota vira{" "}
              <strong>{fmtBRL(custoPorUnidadeConsumo(100, f) || 0)}</strong> por {f.unidade || "un"}.
            </div>
          )}
          {conf.erros.map((e, i) => <div key={i} style={{ fontSize: 12, color: "#fb7185", marginTop: 6 }}>⚠ {e}</div>)}
          {conf.avisos.map((a, i) => <div key={i} style={{ fontSize: 12, color: "#d97706", marginTop: 6 }}>{a}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={rotuloCampo}>Estoque mínimo</label>
            <input type="number" min="0" value={f.estoque_minimo ?? ""} onChange={e => set("estoque_minimo", e.target.value)} placeholder="0" style={campoTexto} />
          </div>
          <div>
            <label style={rotuloCampo}>Custo unit. (R$)</label>
            <input type="number" min="0" step="any" value={f.custo_unitario ?? ""} onChange={e => set("custo_unitario", e.target.value)} placeholder="0,00" style={campoTexto} />
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={rotuloCampo}>Código de barras</label>
          <input value={f.codigo_barras || ""} onChange={e => set("codigo_barras", e.target.value)} placeholder="Clique aqui e bipe com o leitor (ou digite o EAN)" style={campoTexto} />
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3 }}>Um leitor USB funciona como teclado: clique no campo e passe o produto. Depois dá para buscar o item bipando na barra de busca do Estoque.</div>
        </div>
        <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13, color: "var(--text-2)", cursor: "pointer", marginBottom: 12 }}>
          <input type="checkbox" checked={f.ativo !== false} onChange={e => set("ativo", e.target.checked)} style={{ accentColor: "#34d399", width: 15, height: 15 }} /> Ativo
        </label>
        <div style={{ marginBottom: 16 }}>
          <label style={rotuloCampo}>Observação</label>
          <textarea value={f.observacao || ""} onChange={e => set("observacao", e.target.value)} rows={2} placeholder="Marca, especificação, armazenamento…" style={{ ...campoTexto, resize: "vertical" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={salvar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}

// Entrada / saída de estoque de material
function SupMovModal({ item, tipoInicial, lotes, fornecedores, setores = [], onClose, onSave }) {
  const [tipo, setTipo] = useState(tipoInicial || "entrada");
  // "Outro…" continua existindo: um setor legítimo pode não estar cadastrado,
  // e travar a saída por causa disso pararia o almoxarifado. O que se faz é
  // encaixar o digitado no nome do catálogo quando dá para reconhecer.
  const [setorLivre, setSetorLivre] = useState(false);
  const lotesComSaldo = [...lotes].filter(l => Number(l.quantidade) > 0).sort((a, b) => (a.validade || "9999").localeCompare(b.validade || "9999")); // vence primeiro sai primeiro
  const [f, setF] = useState({
    lote: "", validade: "", quantidade: "", documento: "", fornecedor_id: "", setor: "",
    custo_unit: item.custo_unitario ?? "",
    lote_id: lotesComSaldo[0]?.id || "", motivo: "Consumo do setor",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const loteSel = lotesComSaldo.find(l => String(l.id) === String(f.lote_id));

  async function salvar() {
    const q = Number(f.quantidade);
    if (!q || q <= 0) { alert("Informe uma quantidade maior que zero."); return; }
    let mov;
    if (tipo === "entrada") {
      mov = { item_id: item.id, tipo: "entrada", quantidade: q, lote: f.lote.trim() || null, validade: f.validade || null, motivo: "Compra / nota fiscal", documento: f.documento.trim() || null, fornecedor_id: f.fornecedor_id || null, custo_unit: f.custo_unit === "" || f.custo_unit == null ? null : Number(f.custo_unit) };
    } else {
      if (!loteSel) { alert("Selecione o lote de onde sairá o material."); return; }
      if (q > Number(loteSel.quantidade)) { alert(`Saída maior que o saldo do lote (disponível: ${farmFmtQtd(loteSel.quantidade)}).`); return; }
      // A normalização acontece na GRAVAÇÃO, não só na tela: digitar
      // "posto 2" com "POSTO 2" cadastrado grava POSTO 2, e o relatório
      // passa a somar as duas origens na mesma linha. Sem isto, o select
      // resolveria só o caminho comum e a divergência voltaria pela opção
      // "Outro…" — que é justamente por onde ela entrava.
      const destino = casarComCatalogo(f.setor, setores).nome;
      mov = { item_id: item.id, tipo: "saida", quantidade: q, lote: loteSel.lote || null, validade: loteSel.validade || null, motivo: f.motivo, documento: f.documento.trim() || null, setor: destino || null };
    }
    setBusy(true);
    const ok = await onSave(mov);
    setBusy(false);
    if (!ok) return;
  }
  const cor = tipo === "entrada" ? "#34d399" : "#d97706";
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 480, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Movimentar estoque</div>
        <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 14 }}>{item.nome}{item.unidade ? ` · em ${item.unidade}` : ""}</div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {["entrada", "saida"].map(t => (
            <button key={t} onClick={() => setTipo(t)} style={{ flex: 1, background: tipo === t ? (t === "entrada" ? "#34d399" : "#d97706") : "transparent", color: tipo === t ? "#000" : "var(--text-3)", border: `1px solid ${tipo === t ? (t === "entrada" ? "#34d399" : "#d97706") : "var(--border)"}`, borderRadius: 7, padding: "8px 0", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{t === "entrada" ? "Entrada" : "Saída / baixa"}</button>
          ))}
        </div>

        {tipo === "entrada" ? (<>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div><label style={rotuloCampo}>Lote</label><input value={f.lote} onChange={e => set("lote", e.target.value)} placeholder="Ex.: AB1234" style={campoTexto} /></div>
            <div><label style={rotuloCampo}>Validade</label><input type="date" value={f.validade} onChange={e => set("validade", e.target.value)} style={campoTexto} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div><label style={rotuloCampo}>Quantidade *</label><input type="number" min="0" step="any" value={f.quantidade} onChange={e => set("quantidade", e.target.value)} placeholder="0" style={campoTexto} autoFocus /></div>
            <div><label style={rotuloCampo}>Custo unit. da nota (R$)</label><input type="number" min="0" step="any" value={f.custo_unit} onChange={e => set("custo_unit", e.target.value)} placeholder="0,00" style={campoTexto} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div><label style={rotuloCampo}>Nota fiscal / documento</label><input value={f.documento} onChange={e => set("documento", e.target.value)} placeholder="Nº NF" style={campoTexto} /></div>
            <div>
              <label style={rotuloCampo}>Fornecedor</label>
              <select value={f.fornecedor_id} onChange={e => set("fornecedor_id", e.target.value)} style={campoTexto}>
                <option value="">—</option>
                {fornecedores.map(fo => <option key={fo.id} value={fo.id}>{fo.nome}</option>)}
              </select>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.5 }}>O custo da nota atualiza o <strong>custo médio ponderado</strong> do material automaticamente. Sem lote/validade? Deixe em branco — entra num lote genérico.</div>
        </>) : (<>
          {lotesComSaldo.length === 0 ? (
            <div style={{ fontSize: 13, color: "#f43f5e", background: "#f43f5e12", border: "1px solid #f43f5e44", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>Não há saldo em estoque para dar baixa. Registre uma entrada primeiro.</div>
          ) : (<>
            <div style={{ marginBottom: 10 }}>
              <label style={rotuloCampo}>Lote (vence primeiro no topo)</label>
              <select value={f.lote_id} onChange={e => set("lote_id", e.target.value)} style={campoTexto}>
                {lotesComSaldo.map(l => { const vi = infoDeValidade(l.validade); return <option key={l.id} value={l.id}>{(l.lote || "sem lote")} · val {l.validade ? fmtDataBR(l.validade) : "—"}{vi.status === "vencido" ? " (VENCIDO)" : ""} · saldo {farmFmtQtd(l.quantidade)}</option>; })}
              </select>
            </div>
            {loteSel && infoDeValidade(loteSel.validade).status === "vencido" && <div style={{ fontSize: 11.5, color: "#f43f5e", marginBottom: 10, fontWeight: 600 }}>⚠ Lote vencido — a baixa deve ser por perda/descarte, não consumo.</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div><label style={rotuloCampo}>Quantidade *</label><input type="number" min="0" step="any" value={f.quantidade} onChange={e => set("quantidade", e.target.value)} placeholder="0" style={campoTexto} autoFocus /></div>
              <div><label style={rotuloCampo}>Motivo</label><select value={f.motivo} onChange={e => set("motivo", e.target.value)} style={campoTexto}>{SUP_MOTIVOS_SAIDA.map(x => <option key={x} value={x}>{x}</option>)}</select></div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={rotuloCampo}>Setor de destino</label>
              {setores.length > 0 && !setorLivre ? (
                <select value={f.setor} onChange={e => {
                  if (e.target.value === "__outro__") { setSetorLivre(true); set("setor", ""); }
                  else set("setor", e.target.value);
                }} style={campoTexto}>
                  <option value="">—</option>
                  {setores.map(s => <option key={s.nome} value={s.nome}>{s.nome}</option>)}
                  <option value="__outro__">Outro…</option>
                </select>
              ) : (
                <input value={f.setor} onChange={e => set("setor", e.target.value)}
                  placeholder="Ex.: Posto 2, Centro Cirúrgico" style={campoTexto} autoFocus={setorLivre} />
              )}
              {/* Avisa, não bloqueia. E só depois de digitar algo que o
                  catálogo não reconhece — nem mesmo por diferença de acento
                  ou de caixa, que é de onde vinha a fragmentação do BI. */}
              {setorLivre && ehSetorNovo(f.setor, setores) && (
                <div style={{ fontSize: 11.5, color: "#d97706", marginTop: 5 }}>
                  "{casarComCatalogo(f.setor, setores).nome}" não está no catálogo de setores. A saída é registrada assim mesmo —
                  se for um setor permanente, vale cadastrá-lo em Giro de Leitos para o consumo não se dividir no relatório.
                </div>
              )}
              {setorLivre && setores.length > 0 && (
                <button type="button" onClick={() => { setSetorLivre(false); set("setor", ""); }}
                  style={{ background: "transparent", border: "none", color: VX.turquesa, cursor: "pointer", fontSize: 11.5, padding: "5px 0 0", fontFamily: "Inter, sans-serif" }}>
                  ← escolher do catálogo
                </button>
              )}
            </div>
            {loteSel && <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 16 }}>Saldo do lote: <strong style={{ color: "var(--text-2)" }}>{farmFmtQtd(loteSel.quantidade)} {item.unidade || ""}</strong></div>}
          </>)}
        </>)}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={salvar} disabled={busy || (tipo === "saida" && lotesComSaldo.length === 0)} style={{ background: cor, color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13, opacity: (busy || (tipo === "saida" && lotesComSaldo.length === 0)) ? 0.5 : 1 }}>{busy ? "…" : tipo === "entrada" ? "Registrar entrada" : "Registrar saída"}</button>
        </div>
      </div>
    </div>
  );
}

// Kardex — histórico de movimentos do material
function SupKardexModal({ sb, item, fornecedores, canEdit, onEstornar, onClose }) {
  const [movs, setMovs] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const recarregar = () => loadSupMovimentos(sb, item.id).then(setMovs);
  useEffect(() => { recarregar(); }, [item.id]);
  const fornNome = id => fornecedores.find(f => f.id === id)?.nome;
  // Quem já foi desfeito sai do próprio kardex: o banco garante a regra
  // (índice único em `estorno_de`), aqui é só para não oferecer um botão
  // que vai falhar.
  const estornados = idsJaEstornados(movs || []);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 600, maxWidth: "94vw", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Kardex — {item.nome}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>Histórico de entradas e saídas (imutável). Últimos movimentos.</div>
        {movs == null ? <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "1.5rem" }}>Carregando…</div>
          : movs.length === 0 ? <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "1.5rem" }}>Nenhum movimento registrado ainda.</div>
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {movs.map(mv => {
                const ent = mv.tipo === "entrada";
                const cor = ent ? "#34d399" : "#d97706";
                const foiEstornado = estornados.has(mv.id);
                const ehEstorno = mv.estorno_de != null;
                const pode = podeEstornar(mv, estornados);
                return (
                  <div key={mv.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", opacity: foiEstornado ? 0.6 : 1 }}>
                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 800, color: cor, fontSize: 14, minWidth: 62, textAlign: "right", textDecoration: foiEstornado ? "line-through" : "none" }}>{ent ? "+" : "−"}{farmFmtQtd(mv.quantidade)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                        {ent ? "Entrada" : "Saída"} · {mv.motivo || "—"}{mv.lote ? ` · lote ${mv.lote}` : ""}{mv.setor ? ` · ${mv.setor}` : ""}{ent && fornNome(mv.fornecedor_id) ? ` · ${fornNome(mv.fornecedor_id)}` : ""}
                        {/* O vínculo em ambos os sentidos: a linha desfeita
                            e a que desfez continuam as duas no histórico —
                            é isso que torna o rastro legível. */}
                        {ehEstorno && <span title={`Desfaz o movimento #${mv.estorno_de}`} style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: VX.azul, border: `1px solid ${VX.azul}55`, borderRadius: 99, padding: "0 7px" }}>estorno de #{mv.estorno_de}</span>}
                        {foiEstornado && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: "var(--text-muted)", border: "1px solid var(--border-2)", borderRadius: 99, padding: "0 7px" }}>estornado</span>}
                      </div>
                      <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>#{mv.id} · {mv.created_at ? new Date(mv.created_at).toLocaleString("pt-BR") : ""}{mv.documento ? ` · doc ${mv.documento}` : ""}{mv.usuario ? ` · ${mv.usuario}` : ""}</div>
                    </div>
                    {canEdit && onEstornar && pode.ok && (
                      <button disabled={busyId === mv.id}
                        onClick={async () => { setBusyId(mv.id); const ok = await onEstornar(mv, estornados); setBusyId(null); if (ok) recarregar(); }}
                        title="Cria o movimento oposto no mesmo lote. O original permanece no histórico."
                        style={{ background: "transparent", color: "var(--text-3)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "4px 11px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "Inter, sans-serif" }}>
                        {busyId === mv.id ? "…" : "Estornar"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// Cadastro / edição de fornecedor
function SupFornecedorModal({ forn, onClose, onSave }) {
  const [f, setF] = useState({ ...forn });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  async function salvar() {
    if (!f.nome.trim()) { alert("Informe o nome do fornecedor."); return; }
    setBusy(true);
    await onSave({
      ...(forn.id ? { id: forn.id } : {}),
      nome: f.nome.trim(),
      cnpj: f.cnpj?.trim() || null,
      contato: f.contato?.trim() || null,
      telefone: f.telefone?.trim() || null,
      email: f.email?.trim() || null,
      categorias: f.categorias?.trim() || null,
      lead_time_dias: f.lead_time_dias === "" || f.lead_time_dias == null ? null : Number(f.lead_time_dias),
      observacao: f.observacao?.trim() || null,
      ativo: f.ativo !== false,
    });
    setBusy(false);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 480, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>{forn.id ? "Editar fornecedor" : "Novo fornecedor"}</div>
        <div style={{ marginBottom: 10 }}>
          <label style={rotuloCampo}>Nome / razão social *</label>
          <input value={f.nome} onChange={e => set("nome", e.target.value)} placeholder="Ex.: Distribuidora Hospitalar Ltda" style={campoTexto} autoFocus />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={rotuloCampo}>CNPJ</label><input value={f.cnpj || ""} onChange={e => set("cnpj", e.target.value)} placeholder="00.000.000/0000-00" style={campoTexto} /></div>
          <div><label style={rotuloCampo}>Pessoa de contato</label><input value={f.contato || ""} onChange={e => set("contato", e.target.value)} placeholder="Nome" style={campoTexto} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={rotuloCampo}>Telefone</label><input value={f.telefone || ""} onChange={e => set("telefone", e.target.value)} placeholder="(00) 00000-0000" style={campoTexto} /></div>
          <div><label style={rotuloCampo}>E-mail</label><input value={f.email || ""} onChange={e => set("email", e.target.value)} placeholder="contato@fornecedor.com" style={campoTexto} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={rotuloCampo}>O que fornece</label>
            <input value={f.categorias || ""} onChange={e => set("categorias", e.target.value)} placeholder="Ex.: material hospitalar, EPI, escritório" style={campoTexto} />
          </div>
          <div>
            <label style={rotuloCampo}>Prazo de entrega (dias)</label>
            <input type="number" min="0" value={f.lead_time_dias ?? ""} onChange={e => set("lead_time_dias", e.target.value)} placeholder={String(SUP_LEAD_PADRAO)} style={campoTexto} />
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: "var(--text-muted)", margintop: 0, marginBottom: 10 }}>O prazo de entrega alimenta o <strong>ponto de pedido</strong>: o sistema sugere comprar antes que o estoque acabe dentro desse prazo + margem. Sem valor, usa {SUP_LEAD_PADRAO} dias.</div>
        <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13, color: "var(--text-2)", cursor: "pointer", marginBottom: 12 }}>
          <input type="checkbox" checked={f.ativo !== false} onChange={e => set("ativo", e.target.checked)} style={{ accentColor: "#34d399", width: 15, height: 15 }} /> Ativo
        </label>
        <div style={{ marginBottom: 16 }}>
          <label style={rotuloCampo}>Observação</label>
          <textarea value={f.observacao || ""} onChange={e => set("observacao", e.target.value)} rows={2} placeholder="Prazo de entrega, condições…" style={{ ...campoTexto, resize: "vertical" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={salvar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}
