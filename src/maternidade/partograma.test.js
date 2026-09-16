import { describe, it, expect } from "vitest";
import { horasEntre, horaAlertaDe, zonaPorAtraso, avaliarPartograma, ZONA } from "./partograma.js";

// Horas do dia (UTC) → ISO. A diferença entre dois é o que importa, não o fuso.
const at = h => `2026-09-10T${String(h).padStart(2, "0")}:00:00Z`;
const reg = (h, cm) => ({ data_hora: at(h), dilatacao: cm });

describe("horasEntre", () => {
  it("conta horas fracionárias e devolve null para lixo", () => {
    expect(horasEntre(at(8), at(10))).toBe(2);
    expect(horasEntre("ontem", at(10))).toBeNull();
  });
});

describe("horaAlertaDe", () => {
  it("é (cm − referência) / 1cm por hora", () => {
    expect(horaAlertaDe(5, 4)).toBe(1);
    expect(horaAlertaDe(10, 4)).toBe(6);
    expect(horaAlertaDe(10, 5)).toBe(5);   // referência 5 (OMS recente)
  });
});

describe("zonaPorAtraso", () => {
  it("abaixo da referência é fase latente (a alerta nem começou)", () => {
    expect(zonaPorAtraso(0, 3, 4)).toBe(ZONA.LATENTE);
  });
  it("em cima da alerta é normal", () => {
    expect(zonaPorAtraso(1, 5, 4)).toBe(ZONA.NORMAL);   // alerta esperava 5 na hora 1
  });
  it("entre alerta e ação é alerta", () => {
    expect(zonaPorAtraso(4, 5, 4)).toBe(ZONA.ALERTA);   // atraso 3h
  });
  it("a borda de 4h ainda é alerta; passou vira ação", () => {
    expect(zonaPorAtraso(5, 5, 4)).toBe(ZONA.ALERTA);   // atraso exatamente 4h
    expect(zonaPorAtraso(6, 5, 4)).toBe(ZONA.ACAO);     // atraso 5h
  });
});

describe("avaliarPartograma", () => {
  it("série vazia: sem zona, sem linhas — 'não dá para dizer'", () => {
    const r = avaliarPartograma([]);
    expect(r.t0).toBeNull();
    expect(r.zonaAtual).toBeNull();
    expect(r.pontos).toEqual([]);
    expect(r.cruzouAlerta).toBe(false);
    expect(r.linhaAlerta).toEqual([]);
  });

  it("tudo em fase latente: nenhum ponto abre a fase ativa", () => {
    const r = avaliarPartograma([reg(6, 3), reg(7, 3)]);
    expect(r.t0).toBeNull();
    expect(r.zonaAtual).toBeNull();
    expect(r.pontos.every(p => p.zona === ZONA.LATENTE)).toBe(true);
  });

  it("progressão normal (≥1cm/h): tudo normal, não cruza alerta", () => {
    const r = avaliarPartograma([reg(8, 4), reg(9, 5), reg(11, 7)]);
    expect(r.t0).toBe("2026-09-10T08:00:00.000Z");
    expect(r.zonaAtual).toBe(ZONA.NORMAL);
    expect(r.cruzouAlerta).toBe(false);
    expect(r.duracaoHoras).toBe(3);
  });

  it("progressão lenta cruza alerta e depois ação", () => {
    const r = avaliarPartograma([reg(8, 4), reg(12, 5), reg(16, 5)]);
    expect(r.cruzouAlerta).toBe(true);
    expect(r.cruzouAcao).toBe(true);
    expect(r.zonaAtual).toBe(ZONA.ACAO);
  });

  it("latente ANTES da ativa: o 1º toque ≥ referência é o t0", () => {
    const r = avaliarPartograma([reg(6, 3), reg(8, 4), reg(9, 5)]);
    expect(r.t0).toBe("2026-09-10T08:00:00.000Z");
    expect(r.pontos[0].zona).toBe(ZONA.LATENTE);      // 3 cm
    expect(r.pontos[1].zona).toBe(ZONA.NORMAL);       // 4 cm, hora 0
    expect(r.zonaAtual).toBe(ZONA.NORMAL);
  });

  it("desenha as linhas de alerta e ação (referência 4 → 10 cm)", () => {
    const r = avaliarPartograma([reg(8, 4)]);
    expect(r.linhaAlerta).toEqual([{ horas: 0, cm: 4 }, { horas: 6, cm: 10 }]);
    expect(r.linhaAcao).toEqual([{ horas: 4, cm: 4 }, { horas: 10, cm: 10 }]);
  });

  it("respeita uma referência alternativa (5 cm)", () => {
    // 5 cm às 8h abre a ativa; 6 cm às 9h ainda é normal (alerta esperava 6 na hora 1).
    const r = avaliarPartograma([reg(8, 5), reg(9, 6)], { referenciaCm: 5 });
    expect(r.t0).toBe("2026-09-10T08:00:00.000Z");
    expect(r.zonaAtual).toBe(ZONA.NORMAL);
  });
});
