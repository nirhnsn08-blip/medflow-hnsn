// ═══════════════════════════════════════════════════════════
// IMPORTAR TABELA DE PREÇO
//
// 🔴 O RISCO DESTA TELA É DIFERENTE DAS OUTRAS. Nas outras, um erro aparece
// numa conta. Aqui, um erro aparece em TODAS de uma vez — a tabela inteira
// entra errada, de uma vez só, e ninguém confere linha a linha um arquivo
// de 400 procedimentos depois de importado.
//
// E o erro mais provável não é bug: é `1.234`. Mil duzentos e trinta e
// quatro, ou um e pouco? A planilha não diz. Adivinhar erra por MIL VEZES.
//
// Por isso a maior parte dos testes aqui é sobre número, e a maior parte
// deles verifica uma RECUSA.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  detectarSeparador, separarColunas, acharColunas, lerNumero,
  estiloDaColuna, analisarImportacao, paraGravar, ESTILO, ENTRA, RECUSADA,
} from "./importar-precos.js";

const linhasDe = plano => Object.fromEntries(plano.linhas.map(l => [l.n, l]));

describe("detectarSeparador", () => {
  it("TAB ganha — é o que sai ao colar do Excel", () => {
    expect(detectarSeparador("Código\tValor\n10101012\t99,90")).toBe("\t");
  });

  it("🔴 ponto-e-vírgula ganha da vírgula: no Brasil a vírgula é o DECIMAL", () => {
    // Se a vírgula ganhasse, "1.234,56" viraria duas colunas.
    expect(detectarSeparador("Código;Valor\n10101012;1.234,56")).toBe(";");
  });

  it("vírgula só quando não há mais nada", () => {
    expect(detectarSeparador("Codigo,Valor\n10101012,99.90")).toBe(",");
  });

  it("texto vazio não devolve separador", () => {
    expect(detectarSeparador("")).toBe(null);
    expect(detectarSeparador(null)).toBe(null);
  });
});

describe("separarColunas", () => {
  it("tira aspas e espaço das células", () => {
    const r = separarColunas('"Código" ; "Valor"\n" 10101012 ";" 99,90 "');
    expect(r.cabecalho).toEqual(["Código", "Valor"]);
    expect(r.linhas[0]).toEqual(["10101012", "99,90"]);
  });

  it("ignora linha em branco no meio", () => {
    const r = separarColunas("Código;Valor\n1;10\n\n2;20\n");
    expect(r.linhas).toHaveLength(2);
  });
});

describe("acharColunas", () => {
  it("acha pelos nomes usuais, com ou sem acento", () => {
    const c = acharColunas(["Código TUSS", "Descrição", "Valor"]);
    expect(c).toMatchObject({ codigo: 0, descricao: 1, valor: 2 });
  });

  it("⚠️ 'valor unitário' ganha de 'valor total'", () => {
    // Importar o total da remessa como preço do procedimento seria o pior
    // dos erros silenciosos: o número existe, é plausível, e está errado.
    const c = acharColunas(["Cod", "Valor Total", "Valor Unitário"]);
    expect(c.valor).toBe(2);
  });

  it("'procedimento' vira código, não descrição, quando é a única", () => {
    const c = acharColunas(["Procedimento", "Preço"]);
    expect(c.codigo).toBe(0);
    expect(c.descricao).toBe(null);
  });

  it("cabeçalho que não tem código nem valor devolve null nos dois", () => {
    const c = acharColunas(["Fulano", "Beltrano"]);
    expect(c.codigo).toBe(null);
    expect(c.valor).toBe(null);
  });
});

