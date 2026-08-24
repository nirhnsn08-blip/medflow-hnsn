// ═══════════════════════════════════════════════════════════
// AS REGRAS DA PORTA DE ENTRADA
//
// Três coisas aqui não são teste de formalidade — são teste de defeito
// que já custou caro em sistema hospitalar:
//
//   1. A BUSCA NÃO PODE MENTIR. Um caractere que quebra a sintaxe do
//      filtro devolve "nenhum resultado" em vez de erro, e a recepção
//      cadastra de novo alguém que já existe. Prontuário duplicado começa
//      assim.
//   2. IDADE APARENTE NÃO VIRA DATA DE NASCIMENTO. A triagem pediátrica
//      escolhe faixa de sinal vital pela idade; faixa escolhida por
//      palpite decide conduta com base em nada.
//   3. ATENDIMENTO SEM PACIENTE NÃO ABRE. É a trava que separa o
//      histórico íntegro do histórico partido.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
// A busca mora em `dados.js`, mas o que ela devolve é regra da recepção — e
// `buscarPacientes` recebe o `sb` por parâmetro, então testa com um dublê.
import { buscarPacientes } from "./dados.js";
import {
  validarProntuario, normalizarProntuario, escaparTermoBusca, classificarBusca,
  TIPOS_DISPONIVEIS,
  filtroBuscaPacientes, filtroBuscaPacientesLegado, palavrasDeBusca,
  dadosNaoIdentificado, aguardandoIdentificacao,
  pendenciasDeIdentificacao, validarAbertura, TIPOS_ATENDIMENTO, psPedeDetalhe,
} from "./recepcao.js";

// Um cadastro que passa na régua da CFM 1.638 — base para os casos que
// querem testar OUTRA coisa sem esbarrar em pendência de cadastro.
const COMPLETO = {
  prontuario: "1001",
  iniciais: "M.S.",
  nome_completo: "Maria Silva",
  data_nascimento: "1980-05-10",
  sexo: "F",
  nome_mae: "Ana Silva",
  naturalidade_municipio: "Torres",
  naturalidade_uf: "RS",
  end_logradouro: "Rua A",
  end_municipio: "Torres",
};

describe("número do prontuário", () => {
  it("aceita o alfanumérico que o hospital já usa", () => {
    expect(validarProntuario("T9035")).toEqual({ ok: true, valor: "T9035" });
    expect(validarProntuario("  48213 ")).toEqual({ ok: true, valor: "48213" });
  });

  it("recusa vazio", () => {
    expect(validarProntuario("").ok).toBe(false);
    expect(validarProntuario("   ").ok).toBe(false);
  });

  it("recusa espaço no meio — é o que vem de colagem de planilha", () => {
    const r = validarProntuario("48 213");
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/espaço/i);
  });

  it("recusa caractere que atrapalharia a consulta", () => {
    expect(validarProntuario("48/213").ok).toBe(false);
    expect(validarProntuario("48,213").ok).toBe(false);
    expect(validarProntuario("48%213").ok).toBe(false);
  });

  it("recusa número absurdamente longo", () => {
    expect(validarProntuario("1".repeat(31)).ok).toBe(false);
  });

  it("normalizar é estável e trata nulo", () => {
    expect(normalizarProntuario(null)).toBe("");
    expect(normalizarProntuario(undefined)).toBe("");
    expect(normalizarProntuario(" A1 ")).toBe("A1");
  });
});

describe("a busca não pode quebrar a consulta", () => {
  it("tira os caracteres que delimitam o filtro do PostgREST", () => {
    expect(escaparTermoBusca("Maria (Bia), Souza")).toBe("Maria Bia Souza");
    expect(escaparTermoBusca("O'Brien")).toBe("O Brien");
    expect(escaparTermoBusca("a.b*c")).toBe("a b c");
  });

  it("um termo hostil não vira filtro extra", () => {
    // Sem escapar, isto fecharia o `or=(` e emendaria outra condição.
    const filtro = filtroBuscaPacientes("Maria),cpf.eq.0");
    expect(filtro).not.toBeNull();
    // O parêntese de fechamento é exatamente um: o do próprio `or=(`.
    expect((filtro.match(/\)/g) || []).length).toBe(1);
    expect(filtro).not.toMatch(/cpf\.eq\.0/);
  });
});

