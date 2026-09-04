// ═══════════════════════════════════════════════════════════
// OS MODAIS DO ALMOXARIFADO
//
// Saíram de `SuprimentosPage.jsx` em 04/09/2026, quando ele tinha 3.560
// linhas. Onze janelas de formulário — item, movimento, contagem, NF-e,
// requisição, cotação, pedido, recebimento, kardex e fornecedor.
//
// ⚠️ ELES NÃO SÃO DA TELA, SÃO DO MÓDULO. Cada um resolve uma tarefa
// inteira e é chamado de um ou dois lugares; ficar no mesmo arquivo da
// página só os tornava difíceis de achar.
//
// ⚠️ TODOS EXPORTADOS. Antes, `SupInventarioView` e `SupContagemModal` já
// eram exportados de propósito (a Farmácia reaproveita a contagem); os
// outros nove eram locais. Exportar todos não muda comportamento — o
// `no-unused-vars` continua guardando quem não é usado.
// ═══════════════════════════════════════════════════════════

import { farmFmtQtd, normTxt } from "../clinico/alertas.js";
import { infoDeValidade } from "../farmacia/validade.js";
import { VX, campoTexto, rotuloCampo } from "../ui/base.jsx";
import { fmtDataBR } from "../util/datas.js";
import { fmtBRL, fmtReais } from "../util/formato.js";
import { SUP_CATEGORIAS, SUP_MOTIVOS_SAIDA, SUP_UNIDADES } from "./catalogo.js";
import { comprarParaConsumo, custoPorUnidadeConsumo, descreverEntrada, temConversao, validarConversao } from "./conversao.js";
import { loadSupMovimentos } from "./dados.js";
import { descreverPlano, idsJaEstornados, planejarAjuste, podeEstornar } from "./inventario.js";
import { SUP_LEAD_PADRAO, supSaldoTotal } from "./kardex.js";
import { parseNFe } from "./nfe.js";
import { casarComCatalogo, ehSetorNovo } from "./setores.js";
import { useEffect, useState } from "react";

// Montagem de uma requisição: setor + itens do catálogo com quantidades
export function SupNovaReqModal({ itens, setores, lotes, onClose, onSave }) {
  const [setor, setSetor] = useState(setores[0]?.nome || "");
  const [obs, setObs] = useState("");
  const [lista, setLista] = useState([]);          // [{item_id, nome, unidade, qtd}]
  const [itemSel, setItemSel] = useState("");
  const [qtd, setQtd] = useState("");
  const [busy, setBusy] = useState(false);
  const itensDisp = itens.filter(i => !lista.some(x => x.item_id === i.id))
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
  const sel = itens.find(i => String(i.id) === String(itemSel));
  const saldoSel = sel ? supSaldoTotal(sel.id, lotes) : null;

  function adicionar() {
    const q = Number(qtd);
    if (!sel) { alert("Escolha o material."); return; }
    if (!q || q <= 0) { alert("Informe uma quantidade maior que zero."); return; }
    setLista(l => [...l, { item_id: sel.id, nome: sel.nome, unidade: sel.unidade || "", qtd: q }]);
    setItemSel(""); setQtd("");
  }
  async function salvar() {
    if (!setor.trim()) { alert("Informe o setor solicitante."); return; }
    if (!lista.length) { alert("Adicione pelo menos um material."); return; }
    setBusy(true);
    await onSave({ setor: setor.trim(), itens: lista, observacao: obs.trim() || null, status: "aguardando" });
    setBusy(false);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 540, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Nova requisição de materiais</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={rotuloCampo}>Setor solicitante *</label>
            {setores.length ? (
              <select value={setor} onChange={e => setSetor(e.target.value)} style={campoTexto}>
                {setores.map(s => <option key={s.nome} value={s.nome}>{s.nome}</option>)}
                <option value="">Outro…</option>
              </select>
            ) : (
              <input value={setor} onChange={e => setSetor(e.target.value)} placeholder="Ex.: Posto 2" style={campoTexto} autoFocus />
            )}
          </div>
          {setores.length > 0 && setor === "" && (
            <div>
              <label style={rotuloCampo}>Nome do setor</label>
              <input value={setor} onChange={e => setSetor(e.target.value)} placeholder="Digite o setor" style={campoTexto} autoFocus />
            </div>
          )}
        </div>

        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", marginBottom: 8 }}>Adicionar material</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 90px auto", gap: 8, alignItems: "end" }}>
            <div>
              <label style={rotuloCampo}>Material</label>
              <select value={itemSel} onChange={e => setItemSel(e.target.value)} style={campoTexto}>
                <option value="">— escolha —</option>
                {itensDisp.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
              </select>
            </div>
            <div>
              <label style={rotuloCampo}>Qtd *</label>
              <input type="number" min="0" step="any" value={qtd} onChange={e => setQtd(e.target.value)} placeholder="0" style={campoTexto} />
            </div>
            <button onClick={adicionar} style={{ background: "var(--surface-3)", color: "var(--text-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Add</button>
          </div>
          {sel && <div style={{ fontSize: 11, color: saldoSel > 0 ? "var(--text-muted)" : "#d97706", marginTop: 6 }}>Saldo atual no almoxarifado: <strong>{farmFmtQtd(saldoSel)} {sel.unidade || ""}</strong>{saldoSel <= 0 ? " — sem estoque; a requisição pode ficar parcial." : ""}</div>}
        </div>

        {lista.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 12 }}>
            {lista.map((x, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "6px 10px" }}>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, minWidth: 40, textAlign: "right" }}>{farmFmtQtd(x.qtd)}</span>
                <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-2)" }}>{x.nome}{x.unidade ? ` (${x.unidade})` : ""}</span>
                <button onClick={() => setLista(l => l.filter((_, j) => j !== i))} style={{ background: "transparent", border: "none", color: "#f43f5e", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>✕</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={rotuloCampo}>Observação</label>
          <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Urgência, detalhe do pedido…" style={campoTexto} />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={salvar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Enviar requisição"}</button>
        </div>
      </div>
    </div>
  );
}

