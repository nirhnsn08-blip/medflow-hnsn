// ═══════════════════════════════════════════════════════════
// DISPENSAR — o modal que serve o PS E a internação
//
// 🔴 POR QUE UM SÓ, E NÃO DOIS
// Este modal saiu de dentro do FarmaciaPage quando a internação entrou na
// farmácia (17/09/2026). Uma segunda cópia para o internado teria as
// mesmas quatro regras escritas de novo — FEFO, lote vencido, quanto já
// saiu, quanto falta — e a primeira delas a mudar passaria a valer só de um
// lado. É a mesma lição que a alergia e o `dispensadoDoItem` já cobraram.
//
// O que muda entre os dois é DADO, e entra por prop:
//   chave      a coluna do vínculo: `prescricao_item_id` (PS) ou `pep_item_id`
//   vinculo    o que identifica o paciente no kardex (atendimento ou episódio)
//   bloqueio   { ok, erros, avisos } — a validação farmacêutica da internação
//   prescritor quem assinou a prescrição (obrigatório em controlado)
//
// ⚠️ "Quanto já saiu" é LÍQUIDO (dispensadoDoItem): estorno e devolução
// descontam. Somar só as saídas fazia o item parecer dispensado duas vezes.
// ═══════════════════════════════════════════════════════════

import { useState } from "react";
import { farmFmtQtd, scoreItemClinico, FARM_SCORE_COR } from "../clinico/alertas.js";
import { btnContorno, campoTexto, rotuloCampo } from "../ui/base.jsx";
import { fmtDataBR } from "../util/datas.js";
import { camposDoPrescritor, conferirPrescritor, exigePrescritor } from "./controlados.js";
import { conferirDevolucao, devolviveis, movimentoDeDevolucao, MOTIVOS_DE_DEVOLUCAO } from "./devolucao.js";
import { dispensadoDoItem } from "./preparo.js";
import { infoDeValidade, lotesParaEscolha, podeSair } from "./validade.js";

