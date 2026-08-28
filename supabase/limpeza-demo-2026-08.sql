-- ═══════════════════════════════════════════════════════════
-- LIMPEZA DO BANCO DEMO — dado de teste acumulado até 28/08/2026
--
-- 🔴 RODAR **SÓ NO DEMO** (ufxqdvxhruaswuzhmxyf).
-- O primeiro passo RECUSA a execução se o banco não for o de teste. Leia
-- esse passo antes de qualquer coisa: ele é a única proteção real, porque
-- as duas abas do SQL Editor são idênticas e a diferença mora numa string
-- na barra de endereço.
--
-- ⚠️ ISTO APAGA DADO. Não é aditivo e não é idempotente no sentido usual:
-- rodar de novo depois de limpo não faz mal, mas o que sai não volta.
--
-- ⚠️ E NÃO É PARA RODAR DE ROTINA.
-- Um banco de teste COM movimento testa mais que um banco impecável: foi
-- por haver estoque, prescrição e paciente em atendimento que apareceram o
-- `loteEfetivo` (que estava quebrado em produção) e o acento que calava a
-- sugestão de isolamento. Este arquivo existe para quando o acúmulo
-- atrapalhar a leitura de algum número — não como faxina periódica.
--
-- ── O QUE FICA, E POR QUÊ ──────────────────────────────────
-- • `cc_salas` (4) e `sup_fornecedores` (3) — são CONFIGURAÇÃO, não lixo.
--   Sem eles o Bloco Cirúrgico e o Estoque & Compras voltam a abrir
--   vazios, e o checklist de implantação volta a 1/4.
-- • `scih_germes` (10) — vieram de `migracao-scih-germes-seed.sql`.
-- • `auditoria` — o rastro de quem fez o quê NÃO se apaga. Apagar trilha
--   para "limpar" é o instinto errado: é justamente o registro que explica
--   por que os números mudaram.
-- • Os pacientes e episódios do seed de teste (T9001…T9054).
--
-- ── REVERTER, NÃO APAGAR ───────────────────────────────────
-- Os três atendimentos de PS que eu finalizei durante os testes VOLTAM a
-- "em_atendimento" em vez de sumir. Apagá-los encolheria a população do
-- seed — e o seed existe para o sistema ser testado com movimento real.
-- ═══════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────
-- PASSO 0 — a trava. Não continue se isto falhar.
--
-- O demo tem ~50 pacientes de teste; o banco do hospital não tem nenhum
-- prontuário começando em "T90". Se este SELECT não devolver 'DEMO', PARE.
-- ───────────────────────────────────────────────────────────
do $$
declare n int;
begin
  select count(*) into n from public.pacientes where prontuario like 'T90%';
  if n < 20 then
    raise exception 'ABORTADO: este banco tem % pacientes de teste (T90*). O demo tem ~50. Voce provavelmente esta no banco do HOSPITAL.', n;
  end if;
  raise notice 'Banco de teste confirmado: % pacientes T90*.', n;
end $$;

-- ───────────────────────────────────────────────────────────
-- PASSO 1 — o que tem hoje (leitura, para comparar depois)
-- ───────────────────────────────────────────────────────────
create temp table _antes as
select 'ps finalizados por teste' as item, count(*)::text as valor from public.ps_atendimentos where id in (75, 246, 251)
union all select 'ps chegada nunca triada', count(*)::text from public.ps_atendimentos where id = 272
union all select 'at_contas',              count(*)::text from public.at_contas
union all select 'at_procedimentos',       count(*)::text from public.at_procedimentos
union all select 'solicitacoes',           count(*)::text from public.solicitacoes
union all select 'cc_cirurgias',           count(*)::text from public.cc_cirurgias
union all select 'sup_cotacoes',           count(*)::text from public.sup_cotacoes
union all select 'sup_pedidos',            count(*)::text from public.sup_pedidos
union all select 'farm_movimentos',        count(*)::text from public.farm_movimentos
union all select 'farm_lotes',             count(*)::text from public.farm_lotes
union all select 'farm_inventarios',       count(*)::text from public.farm_inventarios
union all select 'pep_sinais fora do seed',count(*)::text from public.pep_sinais_vitais where usuario <> 'seed-teste';

