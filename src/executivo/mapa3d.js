// ═══════════════════════════════════════════════════════════
// MAPA ISOMÉTRICO DE LEITOS — motor puro
//
// O "gráfico 3D de ocupação" do painel executivo. Mas não é um gráfico 3D no
// sentido que a palavra costuma ter — e a diferença é o ponto inteiro deste
// arquivo.
//
// ── POR QUE NÃO É UMA BARRA 3D ──────────────────────────────
// Barra, pizza ou coluna em 3D distorcem leitura de valor: a perspectiva
// encolhe o que está atrás, a face frontal tampa a de trás, e o olho compara
// volumes que o desenho inventou. Num painel onde alguém decide escala de
// plantão, isso custa caro.
//
// Aqui a terceira dimensão não representa magnitude nenhuma: **um cubo é um
// leito**. A contagem é exata porque é contagem, não área. O 3D é o mapa
// FÍSICO do hospital — e um diretor lê "a UTI está sólida e a ala B está
// esburacada" antes de ler qualquer número.
//
// ── A ALTURA É REDUNDANTE COM A COR, DE PROPÓSITO ───────────
// 🔴 Cada status tem cor E altura. Isso não é enfeite: é o canal secundário
// que a validação de paleta exige. As cores de status do app ficam a ΔE 7,9
// sob daltonismo (protanopia) — dentro do piso que só é aceitável COM
// codificação secundária. Com a altura, o mapa continua legível em escala de
// cinza, impresso, ou para quem não distingue verde de laranja: o leito
// ocupado é o bloco alto, o livre é a laje baixa.
//
// ⚠️ DESENHAR DE TRÁS PARA FRENTE é obrigação, não detalhe. Em projeção
// isométrica o que está "atrás" precisa sair primeiro no SVG, senão o cubo
// de trás é pintado por cima do da frente e o relevo vira sopa. É o
// `ordemDeDesenho`.
// ═══════════════════════════════════════════════════════════

/** Os quatro estados que um leito pode ter no mapa. */
export const ESTADO = {
  OCUPADO: "ocupado",
  LIVRE: "livre",
  HIGIENIZACAO: "higienizacao",
  INTERDITADO: "interditado",
};

/**
 * Altura do cubo por estado, em frações do lado do tile.
 *
 * É o canal redundante da cor. A ordem importa mais que os valores: ocupado
 * é sempre o mais alto e interditado sempre o mais baixo, para o relevo
 * contar a mesma história que a cor.
 */
export const ALTURA = {
  [ESTADO.OCUPADO]: 1,
  [ESTADO.HIGIENIZACAO]: 0.55,
  [ESTADO.LIVRE]: 0.22,
  [ESTADO.INTERDITADO]: 0.1,
};

/** O token CSS de cada estado — definido por tema no index.html. */
export const COR_TOKEN = {
  [ESTADO.OCUPADO]: "var(--torre-ocupado)",
  [ESTADO.LIVRE]: "var(--torre-livre)",
  [ESTADO.HIGIENIZACAO]: "var(--torre-higiene)",
  [ESTADO.INTERDITADO]: "var(--torre-bloqueado)",
};

export const ROTULO_ESTADO = {
  [ESTADO.OCUPADO]: "Ocupado",
  [ESTADO.LIVRE]: "Livre",
  [ESTADO.HIGIENIZACAO]: "Em higienização",
  [ESTADO.INTERDITADO]: "Interditado",
};

/** Status do banco → estado do mapa. Desconhecido vira interditado (não some). */
export function estadoDoLeito(leito) {
  const s = String(leito?.status || "").toLowerCase();
  if (s === "ocupado") return ESTADO.OCUPADO;
  if (s === "livre" || s === "disponivel") return ESTADO.LIVRE;
  if (s === "higienizacao" || s === "limpeza") return ESTADO.HIGIENIZACAO;
  // 🔴 Status que o mapa não conhece NÃO desaparece do desenho. Sumir seria
  // perder um leito real da contagem visual; aqui ele aparece como bloco
  // baixo e cinza, e o rótulo diz o que o banco respondeu.
  return ESTADO.INTERDITADO;
}

const TILE = { largura: 26, altura: 13, lado: 22 };

