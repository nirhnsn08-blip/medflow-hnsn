// Testes da identificação do paciente.
//
// Duas coisas se protegem aqui, e a segunda é a que machuca antes:
//   1. a conformidade da identificação (CFM 1.638/2002, CFM 2.299/2021);
//   2. a IDADE — porque a triagem pediátrica escolhe a faixa de sinais
//      vitais por ela, e faixa errada é sugestão errada na frente de uma
//      criança.
//
// Os CPF e CNS usados são números de teste, válidos pelo algoritmo e não
// atribuídos a ninguém.

import { describe, it, expect } from "vitest";
import {
  limparDoc, validarCPF, formatarCPF, validarCNS, formatarCNS, tipoCNS,
  normalizarNome, partesDoNome, iniciaisDe, comoExibir, normalizarSexo, rotuloSexo,
  idadeDetalhada, idadeMesesParaTriagem,
  conferirCadastro, possiveisDuplicatas,
} from "./identidade.js";

const CPF_OK = "529.982.247-25";
const CPF_OK2 = "111.444.777-35";
const CNS_DEF = "200000000000003";     // definitivo (começa com 2)
const CNS_PROV = "898001160650006";    // provisório (começa com 8)

describe("CPF", () => {
  it("aceita CPF válido, com ou sem pontuação", () => {
    expect(validarCPF(CPF_OK)).toBe(true);
    expect(validarCPF("52998224725")).toBe(true);
    expect(validarCPF(CPF_OK2)).toBe(true);
  });

  it("rejeita quando um dígito verificador não confere", () => {
    // é exatamente para isso que o DV existe: pegar erro de digitação
    expect(validarCPF("529.982.247-26")).toBe(false);
    expect(validarCPF("529.982.247-15")).toBe(false);
  });

  it("rejeita os repetidos, que passam na conta mas não existem", () => {
    for (const c of ["111.111.111-11", "000.000.000-00", "99999999999"])
      expect(validarCPF(c), c).toBe(false);
  });

  it("rejeita tamanho errado e lixo", () => {
    expect(validarCPF("123")).toBe(false);
    expect(validarCPF("")).toBe(false);
    expect(validarCPF(null)).toBe(false);
    expect(validarCPF("abcdefghijk")).toBe(false);
  });

  it("formata para leitura e não estraga o que não é CPF", () => {
    expect(formatarCPF("52998224725")).toBe("529.982.247-25");
    expect(formatarCPF("123")).toBe("123");
  });

  it("limparDoc tira tudo que não é dígito", () => {
    expect(limparDoc("529.982.247-25")).toBe("52998224725");
    expect(limparDoc(null)).toBe("");
  });
});

describe("CNS (Cartão SUS)", () => {
  it("aceita definitivo e provisório válidos", () => {
    expect(validarCNS(CNS_DEF)).toBe(true);
    expect(validarCNS(CNS_PROV)).toBe(true);
  });

  it("distingue definitivo de provisório", () => {
    expect(tipoCNS(CNS_DEF)).toBe("definitivo");
    expect(tipoCNS(CNS_PROV)).toBe("provisorio");
    expect(tipoCNS("123")).toBe(null);
  });

  it("rejeita troca de um único dígito", () => {
    expect(validarCNS("200000000000004")).toBe(false);
  });

  it("rejeita prefixo que não existe (só 1,2,7,8,9)", () => {
    expect(validarCNS("300000000000003")).toBe(false);
  });

  it("rejeita tamanho errado e repetidos", () => {
    expect(validarCNS("20000000000000")).toBe(false);   // 14 dígitos
    expect(validarCNS("111111111111111")).toBe(false);
    expect(validarCNS("")).toBe(false);
  });

  it("formata em blocos legíveis", () => {
    expect(formatarCNS(CNS_DEF)).toBe("200 0000 0000 0003");
  });
});

