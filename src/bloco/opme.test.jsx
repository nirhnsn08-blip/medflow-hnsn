// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// OPME COM LOTE — E A PERGUNTA DO RECALL
//
// 🔴 ATÉ AQUI OPME ERA UM `textarea`: um campo de texto livre, sem lote,
// sem série, sem registro ANVISA, sem vínculo com estoque.
//
// Quando o fabricante recolhe um lote de prótese, a pergunta é "em QUEM
// implantamos este lote?". Com texto livre, a resposta é ler cirurgia por
// cirurgia torcendo para alguém ter digitado o número — na prática o
// hospital não responde, e não responder é não chamar de volta quem
// precisa de revisão.
//
// ⚠️ O teste mais importante deste arquivo não é o da trava do lote: é o
// de que a busca do recall NUNCA responde "ninguém" quando a leitura
// falhou. Essa é a única tela do sistema em que uma lista vazia errada faz
// o hospital deixar um produto recolhido dentro de uma pessoa.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  NATUREZAS, agruparRecall, conferirEstorno, conferirOpme, estornada,
  implantesVigentes, linhaDeEstorno, linhaDeOpme, pendentesDeBaixa,
  resumoDoMaterial, termoDeBusca, vigentes,
} from "./opme.js";
import { OpmeModal, RastrearLote } from "./Opme.jsx";
import { FALHA } from "../util/leitura.js";

afterEach(cleanup);

const CIR = { id: 9, iniciais: "A.B.C.", procedimento: "Artroplastia de joelho", status: "concluida" };
const OK = { natureza: "implante", descricao: "Protese total de joelho", lote: "LOT-A77", quantidade: 1 };

// ── A TRAVA CENTRAL ─────────────────────────────────────────
describe("🔴 implante sem lote não entra", () => {
  it("a recusa diz para que serve o lote", () => {
    const v = conferirOpme({ cirurgia: CIR, form: { ...OK, lote: "" } });
    expect(v.ok).toBe(false);
    expect(v.erros.join(" ")).toMatch(/IMPLANTE SEM LOTE não entra/);
    expect(v.erros.join(" ")).toMatch(/é por ele que um recall procura/);
  });

  it("🔴 descartável NÃO exige lote — exigir de tudo faria preencher lixo", () => {
    const v = conferirOpme({ cirurgia: CIR, form: { natureza: "descartavel", descricao: "Compressa", quantidade: 5 } });
    expect(v.ok).toBe(true);
  });

  it("instrumental em comodato também não exige", () => {
    expect(conferirOpme({ cirurgia: CIR, form: { natureza: "instrumental", descricao: "Caixa de ortopedia", quantidade: 1 } }).ok).toBe(true);
  });

  it("quantidade zero ou negativa não passa", () => {
    expect(conferirOpme({ cirurgia: CIR, form: { ...OK, quantidade: 0 } }).ok).toBe(false);
    expect(conferirOpme({ cirurgia: CIR, form: { ...OK, quantidade: -1 } }).ok).toBe(false);
  });

  it("cirurgia cancelada não consome material", () => {
    expect(conferirOpme({ cirurgia: { ...CIR, status: "cancelada" }, form: OK }).erros.join(" "))
      .toMatch(/CANCELADA/);
  });

  it("o caminho limpo passa", () => {
    expect(conferirOpme({ cirurgia: CIR, form: OK }).ok).toBe(true);
  });
});

// ── A ASSIMETRIA DELIBERADA ─────────────────────────────────
describe("🔴 registro ANVISA é aviso, lote é recusa", () => {
  it("implante sem registro ANVISA entra, avisando", () => {
    // O LOTE é o que um recall procura; o registro é o que um auditor
    // procura. Recall é emergência; auditoria tem prazo.
    const v = conferirOpme({ cirurgia: CIR, form: OK });
    expect(v.ok).toBe(true);
    expect(v.avisos.join(" ")).toMatch(/RDC 751\/2022/);
  });

  it("com o registro, o aviso some", () => {
    const v = conferirOpme({ cirurgia: CIR, form: { ...OK, registro_anvisa: "80146700001" } });
    expect(v.avisos.join(" ")).not.toMatch(/RDC 751/);
  });

  it("fora do catálogo e não consignado avisa que não dá baixa", () => {
    expect(conferirOpme({ cirurgia: CIR, form: OK }).avisos.join(" "))
      .toMatch(/NÃO dá baixa no almoxarifado/);
  });

  it("validade vencida avisa — e pelo dia civil, não por fatia de UTC", () => {
    const v = conferirOpme({ cirurgia: CIR, form: { ...OK, validade: "2020-01-01" } });
    expect(v.avisos.join(" ")).toMatch(/validade informada já passou/);
    expect(conferirOpme({ cirurgia: CIR, form: { ...OK, validade: "2099-01-01" } }).avisos.join(" "))
      .not.toMatch(/validade/);
  });
});

