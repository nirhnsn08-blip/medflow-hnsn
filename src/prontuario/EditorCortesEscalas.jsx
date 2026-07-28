// Editor dos cortes de classificação das escalas de enfermagem — SÓ ADM Master.
// Cada linha de enf_escala_faixas define uma faixa (score → rótulo + nível +
// gatilho de reavaliação). Os SUBITENS das escalas são fixos (catálogo); aqui
// se editam os CORTES. Cada faixa nasce "em validação"; editar um valor a marca
// como não validada de novo (mudar limiar clínico não passa batido).

import { useState } from "react";
import { ESCALAS, ORDEM_ESCALAS } from "../clinico/escalas-catalogo.js";
import { salvarFaixaEscala } from "./dados.js";

const NIVEIS = [["verde", "Verde"], ["amarelo", "Amarelo"], ["laranja", "Laranja"], ["vermelho", "Vermelho"]];
const NIVEL_COR = { verde: "#34d399", amarelo: "#f5b301", laranja: "#fb923c", vermelho: "#f43f5e" };
const cor = { borda: "var(--border)", sup: "var(--surface)", sup2: "var(--surface-2)", bg2: "var(--bg-2)", txt: "var(--text)", txt3: "var(--text-3)", mut: "var(--text-muted)" };
const inp = { background: "var(--input-bg)", border: `1px solid ${cor.borda}`, borderRadius: 5, padding: "5px 7px", color: cor.txt, fontSize: 12, outline: "none", width: "100%", boxSizing: "border-box" };
const btnMini = (c) => ({ background: "transparent", border: `1px solid ${c}66`, borderRadius: 5, padding: "3px 9px", color: c, cursor: "pointer", fontSize: 11.5, fontWeight: 700 });
const num = v => (v === "" || v == null ? null : Number(v));

