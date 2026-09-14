// ═══════════════════════════════════════════════════════════
// TORRE DE COMANDO — testes do motor
//
// O que está travado aqui é sobretudo o que NÃO pode acontecer num painel de
// diretoria: leitura que falhou virando zero, leito interditado inflando a
// folga, permanência nula puxando a média para baixo, cancelamento sem nome,
// e "tudo bem" dito com meia tela lida.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  NIVEL, LIMIARES, medida, semLeitura, nivelPorLimiar, diaDe, minutosEntre,
  censoGeral, censoDeSetores, setoresDeUti, mapaDeSetores,
  altasDoDia, permanenciaMedia, giroDeLeito,
  esperaNoPa, aceitesGerint, ORIGEM_GERINT,
  fluxoCirurgico, CIRURGIA,
  ambulatorioDoDia, AGENDAMENTO, vagasDaGrade,
  itensEmFalta, faltasConsolidadas,
  resumoDaTorre,
} from "./torre.js";

const HOJE = "2026-09-14";
const AGORA = new Date("2026-09-14T12:00:00");

describe("as ferramentas de base", () => {
  it("semLeitura nunca devolve número", () => {
    const m = semLeitura("x", "Alguma coisa", "os leitos");
    expect(m.valor).toBeNull();
    expect(m.lido).toBe(false);
    expect(m.detalhe).toMatch(/Não consegui ler/);
  });

  it("nivelPorLimiar respeita as bordas e não opina sobre nulo", () => {
    const lim = { atencao: 85, critico: 95 };
    expect(nivelPorLimiar(84, lim)).toBe(NIVEL.BOM);
    expect(nivelPorLimiar(85, lim)).toBe(NIVEL.ATENCAO);
    expect(nivelPorLimiar(95, lim)).toBe(NIVEL.CRITICO);
    expect(nivelPorLimiar(null, lim)).toBe(NIVEL.NEUTRO);
  });

  it("diaDe usa o fuso local (uma alta da noite não cai no dia seguinte)", () => {
    expect(diaDe(new Date(2026, 8, 14, 23, 30))).toBe("2026-09-14");
    expect(diaDe("nunca")).toBeNull();
    expect(diaDe(null)).toBeNull();
  });

  it("🔴 data pura NÃO volta um dia (coluna `date` lida como UTC era o bug)", () => {
    // new Date("2026-09-14") é meia-noite UTC = dia 13 à noite no Brasil.
    // Se isto quebrar, toda alta e toda cirurgia do dia somem do painel.
    expect(diaDe("2026-09-14")).toBe("2026-09-14");
    expect(diaDe("2026-01-01")).toBe("2026-01-01");
    expect(diaDe("2026-09-14T08:00:00")).toBe("2026-09-14");
  });

  it("minutosEntre não inventa duração sem as duas pontas", () => {
    expect(minutosEntre("2026-09-14T10:00:00", "2026-09-14T11:30:00")).toBe(90);
    expect(minutosEntre(null, AGORA)).toBeNull();
    expect(minutosEntre("2026-09-14T10:00:00", null)).toBeNull();
  });
});

// ── ocupação ─────────────────────────────────────────────────

const LEITOS = [
  { identificacao: "101", setor: "Clínica Médica", status: "ocupado" },
  { identificacao: "102", setor: "Clínica Médica", status: "ocupado" },
  { identificacao: "103", setor: "Clínica Médica", status: "livre" },
  { identificacao: "104", setor: "Clínica Médica", status: "interditado" },
  { identificacao: "201", setor: "UTI Adulto", status: "ocupado" },
  { identificacao: "202", setor: "UTI Adulto", status: "ocupado" },
  { identificacao: "203", setor: "UTI Adulto", status: "higienizacao" },
];

