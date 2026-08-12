// ═══════════════════════════════════════════════════════════
// MÓDULO FATURAMENTO (SUS) — a casca com sub-abas lateralizadas
//
// Estrutura aprovada pela Laura (padrão NSP: barra lateral própria):
//   Gestão:        Visão executiva · Pendentes · Glosas · Receitas
//   Inteligência:  Análises · Previsões · Convênios & contratos
//   Referência:    Tabela SIGTAP · Assistente AI
//
// O QUE JÁ TEM MOTOR: a Tabela SIGTAP (os 219 + glosa de permanência,
// lê `sigtap_procedimentos`). A Visão Executiva está com **layout pronto e
// dados ILUSTRATIVOS** (marcados como prévia) — os números reais entram
// quando a conta se montar do prontuário e o motor de glosa existir. As
// demais abas são placeholders honestos do que vai viver ali.
//
// O cérebro do hero é canvas 2D puro (sem lib) — anatômico, girando, com
// uma sinapse azul cruzando o centro. Anima em useEffect e limpa no unmount.
//
// NÃO é o Faturamento.jsx do Adauam (a conta por atendimento, no módulo
// Atendimento). Fronteira compartilhada — Convênios/Contratos/Receitas
// mexem no domínio dele; alinhar antes de construir cada um.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useRef } from "react";
import {
  montarProcedimento, codigoFormatado, viaDoProcedimento,
  avaliarPermanencia, avaliarGlosa, GRAVIDADES,
} from "./sigtap.js";

const TEAL = "#2dd4bf";
const VIA_LABEL = { aih: "AIH", apac: "APAC", bpa: "BPA" };
const COR_GRAV = { [GRAVIDADES.IMPEDIMENTO]: "#ef4444", [GRAVIDADES.ATENCAO]: "#f59e0b" };

const cx = {
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 13, padding: "16px 18px" },
  rotulo: { fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-muted)" },
  input: { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", color: "var(--text)", fontSize: 14 },
};

function Ico({ children, size = 17 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {children}
    </svg>
  );
}
const IC = {
  visao: <path d="M4 5h16v6H4zM4 15h7v4H4zM15 15h5v4h-5z" />,
  pendentes: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7M9 16h7M9 8h3" /></>,
  glosas: <><path d="M12 3l9 5v8l-9 5-9-5V8z" /><path d="M12 8v5M12 16.5v.01" /></>,
  receitas: <><path d="M3 6h18v12H3z" /><path d="M12 9a3 3 0 100 6 3 3 0 000-6" /></>,
  analises: <><path d="M4 20V4M4 20h16" /><path d="M8 16l3-4 3 2 4-6" /></>,
  previsoes: <><path d="M4 18l5-6 3 3 6-8" /><path d="M15 7h4v4" /></>,
  convenios: <path d="M8 7a4 4 0 118 0M4 21a5 5 0 0110 0M14 13a4 4 0 016 3" />,
  sigtap: <><path d="M4 5h16v14H4z" /><path d="M4 10h16M9 5v14" /></>,
  assistente: <><path d="M4 5h16v11H9l-4 4z" /><path d="M8 10h8M8 13h5" /></>,
};

const FAT_NAV = [
  { grupo: "Gestão", itens: [
    { key: "visao", label: "Visão executiva" },
    { key: "pendentes", label: "Pendentes" },
    { key: "glosas", label: "Glosas" },
    { key: "receitas", label: "Receitas" },
  ] },
  { grupo: "Inteligência", itens: [
    { key: "analises", label: "Análises" },
    { key: "previsoes", label: "Previsões" },
    { key: "convenios", label: "Convênios & contratos" },
  ] },
  { grupo: "Referência", itens: [
    { key: "sigtap", label: "Tabela SIGTAP" },
    { key: "assistente", label: "Assistente AI" },
  ] },
];

