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
  limparDoc, validarCPF, formatarCPF, validarCNS, formatarCNS, tipoCNS, formatarTelefone,
  normalizarNome, partesDoNome, iniciaisDe, comoExibir, normalizarSexo, rotuloSexo,
  idadeDetalhada, idadeMesesParaTriagem,
  conferirCadastro, possiveisDuplicatas, documentoEmUso, mensagemDocumentoEmUso,
  NACIONALIDADES, normalizarNacionalidade, rotuloNacionalidade, nascidoNoBrasil,
  autodeclaradoIndigena, limparCamposInaplicaveis,
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

// 🔴 O índice único de CPF recusava a segunda ficha com 409, e a tela dizia
// "confirme que a migração foi aplicada". Quem está no balcão com fila não
// abre chamado: apaga o CPF e salva — e aí o duplicado passa SEM documento,
// invisível ao próprio índice que existia para impedi-lo.
describe("documento que já é de outro prontuário", () => {
  const outro = { prontuario: "T4471", nome_completo: "José da Silva", cpf: "52998224725", cns: null };

  it("acha o dono do CPF, mesmo com pontuação de um lado só", () => {
    const c = documentoEmUso({ cpf: "529.982.247-25", prontuario: "T9999" }, [outro]);
    expect(c).not.toBeNull();
    expect(c.prontuario).toBe("T4471");
    expect(c.campo).toBe("CPF");
  });

  it("acha pelo Cartão SUS também", () => {
    const dono = { prontuario: "T50", cns: "123456789012345" };
    expect(documentoEmUso({ cns: "1234 5678 9012 345", prontuario: "T9" }, [dono]).campo).toBe("Cartão SUS");
  });

  it("o próprio cadastro em edição NÃO conflita consigo mesmo", () => {
    expect(documentoEmUso({ cpf: "52998224725", prontuario: "T4471" }, [outro])).toBeNull();
  });

  it("sem documento não há conflito a apurar", () => {
    expect(documentoEmUso({ prontuario: "T1" }, [outro])).toBeNull();
    expect(documentoEmUso({ cpf: "", cns: "" }, [outro])).toBeNull();
    expect(documentoEmUso(null, [outro])).toBeNull();
    expect(documentoEmUso({ cpf: "52998224725" }, null)).toBeNull();
  });

  it("a mensagem diz o prontuário, o nome, e fecha a porta do 'apaga o CPF'", () => {
    const texto = mensagemDocumentoEmUso(documentoEmUso({ cpf: "52998224725", prontuario: "T9" }, [outro]));
    expect(texto).toMatch(/T4471/);
    expect(texto).toMatch(/José da Silva/);
    expect(texto).toMatch(/[Nn]ão apague/);
    // e NÃO culpa migração nem permissão, que foi o que mandou a pessoa
    // procurar o problema no lugar errado
    expect(texto).not.toMatch(/migra[çc]/i);
    expect(texto).not.toMatch(/perfil/i);
  });

  it("sem conflito, sem mensagem", () => {
    expect(mensagemDocumentoEmUso(null)).toBe("");
  });
});

// 🔴 A busca por telefone normaliza para dígitos; o cadastro gravava o que
// fosse digitado. "(51) 3664-1234" e "5136641234" viravam duas coisas
// diferentes, e procurar pelo número que está na tela não achava o paciente
// que está na tela. Achei percorrendo: a consulta saía certa e voltava vazia.
// É a mesma lição que o CPF já tinha documentada — o telefone ficou de fora.
describe("telefone: guardado em dígitos, formatado só na exibição", () => {
  it("celular com 11 dígitos", () => {
    expect(formatarTelefone("51999990000")).toBe("(51) 99999-0000");
  });

  it("fixo com 10 dígitos", () => {
    expect(formatarTelefone("5136641234")).toBe("(51) 3664-1234");
  });

  it("aceita entrada já formatada — a exibição não depende de como foi digitado", () => {
    expect(formatarTelefone("(51) 3664-1234")).toBe("(51) 3664-1234");
  });

  it("o que não tem 10 nem 11 dígitos volta como veio — não se inventa formato", () => {
    expect(formatarTelefone("3664")).toBe("3664");
    expect(formatarTelefone("")).toBe("");
    expect(formatarTelefone(null)).toBe("");
  });
});

// ── NACIONALIDADE E ETNIA ───────────────────────────────────
//
// Duas populações que o cadastro atendia mal, cada uma de um jeito:
//
//   O ESTRANGEIRO ficava com pendência IMPOSSÍVEL. Município e UF de
//   nascimento eram essenciais para todo mundo, e quem nasceu no Uruguai
//   não tem nem um nem outro — o cadastro nunca chegava a "completo".
//   Pendência que não tem como ser resolvida ensina a ignorar o aviso, e
//   aí o aviso que importa some junto.
//
//   O INDÍGENA ficava com cadastro plausível na tela e ARQUIVO REJEITADO
//   no fechamento do mês: raça/cor indígena sem etnia não é aceita nos
//   sistemas de informação do SUS, e o erro aparecia longe de quem digitou.

