// ═══════════════════════════════════════════════════════════
// PROTOCOLOS CLÍNICOS — A TELA
//
// Linhas de cuidado tempo-dependentes, por setor assistencial: o gatilho
// acende a partir do NEWS, o bundle roda com relógio, e os KPIs medem
// porta→ação. Saiu do App.jsx.
//
// Toda a decisão clínica já morava fora, em ../clinico/protocolos.js —
// gatilho de sepse, de dor torácica e de AVC, janela terapêutica, escore
// de Padua, recomendação de TEV. Aqui é tela e persistência.
//
// ⚠️ O `sb` chega por prop. Nulo = sem banco.
// ═══════════════════════════════════════════════════════════

import { registrarAuditoria } from "../auditoria/dados.js";
import { PROTOCOLOS_CATALOGO, PROT_DESFECHO } from "../clinico/protocolos-catalogo.js";
import { avaliarGatilhoAvc, avaliarGatilhoDorToracica, avaliarGatilhoSepse, escorePadua, estadoAtivacao, indicadoresProtocolo, janelaTerapeutica, montarBundle, recomendacaoTev } from "../clinico/protocolos.js";
import { loadSetoresFromSupabase } from "../leitos/dados.js";
import { Icon, VX } from "../ui/base.jsx";
import { checarPassoProt, encerrarAtivacaoProt, loadProtAtivacoes, loadProtCatalogo, loadProtItens, loadProtSetores, patchCatalogoProt, registrarAtivacaoProt, upsertProtSetorRemote } from "./dados.js";
import { useEffect, useState } from "react";
import PrimeiroUso from "../ui/PrimeiroUso.jsx";
import { useChecagens } from "../ui/usar-checagens.js";

// O cadastro que sustenta este painel. Enquanto ele estiver vazio, os
// números abaixo são zero por falta de configuração — não por falta de
// movimento, que é como um painel zerado se lê. Ver `ui/primeiro-uso.js`.
const BASE_PROTOCOLOS = [
  { o: "protocolos", tabela: "prot_catalogo", onde: "Protocolos → Catálogo & setores" },
  { o: "setores", tabela: "setores", onde: "Giro de Leitos → Mapa de leitos" },
];

const PROT_NAV = [
  { key: "visao",       label: "Visão geral",        icon: "shield" },
  { key: "painel",      label: "Painel do setor",    icon: "activity" },
  { key: "indicadores", label: "Indicadores",        icon: "chart" },
  { key: "catalogo",    label: "Catálogo & setores", icon: "clipboard" },
];

const PROT_FAROL = { verde: "#34d399", amarelo: "#f5b301", vermelho: "#f43f5e" };

