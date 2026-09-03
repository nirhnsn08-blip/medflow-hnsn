// ═══════════════════════════════════════════════════════════
// IMPORTAR TABELA DE PREÇO — colar a planilha da operadora
//
// 🔴 POR QUE ISTO EXISTE. A tela de convênios cadastra preço UM A UM. Uma
// tabela de operadora tem centenas de linhas. O resultado prático é que
// `at_precos` fica vazia, e enquanto ela está vazia **a conta da Unimed
// continua sendo precificada pela tabela do SUS** — que é exatamente o
// defeito que o módulo de preços foi escrito para consertar. Sem um jeito
// de carregar em lote, o conserto não chega a acontecer.
//
// ⚠️ ESTE ARQUIVO NÃO GRAVA NADA. Ele lê o texto colado e devolve um PLANO:
// o que entra, o que é recusado e por quê. Quem grava é a tela, depois que
// alguém olhou o plano. Importação que escreve antes de mostrar é como se
// descobre, meses depois, que a tabela inteira entrou dividida por cem.
//
// ⚠️ E ELE NÃO ADIVINHA NÚMERO AMBÍGUO. Ver `lerNumero` — é a parte mais
// importante do arquivo.
// ═══════════════════════════════════════════════════════════

import { listaLida } from "../util/leitura.js";
import { diaDe } from "./precos.js";
import { ESTILO, lerNumero, estiloDaColuna } from "../util/numero-brasileiro.js";

// Reexportados porque a tela e os testes desta importação falam deles — mas
// eles NÃO pertencem a esta tela: o formulário de preço avulso lê número com
// as mesmas regras. Dois leitores de número seriam duas contas diferentes.
export { ESTILO, lerNumero, estiloDaColuna };

const mesmoCodigo = (a, b) =>
  String(a ?? "").trim().toUpperCase() === String(b ?? "").trim().toUpperCase();

// ─────────────────────────────────────────────────────────────
// SEPARADOR DE COLUNA
// ─────────────────────────────────────────────────────────────

/**
 * 🔴 A ORDEM AQUI NÃO É ESTÉTICA. No Brasil a vírgula é separador DECIMAL,
 * e também é o separador de coluna do CSV de fábrica. Num arquivo com
 * `Ácido;1.234,56`, cortar na vírgula parte o preço no meio e transforma
 * R$ 1.234,56 em duas colunas ("1.234" e "56").
 *
 * Por isso: TAB primeiro (é o que sai ao colar do Excel, e nunca aparece
 * dentro de um número), depois ponto-e-vírgula (o CSV brasileiro), e só
 * então a vírgula. Quando mesmo assim o corte sair errado, a contagem de
 * colunas da linha não bate com a do cabeçalho — e a linha é RECUSADA em
 * vez de entrar torta.
 */
export function detectarSeparador(texto) {
  const linhas = String(texto ?? "").split(/\r?\n/).filter(l => l.trim());
  if (!linhas.length) return null;
  const amostra = linhas.slice(0, 5).join("\n");
  if (amostra.includes("\t")) return "\t";
  if (amostra.includes(";")) return ";";
  if (amostra.includes(",")) return ",";
  return null;
}

/** Texto colado → `{ sep, cabecalho: [], linhas: [[]] }`. */
export function separarColunas(texto) {
  const sep = detectarSeparador(texto);
  const cruas = String(texto ?? "").split(/\r?\n/).filter(l => l.trim());
  if (!sep || !cruas.length) return { sep: null, cabecalho: [], linhas: [] };
  const parte = l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, "").trim());
  return { sep, cabecalho: parte(cruas[0]), linhas: cruas.slice(1).map(parte) };
}

// ─────────────────────────────────────────────────────────────
// QUAL COLUNA É QUAL
// ─────────────────────────────────────────────────────────────

const SEM_ACENTO = s =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Cada operadora nomeia as colunas do seu jeito. Estes são os nomes que
 * aparecem de verdade nas tabelas que circulam.
 *
 * ⚠️ A ordem dentro de cada lista importa: o primeiro que casar ganha, e os
 * mais específicos vêm antes. "valor total" tem que perder para "valor
 * unitário" quando as duas existem, senão importa-se o total da remessa
 * como se fosse o preço do procedimento.
 */
