// A internação na farmácia: fila, validação, devolução e conciliação.
import { describe, it, expect } from "vitest";
import { FALHA } from "../util/leitura.js";
import {
  filaDaInternacao, situacaoDaValidacao, podeDispensarInternado, ultimaValidacao, vinculoDoInternado, episodioAberto,
} from "./internacao.js";
import { devolviveis, conferirDevolucao, movimentoDeDevolucao } from "./devolucao.js";
import { conciliar, administracoesValidas } from "./conciliacao.js";

const EP = { id: 1, prontuario: "T1", iniciais: "A.B.", leito: "12", setor: "POSTO 1", status: "aberto" };
const PRESC = { id: 10, episodio_id: 1, assinada_em: "2026-09-17T08:00:00Z", prescritor_nome: "Dra. X", conselho: "CRM", registro_conselho: "123/RS" };
const item = (idItem, extra = {}) => ({ id: idItem, prescricao_id: 10, episodio_id: 1, tipo: "medicamento", medicamento_id: 100 + idItem, descricao: `Med ${idItem}`, ...extra });

describe("fila da internação", () => {
  it("🔴 a prescrição do internado entra na fila da farmácia", () => {
    const fila = filaDaInternacao({ episodios: [EP], prescricoes: [PRESC], itens: [item(1), item(2)] });
    expect(fila).toHaveLength(1);
    expect(fila[0].itens.map(i => i.medicamento_nome)).toEqual(["Med 1", "Med 2"]);
    expect(fila[0].aDispensar).toHaveLength(2);
  });

  it("item com saída ligada ao item da internação deixa de ser pendente", () => {
    const fila = filaDaInternacao({
      episodios: [EP], prescricoes: [PRESC], itens: [item(1), item(2)],
      movimentos: [{ pep_item_id: 1, tipo: "saida", quantidade: 4 }],
    });
    expect(fila[0].aDispensar.map(i => i.id)).toEqual([2]);
  });

  it("🔴 saída do PS com o MESMO número de item não conta para a internação", () => {
    const fila = filaDaInternacao({
      episodios: [EP], prescricoes: [PRESC], itens: [item(1)],
      movimentos: [{ prescricao_item_id: 1, tipo: "saida", quantidade: 4 }],
    });
    expect(fila[0].aDispensar.map(i => i.id)).toEqual([1]);
  });

  it("item suspenso não se dispensa — e, se já saiu, vira candidato a devolução", () => {
    const fila = filaDaInternacao({
      episodios: [EP], prescricoes: [PRESC], itens: [item(1), item(2)],
      eventos: [{ id: 1, item_id: 2, evento: "suspenso", criado_em: "2026-09-17T10:00:00Z" }],
      movimentos: [{ pep_item_id: 2, tipo: "saida", quantidade: 3 }],
    });
    expect(fila[0].itens.map(i => i.id)).toEqual([1]);
    expect(fila[0].suspensosComSaida.map(i => [i.id, i.dispensado])).toEqual([[2, 3]]);
  });

  it("prescrição substituída sai de cena; vale a nova", () => {
    const nova = { id: 11, episodio_id: 1, assinada_em: "2026-09-18T08:00:00Z", substitui_id: 10 };
    const fila = filaDaInternacao({
      episodios: [EP], prescricoes: [PRESC, nova],
      itens: [item(1), { ...item(5), prescricao_id: 11 }],
    });
    expect(fila[0].presc.id).toBe(11);
    expect(fila[0].itens.map(i => i.id)).toEqual([5]);
  });

  it("dieta e cuidado não são da farmácia; item escrito à mão fica separado", () => {
    const fila = filaDaInternacao({
      episodios: [EP], prescricoes: [PRESC],
      itens: [item(1), item(2, { tipo: "dieta" }), item(3, { medicamento_id: null })],
    });
    expect(fila[0].itens.map(i => i.id)).toEqual([1, 3]);
    expect(fila[0].semCatalogo.map(i => i.id)).toEqual([3]);
    expect(fila[0].aDispensar.map(i => i.id)).toEqual([1]);
  });

  it("alta e episódio encerrado saem da fila; sem prescrição assinada também", () => {
    expect(episodioAberto({ ...EP, alta_em: "2026-09-17" })).toBe(false);
    expect(episodioAberto({ ...EP, status: "encerrado" })).toBe(false);
    expect(filaDaInternacao({ episodios: [EP], prescricoes: [{ ...PRESC, assinada_em: null }], itens: [item(1)] })).toEqual([]);
  });

  it("aguenta listas nulas", () => {
    expect(filaDaInternacao({ episodios: null, prescricoes: null })).toEqual([]);
    expect(filaDaInternacao()).toEqual([]);
  });
});

