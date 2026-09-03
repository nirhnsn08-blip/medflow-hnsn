-- ═══════════════════════════════════════════════════════════
-- AS ESPECIALIDADES DO AMBULATÓRIO SAEM DO CÓDIGO E VÃO PARA O CADASTRO
--
-- 🔴 POR QUE. As cinco especialidades e as metas da pactuação do HNSN
-- estavam CRAVADAS em `src/ambulatorio/especialidades.js`. Fazia sentido
-- quando o produto ERA este painel. Num produto vendido a vários hospitais,
-- o cliente novo abre o painel e vê cinco especialidades que não são dele,
-- com metas que nunca pactuou.
--
-- ⚠️ RODAR ANTES DE MERGEAR O CÓDIGO. Depois do merge, a lista vem daqui —
-- e o cadastro de hoje tem só ORTOPEDIA. Sem esta migração, o painel do
-- HNSN perderia quatro especialidades e o histórico ficaria sem onde
-- aparecer. A ordem é: roda o SQL nos dois bancos → mergeia.
--
-- ⚠️ O `painel_id` É O QUE AMARRA O HISTÓRICO. A produção está gravada em
-- `atendimentos.especialidade` com os valores `cirurgia_geral`,
-- `oftalmologia`, `ginecologia`, `urologia` e `ortopedia` (295 linhas no
-- demo). Mudar essa chave orfanaria tudo em silêncio — por isso ela vai
-- para `extras.painel_id` e o código a usa antes de qualquer normalização.
--
-- ⚠️ Idempotente: pode rodar duas vezes. Não apaga nem desativa nada.
-- ═══════════════════════════════════════════════════════════

-- ── PARTE 1 — as cinco entram no cadastro, com a pactuação atual ──
-- As metas abaixo são as que estavam no código, transcritas sem mudança:
-- é a pactuação vigente do HNSN. Daqui para a frente elas se editam pela
-- aba Tabelas do Atendimento, por quem pactuou.
with padrao(codigo, nome, ordem, painel_id, meta_mensal, meta_anual, meta_primeiras, cor) as (values
  ('CIRURGIA_GERAL', 'Cirurgia Geral', 1, 'cirurgia_geral', 360, 4320, 1320, '#0d9488'),
  ('OFTALMOLOGIA',   'Oftalmologia',   2, 'oftalmologia',   240, 2880,  864, '#3b82f6'),
  ('GINECOLOGIA',    'Ginecologia',    3, 'ginecologia',    240, 2880,  864, '#d97706'),
  ('UROLOGIA',       'Urologia',       4, 'urologia',       240, 2880,  864, '#6366f1'),
  ('ORTOPEDIA',      'Ortopedia',      5, 'ortopedia',      387, 4644, 1394, '#e11d48')
)
insert into public.at_dominios (dominio, codigo, nome, ordem, extras, ativo, sistema, usuario)
select 'especialidade', p.codigo, p.nome, p.ordem,
       jsonb_build_object(
         'painel_id',      p.painel_id,
         'meta_mensal',    p.meta_mensal,
         'meta_anual',     p.meta_anual,
         'meta_primeiras', p.meta_primeiras,
         'cor',            p.cor),
       true, false, 'migracao-ambulatorio-especialidades'
  from padrao p
 where not exists (
   -- Não duplica o que já está cadastrado, comparando SEM acento e SEM
   -- caixa: o `ORTOPEDIA` que já existe no demo tem de ser reaproveitado,
   -- não clonado.
   select 1 from public.at_dominios d
    where d.dominio = 'especialidade'
      and upper(translate(d.codigo, 'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç', 'AAAAEEIOOOUCaaaaeeiooouc'))
        = upper(translate(p.codigo,  'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç', 'AAAAEEIOOOUCaaaaeeiooouc')));


-- ── PARTE 2 — quem já existia ganha a meta, sem perder o resto ──
-- 🔴 `extras || jsonb` MESCLA: preserva qualquer chave que já esteja lá.
-- Um `=` cru apagaria configuração que outra tela tenha gravado no mesmo
-- objeto, e o sintoma seria uma tela vizinha ficando sem parâmetro.
--
-- ⚠️ E só preenche o que está FALTANDO (`?` testa a presença da chave):
-- rodar duas vezes não sobrescreve uma meta que alguém já corrigiu na tela.
with padrao(codigo, painel_id, meta_mensal, meta_anual, meta_primeiras, cor) as (values
  ('CIRURGIA_GERAL', 'cirurgia_geral', 360, 4320, 1320, '#0d9488'),
  ('OFTALMOLOGIA',   'oftalmologia',   240, 2880,  864, '#3b82f6'),
  ('GINECOLOGIA',    'ginecologia',    240, 2880,  864, '#d97706'),
  ('UROLOGIA',       'urologia',       240, 2880,  864, '#6366f1'),
  ('ORTOPEDIA',      'ortopedia',      387, 4644, 1394, '#e11d48')
)
update public.at_dominios d
   set extras = coalesce(d.extras, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
         'painel_id',      case when coalesce(d.extras,'{}'::jsonb) ? 'painel_id'      then null else p.painel_id      end,
         'meta_mensal',    case when coalesce(d.extras,'{}'::jsonb) ? 'meta_mensal'    then null else p.meta_mensal    end,
         'meta_anual',     case when coalesce(d.extras,'{}'::jsonb) ? 'meta_anual'     then null else p.meta_anual     end,
         'meta_primeiras', case when coalesce(d.extras,'{}'::jsonb) ? 'meta_primeiras' then null else p.meta_primeiras end,
         'cor',            case when coalesce(d.extras,'{}'::jsonb) ? 'cor'            then null else p.cor            end))
  from padrao p
 where d.dominio = 'especialidade'
   and upper(translate(d.codigo, 'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç', 'AAAAEEIOOOUCaaaaeeiooouc'))
     = upper(translate(p.codigo,  'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç', 'AAAAEEIOOOUCaaaaeeiooouc'));


-- ── CONFERÊNCIA ─────────────────────────────────────────────
-- ⚠️ O SQL Editor mostra só a ÚLTIMA consulta — por isso `union all`.
select 'especialidade no cadastro' as o_que,
       d.nome as item,
       case when d.extras ? 'painel_id' and d.extras ? 'meta_mensal'
            then '✅ ' || (d.extras->>'painel_id') || ' · meta ' || (d.extras->>'meta_mensal') || '/mês'
            else '❌ sem painel_id ou sem meta' end as situacao
  from public.at_dominios d
 where d.dominio = 'especialidade' and d.ativo

union all

-- 🔴 A LINHA QUE MAIS IMPORTA: toda produção gravada tem especialidade
-- cadastrada que a reconheça? Se faltar, aquele histórico some do painel.
select 'histórico de produção', a.especialidade,
       case when exists (
              select 1 from public.at_dominios d
               where d.dominio = 'especialidade' and d.ativo
                 and d.extras->>'painel_id' = a.especialidade)
            then '✅ tem especialidade que a reconhece'
            else '❌ ÓRFÃ — o painel não vai mostrar' end
  from (select distinct especialidade from public.atendimentos where especialidade is not null) a

order by 1, 2;
