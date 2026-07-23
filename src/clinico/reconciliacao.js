// ═══════════════════════════════════════════════════════════
// RECONCILIAÇÃO MEDICAMENTOSA — admissão e alta
//
// O PROBLEMA QUE ISTO RESOLVE
// A maior parte dos erros de medicação não acontece na prescrição: acontece
// na TRANSIÇÃO. O paciente chega tomando cinco remédios em casa, é internado,
// recebe uma prescrição nova montada do zero, e o anti-hipertensivo dele
// simplesmente some — ninguém decidiu suspender, ninguém decidiu manter,
// ninguém percebeu. Na alta acontece o inverso: ele leva para casa o
// antibiótico do hospital e para de tomar o que já tomava.
//
// Reconciliar é obrigar uma DECISÃO EXPLÍCITA sobre cada medicamento, em
// cada transição. O software não decide nada — ele impede que a omissão
// passe despercebida, que é a única coisa que software pode fazer aqui.
//
// A DISTINÇÃO QUE O MÓDULO INTEIRO PROTEGE
// Suspender um medicamento é ato clínico legítimo. Esquecer dele não é.
// Os dois produzem exatamente o mesmo resultado no papel — o remédio não
// está na prescrição. A diferença é que um tem justificativa registrada e o
// outro não. Por isso "sem decisão" é tratado aqui como DISCREPÂNCIA, e não
// como um item pendente qualquer.
//
// Funções puras: sem React, sem rede, sem relógio interno. O casamento entre
// listas é SUGESTÃO — quem decide é o profissional. Nenhuma função aqui
// esconde um medicamento por ter achado que casou com outro.
// ═══════════════════════════════════════════════════════════

import { normTxt } from "./alertas.js";

// ── VOCABULÁRIO ─────────────────────────────────────────────

export const MOMENTOS = {
  admissao: { label: "Admissão", explica: "O que o paciente tomava em casa versus o que foi prescrito aqui." },
  alta:     { label: "Alta",     explica: "O que ele leva para casa: o de antes, o do hospital, e o que foi suspenso." },
};

/**
 * As decisões possíveis sobre um medicamento.
 * `exigeJustificativa` marca as que mudam o tratamento prévio: quem altera
 * o que outro profissional vinha fazendo precisa dizer por quê — é o que
 * transforma a decisão em informação clínica para o próximo plantão.
 * `levaParaCasa` responde a pergunta da alta: entra na receita ou não.
 */
export const DECISOES = {
  manter:     { label: "Manter",            exigeJustificativa: false, levaParaCasa: true },
  alterar:    { label: "Alterar dose/via",  exigeJustificativa: true,  levaParaCasa: true },
  substituir: { label: "Substituir",        exigeJustificativa: true,  levaParaCasa: true },
  suspender:  { label: "Suspender",         exigeJustificativa: true,  levaParaCasa: false },
  // "reiniciar" só faz sentido na alta: foi suspenso durante a internação e
  // volta agora. É a decisão que mais se perde — o paciente vai para casa
  // sem saber se pode voltar a tomar.
  reiniciar:  { label: "Retomar após a alta", exigeJustificativa: false, levaParaCasa: true },
  novo:       { label: "Novo (iniciado aqui)", exigeJustificativa: false, levaParaCasa: true },
};

export const DISCREPANCIAS = {
  sem_decisao:           { gravidade: "alta",  label: "Sem decisão registrada" },
  omissao:               { gravidade: "alta",  label: "Uso domiciliar ausente da prescrição" },
  dose_divergente:       { gravidade: "media", label: "Dose diferente da de casa" },
  via_divergente:        { gravidade: "media", label: "Via diferente da de casa" },
  frequencia_divergente: { gravidade: "media", label: "Frequência diferente da de casa" },
  duplicidade:           { gravidade: "alta",  label: "Aparece duas vezes na mesma lista" },
  sem_justificativa:     { gravidade: "media", label: "Mudança sem justificativa" },
};

// ── LISTA DE USO DOMICILIAR ─────────────────────────────────

/**
 * O que vale agora na lista de casa: sem os registros já corrigidos por
 * outro, sem os encerrados e sem a declaração de "não usa nada" — que é
 * registro de entrevista, não medicamento.
 */
export function vigentesDeUso(medicamentos = []) {
  return ativos(medicamentos).filter(m => !m.sem_uso);
}

function ativos(medicamentos = []) {
  const lista = Array.isArray(medicamentos) ? medicamentos : [];
  const corrigidos = new Set(lista.map(m => m.corrige_id).filter(Boolean));
  return lista.filter(m => !corrigidos.has(m.id) && (m.situacao || "ativa") === "ativa");
}

