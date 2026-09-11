// ═══════════════════════════════════════════════════════════
// RECÉM-NASCIDOS — a tela (aba Recém-nascidos)
//
// Escolhe a mãe → acha o episódio → registra o bebê: a IDENTIDADE (prontuário
// próprio ligado à mãe, reusando cadastrarRecemNascido) e a AVALIAÇÃO do berço
// (peso/medidas, Capurro, Apgar, profilaxias, triagem neonatal). Peso, IG pelo
// Capurro e Apgar são calculados AO VIVO pelo motor — apoio, nunca conduta.
// ═══════════════════════════════════════════════════════════

import { useState, useMemo, useEffect } from "react";
import { avaliarPeso, classificarIdadeGestacional, capurroSomatico, avaliarApgar, CAPURRO } from "./recem_nascido.js";
import { buscarPacientes, carregarPaciente, episodioAtivoDaGestante, carregarPartos, carregarRecemNascidos, salvarRecemNascido } from "./dados.js";

const TURQ = "#2dd4bf";
const COR_FAIXA = { normal: "#22c55e", moderado: "#f59e0b", grave: "#ef4444" };
const TRIAGEM = ["pezinho", "orelhinha", "olhinho", "coracaozinho"];
const TRIAGEM_ROTULO = { pezinho: "Pezinho", orelhinha: "Orelhinha", olhinho: "Olhinho", coracaozinho: "Coraçãozinho" };

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
  nome_completo: "", sexo: "", data_nascimento: "", hora_nascimento: "", dnv: "", ordem_nascimento: "1",
  peso_g: "", comprimento_cm: "", perimetro_cefalico_cm: "",
  cap_pele: "", cap_orelha: "", cap_mama: "", cap_mamilo: "", cap_plantar: "",
  apgar_1: "", apgar_5: "", apgar_10: "",
  reanimacao: "", vitamina_k: "", profilaxia_ocular: "", aleitamento_1a_hora: "",
  tri_pezinho: "", tri_orelhinha: "", tri_olhinho: "", tri_coracaozinho: "",
  observacao: "",
});

