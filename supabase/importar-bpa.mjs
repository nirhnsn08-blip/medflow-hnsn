// ============================================================
// Valentrax — IMPORTADOR DE BPA DO SIA-SUS (.dbc do DATASUS)
//
//     node supabase/importar-bpa.mjs <PA…dbc> [--cnes N] [--nomes arq] [--largura-nome N]
//
// Irmão do `importar-aih.mjs`, e de propósito: o descompactador `.dbc`, o
// leitor de DBF e a mediana vêm DE LÁ, importados. Duas cópias do blast
// divergiriam na primeira correção, e é código que ninguém relê.
//
// 🔴 POR QUE ESTA FERRAMENTA EXISTE
// `sigtap_procedimentos` tem 219 procedimentos e TODOS são `via='aih'`
// (grupos 03 e 04) — internação. Não há uma linha de BPA. Como a alta de
// pronto-socorro e a consulta ambulatorial saem por BPA, a tela de escolha
// não tem o que oferecer para a maior parte do movimento do hospital:
// `escolha-procedimento.js` avisa "há catálogo carregado, mas nenhum
// procedimento de BPA", que é honesto e continua sendo um buraco.
//
// A METADE AMBULATORIAL vem do SIA-SUS "Produção Ambulatorial" (arquivos
// `PA<UF><AAMM>.dbc`), pelo mesmo caminho que o AIH veio do SIH-SUS: da
// produção REALMENTE paga, e não de uma lista que alguém digitou.
//
// ⚠️ SÓ ENTRA O QUE O HOSPITAL DE FATO FATURA.
// O SIGTAP inteiro tem milhares de procedimentos e quase nenhum se aplica a
// uma casa específica. Uma lista completa faria a recepcionista escolher
// entre milhares de opções irrelevantes — que é o mesmo que não ter lista.
// Derivar da produção real dá o recorte que interessa, exatamente como os
// 219 de AIH ("os procedimentos que o hospital fatura hoje").
//
// ⚠️ O NOME DO PROCEDIMENTO NÃO ESTÁ NO ARQUIVO DE PRODUÇÃO.
// O PA traz código, quantidade, valor e CID — não o nome. E
// `sigtap_procedimentos.nome` é `not null`. Então:
//   • código que JÁ existe na tabela → só enriquece (valor, CID, via);
//   • código NOVO → precisa de nome, e o nome vem do `--nomes` (CSV
//     `codigo;nome`, exportável do próprio SIGTAP).
// Sem `--nomes`, os códigos novos são LISTADOS e não inseridos. Inventar
// nome de procedimento é pior que não ter: alguém escolheria pelo rótulo
// errado e a conta voltaria rejeitada.
//
// LGPD: o PA tem campos semi-identificáveis (idade, sexo, município, e em
// alguns anos o CNS cifrado). Esta ferramenta processa LOCAL e só emite
// AGREGADO por procedimento — nenhum registro de paciente sai daqui.
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { blast, lerHeaderDbf, campoDe, mediana } from "./importar-aih.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Os campos do PA que esta ferramenta usa, e o que cada um é.
 *
 * 🔴 ESTA LISTA É CONFERIDA CONTRA O ARQUIVO ANTES DE QUALQUER CONTA.
 * `campoDe` devolve `""` para campo inexistente — em silêncio. Um nome
 * errado aqui produziria valores ZERADOS sem nenhum erro, que é o pior
 * defeito possível numa ferramenta de faturamento: número errado com cara
 * de certo. O layout do SIA-SUS mudou de nome de campo entre versões, então
 * a conferência não é paranoia.
 */
export const CAMPOS_PA = {
  proc: "PA_PROC_ID",   // código do procedimento (10 dígitos)
  qtd: "PA_QTDAPR",     // quantidade APROVADA
  valor: "PA_VALAPR",   // valor APROVADO da linha (total, não unitário)
  cid: "PA_CIDPRI",     // CID principal
  cnes: "PA_CODUNI",    // estabelecimento
  comp: "PA_CMP",       // competência AAAAMM
};

/**
 * Confere que o arquivo tem os campos de que precisamos.
 *
 * Devolve `{ ok, faltando, presentes }`. Quem chama PARA quando não está ok
 * — e mostra os campos que o arquivo REALMENTE tem, para quem estiver com o
 * arquivo na mão poder corrigir o mapeamento sem adivinhar.
 */
