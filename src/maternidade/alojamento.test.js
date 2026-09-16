// ═══════════════════════════════════════════════════════════
// ALOJAMENTO CONJUNTO — testes do motor puro
//
// O que está travado aqui é sobretudo o que NÃO pode acontecer: perda de peso
// inventada quando falta o peso de nascimento, icterícia precoce tratada como
// fisiológica, útero amolecido passando como achado, e alta liberada com
// pendência. Tudo determinístico — nenhuma data "de hoje" no meio.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  NIVEL, piorNivel, horasDeVida,
  avaliarPerdaDePeso, avaliarIctericia, KRAMER,
  avaliarPuerperio, UTERO, LOQUIOS_QTD,
  avaliarAleitamento, ALEITAMENTO, MAMADAS_ESPERADAS,
  checklistAlta, PERMANENCIA_MIN, avaliarBinomio,
} from "./alojamento.js";

describe("piorNivel", () => {
  it("sem níveis é normal", () => expect(piorNivel([])).toBe(NIVEL.NORMAL));
  it("alerta vence atenção", () => expect(piorNivel([NIVEL.ATENCAO, NIVEL.ALERTA, NIVEL.NORMAL])).toBe(NIVEL.ALERTA));
  it("atenção vence normal", () => expect(piorNivel([NIVEL.NORMAL, NIVEL.ATENCAO])).toBe(NIVEL.ATENCAO));
});

describe("horasDeVida", () => {
  it("conta as horas entre o nascimento e agora", () => {
    expect(horasDeVida("2026-09-10T00:00:00Z", new Date("2026-09-11T12:00:00Z"))).toBe(36);
  });
  it("sem nascimento não chuta", () => expect(horasDeVida(null, new Date())).toBe(null));
  it("data ilegível não vira zero", () => expect(horasDeVida("ontem", new Date())).toBe(null));
});

describe("avaliarPerdaDePeso", () => {
  it("🔴 sem o peso de nascimento NÃO devolve 0% — devolve não avaliado", () => {
    const r = avaliarPerdaDePeso(null, 3000);
    expect(r.avaliado).toBe(false);
    expect(r.perdaPct).toBe(null);
    expect(r.nivel).toBe(NIVEL.NORMAL);   // não avaliado não é alarme, mas também não é 0%
  });

  it("perda de até 7% é fisiológica", () => {
    const r = avaliarPerdaDePeso(3000, 2850);   // 5%
    expect(r.perdaPct).toBe(5);
    expect(r.classe).toBe("fisiologica");
    expect(r.nivel).toBe(NIVEL.NORMAL);
  });

  it("7% a 10% é limítrofe (atenção)", () => {
    const r = avaliarPerdaDePeso(3000, 2760);   // 8%
    expect(r.perdaPct).toBe(8);
    expect(r.classe).toBe("limitrofe");
    expect(r.nivel).toBe(NIVEL.ATENCAO);
  });

  it("10% ou mais é excessiva (alerta)", () => {
    const r = avaliarPerdaDePeso(3000, 2700);   // 10%
    expect(r.perdaPct).toBe(10);
    expect(r.classe).toBe("excessiva");
    expect(r.nivel).toBe(NIVEL.ALERTA);
  });

  it("bebê que ganhou peso não aparece como perda", () => {
    const r = avaliarPerdaDePeso(3000, 3100);
    expect(r.classe).toBe("ganho");
    expect(r.perdaG).toBe(-100);
    expect(r.nivel).toBe(NIVEL.NORMAL);
  });

  it("arredonda para uma casa decimal", () => {
    expect(avaliarPerdaDePeso(3300, 3050).perdaPct).toBe(7.6);
  });
});

