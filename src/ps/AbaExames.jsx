// ═══════════════════════════════════════════════════════════
// ABA DE EXAMES DO ATENDIMENTO NO PS
//
// Saiu de dentro do `AtendimentoModal` em 04/09/2026. É a primeira das
// quatro abas a sair, e saiu primeiro porque é a única que não compartilha
// estado com as outras: tudo que ela guarda (o formulário de solicitação e o
// resultado sendo digitado) só interessa a ela.
//
// ⚠️ `busy` CONTINUA VINDO DE FORA. É o mesmo travamento das outras abas, e
// dar um próprio a esta aba mudaria comportamento — a extração não muda
// comportamento; o único desvio proposital está anotado em `lancarResultado`.
//
// As regras de qual estado permite qual ação estão em `exames.js`, testadas
// por fronteira. Aqui só tem tela.
// ═══════════════════════════════════════════════════════════

import { useState } from "react";
import { registrarAuditoria } from "../auditoria/dados.js";
import { btnContorno } from "../ui/base.jsx";
import { horaFmt, nowISO } from "../util/datas.js";
import { PS_EXAME_CATEGORIAS } from "./catalogo.js";
import { addPsRegistroRemote, updatePsRegistroRemote } from "./dados.js";
import { acaoDoExame, estadoDoExame } from "./exames.js";

const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 11px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };

export function AbaExames({ sb, paciente, currentUser, exames, busy, setBusy, onMudou }) {
  const [form, setForm] = useState({ categoria: "laboratorial", nome: "" });
  const [resultadoDe, setResultadoDe] = useState(null);  // { id, texto }
  const [erro, setErro] = useState("");

  async function solicitar() {
    if (!form.nome.trim()) { alert("Informe o nome do exame."); return; }
    setBusy(true);
    const r = await addPsRegistroRemote(sb, { atendimento_id: paciente.id, tipo: "exame", categoria: form.categoria, texto: form.nome.trim(), status: "solicitado", criado_em: nowISO() }, currentUser);
    setBusy(false);
    // Mesma conferência do PATCH: sem linha de volta, nada foi criado.
    if (!Array.isArray(r) || r.length === 0) {
      alert("O exame NÃO foi solicitado — a gravação não chegou ao banco ou falta permissão de escrita neste módulo.");
      return;
    }
    registrarAuditoria(sb, currentUser, "PS: solicitar exame", `${paciente.iniciais} · ${form.nome.trim()}`, {});
    setForm(p => ({ ...p, nome: "" }));
    onMudou?.();
  }

  /**
   * 🔴 EM CASO DE FALHA, O TEXTO DIGITADO FICA NA TELA.
   *
   * É o único desvio de comportamento desta extração, e é o conserto de um
   * defeito: antes a caixa fechava sempre, e uma gravação recusada em
   * silêncio pela RLS levava junto o resultado que o médico acabou de
   * digitar — sem mensagem nenhuma.
   */
  async function lancarResultado() {
    if (!resultadoDe?.texto?.trim()) { alert("Cole ou descreva o resultado."); return; }
    setErro("");
    const r = await updatePsRegistroRemote(sb, resultadoDe.id, { status: "resultado_disponivel", resultado: resultadoDe.texto.trim(), resultado_em: nowISO() });
    if (!r.ok) { setErro(r.erro); return; }
    registrarAuditoria(sb, currentUser, "PS: resultado de exame", paciente.iniciais, {});
    setResultadoDe(null);
    onMudou?.();
  }

  async function marcarVisto(reg) {
    const r = await updatePsRegistroRemote(sb, reg.id, { status: "visto" });
    if (!r.ok) { alert(r.erro); return; }
    registrarAuditoria(sb, currentUser, "PS: exame visto", `${paciente.iniciais} · ${reg.texto}`, {});
    onMudou?.();
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <select value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))} style={{ ...inp, width: 150 }}>
          {Object.entries(PS_EXAME_CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} onKeyDown={e => e.key === "Enter" && solicitar()} placeholder="Ex.: Hemograma completo, RX de tórax PA…" style={{ ...inp, flex: 1, minWidth: 200 }} />
        <button onClick={solicitar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "+ Solicitar"}</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {exames.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>Nenhum exame solicitado.</div>}
        {exames.map(r => {
          const st = estadoDoExame(r);
          const acao = acaoDoExame(r);
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
                  {erro && <div style={{ fontSize: 11.5, color: "#f43f5e", fontWeight: 600, marginBottom: 6 }}>{erro} O texto acima continua aqui.</div>}
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button onClick={() => { setResultadoDe(null); setErro(""); }} style={btnContorno("var(--text-muted)")}>Cancelar</button>
                    <button onClick={lancarResultado} style={btnContorno("#3b82f6")}>Salvar resultado</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  {acao === "lancar_resultado" && <button onClick={() => { setResultadoDe({ id: r.id, texto: "" }); setErro(""); }} style={btnContorno("#3b82f6")}>Lançar resultado</button>}
                  {acao === "marcar_visto" && <button onClick={() => marcarVisto(r)} style={btnContorno("#34d399")}>Marcar como visto</button>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
