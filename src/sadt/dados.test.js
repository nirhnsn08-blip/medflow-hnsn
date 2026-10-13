// ═══════════════════════════════════════════════════════════
// EXAMES (SADT) — ACESSO AO BANCO
//
// 🔴 `in.()` SEM NADA DENTRO TRAZ A TABELA INTEIRA. É a guarda que estava em
// `src/ps/dados.test.js` sobre `loadPsExamesPendentes` e veio para cá junto
// com a função substituta — a propriedade não some porque a função mudou de
// arquivo. Em `sadt_resultados`, um `in.()` vazio é o navegador travando com
// o laudo de todos os pacientes do hospital, e isso não dá erro em tela.
//
// 🔴 E O "204 MENTIROSO": o PostgREST responde 2xx com ZERO linhas quando a
// RLS filtra. Resultado de exame gravado em silêncio é um laudo que o médico
// acha que está no sistema e não está.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  cancelarItem, contarSadtDoAtendimento, criarSadtPedido, lancarSadtResultado,
  loadSadtAnalitos, loadSadtCatalogo, loadSadtCriticos, loadSadtDoPaciente,
  loadSadtExamesPeriodo, loadSadtFilaPendente, loadSadtItens,
  loadSadtPedidosDoAtendimento, loadSadtPedidosPorId, loadSadtPendentesPorAtendimento,
  loadSadtResultados, marcarColetado, marcarVisto, upsertSadtAnalitoRemote,
  upsertSadtCatalogoRemote,
} from "./dados.js";
import { FALHA, naoDeuParaLer } from "../util/leitura.js";

const USER = { name: "Ana Souza" };

function espiao(resposta = []) {
  const chamadas = [];
  const sb = (caminho, opts) => { chamadas.push({ caminho, opts }); return Promise.resolve(resposta); };
  sb.chamadas = chamadas;
  return sb;
}
/** Responde diferente a cada chamada, para as cargas de dois passos. */
function fila(...respostas) {
  const chamadas = [];
  let i = 0;
  const sb = (caminho, opts) => { chamadas.push({ caminho, opts }); return Promise.resolve(respostas[i++]); };
  sb.chamadas = chamadas;
  return sb;
}
const corpo = c => JSON.parse(c.opts.body);

// ── A GUARDA DO `in.()` VAZIO ───────────────────────────────
describe("🔴 lista de ids vazia nunca vira consulta sem filtro", () => {
  it.each([
    ["loadSadtItens", loadSadtItens],
    ["loadSadtResultados", loadSadtResultados],
    ["loadSadtPedidosPorId", loadSadtPedidosPorId],
    ["loadSadtPendentesPorAtendimento", loadSadtPendentesPorAtendimento],
  ])("%s com [] não consulta", async (nome, fn) => {
    const sb = espiao([]);
    const r = await fn(sb, []);
    expect(r, nome).toEqual([]);
    expect(sb.chamadas, `${nome} consultou com lista vazia`).toHaveLength(0);
  });

  it("🔴 e o SEGUNDO passo também: pedido sem nenhum não busca item", async () => {
    // A carga de dois passos é o caminho onde isto escapa: o primeiro filtro
    // existe, o segundo monta o `in.()` com o resultado do primeiro.
    const sb = fila([]);
    const r = await loadSadtPendentesPorAtendimento(sb, [1, 2]);
    expect(r).toEqual([]);
    expect(sb.chamadas).toHaveLength(1);
  });

  it("loadSadtDoPaciente sem prontuário nem atendimento não consulta", async () => {
    const sb = espiao([]);
    expect(await loadSadtDoPaciente(sb, null, [])).toEqual({ pedidos: [], itens: [], resultados: [] });
    expect(sb.chamadas).toHaveLength(0);
  });

  it("loadSadtExamesPeriodo sem pedido no mês não busca item", async () => {
    const sb = fila([]);
    expect(await loadSadtExamesPeriodo(sb, 2026, 9)).toEqual([]);
    expect(sb.chamadas).toHaveLength(1);
  });
});

