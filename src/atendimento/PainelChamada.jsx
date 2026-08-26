// ═══════════════════════════════════════════════════════════
// PAINEL DE CHAMADA — a tela da sala de espera
//
// Só desenho. O que aparece e o que NÃO aparece está em `painel.js` (puro,
// testado) — inclusive a regra de privacidade, que é o coração do arquivo.
//
// ISTO NÃO É UMA TELA DE TRABALHO. É uma TV numa parede, lida a quatro ou
// cinco metros por gente sentada, muita dela idosa e sem óculos de perto.
// Daí três decisões que parecem exagero e não são:
//
//   1. TIPO ENORME. As iniciais de quem está sendo chamado são o maior
//      elemento da tela por uma ordem de grandeza. Se só uma coisa for
//      legível do fundo da sala, tem que ser essa.
//   2. FUNDO ESCURO, TEXTO CLARO. TV de sala de espera fica ligada o dia
//      inteiro e costuma pegar reflexo de janela.
//   3. NADA DE INTERAÇÃO. Sem botão, sem menu, sem rolagem. Ninguém opera
//      esta tela; ela só mostra. O que não cabe, não aparece — e o painel
//      diz quantos ficaram de fora em vez de deixar a lista vazar.
//
// ⚠️ RECARREGA SOZINHA. Uma tela de parede que depende de alguém apertar
// F5 mostra a chamada de meia hora atrás — que é pior que não ter painel,
// porque a sala confia nela.
// ═══════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { painelDeChamada } from "./painel.js";

/**
 * De quanto em quanto tempo a tela se atualiza.
 *
 * 15 segundos: rápido o bastante para a chamada aparecer enquanto a pessoa
 * ainda está caminhando, e devagar o bastante para não martelar o banco o
 * dia inteiro — é uma tela que fica ligada oito horas por dia.
 */
export const SEGUNDOS_ENTRE_ATUALIZACOES = 15;

const fundo = "#0b1220";
const claro = "#e2e8f0";

