import { describe, it, expect } from "vitest";
import {
  indexarCatalogo, diagnosticosDaUnidade, intervencoesDoDiagnostico,
} from "./sae-catalogo.js";
import {
  ultimaEscala, sugerirDiagnosticos, aprazarItem, montarItensPrescricao,
  horariosParaData, checarCuidados, resumoSae,
} from "./sae.js";

// ── catálogo de teste (espelha a forma do enf_sae_catalogo) ──
const CATALOGO = [
  { id: "dx_dor_aguda", tipo: "diagnostico", codigo: "00132", titulo: "Dor aguda", unidades: ["clinica", "obst"], ordem: 1,
    payload: { def: ["Relato de dor"], resultado: "Alívio da dor", intervencoes: ["nic_controle_dor", "nic_monitoracao_sinais"] } },
  { id: "dx_integridade_pele", tipo: "diagnostico", codigo: "00046", titulo: "Integridade da pele prejudicada", unidades: ["clinica", "uti"], ordem: 2,
    payload: { intervencoes: ["nic_prevencao_lpp", "nic_monitoracao_sinais"] } },
  { id: "dx_risco_integridade_pele", tipo: "diagnostico", codigo: "00047", titulo: "Risco de integridade da pele prejudicada", unidades: [], ordem: 3,
    payload: { intervencoes: ["nic_prevencao_lpp"] } },
  { id: "dx_risco_queda_adulto", tipo: "diagnostico", codigo: "00303", titulo: "Risco de queda em adulto", unidades: ["clinica", "uti"], ordem: 4,
    payload: { intervencoes: ["nic_prevencao_quedas"] } },
  { id: "dx_risco_queda_crianca", tipo: "diagnostico", codigo: "00306", titulo: "Risco de queda em criança", unidades: ["peds"], ordem: 5, payload: {} },
  { id: "dx_risco_infeccao", tipo: "diagnostico", codigo: "00004", titulo: "Risco de infecção", unidades: [], ordem: 6, payload: {} },
  { id: "dx_padrao_respiratorio", tipo: "diagnostico", codigo: "00032", titulo: "Padrão respiratório ineficaz", unidades: ["clinica", "uti"], ordem: 7, payload: {} },
  { id: "dx_hipertermia", tipo: "diagnostico", codigo: "00007", titulo: "Hipertermia", unidades: ["clinica", "peds"], ordem: 8, payload: {} },
  { id: "dx_desobstrucao_vias_aereas", tipo: "diagnostico", codigo: "00031", titulo: "Desobstrução ineficaz de vias aéreas", unidades: ["uti"], ordem: 9, payload: {} },
  { id: "dx_amamentacao_ineficaz", tipo: "diagnostico", codigo: "00104", titulo: "Amamentação ineficaz", unidades: ["obst"], ordem: 10, payload: {} },
  // intervenções
  { id: "nic_controle_dor", tipo: "intervencao", codigo: "1400", titulo: "Controle da dor", unidades: [], ordem: 101,
    payload: { atividades: ["Avaliar a dor", "Aplicar medidas não farmacológicas"], frequencia: "6/6h", frequencia_dia: 4 } },
  { id: "nic_monitoracao_sinais", tipo: "intervencao", codigo: "6680", titulo: "Monitoração de sinais vitais", unidades: [], ordem: 102,
    payload: { atividades: ["Aferir sinais vitais"], frequencia: "6/6h", frequencia_dia: 4 } },
  { id: "nic_prevencao_lpp", tipo: "intervencao", codigo: "3540", titulo: "Prevenção de lesão por pressão", unidades: [], ordem: 103,
    payload: { atividades: ["Mudança de decúbito"], frequencia: "2/2h", frequencia_dia: 12 } },
  { id: "nic_prevencao_quedas", tipo: "intervencao", codigo: "6490", titulo: "Prevenção contra quedas", unidades: [], ordem: 104,
    payload: { atividades: ["Grades elevadas"], frequencia: "SOS", se_necessario: true } },
  { id: "nic_desativada", tipo: "intervencao", codigo: "0000", titulo: "Intervenção desativada", unidades: [], ordem: 199, ativo: false, payload: {} },
];

