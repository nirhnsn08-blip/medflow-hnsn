// ═══════════════════════════════════════════════════════════
// COLUNA QUE O BANCO TEM E O CÓDIGO NUNCA CITA
//
// 🔴 ESTE DETECTOR NASCEU DE UM DEFEITO CLÍNICO (13/10/2026).
//
// `migracao-pep-sinais-spo2.sql` criou `o2_suplementar` dizendo, no próprio
// cabeçalho, para que servia: "o NEWS pontua o paciente em oxigênio mesmo
// com saturação normal". A caixa foi para a tela, a enfermagem marcava, o
// banco gravava — e `scoreAlertaPrecoce` NUNCA LEU o campo. Paciente em O₂
// saía dois pontos abaixo do que o NEWS manda, e o mesmo escore é o gatilho
// do protocolo de sepse.
//
// Ao lado dele, `o2_dispositivo` e `o2_fluxo` nunca tiveram nem campo.
//
// ⚠️ POR QUE ISSO É INVISÍVEL: coluna vazia não dá erro. Não quebra tela,
// não quebra teste, não quebra build. Só fica lá, parecendo que alguém
// cuidou do assunto.
//
// Esta varredura foi o que apontou o caso — então virou catraca.
//
// ⚠️⚠️ MAS ELE NÃO TERIA PEGO O DEFEITO DO ESCORE, e isso está medido:
// apagar a leitura do oxigênio dentro de `scoreAlertaPrecoce` NÃO deixa este
// teste vermelho, porque `o2_suplementar` continua citado pelo formulário.
// Ele enxerga coluna que NINGUÉM toca — não coluna que alguém escreve e
// quem precisa dela ignora.
//
// O que de fato aconteceu: ele apontou `o2_dispositivo` e `o2_fluxo`, os
// VIZINHOS da mesma migração, que não tinham nem campo. Puxar esse fio é
// que levou ao escore. Um detector que entrega a vizinhança do defeito já
// paga — desde que ninguém confunda isso com entregar o defeito.
//
// (Medido ao contrário também: tirar o campo de dispositivo/fluxo da tela
// deixa este teste vermelho nomeando as duas colunas.)
//
// ⚠️⚠️ E O QUE ELE NÃO É: proibição de coluna sem uso. Metade da lista
// congelada abaixo é funcionalidade PENSADA e não terminada (aprazamento,
// balanço hídrico, SOS com condição), e isso é dívida declarada, não erro.
// O que o teste impede é a lista CRESCER sem alguém decidir — porque foi
// assim que o oxigênio do NEWS passou dois anos ali.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(__dirname, "..");

/**
 * Colunas de infraestrutura: ninguém digita, ninguém lê por nome.
 * Mantê-las fora é o que impede o detector de virar ruído.
 */
const INFRA = new Set([
  "id", "created_at", "updated_at", "criado_em", "usuario", "user_id",
  "aplicada_em", "deleted_at",
]);

/**
 * A LISTA CONGELADA — o que já estava morto quando o detector nasceu.
 *
 * Cada linha aqui é dívida conhecida, não desculpa. Quando alguém terminar
 * o aprazamento, por exemplo, estas quatro saem daqui.
 */
