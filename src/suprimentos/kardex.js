// ═══════════════════════════════════════════════════════════
// KARDEX DO ALMOXARIFADO — regra pura, sem React e sem rede
//
// Duas coisas moram aqui:
//
// 1. As funções que já existiam soltas no `App.jsx` (saldo, custo médio,
//    prazo de reposição, total do pedido). Vieram para cá sem mudar uma
//    vírgula do comportamento — a extração é o primeiro passo para que o
//    módulo de Suprimentos passe a ter regra testável, como o resto da casa.
//
// 2. A CONCILIAÇÃO, que é regra nova e o motivo deste PR.
//
// Por que a conciliação existe: o saldo do almoxarifado é **mantido**, não
// derivado. `sup_lotes.quantidade` é a única fonte que a tela lê; os
// movimentos são histórico paralelo, aplicados por um trigger. Duas fontes
// para o mesmo número, e nada no sistema jamais comparou uma com a outra.
// A divergência só apareceria na contagem física — que é justamente o
// instrumento que a divergência corrompe.
//
// Três caminhos conhecidos pelos quais elas se separam, todos verificados
// no `supabase/schema.sql`:
//   • `sup_movimentos.tipo` não tinha CHECK, e o trigger só confere saldo
//     quando o tipo é exatamente 'saida' — mas SUBTRAI para qualquer coisa
//     que não seja 'entrada'. Um 'saída' com acento furava o estoque.
//   • o `select ... into v_saldo` do trigger não travava a linha, então
//     duas saídas simultâneas liam o mesmo saldo e deixavam o lote negativo.
//   • `sup_movimentos.item_id` tem `on delete cascade`: excluir um material
//     apagava o histórico inteiro, apesar do comentário "kardex imutável".
//
// A migração deste PR fecha os três. A conciliação é o detector — para o
// que já aconteceu antes dela, e para o que ainda escapar depois.
// ═══════════════════════════════════════════════════════════

// ── Ponto de pedido ────────────────────────────────────────
/** Prazo de entrega assumido quando o fornecedor não tem prazo cadastrado. */
export const SUP_LEAD_PADRAO = 15;   // dias
/** Folga somada ao prazo de entrega. */
export const SUP_MARGEM_SEG = 3;     // dias

/**
 * Prazo de reposição de um item = (prazo do último fornecedor OU padrão) + margem.
 * `leadMap`: { item_id → dias }, montado por `supLeadTimeMap`.
 */
export const supPrazoReposicao = (itemId, leadMap = {}) =>
  (Number(leadMap[itemId]) || SUP_LEAD_PADRAO) + SUP_MARGEM_SEG;

/** Saldo total de um item = soma dos lotes. */
export function supSaldoTotal(itemId, lotes) {
  return lotes.filter(l => l.item_id === itemId).reduce((s, l) => s + Number(l.quantidade || 0), 0);
}

/**
 * item_id → prazo de entrega (dias) do fornecedor da ENTRADA mais recente
 * que o tenha cadastrado. `entradas` já vem do mais recente para o mais antigo.
 */
export function supLeadTimeMap(entradas, forns) {
  const fById = {}; forns.forEach(f => fById[f.id] = f);
  const seen = {}, map = {};
  entradas.forEach(e => {
    if (seen[e.item_id]) return;
    const lt = fById[e.fornecedor_id]?.lead_time_dias;
    if (lt != null && lt !== "") { map[e.item_id] = Number(lt); seen[e.item_id] = true; }
  });
  return map;
}

/**
 * Custo médio ponderado móvel: mistura o saldo atual (ao custo vigente) com a
 * entrada nova (ao custo da nota). Devolve o novo custo unitário, ou null se a
 * entrada não trouxe custo (mantém o custo anterior).
 */
export function custoMedioPonderado(custoAtual, saldoAntes, qtdEntrada, custoEntrada) {
  const ce = Number(custoEntrada);
  if (!ce || ce <= 0) return null;
  const ca = Number(custoAtual || 0), sa = Math.max(0, Number(saldoAntes || 0)), qe = Number(qtdEntrada || 0);
  if (qe <= 0) return null;
  if (ca <= 0 || sa <= 0) return ce;                 // sem base anterior → adota o custo da entrada
  return (sa * ca + qe * ce) / (sa + qe);
}

/** Valor total do pedido (qtd × custo unitário dos itens). */
export function supPedidoTotal(ped) {
  const its = Array.isArray(ped.itens) ? ped.itens : [];
  return its.reduce((s, x) => s + Number(x.qtd || 0) * Number(x.custo_unit || 0), 0);
}

// ── Conciliação kardex × saldo ─────────────────────────────

/**
 * O efeito que UM movimento teve sobre o saldo do lote.
 *
 * Espelha o trigger `sup_aplica_movimento` de propósito, incluindo o defeito:
 * ele soma quando o tipo é 'entrada' e SUBTRAI em qualquer outro caso. Se
 * aqui fosse escrito o certo (`tipo === 'saida' ? -q : +q`), a conciliação
 * discordaria do banco justamente nas linhas estragadas — e apontaria
 * divergência onde o saldo está correto para o que foi gravado.
 *
 * A conciliação relata o mundo como ele é; quem conserta o mundo é a
 * migração.
 */
