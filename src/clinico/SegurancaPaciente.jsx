// ═══════════════════════════════════════════════════════════
// SEGURANÇA DO PACIENTE — A TELA
//
// Saiu do App.jsx (738 linhas próprias + 408 exclusivas). As regras puras
// continuam em ./nsp.js e o acesso ao banco em ./nsp-dados.js; aqui é só
// tela e estado.
//
// Vem junto o `NotificacaoRapida`, o botão flutuante de notificar em 30s.
// Ele mora em outro canto do App.jsx, mas era o único usuário externo de
// `registrarIncidente` e das cores — trazendo ele, o módulo fecha sem
// deixar resto. E ele É deste módulo: é a porta de entrada do notificante,
// enquanto a página é a mesa de trabalho do núcleo.
//
// 🔴 A ORDEM DA BARRA (NSP_NAV) NÃO É POR ASSUNTO, É POR QUEM USA.
// "Registrar incidente" já foi o 4º item, atrás de três painéis do núcleo —
// e é o ato mais praticado do sistema: 13 dos 17 perfis têm escrita aqui.
// Subnotificação parece segurança, que é o pior jeito de errar num
// indicador de qualidade.
//
// ⚠️ O `sb` chega por prop e desce para o ./nsp-dados.js. Nulo = offline.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import { VX, HOSPITAL_NOME, HOSPITAL_SIGLA, MONTHS_FULL, Icon } from "../ui/base.jsx";
import { comGrupos } from "../ui/sub-nav.js";
import { taxa } from "../util/formato.js";
import { CLASSES as NSP_CLASSES, GRAUS_DANO as NSP_GRAUS, TIPOS as NSP_TIPOS, STATUS as NSP_STATUS,
         matrizRisco, exigeRCA, notificacaoCompulsoria, resumoIncidentes,
         indicadoresSeguranca, farol, metasSeguranca, relatorioNsp, fichaNotivisa,
         METAS as NSP_METAS, STATUS_PROTOCOLO, protocoloRevisaoVencida, resumoProtocolos,
         STATUS_CAPACITACAO, capacitacaoVencida, resumoCapacitacoes,
         TIPO_COMUNICADO, PRIORIDADE_COMUNICADO, resumoComunicados,
         responderAssistenteNsp, NSP_ASSIST_AJUDA,
         ISHIKAWA_CATEGORIAS, FATORES_CONTRIBUINTES, METODOS_RCA, STATUS_ACAO,
         acaoAtrasada, resumoAcoes, incidentesAguardandoRca,
         rotuloTipo, rotuloClasse, rotuloGrau, rotuloStatus } from "./nsp.js";
import { loadIncidentes, loadLppAdquiridas, registrarIncidente, atualizarStatusIncidente, loadRcas, loadAcoes, registrarRca, registrarAcao, atualizarAcao, loadMetaFaixas, loadMetaMedicoes, salvarMetaFaixa, registrarMetaMedicao, loadProtocolos, salvarProtocolo, loadCapacitacoes, salvarCapacitacao, loadComunicados, salvarComunicado } from "./nsp-dados.js";

// ═══════════════════════════════════════════════════════════
// NSP — Núcleo de Segurança do Paciente (Fase 2a)
// Barra lateral própria (padrão dos outros módulos). Nesta fase são
// funcionais: Visão geral, Dashboard, Notificações (triagem), Registrar e
// Consultar incidente (2a); Análise de causas e Plano de ação (2b);
// Indicadores e Metas de segurança (2c); Relatórios/NOTIVISA, Protocolos, Capacitações e Comunicação (2d).
// Assistente AI: último item da 2d.
// ═══════════════════════════════════════════════════════════
// 🔴 ORDENADO POR QUEM USA, e não por assunto.
//
// "Registrar incidente" era o 4º item, atrás de "Visão geral", "Panorama" e
// "Notificações". E registrar incidente é o ato mais praticado do sistema
// inteiro: 13 dos 17 perfis têm escrita neste módulo — o dobro do segundo
// colocado. Quem chegava para notificar uma queda passava por três painéis
// do NÚCLEO antes de achar o formulário.
//
// Subnotificação não precisa de mais motivo que esse. E subnotificação
// parece segurança, que é o pior jeito de errar num indicador de qualidade.
//
// A divisão abaixo é por PESSOA:
//   • "Notificar" é de quem presta o cuidado — quase todo mundo;
//   • "Trabalho do núcleo" é de quem investiga — "Notificações" é a fila de
//     triagem DELE, não do notificante (por isso saiu do topo);
//   • "Governança" é do coordenador do núcleo;
//   • "Acompanhar" é leitura, e leitura vem por último em toda barra.
//
// "Visão geral" fica solta no topo, sem grupo: é onde o módulo abre, e o
// texto normativo (RDC 36/2013) é o que orienta quem chega pela primeira
// vez. Cabeçalho acima de um item só seria ruído.
const NSP_NAV = [
  { key: "visao",        label: "Visão geral",         icon: "shield" },

  { key: "registrar",    label: "Registrar incidente", icon: "record", grupo: "Notificar" },
  { key: "consultar",    label: "Consultar incidente", icon: "list",   grupo: "Notificar" },

  { key: "notificacoes", label: "Fila de triagem",     icon: "activity",  grupo: "Trabalho do núcleo" },
  { key: "causas",       label: "Análise de causas",   icon: "clipboard", grupo: "Trabalho do núcleo" },
  { key: "plano",        label: "Plano de ação",       icon: "clipboard", grupo: "Trabalho do núcleo" },

  { key: "protocolos",   label: "Protocolos",          icon: "shield", grupo: "Governança" },
  { key: "metas",        label: "Metas de segurança",  icon: "record", grupo: "Governança" },
  { key: "capacitacoes", label: "Capacitações",        icon: "users",  grupo: "Governança" },
  { key: "comunicacao",  label: "Comunicação",         icon: "chat",   grupo: "Governança" },

  { key: "dashboard",    label: "Panorama de incidentes", icon: "dashboard", grupo: "Acompanhar" },
  { key: "indicadores",  label: "Indicadores",         icon: "chart",   grupo: "Acompanhar" },
  { key: "relatorios",   label: "Relatórios",          icon: "printer", grupo: "Acompanhar" },
  { key: "assistente",   label: "Assistente AI",       icon: "chat",    grupo: "Acompanhar" },
];
const NSP_COR = { verde: "#34d399", amarelo: "#f5b301", laranja: "#fb923c", vermelho: "#f43f5e", azul: "#38bdf8" };
const nspCorClasse = c => NSP_COR[(NSP_CLASSES.find(x => x.v === c) || {}).nivel] || "#8891a5";
const nspCorGrau   = g => NSP_COR[(NSP_GRAUS.find(x => x.v === g) || {}).nivel] || "#8891a5";
const nspCorStatus = s => NSP_COR[(NSP_STATUS.find(x => x.v === s) || {}).nivel] || "#8891a5";
function nspFormVazio() {
  return { classe: "", tipo: "", grau_dano: "", descricao: "", acoes_imediatas: "", local_setor: "", leito: "", prontuario: "", probabilidade: "", gravidade: "", anonimo: false };
}

