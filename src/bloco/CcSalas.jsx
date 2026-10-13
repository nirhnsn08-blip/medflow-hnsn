// ═══════════════════════════════════════════════════════════
// BLOCO CIRÚRGICO — AS SALAS
//
// O catálogo de salas. Saiu do `BlocoPage.jsx` sem mudança.
// ═══════════════════════════════════════════════════════════

import { useState } from "react";
import { btnContorno } from "../ui/base.jsx";
import { naoDeuParaLer } from "../util/leitura.js";


// Gerenciar salas do bloco
export function CcSalasModal({ salas, onClose, onSave, onDelete, isMaster }) {
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
