// ═══════════════════════════════════════════════════════════
// O CICLO DE VIDA DO EXAME
//
// 🔴 O vocabulário destes estados vivia em TRÊS cópias, e nenhuma tinha
// teste. O que se protege aqui não é o rótulo na tela — é a diferença entre
// "o laboratório ainda não respondeu" e "respondeu e ninguém leu". Somar as
// duas dá um número maior e mais calmo do que a verdade.
//
// 🔴 ERAM TRÊS ESTADOS; SÃO CINCO (13/10/2026). `coletado` e `cancelado`
// entraram com as tabelas do SADT (`migracao-sadt-exames.sql`), e os dois
// tinham de entrar AQUI — não ao lado:
//
//   · `coletado` separa "ninguém puncionou ainda" de "o material está no
//     laboratório". É dali que o prazo do laboratório conta, e era a
//     diferença que a enfermagem não tinha como registrar;
//   · `cancelado` existe porque exame que não vai ser feito ficava pendente
//     para sempre — e exame pendente trava a alta.
//
// ⚠️ O cabeçalho de `exames.js` previu exatamente o defeito que esses dois
// causariam se o vocabulário não crescesse junto: "um quarto estado no banco
// faria a tela mostrar um rótulo, o BI contar como pendente e o painel do
// plantão contar como aguardando". Os testes abaixo são a cobrança disso.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  EXAME_CANCELADO, EXAME_CATEGORIAS, EXAME_COLETADO, EXAME_ESTADOS, EXAME_PENDENTES,
  EXAME_RESULTADO, EXAME_SOLICITADO, EXAME_VISTO,
  acaoDoExame, contarExames, estadoDoExame, resultadosNaoVistos, temResultado,
} from "./exames.js";
import { PS_EXAME_CATEGORIAS } from "./catalogo.js";

const ex = status => ({ id: Math.random(), texto: "Hemograma", status });

