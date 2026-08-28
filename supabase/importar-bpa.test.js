// ═══════════════════════════════════════════════════════════
// IMPORTADOR DE BPA (SIA-SUS)
//
// 🔴 O BURACO: `sigtap_procedimentos` tem 219 linhas e TODAS de `via='aih'`.
// A alta de pronto-socorro e a consulta ambulatorial saem por BPA, e a tela
// de escolha não tinha o que oferecer para elas.
//
// Sem `.dbc` real no repositório — ele traria dado de paciente. O
// descompactador já é testado em `importar-aih.test.js` contra o vetor
// canônico do blast.c; aqui se testa o que é NOVO: a conferência de campos,
// a agregação por procedimento e o SQL gerado.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  CAMPOS_PA, conferirCampos, agregarBpa, cidLimpo, competenciaPa,
  lerNomes, lerNomesFixo, detectarFormatoNomes, decodificar, codigosExistentes, gerarSqlBpa,
} from "./importar-bpa.mjs";

/** Monta um DBF sintético: cabeçalho + registros em claro. */
function dbfFalso(campos, registros) {
  const headerLen = 32 + campos.length * 32 + 1;
  const recordLen = 1 + campos.reduce((s, f) => s + f[2], 0);
  const buf = Buffer.alloc(headerLen);
  buf[0] = 0x03;
  buf.writeUInt32LE(registros.length, 4);
  buf.writeUInt16LE(headerLen, 8);
  buf.writeUInt16LE(recordLen, 10);
  let off = 32;
  for (const [nome, tipo, tam] of campos) {
    buf.write(nome, off, "latin1");
    buf[off + 11] = tipo.charCodeAt(0);
    buf[off + 16] = tam;
    off += 32;
  }
  buf[off] = 0x0d;

  const dados = Buffer.alloc(recordLen * registros.length, 0x20);
  registros.forEach((reg, i) => {
    let pos = i * recordLen + 1;
    for (const [nome, , tam] of campos) {
      dados.write(String(reg[nome] ?? "").padEnd(tam).slice(0, tam), pos, "latin1");
      pos += tam;
    }
  });
  return { buf, dados, recordLen };
}

const CAMPOS = [
  ["PA_PROC_ID", "C", 10], ["PA_QTDAPR", "C", 6], ["PA_VALAPR", "C", 10],
  ["PA_CIDPRI", "C", 4], ["PA_CODUNI", "C", 7], ["PA_CMP", "C", 6],
];

function header(campos = CAMPOS, registros = []) {
  const { buf, dados, recordLen } = dbfFalso(campos, registros);
  const nomes = {};
  let disp = 1;
  const lista = campos.map(([nome, tipo, tam]) => {
    const c = { nome, tipo, tam, offset: disp }; disp += tam; nomes[nome] = c; return c;
  });
  void buf;
  return { header: { nRegistros: registros.length, recordLen, campos: lista, campoPorNome: nomes }, dados };
}

describe("🔴 conferir os campos ANTES de contar", () => {
  it("acusa campo faltando e mostra o que o arquivo TEM", () => {
    // `campoDe` devolve "" para campo inexistente, em silêncio. Sem esta
    // conferência a ferramenta produziria valores ZERADOS sem reclamar —
    // número errado com cara de certo, numa ferramenta de faturamento.
    const { header: h } = header([["PA_PROC_ID", "C", 10], ["OUTRO_NOME", "C", 6]]);
    const c = conferirCampos(h);
    expect(c.ok).toBe(false);
    expect(c.faltando.map(f => f.nome)).toContain("PA_QTDAPR");
    expect(c.presentes).toEqual(["PA_PROC_ID", "OUTRO_NOME"]);
  });

  it("e passa quando estão todos", () => {
    expect(conferirCampos(header().header).ok).toBe(true);
    expect(Object.keys(CAMPOS_PA)).toEqual(["proc", "qtd", "valor", "cid", "cnes", "comp"]);
  });
});

