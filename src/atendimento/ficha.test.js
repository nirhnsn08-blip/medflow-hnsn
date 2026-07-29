// ═══════════════════════════════════════════════════════════
// AS REGRAS DA FICHA
//
// Quatro coisas aqui protegem defeito de verdade:
//
//   1. NADA BLOQUEIA. Se um dia alguém transformar uma pendência de
//      faturamento em impedimento, a recepção trava com o paciente no
//      balcão. Os testes conferem que só saem avisos.
//   2. SUS NÃO TEM CARTEIRINHA nem pode ser cobrado — por mais que o
//      cadastro do convênio diga o contrário.
//   3. CATÁLOGO VAZIO NÃO É PENDÊNCIA DO ATENDIMENTO. Cobrar da
//      recepcionista o que só o analista comercial resolve ensina a
//      ignorar aviso — e aí o aviso que importa também passa batido.
//   4. CBO INCOMPATÍVEL é rejeição, não glosa. O texto precisa dizer isso,
//      senão ninguém trata com a urgência certa.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  TIPOS_CONVENIO, DOMINIOS, tipoDoConvenio, exigenciasDoConvenio,
  carteiraVencida, conferirCbo, conferirFicha, camposDaFicha,
} from "./ficha.js";

const SUS = { id: 1, codigo: "SUS", nome: "SUS", tipo: "sus", exige_carteira: true, exige_autorizacao: true };
const UNIMED = { id: 2, codigo: "UNI", nome: "Unimed", tipo: "convenio", exige_carteira: true, exige_autorizacao: true };
const PART = { id: 3, codigo: "PART", nome: "Particular", tipo: "particular", exige_carteira: false };

const PACIENTE = { prontuario: "100001", nome_completo: "Maria Silva", cns: "123456789012345" };

// Catálogos vazios = hospital que ainda não configurou nada.
const VAZIO = {};
// Catálogos preenchidos = o analista comercial já cadastrou.
const CHEIO = {
  convenios: [SUS, UNIMED],
  planos: [{ id: 9, convenio_id: 2, nome: "Plano Único" }],
  ...Object.fromEntries(DOMINIOS.map(d => [d.chave, [{ codigo: "x", nome: "X" }]])),
};

describe("tipo de fonte pagadora", () => {
  it("SUS nunca cobra do paciente", () => {
    expect(TIPOS_CONVENIO.sus.cobraDoPaciente).toBe(false);
    expect(tipoDoConvenio(SUS).cobraDoPaciente).toBe(false);
  });

  it("convênio e particular podem cobrar", () => {
    expect(tipoDoConvenio(UNIMED).cobraDoPaciente).toBe(true);
    expect(tipoDoConvenio(PART).cobraDoPaciente).toBe(true);
  });

  it("só convênio gera guia TISS", () => {
    expect(TIPOS_CONVENIO.convenio.temGuiaTiss).toBe(true);
    expect(TIPOS_CONVENIO.sus.temGuiaTiss).toBe(false);
    expect(TIPOS_CONVENIO.particular.temGuiaTiss).toBe(false);
  });

  it("convênio desconhecido não explode", () => {
    expect(tipoDoConvenio({ tipo: "chute" })).toBeNull();
    expect(tipoDoConvenio(null)).toBeNull();
  });
});

describe("exigências", () => {
  it("SUS NÃO exige carteira nem autorização, mesmo com o cadastro marcado", () => {
    // O cadastro do SUS acima tem as duas flags ligadas de propósito: é o
    // erro de digitação que alguém vai cometer um dia.
    const ex = exigenciasDoConvenio(SUS);
    expect(ex.carteira).toBe(false);
    expect(ex.autorizacao).toBe(false);
  });

  it("SUS exige CNS", () => {
    expect(exigenciasDoConvenio(SUS).cns).toBe(true);
    expect(exigenciasDoConvenio(UNIMED).cns).toBe(false);
  });

  it("convênio segue o que o cadastro diz", () => {
    expect(exigenciasDoConvenio(UNIMED).carteira).toBe(true);
    expect(exigenciasDoConvenio({ ...UNIMED, exige_carteira: false }).carteira).toBe(false);
    expect(exigenciasDoConvenio({ ...UNIMED, exige_autorizacao: false }).autorizacao).toBe(false);
  });

  it("sem convênio não exige nada", () => {
    expect(exigenciasDoConvenio(null)).toEqual({ carteira: false, autorizacao: false, cns: false, cobra: false });
  });
});

describe("validade da carteira", () => {
  const hoje = new Date("2026-07-29T10:00:00");
  it("vencida ontem é vencida", () => {
    expect(carteiraVencida("2026-07-28", hoje)).toBe(true);
  });
  it("vence hoje ainda vale (o dia inteiro)", () => {
    expect(carteiraVencida("2026-07-29", hoje)).toBe(false);
  });
  it("sem data ou data inválida não afirma nada", () => {
    expect(carteiraVencida(null, hoje)).toBeNull();
    expect(carteiraVencida("", hoje)).toBeNull();
    expect(carteiraVencida("banana", hoje)).toBeNull();
  });
});

