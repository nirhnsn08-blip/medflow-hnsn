// ═══════════════════════════════════════════════════════════
// AJUSTE DE INVENTÁRIO E ESTORNO — regra pura, sem React e sem rede
//
// Duas correções que andam juntas, porque são o mesmo buraco visto de dois
// lados: o sistema não sabia desfazer nada, e mentia quando tentava.
//
// ── O ajuste que mentia ────────────────────────────────────
// A contagem é por ITEM; o estoque é por LOTE. O código antigo lançava o
// ajuste SEM lote — o que o trigger joga no balde genérico ''. Quando o
// estoque do item está todo em lotes nomeados, esse balde está vazio, a
// saída de ajuste bate em saldo zero, e o trigger recusa com "Estoque
// insuficiente no lote".
//
// E o retorno não era conferido. Então `sup_inventarios.ajustado` gravava
// `true`, o saldo não mudava, e a KPI de acuracidade passava a mentir —
// para sempre, porque a próxima contagem acharia a mesma divergência e
// "ajustaria" de novo.
//
// ── O estorno que não existia ──────────────────────────────
// Não havia como desfazer um lançamento errado. A tela mandava "devolva os
// itens por Entrada", o que cria um movimento solto, sem vínculo com a
// saída original — e o rastro fica ilegível justamente no lugar onde
// alguém vai procurar quando faltar material.
//
// O kardex é append-only e deve continuar sendo: estorno não apaga nada,
// cria o movimento oposto APONTANDO para o original.
// ═══════════════════════════════════════════════════════════

/** Motivo padrão dos movimentos gerados por contagem. */
export const MOTIVO_AJUSTE = "Ajuste de inventário";
/** Motivo padrão dos movimentos de estorno. */
export const MOTIVO_ESTORNO = "Estorno";

/** O documento que amarra os movimentos de ajuste à contagem que os gerou. */
export const documentoDaContagem = invId => `INV-${invId}`;

/**
 * Ordem FEFO: vence primeiro, sai primeiro. Lote sem validade vai para o
 * fim — não porque seja melhor, mas porque não dá para afirmar que vence
 * depois; na dúvida, mexe-se no que se conhece.
 */
export function ordemFefo(lotes = []) {
  return [...lotes].sort((a, b) => {
    const va = a?.validade || null, vb = b?.validade || null;
    if (va && vb) return va < vb ? -1 : va > vb ? 1 : 0;
    if (va) return -1;
    if (vb) return 1;
    return 0;
  });
}

/**
 * Como o ajuste vai ser lançado — em quais lotes e em que sentido.
 *
 * Devolve `{ ok, passos, motivo }`. `passos` é uma lista de
 * `{ lote, validade, tipo, quantidade }`, já pronta para virar movimento.
 *
 * As regras, e por que cada uma:
 *
 * • FALTA (contou menos que o sistema) → tira por FEFO. O que vence
 *   primeiro é o que teria sido consumido; é a suposição menos arbitrária.
 *   Pode precisar de mais de um lote.
 *
 * • SOBRA (contou mais) → precisa de UM lote de destino, e aí o sistema
 *   não tem como adivinhar. Com um lote só, é ele. Com nenhum, vai para o
 *   balde genérico (o item ainda não tem lote nomeado). Com mais de um,
 *   RECUSA e pede que a pessoa escolha: jogar unidade no lote errado
 *   corrompe a validade e o FEFO — e o erro só aparece meses depois, na
 *   forma de material vencido que o sistema jurava estar bom.
 *
 * • Falta maior que o saldo total → RECUSA. Não dá para tirar o que não
 *   existe; o trigger recusaria de qualquer jeito, e é melhor explicar
 *   antes do que falhar depois.
 */
