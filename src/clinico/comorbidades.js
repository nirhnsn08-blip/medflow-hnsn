// ═══════════════════════════════════════════════════════════
// COMORBIDADES — catálogo para a triagem do PS
//
// A triagem marca as comorbidades do paciente (em vez de alguém digitar valores
// de função renal/hepática). Lista CURADA, não texto livre: comparar e relatar
// depende de as chaves serem estáveis. As clinicamente ativas alimentam os
// alertas de dose da farmácia (ver src/clinico/alertas.js):
//   drc / drc_dialise → função renal reduzida;
//   hepatopatia       → função hepática comprometida.
// O resto é contexto para a equipe (não muda alerta hoje). Ajuste a lista com a
// enfermagem conforme o perfil dos pacientes do HNSN.
// ═══════════════════════════════════════════════════════════

export const COMORBIDADES = [
  { chave: "has",             label: "HAS (hipertensão)" },
  { chave: "dm",              label: "Diabetes (DM)" },
  { chave: "drc",             label: "Doença renal crônica" },
  { chave: "drc_dialise",     label: "DRC em diálise" },
  { chave: "cardiopatia",     label: "Cardiopatia / ICC" },
  { chave: "dpoc_asma",       label: "DPOC / asma" },
  { chave: "hepatopatia",     label: "Hepatopatia / cirrose" },
  { chave: "avc_previo",      label: "AVC prévio" },
  { chave: "cancer",          label: "Câncer / neoplasia" },
  { chave: "imunossupressao", label: "Imunossupressão" },
  { chave: "obesidade",       label: "Obesidade" },
  { chave: "anticoagulacao",  label: "Anticoagulação" },
  { chave: "tabagismo",       label: "Tabagismo" },
];

export const COMORBIDADE_LABEL = Object.fromEntries(COMORBIDADES.map(c => [c.chave, c.label]));

// Rótulos de uma lista de chaves, na ordem do catálogo. Chave desconhecida
// some (não quebra). Usado nos selos/resumos do paciente.
export function rotulosComorbidades(chaves) {
  const set = new Set(Array.isArray(chaves) ? chaves : []);
  return COMORBIDADES.filter(c => set.has(c.chave)).map(c => c.label);
}
