// ═══════════════════════════════════════════════════════════
// AS REGRAS DO CADASTRO DAS TABELAS
//
// O que estes testes protegem:
//
//   1. CÓDIGO DUPLICADO NÃO PASSA. O atendimento guarda o CÓDIGO, não o
//      id. Dois convênios com o mesmo código tornam impossível saber,
//      meses depois, de qual convênio era aquela conta.
//   2. SUS NÃO GRAVA EXIGÊNCIA DE CARTEIRA nem que alguém marque na tela.
//      A regra some no banco, não só na interface.
//   3. O CORPO NÃO LEVA CHAVE A MAIS. Chave que não é coluna faz o
//      PostgREST recusar o INSERT inteiro — em silêncio. Já aconteceu
//      neste sistema.
//   4. A LISTA DE CATÁLOGOS ACOMPANHA A FICHA. Se um domínio novo entrar
//      em ficha.js e não tiver onde ser cadastrado, o campo aparece na
//      recepção sem nunca poder ser preenchido.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  CATALOGOS, CATALOGO_POR_CHAVE, TIPOS_DE_CONVENIO, TABELAS_DE_PROCEDIMENTO,
  normalizarCodigo, lerCbos, validarCatalogo, corpoDoCatalogo,
} from "./catalogo.js";
import { DOMINIOS } from "./ficha.js";

describe("o catálogo cobre tudo que a ficha pede", () => {
  it("todo domínio da ficha tem onde ser cadastrado", () => {
    for (const d of DOMINIOS) {
      expect(CATALOGO_POR_CHAVE[d.chave], `falta cadastro para '${d.chave}'`).toBeDefined();
    }
  });

  it("convênios, planos e procedimentos também estão lá", () => {
    for (const c of ["convenios", "planos", "procedimentos"]) {
      expect(CATALOGO_POR_CHAVE[c]).toBeDefined();
    }
  });

  it("cada catálogo aponta para uma tabela do banco", () => {
    for (const c of CATALOGOS) expect(c.tabela).toMatch(/^at_/);
  });
});

describe("normalização", () => {
  it("código vira maiúsculo, sem acento e sem espaço nas pontas", () => {
    expect(normalizarCodigo("  únimed ")).toBe("UNIMED");
    expect(normalizarCodigo(null)).toBe("");
  });

  it("CBO aceita vírgula, ponto e vírgula, espaço e pontuação", () => {
    expect(lerCbos("225125, 2252-65; 223505")).toEqual(["225125", "225265", "223505"]);
    expect(lerCbos("")).toEqual([]);
    expect(lerCbos(null)).toEqual([]);
  });
});

describe("validação — o básico", () => {
  it("exige código e nome", () => {
    const r = validarCatalogo("convenios", { tipo: "sus" });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/código/i);
    expect(r.erros.join(" ")).toMatch(/nome/i);
  });

  it("catálogo desconhecido não passa", () => {
    expect(validarCatalogo("inventado", { codigo: "X", nome: "X" }).ok).toBe(false);
  });

  it("código duplicado é recusado, e a mensagem explica o porquê", () => {
    const existentes = [{ id: 1, codigo: "UNIMED" }];
    const r = validarCatalogo("convenios", { codigo: "unimed", nome: "Unimed 2", tipo: "convenio" }, existentes);
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/guarda o código/);
  });

  it("editar o próprio registro não acusa duplicidade", () => {
    const existentes = [{ id: 1, codigo: "UNIMED" }];
    const r = validarCatalogo("convenios", { id: 1, codigo: "UNIMED", nome: "Unimed", tipo: "convenio" }, existentes);
    expect(r.ok).toBe(true);
  });
});

describe("validação — convênios", () => {
  it("exige um tipo conhecido", () => {
    expect(validarCatalogo("convenios", { codigo: "X", nome: "X" }).ok).toBe(false);
    expect(validarCatalogo("convenios", { codigo: "X", nome: "X", tipo: "chute" }).ok).toBe(false);
    for (const t of TIPOS_DE_CONVENIO) {
      expect(validarCatalogo("convenios", { codigo: "X", nome: "X", tipo: t.chave }).ok).toBe(true);
    }
  });

  it("avisa que marcar carteira no SUS não vai valer", () => {
    const r = validarCatalogo("convenios", { codigo: "SUS", nome: "SUS", tipo: "sus", exige_carteira: true });
    expect(r.ok).toBe(true);
    expect(r.avisos.join(" ")).toMatch(/não terão efeito/);
  });

  it("convênio sem registro ANS avisa sobre a guia TISS", () => {
    const r = validarCatalogo("convenios", { codigo: "UNI", nome: "Unimed", tipo: "convenio" });
    expect(r.ok).toBe(true);
    expect(r.avisos.join(" ")).toMatch(/TISS/);
  });

  it("SUS não é cobrado por registro ANS", () => {
    const r = validarCatalogo("convenios", { codigo: "SUS", nome: "SUS", tipo: "sus" });
    expect(r.avisos.join(" ")).not.toMatch(/ANS/);
  });
});

