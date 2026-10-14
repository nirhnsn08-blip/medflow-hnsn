// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// A ABA DE EXAMES NÃO TRAVA EM "CARREGANDO"
//
// 🔴 ESTE TESTE NASCEU DE UM DEFEITO ACHADO ANDANDO NO DEMO (14/10/2026),
// não por teste — e a razão de nenhum teste pegar é o próprio assunto.
//
// A aba guarda `naTela` (um `useRef`) para não chamar `setState` depois de
// desmontar — a guarda que deixou a `main` vermelha no PR #277. Ela foi
// copiada de `BlocoPage.jsx`, mas SEM a linha que a religa na montagem:
//
//     useEffect(() => () => { naTela.current = false; }, []);   ← faltava o true
//
// O React 18 em StrictMode (ligado em `main.jsx`) monta → DESMONTA → monta
// de novo em desenvolvimento. A limpeza da falsa desmontagem põe o ref em
// `false`; nada o repõe; `recarregar` passa a sair antes do
// `setCarregou(true)`. A aba trava em "Carregando exames…" PARA SEMPRE —
// sem erro, sem console, sem requisição de rede. Só um texto cinza.
//
// ⚠️ POR QUE A SUÍTE INTEIRA PASSOU VERDE: `render()` monta UMA vez. O
// defeito só existe no segundo ciclo de montagem, que é exatamente o que o
// StrictMode faz e o que o teste comum não faz.
//
// Então o teste abaixo monta, desmonta e monta de novo, de propósito.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, afterEach, vi } from "vitest";
import React, { StrictMode } from "react";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import { AbaExames } from "./AbaExames.jsx";

afterEach(cleanup);

const PACIENTE = { id: 7, iniciais: "I.A.", prontuario: "T9016" };
const USER = { name: "Ana Souza" };

/** Um `sb` que responde como o banco do hospital responderia. */
function bancoCom({ pedidos = [], itens = [], resultados = [], catalogo = [], analitos = [] } = {}) {
  const chamadas = [];
  const sb = async (caminho) => {
    chamadas.push(caminho);
    if (caminho.startsWith("sadt_pedidos")) return pedidos;
    if (caminho.startsWith("sadt_itens")) return itens;
    if (caminho.startsWith("sadt_resultados")) return resultados;
    if (caminho.startsWith("sadt_catalogo")) return catalogo;
    if (caminho.startsWith("sadt_analitos")) return analitos;
    return [];
  };
  sb.chamadas = chamadas;
  return sb;
}

const UM_EXAME = {
  pedidos: [{ id: 10, criado_em: "2026-10-13T08:00:00.000Z", prioridade: "rotina", ps_atendimento_id: 7 }],
  itens: [{ id: 1, pedido_id: 10, descricao: "Hemograma completo", categoria: "laboratorial", status: "solicitado" }],
};

describe("🔴 a aba sai do 'Carregando' mesmo montando duas vezes", () => {
  it("monta uma vez e mostra o exame", async () => {
    render(<AbaExames sb={bancoCom(UM_EXAME)} paciente={PACIENTE} currentUser={USER} />);
    await waitFor(() => expect(screen.getByText(/Hemograma completo/)).toBeTruthy());
    expect(screen.queryByText(/Carregando exames/)).toBeNull();
  });

  it("🔴 em StrictMode — monta, desmonta e monta de novo — também sai", async () => {
    // É o ciclo que o React 18 faz em desenvolvimento, e era onde a aba
    // ficava presa: a guarda `naTela` ia para `false` na falsa desmontagem
    // e ninguém a repunha.
    render(
      <StrictMode>
        <AbaExames sb={bancoCom(UM_EXAME)} paciente={PACIENTE} currentUser={USER} />
      </StrictMode>
    );
    await waitFor(() => expect(screen.getByText(/Hemograma completo/)).toBeTruthy(), { timeout: 3000 });
    expect(screen.queryByText(/Carregando exames/)).toBeNull();
  });

  it("🔴 e remontar de verdade (fechar e reabrir o modal) também sai", async () => {
    // O mesmo ref, o mesmo caminho: quem fecha o painel do atendimento e
    // abre outra vez cai na segunda montagem.
    const sb = bancoCom(UM_EXAME);
    const { unmount } = render(<AbaExames sb={sb} paciente={PACIENTE} currentUser={USER} />);
    await waitFor(() => expect(screen.getByText(/Hemograma completo/)).toBeTruthy());
    unmount();
    cleanup();

    render(<AbaExames sb={sb} paciente={PACIENTE} currentUser={USER} />);
    await waitFor(() => expect(screen.getByText(/Hemograma completo/)).toBeTruthy());
    expect(screen.queryByText(/Carregando exames/)).toBeNull();
  });

  it("paciente sem exame nenhum sai do 'Carregando' e diz que não há", async () => {
    render(<AbaExames sb={bancoCom()} paciente={PACIENTE} currentUser={USER} />);
    await waitFor(() => expect(screen.getByText(/Nenhum exame solicitado/)).toBeTruthy());
  });

  it("🔴 leitura que FALHOU também sai do 'Carregando', e avisa", async () => {
    // Travar em "Carregando" é a pior resposta para uma falha: não diz nada
    // e parece que ainda vai chegar.
    const morto = async () => null;
    render(<AbaExames sb={morto} paciente={PACIENTE} currentUser={USER} />);
    await waitFor(() => expect(screen.queryByText(/Carregando exames/)).toBeNull());
    expect(screen.getByText(/INCOMPLETA/)).toBeTruthy();
  });

  it("sem banco nenhum não fica girando", async () => {
    render(<AbaExames sb={null} paciente={PACIENTE} currentUser={USER} />);
    await waitFor(() => expect(screen.queryByText(/Carregando exames/)).toBeNull());
  });
});

// ── O CRACHÁ DA ABA ─────────────────────────────────────────
describe("🔴 a aba não apaga a contagem que o modal já tinha", () => {
  it("relata o número que leu", async () => {
    const contou = vi.fn();
    render(<AbaExames sb={bancoCom(UM_EXAME)} paciente={PACIENTE} currentUser={USER} onContou={contou} />);
    await waitFor(() => expect(contou).toHaveBeenCalledWith(1));
  });

  it("🔴 NUNCA relata null — era isso que apagava o (1) do botão", async () => {
    // O modal conta antes de a aba existir, porque é pelo número no botão
    // que o médico descobre que há exame esperando. A aba mandando `null`
    // enquanto carrega fazia o (1) sumir no clique; e se a leitura dela
    // falhasse, apagava de vez uma contagem que o modal leu com sucesso.
    const contou = vi.fn();
    const morto = async () => null;
    render(<AbaExames sb={morto} paciente={PACIENTE} currentUser={USER} onContou={contou} />);
    await waitFor(() => expect(screen.queryByText(/Carregando exames/)).toBeNull());
    expect(contou).not.toHaveBeenCalledWith(null);
    expect(contou).not.toHaveBeenCalled();
  });

  it("zero exames relata zero — aí é afirmação apurada", async () => {
    const contou = vi.fn();
    render(<AbaExames sb={bancoCom()} paciente={PACIENTE} currentUser={USER} onContou={contou} />);
    await waitFor(() => expect(contou).toHaveBeenCalledWith(0));
  });
});
