// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// O CONVÊNIO QUE A RECEPÇÃO REDIGITAVA TODA VEZ
//
// `ag_agendamentos` NÃO tem coluna de convênio: a marcação sabe quem, quando
// e com quem, mas não sabe quem paga. Então a ficha da chegada nascia vazia,
// e quem vem todo mês tinha a fonte pagadora redigitada toda vez — ou
// esquecida, e aí a consulta chega ao faturamento sem quem paga e o erro só
// aparece no fechamento da competência.
//
// A regra já existia (`convenioSugerido`) e estava ligada SÓ no
// pronto-socorro. Aqui ela passa a valer no Atendimento.
//
// ⚠️ A DECISÃO DE DESENHO QUE ESTES TESTES GUARDAM: sugerir não é preencher.
// A sugestão é um BOTÃO, nunca um valor que aparece sozinho no campo.
// Convênio muda, carteira vence, e quem veio pelo SUS mês passado pode
// chegar hoje pelo plano. Preenchido sozinho, a recepção confirma sem olhar
// e a conta sai para quem não paga mais.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import FontePagadora from "./FontePagadora.jsx";
import { convenioSugerido, sugestaoUtil } from "./faturavel.js";
import { convenioDoHistorico } from "./dados.js";
import { FALHA, naoDeuParaLer } from "../util/leitura.js";

afterEach(cleanup);

const CAT = {
  convenios: [
    { id: 1, nome: "SUS - Sistema Unico de Saude", tipo: "sus" },
    { id: 2, nome: "Unimed", tipo: "convenio" },
  ],
  planos: [
    { id: 10, convenio_id: 2, nome: "Unimed Master" },
    { id: 11, convenio_id: 1, nome: "Plano do SUS (impossível, mas serve de isca)" },
  ],
};

// ── A REGRA ─────────────────────────────────────────────────
describe("convenioSugerido — o último convênio da pessoa", () => {
  it("pega o episódio mais recente, com plano junto", () => {
    const s = convenioSugerido([
      { convenio_id: "1", plano_id: null, chegada_em: "2025-02-03T13:00:00Z" },
      { convenio_id: "2", plano_id: "10", chegada_em: "2026-10-01T13:00:00Z" },
    ]);
    expect(s).toEqual({ convenio_id: "2", plano_id: "10", de: "2026-10-01" });
  });

  it("sem histórico com convênio, não inventa", () => {
    expect(convenioSugerido([])).toBeNull();
    expect(convenioSugerido([{ convenio_id: null, chegada_em: "2026-10-01T13:00:00Z" }])).toBeNull();
  });

  // "Não li" ≠ "nunca teve convênio". O chamador passa o resultado por
  // `listaLida`, e o que chega aqui não pode virar sugestão inventada.
  it("leitura que falhou vira silêncio, não sugestão", () => {
    expect(convenioSugerido(FALHA)).toBeNull();
    expect(convenioSugerido(null)).toBeNull();
  });
});

// ── O CARREGADOR ────────────────────────────────────────────
//
// Depois que a dupla embalagem saiu das telas, a marca de falha mora AQUI e
// só aqui. Uma mutação mostrou que o `listaLida` na tela era inerte (FALHA
// já é lista vazia), então o teste tem de cobrar o lugar que de fato decide.
describe("convenioDoHistorico — de onde vem a sugestão", () => {
  it("pede só o que interessa, do mais recente, limitado a 5", async () => {
    let url = null;
    await convenioDoHistorico(async u => { url = u; return []; }, "T9060");
    expect(url).toContain("prontuario=eq.T9060");
    expect(url).toContain("convenio_id=not.is.null");
    expect(url).toContain("order=chegada_em.desc");
    expect(url).toContain("limit=5");
    expect(url).toContain("plano_id");
  });

  it("🔴 leitura que falhou devolve FALHA — não lista vazia comum", async () => {
    const r = await convenioDoHistorico(async () => null, "T9060");
    expect(naoDeuParaLer(r)).toBe(true);
    // E dali não nasce sugestão nenhuma.
    expect(convenioSugerido(r)).toBeNull();
  });

  it("sem prontuário não pergunta nada", async () => {
    let chamou = false;
    const r = await convenioDoHistorico(async () => { chamou = true; return []; }, "");
    expect(chamou).toBe(false);
    expect(r).toEqual([]);
  });

  it("pode excluir o episódio atual, para não sugerir a si mesmo", async () => {
    let url = null;
    await convenioDoHistorico(async u => { url = u; return []; }, "T9060", { exceto: 279 });
    expect(url).toContain("id=neq.279");
  });
});

