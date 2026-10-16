// @vitest-environment node
// ═══════════════════════════════════════════════════════════
// CANCELAR UMA DOSE APRAZADA — CONTRA UM POSTGRES DE VERDADE
//
// 🔴 ESTE ARQUIVO EXISTE POR CAUSA DE UM BURACO QUE PASSOU POR 18 PROVAS.
//
// A migração do cancelamento foi provada em PGlite: 18 cenários, zero
// falhas, o gatilho recusando tudo o que devia recusar. E no demo o
// cancelamento NÃO GRAVOU — `pep_aprazamentos` não tem política de UPDATE,
// e o PATCH respondia 2xx alterando zero linhas.
//
// ⚠️ POR QUE AS 18 PROVAS NÃO VIRAM: elas rodavam o `update` como DONO da
// tabela, e dono não passa por RLS. Provavam o GATILHO, que responde "este
// cancelamento é legítimo?". A pergunta que faltava é anterior: "o update
// chega na linha?".
//
// 💡 A DIFERENÇA NESTE ARQUIVO: ele cria o papel `authenticated`, liga
// `force row level security` na tabela e roda os updates COMO a aplicação
// roda. O cenário "sem a política, zero linhas" está aqui embaixo, e é o
// defeito do demo reproduzido — a catraca que faltava.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const DIR = path.resolve(__dirname);
let db;

/** Roda algo como a aplicação roda (papel `authenticated`, sujeito a RLS). */
async function comoApp(sql, params) {
  await db.exec("set role authenticated");
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
  }
}

/** O erro que o banco devolveu, ou null se não devolveu nenhum. */
async function erroDe(fn) {
  try {
    await fn();
    return null;
  } catch (e) {
    return String(e.message || e);
  }
}

let proximoItem = 100;
/** Uma dose aprazada vigente, em item próprio para não cruzar com os outros. */
async function doseNova(previsto = "2026-10-20T12:00:00Z") {
  const item = proximoItem++;
  const r = await db.query(
    `insert into public.pep_aprazamentos
       (item_id, prontuario, previsto_para, sequencia, dose_prevista, via,
        aprazado_por, conselho, registro_conselho)
     values ($1, 'T1', $2, 1, '600 mg', 'VO', 'Ana', 'COREN', '98765')
     returning id, item_id, previsto_para`, [item, previsto]);
  return r.rows[0];
}

/** A migração DE VERDADE, do arquivo, sem a parte que o PostgREST usa. */
async function rodarMigracao() {
  const sql = fs.readFileSync(path.join(DIR, "migracao-aprazamento-cancelar.sql"), "utf8");
  const inicio = sql.indexOf("alter table public.pep_aprazamentos add column");
  const fim = sql.indexOf("insert into public.migracoes_aplicadas");
  expect(inicio, "a migração mudou de forma e este teste não a achou").toBeGreaterThan(0);
  await db.exec(sql.slice(inicio, fim));
}

beforeAll(async () => {
  db = new PGlite();

  // ⚠️ O ESQUEMA É O DE `migracao-pep-fase1.sql`, INCLUSIVE O QUE ESTAVA
  // FALTANDO: o único SEM cláusula parcial, e políticas só de select e
  // insert. Começar do estado real é o ponto — a migração tem de consertar
  // o banco que existe, não um banco conveniente.
  await db.exec(`
    create role authenticated;
    create table public.migracoes_aplicadas (
      arquivo text primary key, aplicada_em timestamptz default now());
    create table public.pep_administracoes (
      id bigserial primary key, aprazamento_id bigint, status text,
      administrado_em timestamptz default now());
    create table public.pep_aprazamentos (
      id bigserial primary key,
      item_id bigint not null,
      prescricao_id bigint,
      prontuario text not null,
      episodio_id bigint,
      previsto_para timestamptz not null,
      sequencia int,
      dose_prevista text,
      via text,
      observacao text,
      aprazado_por text,
      conselho text,
      registro_conselho text,
      usuario text,
      criado_em timestamptz not null default now());
    create unique index pep_aprz_uq on public.pep_aprazamentos (item_id, previsto_para);
    alter table public.pep_aprazamentos enable row level security;
  `);

  // `my_role()` de mentira, para o teste poder trocar de perfil.
  await db.exec(`
    create or replace function public.my_role() returns text
      language sql stable as $m$
        select coalesce(nullif(current_setting('valentrax.papel', true), ''), 'adm_master')
      $m$;
  `);

  await db.exec(`
    create policy pep_aprz_select on public.pep_aprazamentos
      for select to authenticated using (true);
    create policy pep_aprz_insert on public.pep_aprazamentos
      for insert to authenticated
      with check (public.my_role() in ('adm_master','adm_silver'));

    -- 🔴 O dono não passa por RLS, e é exatamente isso que escondeu o
    -- defeito nas 18 provas anteriores.
    alter table public.pep_aprazamentos force row level security;
    grant usage on schema public to authenticated;
    grant select, insert, update on public.pep_aprazamentos to authenticated;
    grant select on public.pep_administracoes to authenticated;
    grant usage, select on all sequences in schema public to authenticated;
    grant execute on function public.my_role() to authenticated;
  `);

  await rodarMigracao();
});

