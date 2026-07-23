-- ═══════════════════════════════════════════════════════════
-- PEP — CATEGORIA PROFISSIONAL E REGISTRO DE CONSELHO
--
-- Aditiva e idempotente.
--
-- POR QUE
-- O sistema tem um eixo só de permissão: o papel de ACESSO
-- (adm_master, adm_silver, analista, visualizador). Ele responde "quanto
-- esta pessoa pode mexer no sistema", mas não responde "o que esta pessoa
-- pode fazer clinicamente" — e as duas perguntas são diferentes.
--
-- Hoje um administrativo com perfil de edição consegue gravar "Evolução
-- médica" e assinar prescrição. A COFEN 736/2024 (arts. 6º e 7º) é
-- explícita: Diagnóstico e Prescrição de Enfermagem são PRIVATIVOS do
-- enfermeiro; técnico e auxiliar fazem Anotação de Enfermagem e checagem
-- de cuidados prescritos, sob supervisão. Não é recomendação — é norma, e
-- o software não pode permitir o contrário.
--
-- Então passam a existir DOIS eixos:
--   role      → o que pode mexer no sistema (já existia)
--   categoria → o que pode fazer clinicamente (novo)
--
-- Um adm_master administrativo continua administrando o sistema, e deixa
-- de conseguir assinar evolução médica. Um enfermeiro com perfil analista
-- registra o que é dele, mesmo sem poder mexer em configuração.
--
-- CRM/COREN entram junto porque a CFM 2.299/2021 (art. 2º) exige o
-- registro do conselho nos documentos emitidos, e a COFEN 754/2024
-- (art. 1º) exige identificação própria do profissional de enfermagem.
-- ═══════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists categoria text not null default 'administrativo',
  -- medico | enfermeiro | tecnico_enfermagem | fisioterapeuta | nutricionista
  -- | farmaceutico | assistente_social | administrativo
  add column if not exists conselho text,            -- CRM | COREN | CRF | CREFITO | CRN | CRESS
  add column if not exists registro_conselho text,   -- número da inscrição
  add column if not exists uf_conselho text;

create index if not exists profiles_categoria_idx on public.profiles (categoria);

-- Conferência — quem é quem:
-- select username, nome, role, categoria, conselho, registro_conselho
--   from public.profiles order by categoria, username;

-- Para classificar alguém (rode conforme a realidade do hospital):
-- update public.profiles
--    set categoria = 'enfermeiro', conselho = 'COREN', registro_conselho = '000000', uf_conselho = 'RS'
--  where username = 'usuario';
