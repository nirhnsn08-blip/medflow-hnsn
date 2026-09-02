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
  ORIGENS_MARCACAO, diaCivil, diaSemanaDe, minutosDe, horariosDaGrade, validarGrade, gradeValeEm, gradesDoDia,
  bloqueioDoDia, vagasDoDia, horariosLivres, podeMarcar, podeRegistrarDaRegulacao,
  producaoDoDia, ocupaVaga, donoDaVaga, gradeParaChegada, agendamentosAtingidos,
  MOTIVOS_DE_FALTA, validarFalta, STATUS_AGENDAMENTO,
  MOTIVOS_DE_REMARCACAO, remarcacaoDeQuem, validarRemarcacao,
  cadeiaDeRemarcacao, esperaDesdeAOrigem,
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

  // Espelha a regra do `atendimentoAberto` (ciclo.js) com o sinal invertido:
  // o que o arquivo NÃO conhece continua ocupando a vaga. Oferecer de novo um
  // horário que talvez já tenha dono põe duas pessoas na mesma hora — e quem
  // veio de outra cidade descobre na porta. Reservar a mais alguém remarca.
  it("status desconhecido NÃO libera a vaga", () => {
    expect(ocupaVaga({ status: "confirmado" })).toBe(true);
    expect(ocupaVaga({ status: "reagendado" })).toBe(true);
    expect(ocupaVaga({})).toBe(true);
    const v = vagasDoDia(GRADE, TERCA, [agend({ status: "estado_que_ninguem_previu" })]);
    expect(v.interna.ocupadas).toBe(1);
  });

  // 🔴 A vaga era da ESPECIALIDADE. Dois oftalmologistas às terças 08:00 era
  // impossível: o banco recusava o segundo, e o card da Dra. B mostrava a
  // cota consumida pelo Dr. A. A chave aqui tem que ser IDÊNTICA à do índice
  // `ag_agend_vaga_unica_prof` — tela e banco contando diferente fazem a
  // recepcionista ver "livre", clicar, e levar uma recusa sem explicação.
  describe("a vaga é do profissional, não da especialidade", () => {
    const gradeA = { ...GRADE, id: 10, profissional_username: "dr.a" };
    const gradeB = { ...GRADE, id: 11, profissional_username: "dra.b" };

    it("o horário de um médico não é o horário do outro", () => {
      const soDoA = [agend({ profissional_username: "dr.a", hora: "08:00" })];
      expect(horariosLivres(gradeA, TERCA, soDoA)).not.toContain("08:00");
      expect(horariosLivres(gradeB, TERCA, soDoA)).toContain("08:00");
    });

    it("a cota de um não come a do outro", () => {
      const doA = [
        agend({ profissional_username: "dr.a", hora: "08:00" }),
        agend({ profissional_username: "dr.a", hora: "08:20" }),
      ];
      expect(vagasDoDia(gradeA, TERCA, doA).interna.ocupadas).toBe(2);
      expect(vagasDoDia(gradeB, TERCA, doA).interna.ocupadas).toBe(0);
      expect(vagasDoDia(gradeB, TERCA, doA).interna.livres).toBe(4);
    });

    it("grade SEM profissional continua valendo pela especialidade", () => {
      // É o comportamento antigo, e ele tem que sobreviver: nada que
      // funciona hoje pode passar a falhar.
      const semDono = [agend({ hora: "08:00" })];
      expect(horariosLivres(GRADE, TERCA, semDono)).not.toContain("08:00");
      expect(vagasDoDia(GRADE, TERCA, semDono).interna.ocupadas).toBe(1);
    });

    it("agendamento sem profissional NÃO ocupa a vaga de um médico nomeado", () => {
      const semDono = [agend({ hora: "08:00" })];
      expect(horariosLivres(gradeA, TERCA, semDono)).toContain("08:00");
    });

    it("o dono da vaga distingue username de código de especialidade", () => {
      // sem os prefixos, um username igual a um código misturaria as chaves
      expect(donoDaVaga({ profissional_username: "ortopedia" }))
        .not.toBe(donoDaVaga({ especialidade_cod: "ortopedia" }));
    });
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

  // 🔴 A Recepção já recusava abrir atendimento de paciente com óbito
  // registrado; a Agenda deixava MARCAR consulta para a mesma pessoa. Duas
  // telas do mesmo módulo discordando sobre o mesmo fato — e aqui quem recebe
  // o telefonema de confirmação da véspera é a família.
  // O desfecho de tudo isto, na regra que a tela chama: o segundo médico da
  // mesma especialidade PASSA a caber no mesmo horário — e o mesmo médico
  // continua não cabendo duas vezes.
  it("dois médicos da mesma especialidade cabem no mesmo horário", () => {
    const gradeA = { ...GRADE, id: 10, profissional_username: "dr.a" };
    const gradeB = { ...GRADE, id: 11, profissional_username: "dra.b" };
    const doA = [agend({ profissional_username: "dr.a", hora: "08:00" })];

    expect(podeMarcar({ ...base, grade: gradeB, agendamentos: doA }).ok).toBe(true);
    const mesmoMedico = podeMarcar({ ...base, grade: gradeA, agendamentos: doA });
    expect(mesmoMedico.ok).toBe(false);
    expect(mesmoMedico.erros.join(" ")).toMatch(/já está ocupado/i);
  });

  it("RECUSA marcar para paciente com óbito registrado", () => {
    const r = podeMarcar({ ...base, paciente: { prontuario: "T1", obito: true } });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/óbito/i);
  });

  it("a recusa por óbito atravessa a transcrição da regulação", () => {
    const r = podeRegistrarDaRegulacao({
      ...base, origem: "regulacao", protocolo: "GERCON-123",
      paciente: { prontuario: "T1", obito: true },
    });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/óbito/i);
  });

  it("sem o cadastro em mãos, a conferência de vaga segue normal", () => {
    // `paciente` é opcional: quem só quer saber se o horário está livre não
    // recebe um erro falso de "sem paciente".
    expect(podeMarcar({ ...base, paciente: null }).ok).toBe(true);
    expect(podeMarcar({ ...base, paciente: { prontuario: "T1", obito: false } }).ok).toBe(true);
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

// 🔴 Quem chegava sem ter marcado abria atendimento e NÃO entrava na produção:
// o relatório do mês conta agendamentos, e esse episódio não tinha um. O
// número saía menor que a realidade, em silêncio.
describe("a fila de chegada — quem veio sem marcar", () => {
  const comChegada = { ...GRADE, vagas_chegada: 2 };

  it("acha a grade do dia da especialidade", () => {
    const r = gradeParaChegada({ grades: [comChegada], data: TERCA, especialidade: "ortopedia" });
    expect(r.ok).toBe(true);
    expect(r.grade.id).toBe(comChegada.id);
  });

  it("sem grade publicada, diz POR QUE — a tela precisa explicar", () => {
    const r = gradeParaChegada({ grades: [], data: TERCA, especialidade: "ortopedia" });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("sem_grade");
    expect(r.grade).toBeNull();
  });

  it("outra especialidade não serve", () => {
    expect(gradeParaChegada({ grades: [comChegada], data: TERCA, especialidade: "oftalmologia" }).motivo).toBe("sem_grade");
  });

  it("dia bloqueado não recebe chegada", () => {
    const r = gradeParaChegada({
      grades: [comChegada], data: TERCA, especialidade: "ortopedia",
      bloqueios: [{ data_inicio: TERCA, data_fim: TERCA, motivo: "Feriado" }],
    });
    expect(r.motivo).toBe("sem_grade");
  });

  it("cota de chegada esgotada é 'sem_cota', não 'sem_grade' — são coisas diferentes", () => {
    const cheios = [agend({ origem_marcacao: "chegada", hora: null }), agend({ origem_marcacao: "chegada", hora: null })];
    const r = gradeParaChegada({ grades: [comChegada], data: TERCA, especialidade: "ortopedia", agendamentos: cheios });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("sem_cota");
    // a grade VEM junto: a tela diz "esta grade está cheia", não "não há grade"
    expect(r.grade).toBeTruthy();
  });

  it("com dois profissionais, quem ainda tem cota recebe", () => {
    const a = { ...comChegada, id: 20, profissional_username: "dr.a" };
    const b = { ...comChegada, id: 21, profissional_username: "dra.b" };
    const soDoA = [
      agend({ origem_marcacao: "chegada", hora: null, profissional_username: "dr.a" }),
      agend({ origem_marcacao: "chegada", hora: null, profissional_username: "dr.a" }),
    ];
    const r = gradeParaChegada({ grades: [a, b], data: TERCA, especialidade: "ortopedia", agendamentos: soDoA });
    expect(r.ok).toBe(true);
    expect(r.grade.id).toBe(21);
  });
});

// 🔴 O bloqueio impedia MARCAR daqui para a frente e não olhava para trás.
// "Congresso do ortopedista, quinta" deixava os doze pacientes já marcados
// naquela quinta com status `agendado`, aparecendo no dia como se nada
// tivesse acontecido — e eles vêm de outra cidade encontrar a porta fechada.
describe("bloqueio: quem já está marcado no período", () => {
  const ag = (over = {}) => agend({ data: TERCA, hora: "08:00", ...over });

  it("acha quem está marcado no período bloqueado", () => {
    const r = agendamentosAtingidos({
      agendamentos: [ag(), ag({ hora: "08:20" })],
      bloqueio: { data_inicio: TERCA, data_fim: TERCA, motivo: "Congresso" },
    });
    expect(r).toHaveLength(2);
  });

  it("fora do período não é atingido", () => {
    const r = agendamentosAtingidos({
      agendamentos: [ag({ data: "2026-07-27" }), ag({ data: "2026-07-29" })],
      bloqueio: { data_inicio: TERCA, data_fim: TERCA, motivo: "x" },
    });
    expect(r).toEqual([]);
  });

  it("falta e cancelado não são atingidos — já não esperam ninguém", () => {
    const r = agendamentosAtingidos({
      agendamentos: [ag({ status: "falta" }), ag({ status: "cancelado", hora: "08:20" }), ag({ hora: "08:40" })],
      bloqueio: { data_inicio: TERCA, data_fim: TERCA, motivo: "x" },
    });
    expect(r).toHaveLength(1);
    expect(r[0].hora).toBe("08:40");
  });

  it("bloqueio de UMA especialidade não atinge a outra", () => {
    const r = agendamentosAtingidos({
      agendamentos: [ag(), ag({ especialidade_cod: "urologia", hora: "08:20" })],
      bloqueio: { data_inicio: TERCA, data_fim: TERCA, especialidade_cod: "ortopedia", motivo: "Férias" },
    });
    expect(r).toHaveLength(1);
    expect(r[0].especialidade_cod).toBe("ortopedia");
  });

  it("bloqueio de UM profissional não atinge o colega", () => {
    // É o caso que o campo novo destrava: "o Dr. X está de férias mas a
    // Dra. Y atende". Antes só dava para bloquear a especialidade inteira,
    // o que zerava a produção da colega.
    const r = agendamentosAtingidos({
      agendamentos: [ag({ profissional_username: "dr.a" }), ag({ profissional_username: "dra.b", hora: "08:20" })],
      bloqueio: { data_inicio: TERCA, data_fim: TERCA, profissional_username: "dr.a", motivo: "Férias" },
    });
    expect(r).toHaveLength(1);
    expect(r[0].profissional_username).toBe("dr.a");
  });

  it("feriado sem especialidade nem profissional atinge todo mundo", () => {
    const r = agendamentosAtingidos({
      agendamentos: [ag({ especialidade_cod: "ortopedia" }), ag({ especialidade_cod: "urologia", hora: "08:20" })],
      bloqueio: { data_inicio: TERCA, data_fim: TERCA, motivo: "Feriado municipal" },
    });
    expect(r).toHaveLength(2);
  });

  it("período incompleto não afirma nada", () => {
    expect(agendamentosAtingidos({ agendamentos: [ag()], bloqueio: { motivo: "x" } })).toEqual([]);
    expect(agendamentosAtingidos({})).toEqual([]);
  });
});

// 🔴 A tela exibia um KPI de ABSENTEÍSMO e o hospital não tinha como agir
// sobre ele: não existia confirmação da véspera (a alavanca que de fato
// derruba o número) nem motivo na falta (sem causa não há o que corrigir).
describe("confirmação da véspera e motivo da falta", () => {
  it("confirmado OCUPA a vaga — quem confirmou é quem mais vem", () => {
    // Se não ocupasse, o horário voltaria a aceitar outra pessoa. O índice
    // único do banco precisa da MESMA regra: sem 'confirmado' no filtro
    // parcial, o dano é exatamente o que o índice existe para impedir.
    expect(STATUS_AGENDAMENTO.confirmado.vivo).toBe(true);
    expect(ocupaVaga({ status: "confirmado" })).toBe(true);
    const v = vagasDoDia(GRADE, TERCA, [agend({ status: "confirmado" })]);
    expect(v.interna.ocupadas).toBe(1);
    expect(horariosLivres(GRADE, TERCA, [agend({ status: "confirmado" })])).not.toContain("08:00");
  });

  it("confirmado conta como marcado no absenteísmo, não como falta", () => {
    const p = producaoDoDia({
      grades: [GRADE], data: TERCA,
      agendamentos: [agend({ status: "confirmado" }), agend({ status: "falta", hora: "08:20" })],
    });
    expect(p.faltas).toBe(1);
    expect(p.marcados).toBe(2);
  });

  it("falta sem motivo é recusada — e a mensagem diz por quê", () => {
    const r = validarFalta("");
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/motivo/i);
    expect(validarFalta(null).ok).toBe(false);
    expect(validarFalta("   ").ok).toBe(false);
  });

  it("motivo inventado é recusado", () => {
    expect(validarFalta("xpto").ok).toBe(false);
  });

  it("os motivos cobrem o que pede resposta DIFERENTE do hospital", () => {
    const chaves = MOTIVOS_DE_FALTA.map(m => m.chave);
    expect(chaves).toContain("transporte");     // problema da rede, não do paciente
    expect(chaves).toContain("nao_era_falta");  // óbito / resolveu em outro serviço
    // Lista curta de propósito: quinze opções fazem escolher a primeira.
    expect(MOTIVOS_DE_FALTA.length).toBeLessThanOrEqual(6);
    for (const m of MOTIVOS_DE_FALTA) expect(m.acao).toBeTruthy();
  });

  it("cada motivo válido passa e sai normalizado", () => {
    for (const m of MOTIVOS_DE_FALTA) {
      expect(validarFalta(` ${m.chave} `)).toEqual({ ok: true, valor: m.chave });
    }
  });
});

// ═══════════════════════════════════════════════════════════
// REMARCAÇÃO — o elo que não existia
//
// Remarcar era cancelar e marcar de novo, à mão, sem vínculo. Três coisas
// se perdiam no meio, e nenhuma delas dava erro:
//
//   DE QUEM FOI. "Cancelar" pedia motivo em texto livre — "médico de
//   licença" e "o paciente pediu outro dia" viravam a mesma coisa. Quantas
//   vezes o HOSPITAL empurrou o paciente é o único número deste conjunto
//   sobre o qual o hospital manda, e não existia.
//
//   A ESPERA REAL. Quem foi empurrado de março para junho aparecia como
//   "marcado há 5 dias". A fila de espera do hospital parecia curta porque
//   o relógio era zerado a cada remarque.
//
//   A PESSOA. Três remarcações de um paciente eram indistinguíveis de três
//   pacientes diferentes.
// ═══════════════════════════════════════════════════════════

describe("motivos de remarcação — a distinção que muda o indicador", () => {
  it("cada motivo diz DE QUEM foi", () => {
    for (const m of MOTIVOS_DE_REMARCACAO)
      expect(["hospital", "paciente"], m.chave).toContain(m.deQuem);
  });

  it("existe pelo menos um de cada lado — senão a distinção não separa nada", () => {
    const lados = new Set(MOTIVOS_DE_REMARCACAO.map(m => m.deQuem));
    expect(lados.has("hospital")).toBe(true);
    expect(lados.has("paciente")).toBe(true);
  });

  it("motivo desconhecido não vira lado nenhum", () => {
    expect(remarcacaoDeQuem("hospital_profissional")).toBe("hospital");
    expect(remarcacaoDeQuem("paciente_pediu")).toBe("paciente");
    expect(remarcacaoDeQuem("qualquer_coisa")).toBe(null);
    expect(remarcacaoDeQuem("")).toBe(null);
    expect(remarcacaoDeQuem(null)).toBe(null);
  });
});

describe("validarRemarcacao", () => {
  const agendado = { id: 10, prontuario: "T9001", status: "agendado", data: "2026-09-14" };

  it("agendado e confirmado podem ser remarcados", () => {
    for (const status of ["agendado", "confirmado"]) {
      const r = validarRemarcacao({ original: { ...agendado, status }, motivo: "hospital_agenda" });
      expect(r.ok, status).toBe(true);
    }
  });

  it("🔴 FALTA pode ser remarcada — é o caso mais comum do balcão", () => {
    // A pessoa não veio, liga no dia seguinte e é reencaixada. A falta
    // ANTERIOR continua contando; o elo não a apaga.
    const r = validarRemarcacao({ original: { ...agendado, status: "falta" }, motivo: "paciente_faltou" });
    expect(r.ok).toBe(true);
    expect(r.deQuem).toBe("paciente");
  });

  it("🔴 PRESENTE não se remarca — o paciente já foi atendido", () => {
    const r = validarRemarcacao({ original: { ...agendado, status: "presente" }, motivo: "hospital_agenda" });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/já foi atendido/i);
  });

  it("🔴 CANCELADO não se remarca — duas correntes saindo do mesmo ponto", () => {
    const r = validarRemarcacao({ original: { ...agendado, status: "cancelado" }, motivo: "hospital_agenda" });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/já foi cancelado/i);
  });

  it("vaga reservada SEM paciente não se remarca — ela volta inteira para a fila", () => {
    const r = validarRemarcacao({ original: { id: 10, status: "agendado" }, motivo: "hospital_agenda" });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/sem paciente/i);
  });

  it("motivo é obrigatório, e o erro diz POR QUE", () => {
    const r = validarRemarcacao({ original: agendado, motivo: "" });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/hospital desmarcou/i);
  });

  it("motivo inventado é recusado", () => {
    expect(validarRemarcacao({ original: agendado, motivo: "porque_sim" }).ok).toBe(false);
  });

  it("não explode sem nada", () => {
    expect(() => validarRemarcacao()).not.toThrow();
    expect(validarRemarcacao().ok).toBe(false);
  });
});

