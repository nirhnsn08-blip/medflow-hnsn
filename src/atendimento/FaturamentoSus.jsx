// ═══════════════════════════════════════════════════════════
// MÓDULO FATURAMENTO (SUS) — a tela
//
// Primeira aba: o SIGTAP. Lista read-only dos procedimentos que o hospital
// fatura e um testador da glosa de permanência (permanência real × média).
// Toda a lógica é pura e testável em ./sigtap.js — aqui só a tela.
//
// Cresce depois: conta montada do prontuário e a trava de glosa completa
// (quando o pacote do DATASUS trouxer valores, CID e CBO).
//
// NÃO é o Faturamento.jsx do Adauam (a conta por atendimento, no módulo
// Atendimento). São coisas diferentes; a relação entre as duas a gente
// alinha depois.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from "react";
import {
  montarProcedimento, codigoFormatado, viaDoProcedimento,
  avaliarPermanencia, avaliarGlosa, GRAVIDADES,
} from "./sigtap.js";

const VIA_LABEL = { aih: "AIH", apac: "APAC", bpa: "BPA" };
const COR_GRAV = { [GRAVIDADES.IMPEDIMENTO]: "#ef4444", [GRAVIDADES.ATENCAO]: "#f59e0b" };
const TEAL = "#2dd4bf";

const cx = {
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 },
  rotulo: { fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--text-muted)" },
  input: { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", color: "var(--text)", fontSize: 14 },
};

export default function FaturamentoPage({ sb, currentUser, canEdit }) {
  const [rows, setRows] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [selCodigo, setSelCodigo] = useState("");
  const [dias, setDias] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = sb ? await sb("sigtap_procedimentos?select=*&order=codigo") : [];
        if (vivo) setRows(Array.isArray(r) ? r : []);
      } catch {
        if (vivo) setRows([]);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [sb]);

  // linha crua do banco → modelo do motor
  const procs = useMemo(() => rows.map(r => montarProcedimento({
    codigo: r.codigo, nome: r.nome, via: r.via, mediaPermanencia: r.media_permanencia,
    valorSh: r.valor_sh, valorSp: r.valor_sp, valorSa: r.valor_sa,
    sexo: r.sexo, idadeMin: r.idade_min, idadeMax: r.idade_max,
  })), [rows]);

  const competencia = rows[0]?.competencia || null;

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return procs;
    const soDigitos = q.replace(/\D/g, "");
    return procs.filter(p =>
      (p.nome || "").toLowerCase().includes(q) ||
      (soDigitos && (p.codigo || "").includes(soDigitos)));
  }, [procs, busca]);

  const sel = procs.find(p => p.codigo === selCodigo) || null;
  const diasN = /^\d+$/.test(String(dias).trim()) ? Number(dias) : null;
  const achados = sel ? avaliarGlosa({ proc: sel, permanenciaDias: diasN }) : [];
  const perm = sel ? avaliarPermanencia(sel, diasN) : null;

  return (
    <div style={{ padding: 20, overflow: "auto", color: "var(--text)" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>Faturamento · SIGTAP</h2>
      <p style={{ margin: "0 0 4px", color: "var(--text-2)", fontSize: 14 }}>
        Tabela de procedimentos do SUS. {procs.length} procedimento(s) que o hospital fatura
        {competencia ? ` · competência ${competencia}` : ""}.
      </p>
      <p style={{ margin: "0 0 16px", color: "var(--text-muted)", fontSize: 12 }}>
        Referência oficial, somente leitura. Valores, CID e CBO entram com o pacote do DATASUS.
      </p>

      {carregando ? (
        <p style={{ color: "var(--text-muted)" }}>Carregando…</p>
      ) : procs.length === 0 ? (
        <div style={{ ...cx.card, color: "var(--text-2)" }}>
          Nenhum procedimento carregado. A migração <code>migracao-sigtap.sql</code> já rodou
          neste banco? (Sem ela, a tabela ainda não existe — é esperado até você rodar o SQL.)
        </div>
      ) : (
        <>
          {/* ── Testador de glosa de permanência ── */}
          <section style={{ ...cx.card, marginBottom: 16 }}>
            <div style={cx.rotulo}>Testar glosa de permanência</div>
            {!sel ? (
              <p style={{ margin: "8px 0 0", color: "var(--text-muted)", fontSize: 13 }}>
                Clique num procedimento na lista abaixo para simular.
              </p>
            ) : (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {codigoFormatado(sel.codigo)} — {sel.nome}
                </div>
                <div style={{ margin: "4px 0 12px", fontSize: 12, color: "var(--text-muted)" }}>
                  Via {VIA_LABEL[viaDoProcedimento(sel)] || "—"} · média de permanência{" "}
                  {sel.mediaPermanencia ?? "—"} {sel.mediaPermanencia != null ? "dia(s)" : ""}
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  Dias de internação:
                  <input
                    type="number" min="0" value={dias}
                    onChange={e => setDias(e.target.value)}
                    style={{ ...cx.input, width: 90 }} placeholder="ex.: 12"
                  />
                </label>

                {diasN == null ? null : perm?.media == null ? (
                  <p style={{ marginTop: 12, color: "var(--text-muted)", fontSize: 13 }}>
                    Sem média cadastrada — nada a comparar.
                  </p>
                ) : achados.length === 0 ? (
                  <p style={{ marginTop: 12, color: TEAL, fontSize: 13, fontWeight: 600 }}>
                    ✓ {perm.texto}
                  </p>
                ) : (
                  <ul style={{ marginTop: 12, paddingLeft: 0, listStyle: "none", display: "grid", gap: 6 }}>
                    {achados.map((a, i) => (
                      <li key={i} style={{
                        fontSize: 13, padding: "8px 10px", borderRadius: 8,
                        border: `1px solid ${COR_GRAV[a.gravidade] || "var(--border)"}`,
                        color: COR_GRAV[a.gravidade] || "var(--text)",
                        background: "var(--surface-2)",
                      }}>
                        <strong style={{ textTransform: "uppercase", fontSize: 11 }}>
                          {a.gravidade === GRAVIDADES.IMPEDIMENTO ? "Impedimento" : "Atenção"}
                        </strong>{" · "}{a.texto}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          {/* ── Lista read-only ── */}
          <section style={cx.card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
              <div style={cx.rotulo}>Procedimentos ({filtrados.length})</div>
              <input
                value={busca} onChange={e => setBusca(e.target.value)}
                placeholder="Buscar por nome ou código…"
                style={{ ...cx.input, minWidth: 220, flex: "0 1 320px" }}
              />
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
                    <th style={{ padding: "6px 8px" }}>Código</th>
                    <th style={{ padding: "6px 8px" }}>Procedimento</th>
                    <th style={{ padding: "6px 8px" }}>Via</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>Média perm.</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(p => {
                    const ativo = p.codigo === selCodigo;
                    return (
                      <tr
                        key={p.codigo}
                        onClick={() => setSelCodigo(p.codigo)}
                        style={{
                          cursor: "pointer",
                          borderTop: "1px solid var(--border)",
                          background: ativo ? "var(--surface-3)" : "transparent",
                        }}
                      >
                        <td style={{ padding: "6px 8px", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                          {codigoFormatado(p.codigo)}
                        </td>
                        <td style={{ padding: "6px 8px" }}>{p.nome}</td>
                        <td style={{ padding: "6px 8px" }}>{VIA_LABEL[viaDoProcedimento(p)] || "—"}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right" }}>{p.mediaPermanencia ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
