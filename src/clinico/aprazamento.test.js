// ═══════════════════════════════════════════════════════════
// APRAZAMENTO — quem decide a hora da dose é a enfermagem
//
// 🔴 MEDIDO ANTES DE ESCREVER (15/10/2026): `pep_aprazamentos` existe
// inteira — `previsto_para`, `dose_prevista`, `sequencia`, `aprazado_por`,
// `conselho`, `registro_conselho` — com ZERO usos em todo o código.
//
// Enquanto isso, a grade derivava os horários de uma âncora fixa de 06h:
// 8/8h virava 06h, 14h, 22h para todo paciente, sempre. Palpite numa grade
// de medicação tem dois custos: a tela e a beira do leito contam histórias
// diferentes, e o atraso é medido contra uma hora que ninguém prometeu.
//
// As recusas de verdade estão no gatilho (migracao-aprazamento-cancelar.sql,
// provado em PGlite: 18 cenários). Aqui está o que a tela sabe antes de
// mandar, e as leituras que só existem com o aprazamento gravado.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  MIN_MOTIVO, DIAS_PADRAO, intervaloDe, horariosSugeridos, hhmm,
  conferirAprazamento, divergenciasDeFrequencia, linhasDoAprazamento,
  dosesVigentes, dosesSubstituiveis, foiAprazado, horariosDoItemNoDia, doseQueEstaSendoCumprida,
} from "./aprazamento.js";
import { FALHA } from "../util/leitura.js";

const ITEM = { id: 10, prescricao_id: 5, descricao: "Cefazolina", dose: "1 g", via: "EV", frequencia_dia: 3, intervalo_horas: 8 };
const ENF = { nome: "Enf. Ana", conselho: "COREN", registro_conselho: "123456" };
const EP = { id: 77, prontuario: "T9016" };

// ── O INTERVALO ─────────────────────────────────────────────
describe("o intervalo entre doses", () => {
  it("vem de intervalo_horas quando há", () => {
    expect(intervaloDe({ frequencia_dia: 4, intervalo_horas: 8 })).toBe(8);
  });
  it("senão, deriva da frequência", () => {
    expect(intervaloDe({ frequencia_dia: 4 })).toBe(6);
    expect(intervaloDe({ frequencia_dia: 1 })).toBe(24);
  });
  it("🔴 SOS não tem intervalo — por definição não tem hora marcada", () => {
    expect(intervaloDe({ frequencia_dia: 4, se_necessario: true })).toBeNull();
  });
  it("sem frequência nenhuma devolve null, não zero", () => {
    // Zero viraria divisão por zero ou laço infinito na sugestão.
    expect(intervaloDe({})).toBeNull();
    expect(intervaloDe({ frequencia_dia: 0 })).toBeNull();
    expect(intervaloDe(null)).toBeNull();
  });
});

