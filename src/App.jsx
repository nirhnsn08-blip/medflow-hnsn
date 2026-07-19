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
  pill:      <><rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-45 12 12)"/><path d="M8.5 8.5 l7 7"/></>,
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
// FARMÁCIA — Fase A: catálogo + estoque (lote/validade, kardex FEFO)
// ═══════════════════════════════════════════════════════════
const FARM_FORMAS   = ["Comprimido", "Cápsula", "Ampola", "Frasco-ampola", "Frasco", "Bolsa/Soro", "Seringa", "Bisnaga/Pomada", "Spray/Aerossol", "Solução oral", "Sachê", "Outro"];
const FARM_UNIDADES = ["unidade", "comprimido", "cápsula", "ampola", "frasco-ampola", "frasco", "bolsa", "seringa", "mL", "g", "dose"];
// Classes terapêuticas (ordem de exibição no agrupamento)
const FARM_CLASSES = [
  "Analgésicos e antipiréticos",
  "Anti-inflamatórios (AINEs)",
  "Opioides",
  "Anestésicos",
  "Antibióticos",
  "Antifúngicos",
  "Antivirais",
  "Insulinas",
  "Antidiabéticos orais",
  "Cardiovasculares e anti-hipertensivos",
  "Diuréticos",
  "Anticoagulantes e antitrombóticos",
  "Drogas vasoativas",
  "Respiratório / broncodilatadores",
  "Corticoides",
  "Antieméticos",
  "Antiulcerosos / protetores gástricos",
  "Sedativos e anticonvulsivantes",
  "Antipsicóticos e antidepressivos",
  "Anti-histamínicos / antialérgicos",
  "Soluções, eletrólitos e soros",
  "Vitaminas e suplementos",
  "Outros",
];
const FARM_MOTIVOS_SAIDA = ["Dispensação", "Perda / vencimento", "Devolução ao fornecedor", "Ajuste de inventário", "Transferência"];
const FARM_VENC_DIAS = 30; // janela de "vencendo em breve" (dias)

async function loadFarmMedicamentos() {
  const rows = await sbFetch("farm_medicamentos?select=*&order=nome");
  return Array.isArray(rows) ? rows : [];
}
async function loadFarmLotes() {
  const rows = await sbFetch("farm_lotes?select=*&order=validade.asc.nullslast");
  return Array.isArray(rows) ? rows : [];
}
async function loadFarmMovimentos(medicamentoId, limit = 60) {
  const q = medicamentoId
    ? `farm_movimentos?medicamento_id=eq.${medicamentoId}&select=*&order=created_at.desc&limit=${limit}`
    : `farm_movimentos?select=*&order=created_at.desc&limit=${limit}`;
  const rows = await sbFetch(q);
  return Array.isArray(rows) ? rows : [];
}
async function loadFarmMovimentosPeriodo(fromISO, toISO) {
  const rows = await sbFetch(`farm_movimentos?created_at=gte.${fromISO}&created_at=lt.${toISO}&select=*&order=created_at.desc&limit=8000`);
  return Array.isArray(rows) ? rows : [];
}
async function upsertFarmMedicamentoRemote(med, user) {
  if (!USE_SUPABASE) return null;
  const body = { ...med, usuario: user?.name || null, updated_at: nowISO() };
  if (med.id) {
    await sbFetch(`farm_medicamentos?id=eq.${med.id}`, { method: "PATCH", body: JSON.stringify(body) });
    return null;
  }
  delete body.id;
  return await sbFetch("farm_medicamentos", { method: "POST", headers: { "Prefer": "return=representation" }, body: JSON.stringify(body) });
}
async function deleteFarmMedicamentoRemote(id) {
  if (!USE_SUPABASE) return;
  await sbFetch(`farm_medicamentos?id=eq.${id}`, { method: "DELETE" });
}
// Movimento de estoque: retorna { ok, erro } — o trigger pode barrar (estoque insuficiente),
// e como o sbFetch engole erros, aqui fazemos o fetch direto para capturar a mensagem.
async function addFarmMovimentoRemote(mov, user) {
  if (!USE_SUPABASE) return { ok: false, erro: "Supabase indisponível." };
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/farm_movimentos`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${AUTH_TOKEN || SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
      body: JSON.stringify({ ...mov, usuario: user?.name || null }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { ok: false, erro: body?.message || `Erro ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: String(e?.message || e) };
  }
}
// Saldo total de um medicamento = soma dos lotes
function farmSaldoTotal(medId, lotes) {
  return lotes.filter(l => l.medicamento_id === medId).reduce((s, l) => s + Number(l.quantidade || 0), 0);
}
// Pares clínicos: interações medicamentosas e incompatibilidade em Y (Fase 2)
async function loadFarmInteracoes() {
  const rows = await sbFetch("farm_interacoes?select=*&order=gravidade");
  return Array.isArray(rows) ? rows : [];
}
async function loadFarmIncompatY() {
  const rows = await sbFetch("farm_incompat_y?select=*&order=substancia_a");
  return Array.isArray(rows) ? rows : [];
}
async function upsertFarmInteracaoRemote(row, user) {
  if (!USE_SUPABASE) return null;
  const body = { ...row, usuario: user?.name || null, updated_at: nowISO() };
  if (row.id) { await sbFetch(`farm_interacoes?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify(body) }); return null; }
  delete body.id;
  return await sbFetch("farm_interacoes", { method: "POST", headers: { "Prefer": "return=representation" }, body: JSON.stringify(body) });
}
async function deleteFarmInteracaoRemote(id) { if (USE_SUPABASE) await sbFetch(`farm_interacoes?id=eq.${id}`, { method: "DELETE" }); }
async function upsertFarmIncompatRemote(row, user) {
  if (!USE_SUPABASE) return null;
  const body = { ...row, usuario: user?.name || null, updated_at: nowISO() };
  if (row.id) { await sbFetch(`farm_incompat_y?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify(body) }); return null; }
  delete body.id;
  return await sbFetch("farm_incompat_y", { method: "POST", headers: { "Prefer": "return=representation" }, body: JSON.stringify(body) });
}
async function deleteFarmIncompatRemote(id) { if (USE_SUPABASE) await sbFetch(`farm_incompat_y?id=eq.${id}`, { method: "DELETE" }); }
// Formata uma data ISO (YYYY-MM-DD) para dd/mm/aaaa, sem escorregar de fuso
function fmtDataBR(iso) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}
// Situação de validade de um lote em relação a hoje
function farmValidadeInfo(validade) {
  if (!validade) return { status: "sem", dias: null };
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const v = new Date(validade + "T00:00:00");
  const dias = Math.round((v - hoje) / 86400000);
  if (dias < 0) return { status: "vencido", dias };
  if (dias <= FARM_VENC_DIAS) return { status: "vencendo", dias };
  return { status: "ok", dias };
}

// ── Farmácia clínica (motor de alertas, Fase 1) ──
const FARM_GRAV = {
  alta:  { label: "Alta",  cor: "#f43f5e", ordem: 0 },
  media: { label: "Média", cor: "#d97706", ordem: 1 },
  baixa: { label: "Baixa", cor: "#3b82f6", ordem: 2 },
};
const PS_FREQUENCIAS = [
  { label: "1x/dia", dia: 1 }, { label: "12/12h (2x)", dia: 2 }, { label: "8/8h (3x)", dia: 3 },
  { label: "6/6h (4x)", dia: 4 }, { label: "4/4h (6x)", dia: 6 }, { label: "Dose única", dia: 0 },
  { label: "Se necessário (SN)", dia: null },
];
const PS_DOSE_UNID = ["mg", "mL", "g", "mcg", "UI", "comprimido", "cápsula", "ampola", "gota"];
const freqDia = label => { const f = PS_FREQUENCIAS.find(x => x.label === label); return f ? f.dia : null; };

// Normaliza texto (minúsculas, sem acento) para comparar alergias
const normTxt = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
// Grupos de reatividade cruzada (curados — revisar com a equipe de farmácia)
const FARM_CROSS = [
  { grupo: "Betalactâmicos (penicilinas/cefalosporinas)", gatilhos: ["penicilina", "betalactamico", "beta-lactamico", "beta lactamico", "amoxicilina", "ampicilina", "cefalospor"], diretos: ["penicilina", "amoxicilina", "ampicilina", "oxacilina", "piperacilina", "benzilpenicilina"], cruzados: ["cefalexina", "cefazolina", "ceftriaxona", "cefepima", "meropenem", "imipenem"] },
  { grupo: "Sulfonamidas", gatilhos: ["sulfa", "sulfonamida", "sulfametoxazol", "bactrim"], diretos: ["sulfametoxazol", "sulfadiazina"], cruzados: [] },
  { grupo: "AINEs", gatilhos: ["aine", "antiinflamatorio", "anti-inflamatorio", "aas", "acido acetilsalicilico", "ibuprofeno", "diclofenaco", "cetoprofeno", "naproxeno"], diretos: ["ibuprofeno", "diclofenaco", "cetoprofeno", "naproxeno", "tenoxicam", "acido acetilsalicilico"], cruzados: [] },
];
// Divide o texto de alergias em termos normalizados (>= 3 letras)
function parseAlergias(txt) {
  return normTxt(txt).split(/[,;/]| e |\n|\+/).map(s => s.trim()).filter(s => s.length >= 3);
}
// Confronta um medicamento com as alergias do paciente → { match: "direta"|"cruzada"|null }
function checarAlergia(med, termos) {
  if (!med || !termos || !termos.length) return { match: null };
  const paTxt = normTxt([med.principio_ativo, med.nome].join(" "));
  for (const t of termos) {
    if (paTxt.includes(t)) return { match: "direta", termo: t };
    for (const g of FARM_CROSS) {
      if (!g.gatilhos.some(x => t.includes(x) || x.includes(t))) continue;
      if (g.diretos.some(d => paTxt.includes(d))) return { match: "direta", termo: t, grupo: g.grupo };
      if (g.cruzados.some(c => paTxt.includes(c))) return { match: "cruzada", termo: t, grupo: g.grupo };
    }
  }
  return { match: null };
}

