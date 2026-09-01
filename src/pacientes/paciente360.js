// ═══════════════════════════════════════════════════════════
// PACIENTE 360 — LINHA DO TEMPO, SENTINELA E PASSAGEM DE PLANTÃO
//
// As três regras que montam a visão única do paciente, a partir do que
// cada módulo gravou: PS, leitos, SCIH, evoluções, alergias.
//
// 🔴 A SENTINELA É UM ALERTA CLÍNICO, e alerta clínico tem dois jeitos de
// falhar. Deixar de avisar que há vigilância SCIH ativa põe alguém no
// quarto sem precaução; avisar de tudo o tempo todo faz a pessoa parar de
// ler a lista — e aí o aviso que importava também não é lido.
//
// Por isso cada alerta aqui tem gatilho estreito: internação ALÉM da
// previsão (não perto dela), cultura sem resultado há 3 dias ou mais (não
// desde ontem), caso SCIH NÃO encerrado.
//
// ⚠️ `resumoLocalPaciente` é a passagem de plantão, e é gerada AQUI, no
// navegador: os dados do paciente não saem para serviço nenhum.
// ═══════════════════════════════════════════════════════════

import { atendimentoAberto } from "../atendimento/ciclo.js";
import { ISOLAMENTOS, precaucaoDe } from "../clinico/isolamento.js";
import { diasDesde, sinalLeito } from "../clinico/leitos.js";
import { MANCHESTER, PS_DESFECHOS, PS_EVOL_CATEGORIAS, fmtSinaisVitais } from "../ps/catalogo.js";
import { horaFmt } from "../util/datas.js";

export const TIPOS_EVOLUCAO = {
  evolucao_medica: { label: "Evolução médica",        cor: "#3b82f6" },
  enfermagem:      { label: "Evolução de enfermagem", cor: "#0d9488" },
  fisioterapia:    { label: "Fisioterapia",           cor: "#6366f1" },
  nutricao:        { label: "Nutrição",               cor: "#d97706" },
  anotacao:        { label: "Anotação administrativa", cor: "#8d99ab" },
};

// Monta a linha do tempo unificada a partir de todos os módulos
export function montarTimeline(d) {
  const ev = [];
  const push = (quando, modulo, cor, titulo, detalhe) => { if (quando) ev.push({ quando, modulo, cor, titulo, detalhe }); };
  d.ps.forEach(a => {
    push(a.chegada_em, "PS", "#6366f1", "Chegada no Pronto-Socorro", a.queixa || null);
    if (a.triagem_em) push(a.triagem_em, "PS", MANCHESTER[a.classificacao]?.cor || "#6366f1", `Triagem: ${MANCHESTER[a.classificacao]?.label || a.classificacao || "—"}`, fmtSinaisVitais(a) || null);
    if (a.atendimento_em) push(a.atendimento_em, "PS", "#6366f1", "Início do atendimento", null);
    if (a.desfecho_em) push(a.desfecho_em, "PS", PS_DESFECHOS[a.desfecho]?.cor || "#6366f1", `Desfecho no PS: ${PS_DESFECHOS[a.desfecho]?.label || a.desfecho}${a.setor_destino ? " → " + a.setor_destino : ""}`, a.observacao || null);
  });
  d.leitoAtual.forEach(l => {
    push(l.entrada_em || (l.data_internacao ? l.data_internacao + "T12:00:00" : null), "Internação", "#0d9488", `Internado no leito ${l.identificacao}${l.setor ? " (" + l.setor + ")" : ""} — em andamento`, [l.cid ? "CID " + l.cid : null, l.motivo].filter(Boolean).join(" · ") || null);
  });
  d.saidas.forEach(s => {
    push(s.data_internacao ? s.data_internacao + "T12:00:00" : null, "Internação", "#0d9488", `Internação no leito ${s.leito}`, [s.cid ? "CID " + s.cid : null, s.motivo].filter(Boolean).join(" · ") || null);
    push(s.data_alta ? s.data_alta + "T12:00:01" : null, "Internação", "#34d399", `Alta hospitalar${s.dias_permanencia != null ? ` — ${s.dias_permanencia}d de permanência` : ""}`, null);
  });
  d.scih.forEach(c => {
    if (c.data_coleta) push(c.data_coleta + "T12:00:00", "SCIH", "#d97706", "Cultura coletada", null);
    if (c.data_resultado) push(c.data_resultado + "T12:00:01", "SCIH", "#d97706", `Resultado de cultura: ${c.germe || "—"}${c.multirresistente ? " (multirresistente)" : ""}`, precaucaoDe(c.isolamento) ? "Isolamento " + ISOLAMENTOS[c.isolamento].label : null);
    else if (!c.data_coleta) push(c.criado_em, "SCIH", "#d97706", "Caso de vigilância SCIH aberto", c.germe || null);
  });
  d.evolucoes.forEach(e => {
    push(e.criado_em, TIPOS_EVOLUCAO[e.tipo]?.label || "Evolução", TIPOS_EVOLUCAO[e.tipo]?.cor || "#3b82f6", TIPOS_EVOLUCAO[e.tipo]?.label || e.tipo, e.texto);
  });
  (d.registrosPS || []).forEach(r => {
    if (r.tipo === "evolucao") { const ec = PS_EVOL_CATEGORIAS[r.categoria] || PS_EVOL_CATEGORIAS.medica; push(r.criado_em, "PS", ec.cor, ec.label + " no PS", r.texto); }
    else if (r.tipo === "prescricao") push(r.criado_em, "PS", "#6366f1", "Prescrição no PS", r.texto);
    else if (r.tipo === "exame") {
      push(r.criado_em, "PS", "#d97706", `Exame solicitado: ${r.texto}`, null);
      if (r.resultado_em) push(r.resultado_em, "PS", "#d97706", `Resultado de exame: ${r.texto}`, r.resultado || null);
    }
  });
  return ev.sort((a, b) => new Date(b.quando) - new Date(a.quando));
}

