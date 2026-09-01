// ═══════════════════════════════════════════════════════════
// BLOCO CIRÚRGICO — A TELA
//
// Saiu do App.jsx. O catálogo está em ./catalogo.js, o acesso ao banco em
// ./dados.js e as regras de agenda em ./agenda.js.
//
// ⚠️ O `sb` chega por prop. Nulo = sem banco.
// ═══════════════════════════════════════════════════════════

import { registrarAuditoria } from "../auditoria/dados.js";
import { MONTHS, MONTHS_FULL, btnContorno } from "../ui/base.jsx";
import { diffMin, fmtDur, horaFmt, nowISO, todayStr } from "../util/datas.js";
import { conflitosDeSala, diasUteisNoMes } from "./agenda.js";
import { CC_MOTIVOS_CANCELAMENTO, CC_STATUS, CHECKLIST_OMS } from "./catalogo.js";
import { addCcCirurgiaRemote, deleteCcSalaRemote, loadCcCirurgias, loadCcSalas, updateCcCirurgiaRemote, upsertCcSalaRemote } from "./dados.js";
import { useEffect, useState } from "react";

// ── Página Bloco Cirúrgico ──
export default function BlocoPage({ sb, currentUser, canEdit }) {
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
    if (!sb) return;
    loadCcSalas(sb).then(setSalas);
    loadCcCirurgias(sb, d).then(setCirurgias);
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
    if (idEdicao) await updateCcCirurgiaRemote(sb, idEdicao, c);
    else await addCcCirurgiaRemote(sb, { ...c, status: "agendada" }, currentUser);
    registrarAuditoria(sb, currentUser, idEdicao ? "editar cirurgia" : "agendar cirurgia", `${c.iniciais} · ${c.procedimento}`, {});
    setAgendando(false); setTimeout(() => refresh(), 400);
  }
  async function cancelar(c, motivo) {
    await updateCcCirurgiaRemote(sb, c.id, { status: "cancelada", cancelamento_motivo: motivo });
    registrarAuditoria(sb, currentUser, "cancelar cirurgia", `${c.iniciais} · ${motivo}`, {});
    setCancelando(null); setTimeout(() => refresh(), 300);
  }
  async function marcar(c, campos, acao) {
    await updateCcCirurgiaRemote(sb, c.id, campos);
    registrarAuditoria(sb, currentUser, `bloco: ${acao}`, c.iniciais, {});
    setTimeout(() => refresh(), 300);
  }
  async function concluirChecklist(c, faseKey) {
    const fase = CHECKLIST_OMS[faseKey];
    await updateCcCirurgiaRemote(sb, c.id, { [fase.campo]: true });
    registrarAuditoria(sb, currentUser, `bloco: checklist ${fase.label}`, c.iniciais, {});
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
            <button onClick={() => marcar(c, { status: "checkin", checkin_em: nowISO() }, "check-in")} style={btnContorno("#3b82f6")}>Check-in do paciente</button>
            <button onClick={() => setAgendando(c)} style={btnContorno("var(--text-3)")}>Editar</button>
            <button onClick={() => setCancelando(c)} style={btnContorno("#f43f5e")}>Cancelar cirurgia</button>
          </>}
          {c.status === "checkin" && <>
            {!c.chk_sign_in && <button onClick={() => setChecklist({ cirurgia: c, fase: "sign_in" })} style={btnContorno("#3b82f6")}>Cirurgia segura: Sign In</button>}
            <button onClick={() => { if (!c.chk_sign_in && !confirm("O checklist Sign In ainda não foi concluído. Entrar em sala mesmo assim?")) return; marcar(c, { status: "em_cirurgia", entrada_sala_em: nowISO() }, "entrada na sala"); }} style={btnContorno("#22d3ee")}>Entrada na sala</button>
            <button onClick={() => setCancelando(c)} style={btnContorno("#f43f5e")}>Cancelar</button>
          </>}
          {c.status === "em_cirurgia" && <>
            {!c.inicio_anestesia_em && <button onClick={() => marcar(c, { inicio_anestesia_em: nowISO() }, "inicio anestesia")} style={btnContorno("var(--text-3)")}>Início da anestesia</button>}
            {!c.chk_time_out && <button onClick={() => setChecklist({ cirurgia: c, fase: "time_out" })} style={btnContorno("#d97706")}>Cirurgia segura: Time Out</button>}
            {!c.inicio_cirurgia_em && <button onClick={() => { if (!c.chk_time_out && !confirm("O checklist Time Out ainda não foi concluído. Registrar a incisão mesmo assim?")) return; marcar(c, { inicio_cirurgia_em: nowISO() }, "inicio cirurgia"); }} style={btnContorno("#22d3ee")}>Início da cirurgia</button>}
            {c.inicio_cirurgia_em && !c.fim_cirurgia_em && <button onClick={() => marcar(c, { fim_cirurgia_em: nowISO() }, "fim cirurgia")} style={btnContorno("#22d3ee")}>Fim da cirurgia</button>}
            {c.fim_cirurgia_em && !c.chk_sign_out && <button onClick={() => setChecklist({ cirurgia: c, fase: "sign_out" })} style={btnContorno("#34d399")}>Cirurgia segura: Sign Out</button>}
            {c.fim_cirurgia_em && <button onClick={() => { if (!c.chk_sign_out && !confirm("O checklist Sign Out ainda não foi concluído. Enviar para a RPA mesmo assim?")) return; marcar(c, { status: "recuperacao", saida_sala_em: nowISO(), rpa_entrada_em: nowISO() }, "envio RPA"); }} style={btnContorno("#d97706")}>Enviar para RPA</button>}
          </>}
          {c.status === "recuperacao" && (
            <button onClick={() => marcar(c, { status: "concluida", rpa_saida_em: nowISO() }, "alta da RPA")} style={btnContorno("#34d399")}>Alta da RPA — concluir</button>
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

      {sub === "indicadores" && <BlocoIndicadores sb={sb} salasAtivas={salasAtivas} />}

      {sub === "mapa" && (<>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)" }}>Dia do mapa</label>
        <input type="date" value={data} onChange={e => setData(e.target.value)} style={inp} />
        {data !== todayStr() && <button onClick={() => setData(todayStr())} style={btnContorno("#22d3ee")}>Hoje</button>}
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
      {showSalas && <CcSalasModal salas={salas} onClose={() => setShowSalas(false)} onSave={async s => { await upsertCcSalaRemote(sb, s, currentUser); refresh(); }} onDelete={async n => { await deleteCcSalaRemote(sb, n); refresh(); }} isMaster={currentUser?.role === "adm_master"} />}
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
          <div><label style={lbl}>Prontuário *</label><input value={f.prontuario} onChange={e => set("prontuario", e.target.value)} placeholder="48213" style={inp} /></div>
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

function BlocoIndicadores({ sb, salasAtivas }) {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth());
  const [ano, setAno] = useState(now.getFullYear());
  const [rows, setRows] = useState([]);
  const [horasDia, setHorasDia] = useState(8);
  const [diasMes, setDiasMes] = useState(() => diasUteisNoMes(now.getFullYear(), now.getMonth()));

  useEffect(() => {
    const ini = `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
    const fim = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(new Date(ano, mes + 1, 0).getDate()).padStart(2, "0")}`;
    if (sb) sb(`cc_cirurgias?data=gte.${ini}&data=lte.${fim}&select=*`).then(r => setRows(Array.isArray(r) ? r : []));
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
              <button onClick={() => onSave({ ...s, ativa: s.ativa === false })} style={btnContorno(s.ativa === false ? "#34d399" : "#d97706")}>{s.ativa === false ? "Reativar" : "Desativar"}</button>
              {isMaster && <button onClick={() => { if (confirm(`Remover a sala ${s.nome}?`)) onDelete(s.nome); }} style={btnContorno("#f43f5e")}>Excluir</button>}
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
