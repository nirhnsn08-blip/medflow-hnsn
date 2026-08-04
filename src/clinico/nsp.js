// ═══════════════════════════════════════════════════════════
// NSP — Núcleo de Segurança do Paciente (Fase 2a): catálogo + motor puro
//
// Taxonomias FIXAS (classe do incidente, tipo, grau de dano OMS, status) e as
// funções puras testáveis: matriz de risco, se exige RCA, se é notificação
// compulsória, e as agregações do dashboard. Sem rede, sem React.
//
// Base: RDC 36/2013 (ANVISA), PNSP (Portaria 529/2013) e a taxonomia de
// segurança do paciente da OMS (ICPS) para grau de dano.
// ═══════════════════════════════════════════════════════════

const arr = x => (Array.isArray(x) ? x : []);

// Classe do incidente — do menos ao mais grave (ordem importa no dashboard).
export const CLASSES = [
  { v: "circunstancia_risco", l: "Circunstância de risco", sub: "condição com potencial de dano, sem incidente ainda", nivel: "amarelo" },
  { v: "near_miss",           l: "Near-miss (quase-erro)",  sub: "barrado antes de chegar ao paciente",              nivel: "amarelo" },
  { v: "incidente_sem_dano",  l: "Incidente sem dano",      sub: "chegou ao paciente, sem dano",                     nivel: "laranja" },
  { v: "evento_adverso",      l: "Evento adverso",          sub: "incidente COM dano ao paciente",                   nivel: "vermelho" },
  { v: "never_event",         l: "Never event",             sub: "evento grave que nunca deveria ocorrer",           nivel: "vermelho" },
];

// Grau de dano (taxonomia OMS/ICPS).
export const GRAUS_DANO = [
  { v: "nenhum",   l: "Nenhum",   nivel: "verde" },
  { v: "leve",     l: "Leve",     nivel: "amarelo" },
  { v: "moderado", l: "Moderado", nivel: "laranja" },
  { v: "grave",    l: "Grave",    nivel: "vermelho" },
  { v: "obito",    l: "Óbito",    nivel: "vermelho" },
];

// Tipo de incidente. `origem` liga aos módulos que já temos (Fase 1).
export const TIPOS = [
  { v: "medicacao",     l: "Medicação",                 origem: "prescricao" },
  { v: "queda",         l: "Queda",                     origem: "escala_morse" },
  { v: "lpp",           l: "Lesão por pressão",         origem: "lpp" },
  { v: "identificacao", l: "Identificação do paciente" },
  { v: "cirurgico",     l: "Cirúrgico / procedimento" },
  { v: "dispositivo",   l: "Dispositivo / equipamento" },
  { v: "laboratorio",   l: "Laboratório / amostra" },
  { v: "iras",          l: "Infecção (IRAS)" },
  { v: "flebite",       l: "Flebite / acesso vascular", origem: "flebite" },
  { v: "transfusao",    l: "Transfusão / hemocomponente" },
  { v: "diagnostico",   l: "Diagnóstico / atraso" },
  { v: "comportamento", l: "Comportamento / violência" },
  { v: "infraestrutura",l: "Infraestrutura / predial" },
  { v: "outro",         l: "Outro" },
];

// Fluxo do núcleo.
export const STATUS = [
  { v: "nova",          l: "Nova",           nivel: "amarelo" },
  { v: "em_analise",    l: "Em análise",     nivel: "laranja" },
  { v: "classificada",  l: "Classificada",   nivel: "azul" },
  { v: "em_tratamento", l: "Em tratamento",  nivel: "laranja" },
  { v: "concluida",     l: "Concluída",      nivel: "verde" },
];