describe("censoGeral", () => {
  it("🔴 leitura que falhou NÃO é ocupação zero", () => {
    const c = censoGeral([], { lido: false });
    expect(c.lido).toBe(false);
    expect(c.valor).toBeNull();
    expect(c.ocupados).toBeNull();
  });

  it("o denominador exclui o leito interditado", () => {
    const c = censoGeral(LEITOS);
    expect(c.totalLeitos).toBe(7);
    expect(c.interditados).toBe(1);
    expect(c.operacionais).toBe(6);
    expect(c.ocupados).toBe(4);
    expect(c.valor).toBe(67);          // 4/6
  });

  it("higienização não conta como livre", () => {
    const c = censoGeral(LEITOS);
    expect(c.higienizacao).toBe(1);
    expect(c.livres).toBe(1);           // 6 operacionais − 4 ocupados − 1 higienização
  });

  it("hospital sem leito cadastrado não devolve 0% — devolve null", () => {
    expect(censoGeral([]).valor).toBeNull();
  });

  it("pinta crítico quando cruza o limiar", () => {
    const cheio = Array.from({ length: 10 }, (_, i) => ({ status: i < 10 ? "ocupado" : "livre" }));
    expect(censoGeral(cheio).nivel).toBe(NIVEL.CRITICO);
  });
});

describe("UTI", () => {
  it("acha os setores de terapia intensiva pelo cadastro", () => {
    const nomes = setoresDeUti([{ nome: "UTI Adulto" }, { nome: "Clínica Médica" }, { nome: "UTI Neonatal" }, { nome: "Terapia Intensiva Coronariana" }]);
    expect(nomes).toEqual(["UTI Adulto", "UTI Neonatal", "Terapia Intensiva Coronariana"]);
  });

  it("não confunde setor que só contém as letras", () => {
    expect(setoresDeUti([{ nome: "Ambulatório" }, { nome: "Nutrição" }])).toEqual([]);
  });

  it("censo restrito à UTI usa o limiar da UTI", () => {
    const c = censoDeSetores(LEITOS, ["UTI Adulto"]);
    expect(c.operacionais).toBe(3);
    expect(c.ocupados).toBe(2);
    expect(c.valor).toBe(67);
    expect(c.nivel).toBe(NIVEL.BOM);     // 67 < 80
  });

  it("sem UTI cadastrada, diz que não há setor — não diz 0%", () => {
    const c = censoDeSetores(LEITOS, []);
    expect(c.semSetor).toBe(true);
    expect(c.valor).toBeNull();
  });

  it("leitura que falhou continua não sendo zero", () => {
    expect(censoDeSetores(LEITOS, ["UTI Adulto"], { lido: false }).lido).toBe(false);
  });
});

describe("mapaDeSetores", () => {
  const SETORES = [
    { nome: "Clínica Médica", ordem: 1, alerta_amarelo: 85, alerta_vermelho: 95 },
    { nome: "UTI Adulto", ordem: 2, alerta_amarelo: 70, alerta_vermelho: 80 },
  ];

  it("o setor mais apertado vem primeiro", () => {
    const lotada = [...LEITOS, { identificacao: "204", setor: "UTI Adulto", status: "ocupado" }];
    const m = mapaDeSetores(lotada, SETORES);
    expect(m.linhas[0].nome).toBe("UTI Adulto");   // 3/4 = 75% contra 67%
    expect(m.linhas[0].pct).toBe(75);
    expect(m.linhas).toHaveLength(2);
  });

  it("empatados, desempata pela ordem do cadastro", () => {
    const m = mapaDeSetores(LEITOS, SETORES);      // os dois em 67%
    expect(m.linhas.map(l => l.nome)).toEqual(["Clínica Médica", "UTI Adulto"]);
  });

  it("🔴 o limiar é o do CADASTRO do setor, não uma constante global", () => {
    const m = mapaDeSetores(
      [{ setor: "UTI Adulto", status: "ocupado" }, { setor: "UTI Adulto", status: "ocupado" }, { setor: "UTI Adulto", status: "livre" }],
      SETORES);
    const uti = m.linhas.find(l => l.nome === "UTI Adulto");
    expect(uti.pct).toBe(67);
    expect(uti.nivel).toBe(NIVEL.BOM);   // 67 < 70 (amarelo da UTI)
    // a mesma ocupação numa enfermaria de limiar 85 também é boa,
    // mas numa UTI de limiar 60 seria atenção:
    const apertada = mapaDeSetores(
      [{ setor: "UTI Adulto", status: "ocupado" }, { setor: "UTI Adulto", status: "ocupado" }, { setor: "UTI Adulto", status: "livre" }],
      [{ nome: "UTI Adulto", alerta_amarelo: 60, alerta_vermelho: 90 }]);
    expect(apertada.linhas[0].nivel).toBe(NIVEL.ATENCAO);
  });

  it("setor sem leito não vira 0% (vira sem informação)", () => {
    const m = mapaDeSetores([], [{ nome: "Pediatria" }]);
    expect(m.linhas[0].pct).toBeNull();
    expect(m.linhas[0].nivel).toBe(NIVEL.NEUTRO);
  });

  it("conta os leitos sem setor, que somem de qualquer mapa", () => {
    const m = mapaDeSetores([...LEITOS, { identificacao: "X", status: "ocupado" }], SETORES);
    expect(m.semSetor).toBe(1);
  });

  it("leitura que falhou não devolve mapa vazio silencioso", () => {
    expect(mapaDeSetores(LEITOS, SETORES, { lido: false })).toMatchObject({ lido: false, linhas: [] });
  });
});

