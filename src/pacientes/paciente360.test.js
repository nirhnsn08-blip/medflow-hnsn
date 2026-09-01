// ═══════════════════════════════════════════════════════════
// PACIENTE 360 — A SENTINELA
//
// 🔴 ALERTA CLÍNICO FALHA DE DOIS JEITOS, E OS DOIS DOEM.
//   · deixar de avisar  → alguém entra no quarto sem precaução;
//   · avisar de tudo    → a pessoa para de ler a lista, e o aviso que
//     importava também deixa de ser lido.
//
// Por isso cada gatilho aqui é estreito: internação ALÉM da previsão (não
// perto dela), cultura sem resultado há 3 dias OU MAIS (não desde ontem),
// caso SCIH que NÃO foi encerrado.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { sentinelaPaciente } from "./paciente360.js";

const hoje = new Date();
const diasAtras = n => {
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - n);
  const p = x => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const vazio = { ps: [], leitoAtual: [], scih: [] };
const textos = a => a.map(x => x.texto).join(" | ");

describe("paciente sem nada acontecendo", () => {
  it("não inventa alerta", () => {
    expect(sentinelaPaciente(vazio)).toEqual([]);
  });
});

describe("🔴 vigilância do SCIH", () => {
  it("caso ABERTO avisa, com o germe e a precaução", () => {
    const a = sentinelaPaciente({ ...vazio,
      scih: [{ status: "ativo", germe: "MRSA", isolamento: "contato" }] });
    expect(textos(a)).toContain("Vigilância SCIH ativa");
    expect(textos(a)).toContain("MRSA");
    expect(textos(a)).toContain("Contato");
  });

  it("⚠️ caso ENCERRADO não avisa — a vigilância acabou", () => {
    // Continuar avisando de caso encerrado é o começo da fadiga: a lista
    // cresce com o que já passou e o que é atual se perde nela.
    expect(sentinelaPaciente({ ...vazio, scih: [{ status: "encerrado", germe: "MRSA" }] })).toEqual([]);
  });

  it("isolamento ilegível não vira tarja em branco no texto", () => {
    // `precaucaoDe` devolve null para chave desconhecida; o alerta sai sem
    // a parte do isolamento, e não com "isolamento undefined".
    const a = sentinelaPaciente({ ...vazio, scih: [{ status: "ativo", germe: "X", isolamento: "Contato" }] });
    expect(textos(a)).not.toMatch(/undefined|null/);
    expect(textos(a)).toContain("Vigilância SCIH ativa");
  });
});

describe("🔴 cultura coletada sem resultado", () => {
  it("três dias OU MAIS avisa", () => {
    const a = sentinelaPaciente({ ...vazio,
      scih: [{ status: "ativo", data_coleta: diasAtras(3) }] });
    expect(textos(a)).toMatch(/Cultura coletada há 3d sem resultado/);
  });

  it("⚠️ dois dias NÃO avisa — laboratório leva tempo", () => {
    // Avisar desde a coleta poria o alerta em toda cultura do hospital,
    // todo dia. O corte existe para que a lista signifique alguma coisa.
    const a = sentinelaPaciente({ ...vazio,
      scih: [{ status: "ativo", data_coleta: diasAtras(2) }] });
    expect(textos(a)).not.toMatch(/Cultura coletada/);
  });

  it("com resultado registrado não avisa, por mais antiga que seja", () => {
    const a = sentinelaPaciente({ ...vazio,
      scih: [{ status: "ativo", data_coleta: diasAtras(30), data_resultado: diasAtras(28) }] });
    expect(textos(a)).not.toMatch(/Cultura coletada/);
  });
});

describe("🔴 internação além da previsão de alta", () => {
  it("previsão vencida avisa, com quantos dias", () => {
    const a = sentinelaPaciente({ ...vazio,
      leitoAtual: [{ identificacao: "102", data_internacao: diasAtras(10), dias_previstos: 5 }] });
    expect(textos(a)).toMatch(/além da previsão de alta/);
  });

  it("⚠️ dentro da previsão NÃO avisa", () => {
    // Avisar de quem está dentro do prazo faria o alerta aparecer em todo
    // paciente internado — e aí ele não distingue mais ninguém.
    const a = sentinelaPaciente({ ...vazio,
      leitoAtual: [{ identificacao: "102", data_internacao: diasAtras(2), dias_previstos: 5 }] });
    expect(textos(a)).not.toMatch(/além da previsão/);
  });

  it("sem previsão cadastrada não avisa", () => {
    // Sem `dias_previstos` não há prazo para vencer. Chutar um padrão aqui
    // encheria a lista de alertas sobre uma previsão que ninguém fez.
    const a = sentinelaPaciente({ ...vazio,
      leitoAtual: [{ identificacao: "102", data_internacao: diasAtras(30) }] });
    expect(textos(a)).not.toMatch(/além da previsão/);
  });
});

describe("paciente no Pronto-Socorro", () => {
  it("atendimento ABERTO avisa", () => {
    const a = sentinelaPaciente({ ...vazio, ps: [{ status: "em_atendimento" }] });
    expect(textos(a)).toContain("no PS agora");
  });

  it("⚠️ atendimento finalizado não avisa", () => {
    expect(sentinelaPaciente({ ...vazio, ps: [{ status: "finalizado" }] })).toEqual([]);
  });

  it("e o status sai legível, sem o underline do banco", () => {
    const a = sentinelaPaciente({ ...vazio, ps: [{ status: "aguardando_triagem" }] });
    expect(textos(a)).toContain("aguardando triagem");
    expect(textos(a)).not.toContain("aguardando_triagem");
  });
});

describe("vários sinais ao mesmo tempo", () => {
  it("cada um vira um alerta, todos com cor", () => {
    const a = sentinelaPaciente({
      ps: [{ status: "em_atendimento" }],
      leitoAtual: [{ identificacao: "102", data_internacao: diasAtras(10), dias_previstos: 5 }],
      scih: [{ status: "ativo", germe: "KPC", isolamento: "contato", data_coleta: diasAtras(5) }],
    });
    expect(a.length).toBe(4);
    for (const x of a) expect(x.cor, JSON.stringify(x)).toMatch(/^#/);
  });
});
