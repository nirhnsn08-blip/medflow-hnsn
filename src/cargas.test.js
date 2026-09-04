// ═══════════════════════════════════════════════════════════
// A CATRACA DAS CARGAS
//
// 🔴 ESTE TESTE EXISTE POR CAUSA DA FAMÍLIA DE DEFEITO QUE MAIS APARECEU
// NESTE SISTEMA: ausência de dado renderizada como boa notícia.
//
//     const rows = await sb("farm_lotes?select=*");
//     return Array.isArray(rows) ? rows : [];   // ← a mentira
//
// A rede caiu, `sb` devolveu `null`, e a tela diz "nenhum lote vencendo".
// Ninguém vê erro. Ninguém vê log. Nenhum teste fica vermelho. Só a frase
// na tela é falsa — e alguém decide em cima dela.
//
// Foram 105 cargas assim, convertidas de uma vez para `listaLida()`
// (src/util/leitura.js). Este teste impede que a 106ª nasça.
//
// ⚠️ ELE NÃO PROVA QUE A TELA AVISA. Prova que a informação não é mais
// DESTRUÍDA na carga. Avisar é decisão de cada tela, e a lista de quem já
// avisa está no fim deste arquivo.
//
// ── se este teste ficar vermelho ────────────────────────────
// Ele vai dizer o arquivo e a linha. Duas saídas, as duas honestas:
//   1. trocar por `listaLida(x)` — quase sempre é isso
//   2. se for guarda de PARÂMETRO (o valor não veio da rede), o censo
//      classifica sozinho como `param` e nem chega aqui
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { censo, atalhosEscondidos } from "../scripts/cargas.mjs";

const TODOS = censo().filter(x => x.arquivo !== "src/util/leitura.js");

describe("🔴 nenhuma carga de rede colapsa falha em lista vazia", () => {
  it("`await sb(...)` nunca vira `[]` sem marca", () => {
    const rede = TODOS.filter(x => x.origem === "rede");
    const onde = rede.map(x => `\n  ${x.arquivo}:${x.linha}  ${x.texto}`).join("");
    expect(rede.length, `Carga nova colapsando falha em vazio — troque por listaLida():${onde}`).toBe(0);
  });

  it("e não sobra nenhum caso sem classificação", () => {
    // "?" quer dizer que o censo não conseguiu dizer de onde veio o valor.
    // Cada um destes foi lido a olho e está aqui com o motivo escrito.
    const OLHADOS_A_MAO = {
      // `responsaveis` é PARÂMETRO da `dadosDaFicha` — a ficha impressa
      // recebe a lista pronta de quem já leu do banco. Normalizar aqui é
      // guarda legítima, não colapso de leitura.
      "src/atendimento/impressos.js": "parâmetro de dadosDaFicha",
    };
    const duvida = TODOS.filter(x => x.origem === "?");
    for (const x of duvida) {
      expect(OLHADOS_A_MAO[x.arquivo], `sem classificação e sem motivo escrito: ${x.arquivo}:${x.linha}`).toBeTruthy();
    }
  });
});

describe("⚠️ o que continua devolvendo [] de propósito", () => {
  it("o armário do navegador — JSON corrompido não é falha de rede", () => {
    // `localStorage` que não abre é outro problema e tem outro remédio: o
    // dado local é conveniência (trilha de auditoria e giro de leitos
    // guardam cópia lá). Marcar como falha de LEITURA confundiria as duas
    // coisas, e essas listas ainda são escritas de volta — `FALHA` é
    // congelado e um `push` nele estouraria.
    const local = TODOS.filter(x => x.origem === "local");
    expect(local.map(x => x.arquivo).sort()).toEqual([
      "src/auditoria/dados.js",
      "src/leitos/dados.js",
    ]);
  });

  it("guarda de parâmetro segue sendo o normal, e é a maioria", () => {
    // `Array.isArray(x) ? x : []` num ARGUMENTO é defesa contra chamador
    // desatento, não perda de informação. Não há nada a corrigir aqui.
    const param = TODOS.filter(x => x.origem === "param");
    expect(param.length).toBeGreaterThan(40);
  });
});

// ═══════════════════════════════════════════════════════════
// O CENSO PRECISA SER CONFIÁVEL — SENÃO A CATRACA ACIMA É DECORAÇÃO
//
// 🔴 Um teste que só olha o `src/` de hoje se autodestrói: assim que as
// cargas foram convertidas, não sobrou linha nenhuma para exercitar o
// classificador. Por isso o censo é medido contra um caso ARMADO, que não
// muda quando o sistema muda.
// ═══════════════════════════════════════════════════════════

const FIXTURE = `// cabecalho
import { x } from "./x.js";

export async function cargaSimples(sb) {
  const rows = await sb("tabela?select=*");
  return Array.isArray(rows) ? rows : [];
}

export async function duasNaMesmaLinha(sb) {
  const [a, b] = await Promise.all([sb("t1"), sb("t2")]);
  return { a: Array.isArray(a) ? a : [], b: Array.isArray(b) ? b : [] };
}

export function guardaDeParametro(itens) {
  return (Array.isArray(itens) ? itens : []).length;
}

function doArmario(chave) {
  const v = JSON.parse(localStorage.getItem(chave) || "[]");
  return Array.isArray(v) ? v : [];
}
`;

