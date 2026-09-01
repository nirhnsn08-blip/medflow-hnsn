// ═══════════════════════════════════════════════════════════
// SCIH — A TELA
//
// Serviço de Controle de Infecção Hospitalar. Saiu do App.jsx.
//
// As regras puras que ele usa já moravam fora há vários PRs: a base de
// germes em ../clinico/germes.js e as precauções de isolamento em
// ../clinico/isolamento.js — as duas saíram porque outros módulos também
// as leem. Aqui ficam os indicadores (./indicadores.js) e o acesso ao
// banco (./dados.js).
//
// ⚠️ O `sb` chega por prop. Nulo = sem banco.
// ═══════════════════════════════════════════════════════════

import { registrarAuditoria } from "../auditoria/dados.js";
import { camposDoGerme, sugerirGerme } from "../clinico/germes.js";
import { ISOLAMENTOS, precaucaoDe } from "../clinico/isolamento.js";
import { diasDesde } from "../clinico/leitos.js";
import { loadLeitos, loadLeitosFromSupabase } from "../leitos/dados.js";
import { AvisoLeitura, HOSPITAL_NOME, HOSPITAL_SIGLA, MONTHS_FULL, btnContorno } from "../ui/base.jsx";
import { compDe, compLabel } from "../util/datas.js";
import { addScihCasoRemote, deleteScihCasoRemote, deleteScihGermeRemote, loadScihCasos, loadScihGermes, loadScihIndicadores, setLeitoIsolamentoRemote, updateScihCasoRemote, upsertScihGermeRemote, upsertScihIndicadorRemote } from "./dados.js";
import { calcIndic } from "./indicadores.js";
import { useEffect, useState } from "react";

// ── Página SCIH (Fase A): isolamentos + casos de vigilância ──
export default function ScihPage({ sb, currentUser, canEdit }) {
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
  // Ao digitar o germe, a base sugere o isolamento e marca multirresistente.
  // As duas decisões — só preencher o que está VAZIO, e o multirresistente
  // só LIGAR, nunca desligar — moram em `camposDoGerme`, testadas.
  const onGerme = v => setF(p => ({
    ...p, germe: v,
    ...camposDoGerme(sugerirGerme(v, germes), p),
  }));

  function refresh() {
    if (!sb) { setLeitos(loadLeitos()); return; }
    loadLeitosFromSupabase(sb).then(r => r && setLeitos(r));
    loadScihCasos(sb).then(setCasos);
    loadScihGermes(sb).then(setGermes);
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
  const leitosIsolados = leitosOrd.filter(l => precaucaoDe(l.isolamento));
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
    await addScihCasoRemote(sb, caso, currentUser);
    // "inteligente": ao vincular leito + isolamento, o leito já é sinalizado
    if (f.leito && f.isolamento) await setLeitoIsolamentoRemote(sb, f.leito, f.isolamento, currentUser);
    registrarAuditoria(sb, currentUser, "cadastrar caso SCIH", `${f.iniciais}${f.leito ? " · leito " + f.leito : ""}`, {});
    setBusy(false); setF(vazio);
    setTimeout(refresh, 400);
  }
  async function encerrar(c) {
    if (!confirm(`Encerrar o acompanhamento de ${c.iniciais}?`)) return;
    await updateScihCasoRemote(sb, c.id, { status: "encerrado" });
    if (c.leito && c.isolamento) {
      if (confirm(`Retirar também o isolamento do leito ${c.leito}?`)) await setLeitoIsolamentoRemote(sb, c.leito, null, currentUser);
    }
    registrarAuditoria(sb, currentUser, "encerrar caso SCIH", c.iniciais, {});
    setTimeout(refresh, 300);
  }
  async function excluir(c) {
    if (!confirm(`Excluir definitivamente o caso de ${c.iniciais}? Essa ação não pode ser desfeita.`)) return;
    await deleteScihCasoRemote(sb, c.id);
    registrarAuditoria(sb, currentUser, "excluir caso SCIH", c.iniciais, {});
    setTimeout(refresh, 300);
  }
  async function salvarGerme(g) {
    await upsertScihGermeRemote(sb, g, currentUser);
    setGermes(prev => [...prev.filter(x => x.nome !== g.nome), g]);
    registrarAuditoria(sb, currentUser, "salvar germe SCIH", g.nome, {});
  }
  async function removerGerme(nome) {
    await deleteScihGermeRemote(sb, nome);
    setGermes(prev => prev.filter(x => x.nome !== nome));
    registrarAuditoria(sb, currentUser, "remover germe SCIH", nome, {});
  }
  const gSug = sugerirGerme(f.germe, germes);

  const IsoBadge = ({ tipo }) => { const v = precaucaoDe(tipo); if (!v) return null; return (
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

      {/* 🔴 Caso de infecção que não foi lido some da vigilância — e quem
          não aparece na lista não recebe precaução de contato. */}
      <AvisoLeitura oQue="os casos e a base de germes da SCIH" listas={[casos, germes]} />

      <div style={{ display: "flex", gap: 8, marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <button onClick={() => setSub("vigilancia")} style={subBtn(sub === "vigilancia")}>Vigilância & Isolamentos</button>
        <button onClick={() => setSub("indicadores")} style={subBtn(sub === "indicadores")}>Indicadores</button>
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
                {gSug && <div style={{ fontSize: 11, color: "#22d3ee", marginTop: 4, lineHeight: 1.4 }}>Sugestão: {gSug.nome}{gSug.tipo === "multirresistente" ? " (multirresistente)" : ""}{precaucaoDe(gSug.isolamento) ? ` · isolamento ${ISOLAMENTOS[gSug.isolamento].label}` : ""}</div>}
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
                    <button onClick={() => encerrar(c)} style={btnContorno("#34d399")}>✓ Encerrar</button>
                    {currentUser?.role === "adm_master" && <button onClick={() => excluir(c)} style={btnContorno("#fb7185")}>Excluir</button>}
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
                {canEdit && currentUser?.role === "adm_master" && <button onClick={() => excluir(c)} style={{ ...btnContorno("#fb7185"), marginLeft: "auto" }}>Excluir</button>}
              </div>
            ))}
          </div>
        </details>
      )}

      </>)}

      {sub === "indicadores" && <IndicadoresScih sb={sb} currentUser={currentUser} canEdit={canEdit} />}

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
                {precaucaoDe(g.isolamento) && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: ISOLAMENTOS[g.isolamento].bg, color: ISOLAMENTOS[g.isolamento].cor, border: `1px solid ${ISOLAMENTOS[g.isolamento].cor}55`, borderRadius: 99, padding: "2px 9px", fontSize: 10, fontWeight: 800 }}>{ISOLAMENTOS[g.isolamento].label}</span>}
                {canEdit && <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button onClick={() => setF({ nome: g.nome, tipo: g.tipo || "multirresistente", isolamento: g.isolamento || "", embasamento: g.embasamento || "", observacao: g.observacao || "" })} style={btnContorno("#22d3ee")}>Editar</button>
                  {isMaster && <button onClick={() => { if (confirm(`Remover o germe ${g.nome}?`)) onDelete(g.nome); }} style={btnContorno("#fb7185")}>Excluir</button>}
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
function IndicadoresScih({ sb, currentUser, canEdit }) {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth());
  const [ano, setAno] = useState(now.getFullYear());
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);

  function refresh() { if (sb) loadScihIndicadores(sb).then(setRows); }
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
    await upsertScihIndicadorRemote(sb, payload, currentUser);
    registrarAuditoria(sb, currentUser, "salvar indicadores SCIH", comp, {});
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
