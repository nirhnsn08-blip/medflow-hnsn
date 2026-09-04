// ═══════════════════════════════════════════════════════════
// CHECAGEM DE MEDICAÇÃO
//
// 🔴 Estas regras viviam como expressões soltas dentro do JSX da aba. A que
// mais importa é a hora: gravar uma administração no FUTURO põe no
// prontuário uma dose que não aconteceu, e o prontuário é o que o próximo
// plantão lê para decidir se pode dar a próxima.
//
// ⚠️ Os testes usam números e horas literais. Conferir a fronteira contra a
// constante que a define faz o teste se mover junto com o erro.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  dosesAdministradas, dosesNaoAdministradas, itemPendenteDeChecagem,
  sinalDeDispensacao, validarChecagem,
} from "./checagem.js";

const saida = (itemId, qtd) => ({ prescricao_item_id: itemId, quantidade: qtd });
const adm = (itemId, status = "administrado") => ({ prescricao_item_id: itemId, status });

describe("🔴 dosesAdministradas — o que entrou no paciente", () => {
  it("conta as administradas", () => {
    expect(dosesAdministradas(1, [adm(1), adm(1), adm(2)])).toBe(2);
  });

  it("🔴 NÃO conta a não administrada — ela não entrou em ninguém", () => {
    // Somar as duas faria a tela dizer que o paciente recebeu o que ainda
    // está na bandeja.
    expect(dosesAdministradas(1, [adm(1), adm(1, "nao_administrado")])).toBe(1);
  });

  it("⚠️ status desconhecido CONTA — o registro existe porque alguém esteve lá", () => {
    // Só o 'nao_administrado' explícito subtrai. Um status novo no banco não
    // deve sumir com uma dose do prontuário.
    expect(dosesAdministradas(1, [{ prescricao_item_id: 1, status: "adiada" }])).toBe(1);
    expect(dosesAdministradas(1, [{ prescricao_item_id: 1 }])).toBe(1);
  });

  it("id em texto e em número são o mesmo item", () => {
    expect(dosesAdministradas("1", [adm(1)])).toBe(1);
  });

  it("entradas estranhas devolvem zero", () => {
    for (const v of [null, undefined, [], "x"]) expect(dosesAdministradas(1, v), String(v)).toBe(0);
  });
});

describe("dosesNaoAdministradas", () => {
  it("conta só as justificadas como não dadas", () => {
    expect(dosesNaoAdministradas(1, [adm(1), adm(1, "nao_administrado"), adm(2, "nao_administrado")])).toBe(1);
  });

  it("⚠️ as duas contagens não se sobrepõem", () => {
    const adms = [adm(1), adm(1, "nao_administrado"), adm(1)];
    expect(dosesAdministradas(1, adms) + dosesNaoAdministradas(1, adms)).toBe(3);
  });

  it("entradas estranhas devolvem zero", () => {
    expect(dosesNaoAdministradas(1, null)).toBe(0);
  });
});