// ── movimento ────────────────────────────────────────────────

const SAIDAS = [
  { data_alta: "2026-09-14", dias_permanencia: 3 },
  { data_alta: "2026-09-14", dias_permanencia: 11 },
  { data_alta: "2026-09-13", dias_permanencia: 4 },
  { data_alta: "2026-09-01", dias_permanencia: null },
];

describe("altasDoDia", () => {
  it("conta só as altas de hoje", () => {
    expect(altasDoDia(SAIDAS, HOJE).valor).toBe(2);
  });
  it("🔴 leitura que falhou não é 'nenhuma alta'", () => {
    const a = altasDoDia(SAIDAS, HOJE, { lido: false });
    expect(a.valor).toBeNull();
    expect(a.lido).toBe(false);
  });
});

describe("permanenciaMedia", () => {
  it("🔴 alta sem permanência registrada NÃO entra como zero", () => {
    const p = permanenciaMedia(SAIDAS);
    expect(p.contadas).toBe(3);            // a de 01/09 tem null e fica fora
    expect(p.totalAltas).toBe(4);
    expect(p.valor).toBe(6);               // (3+11+4)/3 = 6.0 — não 4.5
  });

  it("recorta por período", () => {
    const p = permanenciaMedia(SAIDAS, { desde: "2026-09-14" });
    expect(p.contadas).toBe(2);
    expect(p.valor).toBe(7);
  });

  it("sem nenhuma alta com dado, não inventa média", () => {
    const p = permanenciaMedia([{ data_alta: "2026-09-14", dias_permanencia: null }]);
    expect(p.valor).toBeNull();
    expect(p.semDado).toBe(true);
  });

  it("média longa acende atenção", () => {
    expect(permanenciaMedia([{ data_alta: HOJE, dias_permanencia: 12 }]).nivel).toBe(NIVEL.CRITICO);
  });
});

describe("giroDeLeito", () => {
  it("altas ÷ leitos operacionais", () => {
    expect(giroDeLeito(SAIDAS, 8, { desde: "2026-09-01" }).valor).toBe(0.5);
  });
  it("🔴 sem leito operacional o giro é indefinido, não zero", () => {
    const g = giroDeLeito(SAIDAS, 0);
    expect(g.valor).toBeNull();
    expect(g.semLeitos).toBe(true);
  });
});

// ── porta de entrada ─────────────────────────────────────────

const PS = [
  { id: 1, chegada_em: "2026-09-14T11:30:00", triagem_em: null, status: "aguardando" },
  { id: 2, chegada_em: "2026-09-14T09:00:00", triagem_em: null, status: "aguardando" },
  { id: 3, chegada_em: "2026-09-14T10:00:00", triagem_em: "2026-09-14T10:10:00", atendimento_em: null, status: "triado" },
  { id: 4, chegada_em: "2026-09-14T08:00:00", triagem_em: "2026-09-14T08:05:00", atendimento_em: "2026-09-14T08:40:00", status: "finalizado" },
];