// ── O QUE CADA CARGA LÊ ─────────────────────────────────────
describe("cada carga lê da sua tabela", () => {
  it.each([
    ["loadSadtCatalogo", sb => loadSadtCatalogo(sb), "sadt_catalogo"],
    ["loadSadtAnalitos", sb => loadSadtAnalitos(sb), "sadt_analitos"],
    ["loadSadtPedidosDoAtendimento", sb => loadSadtPedidosDoAtendimento(sb, 5), "sadt_pedidos"],
    ["loadSadtItens", sb => loadSadtItens(sb, [1]), "sadt_itens"],
    ["loadSadtResultados", sb => loadSadtResultados(sb, [1]), "sadt_resultados"],
    ["loadSadtFilaPendente", sb => loadSadtFilaPendente(sb), "sadt_itens"],
    ["loadSadtCriticos", sb => loadSadtCriticos(sb), "sadt_resultados"],
  ])("%s lê de %s", async (_n, chamar, tabela) => {
    const sb = espiao([{ id: 1 }]);
    const r = await chamar(sb);
    expect(sb.chamadas[0].caminho).toContain(tabela);
    expect(r).toEqual([{ id: 1 }]);
  });

  it("🔴 toda carga devolve a marca de FALHA quando a leitura não desce", async () => {
    // Lista vazia na tela de exames lê-se "este paciente não tem exame
    // pedido" — notícia boa inventada em cima de rede ruim.
    const morto = () => Promise.resolve(null);
    for (const [nome, chamar] of [
      ["catalogo", () => loadSadtCatalogo(morto)],
      ["analitos", () => loadSadtAnalitos(morto)],
      ["pedidos", () => loadSadtPedidosDoAtendimento(morto, 5)],
      ["itens", () => loadSadtItens(morto, [1])],
      ["resultados", () => loadSadtResultados(morto, [1])],
      ["fila", () => loadSadtFilaPendente(morto)],
      ["criticos", () => loadSadtCriticos(morto)],
      ["pendentes", () => loadSadtPendentesPorAtendimento(morto, [1])],
      ["periodo", () => loadSadtExamesPeriodo(morto, 2026, 9)],
    ]) {
      expect(naoDeuParaLer(await chamar()), nome).toBe(true);
    }
  });

  it("🔴 sem `sb` também é FALHA, não vazio", async () => {
    // Sessão caída é indistinguível de banco vazio sem isto.
    expect(naoDeuParaLer(await loadSadtCatalogo(null))).toBe(true);
    expect(naoDeuParaLer(await loadSadtPedidosDoAtendimento(null, 1))).toBe(true);
    expect(naoDeuParaLer(await loadSadtFilaPendente(null))).toBe(true);
  });

  it("🔴 a fila pendente cita os estados, e NÃO `neq.visto`", async () => {
    // `neq.visto` faria exame CANCELADO contar como pendente — e exame
    // pendente trava a alta de um paciente por um exame que ninguém vai
    // fazer. Era o defeito da consulta antiga, que funcionava só porque
    // `ps_registros` não tinha estado de cancelamento.
    const sb = espiao([]);
    await loadSadtFilaPendente(sb);
    expect(sb.chamadas[0].caminho).toContain("status=in.(solicitado,coletado)");
    expect(sb.chamadas[0].caminho).not.toContain("neq.visto");
  });

  it("os pendentes por atendimento também não usam `neq.visto`", async () => {
    const sb = fila([{ id: 9, ps_atendimento_id: 5 }], []);
    await loadSadtPendentesPorAtendimento(sb, [5]);
    expect(sb.chamadas[1].caminho).toContain("status=in.(");
    expect(sb.chamadas[1].caminho).not.toContain("neq.visto");
  });
});

