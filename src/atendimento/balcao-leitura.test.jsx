// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// O BALCÃO QUANDO A LEITURA FALHA
//
// 🔴 DEFEITO REAL (achado na revisão de 05/10/2026). Recepção e Agenda
// tratavam "não consegui ler" como "não tem":
//
//   • Recepção — a consulta marcada para hoje e o atendimento já aberto
//     sumiam juntos, e o botão de EMERGÊNCIA ficava livre. Quem tinha hora
//     marcada ia para a triagem do PS; quem já estava aberto ganhava um
//     episódio duplicado.
//   • Agenda — "Ninguém registrado nesta agenda hoje", todas as vagas
//     livres e "+ Marcar" oferecendo o horário de quem já estava marcado.
//
// O banco falso aqui falha SÓ a pergunta que importa (`null` é o que o
// `sb()` devolve quando a requisição não volta), e o resto responde normal.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, cleanup, fireEvent, waitFor, screen } from "@testing-library/react";
import Recepcao from "./Recepcao.jsx";
import Agenda from "./Agenda.jsx";
import { todayStr } from "../util/datas.js";

afterEach(cleanup);

const PACIENTE = {
  prontuario: "T9035", iniciais: "L.N.", nome_completo: "Laura Nunes",
  data_nascimento: "1990-04-02", sexo: "F", cpf: null, cns: null,
};

/** Um `sb` que responde por prefixo de URL; `falhar` diz quais devolvem `null`. */
function bancoFalso({ falhar = [], agendaDeHoje = [] } = {}) {
  const pedidos = [];
  const sb = async (url) => {
    pedidos.push(url);
    const tabela = String(url).split("?")[0];
    if (falhar.includes(tabela)) return null;
    if (tabela === "pacientes") return [PACIENTE];
    if (tabela === "ag_agendamentos") return agendaDeHoje;
    return [];
  };
  sb.pedidos = pedidos;
  return sb;
}

async function procurarEEscolher(sb) {
  render(<Recepcao sb={sb} currentUser={{ name: "T", username: "t" }} canEdit={true} />);
  const campo = screen.getByPlaceholderText(/data de nascimento/i);
  fireEvent.change(campo, { target: { value: "T9035" } });
  fireEvent.click(screen.getByText("Procurar"));
  // prontuário identifica: um resultado só é escolhido sozinho
  await waitFor(() => expect(sb.pedidos.some(u => u.startsWith("ps_atendimentos?prontuario"))).toBe(true));
}

// A busca do balcão (e não as listas de pendência que a tela lê ao abrir).
const ehBusca = u => u.startsWith("pacientes?") && u.includes("&limit=25&order=prontuario");

const botaoAbrir = () => [...document.querySelectorAll("button")]
  .find(b => /Abrir atendimento|Abrir com|Confira a agenda|Conferindo a agenda/.test(b.textContent));

describe("Recepção — a conferência da agenda falhou", () => {
  it("🔴 avisa, e trava o botão de abrir em vez de oferecer emergência", async () => {
    const sb = bancoFalso({ falhar: ["ag_agendamentos"] });
    await procurarEEscolher(sb);
    await screen.findByText(/Não consegui conferir a agenda e os atendimentos deste paciente/);
    expect(botaoAbrir().disabled).toBe(true);
    expect(botaoAbrir().textContent).toMatch(/Confira a agenda antes/);
  });

  it("🔴 o mesmo quando falha a pergunta dos atendimentos abertos", async () => {
    const sb = bancoFalso({ falhar: ["ps_atendimentos"] });
    await procurarEEscolher(sb);
    await screen.findByText(/Não consegui conferir a agenda/);
    expect(botaoAbrir().disabled).toBe(true);
  });

  it("\"Ler de novo\" que dá certo destrava e mostra a consulta que estava escondida", async () => {
    const hoje = todayStr();
    let falha = true;
    const sbBase = bancoFalso({ agendaDeHoje: [{ id: 7, data: hoje, hora: "09:30", especialidade_cod: "cardio", status: "agendado" }] });
    const sb = async (url) => (falha && String(url).startsWith("ag_agendamentos") ? null : sbBase(url));
    sb.pedidos = sbBase.pedidos;
    await procurarEEscolher(sb);
    await screen.findByText(/Não consegui conferir a agenda/);

    falha = false;
    fireEvent.click(screen.getByText("Ler de novo"));
    await screen.findByText("Tem consulta marcada hoje");
    expect(screen.queryByText(/Não consegui conferir a agenda/)).toBeNull();
  });

  it("controle: com a leitura boa e nada marcado, não há faixa e o botão fica livre", async () => {
    const sb = bancoFalso();
    await procurarEEscolher(sb);
    await waitFor(() => expect(botaoAbrir().disabled).toBe(false));
    expect(screen.queryByText(/Não consegui conferir a agenda/)).toBeNull();
  });

  it("🔴 'hoje' é o dia LOCAL na pergunta da agenda (UTC já é amanhã depois das 21h)", async () => {
    const sb = bancoFalso();
    await procurarEEscolher(sb);
    const pedido = sb.pedidos.find(u => u.startsWith("ag_agendamentos"));
    expect(pedido).toContain(`data=gte.${todayStr()}`);
  });
});

