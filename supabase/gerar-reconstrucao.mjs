// ============================================================
// Valentrax — GERADOR DO SCRIPT DE RECONSTRUÇÃO DO BANCO
//
// Junta todos os .sql de supabase/ na ordem cronológica correta e produz
// `reconstruir-banco.sql`: um único arquivo que levanta um banco Valentrax
// completo, do zero.
//
//     node supabase/gerar-reconstrucao.mjs
//
// PARA QUE SERVE
//  1. Nivelar o banco demo com o principal (ambiente de teste confiável).
//  2. Subir um hospital novo — o modelo é 1 banco por hospital.
//  3. Backup da ESTRUTURA: com este arquivo o schema é recriável a
//     qualquer momento. (Não é backup de DADOS — isso é o PITR/dump
//     do próprio Supabase.)
//
// POR QUE RECONSTRUIR EM VEZ DE REMENDAR
// Coluna declarada dentro do `create table` nunca é corrigida por migração
// posterior — `create table if not exists` pula a tabela que já existe, e
// só as colunas adicionadas via `alter table` são alcançadas. Uma tabela
// nascida de uma versão antiga do schema fica torta para sempre. Recriar
// do zero elimina essa classe de erro inteira.
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

// Ordem de aplicação = ordem cronológica em que rodaram no banco principal
// (obtida do histórico do git). A ordem importa: migração mexe em tabela
// que a anterior criou. NÃO reordenar sem conferir dependência.
const ORDEM = [
  "schema.sql",
  // FORA DA ORDEM CRONOLÓGICA DE PROPÓSITO (nasceu em 27/08/2026).
  // Ela cria `migracoes_aplicadas`, e desde 27/08 toda migração termina se
  // anotando nessa tabela — inclusive arquivos que já estavam na ORDEM bem
  // antes dela (nsp-protocolos, faturamento-glosas, rls-leitura), porque a
  // linha foi acrescentada a eles DEPOIS, todos de uma vez. Na posição
  // cronológica, o insert do nsp-protocolos rodaria contra tabela inexistente
  // e o banco novo morreria no meio da criação. Aqui a tabela existe antes da
  // primeira anotação. Não depende de nada além de `pacientes` (usada no
  // recibo), que vem do schema.sql acima.
  "migracao-registro-de-migracoes.sql",
  "migracao-farmacia-faseA.sql",
  "migracao-farmacia-seed.sql",
  "migracao-farmacia-faseB.sql",
  "migracao-farmacia-clinica-fase1.sql",
  "migracao-farmacia-clinica-fase2.sql",
  "migracao-farmacia-clinica-fase3.sql",
  "migracao-farmacia-preparo.sql",
  "migracao-farmacia-custos.sql",
  "migracao-farmacia-nao-padronizados.sql",
  "migracao-farmacia-intervencoes.sql",
  "migracao-leitos-kanban-metas.sql",
  "migracao-leitos-saida-setor.sql",
  "migracao-suprimentos-faseA.sql",
  "migracao-suprimentos-faseB.sql",
  "migracao-suprimentos-seed.sql",
  "migracao-suprimentos-faseC.sql",
  "migracao-suprimentos-inventario.sql",
  "migracao-suprimentos-ponto-de-pedido.sql",
  "migracao-suprimentos-cotacao.sql",
  "migracao-ps-salas.sql",
  "migracao-ps-salas-censo.sql",
  "migracao-ps-origem-elo.sql",
  "migracao-ps-checagem-medicacao.sql",
  "migracao-pep-fase1.sql",
  "migracao-pep-acessos.sql",
  "migracao-pep-sinais-spo2.sql",
  "migracao-pep-categoria-profissional.sql",
  "migracao-pep-perfis-update.sql",
  "migracao-pep-fase3.sql",
  "migracao-perfis-acesso.sql",
  "migracao-leitos-nir-regulacao.sql",
  "migracao-suprimentos-aprovacao.sql",
  "migracao-ps-comorbidades.sql",
  "migracao-ps-triagem-tipo.sql",
  "migracao-ps-faixas-pediatricas.sql",
  "migracao-ps-faixas-obstetricas.sql",
  "migracao-enf-escalas-lpp.sql",
  "migracao-enf-sae.sql",
  "migracao-pacientes-identificacao.sql",
  "migracao-atendimento-recepcao.sql",
  // A FK vem depois de propósito — ver o cabeçalho do arquivo. Num banco
  // novo a ordem não muda nada (não há código antigo no ar); a separação
  // existe para o banco que JÁ está rodando.
  "migracao-atendimento-fk.sql",
  "migracao-nsp-incidentes.sql",
  "migracao-atendimento-fase2.sql",
  "migracao-atendimento-agenda.sql",
  "migracao-nsp-rca-plano.sql",
  "migracao-atendimento-ciclo.sql",
  "migracao-nsp-metas.sql",
  "migracao-nsp-protocolos.sql",
  "migracao-atendimento-responsavel.sql",
  "migracao-atendimento-faturamento.sql",
  // Glosa recebida e recurso. Depois da conta, porque referencia at_contas
  // e at_conta_itens.
  "migracao-faturamento-glosas.sql",
  // As politicas da at_glosas, logo apos a tabela. Redundante num banco novo
  // (o rls-leitura no fim recria pelos mesmos nomes) e necessario nos bancos
  // que ja existem, onde o arquivo de 41 KB nao cabe no editor.
  //
  // Ele abre com `set valentrax.quem` (conveniência de quem roda à mão) e
  // FECHA com `reset valentrax.quem`. O reset foi acrescentado depois que
  // esta lista apontou o vazamento: `set` vale até o fim da SESSÃO, e aqui
  // 87 scripts rodam numa sessão só — sem o reset, todos os de baixo se
  // registrariam como aplicados por 'adauam'.
  "migracao-glosas-rls.sql",
  // O repasse: o dinheiro que entrou. Depois da conta (FK) e junto com as
  // proprias politicas, pelo mesmo motivo do arquivo acima.
  "migracao-faturamento-repasses.sql",
  // Preco por convenio, com vigencia. Depois de at_convenios (FK) e traz a
  // extensao btree_gist, que a trava de sobreposicao exige.
  "migracao-faturamento-precos.sql",

  // 🔴 DEPOIS das três acima, sempre: ela MOVE as políticas delas para o
  // módulo `faturamento`. Rodando antes, as migrações originais recriariam
  // as políticas em `atendimento` por cima e o conserto sumiria.
  "migracao-faturamento-modulo.sql",

  // As especialidades do ambulatório saem do código e vão para o cadastro
  // (`at_dominios`). Depois do `atendimento-fase2`, que cria a tabela.
  "migracao-ambulatorio-especialidades.sql",
  "migracao-nsp-capacitacoes.sql",
  "migracao-nsp-comunicados.sql",
  // Módulo Protocolos Clínicos (PR #67 da Laura). Ela criou o arquivo mas não
  // o pôs na ORDEM nem regerou este script — a trava do gerador teria
  // quebrado ao subir um banco novo. Entra aqui, na posição cronológica.
  "migracao-protocolos.sql",
  // Fase 3b/3c/3d — seeds de IAM, AVC e TEV sobre as tabelas prot_* criadas
  // acima. Mesma pegadinha da linha anterior: os arquivos existiam mas não
  // entraram na ORDEM nem regeraram este script (a trava pegou ao rodar).
  "migracao-protocolos-iam.sql",
  "migracao-protocolos-avc.sql",
  "migracao-protocolos-tev.sql",
  // Redundante num banco novo (o seed de perfis-acesso já traz os grants de
  // NSP), mas fica na ordem porque é o que os bancos JÁ existentes rodaram.
  "migracao-perfis-nsp.sql",
  // Fase 4 (Faturamento SUS) — tabela de procedimentos do SUS (referência,
  // sem paciente). Antes do RLS abaixo, que cobre também as tabelas sigtap_*.
  "migracao-sigtap.sql",
  // Valores (SH/SP) e permanência REAIS dos 219, das AIHs do SIH-SUS (RS,
  // jun/2026). Depois do seed acima (que cria a tabela e semeia sem valor).
  "migracao-sigtap-valores.sql",
  // Grants do módulo Faturamento para os bancos que já rodaram o seed
  // (mesmo motivo do migracao-perfis-nsp.sql). Redundante num banco novo.
  "migracao-perfis-faturamento.sql",
  // Ajuste de grant existente (escrita→leitura na Auditoria do diretor): UPDATE,
  // não seed — `on conflict do nothing` não troca linha que já existe.
  "migracao-perfis-auditoria-diretor.sql",
  // Integridade do saldo do almoxarifado: CHECK de tipo, saldo não-negativo,
  // `for update` no trigger de saldo e bloqueio da exclusão de material com
  // histórico. Não cria tabela e não toca em política — por isso entra ANTES
  // do rls-leitura, preservando a regra de que ele é o último.
  "migracao-suprimentos-integridade.sql",
  // Ajuste de inventário rastreável (autorizado_por, ajuste_erro) e estorno
  // com vínculo (`estorno_de` + índice único + trigger que exige o oposto
  // exato). Depende do arquivo acima, que recria o trigger de saldo.
  "migracao-suprimentos-ajuste-estorno.sql",
  // Unidade de compra × unidade de consumo (`unidade_compra`,
  // `fator_conversao` + CHECK > 0). Sem isso, custo médio, curva ABC,
  // ponto de pedido e total do pedido misturam caixa com unidade.
  "migracao-suprimentos-unidade-compra.sql",
  // Trilha de auditoria atribuível: `usuario_id` carimbado pelo banco
  // (`default auth.uid()`), política de insert que impede assinar no lugar
  // de outro, e índices para a tela paginar. Não cria tabela — entra antes
  // do rls-leitura, que segue por último.
  "migracao-auditoria-atribuivel.sql",
  // Alçada de aprovação de compra: tabela de parâmetros chave/valor, escrita
  // restrita a adm_master e CHECK de valor positivo. Nasce DESLIGADA.
  "migracao-suprimentos-alcada.sql",
  // Busca de paciente por nome: coluna gerada `nome_busca` (maiúscula, sem
  // acento, com nome de registro + social + da mãe) e índice GIN de trigrama.
  // Não cria tabela e não toca em política — entra antes do rls-leitura,
  // preservando a regra de que ele é o último.
  "migracao-pacientes-busca.sql",
  // A vaga da agenda passa a ser do PROFISSIONAL, não da especialidade:
  // troca o índice único `ag_agend_vaga_unica` por `ag_agend_vaga_unica_prof`.
  // Precisa vir DEPOIS da migração que cria `ag_agendamentos`, e não toca em
  // política — por isso entra antes do rls-leitura, que segue por último.
  "migracao-agenda-vaga-por-profissional.sql",
  // Confirmacao da vespera (status novo + colunas) e motivo da falta.
  // Recria o CHECK de status e o indice unico da vaga para conhecerem
  // `confirmado` — sem isso, quem confirma libera o horario para outro.
  // Nao toca em politica: entra antes do rls-leitura, que segue por ultimo.
  "migracao-agenda-confirmacao.sql",
  // Paciente estrangeiro (pais de nascimento, passaporte) e etnia indigena.
  // So colunas novas e um UPDATE que recupera o pais escrito no campo livre
  // de nacionalidade. Sem CHECK: a conferencia do cadastro nunca bloqueia.
  "migracao-pacientes-nacionalidade-etnia.sql",
  // Remarcacao com vinculo: `remarcado_de` + `remarcacao_motivo`, a trava
  // contra elo circular e o indice unico que faz a corrente ser corrente e
  // nao arvore. NAO toca no CHECK de status nem no indice da vaga — o
  // original continua indo para `cancelado`. Antes do rls-leitura.
  "migracao-agenda-remarcacao.sql",
  // O obito chega ao cadastro: dois triggers (desfecho do PS e saida de
  // leito) que carimbam `pacientes.obito`, mais o backfill do que ja estava
  // gravado. Depende das tres tabelas criadas acima. Nao toca em politica.
  "migracao-pacientes-obito.sql",
  // O recem-nascido entra no sistema: vinculo com a mae, DNV, hora e ordem
  // do parto. O indice unico da DNV e o que sustenta a regra que separa
  // gemeos de duplicata — sem ele, dois bebes poderiam virar um prontuario.
  "migracao-pacientes-recem-nascido.sql",
  // Código IBGE do município de residência (26/08). Uma coluna e um CHECK de
  // 7 dígitos em `pacientes` — a AIH e o BPA recusam o nome por extenso.
  "migracao-pacientes-municipio-ibge.sql",
  // Remessa transmitida (26/08): três colunas em `at_contas` e o trigger que
  // impede `faturada` de reabrir. Depois de atendimento-faturamento, que cria
  // a conta, e depois de faturamento-glosas, porque `glosada` é a única saída
  // da `faturada` que o trigger admite.
  "migracao-faturamento-remessa.sql",
  // Unificação de prontuário (26/08): o PONTEIRO entre duas fichas da mesma
  // pessoa (quatro colunas em `pacientes`) e a trava contra cadeia.
  "migracao-pacientes-unificacao.sql",
  // A prescrição só fica "pronta" se saiu do estoque (26/08). Trigger sobre
  // `farm_preparo`, lendo `farm_movimentos` — as duas já criadas acima.
  "migracao-farmacia-preparo-exige-baixa.sql",
  // Lote vencido não vai para o paciente (26/08), mas SAI por descarte. Só um
  // trigger sobre o movimento da farmácia.
  "migracao-farmacia-lote-vencido.sql",
  // Abre o episódio de quem já estava internado (27/08). Lê `leitos` e escreve
  // em `pep_episodios`. Num banco NOVO não há internação para converter e ele
  // não faz nada — entra porque tirá-lo da ORDEM faria o próximo hospital
  // nascer com uma migração a menos no registro.
  "migracao-pep-episodio-retroativo.sql",
  // `episodio_id` das tabelas de enfermagem: uuid → bigint (27/08). Corrige o
  // tipo em oito tabelas de enfermagem e no `nsp_incidentes`, todas criadas
  // acima — por isso vem depois delas.
  "migracao-episodio-id-tipo.sql",
  // Farmácia ganha estorno com vínculo e inventário cíclico (27/08) — as mesmas
  // regras que o almoxarifado já tinha. Cria `farm_inventarios` e recria o
  // trigger de saldo, então vem depois de toda a farmácia acima.
  "migracao-farmacia-estorno-inventario.sql",
  // SCIH: base de germes inicial (27/08). `scih_germes` vem do schema.sql
  // vazia; sem o seed a tela não sugere isolamento nem marca multirresistente.
  // Idempotente — não sobrescreve o que a CCIH já tiver editado.
  "migracao-scih-germes-seed.sql",
  // Por último de propósito: reescreve as políticas de SELECT de TODAS as
  // tabelas criadas acima — inclusive as da Laura, que subiram SEM RLS. Num
  // banco novo, é o que impede o hospital de nascer com a leitura aberta.
  "migracao-rls-leitura.sql",
];

