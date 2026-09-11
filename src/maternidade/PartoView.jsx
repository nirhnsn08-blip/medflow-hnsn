// ═══════════════════════════════════════════════════════════
// PARTO & CESÁREA — a tela (aba Partos & cesáreas)
//
// Escolhe a gestante → acha o episódio → registra o parto: via, início,
// apresentação, terceiro período, sangramento e o desfecho do RN. O grupo de
// Robson e a hemorragia são calculados AO VIVO pelo motor (parto.js) a partir
// do episódio + do que se digita — apoio, nunca conduta. Cada parto é
// append-only.
// ═══════════════════════════════════════════════════════════

import { useState, useMemo, useEffect } from "react";
import { classificarRobson, avaliarHemorragia, avaliarApgar, ehNulipara, ROBSON, VIA } from "./parto.js";
import { buscarPacientes, episodioAtivoDaGestante, carregarPartos, salvarParto } from "./dados.js";

const TURQ = "#2dd4bf";
const cx = {
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 13, padding: "16px 18px", marginBottom: 14 },
  rotulo: { fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 5, display: "block" },
  input: { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", color: "var(--text)", fontSize: 13.5, width: "100%", boxSizing: "border-box", fontFamily: "inherit" },
  chip: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontFamily: "JetBrains Mono, monospace", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 10px" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12 },
  h: { fontSize: 14, fontWeight: 700, marginBottom: 12 },
};

const n = v => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v));
const b = v => (v === "" || v == null ? null : v === "sim" || v === true);

function Campo({ label, dica, span, children }) {
  return (
    <label style={{ display: "block", gridColumn: span ? `span ${span}` : undefined, minWidth: 0 }}>
      <span style={cx.rotulo}>{label}</span>
      {children}
      {dica && <span style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3, display: "block" }}>{dica}</span>}
    </label>
  );
}

const NOVO0 = () => ({
  data_hora: "", via: "vaginal", inicio_trabalho: "espontaneo", apresentacao: "cefalica",
  indicacao: "", anestesia: "", n_nascidos: "1",
  placenta: "", placenta_completa: "", laceracao: "", ocitocina_profilatica: "", perda_sangue_ml: "",
  rn_vivo: "sim", rn_sexo: "", rn_peso_g: "", apgar_1: "", apgar_5: "",
  complicacoes: "", observacao: "",
});

const COR_FAIXA = { normal: "#22c55e", moderado: "#f59e0b", grave: "#ef4444" };

