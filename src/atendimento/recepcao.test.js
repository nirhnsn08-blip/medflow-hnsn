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
import {
  validarProntuario, normalizarProntuario, escaparTermoBusca, classificarBusca,
  filtroBuscaPacientes, dadosNaoIdentificado, aguardandoIdentificacao,
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

  it("busca por nome inclui o nome da mãe (é como se desempata homônimo)", () => {
    const f = filtroBuscaPacientes("Maria Silva");
    expect(f).toMatch(/nome_completo\.ilike/);
    expect(f).toMatch(/nome_social\.ilike/);
    expect(f).toMatch(/nome_mae\.ilike/);
  });

  it("documento vira igualdade exata, não busca parcial", () => {
    expect(filtroBuscaPacientes("529.982.247-25")).toBe("or=(cpf.eq.52998224725)");
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
