// ═══════════════════════════════════════════════════════════
// MAPA ISOMÉTRICO DE LEITOS — a tela
//
// O hospital inteiro como volume: um cubo é um leito. O relevo conta a
// ocupação antes de qualquer número — uma UTI sólida e uma ala esburacada
// se leem de relance, e a contagem continua exata porque é contagem de
// cubos, não comparação de áreas em perspectiva.
//
// ── O QUE FAZ ESTE MAPA SER ACESSÍVEL ───────────────────────
// A cor NUNCA está sozinha. Cada estado tem: cor + ALTURA (o bloco ocupado
// é alto, o livre é laje) + rótulo na legenda + número na legenda + o
// tooltip que nomeia o estado por extenso. As cores de status ficam a ΔE 7,9
// sob protanopia — no piso que só é legítimo COM codificação secundária, e
// a altura é essa codificação. Em escala de cinza ou impresso, o mapa
// continua legível.
//
// ⚠️ As faces laterais são a MESMA cor com filtro de brilho, não uma
// segunda cor — inventar um tom para a sombra criaria duas cores por estado
// e estragaria a conta de contraste que foi validada.
// ═══════════════════════════════════════════════════════════

import { useState } from "react";
import {
  ESTADO, COR_TOKEN, ROTULO_ESTADO, ordemDeDesenho, resumoDoMapa,
} from "./mapa3d.js";

const MONO = "JetBrains Mono, monospace";

// A ordem da legenda é a do RELEVO (mais alto → mais baixo), para a legenda
// contar a mesma história que o desenho.
const ORDEM_LEGENDA = [ESTADO.OCUPADO, ESTADO.HIGIENIZACAO, ESTADO.LIVRE, ESTADO.INTERDITADO];

function Legenda({ resumo }) {
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
      {ORDEM_LEGENDA.map(e => {
        const n = resumo[e === ESTADO.HIGIENIZACAO ? "higienizacao"
                : e === ESTADO.INTERDITADO ? "interditados"
                : e === ESTADO.OCUPADO ? "ocupados" : "livres"];
        return (
          <span key={e} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12 }}>
            {/* O quadradinho da legenda tem a ALTURA do estado, não só a cor —
                é a mesma dupla codificação do mapa. */}
            <span aria-hidden="true" style={{
              width: 13, display: "inline-flex", alignItems: "flex-end", height: 13,
            }}>
              <span style={{
                width: 13,
                height: e === ESTADO.OCUPADO ? 13 : e === ESTADO.HIGIENIZACAO ? 8 : e === ESTADO.LIVRE ? 5 : 3,
                background: COR_TOKEN[e], borderRadius: 2,
              }} />
            </span>
            <span style={{ color: "var(--text-2)" }}>{ROTULO_ESTADO[e]}</span>
            <b style={{ fontFamily: MONO, color: "var(--text)" }}>{n}</b>
          </span>
        );
      })}
    </div>
  );
}