// ── A SUGESTÃO ──────────────────────────────────────────────
describe("🔴 a sugestão começa no INÍCIO da prescrição, não às 06h", () => {
  // 🔴 O `agora` VAI EXPLÍCITO NOS TESTES DE HORÁRIO.
  //
  // Sem ele, `horariosSugeridos` usa o relógio de verdade, e a regra "a
  // primeira dose é a primeira que ainda não passou" faz o resultado
  // depender do DIA EM QUE A SUÍTE RODA. Estes dois testes passaram em
  // 15/10 e falharam em 16/10 sem ninguém tocar no código: às 22h de
  // ontem a dose era futura, hoje é passada, e a sugestão começa às 14h.
  //
  // É a mesma lição do dia civil, do outro lado: quem lê o relógio dentro
  // do teste não está medindo a regra, está medindo o calendário.
  const ANTES = new Date("2026-10-15T21:00:00");

  it("8/8h iniciada às 22h sugere 22h, 06h, 14h", () => {
    // É o que de fato acontece na enfermaria. A âncora de 06h sugeriria
    // 06h/14h/22h — e a enfermagem corrigiria toda vez.
    const s = horariosSugeridos(ITEM, new Date("2026-10-15T22:00:00"), 1, ANTES);
    expect(s.map(d => hhmm(d.previsto_para))).toEqual(["22:00", "06:00", "14:00"]);
  });

  it("a sequência numera as doses na ordem", () => {
    const s = horariosSugeridos(ITEM, new Date("2026-10-15T22:00:00"), 1);
    expect(s.map(d => d.sequencia)).toEqual([1, 2, 3]);
  });

  it("respeita a duração da prescrição", () => {
    expect(horariosSugeridos({ ...ITEM, duracao_dias: 2 }, new Date("2026-10-15T06:00:00"))).toHaveLength(6);
  });

  it(`sem duração usa ${DIAS_PADRAO} dias`, () => {
    expect(horariosSugeridos(ITEM, new Date("2026-10-15T06:00:00"))).toHaveLength(DIAS_PADRAO * 3);
  });

  it("🔴 SOS não ganha horário sugerido", () => {
    // Propor horário para SOS faria a grade cobrar uma dose que ninguém
    // prometeu — e aí o "atrasado" aparece em medicação que só se dá se
    // o paciente precisar.
    expect(horariosSugeridos({ ...ITEM, se_necessario: true }, new Date())).toEqual([]);
  });

  it("início ilegível não gera nada, e não estoura", () => {
    expect(horariosSugeridos(ITEM, "não é data")).toEqual([]);
    expect(horariosSugeridos(ITEM, null)).toEqual([]);
  });

  // 🔴 ACHADO ANDANDO NO DEMO (15/10/2026): um item de prescrição com 89
  // dias sugeria 21 doses começando em 23 de JULHO — todas no passado,
  // todas nascendo atrasadas. Aprazar é um ato de HOJE.
  describe("🔴 prescrição velha: a sugestão começa AGORA, no mesmo ritmo", () => {
    const INICIO = new Date("2026-07-23T08:55:00");

    it("a primeira dose é a primeira que ainda não passou", () => {
      const agora = new Date("2026-10-15T10:00:00");
      const s = horariosSugeridos(ITEM, INICIO, 1, agora);
      expect(new Date(s[0].previsto_para) >= agora).toBe(true);
    });

    it("🔴 MAS O RITMO CONTINUA SENDO O DO INÍCIO", () => {
      // Reancorar no relógio do momento mudaria o horário da medicação toda
      // vez que alguém reaprazasse — e aí o paciente tomaria o antibiótico
      // numa hora diferente a cada turno.
      const s = horariosSugeridos(ITEM, INICIO, 1, new Date("2026-10-15T10:00:00"));
      expect(s.map(d => hhmm(d.previsto_para))).toEqual(["16:55", "00:55", "08:55"]);
    });

    it("nenhuma dose sugerida no passado", () => {
      const agora = new Date("2026-10-15T10:00:00");
      const s = horariosSugeridos(ITEM, INICIO, 3, agora);
      expect(s.filter(d => new Date(d.previsto_para) < agora)).toEqual([]);
    });

    it("prescrição que começa no FUTURO não é empurrada", () => {
      // Prescrição programada para amanhã deve começar amanhã, não agora.
      const futuro = new Date("2026-10-16T08:00:00");
      const s = horariosSugeridos(ITEM, futuro, 1, new Date("2026-10-15T10:00:00"));
      expect(new Date(s[0].previsto_para).getTime()).toBe(futuro.getTime());
    });

    it("prescrição de agora mesmo começa agora", () => {
      const agora = new Date("2026-10-15T10:00:00");
      const s = horariosSugeridos(ITEM, agora, 1, agora);
      expect(hhmm(s[0].previsto_para)).toBe("10:00");
    });
  });

  it("⚠️ os segundos são zerados — senão cada reaprazamento muda o horário", () => {
    const s = horariosSugeridos(ITEM, new Date("2026-10-15T22:17:43.500"), 1, ANTES);
    const d = new Date(s[0].previsto_para);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
    expect(hhmm(d)).toBe("22:17");
  });
});

