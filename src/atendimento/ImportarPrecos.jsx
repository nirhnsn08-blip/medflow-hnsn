// ═══════════════════════════════════════════════════════════
// IMPORTAR TABELA DE PREÇO — a tela
//
// Duas etapas, e a ordem é a razão de existir da tela:
//
//   1. CONFERIR  lê o texto colado e mostra o que aconteceria. Não grava.
//   2. GRAVAR    só depois que alguém olhou.
//
// 🔴 UMA IMPORTAÇÃO QUE GRAVA DIRETO É PIOR QUE NENHUMA. O erro típico não
// é a linha que falha — é a tabela inteira que entra plausível e errada
// (dividida por cem, com a coluna do total no lugar da do unitário). Nada
// disso dá erro. Só aparece meses depois, na glosa.
//
// ⚠️ A GRAVAÇÃO PODE PARAR NO MEIO, e a tela DIZ onde parou. O banco tem um
// `EXCLUDE` de vigência que recusa linha a linha; se a 174 for recusada, as
// 173 anteriores já estão dentro. Fingir "deu erro" ali apagaria da vista o
// fato de que metade da tabela foi gravada.
//
// As regras estão em `importar-precos.js`, testadas por mutação.
// ═══════════════════════════════════════════════════════════

import { useState, useMemo } from "react";
import { analisarImportacao, paraGravar, ENTRA } from "./importar-precos.js";
import { salvarPreco } from "./dados.js";
import { reais, centavos } from "./faturamento.js";

const brl = v => reais(centavos(v));

const cx = {
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 13, padding: "16px 18px", marginBottom: 18 },
  rotulo: { fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-muted)" },
  input: { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", color: "var(--text)", fontSize: 14, width: "100%", boxSizing: "border-box", fontFamily: "inherit" },
  aviso: { background: "#7f1d1d22", border: "1px solid #ef444455", borderRadius: 8, padding: "10px 14px", fontSize: 12.5, color: "#fca5a5" },
};

const EXEMPLO = [
  "Código\tDescrição\tValor",
  "10101012\tConsulta em consultório\t120,00",
  "40304361\tHemograma completo\t18,50",
].join("\n");

const TABELAS = ["", "sigtap", "tuss", "cbhpm", "proprio"];

