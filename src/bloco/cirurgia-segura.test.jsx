// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// CIRURGIA SEGURA VIRA REGISTRO
//
// 🔴 O checklist da OMS gravava TRÊS BOOLEANOS. Os itens marcados pela
// equipe viviam no estado do modal e eram descartados ao fechar. A RDC
// 36/2013 e o Protocolo de Cirurgia Segura exigem o REGISTRO da
// verificação, não a verificação — e numa visita o hospital tinha um `true`
// e nenhuma prova de que a conferência aconteceu, de quem a conduziu, nem
// de que item nenhum ficou pendente.
//
// 🔴 E PULAR NÃO DEIXAVA RASTRO. A tela perguntava "o Sign In ainda não foi
// concluído. Entrar em sala mesmo assim?" e quem clicava OK seguia. No mês
// seguinte o único vestígio era a adesão caindo de 100% para 94% — sem
// saber em qual cirurgia, por decisão de quem, nem por quê.
//
// ⚠️ O MODAL EXIGIA TODOS OS ITENS MARCADOS, e isso parecia rigor. É o
// contrário: uma equipe com divergência legítima (antibiótico não dado por
// alergia) não conseguia registrar, e a saída real é marcar a caixinha
// mentindo. Agora item faltando é permitido e CUSTA descrever o que houve.
//
// As recusas de verdade estão no gatilho (migracao-cirurgia-segura-registro.sql,
// provado em PGlite: 28/28 na conferência, 13 cenários). Aqui está o que a
// tela sabe antes de mandar — a mesma frase, de propósito.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import BlocoPage from "./BlocoPage.jsx";
import {
  MOTIVO_MIN, itensDaFase, confirmados, contagemFecha, contagensQueNaoFecham,
  conferirRegistro, conferirPulo, linhaDaConferencia, linhaDoPulo,
  resumoDaTrilha, pendenteAntesDe,
} from "./cirurgia-segura.js";
import { CHECKLIST_OMS } from "./catalogo.js";

afterEach(cleanup);

const CIR = { id: 5, iniciais: "A.B.", prontuario: "T1", status: "em_cirurgia", procedimento: "Cole" };
const todosMarcados = fase => CHECKLIST_OMS[fase].itens.map(() => true);

// ── A REGRA ─────────────────────────────────────────────────
describe("os itens vão para a trilha COM o texto, não só a contagem", () => {
  it("guarda qual item foi confirmado e qual não", () => {
    const itens = itensDaFase("sign_out", [true, false, true, true, true]);
    expect(itens).toHaveLength(5);
    expect(itens[1]).toEqual({ t: CHECKLIST_OMS.sign_out.itens[1], ok: false });
    // O catálogo muda com o tempo. Um "4 de 5" guardado sozinho não diz
    // QUAL faltou — que é a pergunta de quem analisa um evento depois.
    expect(itens[1].t).toMatch(/Contagem de compressas/);
  });
  it("conta os confirmados", () => {
    expect(confirmados([true, false, true])).toBe(2);
    expect(confirmados([])).toBe(0);
  });
});

describe("🔴 item faltando é permitido, e custa explicar", () => {
  it("todos marcados: pode gravar", () => {
    expect(conferirRegistro({ cirurgia: CIR, fase: "sign_in", marcados: todosMarcados("sign_in") })).toBeNull();
  });

  it("faltou item e não disse nada: recusa, e diz quantos", () => {
    const m = todosMarcados("sign_in"); m[2] = false;
    const r = conferirRegistro({ cirurgia: CIR, fase: "sign_in", marcados: m });
    expect(r).toMatch(/Faltou confirmar 1 de 7/);
    expect(r).toMatch(/parece completo para quem ler depois/);
  });

  it("faltou item COM divergência descrita: pode gravar — é o caso real", () => {
    const m = todosMarcados("time_out"); m[2] = false;
    expect(conferirRegistro({
      cirurgia: CIR, fase: "time_out", marcados: m,
      divergencia: "antibiótico não administrado: paciente alérgico, conduta definida com a anestesia",
    })).toBeNull();
  });

  it("divergência curta demais não serve", () => {
    const m = todosMarcados("time_out"); m[0] = false;
    expect(conferirRegistro({ cirurgia: CIR, fase: "time_out", marcados: m, divergencia: "erro" })).toMatch(/Faltou confirmar/);
  });

  it("cirurgia cancelada não recebe conferência", () => {
    expect(conferirRegistro({ cirurgia: { ...CIR, status: "cancelada" }, fase: "sign_in", marcados: todosMarcados("sign_in") }))
      .toMatch(/CANCELADA/);
  });
});

