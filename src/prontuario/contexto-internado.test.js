// ═══════════════════════════════════════════════════════════
// O CONTEXTO DO PACIENTE INTERNADO
//
// 🔴 Até 16/09/2026 o prontuário mandava `idade: null` fixo ao motor de
// alertas, em duas telas — e uma delas também mandava o clearance renal
// nulo. As regras de criança, de idoso e de ajuste renal ficavam caladas
// justamente para quem passa dias recebendo medicação.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { contextoDoInternado, idadeEmAnos } from "./contexto-internado.js";
import { analisarPrescricaoClinica } from "../clinico/alertas.js";
import { carregarProntuario } from "./dados.js";

const HOJE = new Date("2026-09-16T12:00:00");

describe("idadeEmAnos — pela data de nascimento", () => {
  it("anos completos", () => {
    expect(idadeEmAnos({ data_nascimento: "1980-03-10" }, HOJE)).toBe(46);
  });

  it("🔴 a véspera do aniversário ainda é a idade anterior", () => {
    // Nascido em 17/09/2014: em 16/09/2026 tem 11, não 12. É exatamente a
    // fronteira da regra pediátrica.
    expect(idadeEmAnos({ data_nascimento: "2014-09-17" }, HOJE)).toBe(11);
    expect(idadeEmAnos({ data_nascimento: "2014-09-16" }, HOJE)).toBe(12);
  });

  it("recém-nascido é 0, não `null`", () => {
    expect(idadeEmAnos({ data_nascimento: "2026-09-10" }, HOJE)).toBe(0);
  });

  it("🔴 só o ANO não basta — devolve `null` em vez de adivinhar", () => {
    // "ano atual − ano" erra em até um ano; na fronteira de 12 ou de 65 é o
    // alerta que não sai.
    expect(idadeEmAnos({ ano_nascimento: 2014 }, HOJE)).toBe(null);
  });

  it("data futura, inválida ou ausente → `null`", () => {
    for (const p of [{ data_nascimento: "2030-01-01" }, { data_nascimento: "31/02/2020" }, {}, null, undefined]) {
      expect(idadeEmAnos(p, HOJE), JSON.stringify(p)).toBe(null);
    }
  });
});

describe("🔴 contextoDoInternado", () => {
  it("leva a idade, o clearance e a sonda ao motor", () => {
    const ctx = contextoDoInternado({
      paciente: { data_nascimento: "2019-01-01" },
      alergias: [], condicoes: [{ descricao: "Em uso de sonda nasoenteral" }],
      clearanceRenal: 25,
    }, HOJE);
    expect(ctx).toMatchObject({ idade: 7, clearance_renal: 25, em_sonda: true, alergiasIncertas: false });
  });

  it("alergia de pep_alergias entra no contexto", () => {
    const ctx = contextoDoInternado({ alergias: [{ id: 1, agente: "Dipirona", substancia: "dipirona", situacao: "ativa" }] }, HOJE);
    expect(ctx.alergias).toMatch(/dipirona/i);
  });

  it("sem nada, não estoura e não inventa", () => {
    const ctx = contextoDoInternado({}, HOJE);
    expect(ctx).toMatchObject({ idade: null, clearance_renal: null, em_sonda: false, alergias: "" });
    expect(() => contextoDoInternado(undefined, HOJE)).not.toThrow();
  });

  it("🔴 criança internada recebe o alerta pediátrico — antes, nunca recebia", () => {
    const med = { id: 1, nome: "Ácido acetilsalicílico 100 mg", inapropriado_pediatrico: true };
    const ctx = contextoDoInternado({ paciente: { data_nascimento: "2020-05-01" } }, HOJE);
    const tipos = analisarPrescricaoClinica([{ medicamento_id: 1, medicamento_nome: med.nome }], ctx, { 1: med }, [], []).map(a => a.tipo);
    expect(tipos).toContain("pediatrico");
  });
});

describe("carregarProntuario traz o paciente", () => {
  const banco = pacientes => async recurso => {
    if (recurso.startsWith("pacientes")) return pacientes;
    return [];
  };

  it("devolve a linha do paciente com a data de nascimento", async () => {
    const d = await carregarProntuario(banco([{ prontuario: "P-1", data_nascimento: "2015-02-02" }]), "P-1");
    expect(d.paciente).toEqual({ prontuario: "P-1", data_nascimento: "2015-02-02" });
  });

  it("paciente não cadastrado ou leitura falhada → `null`, e o motor avisa pela idade ausente", async () => {
    expect((await carregarProntuario(banco([]), "P-1")).paciente).toBe(null);
    expect((await carregarProntuario(banco(null), "P-1")).paciente).toBe(null);
  });
});
