// ═══════════════════════════════════════════════════════════
// O MAPA DE LEITURA NÃO PODE FICAR PARA TRÁS DO BANCO
//
// A política de RLS é o tipo de código que quebra em silêncio nos DOIS
// sentidos: apertada demais, esvazia uma tela em pleno plantão; frouxa
// demais, deixa o CPF do paciente ao alcance de qualquer login. Nenhum dos
// dois aparece como erro na tela — RLS bloqueando leitura devolve 200 com
// lista vazia.
//
// Este teste guarda quatro coisas:
//   1. toda tabela do banco tem classificação de leitura;
//   2. nenhuma tabela com dado de paciente ficou aberta a todo mundo;
//   3. o SQL gerado está em dia com o mapa;
//   4. a migração entra na reconstrução — senão o próximo hospital nasce
//      com o banco aberto, que é justamente o cliente que exige o
//      contrário.
//
// É o mesmo remédio do `seed-perfis.test.js` e do `contrato-banco.test.js`:
// duas fontes descrevendo a mesma verdade divergem, é só questão de tempo.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MAPA_TABELAS, SENSIVEIS, ESCRITA_ABERTA, TODOS, PROPRIO, modulosCitados } from "./mapa-tabelas.js";
import { MODULOS } from "./modulos.js";
import { tabelasDoBanco, condicaoDe, condicaoDeEscrita, conferir, gerarSql } from "../../supabase/gerar-rls.mjs";

const raiz = process.cwd();
const leia = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");

const TABELAS = tabelasDoBanco(leia("supabase", "auditoria-banco.sql"));

it("o parser leu a auditoria (não passou vazio em silêncio)", () => {
  expect(TABELAS.length).toBeGreaterThan(50);
  expect(TABELAS).toContain("pacientes");
});

describe("cobertura", () => {
  it("toda tabela do banco tem classificação de leitura, e o mapa não inventa tabela", () => {
    // A mensagem do erro já diz o que fazer: classificar em mapa-tabelas.js.
    expect(conferir(TABELAS, MAPA_TABELAS)).toEqual([]);
  });

  it("todo módulo citado no mapa existe no catálogo de módulos", () => {
    const validos = new Set(MODULOS.map(m => m.chave));
    expect(modulosCitados().filter(m => !validos.has(m))).toEqual([]);
  });

  it("toda tabela sensível listada existe de fato", () => {
    expect([...SENSIVEIS].filter(t => !TABELAS.includes(t))).toEqual([]);
  });

  it("nenhuma tabela fica com lista vazia (isso não é 'ninguém lê', é engano)", () => {
    const vazias = Object.entries(MAPA_TABELAS).filter(([, alvos]) => !alvos.length);
    expect(vazias.map(([t]) => t)).toEqual([]);
  });
});

describe("o que não pode ficar aberto", () => {
  for (const t of [...SENSIVEIS].sort()) {
    it(`${t} — só os módulos que a tela usa`, () => {
      expect(MAPA_TABELAS[t], `${t} não está no mapa`).toBeDefined();
      expect(MAPA_TABELAS[t], `${t} carrega dado de paciente e não pode ser TODOS`)
        .not.toContain(TODOS);
      expect(condicaoDe(MAPA_TABELAS[t])).not.toBe("true");
    });
  }

  it("a identificação do paciente não vaza para módulo administrativo de apoio", () => {
    // Estoque, compras e o livro de controlados não têm nada a fazer com
    // nome, CPF e endereço — COFEN 754/2024, art. 6º.
    for (const m of ["suprimentos", "controlados", "farmacia", "auditoria"])
      expect(MAPA_TABELAS.pacientes).not.toContain(m);
  });

  it("o prontuário é do módulo do prontuário", () => {
    for (const [t, alvos] of Object.entries(MAPA_TABELAS))
      if (t.startsWith("pep_") && t !== "pep_acessos")
        expect(alvos, t).toEqual(["paciente"]);
  });

  it("a trilha de auditoria não é lida pelo auditado", () => {
    expect(MAPA_TABELAS.auditoria).toEqual(["auditoria"]);
    expect(MAPA_TABELAS.pep_acessos).toEqual(["auditoria"]);
  });

  it("só usuarios_permissoes usa a regra da própria linha", () => {
    const comProprio = Object.entries(MAPA_TABELAS)
      .filter(([, alvos]) => alvos.includes(PROPRIO)).map(([t]) => t);
    expect(comProprio).toEqual(["usuarios_permissoes"]);
  });
});

describe("a condição SQL", () => {
  it("catálogo vira `true`", () => {
    expect(condicaoDe([TODOS])).toBe("true");
  });

  it("um módulo vira uma chamada com o módulo entre aspas escapadas", () => {
    expect(condicaoDe(["ps"])).toBe("public.pode_ver_algum(''ps'')");
  });

  it("vários módulos entram na mesma chamada", () => {
    expect(condicaoDe(["ps", "paciente"])).toBe("public.pode_ver_algum(''ps'', ''paciente'')");
  });

  it("a própria linha entra como OR, sem derrubar o módulo", () => {
    expect(condicaoDe(["users", PROPRIO]))
      .toBe("public.pode_ver_algum(''users'') or user_id = auth.uid()");
  });
});