describe("CBO × procedimento", () => {
  const PROC = { codigo: "0301010072", nome: "Consulta médica", cbos_compativeis: ["225125", "225265"] };

  it("CBO na lista está ok", () => {
    expect(conferirCbo(PROC, "225125").estado).toBe("ok");
  });

  it("compara só os dígitos — pontuação não reprova ninguém", () => {
    expect(conferirCbo(PROC, "2251-25").estado).toBe("ok");
  });

  it("CBO fora da lista é incompatível e devolve os aceitos", () => {
    const v = conferirCbo(PROC, "223505");
    expect(v.estado).toBe("incompativel");
    expect(v.exigidos).toEqual(["225125", "225265"]);
  });

  it("procedimento sem lista cadastrada não reprova nada", () => {
    expect(conferirCbo({ ...PROC, cbos_compativeis: [] }, "999999").estado).toBe("sem_lista");
    expect(conferirCbo(null, "225125").estado).toBe("sem_lista");
  });

  it("profissional sem CBO é estado próprio, não incompatibilidade", () => {
    expect(conferirCbo(PROC, "").estado).toBe("sem_cbo");
    expect(conferirCbo(PROC, null).estado).toBe("sem_cbo");
  });
});

describe("conferência da ficha — nada bloqueia", () => {
  it("não existe caminho que devolva erro; só avisos", () => {
    const r = conferirFicha({ paciente: {}, catalogos: CHEIO });
    expect(r.erros).toBeUndefined();
    expect(Array.isArray(r.avisos)).toBe(true);
  });

  it("catálogo vazio NÃO vira pendência do atendimento", () => {
    const r = conferirFicha({ paciente: PACIENTE, catalogos: VAZIO });
    // Nenhum aviso de "campo não informado" para lista que não existe.
    const porCampo = r.avisos.filter(a => a.chave.startsWith("sem_") && DOMINIOS.some(d => a.chave === `sem_${d.chave}`));
    expect(porCampo).toEqual([]);
  });

  it("catálogo vazio de convênio explica que é cadastro, não erro dela", () => {
    const r = conferirFicha({ paciente: PACIENTE, catalogos: VAZIO });
    const a = r.avisos.find(x => x.chave === "sem_convenio");
    expect(a.texto).toMatch(/analista comercial/);
  });

  it("com catálogo cheio, campo em branco vira pendência de baixa gravidade", () => {
    const r = conferirFicha({ paciente: PACIENTE, convenio: PART, catalogos: CHEIO });
    const a = r.avisos.find(x => x.chave === "sem_tipo_atendimento");
    expect(a.gravidade).toBe("baixa");
  });
});

describe("conferência da ficha — fonte pagadora", () => {
  it("SUS sem CNS avisa que não fecha o faturamento", () => {
    const r = conferirFicha({ paciente: { ...PACIENTE, cns: null }, convenio: SUS, catalogos: CHEIO });
    expect(r.avisos.find(a => a.chave === "sem_cns").gravidade).toBe("alta");
  });

  it("SUS NÃO reclama de carteira nem de autorização", () => {
    const r = conferirFicha({ paciente: PACIENTE, convenio: SUS, ficha: {}, catalogos: CHEIO });
    const chaves = r.avisos.map(a => a.chave);
    expect(chaves).not.toContain("sem_carteira");
    expect(chaves).not.toContain("sem_autorizacao");
  });

  it("convênio sem carteira e sem senha reclama das duas", () => {
    const r = conferirFicha({ paciente: PACIENTE, convenio: UNIMED, ficha: {}, catalogos: CHEIO });
    const chaves = r.avisos.map(a => a.chave);
    expect(chaves).toContain("sem_carteira");
    expect(chaves).toContain("sem_autorizacao");
  });

  it("carteira vencida é aviso grave", () => {
    const r = conferirFicha({
      paciente: PACIENTE, convenio: UNIMED,
      ficha: { carteira: "123", autorizacao_senha: "X", carteira_validade: "2020-01-01" },
      catalogos: CHEIO, hoje: new Date("2026-07-29"),
    });
    expect(r.avisos.find(a => a.chave === "carteira_vencida").gravidade).toBe("alta");
  });

  it("convênio sem plano avisa — mas só se existir plano cadastrado para ele", () => {
    const comPlano = conferirFicha({ paciente: PACIENTE, convenio: UNIMED, ficha: { carteira: "1", autorizacao_senha: "X" }, catalogos: CHEIO });
    expect(comPlano.avisos.map(a => a.chave)).toContain("sem_plano");

    const semPlanoCadastrado = conferirFicha({
      paciente: PACIENTE, convenio: UNIMED, ficha: { carteira: "1", autorizacao_senha: "X" },
      catalogos: { ...CHEIO, planos: [] },
    });
    expect(semPlanoCadastrado.avisos.map(a => a.chave)).not.toContain("sem_plano");
  });

  it("particular não exige carteira, senha nem CNS", () => {
    const r = conferirFicha({ paciente: { prontuario: "1" }, convenio: PART, catalogos: CHEIO });
    const chaves = r.avisos.map(a => a.chave);
    expect(chaves).not.toContain("sem_carteira");
    expect(chaves).not.toContain("sem_autorizacao");
    expect(chaves).not.toContain("sem_cns");
  });
});

