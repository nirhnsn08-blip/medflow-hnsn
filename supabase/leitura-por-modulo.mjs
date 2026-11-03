// ═══════════════════════════════════════════════════════════
// O MÓDULO CONSEGUE LER O QUE A TELA DELE MOSTRA?
//
// 🔴 A PERGUNTA QUE PEGA BUG, e que a catraca da #291 não faz.
//
// Aquela pergunta "existe política de SELECT nesta tabela?" — e a resposta
// é sempre sim, porque o gerador cria `_leitura` para toda tabela. Esta
// pergunta outra coisa:
//
//     o módulo que abre a tela está entre os LEITORES daquela tabela?
//
// Importa porque o sistema é VENDIDO POR MÓDULO. Se a tela do Faturamento
// lê uma tabela que só `bloco` e `paciente` enxergam, o hospital que
// comprou Faturamento sem Bloco recebe `[]` com 200 — lista vazia, sem
// erro — e fecha a conta sem o item mais caro dela.
//
// ⚠️ POR QUE POR FUNÇÃO, E NÃO POR ARQUIVO (16/10/2026).
//
// A primeira tentativa seguiu imports no nível de ARQUIVO e acusou 158
// furos, quase todos falsos: uma tela que importa UMA função de
// `atendimento/dados.js` era creditada com todas as tabelas que aquele
// arquivo inteiro lê. Número que não serve é pior que número nenhum, porque
// quem lê a lista aprende a ignorá-la.
//
// Aqui o import é resolvido POR BINDING e o corpo é lido POR FUNÇÃO, com
// parser de verdade (espree, o do ESLint — casar chaves à mão é onde esta
// classe de ferramenta mente).
//
// 🔴 SOBRE-APROXIMAR É SEGURO; SUB-APROXIMAR NÃO É. Dentro de uma função,
// toda leitura conta. O que NÃO pode acontecer é perder um caminho e a
// catraca ficar falsamente verde — por isso referência que não resolve é
// registrada em `naoResolvidos`, e não engolida.
// ═══════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";
import * as espree from "espree";

const OPCOES = {
  ecmaVersion: "latest",
  sourceType: "module",
  ecmaFeatures: { jsx: true },
};

/** Percorre a árvore inteira chamando `fn` em cada nó. */
function andar(no, fn) {
  if (!no || typeof no !== "object") return;
  if (Array.isArray(no)) { for (const x of no) andar(x, fn); return; }
  if (typeof no.type === "string") fn(no);
  for (const k of Object.keys(no)) {
    if (k === "parent") continue;
    andar(no[k], fn);
  }
}

/** O nome da tabela na primeira posição de `sb(...)`, ou null. */
function tabelaDe(arg) {
  let texto = null;
  if (arg?.type === "Literal" && typeof arg.value === "string") texto = arg.value;
  if (arg?.type === "TemplateLiteral") texto = arg.quasis?.[0]?.value?.cooked ?? null;
  if (!texto) return null;
  const m = texto.match(/^([a-z_][a-z_0-9]*)([?/]|$)/);
  if (!m) return null;
  return m[1];
}

/** `sb(x, { method: "POST" })` é escrita; sem `method`, é leitura (GET). */
function ehEscrita(no) {
  const op = no.arguments?.[1];
  if (op?.type !== "ObjectExpression") return false;
  return op.properties.some(p =>
    (p.key?.name === "method" || p.key?.value === "method") &&
    p.value?.type === "Literal" &&
    /^(POST|PATCH|PUT|DELETE)$/.test(String(p.value.value)));
}