describe("avaliarIctericia", () => {
  it("zona 0/vazia = sem icterícia", () => {
    for (const v of [0, null, ""]) {
      const r = avaliarIctericia(v, 72);
      expect(r.presente).toBe(false);
      expect(r.nivel).toBe(NIVEL.NORMAL);
    }
  });

  it("🔴 icterícia antes de 24 h é SEMPRE alerta, mesmo na zona 1", () => {
    const r = avaliarIctericia(1, 10);
    expect(r.nivel).toBe(NIVEL.ALERTA);
    expect(r.motivo).toMatch(/24 h/);
  });

  it("a mesma zona 1 no terceiro dia é normal", () => {
    expect(avaliarIctericia(1, 72).nivel).toBe(NIVEL.NORMAL);
  });

  it("zona 3 é atenção; zona 4 e 5 são alerta", () => {
    expect(avaliarIctericia(3, 72).nivel).toBe(NIVEL.ATENCAO);
    expect(avaliarIctericia(4, 72).nivel).toBe(NIVEL.ALERTA);
    expect(avaliarIctericia(5, 72).nivel).toBe(NIVEL.ALERTA);
  });

  it("sem hora de vida ainda avalia pela zona", () => {
    expect(avaliarIctericia(5, null).nivel).toBe(NIVEL.ALERTA);
    expect(avaliarIctericia(1, null).nivel).toBe(NIVEL.NORMAL);
  });

  it("devolve a região da zona (as 5 zonas de Kramer existem)", () => {
    expect(KRAMER).toHaveLength(5);
    expect(avaliarIctericia(2, 72).regiao).toBe("Até o umbigo");
  });
});

describe("avaliarPuerperio", () => {
  it("puerpério normal não inventa alerta", () => {
    const r = avaliarPuerperio({ utero: UTERO.CONTRAIDO, loquios_quantidade: LOQUIOS_QTD.MODERADO, loquios_odor: "inodoro" });
    expect(r.alertas).toEqual([]);
    expect(r.nivel).toBe(NIVEL.NORMAL);
  });

  it("🔴 útero amolecido com lóquios aumentado = alerta de hemorragia", () => {
    const r = avaliarPuerperio({ utero: UTERO.AMOLECIDO, loquios_quantidade: LOQUIOS_QTD.AUMENTADO });
    expect(r.nivel).toBe(NIVEL.ALERTA);
    expect(r.alertas.some(a => a.chave === "hemorragia")).toBe(true);
  });

  it("útero amolecido sozinho é atenção, não silêncio", () => {
    const r = avaliarPuerperio({ utero: UTERO.AMOLECIDO, loquios_quantidade: LOQUIOS_QTD.POUCO });
    expect(r.nivel).toBe(NIVEL.ATENCAO);
    expect(r.alertas.some(a => a.chave === "utero")).toBe(true);
  });

  it("lóquios fétidos com febre = alerta de endometrite", () => {
    const r = avaliarPuerperio({ loquios_odor: "fetido", vitais: { temp: 38.4 } });
    expect(r.nivel).toBe(NIVEL.ALERTA);
    expect(r.alertas.some(a => a.chave === "infeccao")).toBe(true);
  });

  it("lóquios fétidos sem febre ainda é atenção", () => {
    expect(avaliarPuerperio({ loquios_odor: "fetido" }).nivel).toBe(NIVEL.ATENCAO);
  });

  it("ferida com deiscência ou secreção é alerta", () => {
    expect(avaliarPuerperio({ ferida_aspecto: "deiscencia" }).nivel).toBe(NIVEL.ALERTA);
    expect(avaliarPuerperio({ ferida_aspecto: "secrecao" }).nivel).toBe(NIVEL.ALERTA);
    expect(avaliarPuerperio({ ferida_aspecto: "hiperemia" }).nivel).toBe(NIVEL.ATENCAO);
  });

  it("mastite é alerta; ingurgitamento e fissura são atenção", () => {
    expect(avaliarPuerperio({ mamas: "mastite" }).nivel).toBe(NIVEL.ALERTA);
    expect(avaliarPuerperio({ mamas: "ingurgitadas" }).nivel).toBe(NIVEL.ATENCAO);
    expect(avaliarPuerperio({ mamas: "fissura" }).nivel).toBe(NIVEL.ATENCAO);
  });

  it("dor EVA ≥ 7 e ausência de diurese entram como atenção", () => {
    expect(avaliarPuerperio({ dor_eva: 8 }).alertas.some(a => a.chave === "dor")).toBe(true);
    expect(avaliarPuerperio({ dor_eva: 3 }).alertas.some(a => a.chave === "dor")).toBe(false);
    expect(avaliarPuerperio({ diurese: false }).alertas.some(a => a.chave === "diurese")).toBe(true);
    // diurese não registrada (undefined) NÃO é "sem diurese"
    expect(avaliarPuerperio({}).alertas.some(a => a.chave === "diurese")).toBe(false);
  });

  it("a temperatura pode vir solta ou dentro de `vitais`", () => {
    expect(avaliarPuerperio({ temp: 38.2 }).alertas.some(a => a.chave === "febre")).toBe(true);
    expect(avaliarPuerperio({ vitais: { temp: 38.2 } }).alertas.some(a => a.chave === "febre")).toBe(true);
  });
});

