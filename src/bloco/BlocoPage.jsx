// ═══════════════════════════════════════════════════════════
// BLOCO CIRÚRGICO — A TELA
//
// Saiu do App.jsx. O catálogo está em ./catalogo.js, o acesso ao banco em
// ./dados.js e as regras de agenda em ./agenda.js.
//
// ⚠️ O `sb` chega por prop. Nulo = sem banco.
// ═══════════════════════════════════════════════════════════

import { registrarAuditoria } from "../auditoria/dados.js";
import { assinaturaDe } from "../clinico/papeis.js";
import { MONTHS, MONTHS_FULL, btnContorno } from "../ui/base.jsx";
import { diffMin, fmtDataBR, fmtDur, horaFmt, nowISO, todayStr } from "../util/datas.js";
import { conflitosDeSala, diasUteisNoMes } from "./agenda.js";
import { CC_MOTIVOS_CANCELAMENTO, CC_STATUS, CHECKLIST_OMS, LATERALIDADE } from "./catalogo.js";
import { MOTIVO_MIN, confirmados, conferirRegistro, contagensQueNaoFecham, contagemFecha, linhaDaConferencia, linhaDoPulo, conferirPulo, resumoDaTrilha, pendenteAntesDe } from "./cirurgia-segura.js";
import { CARATER, PAPEIS_EQUIPE, PAPEL_POR_CHAVE, conferirMembro, linhaDeEquipe, pendenciasDeFaturamento, resumoDaEquipe, procedimentoEscolhido } from "./equipe.js";
import { addCcCirurgiaRemote, addMembroEquipe, deleteCcSalaRemote, loadCcChecklistDoDia, loadCcCirurgias, loadCcEquipeDoDia, loadCcSalas, loadAtendimentosDoPaciente, loadPacientesDoMapa, loadProcedimentosDoCatalogo, loadProfissionaisDoBloco, registrarChecklist, removerMembroEquipe, updateCcCirurgiaRemote, upsertCcSalaRemote } from "./dados.js";
import { conferirIniciaisDaCirurgia, indexarCadastros, iniciaisDoAgendamento } from "./identidade-cirurgia.js";
import { useEffect, useState } from "react";
import { listaLida, naoDeuParaLer, algumaFalhou, avisoDeFalha } from "../util/leitura.js";

/**
 * A assinatura de quem conduziu, carimbada NO ATO.
 *
 * Nome + conselho + registro, como o resto do PEP faz (CFM 2.299/2021,
 * COFEN 754/2024). Carimbada e não referenciada porque o cadastro muda e
 * o registro não: quem assinou o Sign In de hoje assinou com o conselho
 * que tinha hoje.
 */
function assinaturaTexto(user) {
  const a = assinaturaDe(user);
  if (!a?.profissional_nome) return null;
  return [a.profissional_nome, a.conselho && a.registro_conselho ? `${a.conselho} ${a.registro_conselho}` : null]
    .filter(Boolean).join(" · ");
}

