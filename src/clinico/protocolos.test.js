import { describe, it, expect } from "vitest";
import {
  minutosEntre, avaliarGatilhoSepse, avaliarGatilhoDorToracica, avaliarGatilhoAvc, janelaTerapeutica,
  escorePadua, recomendacaoTev, montarBundle, estadoAtivacao, tempoPortaAcao, indicadoresProtocolo, resumoPainelSetor,
} from "./protocolos.js";
import { SEPSE, IAM, AVC, TEV } from "./protocolos-catalogo.js";

const at = iso => new Date(iso).getTime();
const T0 = "2026-08-03T10:00:00.000Z";
const mais = (min) => new Date(at(T0) + min * 60000).toISOString();

// Sinais que dão NEWS ≥ 5 (fr 22=2, spo2 95=1, temp 38.5=1, pa 105=1, fc 95=1 → 6)
const SEPTICO = { fr: 22, spo2: 95, temp: 38.5, pa_sist: 105, fc: 95, consciencia: "A" };
// Sinais estáveis (tudo 0)
const ESTAVEL = { fr: 18, spo2: 97, temp: 37, pa_sist: 120, fc: 80, consciencia: "A" };

describe("minutosEntre", () => {
  it("conta minutos inteiros", () => expect(minutosEntre(T0, mais(30))).toBe(30));
  it("null quando falta ponta", () => { expect(minutosEntre(null, T0)).toBe(null); expect(minutosEntre(T0, null)).toBe(null); });
  it("null quando data inválida", () => expect(minutosEntre("xis", T0)).toBe(null));
});

describe("avaliarGatilhoSepse", () => {
  it("acende quando NEWS ≥ 5", () => {
    const g = avaliarGatilhoSepse(SEPTICO);
    expect(g.aciona).toBe(true);
    expect(g.score).toBe(6);
    expect(g.alvo).toBe(5);
  });
  it("não acende quando NEWS < 5", () => {
    const g = avaliarGatilhoSepse(ESTAVEL);
    expect(g.aciona).toBe(false);
    expect(g.score).toBe(0);
  });
  it("não acende sem dados suficientes de sinais", () => {
    const g = avaliarGatilhoSepse({ fr: 18, spo2: 97 }); // só 2 parâmetros → NEWS null
    expect(g.aciona).toBe(false);
    expect(g.score).toBe(null);
    expect(g.motivo).toMatch(/insuficient/i);
  });
  it("não acende se explicitamente sem foco infeccioso, mesmo com NEWS alto", () => {
    const g = avaliarGatilhoSepse(SEPTICO, { suspeitaInfeccao: false });
    expect(g.aciona).toBe(false);
    expect(g.motivo).toMatch(/foco infeccioso/i);
  });
  it("reforça o motivo quando há suspeita de foco", () => {
    expect(avaliarGatilhoSepse(SEPTICO, { suspeitaInfeccao: true }).motivo).toMatch(/com suspeita/i);
  });
});

describe("montarBundle", () => {
  it("devolve os passos do template ordenados", () => {
    const b = montarBundle(SEPSE);
    expect(b.chave).toBe("sepse");
    expect(b.janela_min).toBe(60);
    expect(b.passos.map(p => p.chave)).toEqual(["lactato", "hemocultura", "atb", "cristaloide", "vasopressor", "reavaliar"]);
  });
  it("aplica override de alvo e janela do setor", () => {
    const b = montarBundle(SEPSE, { janela_min: 45, passos_over: [{ chave: "atb", alvo_min: 30 }] });
    expect(b.janela_min).toBe(45);
    expect(b.passos.find(p => p.chave === "atb").alvo_min).toBe(30);
    // passo não sobrescrito mantém o alvo do template
    expect(b.passos.find(p => p.chave === "lactato").alvo_min).toBe(30);
  });
  it("é seguro com template vazio", () => {
    expect(montarBundle(null).passos).toEqual([]);
  });
});

const bundle = montarBundle(SEPSE);
const ativa = { id: "a1", protocolo: "sepse", setor: "Emergência", status: "ativa", acionado_em: T0 };