/**
 * Projeção isométrica: (coluna, linha, altura) → (x, y) na tela.
 *
 * A fórmula clássica 2:1 — x cresce para a direita quando a coluna cresce e
 * para a esquerda quando a linha cresce; y é a soma dos dois, menos a altura
 * do bloco (que empurra o topo para cima).
 */
export function projetar(col, linha, z = 0, tile = TILE) {
  return {
    x: (col - linha) * (tile.largura / 2),
    y: (col + linha) * (tile.altura / 2) - z * tile.lado,
  };
}

const pts = lista => lista.map(p => `${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10}`).join(" ");

/**
 * As três faces de um cubo na posição (col, linha) com altura `h`.
 *
 * Topo é o losango; esquerda e direita são as laterais que dão o volume. A
 * tela pinta o topo na cor cheia e as laterais escurecidas — é o que faz o
 * olho ler relevo sem precisar de sombra.
 */
export function facesDoCubo(col, linha, h, tile = TILE) {
  const alto = h * tile.lado;
  const base = projetar(col, linha, 0, tile);
  const t = (dc, dl) => {
    const p = projetar(col + dc, linha + dl, 0, tile);
    return { x: p.x, y: p.y - alto };
  };
  const b = (dc, dl) => projetar(col + dc, linha + dl, 0, tile);

  return {
    topo: pts([t(0, 0), t(1, 0), t(1, 1), t(0, 1)]),
    direita: pts([t(1, 0), t(1, 1), b(1, 1), b(1, 0)]),
    esquerda: pts([t(0, 1), t(1, 1), b(1, 1), b(0, 1)]),
    ancora: { x: base.x + tile.largura / 2, y: base.y - alto },
  };
}

/**
 * Monta o mapa: um bloco por setor, leitos em grade dentro do bloco.
 *
 * Os setores entram na ordem do cadastro (`ordem`), que é a ordem que o
 * hospital já usa — não na ordem de ocupação. Um mapa que se reordena
 * sozinho a cada leitura é um mapa que ninguém decora, e decorar o mapa é
 * metade da utilidade dele.
 *
 * @param leitos   as linhas de `leitos`
 * @param setores  o cadastro (para ordem e nome); opcional
 * @param opts     { colunas } quantos leitos por fileira dentro do setor
 */
export function montarMapa(leitos = [], setores = [], { colunas = 8, tile = TILE } = {}) {
  const lista = Array.isArray(leitos) ? leitos : [];
  const cadastro = Array.isArray(setores) ? setores : [];

  const ordemDoSetor = new Map(cadastro.map((s, i) => [s.nome, s.ordem ?? i]));
  const porSetor = new Map();
  for (const l of lista) {
    const nome = l.setor || "Sem setor";
    if (!porSetor.has(nome)) porSetor.set(nome, []);
    porSetor.get(nome).push(l);
  }

  const nomes = [...porSetor.keys()].sort((a, b) => {
    // "Sem setor" por último: é exceção de cadastro, não um setor do hospital.
    if (a === "Sem setor") return 1;
    if (b === "Sem setor") return -1;
    const oa = ordemDoSetor.get(a), ob = ordemDoSetor.get(b);
    if (oa != null && ob != null && oa !== ob) return oa - ob;
    if (oa != null && ob == null) return -1;
    if (oa == null && ob != null) return 1;
    return a.localeCompare(b);
  });

  const blocos = [];
  let linhaBase = 0;

  for (const nome of nomes) {
    const doSetor = [...porSetor.get(nome)]
      .sort((a, b) => String(a.identificacao || "").localeCompare(String(b.identificacao || ""), "pt-BR", { numeric: true }));

    const cubos = doSetor.map((l, i) => {
      const col = i % colunas;
      const linha = linhaBase + Math.floor(i / colunas);
      const estado = estadoDoLeito(l);
      const h = ALTURA[estado];
      return {
        leito: l.identificacao || "?",
        setor: nome,
        estado,
        rotulo: ROTULO_ESTADO[estado],
        statusBruto: l.status || null,
        iniciais: l.iniciais || null,
        prontuario: l.prontuario || null,
        isolamento: l.isolamento || null,
        col, linha, altura: h,
        faces: facesDoCubo(col, linha, h, tile),
        profundidade: col + linha,
      };
    });

    const fileiras = Math.ceil(doSetor.length / colunas) || 1;
    const conta = e => cubos.filter(c => c.estado === e).length;
    const operacionais = cubos.length - conta(ESTADO.INTERDITADO);

    blocos.push({
      setor: nome,
      cubos,
      total: cubos.length,
      ocupados: conta(ESTADO.OCUPADO),
      livres: conta(ESTADO.LIVRE),
      higienizacao: conta(ESTADO.HIGIENIZACAO),
      interditados: conta(ESTADO.INTERDITADO),
      operacionais,
      pct: operacionais > 0 ? Math.round((conta(ESTADO.OCUPADO) / operacionais) * 100) : null,
      // A etiqueta do setor fica na ponta esquerda da primeira fileira.
      ancora: projetar(0, linhaBase, 0, tile),
      linhaBase, fileiras,
    });

    // Uma fileira de respiro entre setores — sem ela os blocos se encostam e
    // o olho não separa a UTI da enfermaria.
    linhaBase += fileiras + 1;
  }

  const todos = blocos.flatMap(b => b.cubos);
  const m = moldura(todos);

  // 🔴 O RÓTULO DO SETOR MORA NUMA CALHA À ESQUERDA, alinhado com todos os
  // outros — não encostado no próprio bloco.
  //
  // Encostado no bloco ele parecia óbvio e estava errado: em isometria cada
  // fileira anda para a esquerda, então os rótulos desciam na diagonal POR
  // CIMA dos cubos e o primeiro saía cortado fora do viewBox. A moldura só
  // media cubo; texto não entrava na conta.
  //
  // Alinhados numa calha fixa eles viram uma coluna legível, e a calha entra
  // na largura do desenho de propósito.
  for (const b of blocos) b.rotulo = { x: m.minX + 6, y: b.ancora.y + 4 };

  return { blocos, cubos: todos, vazio: todos.length === 0, ...m };
}