describe("nacionalidade — três valores, porque cada um muda o que se exige", () => {
  it("lê o texto livre que a coluna já tem", () => {
    // O campo nasceu como texto com "Brasileira" de padrão. Comparar com
    // igualdade exata acharia zero linhas na base inteira.
    expect(normalizarNacionalidade("Brasileira")).toBe("brasileira");
    expect(normalizarNacionalidade("BRASILEIRO")).toBe("brasileira");
    expect(normalizarNacionalidade("Naturalizada")).toBe("naturalizada");
    expect(normalizarNacionalidade("Estrangeira")).toBe("estrangeira");
  });

  it("vazio é BRASILEIRA — era o que o formulário gravava sozinho", () => {
    // Tratar cadastro antigo como estrangeiro faria a tela cobrar país de
    // nascimento de um acervo inteiro que nasceu aqui.
    expect(normalizarNacionalidade("")).toBe("brasileira");
    expect(normalizarNacionalidade(null)).toBe("brasileira");
    expect(nascidoNoBrasil({})).toBe(true);
  });

  it("país digitado no lugar da nacionalidade conta como estrangeira", () => {
    // Alguém digitou "Uruguaia" no campo livre. Não é a brasileira, então
    // é de fora — e a migração leva esse texto para pais_nascimento.
    expect(normalizarNacionalidade("Uruguaia")).toBe("estrangeira");
    expect(nascidoNoBrasil({ nacionalidade: "Haitiana" })).toBe(false);
  });

  it("naturalizada NÃO é estrangeira — a diferença é o CPF", () => {
    expect(normalizarNacionalidade("naturalizada")).not.toBe("estrangeira");
    expect(rotuloNacionalidade("naturalizada")).toBe("Naturalizada");
    expect(NACIONALIDADES.map(n => n.chave)).toEqual(["brasileira", "naturalizada", "estrangeira"]);
  });

  it("raça/cor indígena é reconhecida com e sem acento", () => {
    expect(autodeclaradoIndigena({ raca_cor: "indigena" })).toBe(true);
    expect(autodeclaradoIndigena({ raca_cor: "Indígena" })).toBe(true);
    expect(autodeclaradoIndigena({ raca_cor: "parda" })).toBe(false);
    expect(autodeclaradoIndigena({})).toBe(false);
  });
});

describe("conferirCadastro — estrangeiro e indígena", () => {
  const brasileiro = {
    nome_completo: "José da Silva Matos", data_nascimento: "1957-06-10", sexo: "M",
    nome_mae: "Maria da Silva", naturalidade_municipio: "Porto Alegre", naturalidade_uf: "RS",
    end_logradouro: "Rua das Flores, 100", end_municipio: "Navegantes",
    cpf: CPF_OK, cns: CNS_DEF, telefone: "(47) 99999-0000",
  };
  // A mesma ficha, para quem nasceu fora: sem município/UF brasileiros, sem
  // CPF, com passaporte e país de nascimento.
  const estrangeiro = {
    ...brasileiro,
    nacionalidade: "estrangeira",
    naturalidade_municipio: "", naturalidade_uf: "",
    cpf: "", passaporte: "FL7712345", pais_nascimento: "Uruguai",
  };

  it("🔴 O BUG: estrangeiro completo chega a 100%, não a 78% para sempre", () => {
    const r = conferirCadastro(estrangeiro);
    expect(r.completo).toBe(true);
    expect(r.percentual).toBe(100);
    // e nenhuma pendência de naturalidade brasileira sobra na lista
    const campos = r.pendencias.map(x => x.campo);
    expect(campos).not.toContain("naturalidade_municipio");
    expect(campos).not.toContain("naturalidade_uf");
  });

  it("o país de nascimento ocupa o lugar da naturalidade, e é cobrado", () => {
    const r = conferirCadastro({ ...estrangeiro, pais_nascimento: "" });
    const pend = r.pendencias.find(x => x.campo === "pais_nascimento");
    expect(pend?.nivel).toBe("essencial");
    expect(r.completo).toBe(false);
  });

  it("de brasileiro NÃO se pede país de nascimento", () => {
    const r = conferirCadastro(brasileiro);
    expect(r.pendencias.map(x => x.campo)).not.toContain("pais_nascimento");
    expect(r.percentual).toBe(100);
  });

  it("do estrangeiro não se cobra CPF — cobra-se UM documento", () => {
    // Turista e recém-chegado podem não ter CPF nenhum. Quem já tirou
    // resolve com ele: a exigência é ter documento, não ter aquele.
    expect(conferirCadastro(estrangeiro).pendencias.map(x => x.campo)).not.toContain("cpf");

    const semNada = conferirCadastro({ ...estrangeiro, passaporte: "", cpf: "" });
    expect(semNada.pendencias.some(x => x.campo === "passaporte")).toBe(true);

    const soComCpf = conferirCadastro({ ...estrangeiro, passaporte: "", cpf: CPF_OK });
    expect(soComCpf.pendencias.some(x => x.campo === "passaporte")).toBe(false);
  });

  it("de brasileiro e de naturalizado o CPF continua sendo cobrado", () => {
    for (const nac of ["brasileira", "naturalizada"]) {
      const r = conferirCadastro({ ...brasileiro, nacionalidade: nac, cpf: "" });
      expect(r.pendencias.some(x => x.campo === "cpf"), nac).toBe(true);
    }
  });

  it("naturalizado também não tem naturalidade brasileira", () => {
    // Nasceu fora e é brasileiro hoje: o país de nascimento existe, o
    // município e a UF não.
    const r = conferirCadastro({
      ...brasileiro, nacionalidade: "naturalizada",
      naturalidade_municipio: "", naturalidade_uf: "", pais_nascimento: "Portugal",
    });
    expect(r.completo).toBe(true);
  });

  it("🔴 raça/cor indígena SEM etnia é pendência — é o que derruba o BPA", () => {
    const r = conferirCadastro({ ...brasileiro, raca_cor: "indigena" });
    const etnia = r.pendencias.find(x => x.campo === "etnia_indigena");
    expect(etnia).toBeDefined();
    // Nível "sus": é exigência de faturamento, não da CFM 1.638. Não pode
    // derrubar o `completo` nem o percentual da identificação.
    expect(etnia.nivel).toBe("sus");
    expect(r.completo).toBe(true);
  });

  it("com a etnia preenchida a pendência some", () => {
    const r = conferirCadastro({ ...brasileiro, raca_cor: "indigena", etnia_indigena: "Kaingang" });
    expect(r.pendencias.map(x => x.campo)).not.toContain("etnia_indigena");
  });

  it("de quem NÃO se declarou indígena a etnia nunca é pedida", () => {
    for (const cor of ["", "branca", "parda", "preta", "amarela"]) {
      const r = conferirCadastro({ ...brasileiro, raca_cor: cor });
      expect(r.pendencias.map(x => x.campo), cor).not.toContain("etnia_indigena");
    }
  });
});

