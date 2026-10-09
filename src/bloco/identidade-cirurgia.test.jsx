// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// AS INICIAIS DA CIRURGIA SÃO AS DO PACIENTE AGENDADO?
//
// 🔴 O DEFEITO: `cc_cirurgias.iniciais` era texto livre e NADA o comparava
// com o cadastro, embora a FK do paciente exista desde
// `migracao-cirurgia-paciente-equipe-codigo.sql`. Medido no banco demo em
// 09/10/2026, prontuário T9060:
//
//   pacientes.nome_completo = "Clara Lima Barbosa"   (→ C.L.B.)
//   pacientes.iniciais      = "E.A."                  (campo gravado)
//   cc_cirurgias.iniciais   = "T.S.T." / "A.B.C." / "M.O.S."  (três cirurgias)
//
// E o cartão do mapa mostrava o valor digitado — na tela onde o item 1 do
// Sign In manda "Paciente confirmou identidade" (Meta 1 da OMS).
//
// O que estes testes trancam:
//   1. o cartão mostra QUEM É (do cadastro), não o que foi digitado;
//   2. a divergência APARECE — o carimbo não é apagado nem é o vencedor;
//   3. "não li o cadastro" nunca passa por "confere";
//   4. cadastro sem nome (órfão adotado) mantém o carimbo, sem alarme;
//   5. nome social não vira divergência;
//   6. no agendamento, prontuário conhecido ⇒ campo preenchido e TRAVADO.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import BlocoPage from "./BlocoPage.jsx";
import { conferirIniciaisDaCirurgia, indexarCadastros, iniciaisDoAgendamento } from "./identidade-cirurgia.js";
import { FALHA } from "../util/leitura.js";

afterEach(cleanup);

// O caso real do demo.
const CLARA = { prontuario: "T9060", nome_completo: "Clara Lima Barbosa", iniciais: "E.A." };
const cadastrosDe = (...ps) => indexarCadastros(ps);

// ── AS REGRAS PURAS ─────────────────────────────────────────
describe("indexarCadastros — leitura falhada não é mapa vazio", () => {
  it("lista lida vira Map por prontuário", () => {
    const m = cadastrosDe(CLARA);
    expect(m.get("T9060")).toEqual(CLARA);
  });

  // 🔴 Mapa vazio responderia "não achei" para toda pergunta, e seria
  // indistinguível de uma leitura que simplesmente não trouxe o número.
  it("FALHA vira null, NÃO Map vazio", () => {
    expect(indexarCadastros(FALHA)).toBeNull();
    expect(indexarCadastros(null)).toBeNull();
    expect(indexarCadastros([])).not.toBeNull();
  });

  it("linha sem prontuário não entra (chave vazia casaria com qualquer coisa)", () => {
    expect(indexarCadastros([{ nome_completo: "Sem Número" }]).size).toBe(0);
  });
});

