// Testes do prontuário do internado.
//
// A lógica crítica aqui é derivar estado a partir de tabelas append-only.
// Errar significa mostrar como ativo um medicamento que foi suspenso — ou
// o contrário, esconder um que está valendo.

import { describe, it, expect } from "vitest";
import {
  episodioAtivo, diasInternacao, estadoDosItens, prescricaoVigente,
  itensAtivos, horariosDoDia, checarAprazamento, serieSinaisVitais,
  scoreAlertaPrecoce, timelineEpisodio,
} from "./prontuario.js";

describe("episódio", () => {
  it("acha o episódio aberto", () => {
    const e = episodioAtivo([
      { id: 1, status: "encerrado", alta_em: "2026-07-01T10:00:00Z" },
      { id: 2, status: "aberto", alta_em: null },
    ]);
    expect(e.id).toBe(2);
  });

  it("episódio com alta não conta como aberto, mesmo com status errado", () => {
    expect(episodioAtivo([{ id: 1, status: "aberto", alta_em: "2026-07-01T10:00:00Z" }])).toBeNull();
  });

  it("conta os dias de internação", () => {
    const e = { admissao_em: "2026-07-15T08:00:00Z" };
    expect(diasInternacao(e, new Date("2026-07-22T08:00:00Z"))).toBe(7);
  });

  it("paciente com alta conta até a alta, não até hoje", () => {
    const e = { admissao_em: "2026-07-15T08:00:00Z", alta_em: "2026-07-18T08:00:00Z" };
    expect(diasInternacao(e, new Date("2026-07-30T08:00:00Z"))).toBe(3);
  });
});

describe("estado derivado dos eventos (append-only)", () => {
  const ev = (id, item_id, evento, criado_em) => ({ id, item_id, evento, criado_em });

  it("item sem evento está ativo", () => {
    expect(itensAtivos([{ id: 1, medicamento_id: 9 }], [])).toHaveLength(1);
  });

  it("item suspenso sai da lista de ativos", () => {
    const at = itensAtivos([{ id: 1 }], [ev(1, 1, "suspenso", "2026-07-22T10:00:00Z")]);
    expect(at).toHaveLength(0);
  });

  it("suspender e depois reativar deixa o item ATIVO", () => {
    const eventos = [
      ev(1, 1, "suspenso",  "2026-07-22T10:00:00Z"),
      ev(2, 1, "reativado", "2026-07-22T14:00:00Z"),
    ];
    expect(itensAtivos([{ id: 1 }], eventos)).toHaveLength(1);
  });

  it("a ordem no array não importa — vale a data mais recente", () => {
    const eventos = [
      ev(2, 1, "reativado", "2026-07-22T14:00:00Z"),
      ev(1, 1, "suspenso",  "2026-07-22T10:00:00Z"),
    ];
    expect(itensAtivos([{ id: 1 }], eventos)).toHaveLength(1);
  });

  it("empate de data desempata pelo id (append-only cresce)", () => {
    const t = "2026-07-22T10:00:00Z";
    const eventos = [ev(1, 1, "reativado", t), ev(2, 1, "suspenso", t)];
    expect(itensAtivos([{ id: 1 }], eventos)).toHaveLength(0);
  });

  it("encerrado também sai dos ativos", () => {
    expect(estadoDosItens([ev(1, 1, "encerrado", "2026-07-22T10:00:00Z")])[1]).toBe("encerrado");
  });

  it("respeita a ordem de exibição", () => {
    const at = itensAtivos([{ id: 1, ordem: 2 }, { id: 2, ordem: 1 }], []);
    expect(at[0].id).toBe(2);
  });
});

describe("prescrição vigente", () => {
  const p = (id, extra = {}) => ({ id, assinada_em: "2026-07-22T08:00:00Z", data_referencia: "2026-07-22", ...extra });

  it("ignora prescrição não assinada", () => {
    expect(prescricaoVigente([p(1, { assinada_em: null })])).toBeNull();
  });

  it("a prescrição substituída sai de cena", () => {
    const v = prescricaoVigente([p(1), p(2, { substitui_id: 1, assinada_em: "2026-07-22T09:00:00Z" })]);
    expect(v.id).toBe(2);
  });

  it("sem nada assinado devolve null", () => {
    expect(prescricaoVigente([])).toBeNull();
    expect(prescricaoVigente(null)).toBeNull();
  });
});

