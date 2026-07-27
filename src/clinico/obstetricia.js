// Apoio à decisão da triagem OBSTÉTRICA — sugestão de Manchester por
// discriminadores. Espelha o avaliarSinaisVitais (adulto) do App.jsx nos sinais
// gerais (a gestante é adulta), com duas diferenças clínicas:
//   1. A PA NÃO usa a lógica de adulto (hipotensão/crise hipertensiva) — usa as
//      REGRAS obstétricas: na gestação, PA ≥ 140/90 já importa (pré-eclâmpsia),
//      e ≥ 160/110 é grave; com sintoma (cefaleia/epigastralgia/alteração
//      visual) escala (iminência de eclâmpsia).
//   2. Adiciona os discriminadores obstétricos: sangramento, movimento fetal,
//      perda de líquido, contrações.
// Os níveis e limiares vêm da tabela editável ps_faixas_obstetricas (ADM
// Master), não do código. Continua sendo APOIO — a enfermeira classifica.

const ORDEM_NIVEIS = ["vermelho", "laranja", "amarelo", "verde"];

// Cada `chave` de discriminador (sem limiar de PA) mapeia para um achado.
function achadoPresente(chave, obst) {
  switch (chave) {
    case "sangramento":        return !!obst.sangramento;
    case "perda_liquido":      return !!obst.perda_liquido;
    case "contracoes":         return !!obst.contracoes;
    case "mov_fetal_ausente":  return obst.mov_fetal === "ausente";
    case "mov_fetal_reduzido": return obst.mov_fetal === "reduzido";
    default:                   return false;
  }
}

// Algum sintoma de iminência de pré-eclâmpsia marcado?
export function temSintomaPreeclampsia(obst) {
  return !!(obst && (obst.cefaleia || obst.epigastralgia || obst.alteracao_visual));
}

// Avalia a triagem obstétrica e sugere a classificação de Manchester.
// Retorna { sugestao, motivos }. `regras` = linhas de ps_faixas_obstetricas.
export function avaliarObstetrica(v, obst, regras) {
  v = v || {}; obst = obst || {};
  const motivos = [];
  const add = (nivel, texto) => motivos.push({ nivel, texto });
  const n = x => (x === "" || x == null ? null : Number(x));
  const spo2 = n(v.spo2), fr = n(v.fr), fc = n(v.fc), pas = n(v.pa_sist), pad = n(v.pa_diast), temp = n(v.temp), dor = n(v.dor), gli = n(v.glicemia);
  const ativas = (regras || []).filter(r => r && r.ativo !== false);

  // AVPU — universal (rebaixamento pode ser eclâmpsia)
  if (v.consciencia === "U") add("vermelho", "Inconsciente (AVPU: U)");
  else if (v.consciencia === "D") add("laranja", "Responde apenas à dor (AVPU: D)");
  else if (v.consciencia === "V") add("laranja", "Responde apenas à voz (AVPU: V)");

  // Sinais gerais — limiares de adulto (a PA fica fora daqui, é obstétrica)
  if (spo2 != null) {
    if (spo2 < 85) add("vermelho", `SpO2 ${spo2}% (muito baixa)`);
    else if (spo2 <= 91) add("laranja", `SpO2 ${spo2}% (baixa)`);
    else if (spo2 <= 94) add("amarelo", `SpO2 ${spo2}%`);
  }
  if (fr != null) {
    if (fr < 8 || fr > 35) add("vermelho", `FR ${fr} irpm (crítica)`);
    else if (fr <= 9 || fr >= 25) add("laranja", `FR ${fr} irpm`);
    else if (fr >= 21) add("amarelo", `FR ${fr} irpm`);
  }
  if (fc != null) {
    if (fc < 40 || fc > 150) add("vermelho", `FC ${fc} bpm (crítica)`);
    else if (fc <= 49 || fc >= 121) add("laranja", `FC ${fc} bpm`);
    else if (fc <= 59 || fc >= 100) add("amarelo", `FC ${fc} bpm`);
  }
  if (temp != null) {
    if (temp < 35) add("laranja", `Temperatura ${temp}°C (hipotermia)`);
    else if (temp >= 40) add("laranja", `Temperatura ${temp}°C (hiperpirexia)`);
    else if (temp >= 38.5) add("amarelo", `Temperatura ${temp}°C (febre alta)`);
    else if (temp >= 37.8) add("verde", `Temperatura ${temp}°C (febril)`);
  }
  if (dor != null && dor > 0) {
    if (dor >= 8) add("laranja", `Dor intensa (${dor}/10)`);
    else if (dor >= 4) add("amarelo", `Dor moderada (${dor}/10)`);
    else add("verde", `Dor leve (${dor}/10)`);
  }
  if (gli != null) {
    if (gli < 60) add("laranja", `Glicemia ${gli} mg/dL (hipoglicemia)`);
    else if (gli > 400) add("amarelo", `Glicemia ${gli} mg/dL (muito elevada)`);
  }

  // PA obstétrica — dispara só a regra de PA MAIS grave que a paciente atinge
  // (evita motivo redundante). `requer_sintoma` exige sintoma de pré-eclâmpsia.
  const temSintoma = temSintomaPreeclampsia(obst);
  const regrasPA = ativas.filter(r => r.pas_min != null || r.pad_min != null)
    .sort((a, b) => ORDEM_NIVEIS.indexOf(a.nivel) - ORDEM_NIVEIS.indexOf(b.nivel)); // mais grave primeiro
  for (const r of regrasPA) {
    const bate = (pas != null && r.pas_min != null && pas >= r.pas_min) ||
                 (pad != null && r.pad_min != null && pad >= r.pad_min);
    if (bate && (!r.requer_sintoma || temSintoma)) { add(r.nivel, r.rotulo); break; }
  }

  // Discriminadores de achado (regras sem limiar de PA)
  ativas.filter(r => r.pas_min == null && r.pad_min == null)
    .forEach(r => { if (achadoPresente(r.chave, obst)) add(r.nivel, r.rotulo); });

  const temAlgum = [spo2, fr, fc, pas, pad, temp, dor, gli].some(x => x != null) || !!v.consciencia ||
    ["sangramento", "perda_liquido", "contracoes"].some(k => !!obst[k]) ||
    (obst.mov_fetal && obst.mov_fetal !== "presente") || temSintoma;
  if (!temAlgum) return { sugestao: null, motivos: [] };
  const pior = ORDEM_NIVEIS.find(nv => motivos.some(m => m.nivel === nv));
  return { sugestao: pior || "verde", motivos };
}

// Todas as regras ativas estão validadas pelo ADM Master? Enquanto false, a
// triagem mostra "critérios obstétricos em validação".
export function obstetricasValidadas(regras) {
  const ativas = (regras || []).filter(r => r && r.ativo !== false);
  return ativas.length > 0 && ativas.every(r => r.validado === true);
}
