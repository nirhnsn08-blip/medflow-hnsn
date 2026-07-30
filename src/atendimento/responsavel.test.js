// ═══════════════════════════════════════════════════════════
// O RESPONSÁVEL DO EPISÓDIO
//
// Quatro coisas aqui são regra, não detalhe:
//
//   1. CAPACIDADE NÃO SE DEDUZ. Um cadastro de recepção não remove a
//      capacidade civil de ninguém. Curador, tutor e guardião EXIGEM o
//      número do processo — a Lei 13.146/2015 fez da curatela medida
//      excepcional e judicial, e "deficiência" nunca foi sinônimo de
//      "incapaz".
//   2. ACOMPANHANTE NÃO CONSENTE. É direito de quem fica ao lado (ECA art.
//      12; Estatuto do Idoso art. 16), não procuração. O vizinho que
//      trouxe a senhora não autoriza cirurgia nem a leva embora.
//   3. IDADE DESCONHECIDA NÃO VIRA MAIORIDADE. Assumir que quem não tem
//      data de nascimento decide sozinho é como uma criança sem documento
//      passaria pelo balcão sem ninguém responsável.
//   4. NADA DISSO BLOQUEIA ATENDIMENTO. Em urgência o médico age sem
//      consentimento (CP art. 146 §3º I). A falta é pendência visível.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  MAIORIDADE, PAPEIS, VINCULOS, exigeDocumentoJudicial,
  papelExigido, conferirResponsavel, quemConsente, quemRecebeAlta,
  pendenciaDeResponsavel, camposDoResponsavel,
} from "./responsavel.js";

const HOJE = new Date("2026-07-30T10:00:00");

/** Nasceu há `anos` anos exatos, em relação a HOJE. */
const nascidoHa = anos => `${2026 - anos}-07-30`;
const pac = (over = {}) => ({ prontuario: "100042", nome_completo: "Ana Paula Souza", data_nascimento: nascidoHa(40), ...over });
const resp = (over = {}) => ({ nome: "Maria da Silva", vinculo: "mae", papel: "representante", ...over });

describe("qual papel o paciente exige", () => {
  it("criança de 8 anos exige REPRESENTANTE", () => {
    const e = papelExigido(pac({ data_nascimento: nascidoHa(8) }), HOJE);
    expect(e).toMatchObject({ papel: "representante", exigido: true, incerto: false });
    expect(e.motivo).toMatch(/art\. 3º/);
  });

  it("adolescente de 16 exige ASSISTENTE, não representante", () => {
    const e = papelExigido(pac({ data_nascimento: nascidoHa(16) }), HOJE);
    expect(e.papel).toBe("assistente");
    expect(e.motivo).toMatch(/ouvido/i);
  });

  it("a virada é aos 16 e aos 18, exatamente", () => {
    expect(papelExigido(pac({ data_nascimento: nascidoHa(15) }), HOJE).papel).toBe("representante");
    expect(papelExigido(pac({ data_nascimento: nascidoHa(16) }), HOJE).papel).toBe("assistente");
    expect(papelExigido(pac({ data_nascimento: nascidoHa(17) }), HOJE).papel).toBe("assistente");
    expect(papelExigido(pac({ data_nascimento: nascidoHa(MAIORIDADE) }), HOJE).papel).toBeNull();
  });

  it("maior de idade decide sozinho", () => {
    const e = papelExigido(pac(), HOJE);
    expect(e).toMatchObject({ papel: null, exigido: false, incerto: false });
  });

  it("SEM data de nascimento o sistema diz que NÃO SABE — não assume maioridade", () => {
    const e = papelExigido({ prontuario: "9061", iniciais: "NÃO IDENTIFICADO" }, HOJE);
    expect(e.incerto).toBe(true);
    expect(e.exigido).toBe(false);
    expect(e.papel).toBeNull();
    expect(e.motivo).toMatch(/não dá para saber/i);
  });
});

