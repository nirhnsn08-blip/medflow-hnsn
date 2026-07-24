// ═══════════════════════════════════════════════════════════
// ALTA HOSPITALAR — sumário de alta e fechamento do episódio
//
// A tela existe para impedir três coisas que acontecem na prática:
//   • paciente sair sem sumário nenhum ("depois eu escrevo");
//   • sumário sem a lista de medicamentos que ele deve tomar em casa;
//   • leito continuar ocupado no sistema porque ninguém encerrou o episódio.
//
// A ordem de gravação é sumário → episódio, e não o contrário. Se a
// segunda parte falhar, existe um documento e um leito ocupado — situação
// visível e corrigível. Na ordem inversa, o paciente teria alta registrada
// sem sumário, que é exatamente o buraco que esta tela veio fechar.
//
// A lógica está em ../clinico/alta.js (pura, testada).
// ═══════════════════════════════════════════════════════════

import { useState, useMemo } from "react";
import {
  DESFECHOS, montarRascunhoAlta, conferirSumario, podeAssinarSumario, textoSumario,
} from "../clinico/alta.js";
import {
  analisarReconciliacao, resumoReconciliacao, listaDeAlta, suspensosNaAlta,
  vigentesDeUso, situacaoUsoDomiciliar, chaveMedicamento,
} from "../clinico/reconciliacao.js";
import { itensAtivos, prescricaoVigente } from "../clinico/prontuario.js";
import { podeClinico, motivoDaRecusa, assinaturaDe } from "../clinico/papeis.js";
import { emitirSumarioAlta, encerrarEpisodio } from "./dados.js";

const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
const lbl = { fontSize: 10.5, color: "var(--text-muted)", display: "block", marginBottom: 3 };
const cartao = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", marginBottom: 14 };
const rotulo = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 };

const CAMPOS_TEXTO = [
  ["diagnostico_principal", "Diagnóstico de alta *", 1, "O diagnóstico ao SAIR, que costuma ser diferente do da entrada"],
  ["resumo_internacao", "Resumo da internação *", 4, "O que aconteceu aqui: o que foi feito, como evoluiu"],
  ["procedimentos", "Procedimentos realizados", 2, ""],
  ["exames_relevantes", "Exames relevantes e resultados", 2, ""],
  ["condicao_alta", "Condição na alta", 2, "Como o paciente está saindo"],
  ["orientacoes", "Orientações ao paciente *", 3, "O que ele leva como instrução para casa"],
  ["sinais_de_alerta", "Sinais de alerta — quando voltar", 2, "É o campo que evita a reinternação tardia"],
];

