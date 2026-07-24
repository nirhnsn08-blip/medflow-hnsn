// ═══════════════════════════════════════════════════════════
// QUEM PODE FAZER O QUÊ — permissão por CATEGORIA PROFISSIONAL
//
// O sistema tem dois eixos de permissão, e confundi-los é um erro caro:
//
//   role      → quanto a pessoa pode mexer no SISTEMA
//               (adm_master, adm_silver, analista, visualizador)
//   categoria → o que a pessoa pode fazer CLINICAMENTE
//               (medico, enfermeiro, tecnico_enfermagem, …)
//
// Um administrativo pode precisar de adm_master para configurar o sistema
// e continua não podendo assinar evolução médica. Um enfermeiro pode ter
// perfil restrito de sistema e ainda assim é o único que pode registrar
// diagnóstico e prescrição de enfermagem.
//
// BASE NORMATIVA (não é convenção interna)
//   COFEN 736/2024, arts. 6º e 7º — Diagnóstico e Prescrição de Enfermagem
//     são PRIVATIVOS do enfermeiro. Técnico e auxiliar fazem Anotação de
//     Enfermagem e checagem de cuidados prescritos, sob supervisão.
//   COFEN 754/2024, art. 1º — registro no prontuário com identificação
//     própria do profissional, não "por baixo" do login de outro.
//   CFM 2.299/2021, art. 2º — documentos médicos exigem nome e registro
//     do conselho de quem emite.
//
// As funções são puras: recebem o perfil, devolvem se pode. Testadas em
// papeis.test.js — é regra que, se afrouxar por descuido, ninguém percebe
// até virar problema com o conselho.
// ═══════════════════════════════════════════════════════════

export const CATEGORIAS = {
  medico:             { label: "Médico(a)",            conselho: "CRM" },
  enfermeiro:         { label: "Enfermeiro(a)",        conselho: "COREN" },
  tecnico_enfermagem: { label: "Técnico(a) de Enfermagem", conselho: "COREN" },
  fisioterapeuta:     { label: "Fisioterapeuta",       conselho: "CREFITO" },
  nutricionista:      { label: "Nutricionista",        conselho: "CRN" },
  farmaceutico:       { label: "Farmacêutico(a)",      conselho: "CRF" },
  assistente_social:  { label: "Assistente Social",    conselho: "CRESS" },
  administrativo:     { label: "Administrativo",       conselho: null },
};

/**
 * Atos clínicos e quem pode praticá-los.
 *
 * `null` = qualquer categoria assistencial (exclui administrativo).
 * A lista é deliberadamente explícita: quem lê o código consegue conferir
 * contra a norma sem precisar reconstruir a regra de cabeça.
 */
const QUEM_PODE = {
  // ── Médico ────────────────────────────────────────────────
  evolucao_medica:        ["medico"],
  prescricao_medica:      ["medico"],
  alta_hospitalar:        ["medico"],
  solicitar_exame:        ["medico"],

  // ── Enfermeiro (privativo — COFEN 736/2024 arts. 6º e 7º) ──
  diagnostico_enfermagem: ["enfermeiro"],
  prescricao_enfermagem:  ["enfermeiro"],
  evolucao_enfermagem:    ["enfermeiro"],

  // ── Enfermagem em geral ───────────────────────────────────
  // Técnico e auxiliar PODEM: anotar e checar cuidado prescrito.
  anotacao_enfermagem:    ["enfermeiro", "tecnico_enfermagem"],
  checar_medicacao:       ["enfermeiro", "tecnico_enfermagem"],
  sinais_vitais:          ["enfermeiro", "tecnico_enfermagem"],

  // ── Multiprofissional ─────────────────────────────────────
  evolucao_multi:         ["fisioterapeuta", "nutricionista", "farmaceutico", "assistente_social"],
  intervencao_farmaceutica: ["farmaceutico"],
  // Reconciliação medicamentosa: na literatura de segurança do paciente é
  // conduzida tipicamente pelo farmacêutico clínico, com validação médica.
  // Enfermeiro entra porque é quem levanta a lista de uso domiciliar na
  // admissão. Quem NÃO entra é o técnico: aqui se decide suspender e
  // manter medicamento, e isso não é anotação.
  reconciliacao_medicamentosa: ["medico", "enfermeiro", "farmaceutico"],
  registrar_alergia:      ["medico", "enfermeiro", "farmaceutico"],
  admissao_anamnese:      ["medico", "enfermeiro"],
};

