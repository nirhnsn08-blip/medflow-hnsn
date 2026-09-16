// ═══════════════════════════════════════════════════════════
// O CONTEXTO CLÍNICO DO PACIENTE INTERNADO
//
// 🔴 POR QUE ISTO EXISTE, COM NOME E DATA
// Até 16/09/2026 o prontuário de internação montava o contexto do motor de
// alertas À MÃO, em DOIS lugares, e os dois escreviam `idade: null`:
//
//   NovaPrescricao.jsx       — os alertas ANTES de assinar
//   ProntuarioInternado.jsx  — os alertas da prescrição vigente
//
// Com a idade sempre nula, as regras de criança e de idoso nunca disparavam
// para paciente internado. E as duas cópias já discordavam entre si: uma
// passava o clearance renal da última aferição, a outra passava `null` —
// então o ajuste renal aparecia na prescrição assinada e SUMIA na tela onde
// o médico estava prescrevendo, que é onde ele serve.
//
// Agora as duas telas recebem o MESMO contexto, montado aqui, e ele passa
// pelo construtor único de `clinico/contexto.js`.
// ═══════════════════════════════════════════════════════════

import { contextoClinico } from "../clinico/contexto.js";
import { idadeDetalhada } from "../pacientes/identidade.js";

/**
 * Idade em anos completos, pela data de nascimento do cadastro.
 *
 * ⚠️ SÓ `data_nascimento`. O cadastro antigo guarda às vezes apenas o ano
 * (`ano_nascimento`), e "ano atual − ano" erra em até um ano para quem ainda
 * não fez aniversário. Na fronteira de 12 anos (criança) ou de 65 (idoso),
 * um ano de erro é o alerta que não sai. Sem a data, a idade é `null` — e o
 * motor avisa que a faixa etária não foi conferida, em vez de adivinhar.
 */
export function idadeEmAnos(paciente, hoje = new Date()) {
  const d = idadeDetalhada(paciente?.data_nascimento, hoje);
  return d ? d.anos : null;
}

/**
 * O contexto que o motor de alertas recebe no prontuário de internação.
 *
 *   paciente       a linha de `pacientes` (usa `data_nascimento`)
 *   alergias       o histórico de `pep_alergias`
 *   condicoes      `pep_condicoes` — "sonda" em alguma delas liga a regra
 *                  de não triturar
 *   clearanceRenal da última aferição de sinais vitais, se houver
 */
export function contextoDoInternado({ paciente, alergias, condicoes, clearanceRenal } = {}, hoje = new Date()) {
  const lista = Array.isArray(condicoes) ? condicoes : [];
  return contextoClinico({
    idade: idadeEmAnos(paciente, hoje),
    clearance_renal: clearanceRenal ?? null,
    em_sonda: lista.some(c => /sonda/i.test(c?.descricao || "")),
  }, alergias);
}
