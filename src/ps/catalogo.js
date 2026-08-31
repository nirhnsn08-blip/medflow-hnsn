// ═══════════════════════════════════════════════════════════
// PRONTO-SOCORRO — CATÁLOGO
//
// As tabelas do domínio: classificação de risco (Manchester), desfechos,
// vias, frequências, unidades de dose, áreas, status de sala, categorias
// de evolução, exame e administração.
//
// Saiu do App.jsx porque não é só do PS: `MANCHESTER` é lido por 11
// declarações — a Farmácia prioriza a fila de dispensação por gravidade, o
// Giro de Leitos mostra a cor de quem espera leito, o Faturamento separa
// urgência de eletiva.
//
// ⚠️ NADA AQUI FAZ CONTA. São listas e mapas; a regra que os lê mora em
// ../clinico/. `fmtSinaisVitais` é a exceção justificada: formata o que já
// foi medido, não decide nada.
//
// 🔴 As CHAVES são contrato com o banco (`ps_atendimentos.classificacao`,
// `.desfecho`, `ps_prescricao_itens.via`). Trocar uma chave aqui não
// quebra nada visível: o valor gravado deixa de casar e a tela mostra
// vazio no lugar do rótulo.
// ═══════════════════════════════════════════════════════════

export const PS_FREQUENCIAS = [
  { label: "1x/dia", dia: 1 }, { label: "12/12h (2x)", dia: 2 }, { label: "8/8h (3x)", dia: 3 },
  { label: "6/6h (4x)", dia: 4 }, { label: "4/4h (6x)", dia: 6 }, { label: "Dose única", dia: 0 },
  { label: "Se necessário (SN)", dia: null },
];

export const PS_DOSE_UNID = ["mg", "mL", "g", "mcg", "UI", "comprimido", "cápsula", "ampola", "gota"];

export const MANCHESTER = {
  vermelho: { label: "Emergência",     atend: "Imediato",        cor: "#ef4444", bg: "#3d0f18", alvoMin: 0,   desc: "Risco de vida. Atendimento IMEDIATO (0 min) — sala de emergência." },
  laranja:  { label: "Muito urgente",  atend: "Rápido",          cor: "#f97316", bg: "#3d2206", alvoMin: 10,  desc: "Risco significativo. Atendimento urgente RÁPIDO — em até 10 minutos." },
  amarelo:  { label: "Urgente",        atend: "Breve",           cor: "#eab308", bg: "#3d2e06", alvoMin: 60,  desc: "Condição aguda sem risco imediato. Atendimento BREVE — em até 60 minutos." },
  verde:    { label: "Pouco urgente",  atend: "Moderado",        cor: "#22c55e", bg: "#0a3d2a", alvoMin: 120, desc: "Condição de menor gravidade. Atendimento MODERADO — em até 120 minutos." },
  azul:     { label: "Não urgente",    atend: "Não prioritário", cor: "#3b82f6", bg: "#132c47", alvoMin: 240, desc: "Queixa simples/crônica. Atendimento NÃO PRIORITÁRIO — em até 240 minutos ou encaminhamento." },
};

export const PS_PROTOCOLO = {
  vermelho: {
    sinais: ["Parada cardiorrespiratória", "Via aérea comprometida / obstrução", "Inconsciente (AVPU = U)", "Choque: PA sistólica < 80 mmHg", "SpO2 < 85%", "FR < 8 ou > 35 irpm", "FC < 40 ou > 150 bpm", "Convulsão em curso", "Hemorragia exsanguinante"],
    conduta: "Encaminhar IMEDIATAMENTE à sala de emergência. Não deixar em sala de espera. Comunicar a equipe médica na hora.",
  },
  laranja: {
    sinais: ["Responde só à voz ou à dor (AVPU = V ou D)", "SpO2 86–91%", "FR 8–9 ou 25–35 irpm", "FC 40–49 ou 121–150 bpm", "PA sistólica 80–89 mmHg", "PA sistólica ≥ 220 mmHg (crise hipertensiva)", "Dor intensa (8–10)", "Hemorragia não controlada", "Dor torácica de suspeita cardíaca"],
    conduta: "Atendimento em até 10 minutos. Manter sob vigilância contínua — pode deteriorar rápido. Reavaliar se houver espera.",
  },
  amarelo: {
    sinais: ["SpO2 92–94%", "FR 21–24 irpm", "FC 50–59 ou 100–120 bpm", "PA sistólica 90–99 mmHg ou ≥ 180 mmHg", "Dor moderada (4–7)", "Temperatura ≥ 39 °C", "Vômitos persistentes", "História de trauma sem sinais de gravidade"],
    conduta: "Atendimento em até 60 minutos. Reavaliar periodicamente enquanto aguarda — o quadro pode mudar.",
  },
  verde: {
    sinais: ["Sinais vitais dentro da normalidade", "Dor leve (1–3)", "Queixa aguda sem sinais de gravidade", "Ferimentos superficiais", "Sintomas gripais sem desconforto respiratório"],
    conduta: "Atendimento em até 120 minutos. Orientar sobre o tempo de espera e reavaliar se houver piora relatada.",
  },
  azul: {
    sinais: ["Queixa crônica sem agudização", "Sem dor ou dor mínima", "Procura por receita, atestado ou resultado de exame", "Condição que poderia ser resolvida na atenção básica"],
    conduta: "Atendimento em até 240 minutos ou encaminhamento à atenção básica/ambulatório, conforme o fluxo da unidade.",
  },
};

