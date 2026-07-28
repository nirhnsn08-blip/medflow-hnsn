// ═══════════════════════════════════════════════════════════
// CONTRATO ENTRE A RECEPÇÃO E O BANCO
//
// Mesmo teste que existe no PEP (`src/prontuario/contrato-banco.test.js`),
// pelo mesmo motivo: o PostgREST recusa o INSERT inteiro quando UMA chave
// não é coluna real, e o `sbFetch` transforma isso em `null` silencioso. A
// recepção clica em "abrir atendimento", a tela não acusa nada, e o
// paciente que está no balcão não existe para o sistema.
//
// Aqui é pior do que no PEP: se a abertura falha em silêncio, o paciente
// não entra na fila da triagem. Ninguém é chamado.
//
// Não faz rede — injeta um `sb` falso que captura o que SERIA enviado e
// confere cada chave contra `supabase/auditoria-banco.sql`, que é gerado
// a partir das migrações (`node supabase/gerar-auditoria.mjs`).
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buscarPacientes, carregarPaciente, emitirProntuario,
  criarPacienteNaoIdentificado, atendimentosAbertos, abrirAtendimento,
  listarAguardandoIdentificacao, concluirIdentificacao,
} from "./dados.js";

const AUDITORIA = fs.readFileSync(
  path.join(process.cwd(), "supabase", "auditoria-banco.sql"), "utf8");

