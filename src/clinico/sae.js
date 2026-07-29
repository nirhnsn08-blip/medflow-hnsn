// ═══════════════════════════════════════════════════════════
// SAE — motor puro do Processo de Enfermagem (Fase 1b)
//
// Funções puras e testáveis (sae.test.js). Nada de banco: recebe os dados
// que a camada já carregou e devolve derivação.
//
// O diferencial da SAE aqui é PUXAR do que já existe: as escalas da Fase 1a
// (Braden, Morse, dor, flebite, Glasgow, RASS), a lesão por pressão e os
// sinais vitais sugerem diagnósticos — a enfermeira confirma. E a prescrição
// de enfermagem reaproveita o aprazamento/checagem da prescrição médica
// (prontuario.js), para o técnico CHECAR o cuidado como checa a medicação.
// ═══════════════════════════════════════════════════════════

import { horariosDoDia, checarAprazamento } from "./prontuario.js";
import { intervencoesDoDiagnostico } from "./sae-catalogo.js";

const NIVEIS_RISCO = new Set(["amarelo", "laranja", "vermelho"]);
const pad2 = n => String(n).padStart(2, "0");
const arr = x => (Array.isArray(x) ? x : []);

/** A aferição mais recente de uma escala (por aferido_em/criado_em). */
export function ultimaEscala(escalas, tipo) {
  return arr(escalas)
    .filter(e => e.tipo === tipo)
    .sort((a, b) => new Date(b.aferido_em || b.criado_em || 0) - new Date(a.aferido_em || a.criado_em || 0))[0] || null;
}

const escalaEmRisco = e => !!e && (NIVEIS_RISCO.has(e.nivel) || false);
const ultimoSinal = sinais => {
  const lista = arr(sinais);
  if (!lista.length) return null;
  return [...lista].sort((a, b) =>
    new Date(b.aferido_em || b.criado_em || 0) - new Date(a.aferido_em || a.criado_em || 0))[0];
};

/**
 * Sugere diagnósticos NANDA a partir dos dados que JÁ EXISTEM no prontuário.
 * Devolve só sugestões cujo diagnóstico está no catálogo ativo (`idx`) — se o
 * ADM Master desativou um, ele simplesmente não é sugerido. É apoio: a
 * enfermeira decide. `ctx.pediatrico` troca a queda de adulto pela de criança.
 */
export function sugerirDiagnosticos(ctx = {}, idx = {}, opts = {}) {
  const { escalas, lpp, sinais } = ctx;
  const pediatrico = !!opts.pediatrico;
  const existe = id => idx?.porId?.has?.(id);
  const tituloDe = id => idx?.porId?.get?.(id)?.titulo || null;
  const achados = new Map();   // catalogo_id -> motivo (o primeiro vence)
  const add = (id, motivo) => { if (existe(id) && !achados.has(id)) achados.set(id, motivo); };

  const lppAtiva = arr(lpp).some(l => (l.status || "ativa") !== "cicatrizada");
  if (lppAtiva) add("dx_integridade_pele", "Lesão por pressão ativa notificada");

  const braden = ultimaEscala(escalas, "braden");
  if (!lppAtiva && escalaEmRisco(braden)) add("dx_risco_integridade_pele", `Braden ${braden.score} — ${braden.classificacao || "em risco"}`);

  const morse = ultimaEscala(escalas, "morse");
  if (escalaEmRisco(morse)) add(pediatrico ? "dx_risco_queda_crianca" : "dx_risco_queda_adulto", `Morse ${morse.score} — ${morse.classificacao || "em risco"}`);

  const dor = ultimaEscala(escalas, "dor");
  if (dor && Number(dor.score) >= 4) add("dx_dor_aguda", `Dor ${dor.score}/10 na última avaliação`);

  const flebite = ultimaEscala(escalas, "flebite");
  if (flebite && Number(flebite.score) >= 2) add("dx_risco_infeccao", `Flebite grau ${flebite.score} no acesso venoso`);

  const glasgow = ultimaEscala(escalas, "glasgow");
  if (glasgow && Number(glasgow.score) <= 8) add("dx_desobstrucao_vias_aereas", `Glasgow ${glasgow.score} — proteção de via aérea`);

  const rass = ultimaEscala(escalas, "rass");
  if (rass && Number(rass.score) >= 2) add(pediatrico ? "dx_risco_queda_crianca" : "dx_risco_queda_adulto", `RASS +${rass.score} — agitação`);

  const sv = ultimoSinal(sinais);
  if (sv) {
    if ((sv.spo2 != null && Number(sv.spo2) < 92) || (sv.fr != null && Number(sv.fr) > 24))
      add("dx_padrao_respiratorio", `Sinais: SpO2 ${sv.spo2 ?? "?"}%, FR ${sv.fr ?? "?"} irpm`);
    if (sv.temp != null && Number(sv.temp) >= 37.8)
      add("dx_hipertermia", `Temperatura ${sv.temp} °C na última aferição`);
  }

  return [...achados].map(([catalogo_id, motivo]) => ({ catalogo_id, titulo: tituloDe(catalogo_id), motivo }));
}

/**
 * Aprazamento de um cuidado: devolve os horários do dia como "HH:MM".
 * Reusa horariosDoDia (prescrição médica) — mesma regra de intervalo/SOS.
 */