describe("capacidade não se deduz", () => {
  it("curador SEM número do processo é recusado", () => {
    const v = conferirResponsavel({
      paciente: pac(), hoje: HOJE,
      responsavel: resp({ vinculo: "curador", papel: "representante" }),
    });
    expect(v.ok).toBe(false);
    expect(v.erros.join(" ")).toMatch(/13\.146/);
  });

  it("curador COM processo é aceito, mesmo para adulto", () => {
    const v = conferirResponsavel({
      paciente: pac(), hoje: HOJE,
      responsavel: resp({ vinculo: "curador", papel: "representante", documento_judicial: "0801234-55.2025.8.21.0001", cpf: "52998224725" }),
    });
    expect(v.ok).toBe(true);
  });

  it("tutor, guardião e instituição também exigem documento", () => {
    for (const vinculo of ["tutor", "guardiao", "instituicao"]) {
      expect(exigeDocumentoJudicial(vinculo), vinculo).toBe(true);
    }
    for (const vinculo of ["mae", "pai", "conjuge", "filho", "irmao", "avo", "outro"]) {
      expect(exigeDocumentoJudicial(vinculo), vinculo).toBe(false);
    }
  });

  it("representante para ADULTO sem curatela é recusado — maioridade não se remove por cadastro", () => {
    const v = conferirResponsavel({
      paciente: pac(), hoje: HOJE,
      responsavel: resp({ vinculo: "filho", papel: "representante" }),
    });
    expect(v.ok).toBe(false);
    expect(v.erros.join(" ")).toMatch(/decide sozinho/i);
    expect(v.erros.join(" ")).toMatch(/acompanhante/i);
  });

  it("mas o mesmo filho pode ser ACOMPANHANTE do adulto", () => {
    const v = conferirResponsavel({
      paciente: pac(), hoje: HOJE,
      responsavel: resp({ vinculo: "filho", papel: "acompanhante", cpf: "52998224725" }),
    });
    expect(v.ok).toBe(true);
  });

  it("mãe representando criança passa sem documento judicial", () => {
    const v = conferirResponsavel({
      paciente: pac({ data_nascimento: nascidoHa(6) }), hoje: HOJE,
      responsavel: resp({ cpf: "52998224725" }),
    });
    expect(v.ok).toBe(true);
  });
});

describe("acompanhante não consente", () => {
  it("o poder vem do PAPEL, nunca do que a tela mandou", () => {
    const corpo = camposDoResponsavel({
      nome: "João", vinculo: "outro", papel: "acompanhante",
      consente: true, recebe_alta: true,          // a tela mentindo
    });
    expect(corpo.consente).toBe(false);
    expect(corpo.recebe_alta).toBe(false);
  });

  it("papel desconhecido cai para acompanhante, o menos poderoso", () => {
    const corpo = camposDoResponsavel({ nome: "João", papel: "procurador_universal" });
    expect(corpo.papel).toBe("acompanhante");
    expect(corpo.consente).toBe(false);
  });

  it("quemConsente e quemRecebeAlta filtram pelo papel", () => {
    const lista = [
      { nome: "Mãe", papel: "representante" },
      { nome: "Vizinho", papel: "acompanhante" },
      { nome: "Tio", papel: "assistente" },
    ];
    expect(quemConsente(lista).map(r => r.nome)).toEqual(["Mãe", "Tio"]);
    expect(quemRecebeAlta(lista).map(r => r.nome)).toEqual(["Mãe", "Tio"]);
  });

  it("responsável desativado não consente mais", () => {
    expect(quemConsente([{ nome: "Mãe", papel: "representante", ativo: false }])).toEqual([]);
  });

  it("os três papéis existem e só dois consentem", () => {
    expect(Object.keys(PAPEIS)).toEqual(["representante", "assistente", "acompanhante"]);
    expect(Object.values(PAPEIS).filter(p => p.consente)).toHaveLength(2);
  });
});

