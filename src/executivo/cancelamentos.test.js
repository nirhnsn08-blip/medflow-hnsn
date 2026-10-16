// ═══════════════════════════════════════════════════════════
// CANCELAMENTO REINCIDENTE — testes do motor
//
// O teste central deste arquivo é o da REMARCAÇÃO: no ambulatório, remarcar
// deixa o agendamento original como `cancelado`. Contar isso como
// cancelamento faria toda remarcação de rotina inflar o indicador, e o
// painel apontaria pacientes que só mudaram de data.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  ORIGEM, LIMIAR_REINCIDENCIA, idsRemarcados,
  eventosDeCancelamento, porPaciente, relatorioDeCancelamentos,
} from "./cancelamentos.js";

const cir = (o = {}) => ({ id: 1, status: "cancelada", data: "2026-10-10", prontuario: "1001", iniciais: "A.B.", cancelamento_motivo: "Sem vaga de UTI", procedimento: "Colecistectomia", ...o });
const ag = (o = {}) => ({ id: 101, status: "cancelado", data: "2026-10-12", prontuario: "1001", cancelado_motivo: "Médico ausente", especialidade_cod: "OFT", ...o });

describe("idsRemarcados", () => {
  it("colhe os ids apontados por `remarcado_de`", () => {
    const s = idsRemarcados([{ id: 2, remarcado_de: 101 }, { id: 3, remarcado_de: null }, { id: 4 }]);
    expect([...s]).toEqual(["101"]);
  });

  it("lista vazia ou inválida não quebra", () => {
    expect(idsRemarcados([]).size).toBe(0);
    expect(idsRemarcados(null).size).toBe(0);
  });
});

describe("eventosDeCancelamento", () => {
  it("pega cancelamento das duas portas", () => {
    const r = eventosDeCancelamento([cir()], [ag()]);
    expect(r.eventos).toHaveLength(2);
    expect(r.eventos.map(e => e.origem).sort()).toEqual([ORIGEM.AMBULATORIO, ORIGEM.CIRURGIA]);
  });

  it("cirurgia que não foi cancelada não entra", () => {
    const r = eventosDeCancelamento([cir({ status: "concluida" })], []);
    expect(r.eventos).toEqual([]);
  });

  it("🔴 REMARCAÇÃO NÃO É CANCELAMENTO — sai da conta e é contada à parte", () => {
    const original = ag({ id: 101 });
    const nova = ag({ id: 102, status: "agendado", remarcado_de: 101 });
    const r = eventosDeCancelamento([], [original, nova]);
    expect(r.eventos).toHaveLength(0);
    expect(r.remarcacoes).toBe(1);
  });

  it("cancelamento de verdade continua contando mesmo havendo remarcações na lista", () => {
    const remarcado = ag({ id: 101 });
    const nova = ag({ id: 102, status: "agendado", remarcado_de: 101 });
    const cancelado = ag({ id: 103, prontuario: "2002" });
    const r = eventosDeCancelamento([], [remarcado, nova, cancelado]);
    expect(r.eventos).toHaveLength(1);
    expect(r.eventos[0].prontuario).toBe("2002");
    expect(r.remarcacoes).toBe(1);
  });

  it("🔴 cancelamento SEM prontuário não some — vai para naoAtribuidos", () => {
    // Agrupar por iniciais seria pior: iniciais repetem entre pacientes.
    const r = eventosDeCancelamento([cir({ prontuario: null })], [ag({ prontuario: "" })]);
    expect(r.eventos).toHaveLength(0);
    expect(r.naoAtribuidos).toHaveLength(2);
  });

  it("lê o motivo de cada tabela pelo nome certo da coluna", () => {
    const r = eventosDeCancelamento([cir()], [ag()]);
    const porOrigem = Object.fromEntries(r.eventos.map(e => [e.origem, e.motivo]));
    expect(porOrigem[ORIGEM.CIRURGIA]).toBe("Sem vaga de UTI");
    expect(porOrigem[ORIGEM.AMBULATORIO]).toBe("Médico ausente");
  });

  it("motivo em branco vira null, não string vazia", () => {
    const r = eventosDeCancelamento([cir({ cancelamento_motivo: "   " })], []);
    expect(r.eventos[0].motivo).toBeNull();
  });
});