describe("🔴 conferirIniciaisDaCirurgia — o caso T9060 do demo", () => {
  const cir = { id: 6, prontuario: "T9060", iniciais: "T.S.T." };

  it("divergem: exibe o do CADASTRO, e o carimbo vai no aviso", () => {
    const r = conferirIniciaisDaCirurgia(cir, cadastrosDe(CLARA));
    expect(r.estado).toBe("divergem");
    expect(r.grave).toBe(true);
    // quem é a pessoa
    expect(r.exibir).toBe("C.L.B.");
    // e o que a agenda dizia NÃO foi apagado
    expect(r.carimbadas).toBe("T.S.T.");
    expect(r.aviso).toMatch(/T\.S\.T\./);
    expect(r.aviso).toMatch(/Clara Lima Barbosa/);
  });

  it("as três cirurgias do mesmo prontuário divergem, cada uma com o seu carimbo", () => {
    for (const ini of ["T.S.T.", "A.B.C.", "M.O.S."]) {
      const r = conferirIniciaisDaCirurgia({ prontuario: "T9060", iniciais: ini }, cadastrosDe(CLARA));
      expect(r.estado).toBe("divergem");
      expect(r.aviso).toContain(ini);
    }
  });

  // A coluna `iniciais` do cadastro também vale: ela é a única fonte de
  // parte do acervo, e recusá-la faria divergir ficha importada que está
  // certa do ponto de vista de quem a digitou.
  it("bate com a coluna gravada do cadastro (E.A.) também confere", () => {
    const r = conferirIniciaisDaCirurgia({ prontuario: "T9060", iniciais: "E.A." }, cadastrosDe(CLARA));
    expect(r.estado).toBe("confere");
  });

  it("bate com o nome: confere, e exibe o derivado", () => {
    const r = conferirIniciaisDaCirurgia({ prontuario: "T9060", iniciais: "C.L.B." }, cadastrosDe(CLARA));
    expect(r.estado).toBe("confere");
    expect(r.exibir).toBe("C.L.B.");
    expect(r.aviso).toBeNull();
  });

  it("formato não é divergência: 'clb', 'C L B' e 'C.L.B.' são a mesma pessoa", () => {
    for (const v of ["clb", "C L B", "C.L.B.", "c.l.b"]) {
      expect(conferirIniciaisDaCirurgia({ prontuario: "T9060", iniciais: v }, cadastrosDe(CLARA)).estado).toBe("confere");
    }
  });

  it("acento não divergem: 'Ângela Souza' aceita A.S.", () => {
    const p = { prontuario: "T1", nome_completo: "Ângela Souza" };
    expect(conferirIniciaisDaCirurgia({ prontuario: "T1", iniciais: "A.S." }, cadastrosDe(p)).estado).toBe("confere");
  });

  it("partícula não conta: 'Maria de Souza Lima' aceita M.S.L.", () => {
    const p = { prontuario: "T2", nome_completo: "Maria de Souza Lima" };
    expect(conferirIniciaisDaCirurgia({ prontuario: "T2", iniciais: "M.S.L." }, cadastrosDe(p)).estado).toBe("confere");
  });
});

describe("🔴 'não li' nunca vira 'confere' nem 'não cadastrado'", () => {
  it("cadastros null (leitura falhou): estado nao-conferido, e DIZ isso", () => {
    const r = conferirIniciaisDaCirurgia({ prontuario: "T9060", iniciais: "T.S.T." }, null);
    expect(r.estado).toBe("nao-conferido");
    expect(r.grave).toBe(false);
    expect(r.aviso).toMatch(/não quer dizer que conferem/i);
    // sem cadastro para ler, o carimbo é o que a tela tem
    expect(r.exibir).toBe("T.S.T.");
  });

  it("prontuário que não veio na leitura: também nao-conferido — a FK garante que o paciente existe", () => {
    const r = conferirIniciaisDaCirurgia({ prontuario: "T9060", iniciais: "T.S.T." }, cadastrosDe({ prontuario: "T1" }));
    expect(r.estado).toBe("nao-conferido");
    // e NÃO afirma que o paciente não está cadastrado
    expect(r.aviso).not.toMatch(/não cadastrad/i);
  });

  it("cirurgia antiga sem prontuário: diz que não há com o que conferir", () => {
    const r = conferirIniciaisDaCirurgia({ iniciais: "X.Y." }, cadastrosDe(CLARA));
    expect(r.estado).toBe("sem-prontuario");
    expect(r.exibir).toBe("X.Y.");
  });
});

describe("órfão adotado pela migração: cadastro sem nome, carimbo é a única fonte", () => {
  // `origem_cadastro = 'backfill'` — a migração criou o paciente com as
  // iniciais da cirurgia e sem nome. Derivar devolveria "": trocaria um
  // rótulo usável por nenhum.
  it("cadastro com iniciais e sem nome: confere pela coluna, sem alarme", () => {
    const orfao = { prontuario: "T5", iniciais: "J.P.", nome_completo: null };
    const r = conferirIniciaisDaCirurgia({ prontuario: "T5", iniciais: "J.P." }, cadastrosDe(orfao));
    expect(r.estado).toBe("confere");
    expect(r.exibir).toBe("J.P.");
    expect(r.aviso).toBeNull();
  });

  it("cadastro sem NADA: mantém o carimbo e não inventa divergência", () => {
    const vazio = { prontuario: "T6", iniciais: "", nome_completo: "" };
    const r = conferirIniciaisDaCirurgia({ prontuario: "T6", iniciais: "K.L." }, cadastrosDe(vazio));
    expect(r.estado).toBe("so-carimbo");
    expect(r.exibir).toBe("K.L.");
    expect(r.grave).toBe(false);
  });
});