describe("estadoAtivacao", () => {
  it("marca passo pendente dentro do prazo e estourado após o alvo", () => {
    const est = estadoAtivacao(ativa, [], bundle, at(mais(40)));
    const lactato = est.passos.find(p => p.chave === "lactato"); // alvo 30
    const atb = est.passos.find(p => p.chave === "atb");         // alvo 60
    expect(lactato.situacao).toBe("estourado");
    expect(atb.situacao).toBe("pendente");
    expect(est.estourando).toBe(1);
    expect(est.farol).toBe("vermelho");
  });
  it("marca feito no alvo e feito fora do alvo", () => {
    const itens = [
      { passo: "lactato", feito: true, feito_em: mais(20), valor: "3.1" }, // ≤30 → no alvo
      { passo: "atb", feito: true, feito_em: mais(70) },                   // >60 → fora
    ];
    const est = estadoAtivacao(ativa, itens, bundle, at(mais(75)));
    expect(est.passos.find(p => p.chave === "lactato").situacao).toBe("feito_no_alvo");
    expect(est.passos.find(p => p.chave === "lactato").valor).toBe("3.1");
    expect(est.passos.find(p => p.chave === "atb").situacao).toBe("feito_fora");
    expect(est.completos).toBe(2);
  });
  it("respeita 'não se aplica' e o tira do denominador do %", () => {
    const itens = [{ passo: "vasopressor", nao_aplica: true }];
    const est = estadoAtivacao(ativa, itens, bundle, at(mais(5)));
    expect(est.passos.find(p => p.chave === "vasopressor").situacao).toBe("nao_aplica");
    expect(est.pct).toBe(0); // 0 feitos de 5 aplicáveis
    expect(est.total).toBe(6);
  });
  it("calcula dentro_janela quando todos os críticos foram no prazo", () => {
    const itens = [
      { passo: "lactato", feito: true, feito_em: mais(15) },
      { passo: "hemocultura", feito: true, feito_em: mais(25) },
      { passo: "atb", feito: true, feito_em: mais(40) },
      { passo: "cristaloide", feito: true, feito_em: mais(50) },
    ];
    const est = estadoAtivacao(ativa, itens, bundle, at(mais(55)));
    expect(est.dentro_janela).toBe(true);
    expect(est.criticos_pendentes).toBe(0);
  });
  it("não conta dentro_janela se um crítico estourou a janela", () => {
    const itens = [
      { passo: "lactato", feito: true, feito_em: mais(15) },
      { passo: "hemocultura", feito: true, feito_em: mais(25) },
      { passo: "atb", feito: true, feito_em: mais(80) }, // >60 janela
      { passo: "cristaloide", feito: true, feito_em: mais(50) },
    ];
    const est = estadoAtivacao(ativa, itens, bundle, at(mais(85)));
    expect(est.dentro_janela).toBe(false);
  });
  it("usa o item mais recente quando o passo foi registrado duas vezes", () => {
    const itens = [
      { passo: "lactato", feito: true, feito_em: mais(10), valor: "2.0" },
      { passo: "lactato", feito: true, feito_em: mais(20), valor: "4.5" },
    ];
    const est = estadoAtivacao(ativa, itens, bundle, at(mais(25)));
    expect(est.passos.find(p => p.chave === "lactato").valor).toBe("4.5");
  });
  it("ativação encerrada não estoura mais (relógio para no encerramento)", () => {
    const encerrada = { ...ativa, status: "concluida", encerrado_em: mais(25) };
    const est = estadoAtivacao(encerrada, [], bundle, at(mais(999)));
    expect(est.passos.find(p => p.chave === "lactato").situacao).toBe("pendente");
    expect(est.estourando).toBe(0);
    expect(est.decorrido_total).toBe(25);
  });
});

describe("tempoPortaAcao", () => {
  it("mede porta→ATB pelo carimbo do passo", () => {
    const itens = [{ passo: "atb", feito: true, feito_em: mais(48) }];
    expect(tempoPortaAcao(ativa, itens, "atb")).toBe(48);
  });
  it("null quando o passo não foi feito", () => {
    expect(tempoPortaAcao(ativa, [], "atb")).toBe(null);
  });
});