export default function PartoView({ sb, currentUser, canEdit, pacienteInicial }) {
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [gestante, setGestante] = useState(null);
  const [episodio, setEpisodio] = useState(undefined);   // undefined=não buscado, null=nenhum, obj=achado
  const [carregandoEp, setCarregandoEp] = useState(false);
  const [partos, setPartos] = useState([]);
  const [novo, setNovo] = useState(NOVO0());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState(null);

  const cn = (k, v) => setNovo(x => ({ ...x, [k]: v }));

  // ── Robson e hemorragia ao vivo (episódio + formulário) ──────
  const robson = useMemo(() => {
    if (!episodio) return { grupo: null, completo: false, falta: "o episódio" };
    return classificarRobson({
      nulipara: ehNulipara({ termo: episodio.para_termo, prematuro: episodio.para_prematuro }),
      cesareaAnterior: Number(episodio.cesareas) > 0,
      semanas: episodio.ig_usg_semanas ?? episodio.ig_dum_semanas,
      apresentacao: novo.apresentacao,
      nFetos: n(novo.n_nascidos) ?? episodio.n_fetos ?? 1,
      inicio: novo.inicio_trabalho,
    });
  }, [episodio, novo.apresentacao, novo.n_nascidos, novo.inicio_trabalho]);

  const hemorragia = useMemo(() => avaliarHemorragia({ perda_ml: novo.perda_sangue_ml, via: novo.via }), [novo.perda_sangue_ml, novo.via]);
  const ap1 = avaliarApgar(novo.apgar_1);
  const ap5 = avaliarApgar(novo.apgar_5);
  const ehCesarea = novo.via === "cesarea";

  async function buscar(e) {
    e?.preventDefault?.();
    if (busca.trim().length < 2) { setResultados({ curto: true }); return; }
    setBuscando(true);
    setResultados(await buscarPacientes(sb, busca));
    setBuscando(false);
  }

  async function escolher(p) {
    setGestante(p); setResultados(null); setBusca(""); setCarregandoEp(true); setEpisodio(undefined); setPartos([]); setResultado(null);
    const ep = await episodioAtivoDaGestante(sb, p.prontuario).catch(() => null);
    setEpisodio(ep || null);
    if (ep) setPartos(await carregarPartos(sb, ep.id).catch(() => []));
    setCarregandoEp(false);
  }

  useEffect(() => {
    if (pacienteInicial && (pacienteInicial.prontuario || pacienteInicial.iniciais)) escolher(pacienteInicial);
  }, [pacienteInicial]);

  function trocar() { setGestante(null); setEpisodio(undefined); setPartos([]); setNovo(NOVO0()); setErro(""); setResultado(null); }

  async function lancar() {
    if (!episodio || !canEdit || salvando) return;
    setSalvando(true); setErro(""); setResultado(null);
    const registro = {
      episodio_id: episodio.id,
      data_hora: novo.data_hora || new Date().toISOString(),
      via: novo.via || null, inicio_trabalho: novo.inicio_trabalho || null, apresentacao: novo.apresentacao || null,
      indicacao: novo.indicacao || null, anestesia: novo.anestesia || null,
      n_nascidos: n(novo.n_nascidos) || 1,
      robson: robson.completo ? robson.grupo : null,
      placenta: novo.placenta || null, placenta_completa: b(novo.placenta_completa),
      laceracao: novo.laceracao || null, ocitocina_profilatica: b(novo.ocitocina_profilatica),
      perda_sangue_ml: n(novo.perda_sangue_ml),
      rn_vivo: b(novo.rn_vivo), rn_sexo: novo.rn_sexo || null, rn_peso_g: n(novo.rn_peso_g),
      apgar_1: n(novo.apgar_1), apgar_5: n(novo.apgar_5),
      complicacoes: novo.complicacoes || null, observacao: novo.observacao || null,
      profissional: currentUser?.name || null,
    };
    const r = await salvarParto(sb, registro, currentUser);
    setSalvando(false);
    if (!r.ok) { setErro(r.motivo); return; }
    setResultado(r.parto);
    setPartos(await carregarPartos(sb, episodio.id).catch(() => partos));
    setNovo(NOVO0());
  }

  // ── seletor de gestante ─────────────────────────────────────
  if (!gestante) {
    return (
      <div>
        <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "0 0 12px" }}>
          Escolha a gestante para registrar o parto (precisa ter passado pela Admissão).
        </p>
        <form onSubmit={buscar} style={{ display: "flex", gap: 8, marginBottom: 12, maxWidth: 520 }}>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome, CPF, CNS ou prontuário…" style={cx.input} autoFocus />
          <button type="submit" disabled={buscando} style={{ background: TURQ, color: "#062a26", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" }}>{buscando ? "Buscando…" : "Buscar"}</button>
        </form>
        {resultados?.curto && <p style={{ color: "var(--text-muted)", fontSize: 12.5 }}>Digite ao menos 2 caracteres.</p>}
        {resultados?.ok === false && <p style={{ color: "#fca5a5", fontSize: 12.5 }}>{resultados.motivo}</p>}
        {resultados?.ok && resultados.lista?.length === 0 && !resultados.curto && <p style={{ color: "var(--text-muted)", fontSize: 12.5 }}>Nenhuma paciente encontrada.</p>}
        {resultados?.lista?.length > 0 && (
          <div style={{ ...cx.card, padding: 6, maxWidth: 620 }}>
            {resultados.lista.map(p => (
              <button key={p.prontuario} onClick={() => escolher(p)} style={{ display: "flex", justifyContent: "space-between", gap: 12, width: "100%", textAlign: "left", background: "transparent", border: "none", borderRadius: 8, padding: "9px 12px", cursor: "pointer", color: "var(--text)", fontFamily: "inherit" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--surface-3)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{p.nome_completo || p.iniciais || "—"}</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{p.prontuario}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* banner */}
      <div style={{ ...cx.card, borderLeft: `2px solid ${TURQ}`, display: "flex", flexWrap: "wrap", gap: "10px 20px", alignItems: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>{gestante.nome_completo || gestante.iniciais}
          <span style={{ display: "block", fontSize: 11, fontWeight: 500, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace", marginTop: 2 }}>{gestante.prontuario}{episodio ? ` · episódio nº ${episodio.id}` : ""}</span>
        </div>
        {robson.completo && <span style={{ ...cx.chip, color: TURQ, borderColor: TURQ }} title={ROBSON[robson.grupo]}>Robson {robson.grupo}</span>}
        <button onClick={trocar} style={{ marginLeft: "auto", background: "transparent", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 13px", cursor: "pointer", fontSize: 12 }}>Trocar gestante</button>
      </div>

      {carregandoEp && <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Carregando o episódio…</p>}

      {episodio === null && !carregandoEp && (
        <div style={{ ...cx.card, color: "var(--text-muted)", fontSize: 13.5 }}>
          Esta gestante <b style={{ color: "var(--text-2)" }}>não tem episódio em andamento</b>. Faça a <b>Admissão Obstétrica</b> primeiro — o parto pendura no episódio aberto.
        </div>
      )}

      {episodio && (
        <>
          {canEdit && (
            <>
              <section style={cx.card}>
                <div style={cx.h}>Registrar parto</div>
                <div style={cx.grid}>
                  <Campo label="Data e hora" dica="Em branco = agora."><input type="datetime-local" value={novo.data_hora} onChange={e => cn("data_hora", e.target.value)} style={cx.input} /></Campo>
                  <Campo label="Via"><select value={novo.via} onChange={e => cn("via", e.target.value)} style={cx.input}><option value={VIA.VAGINAL}>Vaginal</option><option value={VIA.CESAREA}>Cesárea</option><option value={VIA.FORCEPS}>Fórceps</option><option value={VIA.VACUO}>Vácuo-extrator</option></select></Campo>
                  <Campo label="Início do trabalho"><select value={novo.inicio_trabalho} onChange={e => cn("inicio_trabalho", e.target.value)} style={cx.input}><option value="espontaneo">Espontâneo</option><option value="induzido">Induzido</option><option value="cesarea_pre_trabalho">Cesárea antes do trabalho</option></select></Campo>
                  <Campo label="Apresentação"><select value={novo.apresentacao} onChange={e => cn("apresentacao", e.target.value)} style={cx.input}><option value="cefalica">Cefálica</option><option value="pelvica">Pélvica</option><option value="transversa">Transversa/oblíqua</option></select></Campo>
                  <Campo label="Nº de nascidos"><input type="number" min="1" value={novo.n_nascidos} onChange={e => cn("n_nascidos", e.target.value)} style={cx.input} /></Campo>
                  <Campo label="Anestesia"><select value={novo.anestesia} onChange={e => cn("anestesia", e.target.value)} style={cx.input}><option value="">—</option><option value="nenhuma">Nenhuma</option><option value="local">Local</option><option value="raqui">Raquianestesia</option><option value="peridural">Peridural</option><option value="geral">Geral</option></select></Campo>
                  {ehCesarea && <Campo label="Indicação da cesárea" span={2}><input value={novo.indicacao} onChange={e => cn("indicacao", e.target.value)} style={cx.input} placeholder="ex.: sofrimento fetal, parada de progressão…" /></Campo>}
                </div>
                {robson.completo
                  ? <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}><b style={{ color: TURQ }}>Robson {robson.grupo}</b> — {ROBSON[robson.grupo]}</div>
                  : <div style={{ marginTop: 12, fontSize: 12, color: "#fcd34d" }}>Robson: falta {robson.falta} para classificar.</div>}
              </section>

              <section style={cx.card}>
                <div style={cx.h}>Terceiro período & sangramento</div>
                <div style={cx.grid}>
                  <Campo label="Dequitação da placenta"><select value={novo.placenta} onChange={e => cn("placenta", e.target.value)} style={cx.input}><option value="">—</option><option value="espontanea">Espontânea</option><option value="dirigida">Dirigida</option><option value="manual">Manual</option></select></Campo>
                  <Campo label="Placenta completa?"><select value={novo.placenta_completa} onChange={e => cn("placenta_completa", e.target.value)} style={cx.input}><option value="">—</option><option value="sim">Sim</option><option value="nao">Não</option></select></Campo>
                  <Campo label="Laceração / episio"><select value={novo.laceracao} onChange={e => cn("laceracao", e.target.value)} style={cx.input}><option value="">—</option><option value="integra">Íntegra</option><option value="grau_1">Grau 1</option><option value="grau_2">Grau 2</option><option value="grau_3">Grau 3</option><option value="grau_4">Grau 4</option><option value="episiotomia">Episiotomia</option></select></Campo>
                  <Campo label="Ocitocina profilática"><select value={novo.ocitocina_profilatica} onChange={e => cn("ocitocina_profilatica", e.target.value)} style={cx.input}><option value="">—</option><option value="sim">Sim</option><option value="nao">Não</option></select></Campo>
                  <Campo label="Perda sanguínea (ml)" dica={`Limiar de HPP nesta via: ${hemorragia.limiar ?? (ehCesarea ? 1000 : 500)} ml`}><input type="number" min="0" value={novo.perda_sangue_ml} onChange={e => cn("perda_sangue_ml", e.target.value)} style={cx.input} /></Campo>
                </div>
                {hemorragia.avaliado && (hemorragia.hemorragia || hemorragia.grave) && (
                  <div role="alert" style={{ marginTop: 12, background: "#7f1d1d22", border: "1px solid #ef444466", color: "#fca5a5", borderRadius: 8, padding: "9px 13px", fontSize: 12.5 }}>
                    <b>{hemorragia.grave ? "Hemorragia grave" : "Hemorragia pós-parto"}</b> — {hemorragia.perda} ml (limiar {hemorragia.limiar} ml). Sinal de atenção; a conduta é da equipe.
                  </div>
                )}
              </section>

              <section style={cx.card}>
                <div style={cx.h}>Recém-nascido</div>
                <div style={cx.grid}>
                  <Campo label="Nascido vivo?"><select value={novo.rn_vivo} onChange={e => cn("rn_vivo", e.target.value)} style={cx.input}><option value="sim">Vivo</option><option value="nao">Natimorto</option></select></Campo>
                  <Campo label="Sexo"><select value={novo.rn_sexo} onChange={e => cn("rn_sexo", e.target.value)} style={cx.input}><option value="">—</option><option value="F">Feminino</option><option value="M">Masculino</option><option value="indeterminado">Indeterminado</option></select></Campo>
                  <Campo label="Peso (g)"><input type="number" min="0" value={novo.rn_peso_g} onChange={e => cn("rn_peso_g", e.target.value)} style={cx.input} /></Campo>
                  <Campo label="Apgar 1'"><input type="number" min="0" max="10" value={novo.apgar_1} onChange={e => cn("apgar_1", e.target.value)} style={{ ...cx.input, borderColor: ap1.valido ? COR_FAIXA[ap1.faixa] : "var(--border)" }} /></Campo>
                  <Campo label="Apgar 5'"><input type="number" min="0" max="10" value={novo.apgar_5} onChange={e => cn("apgar_5", e.target.value)} style={{ ...cx.input, borderColor: ap5.valido ? COR_FAIXA[ap5.faixa] : "var(--border)" }} /></Campo>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>O cadastro completo do bebê (prontuário próprio) é a aba <b>Recém-nascidos</b>.</div>
              </section>

              <section style={cx.card}>
                <div style={cx.h}>Observações</div>
                <div style={cx.grid}>
                  <Campo label="Complicações" span={2}><input value={novo.complicacoes} onChange={e => cn("complicacoes", e.target.value)} style={cx.input} placeholder="distocia de ombro, retenção…" /></Campo>
                  <Campo label="Observação" span={2}><input value={novo.observacao} onChange={e => cn("observacao", e.target.value)} style={cx.input} /></Campo>
                </div>
              </section>

              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
                <button onClick={lancar} disabled={salvando} style={{ background: salvando ? "var(--surface-3)" : "#22c55e", color: salvando ? "var(--text-muted)" : "#052e16", border: "none", borderRadius: 9, padding: "11px 24px", fontWeight: 700, cursor: salvando ? "default" : "pointer", fontSize: 13.5 }}>{salvando ? "Gravando…" : "Registrar parto"}</button>
                {erro && <span style={{ color: "#fca5a5", fontSize: 12.5 }}>{erro}</span>}
                {resultado && <span style={{ color: "#86efac", fontSize: 12.5 }}>Parto registrado{resultado.robson ? ` (Robson ${resultado.robson})` : ""}.</span>}
              </div>
            </>
          )}

          {/* histórico */}
          {partos.length > 0 && (
            <section style={cx.card}>
              <div style={{ ...cx.rotulo, marginBottom: 8 }}>Partos registrados ({partos.length})</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead><tr style={{ textAlign: "left", color: "var(--text-muted)", fontSize: 10.5, textTransform: "uppercase" }}>
                    <th style={{ padding: "5px 8px" }}>Hora</th><th style={{ padding: "5px 8px" }}>Via</th><th style={{ padding: "5px 8px" }}>Robson</th><th style={{ padding: "5px 8px" }}>RN</th><th style={{ padding: "5px 8px" }}>Apgar</th><th style={{ padding: "5px 8px" }}>Sangue</th>
                  </tr></thead>
                  <tbody>
                    {partos.map(p => (
                      <tr key={p.id} style={{ borderTop: "1px solid var(--border)", fontFamily: "JetBrains Mono, monospace" }}>
                        <td style={{ padding: "6px 8px" }}>{p.data_hora ? new Date(p.data_hora).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td style={{ padding: "6px 8px" }}>{p.via || "—"}</td>
                        <td style={{ padding: "6px 8px" }}>{p.robson ?? "—"}</td>
                        <td style={{ padding: "6px 8px" }}>{p.rn_vivo === false ? "natimorto" : (p.rn_sexo || "vivo")}{p.rn_peso_g ? ` · ${p.rn_peso_g}g` : ""}</td>
                        <td style={{ padding: "6px 8px" }}>{p.apgar_1 ?? "—"}/{p.apgar_5 ?? "—"}</td>
                        <td style={{ padding: "6px 8px" }}>{p.perda_sangue_ml != null ? `${p.perda_sangue_ml}ml` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
