// ═══════════════════════════════════════════════════════════
// COMPARAÇÃO COM A HISTÓRIA DA CASA — motor puro
//
// A fatia 1 deu o número. A fatia 2 deu a curva. A fatia 3 deu a porta. Falta
// a pergunta que a direção faz em voz alta ao ver qualquer um deles:
//
//     "82% é muito?"
//
// Sozinho, não dá para saber. 82% num hospital que vive a 74% é notícia; num
// que vive a 88% é alívio. O número só vira informação ao lado da régua, e a
// régua honesta não é a da literatura: é **a desta casa, nos últimos dias**.
//
// Este arquivo é só isso — a régua. Ele não decide cor de card, não muda
// farol e não substitui limiar nenhum: o limiar diz se o número é RUIM, a
// comparação diz se ele é ESTRANHO, e as duas leituras são diferentes. Um
// hospital pode estar normalmente ruim, e é exatamente o que a direção mais
// precisa ouvir.
//
// ── 🔴 A ARMADILHA QUE MANDA NO DESENHO: ESTOQUE × FLUXO ────
//
// Há dois tipos de número nesta tela, e comparar os dois do mesmo jeito
// produz mentira todos os dias, de manhã:
//
// • **ESTOQUE** é medido num instante — ocupação, fila do PA. "41 leitos
//   ocupados" é verdade às 8h e às 20h. Comparável a qualquer hora.
//
// • **FLUXO** é acumulado no dia — altas, cancelamentos. "3 altas" às 9h da
//   manhã não é um dia ruim: é um dia de três horas. Comparar o dia EM CURSO
//   com a média de dias FECHADOS faz o painel anunciar colapso toda manhã e
//   recuperação milagrosa toda noite. Na terceira manhã ninguém olha mais.
//
// Então fluxo não é julgado enquanto o dia corre. O que o painel compara é o
// ÚLTIMO DIA FECHADO, e diz que é dele que está falando. "Ontem fechou em 12
// altas, média 9" é uma frase que se pode levar para uma reunião; "hoje 3,
// média 9" é só a hora do relógio disfarçada de indicador.
//
// ── 🔴 A SEGUNDA ARMADILHA: O LIMITE DA LEITURA É JANELA CEGA ─
//
// O loader pede 90 dias com `limit`. Quando a consulta BATE no limite, o que
// volta são as linhas mais RECENTES — e os dias do fundo da janela chegam
// pela metade ou não chegam. A média sairia diluída por dias que pareciam
// vazios e só estavam cortados. `coberturaReal` existe para isso: ela não
// acredita no `desde` que foi pedido, ela olha o que de fato veio.
//
// ── E A TERCEIRA: RUÍDO NÃO É NOTÍCIA ───────────────────────
//
// Um painel que aponta variação todo dia ensina a equipe a ignorá-lo. Aqui a
// comparação só fala quando o valor sai de uma banda de um desvio-padrão E
// passa de um piso absoluto — porque com média 0,4 cancelamento/dia, um
// único cancelamento é "2,5× a média" e não é nada. É o mesmo cuidado do
// `direcaoDaSerie` em tendencia.js, pela mesma razão.
//
// ⚠️ APOIO À GESTÃO, NUNCA VERDADE ABSOLUTA. "Acima do normal" aqui quer
// dizer "fora do que esta casa costuma fazer nos dias que eu consegui ler" —
// e é tudo o que um painel pode afirmar sem mentir.
// ═══════════════════════════════════════════════════════════

import { diaDe } from "./torre.js";
import { diasEntre, somarDias } from "./tendencia.js";

/** Os dois tipos de número; a regra de cada um está no `comparar`. */
export const TIPO = { ESTOQUE: "estoque", FLUXO: "fluxo" };

/** Onde o valor caiu em relação à régua. */
export const POSICAO = { ACIMA: "acima", ABAIXO: "abaixo", NORMAL: "normal" };

