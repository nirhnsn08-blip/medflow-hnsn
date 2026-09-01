// ═══════════════════════════════════════════════════════════
// PAINEL — AS CONTAS DO BI AMBULATORIAL
//
// 🔴 `aggregateMes` É O DENOMINADOR DE QUASE TUDO NO PAINEL.
// Ele soma os lançamentos de um mês por especialidade. Somar um dia a
// mais ou a menos não aparece na tela como erro: aparece como produção,
// e produção errada vira meta batida ou meta perdida.
//
// ⚠️ `calcAlertas` é o banner do topo — aquele que diz "5 atenção". Ele
// é a primeira coisa que alguém lê ao entrar, e por isso o gatilho é
// estreito: avisar de tudo faria a faixa virar decoração.
// ═══════════════════════════════════════════════════════════

import { ESPECIALIDADES as SPECS } from "../ambulatorio/especialidades.js";
import { MONTHS } from "../ui/base.jsx";
import { fmt } from "../util/formato.js";
import { nowISO, diffMin } from "../util/datas.js";
export function aggregateMes(db, ano, mes, specId) {
  const prefix = `${ano}-${String(mes + 1).padStart(2, "0")}`;
  let r = { primeiras: 0, retornos: 0, ofertadas: 0, realizadas: 0, livres: 0, emergencias: 0, faltas: 0 };
  Object.entries(db).filter(([d]) => d.startsWith(prefix)).forEach(([, day]) => {
    const s = day[specId]; if (!s) return;
    Object.keys(r).forEach(k => { r[k] += s[k] || 0; });
  });
  return r;
}

export function aggregateAno(db, ano, specId) {
  return Array.from({ length: 12 }, (_, m) => {
    const d = aggregateMes(db, ano, m, specId);
    return { mes: m, ...d, total: d.primeiras + d.retornos + d.emergencias };
  });
}

// Comparativo mês vs mês anterior e mesmo mês ano anterior
export function comparativo(db, ano, mes, specId) {
  const cur  = aggregateMes(db, ano, mes, specId);
  const prev = mes > 0 ? aggregateMes(db, ano, mes - 1, specId) : aggregateMes(db, ano - 1, 11, specId);
  const ly   = aggregateMes(db, ano - 1, mes, specId);
  const total     = cur.primeiras + cur.retornos + cur.emergencias;
  const prevTotal = prev.primeiras + prev.retornos + prev.emergencias;
  const lyTotal   = ly.primeiras + ly.retornos + ly.emergencias;
  return {
    mesAtual: total, mesAnterior: prevTotal, mesAnteriorLabel: mes > 0 ? MONTHS[mes-1] : MONTHS[11],
    mesAnoAnterior: lyTotal, variacaoMes: prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : 0,
    variacaoAno: lyTotal > 0 ? ((total - lyTotal) / lyTotal) * 100 : 0,
  };
}

export function calcAlertas(db) {
  const now = new Date();
  const ano = now.getFullYear(), mes = now.getMonth();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const diaAtual  = now.getDate();
  const diasRestantes = diasNoMes - diaAtual;
  const alerts = [];

  SPECS.forEach(spec => {
    const m     = aggregateMes(db, ano, mes, spec.id);
    const total = m.primeiras + m.retornos + m.emergencias;
    const pct   = spec.metaM > 0 ? (total / spec.metaM) * 100 : 0;
    const ritmo = diaAtual > 0 ? total / diaAtual : 0;
    const proj  = Math.round(ritmo * diasNoMes);
    const txFalta = m.ofertadas > 0 ? (m.faltas / m.ofertadas) * 100 : 0;
    const txComp  = m.ofertadas > 0 ? (m.realizadas / m.ofertadas) * 100 : 0;

    // Alerta crítico: abaixo de 50% e estamos na 2ª quinzena
    if (pct < 50 && diaAtual > 15)
      alerts.push({ level: "critical", spec: spec.label, msg: `${spec.label} está em ${pct.toFixed(0)}% da meta mensal — risco alto de não atingir.`, color: spec.color });

    // Alerta warning: projeção abaixo da meta
    else if (proj < spec.metaM && pct < 80)
      alerts.push({ level: "warning", spec: spec.label, msg: `${spec.label}: projeção de fechamento ${fmt(proj)} vs meta ${fmt(spec.metaM)} (faltam ${diasRestantes} dias).`, color: spec.color });

    // Meta atingida — positivo
    else if (pct >= 100)
      alerts.push({ level: "success", spec: spec.label, msg: `${spec.label} atingiu 100% da meta mensal!`, color: spec.color });

    // Alta taxa de faltas
    if (txFalta > 20 && m.ofertadas > 0)
      alerts.push({ level: "warning", spec: spec.label, msg: `${spec.label}: taxa de faltas em ${txFalta.toFixed(0)}% — acima do limite de 20%.`, color: spec.color });

    // Baixo comparecimento
    if (txComp < 60 && m.ofertadas > 0)
      alerts.push({ level: "critical", spec: spec.label, msg: `${spec.label}: comparecimento baixo (${txComp.toFixed(0)}%). Revisar agendamentos.`, color: spec.color });
  });

  return alerts;
}

// Ocupação de um setor = SÓ os leitos ocupados (a fila de espera não conta —
// paciente aguardando ainda não está num leito). A fila vira um selo separado.
export function ocupacaoSetor(leitos, solicitacoes, setor) {
  const dele = leitos.filter(l => (l.setor || "") === setor.nome);
  const operacionais = dele.filter(l => l.status !== "interditado").length;
  const ocupados = dele.filter(l => l.status === "ocupado").length;
  const fila = (solicitacoes || []).filter(s => s.setor_destino === setor.nome);
  const aguardando = fila.length;
  // maior tempo de espera da fila deste setor (em minutos)
  const agora = nowISO();
  const maiorEsperaMin = fila.reduce((m, s) => { const d = diffMin(s.hora_pedido, agora); return d != null && d > m ? d : m; }, 0);
  const pct = operacionais > 0 ? Math.round((ocupados / operacionais) * 100) : null;
  const amar = setor.alerta_amarelo ?? 90, verm = setor.alerta_vermelho ?? 100;
  const cor = pct == null ? "var(--text-muted)" : pct >= verm ? "#f43f5e" : pct >= amar ? "#fbbf24" : "#34d399";
  return { operacionais, ocupados, aguardando, maiorEsperaMin, pct, cor, restringir: pct != null && pct >= verm };
}
