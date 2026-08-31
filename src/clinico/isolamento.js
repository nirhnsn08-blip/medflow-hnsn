// ═══════════════════════════════════════════════════════════
// PRECAUÇÕES DE ISOLAMENTO
//
// Base: Anvisa "Medidas de Prevenção de IRAS" + CDC. Orientação geral —
// o protocolo institucional e a CCIH mandam mais que esta tabela.
//
// Saiu do App.jsx, onde era usada por três módulos que não se conhecem:
// SCIH (cadastro do caso e da base de germes), Paciente 360 (linha do tempo
// e sentinela) e Giro de Leitos (a tarja do leito). Era o último bloco de
// domínio que prendia o Giro de Leitos ao monólito.
//
// 🔴 A CHAVE É CONTRATO COM O BANCO, não rótulo de tela.
// `contato`, `goticulas`, `aereo` são gravadas em três tabelas
// (`leitos.isolamento`, `scih_casos.isolamento`, `scih_germes.isolamento`).
// Mudar uma chave aqui não quebra nada visível: o valor gravado deixa de
// casar, `precaucaoDe` devolve `null`, e o leito isolado passa a aparecer
// SEM TARJA. Ninguém vê erro; alguém entra no quarto sem o EPI certo.
// Por isso as chaves são conferidas contra o seed em `isolamento.test.js`.
// ═══════════════════════════════════════════════════════════

export const ISOLAMENTOS = {
  contato: {
    label: "Contato", icon: "🧤", cor: "#fbbf24", bg: "#3d2e06",
    curto: "Transmissão por contato direto ou indireto (mãos, superfícies, equipamentos).",
    quando: "Bactérias multirresistentes (MRSA, VRE, KPC e demais enterobactérias com carbapenemase, Acinetobacter MR), Clostridioides difficile, escabiose, diarreias infecciosas, vírus sincicial respiratório.",
    epi: "Luvas e avental ao entrar / ter contato; higiene das mãos antes e depois; equipamentos dedicados ao paciente.",
    quarto: "Quarto privativo (ou coorte do mesmo agente).",
  },
  goticulas: {
    label: "Gotículas", icon: "😷", cor: "#38bdf8", bg: "#132c47",
    curto: "Gotículas respiratórias maiores que 5 µm; alcançam curtas distâncias (~1 a 2 m).",
    quando: "Doença meningocócica, coqueluche, influenza, difteria, caxumba, rubéola, H. influenzae invasiva.",
    epi: "Máscara cirúrgica ao entrar / aproximar (< 1 m); higiene das mãos. Paciente usa máscara cirúrgica no transporte.",
    quarto: "Quarto privativo (ou coorte); manter ≥ 1 m entre leitos.",
  },
  aereo: {
    label: "Aéreo (aerossóis)", icon: "🌬️", cor: "#f43f5e", bg: "#3d0f18",
    curto: "Núcleos de partículas menores que 5 µm que ficam suspensos no ar e percorrem longas distâncias.",
    quando: "Tuberculose pulmonar/laríngea, sarampo, varicela, herpes-zóster disseminado; procedimentos geradores de aerossol.",
    epi: "Máscara N95 / PFF2 ao entrar; higiene das mãos. Paciente usa máscara cirúrgica no transporte.",
    quarto: "Quarto privativo com pressão negativa e porta fechada (ou renovação/exaustão de ar adequada).",
  },
};

/** As chaves gravadas no banco, na ordem de exibição (do mais comum ao mais raro). */
export const CHAVES_ISOLAMENTO = Object.keys(ISOLAMENTOS);

/**
 * A precaução de uma chave, ou `null`.
 *
 * ⚠️ ESTA FUNÇÃO FALHA CALADA, DE PROPÓSITO — e é por isso que ela existe
 * em vez de estar espalhada. Antes, sete lugares escreviam
 * `x.isolamento && ISOLAMENTOS[x.isolamento]` por conta própria; quem
 * escrevesse o oitavo sem a guarda quebraria a tela com valor inesperado.
 *
 * O silêncio é a escolha certa AQUI (não dá para inventar uma precaução que
 * não se conhece), mas não é inofensivo: leito sem tarja é lido como leito
 * sem isolamento. O que impede isso não é esta função — é a tela só
 * oferecer as chaves de `CHAVES_ISOLAMENTO` e o teste conferi-las contra o
 * que o banco tem gravado.
 */
export function precaucaoDe(chave) {
  if (!chave || typeof chave !== "string") return null;
  // ⚠️ `hasOwn`, e não `ISOLAMENTOS[chave]` direto: com acesso direto,
  // `"toString"` devolve a função herdada do Object — verdadeira — e a tela
  // desenha a tarja lendo `.label` e `.bg` dela, que são `undefined`. Sai
  // uma tarja em branco, que é pior que tarja nenhuma: parece informação.
  // As oito guardas espalhadas pelo App.jsx tinham esse mesmo buraco.
  return Object.hasOwn(ISOLAMENTOS, chave) ? ISOLAMENTOS[chave] : null;
}

/** A chave é uma das que o banco reconhece? Para validar antes de gravar. */
export const isolamentoValido = chave => CHAVES_ISOLAMENTO.includes(chave);
