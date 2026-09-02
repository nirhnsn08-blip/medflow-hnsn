// ═══════════════════════════════════════════════════════════
// PREÇO POR CONVÊNIO — as três respostas
//
// 🔴 "Quanto custa este procedimento para este convênio?" tem TRÊS
// desfechos, e o defeito desta tela é colapsá-los em dois:
//
//   ACHADO   há preço vigente
//   VENCIDO  houve preço e a vigência acabou → pedir aditivo à operadora
//   AUSENTE  nunca houve → alguém precisa cadastrar
//
// "Vencido" lido como "ausente" manda o hospital procurar um cadastro que
// já existe, em vez de cobrar o aditivo. É a mesma família do resto do
// módulo: dois fatos diferentes virando um.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  precoDe, vigenteEm, diaDe, lacunasDePreco, coberturaDoConvenio,
  regrasDoConvenio, recusasDoPreco, SITUACAO,
} from "./precos.js";
import { listaLida } from "../util/leitura.js";

const FALHA = listaLida(null);
const HOJE = new Date(2026, 8, 1);        // 01/09/2026

const preco = (o = {}) => ({
  id: 1, convenio_id: 2, codigo: "40101010", valor: 250,
  vigencia_inicio: "2026-01-01", vigencia_fim: null, ativo: true, ...o,
});

describe("diaDe", () => {
  it("aceita Date e string, e recusa lixo", () => {
    expect(diaDe(new Date(2026, 8, 1))).toBe("2026-09-01");
    expect(diaDe("2026-09-01")).toBe("2026-09-01");
    expect(diaDe("2026-09-01T13:00:00Z")).toBe("2026-09-01");
    expect(diaDe("primeiro de setembro")).toBe(null);
    expect(diaDe(null)).toBe(null);
  });
});

describe("vigenteEm — a vigência é FECHADA nos dois lados", () => {
  it("o primeiro e o último dia VALEM", () => {
    const p = preco({ vigencia_inicio: "2026-08-01", vigencia_fim: "2026-08-31" });
    expect(vigenteEm(p, "2026-08-01")).toBe(true);
    expect(vigenteEm(p, "2026-08-31")).toBe(true);
  });

  it("o dia antes e o dia depois NÃO valem", () => {
    const p = preco({ vigencia_inicio: "2026-08-01", vigencia_fim: "2026-08-31" });
    expect(vigenteEm(p, "2026-07-31")).toBe(false);
    expect(vigenteEm(p, "2026-09-01")).toBe(false);
  });

  it("fim nulo = prazo indeterminado, vale para sempre", () => {
    expect(vigenteEm(preco({ vigencia_fim: null }), "2099-01-01")).toBe(true);
  });

  it("preço inativo nunca vigora", () => {
    expect(vigenteEm(preco({ ativo: false }), "2026-06-01")).toBe(false);
  });
});

describe("🔴 precoDe — as três respostas", () => {
  it("ACHADO quando há preço vigente", () => {
    const r = precoDe([preco()], { convenioId: 2, codigo: "40101010", dia: "2026-09-01" });
    expect(r.situacao).toBe(SITUACAO.ACHADO);
    expect(r.preco.valor).toBe(250);
  });

  it("🔴 VENCIDO não é AUSENTE — e traz o último que valeu", () => {
    // Aqui está a regra inteira. Vencido tem contrato e precisa de aditivo;
    // ausente precisa de cadastro. Confundir manda a pessoa ao lugar errado.
    const antigo = preco({ id: 9, vigencia_inicio: "2025-01-01", vigencia_fim: "2025-12-31", valor: 200 });
    const r = precoDe([antigo], { convenioId: 2, codigo: "40101010", dia: "2026-09-01" });
    expect(r.situacao).toBe(SITUACAO.VENCIDO);
    expect(r.situacao).not.toBe(SITUACAO.AUSENTE);
    expect(r.ultimoVencido.id).toBe(9);
    expect(r.preco).toBe(null);
  });

  it("com vários vencidos, traz o MAIS RECENTE", () => {
    const r = precoDe([
      preco({ id: 1, vigencia_inicio: "2024-01-01", vigencia_fim: "2024-12-31" }),
      preco({ id: 2, vigencia_inicio: "2025-01-01", vigencia_fim: "2025-12-31" }),
    ], { convenioId: 2, codigo: "40101010", dia: "2026-09-01" });
    expect(r.ultimoVencido.id).toBe(2);
  });

  it("AUSENTE quando nunca houve preço para o par", () => {
    const r = precoDe([preco({ convenio_id: 99 })], { convenioId: 2, codigo: "40101010", dia: "2026-09-01" });
    expect(r.situacao).toBe(SITUACAO.AUSENTE);
  });

  it("⚠️ preço de OUTRO convênio não serve, mesmo com o código igual", () => {
    // É exatamente o defeito que esta tabela conserta: a conta da Unimed
    // sendo precificada pela tabela do SUS.
    const r = precoDe([preco({ convenio_id: 1, valor: 52.22 })], { convenioId: 2, codigo: "40101010", dia: "2026-09-01" });
    expect(r.situacao).toBe(SITUACAO.AUSENTE);
    expect(r.preco).toBe(null);
  });

  it("código compara sem diferenciar caixa nem espaço", () => {
    const r = precoDe([preco({ codigo: " 40101010 " })], { convenioId: 2, codigo: "40101010", dia: "2026-09-01" });
    expect(r.situacao).toBe(SITUACAO.ACHADO);
  });

  it("🔴 leitura que falhou tem situação própria, não é AUSENTE", () => {
    const r = precoDe(FALHA, { convenioId: 2, codigo: "40101010" });
    expect(r.situacao).toBe(SITUACAO.SEM_LEITURA);
    expect(r.situacao).not.toBe(SITUACAO.AUSENTE);
  });

  it("⚠️ preço que ainda NÃO começou não é 'ausente' nem 'achado'", () => {
    // Vigência futura é legítima: o aditivo foi assinado e começa mês que
    // vem. Dizer "ausente" faria alguém cadastrar de novo, e aí o EXCLUDE
    // do banco recusaria sem explicar por quê.
    const r = precoDe([preco({ vigencia_inicio: "2027-01-01" })], { convenioId: 2, codigo: "40101010", dia: "2026-09-01" });
    expect(r.situacao).toBe(SITUACAO.VENCIDO);
    expect(r.ultimoVencido).toBe(null);
  });
});