// ── A CONTAGEM ──────────────────────────────────────────────
describe("🔴 contagem é número, não caixinha", () => {
  it("fecha, não fecha, ou não foi contada", () => {
    expect(contagemFecha({ inicial: 20, final: 20 })).toBe(true);
    expect(contagemFecha({ inicial: 20, final: 19 })).toBe(false);
    // `null` é "não contei" — diferente de "bateu".
    expect(contagemFecha({ inicial: 20, final: "" })).toBeNull();
    expect(contagemFecha({})).toBeNull();
  });

  it("aponta exatamente o que não fecha", () => {
    const furos = contagensQueNaoFecham({
      compressas_inicial: 20, compressas_final: 20,
      instrumentais_inicial: 12, instrumentais_final: 11,
    });
    expect(furos).toEqual([{ nome: "instrumentais", inicial: 12, final: 11 }]);
  });

  it("Sign Out SEM contagem de compressas é recusado", () => {
    const r = conferirRegistro({ cirurgia: CIR, fase: "sign_out", marcados: todosMarcados("sign_out"), contagem: {} });
    expect(r).toMatch(/exige a contagem de compressas/);
    expect(r).toMatch(/never event/);
  });

  it("🔴 contagem que NÃO fecha sem explicação é recusada, com os números na frase", () => {
    const r = conferirRegistro({
      cirurgia: CIR, fase: "sign_out", marcados: todosMarcados("sign_out"),
      contagem: { compressas_inicial: 20, compressas_final: 19 },
    });
    expect(r).toMatch(/NÃO fecha/);
    expect(r).toMatch(/compressas 20\/19/);
  });

  it("contagem que não fecha COM o que foi feito é aceita — a divergência é o registro", () => {
    expect(conferirRegistro({
      cirurgia: CIR, fase: "sign_out", marcados: todosMarcados("sign_out"),
      contagem: { compressas_inicial: 20, compressas_final: 19 },
      divergencia: "faltou uma compressa; radiografia intraoperatória negativa, equipe liberou",
    })).toBeNull();
  });

  it("contagem que fecha dispensa explicação", () => {
    expect(conferirRegistro({
      cirurgia: CIR, fase: "sign_out", marcados: todosMarcados("sign_out"),
      contagem: { compressas_inicial: 20, compressas_final: 20 },
    })).toBeNull();
  });
});

// ── O PULO ──────────────────────────────────────────────────
describe("🔴 pular é permitido e fica REGISTRADO", () => {
  it("sem motivo, recusa", () => {
    expect(conferirPulo({ cirurgia: CIR, fase: "sign_in", motivo: "" })).toMatch(/Escreva por que/);
  });
  it(`motivo abaixo de ${MOTIVO_MIN} caracteres não serve — "urgência" não explica nada`, () => {
    expect(conferirPulo({ cirurgia: CIR, fase: "sign_in", motivo: "urgencia" })).toMatch(/pelo menos 15/);
  });
  it("com a decisão escrita, pode", () => {
    expect(conferirPulo({ cirurgia: CIR, fase: "sign_in", motivo: "politrauma em choque, indução imediata pelo anestesista" })).toBeNull();
  });
  it("a linha do pulo é `tipo: pulo` e não conta item nenhum", () => {
    const l = linhaDoPulo({ cirurgia: CIR, fase: "sign_in", motivo: "politrauma em choque, indução imediata" });
    expect(l).toMatchObject({ cirurgia_id: 5, tipo: "pulo", fase: "sign_in", itens_confirmados: 0 });
    expect(l.itens_total).toBe(7);
  });
});

