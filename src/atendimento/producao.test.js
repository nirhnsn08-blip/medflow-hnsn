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
  diasDoMes, producaoDoMes,
} from "./producao.js";
import { idDaEspecialidade, especialidadesDoCadastro } from "../ambulatorio/especialidades.js";

// 🔴 A LISTA VEM DO CADASTRO DO HOSPITAL, não do código. Aqui ela é montada
// como `at_dominios` traria, com as cinco que o HNSN pactuou — para os
// testes continuarem falando do mesmo caso concreto de antes.
const ESPECIALIDADES = especialidadesDoCadastro([
  { dominio: "especialidade", codigo: "CIRURGIA_GERAL", nome: "Cirurgia Geral", ativo: true,
    extras: { painel_id: "cirurgia_geral", meta_mensal: 360, meta_anual: 4320, meta_primeiras: 1320 } },
  { dominio: "especialidade", codigo: "OFTALMOLOGIA",   nome: "Oftalmologia",   ativo: true,
    extras: { painel_id: "oftalmologia",   meta_mensal: 240, meta_anual: 2880, meta_primeiras: 864 } },
  { dominio: "especialidade", codigo: "GINECOLOGIA",    nome: "Ginecologia",    ativo: true,
    extras: { painel_id: "ginecologia",    meta_mensal: 240, meta_anual: 2880, meta_primeiras: 864 } },
  { dominio: "especialidade", codigo: "UROLOGIA",       nome: "Urologia",       ativo: true,
    extras: { painel_id: "urologia",       meta_mensal: 240, meta_anual: 2880, meta_primeiras: 864 } },
  { dominio: "especialidade", codigo: "ORTOPEDIA",      nome: "Ortopedia",      ativo: true,
    extras: { painel_id: "ortopedia",      meta_mensal: 387, meta_anual: 4644, meta_primeiras: 1394 } },
]);

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
    const c = conciliarProducao({ especialidades: ESPECIALIDADES,
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
    const c = conciliarProducao({ especialidades: ESPECIALIDADES, ...base, gravado: [] });
    expect(c.linhas[0].gravada).toBeNull();
    expect(c.linhas[0].divergente).toBe(true);
    expect(c.divergentes).toBe(1);
  });

  it("igual não é divergente", () => {
    const apurada = producaoDaEspecialidade({ ...base, especialidadeCod: "ORTOPEDIA" });
    const c = conciliarProducao({ especialidades: ESPECIALIDADES,
      ...base,
      gravado: [{ data: QUARTA, especialidade: "ortopedia", ...apurada, emergencias: 0 }],
    });
    expect(c.linhas[0].divergente).toBe(false);
    expect(c.divergentes).toBe(0);
  });

  it("especialidade fora do painel vira AVISO, não chave inventada", () => {
    const c = conciliarProducao({ especialidades: ESPECIALIDADES,
      grades: [grade({ especialidade_cod: "CARDIOLOGIA" })],
      agendamentos: [], data: QUARTA,
      catalogoEspecialidades: [{ codigo: "CARDIOLOGIA", nome: "Cardiologia" }],
    });
    expect(c.linhas).toEqual([]);
    expect(c.semCorrespondencia).toHaveLength(1);
    expect(c.semCorrespondencia[0].nome).toBe("Cardiologia");
  });

  it("linha gravada à mão sem agenda no dia aparece como órfã, e não zerada", () => {
    const c = conciliarProducao({ especialidades: ESPECIALIDADES,
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
    const c = conciliarProducao({ especialidades: ESPECIALIDADES,
      ...base,
      gravado: [{ data: QUARTA, especialidade: "urologia", realizadas: 0, ofertadas: 0 }],
    });
    expect(c.orfas).toEqual([]);
  });

  it("gravado de outro dia não entra na conciliação de hoje", () => {
    const c = conciliarProducao({ especialidades: ESPECIALIDADES,
      ...base,
      gravado: [{ data: "2026-07-28", especialidade: "ortopedia", realizadas: 99 }],
    });
    expect(c.linhas[0].gravada).toBeNull();
    expect(c.orfas).toEqual([]);
  });

  it("marca o dia bloqueado — grade que não valeu não deveria virar oferta", () => {
    const c = conciliarProducao({ especialidades: ESPECIALIDADES,
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

describe("o mês", () => {
  it("julho tem 31 dias e fevereiro bissexto tem 29 — sem escorregar de fuso", () => {
    expect(diasDoMes(2026, 6)).toHaveLength(31);
    expect(diasDoMes(2026, 6)[0]).toBe("2026-07-01");
    expect(diasDoMes(2026, 6).at(-1)).toBe("2026-07-31");
    expect(diasDoMes(2024, 1)).toHaveLength(29);
    expect(diasDoMes(2026, 1)).toHaveLength(28);
  });

  it("mês inválido não vira lista torta", () => {
    expect(diasDoMes(2026, 12)).toEqual([]);
    expect(diasDoMes(2026, -1)).toEqual([]);
    expect(diasDoMes(null, 6)).toEqual([]);
  });

  it("soma as quartas do mês inteiro", () => {
    // julho/2026 tem 5 quartas: 1, 8, 15, 22 e 29.
    const m = producaoDoMes({ especialidades: ESPECIALIDADES, grades: [grade()], agendamentos: [], ano: 2026, mes: 6 });
    expect(m.porEspecialidade[0].ofertadas).toBe(12 * 5);
    expect(m.porEspecialidade[0].diasComGrade).toBe(5);
  });

  it("ABSENTEÍSMO DO MÊS vem dos totais, não da média dos dias", () => {
    // Dia A: 1 marcado, 1 falta (100%). Dia B: 10 marcados, 1 falta (10%).
    // A média dos percentuais daria 55%; o real é 2/11 = 18%.
    const agendamentos = [
      ag({ id: 1, data: "2026-07-01", status: "falta" }),
      ...Array.from({ length: 9 }, (_, i) => ag({ id: 10 + i, data: "2026-07-08", status: "presente", hora: `09:${String(i * 2).padStart(2, "0")}` })),
      ag({ id: 30, data: "2026-07-08", status: "falta", hora: "10:00" }),
    ];
    const m = producaoDoMes({ especialidades: ESPECIALIDADES, grades: [grade()], agendamentos, ano: 2026, mes: 6 });
    const e = m.porEspecialidade[0];
    expect(e.marcados).toBe(11);
    expect(e.faltas).toBe(2);
    expect(e.absenteismo).toBe(18);
    expect(e.absenteismo).not.toBe(55);
  });

  it("ordem de chegada não entra no denominador do absenteísmo", () => {
    const m = producaoDoMes({ especialidades: ESPECIALIDADES,
      grades: [grade()],
      agendamentos: [
        ag({ id: 1, data: "2026-07-01", status: "presente", origem_marcacao: "chegada", hora: null }),
        ag({ id: 2, data: "2026-07-01", status: "falta" }),
      ],
      ano: 2026, mes: 6,
    });
    // 1 marcado (o da falta); quem chega por ordem de chegada não podia
    // faltar a nada.
    expect(m.porEspecialidade[0].marcados).toBe(1);
    expect(m.porEspecialidade[0].absenteismo).toBe(100);
  });

  it("sem ninguém marcado o absenteísmo é null, e não 0%", () => {
    const m = producaoDoMes({ especialidades: ESPECIALIDADES, grades: [grade()], agendamentos: [], ano: 2026, mes: 6 });
    expect(m.porEspecialidade[0].absenteismo).toBeNull();
    expect(m.total.absenteismo).toBeNull();
  });

  it("separa a produção por dono da vaga", () => {
    const m = producaoDoMes({ especialidades: ESPECIALIDADES,
      grades: [grade()],
      agendamentos: [
        ag({ id: 1, data: "2026-07-01", status: "presente", origem_marcacao: "regulacao" }),
        ag({ id: 2, data: "2026-07-01", status: "falta", origem_marcacao: "regulacao", hora: "08:20" }),
        ag({ id: 3, data: "2026-07-01", status: "presente", origem_marcacao: "interna", hora: "08:40" }),
      ],
      ano: 2026, mes: 6,
    });
    const o = m.porEspecialidade[0].porOrigem;
    expect(o.regulacao).toMatchObject({ marcados: 2, realizadas: 1, faltas: 1 });
    expect(o.interna).toMatchObject({ marcados: 1, realizadas: 1, faltas: 0 });
    expect(o.chegada.marcados).toBe(0);
  });

  it("compara com a meta da especialidade — e não inventa meta para quem não tem", () => {
    const comMeta = producaoDoMes({ especialidades: ESPECIALIDADES, grades: [grade()], agendamentos: [], ano: 2026, mes: 6 });
    expect(comMeta.porEspecialidade[0].meta).toBe(387);       // ortopedia
    expect(comMeta.porEspecialidade[0].pctMeta).toBe(0);

    const semMeta = producaoDoMes({ especialidades: ESPECIALIDADES,
      grades: [grade({ especialidade_cod: "CARDIOLOGIA" })], agendamentos: [], ano: 2026, mes: 6,
    });
    expect(semMeta.porEspecialidade[0].meta).toBeNull();
    expect(semMeta.porEspecialidade[0].pctMeta).toBeNull();
  });

  it("agendamento de outro mês não entra", () => {
    const m = producaoDoMes({ especialidades: ESPECIALIDADES,
      grades: [grade()],
      agendamentos: [ag({ id: 1, data: "2026-06-03", status: "presente" })],
      ano: 2026, mes: 6,
    });
    expect(m.porEspecialidade[0].realizadas).toBe(0);
  });

  it("o total soma as especialidades", () => {
    const m = producaoDoMes({ especialidades: ESPECIALIDADES,
      grades: [grade(), grade({ id: 2, especialidade_cod: "OFTALMOLOGIA", vagas_internas: 1, vagas_regulacao: 0, vagas_chegada: 0 })],
      agendamentos: [
        ag({ id: 1, data: "2026-07-01", status: "presente" }),
        ag({ id: 2, data: "2026-07-01", status: "presente", especialidade_cod: "OFTALMOLOGIA" }),
      ],
      ano: 2026, mes: 6,
    });
    expect(m.porEspecialidade).toHaveLength(2);
    expect(m.total.realizadas).toBe(2);
    expect(m.total.ofertadas).toBe(12 * 5 + 1 * 5);
  });
});

describe("de qual especialidade do painel é este código", () => {
  it("casa por código, por rótulo e ignorando caixa e acento", () => {
    expect(idDaEspecialidade("ORTOPEDIA", null, ESPECIALIDADES)).toBe("ortopedia");
    expect(idDaEspecialidade("cirurgia_geral", null, ESPECIALIDADES)).toBe("cirurgia_geral");
    expect(idDaEspecialidade("CIR-GERAL", "Cirurgia Geral", ESPECIALIDADES)).toBe("cirurgia_geral");
    expect(idDaEspecialidade("Oftalmologia", null, ESPECIALIDADES)).toBe("oftalmologia");
  });

  it("o que não é do painel devolve null, e não o primeiro parecido", () => {
    expect(idDaEspecialidade("CARDIOLOGIA", null, ESPECIALIDADES)).toBeNull();
    expect(idDaEspecialidade("", null, ESPECIALIDADES)).toBeNull();
    expect(idDaEspecialidade(null, null, ESPECIALIDADES)).toBeNull();
    // "ortopedia_infantil" não é "ortopedia": especialidade diferente,
    // meta diferente. Casar por prefixo somaria produção de uma na outra.
    expect(idDaEspecialidade("ORTOPEDIA_INFANTIL", null, ESPECIALIDADES)).toBeNull();
  });

  it("🔴 o painel_id do cadastro é o que amarra o histórico", () => {
    // A produção está gravada em `atendimentos.especialidade` com estas
    // chaves. Se o cadastro trouxer outro `painel_id`, o histórico daquela
    // especialidade some do painel — sem erro em lugar nenhum.
    expect(ESPECIALIDADES.map(e => e.id))
      .toEqual(["cirurgia_geral", "oftalmologia", "ginecologia", "urologia", "ortopedia"]);
  });

  it("⚠️ sem cadastro, NÃO existem especialidades — e não as cinco do HNSN", () => {
    // É a razão de toda esta mudança: o cliente novo não pode ver a
    // pactuação de outro hospital.
    expect(especialidadesDoCadastro([])).toEqual([]);
    expect(especialidadesDoCadastro(null)).toEqual([]);
    expect(idDaEspecialidade("CIRURGIA_GERAL", "Cirurgia Geral", [])).toBeNull();
  });
});