describe("esperaNoPa", () => {
  it("separa quem não foi triado de quem aguarda atendimento", () => {
    const e = esperaNoPa(PS, AGORA);
    expect(e.aguardandoTriagem).toBe(2);
    expect(e.aguardandoAtendimento).toBe(1);
    expect(e.naFila).toBe(3);            // o finalizado sai da conta
  });

  it("a maior espera é a de quem chegou primeiro sem triagem", () => {
    const e = esperaNoPa(PS, AGORA);
    expect(e.maiorEsperaMin).toBe(180);   // 09:00 → 12:00
    expect(e.nivel).toBe(NIVEL.CRITICO);  // > 120 min
  });

  it("PS vazio é fila vazia de verdade — e leitura falha não é", () => {
    expect(esperaNoPa([], AGORA).valor).toBe(0);
    expect(esperaNoPa(PS, AGORA, { lido: false }).valor).toBeNull();
  });

  it("atendimento cancelado não fica na fila", () => {
    const e = esperaNoPa([{ chegada_em: "2026-09-14T09:00:00", cancelado_em: "2026-09-14T09:30:00" }], AGORA);
    expect(e.naFila).toBe(0);
  });
});

describe("aceitesGerint", () => {
  const LISTA = [
    { origem: ORIGEM_GERINT, origem_detalhe: "PA Torres", chegada_em: "2026-09-14T08:00:00" },
    { origem: ORIGEM_GERINT, origem_detalhe: "PA Torres", chegada_em: "2026-09-13T08:00:00" },
    { origem: ORIGEM_GERINT, origem_detalhe: null, chegada_em: "2026-09-14T09:00:00" },
    { origem: "SAMU", origem_detalhe: null, chegada_em: "2026-09-14T10:00:00" },
  ];

  it("conta o aceite de hoje e o do período", () => {
    const g = aceitesGerint(LISTA, { hoje: HOJE, desde: "2026-09-01" });
    expect(g.valor).toBe(2);
    expect(g.noPeriodo).toBe(3);
  });

  it("quebra por unidade que mandou, da maior para a menor", () => {
    const g = aceitesGerint(LISTA, { hoje: HOJE, desde: "2026-09-01" });
    expect(g.porUnidade[0]).toEqual({ unidade: "PA Torres", quantos: 2 });
    expect(g.porUnidade[1].unidade).toBe("Sem unidade informada");
  });

  it("SAMU não é GERINT", () => {
    expect(aceitesGerint([{ origem: "SAMU", chegada_em: "2026-09-14T10:00:00" }], { hoje: HOJE }).valor).toBe(0);
  });

  it("leitura que falhou não vira 'nenhum aceite'", () => {
    expect(aceitesGerint(LISTA, { hoje: HOJE, lido: false }).valor).toBeNull();
  });
});

// ── bloco cirúrgico ──────────────────────────────────────────

const CIRURGIAS = [
  { id: 1, data: "2026-09-14", status: CIRURGIA.CONCLUIDA, iniciais: "A.B." },
  { id: 2, data: "2026-09-14", status: CIRURGIA.EM_CIRURGIA, iniciais: "C.D." },
  { id: 3, data: "2026-09-14", status: CIRURGIA.CHECKIN, iniciais: "E.F." },
  { id: 4, data: "2026-09-14", status: CIRURGIA.AGENDADA, iniciais: "G.H." },
  { id: 5, data: "2026-09-14", status: CIRURGIA.CANCELADA, iniciais: "I.J.", prontuario: "1001", cancelamento_motivo: "Sem vaga de UTI" },
  { id: 6, data: "2026-09-14", status: CIRURGIA.CANCELADA, iniciais: "K.L.", prontuario: "1002", cancelamento_motivo: null },
  { id: 7, data: "2026-09-13", status: CIRURGIA.CONCLUIDA, iniciais: "M.N." },
];