/** O que a posição SIGNIFICA — depende de o indicador ser bom alto ou baixo. */
export const SENTIDO = { BOM: "bom", RUIM: "ruim", NEUTRO: "neutro" };

/** Por que uma comparação não pôde ser feita. A tela mostra isto, não um zero. */
export const MOTIVO = {
  SEM_LEITURA: "sem_leitura",
  POUCOS_DIAS: "poucos_dias",
  SEM_BASE: "sem_base",
  SEM_VALOR: "sem_valor",
};

/** Quantos dias fechados uma régua precisa para existir. Uma semana: menos
 *  que isso e um fim de semana atípico vira "o normal da casa". */
export const MINIMO_DE_DIAS = 7;

const num = v => {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const media = arr => arr.reduce((t, v) => t + v, 0) / arr.length;

/** Desvio-padrão da amostra (n−1). Com um só valor não há desvio: null. */
function desvioPadrao(vals) {
  if (vals.length < 2) return null;
  const m = media(vals);
  return Math.sqrt(vals.reduce((t, v) => t + (v - m) ** 2, 0) / (vals.length - 1));
}

const arred = (v, casas = 1) => {
  if (v == null) return null;
  const f = 10 ** casas;
  return Math.round(v * f) / f;
};

// ═══════════════════════════════════════════════════════════
// A COBERTURA DE VERDADE DA LEITURA
// ═══════════════════════════════════════════════════════════

/**
 * Até onde a leitura REALMENTE chegou.
 *
 * 🔴 O `desde` que o loader pediu é uma promessa, não um fato. Toda consulta
 * da Torre tem `limit`, e quando o número de linhas bate nele o banco
 * devolveu as mais recentes e calou o resto — sem erro, sem aviso. Os dias do
 * fundo da janela ficam pela metade.
 *
 * Então o primeiro dia confiável é o dia SEGUINTE ao mais antigo que veio: o
 * mais antigo em si pode ter sido cortado no meio, e meio dia contado como
 * dia inteiro é justamente o erro silencioso que afunda uma média.
 *
 * @param lista   o que voltou do banco
 * @param campo   nome da coluna de data ("data_alta", "chegada_em", "data"…)
 * @param desde   o começo da janela PEDIDA
 * @param limite  o `limit` usado na consulta (sem ele não há como saber)
 */
export function coberturaReal(lista, campo, { desde = null, limite = null } = {}) {
  const dias = (Array.isArray(lista) ? lista : [])
    .map(l => diaDe(l?.[campo]))
    .filter(Boolean)
    .sort();

  const maisAntigo = dias[0] || null;
  const truncado = limite != null && Array.isArray(lista) && lista.length >= limite;

  if (!truncado) return { desde, truncado: false, maisAntigo, linhas: dias.length };

  // Cortou: o dia mais antigo veio incompleto, então a régua começa no
  // seguinte. Sem nenhuma data legível não há cobertura a afirmar.
  const seguro = maisAntigo ? somarDias(maisAntigo, 1) : null;
  return {
    desde: seguro && desde && seguro > desde ? seguro : (seguro || desde),
    truncado: true, maisAntigo, linhas: dias.length,
  };
}

/**
 * Onde a régua pode começar.
 *
 * 🔴 O DIA ZERO QUE NÃO EXISTIU. Um hospital que entrou no sistema há 30
 * dias não teve, antes disso, trinta dias de zero alta: ele não existia
 * aqui. Contados como dias fracos, esses dias dividem toda média por dois —
 * e o painel passa a dizer "acima do normal" todo santo dia, para sempre,
 * sobre um hospital que está igual a ele mesmo. É o defeito mais provável de
 * todos neste arquivo, porque é o estado de TODO cliente novo.
 *
 * ⚠️ O começo do sistema vem do MOVIMENTO (as saídas de leito), não do
 * evento que se está medindo. A diferença importa: dia sem cancelamento é um
 * zero verdadeiro e tem de entrar na média — foi um dia em que o hospital
 * rodou e não cancelou nada. Dia antes de o hospital existir no sistema não
 * é zero, é nada. Ancorar cada série no seu próprio evento apagaria os
 * zeros legítimos e tornaria a régua do cancelamento inútil.
 *
 * @param deDesejado      o quanto se quer olhar para trás
 * @param inicioDoSistema primeiro dia com movimento registrado (`maisAntigo`
 *                        da cobertura das saídas de leito)
 * @param cortes          coberturas das leituras que alimentam ESTA série:
 *                        a que bateu no teto empurra o começo para frente
 */
export function inicioDaRegua(deDesejado, inicioDoSistema = null, cortes = []) {
  const candidatos = [deDesejado, inicioDoSistema];
  for (const c of cortes || []) if (c?.truncado && c?.desde) candidatos.push(c.desde);
  const uteis = candidatos.filter(Boolean).sort();
  return uteis.length ? uteis[uteis.length - 1] : null;      // o mais TARDE
}

// ═══════════════════════════════════════════════════════════
// A SÉRIE DIÁRIA
// ═══════════════════════════════════════════════════════════

/**
 * Um valor por dia, do `de` ao `ate`.
 *
 * Sem `valorDe` conta eventos (altas, cancelamentos). Com `valorDe` tira a
 * MÉDIA do que a função devolver naquele dia (permanência, por exemplo) — e
 * dia sem nenhum valor legível sai `valor: null`, não zero: zero é um dia em
 * que nada aconteceu, null é um dia sobre o qual não se sabe.
 *
 * `janelaDesde` vem de `coberturaReal`: antes dele o dia é marcado
 * `confiavel: false` e fica fora de qualquer régua.
 */
export function serieDiaria(eventos, { campo, de, ate, janelaDesde = null, valorDe = null } = {}) {
  const lista = Array.isArray(eventos) ? eventos : [];
  const porDia = new Map();
  let semData = 0;

  for (const e of lista) {
    const dia = diaDe(e?.[campo]);
    if (!dia) { semData++; continue; }
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia).push(e);
  }

  const linhas = diasEntre(de, ate).map(dia => {
    const doDia = porDia.get(dia) || [];
    let valor;
    if (!valorDe) {
      valor = doDia.length;
    } else {
      const vals = doDia.map(valorDe).map(num).filter(v => v != null);
      valor = vals.length ? arred(media(vals)) : null;
    }
    return {
      dia, valor, quantos: doDia.length,
      confiavel: !janelaDesde || dia >= janelaDesde,
    };
  });

  const confiaveis = linhas.filter(l => l.confiavel);
  return {
    linhas, semData,
    desdeConfiavel: confiaveis[0]?.dia || null,
    diasCegos: linhas.length - confiaveis.length,
  };
}