describe("cadeiaDeRemarcacao", () => {
  // Um paciente marcado em março, empurrado duas vezes pelo hospital e uma
  // pela própria vontade, atendido em junho.
  const corrente = [
    { id: 1, prontuario: "T9001", data: "2026-03-10" },
    { id: 2, prontuario: "T9001", data: "2026-04-15", remarcado_de: 1, remarcacao_motivo: "hospital_profissional" },
    { id: 3, prontuario: "T9001", data: "2026-05-02", remarcado_de: 2, remarcacao_motivo: "paciente_pediu" },
    { id: 4, prontuario: "T9001", data: "2026-06-20", remarcado_de: 3, remarcacao_motivo: "hospital_estrutura" },
    // ruído: outro paciente, outra corrente
    { id: 9, prontuario: "T9002", data: "2026-06-20" },
  ];

  it("reconstrói a corrente do mais antigo para o mais novo", () => {
    const c = cadeiaDeRemarcacao(corrente, 4);
    expect(c.elos.map(a => a.id)).toEqual([1, 2, 3, 4]);
    expect(c.origem.data).toBe("2026-03-10");
    expect(c.vezes).toBe(3);
  });

  it("🔴 separa quem empurrou — é a parte que o hospital pode consertar", () => {
    const c = cadeiaDeRemarcacao(corrente, 4);
    expect(c.porHospital).toBe(2);
    expect(c.porPaciente).toBe(1);
  });

  it("agendamento sem remarcação é uma corrente de um elo só", () => {
    const c = cadeiaDeRemarcacao(corrente, 9);
    expect(c.vezes).toBe(0);
    expect(c.origem.id).toBe(9);
    expect(c.porHospital + c.porPaciente).toBe(0);
  });

  it("id que não está na lista devolve corrente vazia, não erro", () => {
    const c = cadeiaDeRemarcacao(corrente, 777);
    expect(c.elos).toEqual([]);
    expect(c.origem).toBe(null);
    expect(c.vezes).toBe(0);
  });

  it("🔴 CICLO não trava a tela", () => {
    // Um elo apontando para si mesmo, ou uma corrente que volta para trás,
    // giraria para sempre. Agenda que não carrega é agenda que ninguém usa:
    // prefere parar e devolver o que já tem.
    const proprio = [{ id: 1, data: "2026-03-10", remarcado_de: 1 }];
    expect(() => cadeiaDeRemarcacao(proprio, 1)).not.toThrow();
    expect(cadeiaDeRemarcacao(proprio, 1).vezes).toBe(0);

    const laco = [
      { id: 1, data: "2026-03-10", remarcado_de: 2 },
      { id: 2, data: "2026-04-10", remarcado_de: 1 },
    ];
    expect(() => cadeiaDeRemarcacao(laco, 2)).not.toThrow();
  });

  it("elo fora da lista carregada para a corrente sem inventar", () => {
    // A agenda carrega um dia por vez; o elo anterior pode estar em outro
    // mês. Melhor a corrente curta e honesta do que um buraco preenchido.
    const soOFim = [{ id: 4, data: "2026-06-20", remarcado_de: 3 }];
    const c = cadeiaDeRemarcacao(soOFim, 4);
    expect(c.elos.map(a => a.id)).toEqual([4]);
    expect(c.origem.id).toBe(4);
  });

  it("não explode com lista vazia nem com lixo", () => {
    expect(() => cadeiaDeRemarcacao()).not.toThrow();
    expect(() => cadeiaDeRemarcacao([null, undefined, {}], 1)).not.toThrow();
  });
});