describe("aprazamento", () => {
  const dia = new Date("2026-07-22T12:00:00");

  it("6/6h gera 4 horários", () => {
    expect(horariosDoDia({ frequencia_dia: 4 }, dia)).toHaveLength(4);
  });

  it("1x/dia gera 1 horário", () => {
    expect(horariosDoDia({ frequencia_dia: 1 }, dia)).toHaveLength(1);
  });

  it("'se necessário' NÃO gera horário — por definição não tem hora marcada", () => {
    expect(horariosDoDia({ frequencia_dia: 4, se_necessario: true }, dia)).toHaveLength(0);
  });

  it("sem frequência não gera nada (não inventa)", () => {
    expect(horariosDoDia({ frequencia_dia: null }, dia)).toHaveLength(0);
  });

  it("intervalo_horas tem precedência sobre a frequência", () => {
    expect(horariosDoDia({ frequencia_dia: 4, intervalo_horas: 8 }, dia)).toHaveLength(3);
  });

  it("marca dose administrada dentro da tolerância", () => {
    const h = [new Date("2026-07-22T06:00:00")];
    const r = checarAprazamento(h, [{ administrado_em: "2026-07-22T06:20:00", status: "administrado" }],
                                new Date("2026-07-22T08:00:00"));
    expect(r[0].administrado).toBe(true);
    expect(r[0].atrasado).toBe(false);
  });

  it("marca ATRASADO quando passou a tolerância e ninguém deu", () => {
    const h = [new Date("2026-07-22T06:00:00")];
    const r = checarAprazamento(h, [], new Date("2026-07-22T09:00:00"));
    expect(r[0].atrasado).toBe(true);
  });

  it("horário futuro fica pendente, não atrasado", () => {
    const h = [new Date("2026-07-22T18:00:00")];
    const r = checarAprazamento(h, [], new Date("2026-07-22T09:00:00"));
    expect(r[0].pendente).toBe(true);
    expect(r[0].atrasado).toBe(false);
  });

  it("uma administração não cobre dois horários", () => {
    const h = [new Date("2026-07-22T06:00:00"), new Date("2026-07-22T06:30:00")];
    const r = checarAprazamento(h, [{ administrado_em: "2026-07-22T06:10:00", status: "administrado" }],
                                new Date("2026-07-22T12:00:00"));
    expect(r.filter(x => x.administrado)).toHaveLength(1);
  });

  it("dose dada com atraso CUMPRE o horário — não conta como pulada", () => {
    // a dose das 06h administrada às 09h continua sendo a dose das 06h.
    // Marcá-la como não-administrada afirmaria que foi PULADA, que é uma
    // afirmação clínica diferente e mais grave.
    const h = [new Date("2026-07-22T06:00:00"), new Date("2026-07-22T12:00:00")];
    const r = checarAprazamento(h, [{ administrado_em: "2026-07-22T09:00:00", status: "administrado" }],
                                new Date("2026-07-22T10:00:00"));
    expect(r[0].administrado).toBe(true);
    expect(r[0].administradoComAtraso).toBe(true);
    expect(r[0].atrasado).toBe(false);     // já não está pendente de atraso: foi dada
    expect(r[1].administrado).toBe(false); // a das 12h continua por fazer
  });

  it("dose no horário não é marcada como atrasada", () => {
    const h = [new Date("2026-07-22T06:00:00")];
    const r = checarAprazamento(h, [{ administrado_em: "2026-07-22T06:15:00", status: "administrado" }],
                                new Date("2026-07-22T08:00:00"));
    expect(r[0].administradoComAtraso).toBe(false);
  });

  it("duas doses atrasadas cumprem os dois horários vencidos, na ordem", () => {
    const h = [new Date("2026-07-22T06:00:00"), new Date("2026-07-22T12:00:00")];
    const r = checarAprazamento(h, [
      { administrado_em: "2026-07-22T09:00:00", status: "administrado" },
      { administrado_em: "2026-07-22T14:00:00", status: "administrado" },
    ], new Date("2026-07-22T15:00:00"));
    expect(r[0].administrado).toBe(true);
    expect(r[1].administrado).toBe(true);
  });

  it("dose registrada como NÃO administrada não conta como feita", () => {
    const h = [new Date("2026-07-22T06:00:00")];
    const r = checarAprazamento(h, [{ administrado_em: "2026-07-22T06:05:00", status: "nao_administrado" }],
                                new Date("2026-07-22T09:00:00"));
    expect(r[0].administrado).toBe(false);
  });
});