const NOMES = {
  codigo:    ["codigo tuss", "cod tuss", "tuss", "codigo do procedimento", "cod procedimento", "codigo", "cod", "procedimento"],
  valor:     ["valor unitario", "vlr unitario", "preco unitario", "valor negociado", "valor", "preco", "vlr", "r$"],
  descricao: ["descricao do procedimento", "descricao", "procedimento", "nome", "especificacao"],
  tabela:    ["tabela", "tab", "origem"],
};

/** Cabeçalho → índice de cada coluna (ou null). */
export function acharColunas(cabecalho) {
  const cols = listaLida(cabecalho).map(SEM_ACENTO);
  const achar = nomes => {
    for (const n of nomes) {
      const i = cols.indexOf(n);
      if (i >= 0) return i;
    }
    for (const n of nomes) {
      const i = cols.findIndex(c => c.includes(n));
      if (i >= 0) return i;
    }
    return null;
  };
  const codigo = achar(NOMES.codigo);
  const valor = achar(NOMES.valor);
  let descricao = achar(NOMES.descricao);
  // "procedimento" serve de código E de descrição. Se caiu nas duas, é código.
  if (descricao === codigo) descricao = null;
  return { codigo, valor, descricao, tabela: achar(NOMES.tabela) };
}

// ─────────────────────────────────────────────────────────────
// O PLANO
// ─────────────────────────────────────────────────────────────

export const ENTRA = "entra";
export const RECUSADA = "recusada";

const vazio = () => ({ lidas: 0, entram: 0, recusadas: 0, soma: 0, ambiguas: 0 });

/**
 * Lê o texto colado e devolve o que ACONTECERIA, sem gravar.
 *
 * ⚠️ As recusas de linha repetem de propósito as regras que o banco já tem
 * (`EXCLUDE` de vigência, valor não-negativo). O banco recusa de qualquer
 * jeito — mas recusa na linha 174 de 300, com a 173 já gravada. Conferir
 * antes é o que evita a tabela pela metade.
 */
