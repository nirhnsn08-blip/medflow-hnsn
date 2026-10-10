// ═══════════════════════════════════════════════════════════
// OPME — A TELA DO MATERIAL E A BUSCA DO RECALL
//
// Dois componentes, e o segundo é o motivo de o primeiro existir:
//
//   `OpmeModal`      — registra o que entrou no paciente, com lote.
//   `RastrearLote`   — "o fabricante recolheu o lote X; em quem usamos?"
//
// 🔴 A tela do recall não é relatório. É a pergunta que alguém faz com o
// comunicado do fabricante na mão, às vezes anos depois da cirurgia, e a
// resposta dela vira telefonema. Por isso ela mostra NOME e prontuário, e
// por isso ela NUNCA pode responder "ninguém" quando a leitura falhou.
// ═══════════════════════════════════════════════════════════

import { useState } from "react";
import { btnContorno, campoTexto, rotuloCampo } from "../ui/base.jsx";
import { fmtDataBR } from "../util/datas.js";
import { naoDeuParaLer } from "../util/leitura.js";
import {
  NATUREZAS, agruparRecall, conferirEstorno, conferirOpme, estornada,
  linhaDeEstorno, linhaDeOpme, pendentesDeBaixa, resumoDoMaterial, vigentes,
} from "./opme.js";

const fundo = { position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 };
const caixa = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 720, maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto" };
const bloco = { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "11px 13px", marginBottom: 12 };
const titulo = { fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 };

