// ═══════════════════════════════════════════════════════════
// A VERIFICAÇÃO DA IMPRESSÃO DIGITAL
//
// ⚠️ ISTO NÃO É ASSINATURA DIGITAL. O campo `assinatura` deste sistema
// guarda um texto ("Dra. Ana · CRM 1234"), que é ATRIBUIÇÃO. Assinar no
// sentido da CFM 1.821/2007 exige certificado ICP-Brasil, e sem ele o
// hospital NÃO pode parar de imprimir.
//
// A forma canônica em si é provada contra o SQL em
// `supabase/impressao-digital.test.js`, que roda as duas implementações num
// Postgres de verdade. Aqui está a LEITURA: o que a tela conclui, e a
// distinção que importa mais que todas as outras —
//
// 🔴 "NÃO DEU PARA CONFERIR" NÃO É "NÃO BATE".
//
// Colapsar os dois encheria a tela de alarme falso sobre documento íntegro,
// e alarme falso em prova de integridade é pior que alarme nenhum, porque
// se aprende a ignorá-lo. Colapsar no outro sentido é pior ainda: afirmaria
// integridade que não foi apurada.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, vi, afterEach } from "vitest";
import { createHash } from "node:crypto";
import {
  FORMATO, DOCUMENTOS, canonicoDescricao, canonicoResultado,
  docTxt, docNum, docTs, docBool, sha256Hex, conferirDocumento, selo,
} from "./impressao-digital.js";

const sha = t => createHash("sha256").update(t, "utf8").digest("hex");

/** Uma linha como o banco devolveria, já com a digital certa. */
function gravada(tipo, dados) {
  const canonico = DOCUMENTOS[tipo].canonico(dados);
  return { ...dados, conteudo_hash: sha(canonico), hash_formato: FORMATO };
}

afterEach(() => { vi.unstubAllGlobals(); });

// ── OS FORMATADORES ─────────────────────────────────────────
describe("os formatadores", () => {
  it("texto: nulo e vazio são a mesma coisa, borda não conta", () => {
    expect(docTxt(null)).toBe("");
    expect(docTxt(undefined)).toBe("");
    expect(docTxt("")).toBe("");
    expect(docTxt("  x  ")).toBe("x");
  });

  it("🔴 número: a escala não é conteúdo", () => {
    // `7.20` e `7.2` são o mesmo número. O Postgres preserva a escala do
    // `numeric`; sem normalizar, um laudo gravado com `7.20` nunca mais
    // bateria.
    expect(docNum("7.20")).toBe("7.2");
    expect(docNum("7.2")).toBe("7.2");
    expect(docNum(7.2)).toBe("7.2");
  });

  it("🔴 número: ZERO não é ausência", () => {
    // Zero é valor de laudo legítimo — plaqueta, bastonete, bacilo. Tratá-lo
    // como vazio faria dois documentos diferentes terem a mesma digital.
    expect(docNum(0)).toBe("0");
    expect(docNum("0.0")).toBe("0");
    expect(docNum(null)).toBe("");
    expect(docNum("")).toBe("");
  });

  it("número ilegível vira vazio, não NaN", () => {
    expect(docNum("abc")).toBe("");
    expect(docNum(Infinity)).toBe("");
  });

  it("🔴 instante: UTC e precisão de SEGUNDO", () => {
    // Segundo, e não milissegundo: o Postgres guarda microssegundos e o JS
    // só conhece milissegundos — a precisão cheia divergiria um dia.
    expect(docTs("2026-10-14T18:04:05.123456Z")).toBe("2026-10-14T18:04:05Z");
    expect(docTs("2026-10-14T15:04:05-03:00")).toBe("2026-10-14T18:04:05Z");
    // E a virada de dia, que foi onde eu errei a conta ao escrever isto:
    expect(docTs("2026-10-14T21:04:05-03:00")).toBe("2026-10-15T00:04:05Z");
    expect(docTs(null)).toBe("");
    expect(docTs("não é data")).toBe("");
  });

  it("booleano como o Postgres escreve", () => {
    expect(docBool(true)).toBe("true");
    expect(docBool(false)).toBe("false");
    expect(docBool(null)).toBe("");
  });
});

// ── A FORMA CANÔNICA ────────────────────────────────────────
describe("🔴 a forma canônica é contrato", () => {
  it("a ORDEM das linhas é fixa", () => {
    // Trocar duas linhas muda o hash sem mudar o documento, e invalidaria
    // tudo que já existe.
    const linhas = canonicoDescricao({ cirurgia_id: 1 }).split("\n").map(l => l.split("=")[0]);
    expect(linhas.slice(0, 6)).toEqual(
      ["documento", "formato", "cirurgia_id", "procedimento_cod", "procedimento_realizado", "via_acesso"]);
    expect(linhas[linhas.length - 1]).toBe("assinatura");
  });

  it("o documento se identifica, e a versão do formato viaja junto", () => {
    expect(canonicoDescricao({})).toMatch(/^documento=cc_descricao\nformato=1\n/);
    expect(canonicoResultado({})).toMatch(/^documento=sadt_resultados\nformato=1\n/);
  });

  it("🔴 os dois tipos NUNCA colidem", () => {
    // Sem a linha `documento=`, uma descrição e um laudo vazios dariam a
    // mesma digital.
    expect(canonicoDescricao({})).not.toBe(canonicoResultado({}));
  });

  it("🔴 `assinatura` entra: trocar o assinante é outro documento", () => {
    const a = canonicoDescricao({ descricao: "d", assinatura: "Dra. Ana · CRM 1234" });
    const b = canonicoDescricao({ descricao: "d", assinatura: "Dr. Beto · CRM 9999" });
    expect(a).not.toBe(b);
  });

  it("🔴 `critico` entra no laudo: seria a alteração mais perigosa", () => {
    const a = canonicoResultado({ nome: "Potássio", valor_num: 7.2, critico: true });
    const b = canonicoResultado({ nome: "Potássio", valor_num: 7.2, critico: false });
    expect(a).not.toBe(b);
  });

  it("⚠️ o que é do REGISTRO fica de fora: id, versão e quem digitou", () => {
    // Uma correção é documento novo, com digital própria — a versão é do
    // registro, não do conteúdo.
    const base = { descricao: "d" };
    expect(canonicoDescricao({ ...base, id: 1, versao: 1, usuario: "ana", criado_em: "2026-01-01" }))
      .toBe(canonicoDescricao({ ...base, id: 99, versao: 7, usuario: "beto", criado_em: "2030-12-31" }));
  });
});

