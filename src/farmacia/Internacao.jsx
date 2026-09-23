// ═══════════════════════════════════════════════════════════
// A INTERNAÇÃO DENTRO DA FARMÁCIA — a tela
//
// A regra de negócio mora em ./internacao.js (pura e testada). Aqui só
// entram carga, estado e desenho.
//
// ⚠️ DUAS TELAS, UM COMPONENTE (`modo`): "analise" mostra os alertas e o
// botão de validar; "dispensacao" mostra o que falta sair e abre o modal de
// baixa. A fila, a validação e a conta do que já saiu são as MESMAS — duas
// cópias divergiriam na primeira regra nova, como já aconteceu com a
// alergia e com o "quanto já saiu".
//
// ⚠️ CONTEXTO CLÍNICO INCOMPLETO É DITO NA TELA. Idade e condições vêm de
// tabelas do módulo Paciente 360. Quem não tem esse módulo (o auxiliar de
// farmácia) recebe lista vazia do RLS — e lista vazia não pode virar
// "paciente sem sonda, sem idade de risco". A faixa avisa.
// ═══════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from "react";
import { analisarPrescricaoClinica, FARM_GRAV, FARM_SCORE_COR, farmFmtQtd, scorePrescricao } from "../clinico/alertas.js";
import { alergiasDoPaciente } from "../clinico/contexto.js";
import { motivoDaRecusa, podeClinico, assinaturaDe } from "../clinico/papeis.js";
import { useAlergiasDosAtendimentos } from "../clinico/usar-alergias.js";
import { contextoDoInternado } from "../prontuario/contexto-internado.js";
import { registrarAuditoria } from "../auditoria/dados.js";
import { AvisoLeitura, campoTexto, rotuloCampo } from "../ui/base.jsx";
import { fmtDataBR } from "../util/datas.js";
import { algumaFalhou } from "../util/leitura.js";
import { farmFmtQtd as _fmt } from "../clinico/alertas.js";
import { FARM_ALERTA_TIPOS } from "./catalogo.js";
import DispensarModal from "./DispensarModal.jsx";
import {
  addFarmMovimentoRemote, addFarmValidacaoRemote, loadContextoDosInternados, loadEpisodiosAbertos, loadEventosDasPrescricoes,
  loadFarmIncompatY, loadFarmInteracoes, loadFarmLotes, loadFarmMedicamentos, loadItensDasPrescricoes,
  loadMovimentosDosEpisodios, loadPrescricoesDosEpisodios, loadValidacoesDasPrescricoes,
} from "./dados.js";
import {
  CHAVE_ITEM_INTERNACAO, filaDaInternacao, podeDispensarInternado, rotuloDaValidacao, vinculoDoInternado,
} from "./internacao.js";

const cartao = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 };

/**
 * Carrega tudo o que a internação precisa na farmácia.
 * `comContexto` = o usuário tem o módulo Paciente 360 (idade e condições).
 */
