// ═══════════════════════════════════════════════════════════
// EM QUE TABELAS O CÓDIGO ESCREVE, E COM QUE VERBO
//
// 🔴 ISTO EXISTE POR CAUSA DE `pep_aprazamentos` (16/10/2026).
//
// A tabela tinha política de SELECT e de INSERT e mais nada. A tela mandava
// PATCH para cancelar uma dose, e o PostgREST respondia 2xx alterando ZERO
// linhas — sem erro, sem log, sem pista. O cancelamento "funcionava" e não
// gravava. Só apareceu caminhando.
//
// ⚠️ E O GERADOR DE RLS NÃO SOCORRE ESSE CASO. Ele abre escrita ampla
// (`_escrita_ins/_upd/_del`) apenas para tabela que não tem NENHUMA política
// de escrita — "se tiver, foi a migração dela que definiu, não encostar". A
// regra é certa; o efeito é que ESCRITA PARCIAL fica sem rede: a tabela com
// política só de INSERT é justamente a que ninguém ajuda.
//
// 💡 O PAPEL DESTE ARQUIVO: ler o código e dizer quem escreve onde. Quem
// responde a outra metade — "existe política permissiva para esse verbo?" —
// é o BANCO, consultado depois de nascer (ver `banco-novo-nasce.test.js`).
// Nada aqui tenta interpretar SQL: política criada dentro de `do $$ ...
// execute format(...)` é invisível para quem lê texto, e foi por isso que a
// primeira varredura que fiz à mão deu 6 falsos positivos em 7.
// ═══════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Verbo HTTP → letra do `pg_policy.polcmd`. */
export const VERBO = { POST: "a", PATCH: "w", PUT: "w", DELETE: "d" };

/** Nome legível do que cada letra autoriza, para a mensagem de falha. */
export const NOME_DO_VERBO = { a: "INSERT", w: "UPDATE", d: "DELETE" };

const EXT = /\.(js|jsx)$/;

function arquivosDe(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { arquivosDe(p, acc); continue; }
    // Teste não é código de produção: um spy chamado `sb` com tabela de
    // mentira entraria na lista e cobraria política de uma tabela que não
    // existe.
    if (EXT.test(e.name) && !/\.test\./.test(e.name)) acc.push(p);
  }
  return acc;
}

/**
 * As chamadas cujo alvo é montado em variável, resolvidas À MÃO.
 *
 * ⚠️ Lista pequena de propósito, e com a fonte de cada uma. Resolver lendo
 * é trabalho humano; o que a catraca garante é que ninguém acrescente uma
 * QUINTA sem perceber — site novo não resolvido faz `naoLidos` crescer e o
 * teste falhar pedindo que alguém olhe.
 *
 * 🔴 As tabelas do catálogo NÃO são listadas aqui: elas vêm de
 * `CATALOGO_POR_CHAVE`, lido de verdade. Congelar os nomes faria a catraca
 * ignorar o catálogo que alguém acrescentar amanhã.
 */
export const RESOLVIDOS_A_MAO = [
  {
    onde: "atendimento/dados.js :: cat.tabela",
    por: "sb(cat.tabela) — o alvo sai de CATALOGO_POR_CHAVE, enumerado abaixo",
    verbos: ["a"],
    doCatalogo: true,
  },
  {
    onde: "atendimento/dados.js :: `${cat.tabela}?id=eq.${encodeURIComponent(id)}`",
    por: "sb(`${cat.tabela}?id=eq.`) — mesmo catálogo",
    verbos: ["w"],
    doCatalogo: true,
  },
  {
    // `patchConferido(sb, recurso, campos)` é um ajudante local; os dois
    // chamadores passam caminho literal (linhas 121 e 197 do mesmo arquivo).
    onde: "ps/dados.js :: recurso",
    por: "patchConferido — os dois chamadores passam caminho literal",
    verbos: ["w"],
    tabelas: ["ps_atendimentos", "ps_registros"],
  },
  {
    onde: "ps/dados.js :: recurso2",
    por: "patchConferido, mesma função",
    verbos: ["w"],
    tabelas: ["ps_atendimentos", "ps_registros"],
  },
];

/**
 * Varre o código e devolve quem escreve onde.
 *
 * 🔴 `naoLidos` NÃO É DETALHE. Chamada cujo alvo é montado em variável
 * (`sb(\`${tabela}?...\`)`) não dá para resolver lendo texto — e silenciar
 * isso faria a catraca dizer "nenhum furo" quando o que houve foi "não
 * consegui olhar". É a mesma regra do `listaLida` do resto do projeto:
 * ausência de leitura não vira boa notícia.
 *
 * @returns {{ escritas: Map<string, Set<string>>, naoLidos: string[] }}
 *          escritas: tabela → conjunto de letras de verbo (a/w/d)
 */
