// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// A DESCRIÇÃO CIRÚRGICA — as regras e a tela
//
// 🔴 O DOCUMENTO QUE A LEI NOMEIA E QUE NÃO EXISTIA. A CFM 1.638/2002 pede,
// para o paciente operado, descrição cirúrgica, ficha anestésica e ficha de
// recuperação pós-anestésica. O que havia era `cc_cirurgias.observacao`:
// texto livre, único, sobrescrevível e sem autoria.
//
// 🔴 E O QUE FOI FEITO PODE NÃO SER O QUE FOI MARCADO — conversão de via é
// outro porte, outro código, outra conta. Os testes do `codigoParaFaturar`
// são sobre dinheiro, não sobre documentação.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  MIN_NARRATIVA, VIAS_ACESSO,
  codigoParaFaturar, conferirDescricao, historico, horasSemDescricao,
  jaOperou, linhaDaDescricao, linhaDoAntecedente, resumoDaDescricao,
  semDescricao, versaoVigente,
} from "./descricao.js";
import { FALHA } from "../util/leitura.js";
import DescricaoCirurgicaModal from "./DescricaoCirurgica.jsx";

// Sem isto cada `render` empilha no mesmo documento e as buscas acham dois
// de tudo — o erro é "found multiple elements", que parece defeito de tela.
afterEach(cleanup);

const CIR = {
  id: 7, iniciais: "A.B.C.", data: "2026-10-09", sala: "Sala 1",
  procedimento: "Colecistectomia videolaparoscópica", procedimento_cod: "0407010173",
  status: "concluida", entrada_sala_em: "2026-10-09T11:00:00Z",
  inicio_cirurgia_em: "2026-10-09T11:30:00Z", fim_cirurgia_em: "2026-10-09T13:00:00Z",
  saida_sala_em: "2026-10-09T13:10:00Z",
};
const NARRATIVA = "Incisão subcostal direita. Colecistectomia sem intercorrências, colédoco preservado.";
const FORM_OK = { procedimento_realizado: "Colecistectomia videolaparoscópica", descricao: NARRATIVA };

// ── QUANDO SE PODE ESCREVER ─────────────────────────────────
describe("🔴 só se descreve o que aconteceu", () => {
  it("cirurgia agendada ainda não tem ato a descrever", () => {
    expect(jaOperou({ status: "agendada" })).toBe(false);
    const v = conferirDescricao({ cirurgia: { status: "agendada" }, form: FORM_OK });
    expect(v.ok).toBe(false);
    expect(v.erros.join(" ")).toMatch(/ainda não entrou em sala/);
  });

  it("🔴 documento pré-datado é falsidade — a frase diz isso", () => {
    const v = conferirDescricao({ cirurgia: { status: "checkin" }, form: FORM_OK });
    expect(v.erros.join(" ")).toMatch(/pré-datado/);
  });

  it("entrada em sala registrada vale mesmo com status atrasado", () => {
    // A escapatória existe porque alguém registra o horário depois. Sem
    // ela, a tela recusaria o que o banco aceita — e a pessoa escreveria o
    // documento inteiro para descobrir no salvar.
    expect(jaOperou({ status: "checkin", entrada_sala_em: "2026-10-09T11:00:00Z" })).toBe(true);
  });

  it("🔴 cirurgia cancelada não tem descrição", () => {
    const v = conferirDescricao({ cirurgia: { ...CIR, status: "cancelada" }, form: FORM_OK });
    expect(v.erros.join(" ")).toMatch(/CANCELADA/);
  });
});

