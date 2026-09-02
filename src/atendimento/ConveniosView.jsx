// ═══════════════════════════════════════════════════════════
// CONVÊNIOS & CONTRATOS — a tabela de preço que faltava
//
// 🔴 A TELA EXISTE PARA UMA LISTA: o que o hospital FATURA e não tem preço
// cadastrado para o convênio que vai pagar.
//
// Análises e Receitas já diziam "N itens sem preço" e não davam o que
// fazer. Aqui está o que cadastrar, ordenado pelo conserto mais barato
// primeiro — e com quanto já se lançou às cegas por causa disso.
//
// ⚠️ TRÊS RESPOSTAS, NÃO DUAS. "Vencido" (houve contrato, a vigência
// acabou → pedir aditivo) não é "ausente" (nunca houve → negociar). A
// tela pinta as duas de forma diferente porque mandam a pessoa a lugares
// diferentes.
//
// ⚠️ O CRUD de convênio e plano NÃO mora aqui — está na aba Tabelas do
// Atendimento, e duplicá-lo faria dois cadastros divergirem. Aqui entra o
// que não existe em lugar nenhum: PREÇO e VIGÊNCIA.
//
// As regras estão em `precos.js`, testadas por mutação.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from "react";
import {
   lacunasDePreco, coberturaDoConvenio, regrasDoConvenio,
  recusasDoPreco, SITUACAO,
} from "./precos.js";
import { carregarPrecos, itensComConvenio, salvarPreco, carregarCatalogos } from "./dados.js";
import { reais, centavos } from "./faturamento.js";
import { naoDeuParaLer, avisoDeFalha } from "../util/leitura.js";

const brl = v => reais(centavos(v));

const cx = {
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 13, padding: "16px 18px" },
  rotulo: { fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-muted)" },
  input: { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", color: "var(--text)", fontSize: 14, width: "100%", boxSizing: "border-box", fontFamily: "inherit" },
};

const SELO = {
  [SITUACAO.VENCIDO]: { cor: "#f59e0b", rotulo: "VIGÊNCIA VENCIDA", dica: "Houve contrato e o período acabou — pedir aditivo à operadora." },
  [SITUACAO.AUSENTE]: { cor: "#f43f5e", rotulo: "SEM PREÇO", dica: "Nunca houve preço para este par — precisa cadastrar." },
};

const TABELAS = ["sigtap", "tuss", "cbhpm", "proprio"];
const VAZIO = { convenio_id: "", codigo: "", tabela: "", descricao: "", valor: "", vigencia_inicio: "", vigencia_fim: "", observacao: "" };

