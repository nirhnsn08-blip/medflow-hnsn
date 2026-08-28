// ═══════════════════════════════════════════════════════════
// A BARRA DE DENTRO DE UM MÓDULO, AGRUPADA
//
// 🔴 O defeito de origem: "Registrar incidente" era o 4º item de Segurança
// do Paciente, atrás de três telas de leitura — e 13 dos 17 perfis têm
// escrita nesse módulo. O ato mais praticado do sistema estava atrás dos
// painéis do núcleo.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { comGrupos, gruposDe } from "./sub-nav.js";

const NAV = [
  { key: "visao", label: "Visão geral" },
  { key: "registrar", label: "Registrar incidente", grupo: "Notificar" },
  { key: "consultar", label: "Consultar incidente", grupo: "Notificar" },
  { key: "fila", label: "Notificações", grupo: "Trabalho do núcleo" },
  { key: "causas", label: "Análise de causas", grupo: "Trabalho do núcleo" },
  { key: "indicadores", label: "Indicadores", grupo: "Acompanhar" },
];

describe("os cabeçalhos entram entre os blocos", () => {
  it("um cabeçalho por grupo, na posição certa", () => {
    const r = comGrupos(NAV).map(x => x.grupoTitulo || x.key);
    expect(r).toEqual([
      "visao",
      "Notificar", "registrar", "consultar",
      "Trabalho do núcleo", "fila", "causas",
      "Acompanhar", "indicadores",
    ]);
  });

  it("⚠️ item SEM grupo fica onde está, sem cabeçalho inventado", () => {
    // É o que deixa a home do módulo solta no topo, em vez de virar um
    // grupo de um item só — cabeçalho acima de uma linha é ruído.
    const r = comGrupos(NAV);
    expect(r[0]).toEqual({ key: "visao", label: "Visão geral" });
  });

  it("não repete cabeçalho de um grupo contínuo", () => {
    const r = comGrupos(NAV).filter(x => x.grupoTitulo === "Notificar");
    expect(r).toHaveLength(1);
  });
});

describe("🔴 a ordem sai da lista, não de ordenação interna", () => {
  it("o ato vem antes da leitura porque a lista diz isso", () => {
    // Ordenar por nome faria "Acompanhar" vir antes de "Notificar", e o ato
    // voltaria para o fim — o defeito de origem, reintroduzido por alfabeto.
    const r = comGrupos(NAV).map(x => x.grupoTitulo).filter(Boolean);
    expect(r).toEqual(["Notificar", "Trabalho do núcleo", "Acompanhar"]);
    expect(r.indexOf("Notificar")).toBeLessThan(r.indexOf("Acompanhar"));
  });

  it("grupo que reaparece depois ganha cabeçalho de novo — e isso é aviso", () => {
    // Não é feature: é o sintoma de uma lista mal ordenada aparecendo na
    // tela, em vez de ficar escondido.
    const bagunçada = [
      { key: "a", grupo: "X" }, { key: "b", grupo: "Y" }, { key: "c", grupo: "X" },
    ];
    const t = comGrupos(bagunçada).filter(x => x.grupoTitulo).map(x => x.grupoTitulo);
    expect(t).toEqual(["X", "Y", "X"]);
  });
});

describe("gruposDe", () => {
  it("lista os grupos na ordem de aparição, sem repetir", () => {
    expect(gruposDe(NAV)).toEqual(["Notificar", "Trabalho do núcleo", "Acompanhar"]);
  });
  it("barra sem grupo nenhum devolve lista vazia", () => {
    expect(gruposDe([{ key: "a" }, { key: "b" }])).toEqual([]);
    expect(gruposDe()).toEqual([]);
  });
});

describe("entrada estranha não derruba a barra", () => {
  it("lista vazia, nula, e item nulo no meio", () => {
    expect(comGrupos([])).toEqual([]);
    expect(comGrupos()).toEqual([]);
    expect(comGrupos(null)).toEqual([]);
    expect(comGrupos([{ key: "a" }, null, { key: "b" }]).map(x => x.key)).toEqual(["a", "b"]);
  });
});
