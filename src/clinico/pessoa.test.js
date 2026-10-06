// ═══════════════════════════════════════════════════════════
// A PESSOA, NÃO O NÚMERO — e a alergia que sumia depois de unificar
//
// 🔴 DEFEITO REAL: unificar prontuário gravava um ponteiro e NÃO movia dado
// clínico (decisão certa — prontuário não se reescreve). Mas quem lia
// continuava lendo por um número só, então a alergia registrada na ficha
// antiga sumia da prescrição e do alerta da farmácia da ficha que vale.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { agruparPorPessoa, numerosParaConsultar, indexarPorPessoa, centroDe } from "./pessoa.js";
import { carregarProntuariosDaPessoa } from "./pessoa-dados.js";
import { carregarAlergiasDaPessoa, carregarAlergiasDoPaciente } from "./alergias-dados.js";
import { naoDeuParaLer } from "../util/leitura.js";
import { alergiasDoPaciente } from "./contexto.js";

// A -> C e B -> C: duas fichas antigas unificadas na mesma pessoa.
const LINHAS = [
  { prontuario: "A1", unificado_para: "C9" },
  { prontuario: "B2", unificado_para: "C9" },
  { prontuario: "C9", unificado_para: null },
  { prontuario: "Z0", unificado_para: null },   // outra pessoa
];

describe("agruparPorPessoa", () => {
  it("o destino enxerga as origens", () => {
    expect(agruparPorPessoa(["C9"], LINHAS)).toEqual({ C9: ["A1", "B2", "C9"] });
  });

  it("a origem enxerga o destino E as outras origens", () => {
    // Quem abre a ficha antiga precisa ver o que foi registrado depois.
    expect(agruparPorPessoa(["A1"], LINHAS)).toEqual({ A1: ["A1", "B2", "C9"] });
  });

  it("quem não foi unificado continua sozinho", () => {
    expect(agruparPorPessoa(["Z0"], LINHAS)).toEqual({ Z0: ["Z0"] });
  });

  it("pessoas diferentes não se misturam", () => {
    const r = agruparPorPessoa(["A1", "Z0"], LINHAS);
    expect(r.A1).not.toContain("Z0");
    expect(r.Z0).toEqual(["Z0"]);
  });

  it("número perguntado que não veio nas linhas entra sozinho (e não some)", () => {
    expect(agruparPorPessoa(["X1"], LINHAS)).toEqual({ X1: ["X1"] });
  });

  it("centroDe: o destino quando unificado, ele mesmo quando não", () => {
    expect(centroDe({ prontuario: "A1", unificado_para: "C9" })).toBe("C9");
    expect(centroDe({ prontuario: "C9", unificado_para: null })).toBe("C9");
  });

  it("numerosParaConsultar junta tudo sem repetir", () => {
    expect(numerosParaConsultar(agruparPorPessoa(["A1", "Z0"], LINHAS))).toEqual(["A1", "B2", "C9", "Z0"]);
  });
});

describe("indexarPorPessoa — o mesmo registro visível pelos dois números", () => {
  const ALERGIA = { id: 1, prontuario: "A1", substancia: "Dipirona" };
  it("alergia gravada na ficha antiga aparece sob a que vale", () => {
    const por = indexarPorPessoa([ALERGIA], agruparPorPessoa(["C9"], LINHAS));
    expect(por.C9).toEqual([ALERGIA]);
  });
  it("e continua aparecendo sob a antiga", () => {
    const por = indexarPorPessoa([ALERGIA], agruparPorPessoa(["A1"], LINHAS));
    expect(por.A1).toEqual([ALERGIA]);
  });
  it("não vaza para outra pessoa", () => {
    const por = indexarPorPessoa([ALERGIA], agruparPorPessoa(["Z0"], LINHAS));
    expect(por.Z0).toBeUndefined();
  });
  it("o registro NÃO é copiado — é o mesmo objeto", () => {
    const por = indexarPorPessoa([ALERGIA], agruparPorPessoa(["C9"], LINHAS));
    expect(por.C9[0]).toBe(ALERGIA);
  });
});

