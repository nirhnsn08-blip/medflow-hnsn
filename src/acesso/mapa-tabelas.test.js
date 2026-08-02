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
import { MAPA_TABELAS, SENSIVEIS, TODOS, PROPRIO, modulosCitados } from "./mapa-tabelas.js";
import { MODULOS } from "./modulos.js";
import { tabelasDoBanco, condicaoDe, conferir, gerarSql } from "../../supabase/gerar-rls.mjs";

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
