// ═══════════════════════════════════════════════════════════
// A CIRURGIA VIRA CONTA
//
// 🔴 A cirurgia acontecia no Bloco e a conta não sabia.
// `montarContaDoProntuario` lia ficha, internação e medicação — não lia
// `cc_cirurgias`. Para o procedimento de MAIOR VALOR da tabela, o faturista
// redigitava do papel, que é onde o próprio motor diz que "nasce o código
// trocado e a conta que sai menor do que o atendimento foi".
//
// ⚠️ O ELO É EXPLÍCITO, não adivinhado. A conta lê as cirurgias pelo
// `ps_atendimento_id`, nunca por prontuário+data: a mesma pessoa pode ter
// dois atendimentos no mesmo dia, e o palpite poria o porte cirúrgico na
// conta do episódio errado.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  itensDaCirurgia, itensDasCirurgias, motivoParaNaoFaturar, dataDaExecucao, STATUS_FATURAVEL,
} from "./conta-cirurgia.js";
import { montarContaDoProntuario } from "./montar-conta.js";

const CIR = {
  id: 9, sala: "Sala 1", data: "2026-10-08", status: "concluida",
  procedimento_cod: "0407010173", procedimento: "Colecistectomia videolaparoscópica",
  inicio_cirurgia_em: "2026-10-08T13:00:00Z",
};
const CAT = { codigo: "0407010173", nome: "Colecistectomia videolaparoscópica", valor_sus: 850 };
const EQUIPE = [
  { papel: "cirurgiao", nome: "Dra. Ana", cbo: "225125" },
  { papel: "anestesista", nome: "Dr. Reis", cbo: "225151" },
  { papel: "circulante", nome: "Enf. Paz" },
];

// ── QUANDO VIRA CONTA ───────────────────────────────────────
describe("só o que entrou em sala vira conta", () => {
  it("agendada não cobra — o ato não aconteceu", () => {
    expect(motivoParaNaoFaturar({ id: 1, status: "agendada" })).toMatch(/ainda não entrou em sala/);
  });
  it("🔴 cancelada não cobra", () => {
    expect(motivoParaNaoFaturar({ id: 1, status: "cancelada" })).toMatch(/cancelada/i);
  });
  it("em cirurgia, em recuperação e concluída cobram", () => {
    for (const s of STATUS_FATURAVEL) expect(motivoParaNaoFaturar({ id: 1, status: s })).toBeNull();
  });
  it("cirurgia agendada não gera item nenhum", () => {
    expect(itensDaCirurgia({ cirurgia: { ...CIR, status: "agendada" }, equipe: EQUIPE, procCatalogo: CAT }).itens).toEqual([]);
  });
});

// ── A DATA ──────────────────────────────────────────────────
describe("🔴 a data de execução é o dia civil do hospital", () => {
  it("prefere a incisão, pelo relógio local", () => {
    // 13:00Z é 10:00 em Brasília, dia 08.
    expect(dataDaExecucao(CIR)).toBe("2026-10-08");
  });
  it("cirurgia das 22h não executa amanhã", () => {
    // 01:00Z do dia 09 é 22:00 do dia 08.
    expect(dataDaExecucao({ ...CIR, inicio_cirurgia_em: "2026-10-09T01:00:00Z" })).toBe("2026-10-08");
  });
  it("sem incisão, cai na entrada em sala; sem ela, no dia agendado", () => {
    expect(dataDaExecucao({ data: "2026-10-08", entrada_sala_em: "2026-10-08T12:00:00Z" })).toBe("2026-10-08");
    expect(dataDaExecucao({ data: "2026-10-08" })).toBe("2026-10-08");
  });
});

