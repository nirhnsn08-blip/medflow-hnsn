// ═══════════════════════════════════════════════════════════
// QUAIS ABAS DA FARMÁCIA ESTA PESSOA VÊ
//
// 🔴 A trava do Livro de Controlados nasceu como `.filter()` inline no
// App.jsx. Desligá-la passava nos 2.007 testes sem uma reclamação — o
// App.jsx está fora do `telas.test.jsx`, que exige sessão e Supabase.
// Trava de acesso que ninguém guarda volta a abrir na próxima refatoração.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { abasVisiveis, podeAbrirAba, ABA_RESTRITA } from "./abas.js";

const NAV = [
  { key: "dashboard", label: "Dashboard" },
  { key: "estoque", label: "Estoque" },
  { key: "controlados", label: "Controlados" },
  { key: "indicadores", label: "Indicadores" },
];

describe("🔴 o Livro de Controlados só aparece para quem pode", () => {
  it("some para quem não tem o módulo", () => {
    const v = abasVisiveis(NAV, { podeControlados: false }).map(a => a.key);
    expect(v).not.toContain("controlados");
    expect(v).toEqual(["dashboard", "estoque", "indicadores"]);
  });

  it("aparece para quem tem", () => {
    expect(abasVisiveis(NAV, { podeControlados: true }).map(a => a.key)).toContain("controlados");
  });

  it("🔴 e o SILÊNCIO de quem chama NÃO é permissão", () => {
    // É o contrário do padrão do menu, onde `verModulo` falha ABERTO porque
    // esconder módulo por engano trava alguém no plantão. O livro é
    // documento fiscalizável e não é trabalho de beira de leito: ninguém
    // para de atender porque ele demorou a aparecer.
    expect(abasVisiveis(NAV, {}).map(a => a.key)).not.toContain("controlados");
    expect(abasVisiveis(NAV).map(a => a.key)).not.toContain("controlados");
    expect(abasVisiveis(NAV, { podeControlados: undefined }).map(a => a.key)).not.toContain("controlados");
  });

  it("⚠️ nem valor que só PARECE verdadeiro", () => {
    // `"leitura"`, `1`, `"sim"` são verdadeiros em JavaScript e nenhum deles
    // é uma decisão de acesso. Só o booleano `true` abre.
    for (const quase of ["leitura", 1, "sim", {}, []]) {
      expect(abasVisiveis(NAV, { podeControlados: quase }).map(a => a.key),
        `${JSON.stringify(quase)} não deveria abrir`).not.toContain("controlados");
    }
  });

  it("as outras abas nunca são tocadas", () => {
    for (const p of [true, false, undefined]) {
      const v = abasVisiveis(NAV, { podeControlados: p }).map(a => a.key);
      expect(v).toContain("dashboard");
      expect(v).toContain("estoque");
      expect(v).toContain("indicadores");
    }
  });
});

describe("a segunda pergunta, na hora de abrir", () => {
  it("⚠️ estado sobrevive a mudança de permissão no meio da sessão", () => {
    // A barra já escondeu o que não pode. Mas `sub` é estado: sem esta
    // segunda pergunta, quem estivesse com o livro aberto continuaria com
    // ele aberto depois de perder o acesso.
    expect(podeAbrirAba("controlados", { podeControlados: false })).toBe(false);
    expect(podeAbrirAba("controlados", {})).toBe(false);
    expect(podeAbrirAba("controlados", { podeControlados: true })).toBe(true);
  });

  it("e não estorva as outras", () => {
    expect(podeAbrirAba("estoque", { podeControlados: false })).toBe(true);
    expect(podeAbrirAba("dashboard", {})).toBe(true);
  });
});

describe("a chave da aba restrita", () => {
  it("é uma só, e está nomeada", () => {
    // Se a chave mudar no FARM_NAV e não aqui, a trava para de casar e a
    // aba reaparece — em silêncio, que é como esta falha nasceu.
    expect(ABA_RESTRITA).toBe("controlados");
  });
});