// ── A LINHA GRAVADA ─────────────────────────────────────────
describe("a linha gravada", () => {
  it("🔴 NÃO decide a baixa de estoque — quem decide é o banco", () => {
    const l = linhaDeOpme({ cirurgia: CIR, form: { ...OK, item_id: "3" } });
    expect(l).not.toHaveProperty("baixa_estoque");
    expect(l).not.toHaveProperty("movimento_id");
    expect(l.item_id).toBe(3);
    expect(l.implante).toBe(true);
  });

  it("a natureza define `implante`, não um campo solto", () => {
    expect(linhaDeOpme({ cirurgia: CIR, form: { ...OK, natureza: "descartavel" } }).implante).toBe(false);
  });

  it("vazio vira null, não string vazia", () => {
    const l = linhaDeOpme({ cirurgia: CIR, form: { ...OK, fabricante: "  ", numero_serie: "" } });
    expect(l.fabricante).toBeNull();
    expect(l.numero_serie).toBeNull();
  });

  it("o estorno copia item, lote e quantidade — é o que devolve ao estoque", () => {
    const orig = { id: 5, cirurgia_id: 9, item_id: 2, lote: "CMP", quantidade: 5, implante: false };
    const e = linhaDeEstorno({ linha: orig, motivo: "Lançado em dobro na conferência do fim da sala." });
    expect(e).toMatchObject({ estorno_de: 5, item_id: 2, lote: "CMP", quantidade: 5 });
  });
});

// ── O ESTORNO ───────────────────────────────────────────────
describe("🔴 correção é estorno, não edição", () => {
  const linha = { id: 5, cirurgia_id: 9, descricao: "Compressa" };

  it("exige motivo de verdade", () => {
    expect(conferirEstorno({ linha, motivo: "errei" })).toMatch(/exige o motivo/);
    expect(conferirEstorno({ linha, motivo: "Lançado em dobro na conferência." })).toBeNull();
  });

  it("não se estorna um estorno", () => {
    expect(conferirEstorno({ linha: { ...linha, estorno_de: 1 }, motivo: "Motivo suficientemente longo." }))
      .toMatch(/já é um estorno/);
  });

  it("não se estorna duas vezes a mesma linha", () => {
    const todas = [linha, { id: 6, estorno_de: 5 }];
    expect(conferirEstorno({ linha, motivo: "Motivo suficientemente longo.", todas }))
      .toMatch(/já foi estornada/);
    expect(estornada(linha, todas)).toBe(true);
  });
});

// ── O QUE VALE ──────────────────────────────────────────────
describe("🔴 só o que VALE conta — estorno não é implante", () => {
  const protese = { id: 1, implante: true, descricao: "Protese", lote: "A" };
  const compressa = { id: 2, implante: false, descricao: "Compressa", item_id: 2, baixa_estoque: true };
  const errada = { id: 3, implante: true, descricao: "Protese errada", lote: "B" };
  const oEstorno = { id: 4, estorno_de: 3, descricao: "Protese errada" };
  const todas = [protese, compressa, errada, oEstorno];

  it("a linha estornada e o estorno saem da lista", () => {
    expect(vigentes(todas).map(l => l.id)).toEqual([1, 2]);
  });

  it("os implantes vigentes são só os que ficaram no paciente", () => {
    expect(implantesVigentes(todas).map(l => l.id)).toEqual([1]);
  });

  it("🔴 FALHA atravessa — filtrar apagaria a marca", () => {
    // Numa tela que decide recall, "não consegui ler" virando
    // "não usou material" é o pior resultado possível.
    expect(vigentes(FALHA)).toBe(FALHA);
    expect(implantesVigentes(FALHA)).toBe(FALHA);
  });

  it("pendente de baixa é só item do catálogo, não consignado, sem baixa", () => {
    const linhas = [
      { id: 1, item_id: 2, consignado: false, baixa_estoque: false, descricao: "sem saldo" },
      { id: 2, item_id: 2, consignado: false, baixa_estoque: true, descricao: "baixou" },
      { id: 3, item_id: 2, consignado: true, baixa_estoque: false, descricao: "consignado" },
      { id: 4, item_id: null, consignado: false, baixa_estoque: false, descricao: "fora do catálogo" },
    ];
    expect(pendentesDeBaixa(linhas).map(l => l.id)).toEqual([1]);
  });
});