// Analisa a lista de itens da prescrição contra a base clínica + contexto do paciente.
// APOIO À DECISÃO — não substitui o julgamento do farmacêutico. Base sujeita a validação local.
function analisarPrescricaoClinica(itens, ctx, medById, interacoes = [], incompatY = []) {
  const alertas = [];
  const push = (tipo, gravidade, titulo, detalhe, refs) => alertas.push({ tipo, gravidade, titulo, detalhe, itens: refs || [] });
  const comMed = (itens || []).filter(i => i.medicamento_id && medById[i.medicamento_id]);
  const matchSub = (med, sub) => { const s = normTxt(sub); return !!s && normTxt([med.principio_ativo, med.nome, med.grupo_terapeutico].join(" ")).includes(s); };
  const idade = ctx && ctx.idade !== "" && ctx.idade != null ? Number(ctx.idade) : null;
  const termosAlergia = parseAlergias(ctx?.alergias);

  // 1) Duplicidade — mesmo princípio ativo OU mesmo grupo terapêutico
  const porPA = {}, porGrupo = {};
  comMed.forEach(i => {
    const med = medById[i.medicamento_id];
    const pa = (med.principio_ativo || "").trim().toLowerCase();
    if (pa) (porPA[pa] = porPA[pa] || []).push(i.medicamento_nome);
    const g = (med.grupo_terapeutico || "").trim();
    if (g) (porGrupo[g] = porGrupo[g] || []).push({ nome: i.medicamento_nome, pa });
  });
  Object.values(porPA).forEach(nomes => { if (nomes.length > 1) push("duplicidade", "media", "Duplicidade — mesmo princípio ativo", `${[...new Set(nomes)].join(", ")} têm o mesmo princípio ativo.`, [...new Set(nomes)]); });
  Object.entries(porGrupo).forEach(([g, arr]) => { const pas = new Set(arr.map(a => a.pa)); if (arr.length > 1 && pas.size > 1) push("duplicidade", "baixa", `Duplicidade terapêutica — ${g}`, `${[...new Set(arr.map(a => a.nome))].join(", ")} são do mesmo grupo (${g}). Revisar se a associação é intencional.`, [...new Set(arr.map(a => a.nome))]); });

  comMed.forEach(i => {
    const med = medById[i.medicamento_id];
    const nome = i.medicamento_nome;
    // 2) Dose máxima diária (quando a unidade prescrita bate com a da base)
    if (med.dose_maxima_dia && i.dose_valor && i.frequencia_dia && med.dose_maxima_unid && (i.dose_unidade || "").toLowerCase() === (med.dose_maxima_unid || "").toLowerCase()) {
      const diaria = Number(i.dose_valor) * Number(i.frequencia_dia);
      if (diaria > Number(med.dose_maxima_dia)) push("dose_maxima", "alta", "Dose acima da máxima diária", `${nome}: ${farmFmtQtd(diaria)} ${med.dose_maxima_unid}/dia prescritos — máximo ${farmFmtQtd(med.dose_maxima_dia)} ${med.dose_maxima_unid}/dia.`, [nome]);
    }
    // 3) Tempo de tratamento
    if (med.duracao_maxima_dias && i.duracao_dias && Number(i.duracao_dias) > Number(med.duracao_maxima_dias)) push("tempo_tratamento", "media", "Tempo de tratamento acima do recomendado", `${nome}: ${farmFmtQtd(i.duracao_dias)} dias — recomendado até ${med.duracao_maxima_dias} dias.`, [nome]);
    // 4) Sonda — não triturar
    if (ctx?.em_sonda && med.nao_triturar) push("sonda", "alta", "Contraindicado por sonda (não triturar)", `${nome}: ${med.obs_clinica || "não deve ser triturado/administrado por sonda."}`, [nome]);
    // 5) Idoso (Beers)
    if (idade != null && idade >= 65 && med.inapropriado_idoso) push("idoso", "media", "Potencialmente inapropriado no idoso (Beers)", `${nome}: ${med.motivo_idoso || "potencialmente inapropriado em idosos."}`, [nome]);
    // 6) Pediátrico
    const limPed = med.idade_pediatrica != null ? Number(med.idade_pediatrica) : 12;
    if (idade != null && med.inapropriado_pediatrico && idade < limPed) push("pediatrico", "alta", `Inapropriado para menor de ${limPed} anos`, `${nome}: ${med.motivo_pediatrico || "inapropriado nesta faixa etária."}`, [nome]);
    // 7) Alergia declarada / reatividade cruzada
    const al = checarAlergia(med, termosAlergia);
    if (al.match === "direta") push("alergia", "alta", "Alergia declarada ao medicamento", `${nome}: paciente alérgico a "${al.termo}"${al.grupo ? ` (${al.grupo})` : ""}. NÃO administrar sem reavaliação médica.`, [nome]);
    else if (al.match === "cruzada") push("alergia", "alta", "Possível reatividade cruzada com alergia", `${nome}: paciente alérgico a "${al.termo}" — reatividade cruzada com ${al.grupo}. Avaliar o risco antes de administrar.`, [nome]);
  });

  // 8) Interações medicamentosas (pares)
  if (interacoes && interacoes.length) {
    for (let x = 0; x < comMed.length; x++) for (let y = x + 1; y < comMed.length; y++) {
      const a = medById[comMed[x].medicamento_id], b = medById[comMed[y].medicamento_id];
      for (const it of interacoes) {
        const hit = (matchSub(a, it.substancia_a) && matchSub(b, it.substancia_b)) || (matchSub(a, it.substancia_b) && matchSub(b, it.substancia_a));
        if (hit) {
          const grav = it.gravidade === "grave" ? "alta" : it.gravidade === "leve" ? "baixa" : "media";
          push("interacao", grav, `Interação ${it.gravidade || "medicamentosa"}`, `${comMed[x].medicamento_nome} + ${comMed[y].medicamento_nome}: ${it.descricao || "interação medicamentosa"}${it.conduta ? " — " + it.conduta : ""}.`, [comMed[x].medicamento_nome, comMed[y].medicamento_nome]);
          break; // um alerta por par
        }
      }
    }
  }
  // 9) Incompatibilidade em Y (ambos por via IV)
  if (incompatY && incompatY.length) {
    const iv = comMed.filter(i => (i.via || "").toUpperCase() === "IV");
    for (let x = 0; x < iv.length; x++) for (let y = x + 1; y < iv.length; y++) {
      const a = medById[iv[x].medicamento_id], b = medById[iv[y].medicamento_id];
      for (const it of incompatY) {
        const hit = (matchSub(a, it.substancia_a) && matchSub(b, it.substancia_b)) || (matchSub(a, it.substancia_b) && matchSub(b, it.substancia_a));
        if (hit) { push("incompat_y", "alta", "Incompatibilidade em Y (IV)", `${iv[x].medicamento_nome} + ${iv[y].medicamento_nome}: ${it.descricao || "incompatíveis na mesma linha"}. Não infundir juntos.`, [iv[x].medicamento_nome, iv[y].medicamento_nome]); break; }
      }
    }
  }

  return alertas.sort((a, b) => FARM_GRAV[a.gravidade].ordem - FARM_GRAV[b.gravidade].ordem);
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
// PATCH com captura de erro (o sbFetch engole !ok) — usado no contexto clínico
async function patchPsAtendimentoDireto(id, campos) {
  if (!USE_SUPABASE) return { ok: false, erro: "Supabase indisponível." };
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/ps_atendimentos?id=eq.${id}`, {
      method: "PATCH",
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${AUTH_TOKEN || SUPABASE_KEY}`, "Content-Type": "application/json", "Prefer": "return=representation" },
      body: JSON.stringify({ ...campos, updated_at: nowISO() }),
    });
    if (!res.ok) { const b = await res.json().catch(() => null); return { ok: false, erro: b?.message || b?.hint || `Erro ${res.status}` }; }
    const rows = await res.json().catch(() => null);
    return { ok: true, row: Array.isArray(rows) ? rows[0] : null };
  } catch (e) { return { ok: false, erro: String(e?.message || e) }; }
}
async function addPsSinalRemote(sinal, user) {
  if (!USE_SUPABASE) return;
  await sbFetch("ps_sinais", { method: "POST", body: JSON.stringify({ ...sinal, usuario: user?.name || null }) });
}
async function loadPsSinais(atendimentoId) {
  const rows = await sbFetch(`ps_sinais?atendimento_id=eq.${atendimentoId}&select=*&order=aferido_em.desc&limit=5`);
  return Array.isArray(rows) ? rows : [];
}
// Registros do atendimento (evolução médica, prescrição, exames)
const PS_EXAME_CATEGORIAS = { laboratorial: "Laboratorial", imagem: "Imagem", outro: "Outro" };
async function loadPsRegistros(atendimentoId) {
  const rows = await sbFetch(`ps_registros?atendimento_id=eq.${atendimentoId}&select=*&order=criado_em.desc`);
  return Array.isArray(rows) ? rows : [];
}
async function loadPsExamesPendentes(ids) {
  if (!ids.length) return [];
  const rows = await sbFetch(`ps_registros?atendimento_id=in.(${ids.join(",")})&tipo=eq.exame&status=neq.visto&select=atendimento_id,status`);
  return Array.isArray(rows) ? rows : [];
}
async function addPsRegistroRemote(reg, user) {
  if (!USE_SUPABASE) return null;
  return await sbFetch("ps_registros", { method: "POST", headers: { "Prefer": "return=representation" }, body: JSON.stringify({ ...reg, usuario: user?.name || null }) });
}
async function updatePsRegistroRemote(id, campos) {
  if (!USE_SUPABASE) return;
  await sbFetch(`ps_registros?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(campos) });
}
// Vias de administração da prescrição
const PS_VIAS = ["VO", "IV", "IM", "SC", "SL", "Inalatória", "Tópica", "Retal", "Ocular", "Nasal", "Sonda"];
// Itens estruturados da prescrição (Farmácia Fase B)
async function addPsPrescricaoItens(itens, user) {
  if (!USE_SUPABASE || !itens.length) return null;
  const body = itens.map(it => ({ ...it, usuario: user?.name || null }));
  return await sbFetch("ps_prescricao_itens", { method: "POST", headers: { "Prefer": "return=representation" }, body: JSON.stringify(body) });
}
async function loadPsPrescricaoItens(atendimentoId) {
  const rows = await sbFetch(`ps_prescricao_itens?atendimento_id=eq.${atendimentoId}&select=*&order=created_at`);
  return Array.isArray(rows) ? rows : [];
}
async function loadPsPrescricaoItensByAtendimentos(ids) {
  if (!ids.length) return [];
  const rows = await sbFetch(`ps_prescricao_itens?atendimento_id=in.(${ids.join(",")})&select=*&order=created_at`);
  return Array.isArray(rows) ? rows : [];
}
// Saídas (dispensações) já registradas para calcular o quanto de cada item foi entregue
async function loadFarmSaidasByAtendimentos(ids) {
  if (!ids.length) return [];
  const rows = await sbFetch(`farm_movimentos?atendimento_id=in.(${ids.join(",")})&tipo=eq.saida&select=atendimento_id,prescricao_item_id,quantidade`);
  return Array.isArray(rows) ? rows : [];
}
async function loadFarmSaidasByAtendimento(atendimentoId) {
  const rows = await sbFetch(`farm_movimentos?atendimento_id=eq.${atendimentoId}&tipo=eq.saida&select=*&order=created_at.desc`);
  return Array.isArray(rows) ? rows : [];
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
  const psRows = Array.isArray(ps) ? ps : [];
  let registrosPS = [];
  if (psRows.length) {
    const ids = psRows.map(a => a.id).join(",");
    const regs = await sbFetch(`ps_registros?atendimento_id=in.(${ids})&select=*&order=criado_em.desc`).catch(() => []);
    registrosPS = Array.isArray(regs) ? regs : [];
  }
  return {
    cadastro: Array.isArray(cad) && cad[0] ? cad[0] : null,
    ps: psRows, leitoAtual: Array.isArray(leitoAtual) ? leitoAtual : [],
    saidas: Array.isArray(saidas) ? saidas : [], scih: Array.isArray(scih) ? scih : [],
    evolucoes: Array.isArray(evolucoes) ? evolucoes : [],
    registrosPS,
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
  (d.registrosPS || []).forEach(r => {
    if (r.tipo === "evolucao") push(r.criado_em, "PS", "#3b82f6", "Evolução médica no PS", r.texto);
    else if (r.tipo === "prescricao") push(r.criado_em, "PS", "#6366f1", "Prescrição no PS", r.texto);
    else if (r.tipo === "exame") {
      push(r.criado_em, "PS", "#d97706", `Exame solicitado: ${r.texto}`, null);
      if (r.resultado_em) push(r.resultado_em, "PS", "#d97706", `Resultado de exame: ${r.texto}`, r.resultado || null);
    }
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
  const [leitos, setLeitos] = useState([]);
  const [obitosInternacao, setObitosInternacao] = useState(0);
  const [novo, setNovo] = useState({ iniciais: "", prontuario: "", queixa: "" });
  const [triando, setTriando] = useState(null);
  const [reavaliando, setReavaliando] = useState(null);
  const [desfechando, setDesfechando] = useState(null);
  const [atendendo, setAtendendo] = useState(null);
  const [examesPend, setExamesPend] = useState({});
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);

  function refresh() {
    if (!USE_SUPABASE) return;
    loadPsAtendimentos().then(r => {
      setFila(r);
      const ids = r.filter(p => p.status === "em_atendimento").map(p => p.id);
      loadPsExamesPendentes(ids).then(list => {
        const m = {};
        list.forEach(x => { m[x.atendimento_id] = m[x.atendimento_id] || { aguardando: 0, prontos: 0 }; if (x.status === "resultado_disponivel") m[x.atendimento_id].prontos++; else m[x.atendimento_id].aguardando++; });
        setExamesPend(m);
      });
    });
    loadPsFinalizadosHoje().then(setFinalizados);
    loadSetoresFromSupabase().then(r => r && setSetores(r));
    loadLeitosFromSupabase().then(r => r && setLeitos(r));
    // óbitos ocorridos APÓS internação, hoje (fonte: leitos_saidas)
    const hoje = todayStr();
    sbFetch(`leitos_saidas?desfecho=eq.obito&data_alta=eq.${hoje}&select=id`).then(r => setObitosInternacao(Array.isArray(r) ? r.length : 0));
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
  async function triar(p, classificacao, vitais, sugerida) {
    await updatePsAtendimentoRemote(p.id, { classificacao, triagem_em: nowISO(), status: "aguardando_atendimento", ...(vitais || {}) });
    await addPsSinalRemote({ atendimento_id: p.id, ...(vitais || {}), classificacao_sugerida: sugerida || null, classificacao_escolhida: classificacao, aferido_em: nowISO() }, currentUser);
    addAuditLog(currentUser, "PS: triagem", `${p.iniciais} → ${classificacao}`, {});
    setTriando(null); setTimeout(refresh, 300);
  }
  async function reavaliar(p, classificacao, vitais, sugerida) {
    await updatePsAtendimentoRemote(p.id, { classificacao, ...(vitais || {}) });
    await addPsSinalRemote({ atendimento_id: p.id, ...(vitais || {}), classificacao_sugerida: sugerida || null, classificacao_escolhida: classificacao, aferido_em: nowISO() }, currentUser);
    addAuditLog(currentUser, "PS: reavaliação", `${p.iniciais} → ${classificacao}`, {});
    setReavaliando(null); setTimeout(refresh, 300);
  }
  async function iniciarAtendimento(p) {
    await updatePsAtendimentoRemote(p.id, { atendimento_em: nowISO(), status: "em_atendimento" });
    addAuditLog(currentUser, "PS: inicio atendimento", p.iniciais, {});
    setTimeout(refresh, 300);
  }
  async function darDesfecho(p, d) {
    const { desfecho, setorDestino, observacao, medico, leito } = d;
    await updatePsAtendimentoRemote(p.id, { desfecho, desfecho_em: nowISO(), setor_destino: setorDestino || null, observacao: observacao || null, medico: medico || null, status: "finalizado" });
    if (desfecho === "internacao") {
      if (leito) {
        // Alocação direta: interna o paciente no leito escolhido e o encaminha
        await upsertLeitoRemote({
          identificacao: leito.identificacao, status: "ocupado",
          iniciais: p.iniciais, prontuario: p.prontuario || null, motivo: p.queixa || null,
          cid: null, dias_previstos: null, data_internacao: todayStr(), entrada_em: nowISO(),
          solic_em: null, disp_em: null, pronto_em: null, interdicao_motivo: null,
        }, currentUser);
        addAuditLog(currentUser, "PS: internar em leito", `${p.iniciais} → ${leito.identificacao}`, {});
      } else if (setorDestino) {
        // Sem leito agora → fila de espera do setor
        await addSolicitacaoRemote({ iniciais: p.iniciais, setor_origem: "Pronto-Socorro", setor_destino: setorDestino, hora_pedido: nowISO(), status: "aguardando" }, currentUser);
      }
    }
    addAuditLog(currentUser, "PS: desfecho", `${p.iniciais} → ${desfecho}${medico ? " · Dr(a). " + medico : ""}${leito ? " · leito " + leito.identificacao : setorDestino ? " (" + setorDestino + ")" : ""}`, {});
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

      {/* INDICADORES DE TRIAGEM DO DIA */}
      {(() => {
        const doDia = fila.concat(finalizados).filter(p => p.classificacao);
        if (doDia.length === 0) return null;
        const dist = Object.keys(MANCHESTER).map(k => {
          const lista = doDia.filter(p => p.classificacao === k);
          const estourados = lista.filter(p => {
            const alvo = MANCHESTER[k].alvoMin;
            if (!alvo || !p.triagem_em) return false;
            const fimEspera = p.atendimento_em || (p.status === "aguardando_atendimento" ? agora : null);
            return fimEspera ? diffMin(p.triagem_em, fimEspera) > alvo : false;
          }).length;
          return { k, n: lista.length, estourados };
        });
        const total = doDia.length;
        const totalEst = dist.reduce((a, d) => a + d.estourados, 0);
        const noAlvo = ((total - totalEst) / total) * 100;
        const th = { textAlign: "left", padding: "7px 14px", color: "var(--text-muted)", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", borderBottom: "1px solid var(--border)" };
        const td = { padding: "7px 14px", fontSize: 12.5, color: "var(--text-2)", borderBottom: "1px solid var(--border)" };
        const num = { ...td, fontFamily: "JetBrains Mono, monospace", textAlign: "right", color: "var(--text)" };
        return (
          <div style={{ marginBottom: "1.25rem" }}>
            <div style={secLbl}>Triagem do dia</div>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={th}>Classificação</th>
                  <th style={{ ...th, textAlign: "right" }}>Atendimentos</th>
                  <th style={{ ...th, textAlign: "right" }}>%</th>
                  <th style={{ ...th, textAlign: "right" }}>Fora do alvo</th>
                </tr></thead>
                <tbody>
                  {dist.map(({ k, n, estourados }) => {
                    const m = MANCHESTER[k];
                    return (
                      <tr key={k}>
                        <td style={td}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 99, background: m.cor, marginRight: 9, verticalAlign: "middle" }} />{m.label}</td>
                        <td style={num}>{n}</td>
                        <td style={{ ...num, color: "var(--text-3)" }}>{total > 0 ? Math.round((n / total) * 100) : 0}%</td>
                        <td style={{ ...num, color: estourados > 0 ? "var(--text)" : "var(--text-muted)" }}>{estourados || "—"}</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td style={{ ...td, borderBottom: "none", fontWeight: 700, color: "var(--text)" }}>Dentro do tempo-alvo</td>
                    <td style={{ ...num, borderBottom: "none" }}>{total - totalEst}/{total}</td>
                    <td style={{ ...num, borderBottom: "none", fontWeight: 700 }}>{noAlvo.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%</td>
                    <td style={{ ...num, borderBottom: "none", color: "var(--text-muted)" }}>{totalEst || "—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* DESFECHOS DE HOJE */}
      {finalizados.length > 0 && (() => {
        const th = { textAlign: "left", padding: "7px 14px", color: "var(--text-muted)", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", borderBottom: "1px solid var(--border)" };
        const td = { padding: "7px 14px", fontSize: 12.5, color: "var(--text-2)", borderBottom: "1px solid var(--border)" };
        const num = { ...td, fontFamily: "JetBrains Mono, monospace", textAlign: "right", color: "var(--text)" };
        const cont = Object.keys(PS_DESFECHOS).map(k => ({ k, n: finalizados.filter(p => p.desfecho === k).length }));
        // evasões agrupadas por médico
        const evasoes = finalizados.filter(p => p.desfecho === "evasao");
        const porMedico = {};
        evasoes.forEach(p => { const m = p.medico || "Sem médico registrado"; porMedico[m] = (porMedico[m] || 0) + 1; });
        const medicosOrd = Object.entries(porMedico).sort((a, b) => b[1] - a[1]);
        return (
          <div style={{ marginBottom: "1.25rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
            <div>
              <div style={secLbl}>Desfechos de hoje</div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={th}>Desfecho</th><th style={{ ...th, textAlign: "right" }}>Qtd.</th></tr></thead>
                  <tbody>
                    {cont.map(({ k, n }) => (
                      <tr key={k}><td style={td}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 99, background: PS_DESFECHOS[k].cor, marginRight: 9, verticalAlign: "middle" }} />{PS_DESFECHOS[k].label}{k === "obito" ? " (no PS, antes de internar)" : ""}</td><td style={num}>{n}</td></tr>
                    ))}
                    <tr><td style={{ ...td, borderBottom: "none" }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 99, background: "#f43f5e", marginRight: 9, verticalAlign: "middle" }} />Óbito após internação</td><td style={{ ...num, borderBottom: "none" }}>{obitosInternacao}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
            {medicosOrd.length > 0 && (
              <div>
                <div style={secLbl}>Evasões por médico (hoje)</div>
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr><th style={th}>Médico</th><th style={{ ...th, textAlign: "right" }}>Evasões</th></tr></thead>
                    <tbody>{medicosOrd.map(([m, n]) => <tr key={m}><td style={td}>{m}</td><td style={num}>{n}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })()}

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
            {canEdit && (() => { const min = diffMin(p.triagem_em, agora); const alvo = MANCHESTER[p.classificacao]?.alvoMin; const estourou = alvo != null && alvo > 0 && min != null && min > alvo;
              return <button onClick={() => setReavaliando(p)} style={btnLeito(estourou ? "#f97316" : "var(--text-3)")}>{estourou ? "Reavaliar (tempo estourado)" : "Reavaliar"}</button>; })()}
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
            {canEdit && <button onClick={() => setAtendendo(p)} style={btnLeito("#3b82f6")}>Abrir atendimento</button>}
            {canEdit && <button onClick={() => setDesfechando(p)} style={btnLeito("#22d3ee")}>Desfecho</button>}
            {(examesPend[p.id]?.aguardando > 0 || examesPend[p.id]?.prontos > 0) && (
              <div style={{ width: "100%", display: "flex", gap: 8, fontSize: 11, fontWeight: 700 }}>
                {examesPend[p.id]?.aguardando > 0 && <span style={{ color: "#d97706" }}>{examesPend[p.id].aguardando} exame(s) aguardando resultado</span>}
                {examesPend[p.id]?.prontos > 0 && <span style={{ color: "#3b82f6" }}>{examesPend[p.id].prontos} resultado(s) disponível(is)</span>}
              </div>
            )}
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

      {/* MODAL TRIAGEM / REAVALIAÇÃO */}
      {triando && <TriagemModal paciente={triando} onClose={() => setTriando(null)} onTriar={(cls, vitais, sug) => triar(triando, cls, vitais, sug)} />}
      {reavaliando && <TriagemModal paciente={reavaliando} reavaliacao onClose={() => setReavaliando(null)} onTriar={(cls, vitais, sug) => reavaliar(reavaliando, cls, vitais, sug)} />}

      {/* MODAL DESFECHO */}
      {desfechando && <PsDesfechoModal paciente={desfechando} setores={setores} leitos={leitos} onClose={() => setDesfechando(null)} onSave={darDesfecho} />}

      {/* PAINEL DO ATENDIMENTO (evolução, prescrição, exames) */}
      {atendendo && <AtendimentoModal paciente={atendendo} currentUser={currentUser} onClose={() => { setAtendendo(null); refresh(); }} onChanged={() => {}} />}
    </div>
  );
}

// Modal de desfecho do PS (alta/internação/transferência/evasão/óbito)
function PsDesfechoModal({ paciente, setores, leitos = [], onClose, onSave }) {
  const [desfecho, setDesfecho] = useState("");
  const [setorDestino, setSetorDestino] = useState("");
  const [medico, setMedico] = useState("");
  const [obs, setObs] = useState("");
  const [leitoSel, setLeitoSel] = useState("fila"); // "fila" | identificacao do leito
  const [busy, setBusy] = useState(false);
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 11px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  const lbl = { fontSize: 11, fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 5 };

  // Leitos vagos, com os do setor escolhido primeiro
  const livres = leitos.filter(l => l.status === "livre")
    .sort((a, b) => ((b.setor === setorDestino) - (a.setor === setorDestino)) || (a.identificacao || "").localeCompare(b.identificacao || "", "pt-BR", { numeric: true }));

  async function salvar() {
    if (!desfecho) { alert("Escolha o desfecho."); return; }
    if (desfecho === "internacao" && !setorDestino) { alert("Escolha o setor de destino da internação."); return; }
    const leitoObj = desfecho === "internacao" && leitoSel !== "fila" ? livres.find(l => l.identificacao === leitoSel) : null;
    if (desfecho === "internacao" && leitoObj) {
      if (!confirm(`Internar ${paciente.iniciais} diretamente no leito ${leitoObj.identificacao}${leitoObj.setor ? ` (${leitoObj.setor})` : ""}?`)) return;
    }
    setBusy(true);
    await onSave(paciente, { desfecho, setorDestino, observacao: obs.trim(), medico: medico.trim(), leito: leitoObj });
    setBusy(false);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 500, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Desfecho — {paciente.iniciais}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {Object.entries(PS_DESFECHOS).map(([k, v]) => (
            <button key={k} onClick={() => setDesfecho(k)} style={{ background: desfecho === k ? "var(--surface-3)" : "transparent", color: desfecho === k ? v.cor : "var(--text-3)", border: `1px solid ${desfecho === k ? v.cor : "var(--border-2)"}`, borderRadius: 7, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{v.label}</button>
          ))}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Médico responsável{desfecho === "evasao" ? " (evasão será contabilizada por médico)" : ""}</label>
          <input value={medico} onChange={e => setMedico(e.target.value)} placeholder="Sobrenome do médico" style={inp} />
        </div>

        {desfecho === "internacao" && (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Setor de destino *</label>
              <select value={setorDestino} onChange={e => { setSetorDestino(e.target.value); setLeitoSel("fila"); }} style={inp}>
                <option value="">Escolha o setor…</option>
                {setores.map(s => <option key={s.nome} value={s.nome}>{s.nome}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Encaminhamento</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <button onClick={() => setLeitoSel("fila")} style={{ textAlign: "left", background: leitoSel === "fila" ? "var(--surface-3)" : "transparent", border: `1px solid ${leitoSel === "fila" ? "#22d3ee" : "var(--border)"}`, borderRadius: 7, padding: "9px 12px", cursor: "pointer", color: "var(--text-2)", fontSize: 12.5 }}>
                  Enviar para a fila de espera por leito {setorDestino ? `(${setorDestino})` : ""}
                </button>
                {livres.length === 0 && <div style={{ fontSize: 11.5, color: "var(--text-muted)", padding: "2px 2px" }}>Nenhum leito livre no momento — o paciente irá para a fila de espera.</div>}
                {livres.map(l => (
                  <button key={l.identificacao} onClick={() => setLeitoSel(l.identificacao)} style={{ textAlign: "left", background: leitoSel === l.identificacao ? "var(--surface-3)" : "transparent", border: `1px solid ${leitoSel === l.identificacao ? "#34d399" : "var(--border)"}`, borderRadius: 7, padding: "9px 12px", cursor: "pointer", fontSize: 12.5, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: "#34d399", flexShrink: 0 }} />
                    <strong style={{ color: "var(--text)" }}>Leito {l.identificacao}</strong>
                    {l.setor && <span style={{ color: l.setor === setorDestino ? "#34d399" : "var(--text-muted)" }}>{l.setor}{l.setor === setorDestino ? " · mesmo setor" : ""}</span>}
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>internar aqui →</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>Observação (opcional)</label>
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

// Painel do atendimento médico no PS: evolução, prescrição e exames
function AtendimentoModal({ paciente, currentUser, onClose, onChanged }) {
  const [registros, setRegistros] = useState([]);
  const [aba, setAba] = useState("evolucao"); // evolucao | prescricao | exames
  const [texto, setTexto] = useState("");
  const [gravando, setGravando] = useState(false);
  const [exForm, setExForm] = useState({ categoria: "laboratorial", nome: "" });
  const [resultadoDe, setResultadoDe] = useState(null); // { id, texto }
  const [busy, setBusy] = useState(false);
  // Prescrição estruturada (Farmácia Fase B) + farmácia clínica (Fase 1)
  const [catalogo, setCatalogo] = useState([]);
  const [interacoes, setInteracoes] = useState([]);
  const [incompatY, setIncompatY] = useState([]);
  const [presItens, setPresItens] = useState([]);            // itens sendo montados
  const [presForm, setPresForm] = useState({ medId: "", dose_valor: "", dose_unidade: "mg", freqLabel: "8/8h (3x)", via: "VO", duracao: "", quantidade: "" });
  const [presObs, setPresObs] = useState("");
  const [presItensSalvos, setPresItensSalvos] = useState([]); // itens já assinados neste atendimento
  const [saidas, setSaidas] = useState([]);                   // dispensações deste atendimento
  const [ctx, setCtx] = useState({ idade: paciente.idade ?? "", peso: paciente.peso ?? "", clearance_renal: paciente.clearance_renal ?? "", funcao_hepatica: paciente.funcao_hepatica ?? "", alergias: paciente.alergias ?? "", em_sonda: !!paciente.em_sonda, gestante: !!paciente.gestante });
  const [ctxAberto, setCtxAberto] = useState(false);
  const [ctxBusy, setCtxBusy] = useState(false);
  const [ctxMsg, setCtxMsg] = useState("");
  const catById = {}; catalogo.forEach(m => catById[m.id] = m);
  const recRef = useRef(null);
  const suportaVoz = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 11px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  const carregarRegistros = () => loadPsRegistros(paciente.id).then(setRegistros);
  const carregarPrescricao = () => { loadPsPrescricaoItens(paciente.id).then(setPresItensSalvos); loadFarmSaidasByAtendimento(paciente.id).then(setSaidas); };
  useEffect(() => { carregarRegistros(); }, []);
  useEffect(() => { loadFarmMedicamentos().then(setCatalogo); loadFarmInteracoes().then(setInteracoes); loadFarmIncompatY().then(setIncompatY); carregarPrescricao(); }, []);
  useEffect(() => { setTexto(""); if (gravando) { recRef.current?.stop(); setGravando(false); } }, [aba]);

  function toggleVoz() {
    if (gravando) { recRef.current?.stop(); setGravando(false); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "pt-BR"; rec.continuous = true; rec.interimResults = false;
    rec.onresult = ev => { let novo = ""; for (let i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) novo += ev.results[i][0].transcript; if (novo) setTexto(t => (t ? t.trimEnd() + " " : "") + novo.trim()); };
    rec.onend = () => setGravando(false); rec.onerror = () => setGravando(false);
    recRef.current = rec; rec.start(); setGravando(true);
  }
  async function salvarTexto(tipo) {
    if (!texto.trim()) { alert("Escreva (ou dite) o texto."); return; }
    if (!confirm(`Salvar esta ${tipo === "evolucao" ? "evolução" : "prescrição"}? Ela NÃO poderá ser editada nem apagada depois (registro clínico).`)) return;
    setBusy(true);
    if (gravando) { recRef.current?.stop(); setGravando(false); }
    await addPsRegistroRemote({ atendimento_id: paciente.id, tipo, texto: texto.trim(), criado_em: nowISO() }, currentUser);
    addAuditLog(currentUser, `PS: ${tipo === "evolucao" ? "evolução" : "prescrição"}`, paciente.iniciais, {});
    setTexto(""); setBusy(false); carregarRegistros(); onChanged?.();
  }
  async function salvarContexto() {
    setCtxBusy(true); setCtxMsg("");
    const payload = { idade: ctx.idade === "" ? null : Number(ctx.idade), peso: ctx.peso === "" ? null : Number(ctx.peso), clearance_renal: ctx.clearance_renal === "" ? null : Number(ctx.clearance_renal), funcao_hepatica: ctx.funcao_hepatica || null, alergias: ctx.alergias?.trim() || null, em_sonda: !!ctx.em_sonda, gestante: !!ctx.gestante };
    const r = await patchPsAtendimentoDireto(paciente.id, payload);
    setCtxBusy(false);
    if (!r.ok) { setCtxMsg("erro: " + (r.erro || "falha ao salvar")); return; }
    Object.assign(paciente, payload);           // reflete no episódio aberto
    setCtxMsg("✓ contexto salvo");
    setTimeout(() => setCtxMsg(""), 3000);
    onChanged?.();
  }
  function addItemPrescricao() {
    const med = catalogo.find(m => String(m.id) === String(presForm.medId));
    if (!med) { alert("Escolha um medicamento do catálogo."); return; }
    // Bloqueio por alergia / reatividade cruzada (permite override consciente)
    const al = checarAlergia(med, parseAlergias(ctx.alergias));
    if (al.match === "direta" && !confirm(`⚠ ALERGIA DECLARADA\n\nO paciente é alérgico a "${al.termo}"${al.grupo ? ` (${al.grupo})` : ""}.\n${med.nome} é CONTRAINDICADO.\n\nPrescrever mesmo assim, sob responsabilidade do prescritor?`)) return;
    if (al.match === "cruzada" && !confirm(`⚠ REATIVIDADE CRUZADA\n\nAlergia a "${al.termo}" pode reagir com ${med.nome} (${al.grupo}).\n\nPrescrever mesmo assim?`)) return;
    const fdia = freqDia(presForm.freqLabel);
    const doseTxt = [presForm.dose_valor && `${presForm.dose_valor} ${presForm.dose_unidade}`, presForm.freqLabel, presForm.duracao && `por ${presForm.duracao} dia(s)`].filter(Boolean).join(" · ");
    setPresItens(p => [...p, { medicamento_id: med.id, medicamento_nome: med.nome, unidade: med.unidade || null, dose: doseTxt || null, dose_valor: presForm.dose_valor ? Number(presForm.dose_valor) : null, dose_unidade: presForm.dose_unidade || null, frequencia_dia: fdia, duracao_dias: presForm.duracao ? Number(presForm.duracao) : null, via: presForm.via, quantidade: presForm.quantidade }]);
    setPresForm({ medId: "", dose_valor: "", dose_unidade: presForm.dose_unidade, freqLabel: presForm.freqLabel, via: presForm.via, duracao: "", quantidade: "" });
  }
  async function assinarPrescricao() {
    if (!presItens.length && !presObs.trim()) { alert("Adicione ao menos um medicamento à prescrição."); return; }
    if (!confirm("Assinar esta prescrição? Ela NÃO poderá ser editada nem apagada depois (registro clínico).")) return;
    setBusy(true);
    const linhas = presItens.map(it => `• ${it.medicamento_nome}${it.dose ? " — " + it.dose : ""}${it.via ? " (" + it.via + ")" : ""}${it.quantidade ? " — qtd " + farmFmtQtd(it.quantidade) + (it.unidade ? " " + it.unidade : "") : ""}`);
    const texto = (linhas.join("\n") + (presObs.trim() ? `\nObs.: ${presObs.trim()}` : "")).trim();
    const regRows = await addPsRegistroRemote({ atendimento_id: paciente.id, tipo: "prescricao", texto, criado_em: nowISO() }, currentUser);
    const registroId = Array.isArray(regRows) ? regRows[0]?.id : null;
    if (presItens.length) {
      const itens = presItens.map(it => ({ atendimento_id: paciente.id, registro_id: registroId, medicamento_id: it.medicamento_id || null, medicamento_nome: it.medicamento_nome, unidade: it.unidade || null, dose: it.dose || null, dose_valor: it.dose_valor ?? null, dose_unidade: it.dose_unidade || null, frequencia_dia: it.frequencia_dia ?? null, duracao_dias: it.duracao_dias ?? null, via: it.via || null, quantidade: it.quantidade ? Number(it.quantidade) : null }));
      await addPsPrescricaoItens(itens, currentUser);
    }
    addAuditLog(currentUser, "PS: prescrição", `${paciente.iniciais} · ${presItens.length} item(ns)`, {});
    setPresItens([]); setPresObs(""); setBusy(false);
    carregarRegistros(); carregarPrescricao(); onChanged?.();
  }
  const dispensadoDoItem = itemId => saidas.filter(s => s.prescricao_item_id === itemId).reduce((a, s) => a + Number(s.quantidade || 0), 0);
  async function solicitarExame() {
    if (!exForm.nome.trim()) { alert("Informe o nome do exame."); return; }
    setBusy(true);
    await addPsRegistroRemote({ atendimento_id: paciente.id, tipo: "exame", categoria: exForm.categoria, texto: exForm.nome.trim(), status: "solicitado", criado_em: nowISO() }, currentUser);
    addAuditLog(currentUser, "PS: solicitar exame", `${paciente.iniciais} · ${exForm.nome.trim()}`, {});
    setExForm(p => ({ ...p, nome: "" })); setBusy(false); carregarRegistros(); onChanged?.();
  }
  async function lancarResultado() {
    if (!resultadoDe?.texto?.trim()) { alert("Cole ou descreva o resultado."); return; }
    await updatePsRegistroRemote(resultadoDe.id, { status: "resultado_disponivel", resultado: resultadoDe.texto.trim(), resultado_em: nowISO() });
    addAuditLog(currentUser, "PS: resultado de exame", paciente.iniciais, {});
    setResultadoDe(null); carregarRegistros(); onChanged?.();
  }
  async function marcarVisto(reg) {
    await updatePsRegistroRemote(reg.id, { status: "visto" });
    addAuditLog(currentUser, "PS: exame visto", `${paciente.iniciais} · ${reg.texto}`, {});
    carregarRegistros(); onChanged?.();
  }

  const evolucoes = registros.filter(r => r.tipo === "evolucao");
  const prescricoes = registros.filter(r => r.tipo === "prescricao");
  const exames = registros.filter(r => r.tipo === "exame");
  const alertasClinicos = analisarPrescricaoClinica([...presItensSalvos, ...presItens], ctx, catById, interacoes, incompatY);
  const abaBtn = ativo => ({ background: ativo ? "#22d3ee" : "transparent", color: ativo ? "#000" : "var(--text-3)", border: `1px solid ${ativo ? "#22d3ee" : "var(--border)"}`, borderRadius: 7, padding: "7px 14px", fontWeight: 700, cursor: "pointer", fontSize: 12.5 });
  const EX_STATUS = { solicitado: { label: "Aguardando resultado", cor: "#d97706" }, resultado_disponivel: { label: "Resultado disponível", cor: "#3b82f6" }, visto: { label: "Visto pelo médico", cor: "#34d399" } };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 700, maxWidth: "96vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>Atendimento — {paciente.iniciais}{paciente.prontuario ? ` · reg. ${paciente.prontuario}` : ""}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
          {paciente.queixa || "Sem queixa registrada"}
          {paciente.classificacao && MANCHESTER[paciente.classificacao] ? <> · <span style={{ color: MANCHESTER[paciente.classificacao].cor, fontWeight: 700 }}>{MANCHESTER[paciente.classificacao].label}</span></> : ""}
          {paciente.atendimento_em ? ` · em atendimento há ${fmtDur(diffMin(paciente.atendimento_em, nowISO()))}` : ""}
        </div>
        {fmtSinaisVitais(paciente) && <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "JetBrains Mono, monospace", marginBottom: 12 }}>{fmtSinaisVitais(paciente)}</div>}

        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <button onClick={() => setAba("evolucao")} style={abaBtn(aba === "evolucao")}>Evolução médica ({evolucoes.length})</button>
          <button onClick={() => setAba("prescricao")} style={abaBtn(aba === "prescricao")}>Prescrição ({prescricoes.length})</button>
          <button onClick={() => setAba("exames")} style={abaBtn(aba === "exames")}>Exames ({exames.length})</button>
        </div>

        {aba === "evolucao" && (
          <>
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={5} placeholder="Escreva a evolução médica — ou clique em Ditar e fale." style={{ ...inp, resize: "vertical", lineHeight: 1.55, marginBottom: 8 }} />
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
              {suportaVoz && <button onClick={toggleVoz} style={{ background: gravando ? "#f43f5e" : "transparent", color: gravando ? "#fff" : "var(--text-2)", border: `1px solid ${gravando ? "#f43f5e" : "var(--border-2)"}`, borderRadius: 6, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{gravando ? "● Gravando… (parar)" : "Ditar por voz"}</button>}
              <button onClick={() => salvarTexto("evolucao")} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13, marginLeft: "auto" }}>{busy ? "…" : "Salvar evolução"}</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {evolucoes.map(r => (
                <div key={r.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 13px" }}>
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace", marginBottom: 4 }}>{horaFmt(r.criado_em)} · {r.usuario || "?"}</div>
                  <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{r.texto}</div>
                </div>
              ))}
              {evolucoes.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>Nenhum registro ainda.</div>}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 10 }}>Registros assinados com data/hora e imutáveis (não podem ser editados nem apagados).</div>
          </>
        )}

        {aba === "prescricao" && (
          <>
            {/* Contexto clínico do paciente (alimenta os alertas) */}
            <div style={{ border: "1px solid var(--border)", borderRadius: 9, marginBottom: 12 }}>
              <button onClick={() => setCtxAberto(a => !a)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", padding: "10px 13px", cursor: "pointer", color: "var(--text-2)", textAlign: "left" }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Contexto clínico</span>
                <span style={{ fontSize: 11.5, color: "var(--text-muted)", flex: 1 }}>{[ctx.idade !== "" ? `${ctx.idade} anos` : null, ctx.peso !== "" ? `${ctx.peso} kg` : null, ctx.clearance_renal !== "" ? `ClCr ${ctx.clearance_renal}` : null, ctx.em_sonda ? "sonda" : null, ctx.gestante ? "gestante" : null, ctx.alergias ? `alergia: ${ctx.alergias}` : null].filter(Boolean).join(" · ") || "não informado — informe para habilitar os alertas"}</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{ctxAberto ? "▾" : "▸"}</span>
              </button>
              {ctxAberto && (
                <div style={{ padding: "0 13px 12px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 8 }}>
                    <div><label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Idade (anos)</label><input type="number" min="0" value={ctx.idade} onChange={e => setCtx(p => ({ ...p, idade: e.target.value }))} style={{ ...inp, padding: "7px 9px" }} /></div>
                    <div><label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Peso (kg)</label><input type="number" min="0" step="any" value={ctx.peso} onChange={e => setCtx(p => ({ ...p, peso: e.target.value }))} style={{ ...inp, padding: "7px 9px" }} /></div>
                    <div><label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>ClCr / TFG (mL/min)</label><input type="number" min="0" step="any" value={ctx.clearance_renal} onChange={e => setCtx(p => ({ ...p, clearance_renal: e.target.value }))} style={{ ...inp, padding: "7px 9px" }} /></div>
                    <div><label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Função hepática</label><select value={ctx.funcao_hepatica} onChange={e => setCtx(p => ({ ...p, funcao_hepatica: e.target.value }))} style={{ ...inp, padding: "7px 9px" }}><option value="">—</option><option value="normal">Normal</option><option value="leve">Leve</option><option value="moderada">Moderada</option><option value="grave">Grave</option></select></div>
                  </div>
                  <div style={{ marginBottom: 8 }}><label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Alergias</label><input value={ctx.alergias} onChange={e => setCtx(p => ({ ...p, alergias: e.target.value }))} placeholder="Ex.: penicilina, dipirona" style={{ ...inp, padding: "7px 9px" }} /></div>
                  <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--text-2)", cursor: "pointer" }}><input type="checkbox" checked={ctx.em_sonda} onChange={e => setCtx(p => ({ ...p, em_sonda: e.target.checked }))} style={{ accentColor: "#d97706", width: 15, height: 15 }} /> Em uso de sonda</label>
                    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--text-2)", cursor: "pointer" }}><input type="checkbox" checked={ctx.gestante} onChange={e => setCtx(p => ({ ...p, gestante: e.target.checked }))} style={{ accentColor: "#e11d48", width: 15, height: 15 }} /> Gestante</label>
                    {ctxMsg && <span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 700, color: ctxMsg.startsWith("erro") ? "#f43f5e" : "#34d399" }}>{ctxMsg}</span>}
                    <button onClick={salvarContexto} disabled={ctxBusy} style={{ marginLeft: ctxMsg ? 8 : "auto", background: "transparent", color: "#22d3ee", border: "1px solid #22d3ee88", borderRadius: 6, padding: "7px 14px", fontWeight: 700, cursor: "pointer", fontSize: 12.5 }}>{ctxBusy ? "…" : "Salvar contexto"}</button>
                  </div>
                </div>
              )}
            </div>

            {ctx.alergias && ctx.alergias.trim() && (
              <div style={{ background: "#f43f5e14", border: "1px solid #f43f5e66", borderLeft: "4px solid #f43f5e", borderRadius: 8, padding: "9px 13px", marginBottom: 12, fontSize: 12.5, color: "var(--text)", fontWeight: 600 }}>
                ⚠ Paciente alérgico a <strong style={{ color: "#f43f5e" }}>{ctx.alergias}</strong> — não prescrever os compostos relacionados.
              </div>
            )}

            {/* Construtor de prescrição estruturada */}
            <div style={{ border: "1px solid var(--border)", borderRadius: 9, padding: "12px 13px", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", marginBottom: 10 }}>Nova prescrição</div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Medicamento</label>
                <select value={presForm.medId} onChange={e => setPresForm(p => ({ ...p, medId: e.target.value }))} style={{ ...inp, padding: "8px 9px" }}>
                  <option value="">Escolha…</option>
                  {FARM_CLASSES.filter(c => catalogo.some(m => (m.classe || "Outros") === c && m.ativo !== false)).map(c => (
                    <optgroup key={c} label={c}>
                      {catalogo.filter(m => (m.classe || "Outros") === c && m.ativo !== false).map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 10 }}>
                <div style={{ flex: "0 1 80px", minWidth: 70 }}>
                  <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Dose</label>
                  <input type="number" min="0" step="any" value={presForm.dose_valor} onChange={e => setPresForm(p => ({ ...p, dose_valor: e.target.value }))} placeholder="500" style={{ ...inp, padding: "8px 9px" }} />
                </div>
                <div style={{ flex: "0 1 92px", minWidth: 80 }}>
                  <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Unid.</label>
                  <select value={presForm.dose_unidade} onChange={e => setPresForm(p => ({ ...p, dose_unidade: e.target.value }))} style={{ ...inp, padding: "8px 9px" }}>{PS_DOSE_UNID.map(u => <option key={u} value={u}>{u}</option>)}</select>
                </div>
                <div style={{ flex: "1 1 110px", minWidth: 100 }}>
                  <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Frequência</label>
                  <select value={presForm.freqLabel} onChange={e => setPresForm(p => ({ ...p, freqLabel: e.target.value }))} style={{ ...inp, padding: "8px 9px" }}>{PS_FREQUENCIAS.map(f => <option key={f.label} value={f.label}>{f.label}</option>)}</select>
                </div>
                <div style={{ flex: "0 1 78px", minWidth: 68 }}>
                  <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Via</label>
                  <select value={presForm.via} onChange={e => setPresForm(p => ({ ...p, via: e.target.value }))} style={{ ...inp, padding: "8px 9px" }}>{PS_VIAS.map(v => <option key={v} value={v}>{v}</option>)}</select>
                </div>
                <div style={{ flex: "0 1 70px", minWidth: 62 }}>
                  <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Dias</label>
                  <input type="number" min="0" step="any" value={presForm.duracao} onChange={e => setPresForm(p => ({ ...p, duracao: e.target.value }))} placeholder="—" style={{ ...inp, padding: "8px 9px" }} />
                </div>
                <div style={{ flex: "0 1 70px", minWidth: 62 }}>
                  <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Qtd</label>
                  <input type="number" min="0" step="any" value={presForm.quantidade} onChange={e => setPresForm(p => ({ ...p, quantidade: e.target.value }))} placeholder="0" style={{ ...inp, padding: "8px 9px" }} />
                </div>
                <button onClick={addItemPrescricao} style={{ background: "transparent", color: "#22d3ee", border: "1px solid #22d3ee88", borderRadius: 6, padding: "9px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Adicionar</button>
              </div>
              {presItens.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 10 }}>
                  {presItens.map((it, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "7px 11px", fontSize: 12.5 }}>
                      <span style={{ flex: 1 }}><strong>{it.medicamento_nome}</strong>{it.dose ? ` — ${it.dose}` : ""} <span style={{ color: "var(--text-muted)" }}>{it.via}{it.quantidade ? ` · qtd ${farmFmtQtd(it.quantidade)} ${it.unidade || ""}` : ""}</span></span>
                      <button onClick={() => setPresItens(p => p.filter((_, j) => j !== i))} style={{ background: "transparent", border: "none", color: "#f43f5e", cursor: "pointer", fontSize: 15, lineHeight: 1 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              <textarea value={presObs} onChange={e => setPresObs(e.target.value)} rows={2} placeholder="Observações / cuidados (opcional)" style={{ ...inp, resize: "vertical", marginBottom: 10 }} />
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button onClick={assinarPrescricao} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Assinar prescrição"}</button>
              </div>
            </div>

            {/* Alertas de farmácia clínica */}
            {alertasClinicos.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 7 }}>Alertas de farmácia clínica ({alertasClinicos.length})</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {alertasClinicos.map((a, i) => (
                    <div key={i} style={{ background: FARM_GRAV[a.gravidade].cor + "11", border: `1px solid ${FARM_GRAV[a.gravidade].cor}55`, borderLeft: `4px solid ${FARM_GRAV[a.gravidade].cor}`, borderRadius: 8, padding: "8px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 9.5, fontWeight: 800, color: FARM_GRAV[a.gravidade].cor, border: `1px solid ${FARM_GRAV[a.gravidade].cor}66`, borderRadius: 99, padding: "0 6px", textTransform: "uppercase" }}>{FARM_GRAV[a.gravidade].label}</span>
                        <strong style={{ fontSize: 12.5, color: "var(--text)" }}>{a.titulo}</strong>
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 3, lineHeight: 1.45 }}>{a.detalhe}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>Apoio à decisão — revise clinicamente. Base sujeita a validação da equipe de farmácia.</div>
              </div>
            )}

            {/* Prescrições assinadas */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {prescricoes.map(r => {
                const itens = presItensSalvos.filter(i => i.registro_id === r.id);
                return (
                  <div key={r.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 13px" }}>
                    <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace", marginBottom: 6 }}>{horaFmt(r.criado_em)} · {r.usuario || "?"}</div>
                    {itens.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {itens.map(it => {
                          const disp = dispensadoDoItem(it.id);
                          const qtd = Number(it.quantidade || 0);
                          const st = qtd <= 0 ? null : disp >= qtd ? { c: "#34d399", t: "dispensado" } : disp > 0 ? { c: "#d97706", t: `parcial ${farmFmtQtd(disp)}/${farmFmtQtd(qtd)}` } : { c: "#8d99ab", t: "pendente" };
                          return (
                            <div key={it.id} style={{ fontSize: 12.5, color: "var(--text-2)", display: "flex", gap: 8, alignItems: "baseline" }}>
                              <span style={{ flex: 1 }}>• <strong>{it.medicamento_nome}</strong>{it.dose ? ` — ${it.dose}` : ""} <span style={{ color: "var(--text-muted)" }}>{it.via}{qtd ? ` · qtd ${farmFmtQtd(qtd)} ${it.unidade || ""}` : ""}</span></span>
                              {st && <span style={{ fontSize: 10.5, color: st.c, fontWeight: 700, whiteSpace: "nowrap" }}>{st.t}</span>}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{r.texto}</div>
                    )}
                  </div>
                );
              })}
              {prescricoes.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>Nenhuma prescrição assinada ainda.</div>}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 10 }}>Prescrições são assinadas com data/hora e imutáveis. A dispensação (baixa de estoque) é feita na Farmácia.</div>
          </>
        )}

        {aba === "exames" && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              <select value={exForm.categoria} onChange={e => setExForm(p => ({ ...p, categoria: e.target.value }))} style={{ ...inp, width: 150 }}>
                {Object.entries(PS_EXAME_CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input value={exForm.nome} onChange={e => setExForm(p => ({ ...p, nome: e.target.value }))} onKeyDown={e => e.key === "Enter" && solicitarExame()} placeholder="Ex.: Hemograma completo, RX de tórax PA…" style={{ ...inp, flex: 1, minWidth: 200 }} />
              <button onClick={solicitarExame} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "+ Solicitar"}</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {exames.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>Nenhum exame solicitado.</div>}
              {exames.map(r => {
                const st = EX_STATUS[r.status] || EX_STATUS.solicitado;
                return (
                  <div key={r.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: `4px solid ${st.cor}`, borderRadius: 8, padding: "10px 13px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <strong style={{ fontSize: 13 }}>{r.texto}</strong>
                      <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{PS_EXAME_CATEGORIAS[r.categoria] || r.categoria}</span>
                      <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: st.cor }}>{st.label}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace", marginTop: 2 }}>Solicitado {horaFmt(r.criado_em)}{r.resultado_em ? ` · resultado ${horaFmt(r.resultado_em)}` : ""}</div>
                    {r.resultado && <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.55, whiteSpace: "pre-wrap", marginTop: 6, background: "var(--input-bg)", borderRadius: 6, padding: "8px 10px" }}>{r.resultado}</div>}
                    {resultadoDe?.id === r.id ? (
                      <div style={{ marginTop: 8 }}>
                        <textarea value={resultadoDe.texto} onChange={e => setResultadoDe(p => ({ ...p, texto: e.target.value }))} rows={3} placeholder="Cole ou descreva o resultado do exame." style={{ ...inp, resize: "vertical", lineHeight: 1.5, marginBottom: 6 }} />
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button onClick={() => setResultadoDe(null)} style={btnLeito("var(--text-muted)")}>Cancelar</button>
                          <button onClick={lancarResultado} style={btnLeito("#3b82f6")}>Salvar resultado</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        {r.status === "solicitado" && <button onClick={() => setResultadoDe({ id: r.id, texto: "" })} style={btnLeito("#3b82f6")}>Lançar resultado</button>}
                        {r.status === "resultado_disponivel" && <button onClick={() => marcarVisto(r)} style={btnLeito("#34d399")}>Marcar como visto</button>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// Modal de triagem/reavaliação: sinais vitais → sugestão de Manchester → decisão da triadora
function TriagemModal({ paciente, onClose, onTriar, reavaliacao = false }) {
  const [v, setV] = useState({ pa_sist: "", pa_diast: "", fc: "", fr: "", spo2: "", temp: "", dor: "", consciencia: "A", glicemia: "" });
  const [busy, setBusy] = useState(false);
  const [idade, setIdade] = useState(null);       // idade pelo cadastro do Paciente 360
  const [historico, setHistorico] = useState([]); // aferições anteriores (reavaliação)
  const set = (k, val) => setV(p => ({ ...p, [k]: val }));
  useEffect(() => {
    if (paciente.prontuario && USE_SUPABASE) {
      sbFetch(`pacientes?prontuario=eq.${encodeURIComponent(paciente.prontuario)}&select=ano_nascimento`)
        .then(r => { const ano = Array.isArray(r) && r[0]?.ano_nascimento; if (ano) setIdade(new Date().getFullYear() - ano); });
    }
    if (reavaliacao) loadPsSinais(paciente.id).then(setHistorico);
  }, []);
  const pediatrico = idade != null && idade < 13;
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  const lbl = { fontSize: 10.5, fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 4 };
  const av = pediatrico ? { sugestao: null, motivos: [] } : avaliarSinaisVitais(v);
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
    await onTriar(k, vitaisPayload(), av.sugestao || null);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 600, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>{reavaliacao ? "Reavaliação" : "Triagem"} — {paciente.iniciais}{idade != null ? ` (${idade} anos)` : ""}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>{paciente.queixa || "Sem queixa registrada"} · chegou há {fmtDur(diffMin(paciente.chegada_em, nowISO()))}{reavaliacao && paciente.classificacao ? ` · classificação atual: ${MANCHESTER[paciente.classificacao]?.label || paciente.classificacao}` : ""}</div>

        {/* AVISO PEDIÁTRICO */}
        {pediatrico && (
          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: "4px solid #ef4444", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#ef4444" }}>Paciente pediátrico ({idade} anos)</div>
            <div style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 3, lineHeight: 1.5 }}>As faixas de referência do apoio à decisão são para ADULTOS e não se aplicam. Registre os sinais vitais e classifique pelo protocolo pediátrico — a sugestão automática foi desativada para este paciente.</div>
          </div>
        )}
        {!pediatrico && idade == null && paciente.prontuario && (
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginBottom: 10 }}>Idade não cadastrada no Paciente 360 — as faixas do apoio à decisão assumem paciente adulto.</div>
        )}

        {/* HISTÓRICO DE AFERIÇÕES (reavaliação) */}
        {reavaliacao && historico.length > 0 && (
          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 13px", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 5 }}>Aferições anteriores</div>
            {historico.map(h => (
              <div key={h.id} style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace", lineHeight: 1.8 }}>
                {horaFmt(h.aferido_em)} — {fmtSinaisVitais(h) || "sem registro"}{h.classificacao_escolhida && MANCHESTER[h.classificacao_escolhida] ? ` → ${MANCHESTER[h.classificacao_escolhida].label}` : ""}
              </div>
            ))}
          </div>
        )}

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
              <button key={k} onClick={() => set("consciencia", k)} style={{ background: v.consciencia === k ? "var(--surface-3)" : "transparent", color: v.consciencia === k ? (k === "A" ? "#34d399" : k === "U" ? "#ef4444" : "#f97316") : "var(--text-3)", border: `1px solid ${v.consciencia === k ? (k === "A" ? "#34d399" : k === "U" ? "#ef4444" : "#f97316") : "var(--border-2)"}`, borderRadius: 6, padding: "6px 12px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>{k} — {label}</button>
            ))}
          </div>
        </div>

        {/* SUGESTÃO AO VIVO */}
        {!pediatrico && (sug ? (
          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: `4px solid ${sug.cor}`, borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
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
        ))}

        {/* CLASSIFICAÇÃO */}
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Classificação de risco</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Object.entries(MANCHESTER).map(([k, m]) => (
            <button key={k} onClick={() => classificar(k)} disabled={busy} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: `4px solid ${m.cor}`, outline: av.sugestao === k ? `2px solid ${m.cor}` : "none", borderRadius: 8, padding: "10px 14px", cursor: "pointer", textAlign: "left" }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: m.cor, minWidth: 110 }}>{m.label}</span>
              <span style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.4, flex: 1 }}>{m.desc}</span>
              {av.sugestao === k && <span style={{ background: "transparent", color: m.cor, border: `1px solid ${m.cor}`, borderRadius: 99, padding: "2px 10px", fontSize: 10, fontWeight: 800, whiteSpace: "nowrap" }}>SUGERIDA</span>}
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

// ═══════════════════════════════════════════════════════════
// FARMÁCIA — Fase A: catálogo + estoque (lote/validade, kardex)
// ═══════════════════════════════════════════════════════════
const farmFmtQtd = n => { const v = Number(n || 0); return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ","); };
const farmInp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
const farmLbl = { fontSize: 11, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 4 };

function FarmaciaPage({ currentUser, canEdit }) {
  const [meds, setMeds]   = useState([]);
  const [lotes, setLotes] = useState([]);
  const [busca, setBusca] = useState("");
  const [classeFiltro, setClasseFiltro] = useState("");
  const [showMed, setShowMed] = useState(null);   // objeto (novo/editar) ou null
  const [movMed, setMovMed]   = useState(null);   // { med, tipo }
  const [kardex, setKardex]   = useState(null);   // med para histórico
  const [sub, setSub] = useState("estoque");      // estoque | dispensacao
  const [, setTick] = useState(0);
  const isMaster = currentUser?.role === "adm_master";
  const subBtn = ativo => ({ background: ativo ? "#22d3ee" : "transparent", color: ativo ? "#000" : "var(--text-3)", border: `1px solid ${ativo ? "#22d3ee" : "var(--border)"}`, borderRadius: 7, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 });

  function refresh() {
    if (!USE_SUPABASE) return;
    loadFarmMedicamentos().then(setMeds);
    loadFarmLotes().then(setLotes);
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

  // Situação de estoque de cada medicamento
  function statusMed(m) {
    const saldo = farmSaldoTotal(m.id, lotes);
    const min = Number(m.estoque_minimo || 0);
    if (saldo <= 0) return { key: "zerado", cor: "#f43f5e", label: "Sem estoque", saldo };
    if (min > 0 && saldo <= min) return { key: "baixo", cor: "#d97706", label: "Abaixo do mínimo", saldo };
    return { key: "ok", cor: "#34d399", label: "OK", saldo };
  }
  // Lote de validade mais próxima (com saldo) de um medicamento
  function loteCritico(m) {
    const ls = lotes.filter(l => l.medicamento_id === m.id && Number(l.quantidade) > 0 && l.validade);
    if (!ls.length) return null;
    return ls.sort((a, b) => a.validade.localeCompare(b.validade))[0];
  }

  // Painéis de alerta
  const alertasBaixo = medsOrd.filter(m => m.ativo !== false && ["baixo", "zerado"].includes(statusMed(m).key));
  const lotesAlerta = lotes.filter(l => Number(l.quantidade) > 0 && ["vencido", "vencendo"].includes(farmValidadeInfo(l.validade).status));

  async function salvarMed(med) {
    await upsertFarmMedicamentoRemote(med, currentUser);
    addAuditLog(currentUser, med.id ? "editar medicamento" : "cadastrar medicamento", med.nome, {});
    setShowMed(null);
    setTimeout(refresh, 350);
  }
  async function excluirMed(m) {
    if (!confirm(`Excluir "${m.nome}" e todo o seu histórico de estoque? Essa ação não pode ser desfeita.`)) return;
    await deleteFarmMedicamentoRemote(m.id);
    addAuditLog(currentUser, "excluir medicamento", m.nome, {});
    setTimeout(refresh, 300);
  }
  async function registrarMov(mov) {
    const r = await addFarmMovimentoRemote(mov, currentUser);
    if (!r.ok) { alert("Não foi possível registrar o movimento.\n" + (r.erro || "")); return false; }
    const med = meds.find(x => x.id === mov.medicamento_id);
    addAuditLog(currentUser, mov.tipo === "entrada" ? "entrada de estoque" : "saída de estoque", `${med?.nome || mov.medicamento_id} · ${farmFmtQtd(mov.quantidade)}`, {});
    setMovMed(null);
    setTimeout(refresh, 350);
    return true;
  }

  const totalItens = meds.length;
  const totalAtivos = meds.filter(m => m.ativo !== false).length;

  return (
    <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Farmácia</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{sub === "estoque" ? `Catálogo, entradas e saídas por lote e validade (FEFO). ${totalAtivos} ativos · ${totalItens} cadastrados.` : sub === "dispensacao" ? "Dispensação de medicamentos a partir da prescrição do PS ou avulsa, com baixa de estoque." : sub === "analise" ? "Análise clínica das prescrições — alertas de duplicidade, dose máxima, tempo de tratamento, sonda e adequação idoso/criança." : "Consumo, curva ABC, controlados, rupturas e perdas por validade — a partir dos movimentos de estoque."}</div>
        </div>
        {sub === "estoque" && canEdit && <button onClick={() => setShowMed({ nome: "", principio_ativo: "", classe: "", forma: "", concentracao: "", unidade: "unidade", estoque_minimo: "", controlado: false, ativo: true, observacao: "" })} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" }}>+ Novo medicamento</button>}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <button onClick={() => setSub("estoque")} style={subBtn(sub === "estoque")}>Estoque</button>
        <button onClick={() => setSub("dispensacao")} style={subBtn(sub === "dispensacao")}>Dispensação</button>
        <button onClick={() => setSub("analise")} style={subBtn(sub === "analise")}>Análise clínica</button>
        <button onClick={() => setSub("indicadores")} style={subBtn(sub === "indicadores")}>Indicadores</button>
      </div>

      {sub === "dispensacao" && <FarmDispensacaoView currentUser={currentUser} canEdit={canEdit} />}
      {sub === "analise" && <FarmAnaliseView currentUser={currentUser} canEdit={canEdit} />}
      {sub === "indicadores" && <FarmIndicadoresView />}

      {sub === "estoque" && (<>
      {/* PAINÉIS DE ALERTA */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: "1.25rem" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${alertasBaixo.length ? "#d97706" : "#34d399"}`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Reposição</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: alertasBaixo.length ? "#d97706" : "var(--text)" }}>{alertasBaixo.length}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{alertasBaixo.length ? "medicamentos abaixo do mínimo / zerados" : "nenhum item abaixo do mínimo"}</div>
          {alertasBaixo.length > 0 && <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 5 }}>{alertasBaixo.slice(0, 6).map(m => <span key={m.id} style={{ fontSize: 10.5, color: statusMed(m).cor, border: `1px solid ${statusMed(m).cor}55`, borderRadius: 99, padding: "1px 7px" }}>{m.nome}</span>)}{alertasBaixo.length > 6 && <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>+{alertasBaixo.length - 6}</span>}</div>}
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${lotesAlerta.length ? "#f43f5e" : "#34d399"}`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Validade</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: lotesAlerta.length ? "#f43f5e" : "var(--text)" }}>{lotesAlerta.length}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{lotesAlerta.length ? `lotes vencidos ou vencendo em ${FARM_VENC_DIAS} dias` : "nenhum lote vencendo"}</div>
          {lotesAlerta.length > 0 && <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>{lotesAlerta.slice(0, 4).map(l => { const m = meds.find(x => x.id === l.medicamento_id); const vi = farmValidadeInfo(l.validade); return <div key={l.id} style={{ fontSize: 11, color: "var(--text-2)" }}><span style={{ color: vi.status === "vencido" ? "#f43f5e" : "#d97706", fontWeight: 700 }}>{vi.status === "vencido" ? "vencido" : `${vi.dias}d`}</span> · {m?.nome || "?"} {l.lote ? `· lote ${l.lote}` : ""}</div>; })}{lotesAlerta.length > 4 && <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>+{lotesAlerta.length - 4}</span>}</div>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, princípio ativo ou forma…" style={{ ...farmInp, maxWidth: 380, flex: "1 1 240px" }} />
        <select value={classeFiltro} onChange={e => setClasseFiltro(e.target.value)} style={{ ...farmInp, maxWidth: 280 }}>
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
                const vi = lc ? farmValidadeInfo(lc.validade) : null;
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
                        <button onClick={() => setMovMed({ med: m, tipo: "entrada" })} style={btnLeito("#34d399")}>Entrada</button>{" "}
                        <button onClick={() => setMovMed({ med: m, tipo: "saida" })} style={btnLeito("#d97706")}>Saída</button>{" "}
                      </>}
                      <button onClick={() => setKardex(m)} style={btnLeito("#8d99ab")}>Kardex</button>{" "}
                      {canEdit && <button onClick={() => setShowMed(m)} style={btnLeito("#3b82f6")}>Editar</button>}
                      {isMaster && <> <button onClick={() => excluirMed(m)} style={btnLeito("#f43f5e")}>Excluir</button></>}
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
      {kardex && <FarmKardexModal med={kardex} onClose={() => setKardex(null)} />}
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
      obs_clinica: f.obs_clinica?.trim() || null,
    });
    setBusy(false);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 520, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>{med.id ? "Editar medicamento" : "Novo medicamento"}</div>
        <div style={{ marginBottom: 10 }}>
          <label style={farmLbl}>Nome / apresentação *</label>
          <input value={f.nome} onChange={e => set("nome", e.target.value)} placeholder="Ex.: Dipirona 500 mg comprimido" style={farmInp} autoFocus />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={farmLbl}>Princípio ativo</label>
            <input value={f.principio_ativo || ""} onChange={e => set("principio_ativo", e.target.value)} placeholder="Ex.: Dipirona sódica" style={farmInp} />
          </div>
          <div>
            <label style={farmLbl}>Classe terapêutica</label>
            <select value={f.classe || ""} onChange={e => set("classe", e.target.value)} style={farmInp}>
              <option value="">—</option>
              {FARM_CLASSES.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={farmLbl}>Forma farmacêutica</label>
            <select value={f.forma || ""} onChange={e => set("forma", e.target.value)} style={farmInp}>
              <option value="">—</option>
              {FARM_FORMAS.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div>
            <label style={farmLbl}>Concentração</label>
            <input value={f.concentracao || ""} onChange={e => set("concentracao", e.target.value)} placeholder="500 mg · 10 mg/mL" style={farmInp} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={farmLbl}>Unidade de controle</label>
            <select value={f.unidade || "unidade"} onChange={e => set("unidade", e.target.value)} style={farmInp}>
              {FARM_UNIDADES.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div>
            <label style={farmLbl}>Estoque mínimo</label>
            <input type="number" min="0" value={f.estoque_minimo ?? ""} onChange={e => set("estoque_minimo", e.target.value)} placeholder="0" style={farmInp} />
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
          <label style={farmLbl}>Observação</label>
          <textarea value={f.observacao || ""} onChange={e => set("observacao", e.target.value)} rows={2} placeholder="Cuidados, armazenamento, etc." style={{ ...farmInp, resize: "vertical" }} />
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
                <label style={farmLbl}>Grupo terapêutico (p/ duplicidade)</label>
                <input value={f.grupo_terapeutico || ""} onChange={e => set("grupo_terapeutico", e.target.value)} placeholder="Ex.: AINE, IBP, Opioide" style={farmInp} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                <div><label style={farmLbl}>Dose máx./dia</label><input type="number" min="0" step="any" value={f.dose_maxima_dia ?? ""} onChange={e => set("dose_maxima_dia", e.target.value)} placeholder="4000" style={farmInp} /></div>
                <div><label style={farmLbl}>Unid.</label><select value={f.dose_maxima_unid || ""} onChange={e => set("dose_maxima_unid", e.target.value)} style={farmInp}><option value="">—</option>{PS_DOSE_UNID.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
                <div><label style={farmLbl}>Duração máx. (dias)</label><input type="number" min="0" value={f.duracao_maxima_dias ?? ""} onChange={e => set("duracao_maxima_dias", e.target.value)} placeholder="—" style={farmInp} /></div>
              </div>
              <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13, color: "var(--text-2)", cursor: "pointer", marginBottom: 8 }}>
                <input type="checkbox" checked={!!f.nao_triturar} onChange={e => set("nao_triturar", e.target.checked)} style={{ accentColor: "#d97706", width: 15, height: 15 }} /> Não triturar / contraindicado por sonda
              </label>
              <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13, color: "var(--text-2)", cursor: "pointer", marginBottom: 4 }}>
                <input type="checkbox" checked={!!f.inapropriado_idoso} onChange={e => set("inapropriado_idoso", e.target.checked)} style={{ accentColor: "#d97706", width: 15, height: 15 }} /> Inapropriado para idoso (Beers)
              </label>
              {f.inapropriado_idoso && <input value={f.motivo_idoso || ""} onChange={e => set("motivo_idoso", e.target.value)} placeholder="Motivo (Beers)" style={{ ...farmInp, marginBottom: 8 }} />}
              <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13, color: "var(--text-2)", cursor: "pointer", marginBottom: 4 }}>
                <input type="checkbox" checked={!!f.inapropriado_pediatrico} onChange={e => set("inapropriado_pediatrico", e.target.checked)} style={{ accentColor: "#d97706", width: 15, height: 15 }} /> Inapropriado para criança
              </label>
              {f.inapropriado_pediatrico && (
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, marginBottom: 8 }}>
                  <input value={f.motivo_pediatrico || ""} onChange={e => set("motivo_pediatrico", e.target.value)} placeholder="Motivo" style={farmInp} />
                  <input type="number" min="0" value={f.idade_pediatrica ?? ""} onChange={e => set("idade_pediatrica", e.target.value)} placeholder="< anos (12)" style={farmInp} />
                </div>
              )}
              <div><label style={farmLbl}>Observação clínica (ex.: como administrar por sonda)</label><textarea value={f.obs_clinica || ""} onChange={e => set("obs_clinica", e.target.value)} rows={2} placeholder="Ex.: abrir a cápsula, não triturar os grânulos" style={{ ...farmInp, resize: "vertical" }} /></div>
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
  const lotesComSaldo = [...lotes].filter(l => Number(l.quantidade) > 0).sort((a, b) => (a.validade || "9999").localeCompare(b.validade || "9999")); // FEFO
  const [f, setF] = useState({
    lote: "", validade: "", quantidade: "", documento: "",
    lote_id: lotesComSaldo[0]?.id || "", motivo: "Dispensação",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const loteSel = lotesComSaldo.find(l => String(l.id) === String(f.lote_id));

  async function salvar() {
    const q = Number(f.quantidade);
    if (!q || q <= 0) { alert("Informe uma quantidade maior que zero."); return; }
    let mov;
    if (tipo === "entrada") {
      mov = { medicamento_id: med.id, tipo: "entrada", quantidade: q, lote: f.lote.trim() || null, validade: f.validade || null, motivo: "Compra / nota fiscal", documento: f.documento.trim() || null };
    } else {
      if (!loteSel) { alert("Selecione o lote de onde sairá o medicamento."); return; }
      if (q > Number(loteSel.quantidade)) { alert(`Saída maior que o saldo do lote (disponível: ${farmFmtQtd(loteSel.quantidade)}).`); return; }
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
            <div><label style={farmLbl}>Lote</label><input value={f.lote} onChange={e => set("lote", e.target.value)} placeholder="Ex.: AB1234" style={farmInp} /></div>
            <div><label style={farmLbl}>Validade</label><input type="date" value={f.validade} onChange={e => set("validade", e.target.value)} style={farmInp} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div><label style={farmLbl}>Quantidade *</label><input type="number" min="0" step="any" value={f.quantidade} onChange={e => set("quantidade", e.target.value)} placeholder="0" style={farmInp} autoFocus /></div>
            <div><label style={farmLbl}>Nota fiscal / documento</label><input value={f.documento} onChange={e => set("documento", e.target.value)} placeholder="Nº NF" style={farmInp} /></div>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.5 }}>Sem lote/validade? Deixe em branco — entra num lote genérico. Lançar por lote permite rastrear vencimento e recall.</div>
        </>) : (<>
          {lotesComSaldo.length === 0 ? (
            <div style={{ fontSize: 13, color: "#f43f5e", background: "#f43f5e12", border: "1px solid #f43f5e44", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>Não há saldo em estoque para dar baixa. Registre uma entrada primeiro.</div>
          ) : (<>
            <div style={{ marginBottom: 10 }}>
              <label style={farmLbl}>Lote (FEFO — vence primeiro no topo)</label>
              <select value={f.lote_id} onChange={e => set("lote_id", e.target.value)} style={farmInp}>
                {lotesComSaldo.map(l => { const vi = farmValidadeInfo(l.validade); return <option key={l.id} value={l.id}>{(l.lote || "sem lote")} · val {l.validade ? fmtDataBR(l.validade) : "—"}{vi.status === "vencido" ? " (VENCIDO)" : ""} · saldo {farmFmtQtd(l.quantidade)}</option>; })}
              </select>
            </div>
            {loteSel && farmValidadeInfo(loteSel.validade).status === "vencido" && <div style={{ fontSize: 11.5, color: "#f43f5e", marginBottom: 10, fontWeight: 600 }}>⚠ Lote vencido — a baixa deve ser por perda/descarte, não dispensação.</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div><label style={farmLbl}>Quantidade *</label><input type="number" min="0" step="any" value={f.quantidade} onChange={e => set("quantidade", e.target.value)} placeholder="0" style={farmInp} autoFocus /></div>
              <div><label style={farmLbl}>Motivo</label><select value={f.motivo} onChange={e => set("motivo", e.target.value)} style={farmInp}>{FARM_MOTIVOS_SAIDA.map(x => <option key={x} value={x}>{x}</option>)}</select></div>
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
function FarmKardexModal({ med, onClose }) {
  const [movs, setMovs] = useState(null);
  useEffect(() => { loadFarmMovimentos(med.id).then(setMovs); }, [med.id]);
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
                      <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>{ent ? "Entrada" : "Saída"} · {mv.motivo || "—"}{mv.lote ? ` · lote ${mv.lote}` : ""}{mv.paciente_iniciais ? ` · ${mv.paciente_iniciais}` : ""}</div>
                      <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{mv.created_at ? new Date(mv.created_at).toLocaleString("pt-BR") : ""}{mv.documento ? ` · doc ${mv.documento}` : ""}{mv.usuario ? ` · ${mv.usuario}` : ""}</div>
                    </div>
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
function FarmDispensacaoView({ currentUser, canEdit }) {
  const [atends, setAtends] = useState([]);
  const [itens, setItens] = useState([]);
  const [saidas, setSaidas] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [meds, setMeds] = useState([]);
  const [disp, setDisp] = useState(null);       // atendimento selecionado p/ dispensar
  const [avulsa, setAvulsa] = useState(false);
  const [, setTick] = useState(0);

  function refresh() {
    if (!USE_SUPABASE) return;
    loadPsAtendimentos().then(async ats => {
      setAtends(ats);
      const ids = ats.map(a => a.id);
      setItens(await loadPsPrescricaoItensByAtendimentos(ids));
      setSaidas(await loadFarmSaidasByAtendimentos(ids));
    });
    loadFarmLotes().then(setLotes);
    loadFarmMedicamentos().then(setMeds);
  }
  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => { window.removeEventListener("focus", onFocus); clearInterval(id); };
  }, []);

  const dispDoItem = itemId => saidas.filter(s => s.prescricao_item_id === itemId).reduce((a, s) => a + Number(s.quantidade || 0), 0);
  const fila = atends.map(a => {
    const its = itens.filter(i => i.atendimento_id === a.id);
    const pend = its.filter(i => { const q = Number(i.quantidade || 0); return q > 0 && dispDoItem(i.id) < q; });
    return { at: a, itens: its, pendentes: pend.length };
  }).filter(x => x.itens.length > 0).sort((a, b) => b.pendentes - a.pendentes);
  const comPendencia = fila.filter(f => f.pendentes > 0);

  async function registrarDispensacao(mov) {
    const r = await addFarmMovimentoRemote(mov, currentUser);
    if (!r.ok) { alert("Não foi possível dispensar.\n" + (r.erro || "")); return false; }
    const med = meds.find(m => m.id === mov.medicamento_id);
    addAuditLog(currentUser, "dispensação farmácia", `${mov.paciente_iniciais || "?"} · ${med?.nome || mov.medicamento_id} · ${farmFmtQtd(mov.quantidade)}`, {});
    setTimeout(refresh, 350);
    return true;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{comPendencia.length} paciente(s) do PS com itens pendentes de dispensação.</div>
        {canEdit && <button onClick={() => setAvulsa(true)} style={{ background: "transparent", color: "var(--text-2)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Dispensação avulsa</button>}
      </div>
      {fila.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Nenhuma prescrição com itens no PS no momento. Prescreva pelo Pronto-Socorro (aba Prescrição) — ou use a dispensação avulsa.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
          {fila.map(f => (
            <div key={f.at.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${f.pendentes ? "#d97706" : "#34d399"}`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <div style={{ fontWeight: 700 }}>{f.at.iniciais}{f.at.prontuario ? ` · reg. ${f.at.prontuario}` : ""}</div>
                <span style={{ fontSize: 11, color: f.pendentes ? "#d97706" : "#34d399", fontWeight: 700, whiteSpace: "nowrap" }}>{f.pendentes ? `${f.pendentes} pendente(s)` : "dispensado"}</span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10 }}>{f.itens.length} item(ns) prescrito(s){f.at.classificacao && MANCHESTER[f.at.classificacao] ? ` · ${MANCHESTER[f.at.classificacao].label}` : ""}</div>
              {canEdit && <button onClick={() => setDisp(f.at)} style={{ background: f.pendentes ? "#22d3ee" : "transparent", color: f.pendentes ? "#000" : "var(--text-3)", border: f.pendentes ? "none" : "1px solid var(--border)", borderRadius: 6, padding: "7px 14px", fontWeight: 700, cursor: "pointer", fontSize: 12.5 }}>{f.pendentes ? "Dispensar" : "Ver itens"}</button>}
            </div>
          ))}
        </div>
      )}
      {disp && <FarmDispensarModal atendimento={disp} itens={itens.filter(i => i.atendimento_id === disp.id)} saidas={saidas} lotes={lotes} onClose={() => setDisp(null)} onDispensar={registrarDispensacao} />}
      {avulsa && <FarmAvulsaModal meds={meds} lotes={lotes} onClose={() => setAvulsa(false)} onDispensar={registrarDispensacao} />}
    </div>
  );
}

