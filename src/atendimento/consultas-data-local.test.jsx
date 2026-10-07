// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// A DATA NA LISTA DE CONSULTAS
//
// 🔴 Este teste existe porque uma MUTAÇÃO PASSOU BATIDA. Ao consertar o dia
// civil em oito lugares, reintroduzi o defeito em cada um e exigi que um
// teste caísse. Caiu em sete. No oitavo — a cópia local do `dataBR` dentro
// de `Consultas.jsx` — a suíte inteira passou verde com o defeito de volta.
//
// E é a pior das oito para ficar descoberta: Consultas é a tela onde se
// procura o atendimento MESES DEPOIS, porque a conta não bateu ou o paciente
// reclamou. Se a data ali está um dia à frente, quem confere procura no dia
// errado e conclui que o atendimento não existe.
//
// O defeito: `new Date(String(chegada_em).slice(0, 10) + "T00:00:00")` lê o
// dia em UTC. Chegada às 22h de 05/10 chega do banco como
// "2026-10-06T01:00:00+00:00" e a tela escrevia 06/10.
//
// ⚠️ Só vale com o fuso fixado em vite.config.js — em UTC passa com o
// defeito de volta.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import Consultas from "./Consultas.jsx";

afterEach(cleanup);

// Chegada às 22:00 de 05/10/2026 em Brasília, como o banco devolve.
const CHEGADA_22H = "2026-10-06T01:00:00+00:00";

const EPISODIO = {
  id: 318,
  prontuario: "1024",
  chegada_em: CHEGADA_22H,
  tipo_atendimento: "ambulatorial",
  especialidade_cod: "cardio",
  convenio_id: null,
  medico: "Dra. Ana",
  status: "finalizado",
  desfecho: "atendido",
  desfecho_em: "2026-10-06T02:00:00+00:00",
};

function bancoFalso() {
  return async (url) => {
    const tabela = String(url).split("?")[0];
    if (tabela === "ps_atendimentos") return [EPISODIO];
    return [];
  };
}

async function procurarPorNumero() {
  render(<Consultas sb={bancoFalso()} currentUser={{ name: "T", username: "t" }} />);
  fireEvent.click(screen.getByText("Por número"));
  fireEvent.change(screen.getByPlaceholderText(/Ex\.: 72/), { target: { value: "318" } });
  fireEvent.click(screen.getByText("Procurar"));
  return screen.findByText(/Atendimento #318/);
}

describe("Consultas — a data do episódio", () => {
  it("🔴 a chegada das 22h aparece no dia em que o paciente chegou", async () => {
    await procurarPorNumero();
    expect(screen.getByText("05/10/2026")).toBeTruthy();
    expect(screen.queryByText("06/10/2026")).toBeNull();
  });
});
