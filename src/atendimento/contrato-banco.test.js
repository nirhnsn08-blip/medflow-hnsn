// ═══════════════════════════════════════════════════════════
// CONTRATO ENTRE A RECEPÇÃO E O BANCO
//
// Mesmo teste que existe no PEP (`src/prontuario/contrato-banco.test.js`),
// pelo mesmo motivo: o PostgREST recusa o INSERT inteiro quando UMA chave
// não é coluna real, e o `sbFetch` transforma isso em `null` silencioso. A
// recepção clica em "abrir atendimento", a tela não acusa nada, e o
// paciente que está no balcão não existe para o sistema.
//
// Aqui é pior do que no PEP: se a abertura falha em silêncio, o paciente
// não entra na fila da triagem. Ninguém é chamado.
//
// Não faz rede — injeta um `sb` falso que captura o que SERIA enviado e
// confere cada chave contra `supabase/auditoria-banco.sql`, que é gerado
// a partir das migrações (`node supabase/gerar-auditoria.mjs`).
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buscarPacientes, carregarPaciente, emitirProntuario,
  criarPacienteNaoIdentificado, atendimentosAbertos, abrirAtendimento,
  listarAguardandoIdentificacao, concluirIdentificacao,
  carregarCatalogos, carregarProfissionais,
  salvarCatalogo, alternarAtivoCatalogo, carregarCatalogoCompleto,
  carregarGrades, salvarGrade, alternarAtivoGrade,
  carregarBloqueios, salvarBloqueio, carregarAgendaDoDia,
  marcarAgendamento, confirmarPresenca, registrarFalta, cancelarAgendamento,
  remarcarAgendamento, cadastrarRecemNascido, irmaosDoMesmoParto,
  vincularPacienteAoAgendamento,
  encerrarAtendimento, corrigirAtendimento, cancelarAtendimento,
  listarAmbulatoriaisAbertos, carregarAtendimento, contarRegistrosClinicos,
  historicoDoPaciente, agendamentosFuturos, atendimentosDoPeriodo, atendimentoPorNumero,
  carregarProducaoGravada, gravarProducao, carregarAgendamentosDoPeriodo,
  carregarResponsaveis, responsaveisAnteriores, salvarResponsavel, desativarResponsavel,
  carregarConta, carregarItensDaConta, abrirConta, acrescentarItem, cancelarItem,
  fecharConta, reabrirConta, contasDaCompetencia, registrarTransmissao,
  unificarProntuario, fichasUnificadasEm,
} from "./dados.js";
import { DOMINIOS } from "./ficha.js";
import { CATALOGOS } from "./catalogo.js";

const AUDITORIA = fs.readFileSync(
  path.join(process.cwd(), "supabase", "auditoria-banco.sql"), "utf8");

