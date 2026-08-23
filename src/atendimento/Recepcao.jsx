// ═══════════════════════════════════════════════════════════
// ATENDIMENTO — a tela da recepção
//
// A ORDEM DA TELA É A REGRA MAIS IMPORTANTE DELA: procura-se ANTES de
// cadastrar. Não é preferência de layout. Cadastro em primeiro lugar é
// como nasce prontuário duplicado — a recepcionista com fila na frente
// preenche o formulário que está aberto em vez de procurar quem já
// existe, e o histórico da pessoa passa a viver partido em dois números.
// Aqui não há formulário aberto para preencher enquanto ninguém procurou.
//
// O QUE ESTA TELA MOSTRA, E O QUE ESCONDE
// A lista de resultados mostra INICIAIS e data de nascimento: é o
// suficiente para desempatar quem é quem sem expor a identidade de várias
// pessoas numa tela que fica aberta no balcão, com gente atrás. O nome
// completo aparece só depois de escolhido o paciente — aí a tarefa exige,
// porque é o que se confere com a pessoa na frente.
//
// A lógica está em `recepcao.js` (pura, testada) e o acesso ao banco em
// `dados.js`. Aqui só há tela.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import CadastroPaciente from "../pacientes/CadastroPaciente.jsx";
// O bloco de fonte pagadora e o campo de catálogo moram fora desde que a
// Agenda passou a precisar dos dois. Duas cópias divergiriam na primeira
// regra nova de convênio — e regra de convênio muda por contrato.
import FontePagadora, { CampoCatalogo } from "./FontePagadora.jsx";
import { comoExibir, idadeDetalhada, rotuloSexo } from "../pacientes/identidade.js";
import {
  PS_ORIGENS, PS_ORIGEM_UNIDADES, psPedeDetalhe, TIPOS_DISPONIVEIS,
  classificarBusca, filtroBuscaPacientes, validarAbertura,
  pendenciasDeIdentificacao, aguardandoIdentificacao,
} from "./recepcao.js";
import {
  buscarPacientes, carregarPaciente, emitirProntuario,
  criarPacienteNaoIdentificado, atendimentosAbertos, abrirAtendimento,
  listarAguardandoIdentificacao, concluirIdentificacao,
  carregarCatalogos, carregarProfissionais,
  carregarAtendimento, corrigirAtendimento, cancelarAtendimento,
  contarRegistrosClinicos,
} from "./dados.js";
import {
  DOMINIOS, conferirFicha,
} from "./ficha.js";
import {
  STATUS_ATENDIMENTO, validarCorrecao, validarCancelamento,
} from "./ciclo.js";
import Impressos from "./Impressos.jsx";
import ResponsavelDoEpisodio from "./Responsavel.jsx";

const cartao = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.1rem 1.25rem", marginBottom: 14 };
const rotulo = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 };
const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 11px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
const lbl = { fontSize: 10.5, color: "var(--text-muted)", display: "block", marginBottom: 3 };
const btn = (cor, ativo = true) => ({
  background: ativo ? cor : "var(--surface-2)", color: ativo ? "#000" : "var(--text-muted)",
  border: ativo ? "none" : "1px solid var(--border)", borderRadius: 6, padding: "9px 18px",
  fontWeight: 700, cursor: ativo ? "pointer" : "not-allowed", fontSize: 13, whiteSpace: "nowrap",
});

