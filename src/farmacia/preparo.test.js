// ═══════════════════════════════════════════════════════════
// PREPARO DA FARMÁCIA
//
// 🔴 O DEFEITO QUE ORIGINOU O ARQUIVO, reproduzido na tela do banco de
// teste: recebi a prescrição do paciente T9001, abri o modal de
// dispensação, FECHEI SEM DISPENSAR NADA, cliquei em "Marcar pronto" e
// depois em "Confirmar retirada". A prescrição foi para "Retirados hoje",
// e o estoque não se moveu. Nas duas abas da mesma farmácia:
//
//   Solicitações  → "Retirados hoje (1)"          (recebeu)
//   Dispensações  → "2 item(ns) · 2 pendente(s)"  (nunca dispensado)
//
// Esse paciente tinha alerta de dose máxima e de medicamento inapropriado
// para idoso.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  podeMarcarPronto, conferirSeparacao, itensDaPrescricao, dispensadoDoItem,
} from "./preparo.js";

const REG = { id: 10, atendimento_id: 500 };
const item = (id, nome, extra = {}) =>
  ({ id, atendimento_id: 500, registro_id: 10, medicamento_nome: nome, ...extra });
const saida = (itemId, qtd = 1) => ({ prescricao_item_id: itemId, quantidade: qtd });

describe("o que a regra RECUSA", () => {
  it("🔴 marcar pronto sem ter separado NADA", () => {
    const r = podeMarcarPronto({
      registro: REG,
      itens: [item(1, "Paracetamol 500 mg"), item(2, "Glibenclamida 5 mg")],
      saidas: [],
    });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/Nada foi separado/);
    expect(r.erros.join(" ")).toMatch(/ninguém tirou da prateleira/);
  });

  it("recusa mesmo com saída de OUTRA prescrição no mesmo paciente", () => {
    // A saída existe, mas é de outro item — o balde do paciente não vale,
    // vale o item. Sem isto, dispensar uma prescrição liberaria a outra.
    const r = podeMarcarPronto({
      registro: REG,
      itens: [item(1, "Paracetamol 500 mg")],
      saidas: [saida(99, 6)],
    });
    expect(r.ok).toBe(false);
  });

  it("quantidade zero ou negativa não conta como separação", () => {
    expect(podeMarcarPronto({ registro: REG, itens: [item(1, "Dipirona")], saidas: [saida(1, 0)] }).ok).toBe(false);
    expect(podeMarcarPronto({ registro: REG, itens: [item(1, "Dipirona")], saidas: [saida(1, -3)] }).ok).toBe(false);
    expect(podeMarcarPronto({ registro: REG, itens: [item(1, "Dipirona")], saidas: [saida(1, null)] }).ok).toBe(false);
  });
});

describe("o que a regra PERMITE — e por quê", () => {
  it("separação completa passa em silêncio", () => {
    const r = podeMarcarPronto({
      registro: REG,
      itens: [item(1, "Paracetamol 500 mg"), item(2, "Glibenclamida 5 mg")],
      saidas: [saida(1, 6), saida(2, 1)],
    });
    expect(r.ok).toBe(true);
    expect(r.avisos).toEqual([]);
    expect(r.quadro.completo).toBe(true);
  });

  it("⚠️ separação PARCIAL passa, avisa e nomeia o que falta", () => {
    // Ruptura de estoque é rotina — 162 itens sem saldo no banco de teste.
    // Travar aqui empurraria a farmácia a registrar mentira noutro campo.
    const r = podeMarcarPronto({
      registro: REG,
      itens: [item(1, "Paracetamol 500 mg"), item(2, "Glibenclamida 5 mg"), item(3, "Omeprazol 20 mg")],
      saidas: [saida(1, 6)],
    });
    expect(r.ok).toBe(true);
    expect(r.avisos.join(" ")).toMatch(/1 de 3 itens separados/);
    expect(r.avisos.join(" ")).toMatch(/Glibenclamida 5 mg, Omeprazol 20 mg/);
    expect(r.avisos.join(" ")).toMatch(/intervenção/);
  });

  it("prescrição SEM item estruturado passa — não há o que separar", () => {
    // Registro antigo, anterior à Fase B. Travar congelaria uma fila que
    // ninguém consegue destravar.
    const r = podeMarcarPronto({ registro: REG, itens: [], saidas: [] });
    expect(r.ok).toBe(true);
    expect(r.erros).toEqual([]);
    expect(r.avisos).toEqual([]);
  });

  it("aguenta entrada nula sem quebrar a tela", () => {
    expect(podeMarcarPronto().ok).toBe(true);
    expect(podeMarcarPronto({ registro: null, itens: null, saidas: null }).ok).toBe(true);
  });
});

