// ═══════════════════════════════════════════════════════════
// O CICLO DE VIDA DO ATENDIMENTO
//
// Quatro regras aqui protegem defeito que já aconteceu ou que faria dano
// irreversível:
//
//   1. "ABERTO" MORA NUM LUGAR SÓ. O sistema tinha `status !== 'finalizado'`
//      espalhado em quatro pontos — inclusive dentro do Paciente 360. Um
//      status novo por fora faria o resumo dizer "está no PS agora
//      (cancelado)".
//   2. STATUS DESCONHECIDO CONTA COMO ABERTO. Errar mostrando é recuperável;
//      errar escondendo não — ninguém procura o que não sabe que existe.
//   3. O PACIENTE NÃO É CORRIGÍVEL. Trocar o prontuário faria evolução e
//      prescrição mudarem de dono sem rastro.
//   4. ATENDIMENTO COM REGISTRO CLÍNICO NÃO SE CANCELA. Cancelar deixaria
//      registro órfão apontando para um episódio que o sistema nega.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  STATUS_ATENDIMENTO, atendimentoAberto, FILTRO_ATENDIMENTO_ABERTO,
  DESFECHOS_AMBULATORIAL, validarEncerramento,
  CAMPOS_CORRIGIVEIS, validarCorrecao, camposDaCorrecao, validarCancelamento,
  filaDoAmbulatorio, minutosEntre, validarChamada,
} from "./ciclo.js";

const ABERTO = { id: 7, status: "aguardando_atendimento", prontuario: "100001" };

describe("o que conta como aberto", () => {
  it("as três fases de andamento estão abertas", () => {
    for (const s of ["aguardando_triagem", "aguardando_atendimento", "em_atendimento"]) {
      expect(atendimentoAberto({ status: s }), s).toBe(true);
    }
  });

  it("finalizado e cancelado estão fechados", () => {
    expect(atendimentoAberto({ status: "finalizado" })).toBe(false);
    expect(atendimentoAberto({ status: "cancelado" })).toBe(false);
  });

  it("status desconhecido conta como ABERTO — errar escondendo é pior", () => {
    expect(atendimentoAberto({ status: "invencao_futura" })).toBe(true);
    expect(atendimentoAberto({})).toBe(true);
    expect(atendimentoAberto(null)).toBe(true);
  });

  it("o filtro SQL exclui os dois estados fechados, não só finalizado", () => {
    // Era o `neq.finalizado` que deixava o cancelado passar por aberto.
    expect(FILTRO_ATENDIMENTO_ABERTO).toContain("finalizado");
    expect(FILTRO_ATENDIMENTO_ABERTO).toContain("cancelado");
    expect(FILTRO_ATENDIMENTO_ABERTO).not.toContain("neq");
  });

  it("o catálogo e o filtro contam a mesma história", () => {
    const fechados = Object.entries(STATUS_ATENDIMENTO)
      .filter(([, v]) => !v.aberto).map(([k]) => k);
    for (const f of fechados) expect(FILTRO_ATENDIMENTO_ABERTO).toContain(f);
  });
});

describe("encerramento do ambulatorial", () => {
  it("encerra com desfecho válido", () => {
    for (const d of DESFECHOS_AMBULATORIAL) {
      expect(validarEncerramento({ atendimento: ABERTO, desfecho: d.chave }).ok, d.chave).toBe(true);
    }
  });

  it("exige desfecho", () => {
    expect(validarEncerramento({ atendimento: ABERTO }).ok).toBe(false);
    expect(validarEncerramento({ atendimento: ABERTO, desfecho: "chute" }).ok).toBe(false);
  });

  it("não encerra o que já está fechado", () => {
    const r = validarEncerramento({ atendimento: { ...ABERTO, status: "finalizado" }, desfecho: "atendido" });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/já está/);
  });

  it("sem atendimento não passa", () => {
    expect(validarEncerramento({ desfecho: "atendido" }).ok).toBe(false);
  });
});

