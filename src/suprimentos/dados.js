// ═══════════════════════════════════════════════════════════
// DADOS DA CONCILIAÇÃO — só leitura
//
// A conciliação só vale com o histórico INTEIRO. Meia lista comparada com
// o saldo cheio acusaria rombo em quase todo lote, e a equipe iria caçar
// dinheiro que não sumiu. Por isso esta camada tem uma única obrigação:
// trazer tudo, ou dizer honestamente que não trouxe.
//
// Os loaders que já existem no App.jsx (`loadSupMovimentos`) usam `limit`
// fixo — servem para mostrar o kardex de um item na tela, não para somar.
// Daí o carregamento próprio aqui.
//
// `sb` entra por parâmetro (padrão de `src/atendimento/dados.js`), então o
// teste injeta um falso e não toca a rede.
// ═══════════════════════════════════════════════════════════

import { conciliar } from "./kardex.js";

/** Linhas por requisição. O PostgREST tem teto próprio; 1000 é conservador. */
export const PAGINA = 1000;
/** Teto de segurança: acima disso a tela diz "não conferido" em vez de travar o navegador. */
export const TETO_MOVIMENTOS = 40000;

/** Só as colunas que a soma precisa — o kardex inteiro em `select=*` seria pesado à toa. */
export const COLUNAS_MOVIMENTO = "id,item_id,lote_id,tipo,quantidade";
export const COLUNAS_LOTE = "id,item_id,lote,validade,quantidade";

/**
 * Percorre uma tabela inteira por CHAVE, não por offset.
 *
 * Offset em tabela que recebe inserção durante a leitura pula e repete
 * linha — e numa conciliação isso vira divergência inventada. Paginar por
 * `id > último` é estável: `sup_movimentos` é append-only (não há política
 * de update nem de delete), então o que já foi lido não se move.
 *
 * Devolve `null` em qualquer falha — inclusive no meio da paginação. Meia
 * lista é pior que lista nenhuma aqui, porque parece completa.
 */
export async function carregarTudoPorId(sb, tabela, colunas, { pagina = PAGINA, teto = TETO_MOVIMENTOS } = {}) {
  const linhas = [];
  let desdeId = 0;
  for (;;) {
    const rows = await Promise.resolve(
      sb(`${tabela}?id=gt.${desdeId}&select=${colunas}&order=id.asc&limit=${pagina}`)
    ).catch(() => null);
    if (!Array.isArray(rows)) return { linhas: null, completo: false };
    linhas.push(...rows);
    if (rows.length < pagina) return { linhas, completo: true };   // acabou antes do teto
    desdeId = rows[rows.length - 1].id;
    if (linhas.length >= teto) return { linhas, completo: false }; // bateu no teto
  }
}

/**
 * Concilia o kardex com o saldo dos lotes, agora.
 *
 * Devolve o mesmo formato de `conciliar`, com `conciliavel: false` quando
 * qualquer uma das duas leituras falhou ou veio truncada.
 */
export async function conciliarAgora(sb, opcoes = {}) {
  const [mv, lt] = await Promise.all([
    carregarTudoPorId(sb, "sup_movimentos", COLUNAS_MOVIMENTO, opcoes),
    carregarTudoPorId(sb, "sup_lotes", COLUNAS_LOTE, opcoes),
  ]);
  const completo = mv.completo && lt.completo;
  return {
    ...conciliar(mv.linhas, lt.linhas, { historicoCompleto: completo }),
    // Por que não conciliou — a tela precisa distinguir "não deu para ler"
    // de "li demais": o primeiro é problema de acesso, o segundo é volume.
    motivo: mv.linhas == null || lt.linhas == null ? "falha"
          : !completo ? "truncado" : null,
    movimentosLidos: mv.linhas?.length ?? 0,
  };
}