// 🔴 CAMPO QUE DEIXOU DE VALER CONTINUAVA GRAVADO.
//
// Achei percorrendo a tela: marquei "Estrangeira", preenchi o país,
// corrigi para "Brasileira" — e o país continuou no banco. Invisível,
// porque o campo que o mostrava não é mais desenhado. Dado que ninguém vê
// e ninguém consegue apagar é o pior tipo: some da tela e continua indo
// para o arquivo de produção.
//
// A etnia é a que machuca: o BPA leria etnia de quem não se declarou
// indígena — informação sobre origem de uma pessoa, errada, num arquivo
// que sai do hospital.
describe("limparCamposInaplicaveis", () => {
  it("brasileiro não guarda país de nascimento nem passaporte escondidos", () => {
    const r = limparCamposInaplicaveis({
      nacionalidade: "brasileira", pais_nascimento: "Uruguai", passaporte: "FL7712345",
    });
    expect(r.pais_nascimento).toBe(null);
    expect(r.passaporte).toBe(null);
  });

  it("estrangeiro e naturalizado MANTÊM país e passaporte — os campos existem na tela", () => {
    for (const nac of ["estrangeira", "naturalizada"]) {
      const r = limparCamposInaplicaveis({
        nacionalidade: nac, pais_nascimento: "Uruguai", passaporte: "FL7712345",
      });
      expect(r.pais_nascimento, nac).toBe("Uruguai");
      expect(r.passaporte, nac).toBe("FL7712345");
    }
  });

  it("quem não se declarou indígena não carrega etnia", () => {
    expect(limparCamposInaplicaveis({ raca_cor: "parda", etnia_indigena: "Charrua" }).etnia_indigena).toBe(null);
    expect(limparCamposInaplicaveis({ raca_cor: "", etnia_indigena: "Charrua" }).etnia_indigena).toBe(null);
  });

  it("quem se declarou indígena mantém a etnia", () => {
    expect(limparCamposInaplicaveis({ raca_cor: "indigena", etnia_indigena: "Charrua" }).etnia_indigena).toBe("Charrua");
  });

  it("devolve objeto NOVO — o formulário segue mostrando o que a pessoa digitou", () => {
    const original = { nacionalidade: "brasileira", pais_nascimento: "Uruguai" };
    const r = limparCamposInaplicaveis(original);
    expect(original.pais_nascimento).toBe("Uruguai");
    expect(r).not.toBe(original);
  });

  it("não explode com nada", () => {
    expect(() => limparCamposInaplicaveis(null)).not.toThrow();
    expect(() => limparCamposInaplicaveis(undefined)).not.toThrow();
  });
});