// ── Página Bloco Cirúrgico ──
export default function BlocoPage({ sb, currentUser, canEdit }) {
  const [data, setData] = useState(todayStr());
  const [salas, setSalas] = useState([]);
  const [cirurgias, setCirurgias] = useState([]);
  const [showSalas, setShowSalas] = useState(false);
  const [agendando, setAgendando] = useState(false); // false | true (nova) | objeto (edição)
  const [cancelando, setCancelando] = useState(null);
  const [checklist, setChecklist] = useState(null); // { cirurgia, fase }
  const [sub, setSub] = useState("mapa"); // mapa | indicadores
  const [, setTick] = useState(0);
  // Escrita que não se confirmou e leitura que não deu — as duas aparecem
  // na tela, porque as duas mudam o que a pessoa deveria fazer em seguida.
  const [erro, setErro] = useState(null);
  const [leituraFalhou, setLeituraFalhou] = useState(false);
  // A trilha de cirurgia segura do dia, numa consulta só.
  const [trilha, setTrilha] = useState([]);
  const [equipe, setEquipe] = useState([]);
  // O cadastro dos pacientes do mapa, indexado por prontuário. `null`
  // enquanto não li — e `null` também quando a leitura falha, porque o
  // cartão tem de dizer "não conferi" em vez de "confere".
  const [cadastros, setCadastros] = useState(null);
  const [procedimentos, setProcedimentos] = useState([]);
  const [profissionais, setProfissionais] = useState([]);
  // Qual cirurgia está com o painel de equipe aberto.
  const [vendoEquipe, setVendoEquipe] = useState(null);
  const subBtn = ativo => ({ background: ativo ? "#22d3ee" : "transparent", color: ativo ? "#000" : "var(--text-3)", border: `1px solid ${ativo ? "#22d3ee" : "var(--border)"}`, borderRadius: 7, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 });

  // 🔴 "Não li" nunca vira "não tem". Com a rede caída, esta tela afirmava
  // "Nenhuma sala cadastrada" e — pior — "Sala livre neste dia" para cada
  // sala. A segunda é afirmação de ausência de cirurgia: alguém olha o mapa,
  // vê sala livre e encaixa uma urgência na sala onde há cirurgia marcada.
  async function refresh(d = data) {
    if (!sb) return;
    const [s, c] = await Promise.all([loadCcSalas(sb), loadCcCirurgias(sb, d)]);
    // A trilha depende dos ids, então vem num segundo tempo — mas o estado
    // é aplicado TUDO JUNTO, num render só. Com `setTrilha` depois de um
    // `await` solto, o mapa renderizava duas vezes a cada atualização (e
    // esta tela se atualiza sozinha a cada 30s); o segundo render trocava
    // os nós do DOM por baixo de quem estava clicando.
    const ids = (Array.isArray(c) ? c : []).map(x => x.id);
    const pronts = (Array.isArray(c) ? c : []).map(x => x.prontuario);
    const [t, eq, pac] = await Promise.all([
      loadCcChecklistDoDia(sb, ids), loadCcEquipeDoDia(sb, ids), loadPacientesDoMapa(sb, pronts),
    ]);
    // A marca é a IDENTIDADE do array — conferir ANTES de filtrar.
    setLeituraFalhou(algumaFalhou(s, c));
    // `indexarCadastros` devolve null quando a leitura falhou: é o que faz
    // o cartão dizer "não conferi" em vez de inventar "não cadastrado".
    setSalas(s); setCirurgias(c); setTrilha(t); setEquipe(eq); setCadastros(indexarCadastros(pac));
  }
  // O catálogo de procedimentos não muda com o dia do mapa: carrega uma
  // vez, e não a cada 30s junto com o resto.
  useEffect(() => {
    if (!sb) return;
    loadProcedimentosDoCatalogo(sb).then(setProcedimentos);
    loadProfissionaisDoBloco(sb).then(setProfissionais);
  }, [sb]);

  useEffect(() => {
    refresh(data);
    const onFocus = () => refresh(data);
    window.addEventListener("focus", onFocus);
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => { window.removeEventListener("focus", onFocus); clearInterval(id); };
  }, [data]);

  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 11px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", boxSizing: "border-box" };
  const secLbl = { fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 };

  // 🔴 A AUDITORIA SÓ É GRAVADA DEPOIS QUE A ESCRITA SE CONFIRMA.
  //
  // Antes, as quatro funções abaixo chamavam `registrarAuditoria` logo após
  // o `await`, sem olhar o resultado. Com a RLS barrando, o PostgREST
  // responde 2xx sem linha: nada ia para o banco e a TRILHA afirmava que
  // tinha ido. No checklist de cirurgia segura isso é registro
  // contraditório num evento sentinela — a trilha dizendo que a conferência
  // aconteceu, e o campo apagado.
  async function salvarCirurgia(c, idEdicao) {
    const r = idEdicao
      ? await updateCcCirurgiaRemote(sb, idEdicao, c)
      : await addCcCirurgiaRemote(sb, { ...c, status: "agendada" }, currentUser);
    if (!r.ok) { setErro(r.motivo); return; }
    registrarAuditoria(sb, currentUser, idEdicao ? "editar cirurgia" : "agendar cirurgia", `${c.iniciais} · ${c.procedimento}`, {});
    setErro(null); setAgendando(false); setTimeout(() => refresh(), 400);
  }
  async function cancelar(c, motivo) {
    // Autor e hora: cirurgia CANCELADA na véspera e SUSPENSA com o
    // paciente já em jejum são indicadores diferentes, com donos
    // diferentes, e eram a mesma linha. Sem autor, a reunião de bloco
    // vira "quem cancelou isso?" sem resposta.
    const r = await updateCcCirurgiaRemote(sb, c.id, {
      status: "cancelada", cancelamento_motivo: motivo,
      cancelado_em: nowISO(), cancelado_por: currentUser?.name || null,
    });
    if (!r.ok) { setErro(r.motivo); return; }
    registrarAuditoria(sb, currentUser, "cancelar cirurgia", `${c.iniciais} · ${motivo}`, {});
    setErro(null); setCancelando(null); setTimeout(() => refresh(), 300);
  }
  async function marcar(c, campos, acao) {
    const r = await updateCcCirurgiaRemote(sb, c.id, campos);
    if (!r.ok) { setErro(`${acao}: ${r.motivo}`); return; }
    registrarAuditoria(sb, currentUser, `bloco: ${acao}`, c.iniciais, {});
    setErro(null); setTimeout(() => refresh(), 300);
  }
  /**
   * Grava a CONFERÊNCIA na trilha. O gatilho acende o selo no mesmo INSERT.
   *
   * Antes isto escrevia só `chk_<fase> = true` e os itens marcados morriam
   * no estado do modal. Agora vai a linha inteira — quais itens, o que
   * divergiu, a contagem em número — porque é o REGISTRO que a RDC 36/2013
   * exige, não a marcação.
   */
  async function concluirChecklist(c, faseKey, { marcados, divergencia, contagem } = {}) {
    const fase = CHECKLIST_OMS[faseKey];
    const r = await registrarChecklist(sb, linhaDaConferencia({
      cirurgia: c, fase: faseKey, marcados, divergencia, contagem, assinatura: assinaturaTexto(currentUser),
    }), currentUser);
    // O modal NÃO fecha quando a gravação não se confirmou: fechar daria a
    // impressão de concluído, e é a impressão que leva a equipe adiante.
    if (!r.ok) return { erro: `Checklist ${fase.label}: ${r.motivo}` };
    registrarAuditoria(sb, currentUser, `bloco: checklist ${fase.label}`, c.iniciais, {});
    setErro(null); setChecklist(null); setTimeout(() => refresh(), 300);
    return { ok: true };
  }

  /**
   * Registra que um momento do checklist foi PULADO, e por quê.
   *
   * 🔴 Hoje pular não deixa rastro: a tela pergunta "entrar em sala mesmo
   * assim?" e quem clica OK segue. No mês seguinte o único vestígio é a
   * adesão caindo de 100% para 94% — sem saber em qual cirurgia, por
   * decisão de quem, nem por quê. É exatamente o que a análise de causa
   * raiz de um evento sentinela procura e não acha.
   *
   * Não trava: há politrauma em choque e cesárea de emergência, e travar a
   * porta do bloco por campo inverteria a prioridade. Custa uma frase.
   */
  async function acrescentarMembro(c, dados) {
    const falta = conferirMembro({ ...dados, jaNaEquipe: equipe.filter(m => String(m.cirurgia_id) === String(c.id)) });
    if (falta) return { erro: falta };
    const r = await addMembroEquipe(sb, linhaDeEquipe({ cirurgia: c, ...dados }), currentUser);
    if (!r.ok) return { erro: r.motivo };
    registrarAuditoria(sb, currentUser, "bloco: equipe +" + dados.papel, c.iniciais, {});
    setErro(null); await refresh();
    return { ok: true };
  }

  async function tirarMembro(c, membro) {
    if (!confirm(`Tirar ${membro.nome} (${PAPEL_POR_CHAVE[membro.papel]?.label || membro.papel}) da equipe desta cirurgia?`)) return;
    const r = await removerMembroEquipe(sb, membro.id);
    if (!r.ok) { setErro(r.motivo); return; }
    registrarAuditoria(sb, currentUser, "bloco: equipe −" + membro.papel, c.iniciais, {});
    setErro(null); await refresh();
  }

  async function pularChecklist(c, faseKey) {
    const fase = CHECKLIST_OMS[faseKey];
    const motivo = prompt(
      `Seguir SEM o ${fase.label} (${fase.quando}).\n\n` +
      "Por quê? A justificativa fica gravada com seu nome na trilha de cirurgia segura — " +
      "é o que alguém vai ler se este caso virar análise de evento.");
    if (motivo === null) return false;
    const falta = conferirPulo({ cirurgia: c, fase: faseKey, motivo });
    if (falta) { setErro(falta); return false; }
    const r = await registrarChecklist(sb, linhaDoPulo({
      cirurgia: c, fase: faseKey, motivo, assinatura: assinaturaTexto(currentUser),
    }), currentUser);
    if (!r.ok) { setErro(`Não consegui registrar o pulo do ${fase.label}: ${r.motivo}`); return false; }
    registrarAuditoria(sb, currentUser, `bloco: PULOU ${fase.label}`, c.iniciais, {});
    setErro(null); setTimeout(() => refresh(), 300);
    return true;
  }

  const ativas = cirurgias.filter(c => c.status !== "cancelada");
  const canceladas = cirurgias.filter(c => c.status === "cancelada");
  const emAndamento = cirurgias.filter(c => ["checkin", "em_cirurgia", "recuperacao"].includes(c.status));
  const concluidas = cirurgias.filter(c => c.status === "concluida");
  const salasAtivas = salas.filter(s => s.ativa !== false);
  // agrupa por sala pro mapa
  const porSala = salasAtivas.map(s => ({ sala: s.nome, lista: ativas.filter(c => c.sala === s.nome) }));
  const semSala = ativas.filter(c => !c.sala || !salasAtivas.some(s => s.nome === c.sala));

  const Card = ({ label, valor, cor }) => (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", minWidth: 120, flex: 1 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: cor || "var(--text)", fontFamily: "JetBrains Mono, monospace", marginTop: 4 }}>{valor}</div>
    </div>
  );
  const StatusBadge = ({ st }) => { const v = CC_STATUS[st]; if (!v) return null;
    return <span style={{ background: v.cor + "22", color: v.cor, border: `1px solid ${v.cor}55`, borderRadius: 99, padding: "2px 10px", fontSize: 11, fontWeight: 800 }}>{v.label}</span>; };

  const CirurgiaCard = ({ c }) => {
   // 🔴 QUEM VAI SER OPERADO VEM DO CADASTRO, PELO PRONTUÁRIO — não do que
   // alguém digitou no agendamento. O carimbo não some: vira o aviso.
   const id = conferirIniciaisDaCirurgia(c, cadastros);
   return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: `4px solid ${CC_STATUS[c.status]?.cor || "var(--border)"}`, borderRadius: 8, padding: "10px 13px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 800, fontSize: 13 }}>{c.hora_prevista ? c.hora_prevista.slice(0, 5) : "—"}</span>
        <strong>{id.exibir}</strong>
        {c.prontuario && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>reg. {c.prontuario}</span>}
        {id.estado === "divergem" && (
          <span style={{ background: "#f43f5e22", color: "#f43f5e", border: "1px solid #f43f5e66", borderRadius: 99, padding: "2px 9px", fontSize: 10.5, fontWeight: 800 }}>
            iniciais divergem do cadastro
          </span>
        )}
        <StatusBadge st={c.status} />
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>{c.duracao_prev_min ? `${c.duracao_prev_min}min prev.` : ""}</span>
      </div>
      {/* O aviso por extenso, com os dois valores e o nome — é por ele que
          alguém decide se o cartão aponta para a pessoa certa. Vermelho só
          na divergência: "não conferi" é cinza-âmbar, e dizer as duas
          coisas no mesmo tom treinaria a equipe a ignorar as duas. */}
      {id.aviso && (
        <div role={id.grave ? "alert" : undefined}
          style={{ fontSize: 11.5, marginTop: 4, fontWeight: id.grave ? 700 : 500,
                   color: id.grave ? "#f43f5e" : "var(--text-muted)" }}>
          {id.grave ? "🔴 " : ""}{id.aviso}
        </div>
      )}
      <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 4 }}>{c.procedimento}{c.cirurgiao ? ` · Dr(a). ${c.cirurgiao}` : ""}</div>
      {c.opme && <div style={{ fontSize: 11.5, color: "#d97706", marginTop: 3 }}>OPME/materiais: {c.opme}</div>}
      {c.observacao && <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>Obs.: {c.observacao}</div>}
      {c.status === "cancelada" && c.cancelamento_motivo && <div style={{ fontSize: 11.5, color: "#f43f5e", marginTop: 3, fontWeight: 600 }}>Motivo: {c.cancelamento_motivo}</div>}

      {/* Selos do checklist de cirurgia segura */}
      {!["agendada", "cancelada"].includes(c.status) && (
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          {Object.entries(CHECKLIST_OMS).map(([k, fase]) => (
            <span key={k} style={{ fontSize: 10, fontWeight: 800, borderRadius: 99, padding: "2px 8px", background: c[fase.campo] ? fase.cor + "22" : "var(--surface-3)", color: c[fase.campo] ? fase.cor : "var(--text-muted)", border: `1px solid ${c[fase.campo] ? fase.cor + "55" : "var(--border)"}` }}>
              {c[fase.campo] ? "✓ " : ""}{fase.label}
            </span>
          ))}
        </div>
      )}

      {/* A EQUIPE, e o que ela impede de faturar.
          Antes o cartão mostrava um sobrenome. O aviso de CBO não trava
          nada: a cirurgia acontece antes de a conta existir, e barrar o
          registro do ato por campo de faturamento inverteria a
          prioridade. O que não pode é alguém descobrir a falta no
          processamento do mês seguinte. */}
      {(() => {
        const minha = equipe.filter(m => String(m.cirurgia_id) === String(c.id));
        const pend = c.status === "cancelada" ? [] : pendenciasDeFaturamento(minha);
        return (
          <div style={{ marginTop: 6, fontSize: 11.5, lineHeight: 1.5 }}>
            <span style={{ color: "var(--text-muted)" }}>
              {minha.length ? resumoDaEquipe(minha) : "Equipe não registrada"}
            </span>
            {canEdit && (
              <button onClick={() => setVendoEquipe(vendoEquipe === c.id ? null : c.id)}
                style={{ marginLeft: 8, background: "transparent", border: "1px solid var(--border)",
                         borderRadius: 5, padding: "1px 7px", fontSize: 10.5, cursor: "pointer",
                         color: "var(--text-3)" }}>
                {vendoEquipe === c.id ? "fechar" : "equipe"}
              </button>
            )}
            {/* ⚠️ OS AVISOS FICAM SEMPRE DENTRO DESTE DIV, mesmo quando não
                há nenhum — e isso não é estilo, é correção de defeito.
                Antes eles eram irmãos soltos do painel de equipe: ao
                registrar o cirurgião, o aviso sumia, o número de filhos
                mudava, o React REMONTAVA o `EquipeDaCirurgia` e o
                formulário se esvaziava no meio do uso (achado caminhando
                pela tela — o teste não pegava, porque o teste não
                acrescenta um membro e continua digitando). Com o contêiner
                fixo, a posição do painel entre os irmãos não muda. */}
            <div>
              {pend.map((a, i) => (
                <div key={i} style={{ color: "#fbbf24", fontSize: 11, marginTop: 2 }}>⚠ {a}</div>
              ))}
            </div>
            {vendoEquipe === c.id && (
              <EquipeDaCirurgia key={`equipe-${c.id}`} membros={minha} perfis={profissionais}
                onAdd={d => acrescentarMembro(c, d)} onTirar={m => tirarMembro(c, m)} />
            )}
          </div>
        );
      })()}

      {/* 🔴 A TRILHA, NA LINHA DA CIRURGIA.
          Sem ela, uma cirurgia com os três selos acesos e uma com três
          momentos PULADOS com justificativa ficam idênticas no mapa — e são
          opostas. O pulo não acende selo (o gatilho cuida disso), então sem
          esta linha ele seria invisível exatamente como antes. */}
      {(() => {
        const minhas = trilha.filter(t => String(t.cirurgia_id) === String(c.id));
        const r = resumoDaTrilha(minhas);
        if (!r?.texto) return null;
        return (
          <div style={{ marginTop: 5, fontSize: 11, color: "#fbbf24", lineHeight: 1.5 }}>
            ⚠ {r.texto}
            {minhas.filter(t => t.tipo === "pulo" || (t.divergencia || "").trim()).map(t => (
              <div key={t.id} style={{ color: "var(--text-muted)", fontStyle: "italic", marginTop: 1 }}>
                {t.tipo === "pulo" ? "PULOU" : "divergência"} {CHECKLIST_OMS[t.fase]?.label || t.fase} — {t.divergencia}
                {t.assinatura ? ` · ${t.assinatura}` : t.usuario ? ` · ${t.usuario}` : ""}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Tempos registrados */}
      {(c.entrada_sala_em || c.checkin_em) && c.status !== "cancelada" && (
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.7 }}>
          {c.checkin_em && <span>Check-in {horaFmt(c.checkin_em).slice(-5)} · </span>}
          {c.entrada_sala_em && <span>Sala {horaFmt(c.entrada_sala_em).slice(-5)} · </span>}
          {c.inicio_anestesia_em && <span>Anestesia {horaFmt(c.inicio_anestesia_em).slice(-5)} · </span>}
          {c.inicio_cirurgia_em && <span>Incisão {horaFmt(c.inicio_cirurgia_em).slice(-5)} · </span>}
          {c.fim_cirurgia_em && <span>Fim {horaFmt(c.fim_cirurgia_em).slice(-5)} · </span>}
          {c.inicio_cirurgia_em && c.fim_cirurgia_em && <strong style={{ color: "var(--text-3)" }}>cirurgia {fmtDur(diffMin(c.inicio_cirurgia_em, c.fim_cirurgia_em))} · </strong>}
          {c.rpa_entrada_em && !c.rpa_saida_em && <strong style={{ color: "#d97706" }}>na RPA há {fmtDur(diffMin(c.rpa_entrada_em, nowISO()))}</strong>}
          {c.rpa_entrada_em && c.rpa_saida_em && <span>RPA {fmtDur(diffMin(c.rpa_entrada_em, c.rpa_saida_em))}</span>}
        </div>
      )}

      {canEdit && c.status !== "cancelada" && c.status !== "concluida" && (
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {c.status === "agendada" && <>
            <button onClick={() => marcar(c, { status: "checkin", checkin_em: nowISO() }, "check-in")} style={btnContorno("#3b82f6")}>Check-in do paciente</button>
            <button onClick={() => setAgendando(c)} style={btnContorno("var(--text-3)")}>Editar</button>
            <button onClick={() => setCancelando(c)} style={btnContorno("#f43f5e")}>Cancelar cirurgia</button>
          </>}
          {c.status === "checkin" && <>
            {!c.chk_sign_in && <button onClick={() => setChecklist({ cirurgia: c, fase: "sign_in" })} style={btnContorno("#3b82f6")}>Cirurgia segura: Sign In</button>}
            <button onClick={async () => { if (pendenteAntesDe(c, "entrada_sala") && !(await pularChecklist(c, "sign_in"))) return; marcar(c, { status: "em_cirurgia", entrada_sala_em: nowISO() }, "entrada na sala"); }} style={btnContorno("#22d3ee")}>Entrada na sala</button>
            <button onClick={() => setCancelando(c)} style={btnContorno("#f43f5e")}>Cancelar</button>
          </>}
          {c.status === "em_cirurgia" && <>
            {!c.inicio_anestesia_em && <button onClick={() => marcar(c, { inicio_anestesia_em: nowISO() }, "inicio anestesia")} style={btnContorno("var(--text-3)")}>Início da anestesia</button>}
            {!c.chk_time_out && <button onClick={() => setChecklist({ cirurgia: c, fase: "time_out" })} style={btnContorno("#d97706")}>Cirurgia segura: Time Out</button>}
            {!c.inicio_cirurgia_em && <button onClick={async () => { if (pendenteAntesDe(c, "incisao") && !(await pularChecklist(c, "time_out"))) return; marcar(c, { inicio_cirurgia_em: nowISO() }, "inicio cirurgia"); }} style={btnContorno("#22d3ee")}>Início da cirurgia</button>}
            {c.inicio_cirurgia_em && !c.fim_cirurgia_em && <button onClick={() => marcar(c, { fim_cirurgia_em: nowISO() }, "fim cirurgia")} style={btnContorno("#22d3ee")}>Fim da cirurgia</button>}
            {c.fim_cirurgia_em && !c.chk_sign_out && <button onClick={() => setChecklist({ cirurgia: c, fase: "sign_out" })} style={btnContorno("#34d399")}>Cirurgia segura: Sign Out</button>}
            {c.fim_cirurgia_em && <button onClick={async () => { if (pendenteAntesDe(c, "rpa") && !(await pularChecklist(c, "sign_out"))) return; marcar(c, { status: "recuperacao", saida_sala_em: nowISO(), rpa_entrada_em: nowISO() }, "envio RPA"); }} style={btnContorno("#d97706")}>Enviar para RPA</button>}
          </>}
          {c.status === "recuperacao" && (
            <button onClick={() => marcar(c, { status: "concluida", rpa_saida_em: nowISO() }, "alta da RPA")} style={btnContorno("#34d399")}>Alta da RPA — concluir</button>
          )}
        </div>
      )}
    </div>
   );
  };

  return (
    <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Bloco Cirúrgico — Mapa e Agenda</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: "1.25rem" }}>Agenda por sala, cirurgia segura e tempos do dia. Dados de saúde — use iniciais e prontuário (LGPD).</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canEdit && <button onClick={() => setShowSalas(true)} style={{ background: "transparent", color: "var(--text-2)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Salas ({salasAtivas.length})</button>}
          {canEdit && <button onClick={() => setAgendando(true)} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Agendar cirurgia</button>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <button onClick={() => setSub("mapa")} style={subBtn(sub === "mapa")}>Mapa do dia</button>
        <button onClick={() => setSub("indicadores")} style={subBtn(sub === "indicadores")}>Indicadores</button>
      </div>

      {sub === "indicadores" && <BlocoIndicadores sb={sb} salasAtivas={salasAtivas} />}

      {sub === "mapa" && (<>
      {/* Escrita que não se confirmou. Fica no topo porque muda o que a
          pessoa deve fazer AGORA: conferir antes de seguir o fluxo. */}
      {erro && (
        <div role="alert" style={{ marginBottom: 14, background: "#f43f5e10", border: "1px solid #f43f5e55",
                                   borderLeft: "3px solid #f43f5e", borderRadius: 8, padding: "10px 13px",
                                   fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>
          {erro}
        </div>
      )}
      {/* Leitura que falhou. O mapa continua desenhado — o que não pode é
          ele passar por completo. */}
      {leituraFalhou && (
        <div role="alert" style={{ marginBottom: 14, background: "#fbbf2410", border: "1px solid #fbbf2455",
                                   borderLeft: "3px solid #fbbf24", borderRadius: 8, padding: "10px 13px",
                                   fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>
          {avisoDeFalha("as salas e as cirurgias deste dia")} <strong>Não encaixe cirurgia por este mapa enquanto ele estiver assim.</strong>
        </div>
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)" }}>Dia do mapa</label>
        <input type="date" value={data} onChange={e => setData(e.target.value)} style={inp} />
        {data !== todayStr() && <button onClick={() => setData(todayStr())} style={btnContorno("#22d3ee")}>Hoje</button>}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: "1.25rem" }}>
        <Card label="Cirurgias no dia" valor={ativas.length} cor="#22d3ee" />
        <Card label="Em andamento" valor={emAndamento.length} cor="#3b82f6" />
        <Card label="Concluídas" valor={concluidas.length} cor="#34d399" />
        <Card label="Canceladas" valor={canceladas.length} cor={canceladas.length > 0 ? "#f43f5e" : "var(--text)"} />
      </div>

      {/* MAPA CIRÚRGICO POR SALA */}
      <div style={secLbl}>Mapa cirúrgico — {new Date(data + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })}</div>
      {salasAtivas.length === 0 ? (
        <div style={{ background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 10, padding: "1.5rem", textAlign: "center", color: "var(--text-muted)", fontSize: 13, marginBottom: "1.25rem" }}>
          {leituraFalhou
            ? "Não consegui ler o catálogo de salas — não sei se há salas cadastradas. Recarregue."
            : <>Nenhuma sala cadastrada. {canEdit ? "Clique em Salas para cadastrar as salas do bloco." : ""}</>}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, marginBottom: "1.25rem" }}>
          {porSala.map(({ sala, lista }) => (
            <div key={sala} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {sala}
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>{lista.length} cirurgia(s)</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {lista.length === 0 && <div style={{ fontSize: 12, color: leituraFalhou ? "#fbbf24" : "var(--text-muted)", textAlign: "center", padding: "10px 0" }}>{leituraFalhou ? "Não consegui ler as cirurgias — NÃO é \"livre\"." : "Sala livre neste dia."}</div>}
                {lista.map(c => <CirurgiaCard key={c.id} c={c} />)}
              </div>
            </div>
          ))}
        </div>
      )}
      {semSala.length > 0 && (
        <div style={{ marginBottom: "1.25rem" }}>
          <div style={secLbl}>Sem sala definida ({semSala.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{semSala.map(c => <CirurgiaCard key={c.id} c={c} />)}</div>
        </div>
      )}

      {/* CANCELADAS DO DIA */}
      {canceladas.length > 0 && (
        <details style={{ marginBottom: "1.25rem" }}>
          <summary style={{ ...secLbl, cursor: "pointer" }}>Canceladas no dia ({canceladas.length})</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>{canceladas.map(c => <CirurgiaCard key={c.id} c={c} />)}</div>
        </details>
      )}
      </>)}

      {agendando && <AgendarCirurgiaModal sb={sb} procedimentos={procedimentos} cirurgia={agendando === true ? null : agendando} data={data} salas={salasAtivas} cirurgiasDoDia={cirurgias} onClose={() => setAgendando(false)} onSave={salvarCirurgia} />}
      {cancelando && <CancelarCirurgiaModal cirurgia={cancelando} onClose={() => setCancelando(null)} onConfirm={cancelar} />}
      {/* A conferência de identidade vai COM a cirurgia para o modal: é ali
          que o item 1 do Sign In manda confirmar a identidade, e era ali
          que apareciam as iniciais digitadas. */}
      {checklist && <ChecklistOmsModal cirurgia={checklist.cirurgia} fase={checklist.fase} identidade={conferirIniciaisDaCirurgia(checklist.cirurgia, cadastros)} onClose={() => setChecklist(null)} onConfirm={dados => concluirChecklist(checklist.cirurgia, checklist.fase, dados)} />}
      {showSalas && <CcSalasModal salas={salas} onClose={() => setShowSalas(false)} onSave={async s => { await upsertCcSalaRemote(sb, s, currentUser); refresh(); }} onDelete={async n => { await deleteCcSalaRemote(sb, n); refresh(); }} isMaster={currentUser?.role === "adm_master"} />}
    </div>
  );
}

// Modal de agendamento (nova cirurgia ou edição) com detecção de conflito de sala
function AgendarCirurgiaModal({ sb, procedimentos = [], cirurgia, data, salas, cirurgiasDoDia, onClose, onSave }) {
  const [f, setF] = useState({
    data: cirurgia?.data || data, hora_prevista: cirurgia?.hora_prevista?.slice(0, 5) || "",
    duracao_prev_min: cirurgia?.duracao_prev_min || "", sala: cirurgia?.sala || "",
    iniciais: cirurgia?.iniciais || "", prontuario: cirurgia?.prontuario || "",
    procedimento: cirurgia?.procedimento || "", cirurgiao: cirurgia?.cirurgiao || "",
    procedimento_cod: cirurgia?.procedimento_cod || "",
    ps_atendimento_id: cirurgia?.ps_atendimento_id || "",
    carater_cod: cirurgia?.carater_cod || "",
    sitio_cirurgico: cirurgia?.sitio_cirurgico || "", lateralidade: cirurgia?.lateralidade || "",
    opme: cirurgia?.opme || "", observacao: cirurgia?.observacao || "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 11px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  const lbl = { fontSize: 11, fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 5 };
  // 🔴 A CONFERÊNCIA DE CONFLITO SEGUE O DIA QUE A PESSOA ESCOLHEU.
  //
  // Antes era `f.data === data ? conflitosDeSala(...) : []` — ou seja, só
  // conferia quando a cirurgia era para o dia do mapa aberto. Mas mapa
  // cirúrgico se monta com dias de antecedência: marcar para outro dia é o
  // caso NORMAL, e nele a barreira ficava desligada em silêncio, sem a
  // faixa laranja e sem o aviso. Duas cirurgias às 08:00 na mesma sala de
  // amanhã entravam as duas, caladas — e o cabeçalho de `agenda.js` marca
  // isso como 🔴: "paciente anestesiado esperando sala, ou cirurgia adiada
  // com o paciente já em jejum desde a véspera".
  //
  // A regra pura já existia e já tinha teste. Só não estava sendo chamada.
  const mesmoDia = f.data === data;
  const [doOutroDia, setDoOutroDia] = useState(null);   // null = ainda não li
  useEffect(() => {
    if (mesmoDia || !sb || !f.data) { setDoOutroDia(null); return; }
    let vivo = true;
    setDoOutroDia(null);
    loadCcCirurgias(sb, f.data).then(r => { if (vivo) setDoOutroDia(r); });
    return () => { vivo = false; };
  }, [sb, f.data, mesmoDia]);

  // 🔴 SEM ELO, A CIRURGIA NÃO VIRA CONTA.
  //
  // `cc_cirurgias` era a única tabela clínica sem `ps_atendimento_id`.
  // A migração liga o que não tem dúvida (um único atendimento cobrindo
  // o dia) e deixa o resto em branco de propósito — adivinhar poria o
  // porte cirúrgico na conta do episódio errado. O que sobra se liga
  // AQUI, por quem sabe de qual episódio a cirurgia é.
  //
  // E é indispensável para a cirurgia AGENDADA com antecedência: ela
  // nasce antes de o episódio existir, então o backfill nunca a alcança.
  const [atendimentos, setAtendimentos] = useState([]);
  useEffect(() => {
    let vivo = true;
    const pront = f.prontuario.trim();
    if (!sb || !pront) { setAtendimentos([]); return; }
    loadAtendimentosDoPaciente(sb, pront).then(r => { if (vivo) setAtendimentos(r); });
    return () => { vivo = false; };
  }, [sb, f.prontuario]);

  // 🔴 AS INICIAIS PARAM DE SER DIGITADAS QUANDO O CADASTRO SABE QUEM É.
  //
  // Enquanto o campo aceitava texto livre, cada agendamento era uma chance
  // de inventar um rótulo para um paciente que o sistema já conhece pelo
  // número — e foi assim que o T9060 ("Clara Lima Barbosa") ganhou três
  // cirurgias como T.S.T., A.B.C. e M.O.S.
  //
  // `lido` separa "o cadastro não tem nome" de "ainda não perguntei": na
  // segunda o campo fica livre MAS a nota diz que nada será conferido.
  // Sem essa distinção, a tela em branco passaria por conferida.
  const [cadastro, setCadastro] = useState(null);
  const [cadastroLido, setCadastroLido] = useState(false);
  useEffect(() => {
    let vivo = true;
    const pront = f.prontuario.trim();
    setCadastro(null); setCadastroLido(false);
    if (!sb || !pront) return;
    loadPacientesDoMapa(sb, [pront]).then(r => {
      if (!vivo) return;
      // Leitura falhada NÃO vira "não cadastrado": `indexarCadastros`
      // devolve null, e aí a nota diz que não consegui ler.
      const mapa = indexarCadastros(r);
      setCadastro(mapa ? (mapa.get(pront) || null) : null);
      setCadastroLido(!!mapa);
    });
    return () => { vivo = false; };
  }, [sb, f.prontuario]);

  const doCadastro = iniciaisDoAgendamento(cadastro, { lido: cadastroLido });
  // Quando o cadastro manda, o campo passa a ser espelho dele — inclusive
  // na EDIÇÃO, e é de propósito: abrir e salvar uma cirurgia agendada com
  // iniciais erradas passa a ser o caminho de conserto.
  useEffect(() => {
    if (doCadastro.travado && f.iniciais !== doCadastro.valor) set("iniciais", doCadastro.valor);
  }, [doCadastro.travado, doCadastro.valor, f.iniciais]);

  const base = mesmoDia ? cirurgiasDoDia : doOutroDia;
  // "Ainda não li" e "não deu para ler" são a mesma coisa para quem decide:
  // nos dois casos a conferência NÃO foi feita, e isso tem de ser dito.
  const naoConferi = base == null || naoDeuParaLer(base);
  const conflitos = naoConferi
    ? []
    : conflitosDeSala(base, f.sala, f.hora_prevista, f.duracao_prev_min, cirurgia?.id);

  async function salvar() {
    if (!f.iniciais.trim() || !f.procedimento.trim()) { alert("Informe ao menos as iniciais do paciente e o procedimento."); return; }
    // O rótulo do campo diz `Prontuário *` desde sempre e nada conferia. Um
    // asterisco que mente é pior que a ausência dele, porque a pessoa
    // acredita que o sistema está olhando — e cirurgia sem prontuário não
    // fatura, não entra no prontuário do paciente, e torna indistinguíveis
    // dois pacientes com as mesmas iniciais no mesmo dia (Meta 1 da OMS).
    if (!f.prontuario.trim()) { alert("Informe o prontuário do paciente. Sem ele a cirurgia não identifica quem vai ser operado — e é por ele que o Sign In confere a identidade."); return; }
    if (naoConferi && !confirm(`NÃO consegui conferir se a sala ${f.sala || "escolhida"} já tem cirurgia em ${f.data} nesse horário.\n\nAgendar sem essa conferência?`)) return;
    if (conflitos.length && !confirm(`Atenção: a sala ${f.sala} já tem ${conflitos.length} cirurgia(s) nesse horário (${conflitos.map(c => c.iniciais).join(", ")}). Agendar mesmo assim?`)) return;
    setBusy(true);
    await onSave({
      data: f.data, hora_prevista: f.hora_prevista || null, duracao_prev_min: f.duracao_prev_min ? Number(f.duracao_prev_min) : null,
      sala: f.sala || null, iniciais: f.iniciais.trim(), prontuario: f.prontuario.trim() || null,
      procedimento: f.procedimento.trim(), cirurgiao: f.cirurgiao.trim() || null,
      procedimento_cod: f.procedimento_cod || null,
      ps_atendimento_id: f.ps_atendimento_id ? Number(f.ps_atendimento_id) : null,
      carater_cod: f.carater_cod || null,
      sitio_cirurgico: f.sitio_cirurgico.trim() || null,
      lateralidade: f.lateralidade || null,
      opme: f.opme.trim() || null, observacao: f.observacao.trim() || null,
    }, cirurgia?.id);
    setBusy(false);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 540, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>{cirurgia ? "Editar cirurgia" : "Agendar cirurgia"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Data</label><input type="date" value={f.data} onChange={e => set("data", e.target.value)} style={inp} /></div>
          <div><label style={lbl}>Hora prevista</label><input type="time" value={f.hora_prevista} onChange={e => set("hora_prevista", e.target.value)} style={inp} /></div>
          <div><label style={lbl}>Duração (min)</label><input type="number" min="10" step="10" value={f.duracao_prev_min} onChange={e => set("duracao_prev_min", e.target.value)} placeholder="90" style={inp} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Sala</label>
            <select value={f.sala} onChange={e => set("sala", e.target.value)} style={inp}>
              <option value="">— definir depois —</option>
              {salas.map(s => <option key={s.nome} value={s.nome}>{s.nome}</option>)}
            </select></div>
          <div><label style={lbl}>Iniciais do paciente *</label>
            <input value={f.iniciais} onChange={e => set("iniciais", e.target.value)}
              readOnly={doCadastro.travado} aria-readonly={doCadastro.travado || undefined}
              title={doCadastro.travado ? "Vem do cadastro do prontuário — corrija no cadastro do paciente, não aqui." : undefined}
              placeholder="J.S.M."
              style={{ ...inp, ...(doCadastro.travado ? { background: "var(--surface-3)", color: "var(--text-2)", cursor: "not-allowed" } : {}) }} /></div>
          <div><label style={lbl}>Prontuário *</label><input value={f.prontuario} onChange={e => set("prontuario", e.target.value)} placeholder="48213" style={inp} /></div>
        </div>
        {/* A nota explica POR QUE o campo está travado — ou avisa que o que
            for digitado não será conferido. Campo travado sem explicação
            vira chamado de suporte; campo livre sem aviso vira T.S.T. */}
        {f.prontuario.trim() && (
          <div style={{ fontSize: 10.5, marginTop: -4, marginBottom: 10,
                        color: doCadastro.travado ? "var(--text-muted)" : "#fbbf24" }}>
            {doCadastro.travado ? "🔒 " : "⚠ "}{doCadastro.nota}
          </div>
        )}
        {/* A ausência de faixa laranja sempre significou "conferi e não há
            conflito". Quando a conferência NÃO foi feita, a tela tem de
            dizer isso — senão o silêncio continua passando por aprovação. */}
        {naoConferi && <div style={{ background: "#3a2d06", border: "1px solid #fbbf2466", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#fbbf24", fontWeight: 600, marginBottom: 10 }}>Ainda NÃO conferi se a sala já está ocupada em {f.data}. A ausência de aviso aqui não quer dizer que está livre.</div>}
        {conflitos.length > 0 && <div style={{ background: "#3d2206", border: "1px solid #f9731666", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#f97316", fontWeight: 600, marginBottom: 10 }}>Conflito de sala: já há {conflitos.length} cirurgia(s) na {f.sala} nesse intervalo.</div>}
        {/* O EPISÓDIO a que esta cirurgia pertence. */}
        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>Atendimento (episódio)</label>
          <select value={f.ps_atendimento_id} onChange={e => set("ps_atendimento_id", e.target.value)} style={inp}
            aria-label="Atendimento a que esta cirurgia pertence">
            <option value="">— ainda não ligada</option>
            {atendimentos.map(a => (
              <option key={a.id} value={a.id}>
                #{a.id} · {fmtDataBR(a.chegada_em)} · {a.tipo_atendimento || "emergência"}
                {a.desfecho_em ? "" : " · EM ABERTO"}
              </option>
            ))}
          </select>
          {!f.ps_atendimento_id && (
            <div style={{ fontSize: 10.5, color: "#fbbf24", marginTop: 3 }}>
              {f.prontuario.trim() && atendimentos.length === 0
                ? "Este paciente não tem atendimento aberto. A cirurgia fica sem episódio até ele chegar — ligue depois, pela edição."
                : "Sem episódio, a cirurgia não entra na conta de ninguém."}
            </div>
          )}
        </div>

        {/* 🔴 O CÓDIGO, não só o nome. Cirurgia é o procedimento de maior
            valor da tabela: sem SIGTAP não há AIH, sem TUSS não há guia
            TISS. Antes era um input livre, e o faturista redigitava tudo
            do papel — onde nasce o código trocado. O nome continua
            editável porque o catálogo nem sempre tem o termo que a sala
            usa, e porque cirurgia fora do catálogo ainda precisa entrar. */}
        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>Procedimento do catálogo</label>
          <select value={f.procedimento_cod} style={inp}
            onChange={e => {
              const esc = procedimentoEscolhido(procedimentos, e.target.value);
              setF(prev => ({ ...prev, procedimento_cod: e.target.value,
                              procedimento: esc ? esc.nome : prev.procedimento }));
            }}>
            <option value="">— sem código (não fatura)</option>
            {procedimentos.map(o => <option key={o.codigo} value={o.codigo}>{o.codigo} — {o.nome}</option>)}
          </select>
          {!f.procedimento_cod && (
            <div style={{ fontSize: 10.5, color: "#fbbf24", marginTop: 3 }}>
              Sem código a cirurgia não vira conta: nem AIH, nem guia TISS.
            </div>
          )}
        </div>
        <div style={{ marginBottom: 10 }}><label style={lbl}>Procedimento *</label><input value={f.procedimento} onChange={e => set("procedimento", e.target.value)} placeholder="Ex.: Colecistectomia videolaparoscópica" style={inp} /></div>

        {/* 🔴 SÍTIO E LADO. O Sign In manda a equipe confirmar o sítio
            cirúrgico — e até aqui não havia onde guardá-lo: numa
            artroplastia, "joelho D" ou "joelho E" só existia se alguém
            escrevesse na observação. Cirurgia em lado errado é o evento
            que a Meta 4 da OMS existe para impedir. */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Sítio cirúrgico</label>
            <input value={f.sitio_cirurgico} onChange={e => set("sitio_cirurgico", e.target.value)} placeholder="Ex.: joelho, vesícula, hérnia inguinal" style={inp} /></div>
          <div><label style={lbl}>Lado</label>
            <select value={f.lateralidade} onChange={e => set("lateralidade", e.target.value)} style={inp}>
              <option value="">—</option>
              {Object.entries(LATERALIDADE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>Caráter</label>
          <select value={f.carater_cod} onChange={e => set("carater_cod", e.target.value)} style={inp}>
            <option value="">—</option>
            {CARATER.map(c => <option key={c.chave} value={c.chave}>{c.label}</option>)}
          </select>
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3 }}>
            Exigido na AIH. Separa os indicadores: cancelamento de eletiva é cobrança de gestão; de urgência, não é comparável.
          </div>
        </div>
        <div style={{ marginBottom: 10 }}><label style={lbl}>Cirurgião</label><input value={f.cirurgiao} onChange={e => set("cirurgiao", e.target.value)} placeholder="Sobrenome do cirurgião" style={inp} /></div>
        <div style={{ marginBottom: 10 }}><label style={lbl}>Materiais e OPME necessários</label><textarea value={f.opme} onChange={e => set("opme", e.target.value)} rows={2} placeholder="Ex.: kit vídeo, clipes de titânio; OPME: prótese X (fornecedor Y)" style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} /></div>
        <div style={{ marginBottom: 16 }}><label style={lbl}>Observação</label><input value={f.observacao} onChange={e => set("observacao", e.target.value)} placeholder="Opcional" style={inp} /></div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={salvar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : cirurgia ? "Salvar alterações" : "Agendar"}</button>
        </div>
      </div>
    </div>
  );
}

// Modal de cancelamento com motivo padronizado (alimenta o indicador da Fase C)
function CancelarCirurgiaModal({ cirurgia, onClose, onConfirm }) {
  const [motivo, setMotivo] = useState("");
  const [outro, setOutro] = useState("");
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 11px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  function confirmar() {
    const m = motivo === "Outro" ? (outro.trim() ? `Outro: ${outro.trim()}` : "") : motivo;
    if (!m) { alert("Escolha o motivo do cancelamento."); return; }
    onConfirm(cirurgia, m);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 420, maxWidth: "94vw" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Cancelar cirurgia — {cirurgia.iniciais}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>{cirurgia.procedimento}</div>
        <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 5 }}>Motivo do cancelamento *</label>
        <select value={motivo} onChange={e => setMotivo(e.target.value)} style={{ ...inp, marginBottom: 10 }}>
          <option value="">Escolha…</option>
          {CC_MOTIVOS_CANCELAMENTO.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        {motivo === "Outro" && <input value={outro} onChange={e => setOutro(e.target.value)} placeholder="Descreva o motivo" style={{ ...inp, marginBottom: 10 }} />}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Voltar</button>
          <button onClick={confirmar} style={{ background: "#f43f5e", color: "#fff", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Confirmar cancelamento</button>
        </div>
      </div>
    </div>
  );
}

function BlocoIndicadores({ sb, salasAtivas }) {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth());
  const [ano, setAno] = useState(now.getFullYear());
  const [rows, setRows] = useState([]);
  const [horasDia, setHorasDia] = useState(8);
  const [diasMes, setDiasMes] = useState(() => diasUteisNoMes(now.getFullYear(), now.getMonth()));

  useEffect(() => {
    const ini = `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
    const fim = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(new Date(ano, mes + 1, 0).getDate()).padStart(2, "0")}`;
    // A marca de falha sobrevive até a tela; quem desenha o painel decide
    // o que dizer. Antes isto virava `[]` e o mês sem leitura ficava
    // indistinguível do mês sem cirurgia.
    if (sb) sb(`cc_cirurgias?data=gte.${ini}&data=lte.${fim}&select=*`).then(r => setRows(listaLida(r)));
    setDiasMes(diasUteisNoMes(ano, mes));
  }, [mes, ano]);

  const inp = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none" };
  const secLbl = { fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 };
  const fmt1 = v => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));

  const concluidas = rows.filter(c => c.status === "concluida");
  const canceladas = rows.filter(c => c.status === "cancelada");
  const total = rows.length;
  const txCancel = total > 0 ? (canceladas.length / total) * 100 : null;

  // Ocupação de salas: minutos de sala usados ÷ minutos ofertados
  const minutosUsados = rows.reduce((a, c) => {
    const m = diffMin(c.entrada_sala_em, c.saida_sala_em);
    return a + (m != null && m > 0 ? m : 0);
  }, 0);
  const minutosOfertados = salasAtivas.length * diasMes * horasDia * 60;
  const ocupacao = minutosOfertados > 0 ? (minutosUsados / minutosOfertados) * 100 : null;

  // Tempos médios
  const media = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const tCirurgia = media(concluidas.map(c => diffMin(c.inicio_cirurgia_em, c.fim_cirurgia_em)).filter(v => v != null && v > 0));
  const tSala = media(concluidas.map(c => diffMin(c.entrada_sala_em, c.saida_sala_em)).filter(v => v != null && v > 0));
  const tRpa = media(concluidas.map(c => diffMin(c.rpa_entrada_em, c.rpa_saida_em)).filter(v => v != null && v > 0));

  // Adesão ao checklist de cirurgia segura
  const comChecklist = concluidas.filter(c => c.chk_sign_in && c.chk_time_out && c.chk_sign_out).length;
  const adesao = concluidas.length > 0 ? (comChecklist / concluidas.length) * 100 : null;

  // Cancelamentos por motivo
  const porMotivo = {};
  canceladas.forEach(c => { const m = (c.cancelamento_motivo || "Sem motivo registrado").replace(/^Outro: .*/, "Outro"); porMotivo[m] = (porMotivo[m] || 0) + 1; });
  const motivosOrd = Object.entries(porMotivo).sort((a, b) => b[1] - a[1]);

  // Produtividade por cirurgião
  const porCirurgiao = {};
  concluidas.forEach(c => {
    const nome = c.cirurgiao || "Sem cirurgião registrado";
    if (!porCirurgiao[nome]) porCirurgiao[nome] = { n: 0, min: 0, comTempo: 0 };
    porCirurgiao[nome].n++;
    const m = diffMin(c.inicio_cirurgia_em, c.fim_cirurgia_em);
    if (m != null && m > 0) { porCirurgiao[nome].min += m; porCirurgiao[nome].comTempo++; }
  });
  const cirurgioesOrd = Object.entries(porCirurgiao).sort((a, b) => b[1].n - a[1].n);
  const maxN = cirurgioesOrd.length ? cirurgioesOrd[0][1].n : 0;
  const maxMotivo = motivosOrd.length ? motivosOrd[0][1] : 0;

  const RateCard = ({ label, valor, unidade, cor, sub }) => (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${cor || "var(--border)"}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: cor || "var(--text)", fontFamily: "JetBrains Mono, monospace", marginTop: 3 }}>{valor}<span style={{ fontSize: 12, fontWeight: 600, marginLeft: 3, color: "var(--text-muted)" }}>{unidade}</span></div>
      {sub && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
  const Barra = ({ rotulo, valor, max, cor, extra }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 12, color: "var(--text-2)", width: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rotulo}</span>
      <div style={{ flex: 1, height: 14, background: "var(--surface-3)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: (max > 0 ? Math.max(3, (valor / max) * 100) : 0) + "%", height: "100%", background: cor, borderRadius: 99 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, width: 110, textAlign: "right", color: "var(--text)" }}>{extra}</span>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: "1.25rem" }}>
        <div><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 4 }}>Mês</div>
          <select value={mes} onChange={e => setMes(+e.target.value)} style={inp}>{MONTHS_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}</select></div>
        <div><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 4 }}>Ano</div>
          <input type="number" value={ano} onChange={e => setAno(+e.target.value)} style={{ ...inp, width: 90 }} /></div>
        <div><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 4 }}>Horas ofertadas/sala/dia</div>
          <input type="number" min="1" max="24" value={horasDia} onChange={e => setHorasDia(Number(e.target.value) || 8)} style={{ ...inp, width: 90 }} /></div>
        <div><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 4 }}>Dias considerados</div>
          <input type="number" min="1" max="31" value={diasMes} onChange={e => setDiasMes(Number(e.target.value) || 1)} style={{ ...inp, width: 80 }} /></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: "1.5rem" }}>
        <RateCard label="Cirurgias no mês" valor={total} unidade="" cor="#3b82f6" sub={`${concluidas.length} concluída(s)`} />
        <RateCard label="Ocupação de salas" valor={ocupacao != null ? fmt1(ocupacao) : "—"} unidade="%" cor={ocupacao == null ? "var(--border)" : ocupacao >= 75 ? "#34d399" : ocupacao >= 50 ? "#d97706" : "#f43f5e"} sub={`${fmtDur(minutosUsados)} usados · ${salasAtivas.length} sala(s) × ${diasMes}d × ${horasDia}h`} />
        <RateCard label="Taxa de cancelamento" valor={txCancel != null ? fmt1(txCancel) : "—"} unidade="%" cor={txCancel == null ? "var(--border)" : txCancel <= 5 ? "#34d399" : txCancel <= 10 ? "#d97706" : "#f43f5e"} sub={`${canceladas.length} cancelada(s)`} />
        <RateCard label="Adesão cirurgia segura" valor={adesao != null ? fmt1(adesao) : "—"} unidade="%" cor={adesao == null ? "var(--border)" : adesao >= 95 ? "#34d399" : "#d97706"} sub="concluídas com os 3 checklists" />
        <RateCard label="Tempo médio de cirurgia" valor={tCirurgia != null ? fmtDur(Math.round(tCirurgia)) : "—"} unidade="" cor="#6366f1" sub="incisão → fim" />
        <RateCard label="Tempo médio de sala" valor={tSala != null ? fmtDur(Math.round(tSala)) : "—"} unidade="" cor="#6366f1" sub="entrada → saída da sala" />
        <RateCard label="Tempo médio de RPA" valor={tRpa != null ? fmtDur(Math.round(tRpa)) : "—"} unidade="" cor="#d97706" sub="recuperação anestésica" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 12, marginBottom: "1.5rem" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
          <div style={secLbl}>Produtividade por cirurgião ({MONTHS[mes]})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {cirurgioesOrd.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>Nenhuma cirurgia concluída no mês.</div>}
            {cirurgioesOrd.map(([nome, d]) => (
              <Barra key={nome} rotulo={nome} valor={d.n} max={maxN} cor="#0d9488" extra={`${d.n} cir.${d.comTempo ? ` · méd ${fmtDur(Math.round(d.min / d.comTempo))}` : ""}`} />
            ))}
          </div>
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
          <div style={secLbl}>Cancelamentos por motivo ({MONTHS[mes]})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {motivosOrd.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>Nenhum cancelamento no mês.</div>}
            {motivosOrd.map(([motivo, n]) => (
              <Barra key={motivo} rotulo={motivo} valor={n} max={maxMotivo} cor="#e11d48" extra={`${n} (${fmt1((n / Math.max(canceladas.length, 1)) * 100)}%)`} />
            ))}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
        Ocupação = tempo de sala efetivamente usado (entrada → saída registradas) ÷ tempo ofertado (salas ativas × dias × horas). Ajuste "horas ofertadas" e "dias considerados" à realidade do seu bloco. Cirurgias sem tempos registrados não entram no cálculo de ocupação e médias.
      </div>
    </div>
  );
}

// Checklist de Cirurgia Segura (OMS). Item não confirmado é PERMITIDO e custa
// descrever o que houve — ver o docblock abaixo.
/**
 * A equipe de uma cirurgia — quem estava na sala, com o que fatura.
 *
 * ⚠️ O NOME, O CONSELHO E O CBO SÃO CARIMBADOS do perfil escolhido, não
 * referenciados. O cadastro muda (troca de CBO, renova conselho, sai do
 * hospital) e quem operou aquele paciente naquele dia não muda junto. É o
 * mesmo princípio do \`executante_cbo\` em \`at_conta_itens\`.
 *
 * Aceita nome DIGITADO também: cirurgião externo opera no hospital sem
 * ter login, e recusá-lo deixaria a cirurgia sem executante — pior que
 * registrar sem CBO, porque sem executante o procedimento não é pago.
 */
function EquipeDaCirurgia({ membros = [], perfis = [], onAdd, onTirar }) {
  const [papel, setPapel] = useState("");
  const [username, setUsername] = useState("");
  const [nome, setNome] = useState("");
  const [grau, setGrau] = useState("");
  const [erro, setErro] = useState(null);
  const [busy, setBusy] = useState(false);

  const perfil = perfis.find(x => x.username === username) || null;
  const cx = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6,
               padding: "6px 8px", color: "var(--text)", fontSize: 12, boxSizing: "border-box" };

  async function acrescentar() {
    setBusy(true); setErro(null);
    const r = await onAdd({ papel, perfil, nome, grau });
    setBusy(false);
    if (r?.erro) { setErro(r.erro); return; }
    setPapel(""); setUsername(""); setNome(""); setGrau("");
  }

  return (
    <div style={{ marginTop: 8, padding: "9px 11px", background: "var(--surface-2)",
                  border: "1px solid var(--border-2)", borderRadius: 8 }}>
      {membros.length === 0 && (
        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 7 }}>
          Ninguém registrado ainda. Sem cirurgião, a conta desta cirurgia não tem executante.
        </div>
      )}
      {membros.map(m => (
        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12,
                                 padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
          <span style={{ minWidth: 112, color: "var(--text-3)", fontSize: 11, fontWeight: 700 }}>
            {PAPEL_POR_CHAVE[m.papel]?.label || m.papel}
          </span>
          <span style={{ flex: 1, color: "var(--text-2)" }}>
            {m.nome}
            {m.conselho && m.registro_conselho
              ? <span style={{ color: "var(--text-muted)" }}> · {m.conselho} {m.registro_conselho}{m.uf_conselho ? "/" + m.uf_conselho : ""}</span>
              : null}
          </span>
          {/* O CBO fica visível porque é ele que derruba o registro no
              processamento quando falta — e só quem fatura precisa dele. */}
          <span style={{ fontSize: 10.5, fontFamily: "JetBrains Mono, monospace",
                         color: m.cbo ? "var(--text-muted)" : PAPEL_POR_CHAVE[m.papel]?.fatura ? "#fbbf24" : "var(--text-muted)" }}>
            {m.cbo ? "CBO " + m.cbo : PAPEL_POR_CHAVE[m.papel]?.fatura ? "sem CBO" : "—"}
          </span>
          <button onClick={() => onTirar(m)} title="Tirar da equipe"
            style={{ background: "transparent", border: "none", color: "#fb7185", cursor: "pointer", fontSize: 14 }}>×</button>
        </div>
      ))}

      <div style={{ display: "grid", gridTemplateColumns: "132px 1fr 1fr 112px auto", gap: 6, marginTop: 8, alignItems: "center" }}>
        <select value={papel} onChange={e => { setPapel(e.target.value); setErro(null); }} style={cx} aria-label="Função na sala">
          <option value="">função…</option>
          {PAPEIS_EQUIPE.map(x => <option key={x.chave} value={x.chave}>{x.label}</option>)}
        </select>
        <select value={username} onChange={e => { setUsername(e.target.value); setErro(null); }} style={cx} aria-label="Profissional do cadastro">
          <option value="">do cadastro…</option>
          {perfis.map(x => <option key={x.username} value={x.username}>{x.nome || x.username}</option>)}
        </select>
        <input value={username ? (perfil?.nome || "") : nome} disabled={!!username}
          onChange={e => { setNome(e.target.value); setErro(null); }}
          placeholder="ou digite o nome (externo)" style={cx} aria-label="Nome de quem está na sala" />
        <input value={grau} onChange={e => setGrau(e.target.value)}
          placeholder="grau TISS" title="Grau de participação da TISS — define o percentual pago"
          style={cx} aria-label="Grau de participação" />
        <button onClick={acrescentar} disabled={busy}
          style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6,
                   padding: "6px 12px", fontWeight: 700, fontSize: 12, cursor: busy ? "default" : "pointer" }}>
          {busy ? "…" : "+"}
        </button>
      </div>
      {perfil && !perfil.cbo && (
        <div style={{ fontSize: 10.5, color: "#fbbf24", marginTop: 5 }}>
          {perfil.nome} está sem CBO no cadastro. Dá para registrar assim — mas se este papel fatura,
          o registro é rejeitado no processamento. Corrija em Usuários e Perfis.
        </div>
      )}
      {erro && <div role="alert" style={{ marginTop: 6, color: "#fb7185", fontSize: 11.5, lineHeight: 1.45 }}>{erro}</div>}
    </div>
  );
}