// As 6 Metas Internacionais de Segurança do Paciente (OMS/JCI) — usadas nas
// telas de Metas e Protocolos (Fase 2c/2d); ficam aqui como referência fixa.
export const METAS = [
  { v: "identificacao",   l: "Identificar corretamente o paciente" },
  { v: "comunicacao",     l: "Comunicação efetiva" },
  { v: "medicamentos",    l: "Segurança dos medicamentos de alta vigilância" },
  { v: "cirurgia_segura", l: "Cirurgia segura (lado/paciente/procedimento certos)" },
  { v: "higiene_maos",    l: "Higiene das mãos" },
  { v: "quedas_lpp",      l: "Reduzir quedas e lesões por pressão" },
];

const rotuloDe = (lista, v) => lista.find(x => x.v === v)?.l || v || null;
export const rotuloClasse = v => rotuloDe(CLASSES, v);
export const rotuloTipo   = v => rotuloDe(TIPOS, v);
export const rotuloGrau   = v => rotuloDe(GRAUS_DANO, v);
export const rotuloStatus = v => rotuloDe(STATUS, v);

/**
 * Matriz de risco: probabilidade × gravidade (1–5 cada) → score 1–25 e faixa.
 * Padrão NHS/AHRQ: extremo ≥15, alto 8–14, moderado 4–7, baixo 1–3.
 */
export function matrizRisco(probabilidade, gravidade) {
  const p = Number(probabilidade) || 0;
  const g = Number(gravidade) || 0;
  const score = p * g;
  const faixa = score >= 15 ? "extremo" : score >= 8 ? "alto" : score >= 4 ? "moderado" : score >= 1 ? "baixo" : null;
  return { score, faixa };
}

const COM_DANO_GRAU = new Set(["leve", "moderado", "grave", "obito"]);
const DANO_SIGNIFICATIVO = new Set(["moderado", "grave", "obito"]);

/** Evento que exige análise de causa raiz (RCA): evento adverso, never event, ou dano moderado+. */
export function exigeRCA(inc) {
  if (!inc) return false;
  return inc.classe === "never_event" || inc.classe === "evento_adverso" || DANO_SIGNIFICATIVO.has(inc.grau_dano);
}

/** Notificação compulsória à ANVISA/VISA: never events e óbito. */
export function notificacaoCompulsoria(inc) {
  if (!inc) return false;
  return inc.classe === "never_event" || inc.grau_dano === "obito";
}

/** O incidente chegou ao paciente com dano? (para o near-miss ratio) */
export function temDano(inc) {
  return !!inc && (inc.classe === "evento_adverso" || inc.classe === "never_event" || COM_DANO_GRAU.has(inc.grau_dano));
}

const contarPor = (lista, chave) => {
  const m = {};
  lista.forEach(i => { const k = i?.[chave] || "—"; m[k] = (m[k] || 0) + 1; });
  return m;
};

/**
 * Panorama dos incidentes para o dashboard. `pacientesDia` (opcional) permite a
 * densidade por 1000 pacientes-dia. O near-miss ratio (quase-erros ÷ eventos com
 * dano) é indicador de maturidade da cultura: quanto MAIOR, melhor (mais gente
 * notifica antes do dano).
 */
export function resumoIncidentes(incidentes, { pacientesDia } = {}) {
  const lista = arr(incidentes).filter(Boolean);
  const total = lista.length;
  const semDano = lista.filter(i => !temDano(i)).length;
  const comDano = lista.filter(temDano).length;
  const neverEvents = lista.filter(i => i.classe === "never_event").length;
  const compulsorias = lista.filter(notificacaoCompulsoria).length;
  const abertas = lista.filter(i => (i.status || "nova") !== "concluida").length;
  const novas = lista.filter(i => (i.status || "nova") === "nova").length;
  return {
    total, semDano, comDano, neverEvents, compulsorias, abertas, novas,
    porClasse: contarPor(lista, "classe"),
    porTipo: contarPor(lista, "tipo"),
    porGrau: contarPor(lista, "grau_dano"),
    porStatus: contarPor(lista, "status"),
    nearMissRatio: comDano ? +(semDano / comDano).toFixed(2) : null,
    densidade: pacientesDia ? +((total / pacientesDia) * 1000).toFixed(1) : null,
  };
}