describe("validação farmacêutica", () => {
  const v = (resultado, criado_em, extra = {}) => ({ id: Math.random(), prescricao_id: 10, resultado, criado_em, ...extra });

  it("vale a MAIS RECENTE", () => {
    const linhas = [v("pendente_prescritor", "2026-09-17T09:00:00Z"), v("aprovada", "2026-09-17T11:00:00Z")];
    expect(ultimaValidacao(linhas, 10).resultado).toBe("aprovada");
    expect(situacaoDaValidacao(linhas, PRESC).estado).toBe("aprovada");
  });

  it("validação de OUTRA prescrição não vale para esta (a de ontem não valida a de hoje)", () => {
    expect(situacaoDaValidacao([{ ...v("aprovada", "2026-09-16T09:00:00Z"), prescricao_id: 9 }], PRESC).estado).toBe("nao_validada");
  });

  it("🔴 leitura que falhou é 'não conferida', nunca 'não validada' nem 'validada'", () => {
    expect(situacaoDaValidacao(FALHA, PRESC).estado).toBe("nao_lida");
    expect(podeDispensarInternado(situacaoDaValidacao(FALHA, PRESC)).avisos[0]).toMatch(/Não foi possível ler/);
  });

  it("🔴 pendência do prescritor RECUSA a dispensação e diz o motivo", () => {
    const r = podeDispensarInternado({ estado: "pendente_prescritor", linha: { observacao: "Dose de vancomicina acima para o ClCr" } });
    expect(r.ok).toBe(false);
    expect(r.erros[0]).toMatch(/vancomicina/);
  });

  it("não validada AVISA e deixa seguir — a primeira dose não espera", () => {
    const r = podeDispensarInternado({ estado: "nao_validada" });
    expect(r.ok).toBe(true);
    expect(r.avisos).toHaveLength(1);
  });

  it("o vínculo leva episódio, paciente, leito e o prescritor da prescrição", () => {
    expect(vinculoDoInternado(EP, PRESC)).toEqual({
      episodio_id: 1, paciente_iniciais: "A.B.", paciente_prontuario: "T1", setor: "POSTO 1 · leito 12",
      prescritor_nome: "Dra. X", prescritor_registro: "CRM 123/RS",
    });
  });
});

describe("devolução do setor", () => {
  const saida = { id: 50, tipo: "saida", motivo: "Dispensação", quantidade: 10, medicamento_id: 7, lote: "L1", pep_item_id: 1, episodio_id: 1, paciente_prontuario: "T1" };

  it("cabe o que saiu menos o que já voltou", () => {
    const movs = [saida, { id: 51, tipo: "entrada", quantidade: 4, devolucao_de: 50, pep_item_id: 1 }];
    expect(devolviveis(movs, 1, "pep_item_id")).toEqual([{ saida, devolvido: 4, restante: 6 }]);
  });

  it("devolução estornada não conta; dispensação estornada não aceita devolução", () => {
    const devol = { id: 51, tipo: "entrada", quantidade: 4, devolucao_de: 50, pep_item_id: 1 };
    const estornoDaDevol = { id: 52, tipo: "saida", quantidade: 4, estorno_de: 51, pep_item_id: 1 };
    expect(devolviveis([saida, devol, estornoDaDevol], 1, "pep_item_id")[0].restante).toBe(10);
    const estornoDaSaida = { id: 53, tipo: "entrada", quantidade: 10, estorno_de: 50, pep_item_id: 1 };
    expect(devolviveis([saida, estornoDaSaida], 1, "pep_item_id")).toEqual([]);
  });

  it("tudo devolvido some da lista", () => {
    expect(devolviveis([saida, { id: 51, tipo: "entrada", quantidade: 10, devolucao_de: 50 }], 1, "pep_item_id")).toEqual([]);
  });

  it("a conferência recusa acima do limite e sem motivo", () => {
    const d = { saida, restante: 6 };
    expect(conferirDevolucao({ disponivel: d, quantidade: 7, motivo: "Alta" }).erros[0]).toMatch(/no máximo 6/);
    expect(conferirDevolucao({ disponivel: d, quantidade: 2, motivo: "" }).ok).toBe(false);
    expect(conferirDevolucao({ disponivel: d, quantidade: 2, motivo: "Item suspenso" }).ok).toBe(true);
  });

  it("o movimento volta ao MESMO lote e leva paciente e vínculo", () => {
    expect(movimentoDeDevolucao(saida, 3, " Alta do paciente ")).toEqual({
      medicamento_id: 7, tipo: "entrada", quantidade: 3, lote: "L1", validade: null,
      motivo: "Devolução do setor", observacao: "Alta do paciente", devolucao_de: 50,
      pep_item_id: 1, episodio_id: 1, paciente_prontuario: "T1",
    });
  });
});