// ═══════════════════════════════════════════════════════════
// A RÉGUA
// ═══════════════════════════════════════════════════════════

/**
 * A régua: média e desvio dos dias que servem.
 *
 * Um dia serve quando é confiável (dentro da cobertura real), tem valor e
 * está FECHADO. O dia de hoje fica fora por construção — ele é o que se quer
 * medir, e medir contra si mesmo encolhe toda diferença.
 */
export function baseDeReferencia(linhas, { hoje = null, minimoDeDias = MINIMO_DE_DIAS, excluir = [] } = {}) {
  const diaHoje = diaDe(hoje);
  const fora = new Set([
    ...(excluir || []).map(diaDe).filter(Boolean),
    ...(diaHoje ? [diaHoje] : []),
  ]);

  const uteis = (Array.isArray(linhas) ? linhas : [])
    .filter(l => l.confiavel && l.valor != null && !fora.has(l.dia));

  if (uteis.length < minimoDeDias) {
    return {
      avaliado: false, motivo: MOTIVO.POUCOS_DIAS, dias: uteis.length,
      minimoDeDias, media: null, desvio: null, de: null, ate: null,
    };
  }

  const vals = uteis.map(l => l.valor);
  return {
    avaliado: true, motivo: null,
    media: arred(media(vals)),
    desvio: arred(desvioPadrao(vals), 2),
    dias: uteis.length, minimoDeDias,
    de: uteis[0].dia, ate: uteis[uteis.length - 1].dia,
    minimo: Math.min(...vals), maximo: Math.max(...vals),
  };
}

