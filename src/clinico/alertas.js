// ═══════════════════════════════════════════════════════════
// FARMÁCIA CLÍNICA — motor de alertas de prescrição
//
// APOIO À DECISÃO — não substitui o julgamento do farmacêutico.
// Base sujeita a validação da equipe local.
//
// Extraído do App.jsx sem alteração de lógica. Está separado por dois
// motivos:
//   1. É o código mais crítico do sistema — decide alerta de dose,
//      interação e alergia. Aqui ele fica testável (ver alertas.test.js).
//   2. São funções PURAS: sem React, sem DOM, sem rede. Dependem só dos
//      argumentos, então o mesmo dado sempre produz o mesmo alerta.
//
// Os nove tipos de alerta:
//   1. duplicidade      — mesmo princípio ativo ou mesmo grupo terapêutico
//   2. dose_maxima      — dose diária acima do teto do catálogo
//   3. tempo_tratamento — duração acima da recomendada
//   4. sonda            — medicamento que não pode ser triturado
//   5. idoso            — Critérios de Beers
//   6. pediatrico       — abaixo da idade mínima
//   7. alergia          — declarada ou por reatividade cruzada
//   8. ajuste_renal / ajuste_hepatico — função de órgão reduzida
//   9. interacao / incompat_y — pares de medicamentos
// ═══════════════════════════════════════════════════════════

// Gravidade: `ordem` define a ordenação dos alertas; `cor` e `label` são
// usados pela interface.
export const FARM_GRAV = {
  alta:  { label: "Alta",  cor: "#f43f5e", ordem: 0 },
  media: { label: "Média", cor: "#d97706", ordem: 1 },
  baixa: { label: "Baixa", cor: "#3b82f6", ordem: 2 },
};

// Formata quantidade: inteiro sem casas, fracionário com vírgula.
export const farmFmtQtd = n => { const v = Number(n || 0); return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ","); };

// Normaliza texto (minúsculas, sem acento) para comparar alergias
export const normTxt = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// Grupos de reatividade cruzada (curados — revisar com a equipe de farmácia)
export const FARM_CROSS = [
  { grupo: "Betalactâmicos (penicilinas/cefalosporinas)", gatilhos: ["penicilina", "betalactamico", "beta-lactamico", "beta lactamico", "amoxicilina", "ampicilina", "cefalospor"], diretos: ["penicilina", "amoxicilina", "ampicilina", "oxacilina", "piperacilina", "benzilpenicilina"], cruzados: ["cefalexina", "cefazolina", "ceftriaxona", "cefepima", "meropenem", "imipenem"] },
  { grupo: "Sulfonamidas", gatilhos: ["sulfa", "sulfonamida", "sulfametoxazol", "bactrim"], diretos: ["sulfametoxazol", "sulfadiazina"], cruzados: [] },
  { grupo: "AINEs", gatilhos: ["aine", "antiinflamatorio", "anti-inflamatorio", "aas", "acido acetilsalicilico", "ibuprofeno", "diclofenaco", "cetoprofeno", "naproxeno"], diretos: ["ibuprofeno", "diclofenaco", "cetoprofeno", "naproxeno", "tenoxicam", "acido acetilsalicilico"], cruzados: [] },
];

// Divide o texto de alergias em termos normalizados (>= 3 letras)
export function parseAlergias(txt) {
  return normTxt(txt).split(/[,;/]| e |\n|\+/).map(s => s.trim()).filter(s => s.length >= 3);
}

// Confronta um medicamento com as alergias do paciente → { match: "direta"|"cruzada"|null }
export function checarAlergia(med, termos) {
  if (!med || !termos || !termos.length) return { match: null };
  const paTxt = normTxt([med.principio_ativo, med.nome].join(" "));
  for (const t of termos) {
    if (paTxt.includes(t)) return { match: "direta", termo: t };
    for (const g of FARM_CROSS) {
      if (!g.gatilhos.some(x => t.includes(x) || x.includes(t))) continue;
      if (g.diretos.some(d => paTxt.includes(d))) return { match: "direta", termo: t, grupo: g.grupo };
      if (g.cruzados.some(c => paTxt.includes(c))) return { match: "cruzada", termo: t, grupo: g.grupo };
    }
  }
  return { match: null };
}