describe("avaliarAleitamento", () => {
  it("exclusivo, pega boa e mamadas suficientes: sem apoio pendente", () => {
    const r = avaliarAleitamento({ aleitamento: ALEITAMENTO.EXCLUSIVO, pega: "adequada", mamadas_24h: 10 });
    expect(r.ame).toBe(true);
    expect(r.apoio).toEqual([]);
    expect(r.nivel).toBe(NIVEL.NORMAL);
  });

  it("pega inadequada e poucas mamadas viram apoio", () => {
    const r = avaliarAleitamento({ aleitamento: ALEITAMENTO.EXCLUSIVO, pega: "inadequada", mamadas_24h: MAMADAS_ESPERADAS - 3 });
    expect(r.apoio.map(a => a.chave).sort()).toEqual(["mamadas", "pega"]);
    expect(r.nivel).toBe(NIVEL.ATENCAO);
  });

  it("fórmula/complemento pede registro da indicação", () => {
    expect(avaliarAleitamento({ aleitamento: ALEITAMENTO.FORMULA }).apoio.some(a => a.chave === "complemento")).toBe(true);
    expect(avaliarAleitamento({ aleitamento: ALEITAMENTO.COMPLEMENTADO }).apoio.some(a => a.chave === "complemento")).toBe(true);
  });

  it("mamadas não registradas não viram zero", () => {
    expect(avaliarAleitamento({ aleitamento: ALEITAMENTO.EXCLUSIVO }).apoio.some(a => a.chave === "mamadas")).toBe(false);
  });
});

// ── a alta do binômio ────────────────────────────────────────

const RN_COMPLETO = { triagem: { pezinho: "coletado", orelhinha: "passou", olhinho: "normal", coracaozinho: "passou" } };
const EVOLUCAO_OK = {
  vacina_bcg: true, vacina_hep_b: true, pega: "adequada",
  consulta_puerperio: true, consulta_rn: true, orientacoes: true,
  utero: UTERO.CONTRAIDO, loquios_quantidade: LOQUIOS_QTD.POUCO,
};

function altaDe(extra = {}, ctx = {}) {
  return checklistAlta({
    evolucao: { ...EVOLUCAO_OK, ...extra },
    rn: RN_COMPLETO,
    via: "vaginal",
    horas: 50,
    perda: avaliarPerdaDePeso(3000, 2900),
    ictericia: avaliarIctericia(0, 50),
    puerperio: avaliarPuerperio({ ...EVOLUCAO_OK, ...extra }),
    ...ctx,
  });
}