describe("porPaciente", () => {
  it("junta as duas portas no mesmo paciente", () => {
    const { eventos } = eventosDeCancelamento([cir()], [ag()]);
    const lista = porPaciente(eventos);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ prontuario: "1001", total: 2, cirurgia: 1, ambulatorio: 1, nasDuasPortas: true });
  });

  it("🔴 quem apanha nas DUAS portas é marcado — nenhum relatório de módulo o vê", () => {
    const { eventos } = eventosDeCancelamento([cir({ prontuario: "1001" })], [ag({ prontuario: "1001" })]);
    expect(porPaciente(eventos)[0].nasDuasPortas).toBe(true);

    const so = eventosDeCancelamento([cir({ prontuario: "2002" })], []);
    expect(porPaciente(so.eventos)[0].nasDuasPortas).toBe(false);
  });

  it("ordena por quem mais apanhou", () => {
    const { eventos } = eventosDeCancelamento(
      [cir({ id: 1, prontuario: "1001" }), cir({ id: 2, prontuario: "1001" }), cir({ id: 3, prontuario: "2002" })], []);
    expect(porPaciente(eventos).map(p => p.prontuario)).toEqual(["1001", "2002"]);
  });

  it("empate desempata pelo mais RECENTE — é quem precisa de ligação hoje", () => {
    const { eventos } = eventosDeCancelamento([
      cir({ id: 1, prontuario: "1001", data: "2026-03-01" }),
      cir({ id: 2, prontuario: "2002", data: "2026-10-14" }),
    ], []);
    expect(porPaciente(eventos).map(p => p.prontuario)).toEqual(["2002", "1001"]);
  });

  it("o limiar de reincidência é 2 e sai marcado", () => {
    expect(LIMIAR_REINCIDENCIA).toBe(2);
    const um = eventosDeCancelamento([cir()], []);
    expect(porPaciente(um.eventos)[0].reincidente).toBe(false);
    const dois = eventosDeCancelamento([cir({ id: 1 }), cir({ id: 2 })], []);
    expect(porPaciente(dois.eventos)[0].reincidente).toBe(true);
  });

  it("guarda os motivos sem repetir, e marca quem não tem motivo nenhum", () => {
    const { eventos } = eventosDeCancelamento([
      cir({ id: 1, cancelamento_motivo: "Sem vaga de UTI" }),
      cir({ id: 2, cancelamento_motivo: "Sem vaga de UTI" }),
      cir({ id: 3, cancelamento_motivo: "Falta de material" }),
    ], []);
    const p = porPaciente(eventos)[0];
    expect(p.motivos).toEqual(["Sem vaga de UTI", "Falta de material"]);
    expect(p.semMotivoRegistrado).toBe(false);

    const sem = eventosDeCancelamento([cir({ cancelamento_motivo: null })], []);
    expect(porPaciente(sem.eventos)[0].semMotivoRegistrado).toBe(true);
  });

  it("os eventos do paciente saem do mais novo para o mais velho", () => {
    const { eventos } = eventosDeCancelamento([
      cir({ id: 1, data: "2026-08-01" }), cir({ id: 2, data: "2026-10-01" }),
    ], []);
    expect(porPaciente(eventos)[0].eventos.map(e => e.dia)).toEqual(["2026-10-01", "2026-08-01"]);
  });
});

describe("relatorioDeCancelamentos", () => {
  it("monta o relatório inteiro", () => {
    const r = relatorioDeCancelamentos(
      [cir({ id: 1, prontuario: "1001" }), cir({ id: 2, prontuario: "1001" }), cir({ id: 3, prontuario: "2002" })],
      [ag({ id: 101, prontuario: "1001" })]);
    expect(r.total).toBe(4);
    expect(r.reincidentes).toHaveLength(1);
    expect(r.reincidentes[0]).toMatchObject({ prontuario: "1001", total: 3 });
    expect(r.nasDuasPortas).toBe(1);
  });

  it("🔴 leitura que falhou NÃO pode dizer 'ninguém foi cancelado duas vezes'", () => {
    const r = relatorioDeCancelamentos([], [], { lido: false });
    expect(r.lido).toBe(false);
    expect(r.total).toBeNull();
    expect(r.podeDizerNinguem).toBe(false);
    expect(r.reincidentes).toEqual([]);
  });

  it("hospital sem cancelamento nenhum PODE dizer que não há", () => {
    const r = relatorioDeCancelamentos([], []);
    expect(r.lido).toBe(true);
    expect(r.total).toBe(0);
    expect(r.podeDizerNinguem).toBe(true);
  });

  it("mostra quantas remarcações foram descontadas e quantos ficaram sem dono", () => {
    const r = relatorioDeCancelamentos(
      [cir({ prontuario: null })],
      [ag({ id: 101 }), ag({ id: 102, status: "agendado", remarcado_de: 101 })]);
    expect(r.remarcacoes).toBe(1);
    expect(r.naoAtribuidos).toBe(1);
    expect(r.total).toBe(0);
  });

  it("o limiar pode ser ajustado sem mexer no motor", () => {
    const r = relatorioDeCancelamentos([cir({ id: 1 }), cir({ id: 2 })], [], { limiar: 3 });
    expect(r.reincidentes).toHaveLength(0);
  });
});