// ═══════════════════════════════════════════════════════════
export function OpmeModal({ cirurgia, materiais = [], itens = [], assinatura = null, onClose, onRegistrar, onEstornar }) {
  const naoLi = naoDeuParaLer(materiais);
  const valem = vigentes(materiais);
  const pendentes = pendentesDeBaixa(materiais);

  const [form, setForm] = useState({
    natureza: "implante", descricao: "", item_id: "", lote: "", numero_serie: "",
    registro_anvisa: "", fabricante: "", validade: "", quantidade: 1, consignado: false,
  });
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const v = conferirOpme({ cirurgia, form });
  const nat = NATUREZAS.find(n => n.chave === form.natureza);

  async function registrar() {
    if (!v.ok) { setErro(v.erros.join(" ")); return; }
    setBusy(true); setErro(null);
    const r = await onRegistrar(linhaDeOpme({ cirurgia, form, assinatura }));
    setBusy(false);
    if (!r?.ok) { setErro(r?.motivo || "Nada foi gravado."); return; }
    setForm(f => ({ ...f, descricao: "", lote: "", numero_serie: "", registro_anvisa: "", quantidade: 1 }));
  }

  async function estornar(linha) {
    const motivo = window.prompt(
      `Estornar "${linha.descricao}".\n\n` +
      "Por quê? O material não foi usado, foi lançado em dobro, o lote estava errado.\n" +
      "Isto NÃO apaga a linha — grava um estorno com seu nome, e devolve ao estoque o que tiver sido baixado.");
    if (motivo === null) return;
    const falta = conferirEstorno({ linha, motivo, todas: materiais });
    if (falta) { setErro(falta); return; }
    setBusy(true); setErro(null);
    const r = await onEstornar(linhaDeEstorno({ linha, motivo, assinatura }));
    setBusy(false);
    if (!r?.ok) setErro(r?.motivo || "Nada foi gravado.");
  }

  return (
    <div onClick={onClose} style={fundo}>
      <div onClick={e => e.stopPropagation()} style={caixa}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Material e OPME</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
          Paciente {cirurgia?.iniciais} · Cirurgia #{cirurgia?.id} · {cirurgia?.procedimento}
        </div>

        {naoLi && (
          <div role="alert" style={{ ...bloco, background: "#f43f5e12", borderColor: "#f43f5e55", color: "#f43f5e", fontSize: 12.5, lineHeight: 1.55 }}>
            Não consegui ler o material desta cirurgia. <strong>A lista abaixo pode não ser tudo</strong> —
            recarregue antes de concluir que algo não foi registrado.
          </div>
        )}

        <div style={{ ...bloco, fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.55 }}>
          Implante exige <strong>lote</strong>: é por ele que um recall procura em quem o produto foi usado
          (RDC 751/2022). Registro <strong>imutável</strong> — correção é estorno, com motivo.
        </div>

        {/* O que falta conciliar com o almoxarifado. Não é erro do registro:
            a baixa pode ter falhado porque o item nunca deu entrada. */}
        {!!pendentes.length && (
          <div style={{ ...bloco, background: "#fbbf2410", borderColor: "#fbbf2455" }}>
            <div style={{ fontSize: 12.5, color: "#fbbf24", lineHeight: 1.55 }}>
              <strong>{pendentes.length} item(ns) sem baixa no estoque.</strong> O registro do que entrou no
              paciente está completo; o que falta é a conciliação com o almoxarifado.
            </div>
            {pendentes.map(l => (
              <div key={l.id} style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 3 }}>
                {l.descricao} — {l.baixa_motivo}
              </div>
            ))}
          </div>
        )}

        <div style={bloco}>
          <div style={titulo}>Registrar material</div>
          <label style={rotuloCampo}>Natureza *</label>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
            {NATUREZAS.map(n => (
              <button key={n.chave} type="button" onClick={() => set("natureza", n.chave)}
                style={{ ...btnContorno(form.natureza === n.chave ? "#8b5cf6" : "var(--text-3)"),
                         background: form.natureza === n.chave ? "#8b5cf618" : "transparent",
                         fontWeight: form.natureza === n.chave ? 700 : 500 }}>{n.label}</button>
            ))}
          </div>

          <label style={rotuloCampo}>Descrição *</label>
          <input value={form.descricao} onChange={e => set("descricao", e.target.value)}
            placeholder="o que foi usado, como está na etiqueta" style={{ ...campoTexto, marginBottom: 10 }} />

          <label style={rotuloCampo}>Item do estoque — é o que permite a baixa</label>
          <select value={form.item_id} onChange={e => {
            const id = e.target.value;
            const it = itens.find(x => String(x.id) === String(id));
            setForm(f => ({ ...f, item_id: id, descricao: f.descricao || (it?.nome || "") }));
          }} style={{ ...campoTexto, marginBottom: 10 }}>
            <option value="">— fora do catálogo (sem baixa de estoque) —</option>
            {itens.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
          </select>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <div style={{ flex: "1 1 160px" }}>
              <label style={rotuloCampo}>
                Lote {nat?.exigeLote && <span style={{ color: "#f43f5e" }}>* obrigatório para implante</span>}
              </label>
              <input value={form.lote} onChange={e => set("lote", e.target.value)}
                placeholder="como está na embalagem" style={campoTexto} />
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <label style={rotuloCampo}>Número de série</label>
              <input value={form.numero_serie} onChange={e => set("numero_serie", e.target.value)} style={campoTexto} />
            </div>
            <div style={{ flex: "0 0 110px" }}>
              <label style={rotuloCampo}>Quantidade *</label>
              <input type="number" min="0" step="0.01" value={form.quantidade}
                onChange={e => set("quantidade", e.target.value)} style={campoTexto} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <div style={{ flex: "1 1 160px" }}>
              <label style={rotuloCampo}>Registro ANVISA</label>
              <input value={form.registro_anvisa} onChange={e => set("registro_anvisa", e.target.value)} style={campoTexto} />
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <label style={rotuloCampo}>Fabricante</label>
              <input value={form.fabricante} onChange={e => set("fabricante", e.target.value)} style={campoTexto} />
            </div>
            <div style={{ flex: "0 0 150px" }}>
              <label style={rotuloCampo}>Validade</label>
              <input type="date" value={form.validade} onChange={e => set("validade", e.target.value)} style={campoTexto} />
            </div>
          </div>

          <label style={{ display: "flex", gap: 9, alignItems: "flex-start", cursor: "pointer", fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>
            <input type="checkbox" checked={form.consignado} onChange={e => set("consignado", e.target.checked)}
              style={{ marginTop: 2, accentColor: "#8b5cf6", width: 16, height: 16, flexShrink: 0 }} />
            <span><strong>Consignado</strong> — veio do fornecedor e não passa pelo estoque do hospital</span>
          </label>

          {!!v.avisos.length && (
            <div style={{ marginTop: 10 }}>
              {v.avisos.map((a, i) => (
                <div key={i} style={{ fontSize: 12, color: "#fbbf24", lineHeight: 1.55, marginBottom: 4 }}>⚠️ {a}</div>
              ))}
            </div>
          )}
          {!v.ok && <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.55, marginTop: 8 }}>Falta: {v.erros.join(" ")}</div>}

          <div style={{ marginTop: 11 }}>
            <button onClick={registrar} disabled={busy || !v.ok}
              style={{ ...btnContorno("#8b5cf6"), opacity: (busy || !v.ok) ? .5 : 1 }}>
              {busy ? "Gravando…" : "Registrar material"}
            </button>
          </div>
        </div>

        {!!valem.length && (
          <div style={bloco}>
            <div style={titulo}>Registrado nesta cirurgia ({valem.length})</div>
            {valem.map(l => (
              <div key={l.id} style={{ display: "flex", gap: 10, alignItems: "flex-start",
                                       borderLeft: `2px solid ${l.implante ? "#8b5cf6" : "var(--border-2)"}`,
                                       paddingLeft: 10, marginBottom: 9 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, color: "var(--text-2)", fontWeight: 600, lineHeight: 1.5 }}>
                    {l.implante && <span style={{ color: "#8b5cf6" }}>IMPLANTE · </span>}
                    {resumoDoMaterial(l)}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {l.criado_em ? fmtDataBR(l.criado_em) : ""}{l.assinatura ? ` · ${l.assinatura}` : l.usuario ? ` · ${l.usuario}` : ""}
                    {l.baixa_estoque ? " · baixa aplicada" : l.baixa_motivo ? ` · ${l.baixa_motivo}` : ""}
                  </div>
                </div>
                <button onClick={() => estornar(l)} disabled={busy}
                  style={{ ...btnContorno("#d97706"), flexShrink: 0 }}>Estornar</button>
              </div>
            ))}
          </div>
        )}

        {erro && <div role="alert" style={{ fontSize: 12.5, color: "#f43f5e", lineHeight: 1.55, marginBottom: 10 }}>{erro}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btnContorno("var(--text-3)")}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 🔴 A BUSCA DO RECALL
// ═══════════════════════════════════════════════════════════
export function RastrearLote({ onBuscar }) {
  const [termo, setTermo] = useState("");
  const [busy, setBusy] = useState(false);
  // `null` = ninguém buscou ainda. É diferente de "buscou e não achou", e a
  // tela precisa das duas frases.
  const [res, setRes] = useState(null);

  async function buscar() {
    const t = termo.trim();
    if (t.length < 2) return;
    setBusy(true);
    const r = await onBuscar(t);
    setBusy(false);
    setRes({ ...r, termo: t });
  }

  const grupos = res && !res.naoLi ? agruparRecall(res.linhas) : [];

  return (
    <div>
      <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, marginBottom: 12, maxWidth: 760 }}>
        O fabricante recolheu um lote. <strong>Em quem ele foi usado?</strong> Busque pelo número do lote
        ou pelo número de série, como está no comunicado. A resposta vira telefonema — por isso ela traz
        nome e prontuário.
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <label style={rotuloCampo}>Lote ou número de série</label>
          <input value={termo} onChange={e => setTermo(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") buscar(); }}
            placeholder="ex.: LOT-A77" style={{ ...campoTexto, width: 240 }} />
        </div>
        <button onClick={buscar} disabled={busy || termo.trim().length < 2}
          style={{ ...btnContorno("#8b5cf6"), opacity: (busy || termo.trim().length < 2) ? .5 : 1 }}>
          {busy ? "Procurando…" : "Rastrear"}
        </button>
      </div>

      {/* 🔴 A FRASE QUE NÃO PODE FALTAR. Lista vazia por falha de leitura,
          numa busca de recall, significaria o hospital não chamar de volta
          gente com um produto recolhido dentro do corpo. */}
      {res?.naoLi && (
        <div role="alert" style={{ ...bloco, background: "#f43f5e12", borderColor: "#f43f5e55" }}>
          <div style={{ fontSize: 13, color: "#f43f5e", fontWeight: 700, lineHeight: 1.5 }}>
            NÃO CONSEGUI CONSULTAR — este resultado não é "ninguém".
          </div>
          <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.55 }}>
            A busca falhou. <strong>Não conclua que o lote não foi usado</strong> — tente de novo antes de
            responder ao fabricante ou à vigilância.
          </div>
        </div>
      )}

      {res && !res.naoLi && grupos.length === 0 && (
        <div style={{ ...bloco, fontSize: 13, color: "var(--text-2)", lineHeight: 1.55 }}>
          Nenhum registro do lote <strong>{res.termo}</strong> nas cirurgias deste hospital.
          <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 5 }}>
            ⚠️ Isto cobre o que foi registrado em `cc_opme`. Cirurgias antigas, cujo material ficou no campo
            de texto livre, não aparecem nesta busca — confira o passivo no mapa do dia.
          </div>
        </div>
      )}

      {grupos.map(g => (
        <div key={g.prontuario || g.nome} style={{ ...bloco, borderLeft: "3px solid #f43f5e" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
            {g.nome || "(paciente sem cadastro)"}
            {g.prontuario && <span style={{ fontWeight: 400, color: "var(--text-muted)" }}> · prontuário {g.prontuario}</span>}
          </div>
          {g.itens.map(l => (
            <div key={l.id} style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.6, marginTop: 4 }}>
              {resumoDoMaterial(l)}
              <span style={{ color: "var(--text-muted)" }}>
                {" — "}{l.procedimento || "cirurgia"}{l.cirurgia_data ? ` em ${fmtDataBR(l.cirurgia_data)}` : ""}
              </span>
            </div>
          ))}
        </div>
      ))}

      {grupos.length > 0 && (
        <div style={{ fontSize: 12.5, color: "#f43f5e", fontWeight: 700, lineHeight: 1.55 }}>
          {grupos.length} paciente(s) receberam material deste lote.
        </div>
      )}
    </div>
  );
}

export { estornada };