// ── A CONFERÊNCIA ───────────────────────────────────────────
describe("o aprazamento pode ser assinado?", () => {
  const doses = [
    { previsto_para: new Date("2026-10-15T22:00:00"), sequencia: 1 },
    { previsto_para: new Date("2026-10-16T06:00:00"), sequencia: 2 },
  ];

  it("completo: passa", () => {
    expect(conferirAprazamento({ item: ITEM, doses, profissional: ENF })).toBeNull();
  });

  it("🔴 SOS não se apraza, e a frase diz quem decide", () => {
    const r = conferirAprazamento({ item: { ...ITEM, se_necessario: true }, doses, profissional: ENF });
    expect(r).toMatch(/não tem hora marcada/);
    expect(r).toMatch(/quem avalia o paciente/);
  });

  it("sem dose nenhuma: recusa", () => {
    expect(conferirAprazamento({ item: ITEM, doses: [], profissional: ENF })).toMatch(/ao menos um horário/);
  });

  it("🔴 duas doses na MESMA hora: recusa, e diz o que acontece", () => {
    // Erro de digitação com cara de rotina. O resultado é dose dobrada, ou
    // dose que ninguém dá porque "a outra já aparece administrada".
    const r = conferirAprazamento({
      item: ITEM, profissional: ENF,
      doses: [{ previsto_para: new Date("2026-10-15T22:00:00") },
              { previsto_para: new Date("2026-10-15T22:00:00") }],
    });
    expect(r).toMatch(/mesmo horário/);
    expect(r).toMatch(/dose dobrada/);
  });

  it("horário inválido: recusa", () => {
    expect(conferirAprazamento({ item: ITEM, profissional: ENF, doses: [{ previsto_para: "xyz" }] }))
      .toMatch(/não é uma data válida/);
  });

  it("🔴 sem conselho e registro: recusa — aprazar é ato de enfermagem", () => {
    const r = conferirAprazamento({ item: ITEM, doses, profissional: { nome: "Alguém" } });
    expect(r).toMatch(/registro no conselho/);
  });

  it("sem item: recusa", () => {
    expect(conferirAprazamento({ doses, profissional: ENF })).toMatch(/Escolha o item/);
  });
});

describe("⚠️ divergência de frequência AVISA, não recusa", () => {
  it("aponta o dia que não bate com a prescrição", () => {
    const doses = [
      { previsto_para: "2026-10-15T22:00:00" },                                  // dia parcial
      { previsto_para: "2026-10-16T06:00:00" }, { previsto_para: "2026-10-16T14:00:00" },  // só 2 num 3x
      { previsto_para: "2026-10-17T06:00:00" },                                  // dia parcial
    ];
    const d = divergenciasDeFrequencia(ITEM, doses);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatch(/2026-10-16/);
    expect(d[0]).toMatch(/2 dose/);
  });

  it("🔴 o PRIMEIRO e o ÚLTIMO dia ficam de fora — é esperado serem parciais", () => {
    // Avisar neles faria o aviso acender em todo aprazamento, sempre — e
    // aviso que sempre acende se aprende a ignorar.
    const doses = [
      { previsto_para: "2026-10-15T22:00:00" },
      { previsto_para: "2026-10-16T06:00:00" }, { previsto_para: "2026-10-16T14:00:00" }, { previsto_para: "2026-10-16T22:00:00" },
      { previsto_para: "2026-10-17T06:00:00" },
    ];
    expect(divergenciasDeFrequencia(ITEM, doses)).toEqual([]);
  });

  it("item sem frequência não gera aviso", () => {
    expect(divergenciasDeFrequencia({}, [{ previsto_para: "2026-10-16T06:00:00" }])).toEqual([]);
  });
});