describe("esperaDesdeAOrigem — o número que a remarcação apagava", () => {
  const corrente = [
    { id: 1, data: "2026-03-10" },
    { id: 2, data: "2026-06-20", remarcado_de: 1 },
  ];

  it("🔴 conta da PRIMEIRA marcação, não da última", () => {
    const c = cadeiaDeRemarcacao(corrente, 2);
    expect(esperaDesdeAOrigem(c, "2026-06-20")).toBe(102);
    // e a leitura ingênua, da última marcação, daria zero
    expect(esperaDesdeAOrigem(cadeiaDeRemarcacao([corrente[1]], 2), "2026-06-20")).toBe(0);
  });

  it("null quando não dá para saber — e null NÃO é zero", () => {
    // Zero seria "marcou hoje", a leitura mais otimista possível de um dado
    // que está faltando.
    const c = cadeiaDeRemarcacao(corrente, 2);
    expect(esperaDesdeAOrigem(c, "")).toBe(null);
    expect(esperaDesdeAOrigem(c, "não é data")).toBe(null);
    expect(esperaDesdeAOrigem({ origem: null }, "2026-06-20")).toBe(null);
    expect(esperaDesdeAOrigem(null, "2026-06-20")).toBe(null);
  });

  it("data civil não passa por fuso — o bug que já trocou o dia da grade", () => {
    const c = cadeiaDeRemarcacao([{ id: 1, data: "2026-03-01" }], 1);
    expect(esperaDesdeAOrigem(c, "2026-03-02")).toBe(1);
    expect(esperaDesdeAOrigem(c, "2026-03-01")).toBe(0);
  });
});

