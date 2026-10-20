// @vitest-environment node
// ═══════════════════════════════════════════════════════════
// O MÓDULO CONSEGUE LER O QUE A TELA DELE MOSTRA?
//
// 🔴 ESTA É A PERGUNTA QUE PEGA BUG, e a catraca da #291 não a faz.
//
// Aquela pergunta "existe política de SELECT nesta tabela?" — e a resposta
// é sempre sim. Esta pergunta se o MÓDULO que abre a tela está entre os
// leitores. Importa porque o sistema é vendido por módulo, e porque os
// perfis já existentes não têm todos os módulos.
//
// Quando não está: `[]` com 200. Lista vazia, sem erro. E vazio, numa
// tela, lê-se "não há nada".
//
// ⚠️ A LISTA ABAIXO É DÍVIDA CONHECIDA, NÃO APROVAÇÃO. São 26 pares que
// já existem hoje; 13 deles atingem perfil REAL (ver o comentário de cada
// bloco). O papel desta catraca é impedir o 27º — e encolher a lista.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import path from "node:path";
import { telasDoApp, tabelasPorModulo, furosDeModulo } from "./leitura-por-modulo.mjs";
import { MAPA_TABELAS, LEITURA_EXTRA, TODOS, leitoresDe } from "../src/acesso/mapa-tabelas.js";

const SRC = path.join(path.resolve(__dirname), "..", "src");

/** Os módulos que o menu oferece — todos precisam ser alcançados. */
const MODULOS_COM_TELA = [
  "atendimento", "auditoria", "bloco", "executivo", "farmacia", "faturamento",
  "import", "leitos", "maternidade", "nsp", "overview", "paciente", "print",
  "protocolos", "ps", "scih", "suprimentos", "users",
];

/**
 * 🔴 DÍVIDA CONHECIDA — cada linha é uma tela que pode mostrar lista vazia.
 *
 * O "atinge" é o perfil REAL que hoje tem o módulo e nenhum dos leitores:
 * esses são defeito vivo, não risco futuro. Os sem "atinge" só aparecem
 * quando o módulo for vendido sozinho — que é o plano do produto.
 */
const CONHECIDOS = [
  // ── TORRE DE COMANDO: lê de nove módulos, por desenho ───────
  //
  // Nenhum perfil atual é atingido: quem tem `executivo` hoje tem todos
  // os outros. Vira defeito no dia em que a Torre for vendida sozinha — e
  // ela é o painel da direção, onde zero se lê como "está tudo certo".
  //
  // 🔒 NÃO AMPLIADO DE PROPÓSITO (20/10/2026). A Torre lê `prontuario` e
  // `iniciais` em `cc_cirurgias` e `ag_agendamentos` — identificador de
  // paciente — e os cartões dela são CONTAGEM. A pergunta antes de
  // ampliar é se ela precisa da LINHA ou de um agregado. E é tela nova,
  // da Laura, com PR aberta: mexer agora atropelaria o trabalho dela.
  "executivo → ag_agendamentos (leem: atendimento)",
  "executivo → ag_grades (leem: atendimento)",
  "executivo → cc_cirurgias (leem: bloco, paciente, faturamento)",
  "executivo → farm_lotes (leem: farmacia, suprimentos)",
  "executivo → leitos (leem: leitos, paciente, scih, ps, faturamento, overview)",
  "executivo → leitos_saidas (leem: leitos, paciente, ps, faturamento, overview)",
  "executivo → sup_itens (leem: suprimentos, farmacia, bloco)",
  "executivo → sup_lotes (leem: suprimentos)",

  // ── ESTOQUE & COMPRAS × CONTROLADOS ────────────────────────
  //
  // 🔴 Atinge `almoxarifado` e `matriz` hoje — e mesmo assim fica.
  //
  // A MESMA tabela guarda movimento de medicamento CONTROLADO (por isso
  // `controlados` está entre os leitores). Dar essa visibilidade ao
  // almoxarifado não é ajuste de permissão, é decisão de CUSTÓDIA —
  // Portaria 344/98. Quem decide o fluxo de controlados no hospital
  // decide esta linha.
  "suprimentos → farm_movimentos (leem: farmacia, controlados, ps)",

  // ── FARMÁCIA × IDENTIFICAÇÃO DO PACIENTE ───────────────────
  //
  // 🔴 Atinge `aux_farmacia` hoje, E TEM CONSEQUÊNCIA CLÍNICA: a farmácia
  // lê `pacientes?select=prontuario,data_nascimento` só para ter a IDADE,
  // que aciona dose pediátrica e critérios de Beers. Vindo vazio, a idade
  // fica nula e as regras de criança e de idoso NÃO DISPARAM — o mesmo
  // defeito que `contexto-internado.js` foi escrito para consertar.
  //
  // ⚠️ FICA NA LISTA DE PROPÓSITO. Abrir `pacientes` entregaria nome, CPF,
  // CNS, nome da mãe e endereço para buscar UM campo. O conserto é levar
  // `data_nascimento` para `pep_episodios`, que a farmácia já lê — e aí
  // esta leitura SOME em vez de ser permitida.
  "farmacia → pacientes (leem: atendimento, ambulatorio, ps, paciente)",
];

