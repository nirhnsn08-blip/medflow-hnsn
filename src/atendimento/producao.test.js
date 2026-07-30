// ═══════════════════════════════════════════════════════════
// A CONCILIAÇÃO DA PRODUÇÃO DO AMBULATÓRIO
//
// Quatro coisas aqui são regra, não detalhe:
//
//   1. CHAVE ERRADA É PIOR QUE CHAVE FALTANDO. Especialidade da agenda que
//      não é nenhuma das cinco do painel não vira produção gravada num
//      palpite — vira aviso. Número gravado numa chave que ninguém lê some
//      sem erro, e alguém procura no fim do mês.
//   2. `emergencias` NÃO É APURÁVEL. Não passa pela agenda. O upsert
//      substitui a linha inteira, então omitir o campo zeraria o que alguém
//      digitou olhando o PS.
//   3. LINHA ÓRFÃ NÃO É ZERADA. Produção gravada à mão sem grade no dia
//      pode ser legítima — apagar destruiria o único registro que existe.
//   4. NaN NÃO ENTRA EM INDICADOR. `Number(undefined)` é NaN, e NaN numa
//      soma contamina a linha toda sem erro. Este sistema já teve isso no
//      cálculo do NEWS.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  CAMPOS_PRODUCAO, CAMPOS_APURAVEIS, especialidadesDoDia,
  producaoDaEspecialidade, conciliarProducao, camposDaProducao, validarGravacao,
} from "./producao.js";
import { idDaEspecialidade, ESPECIALIDADES } from "../ambulatorio/especialidades.js";

const QUARTA = "2026-07-29";

const grade = (over = {}) => ({
  id: 1, especialidade_cod: "ORTOPEDIA", dia_semana: 3,
  hora_inicio: "08:00", hora_fim: "12:00", duracao_min: 20,
  vagas_regulacao: 6, vagas_internas: 4, vagas_chegada: 2,
  vigencia_inicio: "2026-01-01", ativo: true, ...over,
});

const ag = (over = {}) => ({
  id: 1, data: QUARTA, hora: "08:00", especialidade_cod: "ORTOPEDIA",
  origem_marcacao: "interna", status: "agendado",
  tipo_atendimento_cod: "primeira_consulta", ...over,
});

describe("de qual especialidade é o dia", () => {
  it("junta o que a grade abre e o que foi marcado", () => {
    const cods = especialidadesDoDia({
      grades: [grade()],
      agendamentos: [ag({ id: 2, especialidade_cod: "OFTALMOLOGIA" })],
      data: QUARTA,
    });
    expect(cods).toEqual(["OFTALMOLOGIA", "ORTOPEDIA"]);
  });

  it("agendamento de outro dia não entra", () => {
    expect(especialidadesDoDia({
      grades: [], agendamentos: [ag({ data: "2026-07-28" })], data: QUARTA,
    })).toEqual([]);
  });

  it("grade de outro dia da semana não entra", () => {
    expect(especialidadesDoDia({ grades: [grade({ dia_semana: 1 })], data: QUARTA })).toEqual([]);
  });
});

describe("apuração por especialidade", () => {
  it("não mistura a agenda de uma com a da outra", () => {
    const p = producaoDaEspecialidade({
      grades: [grade(), grade({ id: 2, especialidade_cod: "OFTALMOLOGIA", vagas_internas: 30 })],
      agendamentos: [
        ag({ id: 1, status: "presente" }),
        ag({ id: 2, especialidade_cod: "OFTALMOLOGIA", status: "presente", hora: "09:00" }),
      ],
      data: QUARTA, especialidadeCod: "ORTOPEDIA",
    });
    expect(p.ofertadas).toBe(12);      // 6 + 4 + 2, só da ortopedia
    expect(p.realizadas).toBe(1);
  });

  it("conta falta e primeira consulta separadas do retorno", () => {
    const p = producaoDaEspecialidade({
      grades: [grade()],
      agendamentos: [
        ag({ id: 1, status: "presente", tipo_atendimento_cod: "primeira_consulta" }),
        ag({ id: 2, status: "presente", tipo_atendimento_cod: "retorno", hora: "08:20" }),
        ag({ id: 3, status: "falta", hora: "08:40" }),
      ],
      data: QUARTA, especialidadeCod: "ORTOPEDIA",
    });
    expect(p).toMatchObject({ realizadas: 2, primeiras: 1, retornos: 1, faltas: 1 });
  });
});

