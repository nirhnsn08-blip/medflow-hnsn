// ═══════════════════════════════════════════════════════════
// PRONTO-SOCORRO — ACESSO AO BANCO
//
// 🔴 A FILA DO PS ALIMENTA OUTROS TRÊS MÓDULOS.
// `loadPsAtendimentos` é usado por 10 declarações e
// `loadPsPrescricaoItensByAtendimentos` por 7: a Farmácia prioriza a
// dispensação por essa fila, o Giro de Leitos mostra quem aguarda
// internação, o Faturamento separa urgência de eletiva.
//
// Um `sb` que não desce em um desses pontos devolve lista vazia — PS sem
// ninguém na fila, sem erro e sem log. Numa emergência, fila vazia é a
// notícia que ninguém confere.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  loadPsAtendimentos, loadPsFinalizadosHoje, loadPsAtendimentosPeriodo,
  loadPsSinais, loadPsRegistros, loadPsExamesPendentes, loadPsSalas, loadPsProtocolos,
  loadPsPrescricaoItens, loadPsPrescricaoItensByAtendimentos,
  loadPsAdministracoes, loadPsAdministracoesByAtendimentos,
  addPsAtendimentoRemote, updatePsAtendimentoRemote, patchPsAtendimentoDireto,
  addPsSinalRemote, addPsRegistroRemote, addPsPrescricaoItens, addPsAdministracao,
  upsertPsSalaRemote, deletePsSalaRemote,
} from "./dados.js";

const USER = { name: "Ana Souza" };

function espiao(resposta = []) {
  const chamadas = [];
  const sb = (caminho, opts) => { chamadas.push({ caminho, opts }); return Promise.resolve(resposta); };
  sb.chamadas = chamadas;
  return sb;
}
const corpo = c => JSON.parse(c.opts.body);

describe("🔴 a fila do PS", () => {
  it("traz só quem NÃO foi finalizado nem cancelado, e só emergência", () => {
    // Sem o filtro de status, a fila cresceria com todo atendimento já
    // encerrado. Sem o de tipo, entrariam consultas do ambulatório.
    const sb = espiao([]);
    return loadPsAtendimentos(sb).then(() => {
      expect(sb.chamadas[0].caminho).toContain("status=not.in.(finalizado,cancelado)");
      expect(sb.chamadas[0].caminho).toContain("tipo_atendimento.eq.emergencia");
    });
  });

  it("⚠️ e inclui quem NÃO tem tipo — são os anteriores à coluna", () => {
    // Atendimentos criados antes de `tipo_atendimento` existir são todos do
    // PS. Sem o `is.null` eles sumiriam da fila sem ninguém notar.
    const sb = espiao([]);
    return loadPsAtendimentos(sb).then(() => {
      expect(sb.chamadas[0].caminho).toContain("tipo_atendimento.is.null");
    });
  });

  it("ordena pela chegada — quem espera há mais tempo primeiro", () => {
    const sb = espiao([]);
    return loadPsAtendimentos(sb).then(() => {
      expect(sb.chamadas[0].caminho).toContain("order=chegada_em");
    });
  });

  it("o período do relatório usa as duas pontas do mês", () => {
    const sb = espiao([]);
    return loadPsAtendimentosPeriodo(sb, 2026, 7).then(() => {
      const q = sb.chamadas[0].caminho;
      expect(q).toContain("chegada_em=gte.");
      expect(q).toContain("chegada_em=lt.");   // `lt` no mês seguinte, não `lte` no último dia
    });
  });
});

const LEITURAS = [
  ["loadPsAtendimentos", sb => loadPsAtendimentos(sb), "ps_atendimentos"],
  ["loadPsFinalizadosHoje", sb => loadPsFinalizadosHoje(sb), "ps_atendimentos"],
  ["loadPsSinais", sb => loadPsSinais(sb, 1), "ps_sinais"],
  ["loadPsRegistros", sb => loadPsRegistros(sb, 1), "ps_registros"],
  ["loadPsSalas", sb => loadPsSalas(sb), "ps_salas"],
  ["loadPsProtocolos", sb => loadPsProtocolos(sb), "ps_protocolos"],
  ["loadPsPrescricaoItens", sb => loadPsPrescricaoItens(sb, 1), "ps_prescricao_itens"],
  ["loadPsAdministracoes", sb => loadPsAdministracoes(sb, 1), "ps_administracoes"],
];

describe("o `sb` é o primeiro argumento de todas", () => {
  it.each(LEITURAS)("%s lê de %s", async (_n, chamar, tabela) => {
    const sb = espiao([{ id: 1 }]);
    const r = await chamar(sb);
    expect(sb.chamadas).toHaveLength(1);
    expect(sb.chamadas[0].caminho).toContain(tabela);
    expect(r).toEqual([{ id: 1 }]);
  });

  it("🔴 lista de ids vazia não vira consulta sem filtro", async () => {
    // `in.()` sem nada dentro traz a tabela INTEIRA. Em `ps_prescricao_itens`
    // isso é o navegador travando, não um erro visível.
    for (const fn of [loadPsPrescricaoItensByAtendimentos, loadPsAdministracoesByAtendimentos, loadPsExamesPendentes]) {
      const sb = espiao([]);
      const r = await fn(sb, []);
      expect(r, fn.name).toEqual([]);
      expect(sb.chamadas, `${fn.name} consultou com lista vazia`).toHaveLength(0);
    }
  });
});

