// ═══════════════════════════════════════════════════════════
// A CATRACA TINHA DOIS FUROS DE FORMA
//
// `src/cargas.test.js` existe para impedir a família de defeito mais comum
// deste sistema: ausência de dado renderizada como boa notícia. Ela caçava
// uma escrita só — `Array.isArray(x) ? x : []` com `x` vindo de `await`.
//
// 🔴 FURO 1 — A ORIGEM ESCONDIDA PELO `.then`.
//   `sb(...).then(r => Array.isArray(r) ? r : [])` colapsa igual, mas `r` é
//   parâmetro de arrow, então o censo classificava como PARAM ("guarda
//   legítima") e o teste, que só reprova `origem === "rede"`, passava verde.
//   Medido: com os defeitos presentes, 14/14 verdes.
//
// 🔴 FURO 2 — O COLAPSO EM ZERO.
//   `Array.isArray(r) ? r.length : 0` não devolve lista, devolve CONTAGEM, e
//   por isso nem casava com o regex. É a mesma mentira: a leitura falhou e a
//   tela recebe um número que parece medido.
//
// Atrás dos dois furos havia SETE cargas vivas. As três piores:
//   • `contarRegistrosClinicos` — é o número que decide SE DÁ PARA CANCELAR
//     um atendimento. Falha virava "0 registros", e o sistema liberava
//     cancelar um episódio com prescrição e administração penduradas.
//   • os óbitos pós-internação do PS — falha virava 0, e o cartão saía VERDE
//     escrito "nenhum hoje".
//   • a LPP adquirida na unidade — indicador de segurança do paciente, no
//     cartão, nas metas e no relatório do NSP. Falha virava 0, em verde.
//
// Este arquivo fixa o comportamento. O censo em si é testado por
// `src/cargas.test.js`; aqui mora a prova de que ele ENXERGA as duas formas.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { censo } from "../../scripts/cargas.mjs";
import { contagemLida, listaLida, naoDeuParaLer, FALHA } from "./leitura.js";
import { validarCancelamento } from "../atendimento/ciclo.js";
import { contarRegistrosClinicos } from "../atendimento/dados.js";
import { loadLppAdquiridas } from "../clinico/nsp-dados.js";

