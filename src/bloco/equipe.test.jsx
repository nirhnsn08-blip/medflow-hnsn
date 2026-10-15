// @vitest-environment jsdom
// ═══════════════════════════════════════════════════════════
// A CIRURGIA PASSA A TER PACIENTE, EQUIPE E CÓDIGO
//
// As três entram juntas porque são a MESMA CHAVE: faturar exige paciente
// identificado E código de procedimento E equipe com CBO. Faltando
// qualquer uma, a conta não sai.
//
// 🔴 A EQUIPE ERA UM SOBRENOME. `cirurgiao text, anestesista text` — e
// `anestesista` nunca teve um único input no sistema inteiro (coluna morta
// desde o schema). Isso impedia:
//   • faturar — `at_conta_itens` já tinha `executante_cbo`, e `cbo.js`
//     avisa que CBO errado "não é glosa: derruba o registro inteiro no
//     SISAIH01/BPA, e só aparece no processamento do mês seguinte";
//   • rastrear — "Silva" não identifica profissional nenhum;
//   • escalar — o painel de produtividade agrupava por DIGITAÇÃO, então
//     "Silva", "silva" e "Dr. Silva" eram três cirurgiões.
//
// 🔴 E O PROCEDIMENTO ERA TEXTO LIVRE, num input com placeholder. Cirurgia
// é o procedimento de maior valor da tabela: sem código, o faturista
// redigita do papel — onde nasce o código trocado.
//
// As travas de verdade estão no banco
// (`migracao-cirurgia-paciente-equipe-codigo.sql`, provado em PGlite:
// conferência 30/30, FK mordendo, seis cenários, idempotente). Aqui está o
// que a tela sabe antes de mandar.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import BlocoPage from "./BlocoPage.jsx";
import {
  PAPEIS_EQUIPE, PAPEL_POR_CHAVE, CARATER,
  conferirMembro, linhaDeEquipe, pendenciasDeFaturamento, resumoDaEquipe, procedimentoEscolhido,
} from "./equipe.js";

afterEach(cleanup);

const CIR = { id: 7, iniciais: "A.B.", prontuario: "T1", status: "agendada" };

// ── OS PAPÉIS ───────────────────────────────────────────────
describe("os papéis da sala", () => {
  it("cobre a equipe inteira, não só cirurgião e anestesista", () => {
    const chaves = PAPEIS_EQUIPE.map(p => p.chave);
    expect(chaves).toContain("instrumentador");
    expect(chaves).toContain("circulante");
    expect(chaves).toContain("primeiro_auxiliar");
    expect(chaves).toContain("perfusionista");
  });
  it("separa quem entra na conta de quem é apoio", () => {
    // O que fatura precisa de CBO; o que não fatura, não. Misturar os dois
    // faria o aviso de CBO virar ruído e parar de ser lido.
    expect(PAPEL_POR_CHAVE.cirurgiao.fatura).toBe(true);
    expect(PAPEL_POR_CHAVE.anestesista.fatura).toBe(true);
    expect(PAPEL_POR_CHAVE.circulante.fatura).toBe(false);
  });
  it("só o cirurgião é único", () => {
    expect(PAPEL_POR_CHAVE.cirurgiao.unico).toBe(true);
    expect(PAPEL_POR_CHAVE.primeiro_auxiliar.unico).toBe(false);
  });
});

describe("conferirMembro", () => {
  it("pede função e nome", () => {
    expect(conferirMembro({ papel: "", nome: "Ana" })).toMatch(/função/i);
    expect(conferirMembro({ papel: "cirurgiao", nome: "A" })).toMatch(/nome/i);
  });
  it("aceita um membro normal", () => {
    expect(conferirMembro({ papel: "circulante", nome: "Ana Paz" })).toBeNull();
  });
  it("🔴 recusa o SEGUNDO cirurgião — dois significa que ninguém responde", () => {
    const r = conferirMembro({ papel: "cirurgiao", nome: "Dr. Souza", jaNaEquipe: [{ papel: "cirurgiao" }] });
    expect(r).toMatch(/Já há um cirurgião/i);
    expect(r).toMatch(/ninguém é o responsável/);
  });
  it("mas aceita o segundo auxiliar", () => {
    expect(conferirMembro({ papel: "primeiro_auxiliar", nome: "Dra. Lima", jaNaEquipe: [{ papel: "cirurgiao" }] })).toBeNull();
  });
});