const CONHECIDAS = new Set([
  // ✅ APRAZAMENTO — RESOLVIDO em 15/10/2026. As seis colunas desta família
  // (`pep_aprazamentos.*` e o elo em `pep_administracoes`) estavam aqui
  // desde que esta lista nasceu, com o motivo "nada lê, dose atrasada não
  // tem como ser detectada". Agora a enfermagem apraza de verdade e a
  // administração diz QUAL dose cumpriu. Saíram da lista por este teste —
  // foi ele que avisou que a dívida tinha sido paga.
  // Cadastro de pessoal — admissão, matrícula, validade do conselho.
  "profiles.admitido_em", "profiles.conselho_validade",
  "profiles.desligado_em", "profiles.matricula",
  // Prescrição: a CONDIÇÃO do "se necessário" (dipirona SOS — se dor? se
  // febre? a partir de quanto?), diluição e velocidade de infusão.
  "pep_prescricao_itens.condicao_sos", "pep_prescricao_itens.diluicao",
  "pep_prescricao_itens.velocidade_infusao",
  // Balanço hídrico e PAM.
  "pep_sinais_vitais.balanco_hidrico_ml", "pep_sinais_vitais.diurese_ml",
  "pep_sinais_vitais.pam",
  // Anamnese: CID suspeito e plano terapêutico.
  "pep_anamneses.cid_suspeito", "pep_anamneses.plano_terapeutico",
  // Substituição de prescrição / reconciliação / sumário.
  "pep_prescricoes.motivo_substituicao", "pep_prescricoes.validade_em",
  "pep_reconciliacoes.motivo_substituicao", "pep_sumarios_alta.motivo_substituicao",
  // Avulsas.
  "cc_cirurgias.consentimento_em",   // hora do consentimento informado
  "cc_opme.movimento_id",            // o elo com o kardex, gravado pelo gatilho
  "farm_validacoes.intervencao_id",
  "mat_alojamento.dificuldades",
  "nsp_acoes.evidencia",
  "pep_evolucoes.subjetivo",
  "sigtap_procedimentos.usado_hnsn",
]);

function arquivos(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) arquivos(p, acc);
    else if (/\.(js|jsx|mjs)$/.test(e.name) && !/\.test\./.test(e.name)) acc.push(p);
  }
  return acc;
}

function mortas() {
  const aud = fs.readFileSync(path.join(RAIZ, "supabase/auditoria-banco.sql"), "utf8");
  const bloco = aud.match(/colunas\(tabela, coluna[^)]*\) as \(values([\s\S]*?)\n\),/);
  if (!bloco) throw new Error("não achei o bloco `colunas(...)` em auditoria-banco.sql");
  const colunas = [...bloco[1].matchAll(/\('([a-z0-9_]+)',\s*'([a-z0-9_]+)'/g)]
    .map(m => ({ tabela: m[1], coluna: m[2] }));

  const fontes = arquivos(path.join(RAIZ, "src"))
    .concat(arquivos(path.join(RAIZ, "supabase")).filter(f => f.endsWith(".mjs")));
  const codigo = fontes.map(f => fs.readFileSync(f, "utf8")).join("\n");

  return colunas
    .filter(({ coluna }) => !INFRA.has(coluna))
    .filter(({ coluna }) => !new RegExp(`\\b${coluna}\\b`).test(codigo))
    .map(({ tabela, coluna }) => `${tabela}.${coluna}`);
}

describe("🔴 coluna que o banco tem e o código nunca cita", () => {
  it("a varredura encontra as colunas do banco", () => {
    // Se o recorte do auditoria-banco.sql quebrar, a lista vem vazia e o
    // teste passaria sem olhar nada — a mentira preferida deste projeto.
    const aud = fs.readFileSync(path.join(RAIZ, "supabase/auditoria-banco.sql"), "utf8");
    const bloco = aud.match(/colunas\(tabela, coluna[^)]*\) as \(values([\s\S]*?)\n\),/);
    expect([...bloco[1].matchAll(/\('([a-z0-9_]+)',/g)].length).toBeGreaterThan(1000);
  });

  it("🔴 nenhuma coluna NOVA ficou sem ninguém que a leia ou escreva", () => {
    const novas = mortas().filter(c => !CONHECIDAS.has(c));
    expect(novas,
      `coluna(s) criadas e nunca usadas:\n  ${novas.join("\n  ")}\n\n` +
      "→ Ou alguém lê/escreve a coluna, ou a migração não deveria tê-la criado. " +
      "Se for dívida consciente, acrescente em CONHECIDAS com o motivo — " +
      "foi assim que o oxigênio do NEWS passou despercebido."
    ).toEqual([]);
  });

  it("a lista congelada não guarda coluna que já foi resolvida", () => {
    // Dívida paga sai da lista: senão ela vira folclore, e ninguém mais sabe
    // o que de fato falta.
    const atuais = new Set(mortas());
    const resolvidas = [...CONHECIDAS].filter(c => !atuais.has(c));
    expect(resolvidas,
      `já estão em uso e podem sair de CONHECIDAS:\n  ${resolvidas.join("\n  ")}`
    ).toEqual([]);
  });
});
