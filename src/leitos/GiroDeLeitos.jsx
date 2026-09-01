// ═══════════════════════════════════════════════════════════
// GIRO DE LEITOS — A TELA
//
// Saiu do App.jsx: 1.107 linhas próprias e 856 exclusivas, espalhadas por
// QUATRO regiões distantes do arquivo (as tabelas e o menu na 1.707, os
// modais na 3.155, os painéis na 10.346, a página na 11.289).
//
// As regras puras continuam em ../clinico/leitos.js, ../clinico/mapa-risco.js
// e ../clinico/sae.js; o acesso ao banco de leitos e setores em ./dados.js.
//
// 🔴 O ACESSO AO BANCO SAIU ANTES, E SEPARADO — de propósito.
// O módulo de Segurança do Paciente era dono das tabelas dele, e tela e
// dados saíram juntos. Aqui não: `leitos` é lido por quatro telas e
// `setores` por seis. Se os dados morassem aqui dentro, o Pronto-Socorro
// importaria a tela do Giro de Leitos para ler uma lista de setores.
//
// ⚠️ O `sb` chega por prop e desce para ./dados.js e para as cargas de
// enfermagem e de CID que ficaram aqui (são só desta tela). Nulo = offline.
//
// ⚠️ A trilha de auditoria vem de ../auditoria/dados.js, com o mesmo `sb`.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import { AvisoLeitura, VX, HOSPITAL_NOME, HOSPITAL_SIGLA, MONTHS_FULL, MONTHS, Icon, btnContorno, VxWordmark, customTooltip } from "../ui/base.jsx";
import { comGrupos } from "../ui/sub-nav.js";
import { todayStr, nowISO, diffMin, fmtDur, horaFmt, isoToLocal, localToIso } from "../util/datas.js";
import { FARM_GRAV, normTxt } from "../clinico/alertas.js";
import { ISOLAMENTOS, precaucaoDe } from "../clinico/isolamento.js";
import { sugerirCid, calcAlta, sinalLeito, corEsperaFila } from "../clinico/leitos.js";
import { montarMapaRisco } from "../clinico/mapa-risco.js";
import { montarChecagemSae } from "../clinico/sae.js";
import { farol } from "../clinico/nsp.js";
import { abrirEpisodio, encerrarEpisodio } from "../prontuario/dados.js";
import { podeAbrirEpisodio, dadosDoEpisodio, desfechoDoLeito, avisoEpisodioNaoAberto } from "../prontuario/internacao.js";
import { registrarAuditoria } from "../auditoria/dados.js";
import { listaLida } from "../util/leitura.js";
import { loadLeitos, saveLeitos, loadLeitosFromSupabase, upsertLeitoRemote, deleteLeitoRemote,
         loadSetoresLocal, saveSetoresLocal, loadSetoresFromSupabase, upsertSetorRemote, deleteSetorRemote,
         loadSolicitacoes, updateSolicitacaoRemote,
         registrarSaidaRemote, loadSaidas, registrarTurnoverRemote, loadTurnover } from "./dados.js";

// ═══════════════════════════════════════════════════════════
// GIRO DE LEITOS
// ═══════════════════════════════════════════════════════════
// Escalas + LPP ativas dos leitos ocupados, para o mapa de risco de enfermagem.
async function loadRiscoEnfermagem(sb, prontuarios) {
  if (!sb || !prontuarios.length) return { escalas: [], lpp: [] };
  const lista = prontuarios.map(encodeURIComponent).join(",");
  const [escalas, lpp] = await Promise.all([
    sb(`enf_escalas?prontuario=in.(${lista})&select=*&order=aferido_em.desc`),
    sb(`enf_lesao_pressao?prontuario=in.(${lista})&status=eq.ativa&select=*`),
  ]);
  return { escalas: listaLida(escalas), lpp: listaLida(lpp) };
}
// Fila de trabalho da checagem SAE: prescrições de enfermagem, itens e checagens
// de HOJE dos leitos ocupados. O agregador puro monta a lista por leito.
async function loadChecagemSae(sb, prontuarios) {
  if (!sb || !prontuarios.length) return { prescricoes: [], itens: [], checagens: [] };
  const lista = prontuarios.map(encodeURIComponent).join(",");
  const d = new Date();
  const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const [prescricoes, itens, checagens] = await Promise.all([
    sb(`enf_sae_prescricoes?prontuario=in.(${lista})&select=*&order=criado_em.desc`),
    sb(`enf_sae_prescricao_itens?prontuario=in.(${lista})&select=*`),
    sb(`enf_sae_checagem?prontuario=in.(${lista})&competencia=eq.${hoje}&select=*`),
  ]);
  // 🔴 Mesmo atalho que escondia as listas do prontuário do censo.
  const A = listaLida;
  return { prescricoes: A(prescricoes), itens: A(itens), checagens: A(checagens) };
}


// ── Referências de CID (tempo estimado de internação por diagnóstico) ──
const CIDREF_KEY = "hnsn_cidref_v1";
const loadCidRefLocal = () => { try { return JSON.parse(localStorage.getItem(CIDREF_KEY) || "[]"); } catch { return []; } };
const saveCidRefLocal = arr => localStorage.setItem(CIDREF_KEY, JSON.stringify(arr));
async function loadCidRefFromSupabase(sb) {
  const rows = await sb("cid_referencia?select=*");
  return Array.isArray(rows) ? rows : null;
}
async function upsertCidRefRemote(sb, ref, user) {
  if (!sb) return;
  await sb("cid_referencia?on_conflict=cid", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ ...ref, usuario: user?.name || null }),
  });
}
async function deleteCidRefRemote(sb, cid) {
  if (!sb) return;
  await sb(`cid_referencia?cid=eq.${encodeURIComponent(cid)}`, { method: "DELETE" });
}
// Acha a referência para um CID digitado: código exato → prefixo → descrição
// ── Fase 2: histórico de turnover + utilidades de tempo ──
const STATUS_LEITO = {
  livre:        { label: "Livre",             cor: "#34d399", bg: "#0a3d2a" },
  ocupado:      { label: "Ocupado",           cor: "#22d3ee", bg: "#0e2f3d" },
  higienizacao: { label: "Em higienização",   cor: "#fbbf24", bg: "#3d2e06" },
  reservado:    { label: "Reservado",         cor: "#818cf8", bg: "#1e2140" },
  manutencao:   { label: "Manutenção",        cor: "#f97316", bg: "#3d1c06" },
  bloqueado:    { label: "Bloqueado externo", cor: "#8d99ab", bg: "#1c2431" },
  interditado:  { label: "Interditado",       cor: "#fb7185", bg: "#3d0f18" },
};
// Status que tiram o leito da conta de "operacional" (não entram no denominador da ocupação)
const LEITO_FORA_OPERACAO = ["interditado", "manutencao", "bloqueado"];
// Desfechos de saída do leito
const DESFECHO_LEITO = {
  alta:          { label: "Alta",                 cor: "#34d399" },
  obito:         { label: "Óbito",                cor: "#f43f5e" },
  transferencia: { label: "Transferência ext.",   cor: "#38bdf8" },
};
// Kanban de alta (alta segura): itens que podem travar a alta do paciente
const ALTA_ITENS = [
  { key: "clinica",    label: "Liberação clínica" },
  { key: "exame",      label: "Exames/resultados" },
  { key: "receita",    label: "Receita de alta" },
  { key: "sumario",    label: "Sumário de alta" },
  { key: "familia",    label: "Família avisada" },
  { key: "transporte", label: "Transporte" },
  { key: "social",     label: "Serviço social" },
];
const ALTA_PERIODOS = { manha: "Manhã", tarde: "Tarde", noite: "Noite" };
// Motivo pelo qual o paciente aguarda leito (categoria de gargalo)
const MOTIVO_ESPERA = {
  sem_vaga:              { label: "Sem vaga no setor",     cor: "#f43f5e" },
  aguardando_limpeza:    { label: "Aguardando limpeza",    cor: "#fbbf24" },
  aguardando_exame:      { label: "Aguardando exame",      cor: "#3b82f6" },
  aguardando_familia:    { label: "Aguardando família",    cor: "#818cf8" },
  aguardando_transporte: { label: "Aguardando transporte", cor: "#0d9488" },
  regulacao:             { label: "Regulação/vaga zero",   cor: "#d97706" },
  outro:                 { label: "Outro",                 cor: "#8d99ab" },
};
// Ordem corporativa fixa dos setores no mapa de leitos (fora dela → alfabético; "Sem setor" por último)
const LEITOS_SETOR_ORDEM = ["emergencia", "avc", "posto 1", "posto 2", "posto 3", "psiquiatria", "uti"];
const ordSetor = nome => { const n = normTxt(nome); const i = LEITOS_SETOR_ORDEM.findIndex(o => n === o || n.startsWith(o)); return i === -1 ? 500 : i; };
// Barra lateral interna do Giro de Leitos (padrão da Farmácia)
// Ordenado pelo FLUXO do leito: entra, é cuidado, sai — e só depois o
// histórico. Dois itens estavam fora de lugar: "Alertas" (alta vencida,
// limpeza demorada, ocupação alta) era o 12º, DEPOIS dos indicadores, e
// alerta é para agir, não para consultar; e os dois HISTÓRICOS (altas e
// internações) ficavam no meio do fluxo operacional, entre a alta segura e
// os indicadores.
const LEITOS_NAV = [
  { key: "dashboard",      label: "Dashboard",            icon: "dashboard" },
  { key: "alertas",        label: "Alertas do setor",     icon: "shield" },

  { key: "mapa",           label: "Mapa de leitos",       icon: "bed",  grupo: "Ocupação" },
  { key: "fila",           label: "Fila de internação",   icon: "list", grupo: "Ocupação" },
  { key: "pacientes",      label: "Pacientes",            icon: "users", grupo: "Ocupação" },

  { key: "risco",          label: "Mapa de risco",        icon: "shield",    grupo: "Cuidado" },
  { key: "checagem-sae",   label: "Checagem SAE",         icon: "clipboard", grupo: "Cuidado" },

  { key: "kanban",         label: "Alta segura",          icon: "clipboard", grupo: "Saída" },
  { key: "transferencias", label: "Transferências ext.",  icon: "upload",    grupo: "Saída" },

  { key: "altas",          label: "Altas",                icon: "record",    grupo: "Histórico" },
  { key: "internacoes",    label: "Internações",          icon: "clipboard", grupo: "Histórico" },

  { key: "indicadores",    label: "Indicadores",          icon: "chart", grupo: "Acompanhar" },
  { key: "assistente",     label: "IA Assistente",        icon: "chat",  grupo: "Acompanhar" },
];

// Modal de internação / edição de paciente no leito
function InternarModal({ leito, onClose, onSave, refs = [], realPorCid = {} }) {
  const [f, setF] = useState({
    iniciais: leito.iniciais || "", prontuario: leito.prontuario || "", motivo: leito.motivo || "",
    cid: leito.cid || "", data_internacao: leito.data_internacao || todayStr(), dias_previstos: leito.dias_previstos || "",
    solic_em: isoToLocal(leito.solic_em),
  });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  // ao digitar o CID, sugere os dias (só se o campo estiver vazio — nunca sobrescreve o que você digitou)
  const onCid = v => setF(p => {
    const next = { ...p, cid: v };
    const s = sugerirCid(v, refs);
    if (s && !p.dias_previstos) next.dias_previstos = String(s.dias);
    return next;
  });
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 11px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  const lbl = { fontSize: 11, fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 5 };
  const alta = calcAlta(f.data_internacao, f.dias_previstos);
  const sug = sugerirCid(f.cid, refs);
  const real = f.cid.trim() ? realPorCid[f.cid.trim().toUpperCase()] : null;
  function submit() {
    if (!f.iniciais.trim() || !f.dias_previstos) { alert("Informe ao menos as iniciais e os dias previstos."); return; }
    // 🔴 Sem prontuário não há prontuário da internação: o paciente ocupa
    // leito e fica invisível para evolução, prescrição e conta. A recusa
    // aparece AQUI, no formulário, e não depois de o leito já ter ocupado.
    const vEp = podeAbrirEpisodio({ prontuario: f.prontuario });
    if (!vEp.ok) { alert("⚠ " + vEp.erros.join(" ")); return; }
    onSave({
      iniciais: f.iniciais.trim(), prontuario: f.prontuario.trim(), motivo: f.motivo.trim(),
      cid: f.cid.trim().toUpperCase(), data_internacao: f.data_internacao, dias_previstos: Number(f.dias_previstos),
      solic_em: localToIso(f.solic_em),
    });
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 480, maxWidth: "92vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>Leito {leito.identificacao} — {leito.status === "ocupado" ? "Editar internação" : "Internar paciente"}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 18 }}>Dados de saúde — use iniciais e prontuário</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><label style={lbl}>Iniciais do paciente *</label><input value={f.iniciais} onChange={e => set("iniciais", e.target.value)} placeholder="Ex.: J.S.M." style={inp} /></div>
          <div><label style={lbl}>Nº prontuário/registro</label><input value={f.prontuario} onChange={e => set("prontuario", e.target.value)} placeholder="Ex.: 48213" style={inp} /></div>
          <div style={{ gridColumn: "1 / 3" }}><label style={lbl}>Motivo da internação</label><input value={f.motivo} onChange={e => set("motivo", e.target.value)} placeholder="Ex.: Pós-operatório de colecistectomia" style={inp} /></div>
          <div><label style={lbl}>CID</label><input value={f.cid} onChange={e => onCid(e.target.value)} placeholder="Ex.: J18 (pneumonia)" style={inp} />
            {sug && <div onClick={() => set("dias_previstos", String(sug.dias))} title="Aplicar a referência" style={{ fontSize: 11, color: "#22d3ee", marginTop: 4, cursor: "pointer" }}>Sugestão — {sug.descricao}: ref. {sug.dias}d · <span style={{ textDecoration: "underline" }}>aplicar</span></div>}
            {real && <div onClick={() => set("dias_previstos", String(Math.max(1, Math.round(real.media))))} title="Aplicar a média real do hospital" style={{ fontSize: 11, color: "#818cf8", marginTop: 3, cursor: "pointer" }}>Média real neste hospital: {real.media.toFixed(1)}d em {real.n} alta(s) · <span style={{ textDecoration: "underline" }}>aplicar</span></div>}
          </div>
          {sug?.tratamento && (
            <div style={{ gridColumn: "1 / 3", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 3 }}>Tratamento de referência ({sug.cid})</div>
              <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{sug.tratamento}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>Referência da literatura — a conduta é sempre do médico assistente.</div>
            </div>
          )}
          <div><label style={lbl}>Data de internação</label><input type="date" value={f.data_internacao} onChange={e => set("data_internacao", e.target.value)} style={inp} /></div>
          <div><label style={lbl}>Diária de AIH / dias previstos *</label><input type="number" min="1" value={f.dias_previstos} onChange={e => set("dias_previstos", e.target.value)} placeholder="Ex.: 5" style={inp} /></div>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <label style={lbl}>Previsão de alta</label>
            <div style={{ ...inp, background: "var(--bg)", color: alta ? "#22d3ee" : "var(--text-muted)", fontWeight: 700 }}>{alta ? alta.toLocaleDateString("pt-BR") : "—"}</div>
          </div>
          <div style={{ gridColumn: "1 / 3" }}><label style={lbl}>Hora em que o leito foi solicitado (opcional — p/ indicadores)</label><input type="datetime-local" value={f.solic_em} onChange={e => set("solic_em", e.target.value)} style={inp} /></div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={submit} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{leito.status === "ocupado" ? "Salvar" : "Internar"}</button>
        </div>
      </div>
    </div>
  );
}

