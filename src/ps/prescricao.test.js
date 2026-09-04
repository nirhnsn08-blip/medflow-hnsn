// ═══════════════════════════════════════════════════════════
// PRESCRIÇÃO NO PS
//
// 🔴 AS CINCO FUNÇÕES VIVIAM DENTRO DO `AtendimentoModal`, sem teste. Duas
// decidem coisas que chegam ao paciente: o que sugerir quando o
// medicamento acabou, e qual item saiu da farmácia sem ninguém registrar o
// que fez com ele.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  estoqueSinal, similaresComEstoque, dispensadoDoItem, semChecagem, pendentesDeChecagem,
} from "./prescricao.js";

// Um lote é o que `saldoDoMedicamento` soma: `medicamento_id` + `quantidade`.
const lote = (medId, qtd) => ({ medicamento_id: medId, quantidade: qtd });
const med = (id, extra = {}) => ({ id, nome: "Med " + id, ativo: true, ...extra });

describe("🔴 estoqueSinal — sinal, nunca saldo", () => {
  it("sem saldo é SEM ESTOQUE", () => {
    expect(estoqueSinal(med(1), [])).toMatchObject({ key: "zerado", label: "SEM ESTOQUE" });
    expect(estoqueSinal(med(1), [lote(1, 0)])).toMatchObject({ key: "zerado" });
  });

  it("saldo no mínimo ou abaixo é estoque baixo", () => {
    expect(estoqueSinal(med(1, { estoque_minimo: 10 }), [lote(1, 10)])).toMatchObject({ key: "baixo" });
    expect(estoqueSinal(med(1, { estoque_minimo: 10 }), [lote(1, 5)])).toMatchObject({ key: "baixo" });
  });

  it("🔴 COM estoque devolve `null`, e não um sinal verde", () => {
    // Um selo em cada medicamento disponível seria ruído em cima do que
    // está certo — e ruído em tela clínica é o começo da fadiga de alarme.
    expect(estoqueSinal(med(1, { estoque_minimo: 10 }), [lote(1, 11)])).toBe(null);
  });

  it("sem mínimo cadastrado, só o zero dispara", () => {
    expect(estoqueSinal(med(1), [lote(1, 1)])).toBe(null);
  });

  it("⚠️ o sinal NÃO carrega o saldo", () => {
    // Mostrar "3 unidades" convida o médico a calcular quantas doses cabem,
    // e a decisão de dose é clínica, não de estoque.
    const s = estoqueSinal(med(1, { estoque_minimo: 10 }), [lote(1, 3)]);
    expect(Object.keys(s).sort()).toEqual(["cor", "key", "label"]);
    expect(JSON.stringify(s)).not.toMatch(/\b3\b/);
  });

  it("medicamento nulo não estoura", () => {
    expect(estoqueSinal(null, [])).toBe(null);
    expect(estoqueSinal(undefined, null)).toBe(null);
  });
});

describe("🔴 similaresComEstoque — o que prescrever no lugar", () => {
  const catalogo = [
    med(1, { principio_ativo: "Dipirona", classe: "Analgésico" }),   // o que acabou
    med(2, { principio_ativo: "Dipirona", classe: "Analgésico" }),   // mesmo PA, com saldo
    med(3, { principio_ativo: "Paracetamol", classe: "Analgésico" }),// mesma classe, com saldo
    med(4, { principio_ativo: "Dipirona", classe: "Analgésico" }),   // mesmo PA, SEM saldo
    med(5, { principio_ativo: "Amoxicilina", classe: "Antibiótico" }),
  ];
  const lotes = [lote(2, 50), lote(3, 30), lote(5, 20)];

  it("🔴 mesmo princípio ativo vem PRIMEIRO", () => {
    // É substituição direta. Mesma classe é decisão clínica maior, e pôr a
    // mais arriscada no topo da lista seria empurrá-la.
    const r = similaresComEstoque(catalogo[0], catalogo, lotes);
    expect(r[0]).toMatchObject({ motivo: "mesmo princípio ativo" });
    expect(r[0].m.id).toBe(2);
  });

  it("depois vem a mesma classe", () => {
    const r = similaresComEstoque(catalogo[0], catalogo, lotes);
    expect(r.map(x => x.motivo)).toEqual(["mesmo princípio ativo", "mesma classe"]);
    expect(r.map(x => x.m.id)).toEqual([2, 3]);
  });

  it("🔴 só entra o que TEM SALDO", () => {
    // Sugerir alternativa que também acabou gasta o tempo de quem está com
    // o paciente na frente.
    const r = similaresComEstoque(catalogo[0], catalogo, lotes);
    expect(r.map(x => x.m.id)).not.toContain(4);
  });

  it("⚠️ o próprio medicamento nunca aparece nos seus similares", () => {
    const r = similaresComEstoque(catalogo[0], catalogo, [...lotes, lote(1, 99)]);
    expect(r.map(x => x.m.id)).not.toContain(1);
  });

  it("medicamento de outra classe e outro PA não entra", () => {
    const r = similaresComEstoque(catalogo[0], catalogo, lotes);
    expect(r.map(x => x.m.id)).not.toContain(5);
  });

  it("inativo não é sugerido", () => {
    const cat = [...catalogo, med(6, { principio_ativo: "Dipirona", ativo: false })];
    const r = similaresComEstoque(catalogo[0], cat, [...lotes, lote(6, 10)]);
    expect(r.map(x => x.m.id)).not.toContain(6);
  });

  it("sem princípio ativo cadastrado, cai só na classe", () => {
    const semPA = med(9, { classe: "Analgésico" });
    const r = similaresComEstoque(semPA, catalogo, lotes);
    expect(r.every(x => x.motivo === "mesma classe")).toBe(true);
  });

  it("não repete o mesmo item nas duas listas", () => {
    const r = similaresComEstoque(catalogo[0], catalogo, lotes);
    expect(new Set(r.map(x => x.m.id)).size).toBe(r.length);
  });

  it("entradas estranhas devolvem lista vazia", () => {
    expect(similaresComEstoque(null, catalogo, lotes)).toEqual([]);
    expect(similaresComEstoque(catalogo[0], null, lotes)).toEqual([]);
  });
});

