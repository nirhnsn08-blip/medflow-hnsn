// @vitest-environment node
// ═══════════════════════════════════════════════════════════
// A IDADE CHEGA AO EPISÓDIO, E CONTINUA CHEGANDO
//
// 🔴 O QUE ESTÁ EM JOGO: a idade aciona dose pediátrica e os critérios de
// Beers. Para `aux_farmacia` ela vinha nula, porque a farmácia não lê
// `pacientes` — e `[]` com 200 não acende nenhuma guarda.
//
// Aqui a migração roda de verdade, num Postgres de verdade, e os cenários
// perguntam as três coisas que podem dar errado: a data não chegar no
// insert, a correção de um erro de digitação não chegar nunca mais, e o
// gatilho reescrever episódio já encerrado.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const DIR = path.resolve(__dirname);
let db;

/** A migração DE VERDADE, do arquivo, sem a parte que o PostgREST usa. */
async function rodarMigracao() {
  const sql = fs.readFileSync(path.join(DIR, "migracao-episodio-data-nascimento.sql"), "utf8");
  const inicio = sql.indexOf("alter table public.pep_episodios");
  const fim = sql.indexOf("insert into public.migracoes_aplicadas");
  expect(inicio, "a migração mudou de forma e este teste não a achou").toBeGreaterThan(0);
  await db.exec(sql.slice(inicio, fim));
}

/** Um paciente no cadastro. */
async function paciente(prontuario, nascimento) {
  await db.query(
    `insert into public.pacientes (prontuario, iniciais, data_nascimento) values ($1, 'A.B.', $2)`,
    [prontuario, nascimento]);
}

/** Abre um episódio como o app abre: SEM passar a data. */
async function episodio(prontuario, extra = {}) {
  const r = await db.query(
    `insert into public.pep_episodios (prontuario, iniciais, alta_em, data_nascimento)
     values ($1, 'A.B.', $2, $3) returning id, data_nascimento`,
    [prontuario, extra.alta_em ?? null, extra.data_nascimento ?? null]);
  return r.rows[0];
}

