// ═══════════════════════════════════════════════════════════
// CEP
//
// O campo não fazia nada: nem validava, nem preenchia. A recepção digitava
// logradouro, bairro, município e UF à mão — quatro campos que o CEP
// responde, cada um uma chance de erro que depois vira indicador
// territorial errado.
//
// 🔴 A REGRA QUE MAIS IMPORTA: NÃO SOBRESCREVE O QUE A PESSOA DIGITOU.
// Quem já escreveu o logradouro e preenche o CEP depois não pode ver o que
// escreveu sumir.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  cepLimpo, formatarCep, cepCompleto, camposDoCep, mensagemDoCep, DIGITOS_DO_CEP,
} from "./cep.js";

const RESPOSTA = {
  cep: "88370-000", logradouro: "Rua Sete de Setembro",
  bairro: "Centro", localidade: "Navegantes", uf: "SC",
};

describe("o formato do CEP", () => {
  it("são 8 dígitos — nem 7, nem 9", () => {
    expect(DIGITOS_DO_CEP).toBe(8);
    expect(cepCompleto("88370000")).toBe(true);
    expect(cepCompleto("88370-000")).toBe(true);
    expect(cepCompleto("8837000")).toBe(false);
    expect(cepCompleto("")).toBe(false);
    expect(cepCompleto(null)).toBe(false);
  });

  it("limpa e corta o excesso", () => {
    expect(cepLimpo("88370-000")).toBe("88370000");
    expect(cepLimpo("88370000999")).toBe("88370000");
  });

  it("formata para leitura, e não estraga o que não é CEP", () => {
    expect(formatarCep("88370000")).toBe("88370-000");
    expect(formatarCep("883")).toBe("883");
    expect(formatarCep("")).toBe("");
  });
});

describe("camposDoCep", () => {
  it("preenche os quatro campos quando o endereço está em branco", () => {
    expect(camposDoCep(RESPOSTA, {})).toEqual({
      end_logradouro: "Rua Sete de Setembro",
      end_bairro: "Centro",
      end_municipio: "Navegantes",
      end_uf: "SC",
    });
  });

  it("🔴 NÃO sobrescreve o que a pessoa já digitou", () => {
    // Quem escreveu o logradouro e preencheu o CEP depois não pode ver o
    // que escreveu sumir.
    const atual = { end_logradouro: "Rua do Comércio, conforme a pessoa", end_municipio: "Navegantes" };
    const r = camposDoCep(RESPOSTA, atual);
    expect(r.end_logradouro).toBeUndefined();
    expect(r.end_municipio).toBeUndefined();
    // e completa só o que faltava
    expect(r.end_bairro).toBe("Centro");
    expect(r.end_uf).toBe("SC");
  });

  it("campo com espaço em branco conta como vazio", () => {
    expect(camposDoCep(RESPOSTA, { end_bairro: "   " }).end_bairro).toBe("Centro");
  });

  it("🔴 CEP que não existe não preenche nada", () => {
    expect(camposDoCep({ erro: true }, {})).toEqual({});
    expect(camposDoCep({ erro: "true" }, {})).toEqual({});
    expect(camposDoCep(null, {})).toEqual({});
  });

  it("CEP de cidade pequena vem SEM logradouro — e isso não é falha", () => {
    // O CEP único do município responde só município e UF. Preencher o que
    // veio e deixar o resto é o certo; inventar logradouro seria o erro.
    const soMunicipio = { logradouro: "", bairro: "", localidade: "Balneário Arroio do Silva", uf: "SC" };
    expect(camposDoCep(soMunicipio, {})).toEqual({
      end_municipio: "Balneário Arroio do Silva",
      end_uf: "SC",
    });
  });

  it("não explode com nada", () => {
    expect(() => camposDoCep()).not.toThrow();
    expect(() => camposDoCep(RESPOSTA, null)).not.toThrow();
  });
});

describe("mensagemDoCep — o que se diz a quem está no balcão", () => {
  it("🔴 encontrado sem preencher NÃO é 'não achei'", () => {
    // São coisas diferentes: um CEP de cidade pequena é encontrado e não
    // preenche logradouro nenhum. Dizer "não achei" mandaria a
    // recepcionista conferir um CEP que está certo.
    const m = mensagemDoCep({ estado: "achou", preenchidos: 0 });
    expect(m).toMatch(/encontrado/i);
    expect(m).not.toMatch(/não existe|não consegui/i);
  });

  it("CEP inexistente diz que é o número, não a internet", () => {
    expect(mensagemDoCep({ estado: "invalido" })).toMatch(/não existe/i);
  });

  it("🔴 falha de rede DIZ que nada foi perdido", () => {
    // O medo de quem está no balcão é ter perdido o que digitou.
    const m = mensagemDoCep({ estado: "falhou" });
    expect(m).toMatch(/à mão/i);
    expect(m).toMatch(/nada do que você digitou foi perdido/i);
  });

  it("CEP pela metade não diz nada — aviso a cada tecla é ruído", () => {
    expect(mensagemDoCep({ estado: "incompleto" })).toBe("");
    expect(mensagemDoCep()).toBe("");
  });

  it("quando preencheu, diz QUANTOS — e manda conferir o número", () => {
    const m = mensagemDoCep({ estado: "achou", preenchidos: 3 });
    expect(m).toMatch(/3 campo/);
    expect(m).toMatch(/complete o número/i);
  });
});
