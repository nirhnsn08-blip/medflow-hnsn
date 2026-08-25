-- ============================================================
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
-- CONTEÚDO: 75 scripts, na ordem em que rodaram no banco principal.
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
    raise exception E'RECONSTRUCAO ABORTADA - nada foi alterado.\n\n'
      'Confirme que este e o banco DESCARTAVEL certo rodando, sozinho, neste projeto:\n'
      '    create table public._confirmo_reconstruir();\n\n'
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
-- PARTE 3/4 — Estrutura (75 scripts na ordem cronológica)
-- ════════════════════════════════════════════════════════════

-- ┌────────────────────────────────────────────────────────────
-- │ 01/75 — schema.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- MedFlow HNSN — Schema do banco (Supabase / PostgreSQL)
-- Estrutura ATUAL e SEGURA (login via Supabase Auth + RLS por papel).
-- Serve de referência/backup. Rode no SQL Editor apenas se precisar recriar.
-- ⚠️ NÃO use policies "allow all" — isso abriria os dados para qualquer um.
-- ═══════════════════════════════════════════════════════════

-- ===== Perfis / papéis =====
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text unique,
  nome       text,
  role       text not null default 'visualizador',   -- adm_master | adm_silver | analista | visualizador
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;

create or replace function public.my_role() returns text
language sql security definer stable set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, nome, role)
  values (new.id, split_part(new.email,'@',1),
          coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)),
          coalesce(new.raw_user_meta_data->>'role', 'visualizador'))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

drop policy if exists profiles_select_auth on public.profiles;
create policy profiles_select_auth on public.profiles for select to authenticated using (true);

-- ===== Atendimentos =====
create table if not exists public.atendimentos (
  id bigserial primary key,
  data date not null, especialidade text not null,
  primeiras int default 0, retornos int default 0, ofertadas int default 0,
  realizadas int default 0, livres int default 0, emergencias int default 0, faltas int default 0,
  usuario text, created_at timestamptz default now(),
  unique (data, especialidade)
);
alter table public.atendimentos enable row level security;
drop policy if exists atend_select on public.atendimentos;
drop policy if exists atend_insert on public.atendimentos;
drop policy if exists atend_update on public.atendimentos;
drop policy if exists atend_delete on public.atendimentos;
create policy atend_select on public.atendimentos for select to authenticated using (true);
create policy atend_insert on public.atendimentos for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy atend_update on public.atendimentos for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy atend_delete on public.atendimentos for delete to authenticated using (public.my_role() = 'adm_master');

-- ===== Auditoria (imutável: só inserir e ler) =====
create table if not exists public.auditoria (
  id bigserial primary key, ts timestamptz default now(),
  usuario text, acao text, alvo text
);
alter table public.auditoria enable row level security;
drop policy if exists audit_insert on public.auditoria;
drop policy if exists audit_select on public.auditoria;
create policy audit_insert on public.auditoria for insert to authenticated with check (true);
create policy audit_select on public.auditoria for select to authenticated using (public.my_role() in ('adm_master','adm_silver'));

-- ===== Giro de Leitos =====
create table if not exists public.leitos (
  identificacao text primary key,
  status text not null default 'livre',   -- livre | ocupado | interditado
  iniciais text, prontuario text, motivo text, cid text,
  data_internacao date, dias_previstos int, interdicao_motivo text,
  usuario text, updated_at timestamptz default now()
);
alter table public.leitos enable row level security;
drop policy if exists leitos_select on public.leitos;
drop policy if exists leitos_insert on public.leitos;
drop policy if exists leitos_update on public.leitos;
drop policy if exists leitos_delete on public.leitos;
create policy leitos_select on public.leitos for select to authenticated using (true);
create policy leitos_insert on public.leitos for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy leitos_update on public.leitos for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy leitos_delete on public.leitos for delete to authenticated using (public.my_role() = 'adm_master');

create table if not exists public.leitos_saidas (
  id bigserial primary key, leito text, iniciais text, prontuario text,
  cid text, motivo text, data_internacao date, data_alta date,
  usuario text, created_at timestamptz default now()
);
alter table public.leitos_saidas enable row level security;
drop policy if exists saidas_select on public.leitos_saidas;
drop policy if exists saidas_insert on public.leitos_saidas;
create policy saidas_select on public.leitos_saidas for select to authenticated using (public.my_role() in ('adm_master','adm_silver'));
create policy saidas_insert on public.leitos_saidas for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));

-- Fase 2: tempos de fluxo do leito + histórico de turnover
alter table public.leitos
  add column if not exists solic_em   timestamptz, add column if not exists disp_em    timestamptz,
  add column if not exists pronto_em  timestamptz, add column if not exists entrada_em timestamptz;
alter table public.leitos_saidas
  add column if not exists disp_em timestamptz, add column if not exists dias_permanencia int,
  add column if not exists desfecho text default 'alta';   -- alta | obito
create table if not exists public.leitos_turnover (
  id bigserial primary key, leito text,
  solic_em timestamptz, disp_em timestamptz, pronto_em timestamptz, entrada_em timestamptz,
  usuario text, created_at timestamptz default now()
);
alter table public.leitos_turnover enable row level security;
drop policy if exists turnover_select on public.leitos_turnover;
drop policy if exists turnover_insert on public.leitos_turnover;
create policy turnover_select on public.leitos_turnover for select to authenticated using (public.my_role() in ('adm_master','adm_silver'));
create policy turnover_insert on public.leitos_turnover for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));

-- ===== Referência CID → dias de internação (sugestão editável) =====
create table if not exists public.cid_referencia (
  cid        text primary key,
  descricao  text,
  dias       int not null default 0,
  tratamento text,
  usuario    text,
  updated_at timestamptz default now()
);
alter table public.cid_referencia add column if not exists tratamento text;
alter table public.cid_referencia enable row level security;
drop policy if exists cidref_select on public.cid_referencia;
drop policy if exists cidref_insert on public.cid_referencia;
drop policy if exists cidref_update on public.cid_referencia;
drop policy if exists cidref_delete on public.cid_referencia;
create policy cidref_select on public.cid_referencia for select to authenticated using (true);
create policy cidref_insert on public.cid_referencia for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy cidref_update on public.cid_referencia for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy cidref_delete on public.cid_referencia for delete to authenticated using (public.my_role() = 'adm_master');

-- ===== SCIH: isolamento por leito + casos de vigilância =====
alter table public.leitos add column if not exists isolamento text;  -- null | aereo | contato | goticulas

create table if not exists public.scih_casos (
  id bigserial primary key,
  iniciais text not null,
  prontuario text,
  leito text,
  isolamento text,                 -- aereo | contato | goticulas
  data_coleta date,
  data_resultado date,
  germe text,
  multirresistente boolean default false,
  antibiotico text,
  dias_antibiotico int,
  observacao text,
  status text not null default 'ativo',   -- ativo | encerrado
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.scih_casos enable row level security;
drop policy if exists scih_casos_select on public.scih_casos;
drop policy if exists scih_casos_insert on public.scih_casos;
drop policy if exists scih_casos_update on public.scih_casos;
drop policy if exists scih_casos_delete on public.scih_casos;
create policy scih_casos_select on public.scih_casos for select to authenticated using (true);
create policy scih_casos_insert on public.scih_casos for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy scih_casos_update on public.scih_casos for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy scih_casos_delete on public.scih_casos for delete to authenticated using (public.my_role() = 'adm_master');

-- ===== Bloco Cirúrgico: salas + agenda/mapa + workflow do dia =====
create table if not exists public.cc_salas (
  nome text primary key,
  ordem int default 0,
  ativa boolean default true,
  usuario text, updated_at timestamptz default now()
);
alter table public.cc_salas enable row level security;
drop policy if exists ccs_select on public.cc_salas;
drop policy if exists ccs_insert on public.cc_salas;
drop policy if exists ccs_update on public.cc_salas;
drop policy if exists ccs_delete on public.cc_salas;
create policy ccs_select on public.cc_salas for select to authenticated using (true);
create policy ccs_insert on public.cc_salas for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy ccs_update on public.cc_salas for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy ccs_delete on public.cc_salas for delete to authenticated using (public.my_role() = 'adm_master');

create table if not exists public.cc_cirurgias (
  id bigserial primary key,
  data date not null,
  hora_prevista time,
  duracao_prev_min int,
  sala text,
  iniciais text not null, prontuario text,
  procedimento text not null,
  cirurgiao text, anestesista text, tipo_anestesia text,
  opme text,                            -- materiais e OPME necessários
  observacao text,
  status text not null default 'agendada', -- agendada | checkin | em_cirurgia | recuperacao | concluida | cancelada
  chk_sign_in boolean default false,    -- checklist cirurgia segura (OMS)
  chk_time_out boolean default false,
  chk_sign_out boolean default false,
  checkin_em timestamptz, entrada_sala_em timestamptz,
  inicio_anestesia_em timestamptz, inicio_cirurgia_em timestamptz,
  fim_cirurgia_em timestamptz, saida_sala_em timestamptz,
  rpa_entrada_em timestamptz, rpa_saida_em timestamptz,
  cancelamento_motivo text,
  usuario text, updated_at timestamptz default now()
);
create index if not exists cc_cirurgias_data_idx on public.cc_cirurgias (data, sala);
alter table public.cc_cirurgias enable row level security;
drop policy if exists ccc_select on public.cc_cirurgias;
drop policy if exists ccc_insert on public.cc_cirurgias;
drop policy if exists ccc_update on public.cc_cirurgias;
drop policy if exists ccc_delete on public.cc_cirurgias;
create policy ccc_select on public.cc_cirurgias for select to authenticated using (true);
create policy ccc_insert on public.cc_cirurgias for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy ccc_update on public.cc_cirurgias for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy ccc_delete on public.cc_cirurgias for delete to authenticated using (public.my_role() = 'adm_master');

-- ===== Paciente 360: cadastro mínimo + evoluções (registro clínico imutável) =====
create table if not exists public.pacientes (
  prontuario text primary key,
  iniciais text not null,
  ano_nascimento int,
  sexo text,
  usuario text, updated_at timestamptz default now()
);
alter table public.pacientes enable row level security;
drop policy if exists pac_select on public.pacientes;
drop policy if exists pac_insert on public.pacientes;
drop policy if exists pac_update on public.pacientes;
drop policy if exists pac_delete on public.pacientes;
create policy pac_select on public.pacientes for select to authenticated using (true);
create policy pac_insert on public.pacientes for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy pac_update on public.pacientes for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy pac_delete on public.pacientes for delete to authenticated using (public.my_role() = 'adm_master');

-- Evoluções: registro clínico APPEND-ONLY (sem update/delete — como a auditoria)
create table if not exists public.pep_evolucoes (
  id bigserial primary key,
  prontuario text not null,
  tipo text not null default 'evolucao_medica',
  texto text not null,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_evolucoes_prontuario_idx on public.pep_evolucoes (prontuario, criado_em desc);
alter table public.pep_evolucoes enable row level security;
drop policy if exists pep_select on public.pep_evolucoes;
drop policy if exists pep_insert on public.pep_evolucoes;
create policy pep_select on public.pep_evolucoes for select to authenticated using (true);
create policy pep_insert on public.pep_evolucoes for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));

-- ===== Pronto-Socorro: triagem Manchester + jornada do paciente =====
create table if not exists public.ps_atendimentos (
  id bigserial primary key,
  iniciais text not null, prontuario text, queixa text,
  chegada_em timestamptz not null default now(),
  classificacao text,                -- vermelho | laranja | amarelo | verde | azul
  triagem_em timestamptz,
  atendimento_em timestamptz,
  desfecho text,                     -- alta | internacao | transferencia | evasao | obito
  desfecho_em timestamptz,
  setor_destino text,                -- quando desfecho = internacao
  status text not null default 'aguardando_triagem', -- aguardando_triagem | aguardando_atendimento | em_atendimento | finalizado
  observacao text,
  usuario text, updated_at timestamptz default now()
);
alter table public.ps_atendimentos enable row level security;
drop policy if exists ps_select on public.ps_atendimentos;
drop policy if exists ps_insert on public.ps_atendimentos;
drop policy if exists ps_update on public.ps_atendimentos;
drop policy if exists ps_delete on public.ps_atendimentos;
create policy ps_select on public.ps_atendimentos for select to authenticated using (true);
create policy ps_insert on public.ps_atendimentos for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy ps_update on public.ps_atendimentos for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy ps_delete on public.ps_atendimentos for delete to authenticated using (public.my_role() = 'adm_master');

-- Sinais vitais coletados na triagem (sugerem a classificação de Manchester)
alter table public.ps_atendimentos
  add column if not exists pa_sist int,
  add column if not exists pa_diast int,
  add column if not exists fc int,
  add column if not exists fr int,
  add column if not exists spo2 int,
  add column if not exists temp numeric(4,1),
  add column if not exists dor int,
  add column if not exists consciencia text,
  add column if not exists glicemia int,
  add column if not exists medico text;   -- médico responsável no desfecho

-- Histórico de aferições de sinais vitais (triagem + reavaliações) — APPEND-ONLY
create table if not exists public.ps_sinais (
  id bigserial primary key,
  atendimento_id bigint not null,
  pa_sist int, pa_diast int, fc int, fr int, spo2 int,
  temp numeric, dor int, consciencia text, glicemia int,
  classificacao_sugerida text,
  classificacao_escolhida text,
  aferido_em timestamptz not null default now(),
  usuario text
);
create index if not exists ps_sinais_atend_idx on public.ps_sinais (atendimento_id, aferido_em desc);
alter table public.ps_sinais enable row level security;
drop policy if exists pss_select on public.ps_sinais;
drop policy if exists pss_insert on public.ps_sinais;
create policy pss_select on public.ps_sinais for select to authenticated using (true);
create policy pss_insert on public.ps_sinais for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));

-- Registros do atendimento médico no PS: evolução, prescrição e exames.
-- Evolução/prescrição são IMUTÁVEIS (update só para tipo=exame: status/resultado).
create table if not exists public.ps_registros (
  id bigserial primary key,
  atendimento_id bigint not null,
  tipo text not null,
  categoria text,
  texto text not null,
  status text,
  resultado text,
  resultado_em timestamptz,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists ps_registros_atend_idx on public.ps_registros (atendimento_id, criado_em desc);
alter table public.ps_registros enable row level security;
drop policy if exists psr_select on public.ps_registros;
drop policy if exists psr_insert on public.ps_registros;
drop policy if exists psr_update on public.ps_registros;
create policy psr_select on public.ps_registros for select to authenticated using (true);
create policy psr_insert on public.ps_registros for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy psr_update on public.ps_registros for update to authenticated
  using (public.my_role() in ('adm_master','adm_silver') and tipo = 'exame')
  with check (tipo = 'exame');

-- Itens estruturados da prescrição (Farmácia Fase B) — imutável
create table if not exists public.ps_prescricao_itens (
  id bigserial primary key,
  atendimento_id bigint not null,
  registro_id bigint,
  medicamento_id bigint,
  medicamento_nome text not null,
  unidade text,
  dose text,
  via text,
  quantidade numeric,
  usuario text,
  created_at timestamptz default now()
);
create index if not exists ps_presc_itens_at_idx on public.ps_prescricao_itens (atendimento_id);
alter table public.ps_prescricao_itens enable row level security;
drop policy if exists ps_presc_itens_select on public.ps_prescricao_itens;
drop policy if exists ps_presc_itens_insert on public.ps_prescricao_itens;
create policy ps_presc_itens_select on public.ps_prescricao_itens for select to authenticated using (true);
create policy ps_presc_itens_insert on public.ps_prescricao_itens for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));

-- Checagem de medicação administrada — APPEND-ONLY.
-- A dispensação prova que o remédio saiu da farmácia; só esta tabela prova
-- que ele entrou no paciente, com hora e quem administrou.
create table if not exists public.ps_administracoes (
  id bigserial primary key,
  atendimento_id bigint not null references public.ps_atendimentos(id) on delete cascade,
  prescricao_item_id bigint references public.ps_prescricao_itens(id) on delete set null,
  medicamento_id bigint,
  medicamento_nome text not null,
  dose text,
  via text,
  status text not null default 'administrado',  -- administrado | nao_administrado
  motivo text,                                  -- preenchido quando nao_administrado
  observacao text,
  categoria text,                               -- enfermagem | tecnico | medica | outro
  administrado_em timestamptz not null default now(),
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists ps_adm_atend_idx on public.ps_administracoes (atendimento_id, administrado_em desc);
create index if not exists ps_adm_item_idx  on public.ps_administracoes (prescricao_item_id);
alter table public.ps_administracoes enable row level security;
drop policy if exists ps_adm_select on public.ps_administracoes;
drop policy if exists ps_adm_insert on public.ps_administracoes;
create policy ps_adm_select on public.ps_administracoes for select to authenticated using (true);
create policy ps_adm_insert on public.ps_administracoes for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));

-- ===== SCIH Fase B: base de germes com embasamento =====
create table if not exists public.scih_germes (
  nome text primary key,
  tipo text not null default 'multirresistente',  -- multirresistente | sensivel
  isolamento text,                                 -- aereo | contato | goticulas | null
  embasamento text,
  observacao text,
  usuario text,
  updated_at timestamptz default now()
);
alter table public.scih_germes enable row level security;
drop policy if exists scih_germes_select on public.scih_germes;
drop policy if exists scih_germes_insert on public.scih_germes;
drop policy if exists scih_germes_update on public.scih_germes;
drop policy if exists scih_germes_delete on public.scih_germes;
create policy scih_germes_select on public.scih_germes for select to authenticated using (true);
create policy scih_germes_insert on public.scih_germes for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy scih_germes_update on public.scih_germes for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy scih_germes_delete on public.scih_germes for delete to authenticated using (public.my_role() = 'adm_master');

-- ===== SCIH Fase C: indicadores mensais (lançamento manual) =====
create table if not exists public.scih_indicadores (
  competencia text primary key,          -- 'YYYY-MM'
  exames_lab int, exames_imagem int,
  culturas_coletadas int, culturas_positivas int,
  pacientes_dia int, ventilador_dia int,
  higiene_oportunidades int, higiene_realizadas int,
  pav_casos int,
  antimicrobiano_dot int,                -- dias de terapia antimicrobiana (DOT)
  cir_cesariana int, isc_cesariana int,
  cir_oftalmo int,   isc_oftalmo int,
  cir_artroplastia int, isc_artroplastia int,
  treinamentos int, treinamentos_participantes int,
  observacao text,
  usuario text, updated_at timestamptz default now()
);
alter table public.scih_indicadores enable row level security;
drop policy if exists scih_ind_select on public.scih_indicadores;
drop policy if exists scih_ind_insert on public.scih_indicadores;
drop policy if exists scih_ind_update on public.scih_indicadores;
drop policy if exists scih_ind_delete on public.scih_indicadores;
create policy scih_ind_select on public.scih_indicadores for select to authenticated using (true);
create policy scih_ind_insert on public.scih_indicadores for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy scih_ind_update on public.scih_indicadores for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy scih_ind_delete on public.scih_indicadores for delete to authenticated using (public.my_role() = 'adm_master');

-- ===== Monitoramento: setores + fila de solicitações de leito =====
create table if not exists public.setores (
  nome text primary key,
  alerta_amarelo int default 90, alerta_vermelho int default 100, ordem int default 0,
  usuario text, updated_at timestamptz default now()
);
alter table public.setores enable row level security;
drop policy if exists setores_select on public.setores;
drop policy if exists setores_write  on public.setores;
create policy setores_select on public.setores for select to authenticated using (true);
create policy setores_write  on public.setores for all    to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));

alter table public.leitos add column if not exists setor text;

create table if not exists public.solicitacoes (
  id bigserial primary key,
  iniciais text, setor_origem text, setor_destino text,
  hora_pedido timestamptz default now(), status text default 'aguardando',
  usuario text, created_at timestamptz default now()
);
alter table public.solicitacoes enable row level security;
drop policy if exists solic_select on public.solicitacoes;
drop policy if exists solic_write  on public.solicitacoes;
create policy solic_select on public.solicitacoes for select to authenticated using (true);
create policy solic_write  on public.solicitacoes for all    to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));

-- ===== Farmácia — Fase A: catálogo + estoque (lote/validade, kardex) =====
create table if not exists public.farm_medicamentos (
  id bigserial primary key,
  nome text not null,                    -- descrição/apresentação (ex.: "Dipirona 500mg comprimido")
  principio_ativo text,
  classe text,                           -- classe terapêutica (analgésicos, antibióticos, insulinas...)
  forma text,                            -- comprimido, ampola, frasco...
  concentracao text,                     -- 500 mg, 10 mg/mL...
  unidade text default 'unidade',        -- unidade de dispensação (comprimido, mL, ampola)
  controlado boolean default false,      -- Portaria 344/98 (psicotrópicos/entorpecentes)
  estoque_minimo numeric default 0,      -- ponto de ressuprimento
  ativo boolean default true,
  observacao text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists farm_medic_nome_idx on public.farm_medicamentos (lower(nome));
alter table public.farm_medicamentos enable row level security;
drop policy if exists farm_medic_select on public.farm_medicamentos;
drop policy if exists farm_medic_insert on public.farm_medicamentos;
drop policy if exists farm_medic_update on public.farm_medicamentos;
drop policy if exists farm_medic_delete on public.farm_medicamentos;
create policy farm_medic_select on public.farm_medicamentos for select to authenticated using (true);
create policy farm_medic_insert on public.farm_medicamentos for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_medic_update on public.farm_medicamentos for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_medic_delete on public.farm_medicamentos for delete to authenticated using (public.my_role() = 'adm_master');

-- Saldo por lote (derivado dos movimentos — mantido pelo trigger)
create table if not exists public.farm_lotes (
  id bigserial primary key,
  medicamento_id bigint not null references public.farm_medicamentos(id) on delete cascade,
  lote text not null default '',
  validade date,
  quantidade numeric not null default 0,
  updated_at timestamptz default now()
);
create unique index if not exists farm_lotes_uq on public.farm_lotes (medicamento_id, lote);
alter table public.farm_lotes enable row level security;
drop policy if exists farm_lotes_select on public.farm_lotes;
create policy farm_lotes_select on public.farm_lotes for select to authenticated using (true);
-- escrita só pelo trigger (security definer); sem políticas de insert/update/delete direto

-- Kardex: movimentos de estoque (append-only — imutável)
create table if not exists public.farm_movimentos (
  id bigserial primary key,
  medicamento_id bigint not null references public.farm_medicamentos(id) on delete cascade,
  lote_id bigint,                        -- preenchido pelo trigger
  lote text,
  validade date,
  tipo text not null,                    -- entrada | saida
  quantidade numeric not null check (quantidade > 0),
  motivo text,                           -- compra/nota, dispensação, perda/vencimento, ajuste...
  documento text,                        -- nº nota fiscal / requisição
  paciente_iniciais text, paciente_prontuario text,   -- p/ dispensação (Fase B)
  atendimento_id bigint,                -- ps_atendimentos.id (dispensação vinda do PS)
  prescricao_item_id bigint,            -- ps_prescricao_itens.id (item dispensado)
  setor text,                           -- destino (dispensação avulsa a internados)
  usuario text,
  created_at timestamptz default now()
);
create index if not exists farm_mov_medic_idx on public.farm_movimentos (medicamento_id, created_at desc);
create index if not exists farm_mov_presc_idx on public.farm_movimentos (prescricao_item_id);
create index if not exists farm_mov_atend_idx on public.farm_movimentos (atendimento_id);
alter table public.farm_movimentos enable row level security;
drop policy if exists farm_mov_select on public.farm_movimentos;
drop policy if exists farm_mov_insert on public.farm_movimentos;
create policy farm_mov_select on public.farm_movimentos for select to authenticated using (true);
create policy farm_mov_insert on public.farm_movimentos for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: kardex imutável

-- Trigger: aplica o movimento no saldo do lote (cria o lote se necessário)
create or replace function public.farm_aplica_movimento()
returns trigger language plpgsql security definer as $$
declare
  v_lote_id bigint;
  v_lote text := coalesce(new.lote, '');
  v_saldo numeric;
begin
  select id, quantidade into v_lote_id, v_saldo from public.farm_lotes
    where medicamento_id = new.medicamento_id and lote = v_lote;
  if v_lote_id is null then
    insert into public.farm_lotes (medicamento_id, lote, validade, quantidade)
      values (new.medicamento_id, v_lote, new.validade, 0)
      returning id, quantidade into v_lote_id, v_saldo;
  end if;
  if new.tipo = 'saida' and v_saldo < new.quantidade then
    raise exception 'Estoque insuficiente no lote (disponível: %).', v_saldo;
  end if;
  if new.validade is not null then
    update public.farm_lotes set validade = new.validade where id = v_lote_id;
  end if;
  update public.farm_lotes
    set quantidade = quantidade + (case when new.tipo = 'entrada' then new.quantidade else -new.quantidade end),
        updated_at = now()
    where id = v_lote_id;
  new.lote_id := v_lote_id;
  new.lote := v_lote;
  return new;
end $$;
drop trigger if exists farm_movimento_trg on public.farm_movimentos;
create trigger farm_movimento_trg before insert on public.farm_movimentos
  for each row execute function public.farm_aplica_movimento();

-- ===== Farmácia Clínica — Fase 1: motor de alertas (atributos clínicos) =====
alter table public.farm_medicamentos
  add column if not exists grupo_terapeutico text,
  add column if not exists dose_maxima_dia numeric,
  add column if not exists dose_maxima_unid text,
  add column if not exists duracao_maxima_dias int,
  add column if not exists nao_triturar boolean default false,
  add column if not exists inapropriado_idoso boolean default false,
  add column if not exists motivo_idoso text,
  add column if not exists inapropriado_pediatrico boolean default false,
  add column if not exists motivo_pediatrico text,
  add column if not exists idade_pediatrica int,
  add column if not exists ajuste_renal text,
  add column if not exists ajuste_hepatico text,
  add column if not exists obs_clinica text;

alter table public.ps_prescricao_itens
  add column if not exists dose_valor numeric,
  add column if not exists dose_unidade text,
  add column if not exists frequencia_dia numeric,
  add column if not exists duracao_dias numeric;

alter table public.ps_atendimentos
  add column if not exists idade int,
  add column if not exists peso numeric(5,1),
  add column if not exists clearance_renal numeric,
  add column if not exists funcao_hepatica text,
  add column if not exists alergias text,
  add column if not exists em_sonda boolean default false,
  add column if not exists gestante boolean default false;

-- ===== Farmácia Clínica — Fase 2: interações + incompatibilidade em Y (pares) =====
create table if not exists public.farm_interacoes (
  id bigserial primary key,
  substancia_a text not null, substancia_b text not null,
  gravidade text not null default 'moderada',   -- grave | moderada | leve
  descricao text, conduta text,
  usuario text, created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table public.farm_interacoes enable row level security;
drop policy if exists farm_inter_select on public.farm_interacoes;
drop policy if exists farm_inter_insert on public.farm_interacoes;
drop policy if exists farm_inter_update on public.farm_interacoes;
drop policy if exists farm_inter_delete on public.farm_interacoes;
create policy farm_inter_select on public.farm_interacoes for select to authenticated using (true);
create policy farm_inter_insert on public.farm_interacoes for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_inter_update on public.farm_interacoes for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_inter_delete on public.farm_interacoes for delete to authenticated using (public.my_role() = 'adm_master');

create table if not exists public.farm_incompat_y (
  id bigserial primary key,
  substancia_a text not null, substancia_b text not null,
  descricao text,
  usuario text, created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table public.farm_incompat_y enable row level security;
drop policy if exists farm_incy_select on public.farm_incompat_y;
drop policy if exists farm_incy_insert on public.farm_incompat_y;
drop policy if exists farm_incy_update on public.farm_incompat_y;
drop policy if exists farm_incy_delete on public.farm_incompat_y;
create policy farm_incy_select on public.farm_incompat_y for select to authenticated using (true);
create policy farm_incy_insert on public.farm_incompat_y for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_incy_update on public.farm_incompat_y for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_incy_delete on public.farm_incompat_y for delete to authenticated using (public.my_role() = 'adm_master');

-- ===== Farmácia — fluxo de preparo (assinar→receber→preparo→pronto→retirada) =====
create table if not exists public.farm_preparo (
  id bigserial primary key,
  registro_id bigint not null unique,
  atendimento_id bigint,
  status text not null default 'preparo',    -- preparo | pronto | retirado | cancelado
  recebido_em timestamptz, recebido_por text,
  pronto_em timestamptz,   pronto_por text,
  retirado_em timestamptz, retirado_por text,
  observacao text,
  usuario text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create index if not exists farm_preparo_at_idx on public.farm_preparo (atendimento_id);
alter table public.farm_preparo enable row level security;
drop policy if exists farm_prep_select on public.farm_preparo;
drop policy if exists farm_prep_insert on public.farm_preparo;
drop policy if exists farm_prep_update on public.farm_preparo;
drop policy if exists farm_prep_delete on public.farm_preparo;
create policy farm_prep_select on public.farm_preparo for select to authenticated using (true);
create policy farm_prep_insert on public.farm_preparo for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_prep_update on public.farm_preparo for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_prep_delete on public.farm_preparo for delete to authenticated using (public.my_role() = 'adm_master');

-- ===== Farmácia — custo unitário por medicamento (custos por paciente) =====
alter table public.farm_medicamentos
  add column if not exists custo_unitario numeric;

-- ===== Farmácia — medicamentos NÃO padronizados (trazidos pela família) =====
create table if not exists public.farm_nao_padronizados (
  id bigserial primary key,
  paciente_iniciais text not null,
  paciente_prontuario text, setor text,
  medicamento text not null, apresentacao text,
  quantidade numeric, unidade text,
  lote text, validade date,
  origem text, conferido boolean default false,
  status text not null default 'recebido',  -- recebido | em_uso | devolvido | descartado
  observacao text,
  usuario text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create index if not exists farm_naopad_pac_idx on public.farm_nao_padronizados (paciente_prontuario);
alter table public.farm_nao_padronizados enable row level security;
drop policy if exists farm_naopad_select on public.farm_nao_padronizados;
drop policy if exists farm_naopad_insert on public.farm_nao_padronizados;
drop policy if exists farm_naopad_update on public.farm_nao_padronizados;
drop policy if exists farm_naopad_delete on public.farm_nao_padronizados;
create policy farm_naopad_select on public.farm_nao_padronizados for select to authenticated using (true);
create policy farm_naopad_insert on public.farm_nao_padronizados for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_naopad_update on public.farm_nao_padronizados for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_naopad_delete on public.farm_nao_padronizados for delete to authenticated using (public.my_role() = 'adm_master');

-- ===== Farmácia — Intervenção farmacêutica (estilo NoHarm) =====
create table if not exists public.farm_intervencoes (
  id bigserial primary key,
  atendimento_id bigint, prescricao_item_id bigint, medicamento_nome text,
  paciente_iniciais text, paciente_prontuario text,
  tipo text, gravidade text,
  problema text not null, conduta text,
  status text not null default 'pendente',  -- pendente | aceita | nao_aceita | resolvida | cancelada
  desfecho text, farmaceutico text,
  usuario text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create index if not exists farm_interv_at_idx on public.farm_intervencoes (atendimento_id);
create index if not exists farm_interv_status_idx on public.farm_intervencoes (status);
alter table public.farm_intervencoes enable row level security;
drop policy if exists farm_interv2_select on public.farm_intervencoes;
drop policy if exists farm_interv2_insert on public.farm_intervencoes;
drop policy if exists farm_interv2_update on public.farm_intervencoes;
drop policy if exists farm_interv2_delete on public.farm_intervencoes;
create policy farm_interv2_select on public.farm_intervencoes for select to authenticated using (true);
create policy farm_interv2_insert on public.farm_intervencoes for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_interv2_update on public.farm_intervencoes for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_interv2_delete on public.farm_intervencoes for delete to authenticated using (public.my_role() = 'adm_master');

-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS (Estoque & Compras) — Fase A: fornecedores + catálogo de
-- materiais + estoque por lote/validade (kardex imutável)
-- ═══════════════════════════════════════════════════════════
-- Fornecedores (usados nas entradas; base das compras da Fase C)
create table if not exists public.sup_fornecedores (
  id bigserial primary key,
  nome text not null,                    -- razão social / nome fantasia
  cnpj text,
  contato text,                          -- pessoa de contato
  telefone text,
  email text,
  categorias text,                       -- o que fornece (texto livre: "material hospitalar, EPI")
  observacao text,
  ativo boolean default true,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists sup_forn_nome_idx on public.sup_fornecedores (lower(nome));
alter table public.sup_fornecedores enable row level security;
drop policy if exists sup_forn_select on public.sup_fornecedores;
drop policy if exists sup_forn_insert on public.sup_fornecedores;
drop policy if exists sup_forn_update on public.sup_fornecedores;
drop policy if exists sup_forn_delete on public.sup_fornecedores;
create policy sup_forn_select on public.sup_fornecedores for select to authenticated using (true);
create policy sup_forn_insert on public.sup_fornecedores for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_forn_update on public.sup_fornecedores for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_forn_delete on public.sup_fornecedores for delete to authenticated using (public.my_role() = 'adm_master');

-- Catálogo de materiais e insumos (almoxarifado)
create table if not exists public.sup_itens (
  id bigserial primary key,
  nome text not null,                    -- descrição (ex.: "Luva de procedimento M — cx 100")
  categoria text,                        -- material médico-hospitalar, higiene, EPI, escritório...
  unidade text default 'unidade',        -- unidade de controle (unidade, caixa, pacote, litro...)
  estoque_minimo numeric default 0,      -- ponto de ressuprimento
  custo_unitario numeric,                -- R$ por unidade de controle (para BI)
  ativo boolean default true,
  observacao text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists sup_itens_nome_idx on public.sup_itens (lower(nome));
alter table public.sup_itens enable row level security;
drop policy if exists sup_itens_select on public.sup_itens;
drop policy if exists sup_itens_insert on public.sup_itens;
drop policy if exists sup_itens_update on public.sup_itens;
drop policy if exists sup_itens_delete on public.sup_itens;
create policy sup_itens_select on public.sup_itens for select to authenticated using (true);
create policy sup_itens_insert on public.sup_itens for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_itens_update on public.sup_itens for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_itens_delete on public.sup_itens for delete to authenticated using (public.my_role() = 'adm_master');

-- Saldo por lote (derivado dos movimentos — mantido pelo trigger)
create table if not exists public.sup_lotes (
  id bigserial primary key,
  item_id bigint not null references public.sup_itens(id) on delete cascade,
  lote text not null default '',
  validade date,
  quantidade numeric not null default 0,
  updated_at timestamptz default now()
);
create unique index if not exists sup_lotes_uq on public.sup_lotes (item_id, lote);
alter table public.sup_lotes enable row level security;
drop policy if exists sup_lotes_select on public.sup_lotes;
create policy sup_lotes_select on public.sup_lotes for select to authenticated using (true);
-- escrita só pelo trigger (security definer); sem políticas de insert/update/delete direto

-- Kardex: movimentos de estoque (append-only — imutável)
create table if not exists public.sup_movimentos (
  id bigserial primary key,
  item_id bigint not null references public.sup_itens(id) on delete cascade,
  lote_id bigint,                        -- preenchido pelo trigger
  lote text,
  validade date,
  tipo text not null,                    -- entrada | saida
  quantidade numeric not null check (quantidade > 0),
  motivo text,                           -- compra/nota, consumo do setor, perda, ajuste...
  documento text,                        -- nº nota fiscal / requisição
  fornecedor_id bigint references public.sup_fornecedores(id) on delete set null,
  setor text,                            -- destino do consumo (posto, centro cirúrgico...)
  usuario text,
  created_at timestamptz default now()
);
create index if not exists sup_mov_item_idx on public.sup_movimentos (item_id, created_at desc);
create index if not exists sup_mov_forn_idx on public.sup_movimentos (fornecedor_id);
alter table public.sup_movimentos enable row level security;
drop policy if exists sup_mov_select on public.sup_movimentos;
drop policy if exists sup_mov_insert on public.sup_movimentos;
create policy sup_mov_select on public.sup_movimentos for select to authenticated using (true);
create policy sup_mov_insert on public.sup_movimentos for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: kardex imutável

-- Trigger: aplica o movimento no saldo do lote (cria o lote se necessário)
create or replace function public.sup_aplica_movimento()
returns trigger language plpgsql security definer as $$
declare
  v_lote_id bigint;
  v_lote text := coalesce(new.lote, '');
  v_saldo numeric;
begin
  select id, quantidade into v_lote_id, v_saldo from public.sup_lotes
    where item_id = new.item_id and lote = v_lote;
  if v_lote_id is null then
    insert into public.sup_lotes (item_id, lote, validade, quantidade)
      values (new.item_id, v_lote, new.validade, 0)
      returning id, quantidade into v_lote_id, v_saldo;
  end if;
  if new.tipo = 'saida' and v_saldo < new.quantidade then
    raise exception 'Estoque insuficiente no lote (disponível: %).', v_saldo;
  end if;
  if new.validade is not null then
    update public.sup_lotes set validade = new.validade where id = v_lote_id;
  end if;
  update public.sup_lotes
    set quantidade = quantidade + (case when new.tipo = 'entrada' then new.quantidade else -new.quantidade end),
        updated_at = now()
    where id = v_lote_id;
  new.lote_id := v_lote_id;
  new.lote := v_lote;
  return new;
end $$;
drop trigger if exists sup_movimento_trg on public.sup_movimentos;
create trigger sup_movimento_trg before insert on public.sup_movimentos
  for each row execute function public.sup_aplica_movimento();


-- ── Suprimentos Fase B: requisições de materiais pelos setores ──
create table if not exists public.sup_requisicoes (
  id bigserial primary key,
  setor text not null,
  itens jsonb not null default '[]',
  -- [{item_id, nome, unidade, qtd, qtd_atendida}]
  status text not null default 'aguardando',
  -- aguardando | separacao | pronto | entregue | cancelado
  observacao text,
  solicitado_por text,
  recebido_em timestamptz, recebido_por text,
  pronto_em timestamptz,   pronto_por text,
  entregue_em timestamptz, entregue_por text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists sup_req_status_idx
  on public.sup_requisicoes (status, created_at desc);
alter table public.sup_requisicoes enable row level security;
drop policy if exists sup_req_select on public.sup_requisicoes;
drop policy if exists sup_req_insert on public.sup_requisicoes;
drop policy if exists sup_req_update on public.sup_requisicoes;
drop policy if exists sup_req_delete on public.sup_requisicoes;
create policy sup_req_select on public.sup_requisicoes
  for select to authenticated
  using (true);
create policy sup_req_insert on public.sup_requisicoes
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_req_update on public.sup_requisicoes
  for update to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_req_delete on public.sup_requisicoes
  for delete to authenticated
  using (public.my_role() = 'adm_master');


-- ── Suprimentos Fase C: pedidos de compra (materiais e medicamentos) ──
create table if not exists public.sup_pedidos (
  id bigserial primary key,
  fornecedor_id bigint
    references public.sup_fornecedores(id) on delete set null,
  fornecedor_nome text,
  itens jsonb not null default '[]',
  -- [{tipo:'material'|'medicamento', item_id, nome, unidade,
  --   qtd, custo_unit, qtd_recebida}]
  status text not null default 'aberto',
  -- aberto | enviado | parcial | recebido | cancelado
  previsao_entrega date,
  observacao text,
  enviado_em timestamptz,  enviado_por text,
  recebido_em timestamptz, recebido_por text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists sup_ped_status_idx
  on public.sup_pedidos (status, created_at desc);
create index if not exists sup_ped_forn_idx
  on public.sup_pedidos (fornecedor_id);
alter table public.sup_pedidos enable row level security;
drop policy if exists sup_ped_select on public.sup_pedidos;
drop policy if exists sup_ped_insert on public.sup_pedidos;
drop policy if exists sup_ped_update on public.sup_pedidos;
drop policy if exists sup_ped_delete on public.sup_pedidos;
create policy sup_ped_select on public.sup_pedidos
  for select to authenticated
  using (true);
create policy sup_ped_insert on public.sup_pedidos
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_ped_update on public.sup_pedidos
  for update to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_ped_delete on public.sup_pedidos
  for delete to authenticated
  using (public.my_role() = 'adm_master');


-- ── Suprimentos: inventário cíclico + custo por entrada + código de barras ──
-- 1) Contagens de inventário (append-only)
create table if not exists public.sup_inventarios (
  id bigserial primary key,
  item_id bigint not null
    references public.sup_itens(id) on delete cascade,
  saldo_sistema numeric not null,
  contado numeric not null,
  diferenca numeric not null,          -- contado − sistema
  ajustado boolean default false,      -- ajuste lançado no kardex?
  observacao text,
  usuario text,
  created_at timestamptz default now()
);
create index if not exists sup_inv_item_idx
  on public.sup_inventarios (item_id, created_at desc);
alter table public.sup_inventarios enable row level security;
drop policy if exists sup_inv_select on public.sup_inventarios;
drop policy if exists sup_inv_insert on public.sup_inventarios;
create policy sup_inv_select on public.sup_inventarios
  for select to authenticated
  using (true);
create policy sup_inv_insert on public.sup_inventarios
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: histórico de contagens imutável

-- 2) Custo unitário no movimento (compras reais → custo médio ponderado)
alter table public.sup_movimentos
  add column if not exists custo_unit numeric;
alter table public.farm_movimentos
  add column if not exists custo_unit numeric;

-- 3) Código de barras no catálogo
alter table public.sup_itens
  add column if not exists codigo_barras text;
create index if not exists sup_itens_barras_idx
  on public.sup_itens (codigo_barras);


-- ── Suprimentos: ponto de pedido (prazo de entrega por fornecedor) ──
alter table public.sup_fornecedores
  add column if not exists lead_time_dias int;

-- ── Suprimentos: cotação de compra (comparar preços entre fornecedores) ──
create table if not exists public.sup_cotacoes (
  id bigserial primary key,
  descricao text,
  itens jsonb not null default '[]',
  -- [{tipo:'material'|'medicamento', item_id, nome, unidade, qtd,
  --   precos: { <fornecedor_id>: preco_unit }}]
  fornecedores jsonb not null default '[]',   -- ids dos fornecedores cotados
  status text not null default 'aberta',      -- aberta | fechada | cancelada
  observacao text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists sup_cot_status_idx
  on public.sup_cotacoes (status, created_at desc);
alter table public.sup_cotacoes enable row level security;
drop policy if exists sup_cot_select on public.sup_cotacoes;
drop policy if exists sup_cot_insert on public.sup_cotacoes;
drop policy if exists sup_cot_update on public.sup_cotacoes;
drop policy if exists sup_cot_delete on public.sup_cotacoes;
create policy sup_cot_select on public.sup_cotacoes
  for select to authenticated
  using (true);
create policy sup_cot_insert on public.sup_cotacoes
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_cot_update on public.sup_cotacoes
  for update to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_cot_delete on public.sup_cotacoes
  for delete to authenticated
  using (public.my_role() = 'adm_master');


-- ── Pronto-Socorro: mapa de salas (Emergência / Observação / Sala Vermelha) ──
create table if not exists public.ps_salas (
  id bigserial primary key,
  identificacao text not null unique,   -- "01", "02", "Sala 03"...
  area text not null default 'Emergência',  -- Emergência | Observação | Sala Vermelha | ...
  status text not null default 'disponivel', -- disponivel | ocupado | limpeza | manutencao
  atendimento_id bigint                     -- paciente do PS ocupando a sala
    references public.ps_atendimentos(id) on delete set null,
  ocupado_em timestamptz,
  observacao text,
  ordem int default 0,
  ativo boolean default true,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists ps_salas_area_idx on public.ps_salas (area, ordem);
create index if not exists ps_salas_atend_idx on public.ps_salas (atendimento_id);
alter table public.ps_salas enable row level security;
drop policy if exists ps_salas_select on public.ps_salas;
drop policy if exists ps_salas_insert on public.ps_salas;
drop policy if exists ps_salas_update on public.ps_salas;
drop policy if exists ps_salas_delete on public.ps_salas;
create policy ps_salas_select on public.ps_salas
  for select to authenticated
  using (true);
create policy ps_salas_insert on public.ps_salas
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy ps_salas_update on public.ps_salas
  for update to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy ps_salas_delete on public.ps_salas
  for delete to authenticated
  using (public.my_role() = 'adm_master');


-- ── PS: origem da chegada + elo forte PS → fila/leito ──
alter table public.ps_atendimentos
  add column if not exists origem text,
  add column if not exists origem_detalhe text;
alter table public.solicitacoes
  add column if not exists ps_atendimento_id bigint
    references public.ps_atendimentos(id) on delete set null;
alter table public.leitos
  add column if not exists ps_atendimento_id bigint
    references public.ps_atendimentos(id) on delete set null;


-- ┌────────────────────────────────────────────────────────────
-- │ 02/75 — migracao-farmacia-faseA.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — Farmácia · Fase A (catálogo + estoque)
-- Rodar UMA vez no HNSN (Supabase → SQL Editor) ANTES de publicar o código.
-- Idempotente: pode rodar de novo sem quebrar nada.
-- ============================================================

-- ===== Catálogo de medicamentos =====
create table if not exists public.farm_medicamentos (
  id bigserial primary key,
  nome text not null,                    -- descrição/apresentação (ex.: "Dipirona 500mg comprimido")
  principio_ativo text,
  forma text,                            -- comprimido, ampola, frasco...
  concentracao text,                     -- 500 mg, 10 mg/mL...
  unidade text default 'unidade',        -- unidade de dispensação (comprimido, mL, ampola)
  controlado boolean default false,      -- Portaria 344/98 (psicotrópicos/entorpecentes)
  estoque_minimo numeric default 0,      -- ponto de ressuprimento
  ativo boolean default true,
  observacao text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists farm_medic_nome_idx on public.farm_medicamentos (lower(nome));
alter table public.farm_medicamentos enable row level security;
drop policy if exists farm_medic_select on public.farm_medicamentos;
drop policy if exists farm_medic_insert on public.farm_medicamentos;
drop policy if exists farm_medic_update on public.farm_medicamentos;
drop policy if exists farm_medic_delete on public.farm_medicamentos;
create policy farm_medic_select on public.farm_medicamentos for select to authenticated using (true);
create policy farm_medic_insert on public.farm_medicamentos for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_medic_update on public.farm_medicamentos for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_medic_delete on public.farm_medicamentos for delete to authenticated using (public.my_role() = 'adm_master');

-- ===== Saldo por lote (derivado dos movimentos — mantido pelo trigger) =====
create table if not exists public.farm_lotes (
  id bigserial primary key,
  medicamento_id bigint not null references public.farm_medicamentos(id) on delete cascade,
  lote text not null default '',
  validade date,
  quantidade numeric not null default 0,
  updated_at timestamptz default now()
);
create unique index if not exists farm_lotes_uq on public.farm_lotes (medicamento_id, lote);
alter table public.farm_lotes enable row level security;
drop policy if exists farm_lotes_select on public.farm_lotes;
create policy farm_lotes_select on public.farm_lotes for select to authenticated using (true);
-- escrita só pelo trigger (security definer); sem políticas de insert/update/delete direto

-- ===== Kardex: movimentos de estoque (append-only — imutável) =====
create table if not exists public.farm_movimentos (
  id bigserial primary key,
  medicamento_id bigint not null references public.farm_medicamentos(id) on delete cascade,
  lote_id bigint,                        -- preenchido pelo trigger
  lote text,
  validade date,
  tipo text not null,                    -- entrada | saida
  quantidade numeric not null check (quantidade > 0),
  motivo text,                           -- compra/nota, dispensação, perda/vencimento, ajuste...
  documento text,                        -- nº nota fiscal / requisição
  paciente_iniciais text, paciente_prontuario text,   -- p/ dispensação (Fase B)
  usuario text,
  created_at timestamptz default now()
);
create index if not exists farm_mov_medic_idx on public.farm_movimentos (medicamento_id, created_at desc);
alter table public.farm_movimentos enable row level security;
drop policy if exists farm_mov_select on public.farm_movimentos;
drop policy if exists farm_mov_insert on public.farm_movimentos;
create policy farm_mov_select on public.farm_movimentos for select to authenticated using (true);
create policy farm_mov_insert on public.farm_movimentos for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: kardex imutável

-- ===== Trigger: aplica o movimento no saldo do lote (cria o lote se necessário) =====
create or replace function public.farm_aplica_movimento()
returns trigger language plpgsql security definer as $$
declare
  v_lote_id bigint;
  v_lote text := coalesce(new.lote, '');
  v_saldo numeric;
begin
  select id, quantidade into v_lote_id, v_saldo from public.farm_lotes
    where medicamento_id = new.medicamento_id and lote = v_lote;
  if v_lote_id is null then
    insert into public.farm_lotes (medicamento_id, lote, validade, quantidade)
      values (new.medicamento_id, v_lote, new.validade, 0)
      returning id, quantidade into v_lote_id, v_saldo;
  end if;
  if new.tipo = 'saida' and v_saldo < new.quantidade then
    raise exception 'Estoque insuficiente no lote (disponível: %).', v_saldo;
  end if;
  if new.validade is not null then
    update public.farm_lotes set validade = new.validade where id = v_lote_id;
  end if;
  update public.farm_lotes
    set quantidade = quantidade + (case when new.tipo = 'entrada' then new.quantidade else -new.quantidade end),
        updated_at = now()
    where id = v_lote_id;
  new.lote_id := v_lote_id;
  new.lote := v_lote;
  return new;
end $$;
drop trigger if exists farm_movimento_trg on public.farm_movimentos;
create trigger farm_movimento_trg before insert on public.farm_movimentos
  for each row execute function public.farm_aplica_movimento();

-- Fim da Fase A da Farmácia.


-- ┌────────────────────────────────────────────────────────────
-- │ 03/75 — migracao-farmacia-seed.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — Farmácia · classe terapêutica + catálogo inicial
-- Rodar UMA vez no HNSN (Supabase → SQL Editor), DEPOIS da Fase A.
-- Idempotente: só insere o que ainda não existe (por nome).
-- NÃO cria estoque — apenas o catálogo. As quantidades entram
-- depois pela tela (Entrada), com lote e validade.
-- ============================================================

-- Coluna de classe terapêutica (para agrupar/filtrar)
alter table public.farm_medicamentos add column if not exists classe text;

insert into public.farm_medicamentos (nome, principio_ativo, classe, forma, concentracao, unidade, controlado)
select v.nome, v.principio_ativo, v.classe, v.forma, v.concentracao, v.unidade, v.controlado
from (values
  -- ===== Analgésicos e antipiréticos =====
  ('Dipirona 500 mg comprimido','Dipirona sódica','Analgésicos e antipiréticos','Comprimido','500 mg','comprimido',false),
  ('Dipirona 500 mg/mL solução injetável','Dipirona sódica','Analgésicos e antipiréticos','Ampola','500 mg/mL','ampola',false),
  ('Dipirona 500 mg/mL gotas','Dipirona sódica','Analgésicos e antipiréticos','Frasco','500 mg/mL','frasco',false),
  ('Paracetamol 500 mg comprimido','Paracetamol','Analgésicos e antipiréticos','Comprimido','500 mg','comprimido',false),
  ('Paracetamol 200 mg/mL gotas','Paracetamol','Analgésicos e antipiréticos','Frasco','200 mg/mL','frasco',false),
  ('Ácido acetilsalicílico 100 mg comprimido','Ácido acetilsalicílico','Analgésicos e antipiréticos','Comprimido','100 mg','comprimido',false),
  -- ===== Anti-inflamatórios (AINEs) =====
  ('Ibuprofeno 600 mg comprimido','Ibuprofeno','Anti-inflamatórios (AINEs)','Comprimido','600 mg','comprimido',false),
  ('Diclofenaco sódico 50 mg comprimido','Diclofenaco sódico','Anti-inflamatórios (AINEs)','Comprimido','50 mg','comprimido',false),
  ('Diclofenaco sódico 25 mg/mL injetável','Diclofenaco sódico','Anti-inflamatórios (AINEs)','Ampola','25 mg/mL','ampola',false),
  ('Cetoprofeno 100 mg injetável','Cetoprofeno','Anti-inflamatórios (AINEs)','Frasco-ampola','100 mg','frasco-ampola',false),
  ('Naproxeno 500 mg comprimido','Naproxeno','Anti-inflamatórios (AINEs)','Comprimido','500 mg','comprimido',false),
  ('Tenoxicam 20 mg injetável','Tenoxicam','Anti-inflamatórios (AINEs)','Frasco-ampola','20 mg','frasco-ampola',false),
  -- ===== Opioides =====
  ('Morfina 10 mg/mL injetável','Sulfato de morfina','Opioides','Ampola','10 mg/mL','ampola',true),
  ('Morfina 10 mg comprimido','Sulfato de morfina','Opioides','Comprimido','10 mg','comprimido',true),
  ('Fentanila 50 mcg/mL injetável','Citrato de fentanila','Opioides','Ampola','50 mcg/mL','ampola',true),
  ('Tramadol 50 mg/mL injetável','Cloridrato de tramadol','Opioides','Ampola','50 mg/mL','ampola',true),
  ('Tramadol 50 mg cápsula','Cloridrato de tramadol','Opioides','Cápsula','50 mg','cápsula',true),
  ('Codeína 30 mg comprimido','Fosfato de codeína','Opioides','Comprimido','30 mg','comprimido',true),
  ('Metadona 10 mg comprimido','Cloridrato de metadona','Opioides','Comprimido','10 mg','comprimido',true),
  -- ===== Anestésicos =====
  ('Lidocaína 2% sem vasoconstritor','Cloridrato de lidocaína','Anestésicos','Frasco','20 mg/mL','frasco',false),
  ('Lidocaína 2% geleia','Cloridrato de lidocaína','Anestésicos','Bisnaga/Pomada','20 mg/g','unidade',false),
  ('Bupivacaína 0,5% injetável','Cloridrato de bupivacaína','Anestésicos','Frasco-ampola','5 mg/mL','frasco-ampola',false),
  ('Propofol 10 mg/mL injetável','Propofol','Anestésicos','Ampola','10 mg/mL','ampola',false),
  ('Cetamina 50 mg/mL injetável','Cloridrato de cetamina','Anestésicos','Frasco-ampola','50 mg/mL','frasco-ampola',true),
  ('Etomidato 2 mg/mL injetável','Etomidato','Anestésicos','Ampola','2 mg/mL','ampola',false),
  -- ===== Antibióticos =====
  ('Amoxicilina 500 mg cápsula','Amoxicilina','Antibióticos','Cápsula','500 mg','cápsula',false),
  ('Amoxicilina + Clavulanato 500+125 mg comprimido','Amoxicilina + clavulanato de potássio','Antibióticos','Comprimido','500+125 mg','comprimido',false),
  ('Ampicilina 1 g injetável','Ampicilina sódica','Antibióticos','Frasco-ampola','1 g','frasco-ampola',false),
  ('Cefalexina 500 mg cápsula','Cefalexina','Antibióticos','Cápsula','500 mg','cápsula',false),
  ('Cefazolina 1 g injetável','Cefazolina sódica','Antibióticos','Frasco-ampola','1 g','frasco-ampola',false),
  ('Ceftriaxona 1 g injetável','Ceftriaxona sódica','Antibióticos','Frasco-ampola','1 g','frasco-ampola',false),
  ('Cefepima 1 g injetável','Cefepima','Antibióticos','Frasco-ampola','1 g','frasco-ampola',false),
  ('Ciprofloxacino 500 mg comprimido','Ciprofloxacino','Antibióticos','Comprimido','500 mg','comprimido',false),
  ('Ciprofloxacino 2 mg/mL bolsa','Ciprofloxacino','Antibióticos','Bolsa/Soro','2 mg/mL','bolsa',false),
  ('Levofloxacino 500 mg comprimido','Levofloxacino','Antibióticos','Comprimido','500 mg','comprimido',false),
  ('Azitromicina 500 mg comprimido','Azitromicina','Antibióticos','Comprimido','500 mg','comprimido',false),
  ('Claritromicina 500 mg comprimido','Claritromicina','Antibióticos','Comprimido','500 mg','comprimido',false),
  ('Clindamicina 150 mg/mL injetável','Fosfato de clindamicina','Antibióticos','Ampola','150 mg/mL','ampola',false),
  ('Metronidazol 500 mg comprimido','Metronidazol','Antibióticos','Comprimido','500 mg','comprimido',false),
  ('Metronidazol 5 mg/mL bolsa','Metronidazol','Antibióticos','Bolsa/Soro','5 mg/mL','bolsa',false),
  ('Gentamicina 40 mg/mL injetável','Sulfato de gentamicina','Antibióticos','Ampola','40 mg/mL','ampola',false),
  ('Amicacina 250 mg/mL injetável','Sulfato de amicacina','Antibióticos','Frasco-ampola','250 mg/mL','frasco-ampola',false),
  ('Vancomicina 500 mg injetável','Cloridrato de vancomicina','Antibióticos','Frasco-ampola','500 mg','frasco-ampola',false),
  ('Piperacilina + Tazobactam 4,5 g injetável','Piperacilina + tazobactam','Antibióticos','Frasco-ampola','4,5 g','frasco-ampola',false),
  ('Meropenem 1 g injetável','Meropenem','Antibióticos','Frasco-ampola','1 g','frasco-ampola',false),
  ('Imipenem + Cilastatina 500 mg injetável','Imipenem + cilastatina','Antibióticos','Frasco-ampola','500 mg','frasco-ampola',false),
  ('Oxacilina 500 mg injetável','Oxacilina sódica','Antibióticos','Frasco-ampola','500 mg','frasco-ampola',false),
  ('Sulfametoxazol + Trimetoprima 400+80 mg comprimido','Sulfametoxazol + trimetoprima','Antibióticos','Comprimido','400+80 mg','comprimido',false),
  ('Polimixina B 500.000 UI injetável','Polimixina B','Antibióticos','Frasco-ampola','500.000 UI','frasco-ampola',false),
  -- ===== Antifúngicos =====
  ('Fluconazol 150 mg cápsula','Fluconazol','Antifúngicos','Cápsula','150 mg','cápsula',false),
  ('Fluconazol 2 mg/mL bolsa','Fluconazol','Antifúngicos','Bolsa/Soro','2 mg/mL','bolsa',false),
  ('Nistatina 100.000 UI/mL suspensão oral','Nistatina','Antifúngicos','Solução oral','100.000 UI/mL','frasco',false),
  ('Anfotericina B 50 mg injetável','Anfotericina B','Antifúngicos','Frasco-ampola','50 mg','frasco-ampola',false),
  ('Cetoconazol 200 mg comprimido','Cetoconazol','Antifúngicos','Comprimido','200 mg','comprimido',false),
  -- ===== Antivirais =====
  ('Aciclovir 200 mg comprimido','Aciclovir','Antivirais','Comprimido','200 mg','comprimido',false),
  ('Aciclovir 250 mg injetável','Aciclovir sódico','Antivirais','Frasco-ampola','250 mg','frasco-ampola',false),
  ('Oseltamivir 75 mg cápsula','Fosfato de oseltamivir','Antivirais','Cápsula','75 mg','cápsula',false),
  -- ===== Insulinas =====
  ('Insulina Regular 100 UI/mL','Insulina humana regular','Insulinas','Frasco','100 UI/mL','frasco',false),
  ('Insulina NPH 100 UI/mL','Insulina humana NPH','Insulinas','Frasco','100 UI/mL','frasco',false),
  ('Insulina Glargina 100 UI/mL','Insulina glargina','Insulinas','Frasco','100 UI/mL','frasco',false),
  ('Insulina Lispro 100 UI/mL','Insulina lispro','Insulinas','Frasco','100 UI/mL','frasco',false),
  ('Insulina Asparte 100 UI/mL','Insulina asparte','Insulinas','Frasco','100 UI/mL','frasco',false),
  -- ===== Antidiabéticos orais =====
  ('Metformina 500 mg comprimido','Cloridrato de metformina','Antidiabéticos orais','Comprimido','500 mg','comprimido',false),
  ('Metformina 850 mg comprimido','Cloridrato de metformina','Antidiabéticos orais','Comprimido','850 mg','comprimido',false),
  ('Glibenclamida 5 mg comprimido','Glibenclamida','Antidiabéticos orais','Comprimido','5 mg','comprimido',false),
  ('Gliclazida 30 mg comprimido','Gliclazida','Antidiabéticos orais','Comprimido','30 mg','comprimido',false),
  -- ===== Cardiovasculares e anti-hipertensivos =====
  ('Losartana potássica 50 mg comprimido','Losartana potássica','Cardiovasculares e anti-hipertensivos','Comprimido','50 mg','comprimido',false),
  ('Enalapril 10 mg comprimido','Maleato de enalapril','Cardiovasculares e anti-hipertensivos','Comprimido','10 mg','comprimido',false),
  ('Captopril 25 mg comprimido','Captopril','Cardiovasculares e anti-hipertensivos','Comprimido','25 mg','comprimido',false),
  ('Anlodipino 5 mg comprimido','Besilato de anlodipino','Cardiovasculares e anti-hipertensivos','Comprimido','5 mg','comprimido',false),
  ('Atenolol 50 mg comprimido','Atenolol','Cardiovasculares e anti-hipertensivos','Comprimido','50 mg','comprimido',false),
  ('Metoprolol 25 mg comprimido','Succinato de metoprolol','Cardiovasculares e anti-hipertensivos','Comprimido','25 mg','comprimido',false),
  ('Propranolol 40 mg comprimido','Cloridrato de propranolol','Cardiovasculares e anti-hipertensivos','Comprimido','40 mg','comprimido',false),
  ('Carvedilol 6,25 mg comprimido','Carvedilol','Cardiovasculares e anti-hipertensivos','Comprimido','6,25 mg','comprimido',false),
  ('Hidralazina 20 mg/mL injetável','Cloridrato de hidralazina','Cardiovasculares e anti-hipertensivos','Ampola','20 mg/mL','ampola',false),
  ('Amiodarona 200 mg comprimido','Cloridrato de amiodarona','Cardiovasculares e anti-hipertensivos','Comprimido','200 mg','comprimido',false),
  ('Amiodarona 50 mg/mL injetável','Cloridrato de amiodarona','Cardiovasculares e anti-hipertensivos','Ampola','50 mg/mL','ampola',false),
  ('Digoxina 0,25 mg comprimido','Digoxina','Cardiovasculares e anti-hipertensivos','Comprimido','0,25 mg','comprimido',false),
  ('Isossorbida 5 mg sublingual','Dinitrato de isossorbida','Cardiovasculares e anti-hipertensivos','Comprimido','5 mg','comprimido',false),
  ('Nifedipino 20 mg comprimido','Nifedipino','Cardiovasculares e anti-hipertensivos','Comprimido','20 mg','comprimido',false),
  -- ===== Diuréticos =====
  ('Furosemida 40 mg comprimido','Furosemida','Diuréticos','Comprimido','40 mg','comprimido',false),
  ('Furosemida 10 mg/mL injetável','Furosemida','Diuréticos','Ampola','10 mg/mL','ampola',false),
  ('Hidroclorotiazida 25 mg comprimido','Hidroclorotiazida','Diuréticos','Comprimido','25 mg','comprimido',false),
  ('Espironolactona 25 mg comprimido','Espironolactona','Diuréticos','Comprimido','25 mg','comprimido',false),
  ('Manitol 20% frasco','Manitol','Diuréticos','Frasco','200 mg/mL','frasco',false),
  -- ===== Anticoagulantes e antitrombóticos =====
  ('Heparina sódica 5.000 UI/mL injetável','Heparina sódica','Anticoagulantes e antitrombóticos','Frasco-ampola','5.000 UI/mL','frasco-ampola',false),
  ('Enoxaparina 40 mg seringa','Enoxaparina sódica','Anticoagulantes e antitrombóticos','Seringa','40 mg','seringa',false),
  ('Enoxaparina 60 mg seringa','Enoxaparina sódica','Anticoagulantes e antitrombóticos','Seringa','60 mg','seringa',false),
  ('Varfarina 5 mg comprimido','Varfarina sódica','Anticoagulantes e antitrombóticos','Comprimido','5 mg','comprimido',false),
  ('Rivaroxabana 20 mg comprimido','Rivaroxabana','Anticoagulantes e antitrombóticos','Comprimido','20 mg','comprimido',false),
  ('Clopidogrel 75 mg comprimido','Clopidogrel','Anticoagulantes e antitrombóticos','Comprimido','75 mg','comprimido',false),
  ('Alteplase 50 mg injetável','Alteplase','Anticoagulantes e antitrombóticos','Frasco-ampola','50 mg','frasco-ampola',false),
  -- ===== Drogas vasoativas =====
  ('Noradrenalina 2 mg/mL injetável','Hemitartarato de noradrenalina','Drogas vasoativas','Ampola','2 mg/mL','ampola',false),
  ('Adrenalina 1 mg/mL injetável','Epinefrina','Drogas vasoativas','Ampola','1 mg/mL','ampola',false),
  ('Dopamina 5 mg/mL injetável','Cloridrato de dopamina','Drogas vasoativas','Ampola','5 mg/mL','ampola',false),
  ('Dobutamina 12,5 mg/mL injetável','Cloridrato de dobutamina','Drogas vasoativas','Ampola','12,5 mg/mL','ampola',false),
  ('Vasopressina 20 UI/mL injetável','Vasopressina','Drogas vasoativas','Ampola','20 UI/mL','ampola',false),
  -- ===== Respiratório / broncodilatadores =====
  ('Salbutamol spray 100 mcg/dose','Sulfato de salbutamol','Respiratório / broncodilatadores','Spray/Aerossol','100 mcg/dose','frasco',false),
  ('Salbutamol 5 mg/mL solução p/ nebulização','Sulfato de salbutamol','Respiratório / broncodilatadores','Frasco','5 mg/mL','frasco',false),
  ('Ipratrópio 0,25 mg/mL solução','Brometo de ipratrópio','Respiratório / broncodilatadores','Frasco','0,25 mg/mL','frasco',false),
  ('Aminofilina 24 mg/mL injetável','Aminofilina','Respiratório / broncodilatadores','Ampola','24 mg/mL','ampola',false),
  ('Budesonida spray 200 mcg/dose','Budesonida','Respiratório / broncodilatadores','Spray/Aerossol','200 mcg/dose','frasco',false),
  -- ===== Corticoides =====
  ('Hidrocortisona 100 mg injetável','Succinato sódico de hidrocortisona','Corticoides','Frasco-ampola','100 mg','frasco-ampola',false),
  ('Hidrocortisona 500 mg injetável','Succinato sódico de hidrocortisona','Corticoides','Frasco-ampola','500 mg','frasco-ampola',false),
  ('Dexametasona 4 mg/mL injetável','Fosfato dissódico de dexametasona','Corticoides','Ampola','4 mg/mL','ampola',false),
  ('Dexametasona 4 mg comprimido','Dexametasona','Corticoides','Comprimido','4 mg','comprimido',false),
  ('Prednisona 20 mg comprimido','Prednisona','Corticoides','Comprimido','20 mg','comprimido',false),
  ('Prednisolona 3 mg/mL solução oral','Fosfato sódico de prednisolona','Corticoides','Solução oral','3 mg/mL','frasco',false),
  ('Metilprednisolona 500 mg injetável','Succinato sódico de metilprednisolona','Corticoides','Frasco-ampola','500 mg','frasco-ampola',false),
  -- ===== Antieméticos =====
  ('Metoclopramida 10 mg comprimido','Cloridrato de metoclopramida','Antieméticos','Comprimido','10 mg','comprimido',false),
  ('Metoclopramida 5 mg/mL injetável','Cloridrato de metoclopramida','Antieméticos','Ampola','5 mg/mL','ampola',false),
  ('Ondansetrona 2 mg/mL injetável','Cloridrato de ondansetrona','Antieméticos','Ampola','2 mg/mL','ampola',false),
  ('Ondansetrona 8 mg comprimido','Cloridrato de ondansetrona','Antieméticos','Comprimido','8 mg','comprimido',false),
  ('Bromoprida 10 mg comprimido','Bromoprida','Antieméticos','Comprimido','10 mg','comprimido',false),
  -- ===== Antiulcerosos / protetores gástricos =====
  ('Omeprazol 20 mg cápsula','Omeprazol','Antiulcerosos / protetores gástricos','Cápsula','20 mg','cápsula',false),
  ('Omeprazol 40 mg injetável','Omeprazol sódico','Antiulcerosos / protetores gástricos','Frasco-ampola','40 mg','frasco-ampola',false),
  ('Pantoprazol 40 mg comprimido','Pantoprazol sódico','Antiulcerosos / protetores gástricos','Comprimido','40 mg','comprimido',false),
  ('Pantoprazol 40 mg injetável','Pantoprazol sódico','Antiulcerosos / protetores gástricos','Frasco-ampola','40 mg','frasco-ampola',false),
  ('Famotidina 20 mg comprimido','Famotidina','Antiulcerosos / protetores gástricos','Comprimido','20 mg','comprimido',false),
  -- ===== Sedativos e anticonvulsivantes =====
  ('Midazolam 5 mg/mL injetável','Midazolam','Sedativos e anticonvulsivantes','Ampola','5 mg/mL','ampola',true),
  ('Midazolam 15 mg comprimido','Midazolam','Sedativos e anticonvulsivantes','Comprimido','15 mg','comprimido',true),
  ('Diazepam 5 mg/mL injetável','Diazepam','Sedativos e anticonvulsivantes','Ampola','5 mg/mL','ampola',true),
  ('Diazepam 10 mg comprimido','Diazepam','Sedativos e anticonvulsivantes','Comprimido','10 mg','comprimido',true),
  ('Clonazepam 2 mg comprimido','Clonazepam','Sedativos e anticonvulsivantes','Comprimido','2 mg','comprimido',true),
  ('Fenobarbital 100 mg comprimido','Fenobarbital','Sedativos e anticonvulsivantes','Comprimido','100 mg','comprimido',true),
  ('Fenobarbital 100 mg/mL injetável','Fenobarbital sódico','Sedativos e anticonvulsivantes','Ampola','100 mg/mL','ampola',true),
  ('Fenitoína 100 mg comprimido','Fenitoína sódica','Sedativos e anticonvulsivantes','Comprimido','100 mg','comprimido',false),
  ('Fenitoína 50 mg/mL injetável','Fenitoína sódica','Sedativos e anticonvulsivantes','Ampola','50 mg/mL','ampola',false),
  ('Ácido valproico 500 mg comprimido','Valproato de sódio','Sedativos e anticonvulsivantes','Comprimido','500 mg','comprimido',false),
  ('Levetiracetam 500 mg comprimido','Levetiracetam','Sedativos e anticonvulsivantes','Comprimido','500 mg','comprimido',false),
  -- ===== Antipsicóticos e antidepressivos =====
  ('Haloperidol 5 mg/mL injetável','Haloperidol','Antipsicóticos e antidepressivos','Ampola','5 mg/mL','ampola',false),
  ('Haloperidol 5 mg comprimido','Haloperidol','Antipsicóticos e antidepressivos','Comprimido','5 mg','comprimido',false),
  ('Clorpromazina 25 mg/mL injetável','Cloridrato de clorpromazina','Antipsicóticos e antidepressivos','Ampola','25 mg/mL','ampola',false),
  ('Quetiapina 25 mg comprimido','Fumarato de quetiapina','Antipsicóticos e antidepressivos','Comprimido','25 mg','comprimido',false),
  ('Risperidona 2 mg comprimido','Risperidona','Antipsicóticos e antidepressivos','Comprimido','2 mg','comprimido',false),
  ('Amitriptilina 25 mg comprimido','Cloridrato de amitriptilina','Antipsicóticos e antidepressivos','Comprimido','25 mg','comprimido',false),
  ('Sertralina 50 mg comprimido','Cloridrato de sertralina','Antipsicóticos e antidepressivos','Comprimido','50 mg','comprimido',false),
  ('Fluoxetina 20 mg cápsula','Cloridrato de fluoxetina','Antipsicóticos e antidepressivos','Cápsula','20 mg','cápsula',false),
  -- ===== Anti-histamínicos / antialérgicos =====
  ('Prometazina 25 mg/mL injetável','Cloridrato de prometazina','Anti-histamínicos / antialérgicos','Ampola','25 mg/mL','ampola',false),
  ('Prometazina 25 mg comprimido','Cloridrato de prometazina','Anti-histamínicos / antialérgicos','Comprimido','25 mg','comprimido',false),
  ('Dexclorfeniramina 2 mg comprimido','Maleato de dexclorfeniramina','Anti-histamínicos / antialérgicos','Comprimido','2 mg','comprimido',false),
  ('Difenidramina 50 mg/mL injetável','Cloridrato de difenidramina','Anti-histamínicos / antialérgicos','Ampola','50 mg/mL','ampola',false),
  ('Loratadina 10 mg comprimido','Loratadina','Anti-histamínicos / antialérgicos','Comprimido','10 mg','comprimido',false),
  ('Hidroxizina 25 mg comprimido','Cloridrato de hidroxizina','Anti-histamínicos / antialérgicos','Comprimido','25 mg','comprimido',false),
  -- ===== Soluções, eletrólitos e soros =====
  ('Cloreto de sódio 0,9% 500 mL','Cloreto de sódio','Soluções, eletrólitos e soros','Bolsa/Soro','0,9%','bolsa',false),
  ('Cloreto de sódio 0,9% 250 mL','Cloreto de sódio','Soluções, eletrólitos e soros','Bolsa/Soro','0,9%','bolsa',false),
  ('Glicose 5% 500 mL','Glicose','Soluções, eletrólitos e soros','Bolsa/Soro','5%','bolsa',false),
  ('Glicose 50% 10 mL','Glicose','Soluções, eletrólitos e soros','Ampola','50%','ampola',false),
  ('Ringer com lactato 500 mL','Solução de Ringer com lactato','Soluções, eletrólitos e soros','Bolsa/Soro','500 mL','bolsa',false),
  ('Cloreto de potássio 19,1% 10 mL','Cloreto de potássio','Soluções, eletrólitos e soros','Ampola','191 mg/mL','ampola',false),
  ('Cloreto de sódio 20% 10 mL','Cloreto de sódio','Soluções, eletrólitos e soros','Ampola','200 mg/mL','ampola',false),
  ('Gluconato de cálcio 10% injetável','Gluconato de cálcio','Soluções, eletrólitos e soros','Ampola','100 mg/mL','ampola',false),
  ('Sulfato de magnésio 50% 10 mL','Sulfato de magnésio','Soluções, eletrólitos e soros','Ampola','500 mg/mL','ampola',false),
  ('Bicarbonato de sódio 8,4% 10 mL','Bicarbonato de sódio','Soluções, eletrólitos e soros','Ampola','84 mg/mL','ampola',false),
  ('Água para injeção 10 mL','Água para injeção','Soluções, eletrólitos e soros','Ampola','10 mL','ampola',false),
  -- ===== Vitaminas e suplementos =====
  ('Complexo B injetável','Vitaminas do complexo B','Vitaminas e suplementos','Ampola','2 mL','ampola',false),
  ('Tiamina (B1) 100 mg/mL injetável','Cloridrato de tiamina','Vitaminas e suplementos','Ampola','100 mg/mL','ampola',false),
  ('Vitamina C 100 mg/mL injetável','Ácido ascórbico','Vitaminas e suplementos','Ampola','100 mg/mL','ampola',false),
  ('Vitamina K 10 mg/mL injetável','Fitomenadiona','Vitaminas e suplementos','Ampola','10 mg/mL','ampola',false),
  ('Ácido fólico 5 mg comprimido','Ácido fólico','Vitaminas e suplementos','Comprimido','5 mg','comprimido',false),
  ('Sulfato ferroso 40 mg comprimido','Sulfato ferroso','Vitaminas e suplementos','Comprimido','40 mg Fe','comprimido',false),
  ('Cianocobalamina (B12) 1 mg/mL injetável','Cianocobalamina','Vitaminas e suplementos','Ampola','1 mg/mL','ampola',false)
) as v(nome, principio_ativo, classe, forma, concentracao, unidade, controlado)
where not exists (
  select 1 from public.farm_medicamentos m where lower(m.nome) = lower(v.nome)
);

-- Confira quantos ficaram cadastrados:
-- select classe, count(*) from public.farm_medicamentos group by classe order by classe;


-- ┌────────────────────────────────────────────────────────────
-- │ 04/75 — migracao-farmacia-faseB.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — Farmácia · Fase B (prescrição estruturada + dispensação)
-- Rodar UMA vez no HNSN (Supabase → SQL Editor), DEPOIS da Fase A.
-- Idempotente: pode rodar de novo sem quebrar nada.
-- ============================================================

-- ===== Itens estruturados da prescrição do PS (imutável) =====
create table if not exists public.ps_prescricao_itens (
  id bigserial primary key,
  atendimento_id bigint not null,        -- ps_atendimentos.id
  registro_id bigint,                    -- ps_registros.id (a prescrição assinada)
  medicamento_id bigint,                 -- farm_medicamentos.id (null p/ item livre)
  medicamento_nome text not null,        -- snapshot do nome/apresentação
  unidade text,
  dose text,                             -- posologia (ex.: "1 comp 8/8h")
  via text,                              -- VO, IV, IM, SC, inalatória...
  quantidade numeric,                    -- quantidade a dispensar
  usuario text,
  created_at timestamptz default now()
);
create index if not exists ps_presc_itens_at_idx on public.ps_prescricao_itens (atendimento_id);
alter table public.ps_prescricao_itens enable row level security;
drop policy if exists ps_presc_itens_select on public.ps_prescricao_itens;
drop policy if exists ps_presc_itens_insert on public.ps_prescricao_itens;
create policy ps_presc_itens_select on public.ps_prescricao_itens for select to authenticated using (true);
create policy ps_presc_itens_insert on public.ps_prescricao_itens for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável

-- ===== Vínculos da dispensação no kardex de estoque =====
alter table public.farm_movimentos add column if not exists atendimento_id bigint;
alter table public.farm_movimentos add column if not exists prescricao_item_id bigint;
alter table public.farm_movimentos add column if not exists setor text;
create index if not exists farm_mov_presc_idx on public.farm_movimentos (prescricao_item_id);
create index if not exists farm_mov_atend_idx on public.farm_movimentos (atendimento_id);

-- Fim da Fase B da Farmácia.


-- ┌────────────────────────────────────────────────────────────
-- │ 05/75 — migracao-farmacia-clinica-fase1.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — Farmácia Clínica · Fase 1 (motor de alertas + base clínica)
-- Rodar UMA vez no HNSN (Supabase → SQL Editor), com o script INTEIRO.
-- Idempotente nas colunas (add if not exists). O bloco de seed preenche
-- atributos clínicos de referência (Beers, pediatria, dose máx, sonda) —
-- TUDO editável e sujeito a validação pela equipe de farmácia clínica.
-- ============================================================

-- 1) Atributos clínicos por medicamento (base de conhecimento curável)
alter table public.farm_medicamentos
  add column if not exists grupo_terapeutico text,
  add column if not exists dose_maxima_dia numeric,
  add column if not exists dose_maxima_unid text,
  add column if not exists duracao_maxima_dias int,
  add column if not exists nao_triturar boolean default false,
  add column if not exists inapropriado_idoso boolean default false,
  add column if not exists motivo_idoso text,
  add column if not exists inapropriado_pediatrico boolean default false,
  add column if not exists motivo_pediatrico text,
  add column if not exists idade_pediatrica int,          -- limiar (anos); null => usa 12
  add column if not exists ajuste_renal text,             -- usado na Fase 3
  add column if not exists ajuste_hepatico text,          -- usado na Fase 3
  add column if not exists obs_clinica text;

-- 2) Dose estruturada nos itens da prescrição (p/ checar dose máxima e duração)
alter table public.ps_prescricao_itens
  add column if not exists dose_valor numeric,
  add column if not exists dose_unidade text,
  add column if not exists frequencia_dia numeric,        -- vezes por dia (8/8h => 3)
  add column if not exists duracao_dias numeric;

-- 3) Contexto clínico do paciente (do episódio do PS)
alter table public.ps_atendimentos
  add column if not exists idade int,
  add column if not exists peso numeric(5,1),
  add column if not exists clearance_renal numeric,       -- ClCr / TFG estimada (mL/min)
  add column if not exists funcao_hepatica text,          -- normal | leve | moderada | grave
  add column if not exists alergias text,
  add column if not exists em_sonda boolean default false,
  add column if not exists gestante boolean default false;

-- ============================================================
-- SEED de atributos clínicos de referência (revisar com a equipe)
-- Fontes consagradas: Critérios de Beers (AGS), bulas/ANVISA, listas de
-- "não triturar". Valores conservadores; ajuste conforme protocolo local.
-- ============================================================
update public.farm_medicamentos m set
  grupo_terapeutico       = coalesce(v.grupo, m.grupo_terapeutico),
  dose_maxima_dia         = coalesce(v.dose_max, m.dose_maxima_dia),
  dose_maxima_unid        = coalesce(v.dose_unid, m.dose_maxima_unid),
  nao_triturar            = coalesce(v.sonda, m.nao_triturar),
  inapropriado_idoso      = coalesce(v.idoso, m.inapropriado_idoso),
  motivo_idoso            = coalesce(v.motivo_idoso, m.motivo_idoso),
  inapropriado_pediatrico = coalesce(v.ped, m.inapropriado_pediatrico),
  motivo_pediatrico       = coalesce(v.motivo_ped, m.motivo_pediatrico),
  idade_pediatrica        = coalesce(v.idade_ped, m.idade_pediatrica),
  obs_clinica             = coalesce(v.obs, m.obs_clinica)
from (values
  -- nome, grupo, dose_max(numeric), dose_unid, sonda(bool), idoso(bool), motivo_idoso, ped(bool), motivo_ped, idade_ped(int), obs
  ('Paracetamol 500 mg comprimido', null, 4000::numeric, 'mg', null::boolean, null::boolean, null, null::boolean, null, null::int, null),
  ('Paracetamol 200 mg/mL gotas', null, 4000, 'mg', null, null, null, null, null, null, null),
  ('Dipirona 500 mg comprimido', null, 4000, 'mg', null, null, null, null, null, null, null),
  ('Dipirona 500 mg/mL solução injetável', null, 4000, 'mg', null, null, null, null, null, null, null),
  ('Dipirona 500 mg/mL gotas', null, 4000, 'mg', null, null, null, null, null, null, null),
  ('Ácido acetilsalicílico 100 mg comprimido', null, null, null, null, null, null, true, 'Risco de síndrome de Reye em crianças/adolescentes (evitar em quadros virais)', 18, null),
  ('Ibuprofeno 600 mg comprimido', 'AINE', 3200, 'mg', null, null, null, null, null, null, null),
  ('Diclofenaco sódico 50 mg comprimido', 'AINE', 150, 'mg', true, null, null, null, null, null, 'Comprimido gastrorresistente — não triturar'),
  ('Diclofenaco sódico 25 mg/mL injetável', 'AINE', 150, 'mg', null, null, null, null, null, null, null),
  ('Cetoprofeno 100 mg injetável', 'AINE', null, null, null, null, null, null, null, null, null),
  ('Naproxeno 500 mg comprimido', 'AINE', null, null, null, null, null, null, null, null, null),
  ('Tenoxicam 20 mg injetável', 'AINE', null, null, null, null, null, null, null, null, null),
  ('Morfina 10 mg/mL injetável', 'Opioide', null, null, null, null, null, null, null, null, null),
  ('Morfina 10 mg comprimido', 'Opioide', null, null, null, null, null, null, null, null, null),
  ('Fentanila 50 mcg/mL injetável', 'Opioide', null, null, null, null, null, null, null, null, null),
  ('Tramadol 50 mg cápsula', 'Opioide', 400, 'mg', null, null, null, true, 'Não recomendado em menores de 12 anos (risco respiratório)', 12, null),
  ('Tramadol 50 mg/mL injetável', 'Opioide', 400, 'mg', null, null, null, true, 'Não recomendado em menores de 12 anos (risco respiratório)', 12, null),
  ('Codeína 30 mg comprimido', 'Opioide', 240, 'mg', null, null, null, true, 'Contraindicada em menores de 12 anos (metabolização variável, risco respiratório)', 12, null),
  ('Metadona 10 mg comprimido', 'Opioide', null, null, null, null, null, null, null, null, null),
  ('Diazepam 10 mg comprimido', 'Benzodiazepínico', null, null, null, true, 'Benzodiazepínico — sedação, quedas, fraturas e declínio cognitivo em idosos (Beers)', null, null, null, null),
  ('Diazepam 5 mg/mL injetável', 'Benzodiazepínico', null, null, null, true, 'Benzodiazepínico — sedação, quedas, fraturas e declínio cognitivo em idosos (Beers)', null, null, null, null),
  ('Midazolam 15 mg comprimido', 'Benzodiazepínico', null, null, null, true, 'Benzodiazepínico — sedação, quedas e declínio cognitivo em idosos (Beers)', null, null, null, null),
  ('Midazolam 5 mg/mL injetável', 'Benzodiazepínico', null, null, null, true, 'Benzodiazepínico — sedação e depressão respiratória em idosos (Beers)', null, null, null, null),
  ('Clonazepam 2 mg comprimido', 'Benzodiazepínico', null, null, null, true, 'Benzodiazepínico — sedação, quedas e declínio cognitivo em idosos (Beers)', null, null, null, null),
  ('Amitriptilina 25 mg comprimido', null, null, null, null, true, 'Antidepressivo tricíclico — forte efeito anticolinérgico (Beers)', null, null, null, null),
  ('Clorpromazina 25 mg/mL injetável', null, null, null, null, true, 'Antipsicótico — efeitos anticolinérgicos e extrapiramidais em idosos (Beers)', null, null, null, null),
  ('Prometazina 25 mg comprimido', null, null, null, null, true, 'Anti-histamínico de 1ª geração — anticolinérgico (Beers)', null, null, null, null),
  ('Prometazina 25 mg/mL injetável', null, null, null, null, true, 'Anti-histamínico de 1ª geração — anticolinérgico (Beers)', null, null, null, null),
  ('Dexclorfeniramina 2 mg comprimido', null, null, null, null, true, 'Anti-histamínico de 1ª geração — anticolinérgico (Beers)', null, null, null, null),
  ('Difenidramina 50 mg/mL injetável', null, null, null, null, true, 'Anti-histamínico de 1ª geração — anticolinérgico (Beers)', null, null, null, null),
  ('Hidroxizina 25 mg comprimido', null, null, null, null, true, 'Anti-histamínico de 1ª geração — anticolinérgico (Beers)', null, null, null, null),
  ('Fenobarbital 100 mg comprimido', null, null, null, null, true, 'Barbitúrico — alta taxa de dependência e sedação (Beers)', null, null, null, null),
  ('Fenobarbital 100 mg/mL injetável', null, null, null, null, true, 'Barbitúrico — alta taxa de dependência e sedação (Beers)', null, null, null, null),
  ('Glibenclamida 5 mg comprimido', null, null, null, null, true, 'Sulfonilureia de longa ação — hipoglicemia prolongada em idosos (Beers)', null, null, null, null),
  ('Digoxina 0,25 mg comprimido', null, null, null, null, true, 'Em idosos, evitar dose > 0,125 mg/dia (Beers)', null, null, null, null),
  ('Nifedipino 20 mg comprimido', null, null, null, null, true, 'Di-hidropiridina de ação rápida — risco de hipotensão em idosos (Beers)', null, null, null, null),
  ('Omeprazol 20 mg cápsula', 'IBP', null, null, true, null, null, null, null, null, 'Grânulos gastrorresistentes — abrir a cápsula, não triturar; dispersar e lavar bem a sonda'),
  ('Omeprazol 40 mg injetável', 'IBP', null, null, null, null, null, null, null, null, null),
  ('Pantoprazol 40 mg comprimido', 'IBP', null, null, true, null, null, null, null, null, 'Comprimido revestido entérico — não triturar'),
  ('Pantoprazol 40 mg injetável', 'IBP', null, null, null, null, null, null, null, null, null),
  ('Hidrocortisona 100 mg injetável', 'Corticoide sistêmico', null, null, null, null, null, null, null, null, null),
  ('Hidrocortisona 500 mg injetável', 'Corticoide sistêmico', null, null, null, null, null, null, null, null, null),
  ('Dexametasona 4 mg/mL injetável', 'Corticoide sistêmico', null, null, null, null, null, null, null, null, null),
  ('Dexametasona 4 mg comprimido', 'Corticoide sistêmico', null, null, null, null, null, null, null, null, null),
  ('Prednisona 20 mg comprimido', 'Corticoide sistêmico', null, null, null, null, null, null, null, null, null),
  ('Prednisolona 3 mg/mL solução oral', 'Corticoide sistêmico', null, null, null, null, null, null, null, null, null),
  ('Metilprednisolona 500 mg injetável', 'Corticoide sistêmico', null, null, null, null, null, null, null, null, null),
  ('Ciprofloxacino 500 mg comprimido', null, null, null, null, null, null, true, 'Fluoroquinolona — evitar em crianças/adolescentes salvo indicação específica (risco musculoesquelético)', 18, null),
  ('Ciprofloxacino 2 mg/mL bolsa', null, null, null, null, null, null, true, 'Fluoroquinolona — evitar em crianças/adolescentes salvo indicação específica (risco musculoesquelético)', 18, null),
  ('Levofloxacino 500 mg comprimido', null, null, null, null, null, null, true, 'Fluoroquinolona — evitar em crianças/adolescentes salvo indicação específica (risco musculoesquelético)', 18, null),
  ('Metoclopramida 10 mg comprimido', null, null, null, null, null, null, true, 'Risco de reações extrapiramidais; restrito em menores de 1 ano', 1, null),
  ('Metoclopramida 5 mg/mL injetável', null, null, null, null, null, null, true, 'Risco de reações extrapiramidais; restrito em menores de 1 ano', 1, null)
) as v(nome, grupo, dose_max, dose_unid, sonda, idoso, motivo_idoso, ped, motivo_ped, idade_ped, obs)
where lower(m.nome) = lower(v.nome);

-- Conferência sugerida:
-- select count(*) filter (where inapropriado_idoso) as beers,
--        count(*) filter (where inapropriado_pediatrico) as pediatria,
--        count(*) filter (where nao_triturar) as sonda,
--        count(*) filter (where dose_maxima_dia is not null) as dose_max
-- from public.farm_medicamentos;


-- ┌────────────────────────────────────────────────────────────
-- │ 06/75 — migracao-farmacia-clinica-fase2.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — Farmácia Clínica · Fase 2 (interações + incompatibilidade em Y)
-- Rodar UMA vez no HNSN (Supabase → SQL Editor), com o script INTEIRO.
-- Tabelas de PARES de substâncias, curáveis pela equipe. O seed traz
-- interações maiores clássicas — CONSERVADOR e SUJEITO A VALIDAÇÃO local.
-- ============================================================

-- 1) Interações medicamentosas (par de substâncias)
create table if not exists public.farm_interacoes (
  id bigserial primary key,
  substancia_a text not null,            -- termo minúsculo/sem acento (casa por princípio ativo/grupo)
  substancia_b text not null,
  gravidade text not null default 'moderada',   -- grave | moderada | leve
  descricao text,
  conduta text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.farm_interacoes enable row level security;
drop policy if exists farm_inter_select on public.farm_interacoes;
drop policy if exists farm_inter_insert on public.farm_interacoes;
drop policy if exists farm_inter_update on public.farm_interacoes;
drop policy if exists farm_inter_delete on public.farm_interacoes;
create policy farm_inter_select on public.farm_interacoes for select to authenticated using (true);
create policy farm_inter_insert on public.farm_interacoes for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_inter_update on public.farm_interacoes for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_inter_delete on public.farm_interacoes for delete to authenticated using (public.my_role() = 'adm_master');

-- 2) Incompatibilidade em Y (par de substâncias na mesma via IV)
create table if not exists public.farm_incompat_y (
  id bigserial primary key,
  substancia_a text not null,
  substancia_b text not null,
  descricao text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.farm_incompat_y enable row level security;
drop policy if exists farm_incy_select on public.farm_incompat_y;
drop policy if exists farm_incy_insert on public.farm_incompat_y;
drop policy if exists farm_incy_update on public.farm_incompat_y;
drop policy if exists farm_incy_delete on public.farm_incompat_y;
create policy farm_incy_select on public.farm_incompat_y for select to authenticated using (true);
create policy farm_incy_insert on public.farm_incompat_y for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_incy_update on public.farm_incompat_y for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_incy_delete on public.farm_incompat_y for delete to authenticated using (public.my_role() = 'adm_master');

-- ============================================================
-- SEED — interações maiores clássicas (revisar com a equipe)
-- substâncias em minúsculo/sem acento; "aine", "opioide", "benzodiazep"
-- casam por grupo terapêutico dos medicamentos.
-- ============================================================
insert into public.farm_interacoes (substancia_a, substancia_b, gravidade, descricao, conduta)
select a, b, g, d, c from (values
  ('opioide','benzodiazep','grave','Depressão respiratória e do SNC aditiva','monitorar sedação/FR; usar menor dose'),
  ('varfarina','aine','grave','Risco elevado de sangramento','evitar; preferir analgésico alternativo'),
  ('varfarina','acido acetilsalicilico','grave','Risco elevado de sangramento','evitar associação'),
  ('varfarina','sulfametoxazol','grave','Aumento importante do INR','monitorar INR; evitar se possível'),
  ('varfarina','amiodarona','grave','Aumento do efeito anticoagulante','reduzir dose e monitorar INR'),
  ('varfarina','fluconazol','grave','Aumento do INR (inibição CYP)','monitorar INR'),
  ('varfarina','ciprofloxacino','moderada','Pode aumentar o INR','monitorar INR'),
  ('digoxina','amiodarona','grave','Aumenta níveis de digoxina (toxicidade)','reduzir digoxina ~50% e monitorar'),
  ('digoxina','furosemida','moderada','Hipocalemia potencializa toxicidade digitálica','monitorar potássio'),
  ('digoxina','espironolactona','moderada','Altera níveis/efeito da digoxina','monitorar'),
  ('espironolactona','enalapril','grave','Hipercalemia','monitorar potássio e função renal'),
  ('espironolactona','captopril','grave','Hipercalemia','monitorar potássio e função renal'),
  ('espironolactona','losartana','grave','Hipercalemia','monitorar potássio'),
  ('espironolactona','cloreto de potassio','grave','Hipercalemia','evitar associação'),
  ('enalapril','cloreto de potassio','grave','Hipercalemia','monitorar potássio'),
  ('captopril','cloreto de potassio','grave','Hipercalemia','monitorar potássio'),
  ('tramadol','sertralina','grave','Síndrome serotoninérgica e risco de convulsão','evitar; monitorar'),
  ('tramadol','fluoxetina','grave','Síndrome serotoninérgica e risco de convulsão','evitar; monitorar'),
  ('tramadol','amitriptilina','moderada','Risco de convulsão e efeito serotoninérgico','cautela'),
  ('fluoxetina','amitriptilina','moderada','Aumento dos níveis do tricíclico / serotoninérgico','monitorar'),
  ('amiodarona','ciprofloxacino','moderada','Prolongamento do intervalo QT','monitorar ECG/eletrólitos'),
  ('amiodarona','levofloxacino','moderada','Prolongamento do intervalo QT','monitorar ECG/eletrólitos'),
  ('amiodarona','claritromicina','grave','Prolongamento do QT / arritmias','evitar associação'),
  ('aine','enalapril','moderada','Reduz efeito anti-hipertensivo e risco renal','monitorar PA e função renal'),
  ('aine','captopril','moderada','Reduz efeito anti-hipertensivo e risco renal','monitorar PA e função renal'),
  ('aine','furosemida','moderada','Reduz efeito diurético','monitorar resposta'),
  ('metoclopramida','haloperidol','moderada','Efeitos extrapiramidais aditivos','cautela')
) as v(a, b, g, d, c)
where not exists (
  select 1 from public.farm_interacoes fi
  where (lower(fi.substancia_a) = v.a and lower(fi.substancia_b) = v.b)
     or (lower(fi.substancia_a) = v.b and lower(fi.substancia_b) = v.a)
);

-- SEED — incompatibilidades em Y (IV) clássicas (revisar com a equipe)
insert into public.farm_incompat_y (substancia_a, substancia_b, descricao)
select a, b, d from (values
  ('ceftriaxona','gluconato de calcio','Precipitação (sal de cálcio) — contraindicado, sobretudo em neonatos'),
  ('ceftriaxona','ringer','Solução com cálcio — risco de precipitação'),
  ('fenitoina','glicose','Precipita em soluções glicosadas — diluir apenas em SF 0,9%'),
  ('fenitoina','noradrenalina','Incompatível na mesma linha'),
  ('anfotericina','cloreto de sodio','Precipita em salina — diluir apenas em glicose 5%'),
  ('furosemida','midazolam','Precipitação'),
  ('furosemida','dobutamina','Incompatível'),
  ('vancomicina','ceftriaxona','Precipitação'),
  ('vancomicina','heparina','Incompatível'),
  ('midazolam','bicarbonato de sodio','Precipitação'),
  ('bicarbonato de sodio','noradrenalina','Inativa a catecolamina'),
  ('bicarbonato de sodio','adrenalina','Inativa a catecolamina'),
  ('bicarbonato de sodio','gluconato de calcio','Precipita (carbonato de cálcio)'),
  ('diazepam','furosemida','Precipitação')
) as v(a, b, d)
where not exists (
  select 1 from public.farm_incompat_y fy
  where (lower(fy.substancia_a) = v.a and lower(fy.substancia_b) = v.b)
     or (lower(fy.substancia_a) = v.b and lower(fy.substancia_b) = v.a)
);

-- Conferência:
-- select count(*) from public.farm_interacoes;
-- select count(*) from public.farm_incompat_y;


-- ┌────────────────────────────────────────────────────────────
-- │ 07/75 — migracao-farmacia-clinica-fase3.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — Farmácia Clínica · Fase 3 (ajuste renal/hepático)
-- Rodar UMA vez no HNSN (Supabase → SQL Editor), com o script INTEIRO.
-- NÃO altera estrutura (colunas ajuste_renal/ajuste_hepatico já existem
-- desde a Fase 1). Só preenche orientações de referência — CONSERVADOR e
-- SUJEITO A VALIDAÇÃO pela equipe de farmácia clínica.
-- ============================================================
update public.farm_medicamentos m set
  ajuste_renal    = coalesce(v.ren, m.ajuste_renal),
  ajuste_hepatico = coalesce(v.hep, m.ajuste_hepatico)
from (values
  -- nome, ajuste_renal, ajuste_hepatico
  ('Paracetamol 500 mg comprimido', null, 'Hepatotóxico — reduzir a dose máxima diária na hepatopatia.'),
  ('Paracetamol 200 mg/mL gotas', null, 'Hepatotóxico — reduzir a dose máxima diária na hepatopatia.'),
  ('Ibuprofeno 600 mg comprimido', 'AINE nefrotóxico — evitar na insuficiência renal; monitorar função renal.', null),
  ('Diclofenaco sódico 50 mg comprimido', 'AINE nefrotóxico — evitar na insuficiência renal.', null),
  ('Diclofenaco sódico 25 mg/mL injetável', 'AINE nefrotóxico — evitar na insuficiência renal.', null),
  ('Morfina 10 mg/mL injetável', 'Reduzir dose/intervalo na insuficiência renal (acúmulo de metabólitos).', 'Reduzir dose/intervalo na insuficiência hepática.'),
  ('Morfina 10 mg comprimido', 'Reduzir dose/intervalo na insuficiência renal (acúmulo de metabólitos).', 'Reduzir dose/intervalo na insuficiência hepática.'),
  ('Tramadol 50 mg cápsula', 'Reduzir dose se ClCr < 30 mL/min.', 'Reduzir dose na insuficiência hepática.'),
  ('Tramadol 50 mg/mL injetável', 'Reduzir dose se ClCr < 30 mL/min.', 'Reduzir dose na insuficiência hepática.'),
  ('Codeína 30 mg comprimido', null, 'Cautela/reduzir na hepatopatia (metabolização variável).'),
  ('Diazepam 10 mg comprimido', null, 'Acúmulo na hepatopatia — usar menor dose ou benzodiazepínico de meia-vida curta.'),
  ('Diazepam 5 mg/mL injetável', null, 'Acúmulo na hepatopatia — usar menor dose.'),
  ('Midazolam 15 mg comprimido', null, 'Acúmulo na hepatopatia — reduzir dose.'),
  ('Midazolam 5 mg/mL injetável', null, 'Acúmulo na hepatopatia — reduzir dose.'),
  ('Clonazepam 2 mg comprimido', null, 'Cautela na hepatopatia.'),
  ('Haloperidol 5 mg/mL injetável', null, 'Cautela na insuficiência hepática.'),
  ('Haloperidol 5 mg comprimido', null, 'Cautela na insuficiência hepática.'),
  ('Clorpromazina 25 mg/mL injetável', null, 'Cautela/evitar na hepatopatia.'),
  ('Ácido valproico 500 mg comprimido', null, 'Hepatotóxico — contraindicado na hepatopatia; monitorar enzimas.'),
  ('Amiodarona 200 mg comprimido', null, 'Hepatotóxico — monitorar enzimas hepáticas.'),
  ('Amiodarona 50 mg/mL injetável', null, 'Hepatotóxico — monitorar enzimas hepáticas.'),
  ('Fluconazol 150 mg cápsula', 'Reduzir dose de manutenção se ClCr < 50 mL/min.', 'Hepatotóxico — monitorar enzimas.'),
  ('Fluconazol 2 mg/mL bolsa', 'Reduzir dose de manutenção se ClCr < 50 mL/min.', 'Hepatotóxico — monitorar enzimas.'),
  ('Cetoconazol 200 mg comprimido', null, 'Hepatotóxico — evitar/monitorar na hepatopatia.'),
  ('Metronidazol 500 mg comprimido', null, 'Reduzir dose na insuficiência hepática grave.'),
  ('Metronidazol 5 mg/mL bolsa', null, 'Reduzir dose na insuficiência hepática grave.'),
  ('Vancomicina 500 mg injetável', 'Nefrotóxico — ajustar dose/intervalo pela ClCr e monitorar nível sérico.', null),
  ('Gentamicina 40 mg/mL injetável', 'Aminoglicosídeo nefrotóxico — ajustar por ClCr e monitorar nível sérico.', null),
  ('Amicacina 250 mg/mL injetável', 'Aminoglicosídeo nefrotóxico — ajustar por ClCr e monitorar nível sérico.', null),
  ('Meropenem 1 g injetável', 'Ajustar dose se ClCr reduzido.', null),
  ('Cefepima 1 g injetável', 'Ajustar dose se ClCr reduzido (risco de neurotoxicidade).', null),
  ('Piperacilina + Tazobactam 4,5 g injetável', 'Ajustar dose se ClCr reduzido.', null),
  ('Ciprofloxacino 500 mg comprimido', 'Ajustar dose se ClCr < 30 mL/min.', null),
  ('Ciprofloxacino 2 mg/mL bolsa', 'Ajustar dose se ClCr < 30 mL/min.', null),
  ('Levofloxacino 500 mg comprimido', 'Ajustar dose/intervalo se ClCr < 50 mL/min.', null),
  ('Aciclovir 200 mg comprimido', 'Ajustar por ClCr; hidratar (risco de cristalúria/nefrotoxicidade).', null),
  ('Aciclovir 250 mg injetável', 'Ajustar por ClCr; hidratar (risco de cristalúria/nefrotoxicidade).', null),
  ('Sulfametoxazol + Trimetoprima 400+80 mg comprimido', 'Ajustar dose se ClCr reduzido; evitar se ClCr < 15 mL/min.', null),
  ('Enoxaparina 40 mg seringa', 'Reduzir dose se ClCr < 30 mL/min; considerar anti-Xa.', null),
  ('Enoxaparina 60 mg seringa', 'Reduzir dose se ClCr < 30 mL/min; considerar anti-Xa.', null),
  ('Metformina 500 mg comprimido', 'Contraindicada se ClCr < 30 mL/min (risco de acidose lática).', null),
  ('Metformina 850 mg comprimido', 'Contraindicada se ClCr < 30 mL/min (risco de acidose lática).', null),
  ('Digoxina 0,25 mg comprimido', 'Reduzir dose na insuficiência renal (acúmulo).', null),
  ('Espironolactona 25 mg comprimido', 'Risco de hipercalemia na insuficiência renal — monitorar potássio.', null)
) as v(nome, ren, hep)
where lower(m.nome) = lower(v.nome);

-- Conferência:
-- select count(*) filter (where ajuste_renal is not null) as com_ajuste_renal,
--        count(*) filter (where ajuste_hepatico is not null) as com_ajuste_hepatico
-- from public.farm_medicamentos;


-- ┌────────────────────────────────────────────────────────────
-- │ 08/75 — migracao-farmacia-preparo.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — Farmácia · Fluxo de preparo (assinar→receber→preparo→pronto→retirada)
-- Rodar UMA vez no HNSN (Supabase → SQL Editor), com o script INTEIRO.
-- Uma linha por prescrição assinada (registro_id). "aguardando" é implícito:
-- prescrição assinada SEM linha aqui = aguardando a farmácia receber.
-- ============================================================
create table if not exists public.farm_preparo (
  id bigserial primary key,
  registro_id bigint not null unique,        -- ps_registros (prescrição assinada)
  atendimento_id bigint,
  status text not null default 'preparo',    -- preparo | pronto | retirado | cancelado
  recebido_em timestamptz, recebido_por text,
  pronto_em timestamptz,   pronto_por text,
  retirado_em timestamptz, retirado_por text,
  observacao text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists farm_preparo_at_idx on public.farm_preparo (atendimento_id);
alter table public.farm_preparo enable row level security;
drop policy if exists farm_prep_select on public.farm_preparo;
drop policy if exists farm_prep_insert on public.farm_preparo;
drop policy if exists farm_prep_update on public.farm_preparo;
drop policy if exists farm_prep_delete on public.farm_preparo;
create policy farm_prep_select on public.farm_preparo for select to authenticated using (true);
create policy farm_prep_insert on public.farm_preparo for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_prep_update on public.farm_preparo for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_prep_delete on public.farm_preparo for delete to authenticated using (public.my_role() = 'adm_master');


-- ┌────────────────────────────────────────────────────────────
-- │ 09/75 — migracao-farmacia-custos.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — Farmácia · Custos (custo unitário por medicamento)
-- Rodar UMA vez no HNSN (Supabase → SQL Editor).
-- Não altera dados; só adiciona a coluna de custo. Os preços são
-- preenchidos pela equipe no catálogo (Estoque → Editar).
-- ============================================================
alter table public.farm_medicamentos
  add column if not exists custo_unitario numeric;   -- R$ por unidade de dispensação


-- ┌────────────────────────────────────────────────────────────
-- │ 10/75 — migracao-farmacia-nao-padronizados.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — Farmácia · Medicamentos NÃO padronizados (trazidos pela família)
-- Rodar UMA vez no HNSN (Supabase → SQL Editor).
-- Registro dos medicamentos que NÃO estão no catálogo do hospital e que
-- o paciente/família traz — recebidos e controlados pela farmácia.
-- ============================================================
create table if not exists public.farm_nao_padronizados (
  id bigserial primary key,
  paciente_iniciais text not null,
  paciente_prontuario text,
  setor text,
  medicamento text not null,             -- nome livre (fora do catálogo)
  apresentacao text,                      -- forma / concentração
  quantidade numeric,
  unidade text,
  lote text, validade date,
  origem text,                            -- quem trouxe (ex.: familiar, próprio paciente)
  conferido boolean default false,        -- conferido/aprovado pelo farmacêutico
  status text not null default 'recebido',-- recebido | em_uso | devolvido | descartado
  observacao text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists farm_naopad_pac_idx on public.farm_nao_padronizados (paciente_prontuario);
alter table public.farm_nao_padronizados enable row level security;
drop policy if exists farm_naopad_select on public.farm_nao_padronizados;
drop policy if exists farm_naopad_insert on public.farm_nao_padronizados;
drop policy if exists farm_naopad_update on public.farm_nao_padronizados;
drop policy if exists farm_naopad_delete on public.farm_nao_padronizados;
create policy farm_naopad_select on public.farm_nao_padronizados for select to authenticated using (true);
create policy farm_naopad_insert on public.farm_nao_padronizados for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_naopad_update on public.farm_nao_padronizados for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_naopad_delete on public.farm_nao_padronizados for delete to authenticated using (public.my_role() = 'adm_master');


-- ┌────────────────────────────────────────────────────────────
-- │ 11/75 — migracao-farmacia-intervencoes.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — Farmácia · Intervenção farmacêutica (estilo NoHarm)
-- Rodar UMA vez no HNSN (Supabase → SQL Editor).
-- Registro das intervenções do farmacêutico sobre a prescrição, com
-- problema, conduta proposta e desfecho (aceita/não aceita/resolvida).
-- ============================================================
create table if not exists public.farm_intervencoes (
  id bigserial primary key,
  atendimento_id bigint,
  prescricao_item_id bigint,
  medicamento_nome text,
  paciente_iniciais text, paciente_prontuario text,
  tipo text,                              -- categoria do problema (alerta que originou)
  gravidade text,                         -- alta | media | baixa
  problema text not null,                 -- descrição do problema identificado
  conduta text,                           -- conduta/recomendação proposta
  status text not null default 'pendente',-- pendente | aceita | nao_aceita | resolvida | cancelada
  desfecho text,                          -- observação do desfecho / resposta do prescritor
  farmaceutico text,                      -- quem interveio
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists farm_interv_at_idx on public.farm_intervencoes (atendimento_id);
create index if not exists farm_interv_status_idx on public.farm_intervencoes (status);
alter table public.farm_intervencoes enable row level security;
drop policy if exists farm_interv2_select on public.farm_intervencoes;
drop policy if exists farm_interv2_insert on public.farm_intervencoes;
drop policy if exists farm_interv2_update on public.farm_intervencoes;
drop policy if exists farm_interv2_delete on public.farm_intervencoes;
create policy farm_interv2_select on public.farm_intervencoes for select to authenticated using (true);
create policy farm_interv2_insert on public.farm_intervencoes for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_interv2_update on public.farm_intervencoes for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_interv2_delete on public.farm_intervencoes for delete to authenticated using (public.my_role() = 'adm_master');


-- ┌────────────────────────────────────────────────────────────
-- │ 12/75 — migracao-leitos-kanban-metas.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — Giro de Leitos · Kanban de alta + Metas por setor + Motivo da espera
-- Rodar UMA vez no HNSN (Supabase → SQL Editor). Só ADICIONA colunas
-- (idempotente e reversível de fato — não apaga nem altera nada existente).
-- As tabelas já têm RLS/policies; colunas novas herdam as mesmas regras.
-- ============================================================

-- 1) KANBAN DE ALTA (alta segura) — pendências que travam a alta do paciente,
--    guardadas no próprio leito ocupado (JSON de chaves resolvidas/pendentes).
alter table public.leitos
  add column if not exists alta_pendencias text,     -- JSON: {"exame":true,"receita":false,...} (true = resolvido)
  add column if not exists alta_periodo    text;      -- previsão de saída no dia: manha | tarde | noite

-- 2) METAS POR SETOR — alvos para farol verde/vermelho nos relatórios.
alter table public.setores
  add column if not exists meta_ocupacao    int,       -- % ocupação alvo (ex.: 85)
  add column if not exists meta_permanencia numeric,   -- dias de permanência alvo (ex.: 5)
  add column if not exists meta_giro        numeric;   -- giro de leitos alvo no mês (ex.: 4.0)

-- 3) MOTIVO DA ESPERA NA FILA — categoriza por que o paciente aguarda leito.
alter table public.solicitacoes
  add column if not exists motivo_espera text;         -- sem_vaga | aguardando_limpeza | aguardando_exame | aguardando_familia | aguardando_transporte | regulacao | outro

-- Pronto. Nada mais a fazer.


-- ┌────────────────────────────────────────────────────────────
-- │ 13/75 — migracao-leitos-saida-setor.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — Giro de Leitos · Setor na saída (permanência/giro POR SETOR)
-- Rodar UMA vez no HNSN (Supabase → SQL Editor). Só ADICIONA uma coluna
-- (idempotente; não apaga nem altera nada existente).
-- Guarda em qual setor o paciente estava ao dar saída, para apurar
-- permanência média e giro de leitos por setor (farol das metas).
-- ============================================================

alter table public.leitos_saidas
  add column if not exists setor text;   -- setor do leito no momento da saída (alta/óbito/transferência)

-- Opcional: retro-preencher com o setor ATUAL do leito, só onde ainda está vazio.
-- (Aproximação — o leito pode ter trocado de setor depois. Comente se não quiser.)
update public.leitos_saidas s
   set setor = l.setor
  from public.leitos l
 where s.setor is null
   and s.leito = l.identificacao
   and l.setor is not null;

-- Pronto.


-- ┌────────────────────────────────────────────────────────────
-- │ 14/75 — migracao-suprimentos-faseA.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS (Estoque & Compras) — Fase A
-- Catálogo de materiais + estoque por lote/validade (kardex imutável) + fornecedores
-- Rodar no SQL Editor do Supabase do HNSN. Idempotente (pode rodar de novo sem quebrar).
-- ═══════════════════════════════════════════════════════════

-- Fornecedores (usados nas entradas; base das compras da Fase C)
create table if not exists public.sup_fornecedores (
  id bigserial primary key,
  nome text not null,                    -- razão social / nome fantasia
  cnpj text,
  contato text,                          -- pessoa de contato
  telefone text,
  email text,
  categorias text,                       -- o que fornece (texto livre: "material hospitalar, EPI")
  observacao text,
  ativo boolean default true,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists sup_forn_nome_idx on public.sup_fornecedores (lower(nome));
alter table public.sup_fornecedores enable row level security;
drop policy if exists sup_forn_select on public.sup_fornecedores;
drop policy if exists sup_forn_insert on public.sup_fornecedores;
drop policy if exists sup_forn_update on public.sup_fornecedores;
drop policy if exists sup_forn_delete on public.sup_fornecedores;
create policy sup_forn_select on public.sup_fornecedores for select to authenticated using (true);
create policy sup_forn_insert on public.sup_fornecedores for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_forn_update on public.sup_fornecedores for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_forn_delete on public.sup_fornecedores for delete to authenticated using (public.my_role() = 'adm_master');

-- Catálogo de materiais e insumos (almoxarifado)
create table if not exists public.sup_itens (
  id bigserial primary key,
  nome text not null,                    -- descrição (ex.: "Luva de procedimento M — cx 100")
  categoria text,                        -- material médico-hospitalar, higiene, EPI, escritório...
  unidade text default 'unidade',        -- unidade de controle (unidade, caixa, pacote, litro...)
  estoque_minimo numeric default 0,      -- ponto de ressuprimento
  custo_unitario numeric,                -- R$ por unidade de controle (para BI)
  ativo boolean default true,
  observacao text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists sup_itens_nome_idx on public.sup_itens (lower(nome));
alter table public.sup_itens enable row level security;
drop policy if exists sup_itens_select on public.sup_itens;
drop policy if exists sup_itens_insert on public.sup_itens;
drop policy if exists sup_itens_update on public.sup_itens;
drop policy if exists sup_itens_delete on public.sup_itens;
create policy sup_itens_select on public.sup_itens for select to authenticated using (true);
create policy sup_itens_insert on public.sup_itens for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_itens_update on public.sup_itens for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_itens_delete on public.sup_itens for delete to authenticated using (public.my_role() = 'adm_master');

-- Saldo por lote (derivado dos movimentos — mantido pelo trigger)
create table if not exists public.sup_lotes (
  id bigserial primary key,
  item_id bigint not null references public.sup_itens(id) on delete cascade,
  lote text not null default '',
  validade date,
  quantidade numeric not null default 0,
  updated_at timestamptz default now()
);
create unique index if not exists sup_lotes_uq on public.sup_lotes (item_id, lote);
alter table public.sup_lotes enable row level security;
drop policy if exists sup_lotes_select on public.sup_lotes;
create policy sup_lotes_select on public.sup_lotes for select to authenticated using (true);
-- escrita só pelo trigger (security definer); sem políticas de insert/update/delete direto

-- Kardex: movimentos de estoque (append-only — imutável)
create table if not exists public.sup_movimentos (
  id bigserial primary key,
  item_id bigint not null references public.sup_itens(id) on delete cascade,
  lote_id bigint,                        -- preenchido pelo trigger
  lote text,
  validade date,
  tipo text not null,                    -- entrada | saida
  quantidade numeric not null check (quantidade > 0),
  motivo text,                           -- compra/nota, consumo do setor, perda, ajuste...
  documento text,                        -- nº nota fiscal / requisição
  fornecedor_id bigint references public.sup_fornecedores(id) on delete set null,
  setor text,                            -- destino do consumo (posto, centro cirúrgico...)
  usuario text,
  created_at timestamptz default now()
);
create index if not exists sup_mov_item_idx on public.sup_movimentos (item_id, created_at desc);
create index if not exists sup_mov_forn_idx on public.sup_movimentos (fornecedor_id);
alter table public.sup_movimentos enable row level security;
drop policy if exists sup_mov_select on public.sup_movimentos;
drop policy if exists sup_mov_insert on public.sup_movimentos;
create policy sup_mov_select on public.sup_movimentos for select to authenticated using (true);
create policy sup_mov_insert on public.sup_movimentos for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: kardex imutável

-- Trigger: aplica o movimento no saldo do lote (cria o lote se necessário)
create or replace function public.sup_aplica_movimento()
returns trigger language plpgsql security definer as $$
declare
  v_lote_id bigint;
  v_lote text := coalesce(new.lote, '');
  v_saldo numeric;
begin
  select id, quantidade into v_lote_id, v_saldo from public.sup_lotes
    where item_id = new.item_id and lote = v_lote;
  if v_lote_id is null then
    insert into public.sup_lotes (item_id, lote, validade, quantidade)
      values (new.item_id, v_lote, new.validade, 0)
      returning id, quantidade into v_lote_id, v_saldo;
  end if;
  if new.tipo = 'saida' and v_saldo < new.quantidade then
    raise exception 'Estoque insuficiente no lote (disponível: %).', v_saldo;
  end if;
  if new.validade is not null then
    update public.sup_lotes set validade = new.validade where id = v_lote_id;
  end if;
  update public.sup_lotes
    set quantidade = quantidade + (case when new.tipo = 'entrada' then new.quantidade else -new.quantidade end),
        updated_at = now()
    where id = v_lote_id;
  new.lote_id := v_lote_id;
  new.lote := v_lote;
  return new;
end $$;
drop trigger if exists sup_movimento_trg on public.sup_movimentos;
create trigger sup_movimento_trg before insert on public.sup_movimentos
  for each row execute function public.sup_aplica_movimento();

-- Verificação rápida (deve listar as 4 tabelas)
select table_name from information_schema.tables
 where table_schema = 'public' and table_name like 'sup_%' order by 1;


-- ┌────────────────────────────────────────────────────────────
-- │ 15/75 — migracao-suprimentos-faseB.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS — Fase B: requisições de materiais pelos setores
-- Fluxo: setor pede → almoxarifado recebe (bipe) → separa (baixa FEFO
-- automática no estoque) → pronto → setor confirma a entrega.
-- Idempotente. Rodar no SQL Editor do Supabase do HNSN.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.sup_requisicoes (
  id bigserial primary key,
  setor text not null,
  itens jsonb not null default '[]',
  -- [{item_id, nome, unidade, qtd, qtd_atendida}]
  status text not null default 'aguardando',
  -- aguardando | separacao | pronto | entregue | cancelado
  observacao text,
  solicitado_por text,
  recebido_em timestamptz, recebido_por text,
  pronto_em timestamptz,   pronto_por text,
  entregue_em timestamptz, entregue_por text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists sup_req_status_idx
  on public.sup_requisicoes (status, created_at desc);
alter table public.sup_requisicoes enable row level security;
drop policy if exists sup_req_select on public.sup_requisicoes;
drop policy if exists sup_req_insert on public.sup_requisicoes;
drop policy if exists sup_req_update on public.sup_requisicoes;
drop policy if exists sup_req_delete on public.sup_requisicoes;
create policy sup_req_select on public.sup_requisicoes
  for select to authenticated
  using (true);
create policy sup_req_insert on public.sup_requisicoes
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_req_update on public.sup_requisicoes
  for update to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_req_delete on public.sup_requisicoes
  for delete to authenticated
  using (public.my_role() = 'adm_master');

-- Verificação
select table_name from information_schema.tables
 where table_schema = 'public'
   and table_name = 'sup_requisicoes';


-- ┌────────────────────────────────────────────────────────────
-- │ 16/75 — migracao-suprimentos-seed.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS — Seed do catálogo (~120 materiais comuns de hospital)
-- Só catálogo (sem estoque). Insere apenas os que ainda NÃO existem
-- (comparação pelo nome) — seguro rodar de novo. Revisar com a equipe.
-- ═══════════════════════════════════════════════════════════
insert into public.sup_itens (nome, categoria, unidade)
select v.nome, v.categoria, v.unidade from (values
  -- Material médico-hospitalar
  ('Luva de procedimento P — caixa 100',            'Material médico-hospitalar', 'caixa'),
  ('Luva de procedimento M — caixa 100',            'Material médico-hospitalar', 'caixa'),
  ('Luva de procedimento G — caixa 100',            'Material médico-hospitalar', 'caixa'),
  ('Luva cirúrgica estéril 7,0 — par',              'Material médico-hospitalar', 'par'),
  ('Luva cirúrgica estéril 7,5 — par',              'Material médico-hospitalar', 'par'),
  ('Luva cirúrgica estéril 8,0 — par',              'Material médico-hospitalar', 'par'),
  ('Seringa 1 mL (insulina)',                       'Material médico-hospitalar', 'unidade'),
  ('Seringa 3 mL',                                  'Material médico-hospitalar', 'unidade'),
  ('Seringa 5 mL',                                  'Material médico-hospitalar', 'unidade'),
  ('Seringa 10 mL',                                 'Material médico-hospitalar', 'unidade'),
  ('Seringa 20 mL',                                 'Material médico-hospitalar', 'unidade'),
  ('Agulha 25x7',                                   'Material médico-hospitalar', 'unidade'),
  ('Agulha 25x8',                                   'Material médico-hospitalar', 'unidade'),
  ('Agulha 40x12',                                  'Material médico-hospitalar', 'unidade'),
  ('Scalp nº 21',                                   'Material médico-hospitalar', 'unidade'),
  ('Scalp nº 23',                                   'Material médico-hospitalar', 'unidade'),
  ('Cateter intravenoso nº 18',                     'Material médico-hospitalar', 'unidade'),
  ('Cateter intravenoso nº 20',                     'Material médico-hospitalar', 'unidade'),
  ('Cateter intravenoso nº 22',                     'Material médico-hospitalar', 'unidade'),
  ('Cateter intravenoso nº 24',                     'Material médico-hospitalar', 'unidade'),
  ('Equipo macrogotas',                             'Material médico-hospitalar', 'unidade'),
  ('Equipo microgotas',                             'Material médico-hospitalar', 'unidade'),
  ('Equipo para bomba de infusão',                  'Material médico-hospitalar', 'unidade'),
  ('Torneirinha 3 vias',                            'Material médico-hospitalar', 'unidade'),
  ('Extensor / polifix 2 vias',                     'Material médico-hospitalar', 'unidade'),
  ('Sonda Foley nº 14',                             'Material médico-hospitalar', 'unidade'),
  ('Sonda Foley nº 16',                             'Material médico-hospitalar', 'unidade'),
  ('Sonda Foley nº 18',                             'Material médico-hospitalar', 'unidade'),
  ('Sonda uretral nº 10',                           'Material médico-hospitalar', 'unidade'),
  ('Sonda uretral nº 12',                           'Material médico-hospitalar', 'unidade'),
  ('Sonda nasogástrica nº 14',                      'Material médico-hospitalar', 'unidade'),
  ('Sonda nasogástrica nº 16',                      'Material médico-hospitalar', 'unidade'),
  ('Coletor de urina sistema fechado',              'Material médico-hospitalar', 'unidade'),
  ('Coletor de urina sistema aberto',               'Material médico-hospitalar', 'unidade'),
  ('Atadura de crepom 10 cm',                       'Material médico-hospitalar', 'unidade'),
  ('Atadura de crepom 15 cm',                       'Material médico-hospitalar', 'unidade'),
  ('Atadura de crepom 20 cm',                       'Material médico-hospitalar', 'unidade'),
  ('Compressa de gaze estéril 7,5x7,5 — pacote',    'Material médico-hospitalar', 'pacote'),
  ('Gaze não estéril — pacote 500',                 'Material médico-hospitalar', 'pacote'),
  ('Compressa cirúrgica 25x28',                     'Material médico-hospitalar', 'unidade'),
  ('Algodão hidrófilo 500 g — rolo',                'Material médico-hospitalar', 'rolo'),
  ('Esparadrapo 10 cm x 4,5 m',                     'Material médico-hospitalar', 'rolo'),
  ('Fita microporosa 2,5 cm',                       'Material médico-hospitalar', 'rolo'),
  ('Fita microporosa 5 cm',                         'Material médico-hospitalar', 'rolo'),
  ('Curativo transparente estéril',                 'Material médico-hospitalar', 'unidade'),
  ('Lâmina de bisturi nº 11',                       'Material médico-hospitalar', 'unidade'),
  ('Lâmina de bisturi nº 15',                       'Material médico-hospitalar', 'unidade'),
  ('Lâmina de bisturi nº 23',                       'Material médico-hospitalar', 'unidade'),
  ('Fio de sutura nylon 2-0',                       'Material médico-hospitalar', 'unidade'),
  ('Fio de sutura nylon 3-0',                       'Material médico-hospitalar', 'unidade'),
  ('Fio de sutura nylon 4-0',                       'Material médico-hospitalar', 'unidade'),
  ('Eletrodo para ECG — pacote 50',                 'Material médico-hospitalar', 'pacote'),
  ('Gel condutor 100 g',                            'Material médico-hospitalar', 'frasco'),
  ('Abaixador de língua — pacote 100',              'Material médico-hospitalar', 'pacote'),
  ('Máscara de nebulização adulto',                 'Material médico-hospitalar', 'unidade'),
  ('Máscara de nebulização infantil',               'Material médico-hospitalar', 'unidade'),
  ('Cateter nasal de O2 (óculos)',                  'Material médico-hospitalar', 'unidade'),
  ('Umidificador de O2 com frasco',                 'Material médico-hospitalar', 'unidade'),
  ('Swab de álcool 70% — caixa 100',                'Material médico-hospitalar', 'caixa'),
  ('Termômetro clínico digital',                    'Material médico-hospitalar', 'unidade'),
  -- EPI
  ('Máscara cirúrgica tripla — caixa 50',           'EPI', 'caixa'),
  ('Máscara N95 / PFF2',                            'EPI', 'unidade'),
  ('Avental descartável manga longa',               'EPI', 'unidade'),
  ('Avental impermeável',                           'EPI', 'unidade'),
  ('Touca descartável — pacote 100',                'EPI', 'pacote'),
  ('Propé descartável — par',                       'EPI', 'par'),
  ('Óculos de proteção',                            'EPI', 'unidade'),
  ('Protetor facial (face shield)',                 'EPI', 'unidade'),
  ('Luva nitrílica — caixa 100',                    'EPI', 'caixa'),
  -- Higiene e limpeza
  ('Álcool 70% — 1 L',                              'Higiene e limpeza', 'frasco'),
  ('Álcool gel 70% — 500 mL',                       'Higiene e limpeza', 'frasco'),
  ('Sabonete líquido — galão 5 L',                  'Higiene e limpeza', 'galão'),
  ('Clorexidina degermante 2% — 1 L',               'Higiene e limpeza', 'frasco'),
  ('Clorexidina alcoólica 0,5% — 1 L',              'Higiene e limpeza', 'frasco'),
  ('Hipoclorito de sódio 1% — 1 L',                 'Higiene e limpeza', 'frasco'),
  ('Desinfetante hospitalar — galão 5 L',           'Higiene e limpeza', 'galão'),
  ('Saco de lixo comum 100 L — pacote 100',         'Higiene e limpeza', 'pacote'),
  ('Saco de lixo infectante branco 100 L — pct',    'Higiene e limpeza', 'pacote'),
  ('Papel toalha interfolha — pacote 1000',         'Higiene e limpeza', 'pacote'),
  ('Papel higiênico rolão — fardo 8',               'Higiene e limpeza', 'pacote'),
  ('Pano multiuso — pacote',                        'Higiene e limpeza', 'pacote'),
  -- Escritório e expediente
  ('Papel A4 — resma 500',                          'Escritório e expediente', 'resma'),
  ('Caneta esferográfica azul',                     'Escritório e expediente', 'unidade'),
  ('Caneta esferográfica preta',                    'Escritório e expediente', 'unidade'),
  ('Caneta esferográfica vermelha',                 'Escritório e expediente', 'unidade'),
  ('Grampo 26/6 — caixa 5000',                      'Escritório e expediente', 'caixa'),
  ('Clips 2/0 — caixa 100',                         'Escritório e expediente', 'caixa'),
  ('Pasta AZ',                                      'Escritório e expediente', 'unidade'),
  ('Envelope A4',                                   'Escritório e expediente', 'unidade'),
  ('Etiqueta adesiva — rolo',                       'Escritório e expediente', 'rolo'),
  ('Pilha AA — par',                                'Escritório e expediente', 'par'),
  ('Pilha AAA — par',                               'Escritório e expediente', 'par'),
  -- Impressos e formulários
  ('Capa de prontuário',                            'Impressos e formulários', 'unidade'),
  ('Folha de evolução clínica — bloco',             'Impressos e formulários', 'pacote'),
  ('Folha de prescrição médica — bloco',            'Impressos e formulários', 'pacote'),
  ('Ficha de atendimento PS — bloco',               'Impressos e formulários', 'pacote'),
  ('Pulseira de identificação do paciente',         'Impressos e formulários', 'unidade'),
  ('Receituário comum — bloco',                     'Impressos e formulários', 'pacote'),
  -- Rouparia e enxoval
  ('Lençol solteiro',                               'Rouparia e enxoval', 'unidade'),
  ('Fronha',                                        'Rouparia e enxoval', 'unidade'),
  ('Cobertor',                                      'Rouparia e enxoval', 'unidade'),
  ('Toalha de banho',                               'Rouparia e enxoval', 'unidade'),
  ('Camisola de paciente',                          'Rouparia e enxoval', 'unidade'),
  ('Campo cirúrgico simples',                       'Rouparia e enxoval', 'unidade'),
  -- Nutrição e copa
  ('Copo descartável 200 mL — pacote 100',          'Nutrição e copa', 'pacote'),
  ('Copo descartável 50 mL — pacote 100',           'Nutrição e copa', 'pacote'),
  ('Colher descartável — pacote 100',               'Nutrição e copa', 'pacote'),
  ('Guardanapo — pacote',                           'Nutrição e copa', 'pacote'),
  ('Filtro de café nº 103 — caixa 30',              'Nutrição e copa', 'caixa'),
  -- Manutenção predial
  ('Lâmpada LED tubular',                           'Manutenção predial', 'unidade'),
  ('Fita isolante — rolo',                          'Manutenção predial', 'rolo'),
  ('Tomada / plugue',                               'Manutenção predial', 'unidade'),
  ('Bateria 9 V',                                   'Manutenção predial', 'unidade'),
  ('Cadeado',                                       'Manutenção predial', 'unidade'),
  -- Informática
  ('Toner de impressora (modelo padrão)',           'Informática', 'unidade'),
  ('Mouse USB',                                     'Informática', 'unidade'),
  ('Teclado USB',                                   'Informática', 'unidade'),
  ('Cabo de rede montado 2 m',                      'Informática', 'unidade'),
  -- Laboratório
  ('Tubo de coleta EDTA (tampa roxa)',              'Laboratório', 'unidade'),
  ('Tubo de coleta soro (tampa amarela)',           'Laboratório', 'unidade'),
  ('Agulha para coleta a vácuo',                    'Laboratório', 'unidade'),
  ('Lanceta descartável',                           'Laboratório', 'unidade'),
  ('Frasco de urina estéril',                       'Laboratório', 'unidade')
) as v(nome, categoria, unidade)
where not exists (
  select 1 from public.sup_itens s
   where lower(s.nome) = lower(v.nome)
);

-- Verificação: total por categoria
select categoria, count(*) as itens
  from public.sup_itens
 group by categoria
 order by categoria;


-- ┌────────────────────────────────────────────────────────────
-- │ 17/75 — migracao-suprimentos-faseC.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS — Fase C: pedidos de compra
-- Pedido por fornecedor com itens de MATERIAL (almoxarifado) e/ou
-- MEDICAMENTO (farmácia). Recebimento gera entrada automática no
-- estoque correspondente. Idempotente. Rodar no SQL Editor do HNSN.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.sup_pedidos (
  id bigserial primary key,
  fornecedor_id bigint
    references public.sup_fornecedores(id) on delete set null,
  fornecedor_nome text,
  itens jsonb not null default '[]',
  -- [{tipo:'material'|'medicamento', item_id, nome, unidade,
  --   qtd, custo_unit, qtd_recebida}]
  status text not null default 'aberto',
  -- aberto | enviado | parcial | recebido | cancelado
  previsao_entrega date,
  observacao text,
  enviado_em timestamptz,  enviado_por text,
  recebido_em timestamptz, recebido_por text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists sup_ped_status_idx
  on public.sup_pedidos (status, created_at desc);
create index if not exists sup_ped_forn_idx
  on public.sup_pedidos (fornecedor_id);
alter table public.sup_pedidos enable row level security;
drop policy if exists sup_ped_select on public.sup_pedidos;
drop policy if exists sup_ped_insert on public.sup_pedidos;
drop policy if exists sup_ped_update on public.sup_pedidos;
drop policy if exists sup_ped_delete on public.sup_pedidos;
create policy sup_ped_select on public.sup_pedidos
  for select to authenticated
  using (true);
create policy sup_ped_insert on public.sup_pedidos
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_ped_update on public.sup_pedidos
  for update to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_ped_delete on public.sup_pedidos
  for delete to authenticated
  using (public.my_role() = 'adm_master');

-- Verificação
select 'sup_pedidos ok' as resultado
 where exists (select 1 from information_schema.tables
                where table_schema = 'public'
                  and table_name = 'sup_pedidos');


-- ┌────────────────────────────────────────────────────────────
-- │ 18/75 — migracao-suprimentos-inventario.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS — Inventário cíclico + custo por entrada + código de barras
-- 1) sup_inventarios: contagens cegas (append-only) p/ acuracidade
-- 2) custo_unit nos movimentos (sup e farm) p/ custo médio ponderado
-- 3) codigo_barras no catálogo de materiais
-- Idempotente. Rodar no SQL Editor do Supabase do HNSN.
-- ═══════════════════════════════════════════════════════════

-- 1) Contagens de inventário (append-only)
create table if not exists public.sup_inventarios (
  id bigserial primary key,
  item_id bigint not null
    references public.sup_itens(id) on delete cascade,
  saldo_sistema numeric not null,
  contado numeric not null,
  diferenca numeric not null,          -- contado − sistema
  ajustado boolean default false,      -- ajuste lançado no kardex?
  observacao text,
  usuario text,
  created_at timestamptz default now()
);
create index if not exists sup_inv_item_idx
  on public.sup_inventarios (item_id, created_at desc);
alter table public.sup_inventarios enable row level security;
drop policy if exists sup_inv_select on public.sup_inventarios;
drop policy if exists sup_inv_insert on public.sup_inventarios;
create policy sup_inv_select on public.sup_inventarios
  for select to authenticated
  using (true);
create policy sup_inv_insert on public.sup_inventarios
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: histórico de contagens imutável

-- 2) Custo unitário no movimento (compras reais → custo médio ponderado)
alter table public.sup_movimentos
  add column if not exists custo_unit numeric;
alter table public.farm_movimentos
  add column if not exists custo_unit numeric;

-- 3) Código de barras no catálogo
alter table public.sup_itens
  add column if not exists codigo_barras text;
create index if not exists sup_itens_barras_idx
  on public.sup_itens (codigo_barras);

-- Verificação
select 'inventario ok' as resultado
 where exists (select 1 from information_schema.tables
                where table_schema = 'public'
                  and table_name = 'sup_inventarios')
   and exists (select 1 from information_schema.columns
                where table_name = 'sup_movimentos'
                  and column_name = 'custo_unit')
   and exists (select 1 from information_schema.columns
                where table_name = 'sup_itens'
                  and column_name = 'codigo_barras');


-- ┌────────────────────────────────────────────────────────────
-- │ 19/75 — migracao-suprimentos-ponto-de-pedido.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS — Ponto de pedido: prazo de entrega por fornecedor
-- 1 coluna nova. Idempotente. Rodar no SQL Editor do HNSN.
-- ═══════════════════════════════════════════════════════════
alter table public.sup_fornecedores
  add column if not exists lead_time_dias int;

-- Verificação
select 'lead_time ok' as resultado
 where exists (select 1 from information_schema.columns
                where table_name = 'sup_fornecedores'
                  and column_name = 'lead_time_dias');


-- ┌────────────────────────────────────────────────────────────
-- │ 20/75 — migracao-suprimentos-cotacao.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS — Cotação de compra (comparar preços entre fornecedores)
-- 1 tabela. Idempotente. Rodar no SQL Editor do HNSN.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.sup_cotacoes (
  id bigserial primary key,
  descricao text,
  itens jsonb not null default '[]',
  -- [{tipo:'material'|'medicamento', item_id, nome, unidade, qtd,
  --   precos: { <fornecedor_id>: preco_unit }}]
  fornecedores jsonb not null default '[]',   -- ids dos fornecedores cotados
  status text not null default 'aberta',      -- aberta | fechada | cancelada
  observacao text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists sup_cot_status_idx
  on public.sup_cotacoes (status, created_at desc);
alter table public.sup_cotacoes enable row level security;
drop policy if exists sup_cot_select on public.sup_cotacoes;
drop policy if exists sup_cot_insert on public.sup_cotacoes;
drop policy if exists sup_cot_update on public.sup_cotacoes;
drop policy if exists sup_cot_delete on public.sup_cotacoes;
create policy sup_cot_select on public.sup_cotacoes
  for select to authenticated
  using (true);
create policy sup_cot_insert on public.sup_cotacoes
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_cot_update on public.sup_cotacoes
  for update to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_cot_delete on public.sup_cotacoes
  for delete to authenticated
  using (public.my_role() = 'adm_master');

-- Verificação
select 'sup_cotacoes ok' as resultado
 where exists (select 1 from information_schema.tables
                where table_schema = 'public'
                  and table_name = 'sup_cotacoes');


-- ┌────────────────────────────────────────────────────────────
-- │ 21/75 — migracao-ps-salas.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- PRONTO-SOCORRO — Mapa de salas (Emergência / Observação / Sala Vermelha)
-- 1 tabela nova. Idempotente. Rodar no SQL Editor do HNSN.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.ps_salas (
  id bigserial primary key,
  identificacao text not null unique,   -- "01", "02", "Sala 03"...
  area text not null default 'Emergência',  -- Emergência | Observação | Sala Vermelha | ...
  status text not null default 'disponivel', -- disponivel | ocupado | limpeza | manutencao
  atendimento_id bigint                     -- paciente do PS ocupando a sala
    references public.ps_atendimentos(id) on delete set null,
  ocupado_em timestamptz,
  observacao text,
  ordem int default 0,
  ativo boolean default true,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists ps_salas_area_idx on public.ps_salas (area, ordem);
create index if not exists ps_salas_atend_idx on public.ps_salas (atendimento_id);
alter table public.ps_salas enable row level security;
drop policy if exists ps_salas_select on public.ps_salas;
drop policy if exists ps_salas_insert on public.ps_salas;
drop policy if exists ps_salas_update on public.ps_salas;
drop policy if exists ps_salas_delete on public.ps_salas;
create policy ps_salas_select on public.ps_salas
  for select to authenticated
  using (true);
create policy ps_salas_insert on public.ps_salas
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy ps_salas_update on public.ps_salas
  for update to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy ps_salas_delete on public.ps_salas
  for delete to authenticated
  using (public.my_role() = 'adm_master');

-- Verificação
select 'ps_salas ok' as resultado
 where exists (select 1 from information_schema.tables
                where table_schema = 'public' and table_name = 'ps_salas');


-- ┌────────────────────────────────────────────────────────────
-- │ 22/75 — migracao-ps-salas-censo.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- PRONTO-SOCORRO — estrutura real das vagas + regra de censo
--
-- REGRA: retaguarda provisória de alta rotatividade NÃO entra nos 75 leitos
-- do hospital — conta só no panorama do PS.
--   NÃO contam: Observação, Procedimento, PCR e Isolamento infantil.
--   Contam:     Sala Vermelha, Sala Laranja, Sala AVC, Isolamento adulto,
--               Pediatria (leitos comuns).
-- Idempotente. Rodar no SQL Editor do HNSN.
-- ═══════════════════════════════════════════════════════════

-- 1) Coluna de censo
alter table public.ps_salas
  add column if not exists conta_censo boolean default true;

-- 2) Biblioteca de protocolos do PS (para "Abrir / cadastrar protocolo")
create table if not exists public.ps_protocolos (
  id bigserial primary key,
  titulo text not null,
  categoria text,                 -- ex.: PCR, AVC, Sepse, Dor torácica...
  resumo text,
  conteudo text,                  -- passos do protocolo
  referencia text,                -- literatura / fonte
  ativo boolean default true,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists ps_protoc_cat_idx on public.ps_protocolos (categoria, titulo);
alter table public.ps_protocolos enable row level security;
drop policy if exists ps_protoc_select on public.ps_protocolos;
drop policy if exists ps_protoc_insert on public.ps_protocolos;
drop policy if exists ps_protoc_update on public.ps_protocolos;
drop policy if exists ps_protoc_delete on public.ps_protocolos;
create policy ps_protoc_select on public.ps_protocolos
  for select to authenticated using (true);
create policy ps_protoc_insert on public.ps_protocolos
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy ps_protoc_update on public.ps_protocolos
  for update to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy ps_protoc_delete on public.ps_protocolos
  for delete to authenticated using (public.my_role() = 'adm_master');

-- 3) Vagas reais do PS (só insere as que ainda não existem)
insert into public.ps_salas (identificacao, area, ordem, conta_censo, status, ativo)
select v.ident, v.area, v.ord, v.censo, 'disponivel', true from (values
  -- Sala Vermelha — 3 leitos (contam no censo)
  ('VM-01','Sala Vermelha',1,true), ('VM-02','Sala Vermelha',2,true), ('VM-03','Sala Vermelha',3,true),
  -- Sala Laranja — 3 leitos (contam)
  ('LR-01','Sala Laranja',1,true), ('LR-02','Sala Laranja',2,true), ('LR-03','Sala Laranja',3,true),
  -- Sala AVC — 5 leitos (contam)
  ('AVC-01','Sala AVC',1,true), ('AVC-02','Sala AVC',2,true), ('AVC-03','Sala AVC',3,true),
  ('AVC-04','Sala AVC',4,true), ('AVC-05','Sala AVC',5,true),
  -- Isolamento adulto — 2 leitos (contam)
  ('AQUARIO','Isolamento',1,true), ('GUARIDA','Isolamento',2,true),
  -- Pediatria — 2 leitos comuns (contam) + 1 isolamento infantil (NÃO conta)
  ('PED-01','Pediatria',1,true), ('PED-02','Pediatria',2,true), ('PED-ISO','Pediatria',3,false),
  -- Retaguarda provisória — NÃO contam no censo dos 75
  ('OBS-01','Observação',1,false), ('OBS-02','Observação',2,false), ('OBS-03','Observação',3,false),
  ('PROC-01','Procedimento',1,false), ('PROC-02','Procedimento',2,false), ('PROC-03','Procedimento',3,false),
  ('PCR-01','PCR',1,false), ('PCR-02','PCR',2,false)
) as v(ident, area, ord, censo)
where not exists (select 1 from public.ps_salas s where s.identificacao = v.ident);

-- Verificação: vagas por área e quantas contam no censo
select area,
       count(*) as vagas,
       count(*) filter (where conta_censo) as no_censo_75,
       count(*) filter (where not conta_censo) as so_no_ps
  from public.ps_salas
 group by area
 order by area;


-- ┌────────────────────────────────────────────────────────────
-- │ 23/75 — migracao-ps-origem-elo.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- PRONTO-SOCORRO — origem da chegada + elo forte PS → leito
--
-- 1) Origem/procedência do paciente (SAMU, GERINT, meios próprios…)
-- 2) Vínculo por ID entre o atendimento do PS, a fila de leito e o leito.
--    Hoje o elo é pelo NÚMERO DO PRONTUÁRIO como texto: se vier vazio ou
--    digitado diferente, o rastro do paciente quebra entre o PS e a internação.
-- Idempotente. Rodar no SQL Editor do HNSN.
-- ═══════════════════════════════════════════════════════════

-- 1) Origem da chegada
alter table public.ps_atendimentos
  add column if not exists origem text,          -- SAMU | Transalva | Polícia Militar | Bombeiros | Meios próprios | GERINT | Outro
  add column if not exists origem_detalhe text;  -- unidade de origem no GERINT (PA Torres, Arroio do Sal, Três Cachoeiras…)
create index if not exists ps_atend_origem_idx on public.ps_atendimentos (origem);

-- 2) Elo forte: fila de leito e leito apontam para o atendimento do PS
alter table public.solicitacoes
  add column if not exists ps_atendimento_id bigint
    references public.ps_atendimentos(id) on delete set null;
create index if not exists solic_ps_atend_idx on public.solicitacoes (ps_atendimento_id);

alter table public.leitos
  add column if not exists ps_atendimento_id bigint
    references public.ps_atendimentos(id) on delete set null;
create index if not exists leitos_ps_atend_idx on public.leitos (ps_atendimento_id);

-- Verificação
select 'origem+elo ok' as resultado
 where exists (select 1 from information_schema.columns
                where table_name = 'ps_atendimentos' and column_name = 'origem')
   and exists (select 1 from information_schema.columns
                where table_name = 'solicitacoes' and column_name = 'ps_atendimento_id')
   and exists (select 1 from information_schema.columns
                where table_name = 'leitos' and column_name = 'ps_atendimento_id');


-- ┌────────────────────────────────────────────────────────────
-- │ 24/75 — migracao-ps-checagem-medicacao.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- PRONTO-SOCORRO — checagem de medicação administrada
--
-- Hoje a cadeia do medicamento termina em "a farmácia dispensou"
-- (farm_movimentos, baixa de estoque). Isso prova que o remédio SAIU DA
-- FARMÁCIA, não que ele ENTROU NO PACIENTE. Falta o registro de quem
-- administrou, a que horas, e o motivo quando a dose não foi dada.
--
-- Registro clínico APPEND-ONLY: sem update, sem delete (igual a
-- ps_registros/ps_sinais/ps_prescricao_itens).
-- Idempotente. Rodar no SQL Editor do HNSN.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.ps_administracoes (
  id bigserial primary key,
  -- cascade: apagar o episódio (ação de adm_master, uso de limpeza de teste)
  -- leva junto a checagem; linha órfã apontando para episódio inexistente
  -- seria pior — não é editável nem auditável.
  atendimento_id bigint not null references public.ps_atendimentos(id) on delete cascade,
  prescricao_item_id bigint references public.ps_prescricao_itens(id) on delete set null,
  medicamento_id bigint,
  medicamento_nome text not null,
  dose text,
  via text,
  status text not null default 'administrado',  -- administrado | nao_administrado
  motivo text,                                  -- preenchido quando nao_administrado
  observacao text,
  categoria text,                               -- enfermagem | tecnico | medica | outro
  administrado_em timestamptz not null default now(),
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists ps_adm_atend_idx on public.ps_administracoes (atendimento_id, administrado_em desc);
create index if not exists ps_adm_item_idx  on public.ps_administracoes (prescricao_item_id);

alter table public.ps_administracoes enable row level security;
drop policy if exists ps_adm_select on public.ps_administracoes;
drop policy if exists ps_adm_insert on public.ps_administracoes;
create policy ps_adm_select on public.ps_administracoes for select to authenticated using (true);
create policy ps_adm_insert on public.ps_administracoes for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável

-- Verificação
select 'checagem de medicação ok' as resultado
 where exists (select 1 from information_schema.tables
                where table_schema = 'public' and table_name = 'ps_administracoes')
   and exists (select 1 from information_schema.columns
                where table_name = 'ps_administracoes' and column_name = 'administrado_em');


-- ┌────────────────────────────────────────────────────────────
-- │ 25/75 — migracao-pep-fase1.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- PRONTUÁRIO ELETRÔNICO DO PACIENTE (PEP) — Fase 1
--
-- O QUE MUDA
-- O módulo "Paciente 360" de hoje é um RESUMO: ele lê o que os outros
-- módulos já gravaram (PS, leitos, SCIH, farmácia) e monta uma linha do
-- tempo. Registro clínico próprio ele só tem um: `pep_evolucoes`, um texto
-- livre com um `tipo`. Isso não é prontuário — não há admissão, não há
-- prescrição de internado, não há aprazamento, não há checagem, e a
-- alergia do paciente está presa ao episódio do PS.
--
-- Esta migração cria a espinha do PEP: episódio de cuidado, anamnese/exame
-- físico, prescrição (médica e de enfermagem) com aprazamento e checagem,
-- anotações de enfermagem, sinais vitais seriados e as listas persistentes
-- do paciente (alergias e problemas/condições).
--
-- O QUE **NÃO** É RECRIADO (já existe e continua valendo)
--   • `pacientes`            — cadastro mínimo LGPD (iniciais + prontuário).
--   • `pep_evolucoes`        — evolução multiprofissional. NÃO é substituída:
--                              ganha colunas (episódio, SOAP, correção, autor).
--   • `ps_atendimentos`,
--     `ps_sinais`,
--     `ps_registros`,
--     `ps_prescricao_itens`,
--     `ps_administracoes`    — o episódio do Pronto-Socorro continua inteiro
--                              no módulo dele. O PEP se pendura nele por
--                              `pep_episodios.ps_atendimento_id`, não o
--                              reescreve. Migrar o PS para as tabelas novas
--                              é decisão de outra fase.
--   • `leitos`, `leitos_saidas`, `leitos_turnover` — gestão de leito é
--                              estado do LEITO, não do paciente. O PEP não
--                              duplica isso; `pep_episodios` guarda apenas
--                              o leito/setor como texto de contexto.
--   • `farm_medicamentos` e o kardex — catálogo e estoque não são PEP.
--
-- ── REGRA 1: REGISTRO CLÍNICO É APPEND-ONLY ────────────────
-- Nenhuma tabela clínica desta migração tem política de UPDATE ou DELETE.
-- Sem política, o PostgREST recusa a operação para qualquer papel, inclusive
-- `adm_master` — é o mesmo mecanismo já usado em `ps_registros`,
-- `ps_administracoes` e no kardex da farmácia.
-- Corrigir = INSERIR um registro novo com `corrige_id` apontando para o
-- errado e `motivo_correcao` preenchido. O registro errado permanece: é o
-- que dá valor probatório ao prontuário.
-- Consequência prática para o front-end: a "versão atual" de um registro é
-- aquela que ninguém corrigiu, ou seja
--     ... where not exists (select 1 from <tabela> c where c.corrige_id = t.id)
--
-- A única exceção é `pep_episodios` — que é o CONTINENTE, não o conteúdo
-- clínico. Ele precisa ser fechado (alta/desfecho), exatamente como
-- `ps_atendimentos` já é. Tem UPDATE restrito e NÃO tem DELETE.
--
-- ── REGRA 2: `criado_em` E NÃO `created_at` ────────────────
-- O banco está dividido: 23 tabelas usam `created_at` e 3 usam `criado_em`.
-- A divisão não é aleatória — as 3 em português (`pep_evolucoes`,
-- `ps_registros`, `ps_administracoes`) são exatamente as tabelas de
-- REGISTRO CLÍNICO APPEND-ONLY. Aqui `criado_em` é adotado para todas as
-- tabelas novas, por três motivos:
--   1. `pep_evolucoes` já usa `criado_em`. Uma irmã com `created_at` faria
--      o mesmo módulo ordenar por dois nomes diferentes — erro que já
--      mordeu o time (ver comentário no App.jsx, carga do Paciente 360).
--   2. Vira uma regra que dá para lembrar: **tabela `pep_*` → `criado_em`**.
--   3. Reforça a leitura semântica: `criado_em` = carimbo imutável do fato
--      clínico; `created_at`/`updated_at` = tabela operacional editável.
-- `pep_episodios`, por ser operacional, tem também `atualizado_em`.
--
-- ── REGRA 3: MIGRAÇÃO ADITIVA ──────────────────────────────
-- Só `create table if not exists` / `add column if not exists` / índices.
-- Nenhum drop de tabela ou coluna. Idempotente: pode rodar de novo.
--
-- ── REGRA 4: LGPD ──────────────────────────────────────────
-- Nenhuma coluna de nome completo, CPF, endereço ou telefone do paciente.
-- A identificação continua sendo iniciais + prontuário. Os campos de NOME
-- que existem aqui (`profissional_nome`, `executor_nome`) são do
-- PROFISSIONAL, não do paciente — são exigência de rastreabilidade
-- assistencial (quem escreveu, quem administrou) e vêm acompanhados de
-- conselho + registro (CRM/COREN/CREFITO/CRN/CRESS).
--
-- ── SOBRE O `prontuario` SEM CHAVE ESTRANGEIRA ─────────────
-- `prontuario` é texto indexado, SEM foreign key para `pacientes`, igual a
-- `pep_evolucoes` e `ps_atendimentos`. É deliberado: o PS cadastra por
-- iniciais e muitos episódios reais existem antes de o paciente entrar em
-- `pacientes`. Uma FK aqui faria a enfermagem NÃO CONSEGUIR SALVAR uma
-- alergia no meio do plantão. Integridade por convenção, como no resto do
-- sistema. (Ver "Pontos em aberto" no relatório: fechar isso depois exige
-- backfill de `pacientes`.)
--
-- ── PAPÉIS ─────────────────────────────────────────────────
-- Segue EXATAMENTE o padrão vigente, via `public.my_role()`:
--   • SELECT  → todo autenticado (`using (true)`)  → analista e visualizador
--   • INSERT  → adm_master, adm_silver
--   • UPDATE  → adm_master, adm_silver  (só `pep_episodios`)
--   • DELETE  → adm_master             (nenhuma tabela desta migração)
-- Apertar o SELECT por papel é decisão CLÍNICA em aberto (CONTEXTO.md,
-- "Decisões em aberto" nº 0) e NÃO foi antecipada aqui: fazer isso sozinho
-- tiraria acesso de quem tem direito no meio do plantão.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ═══════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════
-- 1) EPISÓDIO DE CUIDADO — a espinha do prontuário
--
-- Hoje não existe nada que represente "esta internação". `leitos` é o
-- estado atual de um LEITO (é sobrescrito na próxima ocupação) e
-- `leitos_saidas` só nasce na alta. Não há um id estável para pendurar
-- evolução, prescrição e checagem durante a internação inteira.
-- `pep_episodios` é esse id.
--
-- Todo registro clínico desta migração aponta para o PACIENTE
-- (`prontuario`, obrigatório) e OPCIONALMENTE para o episódio. Episódio
-- nulo é aceito de propósito: permite adotar o PEP por partes, sem exigir
-- que alguém abra episódio antes de registrar um sinal vital.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_episodios (
  id bigserial primary key,
  prontuario text not null,
  iniciais text,                          -- redundância proposital: a lista
                                          -- de episódios não depende de join
  tipo text not null default 'internacao', -- internacao | ps | ambulatorio | observacao | day_clinic
  -- Elo com o episódio do PS, quando a internação nasceu de lá. Mesmo
  -- padrão de `solicitacoes.ps_atendimento_id` e `leitos.ps_atendimento_id`.
  ps_atendimento_id bigint references public.ps_atendimentos(id) on delete set null,
  -- Leito/setor como TEXTO, não FK: `leitos.identificacao` é reaproveitado
  -- pelo próximo paciente. Guardar a FK apontaria para a ocupação errada
  -- daqui a dois dias.
  leito text,
  setor text,
  especialidade text,
  admissao_em timestamptz not null default now(),
  alta_em timestamptz,
  desfecho text,                          -- alta | obito | transferencia | evasao | alta_a_pedido
  desfecho_detalhe text,
  cid_principal text,
  cid_secundarios text,                   -- lista separada por vírgula
  motivo_internacao text,
  status text not null default 'aberto',  -- aberto | encerrado
  observacao text,
  usuario text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists pep_epis_pront_idx on public.pep_episodios (prontuario, admissao_em desc);
create index if not exists pep_epis_status_idx on public.pep_episodios (status, admissao_em desc);
create index if not exists pep_epis_ps_idx on public.pep_episodios (ps_atendimento_id);
alter table public.pep_episodios enable row level security;
drop policy if exists pep_epis_select on public.pep_episodios;
drop policy if exists pep_epis_insert on public.pep_episodios;
drop policy if exists pep_epis_update on public.pep_episodios;
create policy pep_epis_select on public.pep_episodios
  for select to authenticated
  using (true);
create policy pep_epis_insert on public.pep_episodios
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy pep_epis_update on public.pep_episodios
  for update to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem delete: episódio encerrado é histórico assistencial, não some


-- ═══════════════════════════════════════════════════════════
-- 2) ANAMNESE + EXAME FÍSICO — a admissão
--
-- É o registro de ENTRADA, e é multiprofissional: o médico faz anamnese e
-- exame físico; a enfermagem faz o histórico de enfermagem (SAE, primeira
-- etapa); nutrição faz a triagem nutricional; serviço social faz a
-- avaliação social. Todos preenchem a mesma tabela mudando `categoria` —
-- separar em cinco tabelas quase idênticas não pagaria o custo.
--
-- Os achados por sistema vão em `sistemas` (jsonb) porque a lista varia por
-- profissão e por protocolo do hospital; virar coluna cada um deles
-- engessaria o formulário e exigiria migração a cada ajuste clínico.
-- APPEND-ONLY. Corrigir = novo registro com `corrige_id`.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_anamneses (
  id bigserial primary key,
  prontuario text not null,
  episodio_id bigint references public.pep_episodios(id) on delete set null,
  categoria text not null default 'medica',
  -- medica | enfermagem | fisioterapia | nutricao | servico_social | psicologia | farmacia
  queixa_principal text,
  historia_doenca_atual text,
  antecedentes_pessoais text,
  antecedentes_familiares text,
  medicamentos_em_uso text,               -- reconciliação medicamentosa na entrada
  habitos text,                           -- tabagismo, etilismo, atividade física
  alergias_relatadas text,                -- o que o paciente RELATOU na admissão;
                                          -- a lista oficial é `pep_alergias`
  exame_fisico text,                      -- exame geral, texto livre
  sistemas jsonb not null default '{}',   -- {"cardiovascular":"...","respiratorio":"..."}
  escalas jsonb not null default '{}',    -- {"braden":18,"morse":45,"glasgow":15}
  hipoteses_diagnosticas text,
  cid_suspeito text,
  conduta_inicial text,
  plano_terapeutico text,
  observacao text,
  -- Cadeia de correção (append-only)
  corrige_id bigint references public.pep_anamneses(id) on delete set null,
  motivo_correcao text,
  -- Autoria assistencial (rastreabilidade; NÃO é dado do paciente)
  profissional_nome text,
  conselho text,                          -- CRM | COREN | CREFITO | CRN | CRESS | CRP | CRF
  registro_conselho text,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_anam_pront_idx on public.pep_anamneses (prontuario, criado_em desc);
create index if not exists pep_anam_epis_idx on public.pep_anamneses (episodio_id, criado_em desc);
create index if not exists pep_anam_corrige_idx on public.pep_anamneses (corrige_id);
alter table public.pep_anamneses enable row level security;
drop policy if exists pep_anam_select on public.pep_anamneses;
drop policy if exists pep_anam_insert on public.pep_anamneses;
create policy pep_anam_select on public.pep_anamneses
  for select to authenticated
  using (true);
create policy pep_anam_insert on public.pep_anamneses
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável


-- ═══════════════════════════════════════════════════════════
-- 3) EVOLUÇÃO MULTIPROFISSIONAL — extensão de `pep_evolucoes`
--
-- A tabela JÁ EXISTE e já é append-only, com `tipo` cobrindo
-- evolucao_medica | enfermagem | fisioterapia | nutricao | anotacao.
-- Recriá-la quebraria a tela do Paciente 360 e jogaria fora o histórico.
-- Ela só ganha o que faltava: vínculo com o episódio, estrutura SOAP
-- opcional, cadeia de correção e autoria com conselho profissional.
--
-- `tipo` é texto livre, então os valores novos entram sem migração:
--   servico_social | psicologia | farmacia_clinica | fonoaudiologia
-- ═══════════════════════════════════════════════════════════
alter table public.pep_evolucoes
  add column if not exists episodio_id bigint references public.pep_episodios(id) on delete set null,
  add column if not exists categoria text,             -- admissao | diaria | intercorrencia | alta | parecer
  -- SOAP: opcional e ADICIONAL a `texto`, que continua sendo o campo
  -- obrigatório. Quem escreve corrido não é obrigado a estruturar.
  add column if not exists subjetivo text,
  add column if not exists objetivo text,
  add column if not exists avaliacao text,
  add column if not exists plano text,
  add column if not exists corrige_id bigint references public.pep_evolucoes(id) on delete set null,
  add column if not exists motivo_correcao text,
  add column if not exists profissional_nome text,
  add column if not exists conselho text,
  add column if not exists registro_conselho text;
create index if not exists pep_evol_epis_idx on public.pep_evolucoes (episodio_id, criado_em desc);
create index if not exists pep_evol_corrige_idx on public.pep_evolucoes (corrige_id);
create index if not exists pep_evol_tipo_idx on public.pep_evolucoes (tipo, criado_em desc);
-- RLS e políticas (pep_select / pep_insert) já existem no schema.sql e
-- continuam corretas: select para autenticado, insert restrito, sem
-- update/delete. Nada a refazer aqui.


-- ═══════════════════════════════════════════════════════════
-- 4) PRESCRIÇÃO — cabeçalho (médica E de enfermagem)
--
-- No hospital a prescrição é um DOCUMENTO DO DIA, assinado, com validade
-- de 24h, e a do dia seguinte substitui a anterior. Por isso cabeçalho
-- separado dos itens: é ele que tem vigência, assinatura e substituição.
--
-- Uma tabela só para as duas naturezas (`tipo`), porque a estrutura é
-- idêntica — muda o prescritor e o que entra nos itens. Duas tabelas
-- gêmeas dobrariam o código de aprazamento e checagem sem ganho.
--
-- APPEND-ONLY: prescrição não é editada. Trocar a prescrição = inserir uma
-- nova com `substitui_id` apontando para a anterior. Suspender/reativar =
-- evento em `pep_prescricao_eventos` (item 6).
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_prescricoes (
  id bigserial primary key,
  prontuario text not null,
  episodio_id bigint references public.pep_episodios(id) on delete set null,
  tipo text not null default 'medica',    -- medica | enfermagem
  -- Data de referência SEM `current_date`: no Supabase o banco roda em UTC
  -- e, depois das 21h no Brasil, `current_date` já é o dia seguinte. Foi
  -- exatamente esse o bug crítico do PR #1 (`todayStr()` em UTC). Aqui o
  -- default é explicitamente o dia civil de São Paulo.
  data_referencia date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  inicio_em timestamptz not null default now(),
  validade_em timestamptz,                -- normalmente inicio_em + 24h
  substitui_id bigint references public.pep_prescricoes(id) on delete set null,
  motivo_substituicao text,               -- inclui "correção de erro de digitação"
  observacao text,
  -- Assinatura do prescritor
  prescritor_nome text,
  conselho text,                          -- CRM (médica) | COREN (enfermagem)
  registro_conselho text,
  assinada_em timestamptz,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_presc_pront_idx on public.pep_prescricoes (prontuario, data_referencia desc);
create index if not exists pep_presc_epis_idx on public.pep_prescricoes (episodio_id, data_referencia desc);
create index if not exists pep_presc_subst_idx on public.pep_prescricoes (substitui_id);
alter table public.pep_prescricoes enable row level security;
drop policy if exists pep_presc_select on public.pep_prescricoes;
drop policy if exists pep_presc_insert on public.pep_prescricoes;
create policy pep_presc_select on public.pep_prescricoes
  for select to authenticated
  using (true);
create policy pep_presc_insert on public.pep_prescricoes
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável


-- ═══════════════════════════════════════════════════════════
-- 5) ITENS DA PRESCRIÇÃO
--
-- Cobre medicamento, dieta, cuidado de enfermagem, procedimento, exame e
-- terapias. Um `tipo` só, porque todos precisam da mesma coisa: aprazar e
-- checar. "Mudança de decúbito 2/2h" e "Dipirona 500 mg 6/6h" têm o mesmo
-- ciclo de vida operacional.
--
-- Campos numéricos de dose repetem a escolha já feita em
-- `ps_prescricao_itens` (dose_valor / dose_unidade / frequencia_dia) — é o
-- que o motor de alerta da farmácia clínica consome. Texto livre de dose
-- não serve para calcular dose máxima diária.
--
-- `intervalo_horas` existe para GERAR o aprazamento; `frequencia` guarda o
-- que o prescritor escreveu ("6/6h", "ACM", "após as refeições").
-- APPEND-ONLY.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_prescricao_itens (
  id bigserial primary key,
  prescricao_id bigint not null references public.pep_prescricoes(id) on delete cascade,
  prontuario text not null,               -- desnormalizado: o Paciente 360
                                          -- consulta por paciente, não por
                                          -- prescrição
  episodio_id bigint references public.pep_episodios(id) on delete set null,
  tipo text not null default 'medicamento',
  -- medicamento | dieta | cuidado_enfermagem | procedimento | exame |
  -- fisioterapia | oxigenoterapia | soro | curativo
  medicamento_id bigint references public.farm_medicamentos(id) on delete set null,
  descricao text not null,                -- o texto do item como prescrito
  apresentacao text,
  dose text,                              -- como escrito ("500 mg")
  dose_valor numeric,                     -- para o motor de alertas
  dose_unidade text,
  via text,                               -- VO | EV | IM | SC | SL | IN | RETAL | SONDA | TOP
  diluicao text,
  velocidade_infusao text,
  frequencia text,                        -- como escrito ("6/6h", "ACM")
  frequencia_dia numeric,                 -- doses por dia (cálculo de dose máxima)
  intervalo_horas numeric,                -- base do aprazamento automático
  duracao_dias numeric,
  quantidade numeric,
  unidade text,
  se_necessario boolean not null default false,  -- SOS/ACM: não gera aprazamento fixo
  condicao_sos text,                      -- "se dor", "se T > 37,8"
  ordem int default 0,
  observacao text,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_pitem_presc_idx on public.pep_prescricao_itens (prescricao_id, ordem);
create index if not exists pep_pitem_pront_idx on public.pep_prescricao_itens (prontuario, criado_em desc);
create index if not exists pep_pitem_med_idx on public.pep_prescricao_itens (medicamento_id);
alter table public.pep_prescricao_itens enable row level security;
drop policy if exists pep_pitem_select on public.pep_prescricao_itens;
drop policy if exists pep_pitem_insert on public.pep_prescricao_itens;
create policy pep_pitem_select on public.pep_prescricao_itens
  for select to authenticated
  using (true);
create policy pep_pitem_insert on public.pep_prescricao_itens
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável


-- ═══════════════════════════════════════════════════════════
-- 6) EVENTOS DA PRESCRIÇÃO — o estado sem UPDATE
--
-- Suspender um antibiótico é um ATO CLÍNICO com hora e responsável. Se
-- fosse uma coluna `status` atualizada, a informação de quando e por quem
-- se perderia — e violaria o append-only.
--
-- Mesma lógica do kardex da farmácia: o saldo não é digitado, é derivado
-- dos movimentos. Aqui o status vigente de um item é o `evento` do último
-- registro dele:
--     select distinct on (item_id) item_id, evento
--       from public.pep_prescricao_eventos
--      where item_id is not null
--      order by item_id, criado_em desc;
-- Item sem nenhum evento está vigente.
-- `item_id` nulo = evento vale para a prescrição inteira.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_prescricao_eventos (
  id bigserial primary key,
  prescricao_id bigint not null references public.pep_prescricoes(id) on delete cascade,
  item_id bigint references public.pep_prescricao_itens(id) on delete cascade,
  prontuario text not null,
  episodio_id bigint references public.pep_episodios(id) on delete set null,
  evento text not null,                   -- suspenso | reativado | encerrado |
                                          -- cancelado | concluido | avaliado_farmacia
  motivo text,
  observacao text,
  profissional_nome text,
  conselho text,
  registro_conselho text,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_pevt_item_idx on public.pep_prescricao_eventos (item_id, criado_em desc);
create index if not exists pep_pevt_presc_idx on public.pep_prescricao_eventos (prescricao_id, criado_em desc);
alter table public.pep_prescricao_eventos enable row level security;
drop policy if exists pep_pevt_select on public.pep_prescricao_eventos;
drop policy if exists pep_pevt_insert on public.pep_prescricao_eventos;
create policy pep_pevt_select on public.pep_prescricao_eventos
  for select to authenticated
  using (true);
create policy pep_pevt_insert on public.pep_prescricao_eventos
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável


-- ═══════════════════════════════════════════════════════════
-- 7) APRAZAMENTO — o horário PLANEJADO de cada dose/cuidado
--
-- Aprazar é a enfermagem transformar "6/6h" em 06:00, 12:00, 18:00, 00:00.
-- Sem essa tabela não existe "dose atrasada" nem "dose não checada": só dá
-- para saber o que foi feito, nunca o que deixou de ser.
--
-- 1 item : N aprazamentos. Um item 6/6h por 3 dias gera 12 linhas.
-- Itens `se_necessario` (SOS) normalmente NÃO geram aprazamento — a
-- administração entra sem `aprazamento_id`.
--
-- Esta tabela guarda só o PLANO. O que aconteceu está em
-- `pep_administracoes` — assim o plano continua append-only e a checagem
-- não precisa de UPDATE. Dose pendente = aprazamento sem administração:
--     select a.* from public.pep_aprazamentos a
--      where not exists (select 1 from public.pep_administracoes x
--                         where x.aprazamento_id = a.id);
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_aprazamentos (
  id bigserial primary key,
  item_id bigint not null references public.pep_prescricao_itens(id) on delete cascade,
  prescricao_id bigint references public.pep_prescricoes(id) on delete cascade,
  prontuario text not null,
  episodio_id bigint references public.pep_episodios(id) on delete set null,
  previsto_para timestamptz not null,     -- timestamptz: o app manda o horário
                                          -- local já resolvido; nunca `date`
  sequencia int,                          -- 1..n dentro do item
  dose_prevista text,
  via text,
  observacao text,
  aprazado_por text,                      -- profissional que aprazou
  conselho text,
  registro_conselho text,
  usuario text,
  criado_em timestamptz not null default now()
);
-- Um item não pode ter dois aprazamentos no mesmo instante: a geração
-- automática rodando duas vezes duplicaria a fila de medicação da enfermagem.
create unique index if not exists pep_aprz_uq on public.pep_aprazamentos (item_id, previsto_para);
create index if not exists pep_aprz_pront_idx on public.pep_aprazamentos (prontuario, previsto_para);
create index if not exists pep_aprz_prev_idx on public.pep_aprazamentos (previsto_para);
create index if not exists pep_aprz_epis_idx on public.pep_aprazamentos (episodio_id, previsto_para);
alter table public.pep_aprazamentos enable row level security;
drop policy if exists pep_aprz_select on public.pep_aprazamentos;
drop policy if exists pep_aprz_insert on public.pep_aprazamentos;
create policy pep_aprz_select on public.pep_aprazamentos
  for select to authenticated
  using (true);
create policy pep_aprz_insert on public.pep_aprazamentos
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: o plano aprazado é registro clínico.
-- Reaprazar = inserir horário novo e registrar 'nao_administrado' + motivo
-- no horário antigo, em pep_administracoes.


-- ═══════════════════════════════════════════════════════════
-- 8) CHECAGEM / ADMINISTRAÇÃO — o que de fato foi feito
--
-- A dispensação da farmácia prova que o remédio SAIU DO ESTOQUE. Só esta
-- tabela prova que ele ENTROU NO PACIENTE — com hora, executor e, quando
-- não foi dado, o motivo. Vale também para cuidado de enfermagem
-- ("mudança de decúbito realizada às 14h") — por isso `descricao` e não
-- só medicamento.
--
-- POR QUE NÃO REUSAR `ps_administracoes`
-- Aquela tabela tem `atendimento_id bigint NOT NULL references
-- ps_atendimentos(id)`: um internado sem passagem pelo PS não cabe nela.
-- Relaxar o NOT NULL mexeria numa tabela em produção do módulo PS. As duas
-- convivem; convergir é decisão para uma fase futura (ver relatório).
-- APPEND-ONLY. Checagem errada se corrige com `corrige_id`.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_administracoes (
  id bigserial primary key,
  prontuario text not null,
  episodio_id bigint references public.pep_episodios(id) on delete set null,
  -- Nulo em dose SOS/ACM (sem horário planejado) e em dose extra.
  aprazamento_id bigint references public.pep_aprazamentos(id) on delete set null,
  item_id bigint references public.pep_prescricao_itens(id) on delete set null,
  prescricao_id bigint references public.pep_prescricoes(id) on delete set null,
  medicamento_id bigint references public.farm_medicamentos(id) on delete set null,
  descricao text not null,                -- item executado, congelado no ato
  dose text,
  dose_valor numeric,
  dose_unidade text,
  via text,
  status text not null default 'administrado',
  -- administrado | nao_administrado | recusado | adiado | suspenso
  motivo text,                            -- obrigatório quando não administrado
  observacao text,
  previsto_para timestamptz,              -- cópia do aprazamento: permite
                                          -- calcular atraso sem join
  administrado_em timestamptz not null default now(),
  -- Quem executou (rastreabilidade assistencial — dado do PROFISSIONAL)
  executor_nome text,
  categoria text,                         -- enfermeiro | tecnico | medico | fisio | outro
  conselho text,
  registro_conselho text,
  corrige_id bigint references public.pep_administracoes(id) on delete set null,
  motivo_correcao text,
  usuario text,
  criado_em timestamptz not null default now(),
  -- Dose não dada sem motivo é buraco em auditoria de segurança do paciente.
  constraint pep_adm_motivo_ck check (status = 'administrado' or motivo is not null)
);
create index if not exists pep_adm_pront_idx on public.pep_administracoes (prontuario, administrado_em desc);
create index if not exists pep_adm_aprz_idx on public.pep_administracoes (aprazamento_id);
create index if not exists pep_adm_item_idx on public.pep_administracoes (item_id, administrado_em desc);
create index if not exists pep_adm_epis_idx on public.pep_administracoes (episodio_id, administrado_em desc);
alter table public.pep_administracoes enable row level security;
drop policy if exists pep_adm_select on public.pep_administracoes;
drop policy if exists pep_adm_insert on public.pep_administracoes;
create policy pep_adm_select on public.pep_administracoes
  for select to authenticated
  using (true);
create policy pep_adm_insert on public.pep_administracoes
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável


-- ═══════════════════════════════════════════════════════════
-- 9) ANOTAÇÕES DE ENFERMAGEM
--
-- NÃO é a mesma coisa que evolução de enfermagem. A evolução é o raciocínio
-- do turno, uma por plantão. A anotação é o fato pontual e frequente —
-- "evacuou", "aceitou 50% da dieta", "queda da própria altura às 03:20",
-- "punção de acesso em MSD". São dezenas por dia e é nelas que mora a
-- evidência de intercorrência. Misturar as duas em `pep_evolucoes` faria a
-- evolução clínica sumir no meio do ruído.
-- APPEND-ONLY.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_anotacoes_enfermagem (
  id bigserial primary key,
  prontuario text not null,
  episodio_id bigint references public.pep_episodios(id) on delete set null,
  turno text,                             -- manha | tarde | noite
  categoria text,
  -- eliminacoes | dieta | higiene | dor | intercorrencia | acesso_venoso |
  -- curativo | mobilizacao | dispositivo | queda | contencao | orientacao | outro
  texto text not null,
  ocorrido_em timestamptz not null default now(),  -- quando o fato aconteceu
                                                   -- (pode ser antes de anotar)
  intercorrencia boolean not null default false,   -- destaca no Paciente 360
  corrige_id bigint references public.pep_anotacoes_enfermagem(id) on delete set null,
  motivo_correcao text,
  profissional_nome text,
  conselho text,                          -- COREN
  registro_conselho text,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_anot_pront_idx on public.pep_anotacoes_enfermagem (prontuario, ocorrido_em desc);
create index if not exists pep_anot_epis_idx on public.pep_anotacoes_enfermagem (episodio_id, ocorrido_em desc);
create index if not exists pep_anot_inter_idx on public.pep_anotacoes_enfermagem (intercorrencia, ocorrido_em desc);
alter table public.pep_anotacoes_enfermagem enable row level security;
drop policy if exists pep_anot_select on public.pep_anotacoes_enfermagem;
drop policy if exists pep_anot_insert on public.pep_anotacoes_enfermagem;
create policy pep_anot_select on public.pep_anotacoes_enfermagem
  for select to authenticated
  using (true);
create policy pep_anot_insert on public.pep_anotacoes_enfermagem
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável


-- ═══════════════════════════════════════════════════════════
-- 10) SINAIS VITAIS SERIADOS
--
-- `ps_sinais` já faz isso, mas amarrado a `ps_atendimentos` e carregando a
-- classificação de Manchester — é a aferição da TRIAGEM. O internado que
-- nunca passou pelo PS não tem onde registrar. Esta tabela é do PACIENTE:
-- serve a internação, ambulatório e observação.
--
-- Inclui balanço hídrico e escore de alerta precoce (NEWS2/MEWS), que é o
-- que transforma sinal vital em ação — sem escore, a deterioração só é
-- percebida quando alguém olha a folha.
-- APPEND-ONLY.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_sinais_vitais (
  id bigserial primary key,
  prontuario text not null,
  episodio_id bigint references public.pep_episodios(id) on delete set null,
  pa_sist int,
  pa_diast int,
  pam int,                                -- pressão arterial média
  fc int,
  fr int,
  spo2 int,
  suporte_o2 text,                        -- ar ambiente | cateter 2L | mascara | VNI | VM
  temp numeric(4,1),
  dor int,                                -- escala 0-10
  glicemia int,
  consciencia text,                       -- alerta | verbal | dor | irresponsivo (AVPU)
  glasgow int,
  peso numeric(5,1),                      -- entra aqui, não em `pacientes`:
  altura numeric(4,2),                    -- peso muda e serve para dose/dia
  diurese_ml numeric,
  balanco_hidrico_ml numeric,
  evacuacao text,
  escala_alerta text,                     -- news2 | mews | pews
  score_alerta int,
  observacao text,
  aferido_em timestamptz not null default now(),
  corrige_id bigint references public.pep_sinais_vitais(id) on delete set null,
  motivo_correcao text,
  profissional_nome text,
  conselho text,
  registro_conselho text,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_sv_pront_idx on public.pep_sinais_vitais (prontuario, aferido_em desc);
create index if not exists pep_sv_epis_idx on public.pep_sinais_vitais (episodio_id, aferido_em desc);
create index if not exists pep_sv_score_idx on public.pep_sinais_vitais (score_alerta);
alter table public.pep_sinais_vitais enable row level security;
drop policy if exists pep_sv_select on public.pep_sinais_vitais;
drop policy if exists pep_sv_insert on public.pep_sinais_vitais;
create policy pep_sv_select on public.pep_sinais_vitais
  for select to authenticated
  using (true);
create policy pep_sv_insert on public.pep_sinais_vitais
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável


-- ═══════════════════════════════════════════════════════════
-- 11) ALERGIAS DO PACIENTE — a correção do erro estrutural
--
-- Hoje alergia é `ps_atendimentos.alergias`, um texto livre preso ao
-- episódio do PS. Isso significa que:
--   • o mesmo paciente voltando ao PS chega SEM a alergia dele;
--   • o internado que nunca passou pelo PS não tem onde declarar alergia;
--   • o motor de alerta da farmácia clínica só enxerga alergia de quem
--     está num atendimento de PS aberto.
-- Alergia é do PACIENTE e atravessa todas as passagens dele pelo hospital.
--
-- `ps_atendimentos.alergias` NÃO é removido (migração aditiva, e o App.jsx
-- depende dele hoje). Ele passa a ser o que o paciente relatou NAQUELA
-- passagem; a lista oficial é esta.
--
-- `substancia` existe separado de `agente` porque o motor de alerta casa
-- por princípio ativo: o paciente diz "Novalgina", a prescrição diz
-- "Dipirona 500 mg". Sem o campo normalizado o alerta não dispara.
--
-- "Nega alergias" É informação clínica e precisa ser gravada — sem isso
-- não dá para distinguir "não tem alergia" de "ninguém perguntou".
-- Registrar com tipo = 'nenhuma_conhecida'.
--
-- APPEND-ONLY: refutar uma alergia (teste negativo) = novo registro com
-- `corrige_id` apontando para o anterior e `situacao` = 'refutada'.
-- Lista vigente = registros ativos que ninguém corrigiu.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_alergias (
  id bigserial primary key,
  prontuario text not null,
  agente text not null,                   -- como o paciente/prescritor chama
  substancia text,                        -- princípio ativo normalizado
  tipo text not null default 'medicamento',
  -- medicamento | alimento | material | ambiental | outro | nenhuma_conhecida
  reacao text,                            -- alergia | intolerancia | efeito_adverso
  manifestacao text,                      -- urticaria, broncoespasmo, anafilaxia...
  gravidade text,                         -- leve | moderada | grave
  criticidade text default 'alta',        -- alta | baixa — risco de vida se reexposto
  situacao text not null default 'ativa', -- ativa | refutada | resolvida | inativa
  fonte text,                             -- paciente | familiar | prontuario | teste | documento
  inicio date,
  observacao text,
  corrige_id bigint references public.pep_alergias(id) on delete set null,
  motivo_correcao text,
  profissional_nome text,
  conselho text,
  registro_conselho text,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_alrg_pront_idx on public.pep_alergias (prontuario, criado_em desc);
create index if not exists pep_alrg_subst_idx on public.pep_alergias (lower(substancia));
create index if not exists pep_alrg_corrige_idx on public.pep_alergias (corrige_id);
alter table public.pep_alergias enable row level security;
drop policy if exists pep_alrg_select on public.pep_alergias;
drop policy if exists pep_alrg_insert on public.pep_alergias;
create policy pep_alrg_select on public.pep_alergias
  for select to authenticated
  using (true);
create policy pep_alrg_insert on public.pep_alergias
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável


-- ═══════════════════════════════════════════════════════════
-- 12) CONDIÇÕES PERSISTENTES — a lista de problemas
--
-- Separada de `pep_alergias` de propósito: alergia é alerta de SEGURANÇA
-- (agente, reação, criticidade, e o motor da farmácia lê); condição é
-- CONTEXTO clínico (CID, início, situação). Numa tabela só, metade das
-- colunas ficaria sempre nula e a consulta do motor de alerta pagaria
-- filtro extra.
--
-- Cobre comorbidade, diagnóstico ativo, precaução (isolamento, risco de
-- queda, restrição de decúbito), dispositivo permanente (marca-passo,
-- traqueostomia) e limitação — tudo que precisa atravessar internações.
-- APPEND-ONLY: resolver um problema = novo registro com `corrige_id` e
-- `situacao` = 'resolvida'.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_condicoes (
  id bigserial primary key,
  prontuario text not null,
  descricao text not null,
  cid text,
  categoria text not null default 'comorbidade',
  -- comorbidade | diagnostico | precaucao | dispositivo | limitacao |
  -- risco | habito | historico_cirurgico
  situacao text not null default 'ativa', -- ativa | resolvida | descartada | inativa
  inicio date,
  fim date,
  gravidade text,                         -- leve | moderada | grave
  observacao text,
  corrige_id bigint references public.pep_condicoes(id) on delete set null,
  motivo_correcao text,
  profissional_nome text,
  conselho text,
  registro_conselho text,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_cond_pront_idx on public.pep_condicoes (prontuario, criado_em desc);
create index if not exists pep_cond_sit_idx on public.pep_condicoes (situacao);
create index if not exists pep_cond_corrige_idx on public.pep_condicoes (corrige_id);
alter table public.pep_condicoes enable row level security;
drop policy if exists pep_cond_select on public.pep_condicoes;
drop policy if exists pep_cond_insert on public.pep_condicoes;
create policy pep_cond_select on public.pep_condicoes
  for select to authenticated
  using (true);
create policy pep_cond_insert on public.pep_condicoes
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável


-- ═══════════════════════════════════════════════════════════
-- VERIFICAÇÃO — deve listar as 11 tabelas novas com RLS ativo e
-- pelo menos 1 política cada. Qualquer linha com "❌" reprova a migração.
-- ═══════════════════════════════════════════════════════════
select
  t.table_name as tabela,
  case when c.relrowsecurity then '✅ RLS ativo' else '❌ RLS DESLIGADO' end as rls,
  case when count(p.polname) = 0 then '❌ SEM POLÍTICA'
       else '✅ ' || count(p.polname) || ' política(s)' end as politicas
from information_schema.tables t
join pg_class c on c.relname = t.table_name
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
left join pg_policy p on p.polrelid = c.oid
where t.table_schema = 'public'
  and t.table_name in (
    'pep_episodios','pep_anamneses','pep_prescricoes','pep_prescricao_itens',
    'pep_prescricao_eventos','pep_aprazamentos','pep_administracoes',
    'pep_anotacoes_enfermagem','pep_sinais_vitais','pep_alergias','pep_condicoes'
  )
group by t.table_name, c.relrowsecurity
order by t.table_name;

-- Conferência das colunas novas de pep_evolucoes (deve retornar 11):
-- select count(*) from information_schema.columns
--  where table_schema = 'public' and table_name = 'pep_evolucoes'
--    and column_name in ('episodio_id','categoria','subjetivo','objetivo',
--      'avaliacao','plano','corrige_id','motivo_correcao','profissional_nome',
--      'conselho','registro_conselho');


-- ┌────────────────────────────────────────────────────────────
-- │ 26/75 — migracao-pep-acessos.sql
-- └────────────────────────────────────────────────────────────
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


-- ┌────────────────────────────────────────────────────────────
-- │ 27/75 — migracao-pep-sinais-spo2.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- PEP — saturação e suporte de O₂ nos sinais vitais
--
-- Aditiva e idempotente. Não altera nada existente.
--
-- POR QUE
-- `pep_sinais_vitais` nasceu com `escala_alerta` e `score_alerta` — ou
-- seja, com a intenção de calcular escore de deterioração clínica
-- (NEWS/MEWS). Mas faltava `spo2`, que é um dos seis parâmetros do NEWS.
--
-- Calcular NEWS sem saturação não dá um escore "quase certo": dá um
-- escore ERRADO PARA BAIXO, justamente no paciente que está dessaturando.
-- É o caso em que o alerta mais importa.
--
-- `o2_suplementar` entra junto porque o NEWS pontua o paciente em oxigênio
-- mesmo com saturação normal — respirar 95% em ar ambiente e respirar 95%
-- sob cateter são situações clínicas diferentes.
-- ═══════════════════════════════════════════════════════════

alter table public.pep_sinais_vitais
  add column if not exists spo2 int,                              -- saturação periférica (%)
  add column if not exists o2_suplementar boolean default false,  -- em O₂ suplementar?
  add column if not exists o2_dispositivo text,                   -- cateter | máscara | VNI | TOT
  add column if not exists o2_fluxo numeric;                      -- L/min ou FiO₂

-- Conferência:
-- select spo2, o2_suplementar, score_alerta from public.pep_sinais_vitais limit 5;


-- ┌────────────────────────────────────────────────────────────
-- │ 28/75 — migracao-pep-categoria-profissional.sql
-- └────────────────────────────────────────────────────────────
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


-- ┌────────────────────────────────────────────────────────────
-- │ 29/75 — migracao-pep-perfis-update.sql
-- └────────────────────────────────────────────────────────────
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


-- ┌────────────────────────────────────────────────────────────
-- │ 30/75 — migracao-pep-fase3.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- PEP — FASE 3: RECONCILIAÇÃO MEDICAMENTOSA E SUMÁRIO DE ALTA
--
-- O QUE FALTAVA
-- O PEP já cobre a internação inteira — admissão, prescrição, aprazamento,
-- checagem, sinais vitais, evolução. Faltavam as duas PONTAS, que é onde a
-- literatura de segurança do paciente concentra os erros de medicação:
--
--   • ENTRADA — o paciente chega tomando cinco remédios em casa e recebe
--     uma prescrição montada do zero. O anti-hipertensivo dele some sem que
--     ninguém tenha decidido suspendê-lo.
--   • SAÍDA  — ele vai para casa com o antibiótico do hospital e sem saber
--     se volta a tomar o que tomava antes.
--
-- Reconciliar é registrar uma DECISÃO EXPLÍCITA sobre cada medicamento em
-- cada transição. Suspender é ato clínico legítimo; esquecer não é — e os
-- dois produzem exatamente a mesma prescrição. A diferença é a
-- justificativa registrada, e é isso que estas tabelas guardam.
--
-- O sumário de alta fecha o episódio e é o único documento que o paciente
-- leva. Fica em campos separados (e não num texto corrido) porque as
-- Portarias GM/MS 8.025 e 8.026/2025 instituíram o modelo estruturado de
-- Sumário de Alta da RNDS: integrar depois é barato, extrair diagnóstico de
-- dentro de um parágrafo depois é migração de dado clínico.
--
-- ⚠️  RODAR NO SQL EDITOR **ANTES** DO MERGE DO CÓDIGO.
--     Sem isso, as abas "Reconciliação" e "Alta" abrem vazias.
--     É aditiva: só `create table if not exists` e índices. Nada é
--     alterado nem removido. Pode rodar duas vezes sem efeito colateral.
--
-- APPEND-ONLY, como todo o resto do PEP. Nenhuma tabela aqui tem política
-- de update ou delete: corrigir é criar um registro novo que aponta para o
-- anterior (`substitui_id` / `corrige_id`).
-- ═══════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════
-- 1) MEDICAMENTOS DE USO DOMICILIAR
--
-- É a lista do que o paciente toma EM CASA, e ela é atributo da PESSOA, não
-- da internação — mesma decisão já tomada para alergia (`pep_alergias`).
-- Se fosse do episódio, seria redigitada a cada passagem, e o paciente
-- crônico que interna três vezes por ano teria três listas divergentes.
--
-- `pep_anamneses.medicamentos_em_uso` (texto livre) continua existindo e não
-- é substituído: é a narrativa da admissão. Esta tabela é a versão
-- ESTRUTURADA, que dá para comparar com a prescrição — texto corrido não
-- se compara com nada.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_medicamentos_uso (
  id bigserial primary key,
  prontuario text not null,
  -- em qual internação esta linha foi levantada (contexto, não dono)
  episodio_id bigint references public.pep_episodios(id) on delete set null,

  medicamento_id bigint references public.farm_medicamentos(id) on delete set null,
  descricao text not null,                -- como o paciente chama ("Selozok")
  substancia text,                        -- princípio ativo, quando identificado
  apresentacao text,
  dose text,
  dose_valor numeric,
  dose_unidade text,
  via text,
  frequencia text,                        -- como falado ("1x ao dia", "de manhã")
  frequencia_dia numeric,
  uso_continuo boolean not null default true,
  indicacao text,                         -- "para pressão", "para diabetes"
  inicio date,

  -- De onde veio a informação. Muda a confiança: receita na mão é uma coisa,
  -- "acho que é um comprimido branco" é outra, e quem lê precisa saber qual
  -- das duas está olhando.
  fonte text not null default 'paciente', -- paciente | familiar | receita |
                                          -- farmacia | prontuario | outro
  confiabilidade text,                    -- alta | media | baixa

  situacao text not null default 'ativa', -- ativa | suspensa | encerrada

  -- "Perguntei e o paciente não usa nada em casa".
  -- É informação clínica, não ausência de informação — a mesma distinção já
  -- adotada em `pep_alergias` para "nega alergias". Lista vazia significa
  -- que NINGUÉM PERGUNTOU, e as duas coisas não podem ficar iguais na tela:
  -- sem isso, o paciente polimedicado que ninguém entrevistou parece
  -- idêntico ao que realmente não toma nada.
  sem_uso boolean not null default false,

  observacao text,

  corrige_id bigint references public.pep_medicamentos_uso(id) on delete set null,
  motivo_correcao text,

  profissional_nome text,
  conselho text,
  registro_conselho text,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_meduso_pront_idx on public.pep_medicamentos_uso (prontuario, criado_em desc);
create index if not exists pep_meduso_epis_idx on public.pep_medicamentos_uso (episodio_id);
create index if not exists pep_meduso_corrige_idx on public.pep_medicamentos_uso (corrige_id);
alter table public.pep_medicamentos_uso enable row level security;
drop policy if exists pep_meduso_select on public.pep_medicamentos_uso;
drop policy if exists pep_meduso_insert on public.pep_medicamentos_uso;
create policy pep_meduso_select on public.pep_medicamentos_uso
  for select to authenticated
  using (true);
create policy pep_meduso_insert on public.pep_medicamentos_uso
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: a lista de uso é registro clínico


-- ═══════════════════════════════════════════════════════════
-- 2) RECONCILIAÇÃO — O ATO
--
-- Nasce JÁ CONCLUÍDA, como a prescrição: o profissional monta as decisões
-- na tela e assina o conjunto de uma vez. Não há rascunho no banco.
--
-- O motivo é o mesmo do append-only: uma reconciliação "em andamento" que
-- alguém abandonou no meio, e que o sistema conta como existente, é pior
-- que reconciliação nenhuma — a tela diria "já foi feita". Refazer é criar
-- outra apontando para esta em `substitui_id`; a anterior permanece.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_reconciliacoes (
  id bigserial primary key,
  prontuario text not null,
  episodio_id bigint references public.pep_episodios(id) on delete set null,

  momento text not null default 'admissao',  -- admissao | alta | transferencia
  substitui_id bigint references public.pep_reconciliacoes(id) on delete set null,
  motivo_substituicao text,

  -- Placar congelado no momento da assinatura. É redundante com os itens de
  -- propósito: serve de indicador de qualidade sem varrer a tabela filha, e
  -- preserva o que era verdade naquele dia mesmo que a leitura mude.
  total_itens int not null default 0,
  total_discrepancias int not null default 0,
  total_pendentes int not null default 0,

  observacao text,
  concluida_em timestamptz not null default now(),
  profissional_nome text,
  conselho text,
  registro_conselho text,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_recon_pront_idx on public.pep_reconciliacoes (prontuario, criado_em desc);
create index if not exists pep_recon_epis_idx on public.pep_reconciliacoes (episodio_id, momento);
create index if not exists pep_recon_subst_idx on public.pep_reconciliacoes (substitui_id);
alter table public.pep_reconciliacoes enable row level security;
drop policy if exists pep_recon_select on public.pep_reconciliacoes;
drop policy if exists pep_recon_insert on public.pep_reconciliacoes;
create policy pep_recon_select on public.pep_reconciliacoes
  for select to authenticated
  using (true);
create policy pep_recon_insert on public.pep_reconciliacoes
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));


-- ═══════════════════════════════════════════════════════════
-- 3) RECONCILIAÇÃO — AS DECISÕES, UMA POR MEDICAMENTO
--
-- Cada linha guarda a posologia COPIADA, não só a referência. Parece
-- redundante — o item da prescrição está a um join de distância — mas a
-- prescrição de amanhã substitui a de hoje, e o registro precisa dizer o
-- que estava valendo quando a decisão foi tomada. Sem a cópia, reler a
-- reconciliação de terça mostraria a prescrição de quinta.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_reconciliacao_itens (
  id bigserial primary key,
  reconciliacao_id bigint not null references public.pep_reconciliacoes(id) on delete cascade,
  prontuario text not null,
  episodio_id bigint references public.pep_episodios(id) on delete set null,

  origem text not null default 'domiciliar',   -- domiciliar | hospitalar
  medicamento_uso_id bigint references public.pep_medicamentos_uso(id) on delete set null,
  prescricao_item_id bigint references public.pep_prescricao_itens(id) on delete set null,
  medicamento_id bigint references public.farm_medicamentos(id) on delete set null,

  -- posologia congelada (ver comentário acima)
  descricao text not null,
  dose text,
  dose_valor numeric,
  dose_unidade text,
  via text,
  frequencia text,
  frequencia_dia numeric,

  decisao text,                 -- manter | alterar | substituir | suspender |
                                -- reiniciar | novo
  justificativa text,
  discrepancia boolean not null default false,
  tipo_discrepancia text,       -- sem_decisao | omissao | dose_divergente |
                                -- via_divergente | frequencia_divergente |
                                -- duplicidade | sem_justificativa
  leva_para_casa boolean,       -- null = decisão ainda não tomada
  ordem int default 0,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_reconitem_rec_idx on public.pep_reconciliacao_itens (reconciliacao_id, ordem);
create index if not exists pep_reconitem_pront_idx on public.pep_reconciliacao_itens (prontuario, criado_em desc);
alter table public.pep_reconciliacao_itens enable row level security;
drop policy if exists pep_reconitem_select on public.pep_reconciliacao_itens;
drop policy if exists pep_reconitem_insert on public.pep_reconciliacao_itens;
create policy pep_reconitem_select on public.pep_reconciliacao_itens
  for select to authenticated
  using (true);
create policy pep_reconitem_insert on public.pep_reconciliacao_itens
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));


-- ═══════════════════════════════════════════════════════════
-- 4) SUMÁRIO DE ALTA
--
-- Campos separados, não um texto único: o modelo de Sumário de Alta da RNDS
-- (Portarias GM/MS 8.025 e 8.026/2025) é estruturado, e a CFM 1.638/2002,
-- art. 5º, já exige diagnóstico e tratamento efetuado como conteúdo mínimo.
--
-- `medicamentos_alta` e `medicamentos_suspensos` são jsonb com a receita
-- COMO FOI ENTREGUE. Não é desnormalização por preguiça: o documento que o
-- paciente levou no bolso precisa ser reproduzível anos depois, e ele não
-- muda quando a reconciliação for refeita ou a prescrição, substituída.
--
-- `texto_impressao` guarda a via impressa exatamente como saiu. Enquanto o
-- hospital não tiver assinatura qualificada (ICP-Brasil), a COFEN 754/2024,
-- art. 2º, §3º, manda imprimir e assinar à mão — então o papel é o
-- documento legal, e reimprimir precisa produzir a mesma folha, não uma
-- nova montagem a partir de dados que mudaram.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_sumarios_alta (
  id bigserial primary key,
  prontuario text not null,
  episodio_id bigint references public.pep_episodios(id) on delete set null,

  admissao_em timestamptz,
  alta_em timestamptz not null default now(),
  dias_internacao int,
  setor text,
  leito text,

  desfecho text not null,        -- alta_melhorado | alta_inalterado |
                                 -- alta_pedido | transferencia | evasao | obito
  desfecho_detalhe text,
  diagnostico_principal text,
  cid_principal text,
  cid_secundarios text,
  motivo_internacao text,
  resumo_internacao text,
  procedimentos text,
  exames_relevantes text,
  condicao_alta text,            -- em óbito, é a causa e a circunstância
  orientacoes text,
  sinais_de_alerta text,         -- quando o paciente deve procurar o serviço
  retorno_em date,
  retorno_servico text,

  reconciliacao_id bigint references public.pep_reconciliacoes(id) on delete set null,
  medicamentos_alta jsonb not null default '[]',
  medicamentos_suspensos jsonb not null default '[]',
  texto_impressao text,

  substitui_id bigint references public.pep_sumarios_alta(id) on delete set null,
  motivo_substituicao text,

  assinado_em timestamptz not null default now(),
  profissional_nome text,
  conselho text,
  registro_conselho text,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_sumario_pront_idx on public.pep_sumarios_alta (prontuario, criado_em desc);
create index if not exists pep_sumario_epis_idx on public.pep_sumarios_alta (episodio_id);
create index if not exists pep_sumario_subst_idx on public.pep_sumarios_alta (substitui_id);
alter table public.pep_sumarios_alta enable row level security;
drop policy if exists pep_sumario_select on public.pep_sumarios_alta;
drop policy if exists pep_sumario_insert on public.pep_sumarios_alta;
create policy pep_sumario_select on public.pep_sumarios_alta
  for select to authenticated
  using (true);
create policy pep_sumario_insert on public.pep_sumarios_alta
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: sumário emitido é documento. Retificar = novo sumário
-- com `substitui_id` e `motivo_substituicao`, e o original continua legível.


-- ═══════════════════════════════════════════════════════════
-- 5) CONFERÊNCIA
-- Rode depois de aplicar. Devem aparecer as 4 tabelas, todas com RLS.
-- ═══════════════════════════════════════════════════════════
select
  c.relname as tabela,
  c.relrowsecurity as rls_ligado,
  (select count(*) from pg_policies p where p.tablename = c.relname) as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('pep_medicamentos_uso','pep_reconciliacoes',
                    'pep_reconciliacao_itens','pep_sumarios_alta')
order by c.relname;


-- ┌────────────────────────────────────────────────────────────
-- │ 31/75 — migracao-perfis-acesso.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- PERFIS DE ACESSO — o cargo vira um pacote de permissões
--
-- O QUE RESOLVE
-- Hoje a TI cria um usuário e escolhe entre quatro papéis de sistema
-- (adm_master … visualizador). Isso responde "quanto essa pessoa mexe no
-- sistema", mas não responde "em QUAIS módulos" — e por isso todos os dez
-- módulos assistenciais aparecem para todo mundo. O almoxarifado enxerga o
-- Bloco Cirúrgico e o Pronto-Socorro; a recepção enxerga o prontuário.
--
-- Passa a existir o PERFIL: um pacote nomeado de permissões por módulo
-- ("Enfermeiro", "Almoxarifado"). O gestor pede, a TI escolhe o perfil, e a
-- pessoa entra configurada. É como MV e Tasy organizam.
--
-- POR REFERÊNCIA, NÃO POR CÓPIA
-- O usuário aponta para o perfil. Corrigir o perfil corrige todo mundo que
-- o usa — cópia envelhece e em seis meses ninguém sabe mais quem tem o quê.
-- O custo é real: mexer no perfil mexe em todos de uma vez. Por isso a tela
-- avisa quantas pessoas serão afetadas ANTES de salvar.
--
-- ⚠️ O QUE ESTA MIGRAÇÃO **NÃO** FAZ — E É IMPORTANTE NÃO SE ENGANAR
-- Ela NÃO restringe o acesso ao DADO. As políticas de SELECT das tabelas
-- clínicas continuam `using (true)`: qualquer usuário autenticado ainda
-- alcança qualquer tabela pela API REST, por fora da tela. Esconder o menu
-- organiza o trabalho e reduz exposição acidental — não é barreira.
--
-- A barreira é a fase 3 (apertar o RLS por tabela), e ela exige medir antes
-- quem realmente acessa o quê. Apertar SELECT no escuro tira acesso de quem
-- tem direito no meio do plantão. Até lá, NÃO apresentar isto ao hospital
-- como "os dados estão segregados".
--
-- ✅ A FASE 3 CHEGOU: `migracao-rls-leitura.sql` amarra a leitura de cada
--    tabela ao módulo do perfil, usando as três tabelas criadas aqui. Rode
--    esta migração ANTES daquela — lá as funções leem daqui.
--
-- Aditiva e idempotente: só `create table if not exists` / `add column if
-- not exists` / `on conflict do nothing`. Pode rodar duas vezes.
-- ═══════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════
-- 1) OS PERFIS
-- ═══════════════════════════════════════════════════════════
create table if not exists public.perfis_acesso (
  chave text primary key,                 -- 'enfermeiro', 'almoxarifado'
  nome text not null,                     -- como o gestor chama o cargo
  descricao text,

  -- SUGESTÕES que a tela de criação pré-preenche. Não são a regra:
  --   `categoria` quem manda é `profiles.categoria` + src/clinico/papeis.js
  --      (COFEN 736/2024) — perfil de acesso não concede competência clínica;
  --   `role` a TI confirma na criação.
  categoria_sugerida text,
  role_sugerido text,

  -- Perfil de sistema não pode ser apagado: é a porta de volta se alguém
  -- configurar tudo errado.
  sistema boolean not null default false,
  ativo boolean not null default true,

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  usuario text
);
alter table public.perfis_acesso enable row level security;
drop policy if exists perfis_select on public.perfis_acesso;
drop policy if exists perfis_write on public.perfis_acesso;
-- Todo mundo LÊ os perfis: a própria tela precisa saber o que o usuário
-- logado alcança para montar o menu dele.
create policy perfis_select on public.perfis_acesso
  for select to authenticated using (true);
create policy perfis_write on public.perfis_acesso
  for all to authenticated
  using (public.my_role() = 'adm_master')
  with check (public.my_role() = 'adm_master');


-- ═══════════════════════════════════════════════════════════
-- 2) AS PERMISSÕES DE CADA PERFIL
--
-- Uma linha por módulo concedido. O que não está aqui é "sem acesso" —
-- gravar quinze `nenhum` por perfil encheria a tabela de nada e esconderia
-- o que importa.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.perfis_permissoes (
  perfil_chave text not null references public.perfis_acesso(chave) on delete cascade,
  modulo text not null,                   -- 'ps', 'paciente', 'suprimentos' …
  nivel text not null default 'leitura',  -- leitura | escrita
  primary key (perfil_chave, modulo)
);
create index if not exists perfis_perm_perfil_idx on public.perfis_permissoes (perfil_chave);
alter table public.perfis_permissoes enable row level security;
drop policy if exists perfis_perm_select on public.perfis_permissoes;
drop policy if exists perfis_perm_write on public.perfis_permissoes;
create policy perfis_perm_select on public.perfis_permissoes
  for select to authenticated using (true);
create policy perfis_perm_write on public.perfis_permissoes
  for all to authenticated
  using (public.my_role() = 'adm_master')
  with check (public.my_role() = 'adm_master');


-- ═══════════════════════════════════════════════════════════
-- 3) EXCEÇÕES POR USUÁRIO
--
-- "Esta técnica também cobre o PS." Sem isto, cada desvio individual vira
-- um perfil novo, e em dois anos são quarenta perfis que ninguém entende.
--
-- Guarda MOTIVO e QUEM CONCEDEU porque exceção sem justificativa é como o
-- controle de acesso vira colcha de retalhos — e porque a trilha do NGS1
-- pede autoria em mudança de permissão.
--
-- Serve para reduzir também: `nivel = 'nenhum'` suspende o acesso de alguém
-- afastado sem precisar mexer no perfil do cargo inteiro.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.usuarios_permissoes (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  modulo text not null,
  nivel text not null,                    -- nenhum | leitura | escrita
  motivo text,
  concedido_por text,
  criado_em timestamptz not null default now(),
  unique (user_id, modulo)
);
create index if not exists usuarios_perm_user_idx on public.usuarios_permissoes (user_id);
alter table public.usuarios_permissoes enable row level security;
drop policy if exists usuarios_perm_select on public.usuarios_permissoes;
drop policy if exists usuarios_perm_write on public.usuarios_permissoes;
create policy usuarios_perm_select on public.usuarios_permissoes
  for select to authenticated using (true);
create policy usuarios_perm_write on public.usuarios_permissoes
  for all to authenticated
  using (public.my_role() = 'adm_master')
  with check (public.my_role() = 'adm_master');


-- ═══════════════════════════════════════════════════════════
-- 4) O USUÁRIO APONTA PARA O PERFIL
--
-- `on delete set null`: apagar um perfil não pode apagar gente. Quem ficar
-- sem perfil aparece na tela como "sem perfil" e não alcança nada — falha
-- fechada, que é o comportamento certo para permissão.
-- ═══════════════════════════════════════════════════════════
alter table public.profiles
  add column if not exists perfil text references public.perfis_acesso(chave) on delete set null,
  -- Lotação: hoje é informativa (aparece na tela, ajuda a TI a saber quem é
  -- quem). NÃO restringe — enfermeiro que cobre outra ala não pode ficar
  -- travado no meio do plantão. Vira filtro padrão de tela, não barreira.
  add column if not exists setor text,
  add column if not exists matricula text,
  -- Registro de conselho vence e pode ser suspenso. Guardar a validade
  -- permite avisar antes; sem a data, ninguém percebe que venceu.
  add column if not exists conselho_validade date,
  add column if not exists admitido_em date,
  add column if not exists desligado_em date;

create index if not exists profiles_perfil_idx on public.profiles (perfil);


-- ═══════════════════════════════════════════════════════════
-- 5) SEED DOS PERFIS INICIAIS
--
-- Espelha `src/acesso/modulos.js`. Os dois precisam continuar batendo:
-- `permissoes.test.js` confere o lado do código, e a tela lê daqui.
--
-- `on conflict do nothing` de propósito: se o hospital já ajustou um perfil,
-- rodar de novo NÃO desfaz o ajuste dele.
-- ═══════════════════════════════════════════════════════════
insert into public.perfis_acesso (chave, nome, descricao, categoria_sugerida, role_sugerido, sistema) values
  ('medico',             'Médico(a)',                  'Assistência médica: prescreve, evolui, dá alta.', 'medico', 'adm_silver', false),
  ('enfermeiro',         'Enfermeiro(a)',              'Processo de Enfermagem completo, gestão de leitos e do cuidado.', 'enfermeiro', 'adm_silver', false),
  ('enfermeiro_scih',    'Enfermeiro(a) — SCIH',       'Controle de infecção: vigilância, culturas, indicadores.', 'enfermeiro', 'adm_silver', false),
  ('tecnico_enfermagem', 'Técnico(a) de Enfermagem',   'Anotação de enfermagem, checagem de medicação e sinais vitais.', 'tecnico_enfermagem', 'adm_silver', false),
  ('fisioterapeuta',     'Fisioterapeuta',             'Evolução de fisioterapia no prontuário.', 'fisioterapeuta', 'adm_silver', false),
  ('nutricionista',      'Nutricionista',              'Avaliação e evolução nutricional.', 'nutricionista', 'adm_silver', false),
  ('assistente_social',  'Assistente Social',          'Avaliação social, apoio à alta.', 'assistente_social', 'adm_silver', false),
  ('nir',                'NIR / Regulação de Leitos',  'Regulação interna: fila de internação, vagas e alocação de leitos. Não acessa prontuário.', 'enfermeiro', 'adm_silver', false),
  ('farmaceutico',       'Farmacêutico(a)',            'Farmácia clínica, dispensação, controlados e intervenção farmacêutica.', 'farmaceutico', 'adm_silver', false),
  ('aux_farmacia',       'Auxiliar de Farmácia',       'Dispensação e estoque da farmácia. Não acessa prontuário.', 'administrativo', 'adm_silver', false),
  ('recepcao',           'Recepção / Admissão',        'Cadastro, chegada e agendamento. Não acessa prontuário (COFEN 754/2024, art. 6º).', 'administrativo', 'adm_silver', false),
  ('faturamento',        'Faturamento',                'Produção e movimento para faturamento. Não acessa prontuário.', 'administrativo', 'analista', false),
  ('almoxarifado',       'Almoxarifado / Suprimentos', 'Materiais, estoque, compras e inventário. Sem acesso assistencial.', 'administrativo', 'adm_silver', false),
  ('matriz',             'Matriz — Aprovação de Compras', 'Aprova ou nega os pedidos de compra do estoque (autorização da matriz). Não acessa prontuário.', 'administrativo', 'adm_silver', false),
  ('gestao',             'Gestão / Diretoria',         'Indicadores e BI de todos os módulos. Sem prontuário individual.', 'administrativo', 'analista', false),
  ('diretor_tecnico',    'Diretor(a) Técnico(a)',      'Responsável pelo prontuário da instituição (CFM 1.638/2002, art. 2º).', 'medico', 'adm_silver', false),
  ('ti',                 'TI / Analista de Sistemas',  'Administra o sistema: usuários, perfis, importação e banco. Sem competência clínica.', 'administrativo', 'adm_master', true)
on conflict (chave) do nothing;

insert into public.perfis_permissoes (perfil_chave, modulo, nivel) values
  -- Médico
  ('medico','overview','leitura'),('medico','atendimento','leitura'),('medico','ambulatorio','escrita'),('medico','ps','escrita'),
  ('medico','bloco','escrita'),('medico','leitos','escrita'),('medico','scih','leitura'),('medico','nsp','escrita'),('medico','protocolos','escrita'),
  ('medico','paciente','escrita'),('medico','farmacia','leitura'),('medico','print','leitura'),
  -- Enfermeiro
  ('enfermeiro','overview','leitura'),('enfermeiro','atendimento','escrita'),('enfermeiro','ambulatorio','escrita'),('enfermeiro','ps','escrita'),
  ('enfermeiro','bloco','leitura'),('enfermeiro','leitos','escrita'),('enfermeiro','scih','escrita'),('enfermeiro','nsp','escrita'),('enfermeiro','protocolos','escrita'),
  ('enfermeiro','paciente','escrita'),('enfermeiro','farmacia','leitura'),('enfermeiro','suprimentos','leitura'),
  ('enfermeiro','print','leitura'),
  -- Enfermeiro SCIH
  ('enfermeiro_scih','overview','leitura'),('enfermeiro_scih','ps','leitura'),('enfermeiro_scih','bloco','leitura'),
  ('enfermeiro_scih','leitos','leitura'),('enfermeiro_scih','scih','escrita'),('enfermeiro_scih','nsp','escrita'),
  ('enfermeiro_scih','paciente','escrita'),
  ('enfermeiro_scih','farmacia','leitura'),('enfermeiro_scih','print','leitura'),
  -- Técnico de enfermagem
  ('tecnico_enfermagem','overview','leitura'),('tecnico_enfermagem','atendimento','leitura'),('tecnico_enfermagem','ambulatorio','leitura'),
  ('tecnico_enfermagem','ps','escrita'),('tecnico_enfermagem','leitos','escrita'),('tecnico_enfermagem','nsp','escrita'),('tecnico_enfermagem','protocolos','escrita'),
  ('tecnico_enfermagem','scih','leitura'),('tecnico_enfermagem','paciente','escrita'),
  -- Fisioterapeuta
  ('fisioterapeuta','overview','leitura'),('fisioterapeuta','ps','leitura'),('fisioterapeuta','nsp','escrita'),
  ('fisioterapeuta','leitos','leitura'),('fisioterapeuta','paciente','escrita'),
  -- Nutricionista
  ('nutricionista','overview','leitura'),('nutricionista','leitos','leitura'),('nutricionista','nsp','escrita'),
  ('nutricionista','paciente','escrita'),
  -- Assistente social
  ('assistente_social','overview','leitura'),('assistente_social','ambulatorio','leitura'),('assistente_social','nsp','escrita'),
  ('assistente_social','leitos','leitura'),('assistente_social','paciente','escrita'),
  -- NIR / Regulação de Leitos
  ('nir','overview','leitura'),('nir','ps','leitura'),('nir','bloco','leitura'),('nir','nsp','escrita'),
  ('nir','leitos','escrita'),('nir','print','leitura'),
  -- Farmacêutico
  ('farmaceutico','overview','leitura'),('farmaceutico','ps','leitura'),('farmaceutico','leitos','leitura'),
  ('farmaceutico','scih','leitura'),('farmaceutico','nsp','escrita'),
  ('farmaceutico','farmacia','escrita'),('farmaceutico','controlados','escrita'),
  ('farmaceutico','suprimentos','leitura'),('farmaceutico','paciente','leitura'),('farmaceutico','print','leitura'),
  -- Auxiliar de farmácia
  ('aux_farmacia','nsp','escrita'),
  ('aux_farmacia','farmacia','escrita'),('aux_farmacia','controlados','leitura'),('aux_farmacia','suprimentos','leitura'),
  -- Recepção
  ('recepcao','overview','leitura'),('recepcao','atendimento','escrita'),('recepcao','ambulatorio','escrita'),('recepcao','ps','escrita'),
  ('recepcao','leitos','leitura'),('recepcao','nsp','escrita'),
  -- Faturamento
  ('faturamento','overview','leitura'),('faturamento','atendimento','leitura'),('faturamento','ambulatorio','leitura'),
  ('faturamento','leitos','leitura'),('faturamento','faturamento','escrita'),('faturamento','print','leitura'),
  -- Almoxarifado
  ('almoxarifado','suprimentos','escrita'),
  -- Matriz / Aprovação de compras
  ('matriz','overview','leitura'),('matriz','suprimentos','leitura'),
  -- Gestão
  ('gestao','overview','leitura'),('gestao','atendimento','leitura'),('gestao','ambulatorio','leitura'),('gestao','ps','leitura'),
  ('gestao','bloco','leitura'),('gestao','leitos','leitura'),('gestao','scih','leitura'),('gestao','nsp','leitura'),('gestao','protocolos','leitura'),
  ('gestao','farmacia','leitura'),('gestao','suprimentos','leitura'),('gestao','print','leitura'),
  ('gestao','auditoria','leitura'),
  -- Diretor técnico
  ('diretor_tecnico','overview','leitura'),('diretor_tecnico','atendimento','leitura'),('diretor_tecnico','ambulatorio','leitura'),
  ('diretor_tecnico','ps','escrita'),('diretor_tecnico','bloco','leitura'),('diretor_tecnico','leitos','leitura'),
  ('diretor_tecnico','scih','leitura'),('diretor_tecnico','nsp','escrita'),('diretor_tecnico','protocolos','escrita'),
  ('diretor_tecnico','paciente','escrita'),('diretor_tecnico','farmacia','leitura'),
  ('diretor_tecnico','controlados','leitura'),('diretor_tecnico','suprimentos','leitura'),
  ('diretor_tecnico','print','leitura'),('diretor_tecnico','auditoria','leitura'),
  -- TI
  ('ti','overview','escrita'),('ti','atendimento','escrita'),('ti','ambulatorio','escrita'),('ti','ps','escrita'),('ti','bloco','escrita'),
  ('ti','leitos','escrita'),('ti','scih','escrita'),('ti','nsp','escrita'),('ti','protocolos','escrita'),('ti','paciente','escrita'),('ti','farmacia','escrita'),
  ('ti','controlados','escrita'),('ti','suprimentos','escrita'),('ti','print','escrita'),
  ('ti','faturamento','escrita'),('ti','auditoria','escrita'),('ti','import','escrita'),('ti','users','escrita')
on conflict (perfil_chave, modulo) do nothing;


-- ═══════════════════════════════════════════════════════════
-- 6) QUEM JÁ EXISTE NÃO PODE FICAR SEM ACESSO
--
-- Ninguém tem perfil ainda. Se a tela passasse a exigir perfil sem isto, a
-- equipe inteira abriria o sistema vazio no dia seguinte — o tipo de coisa
-- que se descobre em pleno plantão.
--
-- Então: quem é adm_master herda o perfil de TI; o resto entra num perfil
-- provisório com o alcance de hoje (tudo), para que a migração seja
-- invisível. A TI então reclassifica pessoa por pessoa, sem pressa, e
-- **depois** desativa o provisório.
-- ═══════════════════════════════════════════════════════════
insert into public.perfis_acesso (chave, nome, descricao, categoria_sugerida, role_sugerido, sistema) values
  ('provisorio', 'Provisório — a classificar',
   'Mantém o acesso que a equipe já tinha antes dos perfis. Reclassifique cada pessoa e depois desative este perfil.',
   'administrativo', 'adm_silver', true)
on conflict (chave) do nothing;

insert into public.perfis_permissoes (perfil_chave, modulo, nivel) values
  ('provisorio','overview','escrita'),('provisorio','atendimento','escrita'),('provisorio','ambulatorio','escrita'),('provisorio','ps','escrita'),
  ('provisorio','bloco','escrita'),('provisorio','leitos','escrita'),('provisorio','scih','escrita'),('provisorio','nsp','escrita'),('provisorio','protocolos','escrita'),
  ('provisorio','paciente','escrita'),('provisorio','farmacia','escrita'),('provisorio','controlados','escrita'),
  ('provisorio','suprimentos','escrita'),('provisorio','print','escrita'),('provisorio','auditoria','escrita'),
  ('provisorio','faturamento','escrita'),('provisorio','import','escrita')
on conflict (perfil_chave, modulo) do nothing;

update public.profiles set perfil = 'ti'         where perfil is null and role = 'adm_master';
update public.profiles set perfil = 'provisorio' where perfil is null;


-- ═══════════════════════════════════════════════════════════
-- 7) CONFERÊNCIA
-- Rode depois de aplicar.
-- ═══════════════════════════════════════════════════════════
select p.chave, p.nome, count(pp.modulo) as modulos,
       (select count(*) from public.profiles pr where pr.perfil = p.chave) as usuarios
  from public.perfis_acesso p
  left join public.perfis_permissoes pp on pp.perfil_chave = p.chave
 group by p.chave, p.nome
 order by p.chave;


-- ┌────────────────────────────────────────────────────────────
-- │ 32/75 — migracao-leitos-nir-regulacao.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- GIRO DE LEITOS — Regulação (NIR): rastro do "quem pegou o caso"
--
-- A fila de leito (public.solicitacoes) já recebe as internações do PS
-- (elo forte ps_atendimento_id) e as transferências entre setores, mas hoje
-- não guarda NADA sobre a regulação em si: não dá para separar "pedido novo,
-- ninguém olhou" de "o NIR já está cuidando", nem medir quanto tempo o caso
-- levou da fila até sair.
--
-- Três colunas resolvem isso, sem tabela nova:
--   visto_em / visto_por  — quando/quem marcou "estou regulando" (o "ciente");
--   resolvido_em          — quando saiu da fila (atendido/cancelado).
-- Com isso o aviso do menu distingue não-visto de em-regulação, e fica
-- mensurável o tempo pedido → visto → resolvido.
--
-- As três herdam as policies que a tabela já tem: solic_select (todos leem) e
-- solic_write (adm_master/adm_silver escrevem) — nenhuma policy nova.
--
-- Aditiva e idempotente (só `add column if not exists`): pode rodar duas vezes,
-- não apaga nem altera nada. Rodar no SQL Editor — primeiro no DEMO, depois no
-- PRINCIPAL (HNSN).
-- ═══════════════════════════════════════════════════════════

alter table public.solicitacoes
  add column if not exists visto_em     timestamptz,  -- o NIR marcou "estou regulando"
  add column if not exists visto_por    text,         -- quem marcou
  add column if not exists resolvido_em timestamptz;  -- saiu da fila (atendido/cancelado)

-- Verificação
select 'regulação NIR ok' as resultado
 where exists (select 1 from information_schema.columns
                where table_name = 'solicitacoes' and column_name = 'visto_em')
   and exists (select 1 from information_schema.columns
                where table_name = 'solicitacoes' and column_name = 'visto_por')
   and exists (select 1 from information_schema.columns
                where table_name = 'solicitacoes' and column_name = 'resolvido_em');


-- ┌────────────────────────────────────────────────────────────
-- │ 33/75 — migracao-suprimentos-aprovacao.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS — Aprovação de pedidos de compra pela matriz
--
-- O comprador monta o pedido (status "aberto"), envia para aprovação
-- ("aguardando_aprovacao"), e a matriz aprova ("aprovado") ou nega ("negado",
-- com motivo). Só depois de aprovado o pedido pode ir ao fornecedor ("enviado").
--
-- `status` é texto sem constraint — os novos valores não exigem mudança de
-- estrutura. Só a TRILHA da decisão precisa de colunas: quando foi enviado para
-- aprovação, quem decidiu, quando, e por que negou.
--
-- Aditiva e idempotente (só `add column if not exists`). Rodar no SQL Editor —
-- primeiro no DEMO, depois no PRINCIPAL (HNSN). As colunas herdam as policies
-- que a tabela já tem (update por adm_master/adm_silver).
-- ═══════════════════════════════════════════════════════════

alter table public.sup_pedidos
  add column if not exists aprovacao_em   timestamptz,  -- enviado para aprovação em
  add column if not exists decidido_por   text,         -- quem aprovou ou negou
  add column if not exists decidido_em    timestamptz,  -- quando decidiu
  add column if not exists negado_motivo  text;         -- motivo, quando negado

-- Verificação
select 'aprovação de compras ok' as resultado
 where exists (select 1 from information_schema.columns
                where table_name = 'sup_pedidos' and column_name = 'aprovacao_em')
   and exists (select 1 from information_schema.columns
                where table_name = 'sup_pedidos' and column_name = 'decidido_por')
   and exists (select 1 from information_schema.columns
                where table_name = 'sup_pedidos' and column_name = 'negado_motivo');


-- ┌────────────────────────────────────────────────────────────
-- │ 34/75 — migracao-ps-comorbidades.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- PRONTO-SOCORRO — Comorbidades na triagem
--
-- A triagem passa a registrar as comorbidades do paciente por SELEÇÃO (HAS,
-- DM, DRC, DRC em diálise, hepatopatia, cardiopatia…) em vez de alguém digitar
-- valores de função renal/hepática. As que importam alimentam os alertas de
-- ajuste de dose da farmácia: DRC/diálise → função renal reduzida; hepatopatia
-- → função hepática comprometida. O ClCr numérico continua opcional, para
-- quando o valor exato é conhecido.
--
-- Uma coluna jsonb (lista de chaves). Aditiva e idempotente. Rodar no SQL
-- Editor — primeiro no DEMO, depois no PRINCIPAL (HNSN).
-- ═══════════════════════════════════════════════════════════

alter table public.ps_atendimentos
  add column if not exists comorbidades jsonb not null default '[]'::jsonb;

-- Verificação
select 'comorbidades ok' as resultado
 where exists (select 1 from information_schema.columns
                where table_name = 'ps_atendimentos' and column_name = 'comorbidades');


-- ┌────────────────────────────────────────────────────────────
-- │ 35/75 — migracao-ps-triagem-tipo.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- PRONTO-SOCORRO — Tipo de triagem (Adulto / Obstétrica / Pediátrica)
--
-- A triagem passa a ter um TIPO. Cada tipo abre os campos próprios:
--   • Obstétrica: idade gestacional, G/partos/cesáreas/abortos, sangramento,
--     perda de líquido, movimento fetal, contrações.
--   • Pediátrica: peso e idade em meses (o peso vai para a coluna `peso`, que
--     alimenta a checagem de dose; aqui guardamos os detalhes da triagem).
--
-- IMPORTANTE: esta migração só GUARDA os dados. A CLASSIFICAÇÃO de risco
-- obstétrica/pediátrica continua sendo feita pela enfermeira — as faixas/
-- sugestões automáticas adaptadas são uma fase posterior, após validação
-- clínica do HNSN. Software não inventa risco obstétrico/pediátrico.
--
-- Dois blobs jsonb + uma coluna de tipo. Aditiva e idempotente. Rodar no SQL
-- Editor — primeiro no DEMO, depois no PRINCIPAL (HNSN).
-- ═══════════════════════════════════════════════════════════

alter table public.ps_atendimentos
  add column if not exists triagem_tipo text,                          -- adulto | obstetrica | pediatrica
  add column if not exists obstetricia jsonb not null default '{}'::jsonb,
  add column if not exists pediatria   jsonb not null default '{}'::jsonb;

-- Verificação
select 'triagem_tipo ok' as resultado
 where exists (select 1 from information_schema.columns
                where table_name = 'ps_atendimentos' and column_name = 'triagem_tipo')
   and exists (select 1 from information_schema.columns
                where table_name = 'ps_atendimentos' and column_name = 'obstetricia')
   and exists (select 1 from information_schema.columns
                where table_name = 'ps_atendimentos' and column_name = 'pediatria');


-- ┌────────────────────────────────────────────────────────────
-- │ 36/75 — migracao-ps-faixas-pediatricas.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- PRONTO-SOCORRO — Faixas pediátricas de referência (Triagem Fase 3, peds)
--
-- Religa a SUGESTÃO automática de Manchester para a triagem pediátrica, com
-- faixas de sinais vitais POR IDADE (as de adulto não servem: FC 140 é normal
-- em bebê e alarme em adulto). A sugestão continua sendo APOIO À DECISÃO — a
-- enfermeira classifica; o software só sugere.
--
-- ⚠️ VALORES DE PARTIDA (RASCUNHO) — baseados em faixas pediátricas padrão
-- (tipo PALS/APLS). Cada faixa nasce com `validado = false`: enquanto o ADM
-- Master não validar na tela, a triagem mostra "faixas pediátricas em
-- validação". A equipe edita os números pela própria tela (só ADM Master).
--
-- Modelo por vital (FC e FR), 6 limites em ordem crescente definindo as zonas:
--   x < grave_min                     → vermelho (grave baixo)
--   [grave_min,  moderado_min)        → laranja
--   [moderado_min, normal_min)        → amarelo
--   [normal_min, normal_max]          → verde (normal para a idade)
--   (normal_max, moderado_max]        → amarelo
--   (moderado_max, grave_max]         → laranja
--   x > grave_max                     → vermelho (grave alto)
-- Colunas nulas => aquela zona não é usada (o motor degrada com segurança).
--
-- PA NÃO entra na pediatria (a unidade não mede PA em criança por falta de
-- material adequado) — nem tabela, nem motor.
--
-- Aditiva e idempotente. Rodar no SQL Editor — primeiro no DEMO, depois no
-- PRINCIPAL (HNSN). O seed usa ON CONFLICT DO NOTHING: reexecutar não
-- sobrescreve os valores que a equipe já tiver editado.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.ps_faixas_pediatricas (
  faixa            text primary key,          -- slug estável (neonato, lactente, ...)
  ordem            int  not null default 0,
  rotulo           text not null,
  idade_min_meses  int  not null,             -- inclusivo
  idade_max_meses  int,                        -- exclusivo; null = sem teto (>= 12 anos)
  fc_grave_min     int, fc_moderado_min int, fc_normal_min int,
  fc_normal_max    int, fc_moderado_max int, fc_grave_max int,
  fr_grave_min     int, fr_moderado_min int, fr_normal_min int,
  fr_normal_max    int, fr_moderado_max int, fr_grave_max int,
  validado         boolean     not null default false,
  ativo            boolean     not null default true,
  usuario          text,
  updated_at       timestamptz not null default now()
);

-- Seed do rascunho (não sobrescreve edições — ON CONFLICT DO NOTHING).
insert into public.ps_faixas_pediatricas
  (faixa, ordem, rotulo, idade_min_meses, idade_max_meses,
   fc_grave_min, fc_moderado_min, fc_normal_min, fc_normal_max, fc_moderado_max, fc_grave_max,
   fr_grave_min, fr_moderado_min, fr_normal_min, fr_normal_max, fr_moderado_max, fr_grave_max)
values
  ('neonato',  0, 'Neonato (0–1 mês)',    0,   1,   80, 90, 100, 180, 190, 205,   20, 25, 30, 60, 70, 80),
  ('lactente', 1, 'Lactente (1–11 meses)',1,  12,   80, 90, 100, 160, 170, 190,   20, 25, 30, 53, 60, 70),
  ('1a2',      2, '1–2 anos',            12,  36,   70, 80,  90, 150, 160, 180,   15, 18, 22, 37, 45, 55),
  ('3a5',      3, '3–5 anos',            36,  72,   60, 70,  80, 140, 150, 170,   12, 16, 20, 28, 35, 45),
  ('6a11',     4, '6–11 anos',           72, 144,   50, 60,  70, 120, 130, 150,   10, 14, 18, 25, 30, 40),
  ('12mais',   5, '≥ 12 anos (= adulto)',144, null, 40, 50,  60,  99, 120, 150,    8, 10, 12, 20, 24, 35)
on conflict (faixa) do nothing;

-- Verificação
select 'ps_faixas_pediatricas ok — ' || count(*) || ' faixas' as resultado
  from public.ps_faixas_pediatricas;


-- ┌────────────────────────────────────────────────────────────
-- │ 37/75 — migracao-ps-faixas-obstetricas.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- PRONTO-SOCORRO — Critérios obstétricos de risco (Triagem Fase 3, obstétrica)
--
-- Religa a SUGESTÃO automática de Manchester para a triagem OBSTÉTRICA, por
-- DISCRIMINADORES (não faixas numéricas): sangramento, movimento fetal, perda
-- de líquido, contrações e PA (pré-eclâmpsia). Continua sendo APOIO À DECISÃO —
-- a enfermeira classifica; o software só sugere.
--
-- ⚠️ VALORES DE PARTIDA (RASCUNHO) — baseados em protocolos de acolhimento e
-- classificação de risco em obstetrícia / Manchester obstétrico. Cada regra
-- nasce com `validado = false`: enquanto o ADM Master não validar na tela, a
-- triagem mostra "critérios obstétricos em validação". A equipe edita os níveis
-- e limiares pela própria tela (só ADM Master).
--
-- Cada linha é uma REGRA:
--   • Discriminador (sangramento, mov_fetal_ausente, mov_fetal_reduzido,
--     perda_liquido, contracoes): dispara `nivel` quando o achado está presente.
--   • Regra de PA (pas_min / pad_min preenchidos): dispara `nivel` quando a PA
--     atinge o limiar. Se `requer_sintoma`, exige também cefaleia/epigastralgia/
--     alteração visual marcados (iminência de pré-eclâmpsia).
-- O motor (src/clinico/obstetricia.js) conhece cada `chave`; a tela deixa
-- editar níveis, limiares, ativo e validado — não inventar discriminador novo.
--
-- Diferente da pediátrica: aqui a PA É usada (é peça central da pré-eclâmpsia).
--
-- Aditiva e idempotente. Rodar no SQL Editor — primeiro no DEMO, depois no
-- PRINCIPAL (HNSN). ON CONFLICT DO NOTHING: reexecutar não sobrescreve edições.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.ps_faixas_obstetricas (
  chave           text primary key,          -- slug conhecido pelo motor
  ordem           int  not null default 0,
  rotulo          text not null,
  nivel           text not null,             -- vermelho | laranja | amarelo | verde | azul
  pas_min         int,                        -- limiar PA sistólica (>=); null = não é regra de PA
  pad_min         int,                        -- limiar PA diastólica (>=)
  requer_sintoma  boolean     not null default false,  -- exige sintoma de pré-eclâmpsia
  ativo           boolean     not null default true,
  validado        boolean     not null default false,
  usuario         text,
  updated_at      timestamptz not null default now()
);

-- Seed do rascunho (não sobrescreve edições — ON CONFLICT DO NOTHING).
insert into public.ps_faixas_obstetricas
  (chave, ordem, rotulo, nivel, pas_min, pad_min, requer_sintoma)
values
  ('preeclampsia_grave',     0, 'PA ≥ 160/110 + sintoma (cefaleia/epigastralgia/visual)', 'vermelho', 160, 110, true),
  ('pa_grave',               1, 'PA ≥ 160/110 (hipertensão grave)',                       'laranja',  160, 110, false),
  ('sangramento',            2, 'Sangramento vaginal',                                    'laranja',  null, null, false),
  ('mov_fetal_ausente',      3, 'Movimento fetal ausente',                                'laranja',  null, null, false),
  ('preeclampsia_iminencia', 4, 'PA ≥ 140/90 + sintoma (cefaleia/epigastralgia/visual)',  'laranja',  140,  90, true),
  ('pa_alerta',              5, 'PA 140–159 / 90–109 (hipertensão)',                      'amarelo',  140,  90, false),
  ('mov_fetal_reduzido',     6, 'Movimento fetal reduzido',                               'amarelo',  null, null, false),
  ('perda_liquido',          7, 'Perda de líquido (bolsa rota)',                          'amarelo',  null, null, false),
  ('contracoes',             8, 'Contrações',                                             'amarelo',  null, null, false)
on conflict (chave) do nothing;

-- Verificação
select 'ps_faixas_obstetricas ok — ' || count(*) || ' regras' as resultado
  from public.ps_faixas_obstetricas;


-- ┌────────────────────────────────────────────────────────────
-- │ 38/75 — migracao-enf-escalas-lpp.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- ENFERMAGEM — Escalas de risco + Lesão por Pressão (Tier 1, Fase 1a)
--
-- Registra as escalas padronizadas de enfermagem à beira-leito e as lesões por
-- pressão, dentro do PEP / Paciente 360. Escalas cobertas: Braden, Morse, dor,
-- flebite, Fugulin (grau de dependência — só classificação nesta fase), Glasgow
-- e RASS. Apoio à decisão + segurança do paciente — a conduta é da enfermeira.
--
-- 3 tabelas:
--   • enf_escalas          — cada aplicação de escala (append-only).
--   • enf_lesao_pressao    — LPP com marcador PRESENTE NA ADMISSÃO × ADQUIRIDA
--                            (POA), para o indicador limpo de LPP adquirida.
--   • enf_escala_faixas    — cortes de classificação por escala, EDITÁVEIS pelo
--                            ADM Master; cada faixa nasce `validado=false`
--                            ("em validação"), no mesmo padrão da triagem.
--
-- ⚠️ Os cortes semeados são RASCUNHO (valores usuais das escalas). A equipe
-- valida e ajusta na tela. O motor (src/clinico/escalas-enfermagem.js) só
-- soma/classifica; os números moram aqui.
--
-- Registro clínico é IMUTÁVEL: enf_escalas e enf_lesao_pressao são append-only
-- (correção = novo registro). Aditiva e idempotente. Rodar no SQL Editor —
-- DEMO primeiro, depois HNSN. Seed com ON CONFLICT DO NOTHING.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.enf_escalas (
  id             uuid primary key default gen_random_uuid(),
  prontuario     text not null,
  episodio_id    uuid,                        -- internação (pep_episodios); escopo do PEP
  tipo           text not null,              -- braden|morse|dor|flebite|fugulin|glasgow|rass
  itens          jsonb not null default '{}'::jsonb,  -- respostas das subescalas
  score          int,                         -- soma (braden/morse/fugulin/glasgow) ou valor (dor/rass)
  classificacao  text,                        -- rótulo da faixa resultante
  nivel          text,                        -- semáforo: verde|amarelo|laranja|vermelho
  sitio          text,                        -- flebite: identificação do acesso venoso
  aplicado_por   text,                        -- nome congelado de quem aplicou
  categoria      text,                        -- categoria profissional (papeis.js)
  conselho          text,                      -- autoria congelada (COFEN 754/2024)
  registro_conselho text,
  aferido_em     timestamptz not null default now(),
  criado_em      timestamptz not null default now()
);
create index if not exists enf_escalas_pront_idx on public.enf_escalas (prontuario, tipo, aferido_em desc);

create table if not exists public.enf_lesao_pressao (
  id                 uuid primary key default gen_random_uuid(),
  prontuario         text not null,
  episodio_id        uuid,                              -- internação (pep_episodios)
  presente_admissao  boolean not null default false,  -- POA: veio COM a lesão?
  local              text,                              -- região corporal
  estagio            text,                              -- 1|2|3|4|nao_classificavel|tissular_profunda
  medidas            jsonb,                             -- comprimento/largura/profundidade (cm)
  descricao          text,
  status             text not null default 'ativa',     -- ativa|regressao|cicatrizada
  registrado_por     text,                               -- nome congelado de quem notificou
  categoria          text,
  conselho           text,                                -- autoria congelada (COFEN 754/2024)
  registro_conselho  text,
  criado_em          timestamptz not null default now()
);
create index if not exists enf_lpp_pront_idx on public.enf_lesao_pressao (prontuario, criado_em desc);

create table if not exists public.enf_escala_faixas (
  id              text primary key,           -- slug: braden_alto, morse_moderado, ...
  tipo            text not null,
  ordem           int  not null default 0,
  faixa_min       int,                          -- score mínimo (inclusive); null = sem piso
  faixa_max       int,                          -- score máximo (inclusive); null = sem teto
  rotulo          text not null,
  nivel           text not null,                -- verde|amarelo|laranja|vermelho (mapa de risco)
  reavaliar_horas int,                          -- gatilho de reavaliação (h); null = sem gatilho
  validado        boolean     not null default false,
  ativo           boolean     not null default true,
  usuario         text,
  updated_at      timestamptz not null default now()
);

-- Seed dos cortes (RASCUNHO — editável e "em validação"). ON CONFLICT DO NOTHING.
insert into public.enf_escala_faixas (id, tipo, ordem, faixa_min, faixa_max, rotulo, nivel, reavaliar_horas) values
  -- Braden (6–23, menor = mais risco)
  ('braden_muito_alto','braden',0,null, 9,'Risco muito alto','vermelho',24),
  ('braden_alto',      'braden',1,  10,12,'Risco alto',      'laranja', 24),
  ('braden_moderado',  'braden',2,  13,14,'Risco moderado',  'amarelo', 48),
  ('braden_baixo',     'braden',3,  15,18,'Risco baixo',     'verde',   72),
  ('braden_sem',       'braden',4,  19,null,'Sem risco',     'verde',  168),
  -- Morse (0–125, maior = mais risco de queda)
  ('morse_baixo',   'morse',0,null,24,'Risco baixo',   'verde',  48),
  ('morse_moderado','morse',1,  25,44,'Risco moderado','amarelo',24),
  ('morse_alto',    'morse',2,  45,null,'Risco alto',  'laranja',12),
  -- Glasgow (3–15, menor = pior)
  ('glasgow_grave',   'glasgow',0,null, 8,'Grave',   'vermelho',1),
  ('glasgow_moderado','glasgow',1,   9,12,'Moderado','laranja', 2),
  ('glasgow_leve',    'glasgow',2,  13,15,'Leve',    'verde',   8),
  -- RASS (−5 a +4)
  ('rass_agitado',      'rass',0,  2, 4,'Agitado',         'laranja', 2),
  ('rass_inquieto',     'rass',1,  1, 1,'Inquieto',        'amarelo', 4),
  ('rass_calmo',        'rass',2,  0, 0,'Alerta e calmo',  'verde',   8),
  ('rass_sedacao_leve', 'rass',3, -2,-1,'Sedação leve',    'verde',   8),
  ('rass_sedacao_prof', 'rass',4, -4,-3,'Sedação profunda','laranja', 2),
  ('rass_nao_desperta', 'rass',5, -5,-5,'Não desperta',    'vermelho',1),
  -- Dor (0–10)
  ('dor_sem',     'dor',0,0, 0,'Sem dor',  'verde',  null),
  ('dor_leve',    'dor',1,1, 3,'Leve',     'verde',  4),
  ('dor_moderada','dor',2,4, 6,'Moderada', 'amarelo',1),
  ('dor_intensa', 'dor',3,7,10,'Intensa',  'laranja',1),
  -- Flebite (grau 0–4, escala INS)
  ('flebite_0','flebite',0,0,0,'Grau 0 — sem sinais',    'verde',  null),
  ('flebite_1','flebite',1,1,1,'Grau 1',                 'amarelo',4),
  ('flebite_2','flebite',2,2,2,'Grau 2 — trocar acesso', 'laranja',1),
  ('flebite_3','flebite',3,3,3,'Grau 3',                 'vermelho',1),
  ('flebite_4','flebite',4,4,4,'Grau 4',                 'vermelho',1),
  -- Fugulin (grau de dependência → categoria de cuidado; só classificação nesta fase)
  ('fugulin_minimos',      'fugulin',0,null,17,'Cuidados mínimos',      'verde',  24),
  ('fugulin_intermediarios','fugulin',1, 18,22,'Cuidados intermediários','verde', 24),
  ('fugulin_alta_dep',     'fugulin',2, 23,27,'Alta dependência',      'amarelo',24),
  ('fugulin_semi_intensivo','fugulin',3, 28,31,'Semi-intensivos',      'laranja',24),
  ('fugulin_intensivo',    'fugulin',4, 32,null,'Cuidados intensivos',  'vermelho',24)
on conflict (id) do nothing;

-- Verificação
select 'enf: escalas/lpp/faixas ok — ' || count(*) || ' cortes semeados' as resultado
  from public.enf_escala_faixas;


-- ┌────────────────────────────────────────────────────────────
-- │ 39/75 — migracao-enf-sae.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- ENFERMAGEM — SAE / Processo de Enfermagem (Tier 1, Fase 1b)
--
-- O Processo de Enfermagem à beira-leito, dentro do PEP (COFEN 736/2024,
-- ex-358/2009). Núcleo clínico desta fase:
--   Histórico → Diagnóstico (NANDA-I) → Resultado esperado (texto curado) →
--   Prescrição de enfermagem (NIC) com aprazamento → checagem à beira-leito
--   (técnico) → Evolução (reusa pep_evolucoes tipo enfermagem).
--
-- Diagnóstico e prescrição de enfermagem são PRIVATIVOS do enfermeiro
-- (papeis.js). O técnico executa e CHECA o cuidado prescrito — mesma lógica
-- da checagem de medicação.
--
-- 6 tabelas:
--   • enf_sae_catalogo         — curadoria de diagnósticos (NANDA) e intervenções
--                                (NIC), EDITÁVEL pelo ADM Master; cada item nasce
--                                `status='em_validacao'`, no padrão da triagem/escalas.
--   • enf_sae_historico        — coleta de dados / histórico de enfermagem (append-only).
--   • enf_sae_diagnosticos     — diagnósticos levantados no episódio (append-only).
--   • enf_sae_prescricoes      — cabeçalho da prescrição de enfermagem (append-only).
--   • enf_sae_prescricao_itens — os cuidados prescritos, com aprazamento.
--   • enf_sae_checagem         — execução/checagem do cuidado à beira-leito (append-only).
--
-- ⚠️ O catálogo semeado é RASCUNHO clínico (títulos NANDA/NIC usuais, com
-- características, fatores e atividades curados de forma enxuta). A equipe
-- valida e amplia na tela (editor do ADM Master). O motor (src/clinico/sae.js)
-- é apoio à decisão — a conduta é da enfermeira.
--
-- Registro clínico é IMUTÁVEL: as tabelas de registro são append-only
-- (correção = novo registro com corrige_id/substitui_id). Aditiva e idempotente.
-- Rodar no SQL Editor — DEMO primeiro, depois HNSN. Seed com ON CONFLICT DO NOTHING.
-- ═══════════════════════════════════════════════════════════

-- 1) CATÁLOGO curado (config editável pelo ADM Master) ────────
create table if not exists public.enf_sae_catalogo (
  id          text primary key,            -- slug: dx_dor_aguda, nic_controle_dor, ...
  tipo        text not null,               -- diagnostico | intervencao
  codigo      text,                        -- código NANDA (00132) ou NIC (1400); referência
  titulo      text not null,
  dominio     text,                        -- domínio NANDA / classe NIC
  subtipo     text,                        -- diagnóstico: real | risco | promocao
  unidades    jsonb not null default '[]'::jsonb,  -- ["clinica","uti","peds","obst"]; [] = todas
  payload     jsonb not null default '{}'::jsonb,  -- def/fatores/resultado/intervenções OU atividades/frequência
  status      text not null default 'em_validacao', -- em_validacao | validado
  ordem       int  not null default 0,
  ativo       boolean not null default true,
  usuario     text,
  criado_em   timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists enf_sae_catalogo_tipo_idx on public.enf_sae_catalogo (tipo, ordem);

-- 2) HISTÓRICO de enfermagem (coleta de dados) ────────────────
create table if not exists public.enf_sae_historico (
  id                 uuid primary key default gen_random_uuid(),
  prontuario         text not null,
  episodio_id        uuid,                              -- internação (pep_episodios)
  modelo             text not null default 'necessidades_humanas',
  dados              jsonb not null default '{}'::jsonb, -- respostas por seção do template
  queixa             text,
  exame_fisico       text,
  observacao         text,
  registrado_por     text,                               -- nome congelado
  categoria          text,
  conselho           text,                               -- autoria congelada (COFEN 754/2024)
  registro_conselho  text,
  corrige_id         uuid,
  motivo_correcao    text,
  criado_em          timestamptz not null default now()
);
create index if not exists enf_sae_historico_pront_idx on public.enf_sae_historico (prontuario, criado_em desc);

-- 3) DIAGNÓSTICOS de enfermagem (NANDA-I) ─────────────────────
create table if not exists public.enf_sae_diagnosticos (
  id                 uuid primary key default gen_random_uuid(),
  prontuario         text not null,
  episodio_id        uuid,
  historico_id       uuid,                               -- de qual coleta nasceu (opcional)
  catalogo_id        text,                               -- referência ao enf_sae_catalogo
  codigo             text,                               -- NANDA congelado
  titulo             text not null,                      -- título congelado
  dominio            text,
  subtipo            text,                               -- real | risco | promocao
  caracteristicas    jsonb not null default '[]'::jsonb, -- definidoras selecionadas
  fatores            jsonb not null default '[]'::jsonb, -- relacionados / de risco
  resultado_esperado text,                               -- NOC enxuto (texto curado, editável)
  prioridade         text,                               -- alta | media | baixa
  status             text not null default 'ativo',      -- ativo | resolvido | suspenso
  registrado_por     text,
  categoria          text,
  conselho           text,
  registro_conselho  text,
  corrige_id         uuid,
  motivo_correcao    text,
  criado_em          timestamptz not null default now()
);
create index if not exists enf_sae_dx_pront_idx on public.enf_sae_diagnosticos (prontuario, criado_em desc);
create index if not exists enf_sae_dx_ep_idx on public.enf_sae_diagnosticos (episodio_id, status);

-- 4) PRESCRIÇÃO de enfermagem — cabeçalho ─────────────────────
create table if not exists public.enf_sae_prescricoes (
  id                 uuid primary key default gen_random_uuid(),
  prontuario         text not null,
  episodio_id        uuid,
  data_referencia    date not null default current_date, -- dia civil local da prescrição
  substitui_id       uuid,                                -- represcrever aposenta a anterior
  observacao         text,
  inicio_em          timestamptz not null default now(),
  assinada_em        timestamptz not null default now(),
  prescritor_nome    text,                                -- nome congelado do enfermeiro
  categoria          text,
  conselho           text,
  registro_conselho  text,
  criado_em          timestamptz not null default now()
);
create index if not exists enf_sae_presc_ep_idx on public.enf_sae_prescricoes (episodio_id, criado_em desc);

-- 5) PRESCRIÇÃO de enfermagem — itens (cuidados aprazados) ─────
create table if not exists public.enf_sae_prescricao_itens (
  id              uuid primary key default gen_random_uuid(),
  prescricao_id   uuid not null,
  episodio_id     uuid,
  prontuario      text,
  diagnostico_id  uuid,                    -- cuidado ligado ao diagnóstico
  catalogo_id     text,                    -- intervenção NIC de origem
  codigo_nic      text,
  descricao       text not null,           -- o cuidado / atividade
  detalhe         text,
  frequencia      text,                    -- rótulo: 6/6h, 2x/dia, por turno, SOS
  frequencia_dia  int,                     -- nº de vezes/dia (alimenta o aprazamento)
  intervalo_horas numeric,                 -- alternativa à frequência/dia
  se_necessario   boolean not null default false,     -- SOS: sem horário fixo
  horarios        jsonb not null default '[]'::jsonb, -- aprazamento "HH:MM"
  ordem           int not null default 0,
  usuario         text
);
create index if not exists enf_sae_presc_itens_idx on public.enf_sae_prescricao_itens (prescricao_id, ordem);

-- 6) CHECAGEM à beira-leito (execução do cuidado; técnico) ─────
create table if not exists public.enf_sae_checagem (
  id                 uuid primary key default gen_random_uuid(),
  prontuario         text not null,
  episodio_id        uuid,
  item_id            uuid not null,        -- enf_sae_prescricao_itens
  prescricao_id      uuid,
  competencia        date not null default current_date,
  horario_previsto   text,                 -- "HH:MM" do aprazamento (informativo)
  status             text not null default 'realizado',  -- realizado | nao_realizado
  motivo             text,                 -- quando não realizado
  observacao         text,
  executado_em       timestamptz not null default now(),
  executor_nome      text,                 -- nome congelado de quem checou
  categoria          text,
  conselho           text,
  registro_conselho  text,
  criado_em          timestamptz not null default now()
);
create index if not exists enf_sae_checagem_item_idx on public.enf_sae_checagem (item_id, executado_em desc);
create index if not exists enf_sae_checagem_ep_idx on public.enf_sae_checagem (episodio_id, competencia);

-- ── SEED do catálogo (RASCUNHO clínico — editável e "em validação") ──
-- Diagnósticos NANDA-I (payload: def=características definidoras, fat=fatores,
-- resultado=resultado esperado enxuto, intervencoes=slugs NIC ligados).
insert into public.enf_sae_catalogo (id, tipo, codigo, titulo, dominio, subtipo, unidades, payload, ordem) values
  ('dx_dor_aguda','diagnostico','00132','Dor aguda','Conforto','real','["clinica","uti","obst"]'::jsonb,'{"def":["Relato verbal ou por escala de dor","Expressão facial de dor","Alteração de sinais vitais"],"fat":["Agente lesivo biológico, físico ou químico","Procedimento cirúrgico"],"resultado":"Referir alívio da dor para escore menor ou igual a 3 na escala em 24h","intervencoes":["nic_controle_dor","nic_monitoracao_sinais"]}'::jsonb,1),
  ('dx_integridade_pele','diagnostico','00046','Integridade da pele prejudicada','Segurança e proteção','real','["clinica","uti"]'::jsonb,'{"def":["Lesão por pressão","Ruptura da superfície da pele","Eritema não branqueável"],"fat":["Imobilização física","Umidade excessiva","Pressão sobre proeminência óssea"],"resultado":"Apresentar cicatrização progressiva, sem novas lesões","intervencoes":["nic_prevencao_lpp","nic_cuidados_pele","nic_mudanca_decubito"]}'::jsonb,2),
  ('dx_risco_integridade_pele','diagnostico','00047','Risco de integridade da pele prejudicada','Segurança e proteção','risco','["clinica","uti","peds","obst"]'::jsonb,'{"fat":["Imobilização","Escala de Braden alterada","Umidade excessiva"],"resultado":"Manter a pele íntegra durante a internação","intervencoes":["nic_prevencao_lpp","nic_cuidados_pele","nic_mudanca_decubito"]}'::jsonb,3),
  ('dx_risco_infeccao','diagnostico','00004','Risco de infecção','Segurança e proteção','risco','["clinica","uti","peds","obst"]'::jsonb,'{"fat":["Dispositivo invasivo","Procedimento invasivo","Defesas primárias alteradas"],"resultado":"Permanecer sem sinais de infecção, no sítio e sistêmicos","intervencoes":["nic_controle_infeccao","nic_cuidados_dispositivo","nic_monitoracao_sinais"]}'::jsonb,4),
  ('dx_mobilidade_fisica','diagnostico','00085','Mobilidade física prejudicada','Atividade e repouso','real','["clinica","uti"]'::jsonb,'{"def":["Amplitude de movimento diminuída","Dificuldade para mudar de decúbito"],"fat":["Dor","Força muscular diminuída","Repouso prescrito"],"resultado":"Participar do plano de mobilização progressiva","intervencoes":["nic_mobilizacao","nic_mudanca_decubito"]}'::jsonb,5),
  ('dx_deficit_autocuidado_banho','diagnostico','00108','Déficit no autocuidado para banho','Atividade e repouso','real','["clinica","uti"]'::jsonb,'{"def":["Incapacidade de acessar o banheiro","Incapacidade de higienizar o corpo"],"fat":["Fraqueza","Restrição ao leito"],"resultado":"Ter a higiene corporal mantida diariamente","intervencoes":["nic_higiene"]}'::jsonb,6),
  ('dx_risco_queda_adulto','diagnostico','00303','Risco de queda em adulto','Segurança e proteção','risco','["clinica","uti"]'::jsonb,'{"fat":["Escala de Morse alterada","História de quedas","Uso de sedativos"],"resultado":"Não sofrer quedas durante a internação","intervencoes":["nic_prevencao_quedas","nic_monitoracao_sinais"]}'::jsonb,7),
  ('dx_risco_queda_crianca','diagnostico','00306','Risco de queda em criança','Segurança e proteção','risco','["peds"]'::jsonb,'{"fat":["Faixa etária","Grades do leito inadequadas","Supervisão insuficiente"],"resultado":"Não sofrer quedas; grades e supervisão mantidas","intervencoes":["nic_prevencao_quedas"]}'::jsonb,8),
  ('dx_padrao_respiratorio','diagnostico','00032','Padrão respiratório ineficaz','Atividade e repouso','real','["clinica","uti"]'::jsonb,'{"def":["Dispneia","Uso de musculatura acessória","Taquipneia"],"fat":["Dor","Fadiga","Ansiedade"],"resultado":"Manter padrão respiratório eficaz, com FR e SpO2 nos alvos","intervencoes":["nic_monitoracao_respiratoria","nic_monitoracao_sinais"]}'::jsonb,9),
  ('dx_desobstrucao_vias_aereas','diagnostico','00031','Desobstrução ineficaz de vias aéreas','Segurança e proteção','real','["clinica","uti","peds"]'::jsonb,'{"def":["Secreção excessiva","Tosse ineficaz","Ruídos adventícios"],"fat":["Via aérea artificial","Secreção retida"],"resultado":"Manter as vias aéreas pérvias","intervencoes":["nic_aspiracao_vias_aereas","nic_monitoracao_respiratoria"]}'::jsonb,10),
  ('dx_troca_gases','diagnostico','00030','Troca de gases prejudicada','Atividade e repouso','real','["uti","clinica"]'::jsonb,'{"def":["Hipoxemia","Cianose","Padrão respiratório anormal"],"fat":["Desequilíbrio ventilação-perfusão"],"resultado":"Manter oxigenação adequada, com SpO2 no alvo","intervencoes":["nic_monitoracao_respiratoria","nic_monitoracao_sinais"]}'::jsonb,11),
  ('dx_hipertermia','diagnostico','00007','Hipertermia','Segurança e proteção','real','["clinica","peds"]'::jsonb,'{"def":["Temperatura acima do parâmetro normal","Pele quente ao toque","Taquicardia"],"fat":["Processo de doença","Sepse"],"resultado":"Retornar a temperatura corporal aos parâmetros normais","intervencoes":["nic_controle_hipertermia","nic_monitoracao_sinais","nic_hidratacao"]}'::jsonb,12),
  ('dx_volume_liquidos_deficiente','diagnostico','00027','Volume de líquidos deficiente','Nutrição','real','["clinica","peds","obst"]'::jsonb,'{"def":["Turgor da pele diminuído","Mucosas secas","Débito urinário diminuído"],"fat":["Perda ativa de volume","Ingesta insuficiente"],"resultado":"Manter hidratação adequada, com diurese e mucosas normais","intervencoes":["nic_hidratacao","nic_monitoracao_sinais"]}'::jsonb,13),
  ('dx_eliminacao_urinaria','diagnostico','00016','Eliminação urinária prejudicada','Eliminação e troca','real','["clinica"]'::jsonb,'{"def":["Disúria","Retenção urinária","Urgência miccional"],"fat":["Infecção urinária","Obstrução","Cateter vesical"],"resultado":"Recuperar padrão de eliminação urinária adequado","intervencoes":["nic_controle_eliminacao","nic_controle_infeccao"]}'::jsonb,14),
  ('dx_constipacao','diagnostico','00011','Constipação','Eliminação e troca','real','["clinica"]'::jsonb,'{"def":["Frequência evacuatória diminuída","Fezes endurecidas","Esforço à evacuação"],"fat":["Imobilidade","Ingesta hídrica e de fibras reduzida","Uso de opioides"],"resultado":"Recuperar o padrão intestinal habitual","intervencoes":["nic_controle_intestinal","nic_hidratacao"]}'::jsonb,15),
  ('dx_nutricao_menor','diagnostico','00002','Nutrição desequilibrada: menor que as necessidades corporais','Nutrição','real','["clinica","peds"]'::jsonb,'{"def":["Ingesta alimentar inadequada","Perda de peso","Fraqueza muscular"],"fat":["Inapetência","Dificuldade de deglutição"],"resultado":"Alcançar ingesta nutricional adequada à necessidade","intervencoes":["nic_hidratacao","nic_monitoracao_sinais"]}'::jsonb,16),
  ('dx_conhecimento_deficiente','diagnostico','00126','Conhecimento deficiente','Percepção e cognição','real','["clinica","obst"]'::jsonb,'{"def":["Relato de dúvida","Seguimento inadequado de orientações"],"fat":["Informação insuficiente","Primeiro contato com a condição"],"resultado":"Verbalizar compreensão sobre o cuidado e o tratamento","intervencoes":["nic_ensino_processo_doenca"]}'::jsonb,17),
  ('dx_risco_sangramento','diagnostico','00206','Risco de sangramento','Segurança e proteção','risco','["uti","obst"]'::jsonb,'{"fat":["Alteração da coagulação","Pós-parto","Uso de anticoagulante"],"resultado":"Permanecer sem sinais de sangramento ativo","intervencoes":["nic_monitoracao_sangramento","nic_monitoracao_sinais"]}'::jsonb,18),
  ('dx_comunicacao_verbal','diagnostico','00051','Comunicação verbal prejudicada','Percepção e cognição','real','["uti"]'::jsonb,'{"def":["Incapacidade de falar","Uso de via aérea artificial"],"fat":["Intubação","Sedação"],"resultado":"Estabelecer comunicação efetiva por meio alternativo","intervencoes":["nic_monitoracao_sinais"]}'::jsonb,19),
  ('dx_amamentacao_ineficaz','diagnostico','00104','Amamentação ineficaz','Papéis e relacionamentos','real','["obst"]'::jsonb,'{"def":["Pega inadequada","Esvaziamento mamário insuficiente","Choro do lactente após a mamada"],"fat":["Inexperiência materna","Fissura mamária"],"resultado":"Estabelecer amamentação eficaz, com pega adequada","intervencoes":["nic_apoio_amamentacao","nic_ensino_processo_doenca"]}'::jsonb,20),
  -- Intervenções NIC (payload: atividades, frequencia rótulo, frequencia_dia p/ aprazamento, se_necessario p/ SOS).
  ('nic_controle_dor','intervencao','1400','Controle da dor',null,null,'[]'::jsonb,'{"atividades":["Avaliar a dor com escala validada","Aplicar medidas não farmacológicas de alívio","Administrar analgesia conforme prescrição médica e reavaliar"],"frequencia":"6/6h","frequencia_dia":4}'::jsonb,101),
  ('nic_prevencao_lpp','intervencao','3540','Prevenção de lesão por pressão',null,null,'[]'::jsonb,'{"atividades":["Realizar mudança de decúbito","Manter a pele limpa e hidratada","Usar superfície de redistribuição de pressão"],"frequencia":"2/2h","frequencia_dia":12}'::jsonb,102),
  ('nic_cuidados_pele','intervencao','3590','Supervisão da pele',null,null,'[]'::jsonb,'{"atividades":["Inspecionar a pele e as proeminências ósseas","Registrar alterações encontradas"],"frequencia":"por turno","frequencia_dia":3}'::jsonb,103),
  ('nic_mudanca_decubito','intervencao','0840','Posicionamento',null,null,'[]'::jsonb,'{"atividades":["Reposicionar o paciente conforme cronograma","Aliviar pontos de pressão com coxins"],"frequencia":"2/2h","frequencia_dia":12}'::jsonb,104),
  ('nic_mobilizacao','intervencao','0221','Terapia de exercício: deambulação',null,null,'[]'::jsonb,'{"atividades":["Auxiliar na deambulação progressiva","Estimular exercícios no leito"],"frequencia":"2x/dia","frequencia_dia":2}'::jsonb,105),
  ('nic_higiene','intervencao','1801','Auxílio no autocuidado: banho e higiene',null,null,'[]'::jsonb,'{"atividades":["Auxiliar no banho e na higiene oral","Preservar a privacidade do paciente"],"frequencia":"1x/dia","frequencia_dia":1}'::jsonb,106),
  ('nic_prevencao_quedas','intervencao','6490','Prevenção contra quedas',null,null,'[]'::jsonb,'{"atividades":["Manter grades elevadas e leito baixo e travado","Deixar a campainha ao alcance","Orientar paciente e acompanhante"],"frequencia":"por turno","frequencia_dia":3}'::jsonb,107),
  ('nic_controle_infeccao','intervencao','6540','Controle de infecção',null,null,'[]'::jsonb,'{"atividades":["Higienizar as mãos antes e após o contato","Usar técnica asséptica nos procedimentos","Monitorar sinais flogísticos nos sítios de inserção"],"frequencia":"por turno","frequencia_dia":3}'::jsonb,108),
  ('nic_cuidados_dispositivo','intervencao','3440','Cuidados com o local de inserção',null,null,'[]'::jsonb,'{"atividades":["Inspecionar o sítio de inserção","Trocar o curativo conforme protocolo","Avaliar a necessidade de permanência do dispositivo"],"frequencia":"por turno","frequencia_dia":3}'::jsonb,109),
  ('nic_monitoracao_respiratoria','intervencao','3350','Monitoração respiratória',null,null,'[]'::jsonb,'{"atividades":["Monitorar frequência, ritmo e esforço respiratório","Auscultar os sons pulmonares","Monitorar a SpO2"],"frequencia":"4/4h","frequencia_dia":6}'::jsonb,110),
  ('nic_aspiracao_vias_aereas','intervencao','3160','Aspiração de vias aéreas',null,null,'[]'::jsonb,'{"atividades":["Aspirar secreções com técnica asséptica quando indicado","Monitorar a SpO2 antes e após o procedimento"],"frequencia":"SOS","se_necessario":true}'::jsonb,111),
  ('nic_controle_hipertermia','intervencao','3740','Tratamento da febre',null,null,'[]'::jsonb,'{"atividades":["Monitorar a temperatura","Aplicar medidas de resfriamento","Administrar antitérmico conforme prescrição"],"frequencia":"4/4h","frequencia_dia":6}'::jsonb,112),
  ('nic_monitoracao_sinais','intervencao','6680','Monitoração de sinais vitais',null,null,'[]'::jsonb,'{"atividades":["Aferir e registrar os sinais vitais","Comunicar alterações à enfermeira"],"frequencia":"6/6h","frequencia_dia":4}'::jsonb,113),
  ('nic_hidratacao','intervencao','4120','Controle hídrico',null,null,'[]'::jsonb,'{"atividades":["Controlar a oferta e as perdas hídricas","Monitorar a diurese e o balanço"],"frequencia":"por turno","frequencia_dia":3}'::jsonb,114),
  ('nic_controle_eliminacao','intervencao','0590','Controle da eliminação urinária',null,null,'[]'::jsonb,'{"atividades":["Monitorar o padrão e as características da diurese","Estimular a ingesta hídrica quando permitido"],"frequencia":"por turno","frequencia_dia":3}'::jsonb,115),
  ('nic_controle_intestinal','intervencao','0430','Controle intestinal',null,null,'[]'::jsonb,'{"atividades":["Registrar a frequência e as características das evacuações","Estimular fibras e hidratação quando permitido"],"frequencia":"1x/dia","frequencia_dia":1}'::jsonb,116),
  ('nic_monitoracao_sangramento','intervencao','4010','Prevenção de sangramento',null,null,'[]'::jsonb,'{"atividades":["Monitorar sinais de sangramento","Avaliar o tônus uterino e os lóquios no pós-parto","Acompanhar os exames de coagulação"],"frequencia":"por turno","frequencia_dia":3}'::jsonb,117),
  ('nic_apoio_amamentacao','intervencao','1054','Assistência na amamentação',null,null,'[]'::jsonb,'{"atividades":["Orientar a pega e o posicionamento","Avaliar a mamada e o esvaziamento","Prevenir e tratar fissuras mamárias"],"frequencia":"por turno","frequencia_dia":3}'::jsonb,118),
  ('nic_ensino_processo_doenca','intervencao','5602','Ensino: processo da doença',null,null,'[]'::jsonb,'{"atividades":["Explicar a condição e o tratamento em linguagem acessível","Verificar a compreensão do paciente e da família"],"frequencia":"1x/dia","frequencia_dia":1}'::jsonb,119)
on conflict (id) do nothing;

-- Verificação
select 'enf SAE: catálogo semeado — ' || count(*) || ' itens (' ||
       count(*) filter (where tipo='diagnostico') || ' diagnósticos, ' ||
       count(*) filter (where tipo='intervencao') || ' intervenções)' as resultado
  from public.enf_sae_catalogo;


-- ┌────────────────────────────────────────────────────────────
-- │ 40/75 — migracao-pacientes-identificacao.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- IDENTIFICAÇÃO DO PACIENTE — conteúdo mínimo do prontuário
--
-- O QUE MUDA
-- `pacientes` tinha quatro campos: prontuario, iniciais, ano_nascimento e
-- sexo. Era uma escolha consciente de guardar pouco — mas deixa o sistema
-- em duas dívidas, e a segunda machuca antes da primeira:
--
--   1. LEGAL — a CFM 1.638/2002, art. 5º, I, "a", define o conteúdo mínimo
--      de identificação: nome completo, data de nascimento com dia/mês/ano,
--      sexo, NOME DA MÃE, NATURALIDADE (município e estado) e endereço
--      completo. A CFM 2.299/2021, art. 2º, exige o documento legal do
--      paciente nos documentos emitidos (receita, atestado, laudo).
--
--   2. CLÍNICA — guardar só o ANO obriga a calcular idade por subtração, e
--      o erro chega a 11 meses. Um bebê nascido em 20/12 é "1 ano" em
--      janeiro: a triagem pediátrica passa a avaliar os sinais vitais dele
--      contra a faixa de 12 meses, que é outra fisiologia. `data_nascimento`
--      é o que conserta isso.
--
-- SOBRE A LGPD — leia, porque muda a urgência de outra decisão
-- Guardar nome, CPF e filiação NÃO viola a LGPD: a base legal do dado
-- assistencial é a tutela da saúde (art. 11, II, "f"), e a minimização
-- (art. 6º, III) é "o mínimo necessário para a finalidade" — a finalidade
-- aqui é identificação exigida por norma. Não coletar é que descumpre a
-- CFM 1.638.
--
-- ⚠️ O que muda é a EXPOSIÇÃO. A política de SELECT desta tabela é
--    `using (true)`: qualquer usuário autenticado lê a tabela inteira pela
--    API. Até hoje isso expunha "J.S.M., 1957". Depois desta migração passa
--    a expor nome completo, CPF, nome da mãe e endereço.
--    Esta migração NÃO altera a política — apertar RLS no escuro tira
--    acesso de quem tem direito no meio do plantão, e a decisão é do
--    hospital. Mas a decisão deixou de ser arquitetura e virou urgência:
--    resolver ANTES do primeiro paciente real.
--    A tela já ajuda: `comoExibir()` mostra INICIAIS por padrão, e o nome
--    completo só onde a tarefa exige.
--
-- ⚠️ RODAR NO SQL EDITOR **ANTES** DO MERGE DO CÓDIGO.
--    Sem isso, a tela de cadastro abre e não grava.
--    É aditiva: só `add column if not exists` e índices. Nada é alterado
--    nem removido. Pode rodar duas vezes sem efeito colateral.
-- ═══════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════
-- 1) IDENTIFICAÇÃO (CFM 1.638/2002, art. 5º, I, "a")
-- ═══════════════════════════════════════════════════════════
alter table public.pacientes
  add column if not exists nome_completo text,

  -- Nome social: direito garantido no SUS (Decreto 8.727/2016; Portaria
  -- MS 2.836/2011). Não é apelido — é como a pessoa deve ser chamada e
  -- exibida. Chamar pelo nome de registro contra a vontade dela é
  -- constrangimento, não detalhe de cadastro.
  add column if not exists nome_social text,

  -- Data COMPLETA. `ano_nascimento` continua existindo e não é tocado:
  -- os cadastros antigos seguem funcionando enquanto alguém não completa.
  add column if not exists data_nascimento date,

  -- Filiação. O nome da mãe é o campo que mais desempata homônimo — e o
  -- mais esquecido nos cadastros.
  add column if not exists nome_mae text,
  add column if not exists nome_pai text,

  -- Naturalidade: a norma pede município E estado.
  add column if not exists naturalidade_municipio text,
  add column if not exists naturalidade_uf text,
  add column if not exists nacionalidade text,

  -- Raça/cor autodeclarada — quesito obrigatório nos sistemas de
  -- informação do SUS, e base dos indicadores de equidade.
  add column if not exists raca_cor text,   -- branca | preta | parda | amarela | indigena | nao_informado

  -- `sexo` (já existia) é o do registro civil, usado em referência clínica.
  -- Identidade de gênero é outra informação e não substitui a primeira:
  -- as faixas de exame e as condutas obstétricas dependem do primeiro
  -- campo, e o respeito à pessoa depende do segundo. Guardar os dois
  -- separados é o que permite acertar nos dois.
  add column if not exists identidade_genero text;


-- ═══════════════════════════════════════════════════════════
-- 2) DOCUMENTOS (CFM 2.299/2021, art. 2º + faturamento SUS)
-- ═══════════════════════════════════════════════════════════
alter table public.pacientes
  add column if not exists cpf text,
  add column if not exists rg text,
  add column if not exists rg_orgao_emissor text,
  -- Cartão Nacional de Saúde: sem ele o atendimento não fecha no SUS.
  add column if not exists cns text;


-- ═══════════════════════════════════════════════════════════
-- 3) ENDEREÇO (CFM 1.638/2002 — "endereço completo")
-- Em campos separados, não numa linha só: endereço em texto corrido não
-- vira indicador territorial, não agrupa por bairro e não exporta para a
-- RNDS sem alguém reprocessar à mão depois.
-- ═══════════════════════════════════════════════════════════
alter table public.pacientes
  add column if not exists end_logradouro text,
  add column if not exists end_numero text,
  add column if not exists end_complemento text,
  add column if not exists end_bairro text,
  add column if not exists end_municipio text,
  add column if not exists end_uf text,
  add column if not exists end_cep text,
  add column if not exists end_referencia text;


-- ═══════════════════════════════════════════════════════════
-- 4) CONTATO E RESPONSÁVEL
-- O responsável não é burocracia: menor de idade e paciente incapaz
-- precisam de quem consinta e de quem receba a alta.
-- ═══════════════════════════════════════════════════════════
alter table public.pacientes
  add column if not exists telefone text,
  add column if not exists telefone_alt text,
  add column if not exists email text,
  add column if not exists responsavel_nome text,
  add column if not exists responsavel_documento text,
  add column if not exists responsavel_parentesco text,
  add column if not exists responsavel_telefone text;


-- ═══════════════════════════════════════════════════════════
-- 5) SITUAÇÃO E CONTROLE
-- ═══════════════════════════════════════════════════════════
alter table public.pacientes
  -- Óbito registrado no cadastro evita o constrangimento de convocar para
  -- consulta quem faleceu — e é dado de desfecho.
  add column if not exists obito boolean not null default false,
  add column if not exists obito_em date,

  -- Quando o registro nasceu (o `updated_at` sozinho não conta essa
  -- história) e quem o completou.
  add column if not exists criado_em timestamptz not null default now(),
  add column if not exists cadastro_completo_em timestamptz,
  add column if not exists observacao text;


-- ═══════════════════════════════════════════════════════════
-- 6) ÍNDICES — busca e trava de duplicidade
--
-- Prontuário duplicado é o defeito mais caro de sistema hospitalar: metade
-- do histórico fica num registro, metade no outro, e o médico decide vendo
-- metade. O índice ÚNICO em CPF e CNS é a última linha de defesa, depois da
-- checagem que a tela faz antes de gravar.
--
-- Criado dentro de bloco com exceção de propósito: se o banco já tiver
-- duplicata, um `create unique index` normal ABORTARIA a migração inteira e
-- as colunas acima não seriam criadas. Aqui a migração termina de qualquer
-- jeito e avisa o que precisa ser limpo à mão.
-- ═══════════════════════════════════════════════════════════
create index if not exists pacientes_nome_idx on public.pacientes (lower(nome_completo));
create index if not exists pacientes_mae_idx  on public.pacientes (lower(nome_mae));
create index if not exists pacientes_nasc_idx on public.pacientes (data_nascimento);

do $$
begin
  begin
    create unique index if not exists pacientes_cpf_uniq
      on public.pacientes (cpf) where cpf is not null and cpf <> '';
  exception when others then
    raise notice 'ATENCAO: nao foi possivel criar indice unico de CPF (% ). Ha CPF duplicado na base - limpe e rode: create unique index pacientes_cpf_uniq on public.pacientes (cpf) where cpf is not null and cpf <> '''';', sqlerrm;
  end;

  begin
    create unique index if not exists pacientes_cns_uniq
      on public.pacientes (cns) where cns is not null and cns <> '';
  exception when others then
    raise notice 'ATENCAO: nao foi possivel criar indice unico de CNS (%).', sqlerrm;
  end;
end $$;


-- ═══════════════════════════════════════════════════════════
-- 7) CONFERÊNCIA
-- Rode depois de aplicar. Espera-se 1 linha com as contagens.
-- ═══════════════════════════════════════════════════════════
select
  count(*)                                                as pacientes,
  count(*) filter (where nome_completo   is not null)     as com_nome,
  count(*) filter (where data_nascimento is not null)     as com_data_nascimento,
  count(*) filter (where nome_mae        is not null)     as com_nome_da_mae,
  count(*) filter (where cpf             is not null)     as com_cpf,
  count(*) filter (where cns             is not null)     as com_cartao_sus
from public.pacientes;


-- ┌────────────────────────────────────────────────────────────
-- │ 41/75 — migracao-atendimento-recepcao.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- ATENDIMENTO / RECEPÇÃO — a porta de entrada do hospital
--
-- O QUE MUDA
-- O sistema tinha a FICHA do paciente (migracao-pacientes-identificacao)
-- mas não tinha a PORTA. Hoje a recepção do PS digita iniciais e um número
-- de prontuário à mão, e nada garante que esse número corresponda a alguém
-- cadastrado. Três consequências, todas já presentes na base:
--
--   1. ATENDIMENTO ÓRFÃO — `ps_atendimentos.prontuario` é texto livre sem
--      referência. Um atendimento pode apontar para um prontuário que não
--      existe em `pacientes`, e o Paciente 360 abre vazio.
--
--   2. NÚMERO INVENTADO — ninguém emite o prontuário. Dois recepcionistas
--      podem escolher o mesmo número, e o mesmo paciente pode ganhar dois
--      números em duas visitas. O índice único de CPF/CNS criado na
--      migração anterior só protege quem já foi cadastrado; a porta não.
--
--   3. VÍNCULO POR STRING — um espaço a mais ou um zero à esquerda separa
--      o histórico da pessoa em dois. Fundir depois é operação de risco.
--
-- O QUE ESTA MIGRAÇÃO FAZ, NESTA ORDEM (a ordem importa)
--   1. Acrescenta em `pacientes` o que a recepção precisa registrar.
--   2. NORMALIZA os prontuários já gravados (trim; vazio vira NULL).
--   3. CRIA o cadastro que falta para todo atendimento/leito órfão.
--   4. Só então liga a CHAVE ESTRANGEIRA.
--   5. Cria a sequência e a função que EMITEM o próximo prontuário.
--
-- ⚠️ POR QUE O BACKFILL (passo 3) NÃO É OPCIONAL
--    Uma FK criada com `not valid` não confere as linhas antigas — mas
--    confere qualquer linha que for ATUALIZADA depois. E o PS atualiza a
--    linha do atendimento o tempo todo (triagem, início do atendimento,
--    desfecho). Sem o backfill, a primeira triagem de um paciente que já
--    estava na fila falharia — no meio do plantão, sem explicação na tela.
--    Por isso aqui se cria o cadastro que falta ANTES de ligar a trava.
--
--    Os cadastros criados assim ficam marcados com `origem_cadastro =
--    'backfill'` e sem nome: aparecem na tela como identificação pendente,
--    que é a verdade. O que a migração NÃO faz é inventar dado de pessoa.
--
-- ⚠️ RODAR NO SQL EDITOR **ANTES** DO MERGE DO CÓDIGO.
--    Sem isso, a tela de Atendimento abre e não consegue emitir prontuário.
--    É aditiva: `add column if not exists`, backfill idempotente e criação
--    condicional de constraint. Pode rodar duas vezes sem efeito colateral.
-- ═══════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════
-- 1) O QUE A RECEPÇÃO REGISTRA
-- ═══════════════════════════════════════════════════════════
alter table public.pacientes
  -- Paciente que chega sem condição de se identificar (inconsciente, sem
  -- documento, sem acompanhante). A CFM 1.638/2002, art. 5º, I, "e", prevê
  -- o atendimento em que a anamnese não é possível — o que não se pode é
  -- deixar de registrar. Aqui ele entra com prontuário emitido e este
  -- marcador; a identificação é completada depois, sem perder o vínculo do
  -- que já foi feito com ele.
  add column if not exists nao_identificado boolean not null default false,

  -- Quando a identificação foi concluída. Enquanto for NULL num paciente
  -- marcado acima, o caso está aberto — é o que alimenta a lista de
  -- pendências da recepção.
  add column if not exists identificado_em timestamptz,

  -- De onde veio este cadastro: 'recepcao' (alguém cadastrou na porta),
  -- 'backfill' (criado por esta migração a partir de um atendimento órfão)
  -- ou NULL (cadastro anterior a este controle). Sem isso, daqui a seis
  -- meses ninguém distingue o registro que uma pessoa conferiu do registro
  -- que um script deduziu.
  add column if not exists origem_cadastro text;


-- ═══════════════════════════════════════════════════════════
-- 2) NORMALIZAÇÃO — antes de comparar, limpar
--
-- ' 48213' e '48213' são a mesma pessoa para o ser humano e duas chaves
-- diferentes para o banco. A FK do passo 4 recusaria a primeira. Vazio
-- vira NULL: string vazia exigiria um paciente de prontuário '' para
-- satisfazer a chave, o que não existe e não deve existir.
-- ═══════════════════════════════════════════════════════════
update public.ps_atendimentos
   set prontuario = nullif(trim(prontuario), '')
 where prontuario is distinct from nullif(trim(prontuario), '');

update public.leitos
   set prontuario = nullif(trim(prontuario), '')
 where prontuario is distinct from nullif(trim(prontuario), '');

update public.pacientes
   set prontuario = trim(prontuario)
 where prontuario <> trim(prontuario);


-- ═══════════════════════════════════════════════════════════
-- 3) BACKFILL — todo atendimento passa a ter paciente
--
-- `distinct on` com `order by ... chegada_em desc` pega as iniciais do
-- registro MAIS RECENTE daquele prontuário: se alguém corrigiu a digitação
-- na última visita, é a versão corrigida que vira cadastro.
-- ═══════════════════════════════════════════════════════════
insert into public.pacientes (prontuario, iniciais, origem_cadastro, usuario, updated_at)
select distinct on (a.prontuario)
       a.prontuario,
       coalesce(nullif(trim(a.iniciais), ''), '?'),
       'backfill',
       'migracao-atendimento-recepcao',
       now()
  from public.ps_atendimentos a
 where a.prontuario is not null
   and not exists (select 1 from public.pacientes p where p.prontuario = a.prontuario)
 order by a.prontuario, a.chegada_em desc
on conflict (prontuario) do nothing;

-- Mesma coisa pelo lado da internação: um leito ocupado por prontuário que
-- nunca virou cadastro é o mesmo buraco visto de outro módulo.
insert into public.pacientes (prontuario, iniciais, origem_cadastro, usuario, updated_at)
select distinct on (l.prontuario)
       l.prontuario,
       coalesce(nullif(trim(l.iniciais), ''), '?'),
       'backfill',
       'migracao-atendimento-recepcao',
       now()
  from public.leitos l
 where l.prontuario is not null
   and not exists (select 1 from public.pacientes p where p.prontuario = l.prontuario)
 order by l.prontuario, l.updated_at desc nulls last
on conflict (prontuario) do nothing;


-- ═══════════════════════════════════════════════════════════
-- 4) A TRAVA MORA EM OUTRO ARQUIVO — E ISSO É DE PROPÓSITO
--
-- A chave estrangeira de ps_atendimentos → pacientes está em
-- `migracao-atendimento-fk.sql`, que se roda DEPOIS do merge do código.
--
-- POR QUE A ORDEM INVERTE AQUI
-- A regra da casa é rodar o SQL ANTES do merge, porque o código novo grava
-- em coluna nova. Uma CONSTRAINT é o contrário: ela cobra do código que
-- está no ar. O formulário de chegada do PS que está hoje na `main` aceita
-- prontuário digitado à mão, sem conferir se existe — com a FK no lugar,
-- esse INSERT passa a ser recusado, e o sbFetch devolve `null` sem alarde.
-- A recepcionista clicaria em "Registrar chegada" e o paciente não entraria
-- na fila da triagem.
--
-- Este arquivo é 100% aditivo: nenhuma linha dele pode recusar uma escrita
-- do código antigo. Pode rodar quando quiser.
-- ═══════════════════════════════════════════════════════════
create index if not exists ps_atendimentos_prontuario_idx
  on public.ps_atendimentos (prontuario);


-- ═══════════════════════════════════════════════════════════
-- 5) EMISSÃO DO PRONTUÁRIO — o número deixa de ser inventado
--
-- A sequência continua de onde a numeração do hospital já estava: começa
-- acima do maior prontuário CONFIÁVEL que existe. Prontuários alfanuméricos
-- ("T9035") entram pela parte numérica.
--
-- O piso de 1000 evita emitir prontuário de um dígito num hospital que
-- ainda tem poucos cadastros — número curto é fácil de confundir na fala
-- e no papel.
--
-- "Confiável" faz muito trabalho nessa frase. Ver o bloco abaixo.
-- ═══════════════════════════════════════════════════════════
create sequence if not exists public.prontuario_seq as bigint;

-- ⚠️ O QUE **NÃO** PODE ANCORAR A SEQUÊNCIA — descoberto rodando no demo
--
-- A primeira versão disto olhava TODOS os pacientes. Resultado no banco de
-- teste: a sequência parou em 990001 e o próximo prontuário do hospital
-- seria 990002.
--
-- A causa é uma corrente de dois passos que só aparece junta:
--   1. alguém digitou "990001" no campo prontuário da chegada do PS;
--   2. o backfill (passo 3) transformou isso num cadastro de verdade;
--   3. a sequência então ancorou nesse cadastro.
--
-- Ou seja: QUALQUER número digitado errado no PS viraria a âncora de toda
-- a numeração futura do hospital. Um CPF digitado no campo errado (11
-- dígitos, passa no filtro de tamanho) faria os prontuários reais nascerem
-- em 52.998.224.726.
--
-- Duas defesas, e a segunda é a que importa:
--
--   `origem_cadastro is distinct from 'backfill'` — cadastro que o backfill
--   deduziu de um atendimento órfão não é fonte confiável de numeração.
--   Ninguém conferiu aquele número; ele existe só para o histórico não se
--   perder. Cadastro que uma pessoa criou, sim, ancora.
--
--   `length(...) <= 6` — prontuário de hospital não tem sete dígitos. Isso
--   segura CPF, CNS, telefone e data digitados no campo errado, inclusive
--   nos cadastros antigos, que não têm `origem_cadastro` preenchido.
--
-- E a rede de segurança final é o laço em `proximo_prontuario()`: se
-- mesmo assim o número calculado colidir com um prontuário existente, ele
-- pula para o próximo em vez de devolver um número que o INSERT recusaria.
-- É por causa desse laço que ancorar baixo demais é seguro — e ancorar
-- alto demais, não.
do $$
declare maior bigint;
begin
  select coalesce(max(n), 0) into maior
    from (
      select (regexp_replace(prontuario, '[^0-9]', '', 'g'))::bigint as n
        from public.pacientes
       where prontuario ~ '[0-9]'
         and length(regexp_replace(prontuario, '[^0-9]', '', 'g')) between 1 and 6
         and origem_cadastro is distinct from 'backfill'
    ) t;
  perform setval('public.prontuario_seq', greatest(maior, 1000), true);
end $$;

-- `security definer` para a recepção não precisar de permissão direta na
-- sequência. O laço é seguro-contra-colisão: se o número sorteado já
-- existir como prontuário digitado à mão, pula para o próximo em vez de
-- devolver um número que o INSERT recusaria depois.
create or replace function public.proximo_prontuario()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidato text;
  tentativas int := 0;
begin
  loop
    candidato := nextval('public.prontuario_seq')::text;
    exit when not exists (select 1 from public.pacientes where prontuario = candidato);
    tentativas := tentativas + 1;
    -- Teto para o laço não virar espera infinita se a sequência for
    -- reposicionada muito abaixo da numeração real. Falhar com uma
    -- mensagem que diz o que fazer é melhor do que a recepção olhando
    -- uma tela travada com o paciente no balcão.
    if tentativas > 10000 then
      raise exception 'Nao foi possivel emitir prontuario: 10000 numeros seguidos ja estao em uso a partir de %. Reposicione a sequencia com: select setval(''public.prontuario_seq'', <maior numero em uso>, true);', candidato;
    end if;
  end loop;
  return candidato;
end;
$$;

revoke all on function public.proximo_prontuario() from public;
grant execute on function public.proximo_prontuario() to authenticated;


-- ═══════════════════════════════════════════════════════════
-- 6) NATUREZA DO ATENDIMENTO
--
-- A recepção precisa dizer O QUE está abrindo. Hoje todo `ps_atendimentos`
-- é emergência por construção; a coluna registra isso explicitamente e
-- abre caminho para o atendimento ambulatorial sem outra migração de
-- estrutura depois.
--
-- Não confundir com `triagem_tipo` (adulto | obstetrica | pediatrica), que
-- é o protocolo de triagem, nem com `ps_registros.tipo`, que é o tipo do
-- registro clínico.
-- ═══════════════════════════════════════════════════════════
alter table public.ps_atendimentos
  add column if not exists tipo_atendimento text not null default 'emergencia';


-- ═══════════════════════════════════════════════════════════
-- 6.5) ACESSO AO MÓDULO NOVO
--
-- Sem isto a feature sobe INVISÍVEL. `migracao-perfis-acesso.sql` também
-- ganhou estas linhas — mas ela já foi aplicada nos bancos que existem, e
-- editar um script já rodado não muda banco nenhum. Quem só rodasse aquele
-- arquivo teria o módulo num banco novo e não teria nos atuais.
--
-- 'provisorio' está na lista por um motivo prático: hoje é o perfil de
-- quase toda a equipe. Sem o grant nele, o menu não apareceria para
-- ninguém até a reclassificação terminar.
--
-- Nível por perfil, e o porquê:
--   escrita  — recepção (é o dono da tela), enfermeiro (admite à noite,
--              quando não há recepcionista), TI e provisório.
--   leitura  — médico, técnico, faturamento, gestão e diretor técnico:
--              precisam CONSULTAR quem é quem, não abrir atendimento.
-- ═══════════════════════════════════════════════════════════
-- O `where exists` não é excesso de zelo: `perfis_permissoes` tem chave
-- estrangeira para `perfis_acesso`, e um INSERT direto abortaria o script
-- inteiro num banco onde algum destes perfis não existe — levando junto a
-- conferência do passo 7. Assim, perfil que não existe é pulado.
do $$
begin
  if to_regclass('public.perfis_permissoes') is null then
    raise notice 'perfis_permissoes nao existe neste banco - rode migracao-perfis-acesso.sql antes. Modulo Atendimento ficara invisivel ate la.';
    return;
  end if;

  insert into public.perfis_permissoes (perfil_chave, modulo, nivel)
  select v.perfil, 'atendimento', v.nivel
    from (values
            ('recepcao','escrita'),
            ('enfermeiro','escrita'),
            ('ti','escrita'),
            ('provisorio','escrita'),
            ('medico','leitura'),
            ('tecnico_enfermagem','leitura'),
            ('faturamento','leitura'),
            ('gestao','leitura'),
            ('diretor_tecnico','leitura')
         ) as v(perfil, nivel)
   where exists (select 1 from public.perfis_acesso pa where pa.chave = v.perfil)
  on conflict (perfil_chave, modulo) do nothing;
end $$;


-- ═══════════════════════════════════════════════════════════
-- 7) CONFERÊNCIA
-- Rode depois de aplicar. Espera-se `orfaos = 0` na segunda consulta.
-- ═══════════════════════════════════════════════════════════
select
  count(*)                                                   as pacientes,
  count(*) filter (where origem_cadastro = 'backfill')       as criados_pelo_backfill,
  count(*) filter (where nao_identificado)                   as nao_identificados,
  count(*) filter (where nome_completo is not null)          as com_nome
from public.pacientes;

select count(*) as orfaos
  from public.ps_atendimentos a
 where a.prontuario is not null
   and not exists (select 1 from public.pacientes p where p.prontuario = a.prontuario);

-- Onde a emissão está. Consultar `last_value` NÃO consome número.
select last_value as ultimo_prontuario_emitido from public.prontuario_seq;

-- Para provar que a função responde (permissão, search_path), rode a linha
-- abaixo à mão. Ela CONSOME um número da sequência — o que é inofensivo
-- (número pulado não faz falta), mas não é para deixar num script que
-- alguém roda duas vezes por precaução.
--   select public.proximo_prontuario();


-- ┌────────────────────────────────────────────────────────────
-- │ 42/75 — migracao-atendimento-fk.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- ATENDIMENTO — A TRAVA (chave estrangeira ps_atendimentos → pacientes)
--
-- ⚠️ ESTE ARQUIVO RODA **DEPOIS** DO MERGE DO CÓDIGO.
--    É o único do repositório em que a ordem se inverte, então vale ler o
--    porquê antes de rodar.
--
-- A regra da casa é rodar o SQL ANTES do merge, porque o código novo grava
-- em coluna nova — sem a coluna, a tela abre e não salva. Uma CONSTRAINT é
-- o contrário: ela não serve o código novo, ela COBRA do código que está no
-- ar.
--
-- O QUE ACONTECE SE ISTO RODAR CEDO DEMAIS
-- O formulário de chegada do PS anterior a esta feature aceita prontuário
-- digitado à mão sem conferir se existe. Com a FK no lugar, o PostgREST
-- recusa esse INSERT e o `sbFetch` devolve `null` sem alarde: a
-- recepcionista clica em "Registrar chegada", o formulário limpa, e o
-- paciente NÃO entra na fila da triagem. Ninguém é chamado.
--
-- O código que acompanha esta migração fecha esse buraco — a chegada do PS
-- passa a conferir se o prontuário existe e manda para a Recepção quando
-- não existe. Por isso: primeiro o código, depois esta trava.
--
-- ORDEM CORRETA
--   1. `migracao-atendimento-recepcao.sql` no banco   (aditiva, pode rodar já)
--   2. merge do código na main + deploy
--   3. ESTE ARQUIVO no banco
--
-- É idempotente: pode rodar duas vezes sem efeito colateral.
-- ═══════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════
-- 1) NORMALIZAR E PREENCHER DE NOVO
--
-- A migração anterior já fez isto. Repete-se aqui porque entre uma e outra
-- passaram-se dias, e nesse intervalo o código antigo continuou aceitando
-- prontuário digitado à mão. Órfão criado ontem à noite aborta o passo 2 e
-- deixa a trava sem instalar — melhor limpar imediatamente antes.
-- ═══════════════════════════════════════════════════════════
update public.ps_atendimentos
   set prontuario = nullif(trim(prontuario), '')
 where prontuario is distinct from nullif(trim(prontuario), '');

update public.leitos
   set prontuario = nullif(trim(prontuario), '')
 where prontuario is distinct from nullif(trim(prontuario), '');

insert into public.pacientes (prontuario, iniciais, origem_cadastro, usuario, updated_at)
select distinct on (a.prontuario)
       a.prontuario,
       coalesce(nullif(trim(a.iniciais), ''), '?'),
       'backfill',
       'migracao-atendimento-fk',
       now()
  from public.ps_atendimentos a
 where a.prontuario is not null
   and not exists (select 1 from public.pacientes p where p.prontuario = a.prontuario)
 order by a.prontuario, a.chegada_em desc
on conflict (prontuario) do nothing;


-- ═══════════════════════════════════════════════════════════
-- 2) A TRAVA
--
-- Sem `on update cascade` DE PROPÓSITO. Trocar o número do prontuário
-- parece inofensivo e não é: `leitos`, `cc_cirurgias`, `scih_casos`,
-- `pep_*` e `enf_*` guardam o mesmo número como texto solto e NÃO seriam
-- levados junto. Melhor a troca ser recusada aqui, à vista, do que
-- espalhar um histórico partido por seis tabelas.
--
-- O `exception` existe para a falha não levar junto a conferência do passo
-- 3, que é justamente o que diz onde está o problema.
-- ═══════════════════════════════════════════════════════════
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'ps_atendimentos_paciente_fk'
       and conrelid = 'public.ps_atendimentos'::regclass
  ) then
    alter table public.ps_atendimentos
      add constraint ps_atendimentos_paciente_fk
      foreign key (prontuario) references public.pacientes (prontuario);
  end if;
exception when others then
  raise notice 'ATENCAO: nao foi possivel criar a FK (%). Rode a conferencia do passo 3 para achar o prontuario orfao.', sqlerrm;
end $$;


-- ═══════════════════════════════════════════════════════════
-- 3) CONFERÊNCIA
-- Espera-se `orfaos = 0` e `trava_instalada = true`.
-- ═══════════════════════════════════════════════════════════
select count(*) as orfaos
  from public.ps_atendimentos a
 where a.prontuario is not null
   and not exists (select 1 from public.pacientes p where p.prontuario = a.prontuario);

select exists (
  select 1 from pg_constraint
   where conname = 'ps_atendimentos_paciente_fk'
     and conrelid = 'public.ps_atendimentos'::regclass
) as trava_instalada;


-- ┌────────────────────────────────────────────────────────────
-- │ 43/75 — migracao-nsp-incidentes.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- NSP — Núcleo de Segurança do Paciente (Fase 2a): notificação de incidentes
--
-- Base normativa: RDC 36/2013 (ANVISA) — NSP e notificação de incidentes
-- obrigatórios; PNSP / Portaria MS 529/2013 — cultura de segurança e metas.
-- A notificação é o coração do NSP: qualquer profissional notifica (inclusive
-- ANÔNIMO), o núcleo tria e classifica.
--
-- 2 tabelas:
--   • nsp_incidentes         — a notificação/incidente (classe, tipo, grau de
--                              dano OMS, origem ligada ao paciente/leito, matriz
--                              de risco, status). `numero` é o número humano.
--   • nsp_incidente_eventos  — trilha append-only (triagem, classificação,
--                              comentário, feedback, mudança de status).
--
-- DIFERENCIAL: `origem_*` liga o evento à sua origem (prescrição, checagem,
-- escala Morse/queda, LPP com POA, flebite — Fase 1). `origem_ref` guarda um
-- snapshot congelado do contexto.
--
-- Anonimato: quando `anonimo=true`, `notificado_por` fica nulo. É deliberado —
-- cultura justa (não-punitiva) aumenta a notificação.
--
-- Registro de segurança é append-only (correção = novo registro com corrige_id).
-- `status` é estado de fluxo do núcleo (como o do episódio) e pode ser atualizado,
-- sempre deixando rastro em nsp_incidente_eventos. Aditiva e idempotente.
-- Rodar no SQL Editor — DEMO primeiro, depois HNSN.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.nsp_incidentes (
  id                 uuid primary key default gen_random_uuid(),
  numero             bigint generated always as identity,  -- número humano (INC-<numero>)
  classe             text not null,          -- circunstancia_risco|near_miss|incidente_sem_dano|evento_adverso|never_event
  tipo               text,                   -- medicacao|queda|lpp|identificacao|cirurgico|dispositivo|...
  grau_dano          text,                   -- nenhum|leve|moderado|grave|obito (taxonomia OMS)
  descricao          text not null,
  acoes_imediatas    text,                   -- o que já foi feito na hora
  local_setor        text,
  leito              text,
  ocorrido_em        timestamptz,
  detectado_em       timestamptz,
  -- origem ligada (diferencial): de onde o evento nasceu
  prontuario         text,
  episodio_id        uuid,
  origem_tipo        text,                   -- manual|prescricao|checagem|escala_morse|lpp|flebite|...
  origem_id          text,
  origem_ref         jsonb,                  -- snapshot congelado do contexto
  -- matriz de risco (probabilidade × gravidade)
  probabilidade      int,
  gravidade          int,
  risco_score        int,
  risco_faixa        text,                   -- baixo|moderado|alto|extremo
  -- notificação
  anonimo            boolean not null default false,
  notificado_por     text,                   -- nulo quando anônimo
  categoria          text,
  conselho           text,
  registro_conselho  text,
  notificacao_compulsoria boolean not null default false,  -- never event / óbito → ANVISA
  -- fluxo do núcleo
  status             text not null default 'nova',  -- nova|em_analise|classificada|em_tratamento|concluida
  exige_rca          boolean not null default false,
  corrige_id         uuid,
  motivo_correcao    text,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);
create index if not exists nsp_inc_status_idx on public.nsp_incidentes (status, criado_em desc);
create index if not exists nsp_inc_pront_idx  on public.nsp_incidentes (prontuario, criado_em desc);
create index if not exists nsp_inc_tipo_idx   on public.nsp_incidentes (tipo, criado_em desc);

create table if not exists public.nsp_incidente_eventos (
  id            uuid primary key default gen_random_uuid(),
  incidente_id  uuid not null,
  tipo          text not null,          -- triagem|classificacao|comentario|feedback|status|encaminhamento
  de_status     text,
  para_status   text,
  texto         text,
  usuario       text,
  categoria     text,
  criado_em     timestamptz not null default now()
);
create index if not exists nsp_inc_ev_idx on public.nsp_incidente_eventos (incidente_id, criado_em);

-- Verificação
select 'NSP: nsp_incidentes + nsp_incidente_eventos ok' as resultado;


-- ┌────────────────────────────────────────────────────────────
-- │ 44/75 — migracao-atendimento-fase2.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- ATENDIMENTO FASE 2 — A FICHA: quem paga, que tipo, para onde
--
-- A fase 1 resolveu QUEM É o paciente. Esta resolve o resto do que o
-- balcão precisa registrar para o atendimento existir para o hospital:
-- fonte pagadora, tipo, especialidade, destino e procedimento.
--
-- POR QUE ISSO NÃO É "UNS CAMPOS A MAIS"
-- Sem fonte pagadora, as três recepções do hospital (SUS, convênios e
-- ambulatório) são a mesma tela sem distinção — e nada do que é feito no
-- paciente vira conta. É o campo que decide qual tabela de preço vale, se
-- precisa de autorização, e se a produção sai em BPA ou em guia TISS.
--
-- ═══════════════════════════════════════════════════════════
-- A DECISÃO QUE ORGANIZA ESTA MIGRAÇÃO: CATÁLOGO É DADO, NÃO CÓDIGO
--
-- Nenhum convênio, plano, especialidade ou procedimento está escrito aqui
-- dentro. As tabelas nascem VAZIAS (fora os domínios que são padrão
-- nacional, no passo 5).
--
-- Não é preguiça — é o que separa um sistema de um hospital só. Convênio
-- do HNSN não é convênio do hospital vizinho; tabela de preço muda por
-- contrato e por ano. Cravar isso em código transforma cada negociação
-- comercial num deploy. No MV esse cadastro é do analista comercial, pelo
-- menu Tabelas, e é assim que tem que ser aqui.
--
-- CONSEQUÊNCIA IMPORTANTE PARA A TELA: enquanto um catálogo estiver
-- vazio, o campo correspondente **não pode bloquear**. Se a recepção não
-- consegue abrir atendimento porque ninguém cadastrou convênio ainda, o
-- sistema para o hospital. A tela mostra o campo como pendência visível e
-- deixa passar — a mesma regra do cadastro do paciente.
--
-- ⚠️ RODAR NO SQL EDITOR ANTES DO MERGE DO CÓDIGO.
--    Aditiva e idempotente: só `create table if not exists` e
--    `add column if not exists`. Nenhuma constraint que cobre do código
--    que já está no ar — diferente da FK da fase 1, esta pode rodar antes
--    do merge sem risco.
-- ═══════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════
-- 1) CONVÊNIOS — a fonte pagadora
--
-- `tipo` é o campo que mais trabalha nesta tabela. Ele não é rótulo: é o
-- que diz ao sistema QUAIS REGRAS valem.
--   sus        — não tem carteira nem senha; exige CNS e CBO compatível;
--                o paciente NUNCA pode ser cobrado (regra dura)
--   convenio   — exige carteira e validade; procedimento exige autorização;
--                pode ter coparticipação cobrada do paciente
--   particular — o próprio paciente paga; não há guia nem glosa
-- ═══════════════════════════════════════════════════════════
create table if not exists public.at_convenios (
  id bigserial primary key,
  codigo text not null unique,
  nome text not null,
  tipo text not null default 'convenio',   -- sus | convenio | particular
  -- Estas duas existem para a tela saber o que cobrar SEM ter regra de
  -- convênio escrita em JavaScript. Convênio novo com exigência diferente
  -- é cadastro, não release.
  exige_carteira boolean not null default true,
  exige_autorizacao boolean not null default false,
  registro_ans text,                       -- operadora na ANS (padrão TISS)
  observacao text,
  ativo boolean not null default true,
  usuario text,
  criado_em timestamptz not null default now(),
  updated_at timestamptz default now()
);
create index if not exists at_convenios_ativo_idx on public.at_convenios (ativo, nome);

alter table public.at_convenios enable row level security;
drop policy if exists at_conv_select on public.at_convenios;
drop policy if exists at_conv_write on public.at_convenios;
create policy at_conv_select on public.at_convenios for select to authenticated using (true);
create policy at_conv_write on public.at_convenios for all to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));


-- ═══════════════════════════════════════════════════════════
-- 2) PLANOS — o desdobramento do convênio
--
-- Um convênio tem vários planos, e é o PLANO que costuma definir
-- acomodação, coparticipação e tabela de preço. Por isso plano é tabela
-- própria com referência ao convênio, e não um texto solto: escolher o
-- plano errado é a origem clássica da glosa.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.at_planos (
  id bigserial primary key,
  convenio_id bigint not null references public.at_convenios (id) on delete cascade,
  codigo text not null,
  nome text not null,
  acomodacao text,                         -- enfermaria | apartamento | ...
  coparticipacao boolean not null default false,
  ativo boolean not null default true,
  usuario text,
  updated_at timestamptz default now(),
  unique (convenio_id, codigo)
);
create index if not exists at_planos_convenio_idx on public.at_planos (convenio_id, ativo);

alter table public.at_planos enable row level security;
drop policy if exists at_plan_select on public.at_planos;
drop policy if exists at_plan_write on public.at_planos;
create policy at_plan_select on public.at_planos for select to authenticated using (true);
create policy at_plan_write on public.at_planos for all to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));


-- ═══════════════════════════════════════════════════════════
-- 3) DOMÍNIOS — as listas simples, numa tabela só
--
-- Tipo de atendimento, tipo de paciente, especialidade, local de
-- procedência, unidade de origem e destino têm a MESMA forma: código,
-- nome, ordem, ativo. Seis tabelas idênticas dariam seis telas idênticas
-- de cadastro e seis lugares para esquecer de dar manutenção.
--
-- `dominio` diz de qual lista a linha é. É o mesmo desenho do menu
-- "Tabelas" do MV: uma tela, um seletor de qual tabela se está editando.
--
-- `extras` guarda o que é específico de um domínio sem inventar coluna que
-- fica nula nos outros cinco — por exemplo, se um tipo de atendimento
-- conta como primeira consulta ou como retorno.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.at_dominios (
  id bigserial primary key,
  dominio text not null,     -- tipo_atendimento | tipo_paciente | especialidade
                             -- local_procedencia | unidade_origem | destino
                             -- carater | meio_chegada
  codigo text not null,
  nome text not null,
  ordem int not null default 0,
  extras jsonb not null default '{}'::jsonb,
  ativo boolean not null default true,
  -- `sistema` marca a linha que veio do padrão nacional e não deveria ser
  -- apagada por engano — some da tela de exclusão, não da de edição.
  sistema boolean not null default false,
  usuario text,
  updated_at timestamptz default now(),
  unique (dominio, codigo)
);
create index if not exists at_dominios_lista_idx on public.at_dominios (dominio, ativo, ordem);

alter table public.at_dominios enable row level security;
drop policy if exists at_dom_select on public.at_dominios;
drop policy if exists at_dom_write on public.at_dominios;
create policy at_dom_select on public.at_dominios for select to authenticated using (true);
create policy at_dom_write on public.at_dominios for all to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));


-- ═══════════════════════════════════════════════════════════
-- 4) PROCEDIMENTOS — e a compatibilidade com o CBO
--
-- `cbos_compativeis` é o campo que evita o erro mais caro e mais silencioso
-- do faturamento SUS: cada procedimento do SIGTAP só aceita ser executado
-- por determinadas ocupações. CBO fora da lista NÃO gera glosa — gera
-- REJEIÇÃO no processamento, e a produção simplesmente não entra. No fim
-- do mês alguém procura o atendimento que "sumiu".
--
-- Guardado como array de texto porque a lista vem pronta do SIGTAP; a tela
-- só confere se o CBO do profissional está nela. Vazio = ninguém cadastrou
-- ainda, e aí não há o que conferir (não bloqueia).
-- ═══════════════════════════════════════════════════════════
create table if not exists public.at_procedimentos (
  id bigserial primary key,
  codigo text not null unique,             -- SIGTAP (SUS) ou TUSS (convênio)
  tabela text not null default 'sigtap',   -- sigtap | tuss | proprio
  nome text not null,
  cbos_compativeis text[] not null default '{}',
  ativo boolean not null default true,
  usuario text,
  updated_at timestamptz default now()
);
create index if not exists at_proc_ativo_idx on public.at_procedimentos (ativo, nome);

alter table public.at_procedimentos enable row level security;
drop policy if exists at_proc_select on public.at_procedimentos;
drop policy if exists at_proc_write on public.at_procedimentos;
create policy at_proc_select on public.at_procedimentos for select to authenticated using (true);
create policy at_proc_write on public.at_procedimentos for all to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));


-- ═══════════════════════════════════════════════════════════
-- 5) O ÚNICO CONTEÚDO QUE ENTRA AQUI: o que é padrão nacional
--
-- Convênio, plano, especialidade e procedimento do HNSN NÃO estão aqui —
-- são cadastro do hospital. O que entra é só o que não varia de hospital
-- para hospital porque vem de norma: caráter do atendimento (exigido na
-- AIH) e a natureza do tipo de atendimento.
--
-- Marcados `sistema = true`: podem ser editados, não devem ser apagados.
-- ═══════════════════════════════════════════════════════════
insert into public.at_dominios (dominio, codigo, nome, ordem, extras, sistema) values
  ('carater', 'eletivo',   'Eletivo',                 1, '{}'::jsonb, true),
  ('carater', 'urgencia',  'Urgência / Emergência',   2, '{}'::jsonb, true),

  -- `conta_como` é o que o indicador de produção usa para separar primeira
  -- consulta de retorno — e o que sustenta a regra de que retorno dentro do
  -- prazo não fatura nova consulta.
  ('tipo_atendimento', 'primeira_consulta', 'Primeira consulta', 1, '{"conta_como":"primeira"}'::jsonb, true),
  ('tipo_atendimento', 'retorno',           'Retorno',           2, '{"conta_como":"retorno"}'::jsonb,  true),
  ('tipo_atendimento', 'urgencia',          'Urgência',          3, '{"conta_como":"urgencia"}'::jsonb, true),
  ('tipo_atendimento', 'exame',             'Exame',             4, '{"conta_como":"exame"}'::jsonb,    true),

  ('unidade_origem', 'pronto_socorro', 'Pronto-Socorro', 1, '{}'::jsonb, true),
  ('unidade_origem', 'ambulatorio',    'Ambulatório',    2, '{}'::jsonb, true)
on conflict (dominio, codigo) do nothing;


-- ═══════════════════════════════════════════════════════════
-- 6) A FICHA — o que passa a ser registrado na abertura
--
-- Tudo NULO por padrão, e nada obrigatório no banco. A obrigatoriedade,
-- quando existir, é da tela e depende do convênio escolhido — que hoje
-- ainda não está cadastrado. Coluna `not null` aqui travaria a recepção
-- num hospital que ainda não terminou de configurar o sistema.
--
-- Sobre a tabela se chamar `ps_atendimentos`: é herança. Ela nasceu do
-- pronto-socorro e agora guarda o atendimento ambulatorial também
-- (`tipo_atendimento`, criado na fase 1). Renomear alcançaria dezenas de
-- pontos do código; se incomodar, o caminho barato é uma view.
-- ═══════════════════════════════════════════════════════════
alter table public.ps_atendimentos
  -- ── fonte pagadora ──
  add column if not exists convenio_id bigint references public.at_convenios (id),
  add column if not exists plano_id bigint references public.at_planos (id),
  add column if not exists carteira text,
  add column if not exists carteira_validade date,
  add column if not exists guia_numero text,
  add column if not exists autorizacao_senha text,

  -- ── classificação do atendimento ──
  -- Guardado como CÓDIGO (texto), não como id: o código é o que a
  -- recepcionista fala, o que sai no relatório e o que o faturamento
  -- confere. Id de tabela não sobrevive a uma reimportação de catálogo.
  add column if not exists tipo_atendimento_cod text,
  add column if not exists tipo_paciente_cod text,
  add column if not exists especialidade_cod text,
  add column if not exists carater_cod text,

  -- ── de onde vem, para onde vai ──
  -- `unidade_origem_cod` é o SETOR de entrada (PS ou ambulatório) e não se
  -- confunde com a coluna `origem`, que já existe e guarda COMO o paciente
  -- chegou (SAMU, meios próprios). No MV são campos diferentes: Origem e
  -- Meio de transporte.
  add column if not exists unidade_origem_cod text,
  add column if not exists local_procedencia_cod text,
  -- `destino_cod` é para onde o paciente vai NA ABERTURA (qual clínica).
  -- Não confundir com `setor_destino`, que já existe e é o DESFECHO — para
  -- onde ele foi quando o atendimento terminou. Momentos opostos da mesma
  -- jornada.
  add column if not exists destino_cod text,

  -- ── ato e responsável ──
  add column if not exists procedimento_cod text,
  -- CBO congelado no momento do atendimento, copiado do cadastro do
  -- profissional. Congelar é deliberado, pelo mesmo motivo da assinatura no
  -- PEP: o profissional pode mudar de ocupação, e a conta de março tem que
  -- continuar contando a história de março.
  add column if not exists medico_cbo text,
  add column if not exists cid text,

  -- ── consequência jurídica ──
  -- Acidente de trabalho troca o pagador (INSS/empregador) e dispara CAT.
  -- É campo de consequência legal, não estatística.
  add column if not exists acidente_trabalho boolean not null default false;

create index if not exists ps_atend_convenio_idx on public.ps_atendimentos (convenio_id);


-- ═══════════════════════════════════════════════════════════
-- 7) CBO NO CADASTRO DO PROFISSIONAL
--
-- O CBO é da PESSOA, não do ato: "médico clínico", "enfermeiro". Ele não
-- muda a cada atendimento, então não se digita na ficha — a recepção
-- escolhe o profissional e o CBO vai junto.
--
-- Digitar CBO no balcão é a origem prática da rejeição de BPA: a
-- recepcionista não tem como saber qual CBO é compatível com o
-- procedimento, e ninguém descobre até o processamento devolver.
-- ═══════════════════════════════════════════════════════════
alter table public.profiles
  add column if not exists cbo text;


-- ═══════════════════════════════════════════════════════════
-- 8) CONFERÊNCIA
-- ═══════════════════════════════════════════════════════════
select 'convenios cadastrados' as item, count(*)::text as valor from public.at_convenios
union all
select 'planos cadastrados', count(*)::text from public.at_planos
union all
select 'procedimentos cadastrados', count(*)::text from public.at_procedimentos
union all
select 'dominios do padrao nacional', count(*)::text from public.at_dominios where sistema
union all
select 'dominios cadastrados pelo hospital', count(*)::text from public.at_dominios where not sistema;


-- ┌────────────────────────────────────────────────────────────
-- │ 45/75 — migracao-atendimento-agenda.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- AGENDA DO AMBULATÓRIO — grade, marcação e o painel do dia
--
-- O MODELO É O QUE HOSPITAL BRASILEIRO USA, e ele tem uma
-- particularidade que precisa estar no banco, não só na tela:
-- **a vaga tem dono**.
--
--   • REGULAÇÃO — a vaga foi publicada para a central (GERCON aqui no RS).
--     Quem decide quem a ocupa é a regulação, a partir do pedido da UBS.
--     O hospital reserva e recebe; não marca.
--   • INTERNA — retorno pedido pelo próprio especialista, convênio e
--     particular. Isso NÃO passa por regulação: quem marca é o hospital.
--     É a fatia que hoje vive em caderno.
--   • CHEGADA — vaga deixada aberta para quem aparece sem marcação.
--
-- POR QUE ISSO É ESTRUTURA E NÃO CONFIGURAÇÃO
-- Sem o dono da vaga registrado, alguém marca um retorno num horário que a
-- regulação já preencheu. Dois pacientes aparecem para a mesma vaga, e o
-- hospital está errado nos dois casos — um deles foi marcado por uma
-- central que não tinha como saber. O banco precisa recusar isso, não
-- avisar depois.
--
-- O QUE ESTA MIGRAÇÃO **NÃO** FAZ
-- Não tenta ser o GERCON. Não guarda o pedido da UBS, não classifica risco,
-- não decide fila de regulação. Guarda a vaga reservada e, quando o
-- paciente chega com o papel, o protocolo dele. Duplicar a regulação
-- criaria duas verdades para a mesma consulta — e a UBS continuaria usando
-- a dela.
--
-- ⚠️ RODAR NO SQL EDITOR ANTES DO MERGE DO CÓDIGO.
--    Aditiva e idempotente. Nenhuma constraint que cobre do código que já
--    está no ar.
-- ═══════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════
-- 1) GRADE — a capacidade que o hospital oferece
--
-- Recorrente por dia da semana, e não uma linha por data: a grade de um
-- ambulatório muda algumas vezes por ano, não todo dia. Gerar linha por
-- data encheria a tabela de milhares de registros idênticos e faria
-- "mudar a grade da ortopedia" virar uma operação de massa.
--
-- A GRADE DEFINE O RELÓGIO, AS COTAS DIVIDEM O DONO.
-- `hora_inicio`, `hora_fim` e `duracao_min` produzem N horários. As três
-- cotas dizem quantos desses N horários pertencem a cada dono. A soma não
-- pode passar de N — a tela confere, porque um `check` aqui exigiria
-- recalcular N em SQL e travaria a edição da grade por um detalhe.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.ag_grades (
  id bigserial primary key,
  especialidade_cod text not null,
  -- Profissional é opcional: muitos ambulatórios publicam a vaga da
  -- especialidade e só definem quem atende na escala da semana.
  profissional_username text,
  dia_semana int not null,              -- 0 = domingo … 6 = sábado
  hora_inicio time not null,
  hora_fim time not null,
  duracao_min int not null default 20,
  vagas_regulacao int not null default 0,
  vagas_internas int not null default 0,
  vagas_chegada int not null default 0,
  -- Vigência: a grade de 2026 não deve gerar vaga em 2025 nem continuar
  -- valendo depois que o contrato do profissional acabou.
  vigencia_inicio date not null default current_date,
  vigencia_fim date,
  ativo boolean not null default true,
  observacao text,
  usuario text,
  criado_em timestamptz not null default now(),
  updated_at timestamptz default now(),
  constraint ag_grades_dia_valido check (dia_semana between 0 and 6),
  constraint ag_grades_horario_valido check (hora_fim > hora_inicio),
  constraint ag_grades_duracao_valida check (duracao_min between 5 and 240)
);
create index if not exists ag_grades_busca_idx
  on public.ag_grades (ativo, especialidade_cod, dia_semana);

alter table public.ag_grades enable row level security;
drop policy if exists ag_grades_select on public.ag_grades;
drop policy if exists ag_grades_write on public.ag_grades;
create policy ag_grades_select on public.ag_grades for select to authenticated using (true);
create policy ag_grades_write on public.ag_grades for all to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));


-- ═══════════════════════════════════════════════════════════
-- 2) BLOQUEIOS — quando a grade não vale
--
-- Feriado, férias, congresso, sala em reforma. Sem isto a agenda oferece
-- vaga em dia que o hospital não atende, e alguém marca — o paciente vem
-- de ônibus de outra cidade e encontra a porta fechada.
--
-- `especialidade_cod` e `profissional_username` nulos significam "o dia
-- inteiro do ambulatório", que é o caso do feriado.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.ag_bloqueios (
  id bigserial primary key,
  data_inicio date not null,
  data_fim date not null,
  especialidade_cod text,
  profissional_username text,
  motivo text not null,
  usuario text,
  criado_em timestamptz not null default now(),
  constraint ag_bloqueios_periodo_valido check (data_fim >= data_inicio)
);
create index if not exists ag_bloqueios_periodo_idx on public.ag_bloqueios (data_inicio, data_fim);

alter table public.ag_bloqueios enable row level security;
drop policy if exists ag_bloq_select on public.ag_bloqueios;
drop policy if exists ag_bloq_write on public.ag_bloqueios;
create policy ag_bloq_select on public.ag_bloqueios for select to authenticated using (true);
create policy ag_bloq_write on public.ag_bloqueios for all to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));


-- ═══════════════════════════════════════════════════════════
-- 3) AGENDAMENTO — a vaga ocupada
--
-- `origem_marcacao` é a coluna que sustenta a regra inteira:
--   regulacao — veio do GERCON. `protocolo_regulacao` guarda o número do
--               papel que o paciente traz.
--   interna   — o hospital marcou (retorno, convênio, particular).
--   chegada   — não foi marcado; entrou na fila do dia.
--
-- `prontuario` é NULO de propósito quando a vaga é da regulação e ainda não
-- se sabe quem vem: a vaga está reservada, a pessoa não. Quem preenche é a
-- recepção, quando o paciente chega — ou antes, se alguém digitar a lista
-- do GERCON.
--
-- `atendimento_id` liga ao atendimento que a confirmação de presença abriu.
-- É o que faz "realizadas" deixar de ser digitado à mão: consulta realizada
-- é agendamento com atendimento aberto.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.ag_agendamentos (
  id bigserial primary key,
  data date not null,
  hora time,
  especialidade_cod text not null,
  profissional_username text,
  grade_id bigint references public.ag_grades (id) on delete set null,

  prontuario text references public.pacientes (prontuario),
  origem_marcacao text not null,        -- regulacao | interna | chegada
  tipo_atendimento_cod text,            -- primeira_consulta | retorno | ...
  protocolo_regulacao text,

  -- agendado | presente | falta | cancelado
  status text not null default 'agendado',
  presente_em timestamptz,
  atendimento_id bigint references public.ps_atendimentos (id) on delete set null,
  cancelado_motivo text,

  observacao text,
  usuario text,
  criado_em timestamptz not null default now(),
  updated_at timestamptz default now(),
  constraint ag_agend_origem_valida check (origem_marcacao in ('regulacao','interna','chegada')),
  constraint ag_agend_status_valido check (status in ('agendado','presente','falta','cancelado'))
);
create index if not exists ag_agend_dia_idx on public.ag_agendamentos (data, especialidade_cod, hora);
create index if not exists ag_agend_paciente_idx on public.ag_agendamentos (prontuario, data desc);
create index if not exists ag_agend_grade_idx on public.ag_agendamentos (grade_id, data);

alter table public.ag_agendamentos enable row level security;
drop policy if exists ag_agend_select on public.ag_agendamentos;
drop policy if exists ag_agend_write on public.ag_agendamentos;
create policy ag_agend_select on public.ag_agendamentos for select to authenticated using (true);
create policy ag_agend_write on public.ag_agendamentos for all to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));


-- ═══════════════════════════════════════════════════════════
-- 4) A TRAVA QUE IMPORTA — dois pacientes na mesma vaga
--
-- Índice único parcial: para uma mesma data, especialidade e hora, só pode
-- existir UM agendamento vivo. Cancelado e falta ficam de fora do índice
-- de propósito — o horário volta a ficar livre para quem remarca, e o
-- histórico do que foi desmarcado continua gravado.
--
-- `hora is not null` porque a fila por ordem de chegada não tem horário:
-- ali a vaga não é um relógio, é uma posição.
-- ═══════════════════════════════════════════════════════════
create unique index if not exists ag_agend_vaga_unica
  on public.ag_agendamentos (data, especialidade_cod, hora)
  where hora is not null and status in ('agendado','presente');


-- ═══════════════════════════════════════════════════════════
-- 5) LIGAÇÃO COM O ATENDIMENTO
--
-- O caminho contrário do `atendimento_id`: dado um atendimento, de qual
-- agendamento ele nasceu. Serve ao faturamento (retorno dentro do prazo
-- não gera nova consulta) e ao indicador de absenteísmo.
-- ═══════════════════════════════════════════════════════════
alter table public.ps_atendimentos
  add column if not exists agendamento_id bigint references public.ag_agendamentos (id) on delete set null;

create index if not exists ps_atend_agendamento_idx on public.ps_atendimentos (agendamento_id);


-- ═══════════════════════════════════════════════════════════
-- 6) CONFERÊNCIA
-- ═══════════════════════════════════════════════════════════
select 'grades cadastradas' as item, count(*)::text as valor from public.ag_grades
union all
select 'bloqueios cadastrados', count(*)::text from public.ag_bloqueios
union all
select 'agendamentos', count(*)::text from public.ag_agendamentos
union all
select 'trava de vaga unica instalada', (exists (
  select 1 from pg_indexes where schemaname = 'public' and indexname = 'ag_agend_vaga_unica'
))::text;


-- ┌────────────────────────────────────────────────────────────
-- │ 46/75 — migracao-nsp-rca-plano.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- NSP — Análise de causa raiz (RCA) + Plano de ação (Fase 2b)
--
-- Base: RDC 36/2013 (ANVISA), art. 8º — o NSP investiga os incidentes e
-- monta o plano de ação; Guia de Análise de Incidentes da ANVISA (5 Porquês,
-- Ishikawa) e Protocolo de Londres (fatores contribuintes).
--
-- Fecha o ciclo do evento: o incidente que exige análise (evento adverso,
-- never event, dano moderado+) ganha a RCA, e a RCA gera o plano de ação
-- (5W2H) que o sistema COBRA até fechar.
--
-- 2 tabelas:
--   • nsp_rca    — a análise de causa raiz de um incidente (5 porquês,
--                  Ishikawa, fatores contribuintes, barreiras, causa raiz).
--   • nsp_acoes  — as ações do plano (5W2H), com status e prazo. `numero`
--                  é o número humano da ação.
--
-- Registro de segurança é append-only (correção = novo registro com
-- corrige_id). `status` da ação é estado de fluxo (pode ser atualizado até
-- concluir). Aditiva e idempotente. DEMO primeiro, depois HNSN.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.nsp_rca (
  id                 uuid primary key default gen_random_uuid(),
  incidente_id       uuid not null,
  metodo             text,                   -- 5_porques | ishikawa | ambos
  porques            jsonb not null default '[]'::jsonb,  -- cadeia dos 5 porquês
  ishikawa           jsonb not null default '{}'::jsonb,  -- { categoria: [causas] }
  fatores            jsonb not null default '[]'::jsonb,  -- fatores contribuintes (London)
  barreiras          jsonb not null default '[]'::jsonb,  -- barreiras que falharam / faltaram
  causa_raiz         text,
  conclusao          text,
  status             text not null default 'em_andamento',  -- em_andamento | concluida
  registrado_por     text,                   -- autoria congelada
  categoria          text,
  conselho           text,
  registro_conselho  text,
  corrige_id         uuid,
  motivo_correcao    text,
  criado_em          timestamptz not null default now()
);
create index if not exists nsp_rca_inc_idx on public.nsp_rca (incidente_id, criado_em desc);

create table if not exists public.nsp_acoes (
  id                 uuid primary key default gen_random_uuid(),
  numero             bigint generated always as identity,  -- número humano da ação
  incidente_id       uuid not null,
  rca_id             uuid,
  o_que              text not null,          -- What: a ação
  por_que            text,                   -- Why: a razão
  responsavel        text,                   -- Who
  prazo              date,                   -- When
  onde               text,                   -- Where
  como               text,                   -- How
  quanto             text,                   -- How much (custo/recurso)
  status             text not null default 'pendente',  -- pendente | em_andamento | concluida | cancelada
  concluida_em       timestamptz,
  evidencia          text,                   -- comprovação do fechamento
  registrado_por     text,                   -- autoria congelada
  categoria          text,
  conselho           text,
  registro_conselho  text,
  corrige_id         uuid,
  motivo_correcao    text,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);
create index if not exists nsp_acoes_inc_idx    on public.nsp_acoes (incidente_id, criado_em desc);
create index if not exists nsp_acoes_status_idx on public.nsp_acoes (status, prazo);

-- Verificação
select 'NSP: nsp_rca + nsp_acoes ok' as resultado;


-- ┌────────────────────────────────────────────────────────────
-- │ 47/75 — migracao-atendimento-ciclo.sql
-- └────────────────────────────────────────────────────────────
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


-- ┌────────────────────────────────────────────────────────────
-- │ 48/75 — migracao-nsp-metas.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- NSP — Indicadores automáticos + 6 Metas Internacionais (Fase 2c)
--
-- Base: PNSP (Portaria 529/2013) e as 6 Metas Internacionais de Segurança do
-- Paciente (OMS/JCI). O núcleo passa a MONITORAR com farol (verde/amarelo/
-- vermelho): os indicadores automáticos saem dos módulos que já existem (LPP
-- adquirida do POA, quedas e erro de medicação dos incidentes — sem digitação);
-- as metas que dependem de observação (higiene das mãos, comunicação, cirurgia
-- segura) vêm de auditoria periódica.
--
-- 2 tabelas:
--   • nsp_meta_faixas   — os ALVOS de cada meta, EDITÁVEIS pelo ADM Master
--                         ("em validação" até validar). É configuração, não
--                         registro clínico → upsert por `chave`.
--   • nsp_meta_medicoes — as medições de auditoria (numerador/denominador →
--                         adesão %). Registro append-only: correção = novo
--                         registro com `corrige_id`, autoria congelada.
--
-- Aditiva e idempotente. Rodar no SQL Editor — primeiro no DEMO, depois no
-- PRINCIPAL (HNSN). ON CONFLICT DO NOTHING: reexecutar não sobrescreve edições.
-- ═══════════════════════════════════════════════════════════

-- Alvos das metas (editáveis pelo ADM Master; nascem "em validação").
create table if not exists public.nsp_meta_faixas (
  chave          text primary key,      -- slug conhecido pelo motor (src/clinico/nsp.js -> METAS)
  ordem          int  not null default 0,
  rotulo         text not null,
  sentido        text not null default 'menor_melhor',  -- menor_melhor | maior_melhor
  unidade        text,                   -- '%', 'casos'
  corte_verde    numeric,                -- alcança a meta
  corte_amarelo  numeric,                -- zona de alerta (fora disso = vermelho)
  fonte          text not null default 'auto',  -- auto (dos módulos) | auditoria (observação)
  ativo          boolean     not null default true,
  validado       boolean     not null default false,
  usuario        text,
  updated_at     timestamptz not null default now()
);

-- Seed do rascunho (não sobrescreve edições — ON CONFLICT DO NOTHING).
insert into public.nsp_meta_faixas
  (chave, ordem, rotulo, sentido, unidade, corte_verde, corte_amarelo, fonte)
values
  ('identificacao',   1, 'Identificar corretamente o paciente',                'menor_melhor', 'casos', 0,  2,  'auto'),
  ('comunicacao',     2, 'Comunicação efetiva',                                'maior_melhor', '%',     90, 75, 'auditoria'),
  ('medicamentos',    3, 'Segurança dos medicamentos de alta vigilância',      'menor_melhor', 'casos', 0,  2,  'auto'),
  ('cirurgia_segura', 4, 'Cirurgia segura (lado/paciente/procedimento certos)','maior_melhor', '%',     95, 85, 'auditoria'),
  ('higiene_maos',    5, 'Higiene das mãos',                                   'maior_melhor', '%',     80, 60, 'auditoria'),
  ('quedas_lpp',      6, 'Reduzir quedas e lesões por pressão',                'menor_melhor', 'casos', 1,  4,  'auto')
on conflict (chave) do nothing;

-- Medições de auditoria (append-only). Adesão = numerador ÷ denominador.
create table if not exists public.nsp_meta_medicoes (
  id                uuid primary key default gen_random_uuid(),
  meta              text not null,          -- chave da meta (nsp_meta_faixas.chave)
  competencia       date not null,          -- 1º dia do mês de referência
  numerador         integer not null default 0,   -- ex.: oportunidades COM adesão
  denominador       integer not null default 0,   -- ex.: oportunidades observadas
  observacao        text,
  registrado_por    text,                   -- autoria congelada
  categoria         text,
  conselho          text,
  registro_conselho text,
  corrige_id        uuid,                   -- correção = novo registro apontando o anterior
  motivo_correcao   text,
  criado_em         timestamptz not null default now()
);
create index if not exists nsp_meta_medicoes_idx on public.nsp_meta_medicoes (meta, competencia desc);

-- Verificação
select 'NSP: nsp_meta_faixas (' || (select count(*) from public.nsp_meta_faixas) || ') + nsp_meta_medicoes ok' as resultado;


-- ┌────────────────────────────────────────────────────────────
-- │ 49/75 — migracao-nsp-protocolos.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- NSP — Protocolos gerenciados de segurança (Fase 2d)
--
-- Base: PNSP (Portaria 529/2013) e RDC 36/2013. Os 6 protocolos básicos de
-- segurança do paciente (identificação, cirurgia segura, higiene das mãos,
-- prevenção de quedas, prevenção de LPP, segurança medicamentosa) geridos como
-- DOCUMENTOS: versão, responsável, data de revisão e conteúdo. Cada protocolo
-- se liga a uma das 6 Metas (Fase 2c); o sistema cobra a revisão vencida.
--
-- 1 tabela: nsp_protocolos (configuração editável, não registro clínico → upsert
-- por id na tela). Nasce "em validação". `chave` é o slug só dos 6 básicos do
-- seed, para o seed ser idempotente; protocolos criados na tela têm chave nula.
--
-- Aditiva e idempotente. Rodar no SQL Editor — primeiro no DEMO, depois no
-- PRINCIPAL (HNSN). ON CONFLICT DO NOTHING: reexecutar não sobrescreve edições.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.nsp_protocolos (
  id            uuid primary key default gen_random_uuid(),
  chave         text,                    -- slug do protocolo básico (seed idempotente); null nos criados na tela
  meta          text,                    -- meta de segurança vinculada (nsp_meta_faixas.chave)
  titulo        text    not null,
  versao        text,                    -- ex.: "1.0"
  responsavel   text,
  conteudo      text,                    -- passos / POP
  referencia    text,                    -- diretriz / fonte
  revisao_em    date,                    -- data da próxima revisão prevista
  status        text    not null default 'em_revisao',  -- vigente | em_revisao | suspenso
  ativo         boolean not null default true,
  validado      boolean not null default false,
  usuario       text,
  criado_em     timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists nsp_protocolos_chave_idx on public.nsp_protocolos (chave);
create index        if not exists nsp_protocolos_meta_idx  on public.nsp_protocolos (meta);

-- Seed dos 6 básicos (rascunho "em validação" — não sobrescreve edições).
insert into public.nsp_protocolos (chave, meta, titulo, versao, status) values
  ('ident',      'identificacao',   'Protocolo de identificação do paciente',                     '1.0', 'em_revisao'),
  ('cir_segura', 'cirurgia_segura', 'Protocolo de cirurgia segura (checklist OMS)',               '1.0', 'em_revisao'),
  ('higiene',    'higiene_maos',    'Protocolo de higiene das mãos',                              '1.0', 'em_revisao'),
  ('quedas',     'quedas_lpp',      'Protocolo de prevenção de quedas',                           '1.0', 'em_revisao'),
  ('lpp',        'quedas_lpp',      'Protocolo de prevenção de lesão por pressão',                '1.0', 'em_revisao'),
  ('medicam',    'medicamentos',    'Protocolo de segurança na prescrição e uso de medicamentos', '1.0', 'em_revisao')
on conflict (chave) do nothing;

-- Verificação
select 'NSP: nsp_protocolos ok — ' || count(*) || ' protocolos' as resultado from public.nsp_protocolos;


-- ┌────────────────────────────────────────────────────────────
-- │ 50/75 — migracao-atendimento-responsavel.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- RESPONSÁVEL DO EPISÓDIO — quem consente e quem recebe a alta
--
-- Equivale ao botão "2- Responsável" do MV. Responde duas perguntas que
-- hoje só vivem na memória de quem estava no balcão: quem autorizou o
-- procedimento, e a quem o paciente pode ser entregue.
--
-- ⚠️ A REGRA QUE ORGANIZA A TABELA: CAPACIDADE NÃO SE DEDUZ.
-- A Lei 13.146/2015 (Estatuto da Pessoa com Deficiência) fez da curatela
-- medida EXCEPCIONAL e JUDICIAL — deficiência não é incapacidade. Por isso
-- os vínculos que só existem por decisão de juiz (tutor, curador, guardião,
-- responsável institucional) têm CHECK exigindo o número do processo. Não é
-- redundância da validação em JavaScript: é a última linha de defesa, a
-- mesma ideia do índice único que impede dois pacientes no mesmo horário da
-- agenda. Validação de tela não sobrevive a um script, a um import ou a uma
-- tela nova que alguém escreva daqui a um ano.
--
-- POR QUE A LINHA É POR ATENDIMENTO, E NÃO POR PACIENTE
-- Consentimento é ATO NO TEMPO. Quem autorizou a cirurgia de março pode não
-- ser quem trouxe o paciente em setembro, e a mãe que assinava pelo
-- adolescente de 15 não assina mais quando ele faz 18. Guardar no paciente
-- faria o registro de hoje reescrever a história de ontem. A tela oferece
-- copiar do episódio anterior, que resolve a digitação sem apagar o
-- passado.
--
-- ⚠️ RODAR NO SQL EDITOR ANTES DO MERGE DO CÓDIGO.
--    Aditiva e idempotente: cria UMA tabela nova e não toca em nenhuma
--    existente. Nenhuma constraint cobra de linha que já esteja no ar.
--    DEMO primeiro, depois o principal.
-- ═══════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════
-- 1) A TABELA
--
-- `consente` e `recebe_alta` são colunas, e não expressões derivadas do
-- papel, porque é isso que permite a consulta "a quem este paciente pode
-- ser entregue?" sem o consumidor precisar conhecer a regra. Quem as
-- preenche é `camposDoResponsavel` (responsavel.js), sempre a partir do
-- papel — a tela não escolhe.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.at_responsaveis (
  id                 bigserial primary key,
  -- O episódio. `on delete cascade` NÃO se aplica: atendimento não é
  -- apagado neste sistema (cancelar é estado), então a FK só garante que a
  -- linha aponta para um episódio que existe.
  atendimento_id     bigint references public.ps_atendimentos (id),
  -- Redundante com o atendimento de propósito: é o que permite listar o
  -- histórico de responsáveis de um paciente sem varrer os atendimentos, e
  -- o que sobra quando o responsável é cadastrado antes de abrir o episódio.
  prontuario         text,

  nome               text not null,
  cpf                text,
  data_nascimento    date,
  telefone           text,

  -- mae | pai | filho | conjuge | irmao | avo | tutor | curador | guardiao
  -- | instituicao | outro
  vinculo            text,
  -- representante | assistente | acompanhante
  papel              text not null default 'acompanhante',
  -- Número do processo. Obrigatório nos vínculos judiciais — ver o CHECK.
  documento_judicial text,

  consente           boolean not null default false,
  recebe_alta        boolean not null default false,

  observacao         text,
  ativo              boolean not null default true,
  usuario            text,
  criado_em          timestamptz not null default now(),
  updated_at         timestamptz default now()
);

-- ═══════════════════════════════════════════════════════════
-- 2) OS DOIS CHECKS QUE VALEM MAIS QUE A TELA
--
-- O primeiro impede papel inventado. O segundo é o que protege capacidade
-- civil: sem número de processo, ninguém vira curador, tutor ou guardião
-- por digitação de balcão.
--
-- `add constraint if not exists` não existe no Postgres; o bloco abaixo faz
-- o equivalente idempotente.
-- ═══════════════════════════════════════════════════════════
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'at_resp_papel_valido') then
    alter table public.at_responsaveis
      add constraint at_resp_papel_valido
      check (papel in ('representante', 'assistente', 'acompanhante'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'at_resp_judicial_exige_documento') then
    alter table public.at_responsaveis
      add constraint at_resp_judicial_exige_documento
      check (
        vinculo is null
        or vinculo not in ('tutor', 'curador', 'guardiao', 'instituicao')
        or coalesce(btrim(documento_judicial), '') <> ''
      );
  end if;

  -- Acompanhante não consente e não recebe alta. É a regra que separa
  -- "direito de ficar ao lado" (ECA art. 12; Estatuto do Idoso art. 16) de
  -- procuração — e o defeito mais provável desta feature seria uma tela
  -- nova marcando as duas caixas para quem só acompanha.
  if not exists (select 1 from pg_constraint where conname = 'at_resp_acompanhante_sem_poder') then
    alter table public.at_responsaveis
      add constraint at_resp_acompanhante_sem_poder
      check (papel <> 'acompanhante' or (consente = false and recebe_alta = false));
  end if;
end $$;

create index if not exists at_resp_atend_idx
  on public.at_responsaveis (atendimento_id, ativo);
create index if not exists at_resp_prontuario_idx
  on public.at_responsaveis (prontuario, criado_em desc);


-- ═══════════════════════════════════════════════════════════
-- 3) RLS — mesmo padrão do resto do módulo
--
-- ⚠️ O `select using (true)` repete a política já usada em todas as tabelas
-- do sistema. Está aqui por COERÊNCIA, e não por concordância: a decisão de
-- fechar a leitura por perfil continua pendente para antes do primeiro
-- paciente real, e esta tabela guarda CPF e telefone de terceiros — gente
-- que nem paciente é. Quando o RLS for endurecido, esta tabela deve entrar
-- na mesma leva.
-- ═══════════════════════════════════════════════════════════
alter table public.at_responsaveis enable row level security;
drop policy if exists at_resp_select on public.at_responsaveis;
drop policy if exists at_resp_write  on public.at_responsaveis;
create policy at_resp_select on public.at_responsaveis for select to authenticated using (true);
create policy at_resp_write on public.at_responsaveis for all to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));


-- ═══════════════════════════════════════════════════════════
-- 4) CONFERÊNCIA
-- ═══════════════════════════════════════════════════════════
select 'tabela at_responsaveis criada' as item,
       count(*)::text as valor
  from information_schema.tables
 where table_schema = 'public' and table_name = 'at_responsaveis'

union all
select 'colunas', count(*)::text
  from information_schema.columns
 where table_schema = 'public' and table_name = 'at_responsaveis'

union all
select 'checks de protecao (esperado 3)', count(*)::text
  from pg_constraint
 where conname in ('at_resp_papel_valido',
                   'at_resp_judicial_exige_documento',
                   'at_resp_acompanhante_sem_poder')

union all
select 'politicas RLS (esperado 2)', count(*)::text
  from pg_policies
 where schemaname = 'public' and tablename = 'at_responsaveis';


-- ┌────────────────────────────────────────────────────────────
-- │ 51/75 — migracao-atendimento-faturamento.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- FATURAMENTO — a conta do atendimento (fundação)
--
-- Transforma o que foi feito (procedimento, material, medicamento) na CONTA
-- do episódio, e registra por qual via ela sai: BPA, APAC, AIH, guia TISS
-- ou cobrança direta.
--
-- O QUE ESTA MIGRAÇÃO NÃO CRIA, E POR QUÊ
-- Nada de remessa. BPA-I/BPA-C, SISAIH01 e o XML do TISS têm layout
-- versionado, mudam por portaria e por versão da operadora, e passam por
-- homologação. Guardar "arquivo gerado" antes de existir gerador conferido
-- seria criar coluna para um dado que ninguém sabe produzir ainda.
--
-- ⚠️ A REGRA QUE VIRA CONSTRAINT: SUS NÃO COBRA DO PACIENTE.
-- Não é configuração, é lei — e o erro dela cai sobre o PACIENTE, não sobre
-- o hospital. Por isso o CHECK: item marcado para cobrança direta numa
-- conta cuja via é BPA, APAC ou AIH é recusado pelo banco, e não só pela
-- tela. Validação de tela não sobrevive a um import de planilha.
--
-- DINHEIRO EM numeric(12,2), nunca float. `double precision` não representa
-- 0,10 exatamente, e uma conta de trinta itens acumula diferença que
-- ninguém explica na conferência.
--
-- ⚠️ RODAR NO SQL EDITOR ANTES DO MERGE DO CÓDIGO.
--    Aditiva e idempotente: cria duas tabelas novas e acrescenta duas
--    colunas opcionais em `at_procedimentos`. Nenhuma constraint cobra de
--    linha que já esteja no ar. DEMO primeiro, depois o principal.
-- ═══════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════
-- 1) O PREÇO E A VIA MORAM NO CATÁLOGO
--
-- `via_sus` diz se o procedimento sai por BPA, APAC ou AIH. Está no
-- CADASTRO, e não em lista dentro do código, porque quais procedimentos são
-- APAC muda por portaria várias vezes por ano — cravar em JavaScript faria
-- cada atualização do SIGTAP virar um release.
--
-- `valor_sus` é o valor da tabela SIGTAP. Nasce nulo: nulo é "ninguém
-- cadastrou", que é diferente de zero ("de graça"). A tela imprime "—" para
-- o primeiro e R$ 0,00 para o segundo.
-- ═══════════════════════════════════════════════════════════
alter table public.at_procedimentos
  add column if not exists valor_sus numeric(12,2),
  add column if not exists via_sus text;


-- ═══════════════════════════════════════════════════════════
-- 2) A CONTA
--
-- Uma por atendimento — garantido por índice único PARCIAL, que ignora as
-- canceladas. É o que permite refaturar depois de uma glosa (cancela a
-- conta velha, abre outra) sem abrir a porta para duas contas vivas do
-- mesmo episódio, que é como o mesmo atendimento acaba transmitido duas
-- vezes.
--
-- `competencia` é o mês de referência ("2026-07"): é por ela que o
-- faturamento fecha e transmite, e não pela data da conta. Atendimento do
-- dia 31 lançado no dia 2 pertence à competência de quem foi atendido.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.at_contas (
  id             bigserial primary key,
  atendimento_id bigint not null references public.ps_atendimentos (id),
  prontuario     text,
  convenio_id    bigint references public.at_convenios (id),
  plano_id       bigint references public.at_planos (id),
  -- bpa | apac | aih | tiss | direta
  via            text,
  competencia    text,
  -- aberta | fechada | faturada | glosada | cancelada
  status         text not null default 'aberta',
  fechada_em     timestamptz,
  fechada_por    text,
  observacao     text,
  usuario        text,
  criado_em      timestamptz not null default now(),
  updated_at     timestamptz default now()
);

create unique index if not exists at_contas_atend_unica
  on public.at_contas (atendimento_id)
  where status <> 'cancelada';
create index if not exists at_contas_competencia_idx
  on public.at_contas (competencia, status);


-- ═══════════════════════════════════════════════════════════
-- 3) OS ITENS
--
-- `valor_unitario` E `valor_total` são gravados, e não calculados na
-- leitura: o preço da tabela muda, e a conta de março precisa continuar
-- contando a história de março. É a mesma razão pela qual o CBO do
-- profissional é congelado no atendimento.
--
-- `executante` e `executante_cbo` congelados pelo mesmo motivo — e porque
-- CBO incompatível com o procedimento é REJEIÇÃO no processamento, não
-- glosa: a produção nem entra.
--
-- `cancelado` em vez de delete: item lançado por engano e apagado sumiria
-- do rastro, e a diferença entre a conta de ontem e a de hoje ficaria sem
-- explicação.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.at_conta_itens (
  id                bigserial primary key,
  conta_id          bigint not null references public.at_contas (id) on delete cascade,
  -- procedimento | material | medicamento | diaria | taxa
  tipo              text not null default 'procedimento',
  codigo            text,
  descricao         text,
  quantidade        numeric(12,3) not null default 1,
  valor_unitario    numeric(12,2),
  valor_total       numeric(12,2),
  executante        text,
  executante_cbo    text,
  data_execucao     date,
  -- ⚠️ Só pode ser true quando a via cobra do paciente. Ver o CHECK abaixo.
  cobrar_do_paciente boolean not null default false,
  observacao        text,
  cancelado         boolean not null default false,
  usuario           text,
  criado_em         timestamptz not null default now(),
  updated_at        timestamptz default now()
);

create index if not exists at_conta_itens_conta_idx
  on public.at_conta_itens (conta_id, cancelado);


-- ═══════════════════════════════════════════════════════════
-- 4) OS CHECKS
--
-- O terceiro é o que importa de verdade: SUS não cobra do paciente. Ele
-- olha a via da CONTA, e não do item — por isso é uma função e não um
-- CHECK simples de coluna.
-- ═══════════════════════════════════════════════════════════
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'at_contas_status_valido') then
    alter table public.at_contas
      add constraint at_contas_status_valido
      check (status in ('aberta','fechada','faturada','glosada','cancelada'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'at_contas_via_valida') then
    alter table public.at_contas
      add constraint at_contas_via_valida
      check (via is null or via in ('bpa','apac','aih','tiss','direta'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'at_item_tipo_valido') then
    alter table public.at_conta_itens
      add constraint at_item_tipo_valido
      check (tipo in ('procedimento','material','medicamento','diaria','taxa'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'at_item_quantidade_positiva') then
    alter table public.at_conta_itens
      add constraint at_item_quantidade_positiva
      check (quantidade > 0);
  end if;
end $$;

-- A via da conta de um item. `stable` porque só lê; `security definer` NÃO,
-- de propósito: não há motivo para esta função enxergar mais do que quem a
-- chama.
create or replace function public.at_via_da_conta(p_conta_id bigint)
returns text language sql stable as $$
  select via from public.at_contas where id = p_conta_id
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'at_item_sus_nao_cobra_paciente') then
    alter table public.at_conta_itens
      add constraint at_item_sus_nao_cobra_paciente
      check (
        cobrar_do_paciente = false
        or coalesce(public.at_via_da_conta(conta_id), '') not in ('bpa','apac','aih')
      );
  end if;
end $$;


-- ═══════════════════════════════════════════════════════════
-- 5) RLS — mesmo padrão do resto do módulo
--
-- ⚠️ O `select using (true)` repete a política de todas as tabelas do
-- sistema, por COERÊNCIA e não por concordância — a decisão de fechar a
-- leitura por perfil continua pendente para antes do primeiro paciente
-- real. Estas duas tabelas ligam paciente a valor cobrado, que é dado
-- sensível de outra natureza: quando o RLS for endurecido, entram na
-- mesma leva.
-- ═══════════════════════════════════════════════════════════
alter table public.at_contas enable row level security;
drop policy if exists at_contas_select on public.at_contas;
drop policy if exists at_contas_write  on public.at_contas;
create policy at_contas_select on public.at_contas for select to authenticated using (true);
create policy at_contas_write on public.at_contas for all to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));

alter table public.at_conta_itens enable row level security;
drop policy if exists at_item_select on public.at_conta_itens;
drop policy if exists at_item_write  on public.at_conta_itens;
create policy at_item_select on public.at_conta_itens for select to authenticated using (true);
create policy at_item_write on public.at_conta_itens for all to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));


-- ═══════════════════════════════════════════════════════════
-- 6) CONFERÊNCIA
-- ═══════════════════════════════════════════════════════════
select 'tabelas criadas (esperado 2)' as item, count(*)::text as valor
  from information_schema.tables
 where table_schema = 'public' and table_name in ('at_contas','at_conta_itens')

union all
select 'colunas novas em at_procedimentos (esperado 2)', count(*)::text
  from information_schema.columns
 where table_schema = 'public' and table_name = 'at_procedimentos'
   and column_name in ('valor_sus','via_sus')

union all
select 'checks de protecao (esperado 5)', count(*)::text
  from pg_constraint
 where conname in ('at_contas_status_valido','at_contas_via_valida',
                   'at_item_tipo_valido','at_item_quantidade_positiva',
                   'at_item_sus_nao_cobra_paciente')

union all
select 'indice de conta unica por atendimento', count(*)::text
  from pg_indexes
 where schemaname = 'public' and indexname = 'at_contas_atend_unica'

union all
select 'politicas RLS (esperado 4)', count(*)::text
  from pg_policies
 where schemaname = 'public' and tablename in ('at_contas','at_conta_itens');


-- ┌────────────────────────────────────────────────────────────
-- │ 52/75 — migracao-nsp-capacitacoes.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- NSP — Capacitações em segurança do paciente (Fase 2d)
--
-- Base: PNSP (Portaria 529/2013) e RDC 36/2013 — a educação permanente em
-- segurança é atribuição do NSP. Registro dos treinamentos da equipe: tema,
-- data, carga horária, facilitador, meta de segurança vinculada, participantes
-- e a próxima capacitação prevista (recorrência). Mostra a cobertura por meta
-- e cobra a recorrência vencida.
--
-- 1 tabela: nsp_capacitacoes (configuração/registro administrativo editável →
-- upsert por id na tela). Sem seed — a equipe lança os treinamentos.
--
-- Aditiva e idempotente. Rodar no SQL Editor — primeiro no DEMO, depois no
-- PRINCIPAL (HNSN).
-- ═══════════════════════════════════════════════════════════

create table if not exists public.nsp_capacitacoes (
  id             uuid primary key default gen_random_uuid(),
  tema           text    not null,
  meta           text,                    -- meta de segurança vinculada (nsp_meta_faixas.chave)
  data           date,                    -- data em que ocorreu/ocorrerá
  carga_horaria  numeric,                 -- horas
  facilitador    text,
  publico_alvo   text,
  participantes  integer,                 -- nº de participantes
  status         text    not null default 'planejado',  -- planejado | realizado | cancelado
  proxima_em     date,                    -- próxima capacitação prevista (recorrência)
  observacao     text,
  ativo          boolean not null default true,
  usuario        text,
  criado_em      timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists nsp_capacitacoes_data_idx on public.nsp_capacitacoes (data desc);
create index if not exists nsp_capacitacoes_meta_idx on public.nsp_capacitacoes (meta);

-- Verificação
select 'NSP: nsp_capacitacoes ok' as resultado;


-- ┌────────────────────────────────────────────────────────────
-- │ 53/75 — migracao-nsp-comunicados.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- NSP — Comunicação / mural de segurança (Fase 2d)
--
-- Base: PNSP (Portaria 529/2013) e RDC 36/2013 — comunicar riscos e lições
-- aprendidas é parte da gestão de segurança. Mural de comunicados do NSP para
-- a equipe: alertas de segurança, lições aprendidas (que podem nascer de um
-- incidente/RCA) e informativos, com prioridade e público-alvo. Fecha o ciclo
-- "aprender com o erro → comunicar".
--
-- 1 tabela: nsp_comunicados (editável → upsert por id na tela). Sem seed.
-- `incidente_id` liga a lição aprendida ao evento que a gerou (opcional).
--
-- Aditiva e idempotente. Rodar no SQL Editor — primeiro no DEMO, depois no
-- PRINCIPAL (HNSN).
-- ═══════════════════════════════════════════════════════════

create table if not exists public.nsp_comunicados (
  id            uuid primary key default gen_random_uuid(),
  titulo        text    not null,
  tipo          text    not null default 'informativo',  -- alerta | licao_aprendida | informativo
  prioridade    text    not null default 'media',        -- alta | media | baixa
  conteudo      text,
  publico_alvo  text,
  data          date,
  incidente_id  uuid,                    -- origem (opcional): incidente/RCA que gerou o comunicado
  status        text    not null default 'ativo',        -- ativo | arquivado
  ativo         boolean not null default true,
  autor         text,                    -- quem publicou (autoria congelada)
  usuario       text,
  criado_em     timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists nsp_comunicados_status_idx on public.nsp_comunicados (status, criado_em desc);

-- Verificação
select 'NSP: nsp_comunicados ok' as resultado;


-- ┌────────────────────────────────────────────────────────────
-- │ 54/75 — migracao-protocolos.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- PROTOCOLOS CLÍNICOS GERENCIADOS (Tier 1 — Fase 3a: Sepse)
--
-- Linhas de cuidado tempo-dependentes ("tempo é tecido"): sepse, IAM, AVC, TEV.
-- Cada protocolo = GATILHO (acende do que já existe: NEWS/triagem) → BUNDLE com
-- RELÓGIO (passos com alvo em minutos) → INDICADORES porta→ação, POR SETOR.
--
-- Modelo (refino da Laura: "cada setor assistencial tem o seu protocolo"):
--   • prot_catalogo     — TEMPLATE clínico comum, editável ("em validação"). A
--                         Sepse é a Sepse (bundle ILAS 1h); passos/alvos ficam em
--                         jsonb para o ADM Master ajustar na tela sem migração.
--   • prot_setor        — INSTÂNCIA por setor: cada setor liga o seu protocolo e
--                         ajusta o que é dele (janela, alvos, responsável).
--   • prot_ativacoes    — ACIONAMENTO por paciente/setor (append-only), com os
--                         carimbos de tempo. O relógio corre de acionado_em.
--   • prot_bundle_itens — PASSOS executados/checados de uma ativação (append-only);
--                         feito_em de cada passo alimenta os KPIs porta→ação.
--
-- DIFERENCIAL: o gatilho acende sozinho (NEWS ≥ 5 com foco infeccioso) e cutuca
-- onde o paciente está — não espera alguém "abrir" o protocolo.
--
-- Aditiva e idempotente. Rodar no SQL Editor — DEMO primeiro, depois HNSN.
-- ON CONFLICT DO NOTHING: reexecutar não sobrescreve edições da equipe.
-- ═══════════════════════════════════════════════════════════

-- 1) TEMPLATE clínico comum (editável, "em validação")
create table if not exists public.prot_catalogo (
  id           uuid primary key default gen_random_uuid(),
  chave        text not null,             -- slug do protocolo (sepse|iam|avc|tev) — seed idempotente
  titulo       text not null,
  categoria    text,                      -- sepse|cardiologico|neurologico|tromboembolismo
  gatilho      jsonb,                     -- ex.: {"tipo":"news","min":5,"obs":"..."}
  passos       jsonb not null default '[]'::jsonb,  -- [{chave,rotulo,alvo_min,ordem,critico}]
  janela_min   int,                       -- alvo total do bundle (ex.: 60 = pacote de 1h)
  referencia   text,                      -- diretriz / fonte (ILAS, SSC, AHA…)
  status       text not null default 'em_validacao',  -- em_validacao | vigente | suspenso
  ativo        boolean not null default true,
  validado     boolean not null default false,
  usuario      text,
  criado_em    timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists prot_catalogo_chave_idx on public.prot_catalogo (chave);

-- 2) INSTÂNCIA por setor assistencial (cada setor tem o seu)
create table if not exists public.prot_setor (
  id             uuid primary key default gen_random_uuid(),
  setor          text not null,           -- setores.nome (setor assistencial)
  protocolo      text not null,           -- prot_catalogo.chave
  ativo          boolean not null default true,
  janela_min     int,                     -- override do alvo total (null = usa o do template)
  passos_over    jsonb,                   -- override dos alvos por passo (null = usa o template)
  responsavel    text,                    -- quem responde pelo protocolo naquele setor
  validado       boolean not null default false,   -- "em validação" até a equipe do setor confirmar
  usuario        text,
  criado_em      timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists prot_setor_uk on public.prot_setor (setor, protocolo);

-- 3) ACIONAMENTO por paciente/setor (append-only — o relógio corre daqui)
create table if not exists public.prot_ativacoes (
  id            uuid primary key default gen_random_uuid(),
  numero        bigint generated always as identity,  -- número humano (PROT-<numero>)
  protocolo     text not null,            -- prot_catalogo.chave
  setor         text,                     -- onde o paciente está
  prontuario    text,
  episodio_id   uuid,
  paciente_nome text,                     -- iniciais / rótulo curto
  leito         text,
  gatilho_ref   jsonb,                    -- snapshot congelado do gatilho (ex.: {"news":6,"fc":118,...})
  acionado_por  text,
  acionado_em   timestamptz not null default now(),   -- t0 do relógio
  status        text not null default 'ativa',        -- ativa | concluida | cancelada | expirada
  encerrado_em  timestamptz,
  desfecho      text,                     -- confirmado | descartado | transferido | obito
  motivo        text,
  criado_em     timestamptz not null default now()
);
create index if not exists prot_ativ_status_idx on public.prot_ativacoes (status, acionado_em desc);
create index if not exists prot_ativ_setor_idx  on public.prot_ativacoes (setor, acionado_em desc);
create index if not exists prot_ativ_pront_idx  on public.prot_ativacoes (prontuario, acionado_em desc);

-- 4) PASSOS do bundle executados/checados (append-only)
create table if not exists public.prot_bundle_itens (
  id           uuid primary key default gen_random_uuid(),
  ativacao_id  uuid not null,
  passo        text not null,             -- prot_catalogo.passos[].chave (lactato|hemocultura|atb|...)
  rotulo       text,
  feito        boolean not null default true,
  nao_aplica   boolean not null default false,   -- justificadamente não se aplica
  valor        text,                      -- ex.: valor do lactato, nome do ATB
  obs          text,
  feito_por    text,
  feito_em     timestamptz not null default now(),
  criado_em    timestamptz not null default now()
);
create index if not exists prot_item_ativ_idx on public.prot_bundle_itens (ativacao_id, feito_em);

-- ── Seed do template da Sepse (rascunho "em validação" — ILAS / Surviving Sepsis) ──
-- Pacote de 1 hora. Passos e alvos são editáveis na tela pelo ADM Master.
insert into public.prot_catalogo (chave, titulo, categoria, gatilho, passos, janela_min, referencia, status) values
  ('sepse',
   'Sepse e choque séptico — pacote de 1 hora',
   'sepse',
   '{"tipo":"news","min":5,"obs":"NEWS >= 5 com suspeita de foco infeccioso"}'::jsonb,
   '[
      {"chave":"lactato",     "rotulo":"Coletar lactato sérico",                                  "alvo_min":30, "ordem":1, "critico":true},
      {"chave":"hemocultura", "rotulo":"Coletar 2 hemoculturas ANTES do antibiótico",             "alvo_min":45, "ordem":2, "critico":true},
      {"chave":"atb",         "rotulo":"Antibiótico de amplo espectro EV",                        "alvo_min":60, "ordem":3, "critico":true},
      {"chave":"cristaloide", "rotulo":"Cristaloide 30 mL/kg se hipotensão ou lactato >= 4",      "alvo_min":60, "ordem":4, "critico":true},
      {"chave":"vasopressor", "rotulo":"Vasopressor se PAM < 65 após volume",                     "alvo_min":60, "ordem":5, "critico":false},
      {"chave":"reavaliar",   "rotulo":"Reavaliar lactato e perfusão",                            "alvo_min":120,"ordem":6, "critico":false}
    ]'::jsonb,
   60,
   'ILAS (Instituto Latino-Americano de Sepse) / Surviving Sepsis Campaign',
   'em_validacao')
on conflict (chave) do nothing;

-- Verificação
select 'PROTOCOLOS: prot_catalogo + prot_setor + prot_ativacoes + prot_bundle_itens ok — '
       || (select count(*) from public.prot_catalogo) || ' template(s)' as resultado;


-- ┌────────────────────────────────────────────────────────────
-- │ 55/75 — migracao-protocolos-iam.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- PROTOCOLOS CLÍNICOS — Fase 3b: Dor torácica / IAM (seed do template)
--
-- Só semeia o template do IAM em prot_catalogo (as tabelas já vieram na
-- migracao-protocolos.sql da 3a). Pacote porta→ECG: a estrela é o ECG de 12
-- derivações em ≤ 10 min. Gatilho por queixa (texto livre) → sugestão; o
-- acionamento é manual. Passos/alvos editáveis na tela pelo ADM Master.
--
-- Aditiva e idempotente. Rodar no SQL Editor — DEMO primeiro, depois HNSN.
-- ON CONFLICT (chave) DO NOTHING: reexecutar não sobrescreve edições da equipe.
-- ═══════════════════════════════════════════════════════════

insert into public.prot_catalogo (chave, titulo, categoria, gatilho, passos, janela_min, referencia, status) values
  ('iam',
   'Dor torácica / IAM — porta→ECG',
   'cardiologico',
   '{"tipo":"queixa","termos":["dor torácica","precordial","dor no peito"],"obs":"ECG em <= 10 min da chegada; acionamento manual com sugestão pela queixa"}'::jsonb,
   '[
      {"chave":"ecg",        "rotulo":"ECG de 12 derivações",                                                "alvo_min":10, "ordem":1, "critico":true},
      {"chave":"aas",        "rotulo":"AAS 150-300 mg VO (mastigar), se sem contraindicação",                "alvo_min":10, "ordem":2, "critico":true},
      {"chave":"troponina",  "rotulo":"Coletar troponina",                                                   "alvo_min":20, "ordem":3, "critico":true},
      {"chave":"monitor",    "rotulo":"Monitorização + acesso venoso + O2 se SpO2 < 90",                     "alvo_min":10, "ordem":4, "critico":false},
      {"chave":"reperfusao", "rotulo":"Avaliar SCA: com supra de ST -> reperfusão; sem supra -> estratificar","alvo_min":60, "ordem":5, "critico":true},
      {"chave":"analgesia",  "rotulo":"Analgesia / nitrato conforme protocolo",                              "alvo_min":30, "ordem":6, "critico":false}
    ]'::jsonb,
   10,
   'AHA/ACC; Diretriz SBC de Síndromes Coronarianas Agudas',
   'em_validacao')
on conflict (chave) do nothing;

-- Verificação
select 'PROTOCOLOS 3b: template IAM ok — ' || (select count(*) from public.prot_catalogo where chave = 'iam') || ' linha(s)' as resultado;


-- ┌────────────────────────────────────────────────────────────
-- │ 56/75 — migracao-protocolos-avc.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- PROTOCOLOS CLÍNICOS — Fase 3c: AVC (seed do template)
--
-- Só semeia o template do AVC em prot_catalogo (as tabelas vieram na
-- migracao-protocolos.sql da 3a). Pacote porta→TC: TC de crânio ≤ 25 min.
-- Gatilho por queixa (texto livre) → sugestão; acionamento manual.
--
-- ⚠️ O dado mais decisivo do AVC é o INÍCIO DOS SINTOMAS ("último visto bem"):
-- define a janela de trombólise (≤ 4,5h). Ele é capturado no acionamento e
-- guardado em prot_ativacoes.gatilho_ref (jsonb) — a janela de 4,5h é constante
-- clínica no motor (janelaTerapeutica), não precisa de coluna nem de config.
--
-- Aditiva e idempotente. Rodar no SQL Editor — DEMO primeiro, depois HNSN.
-- ON CONFLICT (chave) DO NOTHING: reexecutar não sobrescreve edições da equipe.
-- ═══════════════════════════════════════════════════════════

insert into public.prot_catalogo (chave, titulo, categoria, gatilho, passos, janela_min, referencia, status) values
  ('avc',
   'AVC — porta→TC/trombólise',
   'neurologico',
   '{"tipo":"queixa","termos":["déficit neurológico","fraqueza","boca torta","fala alterada"],"obs":"Sugestão pela queixa; acionamento manual. Checar SEMPRE o início dos sintomas (janela de trombólise <= 4,5h)."}'::jsonb,
   '[
      {"chave":"codigo_avc", "rotulo":"Acionar código AVC + glicemia capilar",          "alvo_min":5,  "ordem":1, "critico":false},
      {"chave":"tc",         "rotulo":"TC de crânio sem contraste",                      "alvo_min":25, "ordem":2, "critico":true},
      {"chave":"laudo",      "rotulo":"Laudo da TC",                                     "alvo_min":45, "ordem":3, "critico":true},
      {"chave":"nihss",      "rotulo":"NIHSS (gravidade do déficit)",                    "alvo_min":20, "ordem":4, "critico":false},
      {"chave":"reperfusao", "rotulo":"Avaliar trombólise/trombectomia (porta->agulha)","alvo_min":60, "ordem":5, "critico":true}
    ]'::jsonb,
   25,
   'AHA/ASA; Linha de Cuidado do AVC (Ministério da Saúde)',
   'em_validacao')
on conflict (chave) do nothing;

-- Verificação
select 'PROTOCOLOS 3c: template AVC ok — ' || (select count(*) from public.prot_catalogo where chave = 'avc') || ' linha(s)' as resultado;


-- ┌────────────────────────────────────────────────────────────
-- │ 57/75 — migracao-protocolos-tev.sql
-- └────────────────────────────────────────────────────────────
-- ===========================================================
-- PROTOCOLOS CLINICOS -- Fase 3d: TEV / profilaxia (seed do template)
--
-- So semeia o template do TEV em prot_catalogo (as tabelas vieram na 3a).
-- TEV nao e bundle agudo: e uma AVALIACAO (escore de Padua) de todo internado.
-- Os "passos" aqui sao os FATORES de Padua (com pontos), nao etapas com relogio.
-- A estrutura fixa dos fatores e o corte (>=4) vivem no motor/catalogo JS; este
-- seed existe para o status "em validacao" e o registro do protocolo no banco.
--
-- Aditiva e idempotente. Rodar no SQL Editor -- DEMO primeiro, depois HNSN.
-- ON CONFLICT (chave) DO NOTHING: reexecutar nao sobrescreve edicoes.
-- ===========================================================

insert into public.prot_catalogo (chave, titulo, categoria, gatilho, passos, janela_min, referencia, status) values
  ('tev',
   'Profilaxia de TEV no internado',
   'tromboembolismo',
   '{"tipo":"internacao","obs":"Rastreio de todo internado (nao e evento agudo)"}'::jsonb,
   '[
      {"chave":"cancer","rotulo":"Cancer ativo","pontos":3},
      {"chave":"tev_previo","rotulo":"TEV previo (exceto trombose venosa superficial)","pontos":3},
      {"chave":"mobilidade","rotulo":"Mobilidade reduzida (repouso >= 3 dias)","pontos":3},
      {"chave":"trombofilia","rotulo":"Trombofilia conhecida","pontos":3},
      {"chave":"trauma_cirurgia","rotulo":"Trauma e/ou cirurgia recente (<= 1 mes)","pontos":2},
      {"chave":"idade","rotulo":"Idade >= 70 anos","pontos":1},
      {"chave":"cardio_resp","rotulo":"Insuficiencia cardiaca e/ou respiratoria","pontos":1},
      {"chave":"iam_avc","rotulo":"IAM e/ou AVC isquemico","pontos":1},
      {"chave":"infeccao_reuma","rotulo":"Infeccao aguda e/ou doenca reumatologica","pontos":1},
      {"chave":"obesidade","rotulo":"Obesidade (IMC >= 30)","pontos":1},
      {"chave":"hormonio","rotulo":"Terapia hormonal em curso","pontos":1}
    ]'::jsonb,
   null,
   'Escore de Padua; ACCP; SBACV',
   'em_validacao')
on conflict (chave) do nothing;

select count(*) as tev_templates from public.prot_catalogo where chave = 'tev';


-- ┌────────────────────────────────────────────────────────────
-- │ 58/75 — migracao-perfis-nsp.sql
-- └────────────────────────────────────────────────────────────
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
  ('gestao',             'nsp', 'leitura'),
  -- TI e Provisório: o seed de `migracao-perfis-acesso.sql` SEMPRE declarou
  -- estes dois com NSP, mas os bancos rodaram aquela migração antes de o
  -- módulo existir — e `on conflict do nothing` nunca volta para inserir
  -- linha nova. Resultado: o arquivo dizia uma coisa e o banco tinha outra,
  -- em silêncio, desde então. Descoberto percorrendo a tela: o adm_master
  -- não via "Segurança do Paciente" no menu.
  --
  -- ⚠️ O Provisório é o que segura a equipe inteira hoje. Sem esta linha,
  --    fechar o RLS tiraria o NSP de TODO MUNDO de uma vez.
  ('ti',                 'nsp', 'escrita'),
  ('provisorio',         'nsp', 'escrita')
on conflict (perfil_chave, modulo) do nothing;


-- ═══════════════════════════════════════════════════════════
-- CONFERÊNCIA — rode junto.
-- Esperado: 15 linhas, e a coluna "situacao" toda ✅.
--
-- Para conferir a matriz INTEIRA (não só o NSP) contra o catálogo do
-- código, rode `supabase/conferencia-perfis.sql`. Foi ele que apareceu
-- depois deste susto: o arquivo estava certo e o banco atrasado.
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
                    'farmaceutico','aux_farmacia','recepcao','diretor_tecnico','gestao',
                    'ti','provisorio')
 order by situacao desc, pa.chave;


-- ┌────────────────────────────────────────────────────────────
-- │ 59/75 — migracao-sigtap.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- SIGTAP — tabela de procedimentos do SUS (Tier 1 — Fase 4: Faturamento)
--
-- A tabela oficial do SUS: todo procedimento faturável, seu valor e as
-- regras de quando ele é válido. O motor puro vive em src/atendimento/sigtap.js.
--
-- ESTA MIGRAÇÃO cria a espinha (sigtap_procedimentos) e semeia a LISTA CURADA
-- do HNSN — os 219 procedimentos que o hospital fatura hoje (grupo 03 clínicos
-- + 04 cirúrgicos), com a MÉDIA DE PERMANÊNCIA de cada um. Isso já sustenta a
-- glosa de permanência (permanência real da internação × média).
--
-- O QUE AINDA NÃO VEM AQUI (entra no import do pacote do DATASUS):
--   • valores em centavos (valor_sh/sp/sa), sexo e faixa etária;
--   • as relações CID×procedimento e CBO (tabelas sigtap_proc_cid/cbo).
-- Enquanto não vêm, o motor CALA nessas regras — não dá alarme falso.
--
-- COMPETÊNCIA no formato 'AAAA-MM' (com traço), igual ao faturamento.js do
-- Adauam, para a conta casar com o SIGTAP. O '2026-08' do seed é NOMINAL
-- (lista curada, sem vínculo a uma competência exata do DATASUS); o import
-- do DATASUS normaliza 'AAAAMM'→'AAAA-MM' e enriquece estas mesmas linhas.
--
-- READ-ONLY: valor oficial não se edita à mão (editar = glosa na certa). A
-- camada editável é do hospital, por cima. RLS de leitura ([TODOS], é
-- referência sem paciente) vem do migracao-rls-leitura.sql gerado.
--
-- Aditiva e idempotente. Rodar no SQL Editor — DEMO primeiro, depois HNSN.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.sigtap_procedimentos (
  id                uuid primary key default gen_random_uuid(),
  competencia       text not null,                 -- 'AAAA-MM' (nominal na base curada; exata no import)
  codigo            text not null,                 -- 10 dígitos limpos (0303010037)
  nome              text not null,
  grupo             text,                          -- 2 primeiros dígitos (03 clínico, 04 cirúrgico)
  via               text,                          -- aih | apac | bpa (instrumento de registro)
  media_permanencia int,                           -- dias (null = não se aplica)
  valor_sh          bigint,                        -- centavos — serviço hospitalar (do DATASUS)
  valor_sp          bigint,                        -- centavos — serviço profissional (do DATASUS)
  valor_sa          bigint,                        -- centavos — ambulatorial (do DATASUS)
  sexo              text,                          -- 'M' | 'F' | null (ambos)
  idade_min         int,                           -- anos (null = sem mínimo)
  idade_max         int,                           -- anos (null = sem máximo)
  origem            text not null default 'hnsn',  -- hnsn (lista curada) | datasus (importado)
  usado_hnsn        boolean not null default false,-- procedimento que o HNSN fatura
  criado_em         timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists sigtap_proc_uk on public.sigtap_procedimentos (competencia, codigo);
create index if not exists sigtap_proc_via_idx on public.sigtap_procedimentos (competencia, via);

-- ── Seed: lista curada do HNSN (o arquivo "procedimentos_sus media perm") ──
-- competência, código, nome, grupo, via, média de permanência, origem, usado_hnsn
insert into public.sigtap_procedimentos
  (competencia, codigo, nome, grupo, via, media_permanencia, origem, usado_hnsn) values
  ('2026-08','0301060088','DIAGNOSTICO E/OU ATENDIMENTO DE URGENCIA EM CLINICA MÉDICA','03','aih',1,'hnsn',true),
  ('2026-08','0303010037','TRATAMENTO DE OUTRAS DOENÇAS BACTERIANAS','03','aih',6,'hnsn',true),
  ('2026-08','0303010061','TRATAMENTO DE DOENÇAS INFECCIOSAS INTESTINAIS','03','aih',4,'hnsn',true),
  ('2026-08','0303010070','TRATAMENTO DE FEBRES POR ARBOVÍRUS E FEBRES HEMORRÁGICAS VIRAIS','03','aih',5,'hnsn',true),
  ('2026-08','0303010134','TRATAMENTO DE INFECÇÕES VIRAIS CARACTERIZADAS POR LESÕES DE PELE E MUCOSAS (B00 A B09)','03','aih',4,'hnsn',true),
  ('2026-08','0303010215','TRATAMENTO DE TUBERCULOSE (A15 A A19)','03','aih',null,'hnsn',true),
  ('2026-08','0303020032','TRATAMENTO DE ANEMIA APLASTICA E OUTRAS ANEMIAS','03','aih',6,'hnsn',true),
  ('2026-08','0303020040','TRATAMENTO DE ANEMIA HEMOLITICA','03','aih',4,'hnsn',true),
  ('2026-08','0303020059','TRATAMENTO DE ANEMIAS NUTRICIONAIS','03','aih',4,'hnsn',true),
  ('2026-08','0303030038','TRATAMENTO DE DIABETES MELLITUS','03','aih',4,'hnsn',true),
  ('2026-08','0303030046','TRATAMENTO DE DISTURBIOS METABOLICOS','03','aih',3,'hnsn',true),
  ('2026-08','0303030054','TRATAMENTO DE TRANSTORNOS DA GLÂNDULA TIREOIDE','03','aih',4,'hnsn',true),
  ('2026-08','0303040076','TRATAMENTO CONSERVADOR DA HEMORRAGIA CEREBRAL','03','aih',7,'hnsn',true),
  ('2026-08','0303040084','TRATAMENTO CONSERVADOR DE TRAUMATISMO CRANIOENCEFÁLICO (GRAU LEVE)','03','aih',2,'hnsn',true),
  ('2026-08','0303040092','TRATAMENTO CONSERVADOR DE TRAUMATISMO CRANIOENCEFALICO (GRAU MÉDIO)','03','aih',7,'hnsn',true),
  ('2026-08','0303040149','TRATAMENTO DE ACIDENTE VASCULAR CEREBRAL - AVC (ISQUEMICO OU HEMORRAGICO AGUDO)','03','aih',7,'hnsn',true),
  ('2026-08','0303040165','TRATAMENTO DE CRISES EPILÉTICAS NÃO CONTROLADAS','03','aih',4,'hnsn',true),
  ('2026-08','0303040203','TRATAMENTO DE DOENÇAS NEURODEGENERATIVAS','03','aih',7,'hnsn',true),
  ('2026-08','0303040211','TRATAMENTO DE ENCEFALOPATIA HIPERTENSIVA','03','aih',4,'hnsn',true),
  ('2026-08','0303040238','TRATAMENTO DE FRATURA DA COLUNA VERTEBRAL C/ LESÃO DA MEDULA ESPINHAL','03','aih',6,'hnsn',true),
  ('2026-08','0303040300','TRATAMENTO DO ACIDENTE VASCULAR CEREBRAL ISQUÊMICO AGUDO COM USO DE TROMBOLÍTICO','03','aih',7,'hnsn',true),
  ('2026-08','0303060018','TRATAMENTO DE ANEURISMA DA AORTA','03','aih',4,'hnsn',true),
  ('2026-08','0303060026','TRATAMENTO DE ARRITMIAS','03','aih',4,'hnsn',true),
  ('2026-08','0303060034','TRATAMENTO DE CARDIOPATIA HIPERTROFICA','03','aih',6,'hnsn',true),
  ('2026-08','0303060042','TRATAMENTO DE CARDIOPATIA ISQUEMICA CRONICA','03','aih',6,'hnsn',true),
  ('2026-08','0303060050','TRATAMENTO DE CHOQUE ANAFILATICO','03','aih',3,'hnsn',true),
  ('2026-08','0303060077','TRATAMENTO DE CHOQUE HIPOVOLEMICO','03','aih',5,'hnsn',true),
  ('2026-08','0303060131','TRATAMENTO DE EDEMA AGUDO DE PULMAO','03','aih',6,'hnsn',true),
  ('2026-08','0303060140','TRATAMENTO DE EMBOLIA PULMONAR','03','aih',10,'hnsn',true),
  ('2026-08','0303060190','TRATAMENTO DE INFARTO AGUDO DO MIOCÁRDIO','03','aih',7,'hnsn',true),
  ('2026-08','0303060204','TRATAMENTO DE INSUFICIENCIA ARTERIAL C/ ISQUEMIA CRITICA','03','aih',5,'hnsn',true),
  ('2026-08','0303060212','TRATAMENTO DE INSUFICIENCIA CARDIACA','03','aih',4,'hnsn',true),
  ('2026-08','0303060239','TRATAMENTO DE MIOCARDIOPATIAS','03','aih',6,'hnsn',true),
  ('2026-08','0303060255','TRATAMENTO DE PARADA CARDIACA C/ RESSUSCITACAO','03','aih',5,'hnsn',true),
  ('2026-08','0303060263','TRATAMENTO DE PÉ DIABÉTICO COMPLICADO','03','aih',5,'hnsn',true),
  ('2026-08','0303060280','TRATAMENTO DE SINDROME CORONARIANA AGUDA','03','aih',4,'hnsn',true),
  ('2026-08','0303060298','TRATAMENTO DE TROMBOSE VENOSA PROFUNDA','03','aih',4,'hnsn',true),
  ('2026-08','0303070072','TRATAMENTO DE DOENCAS DO FIGADO','03','aih',8,'hnsn',true),
  ('2026-08','0303070099','TRATAMENTO DE ENTERITES E COLITES NAO INFECCIOSAS','03','aih',6,'hnsn',true),
  ('2026-08','0303070102','TRATAMENTO DE OUTRAS DOENCAS DO APARELHO DIGESTIVO','03','aih',3,'hnsn',true),
  ('2026-08','0303070110','TRATAMENTO DE OUTRAS DOENCAS DO INTESTINO','03','aih',4,'hnsn',true),
  ('2026-08','0303070129','TRATAMENTO DE TRANSTORNOS DAS VIAS BILIARES E PANCREAS','03','aih',5,'hnsn',true),
  ('2026-08','0303080086','TRATAMENTO DE FARMACODERMIAS','03','aih',5,'hnsn',true),
  ('2026-08','0303080094','TRATAMENTO DE OUTRAS AFECÇÕES DA PELE E DO TECIDO SUBCUTANEO','03','aih',4,'hnsn',true),
  ('2026-08','0303090243','TRATAMENTO CONSERVADOR DE LESAO DA COLUNA TORACO-LOMBO-SACRA S/ IMOBILIZACAO','03','aih',null,'hnsn',true),
  ('2026-08','0303100036','TRATAMENTO DE EDEMA, PROTEINURIA E TRANSTORNOS HIPERTENSIVOS NA GRAVIDEZ PARTO E PUERPERIO','03','aih',3,'hnsn',true),
  ('2026-08','0303100044','TRATAMENTO DE INTERCORRENCIAS CLINICAS NA GRAVIDEZ','03','aih',3,'hnsn',true),
  ('2026-08','0303110066','TRATAMENTO DE MALFORMACOES CONGENITAS DO APARELHO URINARIO','03','aih',4,'hnsn',true),
  ('2026-08','0303140046','TRATAMENTO DAS DOENCAS CRONICAS DAS VIAS AEREAS INFERIORES','03','aih',3,'hnsn',true),
  ('2026-08','0303140054','TRATAMENTO DAS DOENCAS PULMONARES DEVIDO A AGENTES EXTERNOS','03','aih',3,'hnsn',true),
  ('2026-08','0303140070','TRATAMENTO DE DOENÇA DO OUVIDO EXTERNO MÉDIO E DA MASTÓIDE','03','aih',1,'hnsn',true),
  ('2026-08','0303140100','TRATAMENTO DE INFECCOES AGUDAS DAS VIAS AEREAS SUPERIORES','03','aih',2,'hnsn',true),
  ('2026-08','0303140119','TRATAMENTO DE OUTRAS DOENCAS DA PLEURA','03','aih',2,'hnsn',true),
  ('2026-08','0303140135','TRATAMENTO DE OUTRAS DOENCAS DO APARELHO RESPIRATORIO','03','aih',4,'hnsn',true),
  ('2026-08','0303140143','TRATAMENTO DE OUTRAS INFECCOES AGUDAS DAS VIAS AEREAS INFERIORES','03','aih',3,'hnsn',true),
  ('2026-08','0303140151','TRATAMENTO DE PNEUMONIAS OU INFLUENZA (GRIPE)','03','aih',4,'hnsn',true),
  ('2026-08','0303150050','TRATAMENTO DE OUTRAS DOENCAS DO APARELHO URINARIO','03','aih',2,'hnsn',true),
  ('2026-08','0303150068','TRATAMENTO DE OUTROS TRANSTORNOS DO RIM E DO URETER','03','aih',4,'hnsn',true),
  ('2026-08','0303160047','TRATAMENTO DE TRANSTORNOS HEMORRAGICOS E HEMATOLOGICOS DO FETO E DO RECEM-NASCIDO','03','aih',4,'hnsn',true),
  ('2026-08','0303160055','TRATAMENTO DE TRANSTORNOS RELACIONADOS C/ A DURACAO DA GESTACAO E C/ O CRESCIMENTO FETAL','03','aih',10,'hnsn',true),
  ('2026-08','0303160063','TRATAMENTO DE TRANSTORNOS RESPIRATORIOS E CARDIOVASCULARES ESPECIFICOS DO PERIODO NEONATAL','03','aih',8,'hnsn',true),
  ('2026-08','0303170131','TRATAMENTO CLÍNICO EM SAÚDE MENTAL EM SITUAÇÃO DE RISCO','03','aih',null,'hnsn',true),
  ('2026-08','0303170140','TRATAMENTO CLÍNICO PARA CONTENÇÃO DE COMPORTAMENTO DESORGANIZADO E/OU DISRUPTIVO','03','aih',null,'hnsn',true),
  ('2026-08','0303170166','TRATAMENTO CLÍNICO DE TRANSTORNOS MENTAIS E COMPORTAMENTAIS DEVIDO AO USO DE ÁLCOOL','03','aih',null,'hnsn',true),
  ('2026-08','0303170174','TRATAMENTO CLÍNICO DE TRANSTORNOS MENTAIS E COMPORTAMENTAIS DEVIDO AO USO DE “CRACK”.','03','aih',null,'hnsn',true),
  ('2026-08','0303170182','TRATAMENTO CLÍNICO DOS TRANSTORNOS MENTAIS E COMPORTAMENTAIS DEVIDO AO USO DAS DEMAIS DROGAS','03','aih',null,'hnsn',true),
  ('2026-08','0304100013','TRATAMENTO DE INTERCORRÊNCIAS CLÍNICAS DE PACIENTE ONCOLÓGICO','03','aih',8,'hnsn',true),
  ('2026-08','0305010174','TRATAMENTO DE INTERCORRÊNCIA EM PACIENTE RENAL CRÔNICO SOB TRATAMENTO DIALÍTICO ( POR DIA)','03','aih',null,'hnsn',true),
  ('2026-08','0305020013','TRATAMENTO DA PIELONEFRITE','03','aih',2,'hnsn',true),
  ('2026-08','0305020021','TRATAMENTO DE CALCULOSE RENAL','03','aih',2,'hnsn',true),
  ('2026-08','0305020048','TRATAMENTO DE INSUFICIÊNCIA RENAL AGUDA','03','aih',4,'hnsn',true),
  ('2026-08','0305020056','TRATAMENTO DA DOENÇA RENAL CRÔNICA - DRC','03','aih',4,'hnsn',true),
  ('2026-08','0308010019','TRATAMENTO CLÍNICO/CONSERVADOR DE TRAUMATISMOS DE QUALQUER LOCALIZAÇÃO','03','aih',5,'hnsn',true),
  ('2026-08','0308010035','TRATAMENTO DE TRAUMATISMOS C/ LESAO DE ORGAO INTRA-TORACICO E INTRA-ABDOMINAL','03','aih',6,'hnsn',true),
  ('2026-08','0308010043','TRATAMENTO DE TRAUMATISMOS ENVOLVENDO MULTIPLAS REGIOES DO CORPO','03','aih',7,'hnsn',true),
  ('2026-08','0308020030','TRATAMENTO DE INTOXICACAO OU ENVENENAMENTO POR EXPOSICAO A MEDICAMENTO E SUBSTANCIAS DE USO NAO MEDICINAL','03','aih',3,'hnsn',true),
  ('2026-08','0308030036','TRATAMENTO DE QUEIMADURAS CORROSOES E GELADURAS','03','aih',5,'hnsn',true),
  ('2026-08','0308040015','TRATAMENTO DE COMPLICACOES DE PROCEDIMENTOS CIRURGICOS OU CLINICOS','03','aih',5,'hnsn',true),
  ('2026-08','0310010039','PARTO NORMAL','03','aih',2,'hnsn',true),
  ('2026-08','0401020053','EXCISÃO E SUTURA DE LESAO NA PELE C/ PLÁSTICA EM Z OU ROTAÇÃO DE RETALHO','04','aih',2,'hnsn',true),
  ('2026-08','0401020070','EXÉRESE DE CISTO DERMOIDE','04','aih',1,'hnsn',true),
  ('2026-08','0401020100','EXTIRPAÇÃOE SUPRESSÃO DE LESÃO DE PELE E DE TECIDO CELULAR SUBCUTÂNEO','04','aih',2,'hnsn',true),
  ('2026-08','0403020077','NEUROLISE NAO FUNCIONAL DE NERVOS PERIFERICOS','04','aih',1,'hnsn',true),
  ('2026-08','0403020123','TRATAMENTO CIRURGICO DE SINDROME COMPRESSIVA EM TUNEL OSTEO-FIBROSO AO NIVEL DO CARPO','04','aih',1,'hnsn',true),
  ('2026-08','0404010067','DRENAGEM DE ABSCESSO PERIAMIGDALIANO','04','aih',2,'hnsn',true),
  ('2026-08','0404010318','RETIRADA DE CORPO ESTRANHO DE OUVIDO / FARINGE / LARINGE / NARIZ','04','aih',2,'hnsn',true),
  ('2026-08','0404020550','OSTEOSSÍNTESE DE FRATURA SIMPLES DE MANDÍBULA','04','aih',1,'hnsn',true),
  ('2026-08','0405010079','EXÉRESE DE CALAZIO E OUTRAS PEQUENAS LESOES DA PALPEBRA E SUPERCILIOS','04','aih',1,'hnsn',true),
  ('2026-08','0406010684','IMPLANTE DE MARCAPASSO TEMPORÁRIO TRANSVENOSO','04','aih',2,'hnsn',true),
  ('2026-08','0406020507','TRATAMENTO CIRURGICO DE LESOES VASCULARES TRAUMATICAS DE MEMBRO INFERIOR BILATERAL','04','aih',4,'hnsn',true),
  ('2026-08','0407020039','APENDICECTOMIA','04','aih',3,'hnsn',true),
  ('2026-08','0407020047','APENDICECTOMIA VIDEOLAPAROSCÓPICA','04','aih',3,'hnsn',true),
  ('2026-08','0407020144','DRENAGEM DE ABSCESSO ISQUIORRETAL','04','aih',2,'hnsn',true),
  ('2026-08','0407020268','FECHAMENTO DE FÍSTULA DE RETO','04','aih',2,'hnsn',true),
  ('2026-08','0407020284','HEMORROIDECTOMIA','04','aih',2,'hnsn',true),
  ('2026-08','0407020365','REDUÇÃO CIRÚRGICA DE VOLVO POR LAPAROTOMIA','04','aih',4,'hnsn',true),
  ('2026-08','0407020462','TRATAMENTO CIRÚRGICO DE MA ROTAÇÃO INTESTINAL','04','aih',7,'hnsn',true),
  ('2026-08','0407030026','COLECISTECTOMIA','04','aih',3,'hnsn',true),
  ('2026-08','0407030034','COLECISTECTOMIA VIDEOLAPAROSCÓPICA','04','aih',2,'hnsn',true),
  ('2026-08','0407030042','COLECISTOSTOMIA','04','aih',3,'hnsn',true),
  ('2026-08','0407030255','COLANGIOPANCREATOGRAFIA RETRÓGRADA ENDOSCÓPICA TERAPÊUTICA','04','aih',2,'hnsn',true),
  ('2026-08','0407040013','DRENAGEM DE ABSCESSO PÉLVICO','04','aih',7,'hnsn',true),
  ('2026-08','0407040030','DRENAGEM DE HEMATOMA / ABSCESSO PRE-PERITONEAL','04','aih',5,'hnsn',true),
  ('2026-08','0407040064','HERNIOPLASTIA EPIGASTRICA','04','aih',1,'hnsn',true),
  ('2026-08','0407040080','HERNIOPLASTIA INCISIONAL','04','aih',2,'hnsn',true),
  ('2026-08','0407040099','HERNIOPLASTIA INGUINAL (BILATERAL)','04','aih',2,'hnsn',true),
  ('2026-08','0407040102','HERNIOPLASTIA INGUINAL / CRURAL (UNILATERAL)','04','aih',2,'hnsn',true),
  ('2026-08','0407040110','HERNIOPLASTIA RECIDIVANTE','04','aih',2,'hnsn',true),
  ('2026-08','0407040129','HERNIOPLASTIA UMBILICAL','04','aih',2,'hnsn',true),
  ('2026-08','0407040145','HERNIORRAFIA SEM RESSECÇÃO INTESTINAL (HÉRNIA ESTRANGULADA )','04','aih',2,'hnsn',true),
  ('2026-08','0407040161','LAPAROTOMIA EXPLORADORA','04','aih',5,'hnsn',true),
  ('2026-08','0407040188','LIBERAÇÃO DE ADERÊNCIAS INTESTINAIS','04','aih',6,'hnsn',true),
  ('2026-08','0407040226','REPARACAO DE OUTRAS HERNIAS','04','aih',2,'hnsn',true),
  ('2026-08','0407040250','TRATAMENTO CIRÚRGICO DE PERITONITE','04','aih',5,'hnsn',true),
  ('2026-08','0408010142','REPARO DE ROTURA DO MANGUITO ROTADOR (INCLUI PROCEDIMENTOS DESCOMPRESSIVOS)','04','aih',2,'hnsn',true),
  ('2026-08','0408010150','TRATAMENTO CIRÚRGICO DE FRATURA DA CLAVÍCULA','04','aih',2,'hnsn',true),
  ('2026-08','0408010185','TRATAMENTO CIRÚRGICO DE LUXAÇÃO / FRATURA-LUXAÇÃO ACROMIO-CLAVICULAR','04','aih',2,'hnsn',true),
  ('2026-08','0408010193','TRATAMENTO CIRÙRGICO DE LUXAÇÁO / FRATURA-LUXAÇÃO ESCÁPULO-UMERAL AGUDA','04','aih',3,'hnsn',true),
  ('2026-08','0408010223','TRATAMENTO CIRÚRGICO DE RETARDO DE CONSOLIDAÇÃO DA PSEUDARTROSE DE CLAVICULA / ESCAPULA','04','aih',2,'hnsn',true),
  ('2026-08','0408020121','REALINHAMENTO DE MECANISMO EXTENSOR DOS DEDOS DA MÃO','04','aih',1,'hnsn',true),
  ('2026-08','0408020148','RECONSTRUÇÃO DE POLIA TENDINOSA DOS DEDOS DA MÃO','04','aih',2,'hnsn',true),
  ('2026-08','0408020164','REDUÇAO INCRUENTA DE FRATURA / LESÃO FISARIA DO EXTREMO PROXIMAL DO ÚMERO','04','aih',2,'hnsn',true),
  ('2026-08','0408020229','TRATAMENTO CIRÚRGICO DE LUXAÇÃO / FRATURA-LUXACAO DO COTOVELO','04','aih',2,'hnsn',true),
  ('2026-08','0408020326','TRATAMENTO CIRÚRGICO DE DEDO EM GATILHO','04','aih',1,'hnsn',true),
  ('2026-08','0408020334','TRATAMENTO CIRÚRGICO DE FRATURA / LESÃO FISARIA DA EXTREMIDADE PROXIMAL DO UMERO','04','aih',4,'hnsn',true),
  ('2026-08','0408020342','TRATAMENTO CIRÚRGICO DE FRATURA / LESÃO FISARIA DAS FALANGES DA MÃO (COM FIXAÇÃO)','04','aih',2,'hnsn',true),
  ('2026-08','0408020369','TRATAMENTO CIRÚRGICO DE FRATURA / LESÃO FISARIA DO CÔNDILO / TRÓCLEA/APOFISE CORONÓIDE DO ULNA / CABEÇA DO RÁDIO','04','aih',3,'hnsn',true),
  ('2026-08','0408020377','TRATAMENTO CIRÚRGICO DE FRATURA / LESÃO FISARIA DOS METACARPIANOS','04','aih',2,'hnsn',true),
  ('2026-08','0408020385','TRATAMENTO CIRÚRGICO DE FRATURA / LESÃO FISARIA SUPRACONDILIANA DO ÚMERO','04','aih',3,'hnsn',true),
  ('2026-08','0408020393','TRATAMENTO CIRÚGICO DE FRATURA DA DIÁFISE DO ÚMERO','04','aih',2,'hnsn',true),
  ('2026-08','0408020407','TRATAMENTO CIRÚRGICO DE FRATURA DA EXTREMIDADE / METÁFISE DISTAL DOS OSSOS DO ANTEBRAÇO','04','aih',2,'hnsn',true),
  ('2026-08','0408020431','TRATAMENTO CIRÚRGICO DE FRATURA DIAFISARIA ÚNICA DO RÁDIO / DA ULNA','04','aih',2,'hnsn',true),
  ('2026-08','0408020512','TRATAMENTO CIRÚRGICO DE LUXAÇÃO / FRATURA-LUXAÇÃO CARPO-METACARPIANA','04','aih',2,'hnsn',true),
  ('2026-08','0408020539','TRATAMENTO CIRÚRGICO DE LUXAÇÃO / FRATURA-LUXAÇÃO METACARPO-FALANGIANA','04','aih',2,'hnsn',true),
  ('2026-08','0408020547','TRATAMENTO CIRÚRGICO DE LUXAÇÃO OU FRATURA-LUXAÇÃO DO COTOVELO','04','aih',3,'hnsn',true),
  ('2026-08','0408030399','DISCECTOMIA CERVICAL / LOMBAR / LOMBO-SACRA POR VIA POSTERIOR (UM NÍVEL)','04','aih',3,'hnsn',true),
  ('2026-08','0408040050','ARTROPLASTIA PARCIAL DE QUADRIL','04','aih',5,'hnsn',true),
  ('2026-08','0408040190','REDUÇÃO INCRUENTA DE LUXAÇÃO COXOFEMORAL TRAUMÁTICA / PÓS-ARTROPLASTIA','04','aih',3,'hnsn',true),
  ('2026-08','0408040246','TRATAMENTO CIRÚRGICO DA AVULSÃO DE TUBEROSIDADES / ESPINHAS E CRISTA ILÍACA S/ LESÃO DO ANEL PÉLVICO','04','aih',3,'hnsn',true),
  ('2026-08','0408040343','TRATAMENTO CIRURGICO DE LUXACAO ESPONTANEA / PROGRESSIVA / PARALITICA DO QUADRIL','04','aih',5,'hnsn',true),
  ('2026-08','0408050020','AMPUTACAO / DESARTICULACAO DE PE E TARSO','04','aih',3,'hnsn',true),
  ('2026-08','0408050136','RECONSTRUÇÃODE TENDAO PATELAR / TENDAO QUADRICIPITA','04','aih',3,'hnsn',true),
  ('2026-08','0408050160','RECONSTRUÇÃO LIGAMENTAR INTRA-ARTICULAR DO JOELHO (CRUZADO ANTERIOR)','04','aih',2,'hnsn',true),
  ('2026-08','0408050179','RECONSTRUÇÃOLIGAMENTAR INTRA-ARTICULAR DO JOELHO (CRUZADO POSTERIOR COM OU SEM ANTERIOR)','04','aih',3,'hnsn',true),
  ('2026-08','0408050217','REDUCAO INCRUENTA DE FRATURA / LUXACAO / FRATURA-LUXACAO DO TORNOZELO','04','aih',2,'hnsn',true),
  ('2026-08','0408050225','REDUCAO INCRUENTA DE FRATURA DIAFISARIA / LESAO FISARIA DISTAL DA TIBIA C/ OU S/ FRATURA DA FIBULA','04','aih',3,'hnsn',true),
  ('2026-08','0408050233','REDUCAO INCRUENTA DE FRATURA DIAFISARIA / LESAO FISARIA PROXIMAL DO FEMUR','04','aih',3,'hnsn',true),
  ('2026-08','0408050322','REPARO DE BAINHA TENDINOSA AO NIVEL DO TORNOZELO','04','aih',2,'hnsn',true),
  ('2026-08','0408050470','TRATAMENTO CIRURGICO DE FRATURA / LESAO FISARIA DOS PODODACTILOS','04','aih',3,'hnsn',true),
  ('2026-08','0408050489','TRATAMENTO CIRURGICO DE FRATURA / LESAO FISARIA PROXIMAL','04','aih',4,'hnsn',true),
  ('2026-08','0408050497','TRATAMENTO CIRÚRGICO DE FRATURA BIMALEOLAR / TRIMALEOLAR / DA FRATURA-LUXAÇÃO DO TORNOZELO','04','aih',3,'hnsn',true),
  ('2026-08','0408050500','TRATAMENTO CIRÚRGICO DE FRATURA DA DIÁFISE DA TÍBIA','04','aih',4,'hnsn',true),
  ('2026-08','0408050519','TRATAMENTO CIRÚRGICO DE FRATURA DA DIÁFISE DO FÊMUR','04','aih',4,'hnsn',true),
  ('2026-08','0408050527','TRATAMENTO CIRÚRGICO DE FRATURA DA PATELA POR FIXAÇÃO INTERNA','04','aih',3,'hnsn',true),
  ('2026-08','0408050535','TRATAMENTO CIRÚRGICO DE FRATURA DO CALCÂNEO','04','aih',3,'hnsn',true),
  ('2026-08','0408050543','TRATAMENTO CIRÚRGICO DE FRATURA DO PILÃO TIBIAL','04','aih',4,'hnsn',true),
  ('2026-08','0408050551','TRATAMENTO CIRÚRGICO DE FRATURA DO PLANALTO TIBIAL','04','aih',3,'hnsn',true),
  ('2026-08','0408050578','TRATAMENTO CIRÚRGICO DE FRATURA DO TORNOZELO UNIMALEOLAR','04','aih',3,'hnsn',true),
  ('2026-08','0408050594','TRATAMENTO CIRÚRGICO DE FRATURA LESÃO FISÁRIA AO NÍVEL DO JOELHO','04','aih',3,'hnsn',true),
  ('2026-08','0408050608','TRATAMENTO CIRÚRGICO DE FRATURA LESÃO FISÁRIA DISTAL DE TÍBIA','04','aih',3,'hnsn',true),
  ('2026-08','0408050632','TRATAMENTO CIRÚRGICO DE FRATURA TRANSTROCANTERIANA','04','aih',4,'hnsn',true),
  ('2026-08','0408050667','TRATAMENTO CIRÚRGICO DE LESÃO AGUDA CAPSULO-LIGAMENTAR MEMBRO INFERIOR (JOELHO / TORNOZELO)','04','aih',2,'hnsn',true),
  ('2026-08','0408050896','TRATAMENTO CIRÚRGICO DE ROTURA DO MENISCO COM MENISCECTOMIA PARCIAL / TOTAL','04','aih',1,'hnsn',true),
  ('2026-08','0408050926','TRATAMENTO DAS LESÕES OSTEO-CONDRAIS POR FIXAÇÃO OU MOSAICOPLASTIA JOELHO/TORNOZELO','04','aih',2,'hnsn',true),
  ('2026-08','0408060018','ALONGAMENTO / ENCURTAMENTO MIOTENDINOSO','04','aih',2,'hnsn',true),
  ('2026-08','0408060042','AMPUTAÇÃO / DESARTICULAÇÃO DE DEDO','04','aih',2,'hnsn',true),
  ('2026-08','0408060212','RESSECÇÃO DE CISTO SINOVIAL','04','aih',1,'hnsn',true),
  ('2026-08','0408060352','RETIRADA DE FIO OU PINO INTRA-ÓSSEO','04','aih',1,'hnsn',true),
  ('2026-08','0408060360','RETIRADA DE FIXADOR EXTERNO','04','aih',2,'hnsn',true),
  ('2026-08','0408060379','RETIRADA DE PLACA E/OU PARAFUSOS','04','aih',1,'hnsn',true),
  ('2026-08','0408060395','RETIRADA DE PRÓTESE DE SUBSTITUIÇÃO EM PEQUENAS E MÉDIAS ARTICULAÇÕES','04','aih',2,'hnsn',true),
  ('2026-08','0408060450','TENOMIORRAFIA','04','aih',2,'hnsn',true),
  ('2026-08','0408060476','TENOPLASTIA OU ENXERTO DE TENDÃO UNICO','04','aih',2,'hnsn',true),
  ('2026-08','0408060557','TRATAMENTO CIRÚRGICO DE ARTRITE INFECCIOSA (GRANDES E MÉDIAS ARTICULAÇÕES)','04','aih',5,'hnsn',true),
  ('2026-08','0408060573','TRATAMENTO CIRÚRGICO DE DEDO EM MARTELO / EM GARRA (MÃO E PÉ)','04','aih',1,'hnsn',true),
  ('2026-08','0408060590','TRATAMENTO CIRÚRGICO DE FRATURA VICIOSAMENTE CONSOLIDADA DOS OSSOS LONGOS EXCETO DA MÃO E DO PÉ','04','aih',3,'hnsn',true),
  ('2026-08','0409010065','CISTOLITOTOMIA E/OU RETIRADA DE CORPO ESTRANHO DA BEX','04','aih',2,'hnsn',true),
  ('2026-08','0409010090','CISTOSTOMIA','04','aih',3,'hnsn',true),
  ('2026-08','0409010170','INSTALAÇÃO ENDOSCÓPICA DE CATETER DUPLO J','04','aih',2,'hnsn',true),
  ('2026-08','0409010430','TRATAMENTO CIRÚRGICO DE CISTOCELE','04','aih',2,'hnsn',true),
  ('2026-08','0409020150','URETRORRAFIA','04','aih',3,'hnsn',true),
  ('2026-08','0409020176','URETROTOMIA INTERNA','04','aih',3,'hnsn',true),
  ('2026-08','0409030023','PROSTATECTOMIA SUPRAPÚBICA','04','aih',4,'hnsn',true),
  ('2026-08','0409030040','RESSECÇÃO ENDOSCÓPICA DE PRÓSTATA','04','aih',3,'hnsn',true),
  ('2026-08','0409040010','DRENAGEM DE ABSCESSO DA BOLSA ESCROTAL','04','aih',3,'hnsn',true),
  ('2026-08','0409040096','EXPLORACAO CIRURGICA DA BOLSA ESCROTAL','04','aih',2,'hnsn',true),
  ('2026-08','0409040185','REPARAÇÃO E OPERAÇÃO PLÁSTICA DO TESTÍCULO','04','aih',2,'hnsn',true),
  ('2026-08','0409040215','TRATAMENTO CIRÚRGICO DE HIDROCELE','04','aih',1,'hnsn',true),
  ('2026-08','0409040223','TRATAMENTO CIRÚRGICO DE TORÇÃO DO TESTÍCULO DO CORDÃO ESPERMÁTICO','04','aih',1,'hnsn',true),
  ('2026-08','0409040231','TRATAMENTO CIRÚRGICO DE VARICOCELE','04','aih',1,'hnsn',true),
  ('2026-08','0409040240','VASECTOMIA','04','aih',1,'hnsn',true),
  ('2026-08','0409050075','PLASTICA TOTAL DO PENIS','04','aih',2,'hnsn',true),
  ('2026-08','0409050083','POSTECTOMIA','04','aih',1,'hnsn',true),
  ('2026-08','0409050113','TRATAMENTO CIRURGICO DE PRIAPRISMO','04','aih',3,'hnsn',true),
  ('2026-08','0409060038','EXCISÃO TIPO 3 DO COLO UTERINO','04','aih',2,'hnsn',true),
  ('2026-08','0409060070','ESVAZIAMENTO DE UTERO POS-ABORTO POR ASPIRACAO MANUAL INTRA-UTERINA','04','aih',1,'hnsn',true),
  ('2026-08','0409060127','HISTERECTOMIA SUBTOTAL','04','aih',3,'hnsn',true),
  ('2026-08','0409060135','HISTERECTOMIA TOTAL','04','aih',3,'hnsn',true),
  ('2026-08','0409060186','LAQUEADURA TUBARIA','04','aih',1,'hnsn',true),
  ('2026-08','0409060232','SALPINGECTOMIA UNI / BILATERAL','04','aih',2,'hnsn',true),
  ('2026-08','0409060240','SALPINGECTOMIA VIDEOLAPAROSCOPICA','04','aih',2,'hnsn',true),
  ('2026-08','0409070092','COLPORRAFIA NAO OBSTETRICA','04','aih',1,'hnsn',true),
  ('2026-08','0409070190','MARSUPIALIZACAO DE GLÂNDULA DE BARTOLIN','04','aih',1,'hnsn',true),
  ('2026-08','0409070262','TRATAMENTO CIRURGICO DE HIPERTROFIA DOS PEQUENOS LABIOS','04','aih',1,'hnsn',true),
  ('2026-08','0410010014','DRENAGEM DE ABSCESSO DE MAMA','04','aih',2,'hnsn',true),
  ('2026-08','0411010034','PARTO CESARIANO','04','aih',2,'hnsn',true),
  ('2026-08','0411010042','PARTO CESARIANO C/ LAQUEADURA TUBARIA','04','aih',2,'hnsn',true),
  ('2026-08','0411010077','SUTURA DE LACERACOES DE TRAJETO PELVICO','04','aih',2,'hnsn',true),
  ('2026-08','0411020013','CURETAGEM POS-ABORTAMENTO / PUERPERAL','04','aih',1,'hnsn',true),
  ('2026-08','0411020048','TRATAMENTO CIRURGICO DE GRAVIDEZ ECTOPICA','04','aih',3,'hnsn',true),
  ('2026-08','0412020033','MEDIASTINOTOMIA P/ DRENAGEM','04','aih',5,'hnsn',true),
  ('2026-08','0412040166','TORACOSTOMIA COM DRENAGEM PLEURAL FECHADA','04','aih',5,'hnsn',true),
  ('2026-08','0413010015','ATENDIMENTO DE URGENCIA EM MEDIO E GRANDE QUEIMADO','04','aih',1,'hnsn',true),
  ('2026-08','0413010082','TRATAMENTO DE MEDIO QUEIMADO','04','aih',4,'hnsn',true),
  ('2026-08','0413040178','TRATAMENTO CIRURGICO DE LESOES EXTENSAS C/ PERDA DE SUBSTANCIA CUTANEA','04','aih',3,'hnsn',true),
  ('2026-08','0413040240','TRATAMENTO CIRURGICO P/ REPARACOES DE PERDA DE SUBSTANCIA DA MAO','04','aih',3,'hnsn',true),
  ('2026-08','0415010012','TRATAMENTO C/ CIRURGIAS MULTIPLAS','04','aih',null,'hnsn',true),
  ('2026-08','0415040027','DEBRIDAMENTO DE FASCEITE NECROTIZANTE','04','aih',3,'hnsn',true),
  ('2026-08','0415040035','DEBRIDAMENTO DE ULCERA / DE TECIDOS DESVITALIZADOS','04','aih',2,'hnsn',true)
on conflict (competencia, codigo) do nothing;

-- Verificação
select 'SIGTAP: sigtap_procedimentos ok — '
       || (select count(*) from public.sigtap_procedimentos) || ' procedimento(s)' as resultado;


-- ┌────────────────────────────────────────────────────────────
-- │ 60/75 — migracao-sigtap-valores.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — SIGTAP: valores, permanência e CID REAIS (SIH-SUS)
--
-- ⚠️ ARQUIVO GERADO — não edite à mão.
--    Regenere com:  node supabase/importar-aih.mjs <arquivo.dbc> [--cnes N]
--
-- Preenche, dos procedimentos que o HNSN fatura, a partir das AIHs REAIS
-- pagas no Rio Grande do Sul (RS) em junho/2026 (arquivo SIH-SUS RDRS2606.dbc):
--   • valor_sh, valor_sp (centavos) e media_permanencia;
--   • cids[] — os CIDs compatíveis (base da glosa "CID atípico", que é ATENÇÃO).
--
-- MÉTODO: por procedimento, a MEDIANA de VAL_SH e VAL_SP (robusta aos casos
-- com UTI/complicação que inflam a média), a MÉDIA de DIAS_PERM, e os CIDs
-- (DIAG_PRINC) vistos ao menos 2× (1× costuma ser erro de digitação isolado).
-- 215 dos 219 procedimentos tiveram AIH neste recorte
-- (202 com CID); os demais ficam como estão.
--
-- POR QUE SH+SP: na AIH, VAL_SH cobre a permanência PADRÃO do procedimento;
-- a permanência acima da média é que vira diária a maior. Então SH+SP é o
-- valor-base do ato — as diárias da conta seguem informativas, sem duplicar.
--
-- É ADITIVO E IDEMPOTENTE: cria a coluna `cids` se não existir e faz UPDATE
-- de colunas; rodar duas vezes não faz mal. NÃO apaga tabela, coluna ou linha.
--
-- ⚠️ Roda no DEMO primeiro, depois no principal.
-- ============================================================

begin;

alter table public.sigtap_procedimentos add column if not exists cids text[];

update public.sigtap_procedimentos set valor_sh = 4134, valor_sp = 1088, media_permanencia = 1, cids = '{A049,A079,A09,A150,A419,A499,C250,C61,C80,D464,D53,D64,D649,E148,E876,F100,F314,F322,F329,F411,G409,G510,I10,I159,I200,I209,I210,I219,I350,I442,I460,I469,I48,I500,I509,I609,I63,I64,J159,J180,J188,J189,J440,J449,J969,K29,K318,K56,K703,K802,K810,K839,K929,L089,L97,L989,M545,M791,M796,N17,N180,N189,N200,N201,N390,O200,O244,O998,R060,R072,R074,R10,R100,R101,R11,R13,R462,R509,R521,R53,R55,R58,R609,R688,S018,S060,S065,S068,S720,S721,T018,T029,Z000,Z038,Z039,Z099,Z532,Z878}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0301060088';
update public.sigtap_procedimentos set valor_sh = 103796, valor_sp = 7222, media_permanencia = 10, cids = '{A310,A311,A318,A319,A392,A399,A401,A403,A408,A409,A410,A411,A412,A414,A415,A418,A419,A449,A46,A480,A488,A490,A491,A498,A499,G008,G009,J158,J159,J180,J189,J36,J441,J960,J998,L089,M861,N300,N39,N390,P369,S720,T814}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303010037';
update public.sigtap_procedimentos set valor_sh = 30940, valor_sp = 3950, media_permanencia = 4, cids = '{A000,A009,A047,A048,A049,A059,A083,A084,A085,A09}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303010061';
update public.sigtap_procedimentos set valor_sh = 17510, valor_sp = 3535, media_permanencia = 4, cids = '{A929}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303010070';
update public.sigtap_procedimentos set valor_sh = 19507, valor_sp = 3535, media_permanencia = 7, cids = '{B002,B022,B027,B028,B029,B084,B088,B09}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303010134';
update public.sigtap_procedimentos set valor_sh = 64377, valor_sp = 17848, media_permanencia = 11, cids = '{A150,A151,A153,A158,A159,A179,A199}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303010215';
update public.sigtap_procedimentos set valor_sh = 47366, valor_sp = 3965, media_permanencia = 6, cids = '{D464,D469,D618,D619,D62,D630,D638,D64,D640,D644,D648,D649}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303020032';
update public.sigtap_procedimentos set valor_sh = 31532, valor_sp = 3797, media_permanencia = 6, cids = '{D559,D570,D571,D578,D580,D591,D598,D599}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303020040';
update public.sigtap_procedimentos set valor_sh = 30876, valor_sp = 3294, media_permanencia = 6, cids = '{D500,D508,D509,D518,D529,D530,D538,D539,D649}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303020059';
update public.sigtap_procedimentos set valor_sh = 39804, valor_sp = 5001, media_permanencia = 7, cids = '{E100,E101,E103,E104,E105,E106,E107,E108,E109,E111,E115,E116,E118,E119,E128,E136,E138,E139,E14,E140,E141,E145,E146,E147,E148,E149}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303030038';
update public.sigtap_procedimentos set valor_sh = 17977, valor_sp = 2350, media_permanencia = 6, cids = '{E730,E739,E779,E802,E835,E86,E87,E870,E871,E872,E875,E876,E878,E880,E882,E888,E889,E90,F102}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303030046';
update public.sigtap_procedimentos set valor_sh = 39239, valor_sp = 4599, media_permanencia = 9, cids = '{}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303030054';
update public.sigtap_procedimentos set valor_sh = 64904, valor_sp = 5794, media_permanencia = 9, cids = '{I607,I608,I610,I611,I612,I614,I616,I618}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303040076';
update public.sigtap_procedimentos set valor_sh = 26321, valor_sp = 7633, media_permanencia = 3, cids = '{G409,S060,S061,S062,S068}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303040084';
update public.sigtap_procedimentos set valor_sh = 50554, valor_sp = 5794, media_permanencia = 7, cids = '{S061,S062,S063,S064,S065,S066,S068,S069,T039}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303040092';
update public.sigtap_procedimentos set valor_sh = 67779, valor_sp = 6438, media_permanencia = 7, cids = '{G450,G458,G459,G468,I607,I608,I610,I612,I615,I616,I618,I619,I620,I629,I630,I631,I632,I633,I634,I635,I636,I638,I639,I64,I669,I693}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303040149';
update public.sigtap_procedimentos set valor_sh = 21832, valor_sp = 2752, media_permanencia = 6, cids = '{G40,G400,G401,G402,G403,G404,G405,G406,G407,G408,G409,G410,G418,G419,R560,R568}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303040165';
update public.sigtap_procedimentos set valor_sh = 41474, valor_sp = 5643, media_permanencia = 10, cids = '{G119,G122,G300,G301,G308,G311,G312,G318,G328}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303040203';
update public.sigtap_procedimentos set valor_sh = 55513, valor_sp = 3994, media_permanencia = 7, cids = '{I674}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303040211';
update public.sigtap_procedimentos set valor_sh = 52633, valor_sp = 5205, media_permanencia = 4, cids = '{S221}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303040238';
update public.sigtap_procedimentos set valor_sh = 228729, valor_sp = 6438, media_permanencia = 9, cids = '{I632,I633,I634,I635,I638,I639,I64,I664,I669}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303040300';
update public.sigtap_procedimentos set valor_sh = 77552, valor_sp = 4605, media_permanencia = 8, cids = '{I710,I711,I712,I713,I714,I716,I718,I719,I790}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060018';
update public.sigtap_procedimentos set valor_sh = 29977, valor_sp = 5629, media_permanencia = 7, cids = '{I440,I441,I442,I443,I456,I470,I471,I472,I48,I490,I495,R001,R55}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060026';
update public.sigtap_procedimentos set valor_sh = 32927, valor_sp = 4971, media_permanencia = 8, cids = '{I422}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060034';
update public.sigtap_procedimentos set valor_sh = 67973, valor_sp = 28941, media_permanencia = 8, cids = '{I209,I255,I258}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060042';
update public.sigtap_procedimentos set valor_sh = 59033, valor_sp = 11037, media_permanencia = 5, cids = '{T782}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060050';
update public.sigtap_procedimentos set valor_sh = 65116, valor_sp = 9471, media_permanencia = 10, cids = '{K922,R571,R579}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060077';
update public.sigtap_procedimentos set valor_sh = 82800, valor_sp = 3650, media_permanencia = 8, cids = '{I500,I501,I509,J81}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060131';
update public.sigtap_procedimentos set valor_sh = 64428, valor_sp = 5940, media_permanencia = 8, cids = '{I260,I269,R060}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060140';
update public.sigtap_procedimentos set valor_sh = 69417, valor_sp = 11672, media_permanencia = 7, cids = '{I209,I21,I210,I211,I212,I213,I214,I219,I220,I228,I229,I238,R570}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060190';
update public.sigtap_procedimentos set valor_sh = 49113, valor_sp = 5063, media_permanencia = 8, cids = '{I702,I708,I731,I739,I743,I771}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060204';
update public.sigtap_procedimentos set valor_sh = 82839, valor_sp = 4017, media_permanencia = 8, cids = '{I110,I200,I219,I259,I428,I50,I500,I501,I509,I514,I516,I517,J189}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060212';
update public.sigtap_procedimentos set valor_sh = 45536, valor_sp = 4971, media_permanencia = 6, cids = '{I408,I409,I514}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060239';
update public.sigtap_procedimentos set valor_sh = 46557, valor_sp = 10971, media_permanencia = 7, cids = '{I460,I469}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060255';
update public.sigtap_procedimentos set valor_sh = 42776, valor_sp = 5063, media_permanencia = 10, cids = '{E105,E106,E107,E108,E115,E135,E145,I792,R02}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060263';
update public.sigtap_procedimentos set valor_sh = 76233, valor_sp = 30828, media_permanencia = 7, cids = '{I200,I208,I209,I210,I211,I213,I214,I220,I238,I248}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060280';
update public.sigtap_procedimentos set valor_sh = 32740, valor_sp = 5068, media_permanencia = 6, cids = '{I743,I801,I802,I803,I808,I809,I828,I829}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060298';
update public.sigtap_procedimentos set valor_sh = 58719, valor_sp = 5970, media_permanencia = 9, cids = '{K701,K703,K709,K710,K712,K720,K721,K729,K730,K732,K738,K740,K742,K743,K744,K745,K746,K750,K752,K754,K758,K759,K760,K768,K769,K778,K928}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303070072';
update public.sigtap_procedimentos set valor_sh = 26745, valor_sp = 3705, media_permanencia = 7, cids = '{A09,K501,K509,K510,K513,K518,K519,K521,K522,K528,K529}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303070099';
update public.sigtap_procedimentos set valor_sh = 43045, valor_sp = 5358, media_permanencia = 5, cids = '{K810,K900,K909,K913,K914,K918,K919,K920,K921,K922,K928,K929,K938,R10,R104}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303070102';
update public.sigtap_procedimentos set valor_sh = 31081, valor_sp = 2751, media_permanencia = 6, cids = '{K558,K560,K562,K564,K565,K566,K571,K572,K573,K575,K578,K579,K590,K591,K598,K599,K610,K623,K625,K628,K635,K638,K639,R100,R104}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303070110';
update public.sigtap_procedimentos set valor_sh = 37971, valor_sp = 4195, media_permanencia = 8, cids = '{K800,K801,K802,K803,K804,K805,K808,K810,K811,K818,K819,K820,K828,K829,K830,K831,K838,K839,K850,K851,K858,K859,K860,K861,K868,K869,K870,K871}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303070129';
update public.sigtap_procedimentos set valor_sh = 23676, valor_sp = 3323, media_permanencia = 7, cids = '{L270,L271}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303080086';
update public.sigtap_procedimentos set valor_sh = 27759, valor_sp = 3983, media_permanencia = 8, cids = '{A499,L020,L032,L089,L810,L89,L930,L940,L948,L949,L959,L97,L984,L986,L988,L989,L998}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303080094';
update public.sigtap_procedimentos set valor_sh = 14541, valor_sp = 2698, media_permanencia = 7, cids = '{O11,O13,O141,O149}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303100036';
update public.sigtap_procedimentos set valor_sh = 12815, valor_sp = 2399, media_permanencia = 5, cids = '{I420,I428,O021,O100,O104,O11,O121,O13,O14,O140,O141,O149,O150,O159,O200,O208,O209,O21,O210,O211,O218,O219,O229,O230,O231,O233,O234,O235,O239,O24,O240,O241,O243,O244,O470,O479,O623,O985,O990,O993,O994,O995,O996,O998,P059,R102,Z359}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303100044';
update public.sigtap_procedimentos set valor_sh = 30035, valor_sp = 5872, media_permanencia = 5, cids = '{}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303110066';
update public.sigtap_procedimentos set valor_sh = 51720, valor_sp = 2571, media_permanencia = 6, cids = '{J180,J189,J208,J40,J410,J411,J418,J42,J430,J438,J439,J44,J440,J441,J448,J449,J45,J450,J451,J458,J459,J46,J983}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303140046';
update public.sigtap_procedimentos set valor_sh = 62268, valor_sp = 3133, media_permanencia = 5, cids = '{J64,J698}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303140054';
update public.sigtap_procedimentos set valor_sh = 23944, valor_sp = 3129, media_permanencia = 6, cids = '{H609,H659,H660,H669,H700,H701,H708,H709,H748}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303140070';
update public.sigtap_procedimentos set valor_sh = 17697, valor_sp = 2410, media_permanencia = 5, cids = '{J040,J041,J060,J068,J069}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303140100';
update public.sigtap_procedimentos set valor_sh = 52435, valor_sp = 6150, media_permanencia = 7, cids = '{J90,J91,J930,J931,J938,J948,J949,S270,S272}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303140119';
update public.sigtap_procedimentos set valor_sh = 62583, valor_sp = 2940, media_permanencia = 8, cids = '{J069,J15,J189,J218,J219,J441,J80,J951,J955,J958,J960,J961,J969,J980,J981,J984,J988,J989,J998,P271,P285}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303140135';
update public.sigtap_procedimentos set valor_sh = 22581, valor_sp = 2651, media_permanencia = 5, cids = '{J21,J210,J218,J219,J459}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303140143';
update public.sigtap_procedimentos set valor_sh = 57408, valor_sp = 7835, media_permanencia = 6, cids = '{A419,A499,B012,B59,I64,J10,J100,J110,J111,J121,J128,J129,J13,J15,J150,J151,J154,J158,J159,J168,J170,J178,J18,J180,J181,J182,J188,J189,J219,J449,J690,J960,N390,R060}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303140151';
update public.sigtap_procedimentos set valor_sh = 29257, valor_sp = 3455, media_permanencia = 7, cids = '{A419,N201,N300,N302,N308,N309,N318,N328,N329,N338,N350,N359,N39,N390,N391,N398,N399,O239,R300,R31,R32,R33,R34,R35,R36,R398}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303150050';
update public.sigtap_procedimentos set valor_sh = 38939, valor_sp = 5421, media_permanencia = 6, cids = '{N200,N281,N288,N289,N298}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303150068';
update public.sigtap_procedimentos set valor_sh = 25575, valor_sp = 3879, media_permanencia = 3, cids = '{P510,P53,P559,P588,P589,P590,P592,P598,P599}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303160047';
update public.sigtap_procedimentos set valor_sh = 691426, valor_sp = 163866, media_permanencia = 19, cids = '{P050,P051,P059,P070,P071,P072,P073,P081,P082}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303160055';
update public.sigtap_procedimentos set valor_sh = 421801, valor_sp = 103214, media_permanencia = 14, cids = '{P011,P073,P200,P210,P211,P219,P220,P221,P228,P229,P239,P249,P282,P285,P288,P289,P292,P298,P299}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303160063';
update public.sigtap_procedimentos set valor_sh = 29379, valor_sp = 3610, media_permanencia = 13, cids = '{F063,F064,F09,F149,F192,F20,F200,F201,F202,F208,F220,F228,F229,F233,F239,F251,F252,F29,F300,F310,F312,F313,F314,F315,F316,F318,F319,F32,F320,F321,F322,F323,F328,F329,F331,F332,F333,F338,F339,F388,F39,F412,F509,F603,F608,F711,F919}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303170131';
update public.sigtap_procedimentos set valor_sh = 44802, valor_sp = 5776, media_permanencia = 15, cids = '{F009,F03,F058,F059,F060,F063,F064,F192,F199,F200,F201,F203,F204,F205,F206,F208,F220,F228,F229,F230,F231,F233,F238,F239,F250,F251,F252,F258,F28,F29,F301,F31,F310,F311,F312,F313,F314,F315,F316,F318,F319,F320,F321,F322,F323,F328,F329,F331,F332,F333,F338,F339,F388,F39,F603,F604,F608,F609,F621,F701,F711,F718,F721,F729,F840,F913,F918,F919,F920,F929}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303170140';
update public.sigtap_procedimentos set valor_sh = 59736, valor_sp = 7942, media_permanencia = 18, cids = '{F10,F100,F101,F102,F103,F104,F105,F107,F108,F109}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303170166';
update public.sigtap_procedimentos set valor_sh = 19912, valor_sp = 2888, media_permanencia = 14, cids = '{F14,F140,F141,F142,F149,F192}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303170174';
update public.sigtap_procedimentos set valor_sh = 31736, valor_sp = 4332, media_permanencia = 16, cids = '{F102,F111,F112,F119,F120,F125,F140,F141,F142,F143,F144,F145,F148,F149,F151,F152,F181,F182,F19,F190,F191,F192,F194,F195,F198,F199,F238,F29,F322}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303170182';
update public.sigtap_procedimentos set valor_sh = 32046, valor_sp = 4075, media_permanencia = 5, cids = '{A418,A419,C028,C159,C168,C169,C180,C187,C188,C189,C20,C218,C220,C221,C229,C23,C248,C250,C257,C259,C260,C340,C343,C348,C349,C412,C448,C490,C501,C508,C509,C518,C519,C530,C538,C539,C541,C549,C56,C61,C64,C678,C679,C710,C719,C761,C767,C780,C787,C795,C798,C80,C811,C819,C821,C829,C830,C833,C900,C910,C920,D391,D487,D489,D649,D70,J189,J90,N390,R11}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0304100013';
update public.sigtap_procedimentos set valor_sh = 108964, valor_sp = 11907, media_permanencia = 12, cids = '{A419,A499,E870,N180,N188,N189}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0305010174';
update public.sigtap_procedimentos set valor_sh = 24114, valor_sp = 2794, media_permanencia = 6, cids = '{A419,N10,N110,N111,N119,N390}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0305020013';
update public.sigtap_procedimentos set valor_sh = 20606, valor_sp = 2677, media_permanencia = 4, cids = '{N200,N201,N202,N209,N210,N211,N218,N219,N228,N23}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0305020021';
update public.sigtap_procedimentos set valor_sh = 42897, valor_sp = 4535, media_permanencia = 8, cids = '{N10,N17,N170,N172,N178,N179,N40}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0305020048';
update public.sigtap_procedimentos set valor_sh = 65819, valor_sp = 6872, media_permanencia = 8, cids = '{N179,N180,N188,N189}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0305020056';
update public.sigtap_procedimentos set valor_sh = 21012, valor_sp = 2921, media_permanencia = 5, cids = '{S017,S018,S026,S118,S219,S223,S315,S318,S422,S661,S718,S720,S818,S822,S823,S826,S910,S913,S920,S929,T010,T011,T012,T013,T018,T019,T020,T021,T022,T023,T024,T025,T026,T028,T029,T068,T091,T111,T131,T141,T742,Z000}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0308010019';
update public.sigtap_procedimentos set valor_sh = 44530, valor_sp = 4660, media_permanencia = 6, cids = '{S202,S220,S223,S224,S270,S271,S273,S297,S298,S360,S361,S369,T07}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0308010035';
update public.sigtap_procedimentos set valor_sh = 25830, valor_sp = 4702, media_permanencia = 6, cids = '{S350,S360,S367,S370,S730,S823,T039}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0308010043';
update public.sigtap_procedimentos set valor_sh = 13433, valor_sp = 2662, media_permanencia = 5, cids = '{F100,F135,F138,F190,T019,T424,T430,T432,T439,T455,T509,T599,T658,T659,Z000}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0308020030';
update public.sigtap_procedimentos set valor_sh = 27607, valor_sp = 2655, media_permanencia = 6, cids = '{T260,T280}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0308030036';
update public.sigtap_procedimentos set valor_sh = 32397, valor_sp = 2921, media_permanencia = 8, cids = '{A490,A499,J958,L022,L028,L089,L948,L949,L988,L989,M154,M169,M255,M259,M329,M463,M464,M544,M545,M548,M549,M861,M869,M968,O860,R074,T810,T813,T814,T817,T818,T827,T840,T841,T846,T847,T884,T885,T886,T888,T889}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0308040015';
update public.sigtap_procedimentos set valor_sh = 31560, valor_sp = 25594, media_permanencia = 2, cids = '{O13,O244,O42,O420,O421,O601,O623,O709,O757,O80,O800,O801,O808,O809,O820,P95,Z359}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0310010039';
update public.sigtap_procedimentos set valor_sh = 29104, valor_sp = 10655, media_permanencia = 1, cids = '{C433,C438,C441,C443,C444,C445,C446,C448,D043,D048,D17,D170,D171,D172,D173,D210,D223,D226,D227,D233,L910,L919,L980,L988,L998}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0401020053';
update public.sigtap_procedimentos set valor_sh = 12921, valor_sp = 5529, media_permanencia = 1, cids = '{L050,L059,L720,L728,L729,L989}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0401020070';
update public.sigtap_procedimentos set valor_sh = 13806, valor_sp = 6083, media_permanencia = 0, cids = '{C443,C448,C449,C490,L989}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0401020100';
update public.sigtap_procedimentos set valor_sh = 20143, valor_sp = 18075, media_permanencia = 0, cids = '{G589,Z479}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0403020077';
update public.sigtap_procedimentos set valor_sh = 14518, valor_sp = 20244, media_permanencia = 0, cids = '{G560,G561}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0403020123';
update public.sigtap_procedimentos set valor_sh = 19185, valor_sp = 13334, media_permanencia = 5, cids = '{J36}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0404010067';
update public.sigtap_procedimentos set valor_sh = 9628, valor_sp = 14003, media_permanencia = 1, cids = '{T16,T171,T173}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0404010318';
update public.sigtap_procedimentos set valor_sh = 86746, valor_sp = 13567, media_permanencia = 2, cids = '{S026}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0404020550';
update public.sigtap_procedimentos set valor_sh = 9608, valor_sp = 2345, media_permanencia = 0, cids = '{}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0405010079';
update public.sigtap_procedimentos set valor_sh = 132923, valor_sp = 38086, media_permanencia = 4, cids = '{I441,I442,I443,I458}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0406010684';
update public.sigtap_procedimentos set valor_sh = 33477, valor_sp = 16103, media_permanencia = 3, cids = '{C181,K35,K350,K351,K359,K36,K388,K389}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407020039';
update public.sigtap_procedimentos set valor_sh = 32375, valor_sp = 17843, media_permanencia = 3, cids = '{K35,K350,K351,K359,K36,K388}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407020047';
update public.sigtap_procedimentos set valor_sh = 12957, valor_sp = 7328, media_permanencia = 4, cids = '{K613}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407020144';
update public.sigtap_procedimentos set valor_sh = 41280, valor_sp = 16604, media_permanencia = 9, cids = '{}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407020268';
update public.sigtap_procedimentos set valor_sh = 19110, valor_sp = 12484, media_permanencia = 1, cids = '{I840,I841,I842,I843,I844,I845,I846,I847,I848,I849}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407020284';
update public.sigtap_procedimentos set valor_sh = 66569, valor_sp = 15355, media_permanencia = 6, cids = '{}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407020365';
update public.sigtap_procedimentos set valor_sh = 68873, valor_sp = 35601, media_permanencia = 2, cids = '{K80,K800,K801,K802,K804,K808,K810,K811,K819,K828}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407030026';
update public.sigtap_procedimentos set valor_sh = 82641, valor_sp = 24599, media_permanencia = 2, cids = '{K80,K800,K801,K802,K803,K804,K805,K808,K810,K811,K818,K820,K821,K824,K828,K831,K838,K851,K859}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407030034';
update public.sigtap_procedimentos set valor_sh = 60381, valor_sp = 22988, media_permanencia = 11, cids = '{K800,K810,K831}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407030042';
update public.sigtap_procedimentos set valor_sh = 149431, valor_sp = 54122, media_permanencia = 4, cids = '{C248,K803,K804,K805,K830,K831,K838,K839}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407030255';
update public.sigtap_procedimentos set valor_sh = 77997, valor_sp = 15219, media_permanencia = 7, cids = '{K650,R190,T814}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407040013';
update public.sigtap_procedimentos set valor_sh = 36876, valor_sp = 11615, media_permanencia = 4, cids = '{L022,T814}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407040030';
update public.sigtap_procedimentos set valor_sh = 68882, valor_sp = 21491, media_permanencia = 1, cids = '{K409,K43,K430,K431,K439,K45,K469}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407040064';
update public.sigtap_procedimentos set valor_sh = 51723, valor_sp = 14769, media_permanencia = 2, cids = '{K403,K430,K439,K45,K461,K469}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407040080';
update public.sigtap_procedimentos set valor_sh = 53357, valor_sp = 21049, media_permanencia = 2, cids = '{K40,K400,K402,K409,K412}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407040099';
update public.sigtap_procedimentos set valor_sh = 52952, valor_sp = 21045, media_permanencia = 1, cids = '{K40,K402,K403,K404,K409,K413,K414,K419,K460}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407040102';
update public.sigtap_procedimentos set valor_sh = 50157, valor_sp = 19676, media_permanencia = 1, cids = '{K402,K403,K409,K439,K461}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407040110';
update public.sigtap_procedimentos set valor_sh = 31455, valor_sp = 13644, media_permanencia = 1, cids = '{K42,K420,K421,K429}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407040129';
update public.sigtap_procedimentos set valor_sh = 36189, valor_sp = 10645, media_permanencia = 3, cids = '{K403,K450,K460}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407040145';
update public.sigtap_procedimentos set valor_sh = 92369, valor_sp = 13999, media_permanencia = 7, cids = '{A499,C19,D391,K251,K255,K350,K403,K56,K561,K562,K564,K565,K566,K572,K631,K650,K658,K659,K66,K668,K928,K929,O001,O008,O009,R10,R100,R104,R190,S311,S361,S367,T813,T888,Z302}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407040161';
update public.sigtap_procedimentos set valor_sh = 87880, valor_sp = 14522, media_permanencia = 6, cids = '{K565,K566,K660,R100}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407040188';
update public.sigtap_procedimentos set valor_sh = 34500, valor_sp = 11875, media_permanencia = 3, cids = '{K450,K458}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407040226';
update public.sigtap_procedimentos set valor_sh = 139059, valor_sp = 21039, media_permanencia = 7, cids = '{K650,K659,R100}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407040250';
update public.sigtap_procedimentos set valor_sh = 26505, valor_sp = 19086, media_permanencia = 1, cids = '{M664,M751,M755,M758,S460,S468}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408010142';
update public.sigtap_procedimentos set valor_sh = 57542, valor_sp = 10318, media_permanencia = 1, cids = '{S420}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408010150';
update public.sigtap_procedimentos set valor_sh = 28344, valor_sp = 10215, media_permanencia = 1, cids = '{S420,S431}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408010185';
update public.sigtap_procedimentos set valor_sh = 20045, valor_sp = 13335, media_permanencia = 2, cids = '{S422,S430}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408010193';
update public.sigtap_procedimentos set valor_sh = 36682, valor_sp = 10126, media_permanencia = 1, cids = '{S420}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408010223';
update public.sigtap_procedimentos set valor_sh = 11695, valor_sp = 8858, media_permanencia = 0, cids = '{}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020121';
update public.sigtap_procedimentos set valor_sh = 11695, valor_sp = 8858, media_permanencia = 1, cids = '{M200}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020148';
update public.sigtap_procedimentos set valor_sh = 6287, valor_sp = 6314, media_permanencia = 1, cids = '{S422}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020164';
update public.sigtap_procedimentos set valor_sh = 18257, valor_sp = 9523, media_permanencia = 2, cids = '{S424,S531}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020229';
update public.sigtap_procedimentos set valor_sh = 15196, valor_sp = 9119, media_permanencia = 0, cids = '{M653,M679}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020326';
update public.sigtap_procedimentos set valor_sh = 39271, valor_sp = 13459, media_permanencia = 4, cids = '{S422}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020334';
update public.sigtap_procedimentos set valor_sh = 12269, valor_sp = 8291, media_permanencia = 1, cids = '{S625,S626,S627,S628}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020342';
update public.sigtap_procedimentos set valor_sh = 25547, valor_sp = 12117, media_permanencia = 1, cids = '{S424,S520,S522,S523}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020369';
update public.sigtap_procedimentos set valor_sh = 15475, valor_sp = 11151, media_permanencia = 1, cids = '{S622,S623,S624,S626}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020377';
update public.sigtap_procedimentos set valor_sh = 39906, valor_sp = 13468, media_permanencia = 2, cids = '{S424}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020385';
update public.sigtap_procedimentos set valor_sh = 54409, valor_sp = 12244, media_permanencia = 4, cids = '{S423}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020393';
update public.sigtap_procedimentos set valor_sh = 18549, valor_sp = 9431, media_permanencia = 1, cids = '{S525,S526,S528}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020407';
update public.sigtap_procedimentos set valor_sh = 24445, valor_sp = 9594, media_permanencia = 2, cids = '{S520,S522,S523,S524,S525,S526,S527,S528}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020431';
update public.sigtap_procedimentos set valor_sh = 14967, valor_sp = 9006, media_permanencia = 2, cids = '{S622,S623}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020512';
update public.sigtap_procedimentos set valor_sh = 11770, valor_sp = 8290, media_permanencia = 1, cids = '{S622,S623,S625,S626,S631}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020539';
update public.sigtap_procedimentos set valor_sh = 21577, valor_sp = 11015, media_permanencia = 3, cids = '{S424,S520,S521,S531}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020547';
update public.sigtap_procedimentos set valor_sh = 45985, valor_sp = 33339, media_permanencia = 6, cids = '{M511,M513}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408030399';
update public.sigtap_procedimentos set valor_sh = 981399, valor_sp = 94522, media_permanencia = 8, cids = '{S720,S721,S730}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408040050';
update public.sigtap_procedimentos set valor_sh = 7143, valor_sp = 6908, media_permanencia = 2, cids = '{S324,S730,T840}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408040190';
update public.sigtap_procedimentos set valor_sh = 32074, valor_sp = 7920, media_permanencia = 2, cids = '{}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408040246';
update public.sigtap_procedimentos set valor_sh = 149723, valor_sp = 29542, media_permanencia = 9, cids = '{}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408040343';
update public.sigtap_procedimentos set valor_sh = 27083, valor_sp = 11659, media_permanencia = 6, cids = '{A480,E105,E145,I743,M866,R02,S983}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050020';
update public.sigtap_procedimentos set valor_sh = 129085, valor_sp = 33203, media_permanencia = 2, cids = '{M228,M236,M662,M665,S761}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050136';
update public.sigtap_procedimentos set valor_sh = 723109, valor_sp = 161474, media_permanencia = 1, cids = '{M232,M235,M236,M238,M239,M242,S83,S831,S835,S836,S837}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050160';
update public.sigtap_procedimentos set valor_sh = 226394, valor_sp = 33202, media_permanencia = 1, cids = '{M235,M239,S835}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050179';
update public.sigtap_procedimentos set valor_sh = 8225, valor_sp = 10879, media_permanencia = 4, cids = '{S930}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050217';
update public.sigtap_procedimentos set valor_sh = 5582, valor_sp = 5643, media_permanencia = 2, cids = '{S822}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050225';
update public.sigtap_procedimentos set valor_sh = 8962, valor_sp = 7732, media_permanencia = 9, cids = '{S722,S723}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050233';
update public.sigtap_procedimentos set valor_sh = 21452, valor_sp = 9136, media_permanencia = 5, cids = '{}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050322';
update public.sigtap_procedimentos set valor_sh = 22401, valor_sp = 12559, media_permanencia = 1, cids = '{S924,S925}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050470';
update public.sigtap_procedimentos set valor_sh = 147271, valor_sp = 24663, media_permanencia = 8, cids = '{S720,S721,S728,S729}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050489';
update public.sigtap_procedimentos set valor_sh = 44381, valor_sp = 16913, media_permanencia = 2, cids = '{S823,S824,S825,S826,S827,S828,S930}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050497';
update public.sigtap_procedimentos set valor_sh = 140586, valor_sp = 21511, media_permanencia = 4, cids = '{S822,S823,S827,S828,S829}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050500';
update public.sigtap_procedimentos set valor_sh = 180566, valor_sp = 24780, media_permanencia = 7, cids = '{M844,S720,S723,S727,S728,S729}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050519';
update public.sigtap_procedimentos set valor_sh = 37341, valor_sp = 15958, media_permanencia = 3, cids = '{S820}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050527';
update public.sigtap_procedimentos set valor_sh = 38250, valor_sp = 11413, media_permanencia = 5, cids = '{S920}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050535';
update public.sigtap_procedimentos set valor_sh = 101949, valor_sp = 20295, media_permanencia = 5, cids = '{S823,S827,S828,S829}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050543';
update public.sigtap_procedimentos set valor_sh = 55208, valor_sp = 14507, media_permanencia = 6, cids = '{S821,S828,S829}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050551';
update public.sigtap_procedimentos set valor_sh = 51386, valor_sp = 12403, media_permanencia = 2, cids = '{S824,S825,S826,S828}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050578';
update public.sigtap_procedimentos set valor_sh = 30008, valor_sp = 14507, media_permanencia = 3, cids = '{S820,S821}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050594';
update public.sigtap_procedimentos set valor_sh = 44416, valor_sp = 17474, media_permanencia = 2, cids = '{S823}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050608';
update public.sigtap_procedimentos set valor_sh = 178348, valor_sp = 24780, media_permanencia = 8, cids = '{M966,S720,S721,S722,S727,S729}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050632';
update public.sigtap_procedimentos set valor_sh = 83636, valor_sp = 15016, media_permanencia = 2, cids = '{M233,M239}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050667';
update public.sigtap_procedimentos set valor_sh = 153696, valor_sp = 58076, media_permanencia = 1, cids = '{M23,M230,M231,M232,M233,M236,M238,M239,S832,S837}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050896';
update public.sigtap_procedimentos set valor_sh = 141890, valor_sp = 28343, media_permanencia = 3, cids = '{}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050926';
update public.sigtap_procedimentos set valor_sh = 17014, valor_sp = 9179, media_permanencia = 0, cids = '{M671}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408060018';
update public.sigtap_procedimentos set valor_sh = 28837, valor_sp = 10980, media_permanencia = 4, cids = '{A480,E105,E115,E135,E145,I702,I738,I739,I743,I792,M204,M866,R02,S626,S627,S678,S680,S681,S682,S925,S981,S983}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408060042';
update public.sigtap_procedimentos set valor_sh = 5240, valor_sp = 3909, media_permanencia = 0, cids = '{M661,M678,M710,M713}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408060212';
update public.sigtap_procedimentos set valor_sh = 9570, valor_sp = 5596, media_permanencia = 1, cids = '{M862,S424,S525,S529,S623,S626,T841,T842,T844,T848,T849,T858,T859,Z470,Z478,Z479}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408060352';
update public.sigtap_procedimentos set valor_sh = 9571, valor_sp = 5596, media_permanencia = 2, cids = '{T840,T841,T844,T846,T848,T858,Z470,Z478}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408060360';
update public.sigtap_procedimentos set valor_sh = 17160, valor_sp = 6156, media_permanencia = 2, cids = '{M840,M861,S525,S529,S729,S821,S822,S824,S826,S828,T840,T841,T842,T843,T844,T847,T848,T849,T858,T859,Z470,Z478}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408060379';
update public.sigtap_procedimentos set valor_sh = 12425, valor_sp = 8166, media_permanencia = 3, cids = '{M620,M662,M665,M670,S661,S662,S663,S667,S860,S862}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408060450';
update public.sigtap_procedimentos set valor_sh = 50640, valor_sp = 17380, media_permanencia = 1, cids = '{M242,M658,M659,M751,M768,M773,M798,S463,S661,S663,S666,S668,S669,S860,S961}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408060476';
update public.sigtap_procedimentos set valor_sh = 39559, valor_sp = 15413, media_permanencia = 8, cids = '{M000,M002,M008,M009}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408060557';
update public.sigtap_procedimentos set valor_sh = 16726, valor_sp = 11415, media_permanencia = 0, cids = '{M200,M206,S663,T925}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408060573';
update public.sigtap_procedimentos set valor_sh = 70095, valor_sp = 16442, media_permanencia = 3, cids = '{M840,M841,M842,T932}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408060590';
update public.sigtap_procedimentos set valor_sh = 39766, valor_sp = 16006, media_permanencia = 1, cids = '{N201,N210,T191}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409010065';
update public.sigtap_procedimentos set valor_sh = 51976, valor_sp = 13960, media_permanencia = 5, cids = '{C61,N10,N318,N320,N328,N329,N358,N359,R33,S373}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409010090';
update public.sigtap_procedimentos set valor_sh = 33793, valor_sp = 7980, media_permanencia = 4, cids = '{C538,N130,N131,N132,N133,N138,N20,N200,N201,N202,N209,N210,N211,N218,N219,N390}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409010170';
update public.sigtap_procedimentos set valor_sh = 22590, valor_sp = 14664, media_permanencia = 1, cids = '{N811}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409010430';
update public.sigtap_procedimentos set valor_sh = 25786, valor_sp = 14861, media_permanencia = 3, cids = '{N360}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409020150';
update public.sigtap_procedimentos set valor_sh = 24439, valor_sp = 8353, media_permanencia = 2, cids = '{N211,N350,N358,N359,N368,R33,S373}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409020176';
update public.sigtap_procedimentos set valor_sh = 65604, valor_sp = 42647, media_permanencia = 4, cids = '{N40}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409030023';
update public.sigtap_procedimentos set valor_sh = 47382, valor_sp = 47047, media_permanencia = 3, cids = '{C61,D291,D400,N40}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409030040';
update public.sigtap_procedimentos set valor_sh = 32605, valor_sp = 10199, media_permanencia = 7, cids = '{N499}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409040010';
update public.sigtap_procedimentos set valor_sh = 12388, valor_sp = 10998, media_permanencia = 1, cids = '{N430,N44}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409040096';
update public.sigtap_procedimentos set valor_sh = 48081, valor_sp = 14667, media_permanencia = 0, cids = '{}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409040185';
update public.sigtap_procedimentos set valor_sh = 18785, valor_sp = 7512, media_permanencia = 1, cids = '{N430,N432,N433}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409040215';
update public.sigtap_procedimentos set valor_sh = 13348, valor_sp = 14665, media_permanencia = 1, cids = '{N44}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409040223';
update public.sigtap_procedimentos set valor_sh = 17324, valor_sp = 8432, media_permanencia = 1, cids = '{I861}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409040231';
update public.sigtap_procedimentos set valor_sh = 19092, valor_sp = 24795, media_permanencia = 0, cids = '{Z302}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409040240';
update public.sigtap_procedimentos set valor_sh = 34188, valor_sp = 18334, media_permanencia = 1, cids = '{N486,N488}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409050075';
update public.sigtap_procedimentos set valor_sh = 9772, valor_sp = 12140, media_permanencia = 1, cids = '{N47}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409050083';
update public.sigtap_procedimentos set valor_sh = 32167, valor_sp = 25674, media_permanencia = 3, cids = '{N483}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409050113';
update public.sigtap_procedimentos set valor_sh = 34598, valor_sp = 13846, media_permanencia = 1, cids = '{C530,C531,D069,N870,N871,N872,N879}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409060038';
update public.sigtap_procedimentos set valor_sh = 10710, valor_sp = 7652, media_permanencia = 0, cids = '{O021,O028,O031,O033,O034,O039,O044,O049,O060,O064,O069}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409060070';
update public.sigtap_procedimentos set valor_sh = 55728, valor_sp = 27343, media_permanencia = 2, cids = '{D250,D251,D259,N800}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409060127';
update public.sigtap_procedimentos set valor_sh = 70364, valor_sp = 31749, media_permanencia = 2, cids = '{D25,D250,D251,D252,D259,D390,N800,N809,N813,N850,N858,N859,Z988}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409060135';
update public.sigtap_procedimentos set valor_sh = 31876, valor_sp = 19901, media_permanencia = 1, cids = '{Z302}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409060186';
update public.sigtap_procedimentos set valor_sh = 36150, valor_sp = 15287, media_permanencia = 2, cids = '{N700,N701,N709,N835,N838,Q506}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409060232';
update public.sigtap_procedimentos set valor_sh = 27506, valor_sp = 18334, media_permanencia = 0, cids = '{}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409060240';
update public.sigtap_procedimentos set valor_sh = 25113, valor_sp = 14665, media_permanencia = 2, cids = '{}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409070092';
update public.sigtap_procedimentos set valor_sh = 9414, valor_sp = 4582, media_permanencia = 1, cids = '{N751}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409070190';
update public.sigtap_procedimentos set valor_sh = 4873, valor_sp = 7062, media_permanencia = 0, cids = '{N906}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409070262';
update public.sigtap_procedimentos set valor_sh = 14268, valor_sp = 4893, media_permanencia = 2, cids = '{N61,O911}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0410010014';
update public.sigtap_procedimentos set valor_sh = 43588, valor_sp = 27643, media_permanencia = 3, cids = '{B24,O100,O109,O13,O140,O141,O149,O150,O159,O16,O240,O241,O243,O244,O249,O266,O300,O320,O321,O324,O325,O326,O33,O331,O332,O333,O334,O335,O338,O339,O342,O347,O348,O349,O358,O365,O366,O368,O369,O410,O419,O42,O420,O429,O440,O459,O48,O610,O618,O619,O620,O623,O628,O630,O639,O640,O641,O642,O648,O654,O658,O664,O669,O680,O681,O688,O689,O691,O750,O756,O759,O800,O82,O820,O821,O828,O829,O833,O989,O998,P95,Z359}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0411010034';
update public.sigtap_procedimentos set valor_sh = 49145, valor_sp = 27643, media_permanencia = 3, cids = '{O100,O109,O13,O240,O244,O249,O342,O618,O750,O754,O820,O821,O828,Z302}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0411010042';
update public.sigtap_procedimentos set valor_sh = 8876, valor_sp = 5682, media_permanencia = 1, cids = '{O700,O701,O709,O800}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0411010077';
update public.sigtap_procedimentos set valor_sh = 14999, valor_sp = 7041, media_permanencia = 1, cids = '{O021,O028,O029,O030,O031,O033,O034,O036,O038,O039,O049,O050,O054,O059,O060,O061,O063,O064,O065,O069,O200,O721,O722,O730,O731}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0411020013';
update public.sigtap_procedimentos set valor_sh = 39946, valor_sp = 12870, media_permanencia = 2, cids = '{O001,O002,O008}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0411020048';
update public.sigtap_procedimentos set valor_sh = 274953, valor_sp = 76816, media_permanencia = 6, cids = '{J853}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0412020033';
update public.sigtap_procedimentos set valor_sh = 109932, valor_sp = 44043, media_permanencia = 8, cids = '{A156,B968,C509,J180,J188,J189,J869,J90,J91,J930,J931,J938,J942,S270,S271,S272,S273,S276,S278}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0412040166';
update public.sigtap_procedimentos set valor_sh = 39180, valor_sp = 9816, media_permanencia = 4, cids = '{T302}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0413010015';
update public.sigtap_procedimentos set valor_sh = 87184, valor_sp = 35727, media_permanencia = 7, cids = '{T202,T212,T242,T252,T292,T302}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0413010082';
update public.sigtap_procedimentos set valor_sh = 61303, valor_sp = 20182, media_permanencia = 4, cids = '{C430,C446,C448,C449,D225,L989,L998,S424,T010,T012,T018}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0413040178';
update public.sigtap_procedimentos set valor_sh = 23187, valor_sp = 10033, media_permanencia = 1, cids = '{S610,S611,S618,S619,S681}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0413040240';
update public.sigtap_procedimentos set valor_sh = 128770, valor_sp = 54604, media_permanencia = 5, cids = '{A499,C158,C169,C178,C179,C184,C187,C189,C20,C349,C381,C443,C448,C449,C795,D128,D259,D374,D390,D391,E105,E115,E660,E669,G553,G560,G911,G919,G960,H330,H335,H438,I200,I211,I219,I618,I700,I702,I708,I710,I713,I714,I719,I723,I739,I743,I745,I748,J328,J34,J342,J343,J348,J351,J352,J353,J359,J869,J90,J938,J950,J960,J969,J984,K041,K100,K255,K350,K359,K403,K409,K421,K429,K430,K439,K460,K469,K550,K562,K564,K565,K566,K572,K598,K610,K631,K632,K638,K639,K650,K658,K80,K800,K802,K805,K808,K810,K811,K819,K830,K928,L089,L89,L97,L989,L998,M000,M013,M171,M199,M201,M218,M233,M235,M259,M464,M511,M518,M545,M653,M75,M751,M841,M868,M869,M879,M898,N131,N201,N209,N210,N394,N40,N430,N44,N47,N709,N810,N811,N812,N813,N814,N816,N832,N840,N851,N859,O820,Q359,Q446,Q53,Q530,R02,R10,R100,R32,S026,S065,S068,S271,S324,S328,S333,S334,S361,S420,S422,S423,S424,S431,S460,S520,S523,S524,S525,S527,S528,S530,S611,S621,S623,S626,S628,S663,S666,S667,S668,S681,S682,S720,S721,S722,S723,S724,S727,S728,S729,S730,S820,S821,S822,S823,S825,S826,S827,S828,S829,S830,S831,S832,S860,S920,S923,S924,S929,S930,S932,T12,T141,T174,T813,T841,T842,T844,T849,T922,T939,Z000,Z302,Z470,Z478,Z479}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0415010012';
update public.sigtap_procedimentos set valor_sh = 43983, valor_sp = 17011, media_permanencia = 8, cids = '{A488,E115,L031,L038,L088,L089,R02,T814}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0415040027';
update public.sigtap_procedimentos set valor_sh = 44584, valor_sp = 21591, media_permanencia = 7, cids = '{C189,E105,I792,I830,I832,L89,L97,L984,L989,R02,T212,T213,T223,T243,T253,T813}'::text[], origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0415040035';

commit;

-- conferência (esperado: 215 com valor)
select
  count(*) filter (where valor_sh is not null) as com_valor,
  count(*) as total
from public.sigtap_procedimentos where competencia = '2026-08';


-- ┌────────────────────────────────────────────────────────────
-- │ 61/75 — migracao-perfis-faturamento.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- GRANTS DO MÓDULO FATURAMENTO — migração avulsa (Tier 1 — Fase 4)
--
-- O módulo 'faturamento' é novo. Os bancos que JÁ rodaram
-- migracao-perfis-acesso.sql não recebem os grants novos só por eles
-- passarem a existir no arquivo — e re-rodar o seed inteiro recriaria as
-- políticas `for all` que o migracao-rls-leitura.sql desarma. Então os
-- grants novos entram por aqui, exatamente como o migracao-perfis-nsp.sql
-- fez para o NSP.
--
-- Dá o módulo ao perfil Faturamento (escrita), ao TI (escrita) e ao
-- Provisório (escrita) — este último é o que segura a equipe hoje, então
-- sem ele ninguém enxergaria o módulo até ser reclassificado.
--
-- Idempotente (on conflict do nothing). Rodar no SQL Editor — DEMO, depois HNSN.
-- ═══════════════════════════════════════════════════════════
insert into public.perfis_permissoes (perfil_chave, modulo, nivel) values
  ('faturamento','faturamento','escrita'),
  ('ti','faturamento','escrita'),
  ('provisorio','faturamento','escrita')
on conflict (perfil_chave, modulo) do nothing;

-- Verificação
select 'FATURAMENTO: grants do módulo aplicados — '
       || (select count(*) from public.perfis_permissoes where modulo = 'faturamento')
       || ' perfil(is)' as resultado;


-- ┌────────────────────────────────────────────────────────────
-- │ 62/75 — migracao-perfis-auditoria-diretor.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- AUDITORIA: DIRETOR TÉCNICO PASSA A SÓ CONSULTAR A TRILHA
--
-- Decisão de gestão: manter o acesso à Auditoria estreito e tirar a
-- ESCRITA do diretor técnico, deixando LEITURA. A trilha é append-only e
-- vale como prova; consultar basta. Quem é auditado não deve administrar a
-- própria trilha — o valor probatório se preserva quando o acesso é o menor
-- que dá conta do papel (o diretor RESPONDE pelo prontuário, não edita o log).
--
-- ⚠️ PRECISA DE UPDATE EXPLÍCITO, não do seed. O seed de
-- `migracao-perfis-acesso.sql` insere com `on conflict do nothing`: num
-- banco que já rodou aquela migração, a linha
-- ('diretor_tecnico','auditoria','escrita') JÁ existe, e reexecutar o seed
-- não a troca. Só um UPDATE alcança o que já está lá.
--
-- Idempotente: rodar duas vezes não faz mal (a segunda não encontra
-- 'escrita' e não altera nada).
-- ═══════════════════════════════════════════════════════════

update public.perfis_permissoes
   set nivel = 'leitura'
 where perfil_chave = 'diretor_tecnico'
   and modulo = 'auditoria'
   and nivel = 'escrita';


-- ═══════════════════════════════════════════════════════════
-- CONFERÊNCIA — rode junto. Esperado: uma linha, nivel = leitura.
-- ═══════════════════════════════════════════════════════════
select perfil_chave, modulo, nivel,
       case when nivel = 'leitura' then '✅ ok' else '❌ ainda escrita' end as situacao
  from public.perfis_permissoes
 where perfil_chave = 'diretor_tecnico' and modulo = 'auditoria';


-- ┌────────────────────────────────────────────────────────────
-- │ 63/75 — migracao-suprimentos-integridade.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS — integridade do saldo (travas duras no banco)
--
-- O saldo do almoxarifado é MANTIDO (`sup_lotes.quantidade`), não derivado.
-- Os movimentos são histórico paralelo, aplicados por trigger. Duas fontes
-- para o mesmo número, e três caminhos por onde elas se separavam:
--
--   1) `sup_movimentos.tipo` não tinha CHECK, e o trigger só confere saldo
--      quando o tipo é exatamente 'saida' — mas SUBTRAI para qualquer coisa
--      que não seja 'entrada'. Um 'saída' com acento furava o estoque sem
--      passar por trava nenhuma, e deixava o lote negativo.
--   2) o `select ... into v_saldo` do trigger não travava a linha: duas
--      saídas simultâneas liam o mesmo saldo, as duas passavam no teste de
--      suficiência, e o lote ficava negativo.
--   3) `sup_movimentos.item_id` tem `on delete cascade` — excluir um
--      material apagava o histórico inteiro, apesar de a política dizer
--      "sem update/delete: kardex imutável". A imutabilidade era falsa.
--
-- Esta migração só RECUSA dado impossível; não altera nenhum caminho feliz
-- que hoje funciona. Nada é apagado e nenhuma coluna muda de tipo.
--
-- Idempotente. Rodar no SQL Editor do Supabase ANTES do merge do código.
--
-- 🔴 ANTES DESTE ARQUIVO, rode `conferencia-suprimentos-integridade.sql`
-- (só leitura), numa consulta separada. As travas abaixo entram como NOT
-- VALID e não falham em linha que já existe — mas um lote JÁ negativo passa
-- a recusar qualquer movimento, inclusive o que o consertaria. A
-- conferência diz se existe algum. Ela está em arquivo próprio porque o SQL
-- Editor mostra só o resultado da ÚLTIMA consulta: no meio daqui, sumiria
-- da tela.
-- ═══════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────
-- PASSO 1 — o tipo do movimento só pode ser um dos dois
-- ───────────────────────────────────────────────────────────
alter table public.sup_movimentos drop constraint if exists sup_mov_tipo_chk;
alter table public.sup_movimentos
  add constraint sup_mov_tipo_chk check (tipo in ('entrada','saida')) not valid;

-- ───────────────────────────────────────────────────────────
-- PASSO 2 — saldo de lote não pode ser negativo
--
-- NOT VALID de propósito: se algum lote já estiver negativo (efeito do
-- defeito 1 ou 2 acima), a migração não pode falhar por causa dele — mas
-- daqui para a frente nenhum movimento consegue criar um novo.
-- ───────────────────────────────────────────────────────────
alter table public.sup_lotes drop constraint if exists sup_lote_qtd_chk;
alter table public.sup_lotes
  add constraint sup_lote_qtd_chk check (quantidade >= 0) not valid;

-- ───────────────────────────────────────────────────────────
-- PASSO 3 — o trigger passa a travar a linha e a recusar tipo inválido
--
-- Só duas mudanças, ambas restritivas:
--   • `for update` no select do saldo — fecha a corrida entre duas saídas;
--   • guarda explícita de tipo — defesa em profundidade junto do CHECK,
--     e mensagem legível em vez de erro de constraint.
-- O resto é idêntico ao que já rodava.
-- ───────────────────────────────────────────────────────────
create or replace function public.sup_aplica_movimento()
returns trigger language plpgsql security definer as $$
declare
  v_lote_id bigint;
  v_lote text := coalesce(new.lote, '');
  v_saldo numeric;
begin
  if new.tipo not in ('entrada', 'saida') then
    raise exception 'Tipo de movimento invalido: "%". Esperado entrada ou saida.', new.tipo;
  end if;

  -- `for update` trava a linha do lote ate o fim da transacao. Sem isto,
  -- duas saidas simultaneas liam o mesmo saldo, as duas passavam no teste
  -- de suficiencia, e o lote terminava negativo.
  select id, quantidade into v_lote_id, v_saldo from public.sup_lotes
    where item_id = new.item_id and lote = v_lote
    for update;

  if v_lote_id is null then
    insert into public.sup_lotes (item_id, lote, validade, quantidade)
      values (new.item_id, v_lote, new.validade, 0)
      returning id, quantidade into v_lote_id, v_saldo;
  end if;

  if new.tipo = 'saida' and v_saldo < new.quantidade then
    raise exception 'Estoque insuficiente no lote (disponivel: %).', v_saldo;
  end if;

  if new.validade is not null then
    update public.sup_lotes set validade = new.validade where id = v_lote_id;
  end if;

  update public.sup_lotes
    set quantidade = quantidade + (case when new.tipo = 'entrada' then new.quantidade else -new.quantidade end),
        updated_at = now()
    where id = v_lote_id;

  new.lote_id := v_lote_id;
  new.lote := v_lote;
  return new;
end $$;

drop trigger if exists sup_movimento_trg on public.sup_movimentos;
create trigger sup_movimento_trg before insert on public.sup_movimentos
  for each row execute function public.sup_aplica_movimento();

-- ───────────────────────────────────────────────────────────
-- PASSO 4 — o kardex passa a ser imutável de verdade
--
-- A politica de `sup_movimentos` ja bloqueava update e delete diretos, e o
-- comentario no schema diz "kardex imutavel". Mas `item_id` tem
-- `on delete cascade`: apagar o material levava o historico junto. Este
-- trigger recusa a exclusao enquanto houver movimento.
--
-- Material que nao se usa mais deve ser DESATIVADO (`ativo = false`), que e
-- o que a tela ja oferece — inativo some das listas e mantem o historico.
-- ───────────────────────────────────────────────────────────
create or replace function public.sup_item_protege_kardex()
returns trigger language plpgsql security definer as $$
declare
  v_movs bigint;
begin
  select count(*) into v_movs from public.sup_movimentos where item_id = old.id;
  if v_movs > 0 then
    raise exception
      'Nao e possivel excluir "%": ha % movimento(s) de estoque no historico. Desative o material em vez de excluir.',
      old.nome, v_movs;
  end if;
  return old;
end $$;

drop trigger if exists sup_item_protege_kardex_trg on public.sup_itens;
create trigger sup_item_protege_kardex_trg before delete on public.sup_itens
  for each row execute function public.sup_item_protege_kardex();

-- ───────────────────────────────────────────────────────────
-- PASSO 5 — conferência final (leitura). É a ÚLTIMA consulta de propósito:
-- o SQL Editor só mostra o resultado dela. As 4 linhas devem vir com "1".
-- ───────────────────────────────────────────────────────────
select 'trava de tipo do movimento' as item,
       (select count(*) from pg_constraint where conname = 'sup_mov_tipo_chk')::text as presente
union all
select 'trava de saldo nao-negativo',
       (select count(*) from pg_constraint where conname = 'sup_lote_qtd_chk')::text
union all
select 'trigger de saldo (com for update)',
       (select count(*) from pg_proc where proname = 'sup_aplica_movimento'
         and prosrc like '%for update%')::text
union all
select 'trigger anti-exclusao do kardex',
       (select count(*) from pg_trigger where tgname = 'sup_item_protege_kardex_trg')::text;


-- ┌────────────────────────────────────────────────────────────
-- │ 64/75 — migracao-suprimentos-ajuste-estorno.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS — ajuste de inventário rastreável e estorno com vínculo
--
-- Dois buracos do mesmo tipo: o sistema não sabia desfazer, e mentia
-- quando tentava.
--
--   1) O AJUSTE QUE MENTIA. A contagem é por ITEM, o estoque é por LOTE.
--      O código lançava o ajuste SEM lote (o trigger joga no balde ''), e
--      não conferia o retorno. Com o estoque em lotes nomeados, o balde
--      está vazio, o trigger recusa com "Estoque insuficiente no lote" —
--      e `sup_inventarios.ajustado` gravava `true` do mesmo jeito. A KPI
--      de acuracidade passava a mentir para sempre, porque a contagem
--      seguinte acharia a mesma divergência e "ajustaria" de novo.
--      Além disso `documento` era a constante 'INVENTARIO' para toda
--      contagem do sistema: não dava para ligar ajuste a conferência.
--
--   2) O ESTORNO QUE NÃO EXISTIA. Não havia como desfazer um lançamento
--      errado; a tela mandava "devolva por Entrada", criando um movimento
--      solto, sem vínculo com a saída original. O rastro ficava ilegível
--      justamente onde alguém vai procurar quando faltar material.
--
-- Aditiva. Nenhuma coluna muda de tipo, nada é apagado, e as colunas novas
-- nascem nulas — as linhas que já existem seguem válidas.
--
-- Idempotente. Rodar no SQL Editor do Supabase ANTES do merge do código.
--
-- 🔴 ANTES DESTE ARQUIVO, rode `conferencia-suprimentos-ajuste-estorno.sql`
-- (só leitura), numa consulta separada. Ele mostra quantas contagens têm
-- `ajustado = true` sem movimento correspondente — as que a versão antiga
-- deu por ajustadas sem ter ajustado.
-- ═══════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────
-- PASSO 1 — a contagem passa a registrar quem autorizou e o que deu errado
--
-- `ajuste_erro` é o oposto de mentir: quando o ajuste não entra, a linha
-- guarda o motivo em vez de fingir que entrou. `ajustado` volta a
-- significar exatamente "o movimento foi gravado no kardex".
-- ───────────────────────────────────────────────────────────
alter table public.sup_inventarios add column if not exists autorizado_por text;
alter table public.sup_inventarios add column if not exists ajuste_erro text;

comment on column public.sup_inventarios.ajustado is
  'O ajuste ENTROU no kardex (retorno conferido). Nunca marcar sem confirmar a gravacao.';
comment on column public.sup_inventarios.ajuste_erro is
  'Motivo de o ajuste nao ter entrado. Preenchido quando ajustado = false apesar de haver diferenca.';

-- ───────────────────────────────────────────────────────────
-- PASSO 2 — estorno: o movimento oposto aponta para o original
--
-- O kardex continua append-only: estorno NÃO apaga nada, cria a linha
-- contrária com vínculo. `on delete restrict` de propósito — o original
-- não pode sumir por baixo do estorno que o referencia.
-- ───────────────────────────────────────────────────────────
alter table public.sup_movimentos
  add column if not exists estorno_de bigint references public.sup_movimentos(id) on delete restrict;

create index if not exists sup_mov_estorno_idx on public.sup_movimentos (estorno_de)
  where estorno_de is not null;

comment on column public.sup_movimentos.estorno_de is
  'Id do movimento que esta linha desfaz. Mesmo item, mesmo lote, mesma quantidade, tipo oposto.';

-- ───────────────────────────────────────────────────────────
-- PASSO 3 — um movimento só pode ser estornado UMA vez
--
-- Estornar duas vezes o mesmo lançamento é como se inventa estoque: duas
-- entradas de 10 desfazendo uma saída de 10 deixam +10 do nada. Índice
-- único, porque validação de tela não sobrevive a script nem a tela nova
-- escrita daqui a um ano.
--
-- Encadear É permitido (estornar um estorno — desfazer a desfeita é
-- legítimo e fica autodocumentado); o que o índice impede é DOIS estornos
-- apontando para a MESMA linha.
-- ───────────────────────────────────────────────────────────
drop index if exists public.sup_mov_estorno_unico;
create unique index sup_mov_estorno_unico on public.sup_movimentos (estorno_de)
  where estorno_de is not null;

-- ───────────────────────────────────────────────────────────
-- PASSO 4 — o estorno tem que ser realmente o oposto
--
-- Sem esta trava, `estorno_de` seria só um rótulo: daria para marcar como
-- estorno um movimento de outro item, de outro lote ou de outra
-- quantidade, e o kardex passaria a contar uma história falsa com aparência
-- de rastro. A tela não é barreira — pela API isso entraria liso.
-- ───────────────────────────────────────────────────────────
create or replace function public.sup_valida_estorno()
returns trigger language plpgsql security definer as $$
declare
  o record;
begin
  if new.estorno_de is null then
    return new;
  end if;

  select item_id, lote, tipo, quantidade into o
    from public.sup_movimentos where id = new.estorno_de;

  if o is null then
    raise exception 'Estorno aponta para um movimento inexistente (id %).', new.estorno_de;
  end if;
  if o.item_id <> new.item_id then
    raise exception 'Estorno tem que ser do mesmo material do movimento original.';
  end if;
  if coalesce(o.lote, '') <> coalesce(new.lote, '') then
    raise exception 'Estorno tem que ser no mesmo lote do movimento original ("%").', coalesce(o.lote, '');
  end if;
  if o.quantidade <> new.quantidade then
    raise exception 'Estorno tem que ter a mesma quantidade do original (%).', o.quantidade;
  end if;
  if o.tipo = new.tipo then
    raise exception 'Estorno tem que ser do tipo oposto ao original (% -> %).',
      o.tipo, case when o.tipo = 'entrada' then 'saida' else 'entrada' end;
  end if;

  return new;
end $$;

drop trigger if exists sup_valida_estorno_trg on public.sup_movimentos;
-- Depois do trigger de saldo (ordem alfabética do nome decide, e
-- `sup_movimento_trg` < `sup_valida_estorno_trg`): validar antes de aplicar
-- evitaria mexer no saldo à toa, mas o trigger de saldo é quem preenche
-- `lote`, e a comparação de lote precisa dele já normalizado.
create trigger sup_valida_estorno_trg before insert on public.sup_movimentos
  for each row execute function public.sup_valida_estorno();

-- ───────────────────────────────────────────────────────────
-- PASSO 5 — a contagem pode registrar o DESFECHO, e só ele
--
-- `sup_inventarios` nasceu append-only: só tinha política de SELECT e de
-- INSERT. Isso é certo para a contagem em si (ninguém deve reescrever o
-- que foi contado), mas impedia o passo seguinte — gravar se o ajuste
-- entrou. Sem UPDATE, o PostgREST responde 200 com zero linhas alteradas,
-- e o código acreditava. A contagem ficava para sempre com o desfecho em
-- branco, que é a mesma cegueira de antes numa roupa nova.
--
-- A política abaixo abre uma JANELA, não uma porta: só dá para atualizar a
-- linha enquanto ela ainda não tem desfecho (`ajustado` falso E
-- `ajuste_erro` nulo). Assim que o desfecho é gravado, o `using` deixa de
-- casar e a linha volta a ser imutável — inclusive para quem a criou.
-- O que foi contado continua sem poder ser reescrito depois de decidido.
-- ───────────────────────────────────────────────────────────
drop policy if exists sup_inv_update_desfecho on public.sup_inventarios;
create policy sup_inv_update_desfecho on public.sup_inventarios
  for update to authenticated
  using (
    public.my_role() in ('adm_master','adm_silver')
    and coalesce(ajustado, false) = false
    and ajuste_erro is null
  )
  with check (public.my_role() in ('adm_master','adm_silver'));

-- ───────────────────────────────────────────────────────────
-- PASSO 6 — conferência final (leitura). É a ÚLTIMA consulta de propósito:
-- o SQL Editor só mostra o resultado dela. As 6 linhas devem vir com "1".
-- ───────────────────────────────────────────────────────────
select 'coluna autorizado_por na contagem' as item,
       (select count(*) from information_schema.columns
         where table_name = 'sup_inventarios' and column_name = 'autorizado_por')::text as presente
union all
select 'coluna ajuste_erro na contagem',
       (select count(*) from information_schema.columns
         where table_name = 'sup_inventarios' and column_name = 'ajuste_erro')::text
union all
select 'coluna estorno_de no movimento',
       (select count(*) from information_schema.columns
         where table_name = 'sup_movimentos' and column_name = 'estorno_de')::text
union all
select 'indice de estorno unico',
       (select count(*) from pg_indexes where indexname = 'sup_mov_estorno_unico')::text
union all
select 'trigger que valida o estorno',
       (select count(*) from pg_trigger where tgname = 'sup_valida_estorno_trg')::text
union all
select 'politica de desfecho da contagem',
       (select count(*) from pg_policies
         where tablename = 'sup_inventarios' and policyname = 'sup_inv_update_desfecho')::text;


-- ┌────────────────────────────────────────────────────────────
-- │ 65/75 — migracao-suprimentos-unidade-compra.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS — unidade de compra × unidade de consumo
--
-- `sup_itens` tinha UMA coluna `unidade`. Só que o almoxarifado compra
-- caixa com 100 luvas e entrega par. Sem separar as duas, o comprador
-- digita "qtd 1" e o `custo_unitario` vira R$/caixa — enquanto as saídas
-- saem em unidades. A partir daí, tudo que mistura os dois números está
-- numericamente errado: custo médio ponderado, curva ABC, ponto de pedido
-- e total do pedido de compra.
--
-- Nada disso dá erro na tela. O sistema segue funcionando e respondendo
-- com números errados — o pior tipo de defeito num módulo cuja função é
-- justamente dizer quanto tem e quanto custa.
--
-- 🔴 POR QUE ENTRAR ANTES DA PRIMEIRA COMPRA REAL: o custo médio é
-- PONDERADO. Uma entrada com o custo trocado não fica no passado — ela
-- vira base da média e contamina toda entrada seguinte. Depois de o
-- histórico começar, não há migração que desfaça; só recontagem e
-- relançamento item a item.
--
-- Aditiva e compatível: as colunas nascem nulas e `fator_conversao` tem
-- default 1, então os materiais que já existem se comportam exatamente
-- como antes. A conversão só muda alguma coisa para quem declarar que
-- compra numa unidade diferente da que consome.
--
-- Idempotente. Rodar no SQL Editor do Supabase ANTES do merge do código.
-- Não precisa de conferência prévia: não há dado que possa violar as
-- travas abaixo (a coluna nasce com o default que já satisfaz o CHECK).
-- ═══════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────
-- PASSO 1 — as duas colunas
--
-- `unidade_compra` é só o nome (caixa, fardo, frasco). Quem faz a conta é
-- `fator_conversao`: quantas unidades de CONSUMO cabem numa de COMPRA.
-- ───────────────────────────────────────────────────────────
alter table public.sup_itens add column if not exists unidade_compra text;
alter table public.sup_itens add column if not exists fator_conversao numeric not null default 1;

comment on column public.sup_itens.unidade is
  'Unidade de CONSUMO — como o material sai para o setor. O estoque e o kardex sempre falam nesta unidade.';
comment on column public.sup_itens.unidade_compra is
  'Unidade de COMPRA (caixa, fardo). Apenas o nome; a conta e feita por fator_conversao.';
comment on column public.sup_itens.fator_conversao is
  'Quantas unidades de CONSUMO cabem em uma de COMPRA. Caixa com 100 pares = 100. Default 1 (sem conversao).';

-- ───────────────────────────────────────────────────────────
-- PASSO 2 — fator inválido não entra
--
-- Zero viraria divisão por zero no custo (`Infinity`); negativo criaria
-- estoque negativo na entrada. A tela já valida, mas tela não sobrevive a
-- import de planilha nem a script — e um fator errado não dá erro: ele
-- contamina o custo médio de todas as entradas seguintes, em silêncio.
-- ───────────────────────────────────────────────────────────
alter table public.sup_itens drop constraint if exists sup_item_fator_chk;
alter table public.sup_itens
  add constraint sup_item_fator_chk check (fator_conversao > 0);

-- ───────────────────────────────────────────────────────────
-- PASSO 3 — conferência final (leitura). É a ÚLTIMA consulta de propósito:
-- o SQL Editor só mostra o resultado dela.
-- As 3 primeiras linhas devem vir com "1"; a última mostra quantos
-- materiais já declaram conversão (zero agora, e tudo bem).
-- ───────────────────────────────────────────────────────────
select 'coluna unidade_compra' as item,
       (select count(*) from information_schema.columns
         where table_name = 'sup_itens' and column_name = 'unidade_compra')::text as valor
union all
select 'coluna fator_conversao',
       (select count(*) from information_schema.columns
         where table_name = 'sup_itens' and column_name = 'fator_conversao')::text
union all
select 'trava de fator maior que zero',
       (select count(*) from pg_constraint where conname = 'sup_item_fator_chk')::text
union all
select 'materiais com conversao declarada (informativo)',
       (select count(*) from public.sup_itens where fator_conversao <> 1)::text
union all
select 'materiais no total (todos com fator 1 = comportamento de antes)',
       (select count(*) from public.sup_itens)::text;


-- ┌────────────────────────────────────────────────────────────
-- │ 66/75 — migracao-auditoria-atribuivel.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- AUDITORIA — trilha atribuível e consultável
--
-- Dois defeitos, ambos verificados no código:
--
--   1) A TELA NÃO LIA A TRILHA. `addAuditLog` sempre gravou nos dois
--      lugares — `localStorage` e esta tabela —, mas a tela de Auditoria
--      lia apenas o `localStorage`: 200 registros, do navegador de quem
--      estivesse olhando. A trilha institucional existia aqui e não era
--      exibida em lugar nenhum, enquanto o cabeçalho anunciava "histórico
--      de todas as alterações realizadas na plataforma". Duas pessoas na
--      mesma tela viam listas diferentes.
--      (Corrigido no código; esta migração dá suporte à consulta.)
--
--   2) A AUTORIA VINHA DO CLIENTE. `usuario` é texto livre enviado pelo
--      navegador. Pela API, qualquer autenticado grava um registro com o
--      nome de outra pessoa — e uma trilha em que se pode assinar como
--      terceiro não prova nada justamente quando mais precisa provar.
--
-- 🔴 Por que isso não é cosmético: a trilha DEFENDE a instituição
-- (REQUISITOS-PEP A-03; CFM 1.638/2002, art. 2º). Ela só cumpre esse papel
-- se for a mesma para todos, completa e atribuível a uma conta.
--
-- Aditiva: a coluna nasce nula e é preenchida pelo próprio banco daqui em
-- diante. Registros antigos permanecem como estão — são história, e a tela
-- mostra separadamente quantos têm autoria garantida.
--
-- Idempotente. Rodar no SQL Editor ANTES do merge do código.
-- ═══════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────
-- PASSO 1 — a autoria passa a vir do banco, não do cliente
--
-- `default auth.uid()` faz o próprio PostgREST/Postgres carimbar a conta
-- autenticada. O cliente não precisa enviar nada, e o que ele enviar de
-- errado é recusado no passo 2.
-- ───────────────────────────────────────────────────────────
alter table public.auditoria add column if not exists usuario_id uuid default auth.uid();

comment on column public.auditoria.usuario is
  'Nome de exibicao enviado pelo cliente. Serve para ler; NAO serve como prova de autoria.';
comment on column public.auditoria.usuario_id is
  'Conta autenticada que gravou o registro, carimbada pelo banco (default auth.uid()). Esta e a autoria.';

-- ───────────────────────────────────────────────────────────
-- PASSO 2 — ninguém assina no lugar de outro
--
-- A política de INSERT era `with check (true)`: qualquer autenticado
-- gravava qualquer coisa, inclusive em nome de terceiro. Agora o registro
-- só entra se a autoria for a própria conta.
--
-- O `is null` cobre o registro gravado por processo sem sessão de usuário
-- (função de servidor com credencial de serviço), que não tem `auth.uid()`
-- — melhor um registro sem autoria do que um registro perdido: a trilha
-- não pode deixar de gravar por causa desta trava.
-- ───────────────────────────────────────────────────────────
drop policy if exists audit_insert on public.auditoria;
create policy audit_insert on public.auditoria
  for insert to authenticated
  with check (usuario_id is null or usuario_id = auth.uid());

-- ───────────────────────────────────────────────────────────
-- PASSO 3 — a consulta da tela precisa ser barata
--
-- A tela pagina por chave (`id desc`, `id < último`) e filtra por período
-- e por ação. Sem índice, cada página vira varredura da tabela inteira —
-- e esta tabela só cresce.
-- ───────────────────────────────────────────────────────────
create index if not exists auditoria_id_desc_idx on public.auditoria (id desc);
create index if not exists auditoria_ts_idx      on public.auditoria (ts desc);
create index if not exists auditoria_acao_idx    on public.auditoria (acao);

-- ───────────────────────────────────────────────────────────
-- PASSO 4 — conferência final (leitura). É a ÚLTIMA consulta de propósito:
-- o SQL Editor só mostra o resultado dela. As 3 primeiras linhas devem vir
-- com "1"; as duas últimas são o retrato de antes, para comparar depois.
-- ───────────────────────────────────────────────────────────
select 'coluna usuario_id na auditoria' as item,
       (select count(*) from information_schema.columns
         where table_name = 'auditoria' and column_name = 'usuario_id')::text as valor
union all
select 'politica de insert exigindo a propria conta',
       (select count(*) from pg_policies
         where tablename = 'auditoria' and policyname = 'audit_insert'
           and with_check like '%auth.uid()%')::text
union all
select 'indice de paginacao por id',
       (select count(*) from pg_indexes where indexname = 'auditoria_id_desc_idx')::text
union all
select 'registros na trilha (informativo)',
       (select count(*) from public.auditoria)::text
union all
select 'registros ja atribuidos a uma conta (zero agora, e esperado)',
       (select count(*) from public.auditoria where usuario_id is not null)::text;


-- ┌────────────────────────────────────────────────────────────
-- │ 67/75 — migracao-suprimentos-alcada.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS — alçada de aprovação de compra
--
-- Dois buracos de segregação, verificados no código:
--
--   1) AUTOAPROVAÇÃO. `podeAprovar` conferia cargo e nunca comparava quem
--      criou o pedido com quem aprova. A mesma pessoa criava, enviava e
--      aprovava. (Corrigido no código; não depende desta migração.)
--
--   2) SEM ALÇADA POR VALOR. R$ 50 e R$ 50.000 percorriam o mesmo caminho.
--      Alçada é o controle mais básico de compra e o primeiro que um
--      auditor procura.
--
-- Por que uma TABELA e não uma constante no código: hospital muda alçada
-- por decisão administrativa — troca de diretoria, fim de exercício,
-- mudança de porte. Se o valor mora no código, mudar vira tarefa de
-- desenvolvimento e deploy, e na prática ninguém muda.
--
-- 🔴 NASCE DESLIGADA (sem linha de limite). Enquanto ninguém configurar, a
-- regra CALA e o comportamento é exatamente o de hoje. Um número que a
-- equipe não escolheu travando compra de hospital seria pior que a
-- ausência de alçada.
--
-- Aditiva. Idempotente. Rodar no SQL Editor ANTES do merge do código.
-- ═══════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────
-- PASSO 1 — parâmetros do módulo de suprimentos
--
-- Chave/valor de propósito: o próximo parâmetro (prazo padrão de entrega,
-- teto de inventário) entra sem migração nova. `atualizado_por` fica junto
-- porque mudar alçada é decisão que se presta contas.
-- ───────────────────────────────────────────────────────────
create table if not exists public.sup_parametros (
  chave text primary key,
  valor numeric,
  texto text,
  atualizado_por text,
  atualizado_em timestamptz default now()
);

comment on table public.sup_parametros is
  'Parametros configuraveis do modulo de Suprimentos. Chave/valor para nao exigir migracao a cada novo ajuste.';
comment on column public.sup_parametros.valor is
  'Valor numerico do parametro. Para alcada_aprovacao: limite em REAIS acima do qual o pedido sobe de nivel.';

alter table public.sup_parametros enable row level security;

-- ───────────────────────────────────────────────────────────
-- PASSO 2 — quem lê e quem escreve
--
-- Leitura para quem alcança Suprimentos: a tela de aprovação precisa saber
-- a alçada para explicar a recusa. Escrita só para adm_master — alçada é
-- controle interno, e quem opera a compra não define o próprio teto.
-- ───────────────────────────────────────────────────────────
drop policy if exists sup_param_select on public.sup_parametros;
drop policy if exists sup_param_write  on public.sup_parametros;

create policy sup_param_select on public.sup_parametros
  for select to authenticated
  using (public.pode_ver_algum('suprimentos', 'farmacia'));

create policy sup_param_write on public.sup_parametros
  for all to authenticated
  using (public.my_role() = 'adm_master')
  with check (public.my_role() = 'adm_master');

-- ───────────────────────────────────────────────────────────
-- PASSO 3 — alçada não pode ser zero nem negativa
--
-- Zero travaria toda compra do hospital; negativo não significa nada. A
-- tela já valida, mas tela não sobrevive a script — e um parâmetro errado
-- aqui não dá erro: apenas para as compras, e ninguém liga o motivo à
-- linha que alguém digitou semanas antes.
--
-- Para DESLIGAR a alçada, apaga-se a linha (ou deixa `valor` nulo) — não
-- se põe zero.
-- ───────────────────────────────────────────────────────────
alter table public.sup_parametros drop constraint if exists sup_param_valor_chk;
alter table public.sup_parametros
  add constraint sup_param_valor_chk check (valor is null or valor > 0);

-- ───────────────────────────────────────────────────────────
-- PASSO 4 — conferência final (leitura). É a ÚLTIMA consulta de propósito.
-- As 3 primeiras linhas devem vir com "1"; a última mostra que a alçada
-- nasce DESLIGADA, que é o esperado.
-- ───────────────────────────────────────────────────────────
select 'tabela sup_parametros' as item,
       (select count(*) from information_schema.tables
         where table_name = 'sup_parametros')::text as valor
union all
select 'politica de escrita restrita a adm_master',
       (select count(*) from pg_policies
         where tablename = 'sup_parametros' and policyname = 'sup_param_write')::text
union all
select 'trava de valor maior que zero',
       (select count(*) from pg_constraint where conname = 'sup_param_valor_chk')::text
union all
select 'alcada configurada (0 = desligada, e o esperado agora)',
       (select count(*) from public.sup_parametros
         where chave = 'alcada_aprovacao' and valor is not null)::text;


-- ┌────────────────────────────────────────────────────────────
-- │ 68/75 — migracao-pacientes-busca.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — BUSCA DE PACIENTE POR NOME (aditiva, sem destruir nada)
--
-- POR QUE ESTA MIGRAÇÃO EXISTE
-- A busca da recepção não achava o paciente que está cadastrado. Três
-- defeitos somados, todos no mesmo `ilike`:
--
--   1. `ilike` no Postgres NÃO ignora acento. Digitar JOSE não achava JOSÉ,
--      e o balcão digita sem acento sempre.
--   2. Era substring CONTÍGUA. "MARIA SILVA" não achava "MARIA DA SILVA",
--      nem "MARIA DE SOUZA SILVA" — e nome com partícula no meio é a regra
--      no Brasil, não a exceção.
--   3. O índice existente (`pacientes_nome_idx`, btree sobre
--      lower(nome_completo)) é INÚTIL para `ilike '%x%'`. Cada busca varre a
--      tabela inteira; a recepcionista espera, e espera menos da próxima vez.
--
-- E o custo disso não é a busca lenta: é que **busca que não acha é a
-- máquina de duplicatas**. A recepcionista procura, não encontra, e cadastra
-- de novo. Como NÃO EXISTE unificação de prontuário neste sistema, cada
-- duplicata é permanente — o prontuário deixa de ser o documento único do
-- paciente (CFM 1.638/2002) e o médico decide vendo metade da história.
--
-- A SOLUÇÃO: uma coluna GERADA que guarda o nome já normalizado (maiúsculo,
-- sem acento), com os três nomes que identificam a pessoa no mesmo texto, e
-- um índice GIN de trigrama por cima. A busca passa a quebrar o termo em
-- palavras e exigir TODAS — o que é mais preciso que hoje e ao mesmo tempo
-- acha mais, porque a ordem e as partículas deixam de importar.
--
-- POR QUE OS TRÊS NOMES NA MESMA COLUNA
-- Nome de registro, nome social e nome da mãe já eram procurados juntos (o
-- `or=` antigo). Juntos num texto só, "JOAO MARIA" acha "o João da dona
-- Maria" — que é literalmente como se desempata homônimo no balcão, e é o
-- que o comentário do `filtroBuscaPacientes` sempre disse querer fazer.
--
-- ⚠️ ADITIVA: não apaga coluna, não apaga índice, não toca em política. O
-- `pacientes_nome_idx` antigo FICA — derrubá-lo não é aditivo, e ele ainda
-- serve a consulta por igualdade. Rodar duas vezes não faz nada na segunda.
--
-- ⚠️ A coluna é GENERATED ALWAYS: o banco a mantém sozinho a cada
-- insert/update. Nenhuma tela grava nela, e nenhuma PODE — se alguém tentar,
-- o PostgREST recusa. É de propósito: campo de busca que se atualiza à mão
-- fica desatualizado no dia em que alguém corrige um nome.
-- ============================================================

-- ── 1. EXTENSÕES ────────────────────────────────────────────
-- `unaccent` tira o acento; `pg_trgm` dá o índice que serve para busca por
-- pedaço de palavra. A convenção do Supabase é instalar no schema
-- `extensions`; se este banco não tiver esse schema, cai no padrão. O
-- `if not exists` confere pelo NOME da extensão, que é global — então num
-- banco que já as tenha, os dois caminhos são no-op.
do $$
begin
  begin
    create extension if not exists unaccent with schema extensions;
  exception when others then
    create extension if not exists unaccent;
  end;
  begin
    create extension if not exists pg_trgm with schema extensions;
  exception when others then
    create extension if not exists pg_trgm;
  end;
end $$;

-- ── 2. O ENVELOPE IMUTÁVEL DE unaccent ──────────────────────
-- `unaccent()` é declarada STABLE, não IMMUTABLE, porque em tese depende do
-- dicionário. Coluna gerada e índice EXIGEM immutable, então o Postgres
-- recusa usá-la direto — o erro é "generation expression is not immutable" e
-- é aí que a maioria das tentativas desta migração morre.
--
-- O envelope abaixo é a receita padrão: fixa o dicionário explicitamente e
-- declara imutável. O compromisso que isso assume: se o dicionário do
-- unaccent mudar, as linhas já gravadas não se recalculam sozinhas. Na
-- prática ele não muda; e se um dia mudar, o conserto é um
-- `update pacientes set prontuario = prontuario`, que reprocessa a coluna.
create or replace function public.f_unaccent(txt text)
returns text
language sql
immutable
strict
parallel safe
set search_path = pg_catalog, public, extensions
as $$ select unaccent('unaccent'::regdictionary, txt) $$;

comment on function public.f_unaccent(text) is
  'unaccent() imutável, para uso em coluna gerada e índice. Ver migracao-pacientes-busca.sql.';

-- ── 3. A COLUNA DE BUSCA ────────────────────────────────────
-- MAIÚSCULA e SEM ACENTO, com os três nomes no mesmo texto. `coalesce` para
-- que nome social ou nome da mãe em branco não anulem a linha inteira — sem
-- ele, `null || ' '` é null e o paciente sumiria da busca por completo, que
-- é exatamente o defeito que esta migração vem consertar.
--
-- Isto REESCREVE a tabela uma vez (é o preço de uma coluna `stored`). Numa
-- base do tamanho desta é questão de segundos.
alter table public.pacientes
  add column if not exists nome_busca text
  generated always as (
    upper(public.f_unaccent(
      coalesce(nome_completo, '') || ' ' ||
      coalesce(nome_social, '')   || ' ' ||
      coalesce(nome_mae, '')
    ))
  ) stored;

comment on column public.pacientes.nome_busca is
  'Nome de registro + social + da mãe, maiúsculo e sem acento. Só para busca. Mantida pelo banco.';

-- ── 4. O ÍNDICE ─────────────────────────────────────────────
-- GIN de trigrama: é o único que serve para `ilike '%pedaço%'`. O btree que
-- já existe não é usado nesse caso — não por estar errado, mas porque busca
-- por meio de palavra não tem prefixo por onde o btree começar.
--
-- O schema do `gin_trgm_ops` é descoberto em vez de cravado: dependendo de
-- como o pg_trgm foi instalado neste banco, ele mora em `extensions` ou em
-- `public`, e cravar o errado faz a migração falhar num banco e passar no
-- outro — que é o tipo de divergência que só aparece meses depois.
do $$
declare
  esquema text;
begin
  select n.nspname into esquema
    from pg_opclass o
    join pg_namespace n on n.oid = o.opcnamespace
   where o.opcname = 'gin_trgm_ops'
   limit 1;

  if esquema is null then
    raise exception 'pg_trgm nao esta instalado neste banco — o indice da busca nao pode ser criado';
  end if;

  execute format(
    'create index if not exists pacientes_nome_busca_trgm '
    'on public.pacientes using gin (nome_busca %I.gin_trgm_ops)', esquema);
end $$;

-- ── 5. CONFERÊNCIA (leitura; o resultado é o recibo) ────────
-- Uma consulta só, com `union all`: o SQL Editor mostra apenas a ÚLTIMA, e
-- conferência espalhada em várias consultas é conferência que ninguém lê.
select 'coluna nome_busca' as item,
       case when exists (
         select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'pacientes'
            and column_name = 'nome_busca'
       ) then '✅ existe' else '❌ FALTANDO' end as situacao
union all
select 'indice pacientes_nome_busca_trgm',
       case when exists (
         select 1 from pg_indexes
          where schemaname = 'public' and indexname = 'pacientes_nome_busca_trgm'
       ) then '✅ existe' else '❌ FALTANDO' end
union all
select 'funcao f_unaccent imutavel',
       case when exists (
         select 1 from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'f_unaccent'
            and p.provolatile = 'i'
       ) then '✅ existe' else '❌ FALTANDO' end
union all
-- A prova que importa: sem acento, fora de ordem e com partícula no meio.
-- Se a base tiver algum "José", esta linha tem que achar pelo menos um.
select 'busca sem acento acha (JOSE -> José)',
       coalesce((
         select '✅ ' || count(*)::text || ' paciente(s)'
           from public.pacientes
          where nome_busca ilike '%JOSE%'
       ), '—')
union all
select 'linhas com nome_busca preenchido',
       (select count(*)::text || ' de ' || (select count(*) from public.pacientes)::text
          from public.pacientes where coalesce(nome_busca, '') <> '');


-- ┌────────────────────────────────────────────────────────────
-- │ 69/75 — migracao-agenda-vaga-por-profissional.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — A VAGA É DO PROFISSIONAL, NÃO DA ESPECIALIDADE
--
-- POR QUE ESTA MIGRAÇÃO EXISTE
-- A trava que impede dois pacientes no mesmo horário estava na chave
-- errada:
--
--     unique (data, especialidade_cod, hora)
--
-- Ela protege o paciente, e por isso tem que continuar existindo. Mas do
-- jeito que está, ela também torna IMPOSSÍVEL uma coisa banal num
-- ambulatório: **dois médicos da mesma especialidade atendendo no mesmo
-- horário.** Dois oftalmologistas às terças 08:00 é o segundo ser recusado
-- pelo banco — não por falta de vaga, por causa da forma da chave.
--
-- Três coisas travam juntas por causa disso:
--   1. a capacidade da especialidade fica limitada a UM médico por horário,
--      por mais gente que o hospital contrate;
--   2. o card de vagas MENTE quando há duas grades: o da Dra. B mostra a
--      cota consumida pelo Dr. A, porque a contagem também é por
--      especialidade (`vagasDoDia`, em agenda.js — corrigido no mesmo PR);
--   3. fecha a saída natural para duração diferente por tipo de consulta —
--      uma grade de 30 min para primeira vez e outra de 15 para retorno, no
--      mesmo turno, é hoje impossível de publicar.
--
-- POR QUE AGORA, E NÃO DEPOIS
-- É a única correção desta fila cujo custo CRESCE com o tempo. Trocar chave
-- de índice único exige conferir duplicidade histórica; com o hospital
-- vazio isso é uma consulta, com dois anos de agenda é um mutirão. O
-- momento barato é antes do primeiro paciente real.
--
-- A CHAVE NOVA
--     unique (data, hora, coalesce('p:'||profissional_username, 'e:'||especialidade_cod))
--
-- Lê-se: a vaga pertence a QUEM ATENDE. Quando a grade não tem profissional
-- definido — o que o `validarGrade` permite —, ela volta a pertencer à
-- especialidade, que é exatamente o comportamento de hoje. Ou seja: nada
-- que funciona hoje passa a falhar; o que era recusado sem motivo passa a
-- ser aceito.
--
-- O prefixo `p:` / `e:` não é enfeite: sem ele, um username que coincidisse
-- com um código de especialidade misturaria as duas chaves — improvável e
-- silencioso, que é a pior combinação.
--
-- ⚠️ ESTA MIGRAÇÃO NÃO É PURAMENTE ADITIVA — ela DERRUBA o índice antigo,
-- e derrubar é o objetivo: enquanto ele existir, continua recusando o
-- segundo médico. A ordem abaixo é deliberada e segura:
--   1. confere se algum dado atual violaria a chave nova (e PARA se violar);
--   2. cria o índice novo;
--   3. só então derruba o antigo — e só se o novo existir de verdade.
-- Assim, em nenhum instante a base fica sem trava contra vaga dupla.
--
-- COMO DESFAZER, se precisar:
--   drop index if exists public.ag_agend_vaga_unica_prof;
--   create unique index ag_agend_vaga_unica on public.ag_agendamentos
--     (data, especialidade_cod, hora)
--     where hora is not null and status in ('agendado','presente');
-- ============================================================

-- ── 1. CONFERÊNCIA PRÉVIA ───────────────────────────────────
-- A chave nova é mais FROUXA que a antiga em quase tudo (libera dois
-- médicos no mesmo horário), mas há um caso em que ela é mais APERTADA: o
-- mesmo profissional com DUAS especialidades no mesmo horário. Hoje isso
-- passa; depois, não — e está certo que não passe, porque a pessoa não se
-- divide. Se existir na base, a migração PARA aqui e mostra qual é, em vez
-- de falhar no meio com uma mensagem de índice.
--
-- ⚠️ O agrupamento é EXATAMENTE a chave do índice novo — nada além dela.
-- Acrescentar `profissional_username` e `especialidade_cod` ao `group by`
-- (que é o instinto, porque são as colunas que a gente quer ver) separaria
-- em grupos diferentes justamente as duas linhas que colidem quando o mesmo
-- profissional aparece em DUAS especialidades — o único caso que esta
-- conferência existe para pegar. A conferência passaria e o índice falharia.
do $$
declare
  conflitos int;
  exemplo text;
begin
  select count(*), min(format('%s %s — %s', d.data, d.hora, d.chave))
    into conflitos, exemplo
    from (
      select data, hora,
             coalesce('p:' || profissional_username, 'e:' || especialidade_cod) as chave
        from public.ag_agendamentos
       where hora is not null and status in ('agendado','presente')
       group by 1, 2, 3
      having count(*) > 1
    ) d;

  if conflitos > 0 then
    raise exception
      'NAO MIGREI: % horario(s) ficariam com duas vagas para o mesmo profissional (ex.: %). '
      'Resolva remarcando ou cancelando um dos agendamentos e rode de novo.',
      conflitos, exemplo;
  end if;
end $$;

-- ── 2. O ÍNDICE NOVO ────────────────────────────────────────
-- Parcial pelos mesmos dois motivos do antigo, que continuam valendo:
--   • `falta` e `cancelado` ficam FORA — o horário volta ao mercado para
--     quem remarca, e o histórico do que foi desmarcado continua gravado;
--   • `hora is not null` porque a fila por ordem de chegada não tem
--     horário: ali a vaga não é um relógio, é uma posição.
create unique index if not exists ag_agend_vaga_unica_prof
  on public.ag_agendamentos
     (data, hora, (coalesce('p:' || profissional_username, 'e:' || especialidade_cod)))
  where hora is not null and status in ('agendado','presente');

-- ── 3. DERRUBAR O ANTIGO — só com o novo no lugar ───────────
-- O `if exists` do índice novo é a trava: se o passo 2 não tiver criado
-- nada (por qualquer motivo), o antigo FICA, e a base continua protegida
-- contra vaga dupla. Preferir uma trava excessiva a nenhuma.
do $$
begin
  if exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'ag_agend_vaga_unica_prof'
  ) then
    drop index if exists public.ag_agend_vaga_unica;
  else
    raise exception 'NAO DERRUBEI o indice antigo: o novo (ag_agend_vaga_unica_prof) nao existe.';
  end if;
end $$;

-- ── 4. CONFERÊNCIA (leitura; o resultado é o recibo) ────────
select 'indice novo (por profissional)' as item,
       case when exists (
         select 1 from pg_indexes
          where schemaname = 'public' and indexname = 'ag_agend_vaga_unica_prof'
       ) then '✅ existe' else '❌ FALTANDO' end as situacao
union all
select 'indice antigo (por especialidade)',
       case when exists (
         select 1 from pg_indexes
          where schemaname = 'public' and indexname = 'ag_agend_vaga_unica'
       ) then '❌ AINDA EXISTE — dois medicos no mesmo horario seguem barrados'
          else '✅ derrubado' end
union all
-- A trava continua de pé: um horário vivo por profissional, nunca dois.
select 'vagas vivas com hora (a trava cobre)',
       (select count(*)::text from public.ag_agendamentos
         where hora is not null and status in ('agendado','presente'))
union all
select 'agendamentos vivos SEM profissional (caem na especialidade)',
       (select count(*)::text from public.ag_agendamentos
         where hora is not null and status in ('agendado','presente')
           and profissional_username is null);


-- ┌────────────────────────────────────────────────────────────
-- │ 70/75 — migracao-agenda-confirmacao.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — CONFIRMAÇÃO DA VÉSPERA E MOTIVO DA FALTA
--
-- POR QUE ESTA MIGRAÇÃO EXISTE
-- A tela da Agenda exibe um KPI de ABSENTEÍSMO e o hospital não tem como
-- agir sobre ele:
--
--   1. NÃO EXISTE CONFIRMAÇÃO. O ciclo é agendado → presente → falta. A
--      confirmação ativa da véspera (ligar, WhatsApp, SMS 24-48h antes) é a
--      alavanca que de fato derruba absenteísmo no ambulatório brasileiro,
--      e o sistema não tem onde registrá-la. Quem liga hoje anota no papel.
--
--   2. FALTA NÃO TEM MOTIVO. `registrarFalta` grava só o status. Sem causa
--      não há o que corrigir: transporte que não veio, paciente já atendido
--      em outro serviço, óbito e "esqueci" pedem respostas diferentes — e
--      um deles nem é falta, é cadastro desatualizado.
--
-- O QUE ENTRA
--   • `confirmado` como status, `confirmado_em` e `confirmado_por`;
--   • `falta_motivo`.
--
-- ⚠️ DUAS TRAVAS CRAVAM A LISTA DE STATUS, E AS DUAS PRECISAM SABER DO
-- STATUS NOVO. Esquecer qualquer uma delas é pior que não migrar:
--
--   • O CHECK `ag_agend_status_valido` recusaria gravar 'confirmado' — a
--     tela mostraria "nada foi alterado" e ninguém saberia por quê.
--   • O ÍNDICE ÚNICO `ag_agend_vaga_unica_prof` filtra
--     `status in ('agendado','presente')`. Sem 'confirmado' ali, o
--     agendamento confirmado DEIXARIA DE OCUPAR A VAGA no banco — e duas
--     pessoas poderiam ser marcadas para o mesmo horário, sendo que uma
--     delas já confirmou que vem. É o dano exato que o índice existe para
--     impedir, causado pela melhoria.
--
-- ⚠️ ADITIVA nas colunas; a recriação do CHECK e do índice é substituição
-- pelo equivalente MAIS AMPLO — nada que era aceito passa a ser recusado.
--
-- COMO DESFAZER:
--   (o inverso: recriar CHECK e índice sem 'confirmado' — e antes disso
--    mover os 'confirmado' existentes de volta para 'agendado')
-- ============================================================

-- ── 1. AS COLUNAS ───────────────────────────────────────────
-- `confirmado_por` guarda QUEM confirmou. Não é burocracia: confirmação é
-- trabalho de telefone, e sem autor não há como saber se a lista do dia foi
-- percorrida ou se alguém marcou por marcar.
alter table public.ag_agendamentos
  add column if not exists confirmado_em timestamptz,
  add column if not exists confirmado_por text,
  add column if not exists falta_motivo text;

comment on column public.ag_agendamentos.confirmado_em is
  'Quando o paciente confirmou presença (contato ativo da véspera). Ver migracao-agenda-confirmacao.sql.';
comment on column public.ag_agendamentos.falta_motivo is
  'Por que não veio. Sem causa, o indicador de absenteísmo não tem o que corrigir.';

-- ── 2. O CHECK PRECISA ACEITAR O STATUS NOVO ────────────────
-- Sem isto, o PATCH é recusado pelo banco e a tela diz "nada foi alterado",
-- que é a mensagem certa para a causa errada.
alter table public.ag_agendamentos
  drop constraint if exists ag_agend_status_valido;
alter table public.ag_agendamentos
  add constraint ag_agend_status_valido
  check (status in ('agendado', 'confirmado', 'presente', 'falta', 'cancelado'));

-- ── 3. O ÍNDICE ÚNICO PRECISA SABER QUE CONFIRMADO OCUPA ────
-- 🔴 A parte que NÃO pode ser esquecida. O índice parcial filtra por status;
-- sem 'confirmado' na lista, quem confirmou sai do índice e o horário volta
-- a aceitar outra pessoa. Quem confirmou que vem é justamente quem MAIS
-- garantidamente vem.
--
-- A chave é a mesma do `migracao-agenda-vaga-por-profissional.sql` (a vaga é
-- do profissional, com recuo para a especialidade). O schema do índice é
-- recriado, não alterado: índice parcial não aceita mudar o `where`.
do $$
declare
  conflitos int;
begin
  -- Nada deve violar: a chave não muda, só a lista de status cresce. A
  -- conferência fica porque migrar por cima de dado inconsistente é como o
  -- índice antigo morre em silêncio.
  select count(*) into conflitos from (
    select data, hora, coalesce('p:' || profissional_username, 'e:' || especialidade_cod) as chave
      from public.ag_agendamentos
     where hora is not null and status in ('agendado', 'confirmado', 'presente')
     group by 1, 2, 3
    having count(*) > 1
  ) d;
  if conflitos > 0 then
    raise exception 'NAO MIGREI: % horario(s) ficariam com duas vagas para o mesmo profissional.', conflitos;
  end if;
end $$;

drop index if exists public.ag_agend_vaga_unica_prof;

do $$
declare
  esquema text;
begin
  select n.nspname into esquema
    from pg_opclass o join pg_namespace n on n.oid = o.opcnamespace
   where o.opcname = 'gin_trgm_ops' limit 1;   -- só para confirmar que o banco está migrado
  execute
    'create unique index if not exists ag_agend_vaga_unica_prof '
    'on public.ag_agendamentos '
    '   (data, hora, (coalesce(''p:'' || profissional_username, ''e:'' || especialidade_cod))) '
    ' where hora is not null and status in (''agendado'', ''confirmado'', ''presente'')';
end $$;

-- ── 4. CONFERÊNCIA (leitura; o resultado é o recibo) ────────
select 'colunas novas (esperado 3)' as item,
       count(*)::text as situacao
  from information_schema.columns
 where table_schema = 'public' and table_name = 'ag_agendamentos'
   and column_name in ('confirmado_em', 'confirmado_por', 'falta_motivo')

union all
select 'CHECK aceita confirmado',
       case when exists (
         select 1 from pg_constraint
          where conname = 'ag_agend_status_valido'
            and pg_get_constraintdef(oid) like '%confirmado%'
       ) then '✅ sim' else '❌ NAO — o status novo sera recusado pelo banco' end

union all
select 'INDICE conta confirmado como vaga ocupada',
       case when exists (
         select 1 from pg_indexes
          where schemaname = 'public' and indexname = 'ag_agend_vaga_unica_prof'
            and indexdef like '%confirmado%'
       ) then '✅ sim' else '❌ NAO — quem confirmar libera o horario para outro' end

union all
select 'indice antigo por especialidade',
       case when exists (
         select 1 from pg_indexes
          where schemaname = 'public' and indexname = 'ag_agend_vaga_unica'
       ) then '❌ AINDA EXISTE' else '✅ derrubado' end;


-- ┌────────────────────────────────────────────────────────────
-- │ 71/75 — migracao-pacientes-nacionalidade-etnia.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — PACIENTE ESTRANGEIRO E ETNIA INDÍGENA
--
-- POR QUE ESTA MIGRAÇÃO EXISTE
-- O cadastro atende mal duas populações que chegam no balcão, cada uma de
-- um jeito diferente — e as duas em silêncio:
--
--   1. O ESTRANGEIRO FICA COM PENDÊNCIA IMPOSSÍVEL. Município e UF de
--      nascimento são exigências ESSENCIAIS para todo mundo. Quem nasceu
--      no Uruguai não tem nem um nem outro: o cadastro nunca chega a
--      "completo" e a tela cobra para sempre dois campos que não existem.
--      Pendência que não tem como ser resolvida ensina a recepção a
--      ignorar o aviso — e aí o aviso que importa some junto com ele.
--
--      Falta ainda onde guardar o PAÍS de nascimento (que é a naturalidade
--      de quem nasceu fora) e o PASSAPORTE, que é o documento legal de
--      quem pode não ter CPF nenhum.
--
--   2. O INDÍGENA FICA COM ARQUIVO REJEITADO. "Indígena" já é opção de
--      raça/cor e para por aí. Nos sistemas de informação do SUS a ETNIA é
--      obrigatória junto: raça/cor indígena sozinha não é aceita e o BPA
--      volta. O cadastro parece correto na tela e quebra no fechamento do
--      mês, longe de quem digitou — que é a pior distância possível entre
--      o erro e quem poderia consertá-lo.
--
-- O QUE ENTRA
--   • `pais_nascimento` — a naturalidade de quem nasceu fora;
--   • `passaporte`      — o documento de quem pode não ter CPF;
--   • `etnia_indigena`  — exigida quando a raça/cor é indígena.
--
-- O QUE NÃO ENTRA, E POR QUÊ
-- `nacionalidade` JÁ EXISTE como texto livre, com "Brasileira" de padrão.
-- Não é convertida para código aqui: o sistema lê pelas duas convenções
-- (`normalizarNacionalidade`), exatamente como já faz com `sexo`, que tem
-- "masculino"/"M" convivendo na base. Converter o acervo inteiro num
-- UPDATE seria mexer em dado de paciente para resolver um problema que a
-- leitura resolve — e o formulário já grava o valor novo ao salvar.
--
-- NÃO HÁ CHECK NEM CONSTRAINT NOVA, DE PROPÓSITO.
-- A conferência do cadastro NUNCA bloqueia: emergência entra com o que dá
-- (CFM 1.638, art. 5º, I, "e"). Um CHECK exigindo etnia recusaria o INSERT
-- de um politraumatizado indígena sem documento — inverteria a prioridade
-- e, pior, o PostgREST devolveria o erro numa tela que não espera erro.
-- A exigência mora na conferência, visível, para ser completada depois.
--
-- ⚠️ ADITIVA. Só `add column if not exists` e um UPDATE que preenche
-- coluna nova a partir de coluna existente, sem apagar nada.
--
-- COMO DESFAZER:
--   alter table public.pacientes
--     drop column if exists pais_nascimento,
--     drop column if exists passaporte,
--     drop column if exists etnia_indigena;
-- ============================================================

-- ── 1. AS COLUNAS ───────────────────────────────────────────
alter table public.pacientes
  -- A naturalidade de quem nasceu fora. Ocupa o lugar de município + UF na
  -- conferência: um substitui o outro, nunca os dois ao mesmo tempo.
  add column if not exists pais_nascimento text,

  -- O documento legal do paciente estrangeiro. Turista e recém-chegado
  -- podem não ter CPF; quem já tirou resolve com o CPF mesmo. A exigência
  -- é ter UM documento, não ter aquele documento.
  add column if not exists passaporte text,

  -- Texto, não código. A Tabela de Etnias Indígenas do SUS tem centenas de
  -- entradas com código de 4 dígitos, e inventar código aqui seria pior
  -- que não ter: código errado não é recusado no ato — vai para o arquivo
  -- de produção e volta como glosa, com o nome de um povo trocado pelo de
  -- outro. Grava-se o NOME, que é o que a recepção sabe conferir com a
  -- pessoa na frente. O código entra quando a exportação do BPA for
  -- escrita, com a tabela oficial ao lado.
  add column if not exists etnia_indigena text;


-- ── 2. O TEXTO LIVRE QUE JÁ ESTAVA LÁ ───────────────────────
-- `nacionalidade` é campo aberto desde sempre, e quem preencheu à mão
-- escreveu o PAÍS ("Uruguaia", "Haitiana") em vez de "Estrangeira". Esse
-- texto é a única informação de origem que existe sobre essas pessoas —
-- deixá-lo onde está faria a tela pedir o país de nascimento de alguém
-- cujo país já estava digitado na linha de cima.
--
-- Só preenche o que está vazio. Roda duas vezes sem efeito na segunda.
update public.pacientes
   set pais_nascimento = nacionalidade
 where pais_nascimento is null
   and nacionalidade is not null
   and btrim(nacionalidade) <> ''
   and lower(btrim(nacionalidade)) not in
       ('brasileira', 'brasileiro', 'brasil', 'brazil', 'naturalizada',
        'naturalizado', 'estrangeira', 'estrangeiro');


-- ── 3. CONFERÊNCIA (leitura; o resultado é o recibo) ────────
select 'colunas novas (esperado 3)' as item,
       count(*)::text as situacao
  from information_schema.columns
 where table_schema = 'public' and table_name = 'pacientes'
   and column_name in ('pais_nascimento', 'passaporte', 'etnia_indigena')

union all
select 'pacientes com pais_nascimento recuperado do texto livre',
       count(*)::text
  from public.pacientes
 where pais_nascimento is not null

union all
select 'pacientes indigenas SEM etnia (viram pendencia na tela)',
       count(*)::text
  from public.pacientes
 where lower(btrim(coalesce(raca_cor, ''))) = 'indigena'
   and coalesce(btrim(etnia_indigena), '') = ''

union all
-- Não deve haver nenhuma trava nova: a conferência do cadastro não bloqueia.
select 'nenhum CHECK novo em pacientes',
       case when exists (
         select 1 from pg_constraint
          where conrelid = 'public.pacientes'::regclass
            and contype = 'c'
            and pg_get_constraintdef(oid) ilike any (array['%etnia%', '%passaporte%', '%pais_nascimento%'])
       ) then '❌ existe trava — emergencia deixaria de entrar' else '✅ nenhuma' end;


-- ┌────────────────────────────────────────────────────────────
-- │ 72/75 — migracao-agenda-remarcacao.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — REMARCAÇÃO COM VÍNCULO
--
-- POR QUE ESTA MIGRAÇÃO EXISTE
-- Remarcar não existe no sistema. Existe CANCELAR (com um motivo em texto
-- livre, digitado num `prompt`) e existe MARCAR. A recepcionista faz as
-- duas coisas à mão e a corrente se perde no meio — sem erro nenhum, o que
-- é o pior jeito de perder.
--
-- TRÊS COISAS SUMIAM JUNTO, E NENHUMA APARECIA EM TELA NENHUMA:
--
--   1. DE QUEM FOI. "Médico de licença" e "o paciente pediu outro dia"
--      viravam a mesma string. Quantas vezes o HOSPITAL empurrou o paciente
--      é o único número deste conjunto sobre o qual o hospital manda — e
--      não existia. O absenteísmo, que existe, mede o lado do paciente.
--
--   2. A ESPERA REAL. Quem foi marcado em março e empurrado três vezes
--      aparece como "marcado há 5 dias". A espera que conta para a
--      regulação é da PRIMEIRA marcação até ser atendido, e o relógio era
--      zerado a cada remarque. A fila do hospital parecia curta.
--
--   3. A PESSOA. Três remarcações de um paciente são indistinguíveis de
--      três pacientes diferentes. Quem liga para reduzir absenteísmo não
--      tem como saber a quem ligar primeiro.
--
-- O QUE ENTRA
--   • `remarcado_de`       — o agendamento que este substitui;
--   • `remarcacao_motivo`  — do catálogo, e é ele que carrega o "de quem".
--
-- SÓ UMA DIREÇÃO, DE PROPÓSITO. Não existe `remarcado_para`: duas colunas
-- apontando uma para a outra divergem no primeiro update que esquecer
-- metade, e aí "quantas vezes esta pessoa foi empurrada" passa a ter duas
-- respostas. A direção contrária se descobre com um índice, que entra aqui.
--
-- O STATUS DO ORIGINAL CONTINUA SENDO `cancelado`. Nenhum status novo:
-- o CHECK de status e o índice único da vaga não são tocados, e a vaga
-- antiga volta para a fila exatamente como já voltava. É a lição do
-- `confirmado` — status novo obriga a lembrar de DUAS travas, e esquecer
-- uma delas é pior que não migrar.
--
-- ⚠️ ADITIVA. Colunas novas, um índice novo e uma trava que só recusa o que
-- nunca deveria ter sido gravado. Nada que era aceito passa a ser recusado.
--
-- COMO DESFAZER:
--   drop index if exists public.ag_agend_remarcado_de_unico;
--   alter table public.ag_agendamentos
--     drop constraint if exists ag_agend_remarcacao_nao_aponta_para_si,
--     drop column if exists remarcado_de,
--     drop column if exists remarcacao_motivo;
-- ============================================================

-- ── 1. AS COLUNAS ───────────────────────────────────────────
alter table public.ag_agendamentos
  -- O elo. `on delete set null` e não `cascade`: agendamento neste sistema
  -- não se apaga (muda de status), mas se um dia alguém apagar um, a
  -- corrente perde o começo em vez de perder o fim inteiro.
  add column if not exists remarcado_de bigint
    references public.ag_agendamentos(id) on delete set null,

  -- Sem CHECK de valor, pelo mesmo motivo do `falta_motivo`: motivo novo
  -- criado no catálogo não pode depender de migração para ser gravável.
  add column if not exists remarcacao_motivo text;


-- ── 2. A TRAVA QUE O CÓDIGO SOZINHO NÃO GARANTE ─────────────
-- Um agendamento apontando para si mesmo faz a reconstrução da corrente
-- girar para sempre. A função pura tem guarda contra ciclo — e essa guarda
-- é defendida por um teste que TRAVA, não que fica vermelho, porque laço
-- infinito bloqueia o event loop e nem o vitest interrompe. Aqui é a
-- garantia que não depende de ninguém lembrar.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'ag_agend_remarcacao_nao_aponta_para_si'
  ) then
    alter table public.ag_agendamentos
      add constraint ag_agend_remarcacao_nao_aponta_para_si
      check (remarcado_de is null or remarcado_de <> id);
  end if;
end $$;


-- ── 3. A CORRENTE É CORRENTE, NÃO ÁRVORE ────────────────────
-- Índice único PARCIAL: cada agendamento só pode ser remarcado UMA vez.
--
-- A regra pura já recusa remarcar um agendamento cancelado (que é o estado
-- em que o original fica), mas duas recepcionistas clicando ao mesmo tempo
-- passariam pelas duas checagens antes de qualquer uma gravar. Sem esta
-- trava, o mesmo ponto teria dois sucessores e "para onde foi este
-- paciente" deixaria de ter resposta única — que é exatamente o problema
-- que a coluna existe para resolver.
--
-- Serve TAMBÉM de índice de busca para a direção contrária (achar quem
-- substituiu um agendamento), que é o motivo de não existir
-- `remarcado_para`.
create unique index if not exists ag_agend_remarcado_de_unico
  on public.ag_agendamentos (remarcado_de)
  where remarcado_de is not null;


-- ── 4. CONFERÊNCIA (leitura; o resultado é o recibo) ────────
select 'colunas novas (esperado 2)' as item,
       count(*)::text as situacao
  from information_schema.columns
 where table_schema = 'public' and table_name = 'ag_agendamentos'
   and column_name in ('remarcado_de', 'remarcacao_motivo')

union all
select 'trava contra elo apontando para si mesmo',
       case when exists (
         select 1 from pg_constraint
          where conname = 'ag_agend_remarcacao_nao_aponta_para_si'
       ) then '✅ existe' else '❌ NAO — corrente circular trava a tela' end

union all
select 'indice unico da corrente',
       case when exists (
         select 1 from pg_indexes
          where schemaname = 'public' and indexname = 'ag_agend_remarcado_de_unico'
       ) then '✅ existe' else '❌ NAO — o mesmo ponto pode ganhar dois sucessores' end

union all
select 'CHECK de status intacto (nao foi tocado)',
       case when exists (
         select 1 from pg_constraint
          where conname = 'ag_agend_status_valido'
       ) then '✅ intacto' else '❌ SUMIU — nao deveria ter sido tocado' end

union all
select 'indice da vaga intacto (nao foi tocado)',
       case when exists (
         select 1 from pg_indexes
          where schemaname = 'public' and indexname = 'ag_agend_vaga_unica_prof'
       ) then '✅ intacto' else '❌ SUMIU — nao deveria ter sido tocado' end

union all
select 'agendamentos ja remarcados',
       count(*)::text
  from public.ag_agendamentos
 where remarcado_de is not null;


-- ┌────────────────────────────────────────────────────────────
-- │ 73/75 — migracao-pacientes-obito.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — O ÓBITO CHEGA AO CADASTRO
--
-- POR QUE ESTA MIGRAÇÃO EXISTE
-- `pacientes.obito` é lido em CINCO lugares do código e escrito em NENHUM.
-- A coluna nasce `false` e morre `false`:
--
--   • a Recepção avisa "o cadastro está marcado como óbito" — nunca avisa;
--   • a Agenda RECUSA marcar consulta para falecido — nunca recusa;
--   • duas telas mostram "óbito registrado" — nunca mostram;
--   • o motivo de falta "Resolveu em outro serviço / óbito" não tem para
--     onde levar.
--
-- A CONSEQUÊNCIA SAI DO HOSPITAL. A confirmação da véspera liga para o
-- telefone do cadastro. Um paciente que faleceu NO PRÓPRIO HOSPITAL continua
-- na agenda, continua sendo confirmado, e quem atende o telefone é a
-- família. É o único defeito deste módulo cujo dano não fica dentro do
-- prédio — e o dado para evitá-lo já está gravado em dois lugares.
--
-- POR QUE TRIGGER, E NÃO CÓDIGO NA TELA
-- O óbito é registrado em TRÊS caminhos diferentes: o desfecho do
-- Pronto-Socorro e a saída do leito (os dois em `App.jsx`) e o encerramento
-- ambulatorial (em `dados.js`). Carimbar o cadastro em cada um deles são
-- três lugares para lembrar — e um quarto no dia em que alguém acrescentar
-- outro caminho. O que este trigger faz não é REGRA de negócio escondida no
-- banco: é uma DERIVAÇÃO de um fato já gravado, e derivação que depende de
-- quem chamou é derivação que um dia falta.
--
-- O TRIGGER SÓ CARIMBA. NUNCA APAGA.
-- Desmarcar tem que ser ato deliberado de gente, porque o erro tem dois
-- lados e eles não custam igual:
--
--   carimbar por engano  → a Agenda recusa marcar consulta para alguém vivo,
--                          e a tela DIZ que é isso (a mensagem existe);
--   apagar por engano    → o hospital volta a ligar para a família.
--
-- Se o desfecho for corrigido de "óbito" para "alta", o carimbo NÃO cai
-- sozinho: cair sozinho apagaria também o óbito verdadeiro de quem tem mais
-- de uma passagem. Some com uma mão humana, que sabe qual é qual.
--
-- ⚠️ ADITIVA nas colunas. O backfill MARCA cadastros que hoje estão em
-- branco — é o efeito pretendido, e ele é o motivo desta migração existir.
-- Nenhum cadastro é desmarcado por ela.
--
-- COMO DESFAZER:
--   drop trigger if exists trg_obito_ps on public.ps_atendimentos;
--   drop trigger if exists trg_obito_leito on public.leitos_saidas;
--   drop function if exists public.carimbar_obito_ps();
--   drop function if exists public.carimbar_obito_leito();
--   alter table public.pacientes drop column if exists obito_origem;
--   -- (o `obito` já marcado NÃO se desfaz em massa: é dado clínico real)
-- ============================================================

-- ── 1. DE ONDE VEIO O ÓBITO ─────────────────────────────────
-- Sem isto, o cadastro afirma "esta pessoa morreu" e não sabe dizer por quê.
-- A Agenda manda "corrija o cadastro antes de marcar" — e sem a origem
-- ninguém sabe ONDE corrigir, porque o carimbo é derivado: quem conserta o
-- cadastro sem consertar a fonte vê o carimbo voltar.
alter table public.pacientes
  add column if not exists obito_origem text;


-- ── 2. O CARIMBO, VINDO DO PRONTO-SOCORRO ───────────────────
create or replace function public.carimbar_obito_ps()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.prontuario is null then return new; end if;
  if coalesce(lower(btrim(new.desfecho)), '') <> 'obito' then return new; end if;

  update public.pacientes p
     set obito = true,
         -- `coalesce`: episódio encerrado sem carimbo de hora ainda usa o
         -- dia de hoje em vez de gravar nulo numa coluna que existe para
         -- responder "quando".
         obito_em = coalesce(obito_em, (coalesce(new.desfecho_em, now()))::date),
         obito_origem = coalesce(obito_origem, 'Atendimento #' || new.id::text),
         updated_at = now()
   where p.prontuario = new.prontuario
     -- Só quem ainda não está marcado: rodar duas vezes não reescreve a
     -- data do primeiro registro por cima com a do segundo.
     and coalesce(p.obito, false) = false;

  return new;
end $$;

drop trigger if exists trg_obito_ps on public.ps_atendimentos;
create trigger trg_obito_ps
  after insert or update of desfecho on public.ps_atendimentos
  for each row execute function public.carimbar_obito_ps();


-- ── 3. O CARIMBO, VINDO DA SAÍDA DO LEITO ───────────────────
create or replace function public.carimbar_obito_leito()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.prontuario is null then return new; end if;
  if coalesce(lower(btrim(new.desfecho)), '') <> 'obito' then return new; end if;

  update public.pacientes p
     set obito = true,
         obito_em = coalesce(obito_em, coalesce(new.data_alta, current_date)),
         obito_origem = coalesce(obito_origem, 'Saída de leito — ' || coalesce(new.setor, 'setor não informado')),
         updated_at = now()
   where p.prontuario = new.prontuario
     and coalesce(p.obito, false) = false;

  return new;
end $$;

drop trigger if exists trg_obito_leito on public.leitos_saidas;
create trigger trg_obito_leito
  after insert or update of desfecho on public.leitos_saidas
  for each row execute function public.carimbar_obito_leito();


-- ── 4. OS ÓBITOS QUE JÁ ESTÃO GRAVADOS ──────────────────────
-- O trigger vale daqui para a frente. Estes são os que o hospital já
-- registrou e o cadastro nunca soube — e são exatamente os pacientes que
-- estão na agenda hoje esperando um telefonema.
--
-- O PS primeiro; a saída de leito depois só alcança quem sobrar, pela mesma
-- razão do `coalesce` do trigger: a primeira data registrada é a que fica.
update public.pacientes p
   set obito = true,
       obito_em = coalesce(p.obito_em, a.quando),
       obito_origem = coalesce(p.obito_origem, 'Atendimento #' || a.id::text),
       updated_at = now()
  from (
    select distinct on (prontuario)
           prontuario, id, coalesce(desfecho_em, chegada_em, now())::date as quando
      from public.ps_atendimentos
     where lower(btrim(coalesce(desfecho, ''))) = 'obito'
       and prontuario is not null
     order by prontuario, desfecho_em asc nulls last
  ) a
 where p.prontuario = a.prontuario
   and coalesce(p.obito, false) = false;

update public.pacientes p
   set obito = true,
       obito_em = coalesce(p.obito_em, s.quando),
       obito_origem = coalesce(p.obito_origem, 'Saída de leito — ' || coalesce(s.setor, 'setor não informado')),
       updated_at = now()
  from (
    select distinct on (prontuario)
           prontuario, setor, coalesce(data_alta, current_date) as quando
      from public.leitos_saidas
     where lower(btrim(coalesce(desfecho, ''))) = 'obito'
       and prontuario is not null
     order by prontuario, data_alta asc nulls last
  ) s
 where p.prontuario = s.prontuario
   and coalesce(p.obito, false) = false;


-- ── 5. CONFERÊNCIA (leitura; o resultado é o recibo) ────────
select 'coluna obito_origem' as item,
       case when exists (
         select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'pacientes'
            and column_name = 'obito_origem'
       ) then '✅ existe' else '❌ NAO' end as situacao

union all
select 'os dois triggers (esperado 2)',
       count(*)::text
  from pg_trigger
 where tgname in ('trg_obito_ps', 'trg_obito_leito')
   and not tgisinternal

union all
select 'pacientes marcados com obito AGORA',
       count(*)::text
  from public.pacientes
 where coalesce(obito, false) = true

union all
-- Se esta linha vier maior que zero, o backfill deixou alguém para trás e a
-- confirmação da véspera ainda pode ligar para a família dessa pessoa.
select 'obitos registrados que o cadastro AINDA nao sabe',
       count(*)::text
  from (
    select prontuario from public.ps_atendimentos
     where lower(btrim(coalesce(desfecho, ''))) = 'obito' and prontuario is not null
    union
    select prontuario from public.leitos_saidas
     where lower(btrim(coalesce(desfecho, ''))) = 'obito' and prontuario is not null
  ) fontes
  join public.pacientes p using (prontuario)
 where coalesce(p.obito, false) = false

union all
-- O que este número mostra é o tamanho do problema que estava invisível.
select 'destes, quantos tinham consulta MARCADA a partir de hoje',
       count(distinct g.prontuario)::text
  from public.ag_agendamentos g
  join public.pacientes p on p.prontuario = g.prontuario
 where coalesce(p.obito, false) = true
   and g.status in ('agendado', 'confirmado')
   and g.data >= current_date;


-- ┌────────────────────────────────────────────────────────────
-- │ 74/75 — migracao-pacientes-recem-nascido.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — O RECÉM-NASCIDO ENTRA NO SISTEMA
--
-- POR QUE ESTA MIGRAÇÃO EXISTE
-- O hospital faz parto e o bebê NÃO TINHA COMO SER CADASTRADO. Não é que o
-- caminho fosse ruim: ele não existia. Zero ocorrências de `prontuario_mae`,
-- `dnv` ou `recem_nascido` no código inteiro.
--
-- O cadastro pede nome, CPF e CNS. O recém-nascido não tem nenhum dos três
-- no dia em que nasce — ele tem outra identidade, e ela é bem definida:
--
--   • o nome provisório "RN de <mãe>", convenção nacional;
--   • a DNV (Declaração de Nascido Vivo), documento dele até sair a
--     certidão, NUMERADA E ÚNICA POR NASCIMENTO;
--   • o vínculo com o prontuário da mãe, por onde se reconstrói o parto e
--     por onde se confere a quem o bebê pertence na alta;
--   • a hora do nascimento, que na primeira semana de vida é dado clínico.
--
-- ⚠️ A COLUNA QUE EXISTE POR CAUSA DE SEGURANÇA DO PACIENTE É A `dnv`.
-- Dois irmãos do mesmo parto têm a mesma mãe, a mesma data e nomes quase
-- idênticos — e o verificador de duplicidade os acusava de ser a mesma
-- pessoa com 90% de confiança, oferecendo "use o prontuário que já existe".
-- Seguir isso junta dois bebês num prontuário só, e a partir dali a
-- prescrição de um vale para o outro.
--
-- A DNV é o que separa: diferente = dois nascimentos; igual = um só, e aí a
-- duplicidade tem que continuar avisando. O índice único abaixo é a garantia
-- de que ela não vira dois cadastros para o mesmo nascimento.
--
-- ⚠️ ADITIVA. Colunas novas, uma FK, um índice único parcial. Nada que era
-- aceito passa a ser recusado — nenhum cadastro existente tem DNV, então o
-- índice nasce sem nada para reprovar.
--
-- COMO DESFAZER:
--   drop index if exists public.pacientes_dnv_unica;
--   alter table public.pacientes
--     drop constraint if exists pacientes_mae_fk,
--     drop column if exists prontuario_mae,
--     drop column if exists dnv,
--     drop column if exists hora_nascimento,
--     drop column if exists ordem_nascimento;
-- ============================================================

-- ── 1. AS COLUNAS ───────────────────────────────────────────
alter table public.pacientes
  -- O vínculo do parto. O bebê tem prontuário PRÓPRIO — ele é outra pessoa,
  -- com histórico próprio — e este campo é o que liga os dois lados sem
  -- misturá-los.
  add column if not exists prontuario_mae text,

  -- Declaração de Nascido Vivo. Texto e não número: vem com zeros à
  -- esquerda e o formato varia por estado; guardar como inteiro comeria o
  -- zero e transformaria duas DNVs em uma.
  add column if not exists dnv text,

  -- A hora importa. Na primeira semana de vida a idade se conta em horas, e
  -- é ela que distingue dois gêmeos nascidos no mesmo minuto do mesmo dia.
  add column if not exists hora_nascimento time,

  -- 1 para o primeiro do parto, 2 para o segundo. É a prova de segunda
  -- linha quando a DNV ainda não saiu.
  add column if not exists ordem_nascimento smallint;


-- ── 2. A MÃE É UM PACIENTE DE VERDADE ───────────────────────
-- FK para o cadastro dela. `on delete set null`: paciente neste sistema não
-- se apaga, mas se um dia alguém apagar a mãe, o bebê perde o vínculo em vez
-- de desaparecer junto.
--
-- Envelopado porque a FK falha se houver `prontuario_mae` órfão — e prefere
-- avisar a derrubar a migração inteira.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pacientes_mae_fk'
  ) then
    alter table public.pacientes
      add constraint pacientes_mae_fk
      foreign key (prontuario_mae) references public.pacientes (prontuario)
      on delete set null;
  end if;
exception when others then
  raise notice 'ATENCAO: nao foi possivel criar a FK da mae (%). Ha prontuario_mae apontando para cadastro que nao existe.', sqlerrm;
end $$;


-- ── 3. UMA DNV, UM NASCIMENTO ───────────────────────────────
-- A garantia que o código sozinho não dá: a regra em `recem-nascido.js` usa
-- a DNV para separar gêmeos de duplicata, e ela só funciona se a DNV for de
-- fato única. Duas recepcionistas cadastrando o mesmo bebê ao mesmo tempo
-- passariam pelas duas checagens antes de qualquer uma gravar.
--
-- PARCIAL (`where dnv is not null`) porque a esmagadora maioria dos
-- pacientes não é recém-nascido e nunca terá DNV — sem o filtro, o índice
-- reprovaria o segundo cadastro sem DNV do acervo inteiro.
create unique index if not exists pacientes_dnv_unica
  on public.pacientes (dnv)
  where dnv is not null and btrim(dnv) <> '';


-- ── 4. ACHAR OS IRMÃOS DE UM PARTO ──────────────────────────
-- A tela pergunta "esta mãe já tem outro bebê cadastrado hoje?" — é como se
-- descobre que o parto foi múltiplo antes de criar o segundo cadastro.
create index if not exists pacientes_mae_idx
  on public.pacientes (prontuario_mae)
  where prontuario_mae is not null;


-- ── 5. CONFERÊNCIA (leitura; o resultado é o recibo) ────────
select 'colunas novas (esperado 4)' as item,
       count(*)::text as situacao
  from information_schema.columns
 where table_schema = 'public' and table_name = 'pacientes'
   and column_name in ('prontuario_mae', 'dnv', 'hora_nascimento', 'ordem_nascimento')

union all
select 'FK da mae',
       case when exists (
         select 1 from pg_constraint where conname = 'pacientes_mae_fk'
       ) then '✅ existe' else '❌ NAO — ver o aviso do passo 2' end

union all
select 'indice unico da DNV',
       case when exists (
         select 1 from pg_indexes
          where schemaname = 'public' and indexname = 'pacientes_dnv_unica'
       ) then '✅ existe' else '❌ NAO — a mesma DNV poderia virar dois cadastros' end

union all
select 'indice para achar irmaos do parto',
       case when exists (
         select 1 from pg_indexes
          where schemaname = 'public' and indexname = 'pacientes_mae_idx'
       ) then '✅ existe' else '❌ NAO' end

union all
select 'recem-nascidos ja vinculados a uma mae',
       count(*)::text
  from public.pacientes
 where prontuario_mae is not null

union all
-- Deve dar zero num banco que nunca teve estas colunas. Se der mais que
-- zero, alguem cadastrou DNV repetida antes do indice existir.
select 'DNVs repetidas (tem que ser 0)',
       coalesce(sum(qtd - 1), 0)::text
  from (
    select count(*) as qtd
      from public.pacientes
     where dnv is not null and btrim(dnv) <> ''
     group by dnv
    having count(*) > 1
  ) repetidas;


-- ┌────────────────────────────────────────────────────────────
-- │ 75/75 — migracao-rls-leitura.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — RLS: quem LÊ e quem ESCREVE em cada tabela
--
-- ⚠️ ARQUIVO GERADO — não edite à mão.
--    Regenere com:  node supabase/gerar-rls.mjs
--    A fonte é src/acesso/mapa-tabelas.js.
--
-- O QUE MUDA
-- Antes: toda política de SELECT era `using (true)` para `authenticated`.
-- Qualquer usuário logado lia qualquer tabela pela API REST — inclusive
-- `pacientes` (nome completo, CPF, CNS, nome da mãe, endereço) e todo o
-- prontuário. O menu escondia o módulo; o dado continuava alcançável.
-- Depois: a leitura passa pelo MESMO perfil que monta o menu.
--
-- É ADITIVO E REVERSÍVEL (ver "VOLTAR ATRÁS" no fim do arquivo). Não cria,
-- não altera e não apaga nenhuma tabela, coluna ou linha.
--
-- ⚠️ RODE NO DEMO PRIMEIRO. Depois no principal, ANTES do merge do código.
--    Na prática o código nem depende dele: quem publica a barreira é este
--    SQL. Rodar sozinho já fecha o acesso.
--
-- QUEM PERDE O QUÊ — CONFIRA ANTES, NÃO DEPOIS
-- A frase antiga aqui dizia que "todo mundo ainda está no Provisório" e
-- que ninguém perderia acesso. Isso ENVELHECEU: a equipe foi reclassificada,
-- e a PARTE 4 agora mexe em ESCRITA, que é onde o estrago é silencioso —
-- o PostgREST responde 2xx alterando zero linhas.
--
-- 🔴 Rode `conferencia-escrita-por-modulo.sql` ANTES desta migração, nos
-- dois bancos. Ele lista, pessoa a pessoa e módulo a módulo, quem deixaria
-- de gravar. Zero = pode aplicar. Diferente de zero = corrija os perfis
-- primeiro.
--
-- Isto existe porque já aconteceu: o PR #60 ligou RLS e trancou a escrita
-- de 18 tabelas AO VIVO, e ninguém percebeu na hora porque as telas
-- percorridas eram de leitura.
--
-- ⚠️ SE ALGUÉM REEXECUTAR UMA MIGRAÇÃO ANTIGA, RODE ESTA DE NOVO.
--    As migrações antigas recriam a política `for select ... using (true)`
--    e a `for all` que a PARTE 2 desarma — reabrindo a leitura em silêncio.
--    Esta é idempotente: rodar duas vezes não faz mal.
-- ============================================================

-- Resolver `my_role()` sem prefixo é preciso na PARTE 2, que recria
-- políticas a partir do texto que o próprio Postgres devolve.
set search_path = public, extensions, pg_temp;


-- ════════════════════════════════════════════════════════════
-- PARTE 1/5 — AS FUNÇÕES DE PERMISSÃO
--
-- Espelham `src/acesso/permissoes.js`, nesta ordem: perfil → exceção
-- individual → travas. `security definer` porque a função precisa ler
-- `profiles` e `perfis_permissoes` por baixo do RLS delas.
-- ════════════════════════════════════════════════════════════

-- O nível efetivo desta pessoa neste módulo: nenhum | leitura | escrita.
create or replace function public.meu_nivel(p_modulo text)
returns text
language sql
stable
security definer
set search_path = public
as $meu_nivel$
  with me as (
    select id, role, perfil from public.profiles where id = auth.uid()
  ),
  bruto as (
    select coalesce(
      -- 1) a exceção individual manda (serve para AMPLIAR e para REDUZIR)
      (select up.nivel from public.usuarios_permissoes up, me
        where up.user_id = me.id and up.modulo = p_modulo),
      -- 2) o pacote do cargo
      (select pp.nivel from public.perfis_permissoes pp, me
        where pp.perfil_chave = me.perfil and pp.modulo = p_modulo),
      -- 3) sem perfil é sem acesso — falha FECHADA
      'nenhum'
    ) as nivel
  )
  select case
    -- Trava anti-trancamento: Usuários e Perfis é sempre, e só, do
    -- adm_master. Sem isto, um perfil configurado errado tranca o
    -- administrador do lado de fora e só se resolve pelo painel.
    when p_modulo = 'users' then
      case when (select role from me) = 'adm_master' then 'escrita' else 'nenhum' end
    -- Teto do visualizador: nunca escreve, tenha o perfil que tiver.
    when (select role from me) = 'visualizador' and (select nivel from bruto) = 'escrita' then
      'leitura'
    else (select nivel from bruto)
  end
$meu_nivel$;

-- Pode ABRIR o módulo? (leitura ou escrita)
create or replace function public.pode_ver(p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $pode_ver$
  select public.meu_nivel(p_modulo) in ('leitura', 'escrita')
$pode_ver$;

-- Pode abrir ALGUM destes? Uma tela lê tabela de vizinho por bom motivo:
-- o Giro de Leitos monta o mapa de risco com as escalas de enfermagem, o
-- Paciente 360 junta PS, leito, SCIH e PEP na mesma consulta.
create or replace function public.pode_ver_algum(variadic p_modulos text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $pode_ver_algum$
  select exists (select 1 from unnest(p_modulos) m where public.pode_ver(m))
$pode_ver_algum$;

-- Pode LANÇAR no módulo? Ainda não é usada por política nenhuma — a
-- escrita continua decidida por `role`. Fica pronta para a fase seguinte.
create or replace function public.pode_editar(p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $pode_editar$
  select public.meu_nivel(p_modulo) = 'escrita'
$pode_editar$;

-- Escreve em ALGUM destes módulos? Espelha `pode_ver_algum`, para a tabela
-- que serve a mais de um módulo (`sup_itens` é do almoxarifado e da
-- farmácia; quem tem escrita em qualquer um dos dois grava nela).
create or replace function public.pode_editar_algum(variadic p_modulos text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $pode_editar_algum$
  select exists (select 1 from unnest(p_modulos) m where public.pode_editar(m))
$pode_editar_algum$;


-- ════════════════════════════════════════════════════════════
-- PARTE 2/5 — DESARMAR AS POLÍTICAS "FOR ALL"
--
-- ISTO É O QUE FAZ A PARTE 3 VALER ALGUMA COISA. Treze tabelas têm uma
-- política `for all to authenticated using (my_role() in
-- ('adm_master','adm_silver'))`. "FOR ALL" inclui SELECT, e políticas
-- permissivas se SOMAM: bastaria essa para qualquer adm_silver — médico,
-- enfermeiro, recepção, quase todo mundo — continuar lendo a tabela
-- inteira, por cima da política nova. A porta nova ficaria ao lado de uma
-- porta velha destrancada.
--
-- Aqui cada FOR ALL vira três políticas (insert/update/delete) com a
-- MESMA condição de antes. Ninguém ganha nem perde direito de escrita;
-- só o SELECT sai de dentro delas.
--
-- Roda sobre o que o BANCO tem de fato, não sobre uma lista — assim
-- alcança também a política que a Laura tenha criado no meio do caminho.
-- ════════════════════════════════════════════════════════════
do $converter$
declare
  p record;
  q text;
  w text;
  qtd int := 0;
begin
  -- Tabela temporária: alterar o catálogo no meio de um cursor sobre o
  -- próprio catálogo é pedir surpresa. Materializa antes, mexe depois.
  -- (Os apelidos fogem de `n`/`t`/`p` de propósito: apelido igual a
  -- variável do PL/pgSQL vira "ambiguous column reference" em execução.)
  create temp table _rls_forall on commit drop as
    select c.relname::text as tabela,
           pol.polname::text as nome,
           pg_get_expr(pol.polqual,      pol.polrelid) as usando,
           pg_get_expr(pol.polwithcheck, pol.polrelid) as checando,
           case when pol.polroles = '{0}'::oid[] then 'public'
                else (select string_agg(quote_ident(r.rolname), ', ')
                        from pg_roles r where r.oid = any(pol.polroles)) end as papeis
      from pg_policy pol
      join pg_class c      on c.oid = pol.polrelid
      join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = 'public'
     where pol.polcmd = '*';

  for p in select * from _rls_forall loop
    q := coalesce(p.usando, 'true');
    w := coalesce(p.checando, q);
    -- IDEMPOTENCIA: apaga a FOR ALL de origem E os tres alvos, com IF
    -- EXISTS. Sem isto, uma segunda passada colide ("policy ..._ins already
    -- exists") quando a FOR ALL foi recriada por um re-run da migracao de
    -- origem (a de perfis-acesso e re-rodada de vez em quando). Apagar antes
    -- de criar converge a partir de qualquer estado.
    execute format('drop policy if exists %I on public.%I', p.nome, p.tabela);
    execute format('drop policy if exists %I on public.%I', left(p.nome, 55) || '_ins', p.tabela);
    execute format('drop policy if exists %I on public.%I', left(p.nome, 55) || '_upd', p.tabela);
    execute format('drop policy if exists %I on public.%I', left(p.nome, 55) || '_del', p.tabela);
    execute format('create policy %I on public.%I for insert to %s with check (%s)',
                   left(p.nome, 55) || '_ins', p.tabela, p.papeis, w);
    execute format('create policy %I on public.%I for update to %s using (%s) with check (%s)',
                   left(p.nome, 55) || '_upd', p.tabela, p.papeis, q, w);
    execute format('create policy %I on public.%I for delete to %s using (%s)',
                   left(p.nome, 55) || '_del', p.tabela, p.papeis, q);
    qtd := qtd + 1;
    raise notice 'FOR ALL desarmada: % (%) -> insert/update/delete', p.tabela, p.nome;
  end loop;

  raise notice '% politica(s) FOR ALL convertida(s).', qtd;
  drop table _rls_forall;
end
$converter$;


-- ════════════════════════════════════════════════════════════
-- PARTE 3/5 — A POLÍTICA DE LEITURA DE CADA TABELA
--
-- Uma linha por tabela: o nome e quem pode ler. O comentário à direita é
-- a mesma coisa em português. 24 das 94 tabelas ficam abertas a
-- qualquer autenticado — são catálogo, referência e configuração, sem
-- nenhum dado de paciente. Isso é DECISÃO declarada, não sobra: negar
-- `farm_medicamentos` desligaria o motor de alertas dentro do PS e do PEP.
--
-- Toda política de SELECT anterior da tabela é apagada antes (os nomes
-- variam: atend_select, cidref_select, saidas_select…).
--
-- ⚠️ ESCRITA: ligar o RLS numa tabela que NÃO tinha política de escrita
-- trancaria a escrita — RLS ligado sem política nega tudo. Várias tabelas
-- (todo o NSP, a enfermagem SAE/escalas/LPP, as faixas de triagem) viviam
-- com RLS DESLIGADO, ou seja, escrita aberta a qualquer login. Este PR
-- fecha LEITURA e promete não mexer em escrita: então, onde não havia
-- política de escrita, recriamos a escrita ABERTA que existia. Apertar
-- escrita por papel é fase própria — a função `pode_editar` já está pronta
-- para ela. (Tabela com `for all` não cai aqui: a PARTE 2 já a converteu em
-- insert/update/delete com a condição de papel original.)
-- ════════════════════════════════════════════════════════════
do $leitura$
declare
  t record;
  pol record;
  qtd int := 0;
  reabriu int := 0;
  faltando text[] := '{}';
begin
  for t in
    select * from (values
      ('ag_agendamentos', 'public.pode_ver_algum(''atendimento'')'),                                  -- atendimento
      ('ag_bloqueios', 'public.pode_ver_algum(''atendimento'')'),                                     -- atendimento
      ('ag_grades', 'public.pode_ver_algum(''atendimento'')'),                                        -- atendimento
      ('at_conta_itens', 'public.pode_ver_algum(''atendimento'')'),                                   -- atendimento
      ('at_contas', 'public.pode_ver_algum(''atendimento'')'),                                        -- atendimento
      ('at_convenios', 'true'),                                                                       -- todos os autenticados
      ('at_dominios', 'true'),                                                                        -- todos os autenticados
      ('at_planos', 'true'),                                                                          -- todos os autenticados
      ('at_procedimentos', 'true'),                                                                   -- todos os autenticados
      ('at_responsaveis', 'public.pode_ver_algum(''atendimento'', ''paciente'')'),                    -- atendimento, paciente
      ('atendimentos', 'public.pode_ver_algum(''overview'', ''atendimento'', ''ambulatorio'', ''print'')'), -- overview, atendimento, ambulatorio, print
      ('auditoria', 'public.pode_ver_algum(''auditoria'')'),                                          -- auditoria
      ('cc_cirurgias', 'public.pode_ver_algum(''bloco'')'),                                           -- bloco
      ('cc_salas', 'true'),                                                                           -- todos os autenticados
      ('cid_referencia', 'true'),                                                                     -- todos os autenticados
      ('enf_escala_faixas', 'true'),                                                                  -- todos os autenticados
      ('enf_escalas', 'public.pode_ver_algum(''paciente'', ''leitos'')'),                             -- paciente, leitos
      ('enf_lesao_pressao', 'public.pode_ver_algum(''paciente'', ''leitos'', ''nsp'')'),              -- paciente, leitos, nsp
      ('enf_sae_catalogo', 'true'),                                                                   -- todos os autenticados
      ('enf_sae_checagem', 'public.pode_ver_algum(''paciente'', ''leitos'')'),                        -- paciente, leitos
      ('enf_sae_diagnosticos', 'public.pode_ver_algum(''paciente'')'),                                -- paciente
      ('enf_sae_historico', 'public.pode_ver_algum(''paciente'')'),                                   -- paciente
      ('enf_sae_prescricao_itens', 'public.pode_ver_algum(''paciente'', ''leitos'')'),                -- paciente, leitos
      ('enf_sae_prescricoes', 'public.pode_ver_algum(''paciente'', ''leitos'')'),                     -- paciente, leitos
      ('farm_incompat_y', 'true'),                                                                    -- todos os autenticados
      ('farm_interacoes', 'true'),                                                                    -- todos os autenticados
      ('farm_intervencoes', 'public.pode_ver_algum(''farmacia'')'),                                   -- farmacia
      ('farm_lotes', 'public.pode_ver_algum(''farmacia'')'),                                          -- farmacia
      ('farm_medicamentos', 'true'),                                                                  -- todos os autenticados
      ('farm_movimentos', 'public.pode_ver_algum(''farmacia'', ''controlados'', ''ps'')'),            -- farmacia, controlados, ps
      ('farm_nao_padronizados', 'public.pode_ver_algum(''farmacia'')'),                               -- farmacia
      ('farm_preparo', 'public.pode_ver_algum(''farmacia'', ''ps'')'),                                -- farmacia, ps
      ('leitos', 'public.pode_ver_algum(''leitos'', ''paciente'', ''scih'')'),                        -- leitos, paciente, scih
      ('leitos_saidas', 'public.pode_ver_algum(''leitos'', ''paciente'')'),                           -- leitos, paciente
      ('leitos_turnover', 'public.pode_ver_algum(''leitos'', ''overview'', ''print'')'),              -- leitos, overview, print
      ('nsp_acoes', 'public.pode_ver_algum(''nsp'')'),                                                -- nsp
      ('nsp_capacitacoes', 'public.pode_ver_algum(''nsp'')'),                                         -- nsp
      ('nsp_comunicados', 'public.pode_ver_algum(''nsp'')'),                                          -- nsp
      ('nsp_incidente_eventos', 'public.pode_ver_algum(''nsp'')'),                                    -- nsp
      ('nsp_incidentes', 'public.pode_ver_algum(''nsp'')'),                                           -- nsp
      ('nsp_meta_faixas', 'true'),                                                                    -- todos os autenticados
      ('nsp_meta_medicoes', 'public.pode_ver_algum(''nsp'')'),                                        -- nsp
      ('nsp_protocolos', 'true'),                                                                     -- todos os autenticados
      ('nsp_rca', 'public.pode_ver_algum(''nsp'')'),                                                  -- nsp
      ('pacientes', 'public.pode_ver_algum(''atendimento'', ''ambulatorio'', ''ps'', ''paciente'')'), -- atendimento, ambulatorio, ps, paciente
      ('pep_acessos', 'public.pode_ver_algum(''auditoria'')'),                                        -- auditoria
      ('pep_administracoes', 'public.pode_ver_algum(''paciente'')'),                                  -- paciente
      ('pep_alergias', 'public.pode_ver_algum(''paciente'')'),                                        -- paciente
      ('pep_anamneses', 'public.pode_ver_algum(''paciente'')'),                                       -- paciente
      ('pep_anotacoes_enfermagem', 'public.pode_ver_algum(''paciente'')'),                            -- paciente
      ('pep_aprazamentos', 'public.pode_ver_algum(''paciente'')'),                                    -- paciente
      ('pep_condicoes', 'public.pode_ver_algum(''paciente'')'),                                       -- paciente
      ('pep_episodios', 'public.pode_ver_algum(''paciente'')'),                                       -- paciente
      ('pep_evolucoes', 'public.pode_ver_algum(''paciente'')'),                                       -- paciente
      ('pep_medicamentos_uso', 'public.pode_ver_algum(''paciente'')'),                                -- paciente
      ('pep_prescricao_eventos', 'public.pode_ver_algum(''paciente'')'),                              -- paciente
      ('pep_prescricao_itens', 'public.pode_ver_algum(''paciente'')'),                                -- paciente
      ('pep_prescricoes', 'public.pode_ver_algum(''paciente'')'),                                     -- paciente
      ('pep_reconciliacao_itens', 'public.pode_ver_algum(''paciente'')'),                             -- paciente
      ('pep_reconciliacoes', 'public.pode_ver_algum(''paciente'')'),                                  -- paciente
      ('pep_sinais_vitais', 'public.pode_ver_algum(''paciente'')'),                                   -- paciente
      ('pep_sumarios_alta', 'public.pode_ver_algum(''paciente'')'),                                   -- paciente
      ('perfis_acesso', 'true'),                                                                      -- todos os autenticados
      ('perfis_permissoes', 'true'),                                                                  -- todos os autenticados
      ('profiles', 'true'),                                                                           -- todos os autenticados
      ('prot_ativacoes', 'public.pode_ver_algum(''protocolos'', ''ps'', ''paciente'')'),              -- protocolos, ps, paciente
      ('prot_bundle_itens', 'public.pode_ver_algum(''protocolos'', ''ps'', ''paciente'')'),           -- protocolos, ps, paciente
      ('prot_catalogo', 'true'),                                                                      -- todos os autenticados
      ('prot_setor', 'true'),                                                                         -- todos os autenticados
      ('ps_administracoes', 'public.pode_ver_algum(''ps'', ''paciente'', ''faturamento'')'),          -- ps, paciente, faturamento
      ('ps_atendimentos', 'public.pode_ver_algum(''ps'', ''atendimento'', ''ambulatorio'', ''paciente'')'), -- ps, atendimento, ambulatorio, paciente
      ('ps_faixas_obstetricas', 'true'),                                                              -- todos os autenticados
      ('ps_faixas_pediatricas', 'true'),                                                              -- todos os autenticados
      ('ps_prescricao_itens', 'public.pode_ver_algum(''ps'', ''paciente'', ''farmacia'')'),           -- ps, paciente, farmacia
      ('ps_protocolos', 'true'),                                                                      -- todos os autenticados
      ('ps_registros', 'public.pode_ver_algum(''ps'', ''paciente'', ''farmacia'')'),                  -- ps, paciente, farmacia
      ('ps_salas', 'public.pode_ver_algum(''ps'')'),                                                  -- ps
      ('ps_sinais', 'public.pode_ver_algum(''ps'', ''paciente'')'),                                   -- ps, paciente
      ('scih_casos', 'public.pode_ver_algum(''scih'', ''paciente'')'),                                -- scih, paciente
      ('scih_germes', 'true'),                                                                        -- todos os autenticados
      ('scih_indicadores', 'public.pode_ver_algum(''scih'', ''overview'', ''print'')'),               -- scih, overview, print
      ('setores', 'true'),                                                                            -- todos os autenticados
      ('sigtap_procedimentos', 'true'),                                                               -- todos os autenticados
      ('solicitacoes', 'public.pode_ver_algum(''ps'', ''leitos'')'),                                  -- ps, leitos
      ('sup_cotacoes', 'public.pode_ver_algum(''suprimentos'')'),                                     -- suprimentos
      ('sup_fornecedores', 'public.pode_ver_algum(''suprimentos'', ''farmacia'')'),                   -- suprimentos, farmacia
      ('sup_inventarios', 'public.pode_ver_algum(''suprimentos'')'),                                  -- suprimentos
      ('sup_itens', 'public.pode_ver_algum(''suprimentos'', ''farmacia'')'),                          -- suprimentos, farmacia
      ('sup_lotes', 'public.pode_ver_algum(''suprimentos'')'),                                        -- suprimentos
      ('sup_movimentos', 'public.pode_ver_algum(''suprimentos'', ''farmacia'')'),                     -- suprimentos, farmacia
      ('sup_parametros', 'public.pode_ver_algum(''suprimentos'', ''farmacia'')'),                     -- suprimentos, farmacia
      ('sup_pedidos', 'public.pode_ver_algum(''suprimentos'')'),                                      -- suprimentos
      ('sup_requisicoes', 'public.pode_ver_algum(''suprimentos'')'),                                  -- suprimentos
      ('usuarios_permissoes', 'public.pode_ver_algum(''users'') or user_id = auth.uid()')             -- users, @proprio
    ) as v(tabela, cond)
  loop
    if not exists (
      select 1 from information_schema.tables
       where table_schema = 'public' and table_name = t.tabela
    ) then
      faltando := faltando || t.tabela;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t.tabela);

    for pol in
      select antiga.polname
        from pg_policy antiga
        join pg_class c      on c.oid = antiga.polrelid
        join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = 'public'
       where c.relname = t.tabela and antiga.polcmd = 'r'
    loop
      execute format('drop policy %I on public.%I', pol.polname, t.tabela);
    end loop;

    execute format('create policy %I on public.%I for select to authenticated using (%s)',
                   t.tabela || '_leitura', t.tabela, t.cond);
    qtd := qtd + 1;

    -- Preserva a escrita aberta: só quando a tabela não tem NENHUMA política
    -- de escrita (insert/update/delete/all). Se tiver, foi a PARTE 2 ou a
    -- migração da tabela que a definiu — não encostar. O guard também torna
    -- isto idempotente: na segunda passada as três já existem e o bloco pula.
    if not exists (
      select 1 from pg_policy pw
        join pg_class cw      on cw.oid = pw.polrelid
        join pg_namespace nw  on nw.oid = cw.relnamespace and nw.nspname = 'public'
       where cw.relname = t.tabela and pw.polcmd in ('a','w','d','*')
    ) then
      execute format('create policy %I on public.%I for insert to authenticated with check (true)',
                     t.tabela || '_escrita_ins', t.tabela);
      execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)',
                     t.tabela || '_escrita_upd', t.tabela);
      execute format('create policy %I on public.%I for delete to authenticated using (true)',
                     t.tabela || '_escrita_del', t.tabela);
      reabriu := reabriu + 1;
    end if;
  end loop;

  raise notice '% tabela(s) com politica de leitura por modulo.', qtd;
  raise notice '% tabela(s) sem escrita propria: escrita aberta preservada.', reabriu;
  if array_length(faltando, 1) > 0 then
    raise notice 'PULADAS (nao existem neste banco): %', array_to_string(faltando, ', ');
  end if;
end
$leitura$;


-- ════════════════════════════════════════════════════════════
-- PARTE 4/5 — A ESCRITA PASSA A EXIGIR O MÓDULO
--
-- Antes: as políticas de escrita olhavam `my_role()`. Quem fosse
-- `adm_silver` — médico, enfermeiro, recepção, quase todo mundo — gravava
-- em QUALQUER tabela com política de escrita, independente do módulo. O
-- menu escondia; a API não.
--
-- 🔴 POR QUE `as restrictive` E NÃO SUBSTITUIR AS POLÍTICAS EXISTENTES
-- Política permissiva se SOMA (OR). Trocar as atuais por uma nova poderia
-- AFROUXAR as que hoje são mais estritas — a alçada de compra, por
-- exemplo, é escrita só de adm_master. Política RESTRITIVA combina com E:
-- ela só aperta, nunca solta, e não precisa apagar nada. Para voltar
-- atrás, basta apagar as três políticas `_mod_*` da tabela.
--
-- ⚠️ NÃO usar `for all`: isso incluiria SELECT, e uma restritiva sobre
-- SELECT tiraria a LEITURA de quem tem só leitura no módulo — quebrando
-- justamente o que a PARTE 3 acabou de montar. São três políticas
-- separadas: insert, update e delete.
--
-- FICAM DE FORA, por decisão declarada em src/acesso/mapa-tabelas.js:
--   • as tabelas de REGISTRO (`auditoria`, `pep_acessos`) — quem grava é
--     qualquer pessoa que age, não quem administra o módulo. Exigir o
--     módulo faria a trilha parar de registrar em silêncio.
--   • os catálogos e a referência — não pertencem a um módulo; a escrita
--     neles segue por papel, como hoje.
-- ════════════════════════════════════════════════════════════
do $escrita$
declare
  t record;
  qtd int := 0;
  pulou int := 0;
begin
  for t in
    select * from (values
      ('ag_agendamentos', 'public.pode_editar_algum(''atendimento'')'),                               -- atendimento
      ('ag_bloqueios', 'public.pode_editar_algum(''atendimento'')'),                                  -- atendimento
      ('ag_grades', 'public.pode_editar_algum(''atendimento'')'),                                     -- atendimento
      ('at_conta_itens', 'public.pode_editar_algum(''atendimento'')'),                                -- atendimento
      ('at_contas', 'public.pode_editar_algum(''atendimento'')'),                                     -- atendimento
      ('at_responsaveis', 'public.pode_editar_algum(''atendimento'', ''paciente'')'),                 -- atendimento, paciente
      ('atendimentos', 'public.pode_editar_algum(''overview'', ''atendimento'', ''ambulatorio'', ''print'')'), -- overview, atendimento, ambulatorio, print
      ('cc_cirurgias', 'public.pode_editar_algum(''bloco'')'),                                        -- bloco
      ('enf_escalas', 'public.pode_editar_algum(''paciente'', ''leitos'')'),                          -- paciente, leitos
      ('enf_lesao_pressao', 'public.pode_editar_algum(''paciente'', ''leitos'', ''nsp'')'),           -- paciente, leitos, nsp
      ('enf_sae_checagem', 'public.pode_editar_algum(''paciente'', ''leitos'')'),                     -- paciente, leitos
      ('enf_sae_diagnosticos', 'public.pode_editar_algum(''paciente'')'),                             -- paciente
      ('enf_sae_historico', 'public.pode_editar_algum(''paciente'')'),                                -- paciente
      ('enf_sae_prescricao_itens', 'public.pode_editar_algum(''paciente'', ''leitos'')'),             -- paciente, leitos
      ('enf_sae_prescricoes', 'public.pode_editar_algum(''paciente'', ''leitos'')'),                  -- paciente, leitos
      ('farm_intervencoes', 'public.pode_editar_algum(''farmacia'')'),                                -- farmacia
      ('farm_lotes', 'public.pode_editar_algum(''farmacia'')'),                                       -- farmacia
      ('farm_movimentos', 'public.pode_editar_algum(''farmacia'', ''controlados'', ''ps'')'),         -- farmacia, controlados, ps
      ('farm_nao_padronizados', 'public.pode_editar_algum(''farmacia'')'),                            -- farmacia
      ('farm_preparo', 'public.pode_editar_algum(''farmacia'', ''ps'')'),                             -- farmacia, ps
      ('leitos', 'public.pode_editar_algum(''leitos'', ''paciente'', ''scih'')'),                     -- leitos, paciente, scih
      ('leitos_saidas', 'public.pode_editar_algum(''leitos'', ''paciente'')'),                        -- leitos, paciente
      ('leitos_turnover', 'public.pode_editar_algum(''leitos'', ''overview'', ''print'')'),           -- leitos, overview, print
      ('nsp_acoes', 'public.pode_editar_algum(''nsp'')'),                                             -- nsp
      ('nsp_capacitacoes', 'public.pode_editar_algum(''nsp'')'),                                      -- nsp
      ('nsp_comunicados', 'public.pode_editar_algum(''nsp'')'),                                       -- nsp
      ('nsp_incidente_eventos', 'public.pode_editar_algum(''nsp'')'),                                 -- nsp
      ('nsp_incidentes', 'public.pode_editar_algum(''nsp'')'),                                        -- nsp
      ('nsp_meta_medicoes', 'public.pode_editar_algum(''nsp'')'),                                     -- nsp
      ('nsp_rca', 'public.pode_editar_algum(''nsp'')'),                                               -- nsp
      ('pacientes', 'public.pode_editar_algum(''atendimento'', ''ambulatorio'', ''ps'', ''paciente'')'), -- atendimento, ambulatorio, ps, paciente
      ('pep_administracoes', 'public.pode_editar_algum(''paciente'')'),                               -- paciente
      ('pep_alergias', 'public.pode_editar_algum(''paciente'')'),                                     -- paciente
      ('pep_anamneses', 'public.pode_editar_algum(''paciente'')'),                                    -- paciente
      ('pep_anotacoes_enfermagem', 'public.pode_editar_algum(''paciente'')'),                         -- paciente
      ('pep_aprazamentos', 'public.pode_editar_algum(''paciente'')'),                                 -- paciente
      ('pep_condicoes', 'public.pode_editar_algum(''paciente'')'),                                    -- paciente
      ('pep_episodios', 'public.pode_editar_algum(''paciente'')'),                                    -- paciente
      ('pep_evolucoes', 'public.pode_editar_algum(''paciente'')'),                                    -- paciente
      ('pep_medicamentos_uso', 'public.pode_editar_algum(''paciente'')'),                             -- paciente
      ('pep_prescricao_eventos', 'public.pode_editar_algum(''paciente'')'),                           -- paciente
      ('pep_prescricao_itens', 'public.pode_editar_algum(''paciente'')'),                             -- paciente
      ('pep_prescricoes', 'public.pode_editar_algum(''paciente'')'),                                  -- paciente
      ('pep_reconciliacao_itens', 'public.pode_editar_algum(''paciente'')'),                          -- paciente
      ('pep_reconciliacoes', 'public.pode_editar_algum(''paciente'')'),                               -- paciente
      ('pep_sinais_vitais', 'public.pode_editar_algum(''paciente'')'),                                -- paciente
      ('pep_sumarios_alta', 'public.pode_editar_algum(''paciente'')'),                                -- paciente
      ('prot_ativacoes', 'public.pode_editar_algum(''protocolos'', ''ps'', ''paciente'')'),           -- protocolos, ps, paciente
      ('prot_bundle_itens', 'public.pode_editar_algum(''protocolos'', ''ps'', ''paciente'')'),        -- protocolos, ps, paciente
      ('ps_administracoes', 'public.pode_editar_algum(''ps'', ''paciente'', ''faturamento'')'),       -- ps, paciente, faturamento
      ('ps_atendimentos', 'public.pode_editar_algum(''ps'', ''atendimento'', ''ambulatorio'', ''paciente'')'), -- ps, atendimento, ambulatorio, paciente
      ('ps_prescricao_itens', 'public.pode_editar_algum(''ps'', ''paciente'', ''farmacia'')'),        -- ps, paciente, farmacia
      ('ps_registros', 'public.pode_editar_algum(''ps'', ''paciente'', ''farmacia'')'),               -- ps, paciente, farmacia
      ('ps_salas', 'public.pode_editar_algum(''ps'')'),                                               -- ps
      ('ps_sinais', 'public.pode_editar_algum(''ps'', ''paciente'')'),                                -- ps, paciente
      ('scih_casos', 'public.pode_editar_algum(''scih'', ''paciente'')'),                             -- scih, paciente
      ('scih_indicadores', 'public.pode_editar_algum(''scih'', ''overview'', ''print'')'),            -- scih, overview, print
      ('solicitacoes', 'public.pode_editar_algum(''ps'', ''leitos'')'),                               -- ps, leitos
      ('sup_cotacoes', 'public.pode_editar_algum(''suprimentos'')'),                                  -- suprimentos
      ('sup_fornecedores', 'public.pode_editar_algum(''suprimentos'', ''farmacia'')'),                -- suprimentos, farmacia
      ('sup_inventarios', 'public.pode_editar_algum(''suprimentos'')'),                               -- suprimentos
      ('sup_itens', 'public.pode_editar_algum(''suprimentos'', ''farmacia'')'),                       -- suprimentos, farmacia
      ('sup_lotes', 'public.pode_editar_algum(''suprimentos'')'),                                     -- suprimentos
      ('sup_movimentos', 'public.pode_editar_algum(''suprimentos'', ''farmacia'')'),                  -- suprimentos, farmacia
      ('sup_parametros', 'public.pode_editar_algum(''suprimentos'', ''farmacia'')'),                  -- suprimentos, farmacia
      ('sup_pedidos', 'public.pode_editar_algum(''suprimentos'')'),                                   -- suprimentos
      ('sup_requisicoes', 'public.pode_editar_algum(''suprimentos'')'),                               -- suprimentos
      ('usuarios_permissoes', 'public.pode_editar_algum(''users'') or user_id = auth.uid()')          -- users, @proprio
    ) as v(tabela, cond)
  loop
    if not exists (
      select 1 from information_schema.tables
       where table_schema = 'public' and table_name = t.tabela
    ) then
      pulou := pulou + 1;
      continue;
    end if;

    execute format('drop policy if exists %I on public.%I', t.tabela || '_mod_ins', t.tabela);
    execute format('drop policy if exists %I on public.%I', t.tabela || '_mod_upd', t.tabela);
    execute format('drop policy if exists %I on public.%I', t.tabela || '_mod_del', t.tabela);

    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (%s)',
                   t.tabela || '_mod_ins', t.tabela, t.cond);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (%s) with check (%s)',
                   t.tabela || '_mod_upd', t.tabela, t.cond, t.cond);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (%s)',
                   t.tabela || '_mod_del', t.tabela, t.cond);
    qtd := qtd + 1;
  end loop;

  raise notice 'escrita por modulo: % tabela(s); % ausente(s) no banco.', qtd, pulou;
end
$escrita$;


-- ════════════════════════════════════════════════════════════
-- PARTE 5/5 — CONFERÊNCIA
--
-- Uma consulta só, de propósito: o SQL Editor mostra o resultado da
-- ÚLTIMA consulta, então três selects separados esconderiam justamente os
-- dois primeiros, que são os que acusam problema. Os ❌ vêm no topo.
-- ════════════════════════════════════════════════════════════
with esperadas_abertas(tabela) as (values
  ('at_convenios'),
  ('at_dominios'),
  ('at_planos'),
  ('at_procedimentos'),
  ('cc_salas'),
  ('cid_referencia'),
  ('enf_escala_faixas'),
  ('enf_sae_catalogo'),
  ('farm_incompat_y'),
  ('farm_interacoes'),
  ('farm_medicamentos'),
  ('nsp_meta_faixas'),
  ('nsp_protocolos'),
  ('perfis_acesso'),
  ('perfis_permissoes'),
  ('profiles'),
  ('prot_catalogo'),
  ('prot_setor'),
  ('ps_faixas_obstetricas'),
  ('ps_faixas_pediatricas'),
  ('ps_protocolos'),
  ('scih_germes'),
  ('setores'),
  ('sigtap_procedimentos')
),
politicas as (
  select c.relname::text as tabela,
         pol.polname::text as politica,
         pol.polcmd as cmd,
         coalesce(pg_get_expr(pol.polqual, pol.polrelid), 'true') as condicao
    from pg_policy pol
    join pg_class c      on c.oid = pol.polrelid
    join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = 'public'
),
-- ❌ Leitura ainda aberta em tabela que o mapa NÃO autorizou. Zero linha
--    é o resultado certo.
aberta_indevida as (
  select 0 as ord, '❌ LEITURA AINDA ABERTA' as situacao, tabela as item,
         politica || ' — ' || condicao as detalhe
    from politicas
   where cmd in ('r', '*')
     and condicao in ('true', '(true)')
     and tabela not in (select tabela from esperadas_abertas)
),
-- ❌ Alguém sem perfil não lê mais NADA (falha fechada, de propósito).
--    Classifique essas pessoas em Usuários e Perfis.
sem_perfil as (
  select 1, '❌ USUARIO SEM PERFIL', coalesce(username, '(sem username)'),
         coalesce(nome, '') || ' · ' || coalesce(role, '')
    from public.profiles where perfil is null
),
-- ✅ O retrato final: quem lê cada tabela.
retrato as (
  select 2, case when condicao in ('true', '(true)')
                 then '✅ catalogo (todos)' else '✅ por modulo' end,
         tabela, condicao
    from politicas where cmd = 'r'
)
select situacao, item, detalhe from (
  select * from aberta_indevida
  union all select * from sem_perfil
  union all select * from retrato
) tudo
order by ord, situacao, item;


-- ════════════════════════════════════════════════════════════
-- VOLTAR ATRÁS
--
-- Se alguma tela essencial esvaziar em pleno plantão e não der tempo de
-- achar a causa, isto devolve a leitura como estava antes (aberta a
-- qualquer autenticado) sem tocar em dado nenhum:
--
--   do $$
--   declare t record;
--   begin
--     for t in select c.relname from pg_policy p
--                join pg_class c on c.oid = p.polrelid
--                join pg_namespace n on n.oid = c.relnamespace
--               where n.nspname = 'public' and p.polname = c.relname || '_leitura'
--     loop
--       execute format('drop policy %I on public.%I', t.relname || '_leitura', t.relname);
--       execute format('create policy %I on public.%I for select to authenticated using (true)',
--                      t.relname || '_leitura', t.relname);
--     end loop;
--   end $$;
--
-- Reabrir é o último recurso, não o primeiro: quase sempre o certo é
-- acrescentar o módulo que falta ao perfil da pessoa, na tela de Usuários.
-- ============================================================


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
-- Se algum usuário precisar voltar a ser administrador:
--   update public.profiles set role = 'adm_master' where username = 'SEU_USUARIO';
--
-- Quando tudo estiver conferido, a cópia de segurança pode sair:
--   drop schema _backup cascade;
