// ═══════════════════════════════════════════════════════════
// OS MODAIS DO PRONTO-SOCORRO
//
// Saíram de `PsPage.jsx` em 04/09/2026, quando ele tinha 3.408 linhas.
// Oito janelas: triagem, atendimento, desfecho, alocação de sala,
// protocolos, salas e as duas de faixas de sinais vitais.
//
// ⚠️ O `AtendimentoModal` sozinho tem quase 600 linhas — é a tela onde o
// médico registra o atendimento de emergência inteiro. Ele NÃO foi
// dividido aqui: mover é uma coisa, reescrever a tela mais crítica do
// plantão é outra, e as duas juntas num PR só tornariam impossível dizer
// qual mudança quebrou o quê.
// ═══════════════════════════════════════════════════════════

import { avisoDeCatalogo, filtrarProcedimentos, opcoesDeProcedimento, viaDaEscolha } from "../atendimento/escolha-procedimento.js";
import { avisoDeConta, convenioSugerido, geraConta, valoresIniciais } from "../atendimento/faturavel.js";
import { PS_VIAS_TRANSF } from "../atendimento/recepcao.js";
import { registrarAuditoria } from "../auditoria/dados.js";
import { AbaExames } from "./AbaExames.jsx";
import { avaliarSinaisVitais } from "../clinico/adulto.js";
import { FARM_GRAV, analisarPrescricaoClinica, checarAlergia, farmFmtQtd, normTxt, parseAlergias } from "../clinico/alertas.js";
import { COMORBIDADES } from "../clinico/comorbidades.js";
import { avaliarObstetrica, obstetricasValidadas } from "../clinico/obstetricia.js";
import { avaliarSinaisVitaisPediatrico, faixasValidadas } from "../clinico/pediatria.js";
import { FARM_CLASSES } from "../farmacia/catalogo.js";
import { loadFarmIncompatY, loadFarmInteracoes, loadFarmLotes, loadFarmMedicamentos, loadFarmSaidasByAtendimento } from "../farmacia/dados.js";
import { idadeMesesParaTriagem } from "../pacientes/identidade.js";
import { VX, btnContorno, rotuloCampo } from "../ui/base.jsx";
import { diffMin, fmtDataBR, fmtDur, horaFmt, isoToLocal, localToIso, nowISO } from "../util/datas.js";
import { MANCHESTER, PS_ADM_CATEGORIAS, PS_ADM_MOTIVOS, PS_ADM_STATUS, PS_AREAS, PS_CONSCIENCIA, PS_DESFECHOS, PS_DOSE_UNID, PS_EVOL_CATEGORIAS, PS_FREQUENCIAS, PS_SALA_STATUS, PS_VIAS, fmtSinaisVitais } from "./catalogo.js";
import { addPsAdministracao, addPsPrescricaoItens, addPsRegistroRemote, deletePsProtocoloRemote, loadPsAdministracoes, loadPsPrescricaoItens, loadPsProtocolos, loadPsRegistros, loadPsSinais, patchPsAtendimentoDireto, upsertPsProtocoloRemote } from "./dados.js";
import { useEffect, useRef, useState } from "react";
import { freqDia, psContaCenso, psDosesDadas, saveFaixaObstetrica, saveFaixaPediatrica } from "./apoio.js";
import { dispensadoDoItem as dispensado, estoqueSinal as sinalDeEstoque, pendentesDeChecagem, semChecagem as semChecagemDoItem, similaresComEstoque as similaresDisponiveis } from "./prescricao.js";

// Biblioteca de protocolos do PS — abrir e cadastrar
export function PsProtocolosModal({ sb, currentUser, canEdit, isMaster, onClose }) {
  const [lista, setLista] = useState([]);
  const [edit, setEdit] = useState(null);   // protocolo em edição/novo
  const [busca, setBusca] = useState("");
  const [busy, setBusy] = useState(false);
  const carregar = () => loadPsProtocolos(sb).then(setLista);
  useEffect(() => { if (sb) carregar(); }, []);
  const inp2 = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  const q = normTxt(busca);
  const view = lista.filter(p => !q || [p.titulo, p.categoria, p.resumo].some(x => normTxt(x).includes(q)));
  async function salvar() {
    if (!edit.titulo?.trim()) { alert("Informe o título do protocolo."); return; }
    setBusy(true);
    await upsertPsProtocoloRemote(sb, { ...(edit.id ? { id: edit.id } : {}), titulo: edit.titulo.trim(), categoria: edit.categoria?.trim() || null, resumo: edit.resumo?.trim() || null, conteudo: edit.conteudo?.trim() || null, referencia: edit.referencia?.trim() || null, ativo: true }, currentUser);
    registrarAuditoria(sb, currentUser, edit.id ? "PS: editar protocolo" : "PS: cadastrar protocolo", edit.titulo, {});
    setBusy(false); setEdit(null); carregar();
  }
  async function excluir(p) {
    if (!confirm(`Excluir o protocolo "${p.titulo}"?`)) return;
    await deletePsProtocoloRemote(sb, p.id); registrarAuditoria(sb, currentUser, "PS: excluir protocolo", p.titulo, {}); carregar();
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 660, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Protocolos do Pronto-Socorro</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>Protocolos institucionais para consulta no plantão. Revisar periodicamente com a equipe.</div>

        {edit ? (
          <div style={{ border: "1px solid var(--border)", borderRadius: 9, padding: "12px 14px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{edit.id ? "Editar protocolo" : "Novo protocolo"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 9, marginBottom: 9 }}>
              <div><label style={rotuloCampo}>Título *</label><input value={edit.titulo || ""} onChange={e => setEdit(p => ({ ...p, titulo: e.target.value }))} placeholder="Ex.: Protocolo de Dor Torácica" style={inp2} autoFocus /></div>
              <div><label style={rotuloCampo}>Categoria</label><input value={edit.categoria || ""} onChange={e => setEdit(p => ({ ...p, categoria: e.target.value }))} placeholder="Ex.: Cardiologia" style={inp2} /></div>
            </div>
            <div style={{ marginBottom: 9 }}><label style={rotuloCampo}>Resumo</label><input value={edit.resumo || ""} onChange={e => setEdit(p => ({ ...p, resumo: e.target.value }))} placeholder="Uma linha sobre quando aplicar" style={inp2} /></div>
            <div style={{ marginBottom: 9 }}><label style={rotuloCampo}>Conteúdo / passos</label><textarea value={edit.conteudo || ""} onChange={e => setEdit(p => ({ ...p, conteudo: e.target.value }))} rows={7} placeholder={"1. …\n2. …\n3. …"} style={{ ...inp2, resize: "vertical", fontFamily: "inherit" }} /></div>
            <div style={{ marginBottom: 12 }}><label style={rotuloCampo}>Referência / fonte</label><input value={edit.referencia || ""} onChange={e => setEdit(p => ({ ...p, referencia: e.target.value }))} placeholder="Diretriz, ano, sociedade…" style={inp2} /></div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setEdit(null)} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button onClick={salvar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Salvar"}</button>
            </div>
          </div>
        ) : (<>
          <div style={{ display: "flex", gap: 9, marginBottom: 12, flexWrap: "wrap" }}>
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar protocolo…" style={{ ...inp2, flex: 1, minWidth: 180 }} />
            {canEdit && <button onClick={() => setEdit({ titulo: "", categoria: "", resumo: "", conteudo: "", referencia: "" })} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" }}>+ Cadastrar protocolo</button>}
          </div>
          {view.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "1.5rem", border: "1px dashed var(--border)", borderRadius: 10 }}>
              {lista.length === 0 ? "Nenhum protocolo cadastrado ainda." : "Nenhum resultado."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {view.map(p => (
                <details key={p.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px" }}>
                  <summary style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 13 }}>{p.titulo}</strong>
                    {p.categoria && <span style={{ fontSize: 10, color: VX.azul, border: `1px solid ${VX.azul}55`, borderRadius: 99, padding: "0 7px", fontWeight: 700 }}>{p.categoria}</span>}
                    {p.resumo && <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{p.resumo}</span>}
                  </summary>
                  {p.conteudo && <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.6, whiteSpace: "pre-wrap", marginTop: 8 }}>{p.conteudo}</div>}
                  {p.referencia && <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 6 }}>Fonte: {p.referencia}</div>}
                  {canEdit && (
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <button onClick={() => setEdit(p)} style={btnContorno("#3b82f6")}>Editar</button>
                      {isMaster && <button onClick={() => excluir(p)} style={btnContorno("#f43f5e")}>Excluir</button>}
                    </div>
                  )}
                </details>
              ))}
            </div>
          )}
        </>)}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// Alocar um paciente do PS numa sala livre