describe("o que a recepção digitou", () => {
  it("11 dígitos é CPF", () => {
    const c = classificarBusca("529.982.247-25");
    expect(c.tipo).toBe("cpf");
    expect(c.valor).toBe("52998224725");
    expect(c.valido).toBe(true);
  });

  it("CPF com dígito verificador errado ainda é buscado como CPF", () => {
    // Buscar como nome nunca acharia. Melhor procurar e não achar do que
    // procurar no lugar errado.
    const c = classificarBusca("529.982.247-26");
    expect(c.tipo).toBe("cpf");
    expect(c.valido).toBe(false);
  });

  it("15 dígitos é Cartão SUS", () => {
    expect(classificarBusca("123 4567 8901 2345").tipo).toBe("cns");
  });

  it("número curto ou com letra na frente é prontuário", () => {
    expect(classificarBusca("48213").tipo).toBe("prontuario");
    expect(classificarBusca("T9035").tipo).toBe("prontuario");
  });

  it("o resto é nome", () => {
    expect(classificarBusca("Maria Silva").tipo).toBe("nome");
  });

  it("vazio é vazio", () => {
    expect(classificarBusca("").tipo).toBe("vazio");
    expect(classificarBusca("   ").tipo).toBe("vazio");
    expect(filtroBuscaPacientes("")).toBeNull();
  });

  it("nome curto demais não consulta — varreria a tabela por nada", () => {
    expect(filtroBuscaPacientes("Jo")).toBeNull();
  });

  // 🔴 A busca antiga era substring CONTÍGUA num `ilike` sem unaccent, sobre
  // três colunas em OR. Não achava "JOSÉ" digitando "JOSE", nem "MARIA DA
  // SILVA" digitando "MARIA SILVA" — e busca que não acha é a máquina de
  // duplicatas, que aqui são PERMANENTES (não existe unificação).
  it("exige TODAS as palavras, em qualquer ordem, na coluna normalizada", () => {
    const f = filtroBuscaPacientes("Maria Silva");
    expect(f).toBe("and=(nome_busca.ilike.*MARIA*,nome_busca.ilike.*SILVA*)");
  });

  it("a partícula no meio deixa de atrapalhar", () => {
    // "MARIA SILVA" tem que servir para "MARIA DA SILVA" e "MARIA DE SOUZA
    // SILVA": as duas palavras aparecem, e é só isso que se exige.
    expect(palavrasDeBusca("Maria Silva")).toEqual(["MARIA", "SILVA"]);
    expect(palavrasDeBusca("silva maria")).toEqual(["SILVA", "MARIA"]);
  });

  it("acento sai dos dois lados — é o que faz JOSE achar JOSÉ", () => {
    expect(palavrasDeBusca("José")).toEqual(["JOSE"]);
    expect(palavrasDeBusca("CONCEIÇÃO")).toEqual(["CONCEICAO"]);
    expect(palavrasDeBusca("Antônio")).toEqual(["ANTONIO"]);
  });

  it("inicial solta não vira exigência", () => {
    // "J. SILVA" exigir "J" só faria achar menos; a inicial some.
    expect(palavrasDeBusca("J. Silva")).toEqual(["SILVA"]);
  });

  it("o que quebraria a URL do PostgREST não sobrevive à normalização", () => {
    // Vírgula e parêntese delimitam o filtro; `%` e `_` são curinga do like.
    // O que se confere são os VALORES — os delimitadores do `and=(...)` são
    // estrutura e têm que estar lá.
    const f = filtroBuscaPacientes("Maria (Bia), 100%_x");
    expect(f).toMatch(/^and=\(nome_busca\.ilike/);
    const valores = [...f.matchAll(/nome_busca\.ilike\.\*([^*]*)\*/g)].map(m => m[1]);
    expect(valores.length).toBeGreaterThan(0);
    for (const v of valores) expect(v).toMatch(/^[A-Z0-9]+$/);
  });

  it("o mínimo de 3 é do termo inteiro, não de cada palavra", () => {
    expect(filtroBuscaPacientes("Jo")).toBeNull();
    expect(palavrasDeBusca("Ana")).toEqual(["ANA"]);
  });

  // O recuo que segura a recepção no intervalo entre o merge e o SQL rodado:
  // sem `nome_busca` no banco, a consulta nova dá 400 e a busca pararia
  // INTEIRA, dizendo "nenhum paciente encontrado" para todo mundo.
  it("o filtro legado continua procurando nas três colunas de nome", () => {
    const f = filtroBuscaPacientesLegado("Maria Silva");
    expect(f).toMatch(/nome_completo\.ilike/);
    expect(f).toMatch(/nome_social\.ilike/);
    expect(f).toMatch(/nome_mae\.ilike/);
    expect(f).not.toMatch(/nome_busca/);
  });

  it("o legado não muda o que não é nome — documento e prontuário são iguais nos dois", () => {
    expect(filtroBuscaPacientesLegado("529.982.247-25")).toBe(filtroBuscaPacientes("529.982.247-25"));
    expect(filtroBuscaPacientesLegado("t9035")).toBe(filtroBuscaPacientes("t9035"));
  });

  it("documento vira igualdade exata, não busca parcial", () => {
    expect(filtroBuscaPacientes("529.982.247-25")).toBe("or=(cpf.eq.52998224725)");
  });

  // 🔴 O acervo é "T9035" e ninguém digita maiúscula com fila na frente. Com
  // `eq` (case-sensitive) a tela dizia "nenhum paciente encontrado" para um
  // paciente que está lá — e a recepcionista cadastrava de novo. Busca que
  // não acha é a máquina de duplicatas, e duplicata aqui é permanente:
  // não existe unificação de prontuário no sistema.
  it("prontuário não diferencia maiúscula de minúscula", () => {
    expect(filtroBuscaPacientes("t9035")).toBe("or=(prontuario.ilike.t9035)");
    expect(filtroBuscaPacientes("T9035")).toBe("or=(prontuario.ilike.T9035)");
    // e continua sem curinga: é comparação exata, não "começa com"
    expect(filtroBuscaPacientes("T9035")).not.toMatch(/\*/);
  });
});

// 🔴 A distinção que este bloco protege já esteve escrita num comentário de
// `buscarPacientes` — e perdida nos três `return []` logo abaixo dele.
// Defender no comentário e perder no retorno faz a tela dizer "esse paciente
// não existe" quando ninguém conseguiu perguntar, e é assim que uma queda de
// rede vira prontuário duplicado. Duplicata aqui é PERMANENTE.
describe("busca: 'não achei' nunca pode virar 'não deu para perguntar'", () => {
  const UM = [{ prontuario: "T1", nome_completo: "Maria" }];

  it("achou devolve ok com a lista", async () => {
    const r = await buscarPacientes(async () => UM, "Maria Silva");
    expect(r.ok).toBe(true);
    expect(r.lista).toEqual(UM);
  });

  it("procurou e não achou é ok com lista VAZIA — a tela pode oferecer cadastrar", async () => {
    const r = await buscarPacientes(async () => [], "Maria Silva");
    expect(r.ok).toBe(true);
    expect(r.lista).toEqual([]);
  });

  it("consulta que FALHA não é lista vazia — nem depois do recuo", async () => {
    // `sb` devolve null em qualquer falha (rede, RLS, coluna inexistente).
    const r = await buscarPacientes(async () => null, "Maria Silva");
    expect(r.ok).toBe(false);
    expect(r.lista).toBeUndefined();
    expect(r.motivo).toBeTruthy();
  });

  it("documento e prontuário não têm recuo — a falha é falha na primeira", async () => {
    // Aqui o filtro legado é idêntico ao novo: não há segunda tentativa, e
    // era ESTE o ramo que devolvia `[]` calado.
    for (const termo of ["529.982.247-25", "T9035"]) {
      const r = await buscarPacientes(async () => null, termo);
      expect(r.ok).toBe(false);
    }
  });

  it("o recuo salva quando só a consulta nova falha", async () => {
    let chamadas = 0;
    const sb = async url => {
      chamadas += 1;
      return url.includes("nome_busca") ? null : UM;   // a nova falha, a antiga responde
    };
    const r = await buscarPacientes(sb, "Maria Silva");
    expect(chamadas).toBe(2);
    expect(r.ok).toBe(true);
    expect(r.lista).toEqual(UM);
  });

  it("termo curto é ok, não falha — a decisão de não perguntar foi nossa", async () => {
    const r = await buscarPacientes(async () => { throw new Error("não devia consultar"); }, "Jo");
    expect(r.ok).toBe(true);
    expect(r.lista).toEqual([]);
    expect(r.curto).toBe(true);
  });
});

describe("paciente que chega sem se identificar", () => {
  const base = { prontuario: "1042", sexo: "masculino", idadeAparente: "cerca de 60 anos" };

  it("exige prontuário — o vínculo é justamente o que não se abre mão", () => {
    expect(() => dadosNaoIdentificado({ prontuario: "" })).toThrow();
  });

  it("NÃO transforma idade aparente em data nem em ano de nascimento", () => {
    const d = dadosNaoIdentificado(base);
    expect(d.data_nascimento).toBeUndefined();
    expect(d.ano_nascimento).toBeUndefined();
    // A observação registra o que foi visto, em texto, onde nenhum cálculo
    // de faixa etária vai consumir.
    expect(d.observacao).toMatch(/60 anos/);
    expect(d.observacao).toMatch(/NÃO é data de nascimento/);
  });

  it("registra o sexo normalizado — é observável e a clínica usa", () => {
    expect(dadosNaoIdentificado(base).sexo).toBe("M");
    expect(dadosNaoIdentificado({ ...base, sexo: "" }).sexo).toBeNull();
  });

  it("marca a pendência e diz de onde veio o cadastro", () => {
    const d = dadosNaoIdentificado(base);
    expect(d.nao_identificado).toBe(true);
    expect(d.identificado_em).toBeNull();
    expect(d.origem_cadastro).toBe("recepcao");
    expect(d.iniciais).toBe("NÃO IDENTIFICADO");
  });

  it("cita a norma que permite atender assim", () => {
    expect(dadosNaoIdentificado(base).observacao).toMatch(/1\.638/);
  });

  it("segue pendente até alguém concluir a identificação", () => {
    expect(aguardandoIdentificacao({ nao_identificado: true, identificado_em: null })).toBe(true);
    expect(aguardandoIdentificacao({ nao_identificado: true, identificado_em: "2026-07-28T10:00:00Z" })).toBe(false);
    expect(aguardandoIdentificacao({ nao_identificado: false })).toBe(false);
    expect(aguardandoIdentificacao(null)).toBe(false);
  });

  it("a pendência de identidade aparece ANTES das pendências de campo", () => {
    const p = pendenciasDeIdentificacao({ nao_identificado: true, identificado_em: null });
    expect(p.completo).toBe(false);
    expect(p.aguardandoIdentificacao).toBe(true);
    expect(p.pendencias[0].campo).toBe("nao_identificado");
  });

  it("cadastro completo e identificado não tem pendência", () => {
    const p = pendenciasDeIdentificacao(COMPLETO);
    expect(p.completo).toBe(true);
    expect(p.aguardandoIdentificacao).toBeUndefined();
  });
});

describe("abertura do atendimento", () => {
  const ok = { paciente: COMPLETO, tipo: "emergencia", origem: "Meios próprios" };

  it("abre quando tem paciente, tipo e origem", () => {
    const r = validarAbertura(ok);
    expect(r.ok).toBe(true);
    expect(r.erros).toEqual([]);
  });

  it("NÃO abre sem paciente", () => {
    const r = validarAbertura({ ...ok, paciente: null });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/prontuário/i);
  });

  it("NÃO abre sem origem", () => {
    expect(validarAbertura({ ...ok, origem: "" }).ok).toBe(false);
  });

  it("origem regulada exige dizer de onde veio", () => {
    expect(psPedeDetalhe("GERINT (aceite)")).toBe(true);
    expect(validarAbertura({ ...ok, origem: "GERINT (aceite)" }).ok).toBe(false);
    expect(validarAbertura({ ...ok, origem: "GERINT (aceite)", origemDetalhe: "PA Torres" }).ok).toBe(true);
  });

  it("recusa tipo que a tela ainda não abre", () => {
    const indisponivel = TIPOS_ATENDIMENTO.find(t => !t.disponivel);
    const r = validarAbertura({ ...ok, tipo: indisponivel.chave });
    expect(r.ok).toBe(false);
  });

  it("recusa tipo inexistente", () => {
    expect(validarAbertura({ ...ok, tipo: "chute" }).ok).toBe(false);
  });

  it("AVISA (sem impedir) quando já há atendimento em aberto", () => {
    const r = validarAbertura({
      ...ok,
      atendimentosAbertos: [{ prontuario: "1001", status: "em_atendimento" }],
    });
    expect(r.ok).toBe(true);
    expect(r.avisos.map(a => a.chave)).toContain("atendimento_aberto");
  });

  it("atendimento finalizado ou de outro paciente não gera aviso", () => {
    const r = validarAbertura({
      ...ok,
      atendimentosAbertos: [
        { prontuario: "1001", status: "finalizado" },
        { prontuario: "2002", status: "em_atendimento" },
      ],
    });
    expect(r.avisos.map(a => a.chave)).not.toContain("atendimento_aberto");
  });

  it("AVISA quando o cadastro está marcado como óbito", () => {
    const r = validarAbertura({ ...ok, paciente: { ...COMPLETO, obito: true } });
    expect(r.ok).toBe(true);
    expect(r.avisos.map(a => a.chave)).toContain("obito");
  });

  it("AVISA que o cadastro está incompleto, sem travar o atendimento", () => {
    const r = validarAbertura({ ...ok, paciente: { prontuario: "9", iniciais: "?" } });
    expect(r.ok).toBe(true);
    const aviso = r.avisos.find(a => a.chave === "cadastro_incompleto");
    expect(aviso.texto).toMatch(/Nome completo/);
  });

  it("paciente não identificado avisa disso, e não de campo faltando", () => {
    const r = validarAbertura({
      ...ok,
      paciente: { prontuario: "1042", nao_identificado: true, identificado_em: null },
    });
    expect(r.ok).toBe(true);
    const chaves = r.avisos.map(a => a.chave);
    expect(chaves).toContain("nao_identificado");
    expect(chaves).not.toContain("cadastro_incompleto");
  });
});

