// ============================================================
// Valentrax — IMPORTADOR DE AIH DO SIH-SUS (.dbc do DATASUS)
//
//     node supabase/importar-aih.mjs <arquivo.dbc> [--cnes 1234567]
//
// Lê um arquivo do SIH-SUS "AIH Reduzida" (RD…, .dbc do DATASUS), cruza os
// procedimentos com os que o HNSN fatura (o seed `migracao-sigtap.sql`) e
// gera/atualiza `migracao-sigtap-valores.sql` com o valor REAL pago (SH/SP)
// e a permanência média REAL de cada um. Sem `--cnes`, usa o estado inteiro
// do arquivo (a tabela SUS é nacional, então o estado aproxima bem o oficial);
// com `--cnes`, filtra as AIHs de um hospital só.
//
// POR QUE ESTA FERRAMENTA EXISTE
// O dado do DATASUS é MENSAL. Sem isto, cada atualização dependeria de rodar
// scripts de rascunho à mão. Aqui a capacidade fica versionada, testada e
// reproduzível: mês novo → um comando → migração pronta.
//
// O FORMATO .dbc (o que precisou ser resolvido)
// É um DBF com os REGISTROS comprimidos em PKWARE DCL ("blast"). O cabeçalho
// DBF fica em claro no início; os registros vêm comprimidos logo após, num
// offset de headerLen+4 (os 4 bytes do meio são um CRC do cabeçalho). O
// descompactador abaixo é um port do blast.c do Mark Adler (domínio público).
// A máquina do projeto só tem Node — daí ler o .dbc aqui, sem Python/R.
//
// LGPD: o RD tem campos semi-identificáveis (nascimento, CEP, município de
// residência…). Esta ferramenta processa LOCAL e só emite AGREGADO (valor
// mediano por procedimento) — nenhum registro de paciente sai daqui.
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── BLAST (PKWARE DCL explode) ──────────────────────────────
// Tabelas fixas do formato (bit-lengths em RLE) e as bases/extra de comprimento.
const LITLEN = [11,124,8,7,28,7,188,13,76,4,10,8,12,10,12,10,8,23,8,9,7,6,7,8,7,6,55,8,23,24,12,11,7,9,11,12,6,7,22,5,7,24,6,11,9,6,7,22,7,11,38,7,9,8,25,11,8,11,9,12,8,12,5,38,5,38,5,11,7,5,6,21,6,10,53,8,7,24,10,27,44,253,253,253,252,252,252,13,12,45,12,45,12,61,12,45,44,173];
const LENLEN = [2,35,36,53,38,23];
const DISTLEN = [2,20,53,230,247,151,248];
const BASE = [3,2,4,5,6,7,8,9,10,12,16,24,40,72,136,264];
const EXTRA = [0,0,0,0,0,0,0,0,1,2,3,4,5,6,7,8];

/** Constrói a tabela de decodificação canônica a partir dos bit-lengths RLE. */
export function construct(rep) {
  const lengths = [];
  for (const b of rep) {
    const len = b & 15;
    const count = (b >> 4) + 1;
    for (let i = 0; i < count; i++) lengths.push(len);
  }
  const MAXBITS = 13;
  const count = new Array(MAXBITS + 1).fill(0);
  for (const l of lengths) count[l]++;
  const offs = new Array(MAXBITS + 2).fill(0);
  for (let len = 1; len < MAXBITS; len++) offs[len + 1] = offs[len] + count[len];
  const symbol = new Array(lengths.length).fill(0);
  for (let s = 0; s < lengths.length; s++) if (lengths[s]) symbol[offs[lengths[s]]++] = s;
  return { count, symbol };
}

/**
 * Descompacta um bloco PKWARE DCL. `start` é o offset do fluxo; `outLimit`,
 * o tamanho esperado da saída (0 = até o fim do fluxo). Devolve um Buffer.
 */
