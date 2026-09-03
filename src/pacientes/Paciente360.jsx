// ═══════════════════════════════════════════════════════════
// PACIENTE 360 — A TELA
//
// A visão única do paciente: linha do tempo, sentinela, alergias,
// evoluções e passagem de plantão. Saiu do App.jsx.
//
// As regras estão em ./paciente360.js e o acesso ao banco em ./dados.js.
// ⚠️ O `sb` chega por prop. Nulo = sem banco.
// ═══════════════════════════════════════════════════════════

// ── Página Paciente 360 ──
import { useEffect, useRef, useState } from "react";
import CadastroPaciente from "./CadastroPaciente.jsx";
import ProntuarioInternado from "../prontuario/ProntuarioInternado.jsx";
import { TIPOS_EVOLUCAO, montarTimeline, resumoLocalPaciente, sentinelaPaciente } from "./paciente360.js";
import { addEvolucaoRemote, buscarPacientes, loadPaciente360 } from "./dados.js";
import { comoExibir, conferirCadastro, idadeMesesParaTriagem, rotuloSexo } from "./identidade.js";
import { situacaoAlergica } from "../clinico/alergias.js";
import { dadosDaAlergia, recadoDepoisDeGravar, validarAlergia,
         TIPOS as TIPOS_ALERGIA, GRAVIDADES as GRAVIDADES_ALERGIA } from "../clinico/registro-alergia.js";
import { registrarAlergia } from "../prontuario/dados.js";
import { loadFarmIncompatY, loadFarmInteracoes, loadFarmMedicamentos } from "../farmacia/dados.js";
import { registrarAuditoria } from "../auditoria/dados.js";
import { HOSPITAL_NOME, HOSPITAL_SIGLA, VX, btnContorno } from "../ui/base.jsx";
import { fmtDataBR, horaFmt, nowISO } from "../util/datas.js";
import PrimeiroUso from "../ui/PrimeiroUso.jsx";
import { useChecagens } from "../ui/usar-checagens.js";

// O cadastro que sustenta esta tela. Sem paciente nenhum, a busca não acha
// nada — e "não achei" é indistinguível de "ninguém foi cadastrado ainda".
const BASE_PACIENTES = [
  { o: "pacientes", tabela: "pacientes", onde: "Atendimento → Recepção" },
];

