// ═══════════════════════════════════════════════════════════
// ALMOXARIFADO — ACESSO AO BANCO
//
// 🔴 DUAS DAS ESCRITAS AQUI DEVOLVEM O MOTIVO DA RECUSA, e é o que este
// arquivo mais guarda.
//
//   addSupMovimentoRemote  a recusa vem de GATILHO ("saldo insuficiente",
//                          "lote vencido"). Quem está separando material
//                          precisa ler o motivo.
//   deleteSupItemRemote    a recusa é quase sempre chave estrangeira: o
//                          item tem histórico. A saída é INATIVAR, não
//                          excluir — e a pessoa só descobre isso se a
//                          mensagem chegar.
//
// As duas recebem `sbCru`, não `sb`: o `sb` devolve `null` em qualquer erro
// e manda o detalhe para o aviso global, o que serve para as outras ~70
// chamadas e não serve para estas.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  loadSupItens, loadSupLotes, loadSupMovimentos, loadSupFornecedores,
  loadSupInventarios, loadSupRequisicoes, loadSupPedidos, loadSupCotacoes,
  upsertSupItemRemote, deleteSupItemRemote, addSupMovimentoRemote,
  upsertSupFornecedorRemote, addSupInventarioRemote, setSupItemCustoRemote,
  addSupRequisicaoRemote, atualizarSupReqRemote,
  addSupPedidoRemote, atualizarSupPedidoRemote,
  addSupCotacaoRemote, atualizarSupCotacaoRemote,
} from "./dados.js";

const USER = { name: "Ana Souza" };

function espiao(resposta = []) {
  const chamadas = [];
  const sb = (caminho, opts) => { chamadas.push({ caminho, opts }); return Promise.resolve(resposta); };
  sb.chamadas = chamadas;
  return sb;
}
const corpo = c => JSON.parse(c.opts.body);

const LEITURAS = [
  ["loadSupItens", sb => loadSupItens(sb), "sup_itens"],
  ["loadSupLotes", sb => loadSupLotes(sb), "sup_lotes"],
  ["loadSupFornecedores", sb => loadSupFornecedores(sb), "sup_fornecedores"],
  ["loadSupInventarios", sb => loadSupInventarios(sb), "sup_inventarios"],
  ["loadSupRequisicoes", sb => loadSupRequisicoes(sb), "sup_requisicoes"],
  ["loadSupPedidos", sb => loadSupPedidos(sb), "sup_pedidos"],
  ["loadSupCotacoes", sb => loadSupCotacoes(sb), "sup_cotacoes"],
];

describe("o `sb` é o primeiro argumento, e chega na tabela certa", () => {
  it.each(LEITURAS)("%s lê de %s", async (_n, chamar, tabela) => {
    const sb = espiao([{ id: 1 }]);
    const r = await chamar(sb);
    expect(sb.chamadas).toHaveLength(1);
    expect(sb.chamadas[0].caminho).toContain(tabela);
    expect(r).toEqual([{ id: 1 }]);
  });

  it("loadSupMovimentos filtra pelo item e limita", async () => {
    const sb = espiao([]);
    await loadSupMovimentos(sb, 42, 10);
    expect(sb.chamadas[0].caminho).toContain("item_id=eq.42");
    expect(sb.chamadas[0].caminho).toContain("limit=10");
  });

  it("⚠️ as listas grandes vêm com teto — sem ele a tela trava sozinha", async () => {
    // `sup_movimentos` cresce para sempre. Uma consulta sem `limit` numa
    // base de um ano é o navegador parando, não um erro visível.
    for (const [nome, chamar] of [["loadSupRequisicoes", loadSupRequisicoes],
                                  ["loadSupPedidos", loadSupPedidos],
                                  ["loadSupCotacoes", loadSupCotacoes],
                                  ["loadSupInventarios", loadSupInventarios]]) {
      const sb = espiao([]);
      await chamar(sb);
      expect(sb.chamadas[0].caminho, nome).toContain("limit=");
    }
  });
});