export default function PainelChamada({ fila, especialidades = {}, profissionais = {}, onSair, onAtualizar }) {
  // O relógio próprio existe para o "há N minutos" andar entre uma recarga
  // e outra: sem ele, a chamada ficaria congelada em "há 0 minutos" por
  // quinze segundos, e quem olhasse duas vezes veria o mesmo número.
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!onAtualizar) return;
    const t = setInterval(onAtualizar, SEGUNDOS_ENTRE_ATUALIZACOES * 1000);
    return () => clearInterval(t);
  }, [onAtualizar]);

  const p = painelDeChamada(fila, { agora });
  const nomeEspec = c => especialidades[c] || c || "";
  const nomeProf = u => profissionais[u] || u || "";

  return (
    <div style={{ position: "fixed", inset: 0, background: fundo, color: claro, zIndex: 9999,
                  fontFamily: "Inter, sans-serif", padding: "3vh 4vw", overflow: "hidden",
                  display: "flex", flexDirection: "column" }}>

      <div style={{ display: "flex", alignItems: "baseline", gap: "2vw" }}>
        <div style={{ fontSize: "2.2vh", fontWeight: 800, letterSpacing: ".12em", color: "#64748b" }}>
          ATENDIMENTO — AMBULATÓRIO
        </div>
        <div style={{ marginLeft: "auto", fontSize: "3vh", fontWeight: 800, fontFamily: "JetBrains Mono, monospace" }}>
          {String(agora.getHours()).padStart(2, "0")}:{String(agora.getMinutes()).padStart(2, "0")}
        </div>
        {/* Discreto de propósito: quem opera precisa sair, a sala não precisa ver. */}
        {onSair && (
          <button onClick={onSair}
            style={{ background: "transparent", border: "1px solid #1e293b", color: "#334155",
                     borderRadius: 6, padding: "4px 10px", fontSize: "1.6vh", cursor: "pointer" }}>
            sair
          </button>
        )}
      </div>

      {/* ── CHAMANDO ── o maior elemento da tela, por uma ordem de grandeza */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", minHeight: 0 }}>
        {p.chamando.length === 0 ? (
          <div style={{ fontSize: "4vh", color: "#334155", textAlign: "center" }}>
            Aguarde a chamada
          </div>
        ) : (
          p.chamando.map(c => (
            <div key={c.id} style={{ textAlign: "center", marginBottom: "2vh" }}>
              <div style={{ fontSize: "2.4vh", fontWeight: 800, letterSpacing: ".14em", color: "#22d3ee" }}>
                CHAMANDO
              </div>
              <div style={{ fontSize: "13vh", fontWeight: 900, lineHeight: 1,
                            fontFamily: "JetBrains Mono, monospace", letterSpacing: ".04em" }}>
                {c.iniciais}
              </div>
              <div style={{ fontSize: "3vh", color: "#94a3b8", marginTop: "1vh" }}>
                {[nomeEspec(c.especialidade), nomeProf(c.profissional)].filter(Boolean).join(" · ")}
              </div>
              <div style={{ fontSize: "2.2vh", color: "#475569", marginTop: ".6vh" }}>
                chegou às {c.chegada}
                {c.haMinutos > 0 ? ` · chamado há ${c.haMinutos} min` : " · chamado agora"}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── PRÓXIMOS ── */}
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "1.5vw", marginBottom: "1vh" }}>
          <span style={{ fontSize: "2vh", fontWeight: 800, letterSpacing: ".12em", color: "#64748b" }}>
            PRÓXIMOS
          </span>
          <span style={{ fontSize: "2vh", color: "#475569" }}>
            {p.aguardando} aguardando{p.ocultos > 0 ? ` · mais ${p.ocultos} além dos mostrados` : ""}
          </span>
        </div>

        <div style={{ display: "flex", gap: "1.2vw", flexWrap: "wrap" }}>
          {p.proximos.length === 0 && (
            <span style={{ fontSize: "2.4vh", color: "#334155" }}>Ninguém aguardando.</span>
          )}
          {p.proximos.map(x => (
            <div key={x.id} style={{ background: "#111c2e", border: `1px solid ${x.prioridade ? "#d9770688" : "#1e293b"}`,
                                     borderRadius: 10, padding: "1.2vh 1.4vw", minWidth: "12vw" }}>
              <div style={{ fontSize: "3.4vh", fontWeight: 800, fontFamily: "JetBrains Mono, monospace" }}>
                {x.iniciais}
              </div>
              <div style={{ fontSize: "1.8vh", color: "#475569" }}>chegou {x.chegada}</div>
              {/* O SELO, e só ele. O motivo fica na fila interna — "gestante"
                  ou "82 anos" numa parede é informação de saúde. */}
              {x.prioridade && (
                <div style={{ fontSize: "1.7vh", fontWeight: 800, color: "#d97706", marginTop: ".4vh",
                              letterSpacing: ".06em" }}>
                  {x.prioridade.toUpperCase()}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 🔴 A ORDEM PRECISA SE EXPLICAR.
            Desde que a fila respeita a Lei 10.048/2000, quem chegou primeiro
            vê alguém que chegou depois ser chamado na frente. Sem esta
            linha, a ordem parece arbitrária — e quem não entende vai ao
            balcão perguntar, que é o que o painel existe para evitar. */}
        {p.temPrioritario && (
          <div style={{ fontSize: "1.9vh", color: "#94a3b8", marginTop: "1.6vh", lineHeight: 1.5 }}>
            <strong style={{ color: "#d97706" }}>Atendimento preferencial</strong> — idosos, gestantes,
            lactantes, pessoas com deficiência e com criança de colo são chamados antes
            (Lei 10.048/2000). Entre eles, quem tem 80 anos ou mais vem primeiro.
          </div>
        )}
      </div>
    </div>
  );
}