/** A caixa que contém o desenho inteiro, mais a calha dos rótulos. */
function moldura(cubos) {
  if (!cubos.length) return { viewBox: "0 0 10 10", largura: 10, altura: 10, minX: 0 };
  const xs = [], ys = [];
  for (const c of cubos) {
    for (const campo of ["topo", "direita", "esquerda"]) {
      for (const par of c.faces[campo].split(" ")) {
        const [x, y] = par.split(",").map(Number);
        xs.push(x); ys.push(y);
      }
    }
  }
  // A calha da esquerda é reservada PARA O TEXTO. Sem ela o rótulo do setor
  // nasce fora da caixa e o SVG o corta — foi o que aconteceu na primeira
  // versão, e só apareceu ao abrir no navegador.
  const CALHA = 128;
  const minX = Math.min(...xs) - CALHA, maxX = Math.max(...xs) + 10;
  const minY = Math.min(...ys) - 10, maxY = Math.max(...ys) + 10;
  return {
    viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`,
    largura: maxX - minX, altura: maxY - minY,
    minX, calha: CALHA,
  };
}

/**
 * 🔴 A ORDEM DO SVG. De trás para frente: quem tem menor (coluna + linha)
 * está mais longe e sai primeiro, para o cubo da frente pintar por cima.
 * Sem isto o relevo some — os cubos de trás cobrem os da frente e o mapa
 * vira um mosaico plano.
 */
export function ordemDeDesenho(cubos = []) {
  return [...(Array.isArray(cubos) ? cubos : [])].sort(
    (a, b) => a.profundidade - b.profundidade || a.col - b.col);
}

/** O resumo do mapa inteiro — alimenta a legenda com números, não só cores. */
export function resumoDoMapa(mapa) {
  const cubos = mapa?.cubos || [];
  const conta = e => cubos.filter(c => c.estado === e).length;
  const operacionais = cubos.length - conta(ESTADO.INTERDITADO);
  return {
    total: cubos.length,
    operacionais,
    ocupados: conta(ESTADO.OCUPADO),
    livres: conta(ESTADO.LIVRE),
    higienizacao: conta(ESTADO.HIGIENIZACAO),
    interditados: conta(ESTADO.INTERDITADO),
    pct: operacionais > 0 ? Math.round((conta(ESTADO.OCUPADO) / operacionais) * 100) : null,
  };
}
