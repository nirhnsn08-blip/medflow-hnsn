// ═══════════════════════════════════════════════════════════
// AGENDA DO AMBULATÓRIO — o painel do dia e a grade
//
// DUAS TELAS, DOIS TRABALHOS
//   Dia   — a recepção, todo dia: quem chegou, quem faltou, quem entra na
//           fila. É onde o atendimento nasce.
//   Grade — o gestor, algumas vezes por ano: quantas vagas a especialidade
//           oferece e como elas se dividem entre regulação, marcação
//           interna e ordem de chegada.
//
// A DIFERENÇA QUE A TELA TEM QUE DEIXAR ÓBVIA
// Marcar e transcrever não são o mesmo botão. "Marcar" é o hospital
// decidindo (retorno, convênio, particular). "Registrar da regulação" é a
// recepção copiando o que a central decidiu — e por isso exige o protocolo
// do papel que o paciente trouxe. Um botão só para as duas coisas seria a
// porta para ocupar cota da regulação com paciente do hospital.
//
// As regras estão em `agenda.js` (puras, testadas). Aqui só há tela.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { comoExibir } from "../pacientes/identidade.js";
import {
  ORIGENS_MARCACAO, STATUS_AGENDAMENTO, gradesDoDia, vagasDoDia, horariosLivres,
  validarGrade, podeMarcar, podeRegistrarDaRegulacao, producaoDoDia, bloqueioDoDia,
  horariosDaGrade, cotasSomadas,
} from "./agenda.js";
import {
  DESFECHOS_AMBULATORIAL, validarEncerramento, STATUS_ATENDIMENTO,
} from "./ciclo.js";
import {
  listarAmbulatoriaisAbertos, encerrarAtendimento,
  carregarGrades, salvarGrade, alternarAtivoGrade, carregarBloqueios, salvarBloqueio,
  carregarAgendaDoDia, marcarAgendamento, confirmarPresenca, registrarFalta,
  cancelarAgendamento, vincularPacienteAoAgendamento, carregarCatalogos,
  carregarProfissionais, buscarPacientes,
} from "./dados.js";

