// ═══════════════════════════════════════════════════════════
// Protocolos clínicos gerenciados — catálogo canônico (estrutura fixa)
//
// Espelha o seed de `prot_catalogo` (migracao-protocolos.sql). É a fonte de
// verdade da ESTRUTURA (passos do bundle, gatilho, janela) e serve de fallback
// quando o banco ainda não tem o template — o mesmo papel de escalas-catalogo.js.
// Os ALVOS e o STATUS ("em validação") são editáveis no banco pelo ADM Master;
// aqui ficam os valores canônicos de partida.
//
// Fase 3a entrega a Sepse ligada de ponta a ponta; IAM/AVC/TEV entram como
// esboço de catálogo (3b–3d) para a tela já mostrar o que vem.
// ═══════════════════════════════════════════════════════════

// Pacote de 1 hora da Sepse (ILAS / Surviving Sepsis Campaign).
export const SEPSE = {
  chave: "sepse",
  titulo: "Sepse e choque séptico — pacote de 1 hora",
  categoria: "sepse",
  referencia: "ILAS (Instituto Latino-Americano de Sepse) / Surviving Sepsis Campaign",
  janela_min: 60,
  gatilho: { tipo: "news", min: 5, obs: "NEWS ≥ 5 com suspeita de foco infeccioso" },
  kpi_passo: "atb",
  passos: [
    { chave: "lactato",     rotulo: "Coletar lactato sérico",                             alvo_min: 30,  ordem: 1, critico: true },
    { chave: "hemocultura", rotulo: "Coletar 2 hemoculturas ANTES do antibiótico",        alvo_min: 45,  ordem: 2, critico: true },
    { chave: "atb",         rotulo: "Antibiótico de amplo espectro EV",                    alvo_min: 60,  ordem: 3, critico: true },
    { chave: "cristaloide", rotulo: "Cristaloide 30 mL/kg se hipotensão ou lactato ≥ 4",   alvo_min: 60,  ordem: 4, critico: true },
    { chave: "vasopressor", rotulo: "Vasopressor se PAM < 65 após volume",                 alvo_min: 60,  ordem: 5, critico: false },
    { chave: "reavaliar",   rotulo: "Reavaliar lactato e perfusão",                        alvo_min: 120, ordem: 6, critico: false },
  ],
};

// Dor torácica / IAM (Fase 3b) — pacote porta→ECG.
export const IAM = {
  chave: "iam",
  titulo: "Dor torácica / IAM — porta→ECG",
  categoria: "cardiologico",
  referencia: "AHA/ACC; Diretriz SBC de Síndromes Coronarianas Agudas",
  janela_min: 10,
  gatilho: { tipo: "queixa", termos: ["dor torácica", "precordial", "dor no peito"], obs: "ECG em ≤ 10 min da chegada; acionamento manual com sugestão pela queixa da triagem" },
  kpi_passo: "ecg",
  passos: [
    { chave: "ecg",        rotulo: "ECG de 12 derivações",                                                alvo_min: 10, ordem: 1, critico: true },
    { chave: "aas",        rotulo: "AAS 150–300 mg VO (mastigar), se sem contraindicação",                alvo_min: 10, ordem: 2, critico: true },
    { chave: "troponina",  rotulo: "Coletar troponina",                                                   alvo_min: 20, ordem: 3, critico: true },
    { chave: "monitor",    rotulo: "Monitorização + acesso venoso + O₂ se SpO₂ < 90",                     alvo_min: 10, ordem: 4, critico: false },
    { chave: "reperfusao", rotulo: "Avaliar SCA: com supra de ST → reperfusão; sem supra → estratificar", alvo_min: 60, ordem: 5, critico: true },
    { chave: "analgesia",  rotulo: "Analgesia / nitrato conforme protocolo",                              alvo_min: 30, ordem: 6, critico: false },
  ],
};

// AVC (Fase 3c) — pacote porta→TC + janela terapêutica.
export const AVC = {
  chave: "avc",
  titulo: "AVC — porta→TC/trombólise",
  categoria: "neurologico",
  referencia: "AHA/ASA; Linha de Cuidado do AVC (Ministério da Saúde)",
  janela_min: 25,
  kpi_passo: "tc",
  gatilho: { tipo: "queixa", termos: ["déficit neurológico", "fraqueza", "boca torta", "fala alterada"], obs: "Sugestão pela queixa; acionamento manual. Checar SEMPRE o início dos sintomas (janela)." },
  janela_terapeutica: { trombolise_min: 270 }, // trombólise IV ≤ 4,5h
  passos: [
    { chave: "codigo_avc", rotulo: "Acionar código AVC + glicemia capilar",          alvo_min: 5,  ordem: 1, critico: false },
    { chave: "tc",         rotulo: "TC de crânio sem contraste",                      alvo_min: 25, ordem: 2, critico: true },
    { chave: "laudo",      rotulo: "Laudo da TC",                                     alvo_min: 45, ordem: 3, critico: true },
    { chave: "nihss",      rotulo: "NIHSS (gravidade do déficit)",                    alvo_min: 20, ordem: 4, critico: false },
    { chave: "reperfusao", rotulo: "Avaliar trombólise/trombectomia (porta→agulha)", alvo_min: 60, ordem: 5, critico: true },
  ],
};

// Esboços para o catálogo (3d) — só rótulo/gatilho; sem passos ainda.
export const ESBOCOS = [
  { chave: "tev", titulo: "Profilaxia de TEV no internado", categoria: "tromboembolismo",
    referencia: "Padua / Caprini; ACCP", janela_min: null, kpi_passo: null,
    gatilho: { tipo: "internacao", obs: "Avaliar todo internado × risco de sangramento" }, passos: [] },
];

// Catálogo canônico completo (Sepse + IAM + AVC prontos + esboço TEV).
export const PROTOCOLOS_CATALOGO = [SEPSE, IAM, AVC, ...ESBOCOS];

export const PROT_STATUS = [
  { v: "ativa",     label: "Ativa",      nivel: "andamento" },
  { v: "concluida", label: "Concluída",  nivel: "ok" },
  { v: "cancelada", label: "Cancelada",  nivel: "neutro" },
  { v: "expirada",  label: "Expirada",   nivel: "alerta" },
];

export const PROT_DESFECHO = [
  { v: "confirmado",  label: "Confirmado" },
  { v: "descartado",  label: "Descartado" },
  { v: "transferido", label: "Transferido" },
  { v: "obito",       label: "Óbito" },
];
