// ═══════════════════════════════════════════════════════════
// NOTIFICAR INCIDENTE EM 30 SEGUNDOS — o botão que vive no casco
//
// Ele aparece em TODA tela do sistema, porque incidente de segurança
// acontece em qualquer lugar, e notificação que exige navegar até o módulo
// não é feita. Cultura justa: sem punição, e vale para quase-erro.
//
// 🔴 POR QUE ELE MORA SOZINHO. Estava dentro de `SegurancaPaciente.jsx`, e o
// casco importava os dois do mesmo arquivo — então o módulo NSP inteiro
// (1.071 linhas, com painéis, RCA, indicadores e assistente) entrava no
// PRIMEIRO CARREGAMENTO de todo mundo, só para o botão existir. Era o único
// dos doze módulos que não podia ser carregado sob demanda.
//
// ⚠️ `if (!sb) return null`: sem conexão o botão não aparece. É deliberado —
// botão de notificar que não grava é pior que botão nenhum, porque a pessoa
// acredita que notificou e vai embora.
// ═══════════════════════════════════════════════════════════

import { useState } from "react";
import { Icon } from "../ui/base.jsx";
import { CLASSES as NSP_CLASSES, TIPOS as NSP_TIPOS } from "./nsp.js";
import { registrarIncidente } from "./nsp-dados.js";
import { nspCorClasse } from "./nsp-cores.js";

export function NotificacaoRapida({ sb, currentUser }) {
  const [aberto, setAberto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [f, setF] = useState({ classe: "near_miss", tipo: "", descricao: "", anonimo: false });
  if (!sb) return null;
  async function enviar() {
    if (busy || !f.descricao.trim()) return;
    setBusy(true);
    await registrarIncidente(sb, { ...f, origem_tipo: "rapida" }, currentUser);
    setBusy(false); setOk(true);
    setTimeout(() => { setOk(false); setAberto(false); setF({ classe: "near_miss", tipo: "", descricao: "", anonimo: false }); }, 1800);
  }
  const campo = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontSize: 13, width: "100%", boxSizing: "border-box" };
  return (<>
    <button onClick={() => setAberto(true)} title="Notificar incidente de segurança (30s)" style={{ position: "fixed", right: 20, bottom: 20, zIndex: 250, background: "#f43f5e", color: "#fff", border: "none", borderRadius: 999, padding: "11px 17px", fontWeight: 800, fontSize: 12.5, cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,.3)", display: "flex", alignItems: "center", gap: 7 }}>
      <Icon name="shield" size={15} />Notificar
    </button>
    {aberto && (
      <div onClick={() => setAberto(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 16 }}>
        <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.3rem", width: 480, maxWidth: "96vw" }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Notificar incidente de segurança</div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 14 }}>Cultura justa, sem punição. Vale para quase-erros também — notificar antes do dano é o que salva.</div>
          {ok ? <div style={{ padding: "1.5rem", textAlign: "center", color: "#34d399", fontWeight: 700 }}>Notificação registrada. Obrigado.</div> : (<>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              {NSP_CLASSES.slice(0, 4).map(c => <button key={c.v} onClick={() => setF(x => ({ ...x, classe: c.v }))} style={{ background: f.classe === c.v ? nspCorClasse(c.v) + "33" : "transparent", color: f.classe === c.v ? nspCorClasse(c.v) : "var(--text-3)", border: `1px solid ${f.classe === c.v ? nspCorClasse(c.v) : "var(--border)"}`, borderRadius: 7, padding: "5px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>{c.l}</button>)}
            </div>
            <select value={f.tipo} onChange={e => setF(x => ({ ...x, tipo: e.target.value }))} style={{ ...campo, marginBottom: 10 }}><option value="">Tipo (opcional)</option>{NSP_TIPOS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}</select>
            <textarea value={f.descricao} onChange={e => setF(x => ({ ...x, descricao: e.target.value }))} rows={3} placeholder="O que aconteceu?" style={{ ...campo, resize: "vertical", marginBottom: 10 }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text)" }}><input type="checkbox" checked={f.anonimo} onChange={e => setF(x => ({ ...x, anonimo: e.target.checked }))} /> Anônimo</label>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setAberto(false)} style={{ background: "transparent", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
                <button onClick={enviar} disabled={busy || !f.descricao.trim()} style={{ background: busy || !f.descricao.trim() ? "#5b76a0" : "#f43f5e", color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 800, fontSize: 13, cursor: busy || !f.descricao.trim() ? "default" : "pointer" }}>{busy ? "…" : "Notificar"}</button>
              </div>
            </div>
          </>)}
        </div>
      </div>
    )}
  </>);
}
