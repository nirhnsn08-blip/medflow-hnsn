// ═══════════════════════════════════════════════════════════
// PRONTO-SOCORRO — A TELA
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

import { carregarCatalogos, carregarPaciente } from "../atendimento/dados.js";
import { dadosDeConta } from "../atendimento/faturavel.js";
import { PS_ORIGEM_UNIDADES, PS_ORIGENS, PS_VIAS_TRANSF, psPedeDetalhe } from "../atendimento/recepcao.js";
import { registrarAuditoria } from "../auditoria/dados.js";
import { FARM_GRAV, normTxt } from "../clinico/alertas.js";
import { resumoExamesPorCategoria } from "../clinico/exames.js";
import { TriagemModal, AtendimentoModal, PsDesfechoModal, PsAlocarSalaModal, PsProtocolosModal, PsSalasModal, FaixasPediatricasModal, FaixasObstetricasModal } from "./modais.jsx";
import { psContaCenso } from "./apoio.js";
import { FARM_ALERTA_TIPOS } from "../farmacia/catalogo.js";
import { atualizarPreparoRemote, loadFarmIntervencoes, loadFarmPreparo, loadFarmSaidasByAtendimentos, updateFarmIntervencaoRemote } from "../farmacia/dados.js";
import { dispensadoDoItem } from "../farmacia/preparo.js";
import { addSolicitacaoRemote, loadLeitosFromSupabase, loadSetoresFromSupabase, upsertLeitoRemote } from "../leitos/dados.js";
import { AvisoLeitura, HOSPITAL_NOME, HOSPITAL_SIGLA, Icon, MONTHS_FULL, VX, btnContorno } from "../ui/base.jsx";
import { avisoSonoro, ligarSom, somLigado } from "../ui/som.js";
import { diffMin, fmtDur, horaFmt, nowISO, todayStr } from "../util/datas.js";
import { fmt } from "../util/formato.js";
import { MANCHESTER, PS_AREAS, PS_DESFECHOS, PS_DISCRIMINADORES, PS_PRIORIDADE, PS_PROTOCOLO, PS_SALA_STATUS, fmtSinaisVitais } from "./catalogo.js";
import { addPsAtendimentoRemote, addPsSinalRemote, deletePsSalaRemote, loadPsAdministracoesByAtendimentos, loadPsAtendimentos, loadPsAtendimentosPeriodo, loadPsExamesPendentes, loadPsExamesPeriodo, loadPsFinalizadosHoje, loadPsPrescricaoItensByAtendimentos, loadPsSalas, updatePsAtendimentoRemote, upsertPsSalaRemote } from "./dados.js";
import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import PrimeiroUso from "../ui/PrimeiroUso.jsx";
import { useChecagens } from "../ui/usar-checagens.js";

// O cadastro que sustenta este painel. Enquanto ele estiver vazio, os
// números abaixo são zero por falta de configuração — não por falta de
// movimento, que é como um painel zerado se lê. Ver `ui/primeiro-uso.js`.
const BASE_PS = [
  { o: "salas do PS", tabela: "ps_salas", onde: "Pronto-Socorro → Leitos detalhados" },
];


// Cores do Protocolo de Manchester são normativas (semântica clínica oficial).
// Protocolo de Manchester ADAPTADO do HNSN — nomenclatura e tempos-alvo oficiais
// da instituição (confirmados pela enfermagem em 2026-07-21).
// `atend` = tipo de atendimento no vocabulário usado no hospital.
// Barra lateral interna do módulo Pronto-Socorro (bloco Triagem)
const PS_NAV = [
  { key: "painel",      label: "Painel de Triagem",  icon: "dashboard" },
  { key: "classificar", label: "Classificar Paciente", icon: "activity" },
  { key: "fila",        label: "Fila de Espera",     icon: "list" },
  { key: "reavaliacao", label: "Reavaliação",        icon: "clock" },
  { key: "protocolo",   label: "Protocolo Manchester", icon: "clipboard" },
  { key: "indicadores", label: "Indicadores",        icon: "chart" },
];

// Barra lateral interna — bloco EMERGÊNCIA (PS)
const PS_NAV_EMERG = [
  { key: "e_painel",         label: "Painel da Emergência", icon: "dashboard" },
  { key: "e_atendimento",    label: "Em atendimento",       icon: "activity" },
  { key: "e_checagem",       label: "Checagem de medicação", icon: "pill" },
  { key: "e_leitos",         label: "Leitos detalhados",    icon: "bed" },
  { key: "e_transferencias", label: "Transferências",       icon: "truck" },
  { key: "e_aguardando",     label: "Aguardando leito",     icon: "clock" },
  { key: "e_ia",             label: "Assistente IA",        icon: "chat" },
];


// Assistente local do Pronto-Socorro — responde a partir dos dados da tela
const PS_ASSIST_HELP = 'Posso responder sobre: panorama do PS, fila e tempos-alvo, quem está fora do alvo, vagas livres por área, retaguarda vs censo, pacientes em atendimento, aguardando leito, transferências e desfechos do dia. Ex.: "panorama", "quem está fora do alvo?", "vagas livres", "sala vermelha", "aguardando leito".';

function PsAssistenteView({ fila, finalizados, salas, leitos }) {
  const [msgs, setMsgs] = useState([{ role: "a", text: "Olá! Sou o assistente local do Pronto-Socorro. " + PS_ASSIST_HELP }]);
  const [q, setQ] = useState("");
  const fimRef = useRef(null);
  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);
  const agora = nowISO();
  const aguardTri = fila.filter(p => p.status === "aguardando_triagem");
  const aguardAtend = fila.filter(p => p.status === "aguardando_atendimento");
  const emAtend = fila.filter(p => p.status === "em_atendimento");
  const estourou = p => { const alvo = MANCHESTER[p.classificacao]?.alvoMin; if (alvo == null) return false; const m = diffMin(p.triagem_em, agora); return alvo === 0 ? true : (m != null && m > alvo); };
  const fora = aguardAtend.filter(estourou);
  const doCenso = salas.filter(psContaCenso), retag = salas.filter(s => !psContaCenso(s));
  const livres = a => a.filter(s => (s.status || "disponivel") === "disponivel");
  const ocup = a => a.filter(s => s.status === "ocupado");

  function responder(pergunta) {
    const s = normTxt(pergunta);
    const has = (...ks) => ks.some(k => s.includes(k));
    if (!s) return PS_ASSIST_HELP;
    if (has("ajuda", "o que voce", "comando") || s === "?") return PS_ASSIST_HELP;
    if (has("bom dia", "boa tarde", "boa noite", "obrigad", "valeu") || s === "oi" || s === "ola") return "Olá! " + PS_ASSIST_HELP;
    if (has("panorama", "resumo", "visao geral", "situacao", "como esta")) {
      return `Panorama do PS agora:\n• Triagem: ${aguardTri.length} aguardando classificação\n• Fila: ${aguardAtend.length} aguardando atendimento${fora.length ? ` · ⚠ ${fora.length} FORA do tempo-alvo` : " · todos no alvo"}\n• Em atendimento: ${emAtend.length}\n• Vagas: ${livres(salas).length} livre(s) de ${salas.length} (${ocup(salas).length} ocupada(s))\n• Censo: ${doCenso.length} vagas contam nos leitos do hospital · ${retag.length} são retaguarda`;
    }
    if (has("fora do alvo", "estourad", "atrasad", "demorando")) {
      if (!fora.length) return "Ninguém fora do tempo-alvo agora. 👍";
      return `${fora.length} paciente(s) fora do tempo-alvo:\n` + fora.map(p => `• ${p.iniciais} — ${MANCHESTER[p.classificacao]?.label} · esperando ${fmtDur(diffMin(p.triagem_em, agora))} (alvo ${MANCHESTER[p.classificacao]?.alvoMin} min)`).join("\n");
    }
    if (has("vaga", "leito livre", "livres", "disponiv")) {
      const porArea = {}; livres(salas).forEach(s => { const a = s.area || "Outros"; porArea[a] = (porArea[a] || 0) + 1; });
      const linhas = Object.entries(porArea).map(([a, n]) => `• ${a}: ${n} livre(s)`);
      return linhas.length ? `${livres(salas).length} vaga(s) livre(s) no PS:\n` + linhas.join("\n") : "Nenhuma vaga livre no PS no momento.";
    }
    if (has("retaguarda", "censo", "75", "conta")) {
      return `Censo do PS:\n• ${doCenso.length} vaga(s) contam nos leitos do hospital (${ocup(doCenso).length} ocupada(s))\n• ${retag.length} de retaguarda provisória — observação, procedimento, PCR e isolamento infantil — contam SÓ no panorama do PS, por alta rotatividade.`;
    }
    if (has("atendimento", "atendendo")) {
      return emAtend.length ? `${emAtend.length} em atendimento:\n` + emAtend.map(p => { const sl = salas.find(x => x.atendimento_id === p.id); return `• ${p.iniciais}${sl ? ` — ${sl.identificacao}` : ""} · há ${fmtDur(diffMin(p.atendimento_em, agora))}`; }).join("\n") : "Ninguém em atendimento agora.";
    }
    if (has("aguardando leito", "internacao", "internar")) {
      const int = finalizados.filter(p => p.desfecho === "internacao");
      const sem = int.filter(p => !leitos.some(l => l.ps_atendimento_id === p.id || (l.prontuario && p.prontuario && l.prontuario === p.prontuario)));
      return `${int.length} internação(ões) decidida(s) hoje · ${sem.length} ainda sem leito. Leitos livres no hospital: ${leitos.filter(l => l.status === "livre").length}.`;
    }
    if (has("transferencia", "vaga zero", "gerint")) {
      const t = finalizados.filter(p => p.desfecho === "transferencia");
      const via = v => t.filter(p => normTxt(p.observacao).includes(normTxt(v))).length;
      return `${t.length} transferência(s) hoje — Vaga Zero: ${via("Vaga Zero")} · GERINT: ${via("GERINT")}.`;
    }
    if (has("fila", "espera", "aguardando")) {
      return `Fila: ${aguardTri.length} aguardando classificação · ${aguardAtend.length} classificados aguardando atendimento${fora.length ? ` (${fora.length} fora do alvo)` : ""}.`;
    }
    if (has("desfecho", "alta", "obito", "evasao", "hoje")) {
      const c = k => finalizados.filter(p => p.desfecho === k).length;
      return `Desfechos de hoje: alta ${c("alta")} · internação ${c("internacao")} · transferência ${c("transferencia")} · evasão ${c("evasao")} · óbito ${c("obito")}. Total atendidos: ${finalizados.length}.`;
    }
    // busca por área de sala
    const area = [...new Set(salas.map(x => x.area))].find(a => a && s.includes(normTxt(a)));
    if (area) {
      const da = salas.filter(x => x.area === area);
      return `${area}: ${da.length} vaga(s) · ${livres(da).length} livre(s) · ${ocup(da).length} ocupada(s)${da.some(x => !psContaCenso(x)) ? "\n(retaguarda — não conta no censo do hospital)" : ""}`;
    }
    return "Não entendi. " + PS_ASSIST_HELP;
  }
  function enviar(t0) { const t = (t0 != null ? t0 : q).trim(); if (!t) return; setMsgs(m => [...m, { role: "u", text: t }, { role: "a", text: responder(t) }]); setQ(""); }
  const sugestoes = ["Panorama", "Quem está fora do alvo?", "Vagas livres", "Aguardando leito", "Retaguarda vs censo", "Transferências"];
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 260px)", minHeight: 340, maxWidth: 760, marginBottom: 16 }}>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, padding: "4px 2px 12px" }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === "u" ? "flex-end" : "flex-start", maxWidth: "85%", background: m.role === "u" ? VX.royal : "var(--surface)", color: m.role === "u" ? "#fff" : "var(--text)", border: m.role === "u" ? "none" : "1px solid var(--border)", borderRadius: 12, padding: "9px 13px", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.text}</div>
        ))}
        <div ref={fimRef} />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {sugestoes.map(sg => <button key={sg} onClick={() => enviar(sg)} style={{ background: "transparent", color: VX.azul, border: `1px solid ${VX.azul}55`, borderRadius: 99, padding: "4px 11px", fontSize: 11.5, cursor: "pointer" }}>{sg}</button>)}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && enviar()} placeholder="Pergunte sobre o Pronto-Socorro…" style={{ flex: 1, background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 13px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none" }} />
        <button onClick={() => enviar()} style={{ background: VX.azul, color: "#04263b", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Enviar</button>
      </div>
      <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 6 }}>Assistente local — responde a partir dos dados do sistema; nada é enviado para fora.</div>
    </div>
  );
}