/**
 * Onde um valor cai contra a régua.
 *
 * 🔴 DUAS TRAVAS CONTRA ALARME FALSO, e as duas precisam passar:
 *
 * • a BANDA: um desvio-padrão. Dentro dela o valor é o normal da casa
 *   variando, e chamar isso de notícia é ensinar a ignorar o painel;
 * • o PISO absoluto: com média 0,4 cancelamento/dia o desvio é minúsculo e
 *   UM cancelamento viraria "2,5× a média". Verdade aritmética, besteira
 *   gerencial. O piso é por indicador, porque 2 pontos de ocupação e 2
 *   cirurgias canceladas não têm o mesmo tamanho.
 *
 * `melhorQuando` traduz a posição em juízo: "menor" para espera, permanência
 * e cancelamento; "maior" para altas. Null (ocupação) fica NEUTRO de
 * propósito — ocupação alta é receita e é risco ao mesmo tempo, e quem decide
 * isso é o limiar do setor, não esta função.
 */
export function posicaoNaBase(valor, base, { piso = 0, bandas = 1, melhorQuando = null } = {}) {
  const v = num(valor);
  if (v == null) return { avaliado: false, motivo: MOTIVO.SEM_VALOR };
  if (!base?.avaliado) {
    return { avaliado: false, motivo: base?.motivo || MOTIVO.SEM_BASE, dias: base?.dias ?? 0 };
  }

  const delta = arred(v - base.media);
  const abs = Math.abs(delta);
  // Sem desvio (um dia só não tem), a banda é o piso — não há espalhamento a
  // respeitar, e inventar um faria a trava virar enfeite.
  const banda = Math.max(piso, (base.desvio ?? 0) * bandas);

  const posicao = abs <= banda ? POSICAO.NORMAL : delta > 0 ? POSICAO.ACIMA : POSICAO.ABAIXO;
  const sentido = posicao === POSICAO.NORMAL || !melhorQuando
    ? SENTIDO.NEUTRO
    : (posicao === POSICAO.ACIMA) === (melhorQuando === "maior") ? SENTIDO.BOM : SENTIDO.RUIM;

  // "3× a média" só é dito quando a média é grande o bastante para que a
  // razão queira dizer algo. Abaixo de 1 a razão explode e engana.
  const vezes = base.media >= 1 && posicao !== POSICAO.NORMAL ? arred(v / base.media) : null;

  return {
    avaliado: true, motivo: null,
    valor: v, posicao, sentido, delta, vezes, banda: arred(banda, 2),
    media: base.media, desvio: base.desvio, dias: base.dias,
    de: base.de, ate: base.ate,
  };
}

// ═══════════════════════════════════════════════════════════
// O PACOTE QUE O CARD RECEBE
// ═══════════════════════════════════════════════════════════

/**
 * A comparação pronta, com a regra de estoque/fluxo já aplicada.
 *
 * Para FLUXO o `valor` passado é ignorado de propósito: quem é julgado é o
 * último dia FECHADO da própria série, e `diaComparado` viaja para a tela
 * poder dizer de que dia ela está falando. Deixar a tela escolher isso seria
 * devolver a armadilha para a mão de quem desenha card.
 *
 * @param valor     o número de agora (só usado em ESTOQUE)
 * @param serie     de `serieDiaria` / `serieDaFilaNaHora` / `censoDiario`
 * @param opts.lido false quando a leitura falhou — nunca vira régua de zero
 */
