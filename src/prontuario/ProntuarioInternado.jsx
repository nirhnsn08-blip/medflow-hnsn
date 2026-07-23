// ═══════════════════════════════════════════════════════════
// PRONTUÁRIO DO PACIENTE INTERNADO
//
// Preenche a lacuna central do sistema: todo o aparato clínico —
// prescrição, evolução, checagem de medicação — vivia dentro do modal do
// Pronto-Socorro. O paciente internado, que passa DIAS recebendo
// medicação, não tinha nada disso.
//
// Fica em arquivo próprio de propósito: o App.jsx tem 14 mil linhas, e
// duas pessoas editando o mesmo arquivo colidem. Aqui o módulo evolui sem
// disputar espaço com as telas.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import {
  episodioAtivo, diasInternacao, prescricaoVigente, itensAtivos,
  horariosDoDia, checarAprazamento, serieSinaisVitais, scoreAlertaPrecoce,
  timelineEpisodio,
} from "../clinico/prontuario.js";
import { situacaoAlergica, textoAlergiasParaAlerta } from "../clinico/alergias.js";
import { analisarPrescricaoClinica, FARM_GRAV } from "../clinico/alertas.js";
import {
  carregarProntuario, registrarSinais, registrarAnotacao,
  eventoDoItem, registrarAdministracao, registrarAcesso,
} from "./dados.js";