describe("conciliação", () => {
  const base = { grades: [grade()], agendamentos: [ag({ status: "presente" })], data: QUARTA };

  it("aponta a diferença campo a campo", () => {
    const c = conciliarProducao({
      ...base,
      gravado: [{ data: QUARTA, especialidade: "ortopedia", ofertadas: 12, realizadas: 9, faltas: 0, primeiras: 9, retornos: 0, livres: 3, emergencias: 4 }],
    });
    expect(c.linhas).toHaveLength(1);
    const l = c.linhas[0];
    expect(l.id).toBe("ortopedia");
    expect(l.divergente).toBe(true);
    expect(l.divergencias.find(d => d.campo === "realizadas")).toMatchObject({ apurado: 1, gravado: 9 });
    // o que bate não aparece como divergência
    expect(l.divergencias.some(d => d.campo === "ofertadas")).toBe(false);
  });

  it("nunca gravado conta como divergente — o número existe e não está no painel", () => {
    const c = conciliarProducao({ ...base, gravado: [] });
    expect(c.linhas[0].gravada).toBeNull();
    expect(c.linhas[0].divergente).toBe(true);
    expect(c.divergentes).toBe(1);
  });

  it("igual não é divergente", () => {
    const apurada = producaoDaEspecialidade({ ...base, especialidadeCod: "ORTOPEDIA" });
    const c = conciliarProducao({
      ...base,
      gravado: [{ data: QUARTA, especialidade: "ortopedia", ...apurada, emergencias: 0 }],
    });
    expect(c.linhas[0].divergente).toBe(false);
    expect(c.divergentes).toBe(0);
  });

  it("especialidade fora do painel vira AVISO, não chave inventada", () => {
    const c = conciliarProducao({
      grades: [grade({ especialidade_cod: "CARDIOLOGIA" })],
      agendamentos: [], data: QUARTA,
      catalogoEspecialidades: [{ codigo: "CARDIOLOGIA", nome: "Cardiologia" }],
    });
    expect(c.linhas).toEqual([]);
    expect(c.semCorrespondencia).toHaveLength(1);
    expect(c.semCorrespondencia[0].nome).toBe("Cardiologia");
  });

  it("linha gravada à mão sem agenda no dia aparece como órfã, e não zerada", () => {
    const c = conciliarProducao({
      ...base,
      gravado: [
        { data: QUARTA, especialidade: "ortopedia", realizadas: 1 },
        { data: QUARTA, especialidade: "urologia", realizadas: 7, emergencias: 2 },
      ],
    });
    expect(c.orfas).toHaveLength(1);
    expect(c.orfas[0]).toMatchObject({ id: "urologia", label: "Urologia" });
    expect(c.orfas[0].gravada.realizadas).toBe(7);
  });

  it("linha gravada zerada não vira órfã — não há o que preservar", () => {
    const c = conciliarProducao({
      ...base,
      gravado: [{ data: QUARTA, especialidade: "urologia", realizadas: 0, ofertadas: 0 }],
    });
    expect(c.orfas).toEqual([]);
  });

  it("gravado de outro dia não entra na conciliação de hoje", () => {
    const c = conciliarProducao({
      ...base,
      gravado: [{ data: "2026-07-28", especialidade: "ortopedia", realizadas: 99 }],
    });
    expect(c.linhas[0].gravada).toBeNull();
    expect(c.orfas).toEqual([]);
  });

  it("marca o dia bloqueado — grade que não valeu não deveria virar oferta", () => {
    const c = conciliarProducao({
      ...base,
      bloqueios: [{ data_inicio: QUARTA, data_fim: QUARTA, especialidade_cod: "ORTOPEDIA", motivo: "Férias" }],
    });
    expect(c.linhas[0].bloqueado).toBe(true);
    expect(c.linhas[0].apurada.ofertadas).toBe(0);
  });
});

