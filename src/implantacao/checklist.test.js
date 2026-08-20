// ═══════════════════════════════════════════════════════════
// A regra do checklist de implantação.
//
// O que estes testes protegem de verdade é a distinção entre os três
// estados. "Feito × falta" é fácil e não é o problema: o problema é que um
// `0` que volta do banco pode ser "não tem", "não posso ver" ou "não deu
// para perguntar", e confundir os dois últimos com o primeiro cobra
// cadastro de quem não pode fazê-lo — o aviso que dispara sempre.
//
// Validados por mutação (quebrar de propósito deixa vermelho):
//   • `linhas == null` → `!linhas`            .... derruba "lista vazia ≠ falha"
//   • `pode === true` → `pode !== false`      .... derruba o fornecedor invisível
//   • ignorar `colunaAtivo`                   .... derruba "3 salas, todas inativas"
//   • `n > 0` depois do teste de permissão    .... derruba "contagem prova leitura"
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  CADASTROS_BASE, contarAtivos, estadoCadastro, avaliarChecklist,
  modulosDormentes, deveMostrarChecklist,
} from "./checklist.js";
import { MODULO_POR_CHAVE } from "../acesso/modulos.js";

// Permissões de quem enxerga tudo o que o checklist cobre.
const TUDO = { leitos: "escrita", bloco: "escrita", suprimentos: "escrita", scih: "escrita", protocolos: "escrita", overview: "escrita" };
// Enfermeira de SCIH: não alcança Estoque & Compras nem Farmácia — para ela
// o RLS devolve `sup_fornecedores` VAZIA, e não um erro.
const SEM_SUPRIMENTOS = { leitos: "escrita", bloco: "escrita", scih: "escrita", protocolos: "escrita", overview: "escrita" };

describe("catálogo de cadastros-base", () => {
  it("cobre os quatro achados do teste de estresse", () => {
    expect(CADASTROS_BASE.map(c => c.tabela).sort())
      .toEqual(["cc_salas", "scih_germes", "setores", "sup_fornecedores"]);
  });

  it("só cita módulo que existe no catálogo do sistema", () => {
    for (const c of CADASTROS_BASE) {
      expect(MODULO_POR_CHAVE[c.modulo], `módulo ${c.modulo}`).toBeTruthy();
      for (const m of c.destrava) expect(MODULO_POR_CHAVE[m], `destrava ${m}`).toBeTruthy();
    }
  });

  it("diz onde cadastrar e por quê — o caminho é a feature", () => {
    for (const c of CADASTROS_BASE) {
      expect(c.onde.length).toBeGreaterThan(10);
      expect(c.porque.length).toBeGreaterThan(10);
    }
  });

  it("aponta a aba E o botão de Setores, não só 'Giro de Leitos → Setores'", () => {
    // O empty-state antigo dizia "Giro de Leitos → Setores" como se Setores
    // fosse uma aba. Quem procurou por aba não achou — o botão está dentro
    // do Mapa de leitos.
    const setores = CADASTROS_BASE.find(c => c.tabela === "setores");
    expect(setores.onde).toMatch(/Mapa de leitos/);
    expect(setores.onde).toMatch(/bot[ãa]o Setores/i);
  });
});

describe("contarAtivos — desativado não destrava nada", () => {
  it("conta tudo quando a tabela não tem coluna de ativo", () => {
    expect(contarAtivos([{ nome: "UTI" }, { nome: "POSTO 1" }], null)).toBe(2);
  });

  it("não conta a sala desativada", () => {
    const salas = [{ nome: "S1", ativa: false }, { nome: "S2", ativa: true }, { nome: "S3", ativa: false }];
    expect(contarAtivos(salas, "ativa")).toBe(1);
  });

  it("conta a linha antiga com ativo nulo — o default do banco é true", () => {
    expect(contarAtivos([{ id: 1, ativo: null }, { id: 2 }], "ativo")).toBe(2);
  });

  it("devolve null quando não veio lista — não inventa zero", () => {
    expect(contarAtivos(null, null)).toBeNull();
    expect(contarAtivos(undefined, "ativa")).toBeNull();
  });
});

describe("estadoCadastro — os três estados", () => {
  it("tem registro e permissão confirmada → ok", () => {
    expect(estadoCadastro({ linhas: [{ nome: "UTI" }], podeVer: true })).toBe("ok");
  });

  it("lista vazia com permissão confirmada → vazio", () => {
    expect(estadoCadastro({ linhas: [], podeVer: true })).toBe("vazio");
  });

  it("consulta falhou (null) → indeterminado, NUNCA vazio", () => {
    // O sbFetch devolve null em queda de rede, sessão vencida e recusa do
    // PostgREST. Tratar isso como "falta cadastrar" manda a TI procurar um
    // cadastro que talvez já exista.
    expect(estadoCadastro({ linhas: null, podeVer: true })).toBe("indeterminado");
  });

  it("lista vazia de quem NÃO enxerga a tabela → indeterminado", () => {
    // É o caso do fornecedor: o RLS de leitura devolve [] para quem não tem
    // suprimentos nem farmácia. Marcar isso como "vazio" cobraria cadastro
    // de quem sequer pode conferir se ele existe.
    expect(estadoCadastro({ linhas: [], podeVer: false })).toBe("indeterminado");
  });

  it("lista vazia com permissão ainda desconhecida → indeterminado", () => {
    expect(estadoCadastro({ linhas: [], podeVer: null })).toBe("indeterminado");
  });

  it("contagem positiva PROVA a leitura, mesmo sem permissão confirmada", () => {
    // Se voltou linha, a pessoa enxerga a tabela. O que as permissões ainda
    // não disseram não desfaz o que o banco já respondeu.
    expect(estadoCadastro({ linhas: [{ nome: "UTI" }], podeVer: null })).toBe("ok");
    expect(estadoCadastro({ linhas: [{ nome: "UTI" }], podeVer: false })).toBe("ok");
  });

  it("três salas, todas desativadas → vazio (não 'ok')", () => {
    const salas = [{ nome: "S1", ativa: false }, { nome: "S2", ativa: false }, { nome: "S3", ativa: false }];
    expect(estadoCadastro({ linhas: salas, podeVer: true, colunaAtivo: "ativa" })).toBe("vazio");
  });
});