/** Banco falso: `falhar` lista as tabelas que não respondem (null). */
function bancoFalso({ falhar = [], alergias = [] } = {}) {
  const pedidos = [];
  const sb = async (url) => {
    pedidos.push(url);
    const tabela = String(url).split("?")[0];
    if (falhar.includes(tabela)) return null;
    if (tabela === "pacientes") {
      const alvo = decodeURIComponent(url);
      return LINHAS.filter(l => alvo.includes(`"${l.prontuario}"`) ||
                                (l.unificado_para && alvo.includes(`"${l.unificado_para}"`)));
    }
    if (tabela === "pep_alergias") {
      const alvo = decodeURIComponent(url);
      return alergias.filter(a => alvo.includes(`"${a.prontuario}"`));
    }
    return [];
  };
  sb.pedidos = pedidos;
  return sb;
}

describe("carregarProntuariosDaPessoa", () => {
  it("resolve a família a partir da ficha antiga", async () => {
    const r = await carregarProntuariosDaPessoa(bancoFalso(), ["A1"]);
    expect(r.ok).toBe(true);
    expect(r.por.A1).toEqual(["A1", "B2", "C9"]);
  });

  it("🔴 falha de leitura NÃO vira 'esta pessoa tem um número só' sem aviso", async () => {
    const r = await carregarProntuariosDaPessoa(bancoFalso({ falhar: ["pacientes"] }), ["A1"]);
    expect(r.ok).toBe(false);
    expect(r.por.A1).toEqual(["A1"]);   // seguro: some histórico, não aparece de outra pessoa
  });

  it("não vai ao banco quando não há quem perguntar", async () => {
    const sb = bancoFalso();
    const r = await carregarProntuariosDaPessoa(sb, []);
    expect(r.ok).toBe(true);
    expect(sb.pedidos.length).toBe(0);
  });
});

describe("🔴 a alergia da ficha antiga chega na ficha que vale", () => {
  const ALERGIA = { id: 1, prontuario: "A1", substancia: "Dipirona", criado_em: "2026-01-01" };

  it("lendo o número que vale, a alergia registrada no antigo aparece", async () => {
    const idx = await carregarAlergiasDaPessoa(bancoFalso({ alergias: [ALERGIA] }), ["C9"]);
    expect(idx.falhou).toBe(false);
    expect(alergiasDoPaciente(idx, "C9")).toEqual([ALERGIA]);
  });

  it("e pelo caminho de um paciente só", async () => {
    const r = await carregarAlergiasDoPaciente(bancoFalso({ alergias: [ALERGIA] }), "C9");
    expect(r).toEqual([ALERGIA]);
  });

  it("🔴 falha ao resolver a família marca o índice como NÃO CONFERIDO", async () => {
    // Mostrar as alergias de um número só, sem saber se há outro, seria
    // afirmar "é isto que ela tem" sem ter perguntado.
    const idx = await carregarAlergiasDaPessoa(bancoFalso({ falhar: ["pacientes"], alergias: [ALERGIA] }), ["C9"]);
    expect(idx.falhou).toBe(true);
    expect(naoDeuParaLer(alergiasDoPaciente(idx, "C9"))).toBe(true);
  });

  it("🔴 falha ao ler as alergias também marca — e não devolve lista vazia", async () => {
    const r = await carregarAlergiasDoPaciente(bancoFalso({ falhar: ["pep_alergias"] }), "C9");
    expect(naoDeuParaLer(r)).toBe(true);
  });

  it("paciente sem alergia nenhuma continua respondendo lista vazia COMUM", async () => {
    const r = await carregarAlergiasDoPaciente(bancoFalso({ alergias: [] }), "Z0");
    expect(r).toEqual([]);
    expect(naoDeuParaLer(r)).toBe(false);
  });

  it("a consulta de alergias pede TODOS os números da pessoa", async () => {
    const sb = bancoFalso({ alergias: [ALERGIA] });
    await carregarAlergiasDaPessoa(sb, ["C9"]);
    const consulta = decodeURIComponent(sb.pedidos.find(u => u.startsWith("pep_alergias")));
    for (const n of ["A1", "B2", "C9"]) expect(consulta).toContain(`"${n}"`);
  });
});
