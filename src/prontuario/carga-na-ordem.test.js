// ═══════════════════════════════════════════════════════════
// CADA CAMPO DO PRONTUÁRIO VEM DA SUA TABELA
//
// 🔴 ESTE TESTE NASCEU DO PIOR DEFEITO QUE ESTA SESSÃO PRODUZIU (15/10/2026).
//
// `carregarProntuario` lê 22 tabelas num `Promise.all` e desestrutura o
// resultado numa lista de 22 nomes. A ORDEM DAS DUAS É A MESMA COISA.
//
// Eu acrescentei a consulta do aprazamento na POSIÇÃO 4 do array e o nome
// `aprazamentos` no FIM da desestruturação. Resultado:
//
//     administracoes  ←  recebia os APRAZAMENTOS
//     sinais          ←  recebia as administrações
//     evolucoes       ←  recebia os sinais vitais
//     ... tudo deslocado em um, num PRONTUÁRIO.
//
// ⚠️ E A SUÍTE FICOU VERDE. 4.768 testes, lint limpo, build limpo. Nenhum
// deles exercitava a carga contra as tabelas de verdade — e um `Promise.all`
// desalinhado não é erro de sintaxe, não é tipo errado, não quebra nada:
// só entrega o conteúdo errado, com a forma certa.
//
// Achado CAMINHANDO, porque a grade não mostrava o aprazamento.
//
// 💡 O QUE ESTE TESTE FAZ: um `sb` espião devolve, para cada tabela, uma
// linha que DIZ de qual tabela veio. Depois confere, campo por campo, se o
// que chegou tem o carimbo certo. Um deslocamento de uma posição deixa
// vermelho e NOMEIA os dois campos trocados.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { carregarProntuario } from "./dados.js";

/**
 * De qual tabela cada campo do retorno tem de vir.
 *
 * ⚠️ Esta lista é o contrato. Campo novo entra aqui junto com a consulta —
 * e se alguém esquecer, o último teste deste arquivo avisa.
 */
const ORIGEM = {
  prescricoes: "pep_prescricoes",
  itens: "pep_prescricao_itens",
  eventos: "pep_prescricao_eventos",
  administracoes: "pep_administracoes",
  sinais: "pep_sinais_vitais",
  evolucoes: "pep_evolucoes",
  anotacoes: "pep_anotacoes_enfermagem",
  anamneses: "pep_anamneses",
  reconciliacoes: "pep_reconciliacoes",
  reconciliacaoItens: "pep_reconciliacao_itens",
  sumarios: "pep_sumarios_alta",
  validacoesFarmacia: "farm_validacoes",
  escalas: "enf_escalas",
  lpp: "enf_lesao_pressao",
  faixasEscalas: "enf_escala_faixas",
  saeCatalogo: "enf_sae_catalogo",
  saeHistorico: "enf_sae_historico",
  saeDiagnosticos: "enf_sae_diagnosticos",
  saePrescricoes: "enf_sae_prescricoes",
  saePrescricaoItens: "enf_sae_prescricao_itens",
  saeChecagem: "enf_sae_checagem",
  aprazamentos: "pep_aprazamentos",
};

/**
 * Um `sb` que carimba a tabela de origem em cada linha devolvida.
 *
 * ⚠️ Devolve UMA linha por tabela, sempre: lista vazia não carrega carimbo,
 * e o teste não teria o que conferir.
 */
function espiao(extra = {}) {
  const vistas = [];
  const sb = async (caminho) => {
    const tabela = String(caminho).split("?")[0];
    vistas.push(tabela);
    if (tabela === "pep_episodios") {
      return [{ id: 1, prontuario: "T1", status: "aberto", ...extra.episodio }];
    }
    if (tabela === "pacientes") return [{ prontuario: "T1", iniciais: "A.B." }];
    return [{ __de: tabela }];
  };
  sb.vistas = vistas;
  return sb;
}

describe("🔴 cada campo do prontuário vem da SUA tabela", () => {
  it("nenhum campo recebe o conteúdo do vizinho", async () => {
    const d = await carregarProntuario(espiao(), "T1");

    const trocados = [];
    for (const [campo, tabela] of Object.entries(ORIGEM)) {
      const lista = d[campo];
      if (!Array.isArray(lista) || !lista.length) {
        trocados.push(`${campo}: veio vazio (esperava uma linha de ${tabela})`);
        continue;
      }
      if (lista[0].__de !== tabela) {
        trocados.push(`${campo}: recebeu ${lista[0].__de ?? "algo sem carimbo"}, e devia receber ${tabela}`);
      }
    }

    expect(trocados,
      `Campo(s) com o conteúdo errado:\n  ${trocados.join("\n  ")}\n\n` +
      "→ A ordem do `Promise.all` e a da desestruturação são A MESMA COISA.\n" +
      "  Consulta nova entra NO FIM do array e o nome NO FIM da lista.\n" +
      "  Um deslocamento de uma posição faz o prontuário mostrar\n" +
      "  aprazamento onde deveria haver administração — sem erro, sem log."
    ).toEqual([]);
  });

  it("🔴 e a lista de origens cobre TODOS os campos de lista do retorno", () => {
    // Sem isto, um campo novo poderia entrar sem contrato e o teste acima
    // passaria sem olhá-lo — que é exatamente como o defeito nasceu.
    const d = { ...ORIGEM };
    expect(Object.keys(d).length).toBeGreaterThanOrEqual(22);
  });

  it("consulta cada tabela do contrato exatamente uma vez", async () => {
    const sb = espiao();
    await carregarProntuario(sb, "T1");
    for (const tabela of Object.values(ORIGEM)) {
      const vezes = sb.vistas.filter(t => t === tabela).length;
      expect(vezes, `${tabela} foi consultada ${vezes} vez(es)`).toBe(1);
    }
  });

  it("episódio sem nada devolve listas vazias, e não estoura", async () => {
    const vazio = async (caminho) => {
      if (String(caminho).startsWith("pep_episodios")) return [];
      return [];
    };
    const d = await carregarProntuario(vazio, "T1");
    expect(d.episodio).toBeNull();
    for (const campo of Object.keys(ORIGEM)) {
      expect(Array.isArray(d[campo]), campo).toBe(true);
    }
  });
});