describe("nome e exibição", () => {
  it("normaliza para comparar: sem acento, minúsculo", () => {
    expect(normalizarNome("JOSÉ da Silva")).toBe("jose da silva");
    expect(normalizarNome("  Maria   Souza  ")).toBe("maria souza");
  });

  it("partesDoNome descarta partículas que não identificam", () => {
    expect(partesDoNome("José da Silva Matos")).toEqual(["jose", "silva", "matos"]);
    expect(partesDoNome("Maria dos Santos e Souza")).toEqual(["maria", "santos", "souza"]);
  });

  it("iniciais a partir do nome completo", () => {
    expect(iniciaisDe("José da Silva Matos")).toBe("J.S.M.");
    expect(iniciaisDe("Maria dos Santos")).toBe("M.S.");
    expect(iniciaisDe("")).toBe("");
  });

  it("a tela mostra INICIAIS por padrão, mesmo tendo o nome completo", () => {
    // exibir o mínimo é o que protege quem passa atrás do balcão
    const p = { nome_completo: "José da Silva Matos", iniciais: "J.S.M." };
    expect(comoExibir(p)).toBe("J.S.M.");
    expect(comoExibir(p, { completo: true })).toBe("José da Silva Matos");
  });

  it("nome social tem precedência sobre o de registro", () => {
    // Decreto 8.727/2016 — chamar pelo nome de registro é constrangimento
    const p = { nome_completo: "João Pereira Lima", nome_social: "Joana Pereira Lima" };
    expect(comoExibir(p, { completo: true })).toBe("Joana Pereira Lima");
    expect(comoExibir(p)).toBe("J.P.L.");
  });

  it("cai para as iniciais do cadastro antigo quando não há nome", () => {
    expect(comoExibir({ iniciais: "A.B." })).toBe("A.B.");
    expect(comoExibir(null)).toBe("");
  });
});

describe("sexo — o sistema tem DUAS convenções na base", () => {
  it("aceita as duas e devolve uma só", () => {
    // formulário antigo gravava "masculino"/"feminino"; os dados carregados
    // usam "M"/"F". `sexo === "F"` falharia em metade da base.
    expect(normalizarSexo("masculino")).toBe("M");
    expect(normalizarSexo("Feminino")).toBe("F");
    expect(normalizarSexo("M")).toBe("M");
    expect(normalizarSexo("f")).toBe("F");
  });

  it("vazio e desconhecido viram string vazia, não um chute", () => {
    expect(normalizarSexo("")).toBe("");
    expect(normalizarSexo(null)).toBe("");
    expect(normalizarSexo("outro")).toBe("");
  });

  it("rótulo por extenso funciona com qualquer convenção", () => {
    expect(rotuloSexo("masculino")).toBe("Masculino");
    expect(rotuloSexo("F")).toBe("Feminino");
    expect(rotuloSexo(null)).toBe("—");
  });

  it("sexo em convenção antiga NÃO conta como pendência", () => {
    // o cadastro legado está preenchido; cobrar de novo seria ruído
    const r = conferirCadastro({ sexo: "feminino" });
    expect(r.pendencias.find(p => p.campo === "sexo")).toBeUndefined();
  });

  it("sexo com valor irreconhecível CONTA como pendência", () => {
    const r = conferirCadastro({ sexo: "xyz" });
    expect(r.pendencias.find(p => p.campo === "sexo")).toBeDefined();
  });
});

