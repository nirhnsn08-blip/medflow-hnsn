// ═══════════════════════════════════════════════════════════
// CONCILIAÇÃO KARDEX × SALDO — só desenho
//
// Fica ao lado da acuracidade do inventário de propósito: as duas medem a
// mesma coisa por caminhos diferentes. A acuracidade compara o sistema com
// a PRATELEIRA — depende de alguém ir contar. Esta compara o sistema com
// ELE MESMO, e roda sozinha.
//
// A diferença importa quando o saldo está errado: aí a contagem física
// aponta divergência e ninguém sabe se o erro foi de quem contou, de quem
// lançou, ou do próprio sistema. Com a conciliação verde, sobra a
// prateleira; com ela vermelha, o problema é de dentro.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { conciliarAgora } from "./dados.js";
import { prioridadeDaConciliacao } from "./kardex.js";

const VERDE = "#34d399", AMBAR = "#fbbf24", VERMELHO = "#f43f5e", CINZA = "var(--text-muted)";

const num = n => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(n);

export default function ConciliacaoKardex({ sb, itens = [], origem = "suprimentos", chave = "item_id" }) {
  const [r, setR] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [aberto, setAberto] = useState(false);

  const conferir = useCallback(() => {
    if (typeof sb !== "function") return;
    setCarregando(true);
    conciliarAgora(sb, { origem }).then(res => { setR(res); setCarregando(false); });
  }, [sb]);

  useEffect(() => { conferir(); }, [conferir]);

  const nomeDoItem = id => itens.find(i => i.id === id)?.nome || `item ${id}`;

  // Antes da primeira resposta não afirma nada. Um "0 divergências" que
  // aparece porque a consulta ainda não voltou é pior que um espaço vazio:
  // é um atestado de saúde emitido sem exame.
  if (!r && !carregando) return null;

  const problemas = r ? r.divergentes + r.negativos + r.orfaos + (r.tiposInvalidos > 0 ? 1 : 0) : 0;
  const cor = !r?.conciliavel ? CINZA : problemas > 0 ? VERMELHO : VERDE;
  const fila = r?.conciliavel ? prioridadeDaConciliacao(r.linhas) : [];

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderLeft: `4px solid ${cor}`, borderRadius: 10, padding: "12px 14px", marginBottom: "1.25rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>Conciliação kardex × saldo</div>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          o histórico de movimentos bate com o saldo dos lotes?
        </span>
        <button onClick={conferir} disabled={carregando} style={{
          marginLeft: "auto", background: "transparent", color: "var(--text-2)",
          border: "1px solid var(--border-2)", borderRadius: 6, padding: "5px 12px",
          fontSize: 12, fontWeight: 600, cursor: carregando ? "default" : "pointer",
          opacity: carregando ? 0.5 : 1, fontFamily: "Inter, sans-serif",
        }}>{carregando ? "Conferindo…" : "Reconferir"}</button>
      </div>

      {carregando && !r && (
        <div style={{ fontSize: 12, color: CINZA, marginTop: 8 }}>Somando o kardex…</div>
      )}

      {r && !r.conciliavel && (
        // 🔴 Não conciliou ≠ está errado. Com histórico pela metade, quase
        // todo lote pareceria divergente e a equipe caçaria um rombo que
        // não existe. Aqui se diz o que houve, e nada mais.
        <div style={{ fontSize: 12, color: CINZA, marginTop: 8, lineHeight: 1.5 }}>
          {r.motivo === "truncado"
            ? <>Não conferido: o histórico passou do limite desta tela ({num(r.movimentosLidos)} movimentos lidos). Nada aqui indica erro — só que a soma não foi feita.</>
            : <>Não foi possível ler o histórico agora (consulta falhou ou seu perfil não alcança as tabelas de estoque). <strong>Isso não é divergência.</strong></>}
        </div>
      )}

      {r?.conciliavel && problemas === 0 && (
        <div style={{ fontSize: 12.5, color: VERDE, marginTop: 8 }}>
          ✓ {num(r.totalLotes)} lote(s) conferido(s) · {num(r.movimentosLidos)} movimentos · saldo idêntico ao histórico.
        </div>
      )}

      {r?.conciliavel && problemas > 0 && (
        <>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10, fontSize: 12 }}>
            <Selo n={r.negativos} rotulo="lote(s) com saldo negativo" cor={VERMELHO}
              dica="Estado impossível: alguma saída passou por cima da trava de saldo." />
            <Selo n={r.divergentes} rotulo="lote(s) com saldo ≠ histórico" cor={AMBAR} />
            <Selo n={r.tiposInvalidos} rotulo="movimento(s) com tipo inválido" cor={AMBAR}
              dica="Tipo fora de entrada/saida — o trigger antigo subtraía sem conferir saldo." />
            <Selo n={r.orfaos} rotulo="movimento(s) sem lote" cor={AMBAR}
              dica="O histórico aponta para um lote que não existe mais." />
          </div>

          <button onClick={() => setAberto(a => !a)} style={{
            background: "transparent", border: "none", color: "#22d3ee", cursor: "pointer",
            fontSize: 12, fontWeight: 600, padding: "8px 0 0", fontFamily: "Inter, sans-serif",
          }}>{aberto ? "▾ ocultar" : `▸ ver os ${fila.length} lote(s)`}</button>

          {aberto && (
            <div style={{ marginTop: 8, maxHeight: 260, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ color: "var(--text-muted)", textAlign: "left", fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".06em" }}>
                    <th style={{ padding: "5px 8px" }}>Material</th>
                    <th style={{ padding: "5px 8px" }}>Lote</th>
                    <th style={{ padding: "5px 8px", textAlign: "right" }}>Saldo</th>
                    <th style={{ padding: "5px 8px", textAlign: "right" }}>Kardex</th>
                    <th style={{ padding: "5px 8px", textAlign: "right" }}>Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {fila.map(l => (
                    <tr key={l.lote_id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "6px 8px" }}>{nomeDoItem(l[chave])}</td>
                      <td style={{ padding: "6px 8px", fontFamily: "JetBrains Mono, monospace", color: "var(--text-3)" }}>
                        {l.lote || "—"}
                        {l.semHistorico && <span title="Lote com saldo e nenhum movimento no histórico" style={{ marginLeft: 6, fontSize: 10, color: AMBAR }}>sem histórico</span>}
                        {l.tiposInvalidos > 0 && <span title="Movimentos com tipo fora de entrada/saida" style={{ marginLeft: 6, fontSize: 10, color: AMBAR }}>tipo inválido ×{l.tiposInvalidos}</span>}
                      </td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: l.negativo ? VERMELHO : "var(--text)" }}>{num(l.saldo)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: "var(--text-3)" }}>{num(l.kardex)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: l.diferenca === 0 ? "var(--text-muted)" : AMBAR }}>
                        {l.diferenca > 0 ? "+" : ""}{num(l.diferenca)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>
                A conciliação só <strong>aponta</strong>. Ela não corrige nada — acertar saldo pelo sistema, sem contar a prateleira, é
                trocar um número errado por outro. Use a contagem do inventário para decidir qual dos dois está certo.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Selo({ n, rotulo, cor, dica }) {
  if (!n) return null;
  return (
    <span title={dica} style={{ display: "inline-flex", alignItems: "baseline", gap: 5 }}>
      <strong style={{ color: cor, fontFamily: "JetBrains Mono, monospace", fontSize: 14 }}>{n}</strong>
      <span style={{ color: "var(--text-3)" }}>{rotulo}</span>
    </span>
  );
}