/**
 * O modal do checklist de Cirurgia Segura.
 *
 * 🔴 ANTES ELE EXIGIA TODOS OS ITENS MARCADOS (`disabled={!todos}`), e isso
 * parecia rigor. É o contrário: uma equipe com divergência LEGÍTIMA — o
 * antibiótico profilático não foi dado porque o paciente é alérgico, e a
 * anestesia concordou — não conseguia registrar nada. A saída real, no
 * balcão, é marcar a caixinha mentindo. Checklist que empurra para a mentira
 * não mede segurança, mede obediência.
 *
 * Agora: item não confirmado é permitido e CUSTA descrever o que houve. É o
 * que a OMS pede e é o que vale numa análise de causa raiz — "6 de 7, faltou
 * o antibiótico, por alergia, decidido com a anestesia" é informação;
 * "7 de 7" marcado por obrigação não é.
 */
function ChecklistOmsModal({ cirurgia, fase, identidade, onClose, onConfirm }) {
  const def = CHECKLIST_OMS[fase];
  const [marcados, setMarcados] = useState(() => def.itens.map(() => false));
  const [divergencia, setDivergencia] = useState("");
  const [contagem, setContagem] = useState({});
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  const total = def.itens.length;
  const ok = confirmados(marcados);
  const todos = ok === total;
  const falta = conferirRegistro({ cirurgia, fase, marcados, divergencia, contagem });
  const furos = fase === "sign_out" ? contagensQueNaoFecham(contagem) : [];

  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6,
                padding: "7px 9px", color: "var(--text)", fontSize: 13, width: 72, textAlign: "center",
                fontFamily: "JetBrains Mono, monospace", boxSizing: "border-box" };
  const setC = (k, v) => setContagem(c => ({ ...c, [k]: v }));

  // Um par de contagem: entrou × saiu. Dois números, não uma caixinha —
  // "a contagem estava correta" marcado por alguém sem identificação tem
  // valor probatório zero, e corpo estranho retido é never event.
  // Função, NÃO componente: definido dentro do render, um componente novo
  // nasce a cada tecla e o React REMONTA o input — o nó some debaixo de
  // quem está digitando (perde foco, e um clique guardado erra o alvo).
  const par = (rotulo, chave, obrigatorio) => {
    const fecha = contagemFecha({ inicial: contagem[chave + "_inicial"], final: contagem[chave + "_final"] });
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
        <span style={{ fontSize: 12.5, color: "var(--text-2)", width: 120 }}>
          {rotulo}{obrigatorio && <span style={{ color: "#f43f5e" }}> *</span>}
        </span>
        <input type="number" min="0" aria-label={rotulo + " — contagem inicial"} placeholder="entrou"
          value={contagem[chave + "_inicial"] ?? ""} onChange={e => setC(chave + "_inicial", e.target.value)} style={inp} />
        <span style={{ color: "var(--text-muted)" }}>→</span>
        <input type="number" min="0" aria-label={rotulo + " — contagem final"} placeholder="saiu"
          value={contagem[chave + "_final"] ?? ""} onChange={e => setC(chave + "_final", e.target.value)} style={inp} />
        {fecha === true && <span style={{ color: "#34d399", fontSize: 12, fontWeight: 700 }}>fecha</span>}
        {fecha === false && <span style={{ color: "#f43f5e", fontSize: 12, fontWeight: 700 }}>NÃO FECHA</span>}
      </div>
    );
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 600, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Cirurgia Segura — <span style={{ color: def.cor }}>{def.label}</span></div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Momento: {def.quando} · Paciente {identidade?.exibir || cirurgia.iniciais} · {cirurgia.procedimento}</div>

        {/* 🔴 A IDENTIDADE, NO ALTO DA TELA QUE MANDA CONFERI-LA.
            O item 1 deste checklist é "Paciente confirmou identidade". O
            cabeçalho mostrava as iniciais digitadas no agendamento, sem
            nunca compará-las com o cadastro — a conferência de identidade
            podia ser marcada contra o rótulo de outra pessoa. Aqui o aviso
            vem ANTES dos itens, com o nome do cadastro, porque depois de
            marcar já não serve. */}
        {identidade?.aviso && (
          <div role={identidade.grave ? "alert" : undefined}
            style={{ fontSize: 12, marginBottom: 8, padding: "8px 11px", borderRadius: 7, lineHeight: 1.5,
                     fontWeight: identidade.grave ? 700 : 500,
                     background: identidade.grave ? "#f43f5e18" : "#fbbf2410",
                     border: `1px solid ${identidade.grave ? "#f43f5e66" : "#fbbf2455"}`,
                     color: identidade.grave ? "#f43f5e" : "#fbbf24" }}>
            {/* A frase de comando é PRÓPRIA DESTE MODAL, e não repete a do
                cartão de propósito: aqui o próximo gesto da pessoa é marcar
                a caixinha da identidade, e é esse gesto que tem de parar.
                "Confirme antes de seguir" no mapa é orientação; aqui é
                instrução sobre o item que está na tela. */}
            <div style={{ marginBottom: 2 }}>
              {identidade.grave
                ? "🔴 NÃO marque o item de identidade antes de resolver isto:"
                : "⚠ A identidade deste paciente NÃO foi conferida com o cadastro:"}
            </div>
            {identidade.aviso}
          </div>
        )}

        {/* O sítio e o lado, ao lado do item que manda conferi-los. O
            checklist pedia para a equipe confirmar um dado que o sistema
            não guardava. */}
        {fase === "sign_in" && (
          <div style={{ fontSize: 12, marginBottom: 8, padding: "7px 10px", borderRadius: 7,
                        background: cirurgia.sitio_cirurgico ? "var(--surface-2)" : "#fbbf2410",
                        border: `1px solid ${cirurgia.sitio_cirurgico ? "var(--border)" : "#fbbf2455"}` }}>
            {cirurgia.sitio_cirurgico
              ? <>Sítio: <strong>{cirurgia.sitio_cirurgico}</strong>{cirurgia.lateralidade ? <> · lado <strong>{LATERALIDADE[cirurgia.lateralidade] || cirurgia.lateralidade}</strong></> : null}</>
              : <span style={{ color: "#fbbf24" }}>Sítio cirúrgico <strong>não registrado</strong> — confirme com a equipe e preencha na cirurgia antes de conferir este item.</span>}
          </div>
        )}

        <div style={{ fontSize: 11.5, color: "var(--text-3)", marginBottom: 14, lineHeight: 1.5 }}>Protocolo de Cirurgia Segura (OMS/Anvisa). Confirme cada item EM VOZ ALTA com a equipe antes de marcar.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {def.itens.map((item, i) => (
            <label key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: marcados[i] ? def.cor + "11" : "var(--surface-2)", border: `1px solid ${marcados[i] ? def.cor + "55" : "var(--border)"}`, borderRadius: 8, padding: "9px 12px", cursor: "pointer", fontSize: 13, color: "var(--text-2)", lineHeight: 1.5 }}>
              <input type="checkbox" checked={marcados[i]} onChange={() => setMarcados(m => m.map((v, j) => j === i ? !v : v))} style={{ marginTop: 2, accentColor: def.cor, width: 16, height: 16, flexShrink: 0 }} />
              {item}
            </label>
          ))}
        </div>

        {fase === "sign_out" && (
          <div style={{ marginBottom: 14, padding: "11px 13px", background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 9 }}>
              Contagem — entrou → saiu
            </div>
            {par("Compressas", "compressas", true)}
            {par("Instrumentais", "instrumentais")}
            {par("Agulhas", "agulhas")}
          </div>
        )}

        {/* A divergência aparece quando é exigida — pedir sempre faria dela
            mais um campo a ignorar. */}
        {(!todos || furos.length > 0) && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", display: "block", marginBottom: 5 }}>
              {furos.length > 0
                ? `A contagem NÃO fecha (${furos.map(f => `${f.nome} ${f.inicial}/${f.final}`).join(", ")}). O que foi feito? *`
                : `Faltou confirmar ${total - ok} de ${total}. O que não foi confirmado, e como a equipe resolveu? *`}
            </label>
            <textarea value={divergencia} onChange={e => { setDivergencia(e.target.value); setErro(null); }} rows={2}
              placeholder="Ex.: antibiótico não administrado — paciente alérgico, conduta definida com a anestesia."
              style={{ background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontSize: 13, width: "100%", boxSizing: "border-box", resize: "vertical", fontFamily: "Inter, sans-serif" }} />
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3 }}>
              {divergencia.trim().length}/{MOTIVO_MIN} — isto é o que alguém vai ler numa análise de causa raiz.
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, color: todos ? def.cor : "#fbbf24", fontWeight: 700 }}>{ok}/{total} itens confirmados</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Voltar</button>
            <button
              onClick={async () => {
                if (falta) { setErro(falta); return; }
                setBusy(true); setErro(null);
                const r = await onConfirm({ marcados, divergencia, contagem });
                setBusy(false);
                // O modal NÃO fecha sozinho: quem fecha é quem chamou, e só
                // depois de a gravação se confirmar.
                if (r && r.erro) setErro(r.erro);
              }}
              disabled={busy}
              title={falta || undefined}
              style={{ background: falta ? "var(--surface-3)" : def.cor, color: falta ? "var(--text-muted)" : "#fff", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: busy ? "default" : "pointer", fontSize: 13 }}>
              {busy ? "…" : `Concluir ${def.label}`}
            </button>
          </div>
        </div>
        {erro && <div role="alert" style={{ marginTop: 10, color: "#fb7185", fontSize: 12.5, lineHeight: 1.45 }}>{erro}</div>}
      </div>
    </div>
  );
}