describe("de quem são os itens", () => {
  it("cada prescrição tem a sua sacola, mesmo no mesmo atendimento", () => {
    const itens = [
      item(1, "Paracetamol"), item(2, "Dipirona"),
      { id: 3, atendimento_id: 500, registro_id: 11, medicamento_nome: "Omeprazol" },
    ];
    expect(itensDaPrescricao(REG, itens).map(i => i.id)).toEqual([1, 2]);
    expect(itensDaPrescricao({ id: 11, atendimento_id: 500 }, itens).map(i => i.id)).toEqual([3]);
  });

  it("item de outro atendimento nunca entra", () => {
    const itens = [item(1, "Paracetamol"), { id: 9, atendimento_id: 777, registro_id: 10, medicamento_nome: "X" }];
    expect(itensDaPrescricao(REG, itens).map(i => i.id)).toEqual([1]);
  });

  it("🔴 dado antigo sem `registro_id` recua para os itens do atendimento", () => {
    // Sem este recuo a regra veria "nenhum item", concluiria que não há o
    // que separar, e liberaria — o buraco continuaria aberto exatamente
    // onde a gente testa, porque o seed grava os itens sem a ligação.
    const antigos = [
      { id: 1, atendimento_id: 500, medicamento_nome: "Paracetamol" },
      { id: 2, atendimento_id: 500, medicamento_nome: "Glibenclamida" },
    ];
    expect(itensDaPrescricao(REG, antigos).map(i => i.id)).toEqual([1, 2]);
    expect(podeMarcarPronto({ registro: REG, itens: antigos, saidas: [] }).ok).toBe(false);
  });

  it("…mas NÃO recua quando a ligação existe e é de outra prescrição", () => {
    // Aqui o dado é novo e diz que esta prescrição não tem item. Recuar
    // faria a prescrição herdar a sacola da vizinha.
    const itens = [{ id: 3, atendimento_id: 500, registro_id: 11, medicamento_nome: "Omeprazol" }];
    expect(itensDaPrescricao(REG, itens)).toEqual([]);
    expect(podeMarcarPronto({ registro: REG, itens, saidas: [] }).ok).toBe(true);
  });
});

describe("🔴 o estorno devolve, e a conta sabe disso", () => {
  const itens = [{ id: 1, atendimento_id: 9, registro_id: 5, medicamento_nome: "Dipirona" }];
  const reg = { id: 5, atendimento_id: 9 };

  it("dispensação estornada volta a contar como NÃO separada", () => {
    // Sem isto, a prescrição ficaria "pronta para retirada" depois de o
    // medicamento ter voltado para a farmácia — a mesma mentira que
    // podeMarcarPronto impede, entrando pela outra ponta.
    const saidas = [
      { prescricao_item_id: 1, quantidade: 2, tipo: "saida" },
      { prescricao_item_id: 1, quantidade: 2, tipo: "entrada", estorno_de: 77 },
    ];
    expect(dispensadoDoItem(1, saidas)).toBe(0);
    const r = podeMarcarPronto({ registro: reg, itens, saidas });
    expect(r.ok).toBe(false);
    expect(r.quadro.nenhum).toBe(true);
  });

  it("estorno parcial deixa o que sobrou", () => {
    const saidas = [
      { prescricao_item_id: 1, quantidade: 5, tipo: "saida" },
      { prescricao_item_id: 1, quantidade: 2, tipo: "entrada" },
    ];
    expect(dispensadoDoItem(1, saidas)).toBe(3);
    expect(podeMarcarPronto({ registro: reg, itens, saidas }).ok).toBe(true);
  });

  it("movimento sem tipo continua contando como saída (dado antigo)", () => {
    expect(dispensadoDoItem(1, [{ prescricao_item_id: 1, quantidade: 4 }])).toBe(4);
  });
});

describe("o quadro da separação", () => {
  it("soma várias saídas do mesmo item", () => {
    expect(dispensadoDoItem(1, [saida(1, 2), saida(1, 4)])).toBe(6);
    expect(dispensadoDoItem(1, [])).toBe(0);
    expect(dispensadoDoItem(1, null)).toBe(0);
  });

  it("compara id como texto — o banco devolve número, a tela às vezes string", () => {
    expect(dispensadoDoItem("1", [{ prescricao_item_id: 1, quantidade: 5 }])).toBe(5);
    expect(dispensadoDoItem(1, [{ prescricao_item_id: "1", quantidade: 5 }])).toBe(5);
  });

  it("item sem nome não vira linha em branco no aviso", () => {
    const q = conferirSeparacao({ itens: [{ id: 1 }], saidas: [] });
    expect(q.faltando).toEqual(["item sem nome"]);
  });
});
