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
  lerNomes, codigosExistentes, gerarSqlBpa,
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

describe("o CSV de nomes", () => {
  it("aceita ponto-e-vírgula e vírgula, e ignora cabeçalho", () => {
    const m = lerNomes(`codigo;nome\n0301010013;CONSULTA MEDICA\n0302010013,SESSAO DE HEMODIALISE\nlixo`);
    expect(m.get("0301010013")).toBe("CONSULTA MEDICA");
    expect(m.get("0302010013")).toBe("SESSAO DE HEMODIALISE");
    expect(m.size).toBe(2);
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