export default function ImportarPrecos({ sb, currentUser, precos, convenios, onPronto, onCancelar }) {
  const [convenioId, setConvenioId] = useState("");
  const [ini, setIni] = useState("");
  const [fim, setFim] = useState("");
  const [tabela, setTabela] = useState("");
  const [texto, setTexto] = useState("");
  const [plano, setPlano] = useState(null);
  const [gravando, setGravando] = useState(false);
  const [andamento, setAndamento] = useState(null);
  const [resultado, setResultado] = useState(null);

  const conv = Number(convenioId) || null;

  // ⚠️ O plano é recalculado ao clicar em Conferir, não a cada tecla: uma
  // tabela de 400 linhas reanalisada a cada caractere trava o campo. E o
  // plano precisa ser um ATO, não algo que muda embaixo de quem lê.
  function conferir() {
    setResultado(null);
    setPlano(analisarImportacao({
      texto, convenioId: conv, vigenciaInicio: ini, vigenciaFim: fim || null,
      precosExistentes: precos, tabelaPadrao: tabela || null,
    }));
  }

  // 🔴 Sequencial de propósito. Em paralelo, o `EXCLUDE` do banco decidiria
  // qual de dois códigos iguais entra pela ordem de chegada da rede, e a
  // tela não teria como dizer onde parou.
  async function gravar() {
    if (!plano?.ok || gravando) return;
    const fila = paraGravar(plano, { convenioId: conv, vigenciaInicio: ini, vigenciaFim: fim || null });
    setGravando(true); setResultado(null);
    let feitas = 0;
    for (const [i, linha] of fila.entries()) {
      setAndamento({ i: i + 1, de: fila.length });
      const r = await salvarPreco(sb, linha, currentUser);
      if (!r.ok) {
        setGravando(false); setAndamento(null);
        // ⚠️ O número de gravadas vem ANTES do motivo. É o que muda o que a
        // pessoa faz agora: importar de novo o arquivo inteiro duplicaria.
        setResultado({
          ok: false, gravadas: feitas, total: fila.length,
          codigo: linha.codigo,
          motivo: r.motivo || "O banco não gravou e não disse por quê.",
        });
        return;
      }
      feitas++;
    }
    setGravando(false); setAndamento(null);
    setResultado({ ok: true, gravadas: feitas, total: fila.length });
    setPlano(null); setTexto("");
    onPronto?.();
  }

  const r = plano?.resumo;
  const recusadas = useMemo(() => (plano?.linhas || []).filter(l => l.situacao !== ENTRA), [plano]);

  return (
    <section style={cx.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Importar tabela da operadora</div>
        <button onClick={onCancelar} style={{ background: "transparent", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 13px", cursor: "pointer", fontSize: 12 }}>Fechar</button>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
        Cole a planilha direto do Excel (ou um CSV). A primeira linha tem que ser o cabeçalho.
        <strong> Nada é gravado antes de você conferir.</strong>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 14 }}>
        <label>
          <div style={cx.rotulo}>Convênio</div>
          <select value={convenioId} onChange={e => { setConvenioId(e.target.value); setPlano(null); }} style={cx.input}>
            <option value="">Escolha…</option>
            {(convenios || []).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
        <label>
          <div style={cx.rotulo}>Vigência — início</div>
          <input type="date" value={ini} onChange={e => { setIni(e.target.value); setPlano(null); }} style={cx.input} />
        </label>
        <label>
          <div style={cx.rotulo}>Vigência — fim</div>
          <input type="date" value={fim} onChange={e => { setFim(e.target.value); setPlano(null); }} style={cx.input} />
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3 }}>Em branco = prazo indeterminado.</div>
        </label>
        <label>
          <div style={cx.rotulo}>Tabela (se a planilha não trouxer)</div>
          <select value={tabela} onChange={e => { setTabela(e.target.value); setPlano(null); }} style={cx.input}>
            {TABELAS.map(t => <option key={t} value={t}>{t || "—"}</option>)}
          </select>
        </label>
      </div>

      <div style={cx.rotulo}>Cole aqui</div>
      <textarea
        value={texto} onChange={e => { setTexto(e.target.value); setPlano(null); }}
        rows={8} spellCheck={false} placeholder={EXEMPLO}
        style={{ ...cx.input, fontFamily: "ui-monospace, monospace", fontSize: 12.5, marginTop: 4, marginBottom: 10, resize: "vertical" }} />

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={conferir} disabled={!texto.trim()} style={{
          background: texto.trim() ? "#2dd4bf" : "var(--surface-2)", color: texto.trim() ? "#062a26" : "var(--text-muted)",
          border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 700, cursor: texto.trim() ? "pointer" : "default", fontSize: 13,
        }}>Conferir</button>
        {plano?.ok && (
          <button onClick={gravar} disabled={gravando} style={{
            background: gravando ? "var(--surface-2)" : "#22c55e", color: gravando ? "var(--text-muted)" : "#052e16",
            border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 700, cursor: gravando ? "default" : "pointer", fontSize: 13,
          }}>
            {gravando && andamento ? `Gravando ${andamento.i} de ${andamento.de}…` : `Gravar ${r.entram} ${r.entram === 1 ? "preço" : "preços"}`}
          </button>
        )}
      </div>

      {/* Problemas que impedem a análise inteira (convênio, vigência, cabeçalho). */}
      {plano && plano.problemas?.length > 0 && (
        <div role="alert" style={{ ...cx.aviso, marginTop: 12 }}>
          {plano.problemas.map((p, i) => <div key={i}>{p}</div>)}
        </div>
      )}

      {r && r.lidas > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13, marginBottom: 10 }}>
            <span><strong style={{ color: "#22c55e" }}>{r.entram}</strong> entram</span>
            <span><strong style={{ color: r.recusadas ? "#f43f5e" : "var(--text-muted)" }}>{r.recusadas}</strong> recusadas</span>
            <span style={{ color: "var(--text-muted)" }}>de {r.lidas} lidas</span>
            <span style={{ color: "var(--text-muted)" }}>soma {brl(r.soma)}</span>
          </div>

          {/* 🔴 O aviso que evita a tabela dividida por mil. */}
          {r.ambiguas > 0 && (
            <div role="alert" style={{ ...cx.aviso, marginBottom: 10 }}>
              <strong>{r.ambiguas} {r.ambiguas === 1 ? "linha escreve o valor" : "linhas escrevem o valor"} de um jeito que não dá para ler com certeza</strong> —
              {" "}como <code>1.234</code>, que tanto pode ser mil duzentos e trinta e quatro quanto um e pouco.
              Não vou escolher por você: arrume o valor na planilha (escrevendo os centavos, <code>1.234,00</code>) e cole de novo.
            </div>
          )}

          {recusadas.length > 0 && (
            <div style={{ overflowX: "auto", maxHeight: 320, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--text-muted)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".05em", position: "sticky", top: 0, background: "var(--surface)" }}>
                    <th style={{ padding: "6px 8px" }}>Linha</th>
                    <th style={{ padding: "6px 8px" }}>Código</th>
                    <th style={{ padding: "6px 8px" }}>Valor lido</th>
                    <th style={{ padding: "6px 8px" }}>Por que não entra</th>
                  </tr>
                </thead>
                <tbody>
                  {recusadas.map(l => (
                    <tr key={l.n} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "6px 8px", color: "var(--text-muted)" }}>{l.n}</td>
                      <td style={{ padding: "6px 8px", fontFamily: "ui-monospace, monospace" }}>{l.codigo || "—"}</td>
                      <td style={{ padding: "6px 8px", fontFamily: "ui-monospace, monospace" }}>{String(l.bruto ?? "—")}</td>
                      <td style={{ padding: "6px 8px", color: "#fca5a5" }}>{l.motivos.join(" ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {resultado && (
        <div role="status" style={{
          marginTop: 12, borderRadius: 8, padding: "10px 14px", fontSize: 12.5,
          background: resultado.ok ? "#052e1633" : "#7f1d1d22",
          border: `1px solid ${resultado.ok ? "#22c55e55" : "#ef444455"}`,
          color: resultado.ok ? "#86efac" : "#fca5a5",
        }}>
          {resultado.ok
            ? `${resultado.gravadas} ${resultado.gravadas === 1 ? "preço gravado" : "preços gravados"}.`
            : <>
                <strong>Parei no meio.</strong> {resultado.gravadas} de {resultado.total} já foram gravados
                {" "}e continuam no banco — não cole o arquivo inteiro de novo, ou eles duplicam.
                {" "}A gravação parou no código <code>{resultado.codigo}</code>: {resultado.motivo}
              </>}
        </div>
      )}
    </section>
  );
}
