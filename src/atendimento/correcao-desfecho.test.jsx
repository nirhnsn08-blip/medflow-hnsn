// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// CORRIGIR O DESFECHO — a regra e a tela
//
// 🔴 O desfecho não entra em `CAMPOS_CORRIGIVEIS` (é registro assistencial),
// então um engano ficava para sempre — no campo que decide se a consulta
// vira conta. A saída é a do resto do sistema: corrigir é GRAVAR OUTRA
// LINHA, e o banco aplica trilha e valor corrente no mesmo INSERT.
//
// ⚠️ A DEFESA É O GATILHO (migracao-correcao-desfecho.sql), não estes
// testes: eles cobrem o que a tela precisa saber antes de mandar, e que a
// recusa do BANCO chega inteira em quem está na frente da tela.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import {
  opcoesDeCorrecao, motivoParaNaoCorrigir, conferirCorrecao, avisoDeCorrecao, efeitoNaConta, MOTIVO_MIN,
} from "./correcao-desfecho.js";
import CorrigirDesfecho, { HistoricoDeCorrecoes } from "./CorrigirDesfecho.jsx";
import { corrigirDesfecho } from "./dados.js";

afterEach(cleanup);

const AMB = { id: 10, desfecho: "evadiu", tipo_atendimento: "ambulatorial", status: "finalizado" };
const PS = { id: 11, desfecho: "alta", tipo_atendimento: "emergencia", status: "finalizado" };
const MOTIVO = "a consulta aconteceu, a recepcao marcou errado";

describe("as opções oferecidas", () => {
  it("ambulatorial oferece os desfechos do ambulatório, com a dica de cada um", () => {
    const o = opcoesDeCorrecao(AMB);
    expect(o.map(x => x.chave).sort()).toEqual(["atendido", "encaminhado"]);
    expect(o.find(x => x.chave === "atendido").dica).toMatch(/produção realizada/i);
  });

  it("pronto-socorro oferece os cinco do PS", () => {
    expect(opcoesDeCorrecao(PS).map(x => x.chave).sort())
      .toEqual(["evasao", "internacao", "obito", "transferencia"]);
  });

  it("🔴 o desfecho ATUAL não entra na lista (o banco recusaria de=para)", () => {
    expect(opcoesDeCorrecao(AMB).map(x => x.chave)).not.toContain("evadiu");
    expect(opcoesDeCorrecao(PS).map(x => x.chave)).not.toContain("alta");
  });
});

describe("o que a tela já recusa sozinha", () => {
  it("🔴 ÓBITO não se corrige por aqui — o carimbo no cadastro não se desfaz", () => {
    expect(motivoParaNaoCorrigir({ ...PS, desfecho: "obito" })).toMatch(/direção técnica/i);
  });
  it("episódio sem desfecho não tem o que corrigir", () => {
    expect(motivoParaNaoCorrigir({ ...AMB, desfecho: null })).toMatch(/ainda não tem desfecho/i);
  });
  it("cancelado não tem desfecho a corrigir", () => {
    expect(motivoParaNaoCorrigir({ ...AMB, status: "cancelado" })).toMatch(/cancelado/i);
  });
  it("episódio normal pode", () => {
    expect(motivoParaNaoCorrigir(AMB)).toBe(null);
  });
});

describe("conferirCorrecao", () => {
  it("exige escolha", () => {
    expect(conferirCorrecao({ atendimento: AMB, para: "", motivo: MOTIVO })).toMatch(/Escolha o desfecho/);
  });
  it(`exige motivo com ao menos ${MOTIVO_MIN} caracteres — e diz por quê`, () => {
    const r = conferirCorrecao({ atendimento: AMB, para: "atendido", motivo: "erro" });
    expect(r).toMatch(new RegExp(`${MOTIVO_MIN} caracteres`));
    expect(r).toMatch(/daqui a um ano/);
  });
  it("espaço em branco não conta como motivo", () => {
    expect(conferirCorrecao({ atendimento: AMB, para: "atendido", motivo: "               " })).toBeTruthy();
  });
  it("recusa corrigir para o mesmo desfecho", () => {
    expect(conferirCorrecao({ atendimento: AMB, para: "evadiu", motivo: MOTIVO })).toMatch(/já é o desfecho/);
  });
  it("com tudo certo, libera", () => {
    expect(conferirCorrecao({ atendimento: AMB, para: "atendido", motivo: MOTIVO })).toBe(null);
  });
});

