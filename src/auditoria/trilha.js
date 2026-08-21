// ═══════════════════════════════════════════════════════════
// TRILHA DE AUDITORIA — regra pura, sem React e sem rede
//
// O defeito que este módulo conserta: `addAuditLog` sempre gravou nos DOIS
// lugares — `localStorage` e a tabela `auditoria` —, mas a tela lia apenas o
// `localStorage`. Ou seja: a trilha institucional existia no banco e não era
// exibida em lugar nenhum, enquanto o cabeçalho da tela anunciava "histórico
// de todas as alterações realizadas na plataforma".
//
// O que se via era o registro DAQUELE navegador, limitado a 200 linhas. Duas
// pessoas olhando a mesma tela viam listas diferentes, e quem abrisse o
// sistema numa máquina nova via uma trilha vazia — e concluiria que ninguém
// tinha feito nada.
//
// 🔴 Por que isso é grave e não cosmético: a trilha de auditoria DEFENDE a
// instituição (REQUISITOS-PEP A-03; CFM 1.638/2002, art. 2º). Ela só cumpre
// esse papel se for a MESMA para todos, completa, e atribuível a uma pessoa.
// Uma trilha que cada um vê diferente não prova nada.
// ═══════════════════════════════════════════════════════════

/**
 * Caracteres que quebram a sintaxe de filtro do PostgREST.
 *
 * Um `or=(usuario.ilike.*texto*,alvo.ilike.*texto*)` com vírgula ou
 * parêntese dentro do texto do usuário deixa de ser um filtro e vira outra
 * consulta. Aqui não há dado sensível em jogo — a leitura já é limitada por
 * RLS —, mas uma busca que se transforma em erro 400 sempre que alguém
 * digita "Maria, João" é defeito de qualquer forma.
 */
export function limparBusca(texto) {
  return String(texto ?? "")
    .replace(/[(),*\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Em que estado está a trilha — e são TRÊS, não dois.
 *
 * `linhas` é `null` quando a consulta falhou (o `sbFetch` devolve null em
 * queda de rede, sessão vencida ou recusa do PostgREST) e `[]` quando o
 * banco respondeu que não há registro. Mostrar "nenhum registro" nos dois
 * casos é o pior erro possível numa tela de auditoria: quem investiga um
 * incidente concluiria que a ação não aconteceu, quando na verdade a
 * pergunta não chegou a ser feita.
 */
export function estadoDaTrilha({ linhas, filtrando = false }) {
  if (!Array.isArray(linhas)) return "indeterminado";
  if (linhas.length === 0) return filtrando ? "sem-resultado" : "vazia";
  return "ok";
}

/** Um registro do banco no formato que a tela desenha. */
export function normalizar(linha) {
  return {
    id: linha?.id ?? null,
    ts: linha?.ts || null,
    usuario: linha?.usuario || "—",
    // `usuario_id` vem do banco (`default auth.uid()`), não do cliente. É a
    // diferença entre "alguém digitou este nome" e "esta conta fez isto".
    usuarioId: linha?.usuario_id || null,
    acao: linha?.acao || "—",
    alvo: linha?.alvo || "",
  };
}

/** As ações distintas presentes, para alimentar o filtro. Ordem alfabética. */
export function acoesDistintas(linhas = []) {
  const set = new Set();
  for (const l of linhas) if (l?.acao) set.add(l.acao);
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/**
 * Resumo do que está carregado.
 *
 * `atribuidos` é o número que interessa numa auditoria: quantos registros
 * têm autoria garantida pelo banco. Registros antigos, gravados antes da
 * coluna existir, ficam sem — e é honesto mostrar isso em vez de somar
 * tudo como se tivesse o mesmo valor probatório.
 */
export function resumo(linhas = []) {
  const usuarios = new Set();
  let atribuidos = 0, maisAntigo = null, maisRecente = null;
  for (const l of linhas) {
    if (l?.usuario) usuarios.add(l.usuario);
    if (l?.usuarioId) atribuidos++;
    if (l?.ts) {
      if (!maisAntigo || l.ts < maisAntigo) maisAntigo = l.ts;
      if (!maisRecente || l.ts > maisRecente) maisRecente = l.ts;
    }
  }
  return { total: linhas.length, usuarios: usuarios.size, atribuidos, maisAntigo, maisRecente };
}

/**
 * Filtro local, sobre o que já foi carregado.
 *
 * O filtro pesado vai para o banco (ver `dados.js`); este existe para
 * refinar a página em mãos sem uma ida ao servidor. Busca em usuário E
 * alvo, sem diferenciar maiúscula — é como a pessoa procura ("o que a Laura
 * fez", "o que aconteceu com o leito 203").
 */
export function filtrarLocal(linhas = [], { texto = "", acao = "" } = {}) {
  const t = limparBusca(texto).toLowerCase();
  return linhas.filter(l => {
    if (acao && l.acao !== acao) return false;
    if (!t) return true;
    return String(l.usuario || "").toLowerCase().includes(t)
        || String(l.alvo || "").toLowerCase().includes(t);
  });
}

/**
 * O período coberto por esta página, em texto.
 *
 * Serve para a pessoa saber o que NÃO está vendo: uma tela que mostra 200
 * dos 40 mil registros sem dizer isso convida à conclusão errada.
 */
export function periodoCoberto(r) {
  if (!r?.maisAntigo || !r?.maisRecente) return null;
  const d = s => new Date(s).toLocaleDateString("pt-BR");
  const a = d(r.maisAntigo), b = d(r.maisRecente);
  return a === b ? a : `${a} a ${b}`;
}
