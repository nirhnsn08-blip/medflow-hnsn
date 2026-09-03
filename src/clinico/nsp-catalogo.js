// ═══════════════════════════════════════════════════════════
// NSP — AS TAXONOMIAS FIXAS
//
// Classe do incidente, tipo, grau de dano (OMS/ICPS) e status. Base: RDC
// 36/2013 (ANVISA), PNSP (Portaria 529/2013).
//
// 🔴 MORADIA PRÓPRIA POR CAUSA DO EMPACOTAMENTO, não por gosto. O botão de
// notificar em 30s vive no casco e precisa destas listas; a página do NSP
// precisa delas e de muito mais. Enquanto tudo morava em `nsp.js`, o Rollup
// içava o arquivo inteiro para o chunk comum — com o assistente, as metas e
// o Ishikawa junto, que só a página usa. Ver `nsp-incidente.js`.
// ═══════════════════════════════════════════════════════════

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

const rotuloDe = (lista, v) => lista.find(x => x.v === v)?.l || v || null;
export const rotuloClasse = v => rotuloDe(CLASSES, v);
export const rotuloTipo   = v => rotuloDe(TIPOS, v);
export const rotuloGrau   = v => rotuloDe(GRAUS_DANO, v);
export const rotuloStatus = v => rotuloDe(STATUS, v);
