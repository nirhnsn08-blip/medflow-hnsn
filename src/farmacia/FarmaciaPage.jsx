// ═══════════════════════════════════════════════════════════
// FARMÁCIA — A TELA
//
// Saiu do App.jsx: 1.351 linhas próprias e 2.065 exclusivas, espalhadas por
// OITO regiões do arquivo. É o maior módulo do sistema.
//
// O catálogo do domínio está em ./catalogo.js e o acesso ao banco em
// ./dados.js — os dois saíram antes, de propósito: `MANCHESTER` é lido por
// 11 declarações e `loadPsAtendimentos` por 10. A Farmácia, o Giro de
// Leitos e o Faturamento leem a fila do PS sem precisar desta tela.
//
// ⚠️ DUAS PROPS DE REDE, e a segunda tem motivo.
//   `sb`     — a função de rede normal. Engole a falha e devolve `null`.
//   `sbCru`  — grava e devolve `{ ok, erro }`. Só o desfecho usa: a recusa
//              vem de gatilho do banco e quem está na recepção precisa LER
//              o motivo, não um "não deu".
//
// ⚠️ A trilha de auditoria vem de ../auditoria/dados.js, com o mesmo `sb`.
// ═══════════════════════════════════════════════════════════

import { registrarAuditoria } from "../auditoria/dados.js";
import { FARM_GRAV, FARM_SCORE_COR, analisarPrescricaoClinica, farmFmtQtd, normTxt, scoreItemClinico, scorePrescricao } from "../clinico/alertas.js";
import { MANCHESTER, PS_DOSE_UNID, PS_PRIORIDADE } from "../ps/catalogo.js";
import { loadPsAtendimentos, loadPsPrescricaoItensByAtendimentos, loadPsPrescricoesByAtendimentos } from "../ps/dados.js";
import { MOTIVO_AJUSTE, descreverPlano, documentoDaContagem, idsJaEstornados, movimentoDeEstorno, podeEstornar } from "../suprimentos/inventario.js";
import { HOSPITAL_NOME, HOSPITAL_SIGLA, Icon, MONTHS_FULL, VX, btnContorno, campoTexto, rotuloCampo } from "../ui/base.jsx";
import { avisoSonoro, ligarSom, somLigado } from "../ui/som.js";
import { comGrupos } from "../ui/sub-nav.js";
import { fmtDataBR, horaFmt, nowISO, todayStr } from "../util/datas.js";
import { fmtReais } from "../util/formato.js";
import { abasVisiveis, podeAbrirAba } from "./abas.js";
import { FARM_ALERTA_TIPOS, FARM_CLASSES, FARM_FORMAS, FARM_MOTIVOS_SAIDA, FARM_PREV_HORIZONTE, FARM_PREV_JANELA, FARM_UNIDADES } from "./catalogo.js";
import { addFarmIntervencaoRemote, addFarmInventarioRemote, addFarmMovimentoRemote, addFarmNaoPadronizadoRemote, atualizarPreparoRemote, deleteFarmIncompatRemote, deleteFarmInteracaoRemote, deleteFarmIntervencaoRemote, deleteFarmMedicamentoRemote, deleteFarmNaoPadronizadoRemote, loadFarmIncompatY, loadFarmInteracoes, loadFarmIntervencoes, loadFarmInventarios, loadFarmLotes, loadFarmMedicamentos, loadFarmMovimentos, loadFarmMovimentosByMeds, loadFarmMovimentosPeriodo, loadFarmNaoPadronizados, loadFarmPreparo, loadFarmSaidasByAtendimentos, loadFarmSaidasDesde, receberPreparoRemote, updateFarmIntervencaoRemote, updateFarmNaoPadronizadoRemote, upsertFarmIncompatRemote, upsertFarmInteracaoRemote, upsertFarmMedicamentoRemote } from "./dados.js";
import { custoUnit, saldoDoMedicamento } from "./estoque.js";
import { podeMarcarPronto } from "./preparo.js";
import { DIAS_VENCENDO, infoDeValidade, lotesParaEscolha, podeSair, situacaoDoLote } from "./validade.js";
import { useEffect, useRef, useState } from "react";
// 🔴 A MESMA view do almoxarifado, com a chave trocada: contagem cega, curva
// ABC, acuracidade e conciliação são a mesma regra nos dois módulos.
import { SupInventarioView } from "../suprimentos/SuprimentosPage.jsx";

// Movimento de estoque: retorna { ok, erro } — o trigger pode barrar (estoque insuficiente),
// e como o sb engole erros, aqui fazemos o fetch direto para capturar a mensagem.
// Saldo total de um medicamento = soma dos lotes
// Regra ÚNICA de situação de estoque. Os três estados são mutuamente exclusivos,
// então "precisa repor" = zerado ∪ baixo nunca conta o mesmo item duas vezes.
// Saldo zero SEMPRE alerta, mesmo sem estoque mínimo cadastrado (ruptura é o evento
// mais grave e não pode depender de um campo opcional cujo default é 0).
function farmStatusEstoque(m, lotes) {
  const saldo = saldoDoMedicamento(m.id, lotes);
  const min = Number(m.estoque_minimo || 0);
  if (saldo <= 0) return { key: "zerado", cor: "#f43f5e", label: "Sem estoque", saldo, min };
  if (min > 0 && saldo <= min) return { key: "baixo", cor: "#d97706", label: "Abaixo do mínimo", saldo, min };
  return { key: "ok", cor: "#34d399", label: "OK", saldo, min };
}

const farmPrecisaRepor = (m, lotes) => farmStatusEstoque(m, lotes).key !== "ok";

// Pares clínicos: interações medicamentosas e incompatibilidade em Y (Fase 2)
// Fluxo de preparo (uma linha por prescrição assinada = registro_id)
// Prescrições assinadas (cabeçalho) de vários atendimentos
// Movimentos de um conjunto de medicamentos (livro de controlados) — ordem cronológica
// Medicamentos NÃO padronizados (trazidos pela família)
const NAOPAD_STATUS = {
  recebido:   { label: "Recebido",   cor: "#d97706" },
  em_uso:     { label: "Em uso",     cor: "#3b82f6" },
  devolvido:  { label: "Devolvido",  cor: "#34d399" },
  descartado: { label: "Descartado", cor: "#8d99ab" },
};

// Intervenção farmacêutica (estilo NoHarm)
const INTERV_STATUS = {
  pendente:   { label: "Pendente",   cor: "#d97706" },
  aceita:     { label: "Aceita",     cor: "#34d399" },
  nao_aceita: { label: "Não aceita", cor: "#f43f5e" },
  resolvida:  { label: "Resolvida",  cor: "#3b82f6" },
  cancelada:  { label: "Cancelada",  cor: "#8d99ab" },
};

// ── Farmácia clínica (motor de alertas, Fase 1) ──
// FARM_GRAV vem de ./clinico/alertas.js (a ordenação dos alertas usa `ordem`;
// a interface usa `cor` e `label`).
// Fluxo de preparo da farmácia — estados e cores
const PREPARO_STATUS = {
  aguardando: { label: "Aguardando farmácia", cor: "#8d99ab" },
  preparo:    { label: "Em preparo",          cor: "#d97706" },
  pronto:     { label: "Pronto p/ retirada",  cor: "#3b82f6" },
  retirado:   { label: "Retirado",            cor: "#34d399" },
  cancelado:  { label: "Cancelado",           cor: "#f43f5e" },
};

// Bipe curto (WebAudio, sem arquivo externo — respeita a CSP)
// Barra lateral interna da Farmácia (mantém as chaves internas das telas)
// Ordenado pelo FLUXO do farmacêutico, e os grupos separam natureza de
// trabalho. A cadeia clínica (2 a 5) já estava certa; o que estava fora de
// lugar era o ESTOQUE — três telas do módulo apontam para ele como
// pré-requisito ("Sem lote em estoque. Registre uma entrada no Estoque"),
// e ele vinha DEPOIS do ato que depende dele, misturado com a base de
// interações e o livro de controlados. Coisas de natureza diferente.
const FARM_NAV = [
  { key: "dashboard",   label: "Dashboard",         icon: "dashboard" },

  { key: "analise",     label: "Prescrições",       icon: "clipboard", grupo: "Cuidado ao paciente" },
  { key: "preparo",     label: "Solicitações",      icon: "list",      grupo: "Cuidado ao paciente" },
  { key: "dispensacao", label: "Dispensações",      icon: "pill",      grupo: "Cuidado ao paciente" },
  { key: "intervencao", label: "Intervenção",       icon: "shield",    grupo: "Cuidado ao paciente" },

  { key: "estoque",     label: "Estoque",           icon: "box",       grupo: "Estoque" },
  { key: "inventario",  label: "Inventário",        icon: "clipboard", grupo: "Estoque" },
  { key: "naopad",      label: "Não padronizados",  icon: "record",    grupo: "Estoque" },

  { key: "controlados", label: "Controlados",       icon: "lock",  grupo: "Registro e referência" },
  { key: "interacoes",  label: "Interações",        icon: "flask", grupo: "Registro e referência" },

  { key: "indicadores", label: "Indicadores",       icon: "chart", grupo: "Acompanhar" },
  { key: "assistente",  label: "Assistente AI",     icon: "chat",  grupo: "Acompanhar" },
];

// ── Inventário da FARMÁCIA ──────────────────────────────────
// Mesma forma dos três acima. A farmácia e o almoxarifado são o mesmo
// kardex com nomes diferentes, e a diferença que sobra é a coluna que
// identifica o que se conta: `medicamento_id` em vez de `item_id`.
// Confere o RETORNO, nunca o status: sem a política de UPDATE o PostgREST
// responde 200 com `[]` — zero linhas alteradas — e o código daria por
// gravado. É a mesma armadilha que o almoxarifado já pagou uma vez.
async function marcarFarmInventarioRemote(sb, id, campos) {
  if (!sb) return { ok: false, erro: "Supabase indisponível." };
  const r = await sb(`farm_inventarios?id=eq.${id}`, {
    method: "PATCH",
    headers: { "Prefer": "return=representation" },
    body: JSON.stringify(campos),
  });
  const linhas = Array.isArray(r) ? r : r ? [r] : [];
  if (!linhas.length) return { ok: false, erro: "A gravação não alterou nenhuma linha." };
  return { ok: true, linha: linhas[0] };
}