/**
 * Indicadores de segurança puxados dos módulos que já existem (diferencial:
 * não dependem de digitação). LPP adquirida vem do marcador POA da Fase 1a;
 * quedas e erro de medicação, dos incidentes. `pacientesDia` (opcional) abre as
 * taxas por 1000 pacientes-dia. Alimenta a tela Indicadores (Fase 2c).
 */
export function indicadoresSeguranca({ lpp, incidentes, pacientesDia } = {}) {
  const incs = arr(incidentes).filter(Boolean);
  const quedasLista = incs.filter(i => i.tipo === "queda");
  const medicacaoLista = incs.filter(i => i.tipo === "medicacao");
  const lppAdquiridas = arr(lpp).filter(l => l && l.presente_admissao === false).length;
  const quedas = quedasLista.length;
  const quedasComDano = quedasLista.filter(temDano).length;
  const errosMedicacao = medicacaoLista.filter(temDano).length;
  const porMil = n => (pacientesDia ? +((n / pacientesDia) * 1000).toFixed(2) : null);
  return {
    lppAdquiridas, quedas, quedasComDano,
    errosMedicacao, medicacaoTotal: medicacaoLista.length,
    densidadeIncidentes: porMil(incs.length),
    quedasPorMil: porMil(quedas),
    lppPorMil: porMil(lppAdquiridas),
  };
}

// ═══════════════════════════════════════════════════════════
// FASE 2b — Análise de causa raiz (RCA) + Plano de ação
// ═══════════════════════════════════════════════════════════

// Ishikawa (espinha de peixe) adaptado à saúde — os 6M.
export const ISHIKAWA_CATEGORIAS = [
  { v: "metodo",   l: "Método / processo",         sub: "protocolo, rotina, fluxo" },
  { v: "mao_obra", l: "Mão de obra / pessoas",     sub: "equipe, competência, dimensionamento" },
  { v: "material", l: "Material / insumo",         sub: "medicamento, dispositivo, rótulo" },
  { v: "maquina",  l: "Máquina / equipamento",     sub: "bomba, monitor, sistema" },
  { v: "medicao",  l: "Medição / monitoramento",   sub: "checagem, alarme, indicador" },
  { v: "meio",     l: "Meio ambiente / estrutura", sub: "iluminação, ruído, layout" },
];

// Fatores contribuintes (Protocolo de Londres) — o "porquê" sistêmico.
export const FATORES_CONTRIBUINTES = [
  { v: "paciente",      l: "Fatores do paciente" },
  { v: "tarefa",        l: "Tarefa e tecnologia" },
  { v: "individuo",     l: "Fatores individuais (profissional)" },
  { v: "equipe",        l: "Fatores de equipe" },
  { v: "ambiente",      l: "Ambiente de trabalho" },
  { v: "organizacao",   l: "Organização e gestão" },
  { v: "institucional", l: "Contexto institucional" },
];

export const METODOS_RCA = [
  { v: "5_porques", l: "5 Porquês" },
  { v: "ishikawa",  l: "Ishikawa (espinha de peixe)" },
  { v: "ambos",     l: "5 Porquês + Ishikawa" },
];

export const STATUS_ACAO = [
  { v: "pendente",     l: "Pendente",     nivel: "amarelo" },
  { v: "em_andamento", l: "Em andamento", nivel: "laranja" },
  { v: "concluida",    l: "Concluída",    nivel: "verde" },
  { v: "cancelada",    l: "Cancelada",    nivel: "cinza" },
];

/** A ação venceu? Prazo passou e não está concluída nem cancelada. */
export function acaoAtrasada(acao, hoje = new Date()) {
  if (!acao || !acao.prazo) return false;
  const st = acao.status || "pendente";
  if (st === "concluida" || st === "cancelada") return false;
  return new Date(acao.prazo + "T23:59:59") < hoje;
}

