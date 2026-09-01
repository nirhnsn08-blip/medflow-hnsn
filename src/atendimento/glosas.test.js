// ═══════════════════════════════════════════════════════════
// GLOSA RECEBIDA — O QUE NÃO PODE ERRAR
//
// Duas coisas aqui custam dinheiro de verdade, e nenhuma das duas dá erro
// na tela quando quebra:
//
//   1. Glosa que some da fila. Prazo perdido não volta — não há segunda
//      chance, e ninguém é avisado.
//   2. Taxa de recuperação mentindo. Ela é o número que diz se o setor de
//      faturamento está funcionando; errada, ou esconde um problema ou
//      inventa um que não existe.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  SITUACOES, SITUACOES_ABERTAS, DIAS_CRITICO, DIAS_ATENCAO,
  diasAteOPrazo, estadoDoPrazo, filaDeTrabalho, resumoGlosas, porMotivo, recusasDaGlosa,
} from "./glosas.js";
import { listaLida } from "../util/leitura.js";

const HOJE = new Date(2026, 8, 1);          // 01/09/2026
const dia = n => {
  const d = new Date(2026, 8, 1 + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const g = (o = {}) => ({ conta_id: 1, valor_glosado: 100, recebida_em: dia(-10), situacao: "recebida", ...o });

describe("diasAteOPrazo", () => {
  it("conta os dias que faltam", () => {
    expect(diasAteOPrazo(g({ prazo_recurso_em: dia(5) }), HOJE)).toBe(5);
  });

  it("hoje é zero, e zero ainda dá tempo", () => {
    // Zero NÃO é vencido: o prazo é até o fim do dia. Tratar como vencido
    // faria a tela desistir de uma glosa que ainda pode ser recorrida.
    expect(diasAteOPrazo(g({ prazo_recurso_em: dia(0) }), HOJE)).toBe(0);
    expect(estadoDoPrazo(g({ prazo_recurso_em: dia(0) }), HOJE)).toBe("critico");
  });

  it("prazo passado dá negativo", () => {
    expect(diasAteOPrazo(g({ prazo_recurso_em: dia(-3) }), HOJE)).toBe(-3);
  });

  it("🔴 sem prazo devolve null, e null NÃO é 'muito tempo'", () => {
    expect(diasAteOPrazo(g({ prazo_recurso_em: null }), HOJE)).toBe(null);
    expect(diasAteOPrazo(g({ prazo_recurso_em: "" }), HOJE)).toBe(null);
  });

  it("data ilegível não vira 'ok' silenciosamente", () => {
    // NaN caindo num `else` foi exatamente o defeito da validade de lote
    // na farmácia: lote vencido aparecia como lote bom.
    expect(diasAteOPrazo(g({ prazo_recurso_em: "trinta de setembro" }), HOJE)).toBe(null);
  });

  it("⚠️ aceita timestamp completo, não só data", () => {
    expect(diasAteOPrazo(g({ prazo_recurso_em: `${dia(4)}T13:45:00Z` }), HOJE)).toBe(4);
  });
});

describe("🔴 estadoDoPrazo — três estados, não dois", () => {
  it("sem prazo é estado PRÓPRIO, nem ok nem vencido", () => {
    // Esta é a regra inteira. Uma glosa sem prazo informado pode estar
    // vencendo hoje; classificá-la como "ok" é ausência de dado lida como
    // boa notícia — a família de defeito mais cara deste sistema.
    const e = estadoDoPrazo(g({ prazo_recurso_em: null }), HOJE);
    expect(e).toBe("sem_prazo");
    expect(e).not.toBe("ok");
    expect(e).not.toBe("vencido");
  });

  it("vencido, crítico, atenção e ok nas fronteiras", () => {
    expect(estadoDoPrazo(g({ prazo_recurso_em: dia(-1) }), HOJE)).toBe("vencido");
    expect(estadoDoPrazo(g({ prazo_recurso_em: dia(DIAS_CRITICO) }), HOJE)).toBe("critico");
    expect(estadoDoPrazo(g({ prazo_recurso_em: dia(DIAS_CRITICO + 1) }), HOJE)).toBe("atencao");
    expect(estadoDoPrazo(g({ prazo_recurso_em: dia(DIAS_ATENCAO) }), HOJE)).toBe("atencao");
    expect(estadoDoPrazo(g({ prazo_recurso_em: dia(DIAS_ATENCAO + 1) }), HOJE)).toBe("ok");
  });

  it("⚠️ glosa ENCERRADA não tem prazo urgente, mesmo com data vencida", () => {
    // Fadiga de alarme: glosa já recuperada com prazo velho continuaria
    // vermelha para sempre, e em pouco tempo ninguém olha mais a cor.
    for (const s of ["recuperada", "perdida", "aceita"]) {
      expect(estadoDoPrazo(g({ situacao: s, prazo_recurso_em: dia(-30) }), HOJE), s).toBe("encerrada");
    }
  });

  it("situação desconhecida não vira urgência", () => {
    expect(estadoDoPrazo(g({ situacao: "inventada" }), HOJE)).toBe("encerrada");
  });
});

describe("🔴 filaDeTrabalho — quem some daqui perde o prazo", () => {
  const glosas = [
    g({ id: 1, prazo_recurso_em: dia(30) }),                    // ok
    g({ id: 2, prazo_recurso_em: dia(-2) }),                    // vencido
    g({ id: 3, prazo_recurso_em: null }),                       // sem prazo
    g({ id: 4, prazo_recurso_em: dia(3) }),                     // critico
    g({ id: 5, prazo_recurso_em: dia(10) }),                    // atencao
    g({ id: 6, prazo_recurso_em: dia(-9), situacao: "recuperada" }), // encerrada
  ];

  it("só o que está em aberto entra", () => {
    expect(filaDeTrabalho(glosas, HOJE).map(x => x.id)).not.toContain(6);
  });

  it("ordena do mais urgente ao menos", () => {
    expect(filaDeTrabalho(glosas, HOJE).map(x => x.id)).toEqual([2, 3, 4, 5, 1]);
  });

  it("🔴 SEM PRAZO fica no TOPO, logo depois do vencido", () => {
    // Se a ordenação fosse por data com nulo no fim, a glosa sobre a qual
    // não se sabe nada iria para o rodapé e sumiria de vista.
    const pos = filaDeTrabalho(glosas, HOJE).findIndex(x => x.id === 3);
    expect(pos).toBe(1);
  });

  it("empate de prazo desempata pelo VALOR maior", () => {
    const iguais = [
      g({ id: "a", valor_glosado: 50, prazo_recurso_em: dia(2) }),
      g({ id: "b", valor_glosado: 900, prazo_recurso_em: dia(2) }),
    ];
    expect(filaDeTrabalho(iguais, HOJE).map(x => x.id)).toEqual(["b", "a"]);
  });

  it("⚠️ lista que não deu para ler não vira fila vazia silenciosa", () => {
    // `filaDeTrabalho(null)` devolve [] — mas a MARCA de falha se perde no
    // filtro, então quem chama tem que perguntar ANTES. O teste existe para
    // travar a expectativa: aqui não há proteção mágica.
    expect(filaDeTrabalho(null, HOJE)).toEqual([]);
    expect(listaLida(null).length).toBe(0);
  });

  it("não muta a lista recebida", () => {
    const orig = [g({ id: 1, prazo_recurso_em: dia(9) })];
    const copia = JSON.parse(JSON.stringify(orig));
    filaDeTrabalho(orig, HOJE);
    expect(orig).toEqual(copia);
  });
});

describe("🔴 resumoGlosas — a taxa de recuperação não pode mentir", () => {
  it("soma glosado, recuperado e em aberto", () => {
    const r = resumoGlosas([
      g({ valor_glosado: 100, situacao: "recebida" }),
      g({ valor_glosado: 200, situacao: "recuperada", valor_recuperado: 150 }),
      g({ valor_glosado: 300, situacao: "perdida", valor_recuperado: 0 }),
    ], HOJE);
    expect(r.valorGlosado).toBe(600);
    expect(r.valorEmAberto).toBe(100);
    expect(r.valorRecuperado).toBe(150);
  });

  it("🔴 o DENOMINADOR é o encerrado, não o glosado", () => {
    // 150 de 500 encerrados = 30%. Se o denominador fosse o total glosado
    // (600), daria 25% — e cairia mais ainda a cada glosa nova que chegasse,
    // ou seja, o número pioraria justamente quando o setor trabalha mais.
    const r = resumoGlosas([
      g({ valor_glosado: 100, situacao: "recebida" }),
      g({ valor_glosado: 200, situacao: "recuperada", valor_recuperado: 150 }),
      g({ valor_glosado: 300, situacao: "perdida", valor_recuperado: 0 }),
    ], HOJE);
    expect(r.glosadoEncerrado).toBe(500);
    expect(r.taxaRecuperacao).toBeCloseTo(30, 6);
  });

  it("🔴 sem nada encerrado a taxa é null, NÃO zero", () => {
    // "Ainda não terminamos nenhum recurso" e "recorremos e não voltou
    // nada" são fatos opostos. Zero por cento acusaria o setor de fracasso
    // no primeiro dia de uso.
    const r = resumoGlosas([g({ situacao: "recebida" })], HOJE);
    expect(r.taxaRecuperacao).toBe(null);
    expect(r.taxaRecuperacao).not.toBe(0);
  });

  it("⚠️ recurso em andamento (recuperado null) não conta como derrota", () => {
    const r = resumoGlosas([
      g({ valor_glosado: 400, situacao: "recurso_enviado", valor_recuperado: null }),
      g({ valor_glosado: 100, situacao: "recuperada", valor_recuperado: 100 }),
    ], HOJE);
    expect(r.glosadoEncerrado).toBe(100);
    expect(r.taxaRecuperacao).toBe(100);
  });

  it("conta vencidas, críticas e sem prazo separadamente", () => {
    const r = resumoGlosas([
      g({ prazo_recurso_em: dia(-1) }),
      g({ prazo_recurso_em: dia(2) }),
      g({ prazo_recurso_em: null }),
      g({ prazo_recurso_em: dia(60) }),
    ], HOJE);
    expect([r.vencidas, r.criticas, r.semPrazo, r.abertas]).toEqual([1, 1, 1, 4]);
  });

  it("⚠️ valor lixo não envenena a soma com NaN", () => {
    const r = resumoGlosas([
      g({ valor_glosado: "abc" }),
      g({ valor_glosado: null }),
      g({ valor_glosado: 50 }),
    ], HOJE);
    expect(r.valorGlosado).toBe(50);
    for (const v of Object.values(r)) expect(Number.isNaN(v)).toBe(false);
  });

  it("lista vazia devolve zeros e taxa null, sem estourar", () => {
    const r = resumoGlosas([], HOJE);
    expect(r.total).toBe(0);
    expect(r.taxaRecuperacao).toBe(null);
    expect(JSON.stringify(r)).not.toMatch(/NaN|Infinity/);
  });
});

describe("porMotivo", () => {
  it("agrupa e ordena pelo que mais custa", () => {
    const r = porMotivo([
      g({ motivo_codigo: "A1", valor_glosado: 10 }),
      g({ motivo_codigo: "B2", valor_glosado: 500 }),
      g({ motivo_codigo: "A1", valor_glosado: 90 }),
    ]);
    expect(r.map(x => x.motivo)).toEqual(["B2", "A1"]);
    expect(r[1].quantidade).toBe(2);
    expect(r[1].valor).toBe(100);
  });

  it("⚠️ glosa sem motivo não some do agrupamento", () => {
    // Sem isto, o motivo mais comum de todos — "a operadora não disse" —
    // ficaria invisível justamente na tela feita para atacar causas.
    const r = porMotivo([g({ motivo_codigo: null, motivo: null, valor_glosado: 70 })]);
    expect(r).toHaveLength(1);
    expect(r[0].motivo).toBe("(sem motivo informado)");
    expect(r[0].valor).toBe(70);
  });
});

describe("recusasDaGlosa — espelha os CHECK do banco", () => {
  it("glosa boa passa", () => {
    expect(recusasDaGlosa(g({ prazo_recurso_em: dia(20) }))).toEqual([]);
  });

  it("🔴 não se recupera mais do que foi glosado", () => {
    // Sem isto, erro de digitação vira receita inventada no relatório — e
    // some do caixa meses depois, na conferência do contador.
    const r = recusasDaGlosa(g({ valor_glosado: 100, valor_recuperado: 150 }));
    expect(r.join(" ")).toMatch(/não se recupera mais/i);
  });

  it("recuperar exatamente o glosado é permitido", () => {
    expect(recusasDaGlosa(g({ valor_glosado: 100, valor_recuperado: 100 }))).toEqual([]);
  });

  it("recuperar ZERO é permitido — é derrota registrada, não erro", () => {
    expect(recusasDaGlosa(g({ valor_glosado: 100, valor_recuperado: 0 }))).toEqual([]);
  });

  it("valor zero ou negativo é recusado", () => {
    expect(recusasDaGlosa(g({ valor_glosado: 0 })).length).toBeGreaterThan(0);
    expect(recusasDaGlosa(g({ valor_glosado: -5 })).length).toBeGreaterThan(0);
  });

  it("sem data de recebimento não há de quando contar o prazo", () => {
    expect(recusasDaGlosa(g({ recebida_em: null })).join(" ")).toMatch(/prazo/i);
  });

  it("prazo antes do recebimento é recusado", () => {
    const r = recusasDaGlosa(g({ recebida_em: dia(0), prazo_recurso_em: dia(-1) }));
    expect(r.join(" ")).toMatch(/anterior ao recebimento/i);
  });

  it("recurso enviado antes de a glosa chegar é recusado", () => {
    const r = recusasDaGlosa(g({ recebida_em: dia(0), recurso_enviado_em: dia(-1) }));
    expect(r.join(" ")).toMatch(/antes de a glosa chegar/i);
  });

  it("situação fora da lista é recusada", () => {
    expect(recusasDaGlosa(g({ situacao: "quase" })).join(" ")).toMatch(/desconhecida/i);
  });
});

describe("o catálogo de situações", () => {
  it("toda situação tem rótulo, cor e se é aberta", () => {
    for (const [k, v] of Object.entries(SITUACOES)) {
      expect(v.label, k).toBeTruthy();
      expect(v.cor, k).toMatch(/^#/);
      expect(typeof v.aberta, k).toBe("boolean");
    }
  });

  it("⚠️ as chaves batem com o CHECK do banco", () => {
    // Se divergirem, a tela oferece uma situação que o banco recusa — e a
    // recusa chega como erro cru, depois de a pessoa ter digitado tudo.
    expect(Object.keys(SITUACOES).sort()).toEqual(
      ["aceita", "em_recurso", "perdida", "recebida", "recuperada", "recurso_enviado"]);
  });

  it("as abertas são exatamente as três do começo do ciclo", () => {
    expect(SITUACOES_ABERTAS.sort()).toEqual(["em_recurso", "recebida", "recurso_enviado"]);
  });
});