describe("idade — o cálculo que a pediatria depende", () => {
  const hoje = new Date(2026, 0, 15);   // 15/01/2026

  it("O BUG QUE ISTO CONSERTA: bebê de 26 dias não é '1 ano'", () => {
    // nascido em 20/12/2025; a subtração de anos (2026−2025) daria 1 ano =
    // 12 meses, e a triagem avaliaria FC/FR contra a faixa de 12 meses.
    const d = idadeDetalhada("2025-12-20", hoje);
    expect(d.totalMeses).toBe(0);
    expect(d.dias).toBe(26);
    expect(d.rotulo).toBe("26 dias");
  });

  it("conta anos, meses e dias corretamente", () => {
    expect(idadeDetalhada("1957-06-10", hoje)).toMatchObject({ anos: 68, meses: 7, dias: 5 });
    expect(idadeDetalhada("2024-01-15", hoje)).toMatchObject({ anos: 2, meses: 0, dias: 0 });
  });

  it("não faz aniversário antes da hora", () => {
    // nasceu 16/01 — em 15/01 ainda não completou
    expect(idadeDetalhada("2000-01-16", hoje).anos).toBe(25);
    expect(idadeDetalhada("2000-01-15", hoje).anos).toBe(26);
  });

  it("fala como o profissional fala: dias, meses, anos", () => {
    expect(idadeDetalhada("2026-01-14", hoje).rotulo).toBe("1 dia");
    expect(idadeDetalhada("2025-11-15", hoje).rotulo).toBe("2 meses");
    expect(idadeDetalhada("2024-07-15", hoje).rotulo).toBe("18 meses");
    expect(idadeDetalhada("2023-01-15", hoje).rotulo).toBe("3 anos");
  });

  it("data no futuro não vira idade negativa", () => {
    expect(idadeDetalhada("2030-01-01", hoje)).toBe(null);
  });

  it("null para data ausente ou inválida", () => {
    expect(idadeDetalhada(null)).toBe(null);
    expect(idadeDetalhada("data-ruim", hoje)).toBe(null);
  });
});

describe("idadeMesesParaTriagem — e o aviso de que é aproximada", () => {
  const hoje = new Date(2026, 0, 15);

  it("com data exata, devolve meses exatos e marca exata=true", () => {
    const r = idadeMesesParaTriagem({ data_nascimento: "2025-12-20" }, hoje);
    expect(r).toMatchObject({ meses: 0, exata: true });
  });

  it("com só o ano (cadastro antigo), aproxima E AVISA que é aproximado", () => {
    // este é o ponto: o valor continua saindo, mas a tela sabe que não pode
    // confiar nele para sugerir faixa pediátrica
    const r = idadeMesesParaTriagem({ ano_nascimento: 2025 }, hoje);
    expect(r).toMatchObject({ meses: 12, exata: false });
  });

  it("sem nenhuma data, não inventa idade", () => {
    expect(idadeMesesParaTriagem({}, hoje)).toMatchObject({ meses: null, exata: false });
  });
});

describe("conferirCadastro — o que falta para a norma", () => {
  const completo = {
    nome_completo: "José da Silva Matos", data_nascimento: "1957-06-10", sexo: "M",
    nome_mae: "Maria da Silva", naturalidade_municipio: "Porto Alegre", naturalidade_uf: "RS",
    end_logradouro: "Rua das Flores, 100", end_municipio: "Navegantes",
    cpf: CPF_OK, cns: CNS_DEF, telefone: "(47) 99999-0000",
  };

  it("cadastro completo não tem pendência", () => {
    const r = conferirCadastro(completo);
    expect(r.completo).toBe(true);
    expect(r.pendencias).toEqual([]);
    expect(r.percentual).toBe(100);
  });

  it("aponta os campos da CFM 1.638 que faltam — incluindo o nome da mãe", () => {
    const r = conferirCadastro({ ...completo, nome_mae: "", naturalidade_uf: "" });
    const campos = r.pendencias.map(p => p.campo);
    expect(campos).toContain("nome_mae");
    expect(campos).toContain("naturalidade_uf");
    expect(r.completo).toBe(false);
    expect(r.faltamEssenciais).toBe(2);
  });

  it("cadastro só com iniciais (o de hoje) fica longe da norma", () => {
    const r = conferirCadastro({ iniciais: "J.S.M.", ano_nascimento: 1957 });
    expect(r.completo).toBe(false);
    expect(r.percentual).toBe(0);
  });

  it("CPF preenchido porém INVÁLIDO é pendência — pior que vazio", () => {
    const r = conferirCadastro({ ...completo, cpf: "529.982.247-26" });
    const cpf = r.pendencias.find(p => p.campo === "cpf");
    expect(cpf.label).toMatch(/inválido/i);
  });

  it("CNS inválido também é apontado", () => {
    const r = conferirCadastro({ ...completo, cns: "200000000000004" });
    expect(r.pendencias.some(p => p.campo === "cns" && /inválido/i.test(p.label))).toBe(true);
  });

  it("NUNCA bloqueia: devolve pendências, não erro — a emergência entra assim", () => {
    // CFM 1.638, art. 5º, I, "e": atendimento sem anamnese possível existe.
    // Travar o cadastro de um politraumatizado para exigir nome da mãe
    // seria inverter a prioridade.
    const r = conferirCadastro({});
    expect(Array.isArray(r.pendencias)).toBe(true);
    expect(r.pendencias.length).toBeGreaterThan(0);
    expect(() => conferirCadastro(null)).not.toThrow();
  });

  it("separa o que é exigência normativa do que é operacional", () => {
    const r = conferirCadastro({});
    const niveis = new Set(r.pendencias.map(p => p.nivel));
    expect(niveis.has("essencial")).toBe(true);   // CFM 1.638
    expect(niveis.has("documento")).toBe(true);   // CFM 2.299
    expect(niveis.has("contato")).toBe(true);     // só operacional
    // telefone não pode contar como falha de norma
    expect(r.pendencias.find(p => p.campo === "telefone").nivel).toBe("contato");
  });
});