/** Panorama do plano de ação: abertas, atrasadas, concluídas, taxa de fechamento. */
export function resumoAcoes(acoes, hoje = new Date()) {
  const lista = arr(acoes);
  const abertas = lista.filter(a => !["concluida", "cancelada"].includes(a.status || "pendente"));
  const atrasadas = abertas.filter(a => acaoAtrasada(a, hoje));
  const concluidas = lista.filter(a => a.status === "concluida");
  return {
    total: lista.length,
    abertas: abertas.length,
    atrasadas: atrasadas.length,
    concluidas: concluidas.length,
    taxaFechamento: lista.length ? +((concluidas.length / lista.length) * 100).toFixed(0) : null,
  };
}

/** RCA vigente e concluída de um incidente? (respeita a linhagem corrige_id) */
export function temRcaConcluida(incidenteId, rcas) {
  const superadas = new Set(arr(rcas).map(r => r.corrige_id).filter(Boolean));
  return arr(rcas).some(r => r.incidente_id === incidenteId && !superadas.has(r.id) && (r.status || "em_andamento") === "concluida");
}

/**
 * Fila de análise: incidentes que EXIGEM RCA e ainda não têm análise concluída
 * (nem estão encerrados). É a lista de trabalho da aba Análise de causas.
 */
export function incidentesAguardandoRca(incidentes, rcas) {
  return arr(incidentes).filter(i => exigeRCA(i) && (i.status || "nova") !== "concluida" && !temRcaConcluida(i.id, rcas));
}

// ═══════════════════════════════════════════════════════════
// FASE 2c — Indicadores automáticos + 6 Metas Internacionais
//
// As 6 Metas Internacionais de Segurança do Paciente (OMS/JCI) ganham um FAROL
// (verde/amarelo/vermelho) contra alvos EDITÁVEIS pelo ADM Master
// (nsp_meta_faixas, "em validação"). Metas que saem dos módulos são automáticas
// (identificação, medicamentos, quedas+LPP); as que dependem de observação
// (higiene das mãos, comunicação, cirurgia segura) vêm da auditoria periódica
// (nsp_meta_medicoes: numerador/denominador → %). Tudo puro/testável.
// ═══════════════════════════════════════════════════════════

/**
 * Farol de um indicador contra os cortes configurados.
 *  • sentido 'menor_melhor' (quedas, erros, densidade): verde ≤ corte_verde,
 *    amarelo ≤ corte_amarelo, senão vermelho.
 *  • sentido 'maior_melhor' (adesão de higiene, comunicação): verde ≥ corte_verde,
 *    amarelo ≥ corte_amarelo, senão vermelho.
 * Sem valor ou sem cortes → 'cinza' (sem leitura). Determinístico.
 */
export function farol(valor, { corte_verde, corte_amarelo, sentido = "menor_melhor" } = {}) {
  const v  = valor === null || valor === undefined || valor === "" ? null : Number(valor);
  const cv = corte_verde   === null || corte_verde   === undefined || corte_verde   === "" ? null : Number(corte_verde);
  const ca = corte_amarelo === null || corte_amarelo === undefined || corte_amarelo === "" ? null : Number(corte_amarelo);
  if (v === null || Number.isNaN(v) || cv === null || Number.isNaN(cv) || ca === null || Number.isNaN(ca)) return "cinza";
  if (sentido === "maior_melhor") {
    if (v >= cv) return "verde";
    if (v >= ca) return "amarelo";
    return "vermelho";
  }
  if (v <= cv) return "verde";
  if (v <= ca) return "amarelo";
  return "vermelho";
}

// A medição de auditoria mais recente de uma meta (por competência, depois data).
function ultimaMedicao(medicoes, meta) {
  return arr(medicoes)
    .filter(x => x && x.meta === meta && !arr(medicoes).some(o => o && o.corrige_id === x.id))
    .sort((a, b) =>
      String(b.competencia || "").localeCompare(String(a.competencia || "")) ||
      String(b.criado_em || "").localeCompare(String(a.criado_em || "")))[0] || null;
}
const pctMedicao = med => (med && Number(med.denominador) > 0
  ? +((Number(med.numerador) / Number(med.denominador)) * 100).toFixed(0) : null);

