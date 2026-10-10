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
import { jaOperou, linhaDoAntecedente, resumoDaDescricao, versaoVigente } from "../bloco/descricao.js";
import { fichaVigente, resumoDaFicha, viaAereaDificilPregressa } from "../bloco/anestesia.js";
import { totalAldrete, ultimaAvaliacao } from "../bloco/aldrete.js";
import { diaLocal, horaFmt } from "../util/datas.js";

/** A equipe de UMA cirurgia, da lista que veio junto com o paciente. */
export function equipeDe(d, cirurgiaId) {
  return (d?.equipeCirurgias || []).filter(m => String(m.cirurgia_id) === String(cirurgiaId));
}

/**
 * A descrição VIGENTE de uma cirurgia. Versão corrigida não é a que vale —
 * mostrar a antiga no prontuário seria mostrar o que o cirurgião retificou.
 */
export function descricaoVigenteDe(d, cirurgiaId) {
  const minhas = (d?.descricoesCirurgias || [])
    .filter(x => String(x.cirurgia_id) === String(cirurgiaId));
  return versaoVigente(minhas) || null;
}

/**
 * O ANTECEDENTE CIRÚRGICO do paciente — o que o médico que atende seis
 * meses depois procura, da cirurgia mais recente para a mais antiga.
 */
/** A ficha anestésica VIGENTE de uma cirurgia. */
export function fichaAnestesicaDe(d, cirurgiaId) {
  const minhas = (d?.fichasAnestesicas || [])
    .filter(x => String(x.cirurgia_id) === String(cirurgiaId));
  return fichaVigente(minhas) || null;
}

/**
 * 🔴 A ficha que registrou VIA AÉREA DIFÍCIL, se houver alguma na vida
 * deste paciente. Só as VIGENTES contam: uma versão que dizia "difícil"
 * e foi retificada não pode alarmar para sempre.
 */
export function viaAereaDificilDoPaciente(d) {
  const vigentes = (d?.cirurgias || [])
    .map(c => fichaAnestesicaDe(d, c.id))
    .filter(Boolean);
  return viaAereaDificilPregressa(vigentes);
}

/**
 * Como o paciente SAIU da recuperação pós-anestésica.
 *
 * 🔴 Devolve também o caso que mais interessa a quem lê depois: a
 * cirurgia que saiu da RPA SEM escore nenhum. Essas são históricas — o
 * gatilho só vale daqui para a frente —, e mostrá-las como ausência é o
 * oposto de deixá-las parecendo recuperação tranquila.
 */
export function altaDaRpaDe(d, cirurgia) {
  if (!cirurgia?.rpa_saida_em) return null;
  const minhas = (d?.aldreteRpa || [])
    .filter(x => String(x.cirurgia_id) === String(cirurgia.id));
  const ultima = ultimaAvaliacao(minhas);
  if (!ultima) return { semEscore: true };
  const totais = minhas.map(totalAldrete).filter(t => t != null);
  return {
    semEscore: false,
    alta: totalAldrete(ultima),
    pior: totais.length ? Math.min(...totais) : null,
    avaliacoes: minhas.length,
  };
}

export function antecedenteCirurgico(d) {
  const linhas = (d?.cirurgias || [])
    .map(c => linhaDoAntecedente({
      cirurgia: c, equipe: equipeDe(d, c.id), descricao: descricaoVigenteDe(d, c.id),
    }));
  const porDiaDesc = (a, b) => String(b.dia || "").localeCompare(String(a.dia || ""));
  const porDiaAsc = (a, b) => String(a.dia || "").localeCompare(String(b.dia || ""));

  // 🔴 ANTECEDENTE É PASSADO — achado caminhando pelo demo (09/10/2026).
  //
  // Ordenado só por data, uma cirurgia AGENDADA para dezembro encabeçava a
  // seção e aparecia ACIMA da que realmente aconteceu. Quem bate o olho lê
  // "este paciente fez uma colecistectomia" — e não fez: está marcada.
  //
  // Três blocos, nesta ordem: o que ACONTECEU (mais recente primeiro, que é
  // o que se procura numa anamnese), depois o que está MARCADO (a mais
  // próxima primeiro, que é a que importa) e por fim o que foi cancelado.
  return [
    ...linhas.filter(l => !l.cancelada && !l.semAto).sort(porDiaDesc),
    ...linhas.filter(l => l.semAto).sort(porDiaAsc),
    ...linhas.filter(l => l.cancelada).sort(porDiaDesc),
  ];
}

/**
 * Quantas cirurgias o paciente de fato FEZ.
 *
 * O título da seção contava as três listas juntas, então "(3)" incluía uma
 * agendada e uma cancelada. Número de antecedente cirúrgico é dado de
 * anamnese: contar o que não aconteceu infla o histórico do paciente.
 */