export function aprazarItem(item, dataBase = new Date(), horaAncora = 6) {
  return horariosDoDia(item, dataBase, horaAncora).map(d => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`);
}

/**
 * Monta os itens de prescrição a partir dos diagnósticos escolhidos: puxa as
 * intervenções NIC ligadas no catálogo e aprazamento sugerido. Deduplica por
 * intervenção (uma NIC ligada a dois diagnósticos entra uma vez, ligada ao
 * primeiro). Rascunho editável — a enfermeira ajusta antes de assinar.
 */
export function montarItensPrescricao(diagnosticos, idx, opts = {}) {
  const dataBase = opts.dataBase || new Date();
  const horaAncora = opts.horaAncora ?? 6;
  const vistos = new Set();
  const itens = [];
  for (const dx of arr(diagnosticos)) {
    for (const nic of intervencoesDoDiagnostico(dx, idx)) {
      if (vistos.has(nic.id)) continue;
      vistos.add(nic.id);
      const p = nic.payload || {};
      const base = {
        catalogo_id: nic.id,
        codigo_nic: nic.codigo || null,
        descricao: nic.titulo,
        detalhe: arr(p.atividades).join("; ") || null,
        frequencia: p.frequencia || null,
        frequencia_dia: p.frequencia_dia ?? null,
        se_necessario: !!p.se_necessario,
        diagnostico_id: dx.id || null,
        catalogo_diagnostico: dx.catalogo_id || dx.id || null,
      };
      base.horarios = aprazarItem(base, dataBase, horaAncora);
      itens.push(base);
    }
  }
  return itens;
}

/** Converte ["HH:MM", …] nos instantes do dia `competencia` (Date). */
export function horariosParaData(horariosHHMM, competencia = new Date()) {
  const dia = new Date(competencia);
  return arr(horariosHHMM).map(hhmm => {
    const [h, m] = String(hhmm).split(":").map(Number);
    const d = new Date(dia);
    d.setHours(h || 0, m || 0, 0, 0);
    return d;
  });
}

/**
 * Cruza o cuidado prescrito com as checagens do técnico à beira-leito.
 * Reusa checarAprazamento adaptando a checagem (status "realizado",
 * executado_em) ao formato da administração de medicação.
 */
export function checarCuidados(item, checagens, opts = {}) {
  const competencia = opts.competencia || new Date();
  const agora = opts.agora || new Date();
  if (item?.se_necessario) return [];
  const horarios = horariosParaData(item?.horarios, competencia);
  const feitas = arr(checagens)
    .filter(c => c.item_id === item?.id && (c.status || "realizado") === "realizado")
    .map(c => ({ status: "administrado", administrado_em: c.executado_em || c.criado_em }));
  return checarAprazamento(horarios, feitas, agora);
}

/**
 * Panorama da SAE do episódio: diagnósticos ativos, cuidados prescritos e o
 * estado da checagem do dia (pendentes × atrasados). Alimenta o cartão-resumo.
 */
export function resumoSae({ diagnosticos, itens, checagens } = {}, opts = {}) {
  const ativos = arr(diagnosticos).filter(d => (d.status || "ativo") === "ativo");
  let pendentes = 0, atrasadas = 0;
  for (const item of arr(itens)) {
    for (const slot of checarCuidados(item, checagens, opts)) {
      if (slot.atrasado) atrasadas++;
      else if (slot.pendente) pendentes++;
    }
  }
  return {
    diagnosticosAtivos: ativos.length,
    cuidados: arr(itens).length,
    checagensPendentes: pendentes,
    checagensAtrasadas: atrasadas,
  };
}

/**
 * Lista de trabalho da checagem à beira-leito, por leito ocupado: os cuidados de
 * enfermagem da prescrição VIGENTE (a mais recente de cada paciente) e o estado
 * da checagem de hoje (pendentes × atrasados). Ordena do mais crítico (mais
 * atrasados) ao menos — é a fila de trabalho da enfermagem, como a checagem de
 * medicação do PS. Agregação pura, testável.
 */
export function montarChecagemSae(leitosOcupados, prescricoes, itens, checagens, agora = new Date()) {
  const ultimaPresc = {};
  arr(prescricoes).forEach(p => {
    if (!p?.prontuario) return;
    const cur = ultimaPresc[p.prontuario];
    if (!cur || new Date(p.criado_em || 0) > new Date(cur.criado_em || 0)) ultimaPresc[p.prontuario] = p;
  });
  const itensPorPresc = {};
  arr(itens).forEach(i => { if (i?.prescricao_id) (itensPorPresc[i.prescricao_id] ||= []).push(i); });

  return arr(leitosOcupados).map(le => {
    const presc = ultimaPresc[le.prontuario];
    const its = presc ? (itensPorPresc[presc.id] || []) : [];
    let pendentes = 0, atrasados = 0;
    const atrasadosLista = [];
    for (const item of its) {
      for (const s of checarCuidados(item, checagens, { competencia: agora, agora })) {
        if (s.atrasado) { atrasados++; atrasadosLista.push({ descricao: item.descricao, horario: s.horario }); }
        else if (s.pendente) pendentes++;
      }
    }
    atrasadosLista.sort((a, b) => a.horario - b.horario);
    return {
      leito: le.identificacao, setor: le.setor || null, iniciais: le.iniciais || null, prontuario: le.prontuario,
      temPrescricao: !!presc, cuidados: its.length, pendentes, atrasados, atrasadosLista,
    };
  }).sort((a, b) => (b.atrasados - a.atrasados) || (b.pendentes - a.pendentes) || (b.cuidados - a.cuidados));
}
