import { describe, it, expect } from "vitest";
import {
  CLASSES, GRAUS_DANO, TIPOS, STATUS, METAS,
  matrizRisco, exigeRCA, notificacaoCompulsoria, temDano,
  resumoIncidentes, indicadoresSeguranca, rotuloTipo, rotuloClasse,
  ISHIKAWA_CATEGORIAS, FATORES_CONTRIBUINTES, METODOS_RCA, STATUS_ACAO,
  acaoAtrasada, resumoAcoes, temRcaConcluida, incidentesAguardandoRca,
} from "./nsp.js";

describe("catálogo NSP", () => {
  it("tem as taxonomias fixas completas", () => {
    expect(CLASSES.map(c => c.v)).toEqual(["circunstancia_risco", "near_miss", "incidente_sem_dano", "evento_adverso", "never_event"]);
    expect(GRAUS_DANO.map(g => g.v)).toContain("obito");
    expect(STATUS.map(s => s.v)).toContain("concluida");
    expect(METAS).toHaveLength(6);
  });
  it("liga tipos à origem da Fase 1 (queda→Morse, lpp→LPP, flebite→flebite)", () => {
    expect(TIPOS.find(t => t.v === "queda").origem).toBe("escala_morse");
    expect(TIPOS.find(t => t.v === "lpp").origem).toBe("lpp");
    expect(rotuloTipo("medicacao")).toBe("Medicação");
    expect(rotuloClasse("never_event")).toBe("Never event");
  });
});

describe("matriz de risco (probabilidade × gravidade)", () => {
  it("classifica as faixas", () => {
    expect(matrizRisco(5, 5)).toEqual({ score: 25, faixa: "extremo" });
    expect(matrizRisco(4, 3)).toEqual({ score: 12, faixa: "alto" });
    expect(matrizRisco(2, 3)).toEqual({ score: 6, faixa: "moderado" });
    expect(matrizRisco(1, 2)).toEqual({ score: 2, faixa: "baixo" });
    expect(matrizRisco(0, 0)).toEqual({ score: 0, faixa: null });
  });
});

describe("regras de tratamento e notificação", () => {
  it("exige RCA em evento adverso, never event e dano moderado+", () => {
    expect(exigeRCA({ classe: "evento_adverso", grau_dano: "leve" })).toBe(true);
    expect(exigeRCA({ classe: "never_event" })).toBe(true);
    expect(exigeRCA({ classe: "incidente_sem_dano", grau_dano: "moderado" })).toBe(true);
    expect(exigeRCA({ classe: "near_miss", grau_dano: "nenhum" })).toBe(false);
  });
  it("notificação compulsória (ANVISA) em never event e óbito", () => {
    expect(notificacaoCompulsoria({ classe: "never_event", grau_dano: "grave" })).toBe(true);
    expect(notificacaoCompulsoria({ classe: "evento_adverso", grau_dano: "obito" })).toBe(true);
    expect(notificacaoCompulsoria({ classe: "evento_adverso", grau_dano: "moderado" })).toBe(false);
  });
  it("temDano separa com/sem dano", () => {
    expect(temDano({ classe: "evento_adverso" })).toBe(true);
    expect(temDano({ grau_dano: "leve" })).toBe(true);
    expect(temDano({ classe: "near_miss", grau_dano: "nenhum" })).toBe(false);
  });
});

describe("resumo do dashboard", () => {
  const incidentes = [
    { classe: "near_miss", tipo: "medicacao", grau_dano: "nenhum", status: "nova" },
    { classe: "circunstancia_risco", tipo: "queda", grau_dano: "nenhum", status: "em_analise" },
    { classe: "evento_adverso", tipo: "queda", grau_dano: "moderado", status: "em_tratamento" },
    { classe: "never_event", tipo: "cirurgico", grau_dano: "grave", status: "concluida" },
    { classe: "incidente_sem_dano", tipo: "medicacao", grau_dano: "nenhum", status: "nova" },
  ];
  it("conta classes, dano, never events e o near-miss ratio", () => {
    const r = resumoIncidentes(incidentes, { pacientesDia: 500 });
    expect(r.total).toBe(5);
    expect(r.comDano).toBe(2);              // evento_adverso + never_event
    expect(r.semDano).toBe(3);
    expect(r.neverEvents).toBe(1);
    expect(r.compulsorias).toBe(1);         // never_event
    expect(r.novas).toBe(2);
    expect(r.abertas).toBe(4);              // só 1 concluída
    expect(r.nearMissRatio).toBe(1.5);      // 3 sem dano ÷ 2 com dano
    expect(r.densidade).toBe(10);           // 5/500*1000
    expect(r.porTipo.queda).toBe(2);
  });
  it("sem pacientesDia não calcula densidade; lista vazia não quebra", () => {
    expect(resumoIncidentes(incidentes).densidade).toBeNull();
    expect(resumoIncidentes([]).nearMissRatio).toBeNull();
    expect(resumoIncidentes(null).total).toBe(0);
  });
});

