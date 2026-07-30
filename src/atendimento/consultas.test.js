// ═══════════════════════════════════════════════════════════
// A PESQUISA DE ATENDIMENTOS
//
// Quatro coisas aqui são regra, não detalhe:
//
//   1. ISTO NÃO É PRONTUÁRIO. Se `cid` entrar na lista de campos, a tela
//      vira prontuário pesquisável por quem não tem direito a prontuário —
//      a separação da COFEN 754/2024 art. 6º furada por dentro, com
//      aparência de conveniência. O teste trava a lista.
//   2. PERÍODO TEM TETO. Cinco anos numa tela de balcão expõe mais gente do
//      que a pergunta pedia. É minimização (LGPD art. 6º, III), não limite
//      técnico.
//   3. A BORDA FINAL É O DIA SEGUINTE. Com `lte` num horário fixo, quem
//      chegou 23:59:30 ficava fora da própria data. Este sistema já teve
//      bug de borda de mês.
//   4. CANCELADO NÃO CONTA COMO VISITA ANTERIOR. Ele não aconteceu — e é
//      dele que sai o "há quantos dias foi a última consulta".
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  CAMPOS_DO_EPISODIO, MODOS, MAX_DIAS_PERIODO, validarPeriodo, bordasDoPeriodo,
  ultimoAtendimento, resumoDoHistorico, rotuloDoEpisodio, agruparPorAno,
} from "./consultas.js";

const at = (over = {}) => ({
  id: 1, prontuario: "100001", tipo_atendimento: "ambulatorial",
  chegada_em: "2026-06-12T09:00:00Z", status: "finalizado",
  especialidade_cod: "ORTOPEDIA", ...over,
});

describe("isto não é prontuário", () => {
  it("nenhum campo clínico entra na pesquisa", () => {
    for (const proibido of ["cid", "queixa", "alergias", "classificacao",
                            "pa_sist", "pa_diast", "temp", "spo2", "comorbidades",
                            "observacao", "triagem_extras"]) {
      expect(CAMPOS_DO_EPISODIO, proibido).not.toContain(proibido);
    }
  });

  it("traz o que responde a pergunta administrativa", () => {
    for (const preciso of ["id", "prontuario", "chegada_em", "status", "desfecho",
                           "tipo_atendimento", "especialidade_cod", "convenio_id"]) {
      expect(CAMPOS_DO_EPISODIO, preciso).toContain(preciso);
    }
  });

  it("não usa `*` — coluna clínica nova não vaza por acidente", () => {
    expect(CAMPOS_DO_EPISODIO).not.toContain("*");
  });

  it("os três modos de pesquisa existem", () => {
    expect(MODOS.map(m => m.chave)).toEqual(["paciente", "periodo", "numero"]);
  });
});

describe("período", () => {
  it("aceita um trimestre", () => {
    expect(validarPeriodo({ de: "2026-05-01", ate: "2026-07-01" }).ok).toBe(true);
  });

  it("RECUSA período maior que o teto, e explica que é minimização", () => {
    const r = validarPeriodo({ de: "2025-01-01", ate: "2026-07-30" });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/expõe mais gente/);
    expect(r.erros.join(" ")).toMatch(new RegExp(String(MAX_DIAS_PERIODO)));
  });

  it("o teto é exatamente 92 dias, inclusive nas duas pontas", () => {
    // 01/05 a 31/07 = 92 dias contando os dois extremos.
    expect(validarPeriodo({ de: "2026-05-01", ate: "2026-07-31" }).ok).toBe(true);
    expect(validarPeriodo({ de: "2026-05-01", ate: "2026-08-01" }).ok).toBe(false);
  });

  it("recusa período invertido", () => {
    const r = validarPeriodo({ de: "2026-07-30", ate: "2026-07-01" });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/anterior à inicial/);
  });

  it("exige as duas datas", () => {
    expect(validarPeriodo({ de: "2026-07-01" }).ok).toBe(false);
    expect(validarPeriodo({ ate: "2026-07-01" }).ok).toBe(false);
    expect(validarPeriodo({}).ok).toBe(false);
    expect(validarPeriodo({ de: "banana", ate: "2026-07-01" }).ok).toBe(false);
  });

  it("a borda final é o INÍCIO do dia seguinte", () => {
    const b = bordasDoPeriodo({ de: "2026-07-01", ate: "2026-07-01" });
    // Quem chegou 01/07 às 23:59:30 tem que entrar no resultado.
    expect(new Date("2026-07-01T23:59:30") < new Date(b.fim)).toBe(true);
    expect(new Date(b.fim).toISOString().slice(0, 10)).toBe("2026-07-02");
  });

  it("período inválido não produz bordas", () => {
    expect(bordasDoPeriodo({ de: "x", ate: "y" })).toBeNull();
    expect(bordasDoPeriodo({})).toBeNull();
  });
});