describe("o SQL gerado", () => {
  const ARQUIVO = "migracao-rls-leitura.sql";
  const gerado = leia("supabase", ARQUIVO);

  it(`${ARQUIVO} está em dia com o mapa (rode: node supabase/gerar-rls.mjs)`, () => {
    expect(gerado.replace(/\r\n/g, "\n")).toBe(gerarSql(TABELAS, MAPA_TABELAS).replace(/\r\n/g, "\n"));
  });

  it("cria as funções de permissão que as políticas usam", () => {
    for (const fn of ["meu_nivel", "pode_ver", "pode_ver_algum"])
      expect(gerado).toContain(`create or replace function public.${fn}(`);
  });

  it("desarma as políticas FOR ALL — senão qualquer adm_silver lê por cima", () => {
    expect(gerado).toContain("where pol.polcmd = '*'");
  });

  it("não cria, não altera e não apaga tabela nenhuma", () => {
    expect(/create\s+table\s+(?!temp)/i.test(gerado.replace(/--[^\n]*/g, ""))).toBe(false);
    expect(/\bdrop\s+table\s+(?!_rls_forall)/i.test(gerado.replace(/--[^\n]*/g, ""))).toBe(false);
    expect(/\bdelete\s+from\b|\btruncate\b/i.test(gerado.replace(/--[^\n]*/g, ""))).toBe(false);
  });

  it("entra na reconstrução — hospital novo não pode nascer com o banco aberto", () => {
    expect(leia("supabase", "gerar-reconstrucao.mjs")).toContain(`"${ARQUIVO}"`);
  });
});

// ═══════════════════════════════════════════════════════════
// ESCRITA POR MÓDULO
//
// Antes, as políticas de escrita olhavam só `my_role()`: quem fosse
// adm_silver — médico, enfermeiro, recepção, quase todo mundo — gravava em
// qualquer tabela com política de escrita, independente do módulo. O menu
// escondia; a API não.
//
// Validados por mutação:
//   • tabela de registro deixando de ser exceção .... derruba a trilha
//   • catálogo ganhando exigência de módulo ......... derruba a configuração
//   • `@proprio` perdendo o acesso à própria linha .. derruba a exceção pessoal
// ═══════════════════════════════════════════════════════════
describe("condicaoDeEscrita", () => {
  it("tabela de um módulo exige escrita naquele módulo", () => {
    expect(condicaoDeEscrita(["ps"], "ps_atendimentos"))
      .toBe("public.pode_editar_algum(''ps'')");
  });

  it("tabela de dois módulos aceita escrita em qualquer um dos dois", () => {
    // `sup_itens` é do almoxarifado e da farmácia; quem tem escrita em um
    // dos dois grava nela.
    expect(condicaoDeEscrita(["suprimentos", "farmacia"], "sup_itens"))
      .toBe("public.pode_editar_algum(''suprimentos'', ''farmacia'')");
  });

  it("🔴 tabela de REGISTRO fica de fora — a trilha não pode parar de gravar", () => {
    // Exigir `pode_editar('auditoria')` faria só o auditor conseguir
    // registrar, ou seja, a trilha pararia de registrar justamente as
    // ações que interessa auditar. E pararia em silêncio.
    for (const t of ESCRITA_ABERTA) {
      expect(condicaoDeEscrita(MAPA_TABELAS[t], t), `${t} deveria ficar de fora`).toBeNull();
    }
    expect(condicaoDeEscrita(["auditoria"], "auditoria")).toBeNull();
    expect(condicaoDeEscrita(["auditoria"], "pep_acessos")).toBeNull();
  });

  it("🔴 catálogo e referência ficam de fora — não pertencem a um módulo", () => {
    expect(condicaoDeEscrita([TODOS], "sigtap_procedimentos")).toBeNull();
    expect(condicaoDeEscrita([TODOS], "setores")).toBeNull();
  });

  it("🔴 com `@proprio`, a pessoa alcança a própria linha mesmo sem o módulo", () => {
    expect(condicaoDeEscrita(["users", PROPRIO], "usuarios_permissoes"))
      .toBe("public.pode_editar_algum(''users'') or user_id = auth.uid()");
  });

  it("só `@proprio`, sem módulo, não ganha exigência — a posse já é a trava", () => {
    expect(condicaoDeEscrita([PROPRIO], "qualquer")).toBeNull();
  });

  it("as duas tabelas de registro estão declaradas, e só elas", () => {
    // Se alguém acrescentar uma tabela aqui sem pensar, este teste obriga a
    // atualizar a lista de propósito — a pergunta certa é: "quem grava é
    // quem administra o módulo, ou qualquer pessoa que trabalha?"
    expect([...ESCRITA_ABERTA].sort()).toEqual(["auditoria", "pep_acessos"]);
  });

  it("toda tabela de ESCRITA_ABERTA existe no mapa", () => {
    for (const t of ESCRITA_ABERTA) expect(MAPA_TABELAS[t], t).toBeTruthy();
  });
});
