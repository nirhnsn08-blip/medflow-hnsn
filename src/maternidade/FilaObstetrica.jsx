// ═══════════════════════════════════════════════════════════
// FILA OBSTÉTRICA — a tela (landing do módulo)
//
// A primeira coisa que a maternidade mostra: quem são as pacientes
// obstétricas AGORA — vindas da triagem obstétrica do PS e dos leitos
// ocupados do setor maternidade — sem digitar nome. Clicou → cai na admissão
// (falta admitir) ou no partograma (já admitida). O motor (fila.js) decide a
// lista e a ordem; aqui só se pinta e se roteia.
//
// ⚠️ NÃO ELOGIA O VAZIO. Se a leitura falhou, avisa "incompleta"; se veio
// vazia de verdade, diz que não há paciente obstétrica agora — nunca finge
// tranquilidade num banco que não deu para ler.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { carregarFilaObstetrica } from "./dados.js";
import { ESTADO, ORIGEM } from "./fila.js";

const COR_TRIAGEM = { vermelho: "#ef4444", laranja: "#f97316", amarelo: "#f59e0b", verde: "#22c55e", azul: "#3b82f6" };
const ESTADO_INFO = {
  [ESTADO.ADMITIDA]:       { rotulo: "Em trabalho de parto", cor: "#22c55e", acao: "abrir partograma" },
  [ESTADO.AGUARDANDO]:     { rotulo: "Aguardando admissão",  cor: "#f59e0b", acao: "admitir" },
  [ESTADO.SEM_PRONTUARIO]: { rotulo: "Sem cadastro",         cor: "#8fa2bd", acao: "cadastrar e admitir" },
};
const ORIGEM_ROTULO = { [ORIGEM.PS]: "PS", [ORIGEM.LEITO]: "Leito", [ORIGEM.AMBOS]: "PS → leito" };

const cx = {
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 13, padding: "16px 18px", marginBottom: 14 },
  chip: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontFamily: "JetBrains Mono, monospace", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "3px 9px" },
};

function tempoDesde(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const min = Math.floor((Date.now() - t) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

export default function FilaObstetrica({ sb, onEscolher }) {
  const [fila, setFila] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [incompleto, setIncompleto] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await carregarFilaObstetrica(sb).catch(() => ({ ok: false, fila: [], incompleto: true }));
    setFila(r.fila || []);
    setIncompleto(!!r.incompleto);
    setCarregando(false);
  }, [sb]);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
          As pacientes obstétricas de agora — da triagem do PS e dos leitos da maternidade. Clique para admitir ou abrir o partograma.
        </p>
        <button onClick={carregar} disabled={carregando} style={{ marginLeft: "auto", background: "transparent", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 13px", cursor: "pointer", fontSize: 12 }}>
          {carregando ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      {incompleto && (
        <div role="alert" style={{ ...cx.card, background: "#7f1d1d22", border: "1px solid #ef444455", color: "#fca5a5", fontSize: 12.5 }}>
          Não consegui ler todas as fontes (PS, leitos ou episódios). A lista abaixo pode estar <b>incompleta</b> — atualize antes de decidir por ela.
        </div>
      )}

      {carregando && fila.length === 0 && <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Carregando a fila…</p>}

      {!carregando && !incompleto && fila.length === 0 && (
        <div style={{ ...cx.card, color: "var(--text-muted)", fontSize: 13.5, textAlign: "center", padding: 28 }}>
          Nenhuma paciente obstétrica no PS nem em leito da maternidade agora.
          <div style={{ fontSize: 12, marginTop: 6 }}>Isto é o estado real do banco — não uma tela em branco. Quando o PS triar uma gestante ou uma paciente for para um leito da maternidade, ela aparece aqui.</div>
        </div>
      )}

      {fila.length > 0 && (
        <div style={{ ...cx.card, padding: 6 }}>
          {fila.map(item => {
            const ei = ESTADO_INFO[item.estado] || ESTADO_INFO[ESTADO.SEM_PRONTUARIO];
            const t = tempoDesde(item.desde);
            return (
              <button key={item.chave} onClick={() => onEscolher?.(item)} style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
                background: "transparent", border: "none", borderTop: "1px solid var(--border)", borderRadius: 0,
                padding: "11px 12px", cursor: "pointer", color: "var(--text)", fontFamily: "inherit",
              }} onMouseEnter={e => e.currentTarget.style.background = "var(--surface-3)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                {/* ponto da triagem */}
                <span title={item.triagem ? `triagem ${item.triagem}` : "sem triagem no PS"} style={{ flexShrink: 0, width: 10, height: 10, borderRadius: 10, background: COR_TRIAGEM[item.triagem] || "var(--border-2)", border: "1px solid var(--surface)" }} />
                {/* identidade */}
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{item.iniciais || "—"}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace", marginTop: 1 }}>
                    {item.prontuario ? item.prontuario : "sem prontuário"}
                    {item.queixa ? ` · ${item.queixa}` : ""}
                  </span>
                </span>
                {/* leito / origem / tempo */}
                {item.leito && <span style={cx.chip}>leito {item.leito}</span>}
                <span style={{ ...cx.chip, color: "var(--text-muted)" }}>{ORIGEM_ROTULO[item.origem]}</span>
                {t && <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{t}</span>}
                {/* estado */}
                <span style={{ ...cx.chip, color: ei.cor, borderColor: ei.cor, whiteSpace: "nowrap" }}>{ei.rotulo}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
