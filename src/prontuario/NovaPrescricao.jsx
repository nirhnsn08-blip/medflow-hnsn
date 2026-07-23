// ═══════════════════════════════════════════════════════════
// NOVA PRESCRIÇÃO DA INTERNAÇÃO
//
// Duas coisas que este formulário faz e que valem explicação:
//
// 1. Os alertas de farmácia clínica aparecem ENQUANTO se monta, não
//    depois de assinar. Alerta que chega depois da assinatura é auditoria;
//    alerta que chega antes é prevenção.
//
// 2. Quem pode assinar depende da CATEGORIA PROFISSIONAL, não do perfil de
//    acesso. Prescrição médica é do médico; prescrição de enfermagem é
//    privativa do enfermeiro (COFEN 736/2024, arts. 6º e 7º). Um
//    adm_master administrativo não assina nenhuma das duas.
// ═══════════════════════════════════════════════════════════

import { useState, useMemo } from "react";
import { analisarPrescricaoClinica, FARM_GRAV } from "../clinico/alertas.js";
import { textoAlergiasParaAlerta } from "../clinico/alergias.js";
import { podeClinico, motivoDaRecusa, assinaturaDe } from "../clinico/papeis.js";
import { assinarPrescricao } from "./dados.js";

const VIAS = ["VO", "EV", "IM", "SC", "SL", "IN", "TOP", "RET", "OFT", "NAS", "SNE"];
const FREQS = [
  { label: "1x/dia", dia: 1 }, { label: "12/12h (2x)", dia: 2 }, { label: "8/8h (3x)", dia: 3 },
  { label: "6/6h (4x)", dia: 4 }, { label: "4/4h (6x)", dia: 6 }, { label: "Dose única", dia: 1 },
  { label: "Se necessário (SN)", dia: null },
];
const TIPOS_ITEM = [
  ["medicamento", "Medicamento"], ["dieta", "Dieta"],
  ["cuidado", "Cuidado de enfermagem"], ["procedimento", "Procedimento"],
];

const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
const lbl = { fontSize: 10.5, color: "var(--text-muted)", display: "block", marginBottom: 3 };
const cartao = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", marginBottom: 14 };