describe("Recepção — busca por data de nascimento", () => {
  it("🔴 procura pela data, e NÃO escolhe sozinho o único nascido naquele dia", async () => {
    const sb = bancoFalso();
    render(<Recepcao sb={sb} currentUser={{ name: "T" }} canEdit={true} />);
    fireEvent.change(screen.getByPlaceholderText(/data de nascimento/i), { target: { value: "02/04/1990" } });
    fireEvent.click(screen.getByText("Procurar"));
    await screen.findByText(/1 encontrado/);
    const busca = sb.pedidos.find(ehBusca);
    expect(busca).toContain("data_nascimento.eq.1990-04-02");
    // não abriu a ficha: nenhuma pergunta de agenda foi feita
    expect(sb.pedidos.some(u => u.startsWith("ag_agendamentos"))).toBe(false);
  });

  it("data que não existe é explicada, e nada é consultado", async () => {
    const sb = bancoFalso();
    render(<Recepcao sb={sb} currentUser={{ name: "T" }} canEdit={true} />);
    fireEvent.change(screen.getByPlaceholderText(/data de nascimento/i), { target: { value: "31/02/1950" } });
    fireEvent.click(screen.getByText("Procurar"));
    await screen.findByText(/não existe no calendário/);
    expect(sb.pedidos.some(ehBusca)).toBe(false);
  });
});

describe("Agenda — o dia que não deu para ler", () => {
  const hoje = todayStr();
  const GRADE = {
    id: 1, especialidade_cod: "cardio", profissional_username: null,
    dia_semana: new Date(hoje + "T00:00:00").getDay(), hora_inicio: "08:00", hora_fim: "12:00",
    duracao_min: 20, vagas_regulacao: 2, vagas_internas: 4, vagas_chegada: 2,
    vigencia_inicio: "2020-01-01", vigencia_fim: null, ativo: true,
  };
  const bancoDaAgenda = ({ falhar = [] } = {}) => async (url) => {
    const t = String(url).split("?")[0];
    if (falhar.includes(t)) return null;
    if (t === "ag_grades") return [GRADE];
    return [];
  };

  it("🔴 agendamentos ilegíveis: avisa, números em '—', e não oferece '+ Marcar'", async () => {
    render(<Agenda sb={bancoDaAgenda({ falhar: ["ag_agendamentos"] })} currentUser={{ name: "T" }} canEdit={true} />);
    await screen.findByText(/Não consegui ler os agendamentos e bloqueios deste dia/);
    expect(screen.queryByText("Ninguém registrado nesta agenda hoje.")).toBeNull();
    expect(screen.queryByText("+ Marcar")).toBeNull();
    expect(screen.getByText(/Não consegui ler quem está marcado nesta agenda/)).toBeTruthy();
  });

  it("🔴 grades ilegíveis NÃO viram 'Nenhuma grade nesta data. Cadastre…'", async () => {
    render(<Agenda sb={bancoDaAgenda({ falhar: ["ag_grades"] })} currentUser={{ name: "T" }} canEdit={true} />);
    await screen.findByText(/Não consegui ler as grades deste dia/);
    expect(screen.queryByText(/Nenhuma grade nesta data/)).toBeNull();
  });

  it("controle: leitura boa e dia vazio continua dizendo que está vazio, com '+ Marcar'", async () => {
    render(<Agenda sb={bancoDaAgenda()} currentUser={{ name: "T" }} canEdit={true} />);
    await screen.findByText("Ninguém registrado nesta agenda hoje.");
    expect(screen.queryByText(/Não consegui ler/)).toBeNull();
    expect(screen.getByText("+ Marcar")).toBeTruthy();
  });
});