// ── NSP Fase 2d: Relatório mensal do NSP + ficha NOTIVISA (imprimível) ──
function NspRelatorioView({ incidentes, acoes, lppAdq, medicoes, faixas }) {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth());
  const [ano, setAno] = useState(now.getFullYear());
  const [pacDia, setPacDia] = useState("");
  const [preview, setPreview] = useState(false);
  const [fichas, setFichas] = useState({});

  const rel = relatorioNsp({ incidentes, acoes, lppAdquiridas: lppAdq, medicoes, faixas, ano, mes, pacientesDia: Number(pacDia) || undefined });
  const ind = rel.indicadores, resumo = rel.resumo, plano = rel.plano;
  const farolCor = { verde: "#34d399", amarelo: "#f5b301", vermelho: "#f43f5e", cinza: "#8891a5" };
  const farolTxt = { verde: "no alvo", amarelo: "alerta", vermelho: "fora do alvo", cinza: "sem leitura" };

  const selInp = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none" };
  const lbl = { fontSize: 11, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 4 };
  const card = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", marginBottom: 14 };
  const dataFmt = d => d ? new Date(d).toLocaleDateString("pt-BR") : "—";
  const RateCard = ({ label, valor, unidade, cor, sub }) => (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${cor || "var(--border)"}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: cor || "var(--text)", fontFamily: "JetBrains Mono, monospace", marginTop: 3 }}>{valor}<span style={{ fontSize: 11, fontWeight: 600, marginLeft: 3, color: "var(--text-muted)" }}>{unidade}</span></div>
      {sub && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
  const printStyles = `@media print { body * { visibility: hidden !important; } #nsp-print, #nsp-print * { visibility: visible !important; } #nsp-print { position: fixed; inset: 0; background: #fff !important; color: #111 !important; padding: 18px; } @page { size: A4 portrait; margin: 12mm; } }`;

  return (
    <div>
      <style>{printStyles}</style>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
        Relatório mensal do NSP apurado automaticamente dos módulos (RDC 36/2013). Escolha o mês, gere o relatório e imprima/PDF. A seção NOTIVISA lista as notificações compulsórias com a ficha pronta.
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: "1.25rem" }}>
        <div><div style={lbl}>Mês</div><select value={mes} onChange={e => setMes(+e.target.value)} style={selInp}>{MONTHS_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}</select></div>
        <div><div style={lbl}>Ano</div><input type="number" value={ano} onChange={e => setAno(+e.target.value)} style={{ ...selInp, width: 90 }} /></div>
        <div><div style={lbl}>Pacientes-dia (opcional)</div><input type="number" min="0" value={pacDia} onChange={e => setPacDia(e.target.value)} placeholder="p/ taxas /1000" style={{ ...selInp, width: 140 }} /></div>
        <button onClick={() => setPreview(p => !p)} style={{ background: "transparent", color: "#22d3ee", border: "1px solid #164e63", borderRadius: 7, padding: "8px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{preview ? "✕ Fechar relatório" : "Relatório do mês"}</button>
        {preview && <button onClick={() => window.print()} style={{ background: "#34d399", color: "#000", border: "none", borderRadius: 7, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Imprimir / PDF</button>}
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Incidentes de {MONTHS_FULL[mes]}/{ano}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))", gap: 10, marginBottom: "1.5rem" }}>
        <RateCard label="Incidentes no mês" valor={resumo.total} unidade="" cor="#22d3ee" sub={`${resumo.comDano} com dano`} />
        <RateCard label="Never events" valor={resumo.neverEvents} unidade="" cor={resumo.neverEvents ? "#f43f5e" : "#34d399"} />
        <RateCard label="Compulsórias" valor={rel.compulsorios.length} unidade="" cor={rel.compulsorios.length ? "#fb923c" : "#34d399"} sub="NOTIVISA" />
        <RateCard label="Quedas" valor={ind.quedas} unidade="" cor={ind.quedas ? "#f5b301" : "#34d399"} sub={`${ind.quedasComDano} com dano`} />
        <RateCard label="Erro de medicação" valor={ind.errosMedicacao} unidade="" cor={ind.errosMedicacao ? "#f43f5e" : "#34d399"} />
        <RateCard label="Densidade" valor={resumo.densidade != null ? resumo.densidade : "—"} unidade="/1000" cor="#818cf8" sub="precisa de pacientes-dia" />
        <RateCard label="Ações atrasadas" valor={plano.atrasadas} unidade="" cor={plano.atrasadas ? "#f43f5e" : "#34d399"} sub="plano (atual)" />
        <RateCard label="Fechamento plano" valor={plano.taxaFechamento != null ? plano.taxaFechamento : "—"} unidade="%" cor="#22d3ee" sub="ações concluídas" />
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>NOTIVISA — notificações compulsórias do mês</div>
      <div style={card}>
        {rel.compulsorios.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nenhuma notificação compulsória (never event / óbito) no mês.</div> :
          rel.compulsorios.map((inc, i) => {
            const f = fichaNotivisa(inc); const chave = inc.id ?? i; const aberto = fichas[chave];
            return (
              <div key={chave} style={{ borderTop: i ? "1px solid var(--border)" : "none", padding: "10px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ background: "#fb923c22", color: "#fb923c", border: "1px solid #fb923c66", borderRadius: 999, padding: "1px 9px", fontSize: 11, fontWeight: 700 }}>{f.tipo_notificacao}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{f.tipo_incidente}</span>
                  <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{dataFmt(f.data_ocorrencia)} · {f.local || "—"}</span>
                  <button onClick={() => setFichas(p => ({ ...p, [chave]: !aberto }))} style={{ marginLeft: "auto", background: "transparent", color: "#22d3ee", border: "1px solid #164e63", borderRadius: 6, padding: "4px 12px", fontWeight: 700, fontSize: 11.5, cursor: "pointer" }}>{aberto ? "Ocultar ficha" : "Ver ficha NOTIVISA"}</button>
                </div>
                {aberto && (
                  <div style={{ marginTop: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", fontSize: 12.5, lineHeight: 1.7 }}>
                    {[["Tipo de notificação", f.tipo_notificacao], ["Data de ocorrência", dataFmt(f.data_ocorrencia)], ["Tipo de incidente", f.tipo_incidente], ["Classificação", f.classe], ["Grau do dano (OMS)", f.grau_dano], ["Local/setor", f.local || "—"], ["Prontuário", f.prontuario || "—"], ["Nível de risco", f.risco || "—"], ["Descrição", f.descricao || "—"], ["Providências imediatas", f.providencias || "—"]].map(([k, v]) => (
                      <div key={k} style={{ display: "flex", gap: 8 }}><span style={{ minWidth: 165, color: "var(--text-muted)", fontWeight: 700 }}>{k}</span><span style={{ flex: 1 }}>{v}</span></div>
                    ))}
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8, fontStyle: "italic" }}>Campos para lançamento manual no portal NOTIVISA (ANVISA) — o sistema gera a ficha; a submissão é feita no portal.</div>
                  </div>
                )}
              </div>
            );
          })}
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>6 Metas — situação atual</div>
      <div style={card}>
        {rel.metas.map(m => (
          <div key={m.meta} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", borderTop: "1px solid var(--border)" }}>
            <span style={{ width: 12, height: 12, borderRadius: 999, background: farolCor[m.farol], flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, flex: 1 }}>{m.label}</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: farolCor[m.farol] }}>{m.valor == null ? "—" : m.valor}{m.valor != null && m.unidade === "%" ? "%" : ""}</span>
          </div>
        ))}
      </div>

      {preview && (
        <div id="nsp-print" style={{ background: "#fff", color: "#111", borderRadius: 10, border: "1px solid #e5e7eb", padding: "24px 28px", fontFamily: "Inter, sans-serif", fontSize: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, paddingBottom: 12, borderBottom: "2px solid #e5e7eb" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>RELATÓRIO NSP — {HOSPITAL_SIGLA}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{HOSPITAL_NOME} · Valentrax Healthcare Operations · Núcleo de Segurança do Paciente (RDC 36/2013)</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", background: "#f1f5f9", borderRadius: 8, padding: "6px 14px" }}>{MONTHS_FULL[mes]}/{ano}</div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>Gerado em {new Date().toLocaleString("pt-BR")}</div>
            </div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 14 }}>
            <thead><tr>{["Indicador", "Valor"].map(h => <th key={h} style={{ textAlign: "left", padding: "7px 10px", background: "#f8fafc", color: "#334155", borderBottom: "1.5px solid #e2e8f0", fontSize: 11 }}>{h}</th>)}</tr></thead>
            <tbody>
              {[
                ["Incidentes no mês", resumo.total],
                ["— com dano", resumo.comDano],
                ["— never events", resumo.neverEvents],
                ["Notificações compulsórias (NOTIVISA)", rel.compulsorios.length],
                ["Quedas (com dano)", `${ind.quedas} (${ind.quedasComDano})`],
                ["Erro de medicação com dano", ind.errosMedicacao],
                ["LPP adquirida (POA, atual)", lppAdq],
                ["Densidade de incidentes", resumo.densidade != null ? `${resumo.densidade} /1000 pac-dia` : "—"],
                ["Near-miss ratio", resumo.nearMissRatio ?? "—"],
                ["Plano — abertas / atrasadas", `${plano.abertas} / ${plano.atrasadas}`],
                ["Plano — taxa de fechamento", plano.taxaFechamento != null ? `${plano.taxaFechamento}%` : "—"],
              ].map(([k, v]) => (
                <tr key={k}><td style={{ padding: "6px 10px", borderBottom: "1px solid #eef2f7", fontWeight: 600, color: "#0f172a" }}>{k}</td><td style={{ padding: "6px 10px", borderBottom: "1px solid #eef2f7", color: "#0369a1", fontWeight: 700 }}>{v}</td></tr>
              ))}
            </tbody>
          </table>

          <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", margin: "6px 0" }}>6 Metas Internacionais — situação atual</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 14 }}>
            <tbody>
              {rel.metas.map(m => (
                <tr key={m.meta}><td style={{ padding: "5px 10px", borderBottom: "1px solid #eef2f7", color: "#0f172a" }}>{m.label}</td><td style={{ padding: "5px 10px", borderBottom: "1px solid #eef2f7", fontWeight: 700, color: "#334155" }}>{m.valor == null ? "—" : m.valor}{m.valor != null && m.unidade === "%" ? "%" : ""} · {farolTxt[m.farol]}</td></tr>
              ))}
            </tbody>
          </table>

          {rel.compulsorios.length > 0 && (<>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", margin: "6px 0" }}>Notificações compulsórias (NOTIVISA)</div>
            {rel.compulsorios.map((inc, i) => { const f = fichaNotivisa(inc); return (
              <div key={inc.id ?? i} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
                <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>{f.tipo_notificacao} · {f.tipo_incidente} · {dataFmt(f.data_ocorrencia)}</div>
                <div style={{ color: "#475569", fontSize: 11.5, lineHeight: 1.6 }}>
                  Classificação: {f.classe} · Grau do dano: {f.grau_dano} · Local: {f.local || "—"} · Prontuário: {f.prontuario || "—"}<br />
                  Descrição: {f.descricao || "—"}<br />
                  Providências: {f.providencias || "—"}
                </div>
              </div>
            ); })}
          </>)}

          <div style={{ marginTop: 12, fontSize: 10, color: "#94a3b8", borderTop: "1px solid #e5e7eb", paddingTop: 8 }}>Relatório gerado pela Valentrax Healthcare Operations · dados apurados automaticamente dos módulos. Documento de apoio ao NSP / direção. As notificações compulsórias devem ser lançadas no portal NOTIVISA (ANVISA).</div>
        </div>
      )}
    </div>
  );
}