export default function PacientePage({ sb, currentUser, canEdit }) {
  const [busca, setBusca] = useState("");
  const [sugestoes, setSugestoes] = useState([]);
  const [prontuario, setProntuario] = useState(null);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [cadForm, setCadForm] = useState(null); // form de cadastro mínimo quando não existe
  // Registro de alergia: `null` = fechado. Aberto, é o formulário em edição.
  const [algForm, setAlgForm] = useState(null);
  const [algBusy, setAlgBusy] = useState(false);
  const [algMsg, setAlgMsg] = useState(null);   // { tom, texto }
  const [resumoIA, setResumoIA] = useState(null);
  // "resumo" = linha do tempo de todos os módulos (o que já existia).
  // "internacao" = prontuário do episódio em curso.
  const [visao, setVisao] = useState("resumo");
  // Catálogo clínico: o motor de alertas precisa dele para analisar a
  // prescrição da internação. Carregado uma vez, não por paciente.
  const [meds, setMeds] = useState([]);
  const [farmInteracoes, setFarmInteracoes] = useState([]);
  const [farmIncompatY, setFarmIncompatY] = useState([]);
  useEffect(() => {
    let vivo = true;
    Promise.all([loadFarmMedicamentos(sb), loadFarmInteracoes(sb), loadFarmIncompatY(sb)])
      // ⚠️ `i` e `y` seguem como estão: `null` significa que a base não pôde
      // ser lida, e é o que faz a análise avisar em vez de sair limpa.
      // Coagir para `[]` aqui apagaria o aviso justamente onde se prescreve.
      .then(([m, i, y]) => { if (!vivo) return; setMeds(m || []); setFarmInteracoes(i); setFarmIncompatY(y); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);
  const medById = {}; meds.forEach(m => { medById[m.id] = m; });
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 12px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", boxSizing: "border-box" };
  const secLbl = { fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 };

  async function abrir(pront) {
    setCarregando(true); setProntuario(pront); setSugestoes([]); setResumoIA(null);
    const d = await loadPaciente360(sb, pront);
    setDados(d); setCadForm(null); setCarregando(false); setAlgForm(null); setAlgMsg(null);
  }

  /**
   * Grava a alergia e recarrega — sem recarregar, a pessoa registra e a
   * tela continua dizendo "não avaliadas", que é o oposto do que aconteceu.
   */
  async function salvarAlergia() {
    const v = validarAlergia(algForm || {});
    if (!v.ok) { setAlgMsg({ tom: "erro", texto: v.erros.join(" ") }); return; }
    if (v.avisos.length && !confirm(`${v.avisos.join("\n\n")}\n\nRegistrar assim mesmo?`)) return;
    setAlgBusy(true);
    const r = await registrarAlergia(sb, prontuario, dadosDaAlergia(algForm), currentUser).catch(() => null);
    setAlgBusy(false);
    if (!Array.isArray(r) || !r.length) {
      setAlgMsg({ tom: "erro", texto: "Nada foi gravado. O aviso vermelho no topo diz o motivo — costuma ser permissão de escrita no prontuário." });
      return;
    }
    registrarAuditoria(sb, currentUser, "registrar alergia", `${prontuario} · ${algForm.nega ? "nega alergias" : (algForm.agente || "?")}`, {});
    setAlgMsg({ tom: "ok", texto: recadoDepoisDeGravar(algForm) });
    setAlgForm(null);
    setDados(await loadPaciente360(sb, prontuario));
  }
  function resumir() {
    setResumoIA(resumoLocalPaciente(prontuario, dados, timeline, alertas));
    registrarAuditoria(sb, currentUser, "resumo do paciente", prontuario, {});
  }
  async function buscar() {
    const t = busca.trim();
    if (!t) return;
    // Número puro é prontuário — menos quando tem cara de CPF ou CNS, que
    // agora também são caminho de busca.
    const doc = t.replace(/\D/g, "");
    if (/^\d+$/.test(t) && doc.length !== 11 && doc.length !== 15) { abrir(t); return; }
    const achados = await buscarPacientes(sb, t);
    if (achados.length === 1) { abrir(achados[0].prontuario); return; }
    if (achados.length > 1) { setSugestoes(achados); return; }
    setSugestoes([]);
    // Nada encontrado por nome/documento. Antes isto era um beco sem saída
    // com um alerta — e o prontuário deste hospital é alfanumérico ("T9035"),
    // então quem digitava o número certo batia no aviso de "não encontrado".
    // Agora tenta abrir como prontuário: se existir, abre; se não, cai na
    // tela de paciente sem cadastro, que é justamente onde se cadastra.
    if (/^[A-Za-z0-9._-]{2,}$/.test(t)) { abrir(t); return; }
    alert("Nenhum paciente encontrado por nome, iniciais, CPF ou Cartão SUS.");
  }
  // Idade a partir da data COMPLETA quando ela existe; do ano só como
  // queda para o cadastro antigo — e aí vem marcada como aproximada.
  const idadeInfo = dados?.cadastro ? idadeMesesParaTriagem(dados.cadastro) : { meses: null, exata: false, rotulo: null };
  const idade = idadeInfo.rotulo;
  const conferenciaCadastro = conferirCadastro(dados?.cadastro);
  const timeline = dados ? montarTimeline(dados) : [];
  const alertas = dados ? sentinelaPaciente(dados) : [];
  // Alergia funde a fonte nova (pep_alergias) com o texto legado que ainda
  // vive no último atendimento de PS, até o front migrar a escrita.
  const alergiaLegado = dados?.ps?.[0]?.alergias || "";
  const alergia = dados ? situacaoAlergica(dados.alergias, alergiaLegado) : { estado: "sem_registro", itens: [] };
  const internadoAgora = (dados?.leitoAtual?.length || 0) > 0;
  const iniciaisConhecidas = dados?.cadastro?.iniciais
    || dados?.leitoAtual[0]?.iniciais || dados?.ps[0]?.iniciais || dados?.saidas[0]?.iniciais || dados?.scih[0]?.iniciais || null;

  return (
    <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Paciente 360 — Registro Clínico Integrado</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: "1.25rem" }}>Linha do tempo automática de todos os módulos + evoluções da equipe. Registro imutável: evoluções não podem ser editadas nem apagadas.</div>

      <PrimeiroUso checagens={useChecagens(sb, BASE_PACIENTES)} />

      {/* BUSCA */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => e.key === "Enter" && buscar()} placeholder="Prontuário, nome, CPF ou Cartão SUS" style={{ ...inp, flex: 1, minWidth: 240 }} />
        <button onClick={buscar} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Buscar</button>
      </div>
      {sugestoes.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {/* A lista de resultados mostra iniciais + nascimento, não o nome
              completo: é o suficiente para escolher a pessoa certa sem
              expor a identidade de vários pacientes numa tela que fica
              aberta no balcão. */}
          {sugestoes.map(s => (
            <button key={s.prontuario} onClick={() => abrir(s.prontuario)} style={btnContorno("#22d3ee")}>
              {comoExibir(s) || s.iniciais} · reg. {s.prontuario}
              {s.data_nascimento ? ` · ${fmtDataBR(s.data_nascimento)}` : ""}
            </button>
          ))}
        </div>
      )}
      {carregando && <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "1rem 0" }}>Carregando…</div>}

      {dados && !carregando && (
        <>
          {/* CABEÇALHO DO PACIENTE */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", margin: "10px 0 16px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: "#0d948822", border: "1px solid #0d948855", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, color: "#2dd4bf" }}>
              {(iniciaisConhecidas || "?").charAt(0)}
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{iniciaisConhecidas || "Paciente"} <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400 }}>· prontuário {prontuario}</span></div>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                {/* "~68 anos" quando só há o ano de nascimento: o til é o
                    aviso de que a idade é estimada, não medida. */}
                {idade || "idade não cadastrada"}{dados.cadastro?.sexo ? ` · ${rotuloSexo(dados.cadastro.sexo)}` : ""}
                {dados.leitoAtual.length > 0 && <strong style={{ color: "#22d3ee" }}> · internado agora — leito {dados.leitoAtual[0].identificacao}{dados.leitoAtual[0].setor ? ` (${dados.leitoAtual[0].setor})` : ""}</strong>}
              </div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              {/* O cadastro deixa de ser só "criar quando não existe": a
                  identificação da CFM 1.638 quase nunca fica pronta na
                  primeira passagem, então editar precisa estar sempre à mão.
                  O botão avisa quando ainda falta algo essencial. */}
              {canEdit && !cadForm && (
                <button onClick={() => setCadForm(true)}
                  style={btnContorno(conferenciaCadastro.completo ? "var(--text-muted)" : "#d97706")}>
                  {!dados.cadastro ? "Cadastrar paciente"
                    : conferenciaCadastro.completo ? "Editar cadastro"
                    : `Completar cadastro (${conferenciaCadastro.percentual}%)`}
                </button>
              )}
              {timeline.length > 0 && (
                <button onClick={resumir} style={{ background: `linear-gradient(90deg, ${VX.turquesa}, ${VX.azul})`, color: "#062a35", border: "none", borderRadius: 6, padding: "7px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Resumo do paciente</button>
              )}
            </div>
          </div>

          {/* ALERGIAS — faixa de segurança clínica.
              Três estados deliberadamente distintos: "sem_registro"
              (ninguém perguntou) é AMARELO, não verde — não afirmar
              ausência que ninguém verificou. */}
          {alergia.estado === "com_alergia" && (
            <div style={{ background: "#f43f5e18", border: "1px solid #f43f5e66", borderLeft: "4px solid #f43f5e", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#f43f5e", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>⚠ Alergias / reações</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {alergia.itens.map(a => (
                  <span key={a.chave} title={[a.manifestacao, a.quem && `registrado por ${a.quem}`, a.fonte === "legado" ? "do atendimento (não confirmado)" : null].filter(Boolean).join(" · ")}
                    style={{ background: a.criticidade === "alta" ? "#f43f5e22" : "var(--bg-2)", border: `1px solid ${a.criticidade === "alta" ? "#f43f5e66" : "var(--border)"}`, borderRadius: 99, padding: "3px 11px", fontSize: 12.5, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {a.rotulo}
                    {a.gravidade && <span style={{ fontSize: 10, opacity: .8, fontWeight: 500 }}>({a.gravidade})</span>}
                    {a.fonte === "legado" && <span style={{ fontSize: 9, color: "#d97706", fontWeight: 800 }} title="Veio do texto do atendimento — reconfirme e registre">•</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
          {alergia.estado === "nenhuma" && (
            <div style={{ background: "#34d39912", border: "1px solid #34d39944", borderRadius: 10, padding: "9px 16px", marginBottom: 16, fontSize: 12.5, color: "#34d399", fontWeight: 600 }}>
              ✓ Paciente nega alergias conhecidas
            </div>
          )}
          {alergia.estado === "sem_registro" && (
            <div style={{ background: "#d9770612", border: "1px solid #d9770644", borderRadius: 10, padding: "9px 16px", marginBottom: 16, fontSize: 12.5, color: "#d97706", fontWeight: 600 }}>
              Alergias não avaliadas — pergunte ao paciente e registre. Campo em branco não é o mesmo que "não tem".
            </div>
          )}

          {/* 🔴 O CAMINHO QUE A MENSAGEM ACIMA MANDAVA SEGUIR E NÃO EXISTIA.
              `pep_alergias` era lida em 4 lugares — inclusive na pulseira do
              punho do paciente — e escrita em nenhum. Instruir alguém a
              fazer o que o sistema não permite ensina que a tela não vale. */}
          {canEdit && dados && !algForm && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              <button onClick={() => { setAlgForm({ tipo: "medicamento" }); setAlgMsg(null); }}
                style={{ background: "transparent", color: "#d97706", border: "1px solid #d9770688", borderRadius: 7, padding: "7px 13px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
                + Registrar alergia
              </button>
              <button onClick={() => { setAlgForm({ nega: true }); setAlgMsg(null); }}
                style={{ background: "transparent", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 7, padding: "7px 13px", fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}>
                Paciente nega alergias
              </button>
            </div>
          )}

          {algForm && (
            <div style={{ background: "var(--surface)", border: "1px solid #d9770655", borderLeft: "4px solid #d97706", borderRadius: 10, padding: "16px 18px", marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#d97706", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 12 }}>
                {algForm.nega ? "Paciente nega alergias conhecidas" : "Registrar alergia"}
              </div>

              {algForm.nega ? (
                <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, marginBottom: 12 }}>
                  Vai constar que <strong>alguém perguntou</strong> e o paciente negou — que é diferente
                  de campo em branco. O registro fica com seu nome e a data.
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                  <label><span style={secLbl}>A que é alérgico *</span>
                    <input style={{ ...inp, width: "100%" }} value={algForm.agente || ""} autoFocus
                      placeholder="como o paciente chama"
                      onChange={e => setAlgForm(f => ({ ...f, agente: e.target.value }))} />
                  </label>
                  <label><span style={secLbl}>Tipo *</span>
                    <select style={{ ...inp, width: "100%" }} value={algForm.tipo || ""}
                      onChange={e => setAlgForm(f => ({ ...f, tipo: e.target.value }))}>
                      <option value="">—</option>
                      {TIPOS_ALERGIA.map(t => <option key={t.chave} value={t.chave}>{t.rotulo}</option>)}
                    </select>
                  </label>
                  {algForm.tipo === "medicamento" && (
                    <label><span style={secLbl}>Princípio ativo</span>
                      <input style={{ ...inp, width: "100%" }} value={algForm.substancia || ""}
                        placeholder="é o que faz o alerta funcionar"
                        onChange={e => setAlgForm(f => ({ ...f, substancia: e.target.value }))} />
                    </label>
                  )}
                  <label><span style={secLbl}>Gravidade</span>
                    <select style={{ ...inp, width: "100%" }} value={algForm.gravidade || ""}
                      onChange={e => setAlgForm(f => ({ ...f, gravidade: e.target.value }))}>
                      <option value="">—</option>
                      {GRAVIDADES_ALERGIA.map(g => <option key={g.chave} value={g.chave}>{g.rotulo} — {g.nota}</option>)}
                    </select>
                  </label>
                  <label style={{ gridColumn: "1 / -1" }}><span style={secLbl}>O que aconteceu</span>
                    <input style={{ ...inp, width: "100%" }} value={algForm.reacao || ""}
                      placeholder="urticária, broncoespasmo, anafilaxia…"
                      onChange={e => setAlgForm(f => ({ ...f, reacao: e.target.value }))} />
                  </label>
                </div>
              )}

              <div style={{ fontSize: 11.5, color: "var(--text-3)", marginBottom: 12, lineHeight: 1.5 }}>
                O registro é permanente: alergia não se apaga. Engano se corrige com um registro novo,
                e o histórico continua — saber que alguém já suspeitou é informação clínica.
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={salvarAlergia} disabled={algBusy}
                  style={{ background: "#d97706", color: "#fff", border: "none", borderRadius: 7, padding: "8px 16px", fontWeight: 700, fontSize: 12.5, cursor: algBusy ? "not-allowed" : "pointer", opacity: algBusy ? .5 : 1 }}>
                  {algBusy ? "Gravando…" : "Registrar"}
                </button>
                <button onClick={() => { setAlgForm(null); setAlgMsg(null); }}
                  style={{ background: "transparent", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 16px", fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {algMsg && (
            <div style={{ marginBottom: 16, fontSize: 12.5, fontWeight: 600, lineHeight: 1.55,
                          color: algMsg.tom === "erro" ? "#f43f5e" : "#34d399" }}>
              {algMsg.texto}
            </div>
          )}

          {/* RESUMO POR IA */}
          {resumoIA && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${VX.turquesa}`, borderRadius: 10, padding: "14px 18px", marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: VX.turquesa, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6 }}>Resumo de passagem de plantão</div>
              <div style={{ fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{resumoIA}</div>
              <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 8 }}>Gerado automaticamente a partir da linha do tempo. Confira as informações antes de usar — a conduta é sempre do médico assistente.</div>
            </div>
          )}

          {/* CADASTRO DO PACIENTE — identificação da CFM 1.638/2002.
              Substituiu o formulário de três campos: aquele deixava o
              prontuário sem nome, sem data completa e sem filiação, o que
              não atende à norma e ainda estraga o cálculo de idade. */}
          {cadForm && (
            <div style={{ marginBottom: 16 }}>
              <CadastroPaciente
                sb={sb} prontuario={prontuario} paciente={dados.cadastro}
                canEdit={canEdit} currentUser={currentUser}
                onSalvo={() => { setCadForm(null); abrir(prontuario); }}
                onCancelar={() => setCadForm(null)} />
            </div>
          )}

          {/* SENTINELA */}
          {alertas.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
              {alertas.map((a, i) => (
                <div key={i} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: `4px solid ${a.cor}`, borderRadius: 8, padding: "8px 13px", fontSize: 12.5, color: "var(--text-2)", fontWeight: 600 }}>{a.texto}</div>
              ))}
            </div>
          )}

          {/* Alterna entre o resumo (linha do tempo de todos os módulos) e o
              prontuário da internação em curso. Some quando o paciente não
              está internado — não faz sentido oferecer aba vazia. */}
          {internadoAgora && (
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              {[["resumo", "Resumo do paciente"], ["internacao", "Prontuário da internação"]].map(([k, t]) => (
                <button key={k} onClick={() => setVisao(k)}
                  style={{ background: visao === k ? "var(--bg-2)" : "transparent", color: visao === k ? "var(--text)" : "var(--text-muted)",
                           border: `1px solid ${visao === k ? "var(--border)" : "transparent"}`, borderRadius: 7,
                           padding: "8px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{t}</button>
              ))}
            </div>
          )}

          {internadoAgora && visao === "internacao" && (
            <ProntuarioInternado
              sb={sb} prontuario={prontuario} currentUser={currentUser} canEdit={canEdit}
              medById={medById} interacoes={farmInteracoes} incompatY={farmIncompatY}
              hospital={{ nome: HOSPITAL_NOME, sigla: HOSPITAL_SIGLA }}
            />
          )}

          {(!internadoAgora || visao === "resumo") && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16, alignItems: "start" }}>
            {/* TIMELINE */}
            <div>
              <div style={secLbl}>Linha do tempo ({timeline.length})</div>
              {timeline.length === 0 && <div style={{ fontSize: 13, color: "var(--text-muted)", background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 8, padding: "14px", textAlign: "center" }}>Nenhum registro encontrado para este prontuário.</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {timeline.map((e, i) => (
                  <div key={i} style={{ display: "flex", gap: 12 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 14 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 99, background: e.cor, marginTop: 6, flexShrink: 0 }} />
                      {i < timeline.length - 1 && <span style={{ width: 2, flex: 1, background: "var(--border)", minHeight: 18 }} />}
                    </div>
                    <div style={{ paddingBottom: 14, flex: 1 }}>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{horaFmt(e.quando)} · {e.modulo}</div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", marginTop: 1 }}>{e.titulo}</div>
                      {e.detalhe && <div style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.55, marginTop: 2, whiteSpace: "pre-wrap" }}>{e.detalhe}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* NOVA EVOLUÇÃO */}
            <div style={{ position: "sticky", top: 0 }}>
              <div style={secLbl}>Nova evolução</div>
              {canEdit ? <EvolucaoForm sb={sb} prontuario={prontuario} currentUser={currentUser} onSaved={() => abrir(prontuario)} /> :
                <div style={{ fontSize: 12.5, color: "var(--text-muted)", background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 8, padding: "12px" }}>Seu perfil é somente leitura.</div>}
            </div>
          </div>
          )}
        </>
      )}
    </div>
  );
}

// Formulário de evolução com ditado por voz (Web Speech API, pt-BR)
function EvolucaoForm({ sb, prontuario, currentUser, onSaved }) {
  const [tipo, setTipo] = useState("evolucao_medica");
  const [texto, setTexto] = useState("");
  const [gravando, setGravando] = useState(false);
  const [busy, setBusy] = useState(false);
  const recRef = useRef(null);
  const suportaVoz = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 12px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };

  function toggleVoz() {
    if (gravando) { recRef.current?.stop(); setGravando(false); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "pt-BR"; rec.continuous = true; rec.interimResults = false;
    rec.onresult = ev => {
      let novo = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) novo += ev.results[i][0].transcript;
      if (novo) setTexto(t => (t ? t.trimEnd() + " " : "") + novo.trim());
    };
    rec.onend = () => setGravando(false);
    rec.onerror = () => setGravando(false);
    recRef.current = rec; rec.start(); setGravando(true);
  }
  async function salvar() {
    if (!texto.trim()) { alert("Escreva (ou dite) o texto da evolução."); return; }
    if (!confirm("Salvar esta evolução? Ela NÃO poderá ser editada nem apagada depois (registro clínico).")) return;
    setBusy(true);
    if (gravando) { recRef.current?.stop(); setGravando(false); }
    await addEvolucaoRemote(sb, { prontuario, tipo, texto: texto.trim(), criado_em: nowISO() }, currentUser);
    registrarAuditoria(sb, currentUser, "nova evolução", `${prontuario} (${tipo})`, {});
    setTexto(""); setBusy(false); onSaved?.();
  }
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px" }}>
      <select value={tipo} onChange={e => setTipo(e.target.value)} style={{ ...inp, marginBottom: 8 }}>
        {Object.entries(TIPOS_EVOLUCAO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={7} placeholder="Escreva a evolução — ou clique em Ditar e fale." style={{ ...inp, resize: "vertical", lineHeight: 1.55, marginBottom: 8 }} />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {suportaVoz ? (
          <button onClick={toggleVoz} style={{ background: gravando ? "#f43f5e" : "transparent", color: gravando ? "#fff" : "var(--text-2)", border: `1px solid ${gravando ? "#f43f5e" : "var(--border-2)"}`, borderRadius: 6, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
            {gravando ? "● Gravando… (parar)" : "Ditar por voz"}
          </button>
        ) : <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Ditado por voz indisponível neste navegador (use o Chrome).</span>}
        <button onClick={salvar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13, marginLeft: "auto" }}>{busy ? "…" : "Salvar evolução"}</button>
      </div>
      <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>Assinada como <strong>{currentUser?.name}</strong> com data/hora. Registro imutável — confira antes de salvar.</div>
    </div>
  );
}
