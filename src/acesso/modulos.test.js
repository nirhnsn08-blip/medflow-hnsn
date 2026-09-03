// ═══════════════════════════════════════════════════════════
// O CATÁLOGO DE MÓDULOS SUSTENTA DUAS TELAS
//
// 🔴 POR QUE ESTE ARQUIVO EXISTE
// `grupo` existia em `modulos.js` desde sempre, e só a matriz de perfis o
// consumia. Quem configurava acesso via o sistema organizado; quem
// trabalhava nele via 17 itens em fila. Desde 28/08/2026 a barra lateral
// também lê daqui — e isso criou uma dependência silenciosa: um módulo com
// `grupo` fora de `GRUPOS` some das DUAS telas sem erro nenhum.
//
// Sumir sem erro é o modo de falha que esta casa persegue. Daí o teste.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MODULOS, GRUPOS, GRUPOS_ORFAOS, MODULO_POR_CHAVE } from "./modulos.js";

describe("🔴 todo módulo cai em um grupo conhecido", () => {
  it("nenhum órfão — órfão sumiria do menu E da matriz, em silêncio", () => {
    expect(GRUPOS_ORFAOS).toEqual([]);
  });

  it("e todo grupo declarado tem pelo menos um módulo", () => {
    // Grupo vazio desenharia um cabeçalho sem nada embaixo. A barra lateral
    // já pula grupo vazio em tempo de execução; aqui se garante que não
    // existe grupo vazio POR ENGANO, que é diferente de vazio por permissão.
    for (const g of GRUPOS) {
      expect(MODULOS.filter(m => m.grupo === g).length, `grupo "${g}" está vazio`).toBeGreaterThan(0);
    }
  });
});

describe("a ordem dos grupos é decidida, não herdada", () => {
  it("🔴 `GRUPOS` é lista explícita, não derivada da ordem de `MODULOS`", () => {
    // Quando era `[...new Set(MODULOS.map(m => m.grupo))]`, a ordem saía de
    // qual módulo aparecia primeiro no array — e `ambulatorio`, na terceira
    // posição, jogava "Receita e produção" para o topo do menu. A ordem da
    // navegação passava a depender de arrumação de lista.
    const derivada = [...new Set(MODULOS.map(m => m.grupo))];
    expect(GRUPOS).not.toEqual(derivada);
    expect(GRUPOS.indexOf("Atendimento")).toBeLessThan(GRUPOS.indexOf("Faturamento"));
  });

  it("abre no que é geral e fecha no que só a administração toca", () => {
    expect(GRUPOS[0]).toBe("Geral");
    expect(GRUPOS[GRUPOS.length - 1]).toBe("Apoio e TI");
  });
});

describe("os rótulos que a tela mostra", () => {
  it("⚠️ `overview` se chama pelo título que a própria tela usa", () => {
    // O item de menu dizia "Visão Geral" e a tela se intitulava "Centro de
    // Monitoramento". Duas palavras para a mesma porta, e a do menu era a
    // que prometia mais do que entregava — não é a visão geral do hospital,
    // é o painel de leitos.
    expect(MODULO_POR_CHAVE.overview.label).toBe("Centro de Monitoramento");
  });

  it("nenhum rótulo repetido — dois itens com o mesmo nome é o defeito de origem", () => {
    const rotulos = MODULOS.map(m => m.label);
    expect(new Set(rotulos).size).toBe(rotulos.length);
  });
});

describe("🔴 cada grupo é UMA classe de processo", () => {
  // Reorganizado em 03/09/2026. Os cinco grupos antigos misturavam trabalhos
  // que acontecem em mesas diferentes — e o usuário reclamou dos três, todos
  // de uma vez. Cada teste abaixo guarda uma das separações.
  const doGrupo = g => MODULOS.filter(m => m.grupo === g).map(m => m.chave);

  it("⚠️ a RECEPÇÃO não fica com o assistencial — é balcão, não é beira de leito", () => {
    // "Jornada do paciente" punha `atendimento` junto com PS, bloco e leitos.
    // Quem trabalha na recepção nunca abre os outros três.
    expect(doGrupo("Atendimento")).toContain("atendimento");
    expect(doGrupo("Clínica e assistencial")).not.toContain("atendimento");
  });

  it("⚠️ a FARMÁCIA não fica com o almoxarifado — são dois estoques e duas equipes", () => {
    // E são dois produtos vendáveis diferentes: farmácia tem conhecimento de
    // medicamento; almoxarifado é WMS e serve qualquer ramo.
    expect(doGrupo("Farmácia")).toContain("farmacia");
    expect(doGrupo("Materiais e logística")).toContain("suprimentos");
    expect(doGrupo("Farmácia")).not.toContain("suprimentos");
  });

  it("⚠️ o AMBULATÓRIO não fica com o faturamento — um é agenda, o outro é conta", () => {
    expect(doGrupo("Atendimento")).toContain("ambulatorio");
    expect(doGrupo("Faturamento")).not.toContain("ambulatorio");
  });

  it("o assistencial continua na ordem do trabalho: triado → operado → internado", () => {
    // A ordem dentro do grupo mora na barra lateral (App.jsx); o
    // PERTENCIMENTO mora aqui. Se um destes sair, a sequência some.
    const cl = doGrupo("Clínica e assistencial");
    for (const c of ["ps", "bloco", "leitos", "paciente"]) {
      expect(cl, `${c} deveria estar no assistencial`).toContain(c);
    }
  });

  it("⚠️ e o Faturamento é grupo PRÓPRIO — é depois da alta, e é outra mesa", () => {
    // Também é o que permite vendê-lo à parte: o grupo do menu e o módulo
    // licenciável são a mesma taxonomia.
    expect(MODULO_POR_CHAVE.faturamento.grupo).toBe("Faturamento");
  });
});