describe("fluxoCirurgico", () => {
  it("separa realizadas, em andamento, agendadas e canceladas", () => {
    const f = fluxoCirurgico(CIRURGIAS, HOJE);
    expect(f.previstas).toBe(6);
    expect(f.realizadas).toBe(1);
    expect(f.emAndamento).toBe(2);        // check-in + em cirurgia
    expect(f.agendadas).toBe(1);
    expect(f.canceladas).toBe(2);
  });

  it("🔴 cada cancelamento sai NOMEADO — número agregado não permite agir", () => {
    const f = fluxoCirurgico(CIRURGIAS, HOJE);
    expect(f.cancelamentos).toHaveLength(2);
    expect(f.cancelamentos[0]).toMatchObject({ iniciais: "I.J.", prontuario: "1001", motivo: "Sem vaga de UTI" });
  });

  it("cancelamento sem motivo é marcado, não escondido", () => {
    const sem = fluxoCirurgico(CIRURGIAS, HOJE).cancelamentos.find(c => c.prontuario === "1002");
    expect(sem.semMotivo).toBe(true);
    expect(sem.motivo).toBe("Motivo não registrado");
  });

  it("cirurgia de ontem não entra no dia de hoje", () => {
    expect(fluxoCirurgico(CIRURGIAS, HOJE).previstas).toBe(6);
    expect(fluxoCirurgico(CIRURGIAS, "2026-09-13").previstas).toBe(1);
  });

  it("taxa de cancelamento sobre o mapa do dia", () => {
    expect(fluxoCirurgico(CIRURGIAS, HOJE).taxaCancelamento).toBe(33.3);
  });

  it("dia sem cirurgia nenhuma não tem taxa (não é 0%)", () => {
    expect(fluxoCirurgico([], HOJE).taxaCancelamento).toBeNull();
  });

  it("leitura que falhou não é 'nenhuma cirurgia hoje'", () => {
    expect(fluxoCirurgico(CIRURGIAS, HOJE, { lido: false }).valor).toBeNull();
  });
});

// ── ambulatório ──────────────────────────────────────────────

// 14/09/2026 é uma segunda-feira → dia_semana 1
const GRADES = [
  { id: 1, dia_semana: 1, especialidade_cod: "OFT", profissional_username: "dr.ana", vagas_chegada: 10, vagas_internas: 2, vagas_regulacao: 3, ativo: true },
  { id: 2, dia_semana: 1, especialidade_cod: "CAR", profissional_username: "dr.bruno", vagas_chegada: 8, ativo: true },
  { id: 3, dia_semana: 2, especialidade_cod: "ORT", profissional_username: "dr.caio", vagas_chegada: 5, ativo: true },
  { id: 4, dia_semana: 1, especialidade_cod: "DER", profissional_username: "dr.duda", vagas_chegada: 6, ativo: true, vigencia_fim: "2026-06-30" },
];
const AGENDAMENTOS = [
  { data: "2026-09-14", especialidade_cod: "OFT", profissional_username: "dr.ana", status: AGENDAMENTO.PRESENTE },
  { data: "2026-09-14", especialidade_cod: "OFT", profissional_username: "dr.ana", status: AGENDAMENTO.PRESENTE },
  { data: "2026-09-14", especialidade_cod: "OFT", profissional_username: "dr.ana", status: AGENDAMENTO.FALTA },
  { data: "2026-09-14", especialidade_cod: "CAR", profissional_username: "dr.bruno", status: AGENDAMENTO.AGENDADO },
  { data: "2026-09-14", especialidade_cod: "CAR", profissional_username: "dr.bruno", status: AGENDAMENTO.CANCELADO },
  { data: "2026-09-13", especialidade_cod: "OFT", profissional_username: "dr.ana", status: AGENDAMENTO.PRESENTE },
];

