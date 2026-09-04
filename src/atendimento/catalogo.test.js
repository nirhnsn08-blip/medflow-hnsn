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

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  CATALOGOS, CATALOGO_POR_CHAVE, TIPOS_DE_CONVENIO, TABELAS_DE_PROCEDIMENTO,
  normalizarCodigo, lerCbos, validarCatalogo, corpoDoCatalogo, contaComo,
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

// 🔴 `valor_sus` e `via_sus` existiam no banco desde a fase de faturamento e o
// `corpoDoCatalogo` NÃO os mandava — a única forma de cadastrar preço e via
// era pelo SQL Editor. E a via muda por PORTARIA, várias vezes por ano: era
// exatamente o que o cabeçalho da migração dizia que a tela existia para
// evitar.
describe("preço e via do procedimento", () => {
  const proc = extra => ({ codigo: "0301010010", nome: "Consulta", tabela: "sigtap", cbos_compativeis: "225125", ...extra });

  it("o preço vai para o banco em REAIS, e o ponto ambíguo é resolvido", () => {
    // a coluna é numeric(12,2), em reais — e "10.50" é dez e cinquenta,
    // enquanto "1.234,56" é mil duzentos e trinta e quatro.
    expect(corpoDoCatalogo("procedimentos", proc({ valor_sus: "10,50" })).valor_sus).toBe(10.5);
    expect(corpoDoCatalogo("procedimentos", proc({ valor_sus: "10.50" })).valor_sus).toBe(10.5);
    expect(corpoDoCatalogo("procedimentos", proc({ valor_sus: "1.234,56" })).valor_sus).toBe(1234.56);
  });

  it("SEM preço é `null`, e de graça é 0 — não são a mesma coisa", () => {
    // nulo é "ninguém cadastrou" e a tela imprime "—"; zero é "de graça" e
    // imprime R$ 0,00. Colapsar os dois faz a conta fechar zerada com cara
    // de conta fechada.
    expect(corpoDoCatalogo("procedimentos", proc({ valor_sus: "" })).valor_sus).toBeNull();
    expect(corpoDoCatalogo("procedimentos", proc({})).valor_sus).toBeNull();
    expect(corpoDoCatalogo("procedimentos", proc({ valor_sus: "0" })).valor_sus).toBe(0);
  });

  it("a via só aceita as três do SUS — TISS e direta vêm do convênio", () => {
    for (const v of ["bpa", "apac", "aih"]) {
      expect(corpoDoCatalogo("procedimentos", proc({ via_sus: v })).via_sus).toBe(v);
    }
    // marcar "tiss" num procedimento faria alguém esperar que isso mudasse
    // a via de um atendimento SUS — não muda, então nem entra.
    for (const v of ["tiss", "direta", "xpto", "", null]) {
      expect(corpoDoCatalogo("procedimentos", proc({ via_sus: v })).via_sus).toBeNull();
    }
  });

  it("valor que não vira número é ERRO, não `null` calado", () => {
    // gravar null em silencio faz a tela mostrar "—" e a pessoa achar que
    // cadastrou o preço.
    const r = validarCatalogo("procedimentos", proc({ valor_sus: "dez reais" }), []);
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/não é um valor/i);
  });

  it("via em branco NÃO avisa — em branco é o caso normal, e cai em BPA", () => {
    // Avisar aqui dispararia em quase todo procedimento do catálogo, e
    // alarme que sempre dispara ensina a ignorar a lista onde mora "algum
    // CBO não tem 6 dígitos". A consequência é dita no campo, na tela.
    const r = validarCatalogo("procedimentos", proc({}), []);
    expect(r.ok).toBe(true);
    expect(r.avisos).toEqual([]);
  });
});

// 🔴 A migração da fase 2 planta `extras: {"conta_como":"primeira"}` nos tipos
// de sistema, com um comentário dizendo que é isso que o indicador usa — e
// NADA no código lia `extras`. Um tipo novo cadastrado pela tela somava zero
// no relatório e não errava em lugar nenhum. Semente morta no banco.
describe("conta_como — o que faz o tipo aparecer na coluna certa", () => {
  const tipos = [
    { codigo: "primeira_consulta", extras: { conta_como: "primeira" } },
    { codigo: "retorno", extras: { conta_como: "retorno" } },
    { codigo: "retorno_pos_op", extras: { conta_como: "retorno" } },   // criado pela tela
    { codigo: "avulso", extras: {} },
  ];

  it("lê do CADASTRO, não do código — é o que faz o tipo novo somar", () => {
    expect(contaComo("retorno_pos_op", tipos)).toBe("retorno");
    expect(contaComo("primeira_consulta", tipos)).toBe("primeira");
  });

  it("tipo sem conta_como não entra em coluna nenhuma", () => {
    expect(contaComo("avulso", tipos)).toBeNull();
  });

  it("sem catálogo em mãos, o código de sistema ainda vale — não apaga produção", () => {
    // Este recuo é o que impede a mudança de zerar o relatório de quem já
    // usa os tipos plantados pela migração, em banco sem `extras`.
    expect(contaComo("primeira_consulta", [])).toBe("primeira");
    expect(contaComo("retorno", [])).toBe("retorno");
    expect(contaComo("inventado", [])).toBeNull();
    expect(contaComo("", [])).toBeNull();
    expect(contaComo(null, null)).toBeNull();
  });

  it("o corpo manda `extras` só no tipo de atendimento", () => {
    const t = corpoDoCatalogo("tipo_atendimento", { codigo: "X", nome: "X", conta_como: "retorno" });
    expect(t.extras).toEqual({ conta_como: "retorno" });
    // Nos outros domínios `extras` nem vai: mandar `{}` sobrescreveria de
    // graça o que o banco já tem.
    expect(corpoDoCatalogo("carater", { codigo: "X", nome: "X" }).extras).toBeUndefined();
  });

  it("conta_como inválido não vira extras", () => {
    const t = corpoDoCatalogo("tipo_atendimento", { codigo: "X", nome: "X", conta_como: "xpto" });
    expect(t.extras).toEqual({});
  });
});

