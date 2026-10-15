// @vitest-environment node
// ═══════════════════════════════════════════════════════════
// O SQL E O JAVASCRIPT PRODUZEM A MESMA STRING?
//
// 🔴 ESTE É O TESTE QUE SEGURA A IMPRESSÃO DIGITAL DE PÉ.
//
// A forma canônica tem DUAS implementações: `doc_canonico_*` em SQL (que
// calcula o hash gravado) e `canonico*` em JS (que verifica). Duas
// implementações da mesma regra é um risco conhecido e aceito de propósito
// — a alternativa seria pedir o canônico ao próprio banco para verificar,
// e aí a verificação dependeria de quem está sendo verificado.
//
// O preço de aceitar esse risco é este arquivo: ele roda o SQL DE VERDADE
// num Postgres de verdade e compara a saída com a do JS, caractere a
// caractere. Mudar uma regra de formatação de um lado sem o outro deixa
// isto vermelho.
//
// ⚠️ DIVERGÊNCIA AQUI NÃO É "TESTE QUEBRADO": é a verificação acusando
// adulteração em documento íntegro, em produção. Alarme falso em prova de
// integridade é pior que alarme nenhum, porque se aprende a ignorá-lo.
//
// ⚠️ O QUE ESTE TESTE NÃO PROVA: que a digital é assinatura. Não é — ver o
// cabeçalho de `migracao-documento-impressao-digital.sql`.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  canonicoDescricao, canonicoResultado, docNum, docTxt, docTs, docBool, FORMATO,
} from "../src/clinico/impressao-digital.js";

const DIR = path.resolve(__dirname);
let db;