// Trava de segurança: migração nova que ninguém acrescentou em ORDEM
// ficaria de fora silenciosamente — o mesmo erro que já cegou a auditoria
// duas vezes. Aqui isso para o gerador.
//
// O QUE CONTA COMO MIGRAÇÃO: `schema.sql` e os arquivos `migracao-*`. É a
// MESMA regra do `gerar-conferencia.mjs`, e de propósito: duas definições de
// "migração" no mesmo diretório divergem, e a divergência só aparece como
// tabela faltando num banco novo — tarde demais.
//
// ⚠️ REGRA POSITIVA, NÃO LISTA DE EXCEÇÕES. A versão anterior enumerava os
// prefixos a IGNORAR, então toda família NOVA de ferramenta caía como
// "migração esquecida" e travava o gerador sem haver nada de errado nela —
// foi o que aconteceu com `teste-trigger-*`, `limpeza-demo-*`,
// `conferir-migracoes` e `anotar-migracoes-existentes`: 17 arquivos, e o
// gerador parado desde 26/08/2026. Nomear o que ENTRA não tem esse buraco.
//
// O que fica de fora, e por quê:
//   • `seed-teste-*`     DADO fictício. Entrar aqui plantaria 70 pacientes
//                        inventados no banco de um hospital novo — o oposto
//                        do que este script serve.
//   • `auditoria-*`      LEITURA. Rodam à mão depois de uma migração, para
//     `conferencia-*`    ver se ela pegou. Não criam nem alteram nada, e
//     `conferir-*`       entrariam como `select` solto no meio da criação.
//   • `teste-trigger-*`  PROVA de trigger: escrevem e desfazem em linha de
//                        paciente REAL. Num banco recém-criado não há o que
//                        provar — eles próprios devolvem "INCONCLUSIVO".
//   • `limpeza-demo-*`   APAGAM. Ferramenta do banco demo, e só dele.
//   • `anotar-migracoes- GERADO, e roda UMA VEZ por banco DEPOIS deste
//     existentes.sql`    script — ver a instrução no fim do arquivo gerado.
const noDisco = fs.readdirSync(dir)
  .filter(f => f === "schema.sql" || (f.startsWith("migracao-") && f.endsWith(".sql")));
