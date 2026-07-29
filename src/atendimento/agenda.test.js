// ═══════════════════════════════════════════════════════════
// AS REGRAS DA AGENDA
//
// Cinco coisas aqui protegem defeito que chega no paciente:
//
//   1. FUSO. `new Date("2026-07-29")` é meia-noite UTC e, no Brasil, volta
//      para o dia 28 — a grade da terça passaria a valer na segunda. Este
//      projeto já teve bug de fuso; aqui ele tem teste.
//   2. VAGA DA REGULAÇÃO NÃO É MARCADA AQUI. Marcar internamente numa vaga
//      do GERCON faz dois pacientes chegarem para o mesmo horário, e o
//      segundo descobre na porta.
//   3. COTA MAIOR QUE O RELÓGIO. Grade prometendo 15 vagas num período de
//      12 horários marcaria três pessoas para horário inexistente.
//   4. FALTA E CANCELAMENTO LIBERAM A VAGA — senão o horário morre e o
//      ambulatório atende menos do que pode.
//   5. ABSENTEÍSMO SEM MARCADOS É `null`, NÃO `NaN`. NaN aparece como campo
//      vazio, e o gestor lê como "nenhuma falta" — o oposto da verdade.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  ORIGENS_MARCACAO, diaCivil, diaSemanaDe, minutosDe, horariosDaGrade,
  totalVagasDaGrade, cotasSomadas, validarGrade, gradeValeEm, gradesDoDia,
  bloqueioDoDia, vagasDoDia, horariosLivres, podeMarcar, podeRegistrarDaRegulacao,
  producaoDoDia, ocupaVaga,
} from "./agenda.js";

// 2026-07-28 é uma TERÇA. dia_semana 2.
const TERCA = "2026-07-28";

const GRADE = {
  id: 1, especialidade_cod: "ortopedia", dia_semana: 2,
  hora_inicio: "08:00", hora_fim: "12:00", duracao_min: 20,
  vagas_regulacao: 6, vagas_internas: 4, vagas_chegada: 2,
  vigencia_inicio: "2026-01-01", ativo: true,
};

const agend = (over = {}) => ({
  data: TERCA, especialidade_cod: "ortopedia", origem_marcacao: "interna",
  status: "agendado", hora: "08:00", ...over,
});

describe("data e fuso", () => {
  it("dia civil é meia-noite LOCAL, não UTC", () => {
    const d = diaCivil("2026-07-28");
    expect(d.getDate()).toBe(28);
    expect(d.getMonth()).toBe(6);
  });

  it("28/07/2026 é terça (2) — e não segunda, como daria com parse UTC", () => {
    expect(diaSemanaDe("2026-07-28")).toBe(2);
  });

  it("aceita timestamp completo e ignora a hora", () => {
    expect(diaSemanaDe("2026-07-28T23:30:00Z")).toBe(2);
  });

  it("entrada inválida não vira data doida", () => {
    expect(diaCivil("banana")).toBeNull();
    expect(diaCivil("")).toBeNull();
    expect(diaCivil(null)).toBeNull();
    expect(diaSemanaDe("29/07/2026")).toBeNull();
  });

  it("hora inválida é null, não zero", () => {
    expect(minutosDe("08:30")).toBe(510);
    expect(minutosDe("08:30:00")).toBe(510);
    expect(minutosDe("25:00")).toBeNull();
    expect(minutosDe("08:99")).toBeNull();
    expect(minutosDe("")).toBeNull();
  });
});

describe("horários da grade", () => {
  it("08:00 às 12:00 de 20 em 20 dá 12 horários", () => {
    const h = horariosDaGrade(GRADE);
    expect(h).toHaveLength(12);
    expect(h[0]).toBe("08:00");
    expect(h[11]).toBe("11:40");
  });

  it("o último horário CABE inteiro no período", () => {
    // 11:40 + 20 = 12:00. Um horário às 11:50 terminaria 12:10, depois do fim.
    expect(horariosDaGrade(GRADE)).not.toContain("11:50");
  });

  it("período que não cabe uma consulta não gera horário", () => {
    expect(horariosDaGrade({ hora_inicio: "08:00", hora_fim: "08:10", duracao_min: 20 })).toEqual([]);
  });

  it("grade incoerente devolve lista vazia em vez de explodir", () => {
    expect(horariosDaGrade({})).toEqual([]);
    expect(horariosDaGrade({ hora_inicio: "12:00", hora_fim: "08:00", duracao_min: 20 })).toEqual([]);
    expect(horariosDaGrade(null)).toEqual([]);
  });
});