function PsRelatorioView({ sb }) {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth());
  const [ano, setAno] = useState(now.getFullYear());
  const [rows, setRows] = useState([]);
  const [exames, setExames] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (!sb) { setRows([]); setExames([]); return; }
    let cancelado = false;
    setCarregando(true);
    loadPsAtendimentosPeriodo(sb, ano, mes).then(r => { if (!cancelado) { setRows(r); setCarregando(false); } });
    loadPsExamesPeriodo(sb, ano, mes).then(r => { if (!cancelado) setExames(r); });
    return () => { cancelado = true; };
  }, [mes, ano]);

  const lbl = { fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 4 };
  const selInp = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none" };
  const fmt1 = v => (v == null || isNaN(v) ? "—" : Number(v).toFixed(1));
  const pct = (n, d) => (d > 0 ? (n / d) * 100 : null);

  // ── Indicadores do período ─────────────────────────────────
  const total = rows.length;
  const finalizados = rows.filter(p => p.status === "finalizado");
  const triados = rows.filter(p => p.classificacao && p.triagem_em);

  const portaTriagem = rows.map(p => diffMin(p.chegada_em, p.triagem_em)).filter(v => v != null && v >= 0);
  const mediaPortaTriagem = portaTriagem.length ? portaTriagem.reduce((a, b) => a + b, 0) / portaTriagem.length : null;
  const permanencias = finalizados.map(p => diffMin(p.chegada_em, p.desfecho_em)).filter(v => v != null && v >= 0);
  const mediaPermanencia = permanencias.length ? permanencias.reduce((a, b) => a + b, 0) / permanencias.length : null;

  // Espera triagem → atendimento, comparada ao alvo de Manchester
  const comEspera = rows.map(p => {
    const alvo = p.classificacao ? MANCHESTER[p.classificacao]?.alvoMin : null;
    const espera = diffMin(p.triagem_em, p.atendimento_em);
    return (alvo == null || espera == null || espera < 0) ? null : { classificacao: p.classificacao, espera, alvo, dentro: espera <= alvo };
  }).filter(Boolean);
  const dentroAlvo = comEspera.filter(x => x.dentro).length;
  const taxaAlvo = pct(dentroAlvo, comEspera.length);

  // Distribuição por classificação de risco
  const porClasse = Object.keys(MANCHESTER).map(k => {
    const doGrupo = triados.filter(p => p.classificacao === k);
    const esperasGrupo = comEspera.filter(x => x.classificacao === k);
    const mediaEspera = esperasGrupo.length ? esperasGrupo.reduce((a, b) => a + b.espera, 0) / esperasGrupo.length : null;
    return {
      k, label: MANCHESTER[k].label, cor: MANCHESTER[k].cor, alvo: MANCHESTER[k].alvoMin,
      n: doGrupo.length, perc: pct(doGrupo.length, triados.length),
      mediaEspera, foraAlvo: esperasGrupo.filter(x => !x.dentro).length,
    };
  });

  // Desfechos do período
  const porDesfecho = Object.keys(PS_DESFECHOS).map(k => ({
    k, label: PS_DESFECHOS[k].label, cor: PS_DESFECHOS[k].cor,
    n: finalizados.filter(p => p.desfecho === k).length,
  }));

  // Série diária de atendimentos (eixo do gráfico)
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const porDia = Array.from({ length: diasNoMes }, (_, i) => {
    const dia = i + 1;
    const n = rows.filter(p => { const d = p.chegada_em ? new Date(p.chegada_em) : null; return d && d.getDate() === dia; }).length;
    return { dia: String(dia).padStart(2, "0"), n };
  });
  const picoDia = porDia.reduce((a, b) => (b.n > a.n ? b : a), { dia: "—", n: 0 });

  // BI de exames do período — separa laboratorial x imagem x outro. A categoria
  // já é gravada em ps_registros; o relatório é que não separava.
  const resumoEx = resumoExamesPorCategoria(exames);
  const examesPorAtend = total > 0 ? resumoEx.n / total : null;

  const printStyles = `@media print { body * { visibility: hidden !important; } #ps-print, #ps-print * { visibility: visible !important; } #ps-print { position: fixed; inset: 0; background: #fff !important; color: #111 !important; padding: 18px; } @page { size: A4 portrait; margin: 12mm; } }`;

  const Kpi = ({ label, valor, unidade, sub, cor }) => (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${cor || "#6366f1"}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "JetBrains Mono, monospace" }}>{valor}<span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>{unidade || ""}</span></div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );

  // Linhas da tabela-resumo (reaproveitadas na tela e no relatório impresso)
  const linhasTabela = porClasse.map(c => [
    c.label,
    fmt(c.n),
    c.perc != null ? `${fmt1(c.perc)}%` : "—",
    c.alvo === 0 ? "imediato" : `${c.alvo} min`,
    c.mediaEspera != null ? fmtDur(c.mediaEspera) : "—",
    c.foraAlvo ? String(c.foraAlvo) : "—",
  ]);

  return (
    <div>
      <style>{printStyles}</style>

      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: "1.25rem" }}>
        <div><div style={lbl}>Mês</div><select value={mes} onChange={e => setMes(+e.target.value)} style={selInp}>{MONTHS_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}</select></div>
        <div><div style={lbl}>Ano</div><input type="number" value={ano} onChange={e => setAno(+e.target.value)} style={{ ...selInp, width: 90 }} /></div>
        <button onClick={() => setPreview(p => !p)} style={{ background: "transparent", color: "#22d3ee", border: "1px solid #164e63", borderRadius: 7, padding: "8px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{preview ? "✕ Fechar relatório" : "Relatório do mês"}</button>
        {preview && <button onClick={() => window.print()} style={{ background: "#34d399", color: "#000", border: "none", borderRadius: 7, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Imprimir / PDF</button>}
        {carregando && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>carregando…</span>}
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: "1.5rem" }}>
        <Kpi label="Atendimentos no mês" valor={fmt(total)} sub={`pico: dia ${picoDia.dia} (${picoDia.n})`} cor="#6366f1" />
        <Kpi label="Finalizados" valor={fmt(finalizados.length)} sub={`${fmt(total - finalizados.length)} em aberto`} cor="#0d9488" />
        <Kpi label="Dentro do tempo-alvo" valor={taxaAlvo != null ? fmt1(taxaAlvo) : "—"} unidade="%" sub={`${dentroAlvo}/${comEspera.length} com espera medida`} cor={taxaAlvo == null ? "var(--border)" : taxaAlvo >= 80 ? "#34d399" : taxaAlvo >= 60 ? "#fbbf24" : "#f43f5e"} />
        <Kpi label="Porta → triagem" valor={mediaPortaTriagem != null ? fmtDur(mediaPortaTriagem) : "—"} sub="tempo médio" cor="#3b82f6" />
        <Kpi label="Permanência média" valor={mediaPermanencia != null ? fmtDur(mediaPermanencia) : "—"} sub="chegada → desfecho" cor="#d97706" />
      </div>

      {/* GRÁFICOS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginBottom: "1.5rem" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Atendimentos por dia — {MONTHS_FULL[mes]}</div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={porDia} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
              <XAxis dataKey="dia" tick={{ fontSize: 9, fill: "var(--text-muted)" }} interval={2} />
              <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} labelFormatter={d => `Dia ${d}`} formatter={v => [v, "atendimentos"]} />
              <Bar dataKey="n" fill="#6366f1" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Classificação de risco (Manchester)</div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={porClasse} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: "var(--text-muted)" }} interval={0} />
              <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={v => [v, "pacientes"]} />
              <Bar dataKey="n" radius={[3, 3, 0, 0]}>{porClasse.map(c => <Cell key={c.k} fill={c.cor} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* TABELA-RESUMO */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Resumo por classificação</div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem", marginBottom: "1.5rem", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr>{["Classificação", "Atend.", "%", "Alvo", "Espera média", "Fora do alvo"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-3)", borderBottom: "1px solid var(--border)", fontSize: 11 }}>{h}</th>)}</tr></thead>
          <tbody>
            {porClasse.map((c, i) => (
              <tr key={c.k}>
                <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)" }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 99, background: c.cor, marginRight: 7 }} />{c.label}</td>
                {linhasTabela[i].slice(1).map((v, j) => <td key={j} style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)", fontFamily: "JetBrains Mono, monospace", color: j === 4 && c.foraAlvo ? "#fb7185" : "var(--text-2)" }}>{v}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* DESFECHOS */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Desfechos do período</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: "1.5rem" }}>
        {porDesfecho.map(d => (
          <div key={d.k} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${d.cor}`, borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)" }}>{d.label}</div>
            <div style={{ fontSize: 19, fontWeight: 800, fontFamily: "JetBrains Mono, monospace" }}>{fmt(d.n)}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{pct(d.n, finalizados.length) != null ? `${fmt1(pct(d.n, finalizados.length))}% dos finalizados` : "—"}</div>
          </div>
        ))}
      </div>

      {/* EXAMES — Laboratorial x Imagem x Outro */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Exames por categoria{examesPorAtend != null ? ` · ${fmt1(examesPorAtend)} por atendimento` : ""}</div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem", marginBottom: "1.5rem", overflowX: "auto" }}>
        {resumoEx.n === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>Nenhum exame solicitado no período.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr>{["Categoria", "Solicitados", "Com resultado", "% com resultado", "Tempo médio até resultado"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-3)", borderBottom: "1px solid var(--border)", fontSize: 11 }}>{h}</th>)}</tr></thead>
            <tbody>
              {resumoEx.porCategoria.map(c => (
                <tr key={c.chave}>
                  <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)" }}>{c.label}</td>
                  <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)", fontFamily: "JetBrains Mono, monospace", color: "var(--text-2)" }}>{fmt(c.n)}</td>
                  <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)", fontFamily: "JetBrains Mono, monospace", color: "var(--text-2)" }}>{fmt(c.comResultado)}</td>
                  <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)", fontFamily: "JetBrains Mono, monospace", color: "var(--text-2)" }}>{c.pctResultado != null ? `${fmt1(c.pctResultado)}%` : "—"}</td>
                  <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)", fontFamily: "JetBrains Mono, monospace", color: "var(--text-2)" }}>{c.tempoMedioMin != null ? fmtDur(c.tempoMedioMin) : "—"}</td>
                </tr>
              ))}
              <tr>
                <td style={{ padding: "6px 8px", fontWeight: 700 }}>Total</td>
                <td style={{ padding: "6px 8px", fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>{fmt(resumoEx.n)}</td>
                <td style={{ padding: "6px 8px", fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>{fmt(resumoEx.comResultado)}</td>
                <td style={{ padding: "6px 8px", fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>{resumoEx.pctResultado != null ? `${fmt1(resumoEx.pctResultado)}%` : "—"}</td>
                <td style={{ padding: "6px 8px", fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>{resumoEx.tempoMedioMin != null ? fmtDur(resumoEx.tempoMedioMin) : "—"}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* RELATÓRIO IMPRIMÍVEL */}
      {preview && (
        <div id="ps-print" style={{ background: "#fff", color: "#111", borderRadius: 10, border: "1px solid #e5e7eb", padding: "24px 28px", fontFamily: "Inter, sans-serif", fontSize: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, paddingBottom: 12, borderBottom: "2px solid #e5e7eb" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>RELATÓRIO PRONTO-SOCORRO — {HOSPITAL_SIGLA}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{HOSPITAL_NOME} · Valentrax Healthcare Operations · Triagem de Manchester e jornada do paciente</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", background: "#f1f5f9", borderRadius: 8, padding: "6px 14px" }}>{MONTHS_FULL[mes]}/{ano}</div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>Gerado em {new Date().toLocaleString("pt-BR")}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 16 }}>
            {[
              ["Atendimentos", fmt(total)],
              ["Finalizados", fmt(finalizados.length)],
              ["Dentro do alvo", taxaAlvo != null ? `${fmt1(taxaAlvo)}%` : "—"],
              ["Porta → triagem", mediaPortaTriagem != null ? fmtDur(mediaPortaTriagem) : "—"],
              ["Permanência média", mediaPermanencia != null ? fmtDur(mediaPermanencia) : "—"],
            ].map(([k, v]) => (
              <div key={k} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", background: "#f8fafc" }}>
                <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: ".04em", fontWeight: 700 }}>{k}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 6 }}>Distribuição por classificação de risco</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 16 }}>
            <thead><tr>{["Classificação", "Atend.", "%", "Alvo", "Espera média", "Fora do alvo"].map(h => <th key={h} style={{ textAlign: "left", padding: "7px 10px", background: "#f8fafc", color: "#334155", borderBottom: "1.5px solid #e2e8f0", fontSize: 11 }}>{h}</th>)}</tr></thead>
            <tbody>
              {linhasTabela.map((linha, i) => (
                <tr key={i}>
                  {linha.map((v, j) => (
                    <td key={j} style={{ padding: "6px 10px", borderBottom: "1px solid #eef2f7", fontWeight: j === 0 ? 600 : 400, color: j === 0 ? "#0f172a" : j === 5 && v !== "—" ? "#be123c" : "#334155" }}>
                      {j === 0 ? <><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 99, background: porClasse[i].cor, marginRight: 7 }} />{v}</> : v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 6 }}>Desfechos</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 16 }}>
            <thead><tr>{["Desfecho", "Qtd.", "% dos finalizados"].map(h => <th key={h} style={{ textAlign: "left", padding: "7px 10px", background: "#f8fafc", color: "#334155", borderBottom: "1.5px solid #e2e8f0", fontSize: 11 }}>{h}</th>)}</tr></thead>
            <tbody>
              {porDesfecho.map(d => (
                <tr key={d.k}>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #eef2f7", fontWeight: 600, color: "#0f172a" }}>{d.label}</td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #eef2f7", color: "#334155" }}>{fmt(d.n)}</td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #eef2f7", color: "#0369a1", fontWeight: 600 }}>{pct(d.n, finalizados.length) != null ? `${fmt1(pct(d.n, finalizados.length))}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 6 }}>Exames por categoria{examesPorAtend != null ? ` — ${fmt1(examesPorAtend)} por atendimento` : ""}</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 16 }}>
            <thead><tr>{["Categoria", "Solicitados", "Com resultado", "%", "Tempo médio"].map(h => <th key={h} style={{ textAlign: "left", padding: "7px 10px", background: "#f8fafc", color: "#334155", borderBottom: "1.5px solid #e2e8f0", fontSize: 11 }}>{h}</th>)}</tr></thead>
            <tbody>
              {resumoEx.porCategoria.map(c => (
                <tr key={c.chave}>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #eef2f7", fontWeight: 600, color: "#0f172a" }}>{c.label}</td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #eef2f7", color: "#334155" }}>{fmt(c.n)}</td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #eef2f7", color: "#334155" }}>{fmt(c.comResultado)}</td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #eef2f7", color: "#334155" }}>{c.pctResultado != null ? `${fmt1(c.pctResultado)}%` : "—"}</td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #eef2f7", color: "#334155" }}>{c.tempoMedioMin != null ? fmtDur(c.tempoMedioMin) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ fontSize: 10, color: "#94a3b8", borderTop: "1px solid #e5e7eb", paddingTop: 8 }}>
            Relatório gerado pela <strong>Valentrax Healthcare Operations</strong> · Pico de movimento no dia {picoDia.dia} ({picoDia.n} atendimentos). Tempos-alvo conforme Protocolo de Manchester. Documento de apoio à gestão — dados agregados, sem identificação de pacientes.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Faixas pediátricas de referência (Triagem Fase 3) ───────────────────
// A tabela ps_faixas_pediatricas guarda, por faixa de idade, os limites de
// FC e FR que definem as zonas (verde/amarelo/laranja/vermelho). Só ADM Master
// edita. O motor (src/clinico/pediatria.js) lê daqui.
const FAIXAS_PED_KEY = "hnsn_faixas_ped";

const loadFaixasPedLocal = () => { try { return JSON.parse(localStorage.getItem(FAIXAS_PED_KEY) || "[]"); } catch { return []; } };

async function loadFaixasPediatricas(sb) {
  const rows = await sb("ps_faixas_pediatricas?select=*&order=ordem");
  if (Array.isArray(rows)) { try { localStorage.setItem(FAIXAS_PED_KEY, JSON.stringify(rows)); } catch {} return rows; }
  return loadFaixasPedLocal();
}



// ── Critérios obstétricos de risco (Triagem Fase 3) ─────────────────────
// A tabela ps_faixas_obstetricas guarda cada discriminador → nível + os
// limiares de PA. Só ADM Master edita. O motor (src/clinico/obstetricia.js) lê.
const FAIXAS_OBST_KEY = "hnsn_faixas_obst";

const loadFaixasObstLocal = () => { try { return JSON.parse(localStorage.getItem(FAIXAS_OBST_KEY) || "[]"); } catch { return []; } };

async function loadFaixasObstetricas(sb) {
  const rows = await sb("ps_faixas_obstetricas?select=*&order=ordem");
  if (Array.isArray(rows)) { try { localStorage.setItem(FAIXAS_OBST_KEY, JSON.stringify(rows)); } catch {} return rows; }
  return loadFaixasObstLocal();
}



export default function PSPage({ sb, sbCru, currentUser, canEdit }) {
  const [fila, setFila] = useState([]);
  const [finalizados, setFinalizados] = useState([]);
  const [setores, setSetores] = useState([]);
  const [leitos, setLeitos] = useState([]);
  const [obitosInternacao, setObitosInternacao] = useState(0);
  const [aba, setAba] = useState("operacao");   // operacao | relatorio
  const [sub, setSub] = useState("painel");     // ver PS_NAV
  const [novo, setNovo] = useState({ iniciais: "", prontuario: "", queixa: "", origem: "Meios próprios", origem_detalhe: "" });
  const [triando, setTriando] = useState(null);
  const [reavaliando, setReavaliando] = useState(null);
  const [desfechando, setDesfechando] = useState(null);
  const [atendendo, setAtendendo] = useState(null);
  const [atendendoAba, setAtendendoAba] = useState(null);   // abre o modal já na aba certa
  const [examesPend, setExamesPend] = useState({});
  const [checagemPend, setChecagemPend] = useState({});     // medicação entregue e não checada
  const [busy, setBusy] = useState(false);
  const [busca, setBusca] = useState("");
  const [salas, setSalas] = useState([]);
  const [showSalas, setShowSalas] = useState(false);   // gestão do cadastro de salas
  const [showProtocolos, setShowProtocolos] = useState(false);
  const [faixasPed, setFaixasPed] = useState([]);            // faixas pediátricas (Fase 3)
  const [showFaixasPed, setShowFaixasPed] = useState(false); // editor (só ADM Master)
  const [faixasObst, setFaixasObst] = useState([]);          // critérios obstétricos (Fase 3)
  const [showFaixasObst, setShowFaixasObst] = useState(false);
  const [alocando, setAlocando] = useState(null);      // sala recebendo paciente
  // Convênios e procedimentos: sem eles o desfecho não tem o que gravar, e o
  // episódio do PS nunca chega ao faturamento.
  const [catalogos, setCatalogos] = useState({ convenios: [], procedimentos: [] });
  const buscaRef = useRef(null);
  const [, setTick] = useState(0);
  // Ctrl+K foca a busca rápida (padrão de plantão: achar o paciente sem tirar a mão do teclado)
  useEffect(() => {
    const onKey = e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); buscaRef.current?.focus(); }
      if (e.key === "Escape" && document.activeElement === buscaRef.current) setBusca("");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Faixas peds + critérios obstétricos: carrega uma vez (os motores leem deles).
  useEffect(() => { if (sb) { loadFaixasPediatricas(sb).then(setFaixasPed); loadFaixasObstetricas(sb).then(setFaixasObst); } }, []);
  // Catálogo de convênio e procedimento — o mesmo que a Recepção usa. Carrega
  // uma vez: é cadastro, não muda durante o plantão.
  useEffect(() => { if (sb) carregarCatalogos(sb).then(setCatalogos); }, []);

  function refresh() {
    if (!sb) return;
    loadPsAtendimentos(sb).then(r => {
      setFila(r);
      const ids = r.filter(p => p.status === "em_atendimento").map(p => p.id);
      loadPsExamesPendentes(sb, ids).then(list => {
        const m = {};
        list.forEach(x => { m[x.atendimento_id] = m[x.atendimento_id] || { aguardando: 0, prontos: 0 }; if (x.status === "resultado_disponivel") m[x.atendimento_id].prontos++; else m[x.atendimento_id].aguardando++; });
        setExamesPend(m);
      });
      // Medicação já dispensada pela farmácia e ainda sem checagem à beira do leito
      Promise.all([
        loadPsPrescricaoItensByAtendimentos(sb, ids),
        loadFarmSaidasByAtendimentos(sb, ids),
        loadPsAdministracoesByAtendimentos(sb, ids),
      ]).then(([itens, saidasAll, admsAll]) => {
        const m = {};
        itens.forEach(it => {
          const doItem = saidasAll.filter(s => String(s.prescricao_item_id) === String(it.id) && s.tipo !== "entrada");
          // LÍQUIDO, não bruto: se a dispensação foi estornada o medicamento
          // voltou para a farmácia, e cobrar a checagem de uma dose que não
          // está mais no leito é alarme falso — o tipo que ensina a ignorar.
          if (dispensadoDoItem(it.id, saidasAll) <= 0) return;                           // farmácia ainda não entregou
          if (admsAll.some(a => String(a.prescricao_item_id) === String(it.id))) return; // já checado
          const desde = doItem.map(s => s.created_at).filter(Boolean).sort()[0] || null;
          const e = m[it.atendimento_id] || (m[it.atendimento_id] = { itens: [], desde: null });
          e.itens.push(it);
          if (desde && (!e.desde || desde < e.desde)) e.desde = desde;                   // espera pelo mais antigo
        });
        setChecagemPend(m);
      });
    });
    loadPsFinalizadosHoje(sb).then(setFinalizados);
    loadPsSalas(sb).then(setSalas);
    loadSetoresFromSupabase(sb).then(r => r && setSetores(r));
    loadLeitosFromSupabase(sb).then(r => r && setLeitos(r));
    // óbitos ocorridos APÓS internação, hoje (fonte: leitos_saidas)
    const hoje = todayStr();
    sb(`leitos_saidas?desfecho=eq.obito&data_alta=eq.${hoje}&select=id`).then(r => setObitosInternacao(Array.isArray(r) ? r.length : 0));
  }
  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => { window.removeEventListener("focus", onFocus); clearInterval(id); };
  }, []);

  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 11px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", boxSizing: "border-box" };
  const secLbl = { fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 };

  async function registrarChegada() {
    if (!novo.iniciais.trim()) { alert("Informe as iniciais do paciente."); return; }
    // Prontuário obrigatório: é o que liga o paciente ao histórico (Paciente 360)
    // e sustenta a jornada PS → internação. Sem ele o rastro se perde.
    if (!novo.prontuario.trim()) { alert("Informe o número do prontuário.\n\nEle liga este atendimento ao histórico do paciente e à internação. Sem prontuário, a jornada do paciente fica quebrada."); return; }
    if (!novo.origem) { alert("Informe por onde o paciente chegou."); return; }
    if (psPedeDetalhe(novo.origem) && !novo.origem_detalhe.trim()) { alert("Informe a unidade/origem de procedência."); return; }
    setBusy(true);

    // O prontuário precisa EXISTIR, não só estar preenchido.
    //
    // Desde `migracao-atendimento-recepcao.sql` há chave estrangeira de
    // ps_atendimentos para pacientes. Sem esta conferência, digitar um
    // número que não existe faz o PostgREST recusar o INSERT — e o
    // sb devolve null sem alarde. A recepcionista clicaria em
    // "Registrar chegada", a tela limparia o formulário, e o paciente não
    // entraria na fila da triagem. Ninguém seria chamado.
    //
    // Conferir aqui transforma esse silêncio numa instrução: quem não tem
    // cadastro é cadastrado na Recepção, que é a porta feita para isso.
    const cadastrado = await carregarPaciente(sb, novo.prontuario.trim());
    if (!cadastrado) {
      setBusy(false);
      alert(
        `Não existe paciente cadastrado com o prontuário ${novo.prontuario.trim()}.\n\n` +
        "Abra o menu ATENDIMENTO e registre a chegada por lá: ele procura o paciente, " +
        "emite o prontuário quando é a primeira vez e tem o caminho de emergência para " +
        "quem chega sem identificação.\n\n" +
        "Registrar aqui um número que não existe deixaria este atendimento solto — sem " +
        "aparecer no histórico do paciente.");
      return;
    }

    await addPsAtendimentoRemote(sb, {
      iniciais: novo.iniciais.trim(), prontuario: novo.prontuario.trim(),
      queixa: novo.queixa.trim() || null, origem: novo.origem,
      origem_detalhe: novo.origem_detalhe.trim() || null,
      chegada_em: nowISO(), status: "aguardando_triagem",
    }, currentUser);
    registrarAuditoria(sb, currentUser, "PS: chegada", `${novo.iniciais.trim()} · ${novo.origem}${novo.origem_detalhe ? " — " + novo.origem_detalhe : ""}`, {});
    setNovo({ iniciais: "", prontuario: "", queixa: "", origem: "Meios próprios", origem_detalhe: "" });
    setBusy(false); setTimeout(refresh, 400);
  }
  // Converte o extra da triagem (tipo + campos obst/ped) nos campos do banco.
  // Obstétrica marca gestante; pediátrica leva o peso para a coluna peso (que
  // alimenta a checagem de dose). Os detalhes ficam nos blobs jsonb.
  function triagemExtrasPayload(extras) {
    if (!extras) return {};
    const { tipo, obst, ped } = extras;
    const out = { triagem_tipo: tipo || "adulto" };
    if (tipo === "obstetrica") { out.obstetricia = obst || {}; out.gestante = true; }
    if (tipo === "pediatrica") {
      out.pediatria = ped || {};
      if (ped && ped.peso !== "" && ped.peso != null && !isNaN(Number(ped.peso))) out.peso = Number(ped.peso);
    }
    return out;
  }
  async function triar(p, classificacao, vitais, sugerida, comorbidades, extras) {
    await updatePsAtendimentoRemote(sb, p.id, { classificacao, triagem_em: nowISO(), status: "aguardando_atendimento", ...(vitais || {}), ...(comorbidades ? { comorbidades } : {}), ...triagemExtrasPayload(extras) });
    await addPsSinalRemote(sb, { atendimento_id: p.id, ...(vitais || {}), classificacao_sugerida: sugerida || null, classificacao_escolhida: classificacao, aferido_em: nowISO() }, currentUser);
    registrarAuditoria(sb, currentUser, "PS: triagem", `${p.iniciais} → ${classificacao}`, {});
    setTriando(null); setTimeout(refresh, 300);
  }
  async function reavaliar(p, classificacao, vitais, sugerida, comorbidades, extras) {
    await updatePsAtendimentoRemote(sb, p.id, { classificacao, ...(vitais || {}), ...(comorbidades ? { comorbidades } : {}), ...triagemExtrasPayload(extras) });
    await addPsSinalRemote(sb, { atendimento_id: p.id, ...(vitais || {}), classificacao_sugerida: sugerida || null, classificacao_escolhida: classificacao, aferido_em: nowISO() }, currentUser);
    registrarAuditoria(sb, currentUser, "PS: reavaliação", `${p.iniciais} → ${classificacao}`, {});
    setReavaliando(null); setTimeout(refresh, 300);
  }
  // ── Mapa de salas do PS ──
  async function salvarSala(s) {
    await upsertPsSalaRemote(sb, s, currentUser);
    registrarAuditoria(sb, currentUser, s.id ? "PS: editar sala" : "PS: cadastrar sala", s.identificacao, {});
    setTimeout(refresh, 300);
  }
  async function excluirSala(s) {
    if (!confirm(`Excluir a sala "${s.identificacao}"?`)) return;
    await deletePsSalaRemote(sb, s.id);
    registrarAuditoria(sb, currentUser, "PS: excluir sala", s.identificacao, {});
    setTimeout(refresh, 300);
  }
  async function ocuparSala(sala, paciente) {
    await upsertPsSalaRemote(sb, { id: sala.id, status: "ocupado", atendimento_id: paciente.id, ocupado_em: nowISO() }, currentUser);
    registrarAuditoria(sb, currentUser, "PS: alocar sala", `${sala.identificacao} · ${paciente.iniciais}`, {});
    setAlocando(null); setTimeout(refresh, 300);
  }
  // Liberar manda para limpeza (fluxo real: sala usada precisa ser higienizada)
  async function mudarStatusSala(sala, status) {
    await upsertPsSalaRemote(sb, { id: sala.id, status, atendimento_id: status === "ocupado" ? sala.atendimento_id : null, ocupado_em: status === "ocupado" ? sala.ocupado_em : null }, currentUser);
    registrarAuditoria(sb, currentUser, "PS: sala " + status, sala.identificacao, {});
    setTimeout(refresh, 300);
  }
  async function iniciarAtendimento(p) {
    await updatePsAtendimentoRemote(sb, p.id, { atendimento_em: nowISO(), status: "em_atendimento" });
    registrarAuditoria(sb, currentUser, "PS: inicio atendimento", p.iniciais, {});
    setTimeout(refresh, 300);
  }
  async function darDesfecho(p, d) {
    const { desfecho, setorDestino, observacao, medico, leito, convenioId, procedimentoCod, cid } = d;
    // Convênio e procedimento vão JUNTO com o desfecho porque é aqui que o
    // episódio vira faturável — e o procedimento só se sabe no fim. Sem eles,
    // `carregarProducaoFaturavel` (que filtra procedimento_cod=not.is.null)
    // nunca enxerga este atendimento.
    await updatePsAtendimentoRemote(sb, p.id, {
      desfecho, desfecho_em: nowISO(), setor_destino: setorDestino || null,
      observacao: observacao || null, medico: medico || null, status: "finalizado",
      ...dadosDeConta({ convenioId, procedimentoCod, cid }),
    });
    if (desfecho === "internacao") {
      if (leito) {
        // Reserva automática: o leito fica RESERVADO para o paciente até ele subir.
        // No Mapa de leitos, "✓ Chegou" completa a internação (CID/dias) e fecha o
        // ciclo Pronto → Entrada com o tempo real. (disp_em/pronto_em preservados.)
        await upsertLeitoRemote(sb, {
          identificacao: leito.identificacao, status: "reservado",
          iniciais: p.iniciais, prontuario: p.prontuario || null, motivo: p.queixa || null,
          cid: null, dias_previstos: null, data_internacao: null, entrada_em: null,
          solic_em: nowISO(), interdicao_motivo: null,
          ps_atendimento_id: p.id,          // elo forte: não depende do prontuário como texto
        }, currentUser);
        registrarAuditoria(sb, currentUser, "PS: reservar leito", `${p.iniciais} → ${leito.identificacao}`, {});
      } else {
        // Sem leito agora → fila de espera (NIR puxa dali). Sempre entra na
        // fila, mesmo sem setor definido, para nenhuma internação sem leito
        // ficar fora do aviso do NIR.
        await addSolicitacaoRemote(sb, { iniciais: p.iniciais, setor_origem: "Pronto-Socorro", setor_destino: setorDestino || null, hora_pedido: nowISO(), status: "aguardando", ps_atendimento_id: p.id }, currentUser);
      }
    }
    registrarAuditoria(sb, currentUser, "PS: desfecho", `${p.iniciais} → ${desfecho}${medico ? " · Dr(a). " + medico : ""}${leito ? " · leito " + leito.identificacao : setorDestino ? " (" + setorDestino + ")" : ""}`, {});
    setDesfechando(null); setTimeout(refresh, 300);
  }

  const agora = nowISO();
  // Busca rápida (Ctrl+K) — filtra as três filas por iniciais/prontuário/queixa
  const bq = normTxt(busca);
  const casa = p => !bq || [p.iniciais, p.prontuario, p.queixa].some(x => normTxt(x).includes(bq));
  const aguardandoTriagem = fila.filter(p => p.status === "aguardando_triagem").filter(casa);
  const aguardandoAtend = fila.filter(p => p.status === "aguardando_atendimento").filter(casa)
    .sort((a, b) => (PS_PRIORIDADE[a.classificacao] ?? 9) - (PS_PRIORIDADE[b.classificacao] ?? 9) || new Date(a.triagem_em) - new Date(b.triagem_em));
  const emAtendimento = fila.filter(p => p.status === "em_atendimento").filter(casa);
  // Espera atual de um paciente triado e se estourou o tempo-alvo da cor
  const esperaMin = p => diffMin(p.triagem_em || p.chegada_em, p.atendimento_em || agora);
  const estourouAlvo = p => {
    const alvo = p.classificacao ? MANCHESTER[p.classificacao]?.alvoMin : null;
    if (alvo == null) return false;
    const m = esperaMin(p);
    return alvo === 0 ? p.status === "aguardando_atendimento" : (m != null && m > alvo);
  };
  // Aguardando atendimento por cor Manchester (5 níveis) + quantos fora do alvo
  const porCor = Object.keys(MANCHESTER).map(k => {
    const lista = fila.filter(p => p.status === "aguardando_atendimento" && p.classificacao === k);
    return { k, ...MANCHESTER[k], n: lista.length, fora: lista.filter(estourouAlvo).length };
  });
  const foraDoAlvoTotal = porCor.reduce((s, c) => s + c.fora, 0);
  const portaTriagem = fila.concat(finalizados).map(p => diffMin(p.chegada_em, p.triagem_em)).filter(v => v != null);
  const portaTriagemMedia = portaTriagem.length ? portaTriagem.reduce((a, b) => a + b, 0) / portaTriagem.length : null;
  const permanencias = finalizados.map(p => diffMin(p.chegada_em, p.desfecho_em)).filter(v => v != null);
  const permMedia = permanencias.length ? permanencias.reduce((a, b) => a + b, 0) / permanencias.length : null;

  const ClasseBadge = ({ c }) => { const v = MANCHESTER[c]; if (!v) return <span style={{ fontSize: 11, color: "var(--text-muted)" }}>sem triagem</span>;
    return <span style={{ background: v.bg, color: v.cor, border: `1px solid ${v.cor}55`, borderRadius: 99, padding: "2px 10px", fontSize: 11, fontWeight: 800 }}>{v.label}</span>; };
  // Cronômetro contra o tempo-alvo da classificação
  const Espera = ({ p }) => {
    const min = diffMin(p.triagem_em || p.chegada_em, agora);
    const alvo = p.classificacao ? MANCHESTER[p.classificacao]?.alvoMin : null;
    const estourou = alvo != null && min != null && min > alvo && alvo > 0;
    const imediato = p.classificacao === "vermelho";
    return <span style={{ fontSize: 12, fontWeight: 700, color: estourou || imediato ? "#f43f5e" : "var(--text-3)", fontFamily: "JetBrains Mono, monospace" }}>
      {fmtDur(min)}{alvo != null ? ` / alvo ${alvo === 0 ? "imediato" : fmtDur(alvo)}` : ""}{estourou ? " · ESTOURADO" : ""}
    </span>;
  };
  const Card = ({ label, valor, cor }) => (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", minWidth: 130, flex: 1 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: cor || "var(--text)", fontFamily: "JetBrains Mono, monospace", marginTop: 4 }}>{valor}</div>
    </div>
  );
  const linhaPac = { display: "flex", alignItems: "center", gap: 10, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 13px", flexWrap: "wrap" };

  // Relatório mensal (somente leitura) — tela própria, não interfere na operação.
  if (aba === "relatorio") return (
    <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Pronto-Socorro — Relatório mensal</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: "1.25rem" }}>Indicadores agregados do período. Somente leitura — nada é alterado no atendimento.</div>
      <button onClick={() => setAba("operacao")} style={{ background: "transparent", color: "var(--text-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "7px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer", marginBottom: "1.25rem" }}>← Voltar à operação</button>
      <PsRelatorioView sb={sb} />
    </div>
  );

  const navAtual = [...PS_NAV, ...PS_NAV_EMERG].find(n => n.key === sub) || PS_NAV[0];
  const subTexto = {
    e_painel: "Panorama da emergência — ocupação das vagas do PS e fluxo do plantão.",
    e_atendimento: "Pacientes em atendimento agora, com sala e tempo.",
    e_checagem: "Medicação que a farmácia já entregou e ainda não foi checada à beira do leito.",
    e_leitos: "Mapa detalhado das vagas do PS por área, com a regra de censo.",
    e_transferencias: "Transferências externas — Vaga Zero, GERINT e contato direto.",
    e_aguardando: "Pacientes com internação decidida, aguardando leito no hospital.",
    e_ia: "Assistente local do Pronto-Socorro (nada é enviado para fora).",
    painel: "Visão do plantão — risco, fila, salas e encaminhamentos.",
    classificar: "Registrar a chegada e classificar o risco pelo Manchester adaptado.",
    fila: "Pacientes já classificados, na ordem de prioridade e contra o tempo-alvo.",
    reavaliacao: "Quem está esperando há mais tempo e precisa ser reavaliado.",
    protocolo: "Referência do protocolo adaptado do HNSN — níveis, sinais e discriminadores.",
    indicadores: "Indicadores da triagem do dia.",
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* BARRA LATERAL DO PRONTO-SOCORRO — bloco Triagem */}
      <nav style={{ width: 194, minWidth: 194, background: "var(--bg-2)", borderRight: "1px solid var(--border)", padding: "1rem 0", overflowY: "auto", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px 12px" }}>
          <Icon name="activity" size={16} /><span style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".02em", color: VX.turquesa }}>TRIAGEM</span>
        </div>
        {PS_NAV.map(it => { const active = sub === it.key; return (
          <button key={it.key} onClick={() => setSub(it.key)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: ".55rem 16px", border: "none", borderLeft: `3px solid ${active ? VX.turquesa : "transparent"}`, background: active ? "var(--surface)" : "transparent", color: active ? VX.turquesa : "var(--text-3)", cursor: "pointer", textAlign: "left", fontSize: 12.5, fontWeight: active ? 700 : 500, fontFamily: "Inter, sans-serif" }}>
            <Icon name={it.icon} size={16} />{it.label}
          </button>
        ); })}

        <div style={{ height: 1, background: "var(--surface-3)", margin: ".7rem 12px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px 10px" }}>
          <Icon name="bed" size={16} /><span style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".02em", color: VX.azul }}>EMERGÊNCIA (PS)</span>
        </div>
        {PS_NAV_EMERG.map(it => { const active = sub === it.key; return (
          <button key={it.key} onClick={() => setSub(it.key)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: ".55rem 16px", border: "none", borderLeft: `3px solid ${active ? VX.azul : "transparent"}`, background: active ? "var(--surface)" : "transparent", color: active ? VX.azul : "var(--text-3)", cursor: "pointer", textAlign: "left", fontSize: 12.5, fontWeight: active ? 700 : 500, fontFamily: "Inter, sans-serif" }}>
            <Icon name={it.icon} size={16} />{it.label}
          </button>
        ); })}

        <div style={{ height: 1, background: "var(--surface-3)", margin: ".7rem 12px" }} />
        <div style={{ padding: "0 16px" }}>
          <button onClick={() => setAba("relatorio")} style={{ width: "100%", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px", color: "var(--text-3)", cursor: "pointer", fontSize: 11.5, fontWeight: 600 }}>Relatório mensal</button>
        </div>
      </nav>

      {/* CONTEÚDO */}
      <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem 1.5rem", minWidth: 0 }}>
        <PrimeiroUso checagens={useChecagens(sb, BASE_PS)} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{navAtual.label}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: "1.25rem" }}>{subTexto[sub]} Dados de saúde — use iniciais e prontuário (LGPD).</div>
        </div>
      </div>

      {/* 🔴 Fila que não foi lida parece PS vazio. "0 aguardando" é a frase
          que faz o plantão relaxar — e ela não pode ser um erro de rede. */}
      <AvisoLeitura oQue="a fila do Pronto-Socorro e as salas" listas={[fila, salas]} />
      <PsRetiradaBanner sb={sb} currentUser={currentUser} canEdit={canEdit} />
      <PsIntervencaoBanner sb={sb} currentUser={currentUser} canEdit={canEdit} />

      {/* BUSCA RÁPIDA — nas telas de lista (no painel ela só ocupava espaço) */}
      {["classificar", "fila", "reavaliacao", "e_atendimento", "e_aguardando"].includes(sub) && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 320px", maxWidth: 420 }}>
            <input ref={buscaRef} value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar paciente por iniciais, prontuário ou queixa…"
              style={{ ...inp, width: "100%", paddingRight: 62 }} />
            <span style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 6px", fontFamily: "JetBrains Mono, monospace", pointerEvents: "none" }}>Ctrl+K</span>
          </div>
          {busca && <button onClick={() => setBusca("")} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 12px", color: "var(--text-3)", cursor: "pointer", fontSize: 12 }}>Limpar</button>}
          {busca && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{aguardandoTriagem.length + aguardandoAtend.length + emAtendimento.length} paciente(s) no filtro</span>}
        </div>
      )}

      {sub === "painel" && (<>
      {/* KPIs por cor Manchester — os 6 numa linha só, compactos */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 8, marginBottom: 10 }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `3px solid ${aguardandoTriagem.length ? "#fbbf24" : "#34d399"}`, borderRadius: 9, padding: "9px 10px", minWidth: 0 }}>
          <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".04em", fontWeight: 700, lineHeight: 1.25, minHeight: 22 }}>Aguardando classificação</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: aguardandoTriagem.length ? "#fbbf24" : "var(--text)", fontFamily: "JetBrains Mono, monospace", marginTop: 2, lineHeight: 1.1 }}>{String(aguardandoTriagem.length).padStart(2, "0")}</div>
          <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>sem triagem</div>
        </div>
        {porCor.map(c => (
          <div key={c.k} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `3px solid ${c.cor}`, borderRadius: 9, padding: "9px 10px", minWidth: 0 }}>
            <div style={{ fontSize: 9, color: c.cor, textTransform: "uppercase", letterSpacing: ".04em", fontWeight: 800, lineHeight: 1.25, minHeight: 22 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: c.n ? c.cor : "var(--text)", fontFamily: "JetBrains Mono, monospace", marginTop: 2, lineHeight: 1.1 }}>{String(c.n).padStart(2, "0")}</div>
            <div title={c.fora ? `${c.fora} fora do tempo-alvo` : `${c.atend} · alvo ${c.alvoMin} min`}
              style={{ fontSize: 9, marginTop: 1, color: c.fora ? "#f43f5e" : "var(--text-muted)", fontWeight: c.fora ? 800 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {c.fora ? `⚠ ${c.fora} fora do alvo` : `${c.atend} · ${c.alvoMin === 0 ? "0min" : fmtDur(c.alvoMin)}`}
            </div>
          </div>
        ))}
      </div>

      {/* Faixa de segurança */}
      <div style={{ background: foraDoAlvoTotal ? "#f43f5e12" : "var(--surface)", border: `1px solid ${foraDoAlvoTotal ? "#f43f5e55" : "var(--border)"}`, borderRadius: 10, padding: "11px 16px", marginBottom: 12, fontSize: 13.5, color: "var(--text)" }}>
        {foraDoAlvoTotal === 0
          ? "✓ Nenhum paciente fora do tempo-alvo do Manchester."
          : <><strong style={{ color: "#f43f5e" }}>{foraDoAlvoTotal} paciente(s) fora do tempo-alvo</strong> — {porCor.filter(c => c.fora).map(c => `${c.fora} ${c.label.toLowerCase()}`).join(" · ")}. Priorize na fila abaixo.</>}
      </div>

      {/* 2 colunas: classificar · distribuição (a fila fica na aba Fila de Espera) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginBottom: 16, alignItems: "stretch" }}>

        {/* Classificar novo paciente (chegada) */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "13px 15px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Classificar Novo Paciente</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>Registre a chegada — depois classifique pelo Manchester. Dados mínimos (LGPD).</div>
          {canEdit ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <div>
                <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Iniciais do paciente *</label>
                <input value={novo.iniciais} onChange={e => setNovo(p => ({ ...p, iniciais: e.target.value }))} placeholder="Ex.: M.A.S." style={{ ...inp, width: "100%" }} />
              </div>
              <div>
                <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Prontuário *</label>
                <input value={novo.prontuario} onChange={e => setNovo(p => ({ ...p, prontuario: e.target.value }))} placeholder="Nº do prontuário (obrigatório)" style={{ ...inp, width: "100%" }} />
              </div>
              <div>
                <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Queixa principal</label>
                <input value={novo.queixa} onChange={e => setNovo(p => ({ ...p, queixa: e.target.value }))} onKeyDown={e => e.key === "Enter" && registrarChegada()} placeholder="Ex.: dor torácica" style={{ ...inp, width: "100%" }} />
              </div>
                <div>
                  <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Chegou por *</label>
                  <select value={novo.origem} onChange={e => setNovo(p => ({ ...p, origem: e.target.value, origem_detalhe: "" }))} style={{ ...inp, width: "100%" }}>
                    {PS_ORIGENS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                {psPedeDetalhe(novo.origem) && (
                  <div>
                    <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Unidade de origem *</label>
                    {novo.origem === "GERINT (aceite)" ? (
                      <select value={novo.origem_detalhe} onChange={e => setNovo(p => ({ ...p, origem_detalhe: e.target.value }))} style={{ ...inp, width: "100%" }}>
                        <option value="">Escolha a unidade…</option>
                        {PS_ORIGEM_UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    ) : (
                      <input value={novo.origem_detalhe} onChange={e => setNovo(p => ({ ...p, origem_detalhe: e.target.value }))} placeholder="Descreva a procedência" style={{ ...inp, width: "100%" }} />
                    )}
                  </div>
                )}
              <button onClick={registrarChegada} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13, marginTop: 2 }}>{busy ? "…" : "Registrar chegada →"}</button>
            </div>
          ) : <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Seu perfil é somente leitura.</div>}
        </div>

        {/* Distribuição Manchester do dia */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "13px 15px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Protocolo de Manchester</div>
          {(() => {
            const doDia = fila.concat(finalizados).filter(p => p.classificacao);
            if (!doDia.length) return <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "1rem", border: "1px dashed var(--border)", borderRadius: 8 }}>Nenhuma classificação hoje ainda.</div>;
            // Rosca (donut) da distribuição — cada fatia é um arco do círculo
            const fatias = Object.keys(MANCHESTER).map(k => {
              const n = doDia.filter(p => p.classificacao === k).length;
              return { k, n, pct: (n / doDia.length) * 100, ...MANCHESTER[k] };
            });
            const R = 46, STROKE = 16, C = 2 * Math.PI * R;
            let offset = 0;
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 16, height: "100%", minHeight: 150 }}>
                {/* DONUT */}
                <div style={{ position: "relative", width: 124, height: 124, flexShrink: 0 }}>
                  <svg viewBox="0 0 124 124" width="124" height="124" style={{ transform: "rotate(-90deg)" }}>
                    <circle cx="62" cy="62" r={R} fill="none" stroke="var(--surface-3)" strokeWidth={STROKE} />
                    {fatias.filter(f => f.n > 0).map(f => {
                      const len = (f.pct / 100) * C;
                      const el = <circle key={f.k} cx="62" cy="62" r={R} fill="none" stroke={f.cor} strokeWidth={STROKE}
                        strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} />;
                      offset += len;
                      return el;
                    })}
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text)", fontFamily: "JetBrains Mono, monospace", lineHeight: 1 }}>{doDia.length}</div>
                    <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>hoje</div>
                  </div>
                </div>
                {/* LEGENDA */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
                  {fatias.map(f => (
                    <div key={f.k} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 99, background: f.cor, flexShrink: 0, opacity: f.n ? 1 : 0.3 }} />
                      <span style={{ color: f.n ? "var(--text-2)" : "var(--text-muted)", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.label}</span>
                      <strong style={{ fontFamily: "JetBrains Mono, monospace", color: f.n ? f.cor : "var(--text-muted)" }}>{f.n}</strong>
                      <span style={{ color: "var(--text-muted)", minWidth: 34, textAlign: "right" }}>{f.pct.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* FAIXA DIVISÓRIA */}
      <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 14px", marginBottom: 16, fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: VX.azul, fontWeight: 800 }}>i</span>
        Triagem e Pronto-Socorro são fluxos separados para garantir segurança e agilidade no atendimento.
      </div>

      {/* ══════════════ SEÇÃO 2 — PRONTO-SOCORRO ══════════════ */}
      <div style={{ borderTop: `3px solid ${VX.azul}`, background: "var(--surface)", borderRadius: "10px 10px 0 0", padding: "12px 16px 10px", marginBottom: 12 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text)" }}>Pronto-Socorro</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Atendimento e Tratamento</div>
      </div>

      {/* KPIs do PS — 6 compactos numa linha só */}
      {(() => {
        const salasAtivas = salas.filter(s => s.ativo !== false);
        const ocup = salasAtivas.filter(s => s.status === "ocupado").length;
        const tot = salasAtivas.length;
        const pct = tot ? Math.round((ocup / tot) * 100) : 0;
        const obitoPS = finalizados.filter(p => p.desfecho === "obito").length;
        const obitosTot = obitoPS + obitosInternacao;
        // Card compacto: rótulo pequeno, número grande, subtexto de apoio
        const Mini = ({ label, valor, cor, sub }) => (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `3px solid ${cor}`, borderRadius: 9, padding: "9px 11px", minWidth: 0 }}>
            <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".04em", fontWeight: 700, lineHeight: 1.25, minHeight: 22 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: cor, fontFamily: "JetBrains Mono, monospace", marginTop: 2, lineHeight: 1.1 }}>{valor}</div>
            <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
          </div>
        );
        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 8, marginBottom: 12 }}>
            <Mini label="Em atendimento" valor={emAtendimento.length} cor="#22d3ee" sub="pacientes agora" />
            <Mini label="Aguardando atendimento" valor={aguardandoAtend.length} cor="#3b82f6" sub="na fila" />
            <Mini label="Leitos ocupados" valor={tot ? `${ocup}/${tot}` : "—"} cor={ocup ? "#f43f5e" : "#34d399"} sub={tot ? `${pct}% de ocupação` : "sem leitos"} />
            <Mini label="Óbitos" valor={obitosTot} cor={obitosTot ? "#f43f5e" : "#34d399"} sub={obitosTot ? `${obitoPS} no PS · ${obitosInternacao} pós-intern.` : "nenhum hoje"} />
            <Mini label="Tempo médio de permanência" valor={permMedia != null ? fmtDur(Math.round(permMedia)) : "—"} cor="#6366f1" sub="chegada → desfecho" />
            <Mini label="Atendidos hoje" valor={finalizados.length} cor="#0d9488" sub="finalizados" />
          </div>
        );
      })()}

      {/* Em atendimento + Mapa de salas lado a lado (mesma altura); encaminhamentos abaixo */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginBottom: 12, alignItems: "stretch" }}>

        {/* Pacientes em atendimento */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "13px 15px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Pacientes em Atendimento ({emAtendimento.length})</div>
          {emAtendimento.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "1rem", border: "1px dashed var(--border)", borderRadius: 8 }}>Nenhum paciente em atendimento.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 420, overflowY: "auto" }}>
              {emAtendimento.map(p => {
                const sala = salas.find(s => s.atendimento_id === p.id);
                return (
                  <div key={p.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: `4px solid ${MANCHESTER[p.classificacao]?.cor || "var(--border)"}`, borderRadius: 8, padding: "8px 11px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <strong style={{ fontSize: 13 }}>{p.iniciais}</strong>
                      <ClasseBadge c={p.classificacao} />
                      {sala && <span style={{ fontSize: 10.5, fontWeight: 700, color: VX.azul, border: `1px solid ${VX.azul}55`, borderRadius: 99, padding: "0 7px" }}>Sala {sala.identificacao}</span>}
                      <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-3)", fontFamily: "JetBrains Mono, monospace" }}>{fmtDur(diffMin(p.atendimento_em, agora))}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11.5, color: "var(--text-3)", flex: 1, minWidth: 80 }}>{p.queixa || "—"}</span>
                      {canEdit && <button onClick={() => setAtendendo(p)} style={btnContorno("#3b82f6")}>Abrir</button>}
                      {canEdit && <button onClick={() => setDesfechando(p)} style={btnContorno("#22d3ee")}>Desfecho</button>}
                    </div>
                    {(examesPend[p.id]?.aguardando > 0 || examesPend[p.id]?.prontos > 0) && (
                      <div style={{ display: "flex", gap: 8, fontSize: 10.5, fontWeight: 700, marginTop: 3 }}>
                        {examesPend[p.id]?.aguardando > 0 && <span style={{ color: "#d97706" }}>{examesPend[p.id].aguardando} exame(s) aguardando</span>}
                        {examesPend[p.id]?.prontos > 0 && <span style={{ color: "#3b82f6" }}>{examesPend[p.id].prontos} resultado(s) pronto(s)</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Mapa de salas */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "13px 15px" }}>
          {(() => {
            const ativas = salas.filter(s => s.ativo !== false);
            const pacById = {}; fila.forEach(p => pacById[p.id] = p);
            const areas = [...new Set(ativas.map(s => s.area || "Outros"))]
              .sort((a, b) => { const ia = PS_AREAS.indexOf(a), ib = PS_AREAS.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, "pt-BR"); });
            const cont = k => ativas.filter(s => (s.status || "disponivel") === k).length;
            return (<>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Mapa de Salas</div>
                {canEdit && <button onClick={() => setShowSalas(true)} style={{ marginLeft: "auto", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 10px", color: "var(--text-3)", cursor: "pointer", fontSize: 11 }}>Gerenciar</button>}
              </div>
              {ativas.length === 0 ? (
                <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "1rem", border: "1px dashed var(--border)", borderRadius: 8 }}>
                  Nenhuma sala cadastrada. {canEdit ? "Clique em “Gerenciar” (ex.: Emergência 01–06, Observação 07–12, Sala Vermelha 13–16)." : ""}
                </div>
              ) : (<>
                <div style={{ maxHeight: 380, overflowY: "auto" }}>
                  {areas.map(area => (
                    <div key={area} style={{ marginBottom: 9 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 4 }}>{area}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {ativas.filter(s => (s.area || "Outros") === area).map(s => {
                          const st = PS_SALA_STATUS[s.status] || PS_SALA_STATUS.disponivel;
                          const pac = s.atendimento_id ? pacById[s.atendimento_id] : null;
                          const desde = s.ocupado_em ? diffMin(s.ocupado_em, agora) : null;
                          return (
                            <div key={s.id} title={pac ? `${pac.iniciais}${desde != null ? ` · ${fmtDur(desde)}` : ""}` : st.label}
                              style={{ background: st.cor + "1e", border: `1px solid ${st.cor}66`, borderTop: `3px solid ${st.cor}`, borderRadius: 7, padding: "6px 9px", minWidth: 76 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 800, color: st.cor, fontFamily: "JetBrains Mono, monospace" }}>{s.identificacao}</div>
                              <div style={{ fontSize: 9.5, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 92 }}>{pac ? pac.iniciais : st.label}</div>
                              {canEdit && (
                                <div style={{ display: "flex", gap: 3, marginTop: 4, flexWrap: "wrap" }}>
                                  {s.status === "disponivel" && <button onClick={() => setAlocando(s)} style={{ ...btnContorno("#22d3ee"), padding: "0 6px", fontSize: 9.5 }}>Alocar</button>}
                                  {s.status === "ocupado" && <button onClick={() => mudarStatusSala(s, "limpeza")} style={{ ...btnContorno("#d97706"), padding: "0 6px", fontSize: 9.5 }}>Liberar</button>}
                                  {s.status === "limpeza" && <button onClick={() => mudarStatusSala(s, "disponivel")} style={{ ...btnContorno("#34d399"), padding: "0 6px", fontSize: 9.5 }}>Pronta</button>}
                                  {s.status === "manutencao" && <button onClick={() => mudarStatusSala(s, "disponivel")} style={{ ...btnContorno("#34d399"), padding: "0 6px", fontSize: 9.5 }}>Liberar</button>}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                  {Object.entries(PS_SALA_STATUS).map(([k, v]) => (
                    <span key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "var(--text-muted)" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: v.cor }} />{v.label} ({cont(k)})
                    </span>
                  ))}
                </div>
              </>)}
            </>);
          })()}
        </div>
      </div>

      {/* Encaminhamentos de hoje — largura total, abaixo dos dois */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "13px 15px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Encaminhamentos de hoje</div>
          {(() => {
            const internados = finalizados.filter(p => p.desfecho === "internacao");
            const porSetor = {}; internados.forEach(p => { const k = p.setor_destino || "Sem setor"; porSetor[k] = (porSetor[k] || 0) + 1; });
            const linhas = [
              ...Object.entries(porSetor).map(([k, n]) => ({ label: k, n, cor: "#3b82f6" })),
              { label: "Transferência externa", n: finalizados.filter(p => p.desfecho === "transferencia").length, cor: "#6366f1" },
              { label: "Alta", n: finalizados.filter(p => p.desfecho === "alta").length, cor: "#34d399" },
              { label: "Evasão", n: finalizados.filter(p => p.desfecho === "evasao").length, cor: "#d97706" },
              { label: "Óbito no PS", n: finalizados.filter(p => p.desfecho === "obito").length, cor: "#f43f5e" },
            ].filter(x => x.n > 0);
            if (!linhas.length) return <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "1rem", border: "1px dashed var(--border)", borderRadius: 8 }}>Nenhum desfecho registrado hoje.</div>;
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {linhas.map((x, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 11px" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: x.cor, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-2)" }}>{x.label}</span>
                    <strong style={{ fontFamily: "JetBrains Mono, monospace", color: x.cor }}>{x.n}</strong>
                    <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>paciente(s)</span>
                  </div>
                ))}
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>Internações vão para a fila/leito do setor de destino. Óbito inclui os ocorridos após internação hoje.</div>
              </div>
            );
          })()}

          {/* Evasões por médico — indicador de responsabilização */}
          {(() => {
            const evasoes = finalizados.filter(p => p.desfecho === "evasao");
            if (!evasoes.length) return null;
            const porMedico = {};
            evasoes.forEach(p => { const m = p.medico || "Sem médico registrado"; porMedico[m] = (porMedico[m] || 0) + 1; });
            const ord = Object.entries(porMedico).sort((a, b) => b[1] - a[1]);
            return (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-3)", marginBottom: 6 }}>Evasões por médico (hoje)</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {ord.map(([m, n]) => (
                    <div key={m} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <span style={{ flex: 1, color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m}</span>
                      <strong style={{ fontFamily: "JetBrains Mono, monospace", color: "#d97706" }}>{n}</strong>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      </>)}

      {/* CLASSIFICAR PACIENTE */}
      {sub === "classificar" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, alignItems: "start", marginBottom: 16 }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Registrar chegada</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>Dados mínimos (LGPD): iniciais e prontuário identificam sem expor o nome.</div>
            {canEdit ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <div><label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Iniciais *</label><input value={novo.iniciais} onChange={e => setNovo(p => ({ ...p, iniciais: e.target.value }))} placeholder="Ex.: M.A.S." style={{ ...inp, width: "100%" }} /></div>
                <div><label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Prontuário *</label><input value={novo.prontuario} onChange={e => setNovo(p => ({ ...p, prontuario: e.target.value }))} placeholder="Nº" style={{ ...inp, width: "100%" }} /></div>
                <div><label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Queixa principal</label><input value={novo.queixa} onChange={e => setNovo(p => ({ ...p, queixa: e.target.value }))} onKeyDown={e => e.key === "Enter" && registrarChegada()} placeholder="Ex.: dor torácica" style={{ ...inp, width: "100%" }} /></div>
                <div>
                  <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Chegou por *</label>
                  <select value={novo.origem} onChange={e => setNovo(p => ({ ...p, origem: e.target.value, origem_detalhe: "" }))} style={{ ...inp, width: "100%" }}>
                    {PS_ORIGENS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                {psPedeDetalhe(novo.origem) && (
                  <div>
                    <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Unidade de origem *</label>
                    {novo.origem === "GERINT (aceite)" ? (
                      <select value={novo.origem_detalhe} onChange={e => setNovo(p => ({ ...p, origem_detalhe: e.target.value }))} style={{ ...inp, width: "100%" }}>
                        <option value="">Escolha a unidade…</option>
                        {PS_ORIGEM_UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    ) : (
                      <input value={novo.origem_detalhe} onChange={e => setNovo(p => ({ ...p, origem_detalhe: e.target.value }))} placeholder="Descreva a procedência" style={{ ...inp, width: "100%" }} />
                    )}
                  </div>
                )}
                <button onClick={registrarChegada} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Registrar chegada →"}</button>
              </div>
            ) : <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Seu perfil é somente leitura.</div>}
          </div>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Aguardando classificação ({aguardandoTriagem.length})</div>
            {aguardandoTriagem.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "1rem", border: "1px dashed var(--border)", borderRadius: 8 }}>Ninguém aguardando triagem.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {aguardandoTriagem.map(p => (
                  <div key={p.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: "4px solid #fbbf24", borderRadius: 8, padding: "9px 12px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 13 }}>{p.iniciais}</strong>
                    {p.prontuario && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>reg. {p.prontuario}</span>}
                    {p.origem && p.origem !== "Meios próprios" && <span title={p.origem_detalhe ? p.origem + " — " + p.origem_detalhe : p.origem} style={{ fontSize: 9, fontWeight: 800, color: VX.azul, border: "1px solid " + VX.azul + "55", borderRadius: 99, padding: "0 6px" }}>{p.origem.replace(" (aceite)", "")}</span>}
                    <span style={{ fontSize: 11.5, color: "var(--text-3)", flex: 1, minWidth: 80 }}>{p.queixa || "—"}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: "#fbbf24", fontFamily: "JetBrains Mono, monospace" }}>{fmtDur(diffMin(p.chegada_em, agora))}</span>
                    {canEdit && <button onClick={() => setTriando(p)} style={btnContorno("#22d3ee")}>Classificar</button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FILA DE ESPERA */}
      {sub === "fila" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ background: foraDoAlvoTotal ? "#f43f5e12" : "var(--surface)", border: `1px solid ${foraDoAlvoTotal ? "#f43f5e55" : "var(--border)"}`, borderRadius: 10, padding: "11px 16px", marginBottom: 12, fontSize: 13.5 }}>
            {foraDoAlvoTotal === 0 ? "✓ Nenhum paciente fora do tempo-alvo." : <><strong style={{ color: "#f43f5e" }}>{foraDoAlvoTotal} fora do tempo-alvo</strong> — priorize os destacados.</>}
          </div>
          {aguardandoAtend.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Fila vazia.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {aguardandoAtend.map((p, i) => {
                const m = MANCHESTER[p.classificacao];
                const est = estourouAlvo(p);
                return (
                  <div key={p.id} style={{ ...linhaPac, borderLeft: `4px solid ${m?.cor || "var(--border)"}`, background: est ? "#f43f5e0e" : "var(--surface-2)" }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace", minWidth: 22 }}>{String(i + 1).padStart(2, "0")}</span>
                    <strong style={{ minWidth: 64 }}>{p.iniciais}</strong>
                    {p.prontuario && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>reg. {p.prontuario}</span>}
                    <ClasseBadge c={p.classificacao} />
                    {p.queixa && <span style={{ fontSize: 12, color: "var(--text-3)" }}>{p.queixa}</span>}
                    <span style={{ marginLeft: "auto" }}><Espera p={p} /></span>
                    {canEdit && <button onClick={() => setReavaliando(p)} style={btnContorno(est ? "#f97316" : "var(--text-3)")}>Reavaliar</button>}
                    {canEdit && <button onClick={() => iniciarAtendimento(p)} style={btnContorno("#34d399")}>Iniciar atendimento</button>}
                    {fmtSinaisVitais(p) && <div style={{ width: "100%", fontSize: 11, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{fmtSinaisVitais(p)}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* REAVALIAÇÃO */}
      {sub === "reavaliacao" && (() => {
        const candidatos = [...aguardandoAtend].sort((a, b) => (estourouAlvo(b) - estourouAlvo(a)) || (esperaMin(b) - esperaMin(a)));
        return (
          <div style={{ marginBottom: 16 }}>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "11px 16px", marginBottom: 12, fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>
              A reavaliação é obrigatória sempre que o paciente <strong>ultrapassa o tempo-alvo</strong> ou relata piora. Ela gera uma nova aferição no histórico (append-only) e pode <strong>mudar a classificação</strong>.
            </div>
            {candidatos.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Ninguém aguardando atendimento — nada a reavaliar.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {candidatos.map(p => {
                  const est = estourouAlvo(p);
                  return (
                    <div key={p.id} style={{ ...linhaPac, borderLeft: `4px solid ${est ? "#f43f5e" : MANCHESTER[p.classificacao]?.cor || "var(--border)"}`, background: est ? "#f43f5e0e" : "var(--surface-2)" }}>
                      <strong style={{ minWidth: 64 }}>{p.iniciais}</strong>
                      <ClasseBadge c={p.classificacao} />
                      {est && <span style={{ fontSize: 9.5, fontWeight: 800, color: "#f43f5e", border: "1px solid #f43f5e66", borderRadius: 99, padding: "0 7px" }}>PRIORIDADE — TEMPO ESTOURADO</span>}
                      {p.queixa && <span style={{ fontSize: 12, color: "var(--text-3)" }}>{p.queixa}</span>}
                      <span style={{ marginLeft: "auto" }}><Espera p={p} /></span>
                      {canEdit && <button onClick={() => setReavaliando(p)} style={btnContorno(est ? "#f97316" : "#22d3ee")}>Reavaliar agora</button>}
                      {fmtSinaisVitais(p) && <div style={{ width: "100%", fontSize: 11, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>última aferição: {fmtSinaisVitais(p)}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* PROTOCOLO DE MANCHESTER ADAPTADO — material didático */}
      {sub === "protocolo" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${VX.turquesa}`, borderRadius: 10, padding: "12px 16px", marginBottom: 14, fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.55 }}>
            <strong>Manchester adaptado — {HOSPITAL_NOME}.</strong> Cinco níveis de prioridade definidos pela queixa de apresentação e pelos discriminadores. Os tempos-alvo abaixo são os oficiais desta unidade.
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 5 }}>Material de referência e treinamento. A classificação final é sempre da enfermeira triadora, conforme o fluxograma da queixa — o sistema apenas apoia.</div>
            {currentUser?.role === "adm_master" && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <button onClick={() => setShowFaixasPed(true)} style={{ background: "transparent", border: `1px solid ${VX.turquesa}`, color: VX.turquesa, borderRadius: 6, padding: "6px 14px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Editar faixas pediátricas (FC/FR por idade)</button>
                <button onClick={() => setShowFaixasObst(true)} style={{ background: "transparent", border: `1px solid ${VX.turquesa}`, color: VX.turquesa, borderRadius: 6, padding: "6px 14px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Editar critérios obstétricos</button>
              </div>
            )}
          </div>

          {/* Cards por nível */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, marginBottom: 18 }}>
            {Object.keys(MANCHESTER).map(k => {
              const m = MANCHESTER[k], pr = PS_PROTOCOLO[k];
              return (
                <div key={k} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderTop: `4px solid ${m.cor}`, borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 3 }}>
                    <span style={{ width: 16, height: 16, borderRadius: 5, background: m.cor, flexShrink: 0 }} />
                    <span style={{ fontSize: 15, fontWeight: 800, color: m.cor }}>{m.label}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 9 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: m.cor, border: `1px solid ${m.cor}55`, borderRadius: 99, padding: "1px 9px" }}>{m.atend.toUpperCase()}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 99, padding: "1px 9px", fontFamily: "JetBrains Mono, monospace" }}>{m.alvoMin === 0 ? "0 min — imediato" : `até ${m.alvoMin} min`}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.5, marginBottom: 10 }}>{m.desc}</div>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 5 }}>Sinais e discriminadores típicos</div>
                  <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 3 }}>
                    {pr.sinais.map((s, i) => <li key={i} style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.45 }}>{s}</li>)}
                  </ul>
                  <div style={{ marginTop: 10, background: m.cor + "12", border: `1px solid ${m.cor}44`, borderRadius: 7, padding: "8px 11px", fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.45 }}>
                    <strong style={{ color: m.cor }}>Conduta:</strong> {pr.conduta}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Discriminadores gerais */}
          <div style={{ ...secLbl }}>Discriminadores gerais — atravessam todos os fluxogramas</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10, marginBottom: 18 }}>
            {PS_DISCRIMINADORES.map(d => (
              <div key={d.nome} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${d.cor}`, borderRadius: 9, padding: "11px 14px" }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: d.cor, marginBottom: 3 }}>{d.nome}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.5 }}>{d.desc}</div>
              </div>
            ))}
          </div>

          {/* Escala AVPU */}
          <div style={{ ...secLbl }}>Escala AVPU — nível de consciência</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 14 }}>
            {[["A", "Alerta", "Desperto e orientado", "#34d399"],
              ["V", "Voz", "Responde a estímulo verbal", "#f97316"],
              ["D", "Dor", "Responde só a estímulo doloroso", "#f97316"],
              ["U", "Inconsciente", "Não responde a nenhum estímulo", "#ef4444"]].map(([l, t, d, c]) => (
              <div key={l} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 9, padding: "11px 14px", display: "flex", alignItems: "center", gap: 11 }}>
                <span style={{ width: 34, height: 34, borderRadius: 8, background: c + "22", border: `1px solid ${c}66`, color: c, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, flexShrink: 0 }}>{l}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>{t}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)", lineHeight: 1.4 }}>{d}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", lineHeight: 1.6, border: "1px dashed var(--border)", borderRadius: 8, padding: "10px 14px" }}>
            <strong>Sobre estes materiais:</strong> baseados no Manchester Triage Group e adaptados aos tempos-alvo desta unidade. As faixas de sinais vitais que o sistema usa para <em>sugerir</em> a classificação valem para <strong>adultos</strong>; na triagem <strong>pediátrica</strong> valem faixas de FC/FR <strong>por idade</strong> (editáveis pelo ADM Master em "Editar faixas pediátricas"), e a <strong>obstétrica</strong> é classificada pelo protocolo próprio. Revisar periodicamente com a equipe de enfermagem.
          </div>
        </div>
      )}

      {/* INDICADORES DA TRIAGEM */}
      {sub === "indicadores" && (() => {
        const doDia = fila.concat(finalizados).filter(p => p.classificacao);
        const comEspera = doDia.filter(p => p.triagem_em && (p.atendimento_em || p.status === "aguardando_atendimento"));
        const dentro = comEspera.filter(p => !estourouAlvo(p)).length;
        const taxa = comEspera.length ? (dentro / comEspera.length) * 100 : null;
        return (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
              <Card label="Classificados hoje" valor={doDia.length} cor={VX.azul} />
              <Card label="Dentro do tempo-alvo" valor={taxa != null ? `${taxa.toFixed(0)}%` : "—"} cor={taxa == null ? "var(--border)" : taxa >= 80 ? "#34d399" : taxa >= 60 ? "#fbbf24" : "#f43f5e"} />
              <Card label="Fora do tempo-alvo agora" valor={foraDoAlvoTotal} cor={foraDoAlvoTotal ? "#f43f5e" : "#34d399"} />
              <Card label="Porta→triagem (média)" valor={portaTriagemMedia != null ? fmtDur(Math.round(portaTriagemMedia)) : "—"} cor="#6366f1" />
              <Card label="Permanência média" valor={permMedia != null ? fmtDur(Math.round(permMedia)) : "—"} cor="#6366f1" />
            </div>
            {/* PROCEDÊNCIA — de onde vieram os pacientes (pactuação regional) */}
            {(() => {
              const todos = fila.concat(finalizados);
              const comOrigem = todos.filter(p => p.origem);
              if (!comOrigem.length) return null;
              const porOrigem = {};
              comOrigem.forEach(p => { const k = p.origem; porOrigem[k] = (porOrigem[k] || 0) + 1; });
              const ord = Object.entries(porOrigem).sort((a, b) => b[1] - a[1]);
              const deFora = comOrigem.filter(p => p.origem === "GERINT (aceite)");
              const porUnidade = {};
              deFora.forEach(p => { const k = p.origem_detalhe || "Não informada"; porUnidade[k] = (porUnidade[k] || 0) + 1; });
              return (
                <div style={{ marginBottom: 16 }}>
                  <div style={secLbl}>Procedência dos pacientes (hoje)</div>
                  <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
                    {ord.map(([o, n]) => {
                      const pct = (n / comOrigem.length) * 100;
                      const cor = o === "GERINT (aceite)" ? "#6366f1" : o === "SAMU" ? "#f43f5e" : o === "Meios próprios" ? "#34d399" : VX.azul;
                      return (
                        <div key={o} style={{ marginBottom: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 3 }}>
                            <span style={{ width: 9, height: 9, borderRadius: 99, background: cor }} />
                            <span style={{ color: "var(--text-2)", flex: 1 }}>{o}</span>
                            <strong style={{ fontFamily: "JetBrains Mono, monospace", color: cor }}>{n}</strong>
                            <span style={{ color: "var(--text-muted)", fontSize: 10.5, minWidth: 36, textAlign: "right" }}>{pct.toFixed(0)}%</span>
                          </div>
                          <div style={{ height: 6, background: "var(--surface-3)", borderRadius: 99, overflow: "hidden" }}>
                            <div style={{ width: Math.max(pct ? 3 : 0, pct) + "%", height: "100%", background: cor, borderRadius: 99 }} />
                          </div>
                        </div>
                      );
                    })}
                    {deFora.length > 0 && (
                      <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px solid var(--border)" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#6366f1", marginBottom: 5 }}>Aceites via GERINT por unidade ({deFora.length})</div>
                        {Object.entries(porUnidade).sort((a, b) => b[1] - a[1]).map(([u, n]) => (
                          <div key={u} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, marginBottom: 2 }}>
                            <span style={{ flex: 1, color: "var(--text-2)" }}>{u}</span>
                            <strong style={{ fontFamily: "JetBrains Mono, monospace", color: "#6366f1" }}>{n}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 9 }}>
                      Base da pactuação regional: quantos pacientes chegam por conta própria, por serviços de urgência e quantos são aceites da regulação (pacientes de fora do município).
                    </div>
                  </div>
                </div>
              );
            })()}

            <div style={secLbl}>Distribuição por classificação (hoje)</div>
            {doDia.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Nenhuma classificação hoje ainda.</div>
            ) : (
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
                {Object.keys(MANCHESTER).map(k => {
                  const lista = doDia.filter(p => p.classificacao === k);
                  const est = lista.filter(estourouAlvo).length;
                  const pct = (lista.length / doDia.length) * 100;
                  const v = MANCHESTER[k];
                  return (
                    <div key={k} style={{ marginBottom: 9 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 3 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 99, background: v.cor }} />
                        <span style={{ color: "var(--text-2)", flex: 1 }}>{v.label} <span style={{ color: "var(--text-muted)", fontSize: 10.5 }}>· {v.atend}, {v.alvoMin === 0 ? "imediato" : `${v.alvoMin} min`}</span></span>
                        {est > 0 && <span style={{ fontSize: 10.5, fontWeight: 800, color: "#f43f5e" }}>⚠ {est} fora do alvo</span>}
                        <strong style={{ fontFamily: "JetBrains Mono, monospace", color: v.cor, minWidth: 26, textAlign: "right" }}>{lista.length}</strong>
                        <span style={{ color: "var(--text-muted)", fontSize: 10.5, minWidth: 36, textAlign: "right" }}>{pct.toFixed(0)}%</span>
                      </div>
                      <div style={{ height: 7, background: "var(--surface-3)", borderRadius: 99, overflow: "hidden" }}>
                        <div style={{ width: Math.max(pct ? 3 : 0, pct) + "%", height: "100%", background: v.cor, borderRadius: 99 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ═════════ EMERGÊNCIA (PS) — telas do bloco ═════════ */}
      {sub.startsWith("e_") && (() => {
        const ativas = salas.filter(s => s.ativo !== false);
        const doCenso = ativas.filter(psContaCenso);          // entram nos leitos do hospital
        const retaguarda = ativas.filter(s => !psContaCenso(s)); // só no panorama do PS
        const pacById = {}; fila.forEach(p => pacById[p.id] = p);
        const ocupadas = a => a.filter(s => s.status === "ocupado").length;
        const dispon = a => a.filter(s => (s.status || "disponivel") === "disponivel").length;
        const areasOrd = [...new Set(ativas.map(s => s.area || "Outros"))]
          .sort((a, b) => { const ia = PS_AREAS.indexOf(a), ib = PS_AREAS.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, "pt-BR"); });

        // Tile pequeno no padrão do Giro de Leitos
        const Tile = ({ s }) => {
          const st = PS_SALA_STATUS[s.status] || PS_SALA_STATUS.disponivel;
          const pac = s.atendimento_id ? pacById[s.atendimento_id] : null;
          const desde = s.ocupado_em ? diffMin(s.ocupado_em, agora) : null;
          return (
            <div title={`${s.identificacao} · ${st.label}${pac ? ` · ${pac.iniciais}` : ""}${desde != null ? ` · ${fmtDur(desde)}` : ""}${psContaCenso(s) ? "" : " · retaguarda (fora do censo)"}`}
              style={{ background: st.cor + "1e", border: `1px solid ${st.cor}66`, borderTop: `3px solid ${st.cor}`, borderRadius: 7, padding: "5px 7px", minWidth: 62, position: "relative" }}>
              {!psContaCenso(s) && <span style={{ position: "absolute", top: 2, right: 4, fontSize: 8, color: "var(--text-muted)", fontWeight: 800 }} title="Não conta no censo do hospital">R</span>}
              <div style={{ fontSize: 11.5, fontWeight: 800, color: st.cor, fontFamily: "JetBrains Mono, monospace" }}>{s.identificacao}</div>
              <div style={{ fontSize: 9, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 72 }}>{pac ? pac.iniciais : st.label}</div>
              {canEdit && (
                <div style={{ display: "flex", gap: 3, marginTop: 3, flexWrap: "wrap" }}>
                  {s.status === "disponivel" && <button onClick={() => setAlocando(s)} style={{ ...btnContorno("#22d3ee"), padding: "0 5px", fontSize: 9 }}>Alocar</button>}
                  {s.status === "ocupado" && <button onClick={() => mudarStatusSala(s, "limpeza")} style={{ ...btnContorno("#d97706"), padding: "0 5px", fontSize: 9 }}>Liberar</button>}
                  {s.status === "limpeza" && <button onClick={() => mudarStatusSala(s, "disponivel")} style={{ ...btnContorno("#34d399"), padding: "0 5px", fontSize: 9 }}>Pronta</button>}
                  {s.status === "manutencao" && <button onClick={() => mudarStatusSala(s, "disponivel")} style={{ ...btnContorno("#34d399"), padding: "0 5px", fontSize: 9 }}>Liberar</button>}
                </div>
              )}
            </div>
          );
        };
        const MapaAreas = ({ lista }) => (
          <>{areasOrd.filter(a => lista.some(s => (s.area || "Outros") === a)).map(area => {
            const doArea = lista.filter(s => (s.area || "Outros") === area);
            return (
              <div key={area} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 4 }}>
                  {area} <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>· {doArea.length} vaga(s) · {dispon(doArea)} livre(s)</span>
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{doArea.map(s => <Tile key={s.id} s={s} />)}</div>
              </div>
            );
          })}</>
        );

        // ── Painel da Emergência ──
        if (sub === "e_painel") return (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
              <Card label="Em atendimento" valor={emAtendimento.length} cor="#22d3ee" />
              <Card label="Aguardando atendimento" valor={aguardandoAtend.length} cor="#3b82f6" />
              <Card label="Vagas ocupadas (PS)" valor={ativas.length ? `${ocupadas(ativas)}/${ativas.length}` : "—"} cor={ocupadas(ativas) ? "#f43f5e" : "#34d399"} />
              <Card label="Vagas livres (PS)" valor={ativas.length ? `${dispon(ativas)}/${ativas.length}` : "—"} cor={dispon(ativas) ? "#34d399" : "#f43f5e"} />
              <Card label="Permanência média" valor={permMedia != null ? fmtDur(Math.round(permMedia)) : "—"} cor="#6366f1" />
              <Card label="Atendidos hoje" valor={finalizados.length} cor="#0d9488" />
            </div>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", marginBottom: 12, fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.6 }}>
              <strong>Censo:</strong> {doCenso.length} vaga(s) do PS entram nos leitos do hospital ({ocupadas(doCenso)} ocupada(s)) ·{" "}
              <strong style={{ color: "#d97706" }}>{retaguarda.length} de retaguarda</strong> (observação, procedimento, PCR e isolamento infantil) contam <strong>só aqui</strong>, por serem provisórias e de alta rotatividade.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, alignItems: "start" }}>
              {/* DESFECHOS DO DIA — com os dois tipos de óbito separados */}
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "13px 15px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>Desfechos do dia</div>
                <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginBottom: 10 }}>{finalizados.length} atendimento(s) finalizado(s) no PS hoje.</div>
                {(() => {
                  const obitoPS = finalizados.filter(p => p.desfecho === "obito").length;
                  const linhas = Object.keys(PS_DESFECHOS).map(k => ({
                    k,
                    label: k === "obito" ? "Óbito no PS (antes de internar)" : PS_DESFECHOS[k].label,
                    cor: PS_DESFECHOS[k].cor,
                    n: finalizados.filter(p => p.desfecho === k).length,
                  }));
                  const totalObitos = obitoPS + obitosInternacao;
                  return (<>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {linhas.map(x => (
                        <div key={x.k} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "7px 11px" }}>
                          <span style={{ width: 8, height: 8, borderRadius: 99, background: x.cor, flexShrink: 0 }} />
                          <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-2)" }}>{x.label}</span>
                          <strong style={{ fontFamily: "JetBrains Mono, monospace", color: x.n ? x.cor : "var(--text-muted)" }}>{x.n}</strong>
                        </div>
                      ))}
                      {/* Óbito após internação vem de leitos_saidas — não é desfecho do PS */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px dashed var(--border)", borderRadius: 7, padding: "7px 11px" }}>
                        <span style={{ width: 8, height: 8, borderRadius: 99, background: "#f43f5e", flexShrink: 0, opacity: .6 }} />
                        <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-3)" }}>Óbito após internação <span style={{ fontSize: 10, color: "var(--text-muted)" }}>(fora do PS)</span></span>
                        <strong style={{ fontFamily: "JetBrains Mono, monospace", color: obitosInternacao ? "#f43f5e" : "var(--text-muted)" }}>{obitosInternacao}</strong>
                      </div>
                    </div>
                    {totalObitos > 0 && (
                      <div style={{ marginTop: 9, background: "#f43f5e10", border: "1px solid #f43f5e44", borderRadius: 7, padding: "8px 11px", fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.5 }}>
                        <strong style={{ color: "#f43f5e" }}>Óbitos hoje: {totalObitos}</strong> — {obitoPS} no PS antes de internar · {obitosInternacao} após internação.
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>
                      Os dois óbitos são contados em fontes diferentes: o do PS vem do desfecho do atendimento; o pós-internação vem da saída do leito. Somar sem separar infla o indicador do PS.
                    </div>
                  </>);
                })()}
              </div>

              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "13px 15px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Mapa resumido</div>
                {ativas.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nenhuma vaga cadastrada.</div> : <MapaAreas lista={ativas} />}
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "13px 15px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Encaminhamentos de hoje</div>
                {(() => {
                  const internados = finalizados.filter(p => p.desfecho === "internacao");
                  const porSetor = {}; internados.forEach(p => { const k = p.setor_destino || "Sem setor"; porSetor[k] = (porSetor[k] || 0) + 1; });
                  const linhas = [
                    ...Object.entries(porSetor).map(([k, n]) => ({ label: k, n, cor: "#3b82f6" })),
                    { label: "Transferência externa", n: finalizados.filter(p => p.desfecho === "transferencia").length, cor: "#6366f1" },
                    { label: "Alta", n: finalizados.filter(p => p.desfecho === "alta").length, cor: "#34d399" },
                    { label: "Evasão", n: finalizados.filter(p => p.desfecho === "evasao").length, cor: "#d97706" },
                    { label: "Óbito no PS", n: finalizados.filter(p => p.desfecho === "obito").length, cor: "#f43f5e" },
                  ].filter(x => x.n > 0);
                  if (!linhas.length) return <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nenhum desfecho hoje.</div>;
                  return <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{linhas.map((x, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 11px" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 99, background: x.cor }} />
                      <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-2)" }}>{x.label}</span>
                      <strong style={{ fontFamily: "JetBrains Mono, monospace", color: x.cor }}>{x.n}</strong>
                    </div>
                  ))}</div>;
                })()}
              </div>
            </div>
          </div>
        );

        // ── Em atendimento ──
        if (sub === "e_atendimento") return (
          <div style={{ marginBottom: 16 }}>
            {emAtendimento.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Nenhum paciente em atendimento.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {emAtendimento.map(p => {
                  const sala = salas.find(s => s.atendimento_id === p.id);
                  return (
                    <div key={p.id} style={{ ...linhaPac, borderLeft: `4px solid ${MANCHESTER[p.classificacao]?.cor || "var(--border)"}` }}>
                      <strong style={{ minWidth: 64 }}>{p.iniciais}</strong>
                      {p.prontuario && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>reg. {p.prontuario}</span>}
                      <ClasseBadge c={p.classificacao} />
                      {sala && <span style={{ fontSize: 10.5, fontWeight: 700, color: VX.azul, border: `1px solid ${VX.azul}55`, borderRadius: 99, padding: "0 7px" }}>{sala.identificacao} · {sala.area}</span>}
                      {p.queixa && <span style={{ fontSize: 12, color: "var(--text-3)" }}>{p.queixa}</span>}
                      <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-3)", fontFamily: "JetBrains Mono, monospace" }}>{fmtDur(diffMin(p.atendimento_em, agora))}</span>
                      {canEdit && <button onClick={() => setAtendendo(p)} style={btnContorno("#3b82f6")}>Abrir atendimento</button>}
                      {canEdit && <button onClick={() => setDesfechando(p)} style={btnContorno("#22d3ee")}>Desfecho</button>}
                      {(examesPend[p.id]?.aguardando > 0 || examesPend[p.id]?.prontos > 0 || checagemPend[p.id]?.itens?.length > 0) && (
                        <div style={{ width: "100%", display: "flex", gap: 8, fontSize: 11, fontWeight: 700 }}>
                          {examesPend[p.id]?.aguardando > 0 && <span style={{ color: "#d97706" }}>{examesPend[p.id].aguardando} exame(s) aguardando</span>}
                          {examesPend[p.id]?.prontos > 0 && <span style={{ color: "#3b82f6" }}>{examesPend[p.id].prontos} resultado(s) pronto(s)</span>}
                          {checagemPend[p.id]?.itens?.length > 0 && <span style={{ color: "#f43f5e" }}>{checagemPend[p.id].itens.length} medicamento(s) sem checagem</span>}
                        </div>
                      )}
                      {fmtSinaisVitais(p) && <div style={{ width: "100%", fontSize: 11, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{fmtSinaisVitais(p)}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );

        // ── Checagem de medicação: lista de trabalho da enfermagem ──
        // Ordena pelo que espera há mais tempo desde que a farmácia entregou.
        if (sub === "e_checagem") {
          const pend = emAtendimento
            .map(p => ({ p, info: checagemPend[p.id] }))
            .filter(x => x.info && x.info.itens.length)
            .sort((a, b) => new Date(a.info.desde || 0) - new Date(b.info.desde || 0));
          const totalItens = pend.reduce((a, x) => a + x.info.itens.length, 0);
          const esperaDe = x => diffMin(x.info.desde, agora);
          return (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
                <Card label="Pacientes a checar" valor={pend.length} cor={pend.length ? "#d97706" : "#34d399"} />
                <Card label="Medicamentos aguardando" valor={totalItens} cor={totalItens ? "#d97706" : "#34d399"} />
                <Card label="Em atendimento agora" valor={emAtendimento.length} cor={VX.azul} />
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", marginBottom: 12, fontSize: 12, color: "var(--text-2)", lineHeight: 1.6 }}>
                A farmácia entregou estes medicamentos e ninguém registrou o que foi feito com eles. Abrir o paciente leva direto à aba <strong>Checagem</strong>, onde a dose é marcada como administrada — ou justificada, se não foi dada.
              </div>
              {pend.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Nenhuma medicação aguardando checagem. Toda dose entregue pela farmácia já foi registrada.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {pend.map(({ p, info }) => {
                    const espera = esperaDe({ info });
                    const atraso = espera != null && espera >= 60;   // entregue há 1h e ninguém checou
                    const sala = salas.find(s => s.atendimento_id === p.id);
                    return (
                      <div key={p.id} style={{ ...linhaPac, borderLeft: `4px solid ${atraso ? "#f43f5e" : "#d97706"}` }}>
                        <strong style={{ minWidth: 64 }}>{p.iniciais}</strong>
                        {p.prontuario && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>reg. {p.prontuario}</span>}
                        <ClasseBadge c={p.classificacao} />
                        {sala && <span style={{ fontSize: 10.5, fontWeight: 700, color: VX.azul, border: `1px solid ${VX.azul}55`, borderRadius: 99, padding: "0 7px" }}>{sala.identificacao} · {sala.area}</span>}
                        <span style={{ marginLeft: "auto", fontSize: 12, color: atraso ? "#f43f5e" : "var(--text-3)", fontFamily: "JetBrains Mono, monospace", fontWeight: atraso ? 700 : 400 }}>
                          {espera != null ? `entregue há ${fmtDur(espera)}` : "—"}
                        </span>
                        {canEdit && <button onClick={() => { setAtendendoAba("checagem"); setAtendendo(p); }} style={btnContorno(atraso ? "#f43f5e" : "#d97706")}>Checar medicação</button>}
                        <div style={{ width: "100%", fontSize: 11.5, color: "var(--text-2)", display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {info.itens.map(it => (
                            <span key={it.id} style={{ border: "1px solid var(--border)", borderRadius: 99, padding: "1px 9px" }}>
                              {it.medicamento_nome}{it.dose ? ` · ${it.dose}` : ""}{it.via ? ` · ${it.via}` : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 10 }}>Lista dos pacientes <strong>em atendimento</strong>. Quem já teve desfecho registrado sai daqui — a checagem desses fica no histórico do atendimento.</div>
            </div>
          );
        }

        // ── Leitos detalhados ──
        if (sub === "e_leitos") return (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
              <Card label="Total de vagas do PS" valor={ativas.length} cor={VX.azul} />
              <Card label="No censo do hospital" valor={doCenso.length} cor="#0d9488" />
              <Card label="Retaguarda (fora do censo)" valor={retaguarda.length} cor="#d97706" />
              <Card label="Ocupadas" valor={ocupadas(ativas)} cor={ocupadas(ativas) ? "#f43f5e" : "#34d399"} />
              <Card label="Livres" valor={dispon(ativas)} cor={dispon(ativas) ? "#34d399" : "#f43f5e"} />
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
              {Object.entries(PS_SALA_STATUS).map(([k, v]) => (
                <span key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-muted)" }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: v.cor }} />{v.label} ({ativas.filter(s => (s.status || "disponivel") === k).length})
                </span>
              ))}
              <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 6 }}><strong>R</strong> = retaguarda, não conta no censo do hospital</span>
              {canEdit && <button onClick={() => setShowSalas(true)} style={{ marginLeft: "auto", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 12px", color: "var(--text-3)", cursor: "pointer", fontSize: 12 }}>Gerenciar vagas</button>}
            </div>
            {ativas.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Nenhuma vaga cadastrada. Rode a migração das vagas do PS ou cadastre em “Gerenciar vagas”.</div>
            ) : (<>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "13px 15px", marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#0d9488", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 9 }}>Vagas que contam no censo do hospital ({doCenso.length})</div>
                <MapaAreas lista={doCenso} />
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: "4px solid #d97706", borderRadius: 10, padding: "13px 15px" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#d97706", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Retaguarda provisória — só no panorama do PS ({retaguarda.length})</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 9 }}>Observação, procedimento, PCR e isolamento infantil: alta rotatividade, não entram nos leitos do hospital.</div>
                <MapaAreas lista={retaguarda} />
              </div>
            </>)}
          </div>
        );

        // ── Transferências ──
        if (sub === "e_transferencias") {
          const transf = finalizados.filter(p => p.desfecho === "transferencia");
          const viaDe = p => PS_VIAS_TRANSF.find(v => normTxt(p.observacao).includes(normTxt(v))) || "Não informada";
          const porVia = {}; transf.forEach(p => { const v = viaDe(p); porVia[v] = (porVia[v] || 0) + 1; });
          return (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
                <Card label="Transferências hoje" valor={transf.length} cor="#6366f1" />
                {PS_VIAS_TRANSF.slice(0, 2).map(v => <Card key={v} label={v} valor={porVia[v] || 0} cor={v === "Vaga Zero" ? "#f43f5e" : VX.azul} />)}
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", marginBottom: 12, fontSize: 12, color: "var(--text-2)", lineHeight: 1.6 }}>
                A via da transferência é registrada no <strong>Desfecho → Transferência</strong>, no campo “Via”: <strong>Vaga Zero</strong> (imposição de vaga em urgência), <strong>GERINT</strong> (regulação), contato direto ou outro.
              </div>
              {transf.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Nenhuma transferência externa hoje.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {transf.map(p => (
                    <div key={p.id} style={{ ...linhaPac, borderLeft: "4px solid #6366f1" }}>
                      <strong style={{ minWidth: 64 }}>{p.iniciais}</strong>
                      <ClasseBadge c={p.classificacao} />
                      <span style={{ fontSize: 10.5, fontWeight: 800, color: viaDe(p) === "Vaga Zero" ? "#f43f5e" : VX.azul, border: `1px solid ${viaDe(p) === "Vaga Zero" ? "#f43f5e55" : VX.azul + "55"}`, borderRadius: 99, padding: "0 8px" }}>{viaDe(p)}</span>
                      {p.observacao && <span style={{ fontSize: 12, color: "var(--text-3)", flex: 1 }}>{p.observacao}</span>}
                      <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{horaFmt(p.desfecho_em)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }

        // ── Aguardando leito ──
        if (sub === "e_aguardando") {
          const internar = finalizados.filter(p => p.desfecho === "internacao");
          const jaNoLeito = p => leitos.some(l => l.ps_atendimento_id === p.id || (l.prontuario && p.prontuario && l.prontuario === p.prontuario));
          const naFila = internar.filter(p => !jaNoLeito(p));
          return (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
                <Card label="Internações decididas hoje" valor={internar.length} cor="#3b82f6" />
                <Card label="Ainda sem leito" valor={naFila.length} cor={naFila.length ? "#d97706" : "#34d399"} />
                <Card label="Leitos livres no hospital" valor={leitos.filter(l => l.status === "livre").length} cor="#34d399" />
              </div>
              {internar.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Nenhuma internação decidida hoje.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {internar.map(p => {
                    const alocado = leitos.find(l => l.ps_atendimento_id === p.id) || leitos.find(l => l.prontuario && p.prontuario && l.prontuario === p.prontuario);
                    return (
                      <div key={p.id} style={{ ...linhaPac, borderLeft: `4px solid ${alocado ? "#34d399" : "#d97706"}` }}>
                        <strong style={{ minWidth: 64 }}>{p.iniciais}</strong>
                        {p.prontuario && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>reg. {p.prontuario}</span>}
                        <ClasseBadge c={p.classificacao} />
                        {p.setor_destino && <span style={{ fontSize: 12, color: "var(--text-3)" }}>→ {p.setor_destino}</span>}
                        <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, color: alocado ? "#34d399" : "#d97706", border: `1px solid ${alocado ? "#34d39955" : "#d9770655"}`, borderRadius: 99, padding: "0 8px" }}>
                          {alocado ? `internado · leito ${alocado.identificacao}` : "aguardando leito"}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>desde {horaFmt(p.desfecho_em)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 10 }}>A alocação do leito é feita no módulo <strong>Giro de Leitos</strong>. Aqui você acompanha quem saiu do PS com internação decidida e ainda não tem leito.</div>
            </div>
          );
        }

        // ── Assistente IA do PS ──
        if (sub === "e_ia") return <PsAssistenteView fila={fila} finalizados={finalizados} salas={ativas} leitos={leitos} />;
        return null;
      })()}

      {/* FINALIZADOS HOJE */}
      {finalizados.length > 0 && (
        <details style={{ marginBottom: "1.25rem" }}>
          <summary style={{ ...secLbl, cursor: "pointer" }}>Finalizados hoje ({finalizados.length})</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
            {finalizados.map(p => (
              <div key={p.id} style={{ ...linhaPac, padding: "7px 12px", fontSize: 12, color: "var(--text-3)" }}>
                <strong style={{ color: "var(--text-2)" }}>{p.iniciais}</strong>
                <ClasseBadge c={p.classificacao} />
                {p.desfecho && <span style={{ color: PS_DESFECHOS[p.desfecho]?.cor || "var(--text-3)", fontWeight: 700 }}>{PS_DESFECHOS[p.desfecho]?.label || p.desfecho}{p.setor_destino ? ` → ${p.setor_destino}` : ""}</span>}
                <span style={{ marginLeft: "auto", fontFamily: "JetBrains Mono, monospace" }}>permanência {fmtDur(diffMin(p.chegada_em, p.desfecho_em))}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* MODAL TRIAGEM / REAVALIAÇÃO */}
      {/* AÇÕES RÁPIDAS — rodapé fixo do módulo */}
      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", padding: "12px 0 4px", marginTop: 6, borderTop: "1px solid var(--border)" }}>
        {canEdit && <button onClick={() => { setSub("classificar"); setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50); }}
          style={{ background: VX.turquesa, color: "#062a26", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 7 }}>
          <Icon name="activity" size={15} />Novo atendimento
        </button>}
        <button onClick={() => setShowProtocolos(true)}
          style={{ background: "transparent", color: VX.azul, border: `1px solid ${VX.azul}66`, borderRadius: 8, padding: "10px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 7 }}>
          <Icon name="clipboard" size={15} />Abrir protocolos
        </button>
        <button onClick={() => setSub("protocolo")}
          style={{ background: "transparent", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 7 }}>
          <Icon name="checks" size={15} />Manchester adaptado
        </button>
      </div>

      {showProtocolos && <PsProtocolosModal sb={sb} currentUser={currentUser} canEdit={canEdit} isMaster={currentUser?.role === "adm_master"} onClose={() => setShowProtocolos(false)} />}
      {showFaixasPed && <FaixasPediatricasModal sb={sb} faixas={faixasPed} currentUser={currentUser} onClose={() => setShowFaixasPed(false)} onSaved={() => loadFaixasPediatricas(sb).then(setFaixasPed)} />}
      {showFaixasObst && <FaixasObstetricasModal sb={sb} regras={faixasObst} currentUser={currentUser} onClose={() => setShowFaixasObst(false)} onSaved={() => loadFaixasObstetricas(sb).then(setFaixasObst)} />}
      {showSalas && <PsSalasModal salas={salas} onClose={() => setShowSalas(false)} onSave={salvarSala} onDelete={excluirSala} isMaster={currentUser?.role === "adm_master"} />}
      {alocando && <PsAlocarSalaModal sala={alocando} pacientes={fila.filter(p => ["aguardando_atendimento", "em_atendimento"].includes(p.status) && !salas.some(s => s.atendimento_id === p.id))} onClose={() => setAlocando(null)} onSave={ocuparSala} />}
      {triando && <TriagemModal sb={sb} paciente={triando} faixasPediatricas={faixasPed} faixasObstetricas={faixasObst} onClose={() => setTriando(null)} onTriar={(cls, vitais, sug, comorb, extras) => triar(triando, cls, vitais, sug, comorb, extras)} />}
      {reavaliando && <TriagemModal sb={sb} paciente={reavaliando} reavaliacao faixasPediatricas={faixasPed} faixasObstetricas={faixasObst} onClose={() => setReavaliando(null)} onTriar={(cls, vitais, sug, comorb, extras) => reavaliar(reavaliando, cls, vitais, sug, comorb, extras)} />}

      {/* MODAL DESFECHO */}
      {desfechando && <PsDesfechoModal sb={sb} paciente={desfechando} setores={setores} leitos={leitos} catalogos={catalogos} examesPend={examesPend[desfechando.id]} onClose={() => setDesfechando(null)} onSave={darDesfecho} />}

      {/* PAINEL DO ATENDIMENTO (evolução, prescrição, exames) */}
      {atendendo && <AtendimentoModal sb={sb} sbCru={sbCru} paciente={atendendo} currentUser={currentUser} abaInicial={atendendoAba} onClose={() => { setAtendendo(null); setAtendendoAba(null); refresh(); }} onChanged={() => {}} />}
      </div>
    </div>
  );
}




// Banner no PS: medicações prontas para retirada (com bipe ao ficarem prontas)
function PsRetiradaBanner({ sb, currentUser, canEdit }) {
  const [prontos, setProntos] = useState([]);
  const [som, setSom] = useState(somLigado());
  const [, setTick] = useState(0);
  const seenRef = useRef(null);
  async function refresh() {
    if (!sb) return;
    const ats = await loadPsAtendimentos(sb);
    const atById = {}; ats.forEach(a => atById[a.id] = a);
    const prep = await loadFarmPreparo(sb);
    const lista = prep.filter(p => p.status === "pronto" && atById[p.atendimento_id]).map(p => ({ ...p, at: atById[p.atendimento_id] }));
    setProntos(lista);
    const ids = new Set(lista.map(p => p.id));
    if (seenRef.current) { const novas = [...ids].filter(x => !seenRef.current.has(x)); if (novas.length && somLigado()) avisoSonoro(true); }
    seenRef.current = ids;
  }
  useEffect(() => { refresh(); const onF = () => refresh(); window.addEventListener("focus", onF); const id = setInterval(() => { refresh(); setTick(t => t + 1); }, 12000); return () => { window.removeEventListener("focus", onF); clearInterval(id); }; }, []);
  async function confirmar(p) { if (!confirm(`Confirmar retirada da medicação de ${p.at?.iniciais || "?"}?`)) return; await atualizarPreparoRemote(sb, p.id, { status: "retirado", retirado_em: nowISO(), retirado_por: currentUser?.name || null }); registrarAuditoria(sb, currentUser, "PS: retirada de medicação", p.at?.iniciais || "", {}); setTimeout(refresh, 300); }
  function ativar() { ligarSom(true); setSom(true); avisoSonoro(true); }
  if (prontos.length === 0 && som) return null;
  return (
    <div style={{ background: prontos.length ? "#3b82f614" : "var(--surface)", border: `1px solid ${prontos.length ? "#3b82f666" : "var(--border)"}`, borderLeft: `4px solid ${prontos.length ? "#3b82f6" : "var(--border-2)"}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      {prontos.length > 0 ? (
        <>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#3b82f6" }}>🔔 {prontos.length} medicação(ões) pronta(s) na farmácia:</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1 }}>
            {prontos.map(p => (
              <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 99, padding: "3px 6px 3px 11px", fontSize: 12 }}>
                {p.at?.iniciais || "?"}{p.at?.prontuario ? ` · ${p.at.prontuario}` : ""}
                {canEdit && <button onClick={() => confirmar(p)} style={{ ...btnContorno("#34d399"), padding: "2px 8px" }}>Retirar</button>}
              </span>
            ))}
          </div>
        </>
      ) : <span style={{ fontSize: 12.5, color: "var(--text-muted)", flex: 1 }}>Avisos sonoros de medicação pronta estão desligados neste computador.</span>}
      {!som && <button onClick={ativar} style={{ background: "transparent", color: "var(--text-2)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "6px 12px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>🔈 Ativar som</button>}
    </div>
  );
}

// Banner no PS: intervenções da farmácia clínica aguardando o prescritor.
// Fecha o ciclo — o médico vê o problema/conduta e responde (aceita/não aceita).
function PsIntervencaoBanner({ sb, currentUser, canEdit }) {
  const [pend, setPend] = useState([]);
  const [, setTick] = useState(0);
  const seenRef = useRef(null);
  async function refresh() {
    if (!sb) return;
    const ats = await loadPsAtendimentos(sb);
    const atById = {}, porProntuario = {};
    ats.forEach(a => { atById[a.id] = a; if (a.prontuario) porProntuario[normTxt(String(a.prontuario))] = a; });
    const ivs = await loadFarmIntervencoes(sb);
    const lista = ivs.filter(i => i.status === "pendente").map(i => {
      let at = i.atendimento_id ? atById[i.atendimento_id] : null;
      if (!at && i.paciente_prontuario) at = porProntuario[normTxt(String(i.paciente_prontuario))];
      return at ? { iv: i, at } : null;
    }).filter(Boolean);
    setPend(lista);
    const ids = new Set(lista.map(x => x.iv.id));
    if (seenRef.current) { const novas = [...ids].filter(x => !seenRef.current.has(x)); if (novas.length && somLigado()) avisoSonoro(false); }
    seenRef.current = ids;
  }
  useEffect(() => { refresh(); const onF = () => refresh(); window.addEventListener("focus", onF); const id = setInterval(() => { refresh(); setTick(t => t + 1); }, 12000); return () => { window.removeEventListener("focus", onF); clearInterval(id); }; }, []);
  async function responder(x, status) {
    let campos = { status };
    if (status === "nao_aceita") { const d = prompt("Motivo da não aceitação (opcional):", ""); if (d === null) return; campos.desfecho = d || null; }
    await updateFarmIntervencaoRemote(sb, x.iv.id, campos);
    registrarAuditoria(sb, currentUser, "PS: resposta à intervenção — " + status, x.at?.iniciais || "", {});
    setTimeout(refresh, 300);
  }
  if (pend.length === 0) return null;
  return (
    <div style={{ background: "#d9770614", border: "1px solid #d9770666", borderLeft: "4px solid #d97706", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#d97706", marginBottom: 8 }}>🔔 {pend.length} intervenção(ões) da farmácia aguardando o prescritor</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {pend.map(x => (
          <div key={x.iv.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 9, padding: "9px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 13 }}>{x.at?.iniciais || x.iv.paciente_iniciais || "?"}{x.at?.prontuario ? ` · reg. ${x.at.prontuario}` : ""}</strong>
              {x.iv.medicamento_nome && <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>· {x.iv.medicamento_nome}</span>}
              {x.iv.tipo && <span style={{ fontSize: 10, color: "var(--text-3)", border: "1px solid var(--border-2)", borderRadius: 99, padding: "0 6px" }}>{FARM_ALERTA_TIPOS[x.iv.tipo] || x.iv.tipo}</span>}
              {x.iv.gravidade && FARM_GRAV[x.iv.gravidade] && <span style={{ fontSize: 9.5, fontWeight: 800, color: FARM_GRAV[x.iv.gravidade].cor, textTransform: "uppercase" }}>{FARM_GRAV[x.iv.gravidade].label}</span>}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 5, lineHeight: 1.5 }}><strong>Problema:</strong> {x.iv.problema}</div>
            {x.iv.conduta && <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 2, lineHeight: 1.5 }}><strong>Conduta sugerida:</strong> {x.iv.conduta}</div>}
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 4 }}>Farmácia: {x.iv.farmaceutico || "?"} · {x.iv.created_at ? new Date(x.iv.created_at).toLocaleString("pt-BR") : ""}</div>
            {canEdit && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                <button onClick={() => responder(x, "aceita")} style={btnContorno("#34d399")}>Aceitar conduta</button>
                <button onClick={() => responder(x, "nao_aceita")} style={btnContorno("#f43f5e")}>Não aceitar</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