const COLUNAS = {};
for (const [, tabela, coluna] of AUDITORIA.matchAll(/\('([a-z0-9_]+)','([a-z0-9_]+)','[^']*'\)/g)) {
  (COLUNAS[tabela] ||= new Set()).add(coluna);
}

it("a auditoria foi lida (o parser não quebrou em silêncio)", () => {
  expect(Object.keys(COLUNAS).length).toBeGreaterThan(30);
  // Colunas criadas pela migração desta feature: se a auditoria não foi
  // regenerada, o contrato inteiro estaria conferindo contra um banco
  // velho e passaria sem olhar o que interessa.
  expect(COLUNAS.pacientes?.has("nao_identificado")).toBe(true);
  expect(COLUNAS.pacientes?.has("origem_cadastro")).toBe(true);
  expect(COLUNAS.ps_atendimentos?.has("tipo_atendimento")).toBe(true);
  // Fase 2: se a auditoria não foi regenerada depois da migração da ficha,
  // o contrato inteiro conferiria contra um banco velho e passaria sem
  // olhar justamente o que é novo.
  expect(COLUNAS.at_convenios?.has("exige_autorizacao")).toBe(true);
  expect(COLUNAS.at_dominios?.has("dominio")).toBe(true);
  expect(COLUNAS.at_procedimentos?.has("cbos_compativeis")).toBe(true);
  expect(COLUNAS.ps_atendimentos?.has("convenio_id")).toBe(true);
  expect(COLUNAS.ps_atendimentos?.has("medico_cbo")).toBe(true);
  expect(COLUNAS.profiles?.has("cbo")).toBe(true);
  // Responsável do episódio: se a auditoria não foi regenerada depois da
  // migração, o contrato conferiria contra um banco sem a tabela e o teste
  // de escrita falharia por "tabela não existe" em vez de acusar o que
  // interessa.
  expect(COLUNAS.at_responsaveis?.has("papel")).toBe(true);
  expect(COLUNAS.at_responsaveis?.has("documento_judicial")).toBe(true);
  expect(COLUNAS.at_responsaveis?.has("recebe_alta")).toBe(true);
  // Faturamento: idem — sem regenerar a auditoria, o contrato conferiria
  // contra um banco sem as tabelas da conta.
  expect(COLUNAS.at_contas?.has("competencia")).toBe(true);
  expect(COLUNAS.at_conta_itens?.has("valor_total")).toBe(true);
  expect(COLUNAS.at_conta_itens?.has("cobrar_do_paciente")).toBe(true);
  expect(COLUNAS.at_procedimentos?.has("via_sus")).toBe(true);
});

// O padrão só vale quando NADA é passado. Um `= [...]` na assinatura
// engoliria `espiao(undefined)` e devolveria sucesso justamente no caso
// que se quer testar — o teste passaria sem exercitar nada.
function espiao(...args) {
  const resposta = args.length ? args[0] : [{ id: 1, prontuario: "1001" }];
  const chamadas = [];
  const sb = async (recurso, opcoes = {}) => {
    chamadas.push({ recurso, opcoes });
    return resposta;
  };
  return { sb, chamadas };
}

const USER = { name: "Ana Recepção", role: "adm_silver" };

/** Confere uma escrita: a tabela existe e toda chave é coluna real. */
function conferirEscrita({ recurso, opcoes }) {
  const tabela = String(recurso).split("?")[0];
  expect(COLUNAS[tabela], `tabela '${tabela}' não existe na auditoria`).toBeDefined();
  const corpo = JSON.parse(opcoes.body);
  for (const chave of Object.keys(Array.isArray(corpo) ? corpo[0] : corpo)) {
    expect(COLUNAS[tabela].has(chave), `${tabela}.${chave} não existe no banco`).toBe(true);
  }
}

/** Confere uma leitura: colunas de filtro, select e order existem. */
function conferirLeitura({ recurso }) {
  const [tabela, query = ""] = String(recurso).split("?");
  expect(COLUNAS[tabela], `tabela '${tabela}' não existe na auditoria`).toBeDefined();
  const params = new URLSearchParams(query);

  // `select=*` é legítimo (o formulário de cadastro quer a ficha inteira)
  // e não tem coluna a conferir.
  //
  // 🔴 EMBED NÃO É COLUNA. `select=id,pacientes(data_nascimento)` traz o
  // cadastro vinculado pela FK numa consulta só. A primeira versão desta
  // conferência procurava "pacientes(data_nascimento)" entre as colunas de
  // `ps_atendimentos` e reprovava — que é o teste fazendo o trabalho dele,
  // avisando de uma forma que ele ainda não sabia ler.
  //
  // Um embed é conferido em DUAS coisas, e as duas importam: a tabela
  // embutida existe, e as colunas pedidas são dela. Aceitar o embed sem
  // conferir por dentro abriria um buraco justamente no lugar em que o
  // PostgREST devolve erro silencioso.
  const selecionado = params.get("select") || "";
  // Quebra por vírgula SÓ fora de parênteses — senão "pacientes(a,b)" vira
  // dois pedaços e nenhum deles faz sentido.
  const pedacos = [];
  let nivel = 0, atual = "";
  for (const c of selecionado) {
    if (c === "(") nivel++;
    if (c === ")") nivel--;
    if (c === "," && nivel === 0) { pedacos.push(atual); atual = ""; continue; }
    atual += c;
  }
  if (atual) pedacos.push(atual);

  for (const pedaco of pedacos.map(p => p.trim()).filter(p => p && p !== "*")) {
    const embed = /^([a-z_0-9]+)\((.*)\)$/.exec(pedaco);
    if (embed) {
      const [, outra, colunas] = embed;
      expect(COLUNAS[outra], `embed: tabela '${outra}' não existe na auditoria`).toBeDefined();
      for (const c of colunas.split(",").map(x => x.trim()).filter(x => x && x !== "*")) {
        expect(COLUNAS[outra].has(c), `select ${tabela} → ${outra}.${c}`).toBe(true);
      }
      continue;
    }
    expect(COLUNAS[tabela].has(pedaco), `select ${tabela}.${pedaco}`).toBe(true);
  }
  for (const campo of (params.get("order") || "").split(",").filter(Boolean)) {
    const col = campo.trim().split(".")[0];
    if (col) expect(COLUNAS[tabela].has(col), `order ${tabela}.${col}`).toBe(true);
  }
  // Filtros: tudo que não é parâmetro reservado do PostgREST é coluna.
  const RESERVADOS = new Set(["select", "order", "limit", "offset", "or", "and"]);
  for (const [chave] of params) {
    if (RESERVADOS.has(chave)) continue;
    expect(COLUNAS[tabela].has(chave), `filtro ${tabela}.${chave}`).toBe(true);
  }
  // Dentro de `or=(...)`: cada termo é `coluna.operador.valor`.
  const or = params.get("or");
  if (or) {
    for (const termo of or.replace(/^\(|\)$/g, "").split(",")) {
      const col = termo.split(".")[0];
      if (col) expect(COLUNAS[tabela].has(col), `or ${tabela}.${col}`).toBe(true);
    }
  }
}

describe("escritas da recepção", () => {
  it("criar paciente não identificado grava só em coluna que existe", async () => {
    const { sb, chamadas } = espiao();
    await criarPacienteNaoIdentificado(sb, { prontuario: "1042", sexo: "M", idadeAparente: "60 anos" }, USER);
    expect(chamadas).toHaveLength(1);
    conferirEscrita(chamadas[0]);
  });

  it("abrir atendimento grava só em coluna que existe", async () => {
    const { sb, chamadas } = espiao();
    await abrirAtendimento(sb, {
      paciente: { prontuario: "1001", iniciais: "M.S." },
      tipo: "emergencia", origem: "SAMU", queixa: "dor torácica",
    }, USER);
    expect(chamadas).toHaveLength(1);
    conferirEscrita(chamadas[0]);
  });

  it("abrir atendimento COM a ficha completa grava só em coluna que existe", async () => {
    const { sb, chamadas } = espiao();
    await abrirAtendimento(sb, {
      paciente: { prontuario: "100001", iniciais: "M.S." },
      tipo: "emergencia", origem: "SAMU", queixa: "dor torácica",
      medico: { nome: "Dr. João", cbo: "225125" },
      ficha: {
        convenio_id: 1, plano_id: 2, carteira: "998877", carteira_validade: "2027-01-01",
        guia_numero: "G-1", autorizacao_senha: "S-1",
        tipo_atendimento_cod: "primeira_consulta", tipo_paciente_cod: "tp",
        especialidade_cod: "clinica", carater_cod: "urgencia",
        unidade_origem_cod: "pronto_socorro", local_procedencia_cod: "domicilio",
        destino_cod: "clinica_medica", procedimento_cod: "0301010072",
        cid: "I10", acidente_trabalho: true,
      },
    }, USER);
    expect(chamadas).toHaveLength(1);
    conferirEscrita(chamadas[0]);
    // Prova que a ficha REALMENTE foi ao corpo — sem isto, um bug que
    // descartasse a ficha passaria com o contrato verde.
    const corpo = JSON.parse(chamadas[0].opcoes.body);
    expect(corpo.convenio_id).toBe(1);
    expect(corpo.medico_cbo).toBe("225125");
    expect(corpo.acidente_trabalho).toBe(true);
  });

  it("concluir identificação grava só em coluna que existe", async () => {
    const { sb, chamadas } = espiao();
    await concluirIdentificacao(sb, "1042", USER);
    expect(chamadas).toHaveLength(1);
    conferirEscrita(chamadas[0]);
  });

  it("abrir conta grava só em coluna que existe", async () => {
    const { sb, chamadas } = espiao();
    await abrirConta(sb, {
      atendimento_id: 77, prontuario: "100042", convenio_id: 1, plano_id: 2,
      via: "bpa", competencia: "2026-07",
    }, USER);
    expect(chamadas).toHaveLength(1);
    conferirEscrita(chamadas[0]);
  });

  it("acrescentar item grava só em coluna que existe, com o valor congelado", async () => {
    const { sb, chamadas } = espiao();
    await acrescentarItem(sb, {
      conta_id: 9, tipo: "material", descricao: "Gaze", codigo: "MAT-01",
      quantidade: 4, valor_unitario: 1.25, executante: "Dr. João",
      executante_cbo: "225125", data_execucao: "2026-07-30",
    }, USER);
    expect(chamadas).toHaveLength(1);
    conferirEscrita(chamadas[0]);
    const corpo = JSON.parse(chamadas[0].opcoes.body);
    // O total vai gravado: a tabela de preço muda, a conta de março não.
    expect(corpo.valor_total).toBe(5);
    expect(corpo.cobrar_do_paciente).toBe(false);
  });

  it("cancelar item, fechar e reabrir conta gravam só em coluna que existe", async () => {
    const { sb, chamadas } = espiao();
    await cancelarItem(sb, 3, USER);
    await fecharConta(sb, 9, { via: "bpa", competencia: "2026-07" }, USER);
    await reabrirConta(sb, 9, USER);
    expect(chamadas).toHaveLength(3);
    for (const c of chamadas) conferirEscrita(c);
  });

  it("unificar prontuário grava só em coluna que existe — e carimba quem, quando e por quê", async () => {
    const { sb, chamadas } = espiao();
    await unificarProntuario(sb, {
      origem: "T9013", destino: "T9020",
      motivo: "mesma pessoa — veio sem documento e voltou com CPF",
    }, USER);
    expect(chamadas).toHaveLength(1);
    conferirEscrita(chamadas[0]);

    const corpo = JSON.parse(chamadas[0].opcoes.body);
    expect(corpo.unificado_para).toBe("T9020");
    expect(corpo.unificado_por).toBe(USER.name);
    expect(corpo.unificacao_motivo).toMatch(/sem documento/);
    // O motivo é o que alguém lê numa auditoria: não pode virar string vazia.
    expect(corpo.unificacao_motivo).not.toBe("");

    // 🔴 O filtro é o que impede reescrever o ponteiro num clique repetido.
    expect(chamadas[0].recurso).toMatch(/unificado_para=is.null/);
    expect(chamadas[0].recurso).toMatch(/prontuario=eq.T9013/);
  });

  it("unificação não move dado clínico — UMA tabela é tocada, e é pacientes", async () => {
    // A garantia central desta fase. Se um dia alguém acrescentar aqui os
    // PATCHes das outras 33 tabelas sem uma transação, este teste avisa.
    const { sb, chamadas } = espiao();
    await unificarProntuario(sb, { origem: "T9013", destino: "T9020", motivo: "x".repeat(20) }, USER);
    expect(chamadas).toHaveLength(1);
    expect(chamadas.map(c => String(c.recurso).split("?")[0])).toEqual(["pacientes"]);
  });

  it("unificar consigo mesmo não toca no banco", async () => {
    const { sb, chamadas } = espiao();
    const r = await unificarProntuario(sb, { origem: "T9013", destino: "T9013", motivo: "x".repeat(20) }, USER);
    expect(r.ok).toBe(false);
    expect(chamadas).toHaveLength(0);
  });

  it("a volta do ponteiro lê só coluna que existe", async () => {
    const { sb, chamadas } = espiao();
    await fichasUnificadasEm(sb, "T9020");
    expect(chamadas).toHaveLength(1);
    conferirLeitura(chamadas[0]);
  });

  it("registrar a transmissão grava só em coluna que existe — e carimba quem e quando", async () => {
    const { sb, chamadas } = espiao();
    await registrarTransmissao(sb, [9, 10, 11],
      { protocolo: "BPA-2026-08-0042", transmitidaEm: "2026-08-26" }, USER);
    expect(chamadas).toHaveLength(1);
    conferirEscrita(chamadas[0]);

    const corpo = JSON.parse(chamadas[0].opcoes.body);
    expect(corpo.status).toBe("faturada");
    // 🔴 O que a versão anterior perdia: gravava só o status, e a
    // transmissão é o passo SEM VOLTA. Quem procura na glosa quer as três.
    expect(corpo.faturada_em).toBe("2026-08-26");
    expect(corpo.faturada_por).toBe(USER.name);
    expect(corpo.remessa_protocolo).toBe("BPA-2026-08-0042");

    // O filtro `status=eq.fechada` é o que impede reprocessar conta já
    // faturada quando a tela é clicada duas vezes.
    expect(chamadas[0].recurso).toMatch(/status=eq\.fechada/);
    expect(chamadas[0].recurso).toMatch(/id=in\.\(9,10,11\)/);
  });

  it("🔴 requisição que FALHOU não é confundida com nenhuma conta elegível", async () => {
    // `null` = a requisição falhou (coluna que a migração ainda não criou,
    // RLS negando, rede caída). `sbFetch` já mandou o motivo exato para o
    // alerta do topo — a mensagem daqui não pode AFIRMAR outra causa.
    // Dizer "confirme que seu perfil permite editar faturamento" manda a
    // pessoa pedir permissão à TI por causa de um SQL que ninguém rodou.
    const { sb } = espiao(null);
    const r = await registrarTransmissao(sb, [9], { transmitidaEm: "2026-08-26" }, USER);
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/não chegou ao banco/);
    expect(r.motivo).not.toMatch(/ainda estava fechada/);
  });

  it("requisição que funcionou e não achou conta fechada diz ISSO, e só isso", async () => {
    const { sb } = espiao([]);
    const r = await registrarTransmissao(sb, [9], { transmitidaEm: "2026-08-26" }, USER);
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/nenhuma delas ainda estava fechada/);
    expect(r.motivo).not.toMatch(/não chegou ao banco/);
  });

  it("transmissão sem conta nenhuma não toca no banco", async () => {
    const { sb, chamadas } = espiao();
    const r = await registrarTransmissao(sb, [], { protocolo: "X", transmitidaEm: "2026-08-26" }, USER);
    expect(r.ok).toBe(false);
    expect(chamadas).toHaveLength(0);
  });

  it("gravar responsável do episódio grava só em coluna que existe", async () => {
    const { sb, chamadas } = espiao();
    await salvarResponsavel(sb, {
      atendimento_id: 77, prontuario: "100042", nome: "Maria da Silva",
      cpf: "529.982.247-25", data_nascimento: "1980-05-02", telefone: "51999998888",
      vinculo: "mae", papel: "representante", observacao: "trouxe a criança",
    }, USER);
    expect(chamadas).toHaveLength(1);
    conferirEscrita(chamadas[0]);
    const corpo = JSON.parse(chamadas[0].opcoes.body);
    // O poder vem do papel, nunca do que a tela mandou.
    expect(corpo.consente).toBe(true);
    expect(corpo.recebe_alta).toBe(true);
    expect(corpo.cpf).toBe("52998224725");
  });

  it("desativar responsável grava só em coluna que existe", async () => {
    const { sb, chamadas } = espiao();
    await desativarResponsavel(sb, 5, USER);
    expect(chamadas).toHaveLength(1);
    conferirEscrita(chamadas[0]);
  });

  it("gravar produção do ambulatório grava só em coluna que existe", async () => {
    const { sb, chamadas } = espiao();
    await gravarProducao(sb, {
      data: "2026-07-29", especialidadeId: "ortopedia",
      apurada: { ofertadas: 12, realizadas: 9, primeiras: 5, retornos: 4, faltas: 2, livres: 1 },
      gravadaAnterior: { emergencias: 3 },
    }, USER);
    expect(chamadas).toHaveLength(1);
    conferirEscrita(chamadas[0]);
    const corpo = JSON.parse(chamadas[0].opcoes.body);
    // `atendimentos` só tem `created_at`. `updated_at` faria o PostgREST
    // recusar a linha inteira em silêncio — que é o defeito que este
    // arquivo inteiro existe para impedir.
    expect(corpo).not.toHaveProperty("updated_at");
    // E o número que a agenda não apura precisa chegar ao corpo, senão o
    // upsert zera o que alguém digitou olhando o Pronto-Socorro.
    expect(corpo.emergencias).toBe(3);
  });
});