describe("🔴 lacunasDePreco — o que fecha o buraco das outras abas", () => {
  const precos = [preco({ convenio_id: 1, codigo: "AAA", valor: 10 })];
  const item = (o = {}) => ({ codigo: "BBB", convenio_id: 1, valor_total: 100, descricao: "Proc B", ...o });

  it("lista o par que não tem preço, com quanto já foi lançado", () => {
    const l = lacunasDePreco([item(), item({ valor_total: 50 })], precos, { hoje: HOJE });
    expect(l).toHaveLength(1);
    expect(l[0].codigo).toBe("BBB");
    expect(l[0].vezes).toBe(2);
    expect(l[0].valorLancado).toBe(150);
  });

  it("o que TEM preço vigente não entra", () => {
    expect(lacunasDePreco([item({ codigo: "AAA" })], precos, { hoje: HOJE })).toEqual([]);
  });

  it("item cancelado não entra", () => {
    expect(lacunasDePreco([item({ cancelado: true })], precos, { hoje: HOJE })).toEqual([]);
  });

  it("🔴 VENCIDO vem ANTES de ausente — é o conserto mais barato", () => {
    // Vencido só precisa de aditivo; ausente precisa de negociação nova.
    const ps = [preco({ convenio_id: 1, codigo: "CCC", vigencia_inicio: "2025-01-01", vigencia_fim: "2025-12-31" })];
    const l = lacunasDePreco([item({ codigo: "BBB" }), item({ codigo: "CCC" })], ps, { hoje: HOJE });
    expect(l[0].codigo).toBe("CCC");
    expect(l[0].situacao).toBe(SITUACAO.VENCIDO);
    expect(l[1].situacao).toBe(SITUACAO.AUSENTE);
  });

  it("⚠️ item sem valor lançado é contado à parte, não como zero", () => {
    const l = lacunasDePreco([item({ valor_total: null }), item({ valor_total: 80 })], precos, { hoje: HOJE });
    expect(l[0].valorLancado).toBe(80);
    expect(l[0].semValor).toBe(1);
  });

  it("item sem convênio ou sem código é ignorado, não vira lacuna falsa", () => {
    expect(lacunasDePreco([item({ convenio_id: null }), item({ codigo: "" })], precos, { hoje: HOJE })).toEqual([]);
  });

  it("leitura que falhou não vira 'nenhuma lacuna'", () => {
    // Zero lacunas é a melhor notícia possível nesta lista.
    expect(lacunasDePreco(FALHA, precos, { hoje: HOJE })).toEqual([]);
    expect(lacunasDePreco([item()], FALHA, { hoje: HOJE })).toEqual([]);
  });
});

