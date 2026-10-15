// ═══════════════════════════════════════════════════════════
// BLOCO CIRÚRGICO — INDICADORES
//
// A aba de indicadores do mês. Saiu do `BlocoPage.jsx` sem mudança.
//
// ⚠️ Lê o próprio período: é a única parte do módulo que não usa o dia
// do mapa, e por isso tem carga própria em vez de receber por prop.
// ═══════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { listaLida } from "../util/leitura.js";
import { MONTHS, MONTHS_FULL } from "../ui/base.jsx";
import { diffMin, fmtDur } from "../util/datas.js";
import { diasUteisNoMes } from "./agenda.js";


export function BlocoIndicadores({ sb, salasAtivas }) {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth());
  const [ano, setAno] = useState(now.getFullYear());
  const [rows, setRows] = useState([]);
  const [horasDia, setHorasDia] = useState(8);
  const [diasMes, setDiasMes] = useState(() => diasUteisNoMes(now.getFullYear(), now.getMonth()));

  useEffect(() => {
    const ini = `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
    const fim = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(new Date(ano, mes + 1, 0).getDate()).padStart(2, "0")}`;
    // A marca de falha sobrevive até a tela; quem desenha o painel decide
    // o que dizer. Antes isto virava `[]` e o mês sem leitura ficava
    // indistinguível do mês sem cirurgia.
    if (sb) sb(`cc_cirurgias?data=gte.${ini}&data=lte.${fim}&select=*`).then(r => setRows(listaLida(r)));
    setDiasMes(diasUteisNoMes(ano, mes));
  }, [mes, ano]);

  const inp = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none" };
  const secLbl = { fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 };
  const fmt1 = v => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));

  const concluidas = rows.filter(c => c.status === "concluida");
  const canceladas = rows.filter(c => c.status === "cancelada");
  const total = rows.length;
  const txCancel = total > 0 ? (canceladas.length / total) * 100 : null;

  // Ocupação de salas: minutos de sala usados ÷ minutos ofertados
  const minutosUsados = rows.reduce((a, c) => {
    const m = diffMin(c.entrada_sala_em, c.saida_sala_em);
    return a + (m != null && m > 0 ? m : 0);
  }, 0);
  const minutosOfertados = salasAtivas.length * diasMes * horasDia * 60;
  const ocupacao = minutosOfertados > 0 ? (minutosUsados / minutosOfertados) * 100 : null;

  // Tempos médios
  const media = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const tCirurgia = media(concluidas.map(c => diffMin(c.inicio_cirurgia_em, c.fim_cirurgia_em)).filter(v => v != null && v > 0));
  const tSala = media(concluidas.map(c => diffMin(c.entrada_sala_em, c.saida_sala_em)).filter(v => v != null && v > 0));
  const tRpa = media(concluidas.map(c => diffMin(c.rpa_entrada_em, c.rpa_saida_em)).filter(v => v != null && v > 0));

  // Adesão ao checklist de cirurgia segura
  const comChecklist = concluidas.filter(c => c.chk_sign_in && c.chk_time_out && c.chk_sign_out).length;
  const adesao = concluidas.length > 0 ? (comChecklist / concluidas.length) * 100 : null;

  // Cancelamentos por motivo
  const porMotivo = {};
  canceladas.forEach(c => { const m = (c.cancelamento_motivo || "Sem motivo registrado").replace(/^Outro: .*/, "Outro"); porMotivo[m] = (porMotivo[m] || 0) + 1; });
  const motivosOrd = Object.entries(porMotivo).sort((a, b) => b[1] - a[1]);

  // Produtividade por cirurgião
  const porCirurgiao = {};
  concluidas.forEach(c => {
    const nome = c.cirurgiao || "Sem cirurgião registrado";
    if (!porCirurgiao[nome]) porCirurgiao[nome] = { n: 0, min: 0, comTempo: 0 };
    porCirurgiao[nome].n++;
    const m = diffMin(c.inicio_cirurgia_em, c.fim_cirurgia_em);
    if (m != null && m > 0) { porCirurgiao[nome].min += m; porCirurgiao[nome].comTempo++; }
  });
  const cirurgioesOrd = Object.entries(porCirurgiao).sort((a, b) => b[1].n - a[1].n);
  const maxN = cirurgioesOrd.length ? cirurgioesOrd[0][1].n : 0;
  const maxMotivo = motivosOrd.length ? motivosOrd[0][1] : 0;

  const RateCard = ({ label, valor, unidade, cor, sub }) => (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${cor || "var(--border)"}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: cor || "var(--text)", fontFamily: "JetBrains Mono, monospace", marginTop: 3 }}>{valor}<span style={{ fontSize: 12, fontWeight: 600, marginLeft: 3, color: "var(--text-muted)" }}>{unidade}</span></div>
      {sub && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
  const Barra = ({ rotulo, valor, max, cor, extra }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 12, color: "var(--text-2)", width: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rotulo}</span>
      <div style={{ flex: 1, height: 14, background: "var(--surface-3)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: (max > 0 ? Math.max(3, (valor / max) * 100) : 0) + "%", height: "100%", background: cor, borderRadius: 99 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, width: 110, textAlign: "right", color: "var(--text)" }}>{extra}</span>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: "1.25rem" }}>
        <div><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 4 }}>Mês</div>
          <select value={mes} onChange={e => setMes(+e.target.value)} style={inp}>{MONTHS_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}</select></div>
        <div><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 4 }}>Ano</div>
          <input type="number" value={ano} onChange={e => setAno(+e.target.value)} style={{ ...inp, width: 90 }} /></div>
        <div><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 4 }}>Horas ofertadas/sala/dia</div>
          <input type="number" min="1" max="24" value={horasDia} onChange={e => setHorasDia(Number(e.target.value) || 8)} style={{ ...inp, width: 90 }} /></div>
        <div><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 4 }}>Dias considerados</div>
          <input type="number" min="1" max="31" value={diasMes} onChange={e => setDiasMes(Number(e.target.value) || 1)} style={{ ...inp, width: 80 }} /></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: "1.5rem" }}>
        <RateCard label="Cirurgias no mês" valor={total} unidade="" cor="#3b82f6" sub={`${concluidas.length} concluída(s)`} />
        <RateCard label="Ocupação de salas" valor={ocupacao != null ? fmt1(ocupacao) : "—"} unidade="%" cor={ocupacao == null ? "var(--border)" : ocupacao >= 75 ? "#34d399" : ocupacao >= 50 ? "#d97706" : "#f43f5e"} sub={`${fmtDur(minutosUsados)} usados · ${salasAtivas.length} sala(s) × ${diasMes}d × ${horasDia}h`} />
        <RateCard label="Taxa de cancelamento" valor={txCancel != null ? fmt1(txCancel) : "—"} unidade="%" cor={txCancel == null ? "var(--border)" : txCancel <= 5 ? "#34d399" : txCancel <= 10 ? "#d97706" : "#f43f5e"} sub={`${canceladas.length} cancelada(s)`} />
        <RateCard label="Adesão cirurgia segura" valor={adesao != null ? fmt1(adesao) : "—"} unidade="%" cor={adesao == null ? "var(--border)" : adesao >= 95 ? "#34d399" : "#d97706"} sub="concluídas com os 3 checklists" />
        <RateCard label="Tempo médio de cirurgia" valor={tCirurgia != null ? fmtDur(Math.round(tCirurgia)) : "—"} unidade="" cor="#6366f1" sub="incisão → fim" />
        <RateCard label="Tempo médio de sala" valor={tSala != null ? fmtDur(Math.round(tSala)) : "—"} unidade="" cor="#6366f1" sub="entrada → saída da sala" />
        <RateCard label="Tempo médio de RPA" valor={tRpa != null ? fmtDur(Math.round(tRpa)) : "—"} unidade="" cor="#d97706" sub="recuperação anestésica" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 12, marginBottom: "1.5rem" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
          <div style={secLbl}>Produtividade por cirurgião ({MONTHS[mes]})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {cirurgioesOrd.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>Nenhuma cirurgia concluída no mês.</div>}
            {cirurgioesOrd.map(([nome, d]) => (
              <Barra key={nome} rotulo={nome} valor={d.n} max={maxN} cor="#0d9488" extra={`${d.n} cir.${d.comTempo ? ` · méd ${fmtDur(Math.round(d.min / d.comTempo))}` : ""}`} />
            ))}
          </div>
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
          <div style={secLbl}>Cancelamentos por motivo ({MONTHS[mes]})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {motivosOrd.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>Nenhum cancelamento no mês.</div>}
            {motivosOrd.map(([motivo, n]) => (
              <Barra key={motivo} rotulo={motivo} valor={n} max={maxMotivo} cor="#e11d48" extra={`${n} (${fmt1((n / Math.max(canceladas.length, 1)) * 100)}%)`} />
            ))}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
        Ocupação = tempo de sala efetivamente usado (entrada → saída registradas) ÷ tempo ofertado (salas ativas × dias × horas). Ajuste "horas ofertadas" e "dias considerados" à realidade do seu bloco. Cirurgias sem tempos registrados não entram no cálculo de ocupação e médias.
      </div>
    </div>
  );
}
