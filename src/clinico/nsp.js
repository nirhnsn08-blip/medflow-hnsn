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
 * quedas, dos incidentes tipo=queda. Cresce na Fase 2c.
 */
export function indicadoresSeguranca({ lpp, incidentes } = {}) {
  const lppAdquiridas = arr(lpp).filter(l => l && l.presente_admissao === false).length;
  const quedas = arr(incidentes).filter(i => i && i.tipo === "queda").length;
  const errosMedicacao = arr(incidentes).filter(i => i && i.tipo === "medicacao" && temDano(i)).length;
  return { lppAdquiridas, quedas, errosMedicacao };
}
