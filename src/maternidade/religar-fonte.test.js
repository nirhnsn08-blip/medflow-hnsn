// ═══════════════════════════════════════════════════════════
// A ADMISSÃO OBSTÉTRICA NÃO ESCREVE EM QUEM ESTIVER NO LEITO
//
// 🔴 DEFEITO REAL: ao cadastrar a gestante que chegou só com iniciais, o
// prontuário emitido era gravado com o filtro `leitos?identificacao=eq.<X>`.
// Entre a leitura da fila e o cadastro, o leito pode ter trocado de paciente
// — alta e nova internação acontecem em minutos na maternidade — e o
// prontuário ia para a linha de OUTRA mulher. Identificar pelo leito é o que
// a Meta Internacional de Segurança do Paciente nº 1 proíbe, e o erro só
// apareceria quando alguém abrisse o prontuário errado.
//
// O erro era engolido: `catch {}` sem olhar o retorno. Então o teste olha a
// URL que foi ao banco — é lá que mora a diferença.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { cadastrarGestante } from "./dados.js";

/**
 * Banco falso: guarda cada requisição e responde pelo que a tabela deve
 * devolver. `leitoDaOutra` simula o leito que trocou de paciente — o PATCH
 * com o filtro certo não acha linha nenhuma e volta vazio.
 */
function bancoFalso({ leitoDaOutra = false, psJaTem = false } = {}) {
  const req = [];
  const sb = async (url, opt = {}) => {
    req.push({ url, metodo: opt.method || "GET", corpo: opt.body ? JSON.parse(opt.body) : null });
    if (url === "rpc/proximo_prontuario") return { proximo_prontuario: "T7777" };
    if (url === "pacientes") return [{ prontuario: "T7777", nome_completo: "Ana Lima", iniciais: "A.L." }];
    if (url.startsWith("leitos")) return leitoDaOutra ? [] : [{ identificacao: "M-02", prontuario: "T7777" }];
    if (url.startsWith("ps_atendimentos")) return psJaTem ? [] : [{ id: 55, prontuario: "T7777" }];
    return [];
  };
  sb.req = req;
  return sb;
}

const USER = { name: "teste" };
const DADOS = { nome_completo: "Ana Lima", data_nascimento: "1998-03-02" };
const patchDe = (sb, tabela) => sb.req.find(r => r.metodo === "PATCH" && r.url.startsWith(tabela));

describe("religar o leito ao prontuário emitido", () => {
  it("🔴 o PATCH exige que o leito AINDA esteja sem prontuário e com as mesmas iniciais", async () => {
    const sb = bancoFalso();
    const r = await cadastrarGestante(sb, DADOS, USER, { leito: "M-02", psId: 55 });
    expect(r.ok).toBe(true);
    const p = patchDe(sb, "leitos");
    expect(p.url).toContain("identificacao=eq.M-02");
    expect(p.url).toContain("prontuario=is.null");    // a trava que faltava
    expect(p.url).toContain("iniciais=eq.A.L.");      // o 2º identificador
    expect(p.corpo).toEqual({ prontuario: "T7777" });
  });

  it("🔴 se o leito trocou de paciente, NADA é gravado nele e a tela é avisada", async () => {
    const sb = bancoFalso({ leitoDaOutra: true });
    const r = await cadastrarGestante(sb, DADOS, USER, { leito: "M-02", psId: 55 });
    // A admissão continua valendo: o cadastro e o prontuário foram criados.
    expect(r.ok).toBe(true);
    expect(r.paciente.prontuario).toBe("T7777");
    // Mas a pendência é dita, em vez de supor que deu certo.
    expect(r.aviso).toContain("M-02");
    expect(r.aviso).toContain("Giro de Leitos");
  });

  it("o atendimento do PS é religado pelo id, e só se ainda estiver sem prontuário", async () => {
    const sb = bancoFalso();
    const p = patchDe(await (async () => { await cadastrarGestante(sb, DADOS, USER, { psId: 55 }); return sb; })(), "ps_atendimentos");
    expect(p.url).toContain("id=eq.55");
    expect(p.url).toContain("prontuario=is.null");
  });

  it("quando tudo religa, não há aviso nenhum (ruído não se inventa)", async () => {
    const sb = bancoFalso();
    const r = await cadastrarGestante(sb, DADOS, USER, { leito: "M-02", psId: 55 });
    expect(r.aviso).toBe(null);
  });

  it("sem leito nem PS na fila, nenhum PATCH é tentado", async () => {
    const sb = bancoFalso();
    const r = await cadastrarGestante(sb, DADOS, USER, {});
    expect(r.ok).toBe(true);
    expect(r.aviso).toBe(null);
    expect(sb.req.some(x => x.metodo === "PATCH")).toBe(false);
  });

  it("gravação do cadastro que não volta não vira sucesso", async () => {
    const sb = async (url) => {
      if (url === "pacientes") return [];               // 2xx sem linha: o 204 mentiroso
      if (url === "rpc/proximo_prontuario") return { proximo_prontuario: "T7777" };
      return [];
    };
    const r = await cadastrarGestante(sb, DADOS, USER, { leito: "M-02" });
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("T7777");               // o número emitido não se perde
  });
});