// Modal de gerenciamento das referências de CID → dias
function CidRefModal({ refs, onClose, onSave, onDelete }) {
  const [f, setF] = useState({ cid: "", descricao: "", dias: "", tratamento: "" });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  const hl = { fontSize: 11, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 4 };
  async function salvar() {
    if (!f.cid.trim() || !f.dias) { alert("Informe o CID e os dias."); return; }
    setBusy(true);
    await onSave({ cid: f.cid.trim().toUpperCase(), descricao: f.descricao.trim(), dias: Number(f.dias), tratamento: f.tratamento.trim() || null });
    setBusy(false);
    setF({ cid: "", descricao: "", dias: "", tratamento: "" });
  }
  const ordenados = [...refs].sort((a, b) => (a.cid || "").localeCompare(b.cid || ""));
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 580, maxWidth: "94vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Referências de CID — dias e tratamento</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16, marginTop: 2, lineHeight: 1.5 }}>Valores e condutas de referência aproximados (literatura) — ajuste conforme seu protocolo, a diária de AIH e o quadro do paciente. Não é recomendação médica; a conduta é sempre do médico assistente.</div>
        <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 80px auto", gap: 8, alignItems: "end", marginBottom: 8 }}>
          <div><label style={hl}>CID</label><input value={f.cid} onChange={e => set("cid", e.target.value)} placeholder="J18" style={inp} /></div>
          <div><label style={hl}>Descrição</label><input value={f.descricao} onChange={e => set("descricao", e.target.value)} placeholder="Pneumonia" style={inp} /></div>
          <div><label style={hl}>Dias</label><input type="number" min="1" value={f.dias} onChange={e => set("dias", e.target.value)} placeholder="7" style={inp} /></div>
          <button onClick={salvar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13, height: 36 }}>{busy ? "…" : "+ Salvar"}</button>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={hl}>Tratamento sugerido (referência da literatura — revisar com a equipe médica)</label>
          <textarea value={f.tratamento} onChange={e => set("tratamento", e.target.value)} placeholder="Ex.: Antibioticoterapia empírica conforme protocolo institucional; reavaliar em 48-72h…" rows={3} style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} />
        </div>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>{["CID", "Descrição", "Dias", ""].map(h => <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "var(--text-muted)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", background: "var(--bg-2)", borderBottom: "1px solid var(--border)" }}>{h}</th>)}</tr></thead>
            <tbody>
              {ordenados.length === 0 && <tr><td colSpan={4} style={{ padding: "18px", textAlign: "center", color: "var(--text-muted)" }}>Nenhuma referência cadastrada.</td></tr>}
              {ordenados.map(r => (
                <tr key={r.cid}>
                  <td style={{ padding: "7px 12px", fontFamily: "JetBrains Mono, monospace", color: "#22d3ee", fontWeight: 700, verticalAlign: "top" }}>{r.cid}</td>
                  <td style={{ padding: "7px 12px", color: "var(--text-2)" }}>
                    {r.descricao}
                    {r.tratamento && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{r.tratamento}</div>}
                  </td>
                  <td style={{ padding: "7px 12px", color: "var(--text)", fontWeight: 700, verticalAlign: "top" }}>{r.dias}d</td>
                  <td style={{ padding: "7px 12px", textAlign: "right", whiteSpace: "nowrap", verticalAlign: "top" }}>
                    <button onClick={() => setF({ cid: r.cid, descricao: r.descricao || "", dias: String(r.dias), tratamento: r.tratamento || "" })} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 5, padding: "3px 8px", color: "#22d3ee", cursor: "pointer", fontSize: 12, marginRight: 6 }}>Editar</button>
                    <button onClick={() => { if (confirm(`Remover a referência ${r.cid}?`)) onDelete(r.cid); }} style={{ background: "transparent", border: "1px solid #3d0f18", borderRadius: 5, padding: "3px 8px", color: "#fb7185", cursor: "pointer", fontSize: 12 }}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// Gerenciar setores (nome + limiares de alerta por setor)
function SetoresModal({ setores, leitos, onClose, onSave, onDelete }) {
  const vazio = { nome: "", alerta_amarelo: 90, alerta_vermelho: 100, meta_ocupacao: "", meta_permanencia: "", meta_giro: "" };
  const [f, setF] = useState(vazio);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  const hl = { fontSize: 11, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 4 };
  const numOrNull = v => v === "" || v == null ? null : Number(v);
  async function salvar() {
    if (!f.nome.trim()) { alert("Informe o nome do setor."); return; }
    setBusy(true);
    const jah = setores.find(s => s.nome === f.nome.trim());
    await onSave({ nome: f.nome.trim(), alerta_amarelo: Number(f.alerta_amarelo) || 90, alerta_vermelho: Number(f.alerta_vermelho) || 100, meta_ocupacao: numOrNull(f.meta_ocupacao), meta_permanencia: numOrNull(f.meta_permanencia), meta_giro: numOrNull(f.meta_giro), ordem: jah ? jah.ordem : setores.length });
    setBusy(false);
    setF(vazio);
  }
  const ordenados = [...setores].sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || a.nome.localeCompare(b.nome));
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 560, maxWidth: "94vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Setores e limiares de alerta</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16, marginTop: 2 }}>Amarelo = atenção; Vermelho = restringir. Ocupação = leitos ocupados ÷ operacionais. A fila de espera aparece como um selo separado no monitoramento, sem contar na ocupação.</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px", gap: 8, alignItems: "end", marginBottom: 8 }}>
          <div><label style={hl}>Setor</label><input value={f.nome} onChange={e => set("nome", e.target.value)} placeholder="Ex.: UTI" style={inp} /></div>
          <div><label style={hl}>Amarelo %</label><input type="number" value={f.alerta_amarelo} onChange={e => set("alerta_amarelo", e.target.value)} style={inp} /></div>
          <div><label style={hl}>Vermelho %</label><input type="number" value={f.alerta_vermelho} onChange={e => set("alerta_vermelho", e.target.value)} style={inp} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, alignItems: "end", marginBottom: 14 }}>
          <div><label style={hl}>Meta ocupação %</label><input type="number" value={f.meta_ocupacao} onChange={e => set("meta_ocupacao", e.target.value)} placeholder="opcional" style={inp} /></div>
          <div><label style={hl}>Meta permanência (d)</label><input type="number" step="0.1" value={f.meta_permanencia} onChange={e => set("meta_permanencia", e.target.value)} placeholder="opcional" style={inp} /></div>
          <div><label style={hl}>Meta giro/mês</label><input type="number" step="0.1" value={f.meta_giro} onChange={e => set("meta_giro", e.target.value)} placeholder="opcional" style={inp} /></div>
          <button onClick={salvar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13, height: 36 }}>{busy ? "…" : "+ Salvar"}</button>
        </div>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>{["Setor", "Amar.", "Verm.", "Metas (oc/perm/giro)", "Leitos", ""].map(h => <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "var(--text-muted)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", background: "var(--bg-2)", borderBottom: "1px solid var(--border)" }}>{h}</th>)}</tr></thead>
            <tbody>
              {ordenados.length === 0 && <tr><td colSpan={6} style={{ padding: "18px", textAlign: "center", color: "var(--text-muted)" }}>Nenhum setor cadastrado.</td></tr>}
              {ordenados.map(s => (
                <tr key={s.nome}>
                  <td style={{ padding: "7px 12px", fontWeight: 700 }}>{s.nome}</td>
                  <td style={{ padding: "7px 12px", color: "#fbbf24" }}>{s.alerta_amarelo}%</td>
                  <td style={{ padding: "7px 12px", color: "#f43f5e" }}>{s.alerta_vermelho}%</td>
                  <td style={{ padding: "7px 12px", color: "var(--text-3)", fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>{s.meta_ocupacao != null ? s.meta_ocupacao + "%" : "—"} · {s.meta_permanencia != null ? s.meta_permanencia + "d" : "—"} · {s.meta_giro != null ? s.meta_giro : "—"}</td>
                  <td style={{ padding: "7px 12px", color: "var(--text-3)" }}>{leitos.filter(l => (l.setor || "") === s.nome).length}</td>
                  <td style={{ padding: "7px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                    <button onClick={() => setF({ nome: s.nome, alerta_amarelo: s.alerta_amarelo, alerta_vermelho: s.alerta_vermelho, meta_ocupacao: s.meta_ocupacao ?? "", meta_permanencia: s.meta_permanencia ?? "", meta_giro: s.meta_giro ?? "" })} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 5, padding: "3px 8px", color: "#22d3ee", cursor: "pointer", fontSize: 12, marginRight: 6 }}>Editar</button>
                    <button onClick={() => { if (confirm(`Remover o setor ${s.nome}? (os leitos ficam sem setor)`)) onDelete(s.nome); }} style={{ background: "transparent", border: "1px solid #3d0f18", borderRadius: 5, padding: "3px 8px", color: "#fb7185", cursor: "pointer", fontSize: 12 }}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// Relatórios & BI do Giro de Leitos (Fase 3) — indicadores mensais, tendências e relatório imprimível
function LeitosBIView({ leitos, saidas, turnover, operacionais, setores = [] }) {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth());
  const [ano, setAno] = useState(now.getFullYear());
  const [preview, setPreview] = useState(false);

  const inMesData = (dstr, m, y) => { if (!dstr) return false; const d = new Date(dstr + "T00:00:00"); return d.getMonth() === m && d.getFullYear() === y; };
  const inMesISO = (iso, m, y) => { if (!iso) return false; const d = new Date(iso); return d.getMonth() === m && d.getFullYear() === y; };
  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const permDe = s => s.dias_permanencia != null ? s.dias_permanencia : (s.data_internacao && s.data_alta ? Math.max(0, Math.round((new Date(s.data_alta + "T00:00:00") - new Date(s.data_internacao + "T00:00:00")) / 86400000)) : null);

  const dPrev = new Date(ano, mes - 1, 1); const mesP = dPrev.getMonth(), anoP = dPrev.getFullYear();
  const sMes = saidas.filter(s => inMesData(s.data_alta, mes, ano));
  const sPrev = saidas.filter(s => inMesData(s.data_alta, mesP, anoP));
  const cont = (arr, d) => arr.filter(s => (s.desfecho || "alta") === d).length;
  const altas = cont(sMes, "alta"), obitos = cont(sMes, "obito"), transf = cont(sMes, "transferencia");
  const saidasMes = sMes.length, saidasPrev = sPrev.length;
  const permMedia = avg(sMes.map(permDe).filter(v => v != null));
  const permPrev = avg(sPrev.map(permDe).filter(v => v != null));
  const giro = operacionais > 0 ? saidasMes / operacionais : null;
  const giroPrev = operacionais > 0 ? saidasPrev / operacionais : null;
  const tMes = turnover.filter(t => inMesISO(t.entrada_em, mes, ano));
  const tSolDisp = avg(tMes.map(t => diffMin(t.solic_em, t.disp_em)).filter(v => v != null && v >= 0));
  const tDispPronto = avg(tMes.map(t => diffMin(t.disp_em, t.pronto_em)).filter(v => v != null && v >= 0));
  const tProntoEnt = avg(tMes.map(t => diffMin(t.pronto_em, t.entrada_em)).filter(v => v != null && v >= 0));

  // Série de 12 meses até o mês selecionado
  const serie = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(ano, mes - i, 1); const m = d.getMonth(), y = d.getFullYear();
    const ss = saidas.filter(s => inMesData(s.data_alta, m, y));
    const pv = avg(ss.map(permDe).filter(v => v != null));
    serie.push({ name: MONTHS[m], Saídas: ss.length, Permanência: pv != null ? Number(pv.toFixed(1)) : 0 });
  }

  // Altas antes das 10h (usa a hora em que o leito vagou = disp_em)
  const altasComHora = sMes.filter(s => (s.desfecho || "alta") === "alta" && s.disp_em);
  const altas10 = altasComHora.filter(s => new Date(s.disp_em).getHours() < 10).length;
  const pctAltas10 = altasComHora.length ? Math.round((altas10 / altasComHora.length) * 100) : null;

  // Snapshot atual por setor
  const ocupadosAg = leitos.filter(l => l.status === "ocupado").length;
  const ocupAtual = operacionais > 0 ? Math.round((ocupadosAg / operacionais) * 100) : 0;
  const setoresMap = {}; leitos.forEach(l => { const s = l.setor || "Sem setor"; (setoresMap[s] = setoresMap[s] || []).push(l); });
  const setorData = Object.entries(setoresMap).map(([nome, ls]) => {
    const op = ls.filter(x => !LEITO_FORA_OPERACAO.includes(x.status)).length;
    const oc = ls.filter(x => x.status === "ocupado").length;
    return { name: nome, Ocupação: op ? Math.round((oc / op) * 100) : 0, leitos: ls.length };
  }).sort((a, b) => b.Ocupação - a.Ocupação);
  // Permanência e giro POR SETOR no mês (usa o setor gravado na saída)
  const opDoSetor = nome => leitos.filter(l => (l.setor || "") === nome && !LEITO_FORA_OPERACAO.includes(l.status)).length;
  const statSetor = nome => {
    const ss = sMes.filter(s => (s.setor || "") === nome);
    const perm = avg(ss.map(permDe).filter(v => v != null));
    const op = opDoSetor(nome);
    return { saidas: ss.length, perm, giro: op > 0 ? ss.length / op : null };
  };

  const anos = [now.getFullYear(), now.getFullYear() - 1];
  const sel = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px", color: "var(--text)", fontSize: 13, outline: "none", cursor: "pointer" };
  const secLbl = { fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 };
  const Delta = ({ cur, prev, inverter }) => {
    if (cur == null || prev == null || prev === 0) return null;
    const d = ((cur - prev) / prev) * 100; if (Math.abs(d) < 0.5) return <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>≈ estável vs {MONTHS[mesP]}</span>;
    const bom = inverter ? d < 0 : d > 0;
    return <span style={{ fontSize: 10.5, color: bom ? "#34d399" : "#f43f5e", fontWeight: 700 }}>{d >= 0 ? "▲ +" : "▼ -"}{Math.abs(d).toFixed(0)}% vs {MONTHS[mesP]}</span>;
  };
  const KPI = ({ label, valor, cor, delta, sub: subTxt }) => (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${cor || "var(--border)"}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
      <div style={{ fontSize: 23, fontWeight: 800, color: cor || "var(--text)", fontFamily: "JetBrains Mono, monospace", marginTop: 3 }}>{valor}</div>
      {delta || (subTxt && <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 2 }}>{subTxt}</div>)}
    </div>
  );
  const printStyles = `@media print { body * { visibility: hidden !important; } #leitos-print, #leitos-print * { visibility: visible !important; } #leitos-print { position: fixed; inset: 0; background: #fff !important; color: #111 !important; padding: 18px; } @page { size: A4 portrait; margin: 12mm; } }`;
  const relLinhas = [
    ["Saídas no mês", String(saidasMes), `${altas} alta(s) · ${obitos} óbito(s) · ${transf} transf.`],
    ["Permanência média", permMedia != null ? permMedia.toFixed(1) + " dias" : "—", ""],
    ["Giro de leitos", giro != null ? giro.toFixed(2) : "—", "saídas ÷ leitos operacionais"],
    ["Ocupação atual", ocupAtual + "%", `${ocupadosAg}/${operacionais} leitos`],
    ["Solicitado → Disponibilizado", fmtDur(tSolDisp), ""],
    ["Disponibilizado → Pronto", fmtDur(tDispPronto), "tempo de higienização"],
    ["Pronto → Entrada", fmtDur(tProntoEnt), "leito pronto até novo paciente"],
  ];

  return (
    <div>
      <style>{printStyles}</style>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: "1.25rem" }}>
        <select value={mes} onChange={e => setMes(Number(e.target.value))} style={sel}>{MONTHS_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}</select>
        <select value={ano} onChange={e => setAno(Number(e.target.value))} style={sel}>{anos.map(a => <option key={a} value={a}>{a}</option>)}</select>
        <button onClick={() => setPreview(p => !p)} style={{ background: "transparent", color: VX.turquesa, border: `1px solid ${VX.turquesa}55`, borderRadius: 7, padding: "7px 15px", fontWeight: 700, fontSize: 13, cursor: "pointer", marginLeft: "auto" }}>{preview ? "✕ Fechar relatório" : "Relatório do mês"}</button>
        {preview && <button onClick={() => window.print()} style={{ background: "#34d399", color: "#000", border: "none", borderRadius: 7, padding: "7px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Imprimir / PDF</button>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: "1.5rem" }}>
        <KPI label={`Saídas em ${MONTHS[mes]}`} valor={saidasMes} cor="#22d3ee" delta={<Delta cur={saidasMes} prev={saidasPrev} />} />
        <KPI label="Permanência média" valor={permMedia != null ? permMedia.toFixed(1) + "d" : "—"} cor="#3b82f6" delta={<Delta cur={permMedia} prev={permPrev} inverter />} />
        <KPI label="Giro de leitos" valor={giro != null ? giro.toFixed(2) : "—"} cor="#2dd4bf" delta={<Delta cur={giro} prev={giroPrev} />} />
        <KPI label="Ocupação atual" valor={ocupAtual + "%"} cor={ocupAtual >= 90 ? "#f43f5e" : "#818cf8"} sub={`${ocupadosAg}/${operacionais} operacionais`} />
        <KPI label="Altas / Óbitos / Transf." valor={`${altas}/${obitos}/${transf}`} cor="#34d399" sub="desfechos do mês" />
        <KPI label="Altas antes das 10h" valor={pctAltas10 != null ? pctAltas10 + "%" : "—"} cor="#0d9488" sub={altasComHora.length ? `${altas10}/${altasComHora.length} altas` : "sem hora registrada"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14, marginBottom: "1.5rem" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem" }}>
          <div style={secLbl}>Saídas por mês (12 meses)</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={serie} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={customTooltip} />
              <Bar dataKey="Saídas" radius={[4, 4, 0, 0]}>
                {serie.map((_, i) => <Cell key={i} fill={i === serie.length - 1 ? "#2dd4bf" : "#0d9488"} fillOpacity={i === serie.length - 1 ? 1 : 0.6} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem" }}>
          <div style={secLbl}>Permanência média por mês (dias)</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={serie} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={customTooltip} />
              <Line type="monotone" dataKey="Permanência" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2.5, fill: "#3b82f6" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.4fr) minmax(250px, 1fr)", gap: 14 }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem" }}>
          <div style={secLbl}>Ocupação por setor (agora)</div>
          {setorData.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Sem setores cadastrados.</div> : (
            <ResponsiveContainer width="100%" height={Math.max(120, setorData.length * 34)}>
              <BarChart data={setorData} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                <XAxis type="number" domain={[0, 100]} tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} unit="%" />
                <YAxis type="category" dataKey="name" tick={{ fill: "var(--text-3)", fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
                <Tooltip content={customTooltip} />
                <ReferenceLine x={90} stroke="#f43f5e" strokeDasharray="4 2" />
                <Bar dataKey="Ocupação" radius={[0, 4, 4, 0]} unit="%">
                  {setorData.map((e, i) => <Cell key={i} fill={e.Ocupação >= 90 ? "#f43f5e" : e.Ocupação >= 70 ? "#d97706" : "#2dd4bf"} fillOpacity={.9} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem" }}>
          <div style={secLbl}>Tempos de giro — {MONTHS[mes]}</div>
          {[["Solicitado → Disponibilizado", tSolDisp, "#60a5fa"], ["Disponibilizado → Pronto", tDispPronto, "#fbbf24"], ["Pronto → Entrada", tProntoEnt, "#818cf8"]].map(([lb, v, c]) => (
            <div key={lb} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 12.5 }}>
              <span style={{ color: "var(--text-2)" }}>{lb}</span>
              <span style={{ fontWeight: 800, fontFamily: "JetBrains Mono, monospace", color: v != null ? c : "var(--text-muted)" }}>{fmtDur(v)}</span>
            </div>
          ))}
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 8 }}>{tMes.length} ciclo(s) concluído(s) no mês.</div>
        </div>
      </div>

      {(() => {
        const comMeta = setores.filter(s => s.meta_ocupacao != null || s.meta_permanencia != null || s.meta_giro != null);
        if (!comMeta.length) return null;
        const ocDe = nome => { const d = setorData.find(x => x.name === nome); return d ? d.Ocupação : null; };
        return (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem", marginTop: 14 }}>
            <div style={secLbl}>Metas por setor</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 640 }}>
                <thead><tr>{["Setor", "Ocupação (atual/meta)", "Permanência (mês/meta)", "Giro (mês/meta)"].map(h => <th key={h} style={{ textAlign: "left", padding: "7px 10px", color: "var(--text-muted)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{h}</th>)}</tr></thead>
                <tbody>
                  {comMeta.sort((a, b) => ordSetor(a.nome) - ordSetor(b.nome)).map(s => {
                    const oc = ocDe(s.nome);
                    const st = statSetor(s.nome);
                    // farol: ocupação e permanência (menor é melhor) ok se <= meta; giro (maior é melhor) ok se >= meta
                    const farol = (val, meta, inverter) => {
                      if (val == null || meta == null) return null;
                      return inverter ? val <= meta : val >= meta;
                    };
                    const Cel = ({ val, meta, unidade, ok }) => (
                      <td style={{ padding: "7px 10px" }}>
                        <span style={{ fontFamily: "JetBrains Mono, monospace", color: ok == null ? "var(--text-2)" : ok ? "#34d399" : "#f43f5e", fontWeight: 700 }}>{val != null ? val + unidade : "—"}</span>
                        <span style={{ color: "var(--text-muted)", fontSize: 11 }}> / {meta != null ? meta + unidade : "—"}</span>
                        {ok != null && <span style={{ marginLeft: 6, fontSize: 10 }}>{ok ? "🟢" : "🔴"}</span>}
                      </td>
                    );
                    return (
                      <tr key={s.nome} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "7px 10px", fontWeight: 600 }}>{s.nome}</td>
                        <Cel val={oc} meta={s.meta_ocupacao} unidade="%" ok={farol(oc, s.meta_ocupacao, true)} />
                        <Cel val={st.perm != null ? Number(st.perm.toFixed(1)) : null} meta={s.meta_permanencia} unidade="d" ok={farol(st.perm, s.meta_permanencia, true)} />
                        <Cel val={st.giro != null ? Number(st.giro.toFixed(2)) : null} meta={s.meta_giro} unidade="" ok={farol(st.giro, s.meta_giro, false)} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 8 }}>Ocupação = snapshot atual. Permanência e giro apurados das saídas de {MONTHS[mes]} com setor registrado (🟢 dentro da meta · 🔴 fora). Saídas antigas sem setor não entram no cálculo por setor.</div>
          </div>
        );
      })()}

      {preview && (
        <div id="leitos-print" style={{ background: "#fff", color: "#111", borderRadius: 10, border: "1px solid #e5e7eb", padding: "24px 28px", fontFamily: "Inter, sans-serif", fontSize: 12, marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, paddingBottom: 12, borderBottom: "2px solid #e5e7eb" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>GIRO DE LEITOS — {HOSPITAL_SIGLA}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{HOSPITAL_NOME} · Valentrax Healthcare Operations · Indicadores de gestão de leitos</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", background: "#f1f5f9", borderRadius: 8, padding: "6px 14px" }}>{MONTHS_FULL[mes]}/{ano}</div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>Gerado em {new Date().toLocaleString("pt-BR")}</div>
            </div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 14 }}>
            <thead><tr>{["Indicador", "Valor", "Cálculo"].map(h => <th key={h} style={{ textAlign: "left", padding: "7px 10px", background: "#f8fafc", color: "#334155", borderBottom: "1.5px solid #e2e8f0", fontSize: 11 }}>{h}</th>)}</tr></thead>
            <tbody>
              {relLinhas.map(([ind, v, c]) => (
                <tr key={ind}><td style={{ padding: "6px 10px", borderBottom: "1px solid #eef2f7", fontWeight: 600, color: "#0f172a" }}>{ind}</td><td style={{ padding: "6px 10px", borderBottom: "1px solid #eef2f7", color: "#334155", fontWeight: 700 }}>{v}</td><td style={{ padding: "6px 10px", borderBottom: "1px solid #eef2f7", color: "#0369a1" }}>{c}</td></tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 6 }}>Ocupação por setor (snapshot atual)</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr>{["Setor", "Leitos", "Ocupação"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px 10px", background: "#f8fafc", color: "#334155", borderBottom: "1.5px solid #e2e8f0", fontSize: 11 }}>{h}</th>)}</tr></thead>
            <tbody>
              {setorData.map(s => (
                <tr key={s.name}><td style={{ padding: "5px 10px", borderBottom: "1px solid #eef2f7", color: "#0f172a" }}>{s.name}</td><td style={{ padding: "5px 10px", borderBottom: "1px solid #eef2f7", color: "#334155" }}>{s.leitos}</td><td style={{ padding: "5px 10px", borderBottom: "1px solid #eef2f7", color: "#0f172a", fontWeight: 700 }}>{s.Ocupação}%</td></tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 16, fontSize: 10, color: "#94a3b8", borderTop: "1px solid #e5e7eb", paddingTop: 8 }}>Relatório gerado pela Valentrax Healthcare Operations. Indicadores apurados das altas e ciclos de giro registrados. Documento de apoio à gestão hospitalar.</div>
        </div>
      )}
    </div>
  );
}

// Motor de alertas inteligentes do Giro de Leitos (local, a partir do estado atual)
function leitosAlertas(leitos, solic) {
  const out = []; const now = nowISO();
  const push = (gravidade, titulo, detalhe) => out.push({ gravidade, titulo, detalhe });
  const operacionais = leitos.filter(l => !LEITO_FORA_OPERACAO.includes(l.status)).length;
  const ocupados = leitos.filter(l => l.status === "ocupado").length;
  const livres = leitos.filter(l => l.status === "livre").length;
  const ocg = operacionais > 0 ? Math.round((ocupados / operacionais) * 100) : 0;
  if (operacionais > 0 && ocg >= 90) push("alta", "Ocupação global crítica", `${ocg}% dos leitos operacionais ocupados (${ocupados}/${operacionais}).`);
  else if (operacionais > 0 && ocg >= 80) push("media", "Ocupação global alta", `${ocg}% ocupados (${ocupados}/${operacionais}).`);
  if (livres === 0 && operacionais > 0) push("alta", "Sem leitos livres", "Nenhum leito disponível para internação no momento.");
  leitos.filter(l => l.status === "ocupado").forEach(l => {
    const s = sinalLeito(l.data_internacao, l.dias_previstos);
    if (s.restam != null && s.restam < 0) push("alta", `Alta vencida — leito ${l.identificacao}`, `${l.iniciais || "paciente"} · previsão passou ${Math.abs(s.restam)}d. ${s.texto}`);
    else if (s.restam != null && s.restam <= 1) push("media", `Alta próxima — leito ${l.identificacao}`, `${l.iniciais || "paciente"} · ${s.texto}`);
  });
  leitos.filter(l => l.status === "higienizacao").forEach(l => {
    const min = diffMin(l.disp_em, now);
    if (min != null && min > 120) push("alta", `Higienização demorada — leito ${l.identificacao}`, `em higienização há ${fmtDur(min)}.`);
    else if (min != null && min > 60) push("media", `Higienização em atraso — leito ${l.identificacao}`, `em higienização há ${fmtDur(min)}.`);
  });
  const setoresMap = {}; leitos.forEach(l => { const s = l.setor || "Sem setor"; (setoresMap[s] = setoresMap[s] || []).push(l); });
  Object.entries(setoresMap).forEach(([nome, ls]) => {
    const op = ls.filter(x => !LEITO_FORA_OPERACAO.includes(x.status)).length;
    const oc = ls.filter(x => x.status === "ocupado").length;
    const pct = op ? Math.round((oc / op) * 100) : 0;
    if (nome !== "Sem setor" && op > 0 && pct >= 90) push("media", `Setor lotado — ${nome}`, `${pct}% ocupado (${oc}/${op}).`);
  });
  (solic || []).forEach(s => {
    const esp = diffMin(s.hora_pedido, now);
    if (esp != null && esp > 240) push("alta", `Espera longa por leito — ${s.iniciais || "paciente"}`, `aguardando ${fmtDur(esp)}${s.setor_destino ? " para " + s.setor_destino : ""}.`);
    else if (esp != null && esp > 120) push("media", `Fila de internação — ${s.iniciais || "paciente"}`, `aguardando ${fmtDur(esp)}${s.setor_destino ? " para " + s.setor_destino : ""}.`);
  });
  // Leito livre parado enquanto há paciente esperando por aquele setor
  const filaPorSetor = {};
  (solic || []).forEach(s => { if (s.setor_destino) (filaPorSetor[s.setor_destino] = filaPorSetor[s.setor_destino] || []).push(s); });
  Object.entries(filaPorSetor).forEach(([nome, fs]) => {
    const livresSetor = leitos.filter(l => (l.setor || "") === nome && l.status === "livre").length;
    if (!livresSetor) return;
    const maior = Math.max(...fs.map(s => diffMin(s.hora_pedido, now) || 0));
    if (maior > 60) push("alta", `Leito livre com fila — ${nome}`, `${livresSetor} leito(s) livre(s) e ${fs.length} paciente(s) aguardando (maior espera ${fmtDur(maior)}). Priorizar a internação.`);
    else if (maior > 30) push("media", `Leito livre com fila — ${nome}`, `${livresSetor} livre(s) · ${fs.length} aguardando (${fmtDur(maior)}).`);
  });
  return out.sort((a, b) => FARM_GRAV[a.gravidade].ordem - FARM_GRAV[b.gravidade].ordem);
}

// Alertas inteligentes do Giro de Leitos (Fase 4)
function LeitosAlertasView({ leitos, solic }) {
  const alertas = leitosAlertas(leitos, solic);
  const nAlta = alertas.filter(a => a.gravidade === "alta").length;
  const nMedia = alertas.filter(a => a.gravidade === "media").length;
  const KPI = ({ label, valor, cor }) => (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${cor}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: cor, fontFamily: "JetBrains Mono, monospace", marginTop: 3 }}>{valor}</div>
    </div>
  );
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: "1.5rem" }}>
        <KPI label="Alertas altos" valor={nAlta} cor={nAlta ? "#f43f5e" : "#34d399"} />
        <KPI label="Alertas médios" valor={nMedia} cor={nMedia ? "#d97706" : "#34d399"} />
        <KPI label="Total" valor={alertas.length} cor={alertas.length ? "#818cf8" : "#34d399"} />
      </div>
      {alertas.length === 0 ? (
        <div style={{ background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 10, padding: "2.5rem", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Nenhum alerta no momento. 👍 O setor está sob controle.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {alertas.map((a, i) => { const g = FARM_GRAV[a.gravidade]; return (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, background: g.cor + "11", border: `1px solid ${g.cor}44`, borderRadius: 9, padding: "10px 13px" }}>
              <span style={{ fontSize: 9.5, fontWeight: 800, color: g.cor, textTransform: "uppercase", marginTop: 2, minWidth: 42 }}>{g.label}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{a.titulo}</div>
                <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 1 }}>{a.detalhe}</div>
              </div>
            </div>
          ); })}
        </div>
      )}
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 14, lineHeight: 1.5 }}>Alertas calculados automaticamente do estado atual: ocupação, previsão de alta (sinaleira), tempo de higienização e fila de internação. Atualiza ao voltar para a aba.</div>
    </div>
  );
}

const LEITOS_ASSIST_HELP = 'Posso responder sobre: panorama do setor, vagas previstas (24/48h), ocupação (global e por setor), leitos livres, fila de internação, altas previstas/vencidas, giro de leitos, permanência média, tempos de higienização/giro, transferências e alertas. Ex.: "panorama", "vagas previstas", "quanto está a ocupação?", "quem tem alta vencida?", "como está a UTI?".';
// IA Assistente local do Giro de Leitos (Fase 4) — gratuito, dados não saem do navegador
function LeitosAssistenteView({ leitos, solic, saidas, turnover, operacionais }) {
  const [msgs, setMsgs] = useState([{ role: "a", text: "Olá! Sou o assistente local do Giro de Leitos. " + LEITOS_ASSIST_HELP }]);
  const [q, setQ] = useState("");
  const fimRef = useRef(null);
  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const now = new Date(); const mesA = now.getMonth(), anoA = now.getFullYear();
  const inMesData = (dstr, m, y) => { if (!dstr) return false; const d = new Date(dstr + "T00:00:00"); return d.getMonth() === m && d.getFullYear() === y; };
  const inMesISO = (iso, m, y) => { if (!iso) return false; const d = new Date(iso); return d.getMonth() === m && d.getFullYear() === y; };
  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const permDe = s => s.dias_permanencia != null ? s.dias_permanencia : (s.data_internacao && s.data_alta ? Math.max(0, Math.round((new Date(s.data_alta + "T00:00:00") - new Date(s.data_internacao + "T00:00:00")) / 86400000)) : null);
  const op = operacionais || leitos.filter(l => !LEITO_FORA_OPERACAO.includes(l.status)).length;
  const ocupados = leitos.filter(l => l.status === "ocupado").length;
  const livres = leitos.filter(l => l.status === "livre").length;
  const higienizando = leitos.filter(l => l.status === "higienizacao").length;
  const ocg = op > 0 ? Math.round((ocupados / op) * 100) : 0;
  const setoresMap = {}; leitos.forEach(l => { const s = l.setor || "Sem setor"; (setoresMap[s] = setoresMap[s] || []).push(l); });
  const setorPct = Object.entries(setoresMap).map(([nome, ls]) => { const o = ls.filter(x => !LEITO_FORA_OPERACAO.includes(x.status)).length; const oc = ls.filter(x => x.status === "ocupado").length; return { nome, pct: o ? Math.round((oc / o) * 100) : 0, oc, o, livres: ls.filter(x => x.status === "livre").length }; });
  const filaEspera = (solic || []).map(s => diffMin(s.hora_pedido, nowISO())).filter(v => v != null);
  const maiorEspera = filaEspera.length ? Math.max(...filaEspera) : null;
  const ocupadosArr = leitos.filter(l => l.status === "ocupado").map(l => ({ l, s: sinalLeito(l.data_internacao, l.dias_previstos) }));
  const vencidas = ocupadosArr.filter(x => x.s.restam != null && x.s.restam < 0);
  const proximas = ocupadosArr.filter(x => x.s.restam != null && x.s.restam >= 0 && x.s.restam <= 1);
  const sMes = (saidas || []).filter(s => inMesData(s.data_alta, mesA, anoA));
  const altasMes = sMes.filter(s => (s.desfecho || "alta") === "alta").length;
  const transfMes = sMes.filter(s => s.desfecho === "transferencia").length;
  const permMedia = avg(sMes.map(permDe).filter(v => v != null));
  const giro = op > 0 ? sMes.length / op : null;
  const tMes = (turnover || []).filter(t => inMesISO(t.entrada_em, mesA, anoA));
  const tHig = avg(tMes.map(t => diffMin(t.disp_em, t.pronto_em)).filter(v => v != null && v >= 0));
  const tSolDisp = avg(tMes.map(t => diffMin(t.solic_em, t.disp_em)).filter(v => v != null && v >= 0));
  const tProntoEnt = avg(tMes.map(t => diffMin(t.pronto_em, t.entrada_em)).filter(v => v != null && v >= 0));
  const alertas = leitosAlertas(leitos, solic);

  function responder(pergunta) {
    const s = normTxt(pergunta);
    const has = (...ks) => ks.some(k => s.includes(k));
    if (!s) return LEITOS_ASSIST_HELP;
    if (has("ajuda", "o que voce", "o que posso", "pode responder", "comando") || s === "?") return LEITOS_ASSIST_HELP;
    if (has("bom dia", "boa tarde", "boa noite", "tudo bem", "obrigad", "valeu") || s === "oi" || s === "ola") return "Olá! " + LEITOS_ASSIST_HELP;
    if (has("panorama", "resumo", "visao geral", "situacao", "como esta o setor", "como anda")) {
      return `Panorama dos leitos:\n• Ocupação global: ${ocg}% (${ocupados}/${op} operacionais)\n• Livres: ${livres} · em higienização: ${higienizando}\n• Fila de internação: ${(solic || []).length}${maiorEspera != null ? ` (maior espera ${fmtDur(maiorEspera)})` : ""}\n• Altas previstas: ${proximas.length} · vencidas: ${vencidas.length}\n• Alertas: ${alertas.filter(a => a.gravidade === "alta").length} alto(s) · ${alertas.filter(a => a.gravidade === "media").length} médio(s)`;
    }
    // Setor específico
    const setorHit = setorPct.find(x => x.nome !== "Sem setor" && normTxt(x.nome).length >= 2 && s.includes(normTxt(x.nome)));
    if (setorHit) return `${setorHit.nome}: ${setorHit.pct}% ocupado (${setorHit.oc}/${setorHit.o}) · ${setorHit.livres} livre(s).`;
    if (has("vaga prevista", "vagas previstas", "vai vagar", "quando vaga", "previsao de vaga")) {
      const pv = Object.entries(setoresMap).map(([nome, ls]) => {
        const sn = ls.filter(x => x.status === "ocupado").map(x => sinalLeito(x.data_internacao, x.dias_previstos));
        return { nome, hoje: sn.filter(x => x.restam != null && x.restam <= 0).length, amanha: sn.filter(x => x.restam === 1).length, hig: ls.filter(x => x.status === "higienizacao").length };
      }).filter(x => x.hoje || x.amanha || x.hig);
      if (!pv.length) return `Nenhuma vaga prevista para 24/48h pela previsão de alta. Livres agora: ${livres}.`;
      return `Previsão de vagas (24/48h):\n` + pv.map(x => `• ${x.nome} — hoje: ${x.hoje} · amanhã: ${x.amanha}${x.hig ? ` · em limpeza: ${x.hig}` : ""}`).join("\n") + `\nLivres agora: ${livres}.`;
    }
    if (has("livre", "disponivel", "vaga", "vazio")) {
      const porSetor = setorPct.filter(x => x.livres > 0).map(x => `• ${x.nome}: ${x.livres}`).join("\n");
      return `${livres} leito(s) livre(s) no total.${porSetor ? "\n" + porSetor : ""}`;
    }
    if (has("ocupacao", "lotacao", "lotado", "ocupad")) {
      const top = [...setorPct].filter(x => x.o > 0).sort((a, b) => b.pct - a.pct).slice(0, 6).map(x => `• ${x.nome}: ${x.pct}% (${x.oc}/${x.o})`).join("\n");
      return `Ocupação global: ${ocg}% (${ocupados}/${op}).${top ? "\nPor setor:\n" + top : ""}`;
    }
    if (has("fila", "aguardando", "espera", "internacao", "solicitac")) {
      if (!(solic || []).length) return "Nenhuma solicitação de leito aguardando no momento.";
      return `${(solic || []).length} paciente(s) na fila de internação. Maior espera: ${fmtDur(maiorEspera)}.`;
    }
    if (has("vencida", "vencid", "atrasada", "passou", "estourou")) {
      if (!vencidas.length) return "Nenhuma previsão de alta vencida. 👍";
      return `${vencidas.length} alta(s) vencida(s):\n` + vencidas.slice(0, 8).map(x => `• leito ${x.l.identificacao} — ${x.l.iniciais || "?"} (${x.s.texto})`).join("\n");
    }
    if (has("alta prevista", "alta proxima", "previsao", "sinaleira", "alta hoje", "vai receber alta")) {
      if (!proximas.length && !vencidas.length) return "Nenhuma alta prevista para as próximas 24h.";
      return `Altas próximas (≤24h): ${proximas.length}${proximas.length ? "\n" + proximas.slice(0, 8).map(x => `• leito ${x.l.identificacao} — ${x.l.iniciais || "?"}`).join("\n") : ""}\nVencidas: ${vencidas.length}.`;
    }
    if (has("alta", "receberam alta", "deram alta")) return `Altas no mês: ${altasMes}. Transferências: ${transfMes}.`;
    if (has("giro")) return `Giro de leitos no mês: ${giro != null ? giro.toFixed(2) : "—"} (saídas ÷ ${op} leitos operacionais).`;
    if (has("permanencia", "media de dias", "quanto tempo interna")) return `Permanência média (altas do mês): ${permMedia != null ? permMedia.toFixed(1) + " dias" : "—"}.`;
    if (has("higieniz", "limpeza", "tempo de giro", "tempo", "disponibilizado", "pronto")) return `Tempos do mês:\n• Solicitado → Disponibilizado: ${fmtDur(tSolDisp)}\n• Higienização (Disp → Pronto): ${fmtDur(tHig)}\n• Pronto → Entrada: ${fmtDur(tProntoEnt)}\nEm higienização agora: ${higienizando}.`;
    if (has("transfer")) return `Transferências externas no mês: ${transfMes}.`;
    if (has("alerta", "problema", "risco", "atencao")) {
      if (!alertas.length) return "Nenhum alerta no momento. 👍";
      return `${alertas.length} alerta(s) (${alertas.filter(a => a.gravidade === "alta").length} alto):\n` + alertas.slice(0, 8).map(a => `• [${FARM_GRAV[a.gravidade].label}] ${a.titulo}`).join("\n");
    }
    return "Não entendi a pergunta. " + LEITOS_ASSIST_HELP;
  }
  function enviar(texto) { const t = (texto != null ? texto : q).trim(); if (!t) return; setMsgs(m => [...m, { role: "u", text: t }, { role: "a", text: responder(t) }]); setQ(""); }
  const sugestoes = ["Panorama", "Vagas previstas", "Ocupação", "Leitos livres", "Fila de internação", "Alta vencida", "Alertas"];

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
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && enviar()} placeholder="Pergunte sobre os leitos…" style={{ flex: 1, background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 13px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none" }} />
        <button onClick={() => enviar()} style={{ background: VX.turquesa, color: "#062a26", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Enviar</button>
      </div>
    </div>
  );
}

export default function LeitosPage({ sb, currentUser, canEdit }) {
  const [sub, setSub] = useState("dashboard"); // tela da barra lateral interna
  const [leitos, setLeitos] = useState(() => loadLeitos());
  const [cidRef, setCidRef] = useState(() => loadCidRefLocal());
  const [modal, setModal]   = useState(null);   // leito sendo internado/editado
  const [tempos, setTempos] = useState(null);   // leito editando tempos de fluxo
  const [showCidRef, setShowCidRef] = useState(false);
  const [showIndic, setShowIndic]   = useState(false);
  const [setores, setSetores] = useState(() => loadSetoresLocal());
  const [showSetores, setShowSetores] = useState(false);
  const [novoLeito, setNovoLeito] = useState("");
  const [solic, setSolic] = useState([]);       // fila de solicitações de leito
  const [saidas, setSaidas] = useState([]);     // histórico de altas/saídas
  const [turnover, setTurnover] = useState([]); // ciclos de giro (solicitado/disp/pronto/entrada)
  const [busca, setBusca] = useState("");       // busca das listas (pacientes/altas/internações)
  const [setorSel, setSetorSel] = useState(""); // setor selecionado no mapa detalhado ("" = 1º; "__todos__" = todos)
  const [tv, setTv] = useState(false);          // Modo TV: painel de parede somente leitura
  useEffect(() => {
    if (!tv) return;
    const onKey = e => { if (e.key === "Escape") sairTv(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tv]);
  function entrarTv() { setTv(true); try { document.documentElement.requestFullscreen?.()?.catch?.(() => {}); } catch {} }
  function sairTv() { setTv(false); try { if (document.fullscreenElement) document.exitFullscreen?.()?.catch?.(() => {}); } catch {} }
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 60000); return () => clearInterval(id); }, []);
  // Mapa de risco: carrega escalas/LPP dos leitos ocupados só quando a aba é vista.
  const [risco, setRisco] = useState({ escalas: [], lpp: [] });
  useEffect(() => {
    if (!sb || sub !== "risco") return;
    const pront = leitos.filter(l => l.status === "ocupado" && l.prontuario).map(l => l.prontuario);
    let cancel = false;
    loadRiscoEnfermagem(sb, pront).then(r => { if (!cancel) setRisco(r); });
    return () => { cancel = true; };
  }, [sub, leitos]);
  // Checagem SAE: carrega a prescrição de enfermagem e checagens dos leitos
  // ocupados só quando a aba é vista (mesmo padrão do mapa de risco).
  const [checagemSae, setChecagemSae] = useState({ prescricoes: [], itens: [], checagens: [] });
  useEffect(() => {
    if (!sb || sub !== "checagem-sae") return;
    const pront = leitos.filter(l => l.status === "ocupado" && l.prontuario).map(l => l.prontuario);
    let cancel = false;
    loadChecagemSae(sb, pront).then(r => { if (!cancel) setChecagemSae(r); });
    return () => { cancel = true; };
  }, [sub, leitos]);

  useEffect(() => {
    if (!sb) return;
    let cancel = false;
    const sync = () => {
      loadLeitosFromSupabase(sb).then(rows => { if (!cancel && rows) { setLeitos(rows); saveLeitos(rows); } });
      loadCidRefFromSupabase(sb).then(rows => { if (!cancel && rows) { setCidRef(rows); saveCidRefLocal(rows); } });
      loadSetoresFromSupabase(sb).then(rows => { if (!cancel && rows) { setSetores(rows); saveSetoresLocal(rows); } });
      loadSolicitacoes(sb).then(rows => { if (!cancel && Array.isArray(rows)) setSolic(rows); });
      loadSaidas(sb).then(rows => { if (!cancel && Array.isArray(rows)) setSaidas(rows); });
      loadTurnover(sb).then(rows => { if (!cancel && Array.isArray(rows)) setTurnover(rows); });
    };
    sync();
    const onFocus = () => sync();
    window.addEventListener("focus", onFocus);
    const iv = setInterval(sync, 60000); // tempo real: repuxa os dados a cada 60s (Modo TV e painel)
    return () => { cancel = true; window.removeEventListener("focus", onFocus); clearInterval(iv); };
  }, []);

  async function salvarCidRef(ref) {
    const arr = loadCidRefLocal().filter(r => r.cid !== ref.cid);
    arr.push(ref);
    saveCidRefLocal(arr); setCidRef(arr);
    await upsertCidRefRemote(sb, ref, currentUser);
  }
  async function removerCidRef(cid) {
    const arr = loadCidRefLocal().filter(r => r.cid !== cid);
    saveCidRefLocal(arr); setCidRef(arr);
    await deleteCidRefRemote(sb, cid);
  }
  async function salvarSetor(setor) {
    const arr = loadSetoresLocal().filter(s => s.nome !== setor.nome); arr.push(setor);
    saveSetoresLocal(arr); setSetores(arr);
    await upsertSetorRemote(sb, setor, currentUser);
    registrarAuditoria(sb, currentUser, "salvar setor", setor.nome, {});
  }
  async function removerSetor(nome) {
    const arr = loadSetoresLocal().filter(s => s.nome !== nome);
    saveSetoresLocal(arr); setSetores(arr);
    await deleteSetorRemote(sb, nome);
  }
  async function setSetorLeito(leito, setorNome) {
    await salvarLeito({ identificacao: leito.identificacao, setor: setorNome || null });
  }
  async function setIsolamentoLeito(leito, iso) {
    await salvarLeito({ identificacao: leito.identificacao, isolamento: iso || null });
    registrarAuditoria(sb, currentUser, iso ? "marcar isolamento" : "remover isolamento", `${leito.identificacao}${iso ? " · " + iso : ""}`, {});
  }

  function persist(next) { saveLeitos(next); setLeitos(next); }
  async function salvarLeito(leito) {
    const arr = loadLeitos();
    const i = arr.findIndex(l => l.identificacao === leito.identificacao);
    if (i >= 0) arr[i] = { ...arr[i], ...leito }; else arr.push(leito);
    persist(arr);
    await upsertLeitoRemote(sb, arr[i >= 0 ? i : arr.length - 1], currentUser);
  }
  async function addLeito() {
    const id = novoLeito.trim();
    if (!id) return;
    if (loadLeitos().some(l => l.identificacao.toLowerCase() === id.toLowerCase())) { alert("Esse leito já existe."); return; }
    setNovoLeito("");
    await salvarLeito({ identificacao: id, status: "livre" });
    registrarAuditoria(sb, currentUser, "cadastrar leito", id, {});
  }
  /** Os episódios em aberto deste prontuário — para não abrir dois. */
  async function episodiosAbertosDe(prontuario) {
    if (!prontuario) return [];
    const r = await sb(`pep_episodios?prontuario=eq.${encodeURIComponent(prontuario)}&status=eq.aberto&select=id,prontuario,status,leito`).catch(() => null);
    return listaLida(r);
  }

  async function internar(leito, dados) {
    const now = nowISO();
    const editando = leito.status === "ocupado";

    // 🔴 A LIGAÇÃO QUE FALTAVA. Ocupar o leito não abria `pep_episodios`, e
    // sem episódio ficavam vazios — por construção e sem erro na tela —
    // evolução, prescrição do internado, sinais vitais, NEWS, Braden,
    // Morse, LPP, SAE, reconciliação, sumário de alta, e o Mapa de risco e
    // a Checagem SAE deste mesmo módulo.
    //
    // ⚠️ A VALIDAÇÃO VEM ANTES DE QUALQUER ESCRITA: recusa previsível não
    // pode deixar o leito ocupado pela metade. Só a falha imprevisível (a
    // rede) acontece depois — e essa é avisada.
    let vEp = { ok: true };
    if (!editando) {
      vEp = podeAbrirEpisodio({ prontuario: dados.prontuario, episodiosAbertos: await episodiosAbertosDe(dados.prontuario) });
      if (!vEp.ok) { alert("⚠ " + vEp.erros.join(" ")); return; }
    }
    // Se o leito passou por higienização antes desta internação, fecha o ciclo de turnover.
    if (!editando && leito.disp_em) {
      await registrarTurnoverRemote(sb, { leito: leito.identificacao, solic_em: dados.solic_em || null, disp_em: leito.disp_em, pronto_em: leito.pronto_em || null, entrada_em: now }, currentUser);
    }
    await salvarLeito({
      identificacao: leito.identificacao, status: "ocupado", interdicao_motivo: null,
      iniciais: dados.iniciais, prontuario: dados.prontuario, motivo: dados.motivo, cid: dados.cid,
      data_internacao: dados.data_internacao, dias_previstos: dados.dias_previstos,
      entrada_em: editando ? (leito.entrada_em || now) : now,
      solic_em: null, disp_em: null, pronto_em: null,
      ...(editando ? {} : { alta_pendencias: null, alta_periodo: null }),
    });
    registrarAuditoria(sb, currentUser, editando ? "editar internação" : "internar", leito.identificacao, { cid: dados.cid });

    // O leito já está ocupado — o paciente aparece no mapa. Se o episódio
    // falhar aqui, é falha de rede, e o aviso diz o estado e o caminho de
    // volta em vez de deixar o buraco silencioso.
    if (!editando) {
      const r = await abrirEpisodio(sb, dadosDoEpisodio(leito, dados), currentUser).catch(() => null);
      if (!Array.isArray(r) || !r.length) {
        alert("⚠ " + avisoEpisodioNaoAberto({ leito: leito.identificacao }));
      } else {
        registrarAuditoria(sb, currentUser, "abrir prontuário da internação", `${leito.identificacao} · reg. ${dados.prontuario}`, {});
      }
    }
    setModal(null);
  }
  /**
   * Fecha o episódio do paciente que está saindo do leito.
   *
   * ⚠️ Não bloqueia a alta se falhar. O paciente saiu de verdade e o leito
   * precisa girar; episódio aberto com leito vazio é situação VISÍVEL (o
   * Paciente 360 mostra internação aberta sem leito) e corrigível. Travar a
   * alta por causa disso prenderia o leito por um problema de registro.
   */
  async function fecharEpisodioDoLeito(leito, desfechoLeito) {
    const abertos = await episodiosAbertosDe(leito.prontuario);
    if (!abertos.length) return;
    const r = await encerrarEpisodio(sb, abertos[0],
      { desfecho: desfechoDoLeito(desfechoLeito) }, currentUser).catch(() => null);
    if (!Array.isArray(r) || !r.length) {
      alert(`A saída do leito ${leito.identificacao} foi registrada, mas o prontuário da internação continua ABERTO. Ele aparece no Paciente 360 como internação sem leito — encerre por lá.`);
    }
  }

  async function encerrarLeito(leito, desfecho) {
    const obito = desfecho === "obito";
    if (!confirm(obito
      ? `Registrar ÓBITO do paciente do leito ${leito.identificacao}? O leito vai para HIGIENIZAÇÃO.`
      : `Dar alta do paciente do leito ${leito.identificacao}? O leito vai para HIGIENIZAÇÃO.`)) return;
    const now = nowISO();
    const dias = leito.data_internacao ? Math.max(0, Math.round((new Date(todayStr() + "T00:00:00") - new Date(leito.data_internacao + "T00:00:00")) / 86400000)) : null;
    await registrarSaidaRemote(sb, {
      leito: leito.identificacao, iniciais: leito.iniciais, prontuario: leito.prontuario, cid: leito.cid,
      motivo: leito.motivo, data_internacao: leito.data_internacao, data_alta: todayStr(),
      disp_em: now, dias_permanencia: dias, desfecho, setor: leito.setor || null,
    }, currentUser);
    await salvarLeito({
      identificacao: leito.identificacao, status: "higienizacao", disp_em: now, pronto_em: null, solic_em: null, entrada_em: null,
      iniciais: null, prontuario: null, motivo: null, cid: null, data_internacao: null, dias_previstos: null, interdicao_motivo: null,
      alta_pendencias: null, alta_periodo: null,
    });
    registrarAuditoria(sb, currentUser, obito ? "óbito no leito" : "dar alta", leito.identificacao, {});
    await fecharEpisodioDoLeito(leito, desfecho);
  }
  const darAlta = leito => encerrarLeito(leito, "alta");
  // Kanban de alta segura: marca/desmarca uma pendência e define o turno previsto
  async function toggleAltaItem(leito, key) {
    let m = {}; try { m = JSON.parse(leito.alta_pendencias || "{}"); } catch {}
    m[key] = !m[key];
    await salvarLeito({ identificacao: leito.identificacao, alta_pendencias: JSON.stringify(m) });
  }
  async function setAltaPeriodo(leito, periodo) {
    await salvarLeito({ identificacao: leito.identificacao, alta_periodo: periodo || null });
  }
  async function transferirExterna(leito) {
    const destino = prompt(`Transferência externa do leito ${leito.identificacao} — destino (Gerint / hospital):`, "");
    if (destino === null) return;
    if (!confirm(`Confirmar transferência externa do paciente do leito ${leito.identificacao}? O leito vai para HIGIENIZAÇÃO.`)) return;
    const now = nowISO();
    const dias = leito.data_internacao ? Math.max(0, Math.round((new Date(todayStr() + "T00:00:00") - new Date(leito.data_internacao + "T00:00:00")) / 86400000)) : null;
    await registrarSaidaRemote(sb, {
      leito: leito.identificacao, iniciais: leito.iniciais, prontuario: leito.prontuario, cid: leito.cid,
      motivo: destino.trim() ? "Transf.: " + destino.trim() : (leito.motivo || null),
      data_internacao: leito.data_internacao, data_alta: todayStr(),
      disp_em: now, dias_permanencia: dias, desfecho: "transferencia", setor: leito.setor || null,
    }, currentUser);
    await salvarLeito({
      identificacao: leito.identificacao, status: "higienizacao", disp_em: now, pronto_em: null, solic_em: null, entrada_em: null,
      iniciais: null, prontuario: null, motivo: null, cid: null, data_internacao: null, dias_previstos: null, interdicao_motivo: null,
      alta_pendencias: null, alta_periodo: null,
    });
    registrarAuditoria(sb, currentUser, "transferência externa", `${leito.identificacao} → ${destino.trim() || "?"}`, {});
    await fecharEpisodioDoLeito(leito, "transferencia");
  }
  async function marcarPronto(leito) {
    await salvarLeito({ identificacao: leito.identificacao, status: "livre", pronto_em: nowISO() });
    registrarAuditoria(sb, currentUser, "leito pronto", leito.identificacao, {});
  }
  async function salvarTempos(leito, campos) {
    await salvarLeito({ identificacao: leito.identificacao, ...campos });
    setTempos(null);
  }
  // Indisponibiliza o leito (interdição, manutenção ou bloqueio externo) com motivo
  async function indisponibilizar(leito, status, rotulo) {
    const motivo = prompt(`Motivo (${rotulo}) do leito ${leito.identificacao}:`, leito.interdicao_motivo || "");
    if (motivo === null) return;
    await salvarLeito({ identificacao: leito.identificacao, status, interdicao_motivo: motivo, iniciais: null, prontuario: null, motivo: null, cid: null, data_internacao: null, dias_previstos: null, solic_em: null, disp_em: null, pronto_em: null, entrada_em: null });
    registrarAuditoria(sb, currentUser, `${rotulo.toLowerCase()} de leito`, leito.identificacao, { motivo });
  }
  const interditar = leito => indisponibilizar(leito, "interditado", "Interdição");
  async function reservar(leito) {
    const obs = prompt(`Reservar o leito ${leito.identificacao} — para quem / observação:`, leito.motivo || "");
    if (obs === null) return;
    await salvarLeito({ identificacao: leito.identificacao, status: "reservado", motivo: obs || null, interdicao_motivo: null });
    registrarAuditoria(sb, currentUser, "reservar leito", leito.identificacao, {});
  }
  async function liberar(leito) {
    await salvarLeito({ identificacao: leito.identificacao, status: "livre", interdicao_motivo: null, motivo: null, iniciais: null, prontuario: null, solic_em: null });
    registrarAuditoria(sb, currentUser, "liberar leito", leito.identificacao, {});
  }
  async function removerLeito(leito) {
    if (!confirm(`Remover o leito ${leito.identificacao} do cadastro?`)) return;
    persist(loadLeitos().filter(l => l.identificacao !== leito.identificacao));
    await deleteLeitoRemote(sb, leito.identificacao);
    registrarAuditoria(sb, currentUser, "remover leito", leito.identificacao, {});
  }

  const ordenados = [...leitos].sort((a, b) => a.identificacao.localeCompare(b.identificacao, "pt-BR", { numeric: true }));
  const total = leitos.length;
  const ocupados = leitos.filter(l => l.status === "ocupado").length;
  const livres = leitos.filter(l => l.status === "livre").length;
  const higienizando = leitos.filter(l => l.status === "higienizacao").length;
  const reservados = leitos.filter(l => l.status === "reservado").length;
  const foraOperacao = leitos.filter(l => LEITO_FORA_OPERACAO.includes(l.status)).length;
  const operacionais = total - foraOperacao;
  const ocupacao = operacionais > 0 ? Math.round((ocupados / operacionais) * 100) : 0;
  const sinais = leitos.filter(l => l.status === "ocupado").map(l => sinalLeito(l.data_internacao, l.dias_previstos));
  const amarelos = sinais.filter(s => s.restam !== null && s.restam >= 0 && s.restam <= 1).length;
  const vermelhos = sinais.filter(s => s.restam !== null && s.restam < 0).length;

  // ── KPIs do mês (dashboard) ──
  const hoje2 = new Date();
  const mesA = hoje2.getMonth(), anoA = hoje2.getFullYear();
  const dAnt = new Date(anoA, mesA - 1, 1); const mesAnt = dAnt.getMonth(), anoAnt = dAnt.getFullYear();
  const inMesData = (dstr, m, y) => { if (!dstr) return false; const d = new Date(dstr + "T00:00:00"); return d.getMonth() === m && d.getFullYear() === y; };
  const inMesISO = (iso, m, y) => { if (!iso) return false; const d = new Date(iso); return d.getMonth() === m && d.getFullYear() === y; };
  const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
  const sMes = saidas.filter(s => inMesData(s.data_alta, mesA, anoA));
  const sMesAnterior = saidas.filter(s => inMesData(s.data_alta, mesAnt, anoAnt));
  const permVals = sMes.map(s => s.dias_permanencia != null ? s.dias_permanencia
      : (s.data_internacao && s.data_alta ? Math.max(0, Math.round((new Date(s.data_alta + "T00:00:00") - new Date(s.data_internacao + "T00:00:00")) / 86400000)) : null)).filter(v => v != null);
  const permMedia = permVals.length ? permVals.reduce((a, b) => a + b, 0) / permVals.length : null;
  const giroAtual = operacionais > 0 ? sMes.length / operacionais : null;
  const giroAnterior = operacionais > 0 ? sMesAnterior.length / operacionais : null;
  const giroDelta = giroAnterior ? ((giroAtual - giroAnterior) / giroAnterior) * 100 : null;
  // Fator de utilização ≈ paciente-dia ÷ leito-dia no mês corrente (aproximado)
  const mesIni = new Date(anoA, mesA, 1);
  const diasDecorridos = Math.max(1, Math.ceil((hoje2 - mesIni) / 86400000));
  let pacDias = 0;
  sMes.forEach(s => { const alta = new Date(s.data_alta + "T00:00:00"); const dint = s.data_internacao ? new Date(s.data_internacao + "T00:00:00") : alta; const ini = dint > mesIni ? dint : mesIni; pacDias += Math.max(1, Math.round((alta - ini) / 86400000)); });
  leitos.filter(l => l.status === "ocupado").forEach(l => { const dint = l.data_internacao ? new Date(l.data_internacao + "T00:00:00") : hoje2; const ini = dint > mesIni ? dint : mesIni; pacDias += Math.max(1, Math.round((hoje2 - ini) / 86400000)); });
  const fatorUtil = operacionais > 0 ? Math.min(100, Math.round((pacDias / (operacionais * diasDecorridos)) * 100)) : null;
  // Tempos do giro (ciclos concluídos no mês corrente)
  const tMes = turnover.filter(t => inMesISO(t.entrada_em, mesA, anoA));
  const tSolDisp    = avg(tMes.map(t => diffMin(t.solic_em, t.disp_em)).filter(v => v != null && v >= 0));
  const tDispPronto = avg(tMes.map(t => diffMin(t.disp_em, t.pronto_em)).filter(v => v != null && v >= 0));
  const tProntoEnt  = avg(tMes.map(t => diffMin(t.pronto_em, t.entrada_em)).filter(v => v != null && v >= 0));

  // Agrupamento por setor (mapa + dashboard)
  const grupos = {}; ordenados.forEach(l => { const s = l.setor || "Sem setor"; (grupos[s] = grupos[s] || []).push(l); });
  const nomesGrupos = Object.keys(grupos).sort((a, b) => {
    const oa = a === "Sem setor" ? 999 : ordSetor(a);
    const ob = b === "Sem setor" ? 999 : ordSetor(b);
    return oa - ob || a.localeCompare(b, "pt-BR");
  });

  // ── Listas da Fase 2 ──
  const bq = normTxt(busca);
  const casaBusca = o => !bq || normTxt(`${o.iniciais || ""} ${o.prontuario || ""} ${o.cid || ""}`).includes(bq);
  const internados = leitos.filter(l => l.status === "ocupado")
    .map(l => ({ ...l, sinal: sinalLeito(l.data_internacao, l.dias_previstos) }))
    .filter(casaBusca)
    .sort((a, b) => (a.sinal.restam ?? 9999) - (b.sinal.restam ?? 9999));
  const filaOrd = [...solic].sort((a, b) => new Date(a.hora_pedido || 0) - new Date(b.hora_pedido || 0));
  const saidasOrd = [...saidas].sort((a, b) => (b.data_alta || "").localeCompare(a.data_alta || "") || new Date(b.created_at || 0) - new Date(a.created_at || 0));
  const altasList = saidasOrd.filter(s => s.desfecho !== "transferencia").filter(casaBusca);
  const transfList = saidasOrd.filter(s => s.desfecho === "transferencia").filter(casaBusca);
  const internacoesList = saidasOrd.filter(casaBusca);
  const filaLivresPorSetor = nome => leitos.filter(l => (l.setor || "") === nome && l.status === "livre").length;

  async function cancelarSolic(s) {
    if (!confirm(`Remover ${s.iniciais || "paciente"} da fila de internação?`)) return;
    await updateSolicitacaoRemote(sb, s.id, { status: "cancelada", resolvido_em: nowISO() });
    setSolic(prev => prev.filter(x => x.id !== s.id));
    registrarAuditoria(sb, currentUser, "cancelar solicitação de leito", s.iniciais || "", {});
  }
  // "Estou regulando": o NIR assume o caso — carimba quem/quando (visto_em/
  // visto_por) para separar o pedido novo do que já está sendo regulado e medir
  // o tempo até alguém pegar. Alternável: clicar de novo solta o caso.
  async function marcarRegulando(s) {
    const campos = s.visto_em
      ? { visto_em: null, visto_por: null }
      : { visto_em: nowISO(), visto_por: currentUser?.name || null };
    setSolic(prev => prev.map(x => x.id === s.id ? { ...x, ...campos } : x));
    await updateSolicitacaoRemote(sb, s.id, campos);
    registrarAuditoria(sb, currentUser, s.visto_em ? "soltar regulação de leito" : "assumir regulação de leito", s.iniciais || "", {});
  }
  async function setMotivoEspera(s, motivo) {
    setSolic(prev => prev.map(x => x.id === s.id ? { ...x, motivo_espera: motivo || null } : x));
    await updateSolicitacaoRemote(sb, s.id, { motivo_espera: motivo || null });
  }
  // Gargalos da fila (contagem por motivo de espera)
  const gargalos = Object.entries(MOTIVO_ESPERA).map(([k, v]) => ({ k, v, n: solic.filter(s => s.motivo_espera === k).length })).filter(x => x.n > 0).sort((a, b) => b.n - a.n);

  const Card = ({ label, valor, cor, sub: subTxt }) => (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: cor || "var(--text)", fontFamily: "JetBrains Mono, monospace", marginTop: 4 }}>{valor}</div>
      {subTxt && <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 2 }}>{subTxt}</div>}
    </div>
  );
  const Legenda = () => (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11 }}>
      {Object.entries(STATUS_LEITO).map(([k, v]) => (
        <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--text-3)" }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: v.cor, display: "inline-block" }} />{v.label}
        </span>
      ))}
    </div>
  );

  const navAtual = LEITOS_NAV.find(n => n.key === sub) || LEITOS_NAV[0];
  const subTexto = {
    dashboard: "Visão geral do giro de leitos — ocupação, fila, giro e tempos em tempo real.",
    mapa: "Mapa de leitos em tempo real, agrupado por setor, com previsão de alta e sinaleira.",
    fila: "Solicitações de leito aguardando internação (origem → destino).",
    pacientes: "Pacientes internados agora.",
    risco: "Semáforo de risco de enfermagem por leito — Braden, Morse, flebite e lesão por pressão.",
    "checagem-sae": "Fila da checagem de cuidados (SAE) por leito — pendentes e atrasados da prescrição de enfermagem.",
    altas: "Histórico de altas registradas.",
    transferencias: "Transferências externas (Gerint / outros hospitais).",
    internacoes: "Histórico de internações.",
    indicadores: "Relatórios e indicadores do giro de leitos.",
    alertas: "Alertas automáticos do setor (alta vencida, limpeza demorada, ocupação alta).",
    assistente: "Assistente local para perguntas sobre leitos e giro.",
  };
  const inpBusca = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 11px", color: "var(--text)", fontSize: 13, outline: "none", width: 280, maxWidth: "100%" };
  const ChipDesf = ({ d }) => { const v = DESFECHO_LEITO[d] || DESFECHO_LEITO.alta; return <span style={{ fontSize: 10, fontWeight: 800, color: v.cor, border: `1px solid ${v.cor}66`, borderRadius: 99, padding: "1px 8px", textTransform: "uppercase" }}>{v.label}</span>; };
  const permDe = s => s.dias_permanencia != null ? s.dias_permanencia : (s.data_internacao && s.data_alta ? Math.max(0, Math.round((new Date(s.data_alta + "T00:00:00") - new Date(s.data_internacao + "T00:00:00")) / 86400000)) : null);
  const Vazio = ({ txt }) => <div style={{ background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 10, padding: "2.5rem", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>{txt}</div>;

  // Permanência REAL por CID (só altas) — o sistema aprende com o histórico do hospital
  const realPorCid = {};
  {
    const acc = {};
    saidas.forEach(s => {
      if (!s.cid || (s.desfecho || "alta") !== "alta") return;
      const d = permDe(s); if (d == null) return;
      const k = String(s.cid).trim().toUpperCase();
      (acc[k] = acc[k] || []).push(d);
    });
    Object.entries(acc).forEach(([k, arr]) => { realPorCid[k] = { media: arr.reduce((a, b) => a + b, 0) / arr.length, n: arr.length }; });
  }

  // Previsão de vagas 24/48h por setor (previsão de alta + higienização em curso)
  const prevVagas = nomesGrupos.map(g => {
    const ls = grupos[g];
    const sn = ls.filter(x => x.status === "ocupado").map(x => sinalLeito(x.data_internacao, x.dias_previstos));
    return {
      g,
      hoje: sn.filter(x => x.restam != null && x.restam <= 0).length,
      amanha: sn.filter(x => x.restam === 1).length,
      hig: ls.filter(x => x.status === "higienizacao").length,
    };
  }).filter(x => x.hoje || x.amanha || x.hig);
  const prevHojeSetor = nome => leitos.filter(l => (l.setor || "") === nome && l.status === "ocupado")
    .filter(l => { const s = sinalLeito(l.data_internacao, l.dias_previstos); return s.restam != null && s.restam <= 0; }).length;

  const renderLeitoCard = l => {
            const st = STATUS_LEITO[l.status] || STATUS_LEITO.livre;
            const sinal = l.status === "ocupado" ? sinalLeito(l.data_internacao, l.dias_previstos) : null;
            const borda = sinal ? sinal.cor : st.cor;
            const selCorp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 11, fontFamily: "Inter, sans-serif", outline: "none", maxWidth: "100%", cursor: "pointer" };
            return (
              <div key={l.identificacao} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderTop: `3px solid ${borda}`, borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,.10)", overflow: "hidden" }}>
                <div style={{ padding: "12px 15px 14px" }}>
                  {/* Cabeçalho */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 99, background: st.cor, flexShrink: 0, boxShadow: `0 0 0 3px ${st.cor}22` }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".08em" }}>Leito</span>
                      <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: ".01em", fontFamily: "JetBrains Mono, monospace" }}>{l.identificacao}</span>
                    </div>
                    <span style={{ background: st.bg, color: st.cor, border: `1px solid ${st.cor}44`, borderRadius: 99, padding: "2px 10px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em", whiteSpace: "nowrap" }}>{st.label}</span>
                  </div>

                  {precaucaoDe(l.isolamento) && (
                    <div title={ISOLAMENTOS[l.isolamento].curto} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: ISOLAMENTOS[l.isolamento].bg, color: ISOLAMENTOS[l.isolamento].cor, border: `1px solid ${ISOLAMENTOS[l.isolamento].cor}55`, borderRadius: 99, padding: "2px 10px", fontSize: 10.5, fontWeight: 800, marginTop: 9 }}>
                      Isolamento {ISOLAMENTOS[l.isolamento].label}
                    </div>
                  )}

                  {canEdit ? (
                    <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                      <select value={l.setor || ""} onChange={e => setSetorLeito(l, e.target.value)} style={{ ...selCorp, color: l.setor ? "#60a5fa" : "var(--text-muted)" }}>
                        <option value="">sem setor</option>
                        {setores.map(s => <option key={s.nome} value={s.nome}>{s.nome}</option>)}
                      </select>
                      <select value={l.isolamento || ""} onChange={e => setIsolamentoLeito(l, e.target.value)} title="Marcar leito como isolamento" style={{ ...selCorp, color: precaucaoDe(l.isolamento) ? ISOLAMENTOS[l.isolamento].cor : "var(--text-muted)" }}>
                        <option value="">sem isolamento</option>
                        {Object.entries(ISOLAMENTOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                  ) : l.setor && <div style={{ marginTop: 9, fontSize: 10.5, color: "#60a5fa", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>{l.setor}</div>}

                  <div style={{ height: 1, background: "var(--border)", margin: "11px 0" }} />

                  {l.status === "ocupado" && (
                    <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.55 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>{l.iniciais}{l.prontuario ? <span style={{ color: "var(--text-muted)", fontWeight: 500, fontSize: 12 }}> · reg. {l.prontuario}</span> : ""}</div>
                      {(l.cid || l.motivo) && <div style={{ color: "var(--text-3)", marginTop: 3 }}>{l.cid ? `CID ${l.cid}` : ""}{l.cid && l.motivo ? " · " : ""}{l.motivo || ""}</div>}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Internado {l.data_internacao ? new Date(l.data_internacao + "T00:00:00").toLocaleDateString("pt-BR") : "—"}{l.dias_previstos ? ` · ${l.dias_previstos}d prev.` : ""}</span>
                        {sinal && <span style={{ fontSize: 10.5, fontWeight: 800, color: sinal.cor, background: sinal.cor + "1a", border: `1px solid ${sinal.cor}44`, borderRadius: 99, padding: "1px 9px", whiteSpace: "nowrap" }}>{sinal.texto}</span>}
                      </div>
                    </div>
                  )}
                  {l.status === "livre" && (
                    <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                      Disponível para internação.
                      {l.pronto_em && <div style={{ color: "#34d399", marginTop: 3, fontWeight: 600 }}>Pronto desde {horaFmt(l.pronto_em)}</div>}
                    </div>
                  )}
                  {l.status === "higienizacao" && (
                    <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.6 }}>
                      <div style={{ fontWeight: 600 }}>Em higienização</div>
                      <div style={{ color: "var(--text-muted)", marginTop: 2 }}>Vagou às {horaFmt(l.disp_em)}</div>
                      <div style={{ marginTop: 5, display: "inline-block", color: "#fbbf24", fontWeight: 800, fontSize: 11, background: "#fbbf241a", border: "1px solid #fbbf2444", borderRadius: 99, padding: "1px 9px" }}>Limpando há {fmtDur(diffMin(l.disp_em, nowISO()))}</div>
                    </div>
                  )}
                  {l.status === "interditado" && <div style={{ fontSize: 12.5, color: "#fb7185" }}>Interditado{l.interdicao_motivo ? `: ${l.interdicao_motivo}` : ""}</div>}
                  {l.status === "manutencao" && <div style={{ fontSize: 12.5, color: "#f97316" }}>Em manutenção{l.interdicao_motivo ? `: ${l.interdicao_motivo}` : ""}</div>}
                  {l.status === "bloqueado" && <div style={{ fontSize: 12.5, color: "#8d99ab" }}>Bloqueado externo{l.interdicao_motivo ? `: ${l.interdicao_motivo}` : ""}</div>}
                  {l.status === "reservado" && (
                    <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.55 }}>
                      {l.iniciais && <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>{l.iniciais}{l.prontuario ? <span style={{ color: "var(--text-muted)", fontWeight: 500, fontSize: 12 }}> · reg. {l.prontuario}</span> : ""}</div>}
                      <div style={{ color: "#818cf8", marginTop: l.iniciais ? 3 : 0 }}>Reservado{l.motivo ? `: ${l.motivo}` : ""}</div>
                      {l.solic_em && <div style={{ marginTop: 5, display: "inline-block", color: "#818cf8", fontWeight: 800, fontSize: 11, background: "#818cf81a", border: "1px solid #818cf844", borderRadius: 99, padding: "1px 9px" }}>Aguardando chegada há {fmtDur(diffMin(l.solic_em, nowISO()))}</div>}
                    </div>
                  )}

                {canEdit && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 13 }}>
                    {l.status === "livre" && <>
                      <button onClick={() => setModal(l)} style={btnContorno("#22d3ee")}>Internar</button>
                      <button onClick={() => reservar(l)} style={btnContorno("#818cf8")}>Reservar</button>
                      <button onClick={() => interditar(l)} style={btnContorno("#fbbf24")}>Interditar</button>
                      <button onClick={() => indisponibilizar(l, "manutencao", "Manutenção")} style={btnContorno("#f97316")}>Manutenção</button>
                      <button onClick={() => indisponibilizar(l, "bloqueado", "Bloqueio externo")} style={btnContorno("#8d99ab")}>Bloquear ext.</button>
                      <button onClick={() => removerLeito(l)} style={btnContorno("var(--text-muted)")}>Excluir</button>
                    </>}
                    {l.status === "reservado" && <>
                      <button onClick={() => setModal(l)} style={btnContorno("#22d3ee")}>{l.iniciais ? "✓ Chegou — internar" : "Internar"}</button>
                      <button onClick={() => liberar(l)} style={btnContorno("#34d399")}>Liberar</button>
                    </>}
                    {l.status === "ocupado" && <>
                      <button onClick={() => darAlta(l)} style={btnContorno("#34d399")}>Dar alta</button>
                      <button onClick={() => transferirExterna(l)} style={btnContorno("#38bdf8")}>Transferir</button>
                      <button onClick={() => encerrarLeito(l, "obito")} style={btnContorno("#f43f5e")}>Óbito</button>
                      <button onClick={() => setModal(l)} style={btnContorno("var(--text-3)")}>Editar</button>
                    </>}
                    {l.status === "higienizacao" && <>
                      <button onClick={() => marcarPronto(l)} style={btnContorno("#34d399")}>✓ Pronto</button>
                      <button onClick={() => setTempos(l)} style={btnContorno("var(--text-3)")}>Ajustar</button>
                      <button onClick={() => interditar(l)} style={btnContorno("#fb7185")}>Interditar</button>
                    </>}
                    {(l.status === "interditado" || l.status === "manutencao" || l.status === "bloqueado") && <>
                      <button onClick={() => liberar(l)} style={btnContorno("#34d399")}>Liberar</button>
                      <button onClick={() => removerLeito(l)} style={btnContorno("var(--text-muted)")}>Excluir</button>
                    </>}
                  </div>
                )}
                </div>
              </div>
            );
  };

  const secLbl2 = { fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* ── MODO TV: painel de parede somente leitura (Esc para sair) ── */}
      {tv && (() => {
        const alertasTv = leitosAlertas(leitos, solic).slice(0, 6);
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "var(--bg)", padding: "1.25rem 1.75rem", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
              <VxWordmark size={15} />
              <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".08em" }}>Giro de Leitos — Painel</span>
              <span style={{ fontSize: 12, color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 20, padding: "3px 11px" }}>{HOSPITAL_NOME}</span>
              <span style={{ marginLeft: "auto", fontSize: 20, fontWeight: 800, fontFamily: "JetBrains Mono, monospace", color: "var(--text-2)" }}>{new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
              <button onClick={sairTv} style={{ background: "transparent", color: "var(--text-3)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "7px 14px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>✕ Sair (Esc)</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 18 }}>
              <Card label="Ocupação global" valor={ocupacao + "%"} cor={ocupacao >= 90 ? "#f43f5e" : "#22d3ee"} sub={`${ocupados}/${operacionais} operacionais`} />
              <Card label="Livres" valor={livres} cor="#34d399" />
              <Card label="Higienização" valor={higienizando} cor="#fbbf24" />
              <Card label="Fila de internação" valor={solic.length} cor={solic.length ? "#d97706" : "var(--text)"} />
              <Card label="Altas previstas 24h" valor={amarelos} cor={amarelos ? "#fbbf24" : "var(--text)"} sub={vermelhos ? `${vermelhos} vencida(s)` : ""} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2.2fr) minmax(260px, 1fr)", gap: 16, alignItems: "start" }}>
              <div>
                <div style={{ marginBottom: 10 }}><Legenda /></div>
                {nomesGrupos.map(g => {
                  const ls = grupos[g];
                  const oc = ls.filter(x => x.status === "ocupado").length;
                  return (
                    <div key={g} style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 7 }}>{g} <span style={{ color: "var(--text-muted)", fontWeight: 500, fontFamily: "JetBrains Mono, monospace" }}>{oc}/{ls.length}</span></div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {ls.map(l => {
                          const st = STATUS_LEITO[l.status] || STATUS_LEITO.livre;
                          const sinal = l.status === "ocupado" ? sinalLeito(l.data_internacao, l.dias_previstos) : null;
                          return (
                            <div key={l.identificacao} style={{ width: 116, background: "var(--surface)", border: "1px solid var(--border)", borderTop: `3px solid ${sinal ? sinal.cor : st.cor}`, borderRadius: 8, padding: "7px 10px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "JetBrains Mono, monospace" }}>{l.identificacao}</span>
                                <span style={{ width: 8, height: 8, borderRadius: 99, background: st.cor, display: "inline-block" }} />
                              </div>
                              <div style={{ fontSize: 10, color: st.cor, fontWeight: 800, textTransform: "uppercase", marginTop: 1 }}>{st.label}</div>
                              {l.iniciais && <div style={{ fontSize: 11, color: "var(--text-2)", fontWeight: 600, marginTop: 2 }}>{l.iniciais}</div>}
                              {sinal && <div style={{ fontSize: 9.5, color: sinal.cor, fontWeight: 700, marginTop: 1 }}>{sinal.texto}</div>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${VX.turquesa}`, borderRadius: 10, padding: "12px 14px" }}>
                  <div style={secLbl2}>Previsão de vagas — 24/48h</div>
                  {prevVagas.length === 0 ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Sem vagas previstas.</div> : prevVagas.map(x => (
                    <div key={x.g} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 12.5 }}>
                      <span style={{ color: "var(--text-2)", fontWeight: 600 }}>{x.g}</span>
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11.5 }}>
                        {x.hoje > 0 && <span style={{ color: "#34d399", fontWeight: 800 }}>hoje {x.hoje}</span>}
                        {x.amanha > 0 && <span style={{ color: "#fbbf24", fontWeight: 800 }}>{x.hoje > 0 ? " · " : ""}amanhã {x.amanha}</span>}
                        {x.hig > 0 && <span style={{ color: "#22d3ee", fontWeight: 800 }}>{(x.hoje > 0 || x.amanha > 0) ? " · " : ""}limpeza {x.hig}</span>}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${alertasTv.length ? "#f43f5e" : "#34d399"}`, borderRadius: 10, padding: "12px 14px" }}>
                  <div style={secLbl2}>Alertas</div>
                  {alertasTv.length === 0 ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Nenhum alerta. Setor sob controle.</div> : alertasTv.map((a, i) => (
                    <div key={i} style={{ padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: FARM_GRAV[a.gravidade].cor }}>{a.titulo}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{a.detalhe}</div>
                    </div>
                  ))}
                </div>
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={secLbl2}>Fila de internação</div>
                  {filaOrd.length === 0 ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Fila vazia.</div> : filaOrd.slice(0, 6).map(s => (
                    <div key={s.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 12.5 }}>
                      <span style={{ color: "var(--text-2)", fontWeight: 600 }}>{s.iniciais || "—"} → {s.setor_destino || "—"}</span>
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 800, color: (diffMin(s.hora_pedido, nowISO()) || 0) > 240 ? "#f43f5e" : "#d97706" }}>{fmtDur(diffMin(s.hora_pedido, nowISO()))}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 14 }}>Atualiza automaticamente a cada minuto · Valentrax Healthcare Operations</div>
          </div>
        );
      })()}

      {/* BARRA LATERAL DO GIRO DE LEITOS */}
      <nav style={{ width: 194, minWidth: 194, background: "var(--bg-2)", borderRight: "1px solid var(--border)", padding: "1rem 0", overflowY: "auto", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px 12px" }}>
          <Icon name="bed" size={16} /><span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: ".02em", color: VX.turquesa }}>GIRO DE LEITOS</span>
        </div>
        {comGrupos(LEITOS_NAV).map(it => {
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
          <button onClick={entrarTv} title="Painel somente leitura para monitor/TV (sai com Esc)" style={{ background: "transparent", color: "var(--text-2)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 12.5, whiteSpace: "nowrap" }}>Modo TV</button>
        </div>

        {/* ── MAPA DE RISCO (enfermagem) ── */}
        {sub === "risco" && (() => {
          const ocup = leitos.filter(l => l.status === "ocupado" && l.prontuario);
          const linhas = montarMapaRisco(ocup, risco.escalas, risco.lpp);
          const COR = { vermelho: "#f43f5e", laranja: "#fb923c", amarelo: "#f5b301", verde: "#34d399" };
          const th = { textAlign: "left", padding: "8px 12px", color: "var(--text-muted)", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", background: "var(--bg-2)", borderBottom: "1px solid var(--border)" };
          const td = { padding: "9px 12px", borderBottom: "1px solid var(--border)", fontSize: 13 };
          const chip = e => e ? <span style={{ background: `${COR[e.nivel] || "#8891a5"}1f`, color: COR[e.nivel] || "#8891a5", border: `1px solid ${(COR[e.nivel] || "#8891a5")}66`, borderRadius: 999, padding: "1px 9px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{e.classificacao || e.score}</span> : <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>;
          return (
            <div>
              {ocup.length === 0 ? (
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.5rem", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Nenhum leito ocupado — sem risco a mostrar.</div>
              ) : (
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr>{["Leito", "Paciente", "Braden", "Morse", "Flebite", "Lesão por pressão"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {linhas.map(r => (
                        <tr key={r.leito} style={{ boxShadow: `inset 3px 0 0 ${COR[r.pior] || "transparent"}` }}>
                          <td style={{ ...td, fontWeight: 700 }}>{r.leito}{r.setor ? <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> · {r.setor}</span> : ""}</td>
                          <td style={td}>{r.iniciais || "—"}{r.prontuario ? <span style={{ color: "var(--text-muted)", fontSize: 10.5, fontFamily: "JetBrains Mono, monospace" }}> · {r.prontuario}</span> : ""}</td>
                          <td style={td}>{chip(r.braden)}</td>
                          <td style={td}>{chip(r.morse)}</td>
                          <td style={td}>{chip(r.flebite)}</td>
                          <td style={td}>{r.lpp.total ? <span style={{ color: r.lpp.adquiridas ? "#f43f5e" : "#38bdf8", fontWeight: 700, fontSize: 11.5 }}>{r.lpp.adquiridas ? `${r.lpp.adquiridas} adquirida(s)` : `${r.lpp.total} (presente na adm.)`}</span> : <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10, lineHeight: 1.5 }}>Última aplicação de cada escala por leito, ordenado do mais grave ao menos grave. As escalas são registradas no prontuário (Paciente 360 → Escalas). A LPP <strong>adquirida na unidade</strong> puxa o leito para o topo.</div>
            </div>
          );
        })()}

        {/* ── CHECAGEM SAE (cuidados de enfermagem à beira-leito) ── */}
        {sub === "checagem-sae" && (() => {
          const ocup = leitos.filter(l => l.status === "ocupado" && l.prontuario);
          const linhas = montarChecagemSae(ocup, checagemSae.prescricoes, checagemSae.itens, checagemSae.checagens).filter(r => r.temPrescricao);
          const th = { textAlign: "left", padding: "8px 12px", color: "var(--text-muted)", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", background: "var(--bg-2)", borderBottom: "1px solid var(--border)" };
          const td = { padding: "9px 12px", borderBottom: "1px solid var(--border)", fontSize: 13, verticalAlign: "top" };
          const hm = d => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
          const totalAtras = linhas.reduce((s, r) => s + r.atrasados, 0);
          const totalPend = linhas.reduce((s, r) => s + r.pendentes, 0);
          return (
            <div>
              <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                <Card label="Leitos com prescrição" valor={linhas.length} cor="#22d3ee" sub="prescrição de enfermagem vigente" />
                <Card label="Cuidados atrasados" valor={totalAtras} cor={totalAtras ? "#f43f5e" : "#34d399"} sub="passaram do horário previsto" />
                <Card label="Cuidados pendentes" valor={totalPend} cor={totalPend ? "#f5b301" : "var(--text)"} sub="dentro da janela, ainda por checar" />
              </div>
              {linhas.length === 0 ? (
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.5rem", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Nenhum leito com prescrição de enfermagem vigente.</div>
              ) : (
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr>{["Leito", "Paciente", "Cuidados", "Pendentes", "Atrasados", "Cuidados atrasados"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {linhas.map(r => (
                        <tr key={r.leito} style={{ boxShadow: `inset 3px 0 0 ${r.atrasados ? "#f43f5e" : r.pendentes ? "#f5b301" : "#34d399"}` }}>
                          <td style={{ ...td, fontWeight: 700 }}>{r.leito}{r.setor ? <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> · {r.setor}</span> : ""}</td>
                          <td style={td}>{r.iniciais || "—"}{r.prontuario ? <span style={{ color: "var(--text-muted)", fontSize: 10.5, fontFamily: "JetBrains Mono, monospace" }}> · {r.prontuario}</span> : ""}</td>
                          <td style={{ ...td, color: "var(--text-3)" }}>{r.cuidados}</td>
                          <td style={td}>{r.pendentes ? <span style={{ color: "#f5b301", fontWeight: 700 }}>{r.pendentes}</span> : <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                          <td style={td}>{r.atrasados ? <span style={{ color: "#f43f5e", fontWeight: 800 }}>{r.atrasados}</span> : <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                          <td style={td}>{r.atrasadosLista.length ? <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>{r.atrasadosLista.slice(0, 4).map(a => `${hm(a.horario)} ${a.descricao}`).join(" · ")}{r.atrasadosLista.length > 4 ? ` +${r.atrasadosLista.length - 4}` : ""}</span> : <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10, lineHeight: 1.5 }}>Prescrição de enfermagem vigente por leito e o estado da checagem de <strong>hoje</strong>. A checagem é registrada no prontuário (Paciente 360 → SAE → Checagem). Vermelho = há cuidado atrasado.</div>
            </div>
          );
        })()}

        {/* ── DASHBOARD ── */}
        {sub === "dashboard" && (<>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: "1.25rem" }}>
            <Card label="Ocupação global" valor={ocupacao + "%"} cor={ocupacao >= 90 ? "#f43f5e" : "#22d3ee"} sub={`${ocupados}/${operacionais} leitos operacionais`} />
            <Card label="Leitos disponíveis" valor={livres} cor="#34d399" sub={reservados ? `+ ${reservados} reservado(s)` : "prontos para internar"} />
            <Card label="Aguardando internação" valor={solic.length} cor={solic.length ? "#d97706" : "var(--text)"} sub="fila de solicitações de leito" />
            <Card label="Altas previstas 24h" valor={amarelos} cor={amarelos ? "#fbbf24" : "var(--text)"} sub={vermelhos ? `${vermelhos} previsão(ões) vencida(s)` : "pela previsão de alta"} />
            <Card label="Permanência média" valor={permMedia != null ? permMedia.toFixed(1) + "d" : "—"} cor="#3b82f6" sub={`altas de ${MONTHS[mesA]}`} />
            <Card label="Giro de leitos" valor={giroAtual != null ? giroAtual.toFixed(2) : "—"} cor="#2dd4bf" sub={giroDelta != null ? `${giroDelta >= 0 ? "▲ +" : "▼ -"}${Math.abs(giroDelta).toFixed(0)}% vs ${MONTHS[mesAnt]}` : `${MONTHS[mesAnt]}: ${giroAnterior != null ? giroAnterior.toFixed(2) : "—"}`} />
            <Card label="Fator de utilização" valor={fatorUtil != null ? fatorUtil + "%" : "—"} cor="#818cf8" sub="paciente-dia ÷ leito-dia (aprox.)" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(250px, 1fr)", gap: 14, alignItems: "start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                <div style={{ ...secLbl2, marginBottom: 0 }}>Mapa de leitos — tempo real</div>
                <Legenda />
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
                {nomesGrupos.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "1.5rem" }}>Nenhum leito cadastrado. Cadastre no Mapa de leitos.</div>
                ) : nomesGrupos.map(g => (
                  <div key={g} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "5px 0", flexWrap: "wrap" }}>
                    <span style={{ width: 120, fontSize: 11.5, fontWeight: 700, color: "var(--text-3)", paddingTop: 2 }}>{g} <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>{grupos[g].filter(x => x.status === "ocupado").length}/{grupos[g].length}</span></span>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", flex: 1, minWidth: 160 }}>
                      {grupos[g].map(l => { const st = STATUS_LEITO[l.status] || STATUS_LEITO.livre; return (
                        <span key={l.identificacao} onClick={() => setSub("mapa")} title={`${l.identificacao} — ${st.label}${l.iniciais ? " · " + l.iniciais : ""}`} style={{ width: 26, height: 18, borderRadius: 4, background: st.cor + "2e", border: `1.5px solid ${st.cor}`, cursor: "pointer", display: "inline-block" }} />
                      ); })}
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => setSub("mapa")} style={{ marginTop: 10, background: "transparent", color: VX.turquesa, border: `1px solid ${VX.turquesa}55`, borderRadius: 6, padding: "7px 14px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Abrir mapa detalhado →</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${VX.turquesa}`, borderRadius: 10, padding: "12px 14px" }}>
                <div style={secLbl2}>Previsão de vagas — 24/48h</div>
                {prevVagas.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Nenhuma vaga prevista pela previsão de alta. Confira os dias previstos das internações.</div>
                ) : prevVagas.map(x => (
                  <div key={x.g} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 12.5, flexWrap: "wrap" }}>
                    <span style={{ color: "var(--text-2)", fontWeight: 600 }}>{x.g}</span>
                    <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {x.hoje > 0 && <span style={{ fontSize: 10.5, fontWeight: 800, color: "#34d399", background: "#34d3991a", border: "1px solid #34d39944", borderRadius: 99, padding: "1px 8px" }}>hoje: {x.hoje}</span>}
                      {x.amanha > 0 && <span style={{ fontSize: 10.5, fontWeight: 800, color: "#fbbf24", background: "#fbbf241a", border: "1px solid #fbbf2444", borderRadius: 99, padding: "1px 8px" }}>amanhã: {x.amanha}</span>}
                      {x.hig > 0 && <span style={{ fontSize: 10.5, fontWeight: 800, color: "#22d3ee", background: "#22d3ee1a", border: "1px solid #22d3ee44", borderRadius: 99, padding: "1px 8px" }}>em limpeza: {x.hig}</span>}
                    </span>
                  </div>
                ))}
                <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 8 }}>Projeção pela previsão de alta (sinaleira) + leitos em higienização{tDispPronto != null ? ` (limpeza média ${fmtDur(tDispPronto)})` : ""}.</div>
              </div>

              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={secLbl2}>Tempo de giro de leitos ({MONTHS[mesA]})</div>
                {[["Solicitado → Disponibilizado", tSolDisp], ["Disponibilizado → Pronto", tDispPronto], ["Pronto → Entrada", tProntoEnt]].map(([lb, v]) => (
                  <div key={lb} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 12.5 }}>
                    <span style={{ color: "var(--text-2)" }}>{lb}</span>
                    <span style={{ fontWeight: 800, fontFamily: "JetBrains Mono, monospace", color: v != null ? "#fbbf24" : "var(--text-muted)" }}>{fmtDur(v)}</span>
                  </div>
                ))}
                <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 8 }}>{tMes.length} ciclo(s) de giro concluído(s) no mês.</div>
              </div>

              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={secLbl2}>Desempenho por setor</div>
                {nomesGrupos.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Sem setores para mostrar.</div>
                ) : nomesGrupos.map(g => {
                  const ls = grupos[g];
                  const oc = ls.filter(x => x.status === "ocupado").length;
                  const op = ls.filter(x => !LEITO_FORA_OPERACAO.includes(x.status)).length;
                  const pct = op ? Math.round((oc / op) * 100) : 0;
                  return (
                    <div key={g} style={{ marginBottom: 9 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 3 }}>
                        <span style={{ color: "var(--text-2)", fontWeight: 600 }}>{g}</span>
                        <span style={{ color: "var(--text-3)", fontFamily: "JetBrains Mono, monospace" }}>{oc}/{op} · {pct}%</span>
                      </div>
                      <div style={{ height: 6, background: "var(--input-bg)", borderRadius: 99, overflow: "hidden" }}>
                        <div style={{ width: pct + "%", height: "100%", background: pct >= 90 ? "#f43f5e" : pct >= 70 ? "#fbbf24" : "#2dd4bf", borderRadius: 99 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>)}

        {/* ── MAPA DE LEITOS (detalhado, por setor) ── */}
        {sub === "mapa" && (() => {
          const setorAtivo = setorSel === "__todos__" ? null : (setorSel && grupos[setorSel] ? setorSel : nomesGrupos[0]);
          const chipStyle = active => ({ display: "inline-flex", alignItems: "center", gap: 7, background: active ? VX.turquesa : "var(--surface)", color: active ? "#062a26" : "var(--text-2)", border: `1px solid ${active ? VX.turquesa : "var(--border)"}`, borderRadius: 99, padding: "6px 13px", fontSize: 12.5, fontWeight: active ? 800 : 600, cursor: "pointer" });
          const badge = active => ({ fontSize: 10.5, fontFamily: "JetBrains Mono, monospace", background: active ? "#0a3d34" : "var(--input-bg)", color: active ? "#7fe8d8" : "var(--text-muted)", borderRadius: 99, padding: "0 6px" });
          const setorBlock = g => {
            const ls = grupos[g];
            const oc = ls.filter(x => x.status === "ocupado").length;
            const op = ls.filter(x => !LEITO_FORA_OPERACAO.includes(x.status)).length;
            const pct = op ? Math.round((oc / op) * 100) : 0;
            return (
              <div key={g} style={{ marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                  <div style={{ ...secLbl2, marginBottom: 0 }}>{g}</div>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{oc}/{ls.length} ocupados · {pct}%</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 12 }}>
                  {ls.map(renderLeitoCard)}
                </div>
              </div>
            );
          };
          return (
            <>
              <div style={{ marginBottom: 12 }}><Legenda /></div>
              {canEdit && (
                <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
                  <input value={novoLeito} onChange={e => setNovoLeito(e.target.value)} onKeyDown={e => e.key === "Enter" && addLeito()} placeholder="Cadastrar leito (ex.: 101, UTI-1)" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 11px", color: "var(--text)", fontSize: 13, outline: "none", width: 260 }} />
                  <button onClick={addLeito} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Cadastrar leito</button>
                  <button onClick={() => setShowSetores(true)} style={{ background: "transparent", color: "var(--text-2)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13, marginLeft: "auto" }}>Setores</button>
                  <button onClick={() => setShowCidRef(true)} style={{ background: "transparent", color: "var(--text-2)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Referências de CID</button>
                </div>
              )}
              {ordenados.length === 0 ? (
                <div style={{ background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 10, padding: "2.5rem", textAlign: "center", color: "var(--text-muted)" }}>
                  Nenhum leito cadastrado ainda.{canEdit ? " Cadastre o primeiro acima." : ""}
                </div>
              ) : (<>
                {/* Seletor de setor */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: "1.25rem" }}>
                  {nomesGrupos.map(g => {
                    const ls = grupos[g];
                    const oc = ls.filter(x => x.status === "ocupado").length;
                    const op = ls.filter(x => !LEITO_FORA_OPERACAO.includes(x.status)).length;
                    const pct = op ? Math.round((oc / op) * 100) : 0;
                    const active = setorSel !== "__todos__" && setorAtivo === g;
                    const dotCor = pct >= 90 ? "#f43f5e" : pct >= 70 ? "#d97706" : "#2dd4bf";
                    return (
                      <button key={g} onClick={() => setSetorSel(g)} style={chipStyle(active)}>
                        <span style={{ width: 8, height: 8, borderRadius: 99, background: dotCor, display: "inline-block" }} />
                        {g}<span style={badge(active)}>{oc}/{ls.length}</span>
                      </button>
                    );
                  })}
                  <button onClick={() => setSetorSel("__todos__")} style={chipStyle(setorSel === "__todos__")}>Todos os setores<span style={badge(setorSel === "__todos__")}>{ordenados.length}</span></button>
                </div>
                {setorSel === "__todos__" ? nomesGrupos.map(setorBlock) : (setorAtivo ? setorBlock(setorAtivo) : null)}
              </>)}
            </>
          );
        })()}

        {/* ── FILA DE INTERNAÇÃO ── */}
        {sub === "fila" && (
          filaOrd.length === 0 ? <Vazio txt="Nenhuma solicitação de leito aguardando. A fila é alimentada pelo desfecho 'Internação' no Pronto-Socorro e pelo Centro de Monitoramento." /> : (<>
            {gargalos.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>Gargalos:</span>
                {gargalos.map(g => <span key={g.k} style={{ fontSize: 11.5, fontWeight: 700, color: g.v.cor, background: g.v.cor + "18", border: `1px solid ${g.v.cor}44`, borderRadius: 99, padding: "2px 9px" }}>{g.v.label}: {g.n}</span>)}
              </div>
            )}
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10 }}>
              {filaOrd.length} aguardando · {filaOrd.filter(x => !x.visto_em).length} sem ninguém regulando
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filaOrd.map(s => {
                const espera = diffMin(s.hora_pedido, nowISO());
                const urg = corEsperaFila(espera);
                const livres = s.setor_destino ? filaLivresPorSetor(s.setor_destino) : 0;
                const mv = s.motivo_espera ? MOTIVO_ESPERA[s.motivo_espera] : null;
                return (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${urg.cor}`, borderRadius: 9, padding: "10px 14px", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>
                        {s.iniciais || "—"}
                        {s.ps_atendimento_id && <span style={{ fontSize: 10, fontWeight: 700, color: VX.azul, background: VX.azul + "18", border: `1px solid ${VX.azul}44`, borderRadius: 99, padding: "1px 7px" }}>veio do PS</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{s.setor_origem || "—"} → <strong style={{ color: "var(--text-2)" }}>{s.setor_destino || "—"}</strong>{s.setor_destino ? ` · ${livres} livre(s) agora · ${prevHojeSetor(s.setor_destino)} vaga(s) prevista(s) hoje` : ""}</div>
                      <div style={{ marginTop: 6 }}>
                        {canEdit ? (
                          <select value={s.motivo_espera || ""} onChange={e => setMotivoEspera(s, e.target.value)} title="Motivo da espera (gargalo)" style={{ background: "var(--input-bg)", border: `1px solid ${mv ? mv.cor + "66" : "var(--border)"}`, borderRadius: 5, padding: "2px 7px", color: mv ? mv.cor : "var(--text-muted)", fontSize: 11, fontFamily: "Inter, sans-serif", outline: "none", cursor: "pointer", fontWeight: mv ? 700 : 400 }}>
                            <option value="">motivo da espera…</option>
                            {Object.entries(MOTIVO_ESPERA).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                        ) : mv && <span style={{ fontSize: 11, fontWeight: 700, color: mv.cor, background: mv.cor + "18", border: `1px solid ${mv.cor}44`, borderRadius: 99, padding: "1px 8px" }}>{mv.label}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "JetBrains Mono, monospace", color: urg.cor }}>{fmtDur(espera)}</div>
                      <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>espera desde {horaFmt(s.hora_pedido)}</div>
                    </div>
                    {s.visto_em ? (
                      <span onClick={() => canEdit && marcarRegulando(s)} title={canEdit ? "Em regulação — clique para soltar o caso" : undefined} style={{ fontSize: 11, fontWeight: 700, color: "#34d399", background: "#34d39918", border: "1px solid #34d39955", borderRadius: 99, padding: "3px 10px", cursor: canEdit ? "pointer" : "default", whiteSpace: "nowrap" }}>em regulação{s.visto_por ? ` · ${s.visto_por}` : ""}</span>
                    ) : canEdit ? (
                      <button onClick={() => marcarRegulando(s)} style={btnContorno(VX.azul)}>Estou regulando</button>
                    ) : null}
                    {canEdit && <button onClick={() => cancelarSolic(s)} style={btnContorno("var(--text-muted)")}>Remover</button>}
                  </div>
                );
              })}
            </div>
          </>)
        )}

        {/* ── PACIENTES (censo atual) ── */}
        {sub === "pacientes" && (<>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por iniciais, prontuário ou CID…" style={{ ...inpBusca, marginBottom: 14 }} />
          {internados.length === 0 ? <Vazio txt={bq ? "Nenhum paciente bate com a busca." : "Nenhum paciente internado no momento."} /> : (
            <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 640 }}>
                <thead><tr>{["Paciente", "Leito", "Setor", "CID / motivo", "Internação", "Previsão"].map(h => <th key={h} style={{ padding: "9px 12px", textAlign: "left", color: "var(--text-muted)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", borderBottom: "1px solid var(--border)", background: "var(--bg-2)" }}>{h}</th>)}</tr></thead>
                <tbody>
                  {internados.map(l => (
                    <tr key={l.identificacao} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "9px 12px", fontWeight: 600 }}>{l.iniciais}{l.prontuario ? <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> · {l.prontuario}</span> : ""}</td>
                      <td style={{ padding: "9px 12px", fontFamily: "JetBrains Mono, monospace", color: "var(--text-2)" }}>{l.identificacao}</td>
                      <td style={{ padding: "9px 12px", color: "var(--text-3)" }}>{l.setor || "—"}</td>
                      <td style={{ padding: "9px 12px", color: "var(--text-3)" }}>{l.cid ? `CID ${l.cid}` : ""}{l.cid && l.motivo ? " · " : ""}{l.motivo || (!l.cid ? "—" : "")}</td>
                      <td style={{ padding: "9px 12px", color: "var(--text-3)" }}>{l.data_internacao ? new Date(l.data_internacao + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                      <td style={{ padding: "9px 12px" }}>{l.sinal ? <span style={{ color: l.sinal.cor, fontWeight: 700, fontSize: 12 }}>{l.sinal.texto}</span> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>)}

        {/* ── ALTA SEGURA (Kanban de alta) ── */}
        {sub === "kanban" && (() => {
          const total = ALTA_ITENS.length;
          const withState = internados.map(l => {
            let m = {}; try { m = JSON.parse(l.alta_pendencias || "{}"); } catch {}
            const done = ALTA_ITENS.filter(i => m[i.key]).length;
            return { l, m, done, col: done === 0 ? 0 : done === total ? 2 : 1 };
          });
          const cols = [
            { key: 0, titulo: "Internado", cor: "#8d99ab", sub: "sem preparo de alta iniciado" },
            { key: 1, titulo: "Preparando alta", cor: "#fbbf24", sub: "com pendências" },
            { key: 2, titulo: "Pronto para alta", cor: "#34d399", sub: "checklist concluído" },
          ];
          return (
            <>
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por iniciais, prontuário ou CID…" style={{ ...inpBusca, marginBottom: 14 }} />
              {internados.length === 0 ? <Vazio txt={bq ? "Nenhum paciente bate com a busca." : "Nenhum paciente internado no momento."} /> : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(240px, 1fr))", gap: 12, alignItems: "start", overflowX: "auto" }}>
                  {cols.map(c => {
                    const items = withState.filter(x => x.col === c.key);
                    return (
                      <div key={c.key} style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderTop: `3px solid ${c.cor}`, borderRadius: 10, padding: 10, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 800, color: c.cor, textTransform: "uppercase", letterSpacing: ".05em" }}>{c.titulo}</span>
                          <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--text-muted)" }}>{items.length}</span>
                        </div>
                        <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginBottom: 10 }}>{c.sub}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {items.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: "12px 0" }}>—</div>}
                          {items.map(({ l, m, done }) => (
                            <div key={l.identificacao} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 9, padding: "9px 11px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 13, fontWeight: 700 }}>{l.iniciais || "—"}</span>
                                <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--text-2)" }}>Leito {l.identificacao}</span>
                              </div>
                              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>{l.setor || "sem setor"}{l.cid ? ` · CID ${l.cid}` : ""}</div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                                {l.sinal && <span style={{ fontSize: 10, fontWeight: 700, color: l.sinal.cor, background: l.sinal.cor + "1a", border: `1px solid ${l.sinal.cor}44`, borderRadius: 99, padding: "1px 8px" }}>{l.sinal.texto}</span>}
                                {canEdit ? (
                                  <select value={l.alta_periodo || ""} onChange={e => setAltaPeriodo(l, e.target.value)} title="Turno previsto para a alta" style={{ background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 5, padding: "1px 5px", color: l.alta_periodo ? "var(--text-2)" : "var(--text-muted)", fontSize: 10.5, fontFamily: "Inter, sans-serif", outline: "none", cursor: "pointer" }}>
                                    <option value="">turno…</option>
                                    {Object.entries(ALTA_PERIODOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                  </select>
                                ) : l.alta_periodo && <span style={{ fontSize: 10.5, color: "var(--text-3)" }}>{ALTA_PERIODOS[l.alta_periodo]}</span>}
                              </div>
                              <div style={{ height: 1, background: "var(--border)", margin: "8px 0" }} />
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                {ALTA_ITENS.map(it => { const ok = !!m[it.key]; return (
                                  <button key={it.key} onClick={() => canEdit && toggleAltaItem(l, it.key)} disabled={!canEdit} title={ok ? "Resolvido — clique para reabrir" : "Pendente — clique para marcar resolvido"} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: ok ? "#34d39918" : "transparent", color: ok ? "#34d399" : "var(--text-muted)", border: `1px solid ${ok ? "#34d39955" : "var(--border)"}`, borderRadius: 99, padding: "2px 8px", fontSize: 10.5, fontWeight: 700, cursor: canEdit ? "pointer" : "default" }}>
                                    {ok ? "✓" : "○"} {it.label}
                                  </button>
                                ); })}
                              </div>
                              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>{done}/{total} resolvidos</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 14, lineHeight: 1.5 }}>Marque cada pendência conforme resolve. O paciente anda para a direita sozinho; ao concluir o checklist, entra em <strong>Pronto para alta</strong> — aí dê a alta no Mapa de leitos. O turno previsto ajuda a planejar a alta pela manhã.</div>
            </>
          );
        })()}

        {/* ── ALTAS ── */}
        {sub === "altas" && (<>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por iniciais, prontuário ou CID…" style={{ ...inpBusca, marginBottom: 14 }} />
          {altasList.length === 0 ? <Vazio txt={bq ? "Nenhuma alta bate com a busca." : "Nenhuma alta registrada ainda."} /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {altasList.slice(0, 200).map(s => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 9, padding: "9px 13px", flexWrap: "wrap" }}>
                  <ChipDesf d={s.desfecho} />
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{s.iniciais || "—"}</span>{s.prontuario ? <span style={{ color: "var(--text-muted)", fontSize: 12 }}> · {s.prontuario}</span> : ""}
                    <span style={{ color: "var(--text-3)", fontSize: 12 }}>  ·  leito {s.leito || "—"}{s.cid ? ` · CID ${s.cid}` : ""}</span>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 12, color: "var(--text-muted)" }}>
                    <div>{s.data_alta ? new Date(s.data_alta + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</div>
                    <div style={{ fontSize: 11 }}>{permDe(s) != null ? `${permDe(s)}d de permanência` : ""}</div>
                  </div>
                </div>
              ))}
              {altasList.length > 200 && <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginTop: 4 }}>Mostrando as 200 mais recentes de {altasList.length}.</div>}
            </div>
          )}
        </>)}

        {/* ── TRANSFERÊNCIAS EXTERNAS ── */}
        {sub === "transferencias" && (<>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>Para registrar uma transferência, use o botão <strong>Transferir</strong> no card de um leito ocupado (Mapa de leitos).</div>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por iniciais, prontuário ou destino…" style={{ ...inpBusca, marginBottom: 14 }} />
          {transfList.length === 0 ? <Vazio txt={bq ? "Nenhuma transferência bate com a busca." : "Nenhuma transferência externa registrada ainda."} /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {transfList.slice(0, 200).map(s => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", border: "1px solid var(--border)", borderLeft: "4px solid #38bdf8", borderRadius: 9, padding: "9px 13px", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{s.iniciais || "—"}</span>{s.prontuario ? <span style={{ color: "var(--text-muted)", fontSize: 12 }}> · {s.prontuario}</span> : ""}
                    <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>leito {s.leito || "—"}{s.cid ? ` · CID ${s.cid}` : ""}{s.motivo ? ` · ${s.motivo}` : ""}</div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 12, color: "var(--text-muted)" }}>
                    <div>{s.data_alta ? new Date(s.data_alta + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</div>
                    <div style={{ fontSize: 11 }}>{permDe(s) != null ? `${permDe(s)}d internado` : ""}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>)}

        {/* ── INTERNAÇÕES (histórico) ── */}
        {sub === "internacoes" && (<>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por iniciais, prontuário ou CID…" style={{ ...inpBusca, marginBottom: 14 }} />
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10 }}>{internados.length} internação(ões) em curso · {internacoesList.length} concluída(s) no histórico.</div>
          {internacoesList.length === 0 ? <Vazio txt={bq ? "Nenhuma internação bate com a busca." : "Nenhuma internação concluída no histórico ainda."} /> : (
            <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 680 }}>
                <thead><tr>{["Paciente", "Leito", "CID", "Internação", "Saída", "Permanência", "Desfecho"].map(h => <th key={h} style={{ padding: "9px 12px", textAlign: "left", color: "var(--text-muted)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", borderBottom: "1px solid var(--border)", background: "var(--bg-2)" }}>{h}</th>)}</tr></thead>
                <tbody>
                  {internacoesList.slice(0, 200).map(s => (
                    <tr key={s.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "9px 12px", fontWeight: 600 }}>{s.iniciais || "—"}{s.prontuario ? <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> · {s.prontuario}</span> : ""}</td>
                      <td style={{ padding: "9px 12px", fontFamily: "JetBrains Mono, monospace", color: "var(--text-2)" }}>{s.leito || "—"}</td>
                      <td style={{ padding: "9px 12px", color: "var(--text-3)" }}>{s.cid || "—"}</td>
                      <td style={{ padding: "9px 12px", color: "var(--text-3)" }}>{s.data_internacao ? new Date(s.data_internacao + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                      <td style={{ padding: "9px 12px", color: "var(--text-3)" }}>{s.data_alta ? new Date(s.data_alta + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                      <td style={{ padding: "9px 12px", fontFamily: "JetBrains Mono, monospace", color: "var(--text-2)" }}>{permDe(s) != null ? `${permDe(s)}d` : "—"}</td>
                      <td style={{ padding: "9px 12px" }}><ChipDesf d={s.desfecho} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>)}

        {/* ── RELATÓRIOS & BI (Fase 3) ── */}
        {sub === "indicadores" && <LeitosBIView leitos={leitos} saidas={saidas} turnover={turnover} operacionais={operacionais} setores={setores} />}

        {/* ── ALERTAS INTELIGENTES + IA ASSISTENTE (Fase 4) ── */}
        {sub === "alertas" && <LeitosAlertasView leitos={leitos} solic={solic} />}
        {sub === "assistente" && <LeitosAssistenteView leitos={leitos} solic={solic} saidas={saidas} turnover={turnover} operacionais={operacionais} />}

        {modal && <InternarModal leito={modal} refs={cidRef} realPorCid={realPorCid} onClose={() => setModal(null)} onSave={dados => internar(modal, dados)} />}
        {tempos && <TemposModal leito={tempos} onClose={() => setTempos(null)} onSave={campos => salvarTempos(tempos, campos)} />}
        {showCidRef && <CidRefModal refs={cidRef} onClose={() => setShowCidRef(false)} onSave={salvarCidRef} onDelete={removerCidRef} />}
        {showSetores && <SetoresModal setores={setores} leitos={leitos} onClose={() => setShowSetores(false)} onSave={salvarSetor} onDelete={removerSetor} />}
        {showIndic && <IndicadoresModal sb={sb} leitos={leitos} onClose={() => setShowIndic(false)} />}
      </div>
    </div>
  );
}

// Ajuste dos horários do fluxo do leito (disponibilizado / pronto)
function TemposModal({ leito, onClose, onSave }) {
  const [disp, setDisp] = useState(isoToLocal(leito.disp_em));
  const [pronto, setPronto] = useState(isoToLocal(leito.pronto_em));
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 11px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", flex: 1, boxSizing: "border-box" };
  const lbl = { fontSize: 11, fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 5 };
  const agora = () => isoToLocal(nowISO());
  const btnAgora = { background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 12px", color: "#22d3ee", cursor: "pointer", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" };
  const limpeza = diffMin(localToIso(disp), localToIso(pronto));
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 440, maxWidth: "92vw" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>Tempos do leito {leito.identificacao}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 18 }}>Ajuste se registrou fora do horário real.</div>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Disponibilizado (paciente vagou)</label>
          <div style={{ display: "flex", gap: 8 }}><input type="datetime-local" value={disp} onChange={e => setDisp(e.target.value)} style={inp} /><button onClick={() => setDisp(agora())} style={btnAgora}>agora</button></div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Pronto (higienização concluída)</label>
          <div style={{ display: "flex", gap: 8 }}><input type="datetime-local" value={pronto} onChange={e => setPronto(e.target.value)} style={inp} /><button onClick={() => setPronto(agora())} style={btnAgora}>agora</button></div>
        </div>
        <div style={{ background: "var(--input-bg)", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#fbbf24", fontWeight: 700, marginBottom: 18 }}>Tempo de higienização: {fmtDur(limpeza)}</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={() => onSave({ disp_em: localToIso(disp), pronto_em: localToIso(pronto) })} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

// Painel de indicadores de rotatividade (por mês)
function IndicadoresModal({ sb, leitos, onClose }) {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth());
  const [ano, setAno] = useState(now.getFullYear());
  const [saidas, setSaidas] = useState(null);
  const [turnover, setTurnover] = useState(null);
  useEffect(() => { loadSaidas(sb).then(r => r && setSaidas(r)); loadTurnover(sb).then(r => r && setTurnover(r)); }, []);

  const inMesISO  = iso  => { if (!iso) return false; const d = new Date(iso); return d.getMonth() === mes && d.getFullYear() === ano; };
  const inMesData = dstr => { if (!dstr) return false; const d = new Date(dstr + "T00:00:00"); return d.getMonth() === mes && d.getFullYear() === ano; };
  const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

  const sPer = (saidas || []).filter(s => inMesData(s.data_alta));
  const altas = sPer.length;
  const permVals = sPer.map(s => s.dias_permanencia != null ? s.dias_permanencia
      : (s.data_internacao && s.data_alta ? Math.max(0, Math.round((new Date(s.data_alta + "T00:00:00") - new Date(s.data_internacao + "T00:00:00")) / 86400000)) : null)).filter(v => v != null);
  const permMedia = permVals.length ? (permVals.reduce((a, b) => a + b, 0) / permVals.length) : null;
  const operacionais = leitos.filter(l => l.status !== "interditado").length;
  const giro = operacionais > 0 ? altas / operacionais : null;

  const tPer = (turnover || []).filter(t => inMesISO(t.entrada_em));
  const higMin = avg(tPer.map(t => diffMin(t.disp_em, t.pronto_em)).filter(v => v != null && v >= 0));
  const subMin = avg(tPer.map(t => diffMin(t.disp_em, t.entrada_em)).filter(v => v != null && v >= 0));
  const solMin = avg(tPer.map(t => diffMin(t.solic_em, t.entrada_em)).filter(v => v != null && v >= 0));
  const carregando = saidas === null || turnover === null;

  const anos = [now.getFullYear(), now.getFullYear() - 1];
  const sel = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px", color: "var(--text)", fontSize: 13, outline: "none", cursor: "pointer" };
  const Metric = ({ label, valor, sub, cor }) => (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: cor || "var(--text)", fontFamily: "JetBrains Mono, monospace", marginTop: 6 }}>{valor}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 620, maxWidth: "94vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Indicadores de Giro de Leitos</div>
          <div style={{ display: "flex", gap: 8 }}>
            <select value={mes} onChange={e => setMes(Number(e.target.value))} style={sel}>{MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}</select>
            <select value={ano} onChange={e => setAno(Number(e.target.value))} style={sel}>{anos.map(a => <option key={a} value={a}>{a}</option>)}</select>
          </div>
        </div>
        {carregando ? (
          <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)" }}>Carregando…</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 14 }}>
              <Metric label="Altas no mês" valor={altas} cor="#22d3ee" />
              <Metric label="Média de permanência" valor={permMedia != null ? permMedia.toFixed(1) : "—"} sub="dias por internação" cor="#3b82f6" />
              <Metric label="Giro de leito" valor={giro != null ? giro.toFixed(2) : "—"} sub="altas ÷ leitos operacionais" cor="#34d399" />
              <Metric label="Higienização média" valor={fmtDur(higMin)} sub="disponibilizado → pronto" cor="#fbbf24" />
              <Metric label="Substituição média" valor={fmtDur(subMin)} sub="vagou → próximo paciente" cor="#fbbf24" />
              <Metric label="Solicitação → entrada" valor={fmtDur(solMin)} sub="quando registrado" cor="#60a5fa" />
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 14, lineHeight: 1.5 }}>
              Baseado nas altas e nos ciclos de leito registrados em {MONTHS[mes]}/{ano}. Os tempos de higienização/substituição aparecem conforme os leitos passam pelo fluxo (alta → higienização → pronto → nova internação).
            </div>
          </>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
