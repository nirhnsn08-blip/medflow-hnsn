// ═══════════════════════════════════════════════════════════
// CONSULTAS — a pesquisa de atendimentos (o lado da LEITURA)
//
// "Consultas" aqui não é consulta médica. É o mesmo nome que o MV usa para
// as telas de PESQUISA, e era o que faltava no módulo: construímos o fazer
// (abrir atendimento, marcar vaga) e quase nada do achar.
//
// O BLOQUEIO REAL QUE ISTO RESOLVE
// A recepcionista precisa saber quando foi a última consulta do paciente
// para marcar retorno. Mas o perfil dela NÃO acessa o Paciente 360 — e isso
// é proposital: é a separação entre informação administrativa e clínica que
// a COFEN 754/2024, art. 6º, manda existir. Resultado: hoje ela não tem
// como responder "esse paciente já veio?".
//
// ⚠️ A DECISÃO QUE MOLDA O ARQUIVO INTEIRO: ISTO NÃO É PRONTUÁRIO.
// Se esta tela listar diagnóstico, ela vira prontuário pesquisável por
// quem não deveria ter prontuário — a regra da COFEN furada por dentro, com
// aparência de conveniência. Por isso `CAMPOS_DO_EPISODIO` existe e o CID
// não está nele. O histórico responde QUANDO, ONDE, QUAL ESPECIALIDADE,
// QUEM PAGOU e COMO TERMINOU. Diagnóstico continua no Paciente 360, para
// quem tem direito a ele.
// ═══════════════════════════════════════════════════════════

import { diaCivil } from "./agenda.js";
import { STATUS_ATENDIMENTO, atendimentoAberto } from "./ciclo.js";

/**
 * As colunas que a pesquisa traz do banco.
 *
 * Lista explícita e sem `*` de propósito — é o que garante que um campo
 * clínico novo em `ps_atendimentos` não apareça aqui por acidente só porque
 * alguém acrescentou uma coluna. `cid`, `queixa`, `alergias`, sinais vitais
 * e classificação de risco NÃO entram.
 */
export const CAMPOS_DO_EPISODIO = [
  "id", "prontuario", "iniciais", "tipo_atendimento", "chegada_em",
  "status", "desfecho", "desfecho_em", "setor_destino",
  "especialidade_cod", "tipo_atendimento_cod", "unidade_origem_cod",
  "convenio_id", "medico", "agendamento_id",
];

/** O que a tela sabe pesquisar. */
export const MODOS = [
  { chave: "paciente", label: "Por paciente",
    dica: "Todo o histórico de episódios de uma pessoa, mais o que ela tem marcado à frente." },
  { chave: "periodo",  label: "Por período",
    dica: "Os atendimentos abertos entre duas datas." },
  { chave: "numero",   label: "Por número",
    dica: "Vai direto num atendimento pelo número dele." },
];

// ── PERÍODO ─────────────────────────────────────────────────

/**
 * Quanto de história a pesquisa por período pode varrer de uma vez.
 *
 * 92 dias (um trimestre) não é limite técnico — é minimização. Uma tela de
 * balcão que despeja cinco anos de atendimentos expõe muito mais gente do
 * que a pergunta exigia, e ninguém lê cinco anos numa lista. Quem precisa
 * de série histórica usa relatório, que é outra coisa e tem outro público.
 */
export const MAX_DIAS_PERIODO = 92;

export function validarPeriodo({ de, ate } = {}) {
  const erros = [];
  const dDe = diaCivil(de);
  const dAte = diaCivil(ate);

  if (!dDe) erros.push("Informe a data inicial.");
  if (!dAte) erros.push("Informe a data final.");
  if (dDe && dAte) {
    if (dAte < dDe) {
      erros.push("A data final é anterior à inicial.");
    } else {
      const dias = Math.round((dAte - dDe) / 86400000) + 1;
      if (dias > MAX_DIAS_PERIODO) {
        erros.push(`O período tem ${dias} dias. O máximo é ${MAX_DIAS_PERIODO} (um trimestre) — uma lista de balcão com mais que isso expõe mais gente do que a pergunta pedia, e ninguém lê. Para série histórica, use relatório.`);
      }
    }
  }
  return { ok: erros.length === 0, erros };
}

/**
 * As bordas do período em ISO, para o filtro.
 *
 * A borda final é o INÍCIO do dia seguinte, não 23:59:59 do dia final: com
 * `lte` num horário fixo, um atendimento aberto às 23:59:30 ficaria de fora
 * da própria data dele. Este sistema já teve bug de borda de mês.
 */
