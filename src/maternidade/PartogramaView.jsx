// ═══════════════════════════════════════════════════════════
// PARTOGRAMA — a tela (aba Trabalho de parto)
//
// Escolhe a gestante → acha o parto em andamento → desenha o partograma:
// a curva de dilatação × tempo, com as linhas de alerta e ação da OMS, cada
// toque colorido pela zona. Embaixo, o formulário pra lançar um novo toque.
//
// ⚠️ APOIO, NÃO CONDUTA. Cruzar a linha de ação chama atenção; a decisão é de
// quem assiste. Cada toque é append-only.
// ═══════════════════════════════════════════════════════════

import { useState, useMemo, useEffect } from "react";
import { avaliarPartograma, ZONA } from "./partograma.js";
import { buscarPacientes, episodioAtivoDaGestante, carregarTrabalhoParto, salvarRegistroTP } from "./dados.js";

const TURQ = "#2dd4bf";
const COR_ZONA = { [ZONA.NORMAL]: "#22c55e", [ZONA.ALERTA]: "#f59e0b", [ZONA.ACAO]: "#ef4444", [ZONA.LATENTE]: "#8fa2bd" };
const ROTULO_ZONA = { [ZONA.NORMAL]: "Normal", [ZONA.ALERTA]: "Atenção — passou da linha de alerta", [ZONA.ACAO]: "Ação — passou da linha de ação", [ZONA.LATENTE]: "Fase latente" };

const cx = {
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 13, padding: "16px 18px", marginBottom: 14 },
  rotulo: { fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 5, display: "block" },
  input: { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", color: "var(--text)", fontSize: 13.5, width: "100%", boxSizing: "border-box", fontFamily: "inherit" },
  chip: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontFamily: "JetBrains Mono, monospace", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 10px" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 11 },
};

const n = v => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v));

