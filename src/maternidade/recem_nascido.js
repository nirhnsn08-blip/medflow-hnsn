// ═══════════════════════════════════════════════════════════
// RECÉM-NASCIDO — motor puro
//
// Cálculos determinísticos do berço:
//  • PESO AO NASCER — a classe (baixo peso e faixas, macrossomia).
//  • IDADE GESTACIONAL — pré-termo (e o subtipo), termo, pós-termo.
//  • CAPURRO SOMÁTICO — estima a IG por 5 sinais do exame físico, uma
//    pontuação fixa como o Bishop: IG(dias) = 204 + soma dos pontos.
//  • APGAR — reaproveitado do motor do parto (uma faixa só no sistema).
//
// ⚠️ APOIO, NUNCA CONDUTA. As faixas sinalizam; a leitura é de quem examina.
// ⚠️ NÃO CHUTA. Faltando peça, devolve `completo:false` e o que falta — um
// Capurro com sinal em branco vale menos que o real e induz ao erro.
// ═══════════════════════════════════════════════════════════

// A faixa do Apgar mora no motor do parto — reexportada para a tela do RN
// usar a MESMA (0–3 grave, 4–6 moderado, 7–10 normal).
export { avaliarApgar } from "./parto.js";

const num = v => {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Classe do peso ao nascer (gramas). `baixoPeso` = <2500 g (o corte da OMS).
 */
export function avaliarPeso(gramas) {
  const g = num(gramas);
  if (g == null || g <= 0) return { avaliado: false, classe: null, baixoPeso: false, rotulo: null };
  let classe, rotulo;
  if (g < 1000) { classe = "extremo_baixo"; rotulo = "Extremo baixo peso (<1000 g)"; }
  else if (g < 1500) { classe = "muito_baixo"; rotulo = "Muito baixo peso (<1500 g)"; }
  else if (g < 2500) { classe = "baixo"; rotulo = "Baixo peso (<2500 g)"; }
  else if (g < 4000) { classe = "adequado"; rotulo = "Peso adequado"; }
  else { classe = "macrossomia"; rotulo = "Macrossomia (≥4000 g)"; }
  return { avaliado: true, gramas: g, classe, baixoPeso: g < 2500, rotulo };
}

/**
 * Classe da idade gestacional ao nascer (semanas, pode ser fracionária).
 * Pré-termo <37 (extremo/muito/moderado/tardio), termo 37–41, pós-termo ≥42.
 */
export function classificarIdadeGestacional(semanas) {
  const s = num(semanas);
  if (s == null || s <= 0) return { avaliado: false, classe: null, subclasse: null, rotulo: null };
  let classe, subclasse, rotulo;
  if (s < 37) {
    classe = "pretermo";
    if (s < 28) { subclasse = "extremo"; rotulo = "Pré-termo extremo (<28 sem)"; }
    else if (s < 32) { subclasse = "muito"; rotulo = "Muito pré-termo (28–31 sem)"; }
    else if (s < 34) { subclasse = "moderado"; rotulo = "Pré-termo moderado (32–33 sem)"; }
    else { subclasse = "tardio"; rotulo = "Pré-termo tardio (34–36 sem)"; }
  } else if (s < 42) {
    classe = "termo";
    if (s < 39) { subclasse = "precoce"; rotulo = "Termo precoce (37–38 sem)"; }
    else if (s < 41) { subclasse = "pleno"; rotulo = "Termo pleno (39–40 sem)"; }
    else { subclasse = "tardio"; rotulo = "Termo tardio (41 sem)"; }
  } else {
    classe = "postermo"; subclasse = null; rotulo = "Pós-termo (≥42 sem)";
  }
  return { avaliado: true, semanas: s, classe, subclasse, rotulo };
}

// ── Capurro somático — os 5 sinais e seus pontos ────────────
// A tela mostra o rótulo e guarda os `pontos`. O 204 é a constante do método.
export const CAPURRO = {
  pele:    { rotulo: "Textura da pele", opcoes: [
    { pontos: 0, rotulo: "Muito fina, gelatinosa" }, { pontos: 5, rotulo: "Fina e lisa" },
    { pontos: 10, rotulo: "Discreta descamação superficial" }, { pontos: 15, rotulo: "Grossa, sulcos superficiais, descamação de mãos/pés" },
    { pontos: 20, rotulo: "Grossa, apergaminhada, sulcos profundos" } ] },
  orelha:  { rotulo: "Forma da orelha", opcoes: [
    { pontos: 0, rotulo: "Chata, pavilhão não encurvado" }, { pontos: 8, rotulo: "Borda parcialmente encurvada" },
    { pontos: 16, rotulo: "Parte superior encurvada" }, { pontos: 24, rotulo: "Pavilhão totalmente encurvado" } ] },
  mama:    { rotulo: "Glândula mamária", opcoes: [
    { pontos: 0, rotulo: "Não palpável" }, { pontos: 5, rotulo: "Palpável, <5 mm" },
    { pontos: 10, rotulo: "5–10 mm" }, { pontos: 15, rotulo: ">10 mm" } ] },
  mamilo:  { rotulo: "Formação do mamilo", opcoes: [
    { pontos: 0, rotulo: "Pouco visível, sem aréola" }, { pontos: 5, rotulo: "Aréola pigmentada, borda não elevada, <7,5 mm" },
    { pontos: 10, rotulo: "Borda elevada, <7,5 mm" }, { pontos: 15, rotulo: "Borda elevada, >7,5 mm" } ] },
  plantar: { rotulo: "Pregas plantares", opcoes: [
    { pontos: 0, rotulo: "Sem pregas" }, { pontos: 5, rotulo: "Marcas mal definidas na metade anterior" },
    { pontos: 10, rotulo: "Marcas bem definidas, sulcos no 1/3 anterior" }, { pontos: 15, rotulo: "Sulcos na metade anterior" },
    { pontos: 20, rotulo: "Sulcos em mais da metade anterior" } ] },
};
const CAPURRO_SINAIS = ["pele", "orelha", "mama", "mamilo", "plantar"];
export const CAPURRO_CONSTANTE = 204;

/**
 * Capurro somático. Entra os pontos dos 5 sinais; sai a IG estimada.
 * IG(dias) = 204 + soma; semanas + dias de resto. Faltando um sinal, não
 * estima (o método só vale com os cinco).
 */
export function capurroSomatico(sinais = {}) {
  const pontos = {};
  for (const s of CAPURRO_SINAIS) {
    const p = num(sinais[s]);
    if (p == null) return { completo: false, falta: CAPURRO[s].rotulo, dias: null, semanas: null, diasResto: null };
    pontos[s] = p;
  }
  const soma = CAPURRO_SINAIS.reduce((t, s) => t + pontos[s], 0);
  const dias = CAPURRO_CONSTANTE + soma;
  return { completo: true, soma, dias, semanas: Math.floor(dias / 7), diasResto: dias % 7 };
}