describe("🔴 o efeito no dinheiro é dito ANTES de gravar", () => {
  it("evadiu → atendido PASSA a gerar conta", () => {
    expect(efeitoNaConta("evadiu", "atendido")).toMatch(/PASSA a gerar conta/);
  });
  it("atendido → evadiu DEIXA de gerar, e manda cancelar a conta", () => {
    expect(efeitoNaConta("atendido", "evadiu")).toMatch(/DEIXA de gerar conta.*cancele/s);
  });
  it("as duas grafias de evasão contam igual", () => {
    expect(efeitoNaConta("evasao", "alta")).toMatch(/PASSA a gerar/);
  });
  it("troca que não muda o faturamento não inventa aviso", () => {
    expect(efeitoNaConta("alta", "transferencia")).toBe(null);
  });
});

describe("avisoDeCorrecao — o desfecho corrigido não se confunde com o original", () => {
  it("sem correção, não há aviso (ruído não se inventa)", () => {
    expect(avisoDeCorrecao([])).toBe(null);
  });
  it("com correção, diz o que era e quem mudou", () => {
    const a = avisoDeCorrecao([{ de: "evadiu", para: "atendido", usuario: "ana", motivo: MOTIVO }]);
    expect(a.texto).toContain("evadiu");
    expect(a.texto).toContain("ana");
    expect(a.quantas).toBe(1);
  });
  it("conta mais de uma", () => {
    expect(avisoDeCorrecao([{ de: "a", motivo: "m" }, { de: "b", motivo: "m" }]).texto).toMatch(/2 vezes/);
  });
});

// ── a tela ─────────────────────────────────────────────────
function banco({ resposta } = {}) {
  const chamadas = [];
  return async (url, opt) => {
    chamadas.push({ url, corpo: opt?.body ? JSON.parse(opt.body) : null });
    if (url.startsWith("at_desfecho_correcoes") && opt?.method === "POST") {
      if (resposta instanceof Error) throw resposta;
      return resposta ?? [{ id: 1 }];
    }
    return [];
  };
}

describe("a tela de correção", () => {
  it("🔴 não grava sem motivo suficiente", async () => {
    const sb = vi.fn(banco());
    render(<CorrigirDesfecho sb={sb} atendimento={AMB} currentUser={{ name: "T" }} onFechar={() => {}} />);
    fireEvent.click(screen.getByText("Atendido"));
    fireEvent.click(screen.getByText("Registrar a correção"));
    await screen.findByRole("alert");
    expect(sb).not.toHaveBeenCalled();
  });

  it("grava de → para, motivo e autor numa ESCRITA SÓ", async () => {
    const chamadas = [];
    const sb = async (url, opt) => { chamadas.push({ url, corpo: opt?.body ? JSON.parse(opt.body) : null }); return [{ id: 1 }]; };
    const onCorrigido = vi.fn();
    render(<CorrigirDesfecho sb={sb} atendimento={AMB} currentUser={{ name: "Ana" }}
      onCorrigido={onCorrigido} onFechar={() => {}} />);
    fireEvent.click(screen.getByText("Atendido"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: MOTIVO } });
    fireEvent.click(screen.getByText("Registrar a correção"));
    await waitFor(() => expect(onCorrigido).toHaveBeenCalled());
    const post = chamadas.filter(c => c.corpo);
    expect(post).toHaveLength(1);                       // o UPDATE é do gatilho, não da tela
    expect(post[0].corpo).toMatchObject({ atendimento_id: 10, de: "evadiu", para: "atendido", usuario: "Ana" });
    expect(onCorrigido.mock.calls[0][0].desfecho).toBe("atendido");
  });

  it("🔴 a recusa do BANCO chega inteira na tela", async () => {
    // É o banco que sabe que a conta está fechada — a tela não tem como.
    const erro = new Error('{"code":"P0001","message":"A conta deste atendimento já está faturada. Cancele a conta primeiro."}');
    render(<CorrigirDesfecho sb={banco({ resposta: erro })} atendimento={AMB} currentUser={{ name: "T" }} onFechar={() => {}} />);
    fireEvent.click(screen.getByText("Atendido"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: MOTIVO } });
    fireEvent.click(screen.getByText("Registrar a correção"));
    const aviso = await screen.findByRole("alert");
    expect(aviso.textContent).toMatch(/Cancele a conta primeiro/);
  });

  it("🔴 resposta 2xx sem linha não é tratada como sucesso", async () => {
    const onCorrigido = vi.fn();
    render(<CorrigirDesfecho sb={banco({ resposta: [] })} atendimento={AMB} currentUser={{ name: "T" }}
      onCorrigido={onCorrigido} onFechar={() => {}} />);
    fireEvent.click(screen.getByText("Atendido"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: MOTIVO } });
    fireEvent.click(screen.getByText("Registrar a correção"));
    await screen.findByRole("alert");
    expect(onCorrigido).not.toHaveBeenCalled();
  });

  it("óbito mostra a recusa e nem oferece o formulário", () => {
    render(<CorrigirDesfecho sb={banco()} atendimento={{ ...PS, desfecho: "obito" }}
      currentUser={{ name: "T" }} onFechar={() => {}} />);
    expect(screen.getByRole("alert").textContent).toMatch(/direção técnica/i);
    expect(screen.queryByText("Registrar a correção")).toBeNull();
  });
});

