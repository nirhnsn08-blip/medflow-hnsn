// ═══════════════════════════════════════════════════════════
// CONSULTAS — a aba de pesquisa
//
// "Consultas" é o nome que o MV usa para as telas de PESQUISA, e era o que
// faltava no módulo: construímos o fazer e quase nada do achar.
//
// ⚠️ ESTA TELA NÃO É PRONTUÁRIO, E ISSO APARECE NELA.
// O perfil da recepção não acessa o Paciente 360 de propósito — é a
// separação entre informação administrativa e clínica que a COFEN 754/2024,
// art. 6º, manda existir. Então aqui se responde QUANDO veio, QUAL
// especialidade, QUEM pagou e COMO terminou. Diagnóstico, queixa e sinais
// vitais não aparecem, e o rodapé diz isso em voz alta — para ninguém achar
// que a tela está incompleta e sair pedindo o campo que falta.
//
// As regras estão em `consultas.js` (puras, testadas).
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { comoExibir, idadeDetalhada } from "../pacientes/identidade.js";
import {
  MODOS, MAX_DIAS_PERIODO, validarPeriodo, bordasDoPeriodo,
  ultimoAtendimento, resumoDoHistorico, rotuloDoEpisodio, agruparPorAno,
} from "./consultas.js";
import { ORIGENS_MARCACAO, STATUS_AGENDAMENTO } from "./agenda.js";
import { atendimentoAberto } from "./ciclo.js";
import {
  buscarPacientes, historicoDoPaciente, agendamentosFuturos,
  atendimentosDoPeriodo, atendimentoPorNumero, carregarCatalogos,
} from "./dados.js";

const cartao = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.1rem 1.25rem", marginBottom: 14 };
const rotulo = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 };
const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
const lbl = { fontSize: 10.5, color: "var(--text-muted)", display: "block", marginBottom: 3 };
const btn = (cor, ativo = true) => ({
  background: ativo ? cor : "var(--surface-2)", color: ativo ? "#000" : "var(--text-muted)",
  border: ativo ? "none" : "1px solid var(--border)", borderRadius: 6, padding: "8px 15px",
  fontWeight: 700, cursor: ativo ? "pointer" : "not-allowed", fontSize: 12.5, whiteSpace: "nowrap",
});

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const menos30 = () => {
  const d = new Date(); d.setDate(d.getDate() - 30);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dataBR = s => (s ? new Date(String(s).slice(0, 10) + "T00:00:00").toLocaleDateString("pt-BR") : "—");

/** Uma linha do histórico. Sem dado clínico, por desenho. */
function LinhaEpisodio({ a, nomeEspec, nomeConvenio }) {
  return (
    <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap",
                  background: "var(--surface-2)", border: "1px solid var(--border)",
                  borderLeft: `3px solid ${atendimentoAberto(a) ? "#22d3ee" : a.status === "cancelado" ? "#f43f5e" : "var(--border)"}`,
                  borderRadius: 8, padding: "8px 11px",
                  opacity: a.status === "cancelado" ? 0.6 : 1 }}>
      <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", minWidth: 46 }}>#{a.id}</span>
      <span style={{ fontSize: 12.5, minWidth: 92 }}>{dataBR(a.chegada_em)}</span>
      <span style={{ fontSize: 11.5, color: "var(--text-muted)", minWidth: 84 }}>
        {a.tipo_atendimento || "emergência"}
      </span>
      <span style={{ fontSize: 11.5, color: "var(--text-muted)", minWidth: 96 }}>
        {a.especialidade_cod ? nomeEspec(a.especialidade_cod) : "—"}
      </span>
      <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
        {a.convenio_id ? nomeConvenio(a.convenio_id) : "sem convênio"}
      </span>
      {a.medico && <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{a.medico}</span>}
      <span style={{ fontSize: 11, fontWeight: 700, marginLeft: "auto",
                     color: a.status === "cancelado" ? "#f43f5e" : atendimentoAberto(a) ? "#22d3ee" : "var(--text-muted)" }}>
        {rotuloDoEpisodio(a)}
      </span>
    </div>
  );
}

