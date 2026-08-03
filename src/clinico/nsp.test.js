import { describe, it, expect } from "vitest";
import {
  CLASSES, GRAUS_DANO, TIPOS, STATUS, METAS,
  matrizRisco, exigeRCA, notificacaoCompulsoria, temDano,
  resumoIncidentes, indicadoresSeguranca, farol, metasSeguranca, rotuloTipo, rotuloClasse,
  filtrarPorMes, incidentesCompulsorios, fichaNotivisa, relatorioNsp,
  STATUS_PROTOCOLO, PROTOCOLOS_BASICOS, protocoloRevisaoVencida, resumoProtocolos,
  STATUS_CAPACITACAO, capacitacaoVencida, resumoCapacitacoes,
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
  it("abre taxas por 1000 pacientes-dia e separa quedas com dano", () => {
    const incidentes = [
      { tipo: "queda", classe: "evento_adverso", grau_dano: "grave" },   // queda com dano
      { tipo: "queda", classe: "near_miss", grau_dano: "nenhum" },       // queda sem dano
      { tipo: "medicacao", classe: "evento_adverso", grau_dano: "leve" },
    ];
    const ind = indicadoresSeguranca({ lpp: [{ presente_admissao: false }], incidentes, pacientesDia: 1000 });
    expect(ind.quedas).toBe(2);
    expect(ind.quedasComDano).toBe(1);
    expect(ind.densidadeIncidentes).toBe(3);   // 3/1000*1000
    expect(ind.quedasPorMil).toBe(2);
    expect(ind.lppPorMil).toBe(1);
    expect(indicadoresSeguranca({ incidentes }).densidadeIncidentes).toBeNull();  // sem pacientesDia
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

describe("farol dos indicadores (Fase 2c)", () => {
  it("menor_melhor: verde ≤ corte_verde, amarelo ≤ corte_amarelo, senão vermelho", () => {
    const f = { corte_verde: 1, corte_amarelo: 4, sentido: "menor_melhor" };
    expect(farol(0, f)).toBe("verde");
    expect(farol(1, f)).toBe("verde");
    expect(farol(3, f)).toBe("amarelo");
    expect(farol(4, f)).toBe("amarelo");
    expect(farol(5, f)).toBe("vermelho");
  });
  it("maior_melhor: verde ≥ corte_verde, amarelo ≥ corte_amarelo, senão vermelho", () => {
    const f = { corte_verde: 90, corte_amarelo: 75, sentido: "maior_melhor" };
    expect(farol(95, f)).toBe("verde");
    expect(farol(90, f)).toBe("verde");
    expect(farol(80, f)).toBe("amarelo");
    expect(farol(75, f)).toBe("amarelo");
    expect(farol(50, f)).toBe("vermelho");
  });
  it("sem valor ou sem cortes → cinza", () => {
    expect(farol(null, { corte_verde: 1, corte_amarelo: 4 })).toBe("cinza");
    expect(farol(3, {})).toBe("cinza");
    expect(farol("", { corte_verde: 1, corte_amarelo: 4 })).toBe("cinza");
  });
});

describe("metasSeguranca — 6 Metas com farol (Fase 2c)", () => {
  const faixas = [
    { chave: "identificacao",   sentido: "menor_melhor", fonte: "auto",      corte_verde: 0,  corte_amarelo: 2,  unidade: "casos", validado: true },
    { chave: "medicamentos",    sentido: "menor_melhor", fonte: "auto",      corte_verde: 0,  corte_amarelo: 2,  unidade: "casos", validado: false },
    { chave: "quedas_lpp",      sentido: "menor_melhor", fonte: "auto",      corte_verde: 1,  corte_amarelo: 4,  unidade: "casos", validado: true },
    { chave: "higiene_maos",    sentido: "maior_melhor", fonte: "auditoria", corte_verde: 80, corte_amarelo: 60, unidade: "%",     validado: true },
    { chave: "comunicacao",     sentido: "maior_melhor", fonte: "auditoria", corte_verde: 90, corte_amarelo: 75, unidade: "%",     validado: false },
    { chave: "cirurgia_segura", sentido: "maior_melhor", fonte: "auditoria", corte_verde: 95, corte_amarelo: 85, unidade: "%",     validado: false },
  ];
  const lpp = [{ presente_admissao: false }, { presente_admissao: false }];  // 2 LPP adquiridas
  const incidentes = [
    { tipo: "queda", classe: "evento_adverso", grau_dano: "leve" },
    { tipo: "medicacao", classe: "evento_adverso", grau_dano: "moderado" },  // erro com dano
    { tipo: "identificacao", classe: "near_miss", grau_dano: "nenhum" },     // sem dano
  ];
  const medicoes = [
    { id: "m1", meta: "higiene_maos", competencia: "2026-06-01", numerador: 70, denominador: 100 },
    { id: "m2", meta: "higiene_maos", competencia: "2026-07-01", numerador: 85, denominador: 100 },  // mais recente
  ];

  it("retorna as 6 metas na ordem de METAS", () => {
    const linhas = metasSeguranca({ incidentes, lpp, medicoes, faixas });
    expect(linhas.map(l => l.meta)).toEqual(METAS.map(m => m.v));
  });
  it("automáticas somam dos módulos; auditoria usa a última competência", () => {
    const linhas = metasSeguranca({ incidentes, lpp, medicoes, faixas });
    const by = m => linhas.find(l => l.meta === m);
    expect(by("quedas_lpp").valor).toBe(3);          // 1 queda + 2 LPP adquirida
    expect(by("quedas_lpp").farol).toBe("amarelo");  // 3 ≤ 4
    expect(by("medicamentos").valor).toBe(1);
    expect(by("medicamentos").farol).toBe("amarelo");
    expect(by("identificacao").valor).toBe(0);       // near_miss sem dano não conta
    expect(by("identificacao").farol).toBe("verde");
    expect(by("higiene_maos").valor).toBe(85);       // competência 2026-07
    expect(by("higiene_maos").fonte).toBe("auditoria");
    expect(by("higiene_maos").farol).toBe("verde");  // 85 ≥ 80
    expect(by("comunicacao").valor).toBeNull();      // sem medição
    expect(by("comunicacao").farol).toBe("cinza");
  });
  it("correção (corrige_id) descarta a medição anterior", () => {
    const meds = [
      { id: "a", meta: "higiene_maos", competencia: "2026-07-01", numerador: 40, denominador: 100 },
      { id: "b", meta: "higiene_maos", competencia: "2026-07-01", numerador: 90, denominador: 100, corrige_id: "a" },
    ];
    const linhas = metasSeguranca({ incidentes: [], lpp: [], medicoes: meds, faixas });
    expect(linhas.find(l => l.meta === "higiene_maos").valor).toBe(90);
  });
});

describe("relatórios / NOTIVISA (Fase 2d)", () => {
  const incidentes = [
    { classe: "evento_adverso", tipo: "queda", grau_dano: "moderado", ocorrido_em: "2026-07-10T08:00:00Z", local_setor: "UTI", descricao: "Queda da maca", acoes_imediatas: "Imobilização" },
    { classe: "never_event", tipo: "cirurgico", grau_dano: "grave", detectado_em: "2026-07-20T10:00:00Z", local_setor: "C.O." },
    { classe: "evento_adverso", tipo: "medicacao", grau_dano: "obito", criado_em: "2026-07-25T12:00:00Z" },
    { classe: "near_miss", tipo: "medicacao", grau_dano: "nenhum", ocorrido_em: "2026-06-15T09:00:00Z" },  // outro mês
  ];

  it("filtrarPorMes usa ocorrido/detectado/criado e respeita o mês (0–11)", () => {
    expect(filtrarPorMes(incidentes, 2026, 6)).toHaveLength(3);   // julho
    expect(filtrarPorMes(incidentes, 2026, 5)).toHaveLength(1);   // junho
    expect(filtrarPorMes(incidentes, 2025, 6)).toHaveLength(0);   // outro ano
  });

  it("incidentesCompulsorios pega never event e óbito", () => {
    const c = incidentesCompulsorios(incidentes);
    expect(c).toHaveLength(2);
    expect(c.every(notificacaoCompulsoria)).toBe(true);
  });

  it("fichaNotivisa mapeia os campos do incidente", () => {
    const f = fichaNotivisa(incidentes[1]);
    expect(f.tipo_notificacao).toContain("Never event");
    expect(f.tipo_incidente).toBe("Cirúrgico / procedimento");
    expect(f.local).toBe("C.O.");
    expect(fichaNotivisa(incidentes[2]).tipo_notificacao).toBe("Óbito");
    expect(fichaNotivisa(null)).toBeNull();
  });

  it("relatorioNsp agrega o mês + snapshot do plano e das metas", () => {
    const acoes = [{ status: "concluida" }, { status: "pendente", prazo: "2020-01-01" }];
    const rel = relatorioNsp({ incidentes, acoes, lppAdquiridas: 2, medicoes: [], faixas: [], ano: 2026, mes: 6 });
    expect(rel.incidentesMes).toHaveLength(3);
    expect(rel.resumo.total).toBe(3);
    expect(rel.compulsorios).toHaveLength(2);
    expect(rel.indicadores.quedas).toBe(1);
    expect(rel.plano.total).toBe(2);
    expect(rel.metas).toHaveLength(6);
  });
});

describe("protocolos de segurança (Fase 2d)", () => {
  it("catálogo: 3 status e os 6 protocolos básicos ligados às metas", () => {
    expect(STATUS_PROTOCOLO.map(s => s.v)).toEqual(["vigente", "em_revisao", "suspenso"]);
    expect(PROTOCOLOS_BASICOS).toHaveLength(6);
    expect(PROTOCOLOS_BASICOS.every(b => b.meta)).toBe(true);
  });
  it("protocoloRevisaoVencida: revisão no passado e não suspenso", () => {
    const hoje = new Date(2026, 6, 29);
    expect(protocoloRevisaoVencida({ revisao_em: "2026-07-01", status: "vigente" }, hoje)).toBe(true);
    expect(protocoloRevisaoVencida({ revisao_em: "2026-08-15", status: "vigente" }, hoje)).toBe(false);
    expect(protocoloRevisaoVencida({ revisao_em: "2026-07-01", status: "suspenso" }, hoje)).toBe(false);
    expect(protocoloRevisaoVencida({ status: "vigente" }, hoje)).toBe(false);  // sem data
  });
  it("resumoProtocolos: totais, revisão vencida e cobertura dos 6 básicos", () => {
    const hoje = new Date(2026, 6, 29);
    const protos = [
      { chave: "ident", status: "vigente", revisao_em: "2027-01-01" },
      { chave: "higiene", status: "em_revisao", revisao_em: "2026-07-01" },  // vencida
      { chave: null, status: "vigente", titulo: "Protocolo extra" },
    ];
    const r = resumoProtocolos(protos, hoje);
    expect(r.total).toBe(3);
    expect(r.vigentes).toBe(2);
    expect(r.emRevisao).toBe(1);
    expect(r.revisaoVencida).toBe(1);
    expect(r.basicosFaltando).toContain("Cirurgia segura");
    expect(r.basicosFaltando).not.toContain("Identificação do paciente");
  });
});

describe("capacitações (Fase 2d)", () => {
  it("catálogo: 3 status", () => {
    expect(STATUS_CAPACITACAO.map(s => s.v)).toEqual(["planejado", "realizado", "cancelado"]);
  });
  it("capacitacaoVencida: próxima prevista no passado e não cancelada", () => {
    const hoje = new Date(2026, 6, 29);
    expect(capacitacaoVencida({ proxima_em: "2026-07-01", status: "realizado" }, hoje)).toBe(true);
    expect(capacitacaoVencida({ proxima_em: "2026-12-01", status: "realizado" }, hoje)).toBe(false);
    expect(capacitacaoVencida({ proxima_em: "2026-07-01", status: "cancelado" }, hoje)).toBe(false);
    expect(capacitacaoVencida({ status: "realizado" }, hoje)).toBe(false);
  });
  it("resumoCapacitacoes: horas, participantes, vencidas e metas sem capacitação", () => {
    const hoje = new Date(2026, 6, 29);
    const caps = [
      { meta: "higiene_maos", status: "realizado", carga_horaria: 2, participantes: 20, proxima_em: "2027-01-01" },
      { meta: "quedas_lpp", status: "realizado", carga_horaria: 1.5, participantes: 15, proxima_em: "2026-07-01" },  // vencida
      { meta: "identificacao", status: "planejado", carga_horaria: 2, participantes: 0 },
    ];
    const r = resumoCapacitacoes(caps, hoje);
    expect(r.total).toBe(3);
    expect(r.realizadas).toBe(2);
    expect(r.planejadas).toBe(1);
    expect(r.horas).toBe(3.5);
    expect(r.participantes).toBe(35);
    expect(r.vencidas).toBe(1);
    expect(r.metasSemCapacitacao).toContain("Comunicação efetiva");
    expect(r.metasSemCapacitacao).not.toContain("Higiene das mãos");
  });
});
