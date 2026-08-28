// ═══════════════════════════════════════════════════════════
// A BASE DE GERMES DIRIGE O CADASTRO DO CASO
//
// 🔴 O DEFEITO: `sugerirGerme` comparava com `toLowerCase()` e mais nada,
// enquanto o resto da casa usa `normTxt`, que também tira acento. Medido
// na tela em 28/08/2026, depois do seed:
//
//   "Virus sincicial respiratorio (VSR)"  → NENHUMA sugestão
//   "Vírus sincicial respiratório (VSR)"  → sugere contato
//
// ⚠️ E o seed piorou isso: gravou dez nomes ACENTUADOS nos dois bancos.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { sugerirGerme, camposDoGerme, MINIMO } from "./germes.js";

// Os nomes exatos que `migracao-scih-germes-seed.sql` grava.
const BASE = [
  { nome: "Klebsiella pneumoniae (KPC)", tipo: "multirresistente", isolamento: "contato" },
  { nome: "Staphylococcus aureus resistente à meticilina (MRSA)", tipo: "multirresistente", isolamento: "contato" },
  { nome: "Vírus sincicial respiratório (VSR)", tipo: "sensivel", isolamento: "contato" },
  { nome: "Mycobacterium tuberculosis", tipo: "sensivel", isolamento: "aereo" },
  { nome: "Influenza", tipo: "sensivel", isolamento: "goticulas" },
];

describe("🔴 o acento não pode calar a sugestão", () => {
  it("digitado SEM acento acha o germe acentuado do seed", () => {
    // Enfermeiro com pressa digita sem acento, e o silêncio é
    // indistinguível de "este germe não está na base".
    expect(sugerirGerme("Virus sincicial respiratorio (VSR)", BASE).nome)
      .toBe("Vírus sincicial respiratório (VSR)");
    expect(sugerirGerme("Staphylococcus aureus resistente a meticilina (MRSA)", BASE).nome)
      .toMatch(/MRSA/);
  });

  it("e com acento também, obviamente", () => {
    expect(sugerirGerme("Vírus sincicial respiratório (VSR)", BASE).nome).toMatch(/VSR/);
  });

  it("maiúscula/minúscula não importa", () => {
    expect(sugerirGerme("KLEBSIELLA PNEUMONIAE (KPC)", BASE).nome).toMatch(/Klebsiella/);
  });
});

describe("como o nome é procurado", () => {
  it("a pessoa digitou MENOS que o nome cadastrado", () => {
    expect(sugerirGerme("Klebsiella", BASE).nome).toBe("Klebsiella pneumoniae (KPC)");
  });

  it("a pessoa colou MAIS — o laudo inteiro", () => {
    expect(sugerirGerme("Klebsiella pneumoniae (KPC) carbapenemase positiva", BASE).nome)
      .toBe("Klebsiella pneumoniae (KPC)");
  });

  it("🔴 igualdade exata ganha de quem apenas CONTÉM", () => {
    // Se a pessoa escreveu o nome inteiro, é esse germe — mesmo que outro
    // nome da base o contenha por dentro.
    const base = [
      { nome: "Influenza A H1N1", tipo: "sensivel", isolamento: "goticulas" },
      { nome: "Influenza", tipo: "sensivel", isolamento: "goticulas" },
    ];
    expect(sugerirGerme("Influenza", base).nome).toBe("Influenza");
  });
});

describe("⚠️ quando NÃO se sugere nada", () => {
  it("menos de 3 letras — senão 'in' sugeriria Influenza", () => {
    // Sugestão que acerta por acaso treina a pessoa a ignorar a sugestão.
    expect(MINIMO).toBe(3);
    expect(sugerirGerme("in", BASE)).toBeNull();
    expect(sugerirGerme("i", BASE)).toBeNull();
  });

  it("base vazia — que era o estado do banco antes do seed", () => {
    expect(sugerirGerme("Klebsiella", [])).toBeNull();
    expect(sugerirGerme("Klebsiella", null)).toBeNull();
  });

  it("germe que não está na base", () => {
    expect(sugerirGerme("Candida auris", BASE)).toBeNull();
  });

  it("vazio e espaço em branco", () => {
    expect(sugerirGerme("", BASE)).toBeNull();
    expect(sugerirGerme("   ", BASE)).toBeNull();
    expect(sugerirGerme(null, BASE)).toBeNull();
  });
});

describe("o que a base preenche no formulário", () => {
  const kpc = BASE[0], tb = BASE[3];

  it("multirresistente com contato preenche os dois", () => {
    expect(camposDoGerme(kpc, {})).toEqual({ isolamento: "contato", multirresistente: true });
  });

  it("🔴 sensível preenche o isolamento e NÃO marca multirresistente", () => {
    // O tipo diz respeito à resistência, não à gravidade: tuberculose isola
    // por aerossol e não é multirresistente.
    expect(camposDoGerme(tb, {})).toEqual({ isolamento: "aereo" });
  });

  it("⚠️ NÃO passa por cima do que a pessoa já escolheu", () => {
    // Quem está com o paciente pode saber de coinfecção, surto na unidade
    // ou orientação da CCIH para aquele caso.
    expect(camposDoGerme(kpc, { isolamento: "aereo" })).toEqual({ multirresistente: true });
  });

  it("⚠️ e o multirresistente só LIGA, nunca desliga", () => {
    // Desmarcar sozinho um caso marcado à mão apagaria decisão clínica.
    expect(camposDoGerme(tb, { multirresistente: true })).toEqual({ isolamento: "aereo" });
    expect(camposDoGerme(kpc, { multirresistente: true, isolamento: "contato" })).toEqual({});
  });

  it("sem germe, não mexe em nada", () => {
    expect(camposDoGerme(null, {})).toEqual({});
    expect(camposDoGerme(undefined)).toEqual({});
  });
});