// ── O gráfico ───────────────────────────────────────────────
function Partografo({ avaliacao }) {
  const { t0, referenciaCm: ref, linhaAlerta, linhaAcao } = avaliacao;
  const ativos = avaliacao.pontos.filter(p => p.zona !== ZONA.LATENTE);
  const W = 720, H = 360, ML = 46, MR = 16, MT = 14, MB = 32;
  const PW = W - ML - MR, PH = H - MT - MB;
  const maxH = Math.max(12, Math.ceil((avaliacao.duracaoHoras || 0) + 2), Math.ceil(linhaAcao[1]?.horas || 10));
  const x = h => ML + (h / maxH) * PW;
  const y = cm => MT + ((10 - cm) / 10) * PH;
  const eixo = { stroke: "var(--border)", strokeWidth: 1 };
  const gradeCor = "var(--border)";

  if (!t0) {
    return (
      <div style={{ ...cx.card, minHeight: 220, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: "var(--text-muted)", fontSize: 13.5, padding: 30 }}>
        O partograma começa quando a dilatação chega a <b style={{ margin: "0 4px", color: "var(--text-2)" }}>{ref} cm</b> (fase ativa).
        Lance o primeiro toque abaixo.
      </div>
    );
  }

  return (
    <section style={cx.card}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Partograma: dilatação cervical ao longo do tempo, com as linhas de alerta e ação" style={{ width: "100%", height: "auto", display: "block" }}>
        {/* grade horizontal (cm) */}
        {[0, 2, 4, 6, 8, 10].map(cm => (
          <g key={cm}>
            <line x1={ML} y1={y(cm)} x2={W - MR} y2={y(cm)} style={{ stroke: gradeCor, strokeWidth: cm === ref ? 1.4 : 0.6, opacity: cm === ref ? 0.9 : 0.5 }} />
            <text x={ML - 8} y={y(cm) + 4} textAnchor="end" style={{ fill: "var(--text-muted)", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>{cm}</text>
          </g>
        ))}
        {/* grade vertical (horas) */}
        {Array.from({ length: maxH + 1 }, (_, h) => (
          <g key={h}>
            <line x1={x(h)} y1={MT} x2={x(h)} y2={H - MB} style={{ stroke: gradeCor, strokeWidth: 0.5, opacity: 0.35 }} />
            <text x={x(h)} y={H - MB + 16} textAnchor="middle" style={{ fill: "var(--text-muted)", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}>{h}</text>
          </g>
        ))}
        <line x1={ML} y1={MT} x2={ML} y2={H - MB} style={eixo} />
        <text x={ML - 30} y={MT + PH / 2} textAnchor="middle" transform={`rotate(-90 ${ML - 30} ${MT + PH / 2})`} style={{ fill: "var(--text-muted)", fontSize: 10.5, letterSpacing: ".05em" }}>DILATAÇÃO (cm)</text>
        <text x={ML + PW / 2} y={H - 2} textAnchor="middle" style={{ fill: "var(--text-muted)", fontSize: 10.5, letterSpacing: ".05em" }}>HORAS DE FASE ATIVA</text>

        {/* linha de ALERTA e de AÇÃO */}
        <polyline points={linhaAlerta.map(p => `${x(p.horas)},${y(p.cm)}`).join(" ")} fill="none" style={{ stroke: "#f59e0b", strokeWidth: 1.6, strokeDasharray: "6 4" }} />
        <polyline points={linhaAcao.map(p => `${x(p.horas)},${y(p.cm)}`).join(" ")} fill="none" style={{ stroke: "#ef4444", strokeWidth: 1.6, strokeDasharray: "6 4" }} />

        {/* a curva de dilatação */}
        {ativos.length > 1 && (
          <polyline points={ativos.map(p => `${x(p.horas)},${y(p.dilatacao)}`).join(" ")} fill="none" style={{ stroke: TURQ, strokeWidth: 2 }} />
        )}
        {ativos.map((p, i) => (
          <circle key={i} cx={x(p.horas)} cy={y(p.dilatacao)} r={4.5} style={{ fill: COR_ZONA[p.zona], stroke: "var(--surface)", strokeWidth: 1.5 }}>
            <title>{`${p.dilatacao} cm · ${p.horas.toFixed(1)}h · ${ROTULO_ZONA[p.zona]}`}</title>
          </circle>
        ))}
      </svg>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8, fontSize: 11, color: "var(--text-muted)" }}>
        <span><i style={{ display: "inline-block", width: 14, height: 2, background: "#f59e0b", verticalAlign: "middle", marginRight: 5 }} />linha de alerta</span>
        <span><i style={{ display: "inline-block", width: 14, height: 2, background: "#ef4444", verticalAlign: "middle", marginRight: 5 }} />linha de ação</span>
        <span><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 9, background: "#22c55e", verticalAlign: "middle", marginRight: 5 }} />normal</span>
        <span><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 9, background: "#f59e0b", verticalAlign: "middle", marginRight: 5 }} />atenção</span>
        <span><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 9, background: "#ef4444", verticalAlign: "middle", marginRight: 5 }} />ação</span>
      </div>
    </section>
  );
}

const NOVO0 = () => ({ data_hora: "", dilatacao: "", descida_delee: "", bcf: "", contracoes_freq: "", contracoes_dur: "", bolsa: "", liquido: "", ocitocina: "", observacao: "" });

