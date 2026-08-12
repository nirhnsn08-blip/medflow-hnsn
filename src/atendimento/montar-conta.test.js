// Testes do motor "a conta se monta do prontuário" (puro).
//
// Cobrem: a resolução da via, o procedimento principal cruzado com os dois
// catálogos, a permanência virando diária, a medicação administrada agrupada,
// a pré-glosa e — o que mais importa neste app — as regras que protegem quem
// foi atendido: SUS não cobra do paciente, e FALTA DE DADO É SILÊNCIO (preço
// nunca inventado, glosa nunca falsa).

import { describe, it, expect } from "vitest";
import {
  montarContaDoProntuario, resolverVia, janelaInternacao, escolherInternacao, montarWorklist,
} from "./montar-conta.js";
import { camposDoItem } from "./faturamento.js";
import { GRAVIDADES as SIG_GRAV } from "./sigtap.js";

// ── fábricas ────────────────────────────────────────────────
const atend = (over = {}) => ({
  id: 501,
  prontuario: "1024",
  procedimento_cod: "0303010037", // grupo 03 (clínico) → AIH pelo grupo
  cid: "J18",
  chegada_em: "2026-08-01T10:00:00Z",
  desfecho: null,
  desfecho_em: null,
  medico: "Dra. Ana",
  medico_cbo: "225125",
  idade: 40,
  ...over,
});
const SUS = { tipo: "sus" };
const PARTICULAR = { tipo: "particular" };
const CONVENIO = { tipo: "convenio" };

const catProc = (over = {}) => ({
  codigo: "0303010037", nome: "Tratamento de pneumonia", valor_sus: 850.0, via_sus: null, ...over,
});
const sigProc = (over = {}) => ({
  codigo: "0303010037", nome: "Trat. pneumonia (SIGTAP)", via: "aih",
  media_permanencia: 6, sexo: null, idade_min: null, idade_max: null, ...over,
});
const adm = (over = {}) => ({
  medicamento_nome: "Dipirona 500mg", medicamento_id: null, status: "administrado",
  administrado_em: "2026-08-01T12:00:00Z", ...over,
});

// ── VIA ─────────────────────────────────────────────────────
describe("resolverVia", () => {
  it("sem convênio, não há via", () => {
    expect(resolverVia({ convenio: null, atendimento: atend() })).toBeNull();
  });
  it("particular → cobrança direta; convênio → TISS", () => {
    expect(resolverVia({ convenio: PARTICULAR, atendimento: atend() })).toBe("direta");
    expect(resolverVia({ convenio: CONVENIO, atendimento: atend() })).toBe("tiss");
  });
  it("internou pelo SUS → AIH, acima do procedimento", () => {
    // procedimento ambulatorial (grupo 02 = BPA), mas internou → manda a AIH
    const at = atend({ procedimento_cod: "0201010283", desfecho: "internacao" });
    expect(resolverVia({ convenio: SUS, atendimento: at })).toBe("aih");
  });
  it("SUS: o cadastro do hospital (via_sus) vale primeiro", () => {
    const via = resolverVia({
      convenio: SUS, atendimento: atend({ procedimento_cod: "0201010283" }),
      procCatalogo: catProc({ codigo: "0201010283", via_sus: "apac" }),
    });
    expect(via).toBe("apac");
  });
  it("SUS sem cadastro: cai no palpite do grupo (03/04 → AIH; resto → BPA)", () => {
    expect(resolverVia({ convenio: SUS, atendimento: atend({ procedimento_cod: "0303010037" }) })).toBe("aih");
    expect(resolverVia({ convenio: SUS, atendimento: atend({ procedimento_cod: "0201010283" }) })).toBe("bpa");
  });
});