describe("avaliarChecklist", () => {
  const cheio = {
    setores: [{ nome: "UTI" }],
    salas: [{ nome: "S1", ativa: true }],
    fornecedores: [{ id: 1, ativo: true }],
    germes: [{ nome: "KPC" }],
  };

  it("tudo cadastrado → nenhuma pendência", () => {
    const r = avaliarChecklist(cheio, { perms: TUDO });
    expect(r.feitos).toBe(4);
    expect(r.pendentes).toBe(0);
    expect(r.indeterminados).toBe(0);
    expect(r.total).toBe(4);
  });

  it("o demo de 19/08: só setores cadastrado → três pendências", () => {
    const r = avaliarChecklist({ setores: [{ nome: "UTI" }], salas: [], fornecedores: [], germes: [] }, { perms: TUDO });
    expect(r.feitos).toBe(1);
    expect(r.pendentes).toBe(3);
    expect(r.itens.find(i => i.chave === "setores").estado).toBe("ok");
    expect(r.itens.find(i => i.chave === "salas").estado).toBe("vazio");
  });

  it("esconde o item de quem não alcança o módulo", () => {
    const r = avaliarChecklist({ setores: [{ nome: "UTI" }], salas: [], fornecedores: [], germes: [] },
      { perms: SEM_SUPRIMENTOS });
    const forn = r.itens.find(i => i.chave === "fornecedores");
    expect(forn.visivel).toBe(false);
    expect(r.total).toBe(3);
    // e não entra em nenhuma contagem — nem como pendência, nem como incerto
    expect(r.pendentes).toBe(2);
    expect(r.indeterminados).toBe(0);
  });

  it("permissões ainda carregando → mostra tudo, mas nada vira 'vazio'", () => {
    // Falha aberto para EXIBIR (como o menu do sistema), fecha para AFIRMAR.
    const r = avaliarChecklist({ setores: [], salas: [], fornecedores: [], germes: [] }, { perms: null });
    expect(r.total).toBe(4);
    expect(r.pendentes).toBe(0);
    expect(r.indeterminados).toBe(4);
  });

  it("banco fora do ar → quatro incertos, zero pendências", () => {
    const r = avaliarChecklist({}, { perms: TUDO });
    expect(r.pendentes).toBe(0);
    expect(r.indeterminados).toBe(4);
    expect(r.itens.every(i => i.quantos === null)).toBe(true);
  });

  it("guarda quantos existem, para a tela mostrar o número", () => {
    const r = avaliarChecklist({ ...cheio, setores: [{ nome: "UTI" }, { nome: "POSTO 1" }] }, { perms: TUDO });
    expect(r.itens.find(i => i.chave === "setores").quantos).toBe(2);
  });
});

describe("modulosDormentes", () => {
  it("nomeia os módulos travados pelo rótulo do catálogo", () => {
    const { itens } = avaliarChecklist({ setores: [], salas: [], fornecedores: [{ id: 1 }], germes: [{ nome: "KPC" }] },
      { perms: TUDO });
    const nomes = modulosDormentes(itens);
    expect(nomes).toContain("Protocolos Clínicos");
    expect(nomes).toContain("Visão Geral");
    expect(nomes).toContain("Bloco Cirúrgico");
    expect(nomes).not.toContain("Estoque & Compras");
  });

  it("não repete módulo citado por dois cadastros", () => {
    const itens = [
      { visivel: true, estado: "vazio", destrava: ["bloco", "scih"] },
      { visivel: true, estado: "vazio", destrava: ["scih"] },
    ];
    expect(modulosDormentes(itens)).toEqual(["Bloco Cirúrgico", "SCIH"]);
  });

  it("o incerto NÃO é acusado de travar módulo", () => {
    const itens = [{ visivel: true, estado: "indeterminado", destrava: ["bloco"] }];
    expect(modulosDormentes(itens)).toEqual([]);
  });

  it("item invisível não entra", () => {
    const itens = [{ visivel: false, estado: "vazio", destrava: ["suprimentos"] }];
    expect(modulosDormentes(itens)).toEqual([]);
  });
});

describe("deveMostrarChecklist", () => {
  it("some sozinho quando a implantação termina", () => {
    expect(deveMostrarChecklist({ pendentes: 0, indeterminados: 0 }, true)).toBe(false);
  });

  it("aparece havendo pendência", () => {
    expect(deveMostrarChecklist({ pendentes: 1, indeterminados: 0 }, true)).toBe(true);
  });

  it("aparece havendo incerteza — 'não consegui conferir' é informação", () => {
    expect(deveMostrarChecklist({ pendentes: 0, indeterminados: 2 }, true)).toBe(true);
  });

  it("não aparece para quem não pode cadastrar", () => {
    // As quatro tabelas só aceitam escrita de adm_master/adm_silver. Cobrar
    // de quem não pode resolver é ruído puro.
    expect(deveMostrarChecklist({ pendentes: 3, indeterminados: 0 }, false)).toBe(false);
  });
});