-- ───────────────────────────────────────────────────────────
-- PASSO 2 — PS: devolve os três ao estado anterior
--
-- ⚠️ O #75 (J.V.A.) MANTÉM `convenio_id` e `cid`. Eles já estavam lá antes
-- dos testes — foi exatamente o que o `valoresIniciais` do PR #151 provou
-- ao impedir que o UPDATE do desfecho os apagasse. Limpar aqui desfaria a
-- prova junto com o teste.
--
-- Os #246 e #251 tinham os dois campos VAZIOS (a tela acusou "2 pendências"
-- nos dois antes de eu preencher), então voltam a vazio.
-- ───────────────────────────────────────────────────────────
update public.ps_atendimentos
   set status = 'em_atendimento',
       desfecho = null, desfecho_em = null,
       setor_destino = null, medico = null, observacao = null,
       procedimento_cod = null
 where id = 75;

update public.ps_atendimentos
   set status = 'em_atendimento',
       desfecho = null, desfecho_em = null,
       setor_destino = null, medico = null, observacao = null,
       convenio_id = null, procedimento_cod = null, cid = null
 where id in (246, 251);

-- A internação do #246 gerou pedido de leito. Sem o desfecho, ele não tem razão de existir.
delete from public.solicitacoes where ps_atendimento_id = 246;

-- Chegada de teste que nunca foi triada (C.L.B., 26/08).
--
-- 🔴 A CONTA VEM ANTES DO ATENDIMENTO. `at_contas.atendimento_id` aponta
-- para cá, e a primeira versão deste arquivo apagava o atendimento no
-- passo 2 e a conta só no passo 3 — o banco recusou, certo:
--
--   ERROR 23503: violates foreign key "at_contas_atendimento_id_fkey"
--   DETAIL: Key (id)=(272) is still referenced from table "at_contas".
--
-- O engano de fundo foi tratar "a conta de teste" e "a chegada de teste"
-- como duas coisas: a conta #7 É a conta deste atendimento.
delete from public.at_conta_itens where conta_id in (select id from public.at_contas where atendimento_id = 272);
delete from public.at_contas       where atendimento_id = 272;
delete from public.ps_atendimentos where id = 272;

-- ───────────────────────────────────────────────────────────
-- PASSO 3 — faturamento: a conta de teste e o procedimento inventado
--
-- 🔴 `PS-URG-01` É O ITEM MAIS PERIGOSO DESTA LISTA. É um código que EU
-- inventei para testar a tela do desfecho, cadastrado como "tabela
-- própria". Num catálogo de procedimentos, um código falso ao lado dos
-- reais é o tipo de coisa que alguém usa sem desconfiar — e a conta volta
-- rejeitada meses depois.
-- ───────────────────────────────────────────────────────────
-- A conta de teste já saiu no passo 2, junto com o atendimento dela.
delete from public.at_procedimentos where codigo = 'PS-URG-01';

-- ───────────────────────────────────────────────────────────
-- PASSO 4 — bloco cirúrgico: a cirurgia de teste (as SALAS ficam)
-- ───────────────────────────────────────────────────────────
delete from public.cc_cirurgias where prontuario = 'T9002' and data = '2026-08-27';

-- ───────────────────────────────────────────────────────────
-- PASSO 5 — compras: a cotação e os pedidos que ela gerou
--
-- Os FORNECEDORES ficam. O que sai é o movimento de teste em cima deles.
-- ───────────────────────────────────────────────────────────
delete from public.sup_pedidos  where observacao = 'Da cotação #1';
delete from public.sup_cotacoes where descricao = 'Compra mensal de EPI e material';