/** A data do episódio, como texto ISO (ou null). */
async function dataDo(id) {
  const r = await db.query(
    `select to_char(data_nascimento, 'YYYY-MM-DD') as d from public.pep_episodios where id = $1`, [id]);
  return r.rows[0]?.d ?? null;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create table public.migracoes_aplicadas (
      arquivo text primary key, aplicada_em timestamptz default now());
    create table public.pacientes (
      prontuario text primary key, iniciais text, data_nascimento date);
    create table public.pep_episodios (
      id bigserial primary key,
      prontuario text not null,
      iniciais text,
      alta_em timestamptz,
      criado_em timestamptz not null default now());
  `);
  await rodarMigracao();
});

afterAll(async () => { await db?.close?.(); });

describe("🔴 a idade chega ao episódio sem abrir o cadastro", () => {
  it("abrir episódio copia a data do cadastro", async () => {
    await paciente("P1", "1950-03-07");
    const e = await episodio("P1");
    expect(await dataDo(e.id)).toBe("1950-03-07");
  });

  it("🔴 e isto é o que devolve Beers e dose pediátrica", async () => {
    // Idoso e criança: as duas faixas que as regras olham.
    await paciente("P-IDOSO", "1940-01-01");
    await paciente("P-CRIANCA", "2024-06-15");
    const idoso = await episodio("P-IDOSO");
    const crianca = await episodio("P-CRIANCA");
    expect(await dataDo(idoso.id)).toBe("1940-01-01");
    expect(await dataDo(crianca.id)).toBe("2024-06-15");
  });

  it("paciente sem data no cadastro fica NULO — a farmácia dirá que não sabe", () => {
    // ⚠️ Nulo aqui é honesto: inventar idade seria pior que não ter. O
    // cadastro antigo às vezes guarda só o ano, e a migração de
    // identificação já trata disso.
    return paciente("P-SEM", null)
      .then(() => episodio("P-SEM"))
      .then(async e => expect(await dataDo(e.id)).toBeNull());
  });

  it("paciente que não existe no cadastro não estoura", async () => {
    const e = await episodio("P-FANTASMA");
    expect(await dataDo(e.id)).toBeNull();
  });

  it("data passada de propósito pelo chamador é respeitada", async () => {
    // Importação de episódio histórico traz a data da época.
    await paciente("P2", "1980-01-01");
    const e = await episodio("P2", { data_nascimento: "1979-12-31" });
    expect(await dataDo(e.id)).toBe("1979-12-31");
  });
});

describe("🔴 corrigir a data no cadastro chega ao episódio aberto", () => {
  it("o erro de digitação deixa de valer na prescrição em curso", async () => {
    // 2019 digitado como 1019 faz o paciente ter mil anos, e a regra do
    // idoso dispara numa criança.
    await paciente("P3", "1019-05-20");
    const e = await episodio("P3");
    expect(await dataDo(e.id)).toBe("1019-05-20");

    await db.query(`update public.pacientes set data_nascimento = $2 where prontuario = $1`,
      ["P3", "2019-05-20"]);
    expect(await dataDo(e.id)).toBe("2019-05-20");
  });

  it("🔴 episódio ENCERRADO não é reescrito — é registro do que valia na época", async () => {
    await paciente("P4", "1960-02-02");
    const aberto = await episodio("P4");
    const fechado = await episodio("P4", { alta_em: "2026-01-01T10:00:00Z" });

    await db.query(`update public.pacientes set data_nascimento = '1961-02-02' where prontuario = 'P4'`);
    expect(await dataDo(aberto.id), "o aberto tinha de acompanhar").toBe("1961-02-02");
    expect(await dataDo(fechado.id), "o encerrado foi reescrito").toBe("1960-02-02");
  });

  it("mexer em outro campo do cadastro não mexe no episódio", async () => {
    await paciente("P5", "1970-07-07");
    const e = await episodio("P5");
    await db.query(`update public.pacientes set iniciais = 'X.Y.' where prontuario = 'P5'`);
    expect(await dataDo(e.id)).toBe("1970-07-07");
  });

  it("a propagação não toca o episódio de OUTRO paciente", async () => {
    await paciente("P6", "1990-01-01");
    await paciente("P7", "1991-01-01");
    const e6 = await episodio("P6");
    const e7 = await episodio("P7");
    await db.query(`update public.pacientes set data_nascimento = '1992-01-01' where prontuario = 'P6'`);
    expect(await dataDo(e6.id)).toBe("1992-01-01");
    expect(await dataDo(e7.id)).toBe("1991-01-01");
  });
});

describe("o backfill e a idempotência", () => {
  it("🔴 episódio que já existia ganha a data ao rodar a migração", async () => {
    // Sem isto, quem está internado HOJE — justamente quem tem prescrição
    // em curso — continuaria sem idade.
    await db.exec(`alter table public.pep_episodios disable trigger trg_epis_nascimento`);
    await paciente("P-ANTIGO", "1955-11-11");
    const e = await episodio("P-ANTIGO");
    await db.exec(`alter table public.pep_episodios enable trigger trg_epis_nascimento`);
    expect(await dataDo(e.id), "o cenário não montou: já veio preenchido").toBeNull();

    const sql = fs.readFileSync(path.join(DIR, "migracao-episodio-data-nascimento.sql"), "utf8");
    // ⚠️ `lastIndexOf`: o MESMO texto aparece dentro da função de
    // propagação, e o recorte pelo primeiro pegava meio corpo de função.
    const i = sql.lastIndexOf("update public.pep_episodios e");
    await db.exec(sql.slice(i, sql.indexOf("insert into public.migracoes_aplicadas")));
    expect(await dataDo(e.id)).toBe("1955-11-11");
  });

  it("rodar a migração de novo não quebra e não muda nada", async () => {
    await paciente("P8", "2000-08-08");
    const e = await episodio("P8");
    await rodarMigracao();
    await rodarMigracao();
    expect(await dataDo(e.id)).toBe("2000-08-08");
  });
});
