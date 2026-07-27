// Testes do apoio à decisão da triagem PEDIÁTRICA. O risco que estes testes
// protegem é o pior possível num PS: subtriar uma criança grave porque a faixa
// de adulto não se aplica. Cada caso é uma frase que a enfermagem precisaria
// conseguir defender. Os NÚMEROS aqui são o seed de rascunho — a equipe valida
// e edita na tela; o que se testa é a LÓGICA (mapear valor → cor por idade).

import { describe, it, expect } from "vitest";
import {
  faixaPorIdade, nivelPorZona, avaliarSinaisVitaisPediatrico, faixasValidadas,
} from "./pediatria.js";

// Fixture espelhando o seed de migracao-ps-faixas-pediatricas.sql.
const FAIXAS = [
  { faixa: "neonato",  ativo: true, validado: true, idade_min_meses: 0,   idade_max_meses: 1,    fc_grave_min: 80, fc_moderado_min: 90, fc_normal_min: 100, fc_normal_max: 180, fc_moderado_max: 190, fc_grave_max: 205, fr_grave_min: 20, fr_moderado_min: 25, fr_normal_min: 30, fr_normal_max: 60, fr_moderado_max: 70, fr_grave_max: 80 },
  { faixa: "lactente", ativo: true, validado: true, idade_min_meses: 1,   idade_max_meses: 12,   fc_grave_min: 80, fc_moderado_min: 90, fc_normal_min: 100, fc_normal_max: 160, fc_moderado_max: 170, fc_grave_max: 190, fr_grave_min: 20, fr_moderado_min: 25, fr_normal_min: 30, fr_normal_max: 53, fr_moderado_max: 60, fr_grave_max: 70 },
  { faixa: "1a2",      ativo: true, validado: true, idade_min_meses: 12,  idade_max_meses: 36,   fc_grave_min: 70, fc_moderado_min: 80, fc_normal_min: 90,  fc_normal_max: 150, fc_moderado_max: 160, fc_grave_max: 180, fr_grave_min: 15, fr_moderado_min: 18, fr_normal_min: 22, fr_normal_max: 37, fr_moderado_max: 45, fr_grave_max: 55 },
  { faixa: "12mais",   ativo: true, validado: true, idade_min_meses: 144, idade_max_meses: null, fc_grave_min: 40, fc_moderado_min: 50, fc_normal_min: 60,  fc_normal_max: 99,  fc_moderado_max: 120, fc_grave_max: 150, fr_grave_min: 8,  fr_moderado_min: 10, fr_normal_min: 12, fr_normal_max: 20, fr_moderado_max: 24, fr_grave_max: 35 },
];

describe("faixaPorIdade", () => {
  it("acha a faixa pela idade em meses", () => {
    expect(faixaPorIdade(0, FAIXAS).faixa).toBe("neonato");
    expect(faixaPorIdade(6, FAIXAS).faixa).toBe("lactente");
    expect(faixaPorIdade(24, FAIXAS).faixa).toBe("1a2");
    expect(faixaPorIdade(200, FAIXAS).faixa).toBe("12mais");
  });
  it("trata o limite superior como exclusivo (12 meses já é 1–2 anos, não lactente)", () => {
    expect(faixaPorIdade(11, FAIXAS).faixa).toBe("lactente");
    expect(faixaPorIdade(12, FAIXAS).faixa).toBe("1a2");
  });
  it("faixa sem teto (≥12 anos) cobre idades altas", () => {
    expect(faixaPorIdade(144, FAIXAS).faixa).toBe("12mais");
    expect(faixaPorIdade(600, FAIXAS).faixa).toBe("12mais");
  });
  it("idade fora de qualquer faixa ou entrada inválida → null", () => {
    expect(faixaPorIdade(40, [FAIXAS[0]])).toBe(null);   // 40m não cabe só no neonato
    expect(faixaPorIdade(null, FAIXAS)).toBe(null);
    expect(faixaPorIdade(6, null)).toBe(null);
  });
  it("ignora faixas inativas", () => {
    const semLactente = FAIXAS.map(f => f.faixa === "lactente" ? { ...f, ativo: false } : f);
    expect(faixaPorIdade(6, semLactente)).toBe(null);
  });
});

