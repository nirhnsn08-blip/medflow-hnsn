// ═══════════════════════════════════════════════════════════
// Trilha de auditoria.
//
// O que estes testes protegem: uma tela de auditoria que confunde "não há
// registro" com "não consegui perguntar" faz quem investiga um incidente
// concluir que a ação nunca aconteceu. É o pior erro possível justamente
// na tela cuja função é provar o que aconteceu.
//
// Validados por mutação:
//   • `!Array.isArray` trocado por `!linhas` ....... derruba lista vazia × falha
//   • busca sem limpeza de sintaxe ................. derruba o filtro quebrado
//   • `atribuidos` contando tudo ................... derruba a autoria garantida
//   • filtro local sem case-insensitive ............ derruba a busca por nome
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  limparBusca, estadoDaTrilha, normalizar, acoesDistintas,
  resumo, filtrarLocal, periodoCoberto,
} from "./trilha.js";

const reg = (o = {}) => ({ id: 1, ts: "2026-08-20T10:00:00Z", usuario: "Laura", usuario_id: "uuid-1", acao: "internar", alvo: "203", ...o });

describe("estadoDaTrilha — três estados, não dois", () => {
  it("com registro → ok", () => {
    expect(estadoDaTrilha({ linhas: [reg()] })).toBe("ok");
  });

  it("🔴 lista vazia é 'vazia'; consulta falhada é 'indeterminado'", () => {
    // Se as duas virassem "nenhum registro encontrado", quem investiga um
    // incidente concluiria que a ação não aconteceu — quando na verdade a
    // pergunta não chegou a ser feita.
    expect(estadoDaTrilha({ linhas: [] })).toBe("vazia");
    expect(estadoDaTrilha({ linhas: null })).toBe("indeterminado");
    expect(estadoDaTrilha({ linhas: undefined })).toBe("indeterminado");
  });

  it("vazio COM filtro ativo é 'sem-resultado', não 'trilha vazia'", () => {
    // Dizer "a trilha está vazia" quando a pessoa filtrou por um nome que
    // não existe é afirmar coisa diferente do que aconteceu.
    expect(estadoDaTrilha({ linhas: [], filtrando: true })).toBe("sem-resultado");
  });
});

describe("limparBusca — o texto do usuário não pode virar sintaxe", () => {
  it("remove o que quebra o filtro do PostgREST", () => {
    expect(limparBusca("Maria, João")).toBe("Maria João");
    expect(limparBusca("teste(1)")).toBe("teste 1");
    expect(limparBusca("a*b")).toBe("a b");
    expect(limparBusca("c\\d")).toBe("c d");
  });
  it("colapsa espaço e apara as pontas", () => {
    expect(limparBusca("  a   b  ")).toBe("a b");
  });
  it("entrada ausente não vira 'undefined'", () => {
    expect(limparBusca(null)).toBe("");
    expect(limparBusca(undefined)).toBe("");
  });
});

describe("normalizar", () => {
  it("traz a autoria do banco separada do nome digitado", () => {
    const n = normalizar(reg());
    expect(n.usuario).toBe("Laura");
    expect(n.usuarioId).toBe("uuid-1");
  });
  it("registro antigo, sem usuario_id, não inventa autoria", () => {
    const n = normalizar(reg({ usuario_id: null }));
    expect(n.usuarioId).toBeNull();
  });
  it("campos ausentes viram travessão, não 'undefined' na tela", () => {
    const n = normalizar({ id: 9 });
    expect(n.usuario).toBe("—");
    expect(n.acao).toBe("—");
    expect(n.alvo).toBe("");
  });
});