// ── JANELA DE INTERNAÇÃO ────────────────────────────────────
describe("janelaInternacao", () => {
  it("usa as datas do leito quando existem (não estimada)", () => {
    const j = janelaInternacao({
      atendimento: atend({ desfecho: "internacao", chegada_em: "2026-08-01T00:00:00Z", desfecho_em: "2026-08-02T00:00:00Z" }),
      internacao: { admissao: "2026-08-03", alta: "2026-08-09" },
    });
    expect(j).toMatchObject({ admissao: "2026-08-03", alta: "2026-08-09", estimada: false });
  });
  it("na falta, e só se internou, estima pela passagem no PS", () => {
    const j = janelaInternacao({ atendimento: atend({ desfecho: "internacao", desfecho_em: "2026-08-07T00:00:00Z" }) });
    expect(j.admissao).toBe("2026-08-01T10:00:00Z");
    expect(j.alta).toBe("2026-08-07T00:00:00Z");
    expect(j.estimada).toBe(true);
  });
  it("não inventa internação onde não houve", () => {
    const j = janelaInternacao({ atendimento: atend({ desfecho: "alta" }) });
    expect(j).toMatchObject({ admissao: null, alta: null, estimada: false });
  });
  it("internação em curso (alta null da fonte) NÃO herda o desfecho do PS", () => {
    const j = janelaInternacao({
      atendimento: atend({ desfecho: "internacao", desfecho_em: "2026-08-05T00:00:00Z" }),
      internacao: { admissao: "2026-08-01", alta: null },
    });
    expect(j).toEqual({ admissao: "2026-08-01", alta: null, estimada: false });
  });
});

describe("escolherInternacao", () => {
  const at = (o = {}) => atend({ chegada_em: "2026-08-01T10:00:00Z", ...o });

  it("leito ocupado do episódio → internação em curso (admissão exata, sem alta)", () => {
    const r = escolherInternacao({ leitoAtivo: { data_internacao: "2026-08-01" }, saidas: [], atendimento: at() });
    expect(r).toEqual({ admissao: "2026-08-01", alta: null, fonte: "leito-ativo" });
  });

  it("saída de leito cujo início casa com o episódio → admissão + alta", () => {
    const r = escolherInternacao({
      leitoAtivo: null,
      saidas: [{ data_internacao: "2026-08-01", data_alta: "2026-08-08", dias_permanencia: 7 }],
      atendimento: at(),
    });
    expect(r).toMatchObject({ admissao: "2026-08-01", alta: "2026-08-08", fonte: "saida-leito" });
  });

  it("ignora saída que começou ANTES da chegada (é de outro episódio)", () => {
    const r = escolherInternacao({
      leitoAtivo: null,
      saidas: [{ data_internacao: "2026-07-20", data_alta: "2026-07-25" }],
      atendimento: at(),
    });
    expect(r).toBeNull();
  });

  it("ignora saída fora da janela do episódio (> 7 dias após a chegada)", () => {
    const r = escolherInternacao({
      leitoAtivo: null,
      saidas: [{ data_internacao: "2026-08-15", data_alta: "2026-08-20" }],
      atendimento: at(),
    });
    expect(r).toBeNull();
  });

  it("com várias saídas na janela, pega a que começou mais perto da chegada", () => {
    const r = escolherInternacao({
      leitoAtivo: null,
      saidas: [
        { data_internacao: "2026-08-05", data_alta: "2026-08-10" },
        { data_internacao: "2026-08-02", data_alta: "2026-08-06" },
      ],
      atendimento: at(),
    });
    expect(r.admissao).toBe("2026-08-02");
  });

  it("sem leito e sem saída casável → null (o motor estima pelo PS)", () => {
    expect(escolherInternacao({ leitoAtivo: null, saidas: [], atendimento: at() })).toBeNull();
  });

  it("ponta a ponta: a conta usa a permanência do leito, não a estimativa do PS", () => {
    const atendimento = atend({ chegada_em: "2026-08-01T10:00:00Z", desfecho: "internacao", desfecho_em: "2026-08-02T00:00:00Z" });
    const internacao = escolherInternacao({
      leitoAtivo: null,
      saidas: [{ data_internacao: "2026-08-02", data_alta: "2026-08-12" }],
      atendimento,
    });
    const r = montarContaDoProntuario({ atendimento, convenio: SUS, sigtapProcs: [sigProc({ media_permanencia: 6 })], internacao });
    const d = r.itens.find((i) => i.tipo === "diaria");
    expect(d.quantidade).toBe(10); // 02→12 do leito, não 1 dia da passagem no PS
    expect(r.avisos.some((a) => /estimada pela passagem/i.test(a))).toBe(false);
  });
});

