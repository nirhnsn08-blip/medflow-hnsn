// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// O BLOCO NÃO APLICA ESTADO DEPOIS DE SAIR DA TELA
//
// 🔴 O CI DO MERGE DO #277 FICOU VERMELHO COM 4.342 TESTES PASSANDO:
//
//     Tests  4342 passed | 1 skipped
//     Errors 1 error
//     ReferenceError: window is not defined
//      ❯ refresh src/bloco/BlocoPage.jsx:104
//     This error was caught after test environment was torn down.
//
// `refresh` espera DUAS rodadas de leitura — hoje nove tabelas — e só então
// aplica o estado. Se a tela sair no meio (ou o teste desmontar), o
// `setState` cai num componente que não existe mais: em produção é
// vazamento silencioso; no vitest o ambiente já foi derrubado e o React
// estoura ao procurar `window`.
//
// ⚠️ O DEFEITO ESTAVA AQUI DESDE SEMPRE — o que mudou foi o TEMPO. O PR do
// OPME acrescentou a sétima leitura ao `Promise.all`, e a resolução passou
// a cair depois do teardown numa máquina mais lenta que a minha. Não foi
// "CI instável": foi um guarda que faltava ficando visível.
//
// ⚠️⚠️ O QUE ESTE ARQUIVO PROVA, E O QUE NÃO PROVA — a distinção importa
// mais que os testes:
//
//   • O teste de COMPORTAMENTO abaixo é um smoke test honesto: desmonta no
//     meio e confirma que nada estoura. Ele NÃO distingue a versão com
//     guarda da versão sem, porque no React 18 `setState` em componente
//     desmontado é no-op silencioso — a explosão só acontece quando o
//     AMBIENTE é derrubado, que é coisa do runner, não do componente.
//
//   • Por isso o que de fato segura o conserto é o GUARDA DE TEXTO. Não é
//     prova de comportamento; é o que impede alguém de "limpar" o `vivo`
//     sem saber por que ele está lá. Mesmo recurso que
//     `migracoes-na-ordem.test.js` usa para o `for update` do gatilho, e
//     pela mesma razão: o detector de verdade é o CI, numa máquina lenta.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render, cleanup, waitFor } from "@testing-library/react";
import BlocoPage from "./BlocoPage.jsx";

afterEach(cleanup);

const FONTE = () => fs.readFileSync(path.join(__dirname, "BlocoPage.jsx"), "utf8");
const semComentario = s => s.split(/\r?\n/).map(l => l.replace(/\/\/.*$/, "")).join("\n");

describe("🔴 o guarda que faltava", () => {
  it("`refresh` confere se ainda está na tela ANTES de aplicar o estado", () => {
    const s = semComentario(FONTE());
    // A ordem é o que importa: a guarda tem de vir antes do primeiro
    // `set...`, senão ela não guarda nada.
    const guarda = s.indexOf("if (!vivo()) return;");
    const primeiroSet = s.indexOf("setLeituraFalhou(");
    expect(guarda, "sumiu a guarda `if (!vivo()) return;` de refresh").toBeGreaterThan(0);
    expect(guarda, "a guarda ficou DEPOIS do primeiro setState — não guarda nada")
      .toBeLessThan(primeiroSet);
  });

  it("🔴 OS DOIS efeitos desligam o sinal na limpeza", () => {
    // Achado por mutação: eu só exigia UM `vivo = false`, e apagar o do
    // efeito dos catálogos passava batido — aquele efeito ficaria com a
    // bandeira presa em `true` para sempre, que é o defeito de volta.
    const s = semComentario(FONTE());
    const liga = [...s.matchAll(/let vivo = true;/g)].length;
    const desliga = [...s.matchAll(/vivo = false;/g)].length;
    expect(liga, "nenhum efeito liga a bandeira").toBeGreaterThanOrEqual(2);
    expect(desliga, "algum efeito liga `vivo` e nunca desliga").toBe(liga);
  });

  it("o efeito dos catálogos também guarda as três leituras", () => {
    const s = semComentario(FONTE());
    for (const carga of ["setProcedimentos", "setProfissionais", "setItensEstoque"]) {
      expect(s, `${carga} aplica sem conferir se a tela ainda existe`)
        .toMatch(new RegExp(`if \\(vivo\\) ${carga}\\(`));
    }
  });

  it("nenhum `setState` do refresh ficou fora da guarda", () => {
    // Conta os setters aplicados no fim de `refresh`: se alguém acrescentar
    // uma leitura nova e aplicá-la antes da guarda, isto acusa.
    const s = semComentario(FONTE());
    const corpo = s.slice(s.indexOf("async function refresh("), s.indexOf("}\n", s.indexOf("setMateriais(")));
    const guarda = corpo.indexOf("if (!vivo()) return;");
    const setters = [...corpo.matchAll(/\bset[A-Z]\w*\(/g)].map(m => m.index);
    const foraDaGuarda = setters.filter(i => i < guarda);
    expect(foraDaGuarda, "há setState antes da guarda em refresh").toEqual([]);
    expect(setters.length, "não achei os setters de refresh — o recorte quebrou").toBeGreaterThan(5);
  });
});

describe("desmontar no meio da carga não estoura", () => {
  /**
   * ⚠️ SMOKE TEST HONESTO. Com ou sem a guarda isto passa no React 18 —
   * está aqui para garantir que o conserto não QUEBROU o caminho normal,
   * não para provar que ele funciona.
   */
  it("some da tela com as nove leituras em voo, e resolve depois", async () => {
    let resolver;
    const presas = new Promise(r => { resolver = r; });
    const sb = async url => {
      if (String(url).startsWith("cc_salas")) return [{ nome: "Sala 1", ordem: 1, ativa: true }];
      if (String(url).startsWith("cc_cirurgias")) { await presas; return []; }
      return [];
    };
    const { unmount } = render(<BlocoPage sb={sb} currentUser={{ name: "t" }} canEdit />);
    unmount();
    resolver([]);
    await waitFor(() => expect(true).toBe(true));
  });
});