describe("🔴 lerNumero — o caso que erra por mil", () => {
  it("com os DOIS sinais, o último manda", () => {
    expect(lerNumero("1.234,56").valor).toBe(1234.56);
    expect(lerNumero("1,234.56").valor).toBe(1234.56);
    expect(lerNumero("1.234.567,89").valor).toBe(1234567.89);
  });

  it("um sinal com 1 ou 2 dígitos depois é decimal, sem dúvida", () => {
    expect(lerNumero("1234,56").valor).toBe(1234.56);
    expect(lerNumero("1234.56").valor).toBe(1234.56);
    expect(lerNumero("99,9").valor).toBe(99.9);
  });

  it("dois sinais iguais só podem ser milhar", () => {
    expect(lerNumero("1.234.567").valor).toBe(1234567);
    expect(lerNumero("1,234,567").valor).toBe(1234567);
  });

  it("🔴 UM sinal com EXATAMENTE 3 dígitos depois é AMBÍGUO — e não se chuta", () => {
    const a = lerNumero("1.234");
    expect(a.ambiguo).toBe(true);
    expect(a.valor).toBe(null);
    expect(a.motivo).toMatch(/mil vezes/);

    const b = lerNumero("1,234");
    expect(b.ambiguo).toBe(true);
    expect(b.valor).toBe(null);
  });

  it("o motivo mostra as DUAS leituras possíveis, não só o aviso", () => {
    // Quem lê precisa ver 1234 e 1.234 lado a lado para decidir.
    const m = lerNumero("1.234").motivo;
    expect(m).toContain("1234");
    expect(m).toContain("1.234");
  });

  it("com o estilo da coluna decidido, o ambíguo deixa de ser ambíguo", () => {
    expect(lerNumero("1.234", ESTILO.VIRGULA).valor).toBe(1234);     // ponto = milhar
    expect(lerNumero("1.234", ESTILO.PONTO).valor).toBe(1.234);      // ponto = decimal
    expect(lerNumero("1,234", ESTILO.VIRGULA).valor).toBe(1.234);    // vírgula = decimal
    expect(lerNumero("1,234", ESTILO.PONTO).valor).toBe(1234);       // vírgula = milhar
  });

  it("tira R$, espaço comum e espaço fino", () => {
    expect(lerNumero("R$ 1.234,56").valor).toBe(1234.56);
    expect(lerNumero("R$ 1.234,56").valor).toBe(1234.56);
  });

  it("negativo é lido como negativo (quem recusa é o plano, não o leitor)", () => {
    expect(lerNumero("-99,90").valor).toBe(-99.9);
  });

  it("vazio e lixo devolvem null com motivo, nunca zero", () => {
    // 🔴 Zero é um preço válido — procedimento incluso no pacote. Devolver
    // zero para "não consegui ler" faria as duas coisas virarem uma só.
    expect(lerNumero("").valor).toBe(null);
    expect(lerNumero("   ").valor).toBe(null);
    expect(lerNumero("sob consulta").valor).toBe(null);
    expect(lerNumero("sob consulta").motivo).toMatch(/não é um número/);
    expect(lerNumero(null).valor).toBe(null);
    expect(lerNumero("...").valor).toBe(null);
  });

  it("zero de verdade continua sendo zero", () => {
    expect(lerNumero("0").valor).toBe(0);
    expect(lerNumero("0,00").valor).toBe(0);
  });
});

describe("🔴 estiloDaColuna — uma linha clara decide as duvidosas", () => {
  it("uma vírgula decimal em qualquer linha define a coluna inteira", () => {
    expect(estiloDaColuna(["99,90", "1.234", "50,00"])).toBe(ESTILO.VIRGULA);
  });

  it("um ponto decimal define ao contrário", () => {
    expect(estiloDaColuna(["99.90", "1,234"])).toBe(ESTILO.PONTO);
  });

  it("🔴 coluna que se contradiz não é resolvida — é planilha mal montada", () => {
    expect(estiloDaColuna(["9,90", "9.90"])).toBe(null);
  });

  it("coluna que só tem ambíguos continua sem resposta", () => {
    expect(estiloDaColuna(["1.234", "5.678"])).toBe(null);
  });

  it("inteiro puro não decide nada", () => {
    expect(estiloDaColuna(["100", "200"])).toBe(null);
  });

  it("milhar puro (dois pontos) também não decide", () => {
    expect(estiloDaColuna(["1.234.567"])).toBe(null);
  });
});

