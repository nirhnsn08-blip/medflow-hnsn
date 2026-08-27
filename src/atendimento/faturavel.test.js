// ═══════════════════════════════════════════════════════════
// O QUE FALTA PARA O ATENDIMENTO VIRAR CONTA
//
// 🔴 O DEFEITO: o insert do PS grava 7 campos e nenhum é fonte pagadora
// nem procedimento — enquanto o faturamento filtra por
// `procedimento_cod=not.is.null` e lê `convenio_id`. A porta principal do
// hospital produz episódios que a conta nunca alcança. No banco de teste,
// os 50 episódios estão "sem convênio".
//
// ⚠️ E A CORREÇÃO NÃO PODE BLOQUEAR O DESFECHO: o leito precisa girar, o
// paciente está indo embora, e às vezes é óbito.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  pendenciasDeConta, avisoDeConta, dadosDeConta, geraConta, convenioSugerido,
  valoresIniciais, SEM_CONTA,
} from "./faturavel.js";

const vazio = { id: 1, iniciais: "H.N." };
const completo = { id: 1, convenio_id: "7", procedimento_cod: "0301010072" };

describe("o que falta para virar conta", () => {
  it("🔴 episódio do PS não tem nem convênio nem procedimento", () => {
    const f = pendenciasDeConta({ atendimento: vazio, desfecho: "alta" });
    expect(f.map(x => x.campo)).toEqual(["convenio_id", "procedimento_cod"]);
  });

  it("com os dois preenchidos, nada a cobrar", () => {
    expect(pendenciasDeConta({ atendimento: completo, desfecho: "alta" })).toEqual([]);
    expect(avisoDeConta({ atendimento: completo, desfecho: "alta" })).toBeNull();
  });

  it("cobra só o que falta, não os dois sempre", () => {
    const so = pendenciasDeConta({ atendimento: { convenio_id: "7" }, desfecho: "alta" });
    expect(so.map(x => x.campo)).toEqual(["procedimento_cod"]);
  });

  it("na internação, a frase do procedimento fala de AIH", () => {
    // É ele que nomeia a internação e define o valor — o motivo muda com
    // o desfecho, e a frase genérica não ensinaria nada.
    const f = pendenciasDeConta({ atendimento: vazio, desfecho: "internacao" });
    expect(f.find(x => x.campo === "procedimento_cod").texto).toMatch(/AIH/);
    const g = pendenciasDeConta({ atendimento: vazio, desfecho: "alta" });
    expect(g.find(x => x.campo === "procedimento_cod").texto).toMatch(/produção faturável/);
  });
});

describe("⚠️ quando NÃO se cobra nada", () => {
  it("evasão não gera conta — o paciente saiu sem alta", () => {
    expect(geraConta("evasao")).toBe(false);
    expect(pendenciasDeConta({ atendimento: vazio, desfecho: "evasao" })).toEqual([]);
    expect(SEM_CONTA).toEqual(["evasao"]);
  });

  it("🔴 mas ÓBITO gera conta — o hospital fez o que fez", () => {
    // Tratar óbito como não faturável perderia produção real num momento
    // em que ninguém vai voltar para corrigir.
    expect(geraConta("obito")).toBe(true);
    expect(pendenciasDeConta({ atendimento: vazio, desfecho: "obito" })).toHaveLength(2);
  });

  it("alta, internação e transferência geram conta", () => {
    for (const d of ["alta", "internacao", "transferencia"]) {
      expect(geraConta(d), d).toBe(true);
    }
  });
});