describe("o corpo que vai para o banco", () => {
  it("preserva `emergencias`, que a agenda não sabe apurar", () => {
    const corpo = camposDaProducao({
      data: QUARTA, especialidadeId: "ortopedia",
      apurada: { ofertadas: 12, realizadas: 1 },
      gravadaAnterior: { emergencias: 5 },
    });
    expect(corpo.emergencias).toBe(5);
  });

  it("sem linha anterior, emergências é 0 e não NaN nem undefined", () => {
    const corpo = camposDaProducao({ data: QUARTA, especialidadeId: "ortopedia", apurada: {} });
    expect(corpo.emergencias).toBe(0);
    for (const c of CAMPOS_APURAVEIS) expect(corpo[c], c).toBe(0);
  });

  it("nenhum NaN escapa para o indicador", () => {
    const corpo = camposDaProducao({
      data: QUARTA, especialidadeId: "ortopedia",
      apurada: { ofertadas: undefined, realizadas: null, faltas: "x" },
      gravadaAnterior: { emergencias: "abc" },
    });
    for (const [k, v] of Object.entries(corpo)) {
      if (typeof v === "number") expect(Number.isNaN(v), k).toBe(false);
    }
  });

  it("só emite colunas que existem na tabela agregada", () => {
    const corpo = camposDaProducao({ data: QUARTA, especialidadeId: "ortopedia", apurada: {} });
    const permitidas = new Set([...CAMPOS_PRODUCAO, "data", "especialidade"]);
    for (const k of Object.keys(corpo)) expect(permitidas.has(k), k).toBe(true);
  });

  it("`emergencias` não está entre os apuráveis", () => {
    expect(CAMPOS_APURAVEIS).not.toContain("emergencias");
    expect(CAMPOS_PRODUCAO).toContain("emergencias");
  });
});

describe("validarGravacao", () => {
  it("recusa o que não tem chave no painel", () => {
    expect(validarGravacao({ especialidadeCod: "CARDIOLOGIA", id: null }).ok).toBe(false);
  });

  it("recusa regravar o que já está igual", () => {
    const v = validarGravacao({ especialidadeCod: "ORTOPEDIA", id: "ortopedia", divergente: false });
    expect(v.ok).toBe(false);
    expect(v.erros[0]).toMatch(/já é igual/i);
  });

  it("aceita o divergente", () => {
    expect(validarGravacao({ especialidadeCod: "ORTOPEDIA", id: "ortopedia", divergente: true }).ok).toBe(true);
  });
});

describe("de qual especialidade do painel é este código", () => {
  it("casa por código, por rótulo e ignorando caixa e acento", () => {
    expect(idDaEspecialidade("ORTOPEDIA")).toBe("ortopedia");
    expect(idDaEspecialidade("cirurgia_geral")).toBe("cirurgia_geral");
    expect(idDaEspecialidade("CIR-GERAL", "Cirurgia Geral")).toBe("cirurgia_geral");
    expect(idDaEspecialidade("Oftalmologia")).toBe("oftalmologia");
  });

  it("o que não é do painel devolve null, e não o primeiro parecido", () => {
    expect(idDaEspecialidade("CARDIOLOGIA")).toBeNull();
    expect(idDaEspecialidade("")).toBeNull();
    expect(idDaEspecialidade(null)).toBeNull();
    // "ortopedia_infantil" não é "ortopedia": especialidade diferente,
    // meta diferente. Casar por prefixo somaria produção de uma na outra.
    expect(idDaEspecialidade("ORTOPEDIA_INFANTIL")).toBeNull();
  });

  it("as cinco do painel continuam sendo as cinco pactuadas", () => {
    expect(ESPECIALIDADES.map(e => e.id))
      .toEqual(["cirurgia_geral", "oftalmologia", "ginecologia", "urologia", "ortopedia"]);
  });
});
