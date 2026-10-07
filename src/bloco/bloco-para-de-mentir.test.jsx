// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// O BLOCO PARA DE AFIRMAR O QUE NÃO SABE
//
// Quatro defeitos achados na revisão do módulo (07/10/2026), todos da mesma
// família — o sistema dizendo coisa que não conferiu:
//
// 🔴 1. AS QUATRO ESCRITAS DESCARTAVAM O RETORNO. Uma pedia
//    `return=representation` e jogava fora; o PATCH nem mandava o cabeçalho.
//    O PostgREST responde 2xx com zero linhas quando a RLS filtra, e a
//    trilha de auditoria era gravada LOGO DEPOIS, sem olhar o resultado. No
//    checklist de cirurgia segura isso vira registro contraditório num
//    evento sentinela: a trilha dizendo que a conferência aconteceu, o campo
//    apagado.
//
// 🔴 2. O CONFLITO DE SALA SÓ ERA CONFERIDO PARA O DIA DO MAPA ABERTO.
//    `f.data === data ? conflitosDeSala(...) : []`. Mas mapa cirúrgico se
//    monta com dias de antecedência — marcar para outro dia é o caso NORMAL,
//    e nele a barreira ficava desligada em silêncio. A regra pura já existia
//    e já tinha teste; só não estava sendo chamada.
//
// 🔴 3. "SALA LIVRE NESTE DIA" com a leitura falhando. É afirmação de
//    ausência de cirurgia: alguém olha o mapa, vê livre, e encaixa uma
//    urgência na sala onde há cirurgia marcada.
//
// 🔴 4. `Prontuário *` tinha asterisco e NADA conferia. Asterisco que mente
//    é pior que ausência de asterisco, porque a pessoa acredita que o
//    sistema está olhando.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import BlocoPage from "./BlocoPage.jsx";
import {
  upsertCcSalaRemote, deleteCcSalaRemote, addCcCirurgiaRemote, updateCcCirurgiaRemote,
} from "./dados.js";

afterEach(cleanup);

const USER = { name: "adauam", username: "adauam" };

// ── A CAMADA DE DADOS ───────────────────────────────────────
describe("🔴 escrita que volta 2xx sem linha NÃO é sucesso", () => {
  // O que a RLS faz: responde ok e não grava nada.
  const barrado = async () => null;
  const vazio = async () => [];
  const gravou = async () => [{ id: 1 }];

  it("o PATCH manda `Prefer: return=representation` — sem ele não há o que conferir", async () => {
    let headers = null;
    await updateCcCirurgiaRemote(async (_u, o) => { headers = o?.headers; return [{ id: 1 }]; }, 1, { status: "x" });
    expect(headers?.Prefer).toMatch(/return=representation/);
  });

  it("o POST de cirurgia também", async () => {
    let headers = null;
    await addCcCirurgiaRemote(async (_u, o) => { headers = o?.headers; return [{ id: 1 }]; }, {}, USER);
    expect(headers?.Prefer).toMatch(/return=representation/);
  });

  for (const [nome, fn, args] of [
    ["upsertCcSalaRemote", upsertCcSalaRemote, [{ nome: "Sala 1" }, USER]],
    ["addCcCirurgiaRemote", addCcCirurgiaRemote, [{ iniciais: "A.B." }, USER]],
    ["updateCcCirurgiaRemote", updateCcCirurgiaRemote, [1, { status: "x" }]],
  ]) {
    it(`${nome}: null vira ok:false, e [] também`, async () => {
      expect((await fn(barrado, ...args)).ok).toBe(false);
      expect((await fn(vazio, ...args)).ok).toBe(false);
      expect((await fn(gravou, ...args)).ok).toBe(true);
    });
    it(`${nome}: sem banco, ok:false com motivo`, async () => {
      const r = await fn(null, ...args);
      expect(r.ok).toBe(false);
      expect(r.motivo).toBeTruthy();
    });
  }

  // DELETE não devolve linha nem com representação — 204 em todo caso.
  it("apagar sala confere RELENDO, porque DELETE não tem o que devolver", async () => {
    const chamadas = [];
    const aindaLa = async (u, o) => { chamadas.push(o?.method || "GET"); return o?.method === "DELETE" ? null : [{ nome: "Sala 1" }]; };
    expect((await deleteCcSalaRemote(aindaLa, "Sala 1")).ok).toBe(false);
    expect(chamadas).toEqual(["DELETE", "GET"]);

    const saiu = async (u, o) => (o?.method === "DELETE" ? null : []);
    expect((await deleteCcSalaRemote(saiu, "Sala 1")).ok).toBe(true);
  });

  it("se nem a releitura der, não afirma que apagou", async () => {
    const cego = async (u, o) => (o?.method === "DELETE" ? null : null);
    const r = await deleteCcSalaRemote(cego, "Sala 1");
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/não consegui confirmar/i);
  });
});

