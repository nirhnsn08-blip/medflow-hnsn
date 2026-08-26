// ═══════════════════════════════════════════════════════════
// UNIFICAÇÃO DE PRONTUÁRIO
//
// 🔴 O QUE ESTE ARQUIVO GUARDA são as RECUSAS. Unificar duas fichas da
// mesma pessoa conserta um histórico partido; unificar duas pessoas
// diferentes cria o pior erro que este sistema pode produzir — a partir
// dali a prescrição de uma vale para a outra.
//
// Por isso o que separa pessoas (gêmeos, CPF distinto, CNS distinto) é
// ERRO, não aviso: aviso se fecha sem ler.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  podeUnificar, prontuarioVigente, foiUnificado, avisoDaFichaUnificada,
  avisoDaFichaDestino, prontuariosDaPessoa, MOTIVO_MIN,
} from "./unificacao.js";

const MOTIVO = "mesma pessoa — veio sem documento na emergência e com CPF depois";
const p = (prontuario, extra = {}) => ({ prontuario, ...extra });

describe("o que a unificação RECUSA", () => {
  it("🔴 GÊMEOS — a recusa mais importante do arquivo", () => {
    // DNVs diferentes provam dois nascimentos. Para o detector de duplicata
    // eles são 90% a mesma pessoa; unificar juntaria dois bebês numa ficha.
    const a = p("9064", { nome_completo: "RN 1 DE MARIA", nome_mae: "Maria Silva",
                          data_nascimento: "2026-08-01", dnv: "111", ordem_nascimento: 1 });
    const b = p("9065", { nome_completo: "RN 2 DE MARIA", nome_mae: "Maria Silva",
                          data_nascimento: "2026-08-01", dnv: "222", ordem_nascimento: 2 });
    const r = podeUnificar({ origem: a, destino: b, motivo: MOTIVO });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/MESMO PARTO/);
    // e recusa é recusa: não aparece como aviso a ignorar
    expect(r.avisos.join(" ")).not.toMatch(/parto/i);
  });

  it("dois CPFs diferentes são duas pessoas — não é palpite", () => {
    const r = podeUnificar({
      origem: p("A", { cpf: "529.982.247-25" }),
      destino: p("B", { cpf: "111.444.777-35" }),
      motivo: MOTIVO,
    });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/CPFs DIFERENTES/);
  });

  it("dois Cartões SUS diferentes idem", () => {
    const r = podeUnificar({
      origem: p("A", { cns: "700000000000000" }),
      destino: p("B", { cns: "700000000000001" }),
      motivo: MOTIVO,
    });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/cartões DIFERENTES/i);
  });

  it("⚠️ mas CPF só de UM lado não recusa — é o caso mais comum de duplicata", () => {
    // Veio sem documento, depois voltou com ele. Recusar aqui mataria a
    // funcionalidade justamente no cenário que ela existe para resolver.
    const r = podeUnificar({
      origem: p("A"), destino: p("B", { cpf: "529.982.247-25" }), motivo: MOTIVO,
    });
    expect(r.ok).toBe(true);
  });

  it("não cria cadeia: o destino tem que ser o fim da linha", () => {
    const r = podeUnificar({
      origem: p("A"), destino: p("B", { unificado_para: "C" }), motivo: MOTIVO,
    });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/já foi unificado em C/);
    expect(r.erros.join(" ")).toMatch(/Unifique em C/);
  });

  it("nem unifica de novo o que já foi unificado", () => {
    const r = podeUnificar({
      origem: p("A", { unificado_para: "Z" }), destino: p("B"), motivo: MOTIVO,
    });
    expect(r.ok).toBe(false);
  });

  it("o mesmo prontuário duas vezes", () => {
    expect(podeUnificar({ origem: p("A"), destino: p("A"), motivo: MOTIVO }).ok).toBe(false);
  });

  it("falta escolher um dos dois", () => {
    expect(podeUnificar({ origem: p("A"), motivo: MOTIVO }).ok).toBe(false);
    expect(podeUnificar({ destino: p("B"), motivo: MOTIVO }).ok).toBe(false);
    expect(podeUnificar().ok).toBe(false);
  });

  it("motivo vazio ou curto demais — é o que alguém lê numa auditoria", () => {
    expect(MOTIVO_MIN).toBe(15);
    expect(podeUnificar({ origem: p("A"), destino: p("B"), motivo: "" }).ok).toBe(false);
    expect(podeUnificar({ origem: p("A"), destino: p("B"), motivo: "duplicado" }).ok).toBe(false);
    expect(podeUnificar({ origem: p("A"), destino: p("B"), motivo: "x".repeat(15) }).ok).toBe(true);
  });
});