const esquecidos = noDisco.filter(f => !ORDEM.includes(f));
if (esquecidos.length) {
  console.error(`\n❌ Migração fora da lista ORDEM: ${esquecidos.join(", ")}`);
  console.error("   Acrescente em gerar-reconstrucao.mjs, na posição cronológica certa.\n");
  process.exit(1);
}
// Entrada repetida não dá erro em lugar nenhum: o arquivo é inlinado duas
// vezes e o banco só roda o mesmo SQL de novo. Como as migrações são
// idempotentes, o resultado até fica certo — e é exatamente por isso que
// precisa de trava: o único sintoma é a contagem do cabeçalho subir sem
// ninguém ter acrescentado migração. Aconteceu em 01/09/2026, com duas
// sessões pondo o `migracao-glosas-rls.sql` em posições diferentes.
const repetidos = ORDEM.filter((f, i) => ORDEM.indexOf(f) !== i);
if (repetidos.length) {
  console.error(`\n❌ Migração repetida na lista ORDEM: ${[...new Set(repetidos)].join(", ")}`);
  console.error("   Cada arquivo entra UMA vez. Apague a entrada a mais.\n");
  process.exit(1);
}

const sumiram = ORDEM.filter(f => !fs.existsSync(path.join(dir, f)));
if (sumiram.length) {
  console.error(`\n❌ Arquivo listado em ORDEM não existe: ${sumiram.join(", ")}\n`);
  process.exit(1);
}

