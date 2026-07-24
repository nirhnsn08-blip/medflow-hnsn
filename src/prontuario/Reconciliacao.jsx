// ═══════════════════════════════════════════════════════════
// RECONCILIAÇÃO MEDICAMENTOSA — a tela
//
// Uma linha por medicamento envolvido na transição, e cada uma exige uma
// decisão explícita. A tela não permite "concluir" deixando linha em
// branco: o remédio de casa que ninguém avaliou é exatamente o caso que
// esta feature existe para impedir.
//
// O que ela deliberadamente NÃO faz: sugerir decisão. Um "manter" já
// marcado seria aceito no automático, e o sistema estaria decidindo
// tratamento por omissão de quem clica.
//
// A lógica está em ../clinico/reconciliacao.js (pura, testada). Aqui só
// há tela e o que se grava.
// ═══════════════════════════════════════════════════════════

import { useState, useMemo } from "react";
import {
  analisarReconciliacao, resumoReconciliacao, chaveMedicamento, freqPorDia,
  vigentesDeUso, situacaoUsoDomiciliar, DECISOES, MOMENTOS,
} from "../clinico/reconciliacao.js";
import { podeClinico, motivoDaRecusa, assinaturaDe } from "../clinico/papeis.js";
import { registrarMedicamentoUso, salvarReconciliacao } from "./dados.js";

const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
const lbl = { fontSize: 10.5, color: "var(--text-muted)", display: "block", marginBottom: 3 };
const cartao = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", marginBottom: 14 };
const rotulo = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 };

const dataHora = d => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Decisões oferecidas em cada momento. "Retomar após a alta" não faz
// sentido na admissão, e oferecer opção impossível é como treinar erro.
const OPCOES = {
  admissao: ["manter", "alterar", "substituir", "suspender"],
  alta:     ["manter", "alterar", "substituir", "suspender", "reiniciar", "novo"],
};