describe("🔴 estadoDoExame — o desconhecido é PENDENTE, não resolvido", () => {
  it("lê os cinco estados", () => {
    // ⚠️ "Aguardando COLETA", e não mais "aguardando resultado": com
    // `coletado` no vocabulário, o primeiro estado passou a significar que
    // nem o material saiu — que é o que a enfermagem precisa ver.
    expect(estadoDoExame(ex(EXAME_SOLICITADO)).label).toBe("Aguardando coleta");
    expect(estadoDoExame(ex(EXAME_COLETADO)).label).toBe("Coletado, aguardando");
    expect(estadoDoExame(ex(EXAME_RESULTADO)).label).toBe("Resultado disponível");
    expect(estadoDoExame(ex(EXAME_VISTO)).label).toBe("Visto pelo médico");
    expect(estadoDoExame(ex(EXAME_CANCELADO)).label).toBe("Cancelado");
  });

  it("🔴 os cinco são EXATAMENTE os cinco do check do banco", () => {
    // Se o banco aceitar um sexto, a tela cai no fallback `solicitado` e o
    // exame parece pendente para sempre — travando a alta de quem já foi
    // embora. É a pergunta que ninguém faz sozinho.
    expect(EXAME_ESTADOS.map(e => e.chave)).toEqual(
      ["solicitado", "coletado", "resultado_disponivel", "visto", "cancelado"]);
  });

  it("🔴 status ausente, nulo ou desconhecido cai em SOLICITADO", () => {
    // Cair em "visto" sumiria com o exame da tela de quem espera o resultado.
    // ⚠️ `cancelado` e `coletado` SAÍRAM desta lista: eles existem agora, e
    // ler um cancelado como "aguardando coleta" o traria de volta para a
    // fila do laboratório.
    for (const s of [undefined, null, "", "extraviado", "em_transito", 0]) {
      expect(estadoDoExame({ status: s }).chave, String(s)).toBe(EXAME_SOLICITADO);
    }
  });

  it("registro nulo não estoura", () => {
    expect(() => estadoDoExame(null)).not.toThrow();
    expect(estadoDoExame(null).chave).toBe(EXAME_SOLICITADO);
    expect(estadoDoExame(undefined).chave).toBe(EXAME_SOLICITADO);
  });

  it("⚠️ a ordem da lista É o ciclo: solicitado → coletado → resultado → visto", () => {
    // ⚠️ `cancelado` fecha a lista e NÃO está no meio: ele não é uma etapa
    // do caminho, é a saída dele. Pô-lo entre `coletado` e `resultado` faria
    // qualquer tela que lê a ordem para oferecer "o próximo passo" sugerir
    // cancelar um exame que acabou de ser coletado.
    expect(EXAME_ESTADOS.map(e => e.chave)).toEqual(
      [EXAME_SOLICITADO, EXAME_COLETADO, EXAME_RESULTADO, EXAME_VISTO, EXAME_CANCELADO]);
  });

  it("todo estado tem rótulo e cor", () => {
    for (const e of EXAME_ESTADOS) {
      expect(e.label, e.chave).toBeTruthy();
      expect(e.cor, e.chave).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("temResultado — as duas pontas do 'já saiu'", () => {
  it("disponível e visto contam; solicitado não", () => {
    expect(temResultado(EXAME_RESULTADO)).toBe(true);
    expect(temResultado(EXAME_VISTO)).toBe(true);
    expect(temResultado(EXAME_SOLICITADO)).toBe(false);
  });

  it("🔴 VISTO conta como 'tem resultado' — o médico já leu, o dado existe", () => {
    // Deixá-lo de fora faria o tempo de resposta do laboratório piorar
    // exatamente com os exames que foram bem cuidados até o fim.
    expect(temResultado(EXAME_VISTO)).toBe(true);
  });

  it("desconhecido e vazio não contam", () => {
    for (const s of [undefined, null, "", "cancelado"]) expect(temResultado(s), String(s)).toBe(false);
  });
});

describe("🔴 acaoDoExame — o que a tela pode oferecer", () => {
  it("solicitado oferece lançar o resultado", () => {
    expect(acaoDoExame(ex(EXAME_SOLICITADO))).toBe("lancar_resultado");
  });

  it("com resultado, oferece marcar como visto", () => {
    expect(acaoDoExame(ex(EXAME_RESULTADO))).toBe("marcar_visto");
  });

  it("🔴 VISTO não oferece NADA — é estado final", () => {
    // Ninguém des-vê um resultado, e relançar por cima apagaria o que o
    // médico leu para decidir a conduta.
    expect(acaoDoExame(ex(EXAME_VISTO))).toBe(null);
  });

  it("⚠️ com resultado NÃO se oferece relançar — resultado é registro clínico", () => {
    expect(acaoDoExame(ex(EXAME_RESULTADO))).not.toBe("lancar_resultado");
  });

  it("desconhecido se comporta como solicitado", () => {
    expect(acaoDoExame({ status: "coletado" })).toBe("lancar_resultado");
    expect(acaoDoExame(null)).toBe("lancar_resultado");
  });
});

describe("🔴 resultadosNaoVistos — o resultado voltou e ninguém olhou", () => {
  const lista = [ex(EXAME_SOLICITADO), ex(EXAME_RESULTADO), ex(EXAME_VISTO), ex(EXAME_RESULTADO)];

  it("pega só o que voltou e não foi lido", () => {
    expect(resultadosNaoVistos(lista)).toHaveLength(2);
    expect(resultadosNaoVistos(lista).every(e => e.status === EXAME_RESULTADO)).toBe(true);
  });

  it("🔴 o que AINDA NÃO VOLTOU não entra — é pendência do laboratório", () => {
    // Misturar as duas transforma "o médico não leu" em "o exame não ficou
    // pronto", que é problema de outro alguém.
    expect(resultadosNaoVistos(lista).some(e => e.status === EXAME_SOLICITADO)).toBe(false);
  });

  it("já visto não entra", () => {
    expect(resultadosNaoVistos(lista).some(e => e.status === EXAME_VISTO)).toBe(false);
  });

  it("⚠️ status desconhecido NÃO entra — não se acusa o que não se sabe ler", () => {
    expect(resultadosNaoVistos([{ status: "extraviado" }, null, undefined])).toEqual([]);
  });

  it("⚠️ coletado não entra: o laboratório ainda não respondeu", () => {
    // É pendência DELES, não do médico. A lista existe para acusar o
    // silêncio de quem já recebeu a resposta.
    expect(resultadosNaoVistos([{ status: EXAME_COLETADO }])).toEqual([]);
  });

  it("⚠️ cancelado não entra: não há resultado para ninguém ler", () => {
    expect(resultadosNaoVistos([{ status: EXAME_CANCELADO }])).toEqual([]);
  });

  it("entradas estranhas devolvem lista vazia", () => {
    for (const v of [null, undefined, [], "texto", 7]) {
      expect(resultadosNaoVistos(v), String(v)).toEqual([]);
    }
  });
});

describe("🔴 contarExames — aguardando é só o que não voltou", () => {
  const lista = [ex(EXAME_SOLICITADO), ex(EXAME_SOLICITADO), ex(EXAME_RESULTADO), ex(EXAME_VISTO)];

  it("separa as contas", () => {
    expect(contarExames(lista)).toEqual({
      total: 4, aguardando: 2, coletados: 0, prontos: 1, vistos: 1, cancelados: 0,
    });
  });

  it("🔴 'prontos' NÃO entra em 'aguardando'", () => {
    // Somar os dois daria 3 pendentes, todos parecendo espera do laboratório,
    // quando um deles é resultado parado na mão do médico.
    const c = contarExames(lista);
    expect(c.aguardando).toBe(2);
    expect(c.aguardando + c.prontos + c.vistos + c.cancelados).toBe(c.total);
  });

  it("🔴 'coletado' SOMA em aguardando — e os baldes fecham com o total", () => {
    // Era o defeito previsto no cabeçalho de `exames.js`, acontecendo: com
    // `coletado` novo no banco e `aguardando` contando só `solicitado`, o
    // exame coletado desaparecia das DUAS pontas — não aparecia como
    // pendente nem como pronto, e sumia da conta sem reduzir o total.
    const c = contarExames([
      ex(EXAME_SOLICITADO), ex(EXAME_COLETADO), ex(EXAME_COLETADO),
      ex(EXAME_RESULTADO), ex(EXAME_VISTO), ex(EXAME_CANCELADO),
    ]);
    expect(c.total).toBe(6);
    expect(c.aguardando).toBe(3);
    expect(c.coletados).toBe(2);
    expect(c.cancelados).toBe(1);
    expect(c.aguardando + c.prontos + c.vistos + c.cancelados).toBe(c.total);
  });

  it("🔴 cancelado NÃO entra em aguardando — exame pendente trava a alta", () => {
    const c = contarExames([ex(EXAME_CANCELADO), ex(EXAME_CANCELADO)]);
    expect(c.aguardando).toBe(0);
    expect(c.cancelados).toBe(2);
  });

  it("status desconhecido conta como aguardando, e não some do total", () => {
    const c = contarExames([{ status: "extraviado" }, ex(EXAME_VISTO)]);
    expect(c).toEqual({
      total: 2, aguardando: 1, coletados: 0, prontos: 0, vistos: 1, cancelados: 0,
    });
  });

  it("lista vazia é tudo zero, e não estoura", () => {
    for (const v of [[], null, undefined, "x"]) {
      expect(contarExames(v), String(v)).toEqual({
        total: 0, aguardando: 0, coletados: 0, prontos: 0, vistos: 0, cancelados: 0,
      });
    }
  });

  it("EXAME_PENDENTES é a lista que 'aguardando' soma", () => {
    // Lista, e não comparação solta: foi um `=== "solicitado"` espalhado que
    // fez este vocabulário se multiplicar em três cópias.
    expect(EXAME_PENDENTES).toEqual([EXAME_SOLICITADO, EXAME_COLETADO]);
  });
});

describe("⚠️ as categorias saem do catálogo do PS — nunca redigitadas", () => {
  it("são exatamente as do catálogo, na mesma ordem", () => {
    expect(EXAME_CATEGORIAS.map(c => c.chave)).toEqual(Object.keys(PS_EXAME_CATEGORIAS));
    expect(EXAME_CATEGORIAS.map(c => c.label)).toEqual(Object.values(PS_EXAME_CATEGORIAS));
  });

  it("uma categoria nova no catálogo aparece aqui sozinha", () => {
    // Catraca: se alguém redigitar a lista em vez de derivá-la, este teste
    // continua verde HOJE e o de cima quebra amanhã. É por isso que os dois
    // existem — este confere a ligação, aquele confere o conteúdo.
    expect(EXAME_CATEGORIAS).toHaveLength(Object.keys(PS_EXAME_CATEGORIAS).length);
  });
});
