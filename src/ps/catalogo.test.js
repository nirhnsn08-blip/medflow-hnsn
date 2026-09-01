// ═══════════════════════════════════════════════════════════
// PRONTO-SOCORRO — CATÁLOGO
//
// 🔴 AS CHAVES SÃO CONTRATO COM O BANCO, não rótulo de tela.
// `vermelho`, `laranja`, `amarelo`, `verde`, `azul` são gravados em
// `ps_atendimentos.classificacao`; os desfechos em `.desfecho`. Trocar uma
// chave aqui não quebra nada visível: o valor já gravado deixa de casar e a
// tela mostra vazio no lugar do rótulo, ou perde a cor da gravidade.
//
// E os TEMPOS-ALVO do Manchester não são preferência de casa: são o
// protocolo. Afrouxar um deles faz o indicador de "dentro do alvo" melhorar
// sem que nada tenha melhorado no atendimento.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  MANCHESTER, PS_DESFECHOS, PS_PRIORIDADE, PS_CONSCIENCIA,
  PS_VIAS, PS_DOSE_UNID, PS_FREQUENCIAS, PS_AREAS, PS_SALA_STATUS,
  PS_EXAME_CATEGORIAS, PS_EVOL_CATEGORIAS, PS_ADM_STATUS, PS_ADM_MOTIVOS,
  PS_DISCRIMINADORES, PS_PROTOCOLO, fmtSinaisVitais,
} from "./catalogo.js";

describe("🔴 Manchester — as cinco cores e os tempos-alvo", () => {
  it("são exatamente cinco, com estas chaves", () => {
    expect(Object.keys(MANCHESTER)).toEqual(["vermelho", "laranja", "amarelo", "verde", "azul"]);
  });

  it("os tempos-alvo são os do protocolo: 0, 10, 60, 120, 240", () => {
    // Afrouxar um alvo faz o indicador de "dentro do alvo" melhorar sem que
    // nada tenha melhorado no atendimento — a pior forma de mentir num
    // painel de qualidade.
    expect(Object.values(MANCHESTER).map(m => m.alvoMin)).toEqual([0, 10, 60, 120, 240]);
  });

  it("⚠️ o alvo cresce com a cor, sempre", () => {
    // Se uma cor mais grave ganhar alvo maior que a menos grave, a fila
    // inverte e ninguém percebe olhando a tela.
    const alvos = Object.values(MANCHESTER).map(m => m.alvoMin);
    for (let i = 1; i < alvos.length; i++) expect(alvos[i]).toBeGreaterThan(alvos[i - 1]);
  });

  it("cada cor tem rótulo, cor e descrição — a tela lê os três", () => {
    for (const [k, v] of Object.entries(MANCHESTER)) {
      for (const campo of ["label", "atend", "cor", "bg", "desc"]) {
        expect(v[campo], `${k}.${campo}`).toBeTruthy();
      }
    }
  });

  it("🔴 a prioridade de ordenação segue a gravidade, e cobre as cinco", () => {
    // `PS_PRIORIDADE` ordena a fila. Uma cor fora dele viraria `undefined`
    // na comparação e cairia para o fim — o vermelho por último.
    expect(Object.keys(PS_PRIORIDADE).sort()).toEqual(Object.keys(MANCHESTER).sort());
    expect(Object.keys(MANCHESTER).map(k => PS_PRIORIDADE[k])).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("desfechos", () => {
  it("as cinco saídas possíveis, com as chaves que o banco grava", () => {
    expect(Object.keys(PS_DESFECHOS)).toEqual(["alta", "internacao", "transferencia", "evasao", "obito"]);
  });

  it("⚠️ `evasao` continua existindo — é o desfecho que NÃO gera conta", () => {
    // src/atendimento/faturavel.js decide o faturamento por esta chave.
    // Renomear aqui faria a evasão passar a gerar conta, calada.
    expect(PS_DESFECHOS.evasao).toBeTruthy();
  });

  it("cada desfecho tem rótulo e cor", () => {
    for (const [k, v] of Object.entries(PS_DESFECHOS)) {
      expect(v.label, k).toBeTruthy();
      expect(v.cor, k).toMatch(/^#/);
    }
  });
});

describe("as listas que viram <option> na tela", () => {
  it.each([
    ["PS_VIAS", PS_VIAS], ["PS_DOSE_UNID", PS_DOSE_UNID],
    ["PS_AREAS", PS_AREAS], ["PS_ADM_MOTIVOS", PS_ADM_MOTIVOS],
  ])("%s não tem vazio nem repetido", (_n, lista) => {
    expect(lista.length).toBeGreaterThan(0);
    expect(lista.every(x => typeof x === "string" && x.trim())).toBe(true);
    expect(new Set(lista).size, "há item repetido").toBe(lista.length);
  });

  it.each([
    ["PS_CONSCIENCIA", PS_CONSCIENCIA], ["PS_SALA_STATUS", PS_SALA_STATUS],
    ["PS_EXAME_CATEGORIAS", PS_EXAME_CATEGORIAS], ["PS_EVOL_CATEGORIAS", PS_EVOL_CATEGORIAS],
    ["PS_ADM_STATUS", PS_ADM_STATUS], ["PS_PROTOCOLO", PS_PROTOCOLO],
  ])("%s tem chave e valor em todas as entradas", (_n, mapa) => {
    expect(Object.keys(mapa).length).toBeGreaterThan(0);
    for (const [k, v] of Object.entries(mapa)) {
      expect(k.trim()).toBeTruthy();
      expect(v, k).toBeTruthy();
    }
  });

  it("as frequências trazem doses por dia — é o que a dose máxima usa", () => {
    // `freqDia` lê `dia` para conferir dose máxima diária. Uma frequência
    // sem `dia` faz a conferência pular aquele item, em silêncio.
    for (const f of PS_FREQUENCIAS) {
      expect(f.label, JSON.stringify(f)).toBeTruthy();
      expect(f, JSON.stringify(f)).toHaveProperty("dia");
    }
  });

  it("os discriminadores da triagem têm nome e explicação", () => {
    expect(PS_DISCRIMINADORES.length).toBeGreaterThan(3);
    for (const d of PS_DISCRIMINADORES) {
      expect(d.nome).toBeTruthy();
      expect(d.desc, d.nome).toBeTruthy();
    }
  });
});

describe("fmtSinaisVitais", () => {
  it("formata o que foi medido e omite o que não foi", () => {
    const t = fmtSinaisVitais({ pa_sist: 120, pa_diast: 80, fc: 88 });
    expect(t).toContain("120");
    expect(t).toContain("88");
  });

  it("⚠️ sem nenhum sinal não inventa texto", () => {
    for (const vazio of [{}, null, undefined]) {
      const t = fmtSinaisVitais(vazio);
      expect(typeof t === "string" || t == null, JSON.stringify(vazio)).toBe(true);
      if (typeof t === "string") expect(t).not.toMatch(/undefined|NaN|null/);
    }
  });

  it("🔴 e nunca imprime NaN ou undefined com valor sujo", () => {
    // Sinal vital escrito com vírgula, ou campo vazio vindo do formulário:
    // "NaN mmHg" numa tela de PS é pior que campo em branco.
    const t = fmtSinaisVitais({ pa_sist: "", pa_diast: null, fc: "", temp: "36,5", spo2: undefined, consciencia: "Z" });
    expect(t).not.toMatch(/NaN|undefined|null/);
  });
});