describe("coberturaDoConvenio", () => {
  it("separa vigente, vencido, futuro e inativo", () => {
    const c = coberturaDoConvenio([
      preco({ id: 1, vigencia_fim: null }),
      preco({ id: 2, vigencia_inicio: "2025-01-01", vigencia_fim: "2025-06-30" }),
      preco({ id: 3, vigencia_inicio: "2027-01-01" }),
      preco({ id: 4, ativo: false }),
    ], 2, { hoje: HOJE });
    expect([c.vigentes, c.vencidos, c.futuros, c.inativos]).toEqual([1, 1, 1, 1]);
  });

  it("⚠️ avisa o PRÓXIMO vencimento — descobrir no dia seguinte já é tarde", () => {
    const c = coberturaDoConvenio([
      preco({ id: 1, vigencia_fim: "2026-12-31" }),
      preco({ id: 2, codigo: "X", vigencia_fim: "2026-09-30" }),
    ], 2, { hoje: HOJE });
    expect(c.proximoVencimento).toBe("2026-09-30");
  });

  it("preço sem fim não gera vencimento nenhum", () => {
    expect(coberturaDoConvenio([preco({ vigencia_fim: null })], 2, { hoje: HOJE }).proximoVencimento).toBe(null);
  });
});

describe("regrasDoConvenio", () => {
  it("junta as exigências que já moram em at_convenios", () => {
    const r = regrasDoConvenio({ exige_carteira: true, exige_autorizacao: true, registro_ans: "123456" });
    expect(r).toHaveLength(3);
    expect(r.join(" ")).toMatch(/carteira/i);
    expect(r.join(" ")).toMatch(/autorização/i);
  });

  it("convênio sem exigência devolve lista vazia, não texto vazio", () => {
    expect(regrasDoConvenio({})).toEqual([]);
  });
});

describe("🔴 recusasDoPreco — espelha o EXCLUDE do banco", () => {
  const bom = { convenio_id: 2, codigo: "40101010", valor: "250,00", vigencia_inicio: "2026-01-01" };

  it("preço bom passa", () => {
    expect(recusasDoPreco(bom, [])).toEqual([]);
  });

  it("ZERO é permitido — é procedimento incluso no pacote", () => {
    expect(recusasDoPreco({ ...bom, valor: "0" }, [])).toEqual([]);
  });

  it("negativo é recusado", () => {
    expect(recusasDoPreco({ ...bom, valor: "-10" }, []).join(" ")).toMatch(/negativo não existe/i);
  });

  it("sem convênio, sem código ou sem início é recusado", () => {
    expect(recusasDoPreco({ ...bom, convenio_id: null }, []).length).toBeGreaterThan(0);
    expect(recusasDoPreco({ ...bom, codigo: "  " }, []).length).toBeGreaterThan(0);
    expect(recusasDoPreco({ ...bom, vigencia_inicio: null }, []).length).toBeGreaterThan(0);
  });

  it("vigência que termina antes de começar é recusada", () => {
    const r = recusasDoPreco({ ...bom, vigencia_fim: "2025-12-31" }, []);
    expect(r.join(" ")).toMatch(/terminar antes de começar/i);
  });

  it("🔴 SOBREPOSIÇÃO é recusada, e o texto diz com qual período", () => {
    // Sem isto, "quanto custa hoje?" teria duas respostas e o sistema
    // escolheria uma sem avisar.
    const existente = preco({ id: 5, vigencia_inicio: "2025-06-01", vigencia_fim: null });
    const r = recusasDoPreco({ ...bom, vigencia_inicio: "2026-01-01" }, [existente]);
    expect(r.join(" ")).toMatch(/já existe preço ativo/i);
    expect(r.join(" ")).toMatch(/2025-06-01/);
  });

  it("períodos que NÃO se cruzam passam", () => {
    const existente = preco({ id: 5, vigencia_inicio: "2025-01-01", vigencia_fim: "2025-12-31" });
    expect(recusasDoPreco({ ...bom, vigencia_inicio: "2026-01-01" }, [existente])).toEqual([]);
  });

  it("⚠️ encostar no dia seguinte é permitido; no MESMO dia, não", () => {
    const existente = preco({ id: 5, vigencia_inicio: "2025-01-01", vigencia_fim: "2025-12-31" });
    expect(recusasDoPreco({ ...bom, vigencia_inicio: "2025-12-31" }, [existente]).length).toBeGreaterThan(0);
    expect(recusasDoPreco({ ...bom, vigencia_inicio: "2026-01-01" }, [existente])).toEqual([]);
  });

  it("preço INATIVO não bloqueia — histórico pode se sobrepor à vontade", () => {
    const antigo = preco({ id: 5, ativo: false, vigencia_inicio: "2020-01-01", vigencia_fim: null });
    expect(recusasDoPreco(bom, [antigo])).toEqual([]);
  });

  it("editar o PRÓPRIO preço não colide consigo mesmo", () => {
    const eu = preco({ id: 7, vigencia_inicio: "2026-01-01" });
    expect(recusasDoPreco({ ...bom, id: 7, vigencia_inicio: "2026-01-01" }, [eu])).toEqual([]);
  });

  it("outro CONVÊNIO com o mesmo código não colide", () => {
    const outro = preco({ id: 5, convenio_id: 99, vigencia_inicio: "2020-01-01", vigencia_fim: null });
    expect(recusasDoPreco(bom, [outro])).toEqual([]);
  });
});