/**
 * Alguém PERGUNTOU e o paciente não usa medicamento em casa?
 *
 * Diferente de lista vazia, que só significa que ninguém entrevistou. Sem
 * esta distinção, o polimedicado que ninguém perguntou fica idêntico na
 * tela ao que realmente não toma nada — e é o primeiro que a reconciliação
 * existe para pegar. Mesma decisão já tomada em `alergias.js`.
 */
export function negaUsoDomiciliar(medicamentos = []) {
  return ativos(medicamentos).some(m => m.sem_uso);
}

/**
 * Estado da lista de uso domiciliar, para a faixa de aviso da tela.
 *   "com_lista"    — há medicamentos registrados
 *   "nenhum"       — perguntou-se e o paciente não usa nada
 *   "sem_registro" — NINGUÉM PERGUNTOU
 */
export function situacaoUsoDomiciliar(medicamentos = []) {
  const lista = vigentesDeUso(medicamentos);
  if (lista.length) return { estado: "com_lista", itens: lista };
  if (negaUsoDomiciliar(medicamentos)) return { estado: "nenhum", itens: [] };
  return { estado: "sem_registro", itens: [] };
}

/**
 * Lê "12/12h", "8/8h", "3x ao dia" e devolve doses por dia.
 *
 * Serve para comparar a frequência de casa com a do hospital. Quando não
 * entende, devolve null — e null não gera divergência, que é o
 * comportamento certo para "não sei": inventar 1x/dia a partir de um texto
 * ambíguo produziria alerta falso sobre posologia.
 */
export function freqPorDia(txt) {
  const s = String(txt || "").toLowerCase().replace(/\s/g, "").replace(",", ".");
  // "12/12h", "8/8h" — o intervalo entre doses
  const intervalo = s.match(/(\d+)\/(\d+)h/);
  if (intervalo && intervalo[1] === intervalo[2]) {
    const h = Number(intervalo[1]);
    if (h > 0 && 24 % h === 0) return 24 / h;
  }
  // "de 8 em 8 horas"
  const emEm = s.match(/de(\d+)em\d+h/);
  if (emEm) {
    const h = Number(emEm[1]);
    if (h > 0 && 24 % h === 0) return 24 / h;
  }
  const vezes = s.match(/(\d+)x/);
  if (vezes) return Number(vezes[1]) || null;
  if (/(umavez|1vez)/.test(s)) return 1;
  return null;
}

// ── CASAMENTO ENTRE AS LISTAS ───────────────────────────────

/**
 * A chave por onde dois registros do mesmo remédio se reconhecem.
 *
 * Ordem de preferência:
 *   1. `medicamento_id` — casamento certo, veio do catálogo dos dois lados;
 *   2. princípio ativo / substância normalizada;
 *   3. a primeira palavra da descrição ("Dipirona 500mg" → "dipirona").
 *
 * O passo 3 é grosseiro de propósito. Casar demais é pior que casar de
 * menos: um falso par faz a tela dizer "já decidido" sobre um medicamento
 * que ninguém olhou. Como o par só SUGERE, e o item domiciliar continua
 * aparecendo na lista mesmo quando casa, errar aqui custa um clique — não
 * um medicamento perdido.
 */
