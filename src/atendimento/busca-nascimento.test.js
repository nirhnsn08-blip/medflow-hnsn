// ═══════════════════════════════════════════════════════════
// BUSCA PELA DATA DE NASCIMENTO
//
// 🔴 DEFEITO REAL (revisão de 05/10/2026): "12/03/1950" era classificado
// como NOME e exigia "12", "03" e "1950" dentro do nome — a tela dizia
// "Nenhum paciente encontrado" com "+ Cadastrar paciente novo" logo abaixo.
// E "12.03.1950" caía em prontuário. Data de nascimento é o desempate que o
// balcão mais usa quando o nome é comum.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  acharNascimento, classificarBusca, filtroBuscaPacientes, filtroBuscaPacientesLegado,
  motivoSemBusca, buscaPodeEscolherSozinha,
} from "./recepcao.js";

// Relógio fixo: o pivô do ano de 2 dígitos e "no futuro" dependem de hoje.
const HOJE = new Date(2026, 9, 5);   // 05/10/2026
const em = { hoje: HOJE };

describe("acharNascimento", () => {
  it("dd/mm/aaaa, com / . ou -", () => {
    expect(acharNascimento("12/03/1950", HOJE)).toMatchObject({ valido: true, iso: "1950-03-12", ano: 1950 });
    expect(acharNascimento("12.03.1950", HOJE)).toMatchObject({ valido: true, iso: "1950-03-12" });
    expect(acharNascimento("12-03-1950", HOJE)).toMatchObject({ valido: true, iso: "1950-03-12" });
    expect(acharNascimento("2/3/1950", HOJE)).toMatchObject({ valido: true, iso: "1950-03-02" });
  });

  it("ano com 2 dígitos vira o século que não cai no futuro ('nasceu em 50')", () => {
    expect(acharNascimento("12/03/50", HOJE).iso).toBe("1950-03-12");
    expect(acharNascimento("12/03/20", HOJE).iso).toBe("2020-03-12");
    expect(acharNascimento("12/03/26", HOJE).iso).toBe("2026-03-12");
    expect(acharNascimento("12/03/27", HOJE).iso).toBe("1927-03-12");
  });

  it("dentro do nome também", () => {
    expect(acharNascimento("maria da silva 12/03/1950", HOJE)).toMatchObject({ valido: true, trecho: "12/03/1950" });
  });

  it("🔴 data que não existe ou no futuro é RECUSADA com o motivo — não vira busca", () => {
    expect(acharNascimento("31/02/1950", HOJE)).toMatchObject({ valido: false });
    expect(acharNascimento("31/02/1950", HOJE).motivo).toMatch(/não existe no calendário/);
    expect(acharNascimento("12/13/1950", HOJE).valido).toBe(false);
    expect(acharNascimento("29/02/2023", HOJE).valido).toBe(false);   // 2023 não é bissexto
    expect(acharNascimento("29/02/2024", HOJE).valido).toBe(true);
    expect(acharNascimento("06/10/2026", HOJE).motivo).toMatch(/no futuro/);
    expect(acharNascimento("05/10/2026", HOJE).valido).toBe(true);    // nasceu hoje
  });

  it("não confunde documento, telefone nem prontuário com data", () => {
    for (const t of ["123.456.789-09", "(51) 99347-6688", "T9035", "898 0012 3456 7890", "10/2020", "1.234.567"]) {
      expect(acharNascimento(t, HOJE), t).toBeNull();
    }
  });
});

