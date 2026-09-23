// ═══════════════════════════════════════════════════════════
// DEVOLUÇÃO DO SETOR — quanto ainda pode voltar de cada dispensação
//
// Puro: não sabe o que é React nem banco.
//
// Medicamento suspenso, alta com sobra, dose que não foi dada: volta do andar
// para a farmácia. Não é ESTORNO — o estorno diz "o lançamento estava
// errado"; a devolução diz "saiu certo e voltou", e pode ser parcial.
//
// As regras são as mesmas do gatilho `farm_valida_devolucao` do banco
// (migracao-farmacia-hospital.sql). A tela confere antes para mostrar o
// limite certo e não deixar o farmacêutico bater na recusa; o banco confere
// de novo porque tela não é barreira.
//   • só se devolve SAÍDA de "Dispensação" que não foi estornada
//   • volta para o MESMO lote
//   • a soma das devoluções vigentes nunca passa do que saiu
//   • devolução estornada (lançada por engano) não conta
// ═══════════════════════════════════════════════════════════

import { MOTIVO_DEVOLUCAO, MOTIVO_DISPENSACAO } from "./consumo.js";

const num = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const id = v => (v == null ? "" : String(v));

export const MOTIVOS_DE_DEVOLUCAO = [
  "Item suspenso",
  "Alta do paciente",
  "Dose não administrada",
  "Troca de apresentação",
  "Óbito ou transferência",
];

/**
 * As dispensações de um item que ainda aceitam devolução, com o quanto cabe.
 * `chave` é a coluna do vínculo (`prescricao_item_id` ou `pep_item_id`).
 */
export function devolviveis(movimentos = [], itemId, chave = "prescricao_item_id") {
  const lista = Array.isArray(movimentos) ? movimentos : [];
  const estornados = new Set(lista.map(m => m?.estorno_de).filter(v => v != null).map(id));
  return lista
    .filter(m => m && id(m[chave]) === id(itemId))
    .filter(m => m.tipo === "saida" && (m.motivo || "") === MOTIVO_DISPENSACAO && m.estorno_de == null)
    .filter(m => !estornados.has(id(m.id)))
    .map(saida => {
      const voltou = lista
        .filter(d => d && id(d.devolucao_de) === id(saida.id) && !estornados.has(id(d.id)))
        .reduce((s, d) => s + num(d.quantidade), 0);
      return { saida, devolvido: voltou, restante: Math.max(0, num(saida.quantidade) - voltou) };
    })
    .filter(x => x.restante > 0);
}

/**
 * Confere uma devolução antes de mandar ao banco.
 * Devolve `{ ok, erros }`; o movimento pronto sai de `movimentoDeDevolucao`.
 */
export function conferirDevolucao({ disponivel, quantidade, motivo }) {
  const erros = [];
  const q = num(quantidade);
  if (!disponivel) erros.push("Escolha a dispensação que está voltando.");
  if (!(q > 0)) erros.push("Informe a quantidade que voltou.");
  else if (disponivel && q > disponivel.restante)
    erros.push(`Cabem no máximo ${disponivel.restante} — foi o que saiu nesta dispensação e ainda não voltou.`);
  if (!String(motivo || "").trim()) erros.push("Diga por que voltou (item suspenso, alta, dose não administrada…).");
  return { ok: erros.length === 0, erros };
}

/** A linha de kardex da devolução: entrada no MESMO lote, apontando para a saída. */
export function movimentoDeDevolucao(saida, quantidade, motivo) {
  const out = {
    medicamento_id: saida.medicamento_id,
    tipo: "entrada",
    quantidade: num(quantidade),
    lote: saida.lote || "",
    validade: saida.validade || null,
    motivo: MOTIVO_DEVOLUCAO,
    observacao: String(motivo || "").trim(),
    devolucao_de: saida.id,
  };
  for (const c of ["atendimento_id", "prescricao_item_id", "pep_item_id", "episodio_id", "paciente_iniciais", "paciente_prontuario", "setor"])
    if (saida[c] != null) out[c] = saida[c];
  return out;
}
