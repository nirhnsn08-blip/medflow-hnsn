// SAE — Processo de Enfermagem (Tier 1, Fase 1b) — aba do prontuário do
// internado. As cinco etapas do PE (COFEN 736/2024): Histórico → Diagnóstico
// (NANDA) → Resultado esperado → Prescrição (NIC) com aprazamento → Evolução;
// e a checagem do cuidado à beira-leito, que o técnico executa como checa a
// medicação. Diagnóstico e prescrição são privativos do enfermeiro (papeis.js);
// o motor (sae.js) sugere a partir do que já existe — a conduta é da enfermeira.

import { useState } from "react";
import {
  indexarCatalogo, diagnosticosDaUnidade, HISTORICO_MODELO, UNIDADES, SUBTIPOS_DX, PRIORIDADES,
} from "../clinico/sae-catalogo.js";
import { sugerirDiagnosticos, montarItensPrescricao, checarCuidados, resumoSae } from "../clinico/sae.js";
import { podeClinico, motivoDaRecusa } from "../clinico/papeis.js";
import {
  registrarHistoricoEnfermagem, registrarDiagnostico, assinarPrescricaoEnf,
  registrarChecagemCuidado, registrarEvolucaoEnfermagem,
} from "./dados.js";

const cor = { borda: "var(--border)", sup: "var(--surface)", sup2: "var(--surface-2)", txt: "var(--text)", txt3: "var(--text-3)", mut: "var(--text-muted)" };
const cartao = { background: cor.sup, border: `1px solid ${cor.borda}`, borderRadius: 10, padding: "14px 16px", marginBottom: 14 };
const inp = { background: "var(--input-bg)", border: `1px solid ${cor.borda}`, borderRadius: 6, padding: "8px 10px", color: cor.txt, fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
const lbl = { fontSize: 11, fontWeight: 700, color: cor.mut, marginBottom: 4, display: "block" };
const btnP = (on = true) => ({ background: on ? "#22d3ee" : "#5b76a0", color: "#04222b", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 800, fontSize: 13, cursor: on ? "pointer" : "default" });
const btnG = { background: "transparent", color: cor.txt3, border: `1px solid ${cor.borda}`, borderRadius: 6, padding: "8px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer" };
const SUB_COR = { real: "#f43f5e", risco: "#fb923c", promocao: "#34d399" };
const dataHora = d => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const hhmm = d => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const toggle = (arr, v) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

function Pill({ c, texto, title }) {
  return <span title={title} style={{ background: `${c}1f`, color: c, border: `1px solid ${c}66`, borderRadius: 999, padding: "2px 9px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{texto}</span>;
}
function SemCompetencia({ ato, user }) {
  return <span style={{ fontSize: 10.5, color: cor.mut }} title={motivoDaRecusa(user, ato)}>Sem competência</span>;
}

export default function SAE({
  sb, episodio, saeCatalogo = [], saeHistorico = [], saeDiagnosticos = [],
  saePrescricoes = [], saePrescricaoItens = [], saeChecagem = [],
  escalas = [], lpp = [], sinais = [], evolucoes = [], currentUser, canEdit, onOk,
}) {
  const [etapa, setEtapa] = useState("diagnosticos");
  const [busy, setBusy] = useState(false);
  const [unidade, setUnidade] = useState("");
  const [novoDx, setNovoDx] = useState(null);
  const [excluidos, setExcluidos] = useState(() => new Set());
  const [hist, setHist] = useState({ dados: {}, queixa: "", exame_fisico: "", observacao: "" });
  const [motivo, setMotivo] = useState({});
  const [evo, setEvo] = useState("");

  const idx = indexarCatalogo(saeCatalogo);
  const podeHist = canEdit && podeClinico(currentUser, "historico_enfermagem");
  const podeDx = canEdit && podeClinico(currentUser, "diagnostico_enfermagem");
  const podePresc = canEdit && podeClinico(currentUser, "prescricao_enfermagem");
  const podeChecar = canEdit && podeClinico(currentUser, "checar_cuidado_enfermagem");
  const podeEvo = canEdit && podeClinico(currentUser, "evolucao_enfermagem");

  // Diagnósticos vigentes = últimos da linhagem (corrige_id aposenta o anterior).
  const superados = new Set(saeDiagnosticos.map(d => d.corrige_id).filter(Boolean));
  const dxVigentes = saeDiagnosticos.filter(d => !superados.has(d.id));
  const dxAtivos = dxVigentes.filter(d => (d.status || "ativo") === "ativo");

  const prescAtual = saePrescricoes[0] || null;
  const itensAtuais = saePrescricaoItens
    .filter(i => i.prescricao_id === prescAtual?.id)
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

  const sugestoes = sugerirDiagnosticos({ escalas, lpp, sinais }, idx);
  const jaTem = new Set(dxAtivos.map(d => d.catalogo_id));
  const sugestoesNovas = sugestoes.filter(s => !jaTem.has(s.catalogo_id));

  const dxParaPresc = dxAtivos.map(d => ({ id: d.id, catalogo_id: d.catalogo_id, titulo: d.titulo, payload: idx.porId.get(d.catalogo_id)?.payload || {} }));
  const itensSugeridos = montarItensPrescricao(dxParaPresc, idx);
  const itensParaAssinar = itensSugeridos.filter(i => !excluidos.has(i.catalogo_id));

  const hoje = new Date();
  const resumo = resumoSae({ diagnosticos: dxVigentes, itens: itensAtuais, checagens: saeChecagem }, { competencia: hoje, agora: hoje });
  const evolucoesEnf = evolucoes.filter(e => e.tipo === "evolucao_enfermagem");
  const catalogoVazio = idx.diagnosticos.length === 0;

  function abrirNovoDx(catId) {
    const c = idx.porId.get(catId);
    if (!c) return;
    setNovoDx({
      catalogo_id: c.id, codigo: c.codigo, titulo: c.titulo, dominio: c.dominio,
      subtipo: c.subtipo || "real", caracteristicas: [], fatores: [],
      resultado_esperado: c.payload?.resultado || "", prioridade: "media",
      _def: c.payload?.def || [], _fat: c.payload?.fat || [],
    });
    setEtapa("diagnosticos");
  }

  async function salvarHistorico() {
    if (busy || !podeHist) return;
    setBusy(true);
    await registrarHistoricoEnfermagem(sb, episodio, hist, currentUser);
    setBusy(false); setHist({ dados: {}, queixa: "", exame_fisico: "", observacao: "" }); onOk && onOk();
  }
  async function salvarDx() {
    if (busy || !novoDx?.titulo) return;
    setBusy(true);
    await registrarDiagnostico(sb, episodio, {
      catalogo_id: novoDx.catalogo_id, codigo: novoDx.codigo, titulo: novoDx.titulo, dominio: novoDx.dominio,
      subtipo: novoDx.subtipo, caracteristicas: novoDx.caracteristicas, fatores: novoDx.fatores,
      resultado_esperado: novoDx.resultado_esperado, prioridade: novoDx.prioridade, status: "ativo",
    }, currentUser);
    setBusy(false); setNovoDx(null); onOk && onOk();
  }
  async function resolverDx(d) {
    if (busy) return;
    setBusy(true);
    await registrarDiagnostico(sb, episodio, {
      catalogo_id: d.catalogo_id, codigo: d.codigo, titulo: d.titulo, dominio: d.dominio, subtipo: d.subtipo,
      caracteristicas: d.caracteristicas, fatores: d.fatores, resultado_esperado: d.resultado_esperado,
      prioridade: d.prioridade, status: "resolvido", corrige_id: d.id, motivo_correcao: "Resolvido",
    }, currentUser);
    setBusy(false); onOk && onOk();
  }
  async function assinarPresc() {
    if (busy || !itensParaAssinar.length) return;
    setBusy(true);
    await assinarPrescricaoEnf(sb, episodio, { itens: itensParaAssinar, substituiId: prescAtual?.id || null }, currentUser);
    setBusy(false); setExcluidos(new Set()); onOk && onOk();
  }
  async function checar(item, status) {
    if (busy || !podeChecar) return;
    setBusy(true);
    const prox = item.se_necessario ? null : checarCuidados(item, saeChecagem, { competencia: hoje, agora: hoje }).find(s => !s.administrado)?.horario;
    await registrarChecagemCuidado(sb, episodio, {
      item_id: item.id, prescricao_id: item.prescricao_id || prescAtual?.id,
      horario_previsto: prox ? hhmm(prox) : null, status,
      motivo: status === "nao_realizado" ? (motivo[item.id] || "Não informado") : null,
    }, currentUser);
    setBusy(false); setMotivo(m => ({ ...m, [item.id]: "" })); onOk && onOk();
  }
  async function salvarEvolucao() {
    if (busy || !evo.trim() || !podeEvo) return;
    setBusy(true);
    await registrarEvolucaoEnfermagem(sb, episodio, evo.trim(), currentUser);
    setBusy(false); setEvo(""); onOk && onOk();
  }

  const setCampo = (secao, campo, val) => setHist(h => ({ ...h, dados: { ...h.dados, [secao]: { ...(h.dados[secao] || {}), [campo]: val } } }));

  const etapas = [
    ["historico", `Histórico${saeHistorico.length ? " ✓" : ""}`],
    ["diagnosticos", `Diagnósticos (${dxAtivos.length})`],
    ["prescricao", `Prescrição (${itensAtuais.length})`],
    ["checagem", `Checagem${resumo.checagensAtrasadas ? ` · ${resumo.checagensAtrasadas}!` : ""}`],
    ["evolucao", "Evolução"],
  ];

  return (
    <div>
      {/* RESUMO */}
      <div style={{ ...cartao, display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
        {[["Diagnósticos ativos", resumo.diagnosticosAtivos, "#38bdf8"],
          ["Cuidados prescritos", resumo.cuidados, "#22d3ee"],
          ["Checagens pendentes", resumo.checagensPendentes, "#f5b301"],
          ["Atrasadas", resumo.checagensAtrasadas, resumo.checagensAtrasadas ? "#f43f5e" : cor.mut]].map(([t, v, c]) => (
          <div key={t}>
            <div style={{ fontSize: 10.5, color: cor.mut, textTransform: "uppercase", letterSpacing: ".05em" }}>{t}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: c }}>{v}</div>
          </div>
        ))}
        <div style={{ marginLeft: "auto", fontSize: 11, color: cor.txt3, maxWidth: 320 }}>
          Processo de Enfermagem (COFEN 736/2024). Apoio à decisão — a conduta é da enfermeira.
        </div>
      </div>

      {catalogoVazio && (
        <div style={{ ...cartao, borderLeft: "4px solid #f5b301", background: "#f5b30112" }}>
          <strong style={{ fontSize: 12.5, color: "#b45309" }}>Catálogo da SAE não carregado</strong>
          <div style={{ fontSize: 11.5, color: cor.txt3, marginTop: 3 }}>Rode a migração <code>migracao-enf-sae.sql</code> no banco. Sem o catálogo, não há diagnósticos/intervenções para sugerir.</div>
        </div>
      )}

      {/* NAV DAS ETAPAS */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {etapas.map(([k, t]) => (
          <button key={k} onClick={() => setEtapa(k)} style={{ background: etapa === k ? "var(--bg-2)" : "transparent", color: etapa === k ? "var(--text)" : cor.mut, border: `1px solid ${etapa === k ? cor.borda : "transparent"}`, borderRadius: 7, padding: "6px 13px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>{t}</button>
        ))}
      </div>

      {/* ─── HISTÓRICO ─── */}
      {etapa === "historico" && (
        <div>
          {saeHistorico[0] && (
            <div style={{ ...cartao }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 4 }}>Último histórico · {dataHora(saeHistorico[0].criado_em)} · {saeHistorico[0].registrado_por || ""}</div>
              {saeHistorico[0].queixa && <div style={{ fontSize: 12.5, color: cor.txt3 }}>{saeHistorico[0].queixa}</div>}
            </div>
          )}
          {podeHist ? (
            <div style={{ ...cartao }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 10 }}>Coleta de dados de enfermagem</div>
              <label style={lbl}>Queixa / percepção do paciente</label>
              <input value={hist.queixa} onChange={e => setHist(h => ({ ...h, queixa: e.target.value }))} style={{ ...inp, marginBottom: 12 }} />
              {HISTORICO_MODELO.map(sec => (
                <div key={sec.chave} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#38bdf8", marginBottom: 6 }}>{sec.titulo}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
                    {sec.campos.map(cp => (
                      <div key={cp.chave}>
                        <label style={lbl}>{cp.rotulo}</label>
                        {cp.tipo === "opcoes" ? (
                          <select value={hist.dados[sec.chave]?.[cp.chave] ?? ""} onChange={e => setCampo(sec.chave, cp.chave, e.target.value)} style={inp}>
                            <option value="">—</option>
                            {cp.opcoes.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                          </select>
                        ) : (
                          <input value={hist.dados[sec.chave]?.[cp.chave] ?? ""} onChange={e => setCampo(sec.chave, cp.chave, e.target.value)} style={inp} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <label style={lbl}>Exame físico (resumo)</label>
              <textarea value={hist.exame_fisico} onChange={e => setHist(h => ({ ...h, exame_fisico: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical", marginBottom: 12 }} />
              <button onClick={salvarHistorico} disabled={busy} style={btnP(!busy)}>{busy ? "…" : "Registrar histórico"}</button>
            </div>
          ) : <div style={{ ...cartao, fontSize: 12.5, color: cor.txt3 }}>O histórico de enfermagem é conduzido pelo enfermeiro. <SemCompetencia ato="historico_enfermagem" user={currentUser} /></div>}
        </div>
      )}

      {/* ─── DIAGNÓSTICOS ─── */}
      {etapa === "diagnosticos" && (
        <div>
          {sugestoesNovas.length > 0 && (
            <div style={{ ...cartao, borderLeft: "4px solid #38bdf8" }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 8 }}>Sugeridos pelos dados do paciente</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sugestoesNovas.map(s => (
                  <div key={s.catalogo_id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{s.titulo}</span>
                    <span style={{ fontSize: 11.5, color: cor.txt3 }}>· {s.motivo}</span>
                    {podeDx && <button onClick={() => abrirNovoDx(s.catalogo_id)} style={{ ...btnG, marginLeft: "auto", padding: "4px 10px", color: "#22d3ee", borderColor: "#22d3ee66" }}>+ Adicionar</button>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {podeDx ? (
            <div style={{ ...cartao }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: cor.mut, fontWeight: 700 }}>Unidade:</span>
                {[["", "Todas"], ...UNIDADES.map(u => [u.v, u.l])].map(([v, l]) => (
                  <button key={v} onClick={() => setUnidade(v)} style={{ ...btnG, padding: "4px 10px", fontSize: 11.5, background: unidade === v ? "var(--bg-2)" : "transparent", color: unidade === v ? "var(--text)" : cor.mut }}>{l}</button>
                ))}
                <select value="" onChange={e => e.target.value && abrirNovoDx(e.target.value)} style={{ ...inp, maxWidth: 340, marginLeft: "auto" }}>
                  <option value="">+ Adicionar diagnóstico do catálogo…</option>
                  {diagnosticosDaUnidade(idx, unidade).map(d => <option key={d.id} value={d.id}>{d.titulo}</option>)}
                </select>
              </div>

              {novoDx && (
                <div style={{ padding: 12, background: cor.sup2, border: `1px solid ${cor.borda}`, borderRadius: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 8 }}>{novoDx.titulo} {novoDx.codigo && <span style={{ color: cor.mut, fontWeight: 600 }}>· NANDA {novoDx.codigo}</span>}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                    <div><label style={lbl}>Tipo</label>
                      <select value={novoDx.subtipo} onChange={e => setNovoDx(d => ({ ...d, subtipo: e.target.value }))} style={inp}>
                        {SUBTIPOS_DX.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                      </select>
                    </div>
                    <div><label style={lbl}>Prioridade</label>
                      <select value={novoDx.prioridade} onChange={e => setNovoDx(d => ({ ...d, prioridade: e.target.value }))} style={inp}>
                        {PRIORIDADES.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
                      </select>
                    </div>
                  </div>
                  {novoDx._def.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <label style={lbl}>Características definidoras</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {novoDx._def.map(x => (
                          <button key={x} onClick={() => setNovoDx(d => ({ ...d, caracteristicas: toggle(d.caracteristicas, x) }))} style={{ ...btnG, padding: "4px 10px", fontSize: 11.5, background: novoDx.caracteristicas.includes(x) ? "#38bdf833" : "transparent", color: novoDx.caracteristicas.includes(x) ? "#38bdf8" : cor.txt3, borderColor: novoDx.caracteristicas.includes(x) ? "#38bdf8" : cor.borda }}>{x}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {novoDx._fat.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <label style={lbl}>{novoDx.subtipo === "risco" ? "Fatores de risco" : "Fatores relacionados"}</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {novoDx._fat.map(x => (
                          <button key={x} onClick={() => setNovoDx(d => ({ ...d, fatores: toggle(d.fatores, x) }))} style={{ ...btnG, padding: "4px 10px", fontSize: 11.5, background: novoDx.fatores.includes(x) ? "#fb923c33" : "transparent", color: novoDx.fatores.includes(x) ? "#fb923c" : cor.txt3, borderColor: novoDx.fatores.includes(x) ? "#fb923c" : cor.borda }}>{x}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  <label style={lbl}>Resultado esperado (NOC)</label>
                  <textarea value={novoDx.resultado_esperado} onChange={e => setNovoDx(d => ({ ...d, resultado_esperado: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical", marginBottom: 12 }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={salvarDx} disabled={busy} style={btnP(!busy)}>{busy ? "…" : "Registrar diagnóstico"}</button>
                    <button onClick={() => setNovoDx(null)} style={btnG}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          ) : <div style={{ ...cartao, fontSize: 12.5, color: cor.txt3 }}>Diagnóstico de enfermagem é privativo do enfermeiro. <SemCompetencia ato="diagnostico_enfermagem" user={currentUser} /></div>}

          {/* diagnósticos vigentes */}
          {dxVigentes.length === 0 ? (
            <div style={{ ...cartao, fontSize: 12.5, color: cor.txt3 }}>Nenhum diagnóstico registrado nesta internação.</div>
          ) : dxVigentes.map(d => (
            <div key={d.id} style={{ ...cartao, opacity: (d.status || "ativo") === "ativo" ? 1 : 0.6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Pill c={SUB_COR[d.subtipo] || cor.mut} texto={SUBTIPOS_DX.find(s => s.v === d.subtipo)?.l || d.subtipo || "—"} />
                <span style={{ fontSize: 13.5, fontWeight: 800 }}>{d.titulo}</span>
                {d.codigo && <span style={{ fontSize: 11, color: cor.mut }}>NANDA {d.codigo}</span>}
                {(d.status || "ativo") !== "ativo" && <Pill c={cor.mut} texto={d.status} />}
                {podeDx && (d.status || "ativo") === "ativo" && <button onClick={() => resolverDx(d)} style={{ ...btnG, marginLeft: "auto", padding: "4px 10px", fontSize: 11.5 }}>Resolver</button>}
              </div>
              {d.resultado_esperado && <div style={{ fontSize: 12, color: cor.txt3, marginTop: 6 }}><strong style={{ color: cor.mut }}>Resultado esperado:</strong> {d.resultado_esperado}</div>}
              {Array.isArray(d.fatores) && d.fatores.length > 0 && <div style={{ fontSize: 11.5, color: cor.mut, marginTop: 4 }}>{d.fatores.join(" · ")}</div>}
            </div>
          ))}
        </div>
      )}

      {/* ─── PRESCRIÇÃO ─── */}
      {etapa === "prescricao" && (
        <div>
          {podePresc ? (
            <div style={{ ...cartao, borderLeft: "4px solid #22d3ee" }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 8 }}>Cuidados a partir dos diagnósticos ativos</div>
              {itensSugeridos.length === 0 ? (
                <div style={{ fontSize: 12.5, color: cor.txt3 }}>Registre diagnósticos ativos para o sistema sugerir os cuidados (NIC).</div>
              ) : (
                <>
                  {itensSugeridos.map(it => (
                    <label key={it.catalogo_id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderTop: `1px solid ${cor.borda}`, cursor: "pointer" }}>
                      <input type="checkbox" checked={!excluidos.has(it.catalogo_id)} onChange={() => setExcluidos(s => { const n = new Set(s); n.has(it.catalogo_id) ? n.delete(it.catalogo_id) : n.add(it.catalogo_id); return n; })} style={{ marginTop: 3 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{it.descricao} {it.codigo_nic && <span style={{ color: cor.mut, fontWeight: 500 }}>· NIC {it.codigo_nic}</span>}</div>
                        {it.detalhe && <div style={{ fontSize: 11.5, color: cor.txt3, marginTop: 2 }}>{it.detalhe}</div>}
                        <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap", alignItems: "center" }}>
                          <Pill c="#818cf8" texto={it.frequencia || (it.se_necessario ? "SOS" : "—")} />
                          {it.horarios.map(h => <span key={h} style={{ fontSize: 10.5, color: cor.mut, border: `1px solid ${cor.borda}`, borderRadius: 5, padding: "1px 6px" }}>{h}</span>)}
                        </div>
                      </div>
                    </label>
                  ))}
                  <button onClick={assinarPresc} disabled={busy || !itensParaAssinar.length} style={{ ...btnP(!busy && itensParaAssinar.length > 0), marginTop: 12 }}>
                    {busy ? "…" : `Assinar prescrição (${itensParaAssinar.length})`}
                  </button>
                  {prescAtual && <span style={{ fontSize: 11, color: cor.mut, marginLeft: 10 }}>substitui a prescrição de {dataHora(prescAtual.criado_em)}</span>}
                </>
              )}
            </div>
          ) : <div style={{ ...cartao, fontSize: 12.5, color: cor.txt3 }}>Prescrição de enfermagem é privativa do enfermeiro. <SemCompetencia ato="prescricao_enfermagem" user={currentUser} /></div>}

          {prescAtual && (
            <div style={{ ...cartao }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 6 }}>Prescrição vigente · {dataHora(prescAtual.criado_em)} · {prescAtual.prescritor_nome || ""}</div>
              {itensAtuais.length === 0 ? <div style={{ fontSize: 12, color: cor.txt3 }}>Sem itens.</div> : itensAtuais.map(it => (
                <div key={it.id} style={{ padding: "7px 0", borderTop: `1px solid ${cor.borda}` }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{it.descricao}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap", alignItems: "center" }}>
                    <Pill c="#818cf8" texto={it.frequencia || (it.se_necessario ? "SOS" : "—")} />
                    {(it.horarios || []).map(h => <span key={h} style={{ fontSize: 10.5, color: cor.mut, border: `1px solid ${cor.borda}`, borderRadius: 5, padding: "1px 6px" }}>{h}</span>)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── CHECAGEM ─── */}
      {etapa === "checagem" && (
        <div>
          {!prescAtual || itensAtuais.length === 0 ? (
            <div style={{ ...cartao, fontSize: 12.5, color: cor.txt3 }}>Sem prescrição de enfermagem vigente para checar.</div>
          ) : itensAtuais.map(it => {
            const slots = it.se_necessario ? [] : checarCuidados(it, saeChecagem, { competencia: hoje, agora: hoje });
            const feitasSos = it.se_necessario ? saeChecagem.filter(c => c.item_id === it.id && (c.status || "realizado") === "realizado").length : 0;
            return (
              <div key={it.id} style={{ ...cartao }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{it.descricao}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: podeChecar ? 10 : 0 }}>
                  {it.se_necessario ? (
                    <Pill c="#818cf8" texto={`SOS · ${feitasSos} registro(s) hoje`} />
                  ) : slots.length === 0 ? (
                    <span style={{ fontSize: 11.5, color: cor.mut }}>Sem horário aprazado.</span>
                  ) : slots.map((s, i) => {
                    const c = s.administrado ? (s.administradoComAtraso ? "#fb923c" : "#34d399") : s.atrasado ? "#f43f5e" : cor.mut;
                    const txt = s.administrado ? `${hhmm(s.horario)} ✓` : s.atrasado ? `${hhmm(s.horario)} atrasado` : hhmm(s.horario);
                    return <Pill key={i} c={c} texto={txt} />;
                  })}
                </div>
                {podeChecar && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button onClick={() => checar(it, "realizado")} disabled={busy} style={{ ...btnP(!busy), padding: "6px 12px" }}>Checar realizado</button>
                    <input value={motivo[it.id] || ""} onChange={e => setMotivo(m => ({ ...m, [it.id]: e.target.value }))} placeholder="motivo (não realizado)" style={{ ...inp, maxWidth: 220, width: "auto" }} />
                    <button onClick={() => checar(it, "nao_realizado")} disabled={busy} style={{ ...btnG, padding: "6px 12px", color: "#f43f5e", borderColor: "#f43f5e66" }}>Não realizado</button>
                  </div>
                )}
              </div>
            );
          })}
          {!podeChecar && prescAtual && <div style={{ fontSize: 11, color: cor.mut }}><SemCompetencia ato="checar_cuidado_enfermagem" user={currentUser} /> para registrar a checagem.</div>}
        </div>
      )}

      {/* ─── EVOLUÇÃO ─── */}
      {etapa === "evolucao" && (
        <div>
          {podeEvo ? (
            <div style={{ ...cartao }}>
              <label style={lbl}>Evolução de enfermagem</label>
              <textarea value={evo} onChange={e => setEvo(e.target.value)} rows={4} placeholder="Evolução do turno, resposta aos cuidados, reavaliação dos diagnósticos…" style={{ ...inp, resize: "vertical", marginBottom: 10 }} />
              <button onClick={salvarEvolucao} disabled={busy || !evo.trim()} style={btnP(!busy && !!evo.trim())}>{busy ? "…" : "Registrar evolução"}</button>
            </div>
          ) : <div style={{ ...cartao, fontSize: 12.5, color: cor.txt3 }}>Evolução de enfermagem é privativa do enfermeiro. <SemCompetencia ato="evolucao_enfermagem" user={currentUser} /></div>}

          {evolucoesEnf.length === 0 ? (
            <div style={{ fontSize: 12.5, color: cor.txt3 }}>Nenhuma evolução de enfermagem registrada.</div>
          ) : evolucoesEnf.slice(0, 10).map(e => (
            <div key={e.id} style={{ ...cartao }}>
              <div style={{ fontSize: 10.5, color: cor.mut, marginBottom: 4 }}>{dataHora(e.criado_em)} · {e.usuario || ""}</div>
              <div style={{ fontSize: 12.5, color: cor.txt, whiteSpace: "pre-wrap" }}>{e.texto}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
