// ═══════════════════════════════════════════════════════════
// A DESCRIÇÃO CIRÚRGICA — a tela
//
// Em arquivo próprio, e não dentro do `BlocoPage.jsx`: aquele arquivo tem
// mais de mil linhas e quebrá-lo é PR por si. Componente novo entra fora.
//
// 🔴 O QUE ESTA TELA PRECISA FAZER DIFERENTE DE UM FORMULÁRIO QUALQUER:
//
//   1. Mostrar o PROCEDIMENTO AGENDADO ao lado do campo do realizado. O
//      cirurgião que converteu a via precisa ver o que estava marcado para
//      perceber que mudou — sem isso, o padrão é repetir o agendamento.
//   2. Dizer, no próprio formulário, que o código do realizado é o que a
//      conta vai cobrar. A consequência financeira some se a tela não a
//      disser: o campo parece documentação.
//   3. CORREÇÃO É VERSÃO NOVA, com motivo, e o histórico fica visível. A
//      tela não oferece "editar" porque o banco não tem UPDATE — oferecer
//      seria prometer o que não existe.
// ═══════════════════════════════════════════════════════════

import { useState } from "react";
import { btnContorno, campoTexto, rotuloCampo } from "../ui/base.jsx";
import { fmtDataBR } from "../util/datas.js";
import {
  MIN_NARRATIVA, VIAS_ACESSO, VIA_LABEL,
  conferirDescricao, historico, linhaDaDescricao, versaoVigente,
} from "./descricao.js";

/** Tri-estado: não respondeu × sim × não. `null` não é "não". */
function TresEstados({ rotulo, valor, onChange, obrigatorio = false }) {
  const bt = (v, txt, cor) => (
    <button type="button" onClick={() => onChange(valor === v ? null : v)}
      style={{ ...btnContorno(valor === v ? cor : "var(--text-3)"),
               fontWeight: valor === v ? 700 : 500,
               background: valor === v ? cor + "18" : "transparent" }}>{txt}</button>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 12.5, color: "var(--text-2)" }}>
        {rotulo}{obrigatorio && <span style={{ color: "#f43f5e" }}> *</span>}
      </span>
      {bt(true, "Sim", "#34d399")}
      {bt(false, "Não", "#f43f5e")}
      {valor == null && <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>sem resposta</span>}
    </div>
  );
}