// ═══════════════════════════════════════════════════════════
// 🔴 A FÁBRICA DA DIVERGÊNCIA DE INICIAIS
//
// Este arquivo tinha o SEU PRÓPRIO `iniciaisDe`, que partia o nome por
// espaço e pegava a primeira letra de cada pedaço — inclusive das
// partículas. "Maria de Souza Lima" saía "M.D.S.L." aqui e "M.S.L." no
// `identidade.js`, que descarta "de/da/do/dos/e" porque partícula não
// identifica ninguém.
//
// O efeito não ficava neste arquivo: a gestante NASCIA com
// `pacientes.iniciais` já divergindo do próprio `nome_completo`, e o resto
// do sistema (que deriva de `comoExibir`) passava a mostrar um rótulo
// diferente do gravado — a mesma pessoa com dois rótulos em telas
// diferentes. É a divergência que o mapa cirúrgico agora acusa.
//
// Nenhum teste pegava: os nomes usados aqui ("Ana Lima") não têm partícula,
// e as duas implementações concordavam neles.
// ═══════════════════════════════════════════════════════════
describe("🔴 as iniciais da gestante saem da fonte única", () => {
  it("partícula não vira inicial: 'Maria de Souza Lima' grava M.S.L.", async () => {
    const sb = bancoFalso();
    await cadastrarGestante(sb, { nome_completo: "Maria de Souza Lima", data_nascimento: "1998-03-02" }, USER);
    const post = sb.req.find(r => r.metodo === "POST" && r.url === "pacientes");
    expect(post.corpo.iniciais).toBe("M.S.L.");
  });

  it("acento não muda a inicial: 'Ângela Souza' grava A.S.", async () => {
    const sb = bancoFalso();
    await cadastrarGestante(sb, { nome_completo: "Ângela Souza", data_nascimento: "1998-03-02" }, USER);
    const post = sb.req.find(r => r.metodo === "POST" && r.url === "pacientes");
    expect(post.corpo.iniciais).toBe("A.S.");
  });

  // A coluna não deve guardar string vazia — a função compartilhada devolve
  // "" onde a cópia local devolvia null.
  it("o que vai para a coluna nunca é string vazia", async () => {
    const sb = bancoFalso();
    await cadastrarGestante(sb, { nome_completo: "Ana Lima", data_nascimento: "1998-03-02" }, USER);
    const post = sb.req.find(r => r.metodo === "POST" && r.url === "pacientes");
    expect(post.corpo.iniciais).toBe("A.L.");
    expect(post.corpo.iniciais).not.toBe("");
  });
});
