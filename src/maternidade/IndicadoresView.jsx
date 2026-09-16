// ═══════════════════════════════════════════════════════════
// INDICADORES DA MATERNIDADE — a tela (aba Indicadores)
//
// Lê os partos e os RNs e mostra o que eles dizem em conjunto: a taxa de
// cesárea (global e POR GRUPO DE ROBSON), hemorragia, prematuridade, baixo
// peso e Apgar. O motor (indicadores.js) agrega; aqui só se pinta e se
// recorta por período. Taxa sem denominador aparece como "—", nunca 0%.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useCallback } from "react";
import { relatorioRobson, resumoPartos, resumoRN } from "./indicadores.js";
import { ROBSON } from "./parto.js";
import { carregarIndicadores } from "./dados.js";

const TURQ = "#2dd4bf";
const cx = {
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 13, padding: "16px 18px", marginBottom: 14 },
  rotulo: { fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-muted)" },
  input: { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", color: "var(--text)", fontSize: 13.5, fontFamily: "inherit" },
};

const pct = x => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
const PERIODOS = [{ v: "todos", l: "Todos" }, { v: "ano", l: "Este ano" }, { v: "mes", l: "Este mês" }];

function noPeriodo(dataHora, periodo) {
  if (periodo === "todos") return true;
  const d = new Date(dataHora);
  if (Number.isNaN(d.getTime())) return false;
  const hoje = new Date();
  if (periodo === "ano") return d.getFullYear() === hoje.getFullYear();
  return d.getFullYear() === hoje.getFullYear() && d.getMonth() === hoje.getMonth();
}

function Metrica({ label, valor, sub, cor }) {
  return (
    <div style={{ ...cx.card, marginBottom: 0, flex: "1 1 150px", minWidth: 140 }}>
      <div style={cx.rotulo}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6, color: cor || "var(--text)" }}>{valor}</div>
      {sub && <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function IndicadoresView({ sb }) {
  const [dados, setDados] = useState({ partos: [], rns: [], incompleto: false });
  const [carregando, setCarregando] = useState(true);
  const [periodo, setPeriodo] = useState("todos");

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await carregarIndicadores(sb).catch(() => ({ partos: [], rns: [], incompleto: true }));
    setDados(r);
    setCarregando(false);
  }, [sb]);
  useEffect(() => { carregar(); }, [carregar]);

  const partos = useMemo(() => dados.partos.filter(p => noPeriodo(p.data_hora, periodo)), [dados.partos, periodo]);
  const rns = useMemo(() => dados.rns.filter(r => noPeriodo(r.data_hora, periodo)), [dados.rns, periodo]);
  const robson = useMemo(() => relatorioRobson(partos), [partos]);
  const rp = useMemo(() => resumoPartos(partos), [partos]);
  const rr = useMemo(() => resumoRN(rns), [rns]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>O que os partos e os recém-nascidos dizem juntos. Taxa sem base aparece como "—", não 0%.</p>
        <select value={periodo} onChange={e => setPeriodo(e.target.value)} style={{ ...cx.input, marginLeft: "auto" }}>
          {PERIODOS.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
        </select>
        <button onClick={carregar} disabled={carregando} style={{ background: "transparent", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 12 }}>{carregando ? "Atualizando…" : "Atualizar"}</button>
      </div>

      {dados.incompleto && (
        <div role="alert" style={{ ...cx.card, background: "#7f1d1d22", border: "1px solid #ef444455", color: "#fca5a5", fontSize: 12.5 }}>
          Não consegui ler tudo (partos ou RNs). Os números abaixo podem estar <b>incompletos</b> — atualize antes de decidir por eles.
        </div>
      )}

      {carregando && robson.total === 0 && <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Carregando os indicadores…</p>}

      {!carregando && !dados.incompleto && robson.total === 0 && rr.total === 0 && (
        <div style={{ ...cx.card, color: "var(--text-muted)", fontSize: 13.5, textAlign: "center", padding: 28 }}>
          Ainda não há partos nem recém-nascidos registrados {periodo !== "todos" ? "neste período" : ""}. Os indicadores aparecem conforme os partos forem sendo lançados — isto é o estado real, não uma tela em branco.
        </div>
      )}

      {(robson.total > 0 || rr.total > 0) && (
        <>
          {/* cartões de resumo */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
            <Metrica label="Taxa de cesárea" valor={pct(rp.taxaCesarea)} sub={`${rp.cesareas} de ${rp.total} partos`} cor={TURQ} />
            <Metrica label="Partos" valor={rp.total} sub={`${rp.vaginais} vaginais · ${rp.cesareas} cesáreas`} />
            <Metrica label="Hemorragia pós-parto" valor={pct(rp.taxaHemorragia)} sub={`${rp.hemorragias} de ${rp.comPerda} com perda registrada`} />
            <Metrica label="Natimortos" valor={rp.natimortos} />
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
            <Metrica label="Recém-nascidos" valor={rr.total} />
            <Metrica label="Baixo peso (<2500 g)" valor={pct(rr.taxaBaixoPeso)} sub={`${rr.baixoPeso} de ${rr.comPeso} pesados`} />
            <Metrica label="Prematuridade" valor={pct(rr.taxaPrematuridade)} sub={`${rr.prematuros} de ${rr.comIG} com IG`} />
            <Metrica label="Apgar < 7 (5º min)" valor={pct(rr.taxaApgar5Baixo)} sub={`${rr.apgar5Baixo} de ${rr.comApgar5} avaliados`} />
          </div>

          {/* tabela de Robson */}
          <section style={cx.card}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Classificação de Robson — cesárea por grupo</div>
            <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "0 0 12px" }}>O padrão da OMS: onde a cesárea se concentra. Taxa global {pct(robson.taxaGlobal)} ({robson.cesareas} de {robson.total}){robson.semGrupo ? ` · ${robson.semGrupo} sem grupo` : ""}.</p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead><tr style={{ textAlign: "left", color: "var(--text-muted)", fontSize: 10.5, textTransform: "uppercase" }}>
                  <th style={{ padding: "5px 8px", width: 28 }}>Gr</th>
                  <th style={{ padding: "5px 8px" }}>Descrição</th>
                  <th style={{ padding: "5px 8px", textAlign: "right" }}>Partos</th>
                  <th style={{ padding: "5px 8px", textAlign: "right" }}>Cesáreas</th>
                  <th style={{ padding: "5px 8px", textAlign: "right" }}>Taxa do grupo</th>
                  <th style={{ padding: "5px 8px", textAlign: "right" }}>Contribuição</th>
                </tr></thead>
                <tbody>
                  {robson.grupos.map(g => (
                    <tr key={g.grupo} style={{ borderTop: "1px solid var(--border)", opacity: g.n ? 1 : 0.5 }}>
                      <td style={{ padding: "6px 8px", fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: TURQ }}>{g.grupo}</td>
                      <td style={{ padding: "6px 8px", color: "var(--text-2)" }}>{ROBSON[g.grupo]}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{g.n}{g.n ? <span style={{ color: "var(--text-muted)" }}> ({pct(g.tamanhoRelativo)})</span> : null}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{g.cesareas}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{pct(g.taxaGrupo)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{pct(g.contribuicao)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                  <td style={{ padding: "7px 8px" }} colSpan={2}>Total</td>
                  <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{robson.total}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{robson.cesareas}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: TURQ }}>{pct(robson.taxaGlobal)}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{pct(robson.taxaGlobal)}</td>
                </tr></tfoot>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
