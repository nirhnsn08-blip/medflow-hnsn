// ═══════════════════════════════════════════════════════════
// CATÁLOGO: OS CAMPOS DE GESTAÇÃO E DOSE POR KG
//
// Quatro colunas novas em `farm_medicamentos` (migração
// `migracao-alertas-peso-gestacao.sql`) alimentam duas regras do motor de
// alertas: risco na gestação e dose máxima por kg de peso.
//
// 🔴 A ORDEM DE IMPLANTAÇÃO NÃO É GARANTIDA. O código chega à produção pelo
// merge; o SQL roda à mão, depois. Se o salvar do catálogo mandasse as
// colunas novas SEMPRE, num banco onde a migração ainda não rodou o
// PostgREST recusaria o PATCH inteiro ("column does not exist") — e o
// editor de medicamento deixaria de salvar QUALQUER coisa, não só os campos
// novos.
//
// Por isso cada campo novo só vai no corpo quando:
//   · a linha lida do banco JÁ TEM a coluna (a migração rodou), ou
//   · alguém preencheu um valor (e aí o erro, se houver, é o certo).
// ═══════════════════════════════════════════════════════════

import { categoriaGestacao } from "../clinico/alertas.js";

export const CAMPOS_GESTACAO_PESO = ["risco_gestacao", "motivo_gestacao", "dose_maxima_kg_dia", "dose_maxima_kg_unid"];

const positivoOuNull = v => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Os campos novos para o corpo do salvar.
 *
 * `original` é a linha como veio do banco (ou `{}` para medicamento novo);
 * `form` é o estado do formulário.
 *
 * ⚠️ Categoria fora de A–X vira `null`, e dose por kg zero ou negativa
 * também: um limite de "0 mg/kg/dia" não é limite, é digitação.
 */
export function camposGestacaoPeso(original, form) {
  const f = form || {};
  const categoria = categoriaGestacao(f.risco_gestacao);
  const valores = {
    risco_gestacao: categoria,
    // ⚠️ O motivo só existe para D e X. O campo some da tela nas outras
    // categorias, mas o texto antigo continuava no formulário e era gravado:
    // invisível, impossível de apagar, e de volta no alerta se alguém marcasse
    // D depois. Achado na caminhada de 16/09, ao limpar uma categoria X.
    motivo_gestacao: categoria === "D" || categoria === "X" ? (String(f.motivo_gestacao ?? "").trim() || null) : null,
    dose_maxima_kg_dia: positivoOuNull(f.dose_maxima_kg_dia),
    dose_maxima_kg_unid: f.dose_maxima_kg_unid || null,
  };
  const out = {};
  for (const k of CAMPOS_GESTACAO_PESO) {
    const colunaExiste = !!original && Object.prototype.hasOwnProperty.call(original, k);
    if (colunaExiste || valores[k] != null) out[k] = valores[k];
  }
  return out;
}
