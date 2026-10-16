// ═══════════════════════════════════════════════════════════
// PACIENTE CANCELADO REPETIDAMENTE — motor puro
//
// O pedido da direção não foi "quantas cirurgias caíram": foi **quem está
// sendo cancelado de novo**. São perguntas diferentes, e só a segunda vira
// ação. Uma taxa de cancelamento de 12% não tem a quem ligar; "a paciente do
// prontuário 1001 foi desmarcada três vezes desde agosto" tem.
//
// Por isso este motor é por PACIENTE, não por evento — e cruza as duas
// portas em que ele é cancelado: o bloco cirúrgico e o ambulatório. Quem é
// desmarcado uma vez em cada lugar não aparece em nenhum relatório dos dois,
// e é exatamente quem está sendo mal servido.
//
// ── 🔴 A ARMADILHA: REMARCAÇÃO NÃO É CANCELAMENTO ───────────
// No ambulatório, remarcar **deixa o agendamento original como `cancelado`**
// e cria um novo apontando para ele (`remarcado_de`). Isso é decisão de
// desenho do módulo, não defeito — mas contar esses como cancelamento faria
// toda remarcação de rotina inflar a conta, e o indicador apontaria para
// pacientes que foram simplesmente reagendados.
//
// O painel acusaria um problema que não existe, a direção cobraria a equipe
// pelo número errado, e na terceira vez ninguém mais olharia a lista.
//
// Então: um cancelamento cujo id aparece como `remarcado_de` de outra linha
// é REMARCAÇÃO, e sai da conta — contado à parte, para a tela poder mostrar
// que soube distinguir.
//
// ⚠️ IDENTIDADE É O PRONTUÁRIO. Cancelamento sem prontuário não pode ser
// atribuído a ninguém — vai para `naoAtribuidos`, nunca é descartado em
// silêncio nem agrupado por iniciais (iniciais repetem entre pacientes).
// ═══════════════════════════════════════════════════════════

import { diaDe } from "./torre.js";

export const ORIGEM = { CIRURGIA: "cirurgia", AMBULATORIO: "ambulatorio" };

export const ROTULO_ORIGEM = {
  [ORIGEM.CIRURGIA]: "Cirurgia",
  [ORIGEM.AMBULATORIO]: "Consulta",
};

/** A partir de quantos cancelamentos o paciente entra na lista de cuidado. */
export const LIMIAR_REINCIDENCIA = 2;

const texto = v => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

/**
 * Os ids de agendamento que foram REMARCADOS (alguém aponta para eles).
 * É o que separa "desmarcaram o paciente" de "mudaram a data dele".
 */
export function idsRemarcados(agendamentos = []) {
  const ids = new Set();
  for (const a of Array.isArray(agendamentos) ? agendamentos : []) {
    if (a?.remarcado_de != null && a.remarcado_de !== "") ids.add(String(a.remarcado_de));
  }
  return ids;
}

/**
 * Os eventos de cancelamento das duas portas, já normalizados.
 *
 * Devolve `{ eventos, remarcacoes, naoAtribuidos }`:
 *  • `eventos` — cancelamentos de verdade, com prontuário;
 *  • `remarcacoes` — os que eram remarcação e saíram da conta;
 *  • `naoAtribuidos` — cancelamentos sem prontuário, que existem mas não
 *    podem ser ligados a ninguém.
 */
