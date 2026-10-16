// ═══════════════════════════════════════════════════════════
// TENDÊNCIA DE OCUPAÇÃO — a tela
//
// Uma série, um eixo. Área preenchida porque é série única e o volume ajuda
// a ler o nível; linha de 2px por cima para a leitura fina.
//
// ── AS TRÊS DECISÕES QUE SUSTENTAM A HONESTIDADE ────────────
//
// 1. **O eixo Y vai de 0 a 100%, sempre.** Eixo que começa em 60% faz uma
//    variação de três pontos parecer despenhadeiro. A taxa de ocupação tem
//    teto natural; usar esse teto é de graça e é verdade.
//
// 2. **Os dias CEGOS são desenhados diferentes.** Antes da janela de leitura
//    a reconstrução não enxerga quem já tinha saído, e a curva desce sozinha
//    com cara de tendência de queda. Eles saem tracejados, em cinza, e a
//    legenda diz o que são. É a diferença entre "a ocupação caiu" e "eu não
//    sei o que houve antes do dia tal".
//
// 3. **Eixo único.** Nunca uma segunda escala à direita: duas medidas de
//    grandezas diferentes viram dois gráficos, não dois eixos.
//
// ⚠️ A linha de meta é REFERÊNCIA, desenhada por trás da série e em traço
// fino — ela orienta, não compete com o dado.
// ═══════════════════════════════════════════════════════════

import { useState, useRef } from "react";
import { pontosDaSerie, pontoMaisProximo } from "./tendencia.js";

const MONO = "JetBrains Mono, monospace";
const L = 640, A = 150;   // o viewBox; o SVG escala para a largura do cartão

const diaCurto = d => {
  if (!d) return "—";
  const [, m, dd] = String(d).split("-");
  return `${dd}/${m}`;
};