describe("a agregação por procedimento", () => {
  const regs = [
    { PA_PROC_ID: "0301010013", PA_QTDAPR: "1",  PA_VALAPR: "10.00", PA_CIDPRI: "J18", PA_CODUNI: "1111111", PA_CMP: "202608" },
    { PA_PROC_ID: "0301010013", PA_QTDAPR: "1",  PA_VALAPR: "12.00", PA_CIDPRI: "J18", PA_CODUNI: "1111111", PA_CMP: "202608" },
    { PA_PROC_ID: "0301010013", PA_QTDAPR: "1",  PA_VALAPR: "14.00", PA_CIDPRI: "A09", PA_CODUNI: "2222222", PA_CMP: "202608" },
    { PA_PROC_ID: "0302010013", PA_QTDAPR: "30", PA_VALAPR: "300.00", PA_CIDPRI: "N18", PA_CODUNI: "1111111", PA_CMP: "202608" },
  ];

  it("🔴 usa o valor UNITÁRIO — a linha traz o total da quantidade", () => {
    // Uma linha de 30 sessões traz o valor das 30. Guardar isso cru
    // inflaria o preço do procedimento em 30×.
    const { linhas } = agregarBpa(header(CAMPOS, regs));
    const sessao = linhas.find(l => l.codigo === "0302010013");
    expect(sessao.valor_sa).toBe(1000);   // 300,00 ÷ 30 = 10,00 → 1000 centavos
    expect(sessao.quantidade).toBe(30);
  });

  it("🔴 mediana, não média — um caso caro puxaria a média", () => {
    // ⚠️ O dado tem de ser ASSIMÉTRICO, senão o teste não distingue as
    // duas: com 10/12/14 a mediana e a média dão 1200 iguais, e uma
    // mutação trocando mediana por média sobrevivia sem ninguém notar.
    // Aqui, com um caso de 200,00: mediana 1200, média 5550.
    const comOutlier = [...regs, {
      PA_PROC_ID: "0301010013", PA_QTDAPR: "1", PA_VALAPR: "200.00",
      PA_CIDPRI: "J18", PA_CODUNI: "1111111", PA_CMP: "202608",
    }];
    const { linhas } = agregarBpa(header(CAMPOS, comOutlier));
    expect(linhas.find(l => l.codigo === "0301010013").valor_sa).toBe(1300); // (1200+1400)/2
  });

  it("⚠️ CID só entra se visto ao menos DUAS vezes", () => {
    // Uma ocorrência costuma ser digitação isolada, e CID errado na lista
    // vira glosa de "CID atípico" contra atendimento correto.
    const c = agregarBpa(header(CAMPOS, regs)).linhas.find(l => l.codigo === "0301010013").cids;
    expect(c).toEqual(["J18"]);           // A09 apareceu 1× e ficou de fora
  });

  it("filtra por CNES quando pedido", () => {
    const { linhas } = agregarBpa(header(CAMPOS, regs), { cnes: "2222222" });
    expect(linhas).toHaveLength(1);
    expect(linhas[0].codigo).toBe("0301010013");
  });

  it("linha sem quantidade aprovada é contada e NÃO vira valor", () => {
    // Não é erro do arquivo: linha rejeitada entra com aprovado zerado.
    const r = [{ PA_PROC_ID: "0301010013", PA_QTDAPR: "0", PA_VALAPR: "0.00", PA_CIDPRI: "", PA_CODUNI: "1", PA_CMP: "202608" }];
    const out = agregarBpa(header(CAMPOS, r));
    expect(out.semQtd).toBe(1);
    expect(out.linhas).toEqual([]);
  });

  it("competência sai do arquivo, no formato do faturamento", () => {
    expect(agregarBpa(header(CAMPOS, regs)).competencias).toEqual(["2026-08"]);
    expect(competenciaPa("202608")).toBe("2026-08");
    expect(competenciaPa("2026-08")).toBeNull();   // já convertido não reconverte
    expect(competenciaPa("")).toBeNull();
  });
});

describe("CID limpo", () => {
  it("tira pontuação e aceita 3 ou 4 caracteres", () => {
    expect(cidLimpo("J18.9")).toBe("J189");
    expect(cidLimpo(" a09 ")).toBe("A09");
  });
  it("recusa o que não é CID", () => {
    expect(cidLimpo("")).toBeNull();
    expect(cidLimpo("0000")).toBeNull();
    expect(cidLimpo("XX")).toBeNull();
  });
});

describe("de onde vêm os nomes", () => {
  it("CSV: aceita ponto-e-vírgula e vírgula, e ignora cabeçalho", () => {
    const r = lerNomes(`codigo;nome\n0301010013;CONSULTA MEDICA\n0302010013,SESSAO DE HEMODIALISE\nlixo`);
    expect(r.formato).toBe("csv");
    expect(r.nomes.get("0301010013")).toBe("CONSULTA MEDICA");
    expect(r.nomes.get("0302010013")).toBe("SESSAO DE HEMODIALISE");
    expect(r.nomes.size).toBe(2);
    expect(r.erros).toEqual([]);
  });

  it("arquivo que não é nem um nem outro é RECUSADO, não interpretado", () => {
    const r = lerNomes("uma coisa qualquer\noutra linha");
    expect(r.nomes.size).toBe(0);
    expect(r.erros.length).toBeGreaterThan(0);
  });
});