export function eventosDeCancelamento(cirurgias = [], agendamentos = []) {
  const eventos = [];
  const naoAtribuidos = [];
  let remarcacoes = 0;

  for (const c of Array.isArray(cirurgias) ? cirurgias : []) {
    if (c?.status !== "cancelada") continue;
    const ev = {
      origem: ORIGEM.CIRURGIA,
      id: c.id ?? null,
      dia: diaDe(c.data),
      prontuario: texto(c.prontuario),
      iniciais: texto(c.iniciais),
      motivo: texto(c.cancelamento_motivo),
      detalhe: texto(c.procedimento),
    };
    (ev.prontuario ? eventos : naoAtribuidos).push(ev);
  }

  const remarcados = idsRemarcados(agendamentos);
  for (const a of Array.isArray(agendamentos) ? agendamentos : []) {
    if (a?.status !== "cancelado") continue;
    // 🔴 Remarcação não é cancelamento. Ver o cabeçalho.
    if (a.id != null && remarcados.has(String(a.id))) { remarcacoes++; continue; }
    const ev = {
      origem: ORIGEM.AMBULATORIO,
      id: a.id ?? null,
      dia: diaDe(a.data),
      prontuario: texto(a.prontuario),
      iniciais: null,
      motivo: texto(a.cancelado_motivo),
      detalhe: texto(a.especialidade_cod),
    };
    (ev.prontuario ? eventos : naoAtribuidos).push(ev);
  }

  return { eventos, remarcacoes, naoAtribuidos };
}

/**
 * Agrupa por paciente e ordena por quem mais apanhou.
 *
 * O desempate é por DATA MAIS RECENTE: entre dois pacientes com três
 * cancelamentos cada, o de ontem precisa de ligação antes do de março.
 */
export function porPaciente(eventos = [], { limiar = LIMIAR_REINCIDENCIA } = {}) {
  const mapa = new Map();

  for (const ev of Array.isArray(eventos) ? eventos : []) {
    if (!ev?.prontuario) continue;
    if (!mapa.has(ev.prontuario)) {
      mapa.set(ev.prontuario, {
        prontuario: ev.prontuario, iniciais: null,
        total: 0, cirurgia: 0, ambulatorio: 0,
        eventos: [], ultimoDia: null, motivos: [],
      });
    }
    const p = mapa.get(ev.prontuario);
    p.total++;
    if (ev.origem === ORIGEM.CIRURGIA) p.cirurgia++; else p.ambulatorio++;
    p.iniciais = p.iniciais || ev.iniciais;
    p.eventos.push(ev);
    if (ev.dia && (!p.ultimoDia || ev.dia > p.ultimoDia)) p.ultimoDia = ev.dia;
    if (ev.motivo && !p.motivos.includes(ev.motivo)) p.motivos.push(ev.motivo);
  }

  const lista = [...mapa.values()].map(p => ({
    ...p,
    eventos: p.eventos.sort((a, b) => String(b.dia || "").localeCompare(String(a.dia || ""))),
    // Cancelado nas DUAS portas é o caso que nenhum relatório de módulo vê.
    nasDuasPortas: p.cirurgia > 0 && p.ambulatorio > 0,
    reincidente: p.total >= limiar,
    semMotivoRegistrado: p.motivos.length === 0,
  }));

  lista.sort((a, b) =>
    b.total - a.total ||
    String(b.ultimoDia || "").localeCompare(String(a.ultimoDia || "")) ||
    String(a.prontuario).localeCompare(String(b.prontuario)));

  return lista;
}

/**
 * O relatório completo: a lista mais o que a tela precisa dizer junto.
 *
 * `podeDizerNinguem` é falso quando a leitura falhou — pela mesma razão do
 * resto da Torre: "nenhum paciente cancelado duas vezes" e "não consegui
 * conferir" levam a atos opostos.
 */
export function relatorioDeCancelamentos(cirurgias, agendamentos, { lido = true, limiar = LIMIAR_REINCIDENCIA } = {}) {
  if (!lido) {
    return {
      lido: false, pacientes: [], reincidentes: [], total: null,
      remarcacoes: null, naoAtribuidos: null, podeDizerNinguem: false,
    };
  }
  const { eventos, remarcacoes, naoAtribuidos } = eventosDeCancelamento(cirurgias, agendamentos);
  const pacientes = porPaciente(eventos, { limiar });
  const reincidentes = pacientes.filter(p => p.reincidente);

  return {
    lido: true,
    pacientes,
    reincidentes,
    total: eventos.length,
    remarcacoes,
    naoAtribuidos: naoAtribuidos.length,
    nasDuasPortas: pacientes.filter(p => p.nasDuasPortas).length,
    // Só dá para afirmar "ninguém" com a leitura inteira na mão.
    podeDizerNinguem: reincidentes.length === 0,
  };
}
