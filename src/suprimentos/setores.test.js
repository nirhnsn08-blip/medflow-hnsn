// ═══════════════════════════════════════════════════════════
// Setor de destino da saída.
//
// O defeito que isto conserta não quebra nada: o consumo por setor agrupa
// pela string digitada, então "Posto 2", "posto 2" e "POSTO 2 " viram três
// linhas no relatório. O número aparece, parece certo, e quem olha o
// consumo do Posto 2 vê um terço dele.
//
// Validados por mutação:
//   • chave sem remover acento ............ derruba "Cirúrgico" × "Cirurgico"
//   • chave sem baixar a caixa ............ derruba "POSTO 2" × "posto 2"
//   • casar devolvendo o digitado .......... derruba o encaixe no catálogo
//   • setor desconhecido sendo recusado .... derruba a saída legítima
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  chaveDeSetor, normalizarSetor, casarComCatalogo, ehSetorNovo, agruparPorSetor,
} from "./setores.js";

const CATALOGO = [{ nome: "POSTO 2" }, { nome: "Centro Cirúrgico" }, { nome: "UTI" }];

describe("chaveDeSetor", () => {
  it("🔴 ignora acento — 'Cirúrgico' e 'Cirurgico' são o mesmo setor", () => {
    expect(chaveDeSetor("Centro Cirúrgico")).toBe(chaveDeSetor("Centro Cirurgico"));
    expect(chaveDeSetor("Centro Cirúrgico")).toBe("centro cirurgico");
  });
  it("🔴 ignora caixa — é a divergência mais comum na digitação", () => {
    expect(chaveDeSetor("POSTO 2")).toBe(chaveDeSetor("posto 2"));
  });
  it("colapsa espaço repetido e apara as pontas", () => {
    expect(chaveDeSetor("  Posto   2  ")).toBe("posto 2");
  });
  it("entrada ausente não vira 'undefined'", () => {
    expect(chaveDeSetor(null)).toBe("");
    expect(chaveDeSetor(undefined)).toBe("");
  });
});

describe("normalizarSetor — o que se grava", () => {
  it("apara sem descaracterizar", () => {
    // Diferente da chave: aqui o acento e a caixa são PRESERVADOS, porque
    // é o texto que vai aparecer na tela.
    expect(normalizarSetor("  Centro   Cirúrgico ")).toBe("Centro Cirúrgico");
  });
  it("vazio continua vazio", () => {
    expect(normalizarSetor("   ")).toBe("");
    expect(normalizarSetor(null)).toBe("");
  });
});

describe("casarComCatalogo", () => {
  it("🔴 digitar 'posto 2' grava 'POSTO 2' — é o ponto da correção", () => {
    const r = casarComCatalogo("posto 2", CATALOGO);
    expect(r.nome).toBe("POSTO 2");
    expect(r.doCatalogo).toBe(true);
  });

  it("encaixa mesmo sem acento", () => {
    expect(casarComCatalogo("centro cirurgico", CATALOGO).nome).toBe("Centro Cirúrgico");
  });

  it("encaixa com espaço sobrando", () => {
    expect(casarComCatalogo("  UTI  ", CATALOGO).nome).toBe("UTI");
  });

  it("🔴 setor fora do catálogo é ACEITO, normalizado", () => {
    // Recusar aqui impediria registrar uma saída real por causa de um
    // cadastro que ninguém fez ainda — pararia o almoxarifado.
    const r = casarComCatalogo("  Sala   Amarela ", CATALOGO);
    expect(r.nome).toBe("Sala Amarela");
    expect(r.doCatalogo).toBe(false);
  });

  it("vazio não vira setor", () => {
    expect(casarComCatalogo("   ", CATALOGO)).toEqual({ nome: "", doCatalogo: false });
  });

  it("catálogo ausente não quebra", () => {
    expect(casarComCatalogo("Posto 2").nome).toBe("Posto 2");
    expect(casarComCatalogo("Posto 2", null).doCatalogo).toBe(false);
  });
});

describe("ehSetorNovo", () => {
  it("do catálogo não é novo", () => {
    expect(ehSetorNovo("posto 2", CATALOGO)).toBe(false);
  });
  it("fora do catálogo é novo — a tela avisa, não bloqueia", () => {
    expect(ehSetorNovo("Sala Amarela", CATALOGO)).toBe(true);
  });
  it("vazio não é setor novo", () => {
    expect(ehSetorNovo("", CATALOGO)).toBe(false);
  });
});

describe("agruparPorSetor — conserta o relatório sem reescrever o passado", () => {
  const movs = [
    { setor: "POSTO 2", quantidade: 10 },
    { setor: "posto 2", quantidade: 5 },
    { setor: " Posto  2 ", quantidade: 3 },
    { setor: "UTI", quantidade: 20 },
    { setor: "", quantidade: 99 },
    { setor: null, quantidade: 99 },
  ];

  it("🔴 soma as três grafias na mesma linha", () => {
    const r = agruparPorSetor(movs, CATALOGO);
    const posto = r.find(x => x.setor === "POSTO 2");
    expect(posto.quantidade).toBe(18);
    expect(posto.movimentos).toBe(3);
  });

  it("usa o nome do catálogo como rótulo da linha", () => {
    const r = agruparPorSetor(movs, CATALOGO);
    expect(r.map(x => x.setor)).toContain("POSTO 2");
    expect(r.map(x => x.setor)).not.toContain("posto 2");
  });

  it("expõe as variantes encontradas — é o que permite decidir se vale corrigir", () => {
    const posto = agruparPorSetor(movs, CATALOGO).find(x => x.setor === "POSTO 2");
    expect(posto.variantes).toEqual(["POSTO 2", "Posto 2", "posto 2"]);
  });

  it("movimento sem setor não vira linha fantasma", () => {
    const r = agruparPorSetor(movs, CATALOGO);
    expect(r.some(x => !x.setor)).toBe(false);
    expect(r.reduce((s, x) => s + x.quantidade, 0)).toBe(38);
  });

  it("ordena pelo maior consumo", () => {
    const r = agruparPorSetor(movs, CATALOGO);
    expect(r[0].setor).toBe("UTI");
  });

  it("sem catálogo ainda agrupa pelas grafias equivalentes", () => {
    const r = agruparPorSetor([{ setor: "posto 2", quantidade: 1 }, { setor: "POSTO 2", quantidade: 1 }]);
    expect(r).toHaveLength(1);
    expect(r[0].quantidade).toBe(2);
  });

  it("lista vazia devolve vazio", () => {
    expect(agruparPorSetor([], CATALOGO)).toEqual([]);
    expect(agruparPorSetor()).toEqual([]);
  });
});
