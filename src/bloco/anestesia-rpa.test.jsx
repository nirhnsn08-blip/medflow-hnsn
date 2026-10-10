// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// A FICHA ANESTÉSICA E A ALTA DA RPA
//
// 🔴 OS DOIS BURACOS QUE ESTE ARQUIVO GUARDA:
//
//   1. `cc_cirurgias.tipo_anestesia` existia desde o primeiro dia com ZERO
//      usos na tela. Coluna sem input — ninguém nunca pôde preenchê-la, e
//      coluna vazia não dá erro.
//
//   2. A ALTA DA RPA ERA UM BOTÃO. Um clique concluía a cirurgia e
//      carimbava `rpa_saida_em`. O paciente deixava a recuperação — onde
//      acabam o monitor e a enfermagem 1:1, e onde acontecem depressão
//      respiratória e obstrução de via aérea — porque alguém clicou.
//
// ⚠️ O teste mais importante aqui não é o da soma: é o do 8 COM APNEIA.
// Oito pontos bem distribuídos e oito pontos com respiração zerada somam
// igual, e os dois pacientes não têm nada em comum.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  ALDRETE_MINIMO, ALDRETE_PARAMETROS,
  faltamPontuar, liberaAlta, linhaDaAvaliacao, motivoParaNaoDarAlta,
  resumoDaAvaliacao, tendencia, totalAldrete, ultimaAvaliacao, zerados,
} from "./aldrete.js";
import {
  ASA, TIPOS_ANESTESIA, VIAS_AEREAS,
  conferirFicha, fichaVigente, linhaDaFicha, resumoDaFicha, viaAereaDificilPregressa,
} from "./anestesia.js";
import { FichaAnestesicaModal, RecuperacaoModal } from "./AnestesiaRpa.jsx";
import { FALHA } from "../util/leitura.js";

afterEach(cleanup);

const CIR = { id: 9, iniciais: "A.B.C.", procedimento: "Colecistectomia", status: "recuperacao",
              rpa_entrada_em: "2026-10-10T13:00:00Z" };
const CHEIO = { atividade: 2, respiracao: 2, circulacao: 2, consciencia: 2, saturacao: 2 };