// ── O QUE VAI PARA O BANCO ──────────────────────────────────
describe("🔴 a linha carimba quem aprazou, com o conselho", () => {
  const doses = [{ previsto_para: new Date("2026-10-15T22:00:00"), sequencia: 1 }];

  it("leva nome, conselho e registro", () => {
    // O cadastro do profissional muda; quem aprazou ontem aprazou com o
    // registro que tinha ontem.
    const [l] = linhasDoAprazamento({ item: ITEM, episodio: EP, doses, profissional: ENF });
    expect(l).toMatchObject({
      item_id: 10, prescricao_id: 5, episodio_id: 77, prontuario: "T9016",
      sequencia: 1, aprazado_por: "Enf. Ana", conselho: "COREN", registro_conselho: "123456",
    });
  });

  it("a dose prevista cai para a do item quando não se diz outra", () => {
    const [l] = linhasDoAprazamento({ item: ITEM, episodio: EP, doses, profissional: ENF });
    expect(l.dose_prevista).toBe("1 g");
  });

  it("dose diferente da prescrita é respeitada", () => {
    // Existe: metade da dose na primeira tomada, ajuste por peso.
    const [l] = linhasDoAprazamento({
      item: ITEM, episodio: EP, profissional: ENF,
      doses: [{ previsto_para: new Date("2026-10-15T22:00:00"), dose_prevista: "500 mg" }],
    });
    expect(l.dose_prevista).toBe("500 mg");
  });

  it("não manda id nem criado_em", () => {
    const [l] = linhasDoAprazamento({ item: ITEM, episodio: EP, doses, profissional: ENF });
    expect(l).not.toHaveProperty("id");
    expect(l).not.toHaveProperty("criado_em");
    expect(l).not.toHaveProperty("cancelado_em");
  });
});

// ── O QUE VALE AGORA ────────────────────────────────────────
describe("🔴 as doses vigentes", () => {
  const apraz = [
    { id: 1, item_id: 10, previsto_para: "2026-10-16T06:00:00", cancelado_em: null },
    { id: 2, item_id: 10, previsto_para: "2026-10-15T22:00:00", cancelado_em: null },
    { id: 3, item_id: 10, previsto_para: "2026-10-16T14:00:00", cancelado_em: "2026-10-16T10:00:00" },
    { id: 4, item_id: 99, previsto_para: "2026-10-16T08:00:00", cancelado_em: null },
  ];

  it("só do item pedido, sem as canceladas, em ordem de horário", () => {
    expect(dosesVigentes(apraz, 10).map(d => d.id)).toEqual([2, 1]);
  });

  it("🔴 FALHA atravessa como null — senão a grade volta a inventar horário", () => {
    // Lista vazia lê-se "não foi aprazado", e aí a tela deriva da âncora.
    // Derivar em cima de uma leitura que não desceu é inventar.
    expect(dosesVigentes(FALHA, 10)).toBeNull();
    expect(foiAprazado(FALHA, 10)).toBeNull();
  });

  it("foiAprazado distingue 'não foi' de 'não sei'", () => {
    expect(foiAprazado(apraz, 10)).toBe(true);
    expect(foiAprazado(apraz, 1234)).toBe(false);
    expect(foiAprazado(FALHA, 10)).toBeNull();
  });

  it("item cujas doses foram TODAS canceladas não está aprazado", () => {
    const todas = [{ id: 1, item_id: 10, previsto_para: "x", cancelado_em: "2026-10-16T10:00:00" }];
    expect(foiAprazado(todas, 10)).toBe(false);
  });
});