// ── PROCEDIMENTO PRINCIPAL ──────────────────────────────────
describe("procedimento principal", () => {
  it("puxa nome e preço do catálogo do hospital", () => {
    const r = montarContaDoProntuario({ atendimento: atend(), convenio: SUS, procedimentos: [catProc()] });
    const p = r.itens.find((i) => i.tipo === "procedimento");
    expect(p).toMatchObject({ codigo: "0303010037", descricao: "Tratamento de pneumonia", quantidade: 1, valor_unitario: 850.0 });
    expect(p.origem).toMatch(/principal/i);
    expect(p.executante).toBe("Dra. Ana");
    expect(p.executante_cbo).toBe("225125");
  });
  it("sem preço no hospital, usa o nome do SIGTAP e avisa", () => {
    const r = montarContaDoProntuario({ atendimento: atend(), convenio: SUS, sigtapProcs: [sigProc()] });
    const p = r.itens.find((i) => i.tipo === "procedimento");
    expect(p.descricao).toBe("Trat. pneumonia (SIGTAP)");
    expect(p.valor_unitario).toBeNull();
    expect(r.avisos.some((a) => /catálogo de preços/i.test(a))).toBe(true);
  });
  it("fora de todo catálogo: entra com o código, sem nome nem preço, e avisa", () => {
    const r = montarContaDoProntuario({ atendimento: atend(), convenio: SUS });
    const p = r.itens.find((i) => i.tipo === "procedimento");
    expect(p).toMatchObject({ codigo: "0303010037", descricao: null, valor_unitario: null });
    expect(r.avisos.some((a) => /não está em nenhum catálogo/i.test(a))).toBe(true);
  });
  it("sem procedimento_cod, não cria item e avisa", () => {
    const r = montarContaDoProntuario({ atendimento: atend({ procedimento_cod: null }), convenio: SUS });
    expect(r.itens.some((i) => i.tipo === "procedimento")).toBe(false);
    expect(r.avisos.some((a) => /sem procedimento principal/i.test(a))).toBe(true);
  });
});

// ── PERMANÊNCIA / DIÁRIAS ───────────────────────────────────
describe("permanência", () => {
  it("AIH com admissão e alta → diária com quantidade = dias, sem preço inventado", () => {
    const r = montarContaDoProntuario({
      atendimento: atend(), convenio: SUS, sigtapProcs: [sigProc({ media_permanencia: 6 })],
      internacao: { admissao: "2026-08-01", alta: "2026-08-07" },
    });
    const d = r.itens.find((i) => i.tipo === "diaria");
    expect(d).toMatchObject({ quantidade: 6, valor_unitario: null });
    expect(d.origem).toMatch(/01\/08\/2026 → 07\/08\/2026/);
    expect(r.permanencia).toMatchObject({ dias: 6, media: 6, excede: false });
  });
  it("permanência acima da média → diária existe + glosa de ATENÇÃO (não recusa)", () => {
    const r = montarContaDoProntuario({
      atendimento: atend(), convenio: SUS, sigtapProcs: [sigProc({ media_permanencia: 6 })],
      internacao: { admissao: "2026-08-01", alta: "2026-08-13" }, // 12 dias
    });
    expect(r.permanencia.excede).toBe(true);
    expect(r.glosa.some((g) => g.regra === "permanencia" && g.gravidade === SIG_GRAV.ATENCAO)).toBe(true);
    expect(r.temImpedimento).toBe(false);
  });
  it("internação em curso (sem alta) → não gera diária e avisa", () => {
    const r = montarContaDoProntuario({
      atendimento: atend({ desfecho: "internacao", desfecho_em: null }), convenio: SUS,
    });
    expect(r.itens.some((i) => i.tipo === "diaria")).toBe(false);
    expect(r.avisos.some((a) => /em curso/i.test(a))).toBe(true);
  });
  it("admissão e alta no mesmo dia → sem diária, com aviso de conferência", () => {
    const r = montarContaDoProntuario({
      atendimento: atend(), convenio: SUS, internacao: { admissao: "2026-08-01", alta: "2026-08-01" },
    });
    expect(r.itens.some((i) => i.tipo === "diaria")).toBe(false);
    expect(r.avisos.some((a) => /mesmo dia/i.test(a))).toBe(true);
  });
  it("estimada pelo PS avisa que precisa confirmar com o leito", () => {
    const r = montarContaDoProntuario({
      atendimento: atend({ desfecho: "internacao", chegada_em: "2026-08-01T10:00:00Z", desfecho_em: "2026-08-05T10:00:00Z" }),
      convenio: SUS,
    });
    expect(r.itens.find((i) => i.tipo === "diaria").quantidade).toBe(4);
    expect(r.avisos.some((a) => /estimada pela passagem/i.test(a))).toBe(true);
  });
  it("via não-AIH não tem diária mesmo com datas", () => {
    const r = montarContaDoProntuario({
      atendimento: atend({ procedimento_cod: "0201010283" }), convenio: SUS,
      internacao: { admissao: "2026-08-01", alta: "2026-08-07" },
    });
    expect(r.via).toBe("bpa");
    expect(r.itens.some((i) => i.tipo === "diaria")).toBe(false);
  });
});

