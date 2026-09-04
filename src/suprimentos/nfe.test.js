// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// LER O XML DA NF-e
//
// 🔴 ESTA FUNÇÃO VIVIA SEM TESTE, dentro de um arquivo de tela de 3.591
// linhas. Ela lê documento fiscal, e o que devolve vira entrada de estoque:
// quantidade, custo unitário, lote e validade.
//
// Um campo lido errado aqui NÃO erra em tela. Erra no saldo, no custo médio
// e no controle de vencimento — e só aparece na conferência de inventário,
// meses depois, quando ninguém liga mais uma coisa à outra.
//
// ⚠️ Os XMLs abaixo seguem a estrutura real da NF-e (layout 4.00): `emit`
// para o fornecedor, `ide/nNF` para o número, `det/prod` para cada item e
// `det/prod/rastro` para lote e validade.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { parseNFe } from "./nfe.js";

const nfe = (itens, { cnpj = "12345678000199", nome = "Distribuidora X", nf = "1234" } = {}) => `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc><NFe><infNFe>
  <ide><nNF>${nf}</nNF></ide>
  <emit><CNPJ>${cnpj}</CNPJ><xNome>${nome}</xNome></emit>
  ${itens}
</infNFe></NFe></nfeProc>`;

const item = ({ cod = "A1", ean = "7891234567895", nome = "Luva cirúrgica",
                un = "CX", qtd = "10", vun = "25.50", lote = "", val = "" } = {}) => `
  <det><prod>
    <cProd>${cod}</cProd><cEAN>${ean}</cEAN><xProd>${nome}</xProd>
    <uCom>${un}</uCom><qCom>${qtd}</qCom><vUnCom>${vun}</vUnCom>
    ${lote || val ? `<rastro><nLote>${lote}</nLote><dVal>${val}</dVal></rastro>` : ""}
  </prod></det>`;

describe("o caminho feliz", () => {
  const r = parseNFe(nfe(item({ lote: "L123", val: "2027-06-30" })));

  it("lê fornecedor e número da nota", () => {
    expect(r.erro).toBeUndefined();
    expect(r.fornecedor).toEqual({ cnpj: "12345678000199", nome: "Distribuidora X" });
    expect(r.nf).toBe("1234");
  });

  it("lê o item com lote e validade", () => {
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]).toMatchObject({
      codigo: "A1", ean: "7891234567895", nome: "Luva cirúrgica",
      unidade: "cx", qtd: 10, custo_unit: 25.5,
      lote: "L123", validade: "2027-06-30",
    });
  });

  it("a unidade vem em minúsculas — o catálogo compara assim", () => {
    expect(parseNFe(nfe(item({ un: "FR" }))).itens[0].unidade).toBe("fr");
  });

  it("item sem rastro fica com lote e validade vazios, não nulos", () => {
    const x = parseNFe(nfe(item({}))).itens[0];
    expect(x.lote).toBe("");
    expect(x.validade).toBe("");
  });

  it("lê vários itens", () => {
    const r2 = parseNFe(nfe(item({ cod: "A1" }) + item({ cod: "B2", nome: "Seringa" })));
    expect(r2.itens.map(i => i.codigo)).toEqual(["A1", "B2"]);
  });
});

describe("🔴 o que ela RECUSA — e devolve erro em vez de lançar", () => {
  // Quem chama é um `FileReader`. Exceção de dentro dele some com a causa.
  it("XML quebrado", () => {
    const r = parseNFe("<nfe><não fecha");
    expect(r.erro).toBeTruthy();
    expect(r.itens).toBeUndefined();
  });

  it("arquivo que não é NF-e", () => {
    expect(parseNFe("<html><body>oi</body></html>").erro).toMatch(/não parece uma NF-e/i);
  });

  it("NF-e sem item nenhum", () => {
    expect(parseNFe(nfe("<det><prod><xProd>x</xProd></prod></det>")).erro)
      .toMatch(/Nenhum item/i);
  });

  it("entradas estranhas não estouram", () => {
    for (const x of ["", "   ", null, undefined]) {
      expect(() => parseNFe(x), JSON.stringify(x)).not.toThrow();
      expect(parseNFe(x).erro, JSON.stringify(x)).toBeTruthy();
    }
  });
});

describe("🔴 as regras que protegem o estoque", () => {
  it('"SEM GTIN" NÃO vira código de barras', () => {
    // A SEFAZ manda literalmente "SEM GTIN" quando o produto não tem EAN.
    // Gravar isso como código de barras faria o leitor do almoxarifado
    // bipar e não achar nada — ou pior, casar com outro item que também
    // tenha "SEM GTIN".
    expect(parseNFe(nfe(item({ ean: "SEM GTIN" }))).itens[0].ean).toBe("");
    expect(parseNFe(nfe(item({ ean: "SEM GTIN" }))).itens[0].ean).not.toBe("SEM GTIN");
  });

  it("EAN com tamanho inválido é descartado", () => {
    for (const e of ["123", "1234567890123456789", "ABC12345"]) {
      expect(parseNFe(nfe(item({ ean: e }))).itens[0].ean, e).toBe("");
    }
  });

  it("EAN de 8 e de 14 dígitos são aceitos — as duas pontas do padrão", () => {
    expect(parseNFe(nfe(item({ ean: "12345678" }))).itens[0].ean).toBe("12345678");
    expect(parseNFe(nfe(item({ ean: "12345678901234" }))).itens[0].ean).toBe("12345678901234");
  });

  it("🔴 item com quantidade ZERO não entra", () => {
    // Entrada de zero criaria movimento sem efeito no saldo e um lote
    // fantasma no controle de vencimento.
    expect(parseNFe(nfe(item({ qtd: "0" }))).erro).toMatch(/Nenhum item/i);
  });

  it("item sem nome não entra", () => {
    expect(parseNFe(nfe(item({ nome: "" }))).erro).toMatch(/Nenhum item/i);
  });

  it("⚠️ quantidade e custo ilegíveis viram ZERO, e o item de qtd 0 cai fora", () => {
    // O custo zero PASSA — nota com item bonificado existe. Quem decide se
    // aceita custo zero é a tela de conferência, não este leitor.
    const r = parseNFe(nfe(item({ vun: "abc" })));
    expect(r.itens[0].custo_unit).toBe(0);
    expect(r.itens[0].qtd).toBe(10);
  });

  it("custo com vírgula decimal do XML não vira número errado", () => {
    // O layout da NF-e usa PONTO decimal. Se vier vírgula, `Number` devolve
    // NaN e o campo cai para 0 — melhor que ler 2550 no lugar de 25,50.
    expect(parseNFe(nfe(item({ vun: "25,50" }))).itens[0].custo_unit).toBe(0);
  });

  it("mistura de itens válidos e inválidos mantém só os válidos", () => {
    const r = parseNFe(nfe(item({ cod: "OK" }) + item({ cod: "ZERO", qtd: "0" })));
    expect(r.itens.map(i => i.codigo)).toEqual(["OK"]);
  });
});