// ── AS TRAVAS DO FORMULÁRIO ─────────────────────────────────
describe("o formulário repete as travas do banco, com a frase de quem escreveu", () => {
  it("narrativa curta não passa, e o aviso conta quanto falta", () => {
    const v = conferirDescricao({ cirurgia: CIR, form: { ...FORM_OK, descricao: "operei, deu tudo certo" } });
    expect(v.ok).toBe(false);
    expect(v.erros.join(" ")).toMatch(/22 caracteres/);
    expect(v.erros.join(" ")).toMatch(new RegExp(`mínimo ${MIN_NARRATIVA}`));
  });

  it("sem procedimento realizado não passa — é o campo que vale", () => {
    const v = conferirDescricao({ cirurgia: CIR, form: { ...FORM_OK, procedimento_realizado: "  " } });
    expect(v.erros.join(" ")).toMatch(/foi REALIZADO/);
  });

  it("🔴 conversão de via exige o motivo", () => {
    const v = conferirDescricao({ cirurgia: CIR, form: { ...FORM_OK, conversao: true, conversao_motivo: "virou" } });
    expect(v.ok).toBe(false);
    expect(v.erros.join(" ")).toMatch(/Conversão de via exige o motivo/);
  });

  it("🔴 peça descrita exige resposta sobre o envio — inclusive 'não'", () => {
    const comPeca = { ...FORM_OK, amostras: "Vesícula para anatomopatológico" };
    expect(conferirDescricao({ cirurgia: CIR, form: comPeca }).ok).toBe(false);
    expect(conferirDescricao({ cirurgia: CIR, form: comPeca }).erros.join(" "))
      .toMatch(/todo mundo supõe que alguém levou/);
    // "Não" passa, e vira AVISO: a pendência fica visível em vez de calada.
    const naoEnviou = conferirDescricao({ cirurgia: CIR, form: { ...comPeca, amostra_enviada: false } });
    expect(naoEnviou.ok).toBe(true);
    expect(naoEnviou.avisos.join(" ")).toMatch(/NÃO enviada/);
  });

  it("correção exige motivo", () => {
    const v = conferirDescricao({ cirurgia: CIR, form: FORM_OK, corrigindo: { id: 1, versao: 1 } });
    expect(v.erros.join(" ")).toMatch(/Correção exige o motivo/);
  });

  it("sangramento negativo não passa", () => {
    const v = conferirDescricao({ cirurgia: CIR, form: { ...FORM_OK, sangramento_ml: -10 } });
    expect(v.erros.join(" ")).toMatch(/nunca negativo/);
  });

  it("o caminho limpo passa sem erro", () => {
    expect(conferirDescricao({ cirurgia: CIR, form: FORM_OK }).ok).toBe(true);
  });
});

// ── OS AVISOS QUE CUSTAM DINHEIRO ───────────────────────────
describe("🔴 os avisos dizem o CUSTO, não a regra", () => {
  it("sem código, a conta continua cobrando o agendamento", () => {
    const v = conferirDescricao({ cirurgia: CIR, form: FORM_OK });
    expect(v.avisos.join(" ")).toMatch(/continua cobrando o código do AGENDAMENTO/);
  });

  it("código diferente do agendado: a tela diz que o realizado vence", () => {
    const v = conferirDescricao({ cirurgia: CIR, form: { ...FORM_OK, procedimento_cod: "0407010050" } });
    expect(v.avisos.join(" ")).toMatch(/diferente do agendado \(0407010173\)/);
    expect(v.avisos.join(" ")).toMatch(/usar o REALIZADO/);
  });

  it("🔴 converteu a via e manteve o código: o porte é o valor da conta", () => {
    const v = conferirDescricao({
      cirurgia: CIR,
      form: { ...FORM_OK, conversao: true, conversao_motivo: "Aderências firmes impediram a dissecção.", procedimento_cod: "0407010173" },
    });
    expect(v.ok).toBe(true);
    expect(v.avisos.join(" ")).toMatch(/conversão quase sempre muda o porte/i);
  });

  it("500 ml sem resposta sobre hemotransfusão é dado de risco do próximo ato", () => {
    const v = conferirDescricao({ cirurgia: CIR, form: { ...FORM_OK, sangramento_ml: 600 } });
    expect(v.avisos.join(" ")).toMatch(/hemotransfusão/);
    // Respondendo, o aviso some — aviso que não some é fadiga de alarme.
    const r = conferirDescricao({ cirurgia: CIR, form: { ...FORM_OK, sangramento_ml: 600, hemotransfusao: false } });
    expect(r.avisos.join(" ")).not.toMatch(/hemotransfusão/);
  });
});

