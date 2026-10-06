// ═══════════════════════════════════════════════════════════
// ESCOLHER O QUE VAI SER REGISTRADO — na tela, não num prompt
//
// 🔴 O QUE ISTO SUBSTITUI. O desfecho da consulta, o motivo da falta e o do
// cancelamento eram escolhidos assim:
//
//     prompt("1 - Atendido\n2 - Evadiu\n3 - Encaminhado\n\nDigite o número:")
//
// Três problemas, e o terceiro é o grave:
//   • a janela é bloqueante e sem lista clicável — teclar 2 em vez de 1 é
//     um movimento de dedo, e o balcão trabalha com pressa;
//   • o texto de ajuda de cada opção não cabe ali, então a diferença entre
//     "evadiu" e "encaminhado" ficava na cabeça de quem registra;
//   • DESFECHO NÃO SE CORRIGE nesta tela — o erro de digitação vira
//     registro permanente, e é ele que decide se a consulta é faturada.
//
// Aqui cada opção é um botão com a sua explicação, e o que é irreversível
// diz que é ANTES de gravar.
// ═══════════════════════════════════════════════════════════

import { useState } from "react";

const caixa = {
  marginTop: 8, padding: "10px 12px", borderRadius: 8,
  border: "1px solid var(--border-2)", background: "var(--surface-2)", fontSize: 12.5,
};
const opcao = (ativa, cor) => ({
  display: "block", width: "100%", textAlign: "left", cursor: "pointer",
  background: ativa ? `${cor}1a` : "var(--surface)",
  border: `1px solid ${ativa ? cor : "var(--border)"}`,
  borderRadius: 8, padding: "8px 11px", marginBottom: 6, color: "var(--text)",
});
const btn = (cor, ativo = true) => ({
  background: ativo ? cor : "var(--surface-2)", color: ativo ? "#fff" : "var(--text-muted)",
  border: ativo ? "none" : "1px solid var(--border)", borderRadius: 6, padding: "7px 14px",
  fontWeight: 700, cursor: ativo ? "pointer" : "not-allowed", fontSize: 12.5, whiteSpace: "nowrap",
});
const neutro = { ...btn("var(--surface-2)", false), color: "var(--text)", cursor: "pointer" };

/**
 * `opcoes`: `[{ chave, label, dica }]`. `motivo` liga o campo de texto
 * obrigatório (o cancelamento precisa dele; a falta já se explica pela
 * opção escolhida).
 */
export default function EscolhaRegistro({
  titulo, aviso, opcoes = [], cor = "#6366f1", confirmar = "Registrar",
  motivo = null, onEscolher, onCancelar, busy = false,
}) {
  const [chave, setChave] = useState("");
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState(null);

  function registrar() {
    if (busy) return;
    if (!chave) { setErro("Escolha uma opção."); return; }
    if (motivo?.obrigatorio && !texto.trim()) { setErro(motivo.faltando); return; }
    setErro(null);
    onEscolher(chave, texto.trim() || null);
  }

  return (
    <div style={caixa} role="group" aria-label={titulo}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>{titulo}</div>
      {aviso && <div style={{ color: "#fbbf24", marginBottom: 8 }}>{aviso}</div>}

      {opcoes.map(o => (
        <button key={o.chave} onClick={() => { setChave(o.chave); setErro(null); }}
          aria-pressed={chave === o.chave} style={opcao(chave === o.chave, cor)}>
          <strong style={{ fontSize: 13 }}>{o.label}</strong>
          {o.dica && <span style={{ display: "block", fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>{o.dica}</span>}
        </button>
      ))}

      {motivo && (
        <div style={{ marginTop: 6 }}>
          <label style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>
            {motivo.label}{motivo.obrigatorio ? " *" : ""}
          </label>
          <input value={texto} onChange={e => { setTexto(e.target.value); setErro(null); }}
            placeholder={motivo.placeholder || ""}
            style={{ background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6,
                     padding: "7px 10px", color: "var(--text)", fontSize: 13, width: "100%", boxSizing: "border-box" }} />
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button onClick={registrar} disabled={busy} style={btn(cor, !busy)}>{busy ? "Registrando…" : confirmar}</button>
        <button onClick={onCancelar} style={neutro}>Fechar</button>
      </div>

      {erro && <div role="alert" style={{ marginTop: 8, color: "#fb7185" }}>{erro}</div>}
    </div>
  );
}