describe("🔴 os horários do dia, e DE ONDE eles vêm", () => {
  const apraz = [
    { id: 1, item_id: 10, previsto_para: "2026-10-16T06:00:00", cancelado_em: null },
    { id: 2, item_id: 10, previsto_para: "2026-10-16T14:00:00", cancelado_em: null },
    { id: 3, item_id: 10, previsto_para: "2026-10-17T06:00:00", cancelado_em: null },
  ];

  it("devolve só os do dia pedido, e diz que são aprazados", () => {
    const r = horariosDoItemNoDia(apraz, ITEM, "2026-10-16");
    expect(r.horarios.map(hhmm)).toEqual(["06:00", "14:00"]);
    expect(r.origem).toBe("aprazado");
  });

  it("🔴 a ORIGEM importa: aprazado tem nome, derivado é palpite", () => {
    // Mostrar os dois iguais faria a enfermagem confiar no palpite do
    // mesmo jeito que confia no combinado.
    expect(horariosDoItemNoDia([], ITEM, "2026-10-16").origem).toBe("sem_aprazamento");
    expect(horariosDoItemNoDia(FALHA, ITEM, "2026-10-16").origem).toBe("indisponivel");
  });

  it("leitura falhada devolve horarios null, não lista vazia", () => {
    expect(horariosDoItemNoDia(FALHA, ITEM, "2026-10-16").horarios).toBeNull();
  });

  it("item aprazado mas sem dose NESTE dia continua 'aprazado'", () => {
    // Não é "sem aprazamento": o item foi aprazado, e hoje não tem dose.
    // Confundir os dois faria a tela derivar horários para um item que a
    // enfermagem já decidiu que não tem dose hoje.
    const r = horariosDoItemNoDia(apraz, ITEM, "2026-10-20");
    expect(r.horarios).toEqual([]);
    expect(r.origem).toBe("aprazado");
  });
});

// ── O ELO COM A ADMINISTRAÇÃO ───────────────────────────────
describe("🔴 qual dose esta administração cumpriu", () => {
  const doses = [
    { id: 1, previsto_para: "2026-10-16T06:00:00" },
    { id: 2, previsto_para: "2026-10-16T14:00:00" },
    { id: 3, previsto_para: "2026-10-16T22:00:00" },
  ];

  it("a última que venceu e não foi cumprida", () => {
    expect(doseQueEstaSendoCumprida(doses, "2026-10-16T15:00:00").id).toBe(2);
  });

  it("administrar com atraso ainda cumpre a dose, não cria outra", () => {
    // Uma dose das 06h dada às 09h continua sendo a dose das 06h.
    expect(doseQueEstaSendoCumprida(doses, "2026-10-16T09:00:00").id).toBe(1);
  });

  it("dose já cumprida sai da conta", () => {
    const comUma = [{ ...doses[0], administrado: true }, doses[1], doses[2]];
    expect(doseQueEstaSendoCumprida(comUma, "2026-10-16T09:00:00")).toBeNull();
  });

  it("🔴 administrar POUCO ANTES da hora cumpre aquela dose", () => {
    // Quem administra 10 minutos antes está cumprindo a dose, não criando
    // uma extra — e tratar como extra faria a dose da hora aparecer
    // atrasada logo depois.
    expect(doseQueEstaSendoCumprida(doses, "2026-10-16T05:50:00").id).toBe(1);
  });

  it("🔴 fora de qualquer janela devolve null — não inventa casamento", () => {
    // Dose extra, SOS, administração fora do plano. Forçar um casamento
    // inventaria que a dose das 14h foi dada quando ninguém a deu.
    expect(doseQueEstaSendoCumprida(doses, "2026-10-15T08:00:00")).toBeNull();
  });

  it("dose cancelada não é cumprida por ninguém", () => {
    const canceladas = doses.map(d => ({ ...d, cancelado_em: "2026-10-16T01:00:00" }));
    expect(doseQueEstaSendoCumprida(canceladas, "2026-10-16T15:00:00")).toBeNull();
  });

  it("lista vazia ou hora inválida não estoura", () => {
    expect(doseQueEstaSendoCumprida([], "2026-10-16T15:00:00")).toBeNull();
    expect(doseQueEstaSendoCumprida(doses, "xyz")).toBeNull();
    expect(doseQueEstaSendoCumprida(null, "2026-10-16T15:00:00")).toBeNull();
  });
});

