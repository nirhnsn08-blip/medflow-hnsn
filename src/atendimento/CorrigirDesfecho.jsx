// ═══════════════════════════════════════════════════════════
// CORRIGIR O DESFECHO — a tela
//
// Fica em Consultas, na linha do episódio, porque é ali que o erro é
// DESCOBERTO: alguém procura o atendimento meses depois (a conta não bateu,
// o paciente reclamou) e vê "evadiu" onde houve consulta. Na Agenda o
// episódio já saiu da tela.
//
// O que esta tela NÃO faz: editar o campo. Ela grava uma correção, e o
// banco aplica as duas coisas no mesmo INSERT. Ver `dados.js`.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { carregarCorrecoesDeDesfecho, corrigirDesfecho } from "./dados.js";
import {
  opcoesDeCorrecao, motivoParaNaoCorrigir, conferirCorrecao, avisoDeCorrecao, efeitoNaConta, MOTIVO_MIN,
} from "./correcao-desfecho.js";
import { naoDeuParaLer } from "../util/leitura.js";
import { horaFmt } from "../util/datas.js";

const caixa = { marginTop: 8, padding: "11px 13px", borderRadius: 8, fontSize: 12.5,
                border: "1px solid var(--border-2)", background: "var(--surface-2)" };
const opcao = (ativa) => ({
  display: "block", width: "100%", textAlign: "left", cursor: "pointer",
  background: ativa ? "#22d3ee1a" : "var(--surface)",
  border: `1px solid ${ativa ? "#22d3ee" : "var(--border)"}`,
  borderRadius: 8, padding: "7px 10px", marginBottom: 5, color: "var(--text)",
});
const btn = (cor, ativo = true) => ({
  background: ativo ? cor : "var(--surface-2)", color: ativo ? "#000" : "var(--text-muted)",
  border: ativo ? "none" : "1px solid var(--border)", borderRadius: 6, padding: "7px 14px",
  fontWeight: 700, cursor: ativo ? "pointer" : "not-allowed", fontSize: 12.5,
});
const neutro = { ...btn("var(--surface-2)", false), color: "var(--text)", cursor: "pointer" };

