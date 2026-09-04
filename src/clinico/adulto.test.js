// ═══════════════════════════════════════════════════════════
// SINAIS VITAIS DO ADULTO — Manchester
//
// 🔴 ESTA FUNÇÃO VIVEU SEM TESTE dentro de `PsPage.jsx`, enquanto as duas
// que a ESPELHAM (`pediatria.js`, `obstetricia.js`) sempre tiveram. O
// espelho era conferido; o original, não.
//
// Cada limite aqui decide quem passa na frente na fila do Pronto-Socorro.
// Um número errado não aparece em tela nenhuma — aparece na espera de
// alguém que deveria ter sido atendido antes.
//
// ⚠️ OS TESTES USAM O NÚMERO LITERAL, nunca uma constante importada da
// própria função. Testar a fronteira contra a constante que a define faz o
// teste se mover junto com o erro — foi assim que uma mutação passou verde
// na fronteira de 80 anos do idoso, em agosto.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { avaliarSinaisVitais } from "./adulto.js";

const nivel = v => avaliarSinaisVitais(v).sugestao;
const motivos = v => avaliarSinaisVitais(v).motivos.map(m => m.texto).join(" | ");

describe("🔴 ficha em branco NÃO é verde", () => {
  it("sem nenhum sinal medido, a sugestão é `null`", () => {
    // Verde mandaria para o fim da fila quem ninguém mediu ainda. `null`
    // diz "não sei", que é a verdade, e a triadora decide.
    expect(avaliarSinaisVitais({})).toEqual({ sugestao: null, motivos: [] });
    expect(nivel({ spo2: "", fr: "", fc: "", pa_sist: "", temp: "", dor: "", glicemia: "" })).toBe(null);
  });

  it("um único sinal medido já produz sugestão", () => {
    expect(nivel({ fc: 70 })).toBe("verde");
  });

  it("só o nível de consciência já basta", () => {
    expect(nivel({ consciencia: "A" })).toBe("verde");
  });
});

describe("🔴 consciência (AVPU) — o mais grave de todos", () => {
  it("U (inconsciente) é VERMELHO", () => {
    expect(nivel({ consciencia: "U" })).toBe("vermelho");
    expect(motivos({ consciencia: "U" })).toMatch(/Inconsciente/);
  });

  it("D (responde à dor) e V (responde à voz) são LARANJA", () => {
    expect(nivel({ consciencia: "D" })).toBe("laranja");
    expect(nivel({ consciencia: "V" })).toBe("laranja");
  });

  it("A (alerta) não dispara nada", () => {
    expect(motivos({ consciencia: "A", fc: 70 })).not.toMatch(/AVPU/);
  });
});

describe("🔴 saturação — as três fronteiras", () => {
  it("abaixo de 85 é vermelho", () => {
    expect(nivel({ spo2: 84 })).toBe("vermelho");
  });
  it("85 já NÃO é vermelho — é laranja", () => {
    // A fronteira exata: 84 e 85 mandam o paciente para filas diferentes.
    expect(nivel({ spo2: 85 })).toBe("laranja");
  });
  it("91 é laranja, 92 é amarelo", () => {
    expect(nivel({ spo2: 91 })).toBe("laranja");
    expect(nivel({ spo2: 92 })).toBe("amarelo");
  });
  it("94 é amarelo, 95 não dispara", () => {
    expect(nivel({ spo2: 94 })).toBe("amarelo");
    expect(nivel({ spo2: 95 })).toBe("verde");
  });
});

describe("frequência respiratória", () => {
  it("abaixo de 8 e acima de 35 são vermelhos", () => {
    expect(nivel({ fr: 7 })).toBe("vermelho");
    expect(nivel({ fr: 36 })).toBe("vermelho");
  });
  it("8 e 35 ainda NÃO são vermelhos", () => {
    expect(nivel({ fr: 8 })).toBe("laranja");
    expect(nivel({ fr: 35 })).toBe("laranja");
  });
  it("9 é laranja, 25 é laranja", () => {
    expect(nivel({ fr: 9 })).toBe("laranja");
    expect(nivel({ fr: 25 })).toBe("laranja");
  });
  it("21 a 24 é amarelo", () => {
    expect(nivel({ fr: 21 })).toBe("amarelo");
    expect(nivel({ fr: 24 })).toBe("amarelo");
  });
  it("faixa normal não dispara", () => {
    expect(nivel({ fr: 16 })).toBe("verde");
  });
});

describe("frequência cardíaca", () => {
  it("abaixo de 40 e acima de 150 são vermelhos", () => {
    expect(nivel({ fc: 39 })).toBe("vermelho");
    expect(nivel({ fc: 151 })).toBe("vermelho");
  });
  it("40 e 150 ainda não são vermelhos", () => {
    expect(nivel({ fc: 40 })).toBe("laranja");
    expect(nivel({ fc: 150 })).toBe("laranja");
  });
  it("49 e 121 são laranja", () => {
    expect(nivel({ fc: 49 })).toBe("laranja");
    expect(nivel({ fc: 121 })).toBe("laranja");
  });
  it("59 e 100 são amarelo", () => {
    expect(nivel({ fc: 59 })).toBe("amarelo");
    expect(nivel({ fc: 100 })).toBe("amarelo");
  });
  it("60 a 99 não dispara", () => {
    expect(nivel({ fc: 60 })).toBe("verde");
    expect(nivel({ fc: 99 })).toBe("verde");
  });
});

