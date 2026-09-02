// ═══════════════════════════════════════════════════════════
// PAINEL DE PRODUÇÃO — AS TELAS
//
// As quatro telas que leem o mesmo `db` (a produção ambulatorial no
// `localStorage`), mais a faixa de alertas do topo:
//
//   AlertBanner        a faixa "N atenção" — primeira coisa que se lê
//   Overview           o Centro de Monitoramento
//   EspecialidadePage  a produção de uma especialidade
//   PrintDashboard     a versão para imprimir
//   ImportPage         a carga por CSV
//
// Saem juntas porque compartilham o `db` inteiro: separá-las faria as
// quatro importarem umas às outras para chegar na mesma tabela.
//
// A camada saiu antes: ./dados.js, ./agregados.js e ./widgets.jsx.
//
// ⚠️ O `sb` chega por prop. Nulo = só o armário do navegador.
// ═══════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { Area, Bar, BarChart, Cell, ComposedChart, Line, ReferenceLine,
         ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ChecklistImplantacao from "../implantacao/ChecklistImplantacao.jsx";
import { K, loadDB, saveDB, saveRecord } from "./dados.js";
import { aggregateAno, aggregateMes, calcAlertas, comparativo, ocupacaoSetor } from "./agregados.js";
import { DeltaBadge, RingGauge, SemaforoMeta, StatCard } from "./widgets.jsx";
import { ESPECIALIDADES as SPECS } from "../ambulatorio/especialidades.js";
import { addSolicitacaoRemote, loadLeitos, loadLeitosFromSupabase, loadSaidas,
         loadSetoresFromSupabase, loadSetoresLocal, loadSolicitacoes,
         updateSolicitacaoRemote } from "../leitos/dados.js";
import { corEsperaFila } from "../clinico/leitos.js";
import { registrarAuditoria } from "../auditoria/dados.js";
import { HOSPITAL_NOME, HOSPITAL_SIGLA, Icon, MONTHS, MONTHS_FULL,
         btnContorno, customTooltip } from "../ui/base.jsx";
import { diffMin, fmtDur, nowISO, todayStr } from "../util/datas.js";
import { fmt } from "../util/formato.js";

