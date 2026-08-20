// ═══════════════════════════════════════════════════════════
// CARD DO CHECKLIST DE IMPLANTAÇÃO — só desenho
//
// A regra inteira vive em `checklist.js`; aqui não se decide nada, só se
// mostra. Aparece no topo da Visão Geral enquanto houver cadastro-base
// faltando, e some sozinho quando a implantação termina — nunca vira mais
// um aviso permanente que todo mundo aprende a ignorar.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { MODULO_POR_CHAVE } from "../acesso/modulos.js";
import { avaliarChecklist, modulosDormentes, deveMostrarChecklist } from "./checklist.js";
import { contarCadastros, TETO } from "./dados.js";

// Mesmo turquesa da marca usado no resto da tela; as demais cores saem das
// variáveis de tema, para o card acompanhar claro/escuro.
const TURQUESA = "#22d3ee";

const ESTADO = {
  ok:            { icone: "✓", cor: "#34d399", rotulo: "cadastrado" },
  vazio:         { icone: "!", cor: "#fbbf24", rotulo: "nada cadastrado" },
  indeterminado: { icone: "?", cor: "var(--text-muted)", rotulo: "não foi possível conferir" },
};

function quantidade(item) {
  if (item.quantos == null) return "—";
  if (item.quantos >= TETO) return `${TETO}+`;
  return String(item.quantos);
}

export default function ChecklistImplantacao({ sb, perms, canEdit, onNav }) {
  const [contagens, setContagens] = useState(null);

  const puxar = useCallback(() => {
    if (!canEdit || typeof sb !== "function") return;
    contarCadastros(sb).then(setContagens);
  }, [sb, canEdit]);

  // Recarrega ao voltar o foco: quem sai daqui para cadastrar uma sala volta
  // e quer ver o item riscado, sem apertar F5.
  useEffect(() => {
    puxar();
    const onFocus = () => puxar();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [puxar]);

  const resumo = avaliarChecklist(contagens || {}, { perms });
  // Enquanto a primeira consulta não volta, não mostra nada: um card
  // dizendo "não foi possível conferir" que depois se corrige sozinho é
  // pior do que card nenhum — é o flash de carregamento que já me fez
  // reportar KPI falso na Farmácia.
  if (!contagens || !deveMostrarChecklist(resumo, canEdit)) return null;

  const dormentes = modulosDormentes(resumo.itens);
  const pendentes = resumo.visiveis.filter(i => i.estado !== "ok");
  const feitos = resumo.visiveis.filter(i => i.estado === "ok");

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderLeft: `4px solid ${TURQUESA}`, borderRadius: 10,
      padding: "1rem 1.25rem", marginBottom: "1.25rem",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Implantação — cadastros que destravam módulos</div>
        <span style={{
          fontSize: 11, fontWeight: 800, fontFamily: "JetBrains Mono, monospace",
          color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 99, padding: "1px 9px",
        }}>{resumo.feitos}/{resumo.total} feitos</span>
      </div>

      <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 14 }}>
        {dormentes.length > 0
          ? <>Sem estes cadastros, {dormentes.length === 1 ? "o módulo" : "os módulos"}{" "}
              <strong style={{ color: "var(--text-2)" }}>{dormentes.join(", ")}</strong>{" "}
              {dormentes.length === 1 ? "fica" : "ficam"} sem funcionar — a tela abre, mas vazia.</>
          : <>Não foi possível conferir todos os cadastros-base agora.</>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {pendentes.map(item => {
          const e = ESTADO[item.estado];
          const alvo = MODULO_POR_CHAVE[item.modulo];
          return (
            <div key={item.chave} style={{
              background: "var(--surface-2)", border: "1px solid var(--border)",
              borderRadius: 8, padding: "10px 13px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                <span style={{
                  width: 18, height: 18, borderRadius: 99, flexShrink: 0,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 800, color: "#0b1220", background: e.cor,
                }}>{e.icone}</span>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{item.label}</span>
                <span style={{ fontSize: 11.5, color: e.cor, fontWeight: 600 }}>{e.rotulo}</span>
                {onNav && (
                  <button onClick={() => onNav(item.modulo)} style={{
                    marginLeft: "auto", background: "transparent", color: TURQUESA,
                    border: `1px solid ${TURQUESA}66`, borderRadius: 6,
                    padding: "5px 13px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                    fontFamily: "Inter, sans-serif",
                  }}>Abrir {alvo?.label || item.modulo} →</button>
                )}
              </div>

              {item.estado === "vazio" ? (
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 7, lineHeight: 1.55 }}>
                  {item.porque}
                  <div style={{ marginTop: 4 }}>
                    <span style={{ color: "var(--text-muted)" }}>Onde cadastrar: </span>
                    <strong style={{ color: "var(--text-2)" }}>{item.onde}</strong>
                  </div>
                </div>
              ) : (
                // Incerto NÃO é acusação de cadastro faltando: pode ser
                // permissão de leitura ou consulta que não voltou. Dizer
                // "falta cadastrar" aqui mandaria a TI procurar algo que
                // talvez já exista.
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 7, lineHeight: 1.55 }}>
                  A consulta a <code style={{ fontFamily: "JetBrains Mono, monospace" }}>{item.tabela}</code> não
                  respondeu ou seu perfil não alcança esta tabela. Pode estar cadastrado — confira em {item.onde}.
                </div>
              )}
            </div>
          );
        })}

        {feitos.length > 0 && (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "var(--text-muted)", paddingTop: 2 }}>
            {feitos.map(item => (
              <span key={item.chave} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ color: "#34d399", fontWeight: 800 }}>✓</span>
                {item.label}
                <span style={{ fontFamily: "JetBrains Mono, monospace", color: "var(--text-3)" }}>({quantidade(item)})</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