export function blast(input, start = 0, outLimit = 0) {
  let inpos = start, bitbuf = 0, bitcnt = 0;
  const bits = (need) => {
    let val = bitbuf;
    while (bitcnt < need) {
      if (inpos >= input.length) throw new Error("fim inesperado do fluxo comprimido");
      val |= input[inpos++] << bitcnt;
      bitcnt += 8;
    }
    bitbuf = val >>> need;
    bitcnt -= need;
    return val & ((1 << need) - 1);
  };
  const litcode = construct(LITLEN), lencode = construct(LENLEN), distcode = construct(DISTLEN);
  const decode = (h) => {
    let code = 0, first = 0, index = 0;
    for (let len = 1; len <= 13; len++) {
      code |= bits(1) ^ 1; // os códigos do DCL são invertidos
      const cnt = h.count[len];
      if (code < first + cnt) return h.symbol[index + (code - first)];
      index += cnt; first += cnt; first <<= 1; code <<= 1;
    }
    throw new Error("código Huffman inválido");
  };

  const lit = bits(8);
  if (lit > 1) throw new Error("lit inválido: " + lit);
  const dict = bits(8);
  if (dict < 4 || dict > 6) throw new Error("dict inválido: " + dict);

  const cap = outLimit || 16 * 1024 * 1024;
  const out = Buffer.allocUnsafe(cap);
  let outpos = 0;
  while (outLimit ? outpos < outLimit : true) {
    if (bits(1)) {
      let sym = decode(lencode);
      const len = BASE[sym] + bits(EXTRA[sym]);
      if (len === 519) break; // fim do fluxo
      sym = len === 2 ? 2 : dict;
      let dist = decode(distcode) << sym;
      dist += bits(sym);
      dist += 1;
      let from = outpos - dist;
      for (let i = 0; i < len; i++) out[outpos++] = out[from++];
    } else {
      out[outpos++] = lit ? decode(litcode) : bits(8);
    }
    if (!outLimit && outpos >= cap) throw new Error("saída maior que o esperado");
  }
  return out.subarray(0, outpos);
}

// ── DBF ─────────────────────────────────────────────────────

/** Lê o cabeçalho DBF (em claro) — nº de registros, tamanhos e campos. */
export function lerHeaderDbf(buf) {
  const nRegistros = buf.readUInt32LE(4);
  const headerLen = buf.readUInt16LE(8);
  const recordLen = buf.readUInt16LE(10);
  const campos = [];
  let off = 32, disp = 1; // byte 0 do registro é a flag de deleção
  while (off < headerLen && buf[off] !== 0x0d) {
    const nome = buf.toString("latin1", off, off + 11).replace(/\0.*$/, "").trim();
    campos.push({ nome, tipo: String.fromCharCode(buf[off + 11]), tam: buf[off + 16], offset: disp });
    disp += buf[off + 16];
    off += 32;
  }
  const campoPorNome = {};
  for (const c of campos) campoPorNome[c.nome] = c;
  return { nRegistros, headerLen, recordLen, campos, campoPorNome };
}

/** Lê um campo de um registro (Buffer de recordLen bytes), como texto. */
export function campoDe(rec, campoPorNome, nome) {
  const c = campoPorNome[nome];
  return c ? rec.toString("latin1", c.offset, c.offset + c.tam).trim() : "";
}

/**
 * Acha o offset do fluxo comprimido: o cabeçalho blast válido (lit∈{0,1},
 * dict∈{4,5,6}) que descompacta o 1º registro com CNES/data/proc sãos.
 */
export function acharInicioComprimido(buf, header) {
  const { headerLen, recordLen, campoPorNome } = header;
  const sano = (rec) =>
    /^\d{7}$/.test(campoDe(rec, campoPorNome, "CNES")) &&
    /^\d{8}$/.test(campoDe(rec, campoPorNome, "DT_INTER")) &&
    /^\d{10}$/.test(campoDe(rec, campoPorNome, "PROC_REA"));
  for (const cand of [headerLen + 4, headerLen, headerLen + 1, headerLen + 2, headerLen + 3, headerLen + 5, headerLen + 6, headerLen + 8]) {
    try {
      const amostra = blast(buf, cand, recordLen * 2);
      if (amostra.length >= recordLen && sano(amostra.subarray(0, recordLen))) return cand;
    } catch { /* offset errado */ }
  }
  return -1;
}

/** Header + descompactação + validação → { header, dados, sanos }. */
export function descompactar(buf) {
  const header = lerHeaderDbf(buf);
  const inicio = acharInicioComprimido(buf, header);
  if (inicio < 0) throw new Error("não achei o início do fluxo comprimido — o arquivo é um .dbc do DATASUS?");
  const dados = blast(buf, inicio, header.nRegistros * header.recordLen);
  const totalRec = Math.floor(dados.length / header.recordLen);
  if (totalRec !== header.nRegistros) {
    throw new Error(`descompactação incompleta: ${totalRec} registros, esperado ${header.nRegistros}`);
  }
  return { header, dados };
}

// ── AGREGAÇÃO ───────────────────────────────────────────────

export function mediana(arr) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

