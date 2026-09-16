// ═══════════════════════════════════════════════════════════
// ALOJAMENTO CONJUNTO — motor puro
//
// Depois do parto, mãe e bebê ficam no MESMO quarto e são avaliados como UM
// binômio. É o trecho mais curto da internação e o mais perigoso: a hemorragia
// pós-parto mata na primeira hora, a infecção puerperal aparece no segundo dia,
// e a icterícia do bebê se decide entre o 3º e o 5º. Nenhum desses três dá
// aviso — eles aparecem em um número que alguém precisa ter medido.
//
// Este motor transforma números medidos em sinal:
//  • PERDA DE PESO do RN — o único jeito objetivo de saber se a amamentação
//    está funcionando. Percentual sobre o peso de nascimento.
//  • ICTERÍCIA — zonas de Kramer (a progressão craniocaudal) e a regra que não
//    admite exceção: icterícia nas primeiras 24 h de vida é sempre patológica.
//  • PUERPÉRIO — útero, lóquios e ferida operatória viram alerta de hemorragia
//    ou de infecção.
//  • ALEITAMENTO — pega, tipo e número de mamadas.
//  • ALTA DO BINÔMIO — o checklist que diz se pode ir para casa, e o que falta.
//
// ⚠️ APOIO, NUNCA CONDUTA. As faixas sinalizam; quem examina decide.
// ⚠️ NÃO CHUTA. Faltando o peso de nascimento, a perda não é "0%" — é
//    `avaliado:false`. Um zero inventado aqui é um bebê desidratado que o
//    painel mostra em verde.
// ═══════════════════════════════════════════════════════════

export const NIVEL = { NORMAL: "normal", ATENCAO: "atencao", ALERTA: "alerta" };

const ORDEM_NIVEL = { [NIVEL.NORMAL]: 0, [NIVEL.ATENCAO]: 1, [NIVEL.ALERTA]: 2 };

/** O mais grave entre vários níveis (NORMAL quando não há nenhum). */
export function piorNivel(niveis = []) {
  let pior = NIVEL.NORMAL;
  for (const n of niveis) {
    if (ORDEM_NIVEL[n] > ORDEM_NIVEL[pior]) pior = n;
  }
  return pior;
}

