// ═══════════════════════════════════════════════════════════
// RECÉM-NASCIDO
//
// O hospital faz parto e o bebê não tinha como entrar no sistema. O cadastro
// pede nome, CPF e CNS; ele não tem nenhum dos três no dia em que nasce.
//
// 🔴 O TESTE QUE MAIS IMPORTA AQUI É O DOS GÊMEOS.
// Dois irmãos do mesmo parto têm a mesma mãe, a mesma data de nascimento e
// nomes provisórios quase idênticos. O verificador de duplicidade os acusa
// de ser a mesma pessoa — e a tela oferece "use o prontuário que já existe".
// Seguir isso junta dois bebês num prontuário só, e a partir dali a
// prescrição de um vale para o outro.
//
// A prova que separa é a DNV: numerada e única por nascimento.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  conferirIdadeDaMae, IDADE_MATERNA_MIN, IDADE_MATERNA_MAX,
  nomeProvisorioDoRN, ehRecemNascido, temNomeProvisorio,
  validarRecemNascido, pendenciaDeNomeDefinitivo, saoIrmaosDoMesmoParto,
  DIAS_PARA_REGISTRO,
} from "./recem-nascido.js";
import { possiveisDuplicatas } from "./identidade.js";

const MAE = { prontuario: "T5001", nome_completo: "Maria da Silva Souza" };
const HOJE = new Date("2026-08-25T10:00:00");

describe("nome provisório — a convenção que o país inteiro usa", () => {
  it("forma 'RN DE <mãe>' em maiúscula", () => {
    // Maiúscula porque é assim que sai na pulseira e na etiqueta do
    // berçário, e porque distingue de longe provisório de definitivo.
    expect(nomeProvisorioDoRN("Maria da Silva Souza")).toBe("RN DE MARIA DA SILVA SOUZA");
  });

  it("🔴 parto múltiplo numera — nome idêntico é o que faz trocar um pelo outro", () => {
    expect(nomeProvisorioDoRN("Maria Silva", { ordem: 2 })).toBe("RN 2 DE MARIA SILVA");
    expect(nomeProvisorioDoRN("Maria Silva", { ordem: 3 })).toBe("RN 3 DE MARIA SILVA");
  });

  it("o primeiro do parto não leva número — 'RN 1 de' não é a convenção", () => {
    expect(nomeProvisorioDoRN("Maria Silva", { ordem: 1 })).toBe("RN DE MARIA SILVA");
  });

  it("sem nome da mãe não inventa nome nenhum", () => {
    expect(nomeProvisorioDoRN("")).toBe("");
    expect(nomeProvisorioDoRN(null)).toBe("");
  });
});

describe("reconhecer o cadastro de recém-nascido", () => {
  it("o vínculo com a mãe é o que define", () => {
    expect(ehRecemNascido({ prontuario_mae: "T5001" })).toBe(true);
    expect(ehRecemNascido({ nome_completo: "RN DE MARIA" })).toBe(false);
    expect(ehRecemNascido({})).toBe(false);
  });

  it("reconhece o nome provisório com e sem número", () => {
    expect(temNomeProvisorio({ nome_completo: "RN DE MARIA SILVA" })).toBe(true);
    expect(temNomeProvisorio({ nome_completo: "RN 2 DE MARIA SILVA" })).toBe(true);
    expect(temNomeProvisorio({ nome_completo: "rn de maria" })).toBe(true);
    expect(temNomeProvisorio({ nome_completo: "Renata de Souza" })).toBe(false);
    expect(temNomeProvisorio({})).toBe(false);
  });
});

