-- ═══════════════════════════════════════════════════════════
-- TORRE DE COMANDO ENTRA NOS PERFIS — a porta do painel executivo
--
-- O QUE RESOLVE
-- O módulo `executivo` nasce agora e não está em perfil nenhum. Como o app
-- monta o menu a partir de `perfis_permissoes` (do BANCO, não do código),
-- sem estas linhas a Torre fica invisível — inclusive para o ADM Master.
-- É o susto do NSP e da Maternidade, pela terceira vez: módulo novo sem
-- grant é um item que some do menu de todo mundo.
--
-- ── POR QUE NÃO É O `overview` ──────────────────────────────
-- O Centro de Monitoramento está concedido a 14 perfis — é a tela de entrada
-- do hospital inteiro. A Torre consolida dado estratégico (ocupação, fluxo
-- cirúrgico, abastecimento, ambulatório) e é da DIREÇÃO. Reaproveitar o
-- `overview` daria a leitura executiva a quem só precisa saber de leito.
--
-- ── QUEM RECEBE ─────────────────────────────────────────────
--   • diretor_tecnico — é quem responde pela instituição (CFM 1.638/2002).
--   • ti — perfil `adm_master`; sem ele, o módulo some do menu do
--     administrador e ninguém consegue conceder para mais ninguém.
--   • provisorio — segura a equipe inteira hoje; sem ele, a Torre não
--     aparece para quem está usando o sistema neste momento.
--
-- ── 🔴 QUEM FICOU DE FORA, E POR QUÊ ────────────────────────
-- **`gestao` NÃO recebe nesta migração, de propósito.** A descrição do
-- próprio perfil diz: "Gestão trabalha com número agregado — não precisa de
-- prontuário individual". E a Torre mostra **iniciais e prontuário** dos
-- pacientes que tiveram cirurgia cancelada — porque um número agregado de
-- cancelamentos não permite agir, e é sobre nomes que a direção cobra o
-- bloco. Conceder aqui contrariaria em silêncio o recorte que o perfil
-- promete.
--
-- Se a direção decidir que a Gestão deve ver a Torre, é UMA LINHA —
-- descomentar abaixo e rodar de novo. A decisão fica registrada em vez de
-- acontecer por descuido.
--
-- Aditiva e idempotente: `on conflict do nothing`. Pode rodar duas vezes.
-- Não altera quem já tem o módulo por exceção individual
-- (`usuarios_permissoes`).
-- ⚠️ RODAR NO DEMO PRIMEIRO, depois no HNSN.
-- ═══════════════════════════════════════════════════════════

insert into public.perfis_permissoes (perfil_chave, modulo, nivel) values
  -- Quem responde pelo hospital
  ('diretor_tecnico', 'executivo', 'leitura'),
  -- Sistema: sem estes dois, o módulo some do menu até do administrador
  ('ti',              'executivo', 'escrita'),
  ('provisorio',      'executivo', 'escrita')
  -- Descomente a linha abaixo (e a vírgula acima) para dar a Torre à Gestão:
  -- ,('gestao',         'executivo', 'leitura')
on conflict (perfil_chave, modulo) do nothing;


-- ═══════════════════════════════════════════════════════════
-- CONFERÊNCIA — rode o arquivo INTEIRO (Run), não um trecho.
--
-- A 1ª linha diz QUAL BANCO é este. As três seguintes têm que sair com
-- nível — se aparecer "❌ ficou de fora", o INSERT acima não rodou.
-- A linha da `gestao` sai "— fora por decisão" e é o esperado.
-- ═══════════════════════════════════════════════════════════
select item, resultado from (
  select 0 as ord, '🔎 BANCO' as item,
         case when (select count(*) from public.pacientes) >= 40
              then '🟠 DEMO (banco de teste) — pode rodar aqui'
              else '🔴 PRINCIPAL (HNSN) — produção' end as resultado
  union all
  select 1, 'perfil ' || pa.chave,
         case when pp.nivel is not null then '✅ ' || pp.nivel
              when pa.chave = 'gestao'  then '— fora por decisão (ver o cabeçalho)'
              else '❌ ficou de fora' end
    from public.perfis_acesso pa
    left join public.perfis_permissoes pp
      on pp.perfil_chave = pa.chave and pp.modulo = 'executivo'
   where pa.chave in ('diretor_tecnico','ti','provisorio','gestao')
  union all
  -- Ninguém MAIS deve ter aparecido: a Torre é restrita, e um grant a mais
  -- aqui é vazamento de dado estratégico, não conveniência.
  select 2, 'perfis com acesso (esperado 3)',
         (select count(*)::text from public.perfis_permissoes where modulo = 'executivo')
) t order by ord, item;


insert into public.migracoes_aplicadas (arquivo)
values ('migracao-perfis-executivo.sql') on conflict do nothing;
