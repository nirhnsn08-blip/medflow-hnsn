// ═══════════════════════════════════════════════════════════
// O VOCABULÁRIO DOS DESFECHOS — a mesma palavra nas três portas
//
// 🔴 DEFEITO REAL (revisão do Atendimento, 05/10/2026): o pronto-socorro e a
// internação gravam `evasao`; o AMBULATÓRIO grava `evadiu` (ciclo.js). A
// regra de faturamento conhecia só a primeira:
//
//     SEM_CONTA = ["evasao"]   →   geraConta("evadiu") === true
//
// Ou seja: o paciente que chegou, foi registrado e foi embora ANTES de ser
// atendido virava conta. No SUS isso é produção informada sem atendimento
// prestado — glosa quando auditado, e pior que glosa se não for.
//
// A mesma divergência aparecia na fila da maternidade, que filtra quem já
// saiu do hospital: um ambulatorial com `evadiu` ficava na fila para sempre.
//
// A CAUSA não é a palavra errada, é não haver UMA lista. Enquanto cada
// módulo escrever a sua, a próxima porta nova vai divergir de novo. Aqui
// mora a lista; quem pergunta, pergunta aqui.
//
// ⚠️ AS DUAS CHAVES CONTINUAM VÁLIDAS. Já existe dado gravado com cada uma
// delas nos bancos, e prontuário não se reescreve para caber numa
// refatoração: o reconhecimento é que passa a aceitar as duas.
// ═══════════════════════════════════════════════════════════

const texto = v => String(v ?? "").trim().toLowerCase();

/** O paciente foi embora sem ser atendido — as duas grafias em uso. */
export const EVASAO = Object.freeze(["evasao", "evadiu"]);

/** Foi embora sem ser atendido? */
export const ehEvasao = desfecho => EVASAO.includes(texto(desfecho));

/**
 * Saiu do hospital — não está mais em fila nenhuma.
 *
 * `alta` cobre os desfechos do PS; os da internação são `alta_melhorado`,
 * `alta_inalterado` e `alta_pedido` (ver `alta.js`), por isso o prefixo.
 */
export function saiuDoHospital(desfecho) {
  const d = texto(desfecho);
  if (!d) return false;
  return d.startsWith("alta") || d === "obito" || d === "transferencia" || ehEvasao(d);
}
