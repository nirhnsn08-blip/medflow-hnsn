// ═══════════════════════════════════════════════════════════
// O CONTEXTO CLÍNICO DO PACIENTE — fonte única
//
// 🔴 POR QUE ISTO EXISTE, COM NOME E DATA
// Até 04/09/2026 o objeto que alimenta o motor de alertas era montado À MÃO
// em SETE lugares: uma vez no atendimento do PS e seis na Farmácia. Todos
// escreviam a mesma linha:
//
//     alergias: a.alergias        // ← o texto livre de `ps_atendimentos`
//
// E o prontuário, em dois lugares, escrevia outra:
//
//     alergias: textoAlergiasParaAlerta(registros)   // ← `pep_alergias`
//
// As duas leituras conviviam há semanas. O efeito: uma alergia a penicilina
// registrada no Paciente 360 — a mesma que sai impressa na PULSEIRA — não
// chegava ao bloqueio de prescrição do PS nem à conferência da Farmácia.
// A tela mostrava silêncio, e silêncio é indistinguível de "sem alergia".
//
// Agora há um construtor só. Quem monta contexto clínico passa por aqui.
//
// ⚠️ ALERGIA NÃO LIDA NÃO É "SEM ALERGIA". Se a consulta a `pep_alergias`
// não voltar, `alergiasIncertas` fica verdadeiro e o motor emite um alerta
// dizendo que as alergias NÃO foram conferidas. Sem isso, uma queda de rede
// silenciaria justamente a conferência que mata quando falha.
// ═══════════════════════════════════════════════════════════

import { FALHA, naoDeuParaLer } from "../util/leitura.js";
import { textoAlergiasParaAlerta } from "./alergias.js";

/**
 * Monta o contexto clínico que `analisarPrescricaoClinica` e `checarAlergia`
 * consomem.
 *
 * `atendimento` é a linha crua (de `ps_atendimentos` ou equivalente) e traz
 * os campos do episódio: idade, peso, função renal e hepática, sonda,
 * gestação, comorbidades e o campo LEGADO de alergia em texto livre.
 *
 * `registrosAlergia` é o histórico de `pep_alergias` do PACIENTE. As duas
 * fontes são fundidas por `textoAlergiasParaAlerta`, sem duplicar: o dado
 * estruturado vem primeiro (é ele que casa "Novalgina" com "Dipirona") e o
 * texto livre entra depois, para que prontuário antigo não suma da tela.
 */
export function contextoClinico(atendimento, registrosAlergia) {
  const a = atendimento || {};
  const vazio = v => v === "" || v == null;
  return {
    idade: vazio(a.idade) ? null : Number(a.idade),
    peso: vazio(a.peso) ? null : Number(a.peso),
    clearance_renal: vazio(a.clearance_renal) ? null : Number(a.clearance_renal),
    funcao_hepatica: a.funcao_hepatica || null,
    alergias: textoAlergiasParaAlerta(registrosAlergia, a.alergias || ""),
    em_sonda: !!a.em_sonda,
    gestante: !!a.gestante,
    comorbidades: Array.isArray(a.comorbidades) ? a.comorbidades : [],
    // 🔴 A leitura das alergias falhou? O motor precisa saber para AVISAR,
    // em vez de conferir contra uma lista vazia e não dizer nada.
    alergiasIncertas: naoDeuParaLer(registrosAlergia),
  };
}

/**
 * Índice de alergias por prontuário, para telas que mostram vários pacientes
 * de uma vez (a fila da Farmácia, o painel do PS).
 *
 * ⚠️ SE A LEITURA FALHOU, TODO PACIENTE FICA MARCADO COMO INCERTO. Devolver
 * um índice vazio faria cada paciente parecer sem alergia registrada — a
 * mentira mais cara deste sistema, multiplicada pelo tamanho da fila.
 */
export function alergiasPorProntuario(registros) {
  const falhou = naoDeuParaLer(registros);
  const idx = { falhou, por: {} };
  for (const r of (Array.isArray(registros) ? registros : [])) {
    if (!r || !r.prontuario) continue;
    (idx.por[r.prontuario] = idx.por[r.prontuario] || []).push(r);
  }
  return idx;
}

/**
 * Os registros de um paciente dentro do índice.
 *
 * ⚠️ ÍNDICE AUSENTE, FALHADO OU AINDA CARREGANDO devolvem a marca de falha —
 * nunca uma lista vazia, que o construtor leria como "perguntei e não há
 * nenhuma". Enquanto a consulta está no ar a tela diz que não conferiu, e é
 * a resposta certa: ela realmente não conferiu ainda.
 */
export function alergiasDoPaciente(indice, prontuario) {
  if (!indice || indice.falhou || indice.carregando) return FALHA;
  return indice.por[prontuario] || [];
}
