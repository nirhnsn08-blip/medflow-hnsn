// ═══════════════════════════════════════════════════════════
// PREVISÕES — quanto ainda entra, e quando
//
// 🔴 A REGRA DE DESENHO: esta tela mostra primeiro o que é FATO (a receber,
// por idade) e só depois o que é ESTIMATIVA (o calendário). A ordem importa
// — número de previsão ao lado de número de fato, com a mesma tipografia,
// vira tudo fato na cabeça de quem lê.
//
// Por isso o calendário tem rótulo próprio ("estimativa") e some inteiro
// quando o histórico é curto, em vez de sair de um prazo inventado.
//
// ⚠️ ELA NÃO PROJETA PRODUÇÃO FUTURA. Só distribui no tempo o que já foi
// faturado. Adivinhar quanto o hospital vai faturar em novembro exige um
// modelo de demanda que este sistema não tem.
//
// As regras estão em `previsoes.js`, testadas por mutação.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from "react";
import { panorama, MIN_OBSERVACOES } from "./previsoes.js";
import { conciliar } from "./receitas.js";
import {
  todasAsContas, itensDasContas, glosasDasContas, repassesDasContas,
} from "./dados.js";
import { reais, competenciaLabel } from "./faturamento.js";
import { listaLida } from "../util/leitura.js";

const cx = {
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 13, padding: "16px 18px" },
  rotulo: { fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-muted)" },
};

const COR_AVISO = {
  leitura:  { bg: "#7f1d1d22", bd: "#ef444455", tx: "#fca5a5" },
  amostra:  { bg: "#1e3a8a22", bd: "#3b82f655", tx: "#93c5fd" },
  dispersao:{ bg: "#78350f22", bd: "#f59e0b55", tx: "#fcd34d" },
  sem_data: { bg: "#78350f22", bd: "#f59e0b55", tx: "#fcd34d" },
  atraso:   { bg: "#7f1d1d22", bd: "#ef444455", tx: "#fca5a5" },
};