export default function Reconciliacao({
  sb, episodio, currentUser, momento = "admissao",
  medicamentosUso = [], hospitalares = [], reconciliacoes = [], reconciliacaoItens = [],
  onPronto,
}) {
  const [decisoes, setDecisoes] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [adicionando, setAdicionando] = useState(false);

  const pode = podeClinico(currentUser, "reconciliacao_medicamentosa");
  const assinatura = assinaturaDe(currentUser);

  // A última reconciliação assinada deste momento — para mostrar o que já
  // foi decidido em vez de começar do zero a cada abertura da aba.
  const anterior = useMemo(() => {
    const doMomento = reconciliacoes.filter(r => r.momento === momento);
    const substituidas = new Set(doMomento.map(r => r.substitui_id).filter(Boolean));
    return doMomento.filter(r => !substituidas.has(r.id))
      .sort((a, b) => new Date(b.concluida_em || b.criado_em) - new Date(a.concluida_em || a.criado_em))[0] || null;
  }, [reconciliacoes, momento]);

  // Decisões já assinadas + as que estão sendo tomadas agora na tela.
  const decisoesEfetivas = useMemo(() => {
    const base = {};
    for (const it of reconciliacaoItens.filter(i => anterior && i.reconciliacao_id === anterior.id)) {
      const c = chaveMedicamento(it);
      if (c && it.decisao) base[c] = { decisao: it.decisao, justificativa: it.justificativa };
    }
    return { ...base, ...decisoes };
  }, [reconciliacaoItens, anterior, decisoes]);

  const domiciliares = useMemo(() => vigentesDeUso(medicamentosUso), [medicamentosUso]);

  const linhas = useMemo(() => analisarReconciliacao({
    domiciliares, hospitalares, decisoes: decisoesEfetivas, momento,
  }), [domiciliares, hospitalares, decisoesEfetivas, momento]);

  const situacaoUso = situacaoUsoDomiciliar(medicamentosUso);
  // Lista vazia é entrevista não feita; a negativa explícita é entrevista
  // feita com resultado "não usa nada". Só a segunda permite concluir.
  const resumo = resumoReconciliacao(linhas, {
    usoDomiciliarLevantado: situacaoUso.estado !== "sem_registro",
  });
  const podeAssinar = resumo.completa;

  function decidir(chave, campo, valor) {
    setDecisoes(p => ({ ...p, [chave]: { ...(p[chave] || decisoesEfetivas[chave] || {}), [campo]: valor } }));
  }

  async function declararSemUso() {
    if (!confirm("Registrar que o paciente NÃO usa nenhum medicamento em casa? Isso fica assinado com seu nome — é informação clínica, não campo em branco.")) return;
    await registrarMedicamentoUso(sb, episodio.prontuario, episodio, {
      descricao: "Nega uso de medicamentos em casa", sem_uso: true, fonte: "paciente",
    }, currentUser);
    onPronto?.();
  }

  async function assinar() {
    if (!pode || !podeAssinar) return;
    if (!confirm(`Assinar a reconciliação de ${MOMENTOS[momento].label.toLowerCase()}? O registro é imutável — refazer cria uma nova, sem apagar esta.`)) return;
    setSalvando(true);
    await salvarReconciliacao(sb, episodio, {
      momento, linhas, substituiId: anterior?.id || null,
    }, currentUser);
    setSalvando(false); setDecisoes({}); onPronto?.();
  }

  return (
    <div>
      <div style={{ ...cartao, borderLeft: `4px solid ${resumo.completa ? "#34d399" : "#d97706"}` }}>
        <div style={{ display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap" }}>
          <strong style={{ fontSize: 14 }}>Reconciliação de {MOMENTOS[momento].label.toLowerCase()}</strong>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>{MOMENTOS[momento].explica}</span>
        </div>
        <div style={{ display: "flex", gap: 18, marginTop: 10, flexWrap: "wrap", fontSize: 12.5 }}>
          <Placar n={resumo.decididas} de={resumo.aDecidir} rotulo="decididos" cor="#34d399" />
          <Placar n={resumo.pendentes} rotulo="sem decisão" cor={resumo.pendentes ? "#f43f5e" : "var(--text-muted)"} />
          <Placar n={resumo.discrepancias} rotulo="com discrepância" cor={resumo.discrepancias ? "#d97706" : "var(--text-muted)"} />
        </div>
        {anterior && (
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 8 }}>
            Última assinada em {dataHora(anterior.concluida_em || anterior.criado_em)} por {anterior.profissional_nome || anterior.usuario}
            {anterior.registro_conselho ? ` · ${anterior.conselho} ${anterior.registro_conselho}` : ""}.
          </div>
        )}
      </div>

      {!pode && (
        <div style={{ ...cartao, background: "#d9770612", fontSize: 12.5, color: "#d97706" }}>
          {motivoDaRecusa(currentUser, "reconciliacao_medicamentosa")}
        </div>
      )}

      {/* LISTA DE USO DOMICILIAR */}
      <div style={cartao}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ ...rotulo, marginBottom: 0 }}>Uso domiciliar ({domiciliares.length})</div>
          {pode && (
            <button onClick={() => setAdicionando(a => !a)}
              style={{ marginLeft: "auto", background: "transparent", color: "#2dd4bf", border: "1px solid #2dd4bf66", borderRadius: 6, padding: "6px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              {adicionando ? "Fechar" : "+ Medicamento de casa"}
            </button>
          )}
        </div>
        {situacaoUso.estado === "nenhum" && (
          <div style={{ fontSize: 12.5, color: "#34d399", fontWeight: 600, marginTop: 8 }}>
            ✓ Paciente declarou não usar medicamento em casa.
          </div>
        )}
        {situacaoUso.estado === "sem_registro" && !adicionando && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12.5, color: "#d97706" }}>
              Ninguém registrou o uso domiciliar. Lista vazia <strong>não</strong> é o mesmo que
              "não toma nada" — pergunte ao paciente ou ao acompanhante.
            </div>
            {pode && (
              <button onClick={declararSemUso}
                style={{ marginTop: 8, background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                Perguntei — não usa nenhum medicamento
              </button>
            )}
          </div>
        )}
        {situacaoUso.estado === "com_lista" && (
          <div style={{ marginTop: 8 }}>
            {domiciliares.map(m => (
              <div key={m.id} style={{ fontSize: 12.5, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                <strong>{m.descricao}</strong>
                <span style={{ color: "var(--text-3)" }}> {[m.dose, m.via, m.frequencia, m.indicacao].filter(Boolean).join(" · ")}</span>
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}> — fonte: {m.fonte}</span>
              </div>
            ))}
          </div>
        )}
        {adicionando && (
          <NovoMedicamentoUso sb={sb} episodio={episodio} currentUser={currentUser}
            onPronto={() => { setAdicionando(false); onPronto?.(); }} />
        )}
      </div>

      {/* AS DECISÕES */}
      {linhas.length === 0
        ? <div style={{ ...cartao, fontSize: 12.5, color: "var(--text-muted)" }}>Nada a reconciliar ainda.</div>
        : linhas.map((l, k) => (
            <LinhaDecisao key={l.chave || k} linha={l} momento={momento} pode={pode}
              onDecidir={(campo, valor) => decidir(l.chave, campo, valor)} />
          ))}

      {pode && (
        <>
          <button onClick={assinar} disabled={!podeAssinar || salvando}
            style={{ width: "100%", marginTop: 6, background: podeAssinar ? "linear-gradient(90deg, #2dd4bf, #38bdf8)" : "var(--bg-2)",
                     color: podeAssinar ? "#062a35" : "var(--text-muted)", border: "none", borderRadius: 7,
                     padding: "11px", fontWeight: 800, fontSize: 13.5, cursor: podeAssinar ? "pointer" : "not-allowed" }}>
            {salvando ? "Assinando…" : `Assinar reconciliação de ${MOMENTOS[momento].label.toLowerCase()}`}
          </button>
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 7 }}>
            {podeAssinar
              ? <>Assinada como <strong>{assinatura.profissional_nome}</strong>{assinatura.registro_conselho ? ` · ${assinatura.conselho} ${assinatura.registro_conselho}` : ""}.</>
              : resumo.pendentes
                ? `Faltam ${resumo.pendentes} decisão(ões). Suspender é decisão; deixar em branco não é.`
                : "Levante o uso domiciliar antes de reconciliar — ou registre que o paciente não usa nenhum."}
          </div>
        </>
      )}
    </div>
  );
}

