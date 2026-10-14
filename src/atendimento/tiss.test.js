// ═══════════════════════════════════════════════════════════
// TISS — A GUIA
//
// 🔴 MEDIDO ANTES DE ESCREVER (14/10/2026): nenhuma tabela com "guia" no
// nome, em 118 tabelas. E `codigo_prestador` — o código do hospital DENTRO
// da operadora — não existia em coluna nenhuma do schema. Sem ele nenhuma
// guia é emitida, porque é por ele que a operadora sabe quem está cobrando.
//
// O sistema já tinha a via `tiss`, o preço por operadora, o registro ANS e
// o conselho/UF/CBO do profissional. Faltava o documento.
//
// As recusas de verdade estão no gatilho (migracao-tiss-guias.sql, provado
// em PGlite: 42 cenários). Aqui está o que a tela sabe antes de mandar — e
// com as MESMAS palavras, porque ver uma explicação na tela e outra no erro
// do banco é a forma mais rápida de alguém parar de ler as duas.
//
// ⚠️ O XML NÃO É TESTADO AQUI PORQUE NÃO EXISTE: recusa deliberada,
// a mesma de `faturamento.js`. A ANS publica o XSD, então o gerador é
// escrevível no dia em que o arquivo estiver em mãos.
// ═══════════════════════════════════════════════════════════

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  TIPOS_GUIA, CARATERES, STATUS_GUIA, MIN_MOTIVO_CANCELAMENTO,
  estadoDaGuia, jaSaiu, pendenciasParaEmitir, conferirEmissao,
  conferirCancelamento, linhaDaGuia, guiaVazia, resumoDasGuias, contasSemGuia,
} from "./tiss.js";
import { FALHA } from "../util/leitura.js";

const CONTA = { id: 7, via: "tiss", status: "fechada", convenio_id: 1, prontuario: "T9060" };
const CONVENIO = { id: 1, nome: "Unimed Teste", registro_ans: "301337", codigo_prestador: "HNSN001" };
const PROF = { nome: "Dra. Ana", conselho: "CRM", registro_conselho: "1234", uf_conselho: "PR", cbo: "225125" };
const GUIA = { tipo: "sp_sadt", beneficiario_carteira: "0099887766" };
const ITEM = { conta_id: 7, codigo: "10101012", tabela: "tuss" };

const ctx = (over = {}) => ({
  guia: GUIA, conta: CONTA, convenio: CONVENIO, itens: [ITEM], profissional: PROF, ...over,
});
const chaves = l => l.map(x => x.chave);

// ── O CAMINHO LIMPO ─────────────────────────────────────────
describe("guia completa pode ser emitida", () => {
  it("nada a apontar", () => {
    expect(pendenciasParaEmitir(ctx())).toEqual([]);
    expect(conferirEmissao(ctx())).toBeNull();
  });
});

// ── O QUE FALTAVA NO SCHEMA ─────────────────────────────────
describe("🔴 o código do prestador — não existia em coluna nenhuma", () => {
  it("sem ele a guia não sai, e a mensagem diz para que serve", () => {
    const p = pendenciasParaEmitir(ctx({ convenio: { ...CONVENIO, codigo_prestador: "" } }));
    const x = p.find(y => y.chave === "sem_codigo_prestador");
    expect(x.texto).toMatch(/quem está cobrando/);
    expect(x.texto).toMatch(/Unimed Teste/);
    expect(x.onde).toMatch(/Convênios/);
  });

  it("sem registro ANS também não sai", () => {
    const p = pendenciasParaEmitir(ctx({ convenio: { ...CONVENIO, registro_ans: "" } }));
    expect(chaves(p)).toContain("sem_registro_ans");
  });

  it("sem operadora nenhuma", () => {
    expect(chaves(pendenciasParaEmitir(ctx({ convenio: null })))).toContain("sem_operadora");
  });
});

// ── A VIA ───────────────────────────────────────────────────
describe("🔴 guia TISS sobre conta do SUS é cobrança indevida", () => {
  it("recusa, e para de conferir o resto", () => {
    // Cobrar a operadora por uma conta que o SUS paga é cobrar duas vezes
    // pela mesma coisa — e do lado errado. Continuar listando "falta a
    // carteira" distrairia do que importa.
    const p = pendenciasParaEmitir(ctx({ conta: { ...CONTA, via: "aih" } }));
    expect(chaves(p)).toEqual(["via_errada"]);
    expect(p[0].texto).toMatch(/cobrança indevida/);
  });

  it("conta sem via nenhuma também recusa", () => {
    const p = pendenciasParaEmitir(ctx({ conta: { ...CONTA, via: null } }));
    expect(p[0].texto).toMatch(/sem via/);
  });

  it("🔴 e para MESMO quando há outras pendências — não lista as duas", () => {
    // ⚠️ Com o fixture completo esta prova não vale nada: sem outra
    // pendência para listar, tirar o `return` não muda o resultado. Era uma
    // mutação INERTE, e o verde dela era enganoso. Aqui a conta está na via
    // errada E sem carteira E sem profissional: se o `return` sumisse, a
    // lista viria com três itens.
    const p = pendenciasParaEmitir({
      guia: { tipo: "sp_sadt" }, conta: { ...CONTA, via: "aih" },
      convenio: null, itens: [], profissional: null,
    });
    expect(chaves(p)).toEqual(["via_errada"]);
  });

  it("sem conta nenhuma", () => {
    expect(chaves(pendenciasParaEmitir(ctx({ conta: null })))).toEqual(["sem_conta"]);
  });
});

