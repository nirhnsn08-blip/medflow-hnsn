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

// ═══════════════════════════════════════════════════════════
// A ESCRITA DA TRILHA
//
// Saiu do App.jsx, onde era o `addAuditLog` — usado por 29 declarações, o
// terceiro nó mais compartilhado do arquivo depois do `sbFetch` e do
// `USE_SUPABASE`. Enquanto morasse lá, nenhum módulo extraído conseguiria
// registrar ato nenhum sem importar de volta o monólito.
//
// Grava nos DOIS lugares, de propósito:
//   • na tabela `auditoria` — a trilha institucional, a mesma para todos;
//   • no `localStorage` — as últimas 200 do navegador, que é o que ainda
//     existe quando o banco está fora.
//
// ⚠️ `usuario_id` NÃO É ENVIADO, e isso é a correção, não um esquecimento.
// A coluna tem `default auth.uid()`: quem carimba a autoria é o banco. O
// campo `usuario` é texto vindo do cliente e serve para ler, não para
// provar — pela API, qualquer autenticado gravaria com o nome de outra
// pessoa. Ver supabase/migracao-auditoria-atribuivel.sql.
//
// ⚠️ NÃO SE ESPERA A GRAVAÇÃO. É de propósito: auditar é efeito colateral
// do ato, e o ato não pode ficar mais lento por causa da trilha. A falha
// não fica escondida — o `sb` nunca rejeita, devolve `null` e registra a
// queda no aviso global de falha do Supabase.
// ═══════════════════════════════════════════════════════════

export const AUDIT_KEY = "hnsn_audit_v1";

/** Quantas ficam no navegador. Acima disso, a mais antiga sai. */
export const LIMITE_LOCAL = 200;

/** As últimas ações guardadas neste navegador. Lista vazia se não der para ler. */
export function lerTrilhaLocal() {
  try { const v = JSON.parse(localStorage.getItem(AUDIT_KEY) || "[]"); return Array.isArray(v) ? v : []; }
  catch { return []; }
}

/**
 * Registra uma ação na trilha.
 *
 * 🔴 NADA AQUI PODE DERRUBAR O ATO AUDITADO.
 * Esta função é chamada DEPOIS que a pessoa salvou o leito, deu a alta,
 * dispensou o medicamento. Se ela estourar, o erro sobe para um chamador
 * que não tem try/catch — e o usuário vê o ato falhar quando ele já deu
 * certo. Duas coisas aqui podem estourar e nenhuma delas tem a ver com
 * auditoria: `JSON.stringify` numa estrutura circular (um evento do React
 * passado sem querer em `dados`) e o `localStorage` cheio ou bloqueado.
 */
export function registrarAuditoria(sb, user, acao, alvo, dados) {
  // Um instante só para as duas cópias: com duas chamadas a `Date`, a linha
  // do navegador e a do banco saíam com horários diferentes, e conferir uma
  // contra a outra virava trabalho de adivinhação.
  const ts = new Date().toISOString();
  const texto = resumir(dados);

  try {
    const log = lerTrilhaLocal();
    log.unshift({ ts, user: user?.name || "?", acao, alvo, dados: texto });
    if (log.length > LIMITE_LOCAL) log.splice(LIMITE_LOCAL);
    localStorage.setItem(AUDIT_KEY, JSON.stringify(log));
  } catch { /* navegador sem espaço ou em modo restrito: a trilha do banco continua */ }

  if (sb) sb("auditoria", { method: "POST", body: JSON.stringify({ ts, usuario: user?.name, acao, alvo }) });
}

/** O `dados` vira texto curto — e um objeto impossível de serializar não vira exceção. */
function resumir(dados) {
  try { return JSON.stringify(dados).slice(0, 120); }
  catch { return "[não serializável]"; }
}