describe("classificarBusca com data", () => {
  it("data sozinha → nascimento", () => {
    expect(classificarBusca("12/03/1950", em)).toMatchObject({ tipo: "nascimento", valor: "1950-03-12" });
  });
  it("nome + data → nome_nascimento, com o nome sem a data", () => {
    expect(classificarBusca("Maria 12/03/1950", em)).toMatchObject({ tipo: "nome_nascimento", valor: "Maria", nascimento: "1950-03-12" });
  });
  it("🔴 '12.03.1950' não cai mais em prontuário", () => {
    expect(classificarBusca("12.03.1950", em).tipo).toBe("nascimento");
  });
  it("o que já funcionava continua igual", () => {
    expect(classificarBusca("123.456.789-09", em).tipo).toBe("cpf");
    expect(classificarBusca("T9035", em).tipo).toBe("prontuario");
    expect(classificarBusca("maria da silva", em).tipo).toBe("nome");
  });
});

describe("o filtro que vai ao banco", () => {
  it("data sozinha: data completa OU (só o ano, no cadastro antigo)", () => {
    expect(filtroBuscaPacientes("12/03/1950", em))
      .toBe("or=(data_nascimento.eq.1950-03-12,and(data_nascimento.is.null,ano_nascimento.eq.1950))");
  });
  it("com . ou - continua procurando também como prontuário/RG (era o caminho de antes)", () => {
    const f = filtroBuscaPacientes("12.03.1950", em);
    expect(f).toContain("data_nascimento.eq.1950-03-12");
    expect(f).toContain("prontuario.ilike.12.03.1950");
    expect(f).toContain("rg.ilike.12.03.1950");
  });
  it("nome + data: TODAS as palavras do nome E a data", () => {
    expect(filtroBuscaPacientes("maria silva 12/03/1950", em)).toBe(
      "and=(nome_busca.ilike.*MARIA*,nome_busca.ilike.*SILVA*," +
      "or(data_nascimento.eq.1950-03-12,and(data_nascimento.is.null,ano_nascimento.eq.1950)))");
  });
  it("nome curto demais junto da data não impede: a data já estreita", () => {
    expect(filtroBuscaPacientes("Jo 12/03/1950", em)).toContain("data_nascimento.eq.1950-03-12");
  });
  it("data inválida não vira consulta", () => {
    expect(filtroBuscaPacientes("31/02/1950", em)).toBeNull();
    expect(filtroBuscaPacientes("Maria 31/02/1950", em)).toBeNull();
  });
  it("legado (antes da coluna nome_busca): nome nas colunas antigas E a data", () => {
    const f = filtroBuscaPacientesLegado("Maria 12/03/1950", em);
    expect(f).toMatch(/^and=\(or\(nome_completo\.ilike\.\*Maria\*/);
    expect(f).toContain("or(data_nascimento.eq.1950-03-12");
  });
});

describe("o que a tela diz quando não busca", () => {
  it("explica a data errada em vez de responder 'nenhum paciente encontrado'", () => {
    expect(motivoSemBusca("31/02/1950", em)).toMatch(/não existe no calendário/);
    expect(motivoSemBusca("01/01/2030", em)).toMatch(/no futuro/);
  });
  it("vazio e curto continuam com as mensagens de antes", () => {
    expect(motivoSemBusca("", em)).toMatch(/data de nascimento/);
    expect(motivoSemBusca("Jo", em)).toMatch(/3 letras/);
    expect(motivoSemBusca("12/03/1950", em)).toBeNull();
  });
});

describe("🔴 quando a tela pode escolher sozinha o único resultado", () => {
  it("documento válido e prontuário identificam: pode", () => {
    expect(buscaPodeEscolherSozinha("T9035", em)).toBe(true);
    expect(buscaPodeEscolherSozinha("529.982.247-25", em)).toBe(true);   // CPF válido
  });
  it("data de nascimento, telefone e CPF inválido (provável celular) NÃO", () => {
    // O único nascido em 12/03/1950 no acervo pode não ser quem está no balcão.
    expect(buscaPodeEscolherSozinha("12/03/1950", em)).toBe(false);
    expect(buscaPodeEscolherSozinha("5133334444", em)).toBe(false);       // fixo com DDD
    expect(buscaPodeEscolherSozinha("51993476688", em)).toBe(false);      // 11 dígitos sem DV de CPF
  });
});