describe("nivelPorZona", () => {
  const z = { grave_min: 80, moderado_min: 90, normal_min: 100, normal_max: 180, moderado_max: 190, grave_max: 205 }; // neonato FC
  it("dentro do normal → verde", () => {
    expect(nivelPorZona(100, z)).toBe("verde");
    expect(nivelPorZona(180, z)).toBe("verde");
  });
  it("acima do normal escala amarelo → laranja → vermelho", () => {
    expect(nivelPorZona(185, z)).toBe("amarelo");
    expect(nivelPorZona(195, z)).toBe("laranja");
    expect(nivelPorZona(210, z)).toBe("vermelho");
  });
  it("abaixo do normal escala amarelo → laranja → vermelho", () => {
    expect(nivelPorZona(95, z)).toBe("amarelo");
    expect(nivelPorZona(85, z)).toBe("laranja");
    expect(nivelPorZona(70, z)).toBe("vermelho");
  });
  it("degrada com segurança: zona ausente não escala além do que existe", () => {
    const soNormal = { normal_min: 100, normal_max: 180 };
    expect(nivelPorZona(300, soNormal)).toBe("amarelo");  // sem grave/moderado → só amarelo
    expect(nivelPorZona(50, soNormal)).toBe("amarelo");
    expect(nivelPorZona(120, soNormal)).toBe("verde");
  });
  it("sem valor ou sem zona → null", () => {
    expect(nivelPorZona(null, z)).toBe(null);
    expect(nivelPorZona(120, null)).toBe(null);
  });
});

describe("avaliarSinaisVitaisPediatrico", () => {
  it("lactente com FC muito alta para a idade → vermelho", () => {
    const r = avaliarSinaisVitaisPediatrico({ fc: 200 }, 6, FAIXAS);   // >190 (grave_max lactente)
    expect(r.sugestao).toBe("vermelho");
    expect(r.faixa.faixa).toBe("lactente");
  });
  it("lactente com FC normal para a idade → não sugere gravidade", () => {
    const r = avaliarSinaisVitaisPediatrico({ fc: 130 }, 6, FAIXAS);   // dentro de 100–160
    expect(r.sugestao).toBe("verde");
    expect(r.motivos.every(m => m.nivel === "verde")).toBe(true);
  });
  it("a mesma FC (130) que é normal em bebê é alarme em adolescente", () => {
    const bebe = avaliarSinaisVitaisPediatrico({ fc: 130 }, 6, FAIXAS);
    const adol = avaliarSinaisVitaisPediatrico({ fc: 130 }, 200, FAIXAS); // 12mais: >120 → laranja
    expect(bebe.sugestao).toBe("verde");
    expect(adol.sugestao).toBe("laranja");
  });
  it("SpO2 baixa dispara mesmo sem faixa aplicável (limiar universal)", () => {
    const r = avaliarSinaisVitaisPediatrico({ spo2: 88 }, 6, FAIXAS);
    expect(r.sugestao).toBe("laranja");
  });
  it("NÃO usa PA: pressão baixa (choque em adulto) não vira vermelho na peds", () => {
    const r = avaliarSinaisVitaisPediatrico({ pa_sist: 60 }, 24, FAIXAS);
    // pa_sist é ignorado; sem outro sinal alterado, não há sugestão de gravidade
    expect(r.sugestao).toBe(null);
  });
  it("AVPU inconsciente → vermelho", () => {
    const r = avaliarSinaisVitaisPediatrico({ consciencia: "U" }, 6, FAIXAS);
    expect(r.sugestao).toBe("vermelho");
  });
  it("sem faixa para a idade, ainda avalia os vitais universais e marca faixa=null", () => {
    const r = avaliarSinaisVitaisPediatrico({ fc: 200, spo2: 90 }, 40, [FAIXAS[0]]);
    expect(r.faixa).toBe(null);          // 40m não cabe só no neonato
    expect(r.sugestao).toBe("laranja");  // SpO2 90 → laranja; FC não avaliada (sem faixa)
  });
  it("sem nenhum sinal → sugestão nula", () => {
    expect(avaliarSinaisVitaisPediatrico({}, 6, FAIXAS).sugestao).toBe(null);
  });
});

describe("faixasValidadas", () => {
  it("true quando todas as ativas estão validadas", () => {
    expect(faixasValidadas(FAIXAS)).toBe(true);
  });
  it("false se qualquer ativa não está validada", () => {
    const uma = FAIXAS.map(f => f.faixa === "1a2" ? { ...f, validado: false } : f);
    expect(faixasValidadas(uma)).toBe(false);
  });
  it("ignora inativas ao decidir", () => {
    const comInativaNaoValidada = [...FAIXAS, { faixa: "x", ativo: false, validado: false }];
    expect(faixasValidadas(comInativaNaoValidada)).toBe(true);
  });
  it("lista vazia → false (nada a sugerir)", () => {
    expect(faixasValidadas([])).toBe(false);
    expect(faixasValidadas(null)).toBe(false);
  });
});