const cx = { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 13px" };

export default function DispensarModal({
  titulo, subtitulo, itens = [], movimentos = [], chave = "prescricao_item_id",
  vinculo = {}, lotes = [], medById = {}, alertas = [], bloqueio = null,
  prescritor: prescritorPadrao = {}, canEdit = true,
  onDispensar, onDevolver, onClose,
}) {
  const [selItem, setSelItem] = useState(null);      // item aberto para dispensar
  const [f, setF] = useState({ lote_id: "", quantidade: "", prescritor_nome: "", prescritor_registro: "", receita_numero: "" });
  const [devItem, setDevItem] = useState(null);      // item aberto para devolver
  const [d, setD] = useState({ saida_id: "", quantidade: "", motivo: MOTIVOS_DE_DEVOLUCAO[0] });
  const [busy, setBusy] = useState(false);

  const saiuDoItem = it => dispensadoDoItem(it.id, movimentos, chave);
  const bloqueado = bloqueio && bloqueio.ok === false;

  function abrir(item) {
    // 🔴 O vencido NÃO é sugestão. FEFO segue entre os válidos.
    const esc = lotesParaEscolha(lotes.filter(l => String(l.medicamento_id) === String(item.medicamento_id)), { motivo: "Dispensação" });
    const q = Number(item.quantidade || 0);
    const sugestao = q > 0 ? Math.max(0, q - saiuDoItem(item)) : "";
    setDevItem(null);
    setSelItem({ ...item, _lotes: esc.lotes });
    setF({
      lote_id: esc.lotes[0]?.id || "", quantidade: sugestao || "",
      prescritor_nome: prescritorPadrao.nome || item.usuario || "",
      prescritor_registro: prescritorPadrao.registro || "",
      receita_numero: "",
    });
  }

  async function confirmar() {
    const med = medById[selItem.medicamento_id];
    const q = Number(f.quantidade);
    if (!q || q <= 0) { alert("Informe a quantidade a dispensar."); return; }
    const lote = selItem._lotes.find(l => String(l.id) === String(f.lote_id));
    if (!lote) { alert("Sem lote em estoque para este medicamento. Registre uma entrada no Estoque."); return; }
    if (q > Number(lote.quantidade)) { alert(`Maior que o saldo do lote (disponível: ${farmFmtQtd(lote.quantidade)}).`); return; }
    const v = podeSair({ lote, motivo: "Dispensação" });
    if (!v.ok) { alert("⚠ " + v.erros.join(" ")); return; }
    if (exigePrescritor(med, "Dispensação")) {
      const p = conferirPrescritor({ nome: f.prescritor_nome });
      if (!p.ok) { alert("⚠ " + p.erros.join(" ")); return; }
    }
    const avisos = [...v.avisos, ...((bloqueio && bloqueio.avisos) || [])];
    if (avisos.length && !confirm(`${avisos.join("\n\n")}\n\nDispensar assim mesmo?`)) return;
    setBusy(true);
    const ok = await onDispensar({
      medicamento_id: selItem.medicamento_id, tipo: "saida", quantidade: q,
      lote: lote.lote || null, validade: lote.validade || null, motivo: "Dispensação",
      [chave]: selItem.id, ...vinculo,
      ...(exigePrescritor(med, "Dispensação")
        ? camposDoPrescritor({ nome: f.prescritor_nome, registro: f.prescritor_registro, receita: f.receita_numero })
        : {}),
    });
    setBusy(false);
    if (ok) setSelItem(null);
  }

  function abrirDevolucao(item) {
    const opcoes = devolviveis(movimentos, item.id, chave);
    setSelItem(null);
    setDevItem({ ...item, _opcoes: opcoes });
    setD({ saida_id: opcoes[0] ? String(opcoes[0].saida.id) : "", quantidade: "", motivo: MOTIVOS_DE_DEVOLUCAO[0] });
  }

  async function confirmarDevolucao() {
    const escolhida = devItem._opcoes.find(o => String(o.saida.id) === String(d.saida_id));
    const conf = conferirDevolucao({ disponivel: escolhida, quantidade: d.quantidade, motivo: d.motivo });
    if (!conf.ok) { alert("⚠ " + conf.erros.join(" ")); return; }
    setBusy(true);
    const ok = await onDevolver(movimentoDeDevolucao(escolhida.saida, Number(d.quantidade), d.motivo));
    setBusy(false);
    if (ok) setDevItem(null);
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 660, maxWidth: "96vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{titulo}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>{subtitulo}</div>

        {/* A validação farmacêutica manda: pendência do prescritor NÃO dispensa. */}
        {bloqueado && (
          <div style={{ fontSize: 12.5, color: "#f43f5e", background: "#f43f5e12", border: "1px solid #f43f5e55", borderRadius: 8, padding: "10px 12px", marginBottom: 12, lineHeight: 1.5 }}>
            {bloqueio.erros.join(" ")}
          </div>
        )}
        {!bloqueado && bloqueio?.avisos?.length > 0 && (
          <div style={{ fontSize: 12.5, color: "#d97706", background: "#d9770612", border: "1px solid #d9770655", borderRadius: 8, padding: "10px 12px", marginBottom: 12, lineHeight: 1.5 }}>
            {bloqueio.avisos.join(" ")}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {itens.length === 0 && <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "1rem" }}>Sem itens de medicamento nesta prescrição.</div>}
          {itens.map(it => {
            const med = medById[it.medicamento_id];
            const q = Number(it.quantidade || 0);
            const disp = saiuDoItem(it);
            const pend = Math.max(0, q - disp);
            const semVinculo = !it.medicamento_id;
            const podeDispensar = !semVinculo && !bloqueado && canEdit && (q > 0 ? pend > 0 : disp <= 0);
            const podeDevolver = !!onDevolver && canEdit && devolviveis(movimentos, it.id, chave).length > 0;
            const st = semVinculo ? { c: "#8d99ab", t: "fora do catálogo" }
              : q > 0 ? (pend <= 0 ? { c: "#34d399", t: "dispensado" } : disp > 0 ? { c: "#d97706", t: `parcial ${farmFmtQtd(disp)}/${farmFmtQtd(q)}` } : { c: "#8d99ab", t: "a dispensar" })
              : (disp > 0 ? { c: "#34d399", t: `dispensado ${farmFmtQtd(disp)}` } : { c: "#8d99ab", t: "a dispensar" });
            const aberto = selItem?.id === it.id;
            const abertoDev = devItem?.id === it.id;
            return (
              <div key={it.id} style={cx}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span title={`Score do item: ${scoreItemClinico(it, alertas)}/3`} style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", background: FARM_SCORE_COR[scoreItemClinico(it, alertas)], borderRadius: 5, padding: "1px 6px", flexShrink: 0 }}>{scoreItemClinico(it, alertas)}</span>
                  <div style={{ flex: 1, minWidth: 150 }}>
                    <strong style={{ fontSize: 13 }}>{it.medicamento_nome}</strong>
                    {med?.controlado && <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 800, color: "#6366f1", border: "1px solid #6366f155", borderRadius: 99, padding: "0 6px" }}>CONTROLADO{med.lista_controle ? ` ${med.lista_controle}` : ""}</span>}
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                      {it.dose ? `${it.dose} · ` : ""}{it.via || ""}{it.frequencia ? ` · ${it.frequencia}` : ""}{q ? ` · prescrito ${farmFmtQtd(q)} ${it.unidade || ""}` : ""}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: st.c, fontWeight: 700 }}>{st.t}</span>
                  {podeDispensar && <button onClick={() => aberto ? setSelItem(null) : abrir(it)} style={btnContorno("#22d3ee")}>{aberto ? "Fechar" : "Dispensar"}</button>}
                  {podeDevolver && <button onClick={() => abertoDev ? setDevItem(null) : abrirDevolucao(it)} style={btnContorno("#8b5cf6")}>{abertoDev ? "Fechar" : "Devolver"}</button>}
                  {semVinculo && <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>não está no catálogo — sem baixa de estoque</span>}
                </div>

                {aberto && (
                  <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                    {selItem._lotes.length === 0 ? (
                      <div style={{ fontSize: 12.5, color: "#f43f5e" }}>Sem estoque deste medicamento. Registre uma entrada no Estoque.</div>
                    ) : (<>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                        <div style={{ flex: "2 1 220px" }}>
                          <label style={rotuloCampo}>Lote (FEFO)</label>
                          <select value={f.lote_id} onChange={e => setF(p => ({ ...p, lote_id: e.target.value }))} style={campoTexto}>
                            {selItem._lotes.map(l => { const vi = infoDeValidade(l.validade); return <option key={l.id} value={l.id}>{(l.lote || "sem lote")} · val {l.validade ? fmtDataBR(l.validade) : "—"}{vi.status === "vencido" ? " (VENCIDO)" : ""} · saldo {farmFmtQtd(l.quantidade)}</option>; })}
                          </select>
                        </div>
                        <div style={{ flex: "0 1 110px" }}>
                          <label style={rotuloCampo}>Qtd</label>
                          <input type="number" min="0" step="any" value={f.quantidade} onChange={e => setF(p => ({ ...p, quantidade: e.target.value }))} style={campoTexto} autoFocus />
                        </div>
                        <button onClick={confirmar} disabled={busy} style={{ background: "#34d399", color: "#000", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Confirmar baixa"}</button>
                      </div>
                      {!q && (
                        <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 6 }}>
                          A prescrição da internação não diz quantas unidades dispensar — ela traz dose e frequência.
                          {it.frequencia_dia ? ` São ${farmFmtQtd(it.frequencia_dia)} dose(s) em 24 h.` : ""} Confira a apresentação antes de lançar.
                        </div>
                      )}
                      {exigePrescritor(medById[selItem.medicamento_id], "Dispensação") && (
                        <div style={{ marginTop: 10, borderTop: "1px dashed var(--border)", paddingTop: 10 }}>
                          <div style={{ fontSize: 11.5, color: "#6366f1", fontWeight: 700, marginBottom: 6 }}>Controlado — Portaria 344/98: o livro exige quem prescreveu.</div>
                          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
                            <div><label style={rotuloCampo}>Prescritor *</label><input value={f.prescritor_nome} onChange={e => setF(p => ({ ...p, prescritor_nome: e.target.value }))} placeholder="Nome de quem prescreveu" style={campoTexto} /></div>
                            <div><label style={rotuloCampo}>Registro</label><input value={f.prescritor_registro} onChange={e => setF(p => ({ ...p, prescritor_registro: e.target.value }))} placeholder="CRM/UF" style={campoTexto} /></div>
                            <div><label style={rotuloCampo}>Receita / notificação</label><input value={f.receita_numero} onChange={e => setF(p => ({ ...p, receita_numero: e.target.value }))} placeholder="nº, se houver" style={campoTexto} /></div>
                          </div>
                        </div>
                      )}
                    </>)}
                  </div>
                )}

                {abertoDev && (
                  <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 6 }}>Devolução do setor: o medicamento volta para o MESMO lote de onde saiu.</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                      <div style={{ flex: "2 1 240px" }}>
                        <label style={rotuloCampo}>Dispensação que está voltando</label>
                        <select value={d.saida_id} onChange={e => setD(p => ({ ...p, saida_id: e.target.value }))} style={campoTexto}>
                          {devItem._opcoes.map(o => (
                            <option key={o.saida.id} value={o.saida.id}>
                              {o.saida.created_at ? fmtDataBR(o.saida.created_at) : "—"} · lote {o.saida.lote || "sem lote"} · saiu {farmFmtQtd(o.saida.quantidade)} · cabe {farmFmtQtd(o.restante)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ flex: "0 1 100px" }}>
                        <label style={rotuloCampo}>Qtd</label>
                        <input type="number" min="0" step="any" value={d.quantidade} onChange={e => setD(p => ({ ...p, quantidade: e.target.value }))} style={campoTexto} autoFocus />
                      </div>
                      <div style={{ flex: "1 1 170px" }}>
                        <label style={rotuloCampo}>Por que voltou</label>
                        <select value={d.motivo} onChange={e => setD(p => ({ ...p, motivo: e.target.value }))} style={campoTexto}>
                          {MOTIVOS_DE_DEVOLUCAO.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                      <button onClick={confirmarDevolucao} disabled={busy} style={{ background: "#8b5cf6", color: "#fff", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Registrar devolução"}</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
