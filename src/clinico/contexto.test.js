// ═══════════════════════════════════════════════════════════
// O CONTEXTO CLÍNICO — fonte única
//
// 🔴 O QUE ESTE ARQUIVO PROTEGE
// A alergia registrada em `pep_alergias` — a mesma que sai impressa na
// pulseira do paciente — não chegava ao PS nem à Farmácia, porque as duas
// telas montavam o contexto à mão lendo só o texto livre do atendimento.
//
// E o segundo defeito, mais silencioso: leitura de alergia que FALHA não
// pode virar "sem alergia". É a única conferência deste sistema em que
// a ausência de resposta e a resposta "não há" levam a condutas opostas.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { alergiasDoPaciente, alergiasPorProntuario, contextoClinico } from "./contexto.js";
import { analisarPrescricaoClinica } from "./alertas.js";
import { FALHA } from "../util/leitura.js";

const reg = (extra = {}) => ({ id: 1, prontuario: "T900", agente: "Penicilina", substancia: "penicilina", situacao: "ativa", ...extra });
const atendimento = (extra = {}) => ({ idade: 40, peso: 78, clearance_renal: 106, alergias: "", em_sonda: false, gestante: false, comorbidades: [], ...extra });

describe("🔴 contextoClinico — a alergia estruturada chega ao motor", () => {
  it("🔴 alergia de `pep_alergias` entra no contexto, mesmo com o campo livre VAZIO", () => {
    // Era exatamente o buraco: o PS lia só `a.alergias`, que estava em branco.
    const ctx = contextoClinico(atendimento({ alergias: "" }), [reg()]);
    expect(ctx.alergias).toMatch(/penicilina/i);
  });

  it("funde as duas fontes sem duplicar", () => {
    const ctx = contextoClinico(atendimento({ alergias: "AAS" }), [reg()]);
    expect(ctx.alergias).toMatch(/penicilina/i);
    // ⚠️ o termo LEGADO chega normalizado (minúsculas, sem acento): é o que
    // `parseAlergias` sempre fez, e é assim que o motor compara.
    expect(ctx.alergias).toMatch(/aas/i);
  });

  it("⚠️ o texto livre sozinho continua valendo — prontuário antigo não some", () => {
    const ctx = contextoClinico(atendimento({ alergias: "Dipirona" }), []);
    expect(ctx.alergias).toMatch(/dipirona/i);
  });

  it("alergia refutada ou resolvida NÃO entra", () => {
    for (const situacao of ["refutada", "resolvida", "inativa"]) {
      const ctx = contextoClinico(atendimento(), [reg({ situacao })]);
      expect(ctx.alergias, situacao).toBe("");
    }
  });

  it('"nega alergias" não vira uma alergia chamada "nenhuma"', () => {
    const ctx = contextoClinico(atendimento(), [reg({ tipo: "nenhuma_conhecida", agente: "Nenhuma conhecida", substancia: null })]);
    expect(ctx.alergias).toBe("");
  });
});

describe("🔴 alergiasIncertas — não ler não é 'não tem'", () => {
  it("🔴 leitura FALHADA marca o contexto como incerto", () => {
    expect(contextoClinico(atendimento(), FALHA).alergiasIncertas).toBe(true);
  });

  it("🔴 lista vazia COMUM não marca nada — perguntou e não há", () => {
    // A distinção inteira. `[]` normal significa que a consulta voltou.
    expect(contextoClinico(atendimento(), []).alergiasIncertas).toBe(false);
  });

  it("com registros, não é incerto", () => {
    expect(contextoClinico(atendimento(), [reg()]).alergiasIncertas).toBe(false);
  });
});

describe("🔴 o motor AVISA quando não conferiu alergia", () => {
  const med = { id: 1, nome: "Amoxicilina 500 mg", principio_ativo: "Amoxicilina" };
  const catalogo = { 1: med };
  const item = { medicamento_id: 1, medicamento_nome: med.nome };
  const alertas = ctx => analisarPrescricaoClinica([item], ctx, catalogo, [], []);

  it("🔴 UM medicamento já basta para o aviso — alergia não precisa de par", () => {
    // O bloco de interações só avisa com dois medicamentos, porque sem par
    // não há o que conferir. Alergia não é assim: um único medicamento mata
    // quem tem alergia conhecida a ele.
    const r = alertas(contextoClinico(atendimento(), FALHA));
    expect(r.map(a => a.titulo)).toContain("Alergias NÃO conferidas");
    expect(r.find(a => a.titulo === "Alergias NÃO conferidas").gravidade).toBe("alta");
  });

  it("leitura boa e sem alergia NÃO gera aviso — não se avisa do que está certo", () => {
    const r = alertas(contextoClinico(atendimento(), []));
    expect(r.map(a => a.titulo)).not.toContain("Alergias NÃO conferidas");
  });

  it("⚠️ prescrição sem medicamento nenhum não avisa", () => {
    // Só cuidados ("manter em jejum") não tem o que conferir contra alergia.
    const r = analisarPrescricaoClinica([], contextoClinico(atendimento(), FALHA), catalogo, [], []);
    expect(r.map(a => a.titulo)).not.toContain("Alergias NÃO conferidas");
  });

  it("o aviso diz o que fazer, não o erro técnico", () => {
    const a = alertas(contextoClinico(atendimento(), FALHA)).find(x => x.titulo === "Alergias NÃO conferidas");
    expect(a.detalhe).toMatch(/confirme com o paciente|prontuário/i);
    expect(a.detalhe).not.toMatch(/fetch|HTTP|null|undefined/i);
  });
});