describe("leituras da recepção", () => {
  it("busca por nome consulta colunas reais", async () => {
    const { sb, chamadas } = espiao([]);
    await buscarPacientes(sb, "Maria Silva");
    conferirLeitura(chamadas[0]);
  });

  it("busca por CPF consulta colunas reais", async () => {
    const { sb, chamadas } = espiao([]);
    await buscarPacientes(sb, "529.982.247-25");
    conferirLeitura(chamadas[0]);
  });

  it("carregar paciente consulta coluna real", async () => {
    const { sb, chamadas } = espiao([]);
    await carregarPaciente(sb, "1001");
    conferirLeitura(chamadas[0]);
  });

  it("atendimentos em aberto consulta colunas reais", async () => {
    const { sb, chamadas } = espiao([]);
    await atendimentosAbertos(sb, "1001");
    conferirLeitura(chamadas[0]);
  });

  it("lista de identificação pendente consulta colunas reais", async () => {
    const { sb, chamadas } = espiao([]);
    await listarAguardandoIdentificacao(sb);
    conferirLeitura(chamadas[0]);
  });

  it("os quatro catálogos consultam tabelas e colunas reais", async () => {
    const { sb, chamadas } = espiao([]);
    await carregarCatalogos(sb);
    expect(chamadas).toHaveLength(4);
    for (const c of chamadas) conferirLeitura(c);
  });

  it("a conta e seus itens consultam colunas reais", async () => {
    const { sb, chamadas } = espiao([]);
    await carregarConta(sb, 77);
    await carregarItensDaConta(sb, 9);
    await contasDaCompetencia(sb, "2026-07", { status: "fechada" });
    expect(chamadas).toHaveLength(3);
    for (const c of chamadas) conferirLeitura(c);
  });

  it("os responsáveis do episódio consultam colunas reais", async () => {
    const { sb, chamadas } = espiao([]);
    await carregarResponsaveis(sb, 77);
    await responsaveisAnteriores(sb, "100042");
    expect(chamadas).toHaveLength(2);
    for (const c of chamadas) conferirLeitura(c);
  });

  it("os agendamentos do mês consultam colunas reais", async () => {
    const { sb, chamadas } = espiao([]);
    await carregarAgendamentosDoPeriodo(sb, { de: "2026-07-01", ate: "2026-07-31" });
    expect(chamadas).toHaveLength(1);
    conferirLeitura(chamadas[0]);
  });

  it("a produção gravada do dia consulta colunas reais", async () => {
    const { sb, chamadas } = espiao([]);
    await carregarProducaoGravada(sb, "2026-07-29");
    expect(chamadas).toHaveLength(1);
    conferirLeitura(chamadas[0]);
  });

  it("a lista de profissionais consulta colunas reais", async () => {
    const { sb, chamadas } = espiao([]);
    await carregarProfissionais(sb);
    conferirLeitura(chamadas[0]);
  });
});