describe("as escritas carimbam quem fez", () => {
  it.each([
    ["upsertSupItemRemote", sb => upsertSupItemRemote(sb, { nome: "Luva M" }, USER), "sup_itens"],
    ["upsertSupFornecedorRemote", sb => upsertSupFornecedorRemote(sb, { nome: "Forn" }, USER), "sup_fornecedores"],
    ["addSupInventarioRemote", sb => addSupInventarioRemote(sb, { setor: "UTI" }, USER), "sup_inventarios"],
    ["addSupRequisicaoRemote", sb => addSupRequisicaoRemote(sb, { setor: "UTI" }, USER), "sup_requisicoes"],
    ["addSupPedidoRemote", sb => addSupPedidoRemote(sb, { fornecedor_id: 1 }, USER), "sup_pedidos"],
    ["addSupCotacaoRemote", sb => addSupCotacaoRemote(sb, { pedido_id: 1 }, USER), "sup_cotacoes"],
  ])("%s grava em %s com o usuário", async (_n, chamar, tabela) => {
    const sb = espiao([{ id: 1 }]);
    await chamar(sb);
    expect(sb.chamadas[0].caminho).toContain(tabela);
    expect(corpo(sb.chamadas[0]).usuario).toBe("Ana Souza");
  });

  it.each([
    ["atualizarSupReqRemote", sb => atualizarSupReqRemote(sb, 7, { status: "atendida" }), "sup_requisicoes"],
    ["atualizarSupPedidoRemote", sb => atualizarSupPedidoRemote(sb, 7, { status: "aprovado" }), "sup_pedidos"],
    ["atualizarSupCotacaoRemote", sb => atualizarSupCotacaoRemote(sb, 7, { valor: 10 }), "sup_cotacoes"],
    ["setSupItemCustoRemote", sb => setSupItemCustoRemote(sb, 7, 12.5), "sup_itens"],
  ])("%s altera pelo id", async (_n, chamar, tabela) => {
    const sb = espiao([]);
    await chamar(sb);
    expect(sb.chamadas[0].caminho).toContain(tabela);
    expect(sb.chamadas[0].caminho).toContain("id=eq.7");
    expect(sb.chamadas[0].opts.method).toBe("PATCH");
  });
});

describe("🔴 as duas escritas que devolvem o MOTIVO da recusa", () => {
  it("o movimento devolve o que o poste cru devolveu", async () => {
    const cru = async () => ({ ok: false, erro: "saldo insuficiente no lote L-22" });
    expect(await addSupMovimentoRemote(cru, { item_id: 1, quantidade: 5 }, USER))
      .toEqual({ ok: false, erro: "saldo insuficiente no lote L-22" });
  });

  it("o movimento grava em sup_movimentos, com o usuário", async () => {
    const vistos = [];
    const cru = async (c, b) => { vistos.push({ c, b }); return { ok: true }; };
    expect(await addSupMovimentoRemote(cru, { item_id: 1, tipo: "saida" }, USER)).toEqual({ ok: true });
    expect(vistos[0].c).toBe("sup_movimentos");
    expect(vistos[0].b).toMatchObject({ item_id: 1, tipo: "saida", usuario: "Ana Souza" });
  });

  it("a exclusão é DELETE no id, e SEM corpo", async () => {
    // ⚠️ Mandar corpo num DELETE faz o PostgREST recusar por JSON inválido —
    // e a mensagem que chegaria à tela seria sobre o JSON, não sobre a
    // chave estrangeira que é o motivo real.
    const vistos = [];
    const cru = async (c, b, o) => { vistos.push({ c, b, o }); return { ok: true }; };
    await deleteSupItemRemote(cru, 9);
    expect(vistos[0].c).toBe("sup_itens?id=eq.9");
    expect(vistos[0].o.method).toBe("DELETE");
    expect(vistos[0].b).toBeNull();
  });

  it("a exclusão devolve o motivo quando o item tem histórico", async () => {
    const cru = async () => ({ ok: false, erro: 'update or delete on "sup_itens" violates foreign key' });
    const r = await deleteSupItemRemote(cru, 9);
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("foreign key");
  });

  it("⚠️ sem banco: o movimento RECUSA, a exclusão local passa", async () => {
    // São respostas diferentes de propósito. Gravar movimento sem banco é
    // perder a saída de material — tem de recusar. Excluir um item que só
    // existe no armário do navegador é operação local legítima.
    expect((await addSupMovimentoRemote(null, { item_id: 1 }, USER)).ok).toBe(false);
    expect((await deleteSupItemRemote(null, 9)).ok).toBe(true);
  });

  it("🔴 e nenhuma das duas conhece credencial", async () => {
    for (const fn of [addSupMovimentoRemote, deleteSupItemRemote]) {
      const fonte = fn.toString();
      for (const proibido of ["SUPABASE_URL", "SUPABASE_KEY", "AUTH_TOKEN", "apikey", "fetch("]) {
        expect(fonte, `${proibido} em ${fn.name}`).not.toContain(proibido);
      }
    }
  });
});
