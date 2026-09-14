// ═══════════════════════════════════════════════════════════
// CONTRATO ENTRE O PAINEL DE SEGURANÇA MATERNA E O BANCO
//
// Mesmo motivo dos outros contratos do repo: o `sbFetch` engole a recusa do
// PostgREST e devolve `null`. Uma consulta malformada não estoura na tela —
// ela vira "nenhuma paciente", que neste painel é a pior mentira possível.
//
// 🔴 ESTE TESTE NASCEU DE UM DEFEITO REAL, e pegou ele na primeira execução:
// o loader conferia `episodios.falhou` para detectar leitura recusada. Mas a
// marca de falha é a IDENTIDADE do array (FALHA), não uma propriedade — a
// pergunta dava sempre `undefined`, e a recusa do banco virava "nenhuma
// gestante internada". Neste painel, essa é a pior mentira possível.
//
// O formato do `in.()` também é conferido aqui, por consistência com o resto
// do repo (`pep_alergias`), não por ter quebrado.
//
// Não faz rede: injeta um `sb` falso que captura o que SERIA enviado e
// confere contra `supabase/auditoria-banco.sql`, gerado das migrações.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { carregarVigilanciaMaterna } from "./dados.js";

const AUDITORIA = fs.readFileSync(
  path.join(process.cwd(), "supabase", "auditoria-banco.sql"), "utf8");