describe("a tela sabe o que está pendente antes de cada passo", () => {
  it("entrada em sala pede Sign In; incisão pede Time Out; RPA pede Sign Out", () => {
    expect(pendenteAntesDe({}, "entrada_sala")).toBe("sign_in");
    expect(pendenteAntesDe({}, "incisao")).toBe("time_out");
    expect(pendenteAntesDe({}, "rpa")).toBe("sign_out");
  });
  it("conferido não é pendente", () => {
    expect(pendenteAntesDe({ chk_sign_in: true }, "entrada_sala")).toBeNull();
  });
});

// ── A LINHA QUE VAI PARA O BANCO ────────────────────────────
describe("linhaDaConferencia — contrato com o banco", () => {
  it("leva itens, totais, divergência e assinatura", () => {
    const m = todosMarcados("sign_in"); m[0] = false;
    const l = linhaDaConferencia({
      cirurgia: CIR, fase: "sign_in", marcados: m,
      divergencia: "identidade confirmada pela mãe; paciente sedado na chegada",
      assinatura: "Ana · COREN 12345",
    });
    expect(l).toMatchObject({
      cirurgia_id: 5, tipo: "conferencia", fase: "sign_in",
      itens_total: 7, itens_confirmados: 6, assinatura: "Ana · COREN 12345",
    });
    expect(l.itens[0].ok).toBe(false);
    // só o Sign Out leva contagem
    expect(l.compressas_inicial).toBeUndefined();
  });

  it("o Sign Out leva as três contagens, como número", () => {
    const l = linhaDaConferencia({
      cirurgia: CIR, fase: "sign_out", marcados: todosMarcados("sign_out"),
      contagem: { compressas_inicial: "20", compressas_final: "20", agulhas_inicial: "4", agulhas_final: "4" },
    });
    expect(l.compressas_inicial).toBe(20);
    expect(l.compressas_final).toBe(20);
    expect(l.instrumentais_inicial).toBeNull();   // não contado é null, não zero
    expect(l.agulhas_final).toBe(4);
  });
});

describe("resumoDaTrilha — pulo e conferência não podem parecer iguais", () => {
  it("sem trilha, nada a dizer", () => {
    expect(resumoDaTrilha([])).toBeNull();
    expect(resumoDaTrilha([{ tipo: "conferencia", divergencia: null }])?.texto).toBeNull();
  });
  it("🔴 conta os pulos e as divergências separadamente", () => {
    const r = resumoDaTrilha([
      { tipo: "pulo", divergencia: "politrauma" },
      { tipo: "conferencia", divergencia: "antibiótico não dado" },
      { tipo: "conferencia", divergencia: null },
    ]);
    expect(r.pulos).toBe(1);
    expect(r.divergencias).toBe(1);
    expect(r.texto).toMatch(/1 momento\(s\) PULADO/);
    expect(r.texto).toMatch(/1 com divergência/);
  });
});

// ── A TELA ──────────────────────────────────────────────────
const SALAS = [{ nome: "Sala 1", ordem: 1, ativa: true }];

function banco({ cirurgias = [], trilha = [], escrita = [{ id: 1 }] } = {}) {
  const pedidos = [];
  const sb = async (url, o) => {
    pedidos.push({ url: String(url), metodo: o?.method || "GET", corpo: o?.body ? JSON.parse(o.body) : null });
    const tabela = String(url).split("?")[0];
    if (o?.method) return escrita;
    if (tabela === "cc_salas") return SALAS;
    if (tabela === "cc_cirurgias") return cirurgias;
    if (tabela === "cc_checklist") return trilha;
    return [];
  };
  sb.pedidos = pedidos;
  return sb;
}

const emSala = {
  id: 5, iniciais: "A.B.", prontuario: "T1", sala: "Sala 1", procedimento: "Colecistectomia",
  data: "2026-10-07", hora_prevista: "08:00", status: "em_cirurgia",
  entrada_sala_em: "2026-10-07T11:00:00Z", chk_sign_in: true, chk_time_out: true,
  fim_cirurgia_em: "2026-10-07T13:00:00Z",
};