describe("analisarImportacao — o plano", () => {
  const base = { convenioId: 7, vigenciaInicio: "2026-09-01" };
  const TXT = [
    "Código\tDescrição\tValor",
    "10101012\tConsulta em consultório\t120,00",
    "40304361\tHemograma completo\t18,50",
  ].join("\n");

  it("lê e aprova o caso feliz", () => {
    const p = analisarImportacao({ ...base, texto: TXT });
    expect(p.ok).toBe(true);
    expect(p.resumo).toMatchObject({ lidas: 2, entram: 2, recusadas: 0 });
    expect(p.resumo.soma).toBe(138.5);
    expect(p.linhas[0]).toMatchObject({ n: 2, codigo: "10101012", valor: 120, situacao: ENTRA });
  });

  it("numera as linhas como a planilha numera — começando em 2", () => {
    // A linha 1 é o cabeçalho. Dizer "erro na linha 1" mandaria a pessoa
    // olhar para o cabeçalho em vez do primeiro procedimento.
    const p = analisarImportacao({ ...base, texto: TXT });
    expect(p.linhas.map(l => l.n)).toEqual([2, 3]);
  });

  it("🔴 SEM CONVÊNIO não analisa nada — preço é sempre de alguém", () => {
    const p = analisarImportacao({ texto: TXT, vigenciaInicio: "2026-09-01" });
    expect(p.ok).toBe(false);
    expect(p.linhas).toEqual([]);
    expect(p.problemas.join(" ")).toMatch(/convênio/i);
  });

  it("🔴 SEM VIGÊNCIA não analisa nada", () => {
    const p = analisarImportacao({ texto: TXT, convenioId: 7 });
    expect(p.ok).toBe(false);
    expect(p.problemas.join(" ")).toMatch(/vigência/i);
  });

  it("cabeçalho sem coluna de valor diz QUAL cabeçalho leu", () => {
    // Sem isso, "não achei a coluna" manda a pessoa adivinhar o que o
    // sistema enxergou — que costuma não ser o que ela vê na planilha.
    const p = analisarImportacao({ ...base, texto: "Fulano;Beltrano\na;b" });
    expect(p.ok).toBe(false);
    expect(p.problemas.join(" ")).toContain("Fulano | Beltrano");
  });

  it("texto vazio não estoura", () => {
    const p = analisarImportacao({ ...base, texto: "" });
    expect(p.ok).toBe(false);
    expect(p.resumo.lidas).toBe(0);
  });

  it("chamada sem argumento nenhum não estoura", () => {
    expect(() => analisarImportacao()).not.toThrow();
  });
});

describe("🔴 analisarImportacao — as recusas por linha", () => {
  const base = { convenioId: 7, vigenciaInicio: "2026-09-01" };

  it("linha sem código é recusada, e o resto do lote continua", () => {
    const p = analisarImportacao({ ...base, texto: "Código\tValor\n\t99,90\n10101012\t120,00" });
    expect(p.resumo).toMatchObject({ entram: 1, recusadas: 1 });
    expect(linhasDe(p)[2].motivos.join(" ")).toMatch(/[Ss]em código/);
    expect(p.ok).toBe(true);
  });

  it("valor negativo é recusado, com o motivo que ensina a exceção", () => {
    const p = analisarImportacao({ ...base, texto: "Código\tValor\n10101012\t-50,00" });
    expect(linhasDe(p)[2].motivos.join(" ")).toMatch(/Zero existe/);
  });

  it("valor zero PASSA — é procedimento incluso no pacote", () => {
    const p = analisarImportacao({ ...base, texto: "Código\tValor\n10101012\t0,00" });
    expect(p.linhas[0].situacao).toBe(ENTRA);
    expect(p.linhas[0].valor).toBe(0);
  });

  it("🔴 CÓDIGO REPETIDO no próprio lote é recusado, e aponta a linha anterior", () => {
    // O banco recusaria o segundo pelo EXCLUDE — mas só na hora de gravar,
    // com o primeiro já dentro. Metade da tabela importada é pior que zero.
    const p = analisarImportacao({
      ...base, texto: "Código\tValor\n10101012\t120,00\n10101012\t150,00",
    });
    expect(p.resumo).toMatchObject({ entram: 1, recusadas: 1 });
    expect(linhasDe(p)[3].motivos.join(" ")).toMatch(/repetido.*linha 2/);
  });

  it("repetido ignora caixa e espaço — é o mesmo código", () => {
    const p = analisarImportacao({ ...base, texto: "Código\tValor\nab12\t10,00\n AB12 \t20,00" });
    expect(p.resumo.recusadas).toBe(1);
  });

  it("🔴 choque com preço JÁ NO BANCO é recusado antes de tentar gravar", () => {
    const p = analisarImportacao({
      ...base, texto: "Código\tValor\n10101012\t120,00",
      precosExistentes: [{ id: 1, convenio_id: 7, codigo: "10101012", ativo: true, vigencia_inicio: "2026-01-01", vigencia_fim: null }],
    });
    expect(p.linhas[0].situacao).toBe(RECUSADA);
    expect(p.linhas[0].motivos.join(" ")).toMatch(/Encerre o anterior/);
  });

  it("preço já encerrado ANTES da nova vigência não choca", () => {
    const p = analisarImportacao({
      ...base, texto: "Código\tValor\n10101012\t120,00",
      precosExistentes: [{ id: 1, convenio_id: 7, codigo: "10101012", ativo: true, vigencia_inicio: "2025-01-01", vigencia_fim: "2026-08-31" }],
    });
    expect(p.linhas[0].situacao).toBe(ENTRA);
  });

  it("preço de OUTRO convênio não choca", () => {
    const p = analisarImportacao({
      ...base, texto: "Código\tValor\n10101012\t120,00",
      precosExistentes: [{ id: 1, convenio_id: 99, codigo: "10101012", ativo: true, vigencia_inicio: "2026-01-01", vigencia_fim: null }],
    });
    expect(p.linhas[0].situacao).toBe(ENTRA);
  });

  it("preço INATIVO não choca", () => {
    const p = analisarImportacao({
      ...base, texto: "Código\tValor\n10101012\t120,00",
      precosExistentes: [{ id: 1, convenio_id: 7, codigo: "10101012", ativo: false, vigencia_inicio: "2026-01-01", vigencia_fim: null }],
    });
    expect(p.linhas[0].situacao).toBe(ENTRA);
  });

  it("🔴 linha com número de colunas diferente é recusada — as células deslocaram", () => {
    // É o sintoma do corte no separador errado. O valor lido nessa linha é
    // o de OUTRA coluna, e entra plausível.
    const p = analisarImportacao({ ...base, texto: "Código;Desc;Valor\n10101012;Consulta;120,00\n40304361;Hemo;com;18,50" });
    expect(linhasDe(p)[3].situacao).toBe(RECUSADA);
    expect(linhasDe(p)[3].motivos.join(" ")).toMatch(/trocadas de lugar/);
  });
});

