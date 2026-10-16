// ═══════════════════════════════════════════════════════════
// MAPA ISOMÉTRICO — testes do motor
//
// O que está travado aqui: a projeção, a ordem de desenho (sem ela o relevo
// some), a altura redundante com a cor (o canal que mantém o mapa legível em
// cinza e sob daltonismo), e o leito de status desconhecido que NÃO pode
// sumir do desenho.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  ESTADO, ALTURA, COR_TOKEN, ROTULO_ESTADO, estadoDoLeito,
  projetar, facesDoCubo, montarMapa, ordemDeDesenho, resumoDoMapa,
} from "./mapa3d.js";

const leito = (id, setor, status, extra = {}) => ({ identificacao: id, setor, status, ...extra });

describe("estadoDoLeito", () => {
  it("traduz o que o banco grava", () => {
    expect(estadoDoLeito({ status: "ocupado" })).toBe(ESTADO.OCUPADO);
    expect(estadoDoLeito({ status: "livre" })).toBe(ESTADO.LIVRE);
    expect(estadoDoLeito({ status: "higienizacao" })).toBe(ESTADO.HIGIENIZACAO);
    expect(estadoDoLeito({ status: "interditado" })).toBe(ESTADO.INTERDITADO);
  });

  it("aceita os sinônimos que outras tabelas usam", () => {
    expect(estadoDoLeito({ status: "disponivel" })).toBe(ESTADO.LIVRE);
    expect(estadoDoLeito({ status: "limpeza" })).toBe(ESTADO.HIGIENIZACAO);
    expect(estadoDoLeito({ status: "OCUPADO" })).toBe(ESTADO.OCUPADO);
  });

  it("🔴 status desconhecido NÃO some do mapa — vira bloco baixo e cinza", () => {
    // Sumir seria perder um leito real da contagem visual.
    expect(estadoDoLeito({ status: "reservado_xyz" })).toBe(ESTADO.INTERDITADO);
    expect(estadoDoLeito({})).toBe(ESTADO.INTERDITADO);
    expect(estadoDoLeito(null)).toBe(ESTADO.INTERDITADO);
  });
});

describe("a altura é o canal redundante da cor", () => {
  it("🔴 ocupado é sempre o mais alto e interditado o mais baixo", () => {
    // É o que mantém o mapa legível em cinza, impresso e sob daltonismo —
    // as cores de status ficam a ΔE 7,9 sob protanopia, no piso que só vale
    // COM codificação secundária.
    expect(ALTURA[ESTADO.OCUPADO]).toBeGreaterThan(ALTURA[ESTADO.HIGIENIZACAO]);
    expect(ALTURA[ESTADO.HIGIENIZACAO]).toBeGreaterThan(ALTURA[ESTADO.LIVRE]);
    expect(ALTURA[ESTADO.LIVRE]).toBeGreaterThan(ALTURA[ESTADO.INTERDITADO]);
  });

  it("todo estado tem cor e rótulo — nunca cor sozinha", () => {
    for (const e of Object.values(ESTADO)) {
      expect(COR_TOKEN[e], `${e} sem cor`).toBeTruthy();
      expect(ROTULO_ESTADO[e], `${e} sem rótulo`).toBeTruthy();
    }
  });
});

describe("projetar", () => {
  it("a origem fica na origem", () => {
    expect(projetar(0, 0, 0)).toEqual({ x: 0, y: 0 });
  });

  it("coluna empurra para a direita, linha para a esquerda", () => {
    expect(projetar(1, 0).x).toBeGreaterThan(0);
    expect(projetar(0, 1).x).toBeLessThan(0);
  });

  it("as duas descem na tela", () => {
    expect(projetar(1, 0).y).toBeGreaterThan(0);
    expect(projetar(0, 1).y).toBeGreaterThan(0);
  });

  it("altura levanta o bloco (y menor = mais acima)", () => {
    expect(projetar(2, 2, 1).y).toBeLessThan(projetar(2, 2, 0).y);
  });

  it("a diagonal volta ao mesmo x — é o que faz a grade fechar", () => {
    expect(projetar(3, 3).x).toBe(0);
  });
});