afterAll(async () => { await db?.close?.(); });

describe("🔴 A) a política de UPDATE, que é o que faltava", () => {
  it("a migração cria a política de UPDATE", async () => {
    const r = await db.query(
      `select policyname from pg_policies
        where schemaname = 'public' and tablename = 'pep_aprazamentos' and cmd = 'UPDATE'`);
    expect(r.rows.map(x => x.policyname)).toContain("pep_aprz_cancelar_upd");
  });

  it("com a política, o cancelamento grava — UMA linha", async () => {
    const d = await doseNova();
    const r = await comoApp(
      `update public.pep_aprazamentos
          set cancelado_em = now(), cancelado_por = 'Ana',
              cancelamento_motivo = 'troca de turno'
        where id = $1 returning id, cancelado_em`, [d.id]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].cancelado_em).toBeTruthy();
  });

  it("🔴 SEM a política: zero linhas, sem erro nenhum — o defeito do demo", async () => {
    const d = await doseNova();
    await db.exec("drop policy pep_aprz_cancelar_upd on public.pep_aprazamentos");
    try {
      const r = await comoApp(
        `update public.pep_aprazamentos
            set cancelado_em = now(), cancelamento_motivo = 'troca de turno'
          where id = $1 returning id`, [d.id]);

      // ⚠️ ISTO é o que a tela via: sucesso, zero linhas. Sem exceção, sem
      // log, sem pista. A mensagem honesta da tela ("o cancelamento NÃO foi
      // gravado") era a única coisa entre o defeito e a enfermagem achar
      // que a dose tinha saído da grade.
      expect(r.rows).toHaveLength(0);
      const ainda = await db.query(
        `select cancelado_em from public.pep_aprazamentos where id = $1`, [d.id]);
      expect(ainda.rows[0].cancelado_em).toBeNull();
    } finally {
      await rodarMigracao();   // devolve a política para os testes seguintes
    }
  });

  it("quem não tem perfil de escrita não cancela", async () => {
    const d = await doseNova();
    await db.exec("set valentrax.papel = 'medico'");
    try {
      const r = await comoApp(
        `update public.pep_aprazamentos
            set cancelado_em = now(), cancelamento_motivo = 'tentativa indevida'
          where id = $1 returning id`, [d.id]);
      expect(r.rows).toHaveLength(0);
    } finally {
      await db.exec("reset valentrax.papel");
    }
  });
});

describe("🔴 B) no UPDATE, só as três colunas de cancelamento mudam", () => {
  it("reescrever o horário é recusado", async () => {
    const d = await doseNova();
    const erro = await erroDe(() => comoApp(
      `update public.pep_aprazamentos set previsto_para = $2 where id = $1`,
      [d.id, "2026-10-20T18:00:00Z"]));
    expect(erro).toMatch(/não se reescreve/i);
  });

  it("🔴 e reescrever o horário JUNTO com um cancelamento válido também", async () => {
    // O caminho torto que uma política de LINHA não vê: o cancelamento é
    // legítimo, e de carona vai a mudança do fato clínico.
    const d = await doseNova();
    const erro = await erroDe(() => comoApp(
      `update public.pep_aprazamentos
          set cancelado_em = now(), cancelamento_motivo = 'motivo legitimo',
              previsto_para = $2
        where id = $1`, [d.id, "2026-10-20T18:00:00Z"]));
    expect(erro).toMatch(/não se reescreve/i);
  });

  it("trocar quem aprazou é recusado", async () => {
    const d = await doseNova();
    const erro = await erroDe(() => comoApp(
      `update public.pep_aprazamentos set aprazado_por = 'outra pessoa' where id = $1`,
      [d.id]));
    expect(erro).toMatch(/não se reescreve/i);
  });

  it("🔴 coluna NOVA nasce congelada, sem ninguém editar o gatilho", async () => {
    // É o que o `to_jsonb(new) - ...` compra: a trava não tem lista de
    // colunas para alguém esquecer de atualizar.
    await db.exec(`alter table public.pep_aprazamentos add column if not exists bip_novo text`);
    try {
      await db.exec(`grant update on public.pep_aprazamentos to authenticated`);
      const d = await doseNova();
      const erro = await erroDe(() => comoApp(
        `update public.pep_aprazamentos set bip_novo = 'x' where id = $1`, [d.id]));
      expect(erro).toMatch(/não se reescreve/i);
    } finally {
      await db.exec(`alter table public.pep_aprazamentos drop column bip_novo`);
    }
  });
});