function Placar({ n, de, rotulo, cor }) {
  return (
    <span>
      <strong style={{ color: cor, fontSize: 15 }}>{n}{de != null ? `/${de}` : ""}</strong>
      <span style={{ color: "var(--text-3)" }}> {rotulo}</span>
    </span>
  );
}

function LinhaDecisao({ linha, momento, pode, onDecidir }) {
  const l = linha;
  const grave = l.discrepancias.some(d => d.gravidade === "alta");
  const base = l.item || {};
  const decisao = l.decisao || "";
  const exigeJust = DECISOES[decisao]?.exigeJustificativa;

  return (
    <div style={{ ...cartao, borderLeft: `4px solid ${grave ? "#f43f5e" : l.discrepancias.length ? "#d97706" : l.decisao ? "#34d399" : "var(--border)"}` }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <strong style={{ fontSize: 13.5 }}>{base.descricao || base.nome}</strong>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>
          {[base.dose, base.via, base.frequencia].filter(Boolean).join(" · ")}
        </span>
        <span style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em",
                       color: l.origem === "domiciliar" ? "#a78bfa" : "#38bdf8" }}>
          {l.origem === "domiciliar" ? "de casa" : "do hospital"}
        </span>
      </div>

      {l.hospitalar && (
        <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>
          No hospital: {[l.hospitalar.dose, l.hospitalar.via, l.hospitalar.frequencia].filter(Boolean).join(" · ") || "—"}
        </div>
      )}

      {l.discrepancias.map((d, i) => (
        <div key={i} style={{ fontSize: 12, marginTop: 6, color: d.gravidade === "alta" ? "#f43f5e" : "#d97706", fontWeight: 600 }}>
          ⚠ {d.label}{d.de != null ? `: ${d.de} → ${d.para}` : ""}
        </div>
      ))}

      {pode && l.exigeDecisao && (
        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 8, marginTop: 10 }}>
          <div>
            <label style={lbl}>Decisão</label>
            <select value={decisao} onChange={e => onDecidir("decisao", e.target.value)} style={inp}>
              <option value="">Escolha…</option>
              {OPCOES[momento].map(k => <option key={k} value={k}>{DECISOES[k].label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Justificativa{exigeJust ? " *" : " (opcional)"}</label>
            <input value={l.justificativa || ""} onChange={e => onDecidir("justificativa", e.target.value)}
              placeholder={exigeJust ? "Por que está sendo mudado?" : ""} style={inp} />
          </div>
        </div>
      )}
      {!l.exigeDecisao && (
        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 6 }}>
          Iniciado nesta internação — prescrever já foi a decisão.
        </div>
      )}
    </div>
  );
}