export function chaveMedicamento(item) {
  if (!item) return null;
  if (item.medicamento_id) return "id:" + item.medicamento_id;
  const pa = normTxt(item.substancia || item.principio_ativo || "");
  if (pa.length >= 3) return "pa:" + pa;
  const desc = normTxt(item.descricao || item.nome || "");
  const primeira = desc.split(/[\s,/(]+/).filter(p => p.length >= 3)[0];
  return primeira ? "txt:" + primeira : null;
}

/** Sugere os pares entre a lista de casa e a do hospital. */
export function casarListas(domiciliares = [], hospitalares = []) {
  const usados = new Set();
  const pares = [];
  const soDomiciliar = [];

  for (const dom of domiciliares) {
    const chave = chaveMedicamento(dom);
    const idx = hospitalares.findIndex(
      (h, k) => !usados.has(k) && chave && chaveMedicamento(h) === chave);
    if (idx >= 0) { usados.add(idx); pares.push({ domiciliar: dom, hospitalar: hospitalares[idx] }); }
    else soDomiciliar.push(dom);
  }
  const soHospitalar = hospitalares.filter((_, k) => !usados.has(k));
  return { pares, soDomiciliar, soHospitalar };
}

// ── COMPARAÇÃO DE POSOLOGIA ─────────────────────────────────

/**
 * Extrai o número de um campo de dose escrito de qualquer jeito
 * ("500 mg", "500mg", "0,5 g"). Vírgula decimal é a regra no Brasil.
 */
export function doseNumero(dose) {
  if (dose == null || dose === "") return null;
  if (typeof dose === "number") return Number.isFinite(dose) ? dose : null;
  const m = String(dose).replace(",", ".").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/**
 * Compara dose, via e frequência entre o de casa e o do hospital.
 * Devolve só o que DIVERGE. Campo em branco de um dos lados não gera
 * divergência: ausência de informação não é evidência de mudança, e alerta
 * que dispara por dado faltando é o alerta que ninguém mais lê.
 */
export function divergencias(domiciliar, hospitalar) {
  if (!domiciliar || !hospitalar) return [];
  const achados = [];

  const dDom = doseNumero(domiciliar.dose_valor ?? domiciliar.dose);
  const dHos = doseNumero(hospitalar.dose_valor ?? hospitalar.dose);
  const uDom = normTxt(domiciliar.dose_unidade || "");
  const uHos = normTxt(hospitalar.dose_unidade || "");
  // Unidades diferentes (mg × g) não são comparáveis por número puro.
  // Comparar seria pior que não comparar: "500 mg" versus "0,5 g" viraria
  // um alerta falso, e falso alerta ensina a ignorar alerta.
  if (dDom != null && dHos != null && dDom !== dHos && (!uDom || !uHos || uDom === uHos))
    achados.push({ tipo: "dose_divergente", de: domiciliar.dose ?? dDom, para: hospitalar.dose ?? dHos });

  const viaDom = normTxt(domiciliar.via || ""), viaHos = normTxt(hospitalar.via || "");
  if (viaDom && viaHos && viaDom !== viaHos)
    achados.push({ tipo: "via_divergente", de: domiciliar.via, para: hospitalar.via });

  const fDom = Number(domiciliar.frequencia_dia) || null;
  const fHos = Number(hospitalar.frequencia_dia) || null;
  if (fDom && fHos && fDom !== fHos)
    achados.push({ tipo: "frequencia_divergente", de: domiciliar.frequencia || `${fDom}x/dia`, para: hospitalar.frequencia || `${fHos}x/dia` });

  return achados;
}

// ── A ANÁLISE ───────────────────────────────────────────────

/**
 * Monta a tela da reconciliação: uma linha por medicamento envolvido, com
 * a decisão já tomada (se houver) e o que ainda está em aberto.
 *
 * `decisoes` é um mapa `{ [chave]: { decisao, justificativa } }` — o que já
 * foi registrado em `pep_reconciliacao_itens`. Enquanto uma linha não tem
 * decisão, ela é uma discrepância de gravidade ALTA, não um item pendente
 * de preenchimento: o remédio de casa que ninguém avaliou é exatamente o
 * caso que esta feature existe para pegar.
 */
export function analisarReconciliacao({ domiciliares = [], hospitalares = [], decisoes = {}, momento = "admissao" } = {}) {
  const { pares, soDomiciliar, soHospitalar } = casarListas(domiciliares, hospitalares);
  const linhas = [];

  const decisaoDe = item => {
    const c = chaveMedicamento(item);
    return (c && decisoes[c]) || null;
  };

  const montar = (item, origem, hospitalar) => {
    const d = decisaoDe(item);
    const achados = [];

    // Um medicamento iniciado no hospital não "falta decisão" na admissão:
    // prescrevê-lo JÁ é a decisão. Na alta, aí sim, alguém precisa dizer se
    // ele continua em casa.
    const exigeDecisao = momento === "alta" || origem === "domiciliar";

    if (!d?.decisao) {
      if (exigeDecisao)
        achados.push({ tipo: origem === "domiciliar" && !hospitalar ? "omissao" : "sem_decisao" });
    } else if (DECISOES[d.decisao]?.exigeJustificativa && !String(d.justificativa || "").trim()) {
      achados.push({ tipo: "sem_justificativa" });
    }

    // Divergência de posologia só interessa quando a decisão foi MANTER:
    // se o profissional escolheu alterar, a diferença é o efeito pretendido.
    if (hospitalar && (!d?.decisao || d.decisao === "manter"))
      achados.push(...divergencias(item, hospitalar));

    linhas.push({
      chave: chaveMedicamento(item),
      origem, item, hospitalar: hospitalar || null,
      decisao: d?.decisao || null,
      justificativa: d?.justificativa || null,
      discrepancias: achados.map(a => ({ ...a, ...DISCREPANCIAS[a.tipo] })),
      exigeDecisao,
      // "Pendente" é falta de decisão ONDE ELA É EXIGIDA. Sem esta distinção,
      // um item prescrito no hospital deixaria a reconciliação de admissão
      // eternamente incompleta — e barra que nunca fica verde é barra que
      // todo mundo aprende a ignorar.
      pendente: exigeDecisao && !d?.decisao,
      // `null` = ainda não se sabe. Sem decisão registrada, nada entra na
      // receita de alta por inércia.
      levaParaCasa: d?.decisao ? !!DECISOES[d.decisao]?.levaParaCasa : null,
    });
  };

  for (const p of pares) montar(p.domiciliar, "domiciliar", p.hospitalar);
  for (const d of soDomiciliar) montar(d, "domiciliar", null);
  for (const h of soHospitalar) montar(h, "hospitalar", null);

  // Duplicidade dentro da MESMA origem — dois registros do mesmo remédio na
  // lista de casa costumam ser o genérico e o de marca anotados duas vezes,
  // e viram dose dobrada se ninguém olhar.
  const contagem = {};
  for (const l of linhas) {
    if (!l.chave) continue;
    const k = l.origem + "|" + l.chave;
    contagem[k] = (contagem[k] || 0) + 1;
  }
  for (const l of linhas) {
    if (l.chave && contagem[l.origem + "|" + l.chave] > 1)
      l.discrepancias.push({ tipo: "duplicidade", ...DISCREPANCIAS.duplicidade });
  }

  return linhas;
}

/**
 * Placar da reconciliação — o que a tela mostra no topo e o que trava a alta.
 *
 * `usoDomiciliarLevantado` responde "alguém entrevistou o paciente?": ou há
 * lista, ou há a declaração de que ele não usa nada. É condição de
 * `completa` porque uma reconciliação sobre uma lista que ninguém levantou
 * não reconcilia coisa alguma — ela só parece feita. Quando não informado,
 * assume-se levantado se existe ao menos um medicamento domiciliar, que é
 * o comportamento anterior.
 */
export function resumoReconciliacao(linhas = [], { usoDomiciliarLevantado = null } = {}) {
  const graves = l => l.discrepancias.some(d => d.gravidade === "alta");
  const comDiscrepancia = linhas.filter(l => l.discrepancias.length);
  return {
    total: linhas.length,
    // Conta só onde a decisão é exigida — senão o placar diria "3 de 3
    // decididos" tendo alguém decidido um.
    decididas: linhas.filter(l => l.exigeDecisao && !l.pendente).length,
    aDecidir: linhas.filter(l => l.exigeDecisao).length,
    pendentes: linhas.filter(l => l.pendente).length,
    discrepancias: comDiscrepancia.length,
    graves: linhas.filter(graves).length,
    // "Completa" é sobre ter decidido tudo o que precisava de decisão — não
    // sobre estar tudo igual: divergência justificada é reconciliação BEM
    // feita.
    completa: (usoDomiciliarLevantado == null
                ? linhas.some(l => l.origem === "domiciliar")
                : !!usoDomiciliarLevantado)
              && linhas.every(l => !l.pendente),
    vazia: linhas.length === 0,
  };
}

/**
 * O que o paciente leva para casa, já ordenado como se lê numa receita.
 * Usa a posologia hospitalar quando a decisão foi manter/alterar o que
 * estava correndo aqui; a de casa quando é retomada do uso prévio.
 */
export function listaDeAlta(linhas = []) {
  return linhas
    .filter(l => l.levaParaCasa)
    .map(l => {
      const base = l.decisao === "reiniciar" ? l.item : (l.hospitalar || l.item);
      return {
        descricao: base.descricao || base.nome || "",
        dose: base.dose ?? null,
        via: base.via ?? null,
        frequencia: base.frequencia ?? null,
        duracao_dias: base.duracao_dias ?? null,
        origem: l.origem,
        decisao: l.decisao,
        observacao: l.justificativa || null,
      };
    })
    .sort((a, b) => (a.descricao || "").localeCompare(b.descricao || ""));
}

/**
 * O que foi suspenso e o paciente PRECISA saber que não deve mais tomar.
 * Vai separado na receita de alta de propósito: a lista do que parar é a
 * que o paciente ignora quando ela vem misturada com a do que continuar.
 */
export function suspensosNaAlta(linhas = []) {
  return linhas
    .filter(l => l.decisao === "suspender")
    .map(l => ({
      descricao: l.item.descricao || l.item.nome || "",
      motivo: l.justificativa || null,
      origem: l.origem,
    }));
}
