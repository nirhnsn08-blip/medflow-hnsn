// ═══════════════════════════════════════════════════════════
// O RASCUNHO DA PRESCRIÇÃO
//
// 🔴 Estas regras eram expressões dentro de `addItemPrescricao` e
// `assinarPrescricao`, sem teste. Uma delas compõe o TEXTO que vira o
// registro clínico imutável — o documento do prontuário que ninguém pode
// editar depois. Outra impede que item de medicamento seja gravado sem o
// registro pai, que é como a farmácia enxerga uma prescrição que o
// prontuário não tem.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  descricaoDaDose, formAposAdicionar, gruposDoCatalogo, itensSemEstoque, linhasParaGravar,
  montarItem, podeAssinar, textoDaPrescricao,
} from "./prescricao-rascunho.js";

const med = (id, extra = {}) => ({ id, nome: "Dipirona 500 mg", unidade: "cp", ...extra });
const form = (extra = {}) => ({ medId: "1", dose_valor: "500", dose_unidade: "mg", freqLabel: "8/8h (3x)", via: "VO", duracao: "7", quantidade: "21", ...extra });

describe("🔴 montarItem — campo vazio vira `null`, nunca zero", () => {
  it("monta o item completo", () => {
    expect(montarItem(med(1), form())).toMatchObject({
      medicamento_id: 1, medicamento_nome: "Dipirona 500 mg", unidade: "cp",
      dose_valor: 500, dose_unidade: "mg", duracao_dias: 7, via: "VO", quantidade: "21",
    });
  });

  it("🔴 dose e duração VAZIAS ficam `null`, e não 0", () => {
    // `Number("")` é 0. Uma prescrição "por 0 dia(s)" ou de "0 mg" diz algo
    // — e é diferente de não dizer nada. O prontuário precisa distinguir
    // "sem duração definida" de "por zero dias".
    const it = montarItem(med(1), form({ dose_valor: "", duracao: "" }));
    expect(it.dose_valor).toBe(null);
    expect(it.duracao_dias).toBe(null);
    expect(it.dose_valor).not.toBe(0);
    expect(it.duracao_dias).not.toBe(0);
  });

  it("⚠️ ZERO digitado de propósito continua sendo zero", () => {
    const it = montarItem(med(1), form({ dose_valor: "0", duracao: "0" }));
    expect(it.dose_valor).toBe(0);
    expect(it.duracao_dias).toBe(0);
  });

  it("medicamento sem unidade não inventa uma", () => {
    expect(montarItem({ id: 1, nome: "X" }, form()).unidade).toBe(null);
  });

  it("sem medicamento devolve `null` — não monta item fantasma", () => {
    expect(montarItem(null, form())).toBe(null);
    expect(montarItem(undefined, form())).toBe(null);
  });

  it("formulário nulo não estoura", () => {
    expect(() => montarItem(med(1), null)).not.toThrow();
  });
});

describe("🔴 descricaoDaDose — parte ausente SOME, não vira 'undefined'", () => {
  it("junta dose, frequência e duração", () => {
    expect(descricaoDaDose(form())).toBe("500 mg · 8/8h (3x) · por 7 dia(s)");
  });

  it("🔴 sem dose, a linha começa na frequência", () => {
    // "undefined mg" no prontuário parece defeito do sistema; a ausência
    // parece o que é, uma informação que faltou.
    expect(descricaoDaDose(form({ dose_valor: "" }))).toBe("8/8h (3x) · por 7 dia(s)");
    expect(descricaoDaDose(form({ dose_valor: "" }))).not.toMatch(/undefined|null/);
  });

  it("sem unidade, o número fica sozinho e sem espaço sobrando", () => {
    expect(descricaoDaDose(form({ dose_unidade: "" }))).toBe("500 · 8/8h (3x) · por 7 dia(s)");
  });

  it("sem duração, a linha termina na frequência", () => {
    expect(descricaoDaDose(form({ duracao: "" }))).toBe("500 mg · 8/8h (3x)");
  });

  it("formulário vazio devolve texto vazio, não lixo", () => {
    expect(descricaoDaDose({})).toBe("");
    expect(descricaoDaDose(null)).toBe("");
  });
});