// ── O CARIMBO ───────────────────────────────────────────────
describe("🔴 nome, conselho e CBO são CARIMBADOS, não referenciados", () => {
  const perfil = { username: "ana", nome: "Ana Souza", conselho: "CRM", registro_conselho: "12345", uf_conselho: "SC", cbo: "225125" };

  it("copia tudo do perfil no ato", () => {
    const l = linhaDeEquipe({ cirurgia: CIR, papel: "cirurgiao", perfil, grau: "cirurgião" });
    expect(l).toMatchObject({
      cirurgia_id: 7, papel: "cirurgiao", profissional_username: "ana",
      nome: "Ana Souza", conselho: "CRM", registro_conselho: "12345", uf_conselho: "SC",
      cbo: "225125", grau_participacao: "cirurgião",
    });
  });

  it("aceita nome digitado — o cirurgião externo não tem login, e recusá-lo deixaria a cirurgia sem executante", () => {
    const l = linhaDeEquipe({ cirurgia: CIR, papel: "cirurgiao", nome: "Dr. Externo" });
    expect(l.nome).toBe("Dr. Externo");
    expect(l.profissional_username).toBeNull();
    // o que não se sabe fica NULO — inventar CBO derrubaria o registro
    expect(l.cbo).toBeNull();
    expect(l.conselho).toBeNull();
  });
});

// ── O QUE IMPEDE DE FATURAR ─────────────────────────────────
describe("🔴 pendências de faturamento: avisa, não trava", () => {
  it("sem cirurgião, a conta não tem executante", () => {
    expect(pendenciasDeFaturamento([]).join(" ")).toMatch(/sem executante o procedimento não é pago/i);
  });

  it("cirurgião sem CBO: diz o custo real, que não é glosa", () => {
    const a = pendenciasDeFaturamento([{ papel: "cirurgiao", nome: "Silva", registro_conselho: "1" }]);
    expect(a.join(" ")).toMatch(/Rejeição no SISAIH01\/BPA não é glosa/);
    expect(a.join(" ")).toMatch(/derruba o registro inteiro/);
  });

  it("conta quem fatura sem CBO, e ignora quem é apoio", () => {
    const a = pendenciasDeFaturamento([
      { papel: "cirurgiao", nome: "Ana", cbo: "225125", registro_conselho: "1" },
      { papel: "anestesista", nome: "Reis", registro_conselho: "2" },     // fatura, sem CBO
      { papel: "circulante", nome: "Paz" },                               // apoio: não entra
    ]);
    expect(a.join(" ")).toMatch(/1 membro\(s\) que entram na conta estão sem CBO: Reis/);
    expect(a.join(" ")).not.toMatch(/Paz/);
  });

  it("equipe completa não gera aviso nenhum", () => {
    expect(pendenciasDeFaturamento([
      { papel: "cirurgiao", nome: "Ana", cbo: "225125", registro_conselho: "1" },
      { papel: "circulante", nome: "Paz" },
    ])).toEqual([]);
  });
});

describe("resumoDaEquipe — o cirurgião primeiro, sempre", () => {
  it("ordena pelo papel, não pela digitação", () => {
    const r = resumoDaEquipe([
      { papel: "circulante", nome: "Paz" },
      { papel: "cirurgiao", nome: "Ana" },
      { papel: "anestesista", nome: "Reis" },
    ]);
    expect(r.indexOf("Ana")).toBeLessThan(r.indexOf("Reis"));
    expect(r.indexOf("Reis")).toBeLessThan(r.indexOf("Paz"));
  });
  it("sem equipe, nada a resumir", () => {
    expect(resumoDaEquipe([])).toBeNull();
  });
});