export function analisarImportacao({
  texto, convenioId, vigenciaInicio, vigenciaFim = null,
  precosExistentes = [], tabelaPadrao = null,
} = {}) {
  const { sep, cabecalho, linhas } = separarColunas(texto);
  const problemas = [];

  if (!sep || !linhas.length) {
    return {
      ok: false, linhas: [], resumo: vazio(),
      problemas: ["Nada para importar. Cole a tabela com o cabeçalho na primeira linha."],
    };
  }
  if (!convenioId) problemas.push("Escolha o convênio: preço é sempre de alguém.");
  if (!diaDe(vigenciaInicio)) problemas.push("Informe o início da vigência: sem ele não dá para dizer de quando o preço vale.");
  if (vigenciaFim && diaDe(vigenciaFim) && diaDe(vigenciaInicio) && diaDe(vigenciaFim) < diaDe(vigenciaInicio)) {
    problemas.push("A vigência não pode terminar antes de começar.");
  }

  const col = acharColunas(cabecalho);
  if (col.codigo == null) problemas.push(`Não achei a coluna de código. O cabeçalho lido foi: ${cabecalho.join(" | ") || "(vazio)"}.`);
  if (col.valor == null) problemas.push(`Não achei a coluna de valor. O cabeçalho lido foi: ${cabecalho.join(" | ") || "(vazio)"}.`);
  if (problemas.length) return { ok: false, problemas, linhas: [], resumo: vazio(), colunas: col, cabecalho };

  const estilo = estiloDaColuna(linhas.map(l => l[col.valor]));
  const ini = diaDe(vigenciaInicio);
  const fim = diaDe(vigenciaFim) || "9999-12-31";
  const jaVistos = new Map();

  const saida = linhas.map((celulas, i) => {
    const n = i + 2;                     // +1 do cabeçalho, +1 porque gente conta do 1
    const motivos = [];
    const codigo = String(celulas[col.codigo] ?? "").trim();
    const bruto = celulas[col.valor];
    const descricao = col.descricao != null ? String(celulas[col.descricao] ?? "").trim() : "";
    const tabela = col.tabela != null ? String(celulas[col.tabela] ?? "").trim() : (tabelaPadrao || "");

    // 🔴 Coluna a mais ou a menos é sinal de corte errado — o caso do CSV
    // com vírgula em que o preço partiu no meio. Recusar é obrigatório: as
    // células estão DESLOCADAS, e o valor lido é o de outra coluna.
    if (celulas.length !== cabecalho.length) {
      motivos.push(`A linha tem ${celulas.length} colunas e o cabeçalho tem ${cabecalho.length}. As células saíram trocadas de lugar.`);
    }
    if (!codigo) motivos.push("Sem código: o preço não encontra procedimento nenhum.");

    const num = lerNumero(bruto, estilo);
    if (num.ambiguo) motivos.push(num.motivo);
    else if (num.valor == null) motivos.push(num.motivo || "Valor inválido.");
    else if (num.valor < 0) motivos.push("Preço negativo não existe. Zero existe — é procedimento incluso no pacote.");

    // 🔴 Repetido DENTRO do próprio lote. O banco recusaria o segundo pelo
    // EXCLUDE, no meio da gravação, deixando metade da tabela dentro.
    if (codigo) {
      const antes = jaVistos.get(codigo.toUpperCase());
      if (antes) motivos.push(`Código repetido: já aparece na linha ${antes} desta mesma tabela. Duas linhas não podem valer no mesmo período.`);
      else jaVistos.set(codigo.toUpperCase(), n);
    }

    // Choque com o que já está no banco.
    if (codigo && !motivos.length) {
      const choque = listaLida(precosExistentes).find(p =>
        p?.ativo !== false && p?.convenio_id === convenioId && mesmoCodigo(p?.codigo, codigo) &&
        ini <= (diaDe(p?.vigencia_fim) || "9999-12-31") && (diaDe(p?.vigencia_inicio) || "0000-01-01") <= fim);
      if (choque) {
        motivos.push(`Já existe preço deste código para este convênio de ${choque.vigencia_inicio} a ${choque.vigencia_fim || "prazo indeterminado"}. Encerre o anterior antes.`);
      }
    }

    return {
      n, codigo, descricao, tabela, bruto,
      valor: motivos.length ? null : num.valor,
      situacao: motivos.length ? RECUSADA : ENTRA,
      motivos,
    };
  });

  const entram = saida.filter(l => l.situacao === ENTRA);
  return {
    ok: entram.length > 0,
    problemas: entram.length ? [] : ["Nenhuma linha passou. Veja o motivo ao lado de cada uma."],
    linhas: saida,
    colunas: col,
    cabecalho,
    estilo,
    resumo: {
      lidas: saida.length,
      entram: entram.length,
      recusadas: saida.length - entram.length,
      soma: entram.reduce((s, l) => s + l.valor, 0),
      // ⚠️ Ambígua com `estilo === null` é planilha que precisa ser
      // arrumada na origem — não é coisa de resolver aqui no chute.
      ambiguas: saida.filter(l => l.motivos.some(m => /mil vezes/.test(m))).length,
    },
  };
}

/** As linhas aprovadas, no formato que `salvarPreco` espera. */
export function paraGravar(plano, { convenioId, vigenciaInicio, vigenciaFim = null } = {}) {
  return listaLida(plano?.linhas).filter(l => l.situacao === ENTRA).map(l => ({
    convenio_id: convenioId,
    codigo: l.codigo,
    descricao: l.descricao || null,
    tabela: l.tabela || null,
    // 🔴 NÚMERO, não texto. O valor já foi lido aqui, com a coluna inteira
    // como contexto. Mandar texto faria `salvarPreco` reinterpretar sozinho,
    // sem esse contexto — e reinterpretar "1234.56" é exatamente como se
    // gravava R$ 123.456,00 no lugar de R$ 1.234,56.
    valor: l.valor,
    vigencia_inicio: diaDe(vigenciaInicio),
    vigencia_fim: diaDe(vigenciaFim) || null,
    ativo: true,
  }));
}