export default function MapaIsometrico({ mapa, altura = 420 }) {
  const [sob, setSob] = useState(null);     // o cubo sob o cursor

  if (!mapa || mapa.vazio) {
    return (
      <div style={{
        background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 12,
        padding: "1.5rem", textAlign: "center", color: "var(--text-muted)", fontSize: 12.5,
      }}>
        Nenhum leito cadastrado — o mapa do hospital se desenha a partir do cadastro de leitos
        (<b>Giro de Leitos → Mapa de leitos</b>).
      </div>
    );
  }

  const resumo = resumoDoMapa(mapa);
  const cubos = ordemDeDesenho(mapa.cubos);

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <Legenda resumo={resumo} />
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {resumo.ocupados} de {resumo.operacionais} operacionais
          {resumo.pct != null && <b style={{ color: "var(--text-2)", fontFamily: MONO }}> · {resumo.pct}%</b>}
        </span>
      </div>

      {/* O desenho CABE na largura do cartão e guarda a proporção — nada de
          esticar. `meet` + width 100% é o que impede o hospital de nascer
          com zoom e escapar pela direita. */}
      <div style={{ overflow: "hidden" }}>
        <svg viewBox={mapa.viewBox} preserveAspectRatio="xMidYMid meet"
          style={{ display: "block", width: "100%", maxHeight: altura }}
          role="img" aria-label={`Mapa de leitos: ${resumo.ocupados} ocupados, ${resumo.livres} livres, ${resumo.higienizacao} em higienização, ${resumo.interditados} interditados`}>
          <defs>
            {/* A hachura do interditado: o canal que sobrevive a impressão
                em preto e branco e a `forced-colors`. */}
            <pattern id="torre-hachura" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="var(--torre-bloqueado)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--surface)" strokeWidth="2" />
            </pattern>
          </defs>

          {/* Etiqueta de cada setor, na ponta esquerda do bloco */}
          {mapa.blocos.map(b => (
            <text key={b.setor} x={b.rotulo.x} y={b.rotulo.y}
              textAnchor="start" fontSize="11" fontFamily="Inter, sans-serif"
              fill="var(--text-3)" style={{ userSelect: "none" }}>
              {b.setor}
              {b.pct != null && <tspan fill="var(--text-muted)"> · {b.pct}%</tspan>}
            </text>
          ))}

          {cubos.map(c => {
            const cor = c.estado === ESTADO.INTERDITADO ? "url(#torre-hachura)" : COR_TOKEN[c.estado];
            const aceso = sob && sob.leito === c.leito && sob.setor === c.setor;
            return (
              <g key={`${c.setor}-${c.leito}`}
                onMouseEnter={() => setSob(c)} onFocus={() => setSob(c)}
                onMouseLeave={() => setSob(null)} onBlur={() => setSob(null)}
                tabIndex={0} role="button"
                aria-label={`Leito ${c.leito}, ${c.setor}, ${c.rotulo}`}
                style={{ cursor: "default", outline: "none" }}>
                {/* alvo de clique/hover maior que o cubo — o topo inteiro */}
                <polygon points={c.faces.topo} fill={cor} />
                {/* As laterais: mesma cor, escurecidas por filtro. Inventar um
                    segundo tom criaria duas cores por estado. */}
                <polygon points={c.faces.esquerda} fill={cor} style={{ filter: "brightness(.62)" }} />
                <polygon points={c.faces.direita} fill={cor} style={{ filter: "brightness(.80)" }} />
                {aceso && (
                  <polygon points={c.faces.topo} fill="none"
                    stroke="var(--text)" strokeWidth="1.6" strokeLinejoin="round" />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* O tooltip é uma faixa fixa embaixo, não um balão flutuante: num mapa
          denso o balão taparia justamente os vizinhos que dão contexto. */}
      <div style={{
        marginTop: 10, minHeight: 34, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        borderTop: "1px solid var(--border)", paddingTop: 9, fontSize: 12.5,
      }}>
        {sob ? (
          <>
            <b style={{ fontFamily: MONO }}>{sob.leito}</b>
            <span style={{ color: "var(--text-3)" }}>{sob.setor}</span>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              border: "1px solid var(--border-2)", borderRadius: 99, padding: "1px 9px", fontSize: 11.5,
            }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: COR_TOKEN[sob.estado] }} />
              {sob.rotulo}
            </span>
            {sob.iniciais && <span style={{ color: "var(--text-2)" }}>{sob.iniciais}</span>}
            {sob.prontuario && <span style={{ fontFamily: MONO, color: "var(--text-muted)", fontSize: 11.5 }}>{sob.prontuario}</span>}
            {sob.isolamento && <span style={{ color: "#fbbf24", fontSize: 11.5 }}>isolamento: {sob.isolamento}</span>}
            {/* Status que o mapa não conhece aparece como interditado — mas
                diz o que o banco respondeu, para ninguém investigar no escuro. */}
            {sob.estado === ESTADO.INTERDITADO && sob.statusBruto && sob.statusBruto !== "interditado" && (
              <span style={{ color: "var(--text-muted)", fontSize: 11.5 }}>(status no banco: {sob.statusBruto})</span>
            )}
          </>
        ) : (
          <span style={{ color: "var(--text-muted)" }}>Passe o cursor por um leito para ver quem está nele.</span>
        )}
      </div>
    </div>
  );
}