const cartao = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.1rem 1.25rem", marginBottom: 14 };
const rotulo = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 };
const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
const lbl = { fontSize: 10.5, color: "var(--text-muted)", display: "block", marginBottom: 3 };
const btn = (cor, ativo = true) => ({
  background: ativo ? cor : "var(--surface-2)", color: ativo ? "#000" : "var(--text-muted)",
  border: ativo ? "none" : "1px solid var(--border)", borderRadius: 6, padding: "7px 13px",
  fontWeight: 700, cursor: ativo ? "pointer" : "not-allowed", fontSize: 12, whiteSpace: "nowrap",
});

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const hojeISO = () => {
  // Data local, não UTC: `toISOString()` num fim de tarde no Brasil devolve
  // o dia seguinte, e a agenda abriria no dia errado.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const CORES_ORIGEM = { regulacao: "#6366f1", interna: "#0d9488", chegada: "#d97706" };

export default function Agenda({ sb, currentUser, canEdit }) {
  const [vista, setVista] = useState("dia");
  const [data, setData] = useState(hojeISO());

  const [grades, setGrades] = useState([]);
  const [bloqueios, setBloqueios] = useState([]);
  const [agendamentos, setAgendamentos] = useState([]);
  const [catalogos, setCatalogos] = useState({});
  const [profissionais, setProfissionais] = useState([]);

  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [carregando, setCarregando] = useState(true);

  // formulários
  const [nova, setNova] = useState(null);        // grade em edição
  const [bloq, setBloq] = useState(null);        // bloqueio em edição
  const [marcando, setMarcando] = useState(null); // { grade, origem }
  const [buscaPac, setBuscaPac] = useState("");
  const [achados, setAchados] = useState([]);
  const [ambAbertos, setAmbAbertos] = useState([]);
  const [verAbertos, setVerAbertos] = useState(false);

  const recarregarDia = useCallback(async () => {
    setCarregando(true);
    const [g, b, a] = await Promise.all([
      carregarGrades(sb),
      carregarBloqueios(sb, { de: data, ate: data }),
      carregarAgendaDoDia(sb, data),
    ]);
    setGrades(g); setBloqueios(b); setAgendamentos(a);
    setAmbAbertos(await listarAmbulatoriaisAbertos(sb));
    setCarregando(false);
  }, [sb, data]);

  /**
   * Encerra um ambulatorial que ficou preso aberto.
   *
   * O desfecho é PERGUNTADO, nunca deduzido. Encerrar em massa como
   * "atendido" escolheria um dado assistencial que ninguém conferiu — e
   * quem sabe se o paciente foi atendido ou desistiu é quem estava lá.
   */
  async function encerrar(a) {
    if (!canEdit) return;
    const opcoes = DESFECHOS_AMBULATORIAL.map((d, i) => `${i + 1} - ${d.label}`).join("\n");
    const escolha = prompt(`Como terminou o atendimento #${a.id} (reg. ${a.prontuario})?\n\n${opcoes}\n\nDigite o número:`);
    if (escolha === null) return;
    const d = DESFECHOS_AMBULATORIAL[Number(escolha) - 1];
    const v = validarEncerramento({ atendimento: a, desfecho: d?.chave });
    if (!v.ok) { setMsg({ tom: "erro", texto: v.erros.join(" ") }); return; }
    setBusy(true);
    const r = await encerrarAtendimento(sb, a.id, d.chave, null, currentUser);
    setBusy(false);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    setMsg({ tom: "ok", texto: `Atendimento #${a.id} encerrado como "${d.label}".` });
    recarregarDia();
  }

  useEffect(() => { recarregarDia(); }, [recarregarDia]);

  useEffect(() => {
    Promise.all([carregarCatalogos(sb), carregarProfissionais(sb)])
      .then(([c, p]) => { setCatalogos(c); setProfissionais(p); });
  }, [sb]);

  const aplicaveis = gradesDoDia(grades, data);
  const producao = producaoDoDia({ grades, data, agendamentos, bloqueios });
  const bloqueioGeral = bloqueioDoDia(bloqueios, data, {});

  // ── ações ──
  async function marcar() {
    if (!canEdit || busy || !marcando) return;
    const { grade, origem, hora, prontuario, protocolo, tipo, observacao } = marcando;
    const v = origem === "regulacao"
      ? podeRegistrarDaRegulacao({ grade, data, hora, protocolo, agendamentos, bloqueios })
      : podeMarcar({ grade, data, hora, origem, agendamentos, bloqueios });
    if (!v.ok) { setMsg({ tom: "erro", texto: v.erros.join(" ") }); return; }
    if (v.avisos.length && !confirm(v.avisos.join("\n\n") + "\n\nSeguir?")) return;

    setBusy(true);
    const r = await marcarAgendamento(sb, {
      data, hora, especialidade_cod: grade.especialidade_cod,
      profissional_username: grade.profissional_username, grade_id: grade.id,
      prontuario, origem_marcacao: origem, tipo_atendimento_cod: tipo,
      protocolo_regulacao: protocolo, observacao,
    }, currentUser);
    setBusy(false);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    setMarcando(null); setBuscaPac(""); setAchados([]);
    setMsg({ tom: "ok", texto: "Vaga registrada." });
    recarregarDia();
  }

  async function darPresenca(a) {
    if (!canEdit) return;
    if (!a.prontuario) {
      setMsg({ tom: "erro", texto: "Esta vaga está reservada sem paciente. Use \"Quem veio?\" para dizer quem chegou antes de dar presença." });
      return;
    }
    setBusy(true);
    const r = await confirmarPresenca(sb, a, {
      paciente: { prontuario: a.prontuario, iniciais: "?" },
      ficha: { tipo_atendimento_cod: a.tipo_atendimento_cod, especialidade_cod: a.especialidade_cod },
    }, currentUser);
    setBusy(false);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    setMsg({ tom: r.aviso ? "erro" : "ok",
             texto: r.aviso || `Presença confirmada — atendimento ${r.atendimento.id} aberto.` });
    recarregarDia();
  }

  async function vincular(a) {
    if (!canEdit) return;
    const p = prompt("Número do prontuário de quem veio:");
    if (!p) return;
    const r = await vincularPacienteAoAgendamento(sb, a.id, p, undefined, currentUser);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    recarregarDia();
  }

  async function faltar(a) {
    if (!canEdit || !confirm("Registrar FALTA?\n\nA vaga volta a ficar livre para quem remarcar, e a falta entra no indicador de absenteísmo.")) return;
    const r = await registrarFalta(sb, a.id, currentUser);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    recarregarDia();
  }

  async function cancelar(a) {
    if (!canEdit) return;
    const motivo = prompt("Motivo do cancelamento:");
    if (motivo === null) return;
    const r = await cancelarAgendamento(sb, a.id, motivo, currentUser);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    recarregarDia();
  }

  async function salvarAGrade() {
    if (!canEdit || busy) return;
    const v = validarGrade(nova);
    if (!v.ok) { setMsg({ tom: "erro", texto: v.erros.join(" ") }); return; }
    setBusy(true);
    const r = await salvarGrade(sb, nova, currentUser);
    setBusy(false);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    setNova(null); setMsg({ tom: "ok", texto: "Grade salva." });
    recarregarDia();
  }

  async function salvarOBloqueio() {
    if (!canEdit || busy) return;
    if (!bloq?.data_inicio || !String(bloq?.motivo ?? "").trim()) {
      setMsg({ tom: "erro", texto: "Informe a data e o motivo do bloqueio." }); return;
    }
    setBusy(true);
    const r = await salvarBloqueio(sb, bloq, currentUser);
    setBusy(false);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    setBloq(null); setMsg({ tom: "ok", texto: "Bloqueio registrado." });
    recarregarDia();
  }

  async function procurarPaciente() {
    setAchados(await buscarPacientes(sb, buscaPac));
  }

  const espec = cod => (catalogos.especialidade || []).find(e => e.codigo === cod)?.nome || cod;
  const prof = u => profissionais.find(p => p.username === u)?.nome || u;

  return (
    <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Atendimento — Agenda do Ambulatório</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
        A vaga tem dono: <strong>regulação</strong> (a central marca, o hospital recebe),
        <strong> marcação interna</strong> (retorno, convênio, particular) e <strong>ordem de chegada</strong>.
        Marcar numa vaga que não é sua faz dois pacientes chegarem para o mesmo horário.
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["dia", "Dia"], ["grade", "Grade e bloqueios"]].map(([k, l]) => (
          <button key={k} onClick={() => { setVista(k); setMsg(null); }}
            style={{ ...btn(vista === k ? "#22d3ee" : "var(--surface-2)", vista === k),
                     color: vista === k ? "#000" : "var(--text)" }}>{l}</button>
        ))}
      </div>

      {msg && (
        <div style={{ ...cartao, borderLeft: `4px solid ${msg.tom === "erro" ? "#f43f5e" : "#34d399"}`,
                      background: msg.tom === "erro" ? "#f43f5e10" : "#34d39910", fontSize: 13 }}>
          {msg.texto}
        </div>
      )}

      {/* ── PENDÊNCIA DE ENCERRAMENTO ── */}
      {ambAbertos.length > 0 && (
        <div style={{ ...cartao, borderLeft: "4px solid #d97706" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 13 }}>
              {ambAbertos.length} atendimento(s) ambulatorial(is) aguardando encerramento
            </strong>
            <button onClick={() => setVerAbertos(v => !v)}
              style={{ ...btn("#d97706"), marginLeft: "auto", color: "#fff" }}>
              {verAbertos ? "Ocultar" : "Ver lista"}
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 7, lineHeight: 1.5 }}>
            Consulta que não é encerrada continua contando como atendimento em aberto — e faz o aviso de
            duplicidade disparar na próxima visita do paciente. Aviso que sempre dispara é aviso que
            ninguém lê.
          </div>
          {verAbertos && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 10 }}>
              {ambAbertos.map(a => (
                <div key={a.id} style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap",
                                         background: "var(--surface-2)", border: "1px solid var(--border)",
                                         borderRadius: 8, padding: "8px 11px" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, minWidth: 52 }}>#{a.id}</span>
                  <span style={{ fontSize: 12.5, minWidth: 90 }}>reg. {a.prontuario}</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {a.especialidade_cod ? espec(a.especialidade_cod) : "—"} · {STATUS_ATENDIMENTO[a.status]?.label || a.status}
                    {" · desde "}{new Date(a.chegada_em).toLocaleDateString("pt-BR")}
                  </span>
                  {canEdit && (
                    <button onClick={() => encerrar(a)} disabled={busy}
                      style={{ ...btn("#0d9488", !busy), marginLeft: "auto", color: "#fff", padding: "4px 10px", fontSize: 11 }}>
                      Encerrar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════ DIA ══════════ */}
      {vista === "dia" && (
        <>
          <div style={cartao}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ width: 170 }}>
                <label style={lbl}>Dia</label>
                <input type="date" value={data} onChange={e => setData(e.target.value)} style={inp} />
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", paddingBottom: 8 }}>
                {DIAS[new Date(data + "T00:00:00").getDay()] || "—"}
              </div>
              <button onClick={() => setData(hojeISO())} style={{ ...btn("var(--surface-2)", false), color: "var(--text)", marginBottom: 2 }}>Hoje</button>
            </div>

            {bloqueioGeral && (
              <div style={{ marginTop: 10, padding: "9px 12px", borderRadius: 8, fontSize: 12.5,
                            background: "#f43f5e10", border: "1px solid #f43f5e55" }}>
                <strong>Dia bloqueado:</strong> {bloqueioGeral.motivo}. Nenhuma vaga é ofertada.
              </div>
            )}

            {/* produção — o que hoje é digitado à mão */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, marginTop: 12 }}>
              {[
                ["Ofertadas", producao.ofertadas, "#6366f1"],
                ["Realizadas", producao.realizadas, "#0d9488"],
                ["Faltas", producao.faltas, "#f43f5e"],
                ["Livres", producao.livres, "#22d3ee"],
                ["Absenteísmo", producao.absenteismo == null ? "—" : `${producao.absenteismo}%`, "#d97706"],
              ].map(([l, v, cor]) => (
                <div key={l} style={{ background: "var(--surface-2)", border: "1px solid var(--border)",
                                      borderLeft: `3px solid ${cor}`, borderRadius: 8, padding: "8px 11px" }}>
                  <div style={{ fontSize: 9.5, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>{l}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: cor, fontFamily: "JetBrains Mono, monospace" }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
              Estes números saem da agenda — não são digitados. Ofertadas vem da grade; realizadas, de quem teve presença confirmada.
            </div>
          </div>

          {carregando ? (
            <div style={{ ...cartao, fontSize: 13, color: "var(--text-muted)" }}>Carregando o dia…</div>
          ) : aplicaveis.length === 0 ? (
            <div style={{ ...cartao, fontSize: 12.5, color: "var(--text-muted)" }}>
              Nenhuma grade nesta data. Cadastre em <strong>Grade e bloqueios</strong> — sem grade não há vaga para marcar
              nem para receber da regulação.
            </div>
          ) : aplicaveis.map(g => {
            const vagas = vagasDoDia(g, data, agendamentos);
            const bloqueado = bloqueioDoDia(bloqueios, data, {
              especialidade: g.especialidade_cod, profissional: g.profissional_username });
            const doDia = agendamentos.filter(a => a.especialidade_cod === g.especialidade_cod);
            return (
              <div key={g.id} style={cartao}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                  <strong style={{ fontSize: 14 }}>{espec(g.especialidade_cod)}</strong>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {String(g.hora_inicio).slice(0, 5)}–{String(g.hora_fim).slice(0, 5)} · {g.duracao_min}min
                    {g.profissional_username ? ` · ${prof(g.profissional_username)}` : ""}
                  </span>
                  {bloqueado && <span style={{ fontSize: 11, fontWeight: 800, color: "#f43f5e" }}>BLOQUEADO — {bloqueado.motivo}</span>}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  {Object.entries(ORIGENS_MARCACAO).map(([k, cfg]) => (
                    <div key={k} style={{ background: "var(--surface-2)", border: "1px solid var(--border)",
                                          borderLeft: `3px solid ${CORES_ORIGEM[k]}`, borderRadius: 8, padding: "7px 11px", minWidth: 150 }}>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>{cfg.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        {vagas[k].ocupadas}/{vagas[k].total}
                        <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 11.5 }}> · {vagas[k].livres} livre(s)</span>
                      </div>
                      {canEdit && !bloqueado && vagas[k].livres > 0 && (
                        <button onClick={() => setMarcando({ grade: g, origem: k, hora: "", prontuario: "", protocolo: "", tipo: "" })}
                          style={{ ...btn(CORES_ORIGEM[k]), marginTop: 6, padding: "4px 9px", fontSize: 11, color: "#fff" }}>
                          {k === "regulacao" ? "Registrar da regulação" : k === "chegada" ? "+ Fila de chegada" : "+ Marcar"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {doDia.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: "var(--text-muted)", padding: "0.8rem",
                                border: "1px dashed var(--border)", borderRadius: 8 }}>
                    Ninguém registrado nesta especialidade hoje.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {doDia.map(a => (
                      <div key={a.id} style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap",
                                               background: "var(--surface-2)", border: "1px solid var(--border)",
                                               borderLeft: `3px solid ${CORES_ORIGEM[a.origem_marcacao]}`,
                                               borderRadius: 8, padding: "8px 11px",
                                               opacity: STATUS_AGENDAMENTO[a.status]?.vivo ? 1 : 0.55 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", minWidth: 48 }}>
                          {a.hora ? String(a.hora).slice(0, 5) : "fila"}
                        </span>
                        <span style={{ fontSize: 12.5, minWidth: 90 }}>
                          {a.prontuario ? `reg. ${a.prontuario}` : <em style={{ color: "var(--text-muted)" }}>vaga reservada</em>}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          {ORIGENS_MARCACAO[a.origem_marcacao]?.label}
                          {a.protocolo_regulacao ? ` · ${a.protocolo_regulacao}` : ""}
                          {a.tipo_atendimento_cod ? ` · ${a.tipo_atendimento_cod.replace(/_/g, " ")}` : ""}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 800, marginLeft: "auto",
                                       color: a.status === "presente" ? "#0d9488" : a.status === "falta" ? "#f43f5e" : "var(--text-muted)" }}>
                          {STATUS_AGENDAMENTO[a.status]?.label?.toUpperCase()}
                        </span>
                        {canEdit && a.status === "agendado" && (
                          <>
                            {!a.prontuario && (
                              <button onClick={() => vincular(a)} style={{ ...btn("#6366f1"), color: "#fff", padding: "4px 9px", fontSize: 11 }}>Quem veio?</button>
                            )}
                            <button onClick={() => darPresenca(a)} disabled={busy}
                              style={{ ...btn("#0d9488", !busy), color: "#fff", padding: "4px 9px", fontSize: 11 }}>Presença</button>
                            <button onClick={() => faltar(a)} style={{ ...btn("var(--surface-2)", false), color: "var(--text)", padding: "4px 9px", fontSize: 11 }}>Falta</button>
                            <button onClick={() => cancelar(a)} style={{ ...btn("var(--surface-2)", false), color: "var(--text)", padding: "4px 9px", fontSize: 11 }}>Cancelar</button>
                          </>
                        )}
                        {a.atendimento_id && (
                          <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>atend. #{a.atendimento_id}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* ── formulário de marcação ── */}
          {marcando && (
            <div style={{ ...cartao, borderLeft: `4px solid ${CORES_ORIGEM[marcando.origem]}` }}>
              <div style={rotulo}>
                {marcando.origem === "regulacao" ? "Registrar vaga da regulação"
                  : marcando.origem === "chegada" ? "Entrada por ordem de chegada" : "Marcar consulta"}
                {" — "}{espec(marcando.grade.especialidade_cod)}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10 }}>
                {ORIGENS_MARCACAO[marcando.origem].quem}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
                {marcando.origem !== "chegada" && (
                  <div>
                    <label style={lbl}>Horário *</label>
                    <select value={marcando.hora} onChange={e => setMarcando(p => ({ ...p, hora: e.target.value }))} style={inp}>
                      <option value="">—</option>
                      {horariosLivres(marcando.grade, data, agendamentos).map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                )}
                {marcando.origem === "regulacao" && (
                  <div>
                    <label style={lbl}>Protocolo da regulação *</label>
                    <input value={marcando.protocolo} onChange={e => setMarcando(p => ({ ...p, protocolo: e.target.value }))}
                      style={inp} placeholder="o número do papel do paciente" />
                    <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3 }}>
                      Obrigatório: é o que comprova que a vaga foi marcada pela central.
                    </div>
                  </div>
                )}
                <div>
                  <label style={lbl}>Tipo de atendimento</label>
                  <select value={marcando.tipo} onChange={e => setMarcando(p => ({ ...p, tipo: e.target.value }))} style={inp}>
                    <option value="">—</option>
                    {(catalogos.tipo_atendimento || []).map(t => <option key={t.codigo} value={t.codigo}>{t.nome}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <label style={lbl}>Paciente {marcando.origem === "regulacao" ? "(pode ficar em branco até ele chegar)" : "*"}</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input value={buscaPac} onChange={e => setBuscaPac(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && procurarPaciente()}
                    placeholder="Nome, CPF, Cartão SUS ou prontuário" style={{ ...inp, flex: 1, minWidth: 220 }} />
                  <button onClick={procurarPaciente} style={btn("#22d3ee")}>Procurar</button>
                </div>
                {marcando.prontuario && (
                  <div style={{ fontSize: 12.5, marginTop: 7 }}>
                    Escolhido: <strong>reg. {marcando.prontuario}</strong>
                    <button onClick={() => setMarcando(p => ({ ...p, prontuario: "" }))}
                      style={{ ...btn("var(--surface-2)", false), color: "var(--text)", marginLeft: 8, padding: "3px 8px", fontSize: 11 }}>trocar</button>
                  </div>
                )}
                {achados.length > 0 && !marcando.prontuario && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
                    {achados.map(p => (
                      <button key={p.prontuario}
                        onClick={() => { setMarcando(x => ({ ...x, prontuario: p.prontuario })); setAchados([]); }}
                        style={{ ...btn("var(--surface-2)", false), color: "var(--text)" }}>
                        {comoExibir(p) || p.iniciais} · reg. {p.prontuario}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button onClick={marcar} disabled={busy} style={btn("#22d3ee", !busy)}>
                  {busy ? "Registrando…" : "Registrar"}
                </button>
                <button onClick={() => { setMarcando(null); setAchados([]); setBuscaPac(""); }}
                  style={{ ...btn("var(--surface-2)", false), color: "var(--text)" }}>Cancelar</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════ GRADE ══════════ */}
      {vista === "grade" && (
        <>
          {canEdit && (
            <div style={cartao}>
              {!nova ? (
                <button onClick={() => setNova({
                  especialidade_cod: "", dia_semana: 1, hora_inicio: "08:00", hora_fim: "12:00",
                  duracao_min: 20, vagas_regulacao: 0, vagas_internas: 0, vagas_chegada: 0,
                  vigencia_inicio: hojeISO(), ativo: true,
                })} style={btn("#34d399")}>+ Nova grade</button>
              ) : (() => {
                const v = validarGrade(nova);
                return (
                  <>
                    <div style={rotulo}>{nova.id ? "Editar grade" : "Nova grade"}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                      <div>
                        <label style={lbl}>Especialidade *</label>
                        <select value={nova.especialidade_cod} onChange={e => setNova(p => ({ ...p, especialidade_cod: e.target.value }))} style={inp}>
                          <option value="">—</option>
                          {(catalogos.especialidade || []).map(x => <option key={x.codigo} value={x.codigo}>{x.nome}</option>)}
                        </select>
                        {(catalogos.especialidade || []).length === 0 && (
                          <div style={{ fontSize: 10.5, color: "#d97706", marginTop: 3 }}>
                            Nenhuma especialidade cadastrada — cadastre na aba Tabelas.
                          </div>
                        )}
                      </div>
                      <div>
                        <label style={lbl}>Dia da semana *</label>
                        <select value={nova.dia_semana} onChange={e => setNova(p => ({ ...p, dia_semana: Number(e.target.value) }))} style={inp}>
                          {DIAS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Profissional</label>
                        <select value={nova.profissional_username || ""} onChange={e => setNova(p => ({ ...p, profissional_username: e.target.value }))} style={inp}>
                          <option value="">— definir na escala</option>
                          {profissionais.map(p => <option key={p.username} value={p.username}>{p.nome || p.username}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Início *</label>
                        <input type="time" value={nova.hora_inicio} onChange={e => setNova(p => ({ ...p, hora_inicio: e.target.value }))} style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Término *</label>
                        <input type="time" value={nova.hora_fim} onChange={e => setNova(p => ({ ...p, hora_fim: e.target.value }))} style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Duração (min) *</label>
                        <input type="number" min="5" max="240" value={nova.duracao_min}
                          onChange={e => setNova(p => ({ ...p, duracao_min: Number(e.target.value) }))} style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Vagas — regulação</label>
                        <input type="number" min="0" value={nova.vagas_regulacao}
                          onChange={e => setNova(p => ({ ...p, vagas_regulacao: Number(e.target.value) }))} style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Vagas — marcação interna</label>
                        <input type="number" min="0" value={nova.vagas_internas}
                          onChange={e => setNova(p => ({ ...p, vagas_internas: Number(e.target.value) }))} style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Vagas — ordem de chegada</label>
                        <input type="number" min="0" value={nova.vagas_chegada}
                          onChange={e => setNova(p => ({ ...p, vagas_chegada: Number(e.target.value) }))} style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Vigência — início</label>
                        <input type="date" value={nova.vigencia_inicio || ""} onChange={e => setNova(p => ({ ...p, vigencia_inicio: e.target.value }))} style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Vigência — fim</label>
                        <input type="date" value={nova.vigencia_fim || ""} onChange={e => setNova(p => ({ ...p, vigencia_fim: e.target.value }))} style={inp} />
                      </div>
                    </div>

                    <div style={{ marginTop: 10, padding: "9px 12px", borderRadius: 8, fontSize: 12,
                                  background: v.erros.length ? "#f43f5e10" : "var(--surface-2)",
                                  border: `1px solid ${v.erros.length ? "#f43f5e55" : "var(--border)"}` }}>
                      <strong>{v.totalHorarios} horário(s)</strong> neste período · <strong>{v.cotasSomadas}</strong> vaga(s) distribuída(s)
                      {v.erros.map((e, i) => <div key={i} style={{ marginTop: 5 }}>⚠ {e}</div>)}
                      {v.avisos.map((a, i) => <div key={i} style={{ marginTop: 5, color: "var(--text-muted)" }}>{a}</div>)}
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <button onClick={salvarAGrade} disabled={busy || !v.ok} style={btn("#22d3ee", !busy && v.ok)}>Salvar grade</button>
                      <button onClick={() => setNova(null)} style={{ ...btn("var(--surface-2)", false), color: "var(--text)" }}>Cancelar</button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          <div style={cartao}>
            <div style={rotulo}>Grades cadastradas ({grades.length})</div>
            {grades.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", padding: "1rem", border: "1px dashed var(--border)", borderRadius: 8 }}>
                Nenhuma grade. Sem grade o ambulatório não oferece vaga — nem para a regulação, nem para marcação interna.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {grades.map(g => (
                  <div key={g.id} style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap",
                                           background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8,
                                           padding: "8px 11px", opacity: g.ativo ? 1 : 0.55 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, minWidth: 74 }}>{DIAS[g.dia_semana]}</span>
                    <span style={{ fontSize: 12.5, minWidth: 110 }}>{espec(g.especialidade_cod)}</span>
                    <span style={{ fontSize: 11.5, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>
                      {String(g.hora_inicio).slice(0, 5)}–{String(g.hora_fim).slice(0, 5)} · {g.duracao_min}min
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {horariosDaGrade(g).length} horários · {cotasSomadas(g)} vagas
                      {" ("}{g.vagas_regulacao}R / {g.vagas_internas}I / {g.vagas_chegada}C{")"}
                    </span>
                    {g.profissional_username && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{prof(g.profissional_username)}</span>}
                    {!g.ativo && <span style={{ fontSize: 10, fontWeight: 800, color: "#d97706" }}>DESLIGADA</span>}
                    {canEdit && (
                      <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                        <button onClick={() => setNova({ ...g })} style={{ ...btn("var(--surface-2)", false), color: "var(--text)", padding: "4px 9px", fontSize: 11 }}>Editar</button>
                        <button onClick={async () => { await alternarAtivoGrade(sb, g.id, !g.ativo, currentUser); recarregarDia(); }}
                          style={{ ...btn("var(--surface-2)", false), color: "var(--text)", padding: "4px 9px", fontSize: 11 }}>
                          {g.ativo ? "Desligar" : "Religar"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10 }}>
              R = regulação · I = marcação interna · C = ordem de chegada. Grade não se apaga, só desliga —
              agendamento já feito aponta para ela.
            </div>
          </div>

          <div style={cartao}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
              <div style={{ ...rotulo, marginBottom: 0 }}>Bloqueios</div>
              {canEdit && !bloq && (
                <button onClick={() => setBloq({ data_inicio: data, data_fim: data, motivo: "" })}
                  style={{ ...btn("#d97706"), marginLeft: "auto", color: "#fff" }}>+ Bloquear período</button>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10 }}>
              Feriado, férias, sala em reforma. Sem bloqueio a agenda oferece vaga em dia que o hospital não atende —
              e o paciente vem de outra cidade encontrar a porta fechada.
            </div>
            {bloq && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={lbl}>De *</label>
                  <input type="date" value={bloq.data_inicio} onChange={e => setBloq(p => ({ ...p, data_inicio: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Até *</label>
                  <input type="date" value={bloq.data_fim} onChange={e => setBloq(p => ({ ...p, data_fim: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Especialidade</label>
                  <select value={bloq.especialidade_cod || ""} onChange={e => setBloq(p => ({ ...p, especialidade_cod: e.target.value }))} style={inp}>
                    <option value="">todas (feriado)</option>
                    {(catalogos.especialidade || []).map(x => <option key={x.codigo} value={x.codigo}>{x.nome}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={lbl}>Motivo *</label>
                  <input value={bloq.motivo} onChange={e => setBloq(p => ({ ...p, motivo: e.target.value }))} style={inp} placeholder="Ex.: Feriado municipal" />
                </div>
                <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
                  <button onClick={salvarOBloqueio} disabled={busy} style={btn("#22d3ee", !busy)}>Salvar bloqueio</button>
                  <button onClick={() => setBloq(null)} style={{ ...btn("var(--surface-2)", false), color: "var(--text)" }}>Cancelar</button>
                </div>
              </div>
            )}
            {bloqueios.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nenhum bloqueio alcança {data}.</div>
            ) : bloqueios.map(b => (
              <div key={b.id} style={{ fontSize: 12.5, padding: "6px 0", color: "var(--text-muted)" }}>
                {b.data_inicio} → {b.data_fim} · {b.especialidade_cod ? espec(b.especialidade_cod) : "todas"} · <strong>{b.motivo}</strong>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
