// ═══════════════════════════════════════════════════════════
// ANAMNESE / ADMISSÃO
//
// Estruturada em campos, não um textarea único. O motivo não é estética:
// texto corrido não vira indicador, não alimenta alerta e não se compara
// entre admissões. Queixa e história ficam livres (é onde a narrativa
// clínica mora); o resto vira campo.
//
// Multiprofissional: médico faz anamnese; enfermeiro faz a Avaliação de
// Enfermagem, primeira etapa do Processo de Enfermagem (COFEN 736/2024 —
// que aposentou os termos "SAE" e "Histórico de Enfermagem").
// São documentos diferentes, no mesmo lugar: muda a `categoria`.
// ═══════════════════════════════════════════════════════════

import { useState } from "react";
import { podeClinico, motivoDaRecusa, assinaturaDe, categoriaDe } from "../clinico/papeis.js";
import { registrarAnamnese } from "./dados.js";

// Categoria profissional de quem registra → `pep_anamneses.categoria`.
// São vocabulários distintos: `medico` é a pessoa, `medica` é a natureza do
// documento. Onde não há correspondência, cai em "medica" só se for médico;
// o resto assume a própria área.
const CATEGORIA_DO_DOC = {
  medico: "medica", enfermeiro: "enfermagem", fisioterapeuta: "fisioterapia",
  nutricionista: "nutricao", assistente_social: "servico_social", farmaceutico: "farmacia",
};

// Como cada documento se chama na tela. "Avaliação de Enfermagem" e não
// "Histórico de Enfermagem": a COFEN 736/2024 substituiu o termo (e extinguiu
// "SAE"). Registro com vocabulário revogado envelhece mal em auditoria.
const ROTULO_DOC = {
  medica: "Anamnese médica", enfermagem: "Avaliação de Enfermagem",
  fisioterapia: "Avaliação de fisioterapia", nutricao: "Avaliação nutricional",
  servico_social: "Avaliação do serviço social", farmacia: "Avaliação farmacêutica",
};

const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
const lbl = { fontSize: 10.5, color: "var(--text-muted)", display: "block", marginBottom: 3 };
const cartao = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", marginBottom: 14 };
const sec = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", margin: "14px 0 8px" };

// Sistemas do exame físico. A lista é curta de propósito: exame físico
// completo em 12 sistemas não é preenchido na prática, e campo em branco
// gera a mesma falsa impressão de "avaliado e normal".
const SISTEMAS = [
  ["geral", "Estado geral"], ["cardio", "Cardiovascular"], ["resp", "Respiratório"],
  ["abd", "Abdome"], ["neuro", "Neurológico"], ["pele", "Pele e mucosas"],
];