// ═══════════════════════════════════════════════════════════
// 🔴 A CHAVE DO CATÁLOGO EXISTE?
//
// `corpoDoCatalogo` decide campos por `if (chave === "…")`. Uma chave
// escrita errada não dá erro: o bloco nunca roda, os campos daquele
// catálogo não são gravados, e a tela salva sem reclamar.
//
// Aconteceu em 03/09/2026: escrevi `"especialidades"` (plural) e a chave é
// `"especialidade"`. As metas do ambulatório simplesmente não iriam para o
// banco — e o sintoma seria o gestor editando a meta, salvando, e o número
// voltando ao anterior na próxima abertura.
// ═══════════════════════════════════════════════════════════
describe("🔴 toda chave testada em corpoDoCatalogo existe no catálogo", () => {
  const fonte = readFileSync(
    join(process.cwd(), "src", "atendimento", "catalogo.js"), "utf8");
  const validas = new Set(CATALOGOS.map(c => c.chave));

  const usadas = [...fonte.matchAll(/chave === "([a-z_]+)"/g)].map(m => m[1]);

  it("⚠️ e a busca acha alguma (senão o teste é decorativo)", () => {
    expect(usadas.length).toBeGreaterThan(2);
  });

  for (const chave of [...new Set(usadas)]) {
    it(`"${chave}"`, () => {
      expect(validas.has(chave),
        `"${chave}" não é chave de catálogo — o bloco nunca roda e os campos não são gravados. Válidas: ${[...validas].join(", ")}`
      ).toBe(true);
    });
  }
});

// ═══════════════════════════════════════════════════════════
// 🔴 EDITAR UMA META NÃO PODE APAGAR AS OUTRAS
//
// Achado caminhando no demo em 03/09/2026: mudei a meta MENSAL do Cirurgia
// Geral de 360 para 400, salvei, e a meta ANUAL foi de 4320 para `null`.
//
// A causa é a assimetria entre ler e gravar: o formulário lê de `extras`,
// mas só devolve o campo que a pessoa mexeu — os outros chegam `undefined`.
// Tratar `undefined` como vazio apaga o que estava lá, sem erro nenhum.
//
//   undefined → não tocou  → mantém
//   ""        → limpou     → apaga de propósito
// ═══════════════════════════════════════════════════════════
describe("🔴 as metas da especialidade", () => {
  const linha = extras => ({ codigo: "CIRURGIA_GERAL", nome: "Cirurgia Geral", extras });
  const atuais = { painel_id: "cirurgia_geral", meta_mensal: 360, meta_anual: 4320, meta_primeiras: 1320 };

  it("editar só a mensal PRESERVA a anual e a de primeiras", () => {
    const c = corpoDoCatalogo("especialidade", { ...linha(atuais), meta_mensal: "400" });
    expect(c.extras.meta_mensal).toBe(400);
    expect(c.extras.meta_anual, "a anual foi apagada por não ter sido tocada").toBe(4320);
    expect(c.extras.meta_primeiras).toBe(1320);
  });

  it("⚠️ mas limpar o campo APAGA — vazio é decisão, não descuido", () => {
    const c = corpoDoCatalogo("especialidade", { ...linha(atuais), meta_anual: "" });
    expect(c.extras.meta_anual).toBe(null);
    expect(c.extras.meta_mensal, "a mensal não foi tocada").toBe(360);
  });

  it("🔴 meta vazia é `null`, NUNCA zero", () => {
    // Zero significaria "pactuamos não atender ninguém", e o painel
    // calcularia 100% de cumprimento sobre ela.
    const c = corpoDoCatalogo("especialidade", { ...linha({}), meta_mensal: "" });
    expect(c.extras.meta_mensal).toBe(null);
    expect(c.extras.meta_mensal).not.toBe(0);
  });

  it("zero digitado de propósito continua zero", () => {
    const c = corpoDoCatalogo("especialidade", { ...linha({}), meta_mensal: "0" });
    expect(c.extras.meta_mensal).toBe(0);
  });

  it("texto que não é número não vira meta", () => {
    const c = corpoDoCatalogo("especialidade", { ...linha({}), meta_mensal: "muitas" });
    expect(c.extras.meta_mensal).toBe(null);
  });

  it("🔴 o `painel_id` NUNCA vem do formulário — ele amarra o histórico", () => {
    // Trocá-lo desconectaria a produção já gravada em
    // `atendimentos.especialidade`, sem erro em lugar nenhum.
    const c = corpoDoCatalogo("especialidade", {
      ...linha(atuais), painel_id: "outra_coisa", codigo: "MUDEI",
    });
    expect(c.extras.painel_id).toBe("cirurgia_geral");
  });

  it("especialidade NOVA ganha painel_id derivado do código", () => {
    const c = corpoDoCatalogo("especialidade", { codigo: "CARDIOLOGIA", nome: "Cardiologia" });
    expect(c.extras.painel_id).toBe("cardiologia");
  });
});
