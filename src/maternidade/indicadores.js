// ═══════════════════════════════════════════════════════════
// INDICADORES DA MATERNIDADE — motor puro
//
// Agrega o que já é gravado (partos, RNs) em indicadores gerenciais. O astro é
// o RELATÓRIO DE ROBSON: a taxa de cesárea POR GRUPO — o jeito que a OMS
// recomenda para entender de onde a cesárea vem, em vez de um número só.
//
// ⚠️ TAXA É NULL QUANDO NÃO HÁ DENOMINADOR. "0 de 0" não é 0% — é "ainda não
// dá para dizer". Devolver 0% num mês sem parto seria o falso-verde de sempre.
// Reusa os motores de parto e RN (uma régua só no sistema).
// ═══════════════════════════════════════════════════════════

import { avaliarHemorragia } from "./parto.js";
import { avaliarPeso, classificarIdadeGestacional, avaliarApgar } from "./recem_nascido.js";

/** num/den, ou null quando não há denominador (nada de fingir 0%). */
export function razao(num, den) {
  return den > 0 ? num / den : null;
}
const ehCesarea = via => via === "cesarea";
const noGrupo = (p, g) => Number(p?.robson) === g;

/**
 * Relatório de Robson (OMS). Para cada um dos 10 grupos: tamanho, taxa de
 * cesárea do grupo e a contribuição do grupo para a taxa GLOBAL. Os 10 grupos
 * saem sempre (mesmo com n=0), para a tabela ficar completa.
 *
 * @param partos linhas de mat_partos ({ robson, via, ... })
 */
export function relatorioRobson(partos = []) {
  const lista = Array.isArray(partos) ? partos : [];
  const total = lista.length;
  const cesareas = lista.filter(p => ehCesarea(p?.via)).length;

  const grupos = [];
  for (let g = 1; g <= 10; g++) {
    const doGrupo = lista.filter(p => noGrupo(p, g));
    const n = doGrupo.length;
    const cGrupo = doGrupo.filter(p => ehCesarea(p?.via)).length;
    grupos.push({
      grupo: g, n, cesareas: cGrupo,
      taxaGrupo: razao(cGrupo, n),          // cesáreas ÷ partos do grupo
      tamanhoRelativo: razao(n, total),      // partos do grupo ÷ total
      contribuicao: razao(cGrupo, total),    // cesáreas do grupo ÷ total (peso na taxa global)
    });
  }
  const semGrupo = lista.filter(p => !(Number(p?.robson) >= 1 && Number(p?.robson) <= 10)).length;
  return { grupos, total, cesareas, taxaGlobal: razao(cesareas, total), semGrupo };
}

/** Resumo dos partos: via, taxa de cesárea, hemorragia, natimortos. */
export function resumoPartos(partos = []) {
  const lista = Array.isArray(partos) ? partos : [];
  const total = lista.length;
  const cesareas = lista.filter(p => ehCesarea(p?.via)).length;
  const hem = lista.map(p => avaliarHemorragia({ perda_ml: p?.perda_sangue_ml, via: p?.via }));
  const comPerda = hem.filter(h => h.avaliado).length;
  const hemorragias = hem.filter(h => h.hemorragia).length;
  const natimortos = lista.filter(p => p?.rn_vivo === false).length;
  return {
    total, cesareas, vaginais: total - cesareas,
    taxaCesarea: razao(cesareas, total),
    hemorragias, comPerda, taxaHemorragia: razao(hemorragias, comPerda),
    natimortos,
  };
}

/** Resumo dos RNs: baixo peso, prematuridade e Apgar baixo no 5º min — cada
 *  um sobre o denominador do que FOI medido (não sobre o total cego). */
export function resumoRN(rns = []) {
  const lista = Array.isArray(rns) ? rns : [];
  const pesos = lista.map(r => avaliarPeso(r?.peso_g)).filter(p => p.avaliado);
  const igs = lista.map(r => classificarIdadeGestacional(r?.ig_capurro_semanas)).filter(x => x.avaliado);
  const apgars = lista.map(r => avaliarApgar(r?.apgar_5)).filter(a => a.valido);
  const baixoPeso = pesos.filter(p => p.baixoPeso).length;
  const prematuros = igs.filter(x => x.classe === "pretermo").length;
  const apgar5Baixo = apgars.filter(a => a.valor < 7).length;
  return {
    total: lista.length,
    baixoPeso, comPeso: pesos.length, taxaBaixoPeso: razao(baixoPeso, pesos.length),
    prematuros, comIG: igs.length, taxaPrematuridade: razao(prematuros, igs.length),
    apgar5Baixo, comApgar5: apgars.length, taxaApgar5Baixo: razao(apgar5Baixo, apgars.length),
  };
}
