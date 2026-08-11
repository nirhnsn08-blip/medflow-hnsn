// Testes do motor SIGTAP (puro). Cobrem identidade do código, via,
// normalização, permanência e o checador de glosa — com foco na regra de
// que FALTA DE DADO É SILÊNCIO (nunca alarme falso).

import { describe, it, expect } from "vitest";
import {
  codigoLimpo, codigoFormatado, codigoValido, grupoDe,
  VIAS_SUS, viaPorGrupo, viaDoProcedimento, montarProcedimento,
  permanenciaEmDias, avaliarPermanencia,
  GRAVIDADES, avaliarGlosa, temImpedimento,
} from "./sigtap.js";

const proc = (over = {}) => montarProcedimento({ codigo: "0303010037", nome: "Tratamento", mediaPermanencia: 6, ...over });

describe("código", () => {
  it("limpa qualquer formatação para 10 dígitos", () => {
    expect(codigoLimpo("03.03.01.003-7")).toBe("0303010037");
    expect(codigoLimpo("0303010037")).toBe("0303010037");
    expect(codigoLimpo(" 03 03 01 003 7 ")).toBe("0303010037");
  });

  it("recusa o que não tem 10 dígitos", () => {
    expect(codigoLimpo("123")).toBeNull();
    expect(codigoLimpo("")).toBeNull();
    expect(codigoLimpo(null)).toBeNull();
    expect(codigoLimpo("03030100370")).toBeNull(); // 11 dígitos
  });

  it("formata de volta no padrão SIGTAP", () => {
    expect(codigoFormatado("0303010037")).toBe("03.03.01.003-7");
    expect(codigoFormatado("03.03.01.003-7")).toBe("03.03.01.003-7");
    expect(codigoFormatado("lixo")).toBeNull();
  });

  it("ida e volta é estável", () => {
    expect(codigoLimpo(codigoFormatado("0408060281"))).toBe("0408060281");
  });

  it("valida e extrai o grupo", () => {
    expect(codigoValido("03.03.01.003-7")).toBe(true);
    expect(codigoValido("xyz")).toBe(false);
    expect(grupoDe("0303010037")).toBe("03");
    expect(grupoDe("0408060281")).toBe("04");
    expect(grupoDe("lixo")).toBeNull();
  });
});

describe("via de faturamento", () => {
  it("palpita AIH para internação (grupos 03 e 04)", () => {
    expect(viaPorGrupo("0303010037")).toBe("aih");
    expect(viaPorGrupo("0408060281")).toBe("aih");
  });

  it("palpita BPA para o resto da produção ambulatorial", () => {
    expect(viaPorGrupo("0201010012")).toBe("bpa");
  });

  it("null quando o código é inválido", () => {
    expect(viaPorGrupo("lixo")).toBeNull();
  });

  it("a via cadastrada vence o palpite do grupo", () => {
    // um procedimento clínico marcado como APAC no cadastro
    expect(viaDoProcedimento({ codigo: "0303010037", via: "apac" })).toBe("apac");
    expect(viaDoProcedimento({ codigo: "0303010037", via: "APAC" })).toBe("apac");
  });

  it("via inválida no cadastro cai no palpite", () => {
    expect(viaDoProcedimento({ codigo: "0303010037", via: "tiss" })).toBe("aih"); // tiss não é via SUS
    expect(viaDoProcedimento({ codigo: "0303010037" })).toBe("aih");
  });

  it("VIAS_SUS são exatamente bpa/apac/aih", () => {
    expect(VIAS_SUS).toEqual(["bpa", "apac", "aih"]);
  });
});