describe("indicadoresProtocolo", () => {
  const ativacoes = [
    { id: "x1", protocolo: "sepse", setor: "Emergência", status: "concluida", acionado_em: T0, desfecho: "confirmado" },
    { id: "x2", protocolo: "sepse", setor: "Emergência", status: "concluida", acionado_em: T0, desfecho: "confirmado" },
    { id: "x3", protocolo: "sepse", setor: "UTI",        status: "ativa",      acionado_em: T0 },
  ];
  const itens = {
    x1: [{ passo: "atb", feito: true, feito_em: mais(45) }],  // no alvo (≤60)
    x2: [{ passo: "atb", feito: true, feito_em: mais(90) }],  // fora
    x3: [],
  };
  it("agrega total/ativas/concluídas e mediana porta→ATB", () => {
    const ind = indicadoresProtocolo(ativacoes, itens, { janela_min: 60 });
    expect(ind.total).toBe(3);
    expect(ind.ativas).toBe(1);
    expect(ind.concluidas).toBe(2);
    expect(ind.confirmados).toBe(2);
    expect(ind.tempoMedianoAlvo).toBe(68); // mediana de [45,90] = (45+90)/2 arredondado
    expect(ind.pctAlvoNoPrazo).toBe(50);   // 1 de 2 com ATB feito estava no prazo
  });
  it("filtra por setor", () => {
    const ind = indicadoresProtocolo(ativacoes, itens, { setor: "UTI" });
    expect(ind.total).toBe(1);
    expect(ind.pctAlvoNoPrazo).toBe(null); // nenhum ATB feito na UTI
  });
});

describe("resumoPainelSetor", () => {
  it("conta ativas, quantas estourando e críticos pendentes", () => {
    const ativacoes = [
      { id: "a1", protocolo: "sepse", status: "ativa", acionado_em: T0 },
      { id: "a2", protocolo: "sepse", status: "concluida", acionado_em: T0, encerrado_em: mais(30) },
    ];
    const r = resumoPainelSetor(ativacoes, { a1: [], a2: [] }, { sepse: bundle }, at(mais(50)));
    expect(r.ativas).toBe(1);
    expect(r.estourando).toBe(1);          // a1 tem lactato/hemocultura estourados
    expect(r.criticosPendentes).toBe(4);   // lactato, hemocultura, atb, cristaloide
  });
});

describe("avaliarGatilhoDorToracica", () => {
  it("sugere quando a queixa menciona dor torácica", () => {
    const g = avaliarGatilhoDorToracica("Dor torácica há 2h irradiando para o braço");
    expect(g.sugere).toBe(true);
    expect(g.termo).toBe("dor toracica");
  });
  it("pega variações e ignora acento/caixa", () => {
    expect(avaliarGatilhoDorToracica("PRECORDIAL").sugere).toBe(true);
    expect(avaliarGatilhoDorToracica("aperto no peito").sugere).toBe(true);
    expect(avaliarGatilhoDorToracica("dor retroesternal").sugere).toBe(true);
  });
  it("não sugere para queixa não cardiológica", () => {
    expect(avaliarGatilhoDorToracica("cefaleia e febre").sugere).toBe(false);
  });
  it("orienta quando não há queixa", () => {
    const g = avaliarGatilhoDorToracica("");
    expect(g.sugere).toBe(false);
    expect(g.motivo).toMatch(/Informe a queixa/i);
  });
});