// ── O RECALL ────────────────────────────────────────────────
describe("🔴 a consulta do recall", () => {
  it("o termo é normalizado dos dois lados", () => {
    // Lote vem de etiqueta digitada por gente; recall que erra por espaço
    // em branco é recall que não aconteceu.
    expect(termoDeBusca("  LOT-A77 ")).toBe("lot-a77");
    expect(termoDeBusca(null)).toBe("");
  });

  it("agrupa por PACIENTE, não por cirurgia — quem conduz recall liga para pessoas", () => {
    const g = agruparRecall([
      { id: 1, prontuario: "T1", nome_completo: "Ana", descricao: "Protese" },
      { id: 2, prontuario: "T1", nome_completo: "Ana", descricao: "Parafuso" },
      { id: 3, prontuario: "T2", nome_completo: "Bruno", descricao: "Protese" },
    ]);
    expect(g).toHaveLength(2);
    expect(g[0].nome).toBe("Ana");
    expect(g[0].itens).toHaveLength(2);
  });

  it("paciente sem cadastro não some do resultado", () => {
    const g = agruparRecall([{ id: 1, cirurgia_id: 7, descricao: "Protese" }]);
    expect(g).toHaveLength(1);
  });

  it("o resumo do material traz lote e série", () => {
    expect(resumoDoMaterial({ descricao: "Protese", lote: "A77", numero_serie: "SN1", quantidade: 1 }))
      .toBe("Protese · lote A77 · série SN1");
    expect(resumoDoMaterial(null)).toBeNull();
  });
});

// ── A TELA DO RECALL ────────────────────────────────────────
describe("🔴 a tela do recall", () => {
  const achou = [{
    id: 1, prontuario: "T9060", nome_completo: "Clara Lima Barbosa", iniciais: "C.L.B.",
    descricao: "Protese total de joelho", lote: "LOT-A77", implante: true,
    procedimento: "Artroplastia", cirurgia_data: "2026-10-08",
  }];
  const abrir = resposta => {
    const onBuscar = vi.fn(async () => resposta);
    render(<RastrearLote onBuscar={onBuscar} />);
    return onBuscar;
  };
  const buscar = async termo => {
    fireEvent.change(screen.getByPlaceholderText(/LOT-A77/), { target: { value: termo } });
    fireEvent.click(screen.getByRole("button", { name: /Rastrear/ }));
  };

  it("acha e mostra NOME e prontuário — a resposta vira telefonema", async () => {
    abrir({ linhas: achou, naoLi: false });
    await buscar("LOT-A77");
    await waitFor(() => expect(screen.getByText(/Clara Lima Barbosa/)).toBeTruthy());
    expect(document.body.textContent).toMatch(/prontuário T9060/);
    expect(document.body.textContent).toMatch(/1 paciente\(s\) receberam material deste lote/);
  });

  it("🔴 leitura que FALHOU não responde 'ninguém'", async () => {
    // É a única tela do sistema em que uma lista vazia errada faz o
    // hospital deixar um produto recolhido dentro de uma pessoa.
    abrir({ linhas: [], naoLi: true });
    await buscar("LOT-A77");
    await waitFor(() => expect(screen.getByText(/NÃO CONSEGUI CONSULTAR/)).toBeTruthy());
    expect(document.body.textContent).toMatch(/este resultado não é "ninguém"/);
    expect(document.body.textContent).toMatch(/Não conclua que o lote não foi usado/);
    // 🔴 E a frase de "não achei" NÃO pode aparecer junto: as duas lado a
    // lado são contraditórias, e é a segunda que se lê como resposta.
    expect(screen.queryByText(/Nenhum registro do lote/)).toBeNull();
  });

  it("buscou e não achou é um estado DIFERENTE, e diz o que não cobre", async () => {
    abrir({ linhas: [], naoLi: false });
    await buscar("LOT-ZZZ");
    await waitFor(() => expect(screen.getByText(/Nenhum registro do lote/)).toBeTruthy());
    // As cirurgias antigas ficaram no textarea e não aparecem aqui.
    expect(document.body.textContent).toMatch(/texto livre, não aparecem nesta busca/);
  });

  it("antes de buscar, não afirma nada", () => {
    abrir({ linhas: [], naoLi: false });
    expect(screen.queryByText(/Nenhum registro do lote/)).toBeNull();
    expect(screen.queryByText(/NÃO CONSEGUI CONSULTAR/)).toBeNull();
  });

  it("não busca com termo curto demais", () => {
    const onBuscar = abrir({ linhas: [], naoLi: false });
    fireEvent.change(screen.getByPlaceholderText(/LOT-A77/), { target: { value: "A" } });
    expect(screen.getByRole("button", { name: /Rastrear/ }).disabled).toBe(true);
    expect(onBuscar).not.toHaveBeenCalled();
  });
});

