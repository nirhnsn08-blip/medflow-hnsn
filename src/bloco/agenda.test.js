// ═══════════════════════════════════════════════════════════
// CONFLITO DE SALA CIRÚRGICA
//
// 🔴 É A BARREIRA CONTRA DUAS EQUIPES NA MESMA SALA.
// Não é transtorno de agenda: é paciente anestesiado esperando sala, ou
// cirurgia adiada com o paciente já em jejum desde a véspera.
//
// A regra falha nas duas direções, e as duas doem:
//   · deixar passar  → duas cirurgias marcadas no mesmo horário;
//   · apertar demais → agenda encostada vira "conflito" e o centro
//     cirúrgico não consegue marcar o dia cheio, que é o normal dele.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { conflitosDeSala, diasUteisNoMes } from "./agenda.js";

const cir = (id, sala, hora, dur = 60, status = "agendada") =>
  ({ id, sala, hora_prevista: hora, duracao_prev_min: dur, status });

const AGENDA = [
  cir(1, "SALA 1", "08:00", 120),   // 08:00 – 10:00
  cir(2, "SALA 1", "14:00", 60),    // 14:00 – 15:00
  cir(3, "SALA 2", "08:00", 120),   // outra sala
];

describe("🔴 sobreposição na mesma sala", () => {
  it("começar no meio de outra é conflito", () => {
    expect(conflitosDeSala(AGENDA, "SALA 1", "09:00", 60).map(c => c.id)).toEqual([1]);
  });

  it("terminar dentro de outra é conflito", () => {
    // 07:00–08:30 invade os 30 primeiros minutos da de 08:00.
    expect(conflitosDeSala(AGENDA, "SALA 1", "07:00", 90).map(c => c.id)).toEqual([1]);
  });

  it("engolir outra inteira é conflito", () => {
    // 07:00 + 120min = 09:00, que cobre o começo da cirurgia 1 (08:00–10:00).
    expect(conflitosDeSala(AGENDA, "SALA 1", "07:00", 120).map(c => c.id)).toEqual([1]);
  });

  it("uma janela longa pega TODAS as que atravessa", () => {
    // 07:00 + 500min = 15:20: cobre a de 08:00 e a de 14:00.
    expect(conflitosDeSala(AGENDA, "SALA 1", "07:00", 500).map(c => c.id)).toEqual([1, 2]);
  });

  it("⚠️ ENCOSTAR não é sobrepor", () => {
    // Uma termina às 10:00 e a outra começa às 10:00: a sala está livre.
    // Tratar isso como conflito impediria o centro cirúrgico de marcar o
    // dia cheio — que é o normal dele, não a exceção.
    expect(conflitosDeSala(AGENDA, "SALA 1", "10:00", 60)).toEqual([]);
    // E o contrário: terminar exatamente quando a outra começa.
    expect(conflitosDeSala(AGENDA, "SALA 1", "13:00", 60)).toEqual([]);
  });

  it("sala diferente nunca conflita", () => {
    expect(conflitosDeSala(AGENDA, "SALA 2", "09:00", 60).map(c => c.id)).toEqual([3]);
    expect(conflitosDeSala(AGENDA, "SALA 3", "09:00", 60)).toEqual([]);
  });
});

describe("🔴 o que NÃO ocupa sala", () => {
  it("cirurgia cancelada não conflita — a sala está livre", () => {
    const com = [...AGENDA, cir(9, "SALA 1", "11:00", 60, "cancelada")];
    expect(conflitosDeSala(com, "SALA 1", "11:00", 60)).toEqual([]);
  });

  it("cirurgia sem hora marcada não conflita", () => {
    // Sem horário não dá para dizer que ocupa a sala; travar a agenda por
    // causa dela esconderia o problema real, que é a hora faltando.
    const com = [...AGENDA, { id: 8, sala: "SALA 1", hora_prevista: null, status: "agendada" }];
    expect(conflitosDeSala(com, "SALA 1", "11:00", 60)).toEqual([]);
  });

  it("⚠️ `ignorarId`: editar uma cirurgia não a faz conflitar consigo mesma", () => {
    // Sem isso, reabrir a cirurgia 1 para mudar o material acusaria
    // conflito com ela própria e travaria a edição.
    expect(conflitosDeSala(AGENDA, "SALA 1", "08:00", 120, 1)).toEqual([]);
  });
});

describe("entrada incompleta não trava a tela", () => {
  it("sem sala ou sem hora devolve lista vazia", () => {
    expect(conflitosDeSala(AGENDA, "", "09:00", 60)).toEqual([]);
    expect(conflitosDeSala(AGENDA, "SALA 1", "", 60)).toEqual([]);
    expect(conflitosDeSala(AGENDA, null, null, 60)).toEqual([]);
  });

  it("duração ausente ou inválida vira uma hora", () => {
    // O padrão precisa existir: sem ele a janela viraria NaN e a comparação
    // sairia falsa SEMPRE — conflito nenhum, agenda livre para tudo.
    expect(conflitosDeSala(AGENDA, "SALA 1", "09:00").map(c => c.id)).toEqual([1]);
    expect(conflitosDeSala(AGENDA, "SALA 1", "09:00", "abc").map(c => c.id)).toEqual([1]);
    const semDur = [{ id: 7, sala: "SALA 1", hora_prevista: "09:00", status: "agendada" }];
    expect(conflitosDeSala(semDur, "SALA 1", "09:30", 30).map(c => c.id)).toEqual([7]);
  });

  it("hora com segundos (como o banco devolve) é lida certo", () => {
    // `cc_cirurgias.hora_prevista` é `time`, e volta "08:00:00".
    const comSeg = [{ id: 5, sala: "SALA 1", hora_prevista: "08:00:00", duracao_prev_min: 60, status: "agendada" }];
    expect(conflitosDeSala(comSeg, "SALA 1", "08:30", 30).map(c => c.id)).toEqual([5]);
  });
});

describe("diasUteisNoMes", () => {
  it("conta de segunda a sexta", () => {
    // Agosto/2026 começa num sábado e tem 31 dias: 21 dias úteis.
    expect(diasUteisNoMes(2026, 7)).toBe(21);
    // Fevereiro/2026 (28 dias, começa num domingo): 20 dias úteis.
    expect(diasUteisNoMes(2026, 1)).toBe(20);
  });

  it("⚠️ não conta sábado nem domingo", () => {
    // É o divisor do indicador de cirurgias por dia útil. Contar fim de
    // semana faria a produção do centro cirúrgico parecer menor do que é.
    for (let m = 0; m < 12; m++) {
      const d = diasUteisNoMes(2026, m);
      expect(d, `mês ${m}`).toBeGreaterThanOrEqual(20);
      expect(d, `mês ${m}`).toBeLessThanOrEqual(23);
    }
  });
});
