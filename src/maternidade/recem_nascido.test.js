import { describe, it, expect } from "vitest";
import { avaliarPeso, classificarIdadeGestacional, capurroSomatico, avaliarApgar, CAPURRO } from "./recem_nascido.js";

describe("avaliarPeso", () => {
  it("as faixas e o corte de baixo peso (2500 g)", () => {
    expect(avaliarPeso(999).classe).toBe("extremo_baixo");
    expect(avaliarPeso(1499).classe).toBe("muito_baixo");
    expect(avaliarPeso(2499).classe).toBe("baixo");
    expect(avaliarPeso(2500).classe).toBe("adequado");
    expect(avaliarPeso(3999).classe).toBe("adequado");
    expect(avaliarPeso(4000).classe).toBe("macrossomia");
  });
  it("baixoPeso é <2500, e o limiar não conta como baixo", () => {
    expect(avaliarPeso(2499).baixoPeso).toBe(true);
    expect(avaliarPeso(2500).baixoPeso).toBe(false);
  });
  it("sem peso não avalia (nada de fingir 0)", () => {
    expect(avaliarPeso("").avaliado).toBe(false);
    expect(avaliarPeso(0).avaliado).toBe(false);
    expect(avaliarPeso(null).avaliado).toBe(false);
  });
});

describe("classificarIdadeGestacional", () => {
  it("pré-termo e seus subtipos", () => {
    expect(classificarIdadeGestacional(27)).toMatchObject({ classe: "pretermo", subclasse: "extremo" });
    expect(classificarIdadeGestacional(30)).toMatchObject({ classe: "pretermo", subclasse: "muito" });
    expect(classificarIdadeGestacional(33)).toMatchObject({ classe: "pretermo", subclasse: "moderado" });
    expect(classificarIdadeGestacional(36)).toMatchObject({ classe: "pretermo", subclasse: "tardio" });
  });
  it("termo e seus subtipos", () => {
    expect(classificarIdadeGestacional(37)).toMatchObject({ classe: "termo", subclasse: "precoce" });
    expect(classificarIdadeGestacional(39)).toMatchObject({ classe: "termo", subclasse: "pleno" });
    expect(classificarIdadeGestacional(41)).toMatchObject({ classe: "termo", subclasse: "tardio" });
  });
  it("pós-termo a partir de 42", () => {
    expect(classificarIdadeGestacional(42).classe).toBe("postermo");
    expect(classificarIdadeGestacional(41.9).classe).toBe("termo");
  });
  it("sem IG não avalia", () => {
    expect(classificarIdadeGestacional("").avaliado).toBe(false);
    expect(classificarIdadeGestacional(null).avaliado).toBe(false);
  });
});

describe("capurroSomatico", () => {
  it("tudo zero → 204 dias = 29 sem 1 dia (a constante do método)", () => {
    const r = capurroSomatico({ pele: 0, orelha: 0, mama: 0, mamilo: 0, plantar: 0 });
    expect(r).toMatchObject({ completo: true, soma: 0, dias: 204, semanas: 29, diasResto: 1 });
  });
  it("um exemplo a termo: soma 66 → 270 dias = 38 sem 4 dias", () => {
    const r = capurroSomatico({ pele: 15, orelha: 16, mama: 10, mamilo: 10, plantar: 15 });
    expect(r).toMatchObject({ soma: 66, dias: 270, semanas: 38, diasResto: 4 });
  });
  it("faltando um sinal, não estima e diz qual falta", () => {
    const r = capurroSomatico({ pele: 15, orelha: 16, mama: 10, mamilo: 10 }); // sem plantar
    expect(r.completo).toBe(false);
    expect(r.falta).toBe(CAPURRO.plantar.rotulo);
    expect(r.semanas).toBe(null);
  });
  it("sinal em branco também é incompleto", () => {
    expect(capurroSomatico({ pele: "", orelha: 16, mama: 10, mamilo: 10, plantar: 15 }).completo).toBe(false);
  });
});

describe("avaliarApgar (reexportado do motor do parto)", () => {
  it("a mesma faixa vale aqui", () => {
    expect(avaliarApgar(9).faixa).toBe("normal");
    expect(avaliarApgar(5).faixa).toBe("moderado");
    expect(avaliarApgar(2).faixa).toBe("grave");
  });
});