describe("o censo é confiável", () => {
  let dir;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "censo-"));
    fs.mkdirSync(path.join(dir, "mod"));
    fs.writeFileSync(path.join(dir, "mod", "dados.js"), FIXTURE, "utf8");
    // um arquivo de teste, que o censo tem que ignorar
    fs.writeFileSync(path.join(dir, "mod", "dados.test.js"), FIXTURE, "utf8");
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  const achados = () => censo(dir.replace(/\\/g, "/"));

  it("🔴 acha AS DUAS ocorrências de uma linha, não só a primeira", () => {
    // Este defeito existiu de verdade: `exec` sem `g` fez o censo dizer que
    // tinha acabado quando ainda faltavam duas — e um censo que mente para
    // menos é pior que censo nenhum, porque dá alta a quem está doente.
    const naLinha = achados().filter(x => x.texto.startsWith("return { a:"));
    expect(naLinha.map(x => x.v).sort()).toEqual(["a", "b"]);
  });

  it("classifica rede, parâmetro e armário do navegador", () => {
    const por = {};
    for (const x of achados()) (por[x.origem] ||= []).push(x.v);
    expect(por.rede.sort()).toEqual(["a", "b", "rows"]);
    expect(por.param).toEqual(["itens"]);
    expect(por.local).toEqual(["v"]);
    expect(por["?"]).toBeUndefined();
  });

  it("⚠️ desestruturar `await Promise.all` conta como REDE", () => {
    // Foi assim que 17 cargas escaparam da primeira medição: o valor não
    // tem um `const x = await sb(...)` para achar, ele sai de dentro de
    // um colchete.
    expect(achados().find(x => x.v === "a").origem).toBe("rede");
  });

  it("não conta os arquivos de teste", () => {
    expect(achados().every(x => !x.arquivo.includes(".test."))).toBe(true);
  });

  it("e enxerga o sistema inteiro, não uma pasta só", () => {
    expect(new Set(TODOS.map(x => x.arquivo.split("/")[1])).size).toBeGreaterThan(8);
  });
});

// ═══════════════════════════════════════════════════════════
// O ATALHO QUE ESCONDIA A REDE DO CENSO
// ═══════════════════════════════════════════════════════════

describe("🔴 nenhum atalho de colapso em arquivo que lê da rede", () => {
  it("`const arr = x => Array.isArray(x) ? x : []` não convive com `await sb(`", () => {
    // Foi assim que as 21 listas do prontuário — `alergias` entre elas —
    // passaram batido pela primeira medição: o atalho fazia o valor de
    // rede parecer parâmetro. A regra é grosseira de propósito.
    const xs = atalhosEscondidos();
    const onde = xs.map(x => `\n  ${x.arquivo}:${x.linha}  ${x.texto}`).join("");
    expect(xs.length, `Atalho escondendo colapso de leitura — aponte para listaLida:${onde}`).toBe(0);
  });

  it("mas o atalho segue livre em módulo de regra pura", () => {
    // nsp.js, sae.js e responsavel.js normalizam PARÂMETRO e não falam com
    // banco nenhum. Proibir lá seria ruído sem defeito por trás.
    const fs2 = fs;
    for (const f of ["src/clinico/nsp.js", "src/clinico/sae.js", "src/atendimento/responsavel.js"]) {
      const txt = fs2.readFileSync(f, "utf8");
      expect(/Array\.isArray/.test(txt), f).toBe(true);
      expect(/await\s+sb\(/.test(txt), f).toBe(false);
    }
  });
});

describe("🔴 o censo lê código, não prosa", () => {
  // Em 04/09/2026 o censo acusou a própria explicação de por que o padrão é
  // proibido. Um detector que lê prosa gera falso positivo, e falso positivo
  // acaba virando lista de exceção — que é como um detector morre.

  const varrer = trecho => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "censo-"));
    fs.writeFileSync(path.join(dir, "alvo.js"), trecho);
    try { return censo(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  };

  it("🔴 linha que é SÓ comentário não vira achado", () => {
    const r = varrer([
      "// nunca escreva Array.isArray(x) ? x : [] aqui",
      " * o padrão Array.isArray(y) ? y : [] destrói a diferença",
      "const bom = listaLida(rows);",
    ].join("\n"));
    expect(r).toEqual([]);
  });

  it("🔴 mas CÓDIGO com comentário no fim continua sendo pego", () => {
    // Ali o colapso é real — só a explicação está ao lado.
    const r = varrer("const x = Array.isArray(rows) ? rows : [];   // legado");
    expect(r.length).toBe(1);
    expect(r[0].v).toBe("rows");
  });

  it("código normal continua sendo pego", () => {
    expect(varrer("const x = Array.isArray(rows) ? rows : [];").length).toBe(1);
  });
});