describe("🔴 a alergia estruturada BLOQUEIA a prescrição, como a do texto livre", () => {
  const med = { id: 1, nome: "Amoxicilina 500 mg", principio_ativo: "Amoxicilina" };
  const catalogo = { 1: med };
  const item = { medicamento_id: 1, medicamento_nome: med.nome };

  it("🔴 penicilina em `pep_alergias` dispara reatividade cruzada com amoxicilina", () => {
    // O caso concreto do relatório: alergia cadastrada no Paciente 360, o
    // médico prescreve amoxicilina no PS, e antes disso nada acontecia.
    const ctx = contextoClinico(atendimento({ alergias: "" }), [reg()]);
    const tipos = analisarPrescricaoClinica([item], ctx, catalogo, [], []).map(a => a.tipo);
    expect(tipos).toContain("alergia");
  });

  it("sem a alergia estruturada, nada dispara — é o que provava o defeito", () => {
    const ctx = contextoClinico(atendimento({ alergias: "" }), []);
    expect(analisarPrescricaoClinica([item], ctx, catalogo, [], []).map(a => a.tipo)).not.toContain("alergia");
  });
});

describe("alergiasPorProntuario — a fila inteira de uma vez", () => {
  const regs = [reg({ id: 1, prontuario: "A" }), reg({ id: 2, prontuario: "A" }), reg({ id: 3, prontuario: "B" })];

  it("agrupa por prontuário", () => {
    const idx = alergiasPorProntuario(regs);
    expect(alergiasDoPaciente(idx, "A")).toHaveLength(2);
    expect(alergiasDoPaciente(idx, "B")).toHaveLength(1);
  });

  it("paciente sem registro devolve lista vazia COMUM — perguntou e não há", () => {
    const idx = alergiasPorProntuario(regs);
    expect(alergiasDoPaciente(idx, "Z")).toEqual([]);
    expect(contextoClinico(atendimento(), alergiasDoPaciente(idx, "Z")).alergiasIncertas).toBe(false);
  });

  it("🔴 leitura FALHADA marca TODO paciente como incerto", () => {
    // Índice vazio faria cada paciente da fila parecer sem alergia — a
    // mentira mais cara do sistema, multiplicada pelo tamanho da fila.
    const idx = alergiasPorProntuario(FALHA);
    expect(idx.falhou).toBe(true);
    for (const p of ["A", "B", "Z"]) {
      expect(contextoClinico(atendimento(), alergiasDoPaciente(idx, p)).alergiasIncertas, p).toBe(true);
    }
  });

  it("🔴 índice AINDA CARREGANDO conta como incerto, não como vazio", () => {
    // É a janela em que a fila da Farmácia mostraria dezenas de pacientes
    // "sem alergia" só porque a consulta ainda está no ar. Antes da resposta
    // a tela não sabe — e não saber não pode ser exibido como "não tem".
    const idx = { falhou: false, carregando: true, por: {} };
    expect(contextoClinico(atendimento(), alergiasDoPaciente(idx, "A")).alergiasIncertas).toBe(true);
  });

  it("terminada a carga, o mesmo paciente deixa de ser incerto", () => {
    const idx = { falhou: false, carregando: false, por: { A: [reg({ prontuario: "A" })] } };
    const ctx = contextoClinico(atendimento(), alergiasDoPaciente(idx, "A"));
    expect(ctx.alergiasIncertas).toBe(false);
    expect(ctx.alergias).toMatch(/penicilina/i);
  });

  it("registro sem prontuário não estoura nem entra", () => {
    const idx = alergiasPorProntuario([reg({ prontuario: null }), null, reg({ id: 9, prontuario: "A" })]);
    expect(alergiasDoPaciente(idx, "A")).toHaveLength(1);
  });

  it("índice ausente é tratado como falha, não como vazio", () => {
    expect(contextoClinico(atendimento(), alergiasDoPaciente(null, "A")).alergiasIncertas).toBe(true);
  });
});

describe("contextoClinico normaliza o resto sem inventar", () => {
  it("campo vazio vira `null`, não zero", () => {
    const ctx = contextoClinico({ idade: "", peso: "", clearance_renal: "" }, []);
    expect([ctx.idade, ctx.peso, ctx.clearance_renal]).toEqual([null, null, null]);
  });

  it("número em texto é lido como número", () => {
    const ctx = contextoClinico({ idade: "40", peso: "78.5" }, []);
    expect(ctx.idade).toBe(40);
    expect(ctx.peso).toBe(78.5);
  });

  it("comorbidades sempre lista", () => {
    expect(contextoClinico({ comorbidades: null }, []).comorbidades).toEqual([]);
    expect(contextoClinico({ comorbidades: "x" }, []).comorbidades).toEqual([]);
  });

  it("atendimento nulo não estoura", () => {
    expect(() => contextoClinico(null, null)).not.toThrow();
    expect(contextoClinico(null, null).alergias).toBe("");
  });
});