describe("procedimentoEscolhido — código e nome andam juntos", () => {
  const cat = [{ codigo: "0407010173", nome: "Colecistectomia videolaparoscópica" }];
  it("resolve o código no catálogo", () => {
    expect(procedimentoEscolhido(cat, "0407010173")).toEqual({ codigo: "0407010173", nome: "Colecistectomia videolaparoscópica" });
  });
  it("código fora do catálogo não vira nome inventado", () => {
    expect(procedimentoEscolhido(cat, "9999999999")).toBeNull();
    expect(procedimentoEscolhido(cat, "")).toBeNull();
  });
});

describe("o caráter é o do Atendimento, não uma lista nova", () => {
  it("eletivo, urgência e emergência", () => {
    expect(CARATER.map(c => c.chave)).toEqual(["eletivo", "urgencia", "emergencia"]);
  });
});

// ── A TELA ──────────────────────────────────────────────────
const SALAS = [{ nome: "Sala 1", ordem: 1, ativa: true }];
const PROCS = [{ codigo: "0407010173", nome: "Colecistectomia videolaparoscópica", valor_sus: 500 }];
const PERFIS = [
  { username: "ana", nome: "Ana Souza", conselho: "CRM", registro_conselho: "12345", uf_conselho: "SC", cbo: "225125" },
  { username: "reis", nome: "Dr. Reis", conselho: "CRM", registro_conselho: "999", cbo: null },
];

function banco({ cirurgias = [], equipe = [], escrita = [{ id: 1 }] } = {}) {
  const pedidos = [];
  const sb = async (url, o) => {
    pedidos.push({ url: String(url), metodo: o?.method || "GET", corpo: o?.body ? JSON.parse(o.body) : null });
    const tabela = String(url).split("?")[0];
    if (o?.method) return escrita;
    if (tabela === "cc_salas") return SALAS;
    if (tabela === "cc_cirurgias") return cirurgias;
    if (tabela === "cc_equipe") return equipe;
    if (tabela === "at_procedimentos") return PROCS;
    if (tabela === "profiles") return PERFIS;
    return [];
  };
  sb.pedidos = pedidos;
  return sb;
}

const CIRURGIA = {
  id: 7, iniciais: "A.B.", prontuario: "T1", sala: "Sala 1", procedimento: "Cole",
  data: "2026-10-08", hora_prevista: "08:00", status: "agendada",
};

describe("🔴 o cartão mostra a equipe e o que ela impede de faturar", () => {
  it("sem equipe: diz que não há executante", async () => {
    render(<BlocoPage sb={banco({ cirurgias: [CIRURGIA] })} currentUser={{ name: "T" }} canEdit={true} />);
    await screen.findByText("Equipe não registrada");
    expect(screen.getByText(/sem executante o procedimento não é pago/i)).toBeTruthy();
  });

  it("com cirurgião sem CBO: avisa o custo", async () => {
    render(<BlocoPage
      sb={banco({ cirurgias: [CIRURGIA], equipe: [{ id: 1, cirurgia_id: 7, papel: "cirurgiao", nome: "Silva" }] })}
      currentUser={{ name: "T" }} canEdit={true} />);
    await screen.findByText(/Cirurgião\(ã\): Silva/);
    expect(screen.getByText(/derruba o registro inteiro/)).toBeTruthy();
  });

  it("equipe completa: nenhum aviso", async () => {
    render(<BlocoPage
      sb={banco({ cirurgias: [CIRURGIA], equipe: [{ id: 1, cirurgia_id: 7, papel: "cirurgiao", nome: "Ana", cbo: "225125", registro_conselho: "1" }] })}
      currentUser={{ name: "T" }} canEdit={true} />);
    await screen.findByText(/Cirurgião\(ã\): Ana/);
    expect(screen.queryByText(/sem CBO|não é pago/i)).toBeNull();
  });

  it("cirurgia CANCELADA não cobra equipe — não há conta a fazer", async () => {
    render(<BlocoPage sb={banco({ cirurgias: [{ ...CIRURGIA, status: "cancelada" }] })} currentUser={{ name: "T" }} canEdit={true} />);
    await screen.findByText("Equipe não registrada");
    expect(screen.queryByText(/não é pago/i)).toBeNull();
  });
});

