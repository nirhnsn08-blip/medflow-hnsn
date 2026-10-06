// ═══════════════════════════════════════════════════════════
// IDENTIFICAÇÃO: A FICHA APOSENTADA E AS INICIAIS QUE NINGUÉM CONFERIA
//
// 🔴 DOIS DEFEITOS REAIS (revisão do módulo Atendimento, 05/10/2026):
//
//   1. Unificar prontuário só gravava um ponteiro (`unificado_para`). NADA
//      impedia de continuar usando a ficha antiga: a busca acha as duas, a
//      recepcionista escolhe a primeira, e o atendimento novo nasce no
//      número aposentado — o histórico se parte de novo, que é exatamente o
//      que unificar tinha consertado.
//
//   2. A chegada do PS conferia só se o prontuário EXISTIA. As iniciais
//      digitadas iam para o banco sem serem comparadas com as do cadastro:
//      um dígito trocado pendurava triagem e prescrição em outro paciente
//      real, e a fila mostrava as iniciais de quem foi digitado.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { validarAbertura } from "./recepcao.js";
import { podeMarcar, podeRegistrarDaRegulacao } from "./agenda.js";
import { recusaPorUnificacao, foiUnificado, prontuarioVigente } from "../pacientes/unificacao.js";
import { conferirIniciaisDaChegada } from "../ps/chegada.js";

const MARIA = { prontuario: "T9032", iniciais: "M.S.F.", nome_completo: "Maria Silva Fontes",
                data_nascimento: "1992-09-06", nome_mae: "Joana Silva" };
const APOSENTADA = { ...MARIA, prontuario: "T4001", unificado_para: "T9032" };

describe("recusaPorUnificacao — a frase única das portas de entrada", () => {
  it("ficha normal não diz nada (aviso que aparece sempre não é lido)", () => {
    expect(recusaPorUnificacao(MARIA)).toBe(null);
    expect(foiUnificado(MARIA)).toBe(false);
  });

  it("ficha unificada diz qual número usar", () => {
    const f = recusaPorUnificacao(APOSENTADA);
    expect(f).toContain("T4001");
    expect(f).toContain("T9032");
    expect(prontuarioVigente(APOSENTADA)).toBe("T9032");
  });
});

describe("🔴 a ficha aposentada não recebe registro novo", () => {
  it("Recepção: abrir atendimento na ficha unificada é RECUSADO", () => {
    const v = validarAbertura({
      paciente: APOSENTADA, tipo: "emergencia", origem: "Meios próprios", atendimentosAbertos: [],
    });
    expect(v.ok).toBe(false);
    expect(v.erros.join(" ")).toContain("T9032");
  });

  it("controle: na ficha que vale, abre normalmente", () => {
    const v = validarAbertura({
      paciente: MARIA, tipo: "emergencia", origem: "Meios próprios", atendimentosAbertos: [],
    });
    expect(v.ok).toBe(true);
  });

  const GRADE = { id: 1, especialidade_cod: "cardio", dia_semana: 1, hora_inicio: "08:00", hora_fim: "12:00",
                  duracao_min: 20, vagas_internas: 4, vagas_regulacao: 2, vagas_chegada: 2, ativo: true };
  const SEGUNDA = "2026-10-05";

  it("Agenda: marcar consulta na ficha unificada é RECUSADO", () => {
    const v = podeMarcar({ grade: GRADE, data: SEGUNDA, hora: "08:00", origem: "interna",
                           agendamentos: [], bloqueios: [], paciente: APOSENTADA });
    expect(v.ok).toBe(false);
    expect(v.erros.join(" ")).toContain("T9032");
  });

  it("Agenda: a vaga da regulação também recusa", () => {
    const v = podeRegistrarDaRegulacao({ grade: GRADE, data: SEGUNDA, hora: "08:00", protocolo: "REG-1",
                                         agendamentos: [], bloqueios: [], paciente: APOSENTADA });
    expect(v.ok).toBe(false);
    expect(v.erros.join(" ")).toContain("T9032");
  });

  it("controle: a ficha que vale marca normalmente", () => {
    const v = podeMarcar({ grade: GRADE, data: SEGUNDA, hora: "08:00", origem: "interna",
                           agendamentos: [], bloqueios: [], paciente: MARIA });
    expect(v.ok).toBe(true);
  });

  it("sem cadastro em mãos, a regra não inventa recusa", () => {
    const v = podeMarcar({ grade: GRADE, data: SEGUNDA, hora: "08:00", origem: "interna",
                           agendamentos: [], bloqueios: [] });
    expect(v.ok).toBe(true);
  });
});

describe("🔴 chegada do PS: as iniciais são conferidas contra o cadastro", () => {
  it("batendo, segue sem perguntar — e grava as do CADASTRO", () => {
    const c = conferirIniciaisDaChegada("M.S.F.", MARIA);
    expect(c.ok).toBe(true);
    expect(c.iniciais).toBe("M.S.F.");
    expect(c.pergunta).toBe(null);
  });

  it("pontuação e caixa não são divergência ('msf', 'M S F')", () => {
    expect(conferirIniciaisDaChegada("msf", MARIA).ok).toBe(true);
    expect(conferirIniciaisDaChegada("M S F", MARIA).ok).toBe(true);
    expect(conferirIniciaisDaChegada("  M.S.F  ", MARIA).ok).toBe(true);
  });

  it("🔴 não batendo, PERGUNTA mostrando quem é o dono do número", () => {
    const c = conferirIniciaisDaChegada("J.P.S.", MARIA);
    expect(c.ok).toBe(false);
    expect(c.pergunta).toContain("J.P.S.");
    expect(c.pergunta).toContain("T9032");
    expect(c.pergunta).toContain("Maria Silva Fontes");
    expect(c.pergunta).toContain("06/09/1992");    // nascimento, o 2º identificador
    expect(c.pergunta).toContain("Joana Silva");   // mãe, o desempate de homônimo
  });

  it("só o número digitado também pergunta — e as iniciais vêm do cadastro", () => {
    const c = conferirIniciaisDaChegada("", MARIA);
    expect(c.ok).toBe(false);
    expect(c.iniciais).toBe("M.S.F.");
  });

  it("🔴 acervo com iniciais divergentes do nome não transforma TODA chegada em pergunta", () => {
    // T9032 no banco de teste: nome "Maria Silva Ferreira", coluna iniciais "Q.A.".
    // Comparar só com a coluna faria perguntar sempre — e pergunta que aparece
    // sempre é clicada sem ler.
    const torto = { ...MARIA, iniciais: "Q.A." };
    expect(conferirIniciaisDaChegada("Q.A.", torto).ok).toBe(true);    // bate a coluna
    expect(conferirIniciaisDaChegada("M.S.F.", torto).ok).toBe(true);  // bate o nome
    expect(conferirIniciaisDaChegada("J.P.S.", torto).ok).toBe(false); // não bate nenhuma: pergunta
  });

  it("as iniciais que vão para a fila são SEMPRE as do cadastro", () => {
    // Era aqui que a fila do PS e o Paciente 360 divergiam.
    expect(conferirIniciaisDaChegada("X.Y.Z.", MARIA).iniciais).toBe("M.S.F.");
  });
});
