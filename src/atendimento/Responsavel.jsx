// ═══════════════════════════════════════════════════════════
// RESPONSÁVEL DO EPISÓDIO — a tela
//
// Só desenho. As regras estão em `responsavel.js` (puras, testadas): quem
// a idade obriga a ter responsável, o que exige decisão judicial e por que
// acompanhante não consente.
//
// ONDE ELA APARECE, E POR QUÊ
// No passo final do balcão, junto da impressão da pulseira — enquanto a
// pessoa que trouxe o paciente ainda está na frente. Registrar depois
// significa telefonar para descobrir quem era, e é assim que "a mãe" vira
// o único dado do consentimento.
//
// O QUE A TELA NÃO OFERECE: caixinhas de "pode consentir" e "pode receber
// alta". Elas são consequência do papel. Oferecê-las ensinaria que dá para
// dar poder de consentimento a um acompanhante — e daria.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import {
  PAPEIS, VINCULOS, VINCULO_POR_CHAVE, exigeDocumentoJudicial,
  papelExigido, conferirResponsavel, pendenciaDeResponsavel,
} from "./responsavel.js";
import { formatarCPF } from "../pacientes/identidade.js";
import { carregarResponsaveis, responsaveisAnteriores, salvarResponsavel, desativarResponsavel } from "./dados.js";

const cartao = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.1rem 1.25rem", marginBottom: 14 };
const rotulo = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 };
const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
const lbl = { fontSize: 10.5, color: "var(--text-muted)", display: "block", marginBottom: 3 };
const btn = (cor, ativo = true) => ({
  background: ativo ? cor : "var(--surface-2)", color: ativo ? "#000" : "var(--text-muted)",
  border: ativo ? "none" : "1px solid var(--border)", borderRadius: 6, padding: "8px 15px",
  fontWeight: 700, cursor: ativo ? "pointer" : "not-allowed", fontSize: 12.5, whiteSpace: "nowrap",
});

const VAZIO = {
  nome: "", cpf: "", data_nascimento: "", telefone: "",
  vinculo: "", papel: "", documento_judicial: "", observacao: "",
};

