// ═══════════════════════════════════════════════════════════
// O AMBULATÓRIO CHEGA AO FATURAMENTO — e quem evadiu não vira conta
//
// 🔴 DOIS DEFEITOS REAIS (revisão do módulo Atendimento, 05/10/2026):
//
//   1. A lista de trabalho do faturamento era `desfecho = internacao`. O
//      ambulatório inteiro — que é de onde nascem BPA e APAC — não aparecia
//      em lista nenhuma: a consulta acontecia, era registrada, e ninguém via
//      que faltava a conta dela. O indicador do primeiro mês sairia bonito e
//      falso.
//
//   2. O pronto-socorro grava `evasao` e o ambulatório grava `evadiu`. A
//      regra conhecia só a primeira, então `geraConta("evadiu")` era `true`:
//      quem foi embora ANTES de ser atendido virava conta. No SUS isso é
//      produção informada sem atendimento prestado.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { geraConta, SEM_CONTA } from "./faturavel.js";
import { ehEvasao, saiuDoHospital, EVASAO } from "../clinico/desfechos.js";
import { montarWorklist, podeVirarConta } from "./montar-conta.js";
import { DESFECHOS_AMBULATORIAL } from "./ciclo.js";
import { fichaDaChegada } from "./ChegadaAmbulatorial.jsx";
import { camposDaFicha } from "./ficha.js";

describe("🔴 as duas grafias de evasão são a mesma coisa", () => {
  it("ehEvasao reconhece as duas", () => {
    expect(ehEvasao("evasao")).toBe(true);
    expect(ehEvasao("evadiu")).toBe(true);
    expect(ehEvasao("alta")).toBe(false);
    expect(ehEvasao(null)).toBe(false);
  });

  it("quem evadiu NÃO gera conta — nas duas grafias", () => {
    expect(geraConta("evasao")).toBe(false);
    expect(geraConta("evadiu")).toBe(false);
  });

  it("o resto continua gerando conta, inclusive óbito", () => {
    // Óbito gera conta de propósito: o hospital fez o que fez.
    for (const d of ["alta", "internacao", "obito", "transferencia", "atendido", "encaminhado"]) {
      expect(geraConta(d), d).toBe(true);
    }
  });

  it("🔴 a chave que o ambulatório realmente grava está coberta", () => {
    // Se alguém renomear o desfecho em ciclo.js, este teste cai junto.
    const doAmbulatorio = DESFECHOS_AMBULATORIAL.map(d => d.chave);
    expect(doAmbulatorio).toContain("evadiu");
    for (const chave of doAmbulatorio) {
      if (ehEvasao(chave)) expect(SEM_CONTA).toContain(chave);
    }
  });

  it("saiuDoHospital cobre as altas da internação e as duas evasões", () => {
    for (const d of ["alta", "alta_melhorado", "alta_pedido", "obito", "transferencia", ...EVASAO]) {
      expect(saiuDoHospital(d), d).toBe(true);
    }
    expect(saiuDoHospital("aguardando_triagem")).toBe(false);
    expect(saiuDoHospital("")).toBe(false);
  });
});

describe("🔴 a lista de trabalho enxerga o ambulatório", () => {
  const INTERNACAO = { id: 1, desfecho: "internacao", status: "finalizado", chegada_em: "2026-10-01" };
  const AMB_FEITA = { id: 2, desfecho: "atendido", status: "finalizado", tipo_atendimento: "ambulatorial", chegada_em: "2026-10-02" };
  const AMB_ABERTA = { id: 3, desfecho: null, status: "em_atendimento", tipo_atendimento: "ambulatorial", chegada_em: "2026-10-03" };
  const AMB_EVADIU = { id: 4, desfecho: "evadiu", status: "finalizado", tipo_atendimento: "ambulatorial", chegada_em: "2026-10-04" };

  it("a consulta concluída entra", () => {
    expect(podeVirarConta(AMB_FEITA)).toBe(true);
  });
  it("a internação continua entrando", () => {
    expect(podeVirarConta(INTERNACAO)).toBe(true);
  });
  it("a consulta ainda em curso NÃO entra (seria ruído na lista)", () => {
    expect(podeVirarConta(AMB_ABERTA)).toBe(false);
  });
  it("🔴 quem evadiu NÃO entra", () => {
    expect(podeVirarConta(AMB_EVADIU)).toBe(false);
  });

  it("a worklist filtra e ordena: sem conta primeiro", () => {
    const rows = montarWorklist([INTERNACAO, AMB_FEITA, AMB_ABERTA, AMB_EVADIU], []);
    expect(rows.map(r => r.id)).toEqual([2, 1]);          // a aberta e a evadida ficam fora
    expect(rows.every(r => r.situacao === "sem-conta")).toBe(true);
  });

  it("episódio com conta aberta vem depois de quem não tem nenhuma", () => {
    const contas = [{ atendimento_id: 2, status: "aberta" }];
    const rows = montarWorklist([INTERNACAO, AMB_FEITA], contas);
    expect(rows.map(r => r.id)).toEqual([1, 2]);
    expect(rows[1].situacao).toBe("aberta");
  });
});

describe("🔴 a chegada do agendado captura o procedimento", () => {
  it("a ficha nasce com o campo (sem ele, a consulta nunca vira conta)", () => {
    const f = fichaDaChegada({ especialidade_cod: "cardio", tipo_atendimento_cod: "consulta" });
    expect(f).toHaveProperty("procedimento_cod");
  });

  it("e o campo chega ao banco pela gravação da ficha", () => {
    const f = { ...fichaDaChegada({}), procedimento_cod: "0301010072" };
    expect(camposDaFicha(f).procedimento_cod).toBe("0301010072");
  });

  it("em branco grava nulo, não string vazia (o filtro do faturamento usa is.null)", () => {
    expect(camposDaFicha(fichaDaChegada({})).procedimento_cod).toBe(null);
  });
});
