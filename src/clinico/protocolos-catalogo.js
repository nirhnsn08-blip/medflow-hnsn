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
  passos: [
    { chave: "lactato",     rotulo: "Coletar lactato sérico",                             alvo_min: 30,  ordem: 1, critico: true },
    { chave: "hemocultura", rotulo: "Coletar 2 hemoculturas ANTES do antibiótico",        alvo_min: 45,  ordem: 2, critico: true },
    { chave: "atb",         rotulo: "Antibiótico de amplo espectro EV",                    alvo_min: 60,  ordem: 3, critico: true },
    { chave: "cristaloide", rotulo: "Cristaloide 30 mL/kg se hipotensão ou lactato ≥ 4",   alvo_min: 60,  ordem: 4, critico: true },
    { chave: "vasopressor", rotulo: "Vasopressor se PAM < 65 após volume",                 alvo_min: 60,  ordem: 5, critico: false },
    { chave: "reavaliar",   rotulo: "Reavaliar lactato e perfusão",                        alvo_min: 120, ordem: 6, critico: false },
  ],
};

// Esboços para o catálogo (3b–3d) — só rótulo/gatilho; sem passos ainda.
export const ESBOCOS = [
  { chave: "iam", titulo: "Dor torácica / IAM — porta→ECG", categoria: "cardiologico",
    referencia: "AHA/ACC; Diretriz SBC de SCA", janela_min: 10,
    gatilho: { tipo: "discriminador", chave: "dor_toracica", obs: "ECG em ≤ 10 min" }, passos: [] },
  { chave: "avc", titulo: "AVC — porta→TC/trombólise", categoria: "neurologico",
    referencia: "AHA/ASA; Linha de Cuidado AVC (MS)", janela_min: 25,
    gatilho: { tipo: "discriminador", chave: "deficit_neurologico", obs: "Cincinnati + janela terapêutica" }, passos: [] },
  { chave: "tev", titulo: "Profilaxia de TEV no internado", categoria: "tromboembolismo",
    referencia: "Padua / Caprini; ACCP", janela_min: null,
    gatilho: { tipo: "internacao", obs: "Avaliar todo internado × risco de sangramento" }, passos: [] },
];

// Catálogo canônico completo (Sepse pronta + esboços).
export const PROTOCOLOS_CATALOGO = [SEPSE, ...ESBOCOS];

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