export default function CorrigirDesfecho({ sb, atendimento, currentUser, onCorrigido, onFechar }) {
  const [para, setPara] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState(null);
  const [busy, setBusy] = useState(false);

  const impedido = motivoParaNaoCorrigir(atendimento);
  const opcoes = opcoesDeCorrecao(atendimento);
  const efeito = para ? efeitoNaConta(atendimento?.desfecho, para) : null;

  async function gravar() {
    const falta = conferirCorrecao({ atendimento, para, motivo });
    if (falta) { setErro(falta); return; }
    setBusy(true); setErro(null);
    const r = await corrigirDesfecho(sb, {
      atendimentoId: atendimento.id, de: atendimento.desfecho, para, motivo,
    }, currentUser);
    setBusy(false);
    // A frase de recusa vem do BANCO (ver dados.js): é ela que sabe se a
    // conta está fechada ou se alguém mudou o desfecho no meio.
    if (!r.ok) { setErro(r.motivo); return; }
    onCorrigido?.({ ...atendimento, desfecho: para });
  }

  if (impedido) {
    return (
      <div style={{ ...caixa, borderLeft: "3px solid #d97706" }} role="alert">
        {impedido}
        <div style={{ marginTop: 9 }}><button onClick={onFechar} style={neutro}>Fechar</button></div>
      </div>
    );
  }

  return (
    <div style={{ ...caixa, borderLeft: "3px solid #22d3ee" }} role="group" aria-label="Corrigir o desfecho">
      <div style={{ fontWeight: 700 }}>
        Corrigir o desfecho do atendimento #{atendimento.id}
      </div>
      <div style={{ color: "var(--text-muted)", marginTop: 2, lineHeight: 1.5 }}>
        Hoje está <strong>"{String(atendimento.desfecho).replace(/_/g, " ")}"</strong>.
        O registro antigo <strong>não é apagado</strong>: a correção entra como linha nova, com motivo e autor —
        e quem conferir a conta amanhã vê as duas.
      </div>

      <div style={{ marginTop: 10, marginBottom: 4, fontSize: 11, color: "var(--text-3)", fontWeight: 700 }}>
        O que realmente aconteceu
      </div>
      {opcoes.map(o => (
        <button key={o.chave} onClick={() => { setPara(o.chave); setErro(null); }}
          aria-pressed={para === o.chave} style={opcao(para === o.chave)}>
          <strong style={{ fontSize: 13 }}>{o.label}</strong>
          {o.dica && <span style={{ display: "block", fontSize: 11.5, color: "var(--text-muted)" }}>{o.dica}</span>}
        </button>
      ))}

      {/* A consequência no dinheiro, dita ANTES de gravar: é o motivo pelo
          qual esta correção existe, e quem corrige precisa saber o que vai
          acontecer com a conta. */}
      {efeito && (
        <div style={{ marginTop: 6, fontSize: 11.5, color: "#fbbf24", lineHeight: 1.45 }}>{efeito}</div>
      )}

      <div style={{ marginTop: 10 }}>
        <label style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 700, display: "block", marginBottom: 3 }}>
          Por que o registro muda *
        </label>
        <textarea value={motivo} onChange={e => { setMotivo(e.target.value); setErro(null); }} rows={2}
          placeholder="Ex.: a consulta aconteceu; a recepção marcou evadiu por engano ao encerrar a fila."
          style={{ background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6,
                   padding: "7px 10px", color: "var(--text)", fontSize: 13, width: "100%",
                   boxSizing: "border-box", resize: "vertical", fontFamily: "Inter, sans-serif" }} />
        <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3 }}>
          {motivo.trim().length}/{MOTIVO_MIN} — quem ler isto daqui a um ano precisa entender o que houve.
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button onClick={gravar} disabled={busy} style={btn("#22d3ee", !busy)}>
          {busy ? "Registrando…" : "Registrar a correção"}
        </button>
        <button onClick={onFechar} style={neutro}>Fechar</button>
      </div>

      {erro && <div role="alert" style={{ marginTop: 9, color: "#fb7185", lineHeight: 1.45 }}>{erro}</div>}
    </div>
  );
}

/**
 * O histórico de correções embaixo da linha do episódio.
 *
 * ⚠️ "Não consegui ler" não vira "nunca foi corrigido": sem esta diferença,
 * uma oscilação de rede faria o desfecho corrigido parecer original — que é
 * a leitura sob a qual alguém decide que a conta está certa.
 */
export function HistoricoDeCorrecoes({ sb, atendimento }) {
  const [correcoes, setCorrecoes] = useState(null);

  useEffect(() => {
    let vivo = true;
    if (!sb || !atendimento?.id) return;
    carregarCorrecoesDeDesfecho(sb, atendimento.id).then(r => { if (vivo) setCorrecoes(r); });
    return () => { vivo = false; };
    // `desfecho` entra na chave de propósito: corrigir não troca o episódio
    // de lugar na lista, então sem ele a linha mostrava o desfecho NOVO e
    // seguia dizendo que nunca houve correção — a tela contradizendo a si
    // mesma logo depois de gravar.
  }, [sb, atendimento?.id, atendimento?.desfecho]);

  if (correcoes === null) return null;
  if (naoDeuParaLer(correcoes)) {
    return (
      <div style={{ flexBasis: "100%", fontSize: 11, color: "#fb7185" }}>
        Não consegui ler o histórico de correções deste desfecho — ele pode ter sido corrigido.
      </div>
    );
  }
  const aviso = avisoDeCorrecao(correcoes);
  if (!aviso) return null;

  return (
    <div style={{ flexBasis: "100%", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
      <span style={{ color: "#fbbf24", fontWeight: 700 }}>✎ {aviso.texto}</span>
      {correcoes.map(c => (
        <div key={c.id} style={{ marginTop: 2, fontStyle: "italic" }}>
          {c.de || "sem desfecho"} → {c.para} · {c.usuario || "—"} · {horaFmt(c.criado_em)}
        </div>
      ))}
    </div>
  );
}