const cor = { borda: "var(--border)", sup: "var(--surface)", sup2: "var(--surface-2)", txt3: "var(--text-3)", mut: "var(--text-muted)" };
const cartao = { background: cor.sup, border: `1px solid ${cor.borda}`, borderRadius: 10, padding: "14px 16px", marginBottom: 14 };
const rotulo = { fontSize: 11, fontWeight: 700, color: cor.mut, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 };
const inp = { background: "var(--input-bg)", border: `1px solid ${cor.borda}`, borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
const btn = (c) => ({ background: "transparent", color: c, border: `1px solid ${c}66`, borderRadius: 6, padding: "7px 14px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" });

const hora = d => new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dataHora = d => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function ProntuarioInternado({ sb, prontuario, currentUser, canEdit, medById = {}, interacoes = [], incompatY = [] }) {
  const [d, setD] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState("visao");
  const [erro, setErro] = useState("");

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try { setD(await carregarProntuario(sb, prontuario)); }
    catch (e) { setErro(e?.message || "Falha ao carregar o prontuário."); }
    setCarregando(false);
  }, [sb, prontuario]);

  useEffect(() => {
    recarregar();
    // LGPD: quem abriu o prontuário de quem. Silencioso — nunca bloqueia.
    registrarAcesso(sb, prontuario, "prontuario_internado", null, currentUser);
  }, [recarregar, sb, prontuario, currentUser]);

  if (carregando) return <div style={{ padding: 24, color: cor.mut, fontSize: 13 }}>Carregando prontuário…</div>;
  if (erro) return <div style={{ ...cartao, borderLeft: "4px solid #f43f5e" }}><strong style={{ color: "#f43f5e" }}>{erro}</strong></div>;

  const ep = d?.episodio;
  if (!ep) {
    return (
      <div style={{ ...cartao, borderLeft: "4px solid #d97706" }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#d97706", marginBottom: 4 }}>Sem internação aberta</div>
        <div style={{ fontSize: 12.5, color: cor.txt3 }}>
          O prontuário de internação começa quando o episódio é aberto — o que acontece ao internar o paciente
          em um leito. Registros do Pronto-Socorro continuam na aba do atendimento.
        </div>
      </div>
    );
  }

  const dias = diasInternacao(ep);
  const alergia = situacaoAlergica(d.alergias);
  const presc = prescricaoVigente(d.prescricoes);
  const itens = presc ? itensAtivos(d.itens.filter(i => i.prescricao_id === presc.id), d.eventos) : [];
  const serie = serieSinaisVitais(d.sinais);
  const ultimo = serie[serie.length - 1] || null;
  const news = scoreAlertaPrecoce(ultimo);

  // O motor de alertas passa a enxergar a alergia do INTERNADO — antes ele
  // só recebia o texto solto do atendimento do PS.
  const ctx = {
    idade: null, alergias: textoAlergiasParaAlerta(d.alergias),
    em_sonda: d.condicoes?.some(c => /sonda/i.test(c.descricao || "")) || false,
    clearance_renal: ultimo?.clearance_renal ?? null,
    funcao_hepatica: null,
  };
  // O motor de alertas nasceu no PS, onde a coluna se chama
  // `medicamento_nome`. No PEP ela é `descricao`. Sem esta ponte os alertas
  // disparam certo mas exibem "undefined" no lugar do medicamento — e
  // alerta que não diz QUAL remédio é alerta inútil.
  const itensParaAlerta = itens.map(i => ({ ...i, medicamento_nome: i.medicamento_nome || i.descricao }));
  const alertas = itens.length ? analisarPrescricaoClinica(itensParaAlerta, ctx, medById, interacoes, incompatY) : [];

  const abas = [
    ["visao", "Visão geral"],
    ["prescricao", `Prescrição (${itens.length})`],
    ["sinais", `Sinais vitais (${serie.length})`],
    ["timeline", "Linha do tempo"],
  ];

  return (
    <div>
      {/* CABEÇALHO DO EPISÓDIO */}
      <div style={{ ...cartao, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 800 }}>
            Internado — leito {ep.leito || "?"}{ep.setor ? ` · ${ep.setor}` : ""}
          </div>
          <div style={{ fontSize: 12, color: cor.txt3 }}>
            {dias != null && `${dias} dia(s) de internação`}
            {ep.cid_principal && ` · CID ${ep.cid_principal}`}
            {ep.motivo_internacao && ` · ${ep.motivo_internacao}`}
          </div>
        </div>
        {news && (
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontSize: 10.5, color: cor.mut, textTransform: "uppercase", letterSpacing: ".06em" }}>Alerta precoce (NEWS)</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: news.nivel === "alto" ? "#f43f5e" : news.nivel === "medio" ? "#d97706" : "#34d399" }}>
              {news.score}
            </div>
          </div>
        )}
      </div>

      {news && news.nivel !== "normal" && (
        <div style={{ ...cartao, background: news.nivel === "alto" ? "#f43f5e18" : "#d9770618", borderLeft: `4px solid ${news.nivel === "alto" ? "#f43f5e" : "#d97706"}` }}>
          <strong style={{ fontSize: 13, color: news.nivel === "alto" ? "#f43f5e" : "#d97706" }}>{news.conduta}</strong>
          <div style={{ fontSize: 11.5, color: cor.txt3, marginTop: 4 }}>
            Calculado com {news.parametros} parâmetros da última aferição. Apoio à decisão — não substitui avaliação clínica.
          </div>
        </div>
      )}

      <AvisoAlergia alergia={alergia} />

      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {abas.map(([k, t]) => (
          <button key={k} onClick={() => setAba(k)}
            style={{ background: aba === k ? "var(--bg-2)" : "transparent", color: aba === k ? "var(--text)" : cor.mut,
                     border: `1px solid ${aba === k ? cor.borda : "transparent"}`, borderRadius: 7, padding: "7px 14px",
                     fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>{t}</button>
        ))}
      </div>

      {aba === "visao"      && <Visao d={d} ep={ep} itens={itens} alertas={alertas} ultimo={ultimo} canEdit={canEdit} sb={sb} user={currentUser} onOk={recarregar} />}
      {aba === "prescricao" && <Prescricao presc={presc} itens={itens} alertas={alertas} adms={d.administracoes} ep={ep} canEdit={canEdit} sb={sb} user={currentUser} onOk={recarregar} />}
      {aba === "sinais"     && <Sinais serie={serie} ep={ep} canEdit={canEdit} sb={sb} user={currentUser} onOk={recarregar} />}
      {aba === "timeline"   && <Timeline d={d} />}
    </div>
  );
}

