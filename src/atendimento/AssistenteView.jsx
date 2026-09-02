// ═══════════════════════════════════════════════════════════
// ASSISTENTE DO FATURAMENTO — a conversa
//
// Mesmo desenho dos assistentes do NSP e do Giro de Leitos: local, sem
// rede, sem modelo de linguagem. A resposta sai de `assistente.js`, que
// por sua vez só chama as funções que as outras abas já usam.
//
// ⚠️ A LINHA "nada sai do navegador" NÃO É MARKETING. Aqui trafegam valor
// de conta, prontuário e nome de convênio — mandar isso para uma API de
// terceiro seria um problema de LGPD antes de ser um problema técnico.
//
// ⚠️ A tela carrega os MESMOS dados das outras abas e passa adiante. Se
// alguma leitura falhar, a marca de falha viaja junto e o assistente se
// recusa a responder com número — é a parte que mais importa.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useMemo } from "react";
import { responderAssistente, AJUDA } from "./assistente.js";
import { conciliar } from "./receitas.js";
import {
  todasAsContas, itensDasContas, glosasDasContas, repassesDasContas,
  carregarGlosas, carregarPrecos, itensComConvenio, carregarCatalogos,
} from "./dados.js";
import { VX } from "../ui/base.jsx";
import { listaLida } from "../util/leitura.js";

const SUGESTOES = [
  "Panorama", "Glosas vencendo", "Taxa de recuperação", "Por que glosaram",
  "Quanto tenho a receber", "Prazo médio de repasse", "Procedimento sem preço",
  "Onde cobrar primeiro",
];

export default function AssistenteView({ sb }) {
  const [msgs, setMsgs] = useState([
    { role: "a", text: "Olá! Sou o assistente local do Faturamento. " + AJUDA },
  ]);
  const [q, setQ] = useState("");
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const fimRef = useRef(null);
  // ⚠️ `?.` no MÉTODO, não só no ref: `scrollIntoView` não existe no jsdom
  // (nem em ambiente sem layout), e a falta dele derrubava a aba inteira —
  // o `telas.test.jsx` pegou isso na montagem.
  useEffect(() => { fimRef.current?.scrollIntoView?.({ behavior: "smooth" }); }, [msgs]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!sb) { if (vivo) setCarregando(false); return; }
      const contas = await todasAsContas(sb, { limite: 1000 }).catch(() => listaLida(null));
      const ids = listaLida(contas).map(c => c.id);
      const [its, gls, reps, glosas, precos, itensConv, cat] = await Promise.all([
        itensDasContas(sb, ids), glosasDasContas(sb, ids), repassesDasContas(sb, ids),
        carregarGlosas(sb, { limite: 1000 }), carregarPrecos(sb),
        itensComConvenio(sb), carregarCatalogos(sb).catch(() => ({ convenios: [] })),
      ]);
      if (!vivo) return;
      setDados({
        contas,
        conciliacoes: conciliar({
          contas, itensPorConta: its.porConta,
          glosasPorConta: gls.porConta, repassesPorConta: reps.porConta,
        }),
        glosas, precos, itensComConvenio: itensConv,
        repassesPorConta: reps.porConta, convenios: cat?.convenios || [],
      });
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [sb]);

  const pronto = useMemo(() => !carregando && dados, [carregando, dados]);

  function enviar(texto) {
    const t = (texto != null ? texto : q).trim();
    if (!t) return;
    // ⚠️ Enquanto os dados não chegaram, ele NÃO responde "zero" — diz que
    // ainda está lendo. É o mesmo princípio da recusa por falha de leitura.
    const resp = pronto
      ? responderAssistente(t, dados)
      : "Ainda estou lendo os dados do faturamento. Pergunte de novo em um instante — prefiro isso a responder com números pela metade.";
    setMsgs(m => [...m, { role: "u", text: t }, { role: "a", text: resp }]);
    setQ("");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 230px)", minHeight: 380, maxWidth: 780 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>Assistente AI</h2>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
        Assistente local e gratuito: responde a partir dos dados que as outras abas já calculam.
        <strong> Nada é enviado para fora do navegador.</strong>
      </div>
      {/* A recusa dita antes de qualquer pergunta, para calibrar a expectativa. */}
      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 12 }}>
        Ele não estima nem arredonda: quando uma leitura falha, recusa dar o número em vez de repetir o zero.
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, padding: "4px 2px 12px" }}>
        {msgs.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === "u" ? "flex-end" : "flex-start", maxWidth: "85%",
            background: m.role === "u" ? VX.royal : "var(--surface)",
            color: m.role === "u" ? "#fff" : "var(--text)",
            border: m.role === "u" ? "none" : "1px solid var(--border)",
            borderRadius: 12, padding: "9px 13px", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap",
          }}>{m.text}</div>
        ))}
        <div ref={fimRef} />
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {SUGESTOES.map(sg => (
          <button key={sg} onClick={() => enviar(sg)} style={{
            background: "transparent", color: VX.turquesa, border: `1px solid ${VX.turquesa}55`,
            borderRadius: 99, padding: "4px 11px", fontSize: 11.5, cursor: "pointer",
          }}>{sg}</button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === "Enter" && enviar()}
          placeholder={carregando ? "Lendo os dados do faturamento…" : "Pergunte sobre o faturamento…"}
          style={{ flex: 1, background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 13px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none" }} />
        <button onClick={() => enviar()} style={{ background: VX.turquesa, color: "#062a26", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Enviar</button>
      </div>
    </div>
  );
}
