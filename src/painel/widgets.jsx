// ═══════════════════════════════════════════════════════════
// PAINEL — OS QUATRO MOSTRADORES
//
// Anel de progresso, cartão de número, selo de variação e semáforo de
// meta. São de apresentação: recebem número pronto e desenham.
//
// ⚠️ `StatCard` é usado pelo Centro de Monitoramento E pela tela de
// especialidade — os outros três, só pela de especialidade. Ficam
// juntos porque compõem o mesmo painel e mudam juntos.
// ═══════════════════════════════════════════════════════════

import { VX } from "../ui/base.jsx";
import { fmt } from "../util/formato.js";
export function RingGauge({ value, max, color, label, sub, size = 120 }) {
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

export function StatCard({ label, value, sub, color, big }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderTop: `2px solid ${color}`, borderRadius: 8, padding: "12px 14px", flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: big ? 28 : 22, fontWeight: 600, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function DeltaBadge({ value, meta }) {
  if (!meta || value === 0) return null;
  const diff = value - meta, pct = Math.round((diff / meta) * 100), above = diff >= 0;
  return (
    <span style={{ background: above ? "#0a3d2a" : "#3d0f18", color: above ? "#34d399" : "#fb7185", border: `1px solid ${above ? "#34d399" : "#fb7185"}`, borderRadius: 99, fontSize: 11, fontWeight: 700, padding: "2px 8px", fontFamily: "JetBrains Mono, monospace" }}>
      {above ? "▲" : "▼"} {Math.abs(pct)}% {above ? "acima" : "abaixo"} da meta
    </span>
  );
}

export function SemaforoMeta({ pct, diasRestantes }) {
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
