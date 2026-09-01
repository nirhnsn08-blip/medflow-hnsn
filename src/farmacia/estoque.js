// ═══════════════════════════════════════════════════════════
// SALDO DE MEDICAMENTO
//
// 🔴 ISTO EXISTE PARA APAGAR UMA CÓPIA, NÃO PARA CRIAR UMA REGRA.
// O App.jsx tinha `farmSaldoTotal(medId, lotes)`, que somava os lotes de um
// medicamento. O `supSaldoTotal` do kardex de suprimentos já fazia
// exatamente isso e já tinha ganhado o parâmetro `chave` justamente para
// servir à farmácia — mas a cópia nunca saiu.
//
// Duas implementações da mesma soma é uma que recebe correção e outra que
// não. No dia em que o saldo passar a ignorar lote vencido ou em
// quarentena, uma tela mudaria e a outra continuaria somando tudo.
// ═══════════════════════════════════════════════════════════

import { supSaldoTotal } from "../suprimentos/kardex.js";

/** A coluna que liga o lote ao medicamento (em suprimentos é `item_id`). */
export const CHAVE_LOTE = "medicamento_id";

/** Soma dos lotes de um medicamento. */
export const saldoDoMedicamento = (medId, lotes = []) => supSaldoTotal(medId, lotes, CHAVE_LOTE);

/**
 * O custo unitário de um medicamento, em número.
 *
 * ⚠️ Vive aqui, e não na tela, porque é lido por NOVE declarações: os
 * indicadores da Farmácia, o executivo e o inventário do Almoxarifado, a
 * triagem do PS. Sem custo cadastrado é zero — e zero aqui significa "não
 * sei quanto custa", não "é de graça". Quem soma custo total precisa dizer
 * quantos itens entraram na conta sem preço.
 */
export const custoUnit = med => Number(med?.custo_unitario || 0);
