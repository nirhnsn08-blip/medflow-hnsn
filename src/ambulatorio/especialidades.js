// ═══════════════════════════════════════════════════════════
// AS ESPECIALIDADES DO PAINEL DO AMBULATÓRIO
//
// Esta lista morava dentro do `App.jsx` como `SPECS`. Saiu de lá porque
// passou a ter DOIS leitores: o painel de produção (metas, cores, gráficos)
// e a conciliação da agenda, que precisa saber para qual chave gravar o
// número apurado. Duplicar a lista faria uma ganhar especialidade nova e a
// outra não — e o sintoma seria produção gravada numa chave que nenhuma
// tela lê, sem erro em lugar nenhum.
//
// AS METAS SÃO DA INSTITUIÇÃO, não do software: vieram da pactuação do
// HNSN. Trocar uma delas muda o que o gestor lê como "no alvo".
// ═══════════════════════════════════════════════════════════

/** Cores categóricas validadas (contraste + daltonismo) nos temas claro e escuro. */
export const ESPECIALIDADES = [
  { id: "cirurgia_geral", label: "Cirurgia Geral", metaM: 360,  metaA: 4320, meta1a: 1320, color: "#0d9488" },
  { id: "oftalmologia",   label: "Oftalmologia",   metaM: 240,  metaA: 2880, meta1a: 864,  color: "#3b82f6" },
  { id: "ginecologia",    label: "Ginecologia",    metaM: 240,  metaA: 2880, meta1a: 864,  color: "#d97706" },
  { id: "urologia",       label: "Urologia",       metaM: 240,  metaA: 2880, meta1a: 864,  color: "#6366f1" },
  { id: "ortopedia",      label: "Ortopedia",      metaM: 387,  metaA: 4644, meta1a: 1394, color: "#e11d48" },
];

export const ESPECIALIDADE_POR_ID =
  Object.fromEntries(ESPECIALIDADES.map(e => [e.id, e]));

/** Sem acento, minúsculo, separador único — só para COMPARAR. */
export const chaveEspecialidade = v =>
  String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/**
 * O código de especialidade da agenda (`at_dominios`) corresponde a qual
 * especialidade do painel?
 *
 * Devolve `null` quando não corresponde a nenhuma, e isso é a parte
 * importante. O catálogo é livre — o analista comercial cadastra
 * "CARDIOLOGIA" quando quiser — e o painel do ambulatório tem cinco
 * especialidades pactuadas. Chutar a chave faria a produção de uma
 * especialidade nova ser gravada num lugar que nenhuma tela lê: número
 * some, ninguém vê erro, e alguém procura no fim do mês.
 *
 * Compara pelo id E pelo rótulo, porque o cadastro pode trazer qualquer um
 * dos dois ("cirurgia_geral" ou "Cirurgia Geral").
 */
export function idDaEspecialidade(codigo, nome) {
  const alvos = [chaveEspecialidade(codigo), chaveEspecialidade(nome)].filter(Boolean);
  if (!alvos.length) return null;
  for (const e of ESPECIALIDADES) {
    const meus = [chaveEspecialidade(e.id), chaveEspecialidade(e.label)];
    if (alvos.some(a => meus.includes(a))) return e.id;
  }
  return null;
}
