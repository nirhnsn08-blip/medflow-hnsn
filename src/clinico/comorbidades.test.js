// Testes do catálogo de comorbidades da triagem.
// As chaves precisam ser estáveis: o motor de alertas (alertas.js) e os
// relatórios dependem delas. Em especial as que alimentam os alertas de dose.

import { describe, it, expect } from "vitest";
import { COMORBIDADES, COMORBIDADE_LABEL, rotulosComorbidades } from "./comorbidades.js";

describe("catálogo de comorbidades", () => {
  it("tem as comorbidades clinicamente ativas (alimentam os alertas)", () => {
    const chaves = COMORBIDADES.map(c => c.chave);
    for (const k of ["drc", "drc_dialise", "hepatopatia"]) expect(chaves).toContain(k);
  });
  it("toda comorbidade tem chave e rótulo", () => {
    expect(COMORBIDADES.length).toBeGreaterThan(5);
    for (const c of COMORBIDADES) { expect(c.chave).toBeTruthy(); expect(c.label).toBeTruthy(); }
  });
  it("COMORBIDADE_LABEL mapeia chave → rótulo", () => {
    expect(COMORBIDADE_LABEL.drc_dialise).toMatch(/diálise/i);
  });
});

describe("rotulosComorbidades", () => {
  it("devolve os rótulos na ordem do catálogo", () => {
    expect(rotulosComorbidades(["dm", "has"])).toEqual([COMORBIDADE_LABEL.has, COMORBIDADE_LABEL.dm]);
  });
  it("ignora chave desconhecida e entrada não-array", () => {
    expect(rotulosComorbidades(["xpto", "drc"])).toEqual([COMORBIDADE_LABEL.drc]);
    expect(rotulosComorbidades(null)).toEqual([]);
    expect(rotulosComorbidades(undefined)).toEqual([]);
  });
});