// ── MEDICAÇÃO ADMINISTRADA ──────────────────────────────────
describe("medicação administrada", () => {
  it("agrupa por medicamento e conta as vezes; ignora o não administrado", () => {
    const r = montarContaDoProntuario({
      atendimento: atend(), convenio: SUS,
      administracoes: [
        adm({ medicamento_nome: "Dipirona 500mg" }),
        adm({ medicamento_nome: "Dipirona 500mg" }),
        adm({ medicamento_nome: "Dipirona 500mg", status: "nao_administrado" }),
        adm({ medicamento_nome: "Ceftriaxona 1g" }),
      ],
    });
    const meds = r.itens.filter((i) => i.tipo === "medicamento");
    expect(meds).toHaveLength(2);
    const dip = meds.find((m) => /Dipirona/.test(m.descricao));
    expect(dip.quantidade).toBe(2);
    expect(dip.valor_unitario).toBeNull(); // sem preço, para conferência
    expect(dip.origem).toMatch(/2×/);
  });
  it("status ausente conta como administrado (o padrão)", () => {
    const r = montarContaDoProntuario({
      atendimento: atend(), convenio: SUS, administracoes: [adm({ status: undefined })],
    });
    expect(r.itens.filter((i) => i.tipo === "medicamento")).toHaveLength(1);
  });
});

// ── CID ─────────────────────────────────────────────────────
describe("CID", () => {
  it("normaliza (maiúsculas, sem pontuação)", () => {
    const r = montarContaDoProntuario({ atendimento: atend({ cid: "j18.9" }), convenio: SUS });
    expect(r.cid).toBe("J189");
  });
  it("AIH sem CID avisa que a internação exige diagnóstico", () => {
    const r = montarContaDoProntuario({ atendimento: atend({ cid: null }), convenio: SUS });
    expect(r.via).toBe("aih");
    expect(r.avisos.some((a) => /sem CID/i.test(a))).toBe(true);
  });
});

// ── PRÉ-GLOSA ───────────────────────────────────────────────
describe("pré-glosa", () => {
  it("sexo incompatível é IMPEDIMENTO e derruba 'prontas'", () => {
    const r = montarContaDoProntuario({
      atendimento: atend(), convenio: SUS, sigtapProcs: [sigProc({ sexo: "F" })],
      paciente: { sexo: "M" }, procedimentos: [catProc()],
    });
    expect(r.glosa.some((g) => g.regra === "sexo" && g.gravidade === SIG_GRAV.IMPEDIMENTO)).toBe(true);
    expect(r.temImpedimento).toBe(true);
    expect(r.prontas).toBe(false);
  });
  it("idade abaixo do mínimo é IMPEDIMENTO", () => {
    const r = montarContaDoProntuario({
      atendimento: atend({ idade: 10 }), convenio: SUS, sigtapProcs: [sigProc({ idade_min: 18 })],
    });
    expect(r.glosa.some((g) => g.regra === "idade" && g.gravidade === SIG_GRAV.IMPEDIMENTO)).toBe(true);
  });
  it("sem o dado (sexo/idade/faixa), a glosa CALA — nada de alarme falso", () => {
    const r = montarContaDoProntuario({
      atendimento: atend({ idade: null }), convenio: SUS, sigtapProcs: [sigProc()], paciente: null,
      procedimentos: [catProc()],
    });
    expect(r.glosa).toHaveLength(0);
    expect(r.temImpedimento).toBe(false);
  });
});

