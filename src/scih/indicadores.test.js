// ═══════════════════════════════════════════════════════════
// SCIH — OS INDICADORES DE INFECÇÃO
//
// 🔴 O DENOMINADOR É O QUE ENGANA.
// PAV por 1000 ventilador-dia, DOT por 1000 paciente-dia, ISC sobre o
// número de cirurgias DAQUELE tipo. Trocar o denominador não muda a
// aparência do painel — muda o número, e o número vira decisão de
// isolamento, de antibiótico e de bloqueio de sala.
//
// ⚠️ E denominador ZERO não é taxa zero: é taxa que não existe. Um mês sem
// nenhuma cesárea mostrando ISC "0%" diz que a cesárea está segura, quando
// o que houve foi nenhuma cesárea.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { calcIndic } from "./indicadores.js";

describe("🔴 cada taxa usa o denominador dela", () => {
  it("higiene das mãos é PERCENTUAL de adesão", () => {
    // 80 de 100 oportunidades = 80%. Se o fator fosse 1000, sairia 800.
    expect(calcIndic({ higiene_realizadas: 80, higiene_oportunidades: 100 }).higiene).toBe(80);
  });

  it("PAV é por 1000 VENTILADOR-dia, não por paciente-dia", () => {
    // 3 casos em 300 ventilador-dia = 10 por mil. Usar paciente-dia como
    // denominador diluiria o número: numa UTI, paciente-dia é sempre maior
    // que ventilador-dia, e a densidade de PAV cairia sem nada ter mudado.
    expect(calcIndic({ pav_casos: 3, ventilador_dia: 300 }).pav).toBe(10);
  });

  it("DOT de antimicrobiano é por 1000 PACIENTE-dia", () => {
    expect(calcIndic({ antimicrobiano_dot: 450, pacientes_dia: 900 }).antimicrobiano).toBe(500);
  });

  it("positividade de cultura é percentual das COLETADAS", () => {
    expect(calcIndic({ culturas_positivas: 12, culturas_coletadas: 48 }).culturasPos).toBe(25);
  });

  it("🔴 cada ISC usa as cirurgias DAQUELE tipo", () => {
    // Somar todas as cirurgias no denominador faria a ISC de artroplastia —
    // procedimento raro e de alto risco — desaparecer no volume das
    // oftalmológicas.
    const r = calcIndic({
      isc_cesariana: 2, cir_cesariana: 100,
      isc_oftalmo: 1, cir_oftalmo: 200,
      isc_artroplastia: 3, cir_artroplastia: 20,
    });
    expect(r.iscCesariana).toBe(2);
    expect(r.iscOftalmo).toBe(0.5);
    expect(r.iscArtroplastia).toBe(15);
  });

  it("⚠️ e uma ISC não contamina a outra", () => {
    // Cada par numerador/denominador é independente. Um erro de fio trocado
    // aqui faria a taxa de um procedimento aparecer no painel de outro.
    const r = calcIndic({ isc_cesariana: 5, cir_cesariana: 50 });
    expect(r.iscCesariana).toBe(10);
    expect(r.iscOftalmo).toBeNull();
    expect(r.iscArtroplastia).toBeNull();
  });
});

describe("🔴 denominador zero não é taxa zero", () => {
  it("sem cirurgia do tipo, a ISC não existe — não é 0%", () => {
    // "0%" num mês sem cesárea nenhuma diz que a cesárea está segura. O que
    // houve foi nenhuma cesárea, e o painel precisa mostrar isso.
    const r = calcIndic({ isc_cesariana: 0, cir_cesariana: 0 });
    expect(r.iscCesariana).not.toBe(0);
    expect(r.iscCesariana).toBeNull();
  });

  it("sem ventilador-dia, a densidade de PAV não existe", () => {
    expect(calcIndic({ pav_casos: 0, ventilador_dia: 0 }).pav).toBeNull();
  });

  it("sem oportunidade observada, a adesão à higiene não existe", () => {
    // Uma UTI que não foi auditada no mês não tem 0% de adesão: tem
    // adesão desconhecida. Mostrar 0% acusaria a equipe do que não se mediu.
    expect(calcIndic({ higiene_realizadas: 0, higiene_oportunidades: 0 }).higiene).toBeNull();
  });

  it("⚠️ mas ZERO casos COM denominador é taxa zero de verdade", () => {
    // 0 PAV em 300 ventilador-dia é um resultado, e um bom. Não pode virar
    // "não medido" junto com o caso acima.
    expect(calcIndic({ pav_casos: 0, ventilador_dia: 300 }).pav).toBe(0);
    expect(calcIndic({ isc_cesariana: 0, cir_cesariana: 80 }).iscCesariana).toBe(0);
  });
});

describe("mês sem lançamento nenhum", () => {
  it("não estoura e não inventa número", () => {
    for (const vazio of [undefined, null, {}]) {
      const r = calcIndic(vazio);
      expect(Object.keys(r)).toHaveLength(7);
      for (const [k, v] of Object.entries(r)) {
        expect(v, k).toBeNull();
        expect(Number.isNaN(v), `${k} veio NaN`).toBe(false);
      }
    }
  });

  it("🔴 e nenhuma taxa volta NaN com campo sujo", () => {
    // Campo em branco no formulário chega como "" ; NaN atravessa toda
    // comparação e some na tela como espaço vazio.
    const r = calcIndic({ pav_casos: "", ventilador_dia: "abc", higiene_realizadas: null, higiene_oportunidades: "10" });
    for (const [k, v] of Object.entries(r)) expect(Number.isNaN(v), `${k} veio NaN`).toBe(false);
  });
});
