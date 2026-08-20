// ═══════════════════════════════════════════════════════════
// DADOS DO CHECKLIST DE IMPLANTAÇÃO — só leitura
//
// Quatro `select` nas tabelas de configuração. Nada é gravado aqui: o
// checklist aponta o caminho, quem cadastra é a tela do próprio módulo.
//
// `sb` entra por parâmetro (mesmo padrão de `src/atendimento/dados.js`) —
// assim o teste injeta um falso e captura a consulta sem tocar na rede.
// ═══════════════════════════════════════════════════════════

import { CADASTROS_BASE } from "./checklist.js";

/**
 * Teto da consulta. Tabela de configuração é pequena — o hospital tem
 * dezenas de setores e salas, não milhares — e a pergunta aqui é "tem ou não
 * tem", não o inventário. Contar pelo header `content-range` do PostgREST
 * não é opção: o `sbFetch` devolve só o corpo já convertido em JSON.
 */
export const TETO = 200;

/** As colunas que precisamos de cada tabela: a chave e, se houver, o ativo. */
export function colunasDe(cadastro) {
  return [cadastro.select, cadastro.colunaAtivo].filter(Boolean).join(",");
}

/** A consulta de um cadastro, montada num lugar só para o teste conferir. */
export function consultaDe(cadastro) {
  return `${cadastro.tabela}?select=${colunasDe(cadastro)}&limit=${TETO}`;
}

/**
 * Quantos registros existem em cada cadastro-base.
 *
 * Devolve `{ [chave]: linhas | null }` — e o `null` é informação, não
 * ausência dela: significa "não deu para perguntar" (o `sbFetch` devolve
 * `null` em falha de rede, sessão vencida ou recusa do PostgREST, e nunca
 * lança). Quem decide o que isso quer dizer é `estadoCadastro`; aqui não se
 * converte `null` em zero, porque zero é uma afirmação e esta camada não
 * tem como fazê-la.
 *
 * As quatro consultas vão em paralelo — o card não pode atrasar a Visão
 * Geral, que é tela de monitoramento.
 */
export async function contarCadastros(sb) {
  const linhas = await Promise.all(
    CADASTROS_BASE.map(c => Promise.resolve(sb(consultaDe(c))).catch(() => null))
  );
  const out = {};
  CADASTROS_BASE.forEach((c, i) => { out[c.chave] = Array.isArray(linhas[i]) ? linhas[i] : null; });
  return out;
}
