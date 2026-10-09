// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// 🔴 O CABEÇALHO DO PACIENTE 360 LIA A COLUNA GRAVADA
//
// ACHADO CAMINHANDO PELO DEMO em 09/10/2026, depois de os testes desta
// mesma frente estarem todos verdes: o prontuário T9060 ("Clara Lima
// Barbosa") abria como
//
//     E.A. · prontuário T9060
//
// — o número certo com o rótulo de outra pessoa, na tela que se chama
// "Registro Clínico Integrado". A lista de resultados logo acima já fazia
// `comoExibir(s) || s.iniciais`; só o cabeçalho tinha ficado para trás, e
// nenhum teste olhava para ele.
//
// É o mesmo defeito do mapa cirúrgico noutra tela, e a lição é a do repo:
// teste verde não cobre integração entre camadas — percorrer a tela é
// obrigatório.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, cleanup, screen, waitFor, fireEvent } from "@testing-library/react";
import Paciente360 from "./Paciente360.jsx";

afterEach(cleanup);

const USER = { name: "adauam", username: "adauam" };

/**
 * `sb` falso: responde o cadastro para `pacientes` e vazio para o resto.
 * O Paciente 360 carrega uma dúzia de tabelas; todas podem vir vazias.
 */
function banco(cadastro) {
  return async url => {
    const tabela = String(url).split("?")[0];
    if (tabela === "pacientes") return cadastro ? [cadastro] : [];
    return [];
  };
}

/** Abre a tela e busca o prontuário — é assim que a pessoa chega nela. */
async function abrir(cadastro) {
  render(<Paciente360 sb={banco(cadastro)} currentUser={USER} canEdit={true} />);
  fireEvent.change(screen.getByPlaceholderText(/Prontuário, nome, CPF/i), { target: { value: "T9060" } });
  fireEvent.click(screen.getByText("Buscar"));
  await waitFor(() => expect(screen.getByText(/prontuário T9060/)).toBeTruthy());
  return screen.getByText(/prontuário T9060/).closest("div");
}

// O caso real do demo.
const CLARA = {
  prontuario: "T9060", nome_completo: "Clara Lima Barbosa", iniciais: "E.A.",
  data_nascimento: "1975-05-02", sexo: "F",
};

describe("🔴 o cabeçalho mostra quem o cadastro diz que é", () => {
  it("nome Clara Lima Barbosa com E.A. gravadas: o cabeçalho diz C.L.B.", async () => {
    const cabecalho = await abrir(CLARA);
    expect(cabecalho.textContent).toContain("C.L.B.");
    expect(cabecalho.textContent).not.toContain("E.A.");
  });

  it("nome social tem precedência (Decreto 8.727/2016)", async () => {
    const cabecalho = await abrir({ ...CLARA, nome_social: "Clara Barbosa" });
    expect(cabecalho.textContent).toContain("C.B.");
  });

  // Órfão adotado pela migração do bloco: iniciais e nenhum nome. Derivar
  // devolveria "" — trocar um rótulo usável por nenhum.
  it("cadastro sem nome: a coluna gravada continua sendo a fonte", async () => {
    const cabecalho = await abrir({ prontuario: "T9060", iniciais: "J.P.", nome_completo: null });
    expect(cabecalho.textContent).toContain("J.P.");
  });
});
