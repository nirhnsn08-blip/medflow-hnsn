// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// NENHUMA TELA ELOGIA UM BANCO VAZIO
//
// `telas.test.jsx` monta as mesmas telas, mas pergunta outra coisa: se
// EXPLODE. Uma tela pode montar perfeitamente e mentir.
//
// 🔴 POR QUE ISTO É COMERCIAL, e não estético. O produto é vendido a vários
// hospitais, e ninguém sabe com quais convênios, setores ou protocolos cada
// um trabalha. **Todo cliente novo abre o sistema com zero linha em tudo.**
// O banco vazio não é caso de canto: é o estado em que o produto é
// conhecido, avaliado e comprado.
//
// E é justamente aí que a frase tranquilizadora vira mentira:
//
//     "Todo item faturado tem preço vigente para o convênio dele"
//         num hospital que ainda não faturou nada
//     "Nenhuma glosa em aberto"
//         num hospital que nunca lançou glosa nenhuma
//
// As duas são verdadeiras no vácuo e falsas como notícia. As duas foram
// achadas por esta varredura em 03/09/2026, e as duas já estão consertadas
// — este arquivo existe para que não voltem.
//
// ⚠️ ISTO NÃO SUBSTITUI OLHAR. A varredura pega a AFIRMAÇÃO tranquilizadora,
// que é a forma mais tóxica do defeito. Ela NÃO pega o painel que mostra uma
// coluna de zeros sem explicar que nada foi cadastrado — esse é silêncio, e
// silêncio não casa com expressão regular. Ver o relatório escrito por
// `npm run varredura` para olhar tela por tela.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import React from "react";
import { render, cleanup, act } from "@testing-library/react";
import fs from "node:fs";

const modulos = import.meta.glob("/src/**/*.jsx");
const FORA = ["/src/main.jsx", "/src/App.jsx"];
const caminhos = Object.keys(modulos)
  .filter(p => !FORA.includes(p) && !p.endsWith(".test.jsx"))
  .sort();

const props = {
  sb: async () => [],
  currentUser: { name: "teste", role: "adm_master", username: "teste" },
  canEdit: true, isMaster: true,
  d: {}, dados: {}, catalogos: {}, paciente: {}, episodio: {}, hospital: {},
  itens: [], lotes: [], rows: [], registros: [], setores: [], leitos: [],
  precos: [], convenios: [], contas: [], glosas: [],
  onClose: () => {}, onSave: () => {}, onChanged: () => {},
  onVoltar: () => {}, onPronto: () => {}, onEstornar: () => {},
};

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = () => ({
    setTransform: () => {}, clearRect: () => {}, beginPath: () => {},
    moveTo: () => {}, lineTo: () => {}, stroke: () => {}, fill: () => {},
    arc: () => {}, closePath: () => {}, save: () => {}, restore: () => {},
    translate: () => {}, rotate: () => {}, scale: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    fillRect: () => {}, fillText: () => {}, measureText: () => ({ width: 0 }),
  });
  global.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };
  global.matchMedia ||= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
});

afterEach(cleanup);

/**
 * Frases que AFIRMAM que está tudo bem.
 *
 * ⚠️ Cada uma precisa casar a AFIRMAÇÃO e não a NEGAÇÃO dela. "Esta lista
 * não diz que está tudo certo" é a frase honesta que o conserto da
 * ConveniosView introduziu, e a primeira versão desta lista acusou ela —
 * falso positivo que quase me fez "consertar" o conserto. Quem separa os
 * dois é `NEGADO` logo abaixo, olhando o que vem ANTES do trecho casado.
 */
const ELOGIOS = [
  /\btodo[as]?\b[^.]{0,60}\b(tem|têm|está|estão|possui)\b/i,
  /\bnenhum[ao]?\b[^.]{0,50}\b(pendente|em aberto|vencid|atrasad|irregular)/i,
  /\btudo (certo|em dia|ok|conforme)/i,
  /\bsem (pend[êe]ncia|irregularidade|problema|alerta|risco)s?\b/i,
  /\b(nada|ningu[ée]m) (a|para) (fazer|conferir|revisar|resolver)/i,
  /\b100% (conforme|adequad|em dia)/i,
  /\bparab[ée]ns\b/i,
];

/** O elogio vale quando NEGADO ou CONDICIONADO — aí ele é honesto. */
const NEGADO = (texto, trecho) => {
  const i = texto.indexOf(trecho);
  const antes = texto.slice(Math.max(0, i - 40), i).toLowerCase();
  return /\bn[ãa]o\b[^.]{0,20}$|\bnem\b[^.]{0,20}$/.test(antes);
};

/**
 * ⚠️ A LISTA DE PERDÃO É PARA MENTIRA CONHECIDA E ACEITA, e hoje está
 * VAZIA de propósito. Se algum dia precisar de linha, ela pede um comentário
 * dizendo por que aquela tela pode elogiar um hospital do qual não se sabe
 * nada — e essa justificativa é difícil de escrever, o que é o objetivo.
 */
const PERDOADAS = new Set([]);

async function textoDaTela(caminho) {
  const mod = await modulos[caminho]();
  const Tela = mod.default;
  if (typeof Tela !== "function") return null;
  let texto = "";
  await act(async () => {
    render(<Tela {...props} />);
    await new Promise(r => setTimeout(r, 0));
  });
  texto = (document.body.textContent || "").replace(/\s+/g, " ").trim();
  cleanup();
  return texto;
}

