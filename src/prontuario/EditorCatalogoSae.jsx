// Editor do catálogo da SAE (diagnósticos NANDA + intervenções NIC) — SÓ ADM
// Master. Diferente do editor de cortes das escalas, aqui dá para EDITAR e
// ACRESCENTAR itens: a taxonomia é grande e cresce sob demanda. Cada item nasce
// "em validação"; editar o conteúdo clínico marca como não validado de novo
// (mudar um diagnóstico não passa batido). O motor/telas leem o que está aqui.

import { useState } from "react";
import { UNIDADES, SUBTIPOS_DX } from "../clinico/sae-catalogo.js";
import { salvarCatalogoSae } from "./dados.js";

const cor = { borda: "var(--border)", sup: "var(--surface)", sup2: "var(--surface-2)", bg2: "var(--bg-2)", txt: "var(--text)", txt3: "var(--text-3)", mut: "var(--text-muted)" };
const inp = { background: "var(--input-bg)", border: `1px solid ${cor.borda}`, borderRadius: 5, padding: "6px 8px", color: cor.txt, fontSize: 12.5, outline: "none", width: "100%", boxSizing: "border-box" };
const lbl = { fontSize: 10.5, fontWeight: 700, color: cor.mut, marginBottom: 3, display: "block", textTransform: "uppercase", letterSpacing: ".04em" };
const btnMini = c => ({ background: "transparent", border: `1px solid ${c}66`, borderRadius: 5, padding: "3px 9px", color: c, cursor: "pointer", fontSize: 11.5, fontWeight: 700 });
const chip = (on, c) => ({ background: on ? `${c}33` : "transparent", color: on ? c : cor.txt3, border: `1px solid ${on ? c : cor.borda}`, borderRadius: 999, padding: "3px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" });
const toggleArr = (arr, v) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
const linhas = s => String(s || "").split("\n").map(x => x.trim()).filter(Boolean);

