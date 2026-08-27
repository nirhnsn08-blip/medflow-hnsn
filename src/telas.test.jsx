// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// TODA TELA TEM QUE ABRIR
//
// 🔴 POR QUE ISTO EXISTE, COM NOME E DATA
// Este repositório tinha 61 arquivos de teste e ZERO renderizavam JSX.
// A consequência apareceu duas vezes em 27/08/2026:
//
//   · PR #151 — `valoresIniciais` usado no App.jsx e fora do import. O
//     `vite build` passou, as 1.881 asserções passaram, e o modal de
//     desfecho do Pronto-Socorro quebrava ao abrir.
//   · PR #147 — `loteEfetivo` no `FarmDispensarModal`, mesma coisa. Foi
//     para a `main` E para o banco do hospital. Clicar "Dispensar" num
//     item com estoque derrubava o módulo inteiro da Farmácia.
//
// Os dois eram invisíveis para tudo que o repositório tinha: o Rollup não
// resolve identificador livre (assume global) e nenhum teste montava um
// componente. O sistema inteiro dizia "verde" com a porta fechada.
//
// O `no-undef` do `eslint.config.mjs` pega essa classe no arquivo. Este
// arquivo pega o resto: componente que EXPLODE ao montar com dado vazio —
// que é como toda tela começa, antes de a primeira consulta voltar.
//
// ⚠️ A LISTA É DESCOBERTA, NÃO ESCRITA.
// `import.meta.glob` varre `src/**/*.jsx`. Tela nova entra sozinha, sem
// ninguém lembrar — que é a única forma de a cobertura não envelhecer.
// Por isso o primeiro teste confere QUANTOS foram descobertos: um glob que
// silenciosamente casa zero arquivo passaria "verde" para sempre, e essa
// é exatamente a armadilha que este arquivo veio fechar.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import React from "react";
import { render, cleanup } from "@testing-library/react";

const modulos = import.meta.glob("/src/**/*.jsx");

// `main.jsx` monta a árvore inteira no DOM real (não é tela, é a raiz), e
// `App.jsx` exige sessão autenticada, Supabase e localStorage povoado — o
// `no-undef` do lint é quem cobre ele.
const FORA = ["/src/main.jsx", "/src/App.jsx"];

const caminhos = Object.keys(modulos).filter(p => !FORA.includes(p)).sort();

/**
 * O saco de props.
 *
 * Deliberadamente VAZIO em tudo que é dado: `[]`, `{}`, e um `sb` que
 * devolve lista vazia. É o estado real de qualquer tela no primeiro
 * quadro, antes de a consulta voltar — e é justamente aí que quebra o
 * componente que assume que o array já chegou.
 *
 * ⚠️ `sb` devolve `[]` e não `null`: são coisas diferentes nesta casa
 * (`null` = a requisição falhou; `[]` = funcionou e não há linha), e uma
 * tela que trate as duas igual não deve ser encorajada por um teste.
 */
const props = {
  sb: async () => [],
  currentUser: { name: "teste", role: "adm_master", username: "teste" },
  canEdit: true, isMaster: true,
  // Nomes que os componentes desta casa usam para os dados que recebem.
  d: {}, dados: {}, catalogos: {}, paciente: {}, episodio: {}, hospital: {},
  itens: [], lotes: [], rows: [], registros: [], setores: [], leitos: [],
  onClose: () => {}, onSave: () => {}, onChanged: () => {},
  onVoltar: () => {}, onPronto: () => {}, onEstornar: () => {},
};

beforeAll(() => {
  // O jsdom não implementa canvas 2D: `getContext` devolve `null`, e o
  // `FaturamentoSus` desenha um cérebro em canvas puro. Sem este boneco o
  // teste acusaria uma tela boa — falso positivo é pior que buraco, porque
  // ensina a desligar o teste.
  HTMLCanvasElement.prototype.getContext = () => ({
    setTransform: () => {}, clearRect: () => {}, beginPath: () => {},
    moveTo: () => {}, lineTo: () => {}, stroke: () => {}, fill: () => {},
    arc: () => {}, closePath: () => {}, save: () => {}, restore: () => {},
    translate: () => {}, rotate: () => {}, scale: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    fillRect: () => {}, fillText: () => {}, measureText: () => ({ width: 0 }),
  });
  // Componentes que medem a si mesmos para desenhar.
  global.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };
  global.matchMedia ||= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
});

afterEach(cleanup);

describe("toda tela abre com dado vazio", () => {
  it("🔴 o glob achou as telas (senão este arquivo passaria vazio para sempre)", () => {
    // Sem esta conferência, um glob que deixasse de casar tornaria o
    // arquivo inteiro decorativo — verde e sem olhar nada.
    expect(caminhos.length).toBeGreaterThan(25);
    expect(caminhos).toContain("/src/atendimento/Recepcao.jsx");
    expect(caminhos).toContain("/src/suprimentos/ConciliacaoKardex.jsx");
  });

  for (const caminho of caminhos) {
    it(caminho.replace("/src/", ""), async () => {
      const modulo = await modulos[caminho]();
      const Tela = modulo.default;
      // Arquivo `.jsx` sem export default não é tela — é módulo de apoio.
      if (typeof Tela !== "function") return;
      expect(() => render(<Tela {...props} />)).not.toThrow();
    });
  }
});
