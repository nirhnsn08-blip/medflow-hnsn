// ═══════════════════════════════════════════════════════════
// RECEITAS — FATURADO × GLOSADO × RECEBIDO
//
// A tela existe para UM número:
//
//     (faturado − glosado) − recebido = a diferença que ninguém explicou
//
// Dinheiro cobrado, não recusado formalmente, e que nunca entrou. Por isso
// ele vem em cartão próprio, maior, e a lista abaixo é ordenada por ele —
// não por competência nem por data.
//
// 🔴 A GLOSA EXPLICA O QUE FALTOU. Receber R$ 700 de uma conta de R$ 1.000
// com R$ 300 de glosa registrada é o sistema funcionando. Sem a glosa, é
// dinheiro perdido sem ninguém saber. A tela precisa deixar essa diferença
// óbvia, senão as duas viram "recebemos menos".
//
// ⚠️ As regras estão em `receitas.js`, testadas por mutação. Aqui só se
// desenha — incluindo o motivo de cada branco.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from "react";
import {
  conciliar, totalGeral, porCompetencia, porConvenio,
  avisosDaReceita, recusasDoRepasse, ESTADOS,
} from "./receitas.js";
import {
  todasAsContas, contasDaCompetencia, itensDasContas,
  glosasDasContas, repassesDasContas, salvarRepasse, carregarCatalogos,
} from "./dados.js";
import { reais, competenciaLabel } from "./faturamento.js";
import { listaLida, naoDeuParaLer } from "../util/leitura.js";

const cx = {
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 13, padding: "16px 18px" },
  rotulo: { fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-muted)" },
  input: { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", color: "var(--text)", fontSize: 14, width: "100%", boxSizing: "border-box", fontFamily: "inherit" },
};

function Cartao({ label, valor, cor, nota, grande }) {
  return (
    <div style={{ ...cx.card, borderLeft: `4px solid ${cor || "var(--border)"}`, minWidth: grande ? 230 : 165, flex: grande ? 1.4 : 1 }}>
      <div style={cx.rotulo}>{label}</div>
      <div style={{ fontSize: grande ? 27 : 22, fontWeight: 800, marginTop: 5, color: cor || "var(--text)", fontFamily: "JetBrains Mono, monospace" }}>{valor}</div>
      {nota && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.35 }}>{nota}</div>}
    </div>
  );
}

function Selo({ estado }) {
  const e = ESTADOS[estado] || ESTADOS.nao_faturada;
  const forte = estado === "parcial" || estado === "a_maior";
  return (
    <span title={e.dica} style={{
      background: forte ? `${e.cor}22` : "transparent", color: e.cor,
      border: `1px solid ${e.cor}${forte ? "88" : "44"}`, borderRadius: 99,
      padding: "2px 9px", fontSize: 10.5, fontWeight: forte ? 800 : 600, whiteSpace: "nowrap",
    }}>{e.label}</span>
  );
}

const VAZIO = { conta_id: "", competencia_repasse: "", valor: "", recebido_em: "", documento: "", observacao: "" };

