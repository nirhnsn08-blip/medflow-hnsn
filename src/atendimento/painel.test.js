// ═══════════════════════════════════════════════════════════
// PAINEL DE CHAMADA — o que a sala de espera vê
//
// 🔴 O TESTE QUE MAIS IMPORTA AQUI É O DO QUE **NÃO** APARECE.
//
// Isto é uma tela pública: fica numa TV que a sala inteira enxerga, e
// qualquer pessoa que passe também. Nome completo, prontuário, queixa e CID
// não podem chegar nela — e o MOTIVO da prioridade também não, porque
// "gestante" ou "82 anos" ao lado das iniciais é informação de saúde numa
// parede.
//
// O selo "PRIORITÁRIO" entra: é o que todo serviço do país exibe e não
// conta nada que a sala não veja olhando a pessoa.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  painelDeChamada, linhaDoPainel,
  MINUTOS_EM_DESTAQUE, PROXIMOS_NO_PAINEL,
} from "./painel.js";
import { filaDoAmbulatorio } from "./ciclo.js";

const HOJE = new Date("2026-08-25T10:00:00");
const menos = min => new Date(HOJE.getTime() - min * 60000).toISOString();

const pessoa = (over = {}) => ({
  id: 1,
  iniciais: "M.S.F.",
  nome_completo: "Maria Silva Ferreira",
  prontuario: "T9008",
  queixa: "dor no peito há duas horas",
  cid: "I20",
  chegada_em: menos(40),
  especialidade_cod: "ORTOPEDIA",
  medico: "dra.ana",
  prioridade: { tem: true, rotulo: "Prioridade especial", motivos: [{ rotulo: "82 anos", legal: true }] },
  ...over,
});

describe("🔴 o que NÃO vai para a parede", () => {
  it("nome completo, prontuário, queixa e CID ficam de fora", () => {
    const linha = linhaDoPainel(pessoa());
    const texto = JSON.stringify(linha).toLowerCase();
    for (const proibido of ["maria silva ferreira", "t9008", "dor no peito", "i20"])
      expect(texto, proibido).not.toContain(proibido);
  });

  it("🔴 o MOTIVO da prioridade também fica de fora", () => {
    // O selo diz que a pessoa tem prioridade; o motivo diria por quê, e
    // "82 anos" numa parede é informação de saúde. Quem precisa do motivo é
    // o balcão — e lá ele aparece, na fila interna.
    const linha = linhaDoPainel(pessoa());
    expect(JSON.stringify(linha)).not.toContain("82 anos");
    expect(linha.prioridade).toBe("Prioridade especial");
  });

  it("as chaves do que sai são exatamente estas — nada entra por acidente", () => {
    // Lista fechada de propósito: um campo novo no atendimento não pode
    // aparecer na TV só porque alguém acrescentou uma coluna.
    expect(Object.keys(linhaDoPainel(pessoa())).sort())
      .toEqual(["chegada", "especialidade", "id", "iniciais", "prioridade", "profissional"]);
  });

  it("mostra INICIAIS, que é o padrão da casa para exibir paciente", () => {
    const linha = linhaDoPainel(pessoa({ paciente: { nome_completo: "Maria Silva Ferreira" } }));
    expect(linha.iniciais).toBe("M.S.F.");
  });

  it("quem não tem prioridade não leva selo — e não leva string vazia disfarçada", () => {
    expect(linhaDoPainel(pessoa({ prioridade: { tem: false, rotulo: "" } })).prioridade).toBe("");
    expect(linhaDoPainel(pessoa({ prioridade: undefined })).prioridade).toBe("");
  });

  it("a hora de chegada desempata iniciais repetidas", () => {
    // `agora` é obrigatório aqui: a hora sozinha só vale se a chegada for
    // do mesmo dia, e sem passar o instante o teste compararia com o relógio
    // da máquina — verde hoje, vermelho amanhã.
    expect(linhaDoPainel(pessoa(), HOJE).chegada).toBe("09:20");
  });

  it("sem hora de chegada não inventa hora", () => {
    expect(linhaDoPainel(pessoa({ chegada_em: null }), HOJE).chegada).toBe("");
    expect(linhaDoPainel(pessoa({ chegada_em: "não é data" }), HOJE).chegada).toBe("");
  });

  it("não explode com nada", () => {
    expect(() => linhaDoPainel()).not.toThrow();
    expect(() => linhaDoPainel(null)).not.toThrow();
  });
});