// ── TOTAL E REGRAS DURAS ────────────────────────────────────
describe("total e regras", () => {
  it("soma em centavos e conta os itens sem preço", () => {
    const r = montarContaDoProntuario({
      atendimento: atend(), convenio: SUS, procedimentos: [catProc({ valor_sus: 850.0 })],
      internacao: { admissao: "2026-08-01", alta: "2026-08-04" }, // diária sem preço
      administracoes: [adm()], // med sem preço
    });
    expect(r.totalCentavos).toBe(85000); // só o procedimento tem preço
    expect(r.semPreco).toBe(2); // diária + medicamento
    expect(r.avisos.some((a) => /sem preço/i.test(a))).toBe(true);
  });

  it("TODO item nasce sem cobrança do paciente — SUS nunca cobra de quem foi atendido", () => {
    const r = montarContaDoProntuario({
      atendimento: atend(), convenio: SUS, procedimentos: [catProc()],
      internacao: { admissao: "2026-08-01", alta: "2026-08-03" }, administracoes: [adm()],
    });
    expect(r.itens.length).toBeGreaterThan(0);
    expect(r.itens.every((i) => i.cobrar_do_paciente === false)).toBe(true);
  });

  it("os itens propostos passam por camposDoItem sem perder nada (alimenta a conta do Adauam)", () => {
    const r = montarContaDoProntuario({ atendimento: atend(), convenio: SUS, procedimentos: [catProc()] });
    const gravavel = camposDoItem({ ...r.itens[0], conta_id: 99 });
    expect(gravavel).toMatchObject({
      conta_id: 99, tipo: "procedimento", codigo: "0303010037",
      descricao: "Tratamento de pneumonia", quantidade: 1, valor_unitario: 850.0, valor_total: 850.0,
    });
    // origem/fonte são de tela — não vazam para o banco
    expect("origem" in gravavel).toBe(false);
    expect("fonte" in gravavel).toBe(false);
  });

  it("sem atendimento, devolve ok:false sem inventar conta", () => {
    const r = montarContaDoProntuario({ atendimento: null });
    expect(r.ok).toBe(false);
    expect(r.itens).toHaveLength(0);
    expect(r.prontas).toBe(false);
  });

  it("'prontas' exige item, via e nenhum impedimento", () => {
    const r = montarContaDoProntuario({ atendimento: atend(), convenio: SUS, procedimentos: [catProc()] });
    expect(r.prontas).toBe(true);
    expect(r.competencia).toBe("2026-08");
  });
});

// ── WORKLIST ────────────────────────────────────────────────
describe("montarWorklist", () => {
  const internacoes = [
    { id: 1, iniciais: "A", chegada_em: "2026-08-10T10:00:00Z" }, // aberta
    { id: 2, iniciais: "B", chegada_em: "2026-08-12T10:00:00Z" }, // sem conta (mais recente)
    { id: 3, iniciais: "C", chegada_em: "2026-08-01T10:00:00Z" }, // faturada
    { id: 4, iniciais: "D", chegada_em: "2026-08-11T10:00:00Z" }, // sem conta
  ];
  const contas = [
    { id: 91, atendimento_id: 1, status: "aberta" },
    { id: 92, atendimento_id: 3, status: "faturada" },
    { id: 93, atendimento_id: 99, status: "aberta" }, // de outro atendimento — ignorada aqui
  ];

  it("junta a conta ao episódio e deriva a situação", () => {
    const w = montarWorklist(internacoes, contas);
    const porId = Object.fromEntries(w.map((r) => [r.id, r.situacao]));
    expect(porId).toEqual({ 1: "aberta", 2: "sem-conta", 3: "faturada", 4: "sem-conta" });
  });

  it("ordena por ação primeiro (sem-conta → aberta → faturada), recente no topo dentro do grupo", () => {
    const w = montarWorklist(internacoes, contas);
    expect(w.map((r) => r.id)).toEqual([2, 4, 1, 3]); // 2 e 4 sem-conta (12>11), depois aberta (1), depois faturada (3)
  });

  it("conta cancelada não conta — o episódio volta a 'sem-conta'", () => {
    const w = montarWorklist(
      [{ id: 5, chegada_em: "2026-08-05T00:00:00Z" }],
      [{ id: 94, atendimento_id: 5, status: "cancelada" }],
    );
    expect(w[0].situacao).toBe("sem-conta");
    expect(w[0].conta).toBeNull();
  });

  it("listas vazias não quebram", () => {
    expect(montarWorklist()).toEqual([]);
    expect(montarWorklist([], [])).toEqual([]);
  });
});
