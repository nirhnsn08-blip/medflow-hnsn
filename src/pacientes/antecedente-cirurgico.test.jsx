// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// A CIRURGIA ENTRA NO PRONTUÁRIO
//
// 🔴 O PACIENTE 360 NÃO LIA `cc_cirurgias`.
//
// A tela mostrava PS, leito, SCIH, evoluções e alergias — o hospital
// inteiro por um prontuário — e um paciente OPERADO aparecia como paciente
// que nunca entrou em sala. Quem o atende seis meses depois lia um
// prontuário que parecia completo e concluía que não havia antecedente
// cirúrgico: é risco anestésico, é aderência, é diagnóstico diferencial.
//
// O prontuário é legalmente ÚNICO (CFM 1.638/2002), não um por módulo.
//
// ⚠️ E "NÃO CONSEGUI LER" NUNCA PODE VIRAR "NUNCA OPEROU". É a pior forma
// desse defeito: a ausência é lida como notícia boa, e o médico decide
// risco anestésico com base numa ausência que não foi medida.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  antecedenteCirurgico, descricaoVigenteDe, equipeDe,
  montarTimeline, quantasOperou, resumoLocalPaciente, sentinelaPaciente,
} from "./paciente360.js";
import { FALHA } from "../util/leitura.js";
import PacientePage from "./Paciente360.jsx";

afterEach(cleanup);

const CIR = {
  id: 7, prontuario: "T1", iniciais: "A.B.C.", data: "2026-04-10", sala: "Sala 1",
  procedimento: "Colecistectomia videolaparoscópica", procedimento_cod: "0407010173",
  status: "concluida", entrada_sala_em: "2026-04-10T11:00:00Z",
  inicio_cirurgia_em: "2026-04-10T11:30:00Z", descricao_em: "2026-04-10T15:00:00Z",
};
const DESC = {
  id: 1, cirurgia_id: 7, versao: 1, corrige_id: null,
  procedimento_realizado: "Colecistectomia convertida para aberta",
  via_acesso: "aberta", conversao: true, intercorrencias: "Lesão de serosa, rafiada.",
  cid_pos: "K80.1",
};
const EQ = [{ cirurgia_id: 7, papel: "cirurgiao", nome: "Dra. Ana", cbo: "225125" }];

const base = (extra = {}) => ({
  ps: [], leitoAtual: [], saidas: [], scih: [], evolucoes: [], alergias: [], registrosPS: [],
  cirurgias: [], equipeCirurgias: [], descricoesCirurgias: [], ...extra,
});

// ── A LEITURA POR CIRURGIA ──────────────────────────────────
describe("a equipe e a descrição de cada cirurgia", () => {
  it("equipe por cirurgia, comparando id como texto", () => {
    // O PostgREST devolve bigint como número e o React costuma carregar
    // string: comparar com `===` cru perderia o vínculo em silêncio.
    const d = base({ equipeCirurgias: [{ cirurgia_id: "7", papel: "cirurgiao", nome: "X" }] });
    expect(equipeDe(d, 7)).toHaveLength(1);
  });

  it("🔴 a VIGENTE é a que ninguém corrigiu — a corrigida não é o que vale", () => {
    const v2 = { id: 2, cirurgia_id: 7, versao: 2, corrige_id: 1, procedimento_realizado: "Aberta" };
    const d = base({ descricoesCirurgias: [DESC, v2] });
    expect(descricaoVigenteDe(d, 7)).toBe(v2);
  });

  it("sem descrição, `null` — e não um objeto vazio", () => {
    expect(descricaoVigenteDe(base(), 7)).toBeNull();
  });
});

// ── O ANTECEDENTE ──────────────────────────────────────────
describe("🔴 o antecedente cirúrgico", () => {
  it("monta a linha com o procedimento REALIZADO e quem operou", () => {
    const a = antecedenteCirurgico(base({ cirurgias: [CIR], equipeCirurgias: EQ, descricoesCirurgias: [DESC] }));
    expect(a).toHaveLength(1);
    expect(a[0].procedimento).toMatch(/convertida para aberta/);
    expect(a[0].cirurgiao).toBe("Dra. Ana");
    expect(a[0].convertida).toBe(true);
    expect(a[0].temDescricao).toBe(true);
  });

  it("da mais recente para a mais antiga", () => {
    const antiga = { ...CIR, id: 3, data: "2020-01-05", inicio_cirurgia_em: "2020-01-05T12:00:00Z" };
    const a = antecedenteCirurgico(base({ cirurgias: [antiga, CIR] }));
    expect(a.map(x => x.id)).toEqual([7, 3]);
  });

  it("sem cirurgia nenhuma, lista vazia — não uma linha em branco", () => {
    expect(antecedenteCirurgico(base())).toEqual([]);
  });
});

