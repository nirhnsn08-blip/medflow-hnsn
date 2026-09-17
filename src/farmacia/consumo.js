// ═══════════════════════════════════════════════════════════
// CONSUMO DE PACIENTE — o que saiu para paciente, LÍQUIDO
//
// Puro: não sabe o que é React nem banco.
//
// 🔴 POR QUE ISTO EXISTE
// Os Indicadores somavam as saídas com motivo "Dispensação" e paravam aí.
// Quando uma dispensação era desfeita — estorno de lançamento errado, ou
// medicamento que voltou do andar — a entrada de volta não descontava nada.
// Custo por paciente, consumo por medicamento, curva ABC e "controlados
// dispensados" ficavam acima do real, e ficavam para sempre: o kardex é
// append-only, então o erro não some com o tempo.
//
// A REGRA
//   • saída com motivo "Dispensação"                    → soma (com ou sem
//     paciente: a saída manual pela aba Estoque também é dispensação, e os
//     indicadores sempre a contaram)
//   • estorno (`estorno_de`) ou devolução (`devolucao_de`) LIGADO A
//     PACIENTE → sinal pelo tipo: entrada desconta, saída (estorno de um
//     estorno) volta a somar
//
// "Ligado a paciente" é ter prontuário, iniciais, atendimento ou item de
// prescrição. É o que separa o estorno de uma dispensação do estorno de
// uma compra — os dois são entradas com `estorno_de`, e só o primeiro é
// consumo de paciente.
//
// ⚠️ NÃO depende de o movimento original estar no mesmo período. O estorno
// de hoje de uma dispensação do mês passado desconta HOJE, que é quando a
// devolução aconteceu — é assim que um livro contábil faz, e é o que
// permite fechar um mês sem reabrir o anterior.
// ═══════════════════════════════════════════════════════════

export const MOTIVO_DISPENSACAO = "Dispensação";
export const MOTIVO_DEVOLUCAO = "Devolução do setor";

const num = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** O movimento carrega paciente? */
export function ehDePaciente(m) {
  return !!(m && (m.paciente_prontuario || m.paciente_iniciais || m.atendimento_id != null
    || m.prescricao_item_id != null || m.pep_item_id != null || m.episodio_id != null));
}

/**
 * Os movimentos de consumo de paciente, cada um com `qtd` já com sinal.
 * Movimento que não é consumo de paciente fica de fora.
 */
export function movimentosDeConsumo(movs = []) {
  const out = [];
  for (const m of Array.isArray(movs) ? movs : []) {
    if (!m) continue;
    const reverte = (m.estorno_de != null || m.devolucao_de != null) && ehDePaciente(m);
    const dispensa = m.tipo === "saida" && (m.motivo || "") === MOTIVO_DISPENSACAO && m.estorno_de == null;
    if (!reverte && !dispensa) continue;
    out.push({ ...m, qtd: m.tipo === "entrada" ? -num(m.quantidade) : num(m.quantidade) });
  }
  return out;
}

/** Soma `qtd` agrupando por uma chave (medicamento, paciente…). */
export function somarPor(consumo = [], chaveDe, valorDe = m => m.qtd) {
  const mapa = {};
  for (const m of consumo) {
    const k = chaveDe(m);
    if (k == null) continue;
    mapa[k] = (mapa[k] || 0) + valorDe(m);
  }
  return mapa;
}
