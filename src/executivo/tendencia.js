// ═══════════════════════════════════════════════════════════
// TENDÊNCIA DE OCUPAÇÃO — motor puro
//
// A pergunta da direção não é "quantos leitos estão ocupados agora" (isso o
// censo já responde): é **para onde isto está indo**. E aí aparece o
// problema: o sistema nunca gravou censo diário. Ninguém, em nenhum dia,
// anotou "hoje havia 38 leitos ocupados".
//
// ── COMO SE RECONSTRÓI UM CENSO QUE NINGUÉM GRAVOU ──────────
// Pelo INTERVALO. Toda internação tem começo (`data_internacao`) e, quando
// terminou, fim (`leitos_saidas.data_alta`). Quem estava internado no dia D é
// quem entrou até D e saiu depois de D (ou ainda não saiu). Contar isso por
// dia devolve a série.
//
// 🔴 E AQUI MORA A ARMADILHA QUE ESTE ARQUIVO EXISTE PARA EVITAR.
//
// A reconstrução é **cega para quem já saiu da janela de leitura**. Se a tela
// leu 90 dias de altas, uma internação que começou há 2 anos e terminou há
// 100 dias simplesmente não existe nos dados — e o dia dela aparece mais
// vazio do que foi. O erro cresce quanto mais para trás se olha, e é
// SILENCIOSO: a curva desce suavemente, com cara de tendência de queda.
//
// Um painel de diretoria lendo "a ocupação vem caindo" quando o que caiu foi
// a cobertura dos dados é pior do que não ter gráfico nenhum.
//
// Por isso toda série sai com `confiavel` por dia e um `desdeConfiavel`: os
// dias anteriores à janela de leitura são marcados, e a tela é obrigada a
// desenhá-los diferente (ou não desenhá-los).
//
// ⚠️ A SÉRIE É DE LEITOS, NÃO DE PESSOAS. Um paciente que trocou de leito
// conta uma vez por leito-dia, que é a unidade da taxa de ocupação.
// ═══════════════════════════════════════════════════════════

import { diaDe } from "./torre.js";

