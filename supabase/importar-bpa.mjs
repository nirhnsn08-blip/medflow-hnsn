// ============================================================
// Valentrax — IMPORTADOR DE BPA DO SIA-SUS (.dbc do DATASUS)
//
//     node supabase/importar-bpa.mjs <PA…dbc> [--cnes 1234567] [--nomes lista.csv]
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

/** Lê o CSV `codigo;nome` do `--nomes`. Aceita `;` ou `,` e ignora cabeçalho. */
export function lerNomes(texto) {
  const mapa = new Map();
  for (const linha of String(texto ?? "").split(/\r?\n/)) {
    const t = linha.trim();
    if (!t) continue;
    const m = /^(\d{10})\s*[;,]\s*(.+)$/.exec(t);
    if (m) mapa.set(m[1], m[2].trim().replace(/^"|"$/g, ""));
  }
  return mapa;
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
    console.error("uso: node supabase/importar-bpa.mjs <PA…dbc> [--cnes 1234567] [--nomes lista.csv]");
    process.exit(1);
  }

  const buf = fs.readFileSync(arquivo);
  const header = lerHeaderDbf(buf);
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
  const nomes = nomesArq ? lerNomes(fs.readFileSync(nomesArq, "utf8")) : new Map();
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