describe("a pesquisa não vira prontuário", () => {
  // O perfil da recepção não acessa o Paciente 360 de propósito (COFEN
  // 754/2024, art. 6º). Se uma destas consultas pedir campo clínico, a
  // separação está furada por dentro — e ninguém percebe, porque a tela
  // funciona.
  const CLINICOS = ["cid", "queixa", "alergias", "classificacao", "pa_sist",
                    "temp", "spo2", "comorbidades", "observacao"];

  it("nenhuma consulta da aba pede campo clínico", async () => {
    for (const acao of [
      sb => historicoDoPaciente(sb, "100001"),
      sb => atendimentosDoPeriodo(sb, { inicio: "2026-07-01T00:00:00Z", fim: "2026-08-01T00:00:00Z" }),
      sb => atendimentoPorNumero(sb, 72),
    ]) {
      const { sb, chamadas } = espiao([]);
      await acao(sb);
      conferirLeitura(chamadas[0]);
      const select = new URLSearchParams(chamadas[0].recurso.split("?")[1]).get("select") || "";
      for (const c of CLINICOS) {
        expect(select.split(",").map(x => x.trim()), `${c} vazou em ${chamadas[0].recurso.split("?")[0]}`).not.toContain(c);
      }
      expect(select).not.toBe("*");
    }
  });

  it("as leituras da pesquisa consultam colunas reais", async () => {
    for (const acao of [
      sb => historicoDoPaciente(sb, "100001"),
      sb => agendamentosFuturos(sb, "100001", { de: "2026-07-30" }),
      sb => atendimentosDoPeriodo(sb, { inicio: "2026-07-01T00:00:00Z", fim: "2026-08-01T00:00:00Z" }),
      sb => atendimentoPorNumero(sb, 72),
    ]) {
      const { sb, chamadas } = espiao([]);
      await acao(sb);
      conferirLeitura(chamadas[0]);
    }
  });

  it("os agendamentos futuros só trazem os vivos, a partir da data", async () => {
    const { sb, chamadas } = espiao([]);
    await agendamentosFuturos(sb, "100001", { de: "2026-07-30" });
    expect(chamadas[0].recurso).toContain("data=gte.2026-07-30");
    expect(chamadas[0].recurso).toContain("status=in.(agendado,confirmado,presente)");
  });

  it("o período usa `lt` na borda final, não `lte`", async () => {
    // Com `lte` num horário fixo, quem chegou 23:59:30 ficava fora da
    // própria data. Este sistema já teve bug de borda de mês.
    const { sb, chamadas } = espiao([]);
    await atendimentosDoPeriodo(sb, { inicio: "2026-07-01T00:00:00Z", fim: "2026-08-01T00:00:00Z" });
    expect(chamadas[0].recurso).toContain("chegada_em=lt.");
    expect(chamadas[0].recurso).not.toContain("chegada_em=lte.");
  });

  it("entrada vazia não consulta nada", async () => {
    const { sb, chamadas } = espiao([]);
    expect(await historicoDoPaciente(sb, "")).toEqual([]);
    expect(await agendamentosFuturos(sb, null)).toEqual([]);
    expect(await atendimentosDoPeriodo(sb, {})).toEqual([]);
    expect(await atendimentoPorNumero(sb, "abc")).toBeNull();
    expect(chamadas).toHaveLength(0);
  });

  it("número de atendimento aceita só dígitos", async () => {
    const { sb, chamadas } = espiao([]);
    await atendimentoPorNumero(sb, "#72 ");
    expect(chamadas[0].recurso).toContain("id=eq.72");
  });
});

