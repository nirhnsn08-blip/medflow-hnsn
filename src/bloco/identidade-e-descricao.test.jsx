// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// AS DUAS CONFERÊNCIAS DO CARTÃO CONVIVEM
//
// 🔴 ESTE ARQUIVO É A PROVA DE UMA RESOLUÇÃO DE CONFLITO (09/10/2026).
//
// Dois PRs mexeram nos MESMOS três pontos do Bloco quase ao mesmo tempo:
//   • o #275 pôs a conferência de identidade (as iniciais digitadas no
//     agendamento contra o cadastro) — Meta 1 da OMS, item 1 do Sign In;
//   • o #273 pôs a descrição cirúrgica (CFM 1.638/2002).
//
// O conflito foi nos imports, no `refresh` e na lista de modais. Resolver
// conflito é fácil de fazer parecer certo: o arquivo compila, o lint passa,
// o build passa — e uma das duas funcionalidades sumiu da tela, porque um
// lado "venceu" o outro num trecho. Nenhum teste de antes pegaria isso: os
// testes do #275 passam sem a descrição, e os do #273 passam sem a
// identidade. Só um teste que exige AS DUAS no mesmo render pega.
//
// ⚠️ Não é teste de funcionalidade nova. É catraca de convivência.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import BlocoPage from "./BlocoPage.jsx";

afterEach(cleanup);

const USER = { name: "adauam", username: "adauam" };
const HOJE = new Date();
const p2 = n => String(n).padStart(2, "0");
const DIA = `${HOJE.getFullYear()}-${p2(HOJE.getMonth() + 1)}-${p2(HOJE.getDate())}`;

// Uma cirurgia que dispara as DUAS conferências ao mesmo tempo:
// operada e sem descrição, e com iniciais que não são as do cadastro.
const CIRURGIA = {
  id: 7, data: DIA, hora_prevista: "09:00", sala: "Sala 1",
  iniciais: "X.Y.Z.", prontuario: "T9060",
  procedimento: "Artroplastia total de joelho", procedimento_cod: "0301010072",
  status: "concluida",
  entrada_sala_em: `${DIA}T11:00:00Z`, inicio_cirurgia_em: `${DIA}T11:10:00Z`,
  fim_cirurgia_em: `${DIA}T12:30:00Z`, saida_sala_em: `${DIA}T12:40:00Z`,
  descricao_em: null,
};
const CADASTRO = { prontuario: "T9060", nome_completo: "Clara Lima Barbosa", iniciais: "C.L.B." };

function banco({ cirurgias = [CIRURGIA], pacientes = [CADASTRO], descricoes = [] } = {}) {
  return async (url, o) => {
    const tabela = String(url).split("?")[0];
    if (o?.method) return [{ id: 1 }];
    if (tabela === "cc_salas") return [{ nome: "Sala 1 — Geral", ordem: 1, ativa: true }];
    if (tabela === "cc_cirurgias") return cirurgias;
    if (tabela === "pacientes") return pacientes;
    if (tabela === "cc_descricao") return descricoes;
    return [];
  };
}

const abrir = sb => render(<BlocoPage sb={sb} currentUser={USER} canEdit />);

describe("🔴 identidade e descrição no mesmo cartão", () => {
  it("as DUAS conferências aparecem — nenhuma venceu a outra no merge", async () => {
    abrir(banco());
    // Do #275: o cartão compara as iniciais digitadas com o cadastro.
    await waitFor(() => expect(document.body.textContent).toMatch(/C\.L\.B\./));
    // Do #273: a descrição cirúrgica falta, e o cartão diz.
    expect(screen.getByRole("button", { name: /Escrever a descrição cirúrgica/ })).toBeTruthy();
    expect(document.body.textContent).toMatch(/SEM descrição cirúrgica/);
  });

  it("a faixa do passivo do dia continua somando", async () => {
    abrir(banco());
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/1 cirurgia\(s\) deste dia sem descrição cirúrgica/));
  });

  it("com a descrição registrada, o cartão troca o botão e cala o aviso", async () => {
    abrir(banco({ cirurgias: [{ ...CIRURGIA, descricao_em: `${DIA}T13:00:00Z` }] }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Ver \/ corrigir descrição cirúrgica/ })).toBeTruthy());
    expect(document.body.textContent).not.toMatch(/SEM descrição cirúrgica/);
  });

  it("🔴 as quatro leituras do dia saem na MESMA carga", async () => {
    // O `refresh` junta trilha, equipe, descrições e cadastros num
    // `Promise.all` só, e aplica o estado num render só. Com um `await`
    // solto no meio, a tela renderiza duas vezes a cada 30s e o segundo
    // render troca os nós do DOM sob o clique de quem está usando.
    const vistas = [];
    const sb = async (url, o) => {
      vistas.push(String(url).split("?")[0]);
      return banco()(url, o);
    };
    abrir(sb);
    await waitFor(() => expect(vistas).toContain("cc_descricao"));
    for (const t of ["cc_cirurgias", "cc_checklist", "cc_equipe", "cc_descricao", "pacientes"]) {
      expect(vistas, `faltou ler ${t}`).toContain(t);
    }
  });
});
