// Testes da resolução de alergias do paciente.
//
// A regra crítica aqui é a distinção entre "não tem alergia" e "ninguém
// perguntou". Tratar as duas como iguais é o tipo de simplificação que
// mata paciente: campo em branco vira falsa segurança.

import { describe, it, expect } from "vitest";
import {
  alergiasVigentes, negaAlergias, textoAlergiasParaAlerta,
  alergiasParaExibir, situacaoAlergica, TIPO_NENHUMA,
} from "./alergias.js";

const reg = (id, extra = {}) => ({
  id, prontuario: "12345", agente: "Dipirona", substancia: "dipirona",
  tipo: "medicamento", situacao: "ativa", criticidade: "alta",
  criado_em: "2026-07-22T10:00:00Z", ...extra,
});

describe("histórico append-only", () => {
  it("mantém o registro que ninguém corrigiu", () => {
    expect(alergiasVigentes([reg(1)])).toHaveLength(1);
  });

  it("substitui o registro corrigido pela correção", () => {
    const v = alergiasVigentes([reg(1), reg(2, { corrige_id: 1, agente: "Dipirona sódica" })]);
    expect(v).toHaveLength(1);
    expect(v[0].agente).toBe("Dipirona sódica");
  });

  it("ignora alergia refutada, resolvida ou inativa", () => {
    expect(alergiasVigentes([
      reg(1, { situacao: "refutada" }),
      reg(2, { situacao: "resolvida" }),
      reg(3, { situacao: "inativa" }),
    ])).toHaveLength(0);
  });

  it("registro sem situação vale como ativa", () => {
    expect(alergiasVigentes([reg(1, { situacao: null })])).toHaveLength(1);
  });
});

describe("texto entregue ao motor de alertas", () => {
  it("prefere o princípio ativo ao nome comercial", () => {
    // é o que faz o motor casar Novalgina com Dipirona
    const t = textoAlergiasParaAlerta([reg(1, { agente: "Novalgina", substancia: "dipirona" })]);
    expect(t).toBe("dipirona");
  });

  it("cai para o agente quando não há substância normalizada", () => {
    expect(textoAlergiasParaAlerta([reg(1, { agente: "Camarão", substancia: null })])).toBe("Camarão");
  });

  it("funde a fonte nova com o texto legado do atendimento", () => {
    // parseAlergias normaliza (minúsculas, sem acento) — o texto legado
    // entra normalizado, o que é fino: o motor de alertas também normaliza.
    const t = textoAlergiasParaAlerta([reg(1)], "Penicilina, AAS");
    expect(t).toContain("dipirona");
    expect(t).toContain("penicilina");
    expect(t).toContain("aas");
  });

  it("não duplica o que já veio estruturado", () => {
    const t = textoAlergiasParaAlerta([reg(1)], "dipirona");
    expect(t.toLowerCase().match(/dipirona/g)).toHaveLength(1);
  });

  it("'nega alergias' NÃO vira termo de alerta", () => {
    const t = textoAlergiasParaAlerta([reg(1, { tipo: TIPO_NENHUMA, agente: "Nenhuma conhecida", substancia: null })]);
    expect(t).toBe("");
  });

  it("funciona com paciente sem nenhum registro", () => {
    expect(textoAlergiasParaAlerta([], "")).toBe("");
    expect(textoAlergiasParaAlerta(null, null)).toBe("");
  });
});

describe("exibição na tela", () => {
  it("marca a origem de cada alergia", () => {
    const itens = alergiasParaExibir([reg(1)], "Penicilina");
    // registro estruturado mantém o rótulo original; legado vem normalizado
    expect(itens.find(i => i.rotulo === "Dipirona").fonte).toBe("registro");
    expect(itens.find(i => /penicilina/i.test(i.rotulo)).fonte).toBe("legado");
  });

  it("põe criticidade alta na frente", () => {
    const itens = alergiasParaExibir([
      reg(1, { agente: "Poeira", criticidade: "baixa" }),
      reg(2, { agente: "Penicilina", criticidade: "alta" }),
    ]);
    expect(itens[0].rotulo).toBe("Penicilina");
  });
});

describe("os três estados — a distinção que importa", () => {
  it("com_alergia quando há registro vigente", () => {
    expect(situacaoAlergica([reg(1)]).estado).toBe("com_alergia");
  });

  it("nenhuma quando alguém PERGUNTOU e o paciente negou", () => {
    expect(situacaoAlergica([reg(1, { tipo: TIPO_NENHUMA, substancia: null })]).estado).toBe("nenhuma");
  });

  it("sem_registro quando NINGUÉM perguntou — não é o mesmo que não ter", () => {
    expect(situacaoAlergica([], "").estado).toBe("sem_registro");
  });

  it("alergia refutada volta ao estado sem_registro, não a 'nenhuma'", () => {
    // refutar uma alergia não equivale a afirmar que o paciente não tem outras
    expect(situacaoAlergica([reg(1, { situacao: "refutada" })], "").estado).toBe("sem_registro");
  });
});