// ── NSP Fase 2d: Assistente AI — chat local e gratuito (nada sai do navegador) ──
// Só a tela. Toda a inteligência vive em responderAssistenteNsp (nsp.js, puro/testável).
function NspAssistenteView({ incidentes, acoes, rcas, faixas, medicoes, lppAdquiridas, protocolos, capacitacoes, comunicados }) {
  const [msgs, setMsgs] = useState([{ role: "a", text: "Olá! Sou o assistente local do Núcleo de Segurança do Paciente. " + NSP_ASSIST_AJUDA }]);
  const [q, setQ] = useState("");
  const fimRef = useRef(null);
  // ⚠️ `?.` no MÉTODO, não só no ref: `scrollIntoView` não existe no jsdom
  // (nem em ambiente sem layout), e a falta dele derrubava a aba inteira —
  // o `telas.test.jsx` pegou isso na montagem.
  useEffect(() => { fimRef.current?.scrollIntoView?.({ behavior: "smooth" }); }, [msgs]);

  function enviar(texto) {
    const t = (texto != null ? texto : q).trim();
    if (!t) return;
    const resp = responderAssistenteNsp(t, { incidentes, acoes, rcas, faixas, medicoes, lppAdquiridas, protocolos, capacitacoes, comunicados });
    setMsgs(m => [...m, { role: "u", text: t }, { role: "a", text: resp }]);
    setQ("");
  }
  const sugestoes = ["Panorama", "Ações atrasadas", "RCA pendente", "Metas fora do alvo", "Protocolos", "Capacitações", "NOTIVISA"];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 200px)", minHeight: 360, maxWidth: 760 }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
        Assistente local e gratuito: responde a partir dos dados que já existem nos módulos do NSP. Nada é enviado para fora do navegador.
      </div>
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
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && enviar()} placeholder="Pergunte sobre a segurança do paciente…" style={{ flex: 1, background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 13px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none" }} />
        <button onClick={() => enviar()} style={{ background: VX.turquesa, color: "#062a26", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Enviar</button>
      </div>
    </div>
  );
}

export default function NSPPage({ sb, currentUser, canEdit }) {
  const [sub, setSub] = useState("visao");
  const [incidentes, setIncidentes] = useState([]);
  const [lppAdq, setLppAdq] = useState(0);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(nspFormVazio());
  const [filtro, setFiltro] = useState({ tipo: "", classe: "", status: "" });
  const [rcas, setRcas] = useState([]);
  const [acoes, setAcoes] = useState([]);
  const [rcaForm, setRcaForm] = useState(null);
  const [acaoForm, setAcaoForm] = useState(null);
  const [faixasMeta, setFaixasMeta] = useState([]);
  const [medicoes, setMedicoes] = useState([]);
  const [metaEdit, setMetaEdit] = useState(null);
  const [medForm, setMedForm] = useState(null);
  const [protocolos, setProtocolos] = useState([]);
  const [protoForm, setProtoForm] = useState(null);
  const [capacitacoes, setCapacitacoes] = useState([]);
  const [capForm, setCapForm] = useState(null);
  const [comunicados, setComunicados] = useState([]);
  const [comForm, setComForm] = useState(null);

  function recarregar() {
    loadIncidentes(sb).then(setIncidentes); loadLppAdquiridas(sb).then(setLppAdq);
    loadRcas(sb).then(setRcas); loadAcoes(sb).then(setAcoes);
    loadMetaFaixas(sb).then(setFaixasMeta); loadMetaMedicoes(sb).then(setMedicoes);
    loadProtocolos(sb).then(setProtocolos);
    loadCapacitacoes(sb).then(setCapacitacoes);
    loadComunicados(sb).then(setComunicados);
  }
  useEffect(() => { if (sb) recarregar(); }, []);

  const navAtual = NSP_NAV.find(n => n.key === sub) || NSP_NAV[0];
  const resumo = resumoIncidentes(incidentes);
  const planoResumo = resumoAcoes(acoes);
  const ind = indicadoresSeguranca({ incidentes });
  const metas = metasSeguranca({ incidentes, lppAdquiridas: lppAdq, medicoes, faixas: faixasMeta });
  const farolCor = { verde: "#34d399", amarelo: "#f5b301", vermelho: "#f43f5e", cinza: "#8891a5" };
  const farolTxt = { verde: "No alvo", amarelo: "Alerta", vermelho: "Fora do alvo", cinza: "Sem leitura" };
  const protoResumo = resumoProtocolos(protocolos);
  const capResumo = resumoCapacitacoes(capacitacoes);
  const comResumo = resumoComunicados(comunicados);
  const filaRca = incidentesAguardandoRca(incidentes, rcas);
  const risco = matrizRisco(form.probabilidade, form.gravidade);
  const filtrados = incidentes.filter(i =>
    (!filtro.tipo || i.tipo === filtro.tipo) && (!filtro.classe || i.classe === filtro.classe) && (!filtro.status || (i.status || "nova") === filtro.status));
  const fila = incidentes.filter(i => ["nova", "em_analise"].includes(i.status || "nova"));

  async function salvar() {
    if (busy || !form.classe || !form.descricao.trim()) return;
    setBusy(true); await registrarIncidente(sb, form, currentUser);
    setBusy(false); setForm(nspFormVazio()); recarregar(); setSub("consultar");
  }
  async function avancar(inc, novo) {
    if (busy) return; setBusy(true); await atualizarStatusIncidente(sb, inc, novo, null, currentUser); setBusy(false); recarregar();
  }
  function abrirRca(inc) {
    setRcaForm({ incidente: inc, incidente_id: inc.id, metodo: "ambos", porques: ["", "", "", "", ""], ishikawa: {}, fatores: [], barreiras: [], causa_raiz: "", conclusao: "" });
    setSub("causas");
  }
  async function salvarRca() {
    if (busy || !rcaForm || !rcaForm.causa_raiz.trim()) return;
    setBusy(true);
    const porques = rcaForm.porques.map(x => (x || "").trim()).filter(Boolean);
    await registrarRca(sb, { ...rcaForm, porques, status: "concluida" }, currentUser);
    if ((rcaForm.incidente.status || "nova") !== "em_tratamento")
      await atualizarStatusIncidente(sb, rcaForm.incidente, "em_tratamento", "Análise de causa raiz concluída", currentUser);
    setBusy(false); setRcaForm(null); recarregar();
  }
  async function salvarAcao() {
    if (busy || !acaoForm || !acaoForm.o_que.trim()) return;
    setBusy(true); await registrarAcao(sb, acaoForm, currentUser);
    setBusy(false); setAcaoForm(null); recarregar();
  }
  async function mudarAcao(acao, status) {
    if (busy) return; setBusy(true); await atualizarAcao(sb, acao, { status }); setBusy(false); recarregar();
  }
  async function salvarFaixaMeta(faixa) {
    if (busy) return; setBusy(true); await salvarMetaFaixa(sb, faixa, currentUser); setBusy(false); recarregar();
  }
  async function salvarMedicao() {
    if (busy || !medForm || !medForm.meta || !medForm.competencia || !(Number(medForm.denominador) > 0)) return;
    setBusy(true); await registrarMetaMedicao(sb, medForm, currentUser); setBusy(false); setMedForm(null); recarregar();
  }
  async function salvarProto() {
    if (busy || !protoForm || !(protoForm.titulo || "").trim()) return;
    setBusy(true); await salvarProtocolo(sb, protoForm, currentUser); setBusy(false); setProtoForm(null); recarregar();
  }
  async function salvarCap() {
    if (busy || !capForm || !(capForm.tema || "").trim()) return;
    setBusy(true); await salvarCapacitacao(sb, capForm, currentUser); setBusy(false); setCapForm(null); recarregar();
  }
  async function salvarCom() {
    if (busy || !comForm || !(comForm.titulo || "").trim()) return;
    setBusy(true); await salvarComunicado(sb, comForm, currentUser); setBusy(false); setComForm(null); recarregar();
  }

  const card = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", marginBottom: 14 };
  const Card = ({ label, valor, cor, sub }) => (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: cor || "var(--text)", fontFamily: "JetBrains Mono, monospace", marginTop: 4 }}>{valor}</div>
      {sub && <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  const lbl = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 4, display: "block" };
  const Pill = ({ c, t }) => <span style={{ background: `${c}1f`, color: c, border: `1px solid ${c}66`, borderRadius: 999, padding: "1px 9px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{t}</span>;
  const dataHora = d => d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
  const Placeholder = ({ fase }) => (
    <div style={{ ...card, textAlign: "center", padding: "2.5rem", color: "var(--text-muted)" }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{navAtual.label}</div>
      <div style={{ fontSize: 12.5 }}>Em construção — entra na <strong>Fase {fase}</strong>. A estrutura já está aqui na barra lateral.</div>
    </div>
  );
  const btnPrimario = (on = true) => ({ background: on ? VX.turquesa : "#5b76a0", color: "#04222b", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 800, fontSize: 13, cursor: on ? "pointer" : "default" });
  const btnMiniP = { background: "transparent", color: VX.turquesa, border: `1px solid ${VX.turquesa}66`, borderRadius: 6, padding: "5px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer", marginLeft: "auto" };
  const btnGhost = { background: "transparent", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer" };
  const btnGhostMini = { background: "transparent", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 5, padding: "3px 10px", fontWeight: 700, fontSize: 11.5, cursor: "pointer" };
  const chipTgl = (on, c) => ({ background: on ? `${c}33` : "transparent", color: on ? c : "var(--text-3)", border: `1px solid ${on ? c : "var(--border)"}`, borderRadius: 999, padding: "3px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" });

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <nav style={{ width: 210, minWidth: 210, background: "var(--bg-2)", borderRight: "1px solid var(--border)", padding: "1rem 0", overflowY: "auto", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px 12px" }}>
          <Icon name="shield" size={16} /><span style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".02em", color: VX.turquesa }}>SEGURANÇA DO PACIENTE</span>
        </div>
        {comGrupos(NSP_NAV).map((it, i) => {
          if (it.grupoTitulo) return (
            <div key={it.grupoTitulo} style={{ padding: "14px 16px 4px", fontSize: 9.5, fontWeight: 700, letterSpacing: ".13em", textTransform: "uppercase", color: "var(--text-muted)" }}>{it.grupoTitulo}</div>
          );
          const active = sub === it.key; return (
          <button key={it.key} onClick={() => setSub(it.key)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: ".5rem 16px", border: "none", borderLeft: `3px solid ${active ? VX.turquesa : "transparent"}`, background: active ? "var(--surface)" : "transparent", color: active ? VX.turquesa : "var(--text-3)", cursor: "pointer", textAlign: "left", fontSize: 12.5, fontWeight: active ? 700 : 500, fontFamily: "Inter, sans-serif" }}>
            <Icon name={it.icon} size={15} />{it.label}
          </button>
        ); })}
      </nav>

      <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem 1.5rem", minWidth: 0 }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{navAtual.label}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Núcleo de Segurança do Paciente · RDC 36/2013 · PNSP</div>
        </div>

        {sub === "visao" && (<>
          <div style={card}>
            <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 6 }}>O Núcleo de Segurança do Paciente</div>
            <div style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.6 }}>
              Base na <strong>RDC 36/2013 (ANVISA)</strong> e no <strong>PNSP (Portaria 529/2013)</strong>: notificar incidentes, analisar causas, tratar com plano de ação e monitorar indicadores — em cultura <strong>justa e não-punitiva</strong>. Qualquer profissional notifica, inclusive anonimamente.
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
            <Card label="Incidentes" valor={resumo.total} cor="#22d3ee" sub="notificados" />
            <Card label="Novos" valor={resumo.novas} cor={resumo.novas ? "#f5b301" : "var(--text)"} sub="aguardando triagem" />
            <Card label="Com dano" valor={resumo.comDano} cor={resumo.comDano ? "#f43f5e" : "#34d399"} sub="eventos adversos" />
            <Card label="Never events" valor={resumo.neverEvents} cor={resumo.neverEvents ? "#f43f5e" : "#34d399"} sub="nunca deveriam ocorrer" />
          </div>
          {canEdit && <button onClick={() => setSub("registrar")} style={{ marginTop: 14, background: VX.turquesa, color: "#04222b", border: "none", borderRadius: 6, padding: "9px 18px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>+ Registrar incidente</button>}
        </>)}

        {sub === "dashboard" && (<>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
            <Card label="Total" valor={resumo.total} cor="#22d3ee" />
            <Card label="Abertos" valor={resumo.abertas} cor={resumo.abertas ? "#f5b301" : "#34d399"} sub="não concluídos" />
            <Card label="Com dano" valor={resumo.comDano} cor={resumo.comDano ? "#f43f5e" : "#34d399"} />
            <Card label="Near-miss ratio" valor={resumo.nearMissRatio ?? "—"} cor="#818cf8" sub="quase-erros ÷ com dano" />
            <Card label="Ações atrasadas" valor={planoResumo.atrasadas} cor={planoResumo.atrasadas ? "#f43f5e" : "#34d399"} sub="plano vencido — cobrar" />
            <Card label="LPP adquirida" valor={lppAdq} cor={lppAdq ? "#fb923c" : "#34d399"} sub="automático · POA Fase 1a" />
          </div>
          <div style={card}>
            <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 8 }}>Por tipo</div>
            {Object.keys(resumo.porTipo).length === 0 ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Sem incidentes.</div> :
              Object.entries(resumo.porTipo).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", borderTop: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 12.5, flex: 1 }}>{rotuloTipo(t)}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-3)" }}>{n}</span>
                </div>
              ))}
          </div>
        </>)}

        {sub === "notificacoes" && (<>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>Fila de triagem do núcleo — notificações novas e em análise.</div>
          {fila.length === 0 ? <div style={{ ...card, color: "var(--text-muted)", fontSize: 13 }}>Nada na fila.</div> :
            fila.map(i => (
              <div key={i.id} style={{ ...card, borderLeft: `4px solid ${nspCorClasse(i.classe)}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, fontFamily: "JetBrains Mono, monospace", color: "var(--text-muted)" }}>#{i.numero}</span>
                  <Pill c={nspCorClasse(i.classe)} t={rotuloClasse(i.classe)} />
                  {i.tipo && <Pill c="#8891a5" t={rotuloTipo(i.tipo)} />}
                  {i.grau_dano && i.grau_dano !== "nenhum" && <Pill c={nspCorGrau(i.grau_dano)} t={`dano ${rotuloGrau(i.grau_dano)}`} />}
                  <Pill c={nspCorStatus(i.status)} t={rotuloStatus(i.status)} />
                  <span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--text-muted)" }}>{dataHora(i.criado_em)} · {i.anonimo ? "anônimo" : (i.notificado_por || "—")}</span>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>{i.descricao}</div>
                {canEdit && <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  {(i.status || "nova") === "nova" && <button onClick={() => avancar(i, "em_analise")} disabled={busy} style={{ background: "transparent", color: "#fb923c", border: "1px solid #fb923c66", borderRadius: 6, padding: "5px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Iniciar análise</button>}
                  <button onClick={() => avancar(i, "classificada")} disabled={busy} style={{ background: "transparent", color: "#38bdf8", border: "1px solid #38bdf866", borderRadius: 6, padding: "5px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Classificar</button>
                  <button onClick={() => avancar(i, "concluida")} disabled={busy} style={{ background: "transparent", color: "#34d399", border: "1px solid #34d39966", borderRadius: 6, padding: "5px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Concluir</button>
                </div>}
              </div>
            ))}
        </>)}

        {sub === "registrar" && (canEdit ? (
          <div style={{ ...card, maxWidth: 720 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div><label style={lbl}>Classe do incidente *</label>
                <select value={form.classe} onChange={e => setForm(f => ({ ...f, classe: e.target.value }))} style={inp}><option value="">—</option>{NSP_CLASSES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}</select></div>
              <div><label style={lbl}>Tipo</label>
                <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} style={inp}><option value="">—</option>{NSP_TIPOS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}</select></div>
            </div>
            <div style={{ marginBottom: 10 }}><label style={lbl}>Grau de dano (OMS)</label>
              <select value={form.grau_dano} onChange={e => setForm(f => ({ ...f, grau_dano: e.target.value }))} style={{ ...inp, maxWidth: 260 }}><option value="">—</option>{NSP_GRAUS.map(g => <option key={g.v} value={g.v}>{g.l}</option>)}</select></div>
            <div style={{ marginBottom: 10 }}><label style={lbl}>O que aconteceu *</label>
              <textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} rows={3} style={{ ...inp, resize: "vertical" }} /></div>
            <div style={{ marginBottom: 10 }}><label style={lbl}>Ações imediatas (o que já foi feito)</label>
              <textarea value={form.acoes_imediatas} onChange={e => setForm(f => ({ ...f, acoes_imediatas: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div><label style={lbl}>Setor</label><input value={form.local_setor} onChange={e => setForm(f => ({ ...f, local_setor: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>Leito</label><input value={form.leito} onChange={e => setForm(f => ({ ...f, leito: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>Prontuário</label><input value={form.prontuario} onChange={e => setForm(f => ({ ...f, prontuario: e.target.value }))} style={inp} /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, marginBottom: 10, alignItems: "end" }}>
              <div><label style={lbl}>Probabilidade (1–5)</label><input type="number" min={1} max={5} value={form.probabilidade} onChange={e => setForm(f => ({ ...f, probabilidade: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>Gravidade (1–5)</label><input type="number" min={1} max={5} value={form.gravidade} onChange={e => setForm(f => ({ ...f, gravidade: e.target.value }))} style={inp} /></div>
              {risco.faixa && <Pill c={risco.score >= 15 ? "#f43f5e" : risco.score >= 8 ? "#fb923c" : risco.score >= 4 ? "#f5b301" : "#34d399"} t={`risco ${risco.faixa} · ${risco.score}`} />}
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text)" }}><input type="checkbox" checked={form.anonimo} onChange={e => setForm(f => ({ ...f, anonimo: e.target.checked }))} /> Notificar anonimamente</label>
              {exigeRCA(form) && <Pill c="#fb923c" t="Exige análise de causa raiz" />}
              {notificacaoCompulsoria(form) && <Pill c="#f43f5e" t="Notificação compulsória (ANVISA)" />}
            </div>
            <button onClick={salvar} disabled={busy || !form.classe || !form.descricao.trim()} style={{ background: busy || !form.classe || !form.descricao.trim() ? "#5b76a0" : VX.turquesa, color: "#04222b", border: "none", borderRadius: 6, padding: "9px 18px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>{busy ? "…" : "Registrar notificação"}</button>
          </div>
        ) : <div style={{ ...card, color: "var(--text-muted)" }}>Sem permissão para lançar no módulo.</div>)}

        {sub === "consultar" && (<>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <select value={filtro.classe} onChange={e => setFiltro(f => ({ ...f, classe: e.target.value }))} style={{ ...inp, width: "auto" }}><option value="">Toda classe</option>{NSP_CLASSES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}</select>
            <select value={filtro.tipo} onChange={e => setFiltro(f => ({ ...f, tipo: e.target.value }))} style={{ ...inp, width: "auto" }}><option value="">Todo tipo</option>{NSP_TIPOS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}</select>
            <select value={filtro.status} onChange={e => setFiltro(f => ({ ...f, status: e.target.value }))} style={{ ...inp, width: "auto" }}><option value="">Todo status</option>{NSP_STATUS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}</select>
            <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)", alignSelf: "center" }}>{filtrados.length} incidente(s)</span>
          </div>
          {filtrados.length === 0 ? <div style={{ ...card, color: "var(--text-muted)" }}>Nenhum incidente.</div> :
            filtrados.map(i => (
              <div key={i.id} style={{ ...card, borderLeft: `4px solid ${nspCorClasse(i.classe)}`, marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 800, fontFamily: "JetBrains Mono, monospace", color: "var(--text-muted)" }}>#{i.numero}</span>
                  <Pill c={nspCorClasse(i.classe)} t={rotuloClasse(i.classe)} />
                  {i.tipo && <Pill c="#8891a5" t={rotuloTipo(i.tipo)} />}
                  {i.grau_dano && i.grau_dano !== "nenhum" && <Pill c={nspCorGrau(i.grau_dano)} t={rotuloGrau(i.grau_dano)} />}
                  <Pill c={nspCorStatus(i.status)} t={rotuloStatus(i.status)} />
                  {i.exige_rca && <Pill c="#fb923c" t="RCA" />}
                  {i.notificacao_compulsoria && <Pill c="#f43f5e" t="ANVISA" />}
                  <span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--text-muted)" }}>{dataHora(i.criado_em)}</span>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 6 }}>{i.descricao}</div>
                {(i.local_setor || i.leito || i.prontuario) && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{[i.local_setor, i.leito && `leito ${i.leito}`, i.prontuario && `pront. ${i.prontuario}`].filter(Boolean).join(" · ")}</div>}
              </div>
            ))}
        </>)}

        {sub === "causas" && (<>
          <div style={card}>
            <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 4 }}>Aguardando análise de causa raiz</div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 8 }}>Evento adverso, never event e dano moderado+ exigem RCA (Guia de Análise de Incidentes — ANVISA).</div>
            {filaRca.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Nenhum incidente aguardando análise.</div>
             : filaRca.map(i => (
              <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
                <Pill c="#f43f5e" t={rotuloClasse(i.classe)} />
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>#{i.numero} · {rotuloTipo(i.tipo)}</span>
                <span style={{ fontSize: 12, color: "var(--text-3)", flex: 1, minWidth: 120 }}>{i.descricao}</span>
                {canEdit && <button onClick={() => abrirRca(i)} style={btnMiniP}>Analisar</button>}
              </div>
            ))}
          </div>

          {rcaForm && (
            <div style={{ ...card, borderLeft: "4px solid #f43f5e" }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 10 }}>Análise — #{rcaForm.incidente.numero} · {rotuloTipo(rcaForm.incidente.tipo)}</div>
              <label style={lbl}>Método</label>
              <select value={rcaForm.metodo} onChange={e => setRcaForm(r => ({ ...r, metodo: e.target.value }))} style={{ ...inp, maxWidth: 300, marginBottom: 12 }}>
                {METODOS_RCA.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
              </select>

              {(rcaForm.metodo === "5_porques" || rcaForm.metodo === "ambos") && (
                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>5 Porquês</label>
                  {rcaForm.porques.map((pq, k) => (
                    <input key={k} value={pq} onChange={e => setRcaForm(r => { const a = [...r.porques]; a[k] = e.target.value; return { ...r, porques: a }; })} placeholder={`Por quê ${k + 1}?`} style={{ ...inp, marginBottom: 6 }} />
                  ))}
                </div>
              )}

              {(rcaForm.metodo === "ishikawa" || rcaForm.metodo === "ambos") && (
                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>Ishikawa — causas por categoria (uma por linha)</label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 10 }}>
                    {ISHIKAWA_CATEGORIAS.map(cat => (
                      <div key={cat.v}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: "#818cf8" }}>{cat.l}</div>
                        <textarea value={(rcaForm.ishikawa[cat.v] || []).join("\n")} onChange={e => setRcaForm(r => ({ ...r, ishikawa: { ...r.ishikawa, [cat.v]: e.target.value.split("\n").map(x => x.trim()).filter(Boolean) } }))} rows={2} placeholder={cat.sub} style={{ ...inp, resize: "vertical" }} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <label style={lbl}>Fatores contribuintes (Protocolo de Londres)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {FATORES_CONTRIBUINTES.map(f => { const on = rcaForm.fatores.includes(f.v); return (
                  <span key={f.v} onClick={() => setRcaForm(r => ({ ...r, fatores: on ? r.fatores.filter(x => x !== f.v) : [...r.fatores, f.v] }))} style={chipTgl(on, "#38bdf8")}>{f.l}</span>
                ); })}
              </div>

              <label style={lbl}>Barreiras que falharam ou faltaram (uma por linha)</label>
              <textarea value={rcaForm.barreiras.join("\n")} onChange={e => setRcaForm(r => ({ ...r, barreiras: e.target.value.split("\n").map(x => x.trim()).filter(Boolean) }))} rows={2} style={{ ...inp, resize: "vertical", marginBottom: 12 }} />
              <label style={lbl}>Causa raiz</label>
              <textarea value={rcaForm.causa_raiz} onChange={e => setRcaForm(r => ({ ...r, causa_raiz: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical", marginBottom: 12 }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={salvarRca} disabled={busy || !rcaForm.causa_raiz.trim()} style={btnPrimario(!busy && !!rcaForm.causa_raiz.trim())}>{busy ? "…" : "Concluir análise"}</button>
                <button onClick={() => setRcaForm(null)} style={btnGhost}>Cancelar</button>
              </div>
            </div>
          )}

          {rcas.filter(r => r.status === "concluida").slice(0, 10).map(r => { const inc = incidentes.find(i => i.id === r.incidente_id); return (
            <div key={r.id} style={card}>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>Causa raiz{inc ? ` · #${inc.numero} ${rotuloTipo(inc.tipo)}` : ""}</div>
              <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 4 }}>{r.causa_raiz}</div>
              <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 4 }}>{r.registrado_por || ""} · {dataHora(r.criado_em)}</div>
              {canEdit && <button onClick={() => { setAcaoForm({ incidente_id: r.incidente_id, rca_id: r.id, o_que: "", por_que: r.causa_raiz || "", responsavel: "", prazo: "", onde: "", como: "", quanto: "" }); setSub("plano"); }} style={{ ...btnGhost, marginTop: 8 }}>+ Plano de ação</button>}
            </div>
          ); })}
        </>)}
        {sub === "plano" && (<>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 14 }}>
            <Card label="Ações" valor={planoResumo.total} cor="#22d3ee" />
            <Card label="Abertas" valor={planoResumo.abertas} cor={planoResumo.abertas ? "#f5b301" : "#34d399"} />
            <Card label="Atrasadas" valor={planoResumo.atrasadas} cor={planoResumo.atrasadas ? "#f43f5e" : "#34d399"} sub="passaram do prazo" />
            <Card label="Fechamento" valor={planoResumo.taxaFechamento != null ? planoResumo.taxaFechamento + "%" : "—"} cor="#818cf8" />
          </div>

          {acaoForm && (
            <div style={{ ...card, borderLeft: "4px solid #22d3ee" }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 10 }}>Nova ação (5W2H)</div>
              <label style={lbl}>O quê (a ação)</label>
              <input value={acaoForm.o_que} onChange={e => setAcaoForm(a => ({ ...a, o_que: e.target.value }))} style={{ ...inp, marginBottom: 10 }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div><label style={lbl}>Quem (responsável)</label><input value={acaoForm.responsavel} onChange={e => setAcaoForm(a => ({ ...a, responsavel: e.target.value }))} style={inp} /></div>
                <div><label style={lbl}>Quando (prazo)</label><input type="date" value={acaoForm.prazo} onChange={e => setAcaoForm(a => ({ ...a, prazo: e.target.value }))} style={inp} /></div>
                <div><label style={lbl}>Onde</label><input value={acaoForm.onde} onChange={e => setAcaoForm(a => ({ ...a, onde: e.target.value }))} style={inp} /></div>
                <div><label style={lbl}>Quanto (custo / recurso)</label><input value={acaoForm.quanto} onChange={e => setAcaoForm(a => ({ ...a, quanto: e.target.value }))} style={inp} /></div>
              </div>
              <label style={lbl}>Por quê</label>
              <input value={acaoForm.por_que} onChange={e => setAcaoForm(a => ({ ...a, por_que: e.target.value }))} style={{ ...inp, marginBottom: 10 }} />
              <label style={lbl}>Como</label>
              <textarea value={acaoForm.como} onChange={e => setAcaoForm(a => ({ ...a, como: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical", marginBottom: 12 }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={salvarAcao} disabled={busy || !acaoForm.o_que.trim()} style={btnPrimario(!busy && !!acaoForm.o_que.trim())}>{busy ? "…" : "Adicionar ação"}</button>
                <button onClick={() => setAcaoForm(null)} style={btnGhost}>Cancelar</button>
              </div>
            </div>
          )}

          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800 }}>Plano de ação</div>
              {canEdit && !acaoForm && <button onClick={() => setAcaoForm({ incidente_id: null, o_que: "", por_que: "", responsavel: "", prazo: "", onde: "", como: "", quanto: "" })} style={btnMiniP}>+ Nova ação</button>}
            </div>
            {acoes.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Nenhuma ação registrada. As ações nascem da análise de causa raiz (aba Análise de causas).</div>
             : acoes.map(a => {
              const atras = acaoAtrasada(a);
              const st = STATUS_ACAO.find(s => s.v === (a.status || "pendente"));
              const cor = atras ? "#f43f5e" : ({ verde: "#34d399", amarelo: "#f5b301", laranja: "#fb923c", cinza: "#8891a5" }[st?.nivel] || "#8891a5");
              const inc = incidentes.find(i => i.id === a.incidente_id);
              const aberta = !["concluida", "cancelada"].includes(a.status || "pendente");
              return (
                <div key={a.id} style={{ padding: "9px 0", borderTop: "1px solid var(--border)", boxShadow: atras ? "inset 3px 0 0 #f43f5e" : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Pill c={cor} t={atras ? "ATRASADA" : st?.l} />
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>#{a.numero} · {a.o_que}</span>
                    {inc && <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>inc. #{inc.numero}</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 3 }}>
                    {a.responsavel ? `${a.responsavel} · ` : ""}{a.prazo ? `prazo ${new Date(a.prazo + "T00:00:00").toLocaleDateString("pt-BR")}` : "sem prazo"}
                  </div>
                  {canEdit && aberta && (
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      {(a.status || "pendente") === "pendente" && <button onClick={() => mudarAcao(a, "em_andamento")} style={btnGhostMini}>Iniciar</button>}
                      <button onClick={() => mudarAcao(a, "concluida")} style={{ ...btnGhostMini, color: "#34d399", borderColor: "#34d39966" }}>Concluir</button>
                      <button onClick={() => mudarAcao(a, "cancelada")} style={{ ...btnGhostMini, color: "var(--text-muted)" }}>Cancelar</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>)}
        {sub === "indicadores" && (<>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
            Indicadores puxados automaticamente dos módulos — sem digitação. LPP adquirida vem do marcador POA (Fase 1a); quedas e erro de medicação, dos incidentes; o plano de ação, da Fase 2b.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
            <Card label="LPP adquirida" valor={lppAdq} cor={lppAdq ? "#fb923c" : "#34d399"} sub="POA · Fase 1a" />
            <Card label="Quedas" valor={ind.quedas} cor={ind.quedas ? "#f5b301" : "#34d399"} sub={`${ind.quedasComDano} com dano`} />
            <Card label="Erro de medicação" valor={ind.errosMedicacao} cor={ind.errosMedicacao ? "#f43f5e" : "#34d399"} sub={`${ind.medicacaoTotal} notificações`} />
            <Card label="Near-miss ratio" valor={resumo.nearMissRatio ?? "—"} cor="#818cf8" sub="quase-erros ÷ com dano" />
            <Card label="Ações atrasadas" valor={planoResumo.atrasadas} cor={planoResumo.atrasadas ? "#f43f5e" : "#34d399"} sub="plano da 2b — cobrar" />
            <Card label="Fechamento do plano" valor={planoResumo.taxaFechamento != null ? planoResumo.taxaFechamento + "%" : "—"} cor="#22d3ee" sub="ações concluídas" />
          </div>
          <div style={card}>
            <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 8 }}>Incidentes por tipo</div>
            {Object.keys(resumo.porTipo).length === 0 ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Sem incidentes.</div> :
              Object.entries(resumo.porTipo).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", borderTop: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 12.5, flex: 1 }}>{rotuloTipo(t)}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-3)" }}>{n}</span>
                </div>
              ))}
          </div>
        </>)}
        {sub === "metas" && (<>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
            As <strong>6 Metas Internacionais de Segurança do Paciente</strong> (OMS/JCI) com farol contra o alvo. As automáticas saem dos módulos; higiene das mãos, comunicação e cirurgia segura vêm da auditoria periódica. Alvos editáveis pelo ADM Master (nascem "em validação").
          </div>
          {medForm && (() => {
            const pv = Number(medForm.denominador) > 0 ? Math.round((Number(medForm.numerador) / Number(medForm.denominador)) * 100) : null;
            const pfx = faixasMeta.find(f => f.chave === medForm.meta);
            const pf = farol(pv, { corte_verde: pfx?.corte_verde, corte_amarelo: pfx?.corte_amarelo, sentido: pfx?.sentido || "maior_melhor" });
            return (
              <div style={card}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Registrar auditoria — {(metas.find(x => x.meta === medForm.meta) || {}).label}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10 }}>
                  <div><label style={lbl}>Competência</label><input type="month" value={medForm.competencia ? medForm.competencia.slice(0, 7) : ""} onChange={e => setMedForm(p => ({ ...p, competencia: e.target.value ? e.target.value + "-01" : "" }))} style={inp} /></div>
                  <div><label style={lbl}>Com adesão (numerador)</label><input type="number" min="0" value={medForm.numerador} onChange={e => setMedForm(p => ({ ...p, numerador: e.target.value }))} style={inp} /></div>
                  <div><label style={lbl}>Observados (denominador)</label><input type="number" min="0" value={medForm.denominador} onChange={e => setMedForm(p => ({ ...p, denominador: e.target.value }))} style={inp} /></div>
                  <div style={{ alignSelf: "end", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: farolCor[pf] }}>{pv == null ? "—" : pv + "%"}</span>
                    <Pill c={farolCor[pf]} t={farolTxt[pf]} />
                  </div>
                </div>
                <div style={{ marginTop: 8 }}><label style={lbl}>Observação</label><input value={medForm.observacao || ""} onChange={e => setMedForm(p => ({ ...p, observacao: e.target.value }))} style={inp} placeholder="opcional" /></div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button onClick={salvarMedicao} disabled={busy || !medForm.competencia || !(Number(medForm.denominador) > 0)} style={btnPrimario(!busy && !!medForm.competencia && Number(medForm.denominador) > 0)}>Salvar medição</button>
                  <button onClick={() => setMedForm(null)} style={btnGhost}>Cancelar</button>
                </div>
              </div>
            );
          })()}
          <div style={{ display: "grid", gap: 10 }}>
            {metas.map((m, i) => {
              const fx = faixasMeta.find(f => f.chave === m.meta);
              const editando = metaEdit && metaEdit.chave === m.meta;
              return (
                <div key={m.meta} style={card}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ width: 20, height: 20, borderRadius: 999, background: farolCor[m.farol], flexShrink: 0, boxShadow: `0 0 0 3px ${farolCor[m.farol]}22` }} />
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{i + 1}. {m.label}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                        {m.fonte === "auto" ? "Automática — dos módulos" : "Auditoria periódica"}{m.competencia ? ` · ${m.competencia.slice(0, 7)}` : ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", minWidth: 60 }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: farolCor[m.farol] }}>{m.valor == null ? "—" : m.valor}{m.valor != null && m.unidade === "%" ? "%" : ""}</div>
                      <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{m.unidade === "%" ? "adesão" : m.unidade}</div>
                    </div>
                    <Pill c={farolCor[m.farol]} t={farolTxt[m.farol]} />
                    {!m.validado && <Pill c="#f5b301" t="em validação" />}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                      Alvo: {m.sentido === "maior_melhor" ? "≥" : "≤"} {m.alvo?.corte_verde ?? "—"} verde · {m.sentido === "maior_melhor" ? "≥" : "≤"} {m.alvo?.corte_amarelo ?? "—"} amarelo
                    </span>
                    {m.fonte === "auditoria" && canEdit && <button onClick={() => setMedForm({ meta: m.meta, competencia: "", numerador: "", denominador: "", observacao: "" })} style={{ ...btnGhostMini, marginLeft: "auto" }}>+ Registrar auditoria</button>}
                    {currentUser?.role === "adm_master" && !editando && <button onClick={() => setMetaEdit(fx ? { ...fx } : { chave: m.meta, rotulo: m.label, sentido: m.sentido, fonte: m.fonte, unidade: m.unidade, corte_verde: m.alvo?.corte_verde ?? null, corte_amarelo: m.alvo?.corte_amarelo ?? null, ativo: true, validado: false })} style={{ ...btnGhostMini, marginLeft: m.fonte === "auditoria" && canEdit ? 0 : "auto" }}>Editar alvo</button>}
                  </div>
                  {editando && (
                    <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10, alignItems: "end" }}>
                      <div><label style={lbl}>Corte verde</label><input type="number" value={metaEdit.corte_verde ?? ""} onChange={e => setMetaEdit(p => ({ ...p, corte_verde: e.target.value === "" ? null : Number(e.target.value) }))} style={inp} /></div>
                      <div><label style={lbl}>Corte amarelo</label><input type="number" value={metaEdit.corte_amarelo ?? ""} onChange={e => setMetaEdit(p => ({ ...p, corte_amarelo: e.target.value === "" ? null : Number(e.target.value) }))} style={inp} /></div>
                      <div><label style={lbl}>Sentido</label>
                        <select value={metaEdit.sentido || "menor_melhor"} onChange={e => setMetaEdit(p => ({ ...p, sentido: e.target.value }))} style={inp}>
                          <option value="menor_melhor">Menor é melhor</option>
                          <option value="maior_melhor">Maior é melhor</option>
                        </select>
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-3)", whiteSpace: "nowrap" }}>
                        <input type="checkbox" checked={!!metaEdit.validado} onChange={e => setMetaEdit(p => ({ ...p, validado: e.target.checked }))} /> Validado
                      </label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={async () => { await salvarFaixaMeta(metaEdit); setMetaEdit(null); }} disabled={busy} style={btnPrimario(!busy)}>Salvar</button>
                        <button onClick={() => setMetaEdit(null)} style={btnGhost}>Cancelar</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>)}
        {sub === "protocolos" && (<>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
            Os protocolos básicos de segurança do paciente (PNSP), ligados às 6 Metas. Cada um tem versão, responsável e data de revisão — o núcleo cobra a revisão vencida.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
            <Card label="Protocolos" valor={protoResumo.total} cor="#22d3ee" />
            <Card label="Vigentes" valor={protoResumo.vigentes} cor={protoResumo.vigentes ? "#34d399" : "var(--text)"} />
            <Card label="Em revisão" valor={protoResumo.emRevisao} cor={protoResumo.emRevisao ? "#f5b301" : "#34d399"} />
            <Card label="Revisão vencida" valor={protoResumo.revisaoVencida} cor={protoResumo.revisaoVencida ? "#f43f5e" : "#34d399"} sub="cobrar atualização" />
          </div>
          {protoResumo.basicosFaltando.length > 0 && (
            <div style={{ ...card, borderLeft: "3px solid #fb923c" }}>
              <span style={{ fontSize: 12.5, color: "var(--text-3)" }}>Faltam cadastrar: <strong>{protoResumo.basicosFaltando.join(" · ")}</strong></span>
            </div>
          )}
          {canEdit && !protoForm && <button onClick={() => setProtoForm({ titulo: "", meta: "", versao: "1.0", responsavel: "", revisao_em: "", status: "em_revisao", conteudo: "", referencia: "", validado: false })} style={{ ...btnPrimario(true), marginBottom: 14 }}>+ Novo protocolo</button>}

          {protoForm && (
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>{protoForm.id ? "Editar protocolo" : "Novo protocolo"}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
                <div style={{ gridColumn: "1 / -1" }}><label style={lbl}>Título *</label><input value={protoForm.titulo} onChange={e => setProtoForm(p => ({ ...p, titulo: e.target.value }))} style={inp} autoFocus /></div>
                <div><label style={lbl}>Meta vinculada</label>
                  <select value={protoForm.meta || ""} onChange={e => setProtoForm(p => ({ ...p, meta: e.target.value }))} style={inp}>
                    <option value="">— nenhuma —</option>
                    {NSP_METAS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                  </select>
                </div>
                <div><label style={lbl}>Versão</label><input value={protoForm.versao || ""} onChange={e => setProtoForm(p => ({ ...p, versao: e.target.value }))} style={inp} /></div>
                <div><label style={lbl}>Responsável</label><input value={protoForm.responsavel || ""} onChange={e => setProtoForm(p => ({ ...p, responsavel: e.target.value }))} style={inp} /></div>
                <div><label style={lbl}>Próxima revisão</label><input type="date" value={protoForm.revisao_em || ""} onChange={e => setProtoForm(p => ({ ...p, revisao_em: e.target.value }))} style={inp} /></div>
                <div><label style={lbl}>Status</label>
                  <select value={protoForm.status || "em_revisao"} onChange={e => setProtoForm(p => ({ ...p, status: e.target.value }))} style={inp}>
                    {STATUS_PROTOCOLO.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginTop: 10 }}><label style={lbl}>Conteúdo / passos</label><textarea value={protoForm.conteudo || ""} onChange={e => setProtoForm(p => ({ ...p, conteudo: e.target.value }))} rows={5} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} placeholder={"1. …\n2. …"} /></div>
              <div style={{ marginTop: 10 }}><label style={lbl}>Referência / fonte</label><input value={protoForm.referencia || ""} onChange={e => setProtoForm(p => ({ ...p, referencia: e.target.value }))} style={inp} placeholder="Diretriz, ano, sociedade…" /></div>
              {currentUser?.role === "adm_master" && <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-3)", marginTop: 10 }}><input type="checkbox" checked={!!protoForm.validado} onChange={e => setProtoForm(p => ({ ...p, validado: e.target.checked }))} /> Validado (sai de "em validação")</label>}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={salvarProto} disabled={busy || !(protoForm.titulo || "").trim()} style={btnPrimario(!busy && !!(protoForm.titulo || "").trim())}>Salvar</button>
                <button onClick={() => setProtoForm(null)} style={btnGhost}>Cancelar</button>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gap: 10 }}>
            {protocolos.filter(p => p.ativo !== false).length === 0 ? <div style={{ ...card, color: "var(--text-muted)", fontSize: 12.5 }}>Nenhum protocolo cadastrado ainda.</div> :
              protocolos.filter(p => p.ativo !== false).map(p => {
                const vencida = protocoloRevisaoVencida(p);
                const st = STATUS_PROTOCOLO.find(s => s.v === (p.status || "em_revisao")) || {};
                const metaL = (NSP_METAS.find(m => m.v === p.meta) || {}).l;
                return (
                  <div key={p.id} style={card}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{p.titulo}{p.versao ? <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: 12 }}> · v{p.versao}</span> : null}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>{metaL ? `Meta: ${metaL}` : "Sem meta vinculada"}{p.responsavel ? ` · Resp.: ${p.responsavel}` : ""}</div>
                      </div>
                      <Pill c={NSP_COR[st.nivel] || "#8891a5"} t={st.l || p.status} />
                      {!p.validado && <Pill c="#f5b301" t="em validação" />}
                      {canEdit && <button onClick={() => setProtoForm({ ...p })} style={btnGhostMini}>Editar</button>}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11.5, color: vencida ? "#f43f5e" : "var(--text-3)", fontWeight: vencida ? 700 : 400 }}>
                      {p.revisao_em ? (vencida ? `⚠ Revisão vencida em ${new Date(p.revisao_em).toLocaleDateString("pt-BR")}` : `Próxima revisão: ${new Date(p.revisao_em).toLocaleDateString("pt-BR")}`) : "Sem data de revisão definida"}
                    </div>
                    {p.conteudo && <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-3)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{p.conteudo}</div>}
                  </div>
                );
              })}
          </div>
        </>)}
        {sub === "capacitacoes" && (<>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
            Educação permanente em segurança do paciente. Registre os treinamentos e vincule à Meta — o núcleo mostra a cobertura e cobra a recorrência vencida.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 14 }}>
            <Card label="Capacitações" valor={capResumo.total} cor="#22d3ee" sub={`${capResumo.realizadas} realizadas`} />
            <Card label="Horas realizadas" valor={capResumo.horas} cor="#818cf8" />
            <Card label="Participantes" valor={capResumo.participantes} cor="#34d399" />
            <Card label="Recorrência vencida" valor={capResumo.vencidas} cor={capResumo.vencidas ? "#f43f5e" : "#34d399"} sub="repetir treinamento" />
          </div>
          {capResumo.metasSemCapacitacao.length > 0 && (
            <div style={{ ...card, borderLeft: "3px solid #fb923c" }}>
              <span style={{ fontSize: 12.5, color: "var(--text-3)" }}>Metas sem capacitação realizada: <strong>{capResumo.metasSemCapacitacao.join(" · ")}</strong></span>
            </div>
          )}
          {canEdit && !capForm && <button onClick={() => setCapForm({ tema: "", meta: "", data: "", carga_horaria: "", facilitador: "", publico_alvo: "", participantes: "", status: "planejado", proxima_em: "", observacao: "" })} style={{ ...btnPrimario(true), marginBottom: 14 }}>+ Nova capacitação</button>}

          {capForm && (
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>{capForm.id ? "Editar capacitação" : "Nova capacitação"}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
                <div style={{ gridColumn: "1 / -1" }}><label style={lbl}>Tema *</label><input value={capForm.tema} onChange={e => setCapForm(p => ({ ...p, tema: e.target.value }))} style={inp} autoFocus /></div>
                <div><label style={lbl}>Meta vinculada</label>
                  <select value={capForm.meta || ""} onChange={e => setCapForm(p => ({ ...p, meta: e.target.value }))} style={inp}>
                    <option value="">— nenhuma —</option>
                    {NSP_METAS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                  </select>
                </div>
                <div><label style={lbl}>Data</label><input type="date" value={capForm.data || ""} onChange={e => setCapForm(p => ({ ...p, data: e.target.value }))} style={inp} /></div>
                <div><label style={lbl}>Carga horária (h)</label><input type="number" min="0" step="0.5" value={capForm.carga_horaria} onChange={e => setCapForm(p => ({ ...p, carga_horaria: e.target.value }))} style={inp} /></div>
                <div><label style={lbl}>Facilitador</label><input value={capForm.facilitador || ""} onChange={e => setCapForm(p => ({ ...p, facilitador: e.target.value }))} style={inp} /></div>
                <div><label style={lbl}>Público-alvo</label><input value={capForm.publico_alvo || ""} onChange={e => setCapForm(p => ({ ...p, publico_alvo: e.target.value }))} style={inp} placeholder="Ex.: enfermagem" /></div>
                <div><label style={lbl}>Participantes</label><input type="number" min="0" value={capForm.participantes} onChange={e => setCapForm(p => ({ ...p, participantes: e.target.value }))} style={inp} /></div>
                <div><label style={lbl}>Status</label>
                  <select value={capForm.status || "planejado"} onChange={e => setCapForm(p => ({ ...p, status: e.target.value }))} style={inp}>
                    {STATUS_CAPACITACAO.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                  </select>
                </div>
                <div><label style={lbl}>Próxima prevista</label><input type="date" value={capForm.proxima_em || ""} onChange={e => setCapForm(p => ({ ...p, proxima_em: e.target.value }))} style={inp} /></div>
              </div>
              <div style={{ marginTop: 10 }}><label style={lbl}>Observação</label><input value={capForm.observacao || ""} onChange={e => setCapForm(p => ({ ...p, observacao: e.target.value }))} style={inp} /></div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={salvarCap} disabled={busy || !(capForm.tema || "").trim()} style={btnPrimario(!busy && !!(capForm.tema || "").trim())}>Salvar</button>
                <button onClick={() => setCapForm(null)} style={btnGhost}>Cancelar</button>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gap: 10 }}>
            {capacitacoes.filter(c => c.ativo !== false).length === 0 ? <div style={{ ...card, color: "var(--text-muted)", fontSize: 12.5 }}>Nenhuma capacitação registrada ainda.</div> :
              capacitacoes.filter(c => c.ativo !== false).map(c => {
                const vencida = capacitacaoVencida(c);
                const st = STATUS_CAPACITACAO.find(s => s.v === (c.status || "planejado")) || {};
                const metaL = (NSP_METAS.find(m => m.v === c.meta) || {}).l;
                return (
                  <div key={c.id} style={card}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{c.tema}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>
                          {c.data ? new Date(c.data).toLocaleDateString("pt-BR") : "sem data"}{c.carga_horaria ? ` · ${c.carga_horaria}h` : ""}{c.participantes ? ` · ${c.participantes} particip.` : ""}{metaL ? ` · ${metaL}` : ""}
                        </div>
                      </div>
                      <Pill c={NSP_COR[st.nivel] || "#8891a5"} t={st.l || c.status} />
                      {canEdit && <button onClick={() => setCapForm({ ...c })} style={btnGhostMini}>Editar</button>}
                    </div>
                    {(c.facilitador || c.publico_alvo) && <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--text-3)" }}>{c.facilitador ? `Facilitador: ${c.facilitador}` : ""}{c.facilitador && c.publico_alvo ? " · " : ""}{c.publico_alvo ? `Público: ${c.publico_alvo}` : ""}</div>}
                    {c.proxima_em && <div style={{ marginTop: 6, fontSize: 11.5, color: vencida ? "#f43f5e" : "var(--text-3)", fontWeight: vencida ? 700 : 400 }}>{vencida ? `⚠ Recorrência vencida em ${new Date(c.proxima_em).toLocaleDateString("pt-BR")}` : `Próxima prevista: ${new Date(c.proxima_em).toLocaleDateString("pt-BR")}`}</div>}
                    {c.observacao && <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-3)", lineHeight: 1.5 }}>{c.observacao}</div>}
                  </div>
                );
              })}
          </div>
        </>)}
        {sub === "comunicacao" && (<>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
            Mural de comunicados do NSP para a equipe: alertas de segurança, lições aprendidas (que podem nascer de um incidente) e informativos.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 14 }}>
            <Card label="Comunicados" valor={comResumo.total} cor="#22d3ee" sub={`${comResumo.ativos} ativos`} />
            <Card label="Alertas ativos" valor={comResumo.alertasAtivos} cor={comResumo.alertasAtivos ? "#f43f5e" : "#34d399"} />
            <Card label="Lições aprendidas" valor={comResumo.licoes} cor="#38bdf8" />
          </div>
          {canEdit && !comForm && <button onClick={() => setComForm({ titulo: "", tipo: "informativo", prioridade: "media", conteudo: "", publico_alvo: "", data: "", incidente_id: "", status: "ativo" })} style={{ ...btnPrimario(true), marginBottom: 14 }}>+ Novo comunicado</button>}

          {comForm && (
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>{comForm.id ? "Editar comunicado" : "Novo comunicado"}</div>
              <div style={{ marginBottom: 10 }}><label style={lbl}>Título *</label><input value={comForm.titulo} onChange={e => setComForm(p => ({ ...p, titulo: e.target.value }))} style={inp} autoFocus /></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
                <div><label style={lbl}>Tipo</label>
                  <select value={comForm.tipo || "informativo"} onChange={e => setComForm(p => ({ ...p, tipo: e.target.value }))} style={inp}>
                    {TIPO_COMUNICADO.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                  </select>
                </div>
                <div><label style={lbl}>Prioridade</label>
                  <select value={comForm.prioridade || "media"} onChange={e => setComForm(p => ({ ...p, prioridade: e.target.value }))} style={inp}>
                    {PRIORIDADE_COMUNICADO.map(pr => <option key={pr.v} value={pr.v}>{pr.l}</option>)}
                  </select>
                </div>
                <div><label style={lbl}>Data</label><input type="date" value={comForm.data || ""} onChange={e => setComForm(p => ({ ...p, data: e.target.value }))} style={inp} /></div>
                <div><label style={lbl}>Público-alvo</label><input value={comForm.publico_alvo || ""} onChange={e => setComForm(p => ({ ...p, publico_alvo: e.target.value }))} style={inp} placeholder="Ex.: toda a equipe" /></div>
                <div><label style={lbl}>Status</label>
                  <select value={comForm.status || "ativo"} onChange={e => setComForm(p => ({ ...p, status: e.target.value }))} style={inp}>
                    <option value="ativo">Ativo</option>
                    <option value="arquivado">Arquivado</option>
                  </select>
                </div>
                <div style={{ gridColumn: "1 / -1" }}><label style={lbl}>Incidente de origem (opcional)</label>
                  <select value={comForm.incidente_id || ""} onChange={e => setComForm(p => ({ ...p, incidente_id: e.target.value }))} style={inp}>
                    <option value="">— nenhum —</option>
                    {incidentes.slice(0, 50).map(inc => <option key={inc.id} value={inc.id}>{rotuloTipo(inc.tipo)} — {(inc.descricao || "").slice(0, 40)}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginTop: 10 }}><label style={lbl}>Conteúdo</label><textarea value={comForm.conteudo || ""} onChange={e => setComForm(p => ({ ...p, conteudo: e.target.value }))} rows={4} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} /></div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={salvarCom} disabled={busy || !(comForm.titulo || "").trim()} style={btnPrimario(!busy && !!(comForm.titulo || "").trim())}>Publicar</button>
                <button onClick={() => setComForm(null)} style={btnGhost}>Cancelar</button>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gap: 10 }}>
            {comunicados.filter(c => c.ativo !== false).length === 0 ? <div style={{ ...card, color: "var(--text-muted)", fontSize: 12.5 }}>Nenhum comunicado publicado ainda.</div> :
              comunicados.filter(c => c.ativo !== false).map(c => {
                const tp = TIPO_COMUNICADO.find(t => t.v === c.tipo) || {};
                const pr = PRIORIDADE_COMUNICADO.find(x => x.v === c.prioridade) || {};
                const arquivado = (c.status || "ativo") === "arquivado";
                return (
                  <div key={c.id} style={{ ...card, opacity: arquivado ? 0.6 : 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <Pill c={NSP_COR[tp.nivel] || "#8891a5"} t={tp.l || c.tipo} />
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{c.titulo}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>{c.data ? new Date(c.data).toLocaleDateString("pt-BR") : (c.criado_em ? new Date(c.criado_em).toLocaleDateString("pt-BR") : "")}{c.publico_alvo ? ` · ${c.publico_alvo}` : ""}{c.autor ? ` · ${c.autor}` : ""}</div>
                      </div>
                      <Pill c={NSP_COR[pr.nivel] || "#8891a5"} t={`prior.: ${pr.l || c.prioridade}`} />
                      {arquivado && <Pill c="#8891a5" t="arquivado" />}
                      {canEdit && <button onClick={() => setComForm({ ...c })} style={btnGhostMini}>Editar</button>}
                    </div>
                    {c.conteudo && <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-3)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{c.conteudo}</div>}
                  </div>
                );
              })}
          </div>
        </>)}
        {sub === "relatorios"   && <NspRelatorioView incidentes={incidentes} acoes={acoes} lppAdq={lppAdq} medicoes={medicoes} faixas={faixasMeta} />}
        {sub === "assistente"   && <NspAssistenteView incidentes={incidentes} acoes={acoes} rcas={rcas} faixas={faixasMeta} medicoes={medicoes} lppAdquiridas={lppAdq} protocolos={protocolos} capacitacoes={capacitacoes} comunicados={comunicados} />}
      </div>
    </div>
  );
}


