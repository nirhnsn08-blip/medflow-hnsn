// ═══════════════════════════════════════════════════════════
// MÓDULO FATURAMENTO (SUS) — a casca com sub-abas lateralizadas
//
// Estrutura aprovada pela Laura (padrão NSP: barra lateral própria):
//   Gestão:        Visão executiva · Pendentes · Glosas · Receitas
//   Inteligência:  Análises · Previsões · Convênios & contratos
//   Referência:    Tabela SIGTAP · Assistente AI
//
// O QUE JÁ TEM MOTOR: a Tabela SIGTAP (os 219 + glosa de permanência,
// lê `sigtap_procedimentos`), a conta do prontuário (aba Pendentes) e a
// **Visão Executiva** — que agora lê a worklist de verdade (`resumoFaturamento`):
// funil das internações, backlog esperando conta, valor de referência SIGTAP
// e farol de sinais reais. Sem número inventado — o que não existe (faturado ×
// recebido × glosa real) não é mostrado. As demais abas são placeholders
// honestos do que vai viver ali.
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
  avaliarPermanencia, avaliarGlosa, GRAVIDADES, valorReferencia,
} from "./sigtap.js";
import { montarContaDoProntuario, escolherInternacao, montarWorklist } from "./montar-conta.js";
import { resumoFaturamento, resumoPorVia, resumoDeContas } from "./resumo-faturamento.js";
import { reais, centavos, STATUS_CONTA, VIAS } from "./faturamento.js";
import {
  carregarAtendimento, carregarCatalogos, carregarAdministracoes, carregarLeitosDoEpisodio,
  carregarConta, carregarItensDaConta, abrirConta, acrescentarItem, carregarWorklistFaturamento,
  carregarProducaoFaturavel, contasDaCompetencia, registrarTransmissao,
} from "./dados.js";
import { validarTransmissao, resumoDaTransmissao, hojeLocal, PROTOCOLO_MAX } from "./remessa.js";
import { listaLida } from "../util/leitura.js";
import GlosasView from "./GlosasView.jsx";
import AnalisesView from "./AnalisesView.jsx";

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
  receitas: "Faturado × recebido × glosado, por competência e por convênio (repasse).",
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

