// ═══════════════════════════════════════════════════════════
// SINAIS VITAIS DO ADULTO — a classificação de risco de Manchester
//
// 🔴 ESTA FUNÇÃO VIVIA DENTRO DE `PsPage.jsx`, SEM UM TESTE — e as duas
// versões que a ESPELHAM (`pediatria.js` e `obstetricia.js`) sempre
// tiveram. Os cabeçalhos delas dizem, com todas as letras, "espelha o
// `avaliarSinaisVitais` (adulto)": o espelho era conferido, o original não.
//
// É o que decide se um paciente sai da triagem como VERMELHO (atendimento
// imediato), laranja, amarelo ou verde. Um limite errado aqui não aparece
// em tela nenhuma: aparece na fila de espera de alguém que deveria ter
// passado na frente.
//
// ⚠️ É APOIO À DECISÃO, NÃO A DECISÃO. Cada alteração vira um "motivo" com
// o nível que ela dispara, e a sugestão final é o PIOR nível encontrado. A
// palavra final é da enfermeira que tria — por isso a função devolve os
// motivos, e não só a cor.
//
// ⚠️ SEM NENHUM SINAL, DEVOLVE `sugestao: null` — não "verde". Ficha em
// branco classificada como verde mandaria para o fim da fila quem ninguém
// mediu ainda.
// ═══════════════════════════════════════════════════════════

export // Nível de consciência (AVPU)
// Avalia os sinais vitais (adulto) e sugere a classificação de Manchester.
// APOIO À DECISÃO: cada alteração vira um "motivo" com o nível que ela dispara;
// a sugestão final é o pior nível encontrado. A palavra final é da triadora.
function avaliarSinaisVitais(v) {
  const motivos = [];
  const add = (nivel, texto) => motivos.push({ nivel, texto });
  const n = x => (x === "" || x == null ? null : Number(x));
  const spo2 = n(v.spo2), fr = n(v.fr), fc = n(v.fc), pas = n(v.pa_sist), temp = n(v.temp), dor = n(v.dor), gli = n(v.glicemia);

  if (v.consciencia === "U") add("vermelho", "Inconsciente (AVPU: U)");
  else if (v.consciencia === "D") add("laranja", "Responde apenas à dor (AVPU: D)");
  else if (v.consciencia === "V") add("laranja", "Responde apenas à voz (AVPU: V)");

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
  if (pas != null) {
    if (pas < 80) add("vermelho", `PA sistólica ${pas} mmHg (choque?)`);
    else if (pas <= 89) add("laranja", `PA sistólica ${pas} mmHg`);
    else if (pas <= 99) add("amarelo", `PA sistólica ${pas} mmHg`);
    else if (pas >= 220) add("laranja", `PA sistólica ${pas} mmHg (crise hipertensiva)`);
    else if (pas >= 180) add("amarelo", `PA sistólica ${pas} mmHg (elevada)`);
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

  const temAlgum = [spo2, fr, fc, pas, temp, dor, gli].some(x => x != null) || !!v.consciencia;
  if (!temAlgum) return { sugestao: null, motivos: [] };
  const ordem = ["vermelho", "laranja", "amarelo", "verde"];
  const pior = ordem.find(nv => motivos.some(m => m.nivel === nv));
  return { sugestao: pior || "verde", motivos };
}