describe("montarProcedimento", () => {
  it("normaliza código, grupo e via padrão", () => {
    const p = montarProcedimento({ codigo: "03.03.01.003-7", nome: "  Tratamento X  " });
    expect(p.codigo).toBe("0303010037");
    expect(p.grupo).toBe("03");
    expect(p.via).toBe("aih");
    expect(p.nome).toBe("Tratamento X");
  });

  it("aceita o '-' do xlsx como permanência ausente", () => {
    expect(montarProcedimento({ codigo: "0303010037", mediaPermanencia: "-" }).mediaPermanencia).toBeNull();
    expect(montarProcedimento({ codigo: "0303010037", mediaPermanencia: "6" }).mediaPermanencia).toBe(6);
    expect(montarProcedimento({ codigo: "0303010037", mediaPermanencia: 6 }).mediaPermanencia).toBe(6);
  });

  it("valores e faixas ausentes viram null (não zero)", () => {
    const p = montarProcedimento({ codigo: "0303010037" });
    expect(p.valorSh).toBeNull();
    expect(p.valorSp).toBeNull();
    expect(p.idadeMin).toBeNull();
    expect(p.idadeMax).toBeNull();
    expect(p.sexo).toBeNull();
    expect(p.cids).toEqual([]);
    expect(p.cbos).toEqual([]);
  });

  it("normaliza a lista de CID", () => {
    const p = montarProcedimento({ codigo: "0303010037", cids: ["A15.0", " b01 ", ""] });
    expect(p.cids).toEqual(["A150", "B01"]);
  });

  it("normaliza sexo", () => {
    expect(montarProcedimento({ codigo: "0303010037", sexo: "Masculino" }).sexo).toBe("M");
    expect(montarProcedimento({ codigo: "0303010037", sexo: "F" }).sexo).toBe("F");
    expect(montarProcedimento({ codigo: "0303010037", sexo: "ambos" }).sexo).toBeNull();
  });
});

describe("permanência", () => {
  it("conta os dias entre admissão e alta", () => {
    expect(permanenciaEmDias("2026-08-01", "2026-08-07")).toBe(6);
    expect(permanenciaEmDias("2026-08-01T12:00:00Z", "2026-08-02T03:00:00Z")).toBe(1);
  });

  it("mesmo dia é zero", () => {
    expect(permanenciaEmDias("2026-08-01", "2026-08-01")).toBe(0);
  });

  it("null para datas inválidas ou alta antes da admissão", () => {
    expect(permanenciaEmDias("2026-08-10", "2026-08-01")).toBeNull();
    expect(permanenciaEmDias("", "2026-08-01")).toBeNull();
    expect(permanenciaEmDias("2026-08-01", null)).toBeNull();
  });

  it("não vira alarme quando a média não está cadastrada", () => {
    const r = avaliarPermanencia(montarProcedimento({ codigo: "0303010037", mediaPermanencia: "-" }), 10);
    expect(r.excede).toBe(false);
    expect(r.texto).toBeNull();
  });

  it("acima da média marca excedente e texto", () => {
    const r = avaliarPermanencia(proc({ mediaPermanencia: 6 }), 9);
    expect(r.excede).toBe(true);
    expect(r.excedente).toBe(3);
    expect(r.texto).toMatch(/acima da média/);
  });

  it("dentro da média não excede", () => {
    const r = avaliarPermanencia(proc({ mediaPermanencia: 6 }), 6);
    expect(r.excede).toBe(false);
    expect(r.excedente).toBe(0);
    expect(r.texto).toMatch(/dentro da média/);
  });
});