export default function EditorCortesEscalas({ sb, faixas = [], currentUser, onClose, onSaved }) {
  const isMaster = currentUser?.role === "adm_master";
  const [edit, setEdit] = useState(null);   // rascunho da faixa em edição
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setEdit(e => ({ ...e, [k]: v }));

  async function salvar(validar) {
    if (!isMaster || !edit) return;
    setBusy(true);
    await salvarFaixaEscala(sb, {
      id: edit.id, tipo: edit.tipo, ordem: edit.ordem ?? 0,
      faixa_min: num(edit.faixa_min), faixa_max: num(edit.faixa_max),
      rotulo: (edit.rotulo || "").trim(), nivel: edit.nivel,
      reavaliar_horas: num(edit.reavaliar_horas),
      validado: !!validar, ativo: edit.ativo !== false,
    }, currentUser);
    setBusy(false); setEdit(null); onSaved && onSaved();
  }
  async function marcarValidada(f, val) {
    if (!isMaster || busy) return;
    setBusy(true);
    await salvarFaixaEscala(sb, { ...f, validado: val }, currentUser);
    setBusy(false); onSaved && onSaved();
  }
  async function validarTodas() {
    if (!isMaster || busy) return;
    setBusy(true);
    for (const f of faixas.filter(x => !x.validado && x.ativo !== false)) {
      await salvarFaixaEscala(sb, { ...f, validado: true }, currentUser);
    }
    setBusy(false); onSaved && onSaved();
  }

  const th = { textAlign: "left", padding: "6px 8px", color: cor.mut, fontSize: 10, fontWeight: 700, textTransform: "uppercase", background: cor.bg2, borderBottom: `1px solid ${cor.borda}` };
  const td = { padding: "6px 8px", fontSize: 12.5, borderBottom: `1px solid ${cor.borda}` };
  const pendentes = faixas.filter(f => !f.validado && f.ativo !== false).length;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: cor.sup, border: `1px solid ${cor.borda}`, borderRadius: 12, padding: "1.4rem", width: 820, maxWidth: "97vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Cortes das escalas de enfermagem</div>
          {isMaster && pendentes > 0 && <button onClick={validarTodas} disabled={busy} style={{ background: "#22d3ee", color: "#04222b", border: "none", borderRadius: 6, padding: "7px 14px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>{busy ? "…" : `Validar todas (${pendentes})`}</button>}
        </div>
        <div style={{ fontSize: 12, color: cor.mut, marginBottom: 16, lineHeight: 1.5 }}>Faixa de score → classificação, nível (semáforo do mapa de risco) e prazo de reavaliação. Os subitens das escalas são fixos; aqui se ajustam os cortes. {!isMaster && <strong style={{ color: "#f5b301" }}>Somente o ADM Master edita.</strong>}</div>

        {ORDEM_ESCALAS.map(tipo => {
          const linhas = faixas.filter(f => f.tipo === tipo).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
          if (!linhas.length) return null;
          const nome = ESCALAS[tipo]?.nome || tipo;
          return (
            <div key={tipo} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: cor.txt, marginBottom: 6 }}>{nome} <span style={{ color: cor.mut, fontWeight: 500 }}>· {ESCALAS[tipo]?.sub}</span></div>
              <div style={{ border: `1px solid ${cor.borda}`, borderRadius: 8, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "inherit" }}>
                  <thead><tr>{["Classificação", "Score", "Nível", "Reaval (h)", "Status", ""].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {linhas.map(f => {
                      const emEdicao = edit?.id === f.id;
                      if (emEdicao) return (
                        <tr key={f.id} style={{ background: cor.sup2 }}>
                          <td style={td}><input value={edit.rotulo} onChange={e => set("rotulo", e.target.value)} style={inp} /></td>
                          <td style={td}><div style={{ display: "flex", gap: 4 }}><input type="number" value={edit.faixa_min ?? ""} onChange={e => set("faixa_min", e.target.value)} placeholder="min" style={{ ...inp, width: 56 }} /><input type="number" value={edit.faixa_max ?? ""} onChange={e => set("faixa_max", e.target.value)} placeholder="max" style={{ ...inp, width: 56 }} /></div></td>
                          <td style={td}><select value={edit.nivel} onChange={e => set("nivel", e.target.value)} style={inp}>{NIVEIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                          <td style={td}><input type="number" value={edit.reavaliar_horas ?? ""} onChange={e => set("reavaliar_horas", e.target.value)} placeholder="—" style={{ ...inp, width: 60 }} /></td>
                          <td style={td} colSpan={2}>
                            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                              <button onClick={() => salvar(false)} disabled={busy} style={btnMini(cor.txt3)}>Salvar</button>
                              <button onClick={() => salvar(true)} disabled={busy} style={{ ...btnMini("#34d399"), background: "#34d39912" }}>Salvar e validar</button>
                              <button onClick={() => setEdit(null)} style={btnMini(cor.mut)}>Cancelar</button>
                            </div>
                          </td>
                        </tr>
                      );
                      return (
                        <tr key={f.id}>
                          <td style={{ ...td, fontWeight: 600 }}>{f.rotulo}</td>
                          <td style={{ ...td, color: cor.txt3, fontFamily: "JetBrains Mono, monospace" }}>{f.faixa_min ?? "−∞"} … {f.faixa_max ?? "+∞"}</td>
                          <td style={td}><span style={{ color: NIVEL_COR[f.nivel] || cor.mut, fontWeight: 700 }}>{f.nivel}</span></td>
                          <td style={{ ...td, color: cor.txt3 }}>{f.reavaliar_horas ?? "—"}</td>
                          <td style={td}>{f.validado ? <span style={{ color: "#34d399", fontWeight: 700 }}>✓ validada</span> : <span style={{ color: "#f5b301", fontWeight: 700 }}>⏳ em validação</span>}</td>
                          <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                            {isMaster && <>
                              <button onClick={() => setEdit({ ...f })} style={{ ...btnMini("#22d3ee"), marginRight: 6 }}>Editar</button>
                              <button onClick={() => marcarValidada(f, !f.validado)} style={btnMini(f.validado ? "#f5b301" : "#34d399")}>{f.validado ? "Revogar" : "Validar"}</button>
                            </>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={onClose} style={{ background: cor.sup, color: cor.txt3, border: `1px solid ${cor.borda}`, borderRadius: 6, padding: "9px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