// Dispensar os itens da prescrição de um paciente do PS
function FarmDispensarModal({ atendimento, itens, saidas, lotes, onClose, onDispensar }) {
  const [selItem, setSelItem] = useState(null);   // item aberto p/ dispensar (com _lotes)
  const [f, setF] = useState({ lote_id: "", quantidade: "" });
  const [busy, setBusy] = useState(false);
  const dispDoItem = itemId => saidas.filter(s => s.prescricao_item_id === itemId).reduce((a, s) => a + Number(s.quantidade || 0), 0);

  function abrir(item) {
    const ls = lotes.filter(l => l.medicamento_id === item.medicamento_id && Number(l.quantidade) > 0).sort((a, b) => (a.validade || "9999").localeCompare(b.validade || "9999"));
    const pend = Math.max(0, Number(item.quantidade || 0) - dispDoItem(item.id));
    setSelItem({ ...item, _lotes: ls });
    setF({ lote_id: ls[0]?.id || "", quantidade: pend || "" });
  }
  async function confirmar() {
    const q = Number(f.quantidade);
    if (!q || q <= 0) { alert("Informe a quantidade a dispensar."); return; }
    const lote = selItem._lotes.find(l => String(l.id) === String(f.lote_id));
    if (!lote) { alert("Sem lote em estoque para este medicamento. Registre uma entrada no Estoque."); return; }
    if (q > Number(lote.quantidade)) { alert(`Maior que o saldo do lote (disponível: ${farmFmtQtd(lote.quantidade)}).`); return; }
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
            const st = q <= 0 ? { c: "#8d99ab", t: "sem quantidade" } : pend <= 0 ? { c: "#34d399", t: "dispensado" } : disp > 0 ? { c: "#d97706", t: `parcial ${farmFmtQtd(disp)}/${farmFmtQtd(q)}` } : { c: "#8d99ab", t: "pendente" };
            const semVinculo = !it.medicamento_id;
            const aberto = selItem?.id === it.id;
            return (
              <div key={it.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 13px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <strong style={{ fontSize: 13 }}>{it.medicamento_nome}</strong>
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{it.dose ? `${it.dose} · ` : ""}{it.via || ""}{q ? ` · prescrito ${farmFmtQtd(q)} ${it.unidade || ""}` : ""}</div>
                  </div>
                  <span style={{ fontSize: 11, color: st.c, fontWeight: 700 }}>{st.t}</span>
                  {q > 0 && pend > 0 && !semVinculo && <button onClick={() => aberto ? setSelItem(null) : abrir(it)} style={btnLeito("#22d3ee")}>{aberto ? "Fechar" : "Dispensar"}</button>}
                  {semVinculo && <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>item livre — baixa avulsa</span>}
                </div>
                {aberto && (
                  <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                    {selItem._lotes.length === 0 ? (
                      <div style={{ fontSize: 12.5, color: "#f43f5e" }}>Sem estoque deste medicamento. Registre uma entrada no Estoque.</div>
                    ) : (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                        <div style={{ flex: "2 1 220px" }}>
                          <label style={farmLbl}>Lote (FEFO)</label>
                          <select value={f.lote_id} onChange={e => setF(p => ({ ...p, lote_id: e.target.value }))} style={farmInp}>
                            {selItem._lotes.map(l => { const vi = farmValidadeInfo(l.validade); return <option key={l.id} value={l.id}>{(l.lote || "sem lote")} · val {l.validade ? fmtDataBR(l.validade) : "—"}{vi.status === "vencido" ? " (VENCIDO)" : ""} · saldo {farmFmtQtd(l.quantidade)}</option>; })}
                          </select>
                        </div>
                        <div style={{ flex: "0 1 100px" }}>
                          <label style={farmLbl}>Qtd</label>
                          <input type="number" min="0" step="any" value={f.quantidade} onChange={e => setF(p => ({ ...p, quantidade: e.target.value }))} style={farmInp} />
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
  const lotesMed = f.medId ? lotes.filter(l => String(l.medicamento_id) === String(f.medId) && Number(l.quantidade) > 0).sort((a, b) => (a.validade || "9999").localeCompare(b.validade || "9999")) : [];
  const loteEfetivo = f.lote_id || (lotesMed[0]?.id ? String(lotesMed[0].id) : "");

  async function confirmar() {
    if (!f.iniciais.trim()) { alert("Informe as iniciais do paciente."); return; }
    const med = meds.find(m => String(m.id) === String(f.medId));
    if (!med) { alert("Escolha o medicamento."); return; }
    const lote = lotesMed.find(l => String(l.id) === String(loteEfetivo));
    if (!lote) { alert("Sem lote em estoque para este medicamento. Registre uma entrada no Estoque."); return; }
    const q = Number(f.quantidade);
    if (!q || q <= 0) { alert("Informe a quantidade."); return; }
    if (q > Number(lote.quantidade)) { alert(`Maior que o saldo do lote (disponível: ${farmFmtQtd(lote.quantidade)}).`); return; }
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
          <div><label style={farmLbl}>Iniciais *</label><input value={f.iniciais} onChange={e => set("iniciais", e.target.value)} placeholder="Ex.: M.S.O." style={farmInp} autoFocus /></div>
          <div><label style={farmLbl}>Prontuário</label><input value={f.prontuario} onChange={e => set("prontuario", e.target.value)} placeholder="registro" style={farmInp} /></div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={farmLbl}>Setor / leito (opcional)</label>
          <input value={f.setor} onChange={e => set("setor", e.target.value)} placeholder="Ex.: Enfermaria 2 · leito 12" style={farmInp} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={farmLbl}>Medicamento</label>
          <select value={f.medId} onChange={e => set("medId", e.target.value)} style={farmInp}>
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
              <label style={farmLbl}>Lote (FEFO)</label>
              {lotesMed.length === 0 ? <div style={{ ...farmInp, color: "#f43f5e" }}>Sem estoque</div> : (
                <select value={loteEfetivo} onChange={e => set("lote_id", e.target.value)} style={farmInp}>
                  {lotesMed.map(l => { const vi = farmValidadeInfo(l.validade); return <option key={l.id} value={l.id}>{(l.lote || "sem lote")} · val {l.validade ? fmtDataBR(l.validade) : "—"}{vi.status === "vencido" ? " (VENCIDO)" : ""} · saldo {farmFmtQtd(l.quantidade)}</option>; })}
                </select>
              )}
            </div>
            <div><label style={farmLbl}>Qtd</label><input type="number" min="0" step="any" value={f.quantidade} onChange={e => set("quantidade", e.target.value)} placeholder="0" style={farmInp} /></div>
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
function FarmIndicadoresView() {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth());
  const [ano, setAno] = useState(now.getFullYear());
  const [movs, setMovs] = useState([]);
  const [meds, setMeds] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [preview, setPreview] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const fromISO = new Date(ano, mes, 1).toISOString();
  const toISO = new Date(ano, mes + 1, 1).toISOString();

  function refresh() {
    if (!USE_SUPABASE) return;
    loadFarmMedicamentos().then(setMeds);
    loadFarmLotes().then(setLotes);
    setCarregando(true);
    loadFarmMovimentosPeriodo(fromISO, toISO).then(r => { setMovs(r); setCarregando(false); });
  }
  useEffect(() => { refresh(); const onF = () => refresh(); window.addEventListener("focus", onF); return () => window.removeEventListener("focus", onF); }, [mes, ano]);

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
  const saldo = m => farmSaldoTotal(m.id, lotes);
  const rupturas = ativos.filter(m => saldo(m) <= 0);
  const abaixoMin = ativos.filter(m => { const s = saldo(m); return s > 0 && Number(m.estoque_minimo || 0) > 0 && s <= Number(m.estoque_minimo); });
  const lotesEstoque = lotes.filter(l => Number(l.quantidade) > 0);
  const vencidosEstoque = lotesEstoque.filter(l => farmValidadeInfo(l.validade).status === "vencido");
  const venc30 = lotesEstoque.filter(l => farmValidadeInfo(l.validade).status === "vencendo");

  const qtdDispensada = dispensacoes.reduce((s, m) => s + Number(m.quantidade || 0), 0);
  const qtdEntradas = entradas.reduce((s, m) => s + Number(m.quantidade || 0), 0);
  const qtdPerdas = perdas.reduce((s, m) => s + Number(m.quantidade || 0), 0);
  const pacientes = new Set(dispensacoes.map(m => m.paciente_prontuario || m.paciente_iniciais || "").filter(Boolean)).size;

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
        <KPI label="Vencendo ≤30d" valor={fmt(venc30.length)} sub="lotes em estoque" cor={venc30.length ? "#d97706" : "#34d399"} />
      </div>

      {carregando && <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>Carregando movimentos…</div>}

      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6 }}>Curva ABC — consumo de {MONTHS_FULL[mes]}/{ano}</div>
      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10 }}>Classe A = 80% do consumo · B = próximos 15% · C = 5% restante. {abcCount.A} A · {abcCount.B} B · {abcCount.C} C.</div>
      {abc.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "1.5rem", border: "1px dashed var(--border)", borderRadius: 10, marginBottom: "1.5rem" }}>Nenhuma dispensação neste mês.</div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10, marginBottom: "1.5rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 520 }}>
            <thead><tr style={{ background: "var(--surface-2)", textAlign: "left", color: "var(--text-3)", fontSize: 11, textTransform: "uppercase" }}>
              <th style={{ padding: "8px 12px" }}>#</th><th style={{ padding: "8px 12px" }}>Medicamento</th><th style={{ padding: "8px 12px", textAlign: "right" }}>Consumo</th><th style={{ padding: "8px 12px", textAlign: "right" }}>%</th><th style={{ padding: "8px 12px", textAlign: "right" }}>Acum.</th><th style={{ padding: "8px 12px", textAlign: "center" }}>ABC</th>
            </tr></thead>
            <tbody>
              {abc.slice(0, 25).map((x, i) => (
                <tr key={x.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "7px 12px", color: "var(--text-muted)" }}>{i + 1}</td>
                  <td style={{ padding: "7px 12px" }}>{x.med?.nome || "—"}{x.med?.controlado && <span style={{ fontSize: 9, color: "#6366f1", marginLeft: 6, fontWeight: 800 }}>CONTROLADO</span>}</td>
                  <td style={{ padding: "7px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>{fmt(x.qtd)} <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 400 }}>{x.med?.unidade || ""}</span></td>
                  <td style={{ padding: "7px 12px", textAlign: "right", color: "var(--text-2)" }}>{fmt(x.pct)}%</td>
                  <td style={{ padding: "7px 12px", textAlign: "right", color: "var(--text-muted)" }}>{fmt(x.pctAcc)}%</td>
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
function FarmAnaliseView({ currentUser, canEdit }) {
  const [atends, setAtends] = useState([]);
  const [itens, setItens] = useState([]);
  const [meds, setMeds] = useState([]);
  const [interacoes, setInteracoes] = useState([]);
  const [incompatY, setIncompatY] = useState([]);
  const [showBase, setShowBase] = useState(false);
  const [aberto, setAberto] = useState({});
  const [, setTick] = useState(0);

  function refresh() {
    if (!USE_SUPABASE) return;
    loadFarmMedicamentos().then(setMeds);
    loadFarmInteracoes().then(setInteracoes);
    loadFarmIncompatY().then(setIncompatY);
    loadPsAtendimentos().then(async ats => {
      setAtends(ats);
      setItens(await loadPsPrescricaoItensByAtendimentos(ats.map(a => a.id)));
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
    const ctx = { idade: a.idade, peso: a.peso, clearance_renal: a.clearance_renal, funcao_hepatica: a.funcao_hepatica, alergias: a.alergias, em_sonda: a.em_sonda, gestante: a.gestante };
    return { at: a, itens: its, alertas: analisarPrescricaoClinica(its, ctx, medById, interacoes, incompatY) };
  }).filter(x => x.itens.length > 0).sort((a, b) => b.alertas.length - a.alertas.length);
  const totalAlertas = linhas.reduce((s, l) => s + l.alertas.length, 0);
  const comAlerta = linhas.filter(l => l.alertas.length > 0);
  const ctxResumo = a => [a.idade != null ? `${a.idade} anos` : null, a.em_sonda ? "sonda" : null, a.gestante ? "gestante" : null, a.clearance_renal != null ? `ClCr ${a.clearance_renal}` : null, a.alergias ? `alergia: ${a.alergias}` : null].filter(Boolean).join(" · ") || "contexto clínico não informado";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: "var(--text-muted)", flex: 1, minWidth: 240 }}>{comAlerta.length} paciente(s) com alertas · {totalAlertas} alerta(s). Apoio à decisão — os alertas assistem o farmacêutico e não substituem o julgamento clínico; a base é sujeita a validação da equipe.</div>
        <button onClick={() => setShowBase(true)} style={{ background: "transparent", color: "var(--text-2)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" }}>Base de interações ({interacoes.length + incompatY.length})</button>
      </div>
      {showBase && <FarmInteracoesModal interacoes={interacoes} incompatY={incompatY} currentUser={currentUser} canEdit={canEdit} onClose={() => { setShowBase(false); refresh(); }} />}
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
function FarmInteracoesModal({ interacoes, incompatY, currentUser, canEdit, onClose }) {
  const [sub, setSub] = useState("inter");
  const [lstI, setLstI] = useState(interacoes);
  const [lstY, setLstY] = useState(incompatY);
  const [fi, setFi] = useState({ substancia_a: "", substancia_b: "", gravidade: "moderada", descricao: "", conduta: "" });
  const [fy, setFy] = useState({ substancia_a: "", substancia_b: "", descricao: "" });
  const isMaster = currentUser?.role === "adm_master";
  const reload = () => { loadFarmInteracoes().then(setLstI); loadFarmIncompatY().then(setLstY); };
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 9px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 12.5, outline: "none", width: "100%", boxSizing: "border-box" };
  const gravCor = g => g === "grave" ? "#f43f5e" : g === "leve" ? "#3b82f6" : "#d97706";
  const subBtn = ativo => ({ background: ativo ? "#22d3ee" : "transparent", color: ativo ? "#000" : "var(--text-3)", border: `1px solid ${ativo ? "#22d3ee" : "var(--border)"}`, borderRadius: 7, padding: "6px 14px", fontWeight: 700, cursor: "pointer", fontSize: 12.5 });

  async function addInter() {
    if (!fi.substancia_a.trim() || !fi.substancia_b.trim()) { alert("Informe as duas substâncias."); return; }
    await upsertFarmInteracaoRemote({ substancia_a: fi.substancia_a.trim().toLowerCase(), substancia_b: fi.substancia_b.trim().toLowerCase(), gravidade: fi.gravidade, descricao: fi.descricao.trim() || null, conduta: fi.conduta.trim() || null }, currentUser);
    addAuditLog(currentUser, "farmácia: nova interação", `${fi.substancia_a} × ${fi.substancia_b}`, {});
    setFi({ substancia_a: "", substancia_b: "", gravidade: "moderada", descricao: "", conduta: "" });
    setTimeout(reload, 300);
  }
  async function delInter(id) { if (confirm("Remover esta interação?")) { await deleteFarmInteracaoRemote(id); setTimeout(reload, 200); } }
  async function addY() {
    if (!fy.substancia_a.trim() || !fy.substancia_b.trim()) { alert("Informe as duas substâncias."); return; }
    await upsertFarmIncompatRemote({ substancia_a: fy.substancia_a.trim().toLowerCase(), substancia_b: fy.substancia_b.trim().toLowerCase(), descricao: fy.descricao.trim() || null }, currentUser);
    addAuditLog(currentUser, "farmácia: nova incompatibilidade Y", `${fy.substancia_a} × ${fy.substancia_b}`, {});
    setFy({ substancia_a: "", substancia_b: "", descricao: "" });
    setTimeout(reload, 300);
  }
  async function delY(id) { if (confirm("Remover esta incompatibilidade?")) { await deleteFarmIncompatRemote(id); setTimeout(reload, 200); } }

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
                {isMaster && <button onClick={() => delInter(r.id)} style={btnLeito("#f43f5e")}>Excluir</button>}
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
                {isMaster && <button onClick={() => delY(r.id)} style={btnLeito("#f43f5e")}>Excluir</button>}
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
  async function encerrarLeito(leito, desfecho) {
    const obito = desfecho === "obito";
    if (!confirm(obito
      ? `Registrar ÓBITO do paciente do leito ${leito.identificacao}? O leito vai para HIGIENIZAÇÃO.`
      : `Dar alta do paciente do leito ${leito.identificacao}? O leito vai para HIGIENIZAÇÃO.`)) return;
    const now = nowISO();
    const dias = leito.data_internacao ? Math.max(0, Math.round((new Date(todayStr() + "T00:00:00") - new Date(leito.data_internacao + "T00:00:00")) / 86400000)) : null;
    await registrarSaidaRemote({
      leito: leito.identificacao, iniciais: leito.iniciais, prontuario: leito.prontuario, cid: leito.cid,
      motivo: leito.motivo, data_internacao: leito.data_internacao, data_alta: todayStr(),
      disp_em: now, dias_permanencia: dias, desfecho,
    }, currentUser);
    await salvarLeito({
      identificacao: leito.identificacao, status: "higienizacao", disp_em: now, pronto_em: null, solic_em: null, entrada_em: null,
      iniciais: null, prontuario: null, motivo: null, cid: null, data_internacao: null, dias_previstos: null, interdicao_motivo: null,
    });
    addAuditLog(currentUser, obito ? "óbito no leito" : "dar alta", leito.identificacao, {});
  }
  const darAlta = leito => encerrarLeito(leito, "alta");
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
                      <button onClick={() => encerrarLeito(l, "obito")} style={btnLeito("#f43f5e")}>Óbito</button>
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
    { id: "farmacia", icon: "pill", label: "Farmácia" },
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
          {active === "farmacia"  && <FarmaciaPage currentUser={currentUser} canEdit={canLaunch} />}
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