export function efeitoDoMovimento(mv) {
  const q = Number(mv?.quantidade || 0);
  // `q === 0` sai antes do sinal de propósito: `-0` soma igual a `0`, mas
  // chega até a tela como "-0" numa coluna de diferença. Detalhe bobo que
  // faz o operador desconfiar do indicador inteiro.
  if (!Number.isFinite(q) || q === 0) return 0;
  return mv?.tipo === "entrada" ? q : -q;
}

/** O tipo é um dos dois que o sistema reconhece? */
export const tipoValido = tipo => tipo === "entrada" || tipo === "saida";

/**
 * Compara o que o histórico diz com o que o saldo guarda.
 *
 * `movimentos` — linhas de `sup_movimentos` (precisa ser o histórico INTEIRO).
 * `lotes`      — linhas de `sup_lotes`.
 * `historicoCompleto` — false quando a consulta bateu no teto e trouxe só
 *   parte dos movimentos.
 *
 * 🔴 O terceiro estado outra vez: com histórico truncado NÃO SE CONCILIA.
 * Somar metade dos movimentos e comparar com o saldo cheio acusaria
 * divergência em quase todo lote — e mandaria a equipe caçar um rombo que
 * não existe. Sem o histórico inteiro a resposta é "não sei", nunca "está
 * errado". (Mesma disciplina do checklist de implantação: um número que
 * pode significar três coisas não pode virar acusação.)
 */
export function conciliar(movimentos, lotes, { historicoCompleto = true } = {}) {
  const vazio = {
    conciliavel: false, linhas: [], divergentes: 0, negativos: 0,
    tiposInvalidos: 0, semHistorico: 0, orfaos: 0, totalLotes: 0,
  };
  if (!Array.isArray(movimentos) || !Array.isArray(lotes)) return vazio;
  if (!historicoCompleto) return { ...vazio, totalLotes: lotes.length };

  // soma dos movimentos por lote, e as anomalias encontradas no caminho
  const somaPorLote = new Map();
  const invalidosPorLote = new Map();
  let tiposInvalidos = 0;
  for (const mv of movimentos) {
    const id = mv?.lote_id;
    if (id == null) continue;                      // o trigger sempre preenche; se faltou, não dá para atribuir
    somaPorLote.set(id, (somaPorLote.get(id) || 0) + efeitoDoMovimento(mv));
    if (!tipoValido(mv?.tipo)) {
      tiposInvalidos++;
      invalidosPorLote.set(id, (invalidosPorLote.get(id) || 0) + 1);
    }
  }

  const linhas = [];
  const vistos = new Set();
  for (const l of lotes) {
    vistos.add(l.id);
    const temHistorico = somaPorLote.has(l.id);
    const kardex = somaPorLote.get(l.id) || 0;
    const saldo = Number(l.quantidade || 0);
    // Arredondamento: quantidade é numeric e pode ter casas decimais
    // (litro, mililitro). Comparar float por igualdade exata produziria
    // divergência de 1e-15 e destruiria a confiança no indicador.
    const diferenca = Math.round((saldo - kardex) * 1e6) / 1e6;
    linhas.push({
      lote_id: l.id, item_id: l.item_id, lote: l.lote, validade: l.validade,
      saldo, kardex, diferenca,
      negativo: saldo < 0,
      semHistorico: !temHistorico && saldo !== 0,
      tiposInvalidos: invalidosPorLote.get(l.id) || 0,
    });
  }

  // Movimentos que apontam para um lote que não existe mais: o histórico
  // sobreviveu, o saldo não. Não entra em `linhas` porque não há lote para
  // conciliar — mas precisa ser contado, senão some da vista.
  let orfaos = 0;
  for (const id of somaPorLote.keys()) if (!vistos.has(id)) orfaos++;

  return {
    conciliavel: true,
    linhas,
    divergentes: linhas.filter(x => x.diferenca !== 0).length,
    negativos: linhas.filter(x => x.negativo).length,
    semHistorico: linhas.filter(x => x.semHistorico).length,
    tiposInvalidos,
    orfaos,
    totalLotes: linhas.length,
  };
}

/**
 * As linhas que merecem olho humano, pior primeiro.
 *
 * Ordem deliberada: saldo negativo antes de tudo (é estado impossível, não
 * imprecisão), depois a maior diferença absoluta. Um lote negativo de −2 é
 * mais urgente que uma diferença de +500, porque negativo significa que uma
 * saída passou por cima de uma trava.
 */
export function prioridadeDaConciliacao(linhas = []) {
  return linhas
    .filter(x => x.diferenca !== 0 || x.negativo || x.semHistorico || x.tiposInvalidos > 0)
    .sort((a, b) => (Number(b.negativo) - Number(a.negativo)) || (Math.abs(b.diferenca) - Math.abs(a.diferenca)));
}
