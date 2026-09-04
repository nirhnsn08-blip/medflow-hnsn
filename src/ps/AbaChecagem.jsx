// ═══════════════════════════════════════════════════════════
// ABA DE CHECAGEM DE MEDICAÇÃO DO ATENDIMENTO NO PS
//
// Segunda aba a sair do `AtendimentoModal`, em 04/09/2026.
//
// ⚠️ ELA COMPARTILHA DADOS COM A ABA DE PRESCRIÇÃO — os itens assinados e as
// saídas da farmácia — mas SÓ PARA LER. O único estado que ela escreve são as
// administrações, e isso sai daqui por `onChecou`. Foi o que permitiu separá-la
// sem erguer estado nem mudar comportamento.
//
// O que ela guarda é dela: qual item está aberto e o formulário da checagem.
//
// As regras (o que conta como dose dada, o que é dispensação parcial, o que
// impede o registro de ser gravado) estão em `checagem.js`, testadas por
// fronteira. Aqui só tem tela.
// ═══════════════════════════════════════════════════════════

import { useState } from "react";
import { registrarAuditoria } from "../auditoria/dados.js";
import { btnContorno } from "../ui/base.jsx";
import { horaFmt, isoToLocal, localToIso, nowISO } from "../util/datas.js";
import { PS_ADM_CATEGORIAS, PS_ADM_MOTIVOS, PS_ADM_STATUS } from "./catalogo.js";
import {
  dosesAdministradas, dosesNaoAdministradas, itemPendenteDeChecagem,
  sinalDeDispensacao, validarChecagem,
} from "./checagem.js";
import { addPsAdministracao } from "./dados.js";

const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 11px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };

