-- ═══════════════════════════════════════════════════════════
-- PEP — REGISTRO DE ACESSO AO PRONTUÁRIO (quem abriu o de quem)
--
-- 1 tabela nova. Idempotente. Aditiva.
--
-- POR QUE EXISTE
-- O sistema já audita ESCRITA (`auditoria`), mas não LEITURA. Prontuário
-- é dado pessoal sensível (LGPD art. 11) e o art. 46 exige medidas de
-- proteção — na prática, saber quem consultou o quê. O Manual de
-- Certificação SBIS/CFM (NGS1) também trata trilha de acesso como
-- requisito de segurança.
--
-- Não existe artigo dizendo literalmente "logue leitura". A obrigação
-- nasce da combinação: dado sensível + dever de rastreabilidade + ônus da
-- prova. Numa suspeita de acesso indevido, quem não tem log não consegue
-- demonstrar que o acesso não ocorreu.
--
-- E ESTE É O PONTO: histórico não capturado NUNCA volta. Cada dia sem a
-- tabela é um dia que não existe se alguém questionar depois.
--
-- APPEND-ONLY, como todo registro clínico: sem UPDATE, sem DELETE. Um log
-- que pode ser alterado não serve como prova.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.pep_acessos (
  id bigserial primary key,
  prontuario text not null,               -- de quem é o prontuário consultado
  origem text not null,                   -- paciente360 | ps_atendimento | leito | farmacia | scih
  contexto text,                          -- id do episódio/atendimento, quando houver
  usuario text,                           -- quem consultou (username do profissional)
  papel text,                             -- papel no momento do acesso
  criado_em timestamptz not null default now()
);

create index if not exists pep_acessos_prontuario_idx on public.pep_acessos (prontuario, criado_em desc);
create index if not exists pep_acessos_usuario_idx    on public.pep_acessos (usuario, criado_em desc);

alter table public.pep_acessos enable row level security;

-- Leitura do log restrita a quem administra: o log de acesso é, ele
-- próprio, informação sensível — mostra quais pacientes cada profissional
-- consultou. Analista e visualizador não veem.
drop policy if exists pep_acessos_select on public.pep_acessos;
create policy pep_acessos_select on public.pep_acessos
  for select to authenticated
  using (public.my_role() in ('adm_master','adm_silver'));

-- Qualquer usuário autenticado GRAVA o próprio acesso — senão o log teria
-- buraco justamente para os papéis de menor privilégio, que são os que
-- mais consultam.
drop policy if exists pep_acessos_insert on public.pep_acessos;
create policy pep_acessos_insert on public.pep_acessos
  for insert to authenticated
  with check (true);

-- Sem política de UPDATE e sem política de DELETE: com RLS ativo, o
-- PostgREST recusa as duas operações para qualquer papel, inclusive
-- adm_master. É o mesmo mecanismo que torna a evolução clínica imutável.

-- Conferência:
-- select count(*) from public.pep_acessos;
