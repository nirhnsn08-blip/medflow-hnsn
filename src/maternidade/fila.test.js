import { describe, it, expect } from "vitest";
import { montarFilaObstetrica, ehSetorMaternidade, severidadeTriagem, ESTADO, ORIGEM } from "./fila.js";

const psObst = (o = {}) => ({
  id: 1, iniciais: "M.S.", prontuario: null, queixa: "contrações",
  chegada_em: "2026-09-10T08:00:00Z", classificacao: "amarelo",
  desfecho: null, status: "em_atendimento", triagem_tipo: "obstetrica", gestante: true, ...o,
});
const leitoMat = (o = {}) => ({
  identificacao: "300", status: "ocupado", iniciais: "A.B.", prontuario: null,
  motivo: "trabalho de parto", data_internacao: "2026-09-10", setor: "Maternidade", ...o,
});

describe("ehSetorMaternidade", () => {
  it("casa maternidade / obstetrícia / alojamento conjunto por padrão", () => {
    expect(ehSetorMaternidade("Maternidade")).toBe(true);
    expect(ehSetorMaternidade("Centro Obstétrico")).toBe(true);
    expect(ehSetorMaternidade("obstetrica")).toBe(true);
    expect(ehSetorMaternidade("Alojamento Conjunto")).toBe(true);
    expect(ehSetorMaternidade("UTI Adulto")).toBe(false);
    expect(ehSetorMaternidade("")).toBe(false);
    expect(ehSetorMaternidade(null)).toBe(false);
  });
  it("com lista de configuração, casa só os nomes dados (sem case)", () => {
    expect(ehSetorMaternidade("Ala Rosa", ["ala rosa"])).toBe(true);
    expect(ehSetorMaternidade("Maternidade", ["ala rosa"])).toBe(false);
  });
});

describe("severidadeTriagem", () => {
  it("vermelho é o mais grave; sem triagem vai por último", () => {
    expect(severidadeTriagem("vermelho")).toBeLessThan(severidadeTriagem("amarelo"));
    expect(severidadeTriagem("amarelo")).toBeLessThan(severidadeTriagem("azul"));
    expect(severidadeTriagem(null)).toBeGreaterThan(severidadeTriagem("azul"));
    expect(severidadeTriagem("VERMELHO")).toBe(severidadeTriagem("vermelho"));
  });
});

describe("montarFilaObstetrica — fontes", () => {
  it("entra vazio devolve lista vazia (nada de fingir)", () => {
    expect(montarFilaObstetrica()).toEqual([]);
    expect(montarFilaObstetrica({ ps: [], leitos: [], episodiosAbertos: [] })).toEqual([]);
  });

  it("PS: só triagem obstétrica entra", () => {
    const fila = montarFilaObstetrica({ ps: [
      psObst({ id: 1 }),
      psObst({ id: 2, triagem_tipo: "adulto", gestante: false }),
    ] });
    expect(fila).toHaveLength(1);
    expect(fila[0].psId).toBe(1);
    expect(fila[0].origem).toBe(ORIGEM.PS);
  });

  it("PS: gestante=true entra mesmo sem triagem_tipo obstetrica", () => {
    const fila = montarFilaObstetrica({ ps: [psObst({ triagem_tipo: "adulto", gestante: true })] });
    expect(fila).toHaveLength(1);
  });

  it("PS: quem saiu (alta/evasão/óbito/transferência) ou já internou não é mais fila", () => {
    for (const desfecho of ["alta", "evasao", "obito", "transferencia", "internacao"]) {
      const fila = montarFilaObstetrica({ ps: [psObst({ desfecho, status: "finalizado" })] });
      expect(fila, `desfecho ${desfecho}`).toEqual([]);
    }
  });

  it("Leitos: só ocupados do setor maternidade entram", () => {
    const fila = montarFilaObstetrica({ leitos: [
      leitoMat({ identificacao: "300" }),
      leitoMat({ identificacao: "301", status: "livre" }),
      leitoMat({ identificacao: "UTI-1", setor: "UTI Adulto" }),
    ] });
    expect(fila).toHaveLength(1);
    expect(fila[0].leito).toBe("300");
    expect(fila[0].origem).toBe(ORIGEM.LEITO);
  });
});