/**
 * As 6 Metas com valor + farol. Combina os indicadores automáticos (dos módulos)
 * com a última medição de auditoria (para higiene/comunicação/cirurgia). `faixas`
 * são os alvos editáveis (nsp_meta_faixas). Retorna uma linha por meta, na ordem
 * de METAS. Puro/testável.
 */
export function metasSeguranca({ incidentes, lpp, lppAdquiridas, medicoes, faixas } = {}) {
  const incs = arr(incidentes).filter(Boolean);
  const faixaDe = m => arr(faixas).find(f => f && f.chave === m) || null;

  const lppAdq  = lppAdquiridas != null
    ? Number(lppAdquiridas) || 0
    : arr(lpp).filter(l => l && l.presente_admissao === false).length;
  const quedas  = incs.filter(i => i.tipo === "queda").length;
  const ident   = incs.filter(i => i.tipo === "identificacao" && temDano(i)).length;
  const medErros = incs.filter(i => i.tipo === "medicacao" && temDano(i)).length;

  // valor automático por meta (as de auditoria ficam null aqui)
  const autoValor = {
    identificacao:   ident,
    medicamentos:    medErros,
    quedas_lpp:      quedas + lppAdq,
  };

  return METAS.map(m => {
    const fx = faixaDe(m.v);
    const auditoria = (fx?.fonte || (m.v in autoValor ? "auto" : "auditoria")) === "auditoria";
    const med = auditoria ? ultimaMedicao(medicoes, m.v) : null;
    const valor = auditoria ? pctMedicao(med) : (autoValor[m.v] ?? null);
    const sentido = fx?.sentido || (auditoria ? "maior_melhor" : "menor_melhor");
    return {
      meta: m.v,
      label: m.l,
      fonte: auditoria ? "auditoria" : "auto",
      valor,
      unidade: auditoria ? "%" : (fx?.unidade || "casos"),
      sentido,
      competencia: med?.competencia || null,
      alvo: fx ? { corte_verde: fx.corte_verde, corte_amarelo: fx.corte_amarelo } : null,
      validado: fx ? !!fx.validado : false,
      farol: farol(valor, { corte_verde: fx?.corte_verde, corte_amarelo: fx?.corte_amarelo, sentido }),
    };
  });
}

// ═══════════════════════════════════════════════════════════
// FASE 2d — Relatórios / NOTIVISA
//
// Fecha a lógica do RDC 36/2013 (notificar → analisar → tratar → monitorar →
// REPORTAR): relatório mensal do NSP a partir do que já existe, e a ficha da
// notificação compulsória no formato do NOTIVISA (ANVISA) — o sistema gera o
// documento; a submissão ao portal é manual. Puro/testável.
// ═══════════════════════════════════════════════════════════

const dataRefInc = inc => (inc && (inc.ocorrido_em || inc.detectado_em || inc.criado_em)) || null;

/** Incidentes cuja data de referência cai no mês/ano (mes 0–11, padrão getMonth). */
export function filtrarPorMes(incidentes, ano, mes) {
  const a = Number(ano), m = Number(mes);
  return arr(incidentes).filter(i => {
    const d = dataRefInc(i);
    if (!d) return false;
    const dt = new Date(d);
    return dt.getFullYear() === a && dt.getMonth() === m;
  });
}

/** Incidentes de notificação compulsória à ANVISA/NOTIVISA (never event ou óbito). */
export function incidentesCompulsorios(incidentes) {
  return arr(incidentes).filter(notificacaoCompulsoria);
}

/**
 * Mapeia um incidente para os campos da ficha de notificação do NOTIVISA
 * (ANVISA). Não integra com o portal — gera o documento para a submissão manual.
 */