describe("🔴 C) o único ignora as canceladas", () => {
  it("o único antigo, que travava o reaprazamento, saiu", async () => {
    const r = await db.query(`select 1 as x from pg_class where relname = 'pep_aprz_uq'`);
    expect(r.rows).toHaveLength(0);
  });

  it("🔴 reaprazar MANTENDO o mesmo horário funciona", async () => {
    // O caso comum, não o raro: o painel vem preenchido com os horários
    // atuais, então quem muda um horário mantém os outros.
    const d = await doseNova("2026-10-21T08:00:00Z");
    await comoApp(
      `update public.pep_aprazamentos
          set cancelado_em = now(), cancelamento_motivo = 'reaprazado pela enfermagem'
        where id = $1`, [d.id]);

    const erro = await erroDe(() => comoApp(
      `insert into public.pep_aprazamentos
         (item_id, prontuario, previsto_para, aprazado_por, conselho, registro_conselho)
       values ($1, 'T1', $2, 'Ana', 'COREN', '98765')`,
      [d.item_id, "2026-10-21T08:00:00Z"]));
    expect(erro, "a dose cancelada continuou reservando o horário").toBeNull();
  });

  it("duas doses VIGENTES no mesmo instante continuam recusadas", async () => {
    // A regra de fase1 continua valendo: a geração rodando duas vezes não
    // pode duplicar a fila de medicação da enfermagem.
    const d = await doseNova("2026-10-22T08:00:00Z");
    const erro = await erroDe(() => comoApp(
      `insert into public.pep_aprazamentos
         (item_id, prontuario, previsto_para, aprazado_por, conselho, registro_conselho)
       values ($1, 'T1', $2, 'Ana', 'COREN', '98765')`,
      [d.item_id, "2026-10-22T08:00:00Z"]));
    expect(erro).toMatch(/duplicate key|unique/i);
  });
});

describe("as recusas do gatilho (as 18 provas de antes, agora no repositório)", () => {
  it("cancelar sem motivo de verdade é recusado", async () => {
    const d = await doseNova();
    const erro = await erroDe(() => comoApp(
      `update public.pep_aprazamentos
          set cancelado_em = now(), cancelamento_motivo = 'ops'
        where id = $1`, [d.id]));
    expect(erro).toMatch(/pep_apraz_cancel_ck|check/i);
  });

  it("cancelar sem motivo nenhum é recusado", async () => {
    const d = await doseNova();
    const erro = await erroDe(() => comoApp(
      `update public.pep_aprazamentos set cancelado_em = now() where id = $1`, [d.id]));
    expect(erro).toMatch(/pep_apraz_cancel_ck|check/i);
  });

  it("🔴 cancelar dose JÁ ADMINISTRADA é recusado", async () => {
    const d = await doseNova();
    await db.query(
      `insert into public.pep_administracoes (aprazamento_id, status) values ($1, 'administrado')`,
      [d.id]);
    const erro = await erroDe(() => comoApp(
      `update public.pep_aprazamentos
          set cancelado_em = now(), cancelamento_motivo = 'mudei de ideia'
        where id = $1`, [d.id]));
    expect(erro).toMatch(/JÁ FOI ADMINISTRADA/);
  });

  it("dose com administração NÃO administrada (ausência, recusa) pode ser cancelada", async () => {
    const d = await doseNova();
    await db.query(
      `insert into public.pep_administracoes (aprazamento_id, status) values ($1, 'nao_administrado')`,
      [d.id]);
    const r = await comoApp(
      `update public.pep_aprazamentos
          set cancelado_em = now(), cancelamento_motivo = 'paciente desceu para exame'
        where id = $1 returning id`, [d.id]);
    expect(r.rows).toHaveLength(1);
  });

  it("descancelar é recusado", async () => {
    const d = await doseNova();
    await comoApp(
      `update public.pep_aprazamentos
          set cancelado_em = now(), cancelamento_motivo = 'troca de turno'
        where id = $1`, [d.id]);
    const erro = await erroDe(() => comoApp(
      `update public.pep_aprazamentos set cancelado_em = null where id = $1`, [d.id]));
    expect(erro).toMatch(/não volta|já foi cancelada/i);
  });
});