describe("ciclo de vida do atendimento", () => {
  it("encerrar grava em coluna real e fecha o status", async () => {
    const { sb, chamadas } = espiao();
    const r = await encerrarAtendimento(sb, 72, "atendido", "consulta realizada", USER);
    expect(r.ok).toBe(true);
    conferirEscrita(chamadas[0]);
    const corpo = JSON.parse(chamadas[0].opcoes.body);
    expect(corpo.status).toBe("finalizado");
    expect(corpo.desfecho).toBe("atendido");
    expect(corpo.desfecho_em).toBeTruthy();
  });

  it("corrigir grava só coluna administrativa, nunca o paciente", async () => {
    const { sb, chamadas } = espiao();
    await corrigirAtendimento(sb, 72, {
      convenio_id: 2, carteira: "998877", cid: "I10",
      // as duas abaixo têm que ser descartadas pelo filtro
      prontuario: "200002", classificacao: "vermelho",
    }, USER);
    conferirEscrita(chamadas[0]);
    const corpo = JSON.parse(chamadas[0].opcoes.body);
    expect(corpo.convenio_id).toBe(2);
    expect(corpo.prontuario).toBeUndefined();
    expect(corpo.classificacao).toBeUndefined();
  });

  it("correção só com campo proibido não chega a gravar", async () => {
    const { sb, chamadas } = espiao();
    const r = await corrigirAtendimento(sb, 72, { prontuario: "200002" }, USER);
    expect(r.ok).toBe(false);
    expect(chamadas).toHaveLength(0);
  });

  it("cancelar congela motivo, momento e autor", async () => {
    const { sb, chamadas } = espiao();
    await cancelarAtendimento(sb, 72, "aberto em duplicidade por engano", USER);
    conferirEscrita(chamadas[0]);
    const corpo = JSON.parse(chamadas[0].opcoes.body);
    expect(corpo.status).toBe("cancelado");
    expect(corpo.cancelado_motivo).toBe("aberto em duplicidade por engano");
    expect(corpo.cancelado_em).toBeTruthy();
    // `usuario` é sobrescrito a cada update; `cancelado_por` congela quem foi.
    expect(corpo.cancelado_por).toBe(USER.name);
  });

  it("as leituras do ciclo consultam colunas reais", async () => {
    for (const acao of [
      sb => listarAmbulatoriaisAbertos(sb),
      sb => carregarAtendimento(sb, 72),
    ]) {
      const { sb, chamadas } = espiao([]);
      await acao(sb);
      conferirLeitura(chamadas[0]);
    }
  });

  it("a contagem de registros clínicos olha as três tabelas do PEP", async () => {
    const { sb, chamadas } = espiao([{ id: 1 }, { id: 2 }]);
    const n = await contarRegistrosClinicos(sb, 72);
    expect(chamadas).toHaveLength(3);
    for (const c of chamadas) conferirLeitura(c);
    expect(n).toBe(6);
  });

  it("sem atendimento, a contagem é zero e não consulta nada", async () => {
    const { sb, chamadas } = espiao();
    expect(await contarRegistrosClinicos(sb, null)).toBe(0);
    expect(chamadas).toHaveLength(0);
  });

  it("a lista de ambulatoriais abertos exclui finalizado E cancelado", async () => {
    // Era o `neq.finalizado` que deixava o cancelado passar por aberto.
    const { sb, chamadas } = espiao([]);
    await listarAmbulatoriaisAbertos(sb);
    expect(chamadas[0].recurso).toContain("finalizado");
    expect(chamadas[0].recurso).toContain("cancelado");
    expect(chamadas[0].recurso).toContain("tipo_atendimento=eq.ambulatorial");
  });

  it("silêncio do banco não passa por sucesso", async () => {
    for (const resposta of [null, []]) {
      const { sb } = espiao(resposta);
      expect((await encerrarAtendimento(sb, 72, "atendido", null, USER)).ok).toBe(false);
      expect((await cancelarAtendimento(sb, 72, "motivo suficiente", USER)).ok).toBe(false);
      expect((await corrigirAtendimento(sb, 72, { cid: "I10" }, USER)).ok).toBe(false);
    }
  });
});