const numDbf = (s) => { const v = Number(String(s).replace(",", ".")); return Number.isFinite(v) ? v : 0; };
const MIN_CID = 2; // CID visto ao menos 2× com o procedimento = compatível (1× costuma ser erro de digitação isolado)
const cidLimpo = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Os códigos de procedimento (10 dígitos) que o HNSN fatura, do seed. */
export function lerCodigosSeed(seedSql) {
  return [...new Set([...seedSql.matchAll(/\('20\d\d-\d\d','(\d{10})'/g)].map((m) => m[1]))];
}

/** A competência nominal do seed (a coluna que o UPDATE casa). */
export function competenciaSeed(seedSql) {
  return (seedSql.match(/\('(20\d\d-\d\d)','\d{10}'/) || [])[1] || null;
}

/**
 * Agrega valor (mediana de SH/SP, centavos) e permanência (média real) por
 * procedimento, só para os `codigos` do HNSN. `cnes` opcional filtra um
 * hospital. Deriva a competência e a UF do próprio arquivo (ANO/MES_CMPT, UF_ZI).
 */
export function agregarValores({ header, dados }, codigos, { cnes = null } = {}) {
  const { recordLen, campoPorNome, nRegistros } = header;
  const alvo = new Set(codigos);
  const agg = new Map();
  let uf = null, anoCmpt = null, mesCmpt = null, usados = 0;
  for (let i = 0; i < nRegistros; i++) {
    const rec = dados.subarray(i * recordLen, (i + 1) * recordLen);
    if (cnes && campoDe(rec, campoPorNome, "CNES") !== cnes) continue;
    if (uf == null) {
      uf = campoDe(rec, campoPorNome, "UF_ZI").slice(0, 2);
      anoCmpt = campoDe(rec, campoPorNome, "ANO_CMPT");
      mesCmpt = campoDe(rec, campoPorNome, "MES_CMPT");
    }
    usados++;
    const proc = campoDe(rec, campoPorNome, "PROC_REA");
    if (!alvo.has(proc)) continue;
    const g = agg.get(proc) || { sh: [], sp: [], perm: [], cid: new Map() };
    g.sh.push(numDbf(campoDe(rec, campoPorNome, "VAL_SH")));
    g.sp.push(numDbf(campoDe(rec, campoPorNome, "VAL_SP")));
    g.perm.push(numDbf(campoDe(rec, campoPorNome, "DIAS_PERM")));
    const cid = cidLimpo(campoDe(rec, campoPorNome, "DIAG_PRINC"));
    if (cid) g.cid.set(cid, (g.cid.get(cid) || 0) + 1);
    agg.set(proc, g);
  }
  const linhas = [];
  for (const codigo of codigos) {
    const g = agg.get(codigo);
    if (!g) continue;
    linhas.push({
      codigo,
      valorSh: Math.round(mediana(g.sh) * 100),
      valorSp: Math.round(mediana(g.sp) * 100),
      media: Math.round(g.perm.reduce((a, b) => a + b, 0) / g.perm.length),
      // CIDs compatíveis: os vistos ao menos MIN_CID vezes com este procedimento
      // nas AIHs reais. É a base da glosa "CID atípico" (atenção, não bloqueio).
      cids: [...g.cid].filter(([, c]) => c >= MIN_CID).map(([cid]) => cid).sort(),
      n: g.sh.length,
    });
  }
  return { linhas, uf, anoCmpt, mesCmpt, aihUsadas: usados };
}

// ── SQL ─────────────────────────────────────────────────────

const UFS = {
  "11": ["RO", "Rondônia"], "12": ["AC", "Acre"], "13": ["AM", "Amazonas"], "14": ["RR", "Roraima"],
  "15": ["PA", "Pará"], "16": ["AP", "Amapá"], "17": ["TO", "Tocantins"], "21": ["MA", "Maranhão"],
  "22": ["PI", "Piauí"], "23": ["CE", "Ceará"], "24": ["RN", "Rio Grande do Norte"], "25": ["PB", "Paraíba"],
  "26": ["PE", "Pernambuco"], "27": ["AL", "Alagoas"], "28": ["SE", "Sergipe"], "29": ["BA", "Bahia"],
  "31": ["MG", "Minas Gerais"], "32": ["ES", "Espírito Santo"], "33": ["RJ", "Rio de Janeiro"], "35": ["SP", "São Paulo"],
  "41": ["PR", "Paraná"], "42": ["SC", "Santa Catarina"], "43": ["RS", "Rio Grande do Sul"], "50": ["MS", "Mato Grosso do Sul"],
  "51": ["MT", "Mato Grosso"], "52": ["GO", "Goiás"], "53": ["DF", "Distrito Federal"],
};
const MESES = ["", "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Monta o SQL da migração de valores (idempotente). */
export function gerarSqlValores(linhas, { compSeed, uf, anoCmpt, mesCmpt, arquivo, totalCodigos, cnes = null }) {
  const [sigla, nomeUf] = UFS[uf] || [uf, uf];
  const aa = String(anoCmpt).slice(2), mm = String(mesCmpt).padStart(2, "0");
  const origem = `datasus-sih-${sigla.toLowerCase()}-${aa}${mm}`;
  const quando = `${MESES[Number(mesCmpt)] || mesCmpt}/${anoCmpt}`;
  const escopo = cnes ? `pelo CNES ${cnes} (${nomeUf})` : `no ${nomeUf} (${sigla})`;

  const arrCid = (cids) => (cids && cids.length) ? `'{${cids.join(",")}}'::text[]` : `'{}'::text[]`;
  const updates = linhas.map((l) =>
    `update public.sigtap_procedimentos set valor_sh = ${l.valorSh}, valor_sp = ${l.valorSp}, media_permanencia = ${l.media}, cids = ${arrCid(l.cids)}, origem = '${origem}', updated_at = now() where competencia = '${compSeed}' and codigo = '${l.codigo}';`
  ).join("\n");
  const comCid = linhas.filter((l) => l.cids && l.cids.length).length;

  return `-- ============================================================
-- Valentrax — SIGTAP: valores, permanência e CID REAIS (SIH-SUS)
--
-- ⚠️ ARQUIVO GERADO — não edite à mão.
--    Regenere com:  node supabase/importar-aih.mjs <arquivo.dbc> [--cnes N]
--
-- Preenche, dos procedimentos que o HNSN fatura, a partir das AIHs REAIS
-- pagas ${escopo} em ${quando} (arquivo SIH-SUS ${arquivo}):
--   • valor_sh, valor_sp (centavos) e media_permanencia;
--   • cids[] — os CIDs compatíveis (base da glosa "CID atípico", que é ATENÇÃO).
--
-- MÉTODO: por procedimento, a MEDIANA de VAL_SH e VAL_SP (robusta aos casos
-- com UTI/complicação que inflam a média), a MÉDIA de DIAS_PERM, e os CIDs
-- (DIAG_PRINC) vistos ao menos 2× (1× costuma ser erro de digitação isolado).
-- ${linhas.length} dos ${totalCodigos} procedimentos tiveram AIH neste recorte
-- (${comCid} com CID); os demais ficam como estão.
--
-- POR QUE SH+SP: na AIH, VAL_SH cobre a permanência PADRÃO do procedimento;
-- a permanência acima da média é que vira diária a maior. Então SH+SP é o
-- valor-base do ato — as diárias da conta seguem informativas, sem duplicar.
--
-- É ADITIVO E IDEMPOTENTE: cria a coluna \`cids\` se não existir e faz UPDATE
-- de colunas; rodar duas vezes não faz mal. NÃO apaga tabela, coluna ou linha.
--
-- ⚠️ Roda no DEMO primeiro, depois no principal.
-- ============================================================

begin;

alter table public.sigtap_procedimentos add column if not exists cids text[];

${updates}

commit;

-- conferência (esperado: ${linhas.length} com valor)
select
  count(*) filter (where valor_sh is not null) as com_valor,
  count(*) as total
from public.sigtap_procedimentos where competencia = '${compSeed}';
`;
}

// ── CLI ─────────────────────────────────────────────────────
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const args = process.argv.slice(2);
  const cnes = (() => { const i = args.indexOf("--cnes"); return i >= 0 ? args[i + 1] : null; })();
  const arquivoDbc = args.find((a) => !a.startsWith("--") && a !== cnes);
  if (!arquivoDbc) {
    console.error("uso: node supabase/importar-aih.mjs <arquivo.dbc> [--cnes 1234567]");
    process.exit(1);
  }

  const seedSql = fs.readFileSync(path.join(dir, "migracao-sigtap.sql"), "utf8");
  const codigos = lerCodigosSeed(seedSql);
  const compSeed = competenciaSeed(seedSql);

  console.log(`lendo ${arquivoDbc}…`);
  const buf = fs.readFileSync(arquivoDbc);
  const { header, dados } = descompactar(buf);
  console.log(`  ${header.nRegistros.toLocaleString("pt-BR")} AIHs · ${header.campos.length} campos`);

  const { linhas, uf, anoCmpt, mesCmpt, aihUsadas } = agregarValores({ header, dados }, codigos, { cnes });
  const sql = gerarSqlValores(linhas, { compSeed, uf, anoCmpt, mesCmpt, arquivo: path.basename(arquivoDbc), totalCodigos: codigos.length, cnes });

  const saida = path.join(dir, "migracao-sigtap-valores.sql");
  fs.writeFileSync(saida, sql, "utf8");
  const comCid = linhas.filter((l) => l.cids && l.cids.length).length;
  console.log(`\nmigracao-sigtap-valores.sql gerado:`);
  console.log(`  ${linhas.length} de ${codigos.length} procedimentos com valor real` + (cnes ? ` (CNES ${cnes})` : ` (UF ${uf}, ${aihUsadas.toLocaleString("pt-BR")} AIHs)`));
  console.log(`  ${comCid} com CIDs compatíveis (acende a glosa de CID atípico)`);
  console.log(`  competência do seed: ${compSeed} · dado de ${MESES[Number(mesCmpt)]}/${anoCmpt}`);
  console.log(`\n⚠️ rode no DEMO primeiro, depois no principal.`);
}