export function conferirCampos(header, campos = CAMPOS_PA) {
  const presentes = header.campos.map(c => c.nome);
  const faltando = Object.entries(campos)
    .filter(([, nome]) => !header.campoPorNome[nome])
    .map(([papel, nome]) => ({ papel, nome }));
  return { ok: faltando.length === 0, faltando, presentes };
}

/** Número do DBF: vem como texto com zeros à esquerda; vazio é 0. */
const num = v => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
};

/** CID do DBF → 'A00' | 'A000', sem pontuação. Vazio vira null. */
export const cidLimpo = v => {
  const s = String(v ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z]\d{2,3}$/.test(s) ? s : null;
};

/** Competência 'AAAAMM' → 'AAAA-MM'. É o formato que o faturamento usa. */
export const competenciaPa = v => {
  const s = String(v ?? "").trim();
  return /^\d{6}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4)}` : null;
};

/**
 * Agrega a produção por procedimento.
 *
 * ⚠️ VALOR UNITÁRIO, NÃO O DA LINHA. No PA, `PA_VALAPR` é o valor da linha
 * inteira e `PA_QTDAPR` a quantidade — uma linha de 30 sessões traz o valor
 * das 30. Guardar isso como valor do procedimento inflaria o preço em 30×.
 *
 * ⚠️ MEDIANA, não média: linhas com quantidade alta ou complexidade fora do
 * comum puxam a média. É a mesma escolha do `importar-aih.mjs`.
 *
 * ⚠️ CID visto ao menos DUAS vezes: uma ocorrência costuma ser digitação
 * isolada, e um CID errado na lista vira glosa de "CID atípico" contra um
 * atendimento correto.
 */
export function agregarBpa({ header, dados }, { cnes = null, campos = CAMPOS_PA } = {}) {
  const { recordLen, campoPorNome, nRegistros } = header;
  const porProc = new Map();
  let lidos = 0, semQtd = 0;
  const competencias = new Set();

  for (let i = 0; i < nRegistros; i++) {
    const rec = dados.subarray(i * recordLen, (i + 1) * recordLen);
    if (rec.length < recordLen) break;
    if (cnes && campoDe(rec, campoPorNome, campos.cnes) !== String(cnes)) continue;

    const proc = campoDe(rec, campoPorNome, campos.proc).trim();
    if (!/^\d{10}$/.test(proc)) continue;
    lidos++;

    const comp = competenciaPa(campoDe(rec, campoPorNome, campos.comp));
    if (comp) competencias.add(comp);

    const qtd = num(campoDe(rec, campoPorNome, campos.qtd));
    const valor = num(campoDe(rec, campoPorNome, campos.valor));
    // Quantidade zero não dá para dividir. Não é erro do arquivo: linha
    // rejeitada entra com aprovado zerado. Conta como lida e não vira valor.
    if (qtd <= 0) { semQtd++; continue; }

    const g = porProc.get(proc) || { proc, unit: [], cids: new Map(), linhas: 0, qtd: 0 };
    g.linhas++;
    g.qtd += qtd;
    // Em CENTAVOS, como a coluna do banco. O PA traz reais com decimais.
    g.unit.push(Math.round((valor / qtd) * 100));
    const cid = cidLimpo(campoDe(rec, campoPorNome, campos.cid));
    if (cid) g.cids.set(cid, (g.cids.get(cid) || 0) + 1);
    porProc.set(proc, g);
  }

  const linhas = [...porProc.values()]
    .map(g => ({
      codigo: g.proc,
      valor_sa: Math.round(mediana(g.unit)),
      linhas: g.linhas,
      quantidade: g.qtd,
      cids: [...g.cids.entries()].filter(([, n]) => n >= 2).map(([c]) => c).sort(),
    }))
    .sort((a, b) => b.quantidade - a.quantidade || a.codigo.localeCompare(b.codigo));

  return { linhas, lidos, semQtd, competencias: [...competencias].sort() };
}

// ── De onde vêm os NOMES dos procedimentos ──────────────────
//
// 🔴 O ARQUIVO DE PRODUÇÃO NÃO TEM NOME, e `nome` é `not null`.
// Duas origens são aceitas, e as duas passam pela mesma porta:
//
//   • CSV `codigo;nome` — qualquer um que a pessoa consiga montar;
//   • `tb_procedimento.txt` do PACOTE OFICIAL do SIGTAP (largura fixa).
//
// ⚠️ O SEGUNDO NÃO TEM POSIÇÃO DE CAMPO CRAVADA AQUI.
// Cravar offset de arquivo do DATASUS é a mesma armadilha do nome de campo
// do .dbc: se o layout mudar, o programa não erra — ele extrai o pedaço
// errado da linha e devolve nome errado com cara de certo, e alguém escolhe
// o procedimento pelo rótulo trocado. Então a largura do nome é DERIVIDA do
// próprio arquivo, VALIDADA, e uma amostra é mostrada para conferência
// humana antes de qualquer coisa entrar no SQL.

/** Decodifica respeitando o latin1 do DATASUS sem estragar arquivo em UTF-8. */
export function decodificar(buf) {
  const utf8 = Buffer.isBuffer(buf) ? buf.toString("utf8") : String(buf ?? "");
  // U+FFFD é o que o decodificador põe onde o byte não era UTF-8 válido —
  // sinal de que o arquivo é latin1 (que é como o DATASUS publica).
  return utf8.includes("�") && Buffer.isBuffer(buf) ? buf.toString("latin1") : utf8;
}

/** CSV ou largura fixa? Decide pelo que a maioria das linhas parece. */
export function detectarFormatoNomes(texto) {
  const linhas = String(texto ?? "").split(/\r?\n/).filter(l => l.trim()).slice(0, 200);
  if (!linhas.length) return null;
  const csv = linhas.filter(l => /^\s*\d{10}\s*[;,]/.test(l)).length;
  if (csv >= Math.max(1, linhas.length * 0.5)) return "csv";
  const fixo = linhas.filter(l => /^\d{10}/.test(l) && l.length > 30).length;
  return fixo >= linhas.length * 0.9 ? "fixo" : null;
}

/**
 * Extrai `codigo → nome` de um arquivo de largura fixa.
 *
 * 🔴 A LARGURA DO NOME É INFORMADA, NÃO ADIVINHADA.
 * A primeira versão disto derivava a largura sozinha, medindo coluna a
 * coluna se era "texto" ou "dígito". O próprio teste derrubou a ideia: nome
 * de procedimento CONTÉM dígito ("CONSULTA DE 1A VEZ", "SESSAO DE 4 HORAS"),
 * e um dígito numa coluna recorrente fazia a derivação cortar o nome no
 * meio — devolvendo nome truncado com cara de certo.
 *
 * Adivinhar layout de arquivo do DATASUS é a mesma armadilha do nome de
 * campo do `.dbc`, noutra roupa: não dá erro, dá dado errado.
 *
 * Então: sem `largura`, isto NÃO extrai nada. Devolve um PALPITE e a
 * amostra correspondente, para a pessoa olhar e confirmar com
 * `--largura-nome`. Sugerir não é preencher.
 */
export function lerNomesFixo(texto, { largura = null } = {}) {
  const linhas = String(texto ?? "").split(/\r?\n/).filter(l => /^\d{10}/.test(l));
  if (linhas.length < 10) {
    return { nomes: new Map(), largura: 0, amostra: [], precisaConfirmar: false,
      erros: ["Menos de 10 linhas com código de 10 dígitos — isto não parece o tb_procedimento.txt."] };
  }

  // O palpite: até onde a coluna ainda tem LETRA em alguma linha da
  // amostra. Serve só para a pessoa ter um número por onde começar.
  const amostraLinhas = linhas.slice(0, 400);
  const maxCol = Math.max(...amostraLinhas.map(l => l.length));
  let ultimaLetra = 10;
  for (let col = 10; col < maxCol; col++) {
    if (amostraLinhas.some(l => col < l.length && /[A-Za-zÀ-ÿ]/.test(l[col]))) ultimaLetra = col;
  }
  const palpite = ultimaLetra - 10 + 1;

  const corta = w => {
    const m = new Map();
    for (const l of linhas) {
      const nome = l.slice(10, 10 + w).trim().replace(/\s+/g, " ");
      if (nome) m.set(l.slice(0, 10), nome);
    }
    return m;
  };

  if (largura == null) {
    const previa = corta(palpite);
    return {
      nomes: new Map(), largura: palpite, precisaConfirmar: true, erros: [],
      amostra: [...previa.entries()].slice(0, 5).map(([c, n]) => `${c}  ${n}`),
    };
  }

  const nomes = corta(largura);
  const erros = [];
  // ── as provas, mesmo com a largura informada ──
  // A pessoa pode digitar o número errado, e aí o erro é dela mas o dano é
  // o mesmo. Estas conferências pegam o engano grosseiro.

  // 🔴 CORTE NO MEIO DA PALAVRA — o defeito que as outras provas NÃO viam.
  // Com largura 3, "CONSULTA MEDICA" vira "CON": tem letra, não tem dígito,
  // nenhuma linha fica sem nome — e passava limpo por todas as conferências
  // abaixo. O sinal certo é o caractere logo DEPOIS do corte: num arquivo de
  // largura fixa o nome é preenchido com espaço até o fim do campo, então
  // uma letra ali significa que a fatia parou no meio de uma palavra.
  const cortadas = linhas.filter(l =>
    /[A-Za-zÀ-ÿ]/.test(l[10 + largura - 1] || " ") &&
    /[A-Za-zÀ-ÿ]/.test(l[10 + largura] || " ")).length;
  if (cortadas > linhas.length * 0.2) {
    erros.push(`${cortadas} de ${linhas.length} nome(s) terminam no meio de uma palavra — a largura ${largura} corta o nome.`);
  }

  const semNome = linhas.length - nomes.size;
  if (semNome > linhas.length * 0.02) erros.push(`${semNome} de ${linhas.length} linha(s) ficaram sem nome — a largura ${largura} provavelmente está errada.`);
  const soDigito = [...nomes.values()].filter(n => /^[\d.,-]+$/.test(n)).length;
  if (soDigito > nomes.size * 0.05) erros.push(`${soDigito} nome(s) saíram só com números — a largura ${largura} pegou outro campo.`);
  const comLetra = [...nomes.values()].filter(n => /[A-Za-zÀ-ÿ]{3}/.test(n)).length;
  if (comLetra < nomes.size * 0.9) erros.push("Boa parte dos nomes extraídos não parece texto.");

  return {
    nomes, largura, precisaConfirmar: false, erros,
    amostra: [...nomes.entries()].slice(0, 5).map(([c, n]) => `${c}  ${n}`),
  };
}

/**
 * Lê o `--nomes`, seja CSV ou o `tb_procedimento.txt` do pacote SIGTAP.
 *
 * Devolve `{ nomes, formato, largura, amostra, erros }` — e quem chama PARA
 * quando há erro, mostrando a amostra. Nome errado é pior que nome nenhum:
 * sem nome o código não entra; com nome errado ele entra e alguém escolhe
 * por ele.
 */
export function lerNomes(entrada, { largura = null } = {}) {
  const texto = decodificar(entrada);
  const formato = detectarFormatoNomes(texto);

  if (formato === "fixo") return { formato, ...lerNomesFixo(texto, { largura }) };

  const nomes = new Map();
  for (const linha of texto.split(/\r?\n/)) {
    const t = linha.trim();
    if (!t) continue;
    const m = /^(\d{10})\s*[;,]\s*(.+)$/.exec(t);
    if (m) nomes.set(m[1], m[2].trim().replace(/^"|"$/g, ""));
  }
  const erros = formato ? [] : ["Não reconheci o arquivo como CSV `codigo;nome` nem como tabela de largura fixa do SIGTAP."];
  return {
    formato: formato || null, nomes, largura: 0, erros: nomes.size ? [] : erros,
    amostra: [...nomes.entries()].slice(0, 5).map(([c, n]) => `${c}  ${n}`),
  };
}

/** Os códigos que `sigtap_procedimentos` já tem, lidos do seed versionado. */
export function codigosExistentes(seedSql) {
  return new Set([...String(seedSql ?? "").matchAll(/\('(\d{10})'/g)].map(m => m[1]));
}

/**
 * Gera o SQL.
 *
 * Duas metades, e a separação importa: o que já existe é ENRIQUECIDO (nunca
 * reescrito por inteiro, para não apagar a curadoria do seed), e o que é
 * novo é INSERIDO — só com nome de verdade.
 */
export function gerarSqlBpa(linhas, { arquivo, competencia, cnes, nomes = new Map(), existentes = new Set() }) {
  const enriquecer = linhas.filter(l => existentes.has(l.codigo));
  const novosComNome = linhas.filter(l => !existentes.has(l.codigo) && nomes.get(l.codigo));
  const semNome = linhas.filter(l => !existentes.has(l.codigo) && !nomes.get(l.codigo));

  const esc = s => String(s).replace(/'/g, "''");
  const arr = cids => (cids.length ? `array[${cids.map(c => `'${c}'`).join(",")}]::text[]` : "null");

  const cab = `-- ============================================================