describe("🔴 o `tb_procedimento.txt` do pacote SIGTAP", () => {
  // Largura fixa: 10 do código + 40 do nome + campos numéricos depois.
  // A ferramenta NÃO sabe esses números — ela os deriva do arquivo.
  const linha = (cod, nome) => cod + nome.padEnd(40) + "0301" + "20260801";
  const arquivo = [
    linha("0301010013", "CONSULTA MEDICA EM ATENCAO ESPECIALIZADA"),
    linha("0302010013", "SESSAO DE HEMODIALISE"),
    linha("0303010037", "TRATAMENTO DE OUTRAS DOENCAS BACTERIANAS"),
    ...Array.from({ length: 12 }, (_, i) => linha(String(4000000000 + i), `PROCEDIMENTO DE TESTE ${i}`)),
  ].join("\n");

  it("🔴 SEM a largura confirmada, não extrai NADA — só sugere", () => {
    // A primeira versão derivava a largura sozinha. O próprio teste
    // derrubou a ideia: nome de procedimento CONTÉM dígito ("CONSULTA DE
    // 1A VEZ"), e um dígito em coluna recorrente cortava o nome no meio,
    // devolvendo nome truncado com cara de certo.
    const r = lerNomes(arquivo);
    expect(r.formato).toBe("fixo");
    expect(r.precisaConfirmar).toBe(true);
    expect(r.nomes.size).toBe(0);          // nada extraído sem confirmação
    expect(r.largura).toBeGreaterThan(0);  // mas há um palpite
    expect(r.amostra.length).toBeGreaterThan(0);
  });

  it("com a largura informada, extrai e não pergunta mais", () => {
    const r = lerNomes(arquivo, { largura: 40 });
    expect(r.precisaConfirmar).toBe(false);
    expect(r.erros).toEqual([]);
    expect(r.nomes.get("0301010013")).toBe("CONSULTA MEDICA EM ATENCAO ESPECIALIZADA");
    expect(r.nomes.get("0302010013")).toBe("SESSAO DE HEMODIALISE");
  });

  it("⚠️ e nome com DÍGITO dentro sai inteiro — era o caso que derrubou a derivação", () => {
    const comDigito = Array.from({ length: 12 }, (_, i) =>
      linha(String(4000000000 + i), "CONSULTA DE 1A VEZ EM 2 ETAPAS")).join("\n");
    const r = lerNomes(comDigito, { largura: 40 });
    expect(r.nomes.get("4000000000")).toBe("CONSULTA DE 1A VEZ EM 2 ETAPAS");
  });

  it("🔴 largura CURTA DEMAIS é acusada — corte no meio da palavra", () => {
    // Achado no teste de fumaça do CLI: com largura 3, "CONSULTA MEDICA"
    // vira "CON" — tem letra, não tem dígito, nenhuma linha fica sem nome,
    // e passava limpo por todas as outras conferências. Truncar é
    // exatamente o modo de falha que este arquivo diz estar guardando.
    const r = lerNomes(arquivo, { largura: 3 });
    expect(r.nomes.size).toBeGreaterThan(0);      // extraiu…
    expect(r.erros.length).toBeGreaterThan(0);    // …mas recusa entregar
    expect(r.erros.join(" ")).toMatch(/meio de uma palavra/);
  });

  it("e a largura CERTA não é acusada por engano", () => {
    // Nome que preenche o campo inteiro tem letra na última posição — não
    // pode ser confundido com corte.
    expect(lerNomes(arquivo, { largura: 40 }).erros).toEqual([]);
  });

  it("🔴 largura errada é ACUSADA, não gravada", () => {
    // A pessoa pode digitar o número errado, e aí o erro é dela mas o dano
    // é o mesmo. Largura 4 pega só o começo — e sobra lixo numérico.
    const numerico = Array.from({ length: 15 }, (_, i) =>
      String(4000000000 + i) + "000000000000000000".padEnd(40) + "0301").join("\n");
    const r = lerNomes(numerico, { largura: 40 });
    expect(r.erros.length).toBeGreaterThan(0);
    expect(r.erros.join(" ")).toMatch(/só com números|não parece texto/);
  });

  it("arquivo curto demais não é tratado como tabela", () => {
    const r = lerNomes(linha("0301010013", "CONSULTA"), { largura: 40 });
    expect(r.erros.length).toBeGreaterThan(0);
  });

  it("⚠️ latin1 do DATASUS não vira caractere quebrado", () => {
    // O DATASUS publica em latin1. Ler como UTF-8 estragaria todo acento —
    // e "ATENÇÃO" viraria "ATEN��O" dentro do catálogo.
    const bruto = Buffer.from(
      Array.from({ length: 12 }, (_, i) =>
        String(4000000000 + i) + "ATENÇÃO ESPECIALIZADA".padEnd(40) + "0301").join("\n"),
      "latin1");
    const r = lerNomes(bruto, { largura: 40 });
    expect(r.nomes.get("4000000000")).toBe("ATENÇÃO ESPECIALIZADA");
  });
});

