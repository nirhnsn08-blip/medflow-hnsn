// ═══════════════════════════════════════════════════════════
// A MARCA DE FALHA DE LEITURA
//
// Duas coisas precisam ser verdade ao mesmo tempo, e elas puxam para
// lados opostos:
//
//   1. `FALHA` tem que se comportar como lista vazia comum, senão as ~100
//      chamadas que não sabem da marca quebram.
//   2. `FALHA` tem que ser DISTINGUÍVEL de uma lista vazia comum, senão a
//      marca não serve para nada.
//
// Se um dia alguém trocar `FALHA` por `[]` literal dentro de `listaLida()`, o
// código continua funcionando e só o item 2 morre — em silêncio. É esse
// silêncio que os testes abaixo quebram.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { FALHA, listaLida, naoDeuParaLer, algumaFalhou, avisoDeFalha } from "./leitura.js";

describe("🔴 falha de leitura × ausência de dado", () => {
  it("null (a rede falhou) vira lista MARCADA", () => {
    expect(naoDeuParaLer(listaLida(null))).toBe(true);
  });

  it("[] vindo do banco (não há nenhum) NÃO é marcado", () => {
    // Esta é a distinção inteira. O banco respondeu, e a resposta é
    // "nenhum". Isso é informação boa e não pode virar aviso vermelho.
    expect(naoDeuParaLer(listaLida([]))).toBe(false);
  });

  it("lista com dados passa intocada — a MESMA referência", () => {
    const rows = [{ id: 1 }];
    expect(listaLida(rows)).toBe(rows);
    expect(naoDeuParaLer(listaLida(rows))).toBe(false);
  });

  it("undefined, objeto e string também contam como falha", () => {
    // PostgREST pode devolver `{message: ...}` num erro. Nada disso é lista.
    for (const x of [undefined, {}, { message: "erro" }, "", "abc", 0]) {
      expect(naoDeuParaLer(listaLida(x)), JSON.stringify(x)).toBe(true);
    }
  });
});

describe("⚠️ FALHA se comporta como lista vazia comum", () => {
  // Se qualquer um destes quebrar, as cargas convertidas derrubam tela.
  const f = listaLida(null);

  it("tem length 0", () => { expect(f.length).toBe(0); });
  it("é array", () => { expect(Array.isArray(f)).toBe(true); });
  it("map/filter/some não estouram", () => {
    expect(f.map(x => x)).toEqual([]);
    expect(f.filter(Boolean)).toEqual([]);
    expect(f.some(Boolean)).toBe(false);
  });
  it("espalhar funciona", () => { expect([...f, 1]).toEqual([1]); });
  it("for..of não roda nenhuma volta", () => {
    let n = 0; for (const _ of f) n++;
    expect(n).toBe(0);
  });
  it("é igual a [] em comparação de valor", () => { expect(f).toEqual([]); });
});

describe("⚠️ a marca não sobrevive a transformação, e isso é intencional", () => {
  it("filtrar perde a marca", () => {
    // Documentado de propósito: a marca vale da carga até a tela. Quem
    // transformar antes de mostrar precisa perguntar ANTES de transformar.
    expect(naoDeuParaLer(listaLida(null).filter(Boolean))).toBe(false);
  });
});

describe("algumaFalhou", () => {
  it("acusa se qualquer uma das listas falhou", () => {
    expect(algumaFalhou(listaLida([1]), listaLida([]), listaLida(null))).toBe(true);
  });
  it("fica quieto quando todas foram lidas", () => {
    expect(algumaFalhou(listaLida([1]), listaLida([]))).toBe(false);
  });
  it("sem nenhuma lista, não acusa nada", () => {
    expect(algumaFalhou()).toBe(false);
  });
});

describe("o aviso", () => {
  it("diz o que a pessoa perde, e não o erro técnico", () => {
    const t = avisoDeFalha("os lotes da farmácia");
    expect(t).toContain("os lotes da farmácia");
    expect(t).toMatch(/INCOMPLETA/);
    // nada de jargão de rede na cara de quem está na bancada
    expect(t).not.toMatch(/HTTP|fetch|500|undefined|null/i);
  });
});

describe("🔴 FALHA é congelado", () => {
  it("empurrar item dentro estoura em vez de sujar todas as outras telas", () => {
    // Se não fosse congelado, um `push` num lugar contaminaria TODA carga
    // que falhasse depois — é a mesma referência no sistema inteiro.
    expect(() => { FALHA.push(1); }).toThrow();
    expect(FALHA.length).toBe(0);
  });
});