export default function ProtocolosPage({ sb, currentUser, canEdit }) {
  const [sub, setSub] = useState("visao");
  const [setoresNomes, setSetoresNomes] = useState([]);
  const [setorSel, setSetorSel] = useState("");
  const [catalogo, setCatalogo] = useState([]);
  const [setores, setSetores] = useState([]);
  const [ativacoes, setAtivacoes] = useState([]);
  const [itens, setItens] = useState([]);
  const [ativSel, setAtivSel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [agora, setAgora] = useState(Date.now());
  const [gForm, setGForm] = useState({ paciente: "", prontuario: "", leito: "", queixa: "", inicio: "", fr: "", fc: "", pa_sist: "", spo2: "", temp: "", consciencia: "A" });
  const [passoVal, setPassoVal] = useState({});
  const [abrirAcionar, setAbrirAcionar] = useState(false);
  const [protSel, setProtSel] = useState("sepse");
  const [tevForm, setTevForm] = useState({ marcadas: [], sangramentoAlto: false });
  const isMaster = currentUser?.role === "adm_master";

  function recarregar() {
    loadProtCatalogo(sb).then(setCatalogo);
    loadProtSetores(sb).then(setSetores);
    loadProtAtivacoes(sb).then(setAtivacoes);
    loadProtItens(sb).then(setItens);
  }
  useEffect(() => {
    if (!sb) return;
    recarregar();
    loadSetoresFromSupabase(sb).then(rows => { if (rows) setSetoresNomes(rows.map(r => r.nome).filter(Boolean)); });
  }, []);
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 30000); return () => clearInterval(t); }, []);

  const navAtual = PROT_NAV.find(n => n.key === sub) || PROT_NAV[0];
  const templateDe = chave => catalogo.find(c => c.chave === chave) || PROTOCOLOS_CATALOGO.find(c => c.chave === chave) || null;
  const instanciaDe = (setor, protocolo) => setores.find(s => s.setor === setor && s.protocolo === protocolo) || null;
  const bundleDe = (protocolo, setor) => montarBundle(templateDe(protocolo), instanciaDe(setor, protocolo));
  const itensMap = {}; for (const a of ativacoes) itensMap[a.id] = itens.filter(i => i.ativacao_id === a.id);
  const filtroSetor = a => !setorSel || a.setor === setorSel;
  const ativas = ativacoes.filter(a => (a.status || "ativa") === "ativa" && filtroSetor(a));
  const acionaveis = PROTOCOLOS_CATALOGO.filter(c => (c.passos || []).length);
  const kpiPassoDe = chave => PROTOCOLOS_CATALOGO.find(c => c.chave === chave)?.kpi_passo || "atb";
  const tplSel = templateDe(protSel);
  const instSel = setorSel ? instanciaDe(setorSel, protSel) : null;
  const kpiPasso = kpiPassoDe(protSel);
  const gatilhoSepse = avaliarGatilhoSepse({ fr: +gForm.fr || undefined, fc: +gForm.fc || undefined, pa_sist: +gForm.pa_sist || undefined, spo2: +gForm.spo2 || undefined, temp: +gForm.temp || undefined, consciencia: gForm.consciencia }, {}, templateDe("sepse") || undefined);
  const gatilhoQueixa = protSel === "avc" ? avaliarGatilhoAvc(gForm.queixa) : avaliarGatilhoDorToracica(gForm.queixa);
  const janela = protSel === "avc" ? janelaTerapeutica(gForm.inicio || null, agora) : null;
  const ind = indicadoresProtocolo(ativacoes.filter(a => filtroSetor(a) && a.protocolo === protSel), itensMap, { janela_min: (instSel?.janela_min ?? tplSel?.janela_min ?? 60), passoAlvo: kpiPasso });
  // TEV é AVALIAÇÃO (escore de Padua), não bundle agudo.
  const isAvaliacao = (PROTOCOLOS_CATALOGO.find(c => c.chave === protSel)?.tipo) === "avaliacao";
  const paduaFatores = PROTOCOLOS_CATALOGO.find(c => c.chave === "tev")?.passos || [];
  const padua = escorePadua(tevForm.marcadas, paduaFatores);
  const recTev = recomendacaoTev({ alto: padua.alto, sangramentoAlto: tevForm.sangramentoAlto });
  const avaliacoesTev = ativacoes.filter(a => a.protocolo === "tev" && filtroSetor(a));

  async function acionar() {
    if (busy || !canEdit) return;
    const ref = protSel === "sepse"
      ? { news: gatilhoSepse.score, fr: +gForm.fr || null, fc: +gForm.fc || null, pa_sist: +gForm.pa_sist || null, spo2: +gForm.spo2 || null, temp: +gForm.temp || null, consciencia: gForm.consciencia }
      : { queixa: gForm.queixa || null, sugere: gatilhoQueixa.sugere, termo: gatilhoQueixa.termo, ...(protSel === "avc" ? { inicio_sintomas: gForm.inicio ? new Date(gForm.inicio).toISOString() : null } : {}) };
    setBusy(true);
    await registrarAtivacaoProt(sb, { protocolo: protSel, setor: setorSel || null, prontuario: gForm.prontuario, paciente_nome: gForm.paciente, leito: gForm.leito, gatilho_ref: ref }, currentUser);
    registrarAuditoria(sb, currentUser, "protocolo: acionar", `${protSel.toUpperCase()} · ${gForm.paciente || gForm.prontuario || "—"}${setorSel ? " · " + setorSel : ""}`, { leito: gForm.leito || null });
    setBusy(false); setGForm({ paciente: "", prontuario: "", leito: "", queixa: "", inicio: "", fr: "", fc: "", pa_sist: "", spo2: "", temp: "", consciencia: "A" }); setAbrirAcionar(false); recarregar();
  }
  async function marcarPasso(a, passo, naoAplica) {
    if (busy || !canEdit) return;
    const k = a.id + passo.chave;
    setBusy(true);
    await checarPassoProt(sb, { ativacao_id: a.id, passo: passo.chave, rotulo: passo.rotulo, valor: passoVal[k] || null, nao_aplica: !!naoAplica }, currentUser);
    setBusy(false); setPassoVal(v => ({ ...v, [k]: "" })); recarregar();
  }
  async function encerrar(a, desfecho) {
    if (busy || !canEdit) return;
    setBusy(true); await encerrarAtivacaoProt(sb, a, desfecho, null, currentUser);
    registrarAuditoria(sb, currentUser, "protocolo: encerrar", `${(a.protocolo || "").toUpperCase()} · ${a.paciente_nome || a.prontuario || "—"} → ${desfecho}`, {});
    setBusy(false); setAtivSel(null); recarregar();
  }
  async function salvarInstancia(setor, patch) {
    if (busy || !canEdit) return;
    const cur = instanciaDe(setor, protSel) || {};
    setBusy(true);
    await upsertProtSetorRemote(sb, { setor, protocolo: protSel, ativo: cur.ativo !== false, janela_min: cur.janela_min ?? null, responsavel: cur.responsavel || null, validado: cur.validado, ...patch }, currentUser);
    registrarAuditoria(sb, currentUser, "protocolo: configurar setor", `${protSel.toUpperCase()} · ${setor}${patch.ativo !== undefined ? (patch.ativo ? " · ligado" : " · desligado") : ""}`, patch);
    setBusy(false); recarregar();
  }
  async function registrarAvaliacaoTev() {
    if (busy || !canEdit) return;
    setBusy(true);
    await registrarAtivacaoProt(sb, {
      protocolo: "tev", setor: setorSel || null, prontuario: gForm.prontuario, paciente_nome: gForm.paciente, leito: gForm.leito,
      gatilho_ref: { padua: tevForm.marcadas, score: padua.score, alto: padua.alto, sangramento_alto: tevForm.sangramentoAlto, recomendacao: recTev.chave, rec_label: recTev.label },
      status: "concluida", desfecho: recTev.chave, encerrado_em: new Date().toISOString(),
    }, currentUser);
    registrarAuditoria(sb, currentUser, "protocolo: avaliação TEV", `${gForm.paciente || gForm.prontuario || "—"} · Padua ${padua.score} → ${recTev.label}`, {});
    setBusy(false); setGForm(f => ({ ...f, paciente: "", prontuario: "", leito: "" })); setTevForm({ marcadas: [], sangramentoAlto: false }); setAbrirAcionar(false); recarregar();
  }
  const toggleFator = ch => setTevForm(f => ({ ...f, marcadas: f.marcadas.includes(ch) ? f.marcadas.filter(x => x !== ch) : [...f.marcadas, ch] }));

  const card = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", marginBottom: 14 };
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  const lbl = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 4, display: "block" };
  const btnP = (on = true) => ({ background: on ? VX.turquesa : "#5b76a0", color: "#04222b", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 800, fontSize: 13, cursor: on ? "pointer" : "default" });
  const btnG = { background: "transparent", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px", fontWeight: 600, fontSize: 12.5, cursor: "pointer" };
  const Pill = ({ c, t }) => <span style={{ background: `${c}1f`, color: c, border: `1px solid ${c}66`, borderRadius: 999, padding: "1px 9px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{t}</span>;
  const fmtDur = m => m == null ? "—" : (m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m}min`);
  const dataHora = d => d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
  const corPasso = s => s === "feito_no_alvo" ? PROT_FAROL.verde : s === "feito_fora" ? "#fb923c" : s === "estourado" ? PROT_FAROL.vermelho : s === "nao_aplica" ? "var(--text-muted)" : "var(--text-3)";
  const chipTgl = (on, c) => ({ background: on ? `${c}33` : "transparent", color: on ? c : "var(--text-3)", border: `1px solid ${on ? c : "var(--border)"}`, borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" });
  const janelaAvc = a => {
    if (a.protocolo !== "avc" || !a.gatilho_ref?.inicio_sintomas) return null;
    const j = janelaTerapeutica(a.gatilho_ref.inicio_sintomas, agora);
    if (!j.conhecido) return null;
    const hm = `${Math.floor(j.decorrido_min / 60)}h${String(j.decorrido_min % 60).padStart(2, "0")}`;
    return <Pill c={PROT_FAROL[j.farol] || "var(--text-muted)"} t={`janela ${hm}${j.dentroTrombolise ? " · trombólise" : " · fora"}`} />;
  };

  const setorSelect = (
    <select value={setorSel} onChange={e => { setSetorSel(e.target.value); setAtivSel(null); }} style={{ ...inp, width: "auto", minWidth: 200 }}>
      <option value="">Todos os setores</option>
      {setoresNomes.map(n => <option key={n} value={n}>{n}</option>)}
    </select>
  );
  const protChips = (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {acionaveis.map(c => <button key={c.chave} onClick={() => { setProtSel(c.chave); setAbrirAcionar(false); }} style={chipTgl(protSel === c.chave, VX.turquesa)} title={c.titulo}>{c.chave.toUpperCase()}</button>)}
    </div>
  );

  const CardKpi = ({ label, valor, cor, sub: subt }) => (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${cor || "var(--border)"}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: cor || "var(--text)", fontFamily: "JetBrains Mono, monospace", marginTop: 3 }}>{valor}</div>
      {subt && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{subt}</div>}
    </div>
  );

  const Checklist = ({ a }) => {
    const bundle = bundleDe(a.protocolo, a.setor);
    const est = estadoAtivacao(a, itensMap[a.id], bundle, agora);
    return (
      <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        {est.passos.map(p => {
          const k = a.id + p.chave;
          return (
            <div key={p.chave} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ width: 10, height: 10, borderRadius: 999, background: corPasso(p.situacao), flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: p.feito ? "var(--text-muted)" : "var(--text)", textDecoration: p.feito ? "line-through" : "none" }}>{p.rotulo} {p.critico && <Pill c="#f43f5e" t="crítico" />}</div>
                <div style={{ fontSize: 11, color: corPasso(p.situacao) }}>{p.situacao === "nao_aplica" ? "não se aplica" : p.feito ? `✓ ${fmtDur(p.decorrido_min)}${p.valor ? " · " + p.valor : ""}` : `${fmtDur(p.decorrido_min)} / alvo ${p.alvo_min}min${p.situacao === "estourado" ? " · ESTOUROU" : ""}`}</div>
              </div>
              {!p.feito && p.situacao !== "nao_aplica" && canEdit && (a.status || "ativa") === "ativa" && (<>
                {(p.chave === "lactato" || p.chave === "atb") && <input value={passoVal[k] || ""} onChange={e => setPassoVal(v => ({ ...v, [k]: e.target.value }))} placeholder={p.chave === "lactato" ? "lactato" : "ATB"} style={{ ...inp, width: 90 }} />}
                <button onClick={() => marcarPasso(a, p)} disabled={busy} style={btnP(!busy)}>Feito</button>
                <button onClick={() => marcarPasso(a, p, true)} disabled={busy} style={btnG}>N/A</button>
              </>)}
            </div>
          );
        })}
        {(a.status || "ativa") === "ativa" && canEdit && (
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Encerrar:</span>
            {PROT_DESFECHO.map(d => <button key={d.v} onClick={() => encerrar(a, d.v)} disabled={busy} style={btnG}>{d.label}</button>)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <nav style={{ width: 210, minWidth: 210, background: "var(--bg-2)", borderRight: "1px solid var(--border)", padding: "1rem 0", overflowY: "auto", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px 12px" }}>
          <Icon name="activity" size={16} /><span style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".02em", color: VX.turquesa }}>PROTOCOLOS CLÍNICOS</span>
        </div>
        {PROT_NAV.map(it => { const active = sub === it.key; return (
          <button key={it.key} onClick={() => setSub(it.key)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: ".5rem 16px", border: "none", borderLeft: `3px solid ${active ? VX.turquesa : "transparent"}`, background: active ? "var(--surface)" : "transparent", color: active ? VX.turquesa : "var(--text-3)", cursor: "pointer", textAlign: "left", fontSize: 12.5, fontWeight: active ? 700 : 500, fontFamily: "Inter, sans-serif" }}>
            <Icon name={it.icon} size={15} />{it.label}
          </button>
        ); })}
      </nav>

      <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem 1.5rem", minWidth: 0 }}>
        <PrimeiroUso checagens={useChecagens(sb, BASE_PROTOCOLOS)} />
        <div style={{ marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{navAtual.label}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Protocolos gerenciados tempo-dependentes · por setor assistencial</div>
          </div>
          {sub !== "visao" && setorSelect}
        </div>

        {!sb && <div style={card}>Conecte o banco para usar os protocolos.</div>}

        {sub === "visao" && (<>
          <div style={card}>
            <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 6 }}>Protocolos clínicos gerenciados</div>
            <div style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.6 }}>
              Linhas de cuidado onde <strong>tempo é tecido</strong>: sepse, IAM, AVC e TEV. Cada protocolo <strong>acende sozinho</strong> a partir do que já existe (NEWS, discriminadores da triagem), abre um <strong>bundle com relógio</strong> (cada passo com alvo em minutos) e entrega os <strong>indicadores porta→ação</strong> sem digitação. Cada <strong>setor assistencial</strong> tem a sua instância — liga e ajusta o que é dele.
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
            <CardKpi label="Ativos agora" valor={ativacoes.filter(a => (a.status || "ativa") === "ativa").length} cor={VX.turquesa} sub="acionamentos em curso" />
            <CardKpi label="Protocolos prontos" valor={acionaveis.length} cor={PROT_FAROL.verde} sub={acionaveis.map(c => c.chave.toUpperCase()).join(" · ")} />
            <CardKpi label="Instâncias ligadas" valor={setores.filter(s => s.ativo !== false).length} cor="#38bdf8" sub="protocolo × setor" />
          </div>
          <div style={{ ...card, marginTop: 14, fontSize: 12, color: "var(--text-muted)" }}>
            <strong>Fase 3 completa:</strong> Sepse (porta→ATB), Dor torácica/IAM (porta→ECG), AVC (porta→TC + janela terapêutica) e TEV (profilaxia — escore de Padua).
          </div>
        </>)}

        {sub === "painel" && (<>
          <div style={{ marginBottom: 12 }}>{protChips}</div>

          {isAvaliacao && (<>
            <div style={card}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800 }}>Avaliar TEV — escore de Padua</div>
                <Pill c={padua.alto ? PROT_FAROL.vermelho : PROT_FAROL.verde} t={`Padua ${padua.score} · ${padua.alto ? "alto risco" : "baixo risco"}`} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 12 }}>
                <div><span style={lbl}>Paciente (iniciais)</span><input value={gForm.paciente} onChange={e => setGForm(f => ({ ...f, paciente: e.target.value }))} style={inp} /></div>
                <div><span style={lbl}>Prontuário</span><input value={gForm.prontuario} onChange={e => setGForm(f => ({ ...f, prontuario: e.target.value }))} style={inp} /></div>
                <div><span style={lbl}>Leito</span><input value={gForm.leito} onChange={e => setGForm(f => ({ ...f, leito: e.target.value }))} style={inp} /></div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>Fatores de risco (Padua) — marque os presentes</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 4, marginBottom: 12 }}>
                {paduaFatores.map(f => { const on = tevForm.marcadas.includes(f.chave); return (
                  <label key={f.chave} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, padding: "4px 6px", borderRadius: 6, cursor: "pointer", background: on ? `${VX.turquesa}14` : "transparent" }}>
                    <input type="checkbox" checked={on} onChange={() => toggleFator(f.chave)} />
                    <span style={{ flex: 1 }}>{f.rotulo}</span>
                    <span style={{ color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>+{f.pontos}</span>
                  </label>
                ); })}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, marginBottom: 12, fontWeight: 600 }}>
                <input type="checkbox" checked={tevForm.sangramentoAlto} onChange={e => setTevForm(f => ({ ...f, sangramentoAlto: e.target.checked }))} />
                Alto risco de sangramento (contraindica a profilaxia farmacológica)
              </label>
              <div style={{ ...card, background: "var(--bg-2)", marginBottom: 12, borderLeft: `4px solid ${recTev.chave === "farmacologica" ? PROT_FAROL.verde : recTev.chave === "mecanica" ? "#fb923c" : "var(--text-muted)"}` }}>
                <div style={{ fontSize: 13, fontWeight: 800 }}>Recomendação: {recTev.label}</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>{recTev.detalhe}</div>
              </div>
              <button onClick={registrarAvaliacaoTev} disabled={busy || !canEdit} style={btnP(!busy && canEdit)}>Registrar avaliação{setorSel ? ` · ${setorSel}` : ""}</button>
            </div>

            <div style={{ fontSize: 13, fontWeight: 800, margin: "4px 2px 10px" }}>Avaliações {setorSel && `· ${setorSel}`} <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>({avaliacoesTev.length})</span></div>
            {!avaliacoesTev.length && <div style={{ ...card, color: "var(--text-muted)", fontSize: 12.5 }}>Nenhuma avaliação de TEV {setorSel ? "neste setor" : ""} ainda.</div>}
            {avaliacoesTev.slice(0, 20).map(a => { const g = a.gatilho_ref || {}; const rec = g.recomendacao; const cor = rec === "farmacologica" ? PROT_FAROL.verde : rec === "mecanica" ? "#fb923c" : "var(--text-muted)"; return (
              <div key={a.id} style={{ ...card, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderLeft: `4px solid ${cor}`, marginBottom: 8 }}>
                <Pill c={g.alto ? PROT_FAROL.vermelho : PROT_FAROL.verde} t={`Padua ${g.score ?? "—"}`} />
                <div style={{ fontSize: 13, fontWeight: 700 }}>{a.paciente_nome || a.prontuario || "Paciente"}</div>
                {a.leito && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>leito {a.leito}</span>}
                <span style={{ fontSize: 12, color: cor, fontWeight: 600 }}>{g.rec_label || rec || "—"}</span>
                <span style={{ fontSize: 11.5, color: "var(--text-muted)", marginLeft: "auto" }}>{dataHora(a.acionado_em)}</span>
              </div>
            ); })}
          </>)}

          {!isAvaliacao && (<>
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: abrirAcionar ? 12 : 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800 }}>Acionar {protSel.toUpperCase()}</div>
              {canEdit && <button onClick={() => setAbrirAcionar(v => !v)} style={{ ...btnG, marginLeft: "auto" }}>{abrirAcionar ? "Fechar" : "＋ Acionar"}</button>}
            </div>
            {abrirAcionar && (<>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 10 }}>
                <div><span style={lbl}>Paciente (iniciais)</span><input value={gForm.paciente} onChange={e => setGForm(f => ({ ...f, paciente: e.target.value }))} style={inp} /></div>
                <div><span style={lbl}>Prontuário</span><input value={gForm.prontuario} onChange={e => setGForm(f => ({ ...f, prontuario: e.target.value }))} style={inp} /></div>
                <div><span style={lbl}>Leito</span><input value={gForm.leito} onChange={e => setGForm(f => ({ ...f, leito: e.target.value }))} style={inp} /></div>
              </div>
              {protSel === "sepse" ? (<>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>Sinais vitais (gatilho NEWS — opcional, apoia a decisão)</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(88px,1fr))", gap: 8, marginBottom: 10 }}>
                  <div><span style={lbl}>FR</span><input value={gForm.fr} onChange={e => setGForm(f => ({ ...f, fr: e.target.value }))} style={inp} /></div>
                  <div><span style={lbl}>FC</span><input value={gForm.fc} onChange={e => setGForm(f => ({ ...f, fc: e.target.value }))} style={inp} /></div>
                  <div><span style={lbl}>PA sist.</span><input value={gForm.pa_sist} onChange={e => setGForm(f => ({ ...f, pa_sist: e.target.value }))} style={inp} /></div>
                  <div><span style={lbl}>SpO₂</span><input value={gForm.spo2} onChange={e => setGForm(f => ({ ...f, spo2: e.target.value }))} style={inp} /></div>
                  <div><span style={lbl}>Temp</span><input value={gForm.temp} onChange={e => setGForm(f => ({ ...f, temp: e.target.value }))} style={inp} /></div>
                  <div><span style={lbl}>Consc.</span><select value={gForm.consciencia} onChange={e => setGForm(f => ({ ...f, consciencia: e.target.value }))} style={inp}><option value="A">Alerta</option><option value="V">Voz</option><option value="D">Dor</option><option value="I">Inconsciente</option></select></div>
                </div>
              </>) : (
                <div style={{ display: "grid", gridTemplateColumns: protSel === "avc" ? "1fr 1fr" : "1fr", gap: 10, marginBottom: 10 }}>
                  <div>
                    <span style={lbl}>Queixa (a sugestão do gatilho lê daqui)</span>
                    <input value={gForm.queixa} onChange={e => setGForm(f => ({ ...f, queixa: e.target.value }))} placeholder={protSel === "avc" ? "ex.: fraqueza no braço e boca torta" : "ex.: dor torácica há 1h, opressiva"} style={inp} />
                  </div>
                  {protSel === "avc" && (
                    <div>
                      <span style={lbl}>Início dos sintomas (último visto bem)</span>
                      <input type="datetime-local" value={gForm.inicio} onChange={e => setGForm(f => ({ ...f, inicio: e.target.value }))} style={inp} />
                    </div>
                  )}
                </div>
              )}
              {protSel === "avc" && janela?.conhecido && (
                <div style={{ fontSize: 12, color: PROT_FAROL[janela.farol] || "var(--text-3)", marginBottom: 10, fontWeight: 700 }}>⏳ Janela terapêutica: {janela.texto}</div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {protSel === "sepse"
                  ? <Pill c={gatilhoSepse.aciona ? PROT_FAROL.vermelho : gatilhoSepse.score == null ? "var(--text-muted)" : PROT_FAROL.verde} t={gatilhoSepse.score == null ? "NEWS —" : `NEWS ${gatilhoSepse.score}`} />
                  : <Pill c={gatilhoQueixa.sugere ? PROT_FAROL.vermelho : "var(--text-muted)"} t={gatilhoQueixa.sugere ? `sugere ${protSel.toUpperCase()}` : "sem sugestão"} />}
                <span style={{ fontSize: 12, color: "var(--text-3)" }}>{protSel === "sepse" ? gatilhoSepse.motivo : gatilhoQueixa.motivo}</span>
                <button onClick={acionar} disabled={busy || !canEdit} style={{ ...btnP(!busy && canEdit), marginLeft: "auto" }}>Acionar {protSel.toUpperCase()}{setorSel ? ` · ${setorSel}` : ""}</button>
              </div>
            </>)}
          </div>

          <div style={{ fontSize: 13, fontWeight: 800, margin: "4px 2px 10px" }}>Acionamentos ativos {setorSel && `· ${setorSel}`} <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>({ativas.length})</span></div>
          {!ativas.length && <div style={{ ...card, color: "var(--text-muted)", fontSize: 12.5 }}>Nenhum protocolo ativo {setorSel ? "neste setor" : "no momento"}. Acione um acima quando o gatilho acender.</div>}
          {ativas.map(a => {
            const est = estadoAtivacao(a, itensMap[a.id], bundleDe(a.protocolo, a.setor), agora);
            const aberta = ativSel === a.id;
            return (
              <div key={a.id} style={{ ...card, borderLeft: `4px solid ${PROT_FAROL[est.farol]}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <Pill c={PROT_FAROL[est.farol]} t={(a.protocolo || "").toUpperCase()} />
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{a.paciente_nome || a.prontuario || "Paciente"}</div>
                  {a.leito && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>leito {a.leito}</span>}
                  {a.setor && <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>· {a.setor}</span>}
                  <span style={{ fontSize: 11.5, color: "var(--text-muted)", marginLeft: "auto" }}>acionado {dataHora(a.acionado_em)}</span>
                </div>
                <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: "var(--text-3)" }}>⏱ {fmtDur(est.decorrido_total)} decorrido{est.janela_min ? ` · janela ${est.janela_min}min` : ""}</span>
                  <span style={{ fontSize: 12, color: "var(--text-3)" }}>{est.completos}/{est.total} passos · {est.pct}%</span>
                  {est.criticos_pendentes > 0 && <Pill c={PROT_FAROL.vermelho} t={`${est.criticos_pendentes} crítico(s) pendente(s)`} />}
                  {est.dentro_janela && <Pill c={PROT_FAROL.verde} t="bundle no alvo" />}
                  {janelaAvc(a)}
                  <button onClick={() => setAtivSel(aberta ? null : a.id)} style={{ ...btnG, marginLeft: "auto" }}>{aberta ? "Fechar" : "Conduzir"}</button>
                </div>
                {aberta && <Checklist a={a} />}
              </div>
            );
          })}
          </>)}
        </>)}

        {sub === "indicadores" && (<>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>{protChips}<span style={{ fontSize: 12, color: "var(--text-muted)" }}>{isAvaliacao ? `Avaliações de TEV (escore de Padua)${setorSel ? ` · ${setorSel}` : " · todos os setores"}.` : `porta→${kpiPasso.toUpperCase()} do ${tplSel?.titulo || protSel.toUpperCase()}${setorSel ? ` · ${setorSel}` : " · todos os setores"}, dos carimbos de tempo (sem digitação).`}</span></div>
          {isAvaliacao ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
              <CardKpi label="Avaliações" valor={avaliacoesTev.length} cor={VX.turquesa} sub="internados avaliados" />
              <CardKpi label="Alto risco" valor={avaliacoesTev.filter(a => a.gatilho_ref?.alto).length} cor={PROT_FAROL.vermelho} sub={`${avaliacoesTev.length ? Math.round(avaliacoesTev.filter(a => a.gatilho_ref?.alto).length / avaliacoesTev.length * 100) : 0}% (Padua ≥ 4)`} />
              <CardKpi label="Prof. farmacológica" valor={avaliacoesTev.filter(a => a.gatilho_ref?.recomendacao === "farmacologica").length} cor={PROT_FAROL.verde} sub="recomendada" />
              <CardKpi label="Prof. mecânica" valor={avaliacoesTev.filter(a => a.gatilho_ref?.recomendacao === "mecanica").length} cor="#fb923c" sub="risco de sangramento" />
            </div>
          ) : (<>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
              <CardKpi label="Acionamentos" valor={ind.total} cor={VX.turquesa} sub={`${ind.ativas} ativo(s) · ${ind.concluidas} concluído(s)`} />
              <CardKpi label={`Porta → ${kpiPasso.toUpperCase()} (mediana)`} valor={ind.tempoMedianoAlvo == null ? "—" : fmtDur(ind.tempoMedianoAlvo)} cor={ind.tempoMedianoAlvo != null && ind.tempoMedianoAlvo <= (ind.janela_min || 60) ? PROT_FAROL.verde : PROT_FAROL.vermelho} sub={`alvo ≤ ${ind.janela_min}min`} />
              <CardKpi label={`${kpiPasso.toUpperCase()} no alvo`} valor={ind.pctAlvoNoPrazo == null ? "—" : ind.pctAlvoNoPrazo + "%"} cor={ind.pctAlvoNoPrazo == null ? "var(--text-muted)" : ind.pctAlvoNoPrazo >= 80 ? PROT_FAROL.verde : ind.pctAlvoNoPrazo >= 50 ? PROT_FAROL.amarelo : PROT_FAROL.vermelho} sub="% dentro do alvo" />
              <CardKpi label="Confirmados" valor={ind.confirmados} cor="#38bdf8" sub="desfecho confirmado" />
            </div>
            <div style={{ ...card, marginTop: 14, fontSize: 12, color: "var(--text-muted)" }}>Porta→{kpiPasso.toUpperCase()} é o tempo do acionamento até o passo "{kpiPasso}". O relógio corre de <code>acionado_em</code>.</div>
          </>)}
        </>)}

        {sub === "catalogo" && (<>
          <div style={{ marginBottom: 12 }}>{protChips}</div>
          {(() => {
            const t = tplSel;
            const gat = t?.gatilho?.tipo === "news" ? `NEWS ≥ ${t.gatilho.min ?? 5}` : t?.gatilho?.tipo === "queixa" ? "sugestão pela queixa da triagem" : (t?.gatilho?.obs || "—");
            return (
              <div style={card}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800 }}>{t?.titulo || protSel.toUpperCase()}</div>
                  <Pill c={t?.status === "vigente" ? PROT_FAROL.verde : PROT_FAROL.amarelo} t={t?.status === "vigente" ? "vigente" : "em validação"} />
                  {isMaster && t?.id && t.status !== "vigente" && <button onClick={() => patchCatalogoProt(sb, t, { status: "vigente", validado: true }, currentUser).then(recarregar)} style={{ ...btnP(), marginLeft: "auto" }}>Validar template</button>}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>{t?.referencia} · gatilho: {gat} · janela {t?.janela_min ?? "—"}min</div>
                {(t?.passos || []).map(p => (
                  <div key={p.chave} style={{ display: "flex", gap: 10, alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 12.5 }}>
                    <span style={{ color: "var(--text-muted)", width: 20 }}>{p.ordem ?? "•"}</span>
                    <span style={{ flex: 1 }}>{p.rotulo} {p.critico && <Pill c="#f43f5e" t="crítico" />}</span>
                    <span style={{ color: "var(--text-3)", fontFamily: "JetBrains Mono, monospace" }}>{p.alvo_min != null ? `alvo ${p.alvo_min}min` : p.pontos != null ? `+${p.pontos}` : ""}</span>
                  </div>
                ))}
                {!(t?.passos || []).length && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Template ainda sem passos — entra numa fase futura.</div>}
              </div>
            );
          })()}
          <div style={{ fontSize: 13, fontWeight: 800, margin: "6px 2px 10px" }}>Instância por setor <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>— cada setor liga e ajusta o seu {protSel.toUpperCase()}</span></div>
          {!setoresNomes.length && <div style={{ ...card, color: "var(--text-muted)", fontSize: 12.5 }}>Cadastre setores em Giro de Leitos → aba Mapa de leitos → botão Setores (à direita da barra de cadastro) para ligar o protocolo por setor.</div>}
          {setoresNomes.map(nome => {
            const inst = instanciaDe(nome, protSel);
            const ligado = inst ? inst.ativo !== false : false;
            return (
              <div key={protSel + nome} style={{ ...card, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, minWidth: 120 }}>{nome}</div>
                <button disabled={!canEdit || busy} onClick={() => salvarInstancia(nome, { ativo: !ligado })} style={{ background: ligado ? `${PROT_FAROL.verde}22` : "transparent", color: ligado ? PROT_FAROL.verde : "var(--text-3)", border: `1px solid ${ligado ? PROT_FAROL.verde : "var(--border)"}`, borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: canEdit ? "pointer" : "default" }}>{ligado ? "Ligado" : "Desligado"}</button>
                {ligado && (<>
                  <div><span style={lbl}>Janela (min)</span><input defaultValue={inst?.janela_min ?? ""} onBlur={e => { const v = e.target.value === "" ? null : +e.target.value; if (v !== (inst?.janela_min ?? null)) salvarInstancia(nome, { janela_min: v }); }} placeholder={String(tplSel?.janela_min ?? "")} style={{ ...inp, width: 90 }} disabled={!canEdit} /></div>
                  <div style={{ flex: 1, minWidth: 140 }}><span style={lbl}>Responsável</span><input defaultValue={inst?.responsavel || ""} onBlur={e => { if ((e.target.value || null) !== (inst?.responsavel || null)) salvarInstancia(nome, { responsavel: e.target.value }); }} style={inp} disabled={!canEdit} /></div>
                  {inst && !inst.validado && <Pill c={PROT_FAROL.amarelo} t="em validação" />}
                </>)}
              </div>
            );
          })}
        </>)}
      </div>
    </div>
  );
}