describe("sinais vitais", () => {
  it("ordena do mais antigo ao mais novo (ordem do gráfico)", () => {
    const s = serieSinaisVitais([
      { id: 2, aferido_em: "2026-07-22T12:00:00Z" },
      { id: 1, aferido_em: "2026-07-22T06:00:00Z" },
    ]);
    expect(s[0].id).toBe(1);
  });

  it("aferição corrigida é substituída pela correção", () => {
    const s = serieSinaisVitais([
      { id: 1, aferido_em: "2026-07-22T06:00:00Z", fc: 200 },
      { id: 2, aferido_em: "2026-07-22T06:00:00Z", fc: 100, corrige_id: 1 },
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].fc).toBe(100);
  });
});

describe("escore de alerta precoce (NEWS)", () => {
  it("paciente estável pontua zero", () => {
    const r = scoreAlertaPrecoce({ fr: 16, spo2: 98, temp: 36.5, pa_sist: 120, fc: 70, consciencia: "A" });
    expect(r.score).toBe(0);
    expect(r.nivel).toBe("normal");
  });

  it("paciente deteriorando pontua alto e pede avaliação imediata", () => {
    const r = scoreAlertaPrecoce({ fr: 24, spo2: 92, temp: 38.5, pa_sist: 95, fc: 120, consciencia: "V" });
    expect(r.score).toBeGreaterThanOrEqual(7);
    expect(r.nivel).toBe("alto");
    expect(r.conduta).toMatch(/imediata/i);
  });

  it("devolve null com dados insuficientes — não dá falsa segurança", () => {
    expect(scoreAlertaPrecoce({ fc: 80 })).toBeNull();
    expect(scoreAlertaPrecoce({})).toBeNull();
    expect(scoreAlertaPrecoce(null)).toBeNull();
  });

  it("nível de consciência alterado pesa sozinho", () => {
    const a = scoreAlertaPrecoce({ fr: 16, spo2: 98, temp: 36.5, consciencia: "A" });
    const b = scoreAlertaPrecoce({ fr: 16, spo2: 98, temp: 36.5, consciencia: "P" });
    expect(b.score).toBeGreaterThan(a.score);
  });
});

describe("timeline do episódio", () => {
  it("une as fontes e ordena do mais novo ao mais antigo", () => {
    const t = timelineEpisodio({
      evolucoes: [{ criado_em: "2026-07-22T08:00:00Z", tipo: "medica", texto: "estável" }],
      administracoes: [{ administrado_em: "2026-07-22T10:00:00Z", medicamento_nome: "Dipirona", status: "administrado" }],
      sinais: [{ aferido_em: "2026-07-22T06:00:00Z", pa_sist: 120, fc: 70 }],
    });
    expect(t).toHaveLength(3);
    expect(t[0].modulo).toBe("Medicação");     // 10h, mais recente
    expect(t[2].modulo).toBe("Sinais vitais"); // 6h, mais antigo
  });

  it("distingue administrado de não administrado", () => {
    const t = timelineEpisodio({
      administracoes: [{ administrado_em: "2026-07-22T10:00:00Z", medicamento_nome: "Morfina", status: "nao_administrado", motivo: "recusa" }],
    });
    expect(t[0].titulo).toMatch(/Não administrado/);
  });

  it("não quebra com tudo vazio", () => {
    expect(timelineEpisodio({})).toEqual([]);
  });
});