export function bordasDoPeriodo({ de, ate } = {}) {
  const dDe = diaCivil(de);
  const dAte = diaCivil(ate);
  if (!dDe || !dAte) return null;
  const fim = new Date(dAte);
  fim.setDate(fim.getDate() + 1);
  return { inicio: dDe.toISOString(), fim: fim.toISOString() };
}

// ── ÚLTIMO ATENDIMENTO ──────────────────────────────────────

/**
 * Quando foi a última vez, e há quantos dias.
 *
 * É o dado que faz "retorno" significar algo. Hoje o tipo de atendimento
 * tem a opção "retorno", mas nada confere se existiu consulta anterior —
 * então é só uma palavra, e a regra de faturamento (retorno dentro do prazo
 * não gera nova consulta) não pode ser aplicada por ninguém.
 *
 * NÃO devolve veredito sobre "ainda é retorno". O prazo é do contrato do
 * convênio ou da norma do hospital, varia, e inventar um número aqui faria
 * a tela afirmar com confiança algo que ninguém configurou. Devolve o fato:
 * há 32 dias, em 12/06. Quem decide é quem conhece o contrato.
 *
 * Cancelado nunca conta como visita anterior — ele não aconteceu.
 */
export function ultimoAtendimento(atendimentos, { especialidade, ate = new Date() } = {}) {
  const ref = diaCivil(typeof ate === "string" ? ate : ate.toISOString().slice(0, 10));
  const candidatos = (atendimentos || [])
    .filter(a => a.status !== "cancelado")
    .filter(a => !especialidade || a.especialidade_cod === especialidade)
    .filter(a => a.chegada_em)
    .sort((a, b) => new Date(b.chegada_em) - new Date(a.chegada_em));

  if (!candidatos.length) return null;
  const a = candidatos[0];
  const dia = diaCivil(String(a.chegada_em).slice(0, 10));
  const dias = ref && dia ? Math.round((ref - dia) / 86400000) : null;
  return { atendimento: a, diasAtras: dias, data: String(a.chegada_em).slice(0, 10) };
}

// ── RESUMO DO HISTÓRICO ─────────────────────────────────────

/**
 * O panorama que a recepção lê em dois segundos.
 *
 * `abertos` usa `atendimentoAberto` (ciclo.js) em vez de comparar status na
 * mão — é a mesma fonte única que o resto do sistema, e foi o que evitou o
 * cancelado passar por aberto.
 */
export function resumoDoHistorico(atendimentos = []) {
  const lista = (atendimentos || []).filter(a => a.chegada_em);
  const validos = lista.filter(a => a.status !== "cancelado");
  const datas = validos.map(a => new Date(a.chegada_em)).sort((a, b) => a - b);

  const porTipo = {};
  for (const a of validos) {
    const k = a.tipo_atendimento || "emergencia";
    porTipo[k] = (porTipo[k] || 0) + 1;
  }

  return {
    total: validos.length,
    cancelados: lista.length - validos.length,
    abertos: validos.filter(atendimentoAberto).length,
    porTipo,
    primeira: datas.length ? datas[0].toISOString().slice(0, 10) : null,
    ultima: datas.length ? datas[datas.length - 1].toISOString().slice(0, 10) : null,
  };
}

/** Rótulo curto do estado, para a lista. */
export function rotuloDoEpisodio(a) {
  const st = STATUS_ATENDIMENTO[a?.status]?.label || a?.status || "—";
  if (a?.desfecho) return `${st} · ${String(a.desfecho).replace(/_/g, " ")}`;
  return st;
}

/**
 * Agrupa o histórico por ano, do mais recente para o mais antigo.
 *
 * Lista corrida de trinta episódios não se lê. Por ano, a pergunta "veio
 * muito no ano passado?" se responde de relance.
 */
export function agruparPorAno(atendimentos = []) {
  const mapa = new Map();
  for (const a of (atendimentos || []).filter(x => x.chegada_em)) {
    const ano = String(a.chegada_em).slice(0, 4);
    if (!mapa.has(ano)) mapa.set(ano, []);
    mapa.get(ano).push(a);
  }
  return [...mapa.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([ano, itens]) => ({
      ano,
      itens: itens.sort((x, y) => new Date(y.chegada_em) - new Date(x.chegada_em)),
    }));
}