// ── A LINHA QUE VAI PARA O BANCO ────────────────────────────
describe("a linha gravada", () => {
  it("🔴 NÃO manda `versao` — quem calcula é o gatilho, sob lock", () => {
    const l = linhaDaDescricao({ cirurgia: CIR, form: FORM_OK });
    expect(l).not.toHaveProperty("versao");
  });

  it("vazio vira null, não string vazia", () => {
    const l = linhaDaDescricao({ cirurgia: CIR, form: { ...FORM_OK, achados: "   ", drenos: "" } });
    expect(l.achados).toBeNull();
    expect(l.drenos).toBeNull();
  });

  it("🔴 sem peça, `amostra_enviada` fica null — não `false`", () => {
    // `false` sem peça nenhuma viraria uma pendência inventada no painel.
    const l = linhaDaDescricao({ cirurgia: CIR, form: { ...FORM_OK, amostra_enviada: false } });
    expect(l.amostra_enviada).toBeNull();
    const comPeca = linhaDaDescricao({ cirurgia: CIR, form: { ...FORM_OK, amostras: "peça", amostra_enviada: false } });
    expect(comPeca.amostra_enviada).toBe(false);
  });

  it("motivo da conversão só vai quando houve conversão", () => {
    const l = linhaDaDescricao({ cirurgia: CIR, form: { ...FORM_OK, conversao: false, conversao_motivo: "sobrou do rascunho" } });
    expect(l.conversao_motivo).toBeNull();
  });

  it("a correção carrega o elo e o motivo", () => {
    const l = linhaDaDescricao({
      cirurgia: CIR, corrigindo: { id: 42, versao: 1 },
      form: { ...FORM_OK, motivo_correcao: "O porte estava trocado no registro." },
    });
    expect(l.corrige_id).toBe(42);
    expect(l.motivo_correcao).toMatch(/porte estava trocado/);
  });
});

// ── A CADEIA DE VERSÕES ─────────────────────────────────────
describe("🔴 correção é versão nova, e a VIGENTE é a que ninguém corrigiu", () => {
  const v1 = { id: 1, versao: 1, corrige_id: null, procedimento_realizado: "Aberta" };
  const v2 = { id: 2, versao: 2, corrige_id: 1, procedimento_realizado: "Videolaparoscópica" };

  it("uma só: ela é a vigente", () => {
    expect(versaoVigente([v1])).toBe(v1);
  });

  it("corrigida: a vigente é a correção", () => {
    expect(versaoVigente([v1, v2])).toBe(v2);
    // E a antiga continua legível — é o ponto de guardá-la.
    expect(historico([v1, v2]).map(x => x.versao)).toEqual([2, 1]);
  });

  it("nenhuma: `undefined` (leu e não há)", () => {
    expect(versaoVigente([])).toBeUndefined();
  });

  it("🔴 leitura que FALHOU devolve `null`, e null não é 'não tem'", () => {
    // Sem a diferença, a tela ofereceria \"registrar descrição\" numa cirurgia
    // que já tem uma — e o banco recusaria depois de a pessoa escrever tudo.
    expect(versaoVigente(FALHA)).toBeNull();
  });
});

// ── O CÓDIGO QUE A CONTA COBRA ──────────────────────────────
describe("🔴 codigoParaFaturar: o realizado vence o agendado", () => {
  it("sem descrição, cobra o agendamento e diz de onde veio", () => {
    expect(codigoParaFaturar(CIR, null)).toEqual({
      codigo: "0407010173", fonte: "agendamento", divergente: false,
    });
  });

  it("com descrição, o código realizado vence — e a divergência é marcada", () => {
    const r = codigoParaFaturar(CIR, { procedimento_cod: "0407010050" });
    expect(r.codigo).toBe("0407010050");
    expect(r.fonte).toBe("descrição cirúrgica");
    expect(r.divergente).toBe(true);
  });

  it("descrição sem código não derruba o do agendamento", () => {
    expect(codigoParaFaturar(CIR, { procedimento_cod: null }).codigo).toBe("0407010173");
  });

  it("código igual não é divergência — não vira ruído na conta", () => {
    expect(codigoParaFaturar(CIR, { procedimento_cod: "0407010173" }).divergente).toBe(false);
  });

  it("sem código em lugar nenhum: fonte `null`, não uma fonte inventada", () => {
    expect(codigoParaFaturar({ id: 1 }, null)).toEqual({ codigo: null, fonte: null, divergente: false });
  });
});

