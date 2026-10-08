// ═══════════════════════════════════════════════════════════
// CIRURGIA SEGURA — a regra, fora da tela
//
// O checklist da OMS tem três momentos e o sistema guardava três booleanos.
// Esta camada existe para a tela saber o que pode mandar ANTES de mandar, e
// para que a mesma frase apareça na tela e no banco.
//
// ⚠️ ESTA NÃO É A DEFESA. As recusas de verdade estão no gatilho
// (`migracao-cirurgia-segura-registro.sql`), e é lá que elas valem para
// quem chamar a API direto. O que está aqui existe para a circulante
// descobrir na hora, e não depois de um erro vermelho — a mensagem é a
// mesma nos dois lugares, de propósito.
//
// 🔒 UMA DECISÃO DE DESENHO QUE VALE DIZER: não se trava a cirurgia.
// Travar a porta do bloco por campo de checklist inverteria a prioridade —
// há politrauma em choque, há cesárea de emergência. O que não pode é o
// pulo ser INVISÍVEL. Por isso pular é permitido, custa uma justificativa,
// e vira linha na mesma trilha. A adesão deixa de ser um percentual sem
// denominador explicável: cada ponto que falta tem nome, hora e motivo.
// ═══════════════════════════════════════════════════════════

import { CHECKLIST_OMS } from "./catalogo.js";

/** O mínimo que o banco aceita numa justificativa (`cc_chk_pulo_motivo_ck`). */
export const MOTIVO_MIN = 15;

/** As três fases, na ordem em que acontecem. */
export const FASES = Object.freeze(["sign_in", "time_out", "sign_out"]);

const texto = v => String(v ?? "").trim();
const num = v => (v === "" || v == null ? null : (Number.isFinite(Number(v)) ? Number(v) : NaN));

/**
 * Os itens de uma fase, no formato que vai para a trilha.
 *
 * Guarda o TEXTO do item, e não só quantos foram marcados. O catálogo muda
 * com o tempo (item novo, redação diferente), e um "6 de 7" guardado
 * sozinho não diz QUAL faltou — que é exatamente a pergunta de quem analisa
 * um evento depois.
 */
export function itensDaFase(fase, marcados = []) {
  const def = CHECKLIST_OMS[fase];
  if (!def) return [];
  return def.itens.map((t, i) => ({ t, ok: !!marcados[i] }));
}

/** Quantos itens foram confirmados. */
export function confirmados(marcados = []) {
  return marcados.filter(Boolean).length;
}

/**
 * A contagem fecha? `null` quando o par não foi informado — e `null` aqui
 * é "não contei", que é diferente de "bateu".
 */
export function contagemFecha({ inicial, final } = {}) {
  const a = num(inicial), b = num(final);
  if (a == null || b == null) return null;
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return a === b;
}

/**
 * Os pares de contagem do Sign Out que NÃO fecharam.
 *
 * Compressa, instrumental e agulha que entraram e não saíram: corpo
 * estranho retido é *never event*, e a contagem existe para a diferença
 * aparecer como NÚMERO, não como caixinha que ninguém desmarca.
 */
export function contagensQueNaoFecham(c = {}) {
  const pares = [
    ["compressas", c.compressas_inicial, c.compressas_final],
    ["instrumentais", c.instrumentais_inicial, c.instrumentais_final],
    ["agulhas", c.agulhas_inicial, c.agulhas_final],
  ];
  return pares
    .filter(([, i, f]) => contagemFecha({ inicial: i, final: f }) === false)
    .map(([nome, i, f]) => ({ nome, inicial: num(i), final: num(f) }));
}

/**
 * O que falta para registrar esta conferência. `null` = pode gravar.
 *
 * A ordem das recusas segue a do gatilho, para a frase bater.
 */
export function conferirRegistro({ cirurgia, fase, marcados = [], divergencia = "", contagem = {} } = {}) {
  if (!cirurgia?.id) return "Cirurgia inválida.";
  if (!CHECKLIST_OMS[fase]) return "Momento do checklist inválido.";
  if (texto(cirurgia.status) === "cancelada") {
    return "Esta cirurgia está CANCELADA. Não se registra conferência de segurança de um ato que não aconteceu.";
  }

  const def = CHECKLIST_OMS[fase];
  const total = def.itens.length;
  const ok = confirmados(marcados);
  const motivo = texto(divergencia);

  if (ok < total && motivo.length < MOTIVO_MIN) {
    const faltam = total - ok;
    return `Faltou confirmar ${faltam} de ${total} itens. Descreva o que não foi confirmado e como a equipe resolveu — ` +
           "checklist incompleto e calado parece completo para quem ler depois.";
  }

  if (fase === "sign_out") {
    const ci = num(contagem.compressas_inicial), cf = num(contagem.compressas_final);
    if (ci == null || cf == null || Number.isNaN(ci) || Number.isNaN(cf)) {
      return "O Sign Out exige a contagem de compressas (inicial e final). Corpo estranho retido é never event, " +
             "e a contagem existe para a diferença aparecer como número.";
    }
    const furos = contagensQueNaoFecham(contagem);
    if (furos.length && motivo.length < MOTIVO_MIN) {
      const lista = furos.map(f => `${f.nome} ${f.inicial}/${f.final}`).join(", ");
      return `A contagem NÃO fecha (${lista}). Isto não se registra como conferência normal: descreva o que foi feito — ` +
             "radiografia, nova busca, o que for.";
    }
  }
  return null;
}

