// ═══════════════════════════════════════════════════════════
// TABELAS — onde o analista comercial mantém os catálogos
//
// É o equivalente do menu Tabelas do MV. Sem esta tela, cada convênio
// novo, cada plano renegociado e cada procedimento vira um pedido para
// quem tem acesso ao banco — o que não escala e não é auditável: ninguém
// sabe depois quem mudou o quê, nem quando.
//
// DUAS DECISÕES QUE APARECEM NA INTERFACE
//
// 1. NÃO EXISTE APAGAR, só desligar. Convênio, plano e procedimento
//    aparecem em atendimentos já gravados; remover a linha faria uma conta
//    de meses atrás mostrar código sem nome. O que está desligado continua
//    visível AQUI (e some da recepção), porque esconder o desligado é o
//    mesmo que apagar para quem precisa religar.
//
// 2. O QUE VEIO DO PADRÃO NACIONAL fica marcado e não ganha botão de
//    desligar. Caráter do atendimento e a natureza do tipo vêm de norma —
//    editar o rótulo é legítimo, sumir com a linha não.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import {
  CATALOGOS, CATALOGO_POR_CHAVE, TIPOS_DE_CONVENIO, TABELAS_DE_PROCEDIMENTO,
  validarCatalogo, lerCbos, VIAS_SUS, valorSusEmReais, CONTA_COMO,
} from "./catalogo.js";
import { reais } from "./faturamento.js";
import { salvarCatalogo, alternarAtivoCatalogo, carregarCatalogoCompleto } from "./dados.js";

const cartao = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.1rem 1.25rem", marginBottom: 14 };
const rotulo = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 };
const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
const lbl = { fontSize: 10.5, color: "var(--text-muted)", display: "block", marginBottom: 3 };
const btn = (cor, ativo = true) => ({
  background: ativo ? cor : "var(--surface-2)", color: ativo ? "#000" : "var(--text-muted)",
  border: ativo ? "none" : "1px solid var(--border)", borderRadius: 6, padding: "8px 15px",
  fontWeight: 700, cursor: ativo ? "pointer" : "not-allowed", fontSize: 12.5, whiteSpace: "nowrap",
});

const VAZIO = { codigo: "", nome: "", ativo: true, tipo: "convenio", tabela: "sigtap", ordem: 0 };

