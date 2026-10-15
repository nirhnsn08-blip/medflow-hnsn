// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// OS LEITORES SEGUEM A PESSOA — e não só a regra pura
//
// `pessoa.test.js` prova a REGRA. Estes testes provam que os dois leitores
// que mais importam realmente a usam: o prontuário do internado (de onde sai
// o alerta da prescrição) e a fila da farmácia (de onde sai o alerta da
// dispensação). Sem isto, trocar a chamada de volta por `pep_alergias` de um
// número só passaria batido — e é exatamente o defeito que este PR conserta.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, cleanup, waitFor } from "@testing-library/react";
import { carregarProntuario } from "../prontuario/dados.js";
import { useAlergiasDosAtendimentos } from "./usar-alergias.js";
import { alergiasDoPaciente } from "./contexto.js";

afterEach(cleanup);

// A1 foi unificado em C9. A alergia está registrada no número ANTIGO.
const LINHAS = [
  { prontuario: "A1", unificado_para: "C9" },
  { prontuario: "C9", unificado_para: null },
];
const ALERGIA = { id: 1, prontuario: "A1", substancia: "Dipirona", criado_em: "2026-01-01" };

function bancoFalso() {
  const pedidos = [];
  const sb = async (url) => {
    pedidos.push(url);
    const tabela = String(url).split("?")[0];
    const alvo = decodeURIComponent(url);
    if (tabela === "pacientes" && alvo.includes("or=(")) {
      return LINHAS.filter(l => alvo.includes(`"${l.prontuario}"`) ||
                                (l.unificado_para && alvo.includes(`"${l.unificado_para}"`)));
    }
    if (tabela === "pacientes") return [{ prontuario: "C9", data_nascimento: "1990-01-01" }];
    if (tabela === "pep_alergias") return [ALERGIA].filter(a => alvo.includes(`"${a.prontuario}"`) || alvo.includes(`eq.${a.prontuario}`));
    return [];
  };
  sb.pedidos = pedidos;
  return sb;
}

describe("🔴 prontuário do internado: a alergia da ficha antiga chega", () => {
  it("abrindo C9, a alergia registrada em A1 vem junto", async () => {
    const sb = bancoFalso();
    const r = await carregarProntuario(sb, "C9");
    expect(r.alergias).toEqual([ALERGIA]);
  });

  it("e a família foi mesmo resolvida no banco", async () => {
    const sb = bancoFalso();
    await carregarProntuario(sb, "C9");
    expect(sb.pedidos.some(u => u.startsWith("pacientes?or=("))).toBe(true);
  });
});

function Sonda({ sb, atendimentos }) {
  const indice = useAlergiasDosAtendimentos(sb, atendimentos);
  const regs = alergiasDoPaciente(indice, "C9");
  return <div data-testid="r">{indice.carregando ? "carregando" : `${regs.length}:${regs.map(a => a.substancia).join(",")}`}</div>;
}

describe("🔴 fila da farmácia: o alerta usa a pessoa inteira", () => {
  it("o atendimento em C9 enxerga a alergia gravada em A1", async () => {
    const sb = bancoFalso();
    render(<Sonda sb={sb} atendimentos={[{ prontuario: "C9" }]} />);
    await waitFor(() => expect(document.querySelector("[data-testid=r]").textContent).toBe("1:Dipirona"));
  });

  it("enquanto carrega, ninguém conta como 'sem alergia'", () => {
    const sb = bancoFalso();
    render(<Sonda sb={sb} atendimentos={[{ prontuario: "C9" }]} />);
    expect(document.querySelector("[data-testid=r]").textContent).toBe("carregando");
  });
});
