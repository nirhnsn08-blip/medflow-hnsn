// ═══════════════════════════════════════════════════════════
// PEDIR EXAMES
//
// 🔴 O PEDIDO ANTIGO ERA UM CAMPO DE TEXTO E UM BOTÃO. Quem digitasse
// "hemograma", "Hemograma completo" ou "HMG" criava três exames diferentes
// para o sistema — e nenhum deles tinha código, prazo ou analito.
//
// Aqui o exame vem do CATÁLOGO (com código SIGTAP/TUSS e prazo pactuado), e
// vários exames entram num pedido só, que é como se pede na prática: a
// mesma punção, a mesma indicação, a mesma assinatura.
//
// ⚠️ TEXTO LIVRE CONTINUA POSSÍVEL, e isso não é desleixo. Exame que o
// hospital terceiriza e ainda não cadastrou, exame que o paciente trouxe de
// fora — sem essa saída, quem está na recepção digita o nome mais parecido
// do catálogo, e aí o código está errado em vez de ausente. Ausente se
// resolve depois; errado vira conta glosada.
//
// As recusas estão em `exames.js`, provadas por fronteira e por mutação.
// ═══════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { btnContorno } from "../ui/base.jsx";
import { fmtDur } from "../util/datas.js";
import { naoDeuParaLer } from "../util/leitura.js";
import { PS_EXAME_CATEGORIAS } from "../ps/catalogo.js";
import { PRIORIDADES, conferirPedido, pedidoVazio } from "./exames.js";

const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 11px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };

export function PedirExames({ catalogo, currentUser, busy, onPedir, onCancelar }) {
  const [form, setForm] = useState(() => pedidoVazio({ solicitante: currentUser?.name || "" }));
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const achados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (t.length < 2) return [];
    return (Array.isArray(catalogo) ? catalogo : [])
      .filter(c => c?.ativo !== false)
      .filter(c => String(c.nome ?? "").toLowerCase().includes(t) || String(c.codigo ?? "").includes(t))
      .slice(0, 12);
  }, [busca, catalogo]);

  function juntar(cat) {
    // 🔴 O MESMO EXAME DUAS VEZES NO PEDIDO é quase sempre um clique duplo, e
    // viraria duas cobranças e duas coletas. Pedir repetido de propósito se
    // faz num pedido novo, com hora própria — que é o que a série precisa.
    if (form.itens.some(i => i.catalogo_id != null && String(i.catalogo_id) === String(cat.id))) {
      setErro(`"${cat.nome}" já está neste pedido.`);
      return;
    }
    setErro("");
    setForm(p => ({ ...p, itens: [...p.itens, {
      catalogo_id: cat.id, descricao: cat.nome, categoria: cat.categoria || "outro",
      codigo: cat.codigo, material: cat.material, preparo: cat.preparo,
      prazo_rotina_min: cat.prazo_rotina_min, prazo_urgente_min: cat.prazo_urgente_min,
    }] }));
    setBusca("");
  }

  function juntarLivre() {
    const t = busca.trim();
    if (!t) return;
    setErro("");
    setForm(p => ({ ...p, itens: [...p.itens, { catalogo_id: null, descricao: t, categoria: "outro" }] }));
    setBusca("");
  }

  function tirar(i) {
    setForm(p => ({ ...p, itens: p.itens.filter((_, n) => n !== i) }));
  }

  async function enviar() {
    const r = conferirPedido(form);
    if (r) { setErro(r); return; }
    setErro("");
    const res = await onPedir(form);
    // ⚠️ EM CASO DE FALHA O FORMULÁRIO FICA NA TELA, inteiro. Fechar aqui
    // levaria junto a indicação clínica que o médico acabou de escrever —
    // e uma recusa silenciosa da RLS é exatamente quando isso acontece.
    if (res?.erro) { setErro(res.erro); return; }
    setForm(pedidoVazio({ solicitante: currentUser?.name || "" }));
  }

  const semCatalogo = naoDeuParaLer(catalogo);
  const prazoDe = it => {
    const p = form.prioridade === "urgente" ? it.prazo_urgente_min : it.prazo_rotina_min;
    return p == null ? null : fmtDur(Number(p));
  };

  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 9, padding: "12px 14px", marginBottom: 14 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>Novo pedido de exames</div>

      {semCatalogo && (
        <div style={{ fontSize: 11.5, color: "#d97706", fontWeight: 600, marginBottom: 10, lineHeight: 1.5 }}>
          Não foi possível ler o catálogo de exames. A busca abaixo está INCOMPLETA — o
          que você não encontrar pode existir. Dá para pedir por texto livre, mas o exame
          entra sem código e sem prazo.
        </div>
      )}

      {/* A pressa primeiro: ela muda o prazo contra o qual o atraso é medido. */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        {PRIORIDADES.map(p => (
          <button key={p.chave} onClick={() => set("prioridade", p.chave)}
            style={{ background: form.prioridade === p.chave ? p.cor : "transparent", color: form.prioridade === p.chave ? "#fff" : "var(--text-3)", border: `1px solid ${form.prioridade === p.chave ? p.cor : "var(--border)"}`, borderRadius: 99, padding: "4px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            {p.label}
          </button>
        ))}
        <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
          a prioridade define o prazo contra o qual o atraso é medido
        </span>
      </div>

      {/* A busca no catálogo. */}
      <div style={{ position: "relative", marginBottom: 8 }}>
        <input value={busca} onChange={e => { setBusca(e.target.value); setErro(""); }}
          onKeyDown={e => { if (e.key === "Enter") { achados.length === 1 ? juntar(achados[0]) : juntarLivre(); } }}
          placeholder="Busque o exame por nome ou código — ou digite e use “fora do catálogo”"
          style={inp} />
        {achados.length > 0 && (
          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 5, background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 7, marginTop: 3, maxHeight: 230, overflowY: "auto", boxShadow: "0 6px 18px rgba(0,0,0,.25)" }}>
            {achados.map(c => (
              <div key={c.id} onClick={() => juntar(c)}
                style={{ padding: "7px 11px", cursor: "pointer", borderBottom: "1px solid var(--border)", fontSize: 12.5 }}>
                <div style={{ display: "flex", gap: 7, alignItems: "baseline", flexWrap: "wrap" }}>
                  <strong>{c.nome}</strong>
                  {c.codigo && <span style={{ fontSize: 10.5, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{c.codigo}</span>}
                  <span style={{ fontSize: 10.5, color: "var(--text-3)" }}>{PS_EXAME_CATEGORIAS[c.categoria] || c.categoria}</span>
                </div>
                {(c.material || c.preparo) && (
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 1 }}>
                    {[c.material, c.preparo].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {busca.trim().length >= 2 && (
        <button onClick={juntarLivre} style={{ ...btnContorno("var(--text-muted)"), marginBottom: 8, fontSize: 11.5 }}>
          + “{busca.trim()}” fora do catálogo (sem código nem prazo)
        </button>
      )}

      {/* Os exames escolhidos. */}
      {form.itens.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 10 }}>
          {form.itens.map((it, i) => (
            <div key={`${it.catalogo_id ?? "livre"}-${i}`}
              style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--input-bg)", borderRadius: 6, padding: "6px 10px", flexWrap: "wrap" }}>
              <strong style={{ fontSize: 12.5 }}>{it.descricao}</strong>
              {it.codigo
                ? <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{it.codigo}</span>
                : <span style={{ fontSize: 10, color: "#d97706", fontWeight: 700 }}>SEM CÓDIGO</span>}
              {it.material && <span style={{ fontSize: 10.5, color: "var(--text-3)" }}>{it.material}</span>}
              {prazoDe(it)
                ? <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>prazo {prazoDe(it)}</span>
                : <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>prazo não cadastrado</span>}
              <button onClick={() => tirar(i)} title="Tirar do pedido"
                style={{ marginLeft: "auto", background: "transparent", border: "none", color: "#f43f5e", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: "0 4px" }}>×</button>
            </div>
          ))}
          {/* O preparo é instrução para a enfermagem, não decoração. */}
          {form.itens.some(i => i.preparo) && (
            <div style={{ fontSize: 11, color: "#d97706", lineHeight: 1.5, padding: "2px 2px 0" }}>
              <strong>Preparo:</strong> {form.itens.filter(i => i.preparo).map(i => `${i.descricao} — ${i.preparo}`).join(" · ")}
            </div>
          )}
        </div>
      )}

      {/* 🔴 A indicação clínica. */}
      <textarea value={form.indicacao_clinica} onChange={e => set("indicacao_clinica", e.target.value)} rows={2}
        placeholder="Indicação clínica — o que se está procurando. É o que quem lauda lê para saber o que responder."
        style={{ ...inp, resize: "vertical", lineHeight: 1.5, marginBottom: 8 }} />

      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <input value={form.solicitante} onChange={e => set("solicitante", e.target.value)}
          placeholder="Quem solicita" style={{ ...inp, flex: 1, minWidth: 160 }} />
        <input value={form.solicitante_cbo} onChange={e => set("solicitante_cbo", e.target.value)}
          placeholder="CBO (opcional)" style={{ ...inp, width: 130 }} />
      </div>

      {erro && (
        <div style={{ fontSize: 11.5, color: "#f43f5e", fontWeight: 600, marginBottom: 8, lineHeight: 1.5 }}>
          {erro}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        {onCancelar && <button onClick={onCancelar} style={btnContorno("var(--text-muted)")}>Cancelar</button>}
        <button onClick={enviar} disabled={busy}
          style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
          {busy ? "…" : `Pedir ${form.itens.length || ""} exame${form.itens.length === 1 ? "" : "s"}`.trim()}
        </button>
      </div>
    </div>
  );
}