describe("🔴 acrescentar membro carimba o CBO do cadastro", () => {
  it("escolhendo do cadastro, a linha vai com conselho e CBO", async () => {
    const sb = banco({ cirurgias: [CIRURGIA] });
    render(<BlocoPage sb={sb} currentUser={{ name: "T" }} canEdit={true} />);
    fireEvent.click(await screen.findByText("equipe"));
    fireEvent.change(await screen.findByLabelText("Função na sala"), { target: { value: "cirurgiao" } });
    fireEvent.change(screen.getByLabelText("Profissional do cadastro"), { target: { value: "ana" } });
    fireEvent.click(screen.getByText("+"));
    await waitFor(() => expect(sb.pedidos.some(p => p.url.startsWith("cc_equipe") && p.metodo === "POST")).toBe(true));
    const corpo = sb.pedidos.find(p => p.url.startsWith("cc_equipe") && p.metodo === "POST").corpo;
    expect(corpo).toMatchObject({
      cirurgia_id: 7, papel: "cirurgiao", profissional_username: "ana",
      nome: "Ana Souza", cbo: "225125", conselho: "CRM", uf_conselho: "SC",
    });
  });

  it("🔴 o segundo cirurgião é recusado ANTES de ir ao banco", async () => {
    const sb = banco({ cirurgias: [CIRURGIA], equipe: [{ id: 1, cirurgia_id: 7, papel: "cirurgiao", nome: "Silva" }] });
    render(<BlocoPage sb={sb} currentUser={{ name: "T" }} canEdit={true} />);
    fireEvent.click(await screen.findByText("equipe"));
    fireEvent.change(await screen.findByLabelText("Função na sala"), { target: { value: "cirurgiao" } });
    fireEvent.change(screen.getByLabelText("Profissional do cadastro"), { target: { value: "ana" } });
    fireEvent.click(screen.getByText("+"));
    await screen.findByText(/Já há um cirurgião/i);
    expect(sb.pedidos.some(p => p.url.startsWith("cc_equipe") && p.metodo === "POST")).toBe(false);
  });

  // 🔴 ESTE TESTE NASCEU CAMINHANDO PELA TELA, não de mutação.
  //
  // Ao registrar o cirurgião, o aviso de faturamento desaparecia — e com
  // ele um IRMÃO do painel de equipe. O React então remontava o
  // `EquipeDaCirurgia` e o formulário se esvaziava NO MEIO DO USO: quem
  // fosse acrescentar o anestesista em seguida encontrava os campos
  // limpos, sem entender por quê.
  //
  // O teste anterior não pegava porque não acrescentava um membro e
  // continuava digitando. É o tipo de defeito que só aparece percorrendo
  // a sequência real de uso.
  it("🔴 a posição do painel entre os irmãos NÃO muda quando o aviso some", async () => {
    // A invariante é estrutural: com e sem aviso, o painel tem de ocupar a
    // MESMA posição entre os irmãos. Se o número de irmãos variar, o React
    // remonta o componente e o formulário se esvazia no meio do uso.
    async function posicaoDoPainel(equipe) {
      cleanup();
      render(<BlocoPage sb={banco({ cirurgias: [CIRURGIA], equipe })} currentUser={{ name: "T" }} canEdit={true} />);
      fireEvent.click(await screen.findByText("equipe"));
      const campo = await screen.findByLabelText("Função na sala");
      // o painel é o ancestral que é filho direto do bloco do cartão
      const painel = campo.closest("div[style]").parentElement;
      const irmaos = [...painel.parentElement.children];
      return { indice: irmaos.indexOf(painel), total: irmaos.length };
    }

    const comAviso = await posicaoDoPainel([]);                       // sem cirurgião → avisa
    const semAviso = await posicaoDoPainel([                          // completo → não avisa
      { id: 1, cirurgia_id: 7, papel: "cirurgiao", nome: "Ana", cbo: "225125", registro_conselho: "1" },
    ]);
    expect(comAviso).toEqual(semAviso);
  });

  it("perfil sem CBO avisa na hora de escolher, não depois", async () => {
    render(<BlocoPage sb={banco({ cirurgias: [CIRURGIA] })} currentUser={{ name: "T" }} canEdit={true} />);
    fireEvent.click(await screen.findByText("equipe"));
    fireEvent.change(await screen.findByLabelText("Profissional do cadastro"), { target: { value: "reis" } });
    await screen.findByText(/está sem CBO no cadastro/);
    expect(screen.getByText(/Corrija em Usuários e Perfis/)).toBeTruthy();
  });
});