/** Como o paciente aparece na LISTA — mínimo necessário para desempatar. */
function LinhaResultado({ p, onEscolher }) {
  const idade = idadeDetalhada(p.data_nascimento);
  return (
    <button onClick={() => onEscolher(p)}
      style={{ textAlign: "left", background: "var(--surface-2)", border: "1px solid var(--border)",
               borderRadius: 8, padding: "10px 12px", cursor: "pointer", color: "var(--text)", width: "100%" }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>
        {comoExibir(p) || p.iniciais || "—"}
        <span style={{ fontWeight: 400, color: "var(--text-muted)" }}> · reg. {p.prontuario}</span>
        {aguardandoIdentificacao(p) && (
          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, color: "#d97706" }}>● identificação pendente</span>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>
        {idade ? `${idade.rotulo}` : p.ano_nascimento ? `~${new Date().getFullYear() - p.ano_nascimento} anos` : "idade não cadastrada"}
        {" · "}{rotuloSexo(p.sexo)}
        {p.obito ? " · óbito registrado" : ""}
      </div>
    </button>
  );
}

export default function Recepcao({ sb, currentUser, canEdit }) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscou, setBuscou] = useState(false);
  const [buscando, setBuscando] = useState(false);

  const [paciente, setPaciente] = useState(null);
  const [abertos, setAbertos] = useState([]);
  const [cadastrando, setCadastrando] = useState(null);   // { prontuario } quando o formulário está aberto
  const [pendentes, setPendentes] = useState([]);
  const [verPendentes, setVerPendentes] = useState(false);

  const [f, setF] = useState({ tipo: "emergencia", origem: "Meios próprios", origemDetalhe: "", queixa: "" });
  const [msg, setMsg] = useState(null);      // { tom: "erro" | "ok", texto }
  const [busy, setBusy] = useState(false);

  // ── a ficha administrativa ──
  const [catalogos, setCatalogos] = useState(null);   // null = ainda carregando
  const [profissionais, setProfissionais] = useState([]);
  const [ficha, setFicha] = useState({});
  const [medicoUser, setMedicoUser] = useState("");
  const [corrigindo, setCorrigindo] = useState(null);   // { atendimento, campos }
  // { paciente, atendimento } — a etapa de impressão, depois de abrir.
  const [imprimindo, setImprimindo] = useState(null);
  // Os responsáveis do episódio que está na tela — sobem do componente
  // para a ficha impressa sair com quem recebe a alta.
  const [responsaveis, setResponsaveis] = useState([]);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const setFi = (k, v) => setFicha(p => ({ ...p, [k]: v }));

  const recarregarPendentes = useCallback(async () => {
    setPendentes(await listarAguardandoIdentificacao(sb));
  }, [sb]);

  useEffect(() => { recarregarPendentes(); }, [recarregarPendentes]);

  useEffect(() => {
    let vivo = true;
    Promise.all([carregarCatalogos(sb), carregarProfissionais(sb)]).then(([c, p]) => {
      if (!vivo) return;
      setCatalogos(c);
      setProfissionais(p);
    });
    return () => { vivo = false; };
  }, [sb]);

  async function fazerBusca() {
    const filtro = filtroBuscaPacientes(termo);
    if (!filtro) {
      setMsg({ tom: "erro", texto: classificarBusca(termo).tipo === "vazio"
        ? "Digite o nome, o CPF, o Cartão SUS ou o número do prontuário."
        : "Digite pelo menos 3 letras do nome." });
      return;
    }
    setBuscando(true); setMsg(null);
    const r = await buscarPacientes(sb, termo);
    setResultados(r); setBuscou(true); setBuscando(false);
    if (r.length === 1) escolher(r[0]);
  }

  /**
   * Troca o paciente da tela — e ZERA a ficha junto.
   *
   * O reset não é higiene: sem ele, a ficha do paciente ANTERIOR fica na
   * tela. O caminho real é este: a recepcionista seleciona a Maria, escolhe
   * Unimed, digita a carteira e o CID, é interrompida, e clica em
   * "Completar cadastro" de outro paciente na faixa de pendências — que
   * chama esta mesma função. A tela troca de pessoa e mantém convênio,
   * carteira e CID preenchidos. Um clique em "Abrir atendimento" e o
   * episódio nasce com a carteirinha de OUTRA pessoa: não é glosa, é
   * problema com a operadora, e ninguém descobre pela tela.
   *
   * `termo`, `resultados` e `buscou` NÃO são zerados de propósito — a lista
   * de busca precisa continuar na tela para a recepcionista poder voltar e
   * escolher outro nome sem redigitar.
   */
  async function escolher(p) {
    const completo = await carregarPaciente(sb, p.prontuario);
    const alvo = completo || p;
    setPaciente(alvo);
    setCadastrando(null);
    setF({ tipo: "emergencia", origem: "Meios próprios", origemDetalhe: "", queixa: "" });
    setFicha({}); setMedicoUser(""); setCorrigindo(null);
    setImprimindo(null); setResponsaveis([]);
    setAbertos(await atendimentosAbertos(sb, alvo.prontuario));
    setMsg(null);
  }

  function recomecar() {
    setPaciente(null); setAbertos([]); setCadastrando(null);
    setResultados([]); setBuscou(false); setTermo(""); setMsg(null);
    setF({ tipo: "emergencia", origem: "Meios próprios", origemDetalhe: "", queixa: "" });
    setFicha({}); setMedicoUser(""); setCorrigindo(null);
    setImprimindo(null); setResponsaveis([]);
  }

  /**
   * Abre a impressão de um atendimento que já existe.
   *
   * Recarrega do banco pelo mesmo motivo da correção: a lista traz só o
   * suficiente para desenhar a linha, e uma pulseira impressa a partir dela
   * sairia sem convênio, sem especialidade e sem a hora certa de chegada.
   */
  async function imprimirDe(a) {
    setMsg(null);
    const completo = await carregarAtendimento(sb, a.id);
    setImprimindo({ paciente, atendimento: completo || a, origem: "lista" });
  }

  /**
   * Abre a correção com os valores ATUAIS do atendimento.
   *
   * Carrega do banco em vez de usar o que a lista trouxe: a lista traz só o
   * suficiente para mostrar a linha, e um formulário aberto em branco
   * gravaria `null` em cima do que já estava certo.
   */
  async function abrirCorrecao(a) {
    if (!canEdit) return;
    setMsg(null);
    const completo = await carregarAtendimento(sb, a.id);
    if (!completo) { setMsg({ tom: "erro", texto: "Não foi possível carregar este atendimento." }); return; }
    setCorrigindo({
      atendimento: completo,
      campos: {
        convenio_id: completo.convenio_id ?? "", plano_id: completo.plano_id ?? "",
        carteira: completo.carteira ?? "", guia_numero: completo.guia_numero ?? "",
        autorizacao_senha: completo.autorizacao_senha ?? "",
        tipo_atendimento_cod: completo.tipo_atendimento_cod ?? "",
        especialidade_cod: completo.especialidade_cod ?? "",
        procedimento_cod: completo.procedimento_cod ?? "",
        cid: completo.cid ?? "", queixa: completo.queixa ?? "",
      },
    });
  }

  async function salvarCorrecao() {
    if (!canEdit || busy || !corrigindo) return;
    const v = validarCorrecao({ atendimento: corrigindo.atendimento, campos: corrigindo.campos });
    if (!v.ok) { setMsg({ tom: "erro", texto: v.erros.join(" ") }); return; }
    if (v.avisos.length && !confirm(v.avisos.join("\n\n") + "\n\nSeguir?")) return;
    setBusy(true);
    const r = await corrigirAtendimento(sb, corrigindo.atendimento.id, corrigindo.campos, currentUser);
    setBusy(false);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    setCorrigindo(null);
    setMsg({ tom: "ok", texto: `Atendimento #${r.atendimento.id} corrigido.` });
    setAbertos(await atendimentosAbertos(sb, paciente.prontuario));
  }

  /**
   * Cancela — depois de contar o que está pendurado no atendimento.
   *
   * A contagem vem ANTES de pedir o motivo: se o atendimento já tem
   * evolução ou prescrição, ele aconteceu, e cancelar deixaria registro
   * clínico órfão. Melhor recusar antes de a pessoa digitar a justificativa.
   */
  async function cancelarEste(a) {
    if (!canEdit) return;
    setMsg(null);
    const clinicos = await contarRegistrosClinicos(sb, a.id);
    const previa = validarCancelamento({ atendimento: a, motivo: "conferencia previa", registrosClinicos: clinicos });
    if (!previa.ok) { setMsg({ tom: "erro", texto: previa.erros.join(" ") }); return; }

    const motivo = prompt("Por que este atendimento está sendo cancelado?\n\nA justificativa fica gravada com seu nome — é o que alguém vai ler numa auditoria.");
    if (motivo === null) return;
    const v = validarCancelamento({ atendimento: a, motivo, registrosClinicos: clinicos });
    if (!v.ok) { setMsg({ tom: "erro", texto: v.erros.join(" ") }); return; }
    if (v.avisos.length && !confirm(v.avisos.join("\n\n") + "\n\nSeguir?")) return;

    setBusy(true);
    const r = await cancelarAtendimento(sb, a.id, motivo, currentUser);
    setBusy(false);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    setMsg({ tom: "ok", texto: `Atendimento #${a.id} cancelado.` });
    setAbertos(await atendimentosAbertos(sb, paciente.prontuario));
  }

  /** Cadastro novo: o número vem do BANCO, não da cabeça de quem atende. */
  async function cadastrarNovo() {
    if (!canEdit) return;
    setBusy(true); setMsg(null);
    const r = await emitirProntuario(sb);
    setBusy(false);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    setPaciente(null);
    setCadastrando({ prontuario: r.prontuario });
  }

  /**
   * Entrada sem identificação — um clique e o paciente existe.
   *
   * NADA é perguntado aqui de propósito. Este botão é usado exatamente na
   * situação em que ninguém tem tempo: o paciente está chegando e precisa
   * entrar na fila agora. Sexo aparente, idade aparente e sinais para
   * identificar depois são registrados no cadastro, que fica aberto na
   * tela em seguida — e continuam cobrados na lista de pendências até
   * alguém preencher.
   */
  async function entrarSemIdentificacao() {
    if (!canEdit) return;
    if (!confirm(
      "Abrir cadastro para paciente SEM IDENTIFICAÇÃO?\n\n" +
      "É o caminho previsto pela CFM 1.638/2002 para quem chega sem condição de se identificar. " +
      "O sistema emite um prontuário agora e mantém a pendência aberta até alguém completar o cadastro.\n\n" +
      "Se o paciente PODE ser identificado, procure antes — abrir aqui cria um segundo prontuário para quem talvez já exista.")) return;

    setBusy(true); setMsg(null);
    const emitido = await emitirProntuario(sb);
    if (!emitido.ok) { setBusy(false); setMsg({ tom: "erro", texto: emitido.motivo }); return; }

    const r = await criarPacienteNaoIdentificado(sb, { prontuario: emitido.prontuario }, currentUser);
    setBusy(false);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    setPaciente(r.paciente);
    setAbertos([]);
    recarregarPendentes();
    setMsg({ tom: "ok", texto: `Prontuário ${r.paciente.prontuario} emitido. Abra o atendimento — a identificação fica pendente e aparece na lista da recepção.` });
  }

  async function abrir() {
    if (!canEdit || busy) return;
    const v = validarAbertura({
      paciente, tipo: f.tipo, origem: f.origem,
      origemDetalhe: f.origemDetalhe, atendimentosAbertos: abertos,
    });
    if (!v.ok) { setMsg({ tom: "erro", texto: v.erros.join(" ") }); return; }

    // Avisos NÃO impedem — mas precisam ser lidos antes de seguir.
    const bloqueantes = v.avisos.filter(a => a.chave === "atendimento_aberto" || a.chave === "obito");
    if (bloqueantes.length &&
        !confirm(bloqueantes.map(a => `• ${a.texto}`).join("\n\n") + "\n\nAbrir mesmo assim?")) return;

    // Pendência de faturamento também não impede — mas quem abre precisa
    // ter visto. Confirmar aqui é o que separa "ninguém percebeu" de
    // "alguém decidiu seguir assim".
    if (conf.pendenciasGraves > 0 &&
        !confirm(
          "Este atendimento tem pendência que impede o faturamento:\n\n" +
          conf.avisos.filter(a => a.gravidade === "alta").map(a => `• ${a.texto}`).join("\n\n") +
          "\n\nO atendimento pode ser aberto assim mesmo — a conta é que não fecha.\n\nAbrir?")) return;

    setBusy(true);
    const r = await abrirAtendimento(sb, {
      paciente, tipo: f.tipo, origem: f.origem,
      origemDetalhe: f.origemDetalhe, queixa: f.queixa,
      ficha, medico: medicoEscolhido,
    }, currentUser);
    setBusy(false);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    const nome = comoExibir(paciente) || paciente.iniciais;
    // NÃO recomeça aqui. A tela vai para a impressão, que é o último passo
    // do balcão: paciente que sai sem pulseira volta identificado só pela
    // memória de quem o recebeu. Quem fecha a impressão é que libera a tela
    // para o próximo.
    setImprimindo({ paciente, atendimento: r.atendimento, origem: "abertura" });
    setMsg({ tom: "ok", texto: `Atendimento #${r.atendimento.id} aberto para ${nome} (reg. ${r.atendimento.prontuario}). O paciente está na fila de triagem do Pronto-Socorro — imprima a pulseira antes de ele sair do balcão.` });
  }

  async function marcarIdentificado(p) {
    if (!canEdit) return;
    const r = await concluirIdentificacao(sb, p.prontuario, currentUser);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    recarregarPendentes();
    setMsg({ tom: "ok", texto: `Identificação do prontuário ${p.prontuario} concluída.` });
  }

  const pend = paciente ? pendenciasDeIdentificacao(paciente) : null;
  const aviso = paciente ? validarAbertura({ paciente, tipo: f.tipo, origem: f.origem, origemDetalhe: f.origemDetalhe, atendimentosAbertos: abertos }).avisos : [];

  const cat = catalogos || {};
  const convenio = (cat.convenios || []).find(c => String(c.id) === String(ficha.convenio_id)) || null;
  const plano = (cat.planos || []).find(p => String(p.id) === String(ficha.plano_id)) || null;
  const procedimento = (cat.procedimentos || []).find(p => p.codigo === ficha.procedimento_cod) || null;
  const medicoEscolhido = profissionais.find(p => p.username === medicoUser) || null;
  // `convenio` continua aqui porque `conferirFicha` precisa dele. O plano do
  // convênio, as exigências e o tipo passaram a ser calculados dentro do
  // <FontePagadora>, que é quem os desenha.
  const conf = conferirFicha({
    paciente, convenio, plano, ficha, procedimento,
    medico: medicoEscolhido, catalogos: cat,
  });

  return (
    <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Atendimento — Recepção</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: "1.25rem" }}>
        Identifica o paciente, emite o prontuário quando ele ainda não tem, e abre o atendimento.
        Todo atendimento nasce ligado a um cadastro — é o que mantém o histórico da pessoa inteiro.
      </div>

      {msg && (
        <div style={{ ...cartao, borderLeft: `4px solid ${msg.tom === "erro" ? "#f43f5e" : "#34d399"}`,
                      background: msg.tom === "erro" ? "#f43f5e10" : "#34d39910", fontSize: 13 }}>
          {msg.texto}
        </div>
      )}

      {/* ── RESPONSÁVEL + IMPRESSÃO — o último passo do balcão ──
          Nesta ordem de propósito: quem trouxe o paciente ainda está na
          frente. Depois que ele sai, descobrir quem era vira telefonema. */}
      {imprimindo && (
        <ResponsavelDoEpisodio
          sb={sb} currentUser={currentUser} canEdit={canEdit}
          paciente={imprimindo.paciente} atendimento={imprimindo.atendimento}
          onMudou={setResponsaveis}
        />
      )}

      {imprimindo && (
        <Impressos
          responsaveis={responsaveis}
          paciente={imprimindo.paciente}
          atendimento={imprimindo.atendimento}
          catalogos={cat}
          convenio={(cat.convenios || []).find(c => String(c.id) === String(imprimindo.atendimento?.convenio_id)) || null}
          plano={(cat.planos || []).find(p => String(p.id) === String(imprimindo.atendimento?.plano_id)) || null}
          procedimento={(cat.procedimentos || []).find(p => p.codigo === imprimindo.atendimento?.procedimento_cod) || null}
          currentUser={currentUser}
          onFechar={imprimindo.origem === "abertura" ? recomecar : () => setImprimindo(null)}
        />
      )}

      {/* ── PENDÊNCIAS DE IDENTIFICAÇÃO ── */}
      {!imprimindo && pendentes.length > 0 && (
        <div style={{ ...cartao, borderLeft: "4px solid #d97706" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 13 }}>
              {pendentes.length} paciente{pendentes.length > 1 ? "s" : ""} aguardando identificação
            </strong>
            <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
              entraram sem documento e o cadastro segue incompleto
            </span>
            <button onClick={() => setVerPendentes(v => !v)}
              style={{ ...btn("#d97706"), marginLeft: "auto", padding: "6px 12px", fontSize: 12 }}>
              {verPendentes ? "Ocultar" : "Ver lista"}
            </button>
          </div>
          {verPendentes && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
              {pendentes.map(p => (
                <div key={p.prontuario} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
                                                 background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 11px" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>reg. {p.prontuario}</span>
                  <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{rotuloSexo(p.sexo)}</span>
                  <span style={{ fontSize: 11.5, color: "var(--text-muted)", flex: 1, minWidth: 180 }}>{p.observacao || ""}</span>
                  <button onClick={() => escolher(p)} style={{ ...btn("#22d3ee"), padding: "5px 11px", fontSize: 11.5 }}>Completar cadastro</button>
                  {canEdit && <button onClick={() => marcarIdentificado(p)} style={{ ...btn("var(--surface-2)", false), padding: "5px 11px", fontSize: 11.5, color: "var(--text)" }}>Já identificado</button>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 1. PROCURAR ── */}
      {!imprimindo && !paciente && !cadastrando && (
        <div style={cartao}>
          <div style={rotulo}>1. Procure o paciente antes de cadastrar</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={termo} onChange={e => setTermo(e.target.value)}
              onKeyDown={e => e.key === "Enter" && fazerBusca()}
              placeholder="Nome, nome da mãe, CPF, Cartão SUS ou nº do prontuário"
              style={{ ...inp, flex: 1, minWidth: 260 }} />
            <button onClick={fazerBusca} disabled={buscando} style={btn("#22d3ee", !buscando)}>
              {buscando ? "Procurando…" : "Procurar"}
            </button>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
            Procurar primeiro é o que evita dois prontuários para a mesma pessoa — com o histórico dividido entre eles.
          </div>

          {buscou && (
            <div style={{ marginTop: 14 }}>
              {resultados.length > 0 ? (
                <>
                  <div style={{ ...rotulo, marginBottom: 8 }}>{resultados.length} encontrado(s)</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {resultados.map(p => <LinhaResultado key={p.prontuario} p={p} onEscolher={escolher} />)}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12.5, color: "var(--text-muted)", padding: "0.9rem",
                              border: "1px dashed var(--border)", borderRadius: 8 }}>
                  Nenhum paciente encontrado com esse dado.
                </div>
              )}

              {canEdit && (
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <button onClick={cadastrarNovo} disabled={busy} style={btn("#34d399", !busy)}>
                    + Cadastrar paciente novo
                  </button>
                  <button onClick={entrarSemIdentificacao} disabled={busy} style={{ ...btn("#f43f5e", !busy), color: "#fff" }}>
                    Emergência — paciente sem identificação
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 2. CADASTRO (paciente novo ou completando o que falta) ── */}
      {!imprimindo && cadastrando && (
        <div style={cartao}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={rotulo}>2. Cadastro do paciente</div>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>
              prontuário <strong>{cadastrando.prontuario}</strong> — emitido pelo sistema
            </span>
            <button onClick={recomecar} style={{ ...btn("var(--surface-2)", false), marginLeft: "auto", color: "var(--text)" }}>Cancelar</button>
          </div>
          {/* `paciente` vai preenchido quando se está COMPLETANDO um
              cadastro que já existe — sem isso o formulário abriria em
              branco e salvar apagaria o que já estava lá. */}
          <CadastroPaciente
            sb={sb} prontuario={cadastrando.prontuario} paciente={cadastrando.paciente || null}
            canEdit={canEdit} currentUser={currentUser}
            onSalvo={async salvo => {
              const p = salvo?.prontuario ? salvo : await carregarPaciente(sb, cadastrando.prontuario);
              setCadastrando(null);
              recarregarPendentes();
              if (p) { setPaciente(p); setAbertos(await atendimentosAbertos(sb, p.prontuario)); }
            }}
            onCancelar={() => (cadastrando.paciente ? setCadastrando(null) : recomecar())}
          />
        </div>
      )}

      {/* ── 3. PACIENTE ESCOLHIDO + ABERTURA ── */}
      {!imprimindo && paciente && (
        <>
          <div style={cartao}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>
                {/* Nome completo aqui é a tarefa: é o que se confere com a
                    pessoa na frente antes de abrir o atendimento. */}
                {comoExibir(paciente, { completo: true }) || paciente.iniciais}
              </div>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>· prontuário {paciente.prontuario}</span>
              <button onClick={recomecar} style={{ ...btn("var(--surface-2)", false), marginLeft: "auto", color: "var(--text)" }}>Trocar paciente</button>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
              {(() => {
                const i = idadeDetalhada(paciente.data_nascimento);
                return i ? `${i.rotulo} (${paciente.data_nascimento})` : "idade não cadastrada";
              })()}
              {" · "}{rotuloSexo(paciente.sexo)}
              {paciente.nome_mae ? ` · mãe: ${paciente.nome_mae}` : ""}
            </div>

            {pend && !pend.completo && (
              <div style={{ marginTop: 10, padding: "9px 12px", borderRadius: 8,
                            background: "#d9770610", border: "1px solid #d9770655", fontSize: 12 }}>
                <strong style={{ color: "#d97706" }}>Cadastro incompleto</strong> — falta{" "}
                {pend.pendencias.filter(x => x.nivel === "essencial").map(x => x.label).join(", ") || "—"}.
                {canEdit && (
                  <button onClick={() => setCadastrando({ prontuario: paciente.prontuario, paciente })}
                    style={{ ...btn("#d97706"), marginLeft: 10, padding: "4px 10px", fontSize: 11.5 }}>
                    Completar agora
                  </button>
                )}
                <div style={{ color: "var(--text-muted)", marginTop: 4 }}>
                  Pode abrir o atendimento assim mesmo — o que não pode é a pendência sumir da vista.
                </div>
              </div>
            )}

            {aviso.filter(a => a.chave !== "cadastro_incompleto" && a.chave !== "nao_identificado").map(a => (
              <div key={a.chave} style={{ marginTop: 10, padding: "9px 12px", borderRadius: 8,
                                          background: "#f43f5e10", border: "1px solid #f43f5e55", fontSize: 12 }}>
                {a.texto}
              </div>
            ))}
          </div>

          {canEdit && (
            <div style={cartao}>
              <div style={rotulo}>3. Abrir atendimento</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
                <div>
                  <label style={lbl}>Tipo</label>
                  <select value={f.tipo} onChange={e => set("tipo", e.target.value)} style={inp}>
                    {TIPOS_DISPONIVEIS.map(t => <option key={t.chave} value={t.chave}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Como chegou *</label>
                  <select value={f.origem} onChange={e => set("origem", e.target.value)} style={inp}>
                    {PS_ORIGENS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                {psPedeDetalhe(f.origem) && (
                  <div>
                    <label style={lbl}>Unidade de procedência *</label>
                    <input list="recepcao-unidades" value={f.origemDetalhe}
                      onChange={e => set("origemDetalhe", e.target.value)} style={inp} placeholder="Ex.: PA Torres" />
                    <datalist id="recepcao-unidades">
                      {PS_ORIGEM_UNIDADES.map(u => <option key={u} value={u} />)}
                    </datalist>
                  </div>
                )}
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={lbl}>Queixa relatada na chegada</label>
                  <input value={f.queixa} onChange={e => set("queixa", e.target.value)} style={inp}
                    placeholder="O que a pessoa diz que está sentindo — a classificação é da triagem" />
                </div>
              </div>

              {/* ── FONTE PAGADORA ── */}
              <FontePagadora catalogos={cat} ficha={ficha} onChange={setFicha} />

              {/* ── CLASSIFICAÇÃO ── */}
              <div style={{ ...rotulo, marginTop: 18, marginBottom: 8 }}>Classificação do atendimento</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
                {DOMINIOS.map(d => (
                  <CampoCatalogo key={d.chave} label={d.label} lista={cat[d.chave]}
                    valor={ficha[`${d.chave}_cod`]} onChange={v => setFi(`${d.chave}_cod`, v)} />
                ))}
              </div>

              {/* ── ATO E RESPONSÁVEL ── */}
              <div style={{ ...rotulo, marginTop: 18, marginBottom: 8 }}>Ato e responsável</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
                <div>
                  <label style={lbl}>Profissional responsável</label>
                  <select value={medicoUser} onChange={e => setMedicoUser(e.target.value)} style={inp}>
                    <option value="">— definir depois</option>
                    {profissionais.map(p => (
                      <option key={p.username} value={p.username}>{p.nome || p.username}</option>
                    ))}
                  </select>
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3 }}>
                    {medicoEscolhido
                      ? (medicoEscolhido.cbo ? `CBO ${medicoEscolhido.cbo}` : "sem CBO no cadastro")
                      : "No PS costuma ficar em branco — quem atende só se sabe depois da triagem."}
                  </div>
                </div>
                <CampoCatalogo label="Procedimento" lista={cat.procedimentos}
                  valor={ficha.procedimento_cod} onChange={v => setFi("procedimento_cod", v)} />
                <div>
                  <label style={lbl}>CID</label>
                  <input value={ficha.cid || ""} onChange={e => setFi("cid", e.target.value)} style={inp} placeholder="Ex.: I10" />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, paddingTop: 16 }}>
                  <input id="rec-at" type="checkbox" checked={!!ficha.acidente_trabalho}
                    onChange={e => setFi("acidente_trabalho", e.target.checked)} />
                  <label htmlFor="rec-at" style={{ fontSize: 12.5, cursor: "pointer" }}>Acidente de trabalho</label>
                </div>
              </div>
              {ficha.acidente_trabalho && (
                <div style={{ fontSize: 11.5, color: "#d97706", marginTop: 6 }}>
                  Acidente de trabalho troca o pagador e exige CAT — confirme com o setor responsável.
                </div>
              )}

              {/* ── PENDÊNCIAS DE FATURAMENTO ── */}
              {conf.avisos.length > 0 && (
                <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 8, fontSize: 12,
                              background: conf.pendenciasGraves ? "#d9770610" : "var(--surface-2)",
                              border: `1px solid ${conf.pendenciasGraves ? "#d9770655" : "var(--border)"}` }}>
                  <strong style={{ color: conf.pendenciasGraves ? "#d97706" : "var(--text-muted)" }}>
                    {conf.pendenciasGraves
                      ? `${conf.pendenciasGraves} pendência(s) que impedem o faturamento`
                      : "Pendências menores"}
                  </strong>
                  <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                    {conf.avisos.map(a => (
                      <div key={a.chave} style={{ color: a.gravidade === "alta" ? "var(--text)" : "var(--text-muted)" }}>
                        • {a.texto}
                      </div>
                    ))}
                  </div>
                  <div style={{ color: "var(--text-muted)", marginTop: 7 }}>
                    Nada disso impede o atendimento. O que não fecha é a conta.
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
                <button onClick={abrir} disabled={busy} style={btn("#22d3ee", !busy)}>
                  {busy ? "Abrindo…" : "Abrir atendimento"}
                </button>
                <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                  O paciente entra na fila de triagem do Pronto-Socorro.
                </span>
              </div>
            </div>
          )}

          {abertos.length > 0 && (
            <div style={{ ...cartao, borderLeft: "4px solid #d97706" }}>
              <div style={rotulo}>Atendimentos em aberto deste paciente</div>
              {abertos.map(a => (
                <div key={a.id} style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap",
                                         fontSize: 12.5, padding: "6px 0", color: "var(--text-muted)" }}>
                  <span>#{a.id} · {STATUS_ATENDIMENTO[a.status]?.label || a.status} · {a.tipo_atendimento || "emergência"} · desde {new Date(a.chegada_em).toLocaleString("pt-BR")}</span>
                  {/* Imprimir não depende de `canEdit`: reimprimir pulseira
                      não altera nada, e quem só consulta precisa poder
                      repor a que rasgou. */}
                  <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                    <button onClick={() => imprimirDe(a)}
                      style={{ ...btn("var(--surface-2)", false), color: "var(--text)", padding: "4px 10px", fontSize: 11 }}>Imprimir</button>
                  </span>
                  {canEdit && (
                    <span style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => abrirCorrecao(a)}
                        style={{ ...btn("var(--surface-2)", false), color: "var(--text)", padding: "4px 10px", fontSize: 11 }}>Corrigir</button>
                      <button onClick={() => cancelarEste(a)}
                        style={{ ...btn("var(--surface-2)", false), color: "var(--text)", padding: "4px 10px", fontSize: 11 }}>Cancelar</button>
                    </span>
                  )}
                </div>
              ))}
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                Corrigir muda o dado administrativo. Cancelar não apaga — marca o atendimento como
                não-válido, com motivo e autor. Paciente errado se resolve cancelando e abrindo outro.
              </div>
            </div>
          )}

          {/* ── CORREÇÃO ── */}
          {corrigindo && (
            <div style={{ ...cartao, borderLeft: "4px solid #6366f1" }}>
              <div style={rotulo}>Corrigir atendimento #{corrigindo.atendimento.id}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                <CampoCatalogo label="Convênio" lista={cat.convenios} campoValor="id"
                  valor={corrigindo.campos.convenio_id}
                  onChange={v => setCorrigindo(p => ({ ...p, campos: { ...p.campos, convenio_id: v, plano_id: "" } }))} />
                <div>
                  <label style={lbl}>Carteira</label>
                  <input value={corrigindo.campos.carteira ?? ""} style={inp}
                    onChange={e => setCorrigindo(p => ({ ...p, campos: { ...p.campos, carteira: e.target.value } }))} />
                </div>
                <div>
                  <label style={lbl}>Nº da guia</label>
                  <input value={corrigindo.campos.guia_numero ?? ""} style={inp}
                    onChange={e => setCorrigindo(p => ({ ...p, campos: { ...p.campos, guia_numero: e.target.value } }))} />
                </div>
                <div>
                  <label style={lbl}>Senha de autorização</label>
                  <input value={corrigindo.campos.autorizacao_senha ?? ""} style={inp}
                    onChange={e => setCorrigindo(p => ({ ...p, campos: { ...p.campos, autorizacao_senha: e.target.value } }))} />
                </div>
                <CampoCatalogo label="Tipo de atendimento" lista={cat.tipo_atendimento}
                  valor={corrigindo.campos.tipo_atendimento_cod}
                  onChange={v => setCorrigindo(p => ({ ...p, campos: { ...p.campos, tipo_atendimento_cod: v } }))} />
                <CampoCatalogo label="Especialidade" lista={cat.especialidade}
                  valor={corrigindo.campos.especialidade_cod}
                  onChange={v => setCorrigindo(p => ({ ...p, campos: { ...p.campos, especialidade_cod: v } }))} />
                <CampoCatalogo label="Procedimento" lista={cat.procedimentos}
                  valor={corrigindo.campos.procedimento_cod}
                  onChange={v => setCorrigindo(p => ({ ...p, campos: { ...p.campos, procedimento_cod: v } }))} />
                <div>
                  <label style={lbl}>CID</label>
                  <input value={corrigindo.campos.cid ?? ""} style={inp}
                    onChange={e => setCorrigindo(p => ({ ...p, campos: { ...p.campos, cid: e.target.value } }))} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={lbl}>Queixa relatada</label>
                  <input value={corrigindo.campos.queixa ?? ""} style={inp}
                    onChange={e => setCorrigindo(p => ({ ...p, campos: { ...p.campos, queixa: e.target.value } }))} />
                </div>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 10 }}>
                Só dado administrativo. Classificação de risco, sinais vitais e desfecho são registro
                assistencial — corrigem-se por novo registro, não por edição.
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={salvarCorrecao} disabled={busy} style={btn("#22d3ee", !busy)}>
                  {busy ? "Salvando…" : "Salvar correção"}
                </button>
                <button onClick={() => setCorrigindo(null)}
                  style={{ ...btn("var(--surface-2)", false), color: "var(--text)" }}>Cancelar</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