describe("avaliarGlosa", () => {
  it("conta limpa não gera nenhum achado", () => {
    const achados = avaliarGlosa({ proc: proc({ mediaPermanencia: 6 }), paciente: { sexo: "F", idade: 40 }, permanenciaDias: 5 });
    expect(achados).toEqual([]);
    expect(temImpedimento(achados)).toBe(false);
  });

  it("permanência acima da média → atenção", () => {
    const achados = avaliarGlosa({ proc: proc({ mediaPermanencia: 6 }), permanenciaDias: 12 });
    expect(achados).toHaveLength(1);
    expect(achados[0].regra).toBe("permanencia");
    expect(achados[0].gravidade).toBe(GRAVIDADES.ATENCAO);
    expect(temImpedimento(achados)).toBe(false);
  });

  it("sexo incompatível → impedimento", () => {
    const p = proc({ sexo: "F" }); // ex.: procedimento obstétrico
    const achados = avaliarGlosa({ proc: p, paciente: { sexo: "M" }, permanenciaDias: 3 });
    expect(achados.map((a) => a.regra)).toContain("sexo");
    expect(temImpedimento(achados)).toBe(true);
  });

  it("sexo compatível não gera achado", () => {
    const achados = avaliarGlosa({ proc: proc({ sexo: "F" }), paciente: { sexo: "F" }, permanenciaDias: 3 });
    expect(achados.map((a) => a.regra)).not.toContain("sexo");
  });

  it("procedimento sem restrição de sexo cala mesmo com paciente informado", () => {
    const achados = avaliarGlosa({ proc: proc(), paciente: { sexo: "M" }, permanenciaDias: 3 });
    expect(achados.map((a) => a.regra)).not.toContain("sexo");
  });

  it("idade fora da faixa → impedimento", () => {
    const abaixo = avaliarGlosa({ proc: proc({ idadeMin: 18 }), paciente: { idade: 10 }, permanenciaDias: 3 });
    expect(abaixo.map((a) => a.regra)).toContain("idade");
    const acima = avaliarGlosa({ proc: proc({ idadeMax: 12 }), paciente: { idade: 40 }, permanenciaDias: 3 });
    expect(acima.map((a) => a.regra)).toContain("idade");
  });

  it("idade dentro da faixa, ou paciente sem idade, não gera achado", () => {
    const dentro = avaliarGlosa({ proc: proc({ idadeMin: 18, idadeMax: 60 }), paciente: { idade: 30 }, permanenciaDias: 3 });
    expect(dentro.map((a) => a.regra)).not.toContain("idade");
    const semIdade = avaliarGlosa({ proc: proc({ idadeMin: 18 }), paciente: {}, permanenciaDias: 3 });
    expect(semIdade.map((a) => a.regra)).not.toContain("idade");
  });

  it("CID incompatível → atenção, mas SÓ quando a lista foi importada", () => {
    const comLista = avaliarGlosa({ proc: proc({ cids: ["A15", "A16"] }), cidPrincipal: "J18.9", permanenciaDias: 3 });
    expect(comLista.map((a) => a.regra)).toContain("cid");
    expect(comLista.find((a) => a.regra === "cid").gravidade).toBe(GRAVIDADES.ATENCAO);
  });

  it("CID compatível não gera achado", () => {
    const achados = avaliarGlosa({ proc: proc({ cids: ["A15.0", "A16"] }), cidPrincipal: "a150", permanenciaDias: 3 });
    expect(achados.map((a) => a.regra)).not.toContain("cid");
  });

  it("sem lista de CID importada, CALA (o item 2 do cabeçalho)", () => {
    const achados = avaliarGlosa({ proc: proc({ cids: [] }), cidPrincipal: "J18.9", permanenciaDias: 3 });
    expect(achados.map((a) => a.regra)).not.toContain("cid");
  });

  it("acumula vários achados na mesma conta", () => {
    const p = proc({ mediaPermanencia: 4, sexo: "F", idadeMax: 12, cids: ["A15"] });
    const achados = avaliarGlosa({ proc: p, paciente: { sexo: "M", idade: 40 }, cidPrincipal: "J18", permanenciaDias: 10 });
    expect(achados.map((a) => a.regra).sort()).toEqual(["cid", "idade", "permanencia", "sexo"]);
    expect(temImpedimento(achados)).toBe(true);
  });

  it("proc ausente devolve lista vazia (não quebra)", () => {
    expect(avaliarGlosa({})).toEqual([]);
    expect(avaliarGlosa()).toEqual([]);
  });
});