describe("checklistAlta", () => {
  it("tudo em ordem: pronto, sem pendência", () => {
    const r = altaDe();
    expect(r.pendencias).toEqual([]);
    expect(r.pronto).toBe(true);
  });

  it("🔴 uma pendência basta para NÃO liberar", () => {
    const r = altaDe({ vacina_bcg: false });
    expect(r.pronto).toBe(false);
    expect(r.pendencias.map(p => p.chave)).toContain("bcg");
    expect(r.pendencias[0].motivo).toBeTruthy();   // a pendência diz o que fazer
  });

  it("permanência mínima: cesárea pede 48 h, vaginal 24 h", () => {
    expect(PERMANENCIA_MIN.cesarea).toBe(48);
    const cesarea30h = altaDe({}, { via: "cesarea", horas: 30 });
    expect(cesarea30h.pendencias.map(p => p.chave)).toContain("permanencia");
    const vaginal30h = altaDe({}, { via: "vaginal", horas: 30 });
    expect(vaginal30h.pendencias.map(p => p.chave)).not.toContain("permanencia");
  });

  it("🔴 antes de 48 h o pezinho pede AGENDAMENTO, não coleta", () => {
    const semColeta = { ...RN_COMPLETO, triagem: { ...RN_COMPLETO.triagem, pezinho: null } };
    // 30 h de vida, sem coleta e sem agendamento → pendente
    const a = checklistAlta({ evolucao: EVOLUCAO_OK, rn: semColeta, via: "vaginal", horas: 30,
      perda: avaliarPerdaDePeso(3000, 2900), ictericia: avaliarIctericia(0, 30), puerperio: avaliarPuerperio(EVOLUCAO_OK) });
    const pezinho = a.itens.find(i => i.chave === "pezinho");
    expect(pezinho.rotulo).toMatch(/agendado/);
    expect(pezinho.ok).toBe(false);

    // o mesmo caso COM agendamento → liberado
    const b = checklistAlta({ evolucao: { ...EVOLUCAO_OK, pezinho_agendado: true }, rn: semColeta, via: "vaginal", horas: 30,
      perda: avaliarPerdaDePeso(3000, 2900), ictericia: avaliarIctericia(0, 30), puerperio: avaliarPuerperio(EVOLUCAO_OK) });
    expect(b.itens.find(i => i.chave === "pezinho").ok).toBe(true);
  });

  it("depois de 48 h o agendamento não substitui a coleta", () => {
    const semColeta = { ...RN_COMPLETO, triagem: { ...RN_COMPLETO.triagem, pezinho: null } };
    const r = checklistAlta({ evolucao: { ...EVOLUCAO_OK, pezinho_agendado: true }, rn: semColeta, via: "vaginal", horas: 60,
      perda: avaliarPerdaDePeso(3000, 2900), ictericia: avaliarIctericia(0, 60), puerperio: avaliarPuerperio(EVOLUCAO_OK) });
    const pezinho = r.itens.find(i => i.chave === "pezinho");
    expect(pezinho.rotulo).toMatch(/coletado/);
    expect(pezinho.ok).toBe(false);
  });

  it("perda de peso excessiva segura a alta; limítrofe não segura", () => {
    const excessiva = altaDe({}, { perda: avaliarPerdaDePeso(3000, 2650) });   // 11,7%
    expect(excessiva.pendencias.map(p => p.chave)).toContain("peso");
    const limitrofe = altaDe({}, { perda: avaliarPerdaDePeso(3000, 2760) });   // 8%
    expect(limitrofe.pendencias.map(p => p.chave)).not.toContain("peso");
  });

  it("icterícia de alerta segura a alta", () => {
    const r = altaDe({}, { ictericia: avaliarIctericia(4, 50) });
    expect(r.pendencias.map(p => p.chave)).toContain("ictericia");
  });

  it("alerta no puerpério segura a alta da mãe", () => {
    const ev = { ...EVOLUCAO_OK, utero: UTERO.AMOLECIDO, loquios_quantidade: LOQUIOS_QTD.AUMENTADO };
    const r = altaDe(ev, { puerperio: avaliarPuerperio(ev) });
    expect(r.pendencias.map(p => p.chave)).toContain("puerperio");
  });

  it("pega não avaliada não passa como amamentação estabelecida", () => {
    const r = altaDe({ pega: "" });
    expect(r.pendencias.map(p => p.chave)).toContain("aleitamento");
  });

  it("sem hora de vida a permanência fica pendente (não presume)", () => {
    const r = altaDe({}, { horas: null });
    expect(r.pendencias.map(p => p.chave)).toContain("permanencia");
  });
});

describe("avaliarBinomio", () => {
  it("junta os quatro motores e devolve o pior nível", () => {
    const r = avaliarBinomio(
      { rn_peso_g: 2700, rn_ictericia_zona: 1, utero: UTERO.CONTRAIDO, pega: "adequada", aleitamento: ALEITAMENTO.EXCLUSIVO, mamadas_24h: 9 },
      { pesoNascimentoG: 3000, nascidoEm: "2026-09-10T00:00:00Z", agora: new Date("2026-09-12T00:00:00Z") });
    expect(r.horas).toBe(48);
    expect(r.perda.perdaPct).toBe(10);
    expect(r.nivel).toBe(NIVEL.ALERTA);          // a perda excessiva manda
    expect(r.ictericia.nivel).toBe(NIVEL.NORMAL); // zona 1 com 48 h é fisiológica
  });

  it("binômio tranquilo é normal", () => {
    const r = avaliarBinomio(
      { rn_peso_g: 2900, rn_ictericia_zona: 0, utero: UTERO.CONTRAIDO, loquios_quantidade: LOQUIOS_QTD.POUCO,
        pega: "adequada", aleitamento: ALEITAMENTO.EXCLUSIVO, mamadas_24h: 10 },
      { pesoNascimentoG: 3000, nascidoEm: "2026-09-10T00:00:00Z", agora: new Date("2026-09-11T00:00:00Z") });
    expect(r.nivel).toBe(NIVEL.NORMAL);
  });

  it("sem peso de nascimento o binômio não vira alerta por falta de dado", () => {
    const r = avaliarBinomio({ rn_peso_g: 2700 }, { pesoNascimentoG: null, nascidoEm: null });
    expect(r.perda.avaliado).toBe(false);
    expect(r.nivel).toBe(NIVEL.NORMAL);
  });
});