// Analisa a lista de itens da prescrição contra a base clínica + contexto do paciente.
// APOIO À DECISÃO — não substitui o julgamento do farmacêutico. Base sujeita a validação local.
export function analisarPrescricaoClinica(itens, ctx, medById, interacoes = [], incompatY = []) {
  const alertas = [];
  const push = (tipo, gravidade, titulo, detalhe, refs) => alertas.push({ tipo, gravidade, titulo, detalhe, itens: refs || [] });
  const comMed = (itens || []).filter(i => i.medicamento_id && medById[i.medicamento_id]);
  const matchSub = (med, sub) => { const s = normTxt(sub); return !!s && normTxt([med.principio_ativo, med.nome, med.grupo_terapeutico].join(" ")).includes(s); };
  const idade = ctx && ctx.idade !== "" && ctx.idade != null ? Number(ctx.idade) : null;
  const termosAlergia = parseAlergias(ctx?.alergias);

  // 1) Duplicidade — mesmo princípio ativo OU mesmo grupo terapêutico
  const porPA = {}, porGrupo = {};
  comMed.forEach(i => {
    const med = medById[i.medicamento_id];
    const pa = (med.principio_ativo || "").trim().toLowerCase();
    if (pa) (porPA[pa] = porPA[pa] || []).push(i.medicamento_nome);
    const g = (med.grupo_terapeutico || "").trim();
    if (g) (porGrupo[g] = porGrupo[g] || []).push({ nome: i.medicamento_nome, pa });
  });
  Object.values(porPA).forEach(nomes => { if (nomes.length > 1) push("duplicidade", "media", "Duplicidade — mesmo princípio ativo", `${[...new Set(nomes)].join(", ")} têm o mesmo princípio ativo.`, [...new Set(nomes)]); });
  Object.entries(porGrupo).forEach(([g, arr]) => { const pas = new Set(arr.map(a => a.pa)); if (arr.length > 1 && pas.size > 1) push("duplicidade", "baixa", `Duplicidade terapêutica — ${g}`, `${[...new Set(arr.map(a => a.nome))].join(", ")} são do mesmo grupo (${g}). Revisar se a associação é intencional.`, [...new Set(arr.map(a => a.nome))]); });

  comMed.forEach(i => {
    const med = medById[i.medicamento_id];
    const nome = i.medicamento_nome;
    // 2) Dose máxima diária (quando a unidade prescrita bate com a da base)
    if (med.dose_maxima_dia && i.dose_valor && i.frequencia_dia && med.dose_maxima_unid && (i.dose_unidade || "").toLowerCase() === (med.dose_maxima_unid || "").toLowerCase()) {
      const diaria = Number(i.dose_valor) * Number(i.frequencia_dia);
      if (diaria > Number(med.dose_maxima_dia)) push("dose_maxima", "alta", "Dose acima da máxima diária", `${nome}: ${farmFmtQtd(diaria)} ${med.dose_maxima_unid}/dia prescritos — máximo ${farmFmtQtd(med.dose_maxima_dia)} ${med.dose_maxima_unid}/dia.`, [nome]);
    }
    // 3) Tempo de tratamento
    if (med.duracao_maxima_dias && i.duracao_dias && Number(i.duracao_dias) > Number(med.duracao_maxima_dias)) push("tempo_tratamento", "media", "Tempo de tratamento acima do recomendado", `${nome}: ${farmFmtQtd(i.duracao_dias)} dias — recomendado até ${med.duracao_maxima_dias} dias.`, [nome]);
    // 4) Sonda — não triturar
    if (ctx?.em_sonda && med.nao_triturar) push("sonda", "alta", "Contraindicado por sonda (não triturar)", `${nome}: ${med.obs_clinica || "não deve ser triturado/administrado por sonda."}`, [nome]);
    // 5) Idoso (Beers)
    if (idade != null && idade >= 65 && med.inapropriado_idoso) push("idoso", "media", "Potencialmente inapropriado no idoso (Beers)", `${nome}: ${med.motivo_idoso || "potencialmente inapropriado em idosos."}`, [nome]);
    // 6) Pediátrico
    const limPed = med.idade_pediatrica != null ? Number(med.idade_pediatrica) : 12;
    if (idade != null && med.inapropriado_pediatrico && idade < limPed) push("pediatrico", "alta", `Inapropriado para menor de ${limPed} anos`, `${nome}: ${med.motivo_pediatrico || "inapropriado nesta faixa etária."}`, [nome]);
    // 7) Alergia declarada / reatividade cruzada
    const al = checarAlergia(med, termosAlergia);
    if (al.match === "direta") push("alergia", "alta", "Alergia declarada ao medicamento", `${nome}: paciente alérgico a "${al.termo}"${al.grupo ? ` (${al.grupo})` : ""}. NÃO administrar sem reavaliação médica.`, [nome]);
    else if (al.match === "cruzada") push("alergia", "alta", "Possível reatividade cruzada com alergia", `${nome}: paciente alérgico a "${al.termo}" — reatividade cruzada com ${al.grupo}. Avaliar o risco antes de administrar.`, [nome]);
    // 8) Ajuste pela função renal (ClCr/TFG)
    const clcr = ctx && ctx.clearance_renal !== "" && ctx.clearance_renal != null ? Number(ctx.clearance_renal) : null;
    if (clcr != null && clcr < 60 && med.ajuste_renal) push("ajuste_renal", clcr < 30 ? "alta" : "media", "Ajuste pela função renal", `${nome} (ClCr ${clcr} mL/min): ${med.ajuste_renal}`, [nome]);
    // 9) Ajuste pela função hepática
    const fh = (ctx?.funcao_hepatica || "");
    if ((fh === "moderada" || fh === "grave") && med.ajuste_hepatico) push("ajuste_hepatico", fh === "grave" ? "alta" : "media", "Ajuste pela função hepática", `${nome} (função hepática ${fh}): ${med.ajuste_hepatico}`, [nome]);
  });

  // 8) Interações medicamentosas (pares)
  if (interacoes && interacoes.length) {
    for (let x = 0; x < comMed.length; x++) for (let y = x + 1; y < comMed.length; y++) {
      const a = medById[comMed[x].medicamento_id], b = medById[comMed[y].medicamento_id];
      for (const it of interacoes) {
        const hit = (matchSub(a, it.substancia_a) && matchSub(b, it.substancia_b)) || (matchSub(a, it.substancia_b) && matchSub(b, it.substancia_a));
        if (hit) {
          const grav = it.gravidade === "grave" ? "alta" : it.gravidade === "leve" ? "baixa" : "media";
          push("interacao", grav, `Interação ${it.gravidade || "medicamentosa"}`, `${comMed[x].medicamento_nome} + ${comMed[y].medicamento_nome}: ${it.descricao || "interação medicamentosa"}${it.conduta ? " — " + it.conduta : ""}.`, [comMed[x].medicamento_nome, comMed[y].medicamento_nome]);
          break; // um alerta por par
        }
      }
    }
  }
  // 9) Incompatibilidade em Y (ambos por via IV)
  if (incompatY && incompatY.length) {
    const iv = comMed.filter(i => (i.via || "").toUpperCase() === "IV");
    for (let x = 0; x < iv.length; x++) for (let y = x + 1; y < iv.length; y++) {
      const a = medById[iv[x].medicamento_id], b = medById[iv[y].medicamento_id];
      for (const it of incompatY) {
        const hit = (matchSub(a, it.substancia_a) && matchSub(b, it.substancia_b)) || (matchSub(a, it.substancia_b) && matchSub(b, it.substancia_a));
        if (hit) { push("incompat_y", "alta", "Incompatibilidade em Y (IV)", `${iv[x].medicamento_nome} + ${iv[y].medicamento_nome}: ${it.descricao || "incompatíveis na mesma linha"}. Não infundir juntos.`, [iv[x].medicamento_nome, iv[y].medicamento_nome]); break; }
      }
    }
  }

  return alertas.sort((a, b) => FARM_GRAV[a.gravidade].ordem - FARM_GRAV[b.gravidade].ordem);
}

// Score de prescrição (estilo NoHarm): 0 (boa) → 3 (ruim), local, sem IA paga.
// Deriva da gravidade dos alertas que tocam o item + completude da dose.
export const FARM_SCORE_COR = ["#34d399", "#3b82f6", "#d97706", "#f43f5e"];

export function scoreItemClinico(item, alertas) {
  const rel = (alertas || []).filter(a => a.itens && a.itens.includes(item.medicamento_nome));
  let s = rel.some(a => a.gravidade === "alta") ? 3 : rel.some(a => a.gravidade === "media") ? 2 : rel.some(a => a.gravidade === "baixa") ? 1 : 0;
  if (s < 1 && item.medicamento_id && !item.dose_valor) s = 1;   // dose não especificada
  return s;
}

export function scorePrescricao(itens, alertas) {
  const comMed = (itens || []).filter(i => i.medicamento_id);
  if (!comMed.length) return 0;
  return Math.max(0, ...comMed.map(i => scoreItemClinico(i, alertas)));
}