// Nova cotação: descrição + fornecedores a comparar + itens (material/medicamento)
export function SupNovaCotacaoModal({ materiais, meds, forns, onClose, onSave }) {
  const [descricao, setDescricao] = useState("");
  const [fids, setFids] = useState([]);
  const [lista, setLista] = useState([]);   // [{tipo, item_id, nome, unidade, qtd}]
  const [tipoSel, setTipoSel] = useState("material");
  const [itemSel, setItemSel] = useState("");
  const [qtd, setQtd] = useState("");
  const [busy, setBusy] = useState(false);
  const base = tipoSel === "material" ? materiais : meds;
  const disp = base.filter(i => !lista.some(x => x.tipo === tipoSel && x.item_id === i.id)).sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
  const sel = base.find(i => String(i.id) === String(itemSel));
  const toggleForn = id => setFids(f => f.includes(id) ? f.filter(x => x !== id) : [...f, id]);

  function add() {
    const q = Number(qtd);
    if (!sel) { alert("Escolha o item."); return; }
    if (!q || q <= 0) { alert("Informe a quantidade."); return; }
    setLista(l => [...l, { tipo: tipoSel, item_id: sel.id, nome: sel.nome, unidade: sel.unidade || "", qtd: q }]);
    setItemSel(""); setQtd("");
  }
  async function salvar() {
    if (fids.length < 1) { alert("Escolha ao menos um fornecedor para cotar."); return; }
    if (!lista.length) { alert("Adicione ao menos um item."); return; }
    setBusy(true);
    await onSave({ descricao: descricao.trim() || null, fornecedores: fids, itens: lista.map(x => ({ ...x, precos: {} })), status: "aberta" });
    setBusy(false);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 600, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Nova cotação</div>
        <div style={{ marginBottom: 12 }}>
          <label style={rotuloCampo}>Descrição (opcional)</label>
          <input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex.: Compra mensal de EPI" style={campoTexto} autoFocus />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={rotuloCampo}>Fornecedores a comparar *</label>
          {forns.length === 0 ? <div style={{ fontSize: 12, color: "#d97706" }}>Cadastre fornecedores primeiro (aba Fornecedores).</div> : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {forns.map(f => <button key={f.id} onClick={() => toggleForn(f.id)} style={{ background: fids.includes(f.id) ? VX.turquesa : "transparent", color: fids.includes(f.id) ? "#062a26" : "var(--text-3)", border: `1px solid ${fids.includes(f.id) ? VX.turquesa : "var(--border)"}`, borderRadius: 99, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{f.nome}</button>)}
            </div>
          )}
        </div>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            {["material", "medicamento"].map(t => <button key={t} onClick={() => { setTipoSel(t); setItemSel(""); }} style={{ flex: 1, background: tipoSel === t ? VX.turquesa : "transparent", color: tipoSel === t ? "#062a26" : "var(--text-3)", border: `1px solid ${tipoSel === t ? VX.turquesa : "var(--border)"}`, borderRadius: 7, padding: "6px 0", fontWeight: 700, cursor: "pointer", fontSize: 12.5 }}>{t === "material" ? "Material" : "Medicamento"}</button>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 80px auto", gap: 8, alignItems: "end" }}>
            <div><label style={rotuloCampo}>Item</label><select value={itemSel} onChange={e => setItemSel(e.target.value)} style={campoTexto}><option value="">— escolha —</option>{disp.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}</select></div>
            <div><label style={rotuloCampo}>Qtd</label><input type="number" min="0" step="any" value={qtd} onChange={e => setQtd(e.target.value)} placeholder="0" style={campoTexto} /></div>
            <button onClick={add} style={{ background: "var(--surface-3)", color: "var(--text-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Add</button>
          </div>
        </div>
        {lista.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>
            {lista.map((x, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "6px 10px" }}>
                <span style={{ fontSize: 9.5, color: x.tipo === "medicamento" ? "#6366f1" : "var(--text-muted)", border: `1px solid ${x.tipo === "medicamento" ? "#6366f155" : "var(--border-2)"}`, borderRadius: 99, padding: "0 6px", fontWeight: 700 }}>{x.tipo === "medicamento" ? "MED" : "MAT"}</span>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, minWidth: 40, textAlign: "right" }}>{farmFmtQtd(x.qtd)}</span>
                <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-2)", minWidth: 0 }}>{x.nome}</span>
                <button onClick={() => setLista(l => l.filter((_, j) => j !== i))} style={{ background: "transparent", border: "none", color: "#f43f5e", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>✕</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={salvar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Criar cotação"}</button>
        </div>
      </div>
    </div>
  );
}

// Comparação da cotação: matriz preço × fornecedor, destaca o mais barato, gera pedido
export function SupCotacaoModal({ cot, forns, canEdit, busy, onClose, onSalvar, onGerar }) {
  const fById = {}; forns.forEach(f => fById[f.id] = f);
  const [itens, setItens] = useState(() => (Array.isArray(cot.itens) ? cot.itens : []).map(x => ({ ...x, precos: { ...(x.precos || {}) } })));
  const fids = (cot.fornecedores || []).map(String);
  const readonly = cot.status !== "aberta" || !canEdit;
  const setPreco = (i, fid, v) => setItens(l => l.map((x, j) => j === i ? { ...x, precos: { ...x.precos, [fid]: v } } : x));

  const vencedor = itens.map(it => {
    let melhor = null;
    fids.forEach(fid => { const p = Number(it.precos?.[fid]); if (p > 0 && (melhor == null || p < melhor.preco)) melhor = { fid, preco: p }; });
    return melhor;
  });
  const totalForn = {}; fids.forEach(fid => totalForn[fid] = itens.reduce((s, it) => s + (Number(it.precos?.[fid]) || 0) * Number(it.qtd || 0), 0));
  // "Melhor fornecedor único" só entre os que cotaram TODOS os itens — senão um
  // fornecedor com itens em branco pareceria mais barato (total menor) e enganaria.
  const precificouTudo = fid => itens.length > 0 && itens.every(it => Number(it.precos?.[fid]) > 0);
  const melhorFornGeral = fids.filter(precificouTudo).sort((a, b) => totalForn[a] - totalForn[b])[0];
  const totalPorItem = itens.reduce((s, it, i) => s + (vencedor[i] ? vencedor[i].preco * Number(it.qtd || 0) : 0), 0);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 820, maxWidth: "96vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{cot.descricao || `Cotação #${cot.id}`}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>{readonly ? "Somente leitura." : "Digite o preço unitário que cada fornecedor passou. O mais barato de cada item fica destacado."}</div>

        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10, marginBottom: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 560 }}>
            <thead><tr style={{ background: "var(--surface-2)", textAlign: "left", color: "var(--text-3)", fontSize: 10.5, textTransform: "uppercase" }}>
              <th style={{ padding: "8px 10px" }}>Item</th>
              <th style={{ padding: "8px 10px", textAlign: "right" }}>Qtd</th>
              {fids.map(fid => <th key={fid} style={{ padding: "8px 10px", textAlign: "right" }}>{fById[fid]?.nome || `#${fid}`}{fById[fid]?.lead_time_dias != null ? <span style={{ fontWeight: 400, textTransform: "none" }}> · {fById[fid].lead_time_dias}d</span> : ""}</th>)}
              <th style={{ padding: "8px 10px", textAlign: "right" }}>Melhor</th>
            </tr></thead>
            <tbody>
              {itens.map((it, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "7px 10px", fontWeight: 600 }}><span style={{ fontSize: 9, color: it.tipo === "medicamento" ? "#6366f1" : "var(--text-muted)", border: `1px solid ${it.tipo === "medicamento" ? "#6366f155" : "var(--border-2)"}`, borderRadius: 99, padding: "0 5px", marginRight: 6 }}>{it.tipo === "medicamento" ? "MED" : "MAT"}</span>{it.nome}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{farmFmtQtd(it.qtd)}</td>
                  {fids.map(fid => { const venc = vencedor[i]?.fid === fid; return (
                    <td key={fid} style={{ padding: "7px 10px", textAlign: "right", background: venc ? "#34d39918" : "transparent" }}>
                      {readonly
                        ? <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: venc ? 800 : 400, color: venc ? "#0d9488" : "var(--text-2)" }}>{Number(it.precos?.[fid]) > 0 ? fmtReais(it.precos[fid]) : "—"}</span>
                        : <input type="number" min="0" step="any" value={it.precos?.[fid] ?? ""} onChange={e => setPreco(i, fid, e.target.value)} placeholder="—" style={{ ...campoTexto, width: 82, padding: "5px 7px", fontSize: 12, textAlign: "right", borderColor: venc ? "#34d399" : "var(--border)" }} />}
                    </td>
                  ); })}
                  <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 800, fontFamily: "JetBrains Mono, monospace", color: "#0d9488" }}>{vencedor[i] ? fmtReais(vencedor[i].preco) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr style={{ borderTop: "2px solid var(--border)", background: "var(--surface-2)" }}>
              <td style={{ padding: "8px 10px", fontWeight: 700 }} colSpan={2}>Total por fornecedor</td>
              {fids.map(fid => <td key={fid} style={{ padding: "8px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 800, color: fid === melhorFornGeral ? "#0d9488" : "var(--text-2)" }}>{totalForn[fid] > 0 ? fmtReais(totalForn[fid]) : "—"}{fid === melhorFornGeral && totalForn[fid] > 0 ? " ✓" : ""}{totalForn[fid] > 0 && !precificouTudo(fid) ? <span title="Cotou só parte dos itens" style={{ color: "#d97706", fontWeight: 700 }}> ⚠</span> : ""}</td>)}
              <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 800, color: "#0d9488" }}>{fmtReais(totalPorItem)}</td>
            </tr></tfoot>
          </table>
        </div>

        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 14 }}>
          <strong>Melhor preço por item:</strong> {fmtReais(totalPorItem)} (divide entre fornecedores) · <strong>Melhor fornecedor único:</strong> {melhorFornGeral ? `${fById[melhorFornGeral]?.nome} — ${fmtReais(totalForn[melhorFornGeral])}` : "nenhum cotou todos os itens ainda"}. O ⚠ marca quem cotou só parte. O prazo de entrega (dias) aparece no cabeçalho para pesar preço × prazo.
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Fechar</button>
          {!readonly && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => onSalvar(cot, itens)} disabled={busy} style={{ background: "transparent", color: VX.azul, border: `1px solid ${VX.azul}66`, borderRadius: 6, padding: "9px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Salvar preços"}</button>
              <button onClick={() => { onSalvar(cot, itens); onGerar({ ...cot, itens }, "porItem"); }} disabled={busy} style={{ background: "#34d399", color: "#000", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Gerar pedido (melhor por item)</button>
              {melhorFornGeral && <button onClick={() => { onSalvar(cot, itens); onGerar({ ...cot, itens }, "unico", melhorFornGeral); }} disabled={busy} style={{ background: "transparent", color: "#0d9488", border: "1px solid #0d948866", borderRadius: 6, padding: "9px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Pedido único ({fById[melhorFornGeral]?.nome})</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Montagem do pedido de compra: fornecedor + itens (material/medicamento)
export function SupNovoPedidoModal({ forns, materiais, meds, sugMat, sugMed, onClose, onSave }) {
  const [fornId, setFornId] = useState(forns[0]?.id || "");
  const [prev, setPrev] = useState("");
  const [obs, setObs] = useState("");
  const [lista, setLista] = useState([]);   // [{tipo, item_id, nome, unidade, qtd, custo_unit}]
  const [tipoSel, setTipoSel] = useState("material");
  const [itemSel, setItemSel] = useState("");
  const [qtd, setQtd] = useState("");
  const [busy, setBusy] = useState(false);
  const base = tipoSel === "material" ? materiais : meds;
  const disponiveis = base.filter(i => !lista.some(x => x.tipo === tipoSel && x.item_id === i.id))
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
  const sel = base.find(i => String(i.id) === String(itemSel));
  const total = lista.reduce((s, x) => s + Number(x.qtd || 0) * Number(x.custo_unit || 0), 0);

  function adicionar() {
    const q = Number(qtd);
    if (!sel) { alert("Escolha o item."); return; }
    if (!q || q <= 0) { alert("Informe uma quantidade maior que zero."); return; }
    setLista(l => [...l, { tipo: tipoSel, item_id: sel.id, nome: sel.nome, unidade: sel.unidade || "", qtd: q, custo_unit: Number(sel.custo_unitario || 0) || "" }]);
    setItemSel(""); setQtd("");
  }
  function importarSugestoes() {
    const novos = [...sugMat, ...sugMed].filter(s => !lista.some(x => x.tipo === s.tipo && x.item_id === s.item_id))
      .map(s => ({ tipo: s.tipo, item_id: s.item_id, nome: s.nome, unidade: s.unidade, qtd: s.qtd, custo_unit: s.custo_unit }));
    if (!novos.length) { alert("Nenhuma sugestão nova para importar."); return; }
    setLista(l => [...l, ...novos]);
  }
  function mudarLinha(i, k, v) {
    setLista(l => l.map((x, j) => j === i ? { ...x, [k]: v } : x));
  }
  async function salvar() {
    if (!lista.length) { alert("Adicione pelo menos um item."); return; }
    if (lista.some(x => !Number(x.qtd) || Number(x.qtd) <= 0)) { alert("Todas as quantidades devem ser maiores que zero."); return; }
    const forn = forns.find(f => String(f.id) === String(fornId));
    setBusy(true);
    await onSave({
      fornecedor_id: forn?.id || null,
      fornecedor_nome: forn?.nome || null,
      itens: lista.map(x => ({ ...x, qtd: Number(x.qtd), custo_unit: Number(x.custo_unit || 0) || null, qtd_recebida: 0 })),
      previsao_entrega: prev || null,
      observacao: obs.trim() || null,
      status: "aberto",
    });
    setBusy(false);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 620, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Novo pedido de compra</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={rotuloCampo}>Fornecedor</label>
            <select value={fornId} onChange={e => setFornId(e.target.value)} style={campoTexto}>
              <option value="">— definir depois —</option>
              {forns.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div>
            <label style={rotuloCampo}>Entrega prevista</label>
            <input type="date" value={prev} onChange={e => setPrev(e.target.value)} style={campoTexto} />
          </div>
        </div>

        {(sugMat.length > 0 || sugMed.length > 0) && (
          <button onClick={importarSugestoes} style={{ width: "100%", background: "#d9770614", border: "1px solid #d9770655", color: "#d97706", borderRadius: 8, padding: "9px 12px", fontWeight: 700, cursor: "pointer", fontSize: 12.5, marginBottom: 12, textAlign: "left" }}>
            ⇩ Importar sugestão de compra da previsão de demanda ({sugMat.length} materiais · {sugMed.length} medicamentos)
          </button>
        )}

        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", marginBottom: 8 }}>Adicionar item</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            {["material", "medicamento"].map(t => (
              <button key={t} onClick={() => { setTipoSel(t); setItemSel(""); }} style={{ flex: 1, background: tipoSel === t ? VX.turquesa : "transparent", color: tipoSel === t ? "#062a26" : "var(--text-3)", border: `1px solid ${tipoSel === t ? VX.turquesa : "var(--border)"}`, borderRadius: 7, padding: "7px 0", fontWeight: 700, cursor: "pointer", fontSize: 12.5 }}>{t === "material" ? "Material" : "Medicamento"}</button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 80px auto", gap: 8, alignItems: "end" }}>
            <div>
              <label style={rotuloCampo}>{tipoSel === "material" ? "Material" : "Medicamento"}</label>
              <select value={itemSel} onChange={e => setItemSel(e.target.value)} style={campoTexto}>
                <option value="">— escolha —</option>
                {disponiveis.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
              </select>
            </div>
            <div>
              <label style={rotuloCampo}>Qtd *</label>
              <input type="number" min="0" step="any" value={qtd} onChange={e => setQtd(e.target.value)} placeholder="0" style={campoTexto} />
            </div>
            <button onClick={adicionar} style={{ background: "var(--surface-3)", color: "var(--text-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Add</button>
          </div>
        </div>

        {lista.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 8 }}>
            {lista.map((x, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "6px 10px" }}>
                <span style={{ fontSize: 9.5, color: x.tipo === "medicamento" ? "#6366f1" : "var(--text-muted)", border: `1px solid ${x.tipo === "medicamento" ? "#6366f155" : "var(--border-2)"}`, borderRadius: 99, padding: "0 6px", fontWeight: 700, flexShrink: 0 }}>{x.tipo === "medicamento" ? "MED" : "MAT"}</span>
                <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-2)", minWidth: 0 }}>{x.nome}{x.unidade ? ` (${x.unidade})` : ""}</span>
                <input type="number" min="0" step="any" value={x.qtd} onChange={e => mudarLinha(i, "qtd", e.target.value)} title="Quantidade" style={{ ...campoTexto, width: 70, padding: "5px 7px", fontSize: 12 }} />
                <input type="number" min="0" step="any" value={x.custo_unit} onChange={e => mudarLinha(i, "custo_unit", e.target.value)} placeholder="R$ unit." title="Custo unitário (R$)" style={{ ...campoTexto, width: 82, padding: "5px 7px", fontSize: 12 }} />
                <button onClick={() => setLista(l => l.filter((_, j) => j !== i))} style={{ background: "transparent", border: "none", color: "#f43f5e", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>✕</button>
              </div>
            ))}
          </div>
        )}
        {total > 0 && <div style={{ textAlign: "right", fontSize: 13, fontWeight: 800, color: VX.turquesa, fontFamily: "JetBrains Mono, monospace", marginBottom: 10 }}>Total estimado: {fmtBRL(total)}</div>}

        <div style={{ marginBottom: 16 }}>
          <label style={rotuloCampo}>Observação</label>
          <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Condições, cotação, urgência…" style={campoTexto} />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={salvar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Criar pedido"}</button>
        </div>
      </div>
    </div>
  );
}

// Recebimento do pedido: informa qtd/lote/validade por item → entrada no estoque
export function SupRecebModal({ pedido, materiais = [], busy, onClose, onConfirm }) {
  const its = Array.isArray(pedido.itens) ? pedido.itens : [];
  // Só materiais têm conversão de unidade; medicamento é sempre na própria.
  const matById = {}; materiais.forEach(m => matById[m.id] = m);
  const materialDa = x => (x.tipo === "medicamento" ? null : matById[x.item_id]);
  const [nf, setNf] = useState("");
  const [linhas, setLinhas] = useState(its.map((x, idx) => ({
    idx, qtd: Math.max(0, Number(x.qtd || 0) - Number(x.qtd_recebida || 0)), lote: "", validade: "",
  })));
  const set = (i, k, v) => setLinhas(l => l.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const algum = linhas.some(l => Number(l.qtd) > 0);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 640, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Receber pedido PED-{pedido.id}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
          {pedido.fornecedor_nome || "Sem fornecedor"} · informe o que chegou — cada linha vira uma <strong>entrada</strong> no estoque (materiais no almoxarifado, medicamentos na Farmácia). Recebimento parcial é permitido.
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={rotuloCampo}>Nota fiscal / documento</label>
          <input value={nf} onChange={e => setNf(e.target.value)} placeholder={`Nº NF (se vazio, usa PED-${pedido.id})`} style={{ ...campoTexto, maxWidth: 260 }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {its.map((x, i) => {
            const restante = Math.max(0, Number(x.qtd || 0) - Number(x.qtd_recebida || 0));
            const ln = linhas[i];
            const mat = materialDa(x);
            return (
              <div key={i} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 9.5, color: x.tipo === "medicamento" ? "#6366f1" : "var(--text-muted)", border: `1px solid ${x.tipo === "medicamento" ? "#6366f155" : "var(--border-2)"}`, borderRadius: 99, padding: "0 6px", fontWeight: 700 }}>{x.tipo === "medicamento" ? "MED" : "MAT"}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-2)", flex: 1, minWidth: 0 }}>{x.nome}</span>
                  <span style={{ fontSize: 11, color: restante > 0 ? "var(--text-muted)" : "#34d399", fontFamily: "JetBrains Mono, monospace" }}>{restante > 0 ? `falta ${farmFmtQtd(restante)}` : "completo"}</span>
                </div>
                {restante > 0 && (<>
                  <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr", gap: 8 }}>
                    <div><label style={rotuloCampo}>Qtd recebida{mat && temConversao(mat) ? ` (${(mat.unidade_compra || "compra").trim()})` : ""}</label><input type="number" min="0" step="any" value={ln.qtd} onChange={e => set(i, "qtd", e.target.value)} style={campoTexto} /></div>
                    <div><label style={rotuloCampo}>Lote</label><input value={ln.lote} onChange={e => set(i, "lote", e.target.value)} placeholder="opcional" style={campoTexto} /></div>
                    <div><label style={rotuloCampo}>Validade</label><input type="date" value={ln.validade} onChange={e => set(i, "validade", e.target.value)} style={campoTexto} /></div>
                  </div>
                  {/* Conferir caixa contra unidade é o erro que a conversão
                      existe para evitar — então a tela diz os dois lados
                      antes de confirmar, em vez de converter escondido. */}
                  {mat && temConversao(mat) && Number(ln.qtd) > 0 && (
                    <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 6 }}>
                      Entra no estoque: <strong>{descreverEntrada(ln.qtd, mat)}</strong>
                      {Number(x.custo_unit) > 0 && <> · custo <strong>{fmtBRL(custoPorUnidadeConsumo(x.custo_unit, mat) || 0)}</strong> por {mat.unidade || "un"}</>}
                    </div>
                  )}
                </>)}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={() => onConfirm(pedido, linhas, nf.trim())} disabled={busy || !algum} style={{ background: "#34d399", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13, opacity: (busy || !algum) ? 0.5 : 1 }}>{busy ? "…" : "Confirmar recebimento"}</button>
        </div>
      </div>
    </div>
  );
}

// Contagem cega de um item — só revela o saldo do sistema após "Conferir"
export function SupContagemModal({ item, saldoSistema, lotesDoItem = [], chave = "item_id", onClose, onSave }) {
  const [contado, setContado] = useState("");
  const [revelado, setRevelado] = useState(false);
  const [ajustar, setAjustar] = useState(true);
  const [obs, setObs] = useState("");
  const [loteEscolhido, setLoteEscolhido] = useState("");
  const [busy, setBusy] = useState(false);
  const dif = revelado ? Number(contado) - Number(saldoSistema) : null;

  // O estoque é por LOTE e a contagem é por ITEM — então o ajuste precisa
  // decidir de qual lote tirar (FEFO) ou em qual pôr (só a pessoa sabe).
  // O plano é calculado aqui e MOSTRADO antes de confirmar: ajuste que
  // mexe no estoque sem dizer onde é caixa-preta, e caixa-preta em
  // controle de estoque é onde material some.
  const plano = revelado
    ? planejarAjuste(dif, lotesDoItem, { loteEscolhido: loteEscolhido || null })
    : { ok: true, passos: [], motivo: null };
  const lotesComSaldo = lotesDoItem.filter(l => Number(l.quantidade || 0) > 0);
  const precisaEscolher = revelado && dif > 0 && !plano.ok && lotesComSaldo.length > 1;
  const bloqueado = revelado && ajustar && dif !== 0 && !plano.ok;

  function conferir() {
    if (contado === "" || Number(contado) < 0) { alert("Digite a quantidade contada na prateleira."); return; }
    setRevelado(true);
  }
  async function salvar() {
    setBusy(true);
    await onSave({
      [chave]: item.id,
      saldo_sistema: Number(saldoSistema),
      contado: Number(contado),
      diferenca: Number(contado) - Number(saldoSistema),
      // `ajustado` NUNCA sai daqui como verdadeiro: quem decide é a
      // gravação no kardex, não a intenção da tela. Era exatamente essa
      // confusão que fazia a acuracidade mentir.
      ajustado: false,
      observacao: obs.trim() || null,
    }, ajustar ? plano.passos : []);
    setBusy(false);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 440, maxWidth: "94vw" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Contagem — {item.nome}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>Conte na prateleira e digite a quantidade{item.unidade ? ` em ${item.unidade}` : ""}. O saldo do sistema fica oculto até você conferir.</div>

        <div style={{ marginBottom: 14 }}>
          <label style={rotuloCampo}>Quantidade contada *</label>
          <input type="number" min="0" step="any" value={contado} onChange={e => setContado(e.target.value)} disabled={revelado} placeholder="0" style={{ ...campoTexto, fontSize: 18, fontWeight: 700, textAlign: "center" }} autoFocus />
        </div>

        {!revelado ? (
          <button onClick={conferir} style={{ width: "100%", background: VX.azul, color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 700, cursor: "pointer", fontSize: 14, marginBottom: 6 }}>Conferir com o sistema</button>
        ) : (<>
          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px", marginBottom: 14, textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 8 }}>
              <div><div style={{ fontSize: 10.5, color: "var(--text-muted)", textTransform: "uppercase" }}>Sistema</div><div style={{ fontSize: 20, fontWeight: 800, fontFamily: "JetBrains Mono, monospace" }}>{farmFmtQtd(saldoSistema)}</div></div>
              <div><div style={{ fontSize: 10.5, color: "var(--text-muted)", textTransform: "uppercase" }}>Contado</div><div style={{ fontSize: 20, fontWeight: 800, fontFamily: "JetBrains Mono, monospace" }}>{farmFmtQtd(contado)}</div></div>
              <div><div style={{ fontSize: 10.5, color: "var(--text-muted)", textTransform: "uppercase" }}>Diferença</div><div style={{ fontSize: 20, fontWeight: 800, fontFamily: "JetBrains Mono, monospace", color: dif === 0 ? "#34d399" : "#f43f5e" }}>{dif > 0 ? "+" : ""}{farmFmtQtd(dif)}</div></div>
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: dif === 0 ? "#34d399" : "#f43f5e" }}>{dif === 0 ? "✓ Estoque bate — nada a ajustar" : "Divergência encontrada"}</div>
          </div>
          {dif !== 0 && (<>
            <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13, color: "var(--text-2)", cursor: "pointer", marginBottom: 10 }}>
              <input type="checkbox" checked={ajustar} onChange={e => setAjustar(e.target.checked)} style={{ accentColor: VX.turquesa, width: 15, height: 15 }} /> Lançar o ajuste no kardex (corrige o saldo para {farmFmtQtd(contado)})
            </label>

            {ajustar && precisaEscolher && (
              // Sobra com vários lotes: o sistema não tem como adivinhar em
              // qual entram as unidades a mais. Chutar corrompe a validade e
              // o FEFO, e o erro só aparece meses depois — como material
              // vencido que o sistema jurava estar bom.
              <div style={{ marginBottom: 12 }}>
                <label style={rotuloCampo}>Em qual lote entram as {farmFmtQtd(dif)} unidade(s) a mais? *</label>
                <select value={loteEscolhido} onChange={e => setLoteEscolhido(e.target.value)} style={campoTexto}>
                  <option value="">Escolha o lote…</option>
                  {lotesDoItem.map(l => (
                    <option key={l.lote || "__generico__"} value={l.lote || ""}>
                      {l.lote || "(sem lote)"}{l.validade ? ` · vence ${new Date(l.validade + "T00:00:00").toLocaleDateString("pt-BR")}` : ""} · saldo {farmFmtQtd(l.quantidade)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {ajustar && (
              <div style={{
                fontSize: 12, lineHeight: 1.5, marginBottom: 12, borderRadius: 8, padding: "8px 12px",
                border: `1px solid ${plano.ok ? "var(--border)" : "#f43f5e55"}`,
                background: plano.ok ? "var(--surface-2)" : "#3d0f1833",
                color: plano.ok ? "var(--text-3)" : "#fb7185",
              }}>
                {plano.ok
                  ? <><strong style={{ color: "var(--text-2)" }}>O ajuste vai:</strong> {descreverPlano(plano.passos)}.
                      {plano.passos.length > 1 && <> A saída segue a ordem de validade (vence primeiro, sai primeiro).</>}</>
                  : <>⚠ {plano.motivo}</>}
              </div>
            )}
          </>)}
          <div style={{ marginBottom: 14 }}>
            <label style={rotuloCampo}>Observação {dif !== 0 ? "(motivo provável da divergência)" : ""}</label>
            <input value={obs} onChange={e => setObs(e.target.value)} placeholder={dif !== 0 ? "Ex.: quebra, saída não lançada, empréstimo a outro setor" : "opcional"} style={campoTexto} />
          </div>
        </>)}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          {revelado && (
            <button onClick={salvar} disabled={busy || bloqueado}
              title={bloqueado ? plano.motivo : undefined}
              style={{ background: bloqueado ? "var(--surface-3)" : "#22d3ee", color: bloqueado ? "var(--text-muted)" : "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: bloqueado ? "not-allowed" : "pointer", fontSize: 13 }}>
              {busy ? "…" : bloqueado ? "Resolva o ajuste acima" : "Registrar contagem"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Importar NF-e (XML): lê a nota, casa itens com o catálogo (por código de barras
// ou nome), deixa revisar e lança as entradas de uma vez — com custo médio.
export function SupNfeModal({ itens, forns, onClose, onConfirm }) {
  const [parsed, setParsed] = useState(null);   // { fornecedor, nf, itens } ou { erro }
  const [linhas, setLinhas] = useState([]);
  const [busy, setBusy] = useState(false);
  const ativos = itens.filter(i => i.ativo !== false);

  function matchItem(x) {
    if (x.ean) { const porEan = ativos.find(i => (i.codigo_barras || "").trim() === x.ean); if (porEan) return String(porEan.id); }
    const nx = normTxt(x.nome);
    const porNome = ativos.find(i => normTxt(i.nome) === nx) || ativos.find(i => nx.length >= 5 && (normTxt(i.nome).includes(nx) || nx.includes(normTxt(i.nome))));
    return porNome ? String(porNome.id) : "novo";
  }
  function carregarArquivo(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const res = parseNFe(String(e.target.result || ""));
      setParsed(res);
      if (!res.erro) setLinhas(res.itens.map(x => ({ ...x, alvo: matchItem(x) })));
    };
    reader.readAsText(file, "ISO-8859-1");   // NF-e costuma vir em latin1
  }
  const set = (i, k, v) => setLinhas(l => l.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const aImportar = linhas.filter(l => l.alvo !== "skip").length;
  const fornExiste = parsed?.fornecedor?.cnpj && forns.some(f => (f.cnpj || "").replace(/\D/g, "") === parsed.fornecedor.cnpj.replace(/\D/g, ""));

  async function confirmar() {
    if (!aImportar) { alert("Nenhum item selecionado para importar."); return; }
    setBusy(true);
    await onConfirm({ fornecedor: parsed.fornecedor, nf: parsed.nf, linhas });
    setBusy(false);
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 780, maxWidth: "96vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Importar NF-e (XML)</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>Selecione o arquivo XML da nota. O sistema lê os itens e casa com o catálogo (por código de barras ou nome); você revisa e confirma. Cada item vira uma <strong>entrada</strong> no estoque, com lote, validade e custo da nota.</div>

        {!parsed && (
          <div style={{ border: "2px dashed var(--border)", borderRadius: 10, padding: "2rem", textAlign: "center" }}>
            <input type="file" accept=".xml,text/xml,application/xml" onChange={e => carregarArquivo(e.target.files[0])} style={{ fontSize: 13 }} />
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10 }}>O arquivo é lido localmente no seu navegador — nada é enviado para fora.</div>
          </div>
        )}

        {parsed?.erro && (
          <div style={{ fontSize: 13, color: "#f43f5e", background: "#f43f5e12", border: "1px solid #f43f5e44", borderRadius: 8, padding: "12px 14px" }}>{parsed.erro} <button onClick={() => setParsed(null)} style={{ marginLeft: 8, background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 10px", color: "var(--text-2)", cursor: "pointer", fontSize: 12 }}>Tentar outro arquivo</button></div>
        )}

        {parsed && !parsed.erro && (<>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5, marginBottom: 12, padding: "10px 12px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8 }}>
            <div><span style={{ color: "var(--text-muted)" }}>Fornecedor:</span> <strong>{parsed.fornecedor.nome || "—"}</strong> {parsed.fornecedor.cnpj ? `· ${parsed.fornecedor.cnpj}` : ""} {parsed.fornecedor.cnpj && !fornExiste && <span style={{ fontSize: 10.5, color: "#d97706", border: "1px solid #d9770655", borderRadius: 99, padding: "0 6px", marginLeft: 4 }}>será cadastrado</span>}</div>
            <div><span style={{ color: "var(--text-muted)" }}>NF:</span> <strong>{parsed.nf || "—"}</strong></div>
            <div style={{ marginLeft: "auto" }}><span style={{ color: "var(--text-muted)" }}>Itens:</span> <strong>{aImportar}</strong> de {linhas.length} selecionado(s)</div>
          </div>

          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10, marginBottom: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 720 }}>
              <thead><tr style={{ background: "var(--surface-2)", textAlign: "left", color: "var(--text-3)", fontSize: 10.5, textTransform: "uppercase" }}>
                <th style={{ padding: "7px 10px" }}>Item da nota → material no catálogo</th>
                <th style={{ padding: "7px 10px", textAlign: "right" }}>Qtd</th>
                <th style={{ padding: "7px 10px", textAlign: "right" }}>Custo un.</th>
                <th style={{ padding: "7px 10px" }}>Lote</th>
                <th style={{ padding: "7px 10px" }}>Validade</th>
              </tr></thead>
              <tbody>
                {linhas.map((x, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--border)", opacity: x.alvo === "skip" ? 0.5 : 1 }}>
                    <td style={{ padding: "7px 10px" }}>
                      <div style={{ fontWeight: 600, marginBottom: 3 }}>{x.nome} <span style={{ fontSize: 10.5, color: "var(--text-muted)", fontWeight: 400 }}>{x.ean ? `· EAN ${x.ean}` : ""}</span></div>
                      <select value={x.alvo} onChange={e => set(i, "alvo", e.target.value)} style={{ ...campoTexto, padding: "5px 8px", fontSize: 12 }}>
                        <option value="novo">➕ Criar novo material</option>
                        <option value="skip">✕ Não importar</option>
                        <optgroup label="Casar com material existente">
                          {ativos.slice().sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR")).map(it => <option key={it.id} value={String(it.id)}>{it.nome}</option>)}
                        </optgroup>
                      </select>
                    </td>
                    <td style={{ padding: "7px 10px", textAlign: "right" }}><input type="number" min="0" step="any" value={x.qtd} onChange={e => set(i, "qtd", e.target.value)} style={{ ...campoTexto, width: 70, padding: "5px 7px", fontSize: 12 }} /></td>
                    <td style={{ padding: "7px 10px", textAlign: "right" }}><input type="number" min="0" step="any" value={x.custo_unit} onChange={e => set(i, "custo_unit", e.target.value)} style={{ ...campoTexto, width: 80, padding: "5px 7px", fontSize: 12 }} /></td>
                    <td style={{ padding: "7px 10px" }}><input value={x.lote} onChange={e => set(i, "lote", e.target.value)} placeholder="—" style={{ ...campoTexto, width: 90, padding: "5px 7px", fontSize: 12 }} /></td>
                    <td style={{ padding: "7px 10px" }}><input type="date" value={x.validade} onChange={e => set(i, "validade", e.target.value)} style={{ ...campoTexto, width: 130, padding: "5px 7px", fontSize: 12 }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginBottom: 14 }}>Itens já com código de barras cadastrado casam sozinhos. Confira as quantidades e validades antes de confirmar — vira estoque de verdade.</div>
        </>)}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          {parsed && !parsed.erro && <button onClick={confirmar} disabled={busy || !aImportar} style={{ background: "#34d399", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13, opacity: (busy || !aImportar) ? 0.5 : 1 }}>{busy ? "Importando…" : `Importar ${aImportar} item(ns)`}</button>}
        </div>
      </div>
    </div>
  );
}

// Cadastro / edição de material
export function SupItemModal({ item, onClose, onSave }) {
  const [f, setF] = useState({ ...item });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const conf = validarConversao(f);
  async function salvar() {
    if (!f.nome.trim()) { alert("Informe o nome / descrição do material."); return; }
    // Fator inválido é bloqueio, não aviso: ele não dá erro em lugar
    // nenhum — só contamina o custo médio de todas as entradas seguintes,
    // em silêncio, e o custo médio é ponderado (carrega o erro adiante).
    if (!conf.ok) { alert(conf.erros.join("\n")); return; }
    setBusy(true);
    await onSave({
      ...(item.id ? { id: item.id } : {}),
      nome: f.nome.trim(),
      categoria: f.categoria || null,
      unidade: f.unidade || "unidade",
      unidade_compra: f.unidade_compra?.trim() || null,
      fator_conversao: f.fator_conversao === "" || f.fator_conversao == null ? 1 : Number(f.fator_conversao),
      estoque_minimo: f.estoque_minimo === "" || f.estoque_minimo == null ? 0 : Number(f.estoque_minimo),
      custo_unitario: f.custo_unitario === "" || f.custo_unitario == null ? null : Number(f.custo_unitario),
      codigo_barras: f.codigo_barras?.trim() || null,
      ativo: f.ativo !== false,
      observacao: f.observacao?.trim() || null,
    });
    setBusy(false);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 480, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>{item.id ? "Editar material" : "Novo material"}</div>
        <div style={{ marginBottom: 10 }}>
          <label style={rotuloCampo}>Nome / descrição *</label>
          <input value={f.nome} onChange={e => set("nome", e.target.value)} placeholder="Ex.: Luva de procedimento M — caixa 100" style={campoTexto} autoFocus />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={rotuloCampo}>Categoria</label>
            <select value={f.categoria || ""} onChange={e => set("categoria", e.target.value)} style={campoTexto}>
              <option value="">—</option>
              {SUP_CATEGORIAS.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div>
            <label style={rotuloCampo}>Unidade de consumo</label>
            <select value={f.unidade || "unidade"} onChange={e => set("unidade", e.target.value)} style={campoTexto}>
              {SUP_UNIDADES.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
        </div>

        {/* COMO SE COMPRA × COMO SE CONSOME
            O almoxarifado compra caixa de 100 luvas e entrega par. Sem
            separar as duas unidades, o custo da caixa entra como custo do
            par — e o custo médio é ponderado, então o erro não fica no
            passado: contamina toda entrada seguinte. */}
        <div style={{ border: "1px dashed var(--border)", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.5 }}>
            Preencha <strong>só se comprar numa unidade diferente da que consome</strong> (ex.: compra caixa, entrega par).
            O estoque e o kardex sempre falam em <strong>{f.unidade || "unidade"}</strong>.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={rotuloCampo}>Unidade de compra</label>
              <input value={f.unidade_compra || ""} onChange={e => set("unidade_compra", e.target.value)} placeholder="Ex.: caixa, fardo" style={campoTexto} />
            </div>
            <div>
              <label style={rotuloCampo}>{f.unidade || "unidade"}(s) por {f.unidade_compra?.trim() || "unidade de compra"}</label>
              <input type="number" min="0" step="any" value={f.fator_conversao ?? ""} onChange={e => set("fator_conversao", e.target.value)} placeholder="1" style={campoTexto} />
            </div>
          </div>
          {temConversao(f) && conf.ok && (
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 8 }}>
              Comprar <strong>1 {f.unidade_compra?.trim() || "unidade de compra"}</strong> passa a dar entrada de{" "}
              <strong>{comprarParaConsumo(1, f)} {f.unidade || "un"}</strong>. Um custo de R$ 100 na nota vira{" "}
              <strong>{fmtBRL(custoPorUnidadeConsumo(100, f) || 0)}</strong> por {f.unidade || "un"}.
            </div>
          )}
          {conf.erros.map((e, i) => <div key={i} style={{ fontSize: 12, color: "#fb7185", marginTop: 6 }}>⚠ {e}</div>)}
          {conf.avisos.map((a, i) => <div key={i} style={{ fontSize: 12, color: "#d97706", marginTop: 6 }}>{a}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={rotuloCampo}>Estoque mínimo</label>
            <input type="number" min="0" value={f.estoque_minimo ?? ""} onChange={e => set("estoque_minimo", e.target.value)} placeholder="0" style={campoTexto} />
          </div>
          <div>
            <label style={rotuloCampo}>Custo unit. (R$)</label>
            <input type="number" min="0" step="any" value={f.custo_unitario ?? ""} onChange={e => set("custo_unitario", e.target.value)} placeholder="0,00" style={campoTexto} />
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={rotuloCampo}>Código de barras</label>
          <input value={f.codigo_barras || ""} onChange={e => set("codigo_barras", e.target.value)} placeholder="Clique aqui e bipe com o leitor (ou digite o EAN)" style={campoTexto} />
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3 }}>Um leitor USB funciona como teclado: clique no campo e passe o produto. Depois dá para buscar o item bipando na barra de busca do Estoque.</div>
        </div>
        <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13, color: "var(--text-2)", cursor: "pointer", marginBottom: 12 }}>
          <input type="checkbox" checked={f.ativo !== false} onChange={e => set("ativo", e.target.checked)} style={{ accentColor: "#34d399", width: 15, height: 15 }} /> Ativo
        </label>
        <div style={{ marginBottom: 16 }}>
          <label style={rotuloCampo}>Observação</label>
          <textarea value={f.observacao || ""} onChange={e => set("observacao", e.target.value)} rows={2} placeholder="Marca, especificação, armazenamento…" style={{ ...campoTexto, resize: "vertical" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={salvar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}

// Entrada / saída de estoque de material
export function SupMovModal({ item, tipoInicial, lotes, fornecedores, setores = [], onClose, onSave }) {
  const [tipo, setTipo] = useState(tipoInicial || "entrada");
  // "Outro…" continua existindo: um setor legítimo pode não estar cadastrado,
  // e travar a saída por causa disso pararia o almoxarifado. O que se faz é
  // encaixar o digitado no nome do catálogo quando dá para reconhecer.
  const [setorLivre, setSetorLivre] = useState(false);
  const lotesComSaldo = [...lotes].filter(l => Number(l.quantidade) > 0).sort((a, b) => (a.validade || "9999").localeCompare(b.validade || "9999")); // vence primeiro sai primeiro
  const [f, setF] = useState({
    lote: "", validade: "", quantidade: "", documento: "", fornecedor_id: "", setor: "",
    custo_unit: item.custo_unitario ?? "",
    lote_id: lotesComSaldo[0]?.id || "", motivo: "Consumo do setor",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const loteSel = lotesComSaldo.find(l => String(l.id) === String(f.lote_id));

  async function salvar() {
    const q = Number(f.quantidade);
    if (!q || q <= 0) { alert("Informe uma quantidade maior que zero."); return; }
    let mov;
    if (tipo === "entrada") {
      mov = { item_id: item.id, tipo: "entrada", quantidade: q, lote: f.lote.trim() || null, validade: f.validade || null, motivo: "Compra / nota fiscal", documento: f.documento.trim() || null, fornecedor_id: f.fornecedor_id || null, custo_unit: f.custo_unit === "" || f.custo_unit == null ? null : Number(f.custo_unit) };
    } else {
      if (!loteSel) { alert("Selecione o lote de onde sairá o material."); return; }
      if (q > Number(loteSel.quantidade)) { alert(`Saída maior que o saldo do lote (disponível: ${farmFmtQtd(loteSel.quantidade)}).`); return; }
      // A normalização acontece na GRAVAÇÃO, não só na tela: digitar
      // "posto 2" com "POSTO 2" cadastrado grava POSTO 2, e o relatório
      // passa a somar as duas origens na mesma linha. Sem isto, o select
      // resolveria só o caminho comum e a divergência voltaria pela opção
      // "Outro…" — que é justamente por onde ela entrava.
      const destino = casarComCatalogo(f.setor, setores).nome;
      mov = { item_id: item.id, tipo: "saida", quantidade: q, lote: loteSel.lote || null, validade: loteSel.validade || null, motivo: f.motivo, documento: f.documento.trim() || null, setor: destino || null };
    }
    setBusy(true);
    const ok = await onSave(mov);
    setBusy(false);
    if (!ok) return;
  }
  const cor = tipo === "entrada" ? "#34d399" : "#d97706";
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 480, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Movimentar estoque</div>
        <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 14 }}>{item.nome}{item.unidade ? ` · em ${item.unidade}` : ""}</div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {["entrada", "saida"].map(t => (
            <button key={t} onClick={() => setTipo(t)} style={{ flex: 1, background: tipo === t ? (t === "entrada" ? "#34d399" : "#d97706") : "transparent", color: tipo === t ? "#000" : "var(--text-3)", border: `1px solid ${tipo === t ? (t === "entrada" ? "#34d399" : "#d97706") : "var(--border)"}`, borderRadius: 7, padding: "8px 0", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{t === "entrada" ? "Entrada" : "Saída / baixa"}</button>
          ))}
        </div>

        {tipo === "entrada" ? (<>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div><label style={rotuloCampo}>Lote</label><input value={f.lote} onChange={e => set("lote", e.target.value)} placeholder="Ex.: AB1234" style={campoTexto} /></div>
            <div><label style={rotuloCampo}>Validade</label><input type="date" value={f.validade} onChange={e => set("validade", e.target.value)} style={campoTexto} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div><label style={rotuloCampo}>Quantidade *</label><input type="number" min="0" step="any" value={f.quantidade} onChange={e => set("quantidade", e.target.value)} placeholder="0" style={campoTexto} autoFocus /></div>
            <div><label style={rotuloCampo}>Custo unit. da nota (R$)</label><input type="number" min="0" step="any" value={f.custo_unit} onChange={e => set("custo_unit", e.target.value)} placeholder="0,00" style={campoTexto} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div><label style={rotuloCampo}>Nota fiscal / documento</label><input value={f.documento} onChange={e => set("documento", e.target.value)} placeholder="Nº NF" style={campoTexto} /></div>
            <div>
              <label style={rotuloCampo}>Fornecedor</label>
              <select value={f.fornecedor_id} onChange={e => set("fornecedor_id", e.target.value)} style={campoTexto}>
                <option value="">—</option>
                {fornecedores.map(fo => <option key={fo.id} value={fo.id}>{fo.nome}</option>)}
              </select>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.5 }}>O custo da nota atualiza o <strong>custo médio ponderado</strong> do material automaticamente. Sem lote/validade? Deixe em branco — entra num lote genérico.</div>
        </>) : (<>
          {lotesComSaldo.length === 0 ? (
            <div style={{ fontSize: 13, color: "#f43f5e", background: "#f43f5e12", border: "1px solid #f43f5e44", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>Não há saldo em estoque para dar baixa. Registre uma entrada primeiro.</div>
          ) : (<>
            <div style={{ marginBottom: 10 }}>
              <label style={rotuloCampo}>Lote (vence primeiro no topo)</label>
              <select value={f.lote_id} onChange={e => set("lote_id", e.target.value)} style={campoTexto}>
                {lotesComSaldo.map(l => { const vi = infoDeValidade(l.validade); return <option key={l.id} value={l.id}>{(l.lote || "sem lote")} · val {l.validade ? fmtDataBR(l.validade) : "—"}{vi.status === "vencido" ? " (VENCIDO)" : ""} · saldo {farmFmtQtd(l.quantidade)}</option>; })}
              </select>
            </div>
            {loteSel && infoDeValidade(loteSel.validade).status === "vencido" && <div style={{ fontSize: 11.5, color: "#f43f5e", marginBottom: 10, fontWeight: 600 }}>⚠ Lote vencido — a baixa deve ser por perda/descarte, não consumo.</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div><label style={rotuloCampo}>Quantidade *</label><input type="number" min="0" step="any" value={f.quantidade} onChange={e => set("quantidade", e.target.value)} placeholder="0" style={campoTexto} autoFocus /></div>
              <div><label style={rotuloCampo}>Motivo</label><select value={f.motivo} onChange={e => set("motivo", e.target.value)} style={campoTexto}>{SUP_MOTIVOS_SAIDA.map(x => <option key={x} value={x}>{x}</option>)}</select></div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={rotuloCampo}>Setor de destino</label>
              {setores.length > 0 && !setorLivre ? (
                <select value={f.setor} onChange={e => {
                  if (e.target.value === "__outro__") { setSetorLivre(true); set("setor", ""); }
                  else set("setor", e.target.value);
                }} style={campoTexto}>
                  <option value="">—</option>
                  {setores.map(s => <option key={s.nome} value={s.nome}>{s.nome}</option>)}
                  <option value="__outro__">Outro…</option>
                </select>
              ) : (
                <input value={f.setor} onChange={e => set("setor", e.target.value)}
                  placeholder="Ex.: Posto 2, Centro Cirúrgico" style={campoTexto} autoFocus={setorLivre} />
              )}
              {/* Avisa, não bloqueia. E só depois de digitar algo que o
                  catálogo não reconhece — nem mesmo por diferença de acento
                  ou de caixa, que é de onde vinha a fragmentação do BI. */}
              {setorLivre && ehSetorNovo(f.setor, setores) && (
                <div style={{ fontSize: 11.5, color: "#d97706", marginTop: 5 }}>
                  "{casarComCatalogo(f.setor, setores).nome}" não está no catálogo de setores. A saída é registrada assim mesmo —
                  se for um setor permanente, vale cadastrá-lo em Giro de Leitos para o consumo não se dividir no relatório.
                </div>
              )}
              {setorLivre && setores.length > 0 && (
                <button type="button" onClick={() => { setSetorLivre(false); set("setor", ""); }}
                  style={{ background: "transparent", border: "none", color: VX.turquesa, cursor: "pointer", fontSize: 11.5, padding: "5px 0 0", fontFamily: "Inter, sans-serif" }}>
                  ← escolher do catálogo
                </button>
              )}
            </div>
            {loteSel && <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 16 }}>Saldo do lote: <strong style={{ color: "var(--text-2)" }}>{farmFmtQtd(loteSel.quantidade)} {item.unidade || ""}</strong></div>}
          </>)}
        </>)}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={salvar} disabled={busy || (tipo === "saida" && lotesComSaldo.length === 0)} style={{ background: cor, color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13, opacity: (busy || (tipo === "saida" && lotesComSaldo.length === 0)) ? 0.5 : 1 }}>{busy ? "…" : tipo === "entrada" ? "Registrar entrada" : "Registrar saída"}</button>
        </div>
      </div>
    </div>
  );
}

// Kardex — histórico de movimentos do material
export function SupKardexModal({ sb, item, fornecedores, canEdit, onEstornar, onClose }) {
  const [movs, setMovs] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const recarregar = () => loadSupMovimentos(sb, item.id).then(setMovs);
  useEffect(() => { recarregar(); }, [item.id]);
  const fornNome = id => fornecedores.find(f => f.id === id)?.nome;
  // Quem já foi desfeito sai do próprio kardex: o banco garante a regra
  // (índice único em `estorno_de`), aqui é só para não oferecer um botão
  // que vai falhar.
  const estornados = idsJaEstornados(movs || []);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 600, maxWidth: "94vw", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Kardex — {item.nome}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>Histórico de entradas e saídas (imutável). Últimos movimentos.</div>
        {movs == null ? <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "1.5rem" }}>Carregando…</div>
          : movs.length === 0 ? <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "1.5rem" }}>Nenhum movimento registrado ainda.</div>
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {movs.map(mv => {
                const ent = mv.tipo === "entrada";
                const cor = ent ? "#34d399" : "#d97706";
                const foiEstornado = estornados.has(mv.id);
                const ehEstorno = mv.estorno_de != null;
                const pode = podeEstornar(mv, estornados);
                return (
                  <div key={mv.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", opacity: foiEstornado ? 0.6 : 1 }}>
                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 800, color: cor, fontSize: 14, minWidth: 62, textAlign: "right", textDecoration: foiEstornado ? "line-through" : "none" }}>{ent ? "+" : "−"}{farmFmtQtd(mv.quantidade)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                        {ent ? "Entrada" : "Saída"} · {mv.motivo || "—"}{mv.lote ? ` · lote ${mv.lote}` : ""}{mv.setor ? ` · ${mv.setor}` : ""}{ent && fornNome(mv.fornecedor_id) ? ` · ${fornNome(mv.fornecedor_id)}` : ""}
                        {/* O vínculo em ambos os sentidos: a linha desfeita
                            e a que desfez continuam as duas no histórico —
                            é isso que torna o rastro legível. */}
                        {ehEstorno && <span title={`Desfaz o movimento #${mv.estorno_de}`} style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: VX.azul, border: `1px solid ${VX.azul}55`, borderRadius: 99, padding: "0 7px" }}>estorno de #{mv.estorno_de}</span>}
                        {foiEstornado && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: "var(--text-muted)", border: "1px solid var(--border-2)", borderRadius: 99, padding: "0 7px" }}>estornado</span>}
                      </div>
                      <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>#{mv.id} · {mv.created_at ? new Date(mv.created_at).toLocaleString("pt-BR") : ""}{mv.documento ? ` · doc ${mv.documento}` : ""}{mv.usuario ? ` · ${mv.usuario}` : ""}</div>
                    </div>
                    {canEdit && onEstornar && pode.ok && (
                      <button disabled={busyId === mv.id}
                        onClick={async () => { setBusyId(mv.id); const ok = await onEstornar(mv, estornados); setBusyId(null); if (ok) recarregar(); }}
                        title="Cria o movimento oposto no mesmo lote. O original permanece no histórico."
                        style={{ background: "transparent", color: "var(--text-3)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "4px 11px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "Inter, sans-serif" }}>
                        {busyId === mv.id ? "…" : "Estornar"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// Cadastro / edição de fornecedor
export function SupFornecedorModal({ forn, onClose, onSave }) {
  const [f, setF] = useState({ ...forn });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  async function salvar() {
    if (!f.nome.trim()) { alert("Informe o nome do fornecedor."); return; }
    setBusy(true);
    await onSave({
      ...(forn.id ? { id: forn.id } : {}),
      nome: f.nome.trim(),
      cnpj: f.cnpj?.trim() || null,
      contato: f.contato?.trim() || null,
      telefone: f.telefone?.trim() || null,
      email: f.email?.trim() || null,
      categorias: f.categorias?.trim() || null,
      lead_time_dias: f.lead_time_dias === "" || f.lead_time_dias == null ? null : Number(f.lead_time_dias),
      observacao: f.observacao?.trim() || null,
      ativo: f.ativo !== false,
    });
    setBusy(false);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 480, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>{forn.id ? "Editar fornecedor" : "Novo fornecedor"}</div>
        <div style={{ marginBottom: 10 }}>
          <label style={rotuloCampo}>Nome / razão social *</label>
          <input value={f.nome} onChange={e => set("nome", e.target.value)} placeholder="Ex.: Distribuidora Hospitalar Ltda" style={campoTexto} autoFocus />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={rotuloCampo}>CNPJ</label><input value={f.cnpj || ""} onChange={e => set("cnpj", e.target.value)} placeholder="00.000.000/0000-00" style={campoTexto} /></div>
          <div><label style={rotuloCampo}>Pessoa de contato</label><input value={f.contato || ""} onChange={e => set("contato", e.target.value)} placeholder="Nome" style={campoTexto} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={rotuloCampo}>Telefone</label><input value={f.telefone || ""} onChange={e => set("telefone", e.target.value)} placeholder="(00) 00000-0000" style={campoTexto} /></div>
          <div><label style={rotuloCampo}>E-mail</label><input value={f.email || ""} onChange={e => set("email", e.target.value)} placeholder="contato@fornecedor.com" style={campoTexto} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={rotuloCampo}>O que fornece</label>
            <input value={f.categorias || ""} onChange={e => set("categorias", e.target.value)} placeholder="Ex.: material hospitalar, EPI, escritório" style={campoTexto} />
          </div>
          <div>
            <label style={rotuloCampo}>Prazo de entrega (dias)</label>
            <input type="number" min="0" value={f.lead_time_dias ?? ""} onChange={e => set("lead_time_dias", e.target.value)} placeholder={String(SUP_LEAD_PADRAO)} style={campoTexto} />
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: "var(--text-muted)", margintop: 0, marginBottom: 10 }}>O prazo de entrega alimenta o <strong>ponto de pedido</strong>: o sistema sugere comprar antes que o estoque acabe dentro desse prazo + margem. Sem valor, usa {SUP_LEAD_PADRAO} dias.</div>
        <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13, color: "var(--text-2)", cursor: "pointer", marginBottom: 12 }}>
          <input type="checkbox" checked={f.ativo !== false} onChange={e => set("ativo", e.target.checked)} style={{ accentColor: "#34d399", width: 15, height: 15 }} /> Ativo
        </label>
        <div style={{ marginBottom: 16 }}>
          <label style={rotuloCampo}>Observação</label>
          <textarea value={f.observacao || ""} onChange={e => set("observacao", e.target.value)} rows={2} placeholder="Prazo de entrega, condições…" style={{ ...campoTexto, resize: "vertical" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={salvar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}
