// ═══════════════════════════════════════════════════════════
// PREÇO POR CONVÊNIO — a tabela que faltava
//
// 🔴 O DEFEITO QUE ISTO CONSERTA: hoje o preço sai de
// `at_procedimentos.valor_sus` com fallback para o SIGTAP, e não existe
// dimensão de convênio em lugar nenhum. **Uma conta da Unimed é
// precificada pela tabela do SUS.** A conta fecha, sai na remessa, e volta
// glosada ou paga a menor — sem nenhum erro em tela no caminho.
//
// ⚠️ TRÊS RESPOSTAS, NÃO DUAS. "Quanto custa este procedimento para este
// convênio?" tem três desfechos diferentes, e colapsá-los é a armadilha
// desta tela:
//
//   ACHADO    há preço vigente na data          → use
//   VENCIDO   houve preço, e a vigência acabou  → o contrato precisa de
//             aditivo; NÃO é a mesma coisa que nunca ter existido
//   AUSENTE   nunca houve preço para este par   → alguém precisa cadastrar
//
// "Vencido" lido como "ausente" faz o hospital procurar cadastro que já
// existe, em vez de cobrar o aditivo da operadora.
//
// ⚠️ ISTO NÃO REPREÇA CONTA LANÇADA. `at_conta_itens.valor_unitario` é
// gravado no lançamento de propósito — a conta de março continua valendo o
// preço de março. Aqui só se produz a SUGESTÃO.
// ═══════════════════════════════════════════════════════════

import { listaLida, naoDeuParaLer } from "../util/leitura.js";

export const SITUACAO = {
  ACHADO:  "achado",
  VENCIDO: "vencido",
  AUSENTE: "ausente",
  SEM_LEITURA: "nao_deu_para_ler",
};