describe("o que impede gravar o responsável", () => {
  it("sem nome, com nome curto demais, ou sem vínculo", () => {
    expect(conferirResponsavel({ paciente: pac(), responsavel: resp({ nome: "" }), hoje: HOJE }).ok).toBe(false);
    expect(conferirResponsavel({ paciente: pac(), responsavel: resp({ nome: "Ana" }), hoje: HOJE }).ok).toBe(false);
    expect(conferirResponsavel({ paciente: pac(), responsavel: resp({ vinculo: "" }), hoje: HOJE }).ok).toBe(false);
  });

  it("CPF inválido é recusado — é por ele que se confere quem levou o paciente", () => {
    const v = conferirResponsavel({
      paciente: pac({ data_nascimento: nascidoHa(6) }), hoje: HOJE,
      responsavel: resp({ cpf: "11111111111" }),
    });
    expect(v.ok).toBe(false);
    expect(v.erros.join(" ")).toMatch(/CPF/);
  });

  it("menor de idade não representa nem assiste", () => {
    const v = conferirResponsavel({
      paciente: pac({ data_nascimento: nascidoHa(6) }), hoje: HOJE,
      responsavel: resp({ data_nascimento: nascidoHa(15) }),
    });
    expect(v.ok).toBe(false);
    expect(v.erros.join(" ")).toMatch(/maior de idade/i);
  });

  it("mas pode ser acompanhante — irmão adolescente que ficou junto", () => {
    const v = conferirResponsavel({
      paciente: pac({ data_nascimento: nascidoHa(6) }), hoje: HOJE,
      responsavel: resp({ papel: "acompanhante", vinculo: "irmao", data_nascimento: nascidoHa(15), cpf: "52998224725" }),
    });
    expect(v.ok).toBe(true);
  });

  it("avisa que acompanhante não fecha a pendência de um menor", () => {
    const v = conferirResponsavel({
      paciente: pac({ data_nascimento: nascidoHa(6) }), hoje: HOJE,
      responsavel: resp({ papel: "acompanhante", vinculo: "avo", cpf: "52998224725" }),
    });
    expect(v.ok).toBe(true);
    expect(v.avisos.join(" ")).toMatch(/pendência continua aberta/i);
  });
});

describe("a pendência que a recepção vê", () => {
  it("criança sem ninguém registrado é pendência ALTA", () => {
    const p = pendenciaDeResponsavel({ paciente: pac({ data_nascimento: nascidoHa(6) }), responsaveis: [], hoje: HOJE });
    expect(p.gravidade).toBe("alta");
    expect(p.texto).toMatch(/pode seguir/i);   // pendência, não bloqueio
  });

  it("criança com representante registrado não é pendência", () => {
    const p = pendenciaDeResponsavel({
      paciente: pac({ data_nascimento: nascidoHa(6) }),
      responsaveis: [{ nome: "Mãe", papel: "representante" }], hoje: HOJE,
    });
    expect(p).toBeNull();
  });

  it("criança só com ACOMPANHANTE continua pendente", () => {
    const p = pendenciaDeResponsavel({
      paciente: pac({ data_nascimento: nascidoHa(6) }),
      responsaveis: [{ nome: "Vizinha", papel: "acompanhante" }], hoje: HOJE,
    });
    expect(p?.gravidade).toBe("alta");
  });

  it("adulto sem responsável NÃO é pendência — aviso que sempre dispara ninguém lê", () => {
    expect(pendenciaDeResponsavel({ paciente: pac(), responsaveis: [], hoje: HOJE })).toBeNull();
  });

  it("idade desconhecida é pendência média, e diz que não sabe", () => {
    const p = pendenciaDeResponsavel({ paciente: { prontuario: "9061" }, responsaveis: [], hoje: HOJE });
    expect(p.gravidade).toBe("media");
    expect(p.texto).toMatch(/não sabe/i);
  });
});

describe("o corpo que vai para o banco", () => {
  it("campo em branco vira null, não string vazia", () => {
    const corpo = camposDoResponsavel({ nome: "Maria da Silva", vinculo: "mae", papel: "representante", telefone: "  ", observacao: "" });
    expect(corpo.telefone).toBeNull();
    expect(corpo.observacao).toBeNull();
  });

  it("o CPF é gravado só com dígitos", () => {
    expect(camposDoResponsavel({ nome: "X", cpf: "529.982.247-25" }).cpf).toBe("52998224725");
    expect(camposDoResponsavel({ nome: "X" }).cpf).toBeNull();
  });

  it("todo vínculo da lista tem rótulo e chave", () => {
    for (const v of VINCULOS) {
      expect(v.chave, JSON.stringify(v)).toBeTruthy();
      expect(v.label, v.chave).toBeTruthy();
    }
  });
});