// ── O PASSIVO DO DIA ────────────────────────────────────────
describe("as cirurgias que saíram da sala sem descrição", () => {
  it("usa o selo, e ignora agendada e cancelada", () => {
    const faltam = semDescricao([
      CIR,                                                   // operada, sem selo → entra
      { ...CIR, id: 8, descricao_em: "2026-10-09T14:00:00Z" }, // com selo → não entra
      { ...CIR, id: 9, status: "agendada", entrada_sala_em: null },
      { ...CIR, id: 10, status: "cancelada", entrada_sala_em: null },
    ]);
    expect(faltam.map(c => c.id)).toEqual([7]);
  });

  it("🔴 cancelada que ENTROU em sala também não entra no passivo", () => {
    // Suspensão em sala acontece. Exigir descrição dela faria o painel
    // acusar um documento que não existe para ser escrito.
    expect(semDescricao([{ ...CIR, status: "cancelada" }])).toEqual([]);
  });

  it("horas sem descrição: `null` quando não há hora de saída — e null não é zero", () => {
    const agora = new Date("2026-10-09T18:10:00Z");
    expect(horasSemDescricao(CIR, agora)).toBe(5);
    expect(horasSemDescricao({ ...CIR, saida_sala_em: null, fim_cirurgia_em: null }, agora)).toBeNull();
    expect(horasSemDescricao({ ...CIR, descricao_em: "x" }, agora)).toBeNull();
  });
});

// ── O ANTECEDENTE ──────────────────────────────────────────
describe("🔴 o antecedente cirúrgico, como o prontuário o mostra", () => {
  const EQUIPE = [
    { papel: "cirurgiao", nome: "Dra. Ana", cbo: "225125" },
    { papel: "anestesista", nome: "Dr. Reis" },
  ];

  it("o procedimento é o REALIZADO quando há descrição", () => {
    const l = linhaDoAntecedente({
      cirurgia: CIR, equipe: EQUIPE,
      descricao: { procedimento_realizado: "Colecistectomia convertida para aberta", via_acesso: "aberta", conversao: true },
    });
    expect(l.procedimento).toMatch(/convertida para aberta/);
    expect(l.via).toBe("Aberta / convencional");
    expect(l.convertida).toBe(true);
    expect(l.cirurgiao).toBe("Dra. Ana");
    expect(l.temDescricao).toBe(true);
  });

  it("sem descrição, cai no nome do agendamento — e MARCA a ausência", () => {
    const l = linhaDoAntecedente({ cirurgia: CIR, equipe: EQUIPE, descricao: null });
    expect(l.procedimento).toBe("Colecistectomia videolaparoscópica");
    // 🔴 É esta marca que impede a tela de ler ausência de documento como
    // "cirurgia sem nada a relatar".
    expect(l.temDescricao).toBe(false);
  });

  it("o dia sai do relógio LOCAL, não de fatia de texto", () => {
    // 01:00Z do dia 10 é 22:00 do dia 09 em Brasília.
    const l = linhaDoAntecedente({ cirurgia: { ...CIR, inicio_cirurgia_em: "2026-10-10T01:00:00Z" } });
    expect(l.dia).toBe("2026-10-09");
  });

  it("cancelada e agendada vêm marcadas, para a tela não contá-las como ato", () => {
    expect(linhaDoAntecedente({ cirurgia: { ...CIR, status: "cancelada" } }).cancelada).toBe(true);
    expect(linhaDoAntecedente({ cirurgia: { ...CIR, status: "agendada", entrada_sala_em: null } }).semAto).toBe(true);
  });

  it("o resumo de plantão sai em uma frase", () => {
    const l = linhaDoAntecedente({
      cirurgia: CIR, equipe: EQUIPE,
      descricao: { procedimento_realizado: "Colecistectomia", via_acesso: "videolaparoscopica", intercorrencias: "lesão de serosa, rafiada" },
    });
    expect(resumoDaDescricao(l)).toMatch(/Colecistectomia, via videolaparoscópica, por Dra. Ana, intercorrências: lesão de serosa/);
  });

  it("sem linha, sem frase — e não a palavra 'undefined'", () => {
    expect(resumoDaDescricao(null)).toBeNull();
  });
});

