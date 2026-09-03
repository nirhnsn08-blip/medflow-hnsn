// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// ATENDIMENTO — a aba em que ele abre
//
// 🔴 `abaInicial` existe para um atalho entre módulos: a tela de importação
// de preço, num hospital sem convênio, leva direto ao cadastro. Sem isso a
// pessoa lê "vá em Atendimento → Tabelas" e procura sozinha — no primeiro
// minuto de uso, que num produto vendido a vários hospitais é a primeira
// impressão de todo cliente novo.
//
// ⚠️ E O ATALHO NÃO PODE GRUDAR. Se a aba ficasse guardada, o próximo
// clique em "Atendimento" na barra lateral cairia em Tabelas em vez de
// Recepção — trocando o atalho de uma pessoa pela navegação de todas.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import Atendimento from "./Atendimento.jsx";

afterEach(cleanup);

const abrir = abaInicial =>
  render(<Atendimento sb={async () => []} currentUser={{ name: "T" }} canEdit={true} abaInicial={abaInicial} />);

const aba = nome => [...document.querySelectorAll("button")].find(b => b.textContent.trim() === nome);
const estaSelecionada = b => /700/.test(b.getAttribute("style") || "");

describe("em qual aba o módulo abre", () => {
  it("sem pedido nenhum, abre na Recepção", () => {
    abrir(undefined);
    expect(estaSelecionada(aba("Recepção"))).toBe(true);
  });

  it("🔴 `null` também abre na Recepção — é o que o atalho zerado devolve", () => {
    // A barra lateral zera a aba a cada clique. Se `null` caísse em outra
    // coisa, a navegação normal ficaria dependendo do atalho anterior.
    abrir(null);
    expect(estaSelecionada(aba("Recepção"))).toBe(true);
  });

  it("com o pedido, abre direto em Tabelas", () => {
    abrir("tabelas");
    expect(estaSelecionada(aba("Tabelas"))).toBe(true);
    expect(estaSelecionada(aba("Recepção"))).toBe(false);
  });

  it("as cinco abas continuam lá", () => {
    abrir();
    for (const n of ["Recepção", "Agenda", "Consultas", "Faturamento", "Tabelas"]) {
      expect(aba(n), n).toBeTruthy();
    }
  });
});