describe("corrigirDesfecho (camada de dados)", () => {
  it("2xx sem linha devolve ok:false", async () => {
    const r = await corrigirDesfecho(async () => [], { atendimentoId: 1, de: "a", para: "b", motivo: MOTIVO }, { name: "T" });
    expect(r.ok).toBe(false);
  });
  it("extrai a mensagem do banco de dentro do JSON de erro", async () => {
    const sb = async () => { throw new Error('{"message":"Alguém mudou enquanto esta tela estava aberta — releia antes de corrigir."}'); };
    const r = await corrigirDesfecho(sb, { atendimentoId: 1, de: "a", para: "b", motivo: MOTIVO }, { name: "T" });
    expect(r.motivo).toMatch(/releia antes de corrigir/);
  });
});

describe("HistoricoDeCorrecoes", () => {
  it("🔴 falha de leitura não vira 'nunca foi corrigido'", async () => {
    render(<HistoricoDeCorrecoes sb={async () => null} atendimento={AMB} />);
    expect((await screen.findByText(/Não consegui ler o histórico/)).textContent).toMatch(/pode ter sido corrigido/);
  });
  it("sem correção, não desenha nada", async () => {
    const { container } = render(<HistoricoDeCorrecoes sb={async () => []} atendimento={AMB} />);
    await waitFor(() => expect(container.textContent).toBe(""));
  });
  it("🔴 relê quando o desfecho muda — senão a linha mostra o valor novo dizendo que nunca houve correção", async () => {
    const linha = { id: 1, de: "evadiu", para: "atendido", usuario: "ana", motivo: "m".repeat(20), criado_em: "2026-10-06T12:00:00Z" };
    let temCorrecao = false;
    const sb = async () => (temCorrecao ? [linha] : []);
    const { rerender, container } = render(<HistoricoDeCorrecoes sb={sb} atendimento={AMB} />);
    await waitFor(() => expect(container.textContent).toBe(""));
    temCorrecao = true;                                   // a correção acabou de ser gravada
    rerender(<HistoricoDeCorrecoes sb={sb} atendimento={{ ...AMB, desfecho: "atendido" }} />);
    expect(await screen.findByText(/Desfecho corrigido/)).toBeTruthy();
  });

  it("com correção, mostra de → para e quem fez", async () => {
    const linha = { id: 1, de: "evadiu", para: "atendido", usuario: "ana", motivo: MOTIVO, criado_em: "2026-10-06T12:00:00Z" };
    render(<HistoricoDeCorrecoes sb={async () => [linha]} atendimento={AMB} />);
    expect(await screen.findByText(/Desfecho corrigido/)).toBeTruthy();
    expect(screen.getByText(/evadiu → atendido/)).toBeTruthy();
  });
});