/** As leituras e as referências a outros símbolos dentro de um nó. */
function dentroDe(no) {
  const tabelas = new Set();
  const refs = new Set();
  andar(no, n => {
    if (n.type === "CallExpression" && n.callee?.type === "Identifier" && n.callee.name === "sb") {
      if (ehEscrita(n)) return;
      const t = tabelaDe(n.arguments?.[0]);
      // `rpc/...` não é tabela: quem lê é a função, com as políticas dela.
      if (t && t !== "rpc") tabelas.add(t);
    }
    if (n.type === "Identifier") refs.add(n.name);
    // 🔴 COMPONENTE USADO EM JSX É `JSXIdentifier`, NÃO `Identifier`.
    //
    // Sem esta linha, `<FarmInternacaoView … />` não contava como
    // referência, e a tela inteira por trás dele ficava invisível — com
    // ela, a farmácia passou a enxergar `pep_condicoes`, que lê no mesmo
    // `Promise.all` de `pacientes` e que o analisador não via.
    //
    // ⚠️ É a falha mais perigosa que esta ferramenta pode ter: SUB-contar
    // deixa a catraca verde sobre um furo que existe. Sobre-contar só faz
    // barulho.
    if (n.type === "JSXIdentifier") refs.add(n.name);
  });
  return { tabelas, refs };
}

/** Resolve `./x` para um caminho relativo a `src`, ou null se não for local. */
function resolver(raiz, deArquivo, spec) {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(path.join(raiz, deArquivo)), spec);
  for (const c of [base, `${base}.js`, `${base}.jsx`, path.join(base, "index.js")]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) {
      return path.relative(raiz, c).replace(/\\/g, "/");
    }
  }
  return null;
}

/**
 * Lê um arquivo e devolve o que ele exporta, o que importa e o que cada
 * unidade (função nomeada) lê.
 */
function analisar(raiz, arquivo, cache) {
  if (cache.has(arquivo)) return cache.get(arquivo);
  const p = path.join(raiz, arquivo);
  const fonte = fs.readFileSync(p, "utf8");
  const ast = espree.parse(fonte, OPCOES);

  const unidades = new Map();        // nome -> { tabelas, refs }
  const importa = new Map();         // binding local -> { arquivo, exportado }
  const reexporta = new Map();       // nome exportado -> { arquivo, exportado }
  const estrela = [];                // `export * from "./x"` — cadeia de barris
  const topo = [];                   // nós do corpo que não são unidade nomeada

  const registrar = (nome, no) => unidades.set(nome, dentroDe(no));

  for (const n of ast.body) {
    if (n.type === "ImportDeclaration") {
      const alvo = resolver(raiz, arquivo, n.source.value);
      if (!alvo) continue;
      for (const e of n.specifiers) {
        if (e.type === "ImportSpecifier") {
          importa.set(e.local.name, { arquivo: alvo, exportado: e.imported.name });
        } else if (e.type === "ImportDefaultSpecifier") {
          importa.set(e.local.name, { arquivo: alvo, exportado: "default" });
        } else if (e.type === "ImportNamespaceSpecifier") {
          // `* as X`: conservador — tudo daquele arquivo passa a ser alcançável.
          importa.set(e.local.name, { arquivo: alvo, exportado: "*" });
        }
      }
      continue;
    }
    if (n.type === "ExportNamedDeclaration") {
      if (n.source) {                               // `export { a } from "./b"`
        const alvo = resolver(raiz, arquivo, n.source.value);
        if (alvo) for (const e of n.specifiers) {
          reexporta.set(e.exported.name, { arquivo: alvo, exportado: e.local.name });
        }
        continue;
      }
      const d = n.declaration;
      if (d?.type === "FunctionDeclaration") { registrar(d.id.name, d); continue; }
      if (d?.type === "VariableDeclaration") {
        for (const v of d.declarations) if (v.id?.name) registrar(v.id.name, v);
        continue;
      }
      topo.push(n);
      continue;
    }
    if (n.type === "ExportAllDeclaration") {
      // `export * from "./nsp-catalogo.js"`: o nome não está AQUI, está lá.
      // Sem isto, o símbolo não era achado e o analisador puxava o arquivo
      // inteiro por precaução — ruído que vira falso positivo.
      const alvo = resolver(raiz, arquivo, n.source.value);
      if (alvo) estrela.push(alvo);
      continue;
    }
    if (n.type === "ExportDefaultDeclaration") {
      registrar("default", n.declaration);
      continue;
    }
    if (n.type === "FunctionDeclaration" && n.id?.name) { registrar(n.id.name, n); continue; }
    if (n.type === "VariableDeclaration") {
      for (const v of n.declarations) if (v.id?.name) registrar(v.id.name, v);
      continue;
    }
    topo.push(n);
  }

  const r = { unidades, importa, reexporta, estrela, topo: dentroDe(topo), fonte };
  cache.set(arquivo, r);
  return r;
}

