// ═══════════════════════════════════════════════════════════
// CONTRATO ENTRE O CÓDIGO E O BANCO
//
// POR QUE ESTE TESTE EXISTE
// A tela da Admissão gravava em quatro colunas que não existem
// (`tipo`, `historia_doenca`, `antecedentes`, `medicacoes_uso`) e a
// anotação de enfermagem em uma quinta (`tipo`, quando a coluna é
// `categoria`). O PostgREST recusa o INSERT inteiro nesses casos: nada
// era salvo. Passou pelo code review, pelo build e pelos 99 testes,
// porque nenhum deles olhava o nome das colunas.
//
// É a pior classe de defeito deste sistema — o profissional escreve a
// evolução, clica em salvar, a tela não acusa nada, e o registro não
// existe. Em prontuário, registro que não existe é registro que não foi
// feito.
//
// COMO FUNCIONA
// Não faz rede: injeta um `sb` falso que captura o que SERIA enviado, e
// confere cada chave contra `supabase/auditoria-banco.sql` — que é
// gerado a partir das migrações (`node supabase/gerar-auditoria.mjs`) e
// portanto acompanha o banco de verdade.
//
// Cobre também as LEITURAS: filtro em coluna inexistente devolve erro
// 400, que o sbFetch transforma em tela vazia.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  carregarProntuario, abrirEpisodio, registrarSinais, registrarAnotacao,
  registrarAnamnese, registrarAlergia, assinarPrescricao, eventoDoItem,
  registrarAdministracao, registrarAcesso, registrarMedicamentoUso,
  salvarReconciliacao, emitirSumarioAlta, encerrarEpisodio,
} from "./dados.js";

// ── o que o banco tem, segundo a auditoria gerada ───────────
const AUDITORIA = fs.readFileSync(
  path.join(process.cwd(), "supabase", "auditoria-banco.sql"), "utf8");