describe("conferência da ficha — CBO", () => {
  const PROC = { codigo: "0301010072", nome: "Consulta médica", cbos_compativeis: ["225125"] };

  it("CBO incompatível é grave e o texto diz REJEIÇÃO, não glosa", () => {
    const r = conferirFicha({
      paciente: PACIENTE, convenio: SUS, procedimento: PROC,
      medico: { nome: "Dr. João", cbo: "223505" }, catalogos: CHEIO,
    });
    const a = r.avisos.find(x => x.chave === "cbo_incompativel");
    expect(a.gravidade).toBe("alta");
    // O texto tem que CONTRASTAR com glosa, não só citar rejeição: quem lê
    // "glosa" trata como algo que se recorre depois, e não é isso — a
    // produção nem entra. Mencionar as duas palavras é o que ensina.
    expect(a.texto).toMatch(/REJEIÇÃO/);
    expect(a.texto).toMatch(/não vira glosa/i);
    expect(a.texto).toMatch(/225125/);   // diz quais CBOs são aceitos
  });

  it("CBO compatível não gera aviso", () => {
    const r = conferirFicha({
      paciente: PACIENTE, convenio: SUS, procedimento: PROC,
      medico: { nome: "Dr. João", cbo: "225125" }, catalogos: CHEIO,
    });
    expect(r.avisos.map(a => a.chave)).not.toContain("cbo_incompativel");
  });

  it("médico sem CBO avisa, mas é outra coisa", () => {
    const r = conferirFicha({
      paciente: PACIENTE, convenio: SUS, procedimento: PROC,
      medico: { nome: "Dr. João" }, catalogos: CHEIO,
    });
    const chaves = r.avisos.map(a => a.chave);
    expect(chaves).toContain("medico_sem_cbo");
    expect(chaves).not.toContain("cbo_incompativel");
  });
});

describe("faturável", () => {
  const completa = {
    carteira: "123", autorizacao_senha: "X",
    ...Object.fromEntries(DOMINIOS.map(d => [`${d.chave}_cod`, "x"])),
  };

  it("ficha completa de convênio com plano é faturável", () => {
    const r = conferirFicha({
      paciente: PACIENTE, convenio: UNIMED, plano: { id: 9 }, ficha: completa, catalogos: CHEIO,
    });
    expect(r.pendenciasGraves).toBe(0);
    expect(r.faturavel).toBe(true);
  });

  it("sem convênio nunca é faturável", () => {
    const r = conferirFicha({ paciente: PACIENTE, ficha: completa, catalogos: CHEIO });
    expect(r.faturavel).toBe(false);
  });

  it("pendência grave derruba o faturável", () => {
    const r = conferirFicha({
      paciente: PACIENTE, convenio: UNIMED, plano: { id: 9 },
      ficha: { ...completa, carteira: "" }, catalogos: CHEIO,
    });
    expect(r.faturavel).toBe(false);
  });
});

describe("o que vai para o banco", () => {
  it("campo em branco vira null, não string vazia", () => {
    const c = camposDaFicha({ carteira: "   ", cid: "", guia_numero: undefined });
    expect(c.carteira).toBeNull();
    expect(c.cid).toBeNull();
    expect(c.guia_numero).toBeNull();
  });

  it("preenchido vai sem espaço nas pontas", () => {
    expect(camposDaFicha({ carteira: " 998877 " }).carteira).toBe("998877");
  });

  it("acidente de trabalho é booleano de verdade, nunca undefined", () => {
    expect(camposDaFicha({}).acidente_trabalho).toBe(false);
    expect(camposDaFicha({ acidente_trabalho: "sim" }).acidente_trabalho).toBe(false);
    expect(camposDaFicha({ acidente_trabalho: true }).acidente_trabalho).toBe(true);
  });

  it("devolve exatamente as colunas da ficha, sem sobra", () => {
    const chaves = Object.keys(camposDaFicha({ lixo: 1, nome: "x" }));
    expect(chaves).not.toContain("lixo");
    expect(chaves).not.toContain("nome");
    expect(chaves).toContain("convenio_id");
    expect(chaves).toContain("procedimento_cod");
  });
});
