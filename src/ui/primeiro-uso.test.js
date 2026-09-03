// ═══════════════════════════════════════════════════════════
// PRIMEIRO USO
//
// 🔴 O TESTE QUE MAIS IMPORTA É O DO TERCEIRO ESTADO. Uma checagem que não
// deu para ler NÃO pode virar "não cadastrado": mandaria o hospital
// cadastrar o que já existe, por causa de uma falha de rede. E a faixa
// apareceria no meio de um plantão, num sistema em produção, dizendo que
// falta cadastrar setores num hospital que tem setores há dois anos.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  faltando, naoConferidas, precisaAvisar, lista, textoDoPrimeiroUso,
} from "./primeiro-uso.js";

const c = (o, quantos, onde = "em algum lugar") => ({ o, quantos, onde });

describe("🔴 os três estados de uma checagem", () => {
  it("quantos > 0: há cadastro, nada a avisar", () => {
    const ch = [c("setores", 8), c("leitos", 75)];
    expect(faltando(ch)).toEqual([]);
    expect(naoConferidas(ch)).toEqual([]);
    expect(precisaAvisar(ch)).toBe(false);
    expect(textoDoPrimeiroUso(ch)).toBe(null);
  });

  it("quantos === 0: falta cadastro", () => {
    expect(faltando([c("setores", 0)]).length).toBe(1);
  });

  it("🔴 quantos == null NÃO é 'não cadastrado' — é 'não consegui ler'", () => {
    const ch = [c("setores", null)];
    expect(faltando(ch)).toEqual([]);          // não afirma falta
    expect(naoConferidas(ch).length).toBe(1);
    expect(textoDoPrimeiroUso(ch).tom).toBe("duvida");
    expect(textoDoPrimeiroUso(ch).titulo).toMatch(/não deu para conferir/i);
    // E NÃO manda cadastrar nada.
    expect(textoDoPrimeiroUso(ch).onde).toEqual([]);
    expect(textoDoPrimeiroUso(ch).corpo).not.toMatch(/cadastr/i);
  });

  it("undefined também conta como não lido, não como zero", () => {
    expect(faltando([c("setores", undefined)])).toEqual([]);
    expect(naoConferidas([c("setores", undefined)]).length).toBe(1);
  });

  it("⚠️ zero é zero — não pode ser confundido com nulo no sentido inverso", () => {
    // O erro simétrico: tratar 0 como "não sei" esconderia a falta de
    // cadastro, que é exatamente o que a faixa existe para mostrar.
    expect(naoConferidas([c("setores", 0)])).toEqual([]);
    expect(faltando([c("setores", 0)]).length).toBe(1);
  });
});

describe("a frase", () => {
  it("um item", () => {
    expect(lista([c("setores", 0)])).toBe("setores");
  });
  it("dois itens levam 'e', não vírgula", () => {
    expect(lista([c("setores", 0), c("leitos", 0)])).toBe("setores e leitos");
  });
  it("três itens: vírgula até o penúltimo", () => {
    expect(lista([c("a", 0), c("b", 0), c("c", 0)])).toBe("a, b e c");
  });

  it("🔴 diz o que os NÚMEROS significam, não só que falta cadastro", () => {
    // Sem isto a pessoa lê o aviso, fecha, e continua olhando os zeros
    // como se fossem medida do hospital dela.
    const t = textoDoPrimeiroUso([c("setores", 0)]);
    expect(t.corpo).toMatch(/zerados porque ainda não há/i);
    expect(t.corpo).toMatch(/não porque o movimento do hospital foi zero/i);
  });

  it("falta + leitura falhada: avisa dos dois, sem misturar", () => {
    const t = textoDoPrimeiroUso([c("setores", 0), c("leitos", null)]);
    expect(t.tom).toBe("cadastro");
    expect(t.titulo).toBe("Falta cadastrar setores");
    expect(t.corpo).toMatch(/não consegui ler leitos, que pode faltar também/);
    // O que não foi lido NÃO entra na lista de onde cadastrar.
    expect(t.onde.map(x => x.o)).toEqual(["setores"]);
  });

  it("leva o 'onde' de cada falta", () => {
    const t = textoDoPrimeiroUso([c("convênios", 0, "Atendimento → Tabelas")]);
    expect(t.onde).toEqual([{ o: "convênios", onde: "Atendimento → Tabelas", ir: undefined }]);
  });

  it("falta sem 'onde' não vira linha vazia", () => {
    const t = textoDoPrimeiroUso([{ o: "setores", quantos: 0 }]);
    expect(t.onde).toEqual([]);
    expect(t.titulo).toMatch(/setores/);
  });
});

describe("entradas estranhas não estouram", () => {
  it("lista vazia, nula e com buracos", () => {
    for (const x of [[], null, undefined, [null, undefined]]) {
      expect(() => textoDoPrimeiroUso(x)).not.toThrow();
      expect(textoDoPrimeiroUso(x)).toBe(null);
      expect(precisaAvisar(x)).toBe(false);
    }
  });
});

describe("🔴 a frase não pode depender de gênero nem de número", () => {
  // As duas primeiras saídas desta frase foram "não há setores cadastrado" e
  // "não há salas do PS cadastrado". Concordar com um nome que vem de fora
  // exigiria saber o gênero de cada um — a frase foi reescrita para não
  // precisar concordar com nada.
  const PROIBIDO = /cadastrad[oa]s?\b/;
  for (const nomes of [["setores"], ["salas do PS"], ["materiais", "fornecedores"], ["convênios"]]) {
    it(`sem particípio para: ${nomes.join(" + ")}`, () => {
      const t = textoDoPrimeiroUso(nomes.map(o => ({ o, quantos: 0 })));
      expect(t.corpo).not.toMatch(PROIBIDO);
      for (const n of nomes) expect(t.corpo).toContain(n);
    });
  }
});