// ── O ESCORE ────────────────────────────────────────────────
describe("🔴 o escore de Aldrete", () => {
  it("soma os cinco parâmetros", () => {
    expect(totalAldrete(CHEIO)).toBe(10);
    expect(totalAldrete({ ...CHEIO, saturacao: 1, atividade: 1 })).toBe(8);
  });

  it("🔴 escore INCOMPLETO é `null`, nunca uma soma parcial", () => {
    // Quatro parâmetros somando 8 não é "8": é paciente que ninguém
    // terminou de avaliar, e tratá-lo como 8 o deixaria a um ponto da alta.
    const quase = { atividade: 2, respiracao: 2, circulacao: 2, consciencia: 2 };
    expect(totalAldrete(quase)).toBeNull();
    expect(faltamPontuar(quase).map(p => p.chave)).toEqual(["saturacao"]);
    expect(motivoParaNaoDarAlta(quase)).toMatch(/Escore incompleto/);
    expect(motivoParaNaoDarAlta(quase)).toMatch(/não é escore baixo/);
  });

  it("nota fora de 0–2 não conta como nota", () => {
    expect(totalAldrete({ ...CHEIO, atividade: 3 })).toBeNull();
    expect(totalAldrete({ ...CHEIO, atividade: -1 })).toBeNull();
    expect(totalAldrete({ ...CHEIO, atividade: 1.5 })).toBeNull();
  });

  it("10/10 libera", () => {
    expect(motivoParaNaoDarAlta(CHEIO)).toBeNull();
    expect(liberaAlta(CHEIO)).toBe(true);
  });

  it(`abaixo de ${ALDRETE_MINIMO} não libera, e a frase diz o que fazer`, () => {
    const oito = { ...CHEIO, atividade: 1, saturacao: 1 };
    expect(totalAldrete(oito)).toBe(8);
    expect(motivoParaNaoDarAlta(oito)).toMatch(/Aldrete 8 de 10/);
    expect(motivoParaNaoDarAlta(oito)).toMatch(/Reavalie em 10 a 15 minutos/);
  });

  it("🔴 8 COM APNEIA não libera — a soma não salva o parâmetro zerado", () => {
    const comApneia = { atividade: 2, respiracao: 0, circulacao: 2, consciencia: 2, saturacao: 2 };
    expect(totalAldrete(comApneia)).toBe(8);
    expect(zerados(comApneia).map(p => p.chave)).toEqual(["respiracao"]);
    const m = motivoParaNaoDarAlta(comApneia);
    expect(m).toMatch(/Respiração com nota ZERO/);
    expect(m).toMatch(/os dois pacientes não têm nada em comum/);
  });

  it("🔴 o veto do zero é INDEPENDENTE da soma, e a frase prova isso", () => {
    // Aritmética: com um parâmetro zerado o máximo possível é 8, então
    // "9 com um zero" não existe. O que se prova aqui é outra coisa — que
    // a recusa cita o ZERO e não a soma. Se a regra fosse só `total < 9`,
    // a frase falaria de 8/10 e a pessoa reavaliaria esperando um ponto;
    // o que ela precisa é tratar a circulação.
    const comZero = { atividade: 2, respiracao: 2, circulacao: 0, consciencia: 2, saturacao: 2 };
    expect(totalAldrete(comZero)).toBe(8);
    expect(liberaAlta(comZero)).toBe(false);
    const m = motivoParaNaoDarAlta(comZero);
    expect(m).toMatch(/Circulação .* com nota ZERO/);
    expect(m).not.toMatch(/Reavalie em 10 a 15/);
  });

  it("os cinco parâmetros têm três notas descritas cada", () => {
    // O texto não é enfeite: é o que a enfermagem lê para pontuar.
    expect(ALDRETE_PARAMETROS).toHaveLength(5);
    for (const p of ALDRETE_PARAMETROS) {
      expect(p.notas, p.chave).toHaveLength(3);
      for (const n of p.notas) expect(n.length, p.chave).toBeGreaterThan(10);
    }
  });
});

// ── A CURVA ─────────────────────────────────────────────────
describe("🔴 a curva, que uma foto esconde", () => {
  const em = (h, notas) => ({ criado_em: `2026-10-10T${h}:00:00Z`, ...notas });

  it("paciente PIORANDO é apontado, mesmo com nota que parece quase lá", () => {
    const serie = [
      em("13", CHEIO),                                   // 10
      em("14", { ...CHEIO, atividade: 1, saturacao: 1, consciencia: 1 }),  // 7
    ];
    expect(tendencia(serie)).toEqual({ sentido: "piorando", de: 10, para: 7 });
  });

  it("melhorando e estável também são ditos", () => {
    const sobe = [em("13", { ...CHEIO, atividade: 1 }), em("14", CHEIO)];
    expect(tendencia(sobe).sentido).toBe("melhorando");
    expect(tendencia([em("13", CHEIO), em("14", CHEIO)]).sentido).toBe("estável");
  });

  it("uma avaliação só NÃO tem tendência — e não inventa uma", () => {
    expect(tendencia([em("13", CHEIO)])).toBeNull();
    expect(tendencia([])).toBeNull();
  });

  it("a ordem é pelo relógio, não pela posição na lista", () => {
    const foraDeOrdem = [em("15", { ...CHEIO, atividade: 0 }), em("13", CHEIO)];
    expect(tendencia(foraDeOrdem)).toEqual({ sentido: "piorando", de: 10, para: 8 });
    expect(ultimaAvaliacao(foraDeOrdem).criado_em).toMatch(/15:00/);
  });
});

