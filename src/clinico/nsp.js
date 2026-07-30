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