describe("validação — planos e procedimentos", () => {
  it("plano sem convênio não passa", () => {
    expect(validarCatalogo("planos", { codigo: "P1", nome: "Plano" }).ok).toBe(false);
    expect(validarCatalogo("planos", { codigo: "P1", nome: "Plano", convenio_id: 2 }).ok).toBe(true);
  });

  it("procedimento exige tabela de origem conhecida", () => {
    expect(validarCatalogo("procedimentos", { codigo: "1", nome: "X" }).ok).toBe(false);
    for (const t of TABELAS_DE_PROCEDIMENTO) {
      expect(validarCatalogo("procedimentos", { codigo: "1", nome: "X", tabela: t.chave }).ok).toBe(true);
    }
  });

  it("procedimento sem CBO avisa o que se perde", () => {
    const r = validarCatalogo("procedimentos", { codigo: "1", nome: "X", tabela: "sigtap" });
    expect(r.avisos.join(" ")).toMatch(/rejeitada/);
  });

  it("CBO com tamanho errado avisa", () => {
    const r = validarCatalogo("procedimentos", { codigo: "1", nome: "X", tabela: "sigtap", cbos_compativeis: "2251" });
    expect(r.avisos.join(" ")).toMatch(/6 dígitos/);
  });

  it("CBO certo não gera aviso", () => {
    const r = validarCatalogo("procedimentos", { codigo: "1", nome: "X", tabela: "sigtap", cbos_compativeis: "225125" });
    expect(r.avisos).toEqual([]);
  });
});

describe("o corpo que vai para o banco", () => {
  it("SUS grava exigências como falsas, mesmo marcadas na tela", () => {
    const c = corpoDoCatalogo("convenios", {
      codigo: "SUS", nome: "SUS", tipo: "sus",
      exige_carteira: true, exige_autorizacao: true,
    });
    expect(c.exige_carteira).toBe(false);
    expect(c.exige_autorizacao).toBe(false);
  });

  it("convênio respeita o que foi marcado", () => {
    const c = corpoDoCatalogo("convenios", {
      codigo: "UNI", nome: "Unimed", tipo: "convenio", exige_autorizacao: true,
    });
    expect(c.exige_carteira).toBe(true);
    expect(c.exige_autorizacao).toBe(true);
  });

  it("procedimento grava os CBOs como array de dígitos", () => {
    const c = corpoDoCatalogo("procedimentos", {
      codigo: "0301010072", nome: "Consulta", tabela: "sigtap",
      cbos_compativeis: "2251-25, 225265",
    });
    expect(c.cbos_compativeis).toEqual(["225125", "225265"]);
  });

  it("domínio carrega de qual lista ele é", () => {
    const c = corpoDoCatalogo("tipo_paciente", { codigo: "AMB", nome: "Ambulatorial", ordem: "3" });
    expect(c.dominio).toBe("tipo_paciente");
    expect(c.ordem).toBe(3);
  });

  it("ordem inválida vira zero, não NaN", () => {
    // NaN no corpo vira `null` no JSON e a ordenação some sem avisar.
    expect(corpoDoCatalogo("destino", { codigo: "X", nome: "X", ordem: "abc" }).ordem).toBe(0);
    expect(corpoDoCatalogo("destino", { codigo: "X", nome: "X" }).ordem).toBe(0);
  });

  it("não leva chave que não é coluna daquela tabela", () => {
    const conv = corpoDoCatalogo("convenios", { codigo: "X", nome: "X", tipo: "sus", convenio_id: 9, dominio: "lixo", ordem: 5 });
    expect(conv.convenio_id).toBeUndefined();
    expect(conv.dominio).toBeUndefined();
    expect(conv.ordem).toBeUndefined();

    const dom = corpoDoCatalogo("carater", { codigo: "X", nome: "X", tipo: "sus", cbos_compativeis: "1" });
    expect(dom.tipo).toBeUndefined();
    expect(dom.cbos_compativeis).toBeUndefined();
  });

  it("ativo é true por padrão e respeita o desligamento", () => {
    expect(corpoDoCatalogo("carater", { codigo: "X", nome: "X" }).ativo).toBe(true);
    expect(corpoDoCatalogo("carater", { codigo: "X", nome: "X", ativo: false }).ativo).toBe(false);
  });

  it("na edição o id vai junto; na criação não", () => {
    expect(corpoDoCatalogo("carater", { codigo: "X", nome: "X" }).id).toBeUndefined();
    expect(corpoDoCatalogo("carater", { id: 7, codigo: "X", nome: "X" }).id).toBe(7);
  });
});
