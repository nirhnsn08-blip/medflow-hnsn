// Catálogo estrutural da SAE (Processo de Enfermagem — Fase 1b).
//
// Como em escalas-catalogo.js, aqui mora só o que é FIXO: o modelo do
// histórico de enfermagem (as seções da coleta de dados), os domínios/subtipos
// da NANDA-I e os helpers que organizam o catálogo CLÍNICO — este último NÃO
// vive aqui: os diagnósticos (NANDA) e intervenções (NIC) são curados na tabela
// `enf_sae_catalogo`, editável pelo ADM Master e "em validação". A tela e o
// motor (sae.js) leem os dois: a estrutura daqui, o conteúdo clínico do banco.

export const UNIDADES = [
  { v: "clinica", l: "Clínica médica (adulto)" },
  { v: "uti",     l: "UTI / alta dependência" },
  { v: "peds",    l: "Pediatria" },
  { v: "obst",    l: "Obstétrica / puérpera" },
];

// Subtipo do diagnóstico NANDA-I.
export const SUBTIPOS_DX = [
  { v: "real",     l: "Real",              sub: "problema presente" },
  { v: "risco",    l: "De risco",          sub: "vulnerabilidade" },
  { v: "promocao", l: "Promoção da saúde", sub: "disposição para melhorar" },
];

export const PRIORIDADES = [
  { v: "alta",  l: "Alta" },
  { v: "media", l: "Média" },
  { v: "baixa", l: "Baixa" },
];

// Modelo do HISTÓRICO de enfermagem — a coleta de dados organizada por
// necessidades humanas básicas (referência Wanda Horta), enxuta. Os itens são
// fixos; as respostas ficam em `enf_sae_historico.dados` (jsonb), por seção.
// tipo: "texto" (área livre) | "opcoes" (uma escolha) | "checks" (várias).
const opc = (...vs) => vs.map(v => (typeof v === "string" ? { v, l: v } : { v: v[0], l: v[1] }));

export const HISTORICO_MODELO = [
  { chave: "percepcao_saude", titulo: "Percepção e cuidado com a saúde", campos: [
    { chave: "motivo", rotulo: "Motivo da internação / percepção do paciente", tipo: "texto" },
    { chave: "orientado", rotulo: "Orientado quanto ao cuidado", tipo: "opcoes", opcoes: opc("Sim", "Parcialmente", "Não") },
  ]},
  { chave: "nutricao", titulo: "Nutrição e hidratação", campos: [
    { chave: "aceitacao", rotulo: "Aceitação da dieta", tipo: "opcoes", opcoes: opc("Boa", "Regular", "Baixa", "Jejum") },
    { chave: "via", rotulo: "Via de alimentação", tipo: "opcoes", opcoes: opc("Oral", "Sonda", "Parenteral") },
    { chave: "obs", rotulo: "Observações (náusea, disfagia, hidratação)", tipo: "texto" },
  ]},
  { chave: "eliminacao", titulo: "Eliminação", campos: [
    { chave: "urinaria", rotulo: "Eliminação urinária", tipo: "opcoes", opcoes: opc("Espontânea", "Cateter vesical", "Fralda", "Alterada") },
    { chave: "intestinal", rotulo: "Eliminação intestinal", tipo: "opcoes", opcoes: opc("Presente", "Constipação", "Diarreia", "Ostomia") },
  ]},
  { chave: "atividade", titulo: "Atividade, mobilidade e repouso", campos: [
    { chave: "mobilidade", rotulo: "Mobilidade", tipo: "opcoes", opcoes: opc("Deambula", "Auxílio", "Restrito ao leito") },
    { chave: "sono", rotulo: "Sono e repouso", tipo: "texto" },
  ]},
  { chave: "neuro", titulo: "Neurológico e dor", campos: [
    { chave: "consciencia", rotulo: "Nível de consciência", tipo: "opcoes", opcoes: opc([ "alerta", "Alerta" ], [ "sonolento", "Sonolento" ], [ "torporoso", "Torporoso" ], [ "inconsciente", "Inconsciente" ]) },
    { chave: "dor", rotulo: "Queixa de dor", tipo: "texto" },
  ]},
  { chave: "pele", titulo: "Pele e tecidos", campos: [
    { chave: "integridade", rotulo: "Integridade da pele", tipo: "opcoes", opcoes: opc("Íntegra", "Lesão por pressão", "Ferida operatória", "Outra lesão") },
    { chave: "dispositivos", rotulo: "Dispositivos (acessos, drenos, sondas)", tipo: "texto" },
  ]},
  { chave: "respiratorio", titulo: "Respiratório e cardiovascular", campos: [
    { chave: "padrao", rotulo: "Padrão respiratório", tipo: "opcoes", opcoes: opc("Eupneico", "Dispneico", "Taquipneico", "Ventilação mecânica") },
    { chave: "oxigenio", rotulo: "Oxigenoterapia", tipo: "opcoes", opcoes: opc("Ar ambiente", "Cateter/máscara", "VNI", "VM") },
  ]},
  { chave: "seguranca", titulo: "Segurança e proteção", campos: [
    { chave: "risco_queda", rotulo: "Risco de queda percebido", tipo: "opcoes", opcoes: opc("Baixo", "Moderado", "Alto") },
    { chave: "alergias", rotulo: "Alergias relatadas", tipo: "texto" },
    { chave: "isolamento", rotulo: "Precaução / isolamento", tipo: "texto" },
  ]},
  { chave: "psicossocial", titulo: "Psicossocial", campos: [
    { chave: "estado", rotulo: "Estado emocional", tipo: "texto" },
    { chave: "apoio", rotulo: "Rede de apoio / acompanhante", tipo: "texto" },
  ]},
];

// ── Organização do catálogo clínico vindo do banco ──────────
// Recebe as linhas de `enf_sae_catalogo` e devolve um índice cômodo.
export function indexarCatalogo(linhas) {
  const rows = Array.isArray(linhas) ? linhas.filter(l => l && l.ativo !== false) : [];
  const diagnosticos = rows.filter(l => l.tipo === "diagnostico")
    .sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999));
  const intervencoes = rows.filter(l => l.tipo === "intervencao")
    .sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999));
  const porId = new Map(rows.map(l => [l.id, l]));
  return { diagnosticos, intervencoes, porId };
}

/** Diagnósticos aplicáveis a uma unidade (unidades vazio no item = todas). */
export function diagnosticosDaUnidade(idx, unidade) {
  const lista = idx?.diagnosticos || [];
  if (!unidade) return lista;
  return lista.filter(d => {
    const u = Array.isArray(d.unidades) ? d.unidades : [];
    return u.length === 0 || u.includes(unidade);
  });
}

/** Intervenções NIC que o catálogo liga a um diagnóstico. */
export function intervencoesDoDiagnostico(diagnostico, idx) {
  const ligadas = diagnostico?.payload?.intervencoes;
  if (!Array.isArray(ligadas) || !idx?.porId) return [];
  return ligadas.map(id => idx.porId.get(id)).filter(x => x && x.tipo === "intervencao");
}