// 🔴 ACHADO CAMINHANDO, de novo: a migração criou `ps_atendimento_id` e o
// backfill ligou o que não tinha dúvida — mas NÃO HAVIA CAMPO para ligar o
// resto. Cirurgia agendada com antecedência nasce antes de o episódio
// existir, então o backfill nunca a alcança, e sem elo ela não vira conta
// de ninguém. É a mesma falha do sítio/lateralidade no PR anterior: coluna
// sem input.
describe("🔴 o elo com o episódio tem campo", () => {
  const ATEND = [
    { id: 212, chegada_em: "2026-10-08T12:00:00Z", desfecho_em: null, tipo_atendimento: "emergencia" },
    { id: 100, chegada_em: "2026-09-01T12:00:00Z", desfecho_em: "2026-09-02T12:00:00Z", tipo_atendimento: "ambulatorial" },
  ];
  const bancoComAtend = () => {
    const base = banco();
    const sb = async (url, o) => {
      if (String(url).startsWith("ps_atendimentos") && !o?.method) return ATEND;
      return base(url, o);
    };
    sb.pedidos = base.pedidos;
    return sb;
  };

  it("oferece os atendimentos do paciente, com o aberto marcado", async () => {
    render(<BlocoPage sb={bancoComAtend()} currentUser={{ name: "T" }} canEdit={true} />);
    fireEvent.click(await screen.findByText(/\+ Agendar cirurgia/i));
    await screen.findByText("Agendar");
    fireEvent.change(screen.getByPlaceholderText("48213"), { target: { value: "T1" } });
    const sel = await screen.findByLabelText("Atendimento a que esta cirurgia pertence");
    await waitFor(() => expect([...sel.options].length).toBeGreaterThan(1));
    const textos = [...sel.options].map(o => o.text);
    expect(textos.join(" ")).toMatch(/#212/);
    expect(textos.join(" ")).toMatch(/EM ABERTO/);
  });

  it("sem elo, diz que a cirurgia não entra na conta de ninguém", async () => {
    render(<BlocoPage sb={banco()} currentUser={{ name: "T" }} canEdit={true} />);
    fireEvent.click(await screen.findByText(/\+ Agendar cirurgia/i));
    await screen.findByText("Agendar");
    expect(screen.getByText(/Sem episódio, a cirurgia não entra na conta de ninguém/)).toBeTruthy();
  });

  it("paciente sem atendimento aberto recebe a frase certa — não a genérica", async () => {
    render(<BlocoPage sb={banco()} currentUser={{ name: "T" }} canEdit={true} />);
    fireEvent.click(await screen.findByText(/\+ Agendar cirurgia/i));
    await screen.findByText("Agendar");
    fireEvent.change(screen.getByPlaceholderText("48213"), { target: { value: "T_SEM" } });
    await screen.findByText(/não tem atendimento aberto/i);
    expect(screen.getByText(/ligue depois, pela edição/)).toBeTruthy();
  });

  it("o elo escolhido vai para o banco como número", async () => {
    const sb = bancoComAtend();
    render(<BlocoPage sb={sb} currentUser={{ name: "T" }} canEdit={true} />);
    fireEvent.click(await screen.findByText(/\+ Agendar cirurgia/i));
    await screen.findByText("Agendar");
    fireEvent.change(screen.getByPlaceholderText("J.S.M."), { target: { value: "M.O." } });
    fireEvent.change(screen.getByPlaceholderText("48213"), { target: { value: "T1" } });
    fireEvent.change(screen.getByPlaceholderText(/Colecistectomia videolaparoscópica/), { target: { value: "Artroplastia" } });
    const sel = await screen.findByLabelText("Atendimento a que esta cirurgia pertence");
    await waitFor(() => expect([...sel.options].length).toBeGreaterThan(1));
    fireEvent.change(sel, { target: { value: "212" } });
    fireEvent.click(screen.getByText("Agendar"));
    await waitFor(() => expect(sb.pedidos.some(p => p.url.startsWith("cc_cirurgias") && p.metodo === "POST")).toBe(true));
    const corpo = sb.pedidos.find(p => p.url.startsWith("cc_cirurgias") && p.metodo === "POST").corpo;
    expect(corpo.ps_atendimento_id).toBe(212);   // número, não string
  });
});

describe("🔴 o agendamento ganha código, sítio, lado e caráter", () => {
  it("sem código, avisa que não vira conta", async () => {
    render(<BlocoPage sb={banco()} currentUser={{ name: "T" }} canEdit={true} />);
    fireEvent.click(await screen.findByText(/\+ Agendar cirurgia/i));
    await screen.findByText("Agendar");
    expect(screen.getByText(/Sem código a cirurgia não vira conta: nem AIH, nem guia TISS/)).toBeTruthy();
  });

  it("escolher o procedimento do catálogo preenche o nome junto", async () => {
    render(<BlocoPage sb={banco()} currentUser={{ name: "T" }} canEdit={true} />);
    fireEvent.click(await screen.findByText(/\+ Agendar cirurgia/i));
    await screen.findByText("Agendar");
    const sel = await screen.findByDisplayValue("— sem código (não fatura)");
    fireEvent.change(sel, { target: { value: "0407010173" } });
    await waitFor(() => expect(screen.getByDisplayValue("Colecistectomia videolaparoscópica")).toBeTruthy());
  });

  it("🔴 o sítio e o lado agora TÊM campo — o Sign In mandava conferi-los e não havia onde guardar", async () => {
    const sb = banco();
    render(<BlocoPage sb={sb} currentUser={{ name: "T" }} canEdit={true} />);
    fireEvent.click(await screen.findByText(/\+ Agendar cirurgia/i));
    await screen.findByText("Agendar");
    fireEvent.change(screen.getByPlaceholderText(/joelho, vesícula/), { target: { value: "joelho" } });
    const lado = screen.getAllByRole("combobox").find(s => [...s.options].some(o => o.value === "direito"));
    fireEvent.change(lado, { target: { value: "direito" } });
    fireEvent.change(screen.getByPlaceholderText("J.S.M."), { target: { value: "M.O." } });
    fireEvent.change(screen.getByPlaceholderText("48213"), { target: { value: "T1" } });
    fireEvent.change(screen.getByPlaceholderText(/Colecistectomia videolaparoscópica/), { target: { value: "Artroplastia" } });
    fireEvent.click(screen.getByText("Agendar"));
    await waitFor(() => expect(sb.pedidos.some(p => p.url.startsWith("cc_cirurgias") && p.metodo === "POST")).toBe(true));
    const corpo = sb.pedidos.find(p => p.url.startsWith("cc_cirurgias") && p.metodo === "POST").corpo;
    expect(corpo.sitio_cirurgico).toBe("joelho");
    expect(corpo.lateralidade).toBe("direito");
  });
});