export default function Consultas({ sb }) {
  // Carrega o próprio catálogo, como as outras abas. É só para traduzir
  // código em nome ("ORTOPEDIA" → "Ortopedia") — se falhar, a tela mostra o
  // código cru em vez de quebrar.
  const [catalogos, setCatalogos] = useState({});
  useEffect(() => {
    let vivo = true;
    carregarCatalogos(sb).then(c => { if (vivo) setCatalogos(c); });
    return () => { vivo = false; };
  }, [sb]);

  const [modo, setModo] = useState("paciente");
  const [msg, setMsg] = useState(null);
  const [buscando, setBuscando] = useState(false);

  // por paciente
  const [termo, setTermo] = useState("");
  const [achados, setAchados] = useState([]);
  const [paciente, setPaciente] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [futuros, setFuturos] = useState([]);
  const [filtroEspec, setFiltroEspec] = useState("");

  // por período
  const [de, setDe] = useState(menos30());
  const [ate, setAte] = useState(hojeISO());
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [doPeriodo, setDoPeriodo] = useState(null);

  // por número
  const [numero, setNumero] = useState("");
  const [achadoNum, setAchadoNum] = useState(null);

  const nomeEspec = useCallback(cod =>
    (catalogos.especialidade || []).find(e => e.codigo === cod)?.nome || cod, [catalogos]);
  const nomeConvenio = useCallback(id =>
    (catalogos.convenios || []).find(c => String(c.id) === String(id))?.nome || `convênio ${id}`, [catalogos]);

  function trocarModo(m) {
    setModo(m); setMsg(null);
    setAchados([]); setDoPeriodo(null); setAchadoNum(null);
  }

  async function procurarPaciente() {
    setMsg(null);
    const r = await buscarPacientes(sb, termo);
    if (!r.length) { setMsg({ tom: "erro", texto: "Nenhum paciente encontrado com esse dado." }); return; }
    if (r.length === 1) { abrirPaciente(r[0]); return; }
    setAchados(r);
  }

  async function abrirPaciente(p) {
    setBuscando(true); setAchados([]); setMsg(null);
    const [h, f] = await Promise.all([
      historicoDoPaciente(sb, p.prontuario),
      agendamentosFuturos(sb, p.prontuario),
    ]);
    setPaciente(p); setHistorico(h); setFuturos(f); setFiltroEspec("");
    setBuscando(false);
  }

  async function pesquisarPeriodo() {
    const v = validarPeriodo({ de, ate });
    if (!v.ok) { setMsg({ tom: "erro", texto: v.erros.join(" ") }); return; }
    const b = bordasDoPeriodo({ de, ate });
    setBuscando(true); setMsg(null);
    setDoPeriodo(await atendimentosDoPeriodo(sb, { ...b, tipo: tipoFiltro || undefined }));
    setBuscando(false);
  }

  async function pesquisarNumero() {
    setMsg(null);
    const r = await atendimentoPorNumero(sb, numero);
    if (!r) { setMsg({ tom: "erro", texto: `Não existe atendimento com o número ${numero}.` }); setAchadoNum(null); return; }
    setAchadoNum(r);
  }

  const resumo = paciente ? resumoDoHistorico(historico) : null;
  const ultimo = paciente ? ultimoAtendimento(historico, { especialidade: filtroEspec || undefined }) : null;
  const porAno = agruparPorAno(
    filtroEspec ? historico.filter(a => a.especialidade_cod === filtroEspec) : historico);

  const rodape = (
    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 12, lineHeight: 1.6 }}>
      Esta pesquisa mostra o <strong>histórico de episódios</strong> — quando, qual especialidade,
      quem pagou e como terminou. <strong>Não mostra diagnóstico, queixa nem sinais vitais:</strong> isso é
      prontuário, e vive no Paciente 360, para quem tem direito a ele (COFEN 754/2024, art. 6º).
    </div>
  );

  return (
    <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Atendimento — Consultas</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
        Onde a recepção responde "esse paciente já veio? quando? o que ele tem marcado?" sem precisar
        abrir prontuário.
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {MODOS.map(m => (
          <button key={m.chave} onClick={() => trocarModo(m.chave)} title={m.dica}
            style={{ ...btn(modo === m.chave ? "#22d3ee" : "var(--surface-2)", modo === m.chave),
                     color: modo === m.chave ? "#000" : "var(--text)" }}>{m.label}</button>
        ))}
      </div>

      {msg && (
        <div style={{ ...cartao, borderLeft: `4px solid ${msg.tom === "erro" ? "#f43f5e" : "#34d399"}`,
                      background: msg.tom === "erro" ? "#f43f5e10" : "#34d39910", fontSize: 13 }}>
          {msg.texto}
        </div>
      )}

      {/* ══════════ POR PACIENTE ══════════ */}
      {modo === "paciente" && (
        <>
          <div style={cartao}>
            <div style={rotulo}>Quem</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input value={termo} onChange={e => setTermo(e.target.value)}
                onKeyDown={e => e.key === "Enter" && procurarPaciente()}
                placeholder="Nome, nome da mãe, CPF, Cartão SUS ou prontuário"
                style={{ ...inp, flex: 1, minWidth: 250 }} />
              <button onClick={procurarPaciente} disabled={buscando} style={btn("#22d3ee", !buscando)}>
                {buscando ? "Procurando…" : "Procurar"}
              </button>
            </div>
            {achados.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                {achados.map(p => (
                  <button key={p.prontuario} onClick={() => abrirPaciente(p)}
                    style={{ ...btn("var(--surface-2)", false), color: "var(--text)" }}>
                    {comoExibir(p) || p.iniciais} · reg. {p.prontuario}
                    {p.data_nascimento ? ` · ${dataBR(p.data_nascimento)}` : ""}
                  </button>
                ))}
              </div>
            )}
          </div>

          {paciente && (
            <>
              <div style={cartao}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                  <strong style={{ fontSize: 16 }}>{comoExibir(paciente, { completo: true }) || paciente.iniciais}</strong>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>reg. {paciente.prontuario}</span>
                  {(() => {
                    const i = idadeDetalhada(paciente.data_nascimento);
                    return i ? <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{i.rotulo}</span> : null;
                  })()}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
                  {[
                    ["Episódios", resumo.total, "#6366f1"],
                    ["Em aberto", resumo.abertos, resumo.abertos ? "#d97706" : "#34d399"],
                    ["Cancelados", resumo.cancelados, "var(--text-muted)"],
                    ["Primeira vez", dataBR(resumo.primeira), "#0d9488"],
                    ["Última vez", dataBR(resumo.ultima), "#22d3ee"],
                  ].map(([l, v, cor]) => (
                    <div key={l} style={{ background: "var(--surface-2)", border: "1px solid var(--border)",
                                          borderLeft: `3px solid ${cor}`, borderRadius: 8, padding: "8px 11px" }}>
                      <div style={{ fontSize: 9.5, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>{l}</div>
                      <div style={{ fontSize: typeof v === "number" ? 20 : 14, fontWeight: 800, color: cor,
                                    fontFamily: "JetBrains Mono, monospace", marginTop: 2 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── ÚLTIMO ATENDIMENTO: o que faz "retorno" significar algo ── */}
              <div style={{ ...cartao, borderLeft: "4px solid #0d9488" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 200 }}>
                    <label style={lbl}>Última consulta na especialidade</label>
                    <select value={filtroEspec} onChange={e => setFiltroEspec(e.target.value)} style={inp}>
                      <option value="">qualquer especialidade</option>
                      {(catalogos.especialidade || []).map(e => (
                        <option key={e.codigo} value={e.codigo}>{e.nome}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ fontSize: 13, paddingBottom: 8 }}>
                    {ultimo
                      ? <>Foi em <strong>{dataBR(ultimo.data)}</strong>
                          {ultimo.diasAtras != null && <> — há <strong>{ultimo.diasAtras} dia(s)</strong></>}
                          {" "}(atendimento #{ultimo.atendimento.id})</>
                      : <span style={{ color: "var(--text-muted)" }}>Nunca veio {filtroEspec ? "nesta especialidade" : ""}.</span>}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.55 }}>
                  É o dado que decide se a consulta de hoje é primeira ou retorno. O sistema mostra o fato
                  e <strong>não afirma se ainda vale como retorno</strong> — o prazo é do contrato do convênio
                  ou da norma do hospital, e quem conhece é você. Atendimento cancelado não conta como visita.
                </div>
              </div>

              {futuros.length > 0 && (
                <div style={{ ...cartao, borderLeft: "4px solid #6366f1" }}>
                  <div style={rotulo}>Marcado à frente ({futuros.length})</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {futuros.map(g => (
                      <div key={g.id} style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap",
                                               background: "var(--surface-2)", border: "1px solid var(--border)",
                                               borderRadius: 8, padding: "8px 11px", fontSize: 12.5 }}>
                        <span style={{ fontWeight: 700, minWidth: 92 }}>{dataBR(g.data)}</span>
                        <span style={{ fontFamily: "JetBrains Mono, monospace", minWidth: 46 }}>
                          {g.hora ? String(g.hora).slice(0, 5) : "fila"}
                        </span>
                        <span>{nomeEspec(g.especialidade_cod)}</span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          {ORIGENS_MARCACAO[g.origem_marcacao]?.label}
                          {g.protocolo_regulacao ? ` · ${g.protocolo_regulacao}` : ""}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, marginLeft: "auto", color: "var(--text-muted)" }}>
                          {STATUS_AGENDAMENTO[g.status]?.label}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 9 }}>
                    Confira aqui antes de marcar de novo — é o que evita a mesma pessoa ocupando duas vagas
                    da mesma especialidade e faltando numa delas.
                  </div>
                </div>
              )}

              <div style={cartao}>
                <div style={rotulo}>
                  Histórico de episódios
                  {filtroEspec ? ` — ${nomeEspec(filtroEspec)}` : ""}
                </div>
                {porAno.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: "var(--text-muted)", padding: "1rem",
                                border: "1px dashed var(--border)", borderRadius: 8 }}>
                    Nenhum episódio {filtroEspec ? "nesta especialidade" : "registrado"}.
                  </div>
                ) : porAno.map(g => (
                  <div key={g.ano} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>
                      {g.ano} · {g.itens.length} episódio(s)
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {g.itens.map(a => (
                        <LinhaEpisodio key={a.id} a={a} nomeEspec={nomeEspec} nomeConvenio={nomeConvenio} />
                      ))}
                    </div>
                  </div>
                ))}
                {rodape}
              </div>
            </>
          )}
        </>
      )}

      {/* ══════════ POR PERÍODO ══════════ */}
      {modo === "periodo" && (
        <>
          <div style={cartao}>
            <div style={rotulo}>Quando</div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ width: 160 }}>
                <label style={lbl}>De</label>
                <input type="date" value={de} onChange={e => setDe(e.target.value)} style={inp} />
              </div>
              <div style={{ width: 160 }}>
                <label style={lbl}>Até</label>
                <input type="date" value={ate} onChange={e => setAte(e.target.value)} style={inp} />
              </div>
              <div style={{ width: 170 }}>
                <label style={lbl}>Tipo</label>
                <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)} style={inp}>
                  <option value="">todos</option>
                  <option value="emergencia">Emergência</option>
                  <option value="ambulatorial">Ambulatorial</option>
                </select>
              </div>
              <button onClick={pesquisarPeriodo} disabled={buscando} style={{ ...btn("#22d3ee", !buscando), marginBottom: 1 }}>
                {buscando ? "Pesquisando…" : "Pesquisar"}
              </button>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
              O período vai até {MAX_DIAS_PERIODO} dias. Não é limite técnico: lista de balcão com anos de
              atendimento expõe muito mais gente do que a pergunta pedia, e ninguém lê. Para série
              histórica existe relatório.
            </div>
          </div>

          {doPeriodo && (
            <div style={cartao}>
              <div style={rotulo}>{doPeriodo.length} atendimento(s) entre {dataBR(de)} e {dataBR(ate)}</div>
              {doPeriodo.length === 0 ? (
                <div style={{ fontSize: 12.5, color: "var(--text-muted)", padding: "1rem",
                              border: "1px dashed var(--border)", borderRadius: 8 }}>
                  Nenhum atendimento neste período.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {doPeriodo.map(a => (
                    <LinhaEpisodio key={a.id} a={a} nomeEspec={nomeEspec} nomeConvenio={nomeConvenio} />
                  ))}
                </div>
              )}
              {rodape}
            </div>
          )}
        </>
      )}

      {/* ══════════ POR NÚMERO ══════════ */}
      {modo === "numero" && (
        <>
          <div style={cartao}>
            <div style={rotulo}>Número do atendimento</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input value={numero} onChange={e => setNumero(e.target.value)}
                onKeyDown={e => e.key === "Enter" && pesquisarNumero()}
                placeholder="Ex.: 72" style={{ ...inp, width: 180 }} />
              <button onClick={pesquisarNumero} style={btn("#22d3ee")}>Procurar</button>
            </div>
          </div>
          {achadoNum && (
            <div style={cartao}>
              <div style={rotulo}>Atendimento #{achadoNum.id}</div>
              <LinhaEpisodio a={achadoNum} nomeEspec={nomeEspec} nomeConvenio={nomeConvenio} />
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 10 }}>
                Paciente: <strong>reg. {achadoNum.prontuario}</strong>
                {achadoNum.agendamento_id ? ` · nasceu do agendamento #${achadoNum.agendamento_id}` : ""}
                {achadoNum.setor_destino ? ` · destino: ${achadoNum.setor_destino}` : ""}
              </div>
              {rodape}
            </div>
          )}
        </>
      )}
    </div>
  );
}