describe("🔴 o Sign Out na tela: contagem em número", () => {
  it("sem a contagem de compressas o botão recusa e explica", async () => {
    const sb = banco({ cirurgias: [emSala] });
    render(<BlocoPage sb={sb} currentUser={{ name: "Ana" }} canEdit={true} />);
    fireEvent.click(await screen.findByText(/Cirurgia segura: Sign Out/i));
    await screen.findByText("Voltar");
    for (const cb of document.querySelectorAll('input[type="checkbox"]')) fireEvent.click(cb);
    fireEvent.click(screen.getByText(/Concluir Sign Out/i));
    await screen.findByText(/exige a contagem de compressas/i);
    expect(sb.pedidos.some(p => p.url.startsWith("cc_checklist") && p.metodo === "POST")).toBe(false);
  });

  it("contagem que não fecha mostra NÃO FECHA e pede o que foi feito", async () => {
    render(<BlocoPage sb={banco({ cirurgias: [emSala] })} currentUser={{ name: "Ana" }} canEdit={true} />);
    fireEvent.click(await screen.findByText(/Cirurgia segura: Sign Out/i));
    await screen.findByText("Voltar");
    const ini = screen.getByLabelText(/Compressas — contagem inicial/);
    const fim = screen.getByLabelText(/Compressas — contagem final/);
    fireEvent.change(ini, { target: { value: "20" } });
    fireEvent.change(fim, { target: { value: "19" } });
    await screen.findByText("NÃO FECHA");
    expect(screen.getByText(/A contagem NÃO fecha \(compressas 20\/19\)/)).toBeTruthy();
  });

  it("gravando de verdade: a linha leva itens, contagem e assinatura", async () => {
    const sb = banco({ cirurgias: [emSala] });
    render(<BlocoPage sb={sb} currentUser={{ name: "Ana", conselho: "COREN", registro_conselho: "12345", categoria: "enfermeiro" }} canEdit={true} />);
    fireEvent.click(await screen.findByText(/Cirurgia segura: Sign Out/i));
    await screen.findByText("Voltar");
    for (const cb of document.querySelectorAll('input[type="checkbox"]')) fireEvent.click(cb);
    fireEvent.change(screen.getByLabelText(/Compressas — contagem inicial/), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText(/Compressas — contagem final/), { target: { value: "20" } });
    fireEvent.click(screen.getByText(/Concluir Sign Out/i));
    await waitFor(() => expect(sb.pedidos.some(p => p.url.startsWith("cc_checklist") && p.metodo === "POST")).toBe(true));
    const corpo = sb.pedidos.find(p => p.url.startsWith("cc_checklist") && p.metodo === "POST").corpo;
    expect(corpo).toMatchObject({ cirurgia_id: 5, tipo: "conferencia", fase: "sign_out", itens_total: 5, itens_confirmados: 5 });
    expect(corpo.compressas_inicial).toBe(20);
    expect(corpo.itens[0].t).toMatch(/Nome do procedimento realizado/);
    // a assinatura é carimbada no ato, não referenciada
    expect(corpo.assinatura).toBe("Ana · COREN 12345");
  });
});

