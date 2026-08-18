// Testes da ferramenta de import de AIH (.dbc). O descompactador é validado
// contra o VETOR CANÔNICO do blast.c (Mark Adler) — assim se testa o PKWARE-DCL
// sem precisar de um .dbc real no repo (que teria dado de paciente).
import { describe, it, expect } from "vitest";
import {
  blast, mediana, lerHeaderDbf, campoDe, lerCodigosSeed, competenciaSeed, gerarSqlValores,
} from "./importar-aih.mjs";

describe("blast (PKWARE DCL)", () => {
  it("descompacta o vetor canônico do blast.c → 'AIAIAIAIAIAIA'", () => {
    const entrada = Buffer.from([0x00, 0x04, 0x82, 0x24, 0x25, 0x8f, 0x80, 0x7f]);
    expect(blast(entrada).toString("latin1")).toBe("AIAIAIAIAIAIA");
  });

  it("recusa um fluxo sem cabeçalho blast válido", () => {
    expect(() => blast(Buffer.from([0x46, 0x83, 0x00]))).toThrow();
  });
});

describe("mediana", () => {
  it("ímpar pega o do meio; par tira a média dos dois", () => {
    expect(mediana([5, 1, 3])).toBe(3);
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
  });
  it("lista vazia é 0", () => {
    expect(mediana([])).toBe(0);
  });
});

describe("cabeçalho DBF", () => {
  const synth = (nreg) => {
    const campos = [["CNES", "C", 7], ["PROC_REA", "C", 10]];
    const headerLen = 32 + campos.length * 32 + 1;
    const recordLen = 1 + campos.reduce((s, f) => s + f[2], 0);
    const buf = Buffer.alloc(headerLen);
    buf[0] = 0x03;
    buf.writeUInt32LE(nreg, 4);
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
    return buf;
  };

  it("lê nº de registros, tamanhos e campos com o offset certo", () => {
    const h = lerHeaderDbf(synth(42));
    expect(h.nRegistros).toBe(42);
    expect(h.recordLen).toBe(18); // 1 (flag) + 7 + 10
    expect(h.campos.map((c) => [c.nome, c.tam, c.offset])).toEqual([
      ["CNES", 7, 1], ["PROC_REA", 10, 8],
    ]);
  });

  it("campoDe recorta o campo pelo offset", () => {
    const h = lerHeaderDbf(synth(1));
    const rec = Buffer.from(" 2257815" + "0303010037".padEnd(10), "latin1"); // flag + CNES + PROC
    expect(campoDe(rec, h.campoPorNome, "CNES")).toBe("2257815");
    expect(campoDe(rec, h.campoPorNome, "PROC_REA")).toBe("0303010037");
  });
});

describe("seed", () => {
  const linha = "  ('2026-08','0301060088','URGENCIA','03','aih',1,'hnsn',true),\n  ('2026-08','0303010037','TRAT','03','aih',6,'hnsn',true),";
  it("extrai os códigos de 10 dígitos", () => {
    expect(lerCodigosSeed(linha)).toEqual(["0301060088", "0303010037"]);
  });
  it("pega a competência nominal", () => {
    expect(competenciaSeed(linha)).toBe("2026-08");
  });
});

describe("gerarSqlValores", () => {
  const sql = gerarSqlValores(
    [{ codigo: "0303010037", valorSh: 103796, valorSp: 7222, media: 10, n: 3430 }],
    { compSeed: "2026-08", uf: "43", anoCmpt: "2026", mesCmpt: "06", arquivo: "RDRS2606.dbc", totalCodigos: 219 },
  );
  it("gera o UPDATE com valores, competência do seed e origem derivada", () => {
    expect(sql).toContain("update public.sigtap_procedimentos set valor_sh = 103796, valor_sp = 7222, media_permanencia = 10");
    expect(sql).toContain("where competencia = '2026-08' and codigo = '0303010037';");
    expect(sql).toContain("origem = 'datasus-sih-rs-2606'");
  });
  it("descreve a procedência no cabeçalho (UF + mês por extenso)", () => {
    expect(sql).toContain("Rio Grande do Sul (RS)");
    expect(sql).toContain("junho/2026");
    expect(sql).toContain("RDRS2606.dbc");
  });
  it("é aditivo: cria a coluna cids (if not exists), faz UPDATE, sem destruir nada", () => {
    expect(sql).toContain("begin;");
    expect(sql).toContain("commit;");
    expect(sql).toContain("add column if not exists cids text[]");
    const semComentario = sql.replace(/--[^\n]*/g, "");
    expect(/\b(drop|delete|truncate)\b/i.test(semComentario)).toBe(false);
  });

  it("inclui os CIDs compatíveis como array text[]", () => {
    const sqlCid = gerarSqlValores(
      [{ codigo: "0303010037", valorSh: 100, valorSp: 10, media: 5, cids: ["A419", "J189"], n: 100 }],
      { compSeed: "2026-08", uf: "43", anoCmpt: "2026", mesCmpt: "06", arquivo: "X.dbc", totalCodigos: 1 },
    );
    expect(sqlCid).toContain("cids = '{A419,J189}'::text[]");
  });

  it("procedimento sem CID vira array vazio (não quebra a glosa)", () => {
    expect(sql).toContain("cids = '{}'::text[]"); // o `sql` de cima não tem cids
  });
});