describe("o motivo de cancelar", () => {
  it(`o mínimo é ${MIN_MOTIVO}, igual ao do banco`, () => {
    // Dois números diferentes fariam a tela aceitar o que o banco recusa.
    expect(MIN_MOTIVO).toBe(5);
  });
});

// ── O QUE O REAPRAZAMENTO PODE TROCAR ───────────────────────
describe("🔴 das vigentes, quais o reaprazamento substitui", () => {
  // 🔴 ACHADO CAMINHANDO NO DEMO (16/10/2026): o painel vinha com TODAS as
  // vigentes enquanto o texto dizia "as que já foram dadas ficam como
  // estão". A lista contradizia a frase logo acima dela.
  const AGORA = new Date("2026-10-16T12:00:00Z");
  const DOSES = [
    { id: 1, previsto_para: "2026-10-15T20:00:00Z" },   // passada, administrada
    { id: 2, previsto_para: "2026-10-16T04:00:00Z" },   // passada, perdida
    { id: 3, previsto_para: "2026-10-16T20:00:00Z" },   // futura
    { id: 4, previsto_para: "2026-10-17T04:00:00Z" },   // futura
  ];
  const ADMS = [{ aprazamento_id: 1, status: "administrado" }];

  it("só as futuras, e só as que ninguém deu", () => {
    expect(dosesSubstituiveis(DOSES, ADMS, AGORA).map(d => d.id)).toEqual([3, 4]);
  });

  it("🔴 a dose JÁ ADMINISTRADA fica de fora — e é o que derrubava o reaprazamento", () => {
    // Ela continua VIGENTE (não se cancela o que aconteceu), então
    // reinseri-la no mesmo instante bate no índice único e a troca inteira
    // falha. Foi o que esvaziou a grade no demo.
    const futuraDada = [{ id: 9, previsto_para: "2026-10-16T20:00:00Z" }];
    const dada = [{ aprazamento_id: 9, status: "administrado" }];
    expect(dosesSubstituiveis(futuraDada, dada, AGORA)).toEqual([]);
  });

  it("🔴 a dose PASSADA e perdida fica — ela é a prova de que a dose não foi dada", () => {
    // Cancelá-la apagaria a falha junto com o plano.
    const r = dosesSubstituiveis(DOSES, ADMS, AGORA);
    expect(r.find(d => d.id === 2)).toBeUndefined();
    // e continua na lista de vigentes, intacta
    expect(DOSES.find(d => d.id === 2)).toBeTruthy();
  });

  it("administração que NÃO foi administração (ausência, recusa) não protege a dose", () => {
    const naoDada = [{ aprazamento_id: 3, status: "nao_administrado" }];
    expect(dosesSubstituiveis(DOSES, naoDada, AGORA).map(d => d.id)).toEqual([3, 4]);
  });

  it("🔴 leitura que não desceu atravessa como null, e não como lista vazia", () => {
    // Lista vazia aqui leria "não há o que trocar" e o reaprazamento
    // inseriria por cima sem cancelar nada.
    expect(dosesSubstituiveis(null, ADMS, AGORA)).toBeNull();
    expect(dosesSubstituiveis(FALHA, ADMS, AGORA)).toBeNull();
    expect(dosesSubstituiveis(DOSES, ADMS, "não é data")).toBeNull();
  });

  it("sem administração nenhuma, todas as futuras entram", () => {
    expect(dosesSubstituiveis(DOSES, [], AGORA).map(d => d.id)).toEqual([3, 4]);
    expect(dosesSubstituiveis(DOSES, null, AGORA).map(d => d.id)).toEqual([3, 4]);
  });

  it("dose com horário ilegível não entra na troca", () => {
    expect(dosesSubstituiveis([{ id: 7, previsto_para: "qualquer coisa" }], [], AGORA)).toEqual([]);
  });
});
