import { useState, useEffect, useCallback, useRef } from "react";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, Legend, ComposedChart, Area
} from "recharts";

// ═══════════════════════════════════════════════════════════
// SUPABASE CONFIG — substitua pelas suas credenciais
// ═══════════════════════════════════════════════════════════
const SUPABASE_URL = typeof window !== "undefined" ? (window.SUPABASE_URL || "") : "";
const SUPABASE_KEY = typeof window !== "undefined" ? (window.SUPABASE_KEY || "") : "";
const USE_SUPABASE = SUPABASE_URL.length > 10 && SUPABASE_KEY.length > 10;

async function sbFetch(path, opts = {}) {
  if (!USE_SUPABASE) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": opts.method === "POST" ? "return=representation" : undefined,
      ...opts.headers,
    },
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

// ═══════════════════════════════════════════════════════════
// DADOS MESTRES
// ═══════════════════════════════════════════════════════════
const SPECS = [
  { id: "cirurgia_geral", label: "Cirurgia Geral", metaM: 360,  metaA: 4320, meta1a: 1320, color: "#22d3ee" },
  { id: "oftalmologia",   label: "Oftalmologia",   metaM: 240,  metaA: 2880, meta1a: 864,  color: "#a78bfa" },
  { id: "ginecologia",    label: "Ginecologia",    metaM: 240,  metaA: 2880, meta1a: 864,  color: "#34d399" },
  { id: "urologia",       label: "Urologia",       metaM: 240,  metaA: 2880, meta1a: 864,  color: "#fbbf24" },
  { id: "ortopedia",      label: "Ortopedia",      metaM: 387,  metaA: 4644, meta1a: 1394, color: "#60a5fa" },
];
const MONTHS      = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MONTHS_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const K = "hnsn_v5";

// ═══════════════════════════════════════════════════════════
// STORAGE — localStorage + Supabase fallback
// ═══════════════════════════════════════════════════════════
const loadDB  = () => { try { return JSON.parse(localStorage.getItem(K) || "{}"); } catch { return {}; } };
const saveDB  = d  => localStorage.setItem(K, JSON.stringify(d));
const todayStr = () => new Date().toISOString().slice(0, 10);

async function saveRecord(date, specId, data, user) {
  const db = loadDB();
  if (!db[date]) db[date] = {};
  db[date][specId] = data;
  saveDB(db);
  // Supabase
  if (USE_SUPABASE) {
    await sbFetch("atendimentos?on_conflict=data,especialidade", {
      method: "POST",
      headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ data: date, especialidade: specId, ...data, usuario: user }),
    });
  }
  // Auditoria
  addAuditLog(user, "salvar", `${date} / ${specId}`, data);
}

// ═══════════════════════════════════════════════════════════
// AUDITORIA
// ═══════════════════════════════════════════════════════════
const AUDIT_KEY = "hnsn_audit_v1";
function loadAudit() { try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || "[]"); } catch { return []; } }
function addAuditLog(user, acao, alvo, dados) {
  const log = loadAudit();
  log.unshift({ ts: new Date().toISOString(), user: user?.name || "?", acao, alvo, dados: JSON.stringify(dados).slice(0, 120) });
  if (log.length > 200) log.splice(200);
  localStorage.setItem(AUDIT_KEY, JSON.stringify(log));
  if (USE_SUPABASE) {
    sbFetch("auditoria", { method: "POST", body: JSON.stringify({ ts: new Date().toISOString(), usuario: user?.name, acao, alvo }) });
  }
}

// ═══════════════════════════════════════════════════════════
// AGGREGATE
// ═══════════════════════════════════════════════════════════
function aggregateMes(db, ano, mes, specId) {
  const prefix = `${ano}-${String(mes + 1).padStart(2, "0")}`;
  let r = { primeiras: 0, retornos: 0, ofertadas: 0, realizadas: 0, livres: 0, emergencias: 0, faltas: 0 };
  Object.entries(db).filter(([d]) => d.startsWith(prefix)).forEach(([, day]) => {
    const s = day[specId]; if (!s) return;
    Object.keys(r).forEach(k => { r[k] += s[k] || 0; });
  });
  return r;
}
function aggregateAno(db, ano, specId) {
  return Array.from({ length: 12 }, (_, m) => {
    const d = aggregateMes(db, ano, m, specId);
    return { mes: m, ...d, total: d.primeiras + d.retornos };
  });
}
// Comparativo mês vs mês anterior e mesmo mês ano anterior
function comparativo(db, ano, mes, specId) {
  const cur  = aggregateMes(db, ano, mes, specId);
  const prev = mes > 0 ? aggregateMes(db, ano, mes - 1, specId) : aggregateMes(db, ano - 1, 11, specId);
  const ly   = aggregateMes(db, ano - 1, mes, specId);
  const total    = cur.primeiras + cur.retornos;
  const prevTotal = prev.primeiras + prev.retornos;
  const lyTotal   = ly.primeiras + ly.retornos;
  return {
    mesAtual: total, mesAnterior: prevTotal, mesAnteriorLabel: mes > 0 ? MONTHS[mes-1] : MONTHS[11],
    mesAnoAnterior: lyTotal, variacaoMes: prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : 0,
    variacaoAno: lyTotal > 0 ? ((total - lyTotal) / lyTotal) * 100 : 0,
  };
}

// ═══════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════
const AUTH_KEY    = "hnsn_users_v1";
const SESSION_KEY = "hnsn_session_v1";
const ROLES = {
  adm_master:   { label: "ADM Master",   color: "#f59e0b", desc: "Acesso total — único que cria usuários, acessa banco e auditoria" },
  adm_silver:   { label: "ADM Silver",   color: "#22d3ee", desc: "Insere dados, importa, auditoria e gera dashboard" },
  analista:     { label: "Analista",     color: "#a78bfa", desc: "Visualiza e gera dashboard para impressão" },
  visualizador: { label: "Visualizador", color: "#5a5a72", desc: "Somente leitura — sem gerar dashboard" },
};
const DEFAULT_USERS = [
  { id: "1", name: "Laura",   username: "laura",   password: "hnsn2025",   role: "adm_master" },
  { id: "2", name: "Diretor", username: "diretor", password: "diretor123", role: "adm_silver" },
];
const loadUsers   = () => { try { const u = localStorage.getItem(AUTH_KEY); return u ? JSON.parse(u) : DEFAULT_USERS; } catch { return DEFAULT_USERS; } };
const saveUsers   = u  => localStorage.setItem(AUTH_KEY, JSON.stringify(u));
const loadSession = () => { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; } };
const saveSession = u  => sessionStorage.setItem(SESSION_KEY, JSON.stringify(u));
const clearSession = () => sessionStorage.removeItem(SESSION_KEY);

// ═══════════════════════════════════════════════════════════
// ALERTAS AUTOMÁTICOS
// ═══════════════════════════════════════════════════════════
function calcAlertas(db) {
  const now = new Date();
  const ano = now.getFullYear(), mes = now.getMonth();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const diaAtual  = now.getDate();
  const diasRestantes = diasNoMes - diaAtual;
  const alerts = [];

  SPECS.forEach(spec => {
    const m     = aggregateMes(db, ano, mes, spec.id);
    const total = m.primeiras + m.retornos;
    const pct   = spec.metaM > 0 ? (total / spec.metaM) * 100 : 0;
    const ritmo = diaAtual > 0 ? total / diaAtual : 0;
    const proj  = Math.round(ritmo * diasNoMes);
    const txFalta = m.ofertadas > 0 ? (m.faltas / m.ofertadas) * 100 : 0;
    const txComp  = m.ofertadas > 0 ? (m.realizadas / m.ofertadas) * 100 : 0;

    // Alerta crítico: abaixo de 50% e estamos na 2ª quinzena
    if (pct < 50 && diaAtual > 15)
      alerts.push({ level: "critical", spec: spec.label, msg: `${spec.label} está em ${pct.toFixed(0)}% da meta mensal — risco alto de não atingir.`, color: spec.color });

    // Alerta warning: projeção abaixo da meta
    else if (proj < spec.metaM && pct < 80)
      alerts.push({ level: "warning", spec: spec.label, msg: `${spec.label}: projeção de fechamento ${fmt(proj)} vs meta ${fmt(spec.metaM)} (faltam ${diasRestantes} dias).`, color: spec.color });

    // Meta atingida — positivo
    else if (pct >= 100)
      alerts.push({ level: "success", spec: spec.label, msg: `${spec.label} atingiu 100% da meta mensal! 🎉`, color: spec.color });

    // Alta taxa de faltas
    if (txFalta > 20 && m.ofertadas > 0)
      alerts.push({ level: "warning", spec: spec.label, msg: `${spec.label}: taxa de faltas em ${txFalta.toFixed(0)}% — acima do limite de 20%.`, color: spec.color });

    // Baixo comparecimento
    if (txComp < 60 && m.ofertadas > 0)
      alerts.push({ level: "critical", spec: spec.label, msg: `${spec.label}: comparecimento baixo (${txComp.toFixed(0)}%). Revisar agendamentos.`, color: spec.color });
  });

  return alerts;
}

// ═══════════════════════════════════════════════════════════
// HELPERS VISUAIS
// ═══════════════════════════════════════════════════════════
const fmt = n => (n ?? 0).toLocaleString("pt-BR");

