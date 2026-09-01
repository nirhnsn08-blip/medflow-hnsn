// ═══════════════════════════════════════════════════════════
// BLOCO CIRÚRGICO — AGENDA E CONFLITO DE SALA
//
// 🔴 `conflitosDeSala` É A BARREIRA CONTRA DUAS CIRURGIAS NA MESMA SALA.
// Duas equipes chegando ao mesmo tempo não é um transtorno de agenda: é
// paciente anestesiado esperando sala, ou cirurgia adiada com o paciente já
// em jejum.
//
// A sobreposição é aberta nas duas pontas (`ini < cf && ci < fim`): uma
// cirurgia que termina às 10h00 NÃO conflita com outra que começa às 10h00.
// Encostar não é sobrepor — e tratar como conflito bloquearia a agenda
// cheia, que é o normal de um centro cirúrgico.
//
// ⚠️ Cirurgia CANCELADA não conflita com nada: a sala está livre. E o
// `ignorarId` existe para editar uma cirurgia sem que ela conflite consigo
// mesma.
// ═══════════════════════════════════════════════════════════

import { horaMin } from "../util/datas.js";

// Cirurgias da mesma sala cujo intervalo previsto se sobrepõe ao informado
export function conflitosDeSala(cirurgias, sala, hora, duracaoMin, ignorarId) {
  if (!sala || !hora) return [];
  const ini = horaMin(hora), fim = ini + (Number(duracaoMin) || 60);
  return cirurgias.filter(c => {
    if (c.id === ignorarId || c.sala !== sala || c.status === "cancelada" || !c.hora_prevista) return false;
    const ci = horaMin(c.hora_prevista.slice(0, 5)), cf = ci + (c.duracao_prev_min || 60);
    return ini < cf && ci < fim;
  });
}

// ── Fase C: indicadores do Bloco Cirúrgico ──
export function diasUteisNoMes(ano, mes) {
  let n = 0;
  const d = new Date(ano, mes, 1);
  while (d.getMonth() === mes) { const dow = d.getDay(); if (dow >= 1 && dow <= 5) n++; d.setDate(d.getDate() + 1); }
  return n;
}