// ═══════════════════════════════════════════════════════════
// 🔴 A TAXONOMIA MORA EM UM LUGAR SÓ
//
// Em 03/09/2026 renomeei os grupos aqui e SEIS grupos inteiros sumiram da
// barra lateral — Atendimento, Clínica, Faturamento, Farmácia, Materiais e
// Apoio. Todos os 2.823 testes passaram verdes.
//
// A causa: o `App.jsx` declarava o grupo de cada item do menu numa string
// própria, duplicando esta lista. A barra filtra por `GRUPOS`, nenhum item
// batia mais, e cabeçalho sem item não desenha — some sem erro nenhum.
//
// O conserto foi estrutural (a barra lê `MODULO_POR_CHAVE[id].grupo`), e
// este teste impede a duplicação de voltar. Quem viu o defeito foi a tela;
// o que impede a volta é isto.
// ═══════════════════════════════════════════════════════════
describe("🔴 ninguém redeclara grupo fora do catálogo", () => {
  const app = readFileSync(
    join(process.cwd(), "src", "App.jsx"), "utf8");

  it("o App.jsx não declara `grupo:` com string literal", () => {
    const achados = app.match(/grupo:\s*"[^"]+"/g) || [];
    expect(achados, `o grupo do menu tem de vir de modulos.js, não de: ${achados.join(", ")}`).toEqual([]);
  });

  it("⚠️ e a isca prova que a busca funciona", () => {
    // Regex que deixou de casar passaria verde sem olhar nada.
    const isca = `{ grupo: "Jornada do paciente", id: "ps" }`;
    expect(isca.match(/grupo:\s*"[^"]+"/g)).toHaveLength(1);
  });
});

describe("🔴 a ordem do menu segue o caminho do trabalho", () => {
  // A ordem não é gosto: é o caminho do paciente, depois o dinheiro, depois
  // o apoio. É a mesma sequência do MV — o hospital já lê menu assim.
  const pos = g => GRUPOS.indexOf(g);

  it("a home abre o menu e não leva cabeçalho", () => {
    // "Geral" é a porta de entrada, não uma categoria. O renderizador omite
    // o cabeçalho dele de propósito (App.jsx); aqui se garante que ele é o
    // primeiro, senão a home apareceria no meio da lista.
    expect(GRUPOS[0]).toBe("Geral");
    expect(MODULO_POR_CHAVE.overview.grupo).toBe("Geral");
  });

  it("atende → trata → confere → fatura", () => {
    expect(pos("Atendimento")).toBeLessThan(pos("Clínica e assistencial"));
    expect(pos("Clínica e assistencial")).toBeLessThan(pos("Qualidade e vigilância"));
    expect(pos("Qualidade e vigilância")).toBeLessThan(pos("Faturamento"));
  });

  it("⚠️ a qualidade fica COLADA no assistencial — é o mesmo domínio", () => {
    // Uma faz, a outra confere. Separá-las por um grupo de outra natureza
    // (dinheiro, estoque) quebraria a leitura.
    expect(pos("Qualidade e vigilância") - pos("Clínica e assistencial")).toBe(1);
  });

  it("farmácia antes do almoxarifado — o que toca paciente vem primeiro", () => {
    // A farmácia decide dose, interação e alergia. O almoxarifado não toca
    // ninguém. Já era a regra da barra antiga e continua valendo.
    expect(pos("Farmácia")).toBeLessThan(pos("Materiais e logística"));
  });

  it("🔴 `print` NÃO ocupa a segunda posição do menu — é saída, não processo", () => {
    // Ficava em "Geral", o que lhe dava o lugar mais nobre da tela por
    // acidente do agrupamento antigo.
    expect(MODULO_POR_CHAVE.print.grupo).toBe("Apoio e TI");
  });

  it("o apoio fecha a lista", () => {
    expect(GRUPOS[GRUPOS.length - 1]).toBe("Apoio e TI");
  });
});
