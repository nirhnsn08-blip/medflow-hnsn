// ═══════════════════════════════════════════════════════════
// AS ESPECIALIDADES DO PAINEL DO AMBULATÓRIO — vindas do CADASTRO
//
// 🔴 ATÉ 03/09/2026 AS CINCO ESTAVAM CRAVADAS AQUI, com as metas da
// pactuação do HNSN. Fazia sentido quando o produto ERA este painel: a lista
// e os números eram do único hospital que existia.
//
// Num produto vendido a vários hospitais é dívida direta. O cliente novo
// abria o painel e via **cinco especialidades que não são dele**, com metas
// que nunca pactuou — e as especialidades reais dele caíam todas em
// `semCorrespondencia`, sem lugar onde gravar produção.
//
// Agora a lista vem de `at_dominios` (domínio `especialidade`), que é o
// mesmo cadastro que a Agenda usa e que a aba Tabelas do Atendimento já
// edita. Uma fonte, não duas.
//
// ⚠️ O `id` NÃO PODE MUDAR. A produção é gravada em `atendimentos` com a
// coluna `especialidade` valendo `cirurgia_geral`, `oftalmologia`, etc. — no
// demo são 295 linhas presas a essas chaves. Por isso o id vem de
// `extras.painel_id` quando existe, e só cai na normalização do código como
// segunda opção: mudar a chave órfãnaria o histórico em silêncio.
//
// ⚠️ E AS METAS SÃO DA INSTITUIÇÃO, não do software. Vivem em `extras` da
// própria linha do cadastro, editáveis por quem pactuou — trocar uma delas
// muda o que o gestor lê como "no alvo", e isso não é decisão de quem
// programa.
// ═══════════════════════════════════════════════════════════

/**
 * Cores categóricas validadas (contraste + daltonismo) nos temas claro e
 * escuro. Atribuídas por ORDEM quando o cadastro não traz `extras.cor` —
 * assim um hospital com oito especialidades não fica com duas iguais, e
 * ninguém precisa escolher cor para começar a usar.
 */
export const PALETA = [
  "#0d9488", "#3b82f6", "#d97706", "#6366f1", "#e11d48",
  "#0891b2", "#7c3aed", "#ca8a04", "#db2777", "#16a34a",
];

/** Sem acento, minúsculo, separador único — só para COMPARAR. */
export const chaveEspecialidade = v =>
  String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

const num = v => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * As linhas de `at_dominios` → a lista que o painel consome.
 *
 * Formato de saída idêntico ao da lista antiga (`id`, `label`, `metaM`,
 * `metaA`, `meta1a`, `color`), para que os leitores não precisassem mudar.
 *
 * ⚠️ META AUSENTE É `null`, NUNCA ZERO. Meta zero significaria "a pactuação
 * é não atender ninguém", e o painel calcularia 100% de cumprimento sobre
 * ela — elogio para quem não fez nada. Quem consome tem de tratar o `null`.
 */
export function especialidadesDoCadastro(dominios) {
  const linhas = (Array.isArray(dominios) ? dominios : [])
    .filter(d => d && chaveEspecialidade(d.dominio) === "especialidade" && d.ativo !== false);

  return linhas.map((d, i) => {
    const ex = d.extras && typeof d.extras === "object" ? d.extras : {};
    return {
      // 🔴 `painel_id` primeiro: é o que amarra o histórico de produção.
      id: ex.painel_id || chaveEspecialidade(d.codigo) || chaveEspecialidade(d.nome),
      label: d.nome || d.codigo || "(sem nome)",
      codigo: d.codigo ?? null,
      metaM: num(ex.meta_mensal),
      metaA: num(ex.meta_anual),
      meta1a: num(ex.meta_primeiras),
      color: ex.cor || PALETA[i % PALETA.length],
    };
  }).filter(e => e.id);
}

/** Índice por id, para quem precisa buscar sem varrer a lista. */
export const indicePorId = lista =>
  Object.fromEntries((Array.isArray(lista) ? lista : []).map(e => [e.id, e]));

/**
 * O código de especialidade da agenda corresponde a qual do painel?
 *
 * Devolve `null` quando não corresponde a nenhuma, e isso é a parte
 * importante: chutar a chave faria a produção ser gravada num lugar que
 * nenhuma tela lê — o número some, ninguém vê erro, e alguém procura no fim
 * do mês.
 *
 * ⚠️ Agora recebe a LISTA. Antes ela era global e o módulo decidia sozinho
 * contra as cinco cravadas; hoje a lista é do hospital, e passá-la é o que
 * impede este arquivo de voltar a ter opinião sobre quais especialidades
 * existem.
 */
export function idDaEspecialidade(codigo, nome, lista) {
  const alvos = [chaveEspecialidade(codigo), chaveEspecialidade(nome)].filter(Boolean);
  if (!alvos.length) return null;
  for (const e of (Array.isArray(lista) ? lista : [])) {
    const meus = [chaveEspecialidade(e.id), chaveEspecialidade(e.label), chaveEspecialidade(e.codigo)];
    if (alvos.some(a => meus.includes(a))) return e.id;
  }
  return null;
}