export function PsAlocarSalaModal({ sala, pacientes, onClose, onSave }) {
  const [sel, setSel] = useState("");
  const [busy, setBusy] = useState(false);
  const p = pacientes.find(x => String(x.id) === String(sel));
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 460, maxWidth: "94vw", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Alocar paciente — sala {sala.identificacao}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>{sala.area} · escolha quem vai ocupar a sala.</div>
        {pacientes.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "1.5rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Nenhum paciente disponível (todos já estão em uma sala, ou não há ninguém aguardando/em atendimento).</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {pacientes.map(x => {
              const m = MANCHESTER[x.classificacao];
              const ativo = String(sel) === String(x.id);
              return (
                <button key={x.id} onClick={() => setSel(String(x.id))} style={{ textAlign: "left", background: ativo ? "var(--surface-3)" : "var(--surface-2)", border: `1px solid ${ativo ? "#22d3ee" : "var(--border)"}`, borderRadius: 8, padding: "9px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                  {m && <span style={{ width: 9, height: 9, borderRadius: 99, background: m.cor, flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{x.iniciais}{x.prontuario ? <span style={{ fontWeight: 400, color: "var(--text-muted)" }}> · reg. {x.prontuario}</span> : ""}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m ? m.label : "sem triagem"}{x.queixa ? ` · ${x.queixa}` : ""}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={async () => { if (!p) { alert("Escolha o paciente."); return; } setBusy(true); await onSave(sala, p); setBusy(false); }} disabled={busy || !p}
            style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13, opacity: (busy || !p) ? 0.5 : 1 }}>{busy ? "…" : "Alocar"}</button>
        </div>
      </div>
    </div>
  );
}

// Cadastro das salas do PS (por área)
export function PsSalasModal({ salas, onClose, onSave, onDelete, isMaster }) {
  const [nova, setNova] = useState({ identificacao: "", area: PS_AREAS[0], ordem: "" });
  const [busy, setBusy] = useState(false);
  const inp2 = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  async function add() {
    if (!nova.identificacao.trim()) { alert("Informe a identificação da sala (ex.: 01)."); return; }
    setBusy(true);
    await onSave({ identificacao: nova.identificacao.trim(), area: nova.area, ordem: nova.ordem === "" ? 0 : Number(nova.ordem), status: "disponivel", ativo: true });
    setNova({ identificacao: "", area: nova.area, ordem: "" });
    setBusy(false);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 560, maxWidth: "94vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Salas do Pronto-Socorro</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>Cadastre as salas por área. Elas aparecem no mapa do painel.</div>

        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 70px auto", gap: 8, alignItems: "end" }}>
            <div><label style={rotuloCampo}>Identificação *</label><input value={nova.identificacao} onChange={e => setNova(p => ({ ...p, identificacao: e.target.value }))} placeholder="01" style={inp2} /></div>
            <div><label style={rotuloCampo}>Área</label><select value={nova.area} onChange={e => setNova(p => ({ ...p, area: e.target.value }))} style={inp2}>{PS_AREAS.map(a => <option key={a} value={a}>{a}</option>)}</select></div>
            <div><label style={rotuloCampo}>Ordem</label><input type="number" value={nova.ordem} onChange={e => setNova(p => ({ ...p, ordem: e.target.value }))} placeholder="0" style={inp2} /></div>
            <button onClick={add} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Add</button>
          </div>
        </div>

        {salas.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "1.5rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Nenhuma sala cadastrada ainda.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {salas.map(s => {
              const st = PS_SALA_STATUS[s.status] || PS_SALA_STATUS.disponivel;
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "7px 11px", opacity: s.ativo === false ? 0.5 : 1 }}>
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 800, minWidth: 42 }}>{s.identificacao}</span>
                  <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-2)" }}>{s.area}</span>
                  <span style={{ fontSize: 10.5, color: st.cor, border: `1px solid ${st.cor}55`, borderRadius: 99, padding: "0 7px", fontWeight: 700 }}>{st.label}</span>
                  <button onClick={() => onSave({ id: s.id, conta_censo: !psContaCenso(s) })} title="Alterna se a vaga entra nos leitos do hospital ou é retaguarda só do PS"
                    style={btnContorno(psContaCenso(s) ? "#0d9488" : "#d97706")}>{psContaCenso(s) ? "No censo" : "Retaguarda"}</button>
                  <button onClick={() => onSave({ id: s.id, ativo: !(s.ativo !== false) })} style={btnContorno(s.ativo !== false ? "#8d99ab" : "#34d399")}>{s.ativo !== false ? "Desativar" : "Ativar"}</button>
                  {isMaster && <button onClick={() => onDelete(s)} style={btnContorno("#f43f5e")}>Excluir</button>}
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