// ── O ATO ───────────────────────────────────────────────────
describe("o ato cirúrgico, com quem assina", () => {
  it("🔴 o cirurgião é o executante, com o CBO dele", () => {
    const { itens } = itensDaCirurgia({ cirurgia: CIR, equipe: EQUIPE, procCatalogo: CAT });
    const ato = itens[0];
    expect(ato).toMatchObject({
      tipo: "procedimento", codigo: "0407010173", quantidade: 1,
      valor_unitario: 850, executante: "Dra. Ana", executante_cbo: "225125",
      data_execucao: "2026-10-08",
    });
    expect(ato.origem).toMatch(/Cirurgia #9 · Sala 1/);
  });

  it("🔴 SEM CÓDIGO a cirurgia não entra, e a conta diz por quê", () => {
    const r = itensDaCirurgia({ cirurgia: { ...CIR, procedimento_cod: null }, equipe: EQUIPE });
    expect(r.itens).toEqual([]);
    expect(r.avisos.join(" ")).toMatch(/SEM CÓDIGO/);
    expect(r.avisos.join(" ")).toMatch(/Sem SIGTAP não há AIH/);
  });

  it("sem cirurgião, o item vai sem executante — e avisa o custo", () => {
    const r = itensDaCirurgia({ cirurgia: CIR, equipe: [], procCatalogo: CAT });
    expect(r.itens[0].executante).toBeNull();
    expect(r.avisos.join(" ")).toMatch(/sem executante o procedimento não é pago/);
  });

  it("cirurgião sem CBO: entra, mas com o aviso que importa", () => {
    const r = itensDaCirurgia({ cirurgia: CIR, equipe: [{ papel: "cirurgiao", nome: "Silva" }], procCatalogo: CAT });
    expect(r.itens[0].executante).toBe("Silva");
    expect(r.avisos.join(" ")).toMatch(/não é glosa: derruba o registro inteiro/);
  });

  it("o preço cai para o SIGTAP (SH+SP) quando o catálogo não tem", () => {
    const r = itensDaCirurgia({ cirurgia: CIR, equipe: EQUIPE, procCatalogo: null, sigRow: { valor_sh: 40000, valor_sp: 20000 } });
    expect(r.itens[0].valor_unitario).toBe(600);   // centavos → reais
    expect(r.itens[0].fonteValor).toBe("SIGTAP (SH+SP)");
  });

  it("sem preço em lugar nenhum: entra sem valor e avisa", () => {
    const r = itensDaCirurgia({ cirurgia: CIR, equipe: EQUIPE, procCatalogo: null, sigRow: null });
    expect(r.itens[0].valor_unitario).toBeNull();
    expect(r.avisos.join(" ")).toMatch(/entra sem preço/);
  });
});

// ── O ANESTESISTA ───────────────────────────────────────────
describe("🔴 o anestesista é LINHA PRÓPRIA — é assim que a TISS paga", () => {
  it("entra como item separado, com o CBO dele", () => {
    const { itens } = itensDaCirurgia({ cirurgia: CIR, equipe: EQUIPE, procCatalogo: CAT });
    const anest = itens.find(i => /^Anestesia —/.test(i.descricao));
    expect(anest).toBeTruthy();
    expect(anest.executante).toBe("Dr. Reis");
    expect(anest.executante_cbo).toBe("225151");
    // Amontoar os dois num item só faria a conta sair com um executante
    // para dois atos — glosa certa.
    expect(itens[0].executante).toBe("Dra. Ana");
  });

  it("na AIH, a falta dele é apontada — alguém anestesiou", () => {
    const r = itensDaCirurgia({ cirurgia: CIR, equipe: [EQUIPE[0]], procCatalogo: CAT, via: "aih" });
    expect(r.avisos.join(" ")).toMatch(/sem anestesista registrado/);
  });

  it("fora da AIH, a ausência não vira ruído", () => {
    const r = itensDaCirurgia({ cirurgia: CIR, equipe: [EQUIPE[0]], procCatalogo: CAT, via: "bpa" });
    expect(r.avisos.join(" ")).not.toMatch(/sem anestesista/);
  });
});

// ── OS AUXILIARES ───────────────────────────────────────────
describe("os auxiliares entram para CONFERÊNCIA, sem valor", () => {
  it("🔴 valor nulo de propósito — o percentual é do contrato da operadora", () => {
    const { itens, avisos } = itensDaCirurgia({
      cirurgia: CIR, procCatalogo: CAT,
      equipe: [...EQUIPE, { papel: "primeiro_auxiliar", nome: "Dra. Lima", cbo: "225125" }],
    });
    const aux = itens.find(i => /1º auxiliar/.test(i.descricao));
    expect(aux.valor_unitario).toBeNull();
    expect(aux.executante).toBe("Dra. Lima");
    expect(avisos.join(" ")).toMatch(/percentual depende do contrato da operadora/);
  });

  it("instrumentador e circulante NÃO viram item — são apoio, não ato cobrável", () => {
    const { itens } = itensDaCirurgia({ cirurgia: CIR, equipe: EQUIPE, procCatalogo: CAT });
    expect(itens.some(i => /Paz/.test(i.executante || ""))).toBe(false);
  });
});

// ── VÁRIAS CIRURGIAS ────────────────────────────────────────
describe("um episódio pode ter mais de uma cirurgia", () => {
  it("cada uma é um ato próprio, com a equipe dela", () => {
    const c2 = { ...CIR, id: 10, procedimento: "Reoperação", sala: "Sala 2" };
    const { itens } = itensDasCirurgias({
      cirurgias: [CIR, c2],
      equipePorCirurgia: { 9: EQUIPE, 10: [{ papel: "cirurgiao", nome: "Dr. Souza", cbo: "225130" }] },
      catalogoPorCodigo: { "0407010173": CAT },
    });
    const atos = itens.filter(i => i.codigo === "0407010173");
    expect(atos).toHaveLength(2);
    expect(atos.map(a => a.executante)).toEqual(["Dra. Ana", "Dr. Souza"]);
    expect(atos[1].origem).toMatch(/Cirurgia #10 · Sala 2/);
  });
});

// ── PONTA A PONTA, NO MOTOR ─────────────────────────────────
describe("🔴 ponta a ponta: a conta do episódio passa a incluir a cirurgia", () => {
  const atend = {
    id: 501, prontuario: "T1", procedimento_cod: "0303010037", cid: "K80",
    chegada_em: "2026-10-08T12:00:00Z", medico: "Dr. Plantão", idade: 40,
  };
  const SUS = { tipo: "sus" };

  it("sem cirurgia, a conta é a de antes", () => {
    const r = montarContaDoProntuario({ atendimento: atend, convenio: SUS });
    expect(r.itens.some(i => /Cirurgia #/.test(i.origem || ""))).toBe(false);
  });

  it("com cirurgia, o ato e o anestesista entram na conta", () => {
    const r = montarContaDoProntuario({
      atendimento: atend, convenio: SUS,
      procedimentos: [CAT],
      cirurgias: [CIR],
      equipePorCirurgia: { 9: EQUIPE },
    });
    const ato = r.itens.find(i => i.codigo === "0407010173");
    expect(ato).toBeTruthy();
    expect(ato.executante).toBe("Dra. Ana");
    expect(ato.executante_cbo).toBe("225125");
    expect(r.itens.some(i => /^Anestesia —/.test(i.descricao))).toBe(true);
  });

  it("os avisos da cirurgia chegam junto com os da conta", () => {
    const r = montarContaDoProntuario({
      atendimento: atend, convenio: SUS,
      cirurgias: [{ ...CIR, procedimento_cod: null }],
      equipePorCirurgia: { 9: EQUIPE },
    });
    expect(r.avisos.join(" ")).toMatch(/SEM CÓDIGO/);
  });

  it("cirurgia cancelada não entra na conta do episódio", () => {
    const r = montarContaDoProntuario({
      atendimento: atend, convenio: SUS, procedimentos: [CAT],
      cirurgias: [{ ...CIR, status: "cancelada" }],
      equipePorCirurgia: { 9: EQUIPE },
    });
    expect(r.itens.some(i => /Cirurgia #/.test(i.origem || ""))).toBe(false);
  });
});