describe("último atendimento — o que faz 'retorno' significar algo", () => {
  const hist = [
    at({ id: 1, chegada_em: "2026-01-10T09:00:00Z" }),
    at({ id: 2, chegada_em: "2026-06-28T09:00:00Z" }),
    at({ id: 3, chegada_em: "2026-03-15T09:00:00Z", especialidade_cod: "UROLOGIA" }),
  ];

  it("acha o mais recente e diz há quantos dias", () => {
    const r = ultimoAtendimento(hist, { ate: "2026-07-30" });
    expect(r.atendimento.id).toBe(2);
    expect(r.data).toBe("2026-06-28");
    expect(r.diasAtras).toBe(32);
  });

  it("filtra por especialidade", () => {
    const r = ultimoAtendimento(hist, { especialidade: "UROLOGIA", ate: "2026-07-30" });
    expect(r.atendimento.id).toBe(3);
  });

  it("CANCELADO não conta como visita anterior — ele não aconteceu", () => {
    const r = ultimoAtendimento([
      at({ id: 9, chegada_em: "2026-07-29T09:00:00Z", status: "cancelado" }),
      at({ id: 2, chegada_em: "2026-06-28T09:00:00Z" }),
    ], { ate: "2026-07-30" });
    expect(r.atendimento.id).toBe(2);
  });

  it("sem histórico devolve null, não zero", () => {
    // Zero dias seria lido como "veio hoje" — o oposto de "nunca veio".
    expect(ultimoAtendimento([], {})).toBeNull();
    expect(ultimoAtendimento(null, {})).toBeNull();
    expect(ultimoAtendimento(hist, { especialidade: "CARDIOLOGIA" })).toBeNull();
  });

  it("NÃO afirma se ainda vale como retorno", () => {
    // O prazo é do contrato do convênio ou da norma do hospital, varia, e
    // ninguém configurou. A função devolve o fato, não o veredito.
    const r = ultimoAtendimento(hist, { ate: "2026-07-30" });
    expect(r).not.toHaveProperty("ehRetorno");
    expect(r).not.toHaveProperty("dentroDoPrazo");
  });

  it("ignora atendimento sem data de chegada", () => {
    const r = ultimoAtendimento([at({ id: 5, chegada_em: null })], {});
    expect(r).toBeNull();
  });
});

describe("resumo do histórico", () => {
  const hist = [
    at({ id: 1, chegada_em: "2025-02-10T09:00:00Z", tipo_atendimento: "emergencia" }),
    at({ id: 2, chegada_em: "2026-06-28T09:00:00Z", tipo_atendimento: "ambulatorial" }),
    at({ id: 3, chegada_em: "2026-07-01T09:00:00Z", tipo_atendimento: "ambulatorial", status: "aguardando_atendimento" }),
    at({ id: 4, chegada_em: "2026-07-02T09:00:00Z", status: "cancelado" }),
  ];

  it("conta os válidos e separa os cancelados", () => {
    const r = resumoDoHistorico(hist);
    expect(r.total).toBe(3);
    expect(r.cancelados).toBe(1);
  });

  it("conta os abertos pela fonte única do ciclo", () => {
    expect(resumoDoHistorico(hist).abertos).toBe(1);
  });

  it("separa por tipo de atendimento", () => {
    const r = resumoDoHistorico(hist);
    expect(r.porTipo.ambulatorial).toBe(2);
    expect(r.porTipo.emergencia).toBe(1);
  });

  it("primeira e última visita saem do histórico válido", () => {
    const r = resumoDoHistorico(hist);
    expect(r.primeira).toBe("2025-02-10");
    expect(r.ultima).toBe("2026-07-01");
  });

  it("histórico vazio não explode nem inventa data", () => {
    const r = resumoDoHistorico([]);
    expect(r.total).toBe(0);
    expect(r.primeira).toBeNull();
    expect(r.ultima).toBeNull();
  });
});

describe("apresentação", () => {
  it("o rótulo junta status e desfecho quando há desfecho", () => {
    expect(rotuloDoEpisodio(at({ status: "finalizado", desfecho: "alta" }))).toMatch(/Finalizado · alta/);
    expect(rotuloDoEpisodio(at({ status: "em_atendimento", desfecho: null }))).toBe("Em atendimento");
  });

  it("rótulo de coisa desconhecida não quebra", () => {
    expect(rotuloDoEpisodio(null)).toBe("—");
    expect(rotuloDoEpisodio({ status: "inventado" })).toBe("inventado");
  });

  it("agrupa por ano, do mais recente para o mais antigo", () => {
    const g = agruparPorAno([
      at({ id: 1, chegada_em: "2024-05-01T09:00:00Z" }),
      at({ id: 2, chegada_em: "2026-01-01T09:00:00Z" }),
      at({ id: 3, chegada_em: "2026-07-01T09:00:00Z" }),
    ]);
    expect(g.map(x => x.ano)).toEqual(["2026", "2024"]);
    expect(g[0].itens.map(x => x.id)).toEqual([3, 2]);
  });

  it("agrupar lista vazia devolve lista vazia", () => {
    expect(agruparPorAno([])).toEqual([]);
    expect(agruparPorAno(null)).toEqual([]);
  });
});