// Gerenciar salas do bloco
function CcSalasModal({ salas, onClose, onSave, onDelete, isMaster }) {
  const [nome, setNome] = useState("");
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", flex: 1, boxSizing: "border-box" };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 440, maxWidth: "94vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Salas do Bloco Cirúrgico</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input value={nome} onChange={e => setNome(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && nome.trim()) { onSave({ nome: nome.trim(), ordem: salas.length, ativa: true }); setNome(""); } }} placeholder="Ex.: Sala 1" style={inp} />
          <button onClick={() => { if (nome.trim()) { onSave({ nome: nome.trim(), ordem: salas.length, ativa: true }); setNome(""); } }} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Salvar</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {salas.length === 0 && <div style={{ fontSize: 13, color: naoDeuParaLer(salas) ? "#fbbf24" : "var(--text-muted)", textAlign: "center", padding: "10px" }}>{naoDeuParaLer(salas) ? "Não consegui ler o catálogo — não sei se há salas." : "Nenhuma sala cadastrada."}</div>}
          {salas.map(s => (
            <div key={s.nome} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px" }}>
              <strong style={{ flex: 1 }}>{s.nome}</strong>
              <button onClick={() => onSave({ ...s, ativa: s.ativa === false })} style={btnContorno(s.ativa === false ? "#34d399" : "#d97706")}>{s.ativa === false ? "Reativar" : "Desativar"}</button>
              {isMaster && <button onClick={() => { if (confirm(`Remover a sala ${s.nome}?`)) onDelete(s.nome); }} style={btnContorno("#f43f5e")}>Excluir</button>}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