export function fichaNotivisa(inc) {
  if (!inc) return null;
  const tipo = inc.grau_dano === "obito" ? "Óbito"
    : inc.classe === "never_event" ? "Never event (evento que nunca deveria ocorrer)"
    : "Evento adverso";
  return {
    tipo_notificacao: tipo,
    data_ocorrencia: inc.ocorrido_em || inc.detectado_em || inc.criado_em || null,
    tipo_incidente: rotuloTipo(inc.tipo),
    classe: rotuloClasse(inc.classe),
    grau_dano: rotuloGrau(inc.grau_dano),
    local: inc.local_setor || null,
    prontuario: inc.prontuario || null,
    descricao: inc.descricao || null,
    providencias: inc.acoes_imediatas || null,
    risco: inc.risco_faixa || null,
  };
}

/**
 * Relatório mensal do NSP: incidentes DO MÊS (resumo, indicadores automáticos e
 * notificações compulsórias) + a situação ATUAL do plano de ação e das 6 metas.
 * `mes` é 0–11. Puro — a tela só apresenta e imprime.
 */
export function relatorioNsp({ incidentes, acoes, lppAdquiridas, medicoes, faixas, ano, mes, pacientesDia } = {}) {
  const doMes = filtrarPorMes(incidentes, ano, mes);
  return {
    incidentesMes: doMes,
    resumo: resumoIncidentes(doMes, { pacientesDia }),
    indicadores: indicadoresSeguranca({ incidentes: doMes, pacientesDia }),
    compulsorios: incidentesCompulsorios(doMes),
    plano: resumoAcoes(acoes),
    metas: metasSeguranca({ incidentes, lppAdquiridas, medicoes, faixas }),
  };
}

// ── Protocolos gerenciados de segurança — os 6 básicos do PNSP ──

export const STATUS_PROTOCOLO = [
  { v: "vigente",    l: "Vigente",    nivel: "verde" },
  { v: "em_revisao", l: "Em revisão", nivel: "amarelo" },
  { v: "suspenso",   l: "Suspenso",   nivel: "cinza" },
];

// Os 6 protocolos básicos de segurança do paciente (PNSP), ligados às 6 Metas.
export const PROTOCOLOS_BASICOS = [
  { chave: "ident",      meta: "identificacao",   titulo: "Identificação do paciente" },
  { chave: "cir_segura", meta: "cirurgia_segura", titulo: "Cirurgia segura" },
  { chave: "higiene",    meta: "higiene_maos",    titulo: "Higiene das mãos" },
  { chave: "quedas",     meta: "quedas_lpp",      titulo: "Prevenção de quedas" },
  { chave: "lpp",        meta: "quedas_lpp",      titulo: "Prevenção de lesão por pressão" },
  { chave: "medicam",    meta: "medicamentos",    titulo: "Segurança medicamentosa" },
];

/** Protocolo com revisão vencida: tem data de revisão no passado e não está suspenso. */
export function protocoloRevisaoVencida(proto, hoje = new Date()) {
  if (!proto || !proto.revisao_em || proto.status === "suspenso") return false;
  return new Date(proto.revisao_em + "T23:59:59") < hoje;
}

/** Panorama dos protocolos: totais, revisões vencidas e cobertura dos 6 básicos. */
export function resumoProtocolos(protocolos, hoje = new Date()) {
  const lista = arr(protocolos).filter(p => p && p.ativo !== false);
  const cobertos = new Set(lista.map(p => p.chave).filter(Boolean));
  return {
    total: lista.length,
    vigentes: lista.filter(p => (p.status || "em_revisao") === "vigente").length,
    emRevisao: lista.filter(p => (p.status || "em_revisao") === "em_revisao").length,
    revisaoVencida: lista.filter(p => protocoloRevisaoVencida(p, hoje)).length,
    basicosFaltando: PROTOCOLOS_BASICOS.filter(b => !cobertos.has(b.chave)).map(b => b.titulo),
  };
}