// ── A LINHA GRAVADA ─────────────────────────────────────────
describe("a avaliação gravada", () => {
  it("🔴 NÃO manda `total` — é coluna gerada pelo banco", () => {
    // Soma calculada na tela divergiria da soma que o gatilho da alta usa,
    // e aí a tela diria 9 e o banco recusaria.
    const l = linhaDaAvaliacao({ cirurgia: CIR, av: CHEIO });
    expect(l).not.toHaveProperty("total");
    expect(l.cirurgia_id).toBe(9);
    expect(l.atividade).toBe(2);
  });

  it("o resumo diz o total e nomeia o que zerou", () => {
    expect(resumoDaAvaliacao({ ...CHEIO, respiracao: 0 })).toMatch(/Aldrete 8\/10 · ZERO em respiração/);
    expect(resumoDaAvaliacao(null)).toBeNull();
  });
});

// ── A FICHA ANESTÉSICA ──────────────────────────────────────
describe("🔴 a ficha anestésica", () => {
  const base = { tecnicas: ["geral"], asa: "II", via_aerea: "intubacao" };

  it("sem técnica não passa — é o campo que o próximo anestesista procura", () => {
    const v = conferirFicha({ cirurgia: CIR, form: { ...base, tecnicas: [] } });
    expect(v.ok).toBe(false);
    expect(v.erros.join(" ")).toMatch(/qual técnica anestésica/);
  });

  it("mais de uma técnica é normal e passa", () => {
    expect(conferirFicha({ cirurgia: CIR, form: { ...base, tecnicas: ["geral", "peridural"] } }).ok).toBe(true);
  });

  it("sem ASA não passa — é o risco com que o paciente entrou", () => {
    expect(conferirFicha({ cirurgia: CIR, form: { ...base, asa: "" } }).erros.join(" ")).toMatch(/ASA/);
  });

  it("🔴 via aérea DIFÍCIL exige descrever o manejo", () => {
    const v = conferirFicha({ cirurgia: CIR, form: { ...base, via_aerea_dificil: true, via_aerea_manejo: "foi dificil" } });
    expect(v.ok).toBe(false);
    expect(v.erros.join(" ")).toMatch(/o que falhou, o que funcionou, quantas tentativas/);
  });

  it("com o manejo descrito, passa — e avisa que vira alerta permanente", () => {
    const v = conferirFicha({ cirurgia: CIR, form: {
      ...base, via_aerea_dificil: true,
      via_aerea_manejo: "Cormack IV. Duas tentativas com laringoscopia direta, sucesso com bougie.",
    } });
    expect(v.ok).toBe(true);
    expect(v.avisos.join(" ")).toMatch(/alerta permanente/);
  });

  it("geral sem dispositivo de via aérea avisa", () => {
    const v = conferirFicha({ cirurgia: CIR, form: { tecnicas: ["geral"], asa: "I", via_aerea: "nenhuma" } });
    expect(v.avisos.join(" ")).toMatch(/sem dispositivo de via aérea/);
  });

  it("cirurgia cancelada não tem ato anestésico", () => {
    expect(conferirFicha({ cirurgia: { ...CIR, status: "cancelada" }, form: base }).erros.join(" "))
      .toMatch(/CANCELADA/);
  });

  it("🔴 o manejo só vai quando difícil está marcado", () => {
    const l = linhaDaFicha({ cirurgia: CIR, form: { ...base, via_aerea_dificil: false, via_aerea_manejo: "sobrou do rascunho" } });
    expect(l.via_aerea_manejo).toBeNull();
  });

  it("técnica inválida não entra na linha gravada", () => {
    const l = linhaDaFicha({ cirurgia: CIR, form: { ...base, tecnicas: ["geral", "hipnose"] } });
    expect(l.tecnicas).toEqual(["geral"]);
  });

  it("ASA E é flag separada — ASA II de emergência continua ASA II", () => {
    const l = linhaDaFicha({ cirurgia: CIR, form: { ...base, asa_emergencia: true } });
    expect(l.asa).toBe("II");
    expect(l.asa_emergencia).toBe(true);
    expect(resumoDaFicha(l)).toMatch(/ASA IIE/);
  });

  it("a vigente é a que ninguém corrigiu, e FALHA é `null`", () => {
    const v1 = { id: 1, versao: 1, corrige_id: null };
    const v2 = { id: 2, versao: 2, corrige_id: 1 };
    expect(fichaVigente([v1, v2])).toBe(v2);
    expect(fichaVigente([])).toBeUndefined();
    expect(fichaVigente(FALHA)).toBeNull();
  });
});

