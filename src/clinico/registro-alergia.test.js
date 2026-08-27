// ═══════════════════════════════════════════════════════════
// REGISTRAR ALERGIA
//
// 🔴 O DEFEITO: `pep_alergias` é LIDA em quatro lugares — inclusive na
// pulseira do punho do paciente — e ESCRITA por nenhum.
// `registrarAlergia` existe e nenhuma tela a chama.
//
// E o sistema MANDA registrar, em duas telas: "Alergias não avaliadas —
// pergunte ao paciente e registre." Sem oferecer caminho. Instruir alguém
// a fazer o que o sistema não permite ensina que a tela não vale.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  validarAlergia, dadosDaAlergia, recadoDepoisDeGravar, ehGrave, TIPOS, GRAVIDADES,
} from "./registro-alergia.js";
import { TIPO_NENHUMA, negaAlergias, alergiasVigentes } from "./alergias.js";

describe("o que a validação RECUSA", () => {
  it("alergia sem agente — não dá para alertar sobre o quê", () => {
    const r = validarAlergia({ tipo: "medicamento", agente: "" });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/a que o paciente é alérgico/);
    // e aceita o nome comercial: exigir o princípio ativo travaria quem só
    // sabe o que o paciente falou
    expect(r.erros.join(" ")).toMatch(/nome comercial/);
  });

  it("alergia sem tipo", () => {
    expect(validarAlergia({ agente: "Dipirona", tipo: "" }).ok).toBe(false);
  });

  it("com agente e tipo, passa", () => {
    expect(validarAlergia({ agente: "Dipirona", tipo: "medicamento" }).ok).toBe(true);
  });
});

describe("🔴 “nega alergias” é REGISTRO, não ausência de registro", () => {
  it("passa sem exigir mais nada — o valor é alguém ter perguntado", () => {
    const r = validarAlergia({ nega: true });
    expect(r.ok).toBe(true);
    expect(r.erros).toEqual([]);
    expect(r.avisos).toEqual([]);
  });

  it("e grava com o tipo que o motor entende como negativa", () => {
    const d = dadosDaAlergia({ nega: true });
    expect(d.tipo).toBe(TIPO_NENHUMA);
    expect(d.agente).toBeNull();
    expect(d.situacao).toBe("ativa");
    // o motor de alergias tem de reconhecer o que gravamos
    expect(negaAlergias([{ ...d, id: 1 }])).toBe(true);
  });

  it("o recado explica a diferença que o campo em branco não diz", () => {
    expect(recadoDepoisDeGravar({ nega: true })).toMatch(/diferente de campo em branco/);
    expect(recadoDepoisDeGravar({ nega: true })).toMatch(/alguém perguntou/);
  });
});

describe("o que a validação AVISA sem impedir", () => {
  it("⚠️ sem princípio ativo o alerta automático não pega", () => {
    // O motor casa por substância. Sem ela, "Novalgina" nunca bate com
    // uma prescrição de dipirona.
    const r = validarAlergia({ agente: "Novalgina", tipo: "medicamento", substancia: "" });
    expect(r.ok).toBe(true);
    expect(r.avisos.join(" ")).toMatch(/princípio ativo/);
    expect(r.avisos.join(" ")).toMatch(/Novalgina/);
  });

  it("…e CALA quando a substância foi preenchida", () => {
    const r = validarAlergia({ agente: "Novalgina", tipo: "medicamento", substancia: "dipirona", gravidade: "leve", reacao: "urticária" });
    expect(r.avisos).toEqual([]);
  });

  it("o aviso de substância só vale para MEDICAMENTO", () => {
    // Camarão não tem princípio ativo. Avisar aqui seria ruído.
    const r = validarAlergia({ agente: "Camarão", tipo: "alimento", gravidade: "grave", reacao: "anafilaxia" });
    expect(r.avisos.join(" ")).not.toMatch(/princípio ativo/);
  });

  it("gravidade ausente avisa, porque ela decide conduta", () => {
    const r = validarAlergia({ agente: "Dipirona", tipo: "medicamento", substancia: "dipirona", gravidade: "" });
    expect(r.ok).toBe(true);
    expect(r.avisos.join(" ")).toMatch(/exantema ou uma anafilaxia/);
  });
});

describe("o que vai para o banco", () => {
  const f = { tipo: "medicamento", agente: "Novalgina", substancia: "dipirona",
              gravidade: "grave", reacao: "anafilaxia", inicio: "2020-03-01" };

  it("grave vira criticidade alta — o alerta precisa saber", () => {
    expect(dadosDaAlergia(f).criticidade).toBe("alta");
    expect(dadosDaAlergia({ ...f, gravidade: "leve" }).criticidade).toBeNull();
    expect(ehGrave("grave")).toBe(true);
    expect(ehGrave("moderada")).toBe(false);
  });

  it("campo vazio vira null, não string vazia", () => {
    // "" faria "não preenchido" deixar de ser distinguível de
    // "preenchido em branco".
    const d = dadosDaAlergia({ tipo: "alimento", agente: "Camarão" });
    expect(d.substancia).toBeNull();
    expect(d.gravidade).toBeNull();
    expect(d.reacao).toBeNull();
    expect(d.inicio).toBeNull();
  });

  it("nasce ATIVA — refutar é outro ato, com corrige_id", () => {
    expect(dadosDaAlergia(f).situacao).toBe("ativa");
    // e o motor tem de enxergá-la como vigente
    expect(alergiasVigentes([{ ...dadosDaAlergia(f), id: 1 }])).toHaveLength(1);
  });
});

describe("o recado depois de gravar", () => {
  it("🔴 alergia GRAVE manda reimprimir a pulseira", () => {
    // A pulseira no punho do paciente foi impressa sem esta informação, e
    // ninguém lembra disso sozinho.
    const r = recadoDepoisDeGravar({ agente: "Dipirona", gravidade: "grave" });
    expect(r).toMatch(/reimprima a pulseira/);
    expect(r).toMatch(/punho/);
  });

  it("alergia leve não pede reimpressão — aviso que sempre acende não é lido", () => {
    const r = recadoDepoisDeGravar({ agente: "Camarão", gravidade: "leve" });
    expect(r).not.toMatch(/reimprima/);
    expect(r).toMatch(/pulseira, no prontuário e no alerta/);
  });
});

describe("as listas que a tela oferece", () => {
  it("cobrem o que um hospital vê", () => {
    expect(TIPOS.map(t => t.chave)).toContain("medicamento");
    expect(TIPOS.map(t => t.chave)).toContain("latex");
    expect(TIPOS.map(t => t.chave)).toContain("contraste");
    expect(GRAVIDADES.map(g => g.chave)).toEqual(["leve", "moderada", "grave"]);
  });

  it("cada gravidade traz exemplo — “moderada” sozinho não orienta ninguém", () => {
    for (const g of GRAVIDADES) expect(g.nota.length).toBeGreaterThan(10);
  });
});
