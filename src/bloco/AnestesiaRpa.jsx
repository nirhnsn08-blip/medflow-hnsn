// ═══════════════════════════════════════════════════════════
// A FICHA ANESTÉSICA E A RECUPERAÇÃO — as telas
//
// 🔴 A DECISÃO DE DESENHO QUE IMPORTA AQUI: o botão "Alta da RPA — concluir"
// deixa de dar alta. Ele ABRE a recuperação.
//
// Antes, um clique concluía a cirurgia e carimbava `rpa_saida_em`. Agora o
// mesmo clique abre a ficha de recuperação, onde se pontua o Aldrete; a
// alta só aparece como ação depois de um escore que libere.
//
// Não é uma trava a mais na frente do mesmo botão: é o botão passando a
// fazer a coisa certa. Quem está na recuperação não queria "concluir" — ia
// avaliar o paciente de todo jeito, e o sistema não guardava nada disso.
//
// ⚠️ O ESCORE LIBERA, NÃO DÁ ALTA. Mesmo com 10/10 é preciso clicar em dar
// alta: a decisão é do anestesista por norma, e automatizá-la seria
// tomá-la por ele.
// ═══════════════════════════════════════════════════════════

import { useState } from "react";
import { btnContorno, campoTexto, rotuloCampo } from "../ui/base.jsx";
import { fmtDataBR, horaFmt } from "../util/datas.js";
import {
  ALDRETE_MINIMO, ALDRETE_PARAMETROS,
  liberaAlta, linhaDaAvaliacao, motivoParaNaoDarAlta, resumoDaAvaliacao,
  tendencia, totalAldrete, ultimaAvaliacao,
} from "./aldrete.js";
import {
  ASA, TIPOS_ANESTESIA, VIAS_AEREAS, VIA_AEREA_LABEL,
  conferirFicha, fichaVigente, linhaDaFicha,
} from "./anestesia.js";

const fundo = { position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 };
const caixa = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 680, maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto" };
const bloco = { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "11px 13px", marginBottom: 12 };
const titulo = { fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 };

