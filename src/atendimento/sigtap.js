// ═══════════════════════════════════════════════════════════
// SIGTAP — a tabela oficial de procedimentos do SUS (motor puro)
//
// Não sabe o que é React nem banco. Guarda a IDENTIDADE de um
// procedimento do SUS (código, via, permanência, regras) e diz, dada
// uma internação/atendimento, o que ANTECIPARIA uma glosa.
//
// Quatro coisas aqui são regra, não detalhe:
//
//   1. O CÓDIGO É 10 DÍGITOS. "03.03.01.003-7" e "0303010037" são o MESMO
//      procedimento — a formatação é enfeite, o dígito verificador é parte
//      do código e não some. Guardamos sempre limpo; formatamos só na tela.
//   2. FALTA DE DADO É SILÊNCIO, NÃO ALARME. O SIGTAP real chega em partes
//      (primeiro os códigos do HNSN, depois valores/CID/CBO do DATASUS).
//      Enquanto uma regra não tem o dado que precisa, ela CALA — nunca
//      inventa uma glosa que na verdade é "ainda não importei essa parte".
//   3. VIA-AGNÓSTICO. AIH (internação), APAC (alta complexidade) e BPA
//      (produção ambulatorial) passam pelo mesmo motor. A via vem do dado
//      (instrumento de registro do SIGTAP); na falta, um palpite pelo grupo.
//   4. PERMANÊNCIA ACIMA DA MÉDIA É ATENÇÃO, NÃO RECUSA. Internação mais
//      longa que a média acontece o tempo todo — o que ela exige é
//      JUSTIFICATIVA, não bloqueio. Recusa fica para o que é determinístico
//      (sexo/idade que o procedimento não admite).
// ═══════════════════════════════════════════════════════════

// ── CÓDIGO ──────────────────────────────────────────────────

/** Qualquer forma → 10 dígitos limpos. `null` se não for um código válido. */
export function codigoLimpo(codigo) {
  const d = String(codigo ?? "").replace(/\D/g, "");
  return d.length === 10 ? d : null;
}