describe("o aviso que a tela mostra", () => {
  it("diz a CONSEQUÊNCIA, não a regra", () => {
    // "Preencha o convênio" manda obedecer; "não vai gerar conta" explica
    // por que vale o trabalho — e é isso que faz alguém preencher com pressa.
    const a = avisoDeConta({ atendimento: vazio, desfecho: "alta" });
    expect(a.texto).toMatch(/ninguém sabe quem paga/);
    expect(a.texto).not.toMatch(/preencha/i);
  });

  it("deixa claro que NÃO bloqueia", () => {
    const a = avisoDeConta({ atendimento: vazio, desfecho: "alta" });
    expect(a.texto).toMatch(/Dá para dar o desfecho assim mesmo/);
    expect(a.texto).toMatch(/fim do mês/);
  });

  it("concorda em número com o que falta", () => {
    expect(avisoDeConta({ atendimento: { convenio_id: "7" }, desfecho: "alta" }).texto).toMatch(/1 pendência impede/);
    expect(avisoDeConta({ atendimento: vazio, desfecho: "alta" }).texto).toMatch(/2 pendências impedem/);
  });

  it("e CALA na evasão — aviso que acende sem consequência ensina a ignorar", () => {
    expect(avisoDeConta({ atendimento: vazio, desfecho: "evasao" })).toBeNull();
  });
});

describe("o que vai para o banco", () => {
  it("campo vazio vira null, não string vazia", () => {
    // É `not.is.null` que o faturamento usa para achar o que é faturável:
    // "" faria o episódio parecer preenchido e continuar fora da conta.
    const d = dadosDeConta({ convenioId: "", procedimentoCod: "  ", cid: null });
    expect(d).toEqual({ convenio_id: null, procedimento_cod: null, cid: null });
  });

  it("e o preenchido chega limpo", () => {
    const d = dadosDeConta({ convenioId: " 7 ", procedimentoCod: "0301010072", cid: " J18 " });
    expect(d).toEqual({ convenio_id: "7", procedimento_cod: "0301010072", cid: "J18" });
  });
});

describe("🔴 o formulário abre com o que já está gravado", () => {
  it("porque UPDATE com formulário vazio APAGA o convênio da Recepção", () => {
    // O desfecho grava com UPDATE. Abrir vazio faria o null do formulário
    // passar por cima do que a Recepção registrou — e o atendimento sairia
    // do faturamento por causa da tela que veio consertar isso.
    const v = valoresIniciais({ convenio_id: 7, procedimento_cod: "0301010072", cid: "J18" });
    expect(v).toEqual({ convenioId: "7", procedimentoCod: "0301010072", cid: "J18" });
  });

  it("e o caminho de volta preserva o valor intocado", () => {
    const at = { convenio_id: 7, procedimento_cod: "0301010072", cid: "J18" };
    expect(dadosDeConta(valoresIniciais(at))).toEqual({
      convenio_id: "7", procedimento_cod: "0301010072", cid: "J18",
    });
  });

  it("atendimento sem nada abre em branco, e não em 'null'", () => {
    expect(valoresIniciais({})).toEqual({ convenioId: "", procedimentoCod: "", cid: "" });
    expect(valoresIniciais({ convenio_id: null }).convenioId).toBe("");
    expect(valoresIniciais()).toEqual({ convenioId: "", procedimentoCod: "", cid: "" });
  });
});

describe("a sugestão de convênio", () => {
  const hist = [
    { chegada_em: "2026-01-10T10:00:00Z", convenio_id: "3" },
    { chegada_em: "2026-08-01T10:00:00Z", convenio_id: "7" },
    { chegada_em: "2026-08-20T10:00:00Z" },                   // sem convênio
  ];

  it("vem do último atendimento QUE TINHA convênio", () => {
    const s = convenioSugerido(hist);
    expect(s.convenio_id).toBe("7");
    expect(s.de).toBe("2026-08-01");
  });

  it("⚠️ e mostra DE ONDE veio — sugerir não é preencher", () => {
    // Convênio muda, carteira vence, e quem veio pelo SUS mês passado pode
    // chegar hoje pelo plano. Quem decide é quem está com a pessoa.
    expect(convenioSugerido(hist)).toHaveProperty("de");
  });

  it("sem histórico com convênio, não inventa", () => {
    expect(convenioSugerido([{ chegada_em: "2026-01-01T00:00:00Z" }])).toBeNull();
    expect(convenioSugerido([])).toBeNull();
    expect(convenioSugerido(null)).toBeNull();
  });
});