describe("sugestaoUtil — o passado conferido contra o catálogo de hoje", () => {
  it("resolve o nome do convênio e do plano", () => {
    const s = sugestaoUtil({ convenio_id: "2", plano_id: "10", de: "2026-10-01" }, CAT);
    expect(s).toMatchObject({ convenio_id: "2", plano_id: "10", nome: "Unimed", nomePlano: "Unimed Master" });
  });

  // 🔴 O caso que justifica a função existir.
  it("convênio que saiu do catálogo NÃO é sugerido", () => {
    // O 9 está gravado em atendimentos antigos; descredenciado, sumiu do
    // catálogo. Sugeri-lo mandaria abrir conta para quem não paga mais.
    expect(sugestaoUtil({ convenio_id: "9", plano_id: "", de: "2024-01-02" }, CAT)).toBeNull();
  });

  it("plano que não pertence mais ao convênio cai sozinho, o convênio fica", () => {
    // O plano 11 é do convênio 1, não do 2. Sugerir os dois juntos levaria
    // a conta a sair com um plano que não é de quem paga.
    const s = sugestaoUtil({ convenio_id: "2", plano_id: "11", de: "2026-10-01" }, CAT);
    expect(s.convenio_id).toBe("2");
    expect(s.plano_id).toBe("");
    expect(s.nomePlano).toBe("");
  });

  it("sem sugestão nenhuma, devolve null", () => {
    expect(sugestaoUtil(null, CAT)).toBeNull();
    expect(sugestaoUtil({ convenio_id: "" }, CAT)).toBeNull();
  });
});

// ── A TELA ──────────────────────────────────────────────────
describe("FontePagadora — a faixa de sugestão", () => {
  const sug = sugestaoUtil({ convenio_id: "2", plano_id: "10", de: "2026-10-01" }, CAT);

  it("🔴 NÃO preenche sozinha — o campo continua vazio até alguém clicar", () => {
    const onChange = vi.fn();
    render(<FontePagadora catalogos={CAT} ficha={{ convenio_id: "" }} onChange={onChange} sugestao={sug} />);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("Usar")).toBeTruthy();
  });

  it("diz de onde veio, com a DATA — 'de ontem' e 'de 2019' merecem confiança diferente", () => {
    render(<FontePagadora catalogos={CAT} ficha={{ convenio_id: "" }} onChange={() => {}} sugestao={sug} />);
    // Escopado à FAIXA: "Unimed" também aparece como opção do <select>, e um
    // `getByText` solto achava os dois — a asserção precisa ser sobre o
    // texto que a recepção lê, não sobre a palavra existir em algum lugar.
    const faixa = screen.getByText(/Da última vez veio por/);
    expect(faixa.textContent).toMatch(/Unimed/);
    expect(faixa.textContent).toMatch(/Unimed Master/);
    expect(faixa.textContent).toMatch(/01\/10\/2026/);
  });

  it("manda conferir a carteirinha — a sugestão não afirma que ainda vale", () => {
    render(<FontePagadora catalogos={CAT} ficha={{ convenio_id: "" }} onChange={() => {}} sugestao={sug} />);
    expect(screen.getByText(/confira a carteirinha/i)).toBeTruthy();
  });

  it("o clique aplica convênio E plano de uma vez", () => {
    const onChange = vi.fn();
    render(<FontePagadora catalogos={CAT} ficha={{ convenio_id: "", carteira: "X" }} onChange={onChange} sugestao={sug} />);
    fireEvent.click(screen.getByText("Usar"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      convenio_id: "2", plano_id: "10", carteira: "X",
    }));
  });

  it("some quando já há convênio escolhido — não disputa com a escolha de quem está no balcão", () => {
    render(<FontePagadora catalogos={CAT} ficha={{ convenio_id: "1" }} onChange={() => {}} sugestao={sug} />);
    expect(screen.queryByText("Usar")).toBeNull();
  });

  it("sem sugestão, a tela fica exatamente como era", () => {
    render(<FontePagadora catalogos={CAT} ficha={{ convenio_id: "" }} onChange={() => {}} />);
    expect(screen.queryByText("Usar")).toBeNull();
    expect(screen.queryByText(/Da última vez/)).toBeNull();
  });
});