export default function Tabelas({ sb, currentUser, canEdit }) {
  const [chave, setChave] = useState("convenios");
  const [linhas, setLinhas] = useState([]);
  const [convenios, setConvenios] = useState([]);
  const [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const cat = CATALOGO_POR_CHAVE[chave];

  const recarregar = useCallback(async () => {
    setCarregando(true);
    const [r, c] = await Promise.all([
      carregarCatalogoCompleto(sb, chave),
      // Planos precisam da lista de convênios para o seletor — e para
      // mostrar a qual convênio cada plano pertence.
      chave === "planos" ? carregarCatalogoCompleto(sb, "convenios") : Promise.resolve([]),
    ]);
    setLinhas(r);
    setConvenios(c);
    setCarregando(false);
  }, [sb, chave]);

  useEffect(() => { setEdit(null); setMsg(null); recarregar(); }, [recarregar]);

  const conferencia = edit ? validarCatalogo(chave, edit, linhas) : null;

  async function salvar() {
    if (!canEdit || busy) return;
    const v = validarCatalogo(chave, edit, linhas);
    if (!v.ok) { setMsg({ tom: "erro", texto: v.erros.join(" ") }); return; }
    setBusy(true);
    const r = await salvarCatalogo(sb, chave, edit, currentUser);
    setBusy(false);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    setEdit(null);
    setMsg({ tom: "ok", texto: `${r.linha.nome} salvo.` });
    recarregar();
  }

  async function alternar(linha) {
    if (!canEdit) return;
    const r = await alternarAtivoCatalogo(sb, chave, linha.id, !linha.ativo, currentUser);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    recarregar();
  }

  const set = (k, v) => setEdit(p => ({ ...p, [k]: v }));
  const nomeDoConvenio = id => convenios.find(c => String(c.id) === String(id))?.nome || "—";

  return (
    <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Atendimento — Tabelas</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: "1.25rem" }}>
        Os catálogos que a recepção usa na ficha. Enquanto uma tabela estiver vazia, o campo
        correspondente aparece como "nenhum cadastrado" e o atendimento segue sem ele.
      </div>

      {msg && (
        <div style={{ ...cartao, borderLeft: `4px solid ${msg.tom === "erro" ? "#f43f5e" : "#34d399"}`,
                      background: msg.tom === "erro" ? "#f43f5e10" : "#34d39910", fontSize: 13 }}>
          {msg.texto}
        </div>
      )}

      {/* ── qual tabela ── */}
      <div style={cartao}>
        <div style={rotulo}>Qual tabela</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {CATALOGOS.map(c => (
            <button key={c.chave} onClick={() => setChave(c.chave)}
              style={{ ...btn(chave === c.chave ? "#22d3ee" : "var(--surface-2)", chave === c.chave),
                       color: chave === c.chave ? "#000" : "var(--text)", padding: "6px 12px", fontSize: 12 }}>
              {c.label}
            </button>
          ))}
        </div>
        {cat?.dica && <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 10 }}>{cat.dica}</div>}
      </div>

      {/* ── formulário ── */}
      {canEdit && (
        <div style={cartao}>
          {!edit ? (
            <button onClick={() => setEdit({ ...VAZIO })} style={btn("#34d399")}>+ Novo em {cat?.label}</button>
          ) : (
            <>
              <div style={rotulo}>{edit.id ? "Editar" : "Novo"} — {cat?.label}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                <div>
                  <label style={lbl}>Código *</label>
                  <input value={edit.codigo} onChange={e => set("codigo", e.target.value)} style={inp} placeholder="Ex.: UNIMED" />
                </div>
                <div style={{ gridColumn: "span 2" }}>
                  <label style={lbl}>Nome *</label>
                  <input value={edit.nome} onChange={e => set("nome", e.target.value)} style={inp} />
                </div>

                {chave === "convenios" && (
                  <>
                    <div>
                      <label style={lbl}>Tipo *</label>
                      <select value={edit.tipo} onChange={e => set("tipo", e.target.value)} style={inp}>
                        {TIPOS_DE_CONVENIO.map(t => <option key={t.chave} value={t.chave}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Registro ANS</label>
                      <input value={edit.registro_ans || ""} onChange={e => set("registro_ans", e.target.value)}
                        style={inp} disabled={edit.tipo === "sus"} placeholder={edit.tipo === "sus" ? "não se aplica" : ""} />
                    </div>
                    {/* No SUS estas duas somem: não existe carteirinha de
                        operadora nem senha de autorização. Deixar marcável
                        só criaria expectativa que o sistema não cumpre. */}
                    {edit.tipo !== "sus" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 14 }}>
                        <label style={{ fontSize: 12.5, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                          <input type="checkbox" checked={edit.exige_carteira !== false}
                            onChange={e => set("exige_carteira", e.target.checked)} />
                          Exige carteira
                        </label>
                        <label style={{ fontSize: 12.5, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                          <input type="checkbox" checked={edit.exige_autorizacao === true}
                            onChange={e => set("exige_autorizacao", e.target.checked)} />
                          Exige autorização
                        </label>
                      </div>
                    )}
                  </>
                )}

                {chave === "planos" && (
                  <>
                    <div>
                      <label style={lbl}>Convênio *</label>
                      <select value={edit.convenio_id || ""} onChange={e => set("convenio_id", e.target.value)} style={inp}>
                        <option value="">—</option>
                        {convenios.filter(c => c.ativo).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Acomodação</label>
                      <input value={edit.acomodacao || ""} onChange={e => set("acomodacao", e.target.value)}
                        style={inp} placeholder="enfermaria / apartamento" />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 16 }}>
                      <input id="tab-copart" type="checkbox" checked={edit.coparticipacao === true}
                        onChange={e => set("coparticipacao", e.target.checked)} />
                      <label htmlFor="tab-copart" style={{ fontSize: 12.5, cursor: "pointer" }}>Tem coparticipação</label>
                    </div>
                  </>
                )}

                {/* CONTA COMO — o que faz o tipo aparecer na coluna certa do
                    relatório. A migração planta isto em `extras` e nada lia:
                    tipo novo cadastrado pela tela somava ZERO no indicador,
                    sem errar em lugar nenhum. */}
                {chave === "tipo_atendimento" && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={lbl}>Conta como, na produção</label>
                    <select value={edit.conta_como ?? edit.extras?.conta_como ?? ""}
                      onChange={e => set("conta_como", e.target.value)} style={inp}>
                      <option value="">— não entra em nenhuma coluna</option>
                      {CONTA_COMO.map(c => <option key={c.chave} value={c.chave}>{c.label}</option>)}
                    </select>
                    <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.35 }}>
                      {CONTA_COMO.find(c => c.chave === (edit.conta_como ?? edit.extras?.conta_como))?.dica
                        || "Sem isto, este tipo não soma na coluna de 1ª consulta nem na de retorno do relatório do mês — e a pactuação separa as duas."}
                    </div>
                  </div>
                )}

                {chave === "procedimentos" && (
                  <>
                    <div>
                      <label style={lbl}>Tabela *</label>
                      <select value={edit.tabela} onChange={e => set("tabela", e.target.value)} style={inp}>
                        {TABELAS_DE_PROCEDIMENTO.map(t => <option key={t.chave} value={t.chave}>{t.label}</option>)}
                      </select>
                    </div>

                    {/* VIA e VALOR — os dois existiam no banco e não tinham
                        campo aqui, então só mudavam pelo SQL Editor. A via
                        muda por PORTARIA, várias vezes por ano: é a razão
                        declarada de este cadastro existir. */}
                    <div>
                      <label style={lbl}>Via SUS</label>
                      <select value={edit.via_sus || ""} onChange={e => set("via_sus", e.target.value)} style={inp}>
                        <option value="">— em branco: sai por BPA</option>
                        {VIAS_SUS.map(v => <option key={v.chave} value={v.chave}>{v.label}</option>)}
                      </select>
                      <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.35 }}>
                        Em branco é o normal — a maioria da produção ambulatorial é BPA. Marque só o que
                        for APAC ou AIH, que <strong>exigem autorização prévia</strong> e sem ela não são pagos.
                      </div>
                    </div>
                    <div>
                      <label style={lbl}>Valor SIGTAP (R$)</label>
                      <input value={edit.valor_sus ?? ""} onChange={e => set("valor_sus", e.target.value)}
                        style={inp} placeholder="10,50" inputMode="decimal" />
                      <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.35 }}>
                        {String(edit.valor_sus ?? "").trim() === ""
                          ? "Em branco é “ninguém cadastrou”, e a conta mostra “—”. Diferente de 0, que é “de graça”."
                          : valorSusEmReais(edit.valor_sus) === null
                            ? <span style={{ color: "#fb7185" }}>Isso não é um valor. Use 10,50 ou 10.50.</span>
                            : `Vai para a conta como ${reais(Math.round(valorSusEmReais(edit.valor_sus) * 100))}.`}
                      </div>
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={lbl}>CBOs que podem executar</label>
                      <input value={edit.cbos_compativeis || ""} onChange={e => set("cbos_compativeis", e.target.value)}
                        style={inp} placeholder="225125, 225265 — separados por vírgula" />
                      <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3 }}>
                        {lerCbos(edit.cbos_compativeis).length} CBO(s) reconhecido(s).
                        Sem essa lista o sistema não consegue avisar quando a produção vai ser rejeitada.
                      </div>
                    </div>
                  </>
                )}

                {cat?.dominio && (
                  <div>
                    <label style={lbl}>Ordem na lista</label>
                    <input type="number" value={edit.ordem ?? 0} onChange={e => set("ordem", e.target.value)} style={inp} />
                  </div>
                )}
              </div>

              {conferencia?.avisos?.length > 0 && (
                <div style={{ marginTop: 10, padding: "8px 11px", borderRadius: 8, fontSize: 12,
                              background: "#d9770610", border: "1px solid #d9770655", color: "var(--text)" }}>
                  {conferencia.avisos.map((a, i) => <div key={i}>• {a}</div>)}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={salvar} disabled={busy} style={btn("#22d3ee", !busy)}>
                  {busy ? "Salvando…" : "Salvar"}
                </button>
                <button onClick={() => { setEdit(null); setMsg(null); }}
                  style={{ ...btn("var(--surface-2)", false), color: "var(--text)" }}>Cancelar</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── lista ── */}
      <div style={cartao}>
        <div style={rotulo}>{cat?.label} ({linhas.length})</div>
        {carregando ? (
          <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Carregando…</div>
        ) : linhas.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", padding: "1rem", border: "1px dashed var(--border)", borderRadius: 8 }}>
            Nada cadastrado ainda. Enquanto estiver assim, este campo aparece como "nenhum cadastrado" na ficha da recepção — e o atendimento é aberto sem ele.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {linhas.map(l => (
              <div key={l.id} style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap",
                                       background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8,
                                       padding: "8px 11px", opacity: l.ativo ? 1 : 0.55 }}>
                <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", minWidth: 84 }}>{l.codigo}</span>
                <span style={{ fontSize: 12.5, flex: 1, minWidth: 130 }}>{l.nome}</span>

                {chave === "convenios" && (
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {TIPOS_DE_CONVENIO.find(t => t.chave === l.tipo)?.label || l.tipo}
                    {l.tipo !== "sus" && (l.exige_carteira ? " · carteira" : "")}
                    {l.tipo !== "sus" && (l.exige_autorizacao ? " · autorização" : "")}
                  </span>
                )}
                {chave === "planos" && (
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {nomeDoConvenio(l.convenio_id)}{l.coparticipacao ? " · coparticipação" : ""}
                  </span>
                )}
                {chave === "procedimentos" && (
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {l.tabela} · {(l.cbos_compativeis || []).length} CBO(s)
                    {" · "}{l.via_sus ? l.via_sus.toUpperCase() : "BPA (por omissão)"}
                    {/* `null` e 0 não são a mesma coisa: sem preço mostra "—",
                        de graça mostra R$ 0,00. */}
                    {" · "}{l.valor_sus == null ? "—" : reais(Math.round(Number(l.valor_sus) * 100))}
                  </span>
                )}
                {l.sistema && (
                  <span style={{ fontSize: 10, fontWeight: 800, color: "#6366f1" }} title="Veio do padrão nacional">PADRÃO</span>
                )}
                {!l.ativo && <span style={{ fontSize: 10, fontWeight: 800, color: "#d97706" }}>DESLIGADO</span>}

                {canEdit && (
                  <>
                    <button onClick={() => setEdit({ ...l, cbos_compativeis: (l.cbos_compativeis || []).join(", ") })}
                      style={{ ...btn("var(--surface-2)", false), color: "var(--text)", padding: "4px 10px", fontSize: 11.5 }}>Editar</button>
                    {/* Linha do padrão nacional não ganha botão de desligar:
                        caráter do atendimento vem de norma e sumir com ele
                        quebraria a AIH. Editar o rótulo continua permitido. */}
                    {!l.sistema && (
                      <button onClick={() => alternar(l)}
                        style={{ ...btn("var(--surface-2)", false), color: "var(--text)", padding: "4px 10px", fontSize: 11.5 }}>
                        {l.ativo ? "Desligar" : "Religar"}
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10 }}>
          Não existe apagar — só desligar. O que já foi usado num atendimento precisa continuar
          existindo, senão um relatório de meses atrás passa a mostrar código sem nome.
        </div>
      </div>
    </div>
  );
}