const EM_CONSTRUCAO = {
  pendentes: "Contas abertas, montadas do prontuário, a revisar e fechar — com a auditoria de conta antes de faturar.",
  glosas: "Glosas recebidas → análise do motivo → recurso no prazo → recuperação. O coração do faturamento hospitalar.",
  receitas: "Faturado × recebido × glosado, por competência e por convênio (repasse).",
  analises: "BI do faturamento: produção, índice de glosa, ticket médio, rejeição.",
  previsoes: "Projeção de receita a receber, a partir do faturado e do histórico.",
  convenios: "Convênios, planos e contratos — tabela de preço e regras por operadora.",
  assistente: "Assistente que responde sobre a produção, a glosa e os prazos do faturamento.",
};

// ── Cérebro 3D (canvas puro) ────────────────────────────────
function BrainCanvas() {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !cv.getContext) return;
    const ctx = cv.getContext("2d");
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const pts = [];
    const sp = (x, y, z, br) => pts.push({ x, y, z, b: br, ph: Math.random() * 6.28 });
    for (let i = 0; i < 2400; i++) {
      const u = Math.random(), v = Math.random(), th = Math.acos(2 * u - 1), ph = 6.2832 * v;
      let x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
      x *= 1.02; y *= 0.84; z *= 1.30;
      let r = 1;
      r += 0.12 * Math.exp(-Math.pow((z - 0.95) / 0.5, 2)) * Math.max(0, y + 0.25);
      r += 0.11 * Math.exp(-Math.pow((Math.abs(x) - 0.92) / 0.36, 2)) * Math.exp(-Math.pow((y + 0.28) / 0.42, 2)) * Math.exp(-Math.pow((z - 0.05) / 0.75, 2));
      r += 0.06 * Math.exp(-Math.pow((z + 1.02) / 0.4, 2)) * Math.max(0, y + 0.1);
      r += 0.055 * Math.sin(7 * ph + 3 * th) + 0.045 * Math.sin(13 * z) + 0.03 * Math.cos(11 * x + 3 * y);
      x *= r; y *= r; z *= r;
      if (y > 0) { const f = Math.exp(-(x * x) / 0.012); y -= f * 0.4 * Math.min(1, y + 0.15); x += (x > 0 ? 1 : -1) * f * 0.06; }
      if (y < -0.28) y = -0.28 + (y + 0.28) * 0.4;
      sp(x, y, z, Math.random() < 0.045);
    }
    for (let j = 0; j < 400; j++) {
      const u = Math.random(), v = Math.random(), th = Math.acos(2 * u - 1), ph = 6.2832 * v;
      const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
      const fol = 1 + 0.1 * Math.sin(15 * y);
      sp(x * 0.44 * fol, -0.5 + y * 0.30 * fol, -1.02 + z * 0.36 * fol, false);
    }
    for (let k = 0; k < 100; k++) { const tt = k / 100; sp((Math.random() - 0.5) * 0.11, -0.56 - tt * 0.4, -0.78 + tt * 0.24, false); }
    const hubs = []; for (let h = 0; h < pts.length; h += 14) hubs.push(pts[h]);
    const links = [];
    for (let a1 = 0; a1 < hubs.length; a1++) {
      let best = -1, bd = 9;
      for (let b1 = 0; b1 < hubs.length; b1++) {
        if (a1 === b1) continue;
        const dx = hubs[a1].x - hubs[b1].x, dy = hubs[a1].y - hubs[b1].y, dz = hubs[a1].z - hubs[b1].z, d = dx * dx + dy * dy + dz * dz;
        if (d < bd) { bd = d; best = b1; }
      }
      if (best >= 0 && bd < 0.15) links.push([hubs[a1], hubs[best]]);
    }
    let W, H, ox, oy, R;
    const resize = () => {
      W = cv.clientWidth || 600; H = cv.clientHeight || 300;
      cv.width = W * DPR; cv.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ox = W / 2; oy = H / 2; R = Math.min(W, H) * 0.37;
    };
    window.addEventListener("resize", resize); resize();
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let a = 0.7, t = 0; const tx = 0.30, sX = Math.sin(tx), cX = Math.cos(tx);
    const proj = (p, ca, sa) => {
      const X = p.x * ca - p.z * sa, Z = p.x * sa + p.z * ca, Y = p.y;
      const Y2 = Y * cX - Z * sX, Z2 = Y * sX + Z * cX, pr = 2.7 / (2.7 + Z2);
      return { x: ox + X * pr * R, y: oy - Y2 * pr * R, s: pr };
    };
    const synA = { x: -1.18, y: 0.03, z: 0.12 }, synB = { x: 1.18, y: 0.03, z: 0.12 };
    const lerp = (A, B, f) => ({ x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f, z: A.z + (B.z - A.z) * f });
    let raf = 0;
    const frame = () => {
      t += 0.016; ctx.clearRect(0, 0, W, H); ctx.globalCompositeOperation = "lighter";
      const ca = Math.cos(a), sa = Math.sin(a);
      ctx.lineWidth = 0.7; ctx.strokeStyle = "rgba(45,212,191,0.10)";
      for (let l = 0; l < links.length; l++) {
        const A = proj(links[l][0], ca, sa), B = proj(links[l][1], ca, sa);
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
      }
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = proj(p, ca, sa);
        let al = 0.12 + 0.42 * q.s; if (al > 0.75) al = 0.75; let rad = 0.45 + 1.15 * q.s;
        if (p.b) { const ps = 0.5 + 0.5 * Math.sin(t * 2.2 + p.ph); al = 0.35 + 0.5 * ps; rad = 1.0 + 1.6 * q.s; ctx.fillStyle = "rgba(140,248,224," + al + ")"; }
        else ctx.fillStyle = "rgba(45,212,191," + al + ")";
        ctx.beginPath(); ctx.arc(q.x, q.y, rad, 0, 6.283); ctx.fill();
      }
      const core = proj({ x: 0, y: 0.05, z: 0 }, ca, sa);
      const gc = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, R * 0.55);
      gc.addColorStop(0, "rgba(165,255,238,0.45)"); gc.addColorStop(0.4, "rgba(45,212,191,0.12)"); gc.addColorStop(1, "rgba(45,212,191,0)");
      ctx.fillStyle = gc; ctx.beginPath(); ctx.arc(core.x, core.y, R * 0.55, 0, 6.283); ctx.fill();
      const cyc = (t * 0.5) % 2, f = cyc < 1 ? cyc : 2 - cyc;
      for (let tr = 6; tr >= 1; tr--) {
        const ft = f - tr * 0.028; if (ft < 0 || ft > 1) continue;
        const tj = proj(lerp(synA, synB, ft), ca, sa);
        ctx.fillStyle = "rgba(150,200,255," + (0.26 - tr * 0.035) + ")";
        ctx.beginPath(); ctx.arc(tj.x, tj.y, 3.4 - tr * 0.36, 0, 6.283); ctx.fill();
      }
      const pj = proj(lerp(synA, synB, f), ca, sa);
      const gg = ctx.createRadialGradient(pj.x, pj.y, 0, pj.x, pj.y, 17);
      gg.addColorStop(0, "rgba(215,238,255,0.95)"); gg.addColorStop(0.5, "rgba(125,180,255,0.4)"); gg.addColorStop(1, "rgba(125,180,255,0)");
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(pj.x, pj.y, 17, 0, 6.283); ctx.fill();
      ctx.fillStyle = "rgba(238,248,255,0.98)"; ctx.beginPath(); ctx.arc(pj.x, pj.y, 2.5, 0, 6.283); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      if (!reduce) { a += 0.0026; raf = requestAnimationFrame(frame); }
    };
    frame();
    return () => { if (raf) cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} style={{ display: "block", width: "100%", height: "100%" }} />;
}