/** Soma `n` dias a uma data "AAAA-MM-DD" e devolve no mesmo formato. */
export function somarDias(dia, n) {
  if (!dia) return null;
  const [a, m, d] = String(dia).slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return null;
  const dt = new Date(a, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return diaDe(dt);
}

/** Todos os dias de `de` até `ate`, inclusive. */
export function diasEntre(de, ate) {
  const lista = [];
  let cur = String(de).slice(0, 10);
  const fim = String(ate).slice(0, 10);
  // Trava de sanidade: nenhuma janela deste painel passa de alguns anos, e
  // um laço infinito por data invertida derrubaria a aba inteira.
  for (let i = 0; cur <= fim && i < 3700; i++) {
    lista.push(cur);
    cur = somarDias(cur, 1);
    if (!cur) break;
  }
  return lista;
}

/**
 * As internações, como intervalos `{ inicio, fim, setor }`.
 *
 * Vem de duas fontes que se completam:
 *  • `leitos_saidas` — as internações que JÁ TERMINARAM (tem os dois lados);
 *  • `leitos` ocupados agora — as que AINDA NÃO terminaram (fim = null).
 *
 * Internação sem `data_internacao` é descartada, não chutada: sem o começo
 * não há intervalo, e inventar um começo inventaria leitos-dia.
 */
export function intervalosDeInternacao(saidas = [], leitosOcupados = []) {
  const itens = [];
  let semInicio = 0;

  for (const s of Array.isArray(saidas) ? saidas : []) {
    const inicio = diaDe(s.data_internacao);
    const fim = diaDe(s.data_alta);
    if (!inicio || !fim) { semInicio++; continue; }
    itens.push({ inicio, fim, setor: s.setor || null, encerrada: true });
  }

  for (const l of Array.isArray(leitosOcupados) ? leitosOcupados : []) {
    if (l.status !== "ocupado") continue;
    const inicio = diaDe(l.data_internacao);
    if (!inicio) { semInicio++; continue; }
    itens.push({ inicio, fim: null, setor: l.setor || null, encerrada: false });
  }

  return { itens, semInicio };
}

/**
 * O censo dia a dia. Devolve uma linha por dia:
 *   { dia, ocupados, operacionais, pct, confiavel }
 *
 * `operacionais` é o número de HOJE aplicado a todos os dias — o sistema não
 * guarda histórico de quantos leitos existiam. É uma aproximação, e está
 * declarada: `baseDeHoje: true` viaja no resultado para a tela poder dizer
 * isso em vez de deixar entender que a base é histórica.
 *
 * @param intervalos  de `intervalosDeInternacao`
 * @param opts { de, ate, operacionais, janelaDesde }
 *   `janelaDesde` é o primeiro dia COBERTO pela leitura (o `desde` do
 *   loader). Antes dele a contagem é cega e sai `confiavel:false`.
 */
export function censoDiario(intervalos = [], { de, ate, operacionais = null, janelaDesde = null } = {}) {
  const dias = diasEntre(de, ate);
  const lista = Array.isArray(intervalos) ? intervalos : [];

  const linhas = dias.map(dia => {
    let ocupados = 0;
    for (const it of lista) {
      if (it.inicio > dia) continue;              // ainda não tinha entrado
      if (it.fim != null && it.fim <= dia) continue; // já tinha saído (alta no dia não ocupa o dia)
      ocupados++;
    }
    const pct = operacionais > 0 ? Math.round((ocupados / operacionais) * 100) : null;
    return {
      dia, ocupados, operacionais, pct,
      // Antes da janela lida, a contagem não enxerga quem já tinha saído.
      confiavel: !janelaDesde || dia >= janelaDesde,
    };
  });

  const confiaveis = linhas.filter(l => l.confiavel);
  return {
    linhas,
    baseDeHoje: true,
    desdeConfiavel: confiaveis[0]?.dia || null,
    diasCegos: linhas.length - confiaveis.length,
  };
}

/**
 * A direção da curva, calculada SÓ sobre os dias confiáveis.
 *
 * Compara a média da metade final com a da metade inicial. Não é regressão
 * nem previsão — é a leitura honesta de "está subindo ou descendo", que é o
 * que um painel pode afirmar.
 *
 * Com menos de 4 dias confiáveis não diz nada: `avaliado:false`. Duas
 * medidas não fazem tendência, fazem uma reta entre dois pontos.
 */
export function direcaoDaSerie(linhas = [], { minimoDeDias = 4 } = {}) {
  const uteis = (Array.isArray(linhas) ? linhas : []).filter(l => l.confiavel && l.pct != null);
  if (uteis.length < minimoDeDias) {
    return { avaliado: false, direcao: null, variacao: null, dias: uteis.length };
  }
  const meio = Math.floor(uteis.length / 2);
  const media = arr => arr.reduce((t, l) => t + l.pct, 0) / arr.length;
  const antes = media(uteis.slice(0, meio));
  const depois = media(uteis.slice(meio));
  const variacao = Math.round((depois - antes) * 10) / 10;

  // 1 ponto percentual de folga: abaixo disso é ruído de arredondamento, e
  // chamar ruído de tendência faria o painel apontar movimento todo dia.
  const direcao = variacao > 1 ? "subindo" : variacao < -1 ? "descendo" : "estavel";
  return { avaliado: true, direcao, variacao, dias: uteis.length, media: Math.round(depois) };
}

/**
 * Os pontos do gráfico em coordenadas de tela, prontos para o `path` do SVG.
 *
 * Fica aqui, e não na tela, porque é cálculo puro e é testável: um gráfico
 * que desenha o ponto no lugar errado não quebra nada, só mente.
 *
 * O eixo Y vai de 0 a `maximo` (padrão 100%), e NÃO se ajusta aos dados — um
 * eixo que começa em 60% faria uma variação de 3 pontos parecer um despenho.
 */
export function pontosDaSerie(linhas = [], { largura = 600, altura = 160, maximo = 100, margem = 4 } = {}) {
  const uteis = (Array.isArray(linhas) ? linhas : []).filter(l => l.pct != null);
  if (!uteis.length) return { pontos: [], caminho: "", area: "" };

  const util = Math.max(1, largura - margem * 2);
  const passo = uteis.length > 1 ? util / (uteis.length - 1) : 0;
  const y = pct => altura - (Math.min(pct, maximo) / maximo) * altura;

  const pontos = uteis.map((l, i) => ({
    ...l,
    x: Math.round((margem + i * passo) * 10) / 10,
    y: Math.round(y(l.pct) * 10) / 10,
  }));

  const caminho = pontos.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
  const area = `${caminho} L${pontos[pontos.length - 1].x} ${altura} L${pontos[0].x} ${altura} Z`;
  return { pontos, caminho, area, escalaY: y };
}

/**
 * O ponto mais próximo de um X — é o que o cursor usa para achar o dia sob o
 * mouse. Busca linear porque a série do painel tem dezenas de pontos, não
 * milhares; binária aqui seria complexidade sem ganho.
 */
export function pontoMaisProximo(pontos = [], x) {
  if (!Array.isArray(pontos) || !pontos.length || x == null) return null;
  let melhor = pontos[0], dist = Math.abs(pontos[0].x - x);
  for (const p of pontos) {
    const d = Math.abs(p.x - x);
    if (d < dist) { melhor = p; dist = d; }
  }
  return melhor;
}