export default function EditorCatalogoSae({ sb, catalogo = [], currentUser, onClose, onSaved }) {
  const isMaster = currentUser?.role === "adm_master";
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setEdit(e => ({ ...e, [k]: v }));

  const diagnosticos = catalogo.filter(c => c.tipo === "diagnostico").sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const intervencoes = catalogo.filter(c => c.tipo === "intervencao").sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const pendentes = catalogo.filter(c => c.status !== "validado" && c.ativo !== false).length;
  const nics = intervencoes.map(n => ({ v: n.id, l: n.titulo }));

  function novo(tipo) {
    const base = tipo === "diagnostico" ? diagnosticos : intervencoes;
    setEdit({
      _novo: true, id: "", tipo, codigo: "", titulo: "", dominio: "",
      subtipo: tipo === "diagnostico" ? "real" : "", unidades: [], ordem: (base.at(-1)?.ordem ?? base.length * 0) + base.length + 1, ativo: true,
      def: "", fat: "", resultado: "", intervencoes: [],
      atividades: "", frequencia: "", frequencia_dia: "", se_necessario: false,
    });
  }
  function editar(item) {
    const p = item.payload || {};
    setEdit({
      _novo: false, id: item.id, tipo: item.tipo, codigo: item.codigo || "", titulo: item.titulo || "",
      dominio: item.dominio || "", subtipo: item.subtipo || "", unidades: Array.isArray(item.unidades) ? item.unidades : [],
      ordem: item.ordem ?? 0, ativo: item.ativo !== false,
      def: (p.def || []).join("\n"), fat: (p.fat || []).join("\n"), resultado: p.resultado || "",
      intervencoes: Array.isArray(p.intervencoes) ? p.intervencoes : [],
      atividades: (p.atividades || []).join("\n"), frequencia: p.frequencia || "",
      frequencia_dia: p.frequencia_dia ?? "", se_necessario: !!p.se_necessario,
    });
  }

  function montarPayload(e) {
    if (e.tipo === "diagnostico") {
      const pl = {};
      if (linhas(e.def).length) pl.def = linhas(e.def);
      if (linhas(e.fat).length) pl.fat = linhas(e.fat);
      if (e.resultado?.trim()) pl.resultado = e.resultado.trim();
      if (e.intervencoes.length) pl.intervencoes = e.intervencoes;
      return pl;
    }
    const pl = {};
    if (linhas(e.atividades).length) pl.atividades = linhas(e.atividades);
    if (e.frequencia?.trim()) pl.frequencia = e.frequencia.trim();
    if (e.se_necessario) pl.se_necessario = true;
    else if (e.frequencia_dia !== "" && e.frequencia_dia != null) pl.frequencia_dia = Number(e.frequencia_dia);
    return pl;
  }

  async function salvar(validar) {
    if (!isMaster || !edit) return;
    const id = (edit.id || "").trim();
    if (!id || !edit.titulo.trim()) return;
    setBusy(true);
    await salvarCatalogoSae(sb, {
      id, tipo: edit.tipo, codigo: edit.codigo?.trim() || null, titulo: edit.titulo.trim(),
      dominio: edit.dominio?.trim() || null, subtipo: edit.tipo === "diagnostico" ? edit.subtipo : null,
      unidades: edit.unidades, payload: montarPayload(edit),
      status: validar ? "validado" : "em_validacao", ordem: Number(edit.ordem) || 0, ativo: !!edit.ativo,
    }, currentUser);
    setBusy(false); setEdit(null); onSaved && onSaved();
  }
  async function toggleValid(item) {
    if (!isMaster || busy) return;
    setBusy(true);
    await salvarCatalogoSae(sb, { ...item, status: item.status === "validado" ? "em_validacao" : "validado" }, currentUser);
    setBusy(false); onSaved && onSaved();
  }
  async function toggleAtivo(item) {
    if (!isMaster || busy) return;
    setBusy(true);
    await salvarCatalogoSae(sb, { ...item, ativo: item.ativo === false }, currentUser);
    setBusy(false); onSaved && onSaved();
  }
  async function validarTodos() {
    if (!isMaster || busy) return;
    setBusy(true);
    for (const c of catalogo.filter(x => x.status !== "validado" && x.ativo !== false)) {
      await salvarCatalogoSae(sb, { ...c, status: "validado" }, currentUser);
    }
    setBusy(false); onSaved && onSaved();
  }

  const th = { textAlign: "left", padding: "6px 8px", color: cor.mut, fontSize: 10, fontWeight: 700, textTransform: "uppercase", background: cor.bg2, borderBottom: `1px solid ${cor.borda}` };
  const td = { padding: "6px 8px", fontSize: 12.5, borderBottom: `1px solid ${cor.borda}`, verticalAlign: "top" };

  function Tabela({ titulo, itens, tipo }) {
    return (
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800 }}>{titulo} <span style={{ color: cor.mut, fontWeight: 500 }}>· {itens.length}</span></div>
          {isMaster && <button onClick={() => novo(tipo)} style={btnMini("#22d3ee")}>+ Novo</button>}
        </div>
        <div style={{ border: `1px solid ${cor.borda}`, borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "inherit" }}>
            <thead><tr>{["Título", "Código", tipo === "diagnostico" ? "Tipo" : "Freq.", "Unidades", "Status", ""].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {itens.length === 0 && <tr><td style={{ ...td, color: cor.txt3 }} colSpan={6}>Nenhum item. Use "+ Novo".</td></tr>}
              {itens.map(c => (
                <tr key={c.id} style={{ opacity: c.ativo === false ? 0.5 : 1 }}>
                  <td style={{ ...td, fontWeight: 600 }}>{c.titulo}</td>
                  <td style={{ ...td, color: cor.txt3, fontFamily: "JetBrains Mono, monospace" }}>{c.codigo || "—"}</td>
                  <td style={{ ...td, color: cor.txt3 }}>{tipo === "diagnostico" ? (SUBTIPOS_DX.find(s => s.v === c.subtipo)?.l || c.subtipo || "—") : (c.payload?.frequencia || (c.payload?.se_necessario ? "SOS" : "—"))}</td>
                  <td style={{ ...td, color: cor.txt3, fontSize: 11 }}>{Array.isArray(c.unidades) && c.unidades.length ? c.unidades.join(", ") : "todas"}</td>
                  <td style={td}>{c.status === "validado" ? <span style={{ color: "#34d399", fontWeight: 700 }}>✓ validado</span> : <span style={{ color: "#f5b301", fontWeight: 700 }}>⏳ validação</span>}</td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                    {isMaster && <>
                      <button onClick={() => editar(c)} style={{ ...btnMini("#22d3ee"), marginRight: 5 }}>Editar</button>
                      <button onClick={() => toggleValid(c)} style={{ ...btnMini(c.status === "validado" ? "#f5b301" : "#34d399"), marginRight: 5 }}>{c.status === "validado" ? "Revogar" : "Validar"}</button>
                      <button onClick={() => toggleAtivo(c)} style={btnMini(cor.mut)}>{c.ativo === false ? "Reativar" : "Desativar"}</button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const ehDx = edit?.tipo === "diagnostico";

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: cor.sup, border: `1px solid ${cor.borda}`, borderRadius: 12, padding: "1.4rem", width: 880, maxWidth: "97vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Catálogo da SAE — diagnósticos (NANDA) e intervenções (NIC)</div>
          {isMaster && pendentes > 0 && !edit && <button onClick={validarTodos} disabled={busy} style={{ background: "#22d3ee", color: "#04222b", border: "none", borderRadius: 6, padding: "7px 14px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>{busy ? "…" : `Validar todos (${pendentes})`}</button>}
        </div>
        <div style={{ fontSize: 12, color: cor.mut, marginBottom: 16, lineHeight: 1.5 }}>
          O motor e a aba SAE leem daqui. Editar o conteúdo clínico volta o item para "em validação". {!isMaster && <strong style={{ color: "#f5b301" }}>Somente o ADM Master edita.</strong>}
        </div>

        {edit ? (
          <div style={{ padding: 14, background: cor.sup2, border: `1px solid ${cor.borda}`, borderRadius: 8 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 12 }}>{edit._novo ? `Novo ${ehDx ? "diagnóstico" : "intervenção"}` : `Editar: ${edit.titulo || edit.id}`}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div><label style={lbl}>Identificador (slug){edit._novo ? "" : " — fixo"}</label><input value={edit.id} disabled={!edit._novo} onChange={e => set("id", e.target.value.replace(/[^a-z0-9_]/g, ""))} placeholder={ehDx ? "dx_novo_diagnostico" : "nic_nova_intervencao"} style={{ ...inp, opacity: edit._novo ? 1 : 0.6 }} /></div>
              <div><label style={lbl}>Código {ehDx ? "NANDA" : "NIC"}</label><input value={edit.codigo} onChange={e => set("codigo", e.target.value)} placeholder="ex.: 00132" style={inp} /></div>
            </div>
            <div style={{ marginBottom: 10 }}><label style={lbl}>Título</label><input value={edit.titulo} onChange={e => set("titulo", e.target.value)} style={inp} /></div>

            {ehDx ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <div><label style={lbl}>Tipo</label><select value={edit.subtipo} onChange={e => set("subtipo", e.target.value)} style={inp}>{SUBTIPOS_DX.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}</select></div>
                  <div><label style={lbl}>Domínio</label><input value={edit.dominio} onChange={e => set("dominio", e.target.value)} placeholder="ex.: Conforto" style={inp} /></div>
                </div>
                <div style={{ marginBottom: 10 }}><label style={lbl}>Características definidoras (uma por linha)</label><textarea value={edit.def} onChange={e => set("def", e.target.value)} rows={3} style={{ ...inp, resize: "vertical" }} /></div>
                <div style={{ marginBottom: 10 }}><label style={lbl}>Fatores relacionados / de risco (uma por linha)</label><textarea value={edit.fat} onChange={e => set("fat", e.target.value)} rows={3} style={{ ...inp, resize: "vertical" }} /></div>
                <div style={{ marginBottom: 10 }}><label style={lbl}>Resultado esperado (NOC)</label><textarea value={edit.resultado} onChange={e => set("resultado", e.target.value)} rows={2} style={{ ...inp, resize: "vertical" }} /></div>
                <div style={{ marginBottom: 10 }}>
                  <label style={lbl}>Intervenções (NIC) ligadas</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 120, overflowY: "auto" }}>
                    {nics.length === 0 && <span style={{ fontSize: 11.5, color: cor.txt3 }}>Cadastre intervenções primeiro.</span>}
                    {nics.map(n => <span key={n.v} onClick={() => set("intervencoes", toggleArr(edit.intervencoes, n.v))} style={chip(edit.intervencoes.includes(n.v), "#818cf8")}>{n.l}</span>)}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={{ marginBottom: 10 }}><label style={lbl}>Atividades (uma por linha)</label><textarea value={edit.atividades} onChange={e => set("atividades", e.target.value)} rows={3} style={{ ...inp, resize: "vertical" }} /></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10, alignItems: "end" }}>
                  <div><label style={lbl}>Frequência (rótulo)</label><input value={edit.frequencia} onChange={e => set("frequencia", e.target.value)} placeholder="ex.: 6/6h, por turno" style={inp} /></div>
                  <div><label style={lbl}>Vezes/dia (aprazamento)</label><input type="number" value={edit.frequencia_dia} disabled={edit.se_necessario} onChange={e => set("frequencia_dia", e.target.value)} placeholder="ex.: 4" style={{ ...inp, opacity: edit.se_necessario ? 0.5 : 1 }} /></div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: cor.txt, paddingBottom: 6 }}><input type="checkbox" checked={edit.se_necessario} onChange={e => set("se_necessario", e.target.checked)} /> SOS (sem horário)</label>
                </div>
              </>
            )}

            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Unidades (vazio = todas)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {UNIDADES.map(u => <span key={u.v} onClick={() => set("unidades", toggleArr(edit.unidades, u.v))} style={chip(edit.unidades.includes(u.v), "#38bdf8")}>{u.l}</span>)}
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: cor.txt, marginBottom: 14 }}><input type="checkbox" checked={edit.ativo} onChange={e => set("ativo", e.target.checked)} /> Ativo</label>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => salvar(false)} disabled={busy || !edit.id.trim() || !edit.titulo.trim()} style={btnMini(cor.txt3)}>{busy ? "…" : "Salvar (em validação)"}</button>
              <button onClick={() => salvar(true)} disabled={busy || !edit.id.trim() || !edit.titulo.trim()} style={{ ...btnMini("#34d399"), background: "#34d39912" }}>Salvar e validar</button>
              <button onClick={() => setEdit(null)} style={btnMini(cor.mut)}>Cancelar</button>
            </div>
          </div>
        ) : (
          <>
            <Tabela titulo="Diagnósticos (NANDA-I)" itens={diagnosticos} tipo="diagnostico" />
            <Tabela titulo="Intervenções (NIC)" itens={intervencoes} tipo="intervencao" />
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={onClose} style={{ background: cor.sup, color: cor.txt3, border: `1px solid ${cor.borda}`, borderRadius: 6, padding: "9px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