export function comparar(valor, serie, {
  tipo = TIPO.ESTOQUE, hoje = null, lido = true,
  piso = 0, bandas = 1, melhorQuando = null, minimoDeDias = MINIMO_DE_DIAS,
} = {}) {
  if (!lido) return { avaliado: false, motivo: MOTIVO.SEM_LEITURA, tipo };

  const linhas = serie?.linhas || [];

  if (tipo === TIPO.FLUXO) {
    const diaHoje = diaDe(hoje);
    const fechados = linhas.filter(l => l.confiavel && l.valor != null && (!diaHoje || l.dia < diaHoje));
    const ultimo = fechados[fechados.length - 1] || null;
    if (!ultimo) {
      return { avaliado: false, motivo: MOTIVO.POUCOS_DIAS, tipo, dias: 0 };
    }
    // A régua do fluxo não inclui o dia que está sendo julgado.
    const regua = baseDeReferencia(linhas, { hoje, minimoDeDias, excluir: [ultimo.dia] });
    const p = posicaoNaBase(ultimo.valor, regua, { piso, bandas, melhorQuando });
    return { ...p, tipo, diaComparado: ultimo.dia, valorComparado: ultimo.valor };
  }

  const base = baseDeReferencia(linhas, { hoje, minimoDeDias });
  return { ...posicaoNaBase(valor, base, { piso, bandas, melhorQuando }), tipo };
}

// ═══════════════════════════════════════════════════════════
// A FILA DO PA: UM ESTOQUE QUE PRECISA SER RECONSTRUÍDO
// ═══════════════════════════════════════════════════════════

/** Quanto tempo alguém pode figurar na fila antes de ser tratado como
 *  registro abandonado. Ver `filaNoInstante`. */
export const TETO_DE_FILA_MIN = 24 * 60;

/**
 * Quantas pessoas esperavam triagem num instante — hoje ou num dia passado.
 *
 * 🔴 POR QUE NÃO SE COMPARA A ESPERA MÉDIA DIRETO. A medida de agora é a
 * espera de quem AINDA espera; a histórica seria a espera de quem JÁ foi
 * triado. São amostras diferentes do mesmo fenômeno: a primeira contém só os
 * casos lentos (quem foi atendido rápido já saiu dela), a segunda contém
 * todos. Comparar as duas faz o presente parecer sistematicamente pior que o
 * passado — todo dia, por construção do cálculo, não por nada que esteja
 * acontecendo no hospital.
 *
 * O que se compara é o TAMANHO DA FILA à mesma hora, que é estoque: quem
 * chegou antes do instante e ainda não tinha sido triado nele. Mesma conta do
 * censo diário de leitos, com chegada→triagem no lugar de internação→alta.
 *
 * 🔴 E O FANTASMA: registro que nunca recebeu triagem e nunca foi encerrado
 * ficaria "esperando" em todos os dias seguintes, para sempre, engordando a
 * régua até o presente parecer ótimo. Depois de `tetoMin` a pessoa sai da
 * fila e é contada em `fantasmas` — a tela pode dizer que há registro
 * abandonado no PS, que é informação de verdade, em vez de deixar o lixo
 * virar referência.
 */
export function filaNoInstante(atendimentos, quando, { tetoMin = TETO_DE_FILA_MIN } = {}) {
  const t = quando instanceof Date ? quando.getTime() : new Date(quando).getTime();
  if (!Number.isFinite(t)) return { esperando: null, fantasmas: 0 };

  let esperando = 0, fantasmas = 0;
  for (const a of Array.isArray(atendimentos) ? atendimentos : []) {
    const chegada = new Date(a?.chegada_em).getTime();
    if (!Number.isFinite(chegada) || chegada > t) continue;

    // A saída da fila é a triagem; na falta dela, o que encerrou o caso.
    const saidaBruta = a?.triagem_em || a?.cancelado_em || a?.desfecho_em || null;
    const saida = saidaBruta ? new Date(saidaBruta).getTime() : NaN;
    const encerrou = Number.isFinite(saida) ? saida : null;

    if (encerrou != null && encerrou <= t) continue;     // já tinha saído da fila
    if (encerrou == null && t - chegada > tetoMin * 60000) { fantasmas++; continue; }
    esperando++;
  }
  return { esperando, fantasmas };
}