describe("facesDoCubo", () => {
  const f = facesDoCubo(0, 0, 1);

  it("desenha as três faces com quatro pontos cada", () => {
    for (const face of ["topo", "direita", "esquerda"]) {
      expect(f[face].split(" "), `${face}`).toHaveLength(4);
    }
  });

  it("o topo fica acima da base", () => {
    const topoY = Number(f.topo.split(" ")[0].split(",")[1]);
    const baseY = Number(facesDoCubo(0, 0, 0).topo.split(" ")[0].split(",")[1]);
    expect(topoY).toBeLessThan(baseY);
  });

  it("cubo mais alto tem face lateral mais alta", () => {
    const alturaDa = h => {
      const ys = facesDoCubo(0, 0, h).direita.split(" ").map(p => Number(p.split(",")[1]));
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(alturaDa(1)).toBeGreaterThan(alturaDa(0.22));
  });

  it("a âncora serve para pendurar rótulo no topo do cubo", () => {
    expect(f.ancora.y).toBeLessThan(facesDoCubo(0, 0, 0).ancora.y);
  });
});

describe("montarMapa", () => {
  const LEITOS = [
    leito("101", "Clínica Médica", "ocupado", { iniciais: "A.B.", prontuario: "1001" }),
    leito("102", "Clínica Médica", "livre"),
    leito("103", "Clínica Médica", "higienizacao"),
    leito("104", "Clínica Médica", "interditado"),
    leito("201", "UTI Adulto", "ocupado"),
    leito("202", "UTI Adulto", "ocupado"),
  ];
  const SETORES = [{ nome: "UTI Adulto", ordem: 1 }, { nome: "Clínica Médica", ordem: 2 }];

  it("um cubo por leito, agrupado por setor", () => {
    const m = montarMapa(LEITOS, SETORES);
    expect(m.cubos).toHaveLength(6);
    expect(m.blocos).toHaveLength(2);
    expect(m.blocos.map(b => b.setor)).toEqual(["UTI Adulto", "Clínica Médica"]);
  });

  it("🔴 a ordem é a do CADASTRO, não a da ocupação", () => {
    // Mapa que se reordena a cada leitura é mapa que ninguém decora.
    const m = montarMapa(LEITOS, [{ nome: "Clínica Médica", ordem: 1 }, { nome: "UTI Adulto", ordem: 2 }]);
    expect(m.blocos[0].setor).toBe("Clínica Médica");
  });

  it("conta certo dentro do bloco, e o interditado sai do denominador", () => {
    const cm = montarMapa(LEITOS, SETORES).blocos.find(b => b.setor === "Clínica Médica");
    expect(cm).toMatchObject({ total: 4, ocupados: 1, livres: 1, higienizacao: 1, interditados: 1 });
    expect(cm.operacionais).toBe(3);
    expect(cm.pct).toBe(33);   // 1 de 3
  });

  it("setor só com leito interditado não vira 0% (vira sem informação)", () => {
    const m = montarMapa([leito("X1", "Reforma", "interditado")], []);
    expect(m.blocos[0].pct).toBeNull();
  });

  it("leito sem setor aparece, e vai para o fim", () => {
    const m = montarMapa([...LEITOS, leito("999", null, "ocupado")], SETORES);
    expect(m.blocos[m.blocos.length - 1].setor).toBe("Sem setor");
    expect(m.cubos).toHaveLength(7);
  });

  it("os leitos saem em ordem natural de número (102 antes de 1002)", () => {
    const m = montarMapa([leito("1002", "A", "livre"), leito("102", "A", "livre")], []);
    expect(m.blocos[0].cubos.map(c => c.leito)).toEqual(["102", "1002"]);
  });

  it("quebra em fileiras conforme as colunas pedidas", () => {
    const muitos = [...Array(10)].map((_, i) => leito(`L${i}`, "A", "livre"));
    const m = montarMapa(muitos, [], { colunas: 4 });
    expect(m.blocos[0].fileiras).toBe(3);
    expect(m.blocos[0].cubos[4].linha).toBe(m.blocos[0].cubos[0].linha + 1);
  });

  it("setores não se encostam — há uma fileira de respiro entre blocos", () => {
    const m = montarMapa(LEITOS, SETORES);
    const [uti, cm] = m.blocos;
    expect(cm.linhaBase).toBeGreaterThan(uti.linhaBase + uti.fileiras);
  });

  it("o cubo carrega o paciente para o tooltip", () => {
    const c = montarMapa(LEITOS, SETORES).cubos.find(x => x.leito === "101");
    expect(c).toMatchObject({ iniciais: "A.B.", prontuario: "1001", rotulo: "Ocupado" });
  });

  it("hospital sem leito nenhum não gera viewBox quebrado", () => {
    const m = montarMapa([], []);
    expect(m.vazio).toBe(true);
    expect(m.viewBox).toMatch(/^\d/);
    expect(m.cubos).toEqual([]);
  });

  it("o viewBox cobre o desenho inteiro", () => {
    const m = montarMapa(LEITOS, SETORES);
    const [, , w, h] = m.viewBox.split(" ").map(Number);
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
  });
});

describe("ordemDeDesenho", () => {
  it("🔴 de trás para frente — sem isto o relevo some", () => {
    const m = montarMapa([
      leito("A", "S", "ocupado"), leito("B", "S", "ocupado"), leito("C", "S", "ocupado"),
    ], [], { colunas: 2 });
    const ordem = ordemDeDesenho(m.cubos);
    for (let i = 1; i < ordem.length; i++) {
      expect(ordem[i].profundidade).toBeGreaterThanOrEqual(ordem[i - 1].profundidade);
    }
  });

  it("não altera a lista original", () => {
    const m = montarMapa([leito("A", "S", "ocupado")], []);
    const antes = [...m.cubos];
    ordemDeDesenho(m.cubos);
    expect(m.cubos).toEqual(antes);
  });

  it("lista vazia não quebra", () => {
    expect(ordemDeDesenho([])).toEqual([]);
    expect(ordemDeDesenho(null)).toEqual([]);
  });
});

describe("resumoDoMapa", () => {
  it("conta o hospital inteiro e tira o interditado do denominador", () => {
    const m = montarMapa([
      leito("1", "A", "ocupado"), leito("2", "A", "ocupado"),
      leito("3", "A", "livre"), leito("4", "A", "interditado"),
    ], []);
    expect(resumoDoMapa(m)).toMatchObject({
      total: 4, operacionais: 3, ocupados: 2, livres: 1, interditados: 1, pct: 67,
    });
  });

  it("mapa vazio não devolve 0% de ocupação", () => {
    expect(resumoDoMapa(montarMapa([], [])).pct).toBeNull();
  });
});