const COLUNAS = {};
for (const [, tabela, coluna] of AUDITORIA.matchAll(/\('([a-z0-9_]+)','([a-z0-9_]+)','[^']*'\)/g)) {
  (COLUNAS[tabela] ||= new Set()).add(coluna);
}

it("a auditoria foi lida (o parser não quebrou em silêncio)", () => {
  expect(Object.keys(COLUNAS).length).toBeGreaterThan(30);
  // Se a auditoria não foi regenerada depois das migrações da maternidade, o
  // contrato inteiro conferiria contra um banco velho e passaria sem olhar
  // justamente as colunas que este painel usa.
  expect(COLUNAS.mat_episodios?.has("status")).toBe(true);
  expect(COLUNAS.mat_trabalho_parto?.has("vitais")).toBe(true);
  expect(COLUNAS.mat_admissoes?.has("vitais")).toBe(true);
  expect(COLUNAS.pacientes?.has("nome_completo")).toBe(true);
});

/** `sb` falso: responde conforme a tabela pedida e guarda as chamadas. */
function espiao(respostas = {}) {
  const chamadas = [];
  const sb = async (recurso) => {
    chamadas.push(recurso);
    const tabela = String(recurso).split("?")[0];
    if (!(tabela in respostas)) return [];
    const r = respostas[tabela];
    if (r === null) throw new Error("recusado pelo banco");
    return r;
  };
  return { sb, chamadas };
}

const EPISODIOS = [
  { id: 1, prontuario: "1001", risco: "habitual" },
  { id: 2, prontuario: "1002", risco: "alto" },
];

/** Confere que tabela e colunas do `select` existem de verdade. */
function conferirLeitura(recurso) {
  const [tabela, query = ""] = String(recurso).split("?");
  expect(COLUNAS[tabela], `tabela '${tabela}' não existe na auditoria`).toBeDefined();
  const select = new URLSearchParams(query).get("select") || "";
  for (const col of select.split(",").filter(Boolean)) {
    if (col === "*") continue;
    expect(COLUNAS[tabela].has(col), `${tabela}.${col} não existe no banco`).toBe(true);
  }
}

describe("carregarVigilanciaMaterna — o que vai para o banco", () => {
  it("toda tabela e toda coluna pedida existem", async () => {
    const { sb, chamadas } = espiao({ mat_episodios: EPISODIOS });
    await carregarVigilanciaMaterna(sb);
    expect(chamadas.length).toBeGreaterThan(1);
    for (const c of chamadas) conferirLeitura(c);
  });

  it("a lista de prontuários segue o formato do resto do repo: sem aspas, codificada", async () => {
    const { sb, chamadas } = espiao({ mat_episodios: EPISODIOS });
    await carregarVigilanciaMaterna(sb);
    const pac = chamadas.find(c => c.startsWith("pacientes?"));
    expect(pac, "a consulta de pacientes não foi feita").toBeDefined();
    expect(pac).not.toContain('"');
    expect(pac).toContain("in.(1001%2C1002)");
  });

  it("sem episódio aberto, não pergunta mais nada ao banco", async () => {
    const { sb, chamadas } = espiao({ mat_episodios: [] });
    const r = await carregarVigilanciaMaterna(sb);
    expect(chamadas).toHaveLength(1);
    expect(r).toMatchObject({ ok: true, casos: [], incompleto: false });
  });
});

describe("carregarVigilanciaMaterna — leitura que falhou não é lista vazia", () => {
  it("episódios recusados: incompleto, e NÃO 'nenhuma paciente'", async () => {
    const { sb } = espiao({ mat_episodios: null });
    const r = await carregarVigilanciaMaterna(sb);
    expect(r.ok).toBe(false);
    expect(r.incompleto).toBe(true);
    expect(r.casos).toEqual([]);
  });

  it("vitais recusados: os casos vêm, mas marcados como incompletos", async () => {
    const { sb } = espiao({ mat_episodios: EPISODIOS, mat_trabalho_parto: null });
    const r = await carregarVigilanciaMaterna(sb);
    expect(r.incompleto).toBe(true);
    expect(r.ok).toBe(false);
    // as gestantes continuam na lista — sumir com elas seria pior
    expect(r.casos).toHaveLength(2);
  });

  it("sem sb não inventa painel vazio", async () => {
    const r = await carregarVigilanciaMaterna(null);
    expect(r).toMatchObject({ ok: false, casos: [], incompleto: true });
  });
});

describe("carregarVigilanciaMaterna — a medida que chega na tela", () => {
  it("fica com a mais recente entre partograma e admissão", async () => {
    const { sb } = espiao({
      mat_episodios: [EPISODIOS[0]],
      pacientes: [{ prontuario: "1001", iniciais: "A.R.L.", nome_completo: "Ana R. Lima" }],
      leitos: [{ identificacao: "302", prontuario: "1001", setor: "Maternidade" }],
      mat_trabalho_parto: [{ episodio_id: 1, data_hora: "2026-09-12T11:00:00Z", vitais: { pa_sis: 130 } }],
      mat_admissoes: [{ episodio_id: 1, data_hora: "2026-09-12T07:00:00Z", vitais: { pa_sis: 120 } }],
    });
    const r = await carregarVigilanciaMaterna(sb);
    expect(r.casos).toHaveLength(1);
    expect(r.casos[0]).toMatchObject({
      episodioId: 1, prontuario: "1001", nome: "Ana R. Lima",
      leito: "302", origem: "partograma", emTrabalhoDeParto: true,
    });
    expect(r.casos[0].vitais).toEqual({ pa_sis: 130 });
  });

  it("sem partograma, cai na admissão — que é o caso de a medida envelhecer", async () => {
    const { sb } = espiao({
      mat_episodios: [EPISODIOS[0]],
      mat_admissoes: [{ episodio_id: 1, data_hora: "2026-09-12T07:00:00Z", vitais: { pa_sis: 120 } }],
    });
    const r = await carregarVigilanciaMaterna(sb);
    expect(r.casos[0]).toMatchObject({ origem: "admissao", emTrabalhoDeParto: false });
  });

  it("sem nenhuma medida, o caso vem com vitais null (a tela chama de 'sem medida')", async () => {
    const { sb } = espiao({ mat_episodios: [EPISODIOS[0]] });
    const r = await carregarVigilanciaMaterna(sb);
    expect(r.casos[0].vitais).toBeNull();
    expect(r.casos[0].medidoEm).toBeNull();
  });
});