describe("🔴 formAposAdicionar — o que repete e o que limpa", () => {
  it("🔴 unidade, frequência e via PERMANECEM", () => {
    // Quem prescreve três antibióticos de 8/8h por via oral não redigita
    // isso três vezes — e redigitar é onde nasce o erro em campo de dose.
    const f = formAposAdicionar(form({ dose_unidade: "mL", freqLabel: "12/12h (2x)", via: "IV" }));
    expect(f).toMatchObject({ dose_unidade: "mL", freqLabel: "12/12h (2x)", via: "IV" });
  });

  it("🔴 medicamento, dose, duração e quantidade SEMPRE limpam", () => {
    // Repetir a dose do item anterior no próximo é como um erro entra sem
    // ninguém ver.
    const f = formAposAdicionar(form());
    expect(f).toMatchObject({ medId: "", dose_valor: "", duracao: "", quantidade: "" });
  });

  it("formulário nulo não estoura", () => {
    expect(() => formAposAdicionar(null)).not.toThrow();
  });
});

describe("🔴 textoDaPrescricao — o registro clínico imutável", () => {
  const it1 = { medicamento_nome: "Dipirona 500 mg", dose: "500 mg · 8/8h (3x)", via: "VO", quantidade: "21", unidade: "cp" };
  const it2 = { medicamento_nome: "Soro fisiológico", dose: null, via: "IV", quantidade: null, unidade: null };

  it("uma linha por item, com dose, via e quantidade", () => {
    expect(textoDaPrescricao([it1], "")).toBe("• Dipirona 500 mg — 500 mg · 8/8h (3x) (VO) — qtd 21 cp");
  });

  it("vários itens, um por linha", () => {
    expect(textoDaPrescricao([it1, it2], "").split("\n")).toHaveLength(2);
  });

  it("campos ausentes somem da linha", () => {
    expect(textoDaPrescricao([it2], "")).toBe("• Soro fisiológico (IV)");
    expect(textoDaPrescricao([it2], "")).not.toMatch(/undefined|null|NaN/);
  });

  it("a observação entra no fim, rotulada", () => {
    expect(textoDaPrescricao([it1], "manter em jejum")).toMatch(/\nObs\.: manter em jejum$/);
  });

  it("observação só de espaços não vira linha vazia", () => {
    expect(textoDaPrescricao([it1], "   ")).not.toMatch(/Obs\./);
  });

  it("⚠️ prescrição só de observação continua sendo um texto de verdade", () => {
    expect(textoDaPrescricao([], "elevar cabeceira 30°")).toBe("Obs.: elevar cabeceira 30°");
  });

  it("entradas estranhas não estouram", () => {
    for (const v of [null, undefined, "x", [null, undefined]]) {
      expect(() => textoDaPrescricao(v, null), String(v)).not.toThrow();
    }
  });
});

describe("🔴 podeAssinar", () => {
  it("com item, pode", () => {
    expect(podeAssinar([{ medicamento_nome: "X" }], "")).toBe(true);
  });

  it("🔴 SÓ observação também pode — cuidado é prescrição", () => {
    // "manter em jejum", "elevar cabeceira" precisam ficar no prontuário com
    // hora e assinatura, mesmo sem nenhum medicamento.
    expect(podeAssinar([], "manter em jejum")).toBe(true);
  });

  it("vazio de tudo não pode", () => {
    expect(podeAssinar([], "")).toBe(false);
    expect(podeAssinar([], "   ")).toBe(false);
    expect(podeAssinar(null, null)).toBe(false);
  });
});

describe("itensSemEstoque — aviso, não bloqueio", () => {
  const cat = { 1: { id: 1, nome: "A" }, 2: { id: 2, nome: "B" } };
  const lotes = [{ medicamento_id: 2, quantidade: 50 }];

  it("pega só o que está zerado", () => {
    const r = itensSemEstoque([{ medicamento_id: 1 }, { medicamento_id: 2 }], cat, lotes);
    expect(r.map(i => i.medicamento_id)).toEqual([1]);
  });

  it("medicamento fora do catálogo não é acusado de faltar", () => {
    // Não saber o saldo é diferente de saber que é zero.
    expect(itensSemEstoque([{ medicamento_id: 99 }], cat, lotes)).toEqual([]);
  });

  it("entradas estranhas devolvem lista vazia", () => {
    for (const v of [null, undefined, []]) expect(itensSemEstoque(v, cat, lotes), String(v)).toEqual([]);
  });
});

