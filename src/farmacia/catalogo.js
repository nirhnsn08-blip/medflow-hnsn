// ═══════════════════════════════════════════════════════════
// FARMÁCIA — CATÁLOGO
//
// As listas do domínio: formas farmacêuticas, unidades, classes
// terapêuticas, motivos de saída e os tipos de alerta clínico.
//
// Saiu do App.jsx porque não é só da Farmácia: `FARM_CLASSES` é lido por 4
// declarações (a Farmácia, o cadastro de medicamento, a dispensação avulsa
// e o modal de atendimento do PS) e `FARM_ALERTA_TIPOS` por 3.
//
// 🔴 As CHAVES de `FARM_ALERTA_TIPOS` vêm do motor de alertas
// (../clinico/alertas.js) e viram o filtro da tela de dispensação. Um tipo
// que o motor emite e que não estiver aqui aparece como etiqueta EM BRANCO
// no cartão do paciente — já aconteceu com `base_indisponivel`.
//
// ⚠️ `FARM_MOTIVOS_SAIDA` é contrato com ./validade.js: "Dispensação" é o
// único motivo que entrega o medicamento a um paciente, e é por esse texto
// exato que a regra de lote vencido decide se pode sair.
// ═══════════════════════════════════════════════════════════

export const FARM_FORMAS   = ["Comprimido", "Cápsula", "Ampola", "Frasco-ampola", "Frasco", "Bolsa/Soro", "Seringa", "Bisnaga/Pomada", "Spray/Aerossol", "Solução oral", "Sachê", "Outro"];

export const FARM_UNIDADES = ["unidade", "comprimido", "cápsula", "ampola", "frasco-ampola", "frasco", "bolsa", "seringa", "mL", "g", "dose"];

export const FARM_CLASSES = [
  "Analgésicos e antipiréticos",
  "Anti-inflamatórios (AINEs)",
  "Opioides",
  "Anestésicos",
  "Antibióticos",
  "Antifúngicos",
  "Antivirais",
  "Insulinas",
  "Antidiabéticos orais",
  "Cardiovasculares e anti-hipertensivos",
  "Diuréticos",
  "Anticoagulantes e antitrombóticos",
  "Drogas vasoativas",
  "Respiratório / broncodilatadores",
  "Corticoides",
  "Antieméticos",
  "Antiulcerosos / protetores gástricos",
  "Sedativos e anticonvulsivantes",
  "Antipsicóticos e antidepressivos",
  "Anti-histamínicos / antialérgicos",
  "Soluções, eletrólitos e soros",
  "Vitaminas e suplementos",
  "Outros",
];

export const FARM_MOTIVOS_SAIDA = ["Dispensação", "Perda / vencimento", "Devolução ao fornecedor", "Ajuste de inventário", "Transferência"];

export const FARM_ALERTA_TIPOS = {
  alergia: "Alergia", interacao: "Interação", incompat_y: "Incompatibilidade em Y",
  dose_maxima: "Dose máxima", duplicidade: "Duplicidade", tempo_tratamento: "Tempo de tratamento",
  sonda: "Sonda / não triturar", idoso: "Inapropriado idoso (Beers)", pediatrico: "Inapropriado criança",
  ajuste_renal: "Ajuste renal", ajuste_hepatico: "Ajuste hepático",
  // Não é achado clínico: é a conferência que NÃO pôde ser feita.
  base_indisponivel: "Base não conferida",
};

// ── A previsão de ruptura ──
// `JANELA` é quantos dias de consumo passado entram na média; `HORIZONTE`
// é quantos dias à frente a previsão olha. Encurtar a janela faz um pico
// isolado virar tendência; alongar o horizonte enche a tela de "vai
// faltar" para item que ainda tem meses de estoque.
// Saídas desde uma data (para previsão de demanda)
// Previsão de demanda: janela de histórico (dias) e horizonte da previsão (dias)
export const FARM_PREV_JANELA = 30;
export const FARM_PREV_HORIZONTE = 7;
