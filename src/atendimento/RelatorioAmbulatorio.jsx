// ═══════════════════════════════════════════════════════════
// RELATÓRIO MENSAL DO AMBULATÓRIO
//
// Produção por especialidade, absenteísmo e ofertadas × realizadas — a
// pergunta que a gestão faz todo mês e que hoje se responde somando à mão o
// que alguém digitou.
//
// A FONTE É A AGENDA, NÃO A TABELA AGREGADA. A agregada (`atendimentos`) é
// o espelho: relatório que lê o espelho herda o erro de digitação que a aba
// Produção existe justamente para achar. Aqui os números são apurados do
// que aconteceu — grade, marcação, presença e falta.
//
// SOMENTE LEITURA. Não grava nada, não conclui nada e não decide nada.
//
// Impressão pelo `window.print()` nativo, mesmo padrão dos relatórios do
// PS, da farmácia e do SCIH: nenhum dado de paciente sai do navegador. E
// não há dado de paciente aqui — o relatório é agregado, sem nome nem
// prontuário, porque a pergunta da gestão é sobre capacidade, não sobre
// gente.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { producaoDoMes } from "./producao.js";
import { carregarAgendamentosDoPeriodo, carregarBloqueios } from "./dados.js";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
               "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const HOSPITAL = {
  sigla: import.meta.env?.VITE_HOSPITAL_SIGLA || "HNSN",
  nome: import.meta.env?.VITE_HOSPITAL_NOME || "Hospital Nossa Senhora de Navegantes",
};

const cartao = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.1rem 1.25rem", marginBottom: 14 };
const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none" };
const lbl = { fontSize: 10.5, color: "var(--text-muted)", display: "block", marginBottom: 3 };
const btn = (cor, ativo = true) => ({
  background: ativo ? cor : "var(--surface-2)", color: ativo ? "#000" : "var(--text-muted)",
  border: ativo ? "none" : "1px solid var(--border)", borderRadius: 6, padding: "7px 13px",
  fontWeight: 700, cursor: "pointer", fontSize: 12, whiteSpace: "nowrap",
});

const AREA = "amb-print";
const printStyles =
  `@media print { body * { visibility: hidden !important; } ` +
  `#${AREA}, #${AREA} * { visibility: visible !important; } ` +
  `#${AREA} { position: fixed; inset: 0; background: #fff !important; color: #111 !important; padding: 18px; } ` +
  `@page { size: A4 landscape; margin: 10mm; } }`;

/** Percentual que pode não existir. `null` vira "—", nunca "0%". */
const pct = v => (v == null ? "—" : `${v}%`);

