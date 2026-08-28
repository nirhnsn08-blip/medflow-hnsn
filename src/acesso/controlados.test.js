// ═══════════════════════════════════════════════════════════
// QUEM PODE LER O LIVRO DE CONTROLADOS
//
// 🔴 O DEFEITO, COM NOME E DATA (28/08/2026)
// `modulos.js` declara o módulo `controlados` como "documento fiscalizável
// (Portaria 344/98) — acesso restrito por norma". A tela não cumpria: o
// `FARM_NAV` era renderizado sem consultar permissão nenhuma, e a vista do
// livro também. Quem tivesse o módulo `farmacia` via o livro, qualquer que
// fosse o nível declarado no perfil.
//
// Quatro perfis-modelo declaram `controlados: nenhum` e enxergavam o livro
// assim mesmo: Médico(a), Enfermeiro(a), Enfermeiro(a) — SCIH e
// Gestão / Diretoria. O hospital tinha configurado a restrição, e a
// restrição não existia.
//
// ⚠️ ISTO NÃO É SELO NO DADO, e o teste não finge que é.
// O livro é uma VISTA de `farm_movimentos` filtrada por medicamento
// controlado, e essa tabela é legitimamente da farmácia — é o kardex.
// O que se restringe é quem PRODUZ E LÊ o documento.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { PERFIS_MODELO, MODULO_POR_CHAVE } from "./modulos.js";
import { podeVer } from "./permissoes.js";

const perfis = Array.isArray(PERFIS_MODELO) ? PERFIS_MODELO : Object.values(PERFIS_MODELO);
const acha = nome => perfis.find(p => (p.nome || "").startsWith(nome));

describe("🔴 o módulo existe e se declara restrito", () => {
  it("a norma está no catálogo, não só na cabeça de alguém", () => {
    const m = MODULO_POR_CHAVE.controlados;
    expect(m).toBeDefined();
    expect(m.nota).toMatch(/344\/98/);
    expect(m.nota).toMatch(/restrito/i);
  });
});

describe("quem NÃO pode ver o livro", () => {
  // Estes quatro declaram `controlados: nenhum` e têm `farmacia`. Antes da
  // trava, os quatro viam o livro — a tela nunca perguntou.
  const semAcesso = ["Médico", "Enfermeiro(a)", "Enfermeiro(a) — SCIH", "Gestão"];

  for (const nome of semAcesso) {
    it(`${nome} tem farmácia e NÃO tem o livro`, () => {
      const p = acha(nome);
      expect(p, `perfil "${nome}" não existe mais — o teste precisa ser revisto`).toBeDefined();
      expect(p.grants.farmacia, "o caso só importa para quem TEM farmácia").toBeTruthy();
      expect(podeVer(p.grants, "controlados")).toBe(false);
    });
  }
});

describe("quem PODE ver o livro", () => {
  const comAcesso = ["Farmacêutico", "Auxiliar de Farmácia", "Diretor", "TI"];

  for (const nome of comAcesso) {
    it(`${nome} continua alcançando`, () => {
      const p = acha(nome);
      expect(p, `perfil "${nome}" não existe mais`).toBeDefined();
      expect(podeVer(p.grants, "controlados")).toBe(true);
    });
  }
});

describe("⚠️ o livro mora dentro da Farmácia", () => {
  it("todo perfil com `controlados` também tem `farmacia`", () => {
    // A tela do livro é uma aba do módulo Farmácia. Um perfil que recebesse
    // `controlados` sem `farmacia` teria a permissão e nenhuma porta — grant
    // que não abre nada é pior que grant nenhum, porque quem configurou
    // acredita ter concedido acesso.
    //
    // Hoje nenhum perfil-modelo está nessa situação. Se um dia estiver, ou
    // a Farmácia passa a aparecer para quem só tem o livro, ou o perfil
    // está errado — e este teste é onde a escolha aparece.
    for (const p of perfis) {
      if (!p.grants?.controlados) continue;
      expect(p.grants.farmacia, `"${p.nome}" tem controlados sem farmacia`).toBeTruthy();
    }
  });
});