// ── A LINHA DO TEMPO ───────────────────────────────────────
describe("🔴 a cirurgia entra na linha do tempo", () => {
  it("o evento traz via, conversão, cirurgião e CID pós-operatório", () => {
    const ev = montarTimeline(base({ cirurgias: [CIR], equipeCirurgias: EQ, descricoesCirurgias: [DESC] }));
    const c = ev.find(x => x.modulo === "Bloco");
    expect(c).toBeTruthy();
    expect(c.titulo).toMatch(/Cirurgia: Colecistectomia convertida para aberta/);
    expect(c.detalhe).toMatch(/via aberta/);
    expect(c.detalhe).toMatch(/CONVERTIDA/);
    expect(c.detalhe).toMatch(/cirurgião: Dra. Ana/);
    expect(c.detalhe).toMatch(/CID pós-op K80\.1/);
    expect(c.detalhe).toMatch(/intercorrências: Lesão de serosa/);
  });

  it("🔴 cirurgia operada SEM descrição diz isso na linha do tempo", () => {
    // Ausência de documento não é "nada a relatar": é buraco no prontuário.
    const ev = montarTimeline(base({ cirurgias: [{ ...CIR, descricao_em: null }] }));
    expect(ev.find(x => x.modulo === "Bloco").detalhe).toMatch(/SEM descrição cirúrgica registrada/);
  });

  it("🔴 cirurgia CANCELADA entra, com o motivo", () => {
    // Cancelamento por jejum inadequado é história do paciente, e é o que
    // explica por que ele voltou três semanas depois.
    const ev = montarTimeline(base({
      cirurgias: [{ ...CIR, status: "cancelada", cancelamento_motivo: "Jejum inadequado",
                    cancelado_em: "2026-04-10T07:00:00Z" }],
    }));
    const c = ev.find(x => x.modulo === "Bloco");
    expect(c.titulo).toMatch(/Cirurgia CANCELADA/);
    expect(c.detalhe).toBe("Jejum inadequado");
  });

  it("cirurgia agendada aparece como agendada, não como ato", () => {
    const ev = montarTimeline(base({ cirurgias: [{ ...CIR, status: "agendada", entrada_sala_em: null, inicio_cirurgia_em: null }] }));
    expect(ev.find(x => x.modulo === "Bloco").titulo).toMatch(/Cirurgia AGENDADA/);
  });

  it("a hora do evento sai do relógio LOCAL", () => {
    // 01:00Z do dia 11 é 22:00 do dia 10 — sem isto a cirurgia da noite
    // apareceria no dia seguinte na linha do tempo.
    const ev = montarTimeline(base({ cirurgias: [{ ...CIR, inicio_cirurgia_em: "2026-04-11T01:00:00Z" }] }));
    expect(ev.find(x => x.modulo === "Bloco").quando).toBe("2026-04-11T01:00:00Z");
    const a = antecedenteCirurgico(base({ cirurgias: [{ ...CIR, inicio_cirurgia_em: "2026-04-11T01:00:00Z" }] }));
    expect(a[0].dia).toBe("2026-04-10");
  });
});

