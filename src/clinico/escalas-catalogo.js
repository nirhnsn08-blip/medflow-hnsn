// Catálogo das escalas de enfermagem — os subitens PADRONIZADOS de cada escala
// e suas opções pontuadas. A tela renderiza a partir daqui; o motor
// (escalas-enfermagem.js) soma os pontos. Os ITENS são fixos (Braden é Braden);
// só os CORTES de classificação são editáveis (tabela enf_escala_faixas).
//
// `tipo` diz como a tela e o motor tratam a escala:
//   "soma"   → soma os subitens (guardados como { chave: pontos }).
//   "opcoes" → um valor único escolhido de uma lista (guardado como { valor }).
//   "valor"  → um número direto num intervalo (guardado como { valor }).
//
// Fugulin: os descritores exatos por indicador variam entre versões do
// instrumento — aqui vão rótulos concisos de nível; a equipe valida/ajusta.

const op = (...pares) => pares.map(([v, l]) => ({ v, l }));

export const ESCALAS = {
  braden: {
    nome: "Braden", sub: "Risco de lesão por pressão", tipo: "soma",
    itens: [
      { chave: "percepcao", rotulo: "Percepção sensorial", opcoes: op([1, "Totalmente limitada"], [2, "Muito limitada"], [3, "Levemente limitada"], [4, "Nenhuma limitação"]) },
      { chave: "umidade",   rotulo: "Umidade da pele",     opcoes: op([1, "Constantemente úmida"], [2, "Muito úmida"], [3, "Ocasionalmente úmida"], [4, "Raramente úmida"]) },
      { chave: "atividade", rotulo: "Atividade",           opcoes: op([1, "Acamado"], [2, "Confinado à cadeira"], [3, "Anda ocasionalmente"], [4, "Anda frequentemente"]) },
      { chave: "mobilidade",rotulo: "Mobilidade",          opcoes: op([1, "Totalmente imóvel"], [2, "Muito limitada"], [3, "Levemente limitada"], [4, "Não limitada"]) },
      { chave: "nutricao",  rotulo: "Nutrição",            opcoes: op([1, "Muito pobre"], [2, "Provavelmente inadequada"], [3, "Adequada"], [4, "Excelente"]) },
      { chave: "friccao",   rotulo: "Fricção e cisalhamento", opcoes: op([1, "Problema"], [2, "Problema em potencial"], [3, "Nenhum problema aparente"]) },
    ],
  },
  morse: {
    nome: "Morse", sub: "Risco de queda", tipo: "soma",
    itens: [
      { chave: "historico",  rotulo: "Histórico de queda (3 meses)", opcoes: op([0, "Não"], [25, "Sim"]) },
      { chave: "diagnostico",rotulo: "Diagnóstico secundário",       opcoes: op([0, "Não"], [15, "Sim"]) },
      { chave: "auxilio",    rotulo: "Auxílio na deambulação",       opcoes: op([0, "Nenhum / acamado / profissional"], [15, "Muletas, bengala ou andador"], [30, "Apoia-se nos móveis"]) },
      { chave: "terapia_ev", rotulo: "Terapia EV / dispositivo venoso", opcoes: op([0, "Não"], [20, "Sim"]) },
      { chave: "marcha",     rotulo: "Marcha",                        opcoes: op([0, "Normal / acamado / cadeira"], [10, "Fraca"], [20, "Comprometida"]) },
      { chave: "mental",     rotulo: "Estado mental",                 opcoes: op([0, "Consciente das limitações"], [15, "Superestima / esquece limitações"]) },
    ],
  },
  glasgow: {
    nome: "Glasgow", sub: "Nível de consciência", tipo: "soma",
    itens: [
      { chave: "ocular", rotulo: "Abertura ocular",  opcoes: op([4, "Espontânea"], [3, "Ao som / voz"], [2, "À pressão / dor"], [1, "Ausente"]) },
      { chave: "verbal", rotulo: "Resposta verbal",  opcoes: op([5, "Orientada"], [4, "Confusa"], [3, "Palavras"], [2, "Sons"], [1, "Ausente"]) },
      { chave: "motora", rotulo: "Resposta motora",  opcoes: op([6, "Obedece a ordens"], [5, "Localiza"], [4, "Flexão normal (retirada)"], [3, "Flexão anormal"], [2, "Extensão"], [1, "Ausente"]) },
    ],
  },
  fugulin: {
    nome: "Fugulin", sub: "Grau de dependência", tipo: "soma",
    itens: [
      "estado_mental", "oxigenacao", "sinais_vitais", "motilidade", "deambulacao",
      "alimentacao", "cuidado_corporal", "eliminacao", "terapeutica",
    ].map(chave => ({
      chave,
      rotulo: { estado_mental: "Estado mental", oxigenacao: "Oxigenação", sinais_vitais: "Sinais vitais",
                motilidade: "Motilidade", deambulacao: "Deambulação", alimentacao: "Alimentação",
                cuidado_corporal: "Cuidado corporal / higiene", eliminacao: "Eliminação", terapeutica: "Terapêutica" }[chave],
      opcoes: op([1, "1 — independente"], [2, "2 — dependência leve"], [3, "3 — dependência moderada"], [4, "4 — dependência total"]),
    })),
  },
  dor: {
    nome: "Dor", sub: "Intensidade (0–10)", tipo: "valor", min: 0, max: 10,
  },
  rass: {
    nome: "RASS", sub: "Sedação / agitação", tipo: "opcoes",
    opcoes: op(
      [4, "+4 Combativo"], [3, "+3 Muito agitado"], [2, "+2 Agitado"], [1, "+1 Inquieto"],
      [0, "0 Alerta e calmo"], [-1, "−1 Sonolento"], [-2, "−2 Sedação leve"],
      [-3, "−3 Sedação moderada"], [-4, "−4 Sedação profunda"], [-5, "−5 Não desperta"],
    ),
  },
  flebite: {
    nome: "Flebite", sub: "Grau do acesso venoso (INS)", tipo: "opcoes", pedeSitio: true,
    opcoes: op(
      [0, "Grau 0 — sem sinais"],
      [1, "Grau 1 — eritema, com ou sem dor"],
      [2, "Grau 2 — dor + eritema e/ou edema"],
      [3, "Grau 3 — + cordão venoso palpável"],
      [4, "Grau 4 — + cordão > 2,5 cm / drenagem purulenta"],
    ),
  },
};

// Ordem em que aparecem na tela.
export const ORDEM_ESCALAS = ["braden", "morse", "dor", "flebite", "glasgow", "rass", "fugulin"];

// Estágios de lesão por pressão (NPUAP/EPUAP).
export const ESTAGIOS_LPP = [
  { v: "1", l: "Estágio 1 — eritema não branqueável" },
  { v: "2", l: "Estágio 2 — perda parcial (derme exposta)" },
  { v: "3", l: "Estágio 3 — perda total da pele" },
  { v: "4", l: "Estágio 4 — perda total de tecido (expõe estrutura)" },
  { v: "nao_classificavel", l: "Não classificável" },
  { v: "tissular_profunda", l: "Tissular profunda (suspeita)" },
];
