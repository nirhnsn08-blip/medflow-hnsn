// Testes das regras puras de sessão (renovação do crachá / detecção de falha
// de crachá). O bug que isto previne: o access_token vencia em 1h e nunca era
// renovado, transformando cada tela aberta por muito tempo numa metralhadora
// de "JWT expired". A parte de rede fica no App.jsx; aqui só a decisão.

import { describe, it, expect } from "vitest";
import { precisaRenovar, ehFalhaDeCracha, deveTentarRenovar } from "./sessao.js";

describe("precisaRenovar", () => {
  const agoraMs = 1_700_000_000_000; // instante fixo (ms)
  const agoraSeg = agoraMs / 1000;

  it("renova quando o crachá já venceu", () => {
    expect(precisaRenovar(agoraSeg - 10, agoraMs)).toBe(true);
  });
  it("renova de forma antecipada, dentro da margem (default 120s)", () => {
    expect(precisaRenovar(agoraSeg + 60, agoraMs)).toBe(true);
  });
  it("NÃO renova quando ainda falta bem mais que a margem", () => {
    expect(precisaRenovar(agoraSeg + 600, agoraMs)).toBe(false);
  });
  it("respeita a margem informada", () => {
    expect(precisaRenovar(agoraSeg + 300, agoraMs, 600)).toBe(true);  // margem larga → renova
    expect(precisaRenovar(agoraSeg + 300, agoraMs, 60)).toBe(false);  // margem curta → espera
  });
  it("sem validade conhecida, não dispara renovação proativa", () => {
    expect(precisaRenovar(null, agoraMs)).toBe(false);
    expect(precisaRenovar(undefined, agoraMs)).toBe(false);
    expect(precisaRenovar(0, agoraMs)).toBe(false);
  });
});

describe("ehFalhaDeCracha", () => {
  it("reconhece o JSON do PostgREST de crachá vencido", () => {
    expect(ehFalhaDeCracha('{"message":"JWT expired"}')).toBe(true);
    expect(ehFalhaDeCracha('{"code":"PGRST301","message":"..."}')).toBe(true);
    expect(ehFalhaDeCracha('{"message":"token is expired"}')).toBe(true);
  });
  it("também trata crachá inválido/corrompido como falha de crachá (renova)", () => {
    expect(ehFalhaDeCracha('{"message":"JWSError JWSInvalidSignature"}')).toBe(true);
    expect(ehFalhaDeCracha('{"message":"invalid JWT"}')).toBe(true);
  });
  it("trata 401 sem corpo como falha de crachá", () => {
    expect(ehFalhaDeCracha("")).toBe(true);
    expect(ehFalhaDeCracha("   ")).toBe(true);
    expect(ehFalhaDeCracha(null)).toBe(true);
    expect(ehFalhaDeCracha(undefined)).toBe(true);
  });
  it("NÃO confunde defeito real (permissão / coluna / constraint) com crachá", () => {
    expect(ehFalhaDeCracha('{"message":"permission denied for table leitos"}')).toBe(false);
    expect(ehFalhaDeCracha('{"message":"column x does not exist"}')).toBe(false);
    expect(ehFalhaDeCracha('{"message":"duplicate key value violates unique constraint"}')).toBe(false);
  });
});

describe("deveTentarRenovar", () => {
  const expirado = '{"message":"JWT expired"}';

  it("sim: 401 + crachá de usuário + primeira tentativa + falha de crachá", () => {
    expect(deveTentarRenovar(401, true, false, expirado)).toBe(true);
  });
  it("não: status diferente de 401 (403/500 não é crachá vencido)", () => {
    expect(deveTentarRenovar(403, true, false, expirado)).toBe(false);
    expect(deveTentarRenovar(500, true, false, expirado)).toBe(false);
  });
  it("não: chamada anônima, sem crachá de usuário", () => {
    expect(deveTentarRenovar(401, false, false, expirado)).toBe(false);
  });
  it("não: já tentou renovar nesta chamada (trava contra laço)", () => {
    expect(deveTentarRenovar(401, true, true, expirado)).toBe(false);
  });
  it("não: 401 de permissão, não de crachá", () => {
    expect(deveTentarRenovar(401, true, false, '{"message":"permission denied"}')).toBe(false);
  });
});