describe("o que a unificação AVISA sem impedir", () => {
  const base = { origem: p("A"), destino: p("B"), motivo: MOTIVO };

  it("datas de nascimento diferentes", () => {
    const r = podeUnificar({
      ...base,
      origem: p("A", { data_nascimento: "1980-05-02" }),
      destino: p("B", { data_nascimento: "1980-05-20" }),
    });
    expect(r.ok).toBe(true);
    expect(r.avisos.join(" ")).toMatch(/datas de nascimento são diferentes/);
  });

  it("sexo e nome da mãe diferentes", () => {
    const r = podeUnificar({
      ...base,
      origem: p("A", { sexo: "F", nome_mae: "Maria Silva" }),
      destino: p("B", { sexo: "M", nome_mae: "Joana Souza" }),
    });
    expect(r.ok).toBe(true);
    expect(r.avisos.join(" ")).toMatch(/sexo registrado é diferente/);
    expect(r.avisos.join(" ")).toMatch(/nome da mãe é diferente/);
  });

  it("dois óbitos são duas pessoas", () => {
    const r = podeUnificar({ ...base, origem: p("A", { obito: true }), destino: p("B", { obito: true }) });
    expect(r.avisos.join(" ")).toMatch(/dois óbitos/i);
  });

  it("⚠️ e CALA quando os dados batem — aviso que sempre acende ensina a ignorar", () => {
    const r = podeUnificar({
      origem: p("A", { data_nascimento: "1980-05-02", sexo: "F", nome_mae: "Maria Silva" }),
      destino: p("B", { data_nascimento: "1980-05-02", sexo: "F", nome_mae: "Maria Silva" }),
      motivo: MOTIVO,
    });
    expect(r.ok).toBe(true);
    expect(r.avisos).toEqual([]);
  });

  it("campo em branco de um lado não vira aviso — vazio não contradiz nada", () => {
    const r = podeUnificar({
      origem: p("A", { sexo: "", nome_mae: "", data_nascimento: "" }),
      destino: p("B", { sexo: "M", nome_mae: "Joana", data_nascimento: "1980-05-02" }),
      motivo: MOTIVO,
    });
    expect(r.avisos).toEqual([]);
  });
});

describe("as duas pontas se enxergam", () => {
  it("o número que vale segue o ponteiro", () => {
    expect(prontuarioVigente(p("A", { unificado_para: "B" }))).toBe("B");
    expect(prontuarioVigente(p("A"))).toBe("A");
    expect(prontuarioVigente(null)).toBe("");
    expect(foiUnificado(p("A", { unificado_para: "B" }))).toBe(true);
    expect(foiUnificado(p("A"))).toBe(false);
  });

  it("a ficha unificada diz para onde olhar — e que o que está nela fica", () => {
    const av = avisoDaFichaUnificada(p("A", { unificado_para: "B" }));
    expect(av.para).toBe("B");
    expect(av.texto).toMatch(/unificado em B/);
    expect(avisoDaFichaUnificada(p("A"))).toBeNull();
  });

  it("🔴 e a ficha que SOBREVIVEU diz que existe histórico embaixo de outro número", () => {
    // Sem esta ponta o ponteiro seria de mão única: quem abre o prontuário
    // certo não saberia da outra ficha — que é o problema inteiro.
    const av = avisoDaFichaDestino([p("A"), p("C")]);
    expect(av.prontuarios).toEqual(["A", "C"]);
    expect(av.texto).toMatch(/A, C/);
    expect(av.texto).toMatch(/continua no número de origem/);
    expect(avisoDaFichaDestino([])).toBeNull();
    expect(avisoDaFichaDestino(null)).toBeNull();
  });

  it("os números por onde esta pessoa pode ter histórico", () => {
    expect(prontuariosDaPessoa(p("B"), [p("A"), p("C")])).toEqual(["B", "A", "C"]);
    expect(prontuariosDaPessoa(p("B"), [])).toEqual(["B"]);
    expect(prontuariosDaPessoa(p("B"), [p("B")])).toEqual(["B"]);   // sem repetir
  });
});