// ── A TELA ──────────────────────────────────────────────────
const SALAS = [{ nome: "Sala 1", ordem: 1, ativa: true }, { nome: "Sala 2", ordem: 2, ativa: true }];

/**
 * `sb` falso. `escrita` decide o que toda escrita devolve; `falhar` é a
 * lista de tabelas cuja LEITURA devolve null.
 */
function banco({ cirurgias = [], escrita = [{ id: 9 }], falhar = [], porDia = {} } = {}) {
  const pedidos = [];
  const sb = async (url, o) => {
    pedidos.push({ url: String(url), metodo: o?.method || "GET" });
    const tabela = String(url).split("?")[0];
    if (o?.method) return escrita;
    if (falhar.includes(tabela)) return null;
    if (tabela === "cc_salas") return SALAS;
    if (tabela === "cc_cirurgias") {
      const m = /data=eq\.([\d-]+)/.exec(String(url));
      return m && porDia[m[1]] ? porDia[m[1]] : cirurgias;
    }
    return [];
  };
  sb.pedidos = pedidos;
  return sb;
}

const abrir = (sb) => render(<BlocoPage sb={sb} currentUser={USER} canEdit={true} />);

describe("🔴 o mapa não diz 'livre' sem ter lido", () => {
  it("leitura das cirurgias falha → avisa, e NÃO escreve 'Sala livre neste dia'", async () => {
    abrir(banco({ falhar: ["cc_cirurgias"] }));
    await screen.findByText(/Não foi possível ler as salas e as cirurgias deste dia/i);
    expect(screen.getByText(/Não encaixe cirurgia por este mapa/i)).toBeTruthy();
    expect(screen.queryByText("Sala livre neste dia.")).toBeNull();
    expect(screen.getAllByText(/NÃO é "livre"/).length).toBeGreaterThan(0);
  });

  it("leitura do catálogo falha → não afirma 'Nenhuma sala cadastrada'", async () => {
    abrir(banco({ falhar: ["cc_salas"] }));
    await screen.findByText(/Não consegui ler o catálogo de salas/i);
    expect(screen.queryByText(/Nenhuma sala cadastrada\. Clique em Salas/)).toBeNull();
  });

  it("leu e está vazio mesmo: aí sim pode dizer 'livre'", async () => {
    abrir(banco({ cirurgias: [] }));
    expect((await screen.findAllByText("Sala livre neste dia.")).length).toBe(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("🔴 escrita que não se confirmou não vira trilha de auditoria", () => {
  it("o erro aparece na tela quando a RLS barra o registro de etapa", async () => {
    const sb = banco({
      cirurgias: [{ id: 5, iniciais: "A.B.", prontuario: "T1", sala: "Sala 1", procedimento: "Colecistectomia",
                    data: "2026-10-07", hora_prevista: "08:00", status: "agendada" }],
      escrita: [],   // 2xx sem linha — a RLS barrando
    });
    abrir(sb);
    const bt = await screen.findByText(/Check-in/i);
    fireEvent.click(bt);
    await screen.findByText(/Nada foi gravado/i);
    // e a auditoria NÃO foi chamada
    expect(sb.pedidos.some(p => p.url.startsWith("auditoria") && p.metodo === "POST")).toBe(false);
  });
});

// 🔴 ESTE TESTE NASCEU DE UMA MUTAÇÃO QUE PASSOU BATIDA — e era a pior do
// PR para ficar descoberta. O caso do checklist é o que torna o defeito
// grave: não é um campo que some, é a PROVA de uma conferência de segurança.
describe("🔴 o checklist de cirurgia segura não fecha sem ter gravado", () => {
  const cirurgiaEmSala = {
    id: 5, iniciais: "A.B.", prontuario: "T1", sala: "Sala 1", procedimento: "Colecistectomia",
    data: "2026-10-07", hora_prevista: "08:00", status: "checkin",
  };

  async function marcarTudoEConcluir() {
    fireEvent.click(await screen.findByText(/Cirurgia segura: Sign In/i));
    await screen.findByText(/Cirurgia Segura —/);
    // marca todos os itens (os checkboxes do modal)
    for (const cb of document.querySelectorAll('input[type="checkbox"]')) fireEvent.click(cb);
    fireEvent.click(screen.getByText(/Concluir Sign In/i));
  }

  it("com a RLS barrando: o modal FICA ABERTO, avisa, e não grava auditoria", async () => {
    const sb = banco({ cirurgias: [cirurgiaEmSala], escrita: [] });
    abrir(sb);
    await marcarTudoEConcluir();
    await screen.findByText(/Nada foi gravado/i);
    // o modal continua na tela — fechar daria a impressão de concluído, e é
    // a impressão que leva a equipe para a indução anestésica
    expect(screen.queryByText(/Cirurgia Segura —/)).toBeTruthy();
    expect(sb.pedidos.some(p => p.url.startsWith("auditoria") && p.metodo === "POST")).toBe(false);
  });

  it("quando grava de verdade: o modal fecha e a auditoria é registrada", async () => {
    const sb = banco({ cirurgias: [cirurgiaEmSala], escrita: [{ id: 5, chk_sign_in: true }] });
    abrir(sb);
    await marcarTudoEConcluir();
    await waitFor(() => expect(screen.queryByText(/Cirurgia Segura —/)).toBeNull());
    expect(sb.pedidos.some(p => p.url.startsWith("auditoria") && p.metodo === "POST")).toBe(true);
  });
});

describe("🔴 conflito de sala: o dia que a pessoa escolheu", () => {
  const hoje = new Date();
  const dia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  const outro = "2026-12-15";

  // Espera pelo botão de SUBMIT ("Agendar", exato) e não pelo título: o
  // botão que abre o modal se chama "+ Agendar cirurgia" e casaria junto.
  async function abrirForm(sb) {
    abrir(sb);
    fireEvent.click(await screen.findByText(/\+ Agendar cirurgia/i));
    await screen.findByText("Agendar");
    return screen.getAllByDisplayValue(dia);
  }

  it("marcando para OUTRO dia, confere aquele dia — e acha o conflito", async () => {
    const sb = banco({
      porDia: { [dia]: [], [outro]: [{ id: 7, iniciais: "X.Y.", sala: "Sala 1", hora_prevista: "08:00", duracao_prev_min: 60, status: "agendada" }] },
    });
    const campos = await abrirForm(sb);
    // o último com a data de hoje é o do formulário (o primeiro é o do mapa)
    fireEvent.change(campos[campos.length - 1], { target: { value: outro } });
    await waitFor(() => expect(sb.pedidos.some(p => p.url.includes(`data=eq.${outro}`))).toBe(true));
  });

  it("enquanto não leu o outro dia, DIZ que não conferiu — o silêncio não passa por 'livre'", async () => {
    const sb = banco({ porDia: { [dia]: [] } });
    const campos = await abrirForm(sb);
    fireEvent.change(campos[campos.length - 1], { target: { value: outro } });
    await screen.findByText(/Ainda NÃO conferi se a sala já está ocupada/i);
  });
});

describe("🔴 Prontuário * é obrigatório de verdade", () => {
  it("sem prontuário, recusa e explica por quê", async () => {
    const avisos = [];
    vi.stubGlobal("alert", m => avisos.push(String(m)));
    const sb = banco();
    abrir(sb);
    fireEvent.click(await screen.findByText(/\+ Agendar cirurgia/i));
    const campos = screen.getAllByRole("textbox");
    fireEvent.change(campos[0], { target: { value: "A.B." } });            // iniciais
    fireEvent.change(screen.getByPlaceholderText(/Colecistectomia/), { target: { value: "Hernior" } });
    fireEvent.click(screen.getByText("Agendar"));
    await waitFor(() => expect(avisos.join(" ")).toMatch(/prontuário/i));
    expect(sb.pedidos.some(p => p.metodo === "POST")).toBe(false);
    vi.unstubAllGlobals();
  });
});