const ASSISTENCIAIS = Object.keys(CATEGORIAS).filter(c => c !== "administrativo");

/** A categoria do perfil, com queda segura para administrativo. */
export function categoriaDe(perfil) {
  const c = perfil?.categoria;
  return c && CATEGORIAS[c] ? c : "administrativo";
}

/**
 * Pode praticar este ato clínico?
 *
 * Administrativo NUNCA pratica ato clínico — nem com perfil adm_master.
 * Essa é a inversão que o sistema não fazia: o poder administrativo não
 * concede competência assistencial.
 */
export function podeClinico(perfil, ato) {
  const cat = categoriaDe(perfil);
  if (cat === "administrativo") return false;
  const permitidos = QUEM_PODE[ato];
  if (!permitidos) return ASSISTENCIAIS.includes(cat);  // ato não catalogado: qualquer assistencial
  return permitidos.includes(cat);
}

/** Explica a recusa em linguagem que o profissional entende. */
export function motivoDaRecusa(perfil, ato) {
  const cat = categoriaDe(perfil);
  if (cat === "administrativo")
    return "Seu perfil é administrativo. Registro clínico exige categoria profissional cadastrada.";
  const permitidos = QUEM_PODE[ato] || ASSISTENCIAIS;
  const nomes = permitidos.map(c => CATEGORIAS[c]?.label || c).join(", ");
  if (ato === "diagnostico_enfermagem" || ato === "prescricao_enfermagem")
    return `Privativo do Enfermeiro (COFEN 736/2024, arts. 6º e 7º). Sua categoria: ${CATEGORIAS[cat].label}.`;
  return `Restrito a: ${nomes}. Sua categoria: ${CATEGORIAS[cat].label}.`;
}

/**
 * Tipos de evolução que esta pessoa pode assinar.
 * Alimenta o seletor da tela — em vez de oferecer tudo e recusar no
 * salvamento, que treina o profissional a bater na parede.
 */
export function tiposDeEvolucaoPermitidos(perfil) {
  const cat = categoriaDe(perfil);
  const mapa = {
    medico:             [["evolucao_medica", "Evolução médica"]],
    enfermeiro:         [["evolucao_enfermagem", "Evolução de enfermagem"],
                         ["diagnostico_enfermagem", "Diagnóstico de enfermagem"],
                         ["prescricao_enfermagem", "Prescrição de enfermagem"],
                         ["anotacao_enfermagem", "Anotação de enfermagem"]],
    tecnico_enfermagem: [["anotacao_enfermagem", "Anotação de enfermagem"]],
    fisioterapeuta:     [["evolucao_multi", "Evolução de fisioterapia"]],
    nutricionista:      [["evolucao_multi", "Evolução de nutrição"]],
    farmaceutico:       [["evolucao_multi", "Evolução farmacêutica"]],
    assistente_social:  [["evolucao_multi", "Evolução do serviço social"]],
    administrativo:     [],
  };
  return mapa[cat] || [];
}

/**
 * Identificação para assinar o registro — nome + conselho.
 * A CFM 2.299/2021 exige o registro do conselho nos documentos emitidos;
 * a COFEN 754/2024 exige identificação própria do profissional.
 */
export function assinaturaDe(perfil) {
  const cat = categoriaDe(perfil);
  const conselho = perfil?.conselho || CATEGORIAS[cat]?.conselho || null;
  const registro = perfil?.registro_conselho || null;
  return {
    profissional_nome: perfil?.nome || perfil?.name || perfil?.username || null,
    categoria: cat,
    conselho: registro ? conselho : null,
    registro_conselho: registro,
    // Sem registro de conselho o documento sai incompleto para a norma.
    // Não bloqueia o cuidado — sinaliza para regularizar o cadastro.
    completa: !!(registro && conselho) || cat === "administrativo",
  };
}
