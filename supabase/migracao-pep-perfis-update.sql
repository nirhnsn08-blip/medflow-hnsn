-- ═══════════════════════════════════════════════════════════
-- PERFIS — permitir que o administrador classifique a equipe
--
-- Aditiva e idempotente.
--
-- POR QUE
-- `profiles` tinha só política de SELECT. Ou seja: não existe caminho no
-- aplicativo para definir a categoria profissional de ninguém — só direto
-- no painel do Supabase. Com a categoria valendo como regra clínica
-- (COFEN 736/2024), isso deixaria a equipe inteira travada como
-- "administrativo", sem conseguir registrar nada.
--
-- O QUE ESTA POLÍTICA PERMITE — E O QUE ELA NÃO PERMITE
-- Só `adm_master` altera perfil. E há um limite importante: a política de
-- UPDATE em RLS avalia `using` (quem pode tentar) e `with check` (como o
-- resultado pode ficar). Aqui as duas exigem adm_master, então um usuário
-- comum não consegue nem tentar se promover.
--
-- O que ela NÃO impede é um adm_master rebaixar a si mesmo e ficar sem
-- administradores. Isso é decisão de negócio, não de banco — a tela avisa.
--
-- Continua sem DELETE: perfil não se apaga, se desativa. Histórico clínico
-- assinado por alguém precisa continuar apontando para um perfil existente.
-- ═══════════════════════════════════════════════════════════

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.my_role() = 'adm_master')
  with check (public.my_role() = 'adm_master');

-- Conferência:
-- select username, nome, role, categoria, conselho, registro_conselho
--   from public.profiles order by categoria, username;
