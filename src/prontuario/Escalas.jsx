// Escalas de enfermagem + Lesão por Pressão (Tier 1, Fase 1a) — aba do
// prontuário do internado. Aplica as 7 escalas (formulário vindo do catálogo,
// com prévia do score ao vivo), classifica pelo motor puro e notifica a LPP
// com o marcador "presente na admissão × adquirida". Apoio à decisão — a
// conduta é da enfermeira; a competência COFEN é respeitada (papeis.js).

import { useState } from "react";
import { avaliarEscala, precisaReavaliar, escalasValidadas } from "../clinico/escalas-enfermagem.js";
import { ESCALAS, ORDEM_ESCALAS, ESTAGIOS_LPP } from "../clinico/escalas-catalogo.js";
import { podeClinico, motivoDaRecusa } from "../clinico/papeis.js";
import { registrarEscala, registrarLesaoPressao } from "./dados.js";

const NIVEL_COR = { verde: "#34d399", amarelo: "#f5b301", laranja: "#fb923c", vermelho: "#f43f5e" };
const cor = { borda: "var(--border)", sup: "var(--surface)", sup2: "var(--surface-2)", txt: "var(--text)", txt3: "var(--text-3)", mut: "var(--text-muted)" };
const cartao = { background: cor.sup, border: `1px solid ${cor.borda}`, borderRadius: 10, padding: "14px 16px", marginBottom: 14 };
const inp = { background: "var(--input-bg)", border: `1px solid ${cor.borda}`, borderRadius: 6, padding: "8px 10px", color: cor.txt, fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
const lbl = { fontSize: 11, fontWeight: 700, color: cor.mut, marginBottom: 4, display: "block" };
const dataHora = d => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function Chip({ nivel, texto }) {
  const c = NIVEL_COR[nivel] || cor.mut;
  return <span style={{ background: `${c}1f`, color: c, border: `1px solid ${c}66`, borderRadius: 999, padding: "2px 10px", fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }}>{texto}</span>;
}

export default function Escalas({ sb, episodio, escalas = [], lpp = [], faixas = [], currentUser, canEdit, onOk }) {
  const [aplicando, setAplicando] = useState(null);   // tipo em aplicação
  const [form, setForm] = useState({});               // { chave: pontos } ou { valor }
  const [sitio, setSitio] = useState("");
  const [lppForm, setLppForm] = useState(null);       // objeto do formulário de LPP
  const [busy, setBusy] = useState(false);

  const podeAplicar = canEdit && podeClinico(currentUser, "aplicar_escala");
  const podeLpp     = canEdit && podeClinico(currentUser, "notificar_lesao_pressao");
  const validadas   = escalasValidadas(faixas);

  // A carga já vem ordenada por aferido_em desc → a primeira de cada tipo é a última.
  const ultima = {};
  escalas.forEach(e => { if (!ultima[e.tipo]) ultima[e.tipo] = e; });

  const spec = aplicando ? ESCALAS[aplicando] : null;
  const itensAtuais = spec ? (spec.tipo === "soma" ? form : { valor: form.valor }) : {};
  const previa = aplicando ? avaliarEscala(aplicando, itensAtuais, faixas) : null;

  async function salvarEscala() {
    if (busy || previa?.score == null) return;
    setBusy(true);
    await registrarEscala(sb, episodio, {
      tipo: aplicando, itens: itensAtuais, score: previa.score,
      classificacao: previa.classificacao, nivel: previa.nivel,
      sitio: spec.pedeSitio ? (sitio || null) : null,
    }, currentUser);
    setBusy(false); setAplicando(null); setForm({}); setSitio(""); onOk && onOk();
  }
  async function salvarLpp() {
    if (busy) return;
    setBusy(true);
    await registrarLesaoPressao(sb, episodio, lppForm, currentUser);
    setBusy(false); setLppForm(null); onOk && onOk();
  }

  const lppAdquiridas = lpp.filter(l => l.presente_admissao === false).length;

  return (
    <div>
      {!validadas && (
        <div style={{ ...cartao, borderLeft: "4px solid #f5b301", background: "#f5b30112" }}>
          <strong style={{ fontSize: 12.5, color: "#b45309" }}>Cortes das escalas em validação</strong>
          <div style={{ fontSize: 11.5, color: cor.txt3, marginTop: 3 }}>Os pontos de corte ainda não foram validados pelo ADM Master. As classificações são apoio provisório — a enfermeira decide.</div>
        </div>
      )}

      {/* ESCALAS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12, marginBottom: 6 }}>
        {ORDEM_ESCALAS.map(tipo => {
          const s = ESCALAS[tipo]; const u = ultima[tipo];
          const fx = u && faixas.find(f => f.tipo === tipo && f.rotulo === u.classificacao);
          const vencida = u && fx && precisaReavaliar(u.aferido_em, fx.reavaliar_horas);
          return (
            <div key={tipo} style={{ ...cartao, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 800 }}>{s.nome}</div>
                <div style={{ fontSize: 11, color: cor.mut }}>{s.sub}</div>
              </div>
              {u ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {u.classificacao ? <Chip nivel={u.nivel} texto={`${u.classificacao}${u.score != null ? ` · ${u.score}` : ""}`} /> : <span style={{ fontSize: 12, color: cor.txt3 }}>score {u.score ?? "—"}</span>}
                  <span style={{ fontSize: 10.5, color: cor.mut }}>{dataHora(u.aferido_em)}</span>
                </div>
              ) : <div style={{ fontSize: 12, color: cor.txt3 }}>Sem registro nesta internação.</div>}
              {vencida && <div style={{ fontSize: 11, fontWeight: 700, color: "#fb923c" }}>⏱ Reavaliação vencida</div>}
              {podeAplicar
                ? <button onClick={() => { setAplicando(tipo); setForm({}); setSitio(""); }} style={{ marginTop: "auto", alignSelf: "flex-start", background: "transparent", color: "#22d3ee", border: "1px solid #22d3ee66", borderRadius: 6, padding: "6px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{u ? "Reavaliar" : "Aplicar"}</button>
                : <div style={{ fontSize: 10.5, color: cor.mut, marginTop: "auto" }} title={motivoDaRecusa(currentUser, "aplicar_escala")}>Sem competência para aplicar</div>}
            </div>
          );
        })}
      </div>

      {/* FORMULÁRIO DE APLICAÇÃO */}
      {aplicando && (
        <div style={{ ...cartao, borderLeft: `4px solid ${NIVEL_COR[previa?.nivel] || "#22d3ee"}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>{spec.nome} — {spec.sub}</div>
            {previa?.score != null && <Chip nivel={previa.nivel} texto={`${previa.classificacao || "score"} · ${previa.score}`} />}
          </div>

          {spec.tipo === "soma" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
              {spec.itens.map(it => (
                <div key={it.chave}>
                  <label style={lbl}>{it.rotulo}</label>
                  <select value={form[it.chave] ?? ""} onChange={e => setForm(f => ({ ...f, [it.chave]: e.target.value === "" ? undefined : Number(e.target.value) }))} style={inp}>
                    <option value="">—</option>
                    {it.opcoes.map(o => <option key={o.v} value={o.v}>{o.l} ({o.v})</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
          {spec.tipo === "opcoes" && (
            <div style={{ maxWidth: 420 }}>
              <label style={lbl}>Selecione</label>
              <select value={form.valor ?? ""} onChange={e => setForm({ valor: e.target.value === "" ? undefined : Number(e.target.value) })} style={inp}>
                <option value="">—</option>
                {spec.opcoes.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
              {spec.pedeSitio && <div style={{ marginTop: 8 }}><label style={lbl}>Acesso venoso (local)</label><input value={sitio} onChange={e => setSitio(e.target.value)} placeholder="ex.: MSD, jelco 20G" style={{ ...inp, maxWidth: 260 }} /></div>}
            </div>
          )}
          {spec.tipo === "valor" && (
            <div style={{ maxWidth: 320 }}>
              <label style={lbl}>Intensidade ({spec.min}–{spec.max})</label>
              <input type="number" min={spec.min} max={spec.max} value={form.valor ?? ""} onChange={e => setForm({ valor: e.target.value === "" ? undefined : Number(e.target.value) })} style={{ ...inp, maxWidth: 120 }} />
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={salvarEscala} disabled={busy || previa?.score == null} style={{ background: busy || previa?.score == null ? "#5b76a0" : "#22d3ee", color: "#04222b", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 800, fontSize: 13, cursor: busy || previa?.score == null ? "default" : "pointer" }}>{busy ? "…" : "Registrar"}</button>
            <button onClick={() => { setAplicando(null); setForm({}); }} style={{ background: "transparent", color: cor.txt3, border: `1px solid ${cor.borda}`, borderRadius: 6, padding: "8px 16px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* LESÃO POR PRESSÃO */}
      <div style={{ ...cartao }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800 }}>Lesão por pressão {lpp.length > 0 && <span style={{ fontWeight: 600, color: cor.mut }}>· {lpp.length} registro(s){lppAdquiridas > 0 ? `, ${lppAdquiridas} adquirida(s)` : ""}</span>}</div>
          {podeLpp
            ? <button onClick={() => setLppForm({ presente_admissao: false, local: "", estagio: "", descricao: "" })} style={{ background: "transparent", color: "#f43f5e", border: "1px solid #f43f5e66", borderRadius: 6, padding: "6px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>+ Notificar lesão</button>
            : <span style={{ fontSize: 10.5, color: cor.mut }} title={motivoDaRecusa(currentUser, "notificar_lesao_pressao")}>Sem competência</span>}
        </div>

        {lpp.length === 0 && !lppForm && <div style={{ fontSize: 12.5, color: cor.txt3 }}>Nenhuma lesão por pressão registrada nesta internação.</div>}

        {lpp.map(l => (
          <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: `1px solid ${cor.borda}`, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: l.presente_admissao ? "#38bdf8" : "#f43f5e", background: l.presente_admissao ? "#38bdf81f" : "#f43f5e1f", border: `1px solid ${l.presente_admissao ? "#38bdf866" : "#f43f5e66"}`, borderRadius: 999, padding: "2px 10px" }}>{l.presente_admissao ? "Presente na admissão" : "Adquirida na unidade"}</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{ESTAGIOS_LPP.find(e => e.v === l.estagio)?.l || l.estagio || "estágio não informado"}</span>
            {l.local && <span style={{ fontSize: 12.5, color: cor.txt3 }}>· {l.local}</span>}
            <span style={{ marginLeft: "auto", fontSize: 10.5, color: cor.mut }}>{l.registrado_por || ""}</span>
          </div>
        ))}

        {lppForm && (
          <div style={{ marginTop: 12, padding: 12, background: cor.sup2, border: `1px solid ${cor.borda}`, borderRadius: 8 }}>
            <label style={lbl}>Origem da lesão</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              {[[false, "Adquirida na unidade"], [true, "Presente na admissão"]].map(([v, t]) => (
                <button key={String(v)} onClick={() => setLppForm(f => ({ ...f, presente_admissao: v }))} style={{ background: lppForm.presente_admissao === v ? (v ? "#38bdf8" : "#f43f5e") : "transparent", color: lppForm.presente_admissao === v ? "#fff" : cor.txt3, border: `1px solid ${v ? "#38bdf8" : "#f43f5e"}66`, borderRadius: 7, padding: "7px 12px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>{t}</button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div><label style={lbl}>Localização</label><input value={lppForm.local} onChange={e => setLppForm(f => ({ ...f, local: e.target.value }))} placeholder="ex.: região sacral" style={inp} /></div>
              <div><label style={lbl}>Estágio</label>
                <select value={lppForm.estagio} onChange={e => setLppForm(f => ({ ...f, estagio: e.target.value }))} style={inp}>
                  <option value="">—</option>
                  {ESTAGIOS_LPP.map(e => <option key={e.v} value={e.v}>{e.l}</option>)}
                </select>
              </div>
            </div>
            <label style={lbl}>Descrição (opcional)</label>
            <textarea value={lppForm.descricao} onChange={e => setLppForm(f => ({ ...f, descricao: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={salvarLpp} disabled={busy} style={{ background: busy ? "#5b76a0" : "#f43f5e", color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 800, fontSize: 13, cursor: busy ? "default" : "pointer" }}>{busy ? "…" : "Registrar lesão"}</button>
              <button onClick={() => setLppForm(null)} style={{ background: "transparent", color: cor.txt3, border: `1px solid ${cor.borda}`, borderRadius: 6, padding: "8px 16px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