describe("🔴 linhasParaGravar — item ÓRFÃO é proibido", () => {
  const item = { medicamento_id: 1, medicamento_nome: "Dipirona", dose_valor: 500, quantidade: "21", via: "VO" };

  it("monta as linhas com o registro pai", () => {
    const [l] = linhasParaGravar([item], 77, 900);
    expect(l).toMatchObject({ atendimento_id: 77, registro_id: 900, medicamento_nome: "Dipirona", quantidade: 21 });
  });

  it("🔴 SEM registro_id, ESTOURA em vez de gravar", () => {
    // Item sem registro pai é medicamento que a farmácia enxerga e o
    // prontuário não. Era exatamente o que acontecia quando a criação do
    // registro falhava em silêncio: `registroId` virava `null` e os itens
    // eram gravados assim mesmo.
    expect(() => linhasParaGravar([item], 77, null)).toThrow(/registro_id/);
    expect(() => linhasParaGravar([item], 77, undefined)).toThrow(/registro_id/);
  });

  it("⚠️ registro_id ZERO é um id válido e não pode ser confundido com ausência", () => {
    expect(() => linhasParaGravar([item], 77, 0)).not.toThrow();
  });

  it("quantidade vazia vira `null`, não zero", () => {
    const [l] = linhasParaGravar([{ ...item, quantidade: "" }], 77, 900);
    expect(l.quantidade).toBe(null);
  });

  it("lista vazia devolve lista vazia", () => {
    expect(linhasParaGravar([], 77, 900)).toEqual([]);
    expect(linhasParaGravar(null, 77, 900)).toEqual([]);
  });
});

describe("🔴 gruposDoCatalogo — nenhum medicamento some do seletor", () => {
  const m = (id, classe, extra = {}) => ({ id, nome: "Med " + id, classe, ativo: true, ...extra });

  it("agrupa pelas classes conhecidas, na ordem clínica da constante", () => {
    const g = gruposDoCatalogo([m(1, "Antibióticos"), m(2, "Analgésicos e antipiréticos")]);
    // "Analgésicos" vem antes de "Antibióticos" em FARM_CLASSES, e é essa a
    // ordem que vale — não a ordem em que os medicamentos foram cadastrados.
    expect(g.map(x => x.classe)).toEqual(["Analgésicos e antipiréticos", "Antibióticos"]);
  });

  it("🔴 classe DESCONHECIDA continua aparecendo, no fim", () => {
    // Antes, um medicamento com classe fora de FARM_CLASSES sumia do seletor
    // sem mensagem: impossível de prescrever pelo PS, e sem dizer por quê.
    const g = gruposDoCatalogo([m(1, "Antineoplásicos"), m(2, "Antibióticos")]);
    expect(g.map(x => x.classe)).toEqual(["Antibióticos", "Antineoplásicos"]);
    expect(g.flatMap(x => x.itens).map(x => x.id)).toContain(1);
  });

  it("⚠️ NENHUM medicamento ativo fica de fora, seja qual for a classe", () => {
    const cat = [m(1, "Antineoplásicos"), m(2, null), m(3, "Antibióticos"), m(4, "classe digitada errado")];
    const dentro = gruposDoCatalogo(cat).flatMap(g => g.itens).map(x => x.id).sort();
    expect(dentro).toEqual([1, 2, 3, 4]);
  });

  it("classe vazia cai em Outros", () => {
    expect(gruposDoCatalogo([m(1, null)])[0].classe).toBe("Outros");
    expect(gruposDoCatalogo([m(1, "")])[0].classe).toBe("Outros");
  });

  it("desconhecidas ficam em ordem alfabética entre si", () => {
    const g = gruposDoCatalogo([m(1, "Zeta"), m(2, "Alfa")]);
    expect(g.map(x => x.classe)).toEqual(["Alfa", "Zeta"]);
  });

  it("inativo não entra, e classe que só tem inativo não vira grupo", () => {
    const g = gruposDoCatalogo([m(1, "Antibióticos", { ativo: false }), m(2, "Opioides")]);
    expect(g.map(x => x.classe)).toEqual(["Opioides"]);
  });

  it("catálogo vazio ou estranho devolve lista vazia", () => {
    for (const v of [[], null, undefined, "x", [null]]) {
      expect(gruposDoCatalogo(v), String(v)).toEqual([]);
    }
  });
});