describe("ambulatorioDoDia", () => {
  it("soma as três origens de vaga da grade", () => {
    expect(vagasDaGrade(GRADES[0])).toBe(15);
    expect(vagasDaGrade(GRADES[1])).toBe(8);
    expect(vagasDaGrade({})).toBe(0);
  });

  it("🔴 grade encerrada não oferta vaga (senão a taxa afunda para sempre)", () => {
    const a = ambulatorioDoDia(GRADES, AGENDAMENTOS, HOJE);
    expect(a.ofertadas).toBe(23);            // 15 + 8; a DER venceu em junho
    expect(a.porEspecialidade.some(e => e.especialidade === "DER")).toBe(false);
  });

  it("grade de outro dia da semana não conta", () => {
    const a = ambulatorioDoDia(GRADES, AGENDAMENTOS, HOJE);
    expect(a.porEspecialidade.some(e => e.especialidade === "ORT")).toBe(false);
  });

  it("realizado é quem compareceu; falta e cancelamento são contados à parte", () => {
    const a = ambulatorioDoDia(GRADES, AGENDAMENTOS, HOJE);
    expect(a.realizadas).toBe(2);
    expect(a.faltas).toBe(1);
    expect(a.cancelados).toBe(1);
    expect(a.aguardando).toBe(1);
  });

  it("ocupação da agenda desconta o cancelado da oferta usada", () => {
    const a = ambulatorioDoDia(GRADES, AGENDAMENTOS, HOJE);
    expect(a.agendadas).toBe(4);             // 5 do dia − 1 cancelado
    expect(a.ocupacaoDaAgenda).toBe(17.4);   // 4/23
  });

  it("diz quem está atendendo hoje, com a especialidade e o realizado", () => {
    const a = ambulatorioDoDia(GRADES, AGENDAMENTOS, HOJE);
    const ana = a.profissionais.find(p => p.profissional === "dr.ana");
    expect(ana).toMatchObject({ vagas: 15, realizadas: 2 });
    expect(ana.especialidades).toEqual(["OFT"]);
  });

  it("dia sem grade vigente diz isso, não diz 0%", () => {
    const a = ambulatorioDoDia([], [], HOJE);
    expect(a.ofertadas).toBe(0);
    expect(a.ocupacaoDaAgenda).toBeNull();
    expect(a.detalhe).toMatch(/nenhuma grade vigente/);
  });

  it("leitura que falhou não é 'nenhuma consulta'", () => {
    expect(ambulatorioDoDia(GRADES, AGENDAMENTOS, HOJE, { lido: false }).valor).toBeNull();
  });
});

// ── abastecimento ────────────────────────────────────────────

const ITENS = [
  { id: 1, nome: "Luva P", estoque_minimo: 100, unidade: "cx", ativo: true },
  { id: 2, nome: "Gaze", estoque_minimo: 50, unidade: "pct", ativo: true },
  { id: 3, nome: "Soro 500ml", estoque_minimo: 30, unidade: "un", ativo: true },
  { id: 4, nome: "Item sem mínimo", estoque_minimo: null, ativo: true },
  { id: 5, nome: "Item desativado", estoque_minimo: 10, ativo: false },
];
const LOTES = [
  { item_id: 1, quantidade: 40 },
  { item_id: 1, quantidade: 20 },
  { item_id: 2, quantidade: 500 },
  // o item 3 não tem lote nenhum — acabou
];