// ── ALERGIA ─────────────────────────────────────────────────
function AvisoAlergia({ alergia }) {
  if (alergia.estado === "com_alergia") return (
    <div style={{ ...cartao, background: "#f43f5e18", borderLeft: "4px solid #f43f5e" }}>
      <div style={{ ...rotulo, color: "#f43f5e", marginBottom: 8 }}>⚠ Alergias</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {alergia.itens.map(a => (
          <span key={a.chave} title={a.manifestacao || ""} style={{ background: "#f43f5e22", border: "1px solid #f43f5e66", borderRadius: 99, padding: "3px 11px", fontSize: 12.5, fontWeight: 700 }}>
            {a.rotulo}{a.gravidade ? ` (${a.gravidade})` : ""}
          </span>
        ))}
      </div>
    </div>
  );
  if (alergia.estado === "nenhuma") return (
    <div style={{ ...cartao, background: "#34d39912", padding: "9px 16px", fontSize: 12.5, color: "#34d399", fontWeight: 600 }}>✓ Paciente nega alergias conhecidas</div>
  );
  return (
    <div style={{ ...cartao, background: "#d9770612", padding: "9px 16px", fontSize: 12.5, color: "#d97706", fontWeight: 600 }}>
      Alergias não avaliadas — pergunte e registre. Campo em branco não é o mesmo que "não tem".
    </div>
  );
}

// ── VISÃO GERAL ─────────────────────────────────────────────
function Visao({ d, ep, itens, alertas, ultimo, canEdit, sb, user, onOk }) {
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!texto.trim()) return;
    if (!confirm("A anotação é assinada com data/hora e NÃO pode ser editada nem apagada depois. Confirma?")) return;
    setSalvando(true);
    await registrarAnotacao(sb, ep, { tipo: "anotacao", texto: texto.trim() }, user);
    setTexto(""); setSalvando(false); onOk();
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 14, alignItems: "start" }}>
      <div>
        {alertas.length > 0 && (
          <div style={cartao}>
            <div style={{ ...rotulo, color: "#f43f5e" }}>Alertas de farmácia clínica ({alertas.length})</div>
            {alertas.map((a, i) => (
              <div key={i} style={{ background: FARM_GRAV[a.gravidade].cor + "11", border: `1px solid ${FARM_GRAV[a.gravidade].cor}44`, borderLeft: `4px solid ${FARM_GRAV[a.gravidade].cor}`, borderRadius: 8, padding: "8px 12px", marginBottom: 7 }}>
                <span style={{ fontSize: 9.5, fontWeight: 800, color: FARM_GRAV[a.gravidade].cor, textTransform: "uppercase" }}>{FARM_GRAV[a.gravidade].label}</span>
                <strong style={{ fontSize: 13, marginLeft: 7 }}>{a.titulo}</strong>
                <div style={{ fontSize: 12.5, color: cor.txt3, marginTop: 3 }}>{a.detalhe}</div>
              </div>
            ))}
          </div>
        )}

        <div style={cartao}>
          <div style={rotulo}>Medicação em curso ({itens.length})</div>
          {itens.length === 0
            ? <div style={{ fontSize: 12.5, color: cor.mut }}>Nenhuma prescrição ativa.</div>
            : itens.map(i => (
                <div key={i.id} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "5px 0", borderBottom: `1px solid ${cor.borda}` }}>
                  <strong style={{ fontSize: 13 }}>{i.descricao}</strong>
                  <span style={{ fontSize: 12, color: cor.txt3 }}>{i.dose} {i.via} {i.frequencia}</span>
                  {i.se_necessario && <span style={{ fontSize: 10, fontWeight: 800, color: "#d97706" }}>SOS</span>}
                </div>
              ))}
        </div>

        {ultimo && (
          <div style={cartao}>
            <div style={rotulo}>Última aferição — {dataHora(ultimo.aferido_em || ultimo.criado_em)}</div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
              {ultimo.pa_sist && <span>PA <strong>{ultimo.pa_sist}/{ultimo.pa_diast || "?"}</strong></span>}
              {ultimo.fc && <span>FC <strong>{ultimo.fc}</strong></span>}
              {ultimo.fr && <span>FR <strong>{ultimo.fr}</strong></span>}
              {ultimo.temp && <span>T <strong>{ultimo.temp}°</strong></span>}
              {ultimo.spo2 && <span>SpO₂ <strong>{ultimo.spo2}%</strong></span>}
            </div>
          </div>
        )}
      </div>

      {canEdit && (
        <div style={{ ...cartao, position: "sticky", top: 10 }}>
          <div style={rotulo}>Anotação de enfermagem</div>
          <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={5}
            placeholder="Fato pontual: evacuou, queda, recusa de dieta, intercorrência…"
            style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} />
          <button onClick={salvar} disabled={salvando || !texto.trim()}
            style={{ ...btn("#2dd4bf"), width: "100%", marginTop: 8, opacity: salvando || !texto.trim() ? .5 : 1 }}>
            {salvando ? "Salvando…" : "Salvar anotação"}
          </button>
          <div style={{ fontSize: 10.5, color: cor.mut, marginTop: 7 }}>
            Assinada como <strong>{user?.name}</strong> com data/hora. Registro imutável — confira antes de salvar.
          </div>
        </div>
      )}
    </div>
  );
}