const COLUNAS = {};
for (const [, tabela, coluna] of AUDITORIA.matchAll(/\('([a-z0-9_]+)','([a-z0-9_]+)','[^']*'\)/g)) {
  (COLUNAS[tabela] ||= new Set()).add(coluna);
}

it("a auditoria foi lida (o parser não quebrou em silêncio)", () => {
  expect(Object.keys(COLUNAS).length).toBeGreaterThan(30);
  // Colunas criadas pela migração desta feature: se a auditoria não foi
  // regenerada, o contrato inteiro estaria conferindo contra um banco
  // velho e passaria sem olhar o que interessa.
  expect(COLUNAS.pacientes?.has("nao_identificado")).toBe(true);
  expect(COLUNAS.pacientes?.has("origem_cadastro")).toBe(true);
  expect(COLUNAS.ps_atendimentos?.has("tipo_atendimento")).toBe(true);
});

// O padrão só vale quando NADA é passado. Um `= [...]` na assinatura
// engoliria `espiao(undefined)` e devolveria sucesso justamente no caso
// que se quer testar — o teste passaria sem exercitar nada.
function espiao(...args) {
  const resposta = args.length ? args[0] : [{ id: 1, prontuario: "1001" }];
  const chamadas = [];
  const sb = async (recurso, opcoes = {}) => {
    chamadas.push({ recurso, opcoes });
    return resposta;
  };
  return { sb, chamadas };
}

const USER = { name: "Ana Recepção", role: "adm_silver" };

/** Confere uma escrita: a tabela existe e toda chave é coluna real. */
function conferirEscrita({ recurso, opcoes }) {
  const tabela = String(recurso).split("?")[0];
  expect(COLUNAS[tabela], `tabela '${tabela}' não existe na auditoria`).toBeDefined();
  const corpo = JSON.parse(opcoes.body);
  for (const chave of Object.keys(Array.isArray(corpo) ? corpo[0] : corpo)) {
    expect(COLUNAS[tabela].has(chave), `${tabela}.${chave} não existe no banco`).toBe(true);
  }
}

/** Confere uma leitura: colunas de filtro, select e order existem. */
function conferirLeitura({ recurso }) {
  const [tabela, query = ""] = String(recurso).split("?");
  expect(COLUNAS[tabela], `tabela '${tabela}' não existe na auditoria`).toBeDefined();
  const params = new URLSearchParams(query);

  // `select=*` é legítimo (o formulário de cadastro quer a ficha inteira)
  // e não tem coluna a conferir.
  for (const campo of (params.get("select") || "").split(",").filter(c => c && c.trim() !== "*")) {
    expect(COLUNAS[tabela].has(campo.trim()), `select ${tabela}.${campo}`).toBe(true);
  }
  for (const campo of (params.get("order") || "").split(",").filter(Boolean)) {
    const col = campo.trim().split(".")[0];
    if (col) expect(COLUNAS[tabela].has(col), `order ${tabela}.${col}`).toBe(true);
  }
  // Filtros: tudo que não é parâmetro reservado do PostgREST é coluna.
  const RESERVADOS = new Set(["select", "order", "limit", "offset", "or", "and"]);
  for (const [chave] of params) {
    if (RESERVADOS.has(chave)) continue;
    expect(COLUNAS[tabela].has(chave), `filtro ${tabela}.${chave}`).toBe(true);
  }
  // Dentro de `or=(...)`: cada termo é `coluna.operador.valor`.
  const or = params.get("or");
  if (or) {
    for (const termo of or.replace(/^\(|\)$/g, "").split(",")) {
      const col = termo.split(".")[0];
      if (col) expect(COLUNAS[tabela].has(col), `or ${tabela}.${col}`).toBe(true);
    }
  }
}

describe("escritas da recepção", () => {
  it("criar paciente não identificado grava só em coluna que existe", async () => {
    const { sb, chamadas } = espiao();
    await criarPacienteNaoIdentificado(sb, { prontuario: "1042", sexo: "M", idadeAparente: "60 anos" }, USER);
    expect(chamadas).toHaveLength(1);
    conferirEscrita(chamadas[0]);
  });

  it("abrir atendimento grava só em coluna que existe", async () => {
    const { sb, chamadas } = espiao();
    await abrirAtendimento(sb, {
      paciente: { prontuario: "1001", iniciais: "M.S." },
      tipo: "emergencia", origem: "SAMU", queixa: "dor torácica",
    }, USER);
    expect(chamadas).toHaveLength(1);
    conferirEscrita(chamadas[0]);
  });

  it("concluir identificação grava só em coluna que existe", async () => {
    const { sb, chamadas } = espiao();
    await concluirIdentificacao(sb, "1042", USER);
    expect(chamadas).toHaveLength(1);
    conferirEscrita(chamadas[0]);
  });
});

describe("leituras da recepção", () => {
  it("busca por nome consulta colunas reais", async () => {
    const { sb, chamadas } = espiao([]);
    await buscarPacientes(sb, "Maria Silva");
    conferirLeitura(chamadas[0]);
  });

  it("busca por CPF consulta colunas reais", async () => {
    const { sb, chamadas } = espiao([]);
    await buscarPacientes(sb, "529.982.247-25");
    conferirLeitura(chamadas[0]);
  });

  it("carregar paciente consulta coluna real", async () => {
    const { sb, chamadas } = espiao([]);
    await carregarPaciente(sb, "1001");
    conferirLeitura(chamadas[0]);
  });

  it("atendimentos em aberto consulta colunas reais", async () => {
    const { sb, chamadas } = espiao([]);
    await atendimentosAbertos(sb, "1001");
    conferirLeitura(chamadas[0]);
  });

  it("lista de identificação pendente consulta colunas reais", async () => {
    const { sb, chamadas } = espiao([]);
    await listarAguardandoIdentificacao(sb);
    conferirLeitura(chamadas[0]);
  });
});

describe("o silêncio do banco não passa por sucesso", () => {
  // O sbFetch devolve `null` quando a chamada falha, e o PostgREST devolve
  // 204 mesmo quando o RLS bloqueia. Tratar qualquer um dos dois como
  // sucesso é exatamente o bug que já esteve em produção neste sistema.
  const vazios = [null, [], undefined];

  for (const resposta of vazios) {
    it(`abrir atendimento com resposta ${JSON.stringify(resposta)} devolve erro`, async () => {
      const { sb } = espiao(resposta);
      const r = await abrirAtendimento(sb, {
        paciente: { prontuario: "1001", iniciais: "M.S." }, origem: "SAMU",
      }, USER);
      expect(r.ok).toBe(false);
      expect(r.motivo).toBeTruthy();
    });

    it(`criar paciente com resposta ${JSON.stringify(resposta)} devolve erro`, async () => {
      const { sb } = espiao(resposta);
      const r = await criarPacienteNaoIdentificado(sb, { prontuario: "1042" }, USER);
      expect(r.ok).toBe(false);
    });

    it(`emitir prontuário com resposta ${JSON.stringify(resposta)} devolve erro`, async () => {
      const { sb } = espiao(resposta);
      const r = await emitirProntuario(sb);
      expect(r.ok).toBe(false);
      expect(r.motivo).toMatch(/migracao-atendimento-recepcao/);
    });
  }

  it("emitir prontuário devolve o número quando o banco responde", async () => {
    const { sb } = espiao("1042");
    expect(await emitirProntuario(sb)).toEqual({ ok: true, prontuario: "1042" });
  });

  it("abrir atendimento sem paciente nem tenta gravar", async () => {
    const { sb, chamadas } = espiao();
    const r = await abrirAtendimento(sb, { paciente: null, origem: "SAMU" }, USER);
    expect(r.ok).toBe(false);
    expect(chamadas).toHaveLength(0);
  });
});