function RingGauge({ value, max, color, label, sub, size = 120 }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const r = 44, cx = 60, cy = 60, circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const isOver = value > max;
  const rc = isOver ? "#34d399" : pct >= 70 ? color : pct >= 40 ? "#fbbf24" : "#fb7185";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width={size} height={size} viewBox="0 0 120 120">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e1e28" strokeWidth={10} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={rc} strokeWidth={10}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 60 60)" style={{ transition: "stroke-dasharray .6s ease" }} />
        <text x={cx} y={cy - 6} textAnchor="middle" fill={rc} fontSize={18} fontWeight={700} fontFamily="JetBrains Mono, monospace">{Math.round(pct)}%</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#9090a8" fontSize={10} fontFamily="Inter, sans-serif">
          {isOver ? "✓ meta" : `${fmt(Math.max(max - value, 0))} falta`}
        </text>
      </svg>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#9090a8", textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: "#5a5a72" }}>{sub}</div>}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color, big }) {
  return (
    <div style={{ background: "#18181f", border: "1px solid #2a2a38", borderTop: `2px solid ${color}`, borderRadius: 8, padding: "12px 14px", flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "#5a5a72", marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: big ? 28 : 22, fontWeight: 600, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#9090a8", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function DeltaBadge({ value, meta }) {
  if (!meta || value === 0) return null;
  const diff = value - meta, pct = Math.round((diff / meta) * 100), above = diff >= 0;
  return (
    <span style={{ background: above ? "#0a3d2a" : "#3d0f18", color: above ? "#34d399" : "#fb7185", border: `1px solid ${above ? "#34d399" : "#fb7185"}`, borderRadius: 99, fontSize: 11, fontWeight: 700, padding: "2px 8px", fontFamily: "JetBrains Mono, monospace" }}>
      {above ? "▲" : "▼"} {Math.abs(pct)}% {above ? "acima" : "abaixo"} da meta
    </span>
  );
}

function SemaforoMeta({ pct, diasRestantes }) {
  const proj = pct; // já calculado fora
  let cor, icone, texto;
  if (pct >= 100)                          { cor = "#34d399"; icone = "🟢"; texto = "Meta atingida!"; }
  else if (diasRestantes > 0 && pct >= 70) { cor = "#fbbf24"; icone = "🟡"; texto = "Precisa acelerar"; }
  else if (pct < 40 && diasRestantes < 10) { cor = "#fb7185"; icone = "🔴"; texto = "Meta em risco"; }
  else if (pct >= 40)                      { cor = "#fbbf24"; icone = "🟡"; texto = "Atenção"; }
  else                                     { cor = "#fb7185"; icone = "🔴"; texto = "Ritmo insuficiente"; }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, background: cor + "18", border: `1px solid ${cor}44`, borderRadius: 6, padding: "4px 10px" }}>
      <span style={{ fontSize: 14 }}>{icone}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: cor }}>{texto}</span>
    </div>
  );
}

const customTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1e1e28", border: "1px solid #3a3a4e", borderRadius: 6, padding: "8px 12px", fontSize: 12 }}>
      <div style={{ color: "#9090a8", marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || "#e8e8f0", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ width: 8, height: 8, background: p.color, borderRadius: 2, display: "inline-block" }} />
          {p.name}: <strong>{fmt(p.value)}</strong>
        </div>
      ))}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// BANNER DE ALERTAS (topo do app)
