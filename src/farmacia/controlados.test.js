import { describe, it, expect } from "vitest";
import { LISTAS_PORTARIA_344, listaValida, camposControle, exigePrescritor, conferirPrescritor, camposDoPrescritor, rotuloDaLista } from "./controlados.js";

describe("lista da Portaria 344", () => {
  it("as dez listas de dispensação, na mesma ordem que o banco aceita", () => {
    expect(LISTAS_PORTARIA_344.map(l => l.codigo)).toEqual(["A1", "A2", "A3", "B1", "B2", "C1", "C2", "C3", "C4", "C5"]);
  });

  it("normaliza e recusa o que não é da portaria", () => {
    expect(listaValida(" b1 ")).toBe("B1");
    expect(listaValida("D1")).toBeNull();
    expect(listaValida("")).toBeNull();
    expect(rotuloDaLista("A1")).toBe("A1 — Entorpecentes");
    expect(rotuloDaLista(null)).toBe("sem lista");
  });

  it("🔴 banco que ainda não rodou a migração: sem coluna e sem valor, o campo NÃO vai no corpo", () => {
    expect(camposControle({ id: 1, controlado: true }, { controlado: true, lista_controle: "" })).toEqual({});
  });

  it("coluna existente vai sempre (inclusive para apagar)", () => {
    expect(camposControle({ lista_controle: "A1" }, { controlado: true, lista_controle: "" })).toEqual({ lista_controle: null });
    expect(camposControle({ lista_controle: null }, { controlado: true, lista_controle: "c1" })).toEqual({ lista_controle: "C1" });
  });

  it("🔴 desmarcar controlado apaga a lista — o banco recusaria lista em não controlado", () => {
    expect(camposControle({ lista_controle: "B1" }, { controlado: false, lista_controle: "B1" })).toEqual({ lista_controle: null });
  });
});

describe("prescritor na dispensação de controlado", () => {
  it("só dispensação de controlado exige", () => {
    expect(exigePrescritor({ controlado: true }, "Dispensação")).toBe(true);
    expect(exigePrescritor({ controlado: true }, "Perda / vencimento")).toBe(false);
    expect(exigePrescritor({ controlado: false }, "Dispensação")).toBe(false);
    expect(exigePrescritor(null, "Dispensação")).toBe(false);
  });

  it("nome em branco recusa", () => {
    expect(conferirPrescritor({ nome: "  " }).ok).toBe(false);
    expect(conferirPrescritor({ nome: "Dra. X" }).ok).toBe(true);
  });

  it("limpa os campos e só leva o número da receita quando há", () => {
    expect(camposDoPrescritor({ nome: " Dra. X ", registro: "CRM 1/RS" })).toEqual({ prescritor_nome: "Dra. X", prescritor_registro: "CRM 1/RS" });
    expect(camposDoPrescritor({ nome: "Dr. Y", registro: "", receita: " 123 " })).toEqual({ prescritor_nome: "Dr. Y", prescritor_registro: null, receita_numero: "123" });
  });
});