describe("validarRecemNascido", () => {
  it("a mãe é o único obrigatório — dela sai tudo o mais", () => {
    const r = validarRecemNascido({ mae: MAE, dnv: "", data_nascimento: "" });
    expect(r.ok).toBe(true);
    expect(r.pendencias.map(p => p.campo)).toContain("dnv");
    expect(r.pendencias.map(p => p.campo)).toContain("data_nascimento");
  });

  it("sem mãe não abre — sem ela não há nome, vínculo nem pulseira", () => {
    const r = validarRecemNascido({ dnv: "123" });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/Escolha a mãe/i);
  });

  it("mãe cadastrada sem nome completo é recusada com o conserto junto", () => {
    const r = validarRecemNascido({ mae: { prontuario: "T5001" } });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/Complete o cadastro dela/i);
  });

  it("🔴 NÃO BLOQUEIA por falta de DNV — bebê em parada precisa de prontuário agora", () => {
    // O número da DNV pode estar na mão de outra pessoa. O que não pode é a
    // pendência sumir.
    const r = validarRecemNascido({ mae: MAE, data_nascimento: "2026-08-25" });
    expect(r.ok).toBe(true);
    expect(r.pendencias.some(p => p.campo === "dnv")).toBe(true);
  });

  it("ordem de nascimento inválida é recusada", () => {
    expect(validarRecemNascido({ mae: MAE, ordem: 0 }).ok).toBe(false);
    expect(validarRecemNascido({ mae: MAE, ordem: "primeiro" }).ok).toBe(false);
    expect(validarRecemNascido({ mae: MAE, ordem: 2 }).ok).toBe(true);
    expect(validarRecemNascido({ mae: MAE, ordem: "" }).ok).toBe(true);
  });

  it("não explode sem nada", () => {
    expect(() => validarRecemNascido()).not.toThrow();
  });
});

describe("pendenciaDeNomeDefinitivo", () => {
  const rn = dias => ({
    prontuario_mae: "T5001",
    nome_completo: "RN DE MARIA SILVA",
    data_nascimento: new Date(HOJE.getTime() - dias * 86400000).toISOString().slice(0, 10),
  });

  it("nos primeiros dias o nome provisório está CERTO — nada a cobrar", () => {
    // Aviso desde o primeiro dia seria ruído, e ruído é o que faz o aviso
    // que importa deixar de ser lido.
    expect(pendenciaDeNomeDefinitivo(rn(0), HOJE)).toBe(null);
    expect(pendenciaDeNomeDefinitivo(rn(DIAS_PARA_REGISTRO - 1), HOJE)).toBe(null);
  });

  it("🔴 passado o prazo legal vira pendência, e o texto diz o porquê", () => {
    // Lei 6.015/1973, art. 50. Um "RN de Maria" de seis meses no acervo é o
    // começo do prontuário duplicado: ninguém acha a criança pelo nome dela.
    const p = pendenciaDeNomeDefinitivo(rn(40), HOJE);
    expect(p).not.toBe(null);
    expect(p.texto).toMatch(/6\.015/);
    expect(p.texto).toMatch(/ninguém acha esta criança/i);
  });

  it("quem já tem nome de registro não é cobrado", () => {
    const nomeado = { ...rn(90), nome_completo: "Ana Souza Silva" };
    expect(pendenciaDeNomeDefinitivo(nomeado, HOJE)).toBe(null);
  });

  it("quem não é recém-nascido nunca é cobrado", () => {
    expect(pendenciaDeNomeDefinitivo({ nome_completo: "RN DE MARIA" }, HOJE)).toBe(null);
  });

  it("sem data de nascimento não se calcula prazo nenhum", () => {
    expect(pendenciaDeNomeDefinitivo({ prontuario_mae: "T5001", nome_completo: "RN DE MARIA" }, HOJE)).toBe(null);
  });
});