// ═══════════════════════════════════════════════════════════
function AlertBanner({ db }) {
  const [open, setOpen] = useState(false);
  const alerts = calcAlertas(db);
  const crits  = alerts.filter(a => a.level === "critical").length;
  const warns  = alerts.filter(a => a.level === "warning").length;
  if (alerts.length === 0) return null;
  return (
    <div style={{ background: "#111118", borderBottom: "1px solid #2a2a38" }}>
      <button onClick={() => setOpen(p => !p)} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "6px 1.5rem",
        background: "none", border: "none", cursor: "pointer", textAlign: "left",
      }}>
        {crits > 0 && <span style={{ background: "#3d0f18", color: "#fb7185", borderRadius: 99, fontSize: 11, fontWeight: 700, padding: "2px 8px" }}>🔴 {crits} crítico{crits > 1 ? "s" : ""}</span>}
        {warns > 0 && <span style={{ background: "#3d2e06", color: "#fbbf24", borderRadius: 99, fontSize: 11, fontWeight: 700, padding: "2px 8px" }}>⚠️ {warns} atenção</span>}
        {alerts.filter(a => a.level === "success").length > 0 && <span style={{ background: "#0a3d2a", color: "#34d399", borderRadius: 99, fontSize: 11, fontWeight: 700, padding: "2px 8px" }}>✅ {alerts.filter(a => a.level === "success").length} meta(s) atingida(s)</span>}
        <span style={{ fontSize: 11, color: "#5a5a72", marginLeft: "auto" }}>{open ? "▲ fechar" : "▼ ver alertas"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 1.5rem .75rem", display: "flex", flexDirection: "column", gap: 4 }}>
          {alerts.map((a, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 10px", borderRadius: 6,
              background: a.level === "critical" ? "#3d0f18" : a.level === "warning" ? "#3d2e06" : "#0a3d2a",
              borderLeft: `3px solid ${a.level === "critical" ? "#fb7185" : a.level === "warning" ? "#fbbf24" : "#34d399"}`,
              fontSize: 12, color: a.level === "critical" ? "#fb7185" : a.level === "warning" ? "#fbbf24" : "#34d399",
            }}>
              {a.level === "critical" ? "🔴" : a.level === "warning" ? "⚠️" : "✅"} {a.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ESPECIALIDADE PAGE
// ═══════════════════════════════════════════════════════════
function EspecialidadePage({ spec, db, onSave, readOnly = false, currentUser }) {
  const now = new Date();
  const [date, setDate]   = useState(todayStr());
  const [form, setForm]   = useState({ primeiras:"", retornos:"", ofertadas:"", realizadas:"", livres:"", emergencias:"", faltas:"" });
  const [saved, setSaved] = useState(false);
  const [mes, setMes]     = useState(now.getMonth());
  const [ano, setAno]     = useState(now.getFullYear());

  useEffect(() => {
    const rec = db[date]?.[spec.id];
    if (rec) setForm({ primeiras: String(rec.primeiras ?? ""), retornos: String(rec.retornos ?? ""), ofertadas: String(rec.ofertadas ?? ""), realizadas: String(rec.realizadas ?? ""), livres: String(rec.livres ?? ""), emergencias: String(rec.emergencias ?? ""), faltas: String(rec.faltas ?? "") });
    else setForm({ primeiras:"", retornos:"", ofertadas:"", realizadas:"", livres:"", emergencias:"", faltas:"" });
  }, [date, db, spec.id]);

  const f = k => parseInt(form[k]) || 0;
  const totalDia = f("primeiras") + f("retornos");

  async function handleSave() {
    const data = { primeiras: f("primeiras"), retornos: f("retornos"), ofertadas: f("ofertadas"), realizadas: f("realizadas"), livres: f("livres"), emergencias: f("emergencias"), faltas: f("faltas") };
    await saveRecord(date, spec.id, data, currentUser);
    onSave(loadDB());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const mesData   = aggregateMes(db, ano, mes, spec.id);
  const totalMes  = mesData.primeiras + mesData.retornos;
  const pctMes    = spec.metaM > 0 ? (totalMes / spec.metaM) * 100 : 0;
  const faltaMes  = Math.max(spec.metaM - totalMes, 0);
  const diaAtual  = date.startsWith(`${ano}-${String(mes+1).padStart(2,"0")}`) ? parseInt(date.slice(8)) : new Date(ano, mes+1, 0).getDate();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const diasRest  = Math.max(diasNoMes - diaAtual, 0);
  const ritmo     = diaAtual > 0 ? totalMes / diaAtual : 0;
  const projecao  = Math.round(ritmo * diasNoMes);
  const precisaDia = diasRest > 0 ? Math.ceil(faltaMes / diasRest) : 0;

  const anoData    = aggregateAno(db, ano, spec.id);
  const totalAno   = anoData.reduce((a, m) => a + m.total, 0);
  const total1aAno = anoData.reduce((a, m) => a + m.primeiras, 0);

  // Comparativo
  const comp = comparativo(db, ano, mes, spec.id);

  // 12 meses de tendência
  const trend12 = Array.from({ length: 12 }, (_, i) => {
    const m = (mes - 11 + i + 12) % 12;
    const a = mes - 11 + i < 0 ? ano - 1 : ano;
    const d = aggregateMes(db, a, m, spec.id);
    return { name: MONTHS[m], total: d.primeiras + d.retornos, meta: spec.metaM, primeiras: d.primeiras };
  });

  const barData = anoData.map((m, i) => ({ name: MONTHS[i], Total: m.total, Meta: spec.metaM, "1ª Consulta": m.primeiras }));
  const compData = [
    { name: "Ofertadas",  value: mesData.ofertadas },
    { name: "Realizadas", value: mesData.realizadas },
    { name: "Livres",     value: mesData.livres },
    { name: "1ª Cons.",   value: mesData.primeiras },
    { name: "Retorno",    value: mesData.retornos },
    { name: "Faltas",     value: mesData.faltas },
    { name: "Emerg.",     value: mesData.emergencias },
  ];

  const inp = { background: "#1e1e28", border: "1px solid #2a2a38", borderRadius: 6, padding: "7px 10px", color: "#e8e8f0", fontFamily: "JetBrains Mono, monospace", fontSize: 14, width: "100%", outline: "none" };

  return (
    <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", height: "100%" }}>
      {/* Título */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "1.25rem" }}>
        <div style={{ width: 4, height: 32, background: spec.color, borderRadius: 2 }} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: spec.color }}>{spec.label}</div>
          <div style={{ fontSize: 12, color: "#5a5a72" }}>Ambulatório HNSN · Meta mensal {fmt(spec.metaM)} · Anual {fmt(spec.metaA)} · 30% 1ª consulta = {fmt(spec.meta1a)}/ano</div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <SemaforoMeta pct={pctMes} diasRestantes={diasRest} />
        </div>
      </div>

      {/* Grid: formulário + KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: "1rem", marginBottom: "1rem" }}>
        {/* Formulário */}
        <div style={{ background: "#18181f", border: "1px solid #2a2a38", borderRadius: 10, padding: "1rem", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#5a5a72", textTransform: "uppercase", letterSpacing: ".07em" }}>Lançar dados</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inp, width: "auto", fontSize: 12, padding: "4px 8px" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { key: "ofertadas",   icon: "📋", label: "Ofertadas (Gercon)" },
              { key: "realizadas",  icon: "✅", label: "Realizadas" },
              { key: "livres",      icon: "🔓", label: "Livres" },
              { key: "primeiras",   icon: "1️⃣", label: "1ª Consulta" },
              { key: "retornos",    icon: "🔁", label: "Retorno" },
              { key: "faltas",      icon: "❌", label: "Faltas" },
              { key: "emergencias", icon: "🚨", label: "Emergências" },
            ].map(({ key, icon, label }) => (
              <div key={key}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#9090a8", marginBottom: 4, display: "block" }}>{icon} {label}</label>
                <input type="number" min="0" value={form[key]}
                  onChange={e => !readOnly && setForm(p => ({ ...p, [key]: e.target.value }))}
                  onFocus={e => !readOnly && (e.target.style.borderColor = spec.color)}
                  onBlur={e => e.target.style.borderColor = "#2a2a38"}
                  disabled={readOnly} placeholder="0"
                  style={{ ...inp, opacity: readOnly ? .5 : 1, cursor: readOnly ? "not-allowed" : "text" }} />
              </div>
            ))}
          </div>
          {readOnly ? (
            <div style={{ background: "#3b2f6e", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "#a78bfa", textAlign: "center", marginTop: 4 }}>👁 Modo visualização</div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
              <button onClick={handleSave} style={{ background: spec.color, color: "#000", border: "none", borderRadius: 6, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", flex: 1 }}>💾 Salvar</button>
              {saved && <span style={{ color: "#34d399", fontSize: 12, fontWeight: 700 }}>✓ Salvo!</span>}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ background: "#0e0e14", borderRadius: 6, padding: "6px 10px", flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "#5a5a72" }}>TOTAL DIA</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 20, color: spec.color, fontWeight: 700 }}>{totalDia}</div>
            </div>
            <div style={{ background: "#0e0e14", borderRadius: 6, padding: "6px 10px", flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "#5a5a72" }}>1ªS</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 20, color: "#a78bfa", fontWeight: 700 }}>{f("primeiras")}</div>
            </div>
            <div style={{ background: "#0e0e14", borderRadius: 6, padding: "6px 10px", flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "#5a5a72" }}>LIVRES</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 20, color: "#34d399", fontWeight: 700 }}>{f("livres")}</div>
            </div>
          </div>
        </div>

        {/* KPIs + comparativo */}
        <div style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
          <div style={{ display: "flex", gap: ".75rem" }}>
            <StatCard label="Atendimentos no mês" value={fmt(totalMes)} sub={`meta: ${fmt(spec.metaM)}`} color={spec.color} big />
            <StatCard label="Faltam para meta"    value={fmt(faltaMes)} sub={`${diasRest} dias restantes`} color={faltaMes === 0 ? "#34d399" : "#fb7185"} big />
            <StatCard label="Projeção fechamento" value={fmt(projecao)} sub={projecao >= spec.metaM ? "✓ supera meta" : `⚠ faltarão ~${fmt(spec.metaM - projecao)}`} color={projecao >= spec.metaM ? "#34d399" : "#fbbf24"} big />
            <StatCard label="Ritmo necessário"    value={`${precisaDia}/dia`} sub="para atingir meta" color={spec.color} big />
          </div>

          {/* Comparativo mês a mês */}
          <div style={{ background: "#18181f", border: "1px solid #2a2a38", borderRadius: 10, padding: "1rem" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#5a5a72", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>
              📊 Comparativo de Desempenho
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {[
                { label: `${MONTHS_FULL[mes]} ${ano}`,           value: comp.mesAtual,       sub: "mês atual",                    color: spec.color },
                { label: `${comp.mesAnteriorLabel} (mês ant.)`,  value: comp.mesAnterior,    sub: `${comp.variacaoMes >= 0 ? "▲" : "▼"} ${Math.abs(comp.variacaoMes).toFixed(0)}% vs mês anterior`, color: comp.variacaoMes >= 0 ? "#34d399" : "#fb7185" },
                { label: `${MONTHS_FULL[mes]} ${ano-1}`,         value: comp.mesAnoAnterior, sub: `${comp.variacaoAno >= 0 ? "▲" : "▼"} ${Math.abs(comp.variacaoAno).toFixed(0)}% vs ano anterior`,  color: comp.variacaoAno >= 0 ? "#34d399" : "#fb7185" },
              ].map(({ label, value, sub, color }) => (
                <div key={label} style={{ background: "#111118", borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ fontSize: 10, color: "#5a5a72", marginBottom: 3 }}>{label}</div>
                  <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 20, color, fontWeight: 700 }}>{fmt(value)}</div>
                  <div style={{ fontSize: 10, color, marginTop: 2 }}>{sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Barra mensal */}
          <div style={{ background: "#18181f", border: "1px solid #2a2a38", borderRadius: 10, padding: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Meta Mensal — {MONTHS_FULL[mes]}/{ano}</span>
                <DeltaBadge value={totalMes} meta={spec.metaM} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <select value={mes} onChange={e => setMes(+e.target.value)} style={{ ...inp, width: "auto", fontSize: 12, padding: "4px 8px" }}>
                  {MONTHS_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
                <input type="number" value={ano} onChange={e => setAno(+e.target.value)} style={{ ...inp, width: 80, fontSize: 12, padding: "4px 8px" }} />
              </div>
            </div>
            <div style={{ background: "#0e0e14", borderRadius: 99, height: 14, overflow: "hidden", marginBottom: 6 }}>
              <div style={{ width: `${Math.min(pctMes, 100)}%`, height: "100%", borderRadius: 99, background: pctMes >= 100 ? "#34d399" : pctMes >= 70 ? spec.color : pctMes >= 40 ? "#fbbf24" : "#fb7185", transition: "width .6s" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9090a8" }}>
              <span>Realizado: <strong style={{ color: "#e8e8f0" }}>{fmt(totalMes)}</strong></span>
              <span style={{ color: spec.color, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>{pctMes.toFixed(1)}%</span>
              <span>Meta: <strong style={{ color: "#e8e8f0" }}>{fmt(spec.metaM)}</strong></span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
              {[
                { label: "Realizadas", v: mesData.realizadas, max: mesData.ofertadas, c: "#34d399" },
                { label: "Livres",     v: mesData.livres,     max: mesData.ofertadas, c: "#22d3ee" },
                { label: "1ªs Cons.",  v: mesData.primeiras,  max: mesData.primeiras + mesData.retornos, c: "#a78bfa" },
              ].map(({ label, v, max, c }) => {
                const p = max > 0 ? Math.min((v / max) * 100, 100) : 0;
                return (
                  <div key={label} style={{ background: "#0e0e14", borderRadius: 6, padding: "6px 10px" }}>
                    <div style={{ fontSize: 10, color: "#5a5a72", marginBottom: 4 }}>{label}</div>
                    <div style={{ background: "#1e1e28", borderRadius: 99, height: 5, overflow: "hidden", marginBottom: 4 }}>
                      <div style={{ width: `${p}%`, height: "100%", background: c, borderRadius: 99, transition: "width .5s" }} />
                    </div>
                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, color: c }}>{fmt(v)} <span style={{ fontSize: 10, color: "#5a5a72" }}>/ {fmt(max)}</span></div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Gauges + linha últimos dias */}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "1rem", marginBottom: "1rem" }}>
        <div style={{ background: "#18181f", border: "1px solid #2a2a38", borderRadius: 10, padding: "1rem", display: "flex", gap: "1.5rem", alignItems: "center" }}>
          <RingGauge value={totalMes}   max={spec.metaM}  color={spec.color} label="Meta Mensal"  sub={`${fmt(totalMes)}/${fmt(spec.metaM)}`} />
          <RingGauge value={totalAno}   max={spec.metaA}  color={spec.color} label="Meta Anual"   sub={`${fmt(totalAno)}/${fmt(spec.metaA)}`} />
          <RingGauge value={total1aAno} max={spec.meta1a} color="#a78bfa"    label="30% 1ª Cons." sub={`${fmt(total1aAno)}/${fmt(spec.meta1a)}`} />
        </div>
        <div style={{ background: "#18181f", border: "1px solid #2a2a38", borderRadius: 10, padding: "1rem" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#5a5a72", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Tendência — últimos 12 meses</div>
          <ResponsiveContainer width="100%" height={110}>
            <ComposedChart data={trend12} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fill: "#5a5a72", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip content={customTooltip} />
              <ReferenceLine y={spec.metaM} stroke="#3a3a4e" strokeDasharray="4 2" />
              <Area type="monotone" dataKey="total" name="Total" fill={spec.color + "22"} stroke={spec.color} strokeWidth={2} />
              <Line type="monotone" dataKey="primeiras" name="1ª Consulta" stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Barras anuais + composição mensal + meta anual */}
      <div style={{ background: "#18181f", border: "1px solid #2a2a38", borderRadius: 10, padding: "1rem", marginBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#5a5a72", textTransform: "uppercase", letterSpacing: ".07em" }}>Atendimentos mensais — {ano}</span>
          <DeltaBadge value={totalAno} meta={spec.metaA} />
        </div>
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={barData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fill: "#5a5a72", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#5a5a72", fontSize: 10 }} axisLine={false} tickLine={false} width={35} />
            <Tooltip content={customTooltip} />
            <ReferenceLine y={spec.metaM} stroke="#3a3a4e" strokeDasharray="4 2" />
            <Bar dataKey="Total" radius={[4, 4, 0, 0]}>
              {barData.map((entry, i) => <Cell key={i} fill={entry.Total >= spec.metaM ? "#34d399" : entry.Total >= spec.metaM * .7 ? spec.color : "#fb7185"} fillOpacity={.9} />)}
            </Bar>
            <Bar dataKey="1ª Consulta" fill="#a78bfa" fillOpacity={.7} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
        {/* Composição mensal */}
        <div style={{ background: "#18181f", border: "1px solid #2a2a38", borderRadius: 10, padding: "1rem" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#5a5a72", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Composição — {MONTHS_FULL[mes]}</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={compData} layout="vertical" margin={{ top: 0, right: 20, left: 60, bottom: 0 }}>
              <XAxis type="number" tick={{ fill: "#5a5a72", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#9090a8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={customTooltip} />
              <Bar dataKey="value" name="Qtd." radius={[0, 4, 4, 0]}>
                {compData.map((_, i) => <Cell key={i} fill={[spec.color,"#34d399","#22d3ee","#a78bfa","#60a5fa","#fb7185","#fbbf24"][i % 7]} fillOpacity={.85} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Meta anual + 30% */}
        <div style={{ background: "#18181f", border: "1px solid #2a2a38", borderRadius: 10, padding: "1rem" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#5a5a72", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Progresso Anual — {ano}</div>
          {[
            { label: "Total de atendimentos", value: totalAno,   meta: spec.metaA,  color: spec.color },
            { label: "1ª Consultas (30%)",    value: total1aAno, meta: spec.meta1a, color: "#a78bfa" },
          ].map(({ label, value, meta, color }) => {
            const p = meta > 0 ? Math.min((value / meta) * 100, 100) : 0;
            return (
              <div key={label} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
                  <DeltaBadge value={value} meta={meta} />
                </div>
                <div style={{ background: "#0e0e14", borderRadius: 99, height: 10, overflow: "hidden", marginBottom: 4 }}>
                  <div style={{ width: `${p}%`, height: "100%", background: value >= meta ? "#34d399" : color, borderRadius: 99, transition: "width .6s" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9090a8" }}>
                  <span>Realizado: <strong style={{ color: "#e8e8f0" }}>{fmt(value)}</strong></span>
                  <span style={{ fontFamily: "JetBrains Mono, monospace", color: value >= meta ? "#34d399" : color, fontWeight: 700 }}>{p.toFixed(1)}%</span>
                  <span>Meta: <strong style={{ color: "#e8e8f0" }}>{fmt(meta)}</strong></span>
                </div>
                {value < meta && <div style={{ fontSize: 11, color: "#fb7185", marginTop: 4 }}>Faltam <strong>{fmt(meta - value)}</strong></div>}
              </div>
            );
          })}
          {/* Tabela anual resumo */}
          <div style={{ maxHeight: 130, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead><tr>{["Mês","Total","1ª","Ret.","% Meta"].map(h => <th key={h} style={{ padding: "4px 6px", color: "#5a5a72", textAlign: "left", borderBottom: "1px solid #2a2a38", fontWeight: 700 }}>{h}</th>)}</tr></thead>
              <tbody>
                {anoData.filter(m => m.total > 0).map(m => {
                  const pct = spec.metaM > 0 ? Math.round((m.total / spec.metaM) * 100) : 0;
                  const c = pct >= 100 ? "#34d399" : pct >= 70 ? spec.color : "#fb7185";
                  return (
                    <tr key={m.mes}>
                      <td style={{ padding: "4px 6px", color: "#9090a8" }}>{MONTHS[m.mes]}</td>
                      <td style={{ padding: "4px 6px", fontFamily: "JetBrains Mono, monospace", color: "#e8e8f0" }}>{m.total}</td>
                      <td style={{ padding: "4px 6px", fontFamily: "JetBrains Mono, monospace", color: "#a78bfa" }}>{m.primeiras}</td>
                      <td style={{ padding: "4px 6px", fontFamily: "JetBrains Mono, monospace", color: "#60a5fa" }}>{m.retornos}</td>
                      <td style={{ padding: "4px 6px" }}><span style={{ background: c + "22", color: c, borderRadius: 99, padding: "1px 6px", fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>{pct}%</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// VISÃO GERAL
// ═══════════════════════════════════════════════════════════
function Overview({ db }) {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth());
  const [ano, setAno] = useState(now.getFullYear());
  const inp = { background: "#18181f", border: "1px solid #2a2a38", borderRadius: 6, padding: "5px 8px", color: "#e8e8f0", fontFamily: "JetBrains Mono, monospace", fontSize: 12, outline: "none" };

  const rows = SPECS.map(spec => {
    const m       = aggregateMes(db, ano, mes, spec.id);
    const total   = m.primeiras + m.retornos;
    const pctM    = spec.metaM > 0 ? (total / spec.metaM) * 100 : 0;
    const anoArr  = aggregateAno(db, ano, spec.id);
    const totalA  = anoArr.reduce((a, x) => a + x.total, 0);
    const total1a = anoArr.reduce((a, x) => a + x.primeiras, 0);
    const pctA    = spec.metaA > 0 ? (totalA / spec.metaA) * 100 : 0;
    const comp    = comparativo(db, ano, mes, spec.id);
    return { spec, total, pctM, totalA, pctA, total1a, m, comp };
  });

  const totalGeral       = rows.reduce((a, r) => a + r.total, 0);
  const totalGeralAno    = rows.reduce((a, r) => a + r.totalA, 0);
  const totalOfertadas   = rows.reduce((a, r) => a + (r.m.ofertadas   || 0), 0);
  const totalRealizadas  = rows.reduce((a, r) => a + (r.m.realizadas  || 0), 0);
  const totalEmerg       = rows.reduce((a, r) => a + (r.m.emergencias || 0), 0);
  const totalFaltas      = rows.reduce((a, r) => a + (r.m.faltas      || 0), 0);
  const totalLivres      = rows.reduce((a, r) => a + (r.m.livres      || 0), 0);
  const txReal           = totalOfertadas > 0 ? ((totalRealizadas / totalOfertadas) * 100) : 0;
  const overviewBar      = SPECS.map(s => ({ name: s.label, total: rows.find(r => r.spec.id === s.id)?.total || 0, meta: s.metaM }));

  return (
    <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "1.25rem" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Ambulatório HNSN</div>
          <div style={{ fontSize: 12, color: "#5a5a72" }}>Visão geral de todas as especialidades</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 18 }}>📅</span>
          <select value={mes} onChange={e => setMes(+e.target.value)} style={inp}>
            {MONTHS_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <input type="number" value={ano} onChange={e => setAno(+e.target.value)} style={{ ...inp, width: 80 }} />
        </div>
      </div>

      {/* KPIs principais */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: ".75rem", marginBottom: ".75rem" }}>
        <StatCard label={`Atendimentos — ${MONTHS_FULL[mes]}`} value={fmt(totalGeral)}    color="#22d3ee" big />
        <StatCard label={`Acumulado — ${ano}`}                  value={fmt(totalGeralAno)} color="#a78bfa" big />
        <StatCard label="Especialidades ativas"                  value={SPECS.length}       color="#34d399" big />
        <StatCard label="Taxa de realização"                     value={`${txReal.toFixed(1)}%`} color={txReal >= 80 ? "#34d399" : txReal >= 60 ? "#fbbf24" : "#fb7185"} big />
      </div>

      {/* Bloco consolidado */}
      <div style={{ background: "#18181f", border: "1px solid #2a2a38", borderRadius: 10, padding: "1rem 1.25rem", marginBottom: "1rem" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#5a5a72", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".85rem" }}>
          📅 Consolidado de Consultas — {MONTHS_FULL[mes]}/{ano}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: ".75rem", marginBottom: ".85rem" }}>
          {[
            { icon: "📋", label: "Ofertadas",   value: totalOfertadas,  color: "#22d3ee", sub: "vagas abertas no Gercon" },
            { icon: "✅", label: "Realizadas",  value: totalRealizadas, color: "#34d399", sub: `${txReal.toFixed(1)}% das ofertadas` },
            { icon: "🔓", label: "Livres",      value: totalLivres,     color: "#60a5fa", sub: "vagas não utilizadas" },
            { icon: "🚨", label: "Emergências", value: totalEmerg,      color: "#fb7185", sub: "entradas não programadas" },
            { icon: "❌", label: "Faltas",      value: totalFaltas,     color: "#fbbf24", sub: "pacientes ausentes" },
          ].map(({ icon, label, value, color, sub }) => (
            <div key={label} style={{ background: "#111118", border: "1px solid #2a2a38", borderLeft: `3px solid ${color}`, borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "#5a5a72", marginBottom: 4 }}>{icon} {label}</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 24, fontWeight: 700, color, lineHeight: 1 }}>{fmt(value)}</div>
              <div style={{ fontSize: 10, color: "#5a5a72", marginTop: 4 }}>{sub}</div>
              {totalOfertadas > 0 && label !== "Ofertadas" && (
                <div style={{ background: "#1e1e28", borderRadius: 99, height: 3, marginTop: 6 }}>
                  <div style={{ width: `${Math.min((value / totalOfertadas) * 100, 100)}%`, height: "100%", background: color, borderRadius: 99, transition: "width .5s" }} />
                </div>
              )}
            </div>
          ))}
        </div>
        {/* Tabela por especialidade */}
        <div style={{ borderTop: "1px solid #2a2a38", paddingTop: ".75rem" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#5a5a72", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6 }}>Detalhamento por especialidade</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead><tr>{["Especialidade","Ofertadas","Realizadas","% Real.","Livres","Emerg.","Faltas","vs Mês Ant.","vs Ano Ant."].map(h => <th key={h} style={{ textAlign: "left", padding: "4px 8px", color: "#5a5a72", fontSize: 10, fontWeight: 700, textTransform: "uppercase", borderBottom: "1px solid #2a2a38" }}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(({ spec, m, comp }) => {
                const tx = m.ofertadas > 0 ? ((m.realizadas / m.ofertadas) * 100) : 0;
                const tc = tx >= 80 ? "#34d399" : tx >= 60 ? "#fbbf24" : "#fb7185";
                return (
                  <tr key={spec.id} style={{ borderBottom: "1px solid #1e1e28" }}>
                    <td style={{ padding: "5px 8px", display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: spec.color, display: "inline-block", flexShrink: 0 }} />
                      <span style={{ color: spec.color, fontWeight: 600 }}>{spec.label}</span>
                    </td>
                    <td style={{ padding: "5px 8px", fontFamily: "JetBrains Mono, monospace", color: "#22d3ee" }}>{m.ofertadas}</td>
                    <td style={{ padding: "5px 8px", fontFamily: "JetBrains Mono, monospace", color: "#34d399" }}>{m.realizadas}</td>
                    <td style={{ padding: "5px 8px" }}><span style={{ background: tc + "22", color: tc, borderRadius: 99, padding: "1px 7px", fontSize: 10, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>{tx.toFixed(1)}%</span></td>
                    <td style={{ padding: "5px 8px", fontFamily: "JetBrains Mono, monospace", color: "#60a5fa" }}>{m.livres}</td>
                    <td style={{ padding: "5px 8px", fontFamily: "JetBrains Mono, monospace", color: "#fb7185" }}>{m.emergencias}</td>
                    <td style={{ padding: "5px 8px", fontFamily: "JetBrains Mono, monospace", color: "#fbbf24" }}>{m.faltas}</td>
                    <td style={{ padding: "5px 8px" }}>
                      <span style={{ color: comp.variacaoMes >= 0 ? "#34d399" : "#fb7185", fontSize: 11, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>
                        {comp.variacaoMes >= 0 ? "▲" : "▼"}{Math.abs(comp.variacaoMes).toFixed(0)}%
                      </span>
                    </td>
                    <td style={{ padding: "5px 8px" }}>
                      <span style={{ color: comp.variacaoAno >= 0 ? "#34d399" : "#fb7185", fontSize: 11, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>
                        {comp.variacaoAno >= 0 ? "▲" : "▼"}{Math.abs(comp.variacaoAno).toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: "1px solid #2a2a38", background: "#111118" }}>
                <td style={{ padding: "5px 8px", fontWeight: 700, color: "#e8e8f0" }}>TOTAL</td>
                <td style={{ padding: "5px 8px", fontFamily: "JetBrains Mono, monospace", color: "#22d3ee", fontWeight: 700 }}>{totalOfertadas}</td>
                <td style={{ padding: "5px 8px", fontFamily: "JetBrains Mono, monospace", color: "#34d399", fontWeight: 700 }}>{totalRealizadas}</td>
                <td style={{ padding: "5px 8px" }}><span style={{ background: (txReal >= 80 ? "#34d399" : txReal >= 60 ? "#fbbf24" : "#fb7185") + "22", color: txReal >= 80 ? "#34d399" : txReal >= 60 ? "#fbbf24" : "#fb7185", borderRadius: 99, padding: "1px 7px", fontSize: 10, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>{txReal.toFixed(1)}%</span></td>
                <td style={{ padding: "5px 8px", fontFamily: "JetBrains Mono, monospace", color: "#60a5fa", fontWeight: 700 }}>{totalLivres}</td>
                <td style={{ padding: "5px 8px", fontFamily: "JetBrains Mono, monospace", color: "#fb7185", fontWeight: 700 }}>{totalEmerg}</td>
                <td style={{ padding: "5px 8px", fontFamily: "JetBrains Mono, monospace", color: "#fbbf24", fontWeight: 700 }}>{totalFaltas}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Gráfico + cards especialidade */}
      <div style={{ background: "#18181f", border: "1px solid #2a2a38", borderRadius: 10, padding: "1rem", marginBottom: "1rem" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#5a5a72", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Realizado vs Meta — {MONTHS_FULL[mes]}/{ano}</div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={overviewBar} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fill: "#5a5a72", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#5a5a72", fontSize: 10 }} axisLine={false} tickLine={false} width={35} />
            <Tooltip content={customTooltip} />
            <Bar dataKey="total" name="Realizado" radius={[4, 4, 0, 0]}>
              {overviewBar.map((entry, i) => <Cell key={i} fill={SPECS[i].color} fillOpacity={entry.total >= entry.meta ? 1 : .6} />)}
            </Bar>
            <Bar dataKey="meta" name="Meta" fill="#2a2a38" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: ".75rem" }}>
        {rows.map(({ spec, total, pctM, totalA, pctA, total1a, m }) => {
          const faltaM = Math.max(spec.metaM - total, 0);
          const bc = pctM >= 100 ? "#34d399" : pctM >= 70 ? spec.color : pctM >= 40 ? "#fbbf24" : "#fb7185";
          return (
            <div key={spec.id} style={{ background: "#18181f", border: "1px solid #2a2a38", borderTop: `2px solid ${spec.color}`, borderRadius: 10, padding: "1rem", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: spec.color }}>{spec.label}</div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: "#5a5a72" }}>MENSAL</span>
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: bc, fontWeight: 700 }}>{pctM.toFixed(1)}%</span>
                </div>
                <div style={{ background: "#0e0e14", borderRadius: 99, height: 5 }}>
                  <div style={{ width: `${Math.min(pctM, 100)}%`, height: "100%", background: bc, borderRadius: 99, transition: "width .5s" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#5a5a72", marginTop: 3 }}>
                  <span>{fmt(total)}</span><span>meta: {fmt(spec.metaM)}</span>
                </div>
                {faltaM > 0 && <div style={{ fontSize: 10, color: "#fb7185" }}>Faltam {fmt(faltaM)}</div>}
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: "#5a5a72" }}>ANUAL {ano}</span>
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: spec.color, fontWeight: 700 }}>{pctA.toFixed(1)}%</span>
                </div>
                <div style={{ background: "#0e0e14", borderRadius: 99, height: 5 }}>
                  <div style={{ width: `${Math.min(pctA, 100)}%`, height: "100%", background: spec.color, borderRadius: 99, transition: "width .5s" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#5a5a72", marginTop: 3 }}>
                  <span>{fmt(totalA)}</span><span>meta: {fmt(spec.metaA)}</span>
                </div>
              </div>
              <div style={{ background: "#0e0e14", borderRadius: 6, padding: "5px 8px" }}>
                <div style={{ fontSize: 10, color: "#5a5a72" }}>1ª consulta / ano</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, color: "#a78bfa" }}>{fmt(total1a)}</span>
                  <span style={{ fontSize: 10, color: "#5a5a72" }}>meta {fmt(spec.meta1a)}</span>
                </div>
                <div style={{ background: "#1e1e28", borderRadius: 99, height: 3, marginTop: 4 }}>
                  <div style={{ width: `${Math.min((total1a / spec.meta1a) * 100, 100)}%`, height: "100%", background: "#a78bfa", borderRadius: 99 }} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                {[
                  { label: "Emerg.", v: m.emergencias, c: "#fb7185" },
                  { label: "Faltas", v: m.faltas,      c: "#fbbf24" },
                  { label: "Real.",  v: m.realizadas,  c: "#34d399" },
                  { label: "Livres", v: m.livres,      c: "#22d3ee" },
                ].map(({ label, v, c }) => (
                  <div key={label} style={{ background: "#0e0e14", borderRadius: 5, padding: "4px 6px", textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: "#5a5a72" }}>{label}</div>
                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, color: c }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PRINT DASHBOARD
// ═══════════════════════════════════════════════════════════
function PrintDashboard({ db }) {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth());
  const [ano, setAno] = useState(now.getFullYear());
  const [preview, setPreview] = useState(false);
  const inp = { background: "#18181f", border: "1px solid #2a2a38", borderRadius: 6, padding: "7px 10px", color: "#e8e8f0", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none" };

  const aggAll = SPECS.map(spec => {
    const m = aggregateMes(db, ano, mes, spec.id);
    const total = m.primeiras + m.retornos;
    const blocoTotal = Object.entries(db).filter(([d]) => d.startsWith(`${ano}-${String(mes+1).padStart(2,"0")}`)).reduce((a,[,day]) => a + (day?.bloco?.[spec.id] || 0), 0);
    return { spec, m, total, blocoTotal, diff: total - spec.metaM, pct: spec.metaM > 0 ? ((total / spec.metaM) * 100) : 0 };
  });

  const totalGeral = aggAll.reduce((a, r) => a + r.total, 0);
  const metaGeral  = SPECS.reduce((a, s) => a + s.metaM, 0);
  const diffGeral  = totalGeral - metaGeral;
  const pctGeral   = metaGeral > 0 ? ((totalGeral / metaGeral) * 100) : 0;
  const geradoEm   = new Date().toLocaleString("pt-BR");
  const printStyles = `@media print { body * { visibility: hidden !important; } #print-area, #print-area * { visibility: visible !important; } #print-area { position: fixed; inset: 0; background: #fff !important; color: #111 !important; padding: 18px; } @page { size: A4 landscape; margin: 10mm; } }`;

  return (
    <div style={{ padding: "1.5rem", overflowY: "auto", height: "100%" }}>
      <style>{printStyles}</style>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>🖨️ Dashboard para Impressão</div>
      <div style={{ fontSize: 12, color: "#5a5a72", marginBottom: "1.25rem" }}>Relatório visual por período — imprima ou salve como PDF</div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <div><div style={{ fontSize: 11, fontWeight: 700, color: "#9090a8", marginBottom: 5 }}>MÊS</div>
          <select value={mes} onChange={e => setMes(+e.target.value)} style={inp}>{MONTHS_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}</select></div>
        <div><div style={{ fontSize: 11, fontWeight: 700, color: "#9090a8", marginBottom: 5 }}>ANO</div>
          <input type="number" value={ano} onChange={e => setAno(+e.target.value)} style={{ ...inp, width: 90 }} /></div>
        <button onClick={() => setPreview(true)} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 7, padding: "9px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>👁 Pré-visualizar</button>
        {preview && <button onClick={() => window.print()} style={{ background: "#34d399", color: "#000", border: "none", borderRadius: 7, padding: "9px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>🖨️ Imprimir / PDF</button>}
      </div>
      {preview && (
        <div id="print-area" style={{ background: "#fff", color: "#111", borderRadius: 10, border: "1px solid #e5e7eb", padding: "24px 28px", fontFamily: "Inter, sans-serif", fontSize: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, paddingBottom: 12, borderBottom: "2px solid #e5e7eb" }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>⚕ DASHBOARD AMBULATÓRIO — HNSN</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>Hospital Nossa Senhora de Navegantes · MedFlow HNSN</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", background: "#f1f5f9", borderRadius: 8, padding: "6px 14px" }}>📅 {MONTHS_FULL[mes]}/{ano}</div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>Gerado em {geradoEm}</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
            {[
              { icon: "📊", label: "TOTAL ATENDIMENTOS", value: fmt(totalGeral), sub: "todas as especialidades", bg: "#f0fdf4", border: "#86efac", val: "#16a34a" },
              { icon: "🎯", label: "META TOTAL DO MÊS",  value: fmt(metaGeral),  sub: "soma das especialidades", bg: "#eff6ff", border: "#93c5fd", val: "#1d4ed8" },
              { icon: diffGeral >= 0 ? "📈" : "📉", label: "DIFERENÇA PARA A META", value: (diffGeral >= 0 ? "+" : "") + fmt(diffGeral), sub: diffGeral >= 0 ? "Acima da meta" : "Abaixo da meta", bg: diffGeral >= 0 ? "#f0fdf4" : "#fef2f2", border: diffGeral >= 0 ? "#86efac" : "#fca5a5", val: diffGeral >= 0 ? "#16a34a" : "#dc2626" },
              { icon: "🏆", label: "% DA META GERAL",    value: pctGeral.toFixed(1) + "%", sub: "desempenho geral", bg: pctGeral >= 100 ? "#f0fdf4" : "#fef9c3", border: pctGeral >= 100 ? "#86efac" : "#fde047", val: pctGeral >= 100 ? "#16a34a" : "#a16207" },
            ].map(({ icon, label, value, sub, bg, border, val }) => (
              <div key={label} style={{ background: bg, border: `1.5px solid ${border}`, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>{icon} {label}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: val, lineHeight: 1, fontFamily: "JetBrains Mono, monospace" }}>{value}</div>
                <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>{sub}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
            {aggAll.map(({ spec, m, total, blocoTotal, diff, pct }) => {
              const above = diff >= 0;
              const barW  = Math.min(pct, 100);
              const barC  = pct >= 100 ? "#16a34a" : pct >= 70 ? "#2563eb" : pct >= 40 ? "#d97706" : "#dc2626";
              return (
                <div key={spec.id} style={{ border: "1.5px solid #e5e7eb", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
                  <div style={{ background: spec.color + "18", borderBottom: "1.5px solid " + spec.color + "44", padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: spec.color }} />
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#0f172a", textTransform: "uppercase" }}>{spec.label} — {MONTHS_FULL[mes].toUpperCase()}/{ano}</span>
                  </div>
                  <div style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ width: 72, height: 72, borderRadius: "50%", background: spec.color + "15", border: `3px solid ${spec.color}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <div style={{ fontSize: 8, color: "#64748b", fontWeight: 600 }}>TOTAL</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: spec.color, lineHeight: 1 }}>{total}</div>
                      </div>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                        <tbody>
                          {[["1ª Consulta",m.primeiras,"#6366f1"],["Retorno",m.retornos,"#0891b2"],["Ofertadas",m.ofertadas,"#475569"],["Realizadas",m.realizadas,"#16a34a"],["Livres",m.livres,"#0891b2"],["Faltas",m.faltas,"#dc2626"],["Emergências",m.emergencias,"#ea580c"],["Bloco",blocoTotal,"#7c3aed"]].map(([l,v,c]) => (
                            <tr key={l} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "2px 0", color: "#64748b" }}>{l}</td>
                              <td style={{ padding: "2px 0", fontWeight: 700, color: c, textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{v}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ background: "#f1f5f9", borderRadius: 99, height: 7, overflow: "hidden", margin: "8px 0 4px" }}>
                      <div style={{ width: `${barW}%`, height: "100%", background: barC, borderRadius: 99 }} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                      {[["Meta Mensal",spec.metaM,"#0f172a"],["Realizado",total,barC]].map(([l,v,c]) => (
                        <div key={l} style={{ background: "#f8fafc", borderRadius: 6, padding: "5px 8px", textAlign: "center" }}>
                          <div style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase" }}>{l}</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: c }}>{v}</div>
                        </div>
                      ))}
                      <div style={{ background: above ? "#f0fdf4" : "#fef2f2", border: `1px solid ${above ? "#86efac" : "#fca5a5"}`, borderRadius: 6, padding: "5px 8px", textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: above ? "#16a34a" : "#dc2626", textTransform: "uppercase", fontWeight: 700 }}>{above ? "ACIMA" : "ABAIXO"}</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: above ? "#16a34a" : "#dc2626" }}>{above ? "+" : ""}{Math.abs(diff)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ borderTop: "1.5px solid #e5e7eb", paddingTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>RESUMO POR ESPECIALIDADE</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {aggAll.map(({ spec, total, pct }) => {
                const c = pct >= 100 ? "#16a34a" : pct >= 70 ? "#2563eb" : "#dc2626";
                return (
                  <div key={spec.id} style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 8, padding: "7px 12px", minWidth: 130 }}>
                    <div style={{ fontSize: 10, color: spec.color, fontWeight: 700 }}>{spec.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>{fmt(total)} / {fmt(spec.metaM)}</div>
                    <div style={{ fontSize: 11, color: c, fontWeight: 700 }}>{pct.toFixed(1)}% da meta</div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 10, fontSize: 10, color: "#94a3b8", display: "flex", justifyContent: "space-between" }}>
              <span>✅ Dados referente a {MONTHS_FULL[mes]}/{ano} · Fonte: MedFlow HNSN</span>
              <span>Gerado em {geradoEm}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// AUDITORIA PAGE
// ═══════════════════════════════════════════════════════════
function AuditoriaPage() {
  const [logs, setLogs] = useState(() => loadAudit());
  const [filtro, setFiltro] = useState("");
  const filtered = logs.filter(l => !filtro || l.user.toLowerCase().includes(filtro.toLowerCase()) || l.alvo.includes(filtro));
  const inp = { background: "#18181f", border: "1px solid #2a2a38", borderRadius: 6, padding: "7px 10px", color: "#e8e8f0", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none" };
  return (
    <div style={{ padding: "1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>📋 Log de Auditoria</div>
      <div style={{ fontSize: 12, color: "#5a5a72", marginBottom: "1.5rem" }}>Histórico de todas as alterações realizadas na plataforma</div>
      <div style={{ display: "flex", gap: 10, marginBottom: "1rem", alignItems: "center" }}>
        <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Filtrar por usuário ou data..." style={{ ...inp, width: 280 }} />
        <button onClick={() => setLogs(loadAudit())} style={{ background: "#18181f", border: "1px solid #2a2a38", borderRadius: 6, padding: "7px 14px", color: "#22d3ee", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: 13 }}>↺ Atualizar</button>
        <span style={{ fontSize: 12, color: "#5a5a72" }}>{filtered.length} registro(s)</span>
      </div>
      <div style={{ background: "#18181f", border: "1px solid #2a2a38", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>{["Data/Hora","Usuário","Ação","Alvo","Dados"].map(h => <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: "#5a5a72", fontSize: 11, fontWeight: 700, textTransform: "uppercase", borderBottom: "1px solid #2a2a38", background: "#111118" }}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ padding: "2rem", textAlign: "center", color: "#5a5a72" }}>Nenhum registro de auditoria encontrado.</td></tr>
            )}
            {filtered.map((l, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #1e1e28" }}>
                <td style={{ padding: "8px 14px", fontFamily: "JetBrains Mono, monospace", color: "#9090a8", fontSize: 11 }}>{new Date(l.ts).toLocaleString("pt-BR")}</td>
                <td style={{ padding: "8px 14px", fontWeight: 600, color: "#22d3ee" }}>{l.user}</td>
                <td style={{ padding: "8px 14px" }}>
                  <span style={{ background: "#0e4f5f", color: "#22d3ee", borderRadius: 99, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{l.acao}</span>
                </td>
                <td style={{ padding: "8px 14px", color: "#e8e8f0", fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>{l.alvo}</td>
                <td style={{ padding: "8px 14px", color: "#5a5a72", fontSize: 11, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.dados}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// IMPORTAR
// ═══════════════════════════════════════════════════════════
function ImportPage({ onImport, currentUser }) {
  const [msg, setMsg] = useState("");
  function handleFile(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const lines = ev.target.result.trim().split("\n");
      const db = loadDB(); let ok = 0, errs = 0;
      lines.slice(1).forEach(line => {
        const cols = line.split(",").map(c => c.trim().replace(/"/g, ""));
        if (cols.length < 5) { errs++; return; }
        const [dt, specId, primeiras, retornos, ofertadas, realizadas, livres, emergencias, faltas] = cols;
        if (!dt.match(/^\d{4}-\d{2}-\d{2}$/) || !SPECS.find(s => s.id === specId)) { errs++; return; }
        if (!db[dt]) db[dt] = {};
        db[dt][specId] = { primeiras: +primeiras || 0, retornos: +retornos || 0, ofertadas: +ofertadas || 0, realizadas: +realizadas || 0, livres: +livres || 0, emergencias: +emergencias || 0, faltas: +faltas || 0 };
        ok++;
      });
      saveDB(db);
      addAuditLog(currentUser, "importar CSV", `${ok} registros`, {});
      onImport(db);
      setMsg(`✓ ${ok} registros importados. ${errs > 0 ? `${errs} linhas ignoradas.` : ""}`);
    };
    reader.readAsText(file);
  }
  function downloadTemplate() {
    const rows = ["data,especialidade,primeiras,retornos,ofertadas,realizadas,livres,emergencias,faltas","2025-01-02,cirurgia_geral,5,12,20,17,3,2,1","2025-01-02,oftalmologia,4,10,18,14,4,0,0","2025-01-02,ginecologia,3,9,15,12,3,1,0","2025-01-02,urologia,3,8,14,11,3,0,2","2025-01-02,ortopedia,4,12,20,16,4,1,4"];
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" })); a.download = "modelo_hnsn.csv"; a.click();
  }
  const inp = { background: "#18181f", border: "1px solid #2a2a38", borderRadius: 6, padding: "8px 10px", color: "#e8e8f0", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  return (
    <div style={{ padding: "1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Importar Dados</div>
      <div style={{ fontSize: 12, color: "#5a5a72", marginBottom: "1.5rem" }}>Carregue histórico via CSV</div>
      <div style={{ background: "#18181f", border: "1px solid #2a2a38", borderRadius: 10, padding: "1.25rem", marginBottom: "1rem" }}>
        <label style={{ display: "flex", flexDirection: "column", alignItems: "center", border: "2px dashed #3a3a4e", borderRadius: 8, padding: "2rem", cursor: "pointer", marginBottom: 12 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
          <strong>Clique para selecionar</strong>
          <div style={{ fontSize: 12, color: "#5a5a72", marginTop: 4 }}>CSV com as colunas abaixo</div>
          <input type="file" accept=".csv" onChange={handleFile} style={{ display: "none" }} />
        </label>
        {msg && <div style={{ fontSize: 13, color: msg.startsWith("✓") ? "#34d399" : "#fbbf24", fontWeight: 600, marginBottom: 10 }}>{msg}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={downloadTemplate} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "7px 16px", fontWeight: 700, cursor: "pointer" }}>⬇ Baixar Modelo CSV</button>
          <button onClick={() => { if (confirm("Apagar TODOS os dados?")) { localStorage.removeItem(K); onImport({}); addAuditLog(currentUser, "limpar dados", "todos", {}); } }} style={{ background: "transparent", color: "#fb7185", border: "1px solid #3d0f18", borderRadius: 6, padding: "7px 16px", fontWeight: 700, cursor: "pointer" }}>🗑 Apagar todos os dados</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// USUÁRIOS
// ═══════════════════════════════════════════════════════════
function UsersPage({ currentUser }) {
  const [users, setUsers] = useState(() => loadUsers());
  const [form, setForm]   = useState({ name: "", username: "", password: "", role: "visualizador" });
  const [editId, setEditId] = useState(null);
  const [msg, setMsg]     = useState("");
  function handleSave() {
    if (!form.name || !form.username || (!editId && !form.password)) { setMsg("⚠️ Preencha nome, usuário e senha."); return; }
    if (users.find(u => u.username === form.username.toLowerCase() && u.id !== editId)) { setMsg("⚠️ Usuário já existe."); return; }
    // Protege: só adm_master pode criar outro adm_master
    if (form.role === "adm_master" && currentUser.role !== "adm_master") { setMsg("⚠️ Apenas ADM Master pode criar outro ADM Master."); return; }
    let updated;
    if (editId) updated = users.map(u => u.id === editId ? { ...u, name: form.name, username: form.username.toLowerCase(), role: form.role, ...(form.password ? { password: form.password } : {}) } : u);
    else updated = [...users, { id: Date.now().toString(), name: form.name, username: form.username.toLowerCase(), password: form.password, role: form.role }];
    saveUsers(updated); setUsers(updated);
    addAuditLog(currentUser, editId ? "editar usuário" : "criar usuário", form.username, { role: form.role });
    setForm({ name: "", username: "", password: "", role: "visualizador" }); setEditId(null);
    setMsg(editId ? "✓ Atualizado!" : "✓ Usuário criado!"); setTimeout(() => setMsg(""), 2500);
  }
  const inp = { background: "#18181f", border: "1px solid #2a2a38", borderRadius: 6, padding: "8px 10px", color: "#e8e8f0", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  return (
    <div style={{ padding: "1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Gerenciar Usuários</div>
      <div style={{ fontSize: 12, color: "#5a5a72", marginBottom: "1.5rem" }}>Crie, edite e controle os níveis de acesso</div>
      <div style={{ background: "#18181f", border: "1px solid #2a2a38", borderRadius: 10, marginBottom: "1.25rem", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #2a2a38", fontSize: 12, fontWeight: 700, color: "#5a5a72", textTransform: "uppercase", letterSpacing: ".07em" }}>Usuários cadastrados ({users.length})</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>{["Nome","Usuário","Perfil","Permissões","Ações"].map(h => <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#5a5a72", fontSize: 11, fontWeight: 700, textTransform: "uppercase", borderBottom: "1px solid #2a2a38", background: "#111118" }}>{h}</th>)}</tr></thead>
          <tbody>
            {users.map(u => {
              const role = ROLES[u.role]; const isMe = u.id === currentUser.id;
              return (
                <tr key={u.id} style={{ background: isMe ? "#1a1a28" : "transparent" }}>
                  <td style={{ padding: "10px 14px", color: "#e8e8f0", fontWeight: 600 }}>{u.name} {isMe && <span style={{ fontSize: 10, background: "#0e4f5f", color: "#22d3ee", borderRadius: 99, padding: "1px 6px", marginLeft: 6 }}>você</span>}</td>
                  <td style={{ padding: "10px 14px", fontFamily: "JetBrains Mono, monospace", color: "#9090a8" }}>{u.username}</td>
                  <td style={{ padding: "10px 14px" }}><span style={{ background: role.color + "22", color: role.color, borderRadius: 99, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>{role.label}</span></td>
                  <td style={{ padding: "10px 14px", fontSize: 11, color: "#5a5a72" }}>{role.desc}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => { setEditId(u.id); setForm({ name: u.name, username: u.username, password: "", role: u.role }); }} style={{ background: "#1e1e28", border: "1px solid #2a2a38", borderRadius: 5, padding: "4px 10px", color: "#22d3ee", cursor: "pointer", fontSize: 12 }}>✏️ Editar</button>
                      {!isMe && <button onClick={() => { if (confirm("Excluir?")) { const up = users.filter(x => x.id !== u.id); saveUsers(up); setUsers(up); addAuditLog(currentUser, "excluir usuário", u.username, {}); } }} style={{ background: "transparent", border: "1px solid #3d0f18", borderRadius: 5, padding: "4px 10px", color: "#fb7185", cursor: "pointer", fontSize: 12 }}>🗑</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ background: "#18181f", border: "1px solid #2a2a38", borderRadius: 10, padding: "1.25rem" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#5a5a72", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 14 }}>{editId ? "✏️ Editar Usuário" : "➕ Novo Usuário"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
          {[["name","Nome completo","text","Ex: Dr. João"],["username","Usuário (login)","text","Ex: joao"],["password",editId ? "Nova senha (opcional)" : "Senha","password","••••••••"]].map(([key,label,type,placeholder]) => (
            <div key={key}><label style={{ fontSize: 11, fontWeight: 700, color: "#9090a8", display: "block", marginBottom: 5 }}>{label}</label>
              <input type={type} value={form[key]} placeholder={placeholder} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} onFocus={e => e.target.style.borderColor = "#22d3ee"} onBlur={e => e.target.style.borderColor = "#2a2a38"} style={inp} /></div>
          ))}
          <div><label style={{ fontSize: 11, fontWeight: 700, color: "#9090a8", display: "block", marginBottom: 5 }}>Perfil</label>
            <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} style={{ ...inp, cursor: "pointer" }}>
              {Object.entries(ROLES).map(([id, r]) => <option key={id} value={id}>{r.label}</option>)}
            </select></div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={handleSave} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{editId ? "✓ Salvar" : "➕ Criar"}</button>
          {editId && <button onClick={() => { setEditId(null); setForm({ name:"",username:"",password:"",role:"visualizador" }); }} style={{ background: "#18181f", color: "#9090a8", border: "1px solid #2a2a38", borderRadius: 6, padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>}
          {msg && <span style={{ fontSize: 13, color: msg.startsWith("✓") ? "#34d399" : "#fbbf24", fontWeight: 600 }}>{msg}</span>}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SUPABASE SETUP PAGE
// ═══════════════════════════════════════════════════════════
function SupabasePage() {
  return (
    <div style={{ padding: "1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>☁️ Banco de Dados — Supabase</div>
      <div style={{ fontSize: 12, color: "#5a5a72", marginBottom: "1.5rem" }}>Configure o banco de dados para sincronização em tempo real entre dispositivos</div>

      <div style={{ background: USE_SUPABASE ? "#0a3d2a" : "#3d2e06", border: `1px solid ${USE_SUPABASE ? "#34d399" : "#fbbf24"}`, borderRadius: 10, padding: "1rem 1.25rem", marginBottom: "1.25rem" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: USE_SUPABASE ? "#34d399" : "#fbbf24" }}>
          {USE_SUPABASE ? "✅ Supabase conectado e ativo" : "⚠️ Supabase não configurado — usando localStorage"}
        </div>
        <div style={{ fontSize: 12, color: "#9090a8", marginTop: 4 }}>
          {USE_SUPABASE ? "Os dados estão sendo sincronizados em tempo real." : "Os dados ficam somente neste navegador. Configure o Supabase para persistência real."}
        </div>
      </div>

      {[
        { step: "1", title: "Criar conta gratuita no Supabase", desc: "Acesse supabase.com e clique em 'Start your project'. Use sua conta Google ou crie um e-mail/senha.", action: "Acessar supabase.com →", url: "https://supabase.com" },
        { step: "2", title: "Criar um novo projeto", desc: "Clique em 'New Project', dê o nome 'medflow-hnsn', escolha a região 'South America (São Paulo)' e defina uma senha forte." },
        { step: "3", title: "Criar as tabelas", desc: "Vá em SQL Editor e execute o script abaixo para criar as tabelas necessárias." },
        { step: "4", title: "Pegar as credenciais", desc: "Vá em Settings → API. Copie a 'Project URL' e a 'anon public key'." },
        { step: "5", title: "Adicionar as credenciais ao projeto", desc: "No arquivo index.html do MedFlow, adicione antes do </body>:\n\n<script>\n  window.SUPABASE_URL = 'sua-url-aqui';\n  window.SUPABASE_KEY = 'sua-chave-aqui';\n</script>" },
      ].map(({ step, title, desc, action, url }) => (
        <div key={step} style={{ background: "#18181f", border: "1px solid #2a2a38", borderRadius: 10, padding: "1rem 1.25rem", marginBottom: ".75rem", display: "flex", gap: "1rem" }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#22d3ee22", border: "1px solid #22d3ee", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#22d3ee", flexShrink: 0 }}>{step}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{title}</div>
            <div style={{ fontSize: 12, color: "#9090a8", lineHeight: 1.6, whiteSpace: "pre-line" }}>{desc}</div>
            {action && url && <a href={url} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8, color: "#22d3ee", fontSize: 12, fontWeight: 700 }}>{action}</a>}
          </div>
        </div>
      ))}

      <div style={{ background: "#18181f", border: "1px solid #2a2a38", borderRadius: 10, padding: "1rem 1.25rem" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#5a5a72", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>📄 SQL — Execute no Supabase SQL Editor</div>
        <pre style={{ background: "#0e0e14", borderRadius: 8, padding: "1rem", fontSize: 11, color: "#34d399", overflowX: "auto", lineHeight: 1.6 }}>{`-- Tabela de atendimentos
create table if not exists atendimentos (
  id bigserial primary key,
  data date not null,
  especialidade text not null,
  primeiras int default 0,
  retornos int default 0,
  ofertadas int default 0,
  realizadas int default 0,
  livres int default 0,
  emergencias int default 0,
  faltas int default 0,
  usuario text,
  created_at timestamptz default now(),
  unique(data, especialidade)
);

-- Tabela de auditoria
create table if not exists auditoria (
  id bigserial primary key,
  ts timestamptz default now(),
  usuario text,
  acao text,
  alvo text
);

-- Habilitar acesso público (RLS off para projetos internos)
alter table atendimentos enable row level security;
alter table auditoria enable row level security;

create policy "allow all" on atendimentos for all using (true) with check (true);
create policy "allow all" on auditoria for all using (true) with check (true);`}</pre>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError]       = useState("");
  const [shake, setShake]       = useState(false);
  function handleLogin() {
    const user = loadUsers().find(u => u.username === username.trim().toLowerCase() && u.password === password);
    if (user) { saveSession(user); onLogin(user); }
    else { setError("Usuário ou senha incorretos."); setShake(true); setTimeout(() => setShake(false), 500); }
  }
  const inp = { width: "100%", padding: "11px 14px", borderRadius: 8, border: "1.5px solid #e5e7eb", fontSize: 14, outline: "none", fontFamily: "Inter, sans-serif", background: "#fff", color: "#111", transition: "border .15s", boxSizing: "border-box" };
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #f0f9ff 0%, #e0e7ff 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "2.5rem 2rem", width: 380, boxShadow: "0 20px 60px rgba(0,0,0,.12)", animation: shake ? "shake .4s ease" : "fadeIn .4s ease" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, margin: "0 auto 12px", background: "linear-gradient(135deg, #22d3ee, #a78bfa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, boxShadow: "0 8px 24px rgba(34,211,238,.3)" }}>⚕</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", letterSpacing: "-.02em" }}>MedFlow HNSN</div>
          <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>Gestão de Atendimentos</div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>USUÁRIO</label>
          <input type="text" value={username} placeholder="Digite seu usuário" onChange={e => { setUsername(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && handleLogin()} onFocus={e => e.target.style.borderColor = "#22d3ee"} onBlur={e => e.target.style.borderColor = "#e5e7eb"} style={inp} autoComplete="username" />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>SENHA</label>
          <div style={{ position: "relative" }}>
            <input type={showPass ? "text" : "password"} value={password} placeholder="••••••••" onChange={e => { setPassword(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && handleLogin()} onFocus={e => e.target.style.borderColor = "#22d3ee"} onBlur={e => e.target.style.borderColor = "#e5e7eb"} style={{ ...inp, paddingRight: 44 }} autoComplete="current-password" />
            <button onClick={() => setShowPass(p => !p)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#94a3b8" }}>{showPass ? "🙈" : "👁"}</button>
          </div>
        </div>
        {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#dc2626", marginBottom: 14 }}>⚠️ {error}</div>}
        <button onClick={handleLogin} style={{ width: "100%", padding: "12px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #22d3ee, #6366f1)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "Inter, sans-serif", boxShadow: "0 4px 14px rgba(34,211,238,.35)" }}>Entrar</button>
        <div style={{ textAlign: "center", marginTop: 20, fontSize: 12, color: "#cbd5e1" }}>Acesso restrito · Hospital Nossa Senhora de Navegantes</div>
      </div>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}`}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// APP PRINCIPAL
// ═══════════════════════════════════════════════════════════
export default function App() {
  const [currentUser, setCurrentUser] = useState(() => loadSession());
  const [db, setDb]     = useState(() => loadDB());
  const [active, setActive] = useState("overview");
  const handleSave = useCallback(newDb => setDb({ ...newDb }), []);

  // Permissões por nível
  const isMaster    = currentUser?.role === "adm_master";
  const isSilver    = currentUser?.role === "adm_silver";
  const isAnalista  = currentUser?.role === "analista";
  const isReadOnly  = currentUser?.role === "visualizador";

  const canEdit     = isMaster || isSilver || isAnalista === false && !isReadOnly; // silver e acima lançam dados
  const canLaunch   = isMaster || isSilver;   // master e silver lançam dados
  const canPrint    = isMaster || isSilver || isAnalista; // master, silver e analista geram dashboard
  const canImport   = isMaster || isSilver;   // master e silver importam
  const canAudit    = isMaster || isSilver;   // master e silver veem auditoria
  const canSupabase = isMaster;               // só master acessa banco
  const canUsers    = isMaster;               // só master gerencia usuários

  function handleLogout() { clearSession(); setCurrentUser(null); setActive("overview"); }

  if (!currentUser) return <LoginScreen onLogin={u => setCurrentUser(u)} />;

  const now = new Date();
  const role = ROLES[currentUser.role];
  const sidebarItems = [
    { id: "overview",  icon: "📊", label: "Visão Geral" },
    { id: "d1" },
    ...SPECS.map(s => ({ id: s.id, icon: "🏥", label: s.label, color: s.color })),
    { id: "d2" },
    ...(canPrint    ? [{ id: "print",     icon: "🖨️", label: "Imprimir Dashboard" }] : []),
    ...(canAudit    ? [{ id: "auditoria", icon: "📋", label: "Auditoria" }]           : []),
    ...(canImport   ? [{ id: "import",    icon: "📂", label: "Importar Dados" }]      : []),
    ...(canSupabase ? [{ id: "supabase",  icon: "☁️", label: "Banco de Dados" }]      : []),
    ...(canUsers    ? [{ id: "users",     icon: "👥", label: "Usuários" }]            : []),
  ];
  const currentSpec = SPECS.find(s => s.id === active);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0a0a0f", color: "#e8e8f0", fontFamily: "Inter, sans-serif", fontSize: 14 }}>
      {/* HEADER */}
      <div style={{ background: "#111118", borderBottom: "1px solid #2a2a38", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 1.5rem", flexShrink: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: "linear-gradient(135deg, #22d3ee, #a78bfa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".9rem" }}>⚕</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: ".02em" }}>MedFlow HNSN</div>
            <div style={{ fontSize: 10, color: "#5a5a72", fontFamily: "JetBrains Mono, monospace" }}>Gestão de Atendimentos · Ambulatório</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 11, color: "#9090a8", fontFamily: "JetBrains Mono, monospace" }}>{now.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{currentUser.name}</div>
              <div style={{ fontSize: 10, color: role.color, fontWeight: 700 }}>{role.label}</div>
            </div>
            <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, background: role.color + "22", border: `1px solid ${role.color}44` }}>
              {currentUser.role === "adm_master" ? "👑" : currentUser.role === "adm_silver" ? "🥈" : currentUser.role === "analista" ? "📊" : "👁"}
            </div>
            <button onClick={handleLogout} style={{ background: "transparent", border: "1px solid #2a2a38", borderRadius: 6, padding: "5px 10px", color: "#5a5a72", cursor: "pointer", fontSize: 12, fontFamily: "Inter, sans-serif" }}
              onMouseOver={e => { e.currentTarget.style.borderColor = "#fb7185"; e.currentTarget.style.color = "#fb7185"; }}
              onMouseOut={e => { e.currentTarget.style.borderColor = "#2a2a38"; e.currentTarget.style.color = "#5a5a72"; }}>
              Sair
            </button>
          </div>
        </div>
      </div>

      {/* ALERTAS */}
      <AlertBanner db={db} />

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* SIDEBAR */}
        <nav style={{ width: 215, minWidth: 215, background: "#111118", borderRight: "1px solid #2a2a38", display: "flex", flexDirection: "column", padding: ".75rem 0", overflowY: "auto", flexShrink: 0 }}>
          {isReadOnly && <div style={{ margin: "0 10px 8px", background: "#1e1e28", border: "1px solid #3a3a4e", borderRadius: 6, padding: "6px 10px", fontSize: 11, color: "#5a5a72", textAlign: "center" }}>👁 Somente visualização</div>}
          {sidebarItems.map((item, i) => {
            if (item.id?.startsWith("d")) return <div key={i} style={{ height: 1, background: "#1e1e28", margin: ".5rem 0" }} />;
            const isActive = active === item.id;
            return (
              <button key={item.id} onClick={() => setActive(item.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: ".5rem 1rem", border: "none", borderLeft: `3px solid ${isActive ? (item.color || "#22d3ee") : "transparent"}`, color: isActive ? (item.color || "#22d3ee") : "#9090a8", cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: 500, fontFamily: "Inter, sans-serif", transition: "all .12s", background: isActive ? "#18181f" : "transparent" }}>
                <span style={{ fontSize: 14, width: 18, textAlign: "center" }}>{item.icon}</span>{item.label}
              </button>
            );
          })}
        </nav>

        {/* CONTENT */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {active === "overview"  && <Overview db={db} />}
          {currentSpec            && <EspecialidadePage spec={currentSpec} db={db} onSave={handleSave} readOnly={!canLaunch} currentUser={currentUser} />}
          {active === "print"     && canPrint    && <PrintDashboard db={db} />}
          {active === "auditoria" && canAudit    && <AuditoriaPage />}
          {active === "import"    && canImport   && <ImportPage onImport={newDb => setDb({ ...newDb })} currentUser={currentUser} />}
          {active === "supabase"  && canSupabase && <SupabasePage />}
          {active === "users"     && canUsers    && <UsersPage currentUser={currentUser} />}
        </div>
      </div>
    </div>
  );
}