export default function AltaHospitalar({ sb, d, episodio, currentUser, paciente, hospital, onPronto }) {
  const rascunho = useMemo(() => montarRascunhoAlta({
    episodio,
    anamneses: d.anamneses, evolucoes: d.evolucoes, prescricoes: d.prescricoes,
    itens: d.itens, eventos: d.eventos, sinais: d.sinais, administracoes: d.administracoes,
  }), [d, episodio]);

  const [f, setF] = useState(rascunho || {});
  const [salvando, setSalvando] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const pode = podeClinico(currentUser, "alta_hospitalar");
  const assinatura = assinaturaDe(currentUser);

  // ── reconciliação de alta: o que o paciente leva e o que para ──
  const presc = prescricaoVigente(d.prescricoes);
  const hospitalares = presc ? itensAtivos(d.itens.filter(i => i.prescricao_id === presc.id), d.eventos) : [];
  const recAlta = useMemo(() => {
    const doMomento = (d.reconciliacoes || []).filter(r => r.momento === "alta");
    const substituidas = new Set(doMomento.map(r => r.substitui_id).filter(Boolean));
    return doMomento.filter(r => !substituidas.has(r.id))
      .sort((a, b) => new Date(b.concluida_em || b.criado_em) - new Date(a.concluida_em || a.criado_em))[0] || null;
  }, [d.reconciliacoes]);

  const linhas = useMemo(() => {
    const decisoes = {};
    for (const it of (d.reconciliacaoItens || []).filter(i => recAlta && i.reconciliacao_id === recAlta.id)) {
      const c = chaveMedicamento(it);
      if (c && it.decisao) decisoes[c] = { decisao: it.decisao, justificativa: it.justificativa };
    }
    return analisarReconciliacao({
      domiciliares: vigentesDeUso(d.medicamentosUso), hospitalares, decisoes, momento: "alta",
    });
  }, [d.medicamentosUso, d.reconciliacaoItens, recAlta, hospitalares]);

  const resumoRec = resumoReconciliacao(linhas, {
    usoDomiciliarLevantado: situacaoUsoDomiciliar(d.medicamentosUso).estado !== "sem_registro",
  });
  const medicamentos = listaDeAlta(linhas);
  const suspensos = suspensosNaAlta(linhas);

  const faltas = conferirSumario(f, { reconciliacao: resumoRec });
  const podeAssinar = pode && podeAssinarSumario(faltas);

  const texto = useMemo(() => textoSumario(f, {
    hospital, paciente, assinante: assinatura, medicamentos, suspensos,
  }), [f, hospital, paciente, assinatura, medicamentos, suspensos]);

  // ── sumário já emitido ──
  const emitido = useMemo(() => {
    const subs = new Set((d.sumarios || []).map(s => s.substitui_id).filter(Boolean));
    return (d.sumarios || []).filter(s => !subs.has(s.id))[0] || null;
  }, [d.sumarios]);

  async function assinarEDarAlta() {
    if (!podeAssinar) return;
    const rotuloDesfecho = DESFECHOS[f.desfecho]?.label || f.desfecho;
    if (!confirm(
      `Assinar o sumário e encerrar a internação como "${rotuloDesfecho}"?\n\n` +
      `O documento é imutável — retificar exige emitir um novo. ` +
      `O leito ${episodio.leito || ""} sai de ocupado no sistema.`)) return;

    setSalvando(true);
    // Sumário primeiro. Se o encerramento falhar, o documento existe.
    await emitirSumarioAlta(sb, episodio, f,
      { medicamentos, suspensos, texto, reconciliacaoId: recAlta?.id || null }, currentUser);
    await encerrarEpisodio(sb, episodio, {
      desfecho: f.desfecho, desfecho_detalhe: f.desfecho_detalhe, alta_em: f.alta_em,
    }, currentUser);
    setSalvando(false);
    onPronto?.();
  }

  if (emitido) return <SumarioEmitido s={emitido} />;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 14, alignItems: "start" }}>
      <div>
        {!pode && (
          <div style={{ ...cartao, background: "#d9770612", fontSize: 12.5, color: "#d97706" }}>
            {motivoDaRecusa(currentUser, "alta_hospitalar")} O sumário pode ser preenchido, mas quem assina a alta é o médico.
          </div>
        )}

        <div style={cartao}>
          <div style={rotulo}>Desfecho da internação</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label style={lbl}>Desfecho *</label>
              <select value={f.desfecho || ""} onChange={e => set("desfecho", e.target.value)} style={inp}>
                <option value="">Escolha…</option>
                {Object.entries(DESFECHOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Detalhe (opcional)</label>
              <input value={f.desfecho_detalhe || ""} onChange={e => set("desfecho_detalhe", e.target.value)} style={inp} />
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 8 }}>
            Internado em {f.admissao_em ? new Date(f.admissao_em).toLocaleString("pt-BR") : "—"} ·
            {" "}{f.dias_internacao ?? "—"} dia(s) · {f.contexto?.evolucoes ?? 0} evolução(ões) ·
            {" "}{f.contexto?.administracoes ?? 0} administração(ões) registradas.
          </div>
        </div>

        <div style={cartao}>
          <div style={rotulo}>Sumário de alta</div>
          {f.referencia && (f.referencia.hipotese_admissao || f.referencia.cid_entrada) && (
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10 }}>
              Na entrada: {[f.referencia.cid_entrada && `CID ${f.referencia.cid_entrada}`,
                            f.referencia.hipotese_admissao].filter(Boolean).join(" · ")}.
              O diagnóstico de alta pode ser outro — é essa diferença que interessa a quem atender depois.
            </div>
          )}
          {CAMPOS_TEXTO.map(([k, t, linhasN, dica]) => (
            <div key={k} style={{ marginBottom: 10 }}>
              <label style={lbl}>{t}{dica ? ` — ${dica}` : ""}</label>
              {linhasN === 1
                ? <input value={f[k] || ""} onChange={e => set(k, e.target.value)} style={inp} />
                : <textarea value={f[k] || ""} onChange={e => set(k, e.target.value)} rows={linhasN}
                    style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} />}
            </div>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 8 }}>
            <div><label style={lbl}>Retorno em</label>
              <input type="date" value={f.retorno_em || ""} onChange={e => set("retorno_em", e.target.value || null)} style={inp} /></div>
            <div><label style={lbl}>Serviço de seguimento</label>
              <input value={f.retorno_servico || ""} onChange={e => set("retorno_servico", e.target.value)}
                placeholder="UBS, ambulatório, especialidade…" style={inp} /></div>
          </div>
        </div>

        <div style={cartao}>
          <div style={rotulo}>Como o documento vai sair</div>
          <pre style={{ fontSize: 11.5, fontFamily: "JetBrains Mono, monospace", whiteSpace: "pre-wrap",
                        color: "var(--text-2)", margin: 0, maxHeight: 320, overflow: "auto" }}>{texto}</pre>
          <button onClick={() => imprimir(texto)}
            style={{ marginTop: 10, background: "transparent", color: "#38bdf8", border: "1px solid #38bdf866", borderRadius: 6, padding: "7px 14px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
            Imprimir prévia
          </button>
        </div>
      </div>

      {/* PAINEL DE CONFERÊNCIA */}
      <div style={{ position: "sticky", top: 10 }}>
        <div style={{ ...cartao, borderLeft: `4px solid ${podeAssinar ? "#34d399" : "#f43f5e"}` }}>
          <div style={rotulo}>Conferência</div>
          {faltas.length === 0
            ? <div style={{ fontSize: 12.5, color: "#34d399", fontWeight: 700 }}>✓ Nada pendente.</div>
            : faltas.map((x, i) => (
                <div key={i} style={{ fontSize: 12.2, marginBottom: 7, color: x.nivel === "impede" ? "#f43f5e" : "#d97706" }}>
                  <strong>{x.nivel === "impede" ? "Impede" : "Atenção"}:</strong> {x.texto}
                </div>
              ))}
        </div>

        <div style={cartao}>
          <div style={rotulo}>Medicamentos na alta</div>
          {medicamentos.length === 0
            ? <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                Nenhum definido. Faça a reconciliação de alta na aba <strong>Reconciliação</strong>.
              </div>
            : medicamentos.map((m, i) => (
                <div key={i} style={{ fontSize: 12.5, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                  <strong>{m.descricao}</strong>
                  <span style={{ color: "var(--text-3)" }}> {[m.dose, m.via, m.frequencia].filter(Boolean).join(" · ")}</span>
                </div>
              ))}
          {suspensos.length > 0 && (
            <>
              <div style={{ ...rotulo, color: "#f43f5e", marginTop: 12 }}>Suspensos — não tomar mais</div>
              {suspensos.map((m, i) => (
                <div key={i} style={{ fontSize: 12.5, padding: "3px 0" }}>
                  {m.descricao}{m.motivo ? <span style={{ color: "var(--text-3)" }}> — {m.motivo}</span> : null}
                </div>
              ))}
            </>
          )}
        </div>

        {pode && (
          <>
            <button onClick={assinarEDarAlta} disabled={!podeAssinar || salvando}
              style={{ width: "100%", background: podeAssinar ? "linear-gradient(90deg, #2dd4bf, #38bdf8)" : "var(--bg-2)",
                       color: podeAssinar ? "#062a35" : "var(--text-muted)", border: "none", borderRadius: 7,
                       padding: "12px", fontWeight: 800, fontSize: 13.5, cursor: podeAssinar ? "pointer" : "not-allowed" }}>
              {salvando ? "Assinando…" : "Assinar sumário e dar alta"}
            </button>
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 7 }}>
              Assinado como <strong>{assinatura.profissional_nome}</strong>
              {assinatura.registro_conselho ? ` · ${assinatura.conselho} ${assinatura.registro_conselho}` : " · sem registro de conselho no cadastro"}.
              Documento imutável — retificar exige emitir um novo.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── SUMÁRIO JÁ EMITIDO ──────────────────────────────────────
function SumarioEmitido({ s }) {
  return (
    <div style={{ ...cartao, borderLeft: "4px solid #34d399" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", marginBottom: 10 }}>
        <strong style={{ fontSize: 14 }}>Sumário de alta emitido</strong>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>
          {DESFECHOS[s.desfecho]?.label || s.desfecho} · {new Date(s.alta_em).toLocaleString("pt-BR")} ·
          {" "}{s.profissional_nome}{s.registro_conselho ? ` · ${s.conselho} ${s.registro_conselho}` : ""}
        </span>
        <button onClick={() => imprimir(s.texto_impressao || "")}
          style={{ marginLeft: "auto", background: "transparent", color: "#38bdf8", border: "1px solid #38bdf866", borderRadius: 6, padding: "7px 14px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
          Imprimir / 2ª via
        </button>
      </div>
      <pre style={{ fontSize: 11.5, fontFamily: "JetBrains Mono, monospace", whiteSpace: "pre-wrap", color: "var(--text-2)", margin: 0 }}>
        {s.texto_impressao || "(sem via impressa gravada)"}
      </pre>
    </div>
  );
}

/**
 * Abre a via impressa numa janela própria.
 * Texto puro em <pre>, sem CSS do sistema: o que é assinado à mão precisa
 * sair igual em qualquer impressora, e tema escuro não imprime.
 */
function imprimir(texto) {
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) return alert("O navegador bloqueou a janela de impressão. Libere o pop-up e tente de novo.");
  w.document.write(
    `<html><head><title>Sumário de alta</title></head>` +
    `<body style="font-family: monospace; font-size: 12px; white-space: pre-wrap; padding: 24px; color:#000; background:#fff">` +
    texto.replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c])) +
    `</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}
