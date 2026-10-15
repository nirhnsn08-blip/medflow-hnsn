// ═══════════════════════════════════════════════════════════
// A GUIA TISS, NA TELA DA CONTA
//
// 🔴 NÃO SE FATURA CONVÊNIO COM CONTA — FATURA-SE COM GUIA. Este painel só
// aparece quando a conta sai pela via `tiss`, porque guia TISS sobre conta
// do SUS é cobrança indevida (e o gatilho recusa).
//
// ⚠️ RASCUNHO SALVA SEM EXIGÊNCIA NENHUMA, de propósito. Quem está montando
// a guia descobre no meio que falta a carteira e precisa ligar para o
// paciente — se o sistema recusasse guardar, o trabalho feito até ali seria
// perdido. A exigência é na EMISSÃO, que é quando o documento passa a
// existir para a operadora.
//
// 🔴 O QUE É CARIMBADO NÃO VOLTA. Depois de emitida, nem a carteira, nem o
// registro ANS, nem o número mudam — é o documento que a operadora recebeu.
// Correção se faz cancelando e emitindo outra, e a tela diz isso antes.
//
// ⚠️ O XML NÃO SAI DAQUI. Recusa deliberada, a mesma de `faturamento.js`: o
// padrão é versionado e a operadora homologa. A guia impressa é documento
// válido, e é com ela que o hospital cobra hoje.
//
// Só desenho. As regras estão em `tiss.js` (puras, testadas) e as recusas
// de verdade no gatilho — com as mesmas palavras.
// ═══════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from "react";
import { registrarAuditoria } from "../auditoria/dados.js";
import { horaFmt } from "../util/datas.js";
import { naoDeuParaLer } from "../util/leitura.js";
import {
  TIPOS_GUIA, CARATERES, estadoDaGuia, jaSaiu,
  pendenciasParaEmitir, conferirCancelamento, linhaDaGuia, guiaVazia,
} from "./tiss.js";
import {
  carregarGuiasDaConta, salvarGuia, emitirGuia, cancelarGuia, registrarRetorno,
} from "./dados.js";

const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
const lbl = { fontSize: 10.5, color: "var(--text-muted)", display: "block", marginBottom: 3 };
const cartao = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.1rem 1.25rem", marginBottom: 14 };
const rotulo = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 };