-- ───────────────────────────────────────────────────────────
-- PASSO 6 — farmácia: as TRÊS tabelas juntas, e é obrigatório que seja assim
--
-- 🔴 POR QUE NÃO DÁ PARA APAGAR SÓ ALGUNS MOVIMENTOS.
-- `farm_lotes.quantidade` é MANTIDO (o trigger soma/subtrai a cada
-- movimento); `farm_movimentos` é o histórico paralelo. Apagar movimento
-- sem acertar o saldo faria as duas fontes discordarem — e a Conciliação
-- kardex × saldo passaria a acusar rombo. Seria fabricar exatamente o
-- defeito que o sistema existe para detectar.
--
-- Todo o conteúdo das três é de teste (2 lotes de 26/08 e 1 de 27/08), então
-- as três voltam a zero juntas, sem divergência possível. Estoque se recria
-- pela tela em segundos: Farmácia › Estoque › Entrada.
-- ───────────────────────────────────────────────────────────
delete from public.farm_inventarios;

-- ⚠️ `estorno_de` é `on delete restrict`, e RESTRICT confere NA HORA — não
-- no fim do comando. Um `delete from farm_movimentos` sozinho falharia na
-- primeira linha que tem estorno apontando para ela, mesmo que o estorno
-- esteja sendo apagado no mesmo comando. E os estornos encadeiam (#15
-- desfaz #8, que desfaz #2), então nem uma ordem fixa resolveria.
--
-- O laço apaga sempre as FOLHAS — as que ninguém referencia — e repete até
-- não sobrar nada. Funciona para qualquer profundidade de encadeamento.
do $$
begin
  loop
    delete from public.farm_movimentos m
     where not exists (select 1 from public.farm_movimentos e where e.estorno_de = m.id);
    exit when not found;
  end loop;
end $$;

delete from public.farm_lotes;

-- ───────────────────────────────────────────────────────────
-- PASSO 7 — prontuário: a aferição de teste e o endereço de teste
--
-- O endereço da C.L.B. (T9020) veio do ViaCEP num teste do CEP: Avenida
-- Paulista, Bela Vista, São Paulo. Paciente de seed com endereço real de
-- outra cidade confunde quem for olhar depois.
-- ───────────────────────────────────────────────────────────
delete from public.pep_sinais_vitais where usuario <> 'seed-teste';

update public.pacientes
   set end_logradouro = null, end_numero = null, end_complemento = null,
       end_bairro = null, end_municipio = null, end_uf = null,
       end_cep = null, end_municipio_ibge = null
 where prontuario = 'T9020';

-- ───────────────────────────────────────────────────────────
-- PASSO 8 — conferência (leitura). É a ÚLTIMA consulta de propósito.
--
-- `depois` deve estar zerado nas linhas de teste, e as três linhas do fim
-- (salas, fornecedores, germes) devem continuar com 4, 3 e 10.
-- ───────────────────────────────────────────────────────────
select a.item, a.valor as antes, d.valor as depois
from _antes a
join (
  select 'ps finalizados por teste' as item, count(*)::text as valor from public.ps_atendimentos where id in (75,246,251) and status = 'finalizado'
  union all select 'ps chegada nunca triada', count(*)::text from public.ps_atendimentos where id = 272
  union all select 'at_contas',              count(*)::text from public.at_contas
  union all select 'at_procedimentos',       count(*)::text from public.at_procedimentos
  union all select 'solicitacoes',           count(*)::text from public.solicitacoes
  union all select 'cc_cirurgias',           count(*)::text from public.cc_cirurgias
  union all select 'sup_cotacoes',           count(*)::text from public.sup_cotacoes
  union all select 'sup_pedidos',            count(*)::text from public.sup_pedidos
  union all select 'farm_movimentos',        count(*)::text from public.farm_movimentos
  union all select 'farm_lotes',             count(*)::text from public.farm_lotes
  union all select 'farm_inventarios',       count(*)::text from public.farm_inventarios
  union all select 'pep_sinais fora do seed',count(*)::text from public.pep_sinais_vitais where usuario <> 'seed-teste'
) d on d.item = a.item

union all select '── FICAM ──', '', ''
union all select 'cc_salas (deve ser 4)',        '', (select count(*)::text from public.cc_salas)
union all select 'sup_fornecedores (deve ser 3)','', (select count(*)::text from public.sup_fornecedores where ativo)
union all select 'scih_germes (deve ser 10)',    '', (select count(*)::text from public.scih_germes)
union all select 'pacientes de teste (intactos)','', (select count(*)::text from public.pacientes where prontuario like 'T90%')
order by 1;