describe("🔴 pressão sistólica — dos dois lados", () => {
  it("abaixo de 80 é vermelho e fala em choque", () => {
    expect(nivel({ pa_sist: 79 })).toBe("vermelho");
    expect(motivos({ pa_sist: 79 })).toMatch(/choque/i);
  });
  it("80 a 89 é laranja; 90 a 99, amarelo", () => {
    expect(nivel({ pa_sist: 80 })).toBe("laranja");
    expect(nivel({ pa_sist: 89 })).toBe("laranja");
    expect(nivel({ pa_sist: 90 })).toBe("amarelo");
    expect(nivel({ pa_sist: 99 })).toBe("amarelo");
  });
  it("⚠️ pressão ALTA também classifica — 220 é crise hipertensiva", () => {
    // O lado que se esquece: hipotensão assusta, hipertensão grave também
    // mata. 220 é laranja, não "só um pouco alta".
    expect(nivel({ pa_sist: 220 })).toBe("laranja");
    expect(motivos({ pa_sist: 220 })).toMatch(/crise hipertensiva/i);
  });
  it("180 a 219 é amarelo", () => {
    expect(nivel({ pa_sist: 180 })).toBe("amarelo");
    expect(nivel({ pa_sist: 219 })).toBe("amarelo");
  });
  it("100 a 179 não dispara", () => {
    expect(nivel({ pa_sist: 120 })).toBe("verde");
    expect(nivel({ pa_sist: 179 })).toBe("verde");
  });
});

describe("temperatura", () => {
  it("hipotermia (<35) e hiperpirexia (≥40) são laranja", () => {
    expect(nivel({ temp: 34.9 })).toBe("laranja");
    expect(nivel({ temp: 40 })).toBe("laranja");
  });
  it("38.5 é febre alta (amarelo); 37.8 é febril (verde)", () => {
    expect(nivel({ temp: 38.5 })).toBe("amarelo");
    expect(nivel({ temp: 37.8 })).toBe("verde");
    expect(motivos({ temp: 37.8 })).toMatch(/febril/i);
  });
  it("37.7 não dispara motivo de febre", () => {
    expect(motivos({ temp: 37.7 })).not.toMatch(/febr/i);
  });
});

describe("dor e glicemia", () => {
  it("dor 8+ é laranja, 4 a 7 amarelo, 1 a 3 verde", () => {
    expect(nivel({ dor: 8 })).toBe("laranja");
    expect(nivel({ dor: 4 })).toBe("amarelo");
    expect(nivel({ dor: 1 })).toBe("verde");
  });
  it("⚠️ dor ZERO não vira motivo — ausência de dor não é achado", () => {
    expect(motivos({ dor: 0, fc: 70 })).not.toMatch(/Dor/);
  });
  it("hipoglicemia (<60) é laranja; acima de 400, amarelo", () => {
    expect(nivel({ glicemia: 59 })).toBe("laranja");
    expect(nivel({ glicemia: 401 })).toBe("amarelo");
    expect(nivel({ glicemia: 100 })).toBe("verde");
  });
});

describe("🔴 a sugestão é o PIOR nível, não o último nem a média", () => {
  it("um vermelho no meio de amarelos manda tudo para vermelho", () => {
    expect(nivel({ spo2: 84, temp: 38.5, dor: 5 })).toBe("vermelho");
  });

  it("e todos os motivos ficam listados, não só o pior", () => {
    const r = avaliarSinaisVitais({ spo2: 84, temp: 38.5, dor: 5 });
    expect(r.motivos.length).toBe(3);
    expect(r.sugestao).toBe("vermelho");
  });

  it("laranja ganha de amarelo e de verde", () => {
    expect(nivel({ fc: 121, temp: 38.5, dor: 2 })).toBe("laranja");
  });
});

describe("entradas estranhas não estouram nem inventam", () => {
  it("string vazia é 'não medido', não zero", () => {
    // Zero em PA sistólica seria vermelho por choque. String vazia é o que
    // um campo de formulário em branco entrega.
    expect(nivel({ pa_sist: "", fc: 70 })).toBe("verde");
    expect(motivos({ pa_sist: "", fc: 70 })).not.toMatch(/PA sist/);
  });

  it("nulo e indefinido também", () => {
    expect(nivel({ spo2: null, fc: 70 })).toBe("verde");
    expect(nivel({ spo2: undefined, fc: 70 })).toBe("verde");
  });

  it("número em texto é lido como número", () => {
    // O formulário entrega string.
    expect(nivel({ spo2: "84" })).toBe("vermelho");
    expect(nivel({ fc: "121" })).toBe("laranja");
  });

  it("chamada sem argumento não estoura", () => {
    expect(() => avaliarSinaisVitais({})).not.toThrow();
  });
});