// ── O MODAL DO MATERIAL ─────────────────────────────────────
describe("o modal do material", () => {
  const abrir = (props = {}) => {
    const onRegistrar = vi.fn(async () => ({ ok: true }));
    const onEstornar = vi.fn(async () => ({ ok: true }));
    render(<OpmeModal cirurgia={CIR} materiais={[]} itens={[{ id: 2, nome: "Compressa" }]}
      onClose={vi.fn()} onRegistrar={onRegistrar} onEstornar={onEstornar} {...props} />);
    return { onRegistrar, onEstornar };
  };

  it("as três naturezas aparecem", () => {
    abrir();
    for (const n of NATUREZAS) expect(screen.getByRole("button", { name: n.label })).toBeTruthy();
  });

  it("🔴 o rótulo do lote diz que é obrigatório para implante, e some para descartável", () => {
    abrir();
    expect(screen.getByText(/obrigatório para implante/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Descartável / consumo" }));
    expect(screen.queryByText(/obrigatório para implante/)).toBeNull();
  });

  it("não grava implante sem lote", () => {
    abrir();
    fireEvent.change(screen.getByPlaceholderText(/como está na etiqueta/), { target: { value: "Protese" } });
    expect(screen.getByRole("button", { name: /Registrar material/ }).disabled).toBe(true);
  });

  it("grava com lote", async () => {
    const { onRegistrar } = abrir();
    fireEvent.change(screen.getByPlaceholderText(/como está na etiqueta/), { target: { value: "Protese" } });
    fireEvent.change(screen.getByPlaceholderText(/como está na embalagem/), { target: { value: "LOT-A77" } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar material/ }));
    await waitFor(() => expect(onRegistrar).toHaveBeenCalled());
    expect(onRegistrar.mock.calls[0][0]).toMatchObject({ implante: true, lote: "LOT-A77" });
  });

  it("🔴 a pendência de baixa aparece sem derrubar o registro", () => {
    abrir({ materiais: [{ id: 1, cirurgia_id: 9, descricao: "Protese", lote: "A", implante: true,
                          item_id: 2, consignado: false, baixa_estoque: false,
                          baixa_motivo: "Baixa no estoque não aplicada: Estoque insuficiente no lote (disponível: 0)." }] });
    expect(screen.getByText(/1 item\(ns\) sem baixa no estoque/)).toBeTruthy();
    expect(document.body.textContent).toMatch(/O registro do que entrou no\s+paciente está completo/);
    // E o item continua listado como registrado.
    expect(document.body.textContent).toMatch(/IMPLANTE/);
  });

  it("🔴 leitura falhada avisa que a lista pode não ser tudo", () => {
    abrir({ materiais: FALHA });
    expect(screen.getByText(/Não consegui ler o material desta cirurgia/)).toBeTruthy();
  });
});