/**
 * O esquema mínimo: só o que as funções canônicas tocam.
 *
 * ⚠️ As colunas têm de ter os MESMOS TIPOS do banco real — `numeric` sem
 * escala, `timestamptz`, `boolean`. É a diferença de tipo que produz a
 * diferença de texto que este teste existe para pegar.
 */
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create table public.cc_descricao (
      id bigserial primary key, cirurgia_id bigint, versao int default 1,
      procedimento_cod text, procedimento_realizado text, via_acesso text,
      descricao text, achados text, intercorrencias text,
      sangramento_ml numeric, hemotransfusao boolean, drenos text,
      amostra_enviada boolean, amostras text, conversao boolean,
      conversao_motivo text, cid_pos text, corrige_id bigint,
      motivo_correcao text, assinatura text, usuario text,
      criado_em timestamptz default now(),
      conteudo_hash text, hash_formato text);
    create table public.sadt_resultados (
      id bigserial primary key, item_id bigint, analito_id bigint, nome text,
      valor_num numeric, valor_texto text, unidade text, referencia text,
      laudo text, anormal boolean, critico boolean, versao int default 1,
      corrige_id bigint, motivo_correcao text, liberado_por text,
      assinatura text, usuario text, criado_em timestamptz default now(),
      conteudo_hash text, hash_formato text);
    create table public.migracoes_aplicadas (arquivo text primary key, aplicada_em timestamptz default now());
  `);

  // Só a parte da migração que define formatadores, canônicos e gatilhos —
  // as colunas já existem acima, e a RLS não é o assunto deste teste.
  const sql = fs.readFileSync(path.join(DIR, "migracao-documento-impressao-digital.sql"), "utf8");
  const inicio = sql.indexOf("create or replace function public.doc_txt");
  const fim = sql.indexOf("insert into public.migracoes_aplicadas");
  await db.exec(sql.slice(inicio, fim).replace(/create extension[\s\S]*?end \$\$;/m, ""));
});

/** O canônico que o BANCO produz para a linha que acabou de ser gravada. */
async function canonicoNoBanco(tabela, fn, linha) {
  const cols = Object.keys(linha);
  const vals = cols.map((_, i) => `$${i + 1}`).join(",");
  const r = await db.query(
    `insert into public.${tabela} (${cols.join(",")}) values (${vals}) returning id`,
    Object.values(linha));
  const id = r.rows[0].id;
  const c = await db.query(
    `select public.${fn}(t.*) as canonico, t.conteudo_hash, t.hash_formato
       from public.${tabela} t where t.id = $1`, [id]);
  return c.rows[0];
}

const sha256 = t => createHash("sha256").update(t, "utf8").digest("hex");

// ── OS FORMATADORES, UM A UM ────────────────────────────────
describe("🔴 cada formatador escreve igual nos dois lados", () => {
  it.each([
    ["  com espaço  ", "texto com borda"],
    ["", "vazio"],
    [null, "nulo"],
    ["linha\ncom quebra", "quebra de linha"],
    ["acentuação é ç", "acento"],
  ])("doc_txt(%j) — %s", async (v) => {
    const r = await db.query("select public.doc_txt($1) as x", [v]);
    expect(r.rows[0].x).toBe(docTxt(v));
  });

  it.each([
    ["7.2", "decimal simples"],
    ["7.20", "🔴 escala sobrando — o caso que quebraria tudo"],
    ["0", "zero"],
    ["0.0", "zero com escala"],
    ["150000", "inteiro grande"],
    ["-3.5", "negativo"],
    [null, "nulo"],
  ])("doc_num(%s) — %s", async (v) => {
    const r = await db.query("select public.doc_num($1::numeric) as x", [v]);
    expect(r.rows[0].x).toBe(docNum(v));
  });

  it.each([
    ["2026-10-14T18:04:05.123456Z", "microssegundos"],
    ["2026-10-14T18:04:05Z", "segundo exato"],
    ["2026-10-14T15:04:05-03:00", "🔴 outro fuso — tem de virar UTC dos dois lados"],
    ["2026-10-14T21:04:05-03:00", "🔴 fuso que VIRA O DIA"],
    [null, "nulo"],
  ])("doc_ts(%s) — %s", async (v) => {
    const r = await db.query("select public.doc_ts($1::timestamptz) as x", [v]);
    expect(r.rows[0].x).toBe(docTs(v));
  });

  it.each([[true], [false], [null]])("booleano %s", async (v) => {
    const r = await db.query("select coalesce($1::boolean::text, '') as x", [v]);
    expect(r.rows[0].x).toBe(docBool(v));
  });
});

// ── O DOCUMENTO INTEIRO ─────────────────────────────────────
describe("🔴 a descrição cirúrgica: SQL e JS, byte a byte", () => {
  const CHEIA = {
    cirurgia_id: 7, procedimento_cod: "0408050071",
    procedimento_realizado: "Artroplastia total de joelho",
    via_acesso: "aberta",
    descricao: "Incisão mediana, artrotomia parapatelar medial.\nSem intercorrências na abordagem.",
    achados: "Cartilagem com desgaste grau IV",
    intercorrencias: "nenhuma",
    sangramento_ml: "350.0",
    hemotransfusao: false, drenos: "dreno de sucção",
    amostra_enviada: true, amostras: "fragmento sinovial",
    conversao: false, conversao_motivo: null, cid_pos: "M17.0",
    corrige_id: null, motivo_correcao: null,
    assinatura: "Dra. Ana · CRM 1234",
  };

  it("documento cheio", async () => {
    const r = await canonicoNoBanco("cc_descricao", "doc_canonico_descricao", CHEIA);
    expect(r.canonico).toBe(canonicoDescricao({ ...CHEIA, sangramento_ml: "350.0" }));
  });

  it("🔴 e o HASH gravado é o SHA-256 dessa string", async () => {
    // Fecha o circuito: não basta a string bater, o hash tem de ser o dela.
    const r = await canonicoNoBanco("cc_descricao", "doc_canonico_descricao", CHEIA);
    expect(r.conteudo_hash).toBe(sha256(canonicoDescricao(CHEIA)));
    expect(r.hash_formato).toBe(FORMATO);
  });

  it("documento quase vazio — nulos em tudo que pode", async () => {
    const vazio = { cirurgia_id: 1, descricao: "x", procedimento_realizado: "y" };
    const r = await canonicoNoBanco("cc_descricao", "doc_canonico_descricao", vazio);
    expect(r.canonico).toBe(canonicoDescricao(vazio));
    expect(r.conteudo_hash).toBe(sha256(canonicoDescricao(vazio)));
  });

  it("🔴 texto com espaço nas bordas dá o MESMO hash que sem", async () => {
    // Salvar `null` hoje e `''` amanhã não é alteração, e não pode quebrar.
    const a = await canonicoNoBanco("cc_descricao", "doc_canonico_descricao",
      { cirurgia_id: 1, descricao: "conteudo", achados: "  margem  " });
    const b = await canonicoNoBanco("cc_descricao", "doc_canonico_descricao",
      { cirurgia_id: 1, descricao: "conteudo", achados: "margem" });
    expect(a.conteudo_hash).toBe(b.conteudo_hash);
  });

  it("🔴 null e string vazia dão o mesmo hash", async () => {
    const a = await canonicoNoBanco("cc_descricao", "doc_canonico_descricao",
      { cirurgia_id: 1, descricao: "d", achados: null });
    const b = await canonicoNoBanco("cc_descricao", "doc_canonico_descricao",
      { cirurgia_id: 1, descricao: "d", achados: "" });
    expect(a.conteudo_hash).toBe(b.conteudo_hash);
  });

  it("🔴 mudar UMA letra da descrição muda o hash", async () => {
    const a = await canonicoNoBanco("cc_descricao", "doc_canonico_descricao",
      { cirurgia_id: 1, descricao: "sem intercorrencias" });
    const b = await canonicoNoBanco("cc_descricao", "doc_canonico_descricao",
      { cirurgia_id: 1, descricao: "com intercorrencias" });
    expect(a.conteudo_hash).not.toBe(b.conteudo_hash);
  });

  it("🔴 trocar o ASSINANTE muda o hash", async () => {
    // Seria o buraco mais óbvio: atribuir o laudo a outro profissional sem
    // quebrar a digital.
    const a = await canonicoNoBanco("cc_descricao", "doc_canonico_descricao",
      { cirurgia_id: 1, descricao: "d", assinatura: "Dra. Ana · CRM 1234" });
    const b = await canonicoNoBanco("cc_descricao", "doc_canonico_descricao",
      { cirurgia_id: 1, descricao: "d", assinatura: "Dr. Beto · CRM 9999" });
    expect(a.conteudo_hash).not.toBe(b.conteudo_hash);
  });
});

describe("🔴 o resultado de exame: SQL e JS, byte a byte", () => {
  const LAUDO = {
    item_id: 9, analito_id: 2, nome: "Potássio", valor_num: "7.2",
    valor_texto: null, unidade: "mEq/L", referencia: "3.5 a 5.1",
    laudo: null, anormal: true, critico: true,
    corrige_id: null, motivo_correcao: null,
    liberado_por: "Bioq. Y", assinatura: "Bioq. Y · CRF 555",
  };

  it("laudo numérico", async () => {
    const r = await canonicoNoBanco("sadt_resultados", "doc_canonico_resultado", LAUDO);
    expect(r.canonico).toBe(canonicoResultado(LAUDO));
    expect(r.conteudo_hash).toBe(sha256(canonicoResultado(LAUDO)));
  });

  it("🔴 `7.20` e `7.2` dão o MESMO hash — a escala não é conteúdo", async () => {
    const a = await canonicoNoBanco("sadt_resultados", "doc_canonico_resultado",
      { ...LAUDO, valor_num: "7.20" });
    const b = await canonicoNoBanco("sadt_resultados", "doc_canonico_resultado",
      { ...LAUDO, valor_num: "7.2" });
    expect(a.conteudo_hash).toBe(b.conteudo_hash);
    // E o JS concorda com os dois.
    expect(a.conteudo_hash).toBe(sha256(canonicoResultado({ ...LAUDO, valor_num: "7.20" })));
  });

  it("🔴 ZERO não é ausência — hashes diferentes", async () => {
    // Zero é valor de laudo legítimo (plaqueta, bastonete, bacilo).
    const a = await canonicoNoBanco("sadt_resultados", "doc_canonico_resultado",
      { ...LAUDO, valor_num: "0" });
    const b = await canonicoNoBanco("sadt_resultados", "doc_canonico_resultado",
      { ...LAUDO, valor_num: null });
    expect(a.conteudo_hash).not.toBe(b.conteudo_hash);
  });

  it("🔴 virar CRÍTICO em normal muda o hash", async () => {
    // A alteração mais perigosa que este banco permitiria.
    const a = await canonicoNoBanco("sadt_resultados", "doc_canonico_resultado", LAUDO);
    const b = await canonicoNoBanco("sadt_resultados", "doc_canonico_resultado",
      { ...LAUDO, critico: false, anormal: false });
    expect(a.conteudo_hash).not.toBe(b.conteudo_hash);
  });

  it("laudo só de texto, sem número", async () => {
    const t = { item_id: 9, laudo: "Sem alterações.", anormal: false, critico: false };
    const r = await canonicoNoBanco("sadt_resultados", "doc_canonico_resultado", t);
    expect(r.canonico).toBe(canonicoResultado(t));
  });
});

// ── O GATILHO ───────────────────────────────────────────────
describe("🔴 o hash é do banco, não da tela", () => {
  it("hash enviado pela tela é IGNORADO e recalculado", async () => {
    // Se a tela pudesse gravá-lo, bastaria mandar o hash de outro conteúdo
    // e a digital provaria exatamente nada.
    const r = await canonicoNoBanco("cc_descricao", "doc_canonico_descricao",
      { cirurgia_id: 1, descricao: "conteudo real", conteudo_hash: "mentira", hash_formato: "99" });
    expect(r.conteudo_hash).not.toBe("mentira");
    expect(r.hash_formato).toBe(FORMATO);
    expect(r.conteudo_hash).toBe(sha256(canonicoDescricao({ cirurgia_id: 1, descricao: "conteudo real" })));
  });

  it("🔴 alterar a linha por SQL NÃO recarimba — e aí a digital acusa", async () => {
    // ⚠️ ESTE TESTE AFIRMAVA O CONTRÁRIO, e documentava um defeito meu como
    // se fosse o comportamento certo. Recalcular no UPDATE anula a camada
    // inteira: o hash guardado passa a ser sempre o da linha atual, então a
    // verificação nunca pode acusar nada.
    //
    // Achado CAMINHANDO no demo (15/10/2026), tentando adulterar um laudo
    // para ver o selo acender — e percebendo que ele nunca acenderia.
    const r = await canonicoNoBanco("cc_descricao", "doc_canonico_descricao",
      { cirurgia_id: 1, descricao: "sem intercorrencias" });
    const antes = r.conteudo_hash;
    const id = (await db.query("select max(id) id from public.cc_descricao")).rows[0].id;

    await db.exec(`update public.cc_descricao set descricao = 'com intercorrencias' where id = ${id}`);
    const depois = (await db.query(
      `select descricao, conteudo_hash, public.doc_canonico_descricao(t.*) as canonico
         from public.cc_descricao t where id = ${id}`)).rows[0];

    // O conteúdo mudou…
    expect(depois.descricao).toBe("com intercorrencias");
    // …a digital NÃO…
    expect(depois.conteudo_hash).toBe(antes);
    // …e por isso ela deixou de descrever a linha. É o que a tela mostra.
    expect(sha256(depois.canonico)).not.toBe(depois.conteudo_hash);
  });

  it("🔴 e o UPDATE não consegue FORJAR a digital", async () => {
    // Quem altera o conteúdo tentaria mandar o hash novo junto. O gatilho
    // devolve o antigo de qualquer forma.
    const r = await canonicoNoBanco("cc_descricao", "doc_canonico_descricao",
      { cirurgia_id: 1, descricao: "original" });
    const id = (await db.query("select max(id) id from public.cc_descricao")).rows[0].id;
    await db.exec(`update public.cc_descricao
                      set descricao = 'outra coisa', conteudo_hash = 'forjado', hash_formato = '9'
                    where id = ${id}`);
    const d = (await db.query(`select conteudo_hash, hash_formato from public.cc_descricao where id = ${id}`)).rows[0];
    expect(d.conteudo_hash).toBe(r.conteudo_hash);
    expect(d.hash_formato).toBe(FORMATO);
  });
});