describe("dispensadoDoItem", () => {
  const saidas = [
    { prescricao_item_id: 10, quantidade: 2 },
    { prescricao_item_id: 10, quantidade: 3 },
    { prescricao_item_id: 20, quantidade: 5 },
  ];

  it("soma as saídas do item", () => {
    expect(dispensadoDoItem(10, saidas)).toBe(5);
  });

  it("compara id como TEXTO — o banco devolve número, a tela às vezes string", () => {
    expect(dispensadoDoItem("10", saidas)).toBe(5);
  });

  it("item sem saída nenhuma é zero", () => {
    expect(dispensadoDoItem(99, saidas)).toBe(0);
    expect(dispensadoDoItem(10, [])).toBe(0);
    expect(dispensadoDoItem(10, null)).toBe(0);
  });
});

describe("🔴 pendentesDeChecagem — medicamento fora do estoque E fora do prontuário", () => {
  const itens = [{ id: 10 }, { id: 20 }, { id: 30 }];
  const saidas = [
    { prescricao_item_id: 10, quantidade: 1 },   // dispensado
    { prescricao_item_id: 20, quantidade: 1 },   // dispensado
  ];                                             // o 30 não foi dispensado

  it("dispensado e sem checagem NENHUMA entra na lista", () => {
    expect(pendentesDeChecagem(itens, saidas, []).map(i => i.id)).toEqual([10, 20]);
  });

  it("🔴 item NÃO dispensado não entra — é a fila normal da farmácia", () => {
    // Misturar os dois encheria a lista de ruído, e ela deixaria de ser lida.
    expect(pendentesDeChecagem(itens, saidas, []).map(i => i.id)).not.toContain(30);
  });

  it("administrado sai da lista", () => {
    const adms = [{ prescricao_item_id: 10, status: "administrado" }];
    expect(pendentesDeChecagem(itens, saidas, adms).map(i => i.id)).toEqual([20]);
  });

  it("🔴 JUSTIFICADO também sai — quem não deu e escreveu por quê já checou", () => {
    // O que fica pendente é o SILÊNCIO, não a não-administração.
    const adms = [{ prescricao_item_id: 10, status: "nao_administrado", motivo: "recusa do paciente" }];
    expect(pendentesDeChecagem(itens, saidas, adms).map(i => i.id)).toEqual([20]);
  });

  it("checagem de OUTRO item não limpa este", () => {
    const adms = [{ prescricao_item_id: 999, status: "administrado" }];
    expect(pendentesDeChecagem(itens, saidas, adms).map(i => i.id)).toEqual([10, 20]);
  });

  it("id em texto e em número são o mesmo item", () => {
    const adms = [{ prescricao_item_id: "10", status: "administrado" }];
    expect(pendentesDeChecagem(itens, saidas, adms).map(i => i.id)).toEqual([20]);
  });

  it("entradas estranhas não estouram", () => {
    for (const args of [[null, null, null], [undefined, [], []], [[], null, undefined]]) {
      expect(() => pendentesDeChecagem(...args)).not.toThrow();
      expect(pendentesDeChecagem(...args)).toEqual([]);
    }
  });
});

describe("semChecagem", () => {
  it("sem administração é `true`", () => {
    expect(semChecagem({ id: 1 }, [])).toBe(true);
    expect(semChecagem({ id: 1 }, null)).toBe(true);
  });
  it("com qualquer administração é `false`", () => {
    expect(semChecagem({ id: 1 }, [{ prescricao_item_id: 1 }])).toBe(false);
  });
  it("item nulo não estoura", () => {
    expect(() => semChecagem(null, [])).not.toThrow();
  });
});