describe("nome social não vira divergência (Decreto 8.727/2016)", () => {
  // Exigir que batesse com o preferido faria toda pessoa trans aparecer
  // como divergência — alarme que aparece sempre é alarme clicado sem ler.
  const social = { prontuario: "T7", nome_completo: "João Silva", nome_social: "Maria Silva" };

  it("as iniciais do nome de REGISTRO conferem", () => {
    expect(conferirIniciaisDaCirurgia({ prontuario: "T7", iniciais: "J.S." }, cadastrosDe(social)).estado).toBe("confere");
  });
  it("as do nome SOCIAL também", () => {
    expect(conferirIniciaisDaCirurgia({ prontuario: "T7", iniciais: "M.S." }, cadastrosDe(social)).estado).toBe("confere");
  });
  it("e o rótulo exibido é o do nome social", () => {
    expect(conferirIniciaisDaCirurgia({ prontuario: "T7", iniciais: "M.S." }, cadastrosDe(social)).exibir).toBe("M.S.");
  });
  it("outra pessoa continua divergindo", () => {
    expect(conferirIniciaisDaCirurgia({ prontuario: "T7", iniciais: "Z.Z." }, cadastrosDe(social)).estado).toBe("divergem");
  });
});

describe("iniciaisDoAgendamento — travar só quando o cadastro sabe quem é", () => {
  it("cadastro com nome: valor do cadastro e campo TRAVADO", () => {
    const r = iniciaisDoAgendamento(CLARA, { lido: true });
    expect(r.travado).toBe(true);
    expect(r.valor).toBe("C.L.B.");
    expect(r.nota).toMatch(/Clara Lima Barbosa/);
  });

  it("não conferi (não li ou não deu para ler): campo livre, e a nota diz que NÃO será conferido", () => {
    const r = iniciaisDoAgendamento(null, { lido: false });
    expect(r.travado).toBe(false);
    expect(r.nota).toMatch(/NÃO serão conferidas/);
  });

  it("li e o prontuário não existe: campo livre, e a nota diz isso", () => {
    const r = iniciaisDoAgendamento(null, { lido: true });
    expect(r.travado).toBe(false);
    expect(r.nota).toMatch(/não encontrado/i);
    expect(r.nota).toMatch(/NÃO serão conferidas/);
  });

  it("cadastro sem nome: campo livre — é a única fonte, e a nota pede completar o cadastro", () => {
    const r = iniciaisDoAgendamento({ prontuario: "T6", iniciais: "" }, { lido: true });
    expect(r.travado).toBe(false);
    expect(r.nota).toMatch(/única fonte/);
  });

  it("órfão com iniciais e sem nome: trava na coluna gravada (é o que o cadastro tem)", () => {
    const r = iniciaisDoAgendamento({ prontuario: "T5", iniciais: "J.P." }, { lido: true });
    expect(r.travado).toBe(true);
    expect(r.valor).toBe("J.P.");
  });
});

// ── A TELA ──────────────────────────────────────────────────
const USER = { name: "adauam", username: "adauam" };
const SALAS = [{ nome: "Sala 1", ordem: 1, ativa: true }];
const hoje = new Date();
const DIA = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;