// ── O BENEFICIÁRIO ──────────────────────────────────────────
describe("o beneficiário", () => {
  it("sem carteira a guia é recusada pela operadora", () => {
    const p = pendenciasParaEmitir(ctx({ guia: { ...GUIA, beneficiario_carteira: "" } }));
    expect(chaves(p)).toContain("sem_carteira");
  });
});

// ── O PROFISSIONAL ──────────────────────────────────────────
describe("🔴 os quatro campos do profissional", () => {
  it("sem UF: recusa, e diz por quê — o mesmo CRM existe em 27 estados", () => {
    const p = pendenciasParaEmitir(ctx({ profissional: { ...PROF, uf_conselho: "" } }));
    const x = p.find(y => y.chave === "profissional_incompleto");
    expect(x.texto).toMatch(/27 estados/);
    expect(x.texto).toMatch(/sem UF/);
  });

  it("nomeia TODOS os que faltam, não só o primeiro", () => {
    // Dizer um por vez faria a pessoa salvar quatro vezes para descobrir
    // os quatro.
    //
    // ⚠️ A ASSERÇÃO OLHA SÓ O TRECHO "está sem …", e isso é o conserto de um
    // teste que não provava nada: a mesma frase EXPLICA depois que "a guia
    // leva conselho, número, UF e CBO". Procurar as quatro palavras no texto
    // inteiro casava com a explicação, então o teste passava verde mesmo
    // nomeando um campo só. Pego por mutação.
    const p = pendenciasParaEmitir(ctx({ profissional: { nome: "X" } }));
    const x = p.find(y => y.chave === "profissional_incompleto");
    const lista = x.texto.match(/está sem ([^.]+)\./)[1];
    expect(lista).toBe("conselho, número, UF, CBO");
  });

  it("falta UM campo: a lista tem só ele", () => {
    const p = pendenciasParaEmitir(ctx({ profissional: { ...PROF, cbo: "" } }));
    const x = p.find(y => y.chave === "profissional_incompleto");
    expect(x.texto.match(/está sem ([^.]+)\./)[1]).toBe("CBO");
  });

  it("aceita o profissional vindo da própria guia, com os nomes de lá", () => {
    // A guia carimba `profissional_*`; o cadastro usa `conselho`,
    // `registro_conselho`, `uf_conselho`, `cbo`. Os dois têm de servir.
    const p = pendenciasParaEmitir(ctx({
      profissional: null,
      guia: { ...GUIA, profissional_conselho: "CRM", profissional_registro: "1", profissional_uf: "SP", profissional_cbo: "225125" },
    }));
    expect(chaves(p)).not.toContain("profissional_incompleto");
  });
});

// ── OS ITENS ────────────────────────────────────────────────
describe("os itens", () => {
  it("conta sem item é cobrança de nada", () => {
    expect(chaves(pendenciasParaEmitir(ctx({ itens: [] })))).toContain("sem_itens");
  });

  it("item cancelado não conta como item", () => {
    expect(chaves(pendenciasParaEmitir(ctx({ itens: [{ ...ITEM, cancelado: true }] }))))
      .toContain("sem_itens");
  });

  it("🔴 item sem a TABELA do código é apontado — o número é ambíguo", () => {
    // O mesmo "10101012" existe no SIGTAP e no TUSS querendo dizer coisas
    // diferentes. Não derruba a guia no papel; derruba o XML — e é agora
    // que dá para consertar.
    const p = pendenciasParaEmitir(ctx({ itens: [ITEM, { conta_id: 7, codigo: "x" }] }));
    const x = p.find(y => y.chave === "item_sem_tabela");
    expect(x.texto).toMatch(/1 de 2/);
    expect(x.texto).toMatch(/SIGTAP e no TUSS/);
  });
});

