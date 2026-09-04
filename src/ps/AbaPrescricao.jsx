// ═══════════════════════════════════════════════════════════
// ABA DE PRESCRIÇÃO DO ATENDIMENTO NO PS
//
// Terceira e última aba grande a sair do `AtendimentoModal`, em 04/09/2026.
//
// 🔴 O RASCUNHO NÃO MORA AQUI, E ISSO É DE PROPÓSITO. Os itens que o médico
// está montando, o formulário e o contexto clínico ficam UM NÍVEL ACIMA, no
// modal, e chegam por `rascunho`. Motivo: esta aba DESMONTA ao trocar de aba.
// Se o estado morasse aqui, o médico que montou três medicamentos e foi olhar
// um resultado de exame voltaria para um formulário vazio, sem aviso nenhum.
// Há um teste que monta o modal, adiciona um item, troca de aba e volta.
//
// ⚠️ O que É desta aba: qual painel está aberto e qual janela de similares
// está na tela. Perder isso ao trocar de aba não custa nada a ninguém.
//
// As regras de composição do item, do texto do prontuário e da gravação
// estão em `prescricao-rascunho.js` e `prescricao.js`, testadas por fronteira.
// ═══════════════════════════════════════════════════════════

import { useState } from "react";
import { registrarAuditoria } from "../auditoria/dados.js";
import { FARM_GRAV, analisarPrescricaoClinica, checarAlergia, farmFmtQtd, parseAlergias } from "../clinico/alertas.js";
import { COMORBIDADES } from "../clinico/comorbidades.js";
import { AvisoLeitura, VX } from "../ui/base.jsx";
import { horaFmt, nowISO } from "../util/datas.js";
import { PS_DOSE_UNID, PS_FREQUENCIAS, PS_VIAS } from "./catalogo.js";
import { addPsPrescricaoItens, addPsRegistroRemote, patchPsAtendimentoDireto } from "./dados.js";
import { estoqueSinal, similaresComEstoque, sinalDeDispensacao } from "./prescricao.js";
import {
  gruposDoCatalogo, itensSemEstoque, linhasParaGravar, montarItem, formAposAdicionar, podeAssinar, textoDaPrescricao,
} from "./prescricao-rascunho.js";

const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 11px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
const rot = { fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 };

