// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// A FICHA IMPRESSA QUANDO NÃO SE CONSEGUE LER OS RESPONSÁVEIS
//
// 🔴 DEFEITO REAL (achado na revisão de 09/10/2026). `carregarResponsaveis`
// já devolvia a lista marcada de `util/leitura.js`, mas a ficha fazia
//
//     (Array.isArray(responsaveis) ? responsaveis : []).filter(...)
//
// e o `.filter` apaga a marca. A seção simplesmente NÃO SAÍA — e no papel
// isso é indistinguível de "ninguém está registrado".
//
// POR QUE É PIOR NO PAPEL QUE NA TELA: tela se recarrega. A folha vai para
// o prontuário físico e segue o paciente até a beira do leito. Quem a ler
// às 3h da manhã não tem nenhuma forma de descobrir que a leitura falhou —
// e essa lista é justamente a que diz a quem NÃO entregar a criança.
//
// ⚠️ ESTE ARQUIVO VAI DO `sb` ATÉ O PAPEL, de propósito. `impressos.test.js`
// cobre a decisão (função pura); aqui se confere que o aviso chega ao
// documento renderizado — porque o defeito morava exatamente no pedaço
// entre os dois: o `{ficha.responsaveis.length > 0 && ...}` do JSX, que
// nenhum teste puro alcança.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import Impressos from "./Impressos.jsx";
import { carregarResponsaveis } from "./dados.js";
import { naoDeuParaLer, FALHA } from "../util/leitura.js";

afterEach(cleanup);

const ADULTO = {
  prontuario: "100042", nome_completo: "Maria Aparecida da Silva",
  data_nascimento: "1957-03-04", nome_mae: "Joana da Silva",
  sexo: "F", cpf: "52998224725", cns: "898001160650005",
};

const CRIANCA = {
  prontuario: "100043", nome_completo: "Pedro Henrique Lima",
  data_nascimento: "2019-05-02", nome_mae: "Ana Lima", sexo: "M",
  cpf: null, cns: "898001160650006",
};

const ATENDIMENTO = {
  id: 77, prontuario: "100042", status: "aguardando_triagem",
  chegada_em: "2026-07-30T12:30:00Z", tipo_atendimento: "emergencia",
  queixa: "dor no peito",
};

/** Monta os impressos já na aba da FICHA — é ela que carrega os responsáveis. */
function abrirFicha(props) {
  const r = render(
    <Impressos
      paciente={ADULTO} atendimento={ATENDIMENTO}
      currentUser={{ name: "adauam_feistler" }}
      {...props}
    />
  );
  // A aba inicial é a pulseira (episódio aberto). A ficha é um clique.
  fireEvent.click(screen.getByRole("button", { name: /Ficha do atendimento/i }));
  return r;
}

describe("a carga marca a falha", () => {
  it("`sb` que não volta devolve a lista MARCADA, não um vazio comum", async () => {
    const r = await carregarResponsaveis(async () => null, 77);
    expect(naoDeuParaLer(r)).toBe(true);
    // E continua sendo lista de verdade: quem não perguntar não quebra.
    expect(Array.isArray(r)).toBe(true);
    expect(r).toHaveLength(0);
  });

  it("episódio que realmente não tem responsável NÃO é marcado", async () => {
    const r = await carregarResponsaveis(async () => [], 77);
    expect(naoDeuParaLer(r)).toBe(false);
  });
});

describe("a ficha impressa diz quando a lista não pôde ser lida", () => {
  it("o aviso sai NO PAPEL, e não só na tela de quem imprimiu", () => {
    abrirFicha({ responsaveis: FALHA });
    // `#impresso-print` é a única área visível na impressão (ver printStyles).
    const papel = document.getElementById("impresso-print");
    expect(papel.textContent).toContain("NÃO FOI POSSÍVEL LER A LISTA DE RESPONSÁVEIS");
    expect(papel.textContent).toContain("NÃO significa que ninguém está registrado");
    // A seção existe mesmo sem ninguém dentro — era justamente o que
    // desaparecia.
    expect(papel.textContent).toContain("RESPONSÁVEL PELO EPISÓDIO");
  });

  it("menor de idade: a folha manda NÃO entregar com base nela", () => {
    abrirFicha({ paciente: CRIANCA, responsaveis: FALHA });
    const papel = document.getElementById("impresso-print");
    expect(papel.textContent).toContain("NÃO O ENTREGUE");
    expect(papel.textContent).toMatch(/absolutamente incapaz/i);
  });

  it("a emissão NÃO é recusada — a folha sai inteira, com aviso", () => {
    // Recusar tiraria do leito a identificação, o campo de alergia e a
    // queixa junto. Ver o argumento inteiro em `responsaveisDaFicha`.
    abrirFicha({ paciente: CRIANCA, responsaveis: FALHA });
    const papel = document.getElementById("impresso-print");
    expect(papel.textContent).toContain("Pedro Henrique Lima");
    expect(papel.textContent).toContain("ALERGIAS");
    expect(papel.textContent).toContain("100043");
  });

  it("adulto com lista lida e vazia: nada de aviso — alarme que sempre toca ninguém ouve", () => {
    abrirFicha({ responsaveis: [] });
    const papel = document.getElementById("impresso-print");
    expect(papel.textContent).not.toContain("NÃO FOI POSSÍVEL LER");
    expect(papel.textContent).not.toContain("RESPONSÁVEL PELO EPISÓDIO");
  });

  it("lista lida sai impressa com o papel de cada um, como antes", () => {
    abrirFicha({
      responsaveis: [
        { nome: "Maria da Silva", vinculo: "mae", papel: "representante", recebe_alta: true, consente: true },
        { nome: "Vizinha do lado", vinculo: "outro", papel: "acompanhante" },
      ],
    });
    const papel = document.getElementById("impresso-print");
    expect(papel.textContent).toContain("Maria da Silva");
    expect(papel.textContent).toContain("RECEBE A ALTA");
    expect(papel.textContent).toContain("Acompanhante");
    expect(papel.textContent).not.toContain("NÃO FOI POSSÍVEL LER");
  });
});
