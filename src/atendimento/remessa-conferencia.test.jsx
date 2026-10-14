// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// O PAINEL MOSTRA O QUE A REGRA APUROU
//
// 🔴 As regras estão provadas por fronteira e por mutação em
// `remessa-conferencia.test.js` — 28 casos, 13 mutações. O que aquilo NÃO
// prova é se a TELA mostra o resultado: ligar a regra à tela é onde moraram
// os cinco defeitos achados caminhando no demo em 13–14/10 (a aba travada
// no StrictMode, o crachá apagado, a falha virando zero).
//
// Então aqui se renderiza o painel de verdade e se lê o que aparece.
//
// ⚠️ O caso base é o do DEMO, conferido na caminhada: conta AIH da
// competência 2026-09, sem CID e com executante sem CBO.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import { RegistrarRemessa } from "./FaturamentoSus.jsx";

afterEach(cleanup);

const USER = { name: "Ana Souza" };
const CNS_OK = "898000000000002";

const CONTA = {
  id: 1, prontuario: "T9060", atendimento_id: 279,
  via: "aih", status: "fechada", competencia: "2026-09",
};

/**
 * Um `sb` que responde por tabela. `pacientes`, `ps_atendimentos` e
 * `at_conta_itens` são o que `dadosDaConferencia` pede.
 */
function banco({ contas = [CONTA], pacientes = [], atendimentos = [], itens = [] } = {}) {
  return async (caminho) => {
    if (caminho.startsWith("at_contas")) return contas;
    if (caminho.startsWith("pacientes")) return pacientes;
    if (caminho.startsWith("ps_atendimentos")) return atendimentos;
    if (caminho.startsWith("at_conta_itens")) return itens;
    return [];
  };
}

const painel = sb =>
  render(<RegistrarRemessa sb={sb} currentUser={USER} competenciaAtual="2026-09" />);

describe("🔴 o painel acusa o que o SUS vai recusar, antes do botão", () => {
  it("o caso do demo: AIH sem CID e com executante sem CBO", async () => {
    painel(banco({
      pacientes: [{
        prontuario: "T9060", cns: CNS_OK, raca_cor: "parda",
        end_municipio_ibge: "4106902", data_nascimento: "1980-05-10",
        sexo: "F", nome_mae: "Maria",
      }],
      atendimentos: [{ id: 279, cid: "" }],
      itens: [{ conta_id: 1, codigo: "0301010072", executante: "Dra. Ana", executante_cbo: "" }],
    }));

    await waitFor(() => expect(screen.getByText(/1 de 1 conta será recusada/)).toBeTruthy());
    expect(screen.getAllByText(/CID principal/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/CBO do executante/).length).toBeGreaterThan(0);
  });

  it("🔴 diz ONDE se conserta — quem transmite não é quem cadastra", async () => {
    painel(banco({
      pacientes: [{ prontuario: "T9060", cns: CNS_OK, raca_cor: "", end_municipio_ibge: "4106902",
                    data_nascimento: "1980-05-10", sexo: "F", nome_mae: "Maria" }],
      atendimentos: [{ id: 279, cid: "I21" }],
      itens: [{ conta_id: 1, codigo: "03", executante: "X", executante_cbo: "225125" }],
    }));
    await waitFor(() => expect(screen.getAllByText(/raça\/cor/).length).toBeGreaterThan(0));
    expect(screen.getByText(/Conserta-se no cadastro do paciente/)).toBeTruthy();
  });

  it("🔴 NUNCA escreve 'pronto para transmitir'", async () => {
    // O sistema não gera o arquivo e não tem o layout — não pode prometer
    // aceitação. Diz o que recusa, e diz que isso não é garantia.
    painel(banco({
      pacientes: [{ prontuario: "T9060", cns: CNS_OK, raca_cor: "parda", end_municipio_ibge: "4106902",
                    data_nascimento: "1980-05-10", sexo: "F", nome_mae: "Maria" }],
      atendimentos: [{ id: 279, cid: "I21" }],
      itens: [{ conta_id: 1, codigo: "03", executante: "X", executante_cbo: "225125" }],
    }));
    await waitFor(() => expect(screen.getByText(/não é garantia de aceitação/)).toBeTruthy());
    expect(screen.queryByText(/pronto para transmitir/i)).toBeNull();
  });

  it("🔴 leitura que falhou NÃO vira 'nenhuma pendência'", async () => {
    // Seria o sistema liberando a transmissão porque não conseguiu olhar.
    const meio = async (caminho) => {
      if (caminho.startsWith("at_contas")) return [CONTA];
      return null;    // o cadastro não desceu
    };
    painel(meio);
    await waitFor(() => expect(screen.getByText(/INCOMPLETA/)).toBeTruthy());
    expect(screen.queryByText(/sem motivo conhecido/)).toBeNull();
  });

  it("sem conta fechada o painel não aparece — e quem explica é o erro de cima", async () => {
    // Repetir a mesma frase em dois lugares é a forma mais silenciosa de
    // ensinar alguém a não ler nenhum dos dois.
    painel(banco({ contas: [] }));
    await waitFor(() => expect(screen.getByText(/Nenhuma conta fechada nesta seleção/)).toBeTruthy());
    expect(screen.queryByText(/será recusada/)).toBeNull();
    expect(screen.queryByText(/não é garantia/)).toBeNull();
  });

  it("conta sem cadastro casado aparece, não passa limpa", async () => {
    painel(banco({
      pacientes: [], atendimentos: [{ id: 279, cid: "I21" }],
      itens: [{ conta_id: 1, codigo: "03", executante: "X", executante_cbo: "225125" }],
    }));
    await waitFor(() => expect(screen.getByText(/Não encontrei o cadastro do prontuário T9060/)).toBeTruthy());
  });
});

describe("a conferência não rebusca o banco à toa", () => {
  it("🔴 digitar o protocolo não dispara consulta nova", async () => {
    // A dependência do efeito é a lista de IDS em texto, não o array — que
    // o `useMemo` recria a cada render. Sem isso, cada tecla no protocolo
    // faria três consultas ao banco.
    const chamadas = [];
    const sb = async (caminho) => {
      chamadas.push(caminho);
      if (caminho.startsWith("at_contas")) return [CONTA];
      if (caminho.startsWith("pacientes")) return [{ prontuario: "T9060", cns: CNS_OK, raca_cor: "parda",
        end_municipio_ibge: "4106902", data_nascimento: "1980-05-10", sexo: "F", nome_mae: "M" }];
      if (caminho.startsWith("ps_atendimentos")) return [{ id: 279, cid: "I21" }];
      return [{ conta_id: 1, codigo: "03", executante: "X", executante_cbo: "225125" }];
    };
    painel(sb);
    await waitFor(() => expect(screen.getByText(/não é garantia de aceitação/)).toBeTruthy());
    const depoisDeCarregar = chamadas.filter(c => c.startsWith("pacientes")).length;

    const campo = screen.getByPlaceholderText(/opcional/);
    for (const ch of "ABC") {
      campo.value += ch;
      campo.dispatchEvent(new Event("input", { bubbles: true }));
    }
    await new Promise(r => setTimeout(r, 60));
    expect(chamadas.filter(c => c.startsWith("pacientes")).length).toBe(depoisDeCarregar);
  });
});
