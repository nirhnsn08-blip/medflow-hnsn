// ═══════════════════════════════════════════════════════════
// PRONTO-SOCORRO — A TELA
//
// Saiu do App.jsx: 1.351 linhas próprias e 2.065 exclusivas, espalhadas por
// OITO regiões do arquivo. É o maior módulo do sistema.
//
// O catálogo do domínio está em ./catalogo.js e o acesso ao banco em
// ./dados.js — os dois saíram antes, de propósito: `MANCHESTER` é lido por
// 11 declarações e `loadPsAtendimentos` por 10. A Farmácia, o Giro de
// Leitos e o Faturamento leem a fila do PS sem precisar desta tela.
//
// ⚠️ DUAS PROPS DE REDE, e a segunda tem motivo.
//   `sb`     — a função de rede normal. Engole a falha e devolve `null`.
//   `sbCru`  — grava e devolve `{ ok, erro }`. Só o desfecho usa: a recusa
//              vem de gatilho do banco e quem está na recepção precisa LER
//              o motivo, não um "não deu".
//
// ⚠️ A trilha de auditoria vem de ../auditoria/dados.js, com o mesmo `sb`.
// ═══════════════════════════════════════════════════════════

import { carregarCatalogos, carregarPaciente } from "../atendimento/dados.js";
import { avisoDeCatalogo, filtrarProcedimentos, opcoesDeProcedimento, viaDaEscolha } from "../atendimento/escolha-procedimento.js";
import { avisoDeConta, convenioSugerido, dadosDeConta, geraConta, valoresIniciais } from "../atendimento/faturavel.js";
import { PS_ORIGEM_UNIDADES, PS_ORIGENS, PS_VIAS_TRANSF, psPedeDetalhe } from "../atendimento/recepcao.js";
import { registrarAuditoria } from "../auditoria/dados.js";
import { FARM_GRAV, analisarPrescricaoClinica, checarAlergia, farmFmtQtd, normTxt, parseAlergias } from "../clinico/alertas.js";
import { COMORBIDADES } from "../clinico/comorbidades.js";
import { resumoExamesPorCategoria } from "../clinico/exames.js";
import { avaliarObstetrica, obstetricasValidadas } from "../clinico/obstetricia.js";
import { avaliarSinaisVitaisPediatrico, faixasValidadas } from "../clinico/pediatria.js";
import { FARM_ALERTA_TIPOS, FARM_CLASSES } from "../farmacia/catalogo.js";
import { atualizarPreparoRemote, loadFarmIncompatY, loadFarmInteracoes, loadFarmIntervencoes, loadFarmLotes, loadFarmMedicamentos, loadFarmPreparo, loadFarmSaidasByAtendimento, loadFarmSaidasByAtendimentos, updateFarmIntervencaoRemote } from "../farmacia/dados.js";
import { saldoDoMedicamento } from "../farmacia/estoque.js";
import { dispensadoDoItem } from "../farmacia/preparo.js";
import { addSolicitacaoRemote, loadLeitosFromSupabase, loadSetoresFromSupabase, upsertLeitoRemote } from "../leitos/dados.js";
import { idadeMesesParaTriagem } from "../pacientes/identidade.js";
import { AvisoLeitura, HOSPITAL_NOME, HOSPITAL_SIGLA, Icon, MONTHS_FULL, VX, btnContorno, rotuloCampo } from "../ui/base.jsx";
import { avisoSonoro, ligarSom, somLigado } from "../ui/som.js";
import { diffMin, fmtDataBR, fmtDur, horaFmt, isoToLocal, localToIso, nowISO, todayStr } from "../util/datas.js";
import { fmt } from "../util/formato.js";
import { MANCHESTER, PS_ADM_CATEGORIAS, PS_ADM_MOTIVOS, PS_ADM_STATUS, PS_AREAS, PS_CONSCIENCIA, PS_DESFECHOS, PS_DISCRIMINADORES, PS_DOSE_UNID, PS_EVOL_CATEGORIAS, PS_EXAME_CATEGORIAS, PS_FREQUENCIAS, PS_PRIORIDADE, PS_PROTOCOLO, PS_SALA_STATUS, PS_VIAS, fmtSinaisVitais } from "./catalogo.js";
import { addPsAdministracao, addPsAtendimentoRemote, addPsPrescricaoItens, addPsRegistroRemote, addPsSinalRemote, deletePsProtocoloRemote, deletePsSalaRemote, loadPsAdministracoes, loadPsAdministracoesByAtendimentos, loadPsAtendimentos, loadPsAtendimentosPeriodo, loadPsExamesPendentes, loadPsExamesPeriodo, loadPsFinalizadosHoje, loadPsPrescricaoItens, loadPsPrescricaoItensByAtendimentos, loadPsProtocolos, loadPsRegistros, loadPsSalas, loadPsSinais, patchPsAtendimentoDireto, updatePsAtendimentoRemote, updatePsRegistroRemote, upsertPsProtocoloRemote, upsertPsSalaRemote } from "./dados.js";
import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Rótulos dos tipos de alerta (para filtrar prescrições)
const freqDia = label => { const f = PS_FREQUENCIAS.find(x => x.label === label); return f ? f.dia : null; };

// Cores do Protocolo de Manchester são normativas (semântica clínica oficial).
// Protocolo de Manchester ADAPTADO do HNSN — nomenclatura e tempos-alvo oficiais
// da instituição (confirmados pela enfermagem em 2026-07-21).
// `atend` = tipo de atendimento no vocabulário usado no hospital.
// Barra lateral interna do módulo Pronto-Socorro (bloco Triagem)
const PS_NAV = [
  { key: "painel",      label: "Painel de Triagem",  icon: "dashboard" },
  { key: "classificar", label: "Classificar Paciente", icon: "activity" },
  { key: "fila",        label: "Fila de Espera",     icon: "list" },
  { key: "reavaliacao", label: "Reavaliação",        icon: "clock" },
  { key: "protocolo",   label: "Protocolo Manchester", icon: "clipboard" },
  { key: "indicadores", label: "Indicadores",        icon: "chart" },
];

// Barra lateral interna — bloco EMERGÊNCIA (PS)
const PS_NAV_EMERG = [
  { key: "e_painel",         label: "Painel da Emergência", icon: "dashboard" },
  { key: "e_atendimento",    label: "Em atendimento",       icon: "activity" },
  { key: "e_checagem",       label: "Checagem de medicação", icon: "pill" },
  { key: "e_leitos",         label: "Leitos detalhados",    icon: "bed" },
  { key: "e_transferencias", label: "Transferências",       icon: "truck" },
  { key: "e_aguardando",     label: "Aguardando leito",     icon: "clock" },
  { key: "e_ia",             label: "Assistente IA",        icon: "chat" },
];

// PS_VIAS_TRANSF, PS_ORIGENS, PS_ORIGEM_UNIDADES e psPedeDetalhe passaram
// para `src/atendimento/recepcao.js` e são importados no topo. A chegada do
// paciente é registrada em DUAS telas agora (Recepção e este formulário do
// PS); manter duas cópias da mesma lista faria uma ganhar uma origem nova e
// a outra não, sem ninguém perceber — e o indicador de procedência sairia
// diferente conforme a porta usada.
// Mapa de vagas do PS — ordem fixa das áreas (igual ao padrão do Giro de Leitos)
// Retaguarda provisória: alta rotatividade, NÃO entra no censo dos leitos do
// hospital — conta só no panorama do PS. A fonte da verdade é ps_salas.conta_censo.
const psContaCenso = s => s.conta_censo !== false;

// Assistente local do Pronto-Socorro — responde a partir dos dados da tela
const PS_ASSIST_HELP = 'Posso responder sobre: panorama do PS, fila e tempos-alvo, quem está fora do alvo, vagas livres por área, retaguarda vs censo, pacientes em atendimento, aguardando leito, transferências e desfechos do dia. Ex.: "panorama", "quem está fora do alvo?", "vagas livres", "sala vermelha", "aguardando leito".';

function PsAssistenteView({ fila, finalizados, salas, leitos }) {
  const [msgs, setMsgs] = useState([{ role: "a", text: "Olá! Sou o assistente local do Pronto-Socorro. " + PS_ASSIST_HELP }]);
  const [q, setQ] = useState("");
  const fimRef = useRef(null);
  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);
  const agora = nowISO();
  const aguardTri = fila.filter(p => p.status === "aguardando_triagem");
  const aguardAtend = fila.filter(p => p.status === "aguardando_atendimento");
  const emAtend = fila.filter(p => p.status === "em_atendimento");
  const estourou = p => { const alvo = MANCHESTER[p.classificacao]?.alvoMin; if (alvo == null) return false; const m = diffMin(p.triagem_em, agora); return alvo === 0 ? true : (m != null && m > alvo); };
  const fora = aguardAtend.filter(estourou);
  const doCenso = salas.filter(psContaCenso), retag = salas.filter(s => !psContaCenso(s));
  const livres = a => a.filter(s => (s.status || "disponivel") === "disponivel");
  const ocup = a => a.filter(s => s.status === "ocupado");

  function responder(pergunta) {
    const s = normTxt(pergunta);
    const has = (...ks) => ks.some(k => s.includes(k));
    if (!s) return PS_ASSIST_HELP;
    if (has("ajuda", "o que voce", "comando") || s === "?") return PS_ASSIST_HELP;
    if (has("bom dia", "boa tarde", "boa noite", "obrigad", "valeu") || s === "oi" || s === "ola") return "Olá! " + PS_ASSIST_HELP;
    if (has("panorama", "resumo", "visao geral", "situacao", "como esta")) {
      return `Panorama do PS agora:\n• Triagem: ${aguardTri.length} aguardando classificação\n• Fila: ${aguardAtend.length} aguardando atendimento${fora.length ? ` · ⚠ ${fora.length} FORA do tempo-alvo` : " · todos no alvo"}\n• Em atendimento: ${emAtend.length}\n• Vagas: ${livres(salas).length} livre(s) de ${salas.length} (${ocup(salas).length} ocupada(s))\n• Censo: ${doCenso.length} vagas contam nos leitos do hospital · ${retag.length} são retaguarda`;
    }
    if (has("fora do alvo", "estourad", "atrasad", "demorando")) {
      if (!fora.length) return "Ninguém fora do tempo-alvo agora. 👍";
      return `${fora.length} paciente(s) fora do tempo-alvo:\n` + fora.map(p => `• ${p.iniciais} — ${MANCHESTER[p.classificacao]?.label} · esperando ${fmtDur(diffMin(p.triagem_em, agora))} (alvo ${MANCHESTER[p.classificacao]?.alvoMin} min)`).join("\n");
    }
    if (has("vaga", "leito livre", "livres", "disponiv")) {
      const porArea = {}; livres(salas).forEach(s => { const a = s.area || "Outros"; porArea[a] = (porArea[a] || 0) + 1; });
      const linhas = Object.entries(porArea).map(([a, n]) => `• ${a}: ${n} livre(s)`);
      return linhas.length ? `${livres(salas).length} vaga(s) livre(s) no PS:\n` + linhas.join("\n") : "Nenhuma vaga livre no PS no momento.";
    }
    if (has("retaguarda", "censo", "75", "conta")) {
      return `Censo do PS:\n• ${doCenso.length} vaga(s) contam nos leitos do hospital (${ocup(doCenso).length} ocupada(s))\n• ${retag.length} de retaguarda provisória — observação, procedimento, PCR e isolamento infantil — contam SÓ no panorama do PS, por alta rotatividade.`;
    }
    if (has("atendimento", "atendendo")) {
      return emAtend.length ? `${emAtend.length} em atendimento:\n` + emAtend.map(p => { const sl = salas.find(x => x.atendimento_id === p.id); return `• ${p.iniciais}${sl ? ` — ${sl.identificacao}` : ""} · há ${fmtDur(diffMin(p.atendimento_em, agora))}`; }).join("\n") : "Ninguém em atendimento agora.";
    }
    if (has("aguardando leito", "internacao", "internar")) {
      const int = finalizados.filter(p => p.desfecho === "internacao");
      const sem = int.filter(p => !leitos.some(l => l.ps_atendimento_id === p.id || (l.prontuario && p.prontuario && l.prontuario === p.prontuario)));
      return `${int.length} internação(ões) decidida(s) hoje · ${sem.length} ainda sem leito. Leitos livres no hospital: ${leitos.filter(l => l.status === "livre").length}.`;
    }
    if (has("transferencia", "vaga zero", "gerint")) {
      const t = finalizados.filter(p => p.desfecho === "transferencia");
      const via = v => t.filter(p => normTxt(p.observacao).includes(normTxt(v))).length;
      return `${t.length} transferência(s) hoje — Vaga Zero: ${via("Vaga Zero")} · GERINT: ${via("GERINT")}.`;
    }
    if (has("fila", "espera", "aguardando")) {
      return `Fila: ${aguardTri.length} aguardando classificação · ${aguardAtend.length} classificados aguardando atendimento${fora.length ? ` (${fora.length} fora do alvo)` : ""}.`;
    }
    if (has("desfecho", "alta", "obito", "evasao", "hoje")) {
      const c = k => finalizados.filter(p => p.desfecho === k).length;
      return `Desfechos de hoje: alta ${c("alta")} · internação ${c("internacao")} · transferência ${c("transferencia")} · evasão ${c("evasao")} · óbito ${c("obito")}. Total atendidos: ${finalizados.length}.`;
    }
    // busca por área de sala
    const area = [...new Set(salas.map(x => x.area))].find(a => a && s.includes(normTxt(a)));
    if (area) {
      const da = salas.filter(x => x.area === area);
      return `${area}: ${da.length} vaga(s) · ${livres(da).length} livre(s) · ${ocup(da).length} ocupada(s)${da.some(x => !psContaCenso(x)) ? "\n(retaguarda — não conta no censo do hospital)" : ""}`;
    }
    return "Não entendi. " + PS_ASSIST_HELP;
  }
  function enviar(t0) { const t = (t0 != null ? t0 : q).trim(); if (!t) return; setMsgs(m => [...m, { role: "u", text: t }, { role: "a", text: responder(t) }]); setQ(""); }
  const sugestoes = ["Panorama", "Quem está fora do alvo?", "Vagas livres", "Aguardando leito", "Retaguarda vs censo", "Transferências"];
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 260px)", minHeight: 340, maxWidth: 760, marginBottom: 16 }}>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, padding: "4px 2px 12px" }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === "u" ? "flex-end" : "flex-start", maxWidth: "85%", background: m.role === "u" ? VX.royal : "var(--surface)", color: m.role === "u" ? "#fff" : "var(--text)", border: m.role === "u" ? "none" : "1px solid var(--border)", borderRadius: 12, padding: "9px 13px", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.text}</div>
        ))}
        <div ref={fimRef} />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {sugestoes.map(sg => <button key={sg} onClick={() => enviar(sg)} style={{ background: "transparent", color: VX.azul, border: `1px solid ${VX.azul}55`, borderRadius: 99, padding: "4px 11px", fontSize: 11.5, cursor: "pointer" }}>{sg}</button>)}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && enviar()} placeholder="Pergunte sobre o Pronto-Socorro…" style={{ flex: 1, background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 13px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none" }} />
        <button onClick={() => enviar()} style={{ background: VX.azul, color: "#04263b", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Enviar</button>
      </div>
      <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 6 }}>Assistente local — responde a partir dos dados do sistema; nada é enviado para fora.</div>
    </div>
  );
}

// Biblioteca de protocolos do PS — abrir e cadastrar
function PsProtocolosModal({ sb, currentUser, canEdit, isMaster, onClose }) {
  const [lista, setLista] = useState([]);
  const [edit, setEdit] = useState(null);   // protocolo em edição/novo
  const [busca, setBusca] = useState("");
  const [busy, setBusy] = useState(false);
  const carregar = () => loadPsProtocolos(sb).then(setLista);
  useEffect(() => { if (sb) carregar(); }, []);
  const inp2 = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  const q = normTxt(busca);
  const view = lista.filter(p => !q || [p.titulo, p.categoria, p.resumo].some(x => normTxt(x).includes(q)));
  async function salvar() {
    if (!edit.titulo?.trim()) { alert("Informe o título do protocolo."); return; }
    setBusy(true);
    await upsertPsProtocoloRemote(sb, { ...(edit.id ? { id: edit.id } : {}), titulo: edit.titulo.trim(), categoria: edit.categoria?.trim() || null, resumo: edit.resumo?.trim() || null, conteudo: edit.conteudo?.trim() || null, referencia: edit.referencia?.trim() || null, ativo: true }, currentUser);
    registrarAuditoria(sb, currentUser, edit.id ? "PS: editar protocolo" : "PS: cadastrar protocolo", edit.titulo, {});
    setBusy(false); setEdit(null); carregar();
  }
  async function excluir(p) {
    if (!confirm(`Excluir o protocolo "${p.titulo}"?`)) return;
    await deletePsProtocoloRemote(sb, p.id); registrarAuditoria(sb, currentUser, "PS: excluir protocolo", p.titulo, {}); carregar();
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 660, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Protocolos do Pronto-Socorro</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>Protocolos institucionais para consulta no plantão. Revisar periodicamente com a equipe.</div>

        {edit ? (
          <div style={{ border: "1px solid var(--border)", borderRadius: 9, padding: "12px 14px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{edit.id ? "Editar protocolo" : "Novo protocolo"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 9, marginBottom: 9 }}>
              <div><label style={rotuloCampo}>Título *</label><input value={edit.titulo || ""} onChange={e => setEdit(p => ({ ...p, titulo: e.target.value }))} placeholder="Ex.: Protocolo de Dor Torácica" style={inp2} autoFocus /></div>
              <div><label style={rotuloCampo}>Categoria</label><input value={edit.categoria || ""} onChange={e => setEdit(p => ({ ...p, categoria: e.target.value }))} placeholder="Ex.: Cardiologia" style={inp2} /></div>
            </div>
            <div style={{ marginBottom: 9 }}><label style={rotuloCampo}>Resumo</label><input value={edit.resumo || ""} onChange={e => setEdit(p => ({ ...p, resumo: e.target.value }))} placeholder="Uma linha sobre quando aplicar" style={inp2} /></div>
            <div style={{ marginBottom: 9 }}><label style={rotuloCampo}>Conteúdo / passos</label><textarea value={edit.conteudo || ""} onChange={e => setEdit(p => ({ ...p, conteudo: e.target.value }))} rows={7} placeholder={"1. …\n2. …\n3. …"} style={{ ...inp2, resize: "vertical", fontFamily: "inherit" }} /></div>
            <div style={{ marginBottom: 12 }}><label style={rotuloCampo}>Referência / fonte</label><input value={edit.referencia || ""} onChange={e => setEdit(p => ({ ...p, referencia: e.target.value }))} placeholder="Diretriz, ano, sociedade…" style={inp2} /></div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setEdit(null)} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button onClick={salvar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Salvar"}</button>
            </div>
          </div>
        ) : (<>
          <div style={{ display: "flex", gap: 9, marginBottom: 12, flexWrap: "wrap" }}>
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar protocolo…" style={{ ...inp2, flex: 1, minWidth: 180 }} />
            {canEdit && <button onClick={() => setEdit({ titulo: "", categoria: "", resumo: "", conteudo: "", referencia: "" })} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" }}>+ Cadastrar protocolo</button>}
          </div>
          {view.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "1.5rem", border: "1px dashed var(--border)", borderRadius: 10 }}>
              {lista.length === 0 ? "Nenhum protocolo cadastrado ainda." : "Nenhum resultado."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {view.map(p => (
                <details key={p.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px" }}>
                  <summary style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 13 }}>{p.titulo}</strong>
                    {p.categoria && <span style={{ fontSize: 10, color: VX.azul, border: `1px solid ${VX.azul}55`, borderRadius: 99, padding: "0 7px", fontWeight: 700 }}>{p.categoria}</span>}
                    {p.resumo && <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{p.resumo}</span>}
                  </summary>
                  {p.conteudo && <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.6, whiteSpace: "pre-wrap", marginTop: 8 }}>{p.conteudo}</div>}
                  {p.referencia && <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 6 }}>Fonte: {p.referencia}</div>}
                  {canEdit && (
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <button onClick={() => setEdit(p)} style={btnContorno("#3b82f6")}>Editar</button>
                      {isMaster && <button onClick={() => excluir(p)} style={btnContorno("#f43f5e")}>Excluir</button>}
                    </div>
                  )}
                </details>
              ))}
            </div>
          )}
        </>)}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// Alocar um paciente do PS numa sala livre
function PsAlocarSalaModal({ sala, pacientes, onClose, onSave }) {
  const [sel, setSel] = useState("");
  const [busy, setBusy] = useState(false);
  const p = pacientes.find(x => String(x.id) === String(sel));
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 460, maxWidth: "94vw", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Alocar paciente — sala {sala.identificacao}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>{sala.area} · escolha quem vai ocupar a sala.</div>
        {pacientes.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "1.5rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Nenhum paciente disponível (todos já estão em uma sala, ou não há ninguém aguardando/em atendimento).</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {pacientes.map(x => {
              const m = MANCHESTER[x.classificacao];
              const ativo = String(sel) === String(x.id);
              return (
                <button key={x.id} onClick={() => setSel(String(x.id))} style={{ textAlign: "left", background: ativo ? "var(--surface-3)" : "var(--surface-2)", border: `1px solid ${ativo ? "#22d3ee" : "var(--border)"}`, borderRadius: 8, padding: "9px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                  {m && <span style={{ width: 9, height: 9, borderRadius: 99, background: m.cor, flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{x.iniciais}{x.prontuario ? <span style={{ fontWeight: 400, color: "var(--text-muted)" }}> · reg. {x.prontuario}</span> : ""}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m ? m.label : "sem triagem"}{x.queixa ? ` · ${x.queixa}` : ""}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={async () => { if (!p) { alert("Escolha o paciente."); return; } setBusy(true); await onSave(sala, p); setBusy(false); }} disabled={busy || !p}
            style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13, opacity: (busy || !p) ? 0.5 : 1 }}>{busy ? "…" : "Alocar"}</button>
        </div>
      </div>
    </div>
  );
}

// Cadastro das salas do PS (por área)
function PsSalasModal({ salas, onClose, onSave, onDelete, isMaster }) {
  const [nova, setNova] = useState({ identificacao: "", area: PS_AREAS[0], ordem: "" });
  const [busy, setBusy] = useState(false);
  const inp2 = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  async function add() {
    if (!nova.identificacao.trim()) { alert("Informe a identificação da sala (ex.: 01)."); return; }
    setBusy(true);
    await onSave({ identificacao: nova.identificacao.trim(), area: nova.area, ordem: nova.ordem === "" ? 0 : Number(nova.ordem), status: "disponivel", ativo: true });
    setNova({ identificacao: "", area: nova.area, ordem: "" });
    setBusy(false);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 560, maxWidth: "94vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Salas do Pronto-Socorro</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>Cadastre as salas por área. Elas aparecem no mapa do painel.</div>

        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 70px auto", gap: 8, alignItems: "end" }}>
            <div><label style={rotuloCampo}>Identificação *</label><input value={nova.identificacao} onChange={e => setNova(p => ({ ...p, identificacao: e.target.value }))} placeholder="01" style={inp2} /></div>
            <div><label style={rotuloCampo}>Área</label><select value={nova.area} onChange={e => setNova(p => ({ ...p, area: e.target.value }))} style={inp2}>{PS_AREAS.map(a => <option key={a} value={a}>{a}</option>)}</select></div>
            <div><label style={rotuloCampo}>Ordem</label><input type="number" value={nova.ordem} onChange={e => setNova(p => ({ ...p, ordem: e.target.value }))} placeholder="0" style={inp2} /></div>
            <button onClick={add} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Add</button>
          </div>
        </div>

        {salas.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "1.5rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Nenhuma sala cadastrada ainda.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {salas.map(s => {
              const st = PS_SALA_STATUS[s.status] || PS_SALA_STATUS.disponivel;
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "7px 11px", opacity: s.ativo === false ? 0.5 : 1 }}>
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 800, minWidth: 42 }}>{s.identificacao}</span>
                  <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-2)" }}>{s.area}</span>
                  <span style={{ fontSize: 10.5, color: st.cor, border: `1px solid ${st.cor}55`, borderRadius: 99, padding: "0 7px", fontWeight: 700 }}>{st.label}</span>
                  <button onClick={() => onSave({ id: s.id, conta_censo: !psContaCenso(s) })} title="Alterna se a vaga entra nos leitos do hospital ou é retaguarda só do PS"
                    style={btnContorno(psContaCenso(s) ? "#0d9488" : "#d97706")}>{psContaCenso(s) ? "No censo" : "Retaguarda"}</button>
                  <button onClick={() => onSave({ id: s.id, ativo: !(s.ativo !== false) })} style={btnContorno(s.ativo !== false ? "#8d99ab" : "#34d399")}>{s.ativo !== false ? "Desativar" : "Ativar"}</button>
                  {isMaster && <button onClick={() => onDelete(s)} style={btnContorno("#f43f5e")}>Excluir</button>}
                </div>
              );
            })}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// O PS só enxerga atendimento de EMERGÊNCIA.
//
// Desde a agenda do ambulatório, `ps_atendimentos` guarda os dois tipos —
// a tabela é herança do pronto-socorro. Sem este filtro, uma consulta
// ambulatorial com presença confirmada aparece na fila de triagem do
// plantão: polui o painel, suja os indicadores de Manchester e o paciente
// fica "aguardando triagem" para sempre, porque ninguém vai triar uma
// consulta agendada.
//
// Atendimentos do PS de um mês civil (para o relatório mensal). SOMENTE LEITURA.
// As bordas são meia-noite LOCAL convertidas para instante UTC — mesmo idioma das
// outras faixas de mês do app. Não usar toISOString() sobre string de data crua.
// Exames do PS de um mês civil (para o BI do relatório mensal). SOMENTE LEITURA.
// Mesmas bordas de mês local -> UTC dos atendimentos. A categoria (laboratorial/
// imagem/outro) já vem gravada em ps_registros; aqui só se lê para agrupar.
// PATCH com captura de erro (o sb engole !ok) — usado no contexto clínico
// Registros do atendimento (evolução médica, prescrição, exames)
// Quem registrou a evolução no PS. Usa ps_registros.categoria (coluna já existente).
// Antes tudo era rotulado "Evolução médica", mesmo escrito por enfermeiro/técnico.
// Vias de administração da prescrição
// Itens estruturados da prescrição (Farmácia Fase B)
// ===== Checagem de medicação administrada (append-only) =====
// A dispensação diz que o remédio SAIU DA FARMÁCIA; só a checagem diz que ele
// ENTROU NO PACIENTE, com hora e quem administrou.
// Por que a dose prescrita e dispensada não foi dada — vira indicador de segurança
// Quem administra à beira do leito
// Doses já dadas de um item (só as efetivamente administradas contam)
const psDosesDadas = (itemId, adms) => adms.filter(a => String(a.prescricao_item_id) === String(itemId) && a.status !== "nao_administrado").length;

