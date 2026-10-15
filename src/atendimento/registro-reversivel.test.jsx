// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// REGISTRO QUE NÃO SE CORRIGE NÃO SE FAZ NUM `prompt`
//
// 🔴 TRÊS DEFEITOS REAIS (revisão do módulo Atendimento, 05/10/2026):
//
//   1. O DESFECHO da consulta era escolhido digitando um número num
//      `prompt()`. Teclar 2 em vez de 1 grava "evadiu" — e desfecho NÃO
//      está em `CAMPOS_CORRIGIVEIS`, de propósito: é registro assistencial.
//      O erro de digitação virava permanente, e é ele que decide se a
//      consulta é faturada.
//
//   2. CANCELAR AGENDAMENTO: o motivo era opcional. Um Enter no prompt
//      vazio já cancelava — a vaga sumia e ninguém sabia por quê.
//
//   3. "REALIZADAS" contava PRESENÇA, não atendimento: quem dava presença e
//      desistia entrava no numerador.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import EscolhaRegistro from "./EscolhaRegistro.jsx";
import { producaoDoDia } from "./agenda.js";
import { DESFECHOS_AMBULATORIAL } from "./ciclo.js";

afterEach(cleanup);

const OPCOES = DESFECHOS_AMBULATORIAL.map(d => ({ chave: d.chave, label: d.label, dica: d.dica }));

describe("EscolhaRegistro — a escolha mora na tela", () => {
  it("🔴 cada opção aparece com a sua explicação (no prompt não cabia)", () => {
    render(<EscolhaRegistro titulo="Como terminou?" opcoes={OPCOES} onEscolher={() => {}} onCancelar={() => {}} />);
    expect(screen.getByText("Evadiu / desistiu")).toBeTruthy();
    expect(screen.getByText(/Chegou, foi registrado, e saiu antes de ser atendido/)).toBeTruthy();
  });

  it("🔴 não grava nada sem escolha — e diz o que falta", () => {
    const onEscolher = vi.fn();
    render(<EscolhaRegistro titulo="Como terminou?" opcoes={OPCOES} onEscolher={onEscolher} onCancelar={() => {}} />);
    fireEvent.click(screen.getByText("Registrar"));
    expect(onEscolher).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/Escolha uma opção/);
  });

  it("escolhe e grava a chave certa", () => {
    const onEscolher = vi.fn();
    render(<EscolhaRegistro titulo="Como terminou?" opcoes={OPCOES} onEscolher={onEscolher} onCancelar={() => {}} />);
    fireEvent.click(screen.getByText("Evadiu / desistiu"));
    fireEvent.click(screen.getByText("Registrar"));
    expect(onEscolher).toHaveBeenCalledWith("evadiu", null);
  });

  it("o aviso do que é irreversível aparece ANTES de gravar", () => {
    render(<EscolhaRegistro titulo="t" aviso="O desfecho NÃO se corrige nesta tela" opcoes={OPCOES}
      onEscolher={() => {}} onCancelar={() => {}} />);
    expect(screen.getByText(/NÃO se corrige/)).toBeTruthy();
  });

  it("🔴 motivo obrigatório: não grava em branco, e explica a consequência", () => {
    const onEscolher = vi.fn();
    render(<EscolhaRegistro titulo="Cancelar" opcoes={[{ chave: "cancelar", label: "Confirmo" }]}
      motivo={{ label: "Por quê", obrigatorio: true, faltando: "Escreva o motivo. Sem ele, ninguém saberá se a vaga pode ser reofertada." }}
      onEscolher={onEscolher} onCancelar={() => {}} />);
    fireEvent.click(screen.getByText("Confirmo"));
    fireEvent.click(screen.getByText("Registrar"));
    expect(onEscolher).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/reofertada/);
  });

  it("com motivo escrito, grava a chave E o texto", () => {
    const onEscolher = vi.fn();
    render(<EscolhaRegistro titulo="Cancelar" opcoes={[{ chave: "cancelar", label: "Confirmo" }]}
      motivo={{ label: "Por quê", obrigatorio: true, faltando: "falta" }}
      onEscolher={onEscolher} onCancelar={() => {}} />);
    fireEvent.click(screen.getByText("Confirmo"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "paciente desmarcou por telefone" } });
    fireEvent.click(screen.getByText("Registrar"));
    expect(onEscolher).toHaveBeenCalledWith("cancelar", "paciente desmarcou por telefone");
  });

  it("🔴 motivo OPCIONAL preenchido só com espaços vira null, não \"   \"", () => {
    // Sem isto, a coluna guarda um texto que parece preenchido e não diz
    // nada — pior que vazio, porque some da lista do que falta motivo.
    const onEscolher = vi.fn();
    render(<EscolhaRegistro titulo="t" opcoes={[{ chave: "x", label: "X" }]}
      motivo={{ label: "Observação", obrigatorio: false }}
      onEscolher={onEscolher} onCancelar={() => {}} />);
    fireEvent.click(screen.getByText("X"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } });
    fireEvent.click(screen.getByText("Registrar"));
    expect(onEscolher).toHaveBeenCalledWith("x", null);
  });

  it("espaço em branco não passa por motivo", () => {
    const onEscolher = vi.fn();
    render(<EscolhaRegistro titulo="Cancelar" opcoes={[{ chave: "cancelar", label: "Confirmo" }]}
      motivo={{ label: "Por quê", obrigatorio: true, faltando: "falta" }}
      onEscolher={onEscolher} onCancelar={() => {}} />);
    fireEvent.click(screen.getByText("Confirmo"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "    " } });
    fireEvent.click(screen.getByText("Registrar"));
    expect(onEscolher).not.toHaveBeenCalled();
  });
});

describe("🔴 'realizadas' conta atendimento, não presença", () => {
  const DIA = "2026-10-07";
  const GRADE = { id: 1, especialidade_cod: "cardio", dia_semana: new Date(DIA + "T00:00:00").getDay(),
                  hora_inicio: "08:00", hora_fim: "12:00", duracao_min: 20,
                  vagas_regulacao: 2, vagas_internas: 2, vagas_chegada: 0, ativo: true };
  const base = { data: DIA, origem_marcacao: "interna", especialidade_cod: "cardio" };
  const ATENDIDA = { ...base, id: 1, status: "presente", atendimento_id: 101 };
  const DESISTIU = { ...base, id: 2, status: "presente", atendimento_id: 102 };
  const EM_CURSO = { ...base, id: 3, status: "presente", atendimento_id: 103 };

  const chamar = desfechos => producaoDoDia({
    grades: [GRADE], data: DIA, agendamentos: [ATENDIDA, DESISTIU, EM_CURSO], bloqueios: [], desfechos });

  it("quem evadiu sai do numerador e vira 'desistência'", () => {
    const p = chamar({ 101: "atendido", 102: "evadiu", 103: null });
    expect(p.realizadas).toBe(2);
    expect(p.desistencias).toBe(1);
  });

  it("quem ainda não encerrou continua contando (a consulta está acontecendo)", () => {
    const p = chamar({ 101: "atendido", 102: "atendido", 103: null });
    expect(p.realizadas).toBe(3);
    expect(p.desistencias).toBe(0);
  });

  it("sem o mapa de desfechos, se comporta como antes (nenhuma tela quebra)", () => {
    const p = chamar(null);
    expect(p.realizadas).toBe(3);
    expect(p.desistencias).toBe(0);
  });

  it("a grafia do PS também conta como desistência", () => {
    expect(chamar({ 102: "evasao" }).desistencias).toBe(1);
  });
});