export default function DescricaoCirurgicaModal({
  cirurgia, descricoes = [], procedimentos = [], assinatura = null, onClose, onConfirm,
}) {
  const vigente = versaoVigente(descricoes);
  // `undefined` = leu e não há; `null` = NÃO CONSEGUIU LER. A diferença
  // decide se a tela oferece registrar ou pede para recarregar.
  const naoLi = vigente === null;
  const corrigindo = vigente || null;

  const [form, setForm] = useState(() => ({
    // Na correção, parte da versão vigente: quem corrige mexe num campo e
    // não redigita o documento. Numa nova, parte do agendamento só no NOME —
    // o código fica em branco de propósito, para a escolha ser consciente.
    procedimento_realizado: corrigindo?.procedimento_realizado || cirurgia?.procedimento || "",
    procedimento_cod: corrigindo?.procedimento_cod || "",
    via_acesso: corrigindo?.via_acesso || "",
    conversao: !!corrigindo?.conversao,
    conversao_motivo: corrigindo?.conversao_motivo || "",
    achados: corrigindo?.achados || "",
    descricao: corrigindo?.descricao || "",
    intercorrencias: corrigindo?.intercorrencias || "",
    cid_pos: corrigindo?.cid_pos || "",
    sangramento_ml: corrigindo?.sangramento_ml ?? "",
    hemotransfusao: corrigindo?.hemotransfusao ?? null,
    drenos: corrigindo?.drenos || "",
    amostras: corrigindo?.amostras || "",
    amostra_enviada: corrigindo?.amostra_enviada ?? null,
    motivo_correcao: "",
  }));
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);
  const [verHistorico, setVerHistorico] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const v = conferirDescricao({ cirurgia, form, corrigindo });
  const todas = historico(descricoes);

  async function salvar() {
    if (!v.ok) { setErro(v.erros.join(" ")); return; }
    setBusy(true); setErro(null);
    const r = await onConfirm(linhaDaDescricao({ cirurgia, form, corrigindo, assinatura }));
    setBusy(false);
    if (r?.ok) { onClose(); return; }
    setErro(r?.motivo || "Nada foi gravado.");
  }

  const area = { ...campoTexto, minHeight: 72, resize: "vertical", lineHeight: 1.55, fontFamily: "Inter, sans-serif" };
  const bloco = { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "11px 13px", marginBottom: 12 };
  const codAgendado = String(cirurgia?.procedimento_cod || "").trim();
  const codDigitado = String(form.procedimento_cod || "").trim();

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 700, maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto" }}>

        <div style={{ fontSize: 16, fontWeight: 700 }}>
          Descrição cirúrgica{corrigindo ? <span style={{ color: "#d97706" }}> — CORREÇÃO da versão {corrigindo.versao}</span> : null}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
          Paciente {cirurgia?.iniciais} · Cirurgia #{cirurgia?.id} · agendada: {cirurgia?.procedimento || "—"}
          {codAgendado ? ` · ${codAgendado}` : " · sem código"}
        </div>

        {naoLi && (
          <div style={{ ...bloco, background: "#f43f5e12", borderColor: "#f43f5e55", color: "#f43f5e", fontSize: 12.5, lineHeight: 1.55 }}>
            Não consegui ler as descrições desta cirurgia. Ela pode JÁ TER uma — gravar agora seria
            recusado pelo banco depois de você escrever tudo. Recarregue antes de seguir.
          </div>
        )}

        {/* 🔴 O prontuário não se rasura. A tela diz isso ANTES, para a
            pessoa não procurar um botão de editar que não existe. */}
        <div style={{ ...bloco, fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.55 }}>
          Documento exigido pela CFM 1.638/2002. <strong>Registro imutável</strong>: não há edição nem
          exclusão — correção é versão nova, com o motivo. {todas.length > 0 && (
            <button type="button" onClick={() => setVerHistorico(h => !h)}
              style={{ ...btnContorno("var(--text-3)"), marginLeft: 6, fontSize: 11 }}>
              {verHistorico ? "Esconder" : `Ver as ${todas.length} versão(ões)`}
            </button>
          )}
        </div>

        {verHistorico && (
          <div style={bloco}>
            {todas.map(d => (
              <div key={d.id} style={{ borderLeft: `2px solid ${d.id === vigente?.id ? "#34d399" : "var(--border-2)"}`, paddingLeft: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: d.id === vigente?.id ? "#34d399" : "var(--text-3)" }}>
                  Versão {d.versao}{d.id === vigente?.id ? " — vigente" : " — corrigida"} · {d.usuario || "?"}
                  {d.criado_em ? ` · ${fmtDataBR(d.criado_em)}` : ""}
                </div>
                {d.motivo_correcao && <div style={{ fontSize: 11.5, color: "#d97706" }}>Motivo da correção: {d.motivo_correcao}</div>}
                <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5 }}>
                  {d.procedimento_realizado}{d.via_acesso ? ` · ${VIA_LABEL[d.via_acesso] || d.via_acesso}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── O QUE FOI FEITO ───────────────────────────────── */}
        <div style={bloco}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>
            O que foi realizado
          </div>

          <label style={rotuloCampo}>Procedimento realizado *</label>
          <input value={form.procedimento_realizado} onChange={e => set("procedimento_realizado", e.target.value)}
            placeholder="o ato que aconteceu, não o que estava marcado" style={{ ...campoTexto, marginBottom: 10 }} />

          <label style={rotuloCampo}>Código do realizado — é ESTE que a conta cobra</label>
          <select value={form.procedimento_cod} onChange={e => {
            const cod = e.target.value;
            const p = procedimentos.find(x => String(x.codigo) === String(cod));
            // Escolher o código preenche o nome quando ele ainda é o do
            // agendamento — e NÃO sobrescreve o que a pessoa já escreveu.
            setForm(f => ({
              ...f, procedimento_cod: cod,
              procedimento_realizado: (!f.procedimento_realizado || f.procedimento_realizado === cirurgia?.procedimento)
                ? (p?.nome || f.procedimento_realizado) : f.procedimento_realizado,
            }));
          }} style={{ ...campoTexto, marginBottom: 6 }}>
            <option value="">— sem código (a conta usará o do agendamento) —</option>
            {procedimentos.map(p => (
              <option key={p.codigo} value={p.codigo}>{p.codigo} — {p.nome}</option>
            ))}
          </select>
          {codDigitado && codAgendado && codDigitado !== codAgendado && (
            <div style={{ fontSize: 11.5, color: "#d97706", lineHeight: 1.5, marginBottom: 6 }}>
              Diferente do agendado ({codAgendado}). A conta passará a cobrar o <strong>realizado</strong> — é o ato que aconteceu.
            </div>
          )}

          <label style={rotuloCampo}>Via de acesso</label>
          <select value={form.via_acesso} onChange={e => set("via_acesso", e.target.value)} style={{ ...campoTexto, marginBottom: 10 }}>
            <option value="">— não informada —</option>
            {VIAS_ACESSO.map(x => <option key={x.chave} value={x.chave}>{x.label}</option>)}
          </select>

          <label style={{ display: "flex", gap: 9, alignItems: "flex-start", cursor: "pointer", fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>
            <input type="checkbox" checked={form.conversao} onChange={e => set("conversao", e.target.checked)}
              style={{ marginTop: 2, accentColor: "#d97706", width: 16, height: 16, flexShrink: 0 }} />
            Houve <strong>conversão de via</strong> (ex.: videolaparoscópica → aberta)
          </label>
          {/* Container FIXO com `key`: o campo do motivo aparece e desaparece
              ao lado de outros irmãos condicionais, e sem isto o React
              remonta o que está abaixo — a pessoa perde o que digitou. */}
          <div key="conversao-motivo" style={{ marginTop: form.conversao ? 8 : 0 }}>
            {form.conversao && (
              <textarea value={form.conversao_motivo} onChange={e => set("conversao_motivo", e.target.value)}
                placeholder="por que converteu — é o que explica o indicador de conversão do bloco"
                style={{ ...area, minHeight: 54 }} />
            )}
          </div>
        </div>

        {/* ── A NARRATIVA ───────────────────────────────────── */}
        <div style={bloco}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>
            O ato
          </div>
          <label style={rotuloCampo}>Achados — o que se encontrou</label>
          <textarea value={form.achados} onChange={e => set("achados", e.target.value)}
            placeholder="é o que o próximo médico procura primeiro" style={{ ...area, marginBottom: 10 }} />

          <label style={rotuloCampo}>
            Descrição do ato * <span style={{ color: form.descricao.trim().length >= MIN_NARRATIVA ? "#34d399" : "#f43f5e", fontWeight: 400 }}>
              {form.descricao.trim().length}/{MIN_NARRATIVA}
            </span>
          </label>
          <textarea value={form.descricao} onChange={e => set("descricao", e.target.value)}
            placeholder="incisão, tempos cirúrgicos, síntese, como terminou"
            style={{ ...area, minHeight: 120, marginBottom: 10 }} />

          <label style={rotuloCampo}>Intercorrências</label>
          <textarea value={form.intercorrencias} onChange={e => set("intercorrencias", e.target.value)}
            placeholder="em branco significa SEM intercorrências" style={{ ...area, minHeight: 54, marginBottom: 10 }} />

          <label style={rotuloCampo}>CID pós-operatório</label>
          <input value={form.cid_pos} onChange={e => set("cid_pos", e.target.value.toUpperCase())}
            placeholder="o diagnóstico depois de ver" style={{ ...campoTexto, width: 160 }} />
        </div>

        {/* ── O QUE SAIU E O QUE FICOU ──────────────────────── */}
        <div style={bloco}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>
            Sangramento, drenos e peça
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 10 }}>
            <div>
              <label style={rotuloCampo}>Sangramento estimado (ml)</label>
              <input type="number" min="0" value={form.sangramento_ml}
                onChange={e => set("sangramento_ml", e.target.value)} style={{ ...campoTexto, width: 120 }} />
            </div>
            <TresEstados rotulo="Hemotransfusão" valor={form.hemotransfusao} onChange={x => set("hemotransfusao", x)} />
          </div>

          <label style={rotuloCampo}>Drenos e cateteres deixados</label>
          <input value={form.drenos} onChange={e => set("drenos", e.target.value)}
            placeholder="em branco significa nenhum" style={{ ...campoTexto, marginBottom: 10 }} />

          <label style={rotuloCampo}>Peça cirúrgica / amostras</label>
          <input value={form.amostras} onChange={e => set("amostras", e.target.value)}
            placeholder="o que foi retirado para exame" style={{ ...campoTexto, marginBottom: 8 }} />
          <div key="amostra-envio">
            {!!form.amostras.trim() && (
              <TresEstados rotulo="Enviada para o anatomopatológico?" obrigatorio
                valor={form.amostra_enviada} onChange={x => set("amostra_enviada", x)} />
            )}
          </div>
        </div>

        {corrigindo && (
          <div style={{ ...bloco, borderColor: "#d9770655", background: "#d9770610" }}>
            <label style={rotuloCampo}>Motivo da correção * — o que estava errado na versão {corrigindo.versao}</label>
            <textarea value={form.motivo_correcao} onChange={e => set("motivo_correcao", e.target.value)}
              style={{ ...area, minHeight: 54 }} />
          </div>
        )}

        {!!v.avisos.length && (
          <div style={{ ...bloco, background: "#fbbf2410", borderColor: "#fbbf2455" }}>
            {v.avisos.map((a, i) => (
              <div key={i} style={{ fontSize: 12, color: "#fbbf24", lineHeight: 1.55, marginBottom: 4 }}>⚠️ {a}</div>
            ))}
          </div>
        )}

        {!v.ok && (
          <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.55, marginBottom: 10 }}>
            Falta: {v.erros.join(" ")}
          </div>
        )}
        {erro && (
          <div style={{ fontSize: 12.5, color: "#f43f5e", lineHeight: 1.55, marginBottom: 10 }}>{erro}</div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btnContorno("var(--text-3)")}>Fechar</button>
          <button onClick={salvar} disabled={busy || !v.ok || naoLi}
            style={{ ...btnContorno(corrigindo ? "#d97706" : "#8b5cf6"),
                     opacity: (busy || !v.ok || naoLi) ? .5 : 1 }}>
            {busy ? "Gravando…" : corrigindo ? "Gravar a correção" : "Gravar a descrição"}
          </button>
        </div>
      </div>
    </div>
  );
}