const idx = indexarCatalogo(CATALOGO);
const dxDor = idx.porId.get("dx_dor_aguda");

describe("catálogo — índice e filtros", () => {
  it("separa diagnósticos e intervenções e ignora inativos", () => {
    expect(idx.diagnosticos).toHaveLength(10);
    expect(idx.intervencoes).toHaveLength(4);          // a desativada some
    expect(idx.porId.has("nic_desativada")).toBe(false);
  });

  it("filtra por unidade (item sem unidades = todas)", () => {
    const peds = diagnosticosDaUnidade(idx, "peds").map(d => d.id);
    expect(peds).toContain("dx_risco_queda_crianca");
    expect(peds).toContain("dx_risco_integridade_pele");  // unidades: [] → universal
    expect(peds).not.toContain("dx_amamentacao_ineficaz");
    const obst = diagnosticosDaUnidade(idx, "obst").map(d => d.id);
    expect(obst).toContain("dx_amamentacao_ineficaz");
    expect(obst).toContain("dx_dor_aguda");
  });

  it("resolve as intervenções ligadas a um diagnóstico", () => {
    const nics = intervencoesDoDiagnostico(dxDor, idx).map(n => n.id);
    expect(nics).toEqual(["nic_controle_dor", "nic_monitoracao_sinais"]);
  });
});

describe("sugestão de diagnósticos a partir dos dados existentes", () => {
  it("LPP ativa sugere integridade da pele prejudicada (e não o de risco)", () => {
    const s = sugerirDiagnosticos({ lpp: [{ status: "ativa" }], escalas: [{ tipo: "braden", score: 11, nivel: "laranja", classificacao: "Risco alto" }] }, idx);
    const ids = s.map(x => x.catalogo_id);
    expect(ids).toContain("dx_integridade_pele");
    expect(ids).not.toContain("dx_risco_integridade_pele");
    expect(s.find(x => x.catalogo_id === "dx_integridade_pele").titulo).toBe("Integridade da pele prejudicada");
  });

  it("Braden em risco (sem LPP) sugere risco de integridade da pele", () => {
    const s = sugerirDiagnosticos({ escalas: [{ tipo: "braden", score: 12, nivel: "laranja", classificacao: "Risco alto" }] }, idx);
    expect(s.map(x => x.catalogo_id)).toContain("dx_risco_integridade_pele");
    expect(s[0].motivo).toMatch(/Braden 12/);
  });

  it("Morse e RASS agitação convergem no mesmo diagnóstico de queda, sem duplicar", () => {
    const s = sugerirDiagnosticos({ escalas: [
      { tipo: "morse", score: 55, nivel: "laranja", classificacao: "Risco alto" },
      { tipo: "rass", score: 2, nivel: "laranja" },
    ] }, idx);
    const quedas = s.filter(x => x.catalogo_id === "dx_risco_queda_adulto");
    expect(quedas).toHaveLength(1);
  });

  it("pediátrico troca a queda de adulto pela de criança", () => {
    const s = sugerirDiagnosticos({ escalas: [{ tipo: "morse", score: 55, nivel: "laranja" }] }, idx, { pediatrico: true });
    expect(s.map(x => x.catalogo_id)).toContain("dx_risco_queda_crianca");
    expect(s.map(x => x.catalogo_id)).not.toContain("dx_risco_queda_adulto");
  });

  it("dor >= 4, sinais e temperatura viram diagnósticos", () => {
    const s = sugerirDiagnosticos({
      escalas: [{ tipo: "dor", score: 7 }],
      sinais: [{ spo2: 90, fr: 28, temp: 38.2, aferido_em: "2026-07-28T10:00:00Z" }],
    }, idx);
    const ids = s.map(x => x.catalogo_id);
    expect(ids).toContain("dx_dor_aguda");
    expect(ids).toContain("dx_padrao_respiratorio");
    expect(ids).toContain("dx_hipertermia");
  });

  it("não sugere o que não está no catálogo ativo", () => {
    const s = sugerirDiagnosticos({ lpp: [{ status: "ativa" }] }, indexarCatalogo([]));
    expect(s).toHaveLength(0);
  });

  it("usa a aferição mais recente da escala", () => {
    const escalas = [
      { tipo: "dor", score: 8, aferido_em: "2026-07-28T08:00:00Z" },
      { tipo: "dor", score: 1, aferido_em: "2026-07-28T14:00:00Z" },
    ];
    expect(ultimaEscala(escalas, "dor").score).toBe(1);
    expect(sugerirDiagnosticos({ escalas }, idx).map(x => x.catalogo_id)).not.toContain("dx_dor_aguda");
  });
});