describe("🔴 D) reaprazar é uma transação só", () => {
  /** Chama a função como a tela chama. */
  async function reaprazar(itemId, motivo, doses) {
    return comoApp(
      `select * from public.apraz_reaprazar($1, $2, 'Ana', $3::jsonb)`,
      [itemId, motivo, JSON.stringify(doses)]);
  }

  /** Uma dose para mandar na chamada. */
  function dose(previsto, seq = 1) {
    return { prontuario: "T1", previsto_para: previsto, sequencia: seq,
             dose_prevista: "600 mg", via: "VO", aprazado_por: "Ana",
             conselho: "COREN", registro_conselho: "98765" };
  }

  it("troca as futuras e devolve as novas", async () => {
    const d = await doseNova("2027-01-10T08:00:00Z");
    const r = await reaprazar(d.item_id, "troca de turno da unidade",
      [dose("2027-01-10T09:00:00Z", 1), dose("2027-01-10T17:00:00Z", 2)]);
    expect(r.rows).toHaveLength(2);

    const estado = await db.query(
      `select id, cancelado_em, cancelamento_motivo from public.pep_aprazamentos
        where item_id = $1 order by id`, [d.item_id]);
    expect(estado.rows[0].cancelado_em, "a dose antiga não foi cancelada").toBeTruthy();
    expect(estado.rows[0].cancelamento_motivo).toBe("troca de turno da unidade");
    expect(estado.rows.filter(x => !x.cancelado_em)).toHaveLength(2);
  });

  it("🔴 SE A INSERÇÃO FALHA, O CANCELAMENTO VOLTA ATRÁS", async () => {
    // ═══════════════════════════════════════════════════════════
    // Este é o cenário medido no demo em 16/10/2026, com as duas
    // chamadas separadas: o cancelamento gravou, a inserção bateu num
    // `duplicate key`, e o paciente ficou com a grade VAZIA.
    //
    // Grade vazia, para quem está na enfermaria, é indistinguível de
    // "não há prescrição". Era o pior desfecho possível da tela.
    // ═══════════════════════════════════════════════════════════
    const dada = await doseNova("2027-02-10T08:00:00Z");
    await db.query(
      `insert into public.pep_administracoes (aprazamento_id, status) values ($1, 'administrado')`,
      [dada.id]);
    // uma segunda dose do MESMO item, futura e não administrada: é esta
    // que o reaprazamento cancelaria.
    const futura = await db.query(
      `insert into public.pep_aprazamentos (item_id, prontuario, previsto_para, aprazado_por, conselho, registro_conselho)
       values ($1, 'T1', '2027-02-10T16:00:00Z', 'Ana', 'COREN', '98765') returning id`,
      [dada.item_id]);

    // A dose nova cai no MESMO instante da que já foi administrada — que
    // continua vigente, porque não se cancela o que aconteceu.
    const erro = await erroDe(() => reaprazar(dada.item_id, "tentativa que vai falhar",
      [dose("2027-02-10T08:00:00Z", 1)]));
    expect(erro).toMatch(/duplicate key|unique/i);

    const estado = await db.query(
      `select id, cancelado_em from public.pep_aprazamentos where item_id = $1 order by id`,
      [dada.item_id]);
    expect(estado.rows, "apareceu linha nova apesar da falha").toHaveLength(2);
    expect(estado.rows.find(x => String(x.id) === String(futura.rows[0].id)).cancelado_em,
      "🔴 A DOSE FOI CANCELADA E NADA ENTROU NO LUGAR — a grade esvaziou").toBeNull();
  });

  it("🔴 reaprazar sem dose nenhuma é recusado", async () => {
    // Cancelar tudo e não pôr nada no lugar é o mesmo estrago, pedido de
    // outro jeito.
    const d = await doseNova("2027-03-10T08:00:00Z");
    for (const vazio of [[], null]) {
      const erro = await erroDe(() => reaprazar(d.item_id, "motivo qualquer", vazio));
      expect(erro).toMatch(/sem grade|dose nenhuma/i);
    }
    const estado = await db.query(
      `select cancelado_em from public.pep_aprazamentos where id = $1`, [d.id]);
    expect(estado.rows[0].cancelado_em).toBeNull();
  });

  it("🔴 dose PASSADA não é cancelada — ela é a prova de que a dose foi perdida", async () => {
    const passada = await doseNova("2020-05-05T08:00:00Z");
    await reaprazar(passada.item_id, "reaprazando daqui para a frente",
      [dose("2027-04-10T08:00:00Z", 1)]);
    const estado = await db.query(
      `select cancelado_em from public.pep_aprazamentos where id = $1`, [passada.id]);
    expect(estado.rows[0].cancelado_em,
      "a dose perdida foi apagada da história junto com o plano").toBeNull();
  });

  it("🔴 a função é `security invoker`: quem não pode escrever não reapraza", async () => {
    // Uma `security definer` aqui seria porta dos fundos para escrever no
    // prontuário sem passar pela barreira de módulo.
    const d = await doseNova("2027-05-10T08:00:00Z");
    await db.exec("set valentrax.papel = 'medico'");
    try {
      const erro = await erroDe(() => reaprazar(d.item_id, "tentativa indevida",
        [dose("2027-05-10T09:00:00Z", 1)]));
      expect(erro).toMatch(/row-level security|violates/i);
    } finally {
      await db.exec("reset valentrax.papel");
    }
    const estado = await db.query(
      `select cancelado_em from public.pep_aprazamentos where id = $1`, [d.id]);
    expect(estado.rows[0].cancelado_em).toBeNull();
  });
});