/** "0303010037" → "03.03.01.003-7". `null` se inválido. */
export function codigoFormatado(codigo) {
  const c = codigoLimpo(codigo);
  if (!c) return null;
  return `${c.slice(0, 2)}.${c.slice(2, 4)}.${c.slice(4, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
}

export function codigoValido(codigo) {
  return codigoLimpo(codigo) !== null;
}

/** Grupo = 2 primeiros dígitos ("03" clínicos, "04" cirúrgicos…). */
export function grupoDe(codigo) {
  const c = codigoLimpo(codigo);
  return c ? c.slice(0, 2) : null;
}

// ── VIA (instrumento de registro) ───────────────────────────

/** As três vias do SUS. Convênio (TISS) e particular (direta) são do faturamento.js. */
export const VIAS_SUS = ["bpa", "apac", "aih"];

/**
 * Palpite da via só pelo grupo, quando não há cadastro.
 * 03 (clínicos) e 04 (cirúrgicos) são internação → AIH. O resto da produção
 * ambulatorial cai em BPA; APAC é exceção que SEMPRE vem do cadastro (muda
 * por portaria — cravar a lista aqui faria cada update do SIGTAP virar release).
 */
export function viaPorGrupo(codigo) {
  const g = grupoDe(codigo);
  if (!g) return null;
  if (g === "03" || g === "04") return "aih";
  return "bpa";
}

/** A via do procedimento: a cadastrada, se válida; senão o palpite pelo grupo. */
export function viaDoProcedimento(proc) {
  const v = proc?.via ? String(proc.via).trim().toLowerCase() : null;
  if (v && VIAS_SUS.includes(v)) return v;
  return viaPorGrupo(proc?.codigo);
}

// ── PROCEDIMENTO (normalização) ─────────────────────────────

/**
 * Transforma uma linha crua (do xlsx do HNSN ou do pacote do DATASUS) no
 * modelo limpo. O importador vai usar isto; os campos que ainda não vieram
 * ficam `null`/`[]` — e as regras que dependem deles simplesmente calam.
 */
export function montarProcedimento(dados = {}) {
  const codigo = codigoLimpo(dados.codigo);
  return {
    codigo,
    nome: dados.nome != null ? String(dados.nome).trim() : null,
    grupo: codigo ? grupoDe(codigo) : null,
    via: dados.via ? String(dados.via).trim().toLowerCase() : (codigo ? viaPorGrupo(codigo) : null),
    mediaPermanencia: numOuNull(dados.mediaPermanencia),
    // valores em centavos, do DATASUS (null = ainda não importado, ≠ de graça)
    valorSh: numOuNull(dados.valorSh),
    valorSp: numOuNull(dados.valorSp),
    valorSa: numOuNull(dados.valorSa),
    sexo: normSexo(dados.sexo),
    idadeMin: numOuNull(dados.idadeMin),
    idadeMax: numOuNull(dados.idadeMax),
    cids: Array.isArray(dados.cids) ? dados.cids.map(cidLimpo).filter(Boolean) : [],
    cbos: Array.isArray(dados.cbos) ? dados.cbos.map((c) => String(c).trim()).filter(Boolean) : [],
  };
}

// ── PERMANÊNCIA ─────────────────────────────────────────────

/** Dias entre admissão e alta (inteiro ≥ 0). `null` se datas inválidas ou alta antes da admissão. */
export function permanenciaEmDias(admissao, alta) {
  const a = diaUTC(admissao);
  const b = diaUTC(alta);
  if (a == null || b == null) return null;
  const dias = Math.round((b - a) / 86400000);
  return dias < 0 ? null : dias;
}

/** Compara a permanência real com a média SUS do procedimento. */
export function avaliarPermanencia(proc, dias) {
  const media = proc?.mediaPermanencia ?? null;
  if (media == null || dias == null) {
    return { dias: dias ?? null, media, excede: false, excedente: 0, texto: null };
  }
  const excede = dias > media;
  return {
    dias,
    media,
    excede,
    excedente: excede ? dias - media : 0,
    texto: excede
      ? `Permanência de ${dias} ${plural(dias, "dia", "dias")} acima da média SUS (${media}) — a AIH acima da média exige justificativa.`
      : `Permanência de ${dias} ${plural(dias, "dia", "dias")} dentro da média SUS (${media}).`,
  };
}

// ── GLOSA (checador extensível) ─────────────────────────────

export const GRAVIDADES = {
  IMPEDIMENTO: "impedimento", // determinístico: o SUS não paga assim
  ATENCAO: "atencao",         // exige justificativa / conferência antes de fechar
};

// Diferença mínima (centavos) para a glosa de valor acender. Abaixo disso é
// ruído de arredondamento reais↔centavos, não divergência de tabela.
const TOLERANCIA_VALOR = 1;

/**
 * Valor de referência SIGTAP (SH + SP) em centavos, ou `null` quando nenhum dos
 * dois foi importado — falta de valor é silêncio, não R$ 0,00 (item 2 do topo).
 */
export function valorReferencia(proc) {
  const sh = proc?.valorSh ?? null;
  const sp = proc?.valorSp ?? null;
  if (sh == null && sp == null) return null;
  return (sh || 0) + (sp || 0);
}

/**
 * O que anteciparia uma glosa nesta conta. Retorna uma lista (vazia = tudo
 * certo pelo que sabemos). Cada regra só entra se TEM o dado que precisa —
 * é o item 2 do cabeçalho: falta de dado é silêncio, não alarme.
 *
 * Regras hoje: permanência, sexo, idade, CID e valor. Quantidade máxima, CBO,
 * autorização e duplicidade entram quando o pacote do DATASUS chegar.
 *
 * `valorCobrado` (centavos) é o que a conta vai cobrar do procedimento principal
 * — em geral o preço do catálogo do hospital. Comparado com a referência SIGTAP
 * (SH+SP), acende quando divergem: no SUS quem paga é a tabela.
 */
export function avaliarGlosa({ proc, paciente, cidPrincipal, permanenciaDias, valorCobrado } = {}) {
  const achados = [];
  if (!proc) return achados;

  // Permanência acima da média → atenção (justificativa).
  const p = avaliarPermanencia(proc, permanenciaDias ?? null);
  if (p.excede) {
    achados.push({ regra: "permanencia", gravidade: GRAVIDADES.ATENCAO, texto: p.texto });
  }

  // Sexo — restrição determinística do procedimento.
  const sexoPac = normSexo(paciente?.sexo);
  if (proc.sexo && sexoPac && sexoPac !== proc.sexo) {
    achados.push({
      regra: "sexo",
      gravidade: GRAVIDADES.IMPEDIMENTO,
      texto: `Procedimento restrito ao sexo ${rotuloSexo(proc.sexo)}; paciente ${rotuloSexo(sexoPac)}.`,
    });
  }

  // Idade (anos) — determinística quando a faixa está cadastrada.
  if (paciente?.idade != null) {
    if (proc.idadeMin != null && paciente.idade < proc.idadeMin) {
      achados.push({
        regra: "idade",
        gravidade: GRAVIDADES.IMPEDIMENTO,
        texto: `Idade ${paciente.idade} abaixo do mínimo do procedimento (${proc.idadeMin}).`,
      });
    } else if (proc.idadeMax != null && paciente.idade > proc.idadeMax) {
      achados.push({
        regra: "idade",
        gravidade: GRAVIDADES.IMPEDIMENTO,
        texto: `Idade ${paciente.idade} acima do máximo do procedimento (${proc.idadeMax}).`,
      });
    }
  }

  // CID × procedimento — só quando a lista de CID foi importada (senão CALA).
  if (Array.isArray(proc.cids) && proc.cids.length && cidPrincipal) {
    const cid = cidLimpo(cidPrincipal);
    if (cid && !proc.cids.includes(cid)) {
      achados.push({
        regra: "cid",
        gravidade: GRAVIDADES.ATENCAO,
        texto: `CID ${String(cidPrincipal).toUpperCase().trim()} não consta entre os diagnósticos compatíveis do procedimento.`,
      });
    }
  }

  // Valor cobrado × referência SIGTAP (SH+SP). Só quando os DOIS existem: sem
  // valor importado ou sem valor na conta, CALA. Não é impedimento — é
  // conferência: no SUS quem paga é a tabela, então a divergência ou vira
  // excedente não pago (cobrança acima) ou conta menor que o devido (abaixo).
  const ref = valorReferencia(proc);
  if (ref != null && valorCobrado != null && Number.isFinite(valorCobrado)) {
    const dif = valorCobrado - ref;
    if (Math.abs(dif) >= TOLERANCIA_VALOR) {
      achados.push({
        regra: "valor",
        gravidade: GRAVIDADES.ATENCAO,
        texto: dif > 0
          ? `Valor cobrado (${brl(valorCobrado)}) acima da referência SIGTAP (${brl(ref)}) — o SUS paga pela tabela; o excedente de ${brl(dif)} não entra.`
          : `Valor cobrado (${brl(valorCobrado)}) abaixo da referência SIGTAP (${brl(ref)}) — a conta sai ${brl(-dif)} menor do que a tabela paga.`,
      });
    }
  }

  return achados;
}

/** Tem alguma glosa que IMPEDE o fechamento (não só atenção)? */
export function temImpedimento(achados = []) {
  return achados.some((a) => a?.gravidade === GRAVIDADES.IMPEDIMENTO);
}

// ── internos ────────────────────────────────────────────────

function diaUTC(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ""));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
}

function numOuNull(v) {
  if (v === null || v === undefined || v === "" || v === "-") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normSexo(s) {
  const t = String(s ?? "").trim().toUpperCase();
  if (t.startsWith("M")) return "M";
  if (t.startsWith("F")) return "F";
  return null;
}

function rotuloSexo(s) {
  const n = normSexo(s);
  return n === "M" ? "masculino" : n === "F" ? "feminino" : "—";
}

function cidLimpo(cid) {
  const t = String(cid ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return t || null;
}

function plural(n, sing, plur) {
  return n === 1 ? sing : plur;
}

/** Centavos → "R$ 1.234,56", só para o texto das glosas de valor. */
function brl(cent) {
  return (cent / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