describe("validação da grade", () => {
  it("grade coerente passa", () => {
    const r = validarGrade(GRADE);
    expect(r.ok).toBe(true);
    expect(r.totalHorarios).toBe(12);
    expect(r.cotasSomadas).toBe(12);
  });

  it("RECUSA cota somando mais que o número de horários", () => {
    const r = validarGrade({ ...GRADE, vagas_regulacao: 10 });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/horário que não existe/);
  });

  it("avisa quando sobram horários sem dono", () => {
    const r = validarGrade({ ...GRADE, vagas_chegada: 0 });
    expect(r.ok).toBe(true);
    expect(r.avisos.join(" ")).toMatch(/sem dono/);
  });

  it("avisa quando ninguém pode marcar nem chegar", () => {
    const r = validarGrade({ ...GRADE, vagas_regulacao: 0, vagas_internas: 0, vagas_chegada: 0 });
    expect(r.avisos.join(" ")).toMatch(/ninguém consegue marcar/);
  });

  it("exige especialidade, dia da semana e horário", () => {
    expect(validarGrade({}).ok).toBe(false);
    expect(validarGrade({ ...GRADE, especialidade_cod: "" }).ok).toBe(false);
    expect(validarGrade({ ...GRADE, dia_semana: 9 }).ok).toBe(false);
    expect(validarGrade({ ...GRADE, hora_fim: "07:00" }).ok).toBe(false);
  });

  it("recusa duração fora do razoável", () => {
    expect(validarGrade({ ...GRADE, duracao_min: 1 }).ok).toBe(false);
    expect(validarGrade({ ...GRADE, duracao_min: 999 }).ok).toBe(false);
  });

  it("recusa vigência invertida", () => {
    const r = validarGrade({ ...GRADE, vigencia_inicio: "2026-06-01", vigencia_fim: "2026-01-01" });
    expect(r.ok).toBe(false);
  });
});

describe("a grade vale nesta data?", () => {
  it("vale na terça, não na quarta", () => {
    expect(gradeValeEm(GRADE, TERCA)).toBe(true);
    expect(gradeValeEm(GRADE, "2026-07-29")).toBe(false);
  });

  it("não vale antes do início da vigência", () => {
    expect(gradeValeEm({ ...GRADE, vigencia_inicio: "2026-08-01" }, TERCA)).toBe(false);
  });

  it("não vale depois do fim da vigência", () => {
    expect(gradeValeEm({ ...GRADE, vigencia_fim: "2026-06-30" }, TERCA)).toBe(false);
  });

  it("grade desligada não vale", () => {
    expect(gradeValeEm({ ...GRADE, ativo: false }, TERCA)).toBe(false);
  });

  it("gradesDoDia filtra a lista", () => {
    const outra = { ...GRADE, id: 2, dia_semana: 3 };
    expect(gradesDoDia([GRADE, outra], TERCA).map(g => g.id)).toEqual([1]);
  });
});

describe("bloqueios", () => {
  const feriado = { data_inicio: TERCA, data_fim: TERCA, motivo: "Feriado municipal" };
  const feriasOrto = { data_inicio: "2026-07-27", data_fim: "2026-07-31", especialidade_cod: "ortopedia", motivo: "Férias" };

  it("feriado sem especialidade bloqueia todo mundo", () => {
    expect(bloqueioDoDia([feriado], TERCA, { especialidade: "ortopedia" }).motivo).toMatch(/Feriado/);
    expect(bloqueioDoDia([feriado], TERCA, { especialidade: "urologia" })).toBeTruthy();
  });

  it("bloqueio de uma especialidade não atinge outra", () => {
    expect(bloqueioDoDia([feriasOrto], TERCA, { especialidade: "ortopedia" })).toBeTruthy();
    expect(bloqueioDoDia([feriasOrto], TERCA, { especialidade: "urologia" })).toBeNull();
  });

  it("fora do período não bloqueia", () => {
    expect(bloqueioDoDia([feriado], "2026-07-29", { especialidade: "ortopedia" })).toBeNull();
  });

  it("sem data não afirma bloqueio", () => {
    expect(bloqueioDoDia([feriado], null, {})).toBeNull();
  });
});