// ═══════════════════════════════════════════════════════════
// A FICHA ANESTÉSICA
// ═══════════════════════════════════════════════════════════
export function FichaAnestesicaModal({ cirurgia, fichas = [], assinatura = null, onClose, onConfirm }) {
  const vigente = fichaVigente(fichas);
  const naoLi = vigente === null;
  const corrigindo = vigente || null;

  const [form, setForm] = useState(() => ({
    tecnicas: corrigindo?.tecnicas || [],
    asa: corrigindo?.asa || "",
    asa_emergencia: !!corrigindo?.asa_emergencia,
    via_aerea: corrigindo?.via_aerea || "",
    via_aerea_dificil: !!corrigindo?.via_aerea_dificil,
    via_aerea_manejo: corrigindo?.via_aerea_manejo || "",
    jejum_horas: corrigindo?.jejum_horas ?? "",
    intercorrencias: corrigindo?.intercorrencias || "",
    motivo_correcao: "",
  }));
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const alternarTecnica = t => setForm(f => ({
    ...f, tecnicas: f.tecnicas.includes(t) ? f.tecnicas.filter(x => x !== t) : [...f.tecnicas, t],
  }));
  const v = conferirFicha({ cirurgia, form, corrigindo });

  async function salvar() {
    if (!v.ok) { setErro(v.erros.join(" ")); return; }
    setBusy(true); setErro(null);
    const r = await onConfirm(linhaDaFicha({ cirurgia, form, corrigindo, assinatura }));
    setBusy(false);
    if (r?.ok) { onClose(); return; }
    setErro(r?.motivo || "Nada foi gravado.");
  }

  return (
    <div onClick={onClose} style={fundo}>
      <div onClick={e => e.stopPropagation()} style={caixa}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>
          Ficha anestésica{corrigindo ? <span style={{ color: "#d97706" }}> — CORREÇÃO da versão {corrigindo.versao}</span> : null}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
          Paciente {cirurgia?.iniciais} · Cirurgia #{cirurgia?.id} · {cirurgia?.procedimento}
        </div>

        {naoLi && (
          <div style={{ ...bloco, background: "#f43f5e12", borderColor: "#f43f5e55", color: "#f43f5e", fontSize: 12.5, lineHeight: 1.55 }}>
            Não consegui ler as fichas desta cirurgia. Ela pode JÁ TER uma — recarregue antes de escrever.
          </div>
        )}

        <div style={{ ...bloco, fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.55 }}>
          Documento exigido pela CFM 1.638/2002. <strong>Registro imutável</strong>: correção é versão nova, com o motivo.
        </div>

        <div style={bloco}>
          <div style={titulo}>Técnica anestésica *</div>
          {/* Lista, não escolha única: geral + peridural para analgesia
              pós-operatória é combinação comum. */}
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {TIPOS_ANESTESIA.map(t => (
              <button key={t.chave} type="button" onClick={() => alternarTecnica(t.chave)}
                style={{ ...btnContorno(form.tecnicas.includes(t.chave) ? "#8b5cf6" : "var(--text-3)"),
                         background: form.tecnicas.includes(t.chave) ? "#8b5cf618" : "transparent",
                         fontWeight: form.tecnicas.includes(t.chave) ? 700 : 500 }}>{t.label}</button>
            ))}
          </div>
        </div>

        <div style={bloco}>
          <div style={titulo}>Risco — o estado com que o paciente entrou</div>
          <label style={rotuloCampo}>Classificação ASA *</label>
          <select value={form.asa} onChange={e => set("asa", e.target.value)} style={{ ...campoTexto, marginBottom: 8 }}>
            <option value="">— não informado —</option>
            {ASA.map(a => <option key={a.chave} value={a.chave}>{a.label}</option>)}
          </select>
          <label style={{ display: "flex", gap: 9, alignItems: "center", cursor: "pointer", fontSize: 12.5, color: "var(--text-2)" }}>
            <input type="checkbox" checked={form.asa_emergencia} onChange={e => set("asa_emergencia", e.target.checked)}
              style={{ accentColor: "#d97706", width: 16, height: 16 }} />
            Cirurgia de <strong>emergência</strong> (sufixo E)
          </label>
        </div>

        <div style={bloco}>
          <div style={titulo}>Via aérea</div>
          <select value={form.via_aerea} onChange={e => set("via_aerea", e.target.value)} style={{ ...campoTexto, marginBottom: 8 }}>
            <option value="">— não informada —</option>
            {VIAS_AEREAS.map(x => <option key={x.chave} value={x.chave}>{x.label}</option>)}
          </select>
          {/* 🔴 Campo próprio, e não uma frase nas intercorrências: é o que
              vira alerta permanente do paciente. */}
          <label style={{ display: "flex", gap: 9, alignItems: "flex-start", cursor: "pointer", fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>
            <input type="checkbox" checked={form.via_aerea_dificil} onChange={e => set("via_aerea_dificil", e.target.checked)}
              style={{ marginTop: 2, accentColor: "#f43f5e", width: 16, height: 16, flexShrink: 0 }} />
            <span>Foi <strong>VIA AÉREA DIFÍCIL</strong> — fica como alerta permanente no prontuário do paciente</span>
          </label>
          <div key="manejo" style={{ marginTop: form.via_aerea_dificil ? 8 : 0 }}>
            {form.via_aerea_dificil && (
              <textarea value={form.via_aerea_manejo} onChange={e => set("via_aerea_manejo", e.target.value)}
                placeholder="o que falhou, o que funcionou, quantas tentativas — é o que salva o próximo ato anestésico"
                style={{ ...campoTexto, minHeight: 64, resize: "vertical", lineHeight: 1.55 }} />
            )}
          </div>
        </div>

        <div style={bloco}>
          <div style={titulo}>Jejum e intercorrências</div>
          <label style={rotuloCampo}>Jejum (horas)</label>
          <input type="number" min="0" step="0.5" value={form.jejum_horas}
            onChange={e => set("jejum_horas", e.target.value)} style={{ ...campoTexto, width: 120, marginBottom: 8 }} />
          <label style={rotuloCampo}>Intercorrências da anestesia</label>
          <textarea value={form.intercorrencias} onChange={e => set("intercorrencias", e.target.value)}
            placeholder="em branco significa SEM intercorrências"
            style={{ ...campoTexto, minHeight: 64, resize: "vertical", lineHeight: 1.55 }} />
        </div>

        {corrigindo && (
          <div style={{ ...bloco, borderColor: "#d9770655", background: "#d9770610" }}>
            <label style={rotuloCampo}>Motivo da correção * — o que estava errado na versão {corrigindo.versao}</label>
            <textarea value={form.motivo_correcao} onChange={e => set("motivo_correcao", e.target.value)}
              style={{ ...campoTexto, minHeight: 56, resize: "vertical" }} />
          </div>
        )}

        {!!v.avisos.length && (
          <div style={{ ...bloco, background: "#fbbf2410", borderColor: "#fbbf2455" }}>
            {v.avisos.map((a, i) => (
              <div key={i} style={{ fontSize: 12, color: "#fbbf24", lineHeight: 1.55, marginBottom: 4 }}>⚠️ {a}</div>
            ))}
          </div>
        )}
        {!v.ok && <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.55, marginBottom: 10 }}>Falta: {v.erros.join(" ")}</div>}
        {erro && <div style={{ fontSize: 12.5, color: "#f43f5e", lineHeight: 1.55, marginBottom: 10 }}>{erro}</div>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btnContorno("var(--text-3)")}>Fechar</button>
          <button onClick={salvar} disabled={busy || !v.ok || naoLi}
            style={{ ...btnContorno(corrigindo ? "#d97706" : "#8b5cf6"), opacity: (busy || !v.ok || naoLi) ? .5 : 1 }}>
            {busy ? "Gravando…" : corrigindo ? "Gravar a correção" : "Gravar a ficha"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// A RECUPERAÇÃO PÓS-ANESTÉSICA
// ═══════════════════════════════════════════════════════════
export function RecuperacaoModal({ cirurgia, avaliacoes = [], assinatura = null, onClose, onAvaliar, onAlta }) {
  const [av, setAv] = useState({});
  const [observacao, setObservacao] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  const total = totalAldrete(av);
  const impede = motivoParaNaoDarAlta(av);
  const ultima = ultimaAvaliacao(avaliacoes);
  const curva = tendencia(avaliacoes);
  // A alta se libera pela avaliação REGISTRADA, não pelo rascunho na tela:
  // é a mesma leitura que o gatilho do banco faz.
  const jaLiberou = (avaliacoes || []).some(liberaAlta);

  async function avaliar() {
    if (impede && totalAldrete(av) == null) { setErro(impede); return; }
    setBusy(true); setErro(null);
    const r = await onAvaliar(linhaDaAvaliacao({ cirurgia, av, observacao, assinatura }));
    setBusy(false);
    if (!r?.ok) { setErro(r?.motivo || "Nada foi gravado."); return; }
    setAv({}); setObservacao("");
  }

  async function darAlta() {
    setBusy(true); setErro(null);
    const r = await onAlta();
    setBusy(false);
    if (r?.ok) { onClose(); return; }
    setErro(r?.motivo || "Nada foi gravado.");
  }

  return (
    <div onClick={onClose} style={fundo}>
      <div onClick={e => e.stopPropagation()} style={caixa}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Recuperação pós-anestésica — escore de Aldrete</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
          Paciente {cirurgia?.iniciais} · Cirurgia #{cirurgia?.id}
          {cirurgia?.rpa_entrada_em ? ` · na RPA desde ${horaFmt(cirurgia.rpa_entrada_em).slice(-5)}` : ""}
        </div>

        <div style={{ ...bloco, fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.55 }}>
          Ficha de recuperação pós-anestésica (CFM 1.638/2002 e 2.174/2017). Avalie na chegada e a cada
          10 a 15 minutos. <strong>Alta com {ALDRETE_MINIMO} ou mais, e nenhum parâmetro zerado.</strong>
        </div>

        {/* 🔴 A CURVA, que uma foto esconde. Um paciente que vai de 9 para 7
            está piorando, e isso é emergência mesmo que 7 pareça "quase lá". */}
        {curva && curva.sentido === "piorando" && (
          <div role="alert" style={{ ...bloco, background: "#f43f5e12", borderColor: "#f43f5e55" }}>
            <div style={{ fontSize: 13, color: "#f43f5e", fontWeight: 700, lineHeight: 1.5 }}>
              PIORANDO — o escore caiu de {curva.de} para {curva.para}.
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.5 }}>
              Chame o anestesista. Queda no Aldrete na recuperação é deterioração, não lentidão para acordar.
            </div>
          </div>
        )}

        <div style={bloco}>
          <div style={titulo}>Nova avaliação</div>
          {ALDRETE_PARAMETROS.map(p => (
            <div key={p.chave} style={{ marginBottom: 11 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-2)", marginBottom: 5 }}>{p.label}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {p.notas.map((texto, n) => (
                  <label key={n} style={{ display: "flex", gap: 9, alignItems: "flex-start", cursor: "pointer",
                                          background: av[p.chave] === n ? (n === 0 ? "#f43f5e14" : "#8b5cf614") : "transparent",
                                          border: `1px solid ${av[p.chave] === n ? (n === 0 ? "#f43f5e55" : "#8b5cf655") : "var(--border)"}`,
                                          borderRadius: 7, padding: "6px 10px", fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.45 }}>
                    <input type="radio" name={`ald-${p.chave}`} checked={av[p.chave] === n}
                      onChange={() => setAv(a => ({ ...a, [p.chave]: n }))}
                      style={{ marginTop: 2, accentColor: n === 0 ? "#f43f5e" : "#8b5cf6", flexShrink: 0 }} />
                    <span><strong style={{ color: "var(--text-3)" }}>{n}</strong> — {texto}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}

          <label style={rotuloCampo}>Observação</label>
          <input value={observacao} onChange={e => setObservacao(e.target.value)}
            placeholder="ex.: chegada na RPA; reavaliação aos 15 min" style={campoTexto} />

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 11, flexWrap: "wrap" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: total == null ? "var(--text-muted)" : total >= ALDRETE_MINIMO ? "#34d399" : "#d97706" }}>
              {total == null ? "escore incompleto" : `Aldrete ${total}/10`}
            </div>
            <button onClick={avaliar} disabled={busy || total == null}
              style={{ ...btnContorno("#8b5cf6"), opacity: (busy || total == null) ? .5 : 1 }}>
              {busy ? "Gravando…" : "Registrar avaliação"}
            </button>
          </div>
          {total != null && impede && (
            <div style={{ fontSize: 12, color: "#d97706", lineHeight: 1.55, marginTop: 7 }}>{impede}</div>
          )}
        </div>

        {/* A TRILHA — seriada, append-only, como o resto do registro clínico. */}
        {!!(avaliacoes || []).length && (
          <div style={bloco}>
            <div style={titulo}>Avaliações registradas ({avaliacoes.length})</div>
            {avaliacoes.map(a => (
              <div key={a.id} style={{ borderLeft: `2px solid ${liberaAlta(a) ? "#34d399" : "#d97706"}`,
                                       paddingLeft: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 12.5, color: "var(--text-2)", fontWeight: 600 }}>{resumoDaAvaliacao(a)}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {a.criado_em ? `${fmtDataBR(a.criado_em)} ${horaFmt(a.criado_em).slice(-5)}` : ""}
                  {a.assinatura ? ` · ${a.assinatura}` : a.usuario ? ` · ${a.usuario}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}

        {erro && <div role="alert" style={{ fontSize: 12.5, color: "#f43f5e", lineHeight: 1.55, marginBottom: 10 }}>{erro}</div>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
          {/* ⚠️ O escore LIBERA; quem dá alta é pessoa. Mesmo com 10/10 é
              preciso clicar — a decisão é do anestesista por norma. */}
          {!jaLiberou && (
            <span style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.5, marginRight: "auto" }}>
              {ultima ? `Último escore ${totalAldrete(ultima)}/10 — ainda não libera.` : "Nenhuma avaliação registrada ainda."}
            </span>
          )}
          <button onClick={onClose} style={btnContorno("var(--text-3)")}>Fechar</button>
          <button onClick={darAlta} disabled={busy || !jaLiberou}
            style={{ ...btnContorno("#34d399"), opacity: (busy || !jaLiberou) ? .4 : 1 }}>
            Dar alta da RPA — concluir
          </button>
        </div>
      </div>
    </div>
  );
}

/** O rótulo da via aérea, para quem só precisa do texto. */
export { VIA_AEREA_LABEL };