function FormPreco({ inicial, precos, convenios, onSalvar, onCancelar, salvando }) {
  const [p, setP] = useState({ ...VAZIO, ...(inicial || {}) });
  const campo = (k, v) => setP(x => ({ ...x, [k]: v }));
  const recusas = recusasDoPreco({ ...p, convenio_id: p.convenio_id === "" ? null : Number(p.convenio_id) }, precos);
  const L = ({ children }) => <div style={{ ...cx.rotulo, marginBottom: 4 }}>{children}</div>;

  return (
    <div style={{ ...cx.card, marginBottom: 18 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>
        {p.id ? `Preço #${p.id}` : "Cadastrar preço"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 12 }}>
        <div>
          <L>Convênio *</L>
          <select style={cx.input} value={p.convenio_id} onChange={e => campo("convenio_id", e.target.value)}>
            <option value="">—</option>
            {convenios.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <div><L>Código *</L><input style={cx.input} value={p.codigo} onChange={e => campo("codigo", e.target.value)} placeholder="0301060088" /></div>
        <div>
          <L>Tabela</L>
          <select style={cx.input} value={p.tabela} onChange={e => campo("tabela", e.target.value)}>
            <option value="">—</option>
            {TABELAS.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: "span 2" }}><L>Descrição</L><input style={cx.input} value={p.descricao} onChange={e => campo("descricao", e.target.value)} /></div>
        <div>
          <L>Valor (R$) *</L>
          <input style={cx.input} value={p.valor} onChange={e => campo("valor", e.target.value)} placeholder="250,00" />
          {/* Zero é válido: procedimento incluso no pacote. Ausente é outra coisa. */}
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.35 }}>
            Zero é válido — procedimento incluso no pacote.
          </div>
        </div>
        <div><L>Vigência início *</L><input type="date" style={cx.input} value={p.vigencia_inicio} onChange={e => campo("vigencia_inicio", e.target.value)} /></div>
        <div>
          <L>Vigência fim</L>
          <input type="date" style={cx.input} value={p.vigencia_fim} onChange={e => campo("vigencia_fim", e.target.value)} />
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.35 }}>
            Em branco = prazo indeterminado.
          </div>
        </div>
      </div>

      {recusas.length > 0 && (
        <ul style={{ margin: "14px 0 0", paddingLeft: 18, color: "#f43f5e", fontSize: 12.5, lineHeight: 1.6 }}>
          {recusas.map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      )}

      <div style={{ display: "flex", gap: 9, marginTop: 16 }}>
        <button disabled={recusas.length > 0 || salvando} onClick={() => onSalvar(p)} style={{
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

export default function ConveniosView({ sb, currentUser, canEdit }) {
  const [precos, setPrecos] = useState([]);
  const [itens, setItens] = useState([]);
  const [convenios, setConvenios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const hoje = new Date();

  async function recarregar() {
    if (!sb) { setCarregando(false); return; }
    setCarregando(true);
    const [ps, is, cat] = await Promise.all([
      carregarPrecos(sb),
      itensComConvenio(sb),
      carregarCatalogos(sb).catch(() => ({ convenios: [] })),
    ]);
    setPrecos(ps); setItens(is); setConvenios(cat?.convenios || []);
    setCarregando(false);
  }
  useEffect(() => { recarregar(); }, [sb]);

  const lacunas = useMemo(() => lacunasDePreco(itens, precos, { hoje }), [itens, precos]);
  const nomeConv = useMemo(() => Object.fromEntries(convenios.map(c => [c.id, c.nome])), [convenios]);

  async function gravar(p) {
    setSalvando(true); setErro("");
    const res = await salvarPreco(sb, { ...p, convenio_id: Number(p.convenio_id) }, currentUser);
    setSalvando(false);
    if (!res.ok) { setErro(res.motivo); return; }
    setForm(null); recarregar();
  }

  const falhou = naoDeuParaLer(precos) || naoDeuParaLer(itens);

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>Convênios &amp; contratos</h2>
      <p style={{ margin: "0 0 6px", color: "var(--text-muted)", fontSize: 13 }}>
        Tabela de preço por operadora, com vigência. É daqui que sai a sugestão de valor da conta.
      </p>
      <p style={{ margin: "0 0 18px", color: "var(--text-muted)", fontSize: 12 }}>
        O cadastro de convênio e plano fica na aba <strong>Tabelas</strong> do Atendimento — aqui entra o que não existe em lugar nenhum: preço e vigência.
      </p>

      {falhou && (
        <div role="alert" style={{ background: "#7f1d1d22", border: "1px solid #ef444455", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12.5, color: "#fca5a5" }}>
          {avisoDeFalha("a tabela de preços ou os itens faturados")}
        </div>
      )}

      {canEdit && !form && (
        <button onClick={() => setForm({})} style={{ background: "#2dd4bf", color: "#062a26", border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13, marginBottom: 18 }}>
          + Cadastrar preço
        </button>
      )}
      {form && <FormPreco inicial={form} precos={precos} convenios={convenios} salvando={salvando} onSalvar={gravar} onCancelar={() => { setForm(null); setErro(""); }} />}
      {erro && <div style={{ background: "#7f1d1d22", border: "1px solid #ef444455", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12.5, color: "#fca5a5" }}>{erro}</div>}

      {carregando ? <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Carregando…</p> : (
        <>
          {/* 🔴 A lista que justifica a tela. */}
          <section style={{ ...cx.card, marginBottom: 18 }}>
            <div style={{ ...cx.rotulo, marginBottom: 2 }}>Faturado sem preço cadastrado ({lacunas.length})</div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10 }}>
              O que o hospital já cobrou sem ter tabela para o convênio que paga.
              <strong> Vigência vencida vem primeiro</strong> — tem contrato e só precisa de aditivo.
            </div>
            {lacunas.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
                {falhou ? "Não foi possível ler." : "Todo item faturado tem preço vigente para o convênio dele."}
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>
                      <th style={{ padding: "6px 8px" }}>Situação</th>
                      <th style={{ padding: "6px 8px" }}>Convênio</th>
                      <th style={{ padding: "6px 8px" }}>Código</th>
                      <th style={{ padding: "6px 8px" }}>Descrição</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Vezes</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Lançado às cegas</th>
                      {canEdit && <th style={{ padding: "6px 8px" }}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {lacunas.map(l => {
                      const s = SELO[l.situacao] || SELO[SITUACAO.AUSENTE];
                      return (
                        <tr key={`${l.convenioId}|${l.codigo}`} style={{ borderTop: "1px solid var(--border)" }}>
                          <td style={{ padding: "8px" }}>
                            <span title={s.dica} style={{ background: `${s.cor}22`, color: s.cor, border: `1px solid ${s.cor}88`, borderRadius: 99, padding: "2px 9px", fontSize: 10.5, fontWeight: 800, whiteSpace: "nowrap" }}>{s.rotulo}</span>
                            {l.ultimoVencido && (
                              <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3 }}>
                                valeu até {l.ultimoVencido.vigencia_fim} · {brl(l.ultimoVencido.valor)}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "8px" }}>{nomeConv[l.convenioId] || `#${l.convenioId}`}</td>
                          <td style={{ padding: "8px", fontFamily: "JetBrains Mono, monospace" }}>{l.codigo}</td>
                          <td style={{ padding: "8px", color: "var(--text-3)", maxWidth: 260 }}>{l.descricao || "—"}</td>
                          <td style={{ padding: "8px", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{l.vezes}</td>
                          <td style={{ padding: "8px", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>
                            {brl(l.valorLancado)}
                            {/* Item sem valor não é item de R$ 0,00. */}
                            {l.semValor > 0 && <div style={{ fontSize: 10.5, color: "#f59e0b" }}>+{l.semValor} sem valor</div>}
                          </td>
                          {canEdit && (
                            <td style={{ padding: "8px" }}>
                              <button onClick={() => setForm({
                                convenio_id: String(l.convenioId), codigo: l.codigo, descricao: l.descricao || "",
                                valor: l.ultimoVencido ? String(l.ultimoVencido.valor).replace(".", ",") : "",
                                vigencia_inicio: "", vigencia_fim: "", tabela: "",
                              })} style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text-3)", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 11.5, whiteSpace: "nowrap" }}>cadastrar</button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {convenios.map(c => {
              const cob = coberturaDoConvenio(precos, c.id, { hoje });
              const regras = regrasDoConvenio(c);
              return (
                <section key={c.id} style={{ ...cx.card, flex: 1, minWidth: 290 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{c.nome}</div>
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5, marginBottom: 8 }}>
                    <span><span style={{ color: "var(--text-muted)" }}>vigentes</span> <strong style={{ fontFamily: "JetBrains Mono, monospace", color: cob.vigentes ? "#22c55e" : "var(--text-muted)" }}>{cob.vigentes}</strong></span>
                    <span><span style={{ color: "var(--text-muted)" }}>vencidos</span> <strong style={{ fontFamily: "JetBrains Mono, monospace", color: cob.vencidos ? "#f59e0b" : "var(--text-muted)" }}>{cob.vencidos}</strong></span>
                    <span><span style={{ color: "var(--text-muted)" }}>futuros</span> <strong style={{ fontFamily: "JetBrains Mono, monospace" }}>{cob.futuros}</strong></span>
                  </div>
                  {/* ⚠️ Vencimento se avisa ANTES: no dia seguinte a conta já saiu sem preço. */}
                  {cob.proximoVencimento && (
                    <div style={{ fontSize: 11.5, color: "#f59e0b", marginBottom: 6 }}>
                      Próxima vigência a vencer: <strong>{cob.proximoVencimento}</strong>
                    </div>
                  )}
                  {regras.length > 0 && (
                    <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.6 }}>
                      {regras.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  )}
                  {cob.total === 0 && (
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 6 }}>Nenhum preço cadastrado ainda.</div>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