// ── O ALERTA QUE ATRAVESSA ATENDIMENTOS ─────────────────────
describe("🔴 via aérea difícil é dado da PESSOA", () => {
  it("acha a ficha mais recente que registrou dificuldade", () => {
    const fichas = [
      { id: 1, via_aerea_dificil: false, criado_em: "2026-01-01T00:00:00Z" },
      { id: 2, via_aerea_dificil: true, criado_em: "2024-05-05T00:00:00Z", via_aerea_manejo: "bougie" },
      { id: 3, via_aerea_dificil: true, criado_em: "2025-09-09T00:00:00Z", via_aerea_manejo: "videolaringoscópio" },
    ];
    expect(viaAereaDificilPregressa(fichas).id).toBe(3);
  });

  it("sem dificuldade nenhuma, `null` — e não um alerta em branco", () => {
    expect(viaAereaDificilPregressa([{ id: 1, via_aerea_dificil: false }])).toBeNull();
    expect(viaAereaDificilPregressa([])).toBeNull();
  });
});

// ── AS TELAS ────────────────────────────────────────────────
describe("🔴 o modal da recuperação", () => {
  const abrir = (props = {}) => {
    const onAvaliar = vi.fn(async () => ({ ok: true }));
    const onAlta = vi.fn(async () => ({ ok: true }));
    const onClose = vi.fn();
    render(<RecuperacaoModal cirurgia={CIR} avaliacoes={[]}
      onClose={onClose} onAvaliar={onAvaliar} onAlta={onAlta} {...props} />);
    return { onAvaliar, onAlta, onClose };
  };

  it("sem avaliação nenhuma, a alta está DESLIGADA", () => {
    abrir();
    expect(screen.getByRole("button", { name: /Dar alta da RPA/ }).disabled).toBe(true);
    expect(screen.getByText(/Nenhuma avaliação registrada ainda/)).toBeTruthy();
  });

  it("🔴 com Aldrete 8 registrado, a alta continua desligada", () => {
    abrir({ avaliacoes: [{ id: 1, ...CHEIO, atividade: 1, saturacao: 1, criado_em: "2026-10-10T13:10:00Z" }] });
    expect(screen.getByRole("button", { name: /Dar alta da RPA/ }).disabled).toBe(true);
    expect(screen.getByText(/Último escore 8\/10 — ainda não libera/)).toBeTruthy();
  });

  it("🔴 com Aldrete 8 E APNEIA, também — e a soma é a mesma", () => {
    abrir({ avaliacoes: [{ id: 1, ...CHEIO, respiracao: 0, criado_em: "2026-10-10T13:10:00Z" }] });
    expect(screen.getByRole("button", { name: /Dar alta da RPA/ }).disabled).toBe(true);
  });

  it("com um escore que libera, a alta LIGA — mas ainda exige o clique", async () => {
    // O escore libera; quem dá alta é pessoa. Automatizar tiraria do
    // anestesista uma decisão que é dele por norma.
    const { onAlta } = abrir({ avaliacoes: [{ id: 1, ...CHEIO, criado_em: "2026-10-10T13:20:00Z" }] });
    const bt = screen.getByRole("button", { name: /Dar alta da RPA/ });
    expect(bt.disabled).toBe(false);
    expect(onAlta).not.toHaveBeenCalled();
    fireEvent.click(bt);
    await waitFor(() => expect(onAlta).toHaveBeenCalled());
  });

  it("🔴 a queda do escore aparece como EMERGÊNCIA, não como 'quase lá'", () => {
    abrir({ avaliacoes: [
      { id: 1, ...CHEIO, criado_em: "2026-10-10T13:00:00Z" },
      { id: 2, ...CHEIO, atividade: 1, consciencia: 1, saturacao: 1, criado_em: "2026-10-10T13:20:00Z" },
    ] });
    expect(screen.getByText(/PIORANDO — o escore caiu de 10 para 7/)).toBeTruthy();
    expect(screen.getByText(/Chame o anestesista/)).toBeTruthy();
  });

  it("registrar avaliação só liga com os cinco parâmetros pontuados", () => {
    abrir();
    const bt = screen.getByRole("button", { name: /Registrar avaliação/ });
    expect(bt.disabled).toBe(true);
    for (const p of ALDRETE_PARAMETROS) {
      fireEvent.click(document.querySelector(`input[name="ald-${p.chave}"][type="radio"]`));
    }
    expect(screen.getByRole("button", { name: /Registrar avaliação/ }).disabled).toBe(false);
  });

  it("a recusa do banco aparece e o modal NÃO fecha", async () => {
    const onAlta = vi.fn(async () => ({ ok: false, motivo: "Alta da RPA recusada: melhor Aldrete registrado foi 6/10." }));
    const onClose = vi.fn();
    render(<RecuperacaoModal cirurgia={CIR} onClose={onClose} onAlta={onAlta} onAvaliar={vi.fn()}
      avaliacoes={[{ id: 1, ...CHEIO, criado_em: "2026-10-10T13:20:00Z" }]} />);
    fireEvent.click(screen.getByRole("button", { name: /Dar alta da RPA/ }));
    await waitFor(() => expect(screen.getByText(/melhor Aldrete registrado foi 6\/10/)).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("o modal da ficha anestésica", () => {
  const abrir = (props = {}) => {
    const onConfirm = vi.fn(async () => ({ ok: true }));
    const onClose = vi.fn();
    render(<FichaAnestesicaModal cirurgia={CIR} fichas={[]} onClose={onClose} onConfirm={onConfirm} {...props} />);
    return { onConfirm, onClose };
  };

  it("as técnicas são múltipla escolha, não uma só", () => {
    abrir();
    for (const t of TIPOS_ANESTESIA) expect(screen.getByRole("button", { name: t.label })).toBeTruthy();
  });

  it("o campo do manejo só aparece depois de marcar difícil", () => {
    abrir();
    expect(screen.queryByPlaceholderText(/o que falhou, o que funcionou/)).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /VIA AÉREA DIFÍCIL/ }));
    expect(screen.getByPlaceholderText(/o que falhou, o que funcionou/)).toBeTruthy();
  });

  it("grava a ficha quando técnica e ASA estão preenchidos", async () => {
    const { onConfirm } = abrir();
    fireEvent.click(screen.getByRole("button", { name: "Geral" }));
    fireEvent.change(document.querySelector("select"), { target: { value: "II" } });
    const bt = screen.getByRole("button", { name: /Gravar a ficha/ });
    expect(bt.disabled).toBe(false);
    fireEvent.click(bt);
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm.mock.calls[0][0].tecnicas).toEqual(["geral"]);
  });

  it("🔴 leitura que falhou: não oferece gravar, e diz por quê", () => {
    abrir({ fichas: FALHA });
    expect(screen.getByText(/Não consegui ler as fichas/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Geral" }));
    fireEvent.change(document.querySelector("select"), { target: { value: "II" } });
    expect(screen.getByRole("button", { name: /Gravar a ficha/ }).disabled).toBe(true);
  });

  it("com ficha vigente, abre em modo CORREÇÃO", () => {
    abrir({ fichas: [{ id: 3, versao: 1, corrige_id: null, tecnicas: ["geral"], asa: "II" }] });
    expect(screen.getByText(/CORREÇÃO da versão 1/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Gravar a correção/ }).disabled).toBe(true);
  });

  it("todos os ASA e todas as vias aéreas estão nos selects", () => {
    abrir();
    const opcoes = [...document.querySelectorAll("select")].flatMap(s => [...s.options]).map(o => o.value);
    for (const a of ASA) expect(opcoes).toContain(a.chave);
    for (const v of VIAS_AEREAS) expect(opcoes).toContain(v.chave);
  });
});