// ── o censo enxerga as duas formas ──────────────────────────
//
// Testar um detector pelo que ele ACHA num código já limpo não prova nada:
// zero achados é o estado correto e também o estado de um detector quebrado.
// Então a prova é feita sobre um arquivo escrito aqui, com o defeito dentro.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function censoDe(codigo) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "censo-"));
  fs.writeFileSync(path.join(dir, "alvo.js"), codigo, "utf8");
  try { return censo(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

describe("o censo vê a origem escondida pelo .then", () => {
  it("🔴 `sb(...).then(r => ... : [])` é REDE, não param", () => {
    const r = censoDe([
      "function f(sb, setRows) {",
      '  sb("x?select=*").then(r => setRows(Array.isArray(r) ? r : []));',
      "}",
    ].join("\n"));
    expect(r).toHaveLength(1);
    expect(r[0].origem).toBe("rede");
  });

  it("vale também para carregador, não só para `sb` cru", () => {
    // `loadX(sb)` já devolve a marca; colapsar o resultado a destrói.
    const r = censoDe([
      "function f(sb, set) {",
      "  loadCcSalas(sb).then(r => set(Array.isArray(r) ? r : []));",
      "}",
    ].join("\n"));
    expect(r[0]?.origem).toBe("rede");
  });

  it("guarda de parâmetro de verdade continua PARAM — a catraca não vira ruído", () => {
    const r = censoDe([
      "export function normalizar(lista) {",
      "  const xs = Array.isArray(lista) ? lista : [];",
      "  return xs;",
      "}",
    ].join("\n"));
    expect(r[0]?.origem).toBe("param");
  });
});

describe("o censo vê o colapso em ZERO", () => {
  it("🔴 `Array.isArray(r) ? r.length : 0` vindo de await é acusado", () => {
    const r = censoDe([
      "async function f(sb) {",
      '  const rows = await sb("x?select=id");',
      "  return Array.isArray(rows) ? rows.length : 0;",
      "}",
    ].join("\n"));
    expect(r).toHaveLength(1);
    expect(r[0].forma).toBe("0");
    expect(r[0].origem).toBe("rede");
  });

  it("o mesmo dentro de um `.reduce` sobre resultado de Promise.all", () => {
    const r = censoDe([
      "async function f(sb, alvos) {",
      "  const rs = await Promise.all(alvos.map(a => sb(a)));",
      "  return rs.reduce((s, r) => s + (Array.isArray(r) ? r.length : 0), 0);",
      "}",
    ].join("\n"));
    expect(r.some(x => x.forma === "0" && x.origem === "rede")).toBe(true);
  });

  it("em código puro, contar parâmetro continua legítimo e NÃO é acusado", () => {
    const r = censoDe([
      "export function quantos(lista) {",
      "  return Array.isArray(lista) ? lista.length : 0;",
      "}",
    ].join("\n"));
    expect(r).toHaveLength(0);
  });
});

// ── contagemLida ────────────────────────────────────────────
describe("contagemLida — zero é afirmação, null é ausência dela", () => {
  it("conta o que leu", () => {
    expect(contagemLida([1, 2, 3])).toBe(3);
    expect(contagemLida([])).toBe(0);
  });
  it("🔴 o que não deu para ler vira null, nunca zero", () => {
    expect(contagemLida(null)).toBeNull();
    expect(contagemLida(undefined)).toBeNull();
    expect(contagemLida({ erro: "timeout" })).toBeNull();
  });
  it("não devolve lista — quem chama espera número", () => {
    expect(Array.isArray(contagemLida(null))).toBe(false);
  });
  it("`FALHA` é lista vazia lida: conta zero, e é o listaLida que marca", () => {
    // A marca de falha mora na identidade do array; contar não a preserva, e
    // é por isso que contagem usa null em vez de vazio-marcado.
    expect(contagemLida(FALHA)).toBe(0);
    expect(naoDeuParaLer(listaLida(null))).toBe(true);
  });
});

// ── a decisão que o número libera ───────────────────────────
describe("🔴 cancelar atendimento: 'não sei' recusa", () => {
  const at = { id: 10, status: "aberto" };
  const motivo = "paciente desistiu e foi embora";

  it("sem registro clínico, cancela", () => {
    expect(validarCancelamento({ atendimento: at, motivo, registrosClinicos: 0 }).ok).toBe(true);
  });

  it("com registro clínico, recusa", () => {
    const v = validarCancelamento({ atendimento: at, motivo, registrosClinicos: 2 });
    expect(v.ok).toBe(false);
    expect(v.erros.join(" ")).toMatch(/2 registro/);
  });

  it("🔴 quando NÃO SE SABE, recusa — `Number(null)` é 0 e liberava", () => {
    const v = validarCancelamento({ atendimento: at, motivo, registrosClinicos: null });
    expect(v.ok).toBe(false);
    expect(v.erros.join(" ")).toMatch(/não consegui conferir/i);
  });
});

describe("contarRegistrosClinicos — uma leitura que falha já basta", () => {
  const sbOk = async () => [{ id: 1 }, { id: 2 }];

  it("soma as três fontes quando leu todas", async () => {
    expect(await contarRegistrosClinicos(sbOk, 7)).toBe(6);
  });

  it("🔴 se UMA das três falha, devolve null — somar as outras daria número MENOR que o real, e menor aqui é permissão indevida", async () => {
    let n = 0;
    const sb = async () => (++n === 2 ? null : [{ id: 1 }]);
    expect(await contarRegistrosClinicos(sb, 7)).toBeNull();
  });

  it("sem atendimento devolve 0 — aí não há o que contar mesmo", async () => {
    expect(await contarRegistrosClinicos(sbOk, null)).toBe(0);
  });
});

describe("LPP adquirida — indicador de segurança não afirma sem ter lido", () => {
  it("🔴 leitura que falhou vira null, não zero em verde", async () => {
    expect(await loadLppAdquiridas(async () => null)).toBeNull();
  });
  it("sem banco também é null — offline não mediu nada", async () => {
    expect(await loadLppAdquiridas(null)).toBeNull();
  });
  it("leu e não havia nenhuma: aí sim, zero", async () => {
    expect(await loadLppAdquiridas(async () => [])).toBe(0);
  });
});
