-- ═══════════════════════════════════════════════════════════
-- AUXILIAR DE FARMÁCIA: a descrição do perfil passou a mentir
--
-- O texto gravado em `perfis_acesso.descricao` ainda diz
-- "Não acessa prontuário". Desde a migração da farmácia do hospital
-- (migracao-farmacia-hospital.sql) esse perfil LÊ a prescrição e as
-- alergias — é isso que permite conferir o que vai ser dispensado.
--
-- A descrição não controla nada: quem manda é `perfis_permissoes`.
-- Mas ela é o que o administrador lê na tela de Perfis de acesso na hora
-- de decidir quem recebe o perfil, e uma descrição errada aí vira decisão
-- errada de acesso. Por isso ela vale uma migração.
--
-- ADITIVA e IDEMPOTENTE: um UPDATE de texto, pode rodar duas vezes.
-- ═══════════════════════════════════════════════════════════

set valentrax.quem = 'adauam';

update public.perfis_acesso
   set descricao = 'Dispensação e estoque da farmácia. Lê a prescrição e as alergias para dispensar; não acessa o resto do prontuário.'
 where chave = 'aux_farmacia';

insert into public.migracoes_aplicadas (arquivo)
values ('migracao-descricao-aux-farmacia.sql') on conflict do nothing;

reset valentrax.quem;

notify pgrst, 'reload schema';


-- ───────────────────────────────────────────────────────────
-- CONFERÊNCIA
-- ───────────────────────────────────────────────────────────
select case when ok then '✅ ' else '❌ ' end || item as resultado
from (
  select 'descrição do auxiliar de farmácia atualizada' as item,
         exists (select 1 from public.perfis_acesso
                  where chave = 'aux_farmacia'
                    and descricao like '%Lê a prescrição e as alergias%') as ok
  union all
  select 'nenhum perfil ainda diz "Não acessa prontuário" para a farmácia',
         not exists (select 1 from public.perfis_acesso
                      where chave = 'aux_farmacia' and descricao like '%Não acessa prontuário%')
  union all
  select 'migração anotada no registro',
         exists (select 1 from public.migracoes_aplicadas
                  where arquivo = 'migracao-descricao-aux-farmacia.sql')
) x;