export default function RecemNascidosView({ sb, currentUser, canEdit, pacienteInicial }) {
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [mae, setMae] = useState(null);            // cadastro COMPLETO da mãe (herança de endereço)
  const [episodio, setEpisodio] = useState(undefined);
  const [carregandoEp, setCarregandoEp] = useState(false);
  const [partos, setPartos] = useState([]);
  const [rns, setRns] = useState([]);
  const [novo, setNovo] = useState(NOVO0());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState(null);

  const cn = (k, v) => setNovo(x => ({ ...x, [k]: v }));

  const capurro = useMemo(() => capurroSomatico({
    pele: novo.cap_pele, orelha: novo.cap_orelha, mama: novo.cap_mama, mamilo: novo.cap_mamilo, plantar: novo.cap_plantar,
  }), [novo.cap_pele, novo.cap_orelha, novo.cap_mama, novo.cap_mamilo, novo.cap_plantar]);
  const peso = avaliarPeso(novo.peso_g);
  const igClasse = capurro.completo ? classificarIdadeGestacional(capurro.dias / 7) : null;
  const ap1 = avaliarApgar(novo.apgar_1), ap5 = avaliarApgar(novo.apgar_5), ap10 = avaliarApgar(novo.apgar_10);

  async function buscar(e) {
    e?.preventDefault?.();
    if (busca.trim().length < 2) { setResultados({ curto: true }); return; }
    setBuscando(true);
    setResultados(await buscarPacientes(sb, busca));
    setBuscando(false);
  }

  async function escolher(p) {
    setResultados(null); setBusca(""); setCarregandoEp(true); setEpisodio(undefined); setPartos([]); setRns([]); setResultado(null);
    const completo = await carregarPaciente(sb, p.prontuario).catch(() => null);
    const maeObj = completo || p;
    setMae(maeObj);
    const ep = await episodioAtivoDaGestante(sb, p.prontuario).catch(() => null);
    setEpisodio(ep || null);
    if (ep) {
      setPartos(await carregarPartos(sb, ep.id).catch(() => []));
      setRns(await carregarRecemNascidos(sb, ep.id).catch(() => []));
      setNovo(x => ({ ...x, nome_completo: `RN de ${maeObj.nome_completo || maeObj.iniciais || ""}`.trim() }));
    }
    setCarregandoEp(false);
  }

  useEffect(() => {
    if (pacienteInicial && (pacienteInicial.prontuario || pacienteInicial.iniciais)) escolher(pacienteInicial);
  }, [pacienteInicial]);

  function trocar() { setMae(null); setEpisodio(undefined); setPartos([]); setRns([]); setNovo(NOVO0()); setErro(""); setResultado(null); }

  async function lancar() {
    if (!episodio || !canEdit || salvando) return;
    setSalvando(true); setErro(""); setResultado(null);
    const nascimento = novo.data_nascimento
      ? new Date(`${novo.data_nascimento}T${novo.hora_nascimento || "00:00"}`).toISOString()
      : new Date().toISOString();
    const dados = {
      nome_completo: novo.nome_completo || `RN de ${mae?.nome_completo || ""}`.trim(),
      sexo: novo.sexo || null, data_nascimento: novo.data_nascimento || null,
      hora_nascimento: novo.hora_nascimento || null, dnv: novo.dnv || null,
      ordem_nascimento: n(novo.ordem_nascimento) || 1,
    };
    const avaliacao = {
      data_hora: nascimento, sexo: novo.sexo || null,
      peso_g: n(novo.peso_g), comprimento_cm: n(novo.comprimento_cm), perimetro_cefalico_cm: n(novo.perimetro_cefalico_cm),
      ig_capurro_semanas: capurro.completo ? capurro.semanas : null,
      capurro_pontos: capurro.completo ? capurro.soma : null,
      apgar_1: n(novo.apgar_1), apgar_5: n(novo.apgar_5), apgar_10: n(novo.apgar_10),
      reanimacao: novo.reanimacao || null,
      vitamina_k: b(novo.vitamina_k), profilaxia_ocular: b(novo.profilaxia_ocular), aleitamento_1a_hora: b(novo.aleitamento_1a_hora),
      triagem: {
        pezinho: novo.tri_pezinho || null, orelhinha: novo.tri_orelhinha || null,
        olhinho: novo.tri_olhinho || null, coracaozinho: novo.tri_coracaozinho || null,
      },
      observacao: novo.observacao || null,
      profissional: currentUser?.name || null,
    };
    const r = await salvarRecemNascido(sb, { mae, dados, avaliacao, episodioId: episodio.id, partoId: partos[partos.length - 1]?.id }, currentUser);
    setSalvando(false);
    if (!r.ok) { setErro(r.motivo); return; }
    setResultado(r.paciente);
    setRns(await carregarRecemNascidos(sb, episodio.id).catch(() => rns));
    setNovo({ ...NOVO0(), nome_completo: `RN de ${mae?.nome_completo || ""}`.trim() });
  }

  // ── seletor da mãe ──────────────────────────────────────────
  if (!mae) {
    return (
      <div>
        <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "0 0 12px" }}>
          Escolha a mãe para registrar o recém-nascido (precisa ter passado pela Admissão).
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

  const capOpts = k => [<option key="" value="">—</option>, ...CAPURRO[k].opcoes.map(o => <option key={o.pontos} value={o.pontos}>{o.rotulo} ({o.pontos})</option>)];

  return (
    <div>
      {/* banner */}
      <div style={{ ...cx.card, borderLeft: `2px solid ${TURQ}`, display: "flex", flexWrap: "wrap", gap: "10px 20px", alignItems: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>{mae.nome_completo || mae.iniciais}
          <span style={{ display: "block", fontSize: 11, fontWeight: 500, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace", marginTop: 2 }}>mãe · {mae.prontuario}{episodio ? ` · episódio nº ${episodio.id}` : ""}</span>
        </div>
        {peso.avaliado && <span style={{ ...cx.chip, color: peso.baixoPeso ? "#f59e0b" : "var(--text-2)" }}>{peso.gramas} g · {peso.rotulo}</span>}
        {capurro.completo && <span style={{ ...cx.chip, color: TURQ, borderColor: TURQ }}>IG Capurro {capurro.semanas}s{capurro.diasResto}d</span>}
        <button onClick={trocar} style={{ marginLeft: "auto", background: "transparent", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 13px", cursor: "pointer", fontSize: 12 }}>Trocar mãe</button>
      </div>

      {carregandoEp && <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Carregando o episódio…</p>}

      {episodio === null && !carregandoEp && (
        <div style={{ ...cx.card, color: "var(--text-muted)", fontSize: 13.5 }}>
          Esta paciente <b style={{ color: "var(--text-2)" }}>não tem episódio em andamento</b>. Faça a <b>Admissão Obstétrica</b> primeiro — o recém-nascido pendura no episódio aberto.
        </div>
      )}

      {episodio && (
        <>
          {canEdit && (
            <>
              <section style={cx.card}>
                <div style={cx.h}>Identidade do bebê</div>
                <div style={cx.grid}>
                  <Campo label="Nome" span={2}><input value={novo.nome_completo} onChange={e => cn("nome_completo", e.target.value)} style={cx.input} placeholder="RN de…" /></Campo>
                  <Campo label="Sexo"><select value={novo.sexo} onChange={e => cn("sexo", e.target.value)} style={cx.input}><option value="">—</option><option value="F">Feminino</option><option value="M">Masculino</option><option value="indeterminado">Indeterminado</option></select></Campo>
                  <Campo label="Data de nascimento"><input type="date" value={novo.data_nascimento} onChange={e => cn("data_nascimento", e.target.value)} style={cx.input} /></Campo>
                  <Campo label="Hora"><input type="time" value={novo.hora_nascimento} onChange={e => cn("hora_nascimento", e.target.value)} style={cx.input} /></Campo>
                  <Campo label="DNV" dica="Declaração de Nascido Vivo"><input value={novo.dnv} onChange={e => cn("dnv", e.target.value)} style={cx.input} /></Campo>
                  <Campo label="Ordem (gemelar)"><input type="number" min="1" value={novo.ordem_nascimento} onChange={e => cn("ordem_nascimento", e.target.value)} style={cx.input} /></Campo>
                </div>
              </section>

              <section style={cx.card}>
                <div style={cx.h}>Medidas & idade gestacional (Capurro)</div>
                <div style={cx.grid}>
                  <Campo label="Peso (g)" dica={peso.avaliado ? peso.rotulo : ""}><input type="number" min="0" value={novo.peso_g} onChange={e => cn("peso_g", e.target.value)} style={{ ...cx.input, borderColor: peso.baixoPeso ? "#f59e0b" : "var(--border)" }} /></Campo>
                  <Campo label="Comprimento (cm)"><input type="number" step="0.1" value={novo.comprimento_cm} onChange={e => cn("comprimento_cm", e.target.value)} style={cx.input} /></Campo>
                  <Campo label="Perímetro cefálico (cm)"><input type="number" step="0.1" value={novo.perimetro_cefalico_cm} onChange={e => cn("perimetro_cefalico_cm", e.target.value)} style={cx.input} /></Campo>
                  <Campo label={CAPURRO.pele.rotulo}><select value={novo.cap_pele} onChange={e => cn("cap_pele", e.target.value)} style={cx.input}>{capOpts("pele")}</select></Campo>
                  <Campo label={CAPURRO.orelha.rotulo}><select value={novo.cap_orelha} onChange={e => cn("cap_orelha", e.target.value)} style={cx.input}>{capOpts("orelha")}</select></Campo>
                  <Campo label={CAPURRO.mama.rotulo}><select value={novo.cap_mama} onChange={e => cn("cap_mama", e.target.value)} style={cx.input}>{capOpts("mama")}</select></Campo>
                  <Campo label={CAPURRO.mamilo.rotulo}><select value={novo.cap_mamilo} onChange={e => cn("cap_mamilo", e.target.value)} style={cx.input}>{capOpts("mamilo")}</select></Campo>
                  <Campo label={CAPURRO.plantar.rotulo}><select value={novo.cap_plantar} onChange={e => cn("cap_plantar", e.target.value)} style={cx.input}>{capOpts("plantar")}</select></Campo>
                </div>
                {capurro.completo
                  ? <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}><b style={{ color: TURQ }}>IG Capurro {capurro.semanas}s {capurro.diasResto}d</b>{igClasse ? ` — ${igClasse.rotulo}` : ""} · {capurro.dias} dias ({capurro.soma} pts + 204)</div>
                  : <div style={{ marginTop: 12, fontSize: 12, color: "#fcd34d" }}>Capurro: falta {capurro.falta} para estimar a IG.</div>}
              </section>

              <section style={cx.card}>
                <div style={cx.h}>Vitalidade</div>
                <div style={cx.grid}>
                  <Campo label="Apgar 1'"><input type="number" min="0" max="10" value={novo.apgar_1} onChange={e => cn("apgar_1", e.target.value)} style={{ ...cx.input, borderColor: ap1.valido ? COR_FAIXA[ap1.faixa] : "var(--border)" }} /></Campo>
                  <Campo label="Apgar 5'"><input type="number" min="0" max="10" value={novo.apgar_5} onChange={e => cn("apgar_5", e.target.value)} style={{ ...cx.input, borderColor: ap5.valido ? COR_FAIXA[ap5.faixa] : "var(--border)" }} /></Campo>
                  <Campo label="Apgar 10'"><input type="number" min="0" max="10" value={novo.apgar_10} onChange={e => cn("apgar_10", e.target.value)} style={{ ...cx.input, borderColor: ap10.valido ? COR_FAIXA[ap10.faixa] : "var(--border)" }} /></Campo>
                  <Campo label="Reanimação"><select value={novo.reanimacao} onChange={e => cn("reanimacao", e.target.value)} style={cx.input}><option value="">—</option><option value="nenhuma">Nenhuma</option><option value="oxigenio">Oxigênio</option><option value="vpp">VPP</option><option value="intubacao">Intubação</option><option value="massagem">Massagem cardíaca</option></select></Campo>
                </div>
              </section>

              <section style={cx.card}>
                <div style={cx.h}>Profilaxias & triagem neonatal</div>
                <div style={cx.grid}>
                  <Campo label="Vitamina K"><select value={novo.vitamina_k} onChange={e => cn("vitamina_k", e.target.value)} style={cx.input}><option value="">—</option><option value="sim">Sim</option><option value="nao">Não</option></select></Campo>
                  <Campo label="Profilaxia ocular (Credé)"><select value={novo.profilaxia_ocular} onChange={e => cn("profilaxia_ocular", e.target.value)} style={cx.input}><option value="">—</option><option value="sim">Sim</option><option value="nao">Não</option></select></Campo>
                  <Campo label="Aleitamento na 1ª hora"><select value={novo.aleitamento_1a_hora} onChange={e => cn("aleitamento_1a_hora", e.target.value)} style={cx.input}><option value="">—</option><option value="sim">Sim</option><option value="nao">Não</option></select></Campo>
                </div>
                <div style={{ ...cx.grid, marginTop: 12 }}>
                  {TRIAGEM.map(t => (
                    <Campo key={t} label={TRIAGEM_ROTULO[t]}>
                      <select value={novo[`tri_${t}`]} onChange={e => cn(`tri_${t}`, e.target.value)} style={cx.input}>
                        <option value="">—</option><option value="pendente">Pendente</option><option value="coletado">Coletado</option><option value="normal">Normal</option><option value="alterado">Alterado</option>
                      </select>
                    </Campo>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>Triagem neonatal: pezinho, orelhinha, olhinho e coraçãozinho — apoio para não deixar passar; a coleta e a leitura são da equipe.</div>
              </section>

              <section style={cx.card}>
                <div style={cx.h}>Observação</div>
                <input value={novo.observacao} onChange={e => cn("observacao", e.target.value)} style={cx.input} placeholder="intercorrências, malformações…" />
              </section>

              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
                <button onClick={lancar} disabled={salvando} style={{ background: salvando ? "var(--surface-3)" : "#22c55e", color: salvando ? "var(--text-muted)" : "#052e16", border: "none", borderRadius: 9, padding: "11px 24px", fontWeight: 700, cursor: salvando ? "default" : "pointer", fontSize: 13.5 }}>{salvando ? "Gravando…" : "Registrar recém-nascido"}</button>
                {erro && <span style={{ color: "#fca5a5", fontSize: 12.5 }}>{erro}</span>}
                {resultado && <span style={{ color: "#86efac", fontSize: 12.5 }}>Bebê registrado — prontuário {resultado.prontuario}.</span>}
              </div>
            </>
          )}

          {/* histórico */}
          {rns.length > 0 && (
            <section style={cx.card}>
              <div style={{ ...cx.rotulo, marginBottom: 8 }}>Recém-nascidos deste episódio ({rns.length})</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead><tr style={{ textAlign: "left", color: "var(--text-muted)", fontSize: 10.5, textTransform: "uppercase" }}>
                    <th style={{ padding: "5px 8px" }}>Hora</th><th style={{ padding: "5px 8px" }}>Prontuário</th><th style={{ padding: "5px 8px" }}>Sexo</th><th style={{ padding: "5px 8px" }}>Peso</th><th style={{ padding: "5px 8px" }}>IG</th><th style={{ padding: "5px 8px" }}>Apgar</th>
                  </tr></thead>
                  <tbody>
                    {rns.map(r => (
                      <tr key={r.id} style={{ borderTop: "1px solid var(--border)", fontFamily: "JetBrains Mono, monospace" }}>
                        <td style={{ padding: "6px 8px" }}>{r.data_hora ? new Date(r.data_hora).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td style={{ padding: "6px 8px" }}>{r.prontuario_rn || "—"}</td>
                        <td style={{ padding: "6px 8px" }}>{r.sexo || "—"}</td>
                        <td style={{ padding: "6px 8px" }}>{r.peso_g ? `${r.peso_g}g` : "—"}</td>
                        <td style={{ padding: "6px 8px" }}>{r.ig_capurro_semanas ? `${r.ig_capurro_semanas}s` : "—"}</td>
                        <td style={{ padding: "6px 8px" }}>{r.apgar_1 ?? "—"}/{r.apgar_5 ?? "—"}</td>
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