// ── Capacitações — treinamentos da equipe em segurança do paciente ──

export const STATUS_CAPACITACAO = [
  { v: "planejado", l: "Planejado", nivel: "amarelo" },
  { v: "realizado", l: "Realizado", nivel: "verde" },
  { v: "cancelado", l: "Cancelado", nivel: "cinza" },
];

/** Capacitação com recorrência vencida: próxima prevista no passado e não cancelada. */
export function capacitacaoVencida(cap, hoje = new Date()) {
  if (!cap || !cap.proxima_em || cap.status === "cancelado") return false;
  return new Date(cap.proxima_em + "T23:59:59") < hoje;
}

/** Panorama das capacitações: totais, horas, participantes, vencidas e cobertura por meta. */
export function resumoCapacitacoes(capacitacoes, hoje = new Date()) {
  const lista = arr(capacitacoes).filter(c => c && c.ativo !== false);
  const realizadas = lista.filter(c => (c.status || "planejado") === "realizado");
  const cobertas = new Set(realizadas.map(c => c.meta).filter(Boolean));
  return {
    total: lista.length,
    realizadas: realizadas.length,
    planejadas: lista.filter(c => (c.status || "planejado") === "planejado").length,
    horas: +realizadas.reduce((s, c) => s + (Number(c.carga_horaria) || 0), 0).toFixed(1),
    participantes: realizadas.reduce((s, c) => s + (Number(c.participantes) || 0), 0),
    vencidas: lista.filter(c => capacitacaoVencida(c, hoje)).length,
    metasSemCapacitacao: METAS.filter(m => !cobertas.has(m.v)).map(m => m.l),
  };
}

// ── Comunicação — mural de comunicados de segurança do NSP ──

export const TIPO_COMUNICADO = [
  { v: "alerta",          l: "Alerta de segurança", nivel: "vermelho" },
  { v: "licao_aprendida", l: "Lição aprendida",     nivel: "azul" },
  { v: "informativo",     l: "Informativo",         nivel: "amarelo" },
];

export const PRIORIDADE_COMUNICADO = [
  { v: "alta",  l: "Alta",  nivel: "vermelho" },
  { v: "media", l: "Média", nivel: "amarelo" },
  { v: "baixa", l: "Baixa", nivel: "azul" },
];

/** Panorama do mural: ativos, alertas ativos e lições aprendidas. */
export function resumoComunicados(comunicados) {
  const lista = arr(comunicados).filter(c => c && c.ativo !== false);
  const ativos = lista.filter(c => (c.status || "ativo") === "ativo");
  return {
    total: lista.length,
    ativos: ativos.length,
    alertasAtivos: ativos.filter(c => c.tipo === "alerta").length,
    licoes: lista.filter(c => c.tipo === "licao_aprendida").length,
  };
}

// ── Assistente local do NSP — roteador de intenções por palavra-chave ──

export const NSP_ASSIST_AJUDA = "Posso responder sobre: panorama do núcleo, ações atrasadas do plano, análises de causa (RCA) pendentes, metas fora do alvo, protocolos com revisão vencida, capacitações, comunicados e notificações compulsórias (NOTIVISA). Pergunte à vontade.";

const normNsp = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/**
 * Assistente local e gratuito do NSP: responde por palavra-chave a partir dos
 * dados que já existem (nada sai do navegador). Puro/testável — a tela só faz
 * o chat. Retorna a resposta em texto.
 */