describe("a agenda grava e lê em coluna real", () => {
  const GRADE = {
    especialidade_cod: "ortopedia", profissional_username: "dr.joao", dia_semana: 2,
    hora_inicio: "08:00", hora_fim: "12:00", duracao_min: 20,
    vagas_regulacao: 6, vagas_internas: 4, vagas_chegada: 2,
    vigencia_inicio: "2026-01-01", observacao: "grade da terça",
  };

  it("salvar grade", async () => {
    const { sb, chamadas } = espiao();
    const r = await salvarGrade(sb, GRADE, USER);
    expect(r.ok).toBe(true);
    conferirEscrita(chamadas[0]);
  });

  it("desligar grade", async () => {
    const { sb, chamadas } = espiao();
    await alternarAtivoGrade(sb, 3, false, USER);
    conferirEscrita(chamadas[0]);
  });

  it("salvar bloqueio", async () => {
    const { sb, chamadas } = espiao();
    await salvarBloqueio(sb, { data_inicio: "2026-07-28", data_fim: "2026-07-28", motivo: "Feriado" }, USER);
    conferirEscrita(chamadas[0]);
  });

  it("marcar agendamento", async () => {
    const { sb, chamadas } = espiao();
    const r = await marcarAgendamento(sb, {
      data: "2026-07-28", hora: "08:20", especialidade_cod: "ortopedia",
      profissional_username: "dr.joao", grade_id: 1, prontuario: "100001",
      origem_marcacao: "interna", tipo_atendimento_cod: "retorno",
      protocolo_regulacao: "", observacao: "retorno de 30 dias",
    }, USER);
    expect(r.ok).toBe(true);
    conferirEscrita(chamadas[0]);
  });

  // 🔴 Remarcar escreve DUAS vezes: cria a vaga nova e cancela a antiga.
  // As duas passam por aqui — o elo `remarcado_de` é justamente o campo que
  // some sem erro se não estiver na lista que monta o corpo, e a corrente
  // ficaria toda nula com 201 em todas as linhas.
  it("remarcar agendamento — as duas escritas", async () => {
    const { sb, chamadas } = espiao();
    const r = await remarcarAgendamento(sb, { id: 7, prontuario: "100001", status: "agendado" }, {
      data: "2026-08-11", hora: "09:00", especialidade_cod: "ortopedia",
      profissional_username: "dr.joao", grade_id: 1,
      origem_marcacao: "interna", tipo_atendimento_cod: "retorno",
    }, "hospital_profissional", USER);
    expect(r.ok).toBe(true);
    expect(chamadas.length).toBe(2);
    for (const c of chamadas) conferirEscrita(c);
  });

  // 🔴 O cadastro do recém-nascido é um POST com VINTE chaves, e quase
  // metade é coluna nova. Uma só que não exista faz o PostgREST recusar o
  // INSERT inteiro — e a tela mostraria "nada foi gravado" para um bebê que
  // acabou de nascer, com a recepção sem saber o que fazer.
  it("cadastrar recém-nascido grava em colunas reais", async () => {
    // Duas chamadas com respostas DIFERENTES: o RPC devolve o número do
    // prontuário (objeto), o INSERT devolve a linha criada (array). O
    // espião padrão responde a mesma coisa para tudo e a função pararia na
    // primeira, sem nunca chegar a gravar — que é justamente o que este
    // teste precisa ver.
    const chamadas = [];
    const sb = async (recurso, opcoes = {}) => {
      chamadas.push({ recurso, opcoes });
      if (String(recurso).startsWith("rpc/")) return { proximo_prontuario: "T7001" };
      return [{ prontuario: "T7001" }];
    };
    const r = await cadastrarRecemNascido(sb, {
      mae: {
        prontuario: "100001", nome_completo: "Maria da Silva",
        end_logradouro: "Rua A", end_numero: "10", end_bairro: "Centro",
        end_municipio: "Navegantes", end_uf: "SC", end_cep: "88370000",
        telefone: "47999990000",
      },
      dados: {
        nome_completo: "RN DE MARIA DA SILVA", data_nascimento: "2026-08-25",
        hora_nascimento: "14:35", dnv: "12345678", ordem_nascimento: 1, sexo: "F",
      },
    }, USER);
    expect(r.ok).toBe(true);
    // A primeira chamada é a emissão do prontuário; a que grava o bebê é a
    // última.
    conferirEscrita(chamadas[chamadas.length - 1]);
    const corpo = JSON.parse(chamadas[chamadas.length - 1].opcoes.body);
    expect(corpo.prontuario_mae).toBe("100001");
    expect(corpo.dnv).toBe("12345678");
    // 🔴 O bebê NÃO herda documento da mãe — o documento dele é a DNV.
    expect(corpo.cpf).toBeUndefined();
    expect(corpo.cns).toBeUndefined();
    // mas herda onde eles moram, porque moram no mesmo lugar
    expect(corpo.end_logradouro).toBe("Rua A");
  });

  it("procurar irmãos do mesmo parto consulta colunas reais", async () => {
    const { sb, chamadas } = espiao();
    await irmaosDoMesmoParto(sb, "100001", "2026-08-25");
    conferirLeitura(chamadas[0]);
  });

  it("falta, cancelamento e vínculo do paciente", async () => {
    for (const acao of [
      sb => registrarFalta(sb, 5, USER),
      sb => cancelarAgendamento(sb, 5, "paciente desmarcou", USER),
      sb => vincularPacienteAoAgendamento(sb, 5, "100001", "GERCON-9988", USER),
    ]) {
      const { sb, chamadas } = espiao();
      await acao(sb);
      conferirEscrita(chamadas[0]);
    }
  });

  it("confirmar presença: abre o atendimento E carimba o agendamento", async () => {
    const { sb, chamadas } = espiao();
    const r = await confirmarPresenca(sb,
      { id: 9, especialidade_cod: "ortopedia", tipo_atendimento_cod: "retorno" },
      { paciente: { prontuario: "100001", iniciais: "M.S." }, ficha: { convenio_id: 1 }, medico: { nome: "Dr. João", cbo: "225125" } },
      USER);
    expect(r.ok).toBe(true);
    expect(chamadas).toHaveLength(2);
    for (const c of chamadas) conferirEscrita(c);

    // O atendimento nasce ligado ao agendamento e marcado como ambulatorial
    const at = JSON.parse(chamadas[0].opcoes.body);
    expect(at.agendamento_id).toBe(9);
    expect(at.tipo_atendimento).toBe("ambulatorial");
    expect(at.unidade_origem_cod).toBe("ambulatorio");
    // E o agendamento recebe o id do atendimento de volta
    expect(JSON.parse(chamadas[1].opcoes.body).atendimento_id).toBe(1);
  });

  it("consulta ambulatorial NÃO entra na fila de triagem do PS", async () => {
    // Cravar "aguardando_triagem" para os dois tipos punha consulta
    // agendada na fila do plantão, onde ela ficaria para sempre: ninguém
    // vai triar quem já tem hora marcada. Isso aconteceu de verdade e foi
    // visto no navegador, não nos testes — por isso o caso existe aqui.
    const { sb, chamadas } = espiao();
    await confirmarPresenca(sb, { id: 9, especialidade_cod: "ORTOPEDIA" },
      { paciente: { prontuario: "T9004", iniciais: "?" } }, USER);
    const corpo = JSON.parse(chamadas[0].opcoes.body);
    expect(corpo.tipo_atendimento).toBe("ambulatorial");
    expect(corpo.status).toBe("aguardando_atendimento");
    expect(corpo.status).not.toBe("aguardando_triagem");
  });

  it("emergência continua entrando aguardando triagem", async () => {
    const { sb, chamadas } = espiao();
    await abrirAtendimento(sb, {
      paciente: { prontuario: "1001", iniciais: "M.S." }, tipo: "emergencia", origem: "SAMU",
    }, USER);
    expect(JSON.parse(chamadas[0].opcoes.body).status).toBe("aguardando_triagem");
  });

  it("presença sem paciente definido não grava nada", async () => {
    const { sb, chamadas } = espiao();
    const r = await confirmarPresenca(sb, { id: 9 }, { paciente: null }, USER);
    expect(r.ok).toBe(false);
    expect(chamadas).toHaveLength(0);
  });

  it("se o carimbo falhar, o atendimento continua valendo e o aviso explica", async () => {
    // Primeira chamada devolve o atendimento; a segunda (o PATCH) devolve
    // vazio. O paciente está atendido — o que não pode é a tela dizer que
    // deu tudo certo quando o indicador do dia vai sair errado.
    let n = 0;
    const sb = async () => (++n === 1 ? [{ id: 77 }] : []);
    const r = await confirmarPresenca(sb, { id: 9 },
      { paciente: { prontuario: "100001", iniciais: "M.S." } }, USER);
    expect(r.ok).toBe(true);
    expect(r.atendimento.id).toBe(77);
    expect(r.aviso).toMatch(/indicador de produção/);
  });

  it("as leituras da agenda consultam colunas reais", async () => {
    for (const acao of [
      sb => carregarGrades(sb),
      sb => carregarBloqueios(sb, { de: "2026-07-01", ate: "2026-07-31" }),
      sb => carregarAgendaDoDia(sb, "2026-07-28"),
    ]) {
      const { sb, chamadas } = espiao([]);
      await acao(sb);
      conferirLeitura(chamadas[0]);
    }
  });

  it("fila de chegada grava hora nula — ali a vaga é posição, não relógio", async () => {
    const { sb, chamadas } = espiao();
    await marcarAgendamento(sb, {
      data: "2026-07-28", hora: "08:20", especialidade_cod: "ortopedia",
      origem_marcacao: "chegada",
    }, USER);
    expect(JSON.parse(chamadas[0].opcoes.body).hora).toBeNull();
  });

  it("silêncio do banco não passa por sucesso", async () => {
    for (const resposta of [null, []]) {
      const { sb } = espiao(resposta);
      expect((await salvarGrade(sb, GRADE, USER)).ok).toBe(false);
      expect((await marcarAgendamento(sb, { data: "2026-07-28", especialidade_cod: "x", origem_marcacao: "interna" }, USER)).ok).toBe(false);
      expect((await registrarFalta(sb, 5, USER)).ok).toBe(false);
    }
  });
});