describe("indicadores automáticos (puxados dos módulos)", () => {
  it("LPP adquirida vem do POA; quedas e erros de medicação dos incidentes", () => {
    const lpp = [{ presente_admissao: false }, { presente_admissao: true }, { presente_admissao: false }];
    const incidentes = [
      { tipo: "queda", classe: "evento_adverso", grau_dano: "leve" },
      { tipo: "medicacao", classe: "evento_adverso", grau_dano: "moderado" },
      { tipo: "medicacao", classe: "near_miss", grau_dano: "nenhum" },
    ];
    const ind = indicadoresSeguranca({ lpp, incidentes });
    expect(ind.lppAdquiridas).toBe(2);
    expect(ind.quedas).toBe(1);
    expect(ind.errosMedicacao).toBe(1);   // só o com dano
  });
});

describe("RCA e plano de ação (Fase 2b)", () => {
  it("catálogos fixos: Ishikawa 6M, fatores de Londres, métodos e status", () => {
    expect(ISHIKAWA_CATEGORIAS).toHaveLength(6);
    expect(ISHIKAWA_CATEGORIAS.map(c => c.v)).toContain("metodo");
    expect(FATORES_CONTRIBUINTES.map(f => f.v)).toContain("organizacao");
    expect(METODOS_RCA.map(m => m.v)).toEqual(["5_porques", "ishikawa", "ambos"]);
    expect(STATUS_ACAO.map(s => s.v)).toContain("concluida");
  });

  it("acaoAtrasada: prazo vencido e ainda aberta", () => {
    const hoje = new Date(2026, 6, 29);
    expect(acaoAtrasada({ prazo: "2026-07-20", status: "pendente" }, hoje)).toBe(true);
    expect(acaoAtrasada({ prazo: "2026-08-10", status: "pendente" }, hoje)).toBe(false);
    expect(acaoAtrasada({ prazo: "2026-07-20", status: "concluida" }, hoje)).toBe(false);
    expect(acaoAtrasada({ status: "pendente" }, hoje)).toBe(false);  // sem prazo
  });

  it("resumoAcoes conta abertas, atrasadas, concluídas e a taxa de fechamento", () => {
    const hoje = new Date(2026, 6, 29);
    const acoes = [
      { prazo: "2026-07-20", status: "pendente" },      // atrasada
      { prazo: "2026-08-10", status: "em_andamento" },  // aberta, no prazo
      { prazo: "2026-07-01", status: "concluida" },     // concluída
      { prazo: "2026-07-01", status: "cancelada" },     // cancelada
    ];
    const r = resumoAcoes(acoes, hoje);
    expect(r.total).toBe(4);
    expect(r.abertas).toBe(2);
    expect(r.atrasadas).toBe(1);
    expect(r.concluidas).toBe(1);
    expect(r.taxaFechamento).toBe(25);
  });

  it("fila de análise: incidentes que exigem RCA e não têm análise concluída", () => {
    const incidentes = [
      { id: "i1", classe: "evento_adverso", grau_dano: "moderado", status: "em_analise" },
      { id: "i2", classe: "near_miss", grau_dano: "nenhum", status: "nova" },
      { id: "i3", classe: "never_event", grau_dano: "grave", status: "em_tratamento" },
      { id: "i4", classe: "evento_adverso", grau_dano: "leve", status: "concluida" },
    ];
    const rcas = [{ id: "r3", incidente_id: "i3", status: "concluida" }];
    expect(incidentesAguardandoRca(incidentes, rcas).map(i => i.id)).toEqual(["i1"]);
    expect(temRcaConcluida("i3", rcas)).toBe(true);
    expect(temRcaConcluida("i1", rcas)).toBe(false);
  });

  it("RCA superada pela linhagem (corrige_id) não conta como concluída", () => {
    const rcas = [
      { id: "r1", incidente_id: "iX", status: "concluida" },
      { id: "r2", incidente_id: "iX", status: "em_andamento", corrige_id: "r1" },
    ];
    expect(temRcaConcluida("iX", rcas)).toBe(false);
  });
});