describe("🔴 sinalDeDispensacao — o que a farmácia entregou", () => {
  const item = (id, quantidade) => ({ id, quantidade });

  it("entrega completa é 'dispensado'", () => {
    expect(sinalDeDispensacao(item(1, 10), [saida(1, 10)])).toMatchObject({ key: "dispensado" });
    expect(sinalDeDispensacao(item(1, 10), [saida(1, 12)])).toMatchObject({ key: "dispensado" });
  });

  it("entrega no meio é PARCIAL, e diz quanto de quanto", () => {
    const s = sinalDeDispensacao(item(1, 10), [saida(1, 4)]);
    expect(s.key).toBe("parcial");
    expect(s.label).toContain("4");
    expect(s.label).toContain("10");
  });

  it("9 de 10 ainda é parcial — a fronteira é a igualdade", () => {
    expect(sinalDeDispensacao(item(1, 10), [saida(1, 9)]).key).toBe("parcial");
  });

  it("nada entregue é 'não dispensado'", () => {
    expect(sinalDeDispensacao(item(1, 10), []).key).toBe("nao_dispensado");
    expect(sinalDeDispensacao(item(1, 10), [saida(2, 5)]).key).toBe("nao_dispensado");
  });

  it("🔴 SEM quantidade prescrita não existe parcial — qualquer entrega é a entrega", () => {
    // Item de uso condicional não tem denominador. "dispensado 2/0" seria
    // lido como erro do sistema, ou pior, como falta de medicamento.
    expect(sinalDeDispensacao(item(1, 0), [saida(1, 2)]).key).toBe("dispensado");
    expect(sinalDeDispensacao(item(1, null), [saida(1, 2)]).key).toBe("dispensado");
    expect(sinalDeDispensacao(item(1, 0), [saida(1, 2)]).label).not.toMatch(/parcial|\//);
  });

  it("sem quantidade e sem entrega é 'sem dispensação'", () => {
    expect(sinalDeDispensacao(item(1, 0), []).key).toBe("sem_dispensacao");
  });

  it("⚠️ todo sinal tem rótulo e cor, e o parcial nunca é verde", () => {
    for (const s of [sinalDeDispensacao(item(1, 10), [saida(1, 4)]), sinalDeDispensacao(item(1, 10), [])]) {
      expect(s.label).toBeTruthy();
      expect(s.cor).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(sinalDeDispensacao(item(1, 10), [saida(1, 4)]).cor)
      .not.toBe(sinalDeDispensacao(item(1, 10), [saida(1, 10)]).cor);
  });

  it("item nulo não estoura", () => {
    expect(() => sinalDeDispensacao(null, [])).not.toThrow();
    expect(() => sinalDeDispensacao(undefined, null)).not.toThrow();
  });
});

describe("🔴 itemPendenteDeChecagem", () => {
  it("dispensado e sem checagem é pendente", () => {
    expect(itemPendenteDeChecagem({ id: 1 }, [saida(1, 1)], [])).toBe(true);
  });

  it("🔴 NÃO dispensado não é pendente — é a fila normal da farmácia", () => {
    expect(itemPendenteDeChecagem({ id: 1 }, [], [])).toBe(false);
  });

  it("já checado não é pendente", () => {
    expect(itemPendenteDeChecagem({ id: 1 }, [saida(1, 1)], [adm(1)])).toBe(false);
  });

  it("🔴 justificado também não é pendente — o que fica pendente é o silêncio", () => {
    expect(itemPendenteDeChecagem({ id: 1 }, [saida(1, 1)], [adm(1, "nao_administrado")])).toBe(false);
  });
});

describe("🔴 validarChecagem — a hora é a regra que protege o prontuário", () => {
  const AGORA = "2026-09-04T14:00:00.000Z";
  const ok = { status: "administrado", motivo: "" };

  it("hora igual a agora passa", () => {
    expect(validarChecagem(ok, AGORA, AGORA).ok).toBe(true);
  });

  it("🔴 um segundo no FUTURO é recusado", () => {
    // Gravar "administrado às 23h" às 14h põe no prontuário uma dose que não
    // aconteceu — e é o prontuário que o próximo plantão lê.
    const r = validarChecagem(ok, "2026-09-04T14:00:01.000Z", AGORA);
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/futuro/i);
  });

  it("🔴 hora no PASSADO passa — a enfermagem administra antes e registra depois", () => {
    // Exigir "agora" empurraria todo mundo a mentir a hora para salvar.
    expect(validarChecagem(ok, "2026-09-04T09:30:00.000Z", AGORA).ok).toBe(true);
    expect(validarChecagem(ok, "2026-09-03T22:00:00.000Z", AGORA).ok).toBe(true);
  });

  it("🔴 'não administrado' SEM motivo é recusado", () => {
    // O registro diria que a dose não foi dada sem dizer por quê — que é a
    // informação de que o médico precisa para repetir, trocar ou suspender.
    const r = validarChecagem({ status: "nao_administrado", motivo: "" }, AGORA, AGORA);
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/motivo/i);
  });

  it("'não administrado' COM motivo passa", () => {
    expect(validarChecagem({ status: "nao_administrado", motivo: "recusa do paciente" }, AGORA, AGORA).ok).toBe(true);
  });

  it("⚠️ o motivo só é exigido de quem NÃO administrou", () => {
    expect(validarChecagem({ status: "administrado", motivo: "" }, AGORA, AGORA).ok).toBe(true);
  });

  it("hora ilegível é recusada, e não vira 'agora'", () => {
    // Cair em `now` gravaria uma hora que ninguém escolheu.
    for (const q of ["", null, undefined, "ontem"]) {
      expect(validarChecagem(ok, q, AGORA).ok, String(q)).toBe(false);
    }
  });

  it("formulário nulo não estoura", () => {
    expect(() => validarChecagem(null, AGORA, AGORA)).not.toThrow();
    expect(validarChecagem(null, AGORA, AGORA).ok).toBe(true);
  });

  it("⚠️ o erro é sempre TEXTO para a tela mostrar", () => {
    for (const [f, q] of [[{ status: "nao_administrado" }, AGORA], [ok, "2027-01-01T00:00:00.000Z"], [ok, "x"]]) {
      const r = validarChecagem(f, q, AGORA);
      expect(typeof r.erro).toBe("string");
      expect(r.erro.length).toBeGreaterThan(10);
    }
  });
});