export function quantasOperou(linhas = []) {
  return linhas.filter(l => !l.cancelada && !l.semAto).length;
}

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
  // ── CIRURGIA ────────────────────────────────────────────────
  // 🔴 Faltava inteira até 10/2026. A linha do tempo mostrava PS, leito,
  // SCIH e evolução — e um paciente operado aparecia como paciente que
  // nunca entrou em sala.
  (d.cirurgias || []).forEach(c => {
    if (c.status === "cancelada") {
      // Cirurgia cancelada ENTRA, e não é detalhe: cancelamento por jejum
      // inadequado ou por condição clínica é história do paciente, e é o que
      // explica por que ele voltou três semanas depois.
      push(c.cancelado_em || (c.data ? c.data + "T12:00:00" : null), "Bloco", "#f43f5e",
        `Cirurgia CANCELADA: ${c.procedimento || "—"}`, c.cancelamento_motivo || null);
      return;
    }
    const desc = descricaoVigenteDe(d, c.id);
    const fichaAnest = fichaAnestesicaDe(d, c.id);
    const rpa = altaDaRpaDe(d, c);
    const l = linhaDoAntecedente({ cirurgia: c, equipe: equipeDe(d, c.id), descricao: desc });
    const quando = c.inicio_cirurgia_em || c.entrada_sala_em
      || (c.data ? c.data + "T12:00:00" : null);
    const detalhe = [
      l.via ? `via ${l.via.toLowerCase()}` : null,
      l.convertida ? "CONVERTIDA" : null,
      l.cirurgiao ? `cirurgião: ${l.cirurgiao}` : null,
      l.cid_pos ? `CID pós-op ${l.cid_pos}` : null,
      fichaAnest ? resumoDaFicha(fichaAnest) : null,
      // A recuperação só vira linha quando teve percalço ou quando o
      // registro falta: "saiu com 10/10" em toda cirurgia seria ruído,
      // e ruído é o que faz parar de ler a linha do tempo.
      rpa && rpa.semEscore ? "saiu da RPA SEM escore de Aldrete registrado" : null,
      rpa && !rpa.semEscore && rpa.pior != null && rpa.pior < 9
        ? `RPA: ${rpa.avaliacoes} avaliações, pior Aldrete ${rpa.pior}/10, alta com ${rpa.alta}/10` : null,
      l.intercorrencias ? `intercorrências: ${l.intercorrencias}` : null,
      // ⚠️ A ausência do documento aparece COMO ausência. Cirurgia feita sem
      // descrição é buraco no prontuário, não "cirurgia sem nada a relatar".
      jaOperou(c) && !l.temDescricao ? "SEM descrição cirúrgica registrada" : null,
    ].filter(Boolean).join(" · ") || null;
    if (jaOperou(c)) push(quando, "Bloco", "#8b5cf6", `Cirurgia: ${l.procedimento}`, detalhe);
    else push(quando, "Bloco", "#8d99ab", `Cirurgia AGENDADA: ${c.procedimento || "—"}`, c.sala || null);
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

  // 🔴 VIA AÉREA DIFÍCIL — o alerta que precede qualquer anestesia futura.
  // Não é alerta do episódio: é da PESSOA, e por isso não tem prazo de
  // validade nem gatilho estreito como os de cima. Intubação difícil não
  // avisada é a emergência que mata na indução, e o manejo que funcionou
  // vai junto — saber que vai ser difícil sem saber o que resolveu é meio
  // aviso.
  {
    const f = viaAereaDificilDoPaciente(d);
    if (f) {
      alertas.push({
        cor: "#f43f5e",
        texto: "VIA AÉREA DIFÍCIL em anestesia anterior"
          + (f.via_aerea_manejo ? " — " + f.via_aerea_manejo : ""),
      });
    }
  }

  // ── CIRURGIA ────────────────────────────────────────────────
  // Gatilho estreito, como os de cima: só o que ainda está em curso e só o
  // buraco documental que alguém precisa fechar. Listar as oito cirurgias da
  // vida do paciente aqui faria a sentinela virar paisagem.
  (d.cirurgias || []).forEach(c => {
    if (c.status === "em_cirurgia")
      alertas.push({ cor: "#8b5cf6", texto: `Paciente está EM CIRURGIA agora (${c.procedimento || "procedimento não informado"})` });
    else if (c.status === "recuperacao")
      alertas.push({ cor: "#d97706", texto: `Paciente está na recuperação pós-anestésica (RPA)` });
    else if (c.status === "concluida" && !c.descricao_em)
      // 🔴 A descrição cirúrgica é exigência legal (CFM 1.638/2002), e a
      // falta dela não aparece em lugar nenhum até alguém pedir o prontuário
      // — o que costuma ser uma auditoria ou um processo.
      alertas.push({ cor: "#f43f5e", texto: `Cirurgia de ${fmtDiaCurto(c.data)} SEM descrição cirúrgica registrada` });
  });
  return alertas;
}

/** Dia no formato curto brasileiro, ou "—" quando não há dia. */
function fmtDiaCurto(dia) {
  const d = diaLocal(dia);
  if (!d) return "—";
  const [a, m, x] = d.split("-");
  return `${x}/${m}/${a}`;
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

  // 🔴 ANTECEDENTE CIRÚRGICO — entra na passagem de plantão porque é risco
  // anestésico e é diagnóstico diferencial. A mais recente com detalhe; o
  // resto como contagem, para a frase não virar um parágrafo.
  const cirs = antecedenteCirurgico(dados).filter(c => !c.cancelada && !c.semAto);
  if (cirs.length) {
    const u = cirs[0];
    frases.push(`Antecedente cirúrgico: ${cirs.length} cirurgia(s) no sistema; a mais recente`
      + `${u.dia ? ` em ${fmtDiaCurto(u.dia)}` : ""} — ${resumoDaDescricao(u)}.`
      + (u.temDescricao ? "" : " ⚠️ SEM descrição cirúrgica registrada."));
  }

  // Última evolução
  const ultEv = dados.evolucoes[0];
  if (ultEv) frases.push(`Última evolução (${TIPOS_EVOLUCAO[ultEv.tipo]?.label.toLowerCase() || ultEv.tipo}, ${horaFmt(ultEv.criado_em)}, por ${ultEv.usuario || "?"}): "${ultEv.texto.length > 220 ? ultEv.texto.slice(0, 220) + "…" : ultEv.texto}"`);

  // Pendências
  if (alertas.length) frases.push(`Pendências e alertas: ${alertas.map(a => a.texto.toLowerCase()).join("; ")}.`);
  else frases.push("Sem pendências ou alertas ativos no momento.");

  return frases.join(" ");
}