// Sentinela: alertas automáticos sobre o paciente
export function sentinelaPaciente(d) {
  const alertas = [];
  d.ps.filter(atendimentoAberto).forEach(a => alertas.push({ cor: "#f97316", texto: `Paciente está no PS agora (${a.status.replace(/_/g, " ")})` }));
  d.leitoAtual.forEach(l => {
    const s = sinalLeito(l.data_internacao, l.dias_previstos);
    if (s.restam != null && s.restam < 0) alertas.push({ cor: "#f43f5e", texto: `Internação ${Math.abs(s.restam)}d além da previsão de alta (leito ${l.identificacao})` });
  });
  d.scih.filter(c => c.status !== "encerrado").forEach(c => {
    alertas.push({ cor: "#d97706", texto: `Vigilância SCIH ativa${c.germe ? ": " + c.germe : ""}${precaucaoDe(c.isolamento) ? " · isolamento " + ISOLAMENTOS[c.isolamento].label : ""}` });
    if (c.data_coleta && !c.data_resultado) {
      const dias = diasDesde(c.data_coleta);
      if (dias != null && dias >= 3) alertas.push({ cor: "#fbbf24", texto: `Cultura coletada há ${dias}d sem resultado registrado` });
    }
  });
  return alertas;
}

// Resumo automático de passagem de plantão — gerado localmente, sem custo e
// sem serviço externo (os dados não saem do navegador).
export function resumoLocalPaciente(prontuario, dados, timeline, alertas) {
  const ini = dados?.cadastro?.iniciais || "O paciente";
  const idade = dados?.cadastro?.ano_nascimento ? `${new Date().getFullYear() - dados.cadastro.ano_nascimento} anos` : null;
  const frases = [];

  // Situação atual
  const psAberto = dados.ps.find(atendimentoAberto);
  if (dados.leitoAtual.length) {
    const l = dados.leitoAtual[0];
    const desde = l.data_internacao ? new Date(l.data_internacao + "T00:00:00").toLocaleDateString("pt-BR") : null;
    frases.push(`${ini}${idade ? ` (${idade})` : ""}, prontuário ${prontuario}, está internado no leito ${l.identificacao}${l.setor ? ` (${l.setor})` : ""}${desde ? ` desde ${desde}` : ""}${l.cid ? `, CID ${l.cid}` : ""}${l.motivo ? ` — ${l.motivo}` : ""}.`);
    const s = sinalLeito(l.data_internacao, l.dias_previstos);
    if (s.restam != null) frases.push(s.restam < 0 ? `A previsão de alta está vencida há ${Math.abs(s.restam)} dia(s).` : `A previsão de alta é em ${s.restam} dia(s).`);
  } else if (psAberto) {
    frases.push(`${ini}${idade ? ` (${idade})` : ""}, prontuário ${prontuario}, está no Pronto-Socorro (${psAberto.status.replace(/_/g, " ")})${psAberto.classificacao ? `, classificação ${MANCHESTER[psAberto.classificacao]?.label || psAberto.classificacao}` : ""}${psAberto.queixa ? `, queixa: ${psAberto.queixa}` : ""}.`);
  } else {
    frases.push(`${ini}${idade ? ` (${idade})` : ""}, prontuário ${prontuario}, não está internado nem em atendimento no momento.`);
  }

  // Histórico
  const nInt = dados.saidas.length + dados.leitoAtual.length;
  const nPS = dados.ps.length;
  if (nInt || nPS) {
    const ultAlta = dados.saidas[0];
    frases.push(`Histórico no sistema: ${nInt} internação(ões) e ${nPS} passagem(ns) pelo PS${ultAlta?.data_alta ? `; última alta em ${new Date(ultAlta.data_alta + "T00:00:00").toLocaleDateString("pt-BR")}${ultAlta.dias_permanencia != null ? ` após ${ultAlta.dias_permanencia} dia(s)` : ""}` : ""}.`);
  }

  // SCIH
  const scihAtivo = dados.scih.filter(c => c.status !== "encerrado");
  scihAtivo.forEach(c => {
    frases.push(`Vigilância SCIH ativa${c.germe ? `: ${c.germe}${c.multirresistente ? " (multirresistente)" : ""}` : ""}${precaucaoDe(c.isolamento) ? `, isolamento de ${ISOLAMENTOS[c.isolamento].label.toLowerCase()}` : ""}${c.antibiotico ? `, em uso de ${c.antibiotico}` : ""}.`);
  });

  // Última evolução
  const ultEv = dados.evolucoes[0];
  if (ultEv) frases.push(`Última evolução (${TIPOS_EVOLUCAO[ultEv.tipo]?.label.toLowerCase() || ultEv.tipo}, ${horaFmt(ultEv.criado_em)}, por ${ultEv.usuario || "?"}): "${ultEv.texto.length > 220 ? ultEv.texto.slice(0, 220) + "…" : ultEv.texto}"`);

  // Pendências
  if (alertas.length) frases.push(`Pendências e alertas: ${alertas.map(a => a.texto.toLowerCase()).join("; ")}.`);
  else frases.push("Sem pendências ou alertas ativos no momento.");

  return frases.join(" ");
}
