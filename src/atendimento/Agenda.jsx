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
  horariosDaGrade, cotasSomadas, donoDaVaga,
} from "./agenda.js";
import {
  DESFECHOS_AMBULATORIAL, validarEncerramento, STATUS_ATENDIMENTO,
} from "./ciclo.js";
import {
  listarAmbulatoriaisAbertos, encerrarAtendimento,
  carregarGrades, salvarGrade, alternarAtivoGrade, carregarBloqueios, salvarBloqueio,
  carregarAgendaDoDia, marcarAgendamento, confirmarPresenca, registrarFalta,
  cancelarAgendamento, vincularPacienteAoAgendamento, carregarCatalogos,
  carregarProfissionais, buscarPacientes, carregarPaciente,
  carregarProducaoGravada, gravarProducao,
} from "./dados.js";
import { conferirFicha, DOMINIOS } from "./ficha.js";
import FontePagadora, { CampoCatalogo } from "./FontePagadora.jsx";
import Impressos from "./Impressos.jsx";
import ResponsavelDoEpisodio from "./Responsavel.jsx";
import { conciliarProducao, validarGravacao, CAMPOS_APURAVEIS } from "./producao.js";
import RelatorioAmbulatorio from "./RelatorioAmbulatorio.jsx";

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
  // A chegada em andamento: { agendamento, paciente, ficha, medico }.
  const [presenca, setPresenca] = useState(null);
  // Depois de confirmada: { paciente, atendimento } — a etapa de responsável
  // e impressos, a mesma que a Recepção faz.
  const [imprimindo, setImprimindo] = useState(null);
  const [responsaveis, setResponsaveis] = useState([]);
  const [producaoGravada, setProducaoGravada] = useState([]);

  const recarregarDia = useCallback(async () => {
    setCarregando(true);
    const [g, b, a, p] = await Promise.all([
      carregarGrades(sb),
      carregarBloqueios(sb, { de: data, ate: data }),
      carregarAgendaDoDia(sb, data),
      carregarProducaoGravada(sb, data),
    ]);
    setGrades(g); setBloqueios(b); setAgendamentos(a); setProducaoGravada(p);
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
  const producao = producaoDoDia({ grades, data, agendamentos, bloqueios, tiposDeAtendimento: catalogos.tipo_atendimento });
  const bloqueioGeral = bloqueioDoDia(bloqueios, data, {});
  const conciliacao = conciliarProducao({
    grades, agendamentos, bloqueios, data,
    gravado: producaoGravada, catalogoEspecialidades: catalogos.especialidade || [],
  });

  /**
   * Grava a produção apurada de uma especialidade na agregada.
   *
   * Uma linha por clique, de propósito. "Gravar tudo" pareceria mais
   * prático e faria alguém substituir sete números sem olhar nenhum — que é
   * exatamente a diferença entre conciliar e sobrescrever.
   */
  async function gravarLinha(linha) {
    if (!canEdit || busy) return;
    const v = validarGravacao(linha);
    if (!v.ok) { setMsg({ tom: "erro", texto: v.erros.join(" ") }); return; }
    setBusy(true);
    const r = await gravarProducao(sb, {
      data, especialidadeId: linha.id,
      apurada: linha.apurada, gravadaAnterior: linha.gravada,
    }, currentUser);
    setBusy(false);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    setMsg({ tom: "ok", texto: `Produção de ${linha.label} gravada no painel do Ambulatório.` });
    setProducaoGravada(await carregarProducaoGravada(sb, data));
  }

  // ── ações ──
  async function marcar() {
    if (!canEdit || busy || !marcando) return;
    const { grade, origem, hora, prontuario, protocolo, tipo, observacao, paciente } = marcando;
    const v = origem === "regulacao"
      ? podeRegistrarDaRegulacao({ grade, data, hora, protocolo, agendamentos, bloqueios, paciente })
      : podeMarcar({ grade, data, hora, origem, agendamentos, bloqueios, paciente });
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

  /**
   * Abre a CHEGADA — a etapa que faltava entre o agendamento e o atendimento.
   *
   * POR QUE ISTO DEIXOU DE SER UM CLIQUE SÓ
   * "Presença" gravava direto e abria o atendimento com a ficha vazia: sem
   * convênio, sem carteira, sem plano, sem senha de autorização. As colunas
   * existem em `ps_atendimentos` e ficavam todas nulas. `conferirFicha` — que
   * já sabe cobrar carteira, validade e autorização — era chamada na Recepção
   * e no fechamento da conta, e NUNCA aqui.
   *
   * O custo aparecia 40 dias depois: toda consulta de convênio que entrasse
   * pela Agenda chegava ao faturamento sem carteira e sem senha, com o
   * paciente em casa. Glosa integral, e o retrabalho é telefone.
   *
   * Carrega o cadastro do paciente de verdade, e não um `{ prontuario,
   * iniciais: "?" }` montado na hora — era isso que fazia TODO atendimento
   * ambulatorial nascer com as iniciais "?" gravadas no episódio.
   */
  async function abrirPresenca(a) {
    if (!canEdit) return;
    if (!a.prontuario) {
      setMsg({ tom: "erro", texto: "Esta vaga está reservada sem paciente. Use \"Quem veio?\" para dizer quem chegou antes de dar presença." });
      return;
    }
    setBusy(true);
    const paciente = await carregarPaciente(sb, a.prontuario);
    setBusy(false);
    if (!paciente) {
      setMsg({ tom: "erro", texto: `Não achei o cadastro do prontuário ${a.prontuario}. A presença não foi registrada.` });
      return;
    }
    setMsg(null);
    setPresenca({
      agendamento: a,
      paciente,
      // Quem vai atender, congelado com o CBO no momento da abertura — a
      // agenda SABE quem é, e mesmo assim a presença abria o episódio sem
      // médico nenhum. Sem CBO a produção SUS não é glosada: é REJEITADA no
      // processamento, e some inteira.
      medico: profissionais.find(p => p.username === a.profissional_username) || null,
      // O que a marcação já sabe vem preenchido; o que só se descobre com a
      // pessoa na frente (a carteirinha na mão) fica para a recepcionista.
      ficha: {
        convenio_id: "", plano_id: "", carteira: "", carteira_validade: "",
        guia_numero: "", autorizacao_senha: "",
        tipo_atendimento_cod: a.tipo_atendimento_cod || "",
        especialidade_cod: a.especialidade_cod || "",
        // 🔴 NÃO é chute: `confirmarPresenca` grava exatamente este valor.
        // Sem ele aqui, a tela cobrava "Origem do atendimento não informado"
        // — um aviso FALSO, para um campo que o painel nem desenhava. Aviso
        // que a pessoa não pode resolver é o que ensina a não ler a lista
        // onde mora "a carteira está vencida".
        unidade_origem_cod: "ambulatorio",
        tipo_paciente_cod: "", carater_cod: "",
        local_procedencia_cod: "", destino_cod: "",
      },
    });
  }

  async function confirmarAPresenca() {
    if (!canEdit || busy || !presenca) return;
    const { agendamento, paciente, ficha, medico } = presenca;
    setBusy(true);
    const r = await confirmarPresenca(sb, agendamento, { paciente, ficha, medico }, currentUser);
    setBusy(false);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    setPresenca(null);
    setMsg({ tom: r.aviso ? "erro" : "ok",
             texto: r.aviso || `Presença confirmada — atendimento ${r.atendimento.id} aberto.` });
    // A chegada não termina na gravação: quem trouxe o paciente ainda está
    // na frente, e a pulseira sai agora. Antes o fluxo da Agenda parava
    // aqui, e quem entrava pelo ambulatório — criança em consulta de
    // ortopedia, idoso frágil — nunca tinha responsável registrado nem
    // pulseira impressa. A Recepção já encadeia os dois; a chegada passa a
    // encadear também.
    if (r.atendimento) setImprimindo({ paciente, atendimento: r.atendimento });
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
    const r = await buscarPacientes(sb, buscaPac);
    // Falha de consulta não vira lista vazia: aqui a lista vazia faz a
    // recepcionista concluir que o paciente não está cadastrado e marcar
    // para outra pessoa, ou desistir da vaga.
    if (!r.ok) { setAchados([]); setMsg({ tom: "erro", texto: `${r.motivo} Tente de novo — não é que o paciente não exista.` }); return; }
    setAchados(r.lista);
    if (!r.lista.length) setMsg({ tom: "erro", texto: "Nenhum paciente encontrado com esse dado." });
  }

  const espec = cod => (catalogos.especialidade || []).find(e => e.codigo === cod)?.nome || cod;
  const prof = u => profissionais.find(p => p.username === u)?.nome || u;

  // As pendências da chegada, pela MESMA regra que a Recepção e o fechamento
  // da conta usam. `hoje` é a data do agendamento e não a de agora: a
  // carteirinha tem que valer no dia do atendimento, e conferir contra hoje
  // reprovaria carteira que estava válida e foi renovada depois — foi
  // exatamente esse o defeito corrigido no fechamento (PR #107).
  const convPresenca = presenca
    ? (catalogos.convenios || []).find(c => String(c.id) === String(presenca.ficha.convenio_id)) || null
    : null;
  const planoPresenca = presenca
    ? (catalogos.planos || []).find(p => String(p.id) === String(presenca.ficha.plano_id)) || null
    : null;
  const confPresenca = presenca ? conferirFicha({
    paciente: presenca.paciente,
    convenio: convPresenca,
    plano: planoPresenca,
    ficha: presenca.ficha,
    catalogos,
    // Com o médico em mãos, a conferência de CBO deixa de ficar muda: o ramo
    // `sem_cbo` de `conferirFicha` exige o profissional para poder cobrar o
    // CBO dele.
    medico: presenca.medico,
    procedimento: (catalogos.procedimentos || []).find(p => p.codigo === presenca.ficha.procedimento_cod) || null,
    hoje: presenca.agendamento?.data ? new Date(`${String(presenca.agendamento.data).slice(0, 10)}T12:00:00`) : new Date(),
  }) : null;

  return (
    <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Atendimento — Agenda do Ambulatório</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
        A vaga tem dono: <strong>regulação</strong> (a central marca, o hospital recebe),
        <strong> marcação interna</strong> (retorno, convênio, particular) e <strong>ordem de chegada</strong>.
        Marcar numa vaga que não é sua faz dois pacientes chegarem para o mesmo horário.
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["dia", "Dia"], ["grade", "Grade e bloqueios"],
          ["producao", conciliacao.divergentes ? `Produção (${conciliacao.divergentes})` : "Produção"],
          ["relatorio", "Relatório do mês"]].map(([k, l]) => (
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
            // Pelo MESMO dono que `vagasDoDia` usa para contar. Filtrar a
            // lista por especialidade enquanto o contador conta por
            // profissional fazia o card dizer "1/4" e listar dois pacientes
            // logo abaixo — cada médico via os agendamentos do outro na
            // própria agenda. Contador e lista têm que sair da mesma chave.
            const doDia = agendamentos.filter(a => donoDaVaga(a) === donoDaVaga(g));
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
                    Ninguém registrado nesta agenda hoje.
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
                            <button onClick={() => abrirPresenca(a)} disabled={busy}
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

          {/* ── DEPOIS DA CHEGADA: responsável e impressos ──
              A mesma sequência da Recepção, pelo mesmo motivo escrito lá:
              quem trouxe o paciente ainda está na frente, e depois que sai,
              descobrir quem era vira telefonema. `pendenciaDeResponsavel`
              (menor de idade, curatela) nunca era avaliada para quem entrava
              pelo ambulatório — e a pulseira, que o hospital exige, não saía. */}
          {imprimindo && (
            <>
              <ResponsavelDoEpisodio
                sb={sb} currentUser={currentUser} canEdit={canEdit}
                paciente={imprimindo.paciente} atendimento={imprimindo.atendimento}
                onMudou={setResponsaveis}
              />
              <Impressos
                responsaveis={responsaveis}
                paciente={imprimindo.paciente}
                atendimento={imprimindo.atendimento}
                catalogos={catalogos}
                convenio={(catalogos.convenios || []).find(c => String(c.id) === String(imprimindo.atendimento?.convenio_id)) || null}
                plano={(catalogos.planos || []).find(p => String(p.id) === String(imprimindo.atendimento?.plano_id)) || null}
                procedimento={(catalogos.procedimentos || []).find(p => p.codigo === imprimindo.atendimento?.procedimento_cod) || null}
                currentUser={currentUser}
                onFechar={() => { setImprimindo(null); setResponsaveis([]); }}
              />
            </>
          )}

          {/* ── CHEGADA: quem paga esta consulta ──
              A pergunta que faltava. Aparece com o paciente na frente, que é
              o único momento em que a carteirinha está na mão. */}
          {presenca && (
            <div style={{ ...cartao, borderLeft: "4px solid #0d9488" }}>
              <div style={rotulo}>Chegada — confirmar presença</div>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                {comoExibir(presenca.paciente, { completo: true }) || presenca.paciente.iniciais}
                <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
                  {" · reg. "}{presenca.paciente.prontuario}
                  {presenca.agendamento.hora ? ` · ${String(presenca.agendamento.hora).slice(0, 5)}` : ""}
                  {" · "}{espec(presenca.agendamento.especialidade_cod)}
                </span>
              </div>

              <FontePagadora
                catalogos={catalogos}
                ficha={presenca.ficha}
                onChange={f => setPresenca(p => ({ ...p, ficha: f }))}
              />

              {/* CLASSIFICAÇÃO — o que o painel COBRAVA e não oferecia.
                  `conferirFicha` avisa por domínio em branco cujo catálogo
                  tenha linhas; o painel só desenhava a fonte pagadora, então
                  a lista pedia "Caráter não informado" sem existir onde
                  informar. Agora todo aviso que aparece tem campo ao lado.
                  Origem e especialidade ficam de fora porque já são
                  conhecidas: uma vem cravada na gravação, a outra vem do
                  agendamento. */}
              <div style={{ ...rotulo, marginTop: 16, marginBottom: 8 }}>Classificação do atendimento</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
                {DOMINIOS.filter(d => !["unidade_origem", "especialidade"].includes(d.chave)).map(d => (
                  <CampoCatalogo key={d.chave} label={d.label} dica={d.dica}
                    lista={catalogos[d.chave]} valor={presenca.ficha[`${d.chave}_cod`]}
                    onChange={v => setPresenca(p => ({ ...p, ficha: { ...p.ficha, [`${d.chave}_cod`]: v } }))} />
                ))}
              </div>

              {/* Quem atende, e o CBO — porque é o CBO que decide se a
                  produção é PROCESSADA. Sem grade com profissional, a agenda
                  não sabe, e a tela diz isso em vez de fingir. */}
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 10 }}>
                {presenca.medico
                  ? <>Atende: <strong>{presenca.medico.nome || presenca.medico.username}</strong>
                      {presenca.medico.cbo
                        ? <> · CBO {presenca.medico.cbo}</>
                        : <span style={{ color: "#d97706" }}> · sem CBO no cadastro — a produção SUS não é processada sem ele</span>}
                    </>
                  : <span style={{ color: "#d97706" }}>Esta grade não tem profissional definido — o atendimento nasce sem médico e sem CBO.</span>}
              </div>

              {/* As pendências ditas em voz alta, e SEM modal.
                  A Recepção usa um `confirm()` aqui e ele dispara em todo
                  atendimento — 80 cliques em OK por dia ensinam a fechar
                  aviso sem ler, e aí o dia em que o aviso é "a carteira está
                  vencida" passa junto. Aqui a pendência mora ao lado do
                  botão, e o próprio rótulo do botão a carrega. */}
              {confPresenca?.avisos?.length > 0 && (
                <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 8, fontSize: 12,
                              background: confPresenca.pendenciasGraves ? "#d9770610" : "var(--surface-2)",
                              border: `1px solid ${confPresenca.pendenciasGraves ? "#d9770655" : "var(--border)"}` }}>
                  <strong style={{ color: confPresenca.pendenciasGraves ? "#d97706" : "var(--text-muted)" }}>
                    {confPresenca.pendenciasGraves
                      ? `${confPresenca.pendenciasGraves} pendência(s) que impedem o faturamento`
                      : "Pendências menores"}
                  </strong>
                  <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                    {confPresenca.avisos.map(a => (
                      <div key={a.chave} style={{ color: a.gravidade === "alta" ? "var(--text)" : "var(--text-muted)" }}>
                        • {a.texto}
                      </div>
                    ))}
                  </div>
                  <div style={{ color: "var(--text-muted)", marginTop: 7 }}>
                    Nada disso impede a consulta. O que não fecha é a conta — e depois que o paciente for embora, isto vira telefonema.
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
                <button onClick={confirmarAPresenca} disabled={busy}
                  style={{ ...btn("#0d9488", !busy), color: "#fff" }}>
                  {busy ? "Confirmando…"
                    : confPresenca?.pendenciasGraves
                      ? `Confirmar com ${confPresenca.pendenciasGraves} pendência(s)`
                      : "Confirmar presença"}
                </button>
                <button onClick={() => setPresenca(null)} style={{ ...btn("var(--surface-2)", false), color: "var(--text)" }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

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
                        // Guarda o CADASTRO, não só o número: é o que permite
                        // a `podeMarcar` recusar óbito. Antes só o prontuário
                        // sobrevivia à escolha, e a regra ficava cega.
                        onClick={() => { setMarcando(x => ({ ...x, prontuario: p.prontuario, paciente: p })); setAchados([]); }}
                        style={{ ...btn("var(--surface-2)", false), color: "var(--text)" }}>
                        {comoExibir(p) || p.iniciais} · reg. {p.prontuario}
                        {p.obito ? <span style={{ color: "#fb7185" }}> · óbito registrado</span> : ""}
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

      {/* ══════════ PRODUÇÃO — conciliação com o painel do Ambulatório ══════════ */}
      {vista === "producao" && (
        <>
          <div style={cartao}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ width: 170 }}>
                <label style={lbl}>Dia</label>
                <input type="date" value={data} onChange={e => setData(e.target.value)} style={inp} />
              </div>
              <button onClick={() => setData(hojeISO())} style={{ ...btn("var(--surface-2)", false), color: "var(--text)", marginBottom: 2 }}>Hoje</button>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10, lineHeight: 1.55 }}>
              O painel do Ambulatório lê números <strong>digitados à mão</strong>. Aqui eles são apurados da
              agenda e comparados com o que está gravado. Gravar substitui o digitado pelo apurado —
              <strong> uma especialidade por vez, olhando a diferença</strong>. Emergências não aparecem:
              não passam pela agenda, então o número gravado é preservado como está.
            </div>
          </div>

          {conciliacao.semCorrespondencia.length > 0 && (
            <div style={{ ...cartao, borderLeft: "4px solid #d97706" }}>
              <div style={rotulo}>Sem correspondência no painel</div>
              {conciliacao.semCorrespondencia.map(s => (
                <div key={s.especialidadeCod} style={{ fontSize: 12.5, marginBottom: 4 }}>
                  <strong>{s.nome}</strong> — {s.apurada.realizadas} realizada(s), {s.apurada.ofertadas} ofertada(s).
                </div>
              ))}
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.5 }}>
                O painel do Ambulatório tem cinco especialidades pactuadas, e esta não é nenhuma delas.
                A produção existe e não tem onde ser gravada — melhor dizer isso do que gravar numa chave
                que nenhuma tela lê.
              </div>
            </div>
          )}

          <div style={cartao}>
            <div style={rotulo}>Apurado da agenda × gravado no painel</div>
            {carregando ? (
              <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>carregando…</div>
            ) : conciliacao.linhas.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                Nenhuma especialidade com grade ou agendamento em {data}.
              </div>
            ) : conciliacao.linhas.map(l => (
              <div key={l.especialidadeCod} style={{ borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 10 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 7 }}>
                  <strong style={{ fontSize: 13 }}>{l.label}</strong>
                  {l.bloqueado && <span style={{ fontSize: 11, color: "#f43f5e" }}>dia bloqueado</span>}
                  <span style={{ fontSize: 11.5, color: l.divergente ? "#d97706" : "var(--text-muted)" }}>
                    {!l.gravada ? "ainda não lançado no painel"
                      : l.divergente ? `${l.divergencias.length} número(s) diferentes` : "confere"}
                  </span>
                  {canEdit && l.divergente && (
                    <button onClick={() => gravarLinha(l)} disabled={busy}
                      style={{ ...btn("#0d9488", !busy), marginLeft: "auto", color: "#fff" }}>
                      {l.gravada ? "Substituir pelo apurado" : "Lançar no painel"}
                    </button>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 7 }}>
                  {CAMPOS_APURAVEIS.map(c => {
                    const div = l.divergencias.find(d => d.campo === c);
                    return (
                      <div key={c} style={{ background: "var(--surface-2)", border: "1px solid var(--border)",
                                            borderLeft: `3px solid ${div ? "#d97706" : "var(--border)"}`,
                                            borderRadius: 8, padding: "7px 10px" }}>
                        <div style={{ fontSize: 9.5, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>{c}</div>
                        <div style={{ fontSize: 17, fontWeight: 800, fontFamily: "JetBrains Mono, monospace" }}>
                          {l.apurada[c]}
                        </div>
                        <div style={{ fontSize: 10, color: div ? "#d97706" : "var(--text-muted)" }}>
                          {l.gravada ? `painel: ${l.gravada[c] ?? 0}` : "painel: —"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {conciliacao.orfas.length > 0 && (
            <div style={cartao}>
              <div style={rotulo}>Lançado à mão, sem agenda neste dia</div>
              {conciliacao.orfas.map(o => (
                <div key={o.id} style={{ fontSize: 12.5, marginBottom: 4 }}>
                  <strong>{o.label}</strong> — {o.gravada.realizadas ?? 0} realizada(s), {o.gravada.ofertadas ?? 0} ofertada(s).
                </div>
              ))}
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.5 }}>
                Não é zerado nem sugerido para correção: pode ser produção legítima que não passou pela
                agenda, e apagar destruiria o único registro que existe dela.
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════ RELATÓRIO DO MÊS ══════════ */}
      {vista === "relatorio" && (
        <RelatorioAmbulatorio sb={sb} grades={grades}
          catalogoEspecialidades={catalogos.especialidade || []} />
      )}
    </div>
  );
}