const corpos = ORDEM.map(f => fs.readFileSync(path.join(dir, f), "utf8").trim());

// Quantas migrações se anotam sozinhas em `migracoes_aplicadas`. A regra
// nasceu em 27/08/2026 e as anteriores não foram reescritas — por isso um
// banco novo ainda precisa do passo manual avisado no fim do arquivo gerado.
// Contado, não decorado: a conta se corrige sozinha quando alguém acrescentar
// a linha a mais um arquivo.
const seAnotam = corpos.filter(c =>
  /insert\s+into\s+public\.migracoes_aplicadas/i.test(c)).length;
const semAnotar = ORDEM.length - seAnotam;

const partes = ORDEM.map((f, i) => {
  const corpo = corpos[i];
  return `
-- ┌────────────────────────────────────────────────────────────
-- │ ${String(i + 1).padStart(2, "0")}/${ORDEM.length} — ${f}
-- └────────────────────────────────────────────────────────────
${corpo}
`;
});

const saida = `-- ============================================================
-- Valentrax — RECONSTRUÇÃO COMPLETA DO BANCO
--
-- ⚠️ ARQUIVO GERADO — não edite à mão.
--    Regenere com:  node supabase/gerar-reconstrucao.mjs
--
-- ⚠️⚠️ ESTE SCRIPT APAGA TODO O SCHEMA "public" E O RECRIA DO ZERO.
--    TODOS OS DADOS DAS TABELAS DA APLICAÇÃO SÃO PERDIDOS.
--
--    Use APENAS num banco descartável (demo/teste) ou num banco NOVO.
--    NUNCA rode no banco de um hospital em uso.
--
--    Antes de rodar, confirme no topo do painel que o projeto é o certo.
--
-- O QUE ELE PRESERVA
--    • Os usuários (o schema "auth" não é tocado).
--    • Os perfis e papéis (adm_master etc.) — são salvos em "_backup"
--      antes do drop e restaurados no fim. Sem isso, todo mundo voltaria
--      como "visualizador" e o admin perderia o acesso.
--
-- CONTEÚDO: ${ORDEM.length} scripts, na ordem em que rodaram no banco principal.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- PARTE 0/4 — TRAVA DE SEGURANÇA
--
-- Colar este script no projeto errado destruiria o banco de um hospital.
-- Por isso ele exige uma confirmação deliberada: rode ANTES, sozinho,
-- NO MESMO projeto onde vai reconstruir:
--
--     create table public._confirmo_reconstruir();
--
-- Sem essa tabela, o script aborta e nada é alterado. Ela some junto no
-- drop, então a confirmação vale uma vez só — da próxima, confirme de novo.
-- ════════════════════════════════════════════════════════════
do $guarda$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = '_confirmo_reconstruir'
  ) then
    raise exception E'RECONSTRUCAO ABORTADA - nada foi alterado.\\n\\n'
      'Confirme que este e o banco DESCARTAVEL certo rodando, sozinho, neste projeto:\\n'
      '    create table public._confirmo_reconstruir();\\n\\n'
      'Depois rode este script inteiro de novo.';
  end if;
end
$guarda$;


-- ════════════════════════════════════════════════════════════
-- PARTE 1/4 — Preservar perfis e papéis
-- ════════════════════════════════════════════════════════════
create schema if not exists _backup;

do $preservar$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'profiles'
  ) then
    drop table if exists _backup.profiles_antes;
    execute 'create table _backup.profiles_antes as select * from public.profiles';
    raise notice 'Perfis preservados em _backup.profiles_antes';
  else
    raise notice 'Nao havia public.profiles — nada a preservar';
  end if;
end
$preservar$;


-- ════════════════════════════════════════════════════════════
-- PARTE 2/4 — Zerar o schema public
-- ════════════════════════════════════════════════════════════
drop schema public cascade;
create schema public;

grant usage  on schema public to anon, authenticated, service_role;
grant all    on schema public to postgres, service_role;
alter default privileges in schema public
  grant all on tables    to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to postgres, anon, authenticated, service_role;


-- ════════════════════════════════════════════════════════════
-- PARTE 3/4 — Estrutura (${ORDEM.length} scripts na ordem cronológica)
-- ════════════════════════════════════════════════════════════
${partes.join("\n")}

-- ════════════════════════════════════════════════════════════
-- PARTE 4/4 — Restaurar perfis e papéis
-- ════════════════════════════════════════════════════════════
do $restaurar$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = '_backup' and table_name = 'profiles_antes'
  ) then
    execute $sql$
      insert into public.profiles (id, username, nome, role)
      select b.id, b.username, b.nome, b.role
        from _backup.profiles_antes b
        join auth.users u on u.id = b.id
      on conflict (id) do nothing
    $sql$;
    raise notice 'Perfis restaurados de _backup.profiles_antes';
  end if;
end
$restaurar$;

-- Usuário que existe no auth mas ficou sem perfil (conta criada enquanto
-- o schema estava zerado, ou banco que nunca teve profiles) entra como
-- 'visualizador' — o papel de menor privilégio. Promova manualmente quem
-- precisar, com o comando comentado no fim deste arquivo.
insert into public.profiles (id, username, nome, role)
select u.id,
       split_part(u.email, '@', 1),
       coalesce(u.raw_user_meta_data->>'nome', split_part(u.email, '@', 1)),
       coalesce(u.raw_user_meta_data->>'role', 'visualizador')
  from auth.users u
on conflict (id) do nothing;


-- ════════════════════════════════════════════════════════════
-- CONFERÊNCIA — o resultado deve bater com o banco principal
-- ════════════════════════════════════════════════════════════
select
  (select count(*) from information_schema.tables  where table_schema='public')  as tabelas,
  (select count(*) from information_schema.columns where table_schema='public')  as colunas,
  (select count(*) from public.profiles)                                          as perfis;

-- Depois rode supabase/auditoria-banco.sql para a conferência completa.
--
--
-- ⚠️ FALTA UM PASSO: ANOTAR O REGISTRO DE MIGRAÇÕES.
--
-- Só ${seAnotam} das ${ORDEM.length} migrações acima terminam se anotando em
-- \`migracoes_aplicadas\`; as outras ${semAnotar} são anteriores à regra
-- (27/08/2026) e nunca foram reescritas.
--
-- Neste banco o esquema está COMPLETO por construção — ele acabou de nascer
-- de todas elas. Mas o registro ficaria quase vazio, e o
-- \`conferir-migracoes.sql\` pediria para rodar de novo dezenas de migrações
-- que já estão aqui dentro. Alarme falso ensina a ignorar o alarme.
--
-- Rode UMA VEZ, logo depois deste script:
--     supabase/anotar-migracoes-existentes.sql
--
-- (O aviso no cabeçalho dele — "rode o auditoria antes, isto é suposição, não
-- fato" — vale para banco que JÁ existia. Aqui é fato: o banco nasceu deste
-- arquivo.)
--
--
-- Se algum usuário precisar voltar a ser administrador:
--   update public.profiles set role = 'adm_master' where username = 'SEU_USUARIO';
--
-- Quando tudo estiver conferido, a cópia de segurança pode sair:
--   drop schema _backup cascade;
`;

fs.writeFileSync(path.join(dir, "reconstruir-banco.sql"), saida, "utf8");
const kb = (Buffer.byteLength(saida, "utf8") / 1024).toFixed(0);
console.log(`reconstruir-banco.sql gerado: ${ORDEM.length} scripts, ${kb} KB`);