// ── A TELA ─────────────────────────────────────────────────
describe("🔴 o modal da descrição cirúrgica", () => {
  const PROCS = [
    { codigo: "0407010173", nome: "Colecistectomia videolaparoscópica" },
    { codigo: "0407010050", nome: "Colecistectomia" },
  ];
  const abrir = (props = {}) => {
    const onConfirm = vi.fn(async () => ({ ok: true }));
    const onClose = vi.fn();
    render(<DescricaoCirurgicaModal cirurgia={CIR} procedimentos={PROCS}
      descricoes={[]} onClose={onClose} onConfirm={onConfirm} {...props} />);
    return { onConfirm, onClose };
  };

  it("mostra o procedimento AGENDADO, para a pessoa perceber que mudou", () => {
    abrir();
    expect(screen.getByText(/agendada: Colecistectomia videolaparoscópica · 0407010173/)).toBeTruthy();
  });

  it("diz que não há edição — correção é versão nova", () => {
    abrir();
    expect(screen.getByText(/Registro imutável/)).toBeTruthy();
  });

  it("o botão de gravar fica desligado até a narrativa chegar ao mínimo", () => {
    abrir();
    const botao = screen.getByRole("button", { name: /Gravar a descrição/ });
    expect(botao.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/incisão, tempos cirúrgicos/), { target: { value: NARRATIVA } });
    expect(screen.getByRole("button", { name: /Gravar a descrição/ }).disabled).toBe(false);
  });

  it("🔴 escolher o código não apaga o procedimento que a pessoa escreveu", () => {
    abrir();
    const campo = screen.getByPlaceholderText(/o ato que aconteceu/);
    fireEvent.change(campo, { target: { value: "Colecistectomia convertida para aberta" } });
    // O primeiro select é o do código; o segundo é a via de acesso.
    fireEvent.change(document.querySelectorAll("select")[0], { target: { value: "0407010050" } });
    expect(campo.value).toBe("Colecistectomia convertida para aberta");
  });

  it("🔴 código diferente do agendado avisa, na hora, que a conta vai mudar", () => {
    abrir();
    const selects = document.querySelectorAll("select");
    fireEvent.change(selects[0], { target: { value: "0407010050" } });
    expect(screen.getByText(/Diferente do agendado \(0407010173\)/)).toBeTruthy();
  });

  it("grava a linha e fecha", async () => {
    const { onConfirm, onClose } = abrir();
    fireEvent.change(screen.getByPlaceholderText(/o ato que aconteceu/), { target: { value: "Colecistectomia" } });
    fireEvent.change(screen.getByPlaceholderText(/incisão, tempos cirúrgicos/), { target: { value: NARRATIVA } });
    fireEvent.click(screen.getByRole("button", { name: /Gravar a descrição/ }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm.mock.calls[0][0].descricao).toBe(NARRATIVA);
    expect(onClose).toHaveBeenCalled();
  });

  it("🔴 a recusa do banco NÃO fecha o modal — a pessoa acabou de escrever tudo", async () => {
    const onConfirm = vi.fn(async () => ({ ok: false, motivo: "Esta cirurgia já tem descrição cirúrgica." }));
    const onClose = vi.fn();
    render(<DescricaoCirurgicaModal cirurgia={CIR} procedimentos={PROCS} descricoes={[]}
      onClose={onClose} onConfirm={onConfirm} />);
    fireEvent.change(screen.getByPlaceholderText(/o ato que aconteceu/), { target: { value: "X" } });
    fireEvent.change(screen.getByPlaceholderText(/incisão, tempos cirúrgicos/), { target: { value: NARRATIVA } });
    fireEvent.click(screen.getByRole("button", { name: /Gravar a descrição/ }));
    await waitFor(() => expect(screen.getByText(/já tem descrição cirúrgica/)).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("🔴 leitura que falhou: a tela NÃO oferece gravar, e explica por quê", () => {
    abrir({ descricoes: FALHA });
    expect(screen.getByText(/Não consegui ler as descrições/)).toBeTruthy();
    // ⚠️ O FORMULÁRIO PRECISA ESTAR VÁLIDO para esta asserção valer algo.
    // Com ele em branco o botão já estava desligado por `!v.ok`, e a
    // mutação que apagava o `naoLi` da condição passava batida — achado na
    // bateria de mutação, não no primeiro verde.
    fireEvent.change(screen.getByPlaceholderText(/o ato que aconteceu/), { target: { value: "Colecistectomia" } });
    fireEvent.change(screen.getByPlaceholderText(/incisão, tempos cirúrgicos/), { target: { value: NARRATIVA } });
    expect(screen.getByRole("button", { name: /Gravar a descrição/ }).disabled).toBe(true);
  });

  it("com descrição vigente, o modal abre em modo CORREÇÃO e pede o motivo", () => {
    abrir({ descricoes: [{ id: 3, versao: 1, corrige_id: null, procedimento_realizado: "Colecistectomia", descricao: NARRATIVA }] });
    expect(screen.getByText(/CORREÇÃO da versão 1/)).toBeTruthy();
    expect(screen.getByText(/o que estava errado na versão 1/)).toBeTruthy();
    // E o botão só liga quando o motivo chega ao mínimo.
    expect(screen.getByRole("button", { name: /Gravar a correção/ }).disabled).toBe(true);
  });

  it("o campo da peça só pede o envio depois de haver peça", () => {
    abrir();
    expect(screen.queryByText(/Enviada para o anatomopatológico/)).toBeNull();
    fireEvent.change(screen.getByPlaceholderText(/o que foi retirado para exame/), { target: { value: "Vesícula" } });
    expect(screen.getByText(/Enviada para o anatomopatológico/)).toBeTruthy();
  });

  it("todas as vias de acesso do domínio fechado estão no select", () => {
    abrir();
    const opcoes = [...document.querySelectorAll("select")]
      .flatMap(s => [...s.options]).map(o => o.value);
    for (const v of VIAS_ACESSO) expect(opcoes).toContain(v.chave);
  });
});

// ── O QUE A CONTA RECEBE ────────────────────────────────────
describe("🔴 carregarCirurgiasDoEpisodio: a descrição chega à conta", () => {
  /** Um `sb` de mentira, que responde por rota e sabe falhar. */
  const bancoFake = ({ cirurgias = [], equipe = [], descricoes = [], falha = null }) =>
    async rota => {
      if (rota.startsWith("cc_cirurgias")) { if (falha === "cirurgias") return null; return cirurgias; }
      if (rota.startsWith("cc_equipe")) { if (falha === "equipe") return null; return equipe; }
      if (rota.startsWith("cc_descricao")) { if (falha === "descricao") return null; return descricoes; }
      return [];
    };

  const CIRS = [{ id: 7, prontuario: "T1", procedimento_cod: "0407010173" }];
  const EQ = [{ cirurgia_id: 7, papel: "cirurgiao", nome: "Dra. Ana", cbo: "225125" }];
  const D1 = { id: 1, cirurgia_id: 7, versao: 1, corrige_id: null, procedimento_cod: "0407010050" };
  const D2 = { id: 2, cirurgia_id: 7, versao: 2, corrige_id: 1, procedimento_cod: "0407010099" };

  it("entrega a descrição VIGENTE por cirurgia", async () => {
    const { carregarCirurgiasDoEpisodio } = await import("../atendimento/dados.js");
    const r = await carregarCirurgiasDoEpisodio(bancoFake({ cirurgias: CIRS, equipe: EQ, descricoes: [D1, D2] }), 501);
    // A corrigida não é a que vale — cobrar pela versão retificada seria
    // cobrar o que o cirurgião já disse que estava errado.
    expect(r.descricaoPorCirurgia["7"]).toBe(D2);
    expect(r.naoLi).toBe(false);
  });

  it("🔴 falha ao ler a DESCRIÇÃO conta como 'não li'", async () => {
    // Sem isto o motor cobra o código do AGENDAMENTO sem saber que não leu
    // a descrição: uma conversão de via passaria batida, e a conta fecharia
    // com o porte errado — batendo com o agendamento.
    const { carregarCirurgiasDoEpisodio } = await import("../atendimento/dados.js");
    const r = await carregarCirurgiasDoEpisodio(bancoFake({ cirurgias: CIRS, equipe: EQ, falha: "descricao" }), 501);
    expect(r.naoLi).toBe(true);
  });

  it("falha ao ler a EQUIPE também conta — a conta sairia sem executante", async () => {
    const { carregarCirurgiasDoEpisodio } = await import("../atendimento/dados.js");
    const r = await carregarCirurgiasDoEpisodio(bancoFake({ cirurgias: CIRS, falha: "equipe" }), 501);
    expect(r.naoLi).toBe(true);
  });

  it("sem cirurgia no episódio, nada disso é 'não li'", async () => {
    const { carregarCirurgiasDoEpisodio } = await import("../atendimento/dados.js");
    const r = await carregarCirurgiasDoEpisodio(bancoFake({}), 501);
    expect(r).toEqual({ cirurgias: [], equipePorCirurgia: {}, descricaoPorCirurgia: {}, naoLi: false });
  });
});