describe("montarFilaObstetrica — identidade e dedup", () => {
  it("mesma paciente no PS e no leito (mesmo prontuário) vira UMA linha, origem ambos, com o leito", () => {
    const fila = montarFilaObstetrica({
      ps: [psObst({ prontuario: "48213", classificacao: "laranja" })],
      leitos: [leitoMat({ prontuario: "48213", identificacao: "300" })],
    });
    expect(fila).toHaveLength(1);
    expect(fila[0].origem).toBe(ORIGEM.AMBOS);
    expect(fila[0].leito).toBe("300");
    expect(fila[0].triagem).toBe("laranja");   // a triagem vem do PS
  });

  it("NÃO funde por iniciais: duas linhas sem prontuário ficam separadas", () => {
    const fila = montarFilaObstetrica({
      ps: [psObst({ iniciais: "M.S.", prontuario: null })],
      leitos: [leitoMat({ iniciais: "M.S.", prontuario: null })],
    });
    expect(fila).toHaveLength(2);
    expect(new Set(fila.map(f => f.chave)).size).toBe(2);
  });
});

describe("montarFilaObstetrica — estado", () => {
  it("com episódio aberto → admitida (leva o id do episódio)", () => {
    const fila = montarFilaObstetrica({
      ps: [psObst({ prontuario: "100" })],
      episodiosAbertos: [{ id: 77, prontuario: "100", status: "em_andamento" }],
    });
    expect(fila[0].estado).toBe(ESTADO.ADMITIDA);
    expect(fila[0].episodioId).toBe(77);
  });
  it("com prontuário mas sem episódio → aguardando admissão", () => {
    const fila = montarFilaObstetrica({ ps: [psObst({ prontuario: "100" })] });
    expect(fila[0].estado).toBe(ESTADO.AGUARDANDO);
    expect(fila[0].episodioId).toBe(null);
  });
  it("sem prontuário → sem_prontuario (admitir vai exigir cadastrar)", () => {
    const fila = montarFilaObstetrica({ ps: [psObst({ prontuario: null })] });
    expect(fila[0].estado).toBe(ESTADO.SEM_PRONTUARIO);
  });
});

describe("montarFilaObstetrica — ordenação", () => {
  it("quem falta admitir vem antes das já admitidas", () => {
    const fila = montarFilaObstetrica({
      ps: [
        psObst({ id: 1, prontuario: "A", classificacao: "azul" }),
        psObst({ id: 2, prontuario: "B", classificacao: "azul" }),
      ],
      episodiosAbertos: [{ id: 9, prontuario: "A", status: "em_andamento" }],
    });
    expect(fila.map(f => f.estado)).toEqual([ESTADO.AGUARDANDO, ESTADO.ADMITIDA]);
    expect(fila[0].prontuario).toBe("B");
  });

  it("dentro do grupo, triagem mais grave no topo; empate vai por espera mais longa", () => {
    const fila = montarFilaObstetrica({ ps: [
      psObst({ id: 1, prontuario: "1", classificacao: "amarelo", chegada_em: "2026-09-10T09:00:00Z" }),
      psObst({ id: 2, prontuario: "2", classificacao: "vermelho", chegada_em: "2026-09-10T10:00:00Z" }),
      psObst({ id: 3, prontuario: "3", classificacao: "amarelo", chegada_em: "2026-09-10T07:00:00Z" }),
    ] });
    // vermelho primeiro; entre os dois amarelos, o que chegou mais cedo (07h) antes do (09h)
    expect(fila.map(f => f.prontuario)).toEqual(["2", "3", "1"]);
  });
});