export default function Anamnese({ sb, episodio, currentUser, anamneses = [], onPronto }) {
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({ queixa: "", historia: "", antecedentes: "", medicacoes_uso: "", habitos: "", exame: {} });
  const [salvando, setSalvando] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const setSis = (k, v) => setF(p => ({ ...p, exame: { ...p.exame, [k]: v } }));

  const cat = categoriaDe(currentUser);
  const pode = podeClinico(currentUser, "admissao_anamnese");
  const assinatura = assinaturaDe(currentUser);
  const categoriaDoc = CATEGORIA_DO_DOC[cat] || "medica";
  const titulo = cat === "enfermeiro" ? "Avaliação de Enfermagem" : "Anamnese e exame físico";

  async function salvar() {
    if (!f.queixa.trim()) return;
    if (!confirm("O registro é assinado com data/hora e NÃO pode ser editado nem apagado. Confirma?")) return;
    setSalvando(true);
    await registrarAnamnese(sb, episodio, {
      categoria: categoriaDoc,
      queixa_principal: f.queixa.trim(),
      historia_doenca_atual: f.historia,
      antecedentes_pessoais: f.antecedentes,
      medicamentos_em_uso: f.medicacoes_uso,
      habitos: f.habitos,
      // `sistemas` é `not null default '{}'` — mandar null quebraria o INSERT
      sistemas: f.exame,
    }, currentUser);
    setSalvando(false); setEditando(false);
    setF({ queixa: "", historia: "", antecedentes: "", medicacoes_uso: "", habitos: "", exame: {} });
    onPronto?.();
  }

  return (
    <div>
      {anamneses.length > 0 && anamneses.map(a => (
        <div key={a.id} style={cartao}>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", marginBottom: 8 }}>
            <strong style={{ fontSize: 13.5 }}>{ROTULO_DOC[a.categoria] || "Anamnese médica"}</strong>
            <span style={{ fontSize: 11.5, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>
              {new Date(a.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              {" · "}{a.profissional_nome}
              {a.registro_conselho ? ` · ${a.conselho} ${a.registro_conselho}` : ""}
            </span>
          </div>
          {a.queixa_principal && <Campo t="Queixa principal" v={a.queixa_principal} />}
          {a.historia_doenca_atual && <Campo t="História da doença atual" v={a.historia_doenca_atual} />}
          {a.antecedentes_pessoais && <Campo t="Antecedentes" v={a.antecedentes_pessoais} />}
          {a.medicamentos_em_uso && <Campo t="Medicações em uso" v={a.medicamentos_em_uso} />}
          {a.habitos && <Campo t="Hábitos" v={a.habitos} />}
          {a.sistemas && Object.keys(a.sistemas).length > 0 && (
            <>
              <div style={sec}>Exame físico</div>
              {Object.entries(a.sistemas).map(([k, v]) => v ? (
                <Campo key={k} t={(SISTEMAS.find(s => s[0] === k) || [k, k])[1]} v={v} />
              ) : null)}
            </>
          )}
        </div>
      ))}

      {!editando && pode && (
        <button onClick={() => setEditando(true)}
          style={{ background: "#2dd4bf22", color: "#2dd4bf", border: "1px solid #2dd4bf66", borderRadius: 7, padding: "10px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          + {titulo}
        </button>
      )}
      {!editando && !pode && anamneses.length === 0 && (
        <div style={{ ...cartao, fontSize: 12.5, color: "var(--text-muted)" }}>
          Nenhuma admissão registrada. {motivoDaRecusa(currentUser, "admissao_anamnese")}
        </div>
      )}

      {editando && (
        <div style={cartao}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12 }}>{titulo}</div>
          <div style={sec}>Anamnese</div>
          <div><label style={lbl}>Queixa principal *</label>
            <input value={f.queixa} onChange={e => set("queixa", e.target.value)} style={inp} /></div>
          <div style={{ marginTop: 8 }}><label style={lbl}>História da doença atual</label>
            <textarea value={f.historia} onChange={e => set("historia", e.target.value)} rows={3} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            <div><label style={lbl}>Antecedentes</label>
              <textarea value={f.antecedentes} onChange={e => set("antecedentes", e.target.value)} rows={2} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} /></div>
            <div><label style={lbl}>Medicações em uso</label>
              <textarea value={f.medicacoes_uso} onChange={e => set("medicacoes_uso", e.target.value)} rows={2} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} /></div>
          </div>
          <div style={{ marginTop: 8 }}><label style={lbl}>Hábitos (tabagismo, etilismo, atividade física)</label>
            <input value={f.habitos} onChange={e => set("habitos", e.target.value)} style={inp} /></div>

          <div style={sec}>Exame físico</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
            {SISTEMAS.map(([k, t]) => (
              <div key={k}><label style={lbl}>{t}</label>
                <input value={f.exame[k] || ""} onChange={e => setSis(k, e.target.value)} style={inp} /></div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={salvar} disabled={salvando || !f.queixa.trim()}
              style={{ background: f.queixa.trim() ? "linear-gradient(90deg, #2dd4bf, #38bdf8)" : "var(--bg-2)",
                       color: f.queixa.trim() ? "#062a35" : "var(--text-muted)", border: "none", borderRadius: 7,
                       padding: "10px 20px", fontWeight: 800, fontSize: 13, cursor: f.queixa.trim() ? "pointer" : "not-allowed" }}>
              {salvando ? "Salvando…" : "Assinar e salvar"}
            </button>
            <button onClick={() => setEditando(false)}
              style={{ background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 7, padding: "10px 18px", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 8 }}>
            Assinado como <strong>{assinatura.profissional_nome}</strong>
            {assinatura.registro_conselho ? ` · ${assinatura.conselho} ${assinatura.registro_conselho}` : " · sem registro de conselho no cadastro"}.
          </div>
        </div>
      )}
    </div>
  );
}

function Campo({ t, v }) {
  return (
    <div style={{ marginBottom: 7 }}>
      <div style={{ fontSize: 10.5, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>{t}</div>
      <div style={{ fontSize: 13, color: "var(--text-2)", whiteSpace: "pre-wrap" }}>{v}</div>
    </div>
  );
}