// Nível de consciência (AVPU)
// Avalia os sinais vitais (adulto) e sugere a classificação de Manchester.
// APOIO À DECISÃO: cada alteração vira um "motivo" com o nível que ela dispara;
// a sugestão final é o pior nível encontrado. A palavra final é da triadora.
function avaliarSinaisVitais(v) {
  const motivos = [];
  const add = (nivel, texto) => motivos.push({ nivel, texto });
  const n = x => (x === "" || x == null ? null : Number(x));
  const spo2 = n(v.spo2), fr = n(v.fr), fc = n(v.fc), pas = n(v.pa_sist), temp = n(v.temp), dor = n(v.dor), gli = n(v.glicemia);

  if (v.consciencia === "U") add("vermelho", "Inconsciente (AVPU: U)");
  else if (v.consciencia === "D") add("laranja", "Responde apenas à dor (AVPU: D)");
  else if (v.consciencia === "V") add("laranja", "Responde apenas à voz (AVPU: V)");

  if (spo2 != null) {
    if (spo2 < 85) add("vermelho", `SpO2 ${spo2}% (muito baixa)`);
    else if (spo2 <= 91) add("laranja", `SpO2 ${spo2}% (baixa)`);
    else if (spo2 <= 94) add("amarelo", `SpO2 ${spo2}%`);
  }
  if (fr != null) {
    if (fr < 8 || fr > 35) add("vermelho", `FR ${fr} irpm (crítica)`);
    else if (fr <= 9 || fr >= 25) add("laranja", `FR ${fr} irpm`);
    else if (fr >= 21) add("amarelo", `FR ${fr} irpm`);
  }
  if (fc != null) {
    if (fc < 40 || fc > 150) add("vermelho", `FC ${fc} bpm (crítica)`);
    else if (fc <= 49 || fc >= 121) add("laranja", `FC ${fc} bpm`);
    else if (fc <= 59 || fc >= 100) add("amarelo", `FC ${fc} bpm`);
  }
  if (pas != null) {
    if (pas < 80) add("vermelho", `PA sistólica ${pas} mmHg (choque?)`);
    else if (pas <= 89) add("laranja", `PA sistólica ${pas} mmHg`);
    else if (pas <= 99) add("amarelo", `PA sistólica ${pas} mmHg`);
    else if (pas >= 220) add("laranja", `PA sistólica ${pas} mmHg (crise hipertensiva)`);
    else if (pas >= 180) add("amarelo", `PA sistólica ${pas} mmHg (elevada)`);
  }
  if (temp != null) {
    if (temp < 35) add("laranja", `Temperatura ${temp}°C (hipotermia)`);
    else if (temp >= 40) add("laranja", `Temperatura ${temp}°C (hiperpirexia)`);
    else if (temp >= 38.5) add("amarelo", `Temperatura ${temp}°C (febre alta)`);
    else if (temp >= 37.8) add("verde", `Temperatura ${temp}°C (febril)`);
  }
  if (dor != null && dor > 0) {
    if (dor >= 8) add("laranja", `Dor intensa (${dor}/10)`);
    else if (dor >= 4) add("amarelo", `Dor moderada (${dor}/10)`);
    else add("verde", `Dor leve (${dor}/10)`);
  }
  if (gli != null) {
    if (gli < 60) add("laranja", `Glicemia ${gli} mg/dL (hipoglicemia)`);
    else if (gli > 400) add("amarelo", `Glicemia ${gli} mg/dL (muito elevada)`);
  }

  const temAlgum = [spo2, fr, fc, pas, temp, dor, gli].some(x => x != null) || !!v.consciencia;
  if (!temAlgum) return { sugestao: null, motivos: [] };
  const ordem = ["vermelho", "laranja", "amarelo", "verde"];
  const pior = ordem.find(nv => motivos.some(m => m.nivel === nv));
  return { sugestao: pior || "verde", motivos };
}

