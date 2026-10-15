// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// 🔴 A DIVERGÊNCIA DE INICIAIS APARECE NA FICHA DO PACIENTE
//
// `pacientes.iniciais` e `iniciaisDe(nome_completo)` são duas fontes de
// verdade para a mesma coisa, e divergem de fato no acervo: no banco demo o
// prontuário T9060 tem nome "Clara Lima Barbosa" e iniciais "E.A."
// gravadas. O Faturamento (que deriva) mostrava C.L.B. enquanto outras
// telas liam a coluna — a mesma pessoa com dois rótulos, calado.
//
// A decisão foi NÃO escolher por dedução: a divergência não diz qual dos
// dois campos é de outra pessoa. Então ela aparece aqui, onde há alguém com
// o documento na mão para decidir. O argumento inteiro está em
// identidade.js.
//
// Sem este arquivo, apagar o aviso da ficha não deixava teste vermelho — a
// regra pura continuaria coberta e a tela voltaria a ficar calada.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import CadastroPaciente from "./CadastroPaciente.jsx";

afterEach(cleanup);

const sbVazio = async () => [];
const USER = { name: "adauam", username: "adauam" };

// O caso real do demo.
const CLARA = {
  prontuario: "T9060", nome_completo: "Clara Lima Barbosa", iniciais: "E.A.",
  data_nascimento: "1980-05-02", sexo: "F",
};

const abrir = paciente => render(
  <CadastroPaciente sb={sbVazio} prontuario={paciente?.prontuario} paciente={paciente}
    canEdit={true} currentUser={USER} onSalvo={() => {}} onCancelar={() => {}} />);

describe("🔴 iniciais gravadas que não são as do nome", () => {
  it("a ficha acusa, com os DOIS valores", async () => {
    abrir(CLARA);
    const aviso = await screen.findByRole("alert");
    expect(aviso.textContent).toMatch(/E\.A\./);
    expect(aviso.textContent).toMatch(/C\.L\.B\./);
  });

  // Esta frase é o que separa este aviso de um alarme inútil: ele não
  // afirma que o nome está certo e as iniciais erradas. O sistema não sabe.
  it("diz que NÃO sabe qual dos dois campos está errado", async () => {
    abrir(CLARA);
    const aviso = await screen.findByRole("alert");
    expect(aviso.textContent).toMatch(/não tem como saber qual/i);
  });

  it("avisa que salvar recarimba as iniciais a partir do nome", async () => {
    abrir(CLARA);
    const aviso = await screen.findByRole("alert");
    expect(aviso.textContent).toMatch(/ao salvar/i);
  });

  it("quando conferem, nenhum aviso", () => {
    abrir({ ...CLARA, iniciais: "C.L.B." });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // Cadastro sem nome é o acervo adotado pela migração do bloco: iniciais
  // preenchidas e nome vazio. A coluna é a única fonte — acusar divergência
  // ali inventaria defeito onde há cadastro incompleto.
  it("cadastro sem nome não é divergência", () => {
    abrir({ prontuario: "T5", iniciais: "J.P.", nome_completo: "" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("corrigir o nome na tela faz o aviso sumir — o aviso acompanha o formulário", async () => {
    abrir(CLARA);
    await screen.findByRole("alert");
    fireEvent.change(screen.getByPlaceholderText("Como está no documento"),
      { target: { value: "Eduarda Alves" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ficha nova (sem paciente) não acusa nada", () => {
    abrir(null);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
