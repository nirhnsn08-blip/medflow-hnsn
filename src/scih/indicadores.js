// ═══════════════════════════════════════════════════════════
// SCIH — OS INDICADORES DE INFECÇÃO
//
// 🔴 TODA TAXA AQUI TEM DENOMINADOR, E É O DENOMINADOR QUE ENGANA.
// PAV por 1000 ventilador-dia, DOT por 1000 paciente-dia, ISC sobre o
// número de cirurgias DAQUELE tipo. Trocar o denominador não muda a
// aparência do painel — muda o número, e o número vira decisão de
// isolamento, de antibiótico e de bloqueio de sala.
//
// ⚠️ DENOMINADOR ZERO NÃO É TAXA ZERO: é taxa que não existe.
// Um mês sem nenhuma cesárea mostrando ISC "0%" diz que a cesárea está
// segura, quando o que houve foi nenhuma cesárea. Quem distingue é o
// `taxa` de ../util/formato.js — este módulo só não pode desfazer.
// ═══════════════════════════════════════════════════════════

import { taxa } from "../util/formato.js";
// Calcula todos os indicadores derivados de uma linha
export function calcIndic(r) {
  r = r || {};
  return {
    higiene: taxa(r.higiene_realizadas, r.higiene_oportunidades, 100),          // % adesão
    pav: taxa(r.pav_casos, r.ventilador_dia, 1000),                             // por 1000 vent-dia
    antimicrobiano: taxa(r.antimicrobiano_dot, r.pacientes_dia, 1000),          // DOT por 1000 pac-dia
    culturasPos: taxa(r.culturas_positivas, r.culturas_coletadas, 100),         // % positividade
    iscCesariana: taxa(r.isc_cesariana, r.cir_cesariana, 100),
    iscOftalmo: taxa(r.isc_oftalmo, r.cir_oftalmo, 100),
    iscArtroplastia: taxa(r.isc_artroplastia, r.cir_artroplastia, 100),
  };
}