describe("bundle do IAM (Fase 3b)", () => {
  it("monta o pacote porta→ECG com o ECG crítico em 10 min", () => {
    const b = montarBundle(IAM);
    expect(b.chave).toBe("iam");
    expect(b.janela_min).toBe(10);
    expect(b.passos[0].chave).toBe("ecg");
    expect(b.passos[0].alvo_min).toBe(10);
    expect(b.passos[0].critico).toBe(true);
  });
  it("porta→ECG sai do carimbo do passo ecg", () => {
    const a = { id: "i1", protocolo: "iam", acionado_em: T0 };
    const itens = [{ passo: "ecg", feito: true, feito_em: mais(8) }];
    expect(tempoPortaAcao(a, itens, "ecg")).toBe(8);
  });
  it("indicadores usam o passo-alvo do protocolo (ecg)", () => {
    const ativacoes = [{ id: "i1", protocolo: "iam", status: "concluida", acionado_em: T0 }];
    const itens = { i1: [{ passo: "ecg", feito: true, feito_em: mais(7) }] };
    const ind = indicadoresProtocolo(ativacoes, itens, { janela_min: 10, passoAlvo: "ecg" });
    expect(ind.tempoMedianoAlvo).toBe(7);
    expect(ind.pctAlvoNoPrazo).toBe(100);
  });
});

describe("avaliarGatilhoAvc", () => {
  it("sugere para déficit neurológico (variações, sem acento/caixa)", () => {
    expect(avaliarGatilhoAvc("Boca torta e fraqueza no braço").sugere).toBe(true);
    expect(avaliarGatilhoAvc("fala enrolada súbita").sugere).toBe(true);
    expect(avaliarGatilhoAvc("suspeita de AVC").sugere).toBe(true);
  });
  it("não sugere para queixa não neurológica", () => {
    expect(avaliarGatilhoAvc("dor abdominal e vômito").sugere).toBe(false);
  });
});

describe("janelaTerapeutica (AVC)", () => {
  it("dentro da janela quando ≤ 4,5h do início", () => {
    const j = janelaTerapeutica(T0, at(mais(120))); // 2h
    expect(j.dentroTrombolise).toBe(true);
    expect(j.farol).toBe("verde");
    expect(j.decorrido_min).toBe(120);
  });
  it("fora da janela quando > 4,5h (270 min)", () => {
    const j = janelaTerapeutica(T0, at(mais(300))); // 5h
    expect(j.dentroTrombolise).toBe(false);
    expect(j.farol).toBe("vermelho");
  });
  it("cinza quando o início não é conhecido", () => {
    const j = janelaTerapeutica(null);
    expect(j.conhecido).toBe(false);
    expect(j.farol).toBe("cinza");
  });
});

describe("bundle do AVC (Fase 3c)", () => {
  it("monta o pacote porta→TC com a TC crítica em 25 min", () => {
    const b = montarBundle(AVC);
    expect(b.chave).toBe("avc");
    const tc = b.passos.find(p => p.chave === "tc");
    expect(tc.alvo_min).toBe(25);
    expect(tc.critico).toBe(true);
    expect(AVC.kpi_passo).toBe("tc");
  });
});

describe("TEV — escore de Padua + recomendação (Fase 3d)", () => {
  const fatores = TEV.passos;
  it("o template do TEV é uma avaliação com os 11 fatores de Padua", () => {
    expect(TEV.tipo).toBe("avaliacao");
    expect(fatores.length).toBe(11);
    expect(fatores.find(f => f.chave === "cancer").pontos).toBe(3);
  });
  it("soma os pontos dos fatores marcados (alto risco ≥ 4)", () => {
    const r = escorePadua(["cancer", "idade"], fatores); // 3 + 1 = 4
    expect(r.score).toBe(4);
    expect(r.alto).toBe(true);
  });
  it("baixo risco quando a soma < 4", () => {
    const r = escorePadua(["idade", "obesidade"], fatores); // 1 + 1 = 2
    expect(r.score).toBe(2);
    expect(r.alto).toBe(false);
  });
  it("ignora chave de fator inexistente", () => {
    expect(escorePadua(["xis"], fatores).score).toBe(0);
  });
  it("alto risco sem sangramento → farmacológica", () => {
    expect(recomendacaoTev({ alto: true, sangramentoAlto: false }).chave).toBe("farmacologica");
  });
  it("alto risco com sangramento → mecânica", () => {
    expect(recomendacaoTev({ alto: true, sangramentoAlto: true }).chave).toBe("mecanica");
  });
  it("baixo risco → não rotina", () => {
    expect(recomendacaoTev({ alto: false }).chave).toBe("nao_rotina");
  });
});