// ── A SENTINELA ────────────────────────────────────────────
describe("🔴 a sentinela, com gatilho estreito", () => {
  const textos = a => a.map(x => x.texto).join(" | ");

  it("paciente em cirurgia AGORA", () => {
    const a = sentinelaPaciente(base({ cirurgias: [{ ...CIR, status: "em_cirurgia" }] }));
    expect(textos(a)).toMatch(/EM CIRURGIA agora/);
  });

  it("paciente na RPA", () => {
    expect(textos(sentinelaPaciente(base({ cirurgias: [{ ...CIR, status: "recuperacao" }] }))))
      .toMatch(/recuperação pós-anestésica/);
  });

  it("🔴 cirurgia concluída sem descrição é pendência LEGAL, com a data", () => {
    const a = sentinelaPaciente(base({ cirurgias: [{ ...CIR, descricao_em: null }] }));
    expect(textos(a)).toMatch(/Cirurgia de 10\/04\/2026 SEM descrição cirúrgica/);
  });

  it("com a descrição registrada, a sentinela fica calada", () => {
    // Aviso que não some é fadiga de alarme — e aí o que importa também
    // deixa de ser lido.
    expect(sentinelaPaciente(base({ cirurgias: [CIR] }))).toEqual([]);
  });

  it("cirurgia de anos atrás não alerta nada", () => {
    expect(sentinelaPaciente(base({ cirurgias: [{ ...CIR, id: 9, data: "2019-02-02" }] }))).toEqual([]);
  });
});

// ── A PASSAGEM DE PLANTÃO ──────────────────────────────────
describe("o resumo de plantão conta a cirurgia", () => {
  it("quantas, a mais recente e o detalhe dela", () => {
    const d = base({ cirurgias: [CIR], equipeCirurgias: EQ, descricoesCirurgias: [DESC] });
    const txt = resumoLocalPaciente("T1", d, [], []);
    expect(txt).toMatch(/Antecedente cirúrgico: 1 cirurgia\(s\)/);
    expect(txt).toMatch(/em 10\/04\/2026/);
    expect(txt).toMatch(/CONVERTIDA/);
  });

  it("🔴 e marca a que não tem descrição", () => {
    const d = base({ cirurgias: [{ ...CIR, descricao_em: null }] });
    expect(resumoLocalPaciente("T1", d, [], [])).toMatch(/SEM descrição cirúrgica registrada/);
  });

  it("cancelada e agendada não entram no antecedente do plantão", () => {
    const d = base({ cirurgias: [{ ...CIR, status: "cancelada" }, { ...CIR, id: 8, status: "agendada", entrada_sala_em: null }] });
    expect(resumoLocalPaciente("T1", d, [], [])).not.toMatch(/Antecedente cirúrgico/);
  });
});

// ── A TELA ─────────────────────────────────────────────────
describe("🔴 a seção na tela do Paciente 360", () => {
  /**
   * A tela inteira, com o `sb` interceptado.
   *
   * ⚠️ `cirurgias` é o único retorno que interessa aqui; o resto responde
   * vazio. A busca por prontuário puro abre direto, sem caixa de sugestão.
   */
  async function abrir({ cirurgiasFalham = false, cirurgias = [], equipe = [], descricoes = [] } = {}) {
    const sb = async rota => {
      if (rota.startsWith("cc_cirurgias")) {
        if (cirurgiasFalham) throw new Error("rede");
        return cirurgias;
      }
      if (rota.startsWith("cc_equipe")) return equipe;
      if (rota.startsWith("cc_descricao")) return descricoes;
      if (rota.startsWith("pacientes?prontuario")) return [{ prontuario: "T1", iniciais: "A.B.C." }];
      return [];
    };
    render(<PacientePage sb={sb} currentUser={{ name: "teste" }} canEdit />);
    const busca = document.querySelector('input[type="text"], input:not([type])');
    const { fireEvent, waitFor } = await import("@testing-library/react");
    fireEvent.change(busca, { target: { value: "1" } });
    fireEvent.keyDown(busca, { key: "Enter", code: "Enter" });
    fireEvent.submit(busca.closest("form") || busca);
    // A busca pode depender de um botão; aciona o que existir.
    const btBusca = [...document.querySelectorAll("button")].find(b => /buscar/i.test(b.textContent));
    if (btBusca) fireEvent.click(btBusca);
    await waitFor(() => expect(document.body.textContent).toMatch(/A\.B\.C\.|Antecedente|Linha do tempo/));
    return { sb };
  }

  it("🔴 leitura que FALHA diz que isso não significa que nunca operou", async () => {
    await abrir({ cirurgiasFalham: true });
    const alerta = await screen.findByText(/Não consegui ler as cirurgias deste paciente/);
    expect(alerta).toBeTruthy();
    expect(document.body.textContent).toMatch(/não significa que ele nunca foi\s+operado/);
  });

  it("com cirurgia, a seção mostra o procedimento e quem operou", async () => {
    await abrir({ cirurgias: [CIR], equipe: EQ, descricoes: [DESC] });
    expect(await screen.findByText(/Antecedente cirúrgico \(1\)/)).toBeTruthy();
    expect(document.body.textContent).toMatch(/Colecistectomia convertida para aberta/);
    expect(document.body.textContent).toMatch(/cirurgião: Dra\. Ana/);
  });

  it("🔴 cirurgia sem descrição: a tela diz que o que foi feito não está no prontuário", async () => {
    await abrir({ cirurgias: [{ ...CIR, descricao_em: null }], equipe: EQ, descricoes: [] });
    expect(await screen.findByText(/o que foi feito não está no prontuário/)).toBeTruthy();
  });

  it("sem cirurgia, a seção nem aparece — não um 'nenhuma cirurgia'", async () => {
    // Afirmar "nenhuma cirurgia" seria afirmar ausência. A seção some.
    await abrir({ cirurgias: [] });
    expect(screen.queryByText(/Antecedente cirúrgico/)).toBeNull();
  });
});