export default function NovaPrescricao({ sb, episodio, currentUser, medById, meds = [], interacoes = [], incompatY = [], alergias = [], condicoes = [], prescricaoAnterior, onPronto, onCancelar }) {
  const [tipo, setTipo] = useState("medica");
  const [itens, setItens] = useState([]);
  const [obs, setObs] = useState("");
  const [f, setF] = useState({ tipo: "medicamento", medicamento_id: "", descricao: "", dose_valor: "", dose_unidade: "mg", via: "VO", frequencia: "6/6h (4x)", duracao_dias: "", observacao: "" });
  const [salvando, setSalvando] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const ato = tipo === "medica" ? "prescricao_medica" : "prescricao_enfermagem";
  const pode = podeClinico(currentUser, ato);
  const assinatura = assinaturaDe(currentUser);

  // Alertas recalculados a cada item adicionado — antes de assinar.
  const ctx = useMemo(() => ({
    alergias: textoAlergiasParaAlerta(alergias),
    em_sonda: condicoes.some(c => /sonda/i.test(c.descricao || "")),
    idade: null, clearance_renal: null, funcao_hepatica: null,
  }), [alergias, condicoes]);

  const alertas = useMemo(() => {
    const paraMotor = itens.map(i => ({ ...i, medicamento_nome: i.descricao }));
    return itens.length ? analisarPrescricaoClinica(paraMotor, ctx, medById, interacoes, incompatY) : [];
  }, [itens, ctx, medById, interacoes, incompatY]);

  function adicionar() {
    const med = f.medicamento_id ? medById[f.medicamento_id] : null;
    const desc = med ? med.nome : f.descricao.trim();
    if (!desc) return;
    const fr = FREQS.find(x => x.label === f.frequencia);
    setItens(p => [...p, {
      tipo: f.tipo,
      medicamento_id: med ? Number(f.medicamento_id) : null,
      descricao: desc,
      dose: f.dose_valor ? `${f.dose_valor} ${f.dose_unidade}` : null,
      dose_valor: f.dose_valor ? Number(f.dose_valor) : null,
      dose_unidade: f.dose_valor ? f.dose_unidade : null,
      via: f.via, frequencia: f.frequencia, frequencia_dia: fr?.dia ?? null,
      se_necessario: f.frequencia === "Se necessário (SN)",
      duracao_dias: f.duracao_dias ? Number(f.duracao_dias) : null,
      observacao: f.observacao || null,
    }]);
    setF(p => ({ ...p, medicamento_id: "", descricao: "", dose_valor: "", duracao_dias: "", observacao: "" }));
  }

  async function assinar() {
    if (!pode || !itens.length) return;
    const graves = alertas.filter(a => a.gravidade === "alta");
    if (graves.length && !confirm(
      `Esta prescrição tem ${graves.length} alerta(s) de gravidade ALTA:\n\n` +
      graves.map(a => `• ${a.titulo}: ${a.detalhe}`).join("\n\n") +
      `\n\nAssinar mesmo assim?`)) return;
    if (!confirm("A prescrição é assinada com data/hora e NÃO pode ser editada nem apagada. Confirma?")) return;

    setSalvando(true);
    // `currentUser` inteiro, não só o nome: a camada de dados congela
    // conselho e registro dentro da prescrição (CFM 2.299/2021, art. 2º).
    await assinarPrescricao(sb, episodio, {
      itens, tipo, observacao: obs, substituiId: prescricaoAnterior?.id || null,
    }, currentUser);
    setSalvando(false);
    onPronto?.();
  }

  const medsOrdenados = useMemo(
    () => [...meds].sort((a, b) => (a.nome || "").localeCompare(b.nome || "")), [meds]);

  return (
    <div>
      <div style={cartao}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <strong style={{ fontSize: 14 }}>Nova prescrição</strong>
          <select value={tipo} onChange={e => setTipo(e.target.value)} style={{ ...inp, width: "auto" }}>
            <option value="medica">Prescrição médica</option>
            <option value="enfermagem">Prescrição de enfermagem</option>
          </select>
          {prescricaoAnterior && (
            <span style={{ fontSize: 11.5, color: "#d97706" }}>
              substitui a prescrição de {prescricaoAnterior.data_referencia}
            </span>
          )}
          <button onClick={onCancelar} style={{ marginLeft: "auto", background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px", fontSize: 12.5, cursor: "pointer" }}>Cancelar</button>
        </div>

        {!pode && (
          <div style={{ background: "#f43f5e18", border: "1px solid #f43f5e55", borderRadius: 8, padding: "10px 13px", fontSize: 12.5, color: "#f43f5e", fontWeight: 600, marginBottom: 12 }}>
            {motivoDaRecusa(currentUser, ato)}
          </div>
        )}
        {pode && !assinatura.completa && (
          <div style={{ background: "#d9770618", border: "1px solid #d9770655", borderRadius: 8, padding: "9px 13px", fontSize: 12, color: "#d97706", marginBottom: 12 }}>
            Seu cadastro não tem registro de conselho. A prescrição sai assinada com seu nome, mas incompleta
            para a CFM 2.299/2021 — peça ao administrador para incluir seu {assinatura.conselho || "conselho"}.
          </div>
        )}

        {/* CONSTRUTOR DE ITEM */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8, alignItems: "end" }}>
          <div>
            <label style={lbl}>Tipo</label>
            <select value={f.tipo} onChange={e => set("tipo", e.target.value)} style={inp}>
              {TIPOS_ITEM.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </div>
          {f.tipo === "medicamento" ? (
            <div style={{ gridColumn: "span 2" }}>
              <label style={lbl}>Medicamento</label>
              <select value={f.medicamento_id} onChange={e => set("medicamento_id", e.target.value)} style={inp}>
                <option value="">Escolha…</option>
                {medsOrdenados.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>
          ) : (
            <div style={{ gridColumn: "span 2" }}>
              <label style={lbl}>Descrição</label>
              <input value={f.descricao} onChange={e => set("descricao", e.target.value)}
                placeholder={f.tipo === "dieta" ? "Ex.: dieta branda, hipossódica" : "Ex.: mudança de decúbito 2/2h"} style={inp} />
            </div>
          )}
          <div>
            <label style={lbl}>Dose</label>
            <input type="number" step="any" value={f.dose_valor} onChange={e => set("dose_valor", e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Unidade</label>
            <input value={f.dose_unidade} onChange={e => set("dose_unidade", e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Via</label>
            <select value={f.via} onChange={e => set("via", e.target.value)} style={inp}>
              {VIAS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Frequência</label>
            <select value={f.frequencia} onChange={e => set("frequencia", e.target.value)} style={inp}>
              {FREQS.map(x => <option key={x.label} value={x.label}>{x.label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Dias</label>
            <input type="number" value={f.duracao_dias} onChange={e => set("duracao_dias", e.target.value)} style={inp} />
          </div>
          <button onClick={adicionar} style={{ background: "#2dd4bf22", color: "#2dd4bf", border: "1px solid #2dd4bf66", borderRadius: 6, padding: "9px 14px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>+ Adicionar</button>
        </div>
      </div>

      {/* ALERTAS — antes de assinar, não depois */}
      {alertas.length > 0 && (
        <div style={{ ...cartao, borderLeft: "4px solid #f43f5e" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#f43f5e", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 9 }}>
            Alertas nesta prescrição ({alertas.length})
          </div>
          {alertas.map((a, i) => (
            <div key={i} style={{ background: FARM_GRAV[a.gravidade].cor + "11", border: `1px solid ${FARM_GRAV[a.gravidade].cor}44`, borderLeft: `4px solid ${FARM_GRAV[a.gravidade].cor}`, borderRadius: 8, padding: "8px 12px", marginBottom: 7 }}>
              <span style={{ fontSize: 9.5, fontWeight: 800, color: FARM_GRAV[a.gravidade].cor, textTransform: "uppercase" }}>{FARM_GRAV[a.gravidade].label}</span>
              <strong style={{ fontSize: 13, marginLeft: 7 }}>{a.titulo}</strong>
              <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 3 }}>{a.detalhe}</div>
            </div>
          ))}
        </div>
      )}

      {/* ITENS EM MONTAGEM */}
      <div style={cartao}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>
          Itens ({itens.length})
        </div>
        {itens.length === 0
          ? <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nenhum item adicionado.</div>
          : itens.map((i, k) => (
              <div key={k} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                <strong style={{ fontSize: 13 }}>{i.descricao}</strong>
                <span style={{ fontSize: 12, color: "var(--text-3)" }}>{i.dose} · {i.via} · {i.frequencia}</span>
                {i.se_necessario && <span style={{ fontSize: 10, fontWeight: 800, color: "#d97706" }}>SOS</span>}
                <button onClick={() => setItens(p => p.filter((_, x) => x !== k))}
                  style={{ marginLeft: "auto", background: "none", border: "none", color: "#f43f5e", cursor: "pointer", fontSize: 16 }}>×</button>
              </div>
            ))}

        <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} placeholder="Observação da prescrição (opcional)"
          style={{ ...inp, marginTop: 10, resize: "vertical", fontFamily: "inherit" }} />

        <button onClick={assinar} disabled={!pode || !itens.length || salvando}
          style={{ width: "100%", marginTop: 10, background: pode && itens.length ? "linear-gradient(90deg, #2dd4bf, #38bdf8)" : "var(--bg-2)",
                   color: pode && itens.length ? "#062a35" : "var(--text-muted)", border: "none", borderRadius: 7,
                   padding: "11px", fontWeight: 800, fontSize: 13.5, cursor: pode && itens.length ? "pointer" : "not-allowed" }}>
          {salvando ? "Assinando…" : `Assinar prescrição${assinatura.registro_conselho ? ` — ${assinatura.conselho} ${assinatura.registro_conselho}` : ""}`}
        </button>
        <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 7 }}>
          Assinada como <strong>{assinatura.profissional_nome}</strong> com data/hora. Registro imutável —
          correção se faz por nova prescrição que substitui esta.
        </div>
      </div>
    </div>
  );
}
