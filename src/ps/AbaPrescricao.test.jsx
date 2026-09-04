// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// A ABA DE PRESCRIÇÃO DIZ QUANDO NÃO SABE
//
// 🔴 Catálogo, lotes e as bases de interação chegam como `FALHA` — lista
// vazia MARCADA — quando a leitura não volta. Antes de 04/09/2026 a aba não
// perguntava, e o silêncio produzia DUAS mentiras ao mesmo tempo:
//
//   · nenhum alerta de farmácia clínica aparecia. Nem o de "base
//     indisponível", porque ele exige dois medicamentos RECONHECIDOS para
//     disparar — e sem catálogo nenhum item é reconhecido.
//   · todo item era marcado "SEM ESTOQUE", porque saldo zero e saldo
//     desconhecido eram a mesma coisa.
//
// A primeira é a pior: prescrição sem alerta é a notícia que ninguém confere.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AbaPrescricao } from "./AbaPrescricao.jsx";
import { FALHA } from "../util/leitura.js";

const PACIENTE = { id: 77, iniciais: "J.N." };
const CTX = { idade: "", peso: "", clearance_renal: "", funcao_hepatica: "", alergias: "", em_sonda: false, gestante: false, comorbidades: [] };

function montar({ catalogo = [], lotes = [], interacoes = [], incompatY = [] } = {}) {
  const rascunho = {
    itens: [], setItens: () => {},
    form: { medId: "", dose_valor: "", dose_unidade: "mg", freqLabel: "8/8h (3x)", via: "VO", duracao: "", quantidade: "" }, setForm: () => {},
    obs: "", setObs: () => {},
    ctx: CTX, setCtx: () => {},
  };
  return render(
    <AbaPrescricao
      sb={async () => []} sbCru={null} paciente={PACIENTE} currentUser={{ name: "Dra. Ana" }}
      dados={{ catalogo, catById: {}, lotes, interacoes, incompatY, prescricoes: [], itensSalvos: [], saidas: [] }}
      rascunho={rascunho} busy={false} setBusy={() => {}} onAssinou={() => {}}
    />);
}

const temAviso = () => screen.queryAllByRole("alert").some(n => /INCOMPLETA/i.test(n.textContent));

describe("🔴 leitura que falhou × banco realmente vazio", () => {
  afterEach(cleanup);

  it("🔴 catálogo que NÃO deu para ler avisa que a tela está incompleta", () => {
    montar({ catalogo: FALHA });
    expect(temAviso()).toBe(true);
  });

  it("🔴 banco de verdade vazio NÃO avisa nada", () => {
    // A distinção inteira: `[]` comum é "perguntei e não há nenhum".
    montar({ catalogo: [], lotes: [], interacoes: [], incompatY: [] });
    expect(temAviso()).toBe(false);
  });

  it("qualquer uma das quatro bases que falhar já dispara o aviso", () => {
    for (const chave of ["catalogo", "lotes", "interacoes", "incompatY"]) {
      cleanup();
      montar({ [chave]: FALHA });
      expect(temAviso(), chave).toBe(true);
    }
  });

  it("⚠️ o aviso fala do que a pessoa perde, não do erro técnico", () => {
    montar({ lotes: FALHA });
    const txt = screen.getAllByRole("alert").map(n => n.textContent).join(" ");
    expect(txt).toMatch(/INCOMPLETA/);
    expect(txt).not.toMatch(/fetch|HTTP|[0-9]{3} error|undefined/i);
  });

  it("a aba continua funcionando com a base caída — avisa, não trava", () => {
    // Travar a prescrição porque uma consulta não voltou seria transformar
    // problema de rede em paciente sem medicamento.
    montar({ catalogo: FALHA, lotes: FALHA });
    expect(screen.getByText(/Nova prescrição/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Assinar prescrição/ })).toBeTruthy();
  });
});