export default function Responsavel({ sb, currentUser, canEdit, paciente, atendimento, onMudou }) {
  const [lista, setLista] = useState([]);
  const [anteriores, setAnteriores] = useState([]);
  const [form, setForm] = useState(null);      // null = formulário fechado
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const exigencia = papelExigido(paciente);

  const recarregar = useCallback(async () => {
    const r = await carregarResponsaveis(sb, atendimento?.id);
    setLista(r);
    onMudou?.(r);
  }, [sb, atendimento?.id, onMudou]);

  useEffect(() => { recarregar(); }, [recarregar]);

  useEffect(() => {
    let vivo = true;
    responsaveisAnteriores(sb, paciente?.prontuario).then(r => { if (vivo) setAnteriores(r); });
    return () => { vivo = false; };
  }, [sb, paciente?.prontuario]);

  const ativos = lista.filter(r => r.ativo !== false);
  const pendencia = pendenciaDeResponsavel({ paciente, responsaveis: ativos });

  // Os anteriores que ainda não estão neste episódio — o CPF desempata, e
  // o nome resolve quem foi cadastrado sem documento.
  const jaAqui = new Set(ativos.map(r => (r.cpf || r.nome || "").toLowerCase()));
  const paraCopiar = anteriores
    .filter(r => String(r.atendimento_id ?? "") !== String(atendimento?.id ?? ""))
    .filter(r => !jaAqui.has((r.cpf || r.nome || "").toLowerCase()))
    .filter((r, i, arr) => arr.findIndex(x => (x.cpf || x.nome) === (r.cpf || r.nome)) === i);

  function abrirForm(base = null) {
    setMsg(null);
    setForm({
      ...VAZIO,
      // O papel já vem sugerido pela IDADE — é o que a lei manda, e digitar
      // de novo só cria chance de escolher errado. Continua trocável.
      papel: exigencia.papel || "acompanhante",
      ...(base ? {
        nome: base.nome || "", cpf: base.cpf || "", data_nascimento: base.data_nascimento || "",
        telefone: base.telefone || "", vinculo: base.vinculo || "",
        papel: base.papel || exigencia.papel || "acompanhante",
        documento_judicial: base.documento_judicial || "",
      } : {}),
    });
  }

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  async function salvar() {
    if (!canEdit || busy || !form) return;
    const v = conferirResponsavel({ paciente, responsavel: form });
    if (!v.ok) { setMsg({ tom: "erro", texto: v.erros.join(" ") }); return; }
    if (v.avisos.length && !confirm(v.avisos.map(a => `• ${a}`).join("\n\n") + "\n\nGravar assim mesmo?")) return;

    setBusy(true);
    const r = await salvarResponsavel(sb, {
      ...form, atendimento_id: atendimento?.id ?? null, prontuario: paciente?.prontuario ?? null,
    }, currentUser);
    setBusy(false);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    setForm(null);
    setMsg({ tom: "ok", texto: `${r.responsavel.nome} registrado como ${PAPEIS[r.responsavel.papel]?.label.toLowerCase()}.` });
    recarregar();
  }

  async function remover(r) {
    if (!canEdit) return;
    if (!confirm(
      `Remover ${r.nome} deste episódio?\n\n` +
      "O registro não é apagado — fica desligado, com a data. Quem consentiu continua tendo consentido.")) return;
    const out = await desativarResponsavel(sb, r.id, currentUser);
    if (!out.ok) { setMsg({ tom: "erro", texto: out.motivo }); return; }
    recarregar();
  }

  const exigeDoc = exigeDocumentoJudicial(form?.vinculo);

  return (
    <div style={cartao}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <div style={{ ...rotulo, marginBottom: 0 }}>Responsável pelo episódio</div>
        <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
          quem consente e a quem o paciente pode ser entregue
        </span>
        {canEdit && !form && (
          <button onClick={() => abrirForm()} style={{ ...btn("#22d3ee"), marginLeft: "auto" }}>
            + Registrar
          </button>
        )}
      </div>

      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 8 }}>{exigencia.motivo}</div>

      {msg && (
        <div style={{ marginTop: 10, padding: "9px 12px", borderRadius: 8, fontSize: 12,
                      background: msg.tom === "erro" ? "#f43f5e10" : "#34d39910",
                      border: `1px solid ${msg.tom === "erro" ? "#f43f5e55" : "#34d39955"}` }}>
          {msg.texto}
        </div>
      )}

      {pendencia && (
        <div style={{ marginTop: 10, padding: "9px 12px", borderRadius: 8, fontSize: 12,
                      background: pendencia.gravidade === "alta" ? "#d9770610" : "var(--surface-2)",
                      border: `1px solid ${pendencia.gravidade === "alta" ? "#d9770655" : "var(--border)"}` }}>
          <strong style={{ color: pendencia.gravidade === "alta" ? "#d97706" : "var(--text-muted)" }}>Pendência</strong> — {pendencia.texto}
        </div>
      )}

      {/* ── já registrados ── */}
      {ativos.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
          {ativos.map(r => (
            <div key={r.id} style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap",
                                     background: "var(--surface-2)", border: "1px solid var(--border)",
                                     borderRadius: 8, padding: "8px 11px" }}>
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>{r.nome}</span>
              <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                {VINCULO_POR_CHAVE[r.vinculo]?.label || r.vinculo || "—"} · {PAPEIS[r.papel]?.label || r.papel}
                {r.cpf ? ` · ${formatarCPF(r.cpf)}` : ""}
                {r.telefone ? ` · ${r.telefone}` : ""}
              </span>
              {r.consente && <span style={{ fontSize: 10.5, fontWeight: 800, color: "#0d9488" }}>CONSENTE</span>}
              {r.recebe_alta && <span style={{ fontSize: 10.5, fontWeight: 800, color: "#6366f1" }}>RECEBE ALTA</span>}
              {r.documento_judicial && (
                <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>proc. {r.documento_judicial}</span>
              )}
              {canEdit && (
                <button onClick={() => remover(r)}
                  style={{ ...btn("var(--surface-2)", false), color: "var(--text)", marginLeft: "auto", padding: "4px 10px", fontSize: 11 }}>
                  Remover
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── copiar de episódio anterior ── */}
      {canEdit && !form && paraCopiar.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
            Já registrado em episódio anterior deste paciente — copiar cria um registro NOVO para hoje:
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {paraCopiar.map(r => (
              <button key={r.id} onClick={() => abrirForm(r)}
                style={{ ...btn("var(--surface-2)", false), color: "var(--text)", fontSize: 11.5 }}>
                {r.nome} · {VINCULO_POR_CHAVE[r.vinculo]?.label || r.vinculo}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── formulário ── */}
      {form && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Nome completo *</label>
              <input value={form.nome} onChange={e => set("nome", e.target.value)} style={inp}
                placeholder="Como está no documento" />
            </div>
            <div>
              <label style={lbl}>Vínculo com o paciente *</label>
              <select value={form.vinculo} onChange={e => set("vinculo", e.target.value)} style={inp}>
                <option value="">—</option>
                {VINCULOS.map(v => <option key={v.chave} value={v.chave}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Papel *</label>
              <select value={form.papel} onChange={e => set("papel", e.target.value)} style={inp}>
                {Object.entries(PAPEIS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
              </select>
              <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.35 }}>
                {PAPEIS[form.papel]?.quem}
              </div>
            </div>
            <div>
              <label style={lbl}>CPF</label>
              <input value={form.cpf} onChange={e => set("cpf", e.target.value)} style={inp} placeholder="000.000.000-00" />
            </div>
            <div>
              <label style={lbl}>Telefone</label>
              <input value={form.telefone} onChange={e => set("telefone", e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Data de nascimento</label>
              <input type="date" value={form.data_nascimento} onChange={e => set("data_nascimento", e.target.value)} style={inp} />
            </div>
            {exigeDoc && (
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Número do processo judicial *</label>
                <input value={form.documento_judicial} onChange={e => set("documento_judicial", e.target.value)}
                  style={inp} placeholder="Ex.: 0801234-55.2025.8.21.0001" />
                <div style={{ fontSize: 10.5, color: "#d97706", marginTop: 3, lineHeight: 1.4 }}>
                  {VINCULO_POR_CHAVE[form.vinculo]?.label} só existe por decisão judicial. Sem o processo,
                  este cadastro estaria retirando de uma pessoa capaz o direito de decidir por si
                  (Lei 13.146/2015).
                </div>
              </div>
            )}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Observação</label>
              <input value={form.observacao} onChange={e => set("observacao", e.target.value)} style={inp} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={salvar} disabled={busy} style={btn("#22d3ee", !busy)}>
              {busy ? "Gravando…" : "Gravar responsável"}
            </button>
            <button onClick={() => { setForm(null); setMsg(null); }}
              style={{ ...btn("var(--surface-2)", false), color: "var(--text)" }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