export async function escritasDoCodigo(raiz) {
  const escritas = new Map();
  const naoLidos = [];

  // Lido de verdade, não congelado: catálogo novo entra sozinho na conta.
  const { CATALOGOS } = await import(
    pathToFileURL(path.join(raiz, "atendimento/catalogo.js")).href);
  const tabelasDoCatalogo = [...new Set(CATALOGOS.map(c => c.tabela).filter(Boolean))];

  for (const arquivo of arquivosDe(raiz)) {
    const texto = fs.readFileSync(arquivo, "utf8");
    const curto = path.relative(raiz, arquivo).replace(/\\/g, "/");

    for (const m of texto.matchAll(/method:\s*["'](POST|PATCH|PUT|DELETE)["']/g)) {
      const verbo = VERBO[m[1]];
      // O alvo está na chamada que abriu este objeto de opções: procura o
      // `sb(` mais próximo ANTES. Busca no texto, não por linha — a chamada
      // costuma ocupar várias.
      const i = texto.lastIndexOf("sb(", m.index);
      if (i < 0) continue;                       // não é uma chamada ao banco
      const alvo = texto.slice(i + 3, i + 160).match(/^\s*[`"']([a-z_][a-z_0-9]*)/);
      if (!alvo) {
        // 🔴 A CHAVE É A EXPRESSÃO, NÃO A LINHA. Número de linha anda
        // sozinho quando alguém edita acima, e a entrada resolvida deixaria
        // de casar em silêncio — a catraca voltaria a ter buraco sem
        // ninguém mexer nela.
        const expr = texto.slice(i + 3, i + 160).split(/,\s*\{/)[0].trim();
        const linha = texto.slice(0, m.index).split("\n").length;
        const onde = `${curto} :: ${expr}`;
        const resolvido = RESOLVIDOS_A_MAO.find(x => x.onde === onde);
        if (!resolvido) {
          naoLidos.push(`${curto}:${linha} — alvo montado em variável (${expr}), não dá para resolver lendo`);
          continue;
        }
        const tabelas = resolvido.doCatalogo ? tabelasDoCatalogo : (resolvido.tabelas || []);
        for (const t of tabelas) {
          if (!escritas.has(t)) escritas.set(t, new Set());
          for (const v of resolvido.verbos) escritas.get(t).add(v);
        }
        continue;
      }
      // `rpc/...` não é tabela: a função do banco é que escreve, com as
      // políticas dela valendo lá dentro.
      if (alvo[1] === "rpc") continue;
      if (!escritas.has(alvo[1])) escritas.set(alvo[1], new Set());
      escritas.get(alvo[1]).add(verbo);
    }
  }
  return { escritas, naoLidos };
}

/**
 * Cruza "onde o código escreve" com "o que o banco permite".
 *
 * Função pura de propósito: a regra fica onde dá para mutá-la com dados de
 * mentira, em milissegundos, em vez de reconstruir um banco inteiro a cada
 * tentativa. Quem a alimenta com a verdade é `banco-novo-nasce.test.js`,
 * depois do banco nascer.
 *
 * @param escritas Map<tabela, Set<letra de verbo>> — de `escritasDoCodigo`
 * @param politicas linhas de `pg_policy` × `pg_class`:
 *        { tabela, rls: boolean, cmd: 'a'|'w'|'d'|'r'|'*'|null, permissiva: boolean }
 */
export function furosDeEscrita(escritas, politicas) {
  const recebe = new Set();    // `tabela:verbo` com política PERMISSIVA
  const comRls = new Set();
  const existem = new Set();

  for (const p of politicas) {
    existem.add(p.tabela);
    if (p.rls) comRls.add(p.tabela);
    // 🔴 RESTRITIVA NÃO CONCEDE NADA. Ela só estreita o que uma permissiva
    // abriu; sozinha, nega tudo. Contá-la aqui faria a catraca dizer que a
    // escrita passa quando o banco a recusa em silêncio — que é exatamente
    // o defeito que esta catraca existe para pegar.
    if (p.cmd && p.permissiva) recebe.add(`${p.tabela}:${p.cmd}`);
  }

  const furos = [];
  const inexistentes = [];
  for (const [tabela, verbos] of [...escritas].sort()) {
    if (!existem.has(tabela)) { inexistentes.push(tabela); continue; }
    // Sem RLS ligado não há política a cobrar: a escrita passa.
    if (!comRls.has(tabela)) continue;
    for (const v of [...verbos].sort()) {
      if (recebe.has(`${tabela}:${v}`) || recebe.has(`${tabela}:*`)) continue;
      furos.push(`${tabela} — a tela faz ${NOME_DO_VERBO[v]} e não há política permissiva de ${NOME_DO_VERBO[v]}`);
    }
  }
  return { furos, inexistentes };
}
