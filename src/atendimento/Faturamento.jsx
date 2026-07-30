// ═══════════════════════════════════════════════════════════
// FATURAMENTO — a tela da conta
//
// Só desenho. As regras estão em `faturamento.js` (puras, testadas): por
// qual via a conta sai, o que impede fechar, e a regra que não se negocia —
// atendimento SUS não é cobrado do paciente.
//
// A TELA COMEÇA PELO NÚMERO DO ATENDIMENTO, e não por uma lista. É assim
// que o faturamento trabalha: com a conta na mão, conferindo episódio por
// episódio. Uma lista de tudo que está aberto convida a fechar em massa, e
// conta fechada em massa é conta que ninguém olhou.
//
// O QUE ESTA TELA NÃO FAZ: gerar remessa. BPA, AIH e o XML do TISS têm
// layout versionado e homologação; um gerador escrito contra layout não
// conferido produz arquivo que o DATASUS rejeita inteiro, e a rejeição
// chega no fim do mês.
// ═══════════════════════════════════════════════════════════

import { useState } from "react";
import {
  TIPOS_ITEM, TIPO_ITEM_POR_CHAVE, VIAS, STATUS_CONTA,
  conferirItem, validarFechamento, resumoDaConta, competenciaDe, competenciaLabel,
  reais, centavos,
} from "./faturamento.js";
import {
  carregarAtendimento, carregarPaciente, carregarCatalogos,
  carregarConta, carregarItensDaConta, abrirConta, acrescentarItem,
  cancelarItem, fecharConta, reabrirConta,
} from "./dados.js";
import { comoExibir } from "../pacientes/identidade.js";

const cartao = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.1rem 1.25rem", marginBottom: 14 };
const rotulo = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 };
const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
const lbl = { fontSize: 10.5, color: "var(--text-muted)", display: "block", marginBottom: 3 };
const btn = (cor, ativo = true) => ({
  background: ativo ? cor : "var(--surface-2)", color: ativo ? "#000" : "var(--text-muted)",
  border: ativo ? "none" : "1px solid var(--border)", borderRadius: 6, padding: "8px 15px",
  fontWeight: 700, cursor: ativo ? "pointer" : "not-allowed", fontSize: 12.5, whiteSpace: "nowrap",
});

const ITEM_VAZIO = { tipo: "procedimento", codigo: "", descricao: "", quantidade: "1", valor_unitario: "", executante: "", data_execucao: "", cobrar_do_paciente: false };

