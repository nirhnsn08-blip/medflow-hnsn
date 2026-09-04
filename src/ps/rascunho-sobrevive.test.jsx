// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// O RASCUNHO DA PRESCRIÇÃO SOBREVIVE À TROCA DE ABA
//
// 🔴 POR QUE ISTO EXISTE, COM NOME E DATA
// Em 04/09/2026 a aba de Prescrição saiu de dentro do `AtendimentoModal`.
// As abas são renderizadas condicionalmente — `{aba === "x" && <Aba/>}` —,
// o que significa que trocar de aba DESMONTA a anterior e joga fora todo
// estado que ela guarde.
//
// Se os itens que o médico está montando morassem dentro da aba, este
// cenário apagaria trabalho sem uma palavra:
//
//   1. o médico adiciona três medicamentos
//   2. vai à aba Exames conferir uma creatinina antes de decidir a dose
//   3. volta para a Prescrição — e encontra o formulário vazio
//
// Nada quebraria, nada apareceria no console, nenhum teste de unidade
// ficaria vermelho. Ele simplesmente redigitaria — ou, pior, assinaria
// achando que já tinha adicionado.
//
// Por isso o rascunho mora no MODAL e desce por prop. Este teste é o que
// impede alguém de "simplificar" isso de volta para dentro da aba.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AtendimentoModal } from "./modais.jsx";

const MEDS = [
  { id: 1, nome: "Dipirona 500 mg comprimido", classe: "Analgésicos e antipiréticos", unidade: "cp", ativo: true, principio_ativo: "Dipirona" },
  { id: 2, nome: "Paracetamol 500 mg comprimido", classe: "Analgésicos e antipiréticos", unidade: "cp", ativo: true, principio_ativo: "Paracetamol" },
];
const LOTES = [{ id: 1, medicamento_id: 1, quantidade: 100 }, { id: 2, medicamento_id: 2, quantidade: 100 }];

const PACIENTE = { id: 77, iniciais: "J.N.", prontuario: "T9031", queixa: "Cefaleia", classificacao: "amarelo" };

/** `sb` falso: devolve o catálogo e os lotes, e lista vazia no resto. */
function bancoFalso() {
  return async caminho => {
    if (String(caminho).startsWith("farm_medicamentos")) return MEDS;
    if (String(caminho).startsWith("farm_lotes")) return LOTES;
    return [];
  };
}

const abrirAba = nome => fireEvent.click(screen.getByRole("button", { name: new RegExp("^" + nome, "i") }));

describe("🔴 o rascunho da prescrição não morre ao trocar de aba", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });
  // ⚠️ Sem `globals: true` no vitest, o testing-library NÃO limpa sozinho —
  // a segunda montagem encontraria duas telas e "found multiple elements".
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  async function montarComUmItem() {
    render(<AtendimentoModal sb={bancoFalso()} sbCru={null} paciente={{ ...PACIENTE }} currentUser={{ name: "Dra. Ana" }} onClose={() => {}} abaInicial="prescricao" />);
    // espera o catálogo chegar
    await waitFor(() => expect(screen.getByText("Dipirona 500 mg comprimido")).toBeTruthy());
    fireEvent.change(document.querySelector("select"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /Adicionar/ }));
  }

  it("🔴 item adicionado continua lá depois de ir à aba Exames e voltar", async () => {
    await montarComUmItem();
    // o item entrou no rascunho
    await waitFor(() => expect(screen.getAllByText(/Dipirona 500 mg comprimido/).length).toBeGreaterThan(1));

    abrirAba("Exames");
    expect(screen.queryByText(/Nova prescrição/)).toBeNull();   // a aba realmente desmontou

    abrirAba("Prescrição");
    await waitFor(() => expect(screen.getByText(/Nova prescrição/)).toBeTruthy());

    // 🔴 A ASSERÇÃO QUE IMPORTA: o item montado continua na tela.
    const linhas = screen.getAllByText(/Dipirona 500 mg comprimido/);
    expect(linhas.length).toBeGreaterThan(1);
  });

  it("a observação digitada também sobrevive", async () => {
    render(<AtendimentoModal sb={bancoFalso()} sbCru={null} paciente={{ ...PACIENTE }} currentUser={{ name: "Dra. Ana" }} onClose={() => {}} abaInicial="prescricao" />);
    await waitFor(() => expect(screen.getByPlaceholderText(/Observações \/ cuidados/)).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText(/Observações \/ cuidados/), { target: { value: "manter em jejum" } });

    abrirAba("Checagem");
    abrirAba("Prescrição");

    await waitFor(() => expect(screen.getByPlaceholderText(/Observações \/ cuidados/).value).toBe("manter em jejum"));
  });

  it("⚠️ o contexto clínico editado e NÃO salvo também sobrevive", async () => {
    // Peso e alergia digitados alimentam os alertas de farmácia clínica antes
    // mesmo de serem gravados. Perdê-los ao trocar de aba desligaria os
    // alertas em silêncio, que é o pior jeito de um alerta sumir.
    render(<AtendimentoModal sb={bancoFalso()} sbCru={null} paciente={{ ...PACIENTE }} currentUser={{ name: "Dra. Ana" }} onClose={() => {}} abaInicial="prescricao" />);
    await waitFor(() => expect(screen.getByText(/Contexto clínico/)).toBeTruthy());
    fireEvent.click(screen.getByText(/Contexto clínico/));
    fireEvent.change(screen.getByPlaceholderText(/penicilina/), { target: { value: "penicilina" } });

    await waitFor(() => expect(screen.getByText(/Paciente alérgico a/)).toBeTruthy());

    abrirAba("Evoluções");
    abrirAba("Prescrição");

    await waitFor(() => expect(screen.getByText(/Paciente alérgico a/)).toBeTruthy());
  });
});