describe("🔴 a ambiguidade atravessando o plano inteiro", () => {
  const base = { convenioId: 7, vigenciaInicio: "2026-09-01" };

  it("a coluna com uma linha clara resolve as ambíguas", () => {
    const p = analisarImportacao({
      ...base, texto: "Código\tValor\nA\t99,90\nB\t1.234",
    });
    expect(p.estilo).toBe(ESTILO.VIRGULA);
    expect(p.resumo.entram).toBe(2);
    expect(linhasDe(p)[3].valor).toBe(1234);       // e não 1,234
    expect(p.resumo.ambiguas).toBe(0);
  });

  it("🔴 coluna SÓ com ambíguos recusa tudo e conta quantas", () => {
    const p = analisarImportacao({ ...base, texto: "Código\tValor\nA\t1.234\nB\t5.678" });
    expect(p.ok).toBe(false);
    expect(p.resumo).toMatchObject({ entram: 0, recusadas: 2, ambiguas: 2 });
  });

  it("🔴 coluna contraditória recusa as ambíguas em vez de escolher um lado", () => {
    const p = analisarImportacao({ ...base, texto: "Código\tValor\nA\t9,90\nB\t9.90\nC\t1.234" });
    expect(p.estilo).toBe(null);
    expect(linhasDe(p)[4].situacao).toBe(RECUSADA);
    // As duas não-ambíguas continuam entrando: cada uma é clara sozinha.
    expect(p.resumo.entram).toBe(2);
  });
});

describe("paraGravar", () => {
  const base = { convenioId: 7, vigenciaInicio: "2026-09-01" };

  it("leva só as aprovadas, no formato do salvarPreco", () => {
    const p = analisarImportacao({
      ...base, texto: "Código\tDescrição\tValor\n10101012\tConsulta\t120,00\n\tSem código\t50,00",
    });
    const g = paraGravar(p, base);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({
      convenio_id: 7, codigo: "10101012", descricao: "Consulta",
      vigencia_inicio: "2026-09-01", vigencia_fim: null, ativo: true,
    });
  });

  it("🔴 o valor sai como NÚMERO, não como texto", () => {
    // Texto seria relido lá na frente, e reler sem o contexto da coluna é
    // como se gravava R$ 123.456,00 no lugar de R$ 1.234,56. O valor já foi
    // decidido aqui; daqui para a frente ele não é mais interpretável.
    const p = analisarImportacao({ ...base, texto: "Código\tValor\n10101012\t1.234,56" });
    const [g] = paraGravar(p, base);
    expect(g.valor).toBe(1234.56);
    expect(typeof g.valor).toBe("number");
  });

  it("plano vazio devolve lista vazia, sem estourar", () => {
    expect(paraGravar(null, base)).toEqual([]);
    expect(paraGravar({}, base)).toEqual([]);
  });
});