/**
 * Módulo → arquivos das telas que o App monta para ele.
 *
 * A fonte é o próprio `App.jsx`: `{active === "faturamento" && <FaturamentoPage …`
 * junto com o `lazy(() => import("./atendimento/FaturamentoSus.jsx"))`.
 *
 * 🔴 É daqui que vem a precisão que o diretório não dá: `FaturamentoSus.jsx`
 * MORA em `atendimento/` e é do módulo `faturamento`.
 */
export function telasDoApp(raiz) {
  const arquivo = "App.jsx";
  const fonte = fs.readFileSync(path.join(raiz, arquivo), "utf8");
  const ast = espree.parse(fonte, OPCOES);

  const compDoArquivo = new Map();
  // `const X = lazy(() => import("./a/B.jsx"))` — a maioria das telas.
  andar(ast, n => {
    if (n.type !== "VariableDeclarator" || !n.id?.name) return;
    let alvo = null;
    andar(n.init, x => {
      if (x.type === "ImportExpression" && x.source?.type === "Literal") alvo = x.source.value;
    });
    if (alvo) {
      const r = resolver(raiz, arquivo, alvo);
      if (r) compDoArquivo.set(n.id.name, { arquivo: r, nome: "*" });
    }
  });
  // ⚠️ E as que NÃO são lazy. `Overview`, `PrintDashboard` e `ImportPage`
  // entram por import estático NOMEADO, do mesmo `painel/Painel.jsx` — e
  // olhar só o `lazy` perdia os três em silêncio.
  //
  // 🔴 O NOME IMPORTA AQUI. `Painel.jsx` guarda várias telas; pegar o
  // arquivo inteiro devolveria a cada módulo as tabelas dos outros, que é
  // exatamente a sobre-aproximação que esta ferramenta existe para evitar.
  for (const n of ast.body) {
    if (n.type !== "ImportDeclaration") continue;
    const alvo = resolver(raiz, arquivo, n.source.value);
    if (!alvo) continue;
    for (const e of n.specifiers) {
      if (e.type === "ImportDefaultSpecifier") compDoArquivo.set(e.local.name, { arquivo: alvo, nome: "*" });
      if (e.type === "ImportSpecifier") compDoArquivo.set(e.local.name, { arquivo: alvo, nome: e.imported.name });
    }
  }

  const telas = new Map();
  andar(ast, n => {
    // 🔴 `active === "mod" && <Tela` E TAMBÉM `active === "x" && canX && <Tela`.
    //
    // A segunda forma aninha: `((active === "print") && canPrint) && <JSX>`,
    // e o casamento que só olhava `n.left` direto perdia CINCO módulos —
    // auditoria, import, overview, print e users — em silêncio. Catraca com
    // ponto cego silencioso é o defeito que ela deveria pegar.
    if (n.type !== "LogicalExpression" || n.operator !== "&&") return;
    let chave = null;
    andar(n.left, e => {
      if (e.type !== "BinaryExpression" || e.operator !== "===") return;
      const lit = [e.left, e.right].find(x => x?.type === "Literal" && typeof x.value === "string");
      const id = [e.left, e.right].find(x => x?.type === "Identifier" && x.name === "active");
      if (lit && id) chave = lit;
    });
    if (!chave) return;
    andar(n.right, x => {
      if (x.type !== "JSXOpeningElement" || x.name?.type !== "JSXIdentifier") return;
      const alvo = compDoArquivo.get(x.name.name);
      if (!alvo) return;
      if (!telas.has(chave.value)) telas.set(chave.value, new Map());
      telas.get(chave.value).set(`${alvo.arquivo}#${alvo.nome}`, alvo);
    });
  });
  return telas;
}