const leitores = t => (MAPA_TABELAS[t] ? leitoresDe(t, MAPA_TABELAS, LEITURA_EXTRA) : null);

describe("🔴 o módulo lê o que a tela dele mostra", () => {
  it("toda tela do menu é alcançada — sem ponto cego", () => {
    // ⚠️ Módulo que o analisador não alcança não é "sem furo": é módulo
    // NÃO OLHADO. Já aconteceu duas vezes enquanto eu construía isto:
    // `&&` aninhado escondeu cinco, e import nomeado escondeu três.
    const telas = telasDoApp(SRC);
    const faltando = MODULOS_COM_TELA.filter(m => !telas.has(m));
    expect(faltando,
      `módulos cuja tela o analisador não achou: ${faltando.join(", ")}\n` +
      "→ confira o padrão de montagem no App.jsx (lazy? import nomeado? `&&` aninhado?)."
    ).toEqual([]);
  });

  it("nenhuma referência ficou sem resolver", async () => {
    // "Não consegui seguir" não vira "não lê nada": seria falso verde.
    const { naoResolvidos } = tabelasPorModulo(SRC);
    expect(naoResolvidos,
      `o analisador não soube seguir:\n  ${naoResolvidos.join("\n  ")}`).toEqual([]);
  });

  it("🔴 nenhum par NOVO de módulo-que-não-pode-ler", () => {
    const { porModulo } = tabelasPorModulo(SRC);
    const furos = furosDeModulo(porModulo, leitores, TODOS);

    const novos = furos.filter(f => !CONHECIDOS.includes(f));
    expect(novos,
      `🔴 TELA NOVA QUE VAI MOSTRAR LISTA VAZIA, SEM ERRO:\n  ${novos.join("\n  ")}\n\n` +
      "→ ou o módulo entra como leitor da tabela em src/acesso/mapa-tabelas.js\n" +
      "  (LEITURA_EXTRA), ou a tela não devia estar lendo aquilo."
    ).toEqual([]);

    // 🔴 E A DÍVIDA TEM DE ENCOLHER, NÃO SÓ PARAR DE CRESCER. Quando um par
    // for consertado, este teste cobra a remoção da linha — é o mesmo
    // mecanismo de `colunas-sem-input`, que já pegou dívida quitada que
    // ninguém tinha apagado da lista.
    const quitados = CONHECIDOS.filter(c => !furos.includes(c));
    expect(quitados,
      `estes pares foram consertados — tire-os de CONHECIDOS:\n  ${quitados.join("\n  ")}`
    ).toEqual([]);
  });
});

describe("a precisão do analisador", () => {
  it("🔴 por FUNÇÃO, não por arquivo — é o que separa 26 de 158", () => {
    // A primeira versão seguia imports no nível de arquivo e acusava 158
    // pares, quase todos falsos: a tela do Faturamento importa UMA função
    // de `atendimento/dados.js` e era creditada com todas as tabelas que
    // aquele arquivo lê — a agenda inteira, entre elas.
    const { porModulo } = tabelasPorModulo(SRC);
    const fat = porModulo.get("faturamento");
    expect(fat, "o módulo faturamento sumiu do mapa").toBeTruthy();
    expect([...fat]).toContain("at_conta_itens");      // isso ele lê mesmo
    expect([...fat]).not.toContain("ag_bloqueios");    // isso é da agenda
  });

  it("acha as telas montadas por `lazy` e as importadas direto", () => {
    const telas = telasDoApp(SRC);
    // `faturamento` entra por lazy; `overview` por import nomeado de
    // `painel/Painel.jsx`, que guarda várias telas.
    expect([...telas.get("faturamento").values()].some(x => /FaturamentoSus/.test(x.arquivo))).toBe(true);
    const over = [...telas.get("overview").values()];
    expect(over.some(x => /Painel/.test(x.arquivo) && x.nome === "Overview")).toBe(true);
  });

  it("🔴 do arquivo compartilhado vem só o símbolo, não o arquivo inteiro", () => {
    // `Painel.jsx` guarda Overview, PrintDashboard e ImportPage. Pegar o
    // arquivo daria a cada um as tabelas dos outros dois.
    const telas = telasDoApp(SRC);
    for (const m of ["overview", "print", "import"]) {
      const alvos = [...telas.get(m).values()].filter(x => /Painel/.test(x.arquivo));
      expect(alvos.every(x => x.nome !== "*"), `${m} puxaria o Painel inteiro`).toBe(true);
    }
  });

  it("escrita não conta como leitura", () => {
    // `sb(x, { method: "POST" })` é escrita, e quem cobra política de
    // escrita é a outra catraca.
    const { porModulo } = tabelasPorModulo(SRC);
    expect(porModulo.size).toBe(MODULOS_COM_TELA.length);
    for (const tabelas of porModulo.values()) expect(tabelas.has("rpc")).toBe(false);
  });
});
