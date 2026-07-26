// Testes do resumo de exames por categoria (BI mensal do PS).
//
// Laboratório e imagem têm tempos e gargalos diferentes; somar os dois esconde
// os dois. Estes testes fixam a matemática do BI: contagem, % com resultado e
// tempo médio solicitação -> resultado, com categoria desconhecida caindo em
// "outro" e datas ruins fora da média.

import { describe, it, expect } from "vitest";
import { resumoExamesPorCategoria, EXAME_CATEGORIAS } from "./exames.js";

const ex = (categoria, status, criado_em, resultado_em) => ({ categoria, status, criado_em, resultado_em });

describe("resumoExamesPorCategoria", () => {
  it("lista vazia — tudo zero, percentuais e tempos null", () => {
    const r = resumoExamesPorCategoria([]);
    expect(r.n).toBe(0);
    expect(r.comResultado).toBe(0);
    expect(r.pctResultado).toBe(null);
    expect(r.tempoMedioMin).toBe(null);
    expect(r.porCategoria).toHaveLength(3);
    expect(r.porCategoria.every(c => c.n === 0 && c.pctResultado === null)).toBe(true);
  });

  it("conta por categoria e mantém a ordem lab -> imagem -> outro", () => {
    const r = resumoExamesPorCategoria([
      ex("laboratorial", "solicitado"),
      ex("laboratorial", "visto"),
      ex("imagem", "solicitado"),
    ]);
    expect(r.porCategoria.map(c => c.chave)).toEqual(["laboratorial", "imagem", "outro"]);
    const lab = r.porCategoria.find(c => c.chave === "laboratorial");
    const img = r.porCategoria.find(c => c.chave === "imagem");
    expect(lab.n).toBe(2);
    expect(img.n).toBe(1);
    expect(r.n).toBe(3);
  });

  it("'com resultado' conta resultado_disponivel e visto, não solicitado", () => {
    const r = resumoExamesPorCategoria([
      ex("laboratorial", "solicitado"),
      ex("laboratorial", "resultado_disponivel"),
      ex("laboratorial", "visto"),
      ex("laboratorial", "solicitado"),
    ]);
    const lab = r.porCategoria.find(c => c.chave === "laboratorial");
    expect(lab.comResultado).toBe(2);
    expect(lab.pctResultado).toBe(50);          // 2 de 4
  });

  it("tempo médio até o resultado = média dos minutos solicitação -> resultado", () => {
    const r = resumoExamesPorCategoria([
      ex("imagem", "visto", "2026-07-26T10:00:00Z", "2026-07-26T10:30:00Z"),   // 30 min
      ex("imagem", "resultado_disponivel", "2026-07-26T10:00:00Z", "2026-07-26T11:30:00Z"), // 90 min
      ex("imagem", "solicitado", "2026-07-26T10:00:00Z", null),                // sem resultado -> fora da média
    ]);
    const img = r.porCategoria.find(c => c.chave === "imagem");
    expect(img.tempoMedioMin).toBe(60);         // (30 + 90) / 2
  });

  it("categoria desconhecida ou vazia cai em 'outro'", () => {
    const r = resumoExamesPorCategoria([
      ex("cardiologia", "solicitado"),
      ex(null, "visto"),
      ex(undefined, "solicitado"),
    ]);
    const outro = r.porCategoria.find(c => c.chave === "outro");
    expect(outro.n).toBe(3);
    expect(outro.comResultado).toBe(1);
    expect(r.n).toBe(3);                          // nada some da conta total
  });

  it("data invertida ou inválida não entra na média de tempo", () => {
    const r = resumoExamesPorCategoria([
      ex("laboratorial", "visto", "2026-07-26T12:00:00Z", "2026-07-26T11:00:00Z"), // invertida
      ex("laboratorial", "visto", "data-ruim", "2026-07-26T11:00:00Z"),            // inválida
      ex("laboratorial", "visto", "2026-07-26T10:00:00Z", "2026-07-26T10:20:00Z"), // 20 min
    ]);
    const lab = r.porCategoria.find(c => c.chave === "laboratorial");
    expect(lab.tempoMedioMin).toBe(20);          // só a válida entra
  });

  it("entrada não-array não quebra", () => {
    expect(resumoExamesPorCategoria(null).n).toBe(0);
    expect(resumoExamesPorCategoria(undefined).n).toBe(0);
  });

  it("EXAME_CATEGORIAS tem as três categorias esperadas", () => {
    expect(EXAME_CATEGORIAS.map(c => c.chave)).toEqual(["laboratorial", "imagem", "outro"]);
  });
});