// 🔴 A Recepção abria SÓ emergência — `ambulatorial` estava `disponivel:false`.
// Somado a ela não enxergar a agenda, o paciente de consulta caía na fila de
// triagem do PS. Agora a tela atende as duas portas, e o que ela EXIGE muda
// com o tipo: uma tela só, sem virar formulário de sessenta campos.
describe("a recepção atende as duas portas", () => {
  const pac = { prontuario: "T1", iniciais: "X" };

  it("ambulatorial passou a ser abrível pela recepção", () => {
    const t = TIPOS_ATENDIMENTO.find(x => x.chave === "ambulatorial");
    expect(t.disponivel).toBe(true);
    expect(TIPOS_DISPONIVEIS.map(x => x.chave)).toContain("ambulatorial");
  });

  it("internação eletiva CONTINUA fechada — o leito não recebe por aqui", () => {
    // `disponivel:false` não é enfeite: abrir um episódio que nenhuma tela
    // adiante pega deixa o paciente num limbo que ninguém procura.
    expect(TIPOS_ATENDIMENTO.find(x => x.chave === "eletivo").disponivel).toBe(false);
  });

  it("emergência exige COMO chegou; ambulatorial não pergunta isso", () => {
    // "Polícia Militar" numa consulta de oftalmologia é ruído que ensina a
    // escolher por eliminação.
    const semOrigem = validarAbertura({ paciente: pac, tipo: "emergencia", origem: "" });
    expect(semOrigem.erros.join(" ")).toMatch(/por onde o paciente chegou/i);

    const amb = validarAbertura({ paciente: pac, tipo: "ambulatorial", origem: "", especialidade: "ortopedia" });
    expect(amb.ok).toBe(true);
  });

  it("ambulatorial exige ESPECIALIDADE — é ela que diz para qual fila ele vai", () => {
    const r = validarAbertura({ paciente: pac, tipo: "ambulatorial", especialidade: "" });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/especialidade/i);
  });

  it("emergência NÃO passa a exigir especialidade", () => {
    // No PS a especialidade só se sabe depois da triagem; exigi-la aqui
    // seguraria paciente no balcão por um dado que ninguém tem ainda.
    const r = validarAbertura({ paciente: pac, tipo: "emergencia", origem: "Meios próprios", especialidade: "" });
    expect(r.ok).toBe(true);
  });
});