export default function PartogramaView({ sb, currentUser, canEdit, pacienteInicial }) {
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [gestante, setGestante] = useState(null);
  const [episodio, setEpisodio] = useState(null);      // undefined=não buscado, null=nenhum, obj=achado
  const [carregandoEp, setCarregandoEp] = useState(false);
  const [registros, setRegistros] = useState([]);
  const [novo, setNovo] = useState(NOVO0());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const cn = (k, v) => setNovo(x => ({ ...x, [k]: v }));

  const avaliacao = useMemo(
    () => avaliarPartograma(registros.map(r => ({ data_hora: r.data_hora, dilatacao: r.dilatacao }))),
    [registros]);

  async function buscar(e) {
    e?.preventDefault?.();
    if (busca.trim().length < 2) { setResultados({ curto: true }); return; }
    setBuscando(true);
    setResultados(await buscarPacientes(sb, busca));
    setBuscando(false);
  }

  async function escolher(p) {
    setGestante(p); setResultados(null); setBusca(""); setCarregandoEp(true); setEpisodio(undefined); setRegistros([]);
    const ep = await episodioAtivoDaGestante(sb, p.prontuario).catch(() => null);
    setEpisodio(ep || null);
    if (ep) setRegistros(await carregarTrabalhoParto(sb, ep.id).catch(() => []));
    setCarregandoEp(false);
  }

  function trocar() { setGestante(null); setEpisodio(undefined); setRegistros([]); setNovo(NOVO0()); setErro(""); }

  // A fila obstétrica entrega a paciente já escolhida: pula a busca e abre o
  // partograma dela direto. (Sem react-hooks/exhaustive-deps neste projeto.)
  useEffect(() => {
    if (pacienteInicial && (pacienteInicial.prontuario || pacienteInicial.iniciais)) escolher(pacienteInicial);
  }, [pacienteInicial]);

  async function lancar() {
    if (!episodio || !canEdit || salvando) return;
    setSalvando(true); setErro("");
    const registro = {
      episodio_id: episodio.id,
      data_hora: novo.data_hora || new Date().toISOString(),
      dilatacao: n(novo.dilatacao), descida_delee: n(novo.descida_delee),
      bcf: n(novo.bcf), contracoes_freq: n(novo.contracoes_freq), contracoes_dur: n(novo.contracoes_dur),
      bolsa: novo.bolsa || null, liquido: novo.liquido || null,
      ocitocina: novo.ocitocina || null, observacao: novo.observacao || null,
      profissional: currentUser?.name || null,
    };
    const r = await salvarRegistroTP(sb, registro, currentUser);
    setSalvando(false);
    if (!r.ok) { setErro(r.motivo); return; }
    setRegistros(await carregarTrabalhoParto(sb, episodio.id).catch(() => registros));
    setNovo(NOVO0());
  }

  // ── seletor de gestante ─────────────────────────────────────
  if (!gestante) {
    return (
      <div>
        <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "0 0 12px" }}>
          Escolha a gestante em trabalho de parto (precisa ter passado pela Admissão).
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

  const zc = avaliacao.zonaAtual;

  return (
    <div>
      {/* banner */}
      <div style={{ ...cx.card, borderLeft: `2px solid ${TURQ}`, display: "flex", flexWrap: "wrap", gap: "10px 20px", alignItems: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>{gestante.nome_completo || gestante.iniciais}
          <span style={{ display: "block", fontSize: 11, fontWeight: 500, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace", marginTop: 2 }}>{gestante.prontuario}{episodio ? ` · episódio nº ${episodio.id}` : ""}</span>
        </div>
        {zc && <span style={{ ...cx.chip, color: COR_ZONA[zc], borderColor: COR_ZONA[zc] }}>{ROTULO_ZONA[zc]}</span>}
        {avaliacao.duracaoHoras != null && <span style={cx.chip}>{avaliacao.duracaoHoras.toFixed(1)} h de fase ativa</span>}
        <button onClick={trocar} style={{ marginLeft: "auto", background: "transparent", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 13px", cursor: "pointer", fontSize: 12 }}>Trocar gestante</button>
      </div>

      {carregandoEp && <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Carregando o parto…</p>}

      {episodio === null && !carregandoEp && (
        <div style={{ ...cx.card, color: "var(--text-muted)", fontSize: 13.5 }}>
          Esta gestante <b style={{ color: "var(--text-2)" }}>não tem parto em andamento</b>. Faça a <b>Admissão Obstétrica</b> primeiro — o partograma pendura no episódio aberto.
        </div>
      )}

      {episodio && (
        <>
          {zc === ZONA.ACAO && (
            <div role="alert" style={{ ...cx.card, background: "#7f1d1d22", border: "1px solid #ef444466", color: "#fca5a5", fontSize: 13 }}>
              <b>A curva passou da linha de ação.</b> É sinal para reavaliar — a conduta é da equipe. O sistema só aponta.
            </div>
          )}

          <Partografo avaliacao={avaliacao} />

          {/* lançar toque */}
          {canEdit && (
            <section style={cx.card}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Lançar toque / avaliação</div>
              <div style={cx.grid}>
                <label><span style={cx.rotulo}>Data e hora</span><input type="datetime-local" value={novo.data_hora} onChange={e => cn("data_hora", e.target.value)} style={cx.input} /><span style={{ fontSize: 10, color: "var(--text-muted)" }}>Em branco = agora.</span></label>
                <label><span style={cx.rotulo}>Dilatação (cm)</span><input type="number" min="0" max="10" value={novo.dilatacao} onChange={e => cn("dilatacao", e.target.value)} style={cx.input} /></label>
                <label><span style={cx.rotulo}>Descida (De Lee)</span><input type="number" min="-3" max="3" value={novo.descida_delee} onChange={e => cn("descida_delee", e.target.value)} style={cx.input} /></label>
                <label><span style={cx.rotulo}>BCF (bpm)</span><input type="number" value={novo.bcf} onChange={e => cn("bcf", e.target.value)} style={cx.input} /></label>
                <label><span style={cx.rotulo}>Contrações / 10 min</span><input type="number" min="0" value={novo.contracoes_freq} onChange={e => cn("contracoes_freq", e.target.value)} style={cx.input} /></label>
                <label><span style={cx.rotulo}>Duração (s)</span><input type="number" min="0" value={novo.contracoes_dur} onChange={e => cn("contracoes_dur", e.target.value)} style={cx.input} /></label>
                <label><span style={cx.rotulo}>Bolsa</span><select value={novo.bolsa} onChange={e => cn("bolsa", e.target.value)} style={cx.input}><option value="">—</option><option value="integra">Íntegra</option><option value="rota">Rota</option></select></label>
                <label><span style={cx.rotulo}>Líquido</span><select value={novo.liquido} onChange={e => cn("liquido", e.target.value)} style={cx.input}><option value="">—</option><option value="claro">Claro</option><option value="meconial">Meconial</option><option value="sanguinolento">Sanguinolento</option></select></label>
                <label><span style={cx.rotulo}>Ocitocina</span><input value={novo.ocitocina} onChange={e => cn("ocitocina", e.target.value)} style={cx.input} placeholder="ex.: 8 mUI/min" /></label>
                <label style={{ gridColumn: "1/-1" }}><span style={cx.rotulo}>Observação</span><input value={novo.observacao} onChange={e => cn("observacao", e.target.value)} style={cx.input} /></label>
              </div>
              <div style={{ marginTop: 14, display: "flex", gap: 12, alignItems: "center" }}>
                <button onClick={lancar} disabled={salvando} style={{ background: salvando ? "var(--surface-3)" : "#22c55e", color: salvando ? "var(--text-muted)" : "#052e16", border: "none", borderRadius: 9, padding: "10px 22px", fontWeight: 700, cursor: salvando ? "default" : "pointer", fontSize: 13.5 }}>{salvando ? "Gravando…" : "Lançar toque"}</button>
                {erro && <span style={{ color: "#fca5a5", fontSize: 12.5 }}>{erro}</span>}
              </div>
            </section>
          )}

          {/* histórico */}
          {registros.length > 0 && (
            <section style={cx.card}>
              <div style={{ ...cx.rotulo, marginBottom: 8 }}>Toques registrados ({registros.length})</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead><tr style={{ textAlign: "left", color: "var(--text-muted)", fontSize: 10.5, textTransform: "uppercase" }}>
                    <th style={{ padding: "5px 8px" }}>Hora</th><th style={{ padding: "5px 8px" }}>Dilat.</th><th style={{ padding: "5px 8px" }}>De Lee</th><th style={{ padding: "5px 8px" }}>BCF</th><th style={{ padding: "5px 8px" }}>Contr.</th><th style={{ padding: "5px 8px" }}>Líquido</th>
                  </tr></thead>
                  <tbody>
                    {registros.map(r => (
                      <tr key={r.id} style={{ borderTop: "1px solid var(--border)", fontFamily: "JetBrains Mono, monospace" }}>
                        <td style={{ padding: "6px 8px" }}>{r.data_hora ? new Date(r.data_hora).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td style={{ padding: "6px 8px" }}>{r.dilatacao ?? "—"} cm</td>
                        <td style={{ padding: "6px 8px" }}>{r.descida_delee ?? "—"}</td>
                        <td style={{ padding: "6px 8px" }}>{r.bcf ?? "—"}</td>
                        <td style={{ padding: "6px 8px" }}>{r.contracoes_freq != null ? `${r.contracoes_freq}/10min` : "—"}</td>
                        <td style={{ padding: "6px 8px" }}>{r.liquido || "—"}</td>
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