// ── Visão Executiva (motor real: resumoFaturamento lê a worklist) ──
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
function FunilRow({ label, n, max, dim }) {
  const w = max > 0 ? Math.max(2, Math.round((n / max) * 100)) : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "128px 1fr 34px", alignItems: "center", gap: 13 }}>
      <span style={{ fontSize: 12.5, color: "var(--text-2)", fontWeight: 500 }}>{label}</span>
      <span style={{ height: 8, borderRadius: 5, background: "var(--surface-3)", overflow: "hidden" }}>
        <i style={{ display: "block", height: "100%", width: `${w}%`, background: TEAL, opacity: dim ? 0.4 : 1 }} />
      </span>
      <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 600, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{n}</span>
    </div>
  );
}
function ViaBar({ label, n, valorRef, max }) {
  const w = max > 0 && valorRef != null ? Math.max(2, Math.round((valorRef / max) * 100)) : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr auto", alignItems: "center", gap: 13 }}>
      <span style={{ fontSize: 12.5, color: "var(--text-2)", fontWeight: 500 }}>
        {label} <small style={{ color: "var(--text-muted)", fontWeight: 400 }}>· {n}</small>
      </span>
      <span style={{ height: 8, borderRadius: 5, background: "var(--surface-3)", overflow: "hidden" }}>
        <i style={{ display: "block", height: "100%", width: `${w}%`, background: TEAL }} />
      </span>
      <span style={{ fontSize: 12.5, color: "var(--text)", fontWeight: 600, minWidth: 96, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {valorRef != null ? reais(valorRef) : "—"}
      </span>
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
const FAROL_IC = {
  "backlog-velho": <><path d="M12 9v4M12 17v.01" /><path d="M10.3 4l-7 12a2 2 0 001.7 3h14a2 2 0 001.7-3l-7-12a2 2 0 00-3.4 0z" /></>,
  "aberta-a-fechar": <><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7M9 16h7" /></>,
  glosada: <><path d="M12 3l9 5v8l-9 5-9-5V8z" /><path d="M12 8v5M12 16.5v.01" /></>,
  "em-dia": <path d="M5 12l5 5L20 7" />,
};


/**
 * AS CONTAS DA COMPETÊNCIA — onde o ambulatório aparece.
 *
 * 🔴 Todo número acima sai da worklist, que é `desfecho=eq.internacao`.
 * O funil diz isso no subtítulo; os KPIs não diziam. Uma remessa de BPA
 * inteira podia sair e nenhum número da tela se mexia.
 *
 * ⚠️ Fica FORA do `canEdit`: ver quanto o mês tem não é privilégio de quem
 * pode transmitir. Quem só consulta precisa do número tanto quanto.
 *
 * ⚠️ E não se mistura com o funil, de propósito. Ambulatório tem muito mais
 * episódio que internação; somar os dois afogaria o sinal da internação,
 * que é onde corre o prazo da AIH.
 */
function ContasDaCompetencia({ sb, competencia, recarga }) {
  const [contas, setContas] = useState(null);   // null = carregando

  useEffect(() => {
    let vivo = true;
    if (!competencia) { setContas([]); return; }
    contasDaCompetencia(sb, competencia, { limite: 1000 })
      .then(r => { if (vivo) setContas(r); })
      .catch(() => { if (vivo) setContas([]); });
    return () => { vivo = false; };
  }, [sb, competencia, recarga]);

  const R = useMemo(() => resumoDeContas(contas || []), [contas]);
  if (contas === null) return null;

  const caixa = (rotulo, valor, cor, nota) => (
    <div key={rotulo} style={{ background: "var(--surface-2)", border: "1px solid var(--border)",
                               borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase",
                    color: "var(--text-muted)", fontWeight: 700 }}>{rotulo}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: cor, fontVariantNumeric: "tabular-nums" }}>{valor}</div>
      {nota && <div style={{ fontSize: 11, color: "var(--text-3)" }}>{nota}</div>}
    </div>
  );

  return (
    <div style={{ ...cx.card, marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 3px", fontSize: 14, fontWeight: 600 }}>
        Contas da competência {competencia}
      </h3>
      <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
        Estas são <b>todas</b> as contas do mês, de qualquer origem — inclusive as do ambulatório,
        que não aparecem nos números de internação acima.
      </p>

      {R.vazio ? (
        <div style={{ fontSize: 13, color: "var(--text-3)" }}>
          Nenhuma conta nesta competência ainda.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 10, marginBottom: 12 }}>
            {caixa("Abertas", R.porSituacao.aberta, "#f59e0b", "a revisar e fechar")}
            {caixa("Esperando remessa", R.esperandoRemessa, R.esperandoRemessa > 0 ? "#f59e0b" : TEAL, "fechadas, prontas e paradas")}
            {caixa("Faturadas", R.porSituacao.faturada, TEAL, "transmissão registrada")}
            {caixa("Glosadas", R.porSituacao.glosada, R.porSituacao.glosada > 0 ? "#f43f5e" : "var(--text-2)", "recusadas pelo órgão")}
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
                <th style={{ padding: "5px 0", fontWeight: 600 }}>VIA</th>
                <th style={{ padding: "5px 0", fontWeight: 600 }}>TOTAL</th>
                <th style={{ padding: "5px 0", fontWeight: 600 }}>ABERTAS</th>
                <th style={{ padding: "5px 0", fontWeight: 600 }}>ESPERANDO REMESSA</th>
                <th style={{ padding: "5px 0", fontWeight: 600 }}>FATURADAS</th>
              </tr>
            </thead>
            <tbody>
              {R.vias.map(v => (
                <tr key={v} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "6px 0", fontWeight: 600 }}>{VIAS[v]?.label || v}</td>
                  <td style={{ padding: "6px 0", fontVariantNumeric: "tabular-nums" }}>{R.porVia[v].total}</td>
                  <td style={{ padding: "6px 0", fontVariantNumeric: "tabular-nums" }}>{R.porVia[v].aberta}</td>
                  <td style={{ padding: "6px 0", fontVariantNumeric: "tabular-nums" }}>{R.porVia[v].fechada}</td>
                  <td style={{ padding: "6px 0", fontVariantNumeric: "tabular-nums" }}>{R.porVia[v].faturada}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {R.porSituacao.cancelada > 0 && (
            <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 8 }}>
              {R.porSituacao.cancelada} cancelada(s) fora da tabela — conta cancelada não espera nada de ninguém.
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * REGISTRAR A TRANSMISSÃO DA REMESSA.
 *
 * 🔴 Sem esta tela, `faturada` era um estado inalcançável: a função que o
 * escreve existia em `dados.js` e nenhuma tela a chamava. O KPI "Faturadas
 * — já transmitidas ao SUS", logo acima, era zero por construção.
 *
 * ⚠️ O sistema NÃO gera o arquivo de remessa — é recusa deliberada e
 * documentada em `faturamento.js`. O que se registra aqui é o FATO de
 * alguém ter transmitido, com data e protocolo. É o que falta quando a
 * glosa chega e ninguém sabe em qual remessa a conta foi.
 *
 * ⚠️ E É SEM VOLTA — daí a confirmação nomear o que vai acontecer em vez
 * de perguntar "tem certeza?", que ninguém lê.
 */
function RegistrarRemessa({ sb, currentUser, competenciaAtual, aoRegistrar }) {
  const [competencia, setCompetencia] = useState(competenciaAtual || "");
  const [via, setVia] = useState("");
  const [protocolo, setProtocolo] = useState("");
  const [quando, setQuando] = useState(hojeLocal());
  const [contas, setContas] = useState(null);   // null = ainda não buscou
  const [buscando, setBuscando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [msg, setMsg] = useState(null);         // { tom, texto }

  useEffect(() => {
    let vivo = true;
    if (!competencia) { setContas(null); return; }
    setBuscando(true);
    (async () => {
      const r = await contasDaCompetencia(sb, competencia, { limite: 1000 }).catch(() => []);
      if (vivo) { setContas(r); setBuscando(false); setMsg(null); }
    })();
    return () => { vivo = false; };
  }, [sb, competencia]);

  const v = useMemo(
    () => validarTransmissao({ contas: contas || [], competencia, via, protocolo, quando }),
    [contas, competencia, via, protocolo, quando]
  );
  const resumo = useMemo(() => resumoDaTransmissao(v.contas), [v.contas]);

  async function registrar() {
    if (!v.ok || gravando) return;
    const linhas = resumo.vias.map(x => `  • ${x}: ${resumo.porVia[x]}`).join("\n");
    // Nomeia o que vai acontecer. "Tem certeza?" ninguém lê.
    if (!confirm(
      `Registrar a transmissão de ${resumo.quantas} ${resumo.quantas === 1 ? "conta" : "contas"} da competência ${competencia}:\n\n${linhas}\n\n` +
      `Elas passam a FATURADA, e faturada não reabre — a correção depois da transmissão é glosa.\n\nConfirmar?`)) return;

    setGravando(true);
    const r = await registrarTransmissao(sb, v.contas.map(c => c.id),
      { protocolo, transmitidaEm: quando }, currentUser);
    setGravando(false);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    setMsg({
      tom: r.parcial ? "aviso" : "ok",
      texto: r.parcial ? r.motivo
        : `${r.contas.length} ${r.contas.length === 1 ? "conta transmitida" : "contas transmitidas"} em ${quando}${protocolo ? ` · protocolo ${protocolo}` : ""}.`,
    });
    setProtocolo("");
    const recarregado = await contasDaCompetencia(sb, competencia, { limite: 1000 }).catch(() => []);
    setContas(recarregado);
    aoRegistrar?.();
  }

  const rotulo = { fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 700, display: "block", marginBottom: 5 };
  const entrada = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 13 };

  return (
    <div style={{ ...cx.card, marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 3px", fontSize: 14, fontWeight: 600 }}>Registrar transmissão da remessa</h3>
      <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
        O sistema não gera o arquivo da remessa — quem transmite é você, pelo canal do órgão.
        Aqui se registra que a remessa <b>saiu</b>: é por este registro que se sabe, quando a glosa
        chegar, em qual remessa a conta foi e quem a enviou.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "130px 150px 150px 1fr", gap: 10, marginBottom: 12 }}>
        <label><span style={rotulo}>Competência</span>
          <input style={entrada} value={competencia} onChange={e => { setCompetencia(e.target.value); setMsg(null); }} placeholder="2026-08" />
        </label>
        <label><span style={rotulo}>Via</span>
          <select style={entrada} value={via} onChange={e => { setVia(e.target.value); setMsg(null); }}>
            <option value="">Todas as vias</option>
            {Object.entries(VIAS).map(([k, cfg]) => <option key={k} value={k}>{cfg.label}</option>)}
          </select>
        </label>
        <label><span style={rotulo}>Transmitida em</span>
          <input style={entrada} type="date" value={quando} max={hojeLocal()} onChange={e => { setQuando(e.target.value); setMsg(null); }} />
        </label>
        <label><span style={rotulo}>Protocolo do órgão</span>
          <input style={entrada} value={protocolo} maxLength={PROTOCOLO_MAX}
            onChange={e => { setProtocolo(e.target.value); setMsg(null); }} placeholder="opcional — mas é por ele que se acha a conta na glosa" />
        </label>
      </div>

      {buscando ? (
        <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0 }}>Procurando as contas fechadas…</p>
      ) : contas === null ? null : (
        <>
          {/* Só quando HÁ o que transmitir. Sem conta fechada, quem explica é
              o erro logo abaixo — repetir a mesma frase em dois lugares é a
              forma mais silenciosa de ensinar alguém a não ler nenhum dos dois. */}
          {resumo.quantas > 0 && (
            <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 10 }}>
              <b>{resumo.quantas}</b> {resumo.quantas === 1 ? "conta fechada entra" : "contas fechadas entram"} nesta remessa
              {resumo.vias.length > 1 ? ` — ${resumo.vias.map(x => `${x}: ${resumo.porVia[x]}`).join(" · ")}` : ""}.
            </div>
          )}

          {/* ⚠️ Enquanto o recibo da remessa que ACABOU de sair está na tela,
              nada de erro da próxima. Sem isto, quem transmite vê um
              "Nenhuma conta fechada nesta seleção" em vermelho logo ACIMA do
              próprio recibo — e lê como se tivesse falhado. Qualquer mexida
              num campo limpa o recibo e os avisos voltam. */}
          {msg?.tom !== "ok" && v.erros.map((e, i) => (
            <div key={`e${i}`} style={{ fontSize: 12.5, color: "#f43f5e", marginBottom: 6 }}>{e}</div>
          ))}
          {/* Avisos só acendem com sinal real — ver `validarTransmissao`. */}
          {msg?.tom !== "ok" && v.avisos.map((a, i) => (
            <div key={`a${i}`} style={{ fontSize: 12.5, color: "#f59e0b", marginBottom: 6 }}>{a}</div>
          ))}

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
            <button onClick={registrar} disabled={!v.ok || gravando}
              style={{ background: TEAL, color: "#03201c", border: "none", borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 700, opacity: !v.ok || gravando ? .45 : 1, cursor: !v.ok || gravando ? "not-allowed" : "pointer" }}>
              {gravando ? "Registrando…" : "Registrar transmissão"}
            </button>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Faturada não reabre — a correção depois da transmissão é glosa.
            </span>
          </div>
        </>
      )}

      {msg && (
        <div style={{ marginTop: 12, fontSize: 13, fontWeight: 500,
                      color: msg.tom === "erro" ? "#f43f5e" : msg.tom === "aviso" ? "#f59e0b" : TEAL }}>
          {msg.texto}
        </div>
      )}
    </div>
  );
}

function VisaoExecutiva({ sb, sigtapRows, currentUser, canEdit }) {
  const [dados, setDados] = useState(null); // null = ainda carregando
  // Sobe quando uma remessa é registrada: sem isto o KPI "Faturadas" fica
  // no número velho até alguém trocar de aba, e quem acabou de transmitir
  // não vê o próprio ato aparecer.
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        // A worklist (internações → conta) alimenta o funil; a produção
        // faturável inteira + os catálogos alimentam a visão por via — é onde
        // BPA/APAC aparecem, que a worklist de internações jamais mostraria.
        const [wl, producao, cat] = await Promise.all([
          carregarWorklistFaturamento(sb, { limite: 200 }),
          carregarProducaoFaturavel(sb, { limite: 500 }),
          carregarCatalogos(sb),
        ]);
        if (vivo) setDados({
          worklist: montarWorklist(wl.internacoes, wl.contas),
          producao,
          convenios: cat.convenios || [],
          procedimentos: cat.procedimentos || [],
        });
      } catch { if (vivo) setDados({ worklist: [], producao: [], convenios: [], procedimentos: [] }); }
    })();
    return () => { vivo = false; };
  }, [sb, recarga]);

  const carregando = dados === null;
  const R = useMemo(
    () => resumoFaturamento({ worklist: dados?.worklist || [], sigtapProcs: sigtapRows || [] }),
    [dados, sigtapRows]
  );
  const V = useMemo(
    () => resumoPorVia({
      producao: dados?.producao || [], convenios: dados?.convenios || [],
      procedimentos: dados?.procedimentos || [], sigtapProcs: sigtapRows || [],
    }),
    [dados, sigtapRows]
  );
  const maxFunil = Math.max(1, ...R.funil.map((f) => f.n));
  const maxVia = Math.max(1, ...V.porVia.map((v) => v.valorRef || 0));
  const totalProcs = (sigtapRows || []).length;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: "-.01em" }}>Visão executiva</h2>
          <p style={{ margin: "5px 0 0", color: "var(--text-3)", fontSize: 13 }}>Lê as internações faturáveis, o estágio da conta de cada uma e o que precisa de ação — em tempo real.</p>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(45,212,191,.12)", color: TEAL, border: "1px solid rgba(45,212,191,.35)", borderRadius: 8, padding: "6px 11px", fontSize: 12, fontWeight: 600 }}>
          <Ico size={13}><><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></></Ico>
          competência {R.competenciaAtual}
        </span>
      </div>

      {/* hero */}
      <section style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 1, background: "var(--border)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ background: "#0a111e", position: "relative", minHeight: 300 }}>
          <div style={{ position: "absolute", inset: 0 }}><BrainCanvas /></div>
          <div style={{ position: "absolute", left: 20, top: 18, pointerEvents: "none" }}>
            <div style={{ fontSize: 10, color: TEAL, letterSpacing: ".18em", textTransform: "uppercase", fontWeight: 700 }}>Inteligência do faturamento</div>
            <div style={{ marginTop: 7, fontSize: 13.5, color: "#b9c6da", maxWidth: 230, lineHeight: 1.5 }}>A conta se monta do prontuário e cruza com o SIGTAP — o painel mostra onde a produção está parada.</div>
          </div>
          <div style={{ position: "absolute", left: 20, right: 20, bottom: 15, display: "flex", gap: 18, fontSize: 11, color: "#516686", pointerEvents: "none" }}>
            <span><b style={{ color: TEAL }}>{carregando ? "—" : R.total}</b> internações lidas</span>
            <span><b style={{ color: TEAL }}>{totalProcs || "—"}</b> procedimentos</span>
            <span><b style={{ color: TEAL }}>tempo real</b></span>
          </div>
        </div>
        <div style={{ background: "var(--surface)", padding: "22px 24px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: ".18em", textTransform: "uppercase", fontWeight: 700 }}>Valor de referência SIGTAP</div>
          {carregando ? (
            <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 10 }}>Carregando…</div>
          ) : (
            <>
              <div style={{ fontSize: 32, fontWeight: 600, margin: "8px 0 2px", fontVariantNumeric: "tabular-nums" }}>{V.valorRefTotal != null ? reais(V.valorRefTotal) : "—"}</div>
              <div style={{ color: "var(--text-3)", fontSize: 12.5, marginBottom: 14 }}>
                de {V.total} {V.total === 1 ? "atendimento faturável" : "atendimentos faturáveis"} na tabela SUS — <b style={{ color: "var(--text-2)" }}>não é o faturado real</b>{V.semValorRef > 0 ? ` · ${V.semValorRef} sem preço` : ""}
              </div>
              {[
                { c: R.backlog > 0 ? "#f59e0b" : TEAL, t: `${R.backlog} ${R.backlog === 1 ? "internação esperando conta" : "internações esperando conta"}`, d: "a montar do prontuário", v: String(R.backlog) },
                { c: R.emAberto > 0 ? "#f59e0b" : TEAL, t: `${R.emAberto} ${R.emAberto === 1 ? "conta de internação aberta" : "contas de internação abertas"}`, d: "a revisar e fechar", v: String(R.emAberto) },
                // 🔴 "já transmitidas ao SUS" lia-se como afirmação sobre o
                // HOSPITAL e era sobre INTERNAÇÕES: uma remessa de BPA inteira
                // saía e este número não se mexia. O ambulatório aparece no
                // cartão "Contas da competência", abaixo.
                { c: TEAL, t: `${R.porSituacao.faturada} ${R.porSituacao.faturada === 1 ? "internação faturada" : "internações faturadas"}`, d: "transmitidas — só internação; o ambulatório está abaixo", v: String(R.porSituacao.faturada) },
              ].map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 0", borderTop: "1px solid var(--border)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 3, background: s.c, flex: "0 0 auto" }} />
                  <div><div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>{s.t}</div><div style={{ fontSize: 12, color: "var(--text-3)" }}>{s.d}</div></div>
                  <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>{s.v}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </section>

      {carregando ? (
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Carregando o resumo…</p>
      ) : R.vazio && V.vazio ? (
        <div style={{ ...cx.card, textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 14, color: "var(--text-2)", maxWidth: 520, margin: "0 auto", lineHeight: 1.55 }}>
            Ainda não há produção faturável. Assim que um atendimento for concluído com procedimento (e, na internação, a conta montada na aba <b>Pendentes</b>), os números aparecem aqui.
          </div>
        </div>
      ) : (
        <>
          {/* kpis reais (internações) */}
          {!R.vazio && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12, marginBottom: 16 }}>
              <Kpi lbl="Internações faturáveis" val={R.total} trend="com desfecho de internação" />
              <Kpi lbl="Esperando conta" val={R.backlog} trend="a montar do prontuário" />
              <Kpi lbl="Contas de internação abertas" val={R.emAberto} trend="a revisar e fechar" />
              {/* O rótulo agora diz o que o número mede. Ver o comentário no
                  hero e o cartão "Contas da competência". */}
              <Kpi lbl="Internações faturadas" val={R.porSituacao.faturada} trend="transmitidas — só internação" />
            </div>
          )}

          {/* O que faz o KPI "Faturadas" acima poder deixar de ser zero.
              Fica FORA do `!R.vazio`: hospital sem internação no mês ainda
              tem BPA para transmitir, e a tela sumiria justo para quem só
              fatura ambulatório. Só quem pode editar faturamento registra
              transmissão — é ato sem volta, e o crachá de quem transmitiu
              vai gravado. */}
          <ContasDaCompetencia sb={sb} competencia={R.competenciaAtual} recarga={recarga} />

          {canEdit && (
            <RegistrarRemessa sb={sb} currentUser={currentUser} competenciaAtual={R.competenciaAtual}
              aoRegistrar={() => setRecarga(n => n + 1)} />
          )}



          {/* faturamento por via (produção faturável · referência SIGTAP) */}
          {!V.vazio && (
            <div style={{ ...cx.card, marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                <div>
                  <h3 style={{ margin: "0 0 3px", fontSize: 14, fontWeight: 600 }}>Faturamento por via</h3>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Produção faturável concluída · valor de referência SIGTAP (não é o faturado real)</p>
                </div>
                {V.semValorRef > 0 && (
                  <span style={{ fontSize: 11, color: "#f59e0b", background: "rgba(245,158,11,.12)", borderRadius: 6, padding: "3px 9px", fontWeight: 600, whiteSpace: "nowrap" }}>{V.semValorRef} sem preço</span>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                {V.porVia.map((v) => (
                  <ViaBar key={v.via} label={v.label} n={v.n} valorRef={v.valorRef} max={maxVia} />
                ))}
              </div>
            </div>
          )}

          {/* painéis reais (internações) */}
          {!R.vazio && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={cx.card}>
                <h3 style={{ margin: "0 0 3px", fontSize: 14, fontWeight: 600 }}>Funil do faturamento</h3>
                <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--text-muted)" }}>Onde as internações estão no caminho da conta</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                  {R.funil.map((f) => (
                    <FunilRow key={f.chave} label={f.label} n={f.n} max={maxFunil} dim={f.n === 0} />
                  ))}
                </div>
              </div>
              <div style={cx.card}>
                <h3 style={{ margin: "0 0 3px", fontSize: 14, fontWeight: 600 }}>Farol</h3>
                <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--text-muted)" }}>O que precisa de ação — só sinal real</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {R.farol.length === 0 ? (
                    <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13 }}>Sem pendência a sinalizar.</p>
                  ) : (
                    R.farol.map((f) => (
                      <FarolRow key={f.chave} sev={f.sev} ic={FAROL_IC[f.chave]} titulo={f.titulo} desc={f.desc} tag={f.tag} />
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Tabela SIGTAP (motor real: os 219 + glosa de permanência) ─
function SigtapView({ rows, carregando }) {
  const [busca, setBusca] = useState("");
  const [selCodigo, setSelCodigo] = useState("");
  const [dias, setDias] = useState("");
  const [valor, setValor] = useState("");

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
  const valorCobrado = centavos(valor); // reais digitados → centavos (null se vazio/inválido)
  const achados = sel ? avaliarGlosa({ proc: sel, permanenciaDias: diasN, valorCobrado }) : [];
  const perm = sel ? avaliarPermanencia(sel, diasN) : null;
  const ref = sel ? valorReferencia(sel) : null;

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 600 }}>Tabela SIGTAP</h2>
      <p style={{ margin: "0 0 4px", color: "var(--text-2)", fontSize: 14 }}>
        Tabela de procedimentos do SUS. {procs.length} procedimento(s) que o hospital fatura
        {competencia ? ` · competência ${competencia}` : ""}.
      </p>
      <p style={{ margin: "0 0 16px", color: "var(--text-muted)", fontSize: 12 }}>Referência oficial, somente leitura. Valores (SH+SP) e CID já vieram das AIHs reais do SUS; o CBO entra com o pacote completo do DATASUS.</p>

      {carregando ? (
        <p style={{ color: "var(--text-muted)" }}>Carregando…</p>
      ) : procs.length === 0 ? (
        <div style={{ ...cx.card, color: "var(--text-2)" }}>
          Nenhum procedimento carregado. A migração <code>migracao-sigtap.sql</code> já rodou neste banco?
        </div>
      ) : (
        <>
          <section style={{ ...cx.card, marginBottom: 16 }}>
            <div style={cx.rotulo}>Testar glosa (permanência e valor)</div>
            {!sel ? (
              <p style={{ margin: "8px 0 0", color: "var(--text-muted)", fontSize: 13 }}>Clique num procedimento na lista abaixo para simular.</p>
            ) : (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{codigoFormatado(sel.codigo)} — {sel.nome}</div>
                <div style={{ margin: "4px 0 12px", fontSize: 12, color: "var(--text-muted)" }}>
                  Via {VIA_LABEL[viaDoProcedimento(sel)] || "—"} · média de permanência {sel.mediaPermanencia ?? "—"} {sel.mediaPermanencia != null ? "dia(s)" : ""} · referência SIGTAP {ref != null ? reais(ref) : "—"}
                </div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    Dias de internação:
                    <input type="number" min="0" value={dias} onChange={e => setDias(e.target.value)} style={{ ...cx.input, width: 90 }} placeholder="ex.: 12" />
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    Valor cobrado (R$):
                    <input value={valor} onChange={e => setValor(e.target.value)} style={{ ...cx.input, width: 120 }} placeholder="ex.: 850,00" />
                  </label>
                </div>
                {diasN == null && valorCobrado == null ? (
                  <p style={{ marginTop: 12, color: "var(--text-muted)", fontSize: 13 }}>Informe os dias e/ou o valor cobrado para simular.</p>
                ) : achados.length === 0 ? (
                  <p style={{ marginTop: 12, color: TEAL, fontSize: 13, fontWeight: 600 }}>✓ Sem glosa pelo que foi informado{perm?.texto ? ` · ${perm.texto}` : ""}.</p>
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
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>Valor (SH+SP)</th>
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
                        <td style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {p.valorSh != null || p.valorSp != null ? reais((p.valorSh || 0) + (p.valorSp || 0)) : "—"}
                        </td>
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

// ── Conta do prontuário (motor real: a conta se monta do episódio) ─
const TIPO_ITEM_LABEL = { procedimento: "Procedimento", diaria: "Diária", medicamento: "Medicamento", material: "Material", taxa: "Taxa" };
const SIT = {
  "sem-conta": { label: "Sem conta", cor: "#f59e0b", bg: "rgba(245,158,11,.14)" },
  aberta: { label: "Aberta", cor: TEAL, bg: "rgba(45,212,191,.14)" },
  fechada: { label: "Fechada", cor: "var(--text-2)", bg: "var(--surface-3)" },
  faturada: { label: "Faturada", cor: "var(--text-2)", bg: "var(--surface-3)" },
  glosada: { label: "Glosada", cor: "#ef4444", bg: "rgba(239,68,68,.14)" },
};
const SIT_DEFAULT = { label: "—", cor: "var(--text-muted)", bg: "var(--surface-3)" };

function subtotalCentavos(it) {
  const u = centavos(it.valor_unitario);
  return u === null ? null : u * Number(it.quantidade || 0);
}

function ContaDoProntuario({ sb, sigtapRows, canEdit, currentUser }) {
  const [numero, setNumero] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const [resultado, setResultado] = useState(null); // { conta, atendimento }
  const [lancando, setLancando] = useState(false);
  const [msgLanc, setMsgLanc] = useState(null);     // { tom, texto }
  const [worklist, setWorklist] = useState([]);
  const [carregandoWL, setCarregandoWL] = useState(true);

  async function carregarWL() {
    setCarregandoWL(true);
    try {
      const { internacoes, contas } = await carregarWorklistFaturamento(sb, { limite: 100 });
      setWorklist(montarWorklist(internacoes, contas));
    } catch { setWorklist([]); }
    finally { setCarregandoWL(false); }
  }
  useEffect(() => { carregarWL(); }, [sb]);   // só quando o cliente do banco troca — de propósito

  async function montar(idArg) {
    const n = String(idArg ?? numero).replace(/\D/g, "");
    if (!n) { setErro("Informe o número do atendimento."); return; }
    setNumero(n);
    setCarregando(true); setErro(null); setResultado(null); setMsgLanc(null);
    try {
      const atendimento = await carregarAtendimento(sb, n);
      if (!atendimento) { setErro(`Nenhum atendimento com o número ${n}.`); return; }
      // Catálogos e medicação administrada numa ida só. As administrações
      // vêm vazias (sem erro) enquanto a migração de leitura não tiver rodado
      // neste banco — a conta se monta assim mesmo, só sem a linha de remédio.
      const [cat, administracoes, leitos] = await Promise.all([
        carregarCatalogos(sb),
        carregarAdministracoes(sb, atendimento.id),
        carregarLeitosDoEpisodio(sb, { atendimentoId: atendimento.id, prontuario: atendimento.prontuario }),
      ]);
      const convenio = (cat.convenios || []).find((c) => String(c.id) === String(atendimento.convenio_id)) || null;
      // A permanência vem do LEITO (estadia real); só na falta dele o motor
      // estima pela passagem no PS, marcada como estimativa.
      const internacao = escolherInternacao({ leitoAtivo: leitos.leitoAtivo, saidas: leitos.saidas, atendimento });
      const conta = montarContaDoProntuario({
        atendimento,
        convenio,
        procedimentos: cat.procedimentos || [],
        sigtapProcs: sigtapRows || [],
        administracoes,
        internacao,
      });
      setResultado({ conta, atendimento, fonteInternacao: internacao?.fonte || null });
    } catch {
      setErro("Não consegui montar a conta agora. Tente de novo.");
    } finally {
      setCarregando(false);
    }
  }

  // Lança a proposta na CONTA DO EPISÓDIO (a mesma do módulo Atendimento, do
  // Adauam) — não uma paralela. Reusa as funções de escrita dele. É escrita
  // em produção, então: só numa conta vazia (nunca duplica), confirma antes,
  // e a política do banco ainda exige role de escrita (adm_silver+).
  async function lancar() {
    const r = resultado?.conta, at = resultado?.atendimento;
    if (!canEdit || lancando || !r || !at) return;
    if (r.itens.length === 0) { setMsgLanc({ tom: "erro", texto: "Nada a lançar — a conta montada está vazia." }); return; }
    if (!r.via) { setMsgLanc({ tom: "erro", texto: "Sem fonte pagadora (convênio) no atendimento — informe o convênio antes de lançar." }); return; }

    setLancando(true); setMsgLanc(null);
    try {
      // A conta já existe? Se sim e tiver item, não mexemos: acrescentar por
      // cima duplicaria a produção. Quem já começou a conta fecha na tela do
      // Atendimento; aqui a gente só monta a partir do zero.
      let conta = await carregarConta(sb, at.id);
      if (conta) {
        if (!STATUS_CONTA[conta.status]?.recebeItem) {
          setMsgLanc({ tom: "erro", texto: `A conta #${conta.id} está ${STATUS_CONTA[conta.status]?.label?.toLowerCase() || conta.status} e não recebe item novo. Reabra pela tela de Faturamento do Atendimento.` });
          return;
        }
        const existentes = await carregarItensDaConta(sb, conta.id);
        const ativos = existentes.filter((i) => !i.cancelado);
        if (ativos.length > 0) {
          setMsgLanc({ tom: "erro", texto: `Este atendimento já tem a conta #${conta.id} com ${ativos.length} item(ns). Para não duplicar, revise ou lance pela tela de Faturamento do Atendimento (a do Adauam).` });
          return;
        }
      }

      // 🔴 IMPEDIMENTO NÃO É AVISO. Antes, isto era uma linha acrescentada
      // ao texto do `confirm()`: quem clicasse OK lançava a conta com o
      // impedimento. Mas impedimento é determinístico — o SUS não paga com
      // sexo ou faixa etária incompatível —, então lançar assim é encaminhar
      // uma AIH que volta rejeitada, e a rejeição só aparece no
      // processamento do mês seguinte, quando refazer já custa competência.
      //
      // Não há override porque não há justificativa que faça o SUS pagar: o
      // caminho é corrigir o cadastro do paciente ou o procedimento — que é
      // exatamente o que o impedimento está apontando como errado.
      const impedimentos = (r.glosa || []).filter(a => a?.gravidade === GRAVIDADES.IMPEDIMENTO);
      if (impedimentos.length) {
        setMsgLanc({
          tom: "erro",
          texto: `Não dá para lançar: ${impedimentos.map(a => a.texto).join(" ")} `
               + "O SUS não paga assim. Corrija o cadastro do paciente ou o procedimento do atendimento e monte de novo.",
        });
        return;
      }

      const atencoes = (r.glosa || []).filter(a => a?.gravidade === GRAVIDADES.ATENCAO);
      const aviso = atencoes.length
        ? `\n\n⚠️ Exige justificativa no faturamento:\n${atencoes.map(a => `• ${a.texto}`).join("\n")}`
        : "";
      if (!confirm(`Lançar ${r.itens.length} item(ns) montados do prontuário na conta do atendimento #${at.id}?\n\nEles vão para a conta do episódio — a mesma que aparece no módulo Atendimento.${aviso}`)) {
        return;
      }

      if (!conta) {
        const ab = await abrirConta(sb, {
          atendimento_id: at.id, prontuario: at.prontuario,
          convenio_id: at.convenio_id, plano_id: at.plano_id,
          via: r.via, competencia: r.competencia,
        }, currentUser);
        if (!ab.ok) { setMsgLanc({ tom: "erro", texto: ab.motivo }); return; }
        conta = ab.conta;
      }

      let ok = 0; const erros = [];
      for (const it of r.itens) {
        const res = await acrescentarItem(sb, { ...it, conta_id: conta.id }, currentUser);
        if (res.ok) ok += 1; else erros.push(res.motivo);
      }

      if (erros.length) {
        setMsgLanc({ tom: "erro", texto: `Lancei ${ok} de ${r.itens.length}. O primeiro erro: ${erros[0]}` });
      } else {
        setMsgLanc({ tom: "ok", texto: `✓ ${ok} item(ns) lançados na conta #${conta.id}. A conta agora vive no módulo Atendimento → Faturamento, pronta para conferência e fechamento.` });
        carregarWL(); // a internação sai de "sem conta" para "aberta" na lista
      }
    } catch {
      setMsgLanc({ tom: "erro", texto: "Não consegui lançar agora. Tente de novo." });
    } finally {
      setLancando(false);
    }
  }

  const r = resultado?.conta || null;
  const at = resultado?.atendimento || null;

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 600 }}>Pendentes — conta do prontuário</h2>
      <p style={{ margin: "0 0 4px", color: "var(--text-2)", fontSize: 14 }}>
        A conta se monta sozinha do que aconteceu no episódio — o procedimento, a permanência, o diagnóstico —
        em vez de alguém digitar item por item. Você confere.
      </p>
      <p style={{ margin: "0 0 16px", color: "var(--text-muted)", fontSize: 12 }}>
        Monte a conta, confira, e lance na conta do episódio (a mesma do módulo Atendimento). O lançamento grava — só perfis com escrita na conta (adm_silver+).
      </p>

      {/* worklist: internações a faturar */}
      <section style={{ ...cx.card, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <div style={cx.rotulo}>Internações a faturar ({worklist.length})</div>
          <button onClick={carregarWL} disabled={carregandoWL} style={{ background: "transparent", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 7, padding: "5px 12px", fontSize: 12, cursor: carregandoWL ? "default" : "pointer" }}>
            {carregandoWL ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
        {carregandoWL ? (
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13 }}>Carregando…</p>
        ) : worklist.length === 0 ? (
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13 }}>
            Nenhuma internação encontrada. As internações do PS (desfecho “internação”) aparecem aqui para virar conta.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
                  <th style={{ padding: "6px 8px" }}>Paciente</th>
                  <th style={{ padding: "6px 8px" }}>Atend.</th>
                  <th style={{ padding: "6px 8px" }}>Internação</th>
                  <th style={{ padding: "6px 8px" }}>CID</th>
                  <th style={{ padding: "6px 8px" }}>Conta</th>
                  <th style={{ padding: "6px 8px" }} />
                </tr>
              </thead>
              <tbody>
                {worklist.map((row) => {
                  const sit = SIT[row.situacao] || SIT_DEFAULT;
                  const ativo = at && String(at.id) === String(row.id);
                  return (
                    <tr key={row.id} onClick={() => montar(row.id)} style={{ cursor: "pointer", borderTop: "1px solid var(--border)", background: ativo ? "var(--surface-3)" : "transparent" }}>
                      <td style={{ padding: "8px", fontWeight: 600 }}>{row.iniciais || "—"}</td>
                      <td style={{ padding: "8px", fontVariantNumeric: "tabular-nums", color: "var(--text-2)", whiteSpace: "nowrap" }}>#{row.id} · reg. {row.prontuario}</td>
                      <td style={{ padding: "8px", color: "var(--text-2)", whiteSpace: "nowrap" }}>{row.chegada_em ? new Date(row.chegada_em).toLocaleDateString("pt-BR") : "—"}</td>
                      <td style={{ padding: "8px", color: "var(--text-2)" }}>{row.cid || "—"}</td>
                      <td style={{ padding: "8px" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20, background: sit.bg, color: sit.cor, whiteSpace: "nowrap" }}>{sit.label}</span>
                      </td>
                      <td style={{ padding: "8px", textAlign: "right" }}>
                        <span style={{ color: TEAL, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>Montar →</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ ...cx.card, marginBottom: 16 }}>
        <div style={cx.rotulo}>Ou monte por número de atendimento</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <input
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && montar()}
            placeholder="Número do atendimento"
            style={{ ...cx.input, flex: 1, minWidth: 200 }}
          />
          <button
            onClick={() => montar()}
            disabled={carregando}
            style={{ background: carregando ? "var(--surface-3)" : TEAL, color: carregando ? "var(--text-muted)" : "#04201c", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: carregando ? "default" : "pointer", whiteSpace: "nowrap" }}
          >
            {carregando ? "Montando…" : "Montar conta"}
          </button>
        </div>
      </section>

      {erro && (
        <div style={{ ...cx.card, borderLeft: "3px solid #ef4444", background: "rgba(239,68,68,.08)", marginBottom: 16, fontSize: 13 }}>
          {erro}
        </div>
      )}

      {r && at && (
        <>
          {/* cabeçalho do episódio */}
          <section style={{ ...cx.card, marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{at.iniciais || "—"}</div>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                atend. #{at.id} · reg. {at.prontuario}
                {at.chegada_em ? ` · ${new Date(at.chegada_em).toLocaleDateString("pt-BR")}` : ""}
              </span>
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: ".04em" }}>Via</span>
                <b style={{ background: "rgba(45,212,191,.14)", color: TEAL, borderRadius: 6, padding: "2px 9px", fontWeight: 700 }}>{r.viaLabel}</b>
                <span style={{ color: "var(--text-muted)" }}>{r.viaNome}</span>
              </span>
              <span style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: ".04em" }}>Competência</span>{" "}
                {r.competencia || "—"}
              </span>
              <span style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: ".04em" }}>CID</span>{" "}
                {r.cid || <span style={{ color: "#f59e0b" }}>não informado</span>}
              </span>
            </div>
            {r.via && !r.cobraDoPaciente && (
              <div style={{ fontSize: 11.5, color: "#0d9488", marginTop: 10, fontWeight: 700 }}>
                O paciente NÃO pode ser cobrado por nada desta conta.
              </div>
            )}
          </section>

          {/* permanência */}
          {r.permanencia?.dias != null && (
            <section style={{ ...cx.card, marginBottom: 14, borderLeft: `3px solid ${r.permanencia.excede ? "#f59e0b" : TEAL}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={cx.rotulo}>Permanência</div>
                {(() => {
                  const doLeito = resultado?.fonteInternacao === "saida-leito";
                  return (
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", padding: "2px 8px", borderRadius: 20, background: doLeito ? "rgba(45,212,191,.14)" : "rgba(245,158,11,.14)", color: doLeito ? TEAL : "#f59e0b" }}>
                      {doLeito ? "do leito" : "estimada pelo PS"}
                    </span>
                  );
                })()}
              </div>
              <div style={{ marginTop: 8, fontSize: 13.5, color: "var(--text)" }}>
                <b style={{ fontSize: 20, fontVariantNumeric: "tabular-nums" }}>{r.permanencia.dias}</b>{" "}
                {r.permanencia.dias === 1 ? "dia" : "dias"}
                {r.permanencia.media != null && (
                  <span style={{ color: "var(--text-muted)", fontSize: 12.5 }}> · média SUS {r.permanencia.media}</span>
                )}
              </div>
              {r.permanencia.texto && (
                <div style={{ marginTop: 6, fontSize: 12.5, color: r.permanencia.excede ? "#f59e0b" : "var(--text-muted)" }}>{r.permanencia.texto}</div>
              )}
            </section>
          )}

          {/* itens montados */}
          <section style={{ ...cx.card, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={cx.rotulo}>Itens montados do prontuário ({r.itens.length})</div>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                Total <b style={{ color: "var(--text)", fontSize: 15, fontVariantNumeric: "tabular-nums" }}>{r.total}</b>
                {r.semPreco > 0 && <span style={{ color: "#f59e0b" }}> · {r.semPreco} sem preço</span>}
              </div>
            </div>
            {r.itens.length === 0 ? (
              <p style={{ margin: "12px 0 0", color: "var(--text-muted)", fontSize: 13 }}>Nada a faturar neste episódio ainda.</p>
            ) : (
              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
                      <th style={{ padding: "6px 8px" }}>Tipo</th>
                      <th style={{ padding: "6px 8px" }}>Item</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Qtd</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Valor unit.</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.itens.map((it, i) => {
                      const sub = subtotalCentavos(it);
                      const cod = codigoFormatado(it.codigo) || it.codigo || "";
                      return (
                        <tr key={i} style={{ borderTop: "1px solid var(--border)", verticalAlign: "top" }}>
                          <td style={{ padding: "8px", whiteSpace: "nowrap", color: "var(--text-2)" }}>{TIPO_ITEM_LABEL[it.tipo] || it.tipo}</td>
                          <td style={{ padding: "8px" }}>
                            <div style={{ fontWeight: 600 }}>{it.descricao || cod || "—"}</div>
                            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>
                              {cod && it.descricao ? <span style={{ fontVariantNumeric: "tabular-nums" }}>{cod} · </span> : null}{it.origem}
                            </div>
                          </td>
                          <td style={{ padding: "8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Number(it.quantidade)}</td>
                          <td style={{ padding: "8px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: it.valor_unitario == null ? "#f59e0b" : "var(--text)" }}>
                            {it.valor_unitario == null ? "sem preço" : reais(centavos(it.valor_unitario))}
                          </td>
                          <td style={{ padding: "8px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{sub == null ? "—" : reais(sub)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* lançar na conta do episódio */}
          <section style={{ ...cx.card, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={cx.rotulo}>Lançar na conta</div>
                <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.45 }}>
                  Grava estes itens na conta do episódio — a mesma do módulo Atendimento. Só numa conta ainda vazia; nada é duplicado.
                </p>
              </div>
              {canEdit ? (
                <button
                  onClick={lancar}
                  disabled={lancando || r.itens.length === 0}
                  style={{ background: lancando ? "var(--surface-3)" : TEAL, color: lancando ? "var(--text-muted)" : "#04201c", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: lancando || r.itens.length === 0 ? "default" : "pointer", whiteSpace: "nowrap", opacity: r.itens.length === 0 ? 0.5 : 1 }}
                >
                  {lancando ? "Lançando…" : "Lançar na conta"}
                </button>
              ) : (
                <span style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 260, textAlign: "right", lineHeight: 1.4 }}>
                  Seu perfil vê a proposta, mas não grava na conta. O lançamento precisa de um perfil com escrita (adm_silver+).
                </span>
              )}
            </div>
            {msgLanc && (
              <div style={{ marginTop: 12, fontSize: 13, padding: "10px 12px", borderRadius: 8, borderLeft: `3px solid ${msgLanc.tom === "erro" ? "#ef4444" : TEAL}`, background: msgLanc.tom === "erro" ? "rgba(239,68,68,.08)" : "rgba(45,212,191,.08)", color: "var(--text)" }}>
                {msgLanc.texto}
              </div>
            )}
          </section>

          {/* pré-glosa */}
          {r.glosa.length > 0 && (
            <section style={{ ...cx.card, marginBottom: 14 }}>
              <div style={cx.rotulo}>Antecipação de glosa</div>
              <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
                {r.glosa.map((g, i) => (
                  <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 11px", borderRadius: 8, background: "var(--surface-2)", borderLeft: `3px solid ${COR_GRAV[g.gravidade] || "var(--border)"}` }}>
                    <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em", color: COR_GRAV[g.gravidade] || "var(--text)", whiteSpace: "nowrap", paddingTop: 1 }}>
                      {g.gravidade === GRAVIDADES.IMPEDIMENTO ? "Impedimento" : "Atenção"}
                    </span>
                    <span style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.45 }}>{g.texto}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* avisos */}
          {r.avisos.length > 0 && (
            <section style={cx.card}>
              <div style={cx.rotulo}>A conferir antes de fechar</div>
              <ul style={{ margin: "10px 0 0", paddingLeft: 18, display: "grid", gap: 6 }}>
                {r.avisos.map((a, i) => (
                  <li key={i} style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.45 }}>{a}</li>
                ))}
              </ul>
            </section>
          )}
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
        if (vivo) setRows(listaLida(r));
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
        {sub === "visao" && <VisaoExecutiva sb={sb} sigtapRows={rows} currentUser={currentUser} canEdit={canEdit} />}
        {sub === "pendentes" && <ContaDoProntuario sb={sb} sigtapRows={rows} canEdit={canEdit} currentUser={currentUser} />}
        {sub === "sigtap" && <SigtapView rows={rows} carregando={carregando} />}
        {sub === "glosas" && <GlosasView sb={sb} currentUser={currentUser} canEdit={canEdit} />}
        {sub === "analises" && <AnalisesView sb={sb} />}
        {EM_CONSTRUCAO[sub] && <EmConstrucao titulo={titulo[sub]} desc={EM_CONSTRUCAO[sub]} />}
      </div>
    </div>
  );
}