// Notificação em 30s de qualquer tela (diferencial). Botão flutuante global,
// disponível a todo usuário logado — cultura justa, não-punitiva, com anonimato.
export function NotificacaoRapida({ sb, currentUser }) {
  const [aberto, setAberto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [f, setF] = useState({ classe: "near_miss", tipo: "", descricao: "", anonimo: false });
  if (!sb) return null;
  async function enviar() {
    if (busy || !f.descricao.trim()) return;
    setBusy(true);
    await registrarIncidente(sb, { ...f, origem_tipo: "rapida" }, currentUser);
    setBusy(false); setOk(true);
    setTimeout(() => { setOk(false); setAberto(false); setF({ classe: "near_miss", tipo: "", descricao: "", anonimo: false }); }, 1800);
  }
  const campo = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontSize: 13, width: "100%", boxSizing: "border-box" };
  return (<>
    <button onClick={() => setAberto(true)} title="Notificar incidente de segurança (30s)" style={{ position: "fixed", right: 20, bottom: 20, zIndex: 250, background: "#f43f5e", color: "#fff", border: "none", borderRadius: 999, padding: "11px 17px", fontWeight: 800, fontSize: 12.5, cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,.3)", display: "flex", alignItems: "center", gap: 7 }}>
      <Icon name="shield" size={15} />Notificar
    </button>
    {aberto && (
      <div onClick={() => setAberto(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 16 }}>
        <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.3rem", width: 480, maxWidth: "96vw" }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Notificar incidente de segurança</div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 14 }}>Cultura justa, sem punição. Vale para quase-erros também — notificar antes do dano é o que salva.</div>
          {ok ? <div style={{ padding: "1.5rem", textAlign: "center", color: "#34d399", fontWeight: 700 }}>Notificação registrada. Obrigado.</div> : (<>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              {NSP_CLASSES.slice(0, 4).map(c => <button key={c.v} onClick={() => setF(x => ({ ...x, classe: c.v }))} style={{ background: f.classe === c.v ? nspCorClasse(c.v) + "33" : "transparent", color: f.classe === c.v ? nspCorClasse(c.v) : "var(--text-3)", border: `1px solid ${f.classe === c.v ? nspCorClasse(c.v) : "var(--border)"}`, borderRadius: 7, padding: "5px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>{c.l}</button>)}
            </div>
            <select value={f.tipo} onChange={e => setF(x => ({ ...x, tipo: e.target.value }))} style={{ ...campo, marginBottom: 10 }}><option value="">Tipo (opcional)</option>{NSP_TIPOS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}</select>
            <textarea value={f.descricao} onChange={e => setF(x => ({ ...x, descricao: e.target.value }))} rows={3} placeholder="O que aconteceu?" style={{ ...campo, resize: "vertical", marginBottom: 10 }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text)" }}><input type="checkbox" checked={f.anonimo} onChange={e => setF(x => ({ ...x, anonimo: e.target.checked }))} /> Anônimo</label>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setAberto(false)} style={{ background: "transparent", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
                <button onClick={enviar} disabled={busy || !f.descricao.trim()} style={{ background: busy || !f.descricao.trim() ? "#5b76a0" : "#f43f5e", color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 800, fontSize: 13, cursor: busy || !f.descricao.trim() ? "default" : "pointer" }}>{busy ? "…" : "Notificar"}</button>
              </div>
            </div>
          </>)}
        </div>
      </div>
    )}
  </>);
}