-- Valentrax — SIGTAP: a metade BPA (produção ambulatorial REAL)
--
-- ⚠️ ARQUIVO GERADO — não edite à mão.
--    Regenere com:  node supabase/importar-bpa.mjs <PA…dbc>${cnes ? ` --cnes ${cnes}` : ""} [--nomes lista.csv]
--
-- 🔴 O BURACO QUE ISTO FECHA
-- \`sigtap_procedimentos\` tinha 219 linhas e TODAS de \`via='aih'\`
-- (internação). A alta de pronto-socorro e a consulta ambulatorial saem por
-- BPA, e a tela de escolha não tinha o que oferecer para elas — avisava
-- "há catálogo carregado, mas nenhum procedimento de BPA", corretamente e
-- sem resolver.
--
-- FONTE: ${esc(path.basename(arquivo))} (SIA-SUS, Produção Ambulatorial)${cnes ? `, CNES ${cnes}` : ", estado inteiro"}.
-- Competência: ${competencia || "(não identificada no arquivo)"}.
--
-- MÉTODO: por procedimento, a MEDIANA do valor UNITÁRIO (valor aprovado da
-- linha ÷ quantidade aprovada — uma linha de 30 sessões traz o valor das 30,
-- e guardar isso cru inflaria o preço em 30×), e os CIDs vistos ao menos 2×
-- (1× costuma ser digitação isolada, e CID errado vira glosa contra
-- atendimento correto).
--
-- ${enriquecer.length} código(s) já existiam e são ENRIQUECIDOS; ${novosComNome.length} entram novos.
${semNome.length ? `--
-- ⚠️ ${semNome.length} CÓDIGO(S) FICARAM DE FORA POR FALTA DE NOME.
-- O arquivo de produção traz código, valor e CID — não o nome — e
-- \`nome\` é \`not null\`. Inventar nome é pior que não ter: alguém
-- escolheria pelo rótulo errado. Rode de novo com \`--nomes\` (CSV
-- \`codigo;nome\`) para incluí-los:
${semNome.slice(0, 40).map(l => `--   ${l.codigo}  (${l.linhas} linha(s))`).join("\n")}${semNome.length > 40 ? `\n--   … e mais ${semNome.length - 40}` : ""}
` : ""}--
-- Aditiva e idempotente: cria linha que falta e atualiza coluna de valor.
-- NÃO apaga tabela, coluna nem linha, e não toca no nome do que já existe.
--
-- ⚠️ Roda no DEMO primeiro, depois no principal.
-- ============================================================
`;

  const inserts = novosComNome.length ? `