// Editor das faixas — SÓ ADM Master. Mudar um valor marca a faixa como NÃO
// validada (exige revalidar): alterar limiar clínico não pode passar batido.
export function FaixasPediatricasModal({ sb, faixas, currentUser, onClose, onSaved }) {
  const vazio = { faixa: "", rotulo: "", ordem: "", idade_min_meses: "", idade_max_meses: "",
    fc_grave_min: "", fc_moderado_min: "", fc_normal_min: "", fc_normal_max: "", fc_moderado_max: "", fc_grave_max: "",
    fr_grave_min: "", fr_moderado_min: "", fr_normal_min: "", fr_normal_max: "", fr_moderado_max: "", fr_grave_max: "" };
  const [f, setF] = useState(vazio);
  const [busy, setBusy] = useState(false);
  const set = (k, val) => setF(p => ({ ...p, [k]: val }));
  const isMaster = currentUser?.role === "adm_master";
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 7px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 12, outline: "none", width: "100%", boxSizing: "border-box" };
  const hl = { fontSize: 9.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3, textAlign: "center" };
  const numOrNull = v => v === "" || v == null ? null : Number(v);
  const ordenadas = [...(faixas || [])].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const campos = suf => [["grave_min", "Grave ↓"], ["moderado_min", "Moder. ↓"], ["normal_min", "Normal ↓"], ["normal_max", "Normal ↑"], ["moderado_max", "Moder. ↑"], ["grave_max", "Grave ↑"]].map(([k, l]) => [suf + "_" + k, l]);
  const editar = row => setF(Object.keys(vazio).reduce((o, k) => ({ ...o, [k]: row[k] ?? "" }), {}));
  async function salvar(validar) {
    if (!isMaster) return;
    const slug = (f.faixa || "").trim();
    if (!slug || !f.rotulo.trim()) { alert("Informe o identificador e o rótulo da faixa."); return; }
    setBusy(true);
    const payload = { faixa: slug, rotulo: f.rotulo.trim(), ordem: numOrNull(f.ordem) ?? 0, ativo: true, validado: !!validar };
    ["idade_min_meses", "idade_max_meses", "fc_grave_min", "fc_moderado_min", "fc_normal_min", "fc_normal_max", "fc_moderado_max", "fc_grave_max", "fr_grave_min", "fr_moderado_min", "fr_normal_min", "fr_normal_max", "fr_moderado_max", "fr_grave_max"].forEach(k => { payload[k] = numOrNull(f[k]); });
    if (payload.idade_min_meses == null) payload.idade_min_meses = 0;
    await saveFaixaPediatrica(sb, payload, currentUser);
    setBusy(false); setF(vazio); onSaved && onSaved();
  }
  async function marcarValidada(row, val) {
    if (!isMaster) return;
    await saveFaixaPediatrica(sb, { ...row, validado: val }, currentUser); onSaved && onSaved();
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 760, maxWidth: "96vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Faixas pediátricas de referência</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14, marginTop: 2, lineHeight: 1.5 }}>Limites de FC e FR por idade que a triagem pediátrica usa para <em>sugerir</em> a classificação (a enfermeira decide). Ordem crescente: abaixo de <strong>Grave ↓</strong> = vermelho; até <strong>Moder. ↓</strong> = laranja; até <strong>Normal ↓</strong> = amarelo; <strong>Normal ↓–↑</strong> = verde; e simétrico para cima. PA não entra na pediatria. {!isMaster && <strong style={{ color: "#f59e0b" }}>Somente o ADM Master edita.</strong>}</div>

        {isMaster && (
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 14, background: "var(--surface-2)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 70px 90px 90px", gap: 8, marginBottom: 10 }}>
              <div><label style={{ ...hl, textAlign: "left" }}>Identificador</label><input value={f.faixa} onChange={e => set("faixa", e.target.value)} placeholder="ex.: 1a2" style={inp} /></div>
              <div><label style={{ ...hl, textAlign: "left" }}>Rótulo</label><input value={f.rotulo} onChange={e => set("rotulo", e.target.value)} placeholder="1–2 anos" style={inp} /></div>
              <div><label style={{ ...hl, textAlign: "left" }}>Ordem</label><input type="number" value={f.ordem} onChange={e => set("ordem", e.target.value)} style={inp} /></div>
              <div><label style={{ ...hl, textAlign: "left" }}>Idade mín (m)</label><input type="number" value={f.idade_min_meses} onChange={e => set("idade_min_meses", e.target.value)} placeholder="0" style={inp} /></div>
              <div><label style={{ ...hl, textAlign: "left" }}>Idade máx (m)</label><input type="number" value={f.idade_max_meses} onChange={e => set("idade_max_meses", e.target.value)} placeholder="aberto" style={inp} /></div>
            </div>
            {[["FC (bpm)", "fc"], ["FR (irpm)", "fr"]].map(([titulo, suf]) => (
              <div key={suf} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", marginBottom: 4 }}>{titulo}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
                  {campos(suf).map(([k, l]) => (
                    <div key={k}><label style={hl}>{l}</label><input type="number" value={f[k]} onChange={e => set(k, e.target.value)} style={inp} /></div>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <button onClick={() => setF(vazio)} style={{ background: "transparent", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 12px", fontWeight: 600, cursor: "pointer", fontSize: 12 }}>Limpar</button>
              <button onClick={() => salvar(false)} disabled={busy} style={{ background: "var(--surface-3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 14px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>{busy ? "…" : "Salvar (em validação)"}</button>
              <button onClick={() => salvar(true)} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "7px 14px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Salvar e validar</button>
            </div>
          </div>
        )}

        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead><tr>{["Faixa", "Idade (m)", "FC normal", "FR normal", "Status", ""].map(h => <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: "var(--text-muted)", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", background: "var(--bg-2)", borderBottom: "1px solid var(--border)" }}>{h}</th>)}</tr></thead>
            <tbody>
              {ordenadas.length === 0 && <tr><td colSpan={6} style={{ padding: 18, textAlign: "center", color: "var(--text-muted)" }}>Nenhuma faixa cadastrada — rode a migração <code>migracao-ps-faixas-pediatricas.sql</code>.</td></tr>}
              {ordenadas.map(s => (
                <tr key={s.faixa}>
                  <td style={{ padding: "7px 10px", fontWeight: 700 }}>{s.rotulo}</td>
                  <td style={{ padding: "7px 10px", color: "var(--text-3)", fontFamily: "JetBrains Mono, monospace" }}>{s.idade_min_meses ?? 0}–{s.idade_max_meses ?? "∞"}</td>
                  <td style={{ padding: "7px 10px", color: "var(--text-3)", fontFamily: "JetBrains Mono, monospace" }}>{s.fc_normal_min}–{s.fc_normal_max}</td>
                  <td style={{ padding: "7px 10px", color: "var(--text-3)", fontFamily: "JetBrains Mono, monospace" }}>{s.fr_normal_min}–{s.fr_normal_max}</td>
                  <td style={{ padding: "7px 10px" }}>{s.validado ? <span style={{ color: "#34d399", fontWeight: 700 }}>✓ validada</span> : <span style={{ color: "#f59e0b", fontWeight: 700 }}>⏳ em validação</span>}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {isMaster && <>
                      <button onClick={() => editar(s)} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 5, padding: "3px 8px", color: "#22d3ee", cursor: "pointer", fontSize: 11.5, marginRight: 6 }}>Editar</button>
                      <button onClick={() => marcarValidada(s, !s.validado)} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 5, padding: "3px 8px", color: s.validado ? "#f59e0b" : "#34d399", cursor: "pointer", fontSize: 11.5 }}>{s.validado ? "Revogar" : "Validar"}</button>
                    </>}
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

// Editor dos critérios obstétricos — SÓ ADM Master. Mudar um nível/limiar marca
// a regra como NÃO validada (exige revalidar): critério clínico não passa batido.
export function FaixasObstetricasModal({ sb, regras, currentUser, onClose, onSaved }) {
  const vazio = { chave: "", rotulo: "", ordem: "", nivel: "amarelo", pas_min: "", pad_min: "", requer_sintoma: false };
  const [f, setF] = useState(vazio);
  const [busy, setBusy] = useState(false);
  const set = (k, val) => setF(p => ({ ...p, [k]: val }));
  const isMaster = currentUser?.role === "adm_master";
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 12.5, outline: "none", width: "100%", boxSizing: "border-box" };
  const hl = { fontSize: 9.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 };
  const numOrNull = v => v === "" || v == null ? null : Number(v);
  const ordenadas = [...(regras || [])].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const editar = row => setF({ chave: row.chave, rotulo: row.rotulo, ordem: row.ordem ?? "", nivel: row.nivel || "amarelo", pas_min: row.pas_min ?? "", pad_min: row.pad_min ?? "", requer_sintoma: !!row.requer_sintoma });
  async function salvar(validar) {
    if (!isMaster) return;
    const slug = (f.chave || "").trim();
    if (!slug || !f.rotulo.trim()) { alert("Informe o identificador e o rótulo da regra."); return; }
    setBusy(true);
    await saveFaixaObstetrica(sb, { chave: slug, rotulo: f.rotulo.trim(), ordem: numOrNull(f.ordem) ?? 0, nivel: f.nivel, pas_min: numOrNull(f.pas_min), pad_min: numOrNull(f.pad_min), requer_sintoma: !!f.requer_sintoma, ativo: true, validado: !!validar }, currentUser);
    setBusy(false); setF(vazio); onSaved && onSaved();
  }
  async function marcarValidada(row, val) { if (!isMaster) return; await saveFaixaObstetrica(sb, { ...row, validado: val }, currentUser); onSaved && onSaved(); }
  const cor = nv => (MANCHESTER[nv]?.cor || "var(--text)");
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 760, maxWidth: "96vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Critérios obstétricos de risco</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14, marginTop: 2, lineHeight: 1.5 }}>Cada discriminador ou limiar de PA que a triagem obstétrica usa para <em>sugerir</em> a classificação (a enfermeira decide). Regras com limiar de PA (mmHg) disparam pela pressão; as demais, pela presença do achado. "Exige sintoma" = só dispara com cefaleia/epigastralgia/alteração visual marcados (iminência de pré-eclâmpsia). {!isMaster && <strong style={{ color: "#f59e0b" }}>Somente o ADM Master edita.</strong>}</div>

        {isMaster && (
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 14, background: "var(--surface-2)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 2.4fr 60px", gap: 8, marginBottom: 8 }}>
              <div><label style={hl}>Identificador</label><input value={f.chave} onChange={e => set("chave", e.target.value)} placeholder="ex.: sangramento" style={inp} /></div>
              <div><label style={hl}>Rótulo</label><input value={f.rotulo} onChange={e => set("rotulo", e.target.value)} placeholder="Sangramento vaginal" style={inp} /></div>
              <div><label style={hl}>Ordem</label><input type="number" value={f.ordem} onChange={e => set("ordem", e.target.value)} style={inp} /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 90px 90px auto", gap: 8, alignItems: "end" }}>
              <div><label style={hl}>Nível</label>
                <select value={f.nivel} onChange={e => set("nivel", e.target.value)} style={inp}>
                  {Object.entries(MANCHESTER).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                </select>
              </div>
              <div><label style={hl}>PA sist. ≥</label><input type="number" value={f.pas_min} onChange={e => set("pas_min", e.target.value)} placeholder="—" style={inp} /></div>
              <div><label style={hl}>PA diast. ≥</label><input type="number" value={f.pad_min} onChange={e => set("pad_min", e.target.value)} placeholder="—" style={inp} /></div>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "var(--text-2)", cursor: "pointer", paddingBottom: 6 }}><input type="checkbox" checked={f.requer_sintoma} onChange={e => set("requer_sintoma", e.target.checked)} style={{ width: 15, height: 15 }} /> Exige sintoma</label>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
              <button onClick={() => setF(vazio)} style={{ background: "transparent", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 12px", fontWeight: 600, cursor: "pointer", fontSize: 12 }}>Limpar</button>
              <button onClick={() => salvar(false)} disabled={busy} style={{ background: "var(--surface-3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 14px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>{busy ? "…" : "Salvar (em validação)"}</button>
              <button onClick={() => salvar(true)} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "7px 14px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Salvar e validar</button>
            </div>
          </div>
        )}

        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead><tr>{["Discriminador", "Nível", "PA (≥)", "Sintoma", "Status", ""].map(h => <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: "var(--text-muted)", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", background: "var(--bg-2)", borderBottom: "1px solid var(--border)" }}>{h}</th>)}</tr></thead>
            <tbody>
              {ordenadas.length === 0 && <tr><td colSpan={6} style={{ padding: 18, textAlign: "center", color: "var(--text-muted)" }}>Nenhuma regra — rode a migração <code>migracao-ps-faixas-obstetricas.sql</code>.</td></tr>}
              {ordenadas.map(s => (
                <tr key={s.chave}>
                  <td style={{ padding: "7px 10px", fontWeight: 700 }}>{s.rotulo}</td>
                  <td style={{ padding: "7px 10px", color: cor(s.nivel), fontWeight: 700 }}>{MANCHESTER[s.nivel]?.label || s.nivel}</td>
                  <td style={{ padding: "7px 10px", color: "var(--text-3)", fontFamily: "JetBrains Mono, monospace" }}>{s.pas_min != null || s.pad_min != null ? `${s.pas_min ?? "—"}/${s.pad_min ?? "—"}` : "—"}</td>
                  <td style={{ padding: "7px 10px", color: "var(--text-3)" }}>{s.requer_sintoma ? "sim" : "—"}</td>
                  <td style={{ padding: "7px 10px" }}>{s.validado ? <span style={{ color: "#34d399", fontWeight: 700 }}>✓ validada</span> : <span style={{ color: "#f59e0b", fontWeight: 700 }}>⏳ em validação</span>}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {isMaster && <>
                      <button onClick={() => editar(s)} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 5, padding: "3px 8px", color: "#22d3ee", cursor: "pointer", fontSize: 11.5, marginRight: 6 }}>Editar</button>
                      <button onClick={() => marcarValidada(s, !s.validado)} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 5, padding: "3px 8px", color: s.validado ? "#f59e0b" : "#34d399", cursor: "pointer", fontSize: 11.5 }}>{s.validado ? "Revogar" : "Validar"}</button>
                    </>}
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

// Modal de desfecho do PS (alta/internação/transferência/evasão/óbito)
export function PsDesfechoModal({ sb, paciente, setores, leitos = [], catalogos = {}, examesPend, onClose, onSave }) {
  const exAguardando = examesPend?.aguardando || 0;   // exame sem resultado ainda
  const exProntos = examesPend?.prontos || 0;         // resultado saiu, médico não marcou visto
  const inicial = valoresIniciais(paciente);
  const [desfecho, setDesfecho] = useState("");
  const [setorDestino, setSetorDestino] = useState("");
  const [medico, setMedico] = useState("");
  const [obs, setObs] = useState("");
  const [leitoSel, setLeitoSel] = useState("fila"); // "fila" | identificacao do leito
  const [busy, setBusy] = useState(false);
  // Faturamento — abre com o que JÁ está gravado (ver valoresIniciais: abrir
  // vazio faria o UPDATE do desfecho apagar o convênio da Recepção).
  const [convenioId, setConvenioId] = useState(inicial.convenioId);
  const [procedimentoCod, setProcedimentoCod] = useState(inicial.procedimentoCod);
  const [cid, setCid] = useState(inicial.cid);
  const [sugestao, setSugestao] = useState(null);   // convênio do atendimento anterior
  const convenios = catalogos.convenios || [];
  const procedimentos = catalogos.procedimentos || [];
  const [buscaProc, setBuscaProc] = useState("");
  // As opções vêm dos DOIS catálogos: o do hospital e o SIGTAP já carregado.
  // A via sai do desfecho — internação é AIH, o resto do PS é BPA — e é ela
  // que impede oferecer um código de internação para quem teve alta.
  const convObj = convenios.find(c => String(c.id) === String(convenioId)) || null;
  // `viaDaEscolha` chama `resolverVia` — a mesma regra que o motor de conta
  // usa para fechar. Duas regras de via divergindo faria a tela oferecer
  // procedimento de uma via e a conta fechar por outra.
  const viaProc = viaDaEscolha({ atendimento: paciente, convenio: convObj, desfecho });
  const opcoesProc = opcoesDeProcedimento({
    procedimentos, sigtap: catalogos.sigtap || [], desfecho, convenio: convObj, atendimento: paciente,
  });
  const opcoesFiltradas = filtrarProcedimentos(opcoesProc, buscaProc).slice(0, 40);
  const semCatalogo = avisoDeCatalogo({
    opcoes: opcoesProc, procedimentos, sigtap: catalogos.sigtap || [], desfecho, convenio: convObj, atendimento: paciente,
  });
  const procEscolhido = opcoesProc.find(o => o.codigo === procedimentoCod) || null;

  // Convênio do atendimento anterior desta pessoa: poupa digitação e não
  // afirma nada — a tela mostra de onde veio e quem confirma é quem está com
  // o paciente na frente.
  useEffect(() => {
    if (!sb || !paciente.prontuario || inicial.convenioId) return;
    sb(`ps_atendimentos?prontuario=eq.${encodeURIComponent(paciente.prontuario)}` +
            `&convenio_id=not.is.null&id=neq.${paciente.id}` +
            `&select=convenio_id,chegada_em&order=chegada_em.desc&limit=5`)
      .then(r => setSugestao(convenioSugerido(Array.isArray(r) ? r : [])));
  }, [paciente.id]);

  // Só depois de escolher o desfecho — antes disso não se sabe sequer se
  // este atendimento gera conta, e aviso que já nasce aceso não é lido.
  const aviso = desfecho
    ? avisoDeConta({ atendimento: { convenio_id: convenioId, procedimento_cod: procedimentoCod }, desfecho })
    : null;
  const pedeConta = !!desfecho && geraConta(desfecho);
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 11px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  const lbl = { fontSize: 11, fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 5 };

  // Leitos vagos, com os do setor escolhido primeiro
  const livres = leitos.filter(l => l.status === "livre")
    .sort((a, b) => ((b.setor === setorDestino) - (a.setor === setorDestino)) || (a.identificacao || "").localeCompare(b.identificacao || "", "pt-BR", { numeric: true }));

  async function salvar() {
    if (!desfecho) { alert("Escolha o desfecho."); return; }
    if (desfecho === "internacao" && !setorDestino) { alert("Escolha o setor de destino da internação."); return; }
    if (exAguardando > 0 && !confirm(`${paciente.iniciais} tem ${exAguardando} exame(s) aguardando resultado. Dar o desfecho mesmo assim?`)) return;
    const leitoObj = desfecho === "internacao" && leitoSel !== "fila" ? livres.find(l => l.identificacao === leitoSel) : null;
    if (desfecho === "internacao" && leitoObj) {
      if (!confirm(`Reservar o leito ${leitoObj.identificacao}${leitoObj.setor ? ` (${leitoObj.setor})` : ""} para ${paciente.iniciais}? O leito fica RESERVADO até o paciente chegar (confirme a chegada no Mapa de leitos).`)) return;
    }
    // ⚠️ AVISA E DEIXA PASSAR. Desfecho é ato de porta — o leito precisa
    // girar, o paciente está indo embora, e às vezes é óbito. Travar a saída
    // por campo de faturamento inverteria a prioridade. O que não pode é
    // alguém descobrir a falta só no fechamento do mês.
    if (aviso && !confirm(`${aviso.texto}${String.fromCharCode(10, 10)}Finalizar assim mesmo?`)) return;
    setBusy(true);
    await onSave(paciente, {
      desfecho, setorDestino, observacao: obs.trim(), medico: medico.trim(), leito: leitoObj,
      convenioId, procedimentoCod, cid: cid.trim(),
    });
    setBusy(false);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 500, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Desfecho — {paciente.iniciais}</div>
        {(exAguardando > 0 || exProntos > 0) && (
          <div style={{ background: "#d9770618", border: "1px solid #d9770655", borderRadius: 8, padding: "9px 12px", marginBottom: 14, fontSize: 12.5, color: "#d97706", lineHeight: 1.5 }}>
            <strong>Atenção:</strong>{exAguardando > 0 ? ` ${exAguardando} exame(s) aguardando resultado.` : ""}{exProntos > 0 ? ` ${exProntos} resultado(s) ainda não visto(s).` : ""} Confira antes de finalizar.
          </div>
        )}
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

        {/* Via da transferência externa — alimenta o painel de Transferências */}
        {desfecho === "transferencia" && (
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Via da transferência *</label>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {PS_VIAS_TRANSF.map(v => {
                const ativo = normTxt(obs).includes(normTxt(v));
                return (
                  <button key={v} onClick={() => setObs(o => {
                    const limpo = PS_VIAS_TRANSF.reduce((s, x) => s.replace(new RegExp(`^${x}\\s*—\\s*`, "i"), ""), o).trim();
                    return `${v}${limpo ? ` — ${limpo}` : ""}`;
                  })}
                    style={{ background: ativo ? (v === "Vaga Zero" ? "#f43f5e" : VX.azul) : "transparent", color: ativo ? "#fff" : "var(--text-3)", border: `1px solid ${ativo ? (v === "Vaga Zero" ? "#f43f5e" : VX.azul) : "var(--border)"}`, borderRadius: 99, padding: "5px 13px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{v}</button>
                );
              })}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 5 }}>Vaga Zero = imposição de vaga na urgência · GERINT = regulação. A via fica registrada na observação e aparece no painel de Transferências.</div>
          </div>
        )}

        {/* ── Faturamento ──────────────────────────────────────
            Aqui, e não na chegada, porque o procedimento só se sabe no fim —
            e porque é este UPDATE que o faturamento vai ler depois. Some na
            evasão: atendimento que não gera conta não tem o que cobrar. */}
        {pedeConta && (
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "12px 13px", marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>Faturamento</div>
            <div style={{ marginBottom: 10 }}>
              <label style={lbl}>Convênio / fonte pagadora</label>
              <select value={convenioId} onChange={e => setConvenioId(e.target.value)} style={inp}>
                <option value="">Escolha o convênio…</option>
                {convenios.map(c => <option key={c.id} value={String(c.id)}>{c.nome}</option>)}
              </select>
              {convenios.length === 0 && <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 4 }}>Nenhum convênio cadastrado — cadastre em ATENDIMENTO › Tabelas.</div>}
              {sugestao && !convenioId && (
                <button onClick={() => setConvenioId(sugestao.convenio_id)} style={{ marginTop: 5, background: "transparent", border: "1px dashed var(--border-2)", borderRadius: 6, padding: "5px 10px", fontSize: 11.5, color: "var(--text-3)", cursor: "pointer" }}>
                  Usar {convenios.find(c => String(c.id) === sugestao.convenio_id)?.nome || "o convênio anterior"} — foi o do atendimento de {fmtDataBR(sugestao.de)}
                </button>
              )}
            </div>
            {/* Busca em vez de <select>: são centenas de procedimentos, e
                rolar 219 opções com o paciente saindo é o mesmo que não ter
                lista. A escolha some assim que um código é fixado. */}
            <div style={{ marginBottom: 10 }}>
              <label style={lbl}>Procedimento</label>
              {procEscolhido ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 11px" }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--text-2)" }}>
                    <strong style={{ fontFamily: "JetBrains Mono, monospace" }}>{procEscolhido.codigo}</strong> — {procEscolhido.nome}
                    <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{procEscolhido.fonte === "sigtap" ? `tabela SIGTAP${procEscolhido.competencia ? ` · competência ${procEscolhido.competencia}` : ""}` : "catálogo do hospital"} · via {procEscolhido.via.toUpperCase()}</div>
                  </div>
                  <button onClick={() => { setProcedimentoCod(""); setBuscaProc(""); }} style={{ background: "transparent", color: "var(--text-3)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Trocar</button>
                </div>
              ) : semCatalogo ? (
                <div style={{ fontSize: 11.5, color: "#d97706", background: "#d9770614", border: "1px solid #d9770633", borderRadius: 6, padding: "8px 11px", lineHeight: 1.5 }}>{semCatalogo}</div>
              ) : (
                <>
                  <input value={buscaProc} onChange={e => setBuscaProc(e.target.value)} placeholder={`Buscar entre ${opcoesProc.length} procedimentos${viaProc ? ` de ${viaProc.toUpperCase()}` : ""}…`} style={inp} />
                  <div style={{ maxHeight: 168, overflowY: "auto", border: buscaProc ? "1px solid var(--border)" : "none", borderRadius: 6, marginTop: buscaProc ? 6 : 0 }}>
                    {buscaProc && opcoesFiltradas.length === 0 && <div style={{ fontSize: 11.5, color: "var(--text-muted)", padding: "8px 11px" }}>Nada encontrado para “{buscaProc}”.</div>}
                    {buscaProc && opcoesFiltradas.map(o => (
                      <button key={o.codigo} onClick={() => setProcedimentoCod(o.codigo)} style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", borderBottom: "1px solid var(--border)", padding: "7px 11px", cursor: "pointer", color: "var(--text-2)", fontSize: 12, fontFamily: "inherit" }}>
                        <strong style={{ fontFamily: "JetBrains Mono, monospace" }}>{o.codigo}</strong> — {o.nome}
                        {o.fonte === "sigtap" && <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 800, color: VX.azul, border: `1px solid ${VX.azul}55`, borderRadius: 99, padding: "0 6px" }}>SIGTAP</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div>
              <label style={lbl}>CID (opcional)</label>
              <input value={cid} onChange={e => setCid(e.target.value)} placeholder="Ex.: J18" style={inp} />
            </div>
            {aviso && (
              <div style={{ background: "#d9770618", border: "1px solid #d9770655", borderRadius: 7, padding: "8px 11px", marginTop: 10, fontSize: 11.5, color: "#d97706", lineHeight: 1.5 }}>
                {aviso.texto}
              </div>
            )}
          </div>
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

// Painel do atendimento médico no PS: evolução, prescrição, checagem e exames.
// abaInicial permite abrir direto na aba certa (a lista da enfermagem cai na Checagem).
export function AtendimentoModal({ sb, sbCru, paciente, currentUser, onClose, onChanged, abaInicial }) {
  const [registros, setRegistros] = useState([]);
  const [aba, setAba] = useState(abaInicial || "evolucao"); // evolucao | prescricao | checagem | exames
  const [texto, setTexto] = useState("");
  const [gravando, setGravando] = useState(false);
  const [evolCat, setEvolCat] = useState("medica");   // quem está evoluindo
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
  const [adms, setAdms] = useState([]);                       // checagens de medicação deste atendimento
  const [checando, setChecando] = useState(null);             // item aberto para checar
  const [chkForm, setChkForm] = useState({ status: "administrado", motivo: "", observacao: "", categoria: "enfermagem", quando: "" });
  const [ctx, setCtx] = useState({ idade: paciente.idade ?? "", peso: paciente.peso ?? "", clearance_renal: paciente.clearance_renal ?? "", funcao_hepatica: paciente.funcao_hepatica ?? "", alergias: paciente.alergias ?? "", em_sonda: !!paciente.em_sonda, gestante: !!paciente.gestante, comorbidades: Array.isArray(paciente.comorbidades) ? paciente.comorbidades : [] });
  const [ctxAberto, setCtxAberto] = useState(false);
  const [ctxBusy, setCtxBusy] = useState(false);
  const [ctxMsg, setCtxMsg] = useState("");
  const catById = {}; catalogo.forEach(m => catById[m.id] = m);
  // Disponibilidade em estoque na hora de prescrever (não mostra saldo — só o
  // sinal: sem estoque / estoque baixo — e oferece similares que têm saldo).
  const [presLotes, setPresLotes] = useState([]);
  const [verSimilares, setVerSimilares] = useState(null);   // medicamento sem estoque
  const estoqueSinal = med => sinalDeEstoque(med, presLotes);
  // Similares COM saldo: mesmo princípio ativo primeiro, depois mesma classe
  const similaresComEstoque = med => similaresDisponiveis(med, catalogo, presLotes);
  const recRef = useRef(null);
  const suportaVoz = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 11px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  const carregarRegistros = () => loadPsRegistros(sb, paciente.id).then(setRegistros);
  const carregarPrescricao = () => { loadPsPrescricaoItens(sb, paciente.id).then(setPresItensSalvos); loadFarmSaidasByAtendimento(sb, paciente.id).then(setSaidas); loadPsAdministracoes(sb, paciente.id).then(setAdms); };
  useEffect(() => { carregarRegistros(); }, []);
  useEffect(() => { loadFarmMedicamentos(sb).then(setCatalogo); loadFarmLotes(sb).then(setPresLotes); loadFarmInteracoes(sb).then(setInteracoes); loadFarmIncompatY(sb).then(setIncompatY); carregarPrescricao(); }, []);
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
    await addPsRegistroRemote(sb, { atendimento_id: paciente.id, tipo, categoria: tipo === "evolucao" ? evolCat : null, texto: texto.trim(), criado_em: nowISO() }, currentUser);
    registrarAuditoria(sb, currentUser, `PS: ${tipo === "evolucao" ? (PS_EVOL_CATEGORIAS[evolCat]?.label || "evolução") : "prescrição"}`, paciente.iniciais, {});
    setTexto(""); setBusy(false); carregarRegistros(); onChanged?.();
  }
  async function salvarContexto() {
    setCtxBusy(true); setCtxMsg("");
    const payload = { idade: ctx.idade === "" ? null : Number(ctx.idade), peso: ctx.peso === "" ? null : Number(ctx.peso), clearance_renal: ctx.clearance_renal === "" ? null : Number(ctx.clearance_renal), funcao_hepatica: ctx.funcao_hepatica || null, alergias: ctx.alergias?.trim() || null, em_sonda: !!ctx.em_sonda, gestante: !!ctx.gestante, comorbidades: Array.isArray(ctx.comorbidades) ? ctx.comorbidades : [] };
    const r = await patchPsAtendimentoDireto(sbCru, paciente.id, payload);
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
    // Aviso (não bloqueio): itens sem saldo não poderão ser dispensados pela farmácia
    const semEstoque = presItens.filter(it => estoqueSinal(catById[it.medicamento_id])?.key === "zerado");
    if (semEstoque.length && !confirm(
      `⚠ SEM ESTOQUE NA FARMÁCIA\n\n${semEstoque.map(it => `• ${it.medicamento_nome}`).join("\n")}\n\n` +
      `A farmácia não vai conseguir dispensar ${semEstoque.length === 1 ? "este item" : "estes itens"} agora.\n` +
      `Assinar mesmo assim?`
    )) return;
    if (!confirm("Assinar esta prescrição? Ela NÃO poderá ser editada nem apagada depois (registro clínico).")) return;
    setBusy(true);
    const linhas = presItens.map(it => `• ${it.medicamento_nome}${it.dose ? " — " + it.dose : ""}${it.via ? " (" + it.via + ")" : ""}${it.quantidade ? " — qtd " + farmFmtQtd(it.quantidade) + (it.unidade ? " " + it.unidade : "") : ""}`);
    const texto = (linhas.join("\n") + (presObs.trim() ? `\nObs.: ${presObs.trim()}` : "")).trim();
    const regRows = await addPsRegistroRemote(sb, { atendimento_id: paciente.id, tipo: "prescricao", texto, criado_em: nowISO() }, currentUser);
    const registroId = Array.isArray(regRows) ? regRows[0]?.id : null;
    if (presItens.length) {
      const itens = presItens.map(it => ({ atendimento_id: paciente.id, registro_id: registroId, medicamento_id: it.medicamento_id || null, medicamento_nome: it.medicamento_nome, unidade: it.unidade || null, dose: it.dose || null, dose_valor: it.dose_valor ?? null, dose_unidade: it.dose_unidade || null, frequencia_dia: it.frequencia_dia ?? null, duracao_dias: it.duracao_dias ?? null, via: it.via || null, quantidade: it.quantidade ? Number(it.quantidade) : null }));
      await addPsPrescricaoItens(sb, itens, currentUser);
    }
    registrarAuditoria(sb, currentUser, "PS: prescrição", `${paciente.iniciais} · ${presItens.length} item(ns)`, {});
    setPresItens([]); setPresObs(""); setBusy(false);
    carregarRegistros(); carregarPrescricao(); onChanged?.();
  }
  const dispensadoDoItem = itemId => dispensado(itemId, saidas);
  // Item ainda sem nenhuma checagem (nem administrado, nem justificado)
  const semChecagem = it => semChecagemDoItem(it, adms);
  // A farmácia entregou e ninguém registrou o que foi feito com o medicamento
  const itensPendentesChecagem = pendentesDeChecagem(presItensSalvos, saidas, adms);
  // Abre a checagem de um item. A hora vem preenchida com agora, mas é editável:
  // à beira do leito a enfermagem administra primeiro e registra depois.
  function abrirChecagem(it) {
    setChecando(it);
    setChkForm(f => ({ status: "administrado", motivo: "", observacao: "", categoria: f.categoria || "enfermagem", quando: isoToLocal(nowISO()) }));
  }
  async function confirmarChecagem() {
    const it = checando;
    if (!it) return;
    if (chkForm.status === "nao_administrado" && !chkForm.motivo) { alert("Informe o motivo de a dose não ter sido administrada."); return; }
    const quandoIso = chkForm.quando ? localToIso(chkForm.quando) : nowISO();
    if (new Date(quandoIso) > new Date()) { alert("A hora da administração não pode estar no futuro."); return; }
    const rotulo = chkForm.status === "administrado" ? "administrado" : "NÃO administrado";
    if (!confirm(`Registrar ${it.medicamento_nome} como ${rotulo} em ${horaFmt(quandoIso)}?\n\nÉ um registro clínico: NÃO poderá ser editado nem apagado depois.`)) return;
    setBusy(true);
    await addPsAdministracao(sb, {
      atendimento_id: paciente.id, prescricao_item_id: it.id, medicamento_id: it.medicamento_id || null,
      medicamento_nome: it.medicamento_nome, dose: it.dose || null, via: it.via || null,
      status: chkForm.status, motivo: chkForm.status === "nao_administrado" ? chkForm.motivo : null,
      observacao: chkForm.observacao.trim() || null, categoria: chkForm.categoria, administrado_em: quandoIso,
    }, currentUser);
    registrarAuditoria(sb, currentUser, `PS: checagem de medicação (${rotulo})`, `${paciente.iniciais} · ${it.medicamento_nome}`, {});
    setChecando(null); setBusy(false);
    loadPsAdministracoes(sb, paciente.id).then(setAdms);
    onChanged?.();
  }

  const evolucoes = registros.filter(r => r.tipo === "evolucao");
  const prescricoes = registros.filter(r => r.tipo === "prescricao");
  const exames = registros.filter(r => r.tipo === "exame");
  const alertasClinicos = analisarPrescricaoClinica([...presItensSalvos, ...presItens], ctx, catById, interacoes, incompatY);
  const abaBtn = ativo => ({ background: ativo ? "#22d3ee" : "transparent", color: ativo ? "#000" : "var(--text-3)", border: `1px solid ${ativo ? "#22d3ee" : "var(--border)"}`, borderRadius: 7, padding: "7px 14px", fontWeight: 700, cursor: "pointer", fontSize: 12.5 });

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
          <button onClick={() => setAba("evolucao")} style={abaBtn(aba === "evolucao")}>Evoluções ({evolucoes.length})</button>
          <button onClick={() => setAba("prescricao")} style={abaBtn(aba === "prescricao")}>Prescrição ({prescricoes.length})</button>
          <button onClick={() => setAba("checagem")} style={abaBtn(aba === "checagem")}>
            Checagem ({adms.length})
            {itensPendentesChecagem.length > 0 && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: aba === "checagem" ? "#000" : "#d97706" }}>● {itensPendentesChecagem.length} a checar</span>}
          </button>
          <button onClick={() => setAba("exames")} style={abaBtn(aba === "exames")}>Exames ({exames.length})</button>
        </div>

        {aba === "evolucao" && (
          <>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, marginBottom: 5 }}>Quem está registrando</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Object.entries(PS_EVOL_CATEGORIAS).map(([k, v]) => (
                  <button key={k} onClick={() => setEvolCat(k)}
                    style={{ background: evolCat === k ? v.cor : "transparent", color: evolCat === k ? "#fff" : "var(--text-3)", border: `1px solid ${evolCat === k ? v.cor : "var(--border)"}`, borderRadius: 99, padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{v.curto}</button>
                ))}
              </div>
            </div>
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={5} placeholder={`Escreva a ${(PS_EVOL_CATEGORIAS[evolCat]?.label || "evolução").toLowerCase()} — ou clique em Ditar e fale.`} style={{ ...inp, resize: "vertical", lineHeight: 1.55, marginBottom: 8 }} />
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
              {suportaVoz && <button onClick={toggleVoz} style={{ background: gravando ? "#f43f5e" : "transparent", color: gravando ? "#fff" : "var(--text-2)", border: `1px solid ${gravando ? "#f43f5e" : "var(--border-2)"}`, borderRadius: 6, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{gravando ? "● Gravando… (parar)" : "Ditar por voz"}</button>}
              <button onClick={() => salvarTexto("evolucao")} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13, marginLeft: "auto" }}>{busy ? "…" : "Salvar evolução"}</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {evolucoes.map(r => { const ec = PS_EVOL_CATEGORIAS[r.categoria] || PS_EVOL_CATEGORIAS.medica; return (
                <div key={r.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: `3px solid ${ec.cor}`, borderRadius: 8, padding: "10px 13px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 9.5, fontWeight: 800, color: ec.cor, border: `1px solid ${ec.cor}55`, borderRadius: 99, padding: "0 7px", textTransform: "uppercase" }}>{ec.curto}</span>
                    <span style={{ fontSize: 10.5, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{horaFmt(r.criado_em)} · {r.usuario || "?"}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{r.texto}</div>
                </div>
              ); })}
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
                    <div><label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>ClCr / TFG (opcional)</label><input type="number" min="0" step="any" value={ctx.clearance_renal} onChange={e => setCtx(p => ({ ...p, clearance_renal: e.target.value }))} style={{ ...inp, padding: "7px 9px" }} /></div>
                    <div><label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Função hepática</label><select value={ctx.funcao_hepatica} onChange={e => setCtx(p => ({ ...p, funcao_hepatica: e.target.value }))} style={{ ...inp, padding: "7px 9px" }}><option value="">—</option><option value="normal">Normal</option><option value="leve">Leve</option><option value="moderada">Moderada</option><option value="grave">Grave</option></select></div>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 4 }}>Comorbidades</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {COMORBIDADES.map(c => { const on = (ctx.comorbidades || []).includes(c.chave); return (
                        <button key={c.chave} type="button" onClick={() => setCtx(p => ({ ...p, comorbidades: on ? (p.comorbidades || []).filter(x => x !== c.chave) : [...(p.comorbidades || []), c.chave] }))} style={{ background: on ? "#22d3ee22" : "transparent", color: on ? "#22d3ee" : "var(--text-3)", border: `1px solid ${on ? "#22d3ee" : "var(--border-2)"}`, borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: on ? 700 : 500, cursor: "pointer" }}>{on ? "✓ " : ""}{c.label}</button>
                      ); })}
                    </div>
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
                      {catalogo.filter(m => (m.classe || "Outros") === c && m.ativo !== false).map(m => { const sg = estoqueSinal(m); return <option key={m.id} value={m.id}>{m.nome}{sg ? ` — ${sg.label}` : ""}</option>; })}
                    </optgroup>
                  ))}
                </select>
                {/* Situação de estoque do item escolhido — sem mostrar o saldo */}
                {(() => {
                  const medSel = catById[presForm.medId];
                  const sg = estoqueSinal(medSel);
                  if (!medSel || !sg) return null;
                  const sims = sg.key === "zerado" ? similaresComEstoque(medSel) : [];
                  return (
                    <div style={{ marginTop: 6, background: sg.cor + "14", border: `1px solid ${sg.cor}55`, borderRadius: 7, padding: "7px 10px", fontSize: 12, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <strong style={{ color: sg.cor }}>{sg.label}</strong>
                      <span>{sg.key === "zerado" ? "a farmácia não conseguirá dispensar." : "pode faltar antes do fim do tratamento."}</span>
                      {sg.key === "zerado" && <button onClick={() => setVerSimilares(medSel)} style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${VX.azul}66`, color: VX.azul, borderRadius: 6, padding: "4px 10px", fontWeight: 700, cursor: "pointer", fontSize: 11.5 }}>Ver similares{sims.length ? ` (${sims.length})` : ""}</button>}
                    </div>
                  );
                })()}
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
                      <span style={{ flex: 1 }}><strong>{it.medicamento_nome}</strong>{it.dose ? ` — ${it.dose}` : ""} <span style={{ color: "var(--text-muted)" }}>{it.via}{it.quantidade ? ` · qtd ${farmFmtQtd(it.quantidade)} ${it.unidade || ""}` : ""}</span>
                        {(() => { const sg = estoqueSinal(catById[it.medicamento_id]); return sg ? <span style={{ fontSize: 9.5, fontWeight: 800, color: sg.cor, border: `1px solid ${sg.cor}66`, borderRadius: 99, padding: "0 6px", marginLeft: 6, whiteSpace: "nowrap" }}>{sg.label}</span> : null; })()}
                      </span>
                      {estoqueSinal(catById[it.medicamento_id])?.key === "zerado" && <button onClick={() => setVerSimilares(catById[it.medicamento_id])} style={{ background: "transparent", border: `1px solid ${VX.azul}66`, color: VX.azul, borderRadius: 6, padding: "2px 8px", fontWeight: 700, cursor: "pointer", fontSize: 11 }}>similares</button>}
                      <button onClick={() => setPresItens(p => p.filter((_, j) => j !== i))} style={{ background: "transparent", border: "none", color: "#f43f5e", cursor: "pointer", fontSize: 15, lineHeight: 1 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              <textarea value={presObs} onChange={e => setPresObs(e.target.value)} rows={2} placeholder="Observações / cuidados (opcional)" style={{ ...inp, resize: "vertical", marginBottom: 10 }} />
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button onClick={assinarPrescricao} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Assinar prescrição"}</button>
              </div>

              {/* Similares com estoque — troca na hora */}
              {verSimilares && (() => {
                const sims = similaresComEstoque(verSimilares);
                return (
                  <div onClick={() => setVerSimilares(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
                    <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 520, maxWidth: "94vw", maxHeight: "88vh", overflowY: "auto" }}>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>Similares com estoque</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
                        <strong style={{ color: "#f43f5e" }}>{verSimilares.nome}</strong> está sem estoque. Estes têm saldo na farmácia — clique para usar no lugar. <em>A equivalência terapêutica é decisão sua.</em>
                      </div>
                      {sims.length === 0 ? (
                        <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "1.5rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Nenhum similar com estoque (mesmo princípio ativo ou mesma classe). Fale com a farmácia.</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {sims.map(({ m, motivo }) => (
                            <button key={m.id} onClick={() => { setPresForm(p => ({ ...p, medId: String(m.id) })); setVerSimilares(null); }}
                              style={{ textAlign: "left", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>{m.nome}</div>
                                <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{motivo}{m.principio_ativo ? ` · ${m.principio_ativo}` : ""}</div>
                              </div>
                              <span style={{ fontSize: 11, color: VX.azul, fontWeight: 700, whiteSpace: "nowrap" }}>usar este →</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                        <button onClick={() => setVerSimilares(null)} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Fechar</button>
                      </div>
                    </div>
                  </div>
                );
              })()}
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
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 10 }}>Prescrições são assinadas com data/hora e imutáveis. A dispensação (baixa de estoque) é feita na Farmácia; o registro de que o paciente recebeu fica na aba <strong>Checagem</strong>.</div>
          </>
        )}

        {aba === "checagem" && (
          <>
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 13px", marginBottom: 12, fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.55 }}>
              <strong>Dispensado</strong> significa que o medicamento saiu da farmácia. <strong>Checado</strong> significa que ele foi administrado ao paciente — com hora e responsável. São coisas diferentes: só a checagem fecha o ciclo.
            </div>

            {presItensSalvos.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "1.5rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Nenhum medicamento prescrito neste atendimento.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {presItensSalvos.map(it => {
                  const qtd = Number(it.quantidade || 0);
                  const disp = dispensadoDoItem(it.id);
                  const dadas = psDosesDadas(it.id, adms);
                  const previstas = Number(it.frequencia_dia || 0);
                  const naoDadas = adms.filter(a => String(a.prescricao_item_id) === String(it.id) && a.status === "nao_administrado").length;
                  const dispSt = qtd <= 0 ? (disp > 0 ? { c: "#34d399", t: "dispensado" } : { c: "#8d99ab", t: "sem dispensação" })
                    : disp >= qtd ? { c: "#34d399", t: "dispensado" } : disp > 0 ? { c: "#d97706", t: `dispensado parcial ${farmFmtQtd(disp)}/${farmFmtQtd(qtd)}` } : { c: "#8d99ab", t: "não dispensado" };
                  const pendente = disp > 0 && semChecagem(it);
                  const aberto = checando?.id === it.id;
                  return (
                    <div key={it.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: `3px solid ${pendente ? "#d97706" : dadas > 0 ? "#34d399" : "var(--border-2)"}`, borderRadius: 8, padding: "10px 13px" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                        <span style={{ flex: 1, fontSize: 13, color: "var(--text)", minWidth: 180 }}>
                          <strong>{it.medicamento_nome}</strong>{it.dose ? ` — ${it.dose}` : ""} <span style={{ color: "var(--text-muted)" }}>{it.via || ""}</span>
                        </span>
                        <span style={{ fontSize: 10.5, color: dispSt.c, fontWeight: 700, whiteSpace: "nowrap" }}>{dispSt.t}</span>
                        {!aberto && <button onClick={() => abrirChecagem(it)} style={btnContorno(pendente ? "#d97706" : "#22d3ee")}>Checar</button>}
                        {aberto && <button onClick={() => setChecando(null)} style={btnContorno("#8d99ab")}>Fechar</button>}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ color: dadas > 0 ? "#34d399" : "var(--text-muted)", fontWeight: dadas > 0 ? 700 : 500 }}>
                          {dadas} dose(s) administrada(s){previstas > 0 ? ` de ${previstas} previstas por dia` : ""}
                        </span>
                        {naoDadas > 0 && <span style={{ color: "#f43f5e", fontWeight: 700 }}>{naoDadas} não administrada(s)</span>}
                        {pendente && <span style={{ color: "#d97706", fontWeight: 700 }}>aguardando checagem</span>}
                      </div>

                      {aberto && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                          <div style={{ display: "flex", gap: 6, marginBottom: 9, flexWrap: "wrap" }}>
                            {Object.entries(PS_ADM_STATUS).map(([k, v]) => (
                              <button key={k} onClick={() => setChkForm(f => ({ ...f, status: k, motivo: k === "administrado" ? "" : f.motivo }))}
                                style={{ background: chkForm.status === k ? v.cor : "transparent", color: chkForm.status === k ? "#000" : "var(--text-3)", border: `1px solid ${chkForm.status === k ? v.cor : "var(--border)"}`, borderRadius: 99, padding: "5px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{v.label}</button>
                            ))}
                          </div>

                          {chkForm.status === "nao_administrado" && (
                            <div style={{ marginBottom: 9 }}>
                              <div style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, marginBottom: 4 }}>Motivo (obrigatório)</div>
                              <select value={chkForm.motivo} onChange={e => setChkForm(f => ({ ...f, motivo: e.target.value }))} style={inp}>
                                <option value="">Selecione o motivo…</option>
                                {PS_ADM_MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
                              </select>
                            </div>
                          )}

                          <div style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, marginBottom: 4 }}>Quem administrou</div>
                          <div style={{ display: "flex", gap: 6, marginBottom: 9, flexWrap: "wrap" }}>
                            {Object.entries(PS_ADM_CATEGORIAS).map(([k, v]) => (
                              <button key={k} onClick={() => setChkForm(f => ({ ...f, categoria: k }))}
                                style={{ background: chkForm.categoria === k ? v.cor : "transparent", color: chkForm.categoria === k ? "#fff" : "var(--text-3)", border: `1px solid ${chkForm.categoria === k ? v.cor : "var(--border)"}`, borderRadius: 99, padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{v.curto}</button>
                            ))}
                          </div>

                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 9 }}>
                            <div style={{ flex: "1 1 200px" }}>
                              <div style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, marginBottom: 4 }}>Hora da administração</div>
                              <input type="datetime-local" value={chkForm.quando} onChange={e => setChkForm(f => ({ ...f, quando: e.target.value }))} style={inp} />
                            </div>
                            <div style={{ flex: "2 1 260px" }}>
                              <div style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, marginBottom: 4 }}>Observação (opcional)</div>
                              <input value={chkForm.observacao} onChange={e => setChkForm(f => ({ ...f, observacao: e.target.value }))} placeholder="Ex.: reação no local, dose fracionada…" style={inp} />
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>Registro permanente, assinado como <strong>{currentUser?.name || "—"}</strong>.</span>
                            <button onClick={confirmarChecagem} disabled={busy} style={{ marginLeft: "auto", background: chkForm.status === "administrado" ? "#34d399" : "#f43f5e", color: chkForm.status === "administrado" ? "#000" : "#fff", border: "none", borderRadius: 6, padding: "8px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Confirmar checagem"}</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".04em", margin: "16px 0 8px" }}>Histórico de administrações</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {adms.map(a => { const st = PS_ADM_STATUS[a.status] || PS_ADM_STATUS.administrado; const cat = PS_ADM_CATEGORIAS[a.categoria] || PS_ADM_CATEGORIAS.outro; return (
                <div key={a.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: `3px solid ${st.cor}`, borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 9.5, fontWeight: 800, color: st.cor, border: `1px solid ${st.cor}55`, borderRadius: 99, padding: "0 7px", textTransform: "uppercase" }}>{st.label}</span>
                    <strong style={{ fontSize: 12.5, color: "var(--text)" }}>{a.medicamento_nome}</strong>
                    {a.dose && <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>{a.dose}</span>}
                    {a.via && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{a.via}</span>}
                    <span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{horaFmt(a.administrado_em)} · {cat.curto} · {a.usuario || "?"}</span>
                  </div>
                  {(a.motivo || a.observacao) && (
                    <div style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 3 }}>
                      {a.motivo ? <span style={{ color: "#f43f5e", fontWeight: 600 }}>{a.motivo}</span> : null}{a.motivo && a.observacao ? " · " : ""}{a.observacao || ""}
                    </div>
                  )}
                </div>
              ); })}
              {adms.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>Nenhuma medicação checada ainda.</div>}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 10 }}>A checagem é um registro clínico append-only: cada dose fica gravada com hora, categoria profissional e responsável. Não pode ser editada nem apagada.</div>
          </>
        )}

        {aba === "exames" && (
          <AbaExames sb={sb} paciente={paciente} currentUser={currentUser} exames={exames}
            busy={busy} setBusy={setBusy} onMudou={() => { carregarRegistros(); onChanged?.(); }} />
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// Modal de triagem/reavaliação: sinais vitais → sugestão de Manchester → decisão da triadora
export function TriagemModal({ sb, paciente, onClose, onTriar, reavaliacao = false, faixasPediatricas = [], faixasObstetricas = [] }) {
  const [v, setV] = useState({ pa_sist: "", pa_diast: "", fc: "", fr: "", spo2: "", temp: "", dor: "", consciencia: "A", glicemia: "" });
  const [busy, setBusy] = useState(false);
  // Idade vinda do cadastro. Guarda o objeto inteiro (`{ meses, exata }`),
  // não só o número de anos: a triagem pediátrica precisa saber se a idade
  // é EXATA (veio da data de nascimento) ou aproximada (só do ano) —
  // sugerir faixa de sinal vital com base em chute é o que não pode.
  const [idadeInfo, setIdadeInfo] = useState({ meses: null, exata: false, rotulo: null });
  const idade = idadeInfo.meses != null ? Math.floor(idadeInfo.meses / 12) : null;
  const [historico, setHistorico] = useState([]); // aferições anteriores (reavaliação)
  const [comorb, setComorb] = useState(Array.isArray(paciente.comorbidades) ? paciente.comorbidades : []);
  const set = (k, val) => setV(p => ({ ...p, [k]: val }));
  const toggleComorb = k => setComorb(cs => cs.includes(k) ? cs.filter(x => x !== k) : [...cs, k]);
  const [tipo, setTipo] = useState(paciente.triagem_tipo || "adulto");
  const [obst, setObst] = useState(paciente.obstetricia && typeof paciente.obstetricia === "object" ? paciente.obstetricia : {});
  const [ped, setPed] = useState(paciente.pediatria && typeof paciente.pediatria === "object" ? paciente.pediatria : {});
  const setO = (k, val) => setObst(p => ({ ...p, [k]: val }));
  const setP = (k, val) => setPed(p => ({ ...p, [k]: val }));
  useEffect(() => {
    if (paciente.prontuario && sb) {
      sb(`pacientes?prontuario=eq.${encodeURIComponent(paciente.prontuario)}&select=data_nascimento,ano_nascimento`)
        .then(r => { const p = Array.isArray(r) && r[0]; if (p) setIdadeInfo(idadeMesesParaTriagem(p)); })
        .catch(() => {});
    }
    if (reavaliacao) loadPsSinais(sb, paciente.id).then(setHistorico);
  }, []);
  const pediatrico = tipo === "pediatrica" || (idade != null && idade < 13);
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  const lbl = { fontSize: 10.5, fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 4 };
  // Idade em meses para a faixa pediátrica. A ordem importa:
  //   1. o que a triadora digitou (é quem está com a criança na frente);
  //   2. a data de nascimento do cadastro — exata;
  //   3. o ano de nascimento — APROXIMADO, erro de até 11 meses.
  //
  // O caso 3 era a fonte de um erro silencioso: `ano * 12` transformava um
  // bebê de 26 dias nascido em dezembro num "12 meses" em janeiro, e os
  // sinais vitais dele passavam a ser julgados contra outra fisiologia.
  // Agora a aproximação continua servindo para criança maior — onde ±11
  // meses não troca a faixa — e é RECUSADA abaixo de 2 anos, que é onde
  // ela mente. Aí a tela pede a idade exata em vez de sugerir por chute.
  const idadeDigitada = ped.idade_meses != null && ped.idade_meses !== "" ? Number(ped.idade_meses) : null;
  const idadeAproximadaDemais = idadeDigitada == null && !idadeInfo.exata
    && idadeInfo.meses != null && idadeInfo.meses < 24;
  const idadeMeses = idadeDigitada != null ? idadeDigitada
    : idadeAproximadaDemais ? null
    : idadeInfo.meses;
  // Obstétrica: sugestão automática segue desativada (fase posterior).
  // Pediátrica: motor por faixa de idade (Fase 3). Adulto: motor padrão.
  const av = tipo === "obstetrica"
    ? avaliarObstetrica(v, obst, faixasObstetricas)
    : pediatrico
      ? avaliarSinaisVitaisPediatrico(v, idadeMeses, faixasPediatricas)
      : avaliarSinaisVitais(v);
  const sug = av.sugestao ? MANCHESTER[av.sugestao] : null;
  const faixasPedProntas = faixasValidadas(faixasPediatricas);
  const obstetricasProntas = obstetricasValidadas(faixasObstetricas);
  const semIdadeMeses = pediatrico && idadeMeses == null;
  const semFaixaPeds = pediatrico && idadeMeses != null && !av.faixa;

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
    await onTriar(k, vitaisPayload(), av.sugestao || null, comorb, { tipo, obst, ped });
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 600, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>{reavaliacao ? "Reavaliação" : "Triagem"} — {paciente.iniciais}{idade != null ? ` (${idade} anos)` : ""}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>{paciente.queixa || "Sem queixa registrada"} · chegou há {fmtDur(diffMin(paciente.chegada_em, nowISO()))}{reavaliacao && paciente.classificacao ? ` · classificação atual: ${MANCHESTER[paciente.classificacao]?.label || paciente.classificacao}` : ""}</div>

        {/* TIPO DE TRIAGEM */}
        <div style={{ display: "flex", gap: 7, marginBottom: 14, flexWrap: "wrap" }}>
          {[["adulto", "Adulto"], ["obstetrica", "Obstétrica"], ["pediatrica", "Pediátrica"]].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTipo(k)} style={{ flex: 1, minWidth: 90, background: tipo === k ? VX.turquesa : "transparent", color: tipo === k ? "#062a26" : "var(--text-3)", border: `1px solid ${tipo === k ? VX.turquesa : "var(--border-2)"}`, borderRadius: 8, padding: "8px 10px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{label}</button>
          ))}
        </div>

        {/* AVISO OBSTÉTRICO */}
        {tipo === "obstetrica" && (
          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: "4px solid #e11d48", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#e11d48" }}>Triagem obstétrica</div>
            <div style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 3, lineHeight: 1.5 }}>
              A sugestão usa os discriminadores obstétricos (sangramento, movimento fetal, perda de líquido, contrações) e a PA (pré-eclâmpsia). É apoio — a classificação final é da enfermeira, pelo protocolo de acolhimento e classificação de risco em obstetrícia.
              {!obstetricasProntas && <><br />⚠ <strong style={{ color: "#f59e0b" }}>Critérios obstétricos em validação</strong> — ainda não validados pelo ADM Master; use como apoio provisório.</>}
            </div>
          </div>
        )}

        {/* AVISO PEDIÁTRICO */}
        {pediatrico && (
          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: "4px solid #ef4444", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#ef4444" }}>Paciente pediátrico{idade != null ? ` (${idade} anos)` : ""}</div>
            <div style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 3, lineHeight: 1.5 }}>
              O apoio à decisão usa faixas de FC/FR <strong>por idade</strong> (não as de adulto). A PA não é usada na triagem pediátrica. A sugestão é apoio — a classificação final é da enfermeira, pelo protocolo pediátrico.
              {/* Duas causas diferentes para a mesma falta, e o profissional
                  precisa saber qual é: "não temos a idade" pede um dado;
                  "temos só o ano" avisa que o dado que existe MENTE nessa
                  faixa — e por que o sistema preferiu não sugerir. */}
              {semIdadeMeses && (idadeAproximadaDemais
                ? <><br />⚠ <strong style={{ color: "#f59e0b" }}>O cadastro tem só o ano de nascimento</strong> — nesta faixa isso erra até 11 meses e trocaria a faixa de referência. Informe a idade em meses abaixo, ou complete a data de nascimento no cadastro.</>
                : <><br />⚠ <strong style={{ color: "#f59e0b" }}>Informe a idade em meses</strong> (campo abaixo) para a sugestão por faixa etária.</>)}
              {pediatrico && !idadeDigitada && idadeInfo.exata && idadeInfo.rotulo && (
                <><br />Idade pelo cadastro: <strong>{idadeInfo.rotulo}</strong>.</>
              )}
              {semFaixaPeds && <><br />⚠ <strong style={{ color: "#f59e0b" }}>Sem faixa cadastrada para esta idade</strong> — FC/FR não entram na sugestão.</>}
              {!faixasPedProntas && <><br />⚠ <strong style={{ color: "#f59e0b" }}>Faixas pediátricas em validação</strong> — ainda não validadas pelo ADM Master; use como apoio provisório.</>}
            </div>
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

        {/* CAMPOS OBSTÉTRICOS */}
        {tipo === "obstetrica" && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Dados obstétricos</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 8 }}>
              <div><label style={lbl}>IG (semanas)</label><input type="number" min="0" max="45" value={obst.ig_semanas ?? ""} onChange={e => setO("ig_semanas", e.target.value)} placeholder="—" style={inp} /></div>
              <div><label style={lbl}>Gestações (G)</label><input type="number" min="0" value={obst.gesta ?? ""} onChange={e => setO("gesta", e.target.value)} placeholder="0" style={inp} /></div>
              <div><label style={lbl}>Abortos</label><input type="number" min="0" value={obst.aborto ?? ""} onChange={e => setO("aborto", e.target.value)} placeholder="0" style={inp} /></div>
              <div><label style={lbl}>Partos normais</label><input type="number" min="0" value={obst.partos_normais ?? ""} onChange={e => setO("partos_normais", e.target.value)} placeholder="0" style={inp} /></div>
              <div><label style={lbl}>Cesáreas</label><input type="number" min="0" value={obst.cesareas ?? ""} onChange={e => setO("cesareas", e.target.value)} placeholder="0" style={inp} /></div>
              <div><label style={lbl}>Mov. fetal</label><select value={obst.mov_fetal ?? ""} onChange={e => setO("mov_fetal", e.target.value)} style={inp}><option value="">—</option><option value="presente">Presente</option><option value="reduzido">Reduzido</option><option value="ausente">Ausente</option></select></div>
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--text-2)", cursor: "pointer" }}><input type="checkbox" checked={!!obst.sangramento} onChange={e => setO("sangramento", e.target.checked)} style={{ accentColor: "#e11d48", width: 15, height: 15 }} /> Sangramento vaginal</label>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--text-2)", cursor: "pointer" }}><input type="checkbox" checked={!!obst.perda_liquido} onChange={e => setO("perda_liquido", e.target.checked)} style={{ accentColor: "#e11d48", width: 15, height: 15 }} /> Perda de líquido / bolsa rota</label>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--text-2)", cursor: "pointer" }}><input type="checkbox" checked={!!obst.contracoes} onChange={e => setO("contracoes", e.target.checked)} style={{ accentColor: "#e11d48", width: 15, height: 15 }} /> Contrações</label>
            </div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".05em", margin: "10px 0 5px" }}>Sinais de alerta (pré-eclâmpsia)</div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--text-2)", cursor: "pointer" }}><input type="checkbox" checked={!!obst.cefaleia} onChange={e => setO("cefaleia", e.target.checked)} style={{ accentColor: "#e11d48", width: 15, height: 15 }} /> Cefaleia</label>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--text-2)", cursor: "pointer" }}><input type="checkbox" checked={!!obst.epigastralgia} onChange={e => setO("epigastralgia", e.target.checked)} style={{ accentColor: "#e11d48", width: 15, height: 15 }} /> Epigastralgia</label>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--text-2)", cursor: "pointer" }}><input type="checkbox" checked={!!obst.alteracao_visual} onChange={e => setO("alteracao_visual", e.target.checked)} style={{ accentColor: "#e11d48", width: 15, height: 15 }} /> Alteração visual</label>
            </div>
          </div>
        )}

        {/* CAMPOS PEDIÁTRICOS */}
        {tipo === "pediatrica" && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Dados pediátricos</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
              <div><label style={lbl}>Peso (kg)</label><input type="number" min="0" step="any" value={ped.peso ?? ""} onChange={e => setP("peso", e.target.value)} placeholder="—" style={inp} /></div>
              <div><label style={lbl}>Idade (meses)</label><input type="number" min="0" value={ped.idade_meses ?? ""} onChange={e => setP("idade_meses", e.target.value)} placeholder="—" style={inp} /></div>
            </div>
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 6 }}>O peso alimenta a checagem de dose. A <strong>idade em meses</strong> define a faixa de FC/FR do apoio à decisão (a PA não é medida na triagem pediátrica).</div>
          </div>
        )}

        {/* SINAIS VITAIS */}
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Sinais vitais</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 8 }}>
          {!pediatrico && <>
            <div><label style={lbl}>PA sist. (mmHg)</label><input type="number" value={v.pa_sist} onChange={e => set("pa_sist", e.target.value)} placeholder="120" style={inp} /></div>
            <div><label style={lbl}>PA diast.</label><input type="number" value={v.pa_diast} onChange={e => set("pa_diast", e.target.value)} placeholder="80" style={inp} /></div>
          </>}
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

        {/* COMORBIDADES */}
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Comorbidades</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
          {COMORBIDADES.map(c => { const on = comorb.includes(c.chave); return (
            <button key={c.chave} type="button" onClick={() => toggleComorb(c.chave)} style={{ background: on ? "#22d3ee22" : "transparent", color: on ? "#22d3ee" : "var(--text-3)", border: `1px solid ${on ? "#22d3ee" : "var(--border-2)"}`, borderRadius: 99, padding: "5px 12px", fontSize: 12, fontWeight: on ? 700 : 500, cursor: "pointer" }}>{on ? "✓ " : ""}{c.label}</button>
          ); })}
        </div>
        <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginBottom: 12 }}>Marque o que o paciente tem. "DRC em diálise" e "Hepatopatia" já avisam a farmácia sobre ajuste de dose — sem precisar digitar ClCr.</div>

        {/* SUGESTÃO AO VIVO */}
        {(sug ? (
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
