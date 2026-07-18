import { useState, useEffect, useCallback, useRef } from "react";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, Legend, ComposedChart, Area
} from "recharts";

// ═══════════════════════════════════════════════════════════
// SUPABASE CONFIG — substitua pelas suas credenciais
// ═══════════════════════════════════════════════════════════
const SUPABASE_URL = typeof window !== "undefined" ? (import.meta.env?.VITE_SUPABASE_URL || window.SUPABASE_URL || "") : "";
const SUPABASE_KEY = typeof window !== "undefined" ? (import.meta.env?.VITE_SUPABASE_KEY || window.SUPABASE_KEY || "") : "";
const USE_SUPABASE = SUPABASE_URL.length > 10 && SUPABASE_KEY.length > 10;

// Identidade do hospital — permite usar o MESMO app para vários hospitais,
// cada um com seu próprio banco (VITE_SUPABASE_*) e seu nome (VITE_HOSPITAL_*).
const HOSPITAL_SIGLA = import.meta.env?.VITE_HOSPITAL_SIGLA || "HNSN";
const HOSPITAL_NOME  = import.meta.env?.VITE_HOSPITAL_NOME  || "Hospital Nossa Senhora de Navegantes";

async function sbFetch(path, opts = {}) {
  if (!USE_SUPABASE) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${AUTH_TOKEN || SUPABASE_KEY}`,
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
  // Cores categóricas validadas (contraste + daltonismo) nos temas claro e escuro
  { id: "cirurgia_geral", label: "Cirurgia Geral", metaM: 360,  metaA: 4320, meta1a: 1320, color: "#0d9488" },
  { id: "oftalmologia",   label: "Oftalmologia",   metaM: 240,  metaA: 2880, meta1a: 864,  color: "#3b82f6" },
  { id: "ginecologia",    label: "Ginecologia",    metaM: 240,  metaA: 2880, meta1a: 864,  color: "#d97706" },
  { id: "urologia",       label: "Urologia",       metaM: 240,  metaA: 2880, meta1a: 864,  color: "#6366f1" },
  { id: "ortopedia",      label: "Ortopedia",      metaM: 387,  metaA: 4644, meta1a: 1394, color: "#e11d48" },
];
const MONTHS      = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MONTHS_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

// ═══════════════════════════════════════════════════════════
// MARCA VALENTRAX — Healthcare Operations
// Símbolo: hub radial de correntes curvas convergindo no núcleo
// (setores do hospital conectados ao centro analítico).
// ═══════════════════════════════════════════════════════════
const VX = { turquesa: "#2dd4bf", azul: "#38bdf8", royal: "#1d4ed8", prata: "#8d99ab", marinho: "#101c30", marinho2: "#14233a", borda: "#23395a" };
function VxLogo({ size = 30 }) {
  const ray = (rot, cor, w, r, op = 1) => (
    <g key={rot} transform={`rotate(${rot} 36 36)`} opacity={op}>
      <path d="M45 35.4 C 51 34.6, 55.5 32.6, 59 29.6" stroke={cor} strokeWidth={w} fill="none" strokeLinecap="round" />
      <circle cx="60.6" cy="28.2" r={r} fill={cor} />
    </g>
  );
  return (
    <svg viewBox="0 0 72 72" width={size} height={size} aria-hidden="true" style={{ flexShrink: 0 }}>
      {[0, 90, 180, 270].map(a => ray(a, VX.turquesa, 3.2, 2.8))}
      {[45, 225].map(a => ray(a, VX.azul, 2.5, 2.2))}
      {[135, 315].map(a => ray(a, VX.prata, 2.5, 2.2, 0.85))}
      <circle cx="36" cy="36" r="12.5" fill="none" stroke={VX.turquesa} strokeWidth="1" opacity=".25" />
      <circle cx="36" cy="36" r="8.2" fill={VX.turquesa} />
    </svg>
  );
}
// Wordmark VALENTRAX com o X em degradê azul
function VxWordmark({ size = 14, color = "inherit", spacing = ".1em" }) {
  return (
    <span style={{ fontWeight: 800, fontSize: size, letterSpacing: spacing, color }}>
      VALENTRA<span style={{ background: `linear-gradient(135deg, ${VX.azul}, ${VX.royal})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>X</span>
    </span>
  );
}
// Ícones de linha (profissionais, sem emoji) — traço 1.8, herdam a cor do texto
const ICON_PATHS = {
  dashboard: <><rect x="3" y="3" width="7.5" height="9.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="5.5" rx="1.5"/><rect x="13.5" y="11.5" width="7.5" height="9.5" rx="1.5"/><rect x="3" y="15.5" width="7.5" height="5.5" rx="1.5"/></>,
  clinic:    <><path d="M4 21 V6 a2 2 0 0 1 2-2 h12 a2 2 0 0 1 2 2 v15"/><path d="M2 21 h20"/><path d="M12 7 v6 M9 10 h6"/><path d="M9.5 21 v-4 h5 v4"/></>,
  bed:       <><path d="M3 6 v12"/><path d="M3 15 h18 v3"/><path d="M3 11 h18 v4"/><circle cx="7" cy="8.5" r="1.6"/><path d="M11 11 V9 a1.5 1.5 0 0 1 1.5-1.5 H19 a2 2 0 0 1 2 2 V11"/></>,
  shield:    <><path d="M12 3 l7 3 v5.5 c0 4.2-2.9 7.4-7 9.5 -4.1-2.1-7-5.3-7-9.5 V6 z"/><path d="M9.2 12 l2 2 3.6-4"/></>,
  printer:   <><path d="M7 8 V4 h10 v4"/><rect x="4" y="8" width="16" height="8" rx="1.5"/><path d="M7 13 h10 v7 H7 z"/></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5 V3 h6 v1.5"/><path d="M8.5 9.5 h7 M8.5 13 h7 M8.5 16.5 h4.5"/></>,
  upload:    <><path d="M4 17 v3 h16 v-3"/><path d="M12 15 V4"/><path d="M7.5 8.5 L12 4 l4.5 4.5"/></>,
  cloud:     <><path d="M7 18 a4.5 4.5 0 0 1 -.6-8.96 6 6 0 0 1 11.7 1.2 A4 4 0 0 1 17.5 18 z"/></>,
  users:     <><circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5 c0-3 2.5-5 5.5-5 s5.5 2 5.5 5"/><circle cx="16.8" cy="9.5" r="2.5"/><path d="M16.5 14.6 c2.4.3 4 2 4 4.4"/></>,
  activity:  <path d="M3 12 h4 l2.5-6.5 5 13 2.5-6.5 H21"/>,
  record:    <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 13 h2 l1-2.5 2 5 1-2.5 H16"/><path d="M9 7 h6"/></>,
  scissors:  <><circle cx="6" cy="6" r="2.6"/><circle cx="6" cy="18" r="2.6"/><path d="M8.2 7.6 L20 18 M8.2 16.4 L20 6 M13.2 12 l1.6 1.4"/></>,
};
function Icon({ name, size = 15 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      {ICON_PATHS[name] || null}
    </svg>
  );
}
const K = "hnsn_v5";

// ═══════════════════════════════════════════════════════════
// STORAGE — localStorage + Supabase fallback
// ═══════════════════════════════════════════════════════════
const loadDB  = () => { try { return JSON.parse(localStorage.getItem(K) || "{}"); } catch { return {}; } };
const saveDB  = d  => localStorage.setItem(K, JSON.stringify(d));
const todayStr = () => new Date().toISOString().slice(0, 10);

// Lê TODOS os atendimentos do Supabase e reconstrói o formato db[data][especialidade].
// É o que faz os números aparecerem em qualquer computador (não só onde foram digitados).
async function loadFromSupabase() {
  const rows = await sbFetch("atendimentos?select=*");
  if (!Array.isArray(rows)) return null;
  const db = {};
  for (const r of rows) {
    if (!db[r.data]) db[r.data] = {};
    db[r.data][r.especialidade] = {
      primeiras:   r.primeiras   || 0,
      retornos:    r.retornos    || 0,
      ofertadas:   r.ofertadas   || 0,
      realizadas:  r.realizadas  || 0,
      livres:      r.livres      || 0,
      emergencias: r.emergencias || 0,
      faltas:      r.faltas      || 0,
    };
  }
  return db;
}

// Retorna "cloud" se o dado foi confirmado no Supabase, "local" caso contrário —
// para a interface avisar quando o registro ficou salvo só neste aparelho.
async function saveRecord(date, specId, data, user) {
  const db = loadDB();
  if (!db[date]) db[date] = {};
  db[date][specId] = data;
  saveDB(db);
  // Supabase
  let syncStatus = "local";
  if (USE_SUPABASE) {
    const res = await sbFetch("atendimentos?on_conflict=data,especialidade", {
      method: "POST",
      headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ data: date, especialidade: specId, ...data, usuario: user?.name || null }),
    });
    if (res) syncStatus = "cloud";
  }
  // Auditoria
  addAuditLog(user, "salvar", `${date} / ${specId}`, data);
  return syncStatus;
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
    return { mes: m, ...d, total: d.primeiras + d.retornos + d.emergencias };
  });
}
// Aggregate acumulado — todos os dados disponíveis
function aggregateTotal(db, specId) {
  let r = { primeiras: 0, retornos: 0, ofertadas: 0, realizadas: 0, livres: 0, emergencias: 0, faltas: 0 };
  Object.entries(db).forEach(([, day]) => {
    const s = day[specId]; if (!s) return;
    Object.keys(r).forEach(k => { r[k] += s[k] || 0; });
  });
  return { ...r, total: r.primeiras + r.retornos + r.emergencias };
}
// Comparativo mês vs mês anterior e mesmo mês ano anterior
function comparativo(db, ano, mes, specId) {
  const cur  = aggregateMes(db, ano, mes, specId);
  const prev = mes > 0 ? aggregateMes(db, ano, mes - 1, specId) : aggregateMes(db, ano - 1, 11, specId);
  const ly   = aggregateMes(db, ano - 1, mes, specId);
  const total     = cur.primeiras + cur.retornos + cur.emergencias;
  const prevTotal = prev.primeiras + prev.retornos + prev.emergencias;
  const lyTotal   = ly.primeiras + ly.retornos + ly.emergencias;
  return {
    mesAtual: total, mesAnterior: prevTotal, mesAnteriorLabel: mes > 0 ? MONTHS[mes-1] : MONTHS[11],
    mesAnoAnterior: lyTotal, variacaoMes: prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : 0,
    variacaoAno: lyTotal > 0 ? ((total - lyTotal) / lyTotal) * 100 : 0,
  };
}

// ═══════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════
const SESSION_KEY = "hnsn_auth_v2";   // { access_token, refresh_token, user }
const AUTH_DOMAIN = "@hnsn.local";    // "laura" -> laura@hnsn.local (o Supabase Auth exige formato de e-mail)
const ROLES = {
  adm_master:   { label: "ADM Master",   color: "#f59e0b", desc: "Acesso total — único que cria usuários, acessa banco e auditoria" },
  adm_silver:   { label: "ADM Silver",   color: "#22d3ee", desc: "Insere dados, importa, auditoria e gera dashboard" },
  analista:     { label: "Analista",     color: "#38bdf8", desc: "Visualiza e gera dashboard para impressão" },
  visualizador: { label: "Visualizador", color: "var(--text-muted)", desc: "Somente leitura — sem gerar dashboard" },
};

// Token JWT do usuário logado — enviado nas chamadas ao banco (ver sbFetch).
let AUTH_TOKEN = null;

const loadSession = () => {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    AUTH_TOKEN = s?.access_token || null;
    return s?.user || null;
  } catch { return null; }
};
const saveSession = s => { AUTH_TOKEN = s?.access_token || null; localStorage.setItem(SESSION_KEY, JSON.stringify(s)); };
const clearSession = () => { AUTH_TOKEN = null; localStorage.removeItem(SESSION_KEY); };

// Login REAL via Supabase Auth. Retorna { ok, user } ou { ok:false, error }.
async function signIn(username, password) {
  if (!USE_SUPABASE) return { ok: false, error: "Login indisponível (banco não configurado)." };
  const email = username.trim().toLowerCase() + AUTH_DOMAIN;
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch { return { ok: false, error: "Sem conexão com o servidor." }; }
  if (!res.ok) return { ok: false, error: "Usuário ou senha incorretos." };
  const auth = await res.json();
  AUTH_TOKEN = auth.access_token;
  let profile = null;
  try {
    const p = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${auth.user.id}&select=username,nome,role`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${auth.access_token}` },
    });
    if (p.ok) profile = (await p.json())[0];
  } catch {}
  const user = {
    id: auth.user.id,
    name: profile?.nome || username,
    username: profile?.username || username.trim().toLowerCase(),
    role: profile?.role || "visualizador",
  };
  saveSession({ access_token: auth.access_token, refresh_token: auth.refresh_token, user });
  return { ok: true, user };
}

// Troca a senha do próprio usuário logado (Supabase Auth).
async function changeMyPassword(newPassword) {
  if (!AUTH_TOKEN) return { ok: false, error: "Sessão expirada. Entre novamente." };
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: "PUT",
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${AUTH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); return { ok: false, error: e.msg || e.error_description || "Não foi possível trocar a senha." }; }
    return { ok: true };
  } catch { return { ok: false, error: "Sem conexão." }; }
}

// Lista os perfis/usuários (somente leitura) para a tela de Usuários.
async function loadProfiles() {
  const rows = await sbFetch("profiles?select=username,nome,role&order=role");
  return Array.isArray(rows) ? rows : [];
}

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
      alerts.push({ level: "success", spec: spec.label, msg: `${spec.label} atingiu 100% da meta mensal!`, color: spec.color });

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
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={10} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={rc} strokeWidth={10}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 60 60)" style={{ transition: "stroke-dasharray .6s ease" }} />
        <text x={cx} y={cy - 6} textAnchor="middle" fill={rc} fontSize={18} fontWeight={700} fontFamily="JetBrains Mono, monospace">{Math.round(pct)}%</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="var(--text-3)" fontSize={10} fontFamily="Inter, sans-serif">
          {isOver ? "✓ meta" : `${fmt(Math.max(max - value, 0))} falta`}
        </text>
      </svg>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{sub}</div>}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color, big }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderTop: `2px solid ${color}`, borderRadius: 8, padding: "12px 14px", flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: big ? 28 : 22, fontWeight: 600, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>{sub}</div>}
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
  if (pct >= 100)                          { cor = "#34d399"; icone = "●"; texto = "Meta atingida!"; }
  else if (diasRestantes > 0 && pct >= 70) { cor = "#fbbf24"; icone = "●"; texto = "Precisa acelerar"; }
  else if (pct < 40 && diasRestantes < 10) { cor = "#fb7185"; icone = "●"; texto = "Meta em risco"; }
  else if (pct >= 40)                      { cor = "#fbbf24"; icone = "●"; texto = "Atenção"; }
  else                                     { cor = "#fb7185"; icone = "●"; texto = "Ritmo insuficiente"; }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, background: cor + "18", border: `1px solid ${cor}44`, borderRadius: 6, padding: "4px 10px" }}>
      <span style={{ fontSize: 14, color: cor }}>{icone}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: cor }}>{texto}</span>
    </div>
  );
}

const customTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--surface-3)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "8px 12px", fontSize: 12 }}>
      <div style={{ color: "var(--text-3)", marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || "var(--text)", display: "flex", gap: 8, alignItems: "center" }}>
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
    <div style={{ background: "var(--bg-2)", borderBottom: "1px solid var(--border)" }}>
      <button onClick={() => setOpen(p => !p)} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "6px 1.5rem",
        background: "none", border: "none", cursor: "pointer", textAlign: "left",
      }}>
        {crits > 0 && <span style={{ background: "#3d0f18", color: "#fb7185", borderRadius: 99, fontSize: 11, fontWeight: 700, padding: "2px 8px" }}>{crits} crítico{crits > 1 ? "s" : ""}</span>}
        {warns > 0 && <span style={{ background: "#3d2e06", color: "#fbbf24", borderRadius: 99, fontSize: 11, fontWeight: 700, padding: "2px 8px" }}>{warns} atenção</span>}
        {alerts.filter(a => a.level === "success").length > 0 && <span style={{ background: "#0a3d2a", color: "#34d399", borderRadius: 99, fontSize: 11, fontWeight: 700, padding: "2px 8px" }}>{alerts.filter(a => a.level === "success").length} meta(s) atingida(s)</span>}
        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>{open ? "▲ fechar" : "▼ ver alertas"}</span>
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
              ● {a.msg}
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
  const totalDia = f("primeiras") + f("retornos") + f("emergencias");

  async function handleSave() {
    const data = { primeiras: f("primeiras"), retornos: f("retornos"), ofertadas: f("ofertadas"), realizadas: f("realizadas"), livres: f("livres"), emergencias: f("emergencias"), faltas: f("faltas") };
    const syncStatus = await saveRecord(date, spec.id, data, currentUser);
    const newDb = loadDB();
    onSave(newDb);
    setSaved(syncStatus); // "cloud" | "local"
    setTimeout(() => setSaved(false), 4000);
  }

  const mesData   = aggregateMes(db, ano, mes, spec.id);
  const totalMes  = mesData.primeiras + mesData.retornos + mesData.emergencias;
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
    return { name: MONTHS[m], total: d.primeiras + d.retornos + d.emergencias, meta: spec.metaM, primeiras: d.primeiras };
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

  const inp = { background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px", color: "var(--text)", fontFamily: "JetBrains Mono, monospace", fontSize: 14, width: "100%", outline: "none" };

  return (
    <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", height: "100%" }}>
      {/* Título */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "1.25rem" }}>
        <div style={{ width: 4, height: 32, background: spec.color, borderRadius: 2 }} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: spec.color }}>{spec.label}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Ambulatório {HOSPITAL_SIGLA} · Meta mensal {fmt(spec.metaM)} · Anual {fmt(spec.metaA)} · 30% 1ª consulta = {fmt(spec.meta1a)}/ano</div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <SemaforoMeta pct={pctMes} diasRestantes={diasRest} />
        </div>
      </div>

      {/* Grid: formulário + KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: "1rem", marginBottom: "1rem" }}>
        {/* Formulário */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em" }}>Lançar dados</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inp, width: "auto", fontSize: 12, padding: "4px 8px" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { key: "ofertadas",   label: "Ofertadas (Gercon)" },
              { key: "realizadas",  label: "Realizadas" },
              { key: "livres",      label: "Livres" },
              { key: "primeiras",   label: "1ª Consulta" },
              { key: "retornos",    label: "Retorno" },
              { key: "faltas",      label: "Faltas" },
              { key: "emergencias", label: "Emergências" },
            ].map(({ key, label }) => (
              <div key={key}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", marginBottom: 4, display: "block" }}>{label}</label>
                <input type="number" min="0" value={form[key]}
                  onChange={e => !readOnly && setForm(p => ({ ...p, [key]: e.target.value }))}
                  onFocus={e => !readOnly && (e.target.style.borderColor = spec.color)}
                  onBlur={e => e.target.style.borderColor = "var(--border)"}
                  disabled={readOnly} placeholder="0"
                  style={{ ...inp, opacity: readOnly ? .5 : 1, cursor: readOnly ? "not-allowed" : "text" }} />
              </div>
            ))}
          </div>
          {readOnly ? (
            <div style={{ background: "#1e3a5f", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "#38bdf8", textAlign: "center", marginTop: 4 }}>Modo visualização</div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
              <button onClick={handleSave} style={{ background: spec.color, color: "#000", border: "none", borderRadius: 6, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", flex: 1 }}>Salvar</button>
              {saved === "cloud" && <span style={{ color: "#34d399", fontSize: 12, fontWeight: 700 }}>Salvo e sincronizado</span>}
              {saved === "local" && <span style={{ color: "#fbbf24", fontSize: 12, fontWeight: 700 }}>⚠️ Salvo SÓ neste aparelho</span>}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ background: "var(--input-bg)", borderRadius: 6, padding: "6px 10px", flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>TOTAL DIA</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 20, color: spec.color, fontWeight: 700 }}>{totalDia}</div>
            </div>
            <div style={{ background: "var(--input-bg)", borderRadius: 6, padding: "6px 10px", flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>1ªS</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 20, color: "#38bdf8", fontWeight: 700 }}>{f("primeiras")}</div>
            </div>
            <div style={{ background: "var(--input-bg)", borderRadius: 6, padding: "6px 10px", flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>LIVRES</div>
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
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>
              Comparativo de Desempenho
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {[
                { label: `${MONTHS_FULL[mes]} ${ano}`,           value: comp.mesAtual,       sub: "mês atual",                    color: spec.color },
                { label: `${comp.mesAnteriorLabel} (mês ant.)`,  value: comp.mesAnterior,    sub: `${comp.variacaoMes >= 0 ? "▲" : "▼"} ${Math.abs(comp.variacaoMes).toFixed(0)}% vs mês anterior`, color: comp.variacaoMes >= 0 ? "#34d399" : "#fb7185" },
                { label: `${MONTHS_FULL[mes]} ${ano-1}`,         value: comp.mesAnoAnterior, sub: `${comp.variacaoAno >= 0 ? "▲" : "▼"} ${Math.abs(comp.variacaoAno).toFixed(0)}% vs ano anterior`,  color: comp.variacaoAno >= 0 ? "#34d399" : "#fb7185" },
              ].map(({ label, value, sub, color }) => (
                <div key={label} style={{ background: "var(--bg-2)", borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>{label}</div>
                  <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 20, color, fontWeight: 700 }}>{fmt(value)}</div>
                  <div style={{ fontSize: 10, color, marginTop: 2 }}>{sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Barra mensal */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem" }}>
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
            <div style={{ background: "var(--input-bg)", borderRadius: 99, height: 14, overflow: "hidden", marginBottom: 6 }}>
              <div style={{ width: `${Math.min(pctMes, 100)}%`, height: "100%", borderRadius: 99, background: pctMes >= 100 ? "#34d399" : pctMes >= 70 ? spec.color : pctMes >= 40 ? "#fbbf24" : "#fb7185", transition: "width .6s" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-3)" }}>
              <span>Realizado: <strong style={{ color: "var(--text)" }}>{fmt(totalMes)}</strong></span>
              <span style={{ color: spec.color, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>{pctMes.toFixed(1)}%</span>
              <span>Meta: <strong style={{ color: "var(--text)" }}>{fmt(spec.metaM)}</strong></span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
              {[
                { label: "Realizadas", v: mesData.realizadas, max: mesData.ofertadas, c: "#0d9488" },
                { label: "Livres",     v: mesData.livres,     max: mesData.ofertadas, c: "#3b82f6" },
                { label: "1ªs Cons.",  v: mesData.primeiras,  max: mesData.primeiras + mesData.retornos, c: "#6366f1" },
              ].map(({ label, v, max, c }) => {
                const p = max > 0 ? Math.min((v / max) * 100, 100) : 0;
                return (
                  <div key={label} style={{ background: "var(--input-bg)", borderRadius: 6, padding: "6px 10px" }}>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
                    <div style={{ background: "var(--surface-3)", borderRadius: 99, height: 5, overflow: "hidden", marginBottom: 4 }}>
                      <div style={{ width: `${p}%`, height: "100%", background: c, borderRadius: 99, transition: "width .5s" }} />
                    </div>
                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, color: c }}>{fmt(v)} <span style={{ fontSize: 10, color: "var(--text-muted)" }}>/ {fmt(max)}</span></div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Gauges + linha últimos dias */}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "1rem", marginBottom: "1rem" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem", display: "flex", gap: "1.5rem", alignItems: "center" }}>
          <RingGauge value={totalMes}   max={spec.metaM}  color={spec.color} label="Meta Mensal"  sub={`${fmt(totalMes)}/${fmt(spec.metaM)}`} />
          <RingGauge value={totalAno}   max={spec.metaA}  color={spec.color} label="Meta Anual"   sub={`${fmt(totalAno)}/${fmt(spec.metaA)}`} />
          <RingGauge value={total1aAno} max={spec.meta1a} color="#6366f1"    label="30% 1ª Cons." sub={`${fmt(total1aAno)}/${fmt(spec.meta1a)}`} />
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Tendência — últimos 12 meses</div>
          <ResponsiveContainer width="100%" height={110}>
            <ComposedChart data={trend12} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip content={customTooltip} />
              <ReferenceLine y={spec.metaM} stroke="var(--border-2)" strokeDasharray="4 2" />
              <Area type="monotone" dataKey="total" name="Total" fill={spec.color + "22"} stroke={spec.color} strokeWidth={2} />
              <Line type="monotone" dataKey="primeiras" name="1ª Consulta" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Barras anuais + composição mensal + meta anual */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem", marginBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em" }}>Atendimentos mensais — {ano}</span>
          <DeltaBadge value={totalAno} meta={spec.metaA} />
        </div>
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={barData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} width={35} />
            <Tooltip content={customTooltip} />
            <ReferenceLine y={spec.metaM} stroke="var(--border-2)" strokeDasharray="4 2" />
            <Bar dataKey="Total" radius={[4, 4, 0, 0]}>
              {barData.map((entry, i) => <Cell key={i} fill={entry.Total >= spec.metaM ? "#34d399" : entry.Total >= spec.metaM * .7 ? spec.color : "#fb7185"} fillOpacity={.9} />)}
            </Bar>
            <Bar dataKey="1ª Consulta" fill="#6366f1" fillOpacity={.7} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
        {/* Composição mensal */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Composição — {MONTHS_FULL[mes]}</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={compData} layout="vertical" margin={{ top: 0, right: 20, left: 60, bottom: 0 }}>
              <XAxis type="number" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: "var(--text-3)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={customTooltip} />
              <Bar dataKey="value" name="Qtd." radius={[0, 4, 4, 0]}>
                {compData.map((_, i) => <Cell key={i} fill={["#0d9488","#3b82f6","#d97706","#6366f1","#e11d48","#64748b","#94a3b8"][i % 7]} fillOpacity={.85} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Meta anual + 30% */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Progresso Anual — {ano}</div>
          {[
            { label: "Total de atendimentos", value: totalAno,   meta: spec.metaA,  color: spec.color },
            { label: "1ª Consultas (30%)",    value: total1aAno, meta: spec.meta1a, color: "#38bdf8" },
          ].map(({ label, value, meta, color }) => {
            const p = meta > 0 ? Math.min((value / meta) * 100, 100) : 0;
            return (
              <div key={label} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
                  <DeltaBadge value={value} meta={meta} />
                </div>
                <div style={{ background: "var(--input-bg)", borderRadius: 99, height: 10, overflow: "hidden", marginBottom: 4 }}>
                  <div style={{ width: `${p}%`, height: "100%", background: value >= meta ? "#34d399" : color, borderRadius: 99, transition: "width .6s" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-3)" }}>
                  <span>Realizado: <strong style={{ color: "var(--text)" }}>{fmt(value)}</strong></span>
                  <span style={{ fontFamily: "JetBrains Mono, monospace", color: value >= meta ? "#34d399" : color, fontWeight: 700 }}>{p.toFixed(1)}%</span>
                  <span>Meta: <strong style={{ color: "var(--text)" }}>{fmt(meta)}</strong></span>
                </div>
                {value < meta && <div style={{ fontSize: 11, color: "#fb7185", marginTop: 4 }}>Faltam <strong>{fmt(meta - value)}</strong></div>}
              </div>
            );
          })}
          {/* Tabela anual resumo */}
          <div style={{ maxHeight: 130, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead><tr>{["Mês","Total","1ª","Ret.","% Meta"].map(h => <th key={h} style={{ padding: "4px 6px", color: "var(--text-muted)", textAlign: "left", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>{h}</th>)}</tr></thead>
              <tbody>
                {anoData.filter(m => m.total > 0).map(m => {
                  const pct = spec.metaM > 0 ? Math.round((m.total / spec.metaM) * 100) : 0;
                  const c = pct >= 100 ? "#34d399" : pct >= 70 ? spec.color : "#fb7185";
                  return (
                    <tr key={m.mes}>
                      <td style={{ padding: "4px 6px", color: "var(--text-3)" }}>{MONTHS[m.mes]}</td>
                      <td style={{ padding: "4px 6px", fontFamily: "JetBrains Mono, monospace", color: "var(--text)" }}>{m.total}</td>
                      <td style={{ padding: "4px 6px", fontFamily: "JetBrains Mono, monospace", color: "#38bdf8" }}>{m.primeiras}</td>
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
// ═══════════════════════════════════════════════════════════
// SETORES + SOLICITAÇÕES (monitoramento de leitos)
// ═══════════════════════════════════════════════════════════
const SETORES_KEY = "hnsn_setores_v1";
const loadSetoresLocal = () => { try { return JSON.parse(localStorage.getItem(SETORES_KEY) || "[]"); } catch { return []; } };
const saveSetoresLocal = arr => localStorage.setItem(SETORES_KEY, JSON.stringify(arr));
async function loadSetoresFromSupabase() {
  const rows = await sbFetch("setores?select=*&order=ordem");
  return Array.isArray(rows) ? rows : null;
}
async function upsertSetorRemote(setor, user) {
  if (!USE_SUPABASE) return;
  await sbFetch("setores?on_conflict=nome", { method: "POST", headers: { "Prefer": "resolution=merge-duplicates" }, body: JSON.stringify({ ...setor, usuario: user?.name || null }) });
}
async function deleteSetorRemote(nome) {
  if (!USE_SUPABASE) return;
  await sbFetch(`setores?nome=eq.${encodeURIComponent(nome)}`, { method: "DELETE" });
}
async function loadSolicitacoes() {
  const rows = await sbFetch("solicitacoes?status=eq.aguardando&select=*&order=hora_pedido");
  return Array.isArray(rows) ? rows : [];
}
async function addSolicitacaoRemote(sol, user) {
  if (!USE_SUPABASE) return null;
  return await sbFetch("solicitacoes", { method: "POST", headers: { "Prefer": "return=representation" }, body: JSON.stringify({ ...sol, usuario: user?.name || null }) });
}
async function updateSolicitacaoRemote(id, campos) {
  if (!USE_SUPABASE) return;
  await sbFetch(`solicitacoes?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(campos) });
}
// Ocupação de um setor = SÓ os leitos ocupados (a fila de espera não conta —
// paciente aguardando ainda não está num leito). A fila vira um selo separado.
function ocupacaoSetor(leitos, solicitacoes, setor) {
  const dele = leitos.filter(l => (l.setor || "") === setor.nome);
  const operacionais = dele.filter(l => l.status !== "interditado").length;
  const ocupados = dele.filter(l => l.status === "ocupado").length;
  const fila = (solicitacoes || []).filter(s => s.setor_destino === setor.nome);
  const aguardando = fila.length;
  // maior tempo de espera da fila deste setor (em minutos)
  const agora = nowISO();
  const maiorEsperaMin = fila.reduce((m, s) => { const d = diffMin(s.hora_pedido, agora); return d != null && d > m ? d : m; }, 0);
  const pct = operacionais > 0 ? Math.round((ocupados / operacionais) * 100) : null;
  const amar = setor.alerta_amarelo ?? 90, verm = setor.alerta_vermelho ?? 100;
  const cor = pct == null ? "var(--text-muted)" : pct >= verm ? "#f43f5e" : pct >= amar ? "#fbbf24" : "#34d399";
  return { operacionais, ocupados, aguardando, maiorEsperaMin, pct, cor, restringir: pct != null && pct >= verm };
}

function Overview({ db, currentUser, canEdit }) {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth());
  const [ano, setAno] = useState(now.getFullYear());
  const [leitos, setLeitos]   = useState([]);
  const [setores, setSetores] = useState([]);
  const [solic, setSolic]     = useState([]);
  const [saidas, setSaidas]   = useState([]);
  const [novo, setNovo] = useState({ iniciais: "", setor_origem: "", setor_destino: "" });
  const [, setTick] = useState(0);
  const inp = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 8px", color: "var(--text)", fontFamily: "JetBrains Mono, monospace", fontSize: 12, outline: "none" };

  function refresh() {
    if (!USE_SUPABASE) { setLeitos(loadLeitos()); setSetores(loadSetoresLocal()); return; }
    loadLeitosFromSupabase().then(r => r && setLeitos(r));
    loadSetoresFromSupabase().then(r => r && setSetores(r));
    loadSolicitacoes().then(setSolic);
    loadSaidas().then(setSaidas);
  }
  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => { window.removeEventListener("focus", onFocus); clearInterval(id); };
  }, []);

  // Métricas globais de leitos
  const operacionais = leitos.filter(l => l.status !== "interditado").length;
  const ocupadosG = leitos.filter(l => l.status === "ocupado").length;
  const higienizando = leitos.filter(l => l.status === "higienizacao").length;
  const ocupacaoG = operacionais > 0 ? Math.round((ocupadosG / operacionais) * 100) : 0;
  const inMesData = dstr => { if (!dstr) return false; const d = new Date(dstr + "T00:00:00"); return d.getMonth() === mes && d.getFullYear() === ano; };
  const sMes = saidas.filter(s => inMesData(s.data_alta));
  const altas = sMes.length;
  const giro = operacionais > 0 ? altas / operacionais : 0;
  const permVals = sMes.map(s => s.dias_permanencia).filter(v => v != null);
  const permMedia = permVals.length ? permVals.reduce((a, b) => a + b, 0) / permVals.length : null;
  const totalAguardando = solic.length;

  async function addSolic() {
    if (!novo.iniciais.trim() || !novo.setor_destino) { alert("Informe as iniciais do paciente e o setor de destino."); return; }
    await addSolicitacaoRemote({ iniciais: novo.iniciais.trim(), setor_origem: novo.setor_origem || null, setor_destino: novo.setor_destino, hora_pedido: nowISO(), status: "aguardando" }, currentUser);
    addAuditLog(currentUser, "solicitar leito", `${novo.setor_origem || "?"} → ${novo.setor_destino}`, {});
    setNovo({ iniciais: "", setor_origem: "", setor_destino: "" });
    setTimeout(refresh, 400);
  }
  async function resolverSolic(s, status) {
    await updateSolicitacaoRemote(s.id, { status });
    addAuditLog(currentUser, status === "atendido" ? "leito atendido" : "solicitação cancelada", s.setor_destino, {});
    setTimeout(refresh, 300);
  }

  const specRows = SPECS.map(spec => {
    const m = aggregateMes(db, ano, mes, spec.id);
    const total = m.primeiras + m.retornos + m.emergencias;
    const pct = spec.metaM > 0 ? Math.round((total / spec.metaM) * 100) : 0;
    return { spec, total, pct };
  });

  const setoresOrd = [...setores].sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || a.nome.localeCompare(b.nome));
  const nomesSetores = setoresOrd.map(s => s.nome);

  return (
    <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "1.25rem", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Centro de Monitoramento —{HOSPITAL_SIGLA}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Leitos, ocupação e solicitações em tempo real</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>

          <select value={mes} onChange={e => setMes(+e.target.value)} style={inp}>{MONTHS_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}</select>
          <input type="number" value={ano} onChange={e => setAno(+e.target.value)} style={{ ...inp, width: 80 }} />
        </div>
      </div>

      {/* MÉTRICAS GLOBAIS DE LEITOS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: ".75rem", marginBottom: "1.25rem" }}>
        <StatCard label="Taxa de ocupação" value={ocupacaoG + "%"} color={ocupacaoG >= 90 ? "#f43f5e" : "#22d3ee"} big />
        <StatCard label={`Giro de leito — ${MONTHS[mes]}`} value={giro.toFixed(2)} color="#3b82f6" big />
        <StatCard label="Perman. média" value={permMedia != null ? permMedia.toFixed(1) + "d" : "—"} color="#0d9488" big />
        <StatCard label="Aguardando leito" value={totalAguardando} color={totalAguardando > 0 ? "#fbbf24" : "#34d399"} big />
        <StatCard label="Em higienização" value={higienizando} color="#fbbf24" big />
      </div>

      {/* ALERTAS POR SETOR */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Ocupação por setor</div>
      {setoresOrd.length === 0 ? (
        <div style={{ background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 10, padding: "1.25rem", textAlign: "center", color: "var(--text-muted)", fontSize: 13, marginBottom: "1.25rem" }}>
          Nenhum setor cadastrado. Cadastre em <strong>Giro de Leitos → Setores</strong> e marque o setor de cada leito.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12, marginBottom: "1.5rem" }}>
          {setoresOrd.map(setor => {
            const o = ocupacaoSetor(leitos, solic, setor);
            return (
              <div key={setor.nome} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${o.cor}`, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{setor.nome}</div>
                  {o.restringir && <span style={{ background: "#3d0f18", color: "#fb7185", borderRadius: 99, padding: "2px 8px", fontSize: 10, fontWeight: 800 }}>RESTRINGIR</span>}
                </div>
                <div style={{ fontSize: 30, fontWeight: 800, color: o.cor, fontFamily: "JetBrains Mono, monospace", marginTop: 4 }}>{o.pct == null ? "—" : o.pct + "%"}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{o.ocupados}/{o.operacionais} ocupados</div>
                {o.aguardando > 0 && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#3d2e06", color: "#fbbf24", borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 700, marginTop: 7 }}>
                    {o.aguardando} na fila · maior espera {fmtDur(o.maiorEsperaMin)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* SOLICITAÇÕES PENDENTES */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Lista de espera por leito ({totalAguardando})</div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem 1.25rem", marginBottom: "1.5rem" }}>
        {canEdit && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: solic.length ? 14 : 0 }}>
            <input value={novo.iniciais} onChange={e => setNovo(p => ({ ...p, iniciais: e.target.value }))} placeholder="Iniciais do paciente" style={{ ...inp, fontFamily: "Inter", width: 150 }} />
            <select value={novo.setor_origem} onChange={e => setNovo(p => ({ ...p, setor_origem: e.target.value }))} style={{ ...inp, fontFamily: "Inter" }}><option value="">Origem…</option>{nomesSetores.map(n => <option key={n} value={n}>{n}</option>)}<option value="Emergência">Emergência</option><option value="Centro Cirúrgico">Centro Cirúrgico</option></select>
            <span style={{ color: "var(--text-muted)" }}>→</span>
            <select value={novo.setor_destino} onChange={e => setNovo(p => ({ ...p, setor_destino: e.target.value }))} style={{ ...inp, fontFamily: "Inter" }}><option value="">Destino…</option>{nomesSetores.map(n => <option key={n} value={n}>{n}</option>)}</select>
            <button onClick={addSolic} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "7px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Solicitar</button>
          </div>
        )}
        {solic.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: canEdit ? "8px 0 4px" : "8px 0" }}>Nenhum paciente aguardando leito.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {solic.map(s => {
              const espera = fmtDur(diffMin(s.hora_pedido, nowISO()));
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, minWidth: 70 }}>{s.iniciais}</span>
                  <span style={{ fontSize: 12, color: "var(--text-3)" }}>{s.setor_origem || "?"} <span style={{ color: "var(--text-muted)" }}>→</span> <strong style={{ color: "var(--text)" }}>{s.setor_destino}</strong></span>
                  <span style={{ fontSize: 12, color: "#fbbf24", fontWeight: 700, marginLeft: "auto" }}>⏳ {espera}</span>
                  {canEdit && <>
                    <button onClick={() => resolverSolic(s, "atendido")} style={btnLeito("#34d399")}>✓ Atendido</button>
                    <button onClick={() => resolverSolic(s, "cancelado")} style={btnLeito("var(--text-muted)")}>✕</button>
                  </>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ESPECIALIDADES — META x REALIZADO */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Ambulatório — meta mensal × realizado ({MONTHS[mes]})</div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem 1.25rem", display: "flex", flexDirection: "column", gap: 12 }}>
        {specRows.map(({ spec, total, pct }) => (
          <div key={spec.id}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
              <span style={{ fontWeight: 600, color: spec.color }}>{spec.label}</span>
              <span style={{ color: "var(--text-3)" }}><strong style={{ color: "var(--text)" }}>{fmt(total)}</strong> / {fmt(spec.metaM)} · {pct}%</span>
            </div>
            <div style={{ height: 7, background: "var(--surface-3)", borderRadius: 99, overflow: "hidden" }}>
              <div style={{ width: Math.min(pct, 100) + "%", height: "100%", background: pct >= 100 ? "#34d399" : spec.color, borderRadius: 99 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OverviewAntigo({ db }) {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth());
  const [ano, setAno] = useState(now.getFullYear());
  const inp = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 8px", color: "var(--text)", fontFamily: "JetBrains Mono, monospace", fontSize: 12, outline: "none" };

  const rows = SPECS.map(spec => {
    const m      = aggregateMes(db, ano, mes, spec.id);
    const total  = m.primeiras + m.retornos + m.emergencias;
    const pctM   = spec.metaM > 0 ? (total / spec.metaM) * 100 : 0;
    const anoArr = aggregateAno(db, ano, spec.id);
    const totalA = anoArr.reduce((a, x) => a + x.total, 0);
    const pctA   = spec.metaA > 0 ? (totalA / spec.metaA) * 100 : 0;
    const acum   = aggregateTotal(db, spec.id);
    // Tendência 6 meses para gráfico
    const trend6 = Array.from({ length: 6 }, (_, i) => {
      const mIdx = (mes - 5 + i + 12) % 12;
      const aIdx = (mes - 5 + i < 0) ? ano - 1 : ano;
      const d = aggregateMes(db, aIdx, mIdx, spec.id);
      return { name: MONTHS[mIdx], total: d.primeiras + d.retornos + d.emergencias, meta: spec.metaM };
    });
    return { spec, total, pctM, totalA, pctA, m, acum, trend6 };
  });

  const totalGeral     = rows.reduce((a, r) => a + r.total, 0);
  const totalGeralAno  = rows.reduce((a, r) => a + r.totalA, 0);
  const totalOfertadas = rows.reduce((a, r) => a + (r.m.ofertadas || 0), 0);
  const totalRealizadas= rows.reduce((a, r) => a + (r.m.realizadas || 0), 0);
  const totalEmerg     = rows.reduce((a, r) => a + (r.m.emergencias || 0), 0);
  const totalFaltas    = rows.reduce((a, r) => a + (r.m.faltas || 0), 0);
  const totalLivres    = rows.reduce((a, r) => a + (r.m.livres || 0), 0);
  const txReal         = totalOfertadas > 0 ? ((totalRealizadas / totalOfertadas) * 100) : 0;

  return (
    <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", height: "100%" }}>
      {/* Cabeçalho */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "1.25rem" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Ambulatório {HOSPITAL_SIGLA}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Visão geral de todas as especialidades</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>

          <select value={mes} onChange={e => setMes(+e.target.value)} style={inp}>
            {MONTHS_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <input type="number" value={ano} onChange={e => setAno(+e.target.value)} style={{ ...inp, width: 80 }} />
        </div>
      </div>

      {/* KPIs principais */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: ".75rem", marginBottom: ".75rem" }}>
        <StatCard label={`Atendimentos — ${MONTHS_FULL[mes]}`} value={fmt(totalGeral)}    color="#22d3ee" big />
        <StatCard label={`Acumulado — ${ano}`}                  value={fmt(rows.reduce((a,r)=>a+r.totalA,0))} color="#3b82f6" big />
        <StatCard label="Especialidades ativas"                  value={SPECS.length}       color="#34d399" big />
        <StatCard label="Taxa de realização"                     value={`${txReal.toFixed(1)}%`} color={txReal>=80?"#34d399":txReal>=60?"#fbbf24":"#fb7185"} big />
      </div>

      {/* Bloco consolidado mensal */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem 1.25rem", marginBottom: "1rem" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".85rem" }}>
          Consolidado — {MONTHS_FULL[mes]}/{ano}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: ".75rem", marginBottom: ".85rem" }}>
          {[
            { label: "Ofertadas",   value: totalOfertadas,  color: "#22d3ee", sub: "vagas Gercon" },
            { label: "Realizadas",  value: totalRealizadas, color: "#34d399", sub: `${txReal.toFixed(1)}% das ofertadas` },
            { label: "Livres",      value: totalLivres,     color: "#60a5fa", sub: "não utilizadas" },
            { label: "Emergências", value: totalEmerg,      color: "#fb7185", sub: "contam na meta" },
            { label: "Faltas",      value: totalFaltas,     color: "#fbbf24", sub: "pacientes ausentes" },
          ].map(({ label, value, color, sub }) => (
            <div key={label} style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderLeft: `3px solid ${color}`, borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{fmt(value)}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>{sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Cards por especialidade com gráfico de tendência */}
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".75rem" }}>
        Especialidades — Meta Mensal + Tendência 6 Meses
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(1,1fr)", gap: "1rem" }}>
        {rows.map(({ spec, total, pctM, totalA, pctA, m, acum, trend6 }) => {
          const faltaM  = Math.max(spec.metaM - total, 0);
          const bc      = pctM >= 100 ? "#34d399" : pctM >= 70 ? spec.color : pctM >= 40 ? "#fbbf24" : "#fb7185";
          const faltaA  = Math.max(spec.metaA - totalA, 0);
          return (
            <div key={spec.id} style={{ background: "var(--surface)", border: `1px solid var(--border)`, borderLeft: `4px solid ${spec.color}`, borderRadius: 10, padding: "1rem", display: "grid", gridTemplateColumns: "1fr 1fr 320px", gap: "1.25rem", alignItems: "start" }}>

              {/* Coluna 1: KPIs mensais */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: spec.color, marginBottom: 10 }}>{spec.label}</div>
                {/* Barra mensal */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: "var(--text-3)" }}>Meta Mensal</span>
                    <DeltaBadge value={total} meta={spec.metaM} />
                  </div>
                  <div style={{ background: "var(--input-bg)", borderRadius: 99, height: 8, overflow: "hidden", marginBottom: 4 }}>
                    <div style={{ width: `${Math.min(pctM,100)}%`, height: "100%", background: bc, borderRadius: 99, transition: "width .5s" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)" }}>
                    <span>Realizado: <strong style={{ color: "var(--text)" }}>{fmt(total)}</strong></span>
                    <span style={{ color: bc, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>{pctM.toFixed(1)}%</span>
                    <span>Meta: <strong style={{ color: "var(--text)" }}>{fmt(spec.metaM)}</strong></span>
                  </div>
                  {faltaM > 0 && <div style={{ fontSize: 11, color: "#fb7185", marginTop: 3 }}>Faltam <strong>{fmt(faltaM)}</strong> para a meta</div>}
                </div>
                {/* Mini stats */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  {[
                    { label: "1ª Cons.", v: m.primeiras,   c: "#38bdf8" },
                    { label: "Retorno",  v: m.retornos,    c: "#60a5fa" },
                    { label: "Emerg.",   v: m.emergencias, c: "#fb7185" },
                    { label: "Ofert.",   v: m.ofertadas,   c: "#22d3ee" },
                    { label: "Realiz.",  v: m.realizadas,  c: "#34d399" },
                    { label: "Faltas",   v: m.faltas,      c: "#fbbf24" },
                  ].map(({ label, v, c }) => (
                    <div key={label} style={{ background: "var(--bg-2)", borderRadius: 6, padding: "5px 8px", textAlign: "center" }}>
                      <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{label}</div>
                      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 14, color: c, fontWeight: 700 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Coluna 2: KPIs anuais */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Anual {ano}</div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: "var(--text-3)" }}>Meta Anual</span>
                    <DeltaBadge value={totalA} meta={spec.metaA} />
                  </div>
                  <div style={{ background: "var(--input-bg)", borderRadius: 99, height: 8, overflow: "hidden", marginBottom: 4 }}>
                    <div style={{ width: `${Math.min(pctA,100)}%`, height: "100%", background: spec.color, borderRadius: 99, transition: "width .5s" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)" }}>
                    <span>Realizado: <strong style={{ color: "var(--text)" }}>{fmt(totalA)}</strong></span>
                    <span style={{ color: spec.color, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>{pctA.toFixed(1)}%</span>
                    <span>Meta: <strong style={{ color: "var(--text)" }}>{fmt(spec.metaA)}</strong></span>
                  </div>
                  {faltaA > 0 && <div style={{ fontSize: 11, color: "#fb7185", marginTop: 3 }}>Faltam <strong>{fmt(faltaA)}</strong> para a meta anual</div>}
                </div>
                {/* Acumulado */}
                <div style={{ background: "var(--bg-2)", borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>ACUMULADO TOTAL</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                    {[
                      { label: "Total",   v: acum.total,      c: spec.color },
                      { label: "1ª Cons.",v: acum.primeiras,  c: "#38bdf8" },
                      { label: "Emerg.",  v: acum.emergencias,c: "#fb7185" },
                      { label: "Faltas",  v: acum.faltas,     c: "#fbbf24" },
                    ].map(({ label, v, c }) => (
                      <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                        <span style={{ color: "var(--text-muted)" }}>{label}:</span>
                        <span style={{ fontFamily: "JetBrains Mono, monospace", color: c, fontWeight: 700 }}>{fmt(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Coluna 3: Gráfico tendência 6 meses */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>
                  Tendência — últimos 6 meses
                </div>
                <ResponsiveContainer width="100%" height={130}>
                  <ComposedChart data={trend6} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip content={customTooltip} />
                    <ReferenceLine y={spec.metaM} stroke="var(--border-2)" strokeDasharray="3 3" />
                    <Area type="monotone" dataKey="total" name="Atendimentos" fill={spec.color + "22"} stroke={spec.color} strokeWidth={2} dot={{ fill: spec.color, r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
                <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", marginTop: 2 }}>
                  linha tracejada = meta {fmt(spec.metaM)}/mês
                </div>
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
  const inp = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none" };

  const aggAll = SPECS.map(spec => {
    const m = aggregateMes(db, ano, mes, spec.id);
    const total = m.primeiras + m.retornos + m.emergencias;
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
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Dashboard para Impressão</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: "1.25rem" }}>Relatório visual por período — imprima ou salve como PDF</div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <div><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 5 }}>MÊS</div>
          <select value={mes} onChange={e => setMes(+e.target.value)} style={inp}>{MONTHS_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}</select></div>
        <div><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 5 }}>ANO</div>
          <input type="number" value={ano} onChange={e => setAno(+e.target.value)} style={{ ...inp, width: 90 }} /></div>
        <button onClick={() => setPreview(true)} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 7, padding: "9px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Pré-visualizar</button>
        {preview && <button onClick={() => window.print()} style={{ background: "#34d399", color: "#000", border: "none", borderRadius: 7, padding: "9px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Imprimir / PDF</button>}
      </div>
      {preview && (
        <div id="print-area" style={{ background: "#fff", color: "#111", borderRadius: 10, border: "1px solid #e5e7eb", padding: "24px 28px", fontFamily: "Inter, sans-serif", fontSize: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, paddingBottom: 12, borderBottom: "2px solid #e5e7eb" }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>DASHBOARD AMBULATÓRIO — {HOSPITAL_SIGLA}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>{HOSPITAL_NOME} · Valentrax Healthcare Operations</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", background: "#f1f5f9", borderRadius: 8, padding: "6px 14px" }}>{MONTHS_FULL[mes]}/{ano}</div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>Gerado em {geradoEm}</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
            {[
              { label: "TOTAL ATENDIMENTOS", value: fmt(totalGeral), sub: "todas as especialidades", bg: "#f0fdf4", border: "#86efac", val: "#16a34a" },
              { label: "META TOTAL DO MÊS",  value: fmt(metaGeral),  sub: "soma das especialidades", bg: "#eff6ff", border: "#93c5fd", val: "#1d4ed8" },
              { label: "DIFERENÇA PARA A META", value: (diffGeral >= 0 ? "+" : "") + fmt(diffGeral), sub: diffGeral >= 0 ? "Acima da meta" : "Abaixo da meta", bg: diffGeral >= 0 ? "#f0fdf4" : "#fef2f2", border: diffGeral >= 0 ? "#86efac" : "#fca5a5", val: diffGeral >= 0 ? "#16a34a" : "#dc2626" },
              { label: "% DA META GERAL",    value: pctGeral.toFixed(1) + "%", sub: "desempenho geral", bg: pctGeral >= 100 ? "#f0fdf4" : "#fef9c3", border: pctGeral >= 100 ? "#86efac" : "#fde047", val: pctGeral >= 100 ? "#16a34a" : "#a16207" },
            ].map(({ label, value, sub, bg, border, val }) => (
              <div key={label} style={{ background: bg, border: `1.5px solid ${border}`, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>{label}</div>
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
              <span>Dados referente a {MONTHS_FULL[mes]}/{ano} · Fonte: Valentrax · {HOSPITAL_SIGLA}</span>
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
  const inp = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none" };
  return (
    <div style={{ padding: "1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Log de Auditoria</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: "1.5rem" }}>Histórico de todas as alterações realizadas na plataforma</div>
      <div style={{ display: "flex", gap: 10, marginBottom: "1rem", alignItems: "center" }}>
        <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Filtrar por usuário ou data..." style={{ ...inp, width: 280 }} />
        <button onClick={() => setLogs(loadAudit())} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 14px", color: "#22d3ee", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: 13 }}>↺ Atualizar</button>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{filtered.length} registro(s)</span>
      </div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>{["Data/Hora","Usuário","Ação","Alvo","Dados"].map(h => <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: "var(--text-muted)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", borderBottom: "1px solid var(--border)", background: "var(--bg-2)" }}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>Nenhum registro de auditoria encontrado.</td></tr>
            )}
            {filtered.map((l, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--surface-3)" }}>
                <td style={{ padding: "8px 14px", fontFamily: "JetBrains Mono, monospace", color: "var(--text-3)", fontSize: 11 }}>{new Date(l.ts).toLocaleString("pt-BR")}</td>
                <td style={{ padding: "8px 14px", fontWeight: 600, color: "#22d3ee" }}>{l.user}</td>
                <td style={{ padding: "8px 14px" }}>
                  <span style={{ background: "#0e4f5f", color: "#22d3ee", borderRadius: 99, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{l.acao}</span>
                </td>
                <td style={{ padding: "8px 14px", color: "var(--text)", fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>{l.alvo}</td>
                <td style={{ padding: "8px 14px", color: "var(--text-muted)", fontSize: 11, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.dados}</td>
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
  const inp = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  return (
    <div style={{ padding: "1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Importar Dados</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: "1.5rem" }}>Carregue histórico via CSV</div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem", marginBottom: "1rem" }}>
        <label style={{ display: "flex", flexDirection: "column", alignItems: "center", border: "2px dashed var(--border-2)", borderRadius: 8, padding: "2rem", cursor: "pointer", marginBottom: 12 }}>
          <div style={{ marginBottom: 8, color: "var(--text-3)" }}><Icon name="upload" size={32} /></div>
          <strong>Clique para selecionar</strong>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>CSV com as colunas abaixo</div>
          <input type="file" accept=".csv" onChange={handleFile} style={{ display: "none" }} />
        </label>
        {msg && <div style={{ fontSize: 13, color: msg.startsWith("✓") ? "#34d399" : "#fbbf24", fontWeight: 600, marginBottom: 10 }}>{msg}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={downloadTemplate} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "7px 16px", fontWeight: 700, cursor: "pointer" }}>Baixar modelo CSV</button>
          <button onClick={() => { if (confirm("Apagar TODOS os dados?")) { localStorage.removeItem(K); onImport({}); addAuditLog(currentUser, "limpar dados", "todos", {}); } }} style={{ background: "transparent", color: "#fb7185", border: "1px solid #3d0f18", borderRadius: 6, padding: "7px 16px", fontWeight: 700, cursor: "pointer" }}>Excluir Apagar todos os dados</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// GIRO DE LEITOS
// ═══════════════════════════════════════════════════════════
const LEITOS_KEY = "hnsn_leitos_v1";
const loadLeitos = () => { try { return JSON.parse(localStorage.getItem(LEITOS_KEY) || "[]"); } catch { return []; } };
const saveLeitos = arr => localStorage.setItem(LEITOS_KEY, JSON.stringify(arr));

async function loadLeitosFromSupabase() {
  const rows = await sbFetch("leitos?select=*");
  return Array.isArray(rows) ? rows : null;
}
async function upsertLeitoRemote(leito, user) {
  if (!USE_SUPABASE) return;
  await sbFetch("leitos?on_conflict=identificacao", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ ...leito, usuario: user?.name || null }),
  });
}
async function deleteLeitoRemote(identificacao) {
  if (!USE_SUPABASE) return;
  await sbFetch(`leitos?identificacao=eq.${encodeURIComponent(identificacao)}`, { method: "DELETE" });
}
async function registrarSaidaRemote(saida, user) {
  if (!USE_SUPABASE) return;
  await sbFetch("leitos_saidas", { method: "POST", body: JSON.stringify({ ...saida, usuario: user?.name || null }) });
}

// ── Referências de CID (tempo estimado de internação por diagnóstico) ──
const CIDREF_KEY = "hnsn_cidref_v1";
const loadCidRefLocal = () => { try { return JSON.parse(localStorage.getItem(CIDREF_KEY) || "[]"); } catch { return []; } };
const saveCidRefLocal = arr => localStorage.setItem(CIDREF_KEY, JSON.stringify(arr));
async function loadCidRefFromSupabase() {
  const rows = await sbFetch("cid_referencia?select=*");
  return Array.isArray(rows) ? rows : null;
}
async function upsertCidRefRemote(ref, user) {
  if (!USE_SUPABASE) return;
  await sbFetch("cid_referencia?on_conflict=cid", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ ...ref, usuario: user?.name || null }),
  });
}
async function deleteCidRefRemote(cid) {
  if (!USE_SUPABASE) return;
  await sbFetch(`cid_referencia?cid=eq.${encodeURIComponent(cid)}`, { method: "DELETE" });
}
// Acha a referência para um CID digitado: código exato → prefixo → descrição
function sugerirCid(cidDigitado, refs) {
  if (!cidDigitado || !refs || !refs.length) return null;
  const c = cidDigitado.trim().toUpperCase();
  if (c.length < 2) return null;
  let m = refs.find(r => (r.cid || "").toUpperCase() === c);
  if (!m) m = refs.find(r => { const rc = (r.cid || "").toUpperCase(); return rc && (c.startsWith(rc) || rc.startsWith(c)); });
  if (!m && c.length >= 3) m = refs.find(r => (r.descricao || "").toUpperCase().includes(c));
  return m || null;
}

// Previsão de alta = data de internação + dias previstos
function calcAlta(dataInternacao, diasPrevistos) {
  if (!dataInternacao || !diasPrevistos) return null;
  const d = new Date(dataInternacao + "T00:00:00");
  d.setDate(d.getDate() + Number(diasPrevistos));
  return d;
}
// Sinaleira: verde (2+ dias), amarelo (falta ≤1 dia / alta hoje), vermelho (passou)
function sinalLeito(dataInternacao, diasPrevistos) {
  const alta = calcAlta(dataInternacao, diasPrevistos);
  if (!alta) return { cor: "var(--text-muted)", texto: "sem previsão", restam: null };
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const restam = Math.round((alta - hoje) / 86400000);
  const dataFmt = alta.toLocaleDateString("pt-BR");
  if (restam < 0)  return { cor: "#f43f5e", texto: `${Math.abs(restam)}d após a alta (${dataFmt})`, restam };
  if (restam <= 1) return { cor: "#fbbf24", texto: restam === 0 ? `alta prevista hoje (${dataFmt})` : `falta 1 dia (${dataFmt})`, restam };
  return { cor: "#34d399", texto: `faltam ${restam} dias (${dataFmt})`, restam };
}

// ── Fase 2: histórico de turnover + utilidades de tempo ──
async function registrarTurnoverRemote(turn, user) {
  if (!USE_SUPABASE) return;
  await sbFetch("leitos_turnover", { method: "POST", body: JSON.stringify({ ...turn, usuario: user?.name || null }) });
}
async function loadSaidas() {
  const rows = await sbFetch("leitos_saidas?select=*");
  return Array.isArray(rows) ? rows : [];
}
async function loadTurnover() {
  const rows = await sbFetch("leitos_turnover?select=*");
  return Array.isArray(rows) ? rows : [];
}
const nowISO = () => new Date().toISOString();
// minutos entre dois instantes ISO (b - a)
function diffMin(a, b) {
  if (!a || !b) return null;
  const d = Math.round((new Date(b) - new Date(a)) / 60000);
  return isNaN(d) ? null : d;
}
// formata duração em minutos -> "2h 30min" / "45min"
function fmtDur(min) {
  if (min == null || isNaN(min)) return "—";
  if (min < 0) min = 0;
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}
// data/hora curta a partir de ISO
const horaFmt = iso => iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
// ISO -> valor de <input type=datetime-local> (local) e vice-versa
const isoToLocal = iso => { if (!iso) return ""; const d = new Date(iso); const off = d.getTimezoneOffset(); return new Date(d - off * 60000).toISOString().slice(0, 16); };
const localToIso = v => v ? new Date(v).toISOString() : null;

const STATUS_LEITO = {
  livre:        { label: "Livre",           cor: "#34d399", bg: "#0a3d2a" },
  ocupado:      { label: "Ocupado",         cor: "#22d3ee", bg: "#0e2f3d" },
  higienizacao: { label: "Em higienização", cor: "#fbbf24", bg: "#3d2e06" },
  interditado:  { label: "Interditado",     cor: "#fb7185", bg: "#3d0f18" },
};

// ═══════════════════════════════════════════════════════════
// SCIH — Serviço de Controle de Infecção Hospitalar (Fase A)
// ═══════════════════════════════════════════════════════════
// Tipos de precaução/isolamento (base Anvisa "Medidas de Prevenção de IRAS" + CDC).
// Orientações gerais — sempre seguir o protocolo institucional e a CCIH.
const ISOLAMENTOS = {
  contato: {
    label: "Contato", icon: "🧤", cor: "#fbbf24", bg: "#3d2e06",
    curto: "Transmissão por contato direto ou indireto (mãos, superfícies, equipamentos).",
    quando: "Bactérias multirresistentes (MRSA, VRE, KPC e demais enterobactérias com carbapenemase, Acinetobacter MR), Clostridioides difficile, escabiose, diarreias infecciosas, vírus sincicial respiratório.",
    epi: "Luvas e avental ao entrar / ter contato; higiene das mãos antes e depois; equipamentos dedicados ao paciente.",
    quarto: "Quarto privativo (ou coorte do mesmo agente).",
  },
  goticulas: {
    label: "Gotículas", icon: "😷", cor: "#38bdf8", bg: "#132c47",
    curto: "Gotículas respiratórias maiores que 5 µm; alcançam curtas distâncias (~1 a 2 m).",
    quando: "Doença meningocócica, coqueluche, influenza, difteria, caxumba, rubéola, H. influenzae invasiva.",
    epi: "Máscara cirúrgica ao entrar / aproximar (< 1 m); higiene das mãos. Paciente usa máscara cirúrgica no transporte.",
    quarto: "Quarto privativo (ou coorte); manter ≥ 1 m entre leitos.",
  },
  aereo: {
    label: "Aéreo (aerossóis)", icon: "🌬️", cor: "#f43f5e", bg: "#3d0f18",
    curto: "Núcleos de partículas menores que 5 µm que ficam suspensos no ar e percorrem longas distâncias.",
    quando: "Tuberculose pulmonar/laríngea, sarampo, varicela, herpes-zóster disseminado; procedimentos geradores de aerossol.",
    epi: "Máscara N95 / PFF2 ao entrar; higiene das mãos. Paciente usa máscara cirúrgica no transporte.",
    quarto: "Quarto privativo com pressão negativa e porta fechada (ou renovação/exaustão de ar adequada).",
  },
};

async function loadScihCasos() {
  const rows = await sbFetch("scih_casos?select=*&order=created_at.desc");
  return Array.isArray(rows) ? rows : [];
}
async function addScihCasoRemote(caso, user) {
  if (!USE_SUPABASE) return null;
  return await sbFetch("scih_casos", { method: "POST", headers: { "Prefer": "return=representation" }, body: JSON.stringify({ ...caso, usuario: user?.name || null }) });
}
async function updateScihCasoRemote(id, campos) {
  if (!USE_SUPABASE) return;
  await sbFetch(`scih_casos?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ ...campos, updated_at: nowISO() }) });
}
async function deleteScihCasoRemote(id) {
  if (!USE_SUPABASE) return;
  await sbFetch(`scih_casos?id=eq.${id}`, { method: "DELETE" });
}
// Marca/limpa o isolamento de um leito diretamente (sem tocar no restante do leito)
async function setLeitoIsolamentoRemote(id, iso, user) {
  if (!USE_SUPABASE) return;
  await sbFetch("leitos?on_conflict=identificacao", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ identificacao: id, isolamento: iso || null, usuario: user?.name || null }),
  });
}
// ── Fase B: base de germes com embasamento ──
async function loadScihGermes() {
  const rows = await sbFetch("scih_germes?select=*");
  return Array.isArray(rows) ? rows : [];
}
async function upsertScihGermeRemote(germe, user) {
  if (!USE_SUPABASE) return;
  await sbFetch("scih_germes?on_conflict=nome", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ ...germe, usuario: user?.name || null, updated_at: nowISO() }),
  });
}
async function deleteScihGermeRemote(nome) {
  if (!USE_SUPABASE) return;
  await sbFetch(`scih_germes?nome=eq.${encodeURIComponent(nome)}`, { method: "DELETE" });
}
// Acha o germe da base a partir do que foi digitado (nome exato → contém)
function sugerirGerme(digitado, germes) {
  if (!digitado || !germes || !germes.length) return null;
  const c = digitado.trim().toLowerCase();
  if (c.length < 3) return null;
  let m = germes.find(g => (g.nome || "").toLowerCase() === c);
  if (!m) m = germes.find(g => { const gn = (g.nome || "").toLowerCase(); return gn && (c.includes(gn) || gn.includes(c)); });
  return m || null;
}

// ═══════════════════════════════════════════════════════════
// PRONTO-SOCORRO — triagem Manchester + jornada do paciente
// ═══════════════════════════════════════════════════════════
// Cores do Protocolo de Manchester são normativas (semântica clínica oficial).
const MANCHESTER = {
  vermelho: { label: "Emergência",     cor: "#ef4444", bg: "#3d0f18", alvoMin: 0,   desc: "Risco de vida imediato. Atendimento IMEDIATO — sala de emergência." },
  laranja:  { label: "Muito urgente",  cor: "#f97316", bg: "#3d2206", alvoMin: 10,  desc: "Risco significativo. Atendimento em até 10 minutos." },
  amarelo:  { label: "Urgente",        cor: "#eab308", bg: "#3d2e06", alvoMin: 60,  desc: "Condição aguda sem risco imediato. Atendimento em até 60 minutos." },
  verde:    { label: "Pouco urgente",  cor: "#22c55e", bg: "#0a3d2a", alvoMin: 120, desc: "Condição de menor gravidade. Atendimento em até 120 minutos." },
  azul:     { label: "Não urgente",    cor: "#3b82f6", bg: "#132c47", alvoMin: 240, desc: "Queixa simples/crônica. Atendimento em até 240 minutos ou encaminhamento." },
};
const PS_DESFECHOS = {
  alta:          { label: "Alta",          cor: "#34d399" },
  internacao:    { label: "Internação",    cor: "#22d3ee" },
  transferencia: { label: "Transferência", cor: "#3b82f6" },
  evasao:        { label: "Evasão",        cor: "#8d99ab" },
  obito:         { label: "Óbito",         cor: "#f43f5e" },
};
async function loadPsAtendimentos() {
  const rows = await sbFetch("ps_atendimentos?status=neq.finalizado&select=*&order=chegada_em");
  return Array.isArray(rows) ? rows : [];
}
async function loadPsFinalizadosHoje() {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const rows = await sbFetch(`ps_atendimentos?status=eq.finalizado&desfecho_em=gte.${hoje.toISOString()}&select=*&order=desfecho_em.desc`);
  return Array.isArray(rows) ? rows : [];
}
async function addPsAtendimentoRemote(at, user) {
  if (!USE_SUPABASE) return null;
  return await sbFetch("ps_atendimentos", { method: "POST", headers: { "Prefer": "return=representation" }, body: JSON.stringify({ ...at, usuario: user?.name || null }) });
}
async function updatePsAtendimentoRemote(id, campos) {
  if (!USE_SUPABASE) return;
  await sbFetch(`ps_atendimentos?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ ...campos, updated_at: nowISO() }) });
}
// Prioridade de ordenação da fila (menor = mais urgente)
const PS_PRIORIDADE = { vermelho: 0, laranja: 1, amarelo: 2, verde: 3, azul: 4 };

// Nível de consciência (AVPU)
const PS_CONSCIENCIA = {
  A: "Alerta", V: "Responde à voz", D: "Responde à dor", U: "Inconsciente",
};
// Avalia os sinais vitais (adulto) e sugere a classificação de Manchester.
// APOIO À DECISÃO: cada alteração vira um "motivo" com o nível que ela dispara;
// a sugestão final é o pior nível encontrado. A palavra final é da triadora.
function avaliarSinaisVitais(v) {
  const motivos = [];
  const add = (nivel, texto) => motivos.push({ nivel, texto });
  const n = x => (x === "" || x == null ? null : Number(x));
  const spo2 = n(v.spo2), fr = n(v.fr), fc = n(v.fc), pas = n(v.pa_sist), temp = n(v.temp), dor = n(v.dor), gli = n(v.glicemia);

  if (v.consciencia === "U") add("vermelho", "Inconsciente (AVPU: U)");
  else if (v.consciencia === "D") add("laranja", "Responde apenas à dor (AVPU: D)");
  else if (v.consciencia === "V") add("laranja", "Responde apenas à voz (AVPU: V)");

  if (spo2 != null) {
    if (spo2 < 85) add("vermelho", `SpO2 ${spo2}% (muito baixa)`);
    else if (spo2 <= 91) add("laranja", `SpO2 ${spo2}% (baixa)`);
    else if (spo2 <= 94) add("amarelo", `SpO2 ${spo2}%`);
  }
  if (fr != null) {
    if (fr < 8 || fr > 35) add("vermelho", `FR ${fr} irpm (crítica)`);
    else if (fr <= 9 || fr >= 25) add("laranja", `FR ${fr} irpm`);
    else if (fr >= 21) add("amarelo", `FR ${fr} irpm`);
  }
  if (fc != null) {
    if (fc < 40 || fc > 150) add("vermelho", `FC ${fc} bpm (crítica)`);
    else if (fc <= 49 || fc >= 121) add("laranja", `FC ${fc} bpm`);
    else if (fc <= 59 || fc >= 100) add("amarelo", `FC ${fc} bpm`);
  }
  if (pas != null) {
    if (pas < 80) add("vermelho", `PA sistólica ${pas} mmHg (choque?)`);
    else if (pas <= 89) add("laranja", `PA sistólica ${pas} mmHg`);
    else if (pas <= 99) add("amarelo", `PA sistólica ${pas} mmHg`);
    else if (pas >= 220) add("laranja", `PA sistólica ${pas} mmHg (crise hipertensiva)`);
    else if (pas >= 180) add("amarelo", `PA sistólica ${pas} mmHg (elevada)`);
  }
  if (temp != null) {
    if (temp < 35) add("laranja", `Temperatura ${temp}°C (hipotermia)`);
    else if (temp >= 40) add("laranja", `Temperatura ${temp}°C (hiperpirexia)`);
    else if (temp >= 38.5) add("amarelo", `Temperatura ${temp}°C (febre alta)`);
    else if (temp >= 37.8) add("verde", `Temperatura ${temp}°C (febril)`);
  }
  if (dor != null && dor > 0) {
    if (dor >= 8) add("laranja", `Dor intensa (${dor}/10)`);
    else if (dor >= 4) add("amarelo", `Dor moderada (${dor}/10)`);
    else add("verde", `Dor leve (${dor}/10)`);
  }
  if (gli != null) {
    if (gli < 60) add("laranja", `Glicemia ${gli} mg/dL (hipoglicemia)`);
    else if (gli > 400) add("amarelo", `Glicemia ${gli} mg/dL (muito elevada)`);
  }

  const temAlgum = [spo2, fr, fc, pas, temp, dor, gli].some(x => x != null) || !!v.consciencia;
  if (!temAlgum) return { sugestao: null, motivos: [] };
  const ordem = ["vermelho", "laranja", "amarelo", "verde"];
  const pior = ordem.find(nv => motivos.some(m => m.nivel === nv));
  return { sugestao: pior || "verde", motivos };
}
// Linha compacta dos sinais vitais registrados (fila e Paciente 360)
function fmtSinaisVitais(p) {
  const parts = [];
  if (p.pa_sist && p.pa_diast) parts.push(`PA ${p.pa_sist}x${p.pa_diast}`);
  else if (p.pa_sist) parts.push(`PAS ${p.pa_sist}`);
  if (p.fc) parts.push(`FC ${p.fc}`);
  if (p.fr) parts.push(`FR ${p.fr}`);
  if (p.spo2) parts.push(`SpO2 ${p.spo2}%`);
  if (p.temp) parts.push(`T ${p.temp}°C`);
  if (p.dor) parts.push(`Dor ${p.dor}/10`);
  if (p.glicemia) parts.push(`HGT ${p.glicemia}`);
  if (p.consciencia && p.consciencia !== "A") parts.push(PS_CONSCIENCIA[p.consciencia] || p.consciencia);
  return parts.join(" · ");
}

// ── Fase C: indicadores mensais do SCIH ──
async function loadScihIndicadores() {
  const rows = await sbFetch("scih_indicadores?select=*&order=competencia");
  return Array.isArray(rows) ? rows : [];
}
async function upsertScihIndicadorRemote(ind, user) {
  if (!USE_SUPABASE) return;
  await sbFetch("scih_indicadores?on_conflict=competencia", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ ...ind, usuario: user?.name || null, updated_at: nowISO() }),
  });
}
const compDe = (ano, mes) => `${ano}-${String(mes + 1).padStart(2, "0")}`;  // mes 0-11
// taxa = num/den * fator (null se denominador ausente/zero)
function taxa(num, den, fator = 100) {
  if (num == null || den == null || den === 0) return null;
  return (Number(num) / Number(den)) * fator;
}
// Calcula todos os indicadores derivados de uma linha
function calcIndic(r) {
  r = r || {};
  return {
    higiene: taxa(r.higiene_realizadas, r.higiene_oportunidades, 100),          // % adesão
    pav: taxa(r.pav_casos, r.ventilador_dia, 1000),                             // por 1000 vent-dia
    antimicrobiano: taxa(r.antimicrobiano_dot, r.pacientes_dia, 1000),          // DOT por 1000 pac-dia
    culturasPos: taxa(r.culturas_positivas, r.culturas_coletadas, 100),         // % positividade
    iscCesariana: taxa(r.isc_cesariana, r.cir_cesariana, 100),
    iscOftalmo: taxa(r.isc_oftalmo, r.cir_oftalmo, 100),
    iscArtroplastia: taxa(r.isc_artroplastia, r.cir_artroplastia, 100),
  };
}

// dias entre uma data (yyyy-mm-dd) e hoje
function diasDesde(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d)) return null;
  return Math.max(0, Math.round((new Date(todayStr() + "T00:00:00") - d) / 86400000));
}

// Modal de internação / edição de paciente no leito
function InternarModal({ leito, onClose, onSave, refs = [] }) {
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
  function submit() {
    if (!f.iniciais.trim() || !f.dias_previstos) { alert("Informe ao menos as iniciais e os dias previstos."); return; }
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
  const [f, setF] = useState({ nome: "", alerta_amarelo: 90, alerta_vermelho: 100 });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  const hl = { fontSize: 11, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 4 };
  async function salvar() {
    if (!f.nome.trim()) { alert("Informe o nome do setor."); return; }
    setBusy(true);
    await onSave({ nome: f.nome.trim(), alerta_amarelo: Number(f.alerta_amarelo) || 90, alerta_vermelho: Number(f.alerta_vermelho) || 100, ordem: setores.length });
    setBusy(false);
    setF({ nome: "", alerta_amarelo: 90, alerta_vermelho: 100 });
  }
  const ordenados = [...setores].sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || a.nome.localeCompare(b.nome));
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 560, maxWidth: "94vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Setores e limiares de alerta</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16, marginTop: 2 }}>Amarelo = atenção; Vermelho = restringir. Ocupação = leitos ocupados ÷ operacionais. A fila de espera aparece como um selo separado no monitoramento, sem contar na ocupação.</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px auto", gap: 8, alignItems: "end", marginBottom: 14 }}>
          <div><label style={hl}>Setor</label><input value={f.nome} onChange={e => set("nome", e.target.value)} placeholder="Ex.: UTI" style={inp} /></div>
          <div><label style={hl}>Amarelo %</label><input type="number" value={f.alerta_amarelo} onChange={e => set("alerta_amarelo", e.target.value)} style={inp} /></div>
          <div><label style={hl}>Vermelho %</label><input type="number" value={f.alerta_vermelho} onChange={e => set("alerta_vermelho", e.target.value)} style={inp} /></div>
          <button onClick={salvar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13, height: 36 }}>{busy ? "…" : "+ Salvar"}</button>
        </div>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>{["Setor", "Amarelo", "Vermelho", "Leitos", ""].map(h => <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "var(--text-muted)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", background: "var(--bg-2)", borderBottom: "1px solid var(--border)" }}>{h}</th>)}</tr></thead>
            <tbody>
              {ordenados.length === 0 && <tr><td colSpan={5} style={{ padding: "18px", textAlign: "center", color: "var(--text-muted)" }}>Nenhum setor cadastrado.</td></tr>}
              {ordenados.map(s => (
                <tr key={s.nome}>
                  <td style={{ padding: "7px 12px", fontWeight: 700 }}>{s.nome}</td>
                  <td style={{ padding: "7px 12px", color: "#fbbf24" }}>{s.alerta_amarelo}%</td>
                  <td style={{ padding: "7px 12px", color: "#f43f5e" }}>{s.alerta_vermelho}%</td>
                  <td style={{ padding: "7px 12px", color: "var(--text-3)" }}>{leitos.filter(l => (l.setor || "") === s.nome).length}</td>
                  <td style={{ padding: "7px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                    <button onClick={() => setF({ nome: s.nome, alerta_amarelo: s.alerta_amarelo, alerta_vermelho: s.alerta_vermelho })} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 5, padding: "3px 8px", color: "#22d3ee", cursor: "pointer", fontSize: 12, marginRight: 6 }}>Editar</button>
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

// ═══════════════════════════════════════════════════════════
// PACIENTE 360 — registro clínico integrado (timeline + evoluções)
// ═══════════════════════════════════════════════════════════
const TIPOS_EVOLUCAO = {
  evolucao_medica: { label: "Evolução médica",        cor: "#3b82f6" },
  enfermagem:      { label: "Evolução de enfermagem", cor: "#0d9488" },
  fisioterapia:    { label: "Fisioterapia",           cor: "#6366f1" },
  nutricao:        { label: "Nutrição",               cor: "#d97706" },
  anotacao:        { label: "Anotação administrativa", cor: "#8d99ab" },
};
async function loadPaciente360(prontuario) {
  const p = encodeURIComponent(prontuario);
  const [cad, ps, leitoAtual, saidas, scih, evolucoes] = await Promise.all([
    sbFetch(`pacientes?prontuario=eq.${p}&select=*`),
    sbFetch(`ps_atendimentos?prontuario=eq.${p}&select=*&order=chegada_em.desc`),
    sbFetch(`leitos?prontuario=eq.${p}&status=eq.ocupado&select=*`),
    sbFetch(`leitos_saidas?prontuario=eq.${p}&select=*&order=data_alta.desc`).catch(() => []),
    sbFetch(`scih_casos?prontuario=eq.${p}&select=*&order=criado_em.desc`).catch(() => []),
    sbFetch(`pep_evolucoes?prontuario=eq.${p}&select=*&order=criado_em.desc`),
  ]);
  return {
    cadastro: Array.isArray(cad) && cad[0] ? cad[0] : null,
    ps: Array.isArray(ps) ? ps : [], leitoAtual: Array.isArray(leitoAtual) ? leitoAtual : [],
    saidas: Array.isArray(saidas) ? saidas : [], scih: Array.isArray(scih) ? scih : [],
    evolucoes: Array.isArray(evolucoes) ? evolucoes : [],
  };
}
async function buscarPacientesPorIniciais(termo) {
  const rows = await sbFetch(`pacientes?iniciais=ilike.*${encodeURIComponent(termo)}*&select=*&limit=10`);
  return Array.isArray(rows) ? rows : [];
}
async function upsertPacienteRemote(pac, user) {
  if (!USE_SUPABASE) return;
  await sbFetch("pacientes?on_conflict=prontuario", {
    method: "POST", headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ ...pac, usuario: user?.name || null, updated_at: nowISO() }),
  });
}
async function addEvolucaoRemote(ev, user) {
  if (!USE_SUPABASE) return;
  await sbFetch("pep_evolucoes", { method: "POST", body: JSON.stringify({ ...ev, usuario: user?.name || null }) });
}
// Monta a linha do tempo unificada a partir de todos os módulos
function montarTimeline(d) {
  const ev = [];
  const push = (quando, modulo, cor, titulo, detalhe) => { if (quando) ev.push({ quando, modulo, cor, titulo, detalhe }); };
  d.ps.forEach(a => {
    push(a.chegada_em, "PS", "#6366f1", "Chegada no Pronto-Socorro", a.queixa || null);
    if (a.triagem_em) push(a.triagem_em, "PS", MANCHESTER[a.classificacao]?.cor || "#6366f1", `Triagem: ${MANCHESTER[a.classificacao]?.label || a.classificacao || "—"}`, fmtSinaisVitais(a) || null);
    if (a.atendimento_em) push(a.atendimento_em, "PS", "#6366f1", "Início do atendimento", null);
    if (a.desfecho_em) push(a.desfecho_em, "PS", PS_DESFECHOS[a.desfecho]?.cor || "#6366f1", `Desfecho no PS: ${PS_DESFECHOS[a.desfecho]?.label || a.desfecho}${a.setor_destino ? " → " + a.setor_destino : ""}`, a.observacao || null);
  });
  d.leitoAtual.forEach(l => {
    push(l.entrada_em || (l.data_internacao ? l.data_internacao + "T12:00:00" : null), "Internação", "#0d9488", `Internado no leito ${l.identificacao}${l.setor ? " (" + l.setor + ")" : ""} — em andamento`, [l.cid ? "CID " + l.cid : null, l.motivo].filter(Boolean).join(" · ") || null);
  });
  d.saidas.forEach(s => {
    push(s.data_internacao ? s.data_internacao + "T12:00:00" : null, "Internação", "#0d9488", `Internação no leito ${s.leito}`, [s.cid ? "CID " + s.cid : null, s.motivo].filter(Boolean).join(" · ") || null);
    push(s.data_alta ? s.data_alta + "T12:00:01" : null, "Internação", "#34d399", `Alta hospitalar${s.dias_permanencia != null ? ` — ${s.dias_permanencia}d de permanência` : ""}`, null);
  });
  d.scih.forEach(c => {
    if (c.data_coleta) push(c.data_coleta + "T12:00:00", "SCIH", "#d97706", "Cultura coletada", null);
    if (c.data_resultado) push(c.data_resultado + "T12:00:01", "SCIH", "#d97706", `Resultado de cultura: ${c.germe || "—"}${c.multirresistente ? " (multirresistente)" : ""}`, c.isolamento && ISOLAMENTOS[c.isolamento] ? "Isolamento " + ISOLAMENTOS[c.isolamento].label : null);
    else if (!c.data_coleta) push(c.criado_em, "SCIH", "#d97706", "Caso de vigilância SCIH aberto", c.germe || null);
  });
  d.evolucoes.forEach(e => {
    push(e.criado_em, TIPOS_EVOLUCAO[e.tipo]?.label || "Evolução", TIPOS_EVOLUCAO[e.tipo]?.cor || "#3b82f6", TIPOS_EVOLUCAO[e.tipo]?.label || e.tipo, e.texto);
  });
  return ev.sort((a, b) => new Date(b.quando) - new Date(a.quando));
}
// Sentinela: alertas automáticos sobre o paciente
function sentinelaPaciente(d) {
  const alertas = [];
  d.ps.filter(a => a.status !== "finalizado").forEach(a => alertas.push({ cor: "#f97316", texto: `Paciente está no PS agora (${a.status.replace(/_/g, " ")})` }));
  d.leitoAtual.forEach(l => {
    const s = sinalLeito(l.data_internacao, l.dias_previstos);
    if (s.restam != null && s.restam < 0) alertas.push({ cor: "#f43f5e", texto: `Internação ${Math.abs(s.restam)}d além da previsão de alta (leito ${l.identificacao})` });
  });
  d.scih.filter(c => c.status !== "encerrado").forEach(c => {
    alertas.push({ cor: "#d97706", texto: `Vigilância SCIH ativa${c.germe ? ": " + c.germe : ""}${c.isolamento && ISOLAMENTOS[c.isolamento] ? " · isolamento " + ISOLAMENTOS[c.isolamento].label : ""}` });
    if (c.data_coleta && !c.data_resultado) {
      const dias = diasDesde(c.data_coleta);
      if (dias != null && dias >= 3) alertas.push({ cor: "#fbbf24", texto: `Cultura coletada há ${dias}d sem resultado registrado` });
    }
  });
  return alertas;
}

// Resumo automático de passagem de plantão — gerado localmente, sem custo e
// sem serviço externo (os dados não saem do navegador).
function resumoLocalPaciente(prontuario, dados, timeline, alertas) {
  const ini = dados?.cadastro?.iniciais || "O paciente";
  const idade = dados?.cadastro?.ano_nascimento ? `${new Date().getFullYear() - dados.cadastro.ano_nascimento} anos` : null;
  const frases = [];

  // Situação atual
  const psAberto = dados.ps.find(a => a.status !== "finalizado");
  if (dados.leitoAtual.length) {
    const l = dados.leitoAtual[0];
    const desde = l.data_internacao ? new Date(l.data_internacao + "T00:00:00").toLocaleDateString("pt-BR") : null;
    frases.push(`${ini}${idade ? ` (${idade})` : ""}, prontuário ${prontuario}, está internado no leito ${l.identificacao}${l.setor ? ` (${l.setor})` : ""}${desde ? ` desde ${desde}` : ""}${l.cid ? `, CID ${l.cid}` : ""}${l.motivo ? ` — ${l.motivo}` : ""}.`);
    const s = sinalLeito(l.data_internacao, l.dias_previstos);
    if (s.restam != null) frases.push(s.restam < 0 ? `A previsão de alta está vencida há ${Math.abs(s.restam)} dia(s).` : `A previsão de alta é em ${s.restam} dia(s).`);
  } else if (psAberto) {
    frases.push(`${ini}${idade ? ` (${idade})` : ""}, prontuário ${prontuario}, está no Pronto-Socorro (${psAberto.status.replace(/_/g, " ")})${psAberto.classificacao ? `, classificação ${MANCHESTER[psAberto.classificacao]?.label || psAberto.classificacao}` : ""}${psAberto.queixa ? `, queixa: ${psAberto.queixa}` : ""}.`);
  } else {
    frases.push(`${ini}${idade ? ` (${idade})` : ""}, prontuário ${prontuario}, não está internado nem em atendimento no momento.`);
  }

  // Histórico
  const nInt = dados.saidas.length + dados.leitoAtual.length;
  const nPS = dados.ps.length;
  if (nInt || nPS) {
    const ultAlta = dados.saidas[0];
    frases.push(`Histórico no sistema: ${nInt} internação(ões) e ${nPS} passagem(ns) pelo PS${ultAlta?.data_alta ? `; última alta em ${new Date(ultAlta.data_alta + "T00:00:00").toLocaleDateString("pt-BR")}${ultAlta.dias_permanencia != null ? ` após ${ultAlta.dias_permanencia} dia(s)` : ""}` : ""}.`);
  }

  // SCIH
  const scihAtivo = dados.scih.filter(c => c.status !== "encerrado");
  scihAtivo.forEach(c => {
    frases.push(`Vigilância SCIH ativa${c.germe ? `: ${c.germe}${c.multirresistente ? " (multirresistente)" : ""}` : ""}${c.isolamento && ISOLAMENTOS[c.isolamento] ? `, isolamento de ${ISOLAMENTOS[c.isolamento].label.toLowerCase()}` : ""}${c.antibiotico ? `, em uso de ${c.antibiotico}` : ""}.`);
  });

  // Última evolução
  const ultEv = dados.evolucoes[0];
  if (ultEv) frases.push(`Última evolução (${TIPOS_EVOLUCAO[ultEv.tipo]?.label.toLowerCase() || ultEv.tipo}, ${horaFmt(ultEv.criado_em)}, por ${ultEv.usuario || "?"}): "${ultEv.texto.length > 220 ? ultEv.texto.slice(0, 220) + "…" : ultEv.texto}"`);

  // Pendências
  if (alertas.length) frases.push(`Pendências e alertas: ${alertas.map(a => a.texto.toLowerCase()).join("; ")}.`);
  else frases.push("Sem pendências ou alertas ativos no momento.");

  return frases.join(" ");
}

// ── Página Paciente 360 ──
function PacientePage({ currentUser, canEdit }) {
  const [busca, setBusca] = useState("");
  const [sugestoes, setSugestoes] = useState([]);
  const [prontuario, setProntuario] = useState(null);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [cadForm, setCadForm] = useState(null); // form de cadastro mínimo quando não existe
  const [resumoIA, setResumoIA] = useState(null);
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 12px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", boxSizing: "border-box" };
  const secLbl = { fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 };

  async function abrir(pront) {
    setCarregando(true); setProntuario(pront); setSugestoes([]); setResumoIA(null);
    const d = await loadPaciente360(pront);
    setDados(d); setCadForm(null); setCarregando(false);
  }
  function resumir() {
    setResumoIA(resumoLocalPaciente(prontuario, dados, timeline, alertas));
    addAuditLog(currentUser, "resumo do paciente", prontuario, {});
  }
  async function buscar() {
    const t = busca.trim();
    if (!t) return;
    if (/^\d+$/.test(t)) { abrir(t); return; }
    const achados = await buscarPacientesPorIniciais(t);
    if (achados.length === 1) abrir(achados[0].prontuario);
    else if (achados.length > 1) setSugestoes(achados);
    else { setSugestoes([]); alert("Nenhum paciente cadastrado com essas iniciais. Busque pelo número do prontuário."); }
  }
  async function salvarCadastro() {
    if (!cadForm.iniciais.trim()) { alert("Informe as iniciais."); return; }
    await upsertPacienteRemote({ prontuario, iniciais: cadForm.iniciais.trim(), ano_nascimento: cadForm.ano_nascimento ? Number(cadForm.ano_nascimento) : null, sexo: cadForm.sexo || null }, currentUser);
    addAuditLog(currentUser, "cadastrar paciente", prontuario, {});
    abrir(prontuario);
  }
  const idade = dados?.cadastro?.ano_nascimento ? new Date().getFullYear() - dados.cadastro.ano_nascimento : null;
  const timeline = dados ? montarTimeline(dados) : [];
  const alertas = dados ? sentinelaPaciente(dados) : [];
  const iniciaisConhecidas = dados?.cadastro?.iniciais
    || dados?.leitoAtual[0]?.iniciais || dados?.ps[0]?.iniciais || dados?.saidas[0]?.iniciais || dados?.scih[0]?.iniciais || null;

  return (
    <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Paciente 360 — Registro Clínico Integrado</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: "1.25rem" }}>Linha do tempo automática de todos os módulos + evoluções da equipe. Registro imutável: evoluções não podem ser editadas nem apagadas.</div>

      {/* BUSCA */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => e.key === "Enter" && buscar()} placeholder="Nº do prontuário ou iniciais (ex.: 48213 ou J.S.M.)" style={{ ...inp, flex: 1, minWidth: 240 }} />
        <button onClick={buscar} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Buscar</button>
      </div>
      {sugestoes.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {sugestoes.map(s => <button key={s.prontuario} onClick={() => abrir(s.prontuario)} style={btnLeito("#22d3ee")}>{s.iniciais} · reg. {s.prontuario}</button>)}
        </div>
      )}
      {carregando && <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "1rem 0" }}>Carregando…</div>}

      {dados && !carregando && (
        <>
          {/* CABEÇALHO DO PACIENTE */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", margin: "10px 0 16px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: "#0d948822", border: "1px solid #0d948855", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, color: "#2dd4bf" }}>
              {(iniciaisConhecidas || "?").charAt(0)}
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{iniciaisConhecidas || "Paciente"} <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400 }}>· prontuário {prontuario}</span></div>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                {idade != null ? `${idade} anos` : "idade não cadastrada"}{dados.cadastro?.sexo ? ` · ${dados.cadastro.sexo}` : ""}
                {dados.leitoAtual.length > 0 && <strong style={{ color: "#22d3ee" }}> · internado agora — leito {dados.leitoAtual[0].identificacao}{dados.leitoAtual[0].setor ? ` (${dados.leitoAtual[0].setor})` : ""}</strong>}
              </div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              {!dados.cadastro && canEdit && !cadForm && (
                <button onClick={() => setCadForm({ iniciais: iniciaisConhecidas || "", ano_nascimento: "", sexo: "" })} style={btnLeito("#22d3ee")}>Completar cadastro</button>
              )}
              {timeline.length > 0 && (
                <button onClick={resumir} style={{ background: `linear-gradient(90deg, ${VX.turquesa}, ${VX.azul})`, color: "#062a35", border: "none", borderRadius: 6, padding: "7px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Resumo do paciente</button>
              )}
            </div>
          </div>

          {/* RESUMO POR IA */}
          {resumoIA && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${VX.turquesa}`, borderRadius: 10, padding: "14px 18px", marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: VX.turquesa, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6 }}>Resumo de passagem de plantão</div>
              <div style={{ fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{resumoIA}</div>
              <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 8 }}>Gerado automaticamente a partir da linha do tempo. Confira as informações antes de usar — a conduta é sempre do médico assistente.</div>
            </div>
          )}

          {/* CADASTRO MÍNIMO */}
          {cadForm && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div><label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 4 }}>Iniciais *</label><input value={cadForm.iniciais} onChange={e => setCadForm(p => ({ ...p, iniciais: e.target.value }))} style={{ ...inp, width: 110 }} /></div>
              <div><label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 4 }}>Ano de nascimento</label><input type="number" value={cadForm.ano_nascimento} onChange={e => setCadForm(p => ({ ...p, ano_nascimento: e.target.value }))} placeholder="1957" style={{ ...inp, width: 100 }} /></div>
              <div><label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 4 }}>Sexo</label>
                <select value={cadForm.sexo} onChange={e => setCadForm(p => ({ ...p, sexo: e.target.value }))} style={{ ...inp, width: 130 }}>
                  <option value="">—</option><option value="feminino">Feminino</option><option value="masculino">Masculino</option>
                </select></div>
              <button onClick={salvarCadastro} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Salvar cadastro</button>
              <button onClick={() => setCadForm(null)} style={btnLeito("var(--text-muted)")}>Cancelar</button>
            </div>
          )}

          {/* SENTINELA */}
          {alertas.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
              {alertas.map((a, i) => (
                <div key={i} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: `4px solid ${a.cor}`, borderRadius: 8, padding: "8px 13px", fontSize: 12.5, color: "var(--text-2)", fontWeight: 600 }}>{a.texto}</div>
              ))}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16, alignItems: "start" }}>
            {/* TIMELINE */}
            <div>
              <div style={secLbl}>Linha do tempo ({timeline.length})</div>
              {timeline.length === 0 && <div style={{ fontSize: 13, color: "var(--text-muted)", background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 8, padding: "14px", textAlign: "center" }}>Nenhum registro encontrado para este prontuário.</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {timeline.map((e, i) => (
                  <div key={i} style={{ display: "flex", gap: 12 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 14 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 99, background: e.cor, marginTop: 6, flexShrink: 0 }} />
                      {i < timeline.length - 1 && <span style={{ width: 2, flex: 1, background: "var(--border)", minHeight: 18 }} />}
                    </div>
                    <div style={{ paddingBottom: 14, flex: 1 }}>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{horaFmt(e.quando)} · {e.modulo}</div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", marginTop: 1 }}>{e.titulo}</div>
                      {e.detalhe && <div style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.55, marginTop: 2, whiteSpace: "pre-wrap" }}>{e.detalhe}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* NOVA EVOLUÇÃO */}
            <div style={{ position: "sticky", top: 0 }}>
              <div style={secLbl}>Nova evolução</div>
              {canEdit ? <EvolucaoForm prontuario={prontuario} currentUser={currentUser} onSaved={() => abrir(prontuario)} /> :
                <div style={{ fontSize: 12.5, color: "var(--text-muted)", background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 8, padding: "12px" }}>Seu perfil é somente leitura.</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Formulário de evolução com ditado por voz (Web Speech API, pt-BR)
function EvolucaoForm({ prontuario, currentUser, onSaved }) {
  const [tipo, setTipo] = useState("evolucao_medica");
  const [texto, setTexto] = useState("");
  const [gravando, setGravando] = useState(false);
  const [busy, setBusy] = useState(false);
  const recRef = useRef(null);
  const suportaVoz = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 12px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };

  function toggleVoz() {
    if (gravando) { recRef.current?.stop(); setGravando(false); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "pt-BR"; rec.continuous = true; rec.interimResults = false;
    rec.onresult = ev => {
      let novo = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) novo += ev.results[i][0].transcript;
      if (novo) setTexto(t => (t ? t.trimEnd() + " " : "") + novo.trim());
    };
    rec.onend = () => setGravando(false);
    rec.onerror = () => setGravando(false);
    recRef.current = rec; rec.start(); setGravando(true);
  }
  async function salvar() {
    if (!texto.trim()) { alert("Escreva (ou dite) o texto da evolução."); return; }
    if (!confirm("Salvar esta evolução? Ela NÃO poderá ser editada nem apagada depois (registro clínico).")) return;
    setBusy(true);
    if (gravando) { recRef.current?.stop(); setGravando(false); }
    await addEvolucaoRemote({ prontuario, tipo, texto: texto.trim(), criado_em: nowISO() }, currentUser);
    addAuditLog(currentUser, "nova evolução", `${prontuario} (${tipo})`, {});
    setTexto(""); setBusy(false); onSaved?.();
  }
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px" }}>
      <select value={tipo} onChange={e => setTipo(e.target.value)} style={{ ...inp, marginBottom: 8 }}>
        {Object.entries(TIPOS_EVOLUCAO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={7} placeholder="Escreva a evolução — ou clique em Ditar e fale." style={{ ...inp, resize: "vertical", lineHeight: 1.55, marginBottom: 8 }} />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {suportaVoz ? (
          <button onClick={toggleVoz} style={{ background: gravando ? "#f43f5e" : "transparent", color: gravando ? "#fff" : "var(--text-2)", border: `1px solid ${gravando ? "#f43f5e" : "var(--border-2)"}`, borderRadius: 6, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
            {gravando ? "● Gravando… (parar)" : "Ditar por voz"}
          </button>
        ) : <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Ditado por voz indisponível neste navegador (use o Chrome).</span>}
        <button onClick={salvar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13, marginLeft: "auto" }}>{busy ? "…" : "Salvar evolução"}</button>
      </div>
      <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>Assinada como <strong>{currentUser?.name}</strong> com data/hora. Registro imutável — confira antes de salvar.</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// BLOCO CIRÚRGICO — agenda, mapa, workflow do dia e indicadores
// ═══════════════════════════════════════════════════════════
const CC_STATUS = {
  agendada:    { label: "Agendada",          cor: "#8d99ab" },
  checkin:     { label: "Check-in feito",    cor: "#3b82f6" },
  em_cirurgia: { label: "Em cirurgia",       cor: "#22d3ee" },
  recuperacao: { label: "Recuperação (RPA)", cor: "#d97706" },
  concluida:   { label: "Concluída",         cor: "#34d399" },
  cancelada:   { label: "Cancelada",         cor: "#f43f5e" },
};
const CC_MOTIVOS_CANCELAMENTO = [
  "Condição clínica do paciente", "Jejum inadequado", "Falta de material/OPME",
  "Falta de sala/tempo cirúrgico", "Ausência do paciente", "Ausência do cirurgião",
  "Exames pendentes", "Falta de leito para pós-operatório", "Outro",
];
// Checklist de Cirurgia Segura (OMS) — 3 fases, itens oficiais adaptados
const CHECKLIST_OMS = {
  sign_in: {
    campo: "chk_sign_in", label: "Sign In", quando: "antes da indução anestésica", cor: "#3b82f6",
    itens: [
      "Paciente confirmou identidade, sítio cirúrgico, procedimento e consentimento",
      "Sítio cirúrgico demarcado (ou não se aplica)",
      "Verificação de segurança anestésica concluída",
      "Oxímetro de pulso instalado e funcionando",
      "Alergias conhecidas verificadas",
      "Risco de via aérea difícil / broncoaspiração avaliado",
      "Risco de perda sanguínea > 500 ml (7 ml/kg em crianças) avaliado",
    ],
  },
  time_out: {
    campo: "chk_time_out", label: "Time Out", quando: "antes da incisão na pele", cor: "#d97706",
    itens: [
      "Toda a equipe se apresentou pelo nome e função",
      "Confirmado em voz alta: paciente, sítio e procedimento",
      "Antibiótico profilático administrado nos últimos 60 min (ou não se aplica)",
      "Cirurgião revisou: passos críticos, duração e perda sanguínea prevista",
      "Anestesia revisou: particularidades do paciente",
      "Enfermagem revisou: esterilização confirmada e questões de materiais",
      "Exames de imagem essenciais disponíveis na sala (ou não se aplica)",
    ],
  },
  sign_out: {
    campo: "chk_sign_out", label: "Sign Out", quando: "antes de o paciente sair da sala", cor: "#34d399",
    itens: [
      "Nome do procedimento realizado confirmado e registrado",
      "Contagem de compressas, instrumentais e agulhas correta",
      "Amostras cirúrgicas identificadas (nome do paciente) — ou não se aplica",
      "Problemas com equipamentos anotados para correção",
      "Equipe revisou as preocupações para a recuperação do paciente",
    ],
  },
};
async function loadCcSalas() {
  const rows = await sbFetch("cc_salas?select=*&order=ordem");
  return Array.isArray(rows) ? rows : [];
}
async function upsertCcSalaRemote(sala, user) {
  if (!USE_SUPABASE) return;
  await sbFetch("cc_salas?on_conflict=nome", {
    method: "POST", headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ ...sala, usuario: user?.name || null, updated_at: nowISO() }),
  });
}
async function deleteCcSalaRemote(nome) {
  if (!USE_SUPABASE) return;
  await sbFetch(`cc_salas?nome=eq.${encodeURIComponent(nome)}`, { method: "DELETE" });
}
async function loadCcCirurgias(data) {
  const rows = await sbFetch(`cc_cirurgias?data=eq.${data}&select=*&order=hora_prevista`);
  return Array.isArray(rows) ? rows : [];
}
async function addCcCirurgiaRemote(c, user) {
  if (!USE_SUPABASE) return;
  await sbFetch("cc_cirurgias", { method: "POST", body: JSON.stringify({ ...c, usuario: user?.name || null }) });
}
async function updateCcCirurgiaRemote(id, campos) {
  if (!USE_SUPABASE) return;
  await sbFetch(`cc_cirurgias?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ ...campos, updated_at: nowISO() }) });
}
// minutos desde meia-noite a partir de "HH:MM" (p/ detectar conflito de sala)
const horaMin = h => { if (!h) return null; const [hh, mm] = h.split(":").map(Number); return hh * 60 + (mm || 0); };
// Cirurgias da mesma sala cujo intervalo previsto se sobrepõe ao informado
function conflitosDeSala(cirurgias, sala, hora, duracaoMin, ignorarId) {
  if (!sala || !hora) return [];
  const ini = horaMin(hora), fim = ini + (Number(duracaoMin) || 60);
  return cirurgias.filter(c => {
    if (c.id === ignorarId || c.sala !== sala || c.status === "cancelada" || !c.hora_prevista) return false;
    const ci = horaMin(c.hora_prevista.slice(0, 5)), cf = ci + (c.duracao_prev_min || 60);
    return ini < cf && ci < fim;
  });
}

// ── Página Bloco Cirúrgico ──
function BlocoPage({ currentUser, canEdit }) {
  const [data, setData] = useState(todayStr());
  const [salas, setSalas] = useState([]);
  const [cirurgias, setCirurgias] = useState([]);
  const [showSalas, setShowSalas] = useState(false);
  const [agendando, setAgendando] = useState(false); // false | true (nova) | objeto (edição)
  const [cancelando, setCancelando] = useState(null);
  const [checklist, setChecklist] = useState(null); // { cirurgia, fase }
  const [sub, setSub] = useState("mapa"); // mapa | indicadores
  const [, setTick] = useState(0);
  const subBtn = ativo => ({ background: ativo ? "#22d3ee" : "transparent", color: ativo ? "#000" : "var(--text-3)", border: `1px solid ${ativo ? "#22d3ee" : "var(--border)"}`, borderRadius: 7, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 });

  function refresh(d = data) {
    if (!USE_SUPABASE) return;
    loadCcSalas().then(setSalas);
    loadCcCirurgias(d).then(setCirurgias);
  }
  useEffect(() => {
    refresh(data);
    const onFocus = () => refresh(data);
    window.addEventListener("focus", onFocus);
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => { window.removeEventListener("focus", onFocus); clearInterval(id); };
  }, [data]);

  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 11px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", boxSizing: "border-box" };
  const secLbl = { fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 };

  async function salvarCirurgia(c, idEdicao) {
    if (idEdicao) await updateCcCirurgiaRemote(idEdicao, c);
    else await addCcCirurgiaRemote({ ...c, status: "agendada" }, currentUser);
    addAuditLog(currentUser, idEdicao ? "editar cirurgia" : "agendar cirurgia", `${c.iniciais} · ${c.procedimento}`, {});
    setAgendando(false); setTimeout(() => refresh(), 400);
  }
  async function cancelar(c, motivo) {
    await updateCcCirurgiaRemote(c.id, { status: "cancelada", cancelamento_motivo: motivo });
    addAuditLog(currentUser, "cancelar cirurgia", `${c.iniciais} · ${motivo}`, {});
    setCancelando(null); setTimeout(() => refresh(), 300);
  }
  async function marcar(c, campos, acao) {
    await updateCcCirurgiaRemote(c.id, campos);
    addAuditLog(currentUser, `bloco: ${acao}`, c.iniciais, {});
    setTimeout(() => refresh(), 300);
  }
  async function concluirChecklist(c, faseKey) {
    const fase = CHECKLIST_OMS[faseKey];
    await updateCcCirurgiaRemote(c.id, { [fase.campo]: true });
    addAuditLog(currentUser, `bloco: checklist ${fase.label}`, c.iniciais, {});
    setChecklist(null); setTimeout(() => refresh(), 300);
  }

  const ativas = cirurgias.filter(c => c.status !== "cancelada");
  const canceladas = cirurgias.filter(c => c.status === "cancelada");
  const emAndamento = cirurgias.filter(c => ["checkin", "em_cirurgia", "recuperacao"].includes(c.status));
  const concluidas = cirurgias.filter(c => c.status === "concluida");
  const salasAtivas = salas.filter(s => s.ativa !== false);
  // agrupa por sala pro mapa
  const porSala = salasAtivas.map(s => ({ sala: s.nome, lista: ativas.filter(c => c.sala === s.nome) }));
  const semSala = ativas.filter(c => !c.sala || !salasAtivas.some(s => s.nome === c.sala));

  const Card = ({ label, valor, cor }) => (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", minWidth: 120, flex: 1 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: cor || "var(--text)", fontFamily: "JetBrains Mono, monospace", marginTop: 4 }}>{valor}</div>
    </div>
  );
  const StatusBadge = ({ st }) => { const v = CC_STATUS[st]; if (!v) return null;
    return <span style={{ background: v.cor + "22", color: v.cor, border: `1px solid ${v.cor}55`, borderRadius: 99, padding: "2px 10px", fontSize: 11, fontWeight: 800 }}>{v.label}</span>; };

  const CirurgiaCard = ({ c }) => (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: `4px solid ${CC_STATUS[c.status]?.cor || "var(--border)"}`, borderRadius: 8, padding: "10px 13px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 800, fontSize: 13 }}>{c.hora_prevista ? c.hora_prevista.slice(0, 5) : "—"}</span>
        <strong>{c.iniciais}</strong>
        {c.prontuario && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>reg. {c.prontuario}</span>}
        <StatusBadge st={c.status} />
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>{c.duracao_prev_min ? `${c.duracao_prev_min}min prev.` : ""}</span>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 4 }}>{c.procedimento}{c.cirurgiao ? ` · Dr(a). ${c.cirurgiao}` : ""}</div>
      {c.opme && <div style={{ fontSize: 11.5, color: "#d97706", marginTop: 3 }}>OPME/materiais: {c.opme}</div>}
      {c.observacao && <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>Obs.: {c.observacao}</div>}
      {c.status === "cancelada" && c.cancelamento_motivo && <div style={{ fontSize: 11.5, color: "#f43f5e", marginTop: 3, fontWeight: 600 }}>Motivo: {c.cancelamento_motivo}</div>}

      {/* Selos do checklist de cirurgia segura */}
      {!["agendada", "cancelada"].includes(c.status) && (
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          {Object.entries(CHECKLIST_OMS).map(([k, fase]) => (
            <span key={k} style={{ fontSize: 10, fontWeight: 800, borderRadius: 99, padding: "2px 8px", background: c[fase.campo] ? fase.cor + "22" : "var(--surface-3)", color: c[fase.campo] ? fase.cor : "var(--text-muted)", border: `1px solid ${c[fase.campo] ? fase.cor + "55" : "var(--border)"}` }}>
              {c[fase.campo] ? "✓ " : ""}{fase.label}
            </span>
          ))}
        </div>
      )}

      {/* Tempos registrados */}
      {(c.entrada_sala_em || c.checkin_em) && c.status !== "cancelada" && (
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.7 }}>
          {c.checkin_em && <span>Check-in {horaFmt(c.checkin_em).slice(-5)} · </span>}
          {c.entrada_sala_em && <span>Sala {horaFmt(c.entrada_sala_em).slice(-5)} · </span>}
          {c.inicio_anestesia_em && <span>Anestesia {horaFmt(c.inicio_anestesia_em).slice(-5)} · </span>}
          {c.inicio_cirurgia_em && <span>Incisão {horaFmt(c.inicio_cirurgia_em).slice(-5)} · </span>}
          {c.fim_cirurgia_em && <span>Fim {horaFmt(c.fim_cirurgia_em).slice(-5)} · </span>}
          {c.inicio_cirurgia_em && c.fim_cirurgia_em && <strong style={{ color: "var(--text-3)" }}>cirurgia {fmtDur(diffMin(c.inicio_cirurgia_em, c.fim_cirurgia_em))} · </strong>}
          {c.rpa_entrada_em && !c.rpa_saida_em && <strong style={{ color: "#d97706" }}>na RPA há {fmtDur(diffMin(c.rpa_entrada_em, nowISO()))}</strong>}
          {c.rpa_entrada_em && c.rpa_saida_em && <span>RPA {fmtDur(diffMin(c.rpa_entrada_em, c.rpa_saida_em))}</span>}
        </div>
      )}

      {canEdit && c.status !== "cancelada" && c.status !== "concluida" && (
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {c.status === "agendada" && <>
            <button onClick={() => marcar(c, { status: "checkin", checkin_em: nowISO() }, "check-in")} style={btnLeito("#3b82f6")}>Check-in do paciente</button>
            <button onClick={() => setAgendando(c)} style={btnLeito("var(--text-3)")}>Editar</button>
            <button onClick={() => setCancelando(c)} style={btnLeito("#f43f5e")}>Cancelar cirurgia</button>
          </>}
          {c.status === "checkin" && <>
            {!c.chk_sign_in && <button onClick={() => setChecklist({ cirurgia: c, fase: "sign_in" })} style={btnLeito("#3b82f6")}>Cirurgia segura: Sign In</button>}
            <button onClick={() => { if (!c.chk_sign_in && !confirm("O checklist Sign In ainda não foi concluído. Entrar em sala mesmo assim?")) return; marcar(c, { status: "em_cirurgia", entrada_sala_em: nowISO() }, "entrada na sala"); }} style={btnLeito("#22d3ee")}>Entrada na sala</button>
            <button onClick={() => setCancelando(c)} style={btnLeito("#f43f5e")}>Cancelar</button>
          </>}
          {c.status === "em_cirurgia" && <>
            {!c.inicio_anestesia_em && <button onClick={() => marcar(c, { inicio_anestesia_em: nowISO() }, "inicio anestesia")} style={btnLeito("var(--text-3)")}>Início da anestesia</button>}
            {!c.chk_time_out && <button onClick={() => setChecklist({ cirurgia: c, fase: "time_out" })} style={btnLeito("#d97706")}>Cirurgia segura: Time Out</button>}
            {!c.inicio_cirurgia_em && <button onClick={() => { if (!c.chk_time_out && !confirm("O checklist Time Out ainda não foi concluído. Registrar a incisão mesmo assim?")) return; marcar(c, { inicio_cirurgia_em: nowISO() }, "inicio cirurgia"); }} style={btnLeito("#22d3ee")}>Início da cirurgia</button>}
            {c.inicio_cirurgia_em && !c.fim_cirurgia_em && <button onClick={() => marcar(c, { fim_cirurgia_em: nowISO() }, "fim cirurgia")} style={btnLeito("#22d3ee")}>Fim da cirurgia</button>}
            {c.fim_cirurgia_em && !c.chk_sign_out && <button onClick={() => setChecklist({ cirurgia: c, fase: "sign_out" })} style={btnLeito("#34d399")}>Cirurgia segura: Sign Out</button>}
            {c.fim_cirurgia_em && <button onClick={() => { if (!c.chk_sign_out && !confirm("O checklist Sign Out ainda não foi concluído. Enviar para a RPA mesmo assim?")) return; marcar(c, { status: "recuperacao", saida_sala_em: nowISO(), rpa_entrada_em: nowISO() }, "envio RPA"); }} style={btnLeito("#d97706")}>Enviar para RPA</button>}
          </>}
          {c.status === "recuperacao" && (
            <button onClick={() => marcar(c, { status: "concluida", rpa_saida_em: nowISO() }, "alta da RPA")} style={btnLeito("#34d399")}>Alta da RPA — concluir</button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Bloco Cirúrgico — Mapa e Agenda</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: "1.25rem" }}>Agenda por sala, cirurgia segura e tempos do dia. Dados de saúde — use iniciais e prontuário (LGPD).</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canEdit && <button onClick={() => setShowSalas(true)} style={{ background: "transparent", color: "var(--text-2)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Salas ({salasAtivas.length})</button>}
          {canEdit && <button onClick={() => setAgendando(true)} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Agendar cirurgia</button>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <button onClick={() => setSub("mapa")} style={subBtn(sub === "mapa")}>Mapa do dia</button>
        <button onClick={() => setSub("indicadores")} style={subBtn(sub === "indicadores")}>Indicadores</button>
      </div>

      {sub === "indicadores" && <BlocoIndicadores salasAtivas={salasAtivas} />}

      {sub === "mapa" && (<>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)" }}>Dia do mapa</label>
        <input type="date" value={data} onChange={e => setData(e.target.value)} style={inp} />
        {data !== todayStr() && <button onClick={() => setData(todayStr())} style={btnLeito("#22d3ee")}>Hoje</button>}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: "1.25rem" }}>
        <Card label="Cirurgias no dia" valor={ativas.length} cor="#22d3ee" />
        <Card label="Em andamento" valor={emAndamento.length} cor="#3b82f6" />
        <Card label="Concluídas" valor={concluidas.length} cor="#34d399" />
        <Card label="Canceladas" valor={canceladas.length} cor={canceladas.length > 0 ? "#f43f5e" : "var(--text)"} />
      </div>

      {/* MAPA CIRÚRGICO POR SALA */}
      <div style={secLbl}>Mapa cirúrgico — {new Date(data + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })}</div>
      {salasAtivas.length === 0 ? (
        <div style={{ background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 10, padding: "1.5rem", textAlign: "center", color: "var(--text-muted)", fontSize: 13, marginBottom: "1.25rem" }}>
          Nenhuma sala cadastrada. {canEdit ? "Clique em Salas para cadastrar as salas do bloco." : ""}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, marginBottom: "1.25rem" }}>
          {porSala.map(({ sala, lista }) => (
            <div key={sala} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {sala}
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>{lista.length} cirurgia(s)</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {lista.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: "10px 0" }}>Sala livre neste dia.</div>}
                {lista.map(c => <CirurgiaCard key={c.id} c={c} />)}
              </div>
            </div>
          ))}
        </div>
      )}
      {semSala.length > 0 && (
        <div style={{ marginBottom: "1.25rem" }}>
          <div style={secLbl}>Sem sala definida ({semSala.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{semSala.map(c => <CirurgiaCard key={c.id} c={c} />)}</div>
        </div>
      )}

      {/* CANCELADAS DO DIA */}
      {canceladas.length > 0 && (
        <details style={{ marginBottom: "1.25rem" }}>
          <summary style={{ ...secLbl, cursor: "pointer" }}>Canceladas no dia ({canceladas.length})</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>{canceladas.map(c => <CirurgiaCard key={c.id} c={c} />)}</div>
        </details>
      )}
      </>)}

      {agendando && <AgendarCirurgiaModal cirurgia={agendando === true ? null : agendando} data={data} salas={salasAtivas} cirurgiasDoDia={cirurgias} onClose={() => setAgendando(false)} onSave={salvarCirurgia} />}
      {cancelando && <CancelarCirurgiaModal cirurgia={cancelando} onClose={() => setCancelando(null)} onConfirm={cancelar} />}
      {checklist && <ChecklistOmsModal cirurgia={checklist.cirurgia} fase={checklist.fase} onClose={() => setChecklist(null)} onConfirm={() => concluirChecklist(checklist.cirurgia, checklist.fase)} />}
      {showSalas && <CcSalasModal salas={salas} onClose={() => setShowSalas(false)} onSave={async s => { await upsertCcSalaRemote(s, currentUser); refresh(); }} onDelete={async n => { await deleteCcSalaRemote(n); refresh(); }} isMaster={currentUser?.role === "adm_master"} />}
    </div>
  );
}

// Modal de agendamento (nova cirurgia ou edição) com detecção de conflito de sala
function AgendarCirurgiaModal({ cirurgia, data, salas, cirurgiasDoDia, onClose, onSave }) {
  const [f, setF] = useState({
    data: cirurgia?.data || data, hora_prevista: cirurgia?.hora_prevista?.slice(0, 5) || "",
    duracao_prev_min: cirurgia?.duracao_prev_min || "", sala: cirurgia?.sala || "",
    iniciais: cirurgia?.iniciais || "", prontuario: cirurgia?.prontuario || "",
    procedimento: cirurgia?.procedimento || "", cirurgiao: cirurgia?.cirurgiao || "",
    opme: cirurgia?.opme || "", observacao: cirurgia?.observacao || "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 11px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  const lbl = { fontSize: 11, fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 5 };
  const conflitos = f.data === data ? conflitosDeSala(cirurgiasDoDia, f.sala, f.hora_prevista, f.duracao_prev_min, cirurgia?.id) : [];
  async function salvar() {
    if (!f.iniciais.trim() || !f.procedimento.trim()) { alert("Informe ao menos as iniciais do paciente e o procedimento."); return; }
    if (conflitos.length && !confirm(`Atenção: a sala ${f.sala} já tem ${conflitos.length} cirurgia(s) nesse horário (${conflitos.map(c => c.iniciais).join(", ")}). Agendar mesmo assim?`)) return;
    setBusy(true);
    await onSave({
      data: f.data, hora_prevista: f.hora_prevista || null, duracao_prev_min: f.duracao_prev_min ? Number(f.duracao_prev_min) : null,
      sala: f.sala || null, iniciais: f.iniciais.trim(), prontuario: f.prontuario.trim() || null,
      procedimento: f.procedimento.trim(), cirurgiao: f.cirurgiao.trim() || null,
      opme: f.opme.trim() || null, observacao: f.observacao.trim() || null,
    }, cirurgia?.id);
    setBusy(false);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 540, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>{cirurgia ? "Editar cirurgia" : "Agendar cirurgia"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Data</label><input type="date" value={f.data} onChange={e => set("data", e.target.value)} style={inp} /></div>
          <div><label style={lbl}>Hora prevista</label><input type="time" value={f.hora_prevista} onChange={e => set("hora_prevista", e.target.value)} style={inp} /></div>
          <div><label style={lbl}>Duração (min)</label><input type="number" min="10" step="10" value={f.duracao_prev_min} onChange={e => set("duracao_prev_min", e.target.value)} placeholder="90" style={inp} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Sala</label>
            <select value={f.sala} onChange={e => set("sala", e.target.value)} style={inp}>
              <option value="">— definir depois —</option>
              {salas.map(s => <option key={s.nome} value={s.nome}>{s.nome}</option>)}
            </select></div>
          <div><label style={lbl}>Iniciais do paciente *</label><input value={f.iniciais} onChange={e => set("iniciais", e.target.value)} placeholder="J.S.M." style={inp} /></div>
          <div><label style={lbl}>Prontuário</label><input value={f.prontuario} onChange={e => set("prontuario", e.target.value)} placeholder="48213" style={inp} /></div>
        </div>
        {conflitos.length > 0 && <div style={{ background: "#3d2206", border: "1px solid #f9731666", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#f97316", fontWeight: 600, marginBottom: 10 }}>Conflito de sala: já há {conflitos.length} cirurgia(s) na {f.sala} nesse intervalo.</div>}
        <div style={{ marginBottom: 10 }}><label style={lbl}>Procedimento *</label><input value={f.procedimento} onChange={e => set("procedimento", e.target.value)} placeholder="Ex.: Colecistectomia videolaparoscópica" style={inp} /></div>
        <div style={{ marginBottom: 10 }}><label style={lbl}>Cirurgião</label><input value={f.cirurgiao} onChange={e => set("cirurgiao", e.target.value)} placeholder="Sobrenome do cirurgião" style={inp} /></div>
        <div style={{ marginBottom: 10 }}><label style={lbl}>Materiais e OPME necessários</label><textarea value={f.opme} onChange={e => set("opme", e.target.value)} rows={2} placeholder="Ex.: kit vídeo, clipes de titânio; OPME: prótese X (fornecedor Y)" style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} /></div>
        <div style={{ marginBottom: 16 }}><label style={lbl}>Observação</label><input value={f.observacao} onChange={e => set("observacao", e.target.value)} placeholder="Opcional" style={inp} /></div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={salvar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : cirurgia ? "Salvar alterações" : "Agendar"}</button>
        </div>
      </div>
    </div>
  );
}

// Modal de cancelamento com motivo padronizado (alimenta o indicador da Fase C)
function CancelarCirurgiaModal({ cirurgia, onClose, onConfirm }) {
  const [motivo, setMotivo] = useState("");
  const [outro, setOutro] = useState("");
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 11px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  function confirmar() {
    const m = motivo === "Outro" ? (outro.trim() ? `Outro: ${outro.trim()}` : "") : motivo;
    if (!m) { alert("Escolha o motivo do cancelamento."); return; }
    onConfirm(cirurgia, m);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 420, maxWidth: "94vw" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Cancelar cirurgia — {cirurgia.iniciais}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>{cirurgia.procedimento}</div>
        <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 5 }}>Motivo do cancelamento *</label>
        <select value={motivo} onChange={e => setMotivo(e.target.value)} style={{ ...inp, marginBottom: 10 }}>
          <option value="">Escolha…</option>
          {CC_MOTIVOS_CANCELAMENTO.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        {motivo === "Outro" && <input value={outro} onChange={e => setOutro(e.target.value)} placeholder="Descreva o motivo" style={{ ...inp, marginBottom: 10 }} />}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Voltar</button>
          <button onClick={confirmar} style={{ background: "#f43f5e", color: "#fff", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Confirmar cancelamento</button>
        </div>
      </div>
    </div>
  );
}

// ── Fase C: indicadores do Bloco Cirúrgico ──
function diasUteisNoMes(ano, mes) {
  let n = 0;
  const d = new Date(ano, mes, 1);
  while (d.getMonth() === mes) { const dow = d.getDay(); if (dow >= 1 && dow <= 5) n++; d.setDate(d.getDate() + 1); }
  return n;
}
function BlocoIndicadores({ salasAtivas }) {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth());
  const [ano, setAno] = useState(now.getFullYear());
  const [rows, setRows] = useState([]);
  const [horasDia, setHorasDia] = useState(8);
  const [diasMes, setDiasMes] = useState(() => diasUteisNoMes(now.getFullYear(), now.getMonth()));

  useEffect(() => {
    const ini = `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
    const fim = `${ano}-${String(mes + 1).padStart(2, "0")}-31`;
    if (USE_SUPABASE) sbFetch(`cc_cirurgias?data=gte.${ini}&data=lte.${fim}&select=*`).then(r => setRows(Array.isArray(r) ? r : []));
    setDiasMes(diasUteisNoMes(ano, mes));
  }, [mes, ano]);

  const inp = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none" };
  const secLbl = { fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 };
  const fmt1 = v => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));

  const concluidas = rows.filter(c => c.status === "concluida");
  const canceladas = rows.filter(c => c.status === "cancelada");
  const total = rows.length;
  const txCancel = total > 0 ? (canceladas.length / total) * 100 : null;

  // Ocupação de salas: minutos de sala usados ÷ minutos ofertados
  const minutosUsados = rows.reduce((a, c) => {
    const m = diffMin(c.entrada_sala_em, c.saida_sala_em);
    return a + (m != null && m > 0 ? m : 0);
  }, 0);
  const minutosOfertados = salasAtivas.length * diasMes * horasDia * 60;
  const ocupacao = minutosOfertados > 0 ? (minutosUsados / minutosOfertados) * 100 : null;

  // Tempos médios
  const media = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const tCirurgia = media(concluidas.map(c => diffMin(c.inicio_cirurgia_em, c.fim_cirurgia_em)).filter(v => v != null && v > 0));
  const tSala = media(concluidas.map(c => diffMin(c.entrada_sala_em, c.saida_sala_em)).filter(v => v != null && v > 0));
  const tRpa = media(concluidas.map(c => diffMin(c.rpa_entrada_em, c.rpa_saida_em)).filter(v => v != null && v > 0));

  // Adesão ao checklist de cirurgia segura
  const comChecklist = concluidas.filter(c => c.chk_sign_in && c.chk_time_out && c.chk_sign_out).length;
  const adesao = concluidas.length > 0 ? (comChecklist / concluidas.length) * 100 : null;

  // Cancelamentos por motivo
  const porMotivo = {};
  canceladas.forEach(c => { const m = (c.cancelamento_motivo || "Sem motivo registrado").replace(/^Outro: .*/, "Outro"); porMotivo[m] = (porMotivo[m] || 0) + 1; });
  const motivosOrd = Object.entries(porMotivo).sort((a, b) => b[1] - a[1]);

  // Produtividade por cirurgião
  const porCirurgiao = {};
  concluidas.forEach(c => {
    const nome = c.cirurgiao || "Sem cirurgião registrado";
    if (!porCirurgiao[nome]) porCirurgiao[nome] = { n: 0, min: 0, comTempo: 0 };
    porCirurgiao[nome].n++;
    const m = diffMin(c.inicio_cirurgia_em, c.fim_cirurgia_em);
    if (m != null && m > 0) { porCirurgiao[nome].min += m; porCirurgiao[nome].comTempo++; }
  });
  const cirurgioesOrd = Object.entries(porCirurgiao).sort((a, b) => b[1].n - a[1].n);
  const maxN = cirurgioesOrd.length ? cirurgioesOrd[0][1].n : 0;
  const maxMotivo = motivosOrd.length ? motivosOrd[0][1] : 0;

  const RateCard = ({ label, valor, unidade, cor, sub }) => (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${cor || "var(--border)"}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: cor || "var(--text)", fontFamily: "JetBrains Mono, monospace", marginTop: 3 }}>{valor}<span style={{ fontSize: 12, fontWeight: 600, marginLeft: 3, color: "var(--text-muted)" }}>{unidade}</span></div>
      {sub && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
  const Barra = ({ rotulo, valor, max, cor, extra }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 12, color: "var(--text-2)", width: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rotulo}</span>
      <div style={{ flex: 1, height: 14, background: "var(--surface-3)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: (max > 0 ? Math.max(3, (valor / max) * 100) : 0) + "%", height: "100%", background: cor, borderRadius: 99 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, width: 110, textAlign: "right", color: "var(--text)" }}>{extra}</span>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: "1.25rem" }}>
        <div><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 4 }}>Mês</div>
          <select value={mes} onChange={e => setMes(+e.target.value)} style={inp}>{MONTHS_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}</select></div>
        <div><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 4 }}>Ano</div>
          <input type="number" value={ano} onChange={e => setAno(+e.target.value)} style={{ ...inp, width: 90 }} /></div>
        <div><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 4 }}>Horas ofertadas/sala/dia</div>
          <input type="number" min="1" max="24" value={horasDia} onChange={e => setHorasDia(Number(e.target.value) || 8)} style={{ ...inp, width: 90 }} /></div>
        <div><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 4 }}>Dias considerados</div>
          <input type="number" min="1" max="31" value={diasMes} onChange={e => setDiasMes(Number(e.target.value) || 1)} style={{ ...inp, width: 80 }} /></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: "1.5rem" }}>
        <RateCard label="Cirurgias no mês" valor={total} unidade="" cor="#3b82f6" sub={`${concluidas.length} concluída(s)`} />
        <RateCard label="Ocupação de salas" valor={ocupacao != null ? fmt1(ocupacao) : "—"} unidade="%" cor={ocupacao == null ? "var(--border)" : ocupacao >= 75 ? "#34d399" : ocupacao >= 50 ? "#d97706" : "#f43f5e"} sub={`${fmtDur(minutosUsados)} usados · ${salasAtivas.length} sala(s) × ${diasMes}d × ${horasDia}h`} />
        <RateCard label="Taxa de cancelamento" valor={txCancel != null ? fmt1(txCancel) : "—"} unidade="%" cor={txCancel == null ? "var(--border)" : txCancel <= 5 ? "#34d399" : txCancel <= 10 ? "#d97706" : "#f43f5e"} sub={`${canceladas.length} cancelada(s)`} />
        <RateCard label="Adesão cirurgia segura" valor={adesao != null ? fmt1(adesao) : "—"} unidade="%" cor={adesao == null ? "var(--border)" : adesao >= 95 ? "#34d399" : "#d97706"} sub="concluídas com os 3 checklists" />
        <RateCard label="Tempo médio de cirurgia" valor={tCirurgia != null ? fmtDur(Math.round(tCirurgia)) : "—"} unidade="" cor="#6366f1" sub="incisão → fim" />
        <RateCard label="Tempo médio de sala" valor={tSala != null ? fmtDur(Math.round(tSala)) : "—"} unidade="" cor="#6366f1" sub="entrada → saída da sala" />
        <RateCard label="Tempo médio de RPA" valor={tRpa != null ? fmtDur(Math.round(tRpa)) : "—"} unidade="" cor="#d97706" sub="recuperação anestésica" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 12, marginBottom: "1.5rem" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
          <div style={secLbl}>Produtividade por cirurgião ({MONTHS[mes]})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {cirurgioesOrd.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>Nenhuma cirurgia concluída no mês.</div>}
            {cirurgioesOrd.map(([nome, d]) => (
              <Barra key={nome} rotulo={nome} valor={d.n} max={maxN} cor="#0d9488" extra={`${d.n} cir.${d.comTempo ? ` · méd ${fmtDur(Math.round(d.min / d.comTempo))}` : ""}`} />
            ))}
          </div>
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
          <div style={secLbl}>Cancelamentos por motivo ({MONTHS[mes]})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {motivosOrd.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>Nenhum cancelamento no mês.</div>}
            {motivosOrd.map(([motivo, n]) => (
              <Barra key={motivo} rotulo={motivo} valor={n} max={maxMotivo} cor="#e11d48" extra={`${n} (${fmt1((n / Math.max(canceladas.length, 1)) * 100)}%)`} />
            ))}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
        Ocupação = tempo de sala efetivamente usado (entrada → saída registradas) ÷ tempo ofertado (salas ativas × dias × horas). Ajuste "horas ofertadas" e "dias considerados" à realidade do seu bloco. Cirurgias sem tempos registrados não entram no cálculo de ocupação e médias.
      </div>
    </div>
  );
}

// Checklist de Cirurgia Segura (OMS) — todos os itens precisam ser marcados
function ChecklistOmsModal({ cirurgia, fase, onClose, onConfirm }) {
  const def = CHECKLIST_OMS[fase];
  const [marcados, setMarcados] = useState(() => def.itens.map(() => false));
  const [busy, setBusy] = useState(false);
  const todos = marcados.every(Boolean);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 560, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Cirurgia Segura — <span style={{ color: def.cor }}>{def.label}</span></div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Momento: {def.quando} · Paciente {cirurgia.iniciais} · {cirurgia.procedimento}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-3)", marginBottom: 14, lineHeight: 1.5 }}>Protocolo de Cirurgia Segura (OMS/Anvisa). Confirme cada item EM VOZ ALTA com a equipe antes de marcar.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {def.itens.map((item, i) => (
            <label key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: marcados[i] ? def.cor + "11" : "var(--surface-2)", border: `1px solid ${marcados[i] ? def.cor + "55" : "var(--border)"}`, borderRadius: 8, padding: "9px 12px", cursor: "pointer", fontSize: 13, color: "var(--text-2)", lineHeight: 1.5 }}>
              <input type="checkbox" checked={marcados[i]} onChange={() => setMarcados(m => m.map((v, j) => j === i ? !v : v))} style={{ marginTop: 2, accentColor: def.cor, width: 16, height: 16, flexShrink: 0 }} />
              {item}
            </label>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11.5, color: todos ? def.cor : "var(--text-muted)", fontWeight: 700 }}>{marcados.filter(Boolean).length}/{def.itens.length} itens confirmados</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Voltar</button>
            <button onClick={async () => { setBusy(true); await onConfirm(); }} disabled={!todos || busy} style={{ background: todos ? def.cor : "var(--surface-3)", color: todos ? "#fff" : "var(--text-muted)", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: todos ? "pointer" : "default", fontSize: 13 }}>{busy ? "…" : `Concluir ${def.label}`}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Gerenciar salas do bloco
function CcSalasModal({ salas, onClose, onSave, onDelete, isMaster }) {
  const [nome, setNome] = useState("");
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", flex: 1, boxSizing: "border-box" };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 440, maxWidth: "94vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Salas do Bloco Cirúrgico</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input value={nome} onChange={e => setNome(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && nome.trim()) { onSave({ nome: nome.trim(), ordem: salas.length, ativa: true }); setNome(""); } }} placeholder="Ex.: Sala 1" style={inp} />
          <button onClick={() => { if (nome.trim()) { onSave({ nome: nome.trim(), ordem: salas.length, ativa: true }); setNome(""); } }} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Salvar</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {salas.length === 0 && <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "10px" }}>Nenhuma sala cadastrada.</div>}
          {salas.map(s => (
            <div key={s.nome} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px" }}>
              <strong style={{ flex: 1 }}>{s.nome}</strong>
              <button onClick={() => onSave({ ...s, ativa: s.ativa === false })} style={btnLeito(s.ativa === false ? "#34d399" : "#d97706")}>{s.ativa === false ? "Reativar" : "Desativar"}</button>
              {isMaster && <button onClick={() => { if (confirm(`Remover a sala ${s.nome}?`)) onDelete(s.nome); }} style={btnLeito("#f43f5e")}>Excluir</button>}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ── Página Pronto-Socorro: chegada → triagem → atendimento → desfecho ──
function PSPage({ currentUser, canEdit }) {
  const [fila, setFila] = useState([]);
  const [finalizados, setFinalizados] = useState([]);
  const [setores, setSetores] = useState([]);
  const [novo, setNovo] = useState({ iniciais: "", prontuario: "", queixa: "" });
  const [triando, setTriando] = useState(null);
  const [desfechando, setDesfechando] = useState(null);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);

  function refresh() {
    if (!USE_SUPABASE) return;
    loadPsAtendimentos().then(setFila);
    loadPsFinalizadosHoje().then(setFinalizados);
    loadSetoresFromSupabase().then(r => r && setSetores(r));
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
    if (!novo.iniciais.trim()) { alert("Informe ao menos as iniciais do paciente."); return; }
    setBusy(true);
    await addPsAtendimentoRemote({ iniciais: novo.iniciais.trim(), prontuario: novo.prontuario.trim() || null, queixa: novo.queixa.trim() || null, chegada_em: nowISO(), status: "aguardando_triagem" }, currentUser);
    addAuditLog(currentUser, "PS: chegada", novo.iniciais.trim(), {});
    setNovo({ iniciais: "", prontuario: "", queixa: "" });
    setBusy(false); setTimeout(refresh, 400);
  }
  async function triar(p, classificacao, vitais) {
    await updatePsAtendimentoRemote(p.id, { classificacao, triagem_em: nowISO(), status: "aguardando_atendimento", ...(vitais || {}) });
    addAuditLog(currentUser, "PS: triagem", `${p.iniciais} → ${classificacao}`, {});
    setTriando(null); setTimeout(refresh, 300);
  }
  async function iniciarAtendimento(p) {
    await updatePsAtendimentoRemote(p.id, { atendimento_em: nowISO(), status: "em_atendimento" });
    addAuditLog(currentUser, "PS: inicio atendimento", p.iniciais, {});
    setTimeout(refresh, 300);
  }
  async function darDesfecho(p, desfecho, setorDestino, observacao) {
    await updatePsAtendimentoRemote(p.id, { desfecho, desfecho_em: nowISO(), setor_destino: setorDestino || null, observacao: observacao || null, status: "finalizado" });
    // Jornada do paciente: internação no PS abre automaticamente a solicitação de leito
    if (desfecho === "internacao" && setorDestino) {
      await addSolicitacaoRemote({ iniciais: p.iniciais, setor_origem: "Pronto-Socorro", setor_destino: setorDestino, hora_pedido: nowISO(), status: "aguardando" }, currentUser);
    }
    addAuditLog(currentUser, "PS: desfecho", `${p.iniciais} → ${desfecho}${setorDestino ? " (" + setorDestino + ")" : ""}`, {});
    setDesfechando(null); setTimeout(refresh, 300);
  }

  const agora = nowISO();
  const aguardandoTriagem = fila.filter(p => p.status === "aguardando_triagem");
  const aguardandoAtend = fila.filter(p => p.status === "aguardando_atendimento")
    .sort((a, b) => (PS_PRIORIDADE[a.classificacao] ?? 9) - (PS_PRIORIDADE[b.classificacao] ?? 9) || new Date(a.triagem_em) - new Date(b.triagem_em));
  const emAtendimento = fila.filter(p => p.status === "em_atendimento");
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

  return (
    <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Pronto-Socorro — Triagem e Fluxo</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: "1.25rem" }}>Classificação de risco (Protocolo de Manchester) e jornada do paciente. Dados de saúde — use iniciais e prontuário (LGPD).</div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: "1.25rem" }}>
        <Card label="Aguardando triagem" valor={aguardandoTriagem.length} cor={aguardandoTriagem.length > 0 ? "#fbbf24" : "#34d399"} />
        <Card label="Aguardando atendimento" valor={aguardandoAtend.length} cor="#3b82f6" />
        <Card label="Em atendimento" valor={emAtendimento.length} cor="#22d3ee" />
        <Card label="Atendidos hoje" valor={finalizados.length} cor="#0d9488" />
        <Card label="Porta→triagem (média)" valor={portaTriagemMedia != null ? fmtDur(Math.round(portaTriagemMedia)) : "—"} cor="#6366f1" />
        <Card label="Permanência média" valor={permMedia != null ? fmtDur(Math.round(permMedia)) : "—"} cor="#6366f1" />
      </div>

      {/* Legenda Manchester — autoexplicativa */}
      <details style={{ marginBottom: "1.25rem" }}>
        <summary style={{ ...secLbl, cursor: "pointer", marginBottom: 8 }}>Protocolo de Manchester — o que significa cada cor</summary>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
          {Object.entries(MANCHESTER).map(([k, v]) => (
            <div key={k} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${v.cor}`, borderRadius: 10, padding: "10px 13px" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: v.cor }}>{v.label}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.5, marginTop: 3 }}>{v.desc}</div>
            </div>
          ))}
        </div>
      </details>

      {/* CHEGADA */}
      {canEdit && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem 1.25rem", marginBottom: "1.25rem" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Registrar chegada</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={novo.iniciais} onChange={e => setNovo(p => ({ ...p, iniciais: e.target.value }))} placeholder="Iniciais *" style={{ ...inp, width: 120 }} />
            <input value={novo.prontuario} onChange={e => setNovo(p => ({ ...p, prontuario: e.target.value }))} placeholder="Prontuário" style={{ ...inp, width: 110 }} />
            <input value={novo.queixa} onChange={e => setNovo(p => ({ ...p, queixa: e.target.value }))} onKeyDown={e => e.key === "Enter" && registrarChegada()} placeholder="Queixa principal (ex.: dor torácica)" style={{ ...inp, flex: 1, minWidth: 200 }} />
            <button onClick={registrarChegada} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "+ Chegada"}</button>
          </div>
        </div>
      )}

      {/* FILA DE TRIAGEM */}
      <div style={secLbl}>Aguardando triagem ({aguardandoTriagem.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "1.25rem" }}>
        {aguardandoTriagem.length === 0 && <div style={{ fontSize: 13, color: "var(--text-muted)", background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 8, padding: "12px", textAlign: "center" }}>Ninguém aguardando triagem.</div>}
        {aguardandoTriagem.map(p => (
          <div key={p.id} style={linhaPac}>
            <strong style={{ minWidth: 64 }}>{p.iniciais}</strong>
            {p.prontuario && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>reg. {p.prontuario}</span>}
            {p.queixa && <span style={{ fontSize: 12, color: "var(--text-3)" }}>{p.queixa}</span>}
            <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "#fbbf24", fontFamily: "JetBrains Mono, monospace" }}>chegou há {fmtDur(diffMin(p.chegada_em, agora))}</span>
            {canEdit && <button onClick={() => setTriando(p)} style={btnLeito("#22d3ee")}>Triar</button>}
          </div>
        ))}
      </div>

      {/* FILA DE ATENDIMENTO (por prioridade) */}
      <div style={secLbl}>Fila de atendimento — por prioridade ({aguardandoAtend.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "1.25rem" }}>
        {aguardandoAtend.length === 0 && <div style={{ fontSize: 13, color: "var(--text-muted)", background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 8, padding: "12px", textAlign: "center" }}>Fila vazia.</div>}
        {aguardandoAtend.map(p => (
          <div key={p.id} style={{ ...linhaPac, borderLeft: `4px solid ${MANCHESTER[p.classificacao]?.cor || "var(--border)"}` }}>
            <strong style={{ minWidth: 64 }}>{p.iniciais}</strong>
            <ClasseBadge c={p.classificacao} />
            {p.queixa && <span style={{ fontSize: 12, color: "var(--text-3)" }}>{p.queixa}</span>}
            <span style={{ marginLeft: "auto" }}><Espera p={p} /></span>
            {canEdit && <button onClick={() => iniciarAtendimento(p)} style={btnLeito("#34d399")}>Iniciar atendimento</button>}
            {fmtSinaisVitais(p) && <div style={{ width: "100%", fontSize: 11, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{fmtSinaisVitais(p)}</div>}
          </div>
        ))}
      </div>

      {/* EM ATENDIMENTO */}
      <div style={secLbl}>Em atendimento ({emAtendimento.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "1.25rem" }}>
        {emAtendimento.length === 0 && <div style={{ fontSize: 13, color: "var(--text-muted)", background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 8, padding: "12px", textAlign: "center" }}>Nenhum paciente em atendimento.</div>}
        {emAtendimento.map(p => (
          <div key={p.id} style={{ ...linhaPac, borderLeft: `4px solid ${MANCHESTER[p.classificacao]?.cor || "var(--border)"}` }}>
            <strong style={{ minWidth: 64 }}>{p.iniciais}</strong>
            <ClasseBadge c={p.classificacao} />
            {p.queixa && <span style={{ fontSize: 12, color: "var(--text-3)" }}>{p.queixa}</span>}
            <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-3)", fontFamily: "JetBrains Mono, monospace" }}>em atendimento há {fmtDur(diffMin(p.atendimento_em, agora))}</span>
            {canEdit && <button onClick={() => setDesfechando(p)} style={btnLeito("#22d3ee")}>Desfecho</button>}
            {fmtSinaisVitais(p) && <div style={{ width: "100%", fontSize: 11, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{fmtSinaisVitais(p)}</div>}
          </div>
        ))}
      </div>

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

      {/* MODAL TRIAGEM */}
      {triando && <TriagemModal paciente={triando} onClose={() => setTriando(null)} onTriar={(cls, vitais) => triar(triando, cls, vitais)} />}

      {/* MODAL DESFECHO */}
      {desfechando && <PsDesfechoModal paciente={desfechando} setores={setores} onClose={() => setDesfechando(null)} onSave={darDesfecho} />}
    </div>
  );
}

// Modal de desfecho do PS (alta/internação/transferência/evasão/óbito)
function PsDesfechoModal({ paciente, setores, onClose, onSave }) {
  const [desfecho, setDesfecho] = useState("");
  const [setorDestino, setSetorDestino] = useState("");
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 11px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  async function salvar() {
    if (!desfecho) { alert("Escolha o desfecho."); return; }
    if (desfecho === "internacao" && !setorDestino) { alert("Escolha o setor de destino da internação."); return; }
    setBusy(true);
    await onSave(paciente, desfecho, setorDestino, obs.trim());
    setBusy(false);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 460, maxWidth: "94vw" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Desfecho — {paciente.iniciais}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {Object.entries(PS_DESFECHOS).map(([k, v]) => (
            <button key={k} onClick={() => setDesfecho(k)} style={{ background: desfecho === k ? v.cor : "transparent", color: desfecho === k ? "#000" : v.cor, border: `1px solid ${v.cor}66`, borderRadius: 7, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{v.label}</button>
          ))}
        </div>
        {desfecho === "internacao" && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 5 }}>Setor de destino (abre solicitação de leito automaticamente)</label>
            <select value={setorDestino} onChange={e => setSetorDestino(e.target.value)} style={inp}>
              <option value="">Escolha o setor…</option>
              {setores.map(s => <option key={s.nome} value={s.nome}>{s.nome}</option>)}
            </select>
          </div>
        )}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 5 }}>Observação (opcional)</label>
          <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex.: encaminhado com acompanhante" style={inp} />
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={salvar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Confirmar desfecho"}</button>
        </div>
      </div>
    </div>
  );
}

// Modal de triagem: sinais vitais → sugestão automática de Manchester → decisão da triadora
function TriagemModal({ paciente, onClose, onTriar }) {
  const [v, setV] = useState({ pa_sist: "", pa_diast: "", fc: "", fr: "", spo2: "", temp: "", dor: "", consciencia: "A", glicemia: "" });
  const [busy, setBusy] = useState(false);
  const set = (k, val) => setV(p => ({ ...p, [k]: val }));
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  const lbl = { fontSize: 10.5, fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 4 };
  const av = avaliarSinaisVitais(v);
  const sug = av.sugestao ? MANCHESTER[av.sugestao] : null;

  function vitaisPayload() {
    const n = x => (x === "" || x == null ? null : Number(x));
    return {
      pa_sist: n(v.pa_sist), pa_diast: n(v.pa_diast), fc: n(v.fc), fr: n(v.fr),
      spo2: n(v.spo2), temp: n(v.temp), dor: n(v.dor), glicemia: n(v.glicemia),
      consciencia: v.consciencia || null,
    };
  }
  async function classificar(k) {
    setBusy(true);
    await onTriar(k, vitaisPayload());
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 600, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>Triagem — {paciente.iniciais}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>{paciente.queixa || "Sem queixa registrada"} · chegou há {fmtDur(diffMin(paciente.chegada_em, nowISO()))}</div>

        {/* SINAIS VITAIS */}
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Sinais vitais</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 8 }}>
          <div><label style={lbl}>PA sist. (mmHg)</label><input type="number" value={v.pa_sist} onChange={e => set("pa_sist", e.target.value)} placeholder="120" style={inp} /></div>
          <div><label style={lbl}>PA diast.</label><input type="number" value={v.pa_diast} onChange={e => set("pa_diast", e.target.value)} placeholder="80" style={inp} /></div>
          <div><label style={lbl}>FC (bpm)</label><input type="number" value={v.fc} onChange={e => set("fc", e.target.value)} placeholder="80" style={inp} /></div>
          <div><label style={lbl}>FR (irpm)</label><input type="number" value={v.fr} onChange={e => set("fr", e.target.value)} placeholder="16" style={inp} /></div>
          <div><label style={lbl}>SpO2 (%)</label><input type="number" value={v.spo2} onChange={e => set("spo2", e.target.value)} placeholder="98" style={inp} /></div>
          <div><label style={lbl}>Temp. (°C)</label><input type="number" step="0.1" value={v.temp} onChange={e => set("temp", e.target.value)} placeholder="36.5" style={inp} /></div>
          <div><label style={lbl}>Dor (0–10)</label><input type="number" min="0" max="10" value={v.dor} onChange={e => set("dor", e.target.value)} placeholder="0" style={inp} /></div>
          <div><label style={lbl}>Glicemia (mg/dL)</label><input type="number" value={v.glicemia} onChange={e => set("glicemia", e.target.value)} placeholder="—" style={inp} /></div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Nível de consciência (AVPU)</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.entries(PS_CONSCIENCIA).map(([k, label]) => (
              <button key={k} onClick={() => set("consciencia", k)} style={{ background: v.consciencia === k ? (k === "A" ? "#34d399" : k === "U" ? "#ef4444" : "#f97316") : "transparent", color: v.consciencia === k ? "#000" : "var(--text-3)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "6px 12px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>{k} — {label}</button>
            ))}
          </div>
        </div>

        {/* SUGESTÃO AO VIVO */}
        {sug ? (
          <div style={{ background: sug.bg, border: `1px solid ${sug.cor}66`, borderLeft: `5px solid ${sug.cor}`, borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: sug.cor }}>Sugestão pelos sinais vitais: {sug.label.toUpperCase()}</div>
            {av.motivos.length > 0 ? (
              <div style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 4, lineHeight: 1.5 }}>
                {av.motivos.map((m, i) => <span key={i}>{m.texto}{i < av.motivos.length - 1 ? " · " : ""}</span>)}
              </div>
            ) : <div style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 4 }}>Sinais vitais dentro da normalidade. Considerar Azul se a queixa não for urgente.</div>}
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 5 }}>Apoio à decisão — a classificação final é da triadora, conforme o fluxograma da queixa (Protocolo de Manchester).</div>
          </div>
        ) : (
          <div style={{ background: "var(--surface-2)", border: "1px dashed var(--border)", borderRadius: 8, padding: "9px 14px", marginBottom: 12, fontSize: 12, color: "var(--text-muted)" }}>
            Preencha os sinais vitais para receber a sugestão de classificação.
          </div>
        )}

        {/* CLASSIFICAÇÃO */}
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Classificação de risco</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Object.entries(MANCHESTER).map(([k, m]) => (
            <button key={k} onClick={() => classificar(k)} disabled={busy} style={{ display: "flex", alignItems: "center", gap: 12, background: m.bg, border: `1px solid ${m.cor}55`, borderLeft: `5px solid ${m.cor}`, outline: av.sugestao === k ? `2px solid ${m.cor}` : "none", borderRadius: 8, padding: "10px 14px", cursor: "pointer", textAlign: "left" }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: m.cor, minWidth: 110 }}>{m.label}</span>
              <span style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.4, flex: 1 }}>{m.desc}</span>
              {av.sugestao === k && <span style={{ background: m.cor, color: "#000", borderRadius: 99, padding: "2px 10px", fontSize: 10, fontWeight: 800, whiteSpace: "nowrap" }}>SUGERIDA</span>}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ── Página SCIH (Fase A): isolamentos + casos de vigilância ──
function ScihPage({ currentUser, canEdit }) {
  const [leitos, setLeitos] = useState([]);
  const [casos, setCasos]   = useState([]);
  const [germes, setGermes] = useState([]);
  const [showGermes, setShowGermes] = useState(false);
  const [sub, setSub] = useState("vigilancia");
  const [, setTick] = useState(0);
  const subBtn = ativo => ({ background: ativo ? "#22d3ee" : "transparent", color: ativo ? "#000" : "var(--text-3)", border: `1px solid ${ativo ? "#22d3ee" : "var(--border)"}`, borderRadius: 7, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 });
  const vazio = { iniciais: "", prontuario: "", leito: "", isolamento: "", data_coleta: "", data_resultado: "", germe: "", multirresistente: false, antibiotico: "", dias_antibiotico: "", observacao: "" };
  const [f, setF] = useState(vazio);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  // ao digitar o germe, sugere o isolamento e marca multirresistente (só se ainda vazio)
  const onGerme = v => setF(p => {
    const next = { ...p, germe: v };
    const g = sugerirGerme(v, germes);
    if (g) {
      if (g.isolamento && !p.isolamento) next.isolamento = g.isolamento;
      if (g.tipo === "multirresistente" && !p.multirresistente) next.multirresistente = true;
    }
    return next;
  });

  function refresh() {
    if (!USE_SUPABASE) { setLeitos(loadLeitos()); return; }
    loadLeitosFromSupabase().then(r => r && setLeitos(r));
    loadScihCasos().then(setCasos);
    loadScihGermes().then(setGermes);
  }
  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => { window.removeEventListener("focus", onFocus); clearInterval(id); };
  }, []);

  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  const lbl = { fontSize: 11, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 4 };

  const leitosOrd = [...leitos].sort((a, b) => a.identificacao.localeCompare(b.identificacao, "pt-BR", { numeric: true }));
  const leitosIsolados = leitosOrd.filter(l => l.isolamento && ISOLAMENTOS[l.isolamento]);
  const ativos = casos.filter(c => c.status !== "encerrado");
  const encerrados = casos.filter(c => c.status === "encerrado");

  async function salvar() {
    if (!f.iniciais.trim()) { alert("Informe ao menos as iniciais do paciente."); return; }
    setBusy(true);
    const caso = {
      iniciais: f.iniciais.trim(), prontuario: f.prontuario.trim() || null, leito: f.leito || null,
      isolamento: f.isolamento || null, data_coleta: f.data_coleta || null, data_resultado: f.data_resultado || null,
      germe: f.germe.trim() || null, multirresistente: !!f.multirresistente, antibiotico: f.antibiotico.trim() || null,
      dias_antibiotico: f.dias_antibiotico ? Number(f.dias_antibiotico) : null, observacao: f.observacao.trim() || null, status: "ativo",
    };
    await addScihCasoRemote(caso, currentUser);
    // "inteligente": ao vincular leito + isolamento, o leito já é sinalizado
    if (f.leito && f.isolamento) await setLeitoIsolamentoRemote(f.leito, f.isolamento, currentUser);
    addAuditLog(currentUser, "cadastrar caso SCIH", `${f.iniciais}${f.leito ? " · leito " + f.leito : ""}`, {});
    setBusy(false); setF(vazio);
    setTimeout(refresh, 400);
  }
  async function encerrar(c) {
    if (!confirm(`Encerrar o acompanhamento de ${c.iniciais}?`)) return;
    await updateScihCasoRemote(c.id, { status: "encerrado" });
    if (c.leito && c.isolamento) {
      if (confirm(`Retirar também o isolamento do leito ${c.leito}?`)) await setLeitoIsolamentoRemote(c.leito, null, currentUser);
    }
    addAuditLog(currentUser, "encerrar caso SCIH", c.iniciais, {});
    setTimeout(refresh, 300);
  }
  async function excluir(c) {
    if (!confirm(`Excluir definitivamente o caso de ${c.iniciais}? Essa ação não pode ser desfeita.`)) return;
    await deleteScihCasoRemote(c.id);
    addAuditLog(currentUser, "excluir caso SCIH", c.iniciais, {});
    setTimeout(refresh, 300);
  }
  async function salvarGerme(g) {
    await upsertScihGermeRemote(g, currentUser);
    setGermes(prev => [...prev.filter(x => x.nome !== g.nome), g]);
    addAuditLog(currentUser, "salvar germe SCIH", g.nome, {});
  }
  async function removerGerme(nome) {
    await deleteScihGermeRemote(nome);
    setGermes(prev => prev.filter(x => x.nome !== nome));
    addAuditLog(currentUser, "remover germe SCIH", nome, {});
  }
  const gSug = sugerirGerme(f.germe, germes);

  const IsoBadge = ({ tipo }) => { const v = ISOLAMENTOS[tipo]; if (!v) return null; return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: v.bg, color: v.cor, border: `1px solid ${v.cor}55`, borderRadius: 99, padding: "2px 9px", fontSize: 11, fontWeight: 800 }}>{v.label}</span>
  ); };

  return (
    <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>SCIH — Controle de Infecção Hospitalar</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: "1.25rem" }}>Precauções/isolamentos e vigilância de pacientes. Dados de saúde — use iniciais e prontuário (LGPD).</div>
        </div>
        <button onClick={() => setShowGermes(true)} style={{ background: "transparent", color: "var(--text-2)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" }}>Base de germes ({germes.length})</button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <button onClick={() => setSub("vigilancia")} style={subBtn(sub === "vigilancia")}>Vigilância & Isolamentos</button>
        <button onClick={() => setSub("indicadores")} style={subBtn(sub === "indicadores")}>Indicadores & Relatórios</button>
      </div>

      {sub === "vigilancia" && (<>
      {/* DEFINIÇÕES DE ISOLAMENTO — autoexplicativo */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Tipos de precaução / isolamento</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: "1.5rem" }}>
        {Object.entries(ISOLAMENTOS).map(([k, v]) => (
          <div key={k} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${v.cor}`, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: v.cor, marginBottom: 6 }}>Precaução por {v.label}</div>
            <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.55, marginBottom: 8 }}>{v.curto}</div>
            <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.6 }}>
              <div style={{ marginBottom: 4 }}><strong style={{ color: "var(--text-2)" }}>Quando:</strong> {v.quando}</div>
              <div style={{ marginBottom: 4 }}><strong style={{ color: "var(--text-2)" }}>EPI / precauções:</strong> {v.epi}</div>
              <div><strong style={{ color: "var(--text-2)" }}>Acomodação:</strong> {v.quarto}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: "1.5rem", fontStyle: "italic" }}>Orientações gerais baseadas nas diretrizes da Anvisa (Medidas de Prevenção de IRAS) e literatura (CDC). Sempre seguir o protocolo institucional e a orientação da CCIH.</div>

      {/* LEITOS EM ISOLAMENTO AGORA */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Leitos em isolamento agora ({leitosIsolados.length})</div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem 1.25rem", marginBottom: "1.5rem" }}>
        {leitosIsolados.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center" }}>Nenhum leito sinalizado como isolamento. Marque em <strong>Giro de Leitos</strong> (seletor de isolamento no card do leito) ou ao cadastrar um caso abaixo.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {leitosIsolados.map(l => (
              <div key={l.identificacao} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px" }}>
                <strong style={{ fontSize: 13 }}>Leito {l.identificacao}</strong>
                <IsoBadge tipo={l.isolamento} />
                {l.status === "ocupado" && l.iniciais && <span style={{ fontSize: 12, color: "var(--text-3)" }}>· {l.iniciais}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CADASTRO DE CASO DE VIGILÂNCIA */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Casos em vigilância ({ativos.length})</div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem", marginBottom: "1.5rem" }}>
        {canEdit && (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Cadastrar caso</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
              <div><label style={lbl}>Iniciais do paciente *</label><input value={f.iniciais} onChange={e => set("iniciais", e.target.value)} placeholder="Ex.: L.S." style={inp} /></div>
              <div><label style={lbl}>Nº prontuário</label><input value={f.prontuario} onChange={e => set("prontuario", e.target.value)} placeholder="Ex.: 48213" style={inp} /></div>
              <div><label style={lbl}>Leito</label>
                <select value={f.leito} onChange={e => set("leito", e.target.value)} style={inp}>
                  <option value="">— sem leito —</option>
                  {leitosOrd.map(l => <option key={l.identificacao} value={l.identificacao}>{l.identificacao}{l.iniciais ? ` (${l.iniciais})` : ""}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Tipo de isolamento</label>
                <select value={f.isolamento} onChange={e => set("isolamento", e.target.value)} style={inp}>
                  <option value="">— nenhum —</option>
                  {Object.entries(ISOLAMENTOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Data da coleta da cultura</label><input type="date" value={f.data_coleta} onChange={e => set("data_coleta", e.target.value)} style={inp} /></div>
              <div><label style={lbl}>Data do resultado</label><input type="date" value={f.data_resultado} onChange={e => set("data_resultado", e.target.value)} style={inp} /></div>
              <div><label style={lbl}>Germe (o que cresceu)</label><input value={f.germe} onChange={e => onGerme(e.target.value)} placeholder="Ex.: Klebsiella pneumoniae" style={inp} />
                {gSug && <div style={{ fontSize: 11, color: "#22d3ee", marginTop: 4, lineHeight: 1.4 }}>Sugestão: {gSug.nome}{gSug.tipo === "multirresistente" ? " (multirresistente)" : ""}{gSug.isolamento && ISOLAMENTOS[gSug.isolamento] ? ` · isolamento ${ISOLAMENTOS[gSug.isolamento].label}` : ""}</div>}
              </div>
              <div><label style={lbl}>Antibiótico utilizado</label><input value={f.antibiotico} onChange={e => set("antibiotico", e.target.value)} placeholder="Ex.: Meropenem" style={inp} /></div>
              <div><label style={lbl}>Dias de antibiótico</label><input type="number" min="0" value={f.dias_antibiotico} onChange={e => set("dias_antibiotico", e.target.value)} placeholder="Ex.: 7" style={inp} /></div>
              <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-2)", cursor: "pointer" }}>
                  <input type="checkbox" checked={f.multirresistente} onChange={e => set("multirresistente", e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} /> Germe multirresistente
                </label>
              </div>
              <div style={{ gridColumn: "1 / -1" }}><label style={lbl}>Observação</label><input value={f.observacao} onChange={e => set("observacao", e.target.value)} placeholder="Anotações do caso" style={inp} /></div>
            </div>
            <button onClick={salvar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "Salvando…" : "+ Cadastrar caso"}</button>
            <div style={{ height: 1, background: "var(--border)", margin: "16px 0" }} />
          </>
        )}
        {ativos.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>Nenhum caso em vigilância.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ativos.map(c => (
              <div key={c.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                  <strong style={{ fontSize: 14 }}>{c.iniciais}</strong>
                  {c.prontuario && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>reg. {c.prontuario}</span>}
                  {c.leito && <span style={{ fontSize: 11, color: "#22d3ee", fontWeight: 700 }}>leito {c.leito}</span>}
                  {c.isolamento && <IsoBadge tipo={c.isolamento} />}
                  {c.multirresistente && <span style={{ background: "#3d0f18", color: "#fb7185", borderRadius: 99, padding: "2px 9px", fontSize: 10, fontWeight: 800 }}>MULTIRRESISTENTE</span>}
                  {canEdit && <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                    <button onClick={() => encerrar(c)} style={btnLeito("#34d399")}>✓ Encerrar</button>
                    {currentUser?.role === "adm_master" && <button onClick={() => excluir(c)} style={btnLeito("#fb7185")}>Excluir</button>}
                  </span>}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.7 }}>
                  {c.germe && <span><strong style={{ color: "var(--text-2)" }}>Germe:</strong> {c.germe} · </span>}
                  {c.data_coleta && <span>coleta {new Date(c.data_coleta + "T00:00:00").toLocaleDateString("pt-BR")}{diasDesde(c.data_coleta) != null ? ` (há ${diasDesde(c.data_coleta)}d)` : ""} · </span>}
                  {c.data_resultado && <span>resultado {new Date(c.data_resultado + "T00:00:00").toLocaleDateString("pt-BR")} · </span>}
                  {c.antibiotico && <span><strong style={{ color: "var(--text-2)" }}>ATB:</strong> {c.antibiotico}{c.dias_antibiotico != null ? ` (${c.dias_antibiotico}d)` : ""}</span>}
                  {c.observacao && <div style={{ color: "var(--text-muted)", marginTop: 2 }}>Obs.: {c.observacao}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {encerrados.length > 0 && (
        <details style={{ marginBottom: "1.5rem" }}>
          <summary style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", cursor: "pointer" }}>Casos encerrados ({encerrados.length})</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
            {encerrados.map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 12px", fontSize: 12, color: "var(--text-3)" }}>
                <strong style={{ color: "var(--text-2)" }}>{c.iniciais}</strong>
                {c.leito && <span>leito {c.leito}</span>}
                {c.isolamento && <IsoBadge tipo={c.isolamento} />}
                {c.germe && <span>· {c.germe}</span>}
                {canEdit && currentUser?.role === "adm_master" && <button onClick={() => excluir(c)} style={{ ...btnLeito("#fb7185"), marginLeft: "auto" }}>Excluir</button>}
              </div>
            ))}
          </div>
        </details>
      )}

      </>)}

      {sub === "indicadores" && <IndicadoresScih currentUser={currentUser} canEdit={canEdit} />}

      {showGermes && <GermesModal germes={germes} canEdit={canEdit} isMaster={currentUser?.role === "adm_master"} onClose={() => setShowGermes(false)} onSave={salvarGerme} onDelete={removerGerme} />}
    </div>
  );
}

// Modal da base de germes (multirresistentes/sensíveis) com embasamento literário
function GermesModal({ germes, canEdit, isMaster, onClose, onSave, onDelete }) {
  const vazio = { nome: "", tipo: "multirresistente", isolamento: "", embasamento: "", observacao: "" };
  const [f, setF] = useState(vazio);
  const [busy, setBusy] = useState(false);
  const [filtro, setFiltro] = useState("");
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  const hl = { fontSize: 11, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 4 };
  async function salvar() {
    if (!f.nome.trim()) { alert("Informe o nome do germe."); return; }
    setBusy(true);
    await onSave({ nome: f.nome.trim(), tipo: f.tipo, isolamento: f.isolamento || null, embasamento: f.embasamento.trim() || null, observacao: f.observacao.trim() || null });
    setBusy(false); setF(vazio);
  }
  const ordenados = [...germes]
    .filter(g => !filtro || (g.nome || "").toLowerCase().includes(filtro.toLowerCase()))
    .sort((a, b) => (a.tipo || "").localeCompare(b.tipo || "") || (a.nome || "").localeCompare(b.nome || ""));
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 720, maxWidth: "94vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Base de germes — embasamento e isolamento</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16, marginTop: 2, lineHeight: 1.5 }}>Referência editável. Ao cadastrar um caso e digitar o germe, o sistema sugere o isolamento e marca multirresistente com base nesta lista. Sempre validar com a CCIH e o antibiograma do paciente.</div>
        {canEdit && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 150px 150px", gap: 8, marginBottom: 8 }}>
            <div><label style={hl}>Germe</label><input value={f.nome} onChange={e => set("nome", e.target.value)} placeholder="Ex.: Klebsiella pneumoniae (KPC)" style={inp} /></div>
            <div><label style={hl}>Tipo</label>
              <select value={f.tipo} onChange={e => set("tipo", e.target.value)} style={inp}>
                <option value="multirresistente">Multirresistente</option>
                <option value="sensivel">Sensível</option>
              </select>
            </div>
            <div><label style={hl}>Isolamento sugerido</label>
              <select value={f.isolamento} onChange={e => set("isolamento", e.target.value)} style={inp}>
                <option value="">— nenhum —</option>
                {Object.entries(ISOLAMENTOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
        )}
        {canEdit && (
          <>
            <div style={{ marginBottom: 8 }}><label style={hl}>Embasamento (literatura)</label><textarea value={f.embasamento} onChange={e => set("embasamento", e.target.value)} rows={2} placeholder="Ex.: Precaução de contato (Anvisa/CDC). Carbapenemase — reservar polimixina/ceftazidima-avibactam conforme antibiograma." style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} /></div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 16 }}>
              <div style={{ flex: 1 }}><label style={hl}>Observação</label><input value={f.observacao} onChange={e => set("observacao", e.target.value)} placeholder="Opcional" style={inp} /></div>
              <button onClick={salvar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13, height: 38 }}>{busy ? "…" : "+ Salvar"}</button>
            </div>
          </>
        )}
        <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Filtrar germe…" style={{ ...inp, marginBottom: 10 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ordenados.length === 0 && <div style={{ padding: "18px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Nenhum germe cadastrado.</div>}
          {ordenados.map(g => (
            <div key={g.nome} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                <strong style={{ fontSize: 14 }}>{g.nome}</strong>
                {g.tipo === "multirresistente"
                  ? <span style={{ background: "#3d0f18", color: "#fb7185", borderRadius: 99, padding: "2px 9px", fontSize: 10, fontWeight: 800 }}>MULTIRRESISTENTE</span>
                  : <span style={{ background: "#0a3d2a", color: "#34d399", borderRadius: 99, padding: "2px 9px", fontSize: 10, fontWeight: 800 }}>SENSÍVEL</span>}
                {g.isolamento && ISOLAMENTOS[g.isolamento] && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: ISOLAMENTOS[g.isolamento].bg, color: ISOLAMENTOS[g.isolamento].cor, border: `1px solid ${ISOLAMENTOS[g.isolamento].cor}55`, borderRadius: 99, padding: "2px 9px", fontSize: 10, fontWeight: 800 }}>{ISOLAMENTOS[g.isolamento].label}</span>}
                {canEdit && <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button onClick={() => setF({ nome: g.nome, tipo: g.tipo || "multirresistente", isolamento: g.isolamento || "", embasamento: g.embasamento || "", observacao: g.observacao || "" })} style={btnLeito("#22d3ee")}>Editar</button>
                  {isMaster && <button onClick={() => { if (confirm(`Remover o germe ${g.nome}?`)) onDelete(g.nome); }} style={btnLeito("#fb7185")}>Excluir</button>}
                </span>}
              </div>
              {g.embasamento && <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{g.embasamento}</div>}
              {g.observacao && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>Obs.: {g.observacao}</div>}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ── SCIH Fase C: indicadores mensais + dashboard + relatório ──
const compLabel = comp => { if (!comp) return ""; const [a, m] = comp.split("-"); return `${MONTHS[Number(m) - 1] || m}/${a.slice(2)}`; };
function IndicadoresScih({ currentUser, canEdit }) {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth());
  const [ano, setAno] = useState(now.getFullYear());
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);

  function refresh() { if (USE_SUPABASE) loadScihIndicadores().then(setRows); }
  useEffect(() => { refresh(); const onF = () => refresh(); window.addEventListener("focus", onF); return () => window.removeEventListener("focus", onF); }, []);
  const comp = compDe(ano, mes);
  useEffect(() => { const r = rows.find(x => x.competencia === comp); setForm(r ? { ...r } : {}); }, [comp, rows]);

  const num = v => (v === "" || v == null ? null : Number(v));
  const set = (k, v) => setForm(p => ({ ...p, [k]: v === "" ? "" : Number(v) }));
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  const lbl = { fontSize: 11, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 4 };
  const selInp = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none" };
  const NumField = ({ k, label }) => (<div><label style={lbl}>{label}</label><input type="number" min="0" value={form[k] ?? ""} onChange={e => set(k, e.target.value)} disabled={!canEdit} style={inp} /></div>);
  const fmt1 = v => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));

  const r = calcIndic(form);
  async function salvar() {
    setBusy(true);
    const payload = { competencia: comp };
    ["exames_lab","exames_imagem","culturas_coletadas","culturas_positivas","pacientes_dia","ventilador_dia","higiene_oportunidades","higiene_realizadas","pav_casos","antimicrobiano_dot","cir_cesariana","isc_cesariana","cir_oftalmo","isc_oftalmo","cir_artroplastia","isc_artroplastia","treinamentos","treinamentos_participantes"].forEach(k => payload[k] = num(form[k]));
    payload.observacao = form.observacao || null;
    await upsertScihIndicadorRemote(payload, currentUser);
    addAuditLog(currentUser, "salvar indicadores SCIH", comp, {});
    setBusy(false);
    setTimeout(refresh, 400);
  }

  const ultimos = rows.slice(-12);
  const MiniTrend = ({ titulo, chave, unidade, cor }) => {
    const dados = ultimos.map(x => ({ comp: x.competencia, v: calcIndic(x)[chave] }));
    const vals = dados.map(d => d.v).filter(v => v != null);
    const max = vals.length ? Math.max(...vals) : 0;
    return (
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: "var(--text-2)" }}>{titulo} <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>({unidade})</span></div>
        {vals.length === 0 ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Sem dados ainda.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {dados.map(d => (
              <div key={d.comp} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, color: "var(--text-muted)", width: 42, fontFamily: "JetBrains Mono, monospace" }}>{compLabel(d.comp)}</span>
                <div style={{ flex: 1, height: 12, background: "var(--surface-3)", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ width: (max > 0 && d.v != null ? Math.max(2, (d.v / max) * 100) : 0) + "%", height: "100%", background: cor, borderRadius: 99 }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, width: 44, textAlign: "right", color: d.v == null ? "var(--text-muted)" : "var(--text)" }}>{d.v == null ? "—" : fmt1(d.v)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const RateCard = ({ label, valor, unidade, cor, sub }) => (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${cor || "var(--border)"}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: cor || "var(--text)", fontFamily: "JetBrains Mono, monospace", marginTop: 3 }}>{valor}<span style={{ fontSize: 12, fontWeight: 600, marginLeft: 3, color: "var(--text-muted)" }}>{unidade}</span></div>
      {sub && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const printStyles = `@media print { body * { visibility: hidden !important; } #scih-print, #scih-print * { visibility: visible !important; } #scih-print { position: fixed; inset: 0; background: #fff !important; color: #111 !important; padding: 18px; } @page { size: A4 portrait; margin: 12mm; } }`;
  const linhasRel = [
    ["Exames laboratoriais", form.exames_lab ?? "—", ""],
    ["Exames de imagem", form.exames_imagem ?? "—", ""],
    ["Culturas coletadas", form.culturas_coletadas ?? "—", ""],
    ["Culturas positivas", form.culturas_positivas ?? "—", r.culturasPos != null ? `${fmt1(r.culturasPos)}% positividade` : ""],
    ["Pacientes-dia", form.pacientes_dia ?? "—", ""],
    ["Ventilador-dia", form.ventilador_dia ?? "—", ""],
    ["Higiene de mãos (adesão)", `${form.higiene_realizadas ?? "—"}/${form.higiene_oportunidades ?? "—"}`, r.higiene != null ? `${fmt1(r.higiene)}% de adesão` : ""],
    ["PAV", `${form.pav_casos ?? "—"} caso(s)`, r.pav != null ? `${fmt1(r.pav)} por 1000 vent-dia` : ""],
    ["Uso de antimicrobiano (DOT)", form.antimicrobiano_dot ?? "—", r.antimicrobiano != null ? `${fmt1(r.antimicrobiano)} DOT/1000 pac-dia` : ""],
    ["Cesariana (C.O)", `${form.cir_cesariana ?? "—"} cir. · ${form.isc_cesariana ?? "—"} ISC`, r.iscCesariana != null ? `${fmt1(r.iscCesariana)}% ISC` : ""],
    ["Oftalmológica", `${form.cir_oftalmo ?? "—"} cir. · ${form.isc_oftalmo ?? "—"} ISC`, r.iscOftalmo != null ? `${fmt1(r.iscOftalmo)}% ISC` : ""],
    ["Artroplastia (quadril/joelho)", `${form.cir_artroplastia ?? "—"} cir. · ${form.isc_artroplastia ?? "—"} ISC`, r.iscArtroplastia != null ? `${fmt1(r.iscArtroplastia)}% ISC` : ""],
    ["Treinamentos do SCIH", `${form.treinamentos ?? "—"} · ${form.treinamentos_participantes ?? "—"} particip.`, ""],
  ];

  return (
    <div>
      <style>{printStyles}</style>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: "1.25rem" }}>
        <div><div style={lbl}>Mês</div><select value={mes} onChange={e => setMes(+e.target.value)} style={selInp}>{MONTHS_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}</select></div>
        <div><div style={lbl}>Ano</div><input type="number" value={ano} onChange={e => setAno(+e.target.value)} style={{ ...selInp, width: 90 }} /></div>
        <button onClick={() => setPreview(p => !p)} style={{ background: "transparent", color: "#22d3ee", border: "1px solid #164e63", borderRadius: 7, padding: "8px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{preview ? "✕ Fechar relatório" : "Relatório do mês"}</button>
        {preview && <button onClick={() => window.print()} style={{ background: "#34d399", color: "#000", border: "none", borderRadius: 7, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Imprimir / PDF</button>}
      </div>

      {/* PAINEL DE TAXAS DO MÊS */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Taxas de {MONTHS_FULL[mes]}/{ano}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: "1.5rem" }}>
        <RateCard label="Adesão higiene de mãos" valor={r.higiene != null ? fmt1(r.higiene) : "—"} unidade="%" cor={r.higiene == null ? "var(--border)" : r.higiene >= 80 ? "#34d399" : r.higiene >= 60 ? "#fbbf24" : "#f43f5e"} sub="realizadas ÷ oportunidades" />
        <RateCard label="Densidade de PAV" valor={r.pav != null ? fmt1(r.pav) : "—"} unidade="/1000 vent-dia" cor={r.pav == null ? "var(--border)" : "#6366f1"} sub="casos ÷ ventilador-dia" />
        <RateCard label="Uso de antimicrobiano" valor={r.antimicrobiano != null ? fmt1(r.antimicrobiano) : "—"} unidade="DOT/1000 pac-dia" cor={r.antimicrobiano == null ? "var(--border)" : "#3b82f6"} sub="DOT ÷ pacientes-dia" />
        <RateCard label="Positividade de culturas" valor={r.culturasPos != null ? fmt1(r.culturasPos) : "—"} unidade="%" cor={r.culturasPos == null ? "var(--border)" : "#0d9488"} sub="positivas ÷ coletadas" />
        <RateCard label="ISC cesariana" valor={r.iscCesariana != null ? fmt1(r.iscCesariana) : "—"} unidade="%" cor={r.iscCesariana == null ? "var(--border)" : r.iscCesariana > 0 ? "#fbbf24" : "#34d399"} sub="infecções ÷ cirurgias" />
        <RateCard label="ISC oftalmológica" valor={r.iscOftalmo != null ? fmt1(r.iscOftalmo) : "—"} unidade="%" cor={r.iscOftalmo == null ? "var(--border)" : r.iscOftalmo > 0 ? "#fbbf24" : "#34d399"} sub="infecções ÷ cirurgias" />
        <RateCard label="ISC artroplastia" valor={r.iscArtroplastia != null ? fmt1(r.iscArtroplastia) : "—"} unidade="%" cor={r.iscArtroplastia == null ? "var(--border)" : r.iscArtroplastia > 0 ? "#fbbf24" : "#34d399"} sub="infecções ÷ cirurgias" />
      </div>

      {/* LANÇAMENTO MENSAL */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Lançamento de {MONTHS_FULL[mes]}/{ano} {canEdit ? "" : "(somente leitura)"}</div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem", marginBottom: "1.5rem" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", marginBottom: 8 }}>Volumes do mês</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 16 }}>
          <NumField k="exames_lab" label="Exames laboratoriais" />
          <NumField k="exames_imagem" label="Exames de imagem" />
          <NumField k="culturas_coletadas" label="Culturas coletadas" />
          <NumField k="culturas_positivas" label="Culturas positivas" />
          <NumField k="pacientes_dia" label="Pacientes-dia" />
          <NumField k="ventilador_dia" label="Ventilador-dia" />
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", marginBottom: 8 }}>Higiene de mãos · PAV · antimicrobiano</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 16 }}>
          <NumField k="higiene_oportunidades" label="Oportunidades observadas" />
          <NumField k="higiene_realizadas" label="Higienizações realizadas" />
          <NumField k="pav_casos" label="Casos de PAV" />
          <NumField k="antimicrobiano_dot" label="Antimicrobiano (DOT)" />
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", marginBottom: 8 }}>Cirurgias limpas (nº de cirurgias e nº de infecções — ISC)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 16 }}>
          <NumField k="cir_cesariana" label="Cesarianas (C.O)" />
          <NumField k="isc_cesariana" label="ISC cesariana" />
          <NumField k="cir_oftalmo" label="Cir. oftalmológicas" />
          <NumField k="isc_oftalmo" label="ISC oftalmológica" />
          <NumField k="cir_artroplastia" label="Artroplastias quadril/joelho" />
          <NumField k="isc_artroplastia" label="ISC artroplastia" />
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", marginBottom: 8 }}>Treinamentos do SCIH</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 16 }}>
          <NumField k="treinamentos" label="Treinamentos realizados" />
          <NumField k="treinamentos_participantes" label="Participantes" />
        </div>
        <div style={{ marginBottom: canEdit ? 16 : 0 }}><label style={lbl}>Observação</label><input value={form.observacao ?? ""} onChange={e => setForm(p => ({ ...p, observacao: e.target.value }))} disabled={!canEdit} placeholder="Notas do mês" style={inp} /></div>
        {canEdit && <button onClick={salvar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 22px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "Salvando…" : "Salvar lançamento do mês"}</button>}
      </div>

      {/* TENDÊNCIAS */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Tendência (últimos {ultimos.length || 0} meses lançados)</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: "1.5rem" }}>
        <MiniTrend titulo="Adesão higiene de mãos" chave="higiene" unidade="%" cor="#0d9488" />
        <MiniTrend titulo="Densidade de PAV" chave="pav" unidade="/1000 vent-dia" cor="#6366f1" />
        <MiniTrend titulo="Uso de antimicrobiano" chave="antimicrobiano" unidade="DOT/1000 pac-dia" cor="#3b82f6" />
        <MiniTrend titulo="ISC cesariana" chave="iscCesariana" unidade="%" cor="#d97706" />
      </div>

      {preview && (
        <div id="scih-print" style={{ background: "#fff", color: "#111", borderRadius: 10, border: "1px solid #e5e7eb", padding: "24px 28px", fontFamily: "Inter, sans-serif", fontSize: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, paddingBottom: 12, borderBottom: "2px solid #e5e7eb" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>RELATÓRIO SCIH — {HOSPITAL_SIGLA}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{HOSPITAL_NOME} · Valentrax Healthcare Operations · Indicadores de controle de infecção</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", background: "#f1f5f9", borderRadius: 8, padding: "6px 14px" }}>{MONTHS_FULL[mes]}/{ano}</div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>Gerado em {new Date().toLocaleString("pt-BR")}</div>
            </div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr>{["Indicador", "Números", "Taxa / cálculo"].map(h => <th key={h} style={{ textAlign: "left", padding: "7px 10px", background: "#f8fafc", color: "#334155", borderBottom: "1.5px solid #e2e8f0", fontSize: 11 }}>{h}</th>)}</tr></thead>
            <tbody>
              {linhasRel.map(([ind, n, t]) => (
                <tr key={ind}><td style={{ padding: "6px 10px", borderBottom: "1px solid #eef2f7", fontWeight: 600, color: "#0f172a" }}>{ind}</td><td style={{ padding: "6px 10px", borderBottom: "1px solid #eef2f7", color: "#334155" }}>{n}</td><td style={{ padding: "6px 10px", borderBottom: "1px solid #eef2f7", color: "#0369a1", fontWeight: 600 }}>{t}</td></tr>
              ))}
            </tbody>
          </table>
          {form.observacao && <div style={{ marginTop: 12, fontSize: 11, color: "#475569" }}><strong>Observação:</strong> {form.observacao}</div>}
          <div style={{ marginTop: 16, fontSize: 10, color: "#94a3b8", borderTop: "1px solid #e5e7eb", paddingTop: 8 }}>Relatório gerado pela Valentrax Healthcare Operations · dados lançados manualmente pela equipe do SCIH. Taxas calculadas automaticamente. Documento de apoio à CCIH.</div>
        </div>
      )}
    </div>
  );
}

function LeitosPage({ currentUser, canEdit }) {
  const [leitos, setLeitos] = useState(() => loadLeitos());
  const [cidRef, setCidRef] = useState(() => loadCidRefLocal());
  const [modal, setModal]   = useState(null);   // leito sendo internado/editado
  const [tempos, setTempos] = useState(null);   // leito editando tempos de fluxo
  const [showCidRef, setShowCidRef] = useState(false);
  const [showIndic, setShowIndic]   = useState(false);
  const [setores, setSetores] = useState(() => loadSetoresLocal());
  const [showSetores, setShowSetores] = useState(false);
  const [novoLeito, setNovoLeito] = useState("");
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 60000); return () => clearInterval(id); }, []);

  useEffect(() => {
    if (!USE_SUPABASE) return;
    let cancel = false;
    const sync = () => {
      loadLeitosFromSupabase().then(rows => { if (!cancel && rows) { setLeitos(rows); saveLeitos(rows); } });
      loadCidRefFromSupabase().then(rows => { if (!cancel && rows) { setCidRef(rows); saveCidRefLocal(rows); } });
      loadSetoresFromSupabase().then(rows => { if (!cancel && rows) { setSetores(rows); saveSetoresLocal(rows); } });
    };
    sync();
    const onFocus = () => sync();
    window.addEventListener("focus", onFocus);
    return () => { cancel = true; window.removeEventListener("focus", onFocus); };
  }, []);

  async function salvarCidRef(ref) {
    const arr = loadCidRefLocal().filter(r => r.cid !== ref.cid);
    arr.push(ref);
    saveCidRefLocal(arr); setCidRef(arr);
    await upsertCidRefRemote(ref, currentUser);
  }
  async function removerCidRef(cid) {
    const arr = loadCidRefLocal().filter(r => r.cid !== cid);
    saveCidRefLocal(arr); setCidRef(arr);
    await deleteCidRefRemote(cid);
  }
  async function salvarSetor(setor) {
    const arr = loadSetoresLocal().filter(s => s.nome !== setor.nome); arr.push(setor);
    saveSetoresLocal(arr); setSetores(arr);
    await upsertSetorRemote(setor, currentUser);
    addAuditLog(currentUser, "salvar setor", setor.nome, {});
  }
  async function removerSetor(nome) {
    const arr = loadSetoresLocal().filter(s => s.nome !== nome);
    saveSetoresLocal(arr); setSetores(arr);
    await deleteSetorRemote(nome);
  }
  async function setSetorLeito(leito, setorNome) {
    await salvarLeito({ identificacao: leito.identificacao, setor: setorNome || null });
  }
  async function setIsolamentoLeito(leito, iso) {
    await salvarLeito({ identificacao: leito.identificacao, isolamento: iso || null });
    addAuditLog(currentUser, iso ? "marcar isolamento" : "remover isolamento", `${leito.identificacao}${iso ? " · " + iso : ""}`, {});
  }

  function persist(next) { saveLeitos(next); setLeitos(next); }
  async function salvarLeito(leito) {
    const arr = loadLeitos();
    const i = arr.findIndex(l => l.identificacao === leito.identificacao);
    if (i >= 0) arr[i] = { ...arr[i], ...leito }; else arr.push(leito);
    persist(arr);
    await upsertLeitoRemote(arr[i >= 0 ? i : arr.length - 1], currentUser);
  }
  async function addLeito() {
    const id = novoLeito.trim();
    if (!id) return;
    if (loadLeitos().some(l => l.identificacao.toLowerCase() === id.toLowerCase())) { alert("Esse leito já existe."); return; }
    setNovoLeito("");
    await salvarLeito({ identificacao: id, status: "livre" });
    addAuditLog(currentUser, "cadastrar leito", id, {});
  }
  async function internar(leito, dados) {
    const now = nowISO();
    const editando = leito.status === "ocupado";
    // Se o leito passou por higienização antes desta internação, fecha o ciclo de turnover.
    if (!editando && leito.disp_em) {
      await registrarTurnoverRemote({ leito: leito.identificacao, solic_em: dados.solic_em || null, disp_em: leito.disp_em, pronto_em: leito.pronto_em || null, entrada_em: now }, currentUser);
    }
    await salvarLeito({
      identificacao: leito.identificacao, status: "ocupado", interdicao_motivo: null,
      iniciais: dados.iniciais, prontuario: dados.prontuario, motivo: dados.motivo, cid: dados.cid,
      data_internacao: dados.data_internacao, dias_previstos: dados.dias_previstos,
      entrada_em: editando ? (leito.entrada_em || now) : now,
      solic_em: null, disp_em: null, pronto_em: null,
    });
    addAuditLog(currentUser, editando ? "editar internação" : "internar", leito.identificacao, { cid: dados.cid });
    setModal(null);
  }
  async function darAlta(leito) {
    if (!confirm(`Dar alta do paciente do leito ${leito.identificacao}? O leito vai para HIGIENIZAÇÃO.`)) return;
    const now = nowISO();
    const dias = leito.data_internacao ? Math.max(0, Math.round((new Date(todayStr() + "T00:00:00") - new Date(leito.data_internacao + "T00:00:00")) / 86400000)) : null;
    await registrarSaidaRemote({
      leito: leito.identificacao, iniciais: leito.iniciais, prontuario: leito.prontuario, cid: leito.cid,
      motivo: leito.motivo, data_internacao: leito.data_internacao, data_alta: todayStr(),
      disp_em: now, dias_permanencia: dias,
    }, currentUser);
    await salvarLeito({
      identificacao: leito.identificacao, status: "higienizacao", disp_em: now, pronto_em: null, solic_em: null, entrada_em: null,
      iniciais: null, prontuario: null, motivo: null, cid: null, data_internacao: null, dias_previstos: null, interdicao_motivo: null,
    });
    addAuditLog(currentUser, "dar alta", leito.identificacao, {});
  }
  async function marcarPronto(leito) {
    await salvarLeito({ identificacao: leito.identificacao, status: "livre", pronto_em: nowISO() });
    addAuditLog(currentUser, "leito pronto", leito.identificacao, {});
  }
  async function salvarTempos(leito, campos) {
    await salvarLeito({ identificacao: leito.identificacao, ...campos });
    setTempos(null);
  }
  async function interditar(leito) {
    const motivo = prompt(`Motivo da interdição do leito ${leito.identificacao}:`, leito.interdicao_motivo || "");
    if (motivo === null) return;
    await salvarLeito({ identificacao: leito.identificacao, status: "interditado", interdicao_motivo: motivo, iniciais: null, prontuario: null, motivo: null, cid: null, data_internacao: null, dias_previstos: null, solic_em: null, disp_em: null, pronto_em: null, entrada_em: null });
    addAuditLog(currentUser, "interditar leito", leito.identificacao, { motivo });
  }
  async function liberar(leito) {
    await salvarLeito({ identificacao: leito.identificacao, status: "livre", interdicao_motivo: null });
    addAuditLog(currentUser, "liberar leito", leito.identificacao, {});
  }
  async function removerLeito(leito) {
    if (!confirm(`Remover o leito ${leito.identificacao} do cadastro?`)) return;
    persist(loadLeitos().filter(l => l.identificacao !== leito.identificacao));
    await deleteLeitoRemote(leito.identificacao);
    addAuditLog(currentUser, "remover leito", leito.identificacao, {});
  }

  const ordenados = [...leitos].sort((a, b) => a.identificacao.localeCompare(b.identificacao, "pt-BR", { numeric: true }));
  const total = leitos.length;
  const ocupados = leitos.filter(l => l.status === "ocupado").length;
  const interditados = leitos.filter(l => l.status === "interditado").length;
  const livres = leitos.filter(l => l.status === "livre").length;
  const higienizando = leitos.filter(l => l.status === "higienizacao").length;
  const operacionais = total - interditados;
  const ocupacao = operacionais > 0 ? Math.round((ocupados / operacionais) * 100) : 0;
  const sinais = leitos.filter(l => l.status === "ocupado").map(l => sinalLeito(l.data_internacao, l.dias_previstos));
  const amarelos = sinais.filter(s => s.restam !== null && s.restam >= 0 && s.restam <= 1).length;
  const vermelhos = sinais.filter(s => s.restam !== null && s.restam < 0).length;

  const Card = ({ label, valor, cor }) => (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", minWidth: 120, flex: 1 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: cor || "var(--text)", fontFamily: "JetBrains Mono, monospace", marginTop: 4 }}>{valor}</div>
    </div>
  );

  return (
    <div style={{ padding: "1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Giro de Leitos</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: "1.25rem" }}>Painel de gestão de leitos e previsão de alta</div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: "1.25rem" }}>
        <Card label="Leitos" valor={total} />
        <Card label="Ocupados" valor={ocupados} cor="#22d3ee" />
        <Card label="Livres" valor={livres} cor="#34d399" />
        <Card label="Higienização" valor={higienizando} cor="#fbbf24" />
        <Card label="Interditados" valor={interditados} cor="#fb7185" />
        <Card label="Ocupação" valor={ocupacao + "%"} cor={ocupacao >= 90 ? "#f43f5e" : "var(--text)"} />
        <Card label="Alta próxima" valor={amarelos} cor="#fbbf24" />
        <Card label="Alta vencida" valor={vermelhos} cor="#f43f5e" />
      </div>

      {canEdit && (
        <div style={{ display: "flex", gap: 8, marginBottom: "1.25rem", alignItems: "center" }}>
          <input value={novoLeito} onChange={e => setNovoLeito(e.target.value)} onKeyDown={e => e.key === "Enter" && addLeito()} placeholder="Cadastrar leito (ex.: 101, UTI-1)" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 11px", color: "var(--text)", fontSize: 13, outline: "none", width: 260 }} />
          <button onClick={addLeito} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Cadastrar leito</button>
          <button onClick={() => setShowSetores(true)} style={{ background: "transparent", color: "var(--text-2)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13, marginLeft: "auto" }}>Setores</button>
          <button onClick={() => setShowIndic(true)} style={{ background: "transparent", color: "var(--text-2)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Indicadores</button>
          <button onClick={() => setShowCidRef(true)} style={{ background: "transparent", color: "var(--text-2)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Referências de CID</button>
        </div>
      )}

      {ordenados.length === 0 ? (
        <div style={{ background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 10, padding: "2.5rem", textAlign: "center", color: "var(--text-muted)" }}>
          Nenhum leito cadastrado ainda.{canEdit ? " Cadastre o primeiro acima." : ""}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 12 }}>
          {ordenados.map(l => {
            const st = STATUS_LEITO[l.status] || STATUS_LEITO.livre;
            const sinal = l.status === "ocupado" ? sinalLeito(l.data_internacao, l.dias_previstos) : null;
            const borda = sinal ? sinal.cor : st.cor;
            return (
              <div key={l.identificacao} style={{ background: "var(--surface-2)", border: `1px solid var(--border)`, borderLeft: `4px solid ${borda}`, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>Leito {l.identificacao}</div>
                  <span style={{ background: st.bg, color: st.cor, borderRadius: 99, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{st.label}</span>
                </div>

                {l.isolamento && ISOLAMENTOS[l.isolamento] && (
                  <div title={ISOLAMENTOS[l.isolamento].curto} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: ISOLAMENTOS[l.isolamento].bg, color: ISOLAMENTOS[l.isolamento].cor, border: `1px solid ${ISOLAMENTOS[l.isolamento].cor}55`, borderRadius: 99, padding: "2px 10px", fontSize: 11, fontWeight: 800, marginBottom: 8 }}>
                    Isolamento {ISOLAMENTOS[l.isolamento].label}
                  </div>
                )}

                {canEdit ? (
                  <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                    <select value={l.setor || ""} onChange={e => setSetorLeito(l, e.target.value)} style={{ background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 5, padding: "3px 7px", color: l.setor ? "#60a5fa" : "var(--text-muted)", fontSize: 11, fontFamily: "Inter, sans-serif", outline: "none", maxWidth: "100%", cursor: "pointer" }}>
                      <option value="">sem setor</option>
                      {setores.map(s => <option key={s.nome} value={s.nome}>{s.nome}</option>)}
                    </select>
                    <select value={l.isolamento || ""} onChange={e => setIsolamentoLeito(l, e.target.value)} title="Marcar leito como isolamento" style={{ background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 5, padding: "3px 7px", color: l.isolamento && ISOLAMENTOS[l.isolamento] ? ISOLAMENTOS[l.isolamento].cor : "var(--text-muted)", fontSize: 11, fontFamily: "Inter, sans-serif", outline: "none", maxWidth: "100%", cursor: "pointer" }}>
                      <option value="">sem isolamento</option>
                      {Object.entries(ISOLAMENTOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                ) : l.setor && <div style={{ marginBottom: 8, fontSize: 11, color: "#60a5fa", fontWeight: 600 }}>{l.setor}</div>}

                {l.status === "ocupado" && (
                  <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.7 }}>
                    <div><strong style={{ color: "var(--text)" }}>{l.iniciais}</strong>{l.prontuario ? ` · reg. ${l.prontuario}` : ""}</div>
                    {l.cid && <div style={{ color: "var(--text-3)" }}>CID {l.cid}{l.motivo ? ` · ${l.motivo}` : ""}</div>}
                    {!l.cid && l.motivo && <div style={{ color: "var(--text-3)" }}>{l.motivo}</div>}
                    <div style={{ color: "var(--text-muted)" }}>Internação: {l.data_internacao ? new Date(l.data_internacao + "T00:00:00").toLocaleDateString("pt-BR") : "—"} · {l.dias_previstos}d prev.</div>
                    {sinal && <div style={{ marginTop: 6, color: sinal.cor, fontWeight: 700, fontSize: 12 }}>{sinal.texto}</div>}
                  </div>
                )}
                {l.status === "livre" && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    Disponível para internação.
                    {l.pronto_em && <div style={{ color: "#34d399", marginTop: 2 }}>Pronto desde {horaFmt(l.pronto_em)}</div>}
                  </div>
                )}
                {l.status === "higienizacao" && (
                  <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.7 }}>
                    <div>Em higienização</div>
                    <div style={{ color: "var(--text-muted)" }}>Vagou: {horaFmt(l.disp_em)}</div>
                    <div style={{ marginTop: 4, color: "#fbbf24", fontWeight: 700 }}>Limpando há {fmtDur(diffMin(l.disp_em, nowISO()))}</div>
                  </div>
                )}
                {l.status === "interditado" && <div style={{ fontSize: 12, color: "#fb7185" }}>Interditado{l.interdicao_motivo ? `: ${l.interdicao_motivo}` : ""}</div>}

                {canEdit && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                    {l.status === "livre" && <>
                      <button onClick={() => setModal(l)} style={btnLeito("#22d3ee")}>Internar</button>
                      <button onClick={() => interditar(l)} style={btnLeito("#fbbf24")}>Interditar</button>
                      <button onClick={() => removerLeito(l)} style={btnLeito("var(--text-muted)")}>Excluir</button>
                    </>}
                    {l.status === "ocupado" && <>
                      <button onClick={() => darAlta(l)} style={btnLeito("#34d399")}>Dar alta</button>
                      <button onClick={() => setModal(l)} style={btnLeito("var(--text-3)")}>Editar</button>
                    </>}
                    {l.status === "higienizacao" && <>
                      <button onClick={() => marcarPronto(l)} style={btnLeito("#34d399")}>✓ Pronto</button>
                      <button onClick={() => setTempos(l)} style={btnLeito("var(--text-3)")}>Ajustar</button>
                      <button onClick={() => interditar(l)} style={btnLeito("#fb7185")}>Interditar</button>
                    </>}
                    {l.status === "interditado" && <>
                      <button onClick={() => liberar(l)} style={btnLeito("#34d399")}>Liberar</button>
                      <button onClick={() => removerLeito(l)} style={btnLeito("var(--text-muted)")}>Excluir</button>
                    </>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modal && <InternarModal leito={modal} refs={cidRef} onClose={() => setModal(null)} onSave={dados => internar(modal, dados)} />}
      {tempos && <TemposModal leito={tempos} onClose={() => setTempos(null)} onSave={campos => salvarTempos(tempos, campos)} />}
      {showCidRef && <CidRefModal refs={cidRef} onClose={() => setShowCidRef(false)} onSave={salvarCidRef} onDelete={removerCidRef} />}
      {showSetores && <SetoresModal setores={setores} leitos={leitos} onClose={() => setShowSetores(false)} onSave={salvarSetor} onDelete={removerSetor} />}
      {showIndic && <IndicadoresModal leitos={leitos} onClose={() => setShowIndic(false)} />}
    </div>
  );
}
function btnLeito(cor) {
  return { background: "transparent", border: `1px solid ${cor}55`, color: cor, borderRadius: 5, padding: "4px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600 };
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
function IndicadoresModal({ leitos, onClose }) {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth());
  const [ano, setAno] = useState(now.getFullYear());
  const [saidas, setSaidas] = useState(null);
  const [turnover, setTurnover] = useState(null);
  useEffect(() => { loadSaidas().then(setSaidas); loadTurnover().then(setTurnover); }, []);

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

// ═══════════════════════════════════════════════════════════
// USUÁRIOS
// ═══════════════════════════════════════════════════════════
function UsersPage({ currentUser }) {
  const [profiles, setProfiles] = useState([]);
  const [np1, setNp1] = useState("");
  const [np2, setNp2] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { loadProfiles().then(setProfiles); }, []);
  async function handleChangePw() {
    if (busy) return;
    if (np1.length < 6) { setMsg("⚠️ A nova senha precisa de ao menos 6 caracteres."); return; }
    if (np1 !== np2) { setMsg("⚠️ As duas senhas não coincidem."); return; }
    setBusy(true); setMsg("");
    const r = await changeMyPassword(np1);
    setBusy(false);
    if (r.ok) { setMsg("✓ Senha alterada com sucesso!"); setNp1(""); setNp2(""); addAuditLog(currentUser, "trocar senha", currentUser.username, {}); setTimeout(() => setMsg(""), 3000); }
    else setMsg("⚠️ " + r.error);
  }
  const inp = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  return (
    <div style={{ padding: "1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Usuários e Acesso</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: "1.5rem" }}>Login protegido pelo Supabase Auth</div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem", marginBottom: "1.25rem", maxWidth: 460 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 14 }}>Trocar minha senha</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input type="password" value={np1} placeholder="Nova senha (mín. 6 caracteres)" onChange={e => { setNp1(e.target.value); setMsg(""); }} style={inp} autoComplete="new-password" />
          <input type="password" value={np2} placeholder="Repita a nova senha" onChange={e => { setNp2(e.target.value); setMsg(""); }} onKeyDown={e => e.key === "Enter" && handleChangePw()} style={inp} autoComplete="new-password" />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={handleChangePw} disabled={busy} style={{ background: busy ? "#334155" : "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 18px", fontWeight: 700, cursor: busy ? "default" : "pointer", fontSize: 13 }}>{busy ? "Salvando…" : "Trocar senha"}</button>
            {msg && <span style={{ fontSize: 13, color: msg.startsWith("✓") ? "#34d399" : "#fbbf24", fontWeight: 600 }}>{msg}</span>}
          </div>
        </div>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, marginBottom: "1.25rem", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em" }}>Usuários com acesso ({profiles.length})</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>{["Nome","Usuário","Perfil","Permissões"].map(h => <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "var(--text-muted)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", borderBottom: "1px solid var(--border)", background: "var(--bg-2)" }}>{h}</th>)}</tr></thead>
          <tbody>
            {profiles.map(u => {
              const role = ROLES[u.role] || ROLES.visualizador; const isMe = u.username === currentUser.username;
              return (
                <tr key={u.username} style={{ background: isMe ? "#1a1a28" : "transparent" }}>
                  <td style={{ padding: "10px 14px", color: "var(--text)", fontWeight: 600 }}>{u.nome} {isMe && <span style={{ fontSize: 10, background: "#0e4f5f", color: "#22d3ee", borderRadius: 99, padding: "1px 6px", marginLeft: 6 }}>você</span>}</td>
                  <td style={{ padding: "10px 14px", fontFamily: "JetBrains Mono, monospace", color: "var(--text-3)" }}>{u.username}</td>
                  <td style={{ padding: "10px 14px" }}><span style={{ background: role.color + "22", color: role.color, borderRadius: 99, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>{role.label}</span></td>
                  <td style={{ padding: "10px 14px", fontSize: 11, color: "var(--text-muted)" }}>{role.desc}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ background: "#0e2a3d", border: "1px solid #1e4d6b", borderRadius: 10, padding: "1rem 1.25rem", fontSize: 13, color: "#9cc7dd", lineHeight: 1.6, maxWidth: 680 }}>
        <strong style={{ color: "#22d3ee" }}>Adicionar ou remover usuários</strong> é feito no painel do Supabase → <em>Authentication → Users</em> (por segurança, a criação de contas não fica no navegador). Ao criar, use o e-mail no formato <code style={{ background: "#0a1a26", padding: "1px 5px", borderRadius: 4 }}>usuario@hnsn.local</code> e defina o perfil em <em>User Metadata</em>, por exemplo <code style={{ background: "#0a1a26", padding: "1px 5px", borderRadius: 4 }}>{`{ "role": "adm_silver" }`}</code>.
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
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Banco de Dados — Supabase</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: "1.5rem" }}>Configure o banco de dados para sincronização em tempo real entre dispositivos</div>

      <div style={{ background: USE_SUPABASE ? "#0a3d2a" : "#3d2e06", border: `1px solid ${USE_SUPABASE ? "#34d399" : "#fbbf24"}`, borderRadius: 10, padding: "1rem 1.25rem", marginBottom: "1.25rem" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: USE_SUPABASE ? "#34d399" : "#fbbf24" }}>
          {USE_SUPABASE ? "Supabase conectado e ativo" : "⚠️ Supabase não configurado — usando localStorage"}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
          {USE_SUPABASE ? "Os dados estão sendo sincronizados em tempo real." : "Os dados ficam somente neste navegador. Configure o Supabase para persistência real."}
        </div>
      </div>

      {[
        { step: "1", title: "Criar conta gratuita no Supabase", desc: "Acesse supabase.com e clique em 'Start your project'. Use sua conta Google ou crie um e-mail/senha.", action: "Acessar supabase.com →", url: "https://supabase.com" },
        { step: "2", title: "Criar um novo projeto", desc: "Clique em 'New Project', dê o nome 'medflow-hnsn', escolha a região 'South America (São Paulo)' e defina uma senha forte." },
        { step: "3", title: "Criar as tabelas", desc: "Vá em SQL Editor e execute o script abaixo para criar as tabelas necessárias." },
        { step: "4", title: "Pegar as credenciais", desc: "Vá em Settings → API. Copie a 'Project URL' e a 'anon public key'." },
        { step: "5", title: "Adicionar as credenciais ao projeto", desc: "No arquivo index.html do Valentrax, adicione antes do </body>:\n\n<script>\n  window.SUPABASE_URL = 'sua-url-aqui';\n  window.SUPABASE_KEY = 'sua-chave-aqui';\n</script>" },
      ].map(({ step, title, desc, action, url }) => (
        <div key={step} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem 1.25rem", marginBottom: ".75rem", display: "flex", gap: "1rem" }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#22d3ee22", border: "1px solid #22d3ee", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#22d3ee", flexShrink: 0 }}>{step}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{title}</div>
            <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.6, whiteSpace: "pre-line" }}>{desc}</div>
            {action && url && <a href={url} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8, color: "#22d3ee", fontSize: 12, fontWeight: 700 }}>{action}</a>}
          </div>
        </div>
      ))}

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem 1.25rem" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>SQL — Execute no Supabase SQL Editor</div>
        <pre style={{ background: "var(--input-bg)", borderRadius: 8, padding: "1rem", fontSize: 11, color: "#34d399", overflowX: "auto", lineHeight: 1.6 }}>{`-- Tabela de atendimentos
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
  const [loading, setLoading]   = useState(false);
  async function handleLogin() {
    if (loading) return;
    if (!username.trim() || !password) { setError("Preencha usuário e senha."); return; }
    setLoading(true); setError("");
    const r = await signIn(username, password);
    setLoading(false);
    if (r.ok) onLogin(r.user);
    else { setError(r.error); setShake(true); setTimeout(() => setShake(false), 500); }
  }
  const inp = { width: "100%", padding: "11px 14px", borderRadius: 8, border: `1.5px solid #2a4166`, fontSize: 14, outline: "none", fontFamily: "Inter, sans-serif", background: "#0f1b2e", color: "#e9eef5", transition: "border .15s", boxSizing: "border-box" };
  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(90% 130% at 75% -25%, #1c3356 0%, ${VX.marinho} 60%)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif" }}>
      <div style={{ background: VX.marinho2, border: `1px solid #2a4166`, borderRadius: 16, padding: "2.5rem 2rem", width: 380, boxShadow: "0 20px 60px rgba(2,8,20,.55)", animation: shake ? "shake .4s ease" : "fadeIn .4s ease" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ margin: "0 auto 12px", width: 58 }}><VxLogo size={58} /></div>
          <VxWordmark size={22} color="#f2f6fb" spacing=".12em" />
          <div style={{ fontSize: 10, color: VX.turquesa, marginTop: 4, letterSpacing: ".2em", fontWeight: 600 }}>HEALTHCARE OPERATIONS</div>
          <div style={{ fontSize: 12, color: "#c6d2e2", marginTop: 8 }}>Inteligência para o fluxo hospitalar.</div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#9db1cd", display: "block", marginBottom: 6 }}>USUÁRIO</label>
          <input type="text" value={username} placeholder="Digite seu usuário" onChange={e => { setUsername(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && handleLogin()} onFocus={e => e.target.style.borderColor = VX.turquesa} onBlur={e => e.target.style.borderColor = "#2a4166"} style={inp} autoComplete="username" />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#9db1cd", display: "block", marginBottom: 6 }}>SENHA</label>
          <div style={{ position: "relative" }}>
            <input type={showPass ? "text" : "password"} value={password} placeholder="••••••••" onChange={e => { setPassword(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && handleLogin()} onFocus={e => e.target.style.borderColor = VX.turquesa} onBlur={e => e.target.style.borderColor = "#2a4166"} style={{ ...inp, paddingRight: 44 }} autoComplete="current-password" />
            <button onClick={() => setShowPass(p => !p)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#5b76a0" }}>{showPass ? "🙈" : "👁"}</button>
          </div>
        </div>
        {error && <div style={{ background: "#3d0f18", border: "1px solid #7f1d2e", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#fda4af", marginBottom: 14 }}>⚠️ {error}</div>}
        <button onClick={handleLogin} disabled={loading} style={{ width: "100%", padding: "12px", borderRadius: 8, border: "none", background: loading ? "#5b76a0" : `linear-gradient(90deg, ${VX.turquesa}, ${VX.azul})`, color: "#062a35", fontSize: 15, fontWeight: 700, cursor: loading ? "default" : "pointer", fontFamily: "Inter, sans-serif", boxShadow: "0 4px 18px rgba(45,212,191,.3)" }}>{loading ? "Entrando…" : "Entrar"}</button>
        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "#5b76a0", letterSpacing: ".06em" }}>VALENTRAX HEALTHCARE OPERATIONS</div>
        <div style={{ textAlign: "center", marginTop: 6, fontSize: 12, color: "#7f97b8" }}>Acesso restrito · {HOSPITAL_NOME}</div>
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
  const [db, setDb] = useState(() => loadDB());
  const [active, setActive] = useState("overview");
  const [ambOpen, setAmbOpen] = useState(true);
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem("hnsn_theme") || "dark"; } catch { return "dark"; } });
  useEffect(() => { document.title = `Valentrax · ${HOSPITAL_SIGLA}`; }, []);
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); try { localStorage.setItem("hnsn_theme", theme); } catch {} }, [theme]);
  
  const handleSave = useCallback(newDb => {
    setDb(prev => ({ ...newDb }));
  }, []);

  // Busca os dados no Supabase (fonte compartilhada entre os computadores) e
  // FUNDE com o que já existe localmente — sem apagar nada. O Supabase tem
  // prioridade por (data, especialidade); dados locais que ainda não estão na
  // nuvem são preservados. Se falhar/offline, mantém o localStorage.
  // Roda ao abrir E sempre que a janela volta ao foco (troca de aba/computador),
  // pra ver os números novos sem precisar apertar F5.
  useEffect(() => {
    if (!USE_SUPABASE || !currentUser) return;
    let cancelled = false;
    const syncFromCloud = () => {
      loadFromSupabase().then(cloud => {
        if (cancelled || !cloud) return;
        const prev = loadDB();
        const merged = { ...prev };
        for (const d in cloud) merged[d] = { ...(merged[d] || {}), ...cloud[d] };
        saveDB(merged);
        setDb(merged);
        // MIGRAÇÃO AUTOMÁTICA: registros que só existem neste aparelho
        // (digitados antes da nuvem, ou salvos offline) sobem para o Supabase.
        const pendentes = [];
        for (const d in merged) {
          for (const s in merged[d]) {
            if (!cloud[d] || !cloud[d][s]) {
              pendentes.push({ data: d, especialidade: s, ...merged[d][s], usuario: "migracao-auto" });
            }
          }
        }
        if (pendentes.length > 0) {
          sbFetch("atendimentos?on_conflict=data,especialidade", {
            method: "POST",
            headers: { "Prefer": "resolution=merge-duplicates" },
            body: JSON.stringify(pendentes),
          });
        }
      });
    };
    syncFromCloud();
    const onFocus = () => syncFromCloud();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [currentUser]);

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
    { id: "overview",  icon: "dashboard", label: "Visão Geral" },
    { id: "d1" },
    { id: "ambulatorio", icon: "clinic", label: "Ambulatório", children: SPECS.map(s => ({ id: s.id, label: s.label, color: s.color })) },
    { id: "d2" },
    { id: "ps",       icon: "activity", label: "Pronto-Socorro" },
    { id: "bloco",    icon: "scissors", label: "Bloco Cirúrgico" },
    { id: "leitos",   icon: "bed", label: "Giro de Leitos" },
    { id: "scih",     icon: "shield", label: "SCIH" },
    { id: "paciente", icon: "record", label: "Paciente 360" },
    ...(canPrint    ? [{ id: "print",     icon: "printer",   label: "Imprimir Dashboard" }] : []),
    ...(canAudit    ? [{ id: "auditoria", icon: "clipboard", label: "Auditoria" }]           : []),
    ...(canImport   ? [{ id: "import",    icon: "upload",    label: "Importar Dados" }]      : []),
    ...(canSupabase ? [{ id: "supabase",  icon: "cloud",     label: "Banco de Dados" }]      : []),
    ...(canUsers    ? [{ id: "users",     icon: "users",     label: "Usuários" }]            : []),
  ];
  const currentSpec = SPECS.find(s => s.id === active);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 14 }}>
      {/* HEADER */}
      <div style={{ background: "var(--bg-2)", borderBottom: "1px solid var(--border)", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 1.5rem", flexShrink: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <VxLogo size={30} />
          <div>
            <VxWordmark size={14} />
            <div style={{ fontSize: 8.5, color: VX.turquesa, letterSpacing: ".18em", fontWeight: 600 }}>HEALTHCARE OPERATIONS</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 11, color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 20, padding: "3px 11px", whiteSpace: "nowrap" }}>{HOSPITAL_NOME}</span>
          <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "JetBrains Mono, monospace" }}>{now.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}</div>
          <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} title="Alternar tema claro/escuro" style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 9px", color: "var(--text-3)", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>{theme === "dark" ? "☀️" : "🌙"}</button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{currentUser.name}</div>
              <div style={{ fontSize: 10, color: role.color, fontWeight: 700 }}>{role.label}</div>
            </div>
            <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: role.color, background: role.color + "22", border: `1px solid ${role.color}44` }}>
              {(currentUser.name || "?").charAt(0).toUpperCase()}
            </div>
            <button onClick={handleLogout} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 10px", color: "var(--text-muted)", cursor: "pointer", fontSize: 12, fontFamily: "Inter, sans-serif" }}
              onMouseOver={e => { e.currentTarget.style.borderColor = "#fb7185"; e.currentTarget.style.color = "#fb7185"; }}
              onMouseOut={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}>
              Sair
            </button>
          </div>
        </div>
      </div>

      {/* ALERTAS */}
      <AlertBanner db={db} />

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* SIDEBAR */}
        <nav style={{ width: 215, minWidth: 215, background: "var(--bg-2)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", padding: ".75rem 0", overflowY: "auto", flexShrink: 0 }}>
          {isReadOnly && <div style={{ margin: "0 10px 8px", background: "var(--surface-3)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "6px 10px", fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>Somente visualização</div>}
          {sidebarItems.map((item, i) => {
            if (item.id?.startsWith("d")) return <div key={i} style={{ height: 1, background: "var(--surface-3)", margin: ".5rem 0" }} />;

            // Grupo expansível (ex.: Ambulatório → especialidades)
            if (item.children) {
              const childActive = item.children.some(c => c.id === active);
              return (
                <div key={item.id}>
                  <button onClick={() => setAmbOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: ".5rem 1rem", border: "none", borderLeft: `3px solid ${childActive ? "#22d3ee" : "transparent"}`, color: childActive ? "#22d3ee" : "var(--text-2)", cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: 600, fontFamily: "Inter, sans-serif", background: childActive ? "var(--surface)" : "transparent" }}>
                    <Icon name={item.icon} />{item.label}
                    <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-muted)" }}>{ambOpen ? "▾" : "▸"}</span>
                  </button>
                  {ambOpen && item.children.map(c => {
                    const isActive = active === c.id;
                    return (
                      <button key={c.id} onClick={() => setActive(c.id)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: ".4rem 1rem .4rem 2.4rem", border: "none", borderLeft: `3px solid ${isActive ? (c.color || "#22d3ee") : "transparent"}`, color: isActive ? (c.color || "#22d3ee") : "var(--text-3)", cursor: "pointer", textAlign: "left", fontSize: 12.5, fontWeight: 500, fontFamily: "Inter, sans-serif", background: isActive ? "var(--surface)" : "transparent" }}>
                        <span style={{ width: 7, height: 7, borderRadius: 99, background: c.color || "var(--text-muted)", flexShrink: 0 }} />{c.label}
                      </button>
                    );
                  })}
                </div>
              );
            }

            const isActive = active === item.id;
            return (
              <button key={item.id} onClick={() => setActive(item.id)} style={{ display: "flex", alignItems: "center", gap: 9, padding: ".5rem 1rem", border: "none", borderLeft: `3px solid ${isActive ? (item.color || "#22d3ee") : "transparent"}`, color: isActive ? (item.color || "#22d3ee") : "var(--text-3)", cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: 500, fontFamily: "Inter, sans-serif", transition: "all .12s", background: isActive ? "var(--surface)" : "transparent" }}>
                <Icon name={item.icon} />{item.label}
              </button>
            );
          })}
        </nav>

        {/* CONTENT */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {active === "overview"  && <Overview db={db} currentUser={currentUser} canEdit={canLaunch} />}
          {currentSpec            && <EspecialidadePage spec={currentSpec} db={db} onSave={handleSave} readOnly={!canLaunch} currentUser={currentUser} />}
          {active === "ps"        && <PSPage currentUser={currentUser} canEdit={canLaunch} />}
          {active === "bloco"     && <BlocoPage currentUser={currentUser} canEdit={canLaunch} />}
          {active === "leitos"    && <LeitosPage currentUser={currentUser} canEdit={canLaunch} />}
          {active === "scih"      && <ScihPage currentUser={currentUser} canEdit={canLaunch} />}
          {active === "paciente"  && <PacientePage currentUser={currentUser} canEdit={canLaunch} />}
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