export function GuiaTiss({ sb, conta, convenio, paciente, itens, profissional, profissionais = [], currentUser, canEdit }) {
  const [guias, setGuias] = useState([]);
  const [carregou, setCarregou] = useState(false);
  const [form, setForm] = useState(() => guiaVazia());
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState(false);
  const [cancelando, setCancelando] = useState(null);   // { id, motivo }
  const [retorno, setRetorno] = useState(null);         // { id, numero }
  // 🔴 QUEM EXECUTOU. Começa no profissional do atendimento, mas é
  // escolhível — e isso NÃO é conveniência: visto andando no demo, o
  // atendimento #280 não tinha médico nenhum, e sem o seletor a guia era
  // impossível de emitir por esta tela, sem saída nenhuma oferecida.
  //
  // ⚠️ E é correto mesmo quando o atendimento TEM médico: no TISS o
  // executante da guia pode ser outro — quem fez o exame não é
  // necessariamente quem atendeu.
  const [escolhido, setEscolhido] = useState("");

  // A guarda do PR #277, com a linha que a religa na montagem — sem ela o
  // StrictMode deixa o painel preso em "Carregando" para sempre.
  const naTela = useRef(true);
  useEffect(() => {
    naTela.current = true;
    return () => { naTela.current = false; };
  }, []);

  const contaId = conta?.id;
  async function recarregar() {
    if (!sb || contaId == null) { setCarregou(true); return; }
    const g = await carregarGuiasDaConta(sb, contaId);
    if (!naTela.current) return;
    setGuias(g); setCarregou(true);
  }
  useEffect(() => { setCarregou(false); recarregar(); }, [sb, contaId]);

  // O beneficiário já está no cadastro: a tela sugere, a pessoa confirma.
  useEffect(() => {
    setForm(f => ({
      ...f,
      beneficiario_nome: f.beneficiario_nome || paciente?.nome_completo || paciente?.iniciais || "",
      beneficiario_cns: f.beneficiario_cns || paciente?.cns || "",
      beneficiario_carteira: f.beneficiario_carteira || conta?.carteira || "",
    }));
  }, [paciente?.nome_completo, paciente?.iniciais, paciente?.cns, conta?.carteira]);

  const set = (k, v) => { setForm(p => ({ ...p, [k]: v })); setErro(""); };

  const executante = useMemo(() => {
    if (escolhido) return profissionais.find(p => p.username === escolhido) || null;
    return profissional;
  }, [escolhido, profissionais, profissional]);

  const pendencias = useMemo(
    () => pendenciasParaEmitir({ guia: form, conta, convenio, itens, profissional: executante }),
    [form, conta, convenio, itens, executante]);

  const vivas = guias.filter(g => g.status !== "cancelada");

  async function gravar(status) {
    if (status === "emitida" && pendencias.length) { setErro(pendencias[0].texto); return; }
    setErro(""); setGravando(true);
    const r = await salvarGuia(sb, linhaDaGuia(form, { conta, convenio, profissional: executante }), status, currentUser);
    setGravando(false);
    // 🔴 EM CASO DE FALHA O FORMULÁRIO FICA. Uma recusa silenciosa da RLS
    // levaria junto a carteira que alguém acabou de buscar por telefone.
    if (!r.ok) { setErro(r.erro); return; }
    registrarAuditoria(sb, currentUser,
      status === "emitida" ? "TISS: guia emitida" : "TISS: rascunho de guia",
      `conta #${conta?.id}${r.guia?.numero_prestador ? ` · guia ${r.guia.numero_prestador}` : ""}`, {});
    if (naTela.current) setForm(guiaVazia());
    recarregar();
  }

  async function emitirRascunho(g) {
    const r = await emitirGuia(sb, g.id, currentUser);
    if (!r.ok) { alert(r.erro); return; }
    registrarAuditoria(sb, currentUser, "TISS: guia emitida", `guia ${r.guia?.numero_prestador || g.id}`, {});
    recarregar();
  }

  async function confirmarCancelamento() {
    const c = conferirCancelamento(cancelando?.motivo);
    if (c) { setErro(c); return; }
    const r = await cancelarGuia(sb, cancelando.id, cancelando.motivo);
    if (!r.ok) { setErro(r.erro); return; }
    registrarAuditoria(sb, currentUser, "TISS: guia cancelada", `guia ${cancelando.numero || cancelando.id}`, {});
    if (naTela.current) { setCancelando(null); setErro(""); }
    recarregar();
  }

  async function confirmarRetorno() {
    const r = await registrarRetorno(sb, retorno.id, { numeroOperadora: retorno.numero, status: "enviada" });
    if (!r.ok) { alert(r.erro); return; }
    if (naTela.current) setRetorno(null);
    recarregar();
  }

  if (!conta || conta.via !== "tiss") return null;

  return (
    <div style={cartao}>
      <div style={rotulo}>Guia TISS</div>
      <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
        Conta de operadora não se cobra com a conta — cobra-se com a guia. O sistema não gera o
        XML (o padrão é versionado e a operadora homologa); a guia impressa é documento válido.
      </p>

      {!carregou && <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Carregando guias…</div>}

      {naoDeuParaLer(guias) && (
        <div style={{ fontSize: 11.5, color: "#f43f5e", fontWeight: 600, marginBottom: 10, lineHeight: 1.5 }}>
          Não foi possível ler as guias desta conta. Pode haver guia emitida que a tela não mostrou —
          confira antes de emitir outra, para não cobrar duas vezes.
        </div>
      )}

      {/* AS GUIAS QUE JÁ EXISTEM */}
      {carregou && guias.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
          {guias.map(g => {
            const st = estadoDaGuia(g);
            return (
              <div key={g.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: `4px solid ${st.cor}`, borderRadius: 8, padding: "9px 12px" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 13 }}>
                    {g.numero_prestador ? `Guia ${g.numero_prestador}` : "Rascunho (sem número)"}
                  </strong>
                  <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
                    {TIPOS_GUIA.find(t => t.chave === g.tipo)?.label || g.tipo}
                  </span>
                  {g.numero_operadora && (
                    <span style={{ fontSize: 10.5, color: "var(--text-3)" }}>operadora: {g.numero_operadora}</span>
                  )}
                  <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: st.cor }}>{st.label}</span>
                </div>
                <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace", marginTop: 2 }}>
                  {g.beneficiario_carteira ? `carteira ${g.beneficiario_carteira}` : "sem carteira"}
                  {g.emitida_em ? ` · emitida ${horaFmt(g.emitida_em)}${g.emitida_por ? ` por ${g.emitida_por}` : ""}` : ""}
                  {g.registro_ans ? ` · ANS ${g.registro_ans}` : ""}
                </div>
                {g.status === "cancelada" && g.cancelamento_motivo && (
                  <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 3 }}>
                    <strong>Cancelada:</strong> {g.cancelamento_motivo}
                  </div>
                )}

                {canEdit && String(cancelando?.id) === String(g.id) ? (
                  <div style={{ marginTop: 8 }}>
                    <input value={cancelando.motivo} onChange={e => { setCancelando(p => ({ ...p, motivo: e.target.value })); setErro(""); }}
                      placeholder="Por que esta guia está sendo cancelada?" style={{ ...inp, marginBottom: 6 }} />
                    {erro && <div style={{ fontSize: 11.5, color: "#f43f5e", fontWeight: 600, marginBottom: 6, lineHeight: 1.5 }}>{erro}</div>}
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button onClick={() => { setCancelando(null); setErro(""); }} style={botao("var(--text-muted)")}>Voltar</button>
                      <button onClick={confirmarCancelamento} style={botao("#f43f5e")}>Cancelar a guia</button>
                    </div>
                  </div>
                ) : canEdit && String(retorno?.id) === String(g.id) ? (
                  <div style={{ marginTop: 8 }}>
                    <input value={retorno.numero} onChange={e => setRetorno(p => ({ ...p, numero: e.target.value }))}
                      placeholder="Número que a operadora devolveu" style={{ ...inp, marginBottom: 6 }} />
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button onClick={() => setRetorno(null)} style={botao("var(--text-muted)")}>Voltar</button>
                      <button onClick={confirmarRetorno} style={botao("#6366f1")}>Registrar envio</button>
                    </div>
                  </div>
                ) : canEdit && (
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    {g.status === "rascunho" && (
                      <button onClick={() => emitirRascunho(g)} style={botao("#3b82f6")}>Emitir</button>
                    )}
                    {g.status === "emitida" && (
                      <button onClick={() => setRetorno({ id: g.id, numero: "" })} style={botao("#6366f1")}>Registrar envio</button>
                    )}
                    {g.status !== "cancelada" && (
                      <button onClick={() => { setCancelando({ id: g.id, motivo: "", numero: g.numero_prestador }); setErro(""); }}
                        style={{ ...botao("var(--text-muted)"), marginLeft: "auto" }}>Cancelar</button>
                    )}
                  </div>
                )}

                {jaSaiu(g) && (
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 5 }}>
                    Já saiu para a operadora: carteira, número e registro ANS não mudam mais.
                    Correção se faz cancelando e emitindo outra.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 🔴 JÁ HÁ GUIA VIVA — avisar ANTES, porque guia repetida é cobrança dupla. */}
      {carregou && vivas.length > 0 && canEdit && (
        <div style={{ fontSize: 11.5, color: "#f59e0b", fontWeight: 600, marginBottom: 10, lineHeight: 1.5 }}>
          Esta conta já tem {vivas.length === 1 ? "uma guia" : `${vivas.length} guias`} que não {vivas.length === 1 ? "foi cancelada" : "foram canceladas"}.
          Emitir outra cobra a operadora duas vezes pelo mesmo atendimento.
        </div>
      )}

      {/* O FORMULÁRIO */}
      {canEdit && carregou && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <label><span style={lbl}>Tipo da guia</span>
              <select value={form.tipo} onChange={e => set("tipo", e.target.value)} style={inp}>
                {TIPOS_GUIA.map(t => <option key={t.chave} value={t.chave}>{t.label}</option>)}
              </select>
              <span style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginTop: 3, lineHeight: 1.4 }}>
                {TIPOS_GUIA.find(t => t.chave === form.tipo)?.quando}
              </span>
            </label>
            <label><span style={lbl}>Caráter</span>
              <select value={form.carater} onChange={e => set("carater", e.target.value)} style={inp}>
                {CARATERES.map(c => <option key={c.chave} value={c.chave}>{c.label}</option>)}
              </select>
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
            <label><span style={lbl}>Beneficiário</span>
              <input value={form.beneficiario_nome} onChange={e => set("beneficiario_nome", e.target.value)} style={inp} />
            </label>
            <label><span style={lbl}>Carteira na operadora</span>
              <input value={form.beneficiario_carteira} onChange={e => set("beneficiario_carteira", e.target.value)}
                placeholder="obrigatória para emitir" style={inp} />
            </label>
            <label><span style={lbl}>Validade da carteira</span>
              <input type="date" value={form.beneficiario_validade} onChange={e => set("beneficiario_validade", e.target.value)} style={inp} />
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <label><span style={lbl}>Senha de autorização</span>
              <input value={form.senha} onChange={e => set("senha", e.target.value)}
                placeholder="quando a operadora exigir" style={inp} />
            </label>
            <label><span style={lbl}>Validade da senha</span>
              <input type="date" value={form.senha_validade} onChange={e => set("senha_validade", e.target.value)} style={inp} />
            </label>
          </div>

          {/* 🔴 O EXECUTANTE. Sem ele a guia não sai, e quando o
              atendimento não registrou médico esta é a ÚNICA saída. */}
          <label style={{ display: "block", marginBottom: 10 }}><span style={lbl}>Profissional executante</span>
            <select value={escolhido} onChange={e => { setEscolhido(e.target.value); setErro(""); }} style={inp}>
              <option value="">
                {profissional?.nome
                  ? `${profissional.nome} — quem atendeu`
                  : "— escolha quem executou —"}
              </option>
              {profissionais.map(p => (
                <option key={p.username} value={p.username}>
                  {p.nome}{p.conselho ? ` · ${p.conselho} ${p.registro_conselho || "?"}/${p.uf_conselho || "?"}` : " · sem conselho cadastrado"}
                </option>
              ))}
            </select>
            {executante && (
              <span style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginTop: 3 }}>
                {[executante.conselho ?? executante.profissional_conselho,
                  executante.registro_conselho ?? executante.profissional_registro,
                  executante.uf_conselho ?? executante.profissional_uf,
                  executante.cbo ?? executante.profissional_cbo].filter(Boolean).join(" · ") || "sem conselho, número, UF ou CBO cadastrados"}
              </span>
            )}
          </label>

          <label style={{ display: "block", marginBottom: 10 }}><span style={lbl}>Indicação clínica</span>
            <textarea value={form.indicacao_clinica} onChange={e => set("indicacao_clinica", e.target.value)} rows={2}
              placeholder="o que se está procurando — é o que a operadora lê para autorizar"
              style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} />
          </label>

          {/* 🔴 O QUE FALTA, com onde se conserta. */}
          {pendencias.length > 0 && (
            <div style={{ background: "#f43f5e14", border: "1px solid #f43f5e", borderRadius: 8, padding: "9px 12px", marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#f43f5e", marginBottom: 4 }}>
                {pendencias.length === 1 ? "Falta 1 coisa" : `Faltam ${pendencias.length} coisas`} para emitir
              </div>
              {pendencias.map(p => (
                <div key={p.chave} style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5, marginTop: 3 }}>
                  {p.texto} <span style={{ color: "var(--text-muted)" }}>Conserta-se em: {p.onde}.</span>
                </div>
              ))}
            </div>
          )}

          {erro && !cancelando && (
            <div style={{ fontSize: 11.5, color: "#f43f5e", fontWeight: 600, marginBottom: 8, lineHeight: 1.5 }}>{erro}</div>
          )}

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* ⚠️ Rascunho salva SEM exigência: quem descobre no meio que falta
                a carteira não pode perder o que já preencheu. */}
            <button onClick={() => gravar("rascunho")} disabled={gravando} style={botao("var(--text-muted)")}>
              {gravando ? "…" : "Salvar rascunho"}
            </button>
            <button onClick={() => gravar("emitida")} disabled={gravando || pendencias.length > 0}
              style={{ ...botao("#3b82f6"), opacity: pendencias.length ? .45 : 1, cursor: pendencias.length ? "not-allowed" : "pointer" }}>
              {gravando ? "Emitindo…" : "Emitir guia"}
            </button>
            <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
              Depois de emitida, carteira e número não mudam — correção é cancelar e emitir outra.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

const botao = cor => ({
  background: "transparent", color: cor, border: `1px solid ${cor}`,
  borderRadius: 6, padding: "6px 13px", fontSize: 12, fontWeight: 700, cursor: "pointer",
});