// ── NOVO MEDICAMENTO DE USO DOMICILIAR ──────────────────────
const FONTES = [
  ["paciente", "Relato do paciente"], ["familiar", "Relato de familiar"],
  ["receita", "Receita apresentada"], ["farmacia", "Farmácia / dispensação"],
  ["prontuario", "Prontuário anterior"], ["outro", "Outra fonte"],
];

function NovoMedicamentoUso({ sb, episodio, currentUser, onPronto }) {
  const [f, setF] = useState({ descricao: "", substancia: "", dose_valor: "", dose_unidade: "mg", via: "VO", frequencia: "", indicacao: "", fonte: "paciente" });
  const [salvando, setSalvando] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function salvar() {
    if (!f.descricao.trim()) return;
    setSalvando(true);
    await registrarMedicamentoUso(sb, episodio.prontuario, episodio, {
      descricao: f.descricao.trim(),
      substancia: f.substancia.trim() || null,
      dose: f.dose_valor ? `${f.dose_valor} ${f.dose_unidade}` : null,
      dose_valor: f.dose_valor ? Number(f.dose_valor) : null,
      dose_unidade: f.dose_valor ? f.dose_unidade : null,
      via: f.via || null,
      frequencia: f.frequencia || null,
      frequencia_dia: freqPorDia(f.frequencia),
      indicacao: f.indicacao || null,
      fonte: f.fonte,
    }, currentUser);
    setSalvando(false); onPronto?.();
  }

  return (
    <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, alignItems: "end" }}>
      <div style={{ gridColumn: "span 2" }}>
        <label style={lbl}>Como o paciente chama *</label>
        <input value={f.descricao} onChange={e => set("descricao", e.target.value)} placeholder="Ex.: Selozok" style={inp} />
      </div>
      <div>
        <label style={lbl}>Princípio ativo</label>
        <input value={f.substancia} onChange={e => set("substancia", e.target.value)} placeholder="metoprolol" style={inp} />
      </div>
      <div><label style={lbl}>Dose</label>
        <input type="number" step="any" value={f.dose_valor} onChange={e => set("dose_valor", e.target.value)} style={inp} /></div>
      <div><label style={lbl}>Unidade</label>
        <input value={f.dose_unidade} onChange={e => set("dose_unidade", e.target.value)} style={inp} /></div>
      <div><label style={lbl}>Via</label>
        <input value={f.via} onChange={e => set("via", e.target.value)} style={inp} /></div>
      <div><label style={lbl}>Frequência</label>
        <input value={f.frequencia} onChange={e => set("frequencia", e.target.value)} placeholder="1x/dia, 12/12h" style={inp} /></div>
      <div><label style={lbl}>Para quê</label>
        <input value={f.indicacao} onChange={e => set("indicacao", e.target.value)} placeholder="pressão, diabetes" style={inp} /></div>
      <div style={{ gridColumn: "span 2" }}>
        <label style={lbl}>Fonte da informação</label>
        <select value={f.fonte} onChange={e => set("fonte", e.target.value)} style={inp}>
          {FONTES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
      </div>
      <button onClick={salvar} disabled={salvando || !f.descricao.trim()}
        style={{ background: "#2dd4bf22", color: "#2dd4bf", border: "1px solid #2dd4bf66", borderRadius: 6, padding: "9px 14px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
        {salvando ? "Salvando…" : "Adicionar"}
      </button>
    </div>
  );
}