export function useInternacaoFarmacia(sb, { comContexto } = {}) {
  const [dados, setDados] = useState({ episodios: [], prescricoes: [], itens: [], eventos: [], movimentos: [], validacoes: [] });
  const [catalogo, setCatalogo] = useState({ meds: [], lotes: [], interacoes: null, incompatY: null });
  const [contexto, setContexto] = useState({ pacientes: [], condicoes: [] });
  const [carregando, setCarregando] = useState(true);
  const idxAlergias = useAlergiasDosAtendimentos(sb, dados.episodios);

  const recarregar = useCallback(async () => {
    if (!sb) return;
    const episodios = await loadEpisodiosAbertos(sb);
    const epIds = episodios.map(e => e.id);
    const prescricoes = await loadPrescricoesDosEpisodios(sb, epIds);
    const presIds = prescricoes.map(p => p.id);
    const [itens, eventos, movimentos, validacoes] = await Promise.all([
      loadItensDasPrescricoes(sb, presIds),
      loadEventosDasPrescricoes(sb, presIds),
      loadMovimentosDosEpisodios(sb, epIds),
      loadValidacoesDasPrescricoes(sb, presIds),
    ]);
    setDados({ episodios, prescricoes, itens, eventos, movimentos, validacoes });
    if (comContexto) setContexto(await loadContextoDosInternados(sb, episodios.map(e => e.prontuario)));
    setCarregando(false);
  }, [sb, comContexto]);

  useEffect(() => {
    let vivo = true;
    (async () => { await recarregar(); if (!vivo) return; })();
    const onFocus = () => recarregar();
    window.addEventListener("focus", onFocus);
    return () => { vivo = false; window.removeEventListener("focus", onFocus); };
  }, [recarregar]);

  useEffect(() => {
    if (!sb) return;
    loadFarmMedicamentos(sb).then(meds => setCatalogo(c => ({ ...c, meds })));
    loadFarmLotes(sb).then(lotes => setCatalogo(c => ({ ...c, lotes })));
    loadFarmInteracoes(sb).then(interacoes => setCatalogo(c => ({ ...c, interacoes })));
    loadFarmIncompatY(sb).then(incompatY => setCatalogo(c => ({ ...c, incompatY })));
  }, [sb]);

  const medById = useMemo(() => Object.fromEntries(catalogo.meds.map(m => [m.id, m])), [catalogo.meds]);
  const fila = useMemo(() => filaDaInternacao(dados), [dados]);

  const ctxDe = useCallback(ep => {
    const paciente = contexto.pacientes.find(p => p.prontuario === ep.prontuario) || null;
    const condicoes = contexto.condicoes.filter(c => c.prontuario === ep.prontuario);
    return contextoDoInternado({ paciente, alergias: alergiasDoPaciente(idxAlergias, ep.prontuario), condicoes });
  }, [contexto, idxAlergias]);

  const alertasDe = useCallback((linha) =>
    analisarPrescricaoClinica(linha.itens, ctxDe(linha.ep), medById, catalogo.interacoes, catalogo.incompatY),
  [ctxDe, medById, catalogo.interacoes, catalogo.incompatY]);

  return { ...dados, ...catalogo, medById, fila, ctxDe, alertasDe, carregando, recarregar, idxAlergias };
}

/** A tarja de validação do cartão. */
function SeloValidacao({ situacao }) {
  const r = rotuloDaValidacao(situacao.estado);
  return (
    <span title={situacao.linha?.observacao || ""} style={{ fontSize: 9.5, fontWeight: 800, color: r.cor, border: `1px solid ${r.cor}66`, background: `${r.cor}14`, borderRadius: 99, padding: "1px 8px", textTransform: "uppercase", whiteSpace: "nowrap" }}>
      {r.label}
    </span>
  );
}

