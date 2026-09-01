// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// O AVISO SONORO
//
// 🔴 O SOM É OPT-IN, e é isso que este arquivo guarda.
// Um posto que apita sozinho vira um posto com o som desligado no primeiro
// dia — e aí o aviso que importava também não toca. Se o padrão inverter,
// nenhuma tela reclama: ela simplesmente começa a apitar.
//
// E nada aqui pode estourar: o aviso toca DEPOIS de um evento que já
// aconteceu (chegou requisição, saiu prescrição). Se o áudio falhar, o
// trabalho segue.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { somLigado, ligarSom, avisoSonoro } from "./som.js";

beforeEach(() => localStorage.clear());

describe("🔴 o padrão é o silêncio", () => {
  it("navegador novo não apita", () => {
    expect(somLigado()).toBe(false);
  });

  it("liga, desliga, e a escolha fica guardada", () => {
    ligarSom(true);
    expect(somLigado()).toBe(true);
    ligarSom(false);
    expect(somLigado()).toBe(false);
  });

  it("⚠️ qualquer valor guardado que não seja o combinado é silêncio", () => {
    // Falha FECHADA, ao contrário do menu (que falha aberto porque esconder
    // módulo trava alguém no plantão). Aqui o erro barulhento é pior.
    for (const lixo of ["sim", "true", "0", "", "{}", "2"]) {
      localStorage.setItem("hnsn_som", lixo);
      expect(somLigado(), lixo).toBe(false);
    }
  });

  it("localStorage bloqueado devolve silêncio, não exceção", () => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new DOMException("SecurityError"); };
    try { expect(somLigado()).toBe(false); } finally { Storage.prototype.getItem = orig; }
  });
});

describe("nada aqui derruba quem chamou", () => {
  afterEach(() => { delete window.AudioContext; delete window.webkitAudioContext; });

  it("navegador sem AudioContext não estoura", () => {
    delete window.AudioContext; delete window.webkitAudioContext;
    expect(() => avisoSonoro()).not.toThrow();
    expect(() => avisoSonoro(true)).not.toThrow();
  });

  it("AudioContext que lança na criação não estoura", () => {
    window.AudioContext = function () { throw new Error("sem permissão de áudio"); };
    expect(() => avisoSonoro()).not.toThrow();
  });

  it("⚠️ ligarSom com o armário bloqueado não estoura", () => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException("QuotaExceededError"); };
    try { expect(() => ligarSom(true)).not.toThrow(); } finally { Storage.prototype.setItem = orig; }
  });

  it("toca dois tons quando `duplo`, e um quando não", () => {
    const tocados = [];
    const osc = () => ({ connect() {}, type: "", frequency: { value: 0 }, start(t) { tocados.push(t); }, stop() {} });
    window.AudioContext = function () {
      return { currentTime: 0, createOscillator: osc,
        createGain: () => ({ connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }),
        destination: {}, close() {} };
    };
    avisoSonoro(false); expect(tocados).toHaveLength(1);
    tocados.length = 0;
    avisoSonoro(true); expect(tocados).toHaveLength(2);
  });
});