export default function PrevisoesView({ sb }) {
  const [contas, setContas] = useState([]);
  const [itens, setItens] = useState({ porConta: {}, falhou: false });
  const [glosas, setGlosas] = useState({ porConta: {}, falhou: false });
  const [repasses, setRepasses] = useState({ porConta: {}, falhou: false });
  const [carregando, setCarregando] = useState(true);
  const hoje = new Date();

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!sb) { if (vivo) setCarregando(false); return; }
      setCarregando(true);
      const cs = await todasAsContas(sb, { limite: 1000 }).catch(() => listaLida(null));
      const ids = listaLida(cs).map(c => c.id);
      const [its, gls, reps] = await Promise.all([
        itensDasContas(sb, ids), glosasDasContas(sb, ids), repassesDasContas(sb, ids),
      ]);
      if (!vivo) return;
      setContas(cs); setItens(its); setGlosas(gls); setRepasses(reps); setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [sb]);

  const linhas = useMemo(() => conciliar({
    contas, itensPorConta: itens.porConta,
    glosasPorConta: glosas.porConta, repassesPorConta: repasses.porConta, hoje,
  }), [contas, itens, glosas, repasses]);

  const p = useMemo(() => panorama({
    conciliacoes: linhas, contas, repassesPorConta: repasses.porConta, hoje,
  }), [linhas, contas, repasses]);

  const maxMes = Math.max(...p.projecao.meses.map(m => m.valor), 1);
  const maxFaixa = Math.max(...p.aging.faixas.map(f => f.valor), 1);

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>Previsões</h2>
      <p style={{ margin: "0 0 6px", color: "var(--text-muted)", fontSize: 13 }}>
        Quanto ainda entra do que <strong>já foi faturado</strong>, e quando.
      </p>
      {/* A recusa dita em voz alta, para ninguém procurar o que não está aqui. */}
      <p style={{ margin: "0 0 18px", color: "var(--text-muted)", fontSize: 12 }}>
        Não projeta produção futura — só distribui no tempo o que já saiu daqui cobrado.
        O prazo vem dos repasses reais, não de um parâmetro.
      </p>

      {p.avisos.map((av, i) => {
        const c = COR_AVISO[av.tipo] || COR_AVISO.dispersao;
        return (
          <div key={i} role="alert" style={{
            background: c.bg, border: `1px solid ${c.bd}`, borderRadius: 8,
            padding: "10px 14px", marginBottom: 10, fontSize: 12.5, color: c.tx, lineHeight: 1.45,
          }}>{av.texto}</div>
        );
      })}

      {carregando ? <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Carregando…</p> : (
        <>
          {/* ── FATO ────────────────────────────────────────── */}
          <section style={{ ...cx.card, marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={cx.rotulo}>A receber — por quanto tempo já espera</div>
                <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 3 }}>
                  Fato, não estimativa: são contas com data. Quanto mais velha a faixa, menor a chance de o dinheiro entrar.
                </div>
              </div>
              <div style={{ fontSize: 27, fontWeight: 800, fontFamily: "JetBrains Mono, monospace", color: "#2dd4bf" }}>
                {reais(p.aging.total)}
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              {p.aging.faixas.map(f => (
                <div key={f.chave} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
                  <div style={{ width: 96, fontSize: 12, color: "var(--text-3)" }}>{f.label}</div>
                  <div style={{ flex: 1, background: "var(--surface-3)", borderRadius: 4, height: 18, overflow: "hidden" }}>
                    <div style={{ width: `${Math.round((f.valor / maxFaixa) * 100)}%`, height: "100%", background: `${f.cor}66`, borderRight: `2px solid ${f.cor}` }} />
                  </div>
                  <div style={{ width: 116, textAlign: "right", fontSize: 12.5, fontFamily: "JetBrains Mono, monospace", color: f.valor ? f.cor : "var(--text-muted)" }}>
                    {reais(f.valor)}
                  </div>
                  <div style={{ width: 42, textAlign: "right", fontSize: 11.5, color: "var(--text-muted)" }}>{f.contas}×</div>
                </div>
              ))}
              {/* Conta sem data não tem idade — e não é enfiada em faixa nenhuma. */}
              {p.aging.semData.valor > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, paddingTop: 8, borderTop: "1px dashed var(--border)" }}>
                  <div style={{ width: 96, fontSize: 12, color: "#f59e0b" }}>sem data</div>
                  <div style={{ flex: 1, fontSize: 11.5, color: "var(--text-muted)" }}>faturada sem `faturada_em` — não tem idade para classificar</div>
                  <div style={{ width: 116, textAlign: "right", fontSize: 12.5, fontFamily: "JetBrains Mono, monospace", color: "#f59e0b" }}>{reais(p.aging.semData.valor)}</div>
                  <div style={{ width: 42, textAlign: "right", fontSize: 11.5, color: "var(--text-muted)" }}>{p.aging.semData.contas}×</div>
                </div>
              )}
            </div>
          </section>

          {/* ── ESTIMATIVA ──────────────────────────────────── */}
          <section style={{ ...cx.card, marginBottom: 18 }}>
            <div style={{ ...cx.rotulo, marginBottom: 2 }}>
              Calendário — <span style={{ color: "#93c5fd" }}>estimativa</span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10 }}>
              {p.projecao.confiavel
                ? <>Faturamento + <strong>{p.projecao.prazo.mediana} dias</strong> — a mediana de {p.projecao.prazo.n} repasse(s) já observado(s) (de {p.projecao.prazo.min} a {p.projecao.prazo.max}).</>
                : <>Não desenhado: são precisos {MIN_OBSERVACOES} repasses observados e há {p.projecao.prazo.n}.</>}
            </div>

            {p.projecao.atrasado > 0 && (
              <div style={{ background: "#7f1d1d22", border: "1px solid #ef444455", borderRadius: 8, padding: "9px 13px", marginBottom: 12, fontSize: 12.5, color: "#fca5a5" }}>
                <strong style={{ fontFamily: "JetBrains Mono, monospace" }}>{reais(p.projecao.atrasado)}</strong> já passou do prazo típico — isto é atraso, não previsão.
              </div>
            )}

            {!p.projecao.confiavel ? (
              <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
                O valor a receber acima está certo. O calendário fica em branco de propósito, em vez de sair de um prazo inventado.
              </p>
            ) : (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end", minHeight: 120, overflowX: "auto", paddingTop: 6 }}>
                {p.projecao.meses.map(m => (
                  <div key={m.competencia} style={{ textAlign: "center", minWidth: 68 }}>
                    <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginBottom: 4, fontFamily: "JetBrains Mono, monospace" }}>
                      {m.valor ? reais(m.valor) : "—"}
                    </div>
                    <div style={{ height: 84, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                      <div style={{
                        width: 34,
                        height: Math.max(3, Math.round((m.valor / maxMes) * 84)),
                        background: m.valor ? "#38bdf855" : "var(--surface-3)",
                        border: `1px solid ${m.valor ? "#38bdf8" : "var(--border)"}`,
                        borderRadius: "3px 3px 0 0",
                      }} />
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 5 }}>
                      {competenciaLabel(m.competencia) || m.competencia}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={cx.card}>
            <div style={{ ...cx.rotulo, marginBottom: 10 }}>O prazo observado</div>
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap", fontSize: 13 }}>
              {[
                ["repasses observados", p.projecao.prazo.n],
                ["mediana", p.projecao.prazo.mediana == null ? "—" : `${p.projecao.prazo.mediana} d`],
                ["média", p.projecao.prazo.media == null ? "—" : `${p.projecao.prazo.media} d`],
                ["mais rápido", p.projecao.prazo.min == null ? "—" : `${p.projecao.prazo.min} d`],
                ["mais lento", p.projecao.prazo.max == null ? "—" : `${p.projecao.prazo.max} d`],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{k}</div>
                  <div style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, marginTop: 2 }}>{v}</div>
                </div>
              ))}
            </div>
            {/* Por que mediana, dito na tela e não só no código. */}
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 10, lineHeight: 1.5 }}>
              A projeção usa a <strong>mediana</strong>, não a média: prazo de pagamento tem cauda longa, e um único
              repasse muito demorado moveria a média para um prazo em que nenhum pagamento aconteceu.
            </div>
          </section>
        </>
      )}
    </div>
  );
}