// 🔴 A CORRENTE NÃO TROCA DE PESSOA NO MEIO.
//
// Achado percorrendo a tela: a busca de paciente fica aberta durante a
// remarcação, porque é o mesmo formulário de marcar. Dava para procurar
// OUTRO nome ali e ligar o agendamento de quem foi empurrado ao prontuário
// de um terceiro. A partir dali, "quantas vezes esta pessoa foi remarcada"
// responde sobre duas pessoas ao mesmo tempo — e não há como desfazer sem
// saber qual era qual.
describe("remarcação não troca de paciente", () => {
  const original = { id: 10, prontuario: "T9001", status: "agendado", data: "2026-09-14" };

  it("o mesmo prontuário passa", () => {
    const r = validarRemarcacao({ original, motivo: "paciente_pediu", prontuarioNovo: "T9001" });
    expect(r.ok).toBe(true);
  });

  it("prontuário em branco passa — a origem é quem manda", () => {
    // A tela pode não repetir o prontuário; quem grava usa o da origem.
    for (const vazio of ["", null, undefined, "   "])
      expect(validarRemarcacao({ original, motivo: "paciente_pediu", prontuarioNovo: vazio }).ok).toBe(true);
  });

  it("🔴 prontuário DIFERENTE é recusado, e o erro diz o que fazer", () => {
    const r = validarRemarcacao({ original, motivo: "paciente_pediu", prontuarioNovo: "T9002" });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/T9001/);
    expect(r.erros.join(" ")).toMatch(/consulta nova/i);
  });

  it("origem sem prontuário não inventa conflito", () => {
    // Vaga reservada sem nome já é recusada por outro motivo; este teste
    // garante que a conferência nova não acrescenta um erro confuso.
    const r = validarRemarcacao({ original: { id: 10, status: "agendado" }, motivo: "paciente_pediu", prontuarioNovo: "T9002" });
    expect(r.erros.some(e => /não de T9002|liga o histórico/i.test(e))).toBe(false);
  });
});

