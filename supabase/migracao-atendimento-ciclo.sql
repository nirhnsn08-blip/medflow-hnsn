-- ═══════════════════════════════════════════════════════════
-- CICLO DE VIDA DO ATENDIMENTO — cancelamento com rastro
--
-- CONSERTA DOIS DEFEITOS, não acrescenta funcionalidade nova.
--
-- 1. O ATENDIMENTO AMBULATORIAL NUNCA FECHAVA
--    A única coisa no sistema que gravava `status = 'finalizado'` era o
--    desfecho do Pronto-Socorro, e o PS passou a filtrar só emergência.
--    Cada consulta ambulatorial ficava aberta para sempre — e o aviso de
--    atendimento duplicado da Recepção passava a disparar em toda visita
--    ("já tem 5 atendimentos em aberto"). Aviso que sempre dispara é aviso
--    que ninguém lê, e aí a duplicidade real passa junto com as falsas.
--
--    Isso se conserta em CÓDIGO (o encerramento reusa `desfecho` +
--    `desfecho_em` + `status`, que já existem). Esta migração não precisa
--    de coluna nova para o passo 1.
--
-- 2. NÃO EXISTIA CANCELAR
--    Convênio errado, paciente trocado, atendimento em duplicidade: tudo
--    permanente. O MV dedica três telas a isso porque é a operação mais
--    frequente de um balcão depois de abrir.
--
-- ⚠️ POR QUE CANCELAR NÃO É APAGAR
--    `delete` num atendimento levaria embora a única prova de que alguém
--    esteve no balcão — e deixaria agendamento, saída de estoque e registro
--    de farmácia apontando para o vazio. Cancelado é ESTADO: o atendimento
--    continua existindo, marcado como não-válido, com motivo e autor.
--
-- ⚠️ RODAR NO SQL EDITOR ANTES DO MERGE DO CÓDIGO.
--    Aditiva e idempotente. Nenhuma constraint que cobre do código no ar.
-- ═══════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════
-- 1) O RASTRO DO CANCELAMENTO
--
-- Colunas dedicadas, e não a `observacao` que já existe: observação é campo
-- livre que qualquer tela escreve, e daqui a um ano ninguém saberia dizer
-- se aquele texto é o motivo do cancelamento ou uma anotação da recepção.
--
-- `cancelado_por` congela QUEM cancelou. A coluna `usuario` é sobrescrita a
-- cada atualização da linha — quem cancelou seria apagado pela próxima
-- correção. Congelar é a mesma regra da assinatura no PEP.
-- ═══════════════════════════════════════════════════════════
alter table public.ps_atendimentos
  add column if not exists cancelado_motivo text,
  add column if not exists cancelado_em timestamptz,
  add column if not exists cancelado_por text;

-- Índice parcial: as consultas de fila filtram por status, e o cancelado
-- some delas. O índice serve à AUDITORIA — "o que foi cancelado no mês" —
-- que é a pergunta que alguém faz quando a produção não fecha.
create index if not exists ps_atend_cancelados_idx
  on public.ps_atendimentos (cancelado_em desc)
  where status = 'cancelado';


-- ═══════════════════════════════════════════════════════════
-- 2) CONFERÊNCIA DO ESTRAGO JÁ FEITO
--
-- Quantos atendimentos ambulatoriais ficaram presos abertos por causa do
-- defeito. São eles que a tela nova vai listar como pendência para alguém
-- encerrar — o número aqui é só para ninguém se assustar depois.
--
-- Não corrige em massa DE PROPÓSITO: encerrar automaticamente escolheria um
-- desfecho que ninguém conferiu, e desfecho é dado assistencial. Quem sabe
-- se o paciente foi atendido ou desistiu é quem estava lá.
-- ═══════════════════════════════════════════════════════════
select 'ambulatoriais presos abertos' as item, count(*)::text as valor
  from public.ps_atendimentos
 where tipo_atendimento = 'ambulatorial'
   and status not in ('finalizado', 'cancelado')

union all
select 'colunas de cancelamento criadas', count(*)::text
  from information_schema.columns
 where table_schema = 'public' and table_name = 'ps_atendimentos'
   and column_name in ('cancelado_motivo', 'cancelado_em', 'cancelado_por')

union all
select 'atendimentos cancelados ate agora', count(*)::text
  from public.ps_atendimentos where status = 'cancelado';