/**
 * Que tabelas cada módulo LÊ, seguindo o grafo a partir da tela dele.
 *
 * @returns {{ porModulo: Map<string, Set<string>>, naoResolvidos: string[] }}
 */
export function tabelasPorModulo(raiz) {
  const cache = new Map();
  const telas = telasDoApp(raiz);
  const porModulo = new Map();
  const naoResolvidos = new Set();

  for (const [modulo, arquivos] of telas) {
    const tabelas = new Set();
    // Fila de unidades a visitar: `{arquivo, nome}`. `nome = "*"` significa
    // o arquivo inteiro (tela de entrada ou import de namespace).
    const fila = [...arquivos.values()].map(a => ({ ...a }));
    const vistos = new Set();

    while (fila.length) {
      const { arquivo, nome } = fila.pop();
      const chave = `${arquivo}#${nome}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);

      let info;
      try { info = analisar(raiz, arquivo, cache); }
      catch (e) { naoResolvidos.add(`${arquivo} — não deu para ler: ${e.message}`); continue; }

      const alvo = info.reexporta.get(nome);
      if (alvo) { fila.push({ arquivo: alvo.arquivo, nome: alvo.exportado }); continue; }

      const partes = nome === "*"
        ? [info.topo, ...info.unidades.values()]
        : (info.unidades.has(nome) ? [info.unidades.get(nome)] : []);

      if (!partes.length && nome !== "*" && info.estrela.length) {
        // ⚠️ Só segue para os barris que REALMENTE têm o símbolo. Empurrar
        // para todos fazia cada barril reclamar do nome que mora no vizinho
        // — onze falsos alarmes que eu mesmo produzia, e falso alarme numa
        // catraca é o que ensina a equipe a ignorá-la.
        const tem = [];
        for (const alvo of info.estrela) {
          try {
            const outro = analisar(raiz, alvo, cache);
            if (outro.unidades.has(nome) || outro.reexporta.has(nome) || outro.estrela.length) {
              tem.push(alvo);
            }
          } catch { /* arquivo ilegível é registrado no próximo passo */ }
        }
        if (tem.length) { for (const alvo of tem) fila.push({ arquivo: alvo, nome }); continue; }
      }
      if (!partes.length && nome !== "*") {
        // Símbolo importado que não achei no arquivo de origem: pode ser um
        // re-export em cadeia ou um nome que eu não soube ler. Conservador:
        // puxa o arquivo inteiro, e registra para alguém olhar.
        naoResolvidos.add(`${arquivo} não expõe "${nome}" de um jeito que eu saiba ler`);
        fila.push({ arquivo, nome: "*" });
        continue;
      }

      for (const parte of partes) {
        for (const t of parte.tabelas) tabelas.add(t);
        for (const ref of parte.refs) {
          const imp = info.importa.get(ref);
          if (imp) { fila.push({ arquivo: imp.arquivo, nome: imp.exportado === "*" ? "*" : imp.exportado }); continue; }
          if (info.unidades.has(ref)) fila.push({ arquivo, nome: ref });
        }
      }
    }
    porModulo.set(modulo, tabelas);
  }
  return { porModulo, naoResolvidos: [...naoResolvidos].sort() };
}

/**
 * Onde o módulo lê uma tabela que ele não pode ler.
 *
 * @param porModulo    de `tabelasPorModulo`
 * @param leitoresDeFn `(tabela) => string[]` — os módulos que podem ler
 * @param todos        o símbolo de "todos os autenticados"
 */
export function furosDeModulo(porModulo, leitoresDeFn, todos) {
  const furos = [];
  for (const [modulo, tabelas] of [...porModulo].sort()) {
    for (const tabela of [...tabelas].sort()) {
      const alvos = leitoresDeFn(tabela);
      if (!alvos) continue;                       // tabela fora do mapa
      if (alvos.includes(todos) || alvos.includes(modulo)) continue;
      furos.push(`${modulo} → ${tabela} (leem: ${alvos.join(", ")})`);
    }
  }
  return furos;
}