describe("aprazamento do cuidado", () => {
  const base = new Date(2026, 6, 28, 0, 0, 0);
  it("6/6h a partir das 06h gera 4 horários incluindo a meia-noite", () => {
    expect(aprazarItem({ frequencia_dia: 4 }, base, 6)).toEqual(["06:00", "12:00", "18:00", "00:00"]);
  });
  it("2/2h gera 12 horários", () => {
    const h = aprazarItem({ frequencia_dia: 12 }, base, 6);
    expect(h).toHaveLength(12);
    expect(h[0]).toBe("06:00");
  });
  it("SOS e sem frequência não geram horário", () => {
    expect(aprazarItem({ se_necessario: true }, base, 6)).toEqual([]);
    expect(aprazarItem({ frequencia_dia: null }, base, 6)).toEqual([]);
  });
});

describe("montagem da prescrição a partir dos diagnósticos", () => {
  it("puxa as intervenções ligadas, com aprazamento, e deduplica", () => {
    const itens = montarItensPrescricao([dxDor, idx.porId.get("dx_integridade_pele")], idx, { dataBase: new Date(2026, 6, 28), horaAncora: 6 });
    const codigos = itens.map(i => i.catalogo_id);
    // dor → controle_dor + monitoracao_sinais; pele → prevencao_lpp + monitoracao_sinais (já visto)
    expect(codigos).toEqual(["nic_controle_dor", "nic_monitoracao_sinais", "nic_prevencao_lpp"]);
    const dorItem = itens[0];
    expect(dorItem.descricao).toBe("Controle da dor");
    expect(dorItem.horarios).toEqual(["06:00", "12:00", "18:00", "00:00"]);
    expect(dorItem.detalhe).toMatch(/Avaliar a dor/);
  });
});

describe("checagem à beira-leito × aprazamento", () => {
  const competencia = new Date(2026, 6, 28);
  const item = { id: "i1", horarios: ["06:00", "12:00"], se_necessario: false };

  it("casa a checagem realizada com o horário e aponta o atraso do próximo", () => {
    const checagens = [{ item_id: "i1", status: "realizado", executado_em: new Date(2026, 6, 28, 6, 10).toISOString() }];
    const slots = checarCuidados(item, checagens, { competencia, agora: new Date(2026, 6, 28, 13, 30) });
    expect(slots[0].administrado).toBe(true);
    expect(slots[1].administrado).toBe(false);
    expect(slots[1].atrasado).toBe(true);
  });

  it("SOS não tem horário a checar", () => {
    expect(checarCuidados({ id: "x", se_necessario: true }, [], { competencia })).toEqual([]);
  });

  it("horariosParaData ancora os horários no dia da competência", () => {
    const ds = horariosParaData(["06:00", "18:30"], competencia);
    expect(ds[0].getHours()).toBe(6);
    expect(ds[1].getHours()).toBe(18);
    expect(ds[1].getMinutes()).toBe(30);
  });
});

describe("resumo da SAE", () => {
  it("conta diagnósticos ativos, cuidados e o estado da checagem do dia", () => {
    const r = resumoSae({
      diagnosticos: [{ status: "ativo" }, { status: "resolvido" }, { status: "ativo" }],
      itens: [{ id: "i1", horarios: ["06:00", "12:00"], se_necessario: false }],
      checagens: [{ item_id: "i1", status: "realizado", executado_em: new Date(2026, 6, 28, 6, 10).toISOString() }],
    }, { competencia: new Date(2026, 6, 28), agora: new Date(2026, 6, 28, 13, 30) });
    expect(r.diagnosticosAtivos).toBe(2);
    expect(r.cuidados).toBe(1);
    expect(r.checagensAtrasadas).toBe(1);
    expect(r.checagensPendentes).toBe(0);
  });
});