describe("vagas do dia", () => {
  it("conta ocupadas por dono", () => {
    const v = vagasDoDia(GRADE, TERCA, [
      agend({ origem_marcacao: "interna" }),
      agend({ origem_marcacao: "interna", hora: "08:20" }),
      agend({ origem_marcacao: "regulacao", hora: "08:40" }),
    ]);
    expect(v.interna).toEqual({ total: 4, ocupadas: 2, livres: 2 });
    expect(v.regulacao).toEqual({ total: 6, ocupadas: 1, livres: 5 });
    expect(v.chegada).toEqual({ total: 2, ocupadas: 0, livres: 2 });
  });

  it("FALTA e CANCELADO liberam a vaga", () => {
    const v = vagasDoDia(GRADE, TERCA, [
      agend({ status: "falta" }),
      agend({ status: "cancelado", hora: "08:20" }),
      agend({ status: "presente", hora: "08:40" }),
    ]);
    expect(v.interna.ocupadas).toBe(1);
    expect(ocupaVaga({ status: "falta" })).toBe(false);
    expect(ocupaVaga({ status: "presente" })).toBe(true);
  });

  it("agendamento de outro dia ou de outra especialidade não conta", () => {
    const v = vagasDoDia(GRADE, TERCA, [
      agend({ data: "2026-08-04" }),
      agend({ especialidade_cod: "urologia", hora: "08:20" }),
    ]);
    expect(v.interna.ocupadas).toBe(0);
  });

  it("horários livres excluem os tomados", () => {
    const livres = horariosLivres(GRADE, TERCA, [agend({ hora: "08:00" }), agend({ hora: "08:40" })]);
    expect(livres).not.toContain("08:00");
    expect(livres).not.toContain("08:40");
    expect(livres).toContain("08:20");
    expect(livres).toHaveLength(10);
  });
});

describe("podeMarcar — a regra central", () => {
  const base = { grade: GRADE, data: TERCA, hora: "08:00", origem: "interna", hoje: TERCA };

  it("marcação interna em vaga livre passa", () => {
    const r = podeMarcar(base);
    expect(r.ok).toBe(true);
    expect(r.erros).toEqual([]);
  });

  it("RECUSA marcar vaga da regulação", () => {
    expect(ORIGENS_MARCACAO.regulacao.marcavelAqui).toBe(false);
    const r = podeMarcar({ ...base, origem: "regulacao" });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/não é marcada aqui/i);
  });

  it("cota interna esgotada RECUSA — e explica que o resto é da regulação", () => {
    const cheios = ["08:00", "08:20", "08:40", "09:00"].map(h => agend({ hora: h }));
    const r = podeMarcar({ ...base, hora: "09:20", agendamentos: cheios });
    expect(r.ok).toBe(false);
    const txt = r.erros.join(" ");
    expect(txt).toMatch(/já estão ocupadas/);
    expect(txt).toMatch(/pertencem à regulação/);
  });

  it("horário já ocupado é recusado", () => {
    const r = podeMarcar({ ...base, agendamentos: [agend({ hora: "08:00" })] });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/já está ocupado/);
  });

  it("horário fora da grade é recusado", () => {
    const r = podeMarcar({ ...base, hora: "13:00" });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/não é um horário desta grade/);
  });

  it("dia sem grade é recusado", () => {
    const r = podeMarcar({ ...base, data: "2026-07-29" });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/Não há grade/);
  });

  it("dia bloqueado é recusado, com o motivo", () => {
    const r = podeMarcar({ ...base, bloqueios: [{ data_inicio: TERCA, data_fim: TERCA, motivo: "Feriado" }] });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/Feriado/);
  });

  it("fila de chegada não exige horário", () => {
    const r = podeMarcar({ ...base, origem: "chegada", hora: null });
    expect(r.ok).toBe(true);
  });

  it("fora da fila, horário é obrigatório", () => {
    const r = podeMarcar({ ...base, hora: null });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/Informe o horário/);
  });

  it("data passada AVISA, não impede — lançamento retroativo é legítimo", () => {
    const r = podeMarcar({ ...base, hoje: "2026-08-04" });
    expect(r.ok).toBe(true);
    expect(r.avisos.join(" ")).toMatch(/passado/);
  });

  it("origem desconhecida não passa", () => {
    expect(podeMarcar({ ...base, origem: "chute" }).ok).toBe(false);
  });

  it("sem grade nem data não explode", () => {
    expect(podeMarcar({}).ok).toBe(false);
    expect(podeMarcar({ grade: GRADE }).ok).toBe(false);
  });
});