export function AlertBanner({ db }) {
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
export function EspecialidadePage({ sb, spec, db, onSave, readOnly = false, currentUser }) {
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
    const syncStatus = await saveRecord(sb, date, spec.id, data, currentUser);
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
            <StatCard label="Produção no mês" value={fmt(totalMes)} sub={`meta: ${fmt(spec.metaM)} · 1ªs+ret+emerg.`} color={spec.color} big />
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
                { label: "Comparec. Gercon", v: mesData.realizadas, max: mesData.ofertadas, c: "#0d9488" },
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
                    <div title={v > max ? "Inconsistência: valor maior que o ofertado — revisar o lançamento" : undefined} style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, color: v > max ? "#fb7185" : c }}>{fmt(v)} <span style={{ fontSize: 10, color: "var(--text-muted)" }}>/ {fmt(max)}</span>{v > max ? " ⚠" : ""}</div>
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
export function Overview({ sb, db, currentUser, canEdit, perms, onNav }) {
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
    if (!sb) { setLeitos(loadLeitos()); setSetores(loadSetoresLocal()); return; }
    loadLeitosFromSupabase(sb).then(r => r && setLeitos(r));
    loadSetoresFromSupabase(sb).then(r => r && setSetores(r));
    // `r &&`: agora estes dois distinguem falha (null) de "não há
    // nenhum" ([]). Sem a guarda, uma leitura que falhou apagaria a fila
    // de internação da tela e mostraria "0 aguardando".
    loadSolicitacoes(sb).then(r => r && setSolic(r));
    loadSaidas(sb).then(r => r && setSaidas(r));
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
    await addSolicitacaoRemote(sb, { iniciais: novo.iniciais.trim(), setor_origem: novo.setor_origem || null, setor_destino: novo.setor_destino, hora_pedido: nowISO(), status: "aguardando" }, currentUser);
    registrarAuditoria(sb, currentUser, "solicitar leito", `${novo.setor_origem || "?"} → ${novo.setor_destino}`, {});
    setNovo({ iniciais: "", setor_origem: "", setor_destino: "" });
    setTimeout(refresh, 400);
  }
  async function resolverSolic(s, status) {
    await updateSolicitacaoRemote(sb, s.id, { status, resolvido_em: nowISO() });
    registrarAuditoria(sb, currentUser, status === "atendido" ? "leito atendido" : "solicitação cancelada", s.setor_destino, {});
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
          <div style={{ fontSize: 20, fontWeight: 700 }}>Centro de Monitoramento — {HOSPITAL_SIGLA}</div>
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

      {/* CHECKLIST DE IMPLANTAÇÃO — some sozinho quando os cadastros-base
          estiverem feitos. Fica aqui, e não numa tela escondida, porque é
          logo abaixo que o vazio se manifesta: sem setor cadastrado a
          "Ocupação por setor" nasce vazia e nada explica por quê. */}
      <ChecklistImplantacao sb={sb} perms={perms} canEdit={canEdit} onNav={onNav} />

      {/* ALERTAS POR SETOR */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Ocupação por setor</div>
      {setoresOrd.length === 0 ? (
        <div style={{ background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 10, padding: "1.25rem", textAlign: "center", color: "var(--text-muted)", fontSize: 13, marginBottom: "1.25rem" }}>
          Nenhum setor cadastrado. Cadastre em <strong>Giro de Leitos → aba Mapa de leitos → botão Setores</strong> (à direita da barra de cadastro) e marque o setor de cada leito.
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
              const esperaMin = diffMin(s.hora_pedido, nowISO());
              const urg = corEsperaFila(esperaMin);
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, minWidth: 70 }}>{s.iniciais}</span>
                  <span style={{ fontSize: 12, color: "var(--text-3)" }}>{s.setor_origem || "?"} <span style={{ color: "var(--text-muted)" }}>→</span> <strong style={{ color: "var(--text)" }}>{s.setor_destino}</strong></span>
                  {s.visto_em && <span title={s.visto_por ? `em regulação por ${s.visto_por}` : "em regulação"} style={{ fontSize: 10.5, fontWeight: 700, color: "#34d399", border: "1px solid #34d39955", borderRadius: 99, padding: "0 7px" }}>em regulação</span>}
                  <span style={{ fontSize: 12, color: urg.cor, fontWeight: 700, marginLeft: "auto", fontFamily: "JetBrains Mono, monospace" }}>{fmtDur(esperaMin)}</span>
                  {canEdit && <>
                    <button onClick={() => resolverSolic(s, "atendido")} style={btnContorno("#34d399")}>✓ Atendido</button>
                    <button onClick={() => resolverSolic(s, "cancelado")} style={btnContorno("var(--text-muted)")}>✕</button>
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
export function PrintDashboard({ db }) {
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
export function ImportPage({ sb, onImport, currentUser }) {
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
      registrarAuditoria(sb, currentUser, "importar CSV", `${ok} registros`, {});
      onImport(db);
      setMsg(`✓ ${ok} registros importados. ${errs > 0 ? `${errs} linhas ignoradas.` : ""}`);
    };
    reader.readAsText(file);
  }
  function downloadTemplate() {
    const rows = ["data,especialidade,primeiras,retornos,ofertadas,realizadas,livres,emergencias,faltas","2025-01-02,cirurgia_geral,5,12,20,17,3,2,1","2025-01-02,oftalmologia,4,10,18,14,4,0,0","2025-01-02,ginecologia,3,9,15,12,3,1,0","2025-01-02,urologia,3,8,14,11,3,0,2","2025-01-02,ortopedia,4,12,20,16,4,1,4"];
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" })); a.download = "modelo_hnsn.csv"; a.click();
  }
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
          <button onClick={() => { if (confirm("Apagar TODOS os dados?")) { localStorage.removeItem(K); onImport({}); registrarAuditoria(sb, currentUser, "limpar dados", "todos", {}); } }} style={{ background: "transparent", color: "#fb7185", border: "1px solid #3d0f18", borderRadius: 6, padding: "7px 16px", fontWeight: 700, cursor: "pointer" }}>Apagar todos os dados</button>
        </div>
      </div>
    </div>
  );
}