export function planejarAjuste(diferenca, lotes = [], { loteEscolhido = null } = {}) {
  const dif = Number(diferenca);
  if (!Number.isFinite(dif) || dif === 0) return { ok: true, passos: [], motivo: null };

  const comSaldo = (lotes || []).filter(l => Number(l?.quantidade || 0) > 0);

  // ── SOBRA: uma entrada, num lote só ──
  if (dif > 0) {
    if (loteEscolhido != null) {
      const l = (lotes || []).find(x => (x.lote || "") === loteEscolhido);
      return { ok: true, passos: [{ lote: loteEscolhido, validade: l?.validade || null, tipo: "entrada", quantidade: dif }], motivo: null };
    }
    if (comSaldo.length === 1) {
      const l = comSaldo[0];
      return { ok: true, passos: [{ lote: l.lote || "", validade: l.validade || null, tipo: "entrada", quantidade: dif }], motivo: null };
    }
    if (comSaldo.length === 0) {
      return { ok: true, passos: [{ lote: "", validade: null, tipo: "entrada", quantidade: dif }], motivo: null };
    }
    return {
      ok: false, passos: [],
      motivo: `O item tem ${comSaldo.length} lotes com saldo. Escolha em qual lote entram as ${dif} unidade(s) a mais — o sistema não tem como adivinhar, e lote errado estraga o controle de validade.`,
    };
  }

  // ── FALTA: saídas por FEFO, quantas forem precisas ──
  const falta = Math.abs(dif);
  const total = comSaldo.reduce((s, l) => s + Number(l.quantidade || 0), 0);
  if (total < falta) {
    return {
      ok: false, passos: [],
      motivo: `Faltam ${falta} unidade(s), mas os lotes somam ${total}. Não é possível tirar do estoque mais do que ele tem — confira a contagem.`,
    };
  }
  const passos = [];
  let resta = falta;
  for (const l of ordemFefo(comSaldo)) {
    if (resta <= 0) break;
    const tira = Math.min(resta, Number(l.quantidade || 0));
    if (tira <= 0) continue;
    passos.push({ lote: l.lote || "", validade: l.validade || null, tipo: "saida", quantidade: tira });
    resta -= tira;
  }
  return { ok: true, passos, motivo: null };
}

/** Frase curta descrevendo o plano, para a pessoa ver ANTES de confirmar. */
export function descreverPlano(passos = []) {
  if (!passos.length) return "Nada a ajustar.";
  return passos
    .map(p => `${p.tipo === "entrada" ? "entra" : "sai"} ${p.quantidade} ${p.lote ? `no lote ${p.lote}` : "sem lote"}`)
    .join("; ");
}

// ── Estorno ────────────────────────────────────────────────

/**
 * Este movimento pode ser estornado?
 *
 * `jaEstornados` — conjunto (ou lista) de ids que já têm estorno. O banco
 * garante isso com índice único em `estorno_de`; aqui é só para a tela não
 * oferecer um botão que vai falhar.
 *
 * Estornar um estorno É permitido — desfazer uma desfeita é legítimo, e o
 * encadeamento fica autodocumentado no kardex. O que não se permite é
 * estornar DUAS VEZES o mesmo movimento, que é como se inventa estoque.
 */
export function podeEstornar(mv, jaEstornados = []) {
  if (!mv?.id) return { ok: false, motivo: "Movimento sem identificador." };
  const set = jaEstornados instanceof Set ? jaEstornados : new Set(jaEstornados);
  if (set.has(mv.id)) return { ok: false, motivo: "Este movimento já foi estornado." };
  if (!(mv.tipo === "entrada" || mv.tipo === "saida")) {
    return { ok: false, motivo: `Tipo inválido (${mv.tipo}) — corrija o movimento antes de estornar.` };
  }
  if (!(Number(mv.quantidade) > 0)) return { ok: false, motivo: "Quantidade inválida." };
  return { ok: true, motivo: null };
}

/**
 * O movimento oposto que desfaz um lançamento.
 *
 * Mesmo item, MESMO LOTE e mesma quantidade, tipo invertido, apontando
 * para o original. Não leva `custo_unit`: estorno não é compra nem venda,
 * e deixar custo aqui mexeria no custo médio ponderado — trocando um erro
 * de quantidade por um erro de valor.
 *
 * `chave` é a coluna que identifica o QUE se move: `item_id` no
 * almoxarifado, `medicamento_id` na farmácia. As duas tabelas são o mesmo
 * kardex com nomes diferentes, e uma segunda cópia desta função divergiria
 * da primeira na próxima regra que mudasse.
 *
 * `copiar` são colunas do original que o estorno carrega junto. A farmácia
 * usa para o paciente: sem isso, a devolução aparece no kardex como uma
 * entrada anônima, e quem procura "para onde foi este remédio" perde o fio
 * exatamente onde ele importa.
 */
export function movimentoDeEstorno(mv, { motivo = null, chave = "item_id", copiar = [] } = {}) {
  const out = {
    [chave]: mv[chave],
    lote: mv.lote || "",
    tipo: mv.tipo === "entrada" ? "saida" : "entrada",
    quantidade: Number(mv.quantidade),
    motivo: motivo || MOTIVO_ESTORNO,
    documento: mv.documento || null,
    estorno_de: mv.id,
  };
  for (const c of copiar) if (mv[c] != null) out[c] = mv[c];
  return out;
}

/** Os ids que já possuem estorno, a partir da lista de movimentos. */
export function idsJaEstornados(movimentos = []) {
  return new Set((movimentos || []).map(m => m?.estorno_de).filter(v => v != null));
}