describe("transcrever a lista da regulação", () => {
  const base = { grade: GRADE, data: TERCA, hora: "08:00", hoje: TERCA };

  it("com protocolo, a recepção REGISTRA o que a central marcou", () => {
    const r = podeRegistrarDaRegulacao({ ...base, protocolo: "GERCON-9988" });
    expect(r.ok).toBe(true);
  });

  it("SEM protocolo é recusado — seria ocupar cota da regulação", () => {
    const r = podeRegistrarDaRegulacao({ ...base, protocolo: "" });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/protocolo/i);
    expect(r.erros.join(" ")).toMatch(/paciente do hospital/);
  });

  it("protocolo só de espaço não conta como protocolo", () => {
    expect(podeRegistrarDaRegulacao({ ...base, protocolo: "   " }).ok).toBe(false);
  });

  it("as outras regras continuam valendo: horário tomado", () => {
    const r = podeRegistrarDaRegulacao({
      ...base, protocolo: "G-1",
      agendamentos: [agend({ hora: "08:00", origem_marcacao: "regulacao" })],
    });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/já está ocupado/);
  });

  it("as outras regras continuam valendo: dia bloqueado", () => {
    const r = podeRegistrarDaRegulacao({
      ...base, protocolo: "G-1",
      bloqueios: [{ data_inicio: TERCA, data_fim: TERCA, motivo: "Feriado" }],
    });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/Feriado/);
  });

  it("cota da regulação esgotada também recusa", () => {
    const cheios = ["08:00", "08:20", "08:40", "09:00", "09:20", "09:40"]
      .map(h => agend({ hora: h, origem_marcacao: "regulacao" }));
    const r = podeRegistrarDaRegulacao({ ...base, hora: "10:00", protocolo: "G-1", agendamentos: cheios });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/já estão ocupadas/);
  });

  it("NÃO reclama de a vaga ser da regulação — é o que ela autoriza", () => {
    const r = podeRegistrarDaRegulacao({ ...base, protocolo: "G-1" });
    expect(r.erros.join(" ")).not.toMatch(/não é marcada aqui/i);
  });
});

describe("produção do dia — o que hoje é digitado à mão", () => {
  const cenario = {
    grades: [GRADE], data: TERCA, bloqueios: [],
    agendamentos: [
      agend({ status: "presente", hora: "08:00", tipo_atendimento_cod: "primeira_consulta", origem_marcacao: "regulacao" }),
      agend({ status: "presente", hora: "08:20", tipo_atendimento_cod: "retorno" }),
      agend({ status: "falta", hora: "08:40", origem_marcacao: "regulacao" }),
      agend({ status: "cancelado", hora: "09:00" }),
      agend({ status: "agendado", hora: "09:20" }),
      agend({ status: "presente", hora: null, origem_marcacao: "chegada" }),
    ],
  };

  it("ofertadas vem da grade, não de digitação", () => {
    expect(producaoDoDia(cenario).ofertadas).toBe(12);
  });

  it("realizadas, faltas e cancelados saem do status", () => {
    const p = producaoDoDia(cenario);
    expect(p.realizadas).toBe(3);
    expect(p.faltas).toBe(1);
    expect(p.cancelados).toBe(1);
  });

  it("separa primeira consulta de retorno", () => {
    const p = producaoDoDia(cenario);
    expect(p.primeiras).toBe(1);
    expect(p.retornos).toBe(1);
    expect(p.porChegada).toBe(1);
  });

  it("absenteísmo é sobre quem foi MARCADO, não sobre quem chegou", () => {
    // marcados vivos ou faltosos: 08:00, 08:20, 08:40, 09:20 = 4 (a fila de
    // chegada não podia faltar a nada). 1 falta em 4 = 25%.
    expect(producaoDoDia(cenario).absenteismo).toBe(25);
  });

  it("sem ninguém marcado o absenteísmo é NULL, nunca NaN", () => {
    const p = producaoDoDia({ grades: [GRADE], data: TERCA, agendamentos: [] });
    expect(p.absenteismo).toBeNull();
    expect(Number.isNaN(p.absenteismo)).toBe(false);
  });

  it("dia bloqueado não oferta vaga", () => {
    const p = producaoDoDia({ ...cenario, bloqueios: [{ data_inicio: TERCA, data_fim: TERCA, motivo: "Feriado" }] });
    expect(p.ofertadas).toBe(0);
  });

  it("dia sem grade não oferta nada e não quebra", () => {
    const p = producaoDoDia({ grades: [GRADE], data: "2026-07-29", agendamentos: [] });
    expect(p.ofertadas).toBe(0);
    expect(p.realizadas).toBe(0);
  });
});