export default function FarmaciaPage({ sb, sbCru, currentUser, canEdit, podeControlados = true }) {
  const [meds, setMeds]   = useState([]);
  const [lotes, setLotes] = useState([]);
  const [busca, setBusca] = useState("");
  const [classeFiltro, setClasseFiltro] = useState("");
  const [showMed, setShowMed] = useState(null);   // objeto (novo/editar) ou null
  const [movMed, setMovMed]   = useState(null);   // { med, tipo }
  const [kardex, setKardex]   = useState(null);   // med para histórico
  const [sub, setSub] = useState("dashboard");    // ver FARM_NAV
  const [saidasHist, setSaidasHist] = useState([]);
  const [invs, setInvs] = useState([]);
  const [, setTick] = useState(0);
  const isMaster = currentUser?.role === "adm_master";

  function refresh() {
    if (!sb) return;
    loadFarmMedicamentos(sb).then(setMeds);
    loadFarmLotes(sb).then(setLotes);
    loadFarmSaidasDesde(sb, new Date(Date.now() - FARM_PREV_JANELA * 86400000).toISOString()).then(setSaidasHist);
    loadFarmInventarios(sb).then(setInvs);
  }

  // Contagem de inventário da farmácia — mesma regra do almoxarifado, e de
  // propósito: `planejarAjuste` sabe tirar por FEFO, recusar sobra sem lote
  // escolhido e recusar falta maior que o saldo. Uma segunda cópia dessas
  // decisões divergiria da primeira na primeira regra que mudasse.
  //
  // ⚠️ `ajustado` só vira verdadeiro se o movimento ENTROU no kardex.
  // Marcar pela intenção era o defeito que fazia a acuracidade do
  // almoxarifado mentir para sempre — a contagem seguinte achava a mesma
  // divergência e "ajustava" de novo.
  async function salvarInventarioFarm(inv, plano = []) {
    const linha = await addFarmInventarioRemote(sb, { ...inv, ajustado: false }, currentUser);
    const med = meds.find(x => x.id === inv.medicamento_id);
    registrarAuditoria(sb, currentUser, "contagem de inventário (farmácia)",
      `${med?.nome || inv.medicamento_id} · sistema ${farmFmtQtd(inv.saldo_sistema)} → contado ${farmFmtQtd(inv.contado)}`, {});

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
      const r = await addFarmMovimentoRemote(sbCru, {
        medicamento_id: inv.medicamento_id, lote: p.lote, validade: p.validade || null,
        tipo: p.tipo, quantidade: p.quantidade,
        motivo: MOTIVO_AJUSTE, documento: doc,
      }, currentUser);
      if (r.ok) lancados++; else erros.push(`${p.lote || "sem lote"}: ${r.erro}`);
    }

    // Parcial conta como NÃO ajustado: se um dos passos falhou, o saldo não
    // chegou ao valor contado, e dizer "ajustado" seria a mesma mentira de
    // antes, só que menor.
    const completo = erros.length === 0;
    const marcou = await marcarFarmInventarioRemote(sb, linha.id, {
      ajustado: completo,
      autorizado_por: currentUser?.name || null,
      ajuste_erro: completo ? null : erros.join(" · ").slice(0, 500),
    });
    if (!marcou.ok) {
      alert(`O ajuste do estoque foi feito, mas o desfecho não pôde ser gravado na contagem ${doc}.` +
        String.fromCharCode(10, 10) + `${marcou.erro}` + String.fromCharCode(10, 10) +
        "O kardex está correto; a contagem é que ficou sem o registro de quem autorizou.");
    }
    if (!completo) {
      alert(`A contagem foi registrada, mas o ajuste do estoque NÃO foi concluído.` +
        String.fromCharCode(10, 10) + erros.join(String.fromCharCode(10)) + String.fromCharCode(10, 10) +
        (lancados ? `${lancados} de ${plano.length} lançamento(s) entraram — o saldo ficou entre o antigo e o contado.` + String.fromCharCode(10, 10) : "") +
        "O motivo ficou guardado na contagem. Confira e refaça.");
    }
    registrarAuditoria(sb, currentUser, completo ? "ajuste de inventário (farmácia)" : "ajuste de inventário RECUSADO (farmácia)",
      `${med?.nome || inv.medicamento_id} · ${doc} · ${descreverPlano(plano)}${completo ? "" : ` · ${erros.join(" · ")}`}`, {});
    setTimeout(refresh, 350);
    return { ok: completo, erro: erros.join(" · ") || null };
  }
  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => { window.removeEventListener("focus", onFocus); clearInterval(id); };
  }, []);

  const medsOrd = [...meds].filter(m => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    return [m.nome, m.principio_ativo, m.forma].some(x => (x || "").toLowerCase().includes(q));
  }).sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));

  const ordClasse = (a, b) => { const ia = FARM_CLASSES.indexOf(a), ib = FARM_CLASSES.indexOf(b); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b, "pt-BR"); };
  const classesPresentes = [...new Set(meds.map(m => m.classe || "Outros"))].sort(ordClasse);
  const medsView = medsOrd.filter(m => !classeFiltro || (m.classe || "Outros") === classeFiltro);
  const grupos = {};
  medsView.forEach(m => { const c = m.classe || "Outros"; (grupos[c] = grupos[c] || []).push(m); });
  const gruposOrd = Object.keys(grupos).sort(ordClasse);

  // Situação de estoque de cada medicamento — delega na regra única do sistema.
  const statusMed = m => farmStatusEstoque(m, lotes);
  // Lote de validade mais próxima (com saldo) de um medicamento
  function loteCritico(m) {
    const ls = lotes.filter(l => l.medicamento_id === m.id && Number(l.quantidade) > 0 && l.validade);
    if (!ls.length) return null;
    return ls.sort((a, b) => a.validade.localeCompare(b.validade))[0];
  }

  // Painéis de alerta
  // Deriva de `meds` (catálogo completo), NÃO de `medsOrd` — este último já vem
  // filtrado pela caixa de busca, o que fazia o KPI mudar ao digitar na busca.
  const alertasBaixo = meds.filter(m => m.ativo !== false && farmPrecisaRepor(m, lotes))
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
  const alertasZerados = alertasBaixo.filter(m => farmStatusEstoque(m, lotes).key === "zerado").length;
  const lotesAlerta = lotes.filter(l => Number(l.quantidade) > 0 && ["vencido", "vencendo"].includes(infoDeValidade(l.validade).status));

  // Previsão de demanda (consumo dos últimos FARM_PREV_JANELA dias)
  const consumoMap = {};
  saidasHist.forEach(s => { if (s.medicamento_id) consumoMap[s.medicamento_id] = (consumoMap[s.medicamento_id] || 0) + Number(s.quantidade || 0); });
  const consumoDia = m => (consumoMap[m.id] || 0) / FARM_PREV_JANELA;
  const previsao = m => {
    const media = consumoDia(m);
    const saldo = saldoDoMedicamento(m.id, lotes);
    const cobertura = media > 0 ? saldo / media : null;      // dias de estoque
    const demanda7 = media * FARM_PREV_HORIZONTE;
    const sugestao = Math.max(0, Math.ceil(demanda7 + Number(m.estoque_minimo || 0) - saldo));
    return { media, saldo, cobertura, demanda7, sugestao };
  };
  const emRisco = meds.filter(m => m.ativo !== false).map(m => ({ m, ...previsao(m) }))
    .filter(x => x.media > 0 && x.cobertura != null && x.cobertura < FARM_PREV_HORIZONTE)
    .sort((a, b) => a.cobertura - b.cobertura);

  async function salvarMed(med) {
    await upsertFarmMedicamentoRemote(sb, med, currentUser);
    registrarAuditoria(sb, currentUser, med.id ? "editar medicamento" : "cadastrar medicamento", med.nome, {});
    setShowMed(null);
    setTimeout(refresh, 350);
  }
  async function excluirMed(m) {
    if (!confirm(`Excluir "${m.nome}" e todo o seu histórico de estoque? Essa ação não pode ser desfeita.`)) return;
    await deleteFarmMedicamentoRemote(sb, m.id);
    registrarAuditoria(sb, currentUser, "excluir medicamento", m.nome, {});
    setTimeout(refresh, 300);
  }
  async function registrarMov(mov) {
    const r = await addFarmMovimentoRemote(sbCru, mov, currentUser);
    if (!r.ok) { alert("Não foi possível registrar o movimento.\n" + (r.erro || "")); return false; }
    const med = meds.find(x => x.id === mov.medicamento_id);
    registrarAuditoria(sb, currentUser, mov.tipo === "entrada" ? "entrada de estoque" : "saída de estoque", `${med?.nome || mov.medicamento_id} · ${farmFmtQtd(mov.quantidade)}`, {});
    setMovMed(null);
    setTimeout(refresh, 350);
    return true;
  }

  const totalItens = meds.length;
  const totalAtivos = meds.filter(m => m.ativo !== false).length;

  const navAtual = FARM_NAV.find(n => n.key === sub) || FARM_NAV[0];
  const subTexto = { dashboard: "Visão geral do setor com atalhos.", estoque: `Catálogo, entradas e saídas por lote e validade (FEFO). ${totalAtivos} ativos · ${totalItens} cadastrados.`, preparo: "Solicitações: receber a prescrição → separar (baixa de estoque) → marcar pronto → confirmar retirada.", dispensacao: "Dispensação de medicamentos a partir da prescrição do PS ou avulsa, com baixa de estoque.", analise: "Análise clínica das prescrições — alertas de duplicidade, dose, interação, alergia, sonda e adequação idoso/criança.", intervencao: "Intervenção farmacêutica — registrar o problema, propor a conduta e acompanhar o desfecho.", interacoes: "Base de interações medicamentosas e incompatibilidade em Y.", controlados: "Livro de controlados (Portaria 344): saldo, balanço mensal e movimentação.", naopad: "Medicamentos fora do catálogo trazidos pelo paciente/família.", indicadores: "Relatórios & BI — consumo, curva ABC, custos por paciente, controlados, rupturas.", assistente: "Assistente local para perguntas sobre o setor." };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* BARRA LATERAL DA FARMÁCIA */}
      <nav style={{ width: 194, minWidth: 194, background: "var(--bg-2)", borderRight: "1px solid var(--border)", padding: "1rem 0", overflowY: "auto", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px 12px" }}>
          <Icon name="pill" size={16} /><span style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".02em", color: VX.turquesa }}>FARMÁCIA</span>
        </div>
        {comGrupos(abasVisiveis(FARM_NAV, { podeControlados })).map(it => {
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{navAtual.label}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{subTexto[sub] || ""}</div>
        </div>
        {sub === "estoque" && canEdit && <button onClick={() => setShowMed({ nome: "", principio_ativo: "", classe: "", forma: "", concentracao: "", unidade: "unidade", estoque_minimo: "", controlado: false, ativo: true, observacao: "" })} style={{ background: VX.turquesa, color: "#062a26", border: "none", borderRadius: 6, padding: "9px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" }}>+ Novo medicamento</button>}
      </div>

      {sub === "dashboard" && <FarmDashboardView sb={sb} currentUser={currentUser} canEdit={canEdit} onNav={setSub} />}
      {sub === "interacoes" && <FarmInteracoesView sb={sb} currentUser={currentUser} canEdit={canEdit} />}
      {sub === "assistente" && <FarmAssistenteView sb={sb} />}
      {sub === "preparo" && <FarmPreparoView sb={sb} sbCru={sbCru} currentUser={currentUser} canEdit={canEdit} />}
      {sub === "dispensacao" && <FarmDispensacaoView sb={sb} sbCru={sbCru} currentUser={currentUser} canEdit={canEdit} />}
      {sub === "analise" && <FarmAnaliseView sb={sb} currentUser={currentUser} canEdit={canEdit} />}
      {sub === "intervencao" && <FarmIntervencaoView sb={sb} currentUser={currentUser} canEdit={canEdit} />}
      {sub === "controlados" && podeAbrirAba(sub, { podeControlados }) && <FarmControladosView sb={sb} />}
      {sub === "naopad" && <FarmNaoPadronizadosView sb={sb} currentUser={currentUser} canEdit={canEdit} />}
      {sub === "indicadores" && <FarmIndicadoresView sb={sb} />}
      {/* A MESMA view do almoxarifado, com a chave trocada. Contagem cega,
          curva ABC, acuracidade e conciliação são a mesma regra nos dois
          módulos — e duas cópias divergiriam na primeira mudança. */}
      {sub === "inventario" && (
        <SupInventarioView sb={sb} currentUser={currentUser} canEdit={canEdit}
          itens={meds.filter(m => m.ativo !== false)} lotes={lotes} saidasHist={saidasHist} invs={invs}
          onSave={salvarInventarioFarm}
          chave="medicamento_id" origem="farmacia" rotuloItem="Medicamento" />
      )}

      {sub === "estoque" && (<>
      {/* PAINÉIS DE ALERTA */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: "1.25rem" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${alertasBaixo.length ? "#d97706" : "#34d399"}`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Reposição</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: alertasBaixo.length ? "#d97706" : "var(--text)" }}>{alertasBaixo.length}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{alertasBaixo.length ? `${alertasZerados} sem saldo · ${alertasBaixo.length - alertasZerados} abaixo do mínimo` : "nenhum item para repor"}</div>
          {alertasBaixo.length > 0 && <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 5 }}>{alertasBaixo.slice(0, 6).map(m => <span key={m.id} style={{ fontSize: 10.5, color: statusMed(m).cor, border: `1px solid ${statusMed(m).cor}55`, borderRadius: 99, padding: "1px 7px" }}>{m.nome}</span>)}{alertasBaixo.length > 6 && <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>+{alertasBaixo.length - 6}</span>}</div>}
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${lotesAlerta.length ? "#f43f5e" : "#34d399"}`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Validade</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: lotesAlerta.length ? "#f43f5e" : "var(--text)" }}>{lotesAlerta.length}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{lotesAlerta.length ? `lotes vencidos ou vencendo em ${DIAS_VENCENDO} dias` : "nenhum lote vencendo"}</div>
          {lotesAlerta.length > 0 && <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>{lotesAlerta.slice(0, 4).map(l => { const m = meds.find(x => x.id === l.medicamento_id); const vi = infoDeValidade(l.validade); return <div key={l.id} style={{ fontSize: 11, color: "var(--text-2)" }}><span style={{ color: vi.status === "vencido" ? "#f43f5e" : "#d97706", fontWeight: 700 }}>{vi.status === "vencido" ? "vencido" : `${vi.dias}d`}</span> · {m?.nome || "?"} {l.lote ? `· lote ${l.lote}` : ""}</div>; })}{lotesAlerta.length > 4 && <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>+{lotesAlerta.length - 4}</span>}</div>}
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${emRisco.length ? "#f43f5e" : "#34d399"}`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Previsão de ruptura ({FARM_PREV_HORIZONTE}d)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: emRisco.length ? "#f43f5e" : "var(--text)" }}>{emRisco.length}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{emRisco.length ? `devem acabar em até ${FARM_PREV_HORIZONTE} dias (consumo dos últimos ${FARM_PREV_JANELA}d)` : "cobertura ≥ 7 dias em todos com consumo"}</div>
          {emRisco.length > 0 && <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>{emRisco.slice(0, 4).map(x => <div key={x.m.id} style={{ fontSize: 11, color: "var(--text-2)" }}><span style={{ color: x.cobertura <= 3 ? "#f43f5e" : "#d97706", fontWeight: 700 }}>{x.cobertura < 1 ? "<1d" : `${Math.floor(x.cobertura)}d`}</span> · {x.m.nome}</div>)}{emRisco.length > 4 && <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>+{emRisco.length - 4}</span>}</div>}
        </div>
      </div>

      {emRisco.length > 0 && (<>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Previsão de demanda — próximos {FARM_PREV_HORIZONTE} dias</div>
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10, marginBottom: "1.25rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
            <thead><tr style={{ background: "var(--surface-2)", textAlign: "left", color: "var(--text-3)", fontSize: 11, textTransform: "uppercase" }}>
              <th style={{ padding: "8px 12px" }}>Medicamento</th><th style={{ padding: "8px 12px", textAlign: "right" }}>Consumo/dia</th><th style={{ padding: "8px 12px", textAlign: "right" }}>Saldo</th><th style={{ padding: "8px 12px", textAlign: "right" }}>Cobertura</th><th style={{ padding: "8px 12px", textAlign: "right" }}>Demanda 7d</th><th style={{ padding: "8px 12px", textAlign: "right" }}>Comprar</th>
            </tr></thead>
            <tbody>
              {emRisco.map(x => (
                <tr key={x.m.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "7px 12px", fontWeight: 600 }}>{x.m.nome}</td>
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
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, princípio ativo ou forma…" style={{ ...campoTexto, maxWidth: 380, flex: "1 1 240px" }} />
        <select value={classeFiltro} onChange={e => setClasseFiltro(e.target.value)} style={{ ...campoTexto, maxWidth: 280 }}>
          <option value="">Todas as classes</option>
          {classesPresentes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* TABELA DE ESTOQUE (agrupada por classe terapêutica) */}
      {medsView.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>
          {meds.length === 0 ? "Nenhum medicamento cadastrado ainda. Clique em “+ Novo medicamento”." : "Nenhum resultado para a busca."}
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 720 }}>
            <thead>
              <tr style={{ background: "var(--surface-2)", textAlign: "left", color: "var(--text-3)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>
                <th style={{ padding: "9px 12px" }}>Medicamento</th>
                <th style={{ padding: "9px 12px" }}>Apresentação</th>
                <th style={{ padding: "9px 12px", textAlign: "right" }}>Saldo</th>
                <th style={{ padding: "9px 12px", textAlign: "right" }}>Mínimo</th>
                <th style={{ padding: "9px 12px" }}>Situação</th>
                <th style={{ padding: "9px 12px" }}>Validade</th>
                <th style={{ padding: "9px 12px", textAlign: "right" }}>Ações</th>
              </tr>
            </thead>
            {gruposOrd.map(classe => (
              <tbody key={classe}>
                {!classeFiltro && (
                  <tr><td colSpan={7} style={{ padding: "10px 12px 5px", background: "var(--surface-2)", borderTop: "1px solid var(--border)", fontSize: 11, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".05em" }}>{classe} <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>· {grupos[classe].length}</span></td></tr>
                )}
                {grupos[classe].map(m => {
                const st = statusMed(m);
                const lc = loteCritico(m);
                const vi = lc ? infoDeValidade(lc.validade) : null;
                const inativo = m.ativo === false;
                return (
                  <tr key={m.id} style={{ borderTop: "1px solid var(--border)", opacity: inativo ? 0.55 : 1 }}>
                    <td style={{ padding: "9px 12px" }}>
                      <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {m.nome}
                        {m.controlado && <span style={{ fontSize: 9.5, color: "#6366f1", border: "1px solid #6366f155", borderRadius: 99, padding: "0 6px", fontWeight: 800, letterSpacing: ".03em" }}>CONTROLADO</span>}
                        {inativo && <span style={{ fontSize: 9.5, color: "var(--text-muted)", border: "1px solid var(--border-2)", borderRadius: 99, padding: "0 6px" }}>inativo</span>}
                      </div>
                      {m.principio_ativo && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.principio_ativo}</div>}
                    </td>
                    <td style={{ padding: "9px 12px", color: "var(--text-2)" }}>{[m.forma, m.concentracao].filter(Boolean).join(" · ") || "—"}</td>
                    <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>{farmFmtQtd(st.saldo)} <span style={{ fontSize: 10.5, color: "var(--text-muted)", fontFamily: "Inter, sans-serif", fontWeight: 400 }}>{m.unidade || ""}</span></td>
                    <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{Number(m.estoque_minimo) > 0 ? farmFmtQtd(m.estoque_minimo) : "—"}</td>
                    <td style={{ padding: "9px 12px" }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 99, background: st.cor, marginRight: 6 }} /><span style={{ fontSize: 12, color: st.cor === "#34d399" ? "var(--text-2)" : st.cor, fontWeight: st.key === "ok" ? 400 : 700 }}>{st.label}</span></td>
                    <td style={{ padding: "9px 12px", fontSize: 12 }}>{lc ? <span style={{ color: vi.status === "vencido" ? "#f43f5e" : vi.status === "vencendo" ? "#d97706" : "var(--text-2)", fontWeight: vi.status === "ok" ? 400 : 700 }}>{fmtDataBR(lc.validade)}{vi.status === "vencido" ? " (vencido)" : vi.status === "vencendo" ? ` (${vi.dias}d)` : ""}</span> : <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                    <td style={{ padding: "9px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {canEdit && <>
                        <button onClick={() => setMovMed({ med: m, tipo: "entrada" })} style={btnContorno("#34d399")}>Entrada</button>{" "}
                        <button onClick={() => setMovMed({ med: m, tipo: "saida" })} style={btnContorno("#d97706")}>Saída</button>{" "}
                      </>}
                      <button onClick={() => setKardex(m)} style={btnContorno("#8d99ab")}>Kardex</button>{" "}
                      {canEdit && <button onClick={() => setShowMed(m)} style={btnContorno("#3b82f6")}>Editar</button>}
                      {isMaster && <> <button onClick={() => excluirMed(m)} style={btnContorno("#f43f5e")}>Excluir</button></>}
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

      {showMed && <FarmMedModal med={showMed} onClose={() => setShowMed(null)} onSave={salvarMed} />}
      {movMed && <FarmMovModal med={movMed.med} tipoInicial={movMed.tipo} lotes={lotes.filter(l => l.medicamento_id === movMed.med.id)} onClose={() => setMovMed(null)} onSave={registrarMov} />}
      {kardex && <FarmKardexModal sb={sb} sbCru={sbCru} med={kardex} currentUser={currentUser} canEdit={canEdit} onClose={() => setKardex(null)} />}
      </div>
    </div>
  );
}

// Cadastro / edição de medicamento
function FarmMedModal({ med, onClose, onSave }) {
  const [f, setF] = useState({ ...med });
  const [busy, setBusy] = useState(false);
  const [clinAberto, setClinAberto] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  async function salvar() {
    if (!f.nome.trim()) { alert("Informe o nome / apresentação do medicamento."); return; }
    setBusy(true);
    await onSave({
      ...(med.id ? { id: med.id } : {}),
      nome: f.nome.trim(),
      principio_ativo: f.principio_ativo?.trim() || null,
      classe: f.classe || null,
      forma: f.forma || null,
      concentracao: f.concentracao?.trim() || null,
      unidade: f.unidade || "unidade",
      estoque_minimo: f.estoque_minimo === "" || f.estoque_minimo == null ? 0 : Number(f.estoque_minimo),
      custo_unitario: f.custo_unitario === "" || f.custo_unitario == null ? null : Number(f.custo_unitario),
      controlado: !!f.controlado,
      ativo: f.ativo !== false,
      observacao: f.observacao?.trim() || null,
      grupo_terapeutico: f.grupo_terapeutico?.trim() || null,
      dose_maxima_dia: f.dose_maxima_dia === "" || f.dose_maxima_dia == null ? null : Number(f.dose_maxima_dia),
      dose_maxima_unid: f.dose_maxima_unid || null,
      duracao_maxima_dias: f.duracao_maxima_dias === "" || f.duracao_maxima_dias == null ? null : Number(f.duracao_maxima_dias),
      nao_triturar: !!f.nao_triturar,
      inapropriado_idoso: !!f.inapropriado_idoso,
      motivo_idoso: f.motivo_idoso?.trim() || null,
      inapropriado_pediatrico: !!f.inapropriado_pediatrico,
      motivo_pediatrico: f.motivo_pediatrico?.trim() || null,
      idade_pediatrica: f.idade_pediatrica === "" || f.idade_pediatrica == null ? null : Number(f.idade_pediatrica),
      ajuste_renal: f.ajuste_renal?.trim() || null,
      ajuste_hepatico: f.ajuste_hepatico?.trim() || null,
      obs_clinica: f.obs_clinica?.trim() || null,
    });
    setBusy(false);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 520, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>{med.id ? "Editar medicamento" : "Novo medicamento"}</div>
        <div style={{ marginBottom: 10 }}>
          <label style={rotuloCampo}>Nome / apresentação *</label>
          <input value={f.nome} onChange={e => set("nome", e.target.value)} placeholder="Ex.: Dipirona 500 mg comprimido" style={campoTexto} autoFocus />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={rotuloCampo}>Princípio ativo</label>
            <input value={f.principio_ativo || ""} onChange={e => set("principio_ativo", e.target.value)} placeholder="Ex.: Dipirona sódica" style={campoTexto} />
          </div>
          <div>
            <label style={rotuloCampo}>Classe terapêutica</label>
            <select value={f.classe || ""} onChange={e => set("classe", e.target.value)} style={campoTexto}>
              <option value="">—</option>
              {FARM_CLASSES.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={rotuloCampo}>Forma farmacêutica</label>
            <select value={f.forma || ""} onChange={e => set("forma", e.target.value)} style={campoTexto}>
              <option value="">—</option>
              {FARM_FORMAS.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div>
            <label style={rotuloCampo}>Concentração</label>
            <input value={f.concentracao || ""} onChange={e => set("concentracao", e.target.value)} placeholder="500 mg · 10 mg/mL" style={campoTexto} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={rotuloCampo}>Unidade de controle</label>
            <select value={f.unidade || "unidade"} onChange={e => set("unidade", e.target.value)} style={campoTexto}>
              {FARM_UNIDADES.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div>
            <label style={rotuloCampo}>Estoque mínimo</label>
            <input type="number" min="0" value={f.estoque_minimo ?? ""} onChange={e => set("estoque_minimo", e.target.value)} placeholder="0" style={campoTexto} />
          </div>
          <div>
            <label style={rotuloCampo}>Custo unit. (R$)</label>
            <input type="number" min="0" step="any" value={f.custo_unitario ?? ""} onChange={e => set("custo_unitario", e.target.value)} placeholder="0,00" style={campoTexto} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 18, alignItems: "center", marginBottom: 12 }}>
          <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13, color: "var(--text-2)", cursor: "pointer" }}>
            <input type="checkbox" checked={!!f.controlado} onChange={e => set("controlado", e.target.checked)} style={{ accentColor: "#6366f1", width: 15, height: 15 }} /> Controlado (Portaria 344)
          </label>
          <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13, color: "var(--text-2)", cursor: "pointer" }}>
            <input type="checkbox" checked={f.ativo !== false} onChange={e => set("ativo", e.target.checked)} style={{ accentColor: "#34d399", width: 15, height: 15 }} /> Ativo
          </label>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={rotuloCampo}>Observação</label>
          <textarea value={f.observacao || ""} onChange={e => set("observacao", e.target.value)} rows={2} placeholder="Cuidados, armazenamento, etc." style={{ ...campoTexto, resize: "vertical" }} />
        </div>

        {/* Atributos de farmácia clínica (base dos alertas) */}
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, marginBottom: 16 }}>
          <button onClick={() => setClinAberto(a => !a)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", padding: "10px 12px", cursor: "pointer", color: "var(--text-2)", textAlign: "left" }}>
            <span style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>Atributos de farmácia clínica (base dos alertas)</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{clinAberto ? "▾" : "▸"}</span>
          </button>
          {clinAberto && (
            <div style={{ padding: "0 12px 12px" }}>
              <div style={{ marginBottom: 8 }}>
                <label style={rotuloCampo}>Grupo terapêutico (p/ duplicidade)</label>
                <input value={f.grupo_terapeutico || ""} onChange={e => set("grupo_terapeutico", e.target.value)} placeholder="Ex.: AINE, IBP, Opioide" style={campoTexto} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                <div><label style={rotuloCampo}>Dose máx./dia</label><input type="number" min="0" step="any" value={f.dose_maxima_dia ?? ""} onChange={e => set("dose_maxima_dia", e.target.value)} placeholder="4000" style={campoTexto} /></div>
                <div><label style={rotuloCampo}>Unid.</label><select value={f.dose_maxima_unid || ""} onChange={e => set("dose_maxima_unid", e.target.value)} style={campoTexto}><option value="">—</option>{PS_DOSE_UNID.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
                <div><label style={rotuloCampo}>Duração máx. (dias)</label><input type="number" min="0" value={f.duracao_maxima_dias ?? ""} onChange={e => set("duracao_maxima_dias", e.target.value)} placeholder="—" style={campoTexto} /></div>
              </div>
              <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13, color: "var(--text-2)", cursor: "pointer", marginBottom: 8 }}>
                <input type="checkbox" checked={!!f.nao_triturar} onChange={e => set("nao_triturar", e.target.checked)} style={{ accentColor: "#d97706", width: 15, height: 15 }} /> Não triturar / contraindicado por sonda
              </label>
              <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13, color: "var(--text-2)", cursor: "pointer", marginBottom: 4 }}>
                <input type="checkbox" checked={!!f.inapropriado_idoso} onChange={e => set("inapropriado_idoso", e.target.checked)} style={{ accentColor: "#d97706", width: 15, height: 15 }} /> Inapropriado para idoso (Beers)
              </label>
              {f.inapropriado_idoso && <input value={f.motivo_idoso || ""} onChange={e => set("motivo_idoso", e.target.value)} placeholder="Motivo (Beers)" style={{ ...campoTexto, marginBottom: 8 }} />}
              <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13, color: "var(--text-2)", cursor: "pointer", marginBottom: 4 }}>
                <input type="checkbox" checked={!!f.inapropriado_pediatrico} onChange={e => set("inapropriado_pediatrico", e.target.checked)} style={{ accentColor: "#d97706", width: 15, height: 15 }} /> Inapropriado para criança
              </label>
              {f.inapropriado_pediatrico && (
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, marginBottom: 8 }}>
                  <input value={f.motivo_pediatrico || ""} onChange={e => set("motivo_pediatrico", e.target.value)} placeholder="Motivo" style={campoTexto} />
                  <input type="number" min="0" value={f.idade_pediatrica ?? ""} onChange={e => set("idade_pediatrica", e.target.value)} placeholder="< anos (12)" style={campoTexto} />
                </div>
              )}
              <div style={{ marginBottom: 8 }}><label style={rotuloCampo}>Ajuste pela função renal (ClCr &lt; 60)</label><input value={f.ajuste_renal || ""} onChange={e => set("ajuste_renal", e.target.value)} placeholder="Ex.: reduzir dose se ClCr < 30; nefrotóxico" style={campoTexto} /></div>
              <div style={{ marginBottom: 8 }}><label style={rotuloCampo}>Ajuste pela função hepática (moderada/grave)</label><input value={f.ajuste_hepatico || ""} onChange={e => set("ajuste_hepatico", e.target.value)} placeholder="Ex.: reduzir dose na hepatopatia" style={campoTexto} /></div>
              <div><label style={rotuloCampo}>Observação clínica (ex.: como administrar por sonda)</label><textarea value={f.obs_clinica || ""} onChange={e => set("obs_clinica", e.target.value)} rows={2} placeholder="Ex.: abrir a cápsula, não triturar os grânulos" style={{ ...campoTexto, resize: "vertical" }} /></div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>Estes campos alimentam os alertas de farmácia clínica. Revise com a equipe.</div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={salvar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}

// Entrada / saída de estoque
function FarmMovModal({ med, tipoInicial, lotes, onClose, onSave }) {
  const [tipo, setTipo] = useState(tipoInicial || "entrada");
  const [f, setF] = useState({
    lote: "", validade: "", quantidade: "", documento: "",
    lote_id: "", motivo: "Dispensação",
  });
  const [busy, setBusy] = useState(false);
  // 🔴 A ordem e a SUGESTÃO dependem do motivo. Para dispensar, o vencido
  // nunca é sugerido; para descartar, ele É o alvo — sugerir o válido faria
  // dar baixa no lote errado. Ver farmacia/validade.js.
  const escolha = lotesParaEscolha(lotes, { motivo: f.motivo });
  const lotesComSaldo = escolha.lotes;
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  // Sem escolha explícita, vale o sugerido do motivo atual.
  const loteEfetivo = f.lote_id || (escolha.sugerido?.id ? String(escolha.sugerido.id) : "");
  const loteSel = lotesComSaldo.find(l => String(l.id) === String(loteEfetivo));

  async function salvar() {
    const q = Number(f.quantidade);
    if (!q || q <= 0) { alert("Informe uma quantidade maior que zero."); return; }
    let mov;
    if (tipo === "entrada") {
      mov = { medicamento_id: med.id, tipo: "entrada", quantidade: q, lote: f.lote.trim() || null, validade: f.validade || null, motivo: "Compra / nota fiscal", documento: f.documento.trim() || null };
    } else {
      if (!loteSel) { alert("Selecione o lote de onde sairá o medicamento."); return; }
      if (q > Number(loteSel.quantidade)) { alert(`Saída maior que o saldo do lote (disponível: ${farmFmtQtd(loteSel.quantidade)}).`); return; }
      const v = podeSair({ lote: loteSel, motivo: f.motivo });
      if (!v.ok) { alert("⚠ " + v.erros.join(" ")); return; }
      if (v.avisos.length && !confirm(`${v.avisos.join("\n\n")}\n\nRegistrar a saída assim mesmo?`)) return;
      mov = { medicamento_id: med.id, tipo: "saida", quantidade: q, lote: loteSel.lote || null, validade: loteSel.validade || null, motivo: f.motivo, documento: f.documento.trim() || null };
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
        <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 14 }}>{med.nome}{med.unidade ? ` · em ${med.unidade}` : ""}</div>

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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div><label style={rotuloCampo}>Quantidade *</label><input type="number" min="0" step="any" value={f.quantidade} onChange={e => set("quantidade", e.target.value)} placeholder="0" style={campoTexto} autoFocus /></div>
            <div><label style={rotuloCampo}>Nota fiscal / documento</label><input value={f.documento} onChange={e => set("documento", e.target.value)} placeholder="Nº NF" style={campoTexto} /></div>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.5 }}>Sem lote/validade? Deixe em branco — entra num lote genérico. Lançar por lote permite rastrear vencimento e recall.</div>
        </>) : (<>
          {lotesComSaldo.length === 0 ? (
            <div style={{ fontSize: 13, color: "#f43f5e", background: "#f43f5e12", border: "1px solid #f43f5e44", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>Não há saldo em estoque para dar baixa. Registre uma entrada primeiro.</div>
          ) : (<>
            <div style={{ marginBottom: 10 }}>
              <label style={rotuloCampo}>Lote{escolha.temVencido ? " — vencido não é sugerido" : " (FEFO — vence primeiro no topo)"}</label>
              <select value={loteEfetivo} onChange={e => set("lote_id", e.target.value)} style={campoTexto}>
                {lotesComSaldo.map(l => { const vi = infoDeValidade(l.validade); return <option key={l.id} value={l.id}>{(l.lote || "sem lote")} · val {l.validade ? fmtDataBR(l.validade) : "—"}{vi.status === "vencido" ? " (VENCIDO)" : ""} · saldo {farmFmtQtd(l.quantidade)}</option>; })}
              </select>
            </div>
            {loteSel && situacaoDoLote(loteSel.validade).vencido && (
              <div style={{ fontSize: 11.5, marginBottom: 10, fontWeight: 600,
                            color: f.motivo === "Dispensação" ? "#f43f5e" : "#d97706" }}>
                {f.motivo === "Dispensação"
                  ? "⚠ Lote VENCIDO — não pode ser dispensado. Troque o motivo para “Perda / vencimento” para tirá-lo do estoque."
                  : "Lote vencido saindo por baixa — é assim que ele deixa a prateleira. Guarde o comprovante do descarte."}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div><label style={rotuloCampo}>Quantidade *</label><input type="number" min="0" step="any" value={f.quantidade} onChange={e => set("quantidade", e.target.value)} placeholder="0" style={campoTexto} autoFocus /></div>
              <div><label style={rotuloCampo}>Motivo</label><select value={f.motivo} onChange={e => set("motivo", e.target.value)} style={campoTexto}>{FARM_MOTIVOS_SAIDA.map(x => <option key={x} value={x}>{x}</option>)}</select></div>
            </div>
            {loteSel && <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 16 }}>Saldo do lote: <strong style={{ color: "var(--text-2)" }}>{farmFmtQtd(loteSel.quantidade)} {med.unidade || ""}</strong></div>}
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

// Kardex — histórico de movimentos do medicamento
function FarmKardexModal({ sb, sbCru, med, currentUser, canEdit, onClose }) {
  const [movs, setMovs] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const recarregar = () => loadFarmMovimentos(sb, med.id).then(setMovs);
  useEffect(() => { recarregar(); }, [med.id]);
  const jaEstornados = idsJaEstornados(movs || []);

  // O kardex é append-only, então desfazer é criar o movimento oposto
  // APONTANDO para o original — nunca apagar. O banco garante que cada
  // movimento só é estornado uma vez (índice único em `estorno_de`) e que o
  // estorno é mesmo o oposto (mesmo medicamento, lote e quantidade).
  //
  // `copiar` leva o paciente junto: sem isso a devolução entra no kardex
  // como entrada anônima, e o rastro se perde no lugar em que ele é
  // obrigatório — que numa farmácia é o motivo de o kardex existir.
  async function estornar(mv) {
    const pode = podeEstornar(mv, jaEstornados);
    if (!pode.ok) { alert(pode.motivo); return; }
    const oposto = mv.tipo === "entrada" ? "saída" : "entrada";
    if (!confirm(
      `Estornar este movimento?${String.fromCharCode(10, 10)}` +
      `${mv.tipo === "entrada" ? "Entrada" : "Saída"} de ${farmFmtQtd(mv.quantidade)}` +
      `${mv.lote ? ` no lote ${mv.lote}` : ""} — ${med.nome}` +
      `${mv.paciente_iniciais ? ` · ${mv.paciente_iniciais}` : ""}${String.fromCharCode(10, 10)}` +
      `Será criada uma ${oposto} de ${farmFmtQtd(mv.quantidade)} no mesmo lote. ` +
      `O movimento original permanece no histórico: estorno não apaga nada.`
    )) return;
    setOcupado(true);
    const r = await addFarmMovimentoRemote(sbCru, 
      movimentoDeEstorno(mv, { chave: "medicamento_id", copiar: ["paciente_iniciais", "paciente_prontuario", "setor", "atendimento_id", "prescricao_item_id"] }),
      currentUser);
    setOcupado(false);
    if (!r.ok) { alert("Não foi possível estornar." + String.fromCharCode(10, 10) + (r.erro || "")); return; }
    registrarAuditoria(sb, currentUser, "estorno de movimento (farmácia)",
      `${med.nome} · desfaz #${mv.id} (${mv.tipo} ${farmFmtQtd(mv.quantidade)}${mv.lote ? ` lote ${mv.lote}` : ""})`, {});
    recarregar();
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 600, maxWidth: "94vw", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Kardex — {med.nome}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>Histórico de entradas e saídas (imutável). Últimos movimentos.</div>
        {movs == null ? <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "1.5rem" }}>Carregando…</div>
          : movs.length === 0 ? <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "1.5rem" }}>Nenhum movimento registrado ainda.</div>
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {movs.map(mv => {
                const ent = mv.tipo === "entrada";
                const cor = ent ? "#34d399" : "#d97706";
                return (
                  <div key={mv.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px" }}>
                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 800, color: cor, fontSize: 14, minWidth: 62, textAlign: "right" }}>{ent ? "+" : "−"}{farmFmtQtd(mv.quantidade)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>{ent ? "Entrada" : "Saída"} · {mv.motivo || "—"}{mv.lote ? ` · lote ${mv.lote}` : ""}{mv.paciente_iniciais ? ` · ${mv.paciente_iniciais}` : ""}
                        {mv.estorno_de != null && <span title={`Desfaz o movimento #${mv.estorno_de}`} style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: VX.azul, border: `1px solid ${VX.azul}55`, borderRadius: 99, padding: "0 7px" }}>estorno de #{mv.estorno_de}</span>}
                        {jaEstornados.has(mv.id) && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: "var(--text-muted)", border: "1px solid var(--border-2)", borderRadius: 99, padding: "0 7px" }}>estornado</span>}
                      </div>
                      <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{mv.created_at ? new Date(mv.created_at).toLocaleString("pt-BR") : ""}{mv.documento ? ` · doc ${mv.documento}` : ""}{mv.usuario ? ` · ${mv.usuario}` : ""}</div>
                    </div>
                    {canEdit && !jaEstornados.has(mv.id) && (
                      <button onClick={() => estornar(mv)} disabled={ocupado} title="Cria o movimento oposto apontando para este. Não apaga nada."
                        style={{ background: "transparent", color: "var(--text-3)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: ocupado ? "default" : "pointer", flexShrink: 0 }}>Estornar</button>
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

// Dispensação — fila do PS (prescrição estruturada) + avulsa, com baixa de estoque
function FarmDispensacaoView({ sb, sbCru, currentUser, canEdit }) {
  const [atends, setAtends] = useState([]);
  const [itens, setItens] = useState([]);
  const [saidas, setSaidas] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [meds, setMeds] = useState([]);
  const [interacoes, setInteracoes] = useState([]);
  const [incompatY, setIncompatY] = useState([]);
  const [busca, setBusca] = useState("");
  const [fSit, setFSit] = useState("");         // situação Manchester
  const [fStatus, setFStatus] = useState("");   // "" | pendentes | dispensados
  const [fScore, setFScore] = useState("");     // "" | 1 | 2 | 3 (mínimo)
  const [fAlerta, setFAlerta] = useState("");   // "" | tipo de alerta
  const [fControl, setFControl] = useState(false);
  const [ordem, setOrdem] = useState("prioridade"); // prioridade | score | nome | chegada
  const [disp, setDisp] = useState(null);       // atendimento selecionado p/ dispensar
  const [avulsa, setAvulsa] = useState(false);
  const [, setTick] = useState(0);

  function refresh() {
    if (!sb) return;
    loadPsAtendimentos(sb).then(async ats => {
      setAtends(ats);
      const ids = ats.map(a => a.id);
      setItens(await loadPsPrescricaoItensByAtendimentos(sb, ids));
      setSaidas(await loadFarmSaidasByAtendimentos(sb, ids));
    });
    loadFarmLotes(sb).then(setLotes);
    loadFarmMedicamentos(sb).then(setMeds);
    loadFarmInteracoes(sb).then(setInteracoes);
    loadFarmIncompatY(sb).then(setIncompatY);
  }
  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => { window.removeEventListener("focus", onFocus); clearInterval(id); };
  }, []);

  const medById = {}; meds.forEach(m => medById[m.id] = m);
  const dispDoItem = itemId => saidas.filter(s => s.prescricao_item_id === itemId).reduce((a, s) => a + Number(s.quantidade || 0), 0);
  const q = busca.trim().toLowerCase();
  const todas = atends.map(a => {
    const its = itens.filter(i => i.atendimento_id === a.id);
    const pend = its.filter(i => { if (!i.medicamento_id) return false; const q = Number(i.quantidade || 0); const d = dispDoItem(i.id); return q > 0 ? d < q : d <= 0; });
    const ctx = { idade: a.idade, peso: a.peso, clearance_renal: a.clearance_renal, funcao_hepatica: a.funcao_hepatica, alergias: a.alergias, em_sonda: a.em_sonda, gestante: a.gestante, comorbidades: a.comorbidades };
    const alertas = analisarPrescricaoClinica(its, ctx, medById, interacoes, incompatY);
    const tipos = new Set(alertas.map(x => x.tipo));
    const temControlado = its.some(i => medById[i.medicamento_id]?.controlado);
    const custoDisp = saidas.filter(s => s.atendimento_id === a.id).reduce((sum, s) => sum + Number(s.quantidade || 0) * custoUnit(medById[s.medicamento_id]), 0);
    return { at: a, itens: its, pendentes: pend.length, alertas, tipos, temControlado, custoDisp, score: scorePrescricao(its, alertas), prio: PS_PRIORIDADE[a.classificacao] ?? 5 };
  }).filter(x => x.itens.length > 0);

  const fila = todas.filter(x => {
    if (q && !`${x.at.iniciais} ${x.at.prontuario || ""}`.toLowerCase().includes(q)) return false;
    if (fSit && x.at.classificacao !== fSit) return false;
    if (fStatus === "pendentes" && x.pendentes === 0) return false;
    if (fStatus === "dispensados" && x.pendentes > 0) return false;
    if (fScore && x.score < Number(fScore)) return false;
    if (fAlerta && !x.tipos.has(fAlerta)) return false;
    if (fControl && !x.temControlado) return false;
    return true;
  }).sort((a, b) => {
    if (ordem === "score") return b.score - a.score || a.prio - b.prio;
    if (ordem === "nome") return (a.at.iniciais || "").localeCompare(b.at.iniciais || "", "pt-BR");
    if (ordem === "chegada") return (a.at.chegada_em || "").localeCompare(b.at.chegada_em || "");
    // prioridade (padrão): pendentes primeiro → Manchester → score → pendências
    return (a.pendentes ? 0 : 1) - (b.pendentes ? 0 : 1) || a.prio - b.prio || b.score - a.score || b.pendentes - a.pendentes;
  });
  const comPendencia = todas.filter(f => f.pendentes > 0);
  const filtroAtivo = busca || fSit || fStatus || fScore || fAlerta || fControl;
  function limparFiltros() { setBusca(""); setFSit(""); setFStatus(""); setFScore(""); setFAlerta(""); setFControl(false); }

  async function registrarDispensacao(mov) {
    const r = await addFarmMovimentoRemote(sbCru, mov, currentUser);
    if (!r.ok) { alert("Não foi possível dispensar.\n" + (r.erro || "")); return false; }
    const med = meds.find(m => m.id === mov.medicamento_id);
    registrarAuditoria(sb, currentUser, "dispensação farmácia", `${mov.paciente_iniciais || "?"} · ${med?.nome || mov.medicamento_id} · ${farmFmtQtd(mov.quantidade)}`, {});
    setTimeout(refresh, 350);
    return true;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{comPendencia.length} paciente(s) do PS com itens pendentes · fila priorizada por gravidade (Manchester) e score.</div>
        {canEdit && <button onClick={() => setAvulsa(true)} style={{ background: "transparent", color: "var(--text-2)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Dispensação avulsa</button>}
      </div>
      {(() => { const fsel = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 9px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 12.5, outline: "none" }; return (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14, padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar iniciais/prontuário…" style={{ ...fsel, flex: "1 1 180px", minWidth: 150 }} />
        <select value={fSit} onChange={e => setFSit(e.target.value)} style={fsel} title="Situação (Manchester)">
          <option value="">Situação: todas</option>
          {Object.entries(MANCHESTER).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={fsel} title="Status da dispensação">
          <option value="">Status: todos</option>
          <option value="pendentes">Pendentes</option>
          <option value="dispensados">Dispensados</option>
        </select>
        <select value={fScore} onChange={e => setFScore(e.target.value)} style={fsel} title="Score mínimo">
          <option value="">Score: qualquer</option>
          <option value="1">Score ≥ 1</option>
          <option value="2">Score ≥ 2</option>
          <option value="3">Score 3 (crítico)</option>
        </select>
        <select value={fAlerta} onChange={e => setFAlerta(e.target.value)} style={fsel} title="Tipo de alerta">
          <option value="">Alerta: qualquer</option>
          {Object.entries(FARM_ALERTA_TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={ordem} onChange={e => setOrdem(e.target.value)} style={fsel} title="Ordenar por">
          <option value="prioridade">Ordenar: prioridade</option>
          <option value="score">Ordenar: score</option>
          <option value="nome">Ordenar: nome</option>
          <option value="chegada">Ordenar: chegada</option>
        </select>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--text-2)", cursor: "pointer" }}>
          <input type="checkbox" checked={fControl} onChange={e => setFControl(e.target.checked)} style={{ accentColor: "#6366f1", width: 15, height: 15 }} /> Só controlados
        </label>
        <span style={{ fontSize: 11.5, color: "var(--text-muted)", marginLeft: "auto" }}>{fila.length} de {todas.length}</span>
        {filtroAtivo && <button onClick={limparFiltros} style={{ background: "transparent", color: "var(--text-3)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "6px 12px", fontWeight: 600, cursor: "pointer", fontSize: 12 }}>Limpar</button>}
      </div>
      ); })()}
      {fila.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>{todas.length ? "Nenhuma prescrição bate com os filtros." : "Nenhuma prescrição com itens no PS no momento. Prescreva pelo Pronto-Socorro (aba Prescrição) — ou use a dispensação avulsa."}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
          {fila.map(f => {
            const mc = f.at.classificacao && MANCHESTER[f.at.classificacao];
            return (
            <div key={f.at.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${mc ? mc.cor : f.pendentes ? "#d97706" : "#34d399"}`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ fontWeight: 700, flex: 1, minWidth: 0 }}>{f.at.iniciais}{f.at.prontuario ? ` · reg. ${f.at.prontuario}` : ""}</div>
                <span title={`Score da prescrição: ${f.score}/3`} style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: FARM_SCORE_COR[f.score], borderRadius: 6, padding: "1px 8px", whiteSpace: "nowrap" }}>score {f.score}</span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "4px 0 8px" }}>
                {mc && <span style={{ color: mc.cor, fontWeight: 700 }}>{mc.label}</span>}{mc ? " · " : ""}{f.itens.length} item(ns) · <span style={{ color: f.pendentes ? "#d97706" : "#34d399", fontWeight: 700 }}>{f.pendentes ? `${f.pendentes} pendente(s)` : "dispensado"}</span>{f.temControlado ? <span style={{ color: "#6366f1", fontWeight: 700 }}> · controlado</span> : ""}{f.custoDisp > 0 ? <span style={{ color: "#0d9488", fontWeight: 700 }}> · {fmtReais(f.custoDisp)}</span> : ""}
              </div>
              {[...f.tipos].length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                  {[...f.tipos].map(t => { const g = f.alertas.find(a => a.tipo === t)?.gravidade || "baixa"; const cor = FARM_GRAV[g].cor; return <span key={t} style={{ fontSize: 9.5, fontWeight: 700, color: cor, border: `1px solid ${cor}55`, borderRadius: 99, padding: "0 6px" }}>{FARM_ALERTA_TIPOS[t] || t}</span>; })}
                </div>
              )}
              {canEdit && <button onClick={() => setDisp(f.at)} style={{ background: f.pendentes ? "#22d3ee" : "transparent", color: f.pendentes ? "#000" : "var(--text-3)", border: f.pendentes ? "none" : "1px solid var(--border)", borderRadius: 6, padding: "7px 14px", fontWeight: 700, cursor: "pointer", fontSize: 12.5 }}>{f.pendentes ? "Dispensar" : "Ver itens"}</button>}
            </div>
          );})}
        </div>
      )}
      {disp && <FarmDispensarModal atendimento={disp} itens={itens.filter(i => i.atendimento_id === disp.id)} saidas={saidas} lotes={lotes} alertas={(fila.find(f => f.at.id === disp.id) || {}).alertas || []} onClose={() => setDisp(null)} onDispensar={registrarDispensacao} />}
      {avulsa && <FarmAvulsaModal meds={meds} lotes={lotes} onClose={() => setAvulsa(false)} onDispensar={registrarDispensacao} />}
    </div>
  );
}

// Dispensar os itens da prescrição de um paciente do PS
function FarmDispensarModal({ atendimento, itens, saidas, lotes, alertas = [], onClose, onDispensar }) {
  const [selItem, setSelItem] = useState(null);   // item aberto p/ dispensar (com _lotes)
  const [f, setF] = useState({ lote_id: "", quantidade: "" });
  const [busy, setBusy] = useState(false);
  const dispDoItem = itemId => saidas.filter(s => s.prescricao_item_id === itemId).reduce((a, s) => a + Number(s.quantidade || 0), 0);

  function abrir(item) {
    // 🔴 O vencido NÃO é mais a sugestão. FEFO segue entre os válidos.
    const esc = lotesParaEscolha(lotes.filter(l => String(l.medicamento_id) === String(item.medicamento_id)), { motivo: "Dispensação" });
    const ls = esc.lotes;
    const q = Number(item.quantidade || 0);
    const sugestao = q > 0 ? Math.max(0, q - dispDoItem(item.id)) : (Number(item.dose_valor) || "");
    setSelItem({ ...item, _lotes: ls });
    setF({ lote_id: ls[0]?.id || "", quantidade: sugestao || "" });
  }
  async function confirmar() {
    const q = Number(f.quantidade);
    if (!q || q <= 0) { alert("Informe a quantidade a dispensar."); return; }
    const lote = selItem._lotes.find(l => String(l.id) === String(f.lote_id));
    if (!lote) { alert("Sem lote em estoque para este medicamento. Registre uma entrada no Estoque."); return; }
    if (q > Number(lote.quantidade)) { alert(`Maior que o saldo do lote (disponível: ${farmFmtQtd(lote.quantidade)}).`); return; }
    const v = podeSair({ lote, motivo: "Dispensação" });
    if (!v.ok) { alert("⚠ " + v.erros.join(" ")); return; }
    if (v.avisos.length && !confirm(`${v.avisos.join("\n\n")}\n\nDispensar assim mesmo?`)) return;
    setBusy(true);
    const ok = await onDispensar({ medicamento_id: selItem.medicamento_id, tipo: "saida", quantidade: q, lote: lote.lote || null, validade: lote.validade || null, motivo: "Dispensação", atendimento_id: atendimento.id, prescricao_item_id: selItem.id, paciente_iniciais: atendimento.iniciais || null, paciente_prontuario: atendimento.prontuario || null });
    setBusy(false);
    if (ok) setSelItem(null);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 620, maxWidth: "96vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Dispensar — {atendimento.iniciais}{atendimento.prontuario ? ` · reg. ${atendimento.prontuario}` : ""}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>Itens prescritos no PS. A baixa é feita por lote (o que vence antes é sugerido).</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {itens.length === 0 && <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "1rem" }}>Sem itens estruturados nesta prescrição.</div>}
          {itens.map(it => {
            const q = Number(it.quantidade || 0);
            const disp = dispDoItem(it.id);
            const pend = Math.max(0, q - disp);
            const semVinculo = !it.medicamento_id;
            const podeDispensar = !semVinculo && (q > 0 ? pend > 0 : disp <= 0);
            const st = semVinculo ? { c: "#8d99ab", t: "item livre" }
              : q > 0 ? (pend <= 0 ? { c: "#34d399", t: "dispensado" } : disp > 0 ? { c: "#d97706", t: `parcial ${farmFmtQtd(disp)}/${farmFmtQtd(q)}` } : { c: "#8d99ab", t: "a dispensar" })
              : (disp > 0 ? { c: "#34d399", t: `dispensado ${farmFmtQtd(disp)}` } : { c: "#8d99ab", t: "a dispensar" });
            const aberto = selItem?.id === it.id;
            return (
              <div key={it.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 13px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span title={`Score do item: ${scoreItemClinico(it, alertas)}/3`} style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", background: FARM_SCORE_COR[scoreItemClinico(it, alertas)], borderRadius: 5, padding: "1px 6px", flexShrink: 0 }}>{scoreItemClinico(it, alertas)}</span>
                  <div style={{ flex: 1, minWidth: 150 }}>
                    <strong style={{ fontSize: 13 }}>{it.medicamento_nome}</strong>
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{it.dose ? `${it.dose} · ` : ""}{it.via || ""}{q ? ` · prescrito ${farmFmtQtd(q)} ${it.unidade || ""}` : ""}</div>
                  </div>
                  <span style={{ fontSize: 11, color: st.c, fontWeight: 700 }}>{st.t}</span>
                  {podeDispensar && <button onClick={() => aberto ? setSelItem(null) : abrir(it)} style={btnContorno("#22d3ee")}>{aberto ? "Fechar" : "Dispensar"}</button>}
                  {semVinculo && <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>item livre — baixa avulsa</span>}
                </div>
                {aberto && (
                  <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                    {selItem._lotes.length === 0 ? (
                      <div style={{ fontSize: 12.5, color: "#f43f5e" }}>Sem estoque deste medicamento. Registre uma entrada no Estoque.</div>
                    ) : (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                        <div style={{ flex: "2 1 220px" }}>
                          <label style={rotuloCampo}>Lote (FEFO)</label>
                          {/* `f.lote_id`, e não um `loteEfetivo` como nos outros dois
                              modais: aqui o `abrir()` JÁ semeia o lote com o primeiro
                              da ordem FEFO, e é `f.lote_id` que o `confirmar()` lê.
                              Mostrar no select um valor diferente do que a baixa usa
                              faria o farmacêutico ver um lote e o estoque sair de outro. */}
                          <select value={f.lote_id} onChange={e => setF(p => ({ ...p, lote_id: e.target.value }))} style={campoTexto}>
                            {selItem._lotes.map(l => { const vi = infoDeValidade(l.validade); return <option key={l.id} value={l.id}>{(l.lote || "sem lote")} · val {l.validade ? fmtDataBR(l.validade) : "—"}{vi.status === "vencido" ? " (VENCIDO)" : ""} · saldo {farmFmtQtd(l.quantidade)}</option>; })}
                          </select>
                        </div>
                        <div style={{ flex: "0 1 100px" }}>
                          <label style={rotuloCampo}>Qtd</label>
                          <input type="number" min="0" step="any" value={f.quantidade} onChange={e => setF(p => ({ ...p, quantidade: e.target.value }))} style={campoTexto} />
                        </div>
                        <button onClick={confirmar} disabled={busy} style={{ background: "#34d399", color: "#000", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Confirmar baixa"}</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// Dispensação avulsa (paciente digitado — ex.: internado no leito)
function FarmAvulsaModal({ meds, lotes, onClose, onDispensar }) {
  const [f, setF] = useState({ iniciais: "", prontuario: "", setor: "", medId: "", lote_id: "", quantidade: "" });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const escAvulsa = lotesParaEscolha(f.medId ? lotes.filter(l => String(l.medicamento_id) === String(f.medId)) : [], { motivo: "Dispensação" });
  const lotesMed = escAvulsa.lotes;
  const loteEfetivo = f.lote_id || (escAvulsa.sugerido?.id ? String(escAvulsa.sugerido.id) : "");

  async function confirmar() {
    if (!f.iniciais.trim()) { alert("Informe as iniciais do paciente."); return; }
    const med = meds.find(m => String(m.id) === String(f.medId));
    if (!med) { alert("Escolha o medicamento."); return; }
    const lote = lotesMed.find(l => String(l.id) === String(loteEfetivo));
    if (!lote) { alert("Sem lote em estoque para este medicamento. Registre uma entrada no Estoque."); return; }
    const q = Number(f.quantidade);
    if (!q || q <= 0) { alert("Informe a quantidade."); return; }
    if (q > Number(lote.quantidade)) { alert(`Maior que o saldo do lote (disponível: ${farmFmtQtd(lote.quantidade)}).`); return; }
    const v = podeSair({ lote, motivo: "Dispensação" });
    if (!v.ok) { alert("⚠ " + v.erros.join(" ")); return; }
    if (v.avisos.length && !confirm(`${v.avisos.join("\n\n")}\n\nDispensar assim mesmo?`)) return;
    setBusy(true);
    const ok = await onDispensar({ medicamento_id: med.id, tipo: "saida", quantidade: q, lote: lote.lote || null, validade: lote.validade || null, motivo: "Dispensação", paciente_iniciais: f.iniciais.trim(), paciente_prontuario: f.prontuario.trim() || null, setor: f.setor.trim() || null });
    setBusy(false);
    if (ok) onClose();
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 480, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>Dispensação avulsa</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>Dados de saúde — use iniciais e prontuário (LGPD).</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={rotuloCampo}>Iniciais *</label><input value={f.iniciais} onChange={e => set("iniciais", e.target.value)} placeholder="Ex.: M.S.O." style={campoTexto} autoFocus /></div>
          <div><label style={rotuloCampo}>Prontuário *</label><input value={f.prontuario} onChange={e => set("prontuario", e.target.value)} placeholder="registro" style={campoTexto} /></div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={rotuloCampo}>Setor / leito (opcional)</label>
          <input value={f.setor} onChange={e => set("setor", e.target.value)} placeholder="Ex.: Enfermaria 2 · leito 12" style={campoTexto} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={rotuloCampo}>Medicamento</label>
          <select value={f.medId} onChange={e => set("medId", e.target.value)} style={campoTexto}>
            <option value="">Escolha…</option>
            {FARM_CLASSES.filter(c => meds.some(m => (m.classe || "Outros") === c && m.ativo !== false)).map(c => (
              <optgroup key={c} label={c}>
                {meds.filter(m => (m.classe || "Outros") === c && m.ativo !== false).map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        {f.medId && (
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 8 }}>
            <div>
              <label style={rotuloCampo}>Lote (FEFO)</label>
              {lotesMed.length === 0 ? <div style={{ ...campoTexto, color: "#f43f5e" }}>Sem estoque</div> : (
                <select value={loteEfetivo} onChange={e => set("lote_id", e.target.value)} style={campoTexto}>
                  {lotesMed.map(l => { const vi = infoDeValidade(l.validade); return <option key={l.id} value={l.id}>{(l.lote || "sem lote")} · val {l.validade ? fmtDataBR(l.validade) : "—"}{vi.status === "vencido" ? " (VENCIDO)" : ""} · saldo {farmFmtQtd(l.quantidade)}</option>; })}
                </select>
              )}
            </div>
            <div><label style={rotuloCampo}>Qtd</label><input type="number" min="0" step="any" value={f.quantidade} onChange={e => set("quantidade", e.target.value)} placeholder="0" style={campoTexto} /></div>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={confirmar} disabled={busy} style={{ background: "#34d399", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Dispensar"}</button>
        </div>
      </div>
    </div>
  );
}

// Indicadores da Farmácia — consumo, curva ABC, controlados, rupturas e validade
function FarmIndicadoresView({ sb }) {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth());
  const [ano, setAno] = useState(now.getFullYear());
  const [movs, setMovs] = useState([]);
  const [meds, setMeds] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [preview, setPreview] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [prep, setPrep] = useState([]);
  const [presAtivas, setPresAtivas] = useState(0);

  const fromISO = new Date(ano, mes, 1).toISOString();
  const toISO = new Date(ano, mes + 1, 1).toISOString();

  function refresh() {
    if (!sb) return;
    loadFarmMedicamentos(sb).then(setMeds);
    loadFarmLotes(sb).then(setLotes);
    loadFarmPreparo(sb).then(setPrep);
    loadPsAtendimentos(sb).then(async ats => {
      const ids = ats.map(a => a.id);
      const pres = await loadPsPrescricoesByAtendimentos(sb, ids);
      const atSet = new Set(ids);
      const prepRows = await loadFarmPreparo(sb);
      const prepReg = {}; prepRows.forEach(p => prepReg[p.registro_id] = p);
      setPresAtivas(pres.filter(r => atSet.has(r.atendimento_id) && !prepReg[r.id]).length);
    });
    setCarregando(true);
    loadFarmMovimentosPeriodo(sb, fromISO, toISO).then(r => { setMovs(r); setCarregando(false); });
  }
  useEffect(() => { refresh(); const onF = () => refresh(); window.addEventListener("focus", onF); return () => window.removeEventListener("focus", onF); }, [mes, ano]);

  // Prescrição por status (snapshot atual): aguardando (sem linha de preparo) + estados do preparo
  const statusPresc = [
    { key: "aguardando", label: "Aguardando", cor: "#8d99ab", n: presAtivas },
    { key: "preparo", label: "Em preparo", cor: "#d97706", n: prep.filter(p => p.status === "preparo").length },
    { key: "pronto", label: "Pronto", cor: "#3b82f6", n: prep.filter(p => p.status === "pronto").length },
    { key: "retirado", label: "Retirado", cor: "#34d399", n: prep.filter(p => p.status === "retirado").length },
  ];
  const totalPresc = statusPresc.reduce((s, x) => s + x.n, 0);

  const medById = {}; meds.forEach(m => medById[m.id] = m);
  const nomeMed = id => medById[id]?.nome || "—";
  const saidas = movs.filter(m => m.tipo === "saida");
  const entradas = movs.filter(m => m.tipo === "entrada");
  const dispensacoes = saidas.filter(m => (m.motivo || "") === "Dispensação");
  const perdas = saidas.filter(m => /perda|vencim/i.test(m.motivo || ""));

  // Consumo (dispensação) por medicamento + curva ABC
  const consMap = {};
  dispensacoes.forEach(m => { if (!m.medicamento_id) return; consMap[m.medicamento_id] = (consMap[m.medicamento_id] || 0) + Number(m.quantidade || 0); });
  const consumo = Object.entries(consMap).map(([id, qtd]) => ({ id: Number(id), qtd, med: medById[Number(id)] })).sort((a, b) => b.qtd - a.qtd);
  const totalCons = consumo.reduce((s, c) => s + c.qtd, 0);
  let acc = 0;
  const abc = consumo.map(c => { acc += c.qtd; const pctAcc = totalCons > 0 ? (acc / totalCons) * 100 : 0; return { ...c, pct: totalCons > 0 ? (c.qtd / totalCons) * 100 : 0, pctAcc, abc: pctAcc <= 80 ? "A" : pctAcc <= 95 ? "B" : "C" }; });
  const abcCount = { A: abc.filter(x => x.abc === "A").length, B: abc.filter(x => x.abc === "B").length, C: abc.filter(x => x.abc === "C").length };

  // Consumo por classe
  const classeMap = {};
  dispensacoes.forEach(m => { const cl = medById[m.medicamento_id]?.classe || "Outros"; classeMap[cl] = (classeMap[cl] || 0) + Number(m.quantidade || 0); });
  const porClasse = Object.entries(classeMap).map(([cl, qtd]) => ({ cl, qtd })).sort((a, b) => b.qtd - a.qtd);
  const maxClasse = Math.max(1, ...porClasse.map(x => x.qtd));

  // Controlados dispensados
  const controlMap = {};
  dispensacoes.filter(m => medById[m.medicamento_id]?.controlado).forEach(m => { controlMap[m.medicamento_id] = (controlMap[m.medicamento_id] || 0) + Number(m.quantidade || 0); });
  const controlados = Object.entries(controlMap).map(([id, qtd]) => ({ id: Number(id), qtd, med: medById[Number(id)] })).sort((a, b) => b.qtd - a.qtd);

  // Snapshot: rupturas e validade (independem do período)
  const ativos = meds.filter(m => m.ativo !== false);
  const saldo = m => saldoDoMedicamento(m.id, lotes);
  const rupturas = ativos.filter(m => farmStatusEstoque(m, lotes).key === "zerado");
  const abaixoMin = ativos.filter(m => farmStatusEstoque(m, lotes).key === "baixo");
  const lotesEstoque = lotes.filter(l => Number(l.quantidade) > 0);
  const vencidosEstoque = lotesEstoque.filter(l => infoDeValidade(l.validade).status === "vencido");
  const venc30 = lotesEstoque.filter(l => infoDeValidade(l.validade).status === "vencendo");

  const qtdDispensada = dispensacoes.reduce((s, m) => s + Number(m.quantidade || 0), 0);
  const qtdEntradas = entradas.reduce((s, m) => s + Number(m.quantidade || 0), 0);
  const qtdPerdas = perdas.reduce((s, m) => s + Number(m.quantidade || 0), 0);
  const pacientes = new Set(dispensacoes.map(m => m.paciente_prontuario || m.paciente_iniciais || "").filter(Boolean)).size;

  // Custos (por medicamento e por paciente)
  const custoDe = m => Number(m.quantidade || 0) * custoUnit(medById[m.medicamento_id]);
  const custoTotal = dispensacoes.reduce((s, m) => s + custoDe(m), 0);
  const semPreco = new Set(dispensacoes.filter(m => !custoUnit(medById[m.medicamento_id])).map(m => m.medicamento_id)).size;
  const custoPacMap = {};
  dispensacoes.forEach(m => { const k = m.paciente_prontuario || m.paciente_iniciais || "—"; custoPacMap[k] = (custoPacMap[k] || 0) + custoDe(m); });
  const custoPaciente = Object.entries(custoPacMap).map(([pac, v]) => ({ pac, v })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);

  const fmt = n => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const lbl = { fontSize: 11, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 4 };
  const selInp = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none" };
  const abcCor = c => c === "A" ? "#e11d48" : c === "B" ? "#d97706" : "#0d9488";
  const KPI = ({ label, valor, unidade, cor, sub }) => (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${cor || "var(--border)"}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: cor || "var(--text)", fontFamily: "JetBrains Mono, monospace", marginTop: 3 }}>{valor}{unidade && <span style={{ fontSize: 12, fontWeight: 600, marginLeft: 3, color: "var(--text-muted)" }}>{unidade}</span>}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
  const printStyles = `@media print { body * { visibility: hidden !important; } #farm-print, #farm-print * { visibility: visible !important; } #farm-print { position: fixed; inset: 0; background: #fff !important; color: #111 !important; padding: 18px; } @page { size: A4 portrait; margin: 12mm; } }`;

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
        <KPI label="Itens dispensados" valor={fmt(dispensacoes.length)} sub="baixas de dispensação" cor="#22d3ee" />
        <KPI label="Qtd dispensada" valor={fmt(qtdDispensada)} sub={`${pacientes} paciente(s)`} cor="#3b82f6" />
        <KPI label="Entradas" valor={fmt(qtdEntradas)} sub="unidades recebidas" cor="#34d399" />
        <KPI label="Perdas / vencimento" valor={fmt(qtdPerdas)} sub="baixas por perda" cor={qtdPerdas > 0 ? "#f43f5e" : "var(--border)"} />
        <KPI label="Rupturas agora" valor={fmt(rupturas.length)} sub="itens sem estoque" cor={rupturas.length ? "#f43f5e" : "#34d399"} />
        <KPI label="Custo dispensado" valor={fmtReais(custoTotal)} sub={semPreco ? `${semPreco} sem preço` : "no mês"} cor="#0d9488" />
      </div>

      {carregando && <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>Carregando movimentos…</div>}

      {/* BI — TOP 5 + PRESCRIÇÃO POR STATUS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: "1.5rem" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", marginBottom: 10 }}>Top 5 medicamentos do mês</div>
          {consumo.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Sem dispensações no mês.</div> : consumo.slice(0, 5).map((c, i) => { const max = consumo[0].qtd || 1; return (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", width: 16 }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.med?.nome || "—"}</div>
                <div style={{ height: 8, background: "var(--surface-3)", borderRadius: 99, overflow: "hidden", marginTop: 2 }}><div style={{ width: Math.max(3, (c.qtd / max) * 100) + "%", height: "100%", background: VX.azul, borderRadius: 99 }} /></div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", minWidth: 44, textAlign: "right" }}>{fmt(c.qtd)}</span>
            </div>
          ); })}
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", marginBottom: 10 }}>Prescrições por status (agora)</div>
          {totalPresc === 0 ? <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nenhuma prescrição no fluxo.</div> : (<>
            <div style={{ display: "flex", height: 14, borderRadius: 99, overflow: "hidden", marginBottom: 10 }}>
              {statusPresc.filter(s => s.n > 0).map(s => <div key={s.key} title={`${s.label}: ${s.n}`} style={{ width: (s.n / totalPresc) * 100 + "%", background: s.cor }} />)}
            </div>
            {statusPresc.map(s => (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, fontSize: 12.5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 99, background: s.cor, flexShrink: 0 }} />
                <span style={{ flex: 1, color: "var(--text-2)" }}>{s.label}</span>
                <span style={{ fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>{s.n}</span>
                <span style={{ color: "var(--text-muted)", width: 42, textAlign: "right" }}>{Math.round((s.n / totalPresc) * 100)}%</span>
              </div>
            ))}
          </>)}
        </div>
      </div>

      {/* CUSTO POR PACIENTE */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6 }}>Custo por paciente — {MONTHS_FULL[mes]}/{ano}</div>
      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10 }}>Custo = quantidade dispensada × custo unitário do medicamento (cadastrado em Estoque → Editar).{semPreco ? ` ${semPreco} medicamento(s) dispensado(s) ainda sem preço.` : ""}</div>
      {custoPaciente.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "1.5rem", border: "1px dashed var(--border)", borderRadius: 10, marginBottom: "1.5rem" }}>Sem custo apurado no mês. Cadastre o custo unitário dos medicamentos e registre dispensações.</div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10, marginBottom: "1.5rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 360 }}>
            <thead><tr style={{ background: "var(--surface-2)", textAlign: "left", color: "var(--text-3)", fontSize: 11, textTransform: "uppercase" }}>
              <th style={{ padding: "8px 12px" }}>#</th><th style={{ padding: "8px 12px" }}>Paciente</th><th style={{ padding: "8px 12px", textAlign: "right" }}>Custo</th><th style={{ padding: "8px 12px", textAlign: "right" }}>% do total</th>
            </tr></thead>
            <tbody>
              {custoPaciente.slice(0, 20).map((x, i) => (
                <tr key={x.pac} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "7px 12px", color: "var(--text-muted)" }}>{i + 1}</td>
                  <td style={{ padding: "7px 12px" }}>{x.pac}</td>
                  <td style={{ padding: "7px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: "#0d9488" }}>{fmtReais(x.v)}</td>
                  <td style={{ padding: "7px 12px", textAlign: "right", color: "var(--text-muted)" }}>{custoTotal > 0 ? fmt((x.v / custoTotal) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {custoPaciente.length > 20 && <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "6px 12px" }}>+{custoPaciente.length - 20} pacientes</div>}
        </div>
      )}

      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6 }}>Curva ABC — consumo de {MONTHS_FULL[mes]}/{ano}</div>
      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10 }}>Classe A = 80% do consumo · B = próximos 15% · C = 5% restante. {abcCount.A} A · {abcCount.B} B · {abcCount.C} C.</div>
      {abc.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "1.5rem", border: "1px dashed var(--border)", borderRadius: 10, marginBottom: "1.5rem" }}>Nenhuma dispensação neste mês.</div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10, marginBottom: "1.5rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 520 }}>
            <thead><tr style={{ background: "var(--surface-2)", textAlign: "left", color: "var(--text-3)", fontSize: 11, textTransform: "uppercase" }}>
              <th style={{ padding: "8px 12px" }}>#</th><th style={{ padding: "8px 12px" }}>Medicamento</th><th style={{ padding: "8px 12px", textAlign: "right" }}>Consumo</th><th style={{ padding: "8px 12px", textAlign: "right" }}>Custo</th><th style={{ padding: "8px 12px", textAlign: "right" }}>%</th><th style={{ padding: "8px 12px", textAlign: "center" }}>ABC</th>
            </tr></thead>
            <tbody>
              {abc.slice(0, 25).map((x, i) => (
                <tr key={x.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "7px 12px", color: "var(--text-muted)" }}>{i + 1}</td>
                  <td style={{ padding: "7px 12px" }}>{x.med?.nome || "—"}{x.med?.controlado && <span style={{ fontSize: 9, color: "#6366f1", marginLeft: 6, fontWeight: 800 }}>CONTROLADO</span>}</td>
                  <td style={{ padding: "7px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>{fmt(x.qtd)} <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 400 }}>{x.med?.unidade || ""}</span></td>
                  <td style={{ padding: "7px 12px", textAlign: "right", color: "#0d9488", fontFamily: "JetBrains Mono, monospace" }}>{custoUnit(x.med) ? fmtReais(x.qtd * custoUnit(x.med)) : "—"}</td>
                  <td style={{ padding: "7px 12px", textAlign: "right", color: "var(--text-2)" }}>{fmt(x.pct)}%</td>
                  <td style={{ padding: "7px 12px", textAlign: "center" }}><span style={{ fontSize: 11, fontWeight: 800, color: abcCor(x.abc) }}>{x.abc}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {abc.length > 25 && <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "6px 12px" }}>+{abc.length - 25} medicamentos</div>}
        </div>
      )}

      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Consumo por classe terapêutica</div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", marginBottom: "1.5rem" }}>
        {porClasse.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Sem dados no mês.</div> : porClasse.map(c => (
          <div key={c.cl} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
            <span style={{ fontSize: 11.5, color: "var(--text-2)", width: 210, flexShrink: 0 }}>{c.cl}</span>
            <div style={{ flex: 1, height: 12, background: "var(--surface-3)", borderRadius: 99, overflow: "hidden" }}><div style={{ width: Math.max(2, (c.qtd / maxClasse) * 100) + "%", height: "100%", background: "#3b82f6", borderRadius: 99 }} /></div>
            <span style={{ fontSize: 11.5, fontWeight: 700, width: 60, textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{fmt(c.qtd)}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, marginBottom: "1rem" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: "var(--text-2)" }}>Controlados dispensados (Portaria 344)</div>
          {controlados.length === 0 ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Nenhum controlado dispensado no mês.</div> : controlados.map(c => (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "3px 0", borderBottom: "1px solid var(--border)" }}><span>{c.med?.nome || "—"}</span><strong style={{ fontFamily: "JetBrains Mono, monospace", color: "#6366f1" }}>{fmt(c.qtd)}</strong></div>
          ))}
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: "var(--text-2)" }}>Validade & rupturas (agora)</div>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.9 }}>
            <div>Sem estoque: <strong style={{ color: rupturas.length ? "#f43f5e" : "#34d399" }}>{rupturas.length}</strong></div>
            <div>Abaixo do mínimo: <strong style={{ color: abaixoMin.length ? "#d97706" : "#34d399" }}>{abaixoMin.length}</strong></div>
            <div>Lotes vencidos em estoque: <strong style={{ color: vencidosEstoque.length ? "#f43f5e" : "#34d399" }}>{vencidosEstoque.length}</strong></div>
            <div>Lotes vencendo ≤30 dias: <strong style={{ color: venc30.length ? "#d97706" : "#34d399" }}>{venc30.length}</strong></div>
          </div>
          {(rupturas.length > 0 || vencidosEstoque.length > 0) && <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)" }}>{[...rupturas.slice(0, 5).map(m => m.nome), ...vencidosEstoque.slice(0, 3).map(l => `${nomeMed(l.medicamento_id)} (venc.)`)].join(" · ")}</div>}
        </div>
      </div>

      {preview && (
        <div id="farm-print" style={{ background: "#fff", color: "#111", borderRadius: 10, border: "1px solid #e5e7eb", padding: "24px 28px", fontFamily: "Inter, sans-serif", fontSize: 12, marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, paddingBottom: 12, borderBottom: "2px solid #e5e7eb" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>RELATÓRIO FARMÁCIA — {HOSPITAL_SIGLA}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{HOSPITAL_NOME} · Valentrax Healthcare Operations · Consumo e estoque de medicamentos</div>
            </div>
            <div style={{ textAlign: "right", fontSize: 11, color: "#64748b" }}>
              <div style={{ fontWeight: 700, color: "#0f172a" }}>{MONTHS_FULL[mes]}/{ano}</div>
              <div>emitido {new Date().toLocaleDateString("pt-BR")}</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
            {[["Itens dispensados", fmt(dispensacoes.length)], ["Qtd dispensada", fmt(qtdDispensada)], ["Entradas", fmt(qtdEntradas)], ["Perdas/vencimento", fmt(qtdPerdas)], ["Rupturas agora", fmt(rupturas.length)], ["Vencendo ≤30d", fmt(venc30.length)]].map(([l, v]) => (
              <div key={l} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}><div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase" }}>{l}</div><div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>{v}</div></div>
            ))}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>Curva ABC — top 20 (A: {abcCount.A} · B: {abcCount.B} · C: {abcCount.C})</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginBottom: 16 }}>
            <thead><tr style={{ borderBottom: "1px solid #e5e7eb", textAlign: "left", color: "#64748b" }}><th style={{ padding: "4px 6px" }}>#</th><th style={{ padding: "4px 6px" }}>Medicamento</th><th style={{ padding: "4px 6px", textAlign: "right" }}>Consumo</th><th style={{ padding: "4px 6px", textAlign: "right" }}>%</th><th style={{ padding: "4px 6px", textAlign: "center" }}>ABC</th></tr></thead>
            <tbody>{abc.slice(0, 20).map((x, i) => (<tr key={x.id} style={{ borderBottom: "1px solid #f1f5f9" }}><td style={{ padding: "3px 6px" }}>{i + 1}</td><td style={{ padding: "3px 6px" }}>{x.med?.nome || "—"}</td><td style={{ padding: "3px 6px", textAlign: "right" }}>{fmt(x.qtd)}</td><td style={{ padding: "3px 6px", textAlign: "right" }}>{fmt(x.pct)}%</td><td style={{ padding: "3px 6px", textAlign: "center", fontWeight: 700 }}>{x.abc}</td></tr>))}</tbody>
          </table>
          {controlados.length > 0 && (<>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>Controlados dispensados (Portaria 344)</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginBottom: 16 }}><tbody>{controlados.map(c => (<tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9" }}><td style={{ padding: "3px 6px" }}>{c.med?.nome || "—"}</td><td style={{ padding: "3px 6px", textAlign: "right", fontWeight: 700 }}>{fmt(c.qtd)}</td></tr>))}</tbody></table>
          </>)}
          <div style={{ fontSize: 11, color: "#64748b", borderTop: "1px solid #e5e7eb", paddingTop: 8 }}>Sem estoque: {rupturas.length} · Abaixo do mínimo: {abaixoMin.length} · Lotes vencidos em estoque: {vencidosEstoque.length} · Vencendo ≤30d: {venc30.length}. Valores por quantidade (unidades) — sem custo financeiro cadastrado.</div>
        </div>
      )}
    </div>
  );
}

// Análise clínica — roda o motor de alertas por paciente do PS
function FarmAnaliseView({ sb, currentUser, canEdit }) {
  const [atends, setAtends] = useState([]);
  const [itens, setItens] = useState([]);
  const [meds, setMeds] = useState([]);
  const [interacoes, setInteracoes] = useState([]);
  const [incompatY, setIncompatY] = useState([]);
  const [showBase, setShowBase] = useState(false);
  const [aberto, setAberto] = useState({});
  const [, setTick] = useState(0);

  function refresh() {
    if (!sb) return;
    loadFarmMedicamentos(sb).then(setMeds);
    loadFarmInteracoes(sb).then(setInteracoes);
    loadFarmIncompatY(sb).then(setIncompatY);
    loadPsAtendimentos(sb).then(async ats => {
      setAtends(ats);
      setItens(await loadPsPrescricaoItensByAtendimentos(sb, ats.map(a => a.id)));
    });
  }
  useEffect(() => {
    refresh();
    const onF = () => refresh();
    window.addEventListener("focus", onF);
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => { window.removeEventListener("focus", onF); clearInterval(id); };
  }, []);

  const medById = {}; meds.forEach(m => medById[m.id] = m);
  const linhas = atends.map(a => {
    const its = itens.filter(i => i.atendimento_id === a.id);
    const ctx = { idade: a.idade, peso: a.peso, clearance_renal: a.clearance_renal, funcao_hepatica: a.funcao_hepatica, alergias: a.alergias, em_sonda: a.em_sonda, gestante: a.gestante, comorbidades: a.comorbidades };
    return { at: a, itens: its, alertas: analisarPrescricaoClinica(its, ctx, medById, interacoes, incompatY) };
  }).filter(x => x.itens.length > 0).sort((a, b) => b.alertas.length - a.alertas.length);
  const totalAlertas = linhas.reduce((s, l) => s + l.alertas.length, 0);
  const comAlerta = linhas.filter(l => l.alertas.length > 0);
  const ctxResumo = a => [a.idade != null ? `${a.idade} anos` : null, a.em_sonda ? "sonda" : null, a.gestante ? "gestante" : null, a.clearance_renal != null ? `ClCr ${a.clearance_renal}` : null, a.alergias ? `alergia: ${a.alergias}` : null].filter(Boolean).join(" · ") || "contexto clínico não informado";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: "var(--text-muted)", flex: 1, minWidth: 240 }}>{comAlerta.length} paciente(s) com alertas · {totalAlertas} alerta(s). Apoio à decisão — os alertas assistem o farmacêutico e não substituem o julgamento clínico; a base é sujeita a validação da equipe.</div>
        <button onClick={() => setShowBase(true)} style={{ background: "transparent", color: "var(--text-2)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" }}>Base de interações ({(interacoes || []).length + (incompatY || []).length})</button>
      </div>
      {showBase && <FarmInteracoesModal sb={sb} interacoes={interacoes} incompatY={incompatY} currentUser={currentUser} canEdit={canEdit} onClose={() => { setShowBase(false); refresh(); }} />}
      {linhas.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Nenhuma prescrição estruturada no PS no momento. Prescreva pela aba Prescrição do Pronto-Socorro.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {linhas.map(l => {
            const cont = { alta: l.alertas.filter(x => x.gravidade === "alta").length, media: l.alertas.filter(x => x.gravidade === "media").length, baixa: l.alertas.filter(x => x.gravidade === "baixa").length };
            const cor = cont.alta ? "#f43f5e" : cont.media ? "#d97706" : cont.baixa ? "#3b82f6" : "#34d399";
            const exp = aberto[l.at.id];
            return (
              <div key={l.at.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${cor}`, borderRadius: 10 }}>
                <button onClick={() => setAberto(o => ({ ...o, [l.at.id]: !o[l.at.id] }))} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, background: "transparent", border: "none", padding: "11px 14px", cursor: "pointer", textAlign: "left", color: "var(--text)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {l.at.iniciais}{l.at.prontuario ? ` · reg. ${l.at.prontuario}` : ""}
                      {l.at.alergias && <span style={{ fontSize: 9.5, fontWeight: 800, color: "#f43f5e", background: "#f43f5e14", border: "1px solid #f43f5e66", borderRadius: 99, padding: "1px 7px", textTransform: "uppercase" }}>⚠ Alérgico: {l.at.alergias}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{l.itens.length} item(ns) · {ctxResumo(l.at)}</div>
                  </div>
                  <span title={`Score da prescrição: ${scorePrescricao(l.itens, l.alertas)}/3`} style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", background: FARM_SCORE_COR[scorePrescricao(l.itens, l.alertas)], borderRadius: 6, padding: "1px 8px", whiteSpace: "nowrap" }}>score {scorePrescricao(l.itens, l.alertas)}</span>
                  {l.alertas.length === 0 ? <span style={{ fontSize: 11, color: "#34d399", fontWeight: 700 }}>sem alertas</span> : (
                    <div style={{ display: "flex", gap: 5 }}>
                      {cont.alta > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: "#f43f5e", border: "1px solid #f43f5e66", borderRadius: 99, padding: "1px 8px" }}>{cont.alta} alta</span>}
                      {cont.media > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: "#d97706", border: "1px solid #d9770666", borderRadius: 99, padding: "1px 8px" }}>{cont.media} média</span>}
                      {cont.baixa > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: "#3b82f6", border: "1px solid #3b82f666", borderRadius: 99, padding: "1px 8px" }}>{cont.baixa} baixa</span>}
                    </div>
                  )}
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{exp ? "▾" : "▸"}</span>
                </button>
                {exp && (
                  <div style={{ padding: "0 14px 12px" }}>
                    {l.alertas.length === 0 ? (
                      <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nenhum alerta para os itens prescritos com o contexto informado.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {l.alertas.map((a, i) => (
                          <div key={i} style={{ background: FARM_GRAV[a.gravidade].cor + "11", border: `1px solid ${FARM_GRAV[a.gravidade].cor}44`, borderRadius: 8, padding: "8px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 9.5, fontWeight: 800, color: FARM_GRAV[a.gravidade].cor, border: `1px solid ${FARM_GRAV[a.gravidade].cor}66`, borderRadius: 99, padding: "0 6px", textTransform: "uppercase" }}>{FARM_GRAV[a.gravidade].label}</span>
                              <strong style={{ fontSize: 12.5 }}>{a.titulo}</strong>
                            </div>
                            <div style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 3, lineHeight: 1.45 }}>{a.detalhe}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {(l.at.idade == null && l.at.em_sonda == null) && <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 8 }}>Dica: informe o contexto clínico (idade, sonda, alergias) na aba Prescrição do PS para alertas mais completos.</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Editor da base de pares: interações medicamentosas + incompatibilidade em Y
function FarmInteracoesModal({ sb, interacoes, incompatY, currentUser, canEdit, onClose }) {
  const [sub, setSub] = useState("inter");
  // A prop pode chegar `null` (a base não pôde ser lida). Aqui o modal
  // edita a base, então trabalha com lista — e o aviso de leitura falha
  // fica na tela que lista, não neste formulário.
  const [lstI, setLstI] = useState(interacoes || []);
  const [lstY, setLstY] = useState(incompatY || []);
  const [fi, setFi] = useState({ substancia_a: "", substancia_b: "", gravidade: "moderada", descricao: "", conduta: "" });
  const [fy, setFy] = useState({ substancia_a: "", substancia_b: "", descricao: "" });
  const isMaster = currentUser?.role === "adm_master";
  // `r &&`: leitura que falhou devolve null. Este modal EDITA a base, entao
  // trabalha com lista -- manter a que esta na tela e melhor que apaga-la, e o
  // aviso de falha fica na tela que lista, atras do modal.
  const reload = () => { loadFarmInteracoes(sb).then(r => r && setLstI(r)); loadFarmIncompatY(sb).then(r => r && setLstY(r)); };
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 9px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 12.5, outline: "none", width: "100%", boxSizing: "border-box" };
  const gravCor = g => g === "grave" ? "#f43f5e" : g === "leve" ? "#3b82f6" : "#d97706";
  const subBtn = ativo => ({ background: ativo ? "#22d3ee" : "transparent", color: ativo ? "#000" : "var(--text-3)", border: `1px solid ${ativo ? "#22d3ee" : "var(--border)"}`, borderRadius: 7, padding: "6px 14px", fontWeight: 700, cursor: "pointer", fontSize: 12.5 });

  async function addInter() {
    if (!fi.substancia_a.trim() || !fi.substancia_b.trim()) { alert("Informe as duas substâncias."); return; }
    await upsertFarmInteracaoRemote(sb, { substancia_a: fi.substancia_a.trim().toLowerCase(), substancia_b: fi.substancia_b.trim().toLowerCase(), gravidade: fi.gravidade, descricao: fi.descricao.trim() || null, conduta: fi.conduta.trim() || null }, currentUser);
    registrarAuditoria(sb, currentUser, "farmácia: nova interação", `${fi.substancia_a} × ${fi.substancia_b}`, {});
    setFi({ substancia_a: "", substancia_b: "", gravidade: "moderada", descricao: "", conduta: "" });
    setTimeout(reload, 300);
  }
  async function delInter(id) { if (confirm("Remover esta interação?")) { await deleteFarmInteracaoRemote(sb, id); setTimeout(reload, 200); } }
  async function addY() {
    if (!fy.substancia_a.trim() || !fy.substancia_b.trim()) { alert("Informe as duas substâncias."); return; }
    await upsertFarmIncompatRemote(sb, { substancia_a: fy.substancia_a.trim().toLowerCase(), substancia_b: fy.substancia_b.trim().toLowerCase(), descricao: fy.descricao.trim() || null }, currentUser);
    registrarAuditoria(sb, currentUser, "farmácia: nova incompatibilidade Y", `${fy.substancia_a} × ${fy.substancia_b}`, {});
    setFy({ substancia_a: "", substancia_b: "", descricao: "" });
    setTimeout(reload, 300);
  }
  async function delY(id) { if (confirm("Remover esta incompatibilidade?")) { await deleteFarmIncompatRemote(sb, id); setTimeout(reload, 200); } }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 680, maxWidth: "96vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Base de pares — farmácia clínica</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>Substâncias casam por princípio ativo, nome ou grupo (ex.: "aine", "opioide", "benzodiazep"). Revise com a equipe.</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button onClick={() => setSub("inter")} style={subBtn(sub === "inter")}>Interações ({lstI.length})</button>
          <button onClick={() => setSub("y")} style={subBtn(sub === "y")}>Incompatibilidade em Y ({lstY.length})</button>
        </div>

        {sub === "inter" ? (<>
          {canEdit && (
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 110px", gap: 8, marginBottom: 8 }}>
                <input value={fi.substancia_a} onChange={e => setFi(p => ({ ...p, substancia_a: e.target.value }))} placeholder="substância A" style={inp} />
                <input value={fi.substancia_b} onChange={e => setFi(p => ({ ...p, substancia_b: e.target.value }))} placeholder="substância B" style={inp} />
                <select value={fi.gravidade} onChange={e => setFi(p => ({ ...p, gravidade: e.target.value }))} style={inp}><option value="grave">grave</option><option value="moderada">moderada</option><option value="leve">leve</option></select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8 }}>
                <input value={fi.descricao} onChange={e => setFi(p => ({ ...p, descricao: e.target.value }))} placeholder="descrição / mecanismo" style={inp} />
                <input value={fi.conduta} onChange={e => setFi(p => ({ ...p, conduta: e.target.value }))} placeholder="conduta" style={inp} />
                <button onClick={addInter} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "7px 16px", fontWeight: 700, cursor: "pointer", fontSize: 12.5 }}>+ Add</button>
              </div>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {lstI.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "10px" }}>Nenhuma interação cadastrada.</div>}
            {lstI.map(r => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "7px 11px", fontSize: 12.5 }}>
                <span style={{ fontSize: 9.5, fontWeight: 800, color: gravCor(r.gravidade), border: `1px solid ${gravCor(r.gravidade)}66`, borderRadius: 99, padding: "0 6px", textTransform: "uppercase", whiteSpace: "nowrap" }}>{r.gravidade}</span>
                <span style={{ flex: 1 }}><strong>{r.substancia_a} × {r.substancia_b}</strong>{r.descricao ? <span style={{ color: "var(--text-muted)" }}> — {r.descricao}</span> : ""}</span>
                {isMaster && <button onClick={() => delInter(r.id)} style={btnContorno("#f43f5e")}>Excluir</button>}
              </div>
            ))}
          </div>
        </>) : (<>
          {canEdit && (
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr auto", gap: 8 }}>
                <input value={fy.substancia_a} onChange={e => setFy(p => ({ ...p, substancia_a: e.target.value }))} placeholder="substância A" style={inp} />
                <input value={fy.substancia_b} onChange={e => setFy(p => ({ ...p, substancia_b: e.target.value }))} placeholder="substância B" style={inp} />
                <input value={fy.descricao} onChange={e => setFy(p => ({ ...p, descricao: e.target.value }))} placeholder="descrição (ex.: precipitação)" style={inp} />
                <button onClick={addY} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "7px 16px", fontWeight: 700, cursor: "pointer", fontSize: 12.5 }}>+ Add</button>
              </div>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {lstY.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "10px" }}>Nenhuma incompatibilidade cadastrada.</div>}
            {lstY.map(r => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "7px 11px", fontSize: 12.5 }}>
                <span style={{ flex: 1 }}><strong>{r.substancia_a} × {r.substancia_b}</strong>{r.descricao ? <span style={{ color: "var(--text-muted)" }}> — {r.descricao}</span> : ""}</span>
                {isMaster && <button onClick={() => delY(r.id)} style={btnContorno("#f43f5e")}>Excluir</button>}
              </div>
            ))}
          </div>
        </>)}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// Quadro de preparo: aguardando → em preparo → pronto → retirado (com bipe/notificação)
function FarmPreparoView({ sb, sbCru, currentUser, canEdit }) {
  const [atends, setAtends] = useState([]);
  const [prescricoes, setPrescricoes] = useState([]);
  const [preparo, setPreparo] = useState([]);
  const [itens, setItens] = useState([]);
  const [saidas, setSaidas] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [meds, setMeds] = useState([]);
  const [interacoes, setInteracoes] = useState([]);
  const [incompatY, setIncompatY] = useState([]);
  const [disp, setDisp] = useState(null);
  const [som, setSom] = useState(somLigado());
  const [toasts, setToasts] = useState([]);
  const [verRetirados, setVerRetirados] = useState(false);
  const [, setTick] = useState(0);
  const seenRef = useRef(null);

  function pushToast(msg) { const id = Date.now() + Math.random(); setToasts(t => [...t, { id, msg }]); setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 6000); }

  async function refresh() {
    if (!sb) return;
    const ats = await loadPsAtendimentos(sb); setAtends(ats);
    const ids = ats.map(a => a.id);
    const [pres, prep, its, sai] = await Promise.all([loadPsPrescricoesByAtendimentos(sb, ids), loadFarmPreparo(sb), loadPsPrescricaoItensByAtendimentos(sb, ids), loadFarmSaidasByAtendimentos(sb, ids)]);
    setPrescricoes(pres); setPreparo(prep); setItens(its); setSaidas(sai);
    loadFarmLotes(sb).then(setLotes); loadFarmMedicamentos(sb).then(setMeds); loadFarmInteracoes(sb).then(setInteracoes); loadFarmIncompatY(sb).then(setIncompatY);
    // detectar prescrições novas aguardando → bipe + toast
    const prepReg = {}; prep.forEach(p => prepReg[p.registro_id] = p);
    const atSet = new Set(ids);
    const agIds = new Set(pres.filter(r => atSet.has(r.atendimento_id) && !prepReg[r.id]).map(r => r.id));
    if (seenRef.current) {
      const novas = [...agIds].filter(x => !seenRef.current.has(x));
      if (novas.length) { if (somLigado()) avisoSonoro(false); const nomes = novas.map(rid => { const r = pres.find(p => p.id === rid); return ats.find(a => a.id === r?.atendimento_id)?.iniciais || "?"; }); pushToast(`🔔 Nova prescrição para preparar: ${nomes.join(", ")}`); }
    }
    seenRef.current = agIds;
  }
  useEffect(() => {
    refresh();
    const onF = () => refresh();
    window.addEventListener("focus", onF);
    const id = setInterval(() => { refresh(); setTick(t => t + 1); }, 12000);
    return () => { window.removeEventListener("focus", onF); clearInterval(id); };
  }, []);

  const atendById = {}; atends.forEach(a => atendById[a.id] = a);
  const medById = {}; meds.forEach(m => medById[m.id] = m);
  const prepByReg = {}; preparo.forEach(p => prepByReg[p.registro_id] = p);
  const atSet = new Set(atends.map(a => a.id));
  const scoreDe = atId => { const its = itens.filter(i => i.atendimento_id === atId); const a = atendById[atId] || {}; const ctx = { idade: a.idade, peso: a.peso, clearance_renal: a.clearance_renal, funcao_hepatica: a.funcao_hepatica, alergias: a.alergias, em_sonda: a.em_sonda, gestante: a.gestante, comorbidades: a.comorbidades }; return scorePrescricao(its, analisarPrescricaoClinica(its, ctx, medById, interacoes, incompatY)); };

  const cards = prescricoes.filter(r => atSet.has(r.atendimento_id)).map(r => ({ reg: r, prep: prepByReg[r.id], status: prepByReg[r.id] ? prepByReg[r.id].status : "aguardando", at: atendById[r.atendimento_id], nItens: itens.filter(i => i.registro_id === r.id).length, score: scoreDe(r.atendimento_id),
    separacao: podeMarcarPronto({ registro: r, itens, saidas }) }));
  const cols = [
    { key: "aguardando", lista: cards.filter(c => c.status === "aguardando") },
    { key: "preparo", lista: cards.filter(c => c.status === "preparo") },
    { key: "pronto", lista: cards.filter(c => c.status === "pronto") },
  ];
  const retirados = cards.filter(c => c.status === "retirado");

  async function receber(c) { await receberPreparoRemote(sb, c.reg.id, c.reg.atendimento_id, currentUser); registrarAuditoria(sb, currentUser, "farmácia: receber prescrição", c.at?.iniciais || "", {}); setTimeout(refresh, 300); }
  async function marcarPronto(c) {
    // 🔴 A recusa vive aqui também, não só no `disabled`. O botão some da
    // tela, mas o estado pode estar velho (o kanban recarrega a cada 12s) e
    // o clique chegar mesmo assim. Gravar "pronto" sem baixa é o defeito
    // que este arquivo existe para fechar — ver farmacia/preparo.js.
    const v = c.separacao || podeMarcarPronto({ registro: c.reg, itens, saidas });
    if (!v.ok) { alert("⚠ " + v.erros.join(" ")); return; }
    if (v.avisos.length && !confirm(`${v.avisos.join("\n\n")}\n\nMarcar como pronta assim mesmo?`)) return;
    await atualizarPreparoRemote(sb, c.prep.id, { status: "pronto", pronto_em: nowISO(), pronto_por: currentUser?.name || null });
    registrarAuditoria(sb, currentUser, "farmácia: preparo pronto", `${c.at?.iniciais || ""} · ${v.quadro.separados}/${v.quadro.total} separado(s)`, {});
    setTimeout(refresh, 300);
  }
  async function confirmarRetirada(c) { if (!confirm(`Confirmar retirada da prescrição de ${c.at?.iniciais || "?"}?`)) return; await atualizarPreparoRemote(sb, c.prep.id, { status: "retirado", retirado_em: nowISO(), retirado_por: currentUser?.name || null }); registrarAuditoria(sb, currentUser, "farmácia: retirada confirmada", c.at?.iniciais || "", {}); setTimeout(refresh, 300); }
  function ativarSom() { ligarSom(true); setSom(true); avisoSonoro(false); }
  async function registrarDispensacao(mov) { const r = await addFarmMovimentoRemote(sbCru, mov, currentUser); if (!r.ok) { alert("Não foi possível dispensar.\n" + (r.erro || "")); return false; } registrarAuditoria(sb, currentUser, "dispensação farmácia", `${mov.paciente_iniciais || "?"}`, {}); setTimeout(refresh, 300); return true; }

  const Card = ({ c }) => {
    const st = PREPARO_STATUS[c.status];
    return (
      <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: `4px solid ${st.cor}`, borderRadius: 9, padding: "10px 12px", marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <strong style={{ fontSize: 13 }}>{c.at?.iniciais || "?"}{c.at?.prontuario ? ` · ${c.at.prontuario}` : ""}</strong>
          <span title={`Score ${c.score}/3`} style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: FARM_SCORE_COR[c.score], borderRadius: 5, padding: "1px 6px" }}>{c.score}</span>
        </div>
        <div style={{ fontSize: 10.5, color: "var(--text-muted)", margin: "3px 0 8px" }}>{c.nItens} item(ns) · {horaFmt(c.reg.criado_em)}{c.at?.classificacao && MANCHESTER[c.at.classificacao] ? ` · ${MANCHESTER[c.at.classificacao].label}` : ""}</div>
        {c.status === "preparo" && c.separacao && (c.separacao.erros.length > 0 || c.separacao.avisos.length > 0) && (
          <div style={{ fontSize: 10.5, lineHeight: 1.4, marginBottom: 8,
                        color: c.separacao.ok ? "#d97706" : "#f43f5e" }}>
            {[...c.separacao.erros, ...c.separacao.avisos].join(" ")}
          </div>
        )}
        {canEdit && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {c.status === "aguardando" && <button onClick={() => receber(c)} style={btnContorno("#d97706")}>Receber</button>}
            {c.status === "preparo" && <>
              <button onClick={() => setDisp(c.at)} style={btnContorno("#22d3ee")}>Separar</button>
              {/* Botão desabilitado sem explicação visível é o mesmo defeito
                  que o resto do sistema evita — e `title` em botão
                  desabilitado não aparece em todo navegador. */}
              <button onClick={() => marcarPronto(c)} disabled={!c.separacao?.ok}
                style={{ ...btnContorno("#3b82f6"), opacity: c.separacao?.ok ? 1 : .45,
                         cursor: c.separacao?.ok ? "pointer" : "not-allowed" }}>Marcar pronto</button>
            </>}
            {c.status === "pronto" && <button onClick={() => confirmarRetirada(c)} style={btnContorno("#34d399")}>Confirmar retirada</button>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Toasts */}
      <div style={{ position: "fixed", top: 64, right: 18, zIndex: 300, display: "flex", flexDirection: "column", gap: 8, maxWidth: 320 }}>
        {toasts.map(t => <div key={t.id} style={{ background: "var(--bg-2)", border: "1px solid #3b82f6", borderLeft: "4px solid #3b82f6", borderRadius: 8, padding: "10px 13px", fontSize: 12.5, color: "var(--text)", boxShadow: "0 4px 16px rgba(0,0,0,.3)" }}>{t.msg}</div>)}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Ao assinar no PS, a prescrição chega aqui. Receber → separar (baixa de estoque) → marcar pronto → confirmar retirada.</div>
        <button onClick={ativarSom} style={{ background: som ? "#34d39922" : "transparent", color: som ? "#34d399" : "var(--text-2)", border: `1px solid ${som ? "#34d399" : "var(--border-2)"}`, borderRadius: 6, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 12.5 }}>{som ? "🔊 Som ativo" : "🔈 Ativar som"}</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        {cols.map(col => (
          <div key={col.key}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <span style={{ width: 9, height: 9, borderRadius: 99, background: PREPARO_STATUS[col.key].cor }} />
              <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--text-2)" }}>{PREPARO_STATUS[col.key].label}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>({col.lista.length})</span>
            </div>
            {col.lista.length === 0 ? <div style={{ fontSize: 11.5, color: "var(--text-muted)", padding: "6px 2px" }}>—</div> : col.lista.map(c => <Card key={c.reg.id} c={c} />)}
          </div>
        ))}
      </div>

      {retirados.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <button onClick={() => setVerRetirados(v => !v)} style={{ background: "transparent", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>{verRetirados ? "▾" : "▸"} Retirados hoje ({retirados.length})</button>
          {verRetirados && <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>{retirados.map(c => <span key={c.reg.id} style={{ fontSize: 11.5, color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 99, padding: "3px 10px" }}>{c.at?.iniciais || "?"} · retirado {c.prep?.retirado_em ? horaFmt(c.prep.retirado_em) : ""}</span>)}</div>}
        </div>
      )}

      {disp && <FarmDispensarModal atendimento={disp} itens={itens.filter(i => i.atendimento_id === disp.id)} saidas={saidas} lotes={lotes} alertas={(() => { const a = atendById[disp.id] || {}; const its = itens.filter(i => i.atendimento_id === disp.id); return analisarPrescricaoClinica(its, { idade: a.idade, peso: a.peso, clearance_renal: a.clearance_renal, funcao_hepatica: a.funcao_hepatica, alergias: a.alergias, em_sonda: a.em_sonda, gestante: a.gestante, comorbidades: a.comorbidades }, medById, interacoes, incompatY); })()} onClose={() => setDisp(null)} onDispensar={registrarDispensacao} />}
    </div>
  );
}

// Livro de controlados (Portaria 344): saldo, balanço e movimentação — imprimível
function FarmControladosView({ sb }) {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth());
  const [ano, setAno] = useState(now.getFullYear());
  const [meds, setMeds] = useState([]);
  const [movs, setMovs] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [preview, setPreview] = useState(false);

  function refresh() {
    if (!sb) return;
    loadFarmMedicamentos(sb).then(async ms => { setMeds(ms); setMovs(await loadFarmMovimentosByMeds(sb, ms.filter(m => m.controlado).map(m => m.id))); });
    loadFarmLotes(sb).then(setLotes);
  }
  useEffect(() => { refresh(); const onF = () => refresh(); window.addEventListener("focus", onF); return () => window.removeEventListener("focus", onF); }, []);

  const controlados = meds.filter(m => m.controlado);
  const inicioMes = new Date(ano, mes, 1).toISOString();
  const fimMes = new Date(ano, mes + 1, 1).toISOString();
  const balanco = controlados.map(m => {
    const ms = movs.filter(x => x.medicamento_id === m.id);
    let running = 0, saldoIni = 0, ent = 0, sai = 0; const linhas = [];
    ms.forEach(x => {
      running += (x.tipo === "entrada" ? 1 : -1) * Number(x.quantidade || 0);
      if (new Date(x.created_at) < new Date(inicioMes)) saldoIni = running;
      else if (new Date(x.created_at) < new Date(fimMes)) { if (x.tipo === "entrada") ent += Number(x.quantidade || 0); else sai += Number(x.quantidade || 0); linhas.push({ ...x, saldo: running, med: m }); }
    });
    return { med: m, saldoIni, ent, sai, saldoFim: saldoIni + ent - sai, saldoAtual: saldoDoMedicamento(m.id, lotes), linhas };
  });
  const linhasLivro = balanco.flatMap(b => b.linhas).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  const comBalanco = balanco.filter(b => b.linhas.length || b.saldoIni || b.saldoAtual);

  const lbl = { fontSize: 11, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 4 };
  const selInp = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none" };
  const fmt = n => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const printStyles = `@media print { body * { visibility: hidden !important; } #controlados-print, #controlados-print * { visibility: visible !important; } #controlados-print { position: fixed; inset: 0; background: #fff !important; color: #111 !important; padding: 18px; } @page { size: A4 portrait; margin: 12mm; } }`;

  return (
    <div>
      <style>{printStyles}</style>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: "1.25rem" }}>
        <div><div style={lbl}>Mês</div><select value={mes} onChange={e => setMes(+e.target.value)} style={selInp}>{MONTHS_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}</select></div>
        <div><div style={lbl}>Ano</div><input type="number" value={ano} onChange={e => setAno(+e.target.value)} style={{ ...selInp, width: 90 }} /></div>
        <button onClick={() => setPreview(p => !p)} style={{ background: "transparent", color: "#22d3ee", border: "1px solid #164e63", borderRadius: 7, padding: "8px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{preview ? "✕ Fechar balanço" : "Balanço do mês"}</button>
        {preview && <button onClick={() => window.print()} style={{ background: "#34d399", color: "#000", border: "none", borderRadius: 7, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Imprimir / PDF</button>}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 14 }}>Livro de controlados (Portaria 344/98) — {controlados.length} medicamento(s) marcado(s) como controlado no catálogo. Saldo apurado do histórico de entradas e saídas.</div>

      {/* BALANÇO DO MÊS */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Balanço de {MONTHS_FULL[mes]}/{ano}</div>
      {comBalanco.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "1.5rem", border: "1px dashed var(--border)", borderRadius: 10, marginBottom: "1.5rem" }}>Nenhum medicamento controlado com movimentação. Marque medicamentos como "Controlado" no catálogo e registre entradas/saídas.</div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10, marginBottom: "1.5rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
            <thead><tr style={{ background: "var(--surface-2)", textAlign: "left", color: "var(--text-3)", fontSize: 11, textTransform: "uppercase" }}>
              <th style={{ padding: "8px 12px" }}>Medicamento</th><th style={{ padding: "8px 12px", textAlign: "right" }}>Saldo inicial</th><th style={{ padding: "8px 12px", textAlign: "right" }}>Entradas</th><th style={{ padding: "8px 12px", textAlign: "right" }}>Saídas</th><th style={{ padding: "8px 12px", textAlign: "right" }}>Saldo final</th>
            </tr></thead>
            <tbody>
              {comBalanco.map(b => (
                <tr key={b.med.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "7px 12px", fontWeight: 600 }}>{b.med.nome}</td>
                  <td style={{ padding: "7px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{fmt(b.saldoIni)}</td>
                  <td style={{ padding: "7px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: "#34d399" }}>+{fmt(b.ent)}</td>
                  <td style={{ padding: "7px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: "#d97706" }}>−{fmt(b.sai)}</td>
                  <td style={{ padding: "7px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>{fmt(b.saldoFim)}<span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 400 }}> {b.med.unidade || ""}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* LIVRO / MOVIMENTAÇÃO DO MÊS */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Movimentação (livro) — {MONTHS_FULL[mes]}/{ano}</div>
      {linhasLivro.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "1.5rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Sem movimentação de controlados no mês.</div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 680 }}>
            <thead><tr style={{ background: "var(--surface-2)", textAlign: "left", color: "var(--text-3)", fontSize: 10.5, textTransform: "uppercase" }}>
              <th style={{ padding: "7px 10px" }}>Data</th><th style={{ padding: "7px 10px" }}>Medicamento</th><th style={{ padding: "7px 10px" }}>Tipo</th><th style={{ padding: "7px 10px", textAlign: "right" }}>Qtd</th><th style={{ padding: "7px 10px", textAlign: "right" }}>Saldo</th><th style={{ padding: "7px 10px" }}>Paciente</th><th style={{ padding: "7px 10px" }}>Doc.</th><th style={{ padding: "7px 10px" }}>Usuário</th>
            </tr></thead>
            <tbody>
              {linhasLivro.map(x => (
                <tr key={x.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "6px 10px", whiteSpace: "nowrap", fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>{x.created_at ? new Date(x.created_at).toLocaleDateString("pt-BR") : ""}</td>
                  <td style={{ padding: "6px 10px" }}>{x.med?.nome}</td>
                  <td style={{ padding: "6px 10px", color: x.tipo === "entrada" ? "#34d399" : "#d97706", fontWeight: 700 }}>{x.tipo === "entrada" ? "Entrada" : "Saída"}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{x.tipo === "entrada" ? "+" : "−"}{fmt(x.quantidade)}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>{fmt(x.saldo)}</td>
                  <td style={{ padding: "6px 10px" }}>{x.paciente_iniciais || "—"}{x.paciente_prontuario ? ` · ${x.paciente_prontuario}` : ""}</td>
                  <td style={{ padding: "6px 10px", color: "var(--text-muted)" }}>{x.documento || "—"}</td>
                  <td style={{ padding: "6px 10px", color: "var(--text-muted)" }}>{x.usuario || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {preview && (
        <div id="controlados-print" style={{ background: "#fff", color: "#111", borderRadius: 10, border: "1px solid #e5e7eb", padding: "24px 28px", fontFamily: "Inter, sans-serif", fontSize: 12, marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, paddingBottom: 12, borderBottom: "2px solid #e5e7eb" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>BALANÇO DE CONTROLADOS — {HOSPITAL_SIGLA}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{HOSPITAL_NOME} · Valentrax Healthcare Operations · Portaria 344/98</div>
            </div>
            <div style={{ textAlign: "right", fontSize: 11, color: "#64748b" }}><div style={{ fontWeight: 700, color: "#0f172a" }}>{MONTHS_FULL[mes]}/{ano}</div><div>emitido {new Date().toLocaleDateString("pt-BR")}</div></div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginBottom: 16 }}>
            <thead><tr style={{ borderBottom: "1px solid #e5e7eb", textAlign: "left", color: "#64748b" }}><th style={{ padding: "4px 6px" }}>Medicamento</th><th style={{ padding: "4px 6px", textAlign: "right" }}>Saldo inicial</th><th style={{ padding: "4px 6px", textAlign: "right" }}>Entradas</th><th style={{ padding: "4px 6px", textAlign: "right" }}>Saídas</th><th style={{ padding: "4px 6px", textAlign: "right" }}>Saldo final</th></tr></thead>
            <tbody>{comBalanco.map(b => (<tr key={b.med.id} style={{ borderBottom: "1px solid #f1f5f9" }}><td style={{ padding: "3px 6px" }}>{b.med.nome}</td><td style={{ padding: "3px 6px", textAlign: "right" }}>{fmt(b.saldoIni)}</td><td style={{ padding: "3px 6px", textAlign: "right" }}>+{fmt(b.ent)}</td><td style={{ padding: "3px 6px", textAlign: "right" }}>−{fmt(b.sai)}</td><td style={{ padding: "3px 6px", textAlign: "right", fontWeight: 700 }}>{fmt(b.saldoFim)}</td></tr>))}</tbody>
          </table>
          <div style={{ fontSize: 10, color: "#64748b" }}>Documento de apoio ao controle de psicotrópicos/entorpecentes (Portaria 344/98). Conferir com a escrituração oficial do serviço.</div>
        </div>
      )}
    </div>
  );
}

// Medicamentos NÃO padronizados (trazidos pela família) — registro e controle
function FarmNaoPadronizadosView({ sb, currentUser, canEdit }) {
  const vazio = { paciente_iniciais: "", paciente_prontuario: "", setor: "", medicamento: "", apresentacao: "", quantidade: "", unidade: "", lote: "", validade: "", origem: "", observacao: "" };
  const [lista, setLista] = useState([]);
  const [f, setF] = useState(vazio);
  const [busca, setBusca] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const isMaster = currentUser?.role === "adm_master";
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  const lbl = { fontSize: 11, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 4 };

  function refresh() { if (sb) loadFarmNaoPadronizados(sb).then(setLista); }
  useEffect(() => { refresh(); const onF = () => refresh(); window.addEventListener("focus", onF); return () => window.removeEventListener("focus", onF); }, []);

  async function salvar() {
    if (!f.paciente_iniciais.trim()) { alert("Informe as iniciais do paciente."); return; }
    if (!f.medicamento.trim()) { alert("Informe o medicamento."); return; }
    setBusy(true);
    await addFarmNaoPadronizadoRemote(sb, { paciente_iniciais: f.paciente_iniciais.trim(), paciente_prontuario: f.paciente_prontuario.trim() || null, setor: f.setor.trim() || null, medicamento: f.medicamento.trim(), apresentacao: f.apresentacao.trim() || null, quantidade: f.quantidade === "" ? null : Number(f.quantidade), unidade: f.unidade.trim() || null, lote: f.lote.trim() || null, validade: f.validade || null, origem: f.origem.trim() || null, observacao: f.observacao.trim() || null, status: "recebido", conferido: false }, currentUser);
    registrarAuditoria(sb, currentUser, "farmácia: receber medicamento não padronizado", `${f.paciente_iniciais} · ${f.medicamento}`, {});
    setF(vazio); setBusy(false); setTimeout(refresh, 350);
  }
  async function mudarStatus(r, status) { await updateFarmNaoPadronizadoRemote(sb, r.id, { status }); registrarAuditoria(sb, currentUser, "farmácia: não padronizado " + status, `${r.paciente_iniciais} · ${r.medicamento}`, {}); setTimeout(refresh, 250); }
  async function toggleConferido(r) { await updateFarmNaoPadronizadoRemote(sb, r.id, { conferido: !r.conferido }); setTimeout(refresh, 250); }
  async function excluir(r) { if (!confirm(`Excluir o registro de ${r.medicamento} (${r.paciente_iniciais})?`)) return; await deleteFarmNaoPadronizadoRemote(sb, r.id); setTimeout(refresh, 250); }

  const q = busca.trim().toLowerCase();
  const filtrada = lista.filter(r => (!q || `${r.paciente_iniciais} ${r.paciente_prontuario || ""} ${r.medicamento}`.toLowerCase().includes(q)) && (!fStatus || r.status === fStatus));
  const ativos = lista.filter(r => r.status === "recebido" || r.status === "em_uso").length;

  return (
    <div>
      <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 14 }}>Medicamentos <strong>fora do catálogo</strong> trazidos pelo paciente/família. Recebimento, conferência e controle até devolução/descarte. {ativos} em posse da farmácia.</div>

      {canEdit && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "1rem", marginBottom: "1.25rem" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", marginBottom: 10 }}>Receber medicamento não padronizado</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 10 }}>
            <div><label style={lbl}>Iniciais *</label><input value={f.paciente_iniciais} onChange={e => set("paciente_iniciais", e.target.value)} placeholder="M.S.O." style={inp} /></div>
            <div><label style={lbl}>Prontuário *</label><input value={f.paciente_prontuario} onChange={e => set("paciente_prontuario", e.target.value)} style={inp} /></div>
            <div><label style={lbl}>Setor / leito</label><input value={f.setor} onChange={e => set("setor", e.target.value)} placeholder="Enfermaria 2" style={inp} /></div>
            <div><label style={lbl}>Trazido por</label><input value={f.origem} onChange={e => set("origem", e.target.value)} placeholder="Familiar" style={inp} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 10 }}>
            <div><label style={lbl}>Medicamento *</label><input value={f.medicamento} onChange={e => set("medicamento", e.target.value)} placeholder="Nome do medicamento" style={inp} /></div>
            <div><label style={lbl}>Apresentação</label><input value={f.apresentacao} onChange={e => set("apresentacao", e.target.value)} placeholder="500 mg comprimido" style={inp} /></div>
            <div><label style={lbl}>Quantidade</label><input type="number" min="0" step="any" value={f.quantidade} onChange={e => set("quantidade", e.target.value)} style={inp} /></div>
            <div><label style={lbl}>Unidade</label><input value={f.unidade} onChange={e => set("unidade", e.target.value)} placeholder="comprimido" style={inp} /></div>
            <div><label style={lbl}>Lote</label><input value={f.lote} onChange={e => set("lote", e.target.value)} style={inp} /></div>
            <div><label style={lbl}>Validade</label><input type="date" value={f.validade} onChange={e => set("validade", e.target.value)} style={inp} /></div>
          </div>
          <div style={{ marginBottom: 10 }}><label style={lbl}>Observação</label><input value={f.observacao} onChange={e => set("observacao", e.target.value)} placeholder="Estado da embalagem, conferência, etc." style={inp} /></div>
          <button onClick={salvar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Registrar recebimento"}</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar paciente ou medicamento…" style={{ ...inp, maxWidth: 300, flex: "1 1 200px" }} />
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={{ ...inp, maxWidth: 200 }}>
          <option value="">Todos os status</option>
          {Object.entries(NAOPAD_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {filtrada.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>{lista.length ? "Nenhum resultado." : "Nenhum medicamento não padronizado registrado."}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtrada.map(r => { const st = NAOPAD_STATUS[r.status] || NAOPAD_STATUS.recebido; return (
            <div key={r.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${st.cor}`, borderRadius: 9, padding: "10px 13px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 13 }}>{r.medicamento}</strong>
                {r.apresentacao && <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{r.apresentacao}</span>}
                {r.quantidade != null && <span style={{ fontSize: 11.5, color: "var(--text-2)" }}>· {farmFmtQtd(r.quantidade)} {r.unidade || ""}</span>}
                <span style={{ fontSize: 10, fontWeight: 800, color: st.cor, border: `1px solid ${st.cor}66`, borderRadius: 99, padding: "0 7px", textTransform: "uppercase" }}>{st.label}</span>
                {r.conferido && <span style={{ fontSize: 10, fontWeight: 700, color: "#34d399" }}>✓ conferido</span>}
                <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>{r.paciente_iniciais}{r.paciente_prontuario ? ` · ${r.paciente_prontuario}` : ""}{r.setor ? ` · ${r.setor}` : ""}</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{r.origem ? `trazido por ${r.origem} · ` : ""}{r.lote ? `lote ${r.lote} · ` : ""}{r.validade ? `val ${fmtDataBR(r.validade)} · ` : ""}recebido {r.created_at ? new Date(r.created_at).toLocaleDateString("pt-BR") : ""}{r.observacao ? ` · ${r.observacao}` : ""}</div>
              {canEdit && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  <button onClick={() => toggleConferido(r)} style={btnContorno(r.conferido ? "#8d99ab" : "#34d399")}>{r.conferido ? "Desmarcar conferido" : "Marcar conferido"}</button>
                  {r.status === "recebido" && <button onClick={() => mudarStatus(r, "em_uso")} style={btnContorno("#3b82f6")}>Em uso</button>}
                  {(r.status === "recebido" || r.status === "em_uso") && <><button onClick={() => mudarStatus(r, "devolvido")} style={btnContorno("#34d399")}>Devolver</button><button onClick={() => mudarStatus(r, "descartado")} style={btnContorno("#8d99ab")}>Descartar</button></>}
                  {isMaster && <button onClick={() => excluir(r)} style={btnContorno("#f43f5e")}>Excluir</button>}
                </div>
              )}
            </div>
          ); })}
        </div>
      )}
    </div>
  );
}

// Intervenção farmacêutica (estilo NoHarm): identifica o problema, propõe conduta, acompanha o desfecho
function FarmIntervencaoView({ sb, currentUser, canEdit }) {
  const [atends, setAtends] = useState([]);
  const [itens, setItens] = useState([]);
  const [meds, setMeds] = useState([]);
  const [interacoes, setInteracoes] = useState([]);
  const [incompatY, setIncompatY] = useState([]);
  const [intervs, setIntervs] = useState([]);
  const [nova, setNova] = useState(null);
  const [fStatus, setFStatus] = useState("");
  const [aberto, setAberto] = useState({});
  const [, setTick] = useState(0);
  const isMaster = currentUser?.role === "adm_master";

  function refresh() {
    if (!sb) return;
    loadFarmMedicamentos(sb).then(setMeds);
    loadFarmInteracoes(sb).then(setInteracoes);
    loadFarmIncompatY(sb).then(setIncompatY);
    loadFarmIntervencoes(sb).then(setIntervs);
    loadPsAtendimentos(sb).then(async ats => { setAtends(ats); setItens(await loadPsPrescricaoItensByAtendimentos(sb, ats.map(a => a.id))); });
  }
  useEffect(() => { refresh(); const onF = () => refresh(); window.addEventListener("focus", onF); const id = setInterval(() => setTick(t => t + 1), 60000); return () => { window.removeEventListener("focus", onF); clearInterval(id); }; }, []);

  const medById = {}; meds.forEach(m => medById[m.id] = m);
  const comAlerta = atends.map(a => {
    const its = itens.filter(i => i.atendimento_id === a.id);
    const ctx = { idade: a.idade, peso: a.peso, clearance_renal: a.clearance_renal, funcao_hepatica: a.funcao_hepatica, alergias: a.alergias, em_sonda: a.em_sonda, gestante: a.gestante, comorbidades: a.comorbidades };
    return { at: a, alertas: analisarPrescricaoClinica(its, ctx, medById, interacoes, incompatY) };
  }).filter(x => x.alertas.length > 0).sort((a, b) => b.alertas.length - a.alertas.length);

  const jaIntervencionado = (atId, tipo, med) => intervs.some(i => i.atendimento_id === atId && i.tipo === tipo && (i.medicamento_nome || "") === (med || "") && i.status !== "cancelada");

  const pend = intervs.filter(i => i.status === "pendente").length;
  const aceitas = intervs.filter(i => i.status === "aceita").length;
  const naoAceitas = intervs.filter(i => i.status === "nao_aceita").length;
  const taxa = (aceitas + naoAceitas) ? (aceitas / (aceitas + naoAceitas)) * 100 : null;
  const intervsFiltradas = intervs.filter(i => !fStatus || i.status === fStatus);

  async function salvar(row) { await addFarmIntervencaoRemote(sb, row, currentUser); registrarAuditoria(sb, currentUser, "intervenção farmacêutica", `${row.paciente_iniciais || "?"} · ${row.medicamento_nome || row.tipo || ""}`, {}); setNova(null); setTimeout(refresh, 350); }
  async function mudarStatus(iv, status) { let desfecho = iv.desfecho; if (status === "nao_aceita" || status === "resolvida") { const d = prompt(status === "nao_aceita" ? "Motivo da não aceitação (opcional):" : "Observação do desfecho (opcional):", iv.desfecho || ""); if (d !== null) desfecho = d; } await updateFarmIntervencaoRemote(sb, iv.id, { status, desfecho: desfecho || null }); registrarAuditoria(sb, currentUser, "intervenção: " + status, iv.paciente_iniciais || "", {}); setTimeout(refresh, 250); }
  async function excluir(iv) { if (!confirm("Excluir esta intervenção?")) return; await deleteFarmIntervencaoRemote(sb, iv.id); setTimeout(refresh, 250); }
  const intervirDoAlerta = (at, alerta) => setNova({ atendimento_id: at.id, paciente_iniciais: at.iniciais, paciente_prontuario: at.prontuario || "", medicamento_nome: (alerta.itens && alerta.itens[0]) || "", tipo: alerta.tipo, gravidade: alerta.gravidade, problema: `${alerta.titulo}: ${alerta.detalhe}`, conduta: "" });

  const KPI = ({ label, valor, cor, sub }) => (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${cor || "var(--border)"}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: cor || "var(--text)", fontFamily: "JetBrains Mono, monospace", marginTop: 3 }}>{valor}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: "var(--text-muted)", flex: 1, minWidth: 240 }}>Intervenção farmacêutica: identifique o problema, proponha a conduta e acompanhe o desfecho (aceita/não aceita).</div>
        {canEdit && <button onClick={() => setNova({ paciente_iniciais: "", paciente_prontuario: "", medicamento_nome: "", tipo: "", gravidade: "media", problema: "", conduta: "" })} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" }}>+ Nova intervenção</button>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: "1.5rem" }}>
        <KPI label="Pendentes" valor={pend} cor={pend ? "#d97706" : "#34d399"} sub="aguardando resposta" />
        <KPI label="Aceitas" valor={aceitas} cor="#34d399" sub="pelo prescritor" />
        <KPI label="Não aceitas" valor={naoAceitas} cor={naoAceitas ? "#f43f5e" : "var(--border)"} />
        <KPI label="Taxa de aceitação" valor={taxa != null ? Math.round(taxa) + "%" : "—"} cor="#3b82f6" sub="aceitas ÷ respondidas" />
      </div>

      {/* CANDIDATAS — prescrições com alerta */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Prescrições com alerta ({comAlerta.length})</div>
      {comAlerta.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "1.5rem", border: "1px dashed var(--border)", borderRadius: 10, marginBottom: "1.5rem" }}>Nenhuma prescrição com alerta no momento.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "1.5rem" }}>
          {comAlerta.map(c => {
            const exp = aberto[c.at.id];
            return (
              <div key={c.at.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 9 }}>
                <button onClick={() => setAberto(o => ({ ...o, [c.at.id]: !o[c.at.id] }))} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, background: "transparent", border: "none", padding: "10px 13px", cursor: "pointer", textAlign: "left", color: "var(--text)" }}>
                  <strong style={{ flex: 1 }}>{c.at.iniciais}{c.at.prontuario ? ` · reg. ${c.at.prontuario}` : ""}</strong>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#d97706", border: "1px solid #d9770666", borderRadius: 99, padding: "1px 8px" }}>{c.alertas.length} alerta(s)</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{exp ? "▾" : "▸"}</span>
                </button>
                {exp && (
                  <div style={{ padding: "0 13px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                    {c.alertas.map((a, i) => { const jah = jaIntervencionado(c.at.id, a.tipo, (a.itens && a.itens[0]) || ""); return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: FARM_GRAV[a.gravidade].cor + "11", border: `1px solid ${FARM_GRAV[a.gravidade].cor}44`, borderRadius: 8, padding: "8px 11px" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700 }}><span style={{ fontSize: 9.5, fontWeight: 800, color: FARM_GRAV[a.gravidade].cor, marginRight: 6, textTransform: "uppercase" }}>{FARM_GRAV[a.gravidade].label}</span>{a.titulo}</div>
                          <div style={{ fontSize: 11.5, color: "var(--text-2)" }}>{a.detalhe}</div>
                        </div>
                        {canEdit && (jah ? <span style={{ fontSize: 10.5, color: "#34d399", fontWeight: 700, whiteSpace: "nowrap" }}>✓ intervenção</span> : <button onClick={() => intervirDoAlerta(c.at, a)} style={btnContorno("#22d3ee")}>Intervir</button>)}
                      </div>
                    ); })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* INTERVENÇÕES REGISTRADAS */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em" }}>Intervenções registradas ({intervs.length})</div>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 9px", color: "var(--text)", fontSize: 12.5, outline: "none", marginLeft: "auto" }}>
          <option value="">Todos os status</option>
          {Object.entries(INTERV_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      {intervsFiltradas.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "1.5rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Nenhuma intervenção registrada.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {intervsFiltradas.map(iv => { const st = INTERV_STATUS[iv.status] || INTERV_STATUS.pendente; return (
            <div key={iv.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${st.cor}`, borderRadius: 9, padding: "10px 13px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 13 }}>{iv.paciente_iniciais || "?"}{iv.paciente_prontuario ? ` · ${iv.paciente_prontuario}` : ""}</strong>
                {iv.medicamento_nome && <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>· {iv.medicamento_nome}</span>}
                {iv.tipo && <span style={{ fontSize: 10, color: "var(--text-3)", border: "1px solid var(--border-2)", borderRadius: 99, padding: "0 6px" }}>{FARM_ALERTA_TIPOS[iv.tipo] || iv.tipo}</span>}
                <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 800, color: st.cor, border: `1px solid ${st.cor}66`, borderRadius: 99, padding: "0 7px", textTransform: "uppercase" }}>{st.label}</span>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 5, lineHeight: 1.5 }}><strong>Problema:</strong> {iv.problema}</div>
              {iv.conduta && <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 2, lineHeight: 1.5 }}><strong>Conduta:</strong> {iv.conduta}</div>}
              {iv.desfecho && <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>Desfecho: {iv.desfecho}</div>}
              <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 4 }}>{iv.farmaceutico || "?"} · {iv.created_at ? new Date(iv.created_at).toLocaleString("pt-BR") : ""}</div>
              {canEdit && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {iv.status === "pendente" && <>
                    <button onClick={() => mudarStatus(iv, "aceita")} style={btnContorno("#34d399")}>Aceita</button>
                    <button onClick={() => mudarStatus(iv, "nao_aceita")} style={btnContorno("#f43f5e")}>Não aceita</button>
                  </>}
                  {iv.status !== "resolvida" && iv.status !== "cancelada" && <button onClick={() => mudarStatus(iv, "resolvida")} style={btnContorno("#3b82f6")}>Resolvida</button>}
                  {iv.status !== "cancelada" && <button onClick={() => mudarStatus(iv, "cancelada")} style={btnContorno("#8d99ab")}>Cancelar</button>}
                  {isMaster && <button onClick={() => excluir(iv)} style={btnContorno("#f43f5e")}>Excluir</button>}
                </div>
              )}
            </div>
          ); })}
        </div>
      )}

      {nova && <FarmIntervencaoModal prefill={nova} onClose={() => setNova(null)} onSave={salvar} />}
    </div>
  );
}

// Modal de registro de intervenção farmacêutica
function FarmIntervencaoModal({ prefill, onClose, onSave }) {
  const [f, setF] = useState({ ...prefill });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  const lbl = { fontSize: 11, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 4 };
  async function salvar() {
    if (!f.paciente_iniciais?.trim()) { alert("Informe as iniciais do paciente."); return; }
    if (!f.problema?.trim()) { alert("Descreva o problema."); return; }
    setBusy(true);
    await onSave({ atendimento_id: f.atendimento_id || null, prescricao_item_id: f.prescricao_item_id || null, medicamento_nome: f.medicamento_nome?.trim() || null, paciente_iniciais: f.paciente_iniciais.trim(), paciente_prontuario: f.paciente_prontuario?.trim() || null, tipo: f.tipo || null, gravidade: f.gravidade || "media", problema: f.problema.trim(), conduta: f.conduta?.trim() || null, status: "pendente" });
    setBusy(false);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 540, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Registrar intervenção farmacêutica</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Iniciais *</label><input value={f.paciente_iniciais || ""} onChange={e => set("paciente_iniciais", e.target.value)} style={inp} /></div>
          <div><label style={lbl}>Prontuário *</label><input value={f.paciente_prontuario || ""} onChange={e => set("paciente_prontuario", e.target.value)} style={inp} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Medicamento</label><input value={f.medicamento_nome || ""} onChange={e => set("medicamento_nome", e.target.value)} placeholder="Medicamento envolvido" style={inp} /></div>
          <div><label style={lbl}>Gravidade</label><select value={f.gravidade || "media"} onChange={e => set("gravidade", e.target.value)} style={inp}><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select></div>
        </div>
        <div style={{ marginBottom: 10 }}><label style={lbl}>Problema identificado *</label><textarea value={f.problema || ""} onChange={e => set("problema", e.target.value)} rows={3} placeholder="Ex.: dose acima da máxima, interação, duplicidade…" style={{ ...inp, resize: "vertical" }} /></div>
        <div style={{ marginBottom: 16 }}><label style={lbl}>Conduta proposta</label><textarea value={f.conduta || ""} onChange={e => set("conduta", e.target.value)} rows={2} placeholder="Recomendação ao prescritor" style={{ ...inp, resize: "vertical" }} /></div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={salvar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Registrar"}</button>
        </div>
      </div>
    </div>
  );
}

// Dashboard da Farmácia — visão geral com atalhos
function FarmDashboardView({ sb, currentUser, canEdit, onNav }) {
  const [ats, setAts] = useState([]);
  const [pres, setPres] = useState([]);
  const [prep, setPrep] = useState([]);
  const [itens, setItens] = useState([]);
  const [meds, setMeds] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [intervs, setIntervs] = useState([]);
  const [interacoes, setInteracoes] = useState([]);
  const [incompatY, setIncompatY] = useState([]);
  // O KPI de alertas cruza atendimentos × itens × base clínica, que chegam em
  // rodadas separadas. Enquanto a primeira carga não fecha, o cartão mostra
  // "—" em vez de piscar 0 — que se leria como "nenhum alerta" e é justo o
  // oposto do que a farmácia precisa ver.
  const [carregando, setCarregando] = useState(true);
  const [, setTick] = useState(0);

  function refresh() {
    if (!sb) return;
    loadFarmLotes(sb).then(setLotes);
    loadFarmIntervencoes(sb).then(setIntervs);
    loadFarmPreparo(sb).then(setPrep);
    Promise.all([
      loadFarmMedicamentos(sb).then(setMeds),
      loadFarmInteracoes(sb).then(setInteracoes),
      loadFarmIncompatY(sb).then(setIncompatY),
      loadPsAtendimentos(sb).then(async a => { setAts(a); const ids = a.map(x => x.id); setPres(await loadPsPrescricoesByAtendimentos(sb, ids)); setItens(await loadPsPrescricaoItensByAtendimentos(sb, ids)); }),
    ]).finally(() => setCarregando(false));
  }
  useEffect(() => { refresh(); const onF = () => refresh(); window.addEventListener("focus", onF); const id = setInterval(() => setTick(t => t + 1), 60000); return () => { window.removeEventListener("focus", onF); clearInterval(id); }; }, []);

  const medById = {}; meds.forEach(m => medById[m.id] = m);
  const prepByReg = {}; prep.forEach(p => prepByReg[p.registro_id] = p);
  const atSet = new Set(ats.map(a => a.id));
  const aguardando = pres.filter(r => atSet.has(r.atendimento_id) && !prepByReg[r.id]).length;
  const emPreparo = prep.filter(p => p.status === "preparo").length;
  const prontos = prep.filter(p => p.status === "pronto").length;
  const comAlerta = ats.filter(a => { const its = itens.filter(i => i.atendimento_id === a.id); const ctx = { idade: a.idade, peso: a.peso, clearance_renal: a.clearance_renal, funcao_hepatica: a.funcao_hepatica, alergias: a.alergias, em_sonda: a.em_sonda, gestante: a.gestante, comorbidades: a.comorbidades }; return analisarPrescricaoClinica(its, ctx, medById, interacoes, incompatY).length > 0; }).length;
  const intervPend = intervs.filter(i => i.status === "pendente").length;
  const ativos = meds.filter(m => m.ativo !== false);
  const rupturas = ativos.filter(m => farmStatusEstoque(m, lotes).key === "zerado").length;
  const abaixoMin = ativos.filter(m => farmStatusEstoque(m, lotes).key === "baixo").length;
  const lotesEst = lotes.filter(l => Number(l.quantidade) > 0);
  const venc = lotesEst.filter(l => ["vencido", "vencendo"].includes(infoDeValidade(l.validade).status)).length;

  const Card = ({ label, valor, cor, sub, nav }) => (
    <button onClick={() => nav && onNav && onNav(nav)} style={{ textAlign: "left", background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${cor}`, borderRadius: 10, padding: "14px 16px", cursor: nav ? "pointer" : "default" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: valor ? cor : "var(--text)", fontFamily: "JetBrains Mono, monospace", marginTop: 4 }}>{valor}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </button>
  );
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
        <Card label="Solicitações a preparar" valor={aguardando} cor={VX.azul} sub="prescrições aguardando" nav="preparo" />
        <Card label="Em preparo" valor={emPreparo} cor="#d97706" sub="separando" nav="preparo" />
        <Card label="Prontos p/ retirada" valor={prontos} cor={VX.turquesa} sub="aguardando enfermagem" nav="preparo" />
        <Card label="Prescrições com alerta" valor={carregando ? "—" : comAlerta} cor="#f43f5e" sub="análise clínica" nav="analise" />
        <Card label="Intervenções pendentes" valor={intervPend} cor="#d97706" sub="aguardando resposta" nav="intervencao" />
        <Card label="Rupturas de estoque" valor={rupturas} cor={rupturas ? "#f43f5e" : "#34d399"} sub="itens sem saldo" nav="estoque" />
        <Card label="Abaixo do mínimo" valor={abaixoMin} cor={abaixoMin ? "#d97706" : "#34d399"} sub="repor" nav="estoque" />
        <Card label="Validade em risco" valor={venc} cor={venc ? "#d97706" : "#34d399"} sub="vencidos / ≤30 dias" nav="estoque" />
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 16 }}>Clique nos cartões para ir direto à ferramenta. Atualiza automaticamente.</div>
    </div>
  );
}

// Interações — base de interações + incompatibilidade em Y (página)
function FarmInteracoesView({ sb, currentUser, canEdit }) {
  const [interacoes, setInteracoes] = useState([]);
  const [incompatY, setIncompatY] = useState([]);
  const [showBase, setShowBase] = useState(false);
  const gravCor = g => g === "grave" ? "#f43f5e" : g === "leve" ? "#3b82f6" : "#d97706";
  function refresh() { if (sb) { loadFarmInteracoes(sb).then(setInteracoes); loadFarmIncompatY(sb).then(setIncompatY); } }
  useEffect(() => { refresh(); const onF = () => refresh(); window.addEventListener("focus", onF); return () => window.removeEventListener("focus", onF); }, []);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Base de interações medicamentosas e incompatibilidade em Y — usada pela análise clínica. {interacoes === null || incompatY === null ? "Base não lida." : `${interacoes.length} interações · ${incompatY.length} incompatibilidades.`}</div>
        {canEdit && <button onClick={() => setShowBase(true)} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Gerenciar base</button>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", marginBottom: 8 }}>Interações ({(interacoes || []).length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 420, overflowY: "auto" }}>
            {/* 🔴 null e [] dizem coisas diferentes: "não deu para ler" não pode
                 aparecer como "não há nenhuma cadastrada". */}
            {interacoes === null && <div style={{ fontSize: 12.5, color: "#f43f5e", fontWeight: 600 }}>Não foi possível ler a base de interações. A análise de prescrição NÃO está conferindo interações agora.</div>}
            {interacoes && interacoes.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nenhuma interação cadastrada.</div>}
            {(interacoes || []).map(r => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "7px 11px", fontSize: 12.5 }}>
                <span style={{ fontSize: 9.5, fontWeight: 800, color: gravCor(r.gravidade), border: `1px solid ${gravCor(r.gravidade)}66`, borderRadius: 99, padding: "0 6px", textTransform: "uppercase", whiteSpace: "nowrap" }}>{r.gravidade}</span>
                <span style={{ flex: 1 }}><strong>{r.substancia_a} × {r.substancia_b}</strong>{r.descricao ? <span style={{ color: "var(--text-muted)" }}> — {r.descricao}</span> : ""}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", marginBottom: 8 }}>Incompatibilidade em Y ({(incompatY || []).length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 420, overflowY: "auto" }}>
            {incompatY === null && <div style={{ fontSize: 12.5, color: "#f43f5e", fontWeight: 600 }}>Não foi possível ler a base de incompatibilidade em Y.</div>}
            {incompatY && incompatY.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nenhuma cadastrada.</div>}
            {(incompatY || []).map(r => (
              <div key={r.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "7px 11px", fontSize: 12.5 }}>
                <strong>{r.substancia_a} × {r.substancia_b}</strong>{r.descricao ? <span style={{ color: "var(--text-muted)" }}> — {r.descricao}</span> : ""}
              </div>
            ))}
          </div>
        </div>
      </div>
      {showBase && <FarmInteracoesModal sb={sb} interacoes={interacoes} incompatY={incompatY} currentUser={currentUser} canEdit={canEdit} onClose={() => { setShowBase(false); refresh(); }} />}
    </div>
  );
}

// Assistente local (grátis) — responde perguntas sobre o setor a partir dos dados
const FARM_ASSIST_HELP = 'Posso responder sobre: panorama do setor, pendências/solicitações, prontos para retirada, o que vai faltar (previsão de 7 dias), medicamentos mais usados, consumo por classe, dispensações do mês/hoje, custos (por paciente), controlados, zerados, estoque mínimo, validade (lista de lotes), tamanho do catálogo, alertas clínicos e intervenções. Ex.: "panorama", "o que vai faltar?", "top do mês", "consumo por classe", "quais vencendo?", "custo do paciente MSO", "saldo de dipirona".';

function FarmAssistenteView({ sb }) {
  const [meds, setMeds] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [saidas30, setSaidas30] = useState([]);
  const [movsMes, setMovsMes] = useState([]);
  const [ats, setAts] = useState([]);
  const [itens, setItens] = useState([]);
  const [pres, setPres] = useState([]);
  const [prep, setPrep] = useState([]);
  const [intervs, setIntervs] = useState([]);
  const [interacoes, setInteracoes] = useState([]);
  const [incompatY, setIncompatY] = useState([]);
  const [msgs, setMsgs] = useState([{ role: "a", text: "Olá! Sou o assistente local da farmácia. " + FARM_ASSIST_HELP }]);
  const [q, setQ] = useState("");
  const fimRef = useRef(null);

  function refresh() {
    if (!sb) return;
    loadFarmMedicamentos(sb).then(setMeds);
    loadFarmLotes(sb).then(setLotes);
    loadFarmSaidasDesde(sb, new Date(Date.now() - FARM_PREV_JANELA * 86400000).toISOString()).then(setSaidas30);
    const ini = new Date(); ini.setDate(1); ini.setHours(0, 0, 0, 0);
    const fim = new Date(ini.getFullYear(), ini.getMonth() + 1, 1);
    loadFarmMovimentosPeriodo(sb, ini.toISOString(), fim.toISOString()).then(setMovsMes);
    loadFarmIntervencoes(sb).then(setIntervs);
    loadFarmInteracoes(sb).then(setInteracoes);
    loadFarmIncompatY(sb).then(setIncompatY);
    loadFarmPreparo(sb).then(setPrep);
    loadPsAtendimentos(sb).then(async a => { setAts(a); const ids = a.map(x => x.id); setPres(await loadPsPrescricoesByAtendimentos(sb, ids)); setItens(await loadPsPrescricaoItensByAtendimentos(sb, ids)); });
  }
  useEffect(() => { refresh(); const onF = () => refresh(); window.addEventListener("focus", onF); return () => window.removeEventListener("focus", onF); }, []);
  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const medById = {}; meds.forEach(m => medById[m.id] = m);
  const prepByReg = {}; prep.forEach(p => prepByReg[p.registro_id] = p);
  const atSet = new Set(ats.map(a => a.id));
  const aguardando = pres.filter(r => atSet.has(r.atendimento_id) && !prepByReg[r.id]).length;
  const emPreparo = prep.filter(p => p.status === "preparo").length;
  const prontos = prep.filter(p => p.status === "pronto").length;
  const comAlerta = ats.filter(a => { const its = itens.filter(i => i.atendimento_id === a.id); const ctx = { idade: a.idade, peso: a.peso, clearance_renal: a.clearance_renal, funcao_hepatica: a.funcao_hepatica, alergias: a.alergias, em_sonda: a.em_sonda, gestante: a.gestante, comorbidades: a.comorbidades }; return analisarPrescricaoClinica(its, ctx, medById, interacoes, incompatY).length > 0; });
  const intervPend = intervs.filter(i => i.status === "pendente").length;
  const iA = intervs.filter(i => i.status === "aceita").length, iN = intervs.filter(i => i.status === "nao_aceita").length;
  const intervTaxa = (iA + iN) ? (iA / (iA + iN)) * 100 : null;
  const ativos = meds.filter(m => m.ativo !== false);
  const saldo = m => saldoDoMedicamento(m.id, lotes);
  const rupturas = ativos.filter(m => farmStatusEstoque(m, lotes).key === "zerado");
  const abaixoMin = ativos.filter(m => farmStatusEstoque(m, lotes).key === "baixo");
  const aRepor = ativos.filter(m => farmPrecisaRepor(m, lotes));
  const lotesEst = lotes.filter(l => Number(l.quantidade) > 0);
  const vencidos = lotesEst.filter(l => infoDeValidade(l.validade).status === "vencido");
  const vencendo = lotesEst.filter(l => infoDeValidade(l.validade).status === "vencendo");
  const cons30 = {}; saidas30.forEach(s => { if (s.medicamento_id) cons30[s.medicamento_id] = (cons30[s.medicamento_id] || 0) + Number(s.quantidade || 0); });
  const emRisco = ativos.map(m => { const media = (cons30[m.id] || 0) / FARM_PREV_JANELA; const s = saldo(m); return { m, media, cobertura: media > 0 ? s / media : null, sugestao: Math.max(0, Math.ceil(media * FARM_PREV_HORIZONTE + Number(m.estoque_minimo || 0) - s)) }; }).filter(x => x.media > 0 && x.cobertura != null && x.cobertura < FARM_PREV_HORIZONTE).sort((a, b) => a.cobertura - b.cobertura);
  const dispMes = movsMes.filter(m => m.tipo === "saida" && (m.motivo || "") === "Dispensação");
  const consMesMap = {}; dispMes.forEach(m => { if (m.medicamento_id) consMesMap[m.medicamento_id] = (consMesMap[m.medicamento_id] || 0) + Number(m.quantidade || 0); });
  const topMes = Object.entries(consMesMap).map(([id, qtd]) => ({ id: Number(id), qtd, med: medById[Number(id)] })).sort((a, b) => b.qtd - a.qtd);
  const custoPacMap = {}; dispMes.forEach(m => { const k = m.paciente_prontuario || m.paciente_iniciais || "—"; custoPacMap[k] = (custoPacMap[k] || 0) + Number(m.quantidade || 0) * custoUnit(medById[m.medicamento_id]); });
  const custoPac = Object.entries(custoPacMap).map(([pac, v]) => ({ pac, v })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  const custoTotal = custoPac.reduce((s, x) => s + x.v, 0);
  const classeConsMap = {}; dispMes.forEach(m => { const c = medById[m.medicamento_id]?.classe || "Outros"; classeConsMap[c] = (classeConsMap[c] || 0) + Number(m.quantidade || 0); });
  const classeTop = Object.entries(classeConsMap).map(([c, qtd]) => ({ c, qtd })).sort((a, b) => b.qtd - a.qtd);
  const qtdDispMes = dispMes.reduce((s, m) => s + Number(m.quantidade || 0), 0);
  const dispHoje = dispMes.filter(m => m.created_at && todayStr(new Date(m.created_at)) === todayStr());
  const qtdDispHoje = dispHoje.reduce((s, m) => s + Number(m.quantidade || 0), 0);
  const numClasses = new Set(ativos.map(m => m.classe || "Outros")).size;
  const vencendoDet = vencendo.map(l => ({ ...l, nome: medById[l.medicamento_id]?.nome || l.medicamento_id })).sort((a, b) => (a.validade || "").localeCompare(b.validade || ""));

  function responder(pergunta) {
    const s = normTxt(pergunta);
    const has = (...ks) => ks.some(k => s.includes(k));
    if (!s) return FARM_ASSIST_HELP;
    if (has("ajuda", "o que voce", "o que posso", "pode responder", "comando") || s === "?") return FARM_ASSIST_HELP;
    if (has("bom dia", "boa tarde", "boa noite", "tudo bem", "obrigad", "valeu", "de nada") || s === "oi" || s === "ola") return "Olá! " + FARM_ASSIST_HELP;
    if (has("panorama", "resumo", "visao geral", "situacao", "como esta o setor", "como anda", "status do setor", "como esta a farmacia")) {
      return `Panorama da farmácia agora:\n• Preparo: ${aguardando} aguardando · ${emPreparo} em preparo · ${prontos} pronto(s) para retirada\n• Clínica: ${comAlerta.length} prescrição(ões) com alerta · ${intervPend} intervenção(ões) pendente(s)\n• Estoque: ${rupturas.length} zerado(s) · ${abaixoMin.length} abaixo do mínimo · ${emRisco.length} em risco de ruptura (${FARM_PREV_HORIZONTE}d)\n• Validade: ${vencidos.length} lote(s) vencido(s) · ${vencendo.length} vencendo em ≤${DIAS_VENCENDO}d`;
    }
    if (has("saldo", "estoque de", "quanto tem", "tem quanto")) {
      const alvo = meds.find(m => normTxt(m.nome).split(/[ ,]/).some(w => w.length >= 4 && s.includes(w))) || meds.find(m => m.principio_ativo && s.includes(normTxt(m.principio_ativo).split(" ")[0]));
      if (alvo) return `${alvo.nome}: saldo atual ${farmFmtQtd(saldo(alvo))} ${alvo.unidade || ""}.`;
      return `Estoque geral: ${rupturas.length} sem saldo, ${abaixoMin.length} abaixo do mínimo. Pergunte "saldo de <medicamento>" para um item.`;
    }
    if (has("zerado", "esgotad", "sem estoque", "sem saldo", "estoque zero")) {
      if (!rupturas.length) return "Nenhum medicamento zerado no momento. 👍";
      return `${rupturas.length} medicamento(s) sem saldo:\n` + rupturas.slice(0, 12).map(m => `• ${m.nome}`).join("\n") + (rupturas.length > 12 ? `\n… e mais ${rupturas.length - 12}.` : "");
    }
    if (has("faltar", "ruptura", "acabar", "previsao", "demanda", "cobertura")) {
      if (!emRisco.length) return `Nenhum medicamento com previsão de ruptura em ${FARM_PREV_HORIZONTE} dias (consumo dos últimos ${FARM_PREV_JANELA}d).`;
      return `Previsão de ruptura em ${FARM_PREV_HORIZONTE} dias (${emRisco.length}):\n` + emRisco.slice(0, 8).map(x => `• ${x.m.nome} — cobertura ${x.cobertura < 1 ? "<1" : Math.floor(x.cobertura)}d · comprar ${x.sugestao}`).join("\n");
    }
    if (has("mais usado", "mais utilizado", "top", "mais consumido", "ranking")) {
      if (!topMes.length) return "Sem dispensações registradas no mês.";
      return "Top medicamentos do mês:\n" + topMes.slice(0, 5).map((c, i) => `${i + 1}. ${c.med?.nome || "—"} — ${farmFmtQtd(c.qtd)}`).join("\n");
    }
    if (has("classe", "categoria", "terapeutic", "grupo")) {
      if (!classeTop.length) return "Sem dispensações no mês para agrupar por classe.";
      return "Consumo por classe terapêutica (mês):\n" + classeTop.slice(0, 8).map(c => `• ${c.c} — ${farmFmtQtd(c.qtd)}`).join("\n");
    }
    if (has("dispensad", "dispensacao", "dispensou", "quanto saiu", "saida do mes", "saidas do mes")) {
      return `Dispensações no mês: ${dispMes.length} movimento(s) · ${farmFmtQtd(qtdDispMes)} unidade(s).\nHoje: ${dispHoje.length} movimento(s) · ${farmFmtQtd(qtdDispHoje)} unidade(s).`;
    }
    if (has("quantos medicamento", "catalogo", "quantos itens", "quantos remedio", "quantas classes", "tamanho do catalogo")) {
      return `Catálogo ativo: ${ativos.length} medicamento(s) em ${numClasses} classe(s) terapêutica(s).`;
    }
    if (has("custo", "gasto", "gastou", "valor", "preco")) {
      const pacHit = custoPac.find(p => s.includes(normTxt(p.pac)) && normTxt(p.pac).length >= 2);
      if (pacHit) return `Custo dispensado para ${pacHit.pac} no mês: ${fmtReais(pacHit.v)}.`;
      if (!custoPac.length) return "Ainda não há custo apurado. Cadastre o custo unitário dos medicamentos (Estoque → Editar).";
      return `Custo total dispensado no mês: ${fmtReais(custoTotal)}.\nTop pacientes:\n` + custoPac.slice(0, 5).map(p => `• ${p.pac}: ${fmtReais(p.v)}`).join("\n");
    }
    if (has("controlado", "portaria 344", "psicotropico", "entorpecente")) {
      const ctrl = ativos.filter(m => m.controlado);
      const baixo = ctrl.filter(m => { const sd = saldo(m); return sd <= 0 || (Number(m.estoque_minimo || 0) > 0 && sd <= Number(m.estoque_minimo)); });
      return `${ctrl.length} medicamentos controlados. ${baixo.length} com saldo baixo/zerado${baixo.length ? ":\n" + baixo.slice(0, 8).map(m => `• ${m.nome} — ${farmFmtQtd(saldo(m))}`).join("\n") : "."}`;
    }
    if (has("pendencia", "pendente", "aguardando", "solicitac", "preparar", "preparo", "fila")) return `Fluxo de preparo agora: ${aguardando} aguardando · ${emPreparo} em preparo · ${prontos} pronto(s) para retirada.`;
    if (has("pronto", "retirada", "retirar")) return `${prontos} prescrição(ões) pronta(s) para retirada.`;
    if (has("intervencao", "aceitacao", "aceita")) return `Intervenções: ${intervPend} pendente(s). Taxa de aceitação: ${intervTaxa != null ? Math.round(intervTaxa) + "%" : "—"}.`;
    if (has("alerta", "interacao", "alergia", "risco", "problema")) return `${comAlerta.length} paciente(s) com alertas clínicos na prescrição (veja em Prescrições / Análise clínica).`;
    if (has("minimo", "repor", "reposicao", "comprar")) return `${aRepor.length} medicamento(s) a repor — ${rupturas.length} sem saldo e ${abaixoMin.length} abaixo do mínimo${aRepor.length ? ":\n" + aRepor.slice(0, 8).map(m => `• ${m.nome} — saldo ${farmFmtQtd(saldo(m))}`).join("\n") : "."}`;
    if (has("validade", "vencer", "vencendo", "vencido", "vence")) {
      const base = `Validade: ${vencidos.length} lote(s) vencido(s) em estoque · ${vencendo.length} vencendo em ≤${DIAS_VENCENDO} dias.`;
      if (has("quais", "lista", "listar", "detalh", "quem", "mostra") && vencendoDet.length)
        return base + "\nVencendo em breve:\n" + vencendoDet.slice(0, 10).map(l => `• ${l.nome} — lote ${l.lote || "?"} vence ${fmtDataBR(l.validade)} (${farmFmtQtd(l.quantidade)})`).join("\n");
      return base;
    }
    return "Não entendi a pergunta. " + FARM_ASSIST_HELP;
  }
  function enviar(texto) { const t = (texto != null ? texto : q).trim(); if (!t) return; setMsgs(m => [...m, { role: "u", text: t }, { role: "a", text: responder(t) }]); setQ(""); }
  const sugestoes = ["Panorama", "O que vai faltar?", "Top do mês", "Consumo por classe", "Quais vencendo?", "Zerados", "Custo por paciente"];

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
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && enviar()} placeholder="Pergunte sobre o setor…" style={{ flex: 1, background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 13px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none" }} />
        <button onClick={() => enviar()} style={{ background: VX.turquesa, color: "#062a26", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Enviar</button>
      </div>
      <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 6 }}>Assistente local — responde a partir dos dados do sistema; nada é enviado para fora.</div>
    </div>
  );
}