// ── PRESCRIÇÃO ──────────────────────────────────────────────
function Prescricao({ presc, itens, alertas, adms, ep, canEdit, sb, user, onOk }) {
  if (!presc) return <div style={{ ...cartao, fontSize: 12.5, color: cor.mut }}>Nenhuma prescrição assinada para esta internação.</div>;

  const hoje = new Date();
  async function suspender(item) {
    const motivo = prompt(`Suspender "${item.descricao}". Motivo:`);
    if (motivo === null) return;
    await eventoDoItem(sb, ep, item, "suspenso", motivo, user);
    onOk();
  }
  async function administrar(item) {
    if (!confirm(`Registrar administração de "${item.descricao}" agora?`)) return;
    // Nomes conforme `pep_administracoes`: `item_id` e `descricao`.
    // (No módulo do PS as colunas equivalentes chamam-se
    // `prescricao_item_id` e `medicamento_nome` — as duas tabelas nasceram
    // em momentos diferentes e não convergiram.)
    await registrarAdministracao(sb, ep, {
      item_id: item.id, prescricao_id: item.prescricao_id,
      medicamento_id: item.medicamento_id || null,
      descricao: item.descricao, dose: item.dose, via: item.via, status: "administrado",
    }, user);
    onOk();
  }

  return (
    <div>
      <div style={{ ...cartao, display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <strong style={{ fontSize: 13.5 }}>Prescrição {presc.tipo} de {presc.data_referencia}</strong>
        <span style={{ fontSize: 12, color: cor.txt3 }}>assinada por {presc.prescritor_nome || presc.usuario} em {dataHora(presc.assinada_em)}</span>
      </div>

      {itens.map(item => {
        const horarios = horariosDoDia(item, hoje);
        const doItem = adms.filter(a => a.item_id === item.id);
        const grade = checarAprazamento(horarios, doItem, hoje);
        return (
          <div key={item.id} style={cartao}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 13.5 }}>{item.descricao}</strong>
              <span style={{ fontSize: 12, color: cor.txt3 }}>{item.dose} · {item.via} · {item.frequencia}</span>
              {item.se_necessario && <span style={{ fontSize: 10, fontWeight: 800, color: "#d97706" }}>SE NECESSÁRIO</span>}
              {canEdit && (
                <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button onClick={() => administrar(item)} style={btn("#34d399")}>Administrar</button>
                  <button onClick={() => suspender(item)} style={btn("#f43f5e")}>Suspender</button>
                </span>
              )}
            </div>
            {grade.length > 0 && (
              <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
                {grade.map((g, k) => {
                  // Três situações, não duas. "Dada com atraso" não pode
                  // parecer nem com "no horário" nem com "não dada".
                  const c = g.administradoComAtraso ? "#d97706" : g.administrado ? "#34d399" : g.atrasado ? "#f43f5e" : null;
                  const t = g.administradoComAtraso ? "administrada COM ATRASO"
                          : g.administrado ? "administrada no horário"
                          : g.atrasado ? "ATRASADA — ainda não administrada" : "pendente";
                  return (
                    <span key={k} title={t}
                      style={{ fontSize: 11.5, fontWeight: 700, fontFamily: "JetBrains Mono, monospace",
                               padding: "3px 9px", borderRadius: 99,
                               background: c ? c + "22" : "var(--bg-2)",
                               border: `1px solid ${c ? c + "66" : cor.borda}`,
                               color: c || cor.txt3 }}>
                      {hora(g.horario)}{g.administradoComAtraso ? " ✓⏱" : g.administrado ? " ✓" : g.atrasado ? " ⚠" : ""}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── SINAIS VITAIS ───────────────────────────────────────────
const CAMPOS_SV = [
  ["pa_sist", "PA sist"], ["pa_diast", "PA diast"], ["fc", "FC"], ["fr", "FR"],
  ["temp", "Temp °C"], ["spo2", "SpO₂ %"], ["glicemia", "Glicemia"], ["dor", "Dor 0-10"],
];

function Sinais({ serie, ep, canEdit, sb, user, onOk }) {
  const [f, setF] = useState({});
  const [salvando, setSalvando] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function salvar() {
    const sv = {};
    for (const [k] of CAMPOS_SV) if (f[k] !== "" && f[k] != null) sv[k] = Number(f[k]);
    if (!Object.keys(sv).length) return;
    setSalvando(true);
    await registrarSinais(sb, ep, { ...sv, consciencia: f.consciencia || "A", o2_suplementar: !!f.o2_suplementar }, user);
    setF({}); setSalvando(false); onOk();
  }

  const previa = scoreAlertaPrecoce({ ...f, consciencia: f.consciencia || "A" });

  return (
    <div>
      {canEdit && (
        <div style={cartao}>
          <div style={rotulo}>Nova aferição</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
            {CAMPOS_SV.map(([k, lbl]) => (
              <div key={k}>
                <label style={{ fontSize: 10.5, color: cor.mut }}>{lbl}</label>
                <input type="number" step="any" value={f[k] ?? ""} onChange={e => set(k, e.target.value)} style={inp} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={!!f.o2_suplementar} onChange={e => set("o2_suplementar", e.target.checked)} />
              Em O₂ suplementar
            </label>
            {previa && (
              <span style={{ fontSize: 12, fontWeight: 700, color: previa.nivel === "alto" ? "#f43f5e" : previa.nivel === "medio" ? "#d97706" : "#34d399" }}>
                NEWS previsto: {previa.score} ({previa.nivel})
              </span>
            )}
            <button onClick={salvar} disabled={salvando} style={{ ...btn("#2dd4bf"), marginLeft: "auto" }}>
              {salvando ? "Salvando…" : "Registrar aferição"}
            </button>
          </div>
        </div>
      )}

      <div style={cartao}>
        <div style={rotulo}>Série ({serie.length} aferições)</div>
        {serie.length === 0
          ? <div style={{ fontSize: 12.5, color: cor.mut }}>Nenhuma aferição registrada nesta internação.</div>
          : [...serie].reverse().map(s => {
              const n = scoreAlertaPrecoce(s);
              return (
                <div key={s.id} style={{ display: "flex", gap: 14, alignItems: "baseline", padding: "6px 0", borderBottom: `1px solid ${cor.borda}`, fontSize: 12.5, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "JetBrains Mono, monospace", color: cor.txt3, minWidth: 92 }}>{dataHora(s.aferido_em || s.criado_em)}</span>
                  {s.pa_sist && <span>PA {s.pa_sist}/{s.pa_diast || "?"}</span>}
                  {s.fc && <span>FC {s.fc}</span>}
                  {s.fr && <span>FR {s.fr}</span>}
                  {s.temp && <span>T {s.temp}°</span>}
                  {s.spo2 && <span>SpO₂ {s.spo2}%</span>}
                  {n && <span style={{ marginLeft: "auto", fontWeight: 800, color: n.nivel === "alto" ? "#f43f5e" : n.nivel === "medio" ? "#d97706" : "#34d399" }}>NEWS {n.score}</span>}
                </div>
              );
            })}
      </div>
    </div>
  );
}

// ── LINHA DO TEMPO ──────────────────────────────────────────
function Timeline({ d }) {
  const eventos = timelineEpisodio(d);
  if (!eventos.length) return <div style={{ ...cartao, fontSize: 12.5, color: cor.mut }}>Nada registrado nesta internação ainda.</div>;
  return (
    <div style={cartao}>
      {eventos.map((e, i) => (
        <div key={i} style={{ display: "flex", gap: 12, paddingBottom: 14, position: "relative" }}>
          <div style={{ width: 10, height: 10, borderRadius: 99, background: e.cor, marginTop: 4, flexShrink: 0 }} />
          {i < eventos.length - 1 && <div style={{ position: "absolute", left: 4.5, top: 16, bottom: 0, width: 1, background: cor.borda }} />}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: cor.mut, fontFamily: "JetBrains Mono, monospace" }}>{dataHora(e.quando)} · {e.modulo}</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{e.titulo}</div>
            {e.detalhe && <div style={{ fontSize: 12.5, color: cor.txt3, whiteSpace: "pre-wrap" }}>{e.detalhe}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
