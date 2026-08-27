// ═══════════════════════════════════════════════════════════
// A LIGAÇÃO LEITO → PRONTUÁRIO DA INTERNAÇÃO
//
// 🔴 A MAIOR ÓRFÃ DO SISTEMA: `abrirEpisodio` existia e nenhuma tela a
// chamava. Confirmado no banco de teste — `pep_episodios` com ZERO linhas
// e nenhum caminho para criar uma. Sem episódio ficam vazios, por
// construção e sem erro na tela: evolução, prescrição do internado, sinais
// vitais, NEWS, Braden, Morse, LPP, SAE, reconciliação, sumário de alta,
// Mapa de risco e Checagem SAE do Giro, e o indicador "LPP adquirida".
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  podeAbrirEpisodio, dadosDoEpisodio, desfechoDoLeito, episodioAbertoDe,
  avisoEpisodioNaoAberto, DESFECHO_LEITO_PARA_PEP,
} from "./internacao.js";

const ep = (prontuario, status = "aberto", extra = {}) => ({ id: 1, prontuario, status, ...extra });

describe("o que a abertura RECUSA", () => {
  it("🔴 internar sem prontuário — o paciente ficaria invisível", () => {
    const r = podeAbrirEpisodio({ prontuario: "" });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/invisível/);
    // e a mensagem tem de dizer ONDE resolver, não só que está errado
    expect(r.erros.join(" ")).toMatch(/Recepção/);
    expect(r.erros.join(" ")).toMatch(/sem identificação/);
  });

  it("🔴 segunda internação aberta para a mesma pessoa", () => {
    // Dois episódios abertos dividem o registro clínico entre os dois —
    // erro clínico, não só duplicidade de dado.
    const r = podeAbrirEpisodio({
      prontuario: "T9001",
      episodiosAbertos: [ep("T9001", "aberto", { leito: "UTI-03" })],
    });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/UTI-03/);
    expect(r.jaAberto.leito).toBe("UTI-03");
  });

  it("mas episódio ENCERRADO não impede nova internação", () => {
    // A pessoa pode internar de novo — e vai internar. Confundir
    // "já esteve internado" com "está internado" travaria a reinternação.
    const r = podeAbrirEpisodio({
      prontuario: "T9001",
      episodiosAbertos: [ep("T9001", "encerrado", { leito: "UTI-03" })],
    });
    expect(r.ok).toBe(true);
  });

  it("e episódio aberto de OUTRO paciente não atrapalha", () => {
    const r = podeAbrirEpisodio({ prontuario: "T9001", episodiosAbertos: [ep("T9002")] });
    expect(r.ok).toBe(true);
  });

  it("aguenta entrada nula sem quebrar a tela", () => {
    expect(podeAbrirEpisodio().ok).toBe(false);          // sem prontuário
    expect(podeAbrirEpisodio({ prontuario: "T1", episodiosAbertos: null }).ok).toBe(true);
  });
});

describe("o de/para dos desfechos", () => {
  it("⚠️ o leito não sabe QUAL alta foi — não se inventa melhora", () => {
    // Mapear "alta" para "alta_melhorado" afirmaria um fato clínico que
    // ninguém registrou. O sumário de alta é onde o médico escolhe.
    expect(desfechoDoLeito("alta")).toBe("alta_inalterado");
    expect(DESFECHO_LEITO_PARA_PEP.alta).not.toBe("alta_melhorado");
  });

  it("óbito e transferência atravessam iguais", () => {
    expect(desfechoDoLeito("obito")).toBe("obito");
    expect(desfechoDoLeito("transferencia")).toBe("transferencia");
  });

  it("desfecho desconhecido devolve null, não um chute", () => {
    expect(desfechoDoLeito("qualquer_coisa")).toBeNull();
    expect(desfechoDoLeito("")).toBeNull();
    expect(desfechoDoLeito(null)).toBeNull();
  });
});

describe("o que vai para o episódio", () => {
  const leito = { identificacao: "UTI-03", setor: "UTI", prontuario: "T9001", iniciais: "H.N.", cid: "J18", motivo: "pneumonia" };

  it("o setor vem do LEITO — é ele que sabe onde o paciente está", () => {
    const d = dadosDoEpisodio(leito, { prontuario: "T9001", iniciais: "H.N." });
    expect(d.setor).toBe("UTI");
    expect(d.leito).toBe("UTI-03");
  });

  it("o formulário tem precedência sobre o que estava no leito", () => {
    const d = dadosDoEpisodio(leito, { prontuario: "T9099", iniciais: "X.Y.", cid: "I21", motivo: "IAM" });
    expect(d.prontuario).toBe("T9099");
    expect(d.cid).toBe("I21");
    expect(d.motivo).toBe("IAM");
  });

  it("campo vazio no formulário recua para o leito, não apaga", () => {
    const d = dadosDoEpisodio(leito, { prontuario: "T9001", iniciais: "H.N.", cid: "", motivo: "" });
    expect(d.cid).toBe("J18");
    expect(d.motivo).toBe("pneumonia");
  });

  it("sem dado nenhum devolve null, não string vazia", () => {
    // "" no banco faria "não preenchido" deixar de ser distinguível de
    // "preenchido em branco".
    const d = dadosDoEpisodio({ identificacao: "P1-01" }, {});
    expect(d.cid).toBeNull();
    expect(d.motivo).toBeNull();
    expect(d.setor).toBeNull();
  });
});

describe("achar o episódio aberto", () => {
  it("acha o do paciente certo, ignorando encerrados", () => {
    const lista = [ep("T9001", "encerrado"), ep("T9002", "aberto"), ep("T9001", "aberto", { id: 3 })];
    expect(episodioAbertoDe("T9001", lista).id).toBe(3);
    expect(episodioAbertoDe("T9003", lista)).toBeNull();
    expect(episodioAbertoDe("T9001", null)).toBeNull();
  });
});

describe("quando o leito ocupa e o episódio não abre", () => {
  it("🔴 o aviso nomeia o estado e o caminho de volta", () => {
    // Silêncio aqui recriaria o defeito: paciente internado sem prontuário
    // da internação, agora por falha em vez de ausência de código.
    const a = avisoEpisodioNaoAberto({ leito: "UTI-03", motivo: "sem conexão" });
    expect(a).toMatch(/UTI-03/);
    expect(a).toMatch(/NÃO abriu/);
    expect(a).toMatch(/sem conexão/);
    expect(a).toMatch(/não duplica o episódio/);
  });

  it("funciona sem motivo conhecido", () => {
    expect(avisoEpisodioNaoAberto({ leito: "P1-02" })).toMatch(/P1-02/);
    expect(avisoEpisodioNaoAberto()).toMatch(/NÃO abriu/);
  });
});