function PsRelatorioView({ sb }) {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth());
  const [ano, setAno] = useState(now.getFullYear());
  const [rows, setRows] = useState([]);
  const [exames, setExames] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (!sb) { setRows([]); setExames([]); return; }
    let cancelado = false;
    setCarregando(true);
    loadPsAtendimentosPeriodo(sb, ano, mes).then(r => { if (!cancelado) { setRows(r); setCarregando(false); } });
    loadPsExamesPeriodo(sb, ano, mes).then(r => { if (!cancelado) setExames(r); });
    return () => { cancelado = true; };
  }, [mes, ano]);

  const lbl = { fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 4 };
  const selInp = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none" };
  const fmt1 = v => (v == null || isNaN(v) ? "—" : Number(v).toFixed(1));
  const pct = (n, d) => (d > 0 ? (n / d) * 100 : null);

  // ── Indicadores do período ─────────────────────────────────
  const total = rows.length;
  const finalizados = rows.filter(p => p.status === "finalizado");
  const triados = rows.filter(p => p.classificacao && p.triagem_em);

  const portaTriagem = rows.map(p => diffMin(p.chegada_em, p.triagem_em)).filter(v => v != null && v >= 0);
  const mediaPortaTriagem = portaTriagem.length ? portaTriagem.reduce((a, b) => a + b, 0) / portaTriagem.length : null;
  const permanencias = finalizados.map(p => diffMin(p.chegada_em, p.desfecho_em)).filter(v => v != null && v >= 0);
  const mediaPermanencia = permanencias.length ? permanencias.reduce((a, b) => a + b, 0) / permanencias.length : null;

  // Espera triagem → atendimento, comparada ao alvo de Manchester
  const comEspera = rows.map(p => {
    const alvo = p.classificacao ? MANCHESTER[p.classificacao]?.alvoMin : null;
    const espera = diffMin(p.triagem_em, p.atendimento_em);
    return (alvo == null || espera == null || espera < 0) ? null : { classificacao: p.classificacao, espera, alvo, dentro: espera <= alvo };
  }).filter(Boolean);
  const dentroAlvo = comEspera.filter(x => x.dentro).length;
  const taxaAlvo = pct(dentroAlvo, comEspera.length);

  // Distribuição por classificação de risco
  const porClasse = Object.keys(MANCHESTER).map(k => {
    const doGrupo = triados.filter(p => p.classificacao === k);
    const esperasGrupo = comEspera.filter(x => x.classificacao === k);
    const mediaEspera = esperasGrupo.length ? esperasGrupo.reduce((a, b) => a + b.espera, 0) / esperasGrupo.length : null;
    return {
      k, label: MANCHESTER[k].label, cor: MANCHESTER[k].cor, alvo: MANCHESTER[k].alvoMin,
      n: doGrupo.length, perc: pct(doGrupo.length, triados.length),
      mediaEspera, foraAlvo: esperasGrupo.filter(x => !x.dentro).length,
    };
  });

  // Desfechos do período
  const porDesfecho = Object.keys(PS_DESFECHOS).map(k => ({
    k, label: PS_DESFECHOS[k].label, cor: PS_DESFECHOS[k].cor,
    n: finalizados.filter(p => p.desfecho === k).length,
  }));

  // Série diária de atendimentos (eixo do gráfico)
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const porDia = Array.from({ length: diasNoMes }, (_, i) => {
    const dia = i + 1;
    const n = rows.filter(p => { const d = p.chegada_em ? new Date(p.chegada_em) : null; return d && d.getDate() === dia; }).length;
    return { dia: String(dia).padStart(2, "0"), n };
  });
  const picoDia = porDia.reduce((a, b) => (b.n > a.n ? b : a), { dia: "—", n: 0 });

  // BI de exames do período — separa laboratorial x imagem x outro. A categoria
  // já é gravada em ps_registros; o relatório é que não separava.
  const resumoEx = resumoExamesPorCategoria(exames);
  const examesPorAtend = total > 0 ? resumoEx.n / total : null;

  const printStyles = `@media print { body * { visibility: hidden !important; } #ps-print, #ps-print * { visibility: visible !important; } #ps-print { position: fixed; inset: 0; background: #fff !important; color: #111 !important; padding: 18px; } @page { size: A4 portrait; margin: 12mm; } }`;

  const Kpi = ({ label, valor, unidade, sub, cor }) => (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${cor || "#6366f1"}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "JetBrains Mono, monospace" }}>{valor}<span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>{unidade || ""}</span></div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );

  // Linhas da tabela-resumo (reaproveitadas na tela e no relatório impresso)
  const linhasTabela = porClasse.map(c => [
    c.label,
    fmt(c.n),
    c.perc != null ? `${fmt1(c.perc)}%` : "—",
    c.alvo === 0 ? "imediato" : `${c.alvo} min`,
    c.mediaEspera != null ? fmtDur(c.mediaEspera) : "—",
    c.foraAlvo ? String(c.foraAlvo) : "—",
  ]);

  return (
    <div>
      <style>{printStyles}</style>

      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: "1.25rem" }}>
        <div><div style={lbl}>Mês</div><select value={mes} onChange={e => setMes(+e.target.value)} style={selInp}>{MONTHS_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}</select></div>
        <div><div style={lbl}>Ano</div><input type="number" value={ano} onChange={e => setAno(+e.target.value)} style={{ ...selInp, width: 90 }} /></div>
        <button onClick={() => setPreview(p => !p)} style={{ background: "transparent", color: "#22d3ee", border: "1px solid #164e63", borderRadius: 7, padding: "8px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{preview ? "✕ Fechar relatório" : "Relatório do mês"}</button>
        {preview && <button onClick={() => window.print()} style={{ background: "#34d399", color: "#000", border: "none", borderRadius: 7, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Imprimir / PDF</button>}
        {carregando && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>carregando…</span>}
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: "1.5rem" }}>
        <Kpi label="Atendimentos no mês" valor={fmt(total)} sub={`pico: dia ${picoDia.dia} (${picoDia.n})`} cor="#6366f1" />
        <Kpi label="Finalizados" valor={fmt(finalizados.length)} sub={`${fmt(total - finalizados.length)} em aberto`} cor="#0d9488" />
        <Kpi label="Dentro do tempo-alvo" valor={taxaAlvo != null ? fmt1(taxaAlvo) : "—"} unidade="%" sub={`${dentroAlvo}/${comEspera.length} com espera medida`} cor={taxaAlvo == null ? "var(--border)" : taxaAlvo >= 80 ? "#34d399" : taxaAlvo >= 60 ? "#fbbf24" : "#f43f5e"} />
        <Kpi label="Porta → triagem" valor={mediaPortaTriagem != null ? fmtDur(mediaPortaTriagem) : "—"} sub="tempo médio" cor="#3b82f6" />
        <Kpi label="Permanência média" valor={mediaPermanencia != null ? fmtDur(mediaPermanencia) : "—"} sub="chegada → desfecho" cor="#d97706" />
      </div>

      {/* GRÁFICOS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginBottom: "1.5rem" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Atendimentos por dia — {MONTHS_FULL[mes]}</div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={porDia} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
              <XAxis dataKey="dia" tick={{ fontSize: 9, fill: "var(--text-muted)" }} interval={2} />
              <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} labelFormatter={d => `Dia ${d}`} formatter={v => [v, "atendimentos"]} />
              <Bar dataKey="n" fill="#6366f1" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Classificação de risco (Manchester)</div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={porClasse} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: "var(--text-muted)" }} interval={0} />
              <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={v => [v, "pacientes"]} />
              <Bar dataKey="n" radius={[3, 3, 0, 0]}>{porClasse.map(c => <Cell key={c.k} fill={c.cor} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* TABELA-RESUMO */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Resumo por classificação</div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem", marginBottom: "1.5rem", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr>{["Classificação", "Atend.", "%", "Alvo", "Espera média", "Fora do alvo"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-3)", borderBottom: "1px solid var(--border)", fontSize: 11 }}>{h}</th>)}</tr></thead>
          <tbody>
            {porClasse.map((c, i) => (
              <tr key={c.k}>
                <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)" }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 99, background: c.cor, marginRight: 7 }} />{c.label}</td>
                {linhasTabela[i].slice(1).map((v, j) => <td key={j} style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)", fontFamily: "JetBrains Mono, monospace", color: j === 4 && c.foraAlvo ? "#fb7185" : "var(--text-2)" }}>{v}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* DESFECHOS */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Desfechos do período</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: "1.5rem" }}>
        {porDesfecho.map(d => (
          <div key={d.k} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${d.cor}`, borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)" }}>{d.label}</div>
            <div style={{ fontSize: 19, fontWeight: 800, fontFamily: "JetBrains Mono, monospace" }}>{fmt(d.n)}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{pct(d.n, finalizados.length) != null ? `${fmt1(pct(d.n, finalizados.length))}% dos finalizados` : "—"}</div>
          </div>
        ))}
      </div>

      {/* EXAMES — Laboratorial x Imagem x Outro */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Exames por categoria{examesPorAtend != null ? ` · ${fmt1(examesPorAtend)} por atendimento` : ""}</div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem", marginBottom: "1.5rem", overflowX: "auto" }}>
        {resumoEx.n === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>Nenhum exame solicitado no período.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr>{["Categoria", "Solicitados", "Com resultado", "% com resultado", "Tempo médio até resultado"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-3)", borderBottom: "1px solid var(--border)", fontSize: 11 }}>{h}</th>)}</tr></thead>
            <tbody>
              {resumoEx.porCategoria.map(c => (
                <tr key={c.chave}>
                  <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)" }}>{c.label}</td>
                  <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)", fontFamily: "JetBrains Mono, monospace", color: "var(--text-2)" }}>{fmt(c.n)}</td>
                  <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)", fontFamily: "JetBrains Mono, monospace", color: "var(--text-2)" }}>{fmt(c.comResultado)}</td>
                  <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)", fontFamily: "JetBrains Mono, monospace", color: "var(--text-2)" }}>{c.pctResultado != null ? `${fmt1(c.pctResultado)}%` : "—"}</td>
                  <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)", fontFamily: "JetBrains Mono, monospace", color: "var(--text-2)" }}>{c.tempoMedioMin != null ? fmtDur(c.tempoMedioMin) : "—"}</td>
                </tr>
              ))}
              <tr>
                <td style={{ padding: "6px 8px", fontWeight: 700 }}>Total</td>
                <td style={{ padding: "6px 8px", fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>{fmt(resumoEx.n)}</td>
                <td style={{ padding: "6px 8px", fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>{fmt(resumoEx.comResultado)}</td>
                <td style={{ padding: "6px 8px", fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>{resumoEx.pctResultado != null ? `${fmt1(resumoEx.pctResultado)}%` : "—"}</td>
                <td style={{ padding: "6px 8px", fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>{resumoEx.tempoMedioMin != null ? fmtDur(resumoEx.tempoMedioMin) : "—"}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* RELATÓRIO IMPRIMÍVEL */}
      {preview && (
        <div id="ps-print" style={{ background: "#fff", color: "#111", borderRadius: 10, border: "1px solid #e5e7eb", padding: "24px 28px", fontFamily: "Inter, sans-serif", fontSize: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, paddingBottom: 12, borderBottom: "2px solid #e5e7eb" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>RELATÓRIO PRONTO-SOCORRO — {HOSPITAL_SIGLA}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{HOSPITAL_NOME} · Valentrax Healthcare Operations · Triagem de Manchester e jornada do paciente</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", background: "#f1f5f9", borderRadius: 8, padding: "6px 14px" }}>{MONTHS_FULL[mes]}/{ano}</div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>Gerado em {new Date().toLocaleString("pt-BR")}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 16 }}>
            {[
              ["Atendimentos", fmt(total)],
              ["Finalizados", fmt(finalizados.length)],
              ["Dentro do alvo", taxaAlvo != null ? `${fmt1(taxaAlvo)}%` : "—"],
              ["Porta → triagem", mediaPortaTriagem != null ? fmtDur(mediaPortaTriagem) : "—"],
              ["Permanência média", mediaPermanencia != null ? fmtDur(mediaPermanencia) : "—"],
            ].map(([k, v]) => (
              <div key={k} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", background: "#f8fafc" }}>
                <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: ".04em", fontWeight: 700 }}>{k}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 6 }}>Distribuição por classificação de risco</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 16 }}>
            <thead><tr>{["Classificação", "Atend.", "%", "Alvo", "Espera média", "Fora do alvo"].map(h => <th key={h} style={{ textAlign: "left", padding: "7px 10px", background: "#f8fafc", color: "#334155", borderBottom: "1.5px solid #e2e8f0", fontSize: 11 }}>{h}</th>)}</tr></thead>
            <tbody>
              {linhasTabela.map((linha, i) => (
                <tr key={i}>
                  {linha.map((v, j) => (
                    <td key={j} style={{ padding: "6px 10px", borderBottom: "1px solid #eef2f7", fontWeight: j === 0 ? 600 : 400, color: j === 0 ? "#0f172a" : j === 5 && v !== "—" ? "#be123c" : "#334155" }}>
                      {j === 0 ? <><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 99, background: porClasse[i].cor, marginRight: 7 }} />{v}</> : v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 6 }}>Desfechos</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 16 }}>
            <thead><tr>{["Desfecho", "Qtd.", "% dos finalizados"].map(h => <th key={h} style={{ textAlign: "left", padding: "7px 10px", background: "#f8fafc", color: "#334155", borderBottom: "1.5px solid #e2e8f0", fontSize: 11 }}>{h}</th>)}</tr></thead>
            <tbody>
              {porDesfecho.map(d => (
                <tr key={d.k}>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #eef2f7", fontWeight: 600, color: "#0f172a" }}>{d.label}</td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #eef2f7", color: "#334155" }}>{fmt(d.n)}</td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #eef2f7", color: "#0369a1", fontWeight: 600 }}>{pct(d.n, finalizados.length) != null ? `${fmt1(pct(d.n, finalizados.length))}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 6 }}>Exames por categoria{examesPorAtend != null ? ` — ${fmt1(examesPorAtend)} por atendimento` : ""}</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 16 }}>
            <thead><tr>{["Categoria", "Solicitados", "Com resultado", "%", "Tempo médio"].map(h => <th key={h} style={{ textAlign: "left", padding: "7px 10px", background: "#f8fafc", color: "#334155", borderBottom: "1.5px solid #e2e8f0", fontSize: 11 }}>{h}</th>)}</tr></thead>
            <tbody>
              {resumoEx.porCategoria.map(c => (
                <tr key={c.chave}>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #eef2f7", fontWeight: 600, color: "#0f172a" }}>{c.label}</td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #eef2f7", color: "#334155" }}>{fmt(c.n)}</td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #eef2f7", color: "#334155" }}>{fmt(c.comResultado)}</td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #eef2f7", color: "#334155" }}>{c.pctResultado != null ? `${fmt1(c.pctResultado)}%` : "—"}</td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #eef2f7", color: "#334155" }}>{c.tempoMedioMin != null ? fmtDur(c.tempoMedioMin) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ fontSize: 10, color: "#94a3b8", borderTop: "1px solid #e5e7eb", paddingTop: 8 }}>
            Relatório gerado pela <strong>Valentrax Healthcare Operations</strong> · Pico de movimento no dia {picoDia.dia} ({picoDia.n} atendimentos). Tempos-alvo conforme Protocolo de Manchester. Documento de apoio à gestão — dados agregados, sem identificação de pacientes.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Faixas pediátricas de referência (Triagem Fase 3) ───────────────────
// A tabela ps_faixas_pediatricas guarda, por faixa de idade, os limites de
// FC e FR que definem as zonas (verde/amarelo/laranja/vermelho). Só ADM Master
// edita. O motor (src/clinico/pediatria.js) lê daqui.
const FAIXAS_PED_KEY = "hnsn_faixas_ped";

const loadFaixasPedLocal = () => { try { return JSON.parse(localStorage.getItem(FAIXAS_PED_KEY) || "[]"); } catch { return []; } };

async function loadFaixasPediatricas(sb) {
  const rows = await sb("ps_faixas_pediatricas?select=*&order=ordem");
  if (Array.isArray(rows)) { try { localStorage.setItem(FAIXAS_PED_KEY, JSON.stringify(rows)); } catch {} return rows; }
  return loadFaixasPedLocal();
}

async function saveFaixaPediatrica(sb, faixa, user) {
  await sb("ps_faixas_pediatricas?on_conflict=faixa", {
    method: "POST", headers: { "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify({ ...faixa, usuario: user?.name || null, updated_at: nowISO() }),
  });
}

// Editor das faixas — SÓ ADM Master. Mudar um valor marca a faixa como NÃO
// validada (exige revalidar): alterar limiar clínico não pode passar batido.
function FaixasPediatricasModal({ sb, faixas, currentUser, onClose, onSaved }) {
  const vazio = { faixa: "", rotulo: "", ordem: "", idade_min_meses: "", idade_max_meses: "",
    fc_grave_min: "", fc_moderado_min: "", fc_normal_min: "", fc_normal_max: "", fc_moderado_max: "", fc_grave_max: "",
    fr_grave_min: "", fr_moderado_min: "", fr_normal_min: "", fr_normal_max: "", fr_moderado_max: "", fr_grave_max: "" };
  const [f, setF] = useState(vazio);
  const [busy, setBusy] = useState(false);
  const set = (k, val) => setF(p => ({ ...p, [k]: val }));
  const isMaster = currentUser?.role === "adm_master";
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 7px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 12, outline: "none", width: "100%", boxSizing: "border-box" };
  const hl = { fontSize: 9.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3, textAlign: "center" };
  const numOrNull = v => v === "" || v == null ? null : Number(v);
  const ordenadas = [...(faixas || [])].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const campos = suf => [["grave_min", "Grave ↓"], ["moderado_min", "Moder. ↓"], ["normal_min", "Normal ↓"], ["normal_max", "Normal ↑"], ["moderado_max", "Moder. ↑"], ["grave_max", "Grave ↑"]].map(([k, l]) => [suf + "_" + k, l]);
  const editar = row => setF(Object.keys(vazio).reduce((o, k) => ({ ...o, [k]: row[k] ?? "" }), {}));
  async function salvar(validar) {
    if (!isMaster) return;
    const slug = (f.faixa || "").trim();
    if (!slug || !f.rotulo.trim()) { alert("Informe o identificador e o rótulo da faixa."); return; }
    setBusy(true);
    const payload = { faixa: slug, rotulo: f.rotulo.trim(), ordem: numOrNull(f.ordem) ?? 0, ativo: true, validado: !!validar };
    ["idade_min_meses", "idade_max_meses", "fc_grave_min", "fc_moderado_min", "fc_normal_min", "fc_normal_max", "fc_moderado_max", "fc_grave_max", "fr_grave_min", "fr_moderado_min", "fr_normal_min", "fr_normal_max", "fr_moderado_max", "fr_grave_max"].forEach(k => { payload[k] = numOrNull(f[k]); });
    if (payload.idade_min_meses == null) payload.idade_min_meses = 0;
    await saveFaixaPediatrica(sb, payload, currentUser);
    setBusy(false); setF(vazio); onSaved && onSaved();
  }
  async function marcarValidada(row, val) {
    if (!isMaster) return;
    await saveFaixaPediatrica(sb, { ...row, validado: val }, currentUser); onSaved && onSaved();
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 760, maxWidth: "96vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Faixas pediátricas de referência</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14, marginTop: 2, lineHeight: 1.5 }}>Limites de FC e FR por idade que a triagem pediátrica usa para <em>sugerir</em> a classificação (a enfermeira decide). Ordem crescente: abaixo de <strong>Grave ↓</strong> = vermelho; até <strong>Moder. ↓</strong> = laranja; até <strong>Normal ↓</strong> = amarelo; <strong>Normal ↓–↑</strong> = verde; e simétrico para cima. PA não entra na pediatria. {!isMaster && <strong style={{ color: "#f59e0b" }}>Somente o ADM Master edita.</strong>}</div>

        {isMaster && (
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 14, background: "var(--surface-2)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 70px 90px 90px", gap: 8, marginBottom: 10 }}>
              <div><label style={{ ...hl, textAlign: "left" }}>Identificador</label><input value={f.faixa} onChange={e => set("faixa", e.target.value)} placeholder="ex.: 1a2" style={inp} /></div>
              <div><label style={{ ...hl, textAlign: "left" }}>Rótulo</label><input value={f.rotulo} onChange={e => set("rotulo", e.target.value)} placeholder="1–2 anos" style={inp} /></div>
              <div><label style={{ ...hl, textAlign: "left" }}>Ordem</label><input type="number" value={f.ordem} onChange={e => set("ordem", e.target.value)} style={inp} /></div>
              <div><label style={{ ...hl, textAlign: "left" }}>Idade mín (m)</label><input type="number" value={f.idade_min_meses} onChange={e => set("idade_min_meses", e.target.value)} placeholder="0" style={inp} /></div>
              <div><label style={{ ...hl, textAlign: "left" }}>Idade máx (m)</label><input type="number" value={f.idade_max_meses} onChange={e => set("idade_max_meses", e.target.value)} placeholder="aberto" style={inp} /></div>
            </div>
            {[["FC (bpm)", "fc"], ["FR (irpm)", "fr"]].map(([titulo, suf]) => (
              <div key={suf} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", marginBottom: 4 }}>{titulo}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
                  {campos(suf).map(([k, l]) => (
                    <div key={k}><label style={hl}>{l}</label><input type="number" value={f[k]} onChange={e => set(k, e.target.value)} style={inp} /></div>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <button onClick={() => setF(vazio)} style={{ background: "transparent", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 12px", fontWeight: 600, cursor: "pointer", fontSize: 12 }}>Limpar</button>
              <button onClick={() => salvar(false)} disabled={busy} style={{ background: "var(--surface-3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 14px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>{busy ? "…" : "Salvar (em validação)"}</button>
              <button onClick={() => salvar(true)} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "7px 14px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Salvar e validar</button>
            </div>
          </div>
        )}

        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead><tr>{["Faixa", "Idade (m)", "FC normal", "FR normal", "Status", ""].map(h => <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: "var(--text-muted)", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", background: "var(--bg-2)", borderBottom: "1px solid var(--border)" }}>{h}</th>)}</tr></thead>
            <tbody>
              {ordenadas.length === 0 && <tr><td colSpan={6} style={{ padding: 18, textAlign: "center", color: "var(--text-muted)" }}>Nenhuma faixa cadastrada — rode a migração <code>migracao-ps-faixas-pediatricas.sql</code>.</td></tr>}
              {ordenadas.map(s => (
                <tr key={s.faixa}>
                  <td style={{ padding: "7px 10px", fontWeight: 700 }}>{s.rotulo}</td>
                  <td style={{ padding: "7px 10px", color: "var(--text-3)", fontFamily: "JetBrains Mono, monospace" }}>{s.idade_min_meses ?? 0}–{s.idade_max_meses ?? "∞"}</td>
                  <td style={{ padding: "7px 10px", color: "var(--text-3)", fontFamily: "JetBrains Mono, monospace" }}>{s.fc_normal_min}–{s.fc_normal_max}</td>
                  <td style={{ padding: "7px 10px", color: "var(--text-3)", fontFamily: "JetBrains Mono, monospace" }}>{s.fr_normal_min}–{s.fr_normal_max}</td>
                  <td style={{ padding: "7px 10px" }}>{s.validado ? <span style={{ color: "#34d399", fontWeight: 700 }}>✓ validada</span> : <span style={{ color: "#f59e0b", fontWeight: 700 }}>⏳ em validação</span>}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {isMaster && <>
                      <button onClick={() => editar(s)} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 5, padding: "3px 8px", color: "#22d3ee", cursor: "pointer", fontSize: 11.5, marginRight: 6 }}>Editar</button>
                      <button onClick={() => marcarValidada(s, !s.validado)} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 5, padding: "3px 8px", color: s.validado ? "#f59e0b" : "#34d399", cursor: "pointer", fontSize: 11.5 }}>{s.validado ? "Revogar" : "Validar"}</button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ── Critérios obstétricos de risco (Triagem Fase 3) ─────────────────────
// A tabela ps_faixas_obstetricas guarda cada discriminador → nível + os
// limiares de PA. Só ADM Master edita. O motor (src/clinico/obstetricia.js) lê.
const FAIXAS_OBST_KEY = "hnsn_faixas_obst";

const loadFaixasObstLocal = () => { try { return JSON.parse(localStorage.getItem(FAIXAS_OBST_KEY) || "[]"); } catch { return []; } };

async function loadFaixasObstetricas(sb) {
  const rows = await sb("ps_faixas_obstetricas?select=*&order=ordem");
  if (Array.isArray(rows)) { try { localStorage.setItem(FAIXAS_OBST_KEY, JSON.stringify(rows)); } catch {} return rows; }
  return loadFaixasObstLocal();
}

async function saveFaixaObstetrica(sb, regra, user) {
  await sb("ps_faixas_obstetricas?on_conflict=chave", {
    method: "POST", headers: { "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify({ ...regra, usuario: user?.name || null, updated_at: nowISO() }),
  });
}

// Editor dos critérios obstétricos — SÓ ADM Master. Mudar um nível/limiar marca
// a regra como NÃO validada (exige revalidar): critério clínico não passa batido.
function FaixasObstetricasModal({ sb, regras, currentUser, onClose, onSaved }) {
  const vazio = { chave: "", rotulo: "", ordem: "", nivel: "amarelo", pas_min: "", pad_min: "", requer_sintoma: false };
  const [f, setF] = useState(vazio);
  const [busy, setBusy] = useState(false);
  const set = (k, val) => setF(p => ({ ...p, [k]: val }));
  const isMaster = currentUser?.role === "adm_master";
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 12.5, outline: "none", width: "100%", boxSizing: "border-box" };
  const hl = { fontSize: 9.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 };
  const numOrNull = v => v === "" || v == null ? null : Number(v);
  const ordenadas = [...(regras || [])].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const editar = row => setF({ chave: row.chave, rotulo: row.rotulo, ordem: row.ordem ?? "", nivel: row.nivel || "amarelo", pas_min: row.pas_min ?? "", pad_min: row.pad_min ?? "", requer_sintoma: !!row.requer_sintoma });
  async function salvar(validar) {
    if (!isMaster) return;
    const slug = (f.chave || "").trim();
    if (!slug || !f.rotulo.trim()) { alert("Informe o identificador e o rótulo da regra."); return; }
    setBusy(true);
    await saveFaixaObstetrica(sb, { chave: slug, rotulo: f.rotulo.trim(), ordem: numOrNull(f.ordem) ?? 0, nivel: f.nivel, pas_min: numOrNull(f.pas_min), pad_min: numOrNull(f.pad_min), requer_sintoma: !!f.requer_sintoma, ativo: true, validado: !!validar }, currentUser);
    setBusy(false); setF(vazio); onSaved && onSaved();
  }
  async function marcarValidada(row, val) { if (!isMaster) return; await saveFaixaObstetrica(sb, { ...row, validado: val }, currentUser); onSaved && onSaved(); }
  const cor = nv => (MANCHESTER[nv]?.cor || "var(--text)");
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 760, maxWidth: "96vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Critérios obstétricos de risco</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14, marginTop: 2, lineHeight: 1.5 }}>Cada discriminador ou limiar de PA que a triagem obstétrica usa para <em>sugerir</em> a classificação (a enfermeira decide). Regras com limiar de PA (mmHg) disparam pela pressão; as demais, pela presença do achado. "Exige sintoma" = só dispara com cefaleia/epigastralgia/alteração visual marcados (iminência de pré-eclâmpsia). {!isMaster && <strong style={{ color: "#f59e0b" }}>Somente o ADM Master edita.</strong>}</div>

        {isMaster && (
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 14, background: "var(--surface-2)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 2.4fr 60px", gap: 8, marginBottom: 8 }}>
              <div><label style={hl}>Identificador</label><input value={f.chave} onChange={e => set("chave", e.target.value)} placeholder="ex.: sangramento" style={inp} /></div>
              <div><label style={hl}>Rótulo</label><input value={f.rotulo} onChange={e => set("rotulo", e.target.value)} placeholder="Sangramento vaginal" style={inp} /></div>
              <div><label style={hl}>Ordem</label><input type="number" value={f.ordem} onChange={e => set("ordem", e.target.value)} style={inp} /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 90px 90px auto", gap: 8, alignItems: "end" }}>
              <div><label style={hl}>Nível</label>
                <select value={f.nivel} onChange={e => set("nivel", e.target.value)} style={inp}>
                  {Object.entries(MANCHESTER).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                </select>
              </div>
              <div><label style={hl}>PA sist. ≥</label><input type="number" value={f.pas_min} onChange={e => set("pas_min", e.target.value)} placeholder="—" style={inp} /></div>
              <div><label style={hl}>PA diast. ≥</label><input type="number" value={f.pad_min} onChange={e => set("pad_min", e.target.value)} placeholder="—" style={inp} /></div>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "var(--text-2)", cursor: "pointer", paddingBottom: 6 }}><input type="checkbox" checked={f.requer_sintoma} onChange={e => set("requer_sintoma", e.target.checked)} style={{ width: 15, height: 15 }} /> Exige sintoma</label>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
              <button onClick={() => setF(vazio)} style={{ background: "transparent", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 12px", fontWeight: 600, cursor: "pointer", fontSize: 12 }}>Limpar</button>
              <button onClick={() => salvar(false)} disabled={busy} style={{ background: "var(--surface-3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 14px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>{busy ? "…" : "Salvar (em validação)"}</button>
              <button onClick={() => salvar(true)} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "7px 14px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Salvar e validar</button>
            </div>
          </div>
        )}

        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead><tr>{["Discriminador", "Nível", "PA (≥)", "Sintoma", "Status", ""].map(h => <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: "var(--text-muted)", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", background: "var(--bg-2)", borderBottom: "1px solid var(--border)" }}>{h}</th>)}</tr></thead>
            <tbody>
              {ordenadas.length === 0 && <tr><td colSpan={6} style={{ padding: 18, textAlign: "center", color: "var(--text-muted)" }}>Nenhuma regra — rode a migração <code>migracao-ps-faixas-obstetricas.sql</code>.</td></tr>}
              {ordenadas.map(s => (
                <tr key={s.chave}>
                  <td style={{ padding: "7px 10px", fontWeight: 700 }}>{s.rotulo}</td>
                  <td style={{ padding: "7px 10px", color: cor(s.nivel), fontWeight: 700 }}>{MANCHESTER[s.nivel]?.label || s.nivel}</td>
                  <td style={{ padding: "7px 10px", color: "var(--text-3)", fontFamily: "JetBrains Mono, monospace" }}>{s.pas_min != null || s.pad_min != null ? `${s.pas_min ?? "—"}/${s.pad_min ?? "—"}` : "—"}</td>
                  <td style={{ padding: "7px 10px", color: "var(--text-3)" }}>{s.requer_sintoma ? "sim" : "—"}</td>
                  <td style={{ padding: "7px 10px" }}>{s.validado ? <span style={{ color: "#34d399", fontWeight: 700 }}>✓ validada</span> : <span style={{ color: "#f59e0b", fontWeight: 700 }}>⏳ em validação</span>}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {isMaster && <>
                      <button onClick={() => editar(s)} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 5, padding: "3px 8px", color: "#22d3ee", cursor: "pointer", fontSize: 11.5, marginRight: 6 }}>Editar</button>
                      <button onClick={() => marcarValidada(s, !s.validado)} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 5, padding: "3px 8px", color: s.validado ? "#f59e0b" : "#34d399", cursor: "pointer", fontSize: 11.5 }}>{s.validado ? "Revogar" : "Validar"}</button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

export default function PSPage({ sb, sbCru, currentUser, canEdit }) {
  const [fila, setFila] = useState([]);
  const [finalizados, setFinalizados] = useState([]);
  const [setores, setSetores] = useState([]);
  const [leitos, setLeitos] = useState([]);
  const [obitosInternacao, setObitosInternacao] = useState(0);
  const [aba, setAba] = useState("operacao");   // operacao | relatorio
  const [sub, setSub] = useState("painel");     // ver PS_NAV
  const [novo, setNovo] = useState({ iniciais: "", prontuario: "", queixa: "", origem: "Meios próprios", origem_detalhe: "" });
  const [triando, setTriando] = useState(null);
  const [reavaliando, setReavaliando] = useState(null);
  const [desfechando, setDesfechando] = useState(null);
  const [atendendo, setAtendendo] = useState(null);
  const [atendendoAba, setAtendendoAba] = useState(null);   // abre o modal já na aba certa
  const [examesPend, setExamesPend] = useState({});
  const [checagemPend, setChecagemPend] = useState({});     // medicação entregue e não checada
  const [busy, setBusy] = useState(false);
  const [busca, setBusca] = useState("");
  const [salas, setSalas] = useState([]);
  const [showSalas, setShowSalas] = useState(false);   // gestão do cadastro de salas
  const [showProtocolos, setShowProtocolos] = useState(false);
  const [faixasPed, setFaixasPed] = useState([]);            // faixas pediátricas (Fase 3)
  const [showFaixasPed, setShowFaixasPed] = useState(false); // editor (só ADM Master)
  const [faixasObst, setFaixasObst] = useState([]);          // critérios obstétricos (Fase 3)
  const [showFaixasObst, setShowFaixasObst] = useState(false);
  const [alocando, setAlocando] = useState(null);      // sala recebendo paciente
  // Convênios e procedimentos: sem eles o desfecho não tem o que gravar, e o
  // episódio do PS nunca chega ao faturamento.
  const [catalogos, setCatalogos] = useState({ convenios: [], procedimentos: [] });
  const buscaRef = useRef(null);
  const [, setTick] = useState(0);
  // Ctrl+K foca a busca rápida (padrão de plantão: achar o paciente sem tirar a mão do teclado)
  useEffect(() => {
    const onKey = e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); buscaRef.current?.focus(); }
      if (e.key === "Escape" && document.activeElement === buscaRef.current) setBusca("");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Faixas peds + critérios obstétricos: carrega uma vez (os motores leem deles).
  useEffect(() => { if (sb) { loadFaixasPediatricas(sb).then(setFaixasPed); loadFaixasObstetricas(sb).then(setFaixasObst); } }, []);
  // Catálogo de convênio e procedimento — o mesmo que a Recepção usa. Carrega
  // uma vez: é cadastro, não muda durante o plantão.
  useEffect(() => { if (sb) carregarCatalogos(sb).then(setCatalogos); }, []);

  function refresh() {
    if (!sb) return;
    loadPsAtendimentos(sb).then(r => {
      setFila(r);
      const ids = r.filter(p => p.status === "em_atendimento").map(p => p.id);
      loadPsExamesPendentes(sb, ids).then(list => {
        const m = {};
        list.forEach(x => { m[x.atendimento_id] = m[x.atendimento_id] || { aguardando: 0, prontos: 0 }; if (x.status === "resultado_disponivel") m[x.atendimento_id].prontos++; else m[x.atendimento_id].aguardando++; });
        setExamesPend(m);
      });
      // Medicação já dispensada pela farmácia e ainda sem checagem à beira do leito
      Promise.all([
        loadPsPrescricaoItensByAtendimentos(sb, ids),
        loadFarmSaidasByAtendimentos(sb, ids),
        loadPsAdministracoesByAtendimentos(sb, ids),
      ]).then(([itens, saidasAll, admsAll]) => {
        const m = {};
        itens.forEach(it => {
          const doItem = saidasAll.filter(s => String(s.prescricao_item_id) === String(it.id) && s.tipo !== "entrada");
          // LÍQUIDO, não bruto: se a dispensação foi estornada o medicamento
          // voltou para a farmácia, e cobrar a checagem de uma dose que não
          // está mais no leito é alarme falso — o tipo que ensina a ignorar.
          if (dispensadoDoItem(it.id, saidasAll) <= 0) return;                           // farmácia ainda não entregou
          if (admsAll.some(a => String(a.prescricao_item_id) === String(it.id))) return; // já checado
          const desde = doItem.map(s => s.created_at).filter(Boolean).sort()[0] || null;
          const e = m[it.atendimento_id] || (m[it.atendimento_id] = { itens: [], desde: null });
          e.itens.push(it);
          if (desde && (!e.desde || desde < e.desde)) e.desde = desde;                   // espera pelo mais antigo
        });
        setChecagemPend(m);
      });
    });
    loadPsFinalizadosHoje(sb).then(setFinalizados);
    loadPsSalas(sb).then(setSalas);
    loadSetoresFromSupabase(sb).then(r => r && setSetores(r));
    loadLeitosFromSupabase(sb).then(r => r && setLeitos(r));
    // óbitos ocorridos APÓS internação, hoje (fonte: leitos_saidas)
    const hoje = todayStr();
    sb(`leitos_saidas?desfecho=eq.obito&data_alta=eq.${hoje}&select=id`).then(r => setObitosInternacao(Array.isArray(r) ? r.length : 0));
  }
  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => { window.removeEventListener("focus", onFocus); clearInterval(id); };
  }, []);

  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 11px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", boxSizing: "border-box" };
  const secLbl = { fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 };

  async function registrarChegada() {
    if (!novo.iniciais.trim()) { alert("Informe as iniciais do paciente."); return; }
    // Prontuário obrigatório: é o que liga o paciente ao histórico (Paciente 360)
    // e sustenta a jornada PS → internação. Sem ele o rastro se perde.
    if (!novo.prontuario.trim()) { alert("Informe o número do prontuário.\n\nEle liga este atendimento ao histórico do paciente e à internação. Sem prontuário, a jornada do paciente fica quebrada."); return; }
    if (!novo.origem) { alert("Informe por onde o paciente chegou."); return; }
    if (psPedeDetalhe(novo.origem) && !novo.origem_detalhe.trim()) { alert("Informe a unidade/origem de procedência."); return; }
    setBusy(true);

    // O prontuário precisa EXISTIR, não só estar preenchido.
    //
    // Desde `migracao-atendimento-recepcao.sql` há chave estrangeira de
    // ps_atendimentos para pacientes. Sem esta conferência, digitar um
    // número que não existe faz o PostgREST recusar o INSERT — e o
    // sb devolve null sem alarde. A recepcionista clicaria em
    // "Registrar chegada", a tela limparia o formulário, e o paciente não
    // entraria na fila da triagem. Ninguém seria chamado.
    //
    // Conferir aqui transforma esse silêncio numa instrução: quem não tem
    // cadastro é cadastrado na Recepção, que é a porta feita para isso.
    const cadastrado = await carregarPaciente(sb, novo.prontuario.trim());
    if (!cadastrado) {
      setBusy(false);
      alert(
        `Não existe paciente cadastrado com o prontuário ${novo.prontuario.trim()}.\n\n` +
        "Abra o menu ATENDIMENTO e registre a chegada por lá: ele procura o paciente, " +
        "emite o prontuário quando é a primeira vez e tem o caminho de emergência para " +
        "quem chega sem identificação.\n\n" +
        "Registrar aqui um número que não existe deixaria este atendimento solto — sem " +
        "aparecer no histórico do paciente.");
      return;
    }

    await addPsAtendimentoRemote(sb, {
      iniciais: novo.iniciais.trim(), prontuario: novo.prontuario.trim(),
      queixa: novo.queixa.trim() || null, origem: novo.origem,
      origem_detalhe: novo.origem_detalhe.trim() || null,
      chegada_em: nowISO(), status: "aguardando_triagem",
    }, currentUser);
    registrarAuditoria(sb, currentUser, "PS: chegada", `${novo.iniciais.trim()} · ${novo.origem}${novo.origem_detalhe ? " — " + novo.origem_detalhe : ""}`, {});
    setNovo({ iniciais: "", prontuario: "", queixa: "", origem: "Meios próprios", origem_detalhe: "" });
    setBusy(false); setTimeout(refresh, 400);
  }
  // Converte o extra da triagem (tipo + campos obst/ped) nos campos do banco.
  // Obstétrica marca gestante; pediátrica leva o peso para a coluna peso (que
  // alimenta a checagem de dose). Os detalhes ficam nos blobs jsonb.
  function triagemExtrasPayload(extras) {
    if (!extras) return {};
    const { tipo, obst, ped } = extras;
    const out = { triagem_tipo: tipo || "adulto" };
    if (tipo === "obstetrica") { out.obstetricia = obst || {}; out.gestante = true; }
    if (tipo === "pediatrica") {
      out.pediatria = ped || {};
      if (ped && ped.peso !== "" && ped.peso != null && !isNaN(Number(ped.peso))) out.peso = Number(ped.peso);
    }
    return out;
  }
  async function triar(p, classificacao, vitais, sugerida, comorbidades, extras) {
    await updatePsAtendimentoRemote(sb, p.id, { classificacao, triagem_em: nowISO(), status: "aguardando_atendimento", ...(vitais || {}), ...(comorbidades ? { comorbidades } : {}), ...triagemExtrasPayload(extras) });
    await addPsSinalRemote(sb, { atendimento_id: p.id, ...(vitais || {}), classificacao_sugerida: sugerida || null, classificacao_escolhida: classificacao, aferido_em: nowISO() }, currentUser);
    registrarAuditoria(sb, currentUser, "PS: triagem", `${p.iniciais} → ${classificacao}`, {});
    setTriando(null); setTimeout(refresh, 300);
  }
  async function reavaliar(p, classificacao, vitais, sugerida, comorbidades, extras) {
    await updatePsAtendimentoRemote(sb, p.id, { classificacao, ...(vitais || {}), ...(comorbidades ? { comorbidades } : {}), ...triagemExtrasPayload(extras) });
    await addPsSinalRemote(sb, { atendimento_id: p.id, ...(vitais || {}), classificacao_sugerida: sugerida || null, classificacao_escolhida: classificacao, aferido_em: nowISO() }, currentUser);
    registrarAuditoria(sb, currentUser, "PS: reavaliação", `${p.iniciais} → ${classificacao}`, {});
    setReavaliando(null); setTimeout(refresh, 300);
  }
  // ── Mapa de salas do PS ──
  async function salvarSala(s) {
    await upsertPsSalaRemote(sb, s, currentUser);
    registrarAuditoria(sb, currentUser, s.id ? "PS: editar sala" : "PS: cadastrar sala", s.identificacao, {});
    setTimeout(refresh, 300);
  }
  async function excluirSala(s) {
    if (!confirm(`Excluir a sala "${s.identificacao}"?`)) return;
    await deletePsSalaRemote(sb, s.id);
    registrarAuditoria(sb, currentUser, "PS: excluir sala", s.identificacao, {});
    setTimeout(refresh, 300);
  }
  async function ocuparSala(sala, paciente) {
    await upsertPsSalaRemote(sb, { id: sala.id, status: "ocupado", atendimento_id: paciente.id, ocupado_em: nowISO() }, currentUser);
    registrarAuditoria(sb, currentUser, "PS: alocar sala", `${sala.identificacao} · ${paciente.iniciais}`, {});
    setAlocando(null); setTimeout(refresh, 300);
  }
  // Liberar manda para limpeza (fluxo real: sala usada precisa ser higienizada)
  async function mudarStatusSala(sala, status) {
    await upsertPsSalaRemote(sb, { id: sala.id, status, atendimento_id: status === "ocupado" ? sala.atendimento_id : null, ocupado_em: status === "ocupado" ? sala.ocupado_em : null }, currentUser);
    registrarAuditoria(sb, currentUser, "PS: sala " + status, sala.identificacao, {});
    setTimeout(refresh, 300);
  }
  async function iniciarAtendimento(p) {
    await updatePsAtendimentoRemote(sb, p.id, { atendimento_em: nowISO(), status: "em_atendimento" });
    registrarAuditoria(sb, currentUser, "PS: inicio atendimento", p.iniciais, {});
    setTimeout(refresh, 300);
  }
  async function darDesfecho(p, d) {
    const { desfecho, setorDestino, observacao, medico, leito, convenioId, procedimentoCod, cid } = d;
    // Convênio e procedimento vão JUNTO com o desfecho porque é aqui que o
    // episódio vira faturável — e o procedimento só se sabe no fim. Sem eles,
    // `carregarProducaoFaturavel` (que filtra procedimento_cod=not.is.null)
    // nunca enxerga este atendimento.
    await updatePsAtendimentoRemote(sb, p.id, {
      desfecho, desfecho_em: nowISO(), setor_destino: setorDestino || null,
      observacao: observacao || null, medico: medico || null, status: "finalizado",
      ...dadosDeConta({ convenioId, procedimentoCod, cid }),
    });
    if (desfecho === "internacao") {
      if (leito) {
        // Reserva automática: o leito fica RESERVADO para o paciente até ele subir.
        // No Mapa de leitos, "✓ Chegou" completa a internação (CID/dias) e fecha o
        // ciclo Pronto → Entrada com o tempo real. (disp_em/pronto_em preservados.)
        await upsertLeitoRemote(sb, {
          identificacao: leito.identificacao, status: "reservado",
          iniciais: p.iniciais, prontuario: p.prontuario || null, motivo: p.queixa || null,
          cid: null, dias_previstos: null, data_internacao: null, entrada_em: null,
          solic_em: nowISO(), interdicao_motivo: null,
          ps_atendimento_id: p.id,          // elo forte: não depende do prontuário como texto
        }, currentUser);
        registrarAuditoria(sb, currentUser, "PS: reservar leito", `${p.iniciais} → ${leito.identificacao}`, {});
      } else {
        // Sem leito agora → fila de espera (NIR puxa dali). Sempre entra na
        // fila, mesmo sem setor definido, para nenhuma internação sem leito
        // ficar fora do aviso do NIR.
        await addSolicitacaoRemote(sb, { iniciais: p.iniciais, setor_origem: "Pronto-Socorro", setor_destino: setorDestino || null, hora_pedido: nowISO(), status: "aguardando", ps_atendimento_id: p.id }, currentUser);
      }
    }
    registrarAuditoria(sb, currentUser, "PS: desfecho", `${p.iniciais} → ${desfecho}${medico ? " · Dr(a). " + medico : ""}${leito ? " · leito " + leito.identificacao : setorDestino ? " (" + setorDestino + ")" : ""}`, {});
    setDesfechando(null); setTimeout(refresh, 300);
  }

  const agora = nowISO();
  // Busca rápida (Ctrl+K) — filtra as três filas por iniciais/prontuário/queixa
  const bq = normTxt(busca);
  const casa = p => !bq || [p.iniciais, p.prontuario, p.queixa].some(x => normTxt(x).includes(bq));
  const aguardandoTriagem = fila.filter(p => p.status === "aguardando_triagem").filter(casa);
  const aguardandoAtend = fila.filter(p => p.status === "aguardando_atendimento").filter(casa)
    .sort((a, b) => (PS_PRIORIDADE[a.classificacao] ?? 9) - (PS_PRIORIDADE[b.classificacao] ?? 9) || new Date(a.triagem_em) - new Date(b.triagem_em));
  const emAtendimento = fila.filter(p => p.status === "em_atendimento").filter(casa);
  // Espera atual de um paciente triado e se estourou o tempo-alvo da cor
  const esperaMin = p => diffMin(p.triagem_em || p.chegada_em, p.atendimento_em || agora);
  const estourouAlvo = p => {
    const alvo = p.classificacao ? MANCHESTER[p.classificacao]?.alvoMin : null;
    if (alvo == null) return false;
    const m = esperaMin(p);
    return alvo === 0 ? p.status === "aguardando_atendimento" : (m != null && m > alvo);
  };
  // Aguardando atendimento por cor Manchester (5 níveis) + quantos fora do alvo
  const porCor = Object.keys(MANCHESTER).map(k => {
    const lista = fila.filter(p => p.status === "aguardando_atendimento" && p.classificacao === k);
    return { k, ...MANCHESTER[k], n: lista.length, fora: lista.filter(estourouAlvo).length };
  });
  const foraDoAlvoTotal = porCor.reduce((s, c) => s + c.fora, 0);
  const portaTriagem = fila.concat(finalizados).map(p => diffMin(p.chegada_em, p.triagem_em)).filter(v => v != null);
  const portaTriagemMedia = portaTriagem.length ? portaTriagem.reduce((a, b) => a + b, 0) / portaTriagem.length : null;
  const permanencias = finalizados.map(p => diffMin(p.chegada_em, p.desfecho_em)).filter(v => v != null);
  const permMedia = permanencias.length ? permanencias.reduce((a, b) => a + b, 0) / permanencias.length : null;

  const ClasseBadge = ({ c }) => { const v = MANCHESTER[c]; if (!v) return <span style={{ fontSize: 11, color: "var(--text-muted)" }}>sem triagem</span>;
    return <span style={{ background: v.bg, color: v.cor, border: `1px solid ${v.cor}55`, borderRadius: 99, padding: "2px 10px", fontSize: 11, fontWeight: 800 }}>{v.label}</span>; };
  // Cronômetro contra o tempo-alvo da classificação
  const Espera = ({ p }) => {
    const min = diffMin(p.triagem_em || p.chegada_em, agora);
    const alvo = p.classificacao ? MANCHESTER[p.classificacao]?.alvoMin : null;
    const estourou = alvo != null && min != null && min > alvo && alvo > 0;
    const imediato = p.classificacao === "vermelho";
    return <span style={{ fontSize: 12, fontWeight: 700, color: estourou || imediato ? "#f43f5e" : "var(--text-3)", fontFamily: "JetBrains Mono, monospace" }}>
      {fmtDur(min)}{alvo != null ? ` / alvo ${alvo === 0 ? "imediato" : fmtDur(alvo)}` : ""}{estourou ? " · ESTOURADO" : ""}
    </span>;
  };
  const Card = ({ label, valor, cor }) => (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", minWidth: 130, flex: 1 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: cor || "var(--text)", fontFamily: "JetBrains Mono, monospace", marginTop: 4 }}>{valor}</div>
    </div>
  );
  const linhaPac = { display: "flex", alignItems: "center", gap: 10, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 13px", flexWrap: "wrap" };

  // Relatório mensal (somente leitura) — tela própria, não interfere na operação.
  if (aba === "relatorio") return (
    <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Pronto-Socorro — Relatório mensal</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: "1.25rem" }}>Indicadores agregados do período. Somente leitura — nada é alterado no atendimento.</div>
      <button onClick={() => setAba("operacao")} style={{ background: "transparent", color: "var(--text-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "7px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer", marginBottom: "1.25rem" }}>← Voltar à operação</button>
      <PsRelatorioView sb={sb} />
    </div>
  );

  const navAtual = [...PS_NAV, ...PS_NAV_EMERG].find(n => n.key === sub) || PS_NAV[0];
  const subTexto = {
    e_painel: "Panorama da emergência — ocupação das vagas do PS e fluxo do plantão.",
    e_atendimento: "Pacientes em atendimento agora, com sala e tempo.",
    e_checagem: "Medicação que a farmácia já entregou e ainda não foi checada à beira do leito.",
    e_leitos: "Mapa detalhado das vagas do PS por área, com a regra de censo.",
    e_transferencias: "Transferências externas — Vaga Zero, GERINT e contato direto.",
    e_aguardando: "Pacientes com internação decidida, aguardando leito no hospital.",
    e_ia: "Assistente local do Pronto-Socorro (nada é enviado para fora).",
    painel: "Visão do plantão — risco, fila, salas e encaminhamentos.",
    classificar: "Registrar a chegada e classificar o risco pelo Manchester adaptado.",
    fila: "Pacientes já classificados, na ordem de prioridade e contra o tempo-alvo.",
    reavaliacao: "Quem está esperando há mais tempo e precisa ser reavaliado.",
    protocolo: "Referência do protocolo adaptado do HNSN — níveis, sinais e discriminadores.",
    indicadores: "Indicadores da triagem do dia.",
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* BARRA LATERAL DO PRONTO-SOCORRO — bloco Triagem */}
      <nav style={{ width: 194, minWidth: 194, background: "var(--bg-2)", borderRight: "1px solid var(--border)", padding: "1rem 0", overflowY: "auto", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px 12px" }}>
          <Icon name="activity" size={16} /><span style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".02em", color: VX.turquesa }}>TRIAGEM</span>
        </div>
        {PS_NAV.map(it => { const active = sub === it.key; return (
          <button key={it.key} onClick={() => setSub(it.key)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: ".55rem 16px", border: "none", borderLeft: `3px solid ${active ? VX.turquesa : "transparent"}`, background: active ? "var(--surface)" : "transparent", color: active ? VX.turquesa : "var(--text-3)", cursor: "pointer", textAlign: "left", fontSize: 12.5, fontWeight: active ? 700 : 500, fontFamily: "Inter, sans-serif" }}>
            <Icon name={it.icon} size={16} />{it.label}
          </button>
        ); })}

        <div style={{ height: 1, background: "var(--surface-3)", margin: ".7rem 12px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px 10px" }}>
          <Icon name="bed" size={16} /><span style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".02em", color: VX.azul }}>EMERGÊNCIA (PS)</span>
        </div>
        {PS_NAV_EMERG.map(it => { const active = sub === it.key; return (
          <button key={it.key} onClick={() => setSub(it.key)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: ".55rem 16px", border: "none", borderLeft: `3px solid ${active ? VX.azul : "transparent"}`, background: active ? "var(--surface)" : "transparent", color: active ? VX.azul : "var(--text-3)", cursor: "pointer", textAlign: "left", fontSize: 12.5, fontWeight: active ? 700 : 500, fontFamily: "Inter, sans-serif" }}>
            <Icon name={it.icon} size={16} />{it.label}
          </button>
        ); })}

        <div style={{ height: 1, background: "var(--surface-3)", margin: ".7rem 12px" }} />
        <div style={{ padding: "0 16px" }}>
          <button onClick={() => setAba("relatorio")} style={{ width: "100%", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px", color: "var(--text-3)", cursor: "pointer", fontSize: 11.5, fontWeight: 600 }}>Relatório mensal</button>
        </div>
      </nav>

      {/* CONTEÚDO */}
      <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem 1.5rem", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{navAtual.label}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: "1.25rem" }}>{subTexto[sub]} Dados de saúde — use iniciais e prontuário (LGPD).</div>
        </div>
      </div>

      {/* 🔴 Fila que não foi lida parece PS vazio. "0 aguardando" é a frase
          que faz o plantão relaxar — e ela não pode ser um erro de rede. */}
      <AvisoLeitura oQue="a fila do Pronto-Socorro e as salas" listas={[fila, salas]} />
      <PsRetiradaBanner sb={sb} currentUser={currentUser} canEdit={canEdit} />
      <PsIntervencaoBanner sb={sb} currentUser={currentUser} canEdit={canEdit} />

      {/* BUSCA RÁPIDA — nas telas de lista (no painel ela só ocupava espaço) */}
      {["classificar", "fila", "reavaliacao", "e_atendimento", "e_aguardando"].includes(sub) && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 320px", maxWidth: 420 }}>
            <input ref={buscaRef} value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar paciente por iniciais, prontuário ou queixa…"
              style={{ ...inp, width: "100%", paddingRight: 62 }} />
            <span style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 6px", fontFamily: "JetBrains Mono, monospace", pointerEvents: "none" }}>Ctrl+K</span>
          </div>
          {busca && <button onClick={() => setBusca("")} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 12px", color: "var(--text-3)", cursor: "pointer", fontSize: 12 }}>Limpar</button>}
          {busca && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{aguardandoTriagem.length + aguardandoAtend.length + emAtendimento.length} paciente(s) no filtro</span>}
        </div>
      )}

      {sub === "painel" && (<>
      {/* KPIs por cor Manchester — os 6 numa linha só, compactos */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 8, marginBottom: 10 }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `3px solid ${aguardandoTriagem.length ? "#fbbf24" : "#34d399"}`, borderRadius: 9, padding: "9px 10px", minWidth: 0 }}>
          <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".04em", fontWeight: 700, lineHeight: 1.25, minHeight: 22 }}>Aguardando classificação</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: aguardandoTriagem.length ? "#fbbf24" : "var(--text)", fontFamily: "JetBrains Mono, monospace", marginTop: 2, lineHeight: 1.1 }}>{String(aguardandoTriagem.length).padStart(2, "0")}</div>
          <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>sem triagem</div>
        </div>
        {porCor.map(c => (
          <div key={c.k} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `3px solid ${c.cor}`, borderRadius: 9, padding: "9px 10px", minWidth: 0 }}>
            <div style={{ fontSize: 9, color: c.cor, textTransform: "uppercase", letterSpacing: ".04em", fontWeight: 800, lineHeight: 1.25, minHeight: 22 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: c.n ? c.cor : "var(--text)", fontFamily: "JetBrains Mono, monospace", marginTop: 2, lineHeight: 1.1 }}>{String(c.n).padStart(2, "0")}</div>
            <div title={c.fora ? `${c.fora} fora do tempo-alvo` : `${c.atend} · alvo ${c.alvoMin} min`}
              style={{ fontSize: 9, marginTop: 1, color: c.fora ? "#f43f5e" : "var(--text-muted)", fontWeight: c.fora ? 800 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {c.fora ? `⚠ ${c.fora} fora do alvo` : `${c.atend} · ${c.alvoMin === 0 ? "0min" : fmtDur(c.alvoMin)}`}
            </div>
          </div>
        ))}
      </div>

      {/* Faixa de segurança */}
      <div style={{ background: foraDoAlvoTotal ? "#f43f5e12" : "var(--surface)", border: `1px solid ${foraDoAlvoTotal ? "#f43f5e55" : "var(--border)"}`, borderRadius: 10, padding: "11px 16px", marginBottom: 12, fontSize: 13.5, color: "var(--text)" }}>
        {foraDoAlvoTotal === 0
          ? "✓ Nenhum paciente fora do tempo-alvo do Manchester."
          : <><strong style={{ color: "#f43f5e" }}>{foraDoAlvoTotal} paciente(s) fora do tempo-alvo</strong> — {porCor.filter(c => c.fora).map(c => `${c.fora} ${c.label.toLowerCase()}`).join(" · ")}. Priorize na fila abaixo.</>}
      </div>

      {/* 2 colunas: classificar · distribuição (a fila fica na aba Fila de Espera) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginBottom: 16, alignItems: "stretch" }}>

        {/* Classificar novo paciente (chegada) */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "13px 15px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Classificar Novo Paciente</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>Registre a chegada — depois classifique pelo Manchester. Dados mínimos (LGPD).</div>
          {canEdit ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <div>
                <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Iniciais do paciente *</label>
                <input value={novo.iniciais} onChange={e => setNovo(p => ({ ...p, iniciais: e.target.value }))} placeholder="Ex.: M.A.S." style={{ ...inp, width: "100%" }} />
              </div>
              <div>
                <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Prontuário *</label>
                <input value={novo.prontuario} onChange={e => setNovo(p => ({ ...p, prontuario: e.target.value }))} placeholder="Nº do prontuário (obrigatório)" style={{ ...inp, width: "100%" }} />
              </div>
              <div>
                <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Queixa principal</label>
                <input value={novo.queixa} onChange={e => setNovo(p => ({ ...p, queixa: e.target.value }))} onKeyDown={e => e.key === "Enter" && registrarChegada()} placeholder="Ex.: dor torácica" style={{ ...inp, width: "100%" }} />
              </div>
                <div>
                  <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Chegou por *</label>
                  <select value={novo.origem} onChange={e => setNovo(p => ({ ...p, origem: e.target.value, origem_detalhe: "" }))} style={{ ...inp, width: "100%" }}>
                    {PS_ORIGENS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                {psPedeDetalhe(novo.origem) && (
                  <div>
                    <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Unidade de origem *</label>
                    {novo.origem === "GERINT (aceite)" ? (
                      <select value={novo.origem_detalhe} onChange={e => setNovo(p => ({ ...p, origem_detalhe: e.target.value }))} style={{ ...inp, width: "100%" }}>
                        <option value="">Escolha a unidade…</option>
                        {PS_ORIGEM_UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    ) : (
                      <input value={novo.origem_detalhe} onChange={e => setNovo(p => ({ ...p, origem_detalhe: e.target.value }))} placeholder="Descreva a procedência" style={{ ...inp, width: "100%" }} />
                    )}
                  </div>
                )}
              <button onClick={registrarChegada} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13, marginTop: 2 }}>{busy ? "…" : "Registrar chegada →"}</button>
            </div>
          ) : <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Seu perfil é somente leitura.</div>}
        </div>

        {/* Distribuição Manchester do dia */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "13px 15px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Protocolo de Manchester</div>
          {(() => {
            const doDia = fila.concat(finalizados).filter(p => p.classificacao);
            if (!doDia.length) return <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "1rem", border: "1px dashed var(--border)", borderRadius: 8 }}>Nenhuma classificação hoje ainda.</div>;
            // Rosca (donut) da distribuição — cada fatia é um arco do círculo
            const fatias = Object.keys(MANCHESTER).map(k => {
              const n = doDia.filter(p => p.classificacao === k).length;
              return { k, n, pct: (n / doDia.length) * 100, ...MANCHESTER[k] };
            });
            const R = 46, STROKE = 16, C = 2 * Math.PI * R;
            let offset = 0;
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 16, height: "100%", minHeight: 150 }}>
                {/* DONUT */}
                <div style={{ position: "relative", width: 124, height: 124, flexShrink: 0 }}>
                  <svg viewBox="0 0 124 124" width="124" height="124" style={{ transform: "rotate(-90deg)" }}>
                    <circle cx="62" cy="62" r={R} fill="none" stroke="var(--surface-3)" strokeWidth={STROKE} />
                    {fatias.filter(f => f.n > 0).map(f => {
                      const len = (f.pct / 100) * C;
                      const el = <circle key={f.k} cx="62" cy="62" r={R} fill="none" stroke={f.cor} strokeWidth={STROKE}
                        strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} />;
                      offset += len;
                      return el;
                    })}
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text)", fontFamily: "JetBrains Mono, monospace", lineHeight: 1 }}>{doDia.length}</div>
                    <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>hoje</div>
                  </div>
                </div>
                {/* LEGENDA */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
                  {fatias.map(f => (
                    <div key={f.k} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 99, background: f.cor, flexShrink: 0, opacity: f.n ? 1 : 0.3 }} />
                      <span style={{ color: f.n ? "var(--text-2)" : "var(--text-muted)", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.label}</span>
                      <strong style={{ fontFamily: "JetBrains Mono, monospace", color: f.n ? f.cor : "var(--text-muted)" }}>{f.n}</strong>
                      <span style={{ color: "var(--text-muted)", minWidth: 34, textAlign: "right" }}>{f.pct.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* FAIXA DIVISÓRIA */}
      <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 14px", marginBottom: 16, fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: VX.azul, fontWeight: 800 }}>i</span>
        Triagem e Pronto-Socorro são fluxos separados para garantir segurança e agilidade no atendimento.
      </div>

      {/* ══════════════ SEÇÃO 2 — PRONTO-SOCORRO ══════════════ */}
      <div style={{ borderTop: `3px solid ${VX.azul}`, background: "var(--surface)", borderRadius: "10px 10px 0 0", padding: "12px 16px 10px", marginBottom: 12 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text)" }}>Pronto-Socorro</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Atendimento e Tratamento</div>
      </div>

      {/* KPIs do PS — 6 compactos numa linha só */}
      {(() => {
        const salasAtivas = salas.filter(s => s.ativo !== false);
        const ocup = salasAtivas.filter(s => s.status === "ocupado").length;
        const tot = salasAtivas.length;
        const pct = tot ? Math.round((ocup / tot) * 100) : 0;
        const obitoPS = finalizados.filter(p => p.desfecho === "obito").length;
        const obitosTot = obitoPS + obitosInternacao;
        // Card compacto: rótulo pequeno, número grande, subtexto de apoio
        const Mini = ({ label, valor, cor, sub }) => (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `3px solid ${cor}`, borderRadius: 9, padding: "9px 11px", minWidth: 0 }}>
            <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".04em", fontWeight: 700, lineHeight: 1.25, minHeight: 22 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: cor, fontFamily: "JetBrains Mono, monospace", marginTop: 2, lineHeight: 1.1 }}>{valor}</div>
            <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
          </div>
        );
        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 8, marginBottom: 12 }}>
            <Mini label="Em atendimento" valor={emAtendimento.length} cor="#22d3ee" sub="pacientes agora" />
            <Mini label="Aguardando atendimento" valor={aguardandoAtend.length} cor="#3b82f6" sub="na fila" />
            <Mini label="Leitos ocupados" valor={tot ? `${ocup}/${tot}` : "—"} cor={ocup ? "#f43f5e" : "#34d399"} sub={tot ? `${pct}% de ocupação` : "sem leitos"} />
            <Mini label="Óbitos" valor={obitosTot} cor={obitosTot ? "#f43f5e" : "#34d399"} sub={obitosTot ? `${obitoPS} no PS · ${obitosInternacao} pós-intern.` : "nenhum hoje"} />
            <Mini label="Tempo médio de permanência" valor={permMedia != null ? fmtDur(Math.round(permMedia)) : "—"} cor="#6366f1" sub="chegada → desfecho" />
            <Mini label="Atendidos hoje" valor={finalizados.length} cor="#0d9488" sub="finalizados" />
          </div>
        );
      })()}

      {/* Em atendimento + Mapa de salas lado a lado (mesma altura); encaminhamentos abaixo */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginBottom: 12, alignItems: "stretch" }}>

        {/* Pacientes em atendimento */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "13px 15px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Pacientes em Atendimento ({emAtendimento.length})</div>
          {emAtendimento.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "1rem", border: "1px dashed var(--border)", borderRadius: 8 }}>Nenhum paciente em atendimento.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 420, overflowY: "auto" }}>
              {emAtendimento.map(p => {
                const sala = salas.find(s => s.atendimento_id === p.id);
                return (
                  <div key={p.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: `4px solid ${MANCHESTER[p.classificacao]?.cor || "var(--border)"}`, borderRadius: 8, padding: "8px 11px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <strong style={{ fontSize: 13 }}>{p.iniciais}</strong>
                      <ClasseBadge c={p.classificacao} />
                      {sala && <span style={{ fontSize: 10.5, fontWeight: 700, color: VX.azul, border: `1px solid ${VX.azul}55`, borderRadius: 99, padding: "0 7px" }}>Sala {sala.identificacao}</span>}
                      <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-3)", fontFamily: "JetBrains Mono, monospace" }}>{fmtDur(diffMin(p.atendimento_em, agora))}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11.5, color: "var(--text-3)", flex: 1, minWidth: 80 }}>{p.queixa || "—"}</span>
                      {canEdit && <button onClick={() => setAtendendo(p)} style={btnContorno("#3b82f6")}>Abrir</button>}
                      {canEdit && <button onClick={() => setDesfechando(p)} style={btnContorno("#22d3ee")}>Desfecho</button>}
                    </div>
                    {(examesPend[p.id]?.aguardando > 0 || examesPend[p.id]?.prontos > 0) && (
                      <div style={{ display: "flex", gap: 8, fontSize: 10.5, fontWeight: 700, marginTop: 3 }}>
                        {examesPend[p.id]?.aguardando > 0 && <span style={{ color: "#d97706" }}>{examesPend[p.id].aguardando} exame(s) aguardando</span>}
                        {examesPend[p.id]?.prontos > 0 && <span style={{ color: "#3b82f6" }}>{examesPend[p.id].prontos} resultado(s) pronto(s)</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Mapa de salas */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "13px 15px" }}>
          {(() => {
            const ativas = salas.filter(s => s.ativo !== false);
            const pacById = {}; fila.forEach(p => pacById[p.id] = p);
            const areas = [...new Set(ativas.map(s => s.area || "Outros"))]
              .sort((a, b) => { const ia = PS_AREAS.indexOf(a), ib = PS_AREAS.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, "pt-BR"); });
            const cont = k => ativas.filter(s => (s.status || "disponivel") === k).length;
            return (<>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Mapa de Salas</div>
                {canEdit && <button onClick={() => setShowSalas(true)} style={{ marginLeft: "auto", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 10px", color: "var(--text-3)", cursor: "pointer", fontSize: 11 }}>Gerenciar</button>}
              </div>
              {ativas.length === 0 ? (
                <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "1rem", border: "1px dashed var(--border)", borderRadius: 8 }}>
                  Nenhuma sala cadastrada. {canEdit ? "Clique em “Gerenciar” (ex.: Emergência 01–06, Observação 07–12, Sala Vermelha 13–16)." : ""}
                </div>
              ) : (<>
                <div style={{ maxHeight: 380, overflowY: "auto" }}>
                  {areas.map(area => (
                    <div key={area} style={{ marginBottom: 9 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 4 }}>{area}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {ativas.filter(s => (s.area || "Outros") === area).map(s => {
                          const st = PS_SALA_STATUS[s.status] || PS_SALA_STATUS.disponivel;
                          const pac = s.atendimento_id ? pacById[s.atendimento_id] : null;
                          const desde = s.ocupado_em ? diffMin(s.ocupado_em, agora) : null;
                          return (
                            <div key={s.id} title={pac ? `${pac.iniciais}${desde != null ? ` · ${fmtDur(desde)}` : ""}` : st.label}
                              style={{ background: st.cor + "1e", border: `1px solid ${st.cor}66`, borderTop: `3px solid ${st.cor}`, borderRadius: 7, padding: "6px 9px", minWidth: 76 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 800, color: st.cor, fontFamily: "JetBrains Mono, monospace" }}>{s.identificacao}</div>
                              <div style={{ fontSize: 9.5, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 92 }}>{pac ? pac.iniciais : st.label}</div>
                              {canEdit && (
                                <div style={{ display: "flex", gap: 3, marginTop: 4, flexWrap: "wrap" }}>
                                  {s.status === "disponivel" && <button onClick={() => setAlocando(s)} style={{ ...btnContorno("#22d3ee"), padding: "0 6px", fontSize: 9.5 }}>Alocar</button>}
                                  {s.status === "ocupado" && <button onClick={() => mudarStatusSala(s, "limpeza")} style={{ ...btnContorno("#d97706"), padding: "0 6px", fontSize: 9.5 }}>Liberar</button>}
                                  {s.status === "limpeza" && <button onClick={() => mudarStatusSala(s, "disponivel")} style={{ ...btnContorno("#34d399"), padding: "0 6px", fontSize: 9.5 }}>Pronta</button>}
                                  {s.status === "manutencao" && <button onClick={() => mudarStatusSala(s, "disponivel")} style={{ ...btnContorno("#34d399"), padding: "0 6px", fontSize: 9.5 }}>Liberar</button>}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                  {Object.entries(PS_SALA_STATUS).map(([k, v]) => (
                    <span key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "var(--text-muted)" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: v.cor }} />{v.label} ({cont(k)})
                    </span>
                  ))}
                </div>
              </>)}
            </>);
          })()}
        </div>
      </div>

      {/* Encaminhamentos de hoje — largura total, abaixo dos dois */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "13px 15px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Encaminhamentos de hoje</div>
          {(() => {
            const internados = finalizados.filter(p => p.desfecho === "internacao");
            const porSetor = {}; internados.forEach(p => { const k = p.setor_destino || "Sem setor"; porSetor[k] = (porSetor[k] || 0) + 1; });
            const linhas = [
              ...Object.entries(porSetor).map(([k, n]) => ({ label: k, n, cor: "#3b82f6" })),
              { label: "Transferência externa", n: finalizados.filter(p => p.desfecho === "transferencia").length, cor: "#6366f1" },
              { label: "Alta", n: finalizados.filter(p => p.desfecho === "alta").length, cor: "#34d399" },
              { label: "Evasão", n: finalizados.filter(p => p.desfecho === "evasao").length, cor: "#d97706" },
              { label: "Óbito no PS", n: finalizados.filter(p => p.desfecho === "obito").length, cor: "#f43f5e" },
            ].filter(x => x.n > 0);
            if (!linhas.length) return <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "1rem", border: "1px dashed var(--border)", borderRadius: 8 }}>Nenhum desfecho registrado hoje.</div>;
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {linhas.map((x, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 11px" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: x.cor, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-2)" }}>{x.label}</span>
                    <strong style={{ fontFamily: "JetBrains Mono, monospace", color: x.cor }}>{x.n}</strong>
                    <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>paciente(s)</span>
                  </div>
                ))}
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>Internações vão para a fila/leito do setor de destino. Óbito inclui os ocorridos após internação hoje.</div>
              </div>
            );
          })()}

          {/* Evasões por médico — indicador de responsabilização */}
          {(() => {
            const evasoes = finalizados.filter(p => p.desfecho === "evasao");
            if (!evasoes.length) return null;
            const porMedico = {};
            evasoes.forEach(p => { const m = p.medico || "Sem médico registrado"; porMedico[m] = (porMedico[m] || 0) + 1; });
            const ord = Object.entries(porMedico).sort((a, b) => b[1] - a[1]);
            return (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-3)", marginBottom: 6 }}>Evasões por médico (hoje)</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {ord.map(([m, n]) => (
                    <div key={m} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <span style={{ flex: 1, color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m}</span>
                      <strong style={{ fontFamily: "JetBrains Mono, monospace", color: "#d97706" }}>{n}</strong>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      </>)}

      {/* CLASSIFICAR PACIENTE */}
      {sub === "classificar" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, alignItems: "start", marginBottom: 16 }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Registrar chegada</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>Dados mínimos (LGPD): iniciais e prontuário identificam sem expor o nome.</div>
            {canEdit ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <div><label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Iniciais *</label><input value={novo.iniciais} onChange={e => setNovo(p => ({ ...p, iniciais: e.target.value }))} placeholder="Ex.: M.A.S." style={{ ...inp, width: "100%" }} /></div>
                <div><label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Prontuário *</label><input value={novo.prontuario} onChange={e => setNovo(p => ({ ...p, prontuario: e.target.value }))} placeholder="Nº" style={{ ...inp, width: "100%" }} /></div>
                <div><label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Queixa principal</label><input value={novo.queixa} onChange={e => setNovo(p => ({ ...p, queixa: e.target.value }))} onKeyDown={e => e.key === "Enter" && registrarChegada()} placeholder="Ex.: dor torácica" style={{ ...inp, width: "100%" }} /></div>
                <div>
                  <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Chegou por *</label>
                  <select value={novo.origem} onChange={e => setNovo(p => ({ ...p, origem: e.target.value, origem_detalhe: "" }))} style={{ ...inp, width: "100%" }}>
                    {PS_ORIGENS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                {psPedeDetalhe(novo.origem) && (
                  <div>
                    <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Unidade de origem *</label>
                    {novo.origem === "GERINT (aceite)" ? (
                      <select value={novo.origem_detalhe} onChange={e => setNovo(p => ({ ...p, origem_detalhe: e.target.value }))} style={{ ...inp, width: "100%" }}>
                        <option value="">Escolha a unidade…</option>
                        {PS_ORIGEM_UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    ) : (
                      <input value={novo.origem_detalhe} onChange={e => setNovo(p => ({ ...p, origem_detalhe: e.target.value }))} placeholder="Descreva a procedência" style={{ ...inp, width: "100%" }} />
                    )}
                  </div>
                )}
                <button onClick={registrarChegada} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Registrar chegada →"}</button>
              </div>
            ) : <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Seu perfil é somente leitura.</div>}
          </div>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Aguardando classificação ({aguardandoTriagem.length})</div>
            {aguardandoTriagem.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "1rem", border: "1px dashed var(--border)", borderRadius: 8 }}>Ninguém aguardando triagem.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {aguardandoTriagem.map(p => (
                  <div key={p.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: "4px solid #fbbf24", borderRadius: 8, padding: "9px 12px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 13 }}>{p.iniciais}</strong>
                    {p.prontuario && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>reg. {p.prontuario}</span>}
                    {p.origem && p.origem !== "Meios próprios" && <span title={p.origem_detalhe ? p.origem + " — " + p.origem_detalhe : p.origem} style={{ fontSize: 9, fontWeight: 800, color: VX.azul, border: "1px solid " + VX.azul + "55", borderRadius: 99, padding: "0 6px" }}>{p.origem.replace(" (aceite)", "")}</span>}
                    <span style={{ fontSize: 11.5, color: "var(--text-3)", flex: 1, minWidth: 80 }}>{p.queixa || "—"}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: "#fbbf24", fontFamily: "JetBrains Mono, monospace" }}>{fmtDur(diffMin(p.chegada_em, agora))}</span>
                    {canEdit && <button onClick={() => setTriando(p)} style={btnContorno("#22d3ee")}>Classificar</button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FILA DE ESPERA */}
      {sub === "fila" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ background: foraDoAlvoTotal ? "#f43f5e12" : "var(--surface)", border: `1px solid ${foraDoAlvoTotal ? "#f43f5e55" : "var(--border)"}`, borderRadius: 10, padding: "11px 16px", marginBottom: 12, fontSize: 13.5 }}>
            {foraDoAlvoTotal === 0 ? "✓ Nenhum paciente fora do tempo-alvo." : <><strong style={{ color: "#f43f5e" }}>{foraDoAlvoTotal} fora do tempo-alvo</strong> — priorize os destacados.</>}
          </div>
          {aguardandoAtend.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Fila vazia.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {aguardandoAtend.map((p, i) => {
                const m = MANCHESTER[p.classificacao];
                const est = estourouAlvo(p);
                return (
                  <div key={p.id} style={{ ...linhaPac, borderLeft: `4px solid ${m?.cor || "var(--border)"}`, background: est ? "#f43f5e0e" : "var(--surface-2)" }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace", minWidth: 22 }}>{String(i + 1).padStart(2, "0")}</span>
                    <strong style={{ minWidth: 64 }}>{p.iniciais}</strong>
                    {p.prontuario && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>reg. {p.prontuario}</span>}
                    <ClasseBadge c={p.classificacao} />
                    {p.queixa && <span style={{ fontSize: 12, color: "var(--text-3)" }}>{p.queixa}</span>}
                    <span style={{ marginLeft: "auto" }}><Espera p={p} /></span>
                    {canEdit && <button onClick={() => setReavaliando(p)} style={btnContorno(est ? "#f97316" : "var(--text-3)")}>Reavaliar</button>}
                    {canEdit && <button onClick={() => iniciarAtendimento(p)} style={btnContorno("#34d399")}>Iniciar atendimento</button>}
                    {fmtSinaisVitais(p) && <div style={{ width: "100%", fontSize: 11, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{fmtSinaisVitais(p)}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* REAVALIAÇÃO */}
      {sub === "reavaliacao" && (() => {
        const candidatos = [...aguardandoAtend].sort((a, b) => (estourouAlvo(b) - estourouAlvo(a)) || (esperaMin(b) - esperaMin(a)));
        return (
          <div style={{ marginBottom: 16 }}>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "11px 16px", marginBottom: 12, fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>
              A reavaliação é obrigatória sempre que o paciente <strong>ultrapassa o tempo-alvo</strong> ou relata piora. Ela gera uma nova aferição no histórico (append-only) e pode <strong>mudar a classificação</strong>.
            </div>
            {candidatos.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Ninguém aguardando atendimento — nada a reavaliar.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {candidatos.map(p => {
                  const est = estourouAlvo(p);
                  return (
                    <div key={p.id} style={{ ...linhaPac, borderLeft: `4px solid ${est ? "#f43f5e" : MANCHESTER[p.classificacao]?.cor || "var(--border)"}`, background: est ? "#f43f5e0e" : "var(--surface-2)" }}>
                      <strong style={{ minWidth: 64 }}>{p.iniciais}</strong>
                      <ClasseBadge c={p.classificacao} />
                      {est && <span style={{ fontSize: 9.5, fontWeight: 800, color: "#f43f5e", border: "1px solid #f43f5e66", borderRadius: 99, padding: "0 7px" }}>PRIORIDADE — TEMPO ESTOURADO</span>}
                      {p.queixa && <span style={{ fontSize: 12, color: "var(--text-3)" }}>{p.queixa}</span>}
                      <span style={{ marginLeft: "auto" }}><Espera p={p} /></span>
                      {canEdit && <button onClick={() => setReavaliando(p)} style={btnContorno(est ? "#f97316" : "#22d3ee")}>Reavaliar agora</button>}
                      {fmtSinaisVitais(p) && <div style={{ width: "100%", fontSize: 11, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>última aferição: {fmtSinaisVitais(p)}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* PROTOCOLO DE MANCHESTER ADAPTADO — material didático */}
      {sub === "protocolo" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${VX.turquesa}`, borderRadius: 10, padding: "12px 16px", marginBottom: 14, fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.55 }}>
            <strong>Manchester adaptado — {HOSPITAL_NOME}.</strong> Cinco níveis de prioridade definidos pela queixa de apresentação e pelos discriminadores. Os tempos-alvo abaixo são os oficiais desta unidade.
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 5 }}>Material de referência e treinamento. A classificação final é sempre da enfermeira triadora, conforme o fluxograma da queixa — o sistema apenas apoia.</div>
            {currentUser?.role === "adm_master" && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <button onClick={() => setShowFaixasPed(true)} style={{ background: "transparent", border: `1px solid ${VX.turquesa}`, color: VX.turquesa, borderRadius: 6, padding: "6px 14px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Editar faixas pediátricas (FC/FR por idade)</button>
                <button onClick={() => setShowFaixasObst(true)} style={{ background: "transparent", border: `1px solid ${VX.turquesa}`, color: VX.turquesa, borderRadius: 6, padding: "6px 14px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Editar critérios obstétricos</button>
              </div>
            )}
          </div>

          {/* Cards por nível */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, marginBottom: 18 }}>
            {Object.keys(MANCHESTER).map(k => {
              const m = MANCHESTER[k], pr = PS_PROTOCOLO[k];
              return (
                <div key={k} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderTop: `4px solid ${m.cor}`, borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 3 }}>
                    <span style={{ width: 16, height: 16, borderRadius: 5, background: m.cor, flexShrink: 0 }} />
                    <span style={{ fontSize: 15, fontWeight: 800, color: m.cor }}>{m.label}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 9 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: m.cor, border: `1px solid ${m.cor}55`, borderRadius: 99, padding: "1px 9px" }}>{m.atend.toUpperCase()}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 99, padding: "1px 9px", fontFamily: "JetBrains Mono, monospace" }}>{m.alvoMin === 0 ? "0 min — imediato" : `até ${m.alvoMin} min`}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.5, marginBottom: 10 }}>{m.desc}</div>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 5 }}>Sinais e discriminadores típicos</div>
                  <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 3 }}>
                    {pr.sinais.map((s, i) => <li key={i} style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.45 }}>{s}</li>)}
                  </ul>
                  <div style={{ marginTop: 10, background: m.cor + "12", border: `1px solid ${m.cor}44`, borderRadius: 7, padding: "8px 11px", fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.45 }}>
                    <strong style={{ color: m.cor }}>Conduta:</strong> {pr.conduta}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Discriminadores gerais */}
          <div style={{ ...secLbl }}>Discriminadores gerais — atravessam todos os fluxogramas</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10, marginBottom: 18 }}>
            {PS_DISCRIMINADORES.map(d => (
              <div key={d.nome} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${d.cor}`, borderRadius: 9, padding: "11px 14px" }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: d.cor, marginBottom: 3 }}>{d.nome}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.5 }}>{d.desc}</div>
              </div>
            ))}
          </div>

          {/* Escala AVPU */}
          <div style={{ ...secLbl }}>Escala AVPU — nível de consciência</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 14 }}>
            {[["A", "Alerta", "Desperto e orientado", "#34d399"],
              ["V", "Voz", "Responde a estímulo verbal", "#f97316"],
              ["D", "Dor", "Responde só a estímulo doloroso", "#f97316"],
              ["U", "Inconsciente", "Não responde a nenhum estímulo", "#ef4444"]].map(([l, t, d, c]) => (
              <div key={l} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 9, padding: "11px 14px", display: "flex", alignItems: "center", gap: 11 }}>
                <span style={{ width: 34, height: 34, borderRadius: 8, background: c + "22", border: `1px solid ${c}66`, color: c, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, flexShrink: 0 }}>{l}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>{t}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)", lineHeight: 1.4 }}>{d}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", lineHeight: 1.6, border: "1px dashed var(--border)", borderRadius: 8, padding: "10px 14px" }}>
            <strong>Sobre estes materiais:</strong> baseados no Manchester Triage Group e adaptados aos tempos-alvo desta unidade. As faixas de sinais vitais que o sistema usa para <em>sugerir</em> a classificação valem para <strong>adultos</strong>; na triagem <strong>pediátrica</strong> valem faixas de FC/FR <strong>por idade</strong> (editáveis pelo ADM Master em "Editar faixas pediátricas"), e a <strong>obstétrica</strong> é classificada pelo protocolo próprio. Revisar periodicamente com a equipe de enfermagem.
          </div>
        </div>
      )}

      {/* INDICADORES DA TRIAGEM */}
      {sub === "indicadores" && (() => {
        const doDia = fila.concat(finalizados).filter(p => p.classificacao);
        const comEspera = doDia.filter(p => p.triagem_em && (p.atendimento_em || p.status === "aguardando_atendimento"));
        const dentro = comEspera.filter(p => !estourouAlvo(p)).length;
        const taxa = comEspera.length ? (dentro / comEspera.length) * 100 : null;
        return (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
              <Card label="Classificados hoje" valor={doDia.length} cor={VX.azul} />
              <Card label="Dentro do tempo-alvo" valor={taxa != null ? `${taxa.toFixed(0)}%` : "—"} cor={taxa == null ? "var(--border)" : taxa >= 80 ? "#34d399" : taxa >= 60 ? "#fbbf24" : "#f43f5e"} />
              <Card label="Fora do tempo-alvo agora" valor={foraDoAlvoTotal} cor={foraDoAlvoTotal ? "#f43f5e" : "#34d399"} />
              <Card label="Porta→triagem (média)" valor={portaTriagemMedia != null ? fmtDur(Math.round(portaTriagemMedia)) : "—"} cor="#6366f1" />
              <Card label="Permanência média" valor={permMedia != null ? fmtDur(Math.round(permMedia)) : "—"} cor="#6366f1" />
            </div>
            {/* PROCEDÊNCIA — de onde vieram os pacientes (pactuação regional) */}
            {(() => {
              const todos = fila.concat(finalizados);
              const comOrigem = todos.filter(p => p.origem);
              if (!comOrigem.length) return null;
              const porOrigem = {};
              comOrigem.forEach(p => { const k = p.origem; porOrigem[k] = (porOrigem[k] || 0) + 1; });
              const ord = Object.entries(porOrigem).sort((a, b) => b[1] - a[1]);
              const deFora = comOrigem.filter(p => p.origem === "GERINT (aceite)");
              const porUnidade = {};
              deFora.forEach(p => { const k = p.origem_detalhe || "Não informada"; porUnidade[k] = (porUnidade[k] || 0) + 1; });
              return (
                <div style={{ marginBottom: 16 }}>
                  <div style={secLbl}>Procedência dos pacientes (hoje)</div>
                  <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
                    {ord.map(([o, n]) => {
                      const pct = (n / comOrigem.length) * 100;
                      const cor = o === "GERINT (aceite)" ? "#6366f1" : o === "SAMU" ? "#f43f5e" : o === "Meios próprios" ? "#34d399" : VX.azul;
                      return (
                        <div key={o} style={{ marginBottom: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 3 }}>
                            <span style={{ width: 9, height: 9, borderRadius: 99, background: cor }} />
                            <span style={{ color: "var(--text-2)", flex: 1 }}>{o}</span>
                            <strong style={{ fontFamily: "JetBrains Mono, monospace", color: cor }}>{n}</strong>
                            <span style={{ color: "var(--text-muted)", fontSize: 10.5, minWidth: 36, textAlign: "right" }}>{pct.toFixed(0)}%</span>
                          </div>
                          <div style={{ height: 6, background: "var(--surface-3)", borderRadius: 99, overflow: "hidden" }}>
                            <div style={{ width: Math.max(pct ? 3 : 0, pct) + "%", height: "100%", background: cor, borderRadius: 99 }} />
                          </div>
                        </div>
                      );
                    })}
                    {deFora.length > 0 && (
                      <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px solid var(--border)" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#6366f1", marginBottom: 5 }}>Aceites via GERINT por unidade ({deFora.length})</div>
                        {Object.entries(porUnidade).sort((a, b) => b[1] - a[1]).map(([u, n]) => (
                          <div key={u} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, marginBottom: 2 }}>
                            <span style={{ flex: 1, color: "var(--text-2)" }}>{u}</span>
                            <strong style={{ fontFamily: "JetBrains Mono, monospace", color: "#6366f1" }}>{n}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 9 }}>
                      Base da pactuação regional: quantos pacientes chegam por conta própria, por serviços de urgência e quantos são aceites da regulação (pacientes de fora do município).
                    </div>
                  </div>
                </div>
              );
            })()}

            <div style={secLbl}>Distribuição por classificação (hoje)</div>
            {doDia.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Nenhuma classificação hoje ainda.</div>
            ) : (
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
                {Object.keys(MANCHESTER).map(k => {
                  const lista = doDia.filter(p => p.classificacao === k);
                  const est = lista.filter(estourouAlvo).length;
                  const pct = (lista.length / doDia.length) * 100;
                  const v = MANCHESTER[k];
                  return (
                    <div key={k} style={{ marginBottom: 9 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 3 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 99, background: v.cor }} />
                        <span style={{ color: "var(--text-2)", flex: 1 }}>{v.label} <span style={{ color: "var(--text-muted)", fontSize: 10.5 }}>· {v.atend}, {v.alvoMin === 0 ? "imediato" : `${v.alvoMin} min`}</span></span>
                        {est > 0 && <span style={{ fontSize: 10.5, fontWeight: 800, color: "#f43f5e" }}>⚠ {est} fora do alvo</span>}
                        <strong style={{ fontFamily: "JetBrains Mono, monospace", color: v.cor, minWidth: 26, textAlign: "right" }}>{lista.length}</strong>
                        <span style={{ color: "var(--text-muted)", fontSize: 10.5, minWidth: 36, textAlign: "right" }}>{pct.toFixed(0)}%</span>
                      </div>
                      <div style={{ height: 7, background: "var(--surface-3)", borderRadius: 99, overflow: "hidden" }}>
                        <div style={{ width: Math.max(pct ? 3 : 0, pct) + "%", height: "100%", background: v.cor, borderRadius: 99 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ═════════ EMERGÊNCIA (PS) — telas do bloco ═════════ */}
      {sub.startsWith("e_") && (() => {
        const ativas = salas.filter(s => s.ativo !== false);
        const doCenso = ativas.filter(psContaCenso);          // entram nos leitos do hospital
        const retaguarda = ativas.filter(s => !psContaCenso(s)); // só no panorama do PS
        const pacById = {}; fila.forEach(p => pacById[p.id] = p);
        const ocupadas = a => a.filter(s => s.status === "ocupado").length;
        const dispon = a => a.filter(s => (s.status || "disponivel") === "disponivel").length;
        const areasOrd = [...new Set(ativas.map(s => s.area || "Outros"))]
          .sort((a, b) => { const ia = PS_AREAS.indexOf(a), ib = PS_AREAS.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, "pt-BR"); });

        // Tile pequeno no padrão do Giro de Leitos
        const Tile = ({ s }) => {
          const st = PS_SALA_STATUS[s.status] || PS_SALA_STATUS.disponivel;
          const pac = s.atendimento_id ? pacById[s.atendimento_id] : null;
          const desde = s.ocupado_em ? diffMin(s.ocupado_em, agora) : null;
          return (
            <div title={`${s.identificacao} · ${st.label}${pac ? ` · ${pac.iniciais}` : ""}${desde != null ? ` · ${fmtDur(desde)}` : ""}${psContaCenso(s) ? "" : " · retaguarda (fora do censo)"}`}
              style={{ background: st.cor + "1e", border: `1px solid ${st.cor}66`, borderTop: `3px solid ${st.cor}`, borderRadius: 7, padding: "5px 7px", minWidth: 62, position: "relative" }}>
              {!psContaCenso(s) && <span style={{ position: "absolute", top: 2, right: 4, fontSize: 8, color: "var(--text-muted)", fontWeight: 800 }} title="Não conta no censo do hospital">R</span>}
              <div style={{ fontSize: 11.5, fontWeight: 800, color: st.cor, fontFamily: "JetBrains Mono, monospace" }}>{s.identificacao}</div>
              <div style={{ fontSize: 9, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 72 }}>{pac ? pac.iniciais : st.label}</div>
              {canEdit && (
                <div style={{ display: "flex", gap: 3, marginTop: 3, flexWrap: "wrap" }}>
                  {s.status === "disponivel" && <button onClick={() => setAlocando(s)} style={{ ...btnContorno("#22d3ee"), padding: "0 5px", fontSize: 9 }}>Alocar</button>}
                  {s.status === "ocupado" && <button onClick={() => mudarStatusSala(s, "limpeza")} style={{ ...btnContorno("#d97706"), padding: "0 5px", fontSize: 9 }}>Liberar</button>}
                  {s.status === "limpeza" && <button onClick={() => mudarStatusSala(s, "disponivel")} style={{ ...btnContorno("#34d399"), padding: "0 5px", fontSize: 9 }}>Pronta</button>}
                  {s.status === "manutencao" && <button onClick={() => mudarStatusSala(s, "disponivel")} style={{ ...btnContorno("#34d399"), padding: "0 5px", fontSize: 9 }}>Liberar</button>}
                </div>
              )}
            </div>
          );
        };
        const MapaAreas = ({ lista }) => (
          <>{areasOrd.filter(a => lista.some(s => (s.area || "Outros") === a)).map(area => {
            const doArea = lista.filter(s => (s.area || "Outros") === area);
            return (
              <div key={area} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 4 }}>
                  {area} <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>· {doArea.length} vaga(s) · {dispon(doArea)} livre(s)</span>
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{doArea.map(s => <Tile key={s.id} s={s} />)}</div>
              </div>
            );
          })}</>
        );

        // ── Painel da Emergência ──
        if (sub === "e_painel") return (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
              <Card label="Em atendimento" valor={emAtendimento.length} cor="#22d3ee" />
              <Card label="Aguardando atendimento" valor={aguardandoAtend.length} cor="#3b82f6" />
              <Card label="Vagas ocupadas (PS)" valor={ativas.length ? `${ocupadas(ativas)}/${ativas.length}` : "—"} cor={ocupadas(ativas) ? "#f43f5e" : "#34d399"} />
              <Card label="Vagas livres (PS)" valor={ativas.length ? `${dispon(ativas)}/${ativas.length}` : "—"} cor={dispon(ativas) ? "#34d399" : "#f43f5e"} />
              <Card label="Permanência média" valor={permMedia != null ? fmtDur(Math.round(permMedia)) : "—"} cor="#6366f1" />
              <Card label="Atendidos hoje" valor={finalizados.length} cor="#0d9488" />
            </div>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", marginBottom: 12, fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.6 }}>
              <strong>Censo:</strong> {doCenso.length} vaga(s) do PS entram nos leitos do hospital ({ocupadas(doCenso)} ocupada(s)) ·{" "}
              <strong style={{ color: "#d97706" }}>{retaguarda.length} de retaguarda</strong> (observação, procedimento, PCR e isolamento infantil) contam <strong>só aqui</strong>, por serem provisórias e de alta rotatividade.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, alignItems: "start" }}>
              {/* DESFECHOS DO DIA — com os dois tipos de óbito separados */}
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "13px 15px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>Desfechos do dia</div>
                <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginBottom: 10 }}>{finalizados.length} atendimento(s) finalizado(s) no PS hoje.</div>
                {(() => {
                  const obitoPS = finalizados.filter(p => p.desfecho === "obito").length;
                  const linhas = Object.keys(PS_DESFECHOS).map(k => ({
                    k,
                    label: k === "obito" ? "Óbito no PS (antes de internar)" : PS_DESFECHOS[k].label,
                    cor: PS_DESFECHOS[k].cor,
                    n: finalizados.filter(p => p.desfecho === k).length,
                  }));
                  const totalObitos = obitoPS + obitosInternacao;
                  return (<>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {linhas.map(x => (
                        <div key={x.k} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "7px 11px" }}>
                          <span style={{ width: 8, height: 8, borderRadius: 99, background: x.cor, flexShrink: 0 }} />
                          <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-2)" }}>{x.label}</span>
                          <strong style={{ fontFamily: "JetBrains Mono, monospace", color: x.n ? x.cor : "var(--text-muted)" }}>{x.n}</strong>
                        </div>
                      ))}
                      {/* Óbito após internação vem de leitos_saidas — não é desfecho do PS */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px dashed var(--border)", borderRadius: 7, padding: "7px 11px" }}>
                        <span style={{ width: 8, height: 8, borderRadius: 99, background: "#f43f5e", flexShrink: 0, opacity: .6 }} />
                        <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-3)" }}>Óbito após internação <span style={{ fontSize: 10, color: "var(--text-muted)" }}>(fora do PS)</span></span>
                        <strong style={{ fontFamily: "JetBrains Mono, monospace", color: obitosInternacao ? "#f43f5e" : "var(--text-muted)" }}>{obitosInternacao}</strong>
                      </div>
                    </div>
                    {totalObitos > 0 && (
                      <div style={{ marginTop: 9, background: "#f43f5e10", border: "1px solid #f43f5e44", borderRadius: 7, padding: "8px 11px", fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.5 }}>
                        <strong style={{ color: "#f43f5e" }}>Óbitos hoje: {totalObitos}</strong> — {obitoPS} no PS antes de internar · {obitosInternacao} após internação.
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>
                      Os dois óbitos são contados em fontes diferentes: o do PS vem do desfecho do atendimento; o pós-internação vem da saída do leito. Somar sem separar infla o indicador do PS.
                    </div>
                  </>);
                })()}
              </div>

              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "13px 15px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Mapa resumido</div>
                {ativas.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nenhuma vaga cadastrada.</div> : <MapaAreas lista={ativas} />}
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "13px 15px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Encaminhamentos de hoje</div>
                {(() => {
                  const internados = finalizados.filter(p => p.desfecho === "internacao");
                  const porSetor = {}; internados.forEach(p => { const k = p.setor_destino || "Sem setor"; porSetor[k] = (porSetor[k] || 0) + 1; });
                  const linhas = [
                    ...Object.entries(porSetor).map(([k, n]) => ({ label: k, n, cor: "#3b82f6" })),
                    { label: "Transferência externa", n: finalizados.filter(p => p.desfecho === "transferencia").length, cor: "#6366f1" },
                    { label: "Alta", n: finalizados.filter(p => p.desfecho === "alta").length, cor: "#34d399" },
                    { label: "Evasão", n: finalizados.filter(p => p.desfecho === "evasao").length, cor: "#d97706" },
                    { label: "Óbito no PS", n: finalizados.filter(p => p.desfecho === "obito").length, cor: "#f43f5e" },
                  ].filter(x => x.n > 0);
                  if (!linhas.length) return <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nenhum desfecho hoje.</div>;
                  return <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{linhas.map((x, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 11px" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 99, background: x.cor }} />
                      <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-2)" }}>{x.label}</span>
                      <strong style={{ fontFamily: "JetBrains Mono, monospace", color: x.cor }}>{x.n}</strong>
                    </div>
                  ))}</div>;
                })()}
              </div>
            </div>
          </div>
        );

        // ── Em atendimento ──
        if (sub === "e_atendimento") return (
          <div style={{ marginBottom: 16 }}>
            {emAtendimento.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Nenhum paciente em atendimento.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {emAtendimento.map(p => {
                  const sala = salas.find(s => s.atendimento_id === p.id);
                  return (
                    <div key={p.id} style={{ ...linhaPac, borderLeft: `4px solid ${MANCHESTER[p.classificacao]?.cor || "var(--border)"}` }}>
                      <strong style={{ minWidth: 64 }}>{p.iniciais}</strong>
                      {p.prontuario && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>reg. {p.prontuario}</span>}
                      <ClasseBadge c={p.classificacao} />
                      {sala && <span style={{ fontSize: 10.5, fontWeight: 700, color: VX.azul, border: `1px solid ${VX.azul}55`, borderRadius: 99, padding: "0 7px" }}>{sala.identificacao} · {sala.area}</span>}
                      {p.queixa && <span style={{ fontSize: 12, color: "var(--text-3)" }}>{p.queixa}</span>}
                      <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-3)", fontFamily: "JetBrains Mono, monospace" }}>{fmtDur(diffMin(p.atendimento_em, agora))}</span>
                      {canEdit && <button onClick={() => setAtendendo(p)} style={btnContorno("#3b82f6")}>Abrir atendimento</button>}
                      {canEdit && <button onClick={() => setDesfechando(p)} style={btnContorno("#22d3ee")}>Desfecho</button>}
                      {(examesPend[p.id]?.aguardando > 0 || examesPend[p.id]?.prontos > 0 || checagemPend[p.id]?.itens?.length > 0) && (
                        <div style={{ width: "100%", display: "flex", gap: 8, fontSize: 11, fontWeight: 700 }}>
                          {examesPend[p.id]?.aguardando > 0 && <span style={{ color: "#d97706" }}>{examesPend[p.id].aguardando} exame(s) aguardando</span>}
                          {examesPend[p.id]?.prontos > 0 && <span style={{ color: "#3b82f6" }}>{examesPend[p.id].prontos} resultado(s) pronto(s)</span>}
                          {checagemPend[p.id]?.itens?.length > 0 && <span style={{ color: "#f43f5e" }}>{checagemPend[p.id].itens.length} medicamento(s) sem checagem</span>}
                        </div>
                      )}
                      {fmtSinaisVitais(p) && <div style={{ width: "100%", fontSize: 11, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{fmtSinaisVitais(p)}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );

        // ── Checagem de medicação: lista de trabalho da enfermagem ──
        // Ordena pelo que espera há mais tempo desde que a farmácia entregou.
        if (sub === "e_checagem") {
          const pend = emAtendimento
            .map(p => ({ p, info: checagemPend[p.id] }))
            .filter(x => x.info && x.info.itens.length)
            .sort((a, b) => new Date(a.info.desde || 0) - new Date(b.info.desde || 0));
          const totalItens = pend.reduce((a, x) => a + x.info.itens.length, 0);
          const esperaDe = x => diffMin(x.info.desde, agora);
          return (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
                <Card label="Pacientes a checar" valor={pend.length} cor={pend.length ? "#d97706" : "#34d399"} />
                <Card label="Medicamentos aguardando" valor={totalItens} cor={totalItens ? "#d97706" : "#34d399"} />
                <Card label="Em atendimento agora" valor={emAtendimento.length} cor={VX.azul} />
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", marginBottom: 12, fontSize: 12, color: "var(--text-2)", lineHeight: 1.6 }}>
                A farmácia entregou estes medicamentos e ninguém registrou o que foi feito com eles. Abrir o paciente leva direto à aba <strong>Checagem</strong>, onde a dose é marcada como administrada — ou justificada, se não foi dada.
              </div>
              {pend.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Nenhuma medicação aguardando checagem. Toda dose entregue pela farmácia já foi registrada.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {pend.map(({ p, info }) => {
                    const espera = esperaDe({ info });
                    const atraso = espera != null && espera >= 60;   // entregue há 1h e ninguém checou
                    const sala = salas.find(s => s.atendimento_id === p.id);
                    return (
                      <div key={p.id} style={{ ...linhaPac, borderLeft: `4px solid ${atraso ? "#f43f5e" : "#d97706"}` }}>
                        <strong style={{ minWidth: 64 }}>{p.iniciais}</strong>
                        {p.prontuario && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>reg. {p.prontuario}</span>}
                        <ClasseBadge c={p.classificacao} />
                        {sala && <span style={{ fontSize: 10.5, fontWeight: 700, color: VX.azul, border: `1px solid ${VX.azul}55`, borderRadius: 99, padding: "0 7px" }}>{sala.identificacao} · {sala.area}</span>}
                        <span style={{ marginLeft: "auto", fontSize: 12, color: atraso ? "#f43f5e" : "var(--text-3)", fontFamily: "JetBrains Mono, monospace", fontWeight: atraso ? 700 : 400 }}>
                          {espera != null ? `entregue há ${fmtDur(espera)}` : "—"}
                        </span>
                        {canEdit && <button onClick={() => { setAtendendoAba("checagem"); setAtendendo(p); }} style={btnContorno(atraso ? "#f43f5e" : "#d97706")}>Checar medicação</button>}
                        <div style={{ width: "100%", fontSize: 11.5, color: "var(--text-2)", display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {info.itens.map(it => (
                            <span key={it.id} style={{ border: "1px solid var(--border)", borderRadius: 99, padding: "1px 9px" }}>
                              {it.medicamento_nome}{it.dose ? ` · ${it.dose}` : ""}{it.via ? ` · ${it.via}` : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 10 }}>Lista dos pacientes <strong>em atendimento</strong>. Quem já teve desfecho registrado sai daqui — a checagem desses fica no histórico do atendimento.</div>
            </div>
          );
        }

        // ── Leitos detalhados ──
        if (sub === "e_leitos") return (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
              <Card label="Total de vagas do PS" valor={ativas.length} cor={VX.azul} />
              <Card label="No censo do hospital" valor={doCenso.length} cor="#0d9488" />
              <Card label="Retaguarda (fora do censo)" valor={retaguarda.length} cor="#d97706" />
              <Card label="Ocupadas" valor={ocupadas(ativas)} cor={ocupadas(ativas) ? "#f43f5e" : "#34d399"} />
              <Card label="Livres" valor={dispon(ativas)} cor={dispon(ativas) ? "#34d399" : "#f43f5e"} />
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
              {Object.entries(PS_SALA_STATUS).map(([k, v]) => (
                <span key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-muted)" }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: v.cor }} />{v.label} ({ativas.filter(s => (s.status || "disponivel") === k).length})
                </span>
              ))}
              <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 6 }}><strong>R</strong> = retaguarda, não conta no censo do hospital</span>
              {canEdit && <button onClick={() => setShowSalas(true)} style={{ marginLeft: "auto", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 12px", color: "var(--text-3)", cursor: "pointer", fontSize: 12 }}>Gerenciar vagas</button>}
            </div>
            {ativas.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Nenhuma vaga cadastrada. Rode a migração das vagas do PS ou cadastre em “Gerenciar vagas”.</div>
            ) : (<>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "13px 15px", marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#0d9488", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 9 }}>Vagas que contam no censo do hospital ({doCenso.length})</div>
                <MapaAreas lista={doCenso} />
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: "4px solid #d97706", borderRadius: 10, padding: "13px 15px" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#d97706", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Retaguarda provisória — só no panorama do PS ({retaguarda.length})</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 9 }}>Observação, procedimento, PCR e isolamento infantil: alta rotatividade, não entram nos leitos do hospital.</div>
                <MapaAreas lista={retaguarda} />
              </div>
            </>)}
          </div>
        );

        // ── Transferências ──
        if (sub === "e_transferencias") {
          const transf = finalizados.filter(p => p.desfecho === "transferencia");
          const viaDe = p => PS_VIAS_TRANSF.find(v => normTxt(p.observacao).includes(normTxt(v))) || "Não informada";
          const porVia = {}; transf.forEach(p => { const v = viaDe(p); porVia[v] = (porVia[v] || 0) + 1; });
          return (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
                <Card label="Transferências hoje" valor={transf.length} cor="#6366f1" />
                {PS_VIAS_TRANSF.slice(0, 2).map(v => <Card key={v} label={v} valor={porVia[v] || 0} cor={v === "Vaga Zero" ? "#f43f5e" : VX.azul} />)}
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", marginBottom: 12, fontSize: 12, color: "var(--text-2)", lineHeight: 1.6 }}>
                A via da transferência é registrada no <strong>Desfecho → Transferência</strong>, no campo “Via”: <strong>Vaga Zero</strong> (imposição de vaga em urgência), <strong>GERINT</strong> (regulação), contato direto ou outro.
              </div>
              {transf.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Nenhuma transferência externa hoje.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {transf.map(p => (
                    <div key={p.id} style={{ ...linhaPac, borderLeft: "4px solid #6366f1" }}>
                      <strong style={{ minWidth: 64 }}>{p.iniciais}</strong>
                      <ClasseBadge c={p.classificacao} />
                      <span style={{ fontSize: 10.5, fontWeight: 800, color: viaDe(p) === "Vaga Zero" ? "#f43f5e" : VX.azul, border: `1px solid ${viaDe(p) === "Vaga Zero" ? "#f43f5e55" : VX.azul + "55"}`, borderRadius: 99, padding: "0 8px" }}>{viaDe(p)}</span>
                      {p.observacao && <span style={{ fontSize: 12, color: "var(--text-3)", flex: 1 }}>{p.observacao}</span>}
                      <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{horaFmt(p.desfecho_em)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }

        // ── Aguardando leito ──
        if (sub === "e_aguardando") {
          const internar = finalizados.filter(p => p.desfecho === "internacao");
          const jaNoLeito = p => leitos.some(l => l.ps_atendimento_id === p.id || (l.prontuario && p.prontuario && l.prontuario === p.prontuario));
          const naFila = internar.filter(p => !jaNoLeito(p));
          return (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
                <Card label="Internações decididas hoje" valor={internar.length} cor="#3b82f6" />
                <Card label="Ainda sem leito" valor={naFila.length} cor={naFila.length ? "#d97706" : "#34d399"} />
                <Card label="Leitos livres no hospital" valor={leitos.filter(l => l.status === "livre").length} cor="#34d399" />
              </div>
              {internar.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Nenhuma internação decidida hoje.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {internar.map(p => {
                    const alocado = leitos.find(l => l.ps_atendimento_id === p.id) || leitos.find(l => l.prontuario && p.prontuario && l.prontuario === p.prontuario);
                    return (
                      <div key={p.id} style={{ ...linhaPac, borderLeft: `4px solid ${alocado ? "#34d399" : "#d97706"}` }}>
                        <strong style={{ minWidth: 64 }}>{p.iniciais}</strong>
                        {p.prontuario && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>reg. {p.prontuario}</span>}
                        <ClasseBadge c={p.classificacao} />
                        {p.setor_destino && <span style={{ fontSize: 12, color: "var(--text-3)" }}>→ {p.setor_destino}</span>}
                        <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, color: alocado ? "#34d399" : "#d97706", border: `1px solid ${alocado ? "#34d39955" : "#d9770655"}`, borderRadius: 99, padding: "0 8px" }}>
                          {alocado ? `internado · leito ${alocado.identificacao}` : "aguardando leito"}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>desde {horaFmt(p.desfecho_em)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 10 }}>A alocação do leito é feita no módulo <strong>Giro de Leitos</strong>. Aqui você acompanha quem saiu do PS com internação decidida e ainda não tem leito.</div>
            </div>
          );
        }

        // ── Assistente IA do PS ──
        if (sub === "e_ia") return <PsAssistenteView fila={fila} finalizados={finalizados} salas={ativas} leitos={leitos} />;
        return null;
      })()}

      {/* FINALIZADOS HOJE */}
      {finalizados.length > 0 && (
        <details style={{ marginBottom: "1.25rem" }}>
          <summary style={{ ...secLbl, cursor: "pointer" }}>Finalizados hoje ({finalizados.length})</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
            {finalizados.map(p => (
              <div key={p.id} style={{ ...linhaPac, padding: "7px 12px", fontSize: 12, color: "var(--text-3)" }}>
                <strong style={{ color: "var(--text-2)" }}>{p.iniciais}</strong>
                <ClasseBadge c={p.classificacao} />
                {p.desfecho && <span style={{ color: PS_DESFECHOS[p.desfecho]?.cor || "var(--text-3)", fontWeight: 700 }}>{PS_DESFECHOS[p.desfecho]?.label || p.desfecho}{p.setor_destino ? ` → ${p.setor_destino}` : ""}</span>}
                <span style={{ marginLeft: "auto", fontFamily: "JetBrains Mono, monospace" }}>permanência {fmtDur(diffMin(p.chegada_em, p.desfecho_em))}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* MODAL TRIAGEM / REAVALIAÇÃO */}
      {/* AÇÕES RÁPIDAS — rodapé fixo do módulo */}
      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", padding: "12px 0 4px", marginTop: 6, borderTop: "1px solid var(--border)" }}>
        {canEdit && <button onClick={() => { setSub("classificar"); setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50); }}
          style={{ background: VX.turquesa, color: "#062a26", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 7 }}>
          <Icon name="activity" size={15} />Novo atendimento
        </button>}
        <button onClick={() => setShowProtocolos(true)}
          style={{ background: "transparent", color: VX.azul, border: `1px solid ${VX.azul}66`, borderRadius: 8, padding: "10px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 7 }}>
          <Icon name="clipboard" size={15} />Abrir protocolos
        </button>
        <button onClick={() => setSub("protocolo")}
          style={{ background: "transparent", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 7 }}>
          <Icon name="checks" size={15} />Manchester adaptado
        </button>
      </div>

      {showProtocolos && <PsProtocolosModal sb={sb} currentUser={currentUser} canEdit={canEdit} isMaster={currentUser?.role === "adm_master"} onClose={() => setShowProtocolos(false)} />}
      {showFaixasPed && <FaixasPediatricasModal sb={sb} faixas={faixasPed} currentUser={currentUser} onClose={() => setShowFaixasPed(false)} onSaved={() => loadFaixasPediatricas(sb).then(setFaixasPed)} />}
      {showFaixasObst && <FaixasObstetricasModal sb={sb} regras={faixasObst} currentUser={currentUser} onClose={() => setShowFaixasObst(false)} onSaved={() => loadFaixasObstetricas(sb).then(setFaixasObst)} />}
      {showSalas && <PsSalasModal salas={salas} onClose={() => setShowSalas(false)} onSave={salvarSala} onDelete={excluirSala} isMaster={currentUser?.role === "adm_master"} />}
      {alocando && <PsAlocarSalaModal sala={alocando} pacientes={fila.filter(p => ["aguardando_atendimento", "em_atendimento"].includes(p.status) && !salas.some(s => s.atendimento_id === p.id))} onClose={() => setAlocando(null)} onSave={ocuparSala} />}
      {triando && <TriagemModal sb={sb} paciente={triando} faixasPediatricas={faixasPed} faixasObstetricas={faixasObst} onClose={() => setTriando(null)} onTriar={(cls, vitais, sug, comorb, extras) => triar(triando, cls, vitais, sug, comorb, extras)} />}
      {reavaliando && <TriagemModal sb={sb} paciente={reavaliando} reavaliacao faixasPediatricas={faixasPed} faixasObstetricas={faixasObst} onClose={() => setReavaliando(null)} onTriar={(cls, vitais, sug, comorb, extras) => reavaliar(reavaliando, cls, vitais, sug, comorb, extras)} />}

      {/* MODAL DESFECHO */}
      {desfechando && <PsDesfechoModal sb={sb} paciente={desfechando} setores={setores} leitos={leitos} catalogos={catalogos} examesPend={examesPend[desfechando.id]} onClose={() => setDesfechando(null)} onSave={darDesfecho} />}

      {/* PAINEL DO ATENDIMENTO (evolução, prescrição, exames) */}
      {atendendo && <AtendimentoModal sb={sb} sbCru={sbCru} paciente={atendendo} currentUser={currentUser} abaInicial={atendendoAba} onClose={() => { setAtendendo(null); setAtendendoAba(null); refresh(); }} onChanged={() => {}} />}
      </div>
    </div>
  );
}

// Modal de desfecho do PS (alta/internação/transferência/evasão/óbito)
function PsDesfechoModal({ sb, paciente, setores, leitos = [], catalogos = {}, examesPend, onClose, onSave }) {
  const exAguardando = examesPend?.aguardando || 0;   // exame sem resultado ainda
  const exProntos = examesPend?.prontos || 0;         // resultado saiu, médico não marcou visto
  const inicial = valoresIniciais(paciente);
  const [desfecho, setDesfecho] = useState("");
  const [setorDestino, setSetorDestino] = useState("");
  const [medico, setMedico] = useState("");
  const [obs, setObs] = useState("");
  const [leitoSel, setLeitoSel] = useState("fila"); // "fila" | identificacao do leito
  const [busy, setBusy] = useState(false);
  // Faturamento — abre com o que JÁ está gravado (ver valoresIniciais: abrir
  // vazio faria o UPDATE do desfecho apagar o convênio da Recepção).
  const [convenioId, setConvenioId] = useState(inicial.convenioId);
  const [procedimentoCod, setProcedimentoCod] = useState(inicial.procedimentoCod);
  const [cid, setCid] = useState(inicial.cid);
  const [sugestao, setSugestao] = useState(null);   // convênio do atendimento anterior
  const convenios = catalogos.convenios || [];
  const procedimentos = catalogos.procedimentos || [];
  const [buscaProc, setBuscaProc] = useState("");
  // As opções vêm dos DOIS catálogos: o do hospital e o SIGTAP já carregado.
  // A via sai do desfecho — internação é AIH, o resto do PS é BPA — e é ela
  // que impede oferecer um código de internação para quem teve alta.
  const convObj = convenios.find(c => String(c.id) === String(convenioId)) || null;
  // `viaDaEscolha` chama `resolverVia` — a mesma regra que o motor de conta
  // usa para fechar. Duas regras de via divergindo faria a tela oferecer
  // procedimento de uma via e a conta fechar por outra.
  const viaProc = viaDaEscolha({ atendimento: paciente, convenio: convObj, desfecho });
  const opcoesProc = opcoesDeProcedimento({
    procedimentos, sigtap: catalogos.sigtap || [], desfecho, convenio: convObj, atendimento: paciente,
  });
  const opcoesFiltradas = filtrarProcedimentos(opcoesProc, buscaProc).slice(0, 40);
  const semCatalogo = avisoDeCatalogo({
    opcoes: opcoesProc, procedimentos, sigtap: catalogos.sigtap || [], desfecho, convenio: convObj, atendimento: paciente,
  });
  const procEscolhido = opcoesProc.find(o => o.codigo === procedimentoCod) || null;

  // Convênio do atendimento anterior desta pessoa: poupa digitação e não
  // afirma nada — a tela mostra de onde veio e quem confirma é quem está com
  // o paciente na frente.
  useEffect(() => {
    if (!sb || !paciente.prontuario || inicial.convenioId) return;
    sb(`ps_atendimentos?prontuario=eq.${encodeURIComponent(paciente.prontuario)}` +
            `&convenio_id=not.is.null&id=neq.${paciente.id}` +
            `&select=convenio_id,chegada_em&order=chegada_em.desc&limit=5`)
      .then(r => setSugestao(convenioSugerido(Array.isArray(r) ? r : [])));
  }, [paciente.id]);

  // Só depois de escolher o desfecho — antes disso não se sabe sequer se
  // este atendimento gera conta, e aviso que já nasce aceso não é lido.
  const aviso = desfecho
    ? avisoDeConta({ atendimento: { convenio_id: convenioId, procedimento_cod: procedimentoCod }, desfecho })
    : null;
  const pedeConta = !!desfecho && geraConta(desfecho);
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 11px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  const lbl = { fontSize: 11, fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 5 };

  // Leitos vagos, com os do setor escolhido primeiro
  const livres = leitos.filter(l => l.status === "livre")
    .sort((a, b) => ((b.setor === setorDestino) - (a.setor === setorDestino)) || (a.identificacao || "").localeCompare(b.identificacao || "", "pt-BR", { numeric: true }));

  async function salvar() {
    if (!desfecho) { alert("Escolha o desfecho."); return; }
    if (desfecho === "internacao" && !setorDestino) { alert("Escolha o setor de destino da internação."); return; }
    if (exAguardando > 0 && !confirm(`${paciente.iniciais} tem ${exAguardando} exame(s) aguardando resultado. Dar o desfecho mesmo assim?`)) return;
    const leitoObj = desfecho === "internacao" && leitoSel !== "fila" ? livres.find(l => l.identificacao === leitoSel) : null;
    if (desfecho === "internacao" && leitoObj) {
      if (!confirm(`Reservar o leito ${leitoObj.identificacao}${leitoObj.setor ? ` (${leitoObj.setor})` : ""} para ${paciente.iniciais}? O leito fica RESERVADO até o paciente chegar (confirme a chegada no Mapa de leitos).`)) return;
    }
    // ⚠️ AVISA E DEIXA PASSAR. Desfecho é ato de porta — o leito precisa
    // girar, o paciente está indo embora, e às vezes é óbito. Travar a saída
    // por campo de faturamento inverteria a prioridade. O que não pode é
    // alguém descobrir a falta só no fechamento do mês.
    if (aviso && !confirm(`${aviso.texto}${String.fromCharCode(10, 10)}Finalizar assim mesmo?`)) return;
    setBusy(true);
    await onSave(paciente, {
      desfecho, setorDestino, observacao: obs.trim(), medico: medico.trim(), leito: leitoObj,
      convenioId, procedimentoCod, cid: cid.trim(),
    });
    setBusy(false);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 500, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Desfecho — {paciente.iniciais}</div>
        {(exAguardando > 0 || exProntos > 0) && (
          <div style={{ background: "#d9770618", border: "1px solid #d9770655", borderRadius: 8, padding: "9px 12px", marginBottom: 14, fontSize: 12.5, color: "#d97706", lineHeight: 1.5 }}>
            <strong>Atenção:</strong>{exAguardando > 0 ? ` ${exAguardando} exame(s) aguardando resultado.` : ""}{exProntos > 0 ? ` ${exProntos} resultado(s) ainda não visto(s).` : ""} Confira antes de finalizar.
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {Object.entries(PS_DESFECHOS).map(([k, v]) => (
            <button key={k} onClick={() => setDesfecho(k)} style={{ background: desfecho === k ? "var(--surface-3)" : "transparent", color: desfecho === k ? v.cor : "var(--text-3)", border: `1px solid ${desfecho === k ? v.cor : "var(--border-2)"}`, borderRadius: 7, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{v.label}</button>
          ))}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Médico responsável{desfecho === "evasao" ? " (evasão será contabilizada por médico)" : ""}</label>
          <input value={medico} onChange={e => setMedico(e.target.value)} placeholder="Sobrenome do médico" style={inp} />
        </div>

        {desfecho === "internacao" && (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Setor de destino *</label>
              <select value={setorDestino} onChange={e => { setSetorDestino(e.target.value); setLeitoSel("fila"); }} style={inp}>
                <option value="">Escolha o setor…</option>
                {setores.map(s => <option key={s.nome} value={s.nome}>{s.nome}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Encaminhamento</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <button onClick={() => setLeitoSel("fila")} style={{ textAlign: "left", background: leitoSel === "fila" ? "var(--surface-3)" : "transparent", border: `1px solid ${leitoSel === "fila" ? "#22d3ee" : "var(--border)"}`, borderRadius: 7, padding: "9px 12px", cursor: "pointer", color: "var(--text-2)", fontSize: 12.5 }}>
                  Enviar para a fila de espera por leito {setorDestino ? `(${setorDestino})` : ""}
                </button>
                {livres.length === 0 && <div style={{ fontSize: 11.5, color: "var(--text-muted)", padding: "2px 2px" }}>Nenhum leito livre no momento — o paciente irá para a fila de espera.</div>}
                {livres.map(l => (
                  <button key={l.identificacao} onClick={() => setLeitoSel(l.identificacao)} style={{ textAlign: "left", background: leitoSel === l.identificacao ? "var(--surface-3)" : "transparent", border: `1px solid ${leitoSel === l.identificacao ? "#34d399" : "var(--border)"}`, borderRadius: 7, padding: "9px 12px", cursor: "pointer", fontSize: 12.5, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: "#34d399", flexShrink: 0 }} />
                    <strong style={{ color: "var(--text)" }}>Leito {l.identificacao}</strong>
                    {l.setor && <span style={{ color: l.setor === setorDestino ? "#34d399" : "var(--text-muted)" }}>{l.setor}{l.setor === setorDestino ? " · mesmo setor" : ""}</span>}
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>internar aqui →</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Via da transferência externa — alimenta o painel de Transferências */}
        {desfecho === "transferencia" && (
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Via da transferência *</label>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {PS_VIAS_TRANSF.map(v => {
                const ativo = normTxt(obs).includes(normTxt(v));
                return (
                  <button key={v} onClick={() => setObs(o => {
                    const limpo = PS_VIAS_TRANSF.reduce((s, x) => s.replace(new RegExp(`^${x}\\s*—\\s*`, "i"), ""), o).trim();
                    return `${v}${limpo ? ` — ${limpo}` : ""}`;
                  })}
                    style={{ background: ativo ? (v === "Vaga Zero" ? "#f43f5e" : VX.azul) : "transparent", color: ativo ? "#fff" : "var(--text-3)", border: `1px solid ${ativo ? (v === "Vaga Zero" ? "#f43f5e" : VX.azul) : "var(--border)"}`, borderRadius: 99, padding: "5px 13px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{v}</button>
                );
              })}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 5 }}>Vaga Zero = imposição de vaga na urgência · GERINT = regulação. A via fica registrada na observação e aparece no painel de Transferências.</div>
          </div>
        )}

        {/* ── Faturamento ──────────────────────────────────────
            Aqui, e não na chegada, porque o procedimento só se sabe no fim —
            e porque é este UPDATE que o faturamento vai ler depois. Some na
            evasão: atendimento que não gera conta não tem o que cobrar. */}
        {pedeConta && (
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "12px 13px", marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>Faturamento</div>
            <div style={{ marginBottom: 10 }}>
              <label style={lbl}>Convênio / fonte pagadora</label>
              <select value={convenioId} onChange={e => setConvenioId(e.target.value)} style={inp}>
                <option value="">Escolha o convênio…</option>
                {convenios.map(c => <option key={c.id} value={String(c.id)}>{c.nome}</option>)}
              </select>
              {convenios.length === 0 && <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 4 }}>Nenhum convênio cadastrado — cadastre em ATENDIMENTO › Tabelas.</div>}
              {sugestao && !convenioId && (
                <button onClick={() => setConvenioId(sugestao.convenio_id)} style={{ marginTop: 5, background: "transparent", border: "1px dashed var(--border-2)", borderRadius: 6, padding: "5px 10px", fontSize: 11.5, color: "var(--text-3)", cursor: "pointer" }}>
                  Usar {convenios.find(c => String(c.id) === sugestao.convenio_id)?.nome || "o convênio anterior"} — foi o do atendimento de {fmtDataBR(sugestao.de)}
                </button>
              )}
            </div>
            {/* Busca em vez de <select>: são centenas de procedimentos, e
                rolar 219 opções com o paciente saindo é o mesmo que não ter
                lista. A escolha some assim que um código é fixado. */}
            <div style={{ marginBottom: 10 }}>
              <label style={lbl}>Procedimento</label>
              {procEscolhido ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 11px" }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--text-2)" }}>
                    <strong style={{ fontFamily: "JetBrains Mono, monospace" }}>{procEscolhido.codigo}</strong> — {procEscolhido.nome}
                    <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{procEscolhido.fonte === "sigtap" ? `tabela SIGTAP${procEscolhido.competencia ? ` · competência ${procEscolhido.competencia}` : ""}` : "catálogo do hospital"} · via {procEscolhido.via.toUpperCase()}</div>
                  </div>
                  <button onClick={() => { setProcedimentoCod(""); setBuscaProc(""); }} style={{ background: "transparent", color: "var(--text-3)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Trocar</button>
                </div>
              ) : semCatalogo ? (
                <div style={{ fontSize: 11.5, color: "#d97706", background: "#d9770614", border: "1px solid #d9770633", borderRadius: 6, padding: "8px 11px", lineHeight: 1.5 }}>{semCatalogo}</div>
              ) : (
                <>
                  <input value={buscaProc} onChange={e => setBuscaProc(e.target.value)} placeholder={`Buscar entre ${opcoesProc.length} procedimentos${viaProc ? ` de ${viaProc.toUpperCase()}` : ""}…`} style={inp} />
                  <div style={{ maxHeight: 168, overflowY: "auto", border: buscaProc ? "1px solid var(--border)" : "none", borderRadius: 6, marginTop: buscaProc ? 6 : 0 }}>
                    {buscaProc && opcoesFiltradas.length === 0 && <div style={{ fontSize: 11.5, color: "var(--text-muted)", padding: "8px 11px" }}>Nada encontrado para “{buscaProc}”.</div>}
                    {buscaProc && opcoesFiltradas.map(o => (
                      <button key={o.codigo} onClick={() => setProcedimentoCod(o.codigo)} style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", borderBottom: "1px solid var(--border)", padding: "7px 11px", cursor: "pointer", color: "var(--text-2)", fontSize: 12, fontFamily: "inherit" }}>
                        <strong style={{ fontFamily: "JetBrains Mono, monospace" }}>{o.codigo}</strong> — {o.nome}
                        {o.fonte === "sigtap" && <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 800, color: VX.azul, border: `1px solid ${VX.azul}55`, borderRadius: 99, padding: "0 6px" }}>SIGTAP</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div>
              <label style={lbl}>CID (opcional)</label>
              <input value={cid} onChange={e => setCid(e.target.value)} placeholder="Ex.: J18" style={inp} />
            </div>
            {aviso && (
              <div style={{ background: "#d9770618", border: "1px solid #d9770655", borderRadius: 7, padding: "8px 11px", marginTop: 10, fontSize: 11.5, color: "#d97706", lineHeight: 1.5 }}>
                {aviso.texto}
              </div>
            )}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>Observação (opcional)</label>
          <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex.: encaminhado com acompanhante" style={inp} />
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={salvar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Confirmar desfecho"}</button>
        </div>
      </div>
    </div>
  );
}

// Painel do atendimento médico no PS: evolução, prescrição, checagem e exames.
// abaInicial permite abrir direto na aba certa (a lista da enfermagem cai na Checagem).
function AtendimentoModal({ sb, sbCru, paciente, currentUser, onClose, onChanged, abaInicial }) {
  const [registros, setRegistros] = useState([]);
  const [aba, setAba] = useState(abaInicial || "evolucao"); // evolucao | prescricao | checagem | exames
  const [texto, setTexto] = useState("");
  const [gravando, setGravando] = useState(false);
  const [exForm, setExForm] = useState({ categoria: "laboratorial", nome: "" });
  const [evolCat, setEvolCat] = useState("medica");   // quem está evoluindo
  const [resultadoDe, setResultadoDe] = useState(null); // { id, texto }
  const [busy, setBusy] = useState(false);
  // Prescrição estruturada (Farmácia Fase B) + farmácia clínica (Fase 1)
  const [catalogo, setCatalogo] = useState([]);
  const [interacoes, setInteracoes] = useState([]);
  const [incompatY, setIncompatY] = useState([]);
  const [presItens, setPresItens] = useState([]);            // itens sendo montados
  const [presForm, setPresForm] = useState({ medId: "", dose_valor: "", dose_unidade: "mg", freqLabel: "8/8h (3x)", via: "VO", duracao: "", quantidade: "" });
  const [presObs, setPresObs] = useState("");
  const [presItensSalvos, setPresItensSalvos] = useState([]); // itens já assinados neste atendimento
  const [saidas, setSaidas] = useState([]);                   // dispensações deste atendimento
  const [adms, setAdms] = useState([]);                       // checagens de medicação deste atendimento
  const [checando, setChecando] = useState(null);             // item aberto para checar
  const [chkForm, setChkForm] = useState({ status: "administrado", motivo: "", observacao: "", categoria: "enfermagem", quando: "" });
  const [ctx, setCtx] = useState({ idade: paciente.idade ?? "", peso: paciente.peso ?? "", clearance_renal: paciente.clearance_renal ?? "", funcao_hepatica: paciente.funcao_hepatica ?? "", alergias: paciente.alergias ?? "", em_sonda: !!paciente.em_sonda, gestante: !!paciente.gestante, comorbidades: Array.isArray(paciente.comorbidades) ? paciente.comorbidades : [] });
  const [ctxAberto, setCtxAberto] = useState(false);
  const [ctxBusy, setCtxBusy] = useState(false);
  const [ctxMsg, setCtxMsg] = useState("");
  const catById = {}; catalogo.forEach(m => catById[m.id] = m);
  // Disponibilidade em estoque na hora de prescrever (não mostra saldo — só o
  // sinal: sem estoque / estoque baixo — e oferece similares que têm saldo).
  const [presLotes, setPresLotes] = useState([]);
  const [verSimilares, setVerSimilares] = useState(null);   // medicamento sem estoque
  const estoqueSinal = med => {
    if (!med) return null;
    const saldo = saldoDoMedicamento(med.id, presLotes);
    const min = Number(med.estoque_minimo || 0);
    if (saldo <= 0) return { key: "zerado", label: "SEM ESTOQUE", cor: "#f43f5e" };
    if (min > 0 && saldo <= min) return { key: "baixo", label: "estoque baixo", cor: "#d97706" };
    return null;                                            // com estoque: sem ruído na tela
  };
  // Similares COM saldo: mesmo princípio ativo primeiro, depois mesma classe
  const similaresComEstoque = med => {
    if (!med) return [];
    const pa = normTxt(med.principio_ativo);
    const temSaldo = m => saldoDoMedicamento(m.id, presLotes) > 0;
    const ativos = catalogo.filter(m => m.ativo !== false && m.id !== med.id && temSaldo(m));
    const mesmoPA = pa ? ativos.filter(m => normTxt(m.principio_ativo) === pa) : [];
    const mesmaClasse = ativos.filter(m => (m.classe || "") === (med.classe || "") && !mesmoPA.some(x => x.id === m.id));
    return [...mesmoPA.map(m => ({ m, motivo: "mesmo princípio ativo" })), ...mesmaClasse.map(m => ({ m, motivo: "mesma classe" }))].slice(0, 12);
  };
  const recRef = useRef(null);
  const suportaVoz = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 11px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  const carregarRegistros = () => loadPsRegistros(sb, paciente.id).then(setRegistros);
  const carregarPrescricao = () => { loadPsPrescricaoItens(sb, paciente.id).then(setPresItensSalvos); loadFarmSaidasByAtendimento(sb, paciente.id).then(setSaidas); loadPsAdministracoes(sb, paciente.id).then(setAdms); };
  useEffect(() => { carregarRegistros(); }, []);
  useEffect(() => { loadFarmMedicamentos(sb).then(setCatalogo); loadFarmLotes(sb).then(setPresLotes); loadFarmInteracoes(sb).then(setInteracoes); loadFarmIncompatY(sb).then(setIncompatY); carregarPrescricao(); }, []);
  useEffect(() => { setTexto(""); if (gravando) { recRef.current?.stop(); setGravando(false); } }, [aba]);

  function toggleVoz() {
    if (gravando) { recRef.current?.stop(); setGravando(false); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "pt-BR"; rec.continuous = true; rec.interimResults = false;
    rec.onresult = ev => { let novo = ""; for (let i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) novo += ev.results[i][0].transcript; if (novo) setTexto(t => (t ? t.trimEnd() + " " : "") + novo.trim()); };
    rec.onend = () => setGravando(false); rec.onerror = () => setGravando(false);
    recRef.current = rec; rec.start(); setGravando(true);
  }
  async function salvarTexto(tipo) {
    if (!texto.trim()) { alert("Escreva (ou dite) o texto."); return; }
    if (!confirm(`Salvar esta ${tipo === "evolucao" ? "evolução" : "prescrição"}? Ela NÃO poderá ser editada nem apagada depois (registro clínico).`)) return;
    setBusy(true);
    if (gravando) { recRef.current?.stop(); setGravando(false); }
    await addPsRegistroRemote(sb, { atendimento_id: paciente.id, tipo, categoria: tipo === "evolucao" ? evolCat : null, texto: texto.trim(), criado_em: nowISO() }, currentUser);
    registrarAuditoria(sb, currentUser, `PS: ${tipo === "evolucao" ? (PS_EVOL_CATEGORIAS[evolCat]?.label || "evolução") : "prescrição"}`, paciente.iniciais, {});
    setTexto(""); setBusy(false); carregarRegistros(); onChanged?.();
  }
  async function salvarContexto() {
    setCtxBusy(true); setCtxMsg("");
    const payload = { idade: ctx.idade === "" ? null : Number(ctx.idade), peso: ctx.peso === "" ? null : Number(ctx.peso), clearance_renal: ctx.clearance_renal === "" ? null : Number(ctx.clearance_renal), funcao_hepatica: ctx.funcao_hepatica || null, alergias: ctx.alergias?.trim() || null, em_sonda: !!ctx.em_sonda, gestante: !!ctx.gestante, comorbidades: Array.isArray(ctx.comorbidades) ? ctx.comorbidades : [] };
    const r = await patchPsAtendimentoDireto(sbCru, paciente.id, payload);
    setCtxBusy(false);
    if (!r.ok) { setCtxMsg("erro: " + (r.erro || "falha ao salvar")); return; }
    Object.assign(paciente, payload);           // reflete no episódio aberto
    setCtxMsg("✓ contexto salvo");
    setTimeout(() => setCtxMsg(""), 3000);
    onChanged?.();
  }
  function addItemPrescricao() {
    const med = catalogo.find(m => String(m.id) === String(presForm.medId));
    if (!med) { alert("Escolha um medicamento do catálogo."); return; }
    // Bloqueio por alergia / reatividade cruzada (permite override consciente)
    const al = checarAlergia(med, parseAlergias(ctx.alergias));
    if (al.match === "direta" && !confirm(`⚠ ALERGIA DECLARADA\n\nO paciente é alérgico a "${al.termo}"${al.grupo ? ` (${al.grupo})` : ""}.\n${med.nome} é CONTRAINDICADO.\n\nPrescrever mesmo assim, sob responsabilidade do prescritor?`)) return;
    if (al.match === "cruzada" && !confirm(`⚠ REATIVIDADE CRUZADA\n\nAlergia a "${al.termo}" pode reagir com ${med.nome} (${al.grupo}).\n\nPrescrever mesmo assim?`)) return;
    const fdia = freqDia(presForm.freqLabel);
    const doseTxt = [presForm.dose_valor && `${presForm.dose_valor} ${presForm.dose_unidade}`, presForm.freqLabel, presForm.duracao && `por ${presForm.duracao} dia(s)`].filter(Boolean).join(" · ");
    setPresItens(p => [...p, { medicamento_id: med.id, medicamento_nome: med.nome, unidade: med.unidade || null, dose: doseTxt || null, dose_valor: presForm.dose_valor ? Number(presForm.dose_valor) : null, dose_unidade: presForm.dose_unidade || null, frequencia_dia: fdia, duracao_dias: presForm.duracao ? Number(presForm.duracao) : null, via: presForm.via, quantidade: presForm.quantidade }]);
    setPresForm({ medId: "", dose_valor: "", dose_unidade: presForm.dose_unidade, freqLabel: presForm.freqLabel, via: presForm.via, duracao: "", quantidade: "" });
  }
  async function assinarPrescricao() {
    if (!presItens.length && !presObs.trim()) { alert("Adicione ao menos um medicamento à prescrição."); return; }
    // Aviso (não bloqueio): itens sem saldo não poderão ser dispensados pela farmácia
    const semEstoque = presItens.filter(it => estoqueSinal(catById[it.medicamento_id])?.key === "zerado");
    if (semEstoque.length && !confirm(
      `⚠ SEM ESTOQUE NA FARMÁCIA\n\n${semEstoque.map(it => `• ${it.medicamento_nome}`).join("\n")}\n\n` +
      `A farmácia não vai conseguir dispensar ${semEstoque.length === 1 ? "este item" : "estes itens"} agora.\n` +
      `Assinar mesmo assim?`
    )) return;
    if (!confirm("Assinar esta prescrição? Ela NÃO poderá ser editada nem apagada depois (registro clínico).")) return;
    setBusy(true);
    const linhas = presItens.map(it => `• ${it.medicamento_nome}${it.dose ? " — " + it.dose : ""}${it.via ? " (" + it.via + ")" : ""}${it.quantidade ? " — qtd " + farmFmtQtd(it.quantidade) + (it.unidade ? " " + it.unidade : "") : ""}`);
    const texto = (linhas.join("\n") + (presObs.trim() ? `\nObs.: ${presObs.trim()}` : "")).trim();
    const regRows = await addPsRegistroRemote(sb, { atendimento_id: paciente.id, tipo: "prescricao", texto, criado_em: nowISO() }, currentUser);
    const registroId = Array.isArray(regRows) ? regRows[0]?.id : null;
    if (presItens.length) {
      const itens = presItens.map(it => ({ atendimento_id: paciente.id, registro_id: registroId, medicamento_id: it.medicamento_id || null, medicamento_nome: it.medicamento_nome, unidade: it.unidade || null, dose: it.dose || null, dose_valor: it.dose_valor ?? null, dose_unidade: it.dose_unidade || null, frequencia_dia: it.frequencia_dia ?? null, duracao_dias: it.duracao_dias ?? null, via: it.via || null, quantidade: it.quantidade ? Number(it.quantidade) : null }));
      await addPsPrescricaoItens(sb, itens, currentUser);
    }
    registrarAuditoria(sb, currentUser, "PS: prescrição", `${paciente.iniciais} · ${presItens.length} item(ns)`, {});
    setPresItens([]); setPresObs(""); setBusy(false);
    carregarRegistros(); carregarPrescricao(); onChanged?.();
  }
  const dispensadoDoItem = itemId => saidas.filter(s => s.prescricao_item_id === itemId).reduce((a, s) => a + Number(s.quantidade || 0), 0);
  // Item ainda sem nenhuma checagem (nem administrado, nem justificado)
  const semChecagem = it => !adms.some(a => String(a.prescricao_item_id) === String(it.id));
  // A farmácia entregou e ninguém registrou o que foi feito com o medicamento
  const itensPendentesChecagem = presItensSalvos.filter(it => dispensadoDoItem(it.id) > 0 && semChecagem(it));
  // Abre a checagem de um item. A hora vem preenchida com agora, mas é editável:
  // à beira do leito a enfermagem administra primeiro e registra depois.
  function abrirChecagem(it) {
    setChecando(it);
    setChkForm(f => ({ status: "administrado", motivo: "", observacao: "", categoria: f.categoria || "enfermagem", quando: isoToLocal(nowISO()) }));
  }
  async function confirmarChecagem() {
    const it = checando;
    if (!it) return;
    if (chkForm.status === "nao_administrado" && !chkForm.motivo) { alert("Informe o motivo de a dose não ter sido administrada."); return; }
    const quandoIso = chkForm.quando ? localToIso(chkForm.quando) : nowISO();
    if (new Date(quandoIso) > new Date()) { alert("A hora da administração não pode estar no futuro."); return; }
    const rotulo = chkForm.status === "administrado" ? "administrado" : "NÃO administrado";
    if (!confirm(`Registrar ${it.medicamento_nome} como ${rotulo} em ${horaFmt(quandoIso)}?\n\nÉ um registro clínico: NÃO poderá ser editado nem apagado depois.`)) return;
    setBusy(true);
    await addPsAdministracao(sb, {
      atendimento_id: paciente.id, prescricao_item_id: it.id, medicamento_id: it.medicamento_id || null,
      medicamento_nome: it.medicamento_nome, dose: it.dose || null, via: it.via || null,
      status: chkForm.status, motivo: chkForm.status === "nao_administrado" ? chkForm.motivo : null,
      observacao: chkForm.observacao.trim() || null, categoria: chkForm.categoria, administrado_em: quandoIso,
    }, currentUser);
    registrarAuditoria(sb, currentUser, `PS: checagem de medicação (${rotulo})`, `${paciente.iniciais} · ${it.medicamento_nome}`, {});
    setChecando(null); setBusy(false);
    loadPsAdministracoes(sb, paciente.id).then(setAdms);
    onChanged?.();
  }
  async function solicitarExame() {
    if (!exForm.nome.trim()) { alert("Informe o nome do exame."); return; }
    setBusy(true);
    await addPsRegistroRemote(sb, { atendimento_id: paciente.id, tipo: "exame", categoria: exForm.categoria, texto: exForm.nome.trim(), status: "solicitado", criado_em: nowISO() }, currentUser);
    registrarAuditoria(sb, currentUser, "PS: solicitar exame", `${paciente.iniciais} · ${exForm.nome.trim()}`, {});
    setExForm(p => ({ ...p, nome: "" })); setBusy(false); carregarRegistros(); onChanged?.();
  }
  async function lancarResultado() {
    if (!resultadoDe?.texto?.trim()) { alert("Cole ou descreva o resultado."); return; }
    await updatePsRegistroRemote(sb, resultadoDe.id, { status: "resultado_disponivel", resultado: resultadoDe.texto.trim(), resultado_em: nowISO() });
    registrarAuditoria(sb, currentUser, "PS: resultado de exame", paciente.iniciais, {});
    setResultadoDe(null); carregarRegistros(); onChanged?.();
  }
  async function marcarVisto(reg) {
    await updatePsRegistroRemote(sb, reg.id, { status: "visto" });
    registrarAuditoria(sb, currentUser, "PS: exame visto", `${paciente.iniciais} · ${reg.texto}`, {});
    carregarRegistros(); onChanged?.();
  }

  const evolucoes = registros.filter(r => r.tipo === "evolucao");
  const prescricoes = registros.filter(r => r.tipo === "prescricao");
  const exames = registros.filter(r => r.tipo === "exame");
  const alertasClinicos = analisarPrescricaoClinica([...presItensSalvos, ...presItens], ctx, catById, interacoes, incompatY);
  const abaBtn = ativo => ({ background: ativo ? "#22d3ee" : "transparent", color: ativo ? "#000" : "var(--text-3)", border: `1px solid ${ativo ? "#22d3ee" : "var(--border)"}`, borderRadius: 7, padding: "7px 14px", fontWeight: 700, cursor: "pointer", fontSize: 12.5 });
  const EX_STATUS = { solicitado: { label: "Aguardando resultado", cor: "#d97706" }, resultado_disponivel: { label: "Resultado disponível", cor: "#3b82f6" }, visto: { label: "Visto pelo médico", cor: "#34d399" } };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 700, maxWidth: "96vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>Atendimento — {paciente.iniciais}{paciente.prontuario ? ` · reg. ${paciente.prontuario}` : ""}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
          {paciente.queixa || "Sem queixa registrada"}
          {paciente.classificacao && MANCHESTER[paciente.classificacao] ? <> · <span style={{ color: MANCHESTER[paciente.classificacao].cor, fontWeight: 700 }}>{MANCHESTER[paciente.classificacao].label}</span></> : ""}
          {paciente.atendimento_em ? ` · em atendimento há ${fmtDur(diffMin(paciente.atendimento_em, nowISO()))}` : ""}
        </div>
        {fmtSinaisVitais(paciente) && <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "JetBrains Mono, monospace", marginBottom: 12 }}>{fmtSinaisVitais(paciente)}</div>}

        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <button onClick={() => setAba("evolucao")} style={abaBtn(aba === "evolucao")}>Evoluções ({evolucoes.length})</button>
          <button onClick={() => setAba("prescricao")} style={abaBtn(aba === "prescricao")}>Prescrição ({prescricoes.length})</button>
          <button onClick={() => setAba("checagem")} style={abaBtn(aba === "checagem")}>
            Checagem ({adms.length})
            {itensPendentesChecagem.length > 0 && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: aba === "checagem" ? "#000" : "#d97706" }}>● {itensPendentesChecagem.length} a checar</span>}
          </button>
          <button onClick={() => setAba("exames")} style={abaBtn(aba === "exames")}>Exames ({exames.length})</button>
        </div>

        {aba === "evolucao" && (
          <>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, marginBottom: 5 }}>Quem está registrando</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Object.entries(PS_EVOL_CATEGORIAS).map(([k, v]) => (
                  <button key={k} onClick={() => setEvolCat(k)}
                    style={{ background: evolCat === k ? v.cor : "transparent", color: evolCat === k ? "#fff" : "var(--text-3)", border: `1px solid ${evolCat === k ? v.cor : "var(--border)"}`, borderRadius: 99, padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{v.curto}</button>
                ))}
              </div>
            </div>
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={5} placeholder={`Escreva a ${(PS_EVOL_CATEGORIAS[evolCat]?.label || "evolução").toLowerCase()} — ou clique em Ditar e fale.`} style={{ ...inp, resize: "vertical", lineHeight: 1.55, marginBottom: 8 }} />
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
              {suportaVoz && <button onClick={toggleVoz} style={{ background: gravando ? "#f43f5e" : "transparent", color: gravando ? "#fff" : "var(--text-2)", border: `1px solid ${gravando ? "#f43f5e" : "var(--border-2)"}`, borderRadius: 6, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{gravando ? "● Gravando… (parar)" : "Ditar por voz"}</button>}
              <button onClick={() => salvarTexto("evolucao")} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13, marginLeft: "auto" }}>{busy ? "…" : "Salvar evolução"}</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {evolucoes.map(r => { const ec = PS_EVOL_CATEGORIAS[r.categoria] || PS_EVOL_CATEGORIAS.medica; return (
                <div key={r.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: `3px solid ${ec.cor}`, borderRadius: 8, padding: "10px 13px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 9.5, fontWeight: 800, color: ec.cor, border: `1px solid ${ec.cor}55`, borderRadius: 99, padding: "0 7px", textTransform: "uppercase" }}>{ec.curto}</span>
                    <span style={{ fontSize: 10.5, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{horaFmt(r.criado_em)} · {r.usuario || "?"}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{r.texto}</div>
                </div>
              ); })}
              {evolucoes.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>Nenhum registro ainda.</div>}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 10 }}>Registros assinados com data/hora e imutáveis (não podem ser editados nem apagados).</div>
          </>
        )}

        {aba === "prescricao" && (
          <>
            {/* Contexto clínico do paciente (alimenta os alertas) */}
            <div style={{ border: "1px solid var(--border)", borderRadius: 9, marginBottom: 12 }}>
              <button onClick={() => setCtxAberto(a => !a)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", padding: "10px 13px", cursor: "pointer", color: "var(--text-2)", textAlign: "left" }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Contexto clínico</span>
                <span style={{ fontSize: 11.5, color: "var(--text-muted)", flex: 1 }}>{[ctx.idade !== "" ? `${ctx.idade} anos` : null, ctx.peso !== "" ? `${ctx.peso} kg` : null, ctx.clearance_renal !== "" ? `ClCr ${ctx.clearance_renal}` : null, ctx.em_sonda ? "sonda" : null, ctx.gestante ? "gestante" : null, ctx.alergias ? `alergia: ${ctx.alergias}` : null].filter(Boolean).join(" · ") || "não informado — informe para habilitar os alertas"}</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{ctxAberto ? "▾" : "▸"}</span>
              </button>
              {ctxAberto && (
                <div style={{ padding: "0 13px 12px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 8 }}>
                    <div><label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Idade (anos)</label><input type="number" min="0" value={ctx.idade} onChange={e => setCtx(p => ({ ...p, idade: e.target.value }))} style={{ ...inp, padding: "7px 9px" }} /></div>
                    <div><label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Peso (kg)</label><input type="number" min="0" step="any" value={ctx.peso} onChange={e => setCtx(p => ({ ...p, peso: e.target.value }))} style={{ ...inp, padding: "7px 9px" }} /></div>
                    <div><label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>ClCr / TFG (opcional)</label><input type="number" min="0" step="any" value={ctx.clearance_renal} onChange={e => setCtx(p => ({ ...p, clearance_renal: e.target.value }))} style={{ ...inp, padding: "7px 9px" }} /></div>
                    <div><label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Função hepática</label><select value={ctx.funcao_hepatica} onChange={e => setCtx(p => ({ ...p, funcao_hepatica: e.target.value }))} style={{ ...inp, padding: "7px 9px" }}><option value="">—</option><option value="normal">Normal</option><option value="leve">Leve</option><option value="moderada">Moderada</option><option value="grave">Grave</option></select></div>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 4 }}>Comorbidades</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {COMORBIDADES.map(c => { const on = (ctx.comorbidades || []).includes(c.chave); return (
                        <button key={c.chave} type="button" onClick={() => setCtx(p => ({ ...p, comorbidades: on ? (p.comorbidades || []).filter(x => x !== c.chave) : [...(p.comorbidades || []), c.chave] }))} style={{ background: on ? "#22d3ee22" : "transparent", color: on ? "#22d3ee" : "var(--text-3)", border: `1px solid ${on ? "#22d3ee" : "var(--border-2)"}`, borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: on ? 700 : 500, cursor: "pointer" }}>{on ? "✓ " : ""}{c.label}</button>
                      ); })}
                    </div>
                  </div>
                  <div style={{ marginBottom: 8 }}><label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Alergias</label><input value={ctx.alergias} onChange={e => setCtx(p => ({ ...p, alergias: e.target.value }))} placeholder="Ex.: penicilina, dipirona" style={{ ...inp, padding: "7px 9px" }} /></div>
                  <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--text-2)", cursor: "pointer" }}><input type="checkbox" checked={ctx.em_sonda} onChange={e => setCtx(p => ({ ...p, em_sonda: e.target.checked }))} style={{ accentColor: "#d97706", width: 15, height: 15 }} /> Em uso de sonda</label>
                    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--text-2)", cursor: "pointer" }}><input type="checkbox" checked={ctx.gestante} onChange={e => setCtx(p => ({ ...p, gestante: e.target.checked }))} style={{ accentColor: "#e11d48", width: 15, height: 15 }} /> Gestante</label>
                    {ctxMsg && <span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 700, color: ctxMsg.startsWith("erro") ? "#f43f5e" : "#34d399" }}>{ctxMsg}</span>}
                    <button onClick={salvarContexto} disabled={ctxBusy} style={{ marginLeft: ctxMsg ? 8 : "auto", background: "transparent", color: "#22d3ee", border: "1px solid #22d3ee88", borderRadius: 6, padding: "7px 14px", fontWeight: 700, cursor: "pointer", fontSize: 12.5 }}>{ctxBusy ? "…" : "Salvar contexto"}</button>
                  </div>
                </div>
              )}
            </div>

            {ctx.alergias && ctx.alergias.trim() && (
              <div style={{ background: "#f43f5e14", border: "1px solid #f43f5e66", borderLeft: "4px solid #f43f5e", borderRadius: 8, padding: "9px 13px", marginBottom: 12, fontSize: 12.5, color: "var(--text)", fontWeight: 600 }}>
                ⚠ Paciente alérgico a <strong style={{ color: "#f43f5e" }}>{ctx.alergias}</strong> — não prescrever os compostos relacionados.
              </div>
            )}

            {/* Construtor de prescrição estruturada */}
            <div style={{ border: "1px solid var(--border)", borderRadius: 9, padding: "12px 13px", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", marginBottom: 10 }}>Nova prescrição</div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Medicamento</label>
                <select value={presForm.medId} onChange={e => setPresForm(p => ({ ...p, medId: e.target.value }))} style={{ ...inp, padding: "8px 9px" }}>
                  <option value="">Escolha…</option>
                  {FARM_CLASSES.filter(c => catalogo.some(m => (m.classe || "Outros") === c && m.ativo !== false)).map(c => (
                    <optgroup key={c} label={c}>
                      {catalogo.filter(m => (m.classe || "Outros") === c && m.ativo !== false).map(m => { const sg = estoqueSinal(m); return <option key={m.id} value={m.id}>{m.nome}{sg ? ` — ${sg.label}` : ""}</option>; })}
                    </optgroup>
                  ))}
                </select>
                {/* Situação de estoque do item escolhido — sem mostrar o saldo */}
                {(() => {
                  const medSel = catById[presForm.medId];
                  const sg = estoqueSinal(medSel);
                  if (!medSel || !sg) return null;
                  const sims = sg.key === "zerado" ? similaresComEstoque(medSel) : [];
                  return (
                    <div style={{ marginTop: 6, background: sg.cor + "14", border: `1px solid ${sg.cor}55`, borderRadius: 7, padding: "7px 10px", fontSize: 12, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <strong style={{ color: sg.cor }}>{sg.label}</strong>
                      <span>{sg.key === "zerado" ? "a farmácia não conseguirá dispensar." : "pode faltar antes do fim do tratamento."}</span>
                      {sg.key === "zerado" && <button onClick={() => setVerSimilares(medSel)} style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${VX.azul}66`, color: VX.azul, borderRadius: 6, padding: "4px 10px", fontWeight: 700, cursor: "pointer", fontSize: 11.5 }}>Ver similares{sims.length ? ` (${sims.length})` : ""}</button>}
                    </div>
                  );
                })()}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 10 }}>
                <div style={{ flex: "0 1 80px", minWidth: 70 }}>
                  <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Dose</label>
                  <input type="number" min="0" step="any" value={presForm.dose_valor} onChange={e => setPresForm(p => ({ ...p, dose_valor: e.target.value }))} placeholder="500" style={{ ...inp, padding: "8px 9px" }} />
                </div>
                <div style={{ flex: "0 1 92px", minWidth: 80 }}>
                  <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Unid.</label>
                  <select value={presForm.dose_unidade} onChange={e => setPresForm(p => ({ ...p, dose_unidade: e.target.value }))} style={{ ...inp, padding: "8px 9px" }}>{PS_DOSE_UNID.map(u => <option key={u} value={u}>{u}</option>)}</select>
                </div>
                <div style={{ flex: "1 1 110px", minWidth: 100 }}>
                  <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Frequência</label>
                  <select value={presForm.freqLabel} onChange={e => setPresForm(p => ({ ...p, freqLabel: e.target.value }))} style={{ ...inp, padding: "8px 9px" }}>{PS_FREQUENCIAS.map(f => <option key={f.label} value={f.label}>{f.label}</option>)}</select>
                </div>
                <div style={{ flex: "0 1 78px", minWidth: 68 }}>
                  <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Via</label>
                  <select value={presForm.via} onChange={e => setPresForm(p => ({ ...p, via: e.target.value }))} style={{ ...inp, padding: "8px 9px" }}>{PS_VIAS.map(v => <option key={v} value={v}>{v}</option>)}</select>
                </div>
                <div style={{ flex: "0 1 70px", minWidth: 62 }}>
                  <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Dias</label>
                  <input type="number" min="0" step="any" value={presForm.duracao} onChange={e => setPresForm(p => ({ ...p, duracao: e.target.value }))} placeholder="—" style={{ ...inp, padding: "8px 9px" }} />
                </div>
                <div style={{ flex: "0 1 70px", minWidth: 62 }}>
                  <label style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>Qtd</label>
                  <input type="number" min="0" step="any" value={presForm.quantidade} onChange={e => setPresForm(p => ({ ...p, quantidade: e.target.value }))} placeholder="0" style={{ ...inp, padding: "8px 9px" }} />
                </div>
                <button onClick={addItemPrescricao} style={{ background: "transparent", color: "#22d3ee", border: "1px solid #22d3ee88", borderRadius: 6, padding: "9px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Adicionar</button>
              </div>
              {presItens.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 10 }}>
                  {presItens.map((it, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "7px 11px", fontSize: 12.5 }}>
                      <span style={{ flex: 1 }}><strong>{it.medicamento_nome}</strong>{it.dose ? ` — ${it.dose}` : ""} <span style={{ color: "var(--text-muted)" }}>{it.via}{it.quantidade ? ` · qtd ${farmFmtQtd(it.quantidade)} ${it.unidade || ""}` : ""}</span>
                        {(() => { const sg = estoqueSinal(catById[it.medicamento_id]); return sg ? <span style={{ fontSize: 9.5, fontWeight: 800, color: sg.cor, border: `1px solid ${sg.cor}66`, borderRadius: 99, padding: "0 6px", marginLeft: 6, whiteSpace: "nowrap" }}>{sg.label}</span> : null; })()}
                      </span>
                      {estoqueSinal(catById[it.medicamento_id])?.key === "zerado" && <button onClick={() => setVerSimilares(catById[it.medicamento_id])} style={{ background: "transparent", border: `1px solid ${VX.azul}66`, color: VX.azul, borderRadius: 6, padding: "2px 8px", fontWeight: 700, cursor: "pointer", fontSize: 11 }}>similares</button>}
                      <button onClick={() => setPresItens(p => p.filter((_, j) => j !== i))} style={{ background: "transparent", border: "none", color: "#f43f5e", cursor: "pointer", fontSize: 15, lineHeight: 1 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              <textarea value={presObs} onChange={e => setPresObs(e.target.value)} rows={2} placeholder="Observações / cuidados (opcional)" style={{ ...inp, resize: "vertical", marginBottom: 10 }} />
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button onClick={assinarPrescricao} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Assinar prescrição"}</button>
              </div>

              {/* Similares com estoque — troca na hora */}
              {verSimilares && (() => {
                const sims = similaresComEstoque(verSimilares);
                return (
                  <div onClick={() => setVerSimilares(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
                    <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 520, maxWidth: "94vw", maxHeight: "88vh", overflowY: "auto" }}>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>Similares com estoque</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
                        <strong style={{ color: "#f43f5e" }}>{verSimilares.nome}</strong> está sem estoque. Estes têm saldo na farmácia — clique para usar no lugar. <em>A equivalência terapêutica é decisão sua.</em>
                      </div>
                      {sims.length === 0 ? (
                        <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "1.5rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Nenhum similar com estoque (mesmo princípio ativo ou mesma classe). Fale com a farmácia.</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {sims.map(({ m, motivo }) => (
                            <button key={m.id} onClick={() => { setPresForm(p => ({ ...p, medId: String(m.id) })); setVerSimilares(null); }}
                              style={{ textAlign: "left", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>{m.nome}</div>
                                <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{motivo}{m.principio_ativo ? ` · ${m.principio_ativo}` : ""}</div>
                              </div>
                              <span style={{ fontSize: 11, color: VX.azul, fontWeight: 700, whiteSpace: "nowrap" }}>usar este →</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                        <button onClick={() => setVerSimilares(null)} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Fechar</button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Alertas de farmácia clínica */}
            {alertasClinicos.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 7 }}>Alertas de farmácia clínica ({alertasClinicos.length})</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {alertasClinicos.map((a, i) => (
                    <div key={i} style={{ background: FARM_GRAV[a.gravidade].cor + "11", border: `1px solid ${FARM_GRAV[a.gravidade].cor}55`, borderLeft: `4px solid ${FARM_GRAV[a.gravidade].cor}`, borderRadius: 8, padding: "8px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 9.5, fontWeight: 800, color: FARM_GRAV[a.gravidade].cor, border: `1px solid ${FARM_GRAV[a.gravidade].cor}66`, borderRadius: 99, padding: "0 6px", textTransform: "uppercase" }}>{FARM_GRAV[a.gravidade].label}</span>
                        <strong style={{ fontSize: 12.5, color: "var(--text)" }}>{a.titulo}</strong>
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 3, lineHeight: 1.45 }}>{a.detalhe}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>Apoio à decisão — revise clinicamente. Base sujeita a validação da equipe de farmácia.</div>
              </div>
            )}

            {/* Prescrições assinadas */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {prescricoes.map(r => {
                const itens = presItensSalvos.filter(i => i.registro_id === r.id);
                return (
                  <div key={r.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 13px" }}>
                    <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace", marginBottom: 6 }}>{horaFmt(r.criado_em)} · {r.usuario || "?"}</div>
                    {itens.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {itens.map(it => {
                          const disp = dispensadoDoItem(it.id);
                          const qtd = Number(it.quantidade || 0);
                          const st = qtd <= 0 ? null : disp >= qtd ? { c: "#34d399", t: "dispensado" } : disp > 0 ? { c: "#d97706", t: `parcial ${farmFmtQtd(disp)}/${farmFmtQtd(qtd)}` } : { c: "#8d99ab", t: "pendente" };
                          return (
                            <div key={it.id} style={{ fontSize: 12.5, color: "var(--text-2)", display: "flex", gap: 8, alignItems: "baseline" }}>
                              <span style={{ flex: 1 }}>• <strong>{it.medicamento_nome}</strong>{it.dose ? ` — ${it.dose}` : ""} <span style={{ color: "var(--text-muted)" }}>{it.via}{qtd ? ` · qtd ${farmFmtQtd(qtd)} ${it.unidade || ""}` : ""}</span></span>
                              {st && <span style={{ fontSize: 10.5, color: st.c, fontWeight: 700, whiteSpace: "nowrap" }}>{st.t}</span>}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{r.texto}</div>
                    )}
                  </div>
                );
              })}
              {prescricoes.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>Nenhuma prescrição assinada ainda.</div>}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 10 }}>Prescrições são assinadas com data/hora e imutáveis. A dispensação (baixa de estoque) é feita na Farmácia; o registro de que o paciente recebeu fica na aba <strong>Checagem</strong>.</div>
          </>
        )}

        {aba === "checagem" && (
          <>
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 13px", marginBottom: 12, fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.55 }}>
              <strong>Dispensado</strong> significa que o medicamento saiu da farmácia. <strong>Checado</strong> significa que ele foi administrado ao paciente — com hora e responsável. São coisas diferentes: só a checagem fecha o ciclo.
            </div>

            {presItensSalvos.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "1.5rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Nenhum medicamento prescrito neste atendimento.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {presItensSalvos.map(it => {
                  const qtd = Number(it.quantidade || 0);
                  const disp = dispensadoDoItem(it.id);
                  const dadas = psDosesDadas(it.id, adms);
                  const previstas = Number(it.frequencia_dia || 0);
                  const naoDadas = adms.filter(a => String(a.prescricao_item_id) === String(it.id) && a.status === "nao_administrado").length;
                  const dispSt = qtd <= 0 ? (disp > 0 ? { c: "#34d399", t: "dispensado" } : { c: "#8d99ab", t: "sem dispensação" })
                    : disp >= qtd ? { c: "#34d399", t: "dispensado" } : disp > 0 ? { c: "#d97706", t: `dispensado parcial ${farmFmtQtd(disp)}/${farmFmtQtd(qtd)}` } : { c: "#8d99ab", t: "não dispensado" };
                  const pendente = disp > 0 && semChecagem(it);
                  const aberto = checando?.id === it.id;
                  return (
                    <div key={it.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: `3px solid ${pendente ? "#d97706" : dadas > 0 ? "#34d399" : "var(--border-2)"}`, borderRadius: 8, padding: "10px 13px" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                        <span style={{ flex: 1, fontSize: 13, color: "var(--text)", minWidth: 180 }}>
                          <strong>{it.medicamento_nome}</strong>{it.dose ? ` — ${it.dose}` : ""} <span style={{ color: "var(--text-muted)" }}>{it.via || ""}</span>
                        </span>
                        <span style={{ fontSize: 10.5, color: dispSt.c, fontWeight: 700, whiteSpace: "nowrap" }}>{dispSt.t}</span>
                        {!aberto && <button onClick={() => abrirChecagem(it)} style={btnContorno(pendente ? "#d97706" : "#22d3ee")}>Checar</button>}
                        {aberto && <button onClick={() => setChecando(null)} style={btnContorno("#8d99ab")}>Fechar</button>}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ color: dadas > 0 ? "#34d399" : "var(--text-muted)", fontWeight: dadas > 0 ? 700 : 500 }}>
                          {dadas} dose(s) administrada(s){previstas > 0 ? ` de ${previstas} previstas por dia` : ""}
                        </span>
                        {naoDadas > 0 && <span style={{ color: "#f43f5e", fontWeight: 700 }}>{naoDadas} não administrada(s)</span>}
                        {pendente && <span style={{ color: "#d97706", fontWeight: 700 }}>aguardando checagem</span>}
                      </div>

                      {aberto && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                          <div style={{ display: "flex", gap: 6, marginBottom: 9, flexWrap: "wrap" }}>
                            {Object.entries(PS_ADM_STATUS).map(([k, v]) => (
                              <button key={k} onClick={() => setChkForm(f => ({ ...f, status: k, motivo: k === "administrado" ? "" : f.motivo }))}
                                style={{ background: chkForm.status === k ? v.cor : "transparent", color: chkForm.status === k ? "#000" : "var(--text-3)", border: `1px solid ${chkForm.status === k ? v.cor : "var(--border)"}`, borderRadius: 99, padding: "5px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{v.label}</button>
                            ))}
                          </div>

                          {chkForm.status === "nao_administrado" && (
                            <div style={{ marginBottom: 9 }}>
                              <div style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, marginBottom: 4 }}>Motivo (obrigatório)</div>
                              <select value={chkForm.motivo} onChange={e => setChkForm(f => ({ ...f, motivo: e.target.value }))} style={inp}>
                                <option value="">Selecione o motivo…</option>
                                {PS_ADM_MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
                              </select>
                            </div>
                          )}

                          <div style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, marginBottom: 4 }}>Quem administrou</div>
                          <div style={{ display: "flex", gap: 6, marginBottom: 9, flexWrap: "wrap" }}>
                            {Object.entries(PS_ADM_CATEGORIAS).map(([k, v]) => (
                              <button key={k} onClick={() => setChkForm(f => ({ ...f, categoria: k }))}
                                style={{ background: chkForm.categoria === k ? v.cor : "transparent", color: chkForm.categoria === k ? "#fff" : "var(--text-3)", border: `1px solid ${chkForm.categoria === k ? v.cor : "var(--border)"}`, borderRadius: 99, padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{v.curto}</button>
                            ))}
                          </div>

                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 9 }}>
                            <div style={{ flex: "1 1 200px" }}>
                              <div style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, marginBottom: 4 }}>Hora da administração</div>
                              <input type="datetime-local" value={chkForm.quando} onChange={e => setChkForm(f => ({ ...f, quando: e.target.value }))} style={inp} />
                            </div>
                            <div style={{ flex: "2 1 260px" }}>
                              <div style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, marginBottom: 4 }}>Observação (opcional)</div>
                              <input value={chkForm.observacao} onChange={e => setChkForm(f => ({ ...f, observacao: e.target.value }))} placeholder="Ex.: reação no local, dose fracionada…" style={inp} />
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>Registro permanente, assinado como <strong>{currentUser?.name || "—"}</strong>.</span>
                            <button onClick={confirmarChecagem} disabled={busy} style={{ marginLeft: "auto", background: chkForm.status === "administrado" ? "#34d399" : "#f43f5e", color: chkForm.status === "administrado" ? "#000" : "#fff", border: "none", borderRadius: 6, padding: "8px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Confirmar checagem"}</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".04em", margin: "16px 0 8px" }}>Histórico de administrações</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {adms.map(a => { const st = PS_ADM_STATUS[a.status] || PS_ADM_STATUS.administrado; const cat = PS_ADM_CATEGORIAS[a.categoria] || PS_ADM_CATEGORIAS.outro; return (
                <div key={a.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: `3px solid ${st.cor}`, borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 9.5, fontWeight: 800, color: st.cor, border: `1px solid ${st.cor}55`, borderRadius: 99, padding: "0 7px", textTransform: "uppercase" }}>{st.label}</span>
                    <strong style={{ fontSize: 12.5, color: "var(--text)" }}>{a.medicamento_nome}</strong>
                    {a.dose && <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>{a.dose}</span>}
                    {a.via && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{a.via}</span>}
                    <span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{horaFmt(a.administrado_em)} · {cat.curto} · {a.usuario || "?"}</span>
                  </div>
                  {(a.motivo || a.observacao) && (
                    <div style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 3 }}>
                      {a.motivo ? <span style={{ color: "#f43f5e", fontWeight: 600 }}>{a.motivo}</span> : null}{a.motivo && a.observacao ? " · " : ""}{a.observacao || ""}
                    </div>
                  )}
                </div>
              ); })}
              {adms.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>Nenhuma medicação checada ainda.</div>}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 10 }}>A checagem é um registro clínico append-only: cada dose fica gravada com hora, categoria profissional e responsável. Não pode ser editada nem apagada.</div>
          </>
        )}

        {aba === "exames" && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              <select value={exForm.categoria} onChange={e => setExForm(p => ({ ...p, categoria: e.target.value }))} style={{ ...inp, width: 150 }}>
                {Object.entries(PS_EXAME_CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input value={exForm.nome} onChange={e => setExForm(p => ({ ...p, nome: e.target.value }))} onKeyDown={e => e.key === "Enter" && solicitarExame()} placeholder="Ex.: Hemograma completo, RX de tórax PA…" style={{ ...inp, flex: 1, minWidth: 200 }} />
              <button onClick={solicitarExame} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "+ Solicitar"}</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {exames.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>Nenhum exame solicitado.</div>}
              {exames.map(r => {
                const st = EX_STATUS[r.status] || EX_STATUS.solicitado;
                return (
                  <div key={r.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: `4px solid ${st.cor}`, borderRadius: 8, padding: "10px 13px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <strong style={{ fontSize: 13 }}>{r.texto}</strong>
                      <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{PS_EXAME_CATEGORIAS[r.categoria] || r.categoria}</span>
                      <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: st.cor }}>{st.label}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace", marginTop: 2 }}>Solicitado {horaFmt(r.criado_em)}{r.resultado_em ? ` · resultado ${horaFmt(r.resultado_em)}` : ""}</div>
                    {r.resultado && <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.55, whiteSpace: "pre-wrap", marginTop: 6, background: "var(--input-bg)", borderRadius: 6, padding: "8px 10px" }}>{r.resultado}</div>}
                    {resultadoDe?.id === r.id ? (
                      <div style={{ marginTop: 8 }}>
                        <textarea value={resultadoDe.texto} onChange={e => setResultadoDe(p => ({ ...p, texto: e.target.value }))} rows={3} placeholder="Cole ou descreva o resultado do exame." style={{ ...inp, resize: "vertical", lineHeight: 1.5, marginBottom: 6 }} />
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button onClick={() => setResultadoDe(null)} style={btnContorno("var(--text-muted)")}>Cancelar</button>
                          <button onClick={lancarResultado} style={btnContorno("#3b82f6")}>Salvar resultado</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        {r.status === "solicitado" && <button onClick={() => setResultadoDe({ id: r.id, texto: "" })} style={btnContorno("#3b82f6")}>Lançar resultado</button>}
                        {r.status === "resultado_disponivel" && <button onClick={() => marcarVisto(r)} style={btnContorno("#34d399")}>Marcar como visto</button>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// Modal de triagem/reavaliação: sinais vitais → sugestão de Manchester → decisão da triadora
function TriagemModal({ sb, paciente, onClose, onTriar, reavaliacao = false, faixasPediatricas = [], faixasObstetricas = [] }) {
  const [v, setV] = useState({ pa_sist: "", pa_diast: "", fc: "", fr: "", spo2: "", temp: "", dor: "", consciencia: "A", glicemia: "" });
  const [busy, setBusy] = useState(false);
  // Idade vinda do cadastro. Guarda o objeto inteiro (`{ meses, exata }`),
  // não só o número de anos: a triagem pediátrica precisa saber se a idade
  // é EXATA (veio da data de nascimento) ou aproximada (só do ano) —
  // sugerir faixa de sinal vital com base em chute é o que não pode.
  const [idadeInfo, setIdadeInfo] = useState({ meses: null, exata: false, rotulo: null });
  const idade = idadeInfo.meses != null ? Math.floor(idadeInfo.meses / 12) : null;
  const [historico, setHistorico] = useState([]); // aferições anteriores (reavaliação)
  const [comorb, setComorb] = useState(Array.isArray(paciente.comorbidades) ? paciente.comorbidades : []);
  const set = (k, val) => setV(p => ({ ...p, [k]: val }));
  const toggleComorb = k => setComorb(cs => cs.includes(k) ? cs.filter(x => x !== k) : [...cs, k]);
  const [tipo, setTipo] = useState(paciente.triagem_tipo || "adulto");
  const [obst, setObst] = useState(paciente.obstetricia && typeof paciente.obstetricia === "object" ? paciente.obstetricia : {});
  const [ped, setPed] = useState(paciente.pediatria && typeof paciente.pediatria === "object" ? paciente.pediatria : {});
  const setO = (k, val) => setObst(p => ({ ...p, [k]: val }));
  const setP = (k, val) => setPed(p => ({ ...p, [k]: val }));
  useEffect(() => {
    if (paciente.prontuario && sb) {
      sb(`pacientes?prontuario=eq.${encodeURIComponent(paciente.prontuario)}&select=data_nascimento,ano_nascimento`)
        .then(r => { const p = Array.isArray(r) && r[0]; if (p) setIdadeInfo(idadeMesesParaTriagem(p)); })
        .catch(() => {});
    }
    if (reavaliacao) loadPsSinais(sb, paciente.id).then(setHistorico);
  }, []);
  const pediatrico = tipo === "pediatrica" || (idade != null && idade < 13);
  const naoAdulto = tipo !== "adulto";
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  const lbl = { fontSize: 10.5, fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 4 };
  // Idade em meses para a faixa pediátrica. A ordem importa:
  //   1. o que a triadora digitou (é quem está com a criança na frente);
  //   2. a data de nascimento do cadastro — exata;
  //   3. o ano de nascimento — APROXIMADO, erro de até 11 meses.
  //
  // O caso 3 era a fonte de um erro silencioso: `ano * 12` transformava um
  // bebê de 26 dias nascido em dezembro num "12 meses" em janeiro, e os
  // sinais vitais dele passavam a ser julgados contra outra fisiologia.
  // Agora a aproximação continua servindo para criança maior — onde ±11
  // meses não troca a faixa — e é RECUSADA abaixo de 2 anos, que é onde
  // ela mente. Aí a tela pede a idade exata em vez de sugerir por chute.
  const idadeDigitada = ped.idade_meses != null && ped.idade_meses !== "" ? Number(ped.idade_meses) : null;
  const idadeAproximadaDemais = idadeDigitada == null && !idadeInfo.exata
    && idadeInfo.meses != null && idadeInfo.meses < 24;
  const idadeMeses = idadeDigitada != null ? idadeDigitada
    : idadeAproximadaDemais ? null
    : idadeInfo.meses;
  // Obstétrica: sugestão automática segue desativada (fase posterior).
  // Pediátrica: motor por faixa de idade (Fase 3). Adulto: motor padrão.
  const av = tipo === "obstetrica"
    ? avaliarObstetrica(v, obst, faixasObstetricas)
    : pediatrico
      ? avaliarSinaisVitaisPediatrico(v, idadeMeses, faixasPediatricas)
      : avaliarSinaisVitais(v);
  const sug = av.sugestao ? MANCHESTER[av.sugestao] : null;
  const faixasPedProntas = faixasValidadas(faixasPediatricas);
  const obstetricasProntas = obstetricasValidadas(faixasObstetricas);
  const semIdadeMeses = pediatrico && idadeMeses == null;
  const semFaixaPeds = pediatrico && idadeMeses != null && !av.faixa;

  function vitaisPayload() {
    const n = x => (x === "" || x == null ? null : Number(x));
    return {
      pa_sist: n(v.pa_sist), pa_diast: n(v.pa_diast), fc: n(v.fc), fr: n(v.fr),
      spo2: n(v.spo2), temp: n(v.temp), dor: n(v.dor), glicemia: n(v.glicemia),
      consciencia: v.consciencia || null,
    };
  }
  async function classificar(k) {
    setBusy(true);
    await onTriar(k, vitaisPayload(), av.sugestao || null, comorb, { tipo, obst, ped });
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 600, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>{reavaliacao ? "Reavaliação" : "Triagem"} — {paciente.iniciais}{idade != null ? ` (${idade} anos)` : ""}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>{paciente.queixa || "Sem queixa registrada"} · chegou há {fmtDur(diffMin(paciente.chegada_em, nowISO()))}{reavaliacao && paciente.classificacao ? ` · classificação atual: ${MANCHESTER[paciente.classificacao]?.label || paciente.classificacao}` : ""}</div>

        {/* TIPO DE TRIAGEM */}
        <div style={{ display: "flex", gap: 7, marginBottom: 14, flexWrap: "wrap" }}>
          {[["adulto", "Adulto"], ["obstetrica", "Obstétrica"], ["pediatrica", "Pediátrica"]].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTipo(k)} style={{ flex: 1, minWidth: 90, background: tipo === k ? VX.turquesa : "transparent", color: tipo === k ? "#062a26" : "var(--text-3)", border: `1px solid ${tipo === k ? VX.turquesa : "var(--border-2)"}`, borderRadius: 8, padding: "8px 10px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{label}</button>
          ))}
        </div>

        {/* AVISO OBSTÉTRICO */}
        {tipo === "obstetrica" && (
          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: "4px solid #e11d48", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#e11d48" }}>Triagem obstétrica</div>
            <div style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 3, lineHeight: 1.5 }}>
              A sugestão usa os discriminadores obstétricos (sangramento, movimento fetal, perda de líquido, contrações) e a PA (pré-eclâmpsia). É apoio — a classificação final é da enfermeira, pelo protocolo de acolhimento e classificação de risco em obstetrícia.
              {!obstetricasProntas && <><br />⚠ <strong style={{ color: "#f59e0b" }}>Critérios obstétricos em validação</strong> — ainda não validados pelo ADM Master; use como apoio provisório.</>}
            </div>
          </div>
        )}

        {/* AVISO PEDIÁTRICO */}
        {pediatrico && (
          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: "4px solid #ef4444", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#ef4444" }}>Paciente pediátrico{idade != null ? ` (${idade} anos)` : ""}</div>
            <div style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 3, lineHeight: 1.5 }}>
              O apoio à decisão usa faixas de FC/FR <strong>por idade</strong> (não as de adulto). A PA não é usada na triagem pediátrica. A sugestão é apoio — a classificação final é da enfermeira, pelo protocolo pediátrico.
              {/* Duas causas diferentes para a mesma falta, e o profissional
                  precisa saber qual é: "não temos a idade" pede um dado;
                  "temos só o ano" avisa que o dado que existe MENTE nessa
                  faixa — e por que o sistema preferiu não sugerir. */}
              {semIdadeMeses && (idadeAproximadaDemais
                ? <><br />⚠ <strong style={{ color: "#f59e0b" }}>O cadastro tem só o ano de nascimento</strong> — nesta faixa isso erra até 11 meses e trocaria a faixa de referência. Informe a idade em meses abaixo, ou complete a data de nascimento no cadastro.</>
                : <><br />⚠ <strong style={{ color: "#f59e0b" }}>Informe a idade em meses</strong> (campo abaixo) para a sugestão por faixa etária.</>)}
              {pediatrico && !idadeDigitada && idadeInfo.exata && idadeInfo.rotulo && (
                <><br />Idade pelo cadastro: <strong>{idadeInfo.rotulo}</strong>.</>
              )}
              {semFaixaPeds && <><br />⚠ <strong style={{ color: "#f59e0b" }}>Sem faixa cadastrada para esta idade</strong> — FC/FR não entram na sugestão.</>}
              {!faixasPedProntas && <><br />⚠ <strong style={{ color: "#f59e0b" }}>Faixas pediátricas em validação</strong> — ainda não validadas pelo ADM Master; use como apoio provisório.</>}
            </div>
          </div>
        )}
        {!pediatrico && idade == null && paciente.prontuario && (
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginBottom: 10 }}>Idade não cadastrada no Paciente 360 — as faixas do apoio à decisão assumem paciente adulto.</div>
        )}

        {/* HISTÓRICO DE AFERIÇÕES (reavaliação) */}
        {reavaliacao && historico.length > 0 && (
          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 13px", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 5 }}>Aferições anteriores</div>
            {historico.map(h => (
              <div key={h.id} style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace", lineHeight: 1.8 }}>
                {horaFmt(h.aferido_em)} — {fmtSinaisVitais(h) || "sem registro"}{h.classificacao_escolhida && MANCHESTER[h.classificacao_escolhida] ? ` → ${MANCHESTER[h.classificacao_escolhida].label}` : ""}
              </div>
            ))}
          </div>
        )}

        {/* CAMPOS OBSTÉTRICOS */}
        {tipo === "obstetrica" && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Dados obstétricos</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 8 }}>
              <div><label style={lbl}>IG (semanas)</label><input type="number" min="0" max="45" value={obst.ig_semanas ?? ""} onChange={e => setO("ig_semanas", e.target.value)} placeholder="—" style={inp} /></div>
              <div><label style={lbl}>Gestações (G)</label><input type="number" min="0" value={obst.gesta ?? ""} onChange={e => setO("gesta", e.target.value)} placeholder="0" style={inp} /></div>
              <div><label style={lbl}>Abortos</label><input type="number" min="0" value={obst.aborto ?? ""} onChange={e => setO("aborto", e.target.value)} placeholder="0" style={inp} /></div>
              <div><label style={lbl}>Partos normais</label><input type="number" min="0" value={obst.partos_normais ?? ""} onChange={e => setO("partos_normais", e.target.value)} placeholder="0" style={inp} /></div>
              <div><label style={lbl}>Cesáreas</label><input type="number" min="0" value={obst.cesareas ?? ""} onChange={e => setO("cesareas", e.target.value)} placeholder="0" style={inp} /></div>
              <div><label style={lbl}>Mov. fetal</label><select value={obst.mov_fetal ?? ""} onChange={e => setO("mov_fetal", e.target.value)} style={inp}><option value="">—</option><option value="presente">Presente</option><option value="reduzido">Reduzido</option><option value="ausente">Ausente</option></select></div>
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--text-2)", cursor: "pointer" }}><input type="checkbox" checked={!!obst.sangramento} onChange={e => setO("sangramento", e.target.checked)} style={{ accentColor: "#e11d48", width: 15, height: 15 }} /> Sangramento vaginal</label>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--text-2)", cursor: "pointer" }}><input type="checkbox" checked={!!obst.perda_liquido} onChange={e => setO("perda_liquido", e.target.checked)} style={{ accentColor: "#e11d48", width: 15, height: 15 }} /> Perda de líquido / bolsa rota</label>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--text-2)", cursor: "pointer" }}><input type="checkbox" checked={!!obst.contracoes} onChange={e => setO("contracoes", e.target.checked)} style={{ accentColor: "#e11d48", width: 15, height: 15 }} /> Contrações</label>
            </div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".05em", margin: "10px 0 5px" }}>Sinais de alerta (pré-eclâmpsia)</div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--text-2)", cursor: "pointer" }}><input type="checkbox" checked={!!obst.cefaleia} onChange={e => setO("cefaleia", e.target.checked)} style={{ accentColor: "#e11d48", width: 15, height: 15 }} /> Cefaleia</label>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--text-2)", cursor: "pointer" }}><input type="checkbox" checked={!!obst.epigastralgia} onChange={e => setO("epigastralgia", e.target.checked)} style={{ accentColor: "#e11d48", width: 15, height: 15 }} /> Epigastralgia</label>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--text-2)", cursor: "pointer" }}><input type="checkbox" checked={!!obst.alteracao_visual} onChange={e => setO("alteracao_visual", e.target.checked)} style={{ accentColor: "#e11d48", width: 15, height: 15 }} /> Alteração visual</label>
            </div>
          </div>
        )}

        {/* CAMPOS PEDIÁTRICOS */}
        {tipo === "pediatrica" && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Dados pediátricos</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
              <div><label style={lbl}>Peso (kg)</label><input type="number" min="0" step="any" value={ped.peso ?? ""} onChange={e => setP("peso", e.target.value)} placeholder="—" style={inp} /></div>
              <div><label style={lbl}>Idade (meses)</label><input type="number" min="0" value={ped.idade_meses ?? ""} onChange={e => setP("idade_meses", e.target.value)} placeholder="—" style={inp} /></div>
            </div>
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 6 }}>O peso alimenta a checagem de dose. A <strong>idade em meses</strong> define a faixa de FC/FR do apoio à decisão (a PA não é medida na triagem pediátrica).</div>
          </div>
        )}

        {/* SINAIS VITAIS */}
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Sinais vitais</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 8 }}>
          {!pediatrico && <>
            <div><label style={lbl}>PA sist. (mmHg)</label><input type="number" value={v.pa_sist} onChange={e => set("pa_sist", e.target.value)} placeholder="120" style={inp} /></div>
            <div><label style={lbl}>PA diast.</label><input type="number" value={v.pa_diast} onChange={e => set("pa_diast", e.target.value)} placeholder="80" style={inp} /></div>
          </>}
          <div><label style={lbl}>FC (bpm)</label><input type="number" value={v.fc} onChange={e => set("fc", e.target.value)} placeholder="80" style={inp} /></div>
          <div><label style={lbl}>FR (irpm)</label><input type="number" value={v.fr} onChange={e => set("fr", e.target.value)} placeholder="16" style={inp} /></div>
          <div><label style={lbl}>SpO2 (%)</label><input type="number" value={v.spo2} onChange={e => set("spo2", e.target.value)} placeholder="98" style={inp} /></div>
          <div><label style={lbl}>Temp. (°C)</label><input type="number" step="0.1" value={v.temp} onChange={e => set("temp", e.target.value)} placeholder="36.5" style={inp} /></div>
          <div><label style={lbl}>Dor (0–10)</label><input type="number" min="0" max="10" value={v.dor} onChange={e => set("dor", e.target.value)} placeholder="0" style={inp} /></div>
          <div><label style={lbl}>Glicemia (mg/dL)</label><input type="number" value={v.glicemia} onChange={e => set("glicemia", e.target.value)} placeholder="—" style={inp} /></div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Nível de consciência (AVPU)</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.entries(PS_CONSCIENCIA).map(([k, label]) => (
              <button key={k} onClick={() => set("consciencia", k)} style={{ background: v.consciencia === k ? "var(--surface-3)" : "transparent", color: v.consciencia === k ? (k === "A" ? "#34d399" : k === "U" ? "#ef4444" : "#f97316") : "var(--text-3)", border: `1px solid ${v.consciencia === k ? (k === "A" ? "#34d399" : k === "U" ? "#ef4444" : "#f97316") : "var(--border-2)"}`, borderRadius: 6, padding: "6px 12px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>{k} — {label}</button>
            ))}
          </div>
        </div>

        {/* COMORBIDADES */}
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Comorbidades</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
          {COMORBIDADES.map(c => { const on = comorb.includes(c.chave); return (
            <button key={c.chave} type="button" onClick={() => toggleComorb(c.chave)} style={{ background: on ? "#22d3ee22" : "transparent", color: on ? "#22d3ee" : "var(--text-3)", border: `1px solid ${on ? "#22d3ee" : "var(--border-2)"}`, borderRadius: 99, padding: "5px 12px", fontSize: 12, fontWeight: on ? 700 : 500, cursor: "pointer" }}>{on ? "✓ " : ""}{c.label}</button>
          ); })}
        </div>
        <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginBottom: 12 }}>Marque o que o paciente tem. "DRC em diálise" e "Hepatopatia" já avisam a farmácia sobre ajuste de dose — sem precisar digitar ClCr.</div>

        {/* SUGESTÃO AO VIVO */}
        {(sug ? (
          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: `4px solid ${sug.cor}`, borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: sug.cor }}>Sugestão pelos sinais vitais: {sug.label.toUpperCase()}</div>
            {av.motivos.length > 0 ? (
              <div style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 4, lineHeight: 1.5 }}>
                {av.motivos.map((m, i) => <span key={i}>{m.texto}{i < av.motivos.length - 1 ? " · " : ""}</span>)}
              </div>
            ) : <div style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 4 }}>Sinais vitais dentro da normalidade. Considerar Azul se a queixa não for urgente.</div>}
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 5 }}>Apoio à decisão — a classificação final é da triadora, conforme o fluxograma da queixa (Protocolo de Manchester).</div>
          </div>
        ) : (
          <div style={{ background: "var(--surface-2)", border: "1px dashed var(--border)", borderRadius: 8, padding: "9px 14px", marginBottom: 12, fontSize: 12, color: "var(--text-muted)" }}>
            Preencha os sinais vitais para receber a sugestão de classificação.
          </div>
        ))}

        {/* CLASSIFICAÇÃO */}
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Classificação de risco</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Object.entries(MANCHESTER).map(([k, m]) => (
            <button key={k} onClick={() => classificar(k)} disabled={busy} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: `4px solid ${m.cor}`, outline: av.sugestao === k ? `2px solid ${m.cor}` : "none", borderRadius: 8, padding: "10px 14px", cursor: "pointer", textAlign: "left" }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: m.cor, minWidth: 110 }}>{m.label}</span>
              <span style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.4, flex: 1 }}>{m.desc}</span>
              {av.sugestao === k && <span style={{ background: "transparent", color: m.cor, border: `1px solid ${m.cor}`, borderRadius: 99, padding: "2px 10px", fontSize: 10, fontWeight: 800, whiteSpace: "nowrap" }}>SUGERIDA</span>}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// Banner no PS: medicações prontas para retirada (com bipe ao ficarem prontas)
function PsRetiradaBanner({ sb, currentUser, canEdit }) {
  const [prontos, setProntos] = useState([]);
  const [som, setSom] = useState(somLigado());
  const [, setTick] = useState(0);
  const seenRef = useRef(null);
  async function refresh() {
    if (!sb) return;
    const ats = await loadPsAtendimentos(sb);
    const atById = {}; ats.forEach(a => atById[a.id] = a);
    const prep = await loadFarmPreparo(sb);
    const lista = prep.filter(p => p.status === "pronto" && atById[p.atendimento_id]).map(p => ({ ...p, at: atById[p.atendimento_id] }));
    setProntos(lista);
    const ids = new Set(lista.map(p => p.id));
    if (seenRef.current) { const novas = [...ids].filter(x => !seenRef.current.has(x)); if (novas.length && somLigado()) avisoSonoro(true); }
    seenRef.current = ids;
  }
  useEffect(() => { refresh(); const onF = () => refresh(); window.addEventListener("focus", onF); const id = setInterval(() => { refresh(); setTick(t => t + 1); }, 12000); return () => { window.removeEventListener("focus", onF); clearInterval(id); }; }, []);
  async function confirmar(p) { if (!confirm(`Confirmar retirada da medicação de ${p.at?.iniciais || "?"}?`)) return; await atualizarPreparoRemote(sb, p.id, { status: "retirado", retirado_em: nowISO(), retirado_por: currentUser?.name || null }); registrarAuditoria(sb, currentUser, "PS: retirada de medicação", p.at?.iniciais || "", {}); setTimeout(refresh, 300); }
  function ativar() { ligarSom(true); setSom(true); avisoSonoro(true); }
  if (prontos.length === 0 && som) return null;
  return (
    <div style={{ background: prontos.length ? "#3b82f614" : "var(--surface)", border: `1px solid ${prontos.length ? "#3b82f666" : "var(--border)"}`, borderLeft: `4px solid ${prontos.length ? "#3b82f6" : "var(--border-2)"}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      {prontos.length > 0 ? (
        <>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#3b82f6" }}>🔔 {prontos.length} medicação(ões) pronta(s) na farmácia:</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1 }}>
            {prontos.map(p => (
              <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 99, padding: "3px 6px 3px 11px", fontSize: 12 }}>
                {p.at?.iniciais || "?"}{p.at?.prontuario ? ` · ${p.at.prontuario}` : ""}
                {canEdit && <button onClick={() => confirmar(p)} style={{ ...btnContorno("#34d399"), padding: "2px 8px" }}>Retirar</button>}
              </span>
            ))}
          </div>
        </>
      ) : <span style={{ fontSize: 12.5, color: "var(--text-muted)", flex: 1 }}>Avisos sonoros de medicação pronta estão desligados neste computador.</span>}
      {!som && <button onClick={ativar} style={{ background: "transparent", color: "var(--text-2)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "6px 12px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>🔈 Ativar som</button>}
    </div>
  );
}

// Banner no PS: intervenções da farmácia clínica aguardando o prescritor.
// Fecha o ciclo — o médico vê o problema/conduta e responde (aceita/não aceita).
function PsIntervencaoBanner({ sb, currentUser, canEdit }) {
  const [pend, setPend] = useState([]);
  const [, setTick] = useState(0);
  const seenRef = useRef(null);
  async function refresh() {
    if (!sb) return;
    const ats = await loadPsAtendimentos(sb);
    const atById = {}, porProntuario = {};
    ats.forEach(a => { atById[a.id] = a; if (a.prontuario) porProntuario[normTxt(String(a.prontuario))] = a; });
    const ivs = await loadFarmIntervencoes(sb);
    const lista = ivs.filter(i => i.status === "pendente").map(i => {
      let at = i.atendimento_id ? atById[i.atendimento_id] : null;
      if (!at && i.paciente_prontuario) at = porProntuario[normTxt(String(i.paciente_prontuario))];
      return at ? { iv: i, at } : null;
    }).filter(Boolean);
    setPend(lista);
    const ids = new Set(lista.map(x => x.iv.id));
    if (seenRef.current) { const novas = [...ids].filter(x => !seenRef.current.has(x)); if (novas.length && somLigado()) avisoSonoro(false); }
    seenRef.current = ids;
  }
  useEffect(() => { refresh(); const onF = () => refresh(); window.addEventListener("focus", onF); const id = setInterval(() => { refresh(); setTick(t => t + 1); }, 12000); return () => { window.removeEventListener("focus", onF); clearInterval(id); }; }, []);
  async function responder(x, status) {
    let campos = { status };
    if (status === "nao_aceita") { const d = prompt("Motivo da não aceitação (opcional):", ""); if (d === null) return; campos.desfecho = d || null; }
    await updateFarmIntervencaoRemote(sb, x.iv.id, campos);
    registrarAuditoria(sb, currentUser, "PS: resposta à intervenção — " + status, x.at?.iniciais || "", {});
    setTimeout(refresh, 300);
  }
  if (pend.length === 0) return null;
  return (
    <div style={{ background: "#d9770614", border: "1px solid #d9770666", borderLeft: "4px solid #d97706", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#d97706", marginBottom: 8 }}>🔔 {pend.length} intervenção(ões) da farmácia aguardando o prescritor</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {pend.map(x => (
          <div key={x.iv.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 9, padding: "9px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 13 }}>{x.at?.iniciais || x.iv.paciente_iniciais || "?"}{x.at?.prontuario ? ` · reg. ${x.at.prontuario}` : ""}</strong>
              {x.iv.medicamento_nome && <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>· {x.iv.medicamento_nome}</span>}
              {x.iv.tipo && <span style={{ fontSize: 10, color: "var(--text-3)", border: "1px solid var(--border-2)", borderRadius: 99, padding: "0 6px" }}>{FARM_ALERTA_TIPOS[x.iv.tipo] || x.iv.tipo}</span>}
              {x.iv.gravidade && FARM_GRAV[x.iv.gravidade] && <span style={{ fontSize: 9.5, fontWeight: 800, color: FARM_GRAV[x.iv.gravidade].cor, textTransform: "uppercase" }}>{FARM_GRAV[x.iv.gravidade].label}</span>}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 5, lineHeight: 1.5 }}><strong>Problema:</strong> {x.iv.problema}</div>
            {x.iv.conduta && <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 2, lineHeight: 1.5 }}><strong>Conduta sugerida:</strong> {x.iv.conduta}</div>}
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 4 }}>Farmácia: {x.iv.farmaceutico || "?"} · {x.iv.created_at ? new Date(x.iv.created_at).toLocaleString("pt-BR") : ""}</div>
            {canEdit && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                <button onClick={() => responder(x, "aceita")} style={btnContorno("#34d399")}>Aceitar conduta</button>
                <button onClick={() => responder(x, "nao_aceita")} style={btnContorno("#f43f5e")}>Não aceitar</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
