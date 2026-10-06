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

import { listaLida, FALHA, naoDeuParaLer } from "../util/leitura.js";
import { carregarProntuariosDaPessoa } from "./pessoa-dados.js";
import { numerosParaConsultar, indexarPorPessoa } from "./pessoa.js";

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

/**
 * As alergias de uma fila, SEGUINDO A UNIFICAÇÃO DE PRONTUÁRIO.
 *
 * 🔴 ERA AQUI QUE O RISCO SUMIA. A alergia registrada na ficha antiga não
 * aparecia na prescrição, no alerta da farmácia nem na pulseira da ficha que
 * vale: a leitura era por um número só, e unificar não move dado clínico (e
 * não deve mover — ver `pacientes/unificacao.js`). Quem precisa enxergar a
 * pessoa inteira é quem LÊ.
 *
 * Devolve o índice de `alergiasPorProntuario` — `{ falhou, por }` — já com
 * cada registro visível por TODOS os números da pessoa.
 *
 * ⚠️ Se a resolução da família falhar, o índice inteiro sai marcado como
 * falhado. Mostrar as alergias de um número só, sem saber se há outro,
 * seria afirmar "é isto que ela tem" sem ter perguntado — e é sob essa
 * leitura que se prescreve.
 */
export async function carregarAlergiasDaPessoa(sb, prontuarios) {
  const chaves = [...new Set((Array.isArray(prontuarios) ? prontuarios : []).filter(Boolean))];
  if (!sb || !chaves.length) return { falhou: false, por: {} };

  const familia = await carregarProntuariosDaPessoa(sb, chaves);
  if (!familia.ok) return { falhou: true, por: {} };

  const registros = await carregarAlergiasDeVarios(sb, numerosParaConsultar(familia.por));
  if (naoDeuParaLer(registros)) return { falhou: true, por: {} };
  return { falhou: false, por: indexarPorPessoa(registros, familia.por) };
}

/**
 * O histórico de alergia de UMA pessoa, por todos os números dela.
 *
 * Devolve `FALHA` (a lista vazia MARCADA) quando não deu para ler — nunca
 * `[]` comum, que o construtor de contexto leria como "não tem alergia".
 */
export async function carregarAlergiasDoPaciente(sb, prontuario) {
  if (!sb || !prontuario) return [];
  const idx = await carregarAlergiasDaPessoa(sb, [prontuario]);
  if (idx.falhou) return FALHA;
  return idx.por[prontuario] || [];
}
