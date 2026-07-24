// Testes das regras de competência profissional.
//
// Estas regras vêm de norma de conselho, não de convenção interna. Se
// afrouxarem por descuido numa refatoração, ninguém percebe até virar
// problema com o COREN ou o CRM.

import { describe, it, expect } from "vitest";
import {
  podeClinico, motivoDaRecusa, tiposDeEvolucaoPermitidos,
  assinaturaDe, categoriaDe, CATEGORIAS,
} from "./papeis.js";

const perfil = (categoria, extra = {}) => ({ categoria, nome: "Fulano", ...extra });

describe("privativo do enfermeiro — COFEN 736/2024 arts. 6º e 7º", () => {
  it("enfermeiro registra diagnóstico e prescrição de enfermagem", () => {
    expect(podeClinico(perfil("enfermeiro"), "diagnostico_enfermagem")).toBe(true);
    expect(podeClinico(perfil("enfermeiro"), "prescricao_enfermagem")).toBe(true);
  });

  it("TÉCNICO de enfermagem NÃO registra diagnóstico nem prescrição", () => {
    expect(podeClinico(perfil("tecnico_enfermagem"), "diagnostico_enfermagem")).toBe(false);
    expect(podeClinico(perfil("tecnico_enfermagem"), "prescricao_enfermagem")).toBe(false);
  });

  it("mas o técnico PODE anotar, checar medicação e aferir sinais", () => {
    expect(podeClinico(perfil("tecnico_enfermagem"), "anotacao_enfermagem")).toBe(true);
    expect(podeClinico(perfil("tecnico_enfermagem"), "checar_medicacao")).toBe(true);
    expect(podeClinico(perfil("tecnico_enfermagem"), "sinais_vitais")).toBe(true);
  });

  it("a recusa cita a norma, não um 'sem permissão' genérico", () => {
    const m = motivoDaRecusa(perfil("tecnico_enfermagem"), "prescricao_enfermagem");
    expect(m).toMatch(/COFEN 736\/2024/);
    expect(m).toMatch(/Privativo do Enfermeiro/i);
  });
});

describe("privativo do médico", () => {
  it("médico prescreve e evolui", () => {
    expect(podeClinico(perfil("medico"), "prescricao_medica")).toBe(true);
    expect(podeClinico(perfil("medico"), "evolucao_medica")).toBe(true);
  });

  it("enfermeiro NÃO assina prescrição médica nem evolução médica", () => {
    expect(podeClinico(perfil("enfermeiro"), "prescricao_medica")).toBe(false);
    expect(podeClinico(perfil("enfermeiro"), "evolucao_medica")).toBe(false);
  });

  it("fisioterapeuta não prescreve medicamento", () => {
    expect(podeClinico(perfil("fisioterapeuta"), "prescricao_medica")).toBe(false);
  });
});

describe("administrativo — a inversão que o sistema não fazia", () => {
  it("administrativo NÃO pratica ato clínico nenhum", () => {
    for (const ato of ["evolucao_medica", "prescricao_medica", "anotacao_enfermagem",
                       "sinais_vitais", "checar_medicacao", "registrar_alergia"]) {
      expect(podeClinico(perfil("administrativo"), ato)).toBe(false);
    }
  });

  it("perfil adm_master administrativo continua sem competência clínica", () => {
    // poder sobre o SISTEMA não concede competência ASSISTENCIAL
    const admin = { categoria: "administrativo", role: "adm_master", nome: "TI" };
    expect(podeClinico(admin, "evolucao_medica")).toBe(false);
    expect(podeClinico(admin, "prescricao_medica")).toBe(false);
  });

  it("perfil sem categoria cai em administrativo (nega por padrão)", () => {
    expect(categoriaDe({})).toBe("administrativo");
    expect(categoriaDe(null)).toBe("administrativo");
    expect(podeClinico({}, "evolucao_medica")).toBe(false);
  });

  it("categoria inventada não vira passe livre", () => {
    expect(categoriaDe({ categoria: "diretor_supremo" })).toBe("administrativo");
    expect(podeClinico({ categoria: "diretor_supremo" }, "prescricao_medica")).toBe(false);
  });
});

describe("seletor de evolução da tela", () => {
  it("oferece ao técnico apenas anotação — não oferece o que ele não pode", () => {
    const t = tiposDeEvolucaoPermitidos(perfil("tecnico_enfermagem"));
    expect(t).toHaveLength(1);
    expect(t[0][0]).toBe("anotacao_enfermagem");
  });

  it("enfermeiro tem as quatro opções do Processo de Enfermagem", () => {
    const t = tiposDeEvolucaoPermitidos(perfil("enfermeiro")).map(x => x[0]);
    expect(t).toContain("diagnostico_enfermagem");
    expect(t).toContain("prescricao_enfermagem");
    expect(t).toContain("evolucao_enfermagem");
  });

  it("administrativo não recebe opção nenhuma", () => {
    expect(tiposDeEvolucaoPermitidos(perfil("administrativo"))).toHaveLength(0);
  });
});

describe("reconciliação medicamentosa e alta", () => {
  it("médico, enfermeiro e farmacêutico reconciliam", () => {
    for (const c of ["medico", "enfermeiro", "farmaceutico"])
      expect(podeClinico(perfil(c), "reconciliacao_medicamentosa"), c).toBe(true);
  });

  it("técnico de enfermagem NÃO reconcilia — ali se decide suspender medicamento", () => {
    expect(podeClinico(perfil("tecnico_enfermagem"), "reconciliacao_medicamentosa")).toBe(false);
  });

  it("alta hospitalar é do médico", () => {
    expect(podeClinico(perfil("medico"), "alta_hospitalar")).toBe(true);
    expect(podeClinico(perfil("enfermeiro"), "alta_hospitalar")).toBe(false);
  });

  it("adm_master administrativo não dá alta nem reconcilia", () => {
    const admin = { categoria: "administrativo", role: "adm_master", nome: "Fulano" };
    expect(podeClinico(admin, "alta_hospitalar")).toBe(false);
    expect(podeClinico(admin, "reconciliacao_medicamentosa")).toBe(false);
  });
});

describe("assinatura com registro de conselho", () => {
  it("monta a assinatura completa quando há registro", () => {
    const a = assinaturaDe(perfil("enfermeiro", { conselho: "COREN", registro_conselho: "123456" }));
    expect(a.conselho).toBe("COREN");
    expect(a.registro_conselho).toBe("123456");
    expect(a.completa).toBe(true);
  });

  it("sem registro de conselho a assinatura fica INCOMPLETA — mas não bloqueia", () => {
    const a = assinaturaDe(perfil("medico"));
    expect(a.completa).toBe(false);
    expect(a.registro_conselho).toBeNull();
    // o nome continua indo: sinalizar para regularizar é melhor que
    // impedir o registro clínico e travar o cuidado
    expect(a.profissional_nome).toBe("Fulano");
  });

  it("administrativo não precisa de conselho para estar completo", () => {
    expect(assinaturaDe(perfil("administrativo")).completa).toBe(true);
  });

  it("toda categoria assistencial tem conselho definido", () => {
    for (const [k, v] of Object.entries(CATEGORIAS)) {
      if (k !== "administrativo") expect(v.conselho).toBeTruthy();
    }
  });
});