describe("as escritas carimbam quem fez", () => {
  it.each([
    ["addPsAtendimentoRemote", sb => addPsAtendimentoRemote(sb, { prontuario: "T1" }, USER), "ps_atendimentos"],
    ["addPsSinalRemote", sb => addPsSinalRemote(sb, { atendimento_id: 1 }, USER), "ps_sinais"],
    ["addPsRegistroRemote", sb => addPsRegistroRemote(sb, { atendimento_id: 1 }, USER), "ps_registros"],
    ["addPsAdministracao", sb => addPsAdministracao(sb, { item_id: 1 }, USER), "ps_administracoes"],
    ["upsertPsSalaRemote", sb => upsertPsSalaRemote(sb, { nome: "Vermelha" }, USER), "ps_salas"],
  ])("%s grava em %s com o usuário", async (_n, chamar, tabela) => {
    const sb = espiao([{ id: 1 }]);
    await chamar(sb);
    expect(sb.chamadas[0].caminho).toContain(tabela);
    expect(corpo(sb.chamadas[0]).usuario ?? corpo(sb.chamadas[0])[0]?.usuario).toBe("Ana Souza");
  });

  it("updatePsAtendimentoRemote altera pelo id", async () => {
    const sb = espiao([]);
    await updatePsAtendimentoRemote(sb, 7, { status: "em_atendimento" });
    expect(sb.chamadas[0].caminho).toContain("id=eq.7");
    expect(sb.chamadas[0].opts.method).toBe("PATCH");
  });

  it("prescrever vários itens de uma vez manda um POST só", async () => {
    const sb = espiao([]);
    await addPsPrescricaoItens(sb, [{ medicamento_id: 1 }, { medicamento_id: 2 }], USER);
    expect(sb.chamadas).toHaveLength(1);
    expect(corpo(sb.chamadas[0])).toHaveLength(2);
  });

  it("⚠️ sem banco nenhuma escrita acontece, e nenhuma estoura", async () => {
    for (const chamar of [
      () => updatePsAtendimentoRemote(null, 1, {}),
      () => deletePsSalaRemote(null, 1),
    ]) await expect(chamar()).resolves.toBeUndefined();
  });
});

describe("🔴 o PATCH que devolve o MOTIVO da recusa", () => {
  // Segunda escrita da casa que precisa do motivo — a primeira é o
  // movimento de estoque da Farmácia. O `sb` devolve `null` em qualquer
  // erro; aqui a recusa vem de gatilho ou política do banco, e quem está na
  // recepção precisa ler o que houve.

  it("devolve o que o poste cru devolveu", async () => {
    const cru = async () => ({ ok: false, erro: "atendimento já finalizado" });
    expect(await patchPsAtendimentoDireto(cru, 5, { status: "x" }))
      .toEqual({ ok: false, erro: "atendimento já finalizado" });
  });

  it("é PATCH, no id certo, e carimba o updated_at", async () => {
    const vistos = [];
    const cru = async (caminho, corpo, opts) => { vistos.push({ caminho, corpo, opts }); return { ok: true, row: { id: 5 } }; };
    const r = await patchPsAtendimentoDireto(cru, 5, { desfecho: "alta" });
    expect(vistos[0].caminho).toContain("ps_atendimentos?id=eq.5");
    expect(vistos[0].opts.method).toBe("PATCH");
    expect(vistos[0].corpo.desfecho).toBe("alta");
    expect(vistos[0].corpo.updated_at).toBeTruthy();
    expect(r.row).toEqual({ id: 5 });
  });

  it("⚠️ sem banco devolve recusa EXPLÍCITA, não sucesso mudo", async () => {
    const r = await patchPsAtendimentoDireto(null, 5, {});
    expect(r.ok).toBe(false);
    expect(r.erro).toBeTruthy();
  });

  it("🔴 e NÃO conhece credencial nenhuma", async () => {
    // Antes da extração montava o `fetch` na mão, com SUPABASE_URL,
    // SUPABASE_KEY e AUTH_TOKEN. Se a credencial voltar, o módulo volta a
    // depender do App.jsx e deixa de ser testável.
    const fonte = patchPsAtendimentoDireto.toString();
    for (const proibido of ["SUPABASE_URL", "SUPABASE_KEY", "AUTH_TOKEN", "apikey", "fetch("]) {
      expect(fonte, `${proibido} voltou para o módulo`).not.toContain(proibido);
    }
  });
});