export default function FarmInternacaoView({ sb, sbCru, currentUser, canEdit, leProntuario, modo = "dispensacao" }) {
  const ctx = useInternacaoFarmacia(sb, { comContexto: leProntuario });
  const { fila, medById, lotes, movimentos, carregando, recarregar, alertasDe } = ctx;
  const [busca, setBusca] = useState("");
  const [soPendentes, setSoPendentes] = useState(false);
  const [aberto, setAberto] = useState({});
  const [dispEp, setDispEp] = useState(null);
  const [validando, setValidando] = useState(null);

  const podeValidar = podeClinico(currentUser, "validacao_farmaceutica");

  // Dispensar e devolver são a mesma escrita no kardex; o motivo distingue.
  // Confere o retorno: o gatilho do banco recusa controlado sem prescritor,
  // devolução acima do que saiu e lote vencido — e a recusa precisa chegar a
  // quem está no balcão, não virar um "nada aconteceu".
  async function registrarMovimento(mov) {
    const devolucao = mov.devolucao_de != null;
    const r = await addFarmMovimentoRemote(sbCru, mov, currentUser);
    if (!r.ok) { alert(`Não foi possível ${devolucao ? "registrar a devolução" : "dispensar"}.\n` + (r.erro || "")); return false; }
    const med = medById[mov.medicamento_id];
    registrarAuditoria(sb, currentUser, devolucao ? "devolução do setor (farmácia)" : "dispensação farmácia (internação)",
      `${mov.paciente_iniciais || mov.paciente_prontuario || "?"} · ${med?.nome || mov.medicamento_id} · ${_fmt(mov.quantidade)}${devolucao && mov.observacao ? ` · ${mov.observacao}` : ""}`, {});
    setTimeout(recarregar, 350);
    return true;
  }
  const q = busca.trim().toLowerCase();

  const linhas = fila.map(l => ({ ...l, alertas: alertasDe(l) })).filter(l => {
    if (soPendentes && !l.aDispensar.length) return false;
    if (!q) return true;
    return `${l.ep.iniciais || ""} ${l.ep.prontuario || ""} ${l.ep.leito || ""} ${l.ep.setor || ""}`.toLowerCase().includes(q);
  }).sort((a, b) => b.alertas.length - a.alertas.length || (a.ep.setor || "").localeCompare(b.ep.setor || "", "pt-BR"));

  const semValidacao = fila.filter(l => l.validacao.estado === "nao_validada").length;
  const pendentes = fila.reduce((s, l) => s + l.aDispensar.length, 0);

  async function gravarValidacao(linha, corpo) {
    const assin = assinaturaDe(currentUser);
    const r = await addFarmValidacaoRemote(sb, {
      prescricao_id: linha.presc.id, episodio_id: linha.ep.id, prontuario: linha.ep.prontuario,
      farmaceutico_nome: assin.profissional_nome || currentUser?.name || "—",
      conselho: assin.conselho || "CRF", registro_conselho: assin.registro_conselho || null,
      ...corpo,
    }, currentUser);
    if (!r.ok) { alert("A validação NÃO foi gravada.\n\n" + (r.erro || "")); return false; }
    registrarAuditoria(sb, currentUser, "validação farmacêutica da prescrição",
      `${linha.ep.iniciais || linha.ep.prontuario} · prescrição ${linha.presc.id} · ${corpo.resultado}`, {});
    setValidando(null);
    setTimeout(recarregar, 300);
    return true;
  }

  const dispLinha = fila.find(l => l.ep.id === dispEp?.id);

  return (
    <div>
      <AvisoLeitura oQue="a prescrição da internação" listas={[ctx.episodios, ctx.prescricoes, ctx.itens, ctx.validacoes]} />
      {!leProntuario && (
        <div style={{ fontSize: 11.5, color: "#d97706", background: "#d9770610", border: "1px solid #d9770644", borderRadius: 8, padding: "8px 11px", marginBottom: 10, lineHeight: 1.5 }}>
          Seu perfil não abre o prontuário: <strong>idade e condições (sonda) não entram</strong> nos alertas desta tela, e por isso a conferência aqui é parcial. A validação do farmacêutico cobre o que falta.
        </div>
      )}
      {algumaFalhou(ctx.validacoes) && (
        <div style={{ fontSize: 11.5, color: "#f43f5e", marginBottom: 10 }}>Não foi possível ler as validações farmacêuticas — os selos abaixo não são conclusivos.</div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar iniciais, prontuário, leito ou setor…" style={{ ...campoTexto, maxWidth: 320, flex: "1 1 220px" }} />
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--text-2)", cursor: "pointer" }}>
          <input type="checkbox" checked={soPendentes} onChange={e => setSoPendentes(e.target.checked)} style={{ accentColor: "#22d3ee", width: 15, height: 15 }} /> Só com item a dispensar
        </label>
        <span style={{ fontSize: 11.5, color: "var(--text-muted)", marginLeft: "auto" }}>
          {carregando ? "carregando…" : `${fila.length} internado(s) com prescrição · ${pendentes} item(ns) a dispensar · ${semValidacao} sem validação`}
        </span>
      </div>

      {linhas.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>
          {carregando ? "Carregando a prescrição dos internados…" : "Nenhum paciente internado com prescrição de medicamento assinada no momento."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {linhas.map(l => {
            const cont = { alta: l.alertas.filter(a => a.gravidade === "alta").length, media: l.alertas.filter(a => a.gravidade === "media").length };
            const cor = cont.alta ? "#f43f5e" : cont.media ? "#d97706" : "#34d399";
            const score = scorePrescricao(l.itens, l.alertas);
            const exp = aberto[l.ep.id];
            const ctxL = ctx.ctxDe(l.ep);
            return (
              <div key={l.ep.id} style={{ ...cartao, borderLeft: `4px solid ${cor}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", flexWrap: "wrap" }}>
                  <button onClick={() => setAberto(o => ({ ...o, [l.ep.id]: !o[l.ep.id] }))} style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3, background: "transparent", border: "none", cursor: "pointer", color: "var(--text)", textAlign: "left", padding: 0 }}>
                    <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      Leito {l.ep.leito || "?"}{l.ep.setor ? ` · ${l.ep.setor}` : ""} — {l.ep.iniciais || l.ep.prontuario}
                      {ctxL.alergiasIncertas
                        ? <span style={{ fontSize: 9.5, fontWeight: 800, color: "#f43f5e", background: "#f43f5e14", border: "1px solid #f43f5e66", borderRadius: 99, padding: "1px 7px", textTransform: "uppercase" }}>⚠ Alergia NÃO conferida</span>
                        : ctxL.alergias ? <span style={{ fontSize: 9.5, fontWeight: 800, color: "#f43f5e", background: "#f43f5e14", border: "1px solid #f43f5e66", borderRadius: 99, padding: "1px 7px", textTransform: "uppercase" }}>⚠ Alérgico: {ctxL.alergias}</span> : null}
                      <SeloValidacao situacao={l.validacao} />
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      reg. {l.ep.prontuario} · prescrição de {l.presc.data_referencia || fmtDataBR(l.presc.assinada_em)} · {l.itens.length} medicamento(s)
                      {l.aDispensar.length ? ` · ${l.aDispensar.length} a dispensar` : " · tudo dispensado"}
                      {l.suspensosComSaida.length ? ` · ${l.suspensosComSaida.length} suspenso(s) com saída` : ""}
                      {exp ? " ▾" : " ▸"}
                    </div>
                  </button>
                  <span title={`Score da prescrição: ${score}/3`} style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", background: FARM_SCORE_COR[score], borderRadius: 6, padding: "1px 8px" }}>score {score}</span>
                  {modo === "analise" && canEdit && (
                    <button onClick={() => podeValidar ? setValidando(l) : alert(motivoDaRecusa(currentUser, "validacao_farmaceutica"))}
                      style={{ background: podeValidar ? "#22d3ee" : "transparent", color: podeValidar ? "#000" : "var(--text-3)", border: podeValidar ? "none" : "1px solid var(--border)", borderRadius: 6, padding: "7px 14px", fontWeight: 700, cursor: "pointer", fontSize: 12.5 }}>
                      Validar
                    </button>
                  )}
                  {modo === "dispensacao" && canEdit && (
                    <button onClick={() => setDispEp(l.ep)} style={{ background: l.aDispensar.length ? "#22d3ee" : "transparent", color: l.aDispensar.length ? "#000" : "var(--text-3)", border: l.aDispensar.length ? "none" : "1px solid var(--border)", borderRadius: 6, padding: "7px 14px", fontWeight: 700, cursor: "pointer", fontSize: 12.5 }}>
                      {l.aDispensar.length ? "Dispensar" : "Ver itens"}
                    </button>
                  )}
                </div>

                {exp && (
                  <div style={{ padding: "0 14px 12px" }}>
                    {l.validacao.linha && (
                      <div style={{ fontSize: 11.5, color: "var(--text-2)", marginBottom: 8 }}>
                        Avaliada por {l.validacao.linha.farmaceutico_nome}{l.validacao.linha.registro_conselho ? ` (${l.validacao.linha.conselho || "CRF"} ${l.validacao.linha.registro_conselho})` : ""} em {fmtDataBR(l.validacao.linha.criado_em)}
                        {l.validacao.linha.observacao ? ` — ${l.validacao.linha.observacao}` : ""}
                      </div>
                    )}
                    {l.alertas.length === 0
                      ? <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 8 }}>Nenhum alerta para os itens ativos com o contexto disponível.</div>
                      : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                          {l.alertas.map((a, i) => (
                            <div key={i} style={{ background: FARM_GRAV[a.gravidade].cor + "11", border: `1px solid ${FARM_GRAV[a.gravidade].cor}44`, borderRadius: 8, padding: "8px 12px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 9.5, fontWeight: 800, color: FARM_GRAV[a.gravidade].cor, border: `1px solid ${FARM_GRAV[a.gravidade].cor}66`, borderRadius: 99, padding: "0 6px", textTransform: "uppercase" }}>{FARM_GRAV[a.gravidade].label}</span>
                                <strong style={{ fontSize: 12.5 }}>{a.titulo}</strong>
                                <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: "auto" }}>{FARM_ALERTA_TIPOS[a.tipo] || a.tipo}</span>
                              </div>
                              <div style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 3, lineHeight: 1.45 }}>{a.detalhe}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {l.itens.map(i => (
                        <span key={i.id} style={{ fontSize: 11.5, color: "var(--text-2)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 999, padding: "3px 10px" }}>
                          {i.medicamento_nome}{i.dose ? ` · ${i.dose}` : ""}{i.via ? ` · ${i.via}` : ""}{i.frequencia ? ` · ${i.frequencia}` : ""}
                        </span>
                      ))}
                    </div>
                    {l.suspensosComSaida.length > 0 && (
                      <div style={{ fontSize: 11.5, color: "#8b5cf6", marginTop: 8 }}>
                        Suspenso e já dispensado: {l.suspensosComSaida.map(i => `${i.medicamento_nome} (${farmFmtQtd(i.dispensado)})`).join(", ")} — devolva pelo botão Dispensar → Devolver.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {dispLinha && (
        <DispensarModal
          titulo={`Dispensar — leito ${dispLinha.ep.leito || "?"} · ${dispLinha.ep.iniciais || dispLinha.ep.prontuario}`}
          subtitulo={`Internação · prescrição de ${dispLinha.presc.data_referencia || fmtDataBR(dispLinha.presc.assinada_em)}. A baixa é por lote (o que vence antes é sugerido).`}
          itens={[...dispLinha.itens, ...dispLinha.suspensosComSaida]}
          movimentos={movimentos} lotes={lotes} medById={medById} chave={CHAVE_ITEM_INTERNACAO}
          alertas={dispLinha.alertas || []}
          vinculo={vinculoDoInternado(dispLinha.ep, dispLinha.presc)}
          bloqueio={podeDispensarInternado(dispLinha.validacao)}
          prescritor={{ nome: dispLinha.presc.prescritor_nome || "", registro: [dispLinha.presc.conselho, dispLinha.presc.registro_conselho].filter(Boolean).join(" ") }}
          canEdit={canEdit}
          onDispensar={registrarMovimento}
          onDevolver={registrarMovimento}
          onClose={() => setDispEp(null)}
        />
      )}

      {validando && <ValidarModal linha={validando} alertas={validando.alertas || []} onClose={() => setValidando(null)} onGravar={corpo => gravarValidacao(validando, corpo)} />}
    </div>
  );
}

/** Onde o farmacêutico aprova, ressalva ou segura a prescrição. */
function ValidarModal({ linha, alertas, onClose, onGravar }) {
  const [resultado, setResultado] = useState("aprovada");
  const [observacao, setObservacao] = useState("");
  const [busy, setBusy] = useState(false);
  const altos = alertas.filter(a => a.gravidade === "alta").length;

  async function gravar() {
    if (resultado !== "aprovada" && !observacao.trim()) {
      alert("Escreva o motivo: é ele que o prescritor e a enfermagem vão ler.");
      return;
    }
    setBusy(true);
    await onGravar({ resultado, observacao: observacao.trim() || null, alertas_altos: altos, alertas_total: alertas.length });
    setBusy(false);
  }

  const opcoes = [
    ["aprovada", "Aprovada", "Pode dispensar."],
    ["aprovada_com_ressalva", "Aprovada com ressalva", "Dispensa, mas a observação vai junto para a enfermagem."],
    ["pendente_prescritor", "Pendente do prescritor", "A farmácia NÃO libera até o prescritor responder."],
  ];

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 560, maxWidth: "94vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Validação farmacêutica</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
          Leito {linha.ep.leito || "?"} · {linha.ep.iniciais || linha.ep.prontuario} · prescrição de {linha.presc.data_referencia || fmtDataBR(linha.presc.assinada_em)} · {linha.itens.length} medicamento(s) · {alertas.length} alerta(s){altos ? `, ${altos} de gravidade alta` : ""}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {opcoes.map(([valor, titulo, ajuda]) => (
            <label key={valor} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: resultado === valor ? "var(--surface-2)" : "transparent", border: `1px solid ${resultado === valor ? "var(--border-2)" : "var(--border)"}`, borderRadius: 8, padding: "10px 12px", cursor: "pointer" }}>
              <input type="radio" name="resultado" checked={resultado === valor} onChange={() => setResultado(valor)} style={{ accentColor: "#22d3ee", marginTop: 2 }} />
              <span>
                <strong style={{ fontSize: 13 }}>{titulo}</strong>
                <span style={{ display: "block", fontSize: 11.5, color: "var(--text-muted)" }}>{ajuda}</span>
              </span>
            </label>
          ))}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={rotuloCampo}>Observação{resultado === "aprovada" ? " (opcional)" : " *"}</label>
          <textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={3} placeholder="Ex.: ajustar vancomicina para ClCr 28 — falado com a plantonista." style={{ ...campoTexto, resize: "vertical" }} />
        </div>

        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.5 }}>
          A avaliação não se apaga: reavaliar grava uma linha nova, e a mais recente é a que vale. Fica visível para a enfermagem e para quem prescreveu.
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={gravar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Gravar validação"}</button>
        </div>
      </div>
    </div>
  );
}