/**
 * A fila à MESMA HORA, dia a dia — a régua do PA.
 *
 * A hora vem do instante de referência (agora), porque o PA das 7h e o das
 * 19h são hospitais diferentes e misturá-los produziria uma média que não
 * existe em nenhuma hora do dia.
 */
export function serieDaFilaNaHora(atendimentos, {
  de, ate, agora = new Date(), janelaDesde = null, tetoMin = TETO_DE_FILA_MIN,
} = {}) {
  const ref = agora instanceof Date ? agora : new Date(agora);
  const h = ref.getHours(), min = ref.getMinutes();
  let fantasmas = 0;

  const linhas = diasEntre(de, ate).map(dia => {
    const [a, m, d] = dia.split("-").map(Number);
    const instante = new Date(a, m - 1, d, h, min, 0, 0);
    // A hora de hoje é a de agora; hora que ainda não chegou não tem fila.
    const r = instante > ref
      ? { esperando: null, fantasmas: 0 }
      : filaNoInstante(atendimentos, instante, { tetoMin });
    fantasmas = Math.max(fantasmas, r.fantasmas);
    return { dia, valor: r.esperando, confiavel: !janelaDesde || dia >= janelaDesde };
  });

  const confiaveis = linhas.filter(l => l.confiavel);
  return {
    linhas, fantasmas,
    hora: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`,
    desdeConfiavel: confiaveis[0]?.dia || null,
    diasCegos: linhas.length - confiaveis.length,
  };
}

// ═══════════════════════════════════════════════════════════
// A FRASE
// ═══════════════════════════════════════════════════════════

/** "2026-10-15" → "15/10"; o dia de ontem vira "ontem". */
export function diaCurto(dia, hoje = new Date()) {
  if (!dia) return "—";
  const diaHoje = diaDe(hoje);
  if (dia === diaHoje) return "hoje";
  if (dia === somarDias(diaHoje, -1)) return "ontem";
  const [, m, d] = String(dia).split("-");
  return `${d}/${m}`;
}

/**
 * A linha que o card mostra. Fica no motor, e não na tela, porque é a parte
 * que pode MENTIR — e mentira é testável.
 *
 * Nunca devolve frase tranquilizadora vazia: quando não há régua, diz por que
 * não há, porque "sem comparação" e "dentro do normal" levam a atos
 * diferentes.
 */
export function fraseDaComparacao(c, { unidade = "", hoje = new Date(), rotuloDeAgora = "agora" } = {}) {
  if (!c) return null;
  const u = unidade || "";

  if (!c.avaliado) {
    if (c.motivo === MOTIVO.SEM_LEITURA) return "sem régua — a leitura falhou";
    if (c.motivo === MOTIVO.POUCOS_DIAS) {
      const d = c.dias ?? 0;
      return `sem régua ainda — ${d} dia${d === 1 ? "" : "s"} de histórico`;
    }
    if (c.motivo === MOTIVO.SEM_VALOR) return null;   // o card já mostra "—"
    return "sem comparação";
  }

  const quando = c.tipo === TIPO.FLUXO ? diaCurto(c.diaComparado, hoje) : rotuloDeAgora;
  const base = `média ${c.media}${u} em ${c.dias} dias`;

  if (c.posicao === POSICAO.NORMAL) return `${quando}: dentro do normal · ${base}`;

  const seta = c.posicao === POSICAO.ACIMA ? "▲" : "▼";
  const palavra = c.posicao === POSICAO.ACIMA ? "acima" : "abaixo";
  const vezes = c.vezes != null && c.vezes >= 1.5 ? ` (${c.vezes}× a média)` : "";
  return `${seta} ${quando} ${palavra} do normal${vezes} · ${base}`;
}
