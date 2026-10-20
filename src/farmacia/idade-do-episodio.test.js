// ═══════════════════════════════════════════════════════════
// A IDADE CHEGA À FARMÁCIA SEM ABRIR O CADASTRO DO PACIENTE
//
// 🔴 O QUE ESTE TESTE GUARDA, em uma frase: quem dispensa recebe os
// alertas de dose pediátrica e de Beers mesmo SEM o módulo Paciente 360.
//
// Antes, a idade vinha de `pacientes` — um campo de uma tabela que a
// farmácia não lê. A tela era honesta: só pedia o contexto para quem
// tinha o módulo, e avisava os outros de que a conferência era PARCIAL.
// Honesto, e ainda assim parcial: o auxiliar que entrega o medicamento
// ficava sem as duas regras que dependem de idade.
//
// Agora a data vem no próprio episódio, mantida por gatilho. É MENOS
// acesso, não mais: a consulta ao cadastro sumiu do código da farmácia.
//
// ⚠️ ESTE ARQUIVO NÃO TESTA O GATILHO — isso é `supabase/
// episodio-data-nascimento.test.js`, que roda o SQL num Postgres de
// verdade. Aqui é o caminho do dado até a regra.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { contextoDoInternado } from "../prontuario/contexto-internado.js";
import { loadCondicoesDosInternados } from "./dados.js";

/** Como a tela monta o paciente agora: a partir da linha do episódio. */
const pacienteDoEpisodio = ep => ({
  prontuario: ep.prontuario,
  data_nascimento: ep.data_nascimento ?? null,
});

const HOJE = new Date("2026-10-20T12:00:00Z");

describe("🔴 a idade sai do episódio, não do cadastro", () => {
  it("idoso: a regra de Beers tem a idade para disparar", () => {
    const ep = { prontuario: "P1", data_nascimento: "1940-01-01" };
    const ctx = contextoDoInternado({ paciente: pacienteDoEpisodio(ep) }, HOJE);
    expect(ctx.idade).toBe(86);
  });

  it("criança: a regra pediátrica tem a idade para disparar", () => {
    const ep = { prontuario: "P2", data_nascimento: "2024-06-15" };
    const ctx = contextoDoInternado({ paciente: pacienteDoEpisodio(ep) }, HOJE);
    expect(ctx.idade).toBe(2);
  });

  it("🔴 episódio SEM data devolve idade nula — e nulo não é zero", () => {
    // Zero faria a regra pediátrica disparar em todo mundo sem cadastro
    // completo. Nulo faz o motor dizer que não sabe, que é o certo.
    const ctx = contextoDoInternado({ paciente: pacienteDoEpisodio({ prontuario: "P3" }) }, HOJE);
    expect(ctx.idade).toBeNull();
  });

  it("a sonda continua vindo das condições", () => {
    const ctx = contextoDoInternado({
      paciente: pacienteDoEpisodio({ prontuario: "P4", data_nascimento: "1960-01-01" }),
      condicoes: [{ descricao: "Sonda nasoenteral" }],
    }, HOJE);
    expect(ctx.em_sonda).toBe(true);
    expect(ctx.idade).toBe(66);
  });
});

describe("🔴 a farmácia não consulta mais `pacientes`", () => {
  it("carregar condições toca `pep_condicoes` e mais nada", async () => {
    const vistas = [];
    const sb = async caminho => { vistas.push(String(caminho).split("?")[0]); return []; };
    await loadCondicoesDosInternados(sb, ["P1", "P2"]);
    expect(vistas).toEqual(["pep_condicoes"]);
    expect(vistas, "voltou a consultar a tabela de identificação").not.toContain("pacientes");
  });

  it("sem prontuário nenhum não consulta nada", async () => {
    const vistas = [];
    const sb = async c => { vistas.push(c); return []; };
    const r = await loadCondicoesDosInternados(sb, []);
    expect(vistas).toEqual([]);
    expect(r.condicoes).toEqual([]);
  });

  it("🔴 leitura que falhou atravessa como FALHA, não como lista vazia", async () => {
    // Se virasse `[]`, a tela diria "sem condições" — e aí a regra de não
    // triturar some em paciente com sonda.
    const { naoDeuParaLer } = await import("../util/leitura.js");
    const r = await loadCondicoesDosInternados(async () => null, ["P1"]);
    expect(naoDeuParaLer(r.condicoes)).toBe(true);
  });
});