describe("🔴 o SQL gerado", () => {
  const linhas = [
    { codigo: "0301010013", valor_sa: 1200, linhas: 3, quantidade: 3, cids: ["J18"] },
    { codigo: "0303010037", valor_sa: 900, linhas: 2, quantidade: 2, cids: [] },
  ];
  const opts = {
    arquivo: "/tmp/PARS2608.dbc", competencia: "2026-08", cnes: null,
    existentes: new Set(["0303010037"]),   // já está no seed dos 219
    nomes: new Map([["0301010013", "CONSULTA MEDICA EM ATENCAO ESPECIALIZADA"]]),
  };

  it("insere o novo com via='bpa' — que é o que faltava", () => {
    const sql = gerarSqlBpa(linhas, opts);
    expect(sql).toMatch(/insert into public\.sigtap_procedimentos/);
    expect(sql).toMatch(/'bpa'/);
    expect(sql).toMatch(/0301010013/);
    expect(sql).toMatch(/CONSULTA MEDICA EM ATENCAO ESPECIALIZADA/);
  });

  it("⚠️ o que já existe é ENRIQUECIDO, nunca reescrito", () => {
    // Nome, grupo e via do seed são curadoria; o arquivo de produção não
    // sabe mais do que ela sobre isso.
    const sql = gerarSqlBpa(linhas, opts);
    // Só o comando UPDATE — não até o fim do arquivo. A conferência final
    // tem `via = 'bpa'` dentro de um `filter`, e fatiar demais fazia o
    // teste reprovar por causa do próprio SELECT de recibo.
    const ini = sql.indexOf("update public.sigtap_procedimentos");
    const update = sql.slice(ini, sql.indexOf(";", ini));
    expect(update).toMatch(/valor_sa = v\.valor_sa/);
    expect(update).not.toMatch(/\bnome\s*=/);
    expect(update).not.toMatch(/\bvia\s*=/);
  });

  it("🔴 código NOVO sem nome NÃO é inserido — e aparece listado", () => {
    // Inventar nome de procedimento é pior que não ter: alguém escolheria
    // pelo rótulo errado e a conta voltaria rejeitada.
    const sql = gerarSqlBpa(linhas, { ...opts, nomes: new Map() });
    expect(sql).toMatch(/1 CÓDIGO\(S\) FICARAM DE FORA POR FALTA DE NOME/);
    expect(sql).toMatch(/--   0301010013/);
    expect(sql).toMatch(/nenhum código novo com nome disponível/);
  });

  it("escapa apóstrofo no nome", () => {
    const sql = gerarSqlBpa([linhas[0]], { ...opts, nomes: new Map([["0301010013", "D'AVILA"]]) });
    expect(sql).toMatch(/'D''AVILA'/);
  });

  it("se auto-registra e confere o que importa", () => {
    const sql = gerarSqlBpa(linhas, opts);
    expect(sql).toMatch(/insert into public\.migracoes_aplicadas/);
    expect(sql).toMatch(/count\(\*\) filter \(where via = 'bpa'\)\s+as bpa/);
  });
});

describe("os códigos que a tabela já tem", () => {
  it("saem do seed versionado, não de palpite", () => {
    const s = codigosExistentes("values\n  ('0301060088','DIAG',...),\n  ('0303010037','TRAT',...)");
    expect(s).toEqual(new Set(["0301060088", "0303010037"]));
  });
});
