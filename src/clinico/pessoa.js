// ═══════════════════════════════════════════════════════════
// A PESSOA, NÃO O NÚMERO
//
// 🔴 UNIFICAR PRONTUÁRIO NÃO ESTAVA CHEGANDO AO CLÍNICO. A unificação grava
// um ponteiro (`pacientes.unificado_para`) e NÃO move dado clínico — essa
// decisão está certa e é explicada em `pacientes/unificacao.js`: mover
// registro assinado é reescrever prontuário, e prontuário não se reescreve.
//
// Mas quem LÊ continuava lendo por um número só. Consequência real: a
// alergia registrada na ficha antiga sumia da prescrição, do alerta da
// farmácia e da PULSEIRA da ficha que vale. A unificação consertava a
// identidade e deixava o risco clínico partido ao meio — exatamente o que
// ela existia para resolver.
//
// Aqui mora a regra que transforma UM número na lista de TODOS os números
// pelos quais a pessoa pode ter histórico. Pura: recebe as linhas de
// `pacientes` e devolve o agrupamento. Quem vai ao banco é `pessoa-dados.js`.
//
// ⚠️ PROFUNDIDADE 2, por garantia do banco: o gatilho da migração de
// unificação recusa apontar para uma ficha que já aponta para outra (nada de
// corrente). Então toda pessoa é, no máximo, um DESTINO e suas origens.
// ═══════════════════════════════════════════════════════════

const texto = v => String(v ?? "").trim();

/**
 * O número que é o "centro" de cada ficha: o destino, se ela foi unificada;
 * senão, ela mesma.
 */
export function centroDe(linha) {
  return texto(linha?.unificado_para) || texto(linha?.prontuario);
}

/**
 * Agrupa: para cada prontuário perguntado, TODOS os números da mesma pessoa.
 *
 * `linhas` são registros de `pacientes` com `prontuario` e `unificado_para`
 * — tanto os perguntados quanto os que apontam para o mesmo centro.
 *
 * O número perguntado SEMPRE entra na própria lista, mesmo que não apareça
 * em `linhas`: se a consulta não o trouxe, ler só o resto seria perder o
 * histórico que está debaixo dele. A lista sai ordenada para a consulta
 * seguinte ser estável (e o cache do navegador fazer efeito).
 */
export function agruparPorPessoa(prontuarios, linhas = []) {
  const pedidos = [...new Set((Array.isArray(prontuarios) ? prontuarios : []).map(texto).filter(Boolean))];
  const porProntuario = new Map();
  for (const l of Array.isArray(linhas) ? linhas : []) {
    const p = texto(l?.prontuario);
    if (p) porProntuario.set(p, l);
  }

  // centro → todos os números que pertencem a ele
  const familia = new Map();
  const juntar = (centro, numero) => {
    if (!centro || !numero) return;
    const atual = familia.get(centro) || new Set();
    atual.add(numero);
    familia.set(centro, atual);
  };
  for (const l of Array.isArray(linhas) ? linhas : []) {
    const p = texto(l?.prontuario);
    if (!p) continue;
    const c = centroDe(l);
    juntar(c, p);
    juntar(c, c);   // o destino também é da família, mesmo sem linha própria
  }

  const out = {};
  for (const p of pedidos) {
    const centro = centroDe(porProntuario.get(p)) || p;
    // `centro` já entra por `juntar(c, c)` lá em cima; aqui basta garantir
    // o próprio número, que pode não ter linha nenhuma em `linhas`.
    const conjunto = new Set(familia.get(centro) || []);
    conjunto.add(p);
    out[p] = [...conjunto].sort();
  }
  return out;
}

/**
 * Todos os números que precisam ser consultados para um conjunto de
 * prontuários — a união das famílias, sem repetição.
 */
export function numerosParaConsultar(agrupado) {
  const todos = new Set();
  for (const lista of Object.values(agrupado || {})) for (const p of lista) todos.add(p);
  return [...todos].sort();
}

/**
 * Re-indexa registros clínicos (alergias, por exemplo) por TODOS os números
 * da pessoa.
 *
 * Uma alergia gravada sob o número antigo passa a aparecer também sob o
 * número que vale — e vice-versa, porque quem abre a ficha antiga também
 * precisa ver o que foi registrado depois da unificação.
 *
 * ⚠️ O registro NÃO é copiado nem alterado: é o mesmo objeto, visível por
 * mais de uma chave. Nada é reescrito no banco.
 */
export function indexarPorPessoa(registros, agrupado) {
  const por = {};
  const deOnde = new Map();   // número de origem → números que o enxergam
  for (const [pedido, lista] of Object.entries(agrupado || {})) {
    for (const numero of lista) {
      const alvos = deOnde.get(numero) || new Set();
      alvos.add(pedido);
      deOnde.set(numero, alvos);
    }
  }
  for (const r of Array.isArray(registros) ? registros : []) {
    const origem = texto(r?.prontuario);
    if (!origem) continue;
    for (const alvo of deOnde.get(origem) || []) {
      (por[alvo] = por[alvo] || []).push(r);
    }
  }
  return por;
}