describe("🔴 GÊMEOS NÃO SÃO DUPLICATA", () => {
  const base = {
    nome_mae: "Maria Silva", prontuario_mae: "T5001", data_nascimento: "2026-08-25",
  };
  const g1 = { ...base, prontuario: "T6001", nome_completo: "RN DE MARIA SILVA", dnv: "11111111", ordem_nascimento: 1 };
  const g2 = { ...base, prontuario: "T6002", nome_completo: "RN 2 DE MARIA SILVA", dnv: "22222222", ordem_nascimento: 2 };

  it("DNV diferente é PROVA de nascimentos diferentes", () => {
    expect(saoIrmaosDoMesmoParto(g1, g2)).toBe(true);
  });

  it("sem DNV, a ordem do parto é a prova de segunda linha", () => {
    const semDnv = [{ ...g1, dnv: "" }, { ...g2, dnv: "" }];
    expect(saoIrmaosDoMesmoParto(semDnv[0], semDnv[1])).toBe(true);
  });

  it("🔴 sem NENHUMA prova volta a avisar — podem ser o mesmo bebê duas vezes", () => {
    // Aqui o silêncio seria pior: dois "RN de Maria" no mesmo dia, sem DNV e
    // sem ordem, PODEM ser o mesmo bebê cadastrado em duplicidade.
    const a = { ...base, prontuario: "T6003", nome_completo: "RN DE MARIA SILVA" };
    const b = { ...base, prontuario: "T6004", nome_completo: "RN DE MARIA SILVA" };
    expect(saoIrmaosDoMesmoParto(a, b)).toBe(false);
  });

  it("mães diferentes não são irmãos, por mais parecido que esteja", () => {
    expect(saoIrmaosDoMesmoParto(
      { ...g1, dnv: "", prontuario_mae: "T5001" },
      { ...g2, dnv: "", prontuario_mae: "T5002" },
    )).toBe(false);
  });

  it("datas diferentes não são o mesmo parto", () => {
    expect(saoIrmaosDoMesmoParto(
      { ...g1, dnv: "" },
      { ...g2, dnv: "", data_nascimento: "2026-08-26" },
    )).toBe(false);
  });

  it("mesma ordem não prova nada — é o mesmo lugar no parto", () => {
    expect(saoIrmaosDoMesmoParto({ ...g1, dnv: "" }, { ...g2, dnv: "", ordem_nascimento: 1 })).toBe(false);
  });

  it("🔴 O EFEITO NA DUPLICIDADE: os gêmeos somem da lista", () => {
    // Sem esta regra, cadastrar o segundo gêmeo mostrava "esta pessoa já
    // pode estar cadastrada" apontando para o primeiro — e o caminho
    // oferecido era usar o prontuário dele.
    expect(possiveisDuplicatas(g2, [g1])).toEqual([]);
  });

  it("🔴 E O MESMO BEBÊ CADASTRADO DUAS VEZES CONTINUA SENDO PEGO", () => {
    // A regra dos gêmeos não pode virar um buraco por onde a duplicata
    // verdadeira passa.
    const a = { ...base, prontuario: "T6003", nome_completo: "RN DE MARIA SILVA" };
    const b = { ...base, prontuario: "T6004", nome_completo: "RN DE MARIA SILVA" };
    const achados = possiveisDuplicatas(b, [a]);
    expect(achados).toHaveLength(1);
    expect(achados[0].confianca).toBeGreaterThanOrEqual(90);
  });

it("🔴 DNV IGUAL é o MESMO nascimento — nunca são irmãos", () => {
    // A mutação pegou este buraco: a regra dizia "os dois têm DNV" em vez
    // de "os dois têm DNV DIFERENTE", e aí o mesmo bebê cadastrado duas
    // vezes com a mesma DNV — a duplicata mais clara que existe — passava
    // por par de gêmeos e sumia do aviso.
    const mesmo1 = { ...base, prontuario: "T6005", nome_completo: "RN DE MARIA SILVA", dnv: "11111111" };
    const mesmo2 = { ...base, prontuario: "T6006", nome_completo: "RN DE MARIA SILVA", dnv: "11111111" };
    expect(saoIrmaosDoMesmoParto(mesmo1, mesmo2)).toBe(false);
    expect(possiveisDuplicatas(mesmo2, [mesmo1]).length).toBeGreaterThan(0);
  });

  it("DNV igual manda mesmo com ordem diferente — o documento é mais forte", () => {
    // Se a DNV é a mesma, a ordem divergente é erro de digitação, não parto
    // múltiplo: a DNV é única POR NASCIMENTO.
    const a = { ...base, prontuario: "T6007", dnv: "99999999", ordem_nascimento: 1, nome_completo: "RN DE MARIA SILVA" };
    const b = { ...base, prontuario: "T6008", dnv: "99999999", ordem_nascimento: 2, nome_completo: "RN 2 DE MARIA SILVA" };
    expect(saoIrmaosDoMesmoParto(a, b)).toBe(false);
  });

  it("não explode com nada", () => {
    expect(() => saoIrmaosDoMesmoParto()).not.toThrow();
    expect(saoIrmaosDoMesmoParto(null, {})).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// IDADE DA MÃE
//
// 🔴 O aviso é sobre VÍNCULO TROCADO, não sobre biologia. Quem traz o bebê
// muitas vezes é a avó, e escolher a linha errada numa lista de homônimas
// é fácil — a idade implausível é o sintoma barato disso.
//
// ⚠️ E ELE NÃO PODE ACENDER EM DADO CORRETO. Mãe adolescente existe; um
// aviso que dispara nela ensina a equipe a fechar aviso sem ler, e aí o
// próximo, que é de verdade, passa junto.
// ═══════════════════════════════════════════════════════════

describe("a idade da mãe", () => {
  const c = (nascMae, nascBebe = "2026-08-26") =>
    conferirIdadeDaMae({ mae: { data_nascimento: nascMae }, data_nascimento: nascBebe });

  it("🔴 CALA a boca na faixa larga — mãe adolescente não é alarme", () => {
    expect(c("1998-03-02")).toBeNull();          // 28
    expect(c("2012-03-02")).toBeNull();          // 14
    expect(c("2009-01-01")).toBeNull();          // 17
    expect(c("1975-06-10")).toBeNull();          // 51
  });

  it("acende para quem tem cara de avó — o erro mais comum do balcão", () => {
    const r = c("1964-03-02");                   // 62
    expect(r.tipo).toBe("implausivel");
    expect(r.anos).toBe(62);
    expect(r.texto).toMatch(/avó/);
    expect(r.texto).toMatch(/não fica travado/);  // avisa, não bloqueia
  });

  it("acende embaixo, onde o vínculo trocado é mais provável que o fato", () => {
    expect(c("2018-03-02").anos).toBe(8);
  });

  it("as bordas da faixa são os números literais, não a constante", () => {
    // Escrever 10 e 55 à mão: comparar com a própria constante faria o
    // teste se mover junto com o erro, e a mutação passaria verde.
    expect(IDADE_MATERNA_MIN).toBe(10);
    expect(IDADE_MATERNA_MAX).toBe(55);
    expect(c("2016-08-26")).toBeNull();          // 10 em ponto — cala
    expect(c("2016-08-27")).not.toBeNull();      // 9 — acende
    expect(c("1971-08-27")).toBeNull();          // 54 — cala
    expect(c("1971-08-26")).not.toBeNull();      // 55 — acende
  });

  it("mãe nascida na mesma data do bebê ou depois é IMPOSSÍVEL, não improvável", () => {
    expect(c("2027-01-01").tipo).toBe("impossivel");
    expect(c("2026-08-26").tipo).toBe("impossivel");   // mesmo dia
    expect(c("2027-01-01").texto).toMatch(/impossível/);
    expect(c("2027-01-01").anos).toBeNull();
  });

  it("sem data não há idade — e \"não sei\" não é motivo de alarme", () => {
    expect(c("", "2026-08-26")).toBeNull();
    expect(c("1998-03-02", "")).toBeNull();
    expect(c(null, null)).toBeNull();
    expect(conferirIdadeDaMae()).toBeNull();
    expect(conferirIdadeDaMae({ mae: null })).toBeNull();
  });

  it("a idade é a do dia do PARTO, não a de hoje", () => {
    // Uma mesma mãe, dois partos. Se a conta usasse a idade de HOJE (36),
    // os dois calariam — e o parto de 1999, em que ela tinha 9 anos, é
    // exatamente o que este aviso existe para pegar.
    expect(c("1990-01-01", "1999-06-01").anos).toBe(9);     // acende
    expect(c("1990-01-01", "2005-06-01")).toBeNull();       // 15 na época: cala
  });
});