-- ── Procedimentos de BPA que o hospital fatura e a tabela não tinha ──
insert into public.sigtap_procedimentos (competencia, codigo, nome, grupo, via, valor_sa, cids)
select v.competencia, v.codigo, v.nome, left(v.codigo, 2), 'bpa', v.valor_sa, v.cids
from (values
${novosComNome.map(l => `  ('${competencia}', '${l.codigo}', '${esc(nomes.get(l.codigo))}', ${l.valor_sa}::bigint, ${arr(l.cids)})`).join(",\n")}
) as v(competencia, codigo, nome, valor_sa, cids)
where not exists (
  select 1 from public.sigtap_procedimentos s
   where s.codigo = v.codigo and s.competencia = v.competencia
);
` : "\n-- (nenhum código novo com nome disponível)\n";

  const updates = enriquecer.length ? `
-- ── Códigos que já existiam: só o valor ambulatorial e os CIDs ──
-- Não mexe em nome, grupo nem via: essa é a curadoria do seed, e o arquivo
-- de produção não sabe mais do que ela sobre isso.
update public.sigtap_procedimentos s set
  valor_sa = v.valor_sa,
  cids = coalesce(s.cids, v.cids)
from (values
${enriquecer.map(l => `  ('${l.codigo}', ${l.valor_sa}::bigint, ${arr(l.cids)})`).join(",\n")}
) as v(codigo, valor_sa, cids)
where s.codigo = v.codigo;
` : "\n-- (nenhum código já existente nesta produção)\n";

  const rodape = `