function FormRepasse({ inicial, onSalvar, onCancelar, salvando }) {
  const [r, setR] = useState({ ...VAZIO, ...(inicial || {}) });
  const campo = (k, v) => setR(x => ({ ...x, [k]: v }));
  const recusas = recusasDoRepasse({ ...r, conta_id: r.conta_id === "" ? null : Number(r.conta_id) });
  const L = ({ children }) => <div style={{ ...cx.rotulo, marginBottom: 4 }}>{children}</div>;

  return (
    <div style={{ ...cx.card, marginBottom: 18 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>
        {r.id ? `Repasse #${r.id}` : "Registrar repasse recebido"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <div><L>Conta *</L><input style={cx.input} value={r.conta_id} onChange={e => campo("conta_id", e.target.value)} placeholder="id da conta" /></div>
        <div>
          <L>Valor (R$) *</L>
          <input style={cx.input} value={r.valor} onChange={e => campo("valor", e.target.value)} placeholder="850,00" />
          {/* Negativo é estorno e passa de propósito — o banco só recusa zero. */}
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.35 }}>
            Negativo = <strong>estorno</strong> (o dinheiro voltou). Zero é recusado.
          </div>
        </div>
        <div><L>Entrou em *</L><input type="date" style={cx.input} value={r.recebido_em} onChange={e => campo("recebido_em", e.target.value)} /></div>
        <div>
          <L>Competência do crédito</L>
          <input style={cx.input} value={r.competencia_repasse} onChange={e => campo("competencia_repasse", e.target.value)} placeholder="2026-09" />
          {/* ⚠️ Não é a competência da produção. Confundir as duas faz a
              receita de setembro aparecer em agosto. */}
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.35 }}>
            Quando o dinheiro <em>entrou</em> — não a competência da produção.
          </div>
        </div>
        <div><L>Documento</L><input style={cx.input} value={r.documento} onChange={e => campo("documento", e.target.value)} placeholder="demonstrativo / OB / lote" /></div>
        <div style={{ gridColumn: "span 2" }}><L>Observação</L><input style={cx.input} value={r.observacao} onChange={e => campo("observacao", e.target.value)} /></div>
      </div>

      {recusas.length > 0 && (
        <ul style={{ margin: "14px 0 0", paddingLeft: 18, color: "#f43f5e", fontSize: 12.5, lineHeight: 1.6 }}>
          {recusas.map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      )}

      <div style={{ display: "flex", gap: 9, marginTop: 16 }}>
        <button disabled={recusas.length > 0 || salvando} onClick={() => onSalvar(r)} style={{
          background: recusas.length ? "var(--surface-3)" : "#2dd4bf",
          color: recusas.length ? "var(--text-muted)" : "#062a26",
          border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 700,
          cursor: recusas.length || salvando ? "not-allowed" : "pointer", fontSize: 13,
        }}>{salvando ? "Gravando…" : "Gravar"}</button>
        <button onClick={onCancelar} style={{ background: "transparent", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
      </div>
    </div>
  );
}

export default function ReceitasView({ sb, currentUser, canEdit, competencia }) {
  const [contas, setContas] = useState([]);
  const [itens, setItens] = useState({ porConta: {}, falhou: false });
  const [glosas, setGlosas] = useState({ porConta: {}, falhou: false });
  const [repasses, setRepasses] = useState({ porConta: {}, falhou: false });
  const [convenios, setConvenios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function recarregar() {
    if (!sb) { setCarregando(false); return; }
    setCarregando(true);
    const cs = await (competencia
      ? contasDaCompetencia(sb, competencia, { limite: 1000 })
      : todasAsContas(sb, { limite: 1000 })).catch(() => listaLida(null));
    const ids = listaLida(cs).map(c => c.id);
    const [its, gls, reps, cat] = await Promise.all([
      itensDasContas(sb, ids),
      glosasDasContas(sb, ids),
      repassesDasContas(sb, ids),
      carregarCatalogos(sb).catch(() => ({ convenios: [] })),
    ]);
    setContas(cs); setItens(its); setGlosas(gls); setRepasses(reps);
    setConvenios(cat?.convenios || []);
    setCarregando(false);
  }
  useEffect(() => { recarregar(); }, [sb, competencia]);

  const linhas = useMemo(() => conciliar({
    contas, itensPorConta: itens.porConta,
    glosasPorConta: glosas.porConta, repassesPorConta: repasses.porConta,
  }), [contas, itens, glosas, repasses]);

  const t = useMemo(() => totalGeral(linhas), [linhas]);
  const porComp = useMemo(() => porCompetencia(linhas), [linhas]);
  const porConv = useMemo(() => porConvenio(linhas, convenios), [linhas, convenios]);
  const avisos = useMemo(() => avisosDaReceita(linhas, {
    itensFalharam: itens.falhou, glosasFalharam: glosas.falhou, repassesFalharam: repasses.falhou,
  }), [linhas, itens, glosas, repasses]);

  // A lista de trabalho: só o que foi faturado, do maior buraco para o menor.
  const fila = useMemo(
    () => linhas.filter(l => l.estado !== "nao_faturada" && l.estado !== "quitada")
                .sort((a, b) => (b.diferenca ?? 0) - (a.diferenca ?? 0)),
    [linhas]);

  async function gravar(r) {
    setSalvando(true); setErro("");
    const res = await salvarRepasse(sb, { ...r, conta_id: Number(r.conta_id) }, currentUser);
    setSalvando(false);
    if (!res.ok) { setErro(res.motivo); return; }
    setForm(null); recarregar();
  }

  const semLeitura = itens.falhou || glosas.falhou || repasses.falhou || naoDeuParaLer(contas);

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>Receitas</h2>
      <p style={{ margin: "0 0 18px", color: "var(--text-muted)", fontSize: 13 }}>
        Faturado × glosado × recebido, por competência e por convênio.
        {competencia ? ` Competência ${competenciaLabel(competencia) || competencia}.` : " Todo o histórico."}
      </p>

      {avisos.map((av, i) => (
        <div key={i} role="alert" style={{
          background: av.tipo === "leitura" ? "#7f1d1d22" : "#78350f22",
          border: `1px solid ${av.tipo === "leitura" ? "#ef444455" : "#f59e0b55"}`,
          borderRadius: 8, padding: "10px 14px", marginBottom: 10,
          fontSize: 12.5, color: av.tipo === "leitura" ? "#fca5a5" : "#fcd34d", lineHeight: 1.45,
        }}>{av.texto}</div>
      ))}

      {carregando ? <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Carregando…</p> : (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "14px 0 20px" }}>
            <Cartao label="Faturado" valor={reais(t.faturado)} nota={`${t.contas} conta(s)`} />
            <Cartao label="Glosado" valor={reais(t.glosado)} cor={t.glosado > 0 ? "#f43f5e" : undefined} nota="recusado formalmente" />
            <Cartao label="Recebido" valor={reais(t.recebido)} cor="#22c55e" nota="o que entrou" />
            {/* 🔴 O número da tela. Vem por último e maior de propósito. */}
            <Cartao
              grande
              label="Diferença sem explicação"
              valor={semLeitura ? "—" : reais(t.diferenca)}
              cor={semLeitura ? undefined : t.diferenca > 0 ? "#f43f5e" : "var(--text)"}
              nota={semLeitura
                ? "não foi possível ler — não é zero"
                : "faturado − glosado − recebido. Cobrado, não recusado, e nunca entrou."}
            />
          </div>

          <section style={{ ...cx.card, marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
              <div>
                <div style={cx.rotulo}>A conciliar ({fila.length})</div>
                <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 3 }}>
                  Do maior buraco para o menor. Conta quitada e conta ainda não faturada ficam fora.
                </div>
              </div>
              {canEdit && !form && (
                <button onClick={() => setForm({})} style={{ background: "#2dd4bf", color: "#062a26", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" }}>
                  + Registrar repasse
                </button>
              )}
            </div>

            {form && <FormRepasse inicial={form} salvando={salvando} onSalvar={gravar} onCancelar={() => { setForm(null); setErro(""); }} />}
            {erro && <div style={{ background: "#7f1d1d22", border: "1px solid #ef444455", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12.5, color: "#fca5a5" }}>{erro}</div>}

            {fila.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
                {naoDeuParaLer(contas) ? "Não foi possível ler." : "Nenhuma conta faturada com diferença."}
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>
                      <th style={{ padding: "6px 8px" }}>Situação</th>
                      <th style={{ padding: "6px 8px" }}>Conta</th>
                      <th style={{ padding: "6px 8px" }}>Comp.</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Faturado</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Glosado</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Recebido</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Diferença</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Dias</th>
                      {canEdit && <th style={{ padding: "6px 8px" }}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {fila.map(l => (
                      <tr key={l.contaId} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px" }}><Selo estado={l.estado} /></td>
                        <td style={{ padding: "8px" }}>#{l.contaId}{l.prontuario ? ` · ${l.prontuario}` : ""}</td>
                        <td style={{ padding: "8px", color: "var(--text-3)" }}>{l.competencia || "—"}</td>
                        <td style={{ padding: "8px", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{reais(l.faturado)}</td>
                        <td style={{ padding: "8px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: l.glosado ? "#f43f5e" : "var(--text-muted)" }}>{l.glosado ? reais(l.glosado) : "—"}</td>
                        <td style={{ padding: "8px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: l.recebido ? "#22c55e" : "var(--text-muted)" }}>{l.repasses ? reais(l.recebido) : "—"}</td>
                        <td style={{ padding: "8px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: l.diferenca == null ? "var(--text-muted)" : l.diferenca > 0 ? "#f43f5e" : "#a78bfa" }}>
                          {l.diferenca == null ? "—" : reais(l.diferenca)}
                        </td>
                        {/* ⚠️ Dias desde o faturamento, sem prazo inventado: quem tem
                            o contrato julga se 40 dias é normal ou tarde. */}
                        <td style={{ padding: "8px", textAlign: "right", color: "var(--text-3)", fontFamily: "JetBrains Mono, monospace" }}>{l.diasDesdeFaturamento ?? "—"}</td>
                        {canEdit && (
                          <td style={{ padding: "8px" }}>
                            <button onClick={() => setForm({ conta_id: String(l.contaId), competencia_repasse: "", valor: "", recebido_em: "", documento: "" })} style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text-3)", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 11.5, whiteSpace: "nowrap" }}>+ repasse</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <section style={{ ...cx.card, flex: 1, minWidth: 300 }}>
              <div style={{ ...cx.rotulo, marginBottom: 10 }}>Por competência</div>
              {porComp.length === 0 ? <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>Sem dado.</p> : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <tbody>
                    {porComp.map(c => (
                      <tr key={c.competencia} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "7px 6px" }}>{competenciaLabel(c.competencia) || c.competencia}</td>
                        <td style={{ padding: "7px 6px", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{reais(c.faturado)}</td>
                        <td style={{ padding: "7px 6px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: "#22c55e" }}>{reais(c.recebido)}</td>
                        <td style={{ padding: "7px 6px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: c.diferenca > 0 ? "#f43f5e" : "var(--text-muted)" }}>{reais(c.diferenca)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section style={{ ...cx.card, flex: 1, minWidth: 300 }}>
              <div style={{ ...cx.rotulo, marginBottom: 2 }}>Por convênio</div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 8 }}>Do maior buraco para o menor — é onde vale cobrar primeiro.</div>
              {porConv.length === 0 ? <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>Sem dado.</p> : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <tbody>
                    {porConv.map(c => (
                      <tr key={c.convenioId} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "7px 6px" }}>{c.nome}</td>
                        <td style={{ padding: "7px 6px", textAlign: "right", color: "var(--text-muted)" }}>{c.contas}×</td>
                        <td style={{ padding: "7px 6px", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{reais(c.faturado)}</td>
                        <td style={{ padding: "7px 6px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: c.diferenca > 0 ? "#f43f5e" : "var(--text-muted)" }}>{reais(c.diferenca)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