describe("🔴 nenhuma tela elogia um banco vazio", () => {
  it("o glob achou as telas (senão o arquivo passaria vazio para sempre)", () => {
    expect(caminhos.length).toBeGreaterThan(25);
    expect(caminhos).toContain("/src/atendimento/GlosasView.jsx");
    expect(caminhos).toContain("/src/atendimento/ConveniosView.jsx");
  });

  it("⚠️ a própria varredura acusa uma frase de elogio (senão ela é decorativa)", () => {
    // Um regex que deixou de casar passaria "verde" sem olhar nada — é a
    // mesma armadilha do glob vazio, uma camada acima.
    const isca = "Fila de trabalho (0) Nenhuma glosa em aberto.";
    expect(ELOGIOS.some(re => re.test(isca))).toBe(true);
  });

  it("⚠️ e NÃO acusa a frase honesta que nega o elogio", () => {
    const honesta = "Esta lista não diz que está tudo certo — diz que não há o que comparar.";
    const achados = ELOGIOS.map(re => (honesta.match(re) || [])[0]).filter(Boolean);
    expect(achados.every(t => NEGADO(honesta, t))).toBe(true);
  });

  for (const caminho of caminhos) {
    const nome = caminho.replace("/src/", "");
    it(nome, async () => {
      const texto = await textoDaTela(caminho);
      if (texto === null) return;                       // módulo de apoio
      const achados = ELOGIOS
        .map(re => (texto.match(re) || [])[0])
        .filter(Boolean)
        .filter(t => !NEGADO(texto, t));
      if (PERDOADAS.has(nome)) return;
      expect(achados, `com o banco VAZIO, esta tela afirma: ${JSON.stringify(achados)}`).toEqual([]);
    });
  }
});

// ─────────────────────────────────────────────────────────────
// O RELATÓRIO, para leitura humana. Fica de fora da rodada normal porque
// escrever arquivo em todo `npm test` suja o diretório de trabalho.
// ─────────────────────────────────────────────────────────────
// `--mode varredura` em vez de variável de ambiente: `VARREDURA=1 cmd` não
// existe no PowerShell, e uma dependência a mais (cross-env) só para isto
// seria cara. `npm run varredura` funciona igual nos dois shells.
describe.runIf(import.meta.env.MODE === "varredura")("relatório do estado vazio", () => {
  it("escreve varredura-vazio.txt", async () => {
    const linhas = [];
    for (const caminho of caminhos) {
      const texto = await textoDaTela(caminho);
      if (texto === null) continue;
      const achados = ELOGIOS.map(re => (texto.match(re) || [])[0]).filter(Boolean).filter(t => !NEGADO(texto, t));
      linhas.push({ tela: caminho.replace("/src/", ""), chars: texto.length, achados, texto: texto.slice(0, 700) });
    }
    fs.writeFileSync("varredura-vazio.txt",
      `TELAS: ${linhas.length}\nCOM ELOGIO NO VAZIO: ${linhas.filter(l => l.achados.length).length}\n\n` +
      linhas.map(l => `${"═".repeat(70)}\n${l.tela} (${l.chars} chars)\n  elogia: ${JSON.stringify(l.achados)}\n  ${l.texto}`).join("\n"),
      "utf8");
    expect(linhas.length).toBeGreaterThan(25);
  }, 120000);
});

// ═══════════════════════════════════════════════════════════
// E O LADO SILENCIOSO: o painel que mostra zeros sem dizer por quê
//
// A varredura por expressão regular acima pega a AFIRMAÇÃO tranquilizadora.
// Não pega o silêncio — e o silêncio foi o achado maior de 03/09/2026:
// sete painéis abriam com "Solicitações a preparar 0", "Requisições
// aguardando 0", que num hospital novo lê-se como um dia tranquilo.
//
// Estes sete recebem a faixa de `ui/PrimeiroUso.jsx`. A lista abaixo é
// escrita à mão de propósito: painel novo não entra sozinho, e é bom que
// não entre — quem criar o oitavo tem de decidir qual cadastro o sustenta,
// que é uma pergunta de produto, não de código.
// ═══════════════════════════════════════════════════════════
describe("🔴 os painéis explicam o próprio zero", () => {
  const PAINEIS = [
    "atendimento/FaturamentoSus.jsx",
    "clinico/SegurancaPaciente.jsx",
    "farmacia/FarmaciaPage.jsx",
    "pacientes/Paciente360.jsx",
    "protocolos/ProtocolosPage.jsx",
    "ps/PsPage.jsx",
    "suprimentos/SuprimentosPage.jsx",
  ];

  for (const nome of PAINEIS) {
    it(nome, async () => {
      const texto = await textoDaTela("/src/" + nome);
      expect(texto, "a tela sumiu ou deixou de ter export default").not.toBe(null);
      expect(texto).toMatch(/Falta cadastrar/);
      // 🔴 A segunda frase é a que importa: sem ela a pessoa lê o aviso,
      // fecha, e continua olhando os zeros como medida do hospital dela.
      expect(texto).toMatch(/não porque o movimento do hospital foi zero/);
    });
  }
});
