// ═══════════════════════════════════════════════════════════
// Aprovação de pedido de compra.
//
// Dois controles que não existiam: quem pede não aprova o próprio pedido,
// e valor acima da alçada sobe um nível. Alçada é o controle mais básico
// de compra e o primeiro que um auditor procura.
//
// Validados por mutação:
//   • autoaprovação deixando de ser conferida ..... derruba a segregação
//   • comparação de nome sensível a caixa/espaço .. derruba o caso real
//   • alçada opinando sem limite configurado ...... derruba a compra do hospital que não configurou
//   • alçada usando >= em vez de > ................ derruba o pedido exatamente no limite
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  SEM_LIMITE, ehAutoaprovacao, excedeAlcada, podeAprovarPedido,
  descreverAlcada, validarLimite,
} from "./aprovacao.js";

const MATRIZ = { name: "Carla Matriz" };
const OUTRO = { name: "Ana Compras" };
const ped = (o = {}) => ({ id: 7, usuario: "Ana Compras", status: "aguardando_aprovacao", ...o });

describe("ehAutoaprovacao", () => {
  it("🔴 quem criou o pedido é reconhecido ao tentar aprovar", () => {
    expect(ehAutoaprovacao(ped(), OUTRO)).toBe(true);
  });

  it("pessoa diferente não é autoaprovação", () => {
    expect(ehAutoaprovacao(ped(), MATRIZ)).toBe(false);
  });

  it("🔴 caixa e espaço não driblam a conferência", () => {
    // "ana compras" e "Ana  Compras" são a mesma pessoa — comparar cru
    // deixaria o defeito passar pela porta dos fundos.
    expect(ehAutoaprovacao(ped({ usuario: "ana compras" }), { name: "Ana Compras" })).toBe(true);
    expect(ehAutoaprovacao(ped({ usuario: "Ana  Compras " }), { name: "Ana Compras" })).toBe(true);
  });

  it("sem nome de um dos lados não afirma nada", () => {
    // Melhor deixar passar e registrar na trilha do que travar uma compra
    // por causa de um campo vazio.
    expect(ehAutoaprovacao(ped({ usuario: null }), OUTRO)).toBe(false);
    expect(ehAutoaprovacao(ped(), { name: "" })).toBe(false);
    expect(ehAutoaprovacao(null, OUTRO)).toBe(false);
  });
});

describe("excedeAlcada", () => {
  it("acima do limite excede", () => {
    expect(excedeAlcada(1500, { limite: 1000 })).toBe(true);
  });

  it("abaixo do limite não excede", () => {
    expect(excedeAlcada(500, { limite: 1000 })).toBe(false);
  });

  it("🔴 exatamente no limite NÃO excede — o limite é o teto permitido", () => {
    expect(excedeAlcada(1000, { limite: 1000 })).toBe(false);
  });

  it("🔴 sem limite configurado a regra CALA", () => {
    // Hospital que ainda não definiu alçada não pode ter a compra travada
    // por um número que ninguém escolheu.
    expect(excedeAlcada(999999, { limite: SEM_LIMITE })).toBe(false);
    expect(excedeAlcada(999999, {})).toBe(false);
    expect(excedeAlcada(999999, { limite: 0 })).toBe(false);
    expect(excedeAlcada(999999, { limite: "abc" })).toBe(false);
  });

  it("ADM Master não tem teto — é a porta de volta quando a matriz falta", () => {
    expect(excedeAlcada(999999, { limite: 1000, isMaster: true })).toBe(false);
  });

  it("valor não numérico não vira travamento acidental", () => {
    expect(excedeAlcada("abc", { limite: 1000 })).toBe(false);
    expect(excedeAlcada(null, { limite: 1000 })).toBe(false);
  });
});

describe("podeAprovarPedido", () => {
  const ctx = (o = {}) => ({ usuario: MATRIZ, ehMatriz: true, canEdit: true, ...o });

  it("matriz aprova pedido de outra pessoa", () => {
    expect(podeAprovarPedido(ped(), ctx()).pode).toBe(true);
  });

  it("quem não é matriz nem master não aprova", () => {
    const r = podeAprovarPedido(ped(), ctx({ ehMatriz: false }));
    expect(r.pode).toBe(false);
    expect(r.motivo).toMatch(/Só a matriz/);
  });

  it("somente leitura não aprova", () => {
    expect(podeAprovarPedido(ped(), ctx({ canEdit: false })).pode).toBe(false);
  });

  it("🔴 matriz NÃO aprova o próprio pedido, e o motivo diz o nome", () => {
    const r = podeAprovarPedido(ped({ usuario: "Carla Matriz" }), ctx());
    expect(r.pode).toBe(false);
    expect(r.motivo).toMatch(/Carla Matriz/);
    expect(r.motivo).toMatch(/quem pede não aprova/);
  });

  it("nem o ADM Master aprova o próprio pedido", () => {
    // Cargo não resolve conflito de interesse: o problema é ser a mesma
    // pessoa, não o nível de acesso.
    const r = podeAprovarPedido(ped({ usuario: "Chefe" }), ctx({ usuario: { name: "Chefe" }, isMaster: true, ehMatriz: false }));
    expect(r.pode).toBe(false);
    expect(r.motivo).toMatch(/quem pede não aprova/);
  });

  it("acima da alçada recusa, com o limite na mensagem", () => {
    const r = podeAprovarPedido(ped(), ctx({ limite: 1000, total: 5000 }));
    expect(r.pode).toBe(false);
    expect(r.motivo).toMatch(/alçada/);
    expect(r.motivo).toMatch(/1\.000,00/);
  });

  it("dentro da alçada aprova", () => {
    expect(podeAprovarPedido(ped(), ctx({ limite: 1000, total: 800 })).pode).toBe(true);
  });

  it("master passa por cima da alçada, mas não da autoaprovação", () => {
    expect(podeAprovarPedido(ped(), ctx({ isMaster: true, limite: 1000, total: 5000 })).pode).toBe(true);
    expect(podeAprovarPedido(ped({ usuario: "Carla Matriz" }), ctx({ isMaster: true, limite: 1000, total: 5000 })).pode).toBe(false);
  });

  it("a recusa mais fundamental vence: autoaprovação antes de alçada", () => {
    const r = podeAprovarPedido(ped({ usuario: "Carla Matriz" }), ctx({ limite: 1000, total: 5000 }));
    expect(r.motivo).toMatch(/quem pede não aprova/);
    expect(r.motivo).not.toMatch(/alçada/);
  });
});

describe("descreverAlcada", () => {
  it("sem limite, diz que não há controle em vez de fingir que há", () => {
    expect(descreverAlcada(null)).toMatch(/Sem alçada configurada/);
    expect(descreverAlcada(0)).toMatch(/Sem alçada configurada/);
  });
  it("com limite, mostra o valor", () => {
    expect(descreverAlcada(2500)).toMatch(/2\.500,00/);
  });
});

describe("validarLimite", () => {
  it("vazio é válido — é como se desliga", () => {
    expect(validarLimite("")).toEqual({ ok: true, valor: null, erro: null });
    expect(validarLimite(null).ok).toBe(true);
  });
  it("aceita vírgula decimal, que é como se digita em português", () => {
    expect(validarLimite("1500,50").valor).toBe(1500.5);
  });
  it("🔴 zero é recusado — travaria toda compra", () => {
    const r = validarLimite("0");
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/branco para desligar/);
  });
  it("negativo é recusado", () => {
    expect(validarLimite("-5").ok).toBe(false);
  });
  it("texto é recusado", () => {
    expect(validarLimite("mil").ok).toBe(false);
  });
});