// ── O FORMATO QUE AS RÉGUAS JÁ LEEM ─────────────────────────
describe("🔴 o formato de volta é o que a régua antiga já lê", () => {
  it("pendentes devolvem { atendimento_id, status }", async () => {
    // É o crachá "2 exames aguardando" na fila do PS e a trava do desfecho.
    // Mudar o formato obrigaria a mexer em `contarExames`, e régua é uma só.
    const sb = fila(
      [{ id: 10, ps_atendimento_id: 5 }, { id: 11, ps_atendimento_id: 7 }],
      [{ pedido_id: 10, status: "coletado" }, { pedido_id: 11, status: "resultado_disponivel" }],
    );
    expect(await loadSadtPendentesPorAtendimento(sb, [5, 7])).toEqual([
      { atendimento_id: 5, status: "coletado" },
      { atendimento_id: 7, status: "resultado_disponivel" },
    ]);
  });

  it("🔴 o período junta a data do PEDIDO com o resultado do ITEM", async () => {
    // `criado_em` é do pedido e `resultado_em` é do item. Era uma coluna só
    // quando o exame era texto — e o tempo de resposta que o BI mede é
    // pedido → resultado, então sem a junção o relatório mediria nada.
    const sb = fila(
      [{ id: 10, criado_em: "2026-10-01T08:00:00.000Z" }],
      [{ pedido_id: 10, categoria: "laboratorial", status: "visto", resultado_em: "2026-10-01T10:00:00.000Z" }],
    );
    expect(await loadSadtExamesPeriodo(sb, 2026, 9)).toEqual([{
      categoria: "laboratorial", status: "visto",
      criado_em: "2026-10-01T08:00:00.000Z", resultado_em: "2026-10-01T10:00:00.000Z",
    }]);
  });

  it("o período filtra pelo mês pedido", async () => {
    const sb = fila([], []);
    await loadSadtExamesPeriodo(sb, 2026, 9);   // outubro
    expect(sb.chamadas[0].caminho).toMatch(/criado_em=gte\.2026-1[00]/);
    expect(sb.chamadas[0].caminho).toContain("criado_em=lt.");
  });
});