const COLUNAS = {};
for (const [, tabela, coluna] of AUDITORIA.matchAll(/\('([a-z0-9_]+)','([a-z0-9_]+)','[^']*'\)/g)) {
  (COLUNAS[tabela] ||= new Set()).add(coluna);
}

// Sanidade: se o parser quebrar, os testes abaixo passariam vazios e o
// contrato viraria decoração.
it("a auditoria foi lida (o parser não quebrou em silêncio)", () => {
  expect(Object.keys(COLUNAS).length).toBeGreaterThan(30);
  expect(COLUNAS.pep_anamneses?.has("historia_doenca_atual")).toBe(true);
});

// ── captura do que seria enviado ────────────────────────────
function espiao() {
  const chamadas = [];
  const sb = async (recurso, opcoes = {}) => {
    chamadas.push({ recurso, opcoes });
    // devolve algo plausível: o cabeçalho da prescrição precisa de `id`
    // para que os itens sejam gravados em seguida.
    return [{ id: 1 }];
  };
  return { sb, chamadas };
}

const USER = {
  nome: "Ana Enfermeira", categoria: "enfermeiro",
  registro_conselho: "12345-RS", role: "adm_master",
};
const EPISODIO = { id: 7, prontuario: "P-001" };

/** Confere um POST: tabela existe e toda chave é coluna real. */
function conferirEscrita({ recurso, opcoes }) {
  const tabela = recurso.split("?")[0];
  expect(COLUNAS[tabela], `tabela desconhecida: ${tabela}`).toBeDefined();
  const corpo = JSON.parse(opcoes.body);
  for (const registro of Array.isArray(corpo) ? corpo : [corpo]) {
    for (const chave of Object.keys(registro)) {
      expect(COLUNAS[tabela].has(chave), `${tabela}.${chave} não existe no banco`).toBe(true);
    }
  }
}

/** Confere um GET: tabela existe e as colunas usadas em filtro/ordem também. */
function conferirLeitura(recurso) {
  const [tabela, query = ""] = recurso.split("?");
  expect(COLUNAS[tabela], `tabela desconhecida: ${tabela}`).toBeDefined();
  for (const par of query.split("&")) {
    const [chave, valor] = par.split("=");
    if (chave === "select" || chave === "limit" || chave === "offset" || !chave) continue;
    const coluna = chave === "order" ? (valor || "").split(".")[0] : chave;
    expect(COLUNAS[tabela].has(coluna), `${tabela}.${coluna} não existe no banco`).toBe(true);
  }
}

describe("escrita — toda coluna enviada existe no banco", () => {
  it("abrirEpisodio", async () => {
    const { sb, chamadas } = espiao();
    await abrirEpisodio(sb, { prontuario: "P-001", iniciais: "A.B.", leito: "12", setor: "Clínica", cid: "J18", motivo: "Pneumonia" }, USER);
    chamadas.forEach(conferirEscrita);
  });

  it("registrarAnamnese", async () => {
    const { sb, chamadas } = espiao();
    await registrarAnamnese(sb, EPISODIO, {
      categoria: "enfermagem", queixa_principal: "Dispneia",
      historia_doenca_atual: "Há 3 dias", antecedentes_pessoais: "HAS",
      medicamentos_em_uso: "Losartana 50mg", habitos: "Ex-tabagista",
      sistemas: { geral: "REG" },
    }, USER);
    expect(chamadas).toHaveLength(1);
    chamadas.forEach(conferirEscrita);
  });

  it("registrarAnotacao", async () => {
    const { sb, chamadas } = espiao();
    await registrarAnotacao(sb, EPISODIO, { categoria: "queda", texto: "Queda do leito", intercorrencia: true }, USER);
    chamadas.forEach(conferirEscrita);
  });

  it("registrarSinais", async () => {
    const { sb, chamadas } = espiao();
    await registrarSinais(sb, EPISODIO, { pa_sist: 120, pa_diast: 80, fc: 88, fr: 18, temp: 36.5, spo2: 97, glicemia: 99, dor: 2, consciencia: "A", o2_suplementar: false }, USER);
    chamadas.forEach(conferirEscrita);
  });

  it("registrarAlergia", async () => {
    const { sb, chamadas } = espiao();
    await registrarAlergia(sb, "P-001", { agente: "Dipirona", substancia: "dipirona", tipo: "medicamento", gravidade: "grave", manifestacao: "Urticária", situacao: "ativa", criticidade: "alta", fonte: "relato" }, USER);
    chamadas.forEach(conferirEscrita);
  });

  it("assinarPrescricao — cabeçalho e itens", async () => {
    const { sb, chamadas } = espiao();
    await assinarPrescricao(sb, EPISODIO, {
      tipo: "medica", observacao: "Reavaliar em 24h", substituiId: null,
      itens: [{
        tipo: "medicamento", medicamento_id: 3, descricao: "Dipirona 500mg",
        dose: "500 mg", dose_valor: 500, dose_unidade: "mg", via: "EV",
        frequencia: "6/6h (4x)", frequencia_dia: 4, se_necessario: false,
        duracao_dias: 5, observacao: null,
      }],
    }, USER);
    expect(chamadas).toHaveLength(2);
    chamadas.forEach(conferirEscrita);
  });

  it("eventoDoItem", async () => {
    const { sb, chamadas } = espiao();
    await eventoDoItem(sb, EPISODIO, { id: 9, prescricao_id: 4 }, "suspenso", "Reação adversa", USER);
    chamadas.forEach(conferirEscrita);
  });

  it("registrarAdministracao", async () => {
    const { sb, chamadas } = espiao();
    await registrarAdministracao(sb, EPISODIO, {
      item_id: 9, prescricao_id: 4, medicamento_id: 3,
      descricao: "Dipirona 500mg", dose: "500 mg", via: "EV", status: "administrado",
    }, USER);
    chamadas.forEach(conferirEscrita);
  });

  it("registrarAcesso", async () => {
    const { sb, chamadas } = espiao();
    registrarAcesso(sb, "P-001", "prontuario_internado", 7, USER);
    chamadas.forEach(conferirEscrita);
  });

  it("registrarMedicamentoUso", async () => {
    const { sb, chamadas } = espiao();
    await registrarMedicamentoUso(sb, "P-001", EPISODIO, {
      descricao: "Losartana 50mg", substancia: "losartana", dose: "50 mg",
      dose_valor: 50, dose_unidade: "mg", via: "VO", frequencia: "1x/dia",
      frequencia_dia: 1, indicacao: "Hipertensão", fonte: "receita",
    }, USER);
    chamadas.forEach(conferirEscrita);
  });

  it("salvarReconciliacao — cabeçalho e itens", async () => {
    const { sb, chamadas } = espiao();
    await salvarReconciliacao(sb, EPISODIO, {
      momento: "admissao", observacao: "Lista trazida pela filha",
      linhas: [{
        origem: "domiciliar", decisao: "manter", justificativa: null,
        discrepancias: [], pendente: false, levaParaCasa: true,
        item: { id: 11, descricao: "Losartana 50mg", dose: "50 mg", dose_valor: 50, dose_unidade: "mg", via: "VO", frequencia_dia: 1 },
      }],
    }, USER);
    expect(chamadas).toHaveLength(2);
    chamadas.forEach(conferirEscrita);
  });

  it("emitirSumarioAlta", async () => {
    const { sb, chamadas } = espiao();
    await emitirSumarioAlta(sb, EPISODIO, {
      desfecho: "alta_melhorado", admissao_em: "2026-07-18T14:00:00Z",
      alta_em: "2026-07-23T12:00:00Z", dias_internacao: 4,
      diagnostico_principal: "Pneumonia", resumo_internacao: "Boa evolução",
      orientacoes: "Repouso", condicao_alta: "Estável", retorno_servico: "UBS",
    }, { medicamentos: [{ descricao: "Losartana" }], suspensos: [], texto: "…", reconciliacaoId: 1 }, USER);
    chamadas.forEach(conferirEscrita);
  });

  it("encerrarEpisodio", async () => {
    const { sb, chamadas } = espiao();
    await encerrarEpisodio(sb, EPISODIO, { desfecho: "alta_melhorado" }, USER);
    expect(chamadas[0].opcoes.method).toBe("PATCH");
    chamadas.forEach(conferirEscrita);
  });
});

describe("leitura — todo filtro usa coluna que existe", () => {
  it("carregarProntuario varre só colunas reais", async () => {
    const lidas = [];
    const sb = async (recurso) => {
      lidas.push(recurso);
      // devolve um episódio aberto para que a segunda leva de consultas
      // (as do episódio) também seja exercitada
      if (recurso.startsWith("pep_episodios")) return [{ id: 7, prontuario: "P-001", status: "aberto" }];
      return [];
    };
    await carregarProntuario(sb, "P-001");
    expect(lidas.length).toBeGreaterThan(8);
    lidas.forEach(conferirLeitura);
  });
});

describe("autoria — o registro carrega quem assinou", () => {
  it("congela nome e conselho dentro do registro", async () => {
    const { sb, chamadas } = espiao();
    await registrarAnotacao(sb, EPISODIO, { categoria: "dor", texto: "Refere dor 6/10" }, USER);
    const corpo = JSON.parse(chamadas[0].opcoes.body);
    expect(corpo.profissional_nome).toBe("Ana Enfermeira");
    expect(corpo.conselho).toBe("COREN");
    expect(corpo.registro_conselho).toBe("12345-RS");
  });

  it("prescrição guarda o conselho do prescritor (CFM 2.299/2021, art. 2º)", async () => {
    const { sb, chamadas } = espiao();
    await assinarPrescricao(sb, EPISODIO, { tipo: "medica", itens: [] },
      { nome: "Dr. Bruno", categoria: "medico", registro_conselho: "9876-RS" });
    const corpo = JSON.parse(chamadas[0].opcoes.body);
    expect(corpo.prescritor_nome).toBe("Dr. Bruno");
    expect(corpo.conselho).toBe("CRM");
  });
});