// ── O TIPO ──────────────────────────────────────────────────
describe("o tipo da guia", () => {
  it("os quatro do padrão, e nada mais", () => {
    expect(TIPOS_GUIA.map(t => t.chave)).toEqual(["consulta", "sp_sadt", "internacao", "honorarios"]);
    expect(CARATERES.map(c => c.chave)).toEqual(["eletiva", "urgencia"]);
  });

  it("tipo inventado é recusado", () => {
    expect(chaves(pendenciasParaEmitir(ctx({ guia: { ...GUIA, tipo: "odontologica" } }))))
      .toContain("sem_tipo");
  });

  it("todo tipo explica QUANDO se usa", () => {
    // Quatro rótulos sem explicação fazem a recepção escolher o primeiro.
    for (const t of TIPOS_GUIA) expect(t.quando.length).toBeGreaterThan(20);
  });
});

// ── O CICLO DE VIDA ─────────────────────────────────────────
describe("🔴 o ciclo de vida da guia", () => {
  it("os seis estados, na ordem em que acontecem", () => {
    expect(STATUS_GUIA.map(s => s.chave)).toEqual(
      ["rascunho", "emitida", "enviada", "paga", "glosada", "cancelada"]);
  });

  it("🔴 status desconhecido lê-se como RASCUNHO, nunca como paga", () => {
    // Lê-lo como resolvido é sumir com dinheiro a receber.
    expect(estadoDaGuia({ status: "quase_paga" }).chave).toBe("rascunho");
    expect(estadoDaGuia(null).chave).toBe("rascunho");
    expect(estadoDaGuia({}).chave).toBe("rascunho");
  });

  it("🔴 glosada NÃO é estado final — a glosa se recorre", () => {
    // Tratá-la como final faria a guia sumir da tela de quem tem de
    // recorrer dentro do prazo.
    expect(STATUS_GUIA.find(s => s.chave === "glosada").final).toBe(false);
    expect(STATUS_GUIA.find(s => s.chave === "paga").final).toBe(true);
  });

  it("jaSaiu diz o que não muda mais", () => {
    for (const s of ["emitida", "enviada", "paga", "glosada"]) {
      expect(jaSaiu({ status: s }), s).toBe(true);
    }
    expect(jaSaiu({ status: "rascunho" })).toBe(false);
    expect(jaSaiu({ status: "cancelada" })).toBe(false);
  });
});

// ── O CANCELAMENTO ──────────────────────────────────────────
describe("o cancelamento", () => {
  it("exige motivo, e diz onde o dinheiro some sem ele", () => {
    const r = conferirCancelamento("x");
    expect(r).toMatch(new RegExp(`${MIN_MOTIVO_CANCELAMENTO} caracteres`));
    expect(r).toMatch(/conciliação com a operadora/);
  });
  it("com motivo passa", () => {
    expect(conferirCancelamento("emitida em duplicidade pela recepção")).toBeNull();
  });
});

// ── O QUE VAI PARA O BANCO ──────────────────────────────────
describe("🔴 a tela não manda o que o gatilho carimba", () => {
  it("nem número, nem emissão, nem ANS, nem código do prestador", () => {
    // Mandar o número daqui deixaria a TELA decidir o número da guia — e é
    // o número que impede cobrança duplicada.
    const l = linhaDaGuia(GUIA, { conta: CONTA, convenio: CONVENIO, profissional: PROF });
    expect(l).not.toHaveProperty("numero_prestador");
    expect(l).not.toHaveProperty("emitida_em");
    expect(l).not.toHaveProperty("registro_ans");
    expect(l).not.toHaveProperty("codigo_prestador");
    expect(l).not.toHaveProperty("status");
  });

  it("leva o profissional do cadastro, com os nomes da guia", () => {
    const l = linhaDaGuia(GUIA, { conta: CONTA, convenio: CONVENIO, profissional: PROF });
    expect(l.profissional_conselho).toBe("CRM");
    expect(l.profissional_registro).toBe("1234");
    expect(l.profissional_uf).toBe("PR");
    expect(l.profissional_cbo).toBe("225125");
  });

  it("campo vazio vira null, não string vazia", () => {
    const l = linhaDaGuia(guiaVazia(), { conta: CONTA, convenio: CONVENIO });
    expect(l.beneficiario_carteira).toBeNull();
    expect(l.senha).toBeNull();
  });

  it("a guia vazia nasce em sp_sadt e eletiva", () => {
    expect(guiaVazia()).toMatchObject({ tipo: "sp_sadt", carater: "eletiva" });
  });

  it("o convênio da conta serve quando a guia não traz um", () => {
    expect(linhaDaGuia(GUIA, { conta: CONTA }).convenio_id).toBe(1);
  });
});