/** `sb` falso. `pacientes` é o que a leitura do cadastro devolve. */
function banco({ cirurgias = [], pacientes = [], falhar = [] } = {}) {
  const pedidos = [];
  const sb = async (url, o) => {
    pedidos.push({ url: String(url), metodo: o?.method || "GET" });
    const tabela = String(url).split("?")[0];
    if (o?.method) return [{ id: 9 }];
    if (falhar.includes(tabela)) return null;
    if (tabela === "cc_salas") return SALAS;
    if (tabela === "cc_cirurgias") return cirurgias;
    if (tabela === "pacientes") return pacientes;
    return [];
  };
  sb.pedidos = pedidos;
  return sb;
}
const abrir = sb => render(<BlocoPage sb={sb} currentUser={USER} canEdit={true} />);

const CIRURGIA = {
  id: 6, prontuario: "T9060", iniciais: "T.S.T.", sala: "Sala 1", procedimento: "Artroplastia",
  data: DIA, hora_prevista: "09:00", status: "agendada",
};

describe("🔴 o cartão do mapa mostra QUEM É, e acusa a divergência", () => {
  it("as iniciais do cadastro no cartão, com o selo de divergência", async () => {
    abrir(banco({ cirurgias: [CIRURGIA], pacientes: [CLARA] }));
    expect(await screen.findByText("C.L.B.")).toBeTruthy();
    expect(screen.getByText(/iniciais divergem do cadastro/i)).toBeTruthy();
    // o carimbo aparece no aviso — não é apagado
    expect(screen.getByRole("alert").textContent).toMatch(/T\.S\.T\./);
    // e o valor digitado NÃO é o rótulo do cartão
    expect(screen.queryByText("T.S.T.")).toBeNull();
  });

  it("quando conferem, nenhum alarme", async () => {
    abrir(banco({ cirurgias: [{ ...CIRURGIA, iniciais: "C.L.B." }], pacientes: [CLARA] }));
    expect(await screen.findByText("C.L.B.")).toBeTruthy();
    expect(screen.queryByText(/iniciais divergem/i)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("leitura do cadastro falhou: diz que não conferiu, e NÃO acusa divergência", async () => {
    abrir(banco({ cirurgias: [CIRURGIA], pacientes: [CLARA], falhar: ["pacientes"] }));
    await screen.findByText(/Não conferi estas iniciais com o cadastro/i);
    expect(screen.queryByText(/iniciais divergem/i)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

// ⚠️ ESTE BLOCO NASCEU DE UMA MUTAÇÃO QUE PASSOU BATIDA.
//
// A primeira versão procurava o aviso com `getAllByRole("alert")` e juntava
// os textos. Mas o CARTÃO do mapa continua na tela por trás do modal, com um
// alerta de mesmo texto — então apagar o aviso de dentro do modal deixava o
// teste VERDE. Tirar o aviso justamente da tela onde se confere a identidade
// era o pior lugar para ficar descoberto.
//
// A frase de comando do modal ("NÃO marque o item...") não existe no cartão,
// e é por ela que estes testes procuram.
describe("🔴 o Sign In não confere identidade contra o rótulo de outra pessoa", () => {
  it("o aviso de divergência aparece DENTRO do modal, ANTES dos itens", async () => {
    abrir(banco({ cirurgias: [{ ...CIRURGIA, status: "checkin" }], pacientes: [CLARA] }));
    fireEvent.click(await screen.findByText(/Cirurgia segura: Sign In/i));
    await screen.findByText("Voltar");
    // frase que só o modal tem
    const bloco = await screen.findByText(/NÃO marque o item de identidade/i);
    expect(bloco.closest("[role=alert]").textContent).toMatch(/Clara Lima Barbosa/);
    // e ela vem ANTES das caixinhas do checklist no DOM
    const primeiraCaixa = document.querySelector('input[type="checkbox"]');
    expect(bloco.compareDocumentPosition(primeiraCaixa) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sem conseguir ler o cadastro, o modal diz que a identidade NÃO foi conferida", async () => {
    abrir(banco({ cirurgias: [{ ...CIRURGIA, status: "checkin" }], pacientes: [CLARA], falhar: ["pacientes"] }));
    fireEvent.click(await screen.findByText(/Cirurgia segura: Sign In/i));
    await screen.findByText("Voltar");
    expect(screen.getByText(/A identidade deste paciente NÃO foi conferida com o cadastro/i)).toBeTruthy();
  });

  it("quando conferem, o modal não traz aviso de identidade nenhum", async () => {
    abrir(banco({ cirurgias: [{ ...CIRURGIA, iniciais: "C.L.B.", status: "checkin" }], pacientes: [CLARA] }));
    fireEvent.click(await screen.findByText(/Cirurgia segura: Sign In/i));
    await screen.findByText("Voltar");
    expect(screen.queryByText(/NÃO marque o item de identidade/i)).toBeNull();
    expect(screen.queryByText(/NÃO foi conferida com o cadastro/i)).toBeNull();
  });

  it("o cabeçalho do modal mostra o paciente do CADASTRO", async () => {
    abrir(banco({ cirurgias: [{ ...CIRURGIA, status: "checkin" }], pacientes: [CLARA] }));
    fireEvent.click(await screen.findByText(/Cirurgia segura: Sign In/i));
    await screen.findByText("Voltar");
    expect(screen.getByText(/Paciente C\.L\.B\./)).toBeTruthy();
  });
});

describe("🔴 agendar não aceita mais iniciais digitadas quando o cadastro sabe quem é", () => {
  async function abrirForm(sb) {
    abrir(sb);
    fireEvent.click(await screen.findByText(/\+ Agendar cirurgia/i));
    await screen.findByText("Agendar");
  }

  it("com o prontuário conhecido: o campo vem preenchido do cadastro e fica travado", async () => {
    await abrirForm(banco({ pacientes: [CLARA] }));
    const campos = screen.getAllByRole("textbox");
    const prontuario = screen.getByPlaceholderText("48213");
    fireEvent.change(prontuario, { target: { value: "T9060" } });
    await waitFor(() => expect(screen.getByPlaceholderText("J.S.M.").value).toBe("C.L.B."));
    expect(screen.getByPlaceholderText("J.S.M.").readOnly).toBe(true);
    expect(screen.getByText(/Do cadastro: Clara Lima Barbosa/)).toBeTruthy();
    expect(campos.length).toBeGreaterThan(0);
  });

  it("digitar por cima não muda nada enquanto estiver travado", async () => {
    await abrirForm(banco({ pacientes: [CLARA] }));
    fireEvent.change(screen.getByPlaceholderText("48213"), { target: { value: "T9060" } });
    await waitFor(() => expect(screen.getByPlaceholderText("J.S.M.").value).toBe("C.L.B."));
    fireEvent.change(screen.getByPlaceholderText("J.S.M."), { target: { value: "Z.Z.Z." } });
    await waitFor(() => expect(screen.getByPlaceholderText("J.S.M.").value).toBe("C.L.B."));
  });

  it("o que vai para o banco são as iniciais do CADASTRO, não as digitadas", async () => {
    const sb = banco({ pacientes: [CLARA] });
    await abrirForm(sb);
    fireEvent.change(screen.getByPlaceholderText("48213"), { target: { value: "T9060" } });
    await waitFor(() => expect(screen.getByPlaceholderText("J.S.M.").value).toBe("C.L.B."));
    fireEvent.change(screen.getByPlaceholderText(/Colecistectomia/), { target: { value: "Artroplastia" } });
    fireEvent.click(screen.getByText("Agendar"));
    await waitFor(() => expect(sb.pedidos.some(p => p.metodo === "POST" && p.url.startsWith("cc_cirurgias"))).toBe(true));
  });

  it("cadastro que não dá para ler: campo LIVRE, com o aviso de que não será conferido", async () => {
    await abrirForm(banco({ falhar: ["pacientes"] }));
    fireEvent.change(screen.getByPlaceholderText("48213"), { target: { value: "T9999" } });
    await screen.findByText(/NÃO serão conferidas/);
    expect(screen.getByPlaceholderText("J.S.M.").readOnly).toBe(false);
    fireEvent.change(screen.getByPlaceholderText("J.S.M."), { target: { value: "Q.Q." } });
    expect(screen.getByPlaceholderText("J.S.M.").value).toBe("Q.Q.");
  });
});