describe("manutenção dos catálogos grava em coluna real", () => {
  // Um caso por catálogo: são três formatos de corpo diferentes
  // (convênio, plano, procedimento e domínio), e o erro de coluna só
  // aparece no formato que ninguém testou.
  const EXEMPLO = {
    convenios:     { codigo: "UNI", nome: "Unimed", tipo: "convenio", registro_ans: "339679" },
    planos:        { codigo: "P1", nome: "Plano Único", convenio_id: 2, acomodacao: "enfermaria", coparticipacao: true },
    procedimentos: { codigo: "0301010072", nome: "Consulta", tabela: "sigtap", cbos_compativeis: "225125" },
  };

  for (const cat of CATALOGOS) {
    it(`${cat.chave} → ${cat.tabela}`, async () => {
      const { sb, chamadas } = espiao();
      const dados = EXEMPLO[cat.chave] || { codigo: "X", nome: "Exemplo", ordem: 2 };
      const r = await salvarCatalogo(sb, cat.chave, dados, USER);
      expect(r.ok).toBe(true);
      expect(chamadas).toHaveLength(1);
      conferirEscrita(chamadas[0]);
    });
  }

  it("desligar uma linha altera só coluna que existe", async () => {
    const { sb, chamadas } = espiao();
    await alternarAtivoCatalogo(sb, "convenios", 7, false, USER);
    conferirEscrita(chamadas[0]);
    expect(JSON.parse(chamadas[0].opcoes.body).ativo).toBe(false);
  });

  it("a leitura de manutenção consulta colunas reais, com o filtro de domínio certo", async () => {
    for (const cat of CATALOGOS) {
      const { sb, chamadas } = espiao([]);
      await carregarCatalogoCompleto(sb, cat.chave);
      conferirLeitura(chamadas[0]);
      if (cat.dominio) expect(chamadas[0].recurso).toContain(`dominio=eq.${cat.dominio}`);
    }
  });

  it("catálogo desconhecido não tenta gravar nada", async () => {
    const { sb, chamadas } = espiao();
    const r = await salvarCatalogo(sb, "inventado", { codigo: "X", nome: "X" }, USER);
    expect(r.ok).toBe(false);
    expect(chamadas).toHaveLength(0);
  });

  it("silêncio do banco não passa por sucesso", async () => {
    for (const resposta of [null, []]) {
      const { sb } = espiao(resposta);
      expect((await salvarCatalogo(sb, "convenios", EXEMPLO.convenios, USER)).ok).toBe(false);
      expect((await alternarAtivoCatalogo(sb, "convenios", 7, false, USER)).ok).toBe(false);
    }
  });
});

