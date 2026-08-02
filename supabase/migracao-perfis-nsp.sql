-- ═══════════════════════════════════════════════════════════
-- SEGURANÇA DO PACIENTE ENTRA NOS PERFIS ASSISTENCIAIS
--
-- O QUE RESOLVE
-- O módulo NSP nasceu depois da matriz de perfis e não foi acrescentado a
-- nenhum deles. Resultado: **nenhum perfil assistencial enxergava
-- Segurança do Paciente** — nem médico, nem enfermeiro, nem o farmacêutico.
-- Só TI e o perfil Provisório. Enquanto o RLS era `using (true)` isso era só
-- um item faltando no menu; com a leitura fechada por módulo
-- (`migracao-rls-leitura.sql`), passa a ser impedimento de verdade.
--
-- POR QUE ESCRITA, E NÃO LEITURA
-- Notificar incidente é dever de quem presta o cuidado (RDC 36/2013,
-- art. 8º); o núcleo é quem INVESTIGA. Um sistema em que só o núcleo
-- notifica produz subnotificação — e subnotificação parece segurança no
-- indicador, que é o pior jeito de errar.
--
-- Quem manuseia medicamento entra junto (farmacêutico e auxiliar): erro de
-- dispensação e quase-falha são o tipo de incidente que só quem manuseia
-- enxerga. A recepção também: queda na sala de espera é evento adverso.
--
-- Almoxarifado, matriz e faturamento ficam de fora — não têm contato
-- assistencial. Se alguém desses precisar, é exceção individual
-- (`usuarios_permissoes`), com motivo, não perfil novo.
--
-- ⚠️ ESTA MIGRAÇÃO EXISTE PARA OS BANCOS QUE JÁ RODARAM
--    `migracao-perfis-acesso.sql`. O seed daquele arquivo também foi
--    atualizado (é o que um banco novo usa), mas **não o rode de novo só
--    por causa disto**: ele recria as políticas `for all`, que o
--    `migracao-rls-leitura.sql` desarma — reabrindo a leitura em silêncio.
--    Este arquivo aqui só insere linhas; não toca em política nenhuma.
--
-- Aditiva e idempotente: `on conflict do nothing`. Pode rodar duas vezes.
-- Não altera quem já tem o módulo por exceção individual.
-- ═══════════════════════════════════════════════════════════

insert into public.perfis_permissoes (perfil_chave, modulo, nivel) values
  -- Notificam (escrita)
  ('medico',             'nsp', 'escrita'),
  ('enfermeiro',         'nsp', 'escrita'),
  ('enfermeiro_scih',    'nsp', 'escrita'),
  ('tecnico_enfermagem', 'nsp', 'escrita'),
  ('fisioterapeuta',     'nsp', 'escrita'),
  ('nutricionista',      'nsp', 'escrita'),
  ('assistente_social',  'nsp', 'escrita'),
  ('nir',                'nsp', 'escrita'),
  ('farmaceutico',       'nsp', 'escrita'),
  ('aux_farmacia',       'nsp', 'escrita'),
  ('recepcao',           'nsp', 'escrita'),
  ('diretor_tecnico',    'nsp', 'escrita'),
  -- Acompanham o indicador (leitura)
  ('gestao',             'nsp', 'leitura')
on conflict (perfil_chave, modulo) do nothing;


-- ═══════════════════════════════════════════════════════════
-- CONFERÊNCIA — rode junto.
-- Esperado: 13 linhas, e a coluna "situacao" toda ✅.
-- ═══════════════════════════════════════════════════════════
select pa.chave as perfil,
       pa.nome,
       coalesce(pp.nivel, '(sem acesso)') as nsp,
       case when pp.nivel is null then '❌ ficou de fora' else '✅ ok' end as situacao,
       (select count(*) from public.profiles pr where pr.perfil = pa.chave) as pessoas
  from public.perfis_acesso pa
  left join public.perfis_permissoes pp
    on pp.perfil_chave = pa.chave and pp.modulo = 'nsp'
 where pa.chave in ('medico','enfermeiro','enfermeiro_scih','tecnico_enfermagem',
                    'fisioterapeuta','nutricionista','assistente_social','nir',
                    'farmaceutico','aux_farmacia','recepcao','diretor_tecnico','gestao')
 order by situacao desc, pa.chave;