describe("a migração é idempotente", () => {
  it("rodar de novo não quebra nada, e o cancelamento continua gravando", async () => {
    await rodarMigracao();
    await rodarMigracao();
    const d = await doseNova();
    const r = await comoApp(
      `update public.pep_aprazamentos
          set cancelado_em = now(), cancelamento_motivo = 'depois de reaplicar'
        where id = $1 returning id`, [d.id]);
    expect(r.rows).toHaveLength(1);
  });

  it("🔴 num banco que já reaprazou, fase1 nem CONSEGUE recriar o único antigo", async () => {
    // 💡 Isto é melhor notícia do que eu esperava ao escrever o teste.
    //
    // O cabeçalho da migração avisa que reexecutar `migracao-pep-fase1.sql`
    // traz o índice antigo de volta e quebra o reaprazamento. Medindo, o
    // banco é mais duro que o aviso: onde já houve um reaprazamento existem
    // uma dose cancelada e uma vigente no mesmo instante, e o único sem
    // cláusula parcial NÃO PODE existir sobre esses dados.
    //
    // Então a armadilha não volta calada — ela volta como erro, no meio da
    // migração antiga, onde alguém vê. Vale saber qual dos dois é o risco.
    const erro = await erroDe(() => db.exec(
      `create unique index if not exists pep_aprz_uq
         on public.pep_aprazamentos (item_id, previsto_para)`));
    expect(erro).toMatch(/could not create unique index|duplicate key/i);
  });

  it("🔴 e num banco que ainda não reaprazou, a migração remove o único de novo", async () => {
    // O outro lado: aqui o índice antigo CONSEGUE nascer (nenhuma dose
    // cancelada compartilha instante com uma vigente), e é o caso em que o
    // aviso do cabeçalho vale — a migração tem de derrubá-lo outra vez.
    await db.exec(`delete from public.pep_aprazamentos where cancelado_em is not null`);
    await db.exec(`create unique index if not exists pep_aprz_uq
                     on public.pep_aprazamentos (item_id, previsto_para)`);
    expect((await db.query(`select 1 as x from pg_class where relname = 'pep_aprz_uq'`)).rows,
      "o índice antigo não voltou, e este teste não está medindo nada").toHaveLength(1);

    await rodarMigracao();
    const r = await db.query(`select 1 as x from pg_class where relname = 'pep_aprz_uq'`);
    expect(r.rows, "a migração não removeu o único antigo na segunda passada").toHaveLength(0);
  });
});
