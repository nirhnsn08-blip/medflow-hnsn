// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// A RÉGUA CHEGOU NO CARD — E CHEGOU DO JEITO CERTO?
//
// `comparacao.test.js` prova a REGRA. Este arquivo prova a FIAÇÃO, que é
// outra coisa e falha de outro jeito: trocar `TIPO.FLUXO` por `TIPO.ESTOQUE`
// numa linha da tela não quebra teste nenhum do motor, não quebra o build,
// não quebra o lint — e devolve de volta a mentira das 9h da manhã, que é o
// defeito que o motor existe para evitar.
//
// Então aqui o hospital tem história de sobra e um dia de hoje FRACO: zero
// altas às 14h. Um painel mal ligado anuncia queda; o certo fala de ontem.
//
// 🔴 E A SEGUNDA COISA QUE SÓ A TELA PODE ERRAR: a régua brigar com o
// limiar. 82% de ocupação está DENTRO dos limites (atenção só em 85) e ao
// mesmo tempo MUITO acima do normal da casa (41%). As duas leituras têm de
// aparecer juntas, sem uma apagar a outra — é o motivo de a régua não ter
// cor de farol.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import TorreDeComando from "./TorreDeComando.jsx";

afterEach(cleanup);

const HOJE = new Date();
const dia = n => {
  const d = new Date(HOJE);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Um hospital com 30 dias de movimento parelho: 4 altas/dia, 1 cirurgia
 * cancelada/dia, ocupação histórica perto de 40%. Hoje: 41 de 50 leitos
 * ocupados (82%) e NENHUMA alta ainda.
 */
function banco({ altasDeHoje = 0, diasDeHistoria = 30 } = {}) {
  const leitos = [
    ...Array.from({ length: 41 }, (_, i) => ({
      identificacao: `L${i + 1}`, status: "ocupado", setor: "Enfermaria",
      prontuario: `P${i + 1}`, iniciais: "A.B.", data_internacao: dia(0),
    })),
    ...Array.from({ length: 9 }, (_, i) => ({
      identificacao: `L${42 + i}`, status: "livre", setor: "Enfermaria",
    })),
  ];

  const saidas = [
    ...Array.from({ length: diasDeHistoria }, (_, k) =>
      Array.from({ length: 4 }, (_, j) => ({
        data_alta: dia(-(k + 1)), data_internacao: dia(-(k + 6)),
        dias_permanencia: 5, setor: "Enfermaria", leito: `L${j + 1}`, prontuario: `H${k}${j}`,
      }))).flat(),
    ...Array.from({ length: altasDeHoje }, (_, j) => ({
      data_alta: dia(0), data_internacao: dia(-5), dias_permanencia: 5,
      setor: "Enfermaria", leito: `L${j + 1}`, prontuario: `X${j}`,
    })),
  ];

  const canceladas = Array.from({ length: diasDeHistoria }, (_, k) => ({
    id: `c${k}`, data: dia(-(k + 1)), status: "cancelada",
    iniciais: "C.D.", prontuario: `Q${k}`, procedimento: "Hérnia",
    cancelamento_motivo: "falta de vaga na UTI",
  }));

  return async caminho => {
    const c = String(caminho);
    if (c.startsWith("leitos?")) return leitos;
    if (c.startsWith("leitos_saidas?")) return saidas;
    if (c.startsWith("setores?")) return [{ nome: "Enfermaria", ordem: 1, alerta_amarelo: 85, alerta_vermelho: 95 }];
    if (c.startsWith("cc_cirurgias?") && c.includes("status=eq.cancelada")) return canceladas;
    return [];
  };
}

/**
 * Monta e espera a régua TER SE PRONUNCIADO — que é "média N" quando há
 * amostra e "sem régua ainda" quando não há. Esperar só pela média faria o
 * próprio helper exigir a resposta que o caso do hospital novo não deve dar.
 */
const monta = async (sb) => {
  const r = render(<TorreDeComando sb={sb} />);
  await waitFor(() => expect(r.container.textContent).toContain("Ocupação geral"));
  await waitFor(() => expect(r.container.textContent).toMatch(/média \d|sem régua ainda/));
  return r;
};

describe("🔴 a mentira das 9h não volta pela tela", () => {
  it("hoje sem nenhuma alta NÃO vira queda — a régua fala de ontem", async () => {
    const { container } = await monta(banco({ altasDeHoje: 0 }));
    const texto = container.textContent;

    // A régua das altas existe e é sobre ONTEM, com a média da casa.
    expect(texto).toMatch(/ontem/);
    expect(texto).toMatch(/média 4 em \d+ dias/);

    // 🔴 E o que NÃO pode aparecer: queda anunciada num dia de 14h.
    expect(texto).not.toMatch(/▼ (hoje|agora) abaixo/);
  });

  it("o card ainda mostra as 0 altas de hoje — a régua não esconde o número", async () => {
    const { container } = await monta(banco({ altasDeHoje: 0 }));
    expect(container.textContent).toContain("saídas registradas hoje");
  });

  it("o cancelamento de hoje também é julgado no último dia fechado", async () => {
    const { container } = await monta(banco());
    expect(container.textContent).toMatch(/ontem.*média 1 em \d+ dias/s);
  });
});

describe("🔴 a régua e o limiar não brigam", () => {
  it("82% está dentro dos limites E muito acima do normal desta casa", async () => {
    const { container } = await monta(banco());
    const texto = container.textContent;

    expect(texto).toContain("82%");                            // o número
    expect(texto).toContain("tudo dentro dos limites");        // o que o LIMIAR diz
    expect(texto).toMatch(/▲ agora acima do normal/);          // o que a RÉGUA diz
    expect(texto).toMatch(/média \d+% em \d+ dias/);           // e a régua declarada

    // 🔴 As duas frases convivendo é o teste: um painel que deixasse a régua
    // mexer no farol escolheria uma das duas e esconderia a outra.
  });

  it("a régua declara de quantos dias ela é — sem amostra não há discordância", async () => {
    const { container } = await monta(banco());
    expect(container.textContent).toMatch(/em (2[0-9]|30) dias/);
  });
});

describe("🔴 hospital novo: sem dias para a régua, ela diz que não sabe", () => {
  it("três dias de uso não viram média — e a tela não finge que viraram", async () => {
    const { container } = await monta(banco({ diasDeHistoria: 3 }));
    const texto = container.textContent;
    expect(texto).toMatch(/sem régua ainda — \d+ dias? de histórico/);
    expect(texto).not.toMatch(/dentro do normal/);
  });
});

describe("leitura que falhou não vira régua de zero", () => {
  it("sem banco nenhum, a tela monta e não afirma normalidade", async () => {
    const { container } = render(<TorreDeComando sb={null} />);
    await waitFor(() => expect(container.textContent).toContain("Ocupação geral"));
    const texto = container.textContent;
    expect(texto).not.toMatch(/dentro do normal/);
    expect(texto).toMatch(/sem leitura|Não consegui ler/);
  });
});