describe("possiveisDuplicatas — evitar dois prontuários da mesma pessoa", () => {
  const base = [
    { prontuario: "1001", nome_completo: "José da Silva Matos", data_nascimento: "1957-06-10", nome_mae: "Maria da Silva", cpf: CPF_OK },
    { prontuario: "1002", nome_completo: "Ana Paula Souza", data_nascimento: "1990-03-02", nome_mae: "Rita Souza", cns: CNS_DEF },
    { prontuario: "1003", nome_completo: "Carlos Eduardo Lima", data_nascimento: "1980-01-01" },
  ];

  it("mesmo CPF é certeza", () => {
    const r = possiveisDuplicatas({ prontuario: "9999", nome_completo: "J S Matos", cpf: "52998224725" }, base);
    expect(r[0].prontuario).toBe("1001");
    expect(r[0].confianca).toBe(100);
    expect(r[0].motivos).toContain("mesmo CPF");
  });

  it("mesmo Cartão SUS também", () => {
    const r = possiveisDuplicatas({ nome_completo: "Outro Nome", cns: CNS_DEF }, base);
    expect(r[0].prontuario).toBe("1002");
    expect(r[0].confianca).toBe(100);
  });

  it("mesmo nome + mesma data de nascimento é forte", () => {
    const r = possiveisDuplicatas({ nome_completo: "Carlos Eduardo Lima", data_nascimento: "1980-01-01" }, base);
    expect(r[0].prontuario).toBe("1003");
    expect(r[0].confianca).toBeGreaterThanOrEqual(90);
  });

  it("pega variação de grafia com a mesma mãe", () => {
    // "José Silva Matos" x "José da Silva Matos" — a partícula não conta
    const r = possiveisDuplicatas({ nome_completo: "José Silva Matos", nome_mae: "Maria da Silva" }, base);
    expect(r[0].prontuario).toBe("1001");
  });

  it("não acusa o próprio registro como duplicata dele mesmo", () => {
    const r = possiveisDuplicatas({ prontuario: "1001", nome_completo: "José da Silva Matos", cpf: CPF_OK }, base);
    expect(r.find(x => x.prontuario === "1001")).toBeUndefined();
  });

  it("homônimo com data diferente NÃO é acusado com força total", () => {
    const r = possiveisDuplicatas({ nome_completo: "Carlos Eduardo Lima", data_nascimento: "1995-05-05" }, base);
    // casa por nome, mas com confiança menor — quem decide é a pessoa
    expect(r[0].confianca).toBeLessThan(90);
  });

  it("sempre diz POR QUE casou — sugestão que não se explica ninguém confere", () => {
    const r = possiveisDuplicatas({ nome_completo: "José da Silva Matos", cpf: CPF_OK }, base);
    expect(r[0].motivos.length).toBeGreaterThan(0);
  });

  it("lista vazia e entrada nula não quebram", () => {
    expect(possiveisDuplicatas({ nome_completo: "X" }, [])).toEqual([]);
    expect(possiveisDuplicatas(null, base)).toEqual([]);
  });
});