// ── A VERIFICAÇÃO ───────────────────────────────────────────
describe("🔴 conferir: cinco respostas, não duas", () => {
  it("documento íntegro CONFERE", async () => {
    const r = await conferirDocumento("cc_descricao",
      gravada("cc_descricao", { cirurgia_id: 1, descricao: "sem intercorrencias" }));
    expect(r.estado).toBe("confere");
    expect(selo(r).grave).toBe(false);
  });

  it("🔴 uma letra trocada acusa ALTERADO, e diz o que aconteceu", async () => {
    const doc = gravada("cc_descricao", { cirurgia_id: 1, descricao: "sem intercorrencias" });
    doc.descricao = "com intercorrencias";
    const r = await conferirDocumento("cc_descricao", doc);
    expect(r.estado).toBe("alterado");
    expect(r.motivo).toMatch(/por fora do sistema/);
    expect(selo(r)).toMatchObject({ rotulo: "ALTERADO", grave: true });
  });

  it("🔴 trocar o assinante acusa ALTERADO", async () => {
    const doc = gravada("cc_descricao", { cirurgia_id: 1, descricao: "d", assinatura: "Dra. Ana · CRM 1234" });
    doc.assinatura = "Dr. Beto · CRM 9999";
    expect((await conferirDocumento("cc_descricao", doc)).estado).toBe("alterado");
  });

  it("🔴 virar um CRÍTICO em normal acusa ALTERADO", async () => {
    const doc = gravada("sadt_resultados", { item_id: 9, nome: "Potássio", valor_num: 7.2, critico: true, anormal: true });
    doc.critico = false; doc.anormal = false;
    expect((await conferirDocumento("sadt_resultados", doc)).estado).toBe("alterado");
  });

  it("🔴 documento SEM digital não é 'alterado' — é 'sem digital'", async () => {
    // Documento anterior à migração. Chamá-lo de alterado encheria a tela
    // de alarme falso sobre todo o histórico do hospital.
    const r = await conferirDocumento("cc_descricao", { cirurgia_id: 1, descricao: "antigo" });
    expect(r.estado).toBe("sem_digital");
    expect(r.motivo).toMatch(/nem que não é/);
    expect(selo(r).grave).toBe(false);
  });

  it("🔴 formato antigo não é 'alterado' — precisa de outro verificador", async () => {
    const doc = gravada("cc_descricao", { descricao: "d" });
    doc.hash_formato = "0";
    const r = await conferirDocumento("cc_descricao", doc);
    expect(r.estado).toBe("outro_formato");
    expect(r.motivo).toMatch(/verificador daquela versão/);
  });

  it("🔴 sem Web Crypto é 'indisponível' — e a frase DIZ a diferença", async () => {
    // Acontece fora de https. Concluir "alterado" ali acusaria o hospital
    // inteiro de adulteração por causa da configuração do servidor.
    vi.stubGlobal("crypto", {});
    const r = await conferirDocumento("cc_descricao", gravada("cc_descricao", { descricao: "d" }));
    expect(r.estado).toBe("indisponivel");
    expect(r.motivo).toMatch(/diferente de não bater/);
    expect(selo(r).grave).toBe(false);
  });

  it("tipo desconhecido não estoura", async () => {
    expect((await conferirDocumento("nao_existe", { conteudo_hash: "x" })).estado).toBe("indisponivel");
    expect((await conferirDocumento("cc_descricao", null)).estado).toBe("indisponivel");
  });

  it("🔴 SÓ `alterado` é grave — os outros não acusam ninguém", async () => {
    for (const e of ["confere", "sem_digital", "outro_formato", "indisponivel", undefined]) {
      expect(selo({ estado: e }).grave, String(e)).toBe(false);
    }
    expect(selo({ estado: "alterado" }).grave).toBe(true);
  });
});

describe("sha256Hex", () => {
  it("devolve o hex do Web Crypto", async () => {
    expect(await sha256Hex("abc")).toBe(sha("abc"));
  });

  it("🔴 devolve null — e não uma string qualquer — sem Web Crypto", async () => {
    // Uma string qualquer viraria "não bate" na comparação, que é
    // exatamente a conclusão errada.
    vi.stubGlobal("crypto", {});
    expect(await sha256Hex("abc")).toBeNull();
  });
});