export function responderAssistenteNsp(pergunta, { incidentes, acoes, rcas, faixas, medicoes, lppAdquiridas, protocolos, capacitacoes, comunicados } = {}) {
  const s = normNsp(pergunta);
  const has = (...ks) => ks.some(k => s.includes(k));
  if (!s || s === "?" || has("ajuda", "o que voce", "o que posso", "comando", "pode responder")) return NSP_ASSIST_AJUDA;
  if (s === "oi" || s === "ola" || has("bom dia", "boa tarde", "boa noite", "obrigad", "valeu", "tudo bem")) return "Olá! " + NSP_ASSIST_AJUDA;

  const resumo = resumoIncidentes(incidentes);
  const plano = resumoAcoes(acoes);
  const fila = incidentesAguardandoRca(incidentes, rcas);
  const metas = metasSeguranca({ incidentes, lppAdquiridas, medicoes, faixas });
  const proto = resumoProtocolos(protocolos);
  const cap = resumoCapacitacoes(capacitacoes);
  const com = resumoComunicados(comunicados);
  const compuls = incidentesCompulsorios(incidentes);

  if (has("atrasad", "cobrar", "plano", "acao", "5w2h")) {
    return `Plano de ação: ${plano.abertas} aberta(s), ${plano.atrasadas} atrasada(s), taxa de fechamento ${plano.taxaFechamento ?? "—"}%.`;
  }
  if (has("rca", "causa raiz", "analise", "investig", "5 porque", "ishikawa")) {
    return fila.length ? `${fila.length} incidente(s) aguardando análise de causa raiz (evento adverso / never event / dano moderado+).` : "Nenhuma análise de causa raiz pendente. 👍";
  }
  if (has("meta", "farol", "alvo")) {
    const fora = metas.filter(m => m.farol === "vermelho");
    const alerta = metas.filter(m => m.farol === "amarelo");
    return `Metas de segurança: ${fora.length} fora do alvo${fora.length ? " (" + fora.map(m => m.label).join(", ") + ")" : ""}, ${alerta.length} em alerta.`;
  }
  if (has("protocolo", "revis", "pop")) {
    return `Protocolos: ${proto.total} cadastrado(s), ${proto.revisaoVencida} com revisão vencida.${proto.basicosFaltando.length ? " Faltam cadastrar: " + proto.basicosFaltando.join(", ") + "." : " Os 6 básicos estão cadastrados."}`;
  }
  if (has("capacita", "treinamento", "educa")) {
    return `Capacitações: ${cap.realizadas} realizada(s), ${cap.horas}h, ${cap.participantes} participante(s).${cap.metasSemCapacitacao.length ? " Metas sem treino: " + cap.metasSemCapacitacao.join(", ") + "." : ""}`;
  }
  if (has("comunica", "aviso", "licao", "mural", "informativo")) {
    return `Comunicados: ${com.ativos} ativo(s), ${com.alertasAtivos} alerta(s) de segurança, ${com.licoes} lição(ões) aprendida(s).`;
  }
  if (has("notivisa", "compuls", "anvisa", "never", "obito")) {
    return compuls.length ? `${compuls.length} notificação(ões) compulsória(s) (never event / óbito). Gere a ficha do NOTIVISA na aba Relatórios.` : "Nenhuma notificação compulsória no momento.";
  }
  if (has("lpp", "pressao", "queda")) {
    return `LPP adquirida (POA): ${lppAdquiridas || 0}. Quedas notificadas: ${resumo.porTipo?.queda || 0}.`;
  }
  if (has("dano", "adverso", "near", "grave")) {
    return `Com dano: ${resumo.comDano} · never events: ${resumo.neverEvents} · near-miss ratio: ${resumo.nearMissRatio ?? "—"}.`;
  }
  if (has("panorama", "resumo", "geral", "situacao", "como esta", "como anda", "visao")) {
    return `Panorama do NSP:\n• Incidentes: ${resumo.total} (${resumo.comDano} com dano, ${resumo.neverEvents} never event, ${resumo.abertas} aberto(s))\n• Plano de ação: ${plano.atrasadas} atrasada(s) de ${plano.total}\n• Análises pendentes (RCA): ${fila.length}\n• Notificações compulsórias (NOTIVISA): ${compuls.length}`;
  }
  return "Não entendi bem. " + NSP_ASSIST_AJUDA;
}