-- ── Anota que esta migração rodou NESTE banco ────────────────
insert into public.migracoes_aplicadas (arquivo)
values ('migracao-sigtap-bpa.sql') on conflict do nothing;

-- ── Conferência (leitura). É a ÚLTIMA consulta de propósito ──
-- \`bpa\` tem de ser > 0: era ele que faltava. Se vier zero, o import não
-- inseriu nada — provavelmente faltou o \`--nomes\`.
select
  count(*)                                  as procedimentos_no_total,
  count(*) filter (where via = 'aih')        as aih,
  count(*) filter (where via = 'bpa')        as bpa,
  count(*) filter (where via = 'bpa'
                     and valor_sa is null)   as bpa_sem_valor,
  (select count(*) from public.migracoes_aplicadas
    where arquivo = 'migracao-sigtap-bpa.sql') as migracao_anotada
from public.sigtap_procedimentos;
`;

  return cab + inserts + updates + rodape;
}

// ── CLI ─────────────────────────────────────────────────────
// `import.meta.url` só bate com o argv quando o arquivo é EXECUTADO; ao ser
// importado pelo teste, nada disto roda.
const executado = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href;

if (executado) {
  const args = process.argv.slice(2);
  const arquivo = args.find(a => !a.startsWith("--"));
  const pega = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
  const cnes = pega("--cnes");
  const nomesArq = pega("--nomes");

  if (!arquivo) {
    console.error("uso: node supabase/importar-bpa.mjs <PA…dbc> [--cnes N] [--nomes arq] [--largura-nome N]");
    process.exit(1);
  }

  // 🔴 O NOME PASSA PELA MESMA DESCONFIANÇA QUE O RESTO.
  // Nome errado é PIOR que nome nenhum: sem nome o código não entra; com
  // nome errado ele entra, e alguém escolhe o procedimento pelo rótulo
  // trocado. Por isso a ferramenta mostra o que entendeu e PARA no erro.
  let nomes = new Map();
  if (nomesArq) {
    const larguraArg = pega("--largura-nome");
    const r = lerNomes(fs.readFileSync(nomesArq), { largura: larguraArg ? Number(larguraArg) : null });
    console.log(`\n${path.basename(nomesArq)}: ${r.formato === "fixo" ? "tabela de largura fixa" : "CSV codigo;nome"}`);
    if (r.amostra.length) {
      console.log("  amostra:");
      for (const a of r.amostra) console.log(`    ${a}`);
    }

    // 🔴 LARGURA FIXA SEM CONFIRMAÇÃO NÃO PASSA.
    // O palpite é só ponto de partida: nome de procedimento contém dígito,
    // e qualquer derivação automática corta no lugar errado em algum caso.
    // Quem olha a amostra e confirma é a pessoa.
    if (r.precisaConfirmar) {
      console.error(`\n⚠️ Este arquivo é de largura fixa e eu NÃO vou adivinhar onde o nome termina.`);
      console.error(`   Adivinhar layout do DATASUS não dá erro — dá nome truncado com cara de certo.`);
      console.error(`\n   Meu palpite é ${r.largura} caracteres, e a amostra acima foi cortada com ele.`);
      console.error(`   Se os nomes acima estão INTEIROS, rode de novo confirmando:`);
      console.error(`\n     node supabase/importar-bpa.mjs ${path.basename(arquivo)} --nomes ${path.basename(nomesArq)} --largura-nome ${r.largura}`);
      console.error(`\n   Se estão cortados ou com lixo no fim, ajuste o número até a amostra sair limpa.`);
      process.exit(5);
    }

    if (r.erros.length) {
      console.error(`\n🔴 Não vou usar este arquivo de nomes:`);
      for (const e of r.erros) console.error(`   ${e}`);
      console.error(`\nNome errado entra no catálogo e alguém escolhe por ele. É melhor ficar sem\nnome do que com o errado.`);
      process.exit(4);
    }
    console.log(`  ${r.nomes.size.toLocaleString("pt-BR")} nome(s) lidos`);
    nomes = r.nomes;
  }

  const buf = fs.readFileSync(arquivo);
  // Arquivo pequeno demais estoura dentro do leitor de DBF com stack trace
  // — mensagem de programador para quem só errou de arquivo. 32 bytes é o
  // cabeçalho mínimo antes da primeira descrição de campo.
  if (buf.length < 64) {
    console.error(`🔴 ${path.basename(arquivo)} tem ${buf.length} byte(s) — pequeno demais para ser um .dbc do DATASUS.`);
    process.exit(3);
  }
  let header;
  try {
    header = lerHeaderDbf(buf);
  } catch (e) {
    console.error(`🔴 Não consegui ler o cabeçalho de ${path.basename(arquivo)} — é mesmo um .dbc do DATASUS?`);
    console.error(`   (${e.message})`);
    process.exit(3);
  }
  console.log(`${path.basename(arquivo)}: ${header.nRegistros.toLocaleString("pt-BR")} linhas · ${header.campos.length} campos`);

  // 🔴 CONFERIR ANTES DE CONTAR. Campo com nome errado devolve "" em
  // silêncio, e a ferramenta produziria valores zerados sem reclamar.
  const conf = conferirCampos(header);
  if (!conf.ok) {
    console.error(`\n🔴 O arquivo não tem ${conf.faltando.length} campo(s) que esta ferramenta usa:`);
    for (const f of conf.faltando) console.error(`   ${f.nome}  (seria o ${f.papel})`);
    console.error(`\nO layout do SIA-SUS varia entre versões. Os campos deste arquivo são:\n   ${conf.presentes.join(", ")}`);
    console.error(`\nAjuste CAMPOS_PA em supabase/importar-bpa.mjs para os nomes acima — NÃO adivinhe.`);
    process.exit(2);
  }

  // O fluxo comprimido começa depois do cabeçalho; o candidato certo é o
  // que descompacta um primeiro registro com código de procedimento são.
  let dados = null;
  for (const cand of [header.headerLen + 4, header.headerLen, header.headerLen + 1, header.headerLen + 2, header.headerLen + 3]) {
    try {
      const amostra = blast(buf, cand, header.recordLen * 2);
      const rec = amostra.subarray(0, header.recordLen);
      if (amostra.length >= header.recordLen && /^\d{10}$/.test(campoDe(rec, header.campoPorNome, CAMPOS_PA.proc))) {
        dados = blast(buf, cand);
        break;
      }
    } catch { /* offset errado */ }
  }
  if (!dados) {
    console.error("🔴 Não achei o início do fluxo comprimido. O arquivo é mesmo um .dbc do DATASUS?");
    process.exit(3);
  }

  const { linhas, lidos, semQtd, competencias } = agregarBpa({ header, dados }, { cnes });
  const competencia = competencias[0] || null;
  const seed = fs.readFileSync(path.join(dir, "migracao-sigtap.sql"), "utf8");
  const existentes = codigosExistentes(seed);

  const sql = gerarSqlBpa(linhas, { arquivo, competencia, cnes, nomes, existentes });
  const saida = path.join(dir, "migracao-sigtap-bpa.sql");
  fs.writeFileSync(saida, sql);

  const novos = linhas.filter(l => !existentes.has(l.codigo));
  console.log(`  ${lidos.toLocaleString("pt-BR")} linha(s) de produção · ${linhas.length} procedimento(s) distinto(s)`);
  if (semQtd) console.log(`  ${semQtd} linha(s) sem quantidade aprovada (rejeitadas) — fora do cálculo`);
  console.log(`  ${linhas.length - novos.length} já na tabela (enriquecidos) · ${novos.length} novo(s)`);
  const faltamNome = novos.filter(l => !nomes.get(l.codigo)).length;
  if (faltamNome) console.log(`  ⚠️ ${faltamNome} novo(s) SEM NOME — listados no cabeçalho do SQL; rode com --nomes para incluí-los`);
  console.log(`\ngerado: ${path.relative(process.cwd(), saida)}`);
}
