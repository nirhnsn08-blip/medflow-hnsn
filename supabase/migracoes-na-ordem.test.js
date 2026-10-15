// ═══════════════════════════════════════════════════════════
// TODA MIGRAÇÃO ENTRA NO SCRIPT DE BANCO NOVO
//
// 🔴 ESTE TESTE NASCEU DE DUAS OMISSÕES REAIS, achadas em 07/10/2026.
//
// `gerar-reconstrucao.mjs` monta `reconstruir-banco.sql` a partir de uma
// lista `ORDEM` escrita à mão, e tem uma trava que recusa gerar quando
// aparece um `migracao-*.sql` fora da lista. A trava funciona — mas **só
// dispara quando alguém roda o gerador**, e nenhum teste rodava.
//
// Resultado: `migracao-descricao-aux-farmacia.sql` (PR #255, 05/10) e
// `migracao-correcao-desfecho.sql` (PR #261, 06/10) ficaram FORA por dias,
// com o CI verde o tempo todo. Enquanto estiveram fora, um HOSPITAL NOVO
// montado a partir do `reconstruir-banco.sql` nasceria sem a trilha de
// correção de desfecho inteira — tabela, gatilho e políticas — e com a
// descrição errada do perfil Auxiliar de Farmácia.
//
// 💡 Isto importa porque o sistema é PARA VENDA: banco novo não é cenário
// hipotético, é o primeiro dia de cada cliente. E a falha é silenciosa — o
// banco sobe inteiro, só sem a feature.
//
// O teste não refaz a trava: ele confere o PRODUTO dela, que é o arquivo
// gerado. Assim pega tanto a migração fora da ORDEM quanto a ORDEM certa
// com o arquivo não regerado.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const DIR = path.resolve(__dirname);

const migracoes = () =>
  fs.readdirSync(DIR)
    .filter(f => f.startsWith("migracao-") && f.endsWith(".sql"))
    .sort();

const reconstrucao = () => fs.readFileSync(path.join(DIR, "reconstruir-banco.sql"), "utf8");

/**
 * O SQL sem os comentários.
 *
 * ⚠️ Necessário, e descoberto por mutação: estes arquivos EXPLICAM o defeito
 * em prosa, então a frase da recusa aparece duas vezes — no `raise exception`
 * e no cabeçalho que conta a história. Uma asserção crua passava verde com a
 * exceção apagada, porque achava o texto no comentário.
 */
const semComentario = sql =>
  sql.split(/\r?\n/).map(l => l.replace(/--.*$/, "")).join("\n");

/** Os scripts que o arquivo gerado REALMENTE contém, pelo cabeçalho de cada um. */
const noArquivoGerado = () => {
  const dentro = new Set();
  for (const m of reconstrucao().matchAll(/^-- │ \d+\/\d+ — (\S+)$/gm)) dentro.add(m[1]);
  return dentro;
};

describe("reconstruir-banco.sql contém todas as migrações", () => {
  it("o arquivo gerado tem cabeçalho para cada script", () => {
    expect(noArquivoGerado().size).toBeGreaterThan(50);
  });

  it("🔴 nenhuma migração ficou de fora do script de banco novo", () => {
    const dentro = noArquivoGerado();
    const faltando = migracoes().filter(f => !dentro.has(f));
    // A mensagem diz o que fazer, porque quem vai ler isto é quem acabou de
    // criar a migração: acrescentar em ORDEM e rodar o gerador.
    expect(faltando, `fora do reconstruir-banco.sql: ${faltando.join(", ")}\n` +
      "→ acrescente em supabase/gerar-reconstrucao.mjs (ORDEM, posição cronológica) " +
      "e rode `node supabase/gerar-reconstrucao.mjs`").toEqual([]);
  });

  it("a trilha de correção de desfecho nasce no banco novo", () => {
    // O caso concreto que estava faltando. Tabela, gatilho e a trava do
    // motivo — se o banco novo subir sem isso, a tela de correção existe e
    // não funciona.
    const sql = semComentario(reconstrucao());
    // O parêntese não é enfeite: sem ele, `toContain` casaria com
    // `at_desfecho_correcoes_OUTRA` — a mutação provou que casava.
    expect(sql).toContain("create table if not exists public.at_desfecho_correcoes (");
    expect(sql).toContain("trg_at_corrige_desfecho");
    expect(sql).toContain("at_desf_corr_motivo_ck");
  });
});

describe("a recusa por corrida tem o lock", () => {
  const corrida = () =>
    fs.readFileSync(path.join(DIR, "migracao-correcao-desfecho-corrida.sql"), "utf8");

  // ⚠️ ESTE É UM GUARDA DE TEXTO, não prova de comportamento — e a diferença
  // é o que torna este caso instrutivo. Concorrência não se testa aqui: o
  // PGlite tem uma conexão só, e foi exatamente por isso que o defeito
  // passou por "provado" no PR #261. A prova vive no banco, com dois
  // pedidos paralelos (medido no demo em 07/10: antes, 201 + 201 e duas
  // trilhas para uma correção; depois, 201 + 400).
  //
  // O que este teste faz é impedir que o `for update` seja apagado por
  // alguém "limpando" a função sem saber por que ele está lá.
  it("🔴 a leitura do desfecho trava a linha antes de conferir", () => {
    expect(corrida()).toMatch(
      /select \* into atual\s+from public\.ps_atendimentos\s+where id = new\.atendimento_id\s+for update;/
    );
  });

  /**
   * SÓ o corpo da função, entre os delimitadores `$at_corr$`.
   *
   * Também achado por mutação: a própria migração confere a si mesma com
   * `prosrc like '%releia antes de corrigir%'` na seção de conferência. Uma
   * asserção sobre o arquivo inteiro achava a frase ALI e passava verde com
   * o `raise exception` apagado — o guarda estava guardando a própria
   * conferência, não o código.
   */
  const corpoDaFuncao = () => {
    const sql = semComentario(corrida());
    const m = /as \$at_corr\$([\s\S]*?)end \$at_corr\$/.exec(sql);
    if (!m) throw new Error("não achei o corpo da função entre $at_corr$");
    return m[1];
  };

  it("as quatro recusas continuam no corpo substituído", () => {
    const sql = corpoDaFuncao();
    expect(sql).toContain("releia antes de corrigir");          // corrida / de vencido
    expect(sql).toContain("ÓBITO");                             // óbito não se desfaz
    expect(sql).toContain("cancele a conta primeiro");          // conta fechada/faturada
    expect(sql).toContain("Nada foi registrado");               // o "204 mentiroso" do update
    // E cada uma tem de ser um `raise exception`, não um texto solto.
    expect((sql.match(/raise exception/g) || []).length).toBeGreaterThanOrEqual(5);
  });

  it("o lock chegou ao script de banco novo", () => {
    expect(semComentario(reconstrucao())).toMatch(/where id = new\.atendimento_id\s+for update;/);
  });
});
