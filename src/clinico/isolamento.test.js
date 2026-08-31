// ═══════════════════════════════════════════════════════════
// PRECAUÇÕES DE ISOLAMENTO
//
// 🔴 O DEFEITO QUE ESTE ARQUIVO EXISTE PARA PEGAR É MUDO.
// A chave (`contato`, `goticulas`, `aereo`) não é rótulo de tela: é o
// valor gravado em três tabelas do banco. Se uma chave mudar aqui, o valor
// já gravado deixa de casar, `precaucaoDe` devolve `null`, e o leito
// isolado passa a aparecer SEM TARJA.
//
// Não há erro, não há log, não há teste de tela que caia: um leito sem
// tarja é indistinguível de um leito sem isolamento. Alguém entra no
// quarto sem o EPI certo.
//
// Por isso as chaves são conferidas contra o SEED que povoou o banco, e
// não contra outra cópia da mesma lista escrita à mão aqui.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ISOLAMENTOS, CHAVES_ISOLAMENTO, precaucaoDe, isolamentoValido } from "./isolamento.js";

const SEED = fs.readFileSync(
  path.join(process.cwd(), "supabase", "migracao-scih-germes-seed.sql"), "utf8");

describe("🔴 as chaves são contrato com o banco", () => {
  it("toda chave usada no seed dos germes existe aqui", () => {
    // O seed grava `scih_germes.isolamento`. Se ele usa uma chave que este
    // arquivo não conhece, o germe entra na base e nunca mostra precaução.
    const noSeed = [...SEED.matchAll(/'(contato|goticulas|aereo|[a-zç]+)'\s*(?:,|\))/g)]
      .map(m => m[1])
      .filter(v => /^(contato|goticulas|aereo)$/.test(v));
    expect(noSeed.length, "o seed não foi lido — o parser quebrou em silêncio").toBeGreaterThan(5);
    for (const chave of new Set(noSeed)) {
      expect(CHAVES_ISOLAMENTO, `o seed grava "${chave}"`).toContain(chave);
    }
  });

  it("⚠️ as três chaves são exatamente estas, sem acento e sem maiúscula", () => {
    // `Contato`, `gotículas`, `aéreo` seriam gravados sem reclamação e
    // nunca casariam. Já aconteceu nesta casa com o nome do germe.
    expect(CHAVES_ISOLAMENTO).toEqual(["contato", "goticulas", "aereo"]);
    for (const k of CHAVES_ISOLAMENTO) expect(k).toBe(k.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase());
  });

  it("a ordem é a de exibição, do mais comum ao mais raro", () => {
    // Contato é o dia a dia do hospital; aéreo é o raro e o mais caro de
    // montar (pressão negativa). Ordenar por alfabeto poria `aereo` em
    // primeiro, e a lista deixaria de refletir a rotina.
    expect(CHAVES_ISOLAMENTO.indexOf("contato")).toBeLessThan(CHAVES_ISOLAMENTO.indexOf("aereo"));
  });
});

describe("cada precaução está completa", () => {
  it.each(Object.entries(ISOLAMENTOS))("%s tem rótulo, cor, EPI e tipo de quarto", (_k, v) => {
    // Um campo faltando não quebra a tela — some do balão de orientação,
    // que é justamente o que a pessoa foi ler antes de entrar no quarto.
    for (const campo of ["label", "icon", "cor", "bg", "curto", "quando", "epi", "quarto"]) {
      expect(v[campo], `falta ${campo}`).toBeTruthy();
    }
  });

  it("🔴 o aéreo exige N95/PFF2 e pressão negativa", () => {
    // As duas coisas que distinguem o aéreo dos outros dois. Trocar por
    // máscara cirúrgica é o erro clássico com tuberculose e sarampo.
    expect(ISOLAMENTOS.aereo.epi).toMatch(/N95|PFF2/);
    expect(ISOLAMENTOS.aereo.quarto).toMatch(/press[ãa]o negativa/i);
  });

  it("gotículas e contato NÃO pedem pressão negativa", () => {
    // Pedir onde não precisa esgota o recurso mais escasso do hospital e
    // deixa sem quarto quem realmente precisa.
    expect(ISOLAMENTOS.goticulas.quarto).not.toMatch(/press[ãa]o negativa/i);
    expect(ISOLAMENTOS.contato.quarto).not.toMatch(/press[ãa]o negativa/i);
  });
});

describe("precaucaoDe", () => {
  it("devolve a precaução da chave conhecida", () => {
    expect(precaucaoDe("contato").label).toBe("Contato");
    expect(precaucaoDe("aereo").label).toBe("Aéreo (aerossóis)");
  });

  it("⚠️ chave desconhecida devolve null — e isso É o comportamento", () => {
    // Oito lugares no App.jsx escreviam esta guarda cada um por sua conta.
    // Aqui ela fica em um lugar só, com o aviso: silêncio na tela.
    for (const ruim of ["Contato", "gotículas", "aéreo", "", null, undefined, 0, {}, [], "outro"]) {
      expect(precaucaoDe(ruim), JSON.stringify(ruim)).toBeNull();
    }
  });

  it("não devolve nada herdado do Object", () => {
    // `ISOLAMENTOS["toString"]` devolveria uma função, e a tela tentaria
    // ler `.label` dela.
    for (const herdado of ["toString", "constructor", "hasOwnProperty", "__proto__"]) {
      expect(precaucaoDe(herdado), herdado).toBeNull();
    }
  });
});

describe("isolamentoValido", () => {
  it("aceita só as três", () => {
    expect(CHAVES_ISOLAMENTO.every(isolamentoValido)).toBe(true);
    expect(isolamentoValido("Contato")).toBe(false);
    expect(isolamentoValido("")).toBe(false);
    expect(isolamentoValido(null)).toBe(false);
  });
});
