// ═══════════════════════════════════════════════════════════
// EXAMES DO PS — resumo por categoria, para o BI mensal
//
// Os exames do PS ficam em `ps_registros` (tipo = "exame") e JÁ trazem a
// categoria escolhida pelo médico ao solicitar: laboratorial, imagem ou outro.
// O que faltava era o relatório usar isso — laboratório e imagem têm gargalos,
// custos e tempos de resposta diferentes, e somar os dois esconde os dois.
//
// "Com resultado" = o resultado já saiu (status resultado_disponivel OU visto);
// "solicitado" ainda aguarda. O tempo de resposta é solicitação → resultado.
//
// Função pura (sem React, sem rede): é a régua do BI, e é o que dá para testar.
// ═══════════════════════════════════════════════════════════

export const EXAME_CATEGORIAS = [
  { chave: "laboratorial", label: "Laboratorial" },
  { chave: "imagem",       label: "Imagem" },
  { chave: "outro",        label: "Outro" },
];

const CHAVES = new Set(EXAME_CATEGORIAS.map(c => c.chave));
// Estados em que o resultado já existe.
const TEM_RESULTADO = new Set(["resultado_disponivel", "visto"]);

// Minutos entre solicitação e resultado. null se faltar data ou vier invertido.
function minutosAteResultado(e) {
  if (!e || !e.criado_em || !e.resultado_em) return null;
  const ini = new Date(e.criado_em), fim = new Date(e.resultado_em);
  if (isNaN(ini) || isNaN(fim)) return null;
  const m = Math.round((fim - ini) / 60000);
  return m >= 0 ? m : null;
}

function agrega(lista) {
  const n = lista.length;
  const comResultado = lista.filter(e => TEM_RESULTADO.has(e.status)).length;
  const tempos = lista.map(minutosAteResultado).filter(v => v != null);
  const tempoMedioMin = tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : null;
  return {
    n,
    comResultado,
    pctResultado: n ? (comResultado / n) * 100 : null,
    tempoMedioMin,
  };
}

/**
 * Agrega os exames do período por categoria.
 * `exames`: [{ categoria, status, criado_em, resultado_em }]
 * Categoria desconhecida ou vazia cai em "outro" (nunca some da conta).
 * Devolve { porCategoria: [{ chave, label, n, comResultado, pctResultado,
 * tempoMedioMin }], n, comResultado, pctResultado, tempoMedioMin }.
 */
export function resumoExamesPorCategoria(exames = []) {
  const lista = (Array.isArray(exames) ? exames : []).map(e => ({
    ...e,
    _cat: CHAVES.has(e?.categoria) ? e.categoria : "outro",
  }));
  const porCategoria = EXAME_CATEGORIAS.map(cat => ({
    ...cat,
    ...agrega(lista.filter(e => e._cat === cat.chave)),
  }));
  return { porCategoria, ...agrega(lista) };
}