describe("resumo", () => {
  it("conta total, usuários distintos e período", () => {
    const r = resumo([
      normalizar(reg({ id: 1, ts: "2026-08-01T10:00:00Z", usuario: "Laura" })),
      normalizar(reg({ id: 2, ts: "2026-08-20T10:00:00Z", usuario: "Adauam" })),
      normalizar(reg({ id: 3, ts: "2026-08-10T10:00:00Z", usuario: "Laura" })),
    ]);
    expect(r.total).toBe(3);
    expect(r.usuarios).toBe(2);
    expect(r.maisAntigo).toBe("2026-08-01T10:00:00Z");
    expect(r.maisRecente).toBe("2026-08-20T10:00:00Z");
  });

  it("🔴 só conta como atribuído o que tem autoria do BANCO", () => {
    // Registro antigo, gravado antes de a coluna existir, não tem o mesmo
    // valor probatório. Somar tudo junto seria dizer que tem.
    const r = resumo([
      normalizar(reg({ id: 1, usuario_id: "uuid-1" })),
      normalizar(reg({ id: 2, usuario_id: null })),
      normalizar(reg({ id: 3, usuario_id: "uuid-2" })),
    ]);
    expect(r.total).toBe(3);
    expect(r.atribuidos).toBe(2);
  });

  it("lista vazia não quebra", () => {
    const r = resumo([]);
    expect(r).toMatchObject({ total: 0, usuarios: 0, atribuidos: 0, maisAntigo: null });
  });
});

describe("acoesDistintas", () => {
  it("devolve sem repetição e em ordem", () => {
    const linhas = [reg({ acao: "internar" }), reg({ acao: "alta" }), reg({ acao: "internar" })];
    expect(acoesDistintas(linhas)).toEqual(["alta", "internar"]);
  });
  it("ignora registro sem ação", () => {
    expect(acoesDistintas([{ acao: "" }, { acao: null }])).toEqual([]);
  });
});

describe("filtrarLocal", () => {
  const linhas = [
    normalizar(reg({ id: 1, usuario: "Laura", acao: "internar", alvo: "Leito 203" })),
    normalizar(reg({ id: 2, usuario: "Adauam", acao: "alta", alvo: "Leito 105" })),
    normalizar(reg({ id: 3, usuario: "Laura", acao: "alta", alvo: "UTI-2" })),
  ];

  it("busca por usuário, sem diferenciar maiúscula", () => {
    expect(filtrarLocal(linhas, { texto: "laura" }).map(l => l.id)).toEqual([1, 3]);
    expect(filtrarLocal(linhas, { texto: "LAURA" }).map(l => l.id)).toEqual([1, 3]);
  });

  it("busca também no alvo — é como a pessoa procura", () => {
    expect(filtrarLocal(linhas, { texto: "203" }).map(l => l.id)).toEqual([1]);
  });

  it("filtra por ação exata", () => {
    expect(filtrarLocal(linhas, { acao: "alta" }).map(l => l.id)).toEqual([2, 3]);
  });

  it("combina ação e texto", () => {
    expect(filtrarLocal(linhas, { acao: "alta", texto: "laura" }).map(l => l.id)).toEqual([3]);
  });

  it("sem filtro devolve tudo", () => {
    expect(filtrarLocal(linhas, {})).toHaveLength(3);
    expect(filtrarLocal(linhas)).toHaveLength(3);
  });

  it("texto com vírgula não quebra nem zera o resultado", () => {
    expect(filtrarLocal(linhas, { texto: "Laura," }).map(l => l.id)).toEqual([1, 3]);
  });
});

describe("periodoCoberto", () => {
  it("mostra a faixa quando são dias diferentes", () => {
    const r = { maisAntigo: "2026-08-01T10:00:00Z", maisRecente: "2026-08-20T10:00:00Z" };
    expect(periodoCoberto(r)).toMatch(/ a /);
  });
  it("mostra um dia só quando é o mesmo", () => {
    const r = { maisAntigo: "2026-08-20T08:00:00Z", maisRecente: "2026-08-20T18:00:00Z" };
    expect(periodoCoberto(r)).not.toMatch(/ a /);
  });
  it("sem período devolve null — a tela decide o que dizer", () => {
    expect(periodoCoberto({ maisAntigo: null, maisRecente: null })).toBeNull();
    expect(periodoCoberto(null)).toBeNull();
  });
});