describe("painelDeChamada", () => {
  const fila = (esperando = [], emAtendimento = []) => ({ esperando, emAtendimento });

  it("🔴 a chamada FICA na tela — o painel existe para quem não ouviu", () => {
    // Se sumisse na chamada seguinte, quem voltou do banheiro trinta
    // segundos depois perderia a vez do mesmo jeito.
    const p = painelDeChamada(
      fila([], [pessoa({ id: 9, atendimento_em: menos(3) })]), { agora: HOJE });
    expect(p.chamando.map(c => c.id)).toEqual([9]);
    expect(p.chamando[0].haMinutos).toBe(3);
  });

  it("passado o tempo de destaque, sai da tela", () => {
    const p = painelDeChamada(
      fila([], [pessoa({ id: 9, atendimento_em: menos(MINUTOS_EM_DESTAQUE + 1) })]), { agora: HOJE });
    expect(p.chamando).toEqual([]);
  });

  it("duas chamadas quase juntas aparecem as DUAS, a mais recente na frente", () => {
    // Numa sala com dois consultórios, mostrar só a última faria a outra
    // pessoa continuar sentada.
    const p = painelDeChamada(fila([], [
      pessoa({ id: 1, atendimento_em: menos(4) }),
      pessoa({ id: 2, atendimento_em: menos(1) }),
    ]), { agora: HOJE });
    expect(p.chamando.map(c => c.id)).toEqual([2, 1]);
  });

  it("🔴 sem hora de chamada, o nome NÃO fica parado na parede", () => {
    // Sem `atendimento_em` não dá para saber se foi agora ou ontem.
    const p = painelDeChamada(fila([], [pessoa({ id: 9, atendimento_em: null })]), { agora: HOJE });
    expect(p.chamando).toEqual([]);
  });

  it("mostra os próximos, na ordem que a fila já decidiu", () => {
    // A ordem da lei mora em `filaDoAmbulatorio`. Repeti-la aqui criaria
    // duas fontes que um dia divergem.
    const p = painelDeChamada(fila([
      pessoa({ id: 1 }), pessoa({ id: 2 }), pessoa({ id: 3 }),
    ]), { agora: HOJE });
    expect(p.proximos.map(x => x.id)).toEqual([1, 2, 3]);
  });

  it("lista longa numa TV ninguém lê — corta, e DIZ quantos ficaram de fora", () => {
    const muitos = Array.from({ length: 10 }, (_, i) => pessoa({ id: i + 1 }));
    const p = painelDeChamada(fila(muitos), { agora: HOJE });
    expect(p.proximos).toHaveLength(PROXIMOS_NO_PAINEL);
    expect(p.aguardando).toBe(10);
    expect(p.ocultos).toBe(10 - PROXIMOS_NO_PAINEL);
  });

  it("🔴 avisa que há prioridade na fila — senão a ordem parece arbitrária", () => {
    // É o motivo de o painel existir depois da prioridade legal: quem
    // chegou às 9h vê alguém das 9h55 passar na frente, e vai ao balcão
    // perguntar se a tela não explicar.
    const comPrioridade = painelDeChamada(fila([pessoa()]), { agora: HOJE });
    expect(comPrioridade.temPrioritario).toBe(true);

    const semPrioridade = painelDeChamada(
      fila([pessoa({ prioridade: { tem: false, rotulo: "" } })]), { agora: HOJE });
    expect(semPrioridade.temPrioritario).toBe(false);
  });

  it("fila vazia devolve painel vazio, sem quebrar", () => {
    const p = painelDeChamada(fila(), { agora: HOJE });
    expect(p).toMatchObject({ chamando: [], proximos: [], aguardando: 0, ocultos: 0, temPrioritario: false });
  });

  it("não explode com lixo", () => {
    expect(() => painelDeChamada()).not.toThrow();
    expect(() => painelDeChamada({ esperando: null, emAtendimento: "x" })).not.toThrow();
  });
});

