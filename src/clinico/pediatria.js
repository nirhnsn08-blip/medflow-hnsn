// Apoio à decisão da triagem PEDIÁTRICA — sugestão de Manchester com faixas de
// sinais vitais POR IDADE. Espelha o `avaliarSinaisVitais` (adulto) do App.jsx,
// com duas diferenças que existem por motivo clínico:
//   1. FC e FR são avaliadas contra a FAIXA da idade (as de adulto não servem:
//      FC 140 é normal em bebê e alarme em adulto). As faixas vêm da tabela
//      editável `ps_faixas_pediatricas` (ADM Master), não do código.
//   2. PA fica de fora — a unidade não mede PA em criança (falta material
//      adequado). Nem entra no motor.
//
// Continua sendo APOIO À DECISÃO: sugere, a enfermeira classifica.

// Faixa que cobre a idade (em meses). `idade_max_meses` é exclusivo; null = sem
// teto (≥12 anos). Ignora faixas inativas.
export function faixaPorIdade(idadeMeses, faixas) {
  if (idadeMeses == null || Number.isNaN(Number(idadeMeses)) || !Array.isArray(faixas)) return null;
  const m = Number(idadeMeses);
  return faixas
    .filter(f => f && f.ativo !== false)
    .find(f => {
      const min = f.idade_min_meses ?? 0;
      const max = f.idade_max_meses;                 // exclusivo; null = aberto
      return m >= min && (max == null || m < max);
    }) || null;
}

// Nível (cor) de um valor dentro das zonas da faixa. Retorna
// 'vermelho'|'laranja'|'amarelo'|'verde', ou null se não dá para avaliar.
// Degrada com segurança: se um limite estiver ausente (null), aquela zona não
// escala — nunca inventa gravidade.
export function nivelPorZona(x, z) {
  if (x == null || z == null) return null;
  if (z.normal_max != null && x > z.normal_max) {
    if (z.grave_max != null && x > z.grave_max) return "vermelho";
    if (z.moderado_max != null && x > z.moderado_max) return "laranja";
    return "amarelo";
  }
  if (z.normal_min != null && x < z.normal_min) {
    if (z.grave_min != null && x < z.grave_min) return "vermelho";
    if (z.moderado_min != null && x < z.moderado_min) return "laranja";
    return "amarelo";
  }
  if (z.normal_min == null && z.normal_max == null) return null;   // faixa sem normal definido
  return "verde";
}

const zonaFC = f => f && ({ grave_min: f.fc_grave_min, moderado_min: f.fc_moderado_min, normal_min: f.fc_normal_min, normal_max: f.fc_normal_max, moderado_max: f.fc_moderado_max, grave_max: f.fc_grave_max });
const zonaFR = f => f && ({ grave_min: f.fr_grave_min, moderado_min: f.fr_moderado_min, normal_min: f.fr_normal_min, normal_max: f.fr_normal_max, moderado_max: f.fr_moderado_max, grave_max: f.fr_grave_max });

// Avalia os sinais vitais pediátricos e sugere a classificação de Manchester.
// Cada alteração vira um "motivo" com o nível que dispara; a sugestão é o pior
// nível. Retorna { sugestao, motivos, faixa }. `faixa` = null quando não há
// faixa para a idade (a UI avisa e não sugere por FC/FR).
export function avaliarSinaisVitaisPediatrico(v, idadeMeses, faixas) {
  const faixa = faixaPorIdade(idadeMeses, faixas);
  const motivos = [];
  const add = (nivel, texto) => motivos.push({ nivel, texto });
  const n = x => (x === "" || x == null ? null : Number(x));
  const spo2 = n(v.spo2), fr = n(v.fr), fc = n(v.fc), temp = n(v.temp), dor = n(v.dor), gli = n(v.glicemia);

  // AVPU — universal
  if (v.consciencia === "U") add("vermelho", "Inconsciente (AVPU: U)");
  else if (v.consciencia === "D") add("laranja", "Responde apenas à dor (AVPU: D)");
  else if (v.consciencia === "V") add("laranja", "Responde apenas à voz (AVPU: V)");

  // SpO2 — mesmos limiares do adulto (não dependem de idade)
  if (spo2 != null) {
    if (spo2 < 85) add("vermelho", `SpO2 ${spo2}% (muito baixa)`);
    else if (spo2 <= 91) add("laranja", `SpO2 ${spo2}% (baixa)`);
    else if (spo2 <= 94) add("amarelo", `SpO2 ${spo2}%`);
  }

  // FC e FR — POR IDADE (faixa pediátrica). Sem faixa, não avalia por FC/FR.
  const nivelFc = fc != null ? nivelPorZona(fc, zonaFC(faixa)) : null;
  const nivelFr = fr != null ? nivelPorZona(fr, zonaFR(faixa)) : null;
  if (nivelFc && nivelFc !== "verde") add(nivelFc, `FC ${fc} bpm (para a idade)`);
  if (nivelFr && nivelFr !== "verde") add(nivelFr, `FR ${fr} irpm (para a idade)`);

  // Temperatura — mesmos limiares do adulto (revisar peds na validação)
  if (temp != null) {
    if (temp < 35) add("laranja", `Temperatura ${temp}°C (hipotermia)`);
    else if (temp >= 40) add("laranja", `Temperatura ${temp}°C (hiperpirexia)`);
    else if (temp >= 38.5) add("amarelo", `Temperatura ${temp}°C (febre alta)`);
    else if (temp >= 37.8) add("verde", `Temperatura ${temp}°C (febril)`);
  }
  // Dor — universal
  if (dor != null && dor > 0) {
    if (dor >= 8) add("laranja", `Dor intensa (${dor}/10)`);
    else if (dor >= 4) add("amarelo", `Dor moderada (${dor}/10)`);
    else add("verde", `Dor leve (${dor}/10)`);
  }
  // Glicemia
  if (gli != null) {
    if (gli < 60) add("laranja", `Glicemia ${gli} mg/dL (hipoglicemia)`);
    else if (gli > 400) add("amarelo", `Glicemia ${gli} mg/dL (muito elevada)`);
  }

  const temAlgum = [spo2, fr, fc, temp, dor, gli].some(x => x != null) || !!v.consciencia;
  if (!temAlgum) return { sugestao: null, motivos: [], faixa: faixa || null };
  const ordem = ["vermelho", "laranja", "amarelo", "verde"];
  const pior = ordem.find(nv => motivos.some(m => m.nivel === nv));
  return { sugestao: pior || "verde", motivos, faixa: faixa || null };
}

// Todas as faixas ativas estão validadas pelo ADM Master? Enquanto false, a
// triagem mostra "faixas pediátricas em validação".
export function faixasValidadas(faixas) {
  const ativas = (faixas || []).filter(f => f && f.ativo !== false);
  return ativas.length > 0 && ativas.every(f => f.validado === true);
}