export default function Faturamento({ sb, currentUser, canEdit }) {
  const [numero, setNumero] = useState("");
  const [ctx, setCtx] = useState(null);      // { atendimento, paciente, conta, itens }
  const [catalogos, setCatalogos] = useState(null);
  const [novo, setNovo] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function procurar() {
    const n = String(numero).replace(/\D/g, "");
    if (!n) { setMsg({ tom: "erro", texto: "Informe o número do atendimento." }); return; }
    setBusy(true); setMsg(null); setNovo(null);

    const atendimento = await carregarAtendimento(sb, n);
    if (!atendimento) {
      setBusy(false); setCtx(null);
      setMsg({ tom: "erro", texto: `Nenhum atendimento com o número ${n}.` });
      return;
    }
    const [paciente, conta, cat] = await Promise.all([
      carregarPaciente(sb, atendimento.prontuario),
      carregarConta(sb, atendimento.id),
      catalogos ? Promise.resolve(catalogos) : carregarCatalogos(sb),
    ]);
    setCatalogos(cat);
    const itens = conta ? await carregarItensDaConta(sb, conta.id) : [];
    setCtx({ atendimento, paciente, conta, itens });
    setBusy(false);
  }

  async function recarregarConta(atendimentoId) {
    const conta = await carregarConta(sb, atendimentoId);
    const itens = conta ? await carregarItensDaConta(sb, conta.id) : [];
    setCtx(c => (c ? { ...c, conta, itens } : c));
  }

  const cat = catalogos || {};
  const convenio = ctx ? (cat.convenios || []).find(c => String(c.id) === String(ctx.atendimento.convenio_id)) || null : null;
  const plano = ctx ? (cat.planos || []).find(p => String(p.id) === String(ctx.atendimento.plano_id)) || null : null;
  const procedimento = ctx ? (cat.procedimentos || []).find(p => p.codigo === ctx.atendimento.procedimento_cod) || null : null;

  const resumo = ctx ? resumoDaConta({
    conta: ctx.conta, itens: ctx.itens, convenio, atendimento: ctx.atendimento, procedimento,
  }) : null;

  async function abrir() {
    if (!canEdit || busy || !ctx) return;
    setBusy(true);
    const r = await abrirConta(sb, {
      atendimento_id: ctx.atendimento.id, prontuario: ctx.atendimento.prontuario,
      convenio_id: ctx.atendimento.convenio_id, plano_id: ctx.atendimento.plano_id,
      via: resumo?.via, competencia: competenciaDe(ctx.atendimento.chegada_em),
    }, currentUser);
    setBusy(false);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    setMsg({ tom: "ok", texto: `Conta aberta na competência ${competenciaLabel(r.conta.competencia)}.` });
    recarregarConta(ctx.atendimento.id);
  }

  function abrirItem() {
    setMsg(null);
    const p = procedimento;
    setNovo({
      ...ITEM_VAZIO,
      // O procedimento da ficha já vem sugerido — é o ato principal do
      // episódio, e redigitar o código do SIGTAP à mão é onde nasce o
      // código trocado que o processamento rejeita.
      ...(p ? { codigo: p.codigo, descricao: p.nome, valor_unitario: p.valor_sus ?? "" } : {}),
      executante: ctx?.atendimento?.medico || "",
      data_execucao: String(ctx?.atendimento?.chegada_em ?? "").slice(0, 10),
    });
  }

  async function gravarItem() {
    if (!canEdit || busy || !novo || !ctx?.conta) return;
    const v = conferirItem({ conta: ctx.conta, item: novo, via: resumo?.via });
    if (!v.ok) { setMsg({ tom: "erro", texto: v.erros.join(" ") }); return; }
    if (v.avisos.length && !confirm(v.avisos.map(a => `• ${a}`).join("\n\n") + "\n\nAcrescentar assim mesmo?")) return;

    setBusy(true);
    const r = await acrescentarItem(sb, {
      ...novo, conta_id: ctx.conta.id,
      executante_cbo: ctx.atendimento.medico_cbo || null,
    }, currentUser);
    setBusy(false);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    setNovo(null);
    recarregarConta(ctx.atendimento.id);
  }

  async function tirarItem(i) {
    if (!canEdit) return;
    if (!confirm(`Cancelar o item "${i.descricao || i.codigo}"?\n\nNão é apagado — fica marcado como cancelado, para a diferença entre a conta de ontem e a de hoje ter explicação.`)) return;
    const r = await cancelarItem(sb, i.id, currentUser);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    recarregarConta(ctx.atendimento.id);
  }

  async function fechar() {
    if (!canEdit || busy || !ctx?.conta) return;
    const v = validarFechamento({
      conta: ctx.conta, itens: ctx.itens, paciente: ctx.paciente, convenio, plano,
      atendimento: ctx.atendimento, procedimento, catalogos: cat,
    });
    if (!v.ok) { setMsg({ tom: "erro", texto: v.erros.join(" ") }); return; }
    if (v.avisos.length && !confirm(v.avisos.map(a => `• ${a}`).join("\n\n") + "\n\nFechar assim mesmo?")) return;

    setBusy(true);
    const r = await fecharConta(sb, ctx.conta.id, { via: v.via, competencia: ctx.conta.competencia }, currentUser);
    setBusy(false);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    setMsg({ tom: "ok", texto: `Conta fechada em ${competenciaLabel(ctx.conta.competencia)} pela via ${VIAS[v.via]?.label}.` });
    recarregarConta(ctx.atendimento.id);
  }

  async function reabrir() {
    if (!canEdit || !ctx?.conta) return;
    if (!confirm("Reabrir a conta?\n\nO acréscimo feito depois fica com data e autor próprios.")) return;
    const r = await reabrirConta(sb, ctx.conta.id, currentUser);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    recarregarConta(ctx.atendimento.id);
  }

  const podeFechar = ctx?.conta && STATUS_CONTA[ctx.conta.status]?.fechavel;
  const podeReabrir = ctx?.conta && STATUS_CONTA[ctx.conta.status]?.reabrivel;

  return (
    <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Atendimento — Faturamento</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: "1.25rem", lineHeight: 1.55 }}>
        A conta do episódio: procedimento, material e medicamento, com a via que ela segue.
        <strong> Atendimento pelo SUS não é cobrado do paciente em nenhuma hipótese</strong> — a tela recusa,
        e o banco também.
      </div>

      {msg && (
        <div style={{ ...cartao, borderLeft: `4px solid ${msg.tom === "erro" ? "#f43f5e" : "#34d399"}`,
                      background: msg.tom === "erro" ? "#f43f5e10" : "#34d39910", fontSize: 13 }}>
          {msg.texto}
        </div>
      )}

      <div style={cartao}>
        <div style={rotulo}>Procure o atendimento</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={numero} onChange={e => setNumero(e.target.value)}
            onKeyDown={e => e.key === "Enter" && procurar()}
            placeholder="Número do atendimento" style={{ ...inp, flex: 1, minWidth: 200 }} />
          <button onClick={procurar} disabled={busy} style={btn("#22d3ee", !busy)}>
            {busy ? "Procurando…" : "Procurar"}
          </button>
        </div>
      </div>

      {ctx && (
        <>
          {/* ── cabeçalho do episódio ── */}
          <div style={cartao}>
            <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>
                {comoExibir(ctx.paciente, { completo: true }) || ctx.atendimento.iniciais}
              </div>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                atend. #{ctx.atendimento.id} · reg. {ctx.atendimento.prontuario}
                {" · "}{new Date(ctx.atendimento.chegada_em).toLocaleDateString("pt-BR")}
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 6 }}>
              {convenio ? `${convenio.nome}${plano ? ` · ${plano.nome}` : ""}` : "Sem convênio informado no atendimento"}
              {" · via "}<strong>{resumo?.viaLabel}</strong>
              {resumo?.via && <span> ({VIAS[resumo.via].nome})</span>}
            </div>
            {resumo && !resumo.cobraDoPaciente && resumo.via && (
              <div style={{ fontSize: 11.5, color: "#0d9488", marginTop: 4, fontWeight: 700 }}>
                O paciente NÃO pode ser cobrado por nada desta conta.
              </div>
            )}
          </div>

          {/* ── a conta ── */}
          {!ctx.conta ? (
            <div style={cartao}>
              <div style={{ fontSize: 13 }}>Este atendimento ainda não tem conta.</div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.5 }}>
                Abrir a conta cria o vínculo com a competência de {competenciaLabel(competenciaDe(ctx.atendimento.chegada_em))} —
                que é a do dia em que o paciente foi atendido, e não a de hoje.
              </div>
              {canEdit && (
                <button onClick={abrir} disabled={busy} style={{ ...btn("#22d3ee", !busy), marginTop: 12 }}>
                  Abrir conta
                </button>
              )}
            </div>
          ) : (
            <>
              <div style={cartao}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                  <div style={{ ...rotulo, marginBottom: 0 }}>Conta #{ctx.conta.id}</div>
                  <span style={{ fontSize: 12, fontWeight: 700,
                                 color: ctx.conta.status === "aberta" ? "#0d9488" : "#6366f1" }}>
                    {resumo.statusLabel}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    competência {competenciaLabel(ctx.conta.competencia)}
                  </span>
                  {canEdit && ctx.conta.status === "aberta" && !novo && (
                    <button onClick={abrirItem} style={{ ...btn("#34d399"), marginLeft: "auto" }}>+ Item</button>
                  )}
                  {canEdit && podeFechar && (
                    <button onClick={fechar} disabled={busy} style={btn("#22d3ee", !busy)}>Fechar conta</button>
                  )}
                  {canEdit && podeReabrir && (
                    <button onClick={reabrir} style={{ ...btn("var(--surface-2)", false), color: "var(--text)" }}>Reabrir</button>
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
                  <Kpi label="Total" valor={resumo.total} cor="#0d9488" />
                  <Kpi label="Itens" valor={resumo.itens} cor="#6366f1" />
                  <Kpi label="Sem preço" valor={resumo.semPreco} cor={resumo.semPreco ? "#d97706" : "var(--border)"} />
                  {resumo.porTipo.map(t => <Kpi key={t.chave} label={t.label} valor={t.total} cor="#22d3ee" />)}
                </div>
                {resumo.semPreco > 0 && (
                  <div style={{ fontSize: 11.5, color: "#d97706", marginTop: 8, lineHeight: 1.5 }}>
                    {resumo.semPreco} item(ns) sem preço cadastrado. O total sai menor do que é — o catálogo
                    é que está incompleto, não a produção.
                  </div>
                )}
              </div>

              {/* ── itens ── */}
              <div style={cartao}>
                <div style={rotulo}>Itens da conta</div>
                {ctx.itens.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                    Nenhum item ainda. Conta sem item não fecha — fechar vazia transmitiria produção zero
                    e sumiria com o atendimento do faturamento.
                  </div>
                ) : ctx.itens.map(i => (
                  <div key={i.id} style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap",
                                           padding: "7px 0", borderTop: "1px solid var(--border)",
                                           opacity: i.cancelado ? 0.45 : 1 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--text-muted)", width: 92 }}>
                      {TIPO_ITEM_POR_CHAVE[i.tipo]?.label || i.tipo}
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, minWidth: 140 }}>
                      {i.descricao || i.codigo}
                      {i.cancelado && <span style={{ fontWeight: 400, color: "#f43f5e" }}> · cancelado</span>}
                    </span>
                    <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                      {i.codigo ? `${i.codigo} · ` : ""}{Number(i.quantidade)}×{" "}
                      {i.valor_unitario == null ? "sem preço" : reais(centavos(i.valor_unitario))}
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, marginLeft: "auto",
                                   fontFamily: "JetBrains Mono, monospace" }}>
                      {i.valor_total == null ? "—" : reais(centavos(i.valor_total))}
                    </span>
                    {canEdit && !i.cancelado && ctx.conta.status === "aberta" && (
                      <button onClick={() => tirarItem(i)}
                        style={{ ...btn("var(--surface-2)", false), color: "var(--text)", padding: "3px 9px", fontSize: 11 }}>
                        Cancelar
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* ── novo item ── */}
              {novo && (
                <div style={{ ...cartao, borderLeft: "4px solid #34d399" }}>
                  <div style={rotulo}>Novo item</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                    <div>
                      <label style={lbl}>Tipo *</label>
                      <select value={novo.tipo} onChange={e => setNovo(p => ({ ...p, tipo: e.target.value }))} style={inp}>
                        {TIPOS_ITEM.map(t => <option key={t.chave} value={t.chave}>{t.label}</option>)}
                      </select>
                      <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3 }}>
                        {TIPO_ITEM_POR_CHAVE[novo.tipo]?.dica}
                      </div>
                    </div>
                    <div>
                      <label style={lbl}>Código</label>
                      <input value={novo.codigo} onChange={e => setNovo(p => ({ ...p, codigo: e.target.value }))} style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Descrição</label>
                      <input value={novo.descricao} onChange={e => setNovo(p => ({ ...p, descricao: e.target.value }))} style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Quantidade *</label>
                      <input value={novo.quantidade} onChange={e => setNovo(p => ({ ...p, quantidade: e.target.value }))} style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Valor unitário</label>
                      <input value={novo.valor_unitario} onChange={e => setNovo(p => ({ ...p, valor_unitario: e.target.value }))}
                        style={inp} placeholder="Ex.: 10,50" />
                      <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3 }}>
                        Em branco = sem preço cadastrado (diferente de zero).
                      </div>
                    </div>
                    <div>
                      <label style={lbl}>Executante</label>
                      <input value={novo.executante} onChange={e => setNovo(p => ({ ...p, executante: e.target.value }))} style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Data de execução</label>
                      <input type="date" value={novo.data_execucao}
                        onChange={e => setNovo(p => ({ ...p, data_execucao: e.target.value }))} style={inp} />
                    </div>
                    {/* A caixa de cobrança só aparece quando a via permite.
                        Oferecê-la numa conta do SUS ensinaria que existe
                        alguma circunstância em que dá — e não existe. */}
                    {resumo?.cobraDoPaciente && (
                      <div style={{ display: "flex", alignItems: "center", gap: 7, paddingTop: 16 }}>
                        <input id="fat-cobra" type="checkbox" checked={!!novo.cobrar_do_paciente}
                          onChange={e => setNovo(p => ({ ...p, cobrar_do_paciente: e.target.checked }))} />
                        <label htmlFor="fat-cobra" style={{ fontSize: 12.5, cursor: "pointer" }}>Cobrar do paciente</label>
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button onClick={gravarItem} disabled={busy} style={btn("#22d3ee", !busy)}>
                      {busy ? "Gravando…" : "Acrescentar"}
                    </button>
                    <button onClick={() => setNovo(null)} style={{ ...btn("var(--surface-2)", false), color: "var(--text)" }}>Cancelar</button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, valor, cor }) {
  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)",
                  borderLeft: `3px solid ${cor}`, borderRadius: 8, padding: "8px 11px" }}>
      <div style={{ fontSize: 9.5, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, fontFamily: "JetBrains Mono, monospace" }}>{valor}</div>
    </div>
  );
}