describe("o painel em cima da fila de verdade", () => {
  it("🔴 a senhora de 82 aparece no topo dos próximos, com selo e sem motivo", () => {
    const nascidoHa = anos => `${2026 - anos}-08-25`;
    const chegou = (id, anos, hora) => ({
      id, status: "aguardando_atendimento", chegada_em: `2026-08-25T${hora}:00`,
      iniciais: "X.Y.Z.", nome_completo: "Fulana de Tal", prontuario: "T1",
      pacientes: { data_nascimento: nascidoHa(anos) },
    });

    const f = filaDoAmbulatorio([
      chegou(1, 30, "08:00"),   // espera 2h
      chegou(2, 82, "09:55"),   // chegou agora
    ], { agora: HOJE });

    const p = painelDeChamada(f, { agora: HOJE });
    expect(p.proximos.map(x => x.id)).toEqual([2, 1]);
    expect(p.proximos[0].prioridade).toBe("Prioridade especial");
    expect(p.temPrioritario).toBe(true);
    // e o "82 anos" que a fila interna mostra não chega à parede
    expect(JSON.stringify(p)).not.toContain("82 anos");
    expect(JSON.stringify(p)).not.toContain("Fulana de Tal");
  });
});

// 🔴 A HORA SOZINHA MENTE QUANDO A CHEGADA NÃO É DE HOJE.
//
// Achado percorrendo o painel no demo: um atendimento aberto ONTEM e nunca
// encerrado continua na fila, e a tela mostrava "chegou 15:45". A sala lê
// 15:45 de hoje e conclui que a pessoa está ali — quando o que existe é um
// episódio que ninguém fechou. A própria Agenda já avisa desses; o painel
// os exibia como se fossem gente sentada.
describe("a chegada de outro dia se identifica", () => {
  const comChegada = quando => ({ id: 1, iniciais: "A.B.C.", chegada_em: quando });

  it("chegada de HOJE mostra só a hora", () => {
    expect(linhaDoPainel(comChegada("2026-08-25T09:20:00"), HOJE).chegada).toBe("09:20");
  });

  it("🔴 chegada de ONTEM diz que é de ontem", () => {
    expect(linhaDoPainel(comChegada("2026-08-24T15:45:00"), HOJE).chegada).toBe("ontem 15:45");
  });

  it("mais velha que ontem mostra o dia e o mês", () => {
    expect(linhaDoPainel(comChegada("2026-08-19T08:05:00"), HOJE).chegada).toBe("19/08 08:05");
  });

  it("🔴 NÃO some da tela — esconder resolveria a mentira criando outra", () => {
    // Quem chegou às 23h50 e é chamado às 00h10 desapareceria do painel.
    const p = painelDeChamada({ esperando: [comChegada("2026-08-24T23:50:00")], emAtendimento: [] }, { agora: HOJE });
    expect(p.proximos).toHaveLength(1);
    expect(p.proximos[0].chegada).toMatch(/ontem/);
  });

  it("a virada do ano não vira 'hoje'", () => {
    // Comparar só dia e mês faria 25/08/2025 passar por hoje.
    expect(linhaDoPainel(comChegada("2025-08-25T09:20:00"), HOJE).chegada).toBe("25/08 09:20");
  });
});
