// ═══════════════════════════════════════════════════════════
// O MENU EM TELA BAIXA — o acoplamento que some sem avisar
//
// 🔴 MEDIDO EM 07/10/2026, no demo: num viewport de 1366×768 o menu tinha
// 832px de conteúdo para 661px de altura, e QUATRO dos dezessete itens
// ficavam fora da primeira vista — Imprimir Dashboard, Auditoria, Importar
// Dados e Usuários e Perfis. Num notebook de 768 REAL (viewport ~640, depois
// da barra do navegador) era o mesmo quarteto.
//
// Pesa mais que um papercut: "Usuários e Perfis" é onde o hospital atribui
// cargo, e cargo decide acesso a dado clínico; "Auditoria" é exigência legal.
//
// O conserto são duas media queries de ALTURA no index.html, aplicadas por
// três classes no menu do App.jsx. Depois: 768 → 661px (cabe), 640 → 533px
// (cabe), e em monitor grande NADA muda (as duas queries ficam inativas, e o
// padding segue sendo o do estilo inline — conferido no estilo computado).
//
// ⚠️ ESTE É UM GUARDA DE ACOPLAMENTO, NÃO PROVA DE LAYOUT. jsdom não calcula
// altura: medir "cabe" aqui seria teatro, e a medida de verdade está no
// navegador, acima. O que este arquivo impede é o modo de falha silencioso:
// CSS e JSX precisam concordar em TRÊS STRINGS, e se uma sumir o menu volta
// a não caber sem nada ficar vermelho. É a mesma armadilha da taxonomia
// duplicada que já fez seis grupos sumirem da barra com 2.823 testes verdes.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(__dirname, "..");
const app = () => fs.readFileSync(path.join(RAIZ, "src", "App.jsx"), "utf8");
const html = () => fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");

const CLASSES = ["vx-nav", "vx-nav-item", "vx-nav-grupo"];

describe("menu em tela baixa — CSS e JSX falam a mesma língua", () => {
  it("as três classes existem no menu do App.jsx", () => {
    const s = app();
    for (const c of CLASSES) {
      expect(s, `classe ${c} sumiu do App.jsx`).toContain(`"${c}"`);
    }
  });

  it("todo item e todo cabeçalho de grupo do menu carrega a classe", () => {
    const s = app();
    // Cinco ganchos: o <nav>, o cabeçalho de grupo, o botão do grupo
    // expansível, os filhos dele e o item comum. Menos que isso significa
    // que um tipo de linha ficou de fora e continua espaçoso.
    const comClasse = (s.match(/className="vx-nav[^"]*"/g) || []).length;
    expect(comClasse).toBe(5);
  });

  it("as duas faixas de altura existem no index.html", () => {
    const h = html();
    expect(h).toMatch(/@media\s*\(max-height:\s*860px\)/);
    expect(h).toMatch(/@media\s*\(max-height:\s*700px\)/);
  });

  it("cada classe usada no CSS é uma que o menu realmente tem", () => {
    const h = html();
    const noCss = [...h.matchAll(/\.(vx-nav[\w-]*)/g)].map(m => m[1]);
    expect(noCss.length).toBeGreaterThan(0);
    for (const c of new Set(noCss)) {
      expect(CLASSES, `o CSS estiliza .${c}, que o App.jsx não usa`).toContain(c);
    }
  });

  it("cada classe do menu é alcançada por alguma regra de altura", () => {
    const h = html();
    // O caminho inverso do teste acima: classe no JSX sem regra no CSS é
    // gancho morto — parece protegido e não está.
    for (const c of CLASSES) {
      expect(h, `.${c} não aparece em nenhuma media query`).toContain(`.${c} `);
    }
  });

  it("🔒 a compactação é só por ALTURA — a ordem do menu não é tocada", () => {
    // A ordem é o caminho do trabalho (atende → trata → confere → fatura →
    // apoio) e o grupo APOIO E TI é último de propósito. Resolver o "não
    // cabe" subindo item quebraria o princípio em vez do sintoma.
    const h = html();
    const regras = h.slice(h.indexOf("@media (max-height: 860px)"));
    expect(regras).not.toMatch(/\border\s*:/);
    expect(regras).not.toMatch(/flex-direction/);
    expect(regras).not.toMatch(/display\s*:\s*none/);
  });
});
