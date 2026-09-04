// ═══════════════════════════════════════════════════════════
// LEITURA DE `pep_alergias`
//
// 🔴 A CONSULTA ESTAVA ESCRITA EM QUATRO LUGARES, todos com o mesmo
// `.catch(() => [])` no fim — e esse `[]` é a mentira mais cara deste
// sistema: transforma "não consegui ler as alergias" em "este paciente não
// tem alergia nenhuma", que é a leitura sob a qual se prescreve.
//
// Aqui a falha vira `FALHA`, a lista vazia MARCADA. Quem não perguntar
// continua exatamente como estava (`FALHA` é um array de verdade); quem
// perguntar — `contextoClinico` pergunta — descobre que não sabe.
//
// ⚠️ O `.catch` continua, e de propósito: em banco onde a migração do PEP
// ainda não rodou a tabela não existe, e derrubar a tela do PS por causa
// disso seria trocar uma leitura incompleta por nenhuma tela.
// ═══════════════════════════════════════════════════════════

import { listaLida } from "../util/leitura.js";

const ORDEM = "select=*&order=criado_em.desc";

/** Histórico de alergias de UM paciente, pela chave que a tabela usa. */
export async function carregarAlergias(sb, prontuario) {
  if (!sb || !prontuario) return [];
  const p = encodeURIComponent(prontuario);
  const rows = await sb(`pep_alergias?prontuario=eq.${p}&${ORDEM}`).catch(() => null);
  return listaLida(rows);
}

/**
 * Alergias de VÁRIOS pacientes de uma vez — a fila da Farmácia e os painéis
 * do PS mostram dezenas de leitos ao mesmo tempo, e uma consulta por paciente
 * transformaria a abertura da tela em dezenas de requisições.
 *
 * ⚠️ Lista de prontuários vazia devolve `[]` COMUM, não `FALHA`: não haver
 * quem consultar é diferente de não conseguir consultar.
 */
export async function carregarAlergiasDeVarios(sb, prontuarios) {
  const chaves = [...new Set((Array.isArray(prontuarios) ? prontuarios : []).filter(Boolean))];
  if (!sb || !chaves.length) return [];
  const lista = chaves.map(p => `"${String(p).replace(/"/g, '""')}"`).join(",");
  const rows = await sb(`pep_alergias?prontuario=in.(${encodeURIComponent(lista)})&${ORDEM}`).catch(() => null);
  return listaLida(rows);
}