// ── Visão Executiva (layout aprovado; dados ilustrativos) ───
function Kpi({ lbl, val, un, trend }) {
  return (
    <div style={cx.card}>
      <div style={cx.rotulo}>{lbl}</div>
      <div style={{ fontSize: 26, fontWeight: 600, margin: "10px 0 6px", fontVariantNumeric: "tabular-nums", letterSpacing: "-.01em" }}>
        {val}{un ? <small style={{ fontSize: 14, color: "var(--text-3)", fontWeight: 500 }}> {un}</small> : null}
      </div>
      <span style={{ fontSize: 12, color: "var(--text-3)" }}>{trend}</span>
    </div>
  );
}
function ViaRow({ n, pct, val, w, op }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "66px 1fr auto", alignItems: "center", gap: 13 }}>
      <span style={{ fontSize: 12.5, color: "var(--text-2)", fontWeight: 500 }}>{n}</span>
      <span style={{ height: 8, borderRadius: 5, background: "var(--surface-3)", overflow: "hidden" }}>
        <i style={{ display: "block", height: "100%", width: w, background: TEAL, opacity: op }} />
      </span>
      <span style={{ fontSize: 12.5, color: "var(--text-3)", minWidth: 118, textAlign: "right" }}>{pct} · <b style={{ color: "var(--text)", fontWeight: 600 }}>{val}</b></span>
    </div>
  );
}
function FarolRow({ sev, ic, titulo, desc, tag }) {
  const cor = sev === "red" ? "#ef4444" : sev === "amb" ? "#f59e0b" : TEAL;
  const bg = sev === "red" ? "rgba(239,68,68,.13)" : sev === "amb" ? "rgba(245,158,11,.13)" : "rgba(45,212,191,.12)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: `3px solid ${cor}`, borderRadius: 10 }}>
      <span style={{ width: 27, height: 27, borderRadius: 8, display: "grid", placeItems: "center", flex: "0 0 auto", background: bg, color: cor }}><Ico size={15}>{ic}</Ico></span>
      <span style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.4 }}><b style={{ color: "var(--text)", fontWeight: 600 }}>{titulo}</b><br />{desc}</span>
      <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap", background: bg, color: cor }}>{tag}</span>
    </div>
  );
}
function VisaoExecutiva({ totalProcs }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: "-.01em" }}>Visão executiva</h2>
          <p style={{ margin: "5px 0 0", color: "var(--text-3)", fontSize: 13 }}>O motor de inteligência lê a produção, a glosa e os prazos — e diz onde agir.</p>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(245,158,11,.13)", color: "#f59e0b", border: "1px solid rgba(245,158,11,.4)", borderRadius: 8, padding: "6px 11px", fontSize: 12, fontWeight: 600 }}>
          <Ico size={13}><><path d="M12 9v4M12 17v.01" /><path d="M10.3 4l-7 12a2 2 0 001.7 3h14a2 2 0 001.7-3l-7-12a2 2 0 00-3.4 0z" /></></Ico>
          Prévia · dados ilustrativos
        </span>
      </div>
      <p style={{ margin: "0 0 18px", fontSize: 12, color: "var(--text-muted)" }}>
        Os indicadores abaixo são de <b>exemplo</b> para validar o layout. Os números reais entram quando a conta se montar do prontuário e o motor de glosa estiver no ar.
      </p>

      {/* hero */}
      <section style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 1, background: "var(--border)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ background: "#0a111e", position: "relative", minHeight: 300 }}>
          <div style={{ position: "absolute", inset: 0 }}><BrainCanvas /></div>
          <div style={{ position: "absolute", left: 20, top: 18, pointerEvents: "none" }}>
            <div style={{ fontSize: 10, color: TEAL, letterSpacing: ".18em", textTransform: "uppercase", fontWeight: 700 }}>Inteligência do faturamento</div>
            <div style={{ marginTop: 7, fontSize: 13.5, color: "#b9c6da", maxWidth: 230, lineHeight: 1.5 }}>Cruza prontuário, SIGTAP e histórico de glosa para antecipar o que o hospital vai receber.</div>
          </div>
          <div style={{ position: "absolute", left: 20, right: 20, bottom: 15, display: "flex", gap: 18, fontSize: 11, color: "#516686", pointerEvents: "none" }}>
            <span><b style={{ color: TEAL }}>1.842</b> contas lidas</span>
            <span><b style={{ color: TEAL }}>{totalProcs || 219}</b> procedimentos</span>
            <span><b style={{ color: TEAL }}>tempo real</b></span>
          </div>
        </div>
        <div style={{ background: "var(--surface)", padding: "22px 24px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: ".18em", textTransform: "uppercase", fontWeight: 700 }}>Projeção de recebimento</div>
          <div style={{ fontSize: 32, fontWeight: 600, margin: "8px 0 2px", fontVariantNumeric: "tabular-nums" }}>R$ 2,10 mi</div>
          <div style={{ color: "var(--text-3)", fontSize: 12.5, marginBottom: 14 }}>dos R$ 2,31 mi faturados a receber — confiança 92%</div>
          {[
            { c: TEAL, t: "Índice de glosa em queda", d: "4,8% · melhor mês do ano", v: "−0,7 pp" },
            { c: "#f59e0b", t: "2 prazos críticos esta semana", d: "recurso Unimed · fechamento AIH", v: "R$ 61k" },
            { c: TEAL, t: "SIGTAP evita 3 dos 5 motivos de glosa", d: "antes de a conta ser enviada", v: "−R$ 53k" },
          ].map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 0", borderTop: "1px solid var(--border)" }}>
              <span style={{ width: 8, height: 8, borderRadius: 3, background: s.c, flex: "0 0 auto" }} />
              <div><div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>{s.t}</div><div style={{ fontSize: 12, color: "var(--text-3)" }}>{s.d}</div></div>
              <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>{s.v}</span>
            </div>
          ))}
        </div>
      </section>

      {/* kpis */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12, marginBottom: 16 }}>
        <Kpi lbl="Faturado no mês" val="R$ 1,84" un="mi" trend="▲ 6,2% vs jul" />
        <Kpi lbl="A receber" val="R$ 2,31" un="mi" trend="SUS + convênios" />
        <Kpi lbl="Índice de glosa" val="4,8" un="%" trend="▼ 0,7 pp vs jul" />
        <Kpi lbl="Prazo de recebimento" val="52" un="dias" trend="▼ 4 dias vs jul" />
      </div>

      {/* painéis */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={cx.card}>
          <h3 style={{ margin: "0 0 3px", fontSize: 14, fontWeight: 600 }}>Faturamento por via</h3>
          <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--text-muted)" }}>De onde vem a receita do mês</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            <ViaRow n="AIH" pct="62%" val="R$ 1,14 mi" w="100%" op={1} />
            <ViaRow n="BPA" pct="21%" val="R$ 387 mil" w="34%" op={0.72} />
            <ViaRow n="APAC" pct="11%" val="R$ 202 mil" w="18%" op={0.5} />
            <ViaRow n="TISS" pct="4%" val="R$ 74 mil" w="7%" op={0.34} />
            <ViaRow n="Particular" pct="2%" val="R$ 37 mil" w="4%" op={0.22} />
          </div>
        </div>
        <div style={cx.card}>
          <h3 style={{ margin: "0 0 3px", fontSize: 14, fontWeight: 600 }}>Farol de prazos</h3>
          <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--text-muted)" }}>O que vence — perdeu o prazo, perdeu o dinheiro</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <FarolRow sev="red" ic={<><path d="M12 9v4M12 17v.01" /><circle cx="12" cy="12" r="9" /></>} titulo="Recurso de glosa — Unimed" desc="R$ 42 mil · prazo de reapresentação" tag="vence amanhã" />
            <FarolRow sev="amb" ic={<><path d="M7 4v3M17 4v3M4 9h16M5 7h14v13H5z" /></>} titulo="Fechamento da AIH — ago/2026" desc="18 contas de internação a revisar" tag="3 dias" />
            <FarolRow sev="amb" ic={<><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7M9 16h7" /></>} titulo="Auditoria de conta pendente" desc="5 contas com item glosável sinalizado" tag="R$ 19 mil" />
            <FarolRow sev="ok" ic={<path d="M5 12l5 5L20 7" />} titulo="BPA ago/2026" desc="produção conferida, pronta para remessa" tag="12 dias" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tabela SIGTAP (motor real: os 219 + glosa de permanência) ─
function SigtapView({ rows, carregando }) {
  const [busca, setBusca] = useState("");
  const [selCodigo, setSelCodigo] = useState("");
  const [dias, setDias] = useState("");

  const procs = useMemo(() => rows.map(r => montarProcedimento({
    codigo: r.codigo, nome: r.nome, via: r.via, mediaPermanencia: r.media_permanencia,
    valorSh: r.valor_sh, valorSp: r.valor_sp, valorSa: r.valor_sa,
    sexo: r.sexo, idadeMin: r.idade_min, idadeMax: r.idade_max,
  })), [rows]);
  const competencia = rows[0]?.competencia || null;
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return procs;
    const soDig = q.replace(/\D/g, "");
    return procs.filter(p => (p.nome || "").toLowerCase().includes(q) || (soDig && (p.codigo || "").includes(soDig)));
  }, [procs, busca]);
  const sel = procs.find(p => p.codigo === selCodigo) || null;
  const diasN = /^\d+$/.test(String(dias).trim()) ? Number(dias) : null;
  const achados = sel ? avaliarGlosa({ proc: sel, permanenciaDias: diasN }) : [];
  const perm = sel ? avaliarPermanencia(sel, diasN) : null;

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 600 }}>Tabela SIGTAP</h2>
      <p style={{ margin: "0 0 4px", color: "var(--text-2)", fontSize: 14 }}>
        Tabela de procedimentos do SUS. {procs.length} procedimento(s) que o hospital fatura
        {competencia ? ` · competência ${competencia}` : ""}.
      </p>
      <p style={{ margin: "0 0 16px", color: "var(--text-muted)", fontSize: 12 }}>Referência oficial, somente leitura. Valores, CID e CBO entram com o pacote do DATASUS.</p>

      {carregando ? (
        <p style={{ color: "var(--text-muted)" }}>Carregando…</p>
      ) : procs.length === 0 ? (
        <div style={{ ...cx.card, color: "var(--text-2)" }}>
          Nenhum procedimento carregado. A migração <code>migracao-sigtap.sql</code> já rodou neste banco?
        </div>
      ) : (
        <>
          <section style={{ ...cx.card, marginBottom: 16 }}>
            <div style={cx.rotulo}>Testar glosa de permanência</div>
            {!sel ? (
              <p style={{ margin: "8px 0 0", color: "var(--text-muted)", fontSize: 13 }}>Clique num procedimento na lista abaixo para simular.</p>
            ) : (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{codigoFormatado(sel.codigo)} — {sel.nome}</div>
                <div style={{ margin: "4px 0 12px", fontSize: 12, color: "var(--text-muted)" }}>
                  Via {VIA_LABEL[viaDoProcedimento(sel)] || "—"} · média de permanência {sel.mediaPermanencia ?? "—"} {sel.mediaPermanencia != null ? "dia(s)" : ""}
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  Dias de internação:
                  <input type="number" min="0" value={dias} onChange={e => setDias(e.target.value)} style={{ ...cx.input, width: 90 }} placeholder="ex.: 12" />
                </label>
                {diasN == null ? null : perm?.media == null ? (
                  <p style={{ marginTop: 12, color: "var(--text-muted)", fontSize: 13 }}>Sem média cadastrada — nada a comparar.</p>
                ) : achados.length === 0 ? (
                  <p style={{ marginTop: 12, color: TEAL, fontSize: 13, fontWeight: 600 }}>✓ {perm.texto}</p>
                ) : (
                  <ul style={{ marginTop: 12, paddingLeft: 0, listStyle: "none", display: "grid", gap: 6 }}>
                    {achados.map((ac, i) => (
                      <li key={i} style={{ fontSize: 13, padding: "8px 10px", borderRadius: 8, border: `1px solid ${COR_GRAV[ac.gravidade] || "var(--border)"}`, color: COR_GRAV[ac.gravidade] || "var(--text)", background: "var(--surface-2)" }}>
                        <strong style={{ textTransform: "uppercase", fontSize: 11 }}>{ac.gravidade === GRAVIDADES.IMPEDIMENTO ? "Impedimento" : "Atenção"}</strong>{" · "}{ac.texto}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          <section style={cx.card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
              <div style={cx.rotulo}>Procedimentos ({filtrados.length})</div>
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou código…" style={{ ...cx.input, minWidth: 220, flex: "0 1 320px" }} />
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
                    <th style={{ padding: "6px 8px" }}>Código</th>
                    <th style={{ padding: "6px 8px" }}>Procedimento</th>
                    <th style={{ padding: "6px 8px" }}>Via</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>Média perm.</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(p => {
                    const ativo = p.codigo === selCodigo;
                    return (
                      <tr key={p.codigo} onClick={() => setSelCodigo(p.codigo)} style={{ cursor: "pointer", borderTop: "1px solid var(--border)", background: ativo ? "var(--surface-3)" : "transparent" }}>
                        <td style={{ padding: "6px 8px", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{codigoFormatado(p.codigo)}</td>
                        <td style={{ padding: "6px 8px" }}>{p.nome}</td>
                        <td style={{ padding: "6px 8px" }}>{VIA_LABEL[viaDoProcedimento(p)] || "—"}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right" }}>{p.mediaPermanencia ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function EmConstrucao({ titulo, desc }) {
  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 600 }}>{titulo}</h2>
      <div style={{ ...cx.card, textAlign: "center", padding: "52px 24px", marginTop: 12 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: TEAL, marginBottom: 12 }}>
          <Ico size={14}><><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></></Ico> Em construção
        </div>
        <div style={{ fontSize: 14, color: "var(--text-2)", maxWidth: 460, margin: "0 auto", lineHeight: 1.55 }}>{desc}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>Entra na Fase 4 do Tier 1.</div>
      </div>
    </div>
  );
}

// ── Shell ───────────────────────────────────────────────────
export default function FaturamentoPage({ sb, currentUser, canEdit }) {
  const [sub, setSub] = useState("visao");
  const [rows, setRows] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = sb ? await sb("sigtap_procedimentos?select=*&order=codigo") : [];
        if (vivo) setRows(Array.isArray(r) ? r : []);
      } catch { if (vivo) setRows([]); }
      finally { if (vivo) setCarregando(false); }
    })();
    return () => { vivo = false; };
  }, [sb]);

  const titulo = { pendentes: "Pendentes", glosas: "Glosas", receitas: "Receitas", analises: "Análises", previsoes: "Previsões", convenios: "Convênios & contratos", assistente: "Assistente AI" };

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0, color: "var(--text)" }}>
      <aside style={{ width: 208, flex: "0 0 auto", background: "var(--surface-2)", borderRight: "1px solid var(--border)", padding: "16px 10px", overflowY: "auto" }}>
        {FAT_NAV.map(g => (
          <div key={g.grupo}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: ".14em", textTransform: "uppercase", fontWeight: 600, padding: "12px 10px 6px" }}>{g.grupo}</div>
            {g.itens.map(it => {
              const ativo = sub === it.key;
              return (
                <button key={it.key} onClick={() => setSub(it.key)} style={{
                  display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left",
                  padding: "9px 10px", borderRadius: 8, cursor: "pointer", fontSize: 13,
                  border: "none", borderLeft: `2px solid ${ativo ? TEAL : "transparent"}`,
                  background: ativo ? "var(--surface-3)" : "transparent",
                  color: ativo ? "var(--text)" : "var(--text-3)", fontFamily: "inherit",
                }}>
                  <Ico>{IC[it.key]}</Ico>{it.label}
                </button>
              );
            })}
          </div>
        ))}
      </aside>

      <div style={{ flex: 1, minWidth: 0, overflow: "auto", padding: "22px 26px 40px" }}>
        {sub === "visao" && <VisaoExecutiva totalProcs={rows.length} />}
        {sub === "sigtap" && <SigtapView rows={rows} carregando={carregando} />}
        {EM_CONSTRUCAO[sub] && <EmConstrucao titulo={titulo[sub]} desc={EM_CONSTRUCAO[sub]} />}
      </div>
    </div>
  );
}