describe("itensEmFalta", () => {
  it("soma os lotes para achar o saldo do item", () => {
    const f = itensEmFalta(ITENS, LOTES);
    const luva = f.itens.find(i => i.nome === "Luva P");
    expect(luva.atual).toBe(60);
    expect(luva.faltam).toBe(40);
  });

  it("🔴 item SEM LOTE NENHUM é o que acabou — tem que aparecer", () => {
    const f = itensEmFalta(ITENS, LOTES);
    const soro = f.itens.find(i => i.nome === "Soro 500ml");
    expect(soro).toBeDefined();
    expect(soro.atual).toBe(0);
    expect(soro.zerado).toBe(true);
    expect(f.zerados).toBe(1);
  });

  it("o zerado vem no topo da lista", () => {
    expect(itensEmFalta(ITENS, LOTES).itens[0].nome).toBe("Soro 500ml");
  });

  it("item acima do mínimo não entra", () => {
    expect(itensEmFalta(ITENS, LOTES).itens.some(i => i.nome === "Gaze")).toBe(false);
  });

  it("sem mínimo cadastrado não dá para dizer que falta", () => {
    expect(itensEmFalta(ITENS, LOTES).itens.some(i => i.nome === "Item sem mínimo")).toBe(false);
  });

  it("item desativado sai da conta", () => {
    expect(itensEmFalta(ITENS, LOTES).itens.some(i => i.nome === "Item desativado")).toBe(false);
  });

  it("a farmácia usa a mesma função, só muda a chave do lote", () => {
    const f = itensEmFalta(
      [{ id: 9, nome: "Dipirona", estoque_minimo: 100, ativo: true }],
      [{ medicamento_id: 9, quantidade: 10 }],
      { chaveItem: "medicamento_id", origem: "farmacia" });
    expect(f.itens[0]).toMatchObject({ nome: "Dipirona", atual: 10, faltam: 90, origem: "farmacia" });
  });
});

describe("faltasConsolidadas", () => {
  const sup = itensEmFalta(ITENS, LOTES, { origem: "estoque" });
  const farm = itensEmFalta([{ id: 9, nome: "Dipirona", estoque_minimo: 100, ativo: true }], [{ medicamento_id: 9, quantidade: 10 }],
    { chaveItem: "medicamento_id", origem: "farmacia" });

  it("junta almoxarifado e farmácia numa medida só", () => {
    const c = faltasConsolidadas(sup, farm);
    expect(c.valor).toBe(3);               // Luva, Soro, Dipirona
    expect(c.porOrigem).toEqual({ estoque: 2, farmacia: 1 });
    expect(c.nivel).toBe(NIVEL.CRITICO);   // há item zerado
  });

  it("🔴 se UMA das duas não foi lida, a medida inteira vira não-lida", () => {
    const cego = faltasConsolidadas(sup, { lido: false, itens: [] });
    expect(cego.lido).toBe(false);
    expect(cego.valor).toBeNull();
    expect(cego.detalhe).toMatch(/farmácia/);
  });

  it("nada faltando é boa notícia de verdade quando as duas foram lidas", () => {
    const vazio = itensEmFalta([], [], { origem: "estoque" });
    const vazio2 = itensEmFalta([], [], { origem: "farmacia" });
    const c = faltasConsolidadas(vazio, vazio2);
    expect(c.valor).toBe(0);
    expect(c.nivel).toBe(NIVEL.BOM);
  });
});

// ── o resumo do topo ─────────────────────────────────────────

describe("resumoDaTorre", () => {
  const bom = medida("a", "A", 1, { nivel: NIVEL.BOM });
  const atencao = medida("b", "B", 2, { nivel: NIVEL.ATENCAO });
  const critico = medida("c", "C", 3, { nivel: NIVEL.CRITICO });
  const cego = semLeitura("d", "Materiais em falta", "o estoque");

  it("conta crítico, atenção e não lido separadamente", () => {
    const r = resumoDaTorre([bom, atencao, critico, cego]);
    expect(r).toMatchObject({ total: 4, criticos: 1, atencao: 1, naoLidas: 1 });
    expect(r.oQueFaltouLer).toEqual(["Materiais em falta"]);
  });

  it("🔴 UMA medida não lida derruba o 'tudo bem', mesmo sem nada crítico", () => {
    expect(resumoDaTorre([bom, cego]).podeDizerTudoBem).toBe(false);
  });

  it("só diz tudo bem com tudo lido e nada aceso", () => {
    expect(resumoDaTorre([bom, bom]).podeDizerTudoBem).toBe(true);
    expect(resumoDaTorre([bom, atencao]).podeDizerTudoBem).toBe(false);
  });

  it("painel vazio não é 'tudo bem'", () => {
    expect(resumoDaTorre([]).podeDizerTudoBem).toBe(false);
  });
});