// ── O OXIGÊNIO NO NEWS ──────────────────────────────────────
//
// 🔴 A COLUNA EXISTIA PARA ISSO, E O ESCORE NUNCA A LEU (13/10/2026).
//
// `migracao-pep-sinais-spo2.sql` criou `o2_suplementar` dizendo no próprio
// cabeçalho por quê: "o NEWS pontua o paciente em oxigênio mesmo com
// saturação normal — respirar 95% em ar ambiente e respirar 95% sob cateter
// são situações clínicas diferentes."
//
// A caixa foi para a tela, a enfermagem marcava, o banco gravava — e
// `scoreAlertaPrecoce` nunca leu. O paciente em O₂ saía DOIS PONTOS ABAIXO,
// e sub-triagem é a direção que mata.
describe("🔴 o NEWS pontua o oxigênio suplementar", () => {
  // Paciente com sinais todos normais: NEWS 0 em ar ambiente.
  const estavel = { fr: 16, spo2: 98, temp: 36.5, pa_sist: 120, fc: 70, consciencia: "A" };

  it("em ar ambiente, o escore não muda", () => {
    expect(scoreAlertaPrecoce(estavel).score).toBe(0);
    expect(scoreAlertaPrecoce({ ...estavel, o2_suplementar: false }).score).toBe(0);
  });

  it("🔴 o MESMO paciente em O₂ vale 2 — é a diferença clínica que a migração descreveu", () => {
    const r = scoreAlertaPrecoce({ ...estavel, o2_suplementar: true });
    expect(r.score).toBe(2);
    expect(r.oxigenio).toBe(true);
    expect(r.nivel).toBe("baixo");   // deixa de ser "normal"
  });

  it("🔴 e isso ATRAVESSA o gatilho da sepse", () => {
    // NEWS 3 em ar ambiente fica abaixo do gatilho (≥5); em O₂, chega a 5.
    const quase = { fr: 22, spo2: 94, temp: 36.5, pa_sist: 120, fc: 70, consciencia: "A" };
    expect(scoreAlertaPrecoce(quase).score).toBe(3);
    expect(scoreAlertaPrecoce({ ...quase, o2_suplementar: true }).score).toBe(5);
    expect(scoreAlertaPrecoce({ ...quase, o2_suplementar: true }).nivel).toBe("medio");
  });

  it("a coluna ANTIGA também conta — linha velha não perde ponto por nome", () => {
    // `pep_sinais_vitais` tem DUAS colunas para a mesma coisa:
    // `o2_suplementar` (pep-sinais-spo2, que a tela grava) e `suporte_o2`
    // (pep-fase1, que ninguém escreveu).
    expect(scoreAlertaPrecoce({ ...estavel, suporte_o2: true }).score).toBe(2);
    // A nova manda quando as duas vêm.
    expect(scoreAlertaPrecoce({ ...estavel, o2_suplementar: false, suporte_o2: true }).score).toBe(0);
  });

  it("🔴 o oxigênio NÃO conta como parâmetro aferido para a trava dos três", () => {
    // "Ar ambiente" vale 0, mas é um zero que o sistema ASSUME (booleano com
    // default false). Se contasse, uma aferição com dois sinais passaria da
    // trava — e a trava existe para o escore não sair de meia medição.
    expect(scoreAlertaPrecoce({ fc: 80, temp: 36.5, o2_suplementar: true })).toBeNull();
    const r = scoreAlertaPrecoce({ fc: 80, temp: 36.5, fr: 16, o2_suplementar: true });
    expect(r.parametros).toBe(3);
    expect(r.score).toBe(2);
  });
});

// ── A FAIXA DE FEBRE ALTA ───────────────────────────────────
describe("🔴 febre alta vale 2, não 3", () => {
  const base = { fr: 16, spo2: 98, pa_sist: 120, fc: 70, consciencia: "A" };

  it("39,5 °C pontua 2 — caía no fallback e valia 3", () => {
    // Sobrepontuar não mata ninguém, mas alarme que exagera é alarme que se
    // aprende a descontar — e aí o que importa some junto.
    expect(scoreAlertaPrecoce({ ...base, temp: 39.5 }).score).toBe(2);
    expect(scoreAlertaPrecoce({ ...base, temp: 41 }).score).toBe(2);
  });

  it("as faixas vizinhas continuam como o NEWS manda", () => {
    expect(scoreAlertaPrecoce({ ...base, temp: 38.5 }).score).toBe(1);
    expect(scoreAlertaPrecoce({ ...base, temp: 36.5 }).score).toBe(0);
    expect(scoreAlertaPrecoce({ ...base, temp: 35.5 }).score).toBe(1);
    // ≤ 35,0 continua no fallback 3, que é o certo.
    expect(scoreAlertaPrecoce({ ...base, temp: 34.0 }).score).toBe(3);
  });
});
