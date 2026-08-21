// ═══════════════════════════════════════════════════════════
// UNIDADE DE COMPRA × UNIDADE DE CONSUMO — regra pura
//
// `sup_itens` tinha UMA coluna `unidade`. Só que o almoxarifado compra
// caixa com 100 luvas e entrega par. Sem separar as duas, o comprador
// digita "qtd 1" e o `custo_unitario` vira R$/caixa — enquanto as saídas
// saem em unidades. A partir daí, tudo que mistura os dois números está
// numericamente errado:
//
//   • custo médio ponderado (R$/caixa somado a saldo em unidades)
//   • curva ABC (valor de giro calculado sobre o custo trocado)
//   • ponto de pedido (consumo em unidades × saldo contado em caixas)
//   • total do pedido de compra
//
// Nada disso dá erro na tela. O sistema segue funcionando e respondendo
// com números errados, que é o pior tipo de defeito num módulo cuja função
// é justamente dizer quanto tem e quanto custa.
//
// ── A escolha de desenho ───────────────────────────────────
// O ESTOQUE CONTINUA SEMPRE EM UNIDADE DE CONSUMO. A conversão acontece
// num lugar só: quando a compra entra (recebimento e importação de NF-e).
// Assim o saldo, o kardex, a conciliação e todos os indicadores seguem
// falando a mesma língua que já falavam, e nenhum deles precisa saber que
// a conversão existe.
//
// ── Compatibilidade ───────────────────────────────────────
// Item sem fator cadastrado vale 1 — os 124 materiais que já existem se
// comportam exatamente como antes. A conversão só muda alguma coisa para
// quem declarar que compra numa unidade diferente da que consome.
// ═══════════════════════════════════════════════════════════

/** Quantas unidades de consumo cabem numa unidade de compra, quando não se declarou. */
export const FATOR_PADRAO = 1;

/**
 * O fator do item, sempre um número > 0.
 *
 * Fator inválido (zero, negativo, texto, nulo) cai no padrão em vez de
 * propagar: dividir custo por zero devolveria `Infinity` e multiplicar por
 * negativo criaria estoque negativo na entrada. Um número errado que passa
 * silenciosamente é o defeito que este arquivo existe para evitar — não
 * faz sentido introduzir outro.
 */
export function fatorDe(item) {
  const f = Number(item?.fator_conversao);
  return Number.isFinite(f) && f > 0 ? f : FATOR_PADRAO;
}

/** O item declara que compra numa unidade diferente da que consome? */
export function temConversao(item) {
  return fatorDe(item) !== 1 || !!(item?.unidade_compra || "").trim();
}

/** Quantidade comprada (caixas) → quantidade que entra no estoque (unidades). */
export function comprarParaConsumo(qtdCompra, item) {
  const q = Number(qtdCompra);
  if (!Number.isFinite(q)) return 0;
  return q * fatorDe(item);
}

/**
 * Custo da nota (R$ por unidade de COMPRA) → R$ por unidade de CONSUMO.
 *
 * É a metade da correção que ninguém vê: sem dividir, a caixa de R$ 80
 * entra como R$ 80 por luva, e o custo médio do item nunca mais volta ao
 * lugar — porque o custo médio é ponderado e carrega o erro para frente.
 */
export function custoPorUnidadeConsumo(custoCompra, item) {
  const c = Number(custoCompra);
  if (!Number.isFinite(c) || c <= 0) return null;
  return c / fatorDe(item);
}

/**
 * R$ por unidade de CONSUMO → R$ por unidade de COMPRA.
 *
 * O caminho de volta, para o pedido: o custo médio do item é guardado por
 * unidade de consumo, mas o fornecedor cobra por caixa. Sem multiplicar, o
 * pedido de 3 caixas de luva apareceria valendo R$ 2,40 em vez de R$ 240 —
 * e é esse número que a aprovação por valor vai olhar.
 */
export function custoPorUnidadeCompra(custoConsumo, item) {
  const c = Number(custoConsumo);
  if (!Number.isFinite(c) || c <= 0) return null;
  return c * fatorDe(item);
}

/**
 * Quantidade a consumir (unidades) → quantas unidades de compra pedir.
 *
 * Arredonda para CIMA: não se compra meia caixa, e faltar material por
 * arredondamento para baixo é pior que sobrar.
 */
export function consumoParaCompra(qtdConsumo, item) {
  const q = Number(qtdConsumo);
  if (!Number.isFinite(q) || q <= 0) return 0;
  return Math.ceil(q / fatorDe(item));
}

/** Como chamar a unidade de compra na tela. */
export function rotuloCompra(item) {
  const uc = (item?.unidade_compra || "").trim();
  const f = fatorDe(item);
  if (!uc && f === 1) return item?.unidade || "unidade";
  const base = uc || item?.unidade || "unidade";
  return f === 1 ? base : `${base} (${f} ${item?.unidade || "un"})`;
}

/** Frase para conferir a entrada antes de confirmar. */
export function descreverEntrada(qtdCompra, item) {
  const f = fatorDe(item);
  const q = Number(qtdCompra) || 0;
  if (f === 1) return `${q} ${item?.unidade || "unidade"}`;
  return `${q} ${(item?.unidade_compra || "unidade de compra").trim()} = ${comprarParaConsumo(q, item)} ${item?.unidade || "un"}`;
}

/**
 * O que impede salvar o cadastro do item.
 *
 * Devolve lista de erros (bloqueiam) e de avisos (só alertam). O fator é
 * o único bloqueio: um valor inválido aqui contamina custo, ABC e ponto de
 * pedido de tudo que passar por este item daqui para a frente.
 */
export function validarConversao(item) {
  const erros = [], avisos = [];
  const bruto = item?.fator_conversao;
  const preenchido = bruto !== null && bruto !== undefined && String(bruto).trim() !== "";
  const f = Number(bruto);

  if (preenchido) {
    if (!Number.isFinite(f)) erros.push("O fator de conversão precisa ser um número.");
    else if (f <= 0) erros.push("O fator de conversão precisa ser maior que zero.");
    else if (!Number.isInteger(f) && f < 1) {
      avisos.push("Fator menor que 1 significa que a unidade de compra é MENOR que a de consumo. Confira se não está invertido.");
    }
  }

  const uc = (item?.unidade_compra || "").trim();
  if (uc && (!preenchido || f === 1)) {
    avisos.push(`Você declarou a unidade de compra "${uc}" mas o fator é 1 — nada será convertido. Se a caixa tem 100, o fator é 100.`);
  }
  if (!uc && preenchido && f !== 1 && Number.isFinite(f)) {
    avisos.push("Informe o nome da unidade de compra (ex.: caixa, fardo) para a tela do pedido ficar clara.");
  }
  return { erros, avisos, ok: erros.length === 0 };
}