/** O que falta para registrar um PULO. `null` = pode gravar. */
export function conferirPulo({ cirurgia, fase, motivo = "" } = {}) {
  if (!cirurgia?.id) return "Cirurgia inválida.";
  if (!CHECKLIST_OMS[fase]) return "Momento do checklist inválido.";
  if (texto(cirurgia.status) === "cancelada") {
    return "Esta cirurgia está CANCELADA.";
  }
  if (texto(motivo).length < MOTIVO_MIN) {
    return `Escreva por que o ${CHECKLIST_OMS[fase].label} está sendo pulado, com pelo menos ${MOTIVO_MIN} caracteres. ` +
           "Quem analisar um evento depois precisa entender a decisão — e \"urgência\" sozinho não explica nada.";
  }
  return null;
}

/**
 * O que a cirurgia ainda não conferiu, para a tela avisar ANTES do passo.
 *
 * Devolve a fase pendente do momento, ou `null`. Não trava nada: quem
 * decide é quem está na sala.
 */
export function pendenteAntesDe(cirurgia, passo) {
  const c = cirurgia || {};
  if (passo === "entrada_sala" && !c.chk_sign_in) return "sign_in";
  if (passo === "incisao" && !c.chk_time_out) return "time_out";
  if (passo === "rpa" && !c.chk_sign_out) return "sign_out";
  return null;
}

/**
 * A linha que vai para `cc_checklist`.
 *
 * Monta num lugar só porque o formato é contrato com o banco: nome de
 * coluna errado aqui vira INSERT recusado em silêncio, que é o defeito que
 * o `contrato-banco.test.js` existe para pegar.
 */
export function linhaDaConferencia({ cirurgia, fase, marcados = [], divergencia = "", contagem = {}, assinatura = null } = {}) {
  const def = CHECKLIST_OMS[fase] || { itens: [] };
  const corpo = {
    cirurgia_id: cirurgia?.id,
    tipo: "conferencia",
    fase,
    itens: itensDaFase(fase, marcados),
    itens_total: def.itens.length,
    itens_confirmados: confirmados(marcados),
    divergencia: texto(divergencia) || null,
    assinatura: assinatura || null,
  };
  if (fase === "sign_out") {
    for (const k of ["compressas", "instrumentais", "agulhas"]) {
      corpo[`${k}_inicial`] = num(contagem[`${k}_inicial`]);
      corpo[`${k}_final`] = num(contagem[`${k}_final`]);
    }
  }
  return corpo;
}

/** A linha de um PULO. Mesma trilha, `tipo` diferente, selo apagado. */
export function linhaDoPulo({ cirurgia, fase, motivo = "", assinatura = null } = {}) {
  return {
    cirurgia_id: cirurgia?.id,
    tipo: "pulo",
    fase,
    itens: [],
    itens_total: (CHECKLIST_OMS[fase]?.itens || []).length,
    itens_confirmados: 0,
    divergencia: texto(motivo),
    assinatura: assinatura || null,
  };
}

/**
 * O resumo da trilha para a linha da cirurgia.
 *
 * Sem isto, uma cirurgia com os três selos acesos e uma com três pulos
 * justificados ficariam idênticas na tela — e são opostas.
 */
export function resumoDaTrilha(linhas = []) {
  const lista = Array.isArray(linhas) ? linhas : [];
  if (!lista.length) return null;
  const pulos = lista.filter(l => l?.tipo === "pulo");
  const comDivergencia = lista.filter(l => l?.tipo === "conferencia" && texto(l.divergencia));
  return {
    total: lista.length,
    pulos: pulos.length,
    divergencias: comDivergencia.length,
    texto: [
      pulos.length ? `${pulos.length} momento(s) PULADO(s) com justificativa` : null,
      comDivergencia.length ? `${comDivergencia.length} com divergência registrada` : null,
    ].filter(Boolean).join(" · ") || null,
  };
}