// ── A MARCA DE FALHA ───────────────────────────────────────
describe("🔴 a marca de falha atravessa as regras", () => {
  it("`FALHA` em `cirurgias` não inventa antecedente nem alerta", () => {
    const d = base({ cirurgias: FALHA });
    expect(antecedenteCirurgico(d)).toEqual([]);
    expect(sentinelaPaciente(d)).toEqual([]);
    // E a tela distingue — é o teste acima que prova isso. Aqui o ponto é
    // que as REGRAS não afirmam nada a partir de uma lista marcada.
    expect(resumoLocalPaciente("T1", d, [], [])).not.toMatch(/Antecedente cirúrgico/);
  });
});

// ── ANTECEDENTE É PASSADO ───────────────────────────────────
//
// 🔴 ACHADO CAMINHANDO PELO DEMO (09/10/2026), não por teste.
// Ordenado só por data, uma cirurgia AGENDADA para dezembro encabeçava a
// seção e vinha ACIMA da que aconteceu em outubro. Quem bate o olho lê
// "este paciente fez uma colecistectomia" — e não fez: está marcada. E o
// título contava as três juntas, inflando o histórico de quem lê a anamnese.
describe("🔴 o que aconteceu vem antes do que está marcado", () => {
  const feita = { ...CIR, id: 7, data: "2026-10-08", inicio_cirurgia_em: "2026-10-08T12:00:00Z" };
  const marcada = { ...CIR, id: 5, data: "2026-12-15", status: "agendada",
                    entrada_sala_em: null, inicio_cirurgia_em: null, procedimento: "Colecistectomia" };
  const cancelada = { ...CIR, id: 4, data: "2026-09-01", status: "cancelada",
                      entrada_sala_em: null, inicio_cirurgia_em: null };

  it("a agendada do futuro NÃO encabeça o antecedente", () => {
    const a = antecedenteCirurgico(base({ cirurgias: [marcada, feita, cancelada] }));
    expect(a.map(x => x.id)).toEqual([7, 5, 4]);
    // E o primeiro item é um ato, não uma promessa.
    expect(a[0].semAto).toBe(false);
  });

  it("entre as que aconteceram, a mais recente primeiro — é o que a anamnese procura", () => {
    const antiga = { ...feita, id: 2, data: "2019-03-03", inicio_cirurgia_em: "2019-03-03T12:00:00Z" };
    const a = antecedenteCirurgico(base({ cirurgias: [antiga, feita] }));
    expect(a.map(x => x.id)).toEqual([7, 2]);
  });

  it("entre as marcadas, a mais PRÓXIMA primeiro — é a que importa", () => {
    const longe = { ...marcada, id: 9, data: "2027-06-01" };
    const a = antecedenteCirurgico(base({ cirurgias: [longe, marcada] }));
    expect(a.map(x => x.id)).toEqual([5, 9]);
  });

  it("🔴 a contagem do título é só do que o paciente FEZ", () => {
    const a = antecedenteCirurgico(base({ cirurgias: [marcada, feita, cancelada] }));
    expect(a).toHaveLength(3);
    expect(quantasOperou(a)).toBe(1);
  });

  it("sem nada, a contagem é zero e não quebra", () => {
    expect(quantasOperou([])).toBe(0);
    expect(quantasOperou()).toBe(0);
  });
});