// ── O PAINEL ────────────────────────────────────────────────
describe("o resumo das guias", () => {
  const guias = [
    { status: "rascunho" }, { status: "emitida" }, { status: "enviada" },
    { status: "paga" }, { status: "glosada" }, { status: "cancelada" },
  ];

  it("os baldes fecham com o total", () => {
    const r = resumoDasGuias(guias);
    expect(r.total).toBe(6);
    expect(r.rascunho + r.emitida + r.enviada + r.paga + r.glosada + r.cancelada).toBe(r.total);
  });

  it("🔴 aguardando resposta é emitida + enviada — rascunho nem saiu", () => {
    expect(resumoDasGuias(guias).aguardandoResposta).toBe(2);
  });

  it("FALHA atravessa", () => expect(resumoDasGuias(FALHA)).toBeNull());
});

describe("🔴 conta de convênio fechada e SEM guia é dinheiro não cobrado", () => {
  const contas = [
    { id: 1, via: "tiss", status: "fechada" },
    { id: 2, via: "tiss", status: "fechada" },
    { id: 3, via: "tiss", status: "aberta" },   // ainda não conferida
    { id: 4, via: "aih",  status: "fechada" },  // SUS não usa guia
  ];

  it("acha a que ninguém cobrou", () => {
    // Ninguém reclama dessa: nem o paciente, nem a operadora.
    expect(contasSemGuia(contas, [{ conta_id: 1, status: "emitida" }]).map(c => c.id)).toEqual([2]);
  });

  it("🔴 guia CANCELADA devolve a conta para a lista", () => {
    // É exatamente o que tem de acontecer quando alguém cancela por erro.
    expect(contasSemGuia(contas, [{ conta_id: 1, status: "cancelada" }]).map(c => c.id))
      .toEqual([1, 2]);
  });

  it("conta aberta não entra: ainda não foi conferida", () => {
    expect(contasSemGuia(contas, []).map(c => c.id)).not.toContain(3);
  });

  it("conta do SUS não entra: SUS não usa guia TISS", () => {
    expect(contasSemGuia(contas, []).map(c => c.id)).not.toContain(4);
  });

  it("🔴 FALHA nas duas pontas devolve null", () => {
    // "Nenhuma conta por cobrar" é a frase que faz alguém ir embora
    // tranquilo, e não pode sair de uma lista que não desceu.
    expect(contasSemGuia(FALHA, [])).toBeNull();
    expect(contasSemGuia(contas, FALHA)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════
// 🔴 "NÃO HÁ PROFISSIONAL" ≠ "O PROFISSIONAL ESTÁ INCOMPLETO"
//
// Visto ANDANDO no demo (14/10/2026): o atendimento #280 não tinha médico
// nenhum (`ps_atendimentos.medico` nulo), e a tela dizia "o profissional
// está sem conselho, número, UF, CBO" mandando consertar no cadastro DELE —
// um cadastro que não existe. Quem lesse isso iria procurar o profissional
// errado, e não acharia.
//
// Os dois se consertam em lugares diferentes, então são pendências
// diferentes.
// ═══════════════════════════════════════════════════════════
describe("🔴 sem profissional × profissional incompleto", () => {
  it("sem nenhum: diz que NÃO HÁ, e manda escolher nesta tela", () => {
    const p = pendenciasParaEmitir(ctx({ profissional: null, guia: GUIA }));
    const x = p.find(y => y.chave === "sem_profissional");
    expect(x).toBeTruthy();
    expect(x.texto).toMatch(/não tem profissional executante/);
    expect(x.onde).toMatch(/escolhendo quem executou/);
    expect(p.map(y => y.chave)).not.toContain("profissional_incompleto");
  });

  it("com nome mas sem os campos: diz que está INCOMPLETO, e manda ao cadastro", () => {
    const p = pendenciasParaEmitir(ctx({ profissional: { nome: "Dra. Ana" } }));
    const x = p.find(y => y.chave === "profissional_incompleto");
    expect(x).toBeTruthy();
    expect(x.onde).toMatch(/cadastro do profissional/);
    expect(p.map(y => y.chave)).not.toContain("sem_profissional");
  });

  it("com alguns campos e sem nome ainda é 'incompleto' — há alguém ali", () => {
    const p = pendenciasParaEmitir(ctx({ profissional: { conselho: "CRM", registro_conselho: "1" } }));
    expect(p.map(y => y.chave)).toContain("profissional_incompleto");
    expect(p.map(y => y.chave)).not.toContain("sem_profissional");
  });

  it("🔴 EXISTE O SELETOR NA TELA — era beco sem saída sem ele", () => {
    // Com o atendimento sem médico e sem seletor, a guia era impossível de
    // emitir por esta tela e nada oferecia saída.
    const tela = readFileSync(join(__dirname, "GuiaTiss.jsx"), "utf8");
    expect(tela).toMatch(/Profissional executante/);
    expect(tela).toMatch(/setEscolhido/);
  });
});