// 🔴 A REMARCAÇÃO NÃO CHEGAVA A INDICADOR NENHUM.
//
// O #128 passou a gravar o elo e o lado (hospital × paciente), e o relatório
// do mês continuava mostrando só "cancelados" — uma remarcação aparecia ali,
// ao lado de quem simplesmente desistiu. Sumia justamente "quantas vezes o
// HOSPITAL empurrou o paciente", que é o único número deste conjunto sobre o
// qual o hospital manda.
describe("producaoDoDia conta as remarcações", () => {
  const grade = {
    especialidade_cod: "ORT", dia_semana: 3, hora_inicio: "08:00", hora_fim: "12:00",
    duracao_min: 20, vagas_internas: 6, ativa: true,
  };
  const vaga = (over = {}) => ({
    data: "2026-09-02", status: "agendado", origem_marcacao: "interna", ...over,
  });
  const producao = agendamentos =>
    producaoDoDia({ grades: [grade], data: "2026-09-02", agendamentos });

  it("🔴 conta pelo lado NOVO, separando quem empurrou", () => {
    const p = producao([
      vaga(),
      vaga({ remarcado_de: 9, remarcacao_motivo: "hospital_profissional" }),
      vaga({ remarcado_de: 8, remarcacao_motivo: "hospital_estrutura" }),
      vaga({ remarcado_de: 7, remarcacao_motivo: "paciente_pediu" }),
    ]);
    expect(p.remarcados).toBe(3);
    expect(p.remarcadosPeloHospital).toBe(2);
  });

  it("dia sem remarcação nenhuma dá zero, não indefinido", () => {
    // Campo ausente no relatório vira célula vazia, que o gestor lê como
    // "não tem dado" em vez de "não aconteceu".
    const p = producao([vaga(), vaga()]);
    expect(p.remarcados).toBe(0);
    expect(p.remarcadosPeloHospital).toBe(0);
  });

  it("remarcação com motivo desconhecido conta, mas não como do hospital", () => {
    // Registro antigo ou motivo que saiu do catálogo: o elo existe e vale,
    // mas atribuir ao hospital sem prova inflaria o número que ele usa para
    // se cobrar.
    const p = producao([vaga({ remarcado_de: 9, remarcacao_motivo: null })]);
    expect(p.remarcados).toBe(1);
    expect(p.remarcadosPeloHospital).toBe(0);
  });

  it("cancelado e remarcado são coisas diferentes", () => {
    const p = producao([
      vaga({ status: "cancelado" }),
      vaga({ remarcado_de: 9, remarcacao_motivo: "hospital_agenda" }),
    ]);
    expect(p.cancelados).toBe(1);
    expect(p.remarcados).toBe(1);
  });

  it("remarcação de OUTRO dia não entra na conta deste", () => {
    const p = producao([vaga({ data: "2026-09-09", remarcado_de: 9, remarcacao_motivo: "hospital_agenda" })]);
    expect(p.remarcados).toBe(0);
  });
});