/** Data (string ou Date) → "AAAA-MM-DD", ou null se ilegível. */
export function diaDe(d) {
  if (!d) return null;
  if (d instanceof Date) {
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  const s = String(d).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** O preço vale nesta data? Vigência é fechada nos dois lados (`[]`). */
export function vigenteEm(preco, dia) {
  if (!dia || preco?.ativo === false) return false;
  const ini = diaDe(preco?.vigencia_inicio);
  if (!ini || dia < ini) return false;
  const fim = diaDe(preco?.vigencia_fim);
  return !fim || dia <= fim;          // fim nulo = prazo indeterminado
}

const mesmoCodigo = (a, b) =>
  String(a ?? "").trim().toUpperCase() === String(b ?? "").trim().toUpperCase();

/**
 * O preço de um procedimento para um convênio, numa data.
 *
 * Devolve `{ situacao, preco, ultimoVencido }` — nunca só o número, porque
 * a AUSÊNCIA de número é metade da informação.
 */
export function precoDe(precos, { convenioId, codigo, dia } = {}) {
  if (naoDeuParaLer(precos)) return { situacao: SITUACAO.SEM_LEITURA, preco: null, ultimoVencido: null };

  const d = diaDe(dia) || diaDe(new Date());
  const doPar = listaLida(precos).filter(p =>
    p?.convenio_id === convenioId && mesmoCodigo(p?.codigo, codigo) && p?.ativo !== false);

  if (!doPar.length) return { situacao: SITUACAO.AUSENTE, preco: null, ultimoVencido: null };

  const vigente = doPar.find(p => vigenteEm(p, d));
  if (vigente) return { situacao: SITUACAO.ACHADO, preco: vigente, ultimoVencido: null };

  // Houve preço, mas nenhum vale hoje. O mais recente que JÁ terminou é o
  // que a tela precisa mostrar: é ele que pede aditivo.
  const terminados = doPar
    .filter(p => { const f = diaDe(p?.vigencia_fim); return f && f < d; })
    .sort((a, b) => String(b.vigencia_fim).localeCompare(String(a.vigencia_fim)));

  return {
    situacao: SITUACAO.VENCIDO,
    preco: null,
    // Pode ser undefined quando o único preço do par ainda NÃO começou
    // (vigência futura) — caso raro e legítimo, e por isso não é "ausente".
    ultimoVencido: terminados[0] || null,
  };
}

/**
 * Os pares (convênio × código) que o hospital FATURA e que não têm preço.
 *
 * 🔴 É a lista que fecha o buraco das outras abas. Análises e Receitas
 * dizem "N itens sem preço" e não dão o que fazer; aqui está o que
 * cadastrar, com quanto já se deixou de cobrar por causa disso.
 *
 * `itens` são linhas de `at_conta_itens` acrescidas de `convenio_id` (que
 * mora na conta, não no item).
 */
export function lacunasDePreco(itens, precos, { hoje = new Date() } = {}) {
  if (naoDeuParaLer(itens) || naoDeuParaLer(precos)) return [];
  const d = diaDe(hoje);
  const mapa = new Map();

  for (const i of listaLida(itens)) {
    if (i?.cancelado) continue;
    const cod = String(i?.codigo ?? "").trim();
    if (!cod || i?.convenio_id == null) continue;

    const r = precoDe(precos, { convenioId: i.convenio_id, codigo: cod, dia: d });
    if (r.situacao === SITUACAO.ACHADO) continue;

    const k = `${i.convenio_id}|${cod.toUpperCase()}`;
    const at = mapa.get(k) || {
      convenioId: i.convenio_id, codigo: cod, descricao: i?.descricao || null,
      situacao: r.situacao, ultimoVencido: r.ultimoVencido,
      vezes: 0, valorLancado: 0, semValor: 0,
    };
    at.vezes++;
    // Quanto já foi lançado sem tabela — é a exposição, não o prejuízo.
    //
    // ⚠️ `Number(null)` é 0, e 0 é finito. Testar só com `Number.isFinite`
    // faria item SEM VALOR contar como item de R$ 0,00 — a mesma troca de
    // "não sei" por "zero" que este módulo inteiro existe para evitar.
    const bruto = i?.valor_total;
    const v = bruto == null || bruto === "" ? NaN : Number(bruto);
    if (Number.isFinite(v)) at.valorLancado += v; else at.semValor++;
    if (!at.descricao && i?.descricao) at.descricao = i.descricao;
    mapa.set(k, at);
  }

  // Vencido primeiro: ele tem contrato e só precisa de aditivo, então é o
  // conserto mais barato. Depois, o que mais apareceu.
  const peso = s => (s === SITUACAO.VENCIDO ? 0 : 1);
  return [...mapa.values()].sort((a, b) =>
    peso(a.situacao) - peso(b.situacao) || b.vezes - a.vezes || b.valorLancado - a.valorLancado);
}

/**
 * A cobertura de um convênio: quantos preços vigentes, vencidos e futuros.
 * É o cartão de saúde do contrato.
 */
export function coberturaDoConvenio(precos, convenioId, { hoje = new Date() } = {}) {
  const d = diaDe(hoje);
  const meus = listaLida(precos).filter(p => p?.convenio_id === convenioId);
  const r = { total: meus.length, vigentes: 0, vencidos: 0, futuros: 0, inativos: 0, proximoVencimento: null };

  for (const p of meus) {
    if (p?.ativo === false) { r.inativos++; continue; }
    if (vigenteEm(p, d)) {
      r.vigentes++;
      const fim = diaDe(p.vigencia_fim);
      // ⚠️ Vigência que termina é alarme com antecedência: descobrir no dia
      // seguinte já é tarde, porque a conta do dia saiu sem preço.
      if (fim && (!r.proximoVencimento || fim < r.proximoVencimento)) r.proximoVencimento = fim;
      continue;
    }
    const ini = diaDe(p.vigencia_inicio);
    if (ini && ini > d) r.futuros++; else r.vencidos++;
  }
  return r;
}

/**
 * As regras do convênio que a recepção precisa obedecer — já moram em
 * `at_convenios`, mas ninguém as mostra junto do preço.
 */
export function regrasDoConvenio(convenio) {
  const r = [];
  if (convenio?.exige_carteira) r.push("Exige carteira do beneficiário.");
  if (convenio?.exige_autorizacao) r.push("Exige autorização prévia.");
  if (convenio?.registro_ans) r.push(`Registro ANS ${convenio.registro_ans}.`);
  return r;
}

/** O que impede de gravar um preço. Lista vazia = pode. */
export function recusasDoPreco(p, outros = []) {
  const fora = [];
  const v = Number(String(p?.valor ?? "").replace(/\./g, "").replace(",", "."));

  if (!p?.convenio_id) fora.push("Sem convênio: o preço é sempre de alguém.");
  if (!String(p?.codigo ?? "").trim()) fora.push("Sem código o preço não encontra procedimento nenhum.");
  if (p?.valor === "" || p?.valor == null || !Number.isFinite(v)) fora.push("Valor inválido.");
  else if (v < 0) fora.push("Preço negativo não existe. Zero existe — é procedimento incluso no pacote.");
  if (!p?.vigencia_inicio) fora.push("Sem início de vigência não dá para dizer de quando o preço vale.");
  if (p?.vigencia_fim && p?.vigencia_inicio && diaDe(p.vigencia_fim) < diaDe(p.vigencia_inicio)) {
    fora.push("A vigência não pode terminar antes de começar.");
  }

  // 🔴 Espelha o EXCLUDE do banco. A tela avisa antes; quem RECUSA é o
  // banco — e a recusa dele chega como erro cru, depois de tudo digitado.
  if (p?.convenio_id && p?.vigencia_inicio && String(p?.codigo ?? "").trim()) {
    const ini = diaDe(p.vigencia_inicio);
    const fim = diaDe(p.vigencia_fim) || "9999-12-31";
    const choque = listaLida(outros).find(o =>
      o?.id !== p?.id && o?.ativo !== false &&
      o?.convenio_id === p.convenio_id && mesmoCodigo(o?.codigo, p?.codigo) &&
      ini <= (diaDe(o?.vigencia_fim) || "9999-12-31") && (diaDe(o?.vigencia_inicio) || "0000-01-01") <= fim);
    if (choque) {
      fora.push(`Já existe preço ativo deste código para este convênio cobrindo parte deste período (de ${choque.vigencia_inicio} a ${choque.vigencia_fim || "indeterminado"}). Encerre o anterior antes.`);
    }
  }

  return fora;
}
