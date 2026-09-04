// ═══════════════════════════════════════════════════════════
// PARÂMETROS DO MÓDULO DE SUPRIMENTOS
//
// 🔴 ESTE ARQUIVO NÃO EXISTIA. A alçada de aprovação — que decide se uma
// compra precisa de segunda assinatura — vivia sem teste nenhum desde
// agosto. Apareceu em 04/09/2026, ao generalizar o módulo para caber o alvo
// de cobertura: reescrevi as duas funções e não havia nada que dissesse se
// eu tinha quebrado.
//
// As duas regras que mais importam aqui:
//
//   1. GRAVAÇÃO CONFERE O RETORNO, não o status. Sem política de escrita o
//      PostgREST responde 2xx alterando ZERO linha, e o parâmetro pareceria
//      salvo. Já aconteceu neste projeto, na trilha de auditoria.
//   2. LEITURA FALHADA CALA, não trava. `null` de rede caída e `null` de
//      "não configurado" chegam iguais a quem chama, de propósito: travar
//      compra porque a consulta não voltou é transformar problema de rede
//      em parada de abastecimento.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  CHAVE_ALCADA, CHAVE_COBERTURA, COBERTURA_PADRAO_DIAS,
  carregarAlcada, salvarAlcada, carregarCobertura, salvarCobertura,
} from "./parametros.js";

/** `sb` falso: devolve o que a rota pedir, e anota o que foi chamado. */
function banco({ valor, escrita = "ok" } = {}) {
  const chamadas = [];
  const sb = async (rota, opcoes) => {
    chamadas.push({ rota, metodo: opcoes?.method || "GET", corpo: opcoes?.body });
    if (opcoes?.method === "POST") {
      if (escrita === "recusada") return [];          // RLS: 2xx com zero linha
      if (escrita === "erro") throw new Error("rede");
      return [JSON.parse(opcoes.body)];
    }
    if (opcoes?.method === "DELETE") return escrita === "recusada" ? null : [];
    if (valor === "falha") throw new Error("rede caiu");
    return valor == null ? [] : [{ valor }];
  };
  sb.chamadas = chamadas;
  return sb;
}

describe("🔴 alçada — o que já existia e não tinha teste", () => {
  it("lê o valor configurado", async () => {
    expect(await carregarAlcada(banco({ valor: 5000 }))).toBe(5000);
  });

  it("não configurada devolve null", async () => {
    expect(await carregarAlcada(banco({ valor: null }))).toBe(null);
  });

  it("🔴 leitura FALHADA também devolve null — a alçada cala, não trava", async () => {
    // Travar compra porque a consulta do parâmetro não voltou seria
    // transformar um problema de rede em parada de abastecimento.
    expect(await carregarAlcada(banco({ valor: "falha" }))).toBe(null);
  });

  it("valor inválido no banco não vira alçada", async () => {
    for (const v of [0, -100, "abc", null]) {
      expect(await carregarAlcada(banco({ valor: v })), String(v)).toBe(null);
    }
  });

  it("sem banco não estoura", async () => {
    expect(await carregarAlcada(null)).toBe(null);
    expect(await carregarAlcada(undefined)).toBe(null);
  });

  it("🔴 gravação recusada pela RLS é RECUSA, não sucesso", async () => {
    // O PostgREST responde 2xx alterando zero linha. Acreditar no status
    // faria a tela dizer "salvo" com nada gravado.
    const r = await salvarAlcada(banco({ escrita: "recusada" }), 5000, { name: "T" });
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/permissão/i);
  });

  it("gravação boa devolve ok", async () => {
    const sb = banco();
    const r = await salvarAlcada(sb, 5000, { name: "T" });
    expect(r.ok).toBe(true);
    expect(JSON.parse(sb.chamadas.at(-1).corpo).chave).toBe(CHAVE_ALCADA);
  });
});

describe("🔴 cobertura — o número que decide o 'capital liberável'", () => {
  it("configurada, devolve o valor do hospital", async () => {
    expect(await carregarCobertura(banco({ valor: 15 }))).toEqual({ dias: 15, padrao: false });
  });

  it("🔴 sem configuração devolve o PADRÃO, e DIZ que é padrão", async () => {
    // Diferente da alçada, este número é indispensável para a conta existir.
    // Mas a tela precisa poder avisar que aquele 30 é sugestão nossa, e não
    // decisão do hospital — senão a diretoria lê um alvo que ninguém pactuou.
    const r = await carregarCobertura(banco({ valor: null }));
    expect(r).toEqual({ dias: COBERTURA_PADRAO_DIAS, padrao: true });
    expect(r.padrao).toBe(true);
  });

  it("⚠️ leitura falhada também cai no padrão, marcada como padrão", async () => {
    const r = await carregarCobertura(banco({ valor: "falha" }));
    expect(r.dias).toBe(COBERTURA_PADRAO_DIAS);
    expect(r.padrao).toBe(true);
  });

  it("🔴 ZERO é recusado — faria o capital liberável virar o estoque inteiro", async () => {
    // A diretoria leria que dá para gastar tudo.
    const r = await salvarCobertura(banco(), 0, { name: "T" });
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/entre 1 e 365/);
  });

  it("acima de um ano é recusado — o indicador deixa de significar algo", async () => {
    expect((await salvarCobertura(banco(), 400, { name: "T" })).ok).toBe(false);
  });

  it("as bordas 1 e 365 passam", async () => {
    expect((await salvarCobertura(banco(), 1, { name: "T" })).ok).toBe(true);
    expect((await salvarCobertura(banco(), 365, { name: "T" })).ok).toBe(true);
  });

  it("texto e vazio são recusados, não viram zero", async () => {
    for (const v of ["", null, undefined, "muitos"]) {
      expect((await salvarCobertura(banco(), v, { name: "T" })).ok, String(v)).toBe(false);
    }
  });

  it("grava arredondado e na chave certa", async () => {
    const sb = banco();
    await salvarCobertura(sb, 14.6, { name: "T" });
    const corpo = JSON.parse(sb.chamadas.at(-1).corpo);
    expect(corpo).toMatchObject({ chave: CHAVE_COBERTURA, valor: 15 });
  });

  it("🔴 gravação recusada pela RLS é RECUSA", async () => {
    const r = await salvarCobertura(banco({ escrita: "recusada" }), 15, { name: "T" });
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/permissão/i);
  });
});

describe("as duas chaves não colidem", () => {
  it("são nomes diferentes", () => {
    expect(CHAVE_ALCADA).not.toBe(CHAVE_COBERTURA);
  });
});