describe("correção", () => {
  it("corrige campo administrativo", () => {
    const r = validarCorrecao({ atendimento: ABERTO, campos: { convenio_id: 2, carteira: "998877" } });
    expect(r.ok).toBe(true);
  });

  it("RECUSA trocar o paciente — e explica o porquê", () => {
    const r = validarCorrecao({ atendimento: ABERTO, campos: { prontuario: "200002" } });
    expect(r.ok).toBe(false);
    const t = r.erros.join(" ");
    expect(t).toMatch(/não pode ser trocado/);
    expect(t).toMatch(/pertencer a outra pessoa/);
    expect(t).toMatch(/cancele este atendimento e abra outro/);
  });

  it("recusa campo clínico", () => {
    for (const campo of ["classificacao", "desfecho", "pa_sist", "temp", "status"]) {
      const r = validarCorrecao({ atendimento: ABERTO, campos: { [campo]: "x" } });
      expect(r.ok, campo).toBe(false);
      expect(r.erros.join(" ")).toMatch(/não são corrigíveis/);
    }
  });

  it("recusa corrigir atendimento cancelado", () => {
    const r = validarCorrecao({ atendimento: { ...ABERTO, status: "cancelado" }, campos: { carteira: "1" } });
    expect(r.ok).toBe(false);
  });

  it("corrigir atendimento ENCERRADO passa, com aviso sobre a conta", () => {
    // O convênio errado só aparece quando a conta é montada, dias depois.
    const r = validarCorrecao({ atendimento: { ...ABERTO, status: "finalizado" }, campos: { convenio_id: 3 } });
    expect(r.ok).toBe(true);
    expect(r.avisos.join(" ")).toMatch(/conta dele ainda não foi fechada/);
  });

  it("nada a corrigir não passa", () => {
    expect(validarCorrecao({ atendimento: ABERTO, campos: {} }).ok).toBe(false);
  });

  it("o corpo leva só campo permitido, mesmo sem validar antes", () => {
    const c = camposDaCorrecao({ convenio_id: 2, prontuario: "999", classificacao: "vermelho", status: "cancelado" });
    expect(c.convenio_id).toBe(2);
    expect(c.prontuario).toBeUndefined();
    expect(c.classificacao).toBeUndefined();
    expect(c.status).toBeUndefined();
  });

  it("campo em branco vira null, e acidente de trabalho é booleano", () => {
    const c = camposDaCorrecao({ carteira: "  ", cid: "", acidente_trabalho: "sim" });
    expect(c.carteira).toBeNull();
    expect(c.cid).toBeNull();
    expect(c.acidente_trabalho).toBe(false);
  });

  it("o prontuário nunca está na lista de corrigíveis", () => {
    expect(CAMPOS_CORRIGIVEIS).not.toContain("prontuario");
    expect(CAMPOS_CORRIGIVEIS).not.toContain("status");
    expect(CAMPOS_CORRIGIVEIS).not.toContain("classificacao");
  });
});

describe("cancelamento", () => {
  const motivo = "aberto em duplicidade por engano";

  it("cancela atendimento vazio com motivo", () => {
    expect(validarCancelamento({ atendimento: ABERTO, motivo, registrosClinicos: 0 }).ok).toBe(true);
  });

  it("exige motivo, e motivo que explique algo", () => {
    expect(validarCancelamento({ atendimento: ABERTO, motivo: "" }).ok).toBe(false);
    expect(validarCancelamento({ atendimento: ABERTO, motivo: "   " }).ok).toBe(false);
    const curto = validarCancelamento({ atendimento: ABERTO, motivo: "erro" });
    expect(curto.ok).toBe(false);
    expect(curto.erros.join(" ")).toMatch(/curto demais/);
  });

  it("RECUSA cancelar atendimento com registro clínico — e diz o caminho certo", () => {
    const r = validarCancelamento({ atendimento: ABERTO, motivo, registrosClinicos: 3 });
    expect(r.ok).toBe(false);
    const t = r.erros.join(" ");
    expect(t).toMatch(/3 registro/);
    expect(t).toMatch(/encerrar com desfecho/);
  });

  it("não cancela duas vezes", () => {
    const r = validarCancelamento({ atendimento: { ...ABERTO, status: "cancelado" }, motivo });
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/já está cancelado/);
  });

  it("cancelar depois de encerrado passa, com aviso sobre a produção", () => {
    const r = validarCancelamento({ atendimento: { ...ABERTO, status: "finalizado" }, motivo });
    expect(r.ok).toBe(true);
    expect(r.avisos.join(" ")).toMatch(/produção do dia/);
  });

  it("sem atendimento não passa", () => {
    expect(validarCancelamento({ motivo }).ok).toBe(false);
  });
});