export default function GraficoTendencia({ censo, direcao, metaOcupacao = null, limiarCritico = 95 }) {
  const [sob, setSob] = useState(null);
  const svgRef = useRef(null);

  const linhas = censo?.linhas || [];
  const { pontos } = pontosDaSerie(linhas, { largura: L, altura: A, margem: 6 });

  if (!pontos.length) {
    return (
      <div style={{
        background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 12,
        padding: "1.25rem", color: "var(--text-muted)", fontSize: 12.5,
      }}>
        Não há série para desenhar: sem leito cadastrado ou sem internação com data de entrada,
        o censo diário não pode ser reconstruído — e inventar a curva seria pior que não mostrá-la.
      </div>
    );
  }

  // O trecho CEGO vai do começo até o último ponto não confiável; o confiável
  // começa no anterior a ele para as duas linhas se encostarem sem buraco.
  const ultimoCego = pontos.reduce((ix, p, i) => (p.confiavel ? ix : i), -1);
  const cegos = ultimoCego >= 0 ? pontos.slice(0, ultimoCego + 1) : [];
  const firmes = pontos.slice(Math.max(0, ultimoCego));
  const d = ps => ps.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
  const areaFirme = firmes.length
    ? `${d(firmes)} L${firmes[firmes.length - 1].x} ${A} L${firmes[0].x} ${A} Z`
    : "";

  const y = pct => A - (Math.min(pct, 100) / 100) * A;

  function mover(e) {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    if (!r.width) return;
    setSob(pontoMaisProximo(pontos, ((e.clientX - r.left) / r.width) * L));
  }

  const SETA = { subindo: "▲", descendo: "▼", estavel: "▬" };

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>
          {direcao?.avaliado ? (
            <>
              <span style={{ fontFamily: MONO, color: "var(--text)" }}>{SETA[direcao.direcao]}</span>{" "}
              {direcao.direcao === "subindo" ? "Ocupação subindo"
                : direcao.direcao === "descendo" ? "Ocupação descendo"
                : "Ocupação estável"}
              <span style={{ color: "var(--text-muted)" }}>
                {" "}· {direcao.variacao > 0 ? "+" : ""}{direcao.variacao} p.p. sobre {direcao.dias} dias
              </span>
            </>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>
              Poucos dias confiáveis para afirmar tendência — dois pontos fazem uma reta, não um movimento.
            </span>
          )}
        </div>
        {sob && (
          <span style={{ fontSize: 12.5, fontFamily: MONO, color: "var(--text)" }}>
            {diaCurto(sob.dia)} · {sob.pct}% · {sob.ocupados} leitos
            {!sob.confiavel && <span style={{ color: "#fbbf24" }}> · dia cego</span>}
          </span>
        )}
      </div>

      <svg ref={svgRef} viewBox={`0 0 ${L} ${A + 18}`} preserveAspectRatio="none"
        onMouseMove={mover} onMouseLeave={() => setSob(null)}
        style={{ display: "block", width: "100%", height: 170 }}
        role="img" aria-label={`Tendência de ocupação${direcao?.avaliado ? `: ${direcao.direcao}` : ""}`}>

        {/* Grade recessiva: 25/50/75/100% */}
        {[25, 50, 75, 100].map(p => (
          <g key={p}>
            <line x1="0" y1={y(p)} x2={L} y2={y(p)} stroke="var(--border)" strokeWidth="1" />
            <text x="2" y={y(p) - 3} fontSize="9" fill="var(--text-muted)" fontFamily={MONO}>{p}%</text>
          </g>
        ))}

        {/* Referências: a meta do hospital e o limiar crítico */}
        {metaOcupacao != null && (
          <line x1="0" y1={y(metaOcupacao)} x2={L} y2={y(metaOcupacao)}
            stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="5 4" />
        )}
        <line x1="0" y1={y(limiarCritico)} x2={L} y2={y(limiarCritico)}
          stroke="var(--torre-higiene)" strokeWidth="1" strokeDasharray="2 4" opacity=".7" />

        {/* O trecho CEGO: tracejado e cinza, sem área preenchida — não é
            dado, é falta de dado, e não pode ter o mesmo peso visual. */}
        {cegos.length > 1 && (
          <path d={d(cegos)} fill="none" stroke="var(--text-muted)"
            strokeWidth="1.5" strokeDasharray="4 4" strokeLinejoin="round" />
        )}

        {/* O trecho confiável: área + linha */}
        {areaFirme && <path d={areaFirme} fill="var(--torre-ocupado)" opacity=".16" />}
        {firmes.length > 1 && (
          <path d={d(firmes)} fill="none" stroke="var(--torre-ocupado)"
            strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        )}

        {/* O cursor */}
        {sob && (
          <g>
            <line x1={sob.x} y1="0" x2={sob.x} y2={A} stroke="var(--text-3)" strokeWidth="1" />
            <circle cx={sob.x} cy={sob.y} r="4.5"
              fill={sob.confiavel ? "var(--torre-ocupado)" : "var(--text-muted)"}
              stroke="var(--surface)" strokeWidth="2" />
          </g>
        )}

        {/* Só as duas pontas levam data — rótulo em todo ponto vira ruído */}
        <text x="2" y={A + 13} fontSize="9.5" fill="var(--text-muted)" fontFamily={MONO}>{diaCurto(pontos[0].dia)}</text>
        <text x={L - 2} y={A + 13} fontSize="9.5" fill="var(--text-muted)" fontFamily={MONO} textAnchor="end">
          {diaCurto(pontos[pontos.length - 1].dia)}
        </text>
      </svg>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8, fontSize: 11, color: "var(--text-muted)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span aria-hidden="true" style={{ width: 16, height: 2, background: "var(--torre-ocupado)" }} />
          ocupação reconstruída
        </span>
        {cegos.length > 1 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span aria-hidden="true" style={{ width: 16, borderTop: "2px dashed var(--text-muted)" }} />
            antes de {censo.desdeConfiavel} a leitura não cobre quem já tinha recebido alta
          </span>
        )}
        {metaOcupacao != null && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span aria-hidden="true" style={{ width: 16, borderTop: "1px dashed var(--text-muted)" }} />
            meta {metaOcupacao}%
          </span>
        )}
        <span>base: {pontos[0].operacionais} leitos operacionais de hoje</span>
      </div>
    </div>
  );
}