export default function RelatorioAmbulatorio({ sb, grades = [], catalogoEspecialidades = [] }) {
  const agora = new Date();
  const [mes, setMes] = useState(agora.getMonth());
  const [ano, setAno] = useState(agora.getFullYear());
  const [agendamentos, setAgendamentos] = useState([]);
  const [bloqueios, setBloqueios] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    // Bordas montadas do próprio ano/mês, sem `toISOString()`: à noite no
    // Brasil ele devolveria o mês seguinte e o relatório de julho abriria
    // em agosto.
    const ultimo = new Date(ano, mes + 1, 0).getDate();
    const mm = String(mes + 1).padStart(2, "0");
    const de = `${ano}-${mm}-01`;
    const ate = `${ano}-${mm}-${String(ultimo).padStart(2, "0")}`;

    Promise.all([
      carregarAgendamentosDoPeriodo(sb, { de, ate }),
      carregarBloqueios(sb, { de, ate }),
    ]).then(([a, b]) => {
      if (!vivo) return;
      setAgendamentos(a); setBloqueios(b); setCarregando(false);
    });
    return () => { vivo = false; };
  }, [sb, ano, mes]);

  const r = producaoDoMes({ grades, agendamentos, bloqueios, ano, mes, catalogoEspecialidades });
  const geradoEm = new Date().toLocaleString("pt-BR");

  const th = { textAlign: "left", fontSize: 9, textTransform: "uppercase", letterSpacing: ".05em", color: "#64748b", padding: "5px 7px", borderBottom: "1.5px solid #e5e7eb", whiteSpace: "nowrap" };
  const td = { fontSize: 11.5, padding: "6px 7px", borderBottom: "1px solid #f1f5f9", fontFamily: "JetBrains Mono, monospace" };

  return (
    <div>
      <style>{printStyles}</style>

      <div style={cartao}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={lbl}>Mês</label>
            <select value={mes} onChange={e => setMes(+e.target.value)} style={inp}>
              {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Ano</label>
            <input type="number" value={ano} onChange={e => setAno(+e.target.value)} style={{ ...inp, width: 95 }} />
          </div>
          <button onClick={() => window.print()} style={{ ...btn("#34d399"), marginBottom: 1 }}>Imprimir / PDF</button>
          {carregando && <span style={{ fontSize: 12, color: "var(--text-muted)", paddingBottom: 8 }}>carregando…</span>}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 10, lineHeight: 1.55 }}>
          Apurado da <strong>agenda</strong>, não da tabela de produção digitada. O absenteísmo é calculado
          sobre quem tinha <strong>hora marcada</strong> — quem entra por ordem de chegada não pode faltar a
          nada, e incluí-lo diluiria o indicador que a gestão cobra.
        </div>
      </div>

      <div id={AREA} style={{ background: "#fff", color: "#111", borderRadius: 10, border: "1px solid #e5e7eb", padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                      borderBottom: "2px solid #e5e7eb", paddingBottom: 10, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a" }}>
              RELATÓRIO AMBULATÓRIO — {HOSPITAL.sigla}
            </div>
            <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 3 }}>
              {HOSPITAL.nome} · Valentrax Healthcare Operations · Produção, absenteísmo e ocupação de vagas
            </div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{MESES[mes]}/{ano}</div>
        </div>

        {/* ── totais do mês ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 16 }}>
          {[
            ["Ofertadas", r.total.ofertadas ?? 0, "#eff6ff", "#93c5fd", "#1d4ed8"],
            ["Realizadas", r.total.realizadas ?? 0, "#f0fdf4", "#86efac", "#16a34a"],
            ["Faltas", r.total.faltas ?? 0, "#fef2f2", "#fca5a5", "#dc2626"],
            ["Cancelados", r.total.cancelados ?? 0, "#f8fafc", "#e2e8f0", "#475569"],
            // 🔴 O NÚMERO QUE FALTAVA. A remarcação aparecia só como
            // "cancelado", ao lado de quem simplesmente desistiu — e o
            // hospital não tinha onde ler quantas vezes foi ELE que empurrou
            // o paciente, que é o único destes números sobre o qual ele
            // manda. O de dentro dos parênteses é a parte acionável.
            ["Remarcadas", `${r.total.remarcados ?? 0}${r.total.remarcadosPeloHospital ? ` (${r.total.remarcadosPeloHospital} pelo hospital)` : ""}`,
              "#eef2ff", "#c7d2fe", "#4338ca"],
            ["Absenteísmo", pct(r.total.absenteismo), "#fef9c3", "#fde047", "#a16207"],
            ["Ocupação", pct(r.total.ocupacao), "#f0fdfa", "#5eead4", "#0f766e"],
          ].map(([l, v, bg, bd, cor]) => (
            <div key={l} style={{ background: bg, border: `1px solid ${bd}`, borderRadius: 8, padding: "9px 11px" }}>
              <div style={{ fontSize: 8.5, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em" }}>{l}</div>
              <div style={{ fontSize: String(v).length > 6 ? 13 : 20, fontWeight: 800, color: cor,
                            fontFamily: "JetBrains Mono, monospace", lineHeight: 1.25 }}>{v}</div>
            </div>
          ))}
        </div>

        {/* ── por especialidade ── */}
        {r.porEspecialidade.length === 0 ? (
          <div style={{ fontSize: 12, color: "#64748b", padding: "1.2rem", border: "1px dashed #cbd5e1", borderRadius: 8 }}>
            Nenhuma grade nem agendamento em {MESES[mes]}/{ano}. Sem agenda no mês, não há o que apurar —
            e o número do painel, se houver, veio de digitação.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left" }}>Especialidade</th>
                <th style={th}>Dias</th>
                <th style={th}>Ofertadas</th>
                <th style={th}>Realizadas</th>
                <th style={th}>1ª cons.</th>
                <th style={th}>Retornos</th>
                <th style={th}>Faltas</th>
                <th style={th}>Absent.</th>
                <th style={th}>Ocup.</th>
                <th style={th}>Regulação</th>
                <th style={th}>Interna</th>
                <th style={th}>Chegada</th>
                <th style={th}>Meta</th>
                <th style={th}>% meta</th>
              </tr>
            </thead>
            <tbody>
              {r.porEspecialidade.map(e => (
                <tr key={e.especialidadeCod}>
                  <td style={{ ...td, fontFamily: "Inter, sans-serif", fontWeight: 700 }}>
                    {e.label}
                    {!e.id && <span style={{ fontWeight: 400, color: "#a16207", fontSize: 10 }}> · fora do painel</span>}
                  </td>
                  <td style={td}>{e.diasComGrade}</td>
                  <td style={td}>{e.ofertadas}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{e.realizadas}</td>
                  <td style={td}>{e.primeiras}</td>
                  <td style={td}>{e.retornos}</td>
                  <td style={td}>{e.faltas}</td>
                  <td style={{ ...td, color: e.absenteismo != null && e.absenteismo > 20 ? "#dc2626" : undefined, fontWeight: e.absenteismo != null && e.absenteismo > 20 ? 700 : 400 }}>
                    {pct(e.absenteismo)}
                  </td>
                  <td style={td}>{pct(e.ocupacao)}</td>
                  <td style={td}>{e.porOrigem.regulacao.realizadas}/{e.porOrigem.regulacao.marcados}</td>
                  <td style={td}>{e.porOrigem.interna.realizadas}/{e.porOrigem.interna.marcados}</td>
                  <td style={td}>{e.porOrigem.chegada.realizadas}</td>
                  <td style={td}>{e.meta ?? "—"}</td>
                  <td style={td}>{pct(e.pctMeta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ fontSize: 9.5, color: "#64748b", marginTop: 14, lineHeight: 1.6, borderTop: "1px solid #e5e7eb", paddingTop: 8 }}>
          <strong>Como ler:</strong> “Regulação” e “Interna” mostram <em>realizadas/marcadas</em> — a vaga tem
          dono, e a central que marca não é a mesma que o hospital. “Chegada” não tem denominador porque
          ninguém marca hora nela. Absenteísmo = faltas ÷ marcados com hora, apurado sobre o total do mês
          (a média dos percentuais diários seria puxada por um sábado com três pacientes).
          Especialidade “fora do painel” não tem meta pactuada e não entra na tabela de produção do
          Ambulatório. Este relatório não inclui emergências — elas não passam pela agenda.
          <br /><strong>“Remarcadas”</strong> conta as consultas <em>deste</em> mês que vieram de uma remarcação —
          a vaga desmarcada fica no mês de <em>origem</em>, contada ali como cancelada. Uma consulta empurrada
          de agosto para setembro aparece como cancelada em agosto e como remarcada em setembro: são as duas
          pontas do mesmo movimento, e nenhum mês as tem juntas.
          <br />Gerado em {geradoEm} · fonte: agenda do ambulatório (somente leitura).
        </div>
      </div>
    </div>
  );
}
