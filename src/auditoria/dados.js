// ═══════════════════════════════════════════════════════════
// DADOS DA TRILHA — só leitura
//
// A tabela `auditoria` é append-only por política (não há UPDATE nem
// DELETE) e cresce para sempre. Duas consequências para esta camada:
//
//   • paginar é obrigatório — carregar tudo trava o navegador de quem
//     abrir a tela daqui a um ano;
//   • paginar por CHAVE, não por offset. A tabela recebe inserção o tempo
//     todo, e offset numa tabela que cresce durante a leitura pula e
//     repete linha. Numa auditoria, um registro pulado é exatamente o
//     registro que não vai aparecer para quem procura.
//
// O filtro pesado vai para o servidor: filtrar no cliente só encontraria
// o que já foi baixado, o que numa trilha de 40 mil linhas significa
// "não encontrado" para quase tudo.
// ═══════════════════════════════════════════════════════════

import { limparBusca } from "./trilha.js";

/** Registros por página. */
export const PAGINA = 100;
/** As colunas da tabela `auditoria` — conferidas em `contrato-banco.test.js`. */
export const COLUNAS = "id,ts,usuario,usuario_id,acao,alvo";

/**
 * Monta a consulta de uma página da trilha.
 *
 * `antesDeId` — o menor id já carregado; a próxima página vem abaixo dele.
 * Separada da função de rede para poder ser conferida por teste sem
 * levantar nada.
 */
export function consultaTrilha({ antesDeId = null, limite = PAGINA, texto = "", acao = "", de = "", ate = "" } = {}) {
  const p = [`select=${COLUNAS}`, "order=id.desc", `limit=${limite}`];
  if (antesDeId != null) p.push(`id=lt.${antesDeId}`);

  const t = limparBusca(texto);
  // `or=(...)` com o texto já limpo: vírgula ou parêntese vindos do campo
  // de busca deixariam de ser texto e passariam a ser sintaxe do filtro.
  if (t) p.push(`or=(usuario.ilike.*${encodeURIComponent(t)}*,alvo.ilike.*${encodeURIComponent(t)}*)`);
  if (acao) p.push(`acao=eq.${encodeURIComponent(acao)}`);
  // Data civil: `lt` no dia seguinte, e não `lte` no dia final — com `lte`
  // num horário fixo, quem agiu às 23h59 fica de fora do próprio dia.
  if (de) p.push(`ts=gte.${de}T00:00:00`);
  if (ate) p.push(`ts=lt.${diaSeguinte(ate)}T00:00:00`);

  return `auditoria?${p.join("&")}`;
}

/** O dia civil seguinte, sem passar por fuso — `new Date` recuaria a data. */
export function diaSeguinte(iso) {
  const [a, m, d] = String(iso).split("-").map(Number);
  if (!a || !m || !d) return iso;
  const dt = new Date(a, m - 1, d + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/**
 * Carrega uma página da trilha.
 *
 * Devolve `{ linhas, temMais }`, com `linhas` em `null` quando a consulta
 * falhou — e `null` aqui é informação, não ausência dela: significa "não
 * deu para perguntar", que a tela precisa distinguir de "não há registro".
 */
export async function carregarTrilha(sb, opcoes = {}) {
  const limite = opcoes.limite ?? PAGINA;
  const r = await Promise.resolve(sb(consultaTrilha({ ...opcoes, limite }))).catch(() => null);
  if (!Array.isArray(r)) return { linhas: null, temMais: false };
  // Veio a página cheia? Então provavelmente há mais — dizer isso importa,
  // porque uma tela que mostra 100 de 40.000 sem avisar convida à conclusão
  // errada de que aquilo é tudo.
  return { linhas: r, temMais: r.length >= limite };
}