const num = v => {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Horas entre duas datas; null se alguma não der para ler. */
export function horasDeVida(nascidoEm, agora = new Date()) {
  if (!nascidoEm) return null;
  const t = new Date(nascidoEm).getTime();
  const a = new Date(agora).getTime();
  if (!Number.isFinite(t) || !Number.isFinite(a)) return null;
  return Math.max(0, (a - t) / 3600000);
}

// ── Perda de peso do recém-nascido ───────────────────────────

/**
 * Perda de peso sobre o peso de NASCIMENTO, em percentual.
 *
 * Todo recém-nascido perde peso nos primeiros dias — é fisiológico até ~7%, e
 * a recuperação se espera até o 10º–15º dia. A partir de 10% a perda deixa de
 * ser fisiológica: é sinal de que a amamentação não está pegando e pode virar
 * desidratação. O corte de 10% é o gatilho clássico de reavaliação.
 *
 * Devolve `{ avaliado, perdaG, perdaPct, classe, rotulo, nivel }`.
 * `classe`: ganho | fisiologica | limitrofe | excessiva.
 */
export function avaliarPerdaDePeso(pesoNascimentoG, pesoAtualG) {
  const nasc = num(pesoNascimentoG), atual = num(pesoAtualG);
  if (nasc == null || nasc <= 0 || atual == null || atual <= 0) {
    return { avaliado: false, perdaG: null, perdaPct: null, classe: null, rotulo: null, nivel: NIVEL.NORMAL };
  }
  const perdaG = nasc - atual;
  const perdaPct = Math.round((perdaG / nasc) * 1000) / 10;   // uma casa

  let classe, rotulo, nivel;
  if (perdaPct <= 0) {
    classe = "ganho"; rotulo = "Recuperando/ganhando peso"; nivel = NIVEL.NORMAL;
  } else if (perdaPct < 7) {
    classe = "fisiologica"; rotulo = `Perda fisiológica (${perdaPct}%)`; nivel = NIVEL.NORMAL;
  } else if (perdaPct < 10) {
    classe = "limitrofe"; rotulo = `Perda limítrofe (${perdaPct}%) — avaliar a mamada`; nivel = NIVEL.ATENCAO;
  } else {
    classe = "excessiva"; rotulo = `Perda excessiva (${perdaPct}%) — reavaliar hoje`; nivel = NIVEL.ALERTA;
  }
  return { avaliado: true, pesoNascimentoG: nasc, pesoAtualG: atual, perdaG, perdaPct, classe, rotulo, nivel };
}

// ── Icterícia: zonas de Kramer ───────────────────────────────

/**
 * As 5 zonas de Kramer. A icterícia progride de cima para baixo, então a
 * zona alcançada estima a bilirrubina — grosseiramente, mas à beira do leito,
 * sem exame. A estimativa é ORIENTAÇÃO: quem trata pede a bilirrubina.
 */
export const KRAMER = [
  { zona: 1, regiao: "Cabeça e pescoço", bilirrubina: "~6 mg/dL" },
  { zona: 2, regiao: "Até o umbigo", bilirrubina: "~9 mg/dL" },
  { zona: 3, regiao: "Até os joelhos", bilirrubina: "~12 mg/dL" },
  { zona: 4, regiao: "Até os tornozelos/antebraços", bilirrubina: "~15 mg/dL" },
  { zona: 5, regiao: "Mãos e pés (palmas e plantas)", bilirrubina: "≥18 mg/dL" },
];

/**
 * A leitura da icterícia. Zona 0/vazia = sem icterícia.
 *
 * 🔴 A REGRA QUE NÃO TEM EXCEÇÃO: icterícia nas primeiras 24 horas de vida é
 * SEMPRE patológica, em qualquer zona — doença hemolítica até prova em
 * contrário. Por isso a hora de vida entra no cálculo: a mesma zona 1 vale
 * "normal" no terceiro dia e "alerta" no primeiro.
 */
export function avaliarIctericia(zona, horas = null) {
  const z = num(zona);
  const h = num(horas);
  if (z == null || z <= 0) {
    return { avaliado: true, presente: false, zona: 0, regiao: null, bilirrubina: null, nivel: NIVEL.NORMAL, motivo: null };
  }
  const faixa = KRAMER.find(k => k.zona === Math.min(5, Math.max(1, Math.round(z)))) || null;
  let nivel = NIVEL.NORMAL, motivo = null;

  if (h != null && h < 24) {
    nivel = NIVEL.ALERTA;
    motivo = "Icterícia nas primeiras 24 h de vida — sempre patológica, colher bilirrubina.";
  } else if (faixa.zona >= 4) {
    nivel = NIVEL.ALERTA;
    motivo = "Zona 4–5 de Kramer — bilirrubina alta, colher e avaliar fototerapia.";
  } else if (faixa.zona === 3) {
    nivel = NIVEL.ATENCAO;
    motivo = "Zona 3 de Kramer — acompanhar de perto e considerar bilirrubina.";
  }
  return { avaliado: true, presente: true, zona: faixa.zona, regiao: faixa.regiao, bilirrubina: faixa.bilirrubina, nivel, motivo };
}

// ── Puerpério: útero, lóquios e ferida ───────────────────────

export const UTERO = { CONTRAIDO: "contraido", GLOBOSO: "globoso", AMOLECIDO: "amolecido" };
export const LOQUIOS_QTD = { AUSENTE: "ausente", POUCO: "pouco", MODERADO: "moderado", AUMENTADO: "aumentado" };

/**
 * Os alertas do puerpério imediato. Cada regra existe por um motivo clínico:
 *
 * • ÚTERO AMOLECIDO é atonia uterina — a causa nº 1 de hemorragia pós-parto.
 *   Com lóquios aumentado junto, não é achado: é sangramento em curso.
 * • LÓQUIOS FÉTIDOS = endometrite até prova em contrário; com febre, mais ainda.
 * • FERIDA com secreção ou deiscência = infecção de sítio cirúrgico.
 * • DOR desproporcional (EVA ≥ 7) pode ser hematoma — não é "normal do parto".
 *
 * ⚠️ Os sinais VITAIS não são avaliados aqui: quem pontua vitais é o MEOWS
 * (meows.js), um motor só no sistema. Este devolve o que o MEOWS não vê.
 */
export function avaliarPuerperio(ev = {}) {
  const alertas = [];
  const temperatura = num(ev.temp ?? ev.vitais?.temp);
  const febre = temperatura != null && temperatura >= 38;

  const utero = ev.utero || null;
  const loquios = ev.loquios_quantidade || null;
  const fetido = ev.loquios_odor === "fetido";

  if (utero === UTERO.AMOLECIDO && loquios === LOQUIOS_QTD.AUMENTADO) {
    alertas.push({ chave: "hemorragia", nivel: NIVEL.ALERTA,
      texto: "Útero amolecido com lóquios aumentado — suspeita de atonia/hemorragia pós-parto. Massagear o fundo e chamar a equipe." });
  } else if (utero === UTERO.AMOLECIDO) {
    alertas.push({ chave: "utero", nivel: NIVEL.ATENCAO,
      texto: "Útero amolecido — massagear o fundo uterino e reavaliar." });
  } else if (loquios === LOQUIOS_QTD.AUMENTADO) {
    alertas.push({ chave: "loquios", nivel: NIVEL.ATENCAO,
      texto: "Lóquios aumentado — quantificar a perda e reavaliar o tônus uterino." });
  }

  if (fetido) {
    alertas.push({ chave: "infeccao", nivel: febre ? NIVEL.ALERTA : NIVEL.ATENCAO,
      texto: febre
        ? "Lóquios fétidos com febre — endometrite puerperal até prova em contrário."
        : "Lóquios fétidos — avaliar infecção puerperal." });
  } else if (febre) {
    alertas.push({ chave: "febre", nivel: NIVEL.ATENCAO,
      texto: "Temperatura ≥ 38 °C no puerpério — procurar o foco (mama, útero, ferida, urina)." });
  }

  if (ev.ferida_aspecto === "deiscencia" || ev.ferida_aspecto === "secrecao") {
    alertas.push({ chave: "ferida", nivel: NIVEL.ALERTA,
      texto: "Ferida com secreção/deiscência — infecção de sítio cirúrgico, avaliar hoje." });
  } else if (ev.ferida_aspecto === "hiperemia") {
    alertas.push({ chave: "ferida", nivel: NIVEL.ATENCAO,
      texto: "Ferida hiperemiada — acompanhar a cada turno." });
  }

  if (ev.mamas === "mastite") {
    alertas.push({ chave: "mamas", nivel: NIVEL.ALERTA, texto: "Mastite — avaliar antibiótico e manter a amamentação." });
  } else if (ev.mamas === "ingurgitadas" || ev.mamas === "fissura") {
    alertas.push({ chave: "mamas", nivel: NIVEL.ATENCAO,
      texto: ev.mamas === "fissura" ? "Fissura mamilar — corrigir a pega." : "Mamas ingurgitadas — ordenha e mamadas mais frequentes." });
  }

  const dor = num(ev.dor_eva);
  if (dor != null && dor >= 7) {
    alertas.push({ chave: "dor", nivel: NIVEL.ATENCAO,
      texto: "Dor intensa (EVA ≥ 7) — analgesia e descartar hematoma." });
  }

  if (ev.diurese === false) {
    alertas.push({ chave: "diurese", nivel: NIVEL.ATENCAO,
      texto: "Sem diurese registrada — retenção urinária é comum no pós-parto." });
  }

  return { alertas, nivel: piorNivel(alertas.map(a => a.nivel)) };
}

// ── Aleitamento materno ──────────────────────────────────────

export const ALEITAMENTO = {
  EXCLUSIVO: "exclusivo", PREDOMINANTE: "predominante",
  COMPLEMENTADO: "complementado", FORMULA: "formula",
};

export const ROTULO_ALEITAMENTO = {
  [ALEITAMENTO.EXCLUSIVO]: "Aleitamento materno exclusivo",
  [ALEITAMENTO.PREDOMINANTE]: "Predominante (leite materno + água/chá)",
  [ALEITAMENTO.COMPLEMENTADO]: "Complementado com fórmula",
  [ALEITAMENTO.FORMULA]: "Fórmula apenas",
};

/** O mínimo esperado de mamadas em 24 h no alojamento (livre demanda). */
export const MAMADAS_ESPERADAS = 8;

/**
 * A avaliação da amamentação. O alojamento conjunto existe justamente para
 * isto: é aqui que a amamentação pega ou não pega, e a janela é de dois dias.
 *
 * `apoio` é a lista do que oferecer — não é alarme, é trabalho de enfermagem.
 */
export function avaliarAleitamento(ev = {}) {
  const apoio = [];
  const tipo = ev.aleitamento || null;
  const mamadas = num(ev.mamadas_24h);

  if (ev.pega === "inadequada") {
    apoio.push({ chave: "pega", nivel: NIVEL.ATENCAO,
      texto: "Pega inadequada — corrigir posição e pega antes da alta (é o que causa fissura e desmame)." });
  }
  if (mamadas != null && mamadas < MAMADAS_ESPERADAS) {
    apoio.push({ chave: "mamadas", nivel: NIVEL.ATENCAO,
      texto: `${mamadas} mamadas em 24 h (esperado ≥ ${MAMADAS_ESPERADAS}) — estimular livre demanda e checar sonolência do RN.` });
  }
  if (tipo === ALEITAMENTO.FORMULA || tipo === ALEITAMENTO.COMPLEMENTADO) {
    apoio.push({ chave: "complemento", nivel: NIVEL.ATENCAO,
      texto: "Em uso de fórmula — registrar a indicação e ofertar apoio para relactação." });
  }

  return {
    tipo,
    ame: tipo === ALEITAMENTO.EXCLUSIVO,
    mamadas,
    apoio,
    nivel: piorNivel(apoio.map(a => a.nivel)),
  };
}

// ── A alta do binômio ────────────────────────────────────────

/** Permanência mínima esperada, em horas, por via de parto. */
export const PERMANENCIA_MIN = { vaginal: 24, forceps: 24, cesarea: 48 };

function item(chave, rotulo, ok, motivo = null) {
  return { chave, rotulo, ok: !!ok, motivo: ok ? null : motivo };
}

/**
 * O checklist da alta conjunta: mãe e bebê saem JUNTOS, então as pendências
 * dos dois entram na mesma lista.
 *
 * @param dados {
 *   evolucao,          // a última evolução do binômio (o que foi examinado hoje)
 *   rn,                // a avaliação do berço (mat_recem_nascidos): triagem, peso
 *   via,               // via do parto: vaginal | forceps | cesarea
 *   horas,             // horas de vida do RN
 *   perda,             // resultado de avaliarPerdaDePeso
 *   ictericia,         // resultado de avaliarIctericia
 *   puerperio,         // resultado de avaliarPuerperio
 * }
 *
 * 🔴 O PEZINHO É O ÚNICO ITEM QUE PODE SAIR "AGENDADO": a coleta só vale a
 * partir de 48 h de vida, e quase toda alta de parto normal acontece antes
 * disso. Exigir a coleta impediria altas corretas; ignorá-la perderia o teste.
 * Então antes de 48 h o item pede o AGENDAMENTO, não a coleta.
 */
export function checklistAlta(dados = {}) {
  const { evolucao = {}, rn = null, via = null, horas = null, perda = null, ictericia = null, puerperio = null } = dados;
  const triagem = rn?.triagem || {};
  const feito = v => v != null && v !== "" && v !== "pendente" && v !== false;

  const itens = [];

  // ── permanência mínima ──
  const minimo = PERMANENCIA_MIN[via] ?? PERMANENCIA_MIN.vaginal;
  itens.push(item("permanencia", `Permanência mínima (${minimo} h)`,
    horas != null && horas >= minimo,
    horas == null ? "Não sei a hora do nascimento." : `${Math.floor(horas)} h de vida — faltam ${Math.ceil(minimo - horas)} h.`));

  // ── triagem neonatal ──
  const podeColherPezinho = horas != null && horas >= 48;
  itens.push(item("pezinho", podeColherPezinho ? "Teste do pezinho coletado" : "Teste do pezinho agendado",
    podeColherPezinho ? feito(triagem.pezinho) : (feito(triagem.pezinho) || feito(evolucao.pezinho_agendado)),
    podeColherPezinho
      ? "A coleta já é possível (≥ 48 h) e não foi registrada."
      : "Antes de 48 h de vida a coleta não vale — agende o retorno e registre."));
  itens.push(item("orelhinha", "Teste da orelhinha", feito(triagem.orelhinha), "Não registrado na avaliação do RN."));
  itens.push(item("olhinho", "Teste do olhinho", feito(triagem.olhinho), "Não registrado na avaliação do RN."));
  itens.push(item("coracaozinho", "Teste do coraçãozinho", feito(triagem.coracaozinho), "Não registrado na avaliação do RN."));

  // ── imunização ──
  itens.push(item("bcg", "BCG", evolucao.vacina_bcg === true, "Aplicar antes da alta."));
  itens.push(item("hep_b", "Hepatite B", evolucao.vacina_hep_b === true, "Aplicar antes da alta (primeiras 12–24 h)."));

  // ── o bebê está mamando e ganhando ──
  const alim = avaliarAleitamento(evolucao);
  itens.push(item("aleitamento", "Amamentação estabelecida",
    evolucao.pega === "adequada",
    evolucao.pega === "inadequada" ? "Pega inadequada — corrigir antes de liberar." : "Pega não avaliada neste turno."));
  itens.push(item("peso", "Perda de peso aceitável",
    !perda?.avaliado || perda.nivel !== NIVEL.ALERTA,
    perda?.rotulo || "Perda de peso excessiva."));
  itens.push(item("ictericia", "Sem icterícia de alerta",
    !ictericia?.presente || ictericia.nivel !== NIVEL.ALERTA,
    ictericia?.motivo || "Icterícia em zona de alerta."));

  // ── a mãe está bem ──
  itens.push(item("puerperio", "Puerpério sem alerta",
    !puerperio || puerperio.nivel !== NIVEL.ALERTA,
    puerperio?.alertas?.find(a => a.nivel === NIVEL.ALERTA)?.texto || "Alerta ativo no puerpério."));

  // ── o seguimento está marcado ──
  itens.push(item("consulta_puerperio", "Consulta de puerpério agendada",
    evolucao.consulta_puerperio === true, "Agendar (primeira revisão até 7 dias)."));
  itens.push(item("consulta_rn", "Consulta do RN agendada",
    evolucao.consulta_rn === true, "Agendar a primeira consulta do bebê (até 7 dias)."));
  itens.push(item("orientacoes", "Orientações de alta dadas",
    evolucao.orientacoes === true, "Sinais de alarme da mãe e do bebê, amamentação e retorno."));

  const pendencias = itens.filter(i => !i.ok);
  return {
    itens,
    pendencias,
    pronto: pendencias.length === 0,
    aleitamento: alim,
  };
}

// ── A evolução inteira, em uma leitura ───────────────────────

/**
 * Junta os motores em uma leitura só do binômio — é o que a tela mostra no
 * topo e o que a lista de evoluções resume em cada linha.
 *
 * @param evolucao  a linha de `mat_alojamento`
 * @param ctx       { pesoNascimentoG, nascidoEm, agora, rn, via }
 */
export function avaliarBinomio(evolucao = {}, ctx = {}) {
  const horas = horasDeVida(ctx.nascidoEm, ctx.agora || new Date());
  const perda = avaliarPerdaDePeso(ctx.pesoNascimentoG, evolucao.rn_peso_g);
  const ictericia = avaliarIctericia(evolucao.rn_ictericia_zona, horas);
  const puerperio = avaliarPuerperio(evolucao);
  const aleitamento = avaliarAleitamento(evolucao);

  return {
    horas,
    perda,
    ictericia,
    puerperio,
    aleitamento,
    nivel: piorNivel([perda.nivel, ictericia.nivel, puerperio.nivel, aleitamento.nivel]),
  };
}
