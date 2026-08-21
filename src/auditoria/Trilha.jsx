// ═══════════════════════════════════════════════════════════
// TELA DA TRILHA DE AUDITORIA — só desenho
//
// Substitui a tela que lia o `localStorage` do próprio navegador (200
// registros, diferentes para cada pessoa) enquanto anunciava "histórico de
// todas as alterações realizadas na plataforma".
//
// Três coisas que esta tela faz e a anterior não fazia:
//   • lê a trilha institucional, a mesma para todo mundo;
//   • distingue "não há registro" de "não consegui perguntar";
//   • diz quantos registros têm autoria garantida pelo banco — porque os
//     antigos, gravados antes da coluna existir, não têm o mesmo valor.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { carregarTrilha, PAGINA } from "./dados.js";
import {
  normalizar, estadoDaTrilha, filtrarLocal, acoesDistintas,
  resumo, periodoCoberto,
} from "./trilha.js";

const TURQUESA = "#22d3ee";

export default function Trilha({ sb }) {
  const [linhas, setLinhas] = useState(undefined);   // undefined = ainda carregando
  const [temMais, setTemMais] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [texto, setTexto] = useState("");
  const [acao, setAcao] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  const buscar = useCallback(async (opts = {}, acumular = false) => {
    if (typeof sb !== "function") return;
    setCarregando(true);
    const r = await carregarTrilha(sb, opts);
    setCarregando(false);
    setTemMais(r.temMais);
    if (r.linhas == null) { setLinhas(acumular ? (l => l) : null); return; }
    const novas = r.linhas.map(normalizar);
    setLinhas(prev => (acumular && Array.isArray(prev) ? [...prev, ...novas] : novas));
  }, [sb]);

  useEffect(() => { buscar({}); }, [buscar]);

  function aplicarFiltro() { buscar({ texto, acao, de, ate }); }
  function limpar() { setTexto(""); setAcao(""); setDe(""); setAte(""); buscar({}); }
  function maisAntigos() {
    const ids = (linhas || []).map(l => l.id).filter(v => v != null);
    if (!ids.length) return;
    buscar({ texto, acao, de, ate, antesDeId: Math.min(...ids) }, true);
  }

  const filtrando = !!(texto || acao || de || ate);
  const visiveis = Array.isArray(linhas) ? filtrarLocal(linhas, { texto, acao }) : [];
  const estado = estadoDaTrilha({ linhas, filtrando });
  const r = resumo(visiveis);
  const periodo = periodoCoberto(r);

  const inp = {
    background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6,
    padding: "7px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none",
  };
  const th = {
    textAlign: "left", padding: "10px 14px", color: "var(--text-muted)", fontSize: 11,
    fontWeight: 700, textTransform: "uppercase", borderBottom: "1px solid var(--border)", background: "var(--bg-2)",
  };

  return (
    <div style={{ padding: "1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Trilha de Auditoria</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: "1.25rem", maxWidth: "72ch", lineHeight: 1.5 }}>
        Registro institucional de quem fez o quê, lido do banco — o mesmo para todos os computadores.
        O histórico não pode ser alterado nem apagado por ninguém, inclusive pela administração.
      </div>

      {/* FILTROS */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <label style={{ display: "block", fontSize: 10.5, color: "var(--text-muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: ".05em" }}>Usuário ou alvo</label>
          <input value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => e.key === "Enter" && aplicarFiltro()}
            placeholder="ex.: Laura, leito 203" style={{ ...inp, width: 230 }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 10.5, color: "var(--text-muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: ".05em" }}>Ação</label>
          <select value={acao} onChange={e => setAcao(e.target.value)} style={{ ...inp, minWidth: 170 }}>
            <option value="">Todas</option>
            {acoesDistintas(Array.isArray(linhas) ? linhas : []).map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 10.5, color: "var(--text-muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: ".05em" }}>De</label>
          <input type="date" value={de} onChange={e => setDe(e.target.value)} style={inp} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 10.5, color: "var(--text-muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: ".05em" }}>Até</label>
          <input type="date" value={ate} onChange={e => setAte(e.target.value)} style={inp} />
        </div>
        <button onClick={aplicarFiltro} disabled={carregando}
          style={{ background: TURQUESA, color: "#000", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
          {carregando ? "…" : "Buscar"}
        </button>
        {filtrando && (
          <button onClick={limpar} style={{ background: "transparent", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 14px", cursor: "pointer", fontSize: 13 }}>
            Limpar
          </button>
        )}
      </div>

      {/* RESUMO — o que está em tela, e o que NÃO está */}
      {estado === "ok" && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "var(--text-muted)", marginBottom: 12, alignItems: "center" }}>
          <span><strong style={{ color: "var(--text)", fontFamily: "JetBrains Mono, monospace" }}>{r.total}</strong> registro(s) em tela</span>
          <span><strong style={{ color: "var(--text-2)" }}>{r.usuarios}</strong> usuário(s)</span>
          {periodo && <span>período {periodo}</span>}
          {/* Distinguir o que tem autoria garantida do que não tem é o
              ponto da trilha: registro antigo vale como histórico, não
              como prova de quem foi. */}
          <span title="Autoria carimbada pelo banco, não digitada pelo cliente"
            style={{ color: r.atribuidos === r.total ? "#34d399" : "#d97706", fontWeight: 600 }}>
            {r.atribuidos}/{r.total} com autoria verificada
          </span>
          {temMais && <span style={{ color: "#d97706" }}>há registros mais antigos não carregados</span>}
        </div>
      )}

      {/* ESTADOS */}
      {estado === "indeterminado" && (
        // 🔴 O estado que a tela anterior não tinha. Dizer "nenhum registro"
        // aqui faria quem investiga um incidente concluir que a ação não
        // aconteceu — quando a pergunta é que não chegou a ser feita.
        <div style={{ background: "var(--surface)", border: "1px solid #f43f5e55", borderLeft: "3px solid #f43f5e", borderRadius: 8, padding: "1rem 1.2rem", color: "var(--text-2)", fontSize: 13, lineHeight: 1.55 }}>
          <strong>Não foi possível ler a trilha.</strong> A consulta falhou ou seu perfil não alcança o módulo de auditoria.
          <div style={{ color: "var(--text-muted)", marginTop: 6 }}>
            Isto <strong>não</strong> significa que não há registros — significa que não foi possível perguntar. Tente de novo ou fale com a TI.
          </div>
        </div>
      )}

      {linhas === undefined && (
        <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem" }}>Carregando a trilha…</div>
      )}

      {(estado === "vazia" || estado === "sem-resultado") && (
        <div style={{ background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 8, padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
          {estado === "sem-resultado"
            ? "Nenhum registro encontrado para este filtro."
            : "A trilha ainda não tem registros."}
        </div>
      )}

      {estado === "ok" && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 640 }}>
              <thead><tr>{["Data/Hora", "Usuário", "Ação", "Alvo"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {visiveis.map(l => (
                  <tr key={l.id} style={{ borderBottom: "1px solid var(--surface-3)" }}>
                    <td style={{ padding: "8px 14px", fontFamily: "JetBrains Mono, monospace", color: "var(--text-3)", fontSize: 11, whiteSpace: "nowrap" }}>
                      {l.ts ? new Date(l.ts).toLocaleString("pt-BR") : "—"}
                    </td>
                    <td style={{ padding: "8px 14px", fontWeight: 600, color: TURQUESA, whiteSpace: "nowrap" }}>
                      {l.usuario}
                      {!l.usuarioId && (
                        <span title="Registro anterior ao carimbo de autoria pelo banco — vale como histórico, não como prova de quem foi"
                          style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, color: "var(--text-muted)", border: "1px solid var(--border-2)", borderRadius: 99, padding: "0 6px" }}>
                          sem autoria
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "8px 14px" }}>
                      <span style={{ background: "#0e4f5f", color: TURQUESA, borderRadius: 99, padding: "2px 8px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{l.acao}</span>
                    </td>
                    <td style={{ padding: "8px 14px", color: "var(--text)", fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>{l.alvo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {temMais && (
            <div style={{ padding: "10px", textAlign: "center", borderTop: "1px solid var(--border)" }}>
              <button onClick={maisAntigos} disabled={carregando}
                style={{ background: "transparent", color: TURQUESA, border: "1px solid var(--border-2)", borderRadius: 6, padding: "7px 18px", cursor: "pointer", fontSize: 12.5, fontWeight: 600, fontFamily: "Inter, sans-serif" }}>
                {carregando ? "Carregando…" : `Carregar mais ${PAGINA} registros antigos`}
              </button>
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 14, lineHeight: 1.55, maxWidth: "76ch" }}>
        O detalhe de cada ação (motivo, valores alterados) fica gravado apenas no computador onde a ação
        aconteceu e <strong>não é enviado ao servidor</strong> — decisão deliberada para não acumular fragmento
        clínico nesta tabela, que é de leitura ampla. Levar esse detalhe para a trilha institucional é decisão
        de LGPD ainda em aberto.
      </div>
    </div>
  );
}
