// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// A ESCRITA DA TRILHA
//
// 🔴 A TRILHA DEFENDE A INSTITUIÇÃO (REQUISITOS-PEP A-03; CFM 1.638/2002).
// Ela só cumpre esse papel se for a mesma para todos, completa e atribuível
// a uma conta. Isto aqui é o lado da gravação; o da leitura já tem teste em
// `contrato-banco.test.js`.
//
// Enquanto morava no App.jsx como `addAuditLog`, esta função era usada por
// 29 declarações e não tinha um único teste — o App.jsx está fora do
// `telas.test.jsx` de propósito.
//
// O que mais importa aqui NÃO é a trilha: é que registrar não pode derrubar
// o ato registrado. A função roda DEPOIS que a pessoa deu a alta, dispensou
// o medicamento, salvou o leito. Se estourar, o erro sobe para um chamador
// sem try/catch e o usuário vê falhar o que já deu certo.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from "vitest";
import { registrarAuditoria, lerTrilhaLocal, AUDIT_KEY, LIMITE_LOCAL } from "./dados.js";

const USER = { name: "Ana Souza", categoria: "enfermeiro" };

function espiao() {
  const chamadas = [];
  const sb = (caminho, opts) => { chamadas.push({ caminho, opts }); return Promise.resolve([{ id: 1 }]); };
  sb.chamadas = chamadas;
  return sb;
}
const corpo = c => JSON.parse(c.opts.body);

beforeEach(() => localStorage.clear());

describe("grava nos dois lugares", () => {
  it("na tabela do banco e no navegador", () => {
    const sb = espiao();
    registrarAuditoria(sb, USER, "editar leito", "POSTO 1 · 102", { status: "livre" });

    expect(sb.chamadas).toHaveLength(1);
    expect(sb.chamadas[0].caminho).toBe("auditoria");
    expect(sb.chamadas[0].opts.method).toBe("POST");
    expect(corpo(sb.chamadas[0])).toMatchObject({
      usuario: "Ana Souza", acao: "editar leito", alvo: "POSTO 1 · 102",
    });

    const local = lerTrilhaLocal();
    expect(local).toHaveLength(1);
    expect(local[0]).toMatchObject({ user: "Ana Souza", acao: "editar leito" });
  });

  it("🔴 as duas cópias levam o MESMO instante", () => {
    // Eram duas chamadas a `Date` separadas. A linha do navegador e a do
    // banco saíam com horários diferentes, e conferir uma contra a outra
    // virava adivinhação — numa trilha, exatamente o trabalho que ela
    // deveria dispensar.
    const sb = espiao();
    registrarAuditoria(sb, USER, "x", "y", {});
    expect(corpo(sb.chamadas[0]).ts).toBe(lerTrilhaLocal()[0].ts);
  });

  it("⚠️ sem banco, a trilha do navegador continua sendo escrita", () => {
    registrarAuditoria(null, USER, "dar alta", "T-9020", {});
    expect(lerTrilhaLocal()[0].acao).toBe("dar alta");
  });

  it("o mais recente vem primeiro", () => {
    const sb = espiao();
    registrarAuditoria(sb, USER, "primeira", "a", {});
    registrarAuditoria(sb, USER, "segunda", "b", {});
    expect(lerTrilhaLocal().map(l => l.acao)).toEqual(["segunda", "primeira"]);
  });

  it(`o navegador guarda no máximo ${LIMITE_LOCAL}`, () => {
    for (let i = 0; i < LIMITE_LOCAL + 15; i++) registrarAuditoria(null, USER, `a${i}`, "x", {});
    const l = lerTrilhaLocal();
    expect(l).toHaveLength(LIMITE_LOCAL);
    // Quem sai é a MAIS ANTIGA, não a mais nova.
    expect(l[0].acao).toBe(`a${LIMITE_LOCAL + 14}`);
  });
});

describe("🔴 a autoria de verdade vem do banco", () => {
  it("`usuario_id` NÃO é enviado pelo cliente", () => {
    // A coluna tem `default auth.uid()`: quem carimba é o Postgres. Se o
    // cliente passar a mandar, volta o defeito que a migração corrigiu —
    // pela API, qualquer autenticado assina com o nome de outra pessoa, e
    // uma trilha assinável por terceiro não prova nada.
    const sb = espiao();
    registrarAuditoria(sb, { ...USER, id: "111", usuario_id: "222" }, "x", "y", {});
    const b = corpo(sb.chamadas[0]);
    expect(b).not.toHaveProperty("usuario_id");
    expect(Object.keys(b).sort()).toEqual(["acao", "alvo", "ts", "usuario"]);
  });

  it("usuário sem nome não inventa um", () => {
    const sb = espiao();
    registrarAuditoria(sb, null, "x", "y", {});
    expect(corpo(sb.chamadas[0]).usuario).toBeUndefined();
    // No navegador o campo é obrigatório para a lista não quebrar: "?".
    expect(lerTrilhaLocal()[0].user).toBe("?");
  });
});

describe("🔴 registrar NUNCA pode derrubar o ato registrado", () => {
  it("objeto circular em `dados` não estoura", () => {
    // Passar um evento do React sem querer em `dados` é o caso real: ele
    // tem referência para o próprio alvo, e `JSON.stringify` lança.
    const circular = { nome: "leito" };
    circular.eu = circular;
    const sb = espiao();

    expect(() => registrarAuditoria(sb, USER, "editar", "102", circular)).not.toThrow();
    // E a trilha continua sendo gravada, sem o detalhe.
    expect(lerTrilhaLocal()[0].dados).toBe("[não serializável]");
    expect(sb.chamadas).toHaveLength(1);
  });

  it("localStorage bloqueado ou cheio não estoura — e o banco ainda recebe", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException("QuotaExceededError"); };
    const sb = espiao();
    try {
      expect(() => registrarAuditoria(sb, USER, "dispensar", "AMOX 500", {})).not.toThrow();
      // 🔴 A trilha institucional é a que importa: ela tem de sair mesmo
      // com o navegador recusando escrever.
      expect(sb.chamadas).toHaveLength(1);
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it("localStorage com lixo dentro devolve lista vazia, não explode", () => {
    localStorage.setItem(AUDIT_KEY, "{isso não é json");
    expect(lerTrilhaLocal()).toEqual([]);
    expect(() => registrarAuditoria(null, USER, "x", "y", {})).not.toThrow();
    expect(lerTrilhaLocal()).toHaveLength(1);
  });

  it("⚠️ e um JSON válido que não é lista também", () => {
    // `JSON.parse` devolveria o objeto sem erro, e o `unshift` seguinte
    // estouraria — passar pelo try/catch não basta, o tipo tem de ser
    // conferido.
    localStorage.setItem(AUDIT_KEY, '{"nao":"e lista"}');
    expect(lerTrilhaLocal()).toEqual([]);
    expect(() => registrarAuditoria(null, USER, "x", "y", {})).not.toThrow();
  });
});

describe("não se espera a gravação", () => {
  it("devolve sem depender da rede", () => {
    // Auditar é efeito colateral do ato; o ato não pode ficar mais lento
    // por causa da trilha. `sb` lento não segura ninguém.
    let resolver;
    const sb = () => new Promise(r => { resolver = r; });
    expect(registrarAuditoria(sb, USER, "x", "y", {})).toBeUndefined();
    expect(lerTrilhaLocal()).toHaveLength(1);
    resolver?.([]);
  });
});
