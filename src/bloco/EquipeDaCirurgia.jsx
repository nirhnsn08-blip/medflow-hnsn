// ═══════════════════════════════════════════════════════════
// BLOCO CIRÚRGICO — O PAINEL DA EQUIPE
//
// Quem entrou na sala, com papel, conselho e CBO. Saiu do
// `BlocoPage.jsx` sem mudança. As regras estão em `./equipe.js`.
// ═══════════════════════════════════════════════════════════

import { useState } from "react";
import { PAPEIS_EQUIPE, PAPEL_POR_CHAVE } from "./equipe.js";


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
export function EquipeDaCirurgia({ membros = [], perfis = [], onAdd, onTirar }) {
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