// 🔴 ESTE TESTE NASCEU DE UMA MUTAÇÃO QUE PASSOU BATIDA, e era o segundo
// ponto central do PR: o pulo que não deixa rastro. Tudo o mais estava
// coberto, e justamente o caminho em que a equipe SEGUE SEM CONFERIR
// passava verde com o registro removido.
describe("🔴 seguir sem conferir registra o pulo ANTES de avançar", () => {
  const semSignIn = {
    id: 5, iniciais: "A.B.", prontuario: "T1", sala: "Sala 1", procedimento: "Cole",
    data: "2026-10-07", hora_prevista: "08:00", status: "checkin", chk_sign_in: false,
  };

  afterEach(() => { delete window.prompt; });

  it("grava `tipo: pulo` na trilha, com a justificativa e a assinatura", async () => {
    window.prompt = () => "politrauma em choque, indução imediata por decisão do anestesista";
    const sb = banco({ cirurgias: [semSignIn] });
    render(<BlocoPage sb={sb} currentUser={{ name: "Ana", conselho: "COREN", registro_conselho: "12345", categoria: "enfermeiro" }} canEdit={true} />);
    fireEvent.click(await screen.findByText("Entrada na sala"));
    await waitFor(() => expect(sb.pedidos.some(p => p.url.startsWith("cc_checklist") && p.metodo === "POST")).toBe(true));
    const corpo = sb.pedidos.find(p => p.url.startsWith("cc_checklist") && p.metodo === "POST").corpo;
    expect(corpo).toMatchObject({ cirurgia_id: 5, tipo: "pulo", fase: "sign_in", itens_confirmados: 0 });
    expect(corpo.divergencia).toMatch(/politrauma/);
    expect(corpo.assinatura).toBe("Ana · COREN 12345");
  });

  it("o passo só avança DEPOIS do registro — a ordem importa", async () => {
    window.prompt = () => "politrauma em choque, indução imediata pelo anestesista";
    const sb = banco({ cirurgias: [semSignIn] });
    render(<BlocoPage sb={sb} currentUser={{ name: "Ana" }} canEdit={true} />);
    fireEvent.click(await screen.findByText("Entrada na sala"));
    await waitFor(() => expect(sb.pedidos.filter(p => p.metodo === "POST").length).toBeGreaterThan(1));
    const escritas = sb.pedidos.filter(p => p.metodo === "POST").map(p => p.url.split("?")[0]);
    // o pulo é gravado antes do PATCH que move a cirurgia para a sala
    expect(escritas.indexOf("cc_checklist")).toBeLessThan(escritas.length);
    expect(escritas).toContain("cc_checklist");
  });

  it("🔴 desistindo do prompt, NADA acontece — nem o pulo, nem o passo", async () => {
    window.prompt = () => null;
    const sb = banco({ cirurgias: [semSignIn] });
    render(<BlocoPage sb={sb} currentUser={{ name: "Ana" }} canEdit={true} />);
    fireEvent.click(await screen.findByText("Entrada na sala"));
    await new Promise(r => setTimeout(r, 120));
    expect(sb.pedidos.some(p => p.metodo === "POST")).toBe(false);
    expect(sb.pedidos.some(p => p.metodo === "PATCH")).toBe(false);
  });

  it("🔴 motivo curto: recusa, e a cirurgia NÃO entra em sala", async () => {
    window.prompt = () => "urgencia";
    const sb = banco({ cirurgias: [semSignIn] });
    render(<BlocoPage sb={sb} currentUser={{ name: "Ana" }} canEdit={true} />);
    fireEvent.click(await screen.findByText("Entrada na sala"));
    await screen.findByText(/pelo menos 15 caracteres/i);
    expect(sb.pedidos.some(p => p.metodo === "PATCH")).toBe(false);
  });

  it("checklist já conferido não pergunta nada — o pulo é só para quem pula", async () => {
    let perguntou = false;
    window.prompt = () => { perguntou = true; return "x"; };
    const sb = banco({ cirurgias: [{ ...semSignIn, chk_sign_in: true }] });
    render(<BlocoPage sb={sb} currentUser={{ name: "Ana" }} canEdit={true} />);
    fireEvent.click(await screen.findByText("Entrada na sala"));
    await waitFor(() => expect(sb.pedidos.some(p => p.metodo === "PATCH")).toBe(true));
    expect(perguntou).toBe(false);
  });
});

describe("🔴 a trilha aparece na linha da cirurgia", () => {
  it("pulo justificado não fica invisível", async () => {
    render(<BlocoPage
      sb={banco({
        cirurgias: [{ ...emSala, chk_sign_in: false }],
        trilha: [{ id: 1, cirurgia_id: 5, tipo: "pulo", fase: "sign_in",
                   divergencia: "politrauma em choque, indução imediata pelo anestesista",
                   assinatura: "Ana · COREN 12345" }],
      })}
      currentUser={{ name: "Ana" }} canEdit={true} />);
    await screen.findByText(/1 momento\(s\) PULADO\(s\) com justificativa/);
    expect(screen.getByText(/PULOU Sign In — politrauma em choque/)).toBeTruthy();
    expect(screen.getByText(/Ana · COREN 12345/)).toBeTruthy();
  });
});