// 🔴 Confirmada a presença, nascia um atendimento `aguardando_atendimento`
// que é excluído do painel do PS (lá o filtro é só emergência, e está certo)
// e não aparecia em NENHUMA outra tela. O paciente ficava num limbo: presente
// no sistema, invisível para todo mundo. A recepção respondia "quanto falta?"
// de cabeça, e o atraso do médico não deixava rastro.
describe("a fila viva do ambulatório", () => {
  const T = h => `2026-08-24T${String(h).padStart(2, "0")}:00:00Z`;
  const agora = new Date(T(10));

  it("conta a espera da chegada até agora, e põe quem espera mais na frente", () => {
    const r = filaDoAmbulatorio([
      { id: 1, status: "aguardando_atendimento", chegada_em: T(9) },
      { id: 2, status: "aguardando_atendimento", chegada_em: T(8) },
    ], { agora });
    expect(r.esperando.map(a => a.id)).toEqual([2, 1]);
    expect(r.esperando[0].esperaMin).toBe(120);
    expect(r.esperando[1].esperaMin).toBe(60);
  });

  it("quem já foi chamado tem o relógio PARADO na chamada", () => {
    // Contar até agora faria a média de espera crescer junto com a duração
    // da consulta — que é outra coisa.
    const r = filaDoAmbulatorio([
      { id: 3, status: "em_atendimento", chegada_em: T(8), atendimento_em: T(9) },
    ], { agora });
    expect(r.emAtendimento[0].esperaMin).toBe(60);
    expect(r.esperando).toEqual([]);
  });

  it("encerrado e cancelado saem da fila", () => {
    const r = filaDoAmbulatorio([
      { id: 4, status: "finalizado", chegada_em: T(8) },
      { id: 5, status: "cancelado", chegada_em: T(8) },
      { id: 6, status: "aguardando_atendimento", chegada_em: T(9) },
    ], { agora });
    expect(r.esperando.map(a => a.id)).toEqual([6]);
    expect(r.emAtendimento).toEqual([]);
  });

  it("sem hora de chegada a espera é null, não zero", () => {
    // Zero para quem espera há uma hora é pior que relógio nenhum.
    const r = filaDoAmbulatorio([{ id: 7, status: "aguardando_atendimento" }], { agora });
    expect(r.esperando[0].esperaMin).toBeNull();
  });

  it("lista vazia ou nula não quebra", () => {
    expect(filaDoAmbulatorio([], { agora })).toEqual({ esperando: [], emAtendimento: [] });
    expect(filaDoAmbulatorio(null, { agora }).esperando).toEqual([]);
  });

  it("minutosEntre recusa o impossível em vez de devolver negativo", () => {
    expect(minutosEntre(T(9), T(10))).toBe(60);
    expect(minutosEntre(T(10), T(9))).toBeNull();
    expect(minutosEntre(null, T(9))).toBeNull();
    expect(minutosEntre("banana", T(9))).toBeNull();
  });

  it("chamar duas vezes é recusado — e diz por quê", () => {
    expect(validarChamada({ id: 1, status: "aguardando_atendimento" }).ok).toBe(true);
    const r = validarChamada({ id: 1, status: "em_atendimento" });
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/já foi chamado/i);
    expect(validarChamada({ id: 1, status: "finalizado" }).ok).toBe(false);
    expect(validarChamada(null).ok).toBe(false);
  });
});