describe("catálogo vazio não vira tela quebrada", () => {
  it("devolve todas as chaves mesmo sem nada cadastrado", async () => {
    const { sb } = espiao([]);
    const cat = await carregarCatalogos(sb);
    for (const d of DOMINIOS) expect(Array.isArray(cat[d.chave]), d.chave).toBe(true);
    expect(cat.convenios).toEqual([]);
    expect(cat.procedimentos).toEqual([]);
  });

  it("falha de rede não derruba a recepção — vira catálogo vazio", async () => {
    // O sbFetch devolve `null` quando a chamada falha. Se isso virasse
    // exceção aqui, a tela inteira quebraria por causa de um catálogo.
    const { sb } = espiao(null);
    const cat = await carregarCatalogos(sb);
    expect(cat.convenios).toEqual([]);
    for (const d of DOMINIOS) expect(cat[d.chave]).toEqual([]);
  });

  it("agrupa os domínios pela coluna `dominio`", async () => {
    const sb = async () => ([
      { dominio: "carater", codigo: "eletivo", nome: "Eletivo" },
      { dominio: "carater", codigo: "urgencia", nome: "Urgência" },
      { dominio: "tipo_atendimento", codigo: "retorno", nome: "Retorno" },
    ]);
    const cat = await carregarCatalogos(sb);
    expect(cat.carater).toHaveLength(2);
    expect(cat.tipo_atendimento).toHaveLength(1);
  });
});

describe("o silêncio do banco não passa por sucesso", () => {
  // O sbFetch devolve `null` quando a chamada falha, e o PostgREST devolve
  // 204 mesmo quando o RLS bloqueia. Tratar qualquer um dos dois como
  // sucesso é exatamente o bug que já esteve em produção neste sistema.
  const vazios = [null, [], undefined];

  for (const resposta of vazios) {
    it(`abrir atendimento com resposta ${JSON.stringify(resposta)} devolve erro`, async () => {
      const { sb } = espiao(resposta);
      const r = await abrirAtendimento(sb, {
        paciente: { prontuario: "1001", iniciais: "M.S." }, origem: "SAMU",
      }, USER);
      expect(r.ok).toBe(false);
      expect(r.motivo).toBeTruthy();
    });

    it(`criar paciente com resposta ${JSON.stringify(resposta)} devolve erro`, async () => {
      const { sb } = espiao(resposta);
      const r = await criarPacienteNaoIdentificado(sb, { prontuario: "1042" }, USER);
      expect(r.ok).toBe(false);
    });

    it(`emitir prontuário com resposta ${JSON.stringify(resposta)} devolve erro`, async () => {
      const { sb } = espiao(resposta);
      const r = await emitirProntuario(sb);
      expect(r.ok).toBe(false);
      expect(r.motivo).toMatch(/migracao-atendimento-recepcao/);
    });
  }

  it("emitir prontuário devolve o número quando o banco responde", async () => {
    const { sb } = espiao("1042");
    expect(await emitirProntuario(sb)).toEqual({ ok: true, prontuario: "1042" });
  });

  it("abrir atendimento sem paciente nem tenta gravar", async () => {
    const { sb, chamadas } = espiao();
    const r = await abrirAtendimento(sb, { paciente: null, origem: "SAMU" }, USER);
    expect(r.ok).toBe(false);
    expect(chamadas).toHaveLength(0);
  });
});