export function AbaChecagem({ sb, paciente, currentUser, itensSalvos, saidas, adms, busy, setBusy, onChecou }) {
  const [checando, setChecando] = useState(null);
  const [form, setForm] = useState({ status: "administrado", motivo: "", observacao: "", categoria: "enfermagem", quando: "" });

  // Abre a checagem de um item. A hora vem preenchida com agora, mas é
  // editável: à beira do leito a enfermagem administra primeiro e registra
  // depois. A categoria profissional é a única coisa que persiste entre itens
  // — quem está checando não muda a cada dose.
  function abrir(it) {
    setChecando(it);
    setForm(f => ({ status: "administrado", motivo: "", observacao: "", categoria: f.categoria || "enfermagem", quando: isoToLocal(nowISO()) }));
  }

  async function confirmar() {
    const it = checando;
    if (!it) return;
    const quandoIso = form.quando ? localToIso(form.quando) : nowISO();
    const v = validarChecagem(form, quandoIso, nowISO());
    if (!v.ok) { alert(v.erro); return; }
    const rotulo = form.status === "administrado" ? "administrado" : "NÃO administrado";
    if (!confirm(`Registrar ${it.medicamento_nome} como ${rotulo} em ${horaFmt(quandoIso)}?\n\nÉ um registro clínico: NÃO poderá ser editado nem apagado depois.`)) return;
    setBusy(true);
    const r = await addPsAdministracao(sb, {
      atendimento_id: paciente.id, prescricao_item_id: it.id, medicamento_id: it.medicamento_id || null,
      medicamento_nome: it.medicamento_nome, dose: it.dose || null, via: it.via || null,
      status: form.status, motivo: form.status === "nao_administrado" ? form.motivo : null,
      observacao: form.observacao.trim() || null, categoria: form.categoria, administrado_em: quandoIso,
    }, currentUser);
    setBusy(false);
    // 🔴 Sem linha de volta nada foi gravado. Fechar a caixa aqui diria à
    // enfermagem que a dose está no prontuário quando ela não está — e o
    // próximo plantão leria um item sem checagem sem saber que alguém tentou.
    if (!Array.isArray(r) || r.length === 0) {
      alert("A checagem NÃO foi gravada — a gravação não chegou ao banco ou falta permissão de escrita neste módulo. Tente de novo.");
      return;
    }
    registrarAuditoria(sb, currentUser, `PS: checagem de medicação (${rotulo})`, `${paciente.iniciais} · ${it.medicamento_nome}`, {});
    setChecando(null);
    onChecou?.();
  }

  return (
    <>
      <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 13px", marginBottom: 12, fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.55 }}>
        <strong>Dispensado</strong> significa que o medicamento saiu da farmácia. <strong>Checado</strong> significa que ele foi administrado ao paciente — com hora e responsável. São coisas diferentes: só a checagem fecha o ciclo.
      </div>

      {itensSalvos.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "1.5rem", border: "1px dashed var(--border)", borderRadius: 10 }}>Nenhum medicamento prescrito neste atendimento.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {itensSalvos.map(it => {
            const dispSt = sinalDeDispensacao(it, saidas);
            const dadas = dosesAdministradas(it.id, adms);
            const naoDadas = dosesNaoAdministradas(it.id, adms);
            const previstas = Number(it.frequencia_dia || 0);
            const pendente = itemPendenteDeChecagem(it, saidas, adms);
            const aberto = checando?.id === it.id;
            return (
              <div key={it.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: `3px solid ${pendente ? "#d97706" : dadas > 0 ? "#34d399" : "var(--border-2)"}`, borderRadius: 8, padding: "10px 13px" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ flex: 1, fontSize: 13, color: "var(--text)", minWidth: 180 }}>
                    <strong>{it.medicamento_nome}</strong>{it.dose ? ` — ${it.dose}` : ""} <span style={{ color: "var(--text-muted)" }}>{it.via || ""}</span>
                  </span>
                  <span style={{ fontSize: 10.5, color: dispSt.cor, fontWeight: 700, whiteSpace: "nowrap" }}>{dispSt.label}</span>
                  {!aberto && <button onClick={() => abrir(it)} style={btnContorno(pendente ? "#d97706" : "#22d3ee")}>Checar</button>}
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
                        <button key={k} onClick={() => setForm(f => ({ ...f, status: k, motivo: k === "administrado" ? "" : f.motivo }))}
                          style={{ background: form.status === k ? v.cor : "transparent", color: form.status === k ? "#000" : "var(--text-3)", border: `1px solid ${form.status === k ? v.cor : "var(--border)"}`, borderRadius: 99, padding: "5px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{v.label}</button>
                      ))}
                    </div>

                    {form.status === "nao_administrado" && (
                      <div style={{ marginBottom: 9 }}>
                        <div style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, marginBottom: 4 }}>Motivo (obrigatório)</div>
                        <select value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))} style={inp}>
                          <option value="">Selecione o motivo…</option>
                          {PS_ADM_MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                    )}

                    <div style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, marginBottom: 4 }}>Quem administrou</div>
                    <div style={{ display: "flex", gap: 6, marginBottom: 9, flexWrap: "wrap" }}>
                      {Object.entries(PS_ADM_CATEGORIAS).map(([k, v]) => (
                        <button key={k} onClick={() => setForm(f => ({ ...f, categoria: k }))}
                          style={{ background: form.categoria === k ? v.cor : "transparent", color: form.categoria === k ? "#fff" : "var(--text-3)", border: `1px solid ${form.categoria === k ? v.cor : "var(--border)"}`, borderRadius: 99, padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{v.curto}</button>
                      ))}
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 9 }}>
                      <div style={{ flex: "1 1 200px" }}>
                        <div style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, marginBottom: 4 }}>Hora da administração</div>
                        <input type="datetime-local" value={form.quando} onChange={e => setForm(f => ({ ...f, quando: e.target.value }))} style={inp} />
                      </div>
                      <div style={{ flex: "2 1 260px" }}>
                        <div style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, marginBottom: 4 }}>Observação (opcional)</div>
                        <input value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} placeholder="Ex.: reação no local, dose fracionada…" style={inp} />
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>Registro permanente, assinado como <strong>{currentUser?.name || "—"}</strong>.</span>
                      <button onClick={confirmar} disabled={busy} style={{ marginLeft: "auto", background: form.status === "administrado" ? "#34d399" : "#f43f5e", color: form.status === "administrado" ? "#000" : "#fff", border: "none", borderRadius: 6, padding: "8px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Confirmar checagem"}</button>
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
  );
}