// ── A CONTAGEM DO CRACHÁ ────────────────────────────────────
describe("🔴 a contagem do crachá é null, nunca zero por engano", () => {
  it("sem pedido nenhum é ZERO de verdade", async () => {
    // Aqui zero é afirmação apurada: a consulta desceu e não há pedido.
    const sb = fila([]);
    expect(await contarSadtDoAtendimento(sb, 5)).toBe(0);
  });

  it("🔴 leitura que não desceu é null — 'Exames (0)' afirma que não há", async () => {
    expect(await contarSadtDoAtendimento(() => Promise.resolve(null), 5)).toBeNull();
    expect(await contarSadtDoAtendimento(null, 5)).toBeNull();
    expect(await contarSadtDoAtendimento(() => Promise.resolve([]), null)).toBeNull();
  });

  it("🔴 o SEGUNDO passo falhando também é null", async () => {
    // O pedido existe, os itens não foram lidos. Devolver o número de
    // pedidos aqui diria "1 exame" num pedido de oito.
    const sb = fila([{ id: 10 }], null);
    expect(await contarSadtDoAtendimento(sb, 5)).toBeNull();
  });

  it("conta os ITENS, não os pedidos", async () => {
    const sb = fila([{ id: 10 }], [{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(await contarSadtDoAtendimento(sb, 5)).toBe(3);
  });
});

// ── AS ESCRITAS ─────────────────────────────────────────────
describe("🔴 toda escrita confere a linha de volta (o 204 mentiroso)", () => {
  it("o pedido recusado em silêncio devolve erro, não sucesso", async () => {
    const r = await criarSadtPedido(espiao([]), { prontuario: "T1" }, () => [{ descricao: "x" }], USER);
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/NÃO foi criado/);
    expect(r.erro).toMatch(/permissão de escrita/);
  });

  it("🔴 pedido criado e itens NÃO CONFIRMADOS é diferente de itens parciais", async () => {
    // Conduta diferente: no primeiro caso é preciso ABRIR o pedido para ver
    // o que há; no segundo o sistema já sabe quantos faltam. Dizer "0
    // entraram" no primeiro faria o médico pedir de novo e duplicar.
    const naoSabe = fila([{ id: 42 }], null);
    const r1 = await criarSadtPedido(naoSabe, {}, () => [{ descricao: "a" }, { descricao: "b" }], USER);
    expect(r1.ok).toBe(false);
    expect(r1.pedido.id).toBe(42);
    expect(r1.erro).toMatch(/NÃO FOI POSSÍVEL CONFIRMAR/);

    const parcial = fila([{ id: 43 }], [{ id: 1 }]);
    const r2 = await criarSadtPedido(parcial, {}, () => [{ descricao: "a" }, { descricao: "b" }], USER);
    expect(r2.ok).toBe(false);
    expect(r2.erro).toMatch(/1 de 2 exame\(s\) NÃO entraram/);
  });

  it("o pedido completo devolve pedido e itens", async () => {
    const sb = fila([{ id: 42 }], [{ id: 1 }, { id: 2 }]);
    const r = await criarSadtPedido(sb, { prontuario: "T1" }, () => [{ descricao: "a" }, { descricao: "b" }], USER);
    expect(r.ok).toBe(true);
    expect(r.pedido.id).toBe(42);
    expect(r.itens).toHaveLength(2);
    expect(sb.chamadas[0].caminho).toBe("sadt_pedidos");
    expect(sb.chamadas[1].caminho).toBe("sadt_itens");
  });

  it("pedido sem item nenhum não chama a segunda consulta", async () => {
    const sb = fila([{ id: 42 }]);
    const r = await criarSadtPedido(sb, {}, () => [], USER);
    expect(r.ok).toBe(true);
    expect(sb.chamadas).toHaveLength(1);
  });

  it("o pedido carimba quem fez e quando", async () => {
    const sb = fila([{ id: 1 }], [{ id: 1 }]);
    await criarSadtPedido(sb, { prontuario: "T1" }, () => [{ descricao: "a" }], USER);
    const b = corpo(sb.chamadas[0]);
    expect(b.usuario).toBe("Ana Souza");
    expect(b.criado_em).toBeTruthy();
  });

  it("o resultado recusado em silêncio devolve erro, e avisa que o texto ficou", async () => {
    const r = await lancarSadtResultado(espiao([]), { item_id: 1, valor_num: 7 }, USER);
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/NÃO foi gravado/);
    expect(r.erro).toMatch(/continua na tela/);
  });

  it("🔴 o resultado devolve a LINHA DO BANCO, com anormal/critico calculados", async () => {
    // É ela que a tela deve usar, não o que foi enviado: quem compara com a
    // faixa é o gatilho, e a tela não tem opinião sobre o que é pânico.
    const sb = espiao([{ id: 9, valor_num: 7.2, anormal: true, critico: true, versao: 1 }]);
    const r = await lancarSadtResultado(sb, { item_id: 1, valor_num: 7.2 }, USER);
    expect(r.ok).toBe(true);
    expect(r.linha.critico).toBe(true);
    expect(corpo(sb.chamadas[0])).not.toHaveProperty("critico");
    expect(corpo(sb.chamadas[0])).not.toHaveProperty("anormal");
  });

  it.each([
    ["marcarColetado", sb => marcarColetado(sb, 1), "coletado", /A coleta NÃO foi gravad/],
    ["marcarVisto", sb => marcarVisto(sb, 1, USER), "visto", /'visto' NÃO foi gravad/],
    ["cancelarItem", sb => cancelarItem(sb, 1, "paciente transferido"), "cancelado", /cancelamento NÃO foi gravad/],
  ])("%s grava o estado e confere a volta", async (_n, chamar, estado, recusa) => {
    const ok = await chamar(espiao([{ id: 1, status: estado }]));
    expect(ok.ok).toBe(true);
    const vazio = await chamar(espiao([]));
    expect(vazio.ok).toBe(false);
    expect(vazio.erro).toMatch(recusa);
  });

  it("🔴 o PATCH manda `Prefer` à mão", async () => {
    // `sb` só injeta `Prefer` sozinho no POST. Sem ele no PATCH a resposta
    // volta sem corpo e a conferência não tem o que conferir — passaria por
    // falha toda alteração bem-sucedida.
    const sb = espiao([{ id: 1 }]);
    await marcarVisto(sb, 1, USER);
    expect(sb.chamadas[0].opts.headers.Prefer).toBe("return=representation");
    expect(sb.chamadas[0].opts.method).toBe("PATCH");
  });

  it("o visto carimba quem viu", async () => {
    const sb = espiao([{ id: 1 }]);
    await marcarVisto(sb, 1, USER);
    expect(corpo(sb.chamadas[0]).visto_por).toBe("Ana Souza");
    expect(corpo(sb.chamadas[0]).visto_em).toBeTruthy();
  });

  it("o cancelamento leva o motivo sem espaço sobrando", async () => {
    const sb = espiao([{ id: 1 }]);
    await cancelarItem(sb, 1, "  paciente transferido antes da coleta  ");
    expect(corpo(sb.chamadas[0]).cancelamento_motivo).toBe("paciente transferido antes da coleta");
  });

  it("catálogo e analito conferem a volta nas duas direções", async () => {
    for (const chamar of [
      sb => upsertSadtCatalogoRemote(sb, { nome: "Hemograma" }, USER),
      sb => upsertSadtCatalogoRemote(sb, { id: 1, nome: "Hemograma" }, USER),
      sb => upsertSadtAnalitoRemote(sb, { catalogo_id: 1, nome: "Hb" }, USER),
      sb => upsertSadtAnalitoRemote(sb, { id: 1, nome: "Hb" }, USER),
    ]) {
      expect(await chamar(espiao([]))).toBeNull();
      expect(await chamar(espiao([{ id: 1 }]))).toEqual([{ id: 1 }]);
    }
  });

  it("o id não vai no corpo de uma inserção", async () => {
    const sb = espiao([{ id: 1 }]);
    await upsertSadtCatalogoRemote(sb, { nome: "Hemograma" }, USER);
    expect(corpo(sb.chamadas[0])).not.toHaveProperty("id");
    expect(sb.chamadas[0].opts.method).toBe("POST");
  });
});

// ── O PACIENTE 360 ──────────────────────────────────────────
describe("loadSadtDoPaciente", () => {
  it("lê por prontuário E pelos atendimentos de PS", async () => {
    // O pedido feito antes de a recepção vincular o prontuário só tem o
    // atendimento. Deixá-lo de fora o faria desaparecer da linha do tempo —
    // o mesmo defeito do antecedente cirúrgico, de novo.
    const sb = fila([{ id: 10 }], [{ id: 1, pedido_id: 10 }], [{ id: 100, item_id: 1 }]);
    const r = await loadSadtDoPaciente(sb, "P001", [5, 6]);
    expect(sb.chamadas[0].caminho).toContain("prontuario.eq.P001");
    expect(sb.chamadas[0].caminho).toContain("ps_atendimento_id.in.(5,6)");
    expect(r.pedidos).toHaveLength(1);
    expect(r.itens).toHaveLength(1);
    expect(r.resultados).toHaveLength(1);
  });

  it("🔴 a marca de FALHA atravessa para as TRÊS listas", async () => {
    // Se não deu para ler os pedidos, a tela não pode receber "este paciente
    // não tem exame" nas outras duas.
    const r = await loadSadtDoPaciente(() => Promise.resolve(null), "P001", []);
    expect(naoDeuParaLer(r.pedidos)).toBe(true);
    expect(naoDeuParaLer(r.itens)).toBe(true);
    expect(naoDeuParaLer(r.resultados)).toBe(true);
    expect(r.pedidos).toBe(FALHA);
  });

  it("sem `sb` é FALHA nas três", async () => {
    const r = await loadSadtDoPaciente(null, "P001", [1]);
    expect(naoDeuParaLer(r.pedidos)).toBe(true);
    expect(naoDeuParaLer(r.resultados)).toBe(true);
  });

  it("pedido sem item não busca resultado", async () => {
    const sb = fila([{ id: 10 }], []);
    const r = await loadSadtDoPaciente(sb, "P001", []);
    expect(r.resultados).toEqual([]);
    expect(sb.chamadas).toHaveLength(2);
  });
});
