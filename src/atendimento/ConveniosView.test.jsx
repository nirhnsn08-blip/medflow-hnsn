// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// CONVÊNIOS & CONTRATOS — as três razões de a lista estar vazia
//
// 🔴 ACHADO NO BANCO DO HOSPITAL em 03/09/2026, abrindo a tela em produção
// pela primeira vez. Com as tabelas de conta ainda zeradas, ela dizia:
//
//     Faturado sem preço cadastrado (0)
//     "Todo item faturado tem preço vigente para o convênio dele."
//
// Não havia item faturado nenhum. A frase é verdadeira no vácuo e falsa
// como notícia — é a ausência lida como boa notícia, o defeito que este
// projeto mais persegue, aparecendo no texto em vez de no número.
//
// São TRÊS estados, e mandam a pessoa a lugares diferentes:
//   leitura falhou   → recarregue, não decida por esta tela
//   nada faturado    → não há o que comparar
//   tudo com preço   → aí sim, é boa notícia
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import ConveniosView from "./ConveniosView.jsx";

afterEach(cleanup);

// `sb` devolve por rota. `null` na rota = leitura falhou.
function banco({ precos = [], itens = [], convenios = [] } = {}) {
  return async rota => {
    if (rota.startsWith("at_precos")) return precos;
    if (rota.startsWith("at_conta_itens")) return itens;
    if (rota.startsWith("at_convenios")) return convenios;
    return [];
  };
}

const ITEM = { id: 1, conta_id: 1, codigo: "0301060088", descricao: "Consulta", valor_total: 100, at_contas: { convenio_id: 7, competencia: "2026-09" } };
const PRECO = { id: 1, convenio_id: 7, codigo: "0301060088", valor: 100, ativo: true, vigencia_inicio: "2020-01-01", vigencia_fim: null };

const abrir = props => render(<ConveniosView sb={banco(props)} currentUser={{ name: "T" }} canEdit={true} />);

describe("🔴 os três motivos para a lista de lacunas estar vazia", () => {
  it("nada faturado NÃO é elogio", () => {
    abrir({ itens: [], precos: [] });
    return waitFor(() => {
      expect(screen.getByText(/não há item faturado para conferir/i)).toBeTruthy();
      // A frase antiga não pode aparecer aqui de jeito nenhum.
      expect(screen.queryByText(/todo item faturado tem preço/i)).toBeNull();
    });
  });

  it("a frase diz explicitamente que não é atestado", () => {
    // Sem isto, "não há item faturado" ainda pode ser lido como "está tudo
    // certo" por quem passa o olho.
    abrir({ itens: [], precos: [] });
    return waitFor(() => {
      expect(screen.getByText(/não diz que está tudo certo/i)).toBeTruthy();
    });
  });

  it("faturado E com preço: aí sim é boa notícia", () => {
    abrir({ itens: [ITEM], precos: [PRECO] });
    return waitFor(() => {
      expect(screen.getByText(/todo item faturado tem preço vigente/i)).toBeTruthy();
    });
  });

  it("🔴 leitura falhada não vira nenhuma das duas", () => {
    // `null` do PostgREST = não deu para ler. Se virasse "nada faturado", a
    // tela trocaria uma falha de rede por uma afirmação sobre o hospital.
    abrir({ itens: null, precos: null });
    return waitFor(() => {
      // getAllBy: a falha aparece duas vezes de propósito — na faixa de
      // aviso no topo e no lugar da lista, que é onde a pessoa está olhando.
      expect(screen.getAllByText(/Não foi possível ler/i).length).toBeGreaterThan(0);
      expect(screen.queryByText(/todo item faturado tem preço/i)).toBeNull();
      expect(screen.queryByText(/não há item faturado para conferir/i)).toBeNull();
    });
  });
});
