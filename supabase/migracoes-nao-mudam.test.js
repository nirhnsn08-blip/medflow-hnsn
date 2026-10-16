// @vitest-environment node
// ═══════════════════════════════════════════════════════════
// MIGRAÇÃO QUE MUDOU DEPOIS DE JÁ TER RODADO
//
// 🔴 ESTE DETECTOR NASCEU DE UM PONTO CEGO REAL (15/10/2026).
//
// `migracao-documento-impressao-digital.sql` rodou nos bancos. Depois eu
// achei um defeito nela — o gatilho recarimbava a digital no UPDATE, o que
// anulava a camada inteira — e corrigi o arquivo.
//
// E NENHUMA FERRAMENTA DESTE PROJETO SABIA DIZER se a correção tinha
// chegado ao banco:
//
//   · `conferir-migracoes.sql` compara NOMES de arquivo com
//     `migracoes_aplicadas`. O nome não mudou, então ele dizia "em dia";
//   · a sonda REST enxerga ESTRUTURA (tabela, coluna) e não corpo de
//     função — e a correção estava dentro de uma função;
//   · `migracoes_aplicadas` guarda `arquivo`, não qual VERSÃO dele rodou.
//
// Resultado: o único jeito de saber era perguntar ao usuário, e o único
// jeito de ele saber era lembrar. Isso não é processo, é sorte.
//
// 💡 O QUE ESTE TESTE FAZ, E O QUE NÃO FAZ
//
// Ele NÃO sabe o estado do banco — nada no repositório sabe. O que ele
// sabe, e é o que falta ser dito, é: **este arquivo mudou depois de
// declarado pronto**. Quem muda uma migração já publicada tem de rodá-la
// de novo nos DOIS bancos, e o registro abaixo é onde essa decisão fica
// visível em vez de depender de memória.
//
// ⚠️ A FRICÇÃO É O PONTO. Atualizar o registro é um ato consciente que
// significa "eu rodei isto nos dois bancos". Automatizar a atualização
// transformaria o detector num carimbo.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const DIR = path.resolve(__dirname);
const REGISTRO = path.join(DIR, "migracoes-versoes.json");

/** O mesmo recorte de "o que é migração" dos outros geradores. */
function migracoes() {
  return fs.readdirSync(DIR)
    .filter(f => f === "schema.sql" || (f.startsWith("migracao-") && f.endsWith(".sql")))
    .sort();
}

const hashDe = f =>
  createHash("sha256").update(fs.readFileSync(path.join(DIR, f))).digest("hex").slice(0, 16);

const registro = () =>
  fs.existsSync(REGISTRO) ? JSON.parse(fs.readFileSync(REGISTRO, "utf8")) : {};

describe("🔴 migração publicada não muda em silêncio", () => {
  it("o registro de versões existe e cobre o que está no disco", () => {
    // Se o arquivo sumir ou vier vazio, tudo abaixo passaria sem olhar
    // nada — a mentira preferida deste projeto.
    const r = registro();
    expect(Object.keys(r).length, "o registro de versões está vazio").toBeGreaterThan(100);
  });

  it("🔴 nenhuma migração MUDOU depois de registrada", () => {
    const r = registro();
    const mudaram = migracoes()
      .filter(f => r[f] && r[f] !== hashDe(f));

    expect(mudaram,
      `Estas migrações MUDARAM depois de registradas:\n  ${mudaram.join("\n  ")}\n\n` +
      "→ `migracoes_aplicadas` guarda o NOME do arquivo, não a versão: ele vai\n" +
      "  continuar dizendo que está em dia, e a sonda REST não enxerga corpo de\n" +
      "  função. Então ninguém vai te avisar além deste teste.\n\n" +
      "  Se a mudança é só comentário, atualize o registro:\n" +
      "      node supabase/registrar-versoes.mjs\n\n" +
      "  Se a mudança altera COMPORTAMENTO, rode a migração de novo nos DOIS\n" +
      "  bancos ANTES de atualizar o registro — senão o registro passa a mentir."
    ).toEqual([]);
  });

  it("⏳ ESPERANDO O SQL RODAR: nenhuma migração sem versão registrada", () => {
    // ⚠️ VERMELHO AQUI NÃO É CÓDIGO QUEBRADO — é a entrega esperando o
    // passo que falta. A regra do projeto sempre foi "só mergear depois de
    // rodar o SQL nos DOIS bancos"; isto a transforma de regra humana em
    // regra de máquina, que é o ponto.
    //
    // ⚠️ E deixar passar abriria o buraco de verdade: arquivo que nunca
    // entrou no registro pode ser MUDADO depois sem nada acusar, porque o
    // detector de alteração só olha o que está registrado.
    const r = registro();
    const novas = migracoes().filter(f => !r[f]);
    expect(novas,
      `⏳ Migração aguardando o SQL rodar:\n  ${novas.join("\n  ")}\n\n` +
      "→ Isto NÃO é defeito de código. É a ordem acordada:\n" +
      "      1. rodar no demo  →  2. caminhar  →  3. rodar no principal\n" +
      "      4. node supabase/registrar-versoes.mjs --aplicar\n" +
      "      5. merge\n\n" +
      "  O passo 4 é a AFIRMAÇÃO de que rodou nos dois. Rodá-lo antes faz o\n" +
      "  registro mentir, e aí ele fica pior que não existir."
    ).toEqual([]);
  });

  it("o registro não guarda arquivo que não existe mais", () => {
    // Migração apagada e registro sobrando vira folclore: ninguém mais sabe
    // o que de fato roda.
    const noDisco = new Set(migracoes());
    const sobrando = Object.keys(registro()).filter(f => !noDisco.has(f));
    expect(sobrando,
      `O registro cita arquivo que não existe mais:\n  ${sobrando.join("\n  ")}`
    ).toEqual([]);
  });
});