export function AbaPrescricao({ sb, sbCru, paciente, currentUser, dados, rascunho, busy, setBusy, onAssinou }) {
  const { catalogo, catById, lotes, interacoes, incompatY, prescricoes, itensSalvos, saidas } = dados;
  const { itens, setItens, form, setForm, obs, setObs, ctx, setCtx } = rascunho;
  const [ctxAberto, setCtxAberto] = useState(false);
  const [ctxBusy, setCtxBusy] = useState(false);
  const [ctxMsg, setCtxMsg] = useState("");
  const [verSimilares, setVerSimilares] = useState(null);

  const sinal = med => estoqueSinal(med, lotes);
  const similares = med => similaresComEstoque(med, catalogo, lotes);
  const alertas = analisarPrescricaoClinica([...itensSalvos, ...itens], ctx, catById, interacoes, incompatY);

  async function salvarContexto() {
    setCtxBusy(true); setCtxMsg("");
    const payload = { idade: ctx.idade === "" ? null : Number(ctx.idade), peso: ctx.peso === "" ? null : Number(ctx.peso), clearance_renal: ctx.clearance_renal === "" ? null : Number(ctx.clearance_renal), funcao_hepatica: ctx.funcao_hepatica || null, alergias: ctx.alergias?.trim() || null, em_sonda: !!ctx.em_sonda, gestante: !!ctx.gestante, comorbidades: Array.isArray(ctx.comorbidades) ? ctx.comorbidades : [] };
    const r = await patchPsAtendimentoDireto(sbCru, paciente.id, payload);
    setCtxBusy(false);
    if (!r.ok) { setCtxMsg("erro: " + (r.erro || "falha ao salvar")); return; }
    Object.assign(paciente, payload);           // reflete no episódio aberto
    setCtxMsg("✓ contexto salvo");
    setTimeout(() => setCtxMsg(""), 3000);
  }

  function addItem() {
    const med = catalogo.find(m => String(m.id) === String(form.medId));
    if (!med) { alert("Escolha um medicamento do catálogo."); return; }
    // Bloqueio por alergia / reatividade cruzada (permite override consciente)
    const al = checarAlergia(med, parseAlergias(ctx.alergias));
    if (al.match === "direta" && !confirm(`⚠ ALERGIA DECLARADA\n\nO paciente é alérgico a "${al.termo}"${al.grupo ? ` (${al.grupo})` : ""}.\n${med.nome} é CONTRAINDICADO.\n\nPrescrever mesmo assim, sob responsabilidade do prescritor?`)) return;
    if (al.match === "cruzada" && !confirm(`⚠ REATIVIDADE CRUZADA\n\nAlergia a "${al.termo}" pode reagir com ${med.nome} (${al.grupo}).\n\nPrescrever mesmo assim?`)) return;
    setItens(p => [...p, montarItem(med, form)]);
    setForm(formAposAdicionar(form));
  }

  /**
   * 🔴 A ORDEM DAS DUAS GRAVAÇÕES IMPORTA, E A PRIMEIRA PODE ABORTAR TUDO.
   *
   * A prescrição é gravada em duas tabelas: o registro clínico (o texto do
   * prontuário) e os itens estruturados (o que a farmácia dispensa). Antes
   * desta versão, se a criação do registro falhasse em silêncio — 2xx da RLS
   * alterando zero linha — o código seguia com `registro_id: null` e gravava
   * os itens assim mesmo. O resultado era medicamento que a farmácia enxerga
   * e o prontuário não, com o rascunho limpo da tela e nenhuma mensagem.
   */
  async function assinar() {
    if (!podeAssinar(itens, obs)) { alert("Adicione ao menos um medicamento à prescrição."); return; }
    // Aviso (não bloqueio): itens sem saldo não poderão ser dispensados agora
    const semEstoque = itensSemEstoque(itens, catById, lotes);
    if (semEstoque.length && !confirm(
      `⚠ SEM ESTOQUE NA FARMÁCIA\n\n${semEstoque.map(it => `• ${it.medicamento_nome}`).join("\n")}\n\n` +
      `A farmácia não vai conseguir dispensar ${semEstoque.length === 1 ? "este item" : "estes itens"} agora.\n` +
      `Assinar mesmo assim?`
    )) return;
    if (!confirm("Assinar esta prescrição? Ela NÃO poderá ser editada nem apagada depois (registro clínico).")) return;
    setBusy(true);
    const regRows = await addPsRegistroRemote(sb, { atendimento_id: paciente.id, tipo: "prescricao", texto: textoDaPrescricao(itens, obs), criado_em: nowISO() }, currentUser);
    const registroId = Array.isArray(regRows) ? regRows[0]?.id : null;
    if (registroId == null) {
      setBusy(false);
      alert("A prescrição NÃO foi gravada — a gravação não chegou ao banco ou falta permissão de escrita neste módulo.\n\nO que você montou continua na tela. Tente assinar de novo.");
      return;                                   // rascunho preservado de propósito
    }
    if (itens.length) {
      const linhas = linhasParaGravar(itens, paciente.id, registroId);
      const gravados = await addPsPrescricaoItens(sb, linhas, currentUser);
      if (!Array.isArray(gravados) || gravados.length !== linhas.length) {
        // Meio caminho: o prontuário tem a prescrição por extenso, a farmácia
        // não tem os itens. Dizer exatamente isso, e dizer para NÃO reassinar
        // — reassinar criaria uma segunda prescrição no prontuário.
        setBusy(false);
        alert("A prescrição foi registrada no prontuário, mas os itens NÃO chegaram à farmácia.\n\nAvise a farmácia por telefone. NÃO assine de novo: isso criaria uma segunda prescrição no prontuário.");
        setItens([]); setObs("");
        onAssinou?.();
        return;
      }
    }
    registrarAuditoria(sb, currentUser, "PS: prescrição", `${paciente.iniciais} · ${itens.length} item(ns)`, {});
    setItens([]); setObs(""); setBusy(false);
    onAssinou?.();
  }

  const medSel = catById[form.medId];
  const sgSel = sinal(medSel);

  return (
    <>
      {/*
        🔴 SEM AS BASES, A TELA NÃO SABE — E TEM QUE DIZER QUE NÃO SABE.
        Catálogo, lotes, interações e incompatibilidades chegam como `FALHA`
        (lista vazia MARCADA) quando a leitura não volta. Antes, esse silêncio
        produzia duas mentiras ao mesmo tempo: nenhum alerta de farmácia
        clínica aparecia — nem o de base indisponível, que exige dois
        medicamentos reconhecidos para disparar —, e TODO item era marcado
        "SEM ESTOQUE", porque saldo zero e saldo desconhecido eram a mesma
        coisa. Prescrição sem alerta é a notícia que ninguém confere.
      */}
      <AvisoLeitura oQue="o catálogo de medicamentos, os lotes e as bases de interação" listas={[catalogo, lotes, interacoes, incompatY]} />

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
              <div><label style={rot}>Idade (anos)</label><input type="number" min="0" value={ctx.idade} onChange={e => setCtx(p => ({ ...p, idade: e.target.value }))} style={{ ...inp, padding: "7px 9px" }} /></div>
              <div><label style={rot}>Peso (kg)</label><input type="number" min="0" step="any" value={ctx.peso} onChange={e => setCtx(p => ({ ...p, peso: e.target.value }))} style={{ ...inp, padding: "7px 9px" }} /></div>
              <div><label style={rot}>ClCr / TFG (opcional)</label><input type="number" min="0" step="any" value={ctx.clearance_renal} onChange={e => setCtx(p => ({ ...p, clearance_renal: e.target.value }))} style={{ ...inp, padding: "7px 9px" }} /></div>
              <div><label style={rot}>Função hepática</label><select value={ctx.funcao_hepatica} onChange={e => setCtx(p => ({ ...p, funcao_hepatica: e.target.value }))} style={{ ...inp, padding: "7px 9px" }}><option value="">—</option><option value="normal">Normal</option><option value="leve">Leve</option><option value="moderada">Moderada</option><option value="grave">Grave</option></select></div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ ...rot, marginBottom: 4 }}>Comorbidades</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {COMORBIDADES.map(c => { const on = (ctx.comorbidades || []).includes(c.chave); return (
                  <button key={c.chave} type="button" onClick={() => setCtx(p => ({ ...p, comorbidades: on ? (p.comorbidades || []).filter(x => x !== c.chave) : [...(p.comorbidades || []), c.chave] }))} style={{ background: on ? "#22d3ee22" : "transparent", color: on ? "#22d3ee" : "var(--text-3)", border: `1px solid ${on ? "#22d3ee" : "var(--border-2)"}`, borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: on ? 700 : 500, cursor: "pointer" }}>{on ? "✓ " : ""}{c.label}</button>
                ); })}
              </div>
            </div>
            <div style={{ marginBottom: 8 }}><label style={rot}>Alergias</label><input value={ctx.alergias} onChange={e => setCtx(p => ({ ...p, alergias: e.target.value }))} placeholder="Ex.: penicilina, dipirona" style={{ ...inp, padding: "7px 9px" }} /></div>
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
          <label style={rot}>Medicamento</label>
          <select value={form.medId} onChange={e => setForm(p => ({ ...p, medId: e.target.value }))} style={{ ...inp, padding: "8px 9px" }}>
            <option value="">Escolha…</option>
            {gruposDoCatalogo(catalogo).map(g => (
              <optgroup key={g.classe} label={g.classe}>
                {g.itens.map(m => { const sg = sinal(m); return <option key={m.id} value={m.id}>{m.nome}{sg ? ` — ${sg.label}` : ""}</option>; })}
              </optgroup>
            ))}
          </select>
          {/* Situação de estoque do item escolhido — sem mostrar o saldo */}
          {medSel && sgSel && (
            <div style={{ marginTop: 6, background: sgSel.cor + "14", border: `1px solid ${sgSel.cor}55`, borderRadius: 7, padding: "7px 10px", fontSize: 12, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ color: sgSel.cor }}>{sgSel.label}</strong>
              <span>{sgSel.key === "zerado" ? "a farmácia não conseguirá dispensar." : "pode faltar antes do fim do tratamento."}</span>
              {sgSel.key === "zerado" && <button onClick={() => setVerSimilares(medSel)} style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${VX.azul}66`, color: VX.azul, borderRadius: 6, padding: "4px 10px", fontWeight: 700, cursor: "pointer", fontSize: 11.5 }}>Ver similares{similares(medSel).length ? ` (${similares(medSel).length})` : ""}</button>}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 10 }}>
          <div style={{ flex: "0 1 80px", minWidth: 70 }}>
            <label style={rot}>Dose</label>
            <input type="number" min="0" step="any" value={form.dose_valor} onChange={e => setForm(p => ({ ...p, dose_valor: e.target.value }))} placeholder="500" style={{ ...inp, padding: "8px 9px" }} />
          </div>
          <div style={{ flex: "0 1 92px", minWidth: 80 }}>
            <label style={rot}>Unid.</label>
            <select value={form.dose_unidade} onChange={e => setForm(p => ({ ...p, dose_unidade: e.target.value }))} style={{ ...inp, padding: "8px 9px" }}>{PS_DOSE_UNID.map(u => <option key={u} value={u}>{u}</option>)}</select>
          </div>
          <div style={{ flex: "1 1 110px", minWidth: 100 }}>
            <label style={rot}>Frequência</label>
            <select value={form.freqLabel} onChange={e => setForm(p => ({ ...p, freqLabel: e.target.value }))} style={{ ...inp, padding: "8px 9px" }}>{PS_FREQUENCIAS.map(f => <option key={f.label} value={f.label}>{f.label}</option>)}</select>
          </div>
          <div style={{ flex: "0 1 78px", minWidth: 68 }}>
            <label style={rot}>Via</label>
            <select value={form.via} onChange={e => setForm(p => ({ ...p, via: e.target.value }))} style={{ ...inp, padding: "8px 9px" }}>{PS_VIAS.map(v => <option key={v} value={v}>{v}</option>)}</select>
          </div>
          <div style={{ flex: "0 1 70px", minWidth: 62 }}>
            <label style={rot}>Dias</label>
            <input type="number" min="0" step="any" value={form.duracao} onChange={e => setForm(p => ({ ...p, duracao: e.target.value }))} placeholder="—" style={{ ...inp, padding: "8px 9px" }} />
          </div>
          <div style={{ flex: "0 1 70px", minWidth: 62 }}>
            <label style={rot}>Qtd</label>
            <input type="number" min="0" step="any" value={form.quantidade} onChange={e => setForm(p => ({ ...p, quantidade: e.target.value }))} placeholder="0" style={{ ...inp, padding: "8px 9px" }} />
          </div>
          <button onClick={addItem} style={{ background: "transparent", color: "#22d3ee", border: "1px solid #22d3ee88", borderRadius: 6, padding: "9px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Adicionar</button>
        </div>
        {itens.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 10 }}>
            {itens.map((it, i) => { const sg = sinal(catById[it.medicamento_id]); return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "7px 11px", fontSize: 12.5 }}>
                <span style={{ flex: 1 }}><strong>{it.medicamento_nome}</strong>{it.dose ? ` — ${it.dose}` : ""} <span style={{ color: "var(--text-muted)" }}>{it.via}{it.quantidade ? ` · qtd ${farmFmtQtd(it.quantidade)} ${it.unidade || ""}` : ""}</span>
                  {sg && <span style={{ fontSize: 9.5, fontWeight: 800, color: sg.cor, border: `1px solid ${sg.cor}66`, borderRadius: 99, padding: "0 6px", marginLeft: 6, whiteSpace: "nowrap" }}>{sg.label}</span>}
                </span>
                {sg?.key === "zerado" && <button onClick={() => setVerSimilares(catById[it.medicamento_id])} style={{ background: "transparent", border: `1px solid ${VX.azul}66`, color: VX.azul, borderRadius: 6, padding: "2px 8px", fontWeight: 700, cursor: "pointer", fontSize: 11 }}>similares</button>}
                <button onClick={() => setItens(p => p.filter((_, j) => j !== i))} style={{ background: "transparent", border: "none", color: "#f43f5e", cursor: "pointer", fontSize: 15, lineHeight: 1 }}>✕</button>
              </div>
            ); })}
          </div>
        )}
        <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} placeholder="Observações / cuidados (opcional)" style={{ ...inp, resize: "vertical", marginBottom: 10 }} />
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={assinar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Assinar prescrição"}</button>
        </div>

        {/* Similares com estoque — troca na hora */}
        {verSimilares && (() => {
          const sims = similares(verSimilares);
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
                      <button key={m.id} onClick={() => { setForm(p => ({ ...p, medId: String(m.id) })); setVerSimilares(null); }}
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
      {alertas.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 7 }}>Alertas de farmácia clínica ({alertas.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {alertas.map((a, i) => (
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
          const doRegistro = itensSalvos.filter(i => i.registro_id === r.id);
          return (
            <div key={r.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 13px" }}>
              <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace", marginBottom: 6 }}>{horaFmt(r.criado_em)} · {r.usuario || "?"}</div>
              {doRegistro.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {doRegistro.map(it => {
                    // A MESMA régua da aba de Checagem. Eram duas, com rótulos
                    // diferentes para o mesmo estado.
                    const st = sinalDeDispensacao(it, saidas);
                    const qtd = Number(it.quantidade || 0);
                    return (
                      <div key={it.id} style={{ fontSize: 12.5, color: "var(--text-2)", display: "flex", gap: 8, alignItems: "baseline" }}>
                        <span style={{ flex: 1 }}>• <strong>{it.medicamento_nome}</strong>{it.dose ? ` — ${it.dose}` : ""} <span style={{ color: "var(--text-muted)" }}>{it.via}{qtd ? ` · qtd ${farmFmtQtd(qtd)} ${it.unidade || ""}` : ""}</span></span>
                        <span style={{ fontSize: 10.5, color: st.cor, fontWeight: 700, whiteSpace: "nowrap" }}>{st.label}</span>
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
  );
}
