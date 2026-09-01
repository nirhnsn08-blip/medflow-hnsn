// ═══════════════════════════════════════════════════════════
// ALMOXARIFADO — CATÁLOGO
//
// 🔴 DUAS COISAS AQUI SÃO REGRA, NÃO PREFERÊNCIA DE TELA.
//
// `SUP_INV_INTERVALO` diz de quantos em quantos dias cada classe da curva
// ABC precisa ser contada. Afrouxar um número faz o inventário parecer em
// dia sem que ninguém tenha contado nada — e o item classe A é justamente
// o que some primeiro.
//
// `SUP_MOTIVOS_SAIDA` é contrato com o kardex: "Ajuste de inventário" é o
// texto exato pelo qual a conciliação separa ajuste de consumo. Mudar a
// grafia faz o ajuste virar consumo no relatório, e o giro do item passa a
// mentir para cima.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  SUP_CATEGORIAS, SUP_UNIDADES, SUP_MOTIVOS_SAIDA, SUP_FARMACOS_MONITORADOS,
  SUP_PED_STATUS, SUP_REQ_STATUS, SUP_EXEC_COBERTURA_ALVO, SUP_INV_INTERVALO,
} from "./catalogo.js";
import { MOTIVO_ESTORNO } from "./inventario.js";

describe("🔴 a curva ABC e os intervalos de contagem", () => {
  it("as três classes, e o A conta mais vezes que o C", () => {
    expect(Object.keys(SUP_INV_INTERVALO).sort()).toEqual(["A", "B", "C"]);
    expect(SUP_INV_INTERVALO.A).toBeLessThan(SUP_INV_INTERVALO.B);
    expect(SUP_INV_INTERVALO.B).toBeLessThan(SUP_INV_INTERVALO.C);
  });

  it("⚠️ e nenhum intervalo passa de um trimestre", () => {
    // Contagem anual não é inventário rotativo: é achar a diferença um ano
    // depois, quando ninguém lembra de nada.
    for (const [classe, dias] of Object.entries(SUP_INV_INTERVALO)) {
      expect(dias, classe).toBeGreaterThan(0);
      expect(dias, classe).toBeLessThanOrEqual(90);
    }
  });

  it("a cobertura-alvo é um número de dias que faz sentido", () => {
    expect(SUP_EXEC_COBERTURA_ALVO).toBeGreaterThan(0);
    expect(SUP_EXEC_COBERTURA_ALVO).toBeLessThanOrEqual(180);
  });
});

describe("🔴 os motivos de saída são contrato com o kardex", () => {
  it("🔴 o motivo do ESTORNO não está na lista — e não pode estar", () => {
    // `MOTIVO_ESTORNO` ("Estorno") é gerado pelo sistema quando alguém
    // desfaz um movimento, e a conciliação de kardex o procura por esse
    // texto exato para separar reversão de consumo.
    //
    // Se ele aparecesse no <select> de saída, uma pessoa poderia escrever à
    // mão um "Estorno" que não desfaz movimento nenhum — e a conciliação
    // passaria a descontar uma reversão que nunca houve.
    //
    // ⚠️ Escrevi este teste ao contrário na primeira vez, esperando que o
    // motivo estivesse na lista. Está anotado porque a relação parece
    // óbvia dos dois lados, e ela é o oposto do que parece.
    expect(SUP_MOTIVOS_SAIDA).not.toContain(MOTIVO_ESTORNO);
    expect(MOTIVO_ESTORNO, "o texto que a conciliação procura").toBeTruthy();
  });

  it("⚠️ e existe um motivo de AJUSTE, que é o que a pessoa escolhe", () => {
    // O estorno desfaz um movimento específico; o ajuste corrige o saldo
    // depois de uma contagem. São coisas diferentes e ambas precisam
    // existir — sem o ajuste, quem conta e acha diferença não tem como
    // registrar sem inventar um consumo.
    expect(SUP_MOTIVOS_SAIDA.some(m => /ajuste/i.test(m))).toBe(true);
  });

  it("⚠️ existe um motivo de PERDA, separado de consumo", () => {
    // Perda e consumo saem do estoque igual, mas dizem coisas opostas
    // sobre a gestão. Juntar os dois some com a perda no indicador.
    expect(SUP_MOTIVOS_SAIDA.some(m => /perda|vencimento/i.test(m))).toBe(true);
    expect(SUP_MOTIVOS_SAIDA.some(m => /consumo/i.test(m))).toBe(true);
  });

  it("sem vazio e sem repetido", () => {
    expect(SUP_MOTIVOS_SAIDA.every(m => typeof m === "string" && m.trim())).toBe(true);
    expect(new Set(SUP_MOTIVOS_SAIDA).size).toBe(SUP_MOTIVOS_SAIDA.length);
  });
});

describe("as listas e os status", () => {
  it.each([
    ["SUP_CATEGORIAS", SUP_CATEGORIAS], ["SUP_UNIDADES", SUP_UNIDADES],
    ["SUP_FARMACOS_MONITORADOS", SUP_FARMACOS_MONITORADOS],
  ])("%s não tem vazio nem repetido", (_n, lista) => {
    expect(lista.length).toBeGreaterThan(0);
    expect(new Set(lista).size, "há repetido").toBe(lista.length);
    expect(lista.every(x => typeof x === "string" && x.trim())).toBe(true);
  });

  it.each([["SUP_PED_STATUS", SUP_PED_STATUS], ["SUP_REQ_STATUS", SUP_REQ_STATUS]])(
    "%s tem rótulo em toda entrada", (_n, mapa) => {
      // A tela lê `.label` direto. Uma entrada sem rótulo aparece em branco
      // e o filtro por status passa a ter uma opção sem nome.
      expect(Object.keys(mapa).length).toBeGreaterThan(1);
      for (const [k, v] of Object.entries(mapa)) {
        expect(v?.label ?? v, k).toBeTruthy();
      }
    });

  it("🔴 os fármacos monitorados estão em minúsculas, sem acento decorativo", () => {
    // A comparação com o nome do item é por `includes` sobre texto
    // normalizado. Uma entrada com maiúscula nunca casaria, e o item de
    // alto risco deixaria de ser monitorado — em silêncio.
    for (const f of SUP_FARMACOS_MONITORADOS) expect(f, f).toBe(f.toLowerCase());
  });
});