export const PS_DISCRIMINADORES = [
  { nome: "Risco de vida", desc: "Via aérea, respiração ou circulação comprometidas. Define vermelho independentemente da queixa.", cor: "#ef4444" },
  { nome: "Dor", desc: "Avaliada de 0 a 10. Dor intensa (8–10) puxa para laranja; moderada (4–7) para amarelo; leve (1–3) para verde.", cor: "#f97316" },
  { nome: "Hemorragia", desc: "Exsanguinante = vermelho. Não controlada = laranja. Controlada = amarelo/verde conforme volume.", cor: "#e11d48" },
  { nome: "Nível de consciência", desc: "Escala AVPU. U (inconsciente) = vermelho. V ou D = laranja. A (alerta) segue os demais discriminadores.", cor: "#6366f1" },
  { nome: "Temperatura", desc: "Febre alta (≥ 39 °C) ou hipotermia elevam a prioridade, sobretudo em extremos de idade.", cor: "#d97706" },
  { nome: "Agudeza / tempo de evolução", desc: "Início súbito e progressão rápida aumentam a prioridade frente ao mesmo sintoma de curso arrastado.", cor: "#0d9488" },
];

export const PS_AREAS = ["Sala Vermelha", "Sala Laranja", "Sala AVC", "Isolamento", "Pediatria", "Observação", "Procedimento", "PCR", "Outros"];

export const PS_SALA_STATUS = {
  disponivel:  { label: "Disponível",  cor: "#34d399" },
  ocupado:     { label: "Ocupado",     cor: "#f43f5e" },
  limpeza:     { label: "Limpeza",     cor: "#d97706" },
  manutencao:  { label: "Manutenção",  cor: "#8d99ab" },
};

export const PS_DESFECHOS = {
  alta:          { label: "Alta",          cor: "#34d399" },
  internacao:    { label: "Internação",    cor: "#22d3ee" },
  transferencia: { label: "Transferência", cor: "#3b82f6" },
  evasao:        { label: "Evasão",        cor: "#8d99ab" },
  obito:         { label: "Óbito",         cor: "#f43f5e" },
};

export const PS_EXAME_CATEGORIAS = { laboratorial: "Laboratorial", imagem: "Imagem", outro: "Outro" };

export const PS_EVOL_CATEGORIAS = {
  medica:       { label: "Evolução médica",        curto: "Médica",     cor: "#3b82f6" },
  enfermagem:   { label: "Evolução de enfermagem", curto: "Enfermagem", cor: "#0d9488" },
  tecnico:      { label: "Anotação do técnico",    curto: "Técnico",    cor: "#6366f1" },
  fisioterapia: { label: "Fisioterapia",           curto: "Fisio",      cor: "#d97706" },
  outro:        { label: "Outro profissional",     curto: "Outro",      cor: "#8d99ab" },
};

export const PS_VIAS = ["VO", "IV", "IM", "SC", "SL", "Inalatória", "Tópica", "Retal", "Ocular", "Nasal", "Sonda"];

export const PS_ADM_STATUS = {
  administrado:     { label: "Administrado",     cor: "#34d399" },
  nao_administrado: { label: "Não administrado", cor: "#f43f5e" },
};

export const PS_ADM_MOTIVOS = ["Recusa do paciente", "Paciente em jejum", "Acesso venoso perdido", "Paciente ausente (exame/procedimento)", "Suspenso pelo médico", "Sem estoque na unidade", "Intercorrência clínica", "Outro"];

export const PS_ADM_CATEGORIAS = {
  enfermagem: { label: "Enfermeiro(a)",              curto: "Enfermagem", cor: "#0d9488" },
  tecnico:    { label: "Técnico(a) de enfermagem",   curto: "Técnico",    cor: "#6366f1" },
  medica:     { label: "Médico(a)",                  curto: "Médica",     cor: "#3b82f6" },
  outro:      { label: "Outro profissional",         curto: "Outro",      cor: "#8d99ab" },
};

export const PS_PRIORIDADE = { vermelho: 0, laranja: 1, amarelo: 2, verde: 3, azul: 4 };

export const PS_CONSCIENCIA = {
  A: "Alerta", V: "Responde à voz", D: "Responde à dor", U: "Inconsciente",
};

/**
 * Os sinais vitais medidos, em uma linha. Omite o que não foi aferido.
 *
 * ⚠️ `p = {}` é defensivo, não correção de bug: hoje todo chamador passa um
 * registro vindo de lista. Mas o módulo saiu do App.jsx e agora qualquer um
 * pode importar — utilitário compartilhado que estoura com `null` é
 * armadilha para o próximo.
 */
export function fmtSinaisVitais(p = {}) {
  if (!p) return "";
  const parts = [];
  if (p.pa_sist && p.pa_diast) parts.push(`PA ${p.pa_sist}x${p.pa_diast}`);
  else if (p.pa_sist) parts.push(`PAS ${p.pa_sist}`);
  if (p.fc) parts.push(`FC ${p.fc}`);
  if (p.fr) parts.push(`FR ${p.fr}`);
  if (p.spo2) parts.push(`SpO2 ${p.spo2}%`);
  if (p.temp) parts.push(`T ${p.temp}°C`);
  if (p.dor) parts.push(`Dor ${p.dor}/10`);
  if (p.glicemia) parts.push(`HGT ${p.glicemia}`);
  if (p.consciencia && p.consciencia !== "A") parts.push(PS_CONSCIENCIA[p.consciencia] || p.consciencia);
  return parts.join(" · ");
}