describe("conciliação checagem × dispensação", () => {
  const agora = new Date("2026-09-18T12:00:00Z");

  it("🔴 dose checada sem nada ter saído da farmácia", () => {
    const r = conciliar({
      administracoes: [{ chave: "T1", medicamento_id: 7, administrado_em: "2026-09-18T08:00:00Z" }],
      movimentos: [], agora,
    });
    expect(r.map(x => [x.tipo, x.doses])).toEqual([["administrado_sem_dispensacao", 1]]);
  });

  it("🔴 dispensado há mais de 24 h e nenhuma dose checada", () => {
    const r = conciliar({
      movimentos: [{ chave: "T1", medicamento_id: 7, tipo: "saida", quantidade: 4, created_at: "2026-09-17T08:00:00Z" }],
      agora,
    });
    expect(r.map(x => x.tipo)).toEqual(["dispensado_sem_administracao"]);
  });

  it("dispensado há menos de 24 h ainda não é divergência", () => {
    expect(conciliar({
      movimentos: [{ chave: "T1", medicamento_id: 7, tipo: "saida", quantidade: 4, created_at: "2026-09-18T08:00:00Z" }],
      agora,
    })).toEqual([]);
  });

  it("dispensação devolvida inteira + dose checada = administrado sem dispensação", () => {
    const r = conciliar({
      administracoes: [{ chave: "T1", medicamento_id: 7, administrado_em: "2026-09-18T08:00:00Z" }],
      movimentos: [
        { chave: "T1", medicamento_id: 7, tipo: "saida", quantidade: 4, created_at: "2026-09-17T08:00:00Z" },
        { chave: "T1", medicamento_id: 7, tipo: "entrada", quantidade: 4, devolucao_de: 1, created_at: "2026-09-17T20:00:00Z" },
      ],
      agora,
    });
    expect(r.map(x => x.tipo)).toEqual(["administrado_sem_dispensacao"]);
  });

  it("os dois lados presentes: sem divergência (quantidade não se compara)", () => {
    expect(conciliar({
      administracoes: [{ chave: "T1", medicamento_id: 7, administrado_em: "2026-09-18T08:00:00Z" }],
      movimentos: [{ chave: "T1", medicamento_id: 7, tipo: "saida", quantidade: 1, created_at: "2026-09-17T08:00:00Z" }],
      agora,
    })).toEqual([]);
  });

  it("paciente diferente não se mistura; item sem catálogo fica fora", () => {
    const r = conciliar({
      administracoes: [{ chave: "T2", medicamento_id: 7, administrado_em: "2026-09-18T08:00:00Z" }, { chave: "T1", medicamento_id: null }],
      movimentos: [{ chave: "T1", medicamento_id: 7, tipo: "saida", quantidade: 1, created_at: "2026-09-18T11:00:00Z" }],
      agora,
    });
    expect(r.map(x => [x.chave, x.tipo])).toEqual([["T2", "administrado_sem_dispensacao"]]);
  });

  it("dose não administrada e linha corrigida não contam como checagem", () => {
    expect(administracoesValidas([
      { id: 1, status: "administrado" },
      { id: 2, status: "nao_administrado" },
      { id: 3, status: "administrado", corrige_id: 1 },
    ]).map(a => a.id)).toEqual([3]);
  });
});
